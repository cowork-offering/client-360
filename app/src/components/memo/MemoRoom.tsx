import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Portal } from "../Portal";
import { BrandGlyph } from "../brand";
import { TypeIcon } from "../workroom/TypeIcon";
import { finaleAttrs, useFinale, withFinale, FINALE_SWEEP_MS } from "../workroom/finale";
import { renderMemo, renderPlanFor, sectionsFrom, type MemoSection, type RenderPlan } from "../../memo/renderMemo";
import { applyMemoOverrides, memoDateFrom, usesFromChanges, MEMO_TYPE_FOR, type MemoOverrides } from "../../memo/overrides";
import { NARRATIVE_SPECS, narrativePrompt, narrativesFromReply, specFor, type NarrativeSpec } from "../../memo/narrative";
import { attestedCount, fullyAttested, type MemoDraft, type MemoSectionRecord } from "../../memo/store";
import { NOT_WIRED_LINE, notWired } from "../../memo/publish";
import type { RoomPublication as MemoPublication } from "../../memo/publishAdapter";
import type { MemoChange, MemoDossier, MemoNarratives } from "../../memo/types";
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

   THE PANE IS WIDER THAN THE RAIL WAS, and deliberately so (58/42 at desktop).
   A credit memo is a page of tables and a manifest is a list of chips; the same
   252px lane would have made the room's own product unreadable. Under 1080px
   the pane stacks under the conversation rather than shrinking to a column
   neither surface can use.

   THE RENDERER IS INSTANT AND DETERMINISTIC. `renderMemo(dossier)` produces the
   whole document with no model in the room, from the bundle and the executed
   changes alone; the substitution seam then replaces the vendored renderer's
   demo literals. Everything the session brain adds is PROSE, section by
   section, streamed into the pane around figures it is forbidden to invent
   (`memo/narrative.ts`). That split is the room's honesty: a figure on the
   glass came from a system of record, always.

   DRAFT UNTIL ATTESTED. The memo carries the plugin's own classification banner
   from the first frame and the room never removes it. What the room adds is the
   per-section sign-off and the count above the pane, and the publish door stays
   shut, with its reason on it, until every section is approved.
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
  /** Per-section sign-off. */
  const [sectionState, setSectionState] = useState<Record<string, MemoSectionRecord>>({});
  /** The banker is writing a note on a flag. */
  const [flagging, setFlagging] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /** Reading a stored memo rather than this session's draft. */
  const [readingStored, setReadingStored] = useState(false);

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

  /** The dossier the pane is rendering: the room's own, with whatever prose has
   *  landed folded into it. Never mutated; the renderer sees a new object. */
  const liveDossier = useMemo<MemoDossier>(() => {
    const prose = { ...(dossier.canon.narratives ?? {}), ...narratives, ...streaming };
    return { ...dossier, canon: { ...dossier.canon, narratives: prose } };
  }, [dossier, narratives, streaming]);

  const rendered = useMemo(() => renderMemo(liveDossier), [liveDossier]);
  const html = useMemo(() => applyMemoOverrides(rendered.html, overrides), [rendered.html, overrides]);
  const plan: RenderPlan = useMemo(() => renderPlanFor(dossier), [dossier]);
  const sections = useMemo(() => sectionsFrom(html), [html]);

  /** What the pane shows: this session's memo, or the stored one, read-only. */
  const paneHtml = readingStored && latest?.html ? latest.html : html;
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
      html,
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

  const attest = useCallback(
    (id: string, decision: "approved" | "flagged", text?: string) => {
      const section = sections.find((s) => s.id === id);
      if (!section) return;
      setSectionState((prev) => ({
        ...prev,
        [id]: {
          id,
          title: section.title,
          status: decision,
          note: text?.trim() || undefined,
          by: ctx.user ?? undefined,
          at: ctx.generatedAt,
        },
      }));
      setFlagging(null);
      setNote("");
    },
    [sections, ctx.user, ctx.generatedAt],
  );

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
  const offsets = useSectionOffsets(frameRef, paneHtml, paneSections.length);

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
                {items.map((item, i) => {
                  const inWave = finaleState === "off" ? null : finaleAttrs(i, finaleState);
                  return (
                    <div
                      key={item.id}
                      data-ex-id={item.id}
                      {...withFinale({ className: `mm-ex ${item.settled ? "mm-settled" : ""}`.trim() }, inWave)}
                    >
                      <div className={`wk-msg ${item.who === "banker" ? "wk-you" : ""}`}>
                        <span className="wk-bub">{item.text}</span>
                      </div>
                    </div>
                  );
                })}

                {/* THE CHIPS THE GREETING OFFERED. They retire the moment the
                    memo has been drafted: a chip that repeats work already on
                    the glass is the fourth chip the rooms' rule 30 bans. */}
                {!drafted && !published && (
                  <div className="mm-chips">
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
                <span className="mm-prog" data-progress={`${progress.done}/${progress.total}`}>
                  {progress.done} of {progress.total} sections attested
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
                     apply and the room has to be able to measure its section
                     anchors; a sandboxed frame would give it neither. Nothing
                     in the document is executable: the renderer emits tables
                     and inline styles, and the shell's own scripts are the
                     plugin's section controls. */
                  srcDoc={paneHtml}
                />
                <div className="mm-edge" aria-label="Attestation">
                  {paneSections.map((section, i) => {
                    const top = offsets[section.id];
                    const state = section.status;
                    return (
                      <div
                        className={`mm-ctl mm-${state}`}
                        key={section.id}
                        data-section={section.id}
                        style={top != null ? ({ position: "absolute", top: `${top}px` } as CSSProperties) : undefined}
                      >
                        <span className="mm-ctl-n">{section.title}</span>
                        {readingStored ? (
                          <span className="mm-ctl-s">{state}</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="mm-ok"
                              aria-label={`Approve ${section.title}`}
                              onClick={() => attest(section.id, "approved")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="mm-flag"
                              aria-label={`Flag ${section.title}`}
                              onClick={() => setFlagging(section.id)}
                            >
                              Flag
                            </button>
                          </>
                        )}
                        {flagging === section.id && (
                          <div className="mm-note">
                            <input
                              className="mm-note-i"
                              value={note}
                              autoFocus
                              placeholder="What is wrong with it?"
                              aria-label={`Note on ${section.title}`}
                              onChange={(e) => setNote(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                attest(section.id, "flagged", note);
                              }}
                            />
                            <button type="button" className="mm-note-b" onClick={() => attest(section.id, "flagged", note)}>
                              Flag it
                            </button>
                          </div>
                        )}
                        <i className="mm-dot" aria-hidden="true" data-at={i} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mm-foot">
                <button
                  type="button"
                  className="mm-publish"
                  disabled={!attested || busy || published}
                  title={publishReason ?? undefined}
                  onClick={() => void onPublish()}
                >
                  Publish to nCino and submit for approval
                </button>
                {publishReason && <span className="mm-why">{publishReason}</span>}
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
 * WHERE EACH SECTION SITS INSIDE THE FRAME.
 *
 * The edge controls are ALIGNED TO THE SECTION ANCHORS, which means measuring
 * the document the renderer produced: `sectionsFrom()` gives the ids, and the
 * frame gives each id an offset. The frame is same-origin (srcdoc), so this is
 * a read of its own DOM and never a message across a boundary.
 *
 * AN UNMEASURED PANE IS NOT A BROKEN ONE. jsdom does not load a srcdoc frame,
 * and a browser has not laid one out on the first commit either; both come back
 * empty and the controls fall into natural document order down the edge, which
 * is a usable rail and not a pile at the top.
 */
function useSectionOffsets(
  frame: React.RefObject<HTMLIFrameElement | null>,
  html: string,
  count: number,
): Record<string, number> {
  const [offsets, setOffsets] = useState<Record<string, number>>({});

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let alive = true;

    const measure = () => {
      if (!alive) return;
      const doc = el.contentDocument;
      if (!doc) return;
      const nodes = doc.querySelectorAll<HTMLElement>("section[data-mod]");
      if (!nodes.length) return;
      const scrolled = doc.documentElement?.scrollTop ?? doc.body?.scrollTop ?? 0;
      const next: Record<string, number> = {};
      nodes.forEach((node) => {
        const id = node.getAttribute("data-mod");
        if (id) next[id] = Math.max(0, node.offsetTop - scrolled);
      });
      setOffsets(next);
    };

    measure();
    el.addEventListener("load", measure);
    const doc = el.contentDocument;
    doc?.addEventListener("scroll", measure, { passive: true });
    return () => {
      alive = false;
      el.removeEventListener("load", measure);
      doc?.removeEventListener("scroll", measure);
    };
  }, [frame, html, count]);

  return offsets;
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
