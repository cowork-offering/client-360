import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Portal } from "../Portal";
import { isTopmost, pushModal } from "../modalStack";
import { prefersReducedMotion } from "../../data/motion";
import { CLIENT_EMAIL, GOVERNANCE, HAVE } from "../../workroom/fixture";
import { readableError, type PackageChoice, type WorkroomEngine, type WorkroomSuggestion } from "../../workroom/engine";
import { addEntry, addressManifest, figuresFor, removeEntry } from "../../workroom/manifest";
import { vocabularyFor } from "../../workroom/modes";
import { stepperState } from "../../workroom/stepper";
import type {
  DraftedReply,
  HaveRow,
  PackageMember,
  StagedWorkroomPlan,
  WorkroomAdvisory,
  WorkroomChallenge,
  WorkroomContext,
  WorkroomDelta,
  WorkroomExecution,
  WorkroomRefusal,
} from "../../workroom/types";
import type { SourceChip } from "../../workroom/scripts";
import { BrandGlyph } from "../brand";
import { odoRoll } from "../Odometer";
import { Peek, usePeek } from "./Peek";
import { GooFilter, LiquidMark } from "./Liquid";
import { TypeIcon, iconForDelta, iconForMember, type IconKind } from "./TypeIcon";
import "../../styles/workroom.css";

/* =============================================================================
   THE WORKROOM — A GUIDED RITUAL.

   ONE shell, THREE modes. Everything mode-specific arrives through the engine
   (what the room read, what a line becomes, what a plan files) and the mode
   vocabulary (what the room calls things). Nothing in this file knows what a
   modification is, which is why renew and create are the same room.

   THE RITUAL (rule 30). The agent greets by name on the client, looks the
   package up behind a shimmer chip, and briefs what it found with the members
   as uniform rows. The composer and the suggestion sleep until the brief lands,
   because an input offered before the room has read anything invites a
   sentence the room cannot yet answer.

   ONE LIVE EXCHANGE (rule 31). Every send starts a STEP; the steps before it
   collapse behind an "earlier steps" chip. That, and not a fold model, is what
   keeps the room to one decision on screen — and it is why the thread is
   allowed to scroll as long as its scrollbar is never seen.

   EVERY DECISION LIVES IN THE CHAT (rule 38). The island is retired: a confirm
   puts a glass review chip in the thread, the chip pops the flow card open
   where it stands, execution runs inline, and the card MORPHS into the result
   dossier (rules 43 + 69). Nothing floats over the composer.

   THE ENGINES ARE UNTOUCHED. This file re-choreographs the room over the states
   and events they already emit; not one engine call, argument or return shape
   changed for this design.
   ============================================================================= */

/* ------------------------------------------------------------ thread model */

type ChipState = "open" | "confirmed" | "discarded";

interface ChipModel {
  key: string;
  delta?: WorkroomDelta;
  refusal?: WorkroomRefusal;
  state: ChipState;
}

/** The dossier the finale constructs, from the REAL manifest and the REAL
 *  execution result. Held as an item so it lands in the live exchange and the
 *  confirmation lands under it in the same step (rule 43). */
interface DossierModel {
  packageName: string;
  rows: Array<{ icon: IconKind; label: string; value: string }>;
  /** The card's own last line: the org's verification claim, not a slogan. */
  footer: string;
  /** The single-use token, said once, under the card. */
  tokenNote: string;
  /** What the filing did NOT do. A renewal is handed into the bank's own
   *  approval process and never booked by this room, and it says so here. */
  handoff?: string;
  handoffs?: Array<{ title: string; reason: string; closes?: string }>;
}

type ThreadItem = { id: string; step: number } & (
  | { kind: "banker"; text: string }
  | { kind: "agent"; text: string; options?: Array<{ label: string; say: string }> }
  /** The opening read: the greeting, the position, the ask it arrived on, and
   *  what the room read to say it. One bubble, because it is one sentence. */
  | { kind: "opening" }
  /** The package brief: the figures, and the members as uniform rows. */
  | { kind: "brief" }
  /** The packages to choose between, when the relationship carries more than
   *  one. Ineligible ones stay visible and disabled. */
  | { kind: "packages" }
  /** The lookup, running. */
  | { kind: "lookup" }
  /** THE ADVICE TRAVELS WITH THE CHIPS IT IS ABOUT. It is not a block of its
   *  own: an advisory that could collapse while the change it warns about
   *  stayed on screen would be worse than no advisory. */
  | { kind: "chips"; chips: ChipModel[]; advisories?: WorkroomAdvisory[] }
  | { kind: "challenge"; challenge: WorkroomChallenge; acked: boolean }
  | { kind: "reply"; reply: DraftedReply }
  /** THE ROOM REACHED NO ORG. Loud, in glass, with the way out of it. */
  | { kind: "notice"; title: string; body: string }
  | { kind: "dossier"; dossier: DossierModel }
);

/**
 * THE COMPOSED BEAT.
 *
 * An answer that snaps in the same frame as the question reads as a lookup; one
 * that arrives after a held beat of the brand glyph reads as a room composing an
 * answer. A FLOOR, NOT A DELAY: the room waits for the slower of the engine and
 * the beat, so a wired parse that takes two seconds is not made to take two and
 * a half. Under reduced motion the floor is zero and the answer is simply there.
 */
const COMPOSE_FLOOR_MS = 460;
/** How long the package lookup shimmers before the brief lands. */
const LOOKUP_MS = 1500;
/** The status line rotation under the execute mark. */
const STATUS_ROTATE_MS = 1500;
/** The dossier's construction beats (rule 69). */
const DOSSIER_HEADER_MS = 140;
const DOSSIER_LINE_MS = 280;
const DOSSIER_ROW_MS = 300;
const DOSSIER_FOOT_MS = 200;
const DOSSIER_CHECK_MS = 180;
/** ~5s after the card lands, the light breathes out over 1.4s. */
const HALO_LIFE_MS = 5600;
/** How many manifest chips the lane shows before the rest fold into a peek. */
const RAIL_VISIBLE = 6;
/** The word stagger of the agent's speech (rule 65). */
const WORD_STAGGER_MS = 26;

/** Omit that DISTRIBUTES over the union. A plain `Omit<ThreadItem, "step">`
 *  collapses the discriminated union to its common keys, which makes every
 *  `push` of an agent line an excess-property error. */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewItem = DistOmit<ThreadItem, "step">;

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/** A block is LIVE while something in it is still waiting on the banker. */
function isLive(item: ThreadItem): boolean {
  if (item.kind === "chips") return item.chips.some((c) => c.state === "open");
  if (item.kind === "challenge") return !item.acked;
  return false;
}

/** THE AGENT SPEAKS, NEVER PASTES (rule 65). Each word condenses out of the
 *  glass 26ms after the one before it. Whitespace stays as plain text nodes, so
 *  `textContent` is byte-identical to the sentence the engine handed over. */
