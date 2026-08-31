import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Portal } from "../Portal";
import { isTopmost, pushModal } from "../modalStack";
import { prefersReducedMotion } from "../../data/motion";
import { CLIENT_EMAIL, GOVERNANCE, HAVE } from "../../workroom/fixture";
import { readableError, type PackageChoice, type WorkroomEngine, type WorkroomSuggestion } from "../../workroom/engine";
import { addEntry, addressManifest, figuresFor, groupEntries, removeEntry } from "../../workroom/manifest";
import { vocabularyFor } from "../../workroom/modes";
import { stepperState } from "../../workroom/stepper";
import { EMPTY_FIT, fitThread, foldLabel, type FitBlock, type FitState } from "../../workroom/thread";
import type {
  DraftedReply,
  HaveRow,
  PackageMember,
  WorkroomAdvisory,
  WorkroomChallenge,
  WorkroomContext,
  WorkroomDelta,
  WorkroomExecution,
  WorkroomRefusal,
} from "../../workroom/types";
import type { SourceChip } from "../../workroom/scripts";
import { BrandGlyph, BrandLockup } from "../brand";
import { Peek, usePeek } from "./Peek";
import { measureWith, readMetrics, realOverflow, type FitCache } from "./threadFit";
import "../../styles/workroom.css";

/* =============================================================================
   THE WORKROOM.

   ONE shell, THREE modes. Everything mode-specific arrives through the engine
   (what the room read, what a line becomes, what a plan files) and the mode
   vocabulary (what the room calls things). Nothing in this file knows what a
   modification is, which is why renew and create are the same room.

   THE EIGHT LAWS, and where each one lives:
     1. Package altitude       — ZONE 1 is the package; loans are chips.
     2. One decision per view  — the thread offers one gate at a time.
     3. <60 words on open      — the entry scene is a pin, one sentence, chips.
     4. One viewport, no page scroll — the room is a fixed overlay, body locked.
     5. No inline scrolling    — every disclosure is a <Peek>; the thread folds.
     6. Chat is the protagonist— .wk-col-l takes the room, the rail is 430px.
     7. The ">" is the motif   — <BrandGlyph>, typographic, everywhere.
     8. Manifest empty at start— entries[] starts empty and arrivals are staged.
   ============================================================================= */

/* ------------------------------------------------------------ thread model */

type ChipState = "open" | "confirmed" | "discarded";

interface ChipModel {
  key: string;
  delta?: WorkroomDelta;
  refusal?: WorkroomRefusal;
  state: ChipState;
}

type ThreadItem =
  | { kind: "banker"; id: string; text: string }
  | { kind: "agent"; id: string; text: string; options?: Array<{ label: string; say: string }> }
  /** THE ADVICE TRAVELS WITH THE CHIPS IT IS ABOUT. It is not a block of its
   *  own: an advisory that could fold away while the change it warns about
   *  stayed on screen would be worse than no advisory. */
  | { kind: "chips"; id: string; chips: ChipModel[]; advisories?: WorkroomAdvisory[] }
  | { kind: "challenge"; id: string; challenge: WorkroomChallenge; acked: boolean }
  | { kind: "reply"; id: string; reply: DraftedReply };

/**
 * THE COMPOSED BEAT.
 *
 * An answer that snaps in the same frame as the question reads as a lookup; one
 * that arrives after a held beat of the brand glyph reads as a room composing an
 * answer. It is the deck-studio rhythm and it uses the deck-studio vocabulary:
 * ONE motion per event, the ">" filling with ink (tokens.css `c360-beat`), and
 * `--beat`'s own 460ms as the floor so nothing here invents a second tempo.
 *
 * A FLOOR, NOT A DELAY. The room waits for the slower of the engine and the
 * beat, so a wired parse that takes two seconds is not made to take two and a
 * half. Under reduced motion the floor is zero and the answer is simply there.
 */
const COMPOSE_FLOOR_MS = 460;

/** How much room has to open up before the rail relaxes a fold. Wider than one
 *  step, so tightening and relaxing cannot chase each other. */
const RAIL_SLACK = 48;

/** The rail is 430px open. Anything narrower than this is a pane still arriving. */
const RAIL_MIN_WIDTH = 300;

/** How much room the thread has to gain before a backstop fold comes back.
 *  Wider than one turn's worth of slack, so folding and unfolding cannot chase
 *  each other across renders. */
const FIT_RELAX = 90;

function sameFit(a: FitState, b: FitState): boolean {
  return a.folded.join("|") === b.folded.join("|") && JSON.stringify(a.clamped) === JSON.stringify(b.clamped);
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/** The pass reasons over the ITEM LIST, not over the tree, because a folded
 *  turn is not in the tree. Only prose can clamp: a challenge's verdict and its
 *  acknowledge button are a live gate and are never shortened. */
function toFitBlock(item: ThreadItem): FitBlock {
  return {
    id: item.id,
    live: isLive(item),
    clampable: item.kind === "banker" || item.kind === "agent" ? [item.id] : [],
  };
}

/** A block is LIVE while something in it is still waiting on the banker. The
 *  fit pass may never fold a live block away (law 5's second rule). */
function isLive(item: ThreadItem): boolean {
  if (item.kind === "chips") return item.chips.some((c) => c.state === "open");
  if (item.kind === "challenge") return !item.acked;
  if (item.kind === "reply") return true;
  return false;
}

/* ------------------------------------------------------- typed acknowledgment

   A CHECK IS SETTLED BY THE DECISION, NOT BY THE GESTURE. The Acknowledge
   button and the word "acknowledged" are the same decision, and a room that
   answered the typed one with "one decision at a time" was refusing the very
   decision it had just asked for. Only CHECKS settle this way: a confirm or a
   discard is the banker choosing what goes on the manifest, and no word in a
   sentence may make that choice for them.                                    */

const ACKNOWLEDGMENT = /^(acknowledged|acknowledge|accepted|understood|noted|ack)\b[\s,.;:!—-]*/i;

/** Words that mean "carry on" and name no change. A courtesy after an
 *  acknowledgment has said everything it came to say once the checks settle;
 *  sending it to the parser would answer it with "I could not read that". */
const CARRY_ON = ["proceed", "go ahead", "go on", "continue", "carry on", "next", "please", "thanks", "thank you", "ok", "okay"];

/** An acknowledgment, and whatever the banker went on to say after it. Null
 *  where the line is not one. */
function readAcknowledgment(text: string): { rest: string } | null {
  const line = text.trim();
  const match = ACKNOWLEDGMENT.exec(line);
  if (!match) return null;
  const rest = line.slice(match[0].length).trim();
  return { rest: CARRY_ON.includes(rest.toLowerCase().replace(/[.!,]+$/, "")) ? "" : rest };
}

/**
 * Did the plan leave the room before this failed?
 *
 * The engine stamps the refusal it raises once the execute call is away; a token
 * the org reports as already redeemed says so in its own words. Either way the
 * write may have landed and the approval must not be offered again.
 */
function reachedTheOrg(e: unknown): boolean {
  if ((e as { dispatched?: unknown } | null | undefined)?.dispatched === true) return true;
  const code = (e as { code?: unknown } | null | undefined)?.code;
  const text = `${typeof code === "string" ? code : ""} ${readableError(e)}`.toLowerCase();
  return /token_refused|already been used|already redeemed/.test(text);
}

/* --------------------------------------------------------------- fragments */

function SourceIcon({ icon }: { icon: SourceChip["icon"] }) {
  const paths: Record<SourceChip["icon"], ReactNode> = {
    email: (
      <>
        <path d="M1.2 2.6h9.6v6.8H1.2z" stroke="currentColor" strokeWidth="1.1" fill="none" />
        <path d="M1.4 3l4.6 3.4L10.6 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </>
    ),
    package: (
      <>
        <path d="M6 1.2l4.4 2.3v5L6 10.8 1.6 8.5v-5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
        <path d="M1.8 3.6L6 5.9l4.2-2.3M6 5.9v4.7" stroke="currentColor" strokeWidth="1.1" fill="none" />
      </>
    ),
    collateral: (
      <>
        <path d="M1.6 4.2h8.8v5.2H1.6z" stroke="currentColor" strokeWidth="1.1" fill="none" />
        <path d="M3.6 4.2V2.6h4.8v1.6" stroke="currentColor" strokeWidth="1.1" fill="none" />
      </>
    ),
    covenants: (
      <>
        <path d="M6 1.6v8.8M2.2 3.6h7.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        <path d="M2.2 3.6L.9 6.6h2.6zM9.8 3.6L8.5 6.6h2.6z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
      </>
    ),
    calendar: (
      <>
        <path d="M1.6 2.8h8.8v7.2H1.6z" stroke="currentColor" strokeWidth="1.1" fill="none" />
        <path d="M1.6 5h8.8M4 1.6v2.2M8 1.6v2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </>
    ),
    account: (
      <>
        <circle cx="6" cy="4.2" r="2.1" stroke="currentColor" strokeWidth="1.1" fill="none" />
        <path d="M1.9 10.4c0-2.3 1.8-3.6 4.1-3.6s4.1 1.3 4.1 3.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </>
    ),
  };
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {paths[icon]}
    </svg>
  );
}

