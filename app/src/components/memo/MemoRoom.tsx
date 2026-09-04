import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Portal } from "../Portal";
import { BrandGlyph } from "../brand";
import { TypeIcon } from "../workroom/TypeIcon";
import { finaleAttrs, useFinale, withFinale, FINALE_SWEEP_MS } from "../workroom/finale";
import { settleAttrs } from "../workroom/settle";
import { Words } from "../workroom/Words";
import { renderMemo, renderPlanFor, sectionsFrom, type MemoSection, type RenderPlan } from "../../memo/renderMemo";
import { applyMemoOverrides, memoDateFrom, usesFromChanges, MEMO_TYPE_FOR, type MemoOverrides } from "../../memo/overrides";
import { NARRATIVE_SPECS, narrativePrompt, narrativesFromReply, specFor, type NarrativeSpec } from "../../memo/narrative";
import { attestedCount, fullyAttested, type MemoDraft, type MemoSectionRecord } from "../../memo/store";
import { reviewerFor, withReviewShell } from "../../memo/reviewShell";
import {
  applyEditedSections,
  attestationFrom,
  bindReviewBridge,
  liftReview,
  type ReviewFrame,
  type ReviewFrameWindow,
} from "../../memo/reviewBridge";
import { NOT_WIRED_LINE, notWired } from "../../memo/publish";
import type { RoomPublication as MemoPublication } from "../../memo/publishAdapter";
import type { MemoAttestation, MemoChange, MemoDossier, MemoNarratives } from "../../memo/types";
import { fmtMoney } from "../../data/format";
import type { MemoGreeting } from "./memoGreeting";
import type { MemoRequestSource, MemoTrigger } from "./memoSession";
import "../../styles/workroom.css";
import "../../styles/memo.css";

/* =============================================================================
   THE CREDIT MEMO WORKROOM. THE THIRD ROOM ON THE SAME GLASS.

   TWO ROOMS BEFORE THIS ONE ESTABLISHED THE GRAMMAR and this one keeps it to
   the letter: one sheet of glass, a conversation on the left, the room's own
   work on the right, a session rather than a script, settled exchanges that
   collapse, word budgets per moment, and a cinematic finale. What changes is
   what stands in the right lane. The other two rooms put a MANIFEST there,
   because they are about to write to the org. This one puts the DOCUMENT there,
   because the memo IS the work: the banker reads it while they talk about it.

   THE PANE TAKES THE WHOLE RIGHT LANE (66/34 at desktop, founder 2026-09-04:
   "we do not need the approve / flag chips, we have that inline panel in there
   anyway; use that space and make the credit memo interface wider"). The room
   used to hang its own Approve / Flag rail off the frame's edge, which was a
   second set of controls for a decision the memo already offers under each
   section; the rail is gone, its 138px went to the document, and the room now
   LISTENS to the memo's own review shell (`memo/reviewBridge.ts`). Under
   1080px the pane stacks under the conversation rather than shrinking to a
   column neither surface can use.

   THE RENDERER IS INSTANT AND DETERMINISTIC. `renderMemo(dossier)` produces the
   whole document with no model in the room, from the bundle and the executed
   changes alone; the substitution seam then replaces the vendored renderer's
   demo literals. Everything the session brain adds is PROSE, section by
   section, streamed into the pane around figures it is forbidden to invent
   (`memo/narrative.ts`). That split is the room's honesty: a figure on the
   glass came from a system of record, always.

   DRAFT UNTIL ATTESTED. The memo carries the plugin's own classification banner
   from the first frame and the room never removes it. The per-section sign-off
   is the MEMO'S (the plugin's review shell, injected into the frame by
   `memo/reviewShell.ts`), and what the room adds is the count above the pane
   and the door under it, which stays shut, with its reason on it, until every
   section has been reviewed as drafted or reviewed after an edit.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   THE SEAM
   ----------------------------------------------------------------------------- */

export interface MemoContext {
  accountId: string;
  accountName: string;
  /** The package VERSION the memo is about. Null renders a memo that says so. */
  packageId: string | null;
  packageName?: string | null;
  trigger: MemoTrigger;
  /** `meta.user`. The relationship manager on the cover. */
  user?: string | null;
  /** `meta.generatedAt`. The room's only clock. */
  generatedAt: string;
  /** Where the request came from, where an instruction opened this session.
   *  Null is the common case: most memos are asked for by a banker. */
  source?: MemoRequestSource | null;
}