function Words({ text, offset = 0 }: { text: string; offset?: number }) {
  const parts = useMemo(() => text.split(/(\s+)/).filter((p) => p !== ""), [text]);
  let n = offset - 1;
  return (
    <>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        n += 1;
        return (
          <span className="wk-w" style={{ animationDelay: `${n * WORD_STAGGER_MS}ms` }} key={i}>
            {part}
          </span>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------- the acknowledgment */

const ACKNOWLEDGMENT = /^(acknowledged|acknowledge|accepted|understood|noted|ack)\b[\s,.;:!\u2014-]*/i;

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

/** TRUE where the room never reached an org at all. THE CHANNEL-NONE DOCTRINE:
 *  no connector means no plan, nothing simulated, and no token ever burnt. This
 *  is the one failure that earns a surface of its own rather than a sentence in
 *  the flow of the conversation — a banker who cannot tell "not connected" from
 *  "something went wrong" will retry a room that can never answer. */
function neverReachedTheOrg(e: unknown): boolean {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if (code === "server_not_connected") return true;
  return /not connected to the bank's systems|no connector|no org to stage against/i.test(readableError(e));
}

/* ------------------------------------------------------------- peek bodies */

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

/* ================================================================= the room */

export function Workroom({
  context,
  engine,
  onClose,
  onAnchor,
  onExecuted,
}: {
  context: WorkroomContext;
  /** The room talks to ONE interface and never to a script, a tool or a parser.
   *  Which implementation arrives is WorkroomHost's decision, not the shell's. */
  engine: WorkroomEngine;
  onClose: () => void;
  /** The banker chose which package to work in. The room does not anchor
   *  itself: it is REOPENED on the chosen package, which rebuilds the engine and
   *  the manifest with it. */
  onAnchor?: (choice: PackageChoice) => void;
  /**
   * WRITE-BACK THROUGH THE GLASS (rule 62). The room hands the executed
   * commitment delta to the cockpit, which rolls its own figures behind the
   * blur while the room is still open. The room does NOT reach into the
   * cockpit's state itself: it has no provider above it in the render test, and
   * a room that dispatched would also rebuild its own engine mid-scene.
   */
  onExecuted?: (committedDeltaMM: number) => void;
}) {
  const brief = useMemo(() => engine.brief(context), [engine, context]);
  const vocabulary = useMemo(() => vocabularyFor(context), [context]);
  const reduced = prefersReducedMotion();
  /** Rule 44: the bar carries ONE word. The room's own name minus the noun the
   *  room already is; the app bar carries the brand. */
  const roomWord = vocabulary.title.replace(/\s*Workroom$/i, "");

  const roomRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<ThreadItem[]>([]);
  const [step, setStep] = useState(0);
  const [histOpen, setHistOpen] = useState(false);
  const [entries, setEntries] = useState<WorkroomDelta[]>([]);
  const [execution, setExecution] = useState<WorkroomExecution | null>(null);
  const [suggestion, setSuggestion] = useState<WorkroomSuggestion | null>(null);
  /** The brief has landed; the composer and the suggestion wake (rule 30). */
  const [awake, setAwake] = useState(false);
  const [phase, setPhase] = useState<"work" | "filed">("work");
  /** The member the conversation is standing on, so the lane can show it. */
  const [focused, setFocused] = useState<PackageMember | null>(null);
  /** The room is composing an answer. It drives the beat, and it holds the
   *  review chip closed: a chip that appeared for one frame between a confirm
   *  landing and the check it trips is an approval offered too early. */
  const [thinking, setThinking] = useState(false);
  /** The review card is open, and what it is holding. */
  const [flow, setFlow] = useState<null | { staging: StagedWorkroomPlan | null; running: boolean; status: number }>(null);
  /** The approval is in flight; a second click would stage behind the first. */
  const [filing, setFiling] = useState(false);
  /** THE APPROVAL IS CLOSED FOR THIS PLAN. The call reached the org and the
   *  answer did not come back clean, so the token may be spent and the write may
   *  have landed. The honest move is to stop offering the gesture and say why. */
  const [sealed, setSealed] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [railFolded, setRailFolded] = useState(0);
  /** The halo is execute's ONLY light, and it breathes out ~5s after landing. */
  const [lit, setLit] = useState(false);
  const { peek, openPeek, closePeek } = usePeek();

  /* ---- the page behind the room does not scroll while it is open. */
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

  /* ---- THE RITUAL OPENS. The agent greets, the lookup shimmers, the brief
          lands with the members under it, and only then does the room take an
          instruction. Under reduced motion the whole ritual is simply there. */
  useEffect(() => {
    const choosing = brief.packageChoices.length > 0;
    const opening: ThreadItem[] = [
      { kind: "opening", id: nextId("open"), step: 0 },
      { kind: "lookup", id: nextId("lookup"), step: 0 },
    ];
    setItems(opening);
    const land = () => {
      // THE LOOKUP ALWAYS COMES BACK WITH A CARD. A relationship carrying
      // several packages gets the choice; a book with one gets that one,
      // rendered SELECTED — the room says which package it is standing in
      // rather than silently assuming the only one it found.
      setItems((prev) => [
        ...prev.filter((i) => i.kind !== "lookup"),
        { kind: "packages" as const, id: nextId("pkgs"), step: 0 },
        ...(choosing ? [] : [{ kind: "brief" as const, id: nextId("brief"), step: 0 }]),
      ]);
      // A room still waiting for a package to be chosen has nothing to take an
      // instruction about, so the composer stays asleep through that beat.
      if (choosing) return;
      setAwake(true);
      setSuggestion(engine.suggest());
      // THE ROOM CLOSED; THE WORK DID NOT. Entries live in the engine, against
      // the package they were composed for, and the room says what it picked up
      // rather than presenting the lane as if it had always been there.
      const resumed = engine.resume();
      if (!resumed.length) return;
      const [one, many] = vocabulary.changeWord;
      setEntries(resumed);
      setItems((prev) => [
        ...prev,
        {
          kind: "agent",
          id: nextId("agent"),
          step: 0,
          text: `Picking up where you left off: ${resumed.length} ${resumed.length === 1 ? one : many} on the manifest.`,
        },
      ]);
    };
    if (reduced) {
      land();
      return;
    }
    const t = window.setTimeout(land, LOOKUP_MS);
    return () => clearTimeout(t);
  }, [brief.packageChoices.length, engine, reduced, vocabulary.changeWord]);

  /* ---- and the room hands the manifest back. Every landing and every removal,
          so a close at any moment loses nothing. Not once it has FILED. */
  useEffect(() => {
    if (phase !== "work") return;
    engine.hold(entries);
  }, [engine, entries, phase]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), reduced ? 200 : 2300);
    return () => clearTimeout(t);
  }, [toast, reduced]);

  /* ---- the thread follows the conversation down. */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, thinking, flow]);

  /* ---- derived state. Nothing below is stored twice. */
  const openGates = items.reduce((n, item) => (isLive(item) ? n + 1 : n), 0);
  const checksArrived = items.filter((i) => i.kind === "challenge").length;
  const checksAcked = items.filter((i) => i.kind === "challenge" && i.acked).length;
  /**
   * THE REVIEW IS OPEN WHEN THERE IS SOMETHING TO REVIEW and nothing is waiting
   * on the banker. It does not also require the suggestions to be SPENT: the
   * suggestions are an offer, never a gate, and a banker who confirmed the one
   * change they came in for must be able to file it.
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
  const steps = stepperState({
    conversationOpen: awake,
    landed: entries.length,
    composeTarget: brief.composeTarget,
    checksArrived,
    checksAcked,
    approvalOpen: approvalOpen || flow !== null,
    filed: phase === "filed",
  });
  const filedById = useMemo(() => new Map((execution?.filed ?? []).map((f) => [f.deltaId, f])), [execution]);

  /* ------------------------------------------------------------ the moves */

  const push = useCallback((item: NewItem) => {
    setItems((prev) => [...prev, { ...item, step: prev.length ? prev[prev.length - 1].step : 0 } as ThreadItem]);
  }, []);
  const agent = useCallback(
    (text: string, options?: Array<{ label: string; say: string }>) =>
      push({ kind: "agent", id: nextId("agent"), text, options }),
    [push],
  );

  /** Hold the composed beat, then let the answer settle in. Zero under reduced
   *  motion, so a test and a banker who asked for stillness get it on the same
   *  tick. */
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
   * The banker said something. EVERY SEND STARTS A STEP (rule 31).
   *
   * `heard` is what the engine parses; `said` is what the thread shows. They
   * differ for a suggestion pill, whose label is banker grammar and whose
   * instruction has to be precise enough to resolve one member out of six.
   */
  const say = useCallback(
    async (heard: string, said?: string, opts?: { settled?: boolean }) => {
      const trimmed = heard.trim();
      if (!trimmed || !awake) return;
      const mine = step + 1;
      setStep(mine);
      setHistOpen(false);
      setFlow(null);
      setItems((prev) => [...prev, { kind: "banker", id: nextId("banker"), step: mine, text: (said ?? heard).trim() }]);
      const answer = (item: NewItem) => setItems((prev) => [...prev, { ...item, step: mine } as ThreadItem]);

      // ONE DECISION PER VIEW. While a gate is open the room does not take a new
      // instruction; it says so rather than quietly queueing one. `settled` is
      // the one exception and it is not a loophole: taking an advisory's
      // resolution settles the cards it is about IN THE SAME GESTURE.
      //
      // A TYPED ACKNOWLEDGMENT IS THE SECOND. "acknowledged" is the same
      // decision the Acknowledge button makes, and where the only thing waiting
      // is a CHECK, the word settles it exactly as the button does.
      let instruction = trimmed;
      if (openGates > 0 && !opts?.settled) {
        const ack = readAcknowledgment(trimmed);
        const checks = items.filter((i) => i.kind === "challenge" && !i.acked);
        if (!ack || !checks.length || checks.length !== openGates) {
          answer({
            kind: "agent",
            id: nextId("agent"),
            text: "One decision at a time. The open cards above, or the review chip under them, carry the next move.",
          });
          return;
        }
        setItems((prev) => prev.map((i) => (i.kind === "challenge" && !i.acked ? { ...i, acked: true } : i)));
        if (!ack.rest) {
          answer({
            kind: "agent",
            id: nextId("agent"),
            text: `${checks.length === 1 ? "That check is" : `Those ${checks.length} checks are`} acknowledged. ${vocabulary.nextMove}`,
          });
          return;
        }
        instruction = ack.rest;
      }

      // THE LANE IS ADDRESSABLE IN THE CONVERSATION. "what is staged" and "drop
      // the rate change" are answered here, before the parser sees them: they
      // are moves on the manifest, not new amendments.
      const address = addressManifest(instruction, entries);
      if (address) {
        if (address.kind === "remove") {
          setEntries((prev) => removeEntry(prev, address.entry.id));
          setToast("Removed from the manifest");
          answer({
            kind: "agent",
            id: nextId("agent"),
            text: `${address.entry.title} on ${address.entry.target} is out of the manifest. Say it again to put it back, with the figure you want.`,
          });
          return;
        }
        answer({
          kind: "agent",
          id: nextId("agent"),
          text:
            address.kind === "list"
              ? address.entries.length
                ? `The manifest holds ${address.entries.length}: ${address.entries
                    .map((e) => `${e.title} on ${e.target}, ${e.before} to ${e.after}`)
                    .join("; ")}.`
                : "Nothing is staged yet. Confirmed changes land here, grouped."
              : address.reason,
        });
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
        // The reply and the chips it puts on the table land TOGETHER, in one
        // commit, so there is no frame in between where the room looks finished
        // and the chips have not arrived.
        const landed: ThreadItem[] = [
          {
            kind: "agent",
            id: nextId("agent"),
            step: mine,
            text: result.reply,
            // CLICKABLE ANSWERS ride BOTH reply kinds: an "unparsed" clarify and
            // a "deltas" reply that still ends on a closed-set question.
            options: result.kind === "unparsed" || result.kind === "deltas" ? result.options : undefined,
          },
        ];
        const chips: ChipModel[] =
          result.kind === "deltas"
            ? result.deltas.map((d) => ({ key: nextId("chip"), delta: d, state: "open" }))
            : result.kind === "refusal"
              ? [{ key: nextId("chip"), refusal: result.refusal, state: "open" }]
              : [];
        if (chips.length) {
          landed.push({
            kind: "chips",
            id: nextId("chips"),
            step: mine,
            chips,
            advisories: result.kind === "deltas" ? result.advisories : undefined,
          });
        }
        setItems((prev) => [...prev, ...landed]);
        setSuggestion(engine.suggest());
      } finally {
        setThinking(false);
      }
    },
    [awake, beat, context, engine, entries, items, openGates, step, vocabulary.nextMove],
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
      setFocused(member);
      if (!result) {
        fallback();
        return;
      }
      const mine = step + 1;
      setStep(mine);
      setHistOpen(false);
      setItems((prev) => [...prev, { kind: "banker", id: nextId("banker"), step: mine, text: member.key }]);
      const started = Date.now();
      setThinking(true);
      try {
        await beat(started);
        setItems((prev) => [...prev, { kind: "agent", id: nextId("agent"), step: mine, text: result.reply }]);
        setSuggestion(engine.suggest());
      } finally {
        setThinking(false);
      }
    },
    [beat, engine, step],
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
   * A confirm lands as ONE event: the entry, the receipt on the card, the
   * agent's answer and any check the new figures trip all arrive in a single
   * commit. One motion, one settle, and no frame in between where the review
   * chip could flicker on and off again.
   *
   * NOTHING FLIES INTO THE LANE (rule 40). The chip pops in place and the detail
   * card takes the new value inline with its "was" note; a puck travelling
   * across the room was the island's grammar and the island is retired.
   */
  const confirmChip = useCallback(
    (blockId: string, chipKey: string, delta: WorkroomDelta) => {
      const staged = addEntry(entries, delta);
      const { reply, challenge, options } = engine.acknowledge(delta, staged);
      setEntries(staged);
      settleChip(blockId, chipKey, "confirmed");
      setToast(delta.badge);
      setItems((prev) => {
        const mine = prev.length ? prev[prev.length - 1].step : 0;
        return [
          ...prev,
          { kind: "agent", id: nextId("agent"), step: mine, text: reply, options },
          // CHECKS COME TO YOU. The check a confirm trips arrives back in the
          // conversation the moment it becomes true, never in a separate tab.
          ...(challenge ? [{ kind: "challenge" as const, id: nextId("check"), step: mine, challenge, acked: false }] : []),
        ];
      });
      setSuggestion(engine.suggest());
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

  /* --------------------------------------------------------- the commit path

     THE FLOW CARD POPS OPEN IN THE THREAD (rule 38). Opening it STAGES: staging
     is zero-DML by contract, and it is the only way the card can show the org's
     real decision token rather than a decoration shaped like one. Execute
     redeems that token; Cancel drops the card and the review chip comes back. */

  const openFlow = useCallback(async () => {
    setFlow({ staging: null, running: false, status: 0 });
    try {
      const staged = await engine.stagePlan(entries, context);
      setFlow((f) => (f ? { ...f, staging: staged } : f));
    } catch (e) {
      setFlow(null);
      // NO CONNECTOR IS NOT A SENTENCE IN THE FLOW, it is the reason nothing can
      // happen. It gets a glass surface of its own and says what to do next, and
      // no token was ever burnt getting here.
      if (neverReachedTheOrg(e)) {
        push({
          kind: "notice",
          id: nextId("notice"),
          title: "This view is not connected to the bank's systems.",
          body: readableError(e),
        });
        return;
      }
      agent(readableError(e));
    }
  }, [agent, context, engine, entries, push]);

  const execute = useCallback(async () => {
    const staging = flow?.staging;
    if (!staging?.decisionToken || filing || sealed) return;
    setFiling(true);
    setFlow((f) => (f ? { ...f, running: true } : f));
    try {
      const result = await engine.execute({
        stagingId: staging.stagingId,
        planHash: staging.planHash,
        decisionToken: staging.decisionToken,
        approverUserId: context.approver,
      });

      // THE DOSSIER IS BUILT FROM THE REAL MANIFEST AND THE REAL RESULT, before
      // anything is cleared. Every row is a change that actually filed.
      const filed = new Map(result.filed.map((f) => [f.deltaId, f]));
      const dossier: DossierModel = {
        packageName: brief.packageName,
        rows: entries
          .filter((e) => filed.has(e.id))
          .map((e) => ({ icon: iconForDelta(e), label: `${e.target} · ${e.title.toLowerCase()}`, value: e.after })),
        // The card's last line is the ORG'S OWN verification claim where the
        // result carries one. It is never a slogan the room made up about a
        // write it cannot see.
        footer: result.filed[0]?.verification ?? result.tokenNote,
        tokenNote: result.tokenNote,
        handoff: result.handoff,
        handoffs: result.handoffs,
      };
      const committedDeltaMM = figures.committedMM - brief.baselineCommittedMM;

      setExecution(result);
      setPhase("filed");
      setFlow(null);
      setLit(true);
      // The change set is finished. Nothing is left to pick up on a reopen, and
      // the next room on this package starts on an empty lane.
      engine.release();
      setItems((prev) => {
        const mine = prev.length ? prev[prev.length - 1].step : 0;
        const tail: ThreadItem[] = [{ kind: "dossier", id: nextId("dossier"), step: mine, dossier }];
        if (result.reply) tail.push({ kind: "reply", id: nextId("reply"), step: mine, reply: result.reply });
        return [...prev, ...tail];
      });
      setToast(`${vocabulary.filedWord} · logged to the activity trail`);
      // WRITE-BACK THROUGH THE GLASS: the cockpit moves BEHIND the blur, while
      // the room is still open on the confirmation.
      if (committedDeltaMM) onExecuted?.(committedDeltaMM);
    } catch (e) {
      // A REAL ENGINE REFUSES OUT LOUD. The org's precondition, a moved figure,
      // a manifest that files nothing — each comes back as a sentence with the
      // approval still where the banker left it, rather than as a dead button.
      setFlow((f) => (f ? { ...f, running: false } : f));
      agent(readableError(e));
      // AND ONLY WHERE A RETRY IS HONEST. Once the call has reached the org the
      // token may be spent and the write may have landed, so the room stops
      // offering the gesture rather than arming a retry that would bounce on a
      // burnt single-use token and tell the banker nothing about what the org
      // did.
      if (reachedTheOrg(e)) {
        setSealed(true);
        agent("The filing may have completed despite the error. Do not approve again; check the staging record.");
      }
    } finally {
      setFiling(false);
    }
  }, [agent, brief.baselineCommittedMM, brief.packageName, context.approver, engine, entries, figures.committedMM, filing, flow, onExecuted, sealed, vocabulary.filedWord]);

  /* ---- the halo breathes out ~5s after the dossier lands (rule 69). */
  useEffect(() => {
    if (!lit || reduced) return;
    const t = window.setTimeout(() => setLit(false), HALO_LIFE_MS);
    return () => clearTimeout(t);
  }, [lit, reduced]);

  /* ---- the status line under the execute mark crossfades while it runs. */
  useEffect(() => {
    if (!flow?.running || reduced) return;
    const t = window.setInterval(
      () => setFlow((f) => (f && f.running ? { ...f, status: (f.status + 1) % brief.loadSteps.length } : f)),
      STATUS_ROTATE_MS,
    );
    return () => clearInterval(t);
  }, [flow?.running, reduced, brief.loadSteps.length]);

  /* ---- A PROPOSED VALUE ROLLS INTO THE LANE (rule 65.2). The detail card is
          the state (rule 40): a committed delta lands on it inline, with the old
          figure struck through beside it, and the figure ROLLS rather than
          swapping. The roll runs on the DOM the card just rendered, which is why
          it is an effect over the entry list and not a render-time decision. */
  const laneRows = useMemo(() => {
    if (!focused) return [];
    const hit = entries.filter((e) => e.member === focused.id || e.target === focused.key);
    const base: Array<{ label: string; value: string; was?: string }> = [
      { label: "Commitment", value: focused.amount },
    ];
    if (focused.available) base.push({ label: "Available", value: focused.available });
    for (const e of hit) {
      const row = base.find((r) => r.label.toLowerCase() === e.title.toLowerCase());
      if (row) {
        row.was = e.before;
        row.value = e.after;
      } else {
        base.push({ label: e.title, value: e.after, was: e.before });
      }
    }
    return base;
  }, [entries, focused]);

  const rolled = useRef(new Set<string>());
  useEffect(() => {
    const card = detailRef.current;
    if (!card) return;
    card.querySelectorAll<HTMLElement>("b[data-roll]").forEach((el) => {
      const key = `${el.dataset.rollKey}:${el.dataset.roll}`;
      if (rolled.current.has(key)) return;
      rolled.current.add(key);
      odoRoll(el, el.dataset.roll ?? "");
    });
  }, [laneRows]);

  /* ------------------------------------------------------------- render */

  const liveStep = items.length ? items[items.length - 1].step : 0;
  const grouped = useMemo(() => {
    const out: Array<{ step: number; items: ThreadItem[] }> = [];
    for (const item of items) {
      const last = out[out.length - 1];
      if (last && last.step === item.step) last.items.push(item);
      else out.push({ step: item.step, items: [item] });
    }
    return out;
  }, [items]);
  /* A STEP THAT STILL HOLDS A GATE IS NEVER COLLAPSED. Rule 31 collapses the
     steps behind the live exchange, and rule 2 says the room takes one decision
     at a time — so a room that refused a new instruction BECAUSE a card is open
     and then hid that card would have refused and hidden the reason in the same
     gesture. An open gate keeps its step on screen until it is settled. */
  const shows = (g: { step: number; items: ThreadItem[] }) => g.step === liveStep || g.items.some(isLive);
  const hidden = grouped.filter((g) => !shows(g));
  const railEntries = entries.slice(railFolded);

  /* The lane never grows past the room: past the visible cap the OLDEST fold
     into a peek and the count above always states the whole manifest. */
  useEffect(() => {
    setRailFolded(Math.max(0, entries.length - RAIL_VISIBLE));
  }, [entries.length]);

  /** The card a single-package book shows: the room's own anchor, stated. */
  const anchoredPackage = {
    id: context.productPackageId ?? "anchored",
    label: brief.packageName,
    figure: `${brief.baselineMembers} members · $${brief.baselineCommittedMM.toFixed(1)}MM committed · ${brief.covenantFigure} covenants`,
  };

  const openingItem = (
    <div className="wk-msg wk-agent" data-who="Agent" key="opening">
      <div className="wk-bub">
        {brief.askPin && <span className="wk-askpin tnum">{brief.askPin}</span>}
        {/* THE ROOM OPENS BY NAME. The greeting is a real read or it is absent;
            it is never a label, and it is never a record id. */}
        <div className="wk-headline">
          {/* The greeting is its own span so the room can be read as opening BY
              NAME, but the stagger runs straight through it: two <Words> that
              both start at zero would speak the position over the greeting. */}
          {brief.greeting && (
            <span className="wk-greet">
              <Words text={brief.greeting} />{" "}
            </span>
          )}
          <Words text={brief.position} offset={brief.greeting ? brief.greeting.trim().split(/\s+/).length : 0} />
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
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const membersItem = brief.showsMembers ? (
    <div className="wk-mchips" key="members">
      {brief.members.map((m) => (
        <button
          type="button"
          /* The org's loan id, because two members of one package legitimately
             share a product word and a label cannot tell them apart. */
          key={m.id}
          /* A member that is NOT booked renders dashed. Pre-work display must
             never read as done work, and unknown is not booked. */
          className={`wk-mchip ${m.proposed ? "wk-prop" : ""} ${focused?.id === m.id ? "wk-sel" : ""}`}
          title={`${m.product} · ${m.tag}`}
          /* THE STRIP IS THE WAY IN. Clicking a member starts the conversation
             on it; where the engine has no read behind the strip, the member
             detail opens instead. */
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
          <TypeIcon kind={iconForMember(m)} />
          <b>{m.key}</b>
          <span className="wk-amt tnum">{m.amount}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <Portal>
      <div className="wk-root">
        <GooFilter />
        <div className="wk-scrim" onClick={onClose} role="presentation" />
        <div
          ref={roomRef}
          className="wk-room eg-glass eg-glass-workroom"
          role="dialog"
          aria-modal="true"
          aria-label={vocabulary.title}
        >
          {/* ONE SLIM LINE (rule 44): the mark, one word, four dots, close. */}
          <header className="wk-head">
            <BrandGlyph />
            <span className="wk-title">{roomWord}</span>
            <span className="wk-spacer" />
            {/* A SCRIPTED room says so: nothing in it reaches a tool, and no
                plan it stages is the org's. A wired room shows no badge, which
                is the only honest way round — the absence of the word is a
                claim, so it is driven by the engine and not by the mode. */}
            {engine.scripted && <span className="wk-badge">Scripted</span>}
            <span className="wk-stepper" aria-label="Stage">
              {vocabulary.steps.map((label, i) => (
                <i
                  key={label}
                  className={`wk-stg ${steps.stages[i] === "on" ? "wk-on" : steps.stages[i] === "done" ? "wk-done" : ""}`}
                  title={i === 1 && steps.composeCount ? `${label} ${steps.composeCount}` : label}
                />
              ))}
            </span>
            <button type="button" className="wk-icobtn" onClick={onClose} aria-label="Close the workroom">
              ×
            </button>
          </header>

          {/* EARLIER STEPS. The live exchange is the room; everything before it
              collapses behind this chip, which floats clear of the thread's own
              58px of clearance (rule 39). */}
          {hidden.length > 0 && (
            <button type="button" className="wk-hist" onClick={() => setHistOpen((v) => !v)}>
              {histOpen ? `↓ hide earlier steps` : `↑ earlier steps (${hidden.length})`}
            </button>
          )}

          <div className="wk-body">
            <div className="wk-col-l">
              <section
                className={`wk-thread ${hidden.length ? "wk-hashist" : ""} ${histOpen ? "wk-masked" : ""}`}
                ref={threadRef}
              >
                {/* THE PAST COLLAPSES, IT DOES NOT UNMOUNT. A step behind the
                    live exchange keeps its place in the thread and is hidden,
                    so opening the history is a class change rather than a
                    re-render of everything the banker already read. */}
                {grouped.map((group) => (
                  <div
                    className={`wk-step ${shows(group) || histOpen ? "" : "wk-gone"}`}
                    key={`step-${group.step}-${group.items[0].id}`}
                  >
                    {group.items.map((item) => (
                      <ThreadBlock
                        key={item.id}
                        item={item}
                        entries={entries}
                        filedWord={vocabulary.filedWord}
                        opening={openingItem}
                        members={membersItem}
                        packages={brief.packageChoices}
                        anchored={anchoredPackage}
                        lit={lit}
                        onAnchor={onAnchor}
                        onOpenPeek={openPeek}
                        onConfirm={confirmChip}
                        onDiscard={settleOpenChip}
                        onAcknowledge={acknowledge}
                        onTakeAdvice={takeAdvice}
                        onOption={(sayText, label) => void say(sayText, label)}
                      />
                    ))}
                    {/* THE REVIEW CHIP, in the live exchange. It is the only way
                        to the plan and it never leaves the thread. */}
                    {group.step === liveStep && approvalOpen && !flow && (
                      <button type="button" className="wk-propose" onClick={() => void openFlow()}>
                        <TypeIcon kind="commit" />
                        <span>
                          {entries.length} {entries.length === 1 ? vocabulary.changeWord[0] : vocabulary.changeWord[1]} on
                          the manifest · <b>Review &amp; execute</b>
                        </span>
                      </button>
                    )}
                    {group.step === liveStep && flow && (
                      <FlowCard
                        flow={flow}
                        approver={context.approver}
                        loadSteps={brief.loadSteps}
                        packageName={brief.packageName}
                        planTitle={vocabulary.planTitle}
                        planSummary={figures.planSummary}
                        approveLabel={vocabulary.approveLabel(fileable)}
                        fileable={fileable}
                        handedOff={handedOff}
                        count={figures.count}
                        sealed={sealed}
                        filing={filing}
                        onCancel={() => setFlow(null)}
                        onExecute={() => void execute()}
                        onOpenPeek={openPeek}
                      />
                    )}
                  </div>
                ))}
                {/* THE ROOM IS COMPOSING. One beat, the app's own: the ">"
                    breathing inside the goo, and nothing else to read. */}
                {thinking && (
                  <div className="wk-compose" role="status" aria-label="Composing an answer">
                    <LiquidMark />
                    <span>Composing…</span>
                  </div>
                )}
              </section>

              {/* THE OFFER SLEEPS WITH THE COMPOSER (rule 30), and it is gone
                  entirely while a gate is open: a next move offered beside an
                  open card is a second decision on the table. */}
              <div className="wk-sugg">
                {awake && suggestion && openGates === 0 && !thinking && phase === "work" && (
                  <button
                    type="button"
                    className="wk-pill"
                    /* The pill a banker READS and the instruction the parser
                       HEARS are not the same sentence; the second one rides
                       here, where it is inspectable rather than implied. */
                    data-say={suggestion.say}
                    onClick={() => void say(suggestion.say, suggestion.label)}
                  >
                    {suggestion.label}
                  </button>
                )}
              </div>

              {/* The composer SLEEPS until the brief lands (rule 30). */}
              <div className="wk-composer eg-pill">
                <input
                  className="wk-txt"
                  value={draft}
                  disabled={!awake || phase === "filed"}
                  placeholder={
                    phase === "filed"
                      ? `${vocabulary.filedWord}. The workroom holds.`
                      : awake
                        ? "Say what changes on this package."
                        : "Reading the package…"
                  }
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
          </div>

          {/* ============================= THE RIGHT LANE: detail, then manifest */}
          <aside className="wk-col-r" aria-label={vocabulary.manifestHeading}>
            {/* THE PACKAGE'S LIVE FIGURES. They belong beside the manifest that
                moves them, not inside a briefing bubble that collapses with its
                step — a pro-forma total the banker cannot see while composing
                against it is a figure that may as well not have moved. */}
            <div className="wk-agg tnum">
              <div>
                <span className="wk-l">Members</span>
                <span className="wk-v">{figures.membersLabel}</span>
                <span className={`wk-n ${figures.membersNote ? "wk-pro" : ""}`}>{figures.membersNote}</span>
              </div>
              <div>
                <span className="wk-l">Committed</span>
                <span className="wk-v">{figures.committedLabel}</span>
                <span className={`wk-n ${figures.committedNote ? "wk-pro" : ""}`}>{figures.committedNote}</span>
              </div>
              <div>
                <span className="wk-l">Covenants</span>
                <span className="wk-v">{brief.covenantFigure}</span>
                <span className="wk-n">{figures.covenantNote}</span>
              </div>
            </div>

            {focused && laneRows.length > 0 && (
              <div className="wk-detail" ref={detailRef}>
                <div className="wk-dh">
                  <TypeIcon kind={iconForMember(focused)} />
                  <span>
                    {focused.key}
                    {laneRows.some((r) => r.was) ? " · proposed" : ""}
                  </span>
                </div>
                {laneRows.map((row) => (
                  <div className="wk-drow" key={row.label}>
                    <span>{row.label}</span>
                    {row.was ? (
                      <b data-roll={row.value} data-roll-key={row.label}>
                        {row.was}
                        <span className="wk-was">was {row.was}</span>
                      </b>
                    ) : (
                      <b>{row.value}</b>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="wk-man-h">
              <span className="wk-kicker">{vocabulary.manifestHeading}</span>
              <span className="wk-c">{figures.countLine}</span>
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

            {entries.length === 0 && <div className="wk-empty">{vocabulary.emptyLine}</div>}
            {railFolded > 0 && (
              <button
                type="button"
                className="wk-railfold"
                onClick={(e) =>
                  openPeek(e.currentTarget, {
                    kicker: `Everything in ${vocabulary.manifestHeading.toLowerCase()}`,
                    width: 460,
                    content: <ManifestList entries={entries} />,
                  })
                }
              >
                ↑ {railFolded} earlier in the manifest
              </button>
            )}
            <div className="wk-ents">
              {railEntries.map((delta) => {
                const filed = filedById.get(delta.id);
                return (
                  <div className={`wk-ent ${filed ? "wk-filed" : ""}`} key={delta.id}>
                    <TypeIcon kind={iconForDelta(delta)} />
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
                      <b>{delta.title}</b>
                      <span>
                        {delta.target} · {delta.before} → {delta.after}
                      </span>
                      {filed && (
                        <span className="wk-filedbar">
                          <span className="wk-st">{vocabulary.filedWord}</span>
                          <span className="wk-id">{filed.recordId}</span>
                        </span>
                      )}
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
                );
              })}
            </div>
          </aside>
        </div>

        {/* A GLASS WHISPER, never an ink slab (rule 70.1). */}
        <div className={`wk-toast ${toast ? "wk-show" : ""}`} role="status">
          {toast}
        </div>

        {peek && <Peek spec={peek} roomRef={roomRef} onClose={closePeek} />}
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------- the flow card

   Token + Cancel + ink Execute, IN THE THREAD (rule 38). While it runs it
   becomes the structured `.wk-flowload` (rule 42): the goo mark and the
   crossfading status on one line, full-width shimmer bars beneath, under the
   halo that is execute's only light. */

function FlowCard({
  flow,
  approver,
  loadSteps,
  packageName,
  planTitle,
  planSummary,
  approveLabel,
  fileable,
  handedOff,
  count,
  sealed,
  filing,
  onCancel,
  onExecute,
  onOpenPeek,
}: {
  flow: { staging: StagedWorkroomPlan | null; running: boolean; status: number };
  approver: string;
  loadSteps: string[];
  packageName: string;
  planTitle: string;
  planSummary: string;
  approveLabel: string;
  fileable: number;
  handedOff: number;
  count: number;
  sealed: boolean;
  filing: boolean;
  onCancel: () => void;
  onExecute: () => void;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
}) {
  if (flow.running) {
    return (
      <div className="wk-flowcard wk-flowload wk-lit">
        <span className="aura" aria-hidden="true" />
        <div className="wk-top">
          <LiquidMark />
          <div className="wk-lstat">
            {loadSteps.map((s, i) => (
              <span className={i === flow.status ? "wk-on" : ""} key={s}>
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="skel" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }
  return (
    <div className="wk-flowcard">
      <div className="wk-t">
        <TypeIcon kind="package" />
        <span>{planTitle}</span>
      </div>
      <div className="wk-s">
        {planSummary} on {packageName}
        {handedOff > 0 && (
          <>
            {" "}
            {fileable} of {count} {fileable === 1 ? "files" : "file"}; {handedOff} {handedOff === 1 ? "is" : "are"} handed
            off.
          </>
        )}
      </div>
      {/* The token and what governs it read together, ABOVE the controls. The
          action row holds actions only, and the ink Execute is the last thing
          in the card because it is the last thing that happens. */}
      <div className="wk-tokrow">
        <span className="wk-tok tnum">
          {flow.staging
            ? `decision token · single use · ${flow.staging.decisionToken?.slice(0, 4)}…${flow.staging.planHash.slice(-4)}`
            : "staging the plan…"}
        </span>
        <button
          type="button"
          className="wk-dt"
          onClick={(e) =>
            onOpenPeek(e.currentTarget, {
              kicker: "Governance",
              width: 420,
              content: (
                <div className="wk-prose">
                  Approver is the running identity: {approver}. {GOVERNANCE}
                </div>
              ),
            })
          }
        >
          Governance
        </button>
      </div>
      <div className="wk-acts">
        <button type="button" className="eg-btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="wk-approve eg-btn-ink"
          disabled={!flow.staging?.decisionToken || filing || sealed}
          onClick={onExecute}
        >
          {filing ? "Working…" : sealed ? "Approval closed" : approveLabel}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- thread blocks */

function ThreadBlock({
  item,
  entries,
  filedWord,
  opening,
  members,
  packages,
  anchored,
  lit,
  onAnchor,
  onOpenPeek,
  onConfirm,
  onDiscard,
  onAcknowledge,
  onTakeAdvice,
  onOption,
}: {
  item: ThreadItem;
  entries: WorkroomDelta[];
  filedWord: string;
  opening: ReactNode;
  members: ReactNode;
  packages: PackageChoice[];
  /** The package the room is already standing in, for the single-package card. */
  anchored: { id: string; label: string; figure: string };
  lit: boolean;
  onAnchor?: (choice: PackageChoice) => void;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
  onConfirm: (blockId: string, chipKey: string, delta: WorkroomDelta) => void;
  onDiscard: (blockId: string, chip: ChipModel) => void;
  onAcknowledge: (id: string) => void;
  onTakeAdvice: (blockId: string, advisory: WorkroomAdvisory) => void;
  onOption: (say: string, label: string) => void;
}) {
  if (item.kind === "opening") return <>{opening}</>;

  // THE BRIEF IS THE MEMBERS (rule 30 + rule 36). What the package carries is
  // stated once, on the card above; saying it again in a bubble would spend
  // law 3's budget restating the line the banker just read.
  if (item.kind === "brief") return <>{members}</>;

  if (item.kind === "lookup") {
    return (
      <div className="wk-loadchip" role="status" aria-label="Looking the package up">
        <LiquidMark />
        <span className="wk-bars" aria-hidden="true">
          <i />
          <i />
        </span>
      </div>
    );
  }

  if (item.kind === "packages") {
    // A book with ONE package still shows it, selected: which package the room
    // is anchored on is part of what the room read, not an assumption.
    const cards: PackageChoice[] = packages.length
      ? packages
      : [{ id: anchored.id, label: anchored.label, figure: anchored.figure, eligible: true }];
    const choosing = packages.length > 0;
    return (
      <div className="wk-pkgs">
        {cards.map((choice) => (
          <button
            type="button"
            key={choice.id}
            className={`wk-pkg ${choosing ? "" : "wk-sel"}`}
            disabled={!choice.eligible || !choosing}
            title={choice.eligible ? choice.figure : choice.reason}
            onClick={() => choosing && onAnchor?.(choice)}
          >
            <span>
              <b>{choice.label}</b>
              <span>{choice.eligible ? choice.figure : choice.reason}</span>
            </span>
            {choice.eligible && choosing && (
              <span className="wk-go" aria-hidden="true">
                →
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (item.kind === "notice") {
    return (
      <div className="wk-notice" role="alert">
        <TypeIcon kind="collateral" />
        <div>
          <div className="wk-nt">{item.title}</div>
          <div className="wk-nb">{item.body}</div>
        </div>
      </div>
    );
  }

  if (item.kind === "banker" || item.kind === "agent") {
    const who = item.kind === "banker" ? "You" : "Agent";
    return (
      <div className={`wk-msg wk-${item.kind}`} data-who={who}>
        <div className="wk-bub">
          {item.kind === "agent" ? <Words text={item.text} /> : item.text}
          {/* CLICKABLE ANSWERS. The org's own legal values, offered as chips a
              banker can tap instead of typing. A tap SAYS the value — it rides
              the same parser, the same staging and the same validation as a
              typed answer, so a chip can do nothing a sentence could not. */}
          {item.kind === "agent" && item.options && item.options.length > 0 && (
            <div className="wk-opts">
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
      <div className="wk-chips">
        {/* ADVICE COMES BEFORE THE DECISION, and it stops being advice once the
            decision is made. It is never a gate: the Confirm below is live
            whether it is read or not. */}
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
        {item.chips.map((chip) => {
          if (chip.state === "discarded") return null;
          if (chip.refusal) {
            return (
              <RefusalCard
                key={chip.key}
                chip={chip}
                onOpenPeek={onOpenPeek}
                onUnderstood={() => onDiscard(item.id, chip)}
              />
            );
          }
          const delta = chip.delta!;
          const inManifest = entries.some((e) => e.id === delta.id);
          return (
            <DeltaCard
              key={chip.key}
              delta={delta}
              confirmed={chip.state === "confirmed"}
              inManifest={inManifest}
              onOpenPeek={onOpenPeek}
              onConfirm={() => onConfirm(item.id, chip.key, delta)}
              onDiscard={() => onDiscard(item.id, chip)}
            />
          );
        })}
      </div>
    );
  }

  if (item.kind === "challenge") {
    return (
      <div className="wk-msg wk-agent" data-who="Agent">
        <div className="wk-bub">
          <div className="wk-vhead">
            <span className={`wk-vchip ${item.challenge.tone === "warn" ? "wk-warn" : ""}`}>{item.challenge.verdict}</span>
            <span className="wk-vk">{item.challenge.kicker}</span>
          </div>
          <div className="wk-vtxt">{item.challenge.line}</div>
          {/* WHY THIS CHECK MATTERS HERE. The figures above are what moved; this
              is the one sentence that says why they moved that way. */}
          {item.challenge.why && <div className="wk-vwhy">{item.challenge.why}</div>}
          <div className="wk-vact">
            {item.acked ? (
              <span className="wk-acked">
                <span className="wk-tick">✓</span>Acknowledged
              </span>
            ) : (
              <button type="button" className="eg-btn-ink" onClick={() => onAcknowledge(item.id)}>
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
    );
  }

  if (item.kind === "dossier") {
    const d = item.dossier;
    return (
      <>
        <Dossier dossier={d} lit={lit} />
        <div className="wk-tokline">
          <span className="wk-tick">✓</span>
          <span>{d.tokenNote}</span>
        </div>
        {d.handoff && <div className="wk-handoff">{d.handoff}</div>}
        {/* WHAT WAS NOT FILED, NAMED. The room stages the whole ask and files
            the part a tool covers; the rest leaves with the banker rather than
            disappearing. */}
        {(d.handoffs?.length ?? 0) > 0 && (
          <button
            type="button"
            className="wk-dt"
            style={{ alignSelf: "flex-start" }}
            onClick={(e) =>
              onOpenPeek(e.currentTarget, {
                kicker: "Handed off, not filed",
                width: 480,
                content: (
                  <HaveRows
                    rows={d.handoffs!.map((h) => ({
                      label: h.title,
                      value: "Not filed",
                      detail: [h.reason, h.closes].filter(Boolean).join(" "),
                    }))}
                  />
                ),
              })
            }
          >
            {d.handoffs!.length} handed off, not filed
          </button>
        )}
      </>
    );
  }

  return (
    <section className="wk-reply">
      <div className="wk-vhead">
        <span className="wk-vchip">Drafted reply</span>
        <span className="wk-vk">{filedWord} · composed 09:07</span>
      </div>
      <div className="wk-subj">{item.reply.subject}</div>
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
                  <div className="wk-replybody">{item.reply.body}</div>
                </>
              ),
            })
          }
        >
          Read it
        </button>
        <span className="wk-lede" style={{ marginLeft: "auto" }}>
          Draft only. Nothing leaves the workroom.
        </span>
      </div>
    </section>
  );
}

/* THE RESULT DOSSIER (rule 69). The card CONSTRUCTS itself: the header lands, a
   hairline draws across, each real change row materialises ~300ms apart, a
   second hairline, then the check pops last. The halo behind it is execute's
   only light and it breathes out on its own. */
function Dossier({ dossier, lit }: { dossier: DossierModel; lit: boolean }) {
  let t = DOSSIER_HEADER_MS;
  const header = t;
  t += DOSSIER_LINE_MS;
  const firstLine = t;
  t += 220;
  const rows = dossier.rows.map((row) => {
    const at = t;
    t += DOSSIER_ROW_MS;
    return { ...row, at };
  });
  const secondLine = t;
  t += DOSSIER_FOOT_MS;
  const foot = t;

  return (
    <div className={`wk-rescard ${lit ? "wk-lit" : ""}`}>
      <span className="aura" aria-hidden="true" />
      <div className="rc-h" style={{ animationDelay: `${header}ms` }}>
        <TypeIcon kind="package" />
        <b>{dossier.packageName}</b>
      </div>
      <div className="rc-line" style={{ animationDelay: `${firstLine}ms` }} />
      {rows.map((row) => (
        <div className="rc-r" style={{ animationDelay: `${row.at}ms` }} key={row.label}>
          <TypeIcon kind={row.icon} />
          <span>{row.label}</span>
          <b>{row.value}</b>
        </div>
      ))}
      <div className="rc-line" style={{ animationDelay: `${secondLine}ms` }} />
      <div className="rc-f" style={{ animationDelay: `${foot}ms` }}>
        <span className="ok" style={{ animationDelay: `${foot + DOSSIER_CHECK_MS}ms` }}>
          ✓
        </span>
        {dossier.footer}
      </div>
    </div>
  );
}

function DeltaCard({
  delta,
  confirmed,
  inManifest,
  onOpenPeek,
  onConfirm,
  onDiscard,
}: {
  delta: WorkroomDelta;
  confirmed: boolean;
  inManifest: boolean;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className={`wk-chip tnum ${confirmed ? "wk-confirmed" : ""}`}>
      <div className="wk-dl">
        <TypeIcon kind={iconForDelta(delta)} />
        <span className={`wk-kind ${delta.kindTone ? `wk-${delta.kindTone}` : ""}`}>{delta.kind}</span>
        <span className="wk-tgt">{delta.target}</span>
      </div>
      <div className="wk-line">
        <span className="wk-fld">{delta.title}</span>
        <span className="wk-was">{delta.before}</span>
        <span className="wk-arw">→</span>
        <span className="wk-now">{delta.after}</span>
      </div>
      {confirmed ? (
        <div className={`wk-receipt ${inManifest ? "" : "wk-removed"}`}>
          <span className="wk-tick">✓</span>
          <span className="wk-what">{inManifest ? "in the manifest" : "removed · say it again to restage"}</span>
        </div>
      ) : (
        <div className="wk-acts">
          <button type="button" className="eg-btn-ink" onClick={onConfirm}>
            Confirm
          </button>
          <button type="button" className="eg-btn-quiet" onClick={onDiscard}>
            Discard
          </button>
          <button
            type="button"
            className="wk-dt"
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
      )}
    </div>
  );
}

function RefusalCard({
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
      <div className="wk-dl">
        <TypeIcon kind="covenant" />
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
          <button type="button" className="eg-btn-ink" onClick={onUnderstood}>
            Understood
          </button>
          <button
            type="button"
            className="wk-dt"
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
