import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Portal } from "../Portal";
import { isTopmost, pushModal } from "../modalStack";
import { prefersReducedMotion } from "../../data/motion";
import { CLIENT_EMAIL, GOVERNANCE, HAVE } from "../../workroom/fixture";
import type { WorkroomEngine } from "../../workroom/engine";
import { addEntry, addressManifest, figuresFor, groupEntries, removeEntry } from "../../workroom/manifest";
import { vocabularyFor } from "../../workroom/modes";
import { stepperState } from "../../workroom/stepper";
import { EMPTY_FIT, fitThread, foldLabel, type FitBlock, type FitState } from "../../workroom/thread";
import type {
  DraftedReply,
  HaveRow,
  PackageMember,
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
  | { kind: "agent"; id: string; text: string }
  | { kind: "chips"; id: string; chips: ChipModel[] }
  | { kind: "challenge"; id: string; challenge: WorkroomChallenge; acked: boolean }
  | { kind: "reply"; id: string; reply: DraftedReply };

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
}: {
  context: WorkroomContext;
  /** The room talks to ONE interface and never to a script, a tool or a parser.
   *  Which implementation arrives is WorkroomHost's decision, not the shell's. */
  engine: WorkroomEngine;
  onClose: () => void;
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
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  /** The approval is in flight. A second click while the org is working would
   *  stage a second plan behind the first, and the token is single use. */
  const [filing, setFiling] = useState(false);
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
  }, [brief.loadSteps, engine, reduced]);

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
  const approvalOpen = phase === "work" && exhausted && openGates === 0 && entries.length > 0;

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

  const say = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      push({ kind: "banker", id: nextId("banker"), text: trimmed });

      // ONE DECISION PER VIEW (law 2). While a gate is open the room does not
      // take a new instruction; it says so rather than quietly queueing one.
      if (openGates > 0) {
        push({
          kind: "agent",
          id: nextId("agent"),
          text: "One decision at a time. The open cards above, or the approve button under the manifest, carry the next move.",
        });
        return;
      }

      // W2 — THE RAIL IS ADDRESSABLE IN THE CONVERSATION. "what is staged" and
      // "drop the rate change" are answered here, before the parser sees them:
      // they are moves on the manifest, not new amendments, and sending them to
      // a field parser would produce a chip nobody asked for.
      const address = addressManifest(trimmed, entries);
      if (address) {
        if (address.kind === "remove") {
          setEntries((prev) => removeEntry(prev, address.entry.id));
          setToast("Removed from the manifest");
          push({
            kind: "agent",
            id: nextId("agent"),
            text: `${address.entry.title} on ${address.entry.target} is out of the manifest. Say it again to put it back, with the figure you want.`,
          });
          return;
        }
        push({
          kind: "agent",
          id: nextId("agent"),
          text:
            address.kind === "list"
              ? address.entries.length
                ? `The manifest holds ${address.entries.length}: ${address.entries
                    .map((e) => `${e.title} on ${e.target}, ${e.before} to ${e.after}`)
                    .join("; ")}.`
                : "Nothing is staged yet. Confirmed changes land in the manifest, grouped."
              : address.reason,
        });
        return;
      }

      const result = await engine.parseIntent(trimmed, context);
      push({ kind: "agent", id: nextId("agent"), text: result.reply });
      if (result.kind === "deltas") {
        push({
          kind: "chips",
          id: nextId("chips"),
          chips: result.deltas.map((d) => ({ key: nextId("chip"), delta: d, state: "open" as ChipState })),
        });
      } else if (result.kind === "refusal") {
        push({
          kind: "chips",
          id: nextId("chips"),
          chips: [{ key: nextId("chip"), refusal: result.refusal, state: "open" as ChipState }],
        });
      }
      const next = engine.suggest();
      setSuggestion(next);
      if (!next) setExhausted(true);
    },
    [context, engine, entries, openGates, push],
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

  const confirmChip = useCallback(
    (blockId: string, chip: ChipModel, from: Element | null) => {
      const delta = chip.delta;
      if (!delta) {
        settleChip(blockId, chip.key, "confirmed");
        return;
      }
      flyToManifest(from, manifestCountRef.current, () => {
        setEntries((prev) => addEntry(prev, delta));
        settleChip(blockId, chip.key, "confirmed");
        setToast(delta.badge);
        // CHECKS COME TO YOU. The check a confirm trips arrives back in the
        // conversation the moment it becomes true, never in a separate tab.
        if (delta.challenge) {
          const challenge = delta.challenge;
          window.setTimeout(
            () => push({ kind: "challenge", id: nextId("check"), challenge, acked: false }),
            reduced ? 0 : 520,
          );
        }
      });
    },
    [push, reduced, settleChip],
  );

  const drop = useCallback(
    (deltaId: string) => {
      setEntries((prev) => removeEntry(prev, deltaId));
      setToast("Removed from the manifest");
    },
    [],
  );

  const acknowledge = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.kind === "challenge" && i.id === id ? { ...i, acked: true } : i)));
  }, []);

  const approve = useCallback(async () => {
    if (filing) return;
    setFiling(true);
    try {
      const staged = await engine.stagePlan(entries, context);
      if (!staged.decisionToken) {
        push({
          kind: "agent",
          id: nextId("agent"),
          text: "The staging call came back without a confirmation token, so there is nothing to redeem. Nothing was written.",
        });
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
      push({ kind: "reply", id: nextId("reply"), reply: result.reply ?? { subject: "", lede: "", body: "" } });
    } catch (e) {
      // A REAL ENGINE REFUSES OUT LOUD. The org's precondition, a moved figure,
      // a manifest that files nothing — each comes back as a sentence in the
      // conversation with the approval still where the banker left it, rather
      // than as a dead button or a silent rejection.
      push({ kind: "agent", id: nextId("agent"), text: e instanceof Error ? e.message : String(e) });
    } finally {
      setFiling(false);
    }
  }, [context, engine, entries, filing, push]);

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
    } else if (approvalOpen) {
      gateHint = vocabulary.approveHint;
    } else if (suggestion) {
      nextEnabled = true;
      onNext = () => void say(suggestion);
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
                <BrandGlyph className="wk-boot-glyph" />
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
                  <div className="wk-kicker">Product package</div>
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
              {brief.showsMembers && (
                <div className={`wk-mbar wk-rv ${assembled ? "wk-in" : ""}`} style={{ transitionDelay: "120ms" }}>
                  <div className="wk-mchips">
                    {brief.members.map((m) => (
                      <button
                        type="button"
                        key={m.key}
                        /* W4 — a member that is NOT booked renders dashed. Pre-work
                           display must never read as done work, and a stage the
                           read does not carry is treated the same way: unknown is
                           not booked. */
                        className={`wk-mchip ${m.proposed ? "wk-prop" : ""}`}
                        title={`${m.product} · ${m.tag}`}
                        onClick={(e) =>
                          openPeek(e.currentTarget, {
                            kicker: "Members of the package",
                            width: 760,
                            content: <MemberCards members={brief.members} />,
                          })
                        }
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
                    <div className="wk-posrow">
                      <div className="wk-kicker">Position</div>
                      <span className="wk-askpin tnum">{brief.askPin}</span>
                    </div>
                    <div className="wk-headline">{brief.position}</div>
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
                        <BrandGlyph />
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
                      onDiscard={settleChip}
                      onAcknowledge={acknowledge}
                    />
                  ))}
                </section>

                {phase === "work" && suggestion && openGates === 0 && (
                  <div className="wk-sugg">
                    <button type="button" className="wk-pill" onClick={() => void say(suggestion)}>
                      {suggestion}
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
                                    onClick={() => drop(delta.id)}
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
                      <button type="button" className="wk-approve" disabled={filing} onClick={() => void approve()}>
                        {filing ? "Working…" : vocabulary.approveLabel(fileable)}
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
}: {
  item: ThreadItem;
  clamp: FitState["clamped"];
  entries: WorkroomDelta[];
  filedWord: string;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
  onConfirm: (blockId: string, chip: ChipModel, from: Element | null) => void;
  onDiscard: (blockId: string, chipKey: string, state: ChipState) => void;
  onAcknowledge: (id: string) => void;
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
        </div>
      </div>
    );
  }

  if (item.kind === "chips") {
    return (
      <div className="wk-blk" data-block={item.id} data-live={live}>
        <div className="wk-chips">
          {item.chips.map((chip) => {
            if (chip.state === "discarded") return null;
            if (chip.refusal) {
              return (
                <RefusalChip
                  key={chip.key}
                  chip={chip}
                  onOpenPeek={onOpenPeek}
                  onUnderstood={() => onDiscard(item.id, chip.key, "confirmed")}
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
                onConfirm={(from) => onConfirm(item.id, chip, from)}
                onDiscard={() => onDiscard(item.id, chip.key, "discarded")}
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