/** One call to the session brain. The room takes a function and asks nothing
 *  about what is on the other end of it, which is what lets the suite drive a
 *  scripted narrator and the cockpit drive the banker's own Claude. */
export type MemoNarrator = (args: {
  prompt: string;
  onText?: (text: string) => void;
  signal?: AbortSignal;
}) => Promise<string>;

export interface MemoDeps {
  narrate?: MemoNarrator;
  /** Phase D's writeback. Defaults to the honest stub in `memo/publish.ts`. */
  publish?: (draft: MemoDraft) => Promise<MemoPublication>;
  /** The store, injected so the round-trip is testable against a fake db. */
  save?: (draft: MemoDraft) => Promise<MemoDraft>;
  saveAttestations?: (draft: MemoDraft) => Promise<void>;
  /**
   * THE FRAME THE MEMO IS BEING READ IN, where the caller has one.
   *
   * jsdom never loads a `srcdoc` frame, so a test that had to reach through
   * `iframe.contentWindow` could not drive the memo's own review panel at all
   * and would be left asserting against a mock of it. This is the seam: hand
   * the room a document with the memo in it and a window the vendored shell
   * has run against, and the room reads the REAL shell's state.
   */
  frame?: ReviewFrame | null;
}

export interface MemoRoomProps {
  ctx: MemoContext;
  /** Built by the host from the bundle and the executed changes. */
  dossier: MemoDossier;
  /** The executed changes this memo is about. May be empty. */
  changes: readonly MemoChange[];
  greeting: MemoGreeting;
  /** The stored memo, where one exists, for "Open latest memo". */
  latest?: MemoDraft | null;
  deps?: MemoDeps;
  onClose: () => void;
}

/* -----------------------------------------------------------------------------
   THE THREAD
   ----------------------------------------------------------------------------- */

type Speaker = "agent" | "banker";

interface ThreadItem {
  id: string;
  who: Speaker;
  text: string;
  /** A settled exchange collapses to one line and stays mounted (rule 1). */
  settled?: boolean;
}

let seq = 0;
const nextId = (): string => `mm-${++seq}`;

/* -----------------------------------------------------------------------------
   WHICH SECTION A TYPED LINE IS ABOUT
   ----------------------------------------------------------------------------- */

/**
 * THE STEER, RESOLVED TO ONE MODULE.
 *
 * Deliberately coarse, and deliberately not a second parser: it matches the
 * banker's words against the module ids and the section titles the renderer
 * already stamped, and returns null when nothing matches. Null is answered with
 * a question rather than a guess, because guessing here rewrites the wrong
 * paragraph of a credit document.
 */