function HaveRows({ rows }: { rows: HaveRow[] }) {
  return (
    <>
      {rows.map((row, i) => (
        <div className="wk-have-row" key={`${row.label}-${i}`}>
          <div className="wk-l">{row.label}</div>
          <div className="wk-v">{row.value}</div>
          <div className="wk-d">{row.detail}</div>
        </div>
      ))}
    </>
  );
}

/** A source chip's rows, whether the engine read them from the org or the shell
 *  engine addressed them by key in the fixture. */
function sourceRows(chip: SourceChip): HaveRow[] {
  return chip.have ?? (chip.rows ?? []).map((k) => HAVE[k]).filter(Boolean);
}

function OrgMap({ delta, filedNote }: { delta: WorkroomDelta; filedNote?: string }) {
  return (
    <>
      <div className="wk-mapbox">
        <div className="wk-h">The org records this writes</div>
        {delta.map.map(([k, v]) => (
          <div className="wk-r" key={k}>
            <span className="wk-k">{k}</span>
            <span className="wk-v">{v}</span>
          </div>
        ))}
        <div className="wk-fields">
          {delta.fields.map((f) => (
            <code key={f}>{f}</code>
          ))}
        </div>
      </div>
      {delta.caveat && <div className="wk-cav">{delta.caveat}</div>}
      {filedNote && <div className="wk-saynote">{filedNote}</div>}
    </>
  );
}

function ChallengeMath({ challenge }: { challenge: WorkroomChallenge }) {
  return (
    <>
      <div className="wk-math">
        {challenge.rows.map(([label, value, cls], i) => (
          <div className={`wk-mrow ${cls ? `wk-${cls}` : ""}`} key={i}>
            <span className="wk-l">{label}</span>
            <span className="wk-v tnum">{value}</span>
          </div>
        ))}
      </div>
      <div className="wk-saynote">{challenge.say}</div>
    </>
  );
}

/* ---------------------------------------------------------- the arrival puck
   The confirm's travel. A small accent puck departs the chip and arrives at the
   manifest count, which is what makes the landing read as cause and effect.

   THE LANDING IS NOT THE ANIMATION'S TO WITHHOLD. `done` runs on the puck's
   finish OR on a timeout, whichever comes first, and exactly once. A headless
   run found the failure this closes: where the animation never reports finished
   (a paused compositor, a backgrounded tab), the banker's confirm was simply
   lost. Motion may sequence a landing; it may never gate one. */