export function steerTarget(text: string, sections: readonly MemoSection[]): string | null {
  const line = text.toLowerCase();
  let best: { id: string; score: number } | null = null;
  for (const s of sections) {
    if (!specFor(s.id)) continue;
    const words = `${s.id.replace(/_/g, " ")} ${s.title}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    const score = words.filter((w) => line.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best?.id ?? null;
}

/* -----------------------------------------------------------------------------
   THE ROOM
   ----------------------------------------------------------------------------- */

/** How often the pane re-renders while prose is streaming into it. The whole
 *  memo is rebuilt on every re-render, so a per-token rebuild would spend the
 *  room's frame budget on a document nobody is reading yet. */
const STREAM_FRAME_MS = 400;

export function MemoRoom({ ctx, dossier, changes, greeting, latest, deps, onClose }: MemoRoomProps) {
  const narrate = deps?.narrate;
  const publish = deps?.publish ?? ((d) => Promise.resolve({ ...notWired(d.memoId, d.packageId), reason: NOT_WIRED_LINE }));

  /* ------------------------------------------------------------- the memo */

  /** The prose that has landed, keyed as the renderer reads it. */
  const [narratives, setNarratives] = useState<MemoNarratives>(() => ({}));
  /** Prose still arriving, for the module currently streaming. */
  const [streaming, setStreaming] = useState<MemoNarratives>(() => ({}));
  /** Per-section sign-off, lifted out of the memo's own review shell. */
  const [sectionState, setSectionState] = useState<Record<string, MemoSectionRecord>>({});
  /** Reading a stored memo rather than this session's draft. */
  const [readingStored, setReadingStored] = useState(false);

  /* THE MAP AND THE EDITS LIVE IN REFS, NOT IN STATE, and that is the whole
     reason the pane does not flicker. A `srcdoc` change RELOADS the frame:
     folding the sign-offs into the rendered html as state would reload the
     document on every approval, throwing away the reader's place and the
     shell's own edit in progress. So the map is read at the moment the memo is
     rebuilt for a reason of its own (a narrative landing, a steered section)
     and never causes that rebuild. `sectionState` carries the same facts for
     the count and the door, where a re-render is exactly what is wanted. */
  const attestation = useRef<MemoAttestation>({});
  const edits = useRef<Record<string, string>>({});

  const overrides: MemoOverrides = useMemo(
    () => ({
      rmName: ctx.user ?? null,
      // NO READ CARRIES A CREDIT OFFICER. The cover says so rather than
      // borrowing the demo's name (memo/overrides.ts).
      creditOfficer: null,
      memoDate: memoDateFrom(ctx.generatedAt),
      memoType: MEMO_TYPE_FOR[ctx.trigger] ?? MEMO_TYPE_FOR.adhoc,
      uses: usesFromChanges(changes, fmtMoney),
      guarantorRelation: guarantorRelationOf(dossier),
      proFormaFixedCharges: proFormaOf(dossier),
    }),
    [ctx.generatedAt, ctx.trigger, ctx.user, changes, dossier],
  );

  /** Who the badges name. The view's own user, on the room's only clock. */
  const reviewer = useMemo(
    () => reviewerFor(ctx.user, memoDateFrom(ctx.generatedAt), ctx.generatedAt),
    [ctx.user, ctx.generatedAt],
  );

  /** The dossier the pane is rendering: the room's own, with whatever prose has
   *  landed folded into it, and the sign-offs so far. Never mutated; the
   *  renderer sees a new object. */
  const liveDossier = useMemo<MemoDossier>(() => {
    const prose = { ...(dossier.canon.narratives ?? {}), ...narratives, ...streaming };
    // The map is read here, not depended on: see the refs above.
    return { ...dossier, canon: { ...dossier.canon, narratives: prose }, attestation: attestation.current };
  }, [dossier, narratives, streaming]);

  const rendered = useMemo(() => renderMemo(liveDossier), [liveDossier]);
  const html = useMemo(() => applyMemoOverrides(rendered.html, overrides), [rendered.html, overrides]);
  const plan: RenderPlan = useMemo(() => renderPlanFor(dossier), [dossier]);
  const sections = useMemo(() => sectionsFrom(html), [html]);

  /**
   * WHAT THE PANE SHOWS: this session's memo, or the stored one.
   *
   * Either way it goes in with the plugin's review shell around it and the
   * sign-offs replayed, so the checklist a banker is looking at survives a
   * narrative arrival, a steer, and coming back to a memo a week later.
   */
  const paneHtml = useMemo(() => {
    const source = readingStored && latest?.html ? latest.html : html;
    const map = readingStored && latest ? attestationFrom(latest.sections) : attestation.current;
    return withReviewShell(source, { reviewer, attestation: map, readOnly: readingStored });
  }, [html, readingStored, latest, reviewer]);

  const paneSections = useMemo(
    () => (readingStored && latest ? latest.sections : sections.map((s) => recordFor(s, sectionState))),
    [readingStored, latest, sections, sectionState],
  );

  const progress = attestedCount(paneSections);
  const attested = fullyAttested(paneSections);

  /* ---------------------------------------------------------- the thread */

  const [items, setItems] = useState<ThreadItem[]>(() => [
    { id: nextId(), who: "agent", text: greeting.lead },
    ...greeting.lines.map((line) => ({ id: nextId(), who: "agent" as Speaker, text: line })),
    /* WHERE THE REQUEST CAME FROM, in one line, when an instruction opened this
       session. A memo written off a client email should say so on its face: the
       credit officer reading it later is entitled to know what asked for it. */
    ...(sourceLine(ctx.source) ? [{ id: nextId(), who: "agent" as Speaker, text: sourceLine(ctx.source)! }] : []),
    { id: nextId(), who: "agent", text: greeting.ask },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [publication, setPublication] = useState<MemoPublication | null>(null);

  const say = useCallback((who: Speaker, text: string) => {
    setItems((prev) => [
      // EVERY EXCHANGE BEFORE THE LIVE ONE SETTLES (the rooms' own rule 1).
      // Mounted, collapsed to one line, one class from coming back.
      ...prev.map((i) => ({ ...i, settled: true })),
      { id: nextId(), who, text },
    ]);
  }, []);

  /* -------------------------------------------------------- the narration */

  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  /** Ask for one module's prose and stream it into the pane. */
  const writeSection = useCallback(
    async (spec: NarrativeSpec, title: string, steer?: string | null) => {
      if (!narrate) return;
      const controller = new AbortController();
      abort.current = controller;
      let last = 0;
      const prompt = narrativePrompt({ spec, dossier, sectionTitle: title, steer, written: narratives });
      try {
        const reply = await narrate({
          prompt,
          signal: controller.signal,
          onText: (text) => {
            const now = Date.now();
            if (now - last < STREAM_FRAME_MS) return;
            last = now;
            setStreaming(narrativesFromReply(spec, text));
          },
        });
        setStreaming({});
        setNarratives((prev) => ({ ...prev, ...narrativesFromReply(spec, reply) }));
        // ONE SHORT LINE PER ARRIVAL. The word budget for this moment is the
        // lead line and nothing else: the section itself is on the glass.
        say("agent", `${title} written.`);
      } catch {
        setStreaming({});
        // A SECTION THE DESK DID NOT ANSWER KEEPS THE MEMO'S OWN PLACEHOLDER.
        // Degrade parity: the memo says the section is pending, which is true.
        say("agent", `${title} is still pending; the memo says so where it sits.`);
      }
    },
    [narrate, dossier, narratives, say],
  );

  /* ------------------------------------------------------------ the store */

  const buildDraft = useCallback(
    (): MemoDraft => ({
      memoId: `memo-${ctx.packageId ?? ctx.accountId}-${ctx.generatedAt}`,
      accountId: ctx.accountId,
      packageId: ctx.packageId ?? ctx.accountId,
      trigger: ctx.trigger,
      generatedAt: ctx.generatedAt,
      generator: "cockpit",
      renderPlan: plan,
      sections: sections.map((s) => recordFor(s, sectionState)),
      narratives,
      /* THE BANKER'S WORDS OUTRANK THE RENDERER'S. Where a section was edited
         in the frame, what is stored is the section as the banker left it. */
      html: applyEditedSections(html, edits.current),
      htmlStored: true,
    }),
    [ctx, plan, sections, sectionState, narratives, html],
  );

  const saveAttest = deps?.saveAttestations;
  const save = deps?.save;
  const latestDraft = useRef(buildDraft);
  latestDraft.current = buildDraft;
  useEffect(() => {
    if (!saveAttest || !Object.keys(sectionState).length) return;
    /* THE BUILDER IS READ THROUGH A REF ON PURPOSE. The write is triggered by an
       ATTESTATION and by nothing else; depending on the builder itself would
       fire it on every render the memo changes, which is every token of prose. */
    void saveAttest(latestDraft.current());
  }, [sectionState, saveAttest]);

  /** Draft every narrative section the render plan switched on, in order. */
  const runDraft = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setReadingStored(false);
    const planned = new Set(plan.modules.map((m) => m.id));
    const work = NARRATIVE_SPECS.filter((s) => planned.has(s.module));
    if (!narrate) {
      // NO DESK IN THIS VIEW. The memo is already whole and deterministic; only
      // the prose is missing, and the room says which half it is short of.
      say("agent", "The desk is not connected, so the memo stands on its figures and the narrative slots stay pending.");
      setDrafted(true);
      setBusy(false);
      return;
    }
    say("agent", `Drafting ${work.length} narrative section${work.length === 1 ? "" : "s"} into the pane.`);
    for (const spec of work) {
      const title = sections.find((s) => s.id === spec.module)?.title ?? spec.module.replace(/_/g, " ");
      await writeSection(spec, title);
    }
    setDrafted(true);
    setBusy(false);
    /* THE DRAFT OUTLIVES THE VIEW. A memo that were only stored on publication
       would leave "Open latest memo" with nothing to open for every memo a
       banker started and came back to. */
    if (save) void save(latestDraft.current());
  }, [busy, plan, narrate, sections, writeSection, say, save]);

  /* ------------------------------------------------------- the attestation */

  /** The sections the pane is showing, for the lift. A ref so the bridge is
   *  bound once per document rather than once per token of prose. */
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  /**
   * THE MEMO SAID SOMETHING; THE ROOM HEARD IT.
   *
   * Called once when the frame is bound and again after every approve, edit,
   * undo and review-all inside it. Everything the room knows about the
   * sign-off enters here and nowhere else.
   */
  const lift = useCallback((frame: ReviewFrame) => {
    const read = liftReview(frame, sectionsRef.current);
    attestation.current = read.attestation;
    edits.current = { ...edits.current, ...read.edits };
    setSectionState((prev) => (sameRecords(prev, read.records) ? prev : read.records));
  }, []);

  /* WRITING THE ATTESTATION BACK IS BOOKKEEPING, NEVER A GATE. The glass has
     already recorded it; a store that refused the write leaves the room exactly
     as it is (memo/store.ts). */

  /* --------------------------------------------------------- the composer */

  const send = useCallback(
    async (text: string) => {
      const line = text.trim();
      if (!line || busy) return;
      setDraft("");
      say("banker", line);
      const target = steerTarget(line, sections);
      if (!target) {
        say(
          "agent",
          "Name the section and I will write that one again. Everything else in the memo is figures, and those come from the systems of record.",
        );
        return;
      }
      const spec = specFor(target);
      const title = sections.find((s) => s.id === target)?.title ?? target;
      if (!spec) return;
      setBusy(true);
      setReadingStored(false);
      say("agent", `Rewriting ${title}.`);
      await writeSection(spec, title, line);
      setBusy(false);
    },
    [busy, sections, say, writeSection],
  );

  /* ----------------------------------------------------------- the finale */

  const reduced = usePrefersReducedMotion();
  const finale = useFinale(reduced);
  const finaleState = finale.state;
  const [published, setPublished] = useState(false);

  const onPublish = useCallback(async () => {
    if (!attested || busy) return;
    setBusy(true);
    const result = await publish(buildDraft());
    setPublication(result);
    if (save) await save(buildDraft());
    if (result.status !== "published") say("agent", result.reason ?? NOT_WIRED_LINE);
    setPublished(true);
    setBusy(false);
  }, [attested, busy, publish, buildDraft, save, say]);

  useEffect(() => {
    if (!published) return;
    finale.begin(items.map((i) => i.id));
  }, [published, finale, items]);

  /* ------------------------------------------------------------- the pane */

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useKeepScroll(frameRef, paneHtml);
  /* A STORED MEMO IS NOT BOUND. Its sign-offs belong to the session that took
     them, and lifting them would fold another memo's map into this one's. */
  useReviewBridge(frameRef, paneHtml, deps?.frame ?? null, lift, !readingStored);

  const publishReason = !attested
    ? `${progress.total - progress.done} section${progress.total - progress.done === 1 ? "" : "s"} still to attest`
    : null;

  return (
    <Portal>
      <div className="wk-root">
        <div className="wk-scrim" onClick={onClose} role="presentation" />
        <div
          className="wk-room mm-room eg-glass eg-glass-workroom"
          data-finale={finaleState === "off" ? undefined : finaleState}
          role="dialog"
          aria-modal="true"
          aria-label="Credit memo"
        >
          <div className="wk-glass-sheet" aria-hidden="true" />
          <header className="wk-head">
            <BrandGlyph />
            <span className="wk-title">Credit memo</span>
            <span className="wk-pkgline" data-pkgline={ctx.packageId ?? "none"}>
              <span className="wk-pkgline-k">Package</span>
              <span className="wk-pkgline-v">{ctx.packageName ?? ctx.packageId ?? "not anchored"}</span>
            </span>
            <span className="wk-spacer" />
            <button type="button" className="wk-icobtn" onClick={onClose} aria-label="Close the workroom">
              ×
            </button>
          </header>

          <div className="wk-body mm-body">
            <div className="wk-col-l mm-col-l">
              <section className="wk-thread" data-finale={finaleState === "still" ? "still" : undefined}>
                {/* THE SAME EXCHANGE THE OTHER TWO ROOMS RENDER (founder,
                    2026-09-04: the memo room's conversation was bare text).
                    `settleAttrs` for the wrapper, `.wk-msg.wk-agent` /
                    `.wk-msg.wk-banker` for the side and the identity chip that
                    hangs above it on hover, `.wk-bub` for the bubble, and
                    `<Words>` for the word-by-word speech. Not one class of its
                    own: three rooms, one grammar. */}
                {items.map((item, i) => {
                  const inWave = finaleState === "off" ? null : finaleAttrs(i, finaleState);
                  const attrs = settleAttrs("on");
                  return (
                    <div
                      key={item.id}
                      data-ex-id={item.id}
                      {...withFinale(
                        { ...attrs, className: `${attrs.className}${item.settled ? " mm-settled" : ""}` },
                        inWave,
                      )}
                    >
                      <div className="wk-ex-in">
                        <div className={`wk-msg wk-${item.who}`} data-who={item.who === "banker" ? "You" : "Agent"}>
                          <div className="wk-bub">
                            {item.who === "agent" ? <Words text={item.text} /> : item.text}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* THE CHIPS THE GREETING OFFERED. They retire the moment the
                    memo has been drafted: a chip that repeats work already on
                    the glass is the fourth chip the rooms' rule 30 bans. */}
                {!drafted && !published && (
                  <div className="wk-opts mm-chips">
                    {greeting.chips.map((chip) => (
                      <button
                        type="button"
                        className="wk-opt mm-chip"
                        key={chip.id}
                        data-chip={chip.id}
                        disabled={busy || (chip.id === "open" && !latest)}
                        onClick={() => {
                          if (chip.id === "draft") {
                            say("banker", "Draft it.");
                            void runDraft();
                            return;
                          }
                          if (chip.id === "steer") {
                            say("banker", "Steer me first.");
                            say("agent", "Name the section and say what should change in it.");
                            return;
                          }
                          setReadingStored(true);
                          say("banker", "Open the latest memo.");
                          say("agent", "The stored memo is in the pane, read only, with the attestations it was saved with.");
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* THE AFTERGLOW. One door and one quiet line, under the card,
                    exactly as the other two rooms end. */}
                {finaleState === "still" && (
                  <div className="wk-afterglow" data-finale="afterglow">
                    <button type="button" className="wk-ag-close" onClick={onClose}>
                      Close workroom
                    </button>
                    <span className="wk-ag-note">
                      {publication?.status === "published"
                        ? "The memo is in nCino and the package is with the approver."
                        : NOT_WIRED_LINE}
                    </span>
                  </div>
                )}
              </section>

              <div className="wk-composer eg-pill" hidden={published}>
                <input
                  className="wk-txt"
                  value={draft}
                  disabled={busy || published}
                  placeholder={busy ? "Writing…" : "Name a section and say what should change in it."}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    void send(draft);
                  }}
                  aria-label="Steer the memo"
                />
                <button type="button" className="wk-send" aria-label="Send" onClick={() => void send(draft)}>
                  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
                    <path
                      d="M1.6 7h9.4M7.2 3.2L11 7l-3.8 3.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* ======================= THE READING PANE, where the rail sits */}
            <aside
              className="mm-pane"
              aria-label="The credit memo"
              data-finale={finaleState === "off" ? undefined : finaleState}
            >
              <div className="mm-pane-h">
                {/* ONE QUIET LINE, FROM THE SHELL'S OWN COUNTS. The decision
                    is under each section, in the memo; this is the room saying
                    how far the work has got. */}
                <span className="mm-prog" data-progress={`${progress.done}/${progress.total}`}>
                  {progress.done} of {progress.total} sections reviewed
                </span>
                <span className="mm-plan">{planSentence(plan)}</span>
              </div>
              {plan.suppressed.length > 0 && (
                /* SUPPRESSED IS NOT A GAP (references/conditionality.md). One
                   quiet line, opened only by a reader who wants the reasons. */
                <details className="mm-supp">
                  <summary>{plan.suppressed.length} suppressed by the deal's flags</summary>
                  <ul>
                    {plan.suppressed.map((entry) => (
                      <li key={entry.id}>
                        <b>{entry.name}</b>
                        <span>{entry.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="mm-frame">
                <iframe
                  ref={frameRef}
                  className="mm-doc"
                  title="Credit memo"
                  /* SAME ORIGIN, ON PURPOSE. The memo's own stylesheet has to
                     apply and the room has to be able to read the review
                     shell's state out of the frame; a sandboxed frame would
                     give it neither. What executes in there is the plugin's
                     own: the section controls, the progress pill, and the
                     review shell this room listens to. */
                  srcDoc={paneHtml}
                />
              </div>

              <div className="mm-foot">
                {/* THE BUTTON ARRIVES WHEN THE WORK IS DONE (founder, 2026-09-04:
                    like Review and execute, it appears rather than sits greyed).
                    Until then the foot carries one quiet line of where the
                    attestation stands. */}
                {attested && !published ? (
                  <button
                    type="button"
                    className="mm-publish"
                    disabled={busy}
                    onClick={() => void onPublish()}
                  >
                    Publish to nCino and submit for approval
                  </button>
                ) : (
                  publishReason && !published && <span className="mm-why">{publishReason}</span>
                )}
              </div>
            </aside>
          </div>

          {/* THE CARD THE PANE EXHALES INTO. It is mounted from the moment the
              publish resolves, and it ascends into the space the drain made. */}
          {published && (
            <div
              className="mm-final"
              style={{ "--wk-fin-hold": `${finale.hold}ms`, "--wk-fin-sweep": `${FINALE_SWEEP_MS}ms` } as CSSProperties}
            >
              <div className="wk-rescard mm-card">
                <span className="aura" aria-hidden="true" />
                <div className="rc-h">
                  <TypeIcon kind="package" />
                  <b>Credit memo attested</b>
                </div>
                <div className="rc-line" />
                <div className="rc-r">
                  <TypeIcon kind="commit" />
                  <span>Sections</span>
                  <b>{progress.total}</b>
                </div>
                <div className="rc-r">
                  <TypeIcon kind="package" />
                  <span>Version</span>
                  <b>{ctx.packageId ?? "not anchored"}</b>
                </div>
                {publication?.nforms?.templateId && (
                  <div className="rc-r">
                    <TypeIcon kind="package" />
                    <span>nFORMS memo</span>
                    <b>{publication.nforms.templateId}</b>
                  </div>
                )}
                <div className="rc-line" />
                <div className="rc-f">
                  <span className={publication?.status === "published" && !publication.simulated ? "ok" : ""}>
                    {publication?.status === "published" && !publication.simulated ? "✓" : "·"}
                  </span>
                  {/* "SUBMITTED" ONLY WHEN THE ORG SAW IT. A fixture answer or a
                      failed lane reads as its own sentence, never as a publication. */}
                  {publication?.status === "published" && !publication.simulated
                    ? `Submitted for approval${publication.approval?.queue ? ` to ${publication.approval.queue}` : ""}.`
                    : (publication?.reason ?? NOT_WIRED_LINE)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

/* -----------------------------------------------------------------------------
   SMALL THINGS THE ROOM NEEDS
   ----------------------------------------------------------------------------- */

/** What asked for this memo, in one line, or nothing at all. */
function sourceLine(source: MemoRequestSource | null | undefined): string | null {
  if (!source) return null;
  const what = source.subject ? `"${source.subject}"` : null;
  const who = source.from ? ` from ${source.from}` : "";
  return `This one was asked for by ${source.kind}${who}${what ? `: ${what}` : ""}.`;
}

/** A section's record, from the sign-off state or as it stands: draft. */
function recordFor(section: MemoSection, state: Record<string, MemoSectionRecord>): MemoSectionRecord {
  return state[section.id] ?? { id: section.id, title: section.title, status: "draft" };
}

/** TRUE where a lift said nothing new. The bridge reads the shell on every
 *  bind as well as on every change, so most reads say exactly what the room
 *  already knew; setting state on those would re-render the room for nothing. */
function sameRecords(a: Record<string, MemoSectionRecord>, b: Record<string, MemoSectionRecord>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return !!y && x.status === y.status && x.note === y.note && x.by === y.by && x.at === y.at;
  });
}

/** The render plan, in the one line above the pane. */
function planSentence(plan: RenderPlan): string {
  return `${plan.modules.length} module${plan.modules.length === 1 ? "" : "s"} on`;
}

/**
 * THE GUARANTOR'S RELATIONSHIP TO THE BORROWER, from the graph.
 *
 * The dossier already carries the guarantor the graph named; what the memo's
 * relationship row wants is the ROLE and the ownership behind it. Absent means
 * absent: the substitution seam writes the marker rather than the demo's line.
 */
function guarantorRelationOf(dossier: MemoDossier): string | null {
  const g = dossier.canon.guarantor;
  if (!g) return null;
  const parts = [g.type === "individual" ? "Individual guarantor" : "Entity guarantor"];
  if (g.guarantyType && !g.guarantyType.startsWith("[")) parts.push(g.guarantyType);
  return parts.join(", ");
}

/**
 * THE PRO FORMA FIXED-CHARGE CELL.
 *
 * The demo printed "~$2.5M". What the cockpit can stand behind is the INTEREST
 * component implied by the ratios (EBITDA over interest coverage); scheduled
 * principal is on no read this page has. So the figure is stated for what it
 * is, and where the ratios do not carry both parts the seam writes the marker.
 */
function proFormaOf(dossier: MemoDossier): string | null {
  const r = dossier.canon.ratios;
  if (!r || r.ebitda == null || !r.interestCoverage) return null;
  const interest = r.ebitda / r.interestCoverage;
  if (!Number.isFinite(interest) || interest <= 0) return null;
  return `${fmtMoney(interest)} interest; scheduled principal not carried`;
}

/** The room's reduced-motion reading. jsdom has no matchMedia, which is why
 *  every render test sees the finale land in one commit (finale.ts). */
function usePrefersReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
}

/**
 * LISTEN TO THE MEMO'S OWN REVIEW SHELL.
 *
 * The frame is same-origin (srcdoc), so this is a read of its own window and
 * never a message across a boundary. It is re-bound on every new document,
 * because a `srcdoc` change is a new window with a new shell in it.
 *
 * `injected` is the seam. Where the caller hands the room a frame, that frame
 * IS the frame: it is how the suite drives the vendored shell's own buttons in
 * jsdom, which never loads a srcdoc document at all.
 */
function useReviewBridge(
  frame: React.RefObject<HTMLIFrameElement | null>,
  html: string,
  injected: ReviewFrame | null,
  onChange: (frame: ReviewFrame) => void,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    if (injected) return bindReviewBridge(injected, onChange);

    const el = frame.current;
    if (!el) return;
    let unbind: (() => void) | null = null;

    const bind = () => {
      unbind?.();
      unbind = null;
      const doc = el.contentDocument;
      const win = el.contentWindow as unknown as ReviewFrameWindow | null;
      // A frame that has not laid its document down yet is not an error: the
      // `load` below is the same call again, a moment later.
      if (!doc || !win) return;
      unbind = bindReviewBridge({ doc, win }, onChange);
    };

    bind();
    el.addEventListener("load", bind);
    return () => {
      el.removeEventListener("load", bind);
      unbind?.();
    };
  }, [frame, html, injected, onChange, active]);
}

/**
 * THE READER DOES NOT LOSE THEIR PLACE WHEN A SECTION LANDS.
 *
 * Filling one narrative slot re-renders the WHOLE memo, and a `srcdoc` change
 * reloads the frame, which puts a credit officer reading the covenant table
 * back on the cover page. So the scroll offset is captured before every change
 * and put back the moment the new document has laid out. It is the same
 * discipline the thread follows: the room re-renders, the reader does not move.
 */
function useKeepScroll(frame: React.RefObject<HTMLIFrameElement | null>, html: string): void {
  const at = useRef(0);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const doc = el.contentDocument;
    const scroller = doc?.scrollingElement ?? doc?.documentElement ?? null;
    // Remember where the reader was BEFORE this html replaces the document.
    const remember = () => {
      if (scroller) at.current = scroller.scrollTop;
    };
    doc?.addEventListener("scroll", remember, { passive: true });

    const restore = () => {
      const next = el.contentDocument?.scrollingElement ?? el.contentDocument?.documentElement ?? null;
      if (next && at.current) next.scrollTop = at.current;
    };
    el.addEventListener("load", restore);
    restore();

    return () => {
      remember();
      doc?.removeEventListener("scroll", remember);
      el.removeEventListener("load", restore);
    };
  }, [frame, html]);
}