function flyToManifest(from: Element | null, to: Element | null, land: () => void): void {
  let landed = false;
  const done = () => {
    if (landed) return;
    landed = true;
    land();
  };
  const reduced = prefersReducedMotion();
  const narrow = typeof window !== "undefined" && window.innerWidth <= 1180;
  if (reduced || narrow || !from || !to || typeof document === "undefined") {
    done();
    return;
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const puck = document.createElement("div");
  puck.style.cssText =
    "position:fixed;width:10px;height:10px;border-radius:50%;background:var(--accent);" +
    "box-shadow:0 0 0 4px var(--accent-wash),0 4px 10px -2px color-mix(in srgb,var(--accent) 50%,transparent);" +
    "z-index:120;pointer-events:none";
  const x0 = a.right - 22;
  const y0 = a.top + 16;
  puck.style.left = `${x0}px`;
  puck.style.top = `${y0}px`;
  document.body.appendChild(puck);
  if (typeof puck.animate !== "function") {
    puck.remove();
    done();
    return;
  }
  const dx = b.left + 34 - x0;
  const dy = b.top + b.height / 2 - 5 - y0;
  const anim = puck.animate(
    [
      { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      { transform: `translate3d(${dx * 0.62}px,${dy * 0.22}px,0) scale(.92)`, opacity: 1, offset: 0.6 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(.45)`, opacity: 0.15 },
    ],
    { duration: 430, easing: "cubic-bezier(.19,1,.3,1)" },
  );
  anim.onfinish = () => {
    puck.remove();
    done();
  };
  window.setTimeout(() => {
    puck.remove();
    done();
  }, 700);
}

/* -------------------------------------------------------------- the shell */

export function Workroom({
  context,
  engine,
  onClose,
  onAnchor,
}: {
  context: WorkroomContext;
  /** The room talks to ONE interface and never to a script, a tool or a parser.
   *  Which implementation arrives is WorkroomHost's decision, not the shell's. */
  engine: WorkroomEngine;
  onClose: () => void;
  /** The banker chose which package to work in. The room does not anchor itself:
   *  it is REOPENED on the chosen package, which rebuilds the engine and the
   *  manifest with it, so nothing composed against one package can survive into
   *  a plan against another. */
  onAnchor?: (choice: PackageChoice) => void;
}) {
  const brief = useMemo(() => engine.brief(context), [engine, context]);
  const vocabulary = useMemo(() => vocabularyFor(context), [context]);
  const reduced = prefersReducedMotion();

  const roomRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const manifestCountRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const [bootStep, setBootStep] = useState(0);
  /* THREE PHASES, NOT FOUR (W3, decided 2026-08-27: "MERGE"). The briefing, the
     suggestion chips and the composer are ONE scene — the chat is protagonist
     from second one, and there is no "Open the conversation" button between the
     banker and the room. */
  const [phase, setPhase] = useState<"boot" | "work" | "filed">("boot");
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [entries, setEntries] = useState<WorkroomDelta[]>([]);
  const [execution, setExecution] = useState<WorkroomExecution | null>(null);
  const [suggestion, setSuggestion] = useState<WorkroomSuggestion | null>(null);
  /** The room is composing an answer. It drives the thinking beat, and it holds
   *  the approval closed: an approve bar that appears for one frame between a
   *  confirm landing and the check it trips is an approval offered before the
   *  room has finished answering. */
  const [thinking, setThinking] = useState(false);
  /** The approval is in flight. A second click while the org is working would
   *  stage a second plan behind the first, and the token is single use. */
  const [filing, setFiling] = useState(false);
  /** THE APPROVAL IS CLOSED FOR THIS PLAN. The call reached the org and the
   *  answer did not come back clean, so the token may be spent and the write may
   *  have landed. A live run had the org succeed after 43 seconds while the room
   *  re-armed a button whose retry would have bounced on the burnt token; the
   *  honest move is to stop offering the gesture and say why. */
  const [sealed, setSealed] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [fit, setFit] = useState<FitState>(EMPTY_FIT);
  /** Every block's height, remembered the first time it is seen, so the pass
   *  can reason about turns it has already folded out of the tree. */
  const fitCache = useRef<FitCache>(new Map());
  /** Folds the BACKSTOP took because the laid-out pane disagreed with the
   *  model. They are held apart from the model's own folds so a later pass
   *  cannot compute them away and start the disagreement over. */
  const forcedFolds = useRef<string[]>([]);
  /** The rail's own fit, on the thread's discipline: tighten the entries first,
   *  then fold the OLDEST behind a line. The newest arrival always stays. */
  const [railDense, setRailDense] = useState(false);
  const [railFolded, setRailFolded] = useState(0);
  const { peek, openPeek, closePeek } = usePeek();

  /* ---- law 4: the page behind the room does not scroll while it is open. */
  useEffect(() => {
    document.body.classList.add("wk-open");
    return () => document.body.classList.remove("wk-open");
  }, []);

  useEffect(() => pushModal("workroom"), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isTopmost("workroom")) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  /* ---- the arrival scene. The brand glyph carries the load, then the room
          assembles. Under reduced motion the room is simply there. */
  useEffect(() => {
    const open = () => {
      setPhase("work");
      setSuggestion(engine.suggest());
      // THE ROOM CLOSED; THE WORK DID NOT. A banker who shut the room to check a
      // figure on the cockpit behind it used to come back to a blank manifest and
      // say every change again, because the entries lived in a component that
      // unmounts. They live in the engine now, against the package they were
      // composed for, and the room says what it picked up rather than presenting
      // the rail as if it had always been there.
      const resumed = engine.resume();
      if (!resumed.length) return;
      const [one, many] = vocabulary.changeWord;
      setEntries(resumed);
      setItems((prev) => [
        ...prev,
        {
          kind: "agent",
          id: nextId("agent"),
          text: `Picking up where you left off: ${resumed.length} ${resumed.length === 1 ? one : many} on the manifest.`,
        },
      ]);
    };
    if (reduced) {
      setBootStep(brief.loadSteps.length - 1);
      open();
      return;
    }
    const timers = brief.loadSteps.map((_, i) => window.setTimeout(() => setBootStep(i), i * 460));
    const done = window.setTimeout(open, brief.loadSteps.length * 460 + 320);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [brief.loadSteps, engine, reduced, vocabulary.changeWord]);

  /* ---- and the room hands it back. Every landing and every removal, so a close
          at any moment loses nothing. Not once it has FILED: a filed change set
          is finished, and offering it again as if it were still composing would
          be a lie the next session would act on. */
  useEffect(() => {
    if (phase !== "work") return;
    engine.hold(entries);
  }, [engine, entries, phase]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), reduced ? 200 : 2300);
    return () => clearTimeout(t);
  }, [toast, reduced]);

  /* ---- derived state. Nothing below is stored twice. */
  /** The room is open for work. Post-merge that is true the moment the boot
   *  clears: the entry scene IS the conversation. */
  const inConversation = phase === "work" || phase === "filed";
  /** The boot has cleared and the zones may arrive. */
  const assembled = phase !== "boot";
  /** The briefing has been answered. Until then the position keeps its full
   *  height — the quiet briefing is the first thing in the room (W5), and law 3
   *  holds because the scene is still a pin, one sentence and chips. */
  const started = items.length > 0;
  const openGates = items.reduce((n, item) => (isLive(item) && item.kind !== "reply" ? n + 1 : n), 0);
  const checksArrived = items.filter((i) => i.kind === "challenge").length;
  const checksAcked = items.filter((i) => i.kind === "challenge" && i.acked).length;
  /**
   * THE APPROVAL IS OPEN WHEN THERE IS SOMETHING TO APPROVE and nothing is
   * waiting on the banker. It used to also require the suggestions to be SPENT,
   * which meant a banker who confirmed the one change they came in for could not
   * file it until they had worked through every other move the engine could
   * think of — the manifest filled, the approve bar never came, and the room
   * read as a dead end. The suggestions are an offer, never a gate.
   */
  const approvalOpen = phase === "work" && !thinking && openGates === 0 && entries.length > 0;

  const baseline = useMemo(
    () => ({
      committedMM: brief.baselineCommittedMM,
      members: brief.baselineMembers,
      changeWord: vocabulary.changeWord,
    }),
    [brief.baselineCommittedMM, brief.baselineMembers, vocabulary.changeWord],
  );
  const figures = useMemo(() => figuresFor(entries, baseline), [entries, baseline]);
  /** How much of the manifest a deployed tool actually files. An entry that says
   *  nothing about it is fileable — that is the shell engines, unchanged. */
  const fileable = entries.filter((e) => e.fileable !== false).length;
  const handedOff = entries.length - fileable;
  /** What the rail can show. The COUNT above it always states the whole rail,
   *  so a fold never understates what the approval covers. */
  const groups = useMemo(() => groupEntries(entries.slice(railFolded)), [entries, railFolded]);
  const steps = stepperState({
    conversationOpen: phase !== "boot",
    landed: entries.length,
    composeTarget: brief.composeTarget,
    checksArrived,
    checksAcked,
    approvalOpen,
    filed: phase === "filed",
  });

  /* ---- the fit pass. Law 5, applied: clamp prose, then fold settled turns,
          and give the space back the moment a confirm frees it. */
  useLayoutEffect(() => {
    const thread = threadRef.current;
    const capacity = readMetrics(thread, fitCache.current);
    if (capacity === null || !thread) return;

    const forced = forcedFolds.current;
    const blocks = items.map(toFitBlock).filter((b) => !forced.includes(b.id));
    const model = fitThread(blocks, measureWith(fitCache.current, blocks, capacity));
    const next: FitState = { folded: [...forced, ...model.folded], clamped: model.clamped };

    if (!sameFit(fit, next)) {
      setFit(next);
      return;
    }

    // THE BROWSER GETS THE LAST WORD. The model says this fits; if the pane
    // says something is still hanging below it, fold one more settled turn and
    // hold that fold apart from the model, so the next pass starts from it
    // rather than undoing it.
    const over = realOverflow(thread);
    if (over > 0) {
      const foldable = blocks.filter((b) => !next.folded.includes(b.id) && !b.live);
      if (foldable.length > 1) {
        forcedFolds.current = [...forced, foldable[0].id];
        setFit({ ...next, folded: [...next.folded, foldable[0].id] });
      }
      return;
    }
    // Room has genuinely opened up — a confirm collapsed a chip, an entry was
    // removed. Give a forced fold back and let the model re-decide.
    if (over < -FIT_RELAX && forced.length) {
      forcedFolds.current = forced.slice(0, -1);
      setFit({ ...next, folded: next.folded.filter((id) => id !== forced[forced.length - 1]) });
    }
  }, [items, entries, phase, fit]);

  /* ---- THE RAIL FITS TOO. A manifest that silently clips its own entries is
          law 5 broken where it matters most: the banker signs what is stacked
          above the approve button, so every entry has to be reachable. It
          tightens, then folds the oldest, and gives the space back when the
          approve bar closes or an entry is removed. Convergent by construction:
          each pass moves one step and the relax band is wider than a step. */
  useLayoutEffect(() => {
    const rail = railRef.current;
    // NEVER FIT A PANE THAT IS NOT THERE YET. The rail opens by animating its
    // grid column from zero, and a mid-transition measurement reports a pane a
    // few pixels wide in which everything overflows — which would fold the
    // whole manifest away and, the pane never growing back in that frame, keep
    // it folded. Below the threshold the rail is still arriving, not full.
    if (!rail || !rail.clientHeight || rail.clientWidth < RAIL_MIN_WIDTH) return;
    const over = rail.scrollHeight - rail.clientHeight;
    if (over > 0) {
      if (!railDense) setRailDense(true);
      else if (railFolded < entries.length - 1) setRailFolded((n) => n + 1);
      return;
    }
    if (over < -RAIL_SLACK) {
      if (railFolded > 0) setRailFolded((n) => n - 1);
      else if (railDense) setRailDense(false);
    }
  }, [entries, phase, execution, railDense, railFolded]);

  /* A resize changes the pane and every height in it, so the cache is dropped
     and the next pass measures the room it is actually in. */
  useEffect(() => {
    const onResize = () => {
      fitCache.current.clear();
      forcedFolds.current = [];
      setFit(EMPTY_FIT);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ------------------------------------------------------------ the moves */

  const push = useCallback((item: ThreadItem) => setItems((prev) => [...prev, item]), []);
  const agent = useCallback((text: string) => push({ kind: "agent", id: nextId("agent"), text }), [push]);

  /** Hold the composed beat, then let the answer settle in. Zero under reduced
   *  motion, so a test and a banker who asked for stillness both get the answer
   *  on the same tick. */
  const beat = useCallback(
    (started: number) =>
      new Promise<void>((resolve) => {
        const left = reduced ? 0 : Math.max(0, COMPOSE_FLOOR_MS - (Date.now() - started));
        if (!left) {
          resolve();
          return;
        }
        window.setTimeout(resolve, left);
      }),
    [reduced],
  );

  /**
   * The banker said something.
   *
   * `heard` is what the engine parses; `said` is what the thread shows. They
   * differ for a suggestion pill, whose label is banker grammar and whose
   * instruction has to be precise enough to resolve one member out of six.
   */
  const say = useCallback(
    async (heard: string, said?: string, opts?: { settled?: boolean }) => {
      const trimmed = heard.trim();
      if (!trimmed) return;
      push({ kind: "banker", id: nextId("banker"), text: (said ?? heard).trim() });

      // ONE DECISION PER VIEW (law 2). While a gate is open the room does not
      // take a new instruction; it says so rather than quietly queueing one.
      // `settled` is the one exception and it is not a loophole: taking an
      // advisory's resolution settles the cards it is about IN THE SAME
      // GESTURE, so there is still exactly one decision on the table.
      //
      // A TYPED ACKNOWLEDGMENT IS THE SECOND. "acknowledged" is the same
      // decision the Acknowledge button makes, and where the only thing waiting
      // is a CHECK, the word settles it exactly as the button does — and the
      // room carries on with whatever the banker said after it. Where a chip is
      // still open the room still says so: what goes on the manifest is chosen
      // by a gesture on that chip and never by a word in a sentence.
      let instruction = trimmed;
      if (openGates > 0 && !opts?.settled) {
        const ack = readAcknowledgment(trimmed);
        const checks = items.filter((i) => i.kind === "challenge" && !i.acked);
        if (!ack || !checks.length || checks.length !== openGates) {
          agent("One decision at a time. The open cards above, or the approve button under the manifest, carry the next move.");
          return;
        }
        setItems((prev) => prev.map((i) => (i.kind === "challenge" && !i.acked ? { ...i, acked: true } : i)));
        if (!ack.rest) {
          agent(
            `${checks.length === 1 ? "That check is" : `Those ${checks.length} checks are`} acknowledged. ${vocabulary.nextMove}`,
          );
          return;
        }
        instruction = ack.rest;
      }

      // W2 — THE RAIL IS ADDRESSABLE IN THE CONVERSATION. "what is staged" and
      // "drop the rate change" are answered here, before the parser sees them:
      // they are moves on the manifest, not new amendments, and sending them to
      // a field parser would produce a chip nobody asked for. It claims a line
      // only when the line NAMES an entry: a bare removal verb belongs to the
      // parser, which is where a borrowing-structure removal files.
      const address = addressManifest(instruction, entries);
      if (address) {
        if (address.kind === "remove") {
          setEntries((prev) => removeEntry(prev, address.entry.id));
          setToast("Removed from the manifest");
          agent(
            `${address.entry.title} on ${address.entry.target} is out of the manifest. Say it again to put it back, with the figure you want.`,
          );
          return;
        }
        agent(
          address.kind === "list"
            ? address.entries.length
              ? `The manifest holds ${address.entries.length}: ${address.entries
                  .map((e) => `${e.title} on ${e.target}, ${e.before} to ${e.after}`)
                  .join("; ")}.`
              : "Nothing is staged yet. Confirmed changes land in the manifest, grouped."
            : address.reason,
        );
        return;
      }

      // THE COMPOSED BEAT. The glyph fills while the engine reads the line — and
      // on a wired room the engine may be waiting on the gateway, so this is
      // also the only thing standing between the banker and a blank pause.
      const started = Date.now();
      setThinking(true);
      try {
        const result = await engine.parseIntent(instruction, context);
        await beat(started);
        // The reply and the chips it puts on the table land TOGETHER. Pushed
        // separately they are two renders, and the fit pass runs against a
        // thread that never existed.
        const answer: ThreadItem[] = [
          { kind: "agent", id: nextId("agent"), text: result.reply, options: result.kind === "unparsed" ? result.options : undefined },
        ];
        const chips: ChipModel[] =
          result.kind === "deltas"
            ? result.deltas.map((d) => ({ key: nextId("chip"), delta: d, state: "open" }))
            : result.kind === "refusal"
              ? [{ key: nextId("chip"), refusal: result.refusal, state: "open" }]
              : [];
        if (chips.length) {
          answer.push({
            kind: "chips",
            id: nextId("chips"),
            chips,
            advisories: result.kind === "deltas" ? result.advisories : undefined,
          });
        }
        setItems((prev) => [...prev, ...answer]);
        setSuggestion(engine.suggest());
      } finally {
        setThinking(false);
      }
    },
    [agent, beat, context, engine, entries, items, openGates, push, vocabulary.nextMove],
  );

  /**
   * The banker picked a member off the package strip.
   *
   * The strip is the room's list of what is eligible, so it is also the room's
   * way in. Where the engine has a read behind that member it answers and the
   * conversation continues on it; where it does not — the shell engines, whose
   * strip is a fixture — the member detail opens instead, which is the honest
   * answer rather than a question the engine could not then take an answer to.
   */
  const pickMember = useCallback(
    async (member: PackageMember, fallback: () => void) => {
      const result = engine.pick(member.id);
      if (!result) {
        fallback();
        return;
      }
      push({ kind: "banker", id: nextId("banker"), text: member.key });
      const started = Date.now();
      setThinking(true);
      try {
        await beat(started);
        agent(result.reply);
        setSuggestion(engine.suggest());
      } finally {
        setThinking(false);
      }
    },
    [agent, beat, engine, push],
  );

  const settleChip = useCallback((blockId: string, chipKey: string, state: ChipState) => {
    setItems((prev) =>
      prev.map((item) =>
        item.kind === "chips" && item.id === blockId
          ? { ...item, chips: item.chips.map((c) => (c.key === chipKey ? { ...c, state } : c)) }
          : item,
      ),
    );
  }, []);

  /**
   * THE CONFIRM, AND ITS CONSEQUENCE.
   *
   * The failure this closes, reproduced headless before it was fixed: the entry
   * landed in the rail, the chip collapsed to a receipt, and the room said
   * NOTHING. No acknowledgement, no check, no next move, and — because the
   * approval used to wait on the suggestions running out — no way to file what
   * had just been staged. A banker cannot tell a room that is thinking from a
   * room that is broken, and this one was neither: it was finished.
   *
   * So a confirm now lands as ONE event. The puck's travel is its beat; at the
   * end of it the entry, the receipt, the agent's answer and any check the new
   * figures trip all arrive in a single commit. One motion, one settle, and no
   * frame in between where the approve bar could flicker on and off again.
   */
  const confirmChip = useCallback(
    (blockId: string, chipKey: string, delta: WorkroomDelta, from: Element | null) => {
      setThinking(true);
      flyToManifest(from, manifestCountRef.current, () => {
        const staged = addEntry(entries, delta);
        const { reply, challenge } = engine.acknowledge(delta, staged);
        setEntries(staged);
        settleChip(blockId, chipKey, "confirmed");
        setToast(delta.badge);
        setItems((prev) => [
          ...prev,
          { kind: "agent", id: nextId("agent"), text: reply },
          // CHECKS COME TO YOU. The check a confirm trips arrives back in the
          // conversation the moment it becomes true, never in a separate tab.
          ...(challenge ? [{ kind: "challenge" as const, id: nextId("check"), challenge, acked: false }] : []),
        ]);
        setSuggestion(engine.suggest());
        setThinking(false);
      });
    },
    [engine, entries, settleChip],
  );

  /**
   * SETTLING A CHIP WITHOUT STAGING IT is a decision too, so it gets an answer.
   *
   * A discarded proposal LEAVES — there is nothing left to read on it. A refusal
   * that has been understood STAYS, settled: its reason is the answer and taking
   * it off the screen would take the answer with it.
   */
  const settleOpenChip = useCallback(
    (blockId: string, chip: ChipModel) => {
      if (chip.delta) {
        settleChip(blockId, chip.key, "discarded");
        agent(
          `Dropped. ${chip.delta.title} on ${chip.delta.target} is not staged and the package has not moved. ${vocabulary.nextMove}`,
        );
      } else {
        settleChip(blockId, chip.key, "confirmed");
        agent(`That one stays off the manifest, for the reason above. ${vocabulary.nextMove}`);
      }
      setSuggestion(engine.suggest());
    },
    [agent, engine, settleChip, vocabulary.nextMove],
  );

  /**
   * THE BANKER TOOK THE ADVICE.
   *
   * An advisory never blocked the change it warned about, so taking its
   * resolution has to REPLACE that change rather than sit beside it: the open
   * cards in the block are settled by the same gesture, and the resolution goes
   * back through the parser exactly as a typed line does. An advisory can
   * therefore do nothing the banker could not have said themselves.
   */
  const takeAdvice = useCallback(
    (blockId: string, advisory: WorkroomAdvisory) => {
      if (!advisory.resolution) return;
      setItems((prev) =>
        prev.map((item) =>
          item.kind === "chips" && item.id === blockId
            ? { ...item, chips: item.chips.map((c) => (c.state === "open" ? { ...c, state: "discarded" as ChipState } : c)) }
            : item,
        ),
      );
      void say(advisory.resolution.say, advisory.resolution.label, { settled: true });
    },
    [say],
  );

  const drop = useCallback(
    (delta: WorkroomDelta) => {
      setEntries((prev) => removeEntry(prev, delta.id));
      setToast("Removed from the manifest");
      agent(`${delta.title} on ${delta.target} is out of the manifest. The package reads as it did before it landed.`);
    },
    [agent],
  );

  const acknowledge = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.kind === "challenge" && i.id === id ? { ...i, acked: true } : i)));
  }, []);

  const approve = useCallback(async () => {
    if (filing || sealed) return;
    setFiling(true);
    try {
      const staged = await engine.stagePlan(entries, context);
      if (!staged.decisionToken) {
        agent("The staging call came back without a confirmation token, so there is nothing to redeem. Nothing was written.");
        return;
      }
      const result = await engine.execute({
        stagingId: staged.stagingId,
        planHash: staged.planHash,
        decisionToken: staged.decisionToken,
        approverUserId: context.approver,
      });
      setExecution(result);
      setPhase("filed");
      // The change set is finished. Nothing is left to pick up on a reopen, and
      // the next room on this package starts on an empty rail.
      engine.release();
      push({ kind: "reply", id: nextId("reply"), reply: result.reply ?? { subject: "", lede: "", body: "" } });
    } catch (e) {
      // A REAL ENGINE REFUSES OUT LOUD. The org's precondition, a moved figure,
      // a manifest that files nothing — each comes back as a sentence in the
      // conversation with the approval still where the banker left it, rather
      // than as a dead button or a silent rejection.
      //
      // AS A SENTENCE. The transport rejects with a plain failure OBJECT, not an
      // Error, and `String(that)` is "[object Object]" — which is what a live run
      // put in the thread as the room's whole answer to a 43-second execute.
      agent(readableError(e));
      // AND ONLY WHERE A RETRY IS HONEST. Once the call has reached the org the
      // token may be spent and the write may have landed, so the room stops
      // offering the gesture rather than arming a retry that would bounce on a
      // burnt single-use token and tell the banker nothing about what the org did.
      if (reachedTheOrg(e)) {
        setSealed(true);
        agent("The filing may have completed despite the error — do not approve again; check the staging record.");
      }
    } finally {
      setFiling(false);
    }
  }, [agent, context, engine, entries, filing, push, sealed]);

  /* ----------------------------------------------------------- scene bar */

  let nextLabel = "Assembling";
  let nextEnabled = false;
  let gateHint = "";
  let onNext: (() => void) | undefined;
  if (phase === "filed") {
    nextLabel = "Close the workroom";
    nextEnabled = true;
    onNext = onClose;
    gateHint = `${vocabulary.filedWord}. The workroom holds.`;
  } else if (phase === "work") {
    nextLabel = "Continue";
    if (openGates > 0) {
      gateHint = checksArrived > checksAcked ? "Acknowledge the checks to continue" : "Settle the open cards to continue";
    } else if (thinking) {
      gateHint = "Reading that";
    } else {
      // THE OFFER AND THE GATE ARE DIFFERENT THINGS. A suggestion still on the
      // table keeps Continue live even once the approval has opened, because
      // composing more and filing what is already staged are both legitimate
      // next moves and the room must not pick one for the banker.
      if (suggestion) {
        nextEnabled = true;
        onNext = () => void say(suggestion.say, suggestion.label);
      }
      gateHint = approvalOpen ? vocabulary.approveHint : "";
    }
  }

  const filedById = useMemo(
    () => new Map((execution?.filed ?? []).map((f) => [f.deltaId, f])),
    [execution],
  );

  /* ------------------------------------------------------------- render */

  const visibleItems = items.filter((i) => !fit.folded.includes(i.id));
  const foldedItems = items.filter((i) => fit.folded.includes(i.id));

  return (
    <Portal>
      <div className="wk-root">
        <div className="wk-scrim" onClick={onClose} role="presentation" />
        <div ref={roomRef} className="wk-room" role="dialog" aria-modal="true" aria-label={vocabulary.title}>
          <header className="wk-head">
            <BrandLockup size={13.5} />
            <span className="wk-dot" />
            <div className="wk-title">{vocabulary.title}</div>
            <span className="wk-spacer" />
            {/* A SCRIPTED room says so: nothing in it reaches a tool, and no
                plan it stages is the org's. A wired room shows no badge, which
                is the only honest way round — the absence of the word is a
                claim, so it is driven by the engine and not by the mode. */}
            {engine.scripted && <span className="wk-badge">Scripted</span>}
            <button type="button" className="wk-icobtn" onClick={onClose} aria-label="Close the workroom">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          {phase === "boot" && (
            <div className="wk-boot" aria-hidden="true">
              <div className="wk-boot-inner">
                <BrandGlyph className="wk-boot-glyph c360-beat" />
                <div className="wk-boot-label">{brief.loadSteps[bootStep]}</div>
                <div className="wk-boot-bar">
                  <i style={{ width: `${Math.round(((bootStep + 1) / brief.loadSteps.length) * 100)}%` }} />
                </div>
                <div className="wk-boot-sub">
                  {vocabulary.title} · {brief.packageName}
                </div>
              </div>
            </div>
          )}

          <div className="wk-body" data-mode={inConversation ? "work" : "entry"}>
            {/* ======================================= ZONE 1: THE PACKAGE */}
            <section className="wk-pkg">
              <div className="wk-amb" aria-hidden="true">
                <span className="wk-a" />
                <span className="wk-b" />
              </div>
              {/* THE ROOM ASSEMBLES ONE ZONE AT A TIME as the boot clears, so
                  there is nothing to digest until it is ready. */}
              <div className={`wk-pkg-top wk-rv ${assembled ? "wk-in" : ""}`}>
                <div>
                  {/* ONE WORD. The heading under it names the package, so a
                      two-word kicker saying "product package" above it spent
                      law 3's budget restating the noun that follows it. */}
                  <div className="wk-kicker">Package</div>
                  <h2>{brief.packageName}</h2>
                </div>
                <div className="wk-agg">
                  <div>
                    <span className="wk-l">Members</span>
                    <span className={`wk-v tnum ${figures.newMembers ? "wk-bump" : ""}`}>{figures.membersLabel}</span>
                    <span className={`wk-n ${figures.membersNote ? "wk-pro" : ""}`}>{figures.membersNote}</span>
                  </div>
                  <div>
                    <span className="wk-l">Committed</span>
                    <span className={`wk-v tnum ${figures.committedNote ? "wk-bump" : ""}`}>{figures.committedLabel}</span>
                    <span className={`wk-n ${figures.committedNote ? "wk-pro" : ""}`}>{figures.committedNote}</span>
                  </div>
                  <div className="wk-thin">
                    <span className="wk-l">Covenants</span>
                    <span className="wk-v tnum">{brief.covenantFigure}</span>
                    <span className="wk-n">{figures.covenantNote}</span>
                  </div>
                </div>
              </div>
              {/* ================== THE CHOICE, when there is one to make.
                  A relationship carrying more than one package picks the one to
                  work in before anything else: the credit action anchors on ONE
                  package and that anchor is the governance boundary, so one
                  session is one package is one plan under one approval. A
                  relationship with a single package never sees this. */}
              {brief.packageChoices.length > 0 && (
                <div className={`wk-mbar wk-rv ${assembled ? "wk-in" : ""}`} style={{ transitionDelay: "120ms" }}>
                  <div className="wk-mchips">
                    {brief.packageChoices.map((choice) => (
                      <button
                        type="button"
                        key={choice.id}
                        className={`wk-mchip wk-pkgpick ${choice.eligible ? "" : "wk-prop"}`}
                        title={choice.eligible ? choice.figure : choice.reason}
                        disabled={!choice.eligible}
                        onClick={() => onAnchor?.(choice)}
                      >
                        <b>{choice.label}</b>
                        <span className="wk-amt tnum">{choice.figure}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {brief.showsMembers && (
                <div className={`wk-mbar wk-rv ${assembled ? "wk-in" : ""}`} style={{ transitionDelay: "120ms" }}>
                  <div className="wk-mchips">
                    {brief.members.map((m) => (
                      <button
                        type="button"
                        /* The org's loan id, because two members of one package
                           legitimately share a product word and a label cannot
                           tell them apart. */
                        key={m.id}
                        /* W4 — a member that is NOT booked renders dashed. Pre-work
                           display must never read as done work, and a stage the
                           read does not carry is treated the same way: unknown is
                           not booked. */
                        className={`wk-mchip ${m.proposed ? "wk-prop" : ""}`}
                        title={`${m.product} · ${m.tag}`}
                        /* THE STRIP IS THE WAY IN. It is the room's own list of
                           what is eligible, so clicking a member starts the
                           conversation on it. Where the engine has no read behind
                           the strip to talk about, the member detail opens
                           instead — which is what the shell engines do. */
                        onClick={(e) => {
                          const anchor = e.currentTarget;
                          void pickMember(m, () =>
                            openPeek(anchor, {
                              kicker: "Members of the package",
                              width: 760,
                              content: <MemberCards members={brief.members} />,
                            }),
                          );
                        }}
                      >
                        <b>{m.key}</b>
                        <span className="wk-amt tnum">{m.amount}</span>
                      </button>
                    ))}
                    {figures.newMembers > 0 && (
                      <span className="wk-mchip wk-prop wk-named wk-fresh">
                        <b>NEW</b>
                        <span className="wk-amt tnum">
                          ${(figures.committedMM - brief.baselineCommittedMM).toFixed(1)}MM
                        </span>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="wk-mtoggle"
                    aria-label="Member detail"
                    onClick={(e) =>
                      openPeek(e.currentTarget, {
                        kicker: "Members of the package",
                        width: 760,
                        content: <MemberCards members={brief.members} />,
                      })
                    }
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                      <path d="M1.5 2h8M1.5 5.5h8M1.5 9h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
            </section>

            <div className="wk-grid">
              <div className="wk-col-l">
                {/* ==================================== ZONE 2: THE POSITION */}
                <section
                  className={`wk-card wk-pos wk-rv ${assembled ? "wk-in" : ""} ${started ? "wk-compact" : ""}`}
                  style={{ transitionDelay: "240ms" }}
                >
                  <div className="wk-card-b">
                    {brief.askPin && (
                      <div className="wk-posrow">
                        <span className="wk-askpin tnum">{brief.askPin}</span>
                      </div>
                    )}
                    {/* THE ROOM OPENS BY NAME. The greeting is a real read or it
                        is absent; it is never a label, which is why the kicker
                        that used to say "Position" here is gone — the sentence
                        introduces itself now. */}
                    <div className="wk-headline">
                      {brief.greeting && <span className="wk-greet">{brief.greeting} </span>}
                      {brief.position}
                    </div>
                    <div className="wk-posfoot">
                      <button
                        type="button"
                        className="wk-dt"
                        onClick={(e) =>
                          openPeek(e.currentTarget, {
                            kicker: "Why this position",
                            width: 520,
                            content: (
                              <>
                                {brief.why.map((row) => (
                                  <div className="wk-have-row" key={row.label}>
                                    <div className="wk-l">{row.label}</div>
                                    <div className="wk-d">{row.detail}</div>
                                  </div>
                                ))}
                                <div className="wk-cav">{brief.whyCaveat}</div>
                              </>
                            ),
                          })
                        }
                      >
                        Why
                      </button>
                      <div className="wk-srctray">
                        {brief.sources.map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            className="wk-srcchip"
                            title={s.kicker}
                            onClick={(e) =>
                              openPeek(e.currentTarget, {
                                kicker: s.kicker,
                                width: 440,
                                content: s.email ? <ClientEmail /> : <HaveRows rows={sourceRows(s)} />,
                              })
                            }
                          >
                            <SourceIcon icon={s.icon} />
                            <span className="wk-srclabel">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* ============================================ THE SPINE
                    IT MEASURES PROGRESS, so it arrives with the first move. On
                    the merged entry scene (W3) there is no progress yet, and a
                    spine of four idle stages is four words of decoration in a
                    room whose opening view is budgeted (law 3). */}
                {started && (
                  <div className="wk-stepper">
                    {vocabulary.steps.map((label, i) => (
                      <span
                        key={label}
                        className={`wk-stg ${steps.stages[i] === "on" ? "wk-on" : steps.stages[i] === "done" ? "wk-done" : ""}`}
                      >
                        {/* The stage the room is ON is the one that fills. The
                            class carries the ink gradient the keyframes animate;
                            the animation on its own has nothing to move. */}
                        <BrandGlyph className={steps.stages[i] === "on" ? "c360-beat" : ""} />
                        {label}
                        {i === 1 && steps.composeCount && <span className="wk-cnt">{steps.composeCount}</span>}
                      </span>
                    ))}
                    <span className="wk-rail">
                      <i style={{ width: `${steps.railPercent}%` }} />
                    </span>
                  </div>
                )}

                {/* ====================================== ZONE 3: THE CHAT */}
                <section className="wk-thread" ref={threadRef}>
                  {foldedItems.length > 0 && (
                    <button
                      type="button"
                      className="wk-foldline"
                      onClick={(e) =>
                        openPeek(e.currentTarget, {
                          kicker: "Earlier in this conversation",
                          width: 460,
                          content: <FoldedTurns items={foldedItems} />,
                        })
                      }
                    >
                      <BrandGlyph />
                      {foldLabel(foldedItems.length)}
                    </button>
                  )}
                  {visibleItems.map((item) => (
                    <ThreadBlock
                      key={item.id}
                      item={item}
                      clamp={fit.clamped}
                      entries={entries}
                      filedWord={vocabulary.filedWord}
                      onOpenPeek={openPeek}
                      onConfirm={confirmChip}
                      onDiscard={settleOpenChip}
                      onAcknowledge={acknowledge}
                      onTakeAdvice={takeAdvice}
                      onOption={(sayText, label) => void say(sayText, label)}
                    />
                  ))}
                  {/* THE ROOM IS COMPOSING. One beat, the app's own: the ">"
                      fills with ink and nothing else is offered to read. It is
                      the same mark that carries the boot and the step spine, so
                      the room gains a rhythm rather than a second vocabulary. */}
                  {thinking && (
                    <div className="wk-blk" data-live="1">
                      <div className="wk-msg wk-agent">
                        <div className="wk-who">Workroom agent</div>
                        <div className="wk-bub wk-think" role="status" aria-label="Composing an answer">
                          <BrandGlyph className="c360-beat" />
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {phase === "work" && suggestion && openGates === 0 && !thinking && (
                  <div className="wk-sugg">
                    <button type="button" className="wk-pill" onClick={() => void say(suggestion.say, suggestion.label)}>
                      {suggestion.label}
                    </button>
                  </div>
                )}

                {inConversation && (
                <div className={`wk-composer ${phase === "filed" ? "wk-off" : ""}`}>
                  <input
                    className="wk-txt"
                    value={draft}
                    placeholder={phase === "filed" ? `${vocabulary.filedWord}. The workroom holds.` : "Talk the change into shape."}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const text = draft;
                      setDraft("");
                      void say(text);
                    }}
                    aria-label="Say what should change"
                  />
                  <button
                    type="button"
                    className="wk-send"
                    aria-label="Send"
                    onClick={() => {
                      const text = draft;
                      setDraft("");
                      void say(text);
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M1.6 7h9.4M7.2 3.2L11 7l-3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                )}
              </div>

              {/* ==================================== ZONE 4: THE MANIFEST */}
              <aside className="wk-col-r">
                <div className="wk-man-h">
                  <div className="wk-kicker">{vocabulary.manifestHeading}</div>
                  <div className="wk-row">
                    <div className="wk-c" ref={manifestCountRef}>
                      {figures.countLine}
                    </div>
                    <button
                      type="button"
                      className="wk-dt"
                      onClick={(e) =>
                        openPeek(e.currentTarget, {
                          kicker: "What the package holds today",
                          width: 460,
                          content: <HaveRows rows={brief.have} />,
                        })
                      }
                    >
                      Package today
                    </button>
                  </div>
                </div>

                <div className={`wk-man-body ${railDense ? "wk-dense" : ""}`} ref={railRef}>
                  {toast && (
                    <div className="wk-landtoast">
                      <BrandGlyph />
                      {toast}
                    </div>
                  )}
                  {entries.length === 0 && <div className="wk-empty">{vocabulary.emptyLine}</div>}
                  {railFolded > 0 && (
                    <button
                      type="button"
                      className="wk-foldline wk-railfold"
                      onClick={(e) =>
                        openPeek(e.currentTarget, {
                          kicker: `Everything in ${vocabulary.manifestHeading.toLowerCase()}`,
                          width: 460,
                          content: <ManifestList entries={entries} />,
                        })
                      }
                    >
                      <BrandGlyph />
                      {railFolded} earlier in the manifest
                    </button>
                  )}
                  {groups.map((group) => (
                    <div className="wk-grp" key={group.id}>
                      <div className="wk-kicker">
                        {group.label}
                        <span className="wk-rule" />
                      </div>
                      <div>
                        {group.entries.map((delta) => {
                          const filed = filedById.get(delta.id);
                          return (
                            <div
                              className={`wk-ent ${filed ? "wk-filed" : ""} ${delta.op === "remove" ? "wk-rm" : ""}`}
                              key={delta.id}
                            >
                              <div className="wk-ent-row">
                                <button
                                  type="button"
                                  className="wk-ent-t"
                                  onClick={(e) =>
                                    openPeek(e.currentTarget, {
                                      kicker: `${delta.title} · what this writes`,
                                      width: 460,
                                      content: <OrgMap delta={delta} filedNote={filed?.verification} />,
                                    })
                                  }
                                >
                                  <div className="wk-ttl">{delta.title}</div>
                                  <div className="wk-tgt">
                                    {delta.kind} · {delta.target}
                                  </div>
                                  <div className="wk-delta">
                                    <span className="wk-was">{delta.before}</span>
                                    <span className="wk-arw">→</span>
                                    <span className="wk-now">{delta.after}</span>
                                  </div>
                                </button>
                                {!filed && (
                                  <button
                                    type="button"
                                    className="wk-ent-x"
                                    aria-label={`Remove ${delta.title} from the manifest`}
                                    title="Remove. To change it, say it again in the chat."
                                    onClick={() => drop(delta)}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                                      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              {filed && (
                                <div className="wk-filedbar">
                                  <span className="wk-st">{vocabulary.filedWord}</span>
                                  <span className="wk-id">{filed.recordId}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {(approvalOpen || phase === "filed") && (
                  <div className="wk-man-f">
                    <div className="wk-plan">
                      <div className="wk-t">
                        {phase === "filed"
                          ? `${vocabulary.filedWord}. ${figures.count} ${
                              figures.count === 1 ? vocabulary.changeWord[0] : vocabulary.changeWord[1]
                            }, one token.`
                          : vocabulary.planTitle}
                      </div>
                      <div className="wk-s">
                        {figures.planSummary}
                        {handedOff > 0 && (
                          <>
                            {" "}
                            {fileable} of {figures.count} {fileable === 1 ? "files" : "file"}; {handedOff} {handedOff === 1 ? "is" : "are"} handed off.
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className="wk-dt"
                        onClick={(e) =>
                          openPeek(e.currentTarget, {
                            kicker: "Governance",
                            width: 420,
                            content: (
                              <div className="wk-prose">
                                Approver is the running identity: {context.approver}. {GOVERNANCE}
                              </div>
                            ),
                          })
                        }
                      >
                        Governance
                      </button>
                    </div>
                    {phase !== "filed" && (
                      /* THE LABEL COUNTS WHAT FILES. A manifest of five where one
                         files is "approve and file 1 change", never five: the
                         button must not claim the handoffs. */
                      <button type="button" className="wk-approve" disabled={filing || sealed} onClick={() => void approve()}>
                        {filing ? "Working…" : sealed ? "Approval closed" : vocabulary.approveLabel(fileable)}
                      </button>
                    )}
                    {execution && (
                      <>
                        <div className="wk-tokline">
                          <span className="wk-tick">✓</span>
                          <span>{execution.tokenNote}</span>
                        </div>
                        {execution.handoff && <div className="wk-handoff">{execution.handoff}</div>}
                        {/* WHAT WAS NOT FILED, named. The room stages the whole
                            ask and files the part a tool covers; the rest leaves
                            with the banker rather than disappearing. */}
                        {(execution.handoffs?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            className="wk-dt"
                            onClick={(e) =>
                              openPeek(e.currentTarget, {
                                kicker: "Handed off, not filed",
                                width: 480,
                                content: (
                                  <HaveRows
                                    rows={execution.handoffs!.map((h) => ({
                                      label: h.title,
                                      value: "Not filed",
                                      detail: [h.reason, h.closes].filter(Boolean).join(" "),
                                    }))}
                                  />
                                ),
                              })
                            }
                          >
                            {execution.handoffs!.length} handed off, not filed
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </div>

          <footer className="wk-scenebar">
            <span className="wk-gatehint">{gateHint}</span>
            <span className="wk-sp" />
            <button type="button" className="wk-next" disabled={!nextEnabled} onClick={onNext}>
              {nextLabel}
            </button>
          </footer>
        </div>

        {peek && <Peek spec={peek} roomRef={roomRef} onClose={closePeek} />}
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------ peek bodies */

function ManifestList({ entries }: { entries: WorkroomDelta[] }) {
  return (
    <>
      {entries.map((d) => (
        <div className="wk-have-row" key={d.id}>
          <div className="wk-l">{d.kind}</div>
          <div className="wk-v">{d.title}</div>
          <div className="wk-d">
            {d.target} · {d.before} → {d.after}
          </div>
        </div>
      ))}
    </>
  );
}

function MemberCards({ members }: { members: PackageMember[] }) {
  return (
    <div className="wk-mgrid">
      {members.map((m) => (
        <div className={`wk-mcard ${m.proposed ? "wk-prop" : ""}`} key={m.key}>
          <span className="wk-tag">{m.tag}</span>
          <div className="wk-k">{m.key}</div>
          <div className="wk-p">{m.product}</div>
          <div className="wk-a tnum">{m.amount}</div>
          <div className="wk-o">{m.detail}</div>
          {m.utilisation !== undefined && (
            <>
              <div className="wk-meter">
                <i style={{ width: `${m.utilisation}%` }} />
              </div>
              <div className="wk-util">
                <span>{m.utilisation}% drawn</span>
                <span>{m.available}</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function ClientEmail() {
  return (
    <>
      <div className="wk-prov">Interpreted on entry. Package re-queried and the analysis pre-run at 09:02.</div>
      <div className="wk-prose">
        {CLIENT_EMAIL.map((seg, i) =>
          seg.parsed ? (
            <span className="wk-hl" key={i}>
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
    </>
  );
}

function FoldedTurns({ items }: { items: ThreadItem[] }) {
  return (
    <>
      {items.map((item) => (
        <div className="wk-have-row" key={item.id}>
          <div className="wk-l">{item.kind === "banker" ? "Banker" : "Workroom agent"}</div>
          <div className="wk-d">
            {item.kind === "banker" || item.kind === "agent"
              ? item.text
              : item.kind === "challenge"
                ? `${item.challenge.verdict}. ${item.challenge.line}`
                : item.kind === "chips"
                  ? item.chips
                      .map((c) => (c.delta ? `${c.delta.title}: ${c.delta.before} → ${c.delta.after}` : c.refusal?.title))
                      .join(" · ")
                  : ""}
          </div>
        </div>
      ))}
    </>
  );
}

/* ----------------------------------------------------------- thread blocks */

function ThreadBlock({
  item,
  clamp,
  entries,
  filedWord,
  onOpenPeek,
  onConfirm,
  onDiscard,
  onAcknowledge,
  onTakeAdvice,
  onOption,
}: {
  item: ThreadItem;
  clamp: FitState["clamped"];
  entries: WorkroomDelta[];
  filedWord: string;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
  onConfirm: (blockId: string, chipKey: string, delta: WorkroomDelta, from: Element | null) => void;
  onDiscard: (blockId: string, chip: ChipModel) => void;
  onAcknowledge: (id: string) => void;
  onTakeAdvice: (blockId: string, advisory: WorkroomAdvisory) => void;
  onOption: (say: string, label: string) => void;
}) {
  const live = isLive(item) ? "1" : "0";

  if (item.kind === "banker" || item.kind === "agent") {
    const level = clamp[item.id] ?? 0;
    const who = item.kind === "banker" ? "Banker" : "Workroom agent";
    return (
      <div className="wk-blk" data-block={item.id} data-live={live}>
        <div className={`wk-msg wk-${item.kind}`}>
          <div className="wk-who">{who}</div>
          <div
            className={`wk-bub ${level ? `wk-clamp wk-c${level}` : ""}`}
            data-bubble={item.id}
            data-clampable="1"
            title={level ? "Read in full" : undefined}
            onClick={(e) => {
              if (!level) return;
              onOpenPeek(e.currentTarget, {
                kicker: "The message in full",
                width: 470,
                content: <div className="wk-prose">{item.text}</div>,
              });
            }}
          >
            {item.text}
          </div>
          {/* CLICKABLE ANSWERS. The org's own legal values, offered as chips a
              banker can tap instead of typing. A tap SAYS the value — it rides
              the same parser, the same staging and the same validation as a
              typed answer, so a chip can do nothing a sentence could not. */}
          {item.kind === "agent" && item.options && item.options.length > 0 && (
            <div className="wk-opts" data-options={item.id}>
              {item.options.map((opt) => (
                <button type="button" className="wk-opt" key={opt.say} onClick={() => onOption(opt.say, opt.label)}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === "chips") {
    const open = item.chips.some((c) => c.state === "open");
    return (
      <div className="wk-blk" data-block={item.id} data-live={live}>
        {/* ADVICE COMES BEFORE THE DECISION, and it stops being advice once the
            decision is made — a settled block keeps the chips' receipts and
            drops the counsel that was about them. It is never a gate: the
            Confirm below is live whether it is read or not. */}
        {open && (item.advisories?.length ?? 0) > 0 && (
          <div className="wk-advice-set">
            {item.advisories!.map((advisory) => (
              <div className="wk-advice" key={advisory.id} data-rule={advisory.rule}>
                <div className="wk-advice-k">Before you confirm</div>
                <div className="wk-advice-t">{advisory.line}</div>
                {advisory.resolution && (
                  <button type="button" className="wk-advice-b" onClick={() => onTakeAdvice(item.id, advisory)}>
                    {advisory.resolution.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="wk-chips">
          {item.chips.map((chip) => {
            if (chip.state === "discarded") return null;
            if (chip.refusal) {
              return (
                <RefusalChip
                  key={chip.key}
                  chip={chip}
                  onOpenPeek={onOpenPeek}
                  onUnderstood={() => onDiscard(item.id, chip)}
                />
              );
            }
            const delta = chip.delta!;
            if (chip.state === "confirmed") {
              const inManifest = entries.some((e) => e.id === delta.id);
              return (
                <div className={`wk-receipt ${inManifest ? "" : "wk-removed"}`} key={chip.key}>
                  <span className="wk-tick">✓</span>
                  <span>{delta.title}</span>
                  <span className="wk-what">
                    {inManifest ? "in the manifest" : "removed · say it again to restage"}
                  </span>
                </div>
              );
            }
            return (
              <DeltaChip
                key={chip.key}
                delta={delta}
                onOpenPeek={onOpenPeek}
                onConfirm={(from) => onConfirm(item.id, chip.key, delta, from)}
                onDiscard={() => onDiscard(item.id, chip)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (item.kind === "challenge") {
    return (
      <div className="wk-blk" data-block={item.id} data-live={live}>
        <div className="wk-msg wk-agent">
          <div className="wk-who">Workroom agent</div>
          <div className="wk-bub" data-bubble={item.id}>
            <div className="wk-vhead">
              <span className={`wk-vchip ${item.challenge.tone === "warn" ? "wk-warn" : ""}`}>
                {item.challenge.verdict}
              </span>
              <span className="wk-vk">{item.challenge.kicker}</span>
            </div>
            <div className="wk-vtxt">{item.challenge.line}</div>
            {/* WHY THIS CHECK MATTERS HERE. The figures above are what moved;
                this is the one sentence that says why they moved that way. */}
            {item.challenge.why && <div className="wk-vwhy">{item.challenge.why}</div>}
            <div className="wk-vact">
              {item.acked ? (
                <span className="wk-acked">
                  <span className="wk-tick">✓</span>Acknowledged
                </span>
              ) : (
                <button type="button" className="wk-btn wk-btn-p" onClick={() => onAcknowledge(item.id)}>
                  Acknowledge
                </button>
              )}
              <button
                type="button"
                className="wk-dt"
                style={{ marginLeft: "auto" }}
                onClick={(e) =>
                  onOpenPeek(e.currentTarget, {
                    kicker: item.challenge.kicker,
                    width: 440,
                    content: <ChallengeMath challenge={item.challenge} />,
                  })
                }
              >
                Show the math
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wk-blk" data-block={item.id} data-live={live}>
      <section className="wk-card wk-reply">
        <div className="wk-card-b">
          <div className="wk-vhead">
            <span className="wk-vchip">Drafted reply</span>
            <span className="wk-vk">{filedWord} · composed 09:07</span>
          </div>
          <div className="wk-subj" style={{ marginTop: 7 }}>
            {item.reply.subject}
          </div>
          <div className="wk-lede">{item.reply.lede}</div>
          <div className="wk-ft">
            <button
              type="button"
              className="wk-dt"
              onClick={(e) =>
                onOpenPeek(e.currentTarget, {
                  kicker: "Drafted client reply · 09:07",
                  width: 520,
                  content: (
                    <>
                      <div className="wk-subj">Subject: {item.reply.subject}</div>
                      <div className="wk-replybody" style={{ marginTop: 8 }}>
                        {item.reply.body}
                      </div>
                    </>
                  ),
                })
              }
            >
              Read it
            </button>
            <span style={{ marginLeft: "auto", fontSize: "10.6px", color: "var(--ink-faint)" }}>
              Draft only. Nothing leaves the workroom.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeltaChip({
  delta,
  onOpenPeek,
  onConfirm,
  onDiscard,
}: {
  delta: WorkroomDelta;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
  onConfirm: (from: Element | null) => void;
  onDiscard: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div className="wk-chip" ref={ref}>
      <div className="wk-top">
        <span className={`wk-kind ${delta.kindTone ? `wk-${delta.kindTone}` : ""}`}>{delta.kind}</span>
        <span className="wk-tgt">{delta.target}</span>
      </div>
      <div className="wk-line">
        <span className="wk-fld">{delta.title}</span>
        <span className="wk-was">{delta.before}</span>
        <span className="wk-arw">→</span>
        <span className="wk-now">{delta.after}</span>
      </div>
      <div className="wk-acts">
        <button type="button" className="wk-btn wk-btn-p" onClick={() => onConfirm(ref.current)}>
          Confirm
        </button>
        <button type="button" className="wk-btn wk-btn-g" onClick={onDiscard}>
          Discard
        </button>
        <button
          type="button"
          className="wk-btn-i"
          aria-label="How this was validated"
          onClick={(e) =>
            onOpenPeek(e.currentTarget, {
              kicker: "How this was validated",
              width: 460,
              content: (
                <>
                  <div className="wk-prose">
                    Parsed from the message, then validated deterministically against the org before it was offered.
                    Staged intent only: nothing is written until the single approval.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <OrgMap delta={delta} />
                  </div>
                </>
              ),
            })
          }
        >
          i
        </button>
      </div>
    </div>
  );
}

function RefusalChip({
  chip,
  onOpenPeek,
  onUnderstood,
}: {
  chip: ChipModel;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
  onUnderstood: () => void;
}) {
  const refusal = chip.refusal!;
  const settled = chip.state !== "open";
  return (
    <div className="wk-chip wk-refuse">
      <div className="wk-top">
        <span className="wk-kind wk-refusal">Not staged</span>
        <span className="wk-tgt">{refusal.target}</span>
      </div>
      <div className="wk-line">
        <span className="wk-fld">{refusal.title}</span>
      </div>
      {/* THE BANKER'S READING LEADS. Why the answer is no and what would work,
          then the org's own account of its constraint as the quote it is. */}
      {refusal.why && <div className="wk-refuse-why">{refusal.why}</div>}
      <div className="wk-quote">{refusal.reason}</div>
      {!settled && (
        <div className="wk-acts">
          <button type="button" className="wk-btn wk-btn-p" onClick={onUnderstood}>
            Understood
          </button>
          <button
            type="button"
            className="wk-btn-i"
            aria-label="More on this refusal"
            onClick={(e) =>
              onOpenPeek(e.currentTarget, {
                kicker: "Why this cannot be staged here",
                width: 420,
                content: <div className="wk-prose">{refusal.detail}</div>,
              })
            }
          >
            i
          </button>
        </div>
      )}
    </div>
  );
}
