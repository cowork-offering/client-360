import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Portal } from "../Portal";
import { isTopmost, pushModal } from "../modalStack";
import { prefersReducedMotion } from "../../data/motion";
import { fmtMoney } from "../../data/format";
import { isActiveFacility } from "../../data/worklist";
import { classifyCovenant } from "../../domain/covenantStatus";
import { resolveBundle } from "../../actions/registry";
import { useApp } from "../../state/appState";
import type { StagedCovenant, StagedOutput } from "../../actions/stagedPlan";
import type { C360Data } from "../../data/contract";
import { BrandGlyph } from "../brand";
import { Peek, usePeek } from "../workroom/Peek";
import { GooFilter, LiquidMark } from "../workroom/Liquid";
import { TypeIcon, type IconKind } from "../workroom/TypeIcon";
import { ReadCard } from "../workroom/ReadCardView";
import { isQuestion, readTopic } from "../workroom/ask";
import { buildReadCard, readGap, type ReadCardModel, type ReadSource } from "../workroom/readCard";
import { toReadCardModel } from "../workroom/brainRoute";
import {
  TIER_STAGGER_MS,
  summonLabel,
  tierAttrs,
  useEntryChoreography,
  type EntryTier,
} from "../workroom/entryChoreography";
import type { BrainEnvelope, BrainReply, BrainTurn } from "../../channel/brainLane";
import { UNREADABLE_CLARIFY, askBrain, brainReachable, isDegrade } from "../../channel/brainLane";
import { REL_ROUTE_WORDS, buildRelEnvelope } from "./relBrain";
import { stepperState } from "../../workroom/stepper";
import {
  FACILITY_HANDOFF,
  NEUTRAL_QUESTION,
  REL_ROUTE_CHIPS,
  REL_ROUTE_WORD,
  SOMETHING_ELSE,
  asksForFacilityWork,
  readRelRouteIntent,
  readRelRouteSwitch,
  relOpeningFor,
  type RelOpening,
  type RelRoute,
} from "./relRoute";
import {
  CREATE_GAPS,
  NO_CONNECTOR,
  OVERRIDE_NOT_FILEABLE,
  REL_FLOWS,
  RelFlowError,
  SKIPPED,
  asksForOverride,
  covenantLabel,
  defaultRelDeps,
  dossierFooter,
  dossierHandoff,
  dossierRowsFor,
  executeRelPlan,
  nextStep,
  readCreateAsk,
  relContextFor,
  reviewableCovenants,
  routeAvailability,
  stageRelPlan,
  valuableCollateral,
  type Answers,
  type CreateGap,
  type DossierRow,
  type RelContext,
  type RelFlowSpec,
  type RelFlowDeps,
  type RelStep,
  type StagedRelPlan,
} from "./reviewFlows";
import {
  bindRelRoute,
  closeRelationshipRoom,
  restartRelRoute,
  useRelationshipRoom,
} from "./relSession";
import { newRequestId } from "../../channel/adapter";
import "../../styles/workroom.css";
import "../../styles/relationship.css";

/* =============================================================================
   THE RELATIONSHIP ACTIONS ROOM — A GOVERNANCE RITUAL.

   ONE shell, FIVE routes. The second unified room, built on the Facility room's
   visual language 1:1 — the same bubbles, the same option pills, the same
   wk-in arrivals, the same identity chips, the same flow card, the same goo
   loader, the same result dossier under the same halo, the same glass recipe.
   Nothing in the material was reinvented, which is the whole point: a banker
   who has learned one room has learned both.

   WHAT DIFFERS IS THE REGISTER (founder, 2026-08-31: "more steered in
   professional"). The facility room is a conversation about a deal; this one is
   a GOVERNANCE ritual, so it is more formal and more led:

     - every route opens with a STRUCTURED BRIEF — what the review covers, then
       what it produces — before it asks anything. A review states its scope
       before it takes an instruction.
     - the questions are STEPS, numbered and asked one at a time, each carrying
       the org's own legal values as chips.
     - free text still binds. A banker who types the answer answers the step;
       a banker who names a different review moves the room; a banker who asks
       for facility work is told where it lives, in one line.

   THE FLOWS ARE UNTOUCHED. Every route drives the SAME `stage_*`/`execute_*`
   pair the Action Panel drives today, through `reviewFlows.ts`, with the same
   payload shape and the same token discipline. The ActionPanel machinery still
   ships and still works; this room re-clothes the same five flows.

   THE CHANNEL-NONE DOCTRINE HOLDS THROUGHOUT. No connector means no plan,
   nothing simulated, and no token ever burnt. It gets a surface of its own.
   ============================================================================= */

/* ------------------------------------------------------------- thread model */

interface DossierModel {
  title: string;
  rows: DossierRow[];
  footer: string;
  tokenNote: string;
  handoff?: string;
}

interface Opt {
  label: string;
  /** What the parser hears. A chip does nothing a typed line could not. */
  say: string;
  detail?: string;
}

type RelItem = { id: string; step: number } & (
  /** The opening read: the greeting, the position or the first question. */
  | { kind: "opening" }
  /** The relationship lookup, running. */
  | { kind: "lookup" }
  /** The route's structured brief: what it covers, what it produces. */
  | { kind: "brief" }
  | { kind: "banker"; text: string }
  | {
      kind: "agent";
      text: string;
      /** "Step 2 of 6", above the question. The ritual is numbered. */
      kicker?: string;
      options?: Opt[];
      /** The explicit restart offered when a cross-route line lands on a
       *  session that has already collected answers. Never a silent swap. */
      restart?: { route: RelRoute; label: string; say: string };
    }
  /** THE ROOM REACHED NO ORG. Loud, in glass, with the way out of it. */
  | { kind: "notice"; title: string; body: string }
  /** A create this room can compose and cannot file, with the gap named. */
  | { kind: "gap"; gap: CreateGap }
  /** A READ QUESTION, ANSWERED. Not a step and not a gate: nothing on it is
   *  waiting for a decision, and it does not advance the review. */
  | { kind: "read"; card: ReadCardModel }
  | { kind: "dossier"; dossier: DossierModel }
);

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewRelItem = DistOmit<RelItem, "step">;

/**
 * WHICH ENTRY TIER A THREAD ITEM BELONGS TO (the entry choreography).
 *
 * One grammar with the facility room, in this room's own nouns: the question,
 * then the review's scope as the identity the ritual runs against, then the
 * first collected question as the thing being decided on. `detailId` names the
 * ONE agent bubble that is a tier; every later step is an exchange.
 */
function relTierOf(item: RelItem, detailId: string | null): EntryTier | null {
  if (item.kind === "opening") return "question";
  if (item.kind === "brief") return "identity";
  if (item.kind === "agent" && item.id === detailId) return "detail";
  return null;
}

/** The composed beat. A floor, not a delay: the room waits for the slower of
 *  the flow and the beat. Zero under reduced motion. */
const COMPOSE_FLOOR_MS = 460;
const LOOKUP_MS = 1500;
const STATUS_ROTATE_MS = 1500;
const DOSSIER_HEADER_MS = 140;
const DOSSIER_LINE_MS = 280;
const DOSSIER_ROW_MS = 300;
const DOSSIER_FOOT_MS = 200;
const DOSSIER_CHECK_MS = 180;
const HALO_LIFE_MS = 5600;
const WORD_STAGGER_MS = 26;
/** How many collected answers the lane shows before the rest fold away. */
const LANE_VISIBLE = 8;

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/** The chip a banker taps to leave an optional step unanswered. */
const SKIP_LABEL = "Not assessed";

export interface RelRouteChoice {
  label: string;
  route: RelRoute | null;
  covenantId?: string | null;
  /** The staged data cannot support this review. The chip STAYS, disabled,
   *  carrying the registry's own reason verbatim (A27.3): hiding it would take
   *  the map of what exists away from the banker. */
  disabled?: boolean;
  reason?: string;
}

export interface RelRouterQuestion {
  line: string;
  chips: RelRouteChoice[];
}

/**
 * The neutral five-way. NO DATA SIGNAL OPENS ON THIS, never on a fabricated
 * suggestion — the channel-none doctrine, applied to the greeting slot.
 *
 * `data` and `accountId` are optional so a render test can build the question
 * without a snapshot; without them every route reads as available, which is the
 * shell's own default and never a claim about an org.
 */
export function neutralRelAsk(args?: { data: C360Data; accountId: string | null }): RelRouterQuestion {
  return {
    line: NEUTRAL_QUESTION,
    chips: REL_ROUTE_CHIPS.map((c) => {
      if (!args) return { label: c.label, route: c.route };
      const availability = routeAvailability(c.route, args.data, args.accountId);
      return {
        label: c.label,
        route: c.route,
        disabled: !availability.available,
        reason: availability.reason,
      };
    }),
  };
}

/** The question a governance signal opens on: the fact the read carries, the
 *  yes it implies, and the way out of it. */
export function smartRelAsk(opening: RelOpening): RelRouterQuestion {
  return {
    line: opening.line,
    chips: [
      { label: opening.yesLabel, route: opening.route, covenantId: opening.covenantId },
      { label: SOMETHING_ELSE, route: null },
    ],
  };
}

export interface RelRouter {
  question: RelRouterQuestion | null;
  say: string | null;
  preselectCovenantId?: string | null;
  /** The five-way "Something else" falls through to. It is the CALLER's, not
   *  the room's, because only the caller can see the snapshot that says which
   *  of the five the staged data can support. */
  neutral: () => RelRouterQuestion;
  onBind: (route: RelRoute, opts?: { say?: string; covenantId?: string | null }) => void;
  onRestart: (route: RelRoute, say: string) => void;
}

/** THE AGENT SPEAKS, NEVER PASTES (rule 65). Each word condenses out of the
 *  glass 26ms after the one before it. Whitespace stays as plain text nodes, so
 *  `textContent` is byte-identical to the sentence handed over. */
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

/** TRUE where the room never reached an org at all. The one failure that earns
 *  a surface of its own: a banker who cannot tell "not connected" from
 *  "something went wrong" will retry a room that can never answer. */
function neverReachedTheOrg(e: unknown): boolean {
  return e instanceof RelFlowError && e.code === "server_not_connected";
}

function readableError(e: unknown): string {
  if (e instanceof RelFlowError) return e.message;
  if (e instanceof Error) return e.message;
  return "The review could not be completed.";
}

/* ------------------------------------------------------ what the room reads */

interface RelBrief {
  greeting: string;
  /** The position, once a route is bound. */
  position: string;
  committed: string;
  covenantCount: string;
  grade: string;
  /** The scope rows behind the Why peek: what the room read to say it. */
  why: Array<{ label: string; detail: string }>;
}

function briefFor(ctx: RelContext): RelBrief {
  const facilities = (ctx.bundle?.exposure?.facilities ?? []).filter(isActiveFacility);
  const committed = ctx.bundle?.exposure?.totalCommitted;
  const covenants = ctx.bundle?.covenants?.covenants ?? [];
  const breaches = covenants.filter((c) => classifyCovenant(c).financialBreach).length;
  const grade = ctx.bundle?.snapshot?.primaryRiskRating;
  return {
    // A LEGAL NAME OFTEN ENDS IN A PERIOD ("Sterling Fabrication Co."), and the
    // greeting must not put a second one after it.
    greeting: `Relationship Actions on ${ctx.accountName}`.replace(/\.?$/, "."),
    position: `${facilities.length} active ${facilities.length === 1 ? "facility" : "facilities"}, ${covenants.length} ${
      covenants.length === 1 ? "covenant" : "covenants"
    }${breaches ? `, ${breaches} in breach` : ""}.`,
    committed: typeof committed === "number" ? fmtMoney(committed) : "not read",
    covenantCount: String(covenants.length),
    grade: grade != null ? String(grade) : "not read",
    why: [
      {
        label: "Facilities",
        detail: `${facilities.length} active on the relationship, read from the exposure the cockpit staged.`,
      },
      {
        label: "Covenants",
        detail: covenants.length
          ? `${covenants.length} recorded${breaches ? `, ${breaches} carrying a financial breach in the org's own words` : ", none in financial breach"}.`
          : "None recorded for this relationship.",
      },
      {
        label: "Package anchor",
        detail: ctx.productPackageId
          ? `The covenant review and the valuation are anchored on ${ctx.productPackageId}.`
          : "The read stages no product package, so the two package-anchored reviews have nothing to stage against.",
      },
      {
        label: "As of",
        detail: ctx.asOf ? `${ctx.asOf}, the snapshot's own clock. Nothing here reaches a live clock.` : "The read stages no clock.",
      },
    ],
  };
}

/** How many steps the route expects, so the spine can count. Derived from the
 *  same machine that asks them, never a second table that would drift. */
function plannedStepCount(route: RelRoute, ctx: RelContext, answers: Answers): number {
  let n = Object.keys(answers).length;
  const probe: Answers = { ...answers };
  // Walk the machine forward on a COPY, answering each step with a sentinel, to
  // count what is still to come. Bounded hard: a machine that never settles is
  // a bug, and a count is not worth hanging the room for.
  for (let guard = 0; guard < 64; guard++) {
    const step = nextStep(route, ctx, probe);
    if (!step) break;
    n += 1;
    assign(probe, step.key, step.kind === "multi" ? [] : SKIPPED);
  }
  return Math.max(n, 1);
}

/** Write an answer, honouring the `group.id` key form the per-record steps use. */
function assign(answers: Answers, key: string, value: unknown): void {
  const dot = key.indexOf(".");
  if (dot === -1) {
    answers[key] = value;
    return;
  }
  const group = key.slice(0, dot);
  const id = key.slice(dot + 1);
  const held = answers[group];
  const next = held && typeof held === "object" && !Array.isArray(held) ? { ...(held as Record<string, unknown>) } : {};
  next[id] = value;
  answers[group] = next;
}

/** The lane rows: everything collected, in the order it was collected. */
interface LaneRow {
  key: string;
  icon: IconKind;
  label: string;
  value: string;
}

function laneRowsFor(route: RelRoute, ctx: RelContext, answers: Answers, order: string[]): LaneRow[] {
  const covenants = reviewableCovenants(ctx);
  const assets = valuableCollateral(ctx);
  const rows: LaneRow[] = [];
  for (const key of order) {
    const dot = key.indexOf(".");
    const group = dot === -1 ? key : key.slice(0, dot);
    const id = dot === -1 ? null : key.slice(dot + 1);
    const held = dot === -1 ? answers[key] : (answers[group] as Record<string, unknown> | undefined)?.[id!];
    if (held === undefined) continue;
    const value = Array.isArray(held)
      ? held.length
        ? `${held.length} selected`
        : "none"
      : held === SKIPPED
        ? "not assessed"
        : String(held);
    const named = id
      ? (covenants.find((c) => c.covenantId === id) && covenantLabel(covenants.find((c) => c.covenantId === id)!)) ||
        assets.find((c) => c.collateralId === id)?.collateralDescription ||
        assets.find((c) => c.collateralId === id)?.collateralName ||
        id
      : null;
    rows.push({
      key,
      icon: iconForAnswer(route, group),
      label: named ? `${LANE_LABELS[group] ?? group} · ${named}` : (LANE_LABELS[key] ?? LANE_LABELS[group] ?? key),
      value,
    });
  }
  return rows;
}

/** The banker-facing word for each answer, in the ONE icon language's register. */
const LANE_LABELS: Record<string, string> = {
  reviewType: "Review type",
  relationshipSummary: "Position",
  recommendation: "Recommendation",
  covenants: "Covenants",
  covenantStatuses: "Assessment",
  covenantObservedValues: "Observed",
  covenantReasons: "Reason",
  assessmentNarrative: "Basis",
  records: "Collateral",
  recordValues: "Value",
  valuationDate: "Valuation date",
  type: "Basis",
  source: "Source",
  cashFlowCoverage: "Cash-flow coverage",
  revenueGrowth: "Revenue growth",
  managementExperience: "Management experience",
  creditScore: "Credit score",
  overrideComment: "Rationale",
  origin: "Origin",
  subject: "Subject",
  detail: "Detail",
};

function iconForAnswer(route: RelRoute, group: string): IconKind {
  if (group.startsWith("covenant")) return "covenant";
  if (group === "records" || group === "recordValues") return "collateral";
  if (group === "valuationDate" || group === "detail") return "maturity";
  if (group === "type" || group === "source") return "pricing";
  if (route === "rating") return "pricing";
  return REL_FLOWS[route].icon;
}

/* =============================================================================
   THE ROOM
   ============================================================================= */

export function RelationshipRoom({
  ctx,
  route,
  router,
  onClose,
  brain,
  deps = defaultRelDeps,
}: {
  ctx: RelContext;
  /** Null while the room is still asking which review this is. */
  route: RelRoute | null;
  router?: RelRouter;
  onClose: () => void;
  /**
   * THE SECOND LANE, IN THIS ROOM TOO.
   *
   * The step machine is the fast lane and it is untouched: a line it can read
   * as the answer to the live step is recorded exactly as it always was. What
   * routes here is what it cannot claim — a question, and a line the step
   * refuses. ABSENT IS NO BRAIN LANE, and the room then behaves exactly as it
   * did before this lane existed: the same re-ask, the same refusals, no wait.
   */
  brain?: (envelope: BrainEnvelope) => Promise<BrainReply>;
  deps?: RelFlowDeps;
}) {
  const reduced = prefersReducedMotion();
  const brief = useMemo(() => briefFor(ctx), [ctx]);
  const flowSpec = route ? REL_FLOWS[route] : null;

  const [ask, setAsk] = useState<RelRouterQuestion | null>(() => router?.question ?? null);
  const [items, setItems] = useState<RelItem[]>([]);
  const [step, setStep] = useState(0);
  const [histOpen, setHistOpen] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  /** The order the answers were collected in, so the lane reads as a ledger. */
  const [order, setOrder] = useState<string[]>([]);
  const [awake, setAwake] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [phase, setPhase] = useState<"work" | "filed">("work");
  const [flow, setFlow] = useState<null | { staging: StagedRelPlan | null; running: boolean; status: number }>(null);
  const [filing, setFiling] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [lit, setLit] = useState(false);
  /* THE ENTRY CHOREOGRAPHY, IN THIS ROOM'S VOCABULARY (founder, 2026-09-01).
     One grammar, both rooms: question, then the identity the action runs
     against, then the thing being decided on. Here the identity is the review's
     own scope brief and the detail is the first collected question, because
     that is what this room's tiers ARE. */
  const choreo = useEntryChoreography(reduced);
  const { arrive: tierArrived } = choreo;
  const { peek, openPeek, closePeek } = usePeek();

  const roomRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router;
  /** The idempotency key this staging carries. A new key is minted only when
   *  the answers change under a staged plan, never on a second look. */
  const keyRef = useRef<string>(deps.newKey());
  const stagedAnswersRef = useRef<string | null>(null);

  /** Rule 44: the bar carries ONE word. An UNBOUND room has no review to name
   *  yet, and naming one would be a claim about a decision nobody has made. */
  const title = flowSpec ? flowSpec.word : "Relationship Actions";
  const laneHeading = flowSpec ? "This review" : "This relationship";

  /* ---- the page behind the room does not scroll while it is open. */
  useEffect(() => {
    document.body.classList.add("wk-open");
    return () => document.body.classList.remove("wk-open");
  }, []);

  useEffect(() => pushModal("relationship-room"), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isTopmost("relationship-room")) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  /* ---- THE RITUAL OPENS. The agent greets on the relationship, the lookup
          shimmers, and the room states its position. Under reduced motion the
          whole ritual is simply there. */
  useEffect(() => {
    setItems([
      { kind: "opening", id: nextId("open"), step: 0 },
      { kind: "lookup", id: nextId("lookup"), step: 0 },
    ]);
    tierArrived("question");
    /* THE LOOKUP LANDS ON THE POSITION, and nothing else. The route's brief is
       pushed by the BIND effect below, which owns it whether the route was bound
       before the room opened or chosen inside it. Landing one here as well put
       two identical briefs in the thread on every already-bound open. */
    const land = () => {
      setItems((prev) => prev.filter((i) => i.kind !== "lookup"));
      setAwake(true);
    };
    if (reduced) {
      land();
      return;
    }
    const t = window.setTimeout(land, LOOKUP_MS);
    return () => clearTimeout(t);
  }, [reduced, tierArrived]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), reduced ? 200 : 2300);
    return () => clearTimeout(t);
  }, [toast, reduced]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, thinking, flow]);

  /* ---- derived. Nothing below is stored twice. */
  const live = useMemo(() => (route ? nextStep(route, ctx, answers) : null), [route, ctx, answers]);
  const ready = !!route && !live;
  const approvalOpen = phase === "work" && !thinking && ready;
  const laneRows = useMemo(
    () => (route ? laneRowsFor(route, ctx, answers, order) : []),
    [route, ctx, answers, order],
  );
  const planned = useMemo(() => (route ? plannedStepCount(route, ctx, answers) : 1), [route, ctx, answers]);
  const steps = stepperState({
    conversationOpen: awake,
    landed: order.length,
    composeTarget: planned,
    checksArrived: 0,
    checksAcked: 0,
    approvalOpen: approvalOpen || flow !== null,
    filed: phase === "filed",
  });

  /* ------------------------------------------------------------- the moves */

  const push = useCallback((item: NewRelItem) => {
    setItems((prev) => [...prev, { ...item, step: prev.length ? prev[prev.length - 1].step : 0 } as RelItem]);
  }, []);

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

  /* ---- THE BRIEF LANDS WHEN THE ROUTE BINDS, before the first question. A
          governance ritual states its scope before it asks anything. */
  const briefedRef = useRef<RelRoute | null>(null);
  useEffect(() => {
    if (!route || !awake || briefedRef.current === route) return;
    briefedRef.current = route;
    setItems((prev) => {
      const mine = prev.length ? prev[prev.length - 1].step : 0;
      return [...prev, { kind: "brief", id: nextId("brief"), step: mine }];
    });
    // THE IDENTITY TIER. The scope blends in and the question above it leaves
    // the stage: the banker is deciding on the review now, not on which one.
    tierArrived("identity");
  }, [awake, route, tierArrived]);

  /* ---- AND THE NEXT QUESTION FOLLOWS IT. The step machine decides; the room
          asks. One question at a time, numbered, and never re-asked. */
  const askedRef = useRef<string | null>(null);
  /** The third tier has been claimed, and the beat it is waiting on. */
  const detailedRef = useRef(false);
  const detailTimer = useRef(0);
  /** The one agent bubble that IS the third tier (the first question). */
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => () => window.clearTimeout(detailTimer.current), []);
  useEffect(() => {
    if (!route || !awake || !live || thinking || phase === "filed") return;
    if (askedRef.current === live.key) return;
    askedRef.current = live.key;
    const push1 = (id: string) =>
      setItems((prev) => {
        const mine = prev.length ? prev[prev.length - 1].step : 0;
        return [
          ...prev,
          {
            kind: "agent",
            id,
            step: mine,
            text: live.ask,
            kicker: `Step ${order.length + 1} of ${planned}`,
            options: optionsFor(live),
          },
        ];
      });
    /* THE DETAIL TIER, ONE BEAT LATER (the entry choreography). The FIRST
       question is the third tier and it gets its own arrival, so the scope
       above it is read before it retires. Every question after it opens a step
       of its own and is an exchange, not a tier: it lands immediately.

       THE BEAT IS HELD IN A REF, NOT IN A CLEANUP. This effect re-runs on every
       answer; a cleanup that cleared the timer would swallow the first question
       whenever anything moved underneath it. */
    if (detailedRef.current) {
      push1(nextId("step"));
      return;
    }
    detailedRef.current = true;
    const id = nextId("step");
    const land = () => {
      push1(id);
      setDetailId(id);
      tierArrived("detail");
    };
    if (reduced) {
      land();
      return;
    }
    detailTimer.current = window.setTimeout(land, TIER_STAGGER_MS);
  }, [awake, live, order.length, phase, planned, reduced, route, thinking, tierArrived]);

  /* ---- the review chip's own beat: once the last step is answered the room
          says so rather than leaving the banker to notice the chip. */
  const readyRef = useRef(false);
  useEffect(() => {
    if (!ready || readyRef.current || phase === "filed" || !flowSpec) return;
    readyRef.current = true;
    setItems((prev) => {
      const mine = prev.length ? prev[prev.length - 1].step : 0;
      return [
        ...prev,
        {
          kind: "agent",
          id: nextId("ready"),
          step: mine,
          text: `That is everything the ${REL_ROUTE_WORD[flowSpec.route]} needs. Review the plan below, then file it.`,
        },
      ];
    });
  }, [flowSpec, phase, ready]);

  /** RECORD AN ANSWER. Every answer starts a STEP (rule 31): the banker line
   *  lands, the steps before it collapse, and the machine asks the next one. */
  const record = useCallback(
    (key: string, value: unknown, said: string) => {
      const mine = step + 1;
      setStep(mine);
      setHistOpen(false);
      setFlow(null);
      setItems((prev) => [...prev, { kind: "banker", id: nextId("banker"), step: mine, text: said }]);
      setAnswers((prev) => {
        const next = { ...prev };
        assign(next, key, value);
        return next;
      });
      setOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
    },
    [step],
  );

  /** UN-ANSWER. A governance ledger is not a manifest of writes, so a row comes
   *  off by being asked again rather than by being deleted: dropping it sends
   *  the machine straight back to that step. */
  const drop = useCallback(
    (key: string) => {
      setAnswers((prev) => {
        const next = { ...prev };
        const dot = key.indexOf(".");
        if (dot === -1) delete next[key];
        else {
          const group = key.slice(0, dot);
          const held = next[group];
          if (held && typeof held === "object" && !Array.isArray(held)) {
            const copy = { ...(held as Record<string, unknown>) };
            delete copy[key.slice(dot + 1)];
            next[group] = copy;
          }
        }
        return next;
      });
      setOrder((prev) => prev.filter((k) => k !== key));
      askedRef.current = null;
      readyRef.current = false;
      setFlow(null);
      setToast("Taken back off the review");
    },
    [],
  );

  const answerLive = useCallback(
    async (raw: string, said?: string) => {
      if (!live) return;
      const text = raw.trim();
      const shown = (said ?? raw).trim();
      const started = Date.now();
      setThinking(true);
      try {
        await beat(started);
        if (live.kind === "multi") {
          // A MULTI STEP TAKES A SET. A chip contributes one id; a typed line
          // is matched against the options by name, and a line that matches
          // nothing is answered with the question again rather than with a
          // selection nobody made.
          const matched = matchOptions(live, text);
          if (!matched.length) {
            setThinking(false);
            unreadable(live);
            return;
          }
          record(live.key, matched, shown);
          return;
        }
        if (text === SKIP_LABEL || text.toLowerCase() === "skip") {
          if (!live.optional) {
            setThinking(false);
            unreadable(live);
            return;
          }
          record(live.key, SKIPPED, SKIP_LABEL);
          return;
        }
        if (live.kind === "number") {
          const n = Number(text.replace(/[$,\s]/g, ""));
          if (!Number.isFinite(n)) {
            setThinking(false);
            unreadable(live);
            return;
          }
          record(live.key, n, shown);
          return;
        }
        if (live.options?.length) {
          const hit = live.options.find((o) => o.value.toLowerCase() === text.toLowerCase());
          if (!hit && live.kind === "chips") {
            setThinking(false);
            unreadable(live);
            return;
          }
          record(live.key, hit ? hit.value : text, shown);
          return;
        }
        record(live.key, text, shown);
      } finally {
        setThinking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beat, live, record],
  );

  /** THE ROOM COULD NOT READ THAT. It re-asks with the legal answers rather
   *  than guessing, because guessing here writes a governance record. */
  const unreadable = useCallback(
    (target: RelStep) => {
      setItems((prev) => {
        const mine = prev.length ? prev[prev.length - 1].step : 0;
        return [
          ...prev,
          {
            kind: "agent",
            id: nextId("again"),
            step: mine,
            text: target.options?.length
              ? "I could not read that as one of the values above. Pick one, or say it exactly as it reads."
              : target.kind === "number"
                ? "I need a figure for that one. A number, or skip it."
                : "I could not read that. Say it again.",
            options: optionsFor(target),
          },
        ];
      });
    },
    [],
  );

  /* ==================================================== THE SECOND LANE, HERE

     THE SAME DISPATCH AS THE FACILITY ROOM, in this room's vocabulary. The
     founder's quick test said this room reads "equally mechanical", and it read
     that way for the same reason: every line went to the step machine, so a
     question became an answer and an unreadable line became a re-ask.

     Reads are answered LOCALLY and first. A line the live step can genuinely
     read is still the step's, straight through, so the ritual keeps its pace.
     Everything else goes to the desk with this route's FILEABLE MAP in the
     envelope, so a refusal comes back by name rather than as invented
     capability. And with no bridge, none of this happens at all.             */

  /** The read a question is answered from. The room's own context, handed to
   *  the shared builder so both rooms answer a read the same way. */
  const reads = useMemo<ReadSource>(
    () => ({
      bundle: ctx.bundle,
      accountName: ctx.accountName,
      productPackageId: ctx.productPackageId,
      generatedAt: ctx.asOf ?? undefined,
    }),
    [ctx.accountName, ctx.asOf, ctx.bundle, ctx.productPackageId],
  );

  /** The conversation so far, for the envelope. */
  const conversation = useCallback(
    (): BrainTurn[] =>
      items.flatMap<BrainTurn>((item) =>
        item.kind === "banker"
          ? [{ who: "banker", text: item.text }]
          : item.kind === "agent"
            ? [{ who: "agent", text: item.text }]
            : item.kind === "read"
              ? [{ who: "agent", text: `Answered a read on ${item.card.topic}. ${item.card.lede}` }]
              : [],
      ),
    [items],
  );

  const askTheDesk = useCallback(
    async (line: string): Promise<BrainReply | null> => {
      if (!brain) return null;
      try {
        return await brain(
          buildRelEnvelope({
            line,
            route,
            ctx,
            reads,
            thread: conversation(),
            collected: laneRows.map((r) => ({
              title: r.label,
              target: route ? REL_ROUTE_WORD[route] : "this relationship",
              after: r.value,
            })),
          }),
        );
      } catch {
        // The lane never throws into the room: a transport that failed past
        // `askBrain`'s own guard degrades exactly as a malformed reply does.
        return null;
      }
    },
    [brain, conversation, ctx, laneRows, reads, route],
  );

  /**
   * WHAT THE DESK SAID, DRAWN.
   *
   * `degrade` is what the room would have done without the lane. Every failure
   * runs it, so a bad round trip leaves the banker exactly where the
   * deterministic room would have, never worse.
   */
  const landRelReply = useCallback(
    async (
      reply: BrainReply | null,
      line: string,
      mine: number,
      opts: { degrade: () => void; routeOpen?: boolean },
    ) => {
      const answer = (item: NewRelItem) => setItems((prev) => [...prev, { ...item, step: mine } as RelItem]);
      if (!reply || isDegrade(reply)) {
        opts.degrade();
        return;
      }
      /* THE ROUTE, RESOLVED FROM INTENT. Binding still runs through the room's
         own router, so a named review can do nothing a chip could not. An
         ambiguous reply names none, and the five-way stands. */
      if (opts.routeOpen && router && reply.route && REL_ROUTE_WORDS.has(reply.route)) {
        setAsk(null);
        router.onBind(reply.route as RelRoute, { say: line });
        return;
      }
      if (reply.type === "read-card") {
        answer({ kind: "read", id: nextId("read"), card: toReadCardModel(reply) });
        return;
      }
      if (reply.type === "clarify") {
        answer({ kind: "agent", id: nextId("agent"), text: reply.text, options: reply.options });
        return;
      }
      /* A CHANGE TO A FACILITY IS NOT THIS ROOM'S WORK, whoever proposed it.
         The desk gets the same answer a banker does, in one line. */
      answer({ kind: "agent", id: nextId("agent"), text: `${reply.rationale} ${FACILITY_HANDOFF}` });
    },
    [router],
  );

  const runRelBrain = useCallback(
    async (line: string, mine: number, opts: { degrade: () => void; routeOpen?: boolean }) => {
      const started = Date.now();
      setThinking(true);
      let reply: BrainReply | null = null;
      try {
        reply = await askTheDesk(line);
        await beat(started);
      } finally {
        setThinking(false);
      }
      await landRelReply(reply, line, mine, opts);
    },
    [askTheDesk, beat, landRelReply],
  );

  /**
   * The banker said something.
   *
   * FREE TEXT BINDS. While the route is open the line picks the review; once a
   * route is bound the line answers the live step, unless it names a different
   * review, asks for facility work, or asks for a create this room cannot file.
   */
  const say = useCallback(
    async (heard: string, said?: string) => {
      const text = heard.trim();
      if (!text || !awake) return;

      /* A READ DOES NOT PICK A REVIEW (F1). The route gate used to intercept
         every line, so a question about the book was answered with the five-way
         rather than with the card the room was already holding. */
      if (ask && router) {
        const preTopic = readTopic(text);
        const preCard = preTopic !== null ? buildReadCard(preTopic, reads) : null;
        if (!preCard) {
          const picked = readRelRouteIntent(text);
          if (picked) {
            setAsk(null);
            router.onBind(picked, { say: text });
            return;
          }
        }
        const mine = step + 1;
        const five =
          "I can run the annual review, the covenant review, a collateral valuation, the risk-rating review or a service request. Pick one above, or name which of the five this is.";
        setStep(mine);
        setItems((prev) => [...prev, { kind: "banker", id: nextId("banker"), step: mine, text: (said ?? heard).trim() }]);
        if (preCard) {
          setItems((prev) => [...prev, { kind: "read", id: nextId("read"), step: mine, card: preCard }]);
          return;
        }
        if (brain) {
          await runRelBrain(text, mine, {
            routeOpen: true,
            degrade: () => setItems((prev) => [...prev, { kind: "agent", id: nextId("agent"), step: mine, text: five }]),
          });
          return;
        }
        setItems((prev) => [...prev, { kind: "agent", id: nextId("agent"), step: mine, text: five }]);
        return;
      }
      if (!route) return;

      const mine = step + 1;
      const answer = (item: NewRelItem) => {
        setStep(mine);
        setHistOpen(false);
        setItems((prev) => [
          ...prev,
          { kind: "banker", id: nextId("banker"), step: mine, text: (said ?? heard).trim() },
          { ...item, step: mine } as RelItem,
        ]);
      };

      /* READS ARE LOCAL, AND THEY ARE FIRST (F1). A topic the bundle answers is
         answered from the bundle, before anything else in this room can act on
         the line. It binds nothing, switches nothing and advances nothing:
         asking what is on the book is not choosing what to do about it, and the
         route-switch reader would otherwise have read "which covenants are on
         this relationship" as a request to change review. */
      const topic = readTopic(text);
      const card = topic !== null ? buildReadCard(topic, reads) : null;
      if (card) {
        answer({ kind: "read", id: nextId("read"), card });
        return;
      }

      /* FACILITY WORK LIVES NEXT DOOR, and the room says so in one line rather
         than routing a pledge into the nearest review. */
      if (asksForFacilityWork(text)) {
        answer({ kind: "agent", id: nextId("agent"), text: FACILITY_HANDOFF });
        return;
      }

      /* A CREATE THIS ROOM CANNOT FILE. It is composed, stated, and the org-side
         gap is named. Nothing unbacked is ever sent. */
      const create = readCreateAsk(text, route);
      if (create) {
        setStep(mine);
        setHistOpen(false);
        setItems((prev) => [
          ...prev,
          { kind: "banker", id: nextId("banker"), step: mine, text: (said ?? heard).trim() },
          { kind: "gap", id: nextId("gap"), step: mine, gap: CREATE_GAPS[create] },
        ]);
        return;
      }

      /* THE GRADE OVERRIDE HAS NO OBSERVED WIRE NAME, so it is refused by name
         rather than guessed at. */
      if (asksForOverride(text, route)) {
        answer({ kind: "agent", id: nextId("agent"), text: OVERRIDE_NOT_FILEABLE });
        return;
      }

      /* ROUTE BINDING IS FINAL PER PLAN. On an empty ledger nothing has been
         collected against this review, so the room is simply rebuilt on the
         other one. Once anything is collected the room refuses out loud and
         offers the discard as the explicit gesture it is. */
      const switchTo = router ? readRelRouteSwitch(text, route) : null;
      if (switchTo && router) {
        if (!order.length) {
          router.onRestart(switchTo, text);
          return;
        }
        answer({
          kind: "agent",
          id: nextId("agent"),
          text: `${order.length} ${order.length === 1 ? "answer is" : "answers are"} collected on this ${
            REL_ROUTE_WORD[route]
          }, so the room is held to it. Starting a ${REL_ROUTE_WORD[switchTo]} means discarding them and opening a fresh room.`,
          restart: {
            route: switchTo,
            label: `Discard and start the ${REL_ROUTE_WORD[switchTo]}`,
            say: text,
          },
        });
        return;
      }

      /* A QUESTION IS NOT AN ANSWER TO A STEP. Without a bridge the line still
         reaches the step machine exactly as it did before this lane existed,
         which is the channel-none contract. */
      if (isQuestion(text) && brain) {
        setStep(mine);
        setHistOpen(false);
        setItems((prev) => [...prev, { kind: "banker", id: nextId("banker"), step: mine, text: (said ?? heard).trim() }]);
        await runRelBrain(text, mine, {
          degrade: () =>
            setItems((prev) => [
              ...prev,
              {
                kind: "agent",
                id: nextId("agent"),
                step: mine,
                text: topic !== null ? readGap(topic, ctx.accountName) : UNREADABLE_CLARIFY.text,
              },
            ]),
        });
        return;
      }

      if (!live) {
        answer({
          kind: "agent",
          id: nextId("agent"),
          text: `Everything the ${REL_ROUTE_WORD[route]} needs is collected. The review chip below carries the next move.`,
        });
        return;
      }

      /* THE FAST LANE: a line the live step can genuinely read is recorded as
         its answer, straight through, exactly as it always was. A line it
         cannot read used to be met with a re-ask; it now goes to the desk, and
         the re-ask is what a bad round trip degrades to. */
      if (!brain || stepAccepts(live, text)) {
        await answerLive(text, said);
        return;
      }
      setStep(mine);
      setHistOpen(false);
      setItems((prev) => [...prev, { kind: "banker", id: nextId("banker"), step: mine, text: (said ?? heard).trim() }]);
      await runRelBrain(text, mine, { degrade: () => unreadable(live) });
    },
    [answerLive, ask, awake, brain, ctx.accountName, live, order.length, reads, route, router, runRelBrain, step, unreadable],
  );

  /** THE QUESTION IS ANSWERED BY A CHIP. "Something else" answers nothing: it
   *  falls through to the neutral five-way, which is the whole point of
   *  offering a suggestion rather than assuming one. */
  const chooseRoute = useCallback(
    (chip: RelRouteChoice) => {
      if (!router || chip.disabled) return;
      if (!chip.route) {
        setAsk(router.neutral());
        return;
      }
      setAsk(null);
      router.onBind(chip.route, { covenantId: chip.covenantId ?? null });
    },
    [router],
  );

  /* ---- THE LINE THAT BOUND THE ROUTE IS STILL AN INSTRUCTION. It is said once
          the bound room is awake, exactly as if the banker had typed it here. */
  const saidRef = useRef<string | null>(null);
  useEffect(() => {
    const line = router?.say ?? null;
    if (!awake || ask || !line || saidRef.current === line) return;
    saidRef.current = line;
    void say(line);
  }, [ask, awake, router?.say, say]);

  /* ---- THE SIGNAL'S COVENANT IS PRESELECTED. Where the opening named one, the
          covenant review opens with it already on the list rather than making
          the banker find it again. */
  const preselectedRef = useRef(false);
  useEffect(() => {
    const id = router?.preselectCovenantId;
    if (!id || !awake || route !== "covenant" || preselectedRef.current) return;
    if (!reviewableCovenants(ctx).some((c) => c.covenantId === id)) return;
    preselectedRef.current = true;
    setAnswers((prev) => ({ ...prev, covenants: [id] }));
    setOrder((prev) => (prev.includes("covenants") ? prev : [...prev, "covenants"]));
  }, [awake, ctx, route, router?.preselectCovenantId]);

  /* --------------------------------------------------------- the commit path

     THE FLOW CARD POPS OPEN IN THE THREAD (rule 38). Opening it STAGES: staging
     is zero-DML by contract, and it is the only way the card can show the org's
     real decision token rather than a decoration shaped like one. */

  const openFlow = useCallback(async () => {
    if (!route) return;
    // A REBUILD IS A NEW INTENT. Answers that changed under a staged plan change
    // the plan and its hash, and reusing the key would invite the org to replay
    // the old staging row.
    const signature = JSON.stringify(answers);
    if (stagedAnswersRef.current !== null && stagedAnswersRef.current !== signature) keyRef.current = deps.newKey();
    stagedAnswersRef.current = signature;

    setFlow({ staging: null, running: false, status: 0 });
    try {
      const staged = await stageRelPlan(route, ctx, answers, keyRef.current, deps);
      setFlow((f) => (f ? { ...f, staging: staged } : f));
    } catch (e) {
      setFlow(null);
      if (neverReachedTheOrg(e)) {
        push({
          kind: "notice",
          id: nextId("notice"),
          title: "This view is not connected to the bank's systems.",
          body: NO_CONNECTOR,
        });
        return;
      }
      // A REFUSAL CARRYING THE ORG'S LEGAL LIST IS RE-OFFERED AS CHIPS. The
      // banker guessed once; they should not have to guess twice.
      const legal = e instanceof RelFlowError ? e.legalValues : undefined;
      push({
        kind: "agent",
        id: nextId("agent"),
        text: readableError(e),
        options: legal?.length ? legal.map((v) => ({ label: v, say: v })) : undefined,
      });
    }
  }, [answers, ctx, deps, push, route]);

  const execute = useCallback(async () => {
    const staging = flow?.staging;
    if (!route || !staging?.decisionToken || filing || sealed) return;
    if (!ctx.approver) {
      push({
        kind: "agent",
        id: nextId("agent"),
        text: "This view has no Salesforce user id for the signed-in identity, and the org checks the approver against the running identity before it redeems the token. The plan is staged and holds.",
      });
      return;
    }
    setFiling(true);
    setFlow((f) => (f ? { ...f, running: true } : f));
    try {
      const result = await executeRelPlan(
        route,
        {
          idempotencyKey: keyRef.current,
          stagingId: staging.stagingId,
          planHash: staging.planHash,
          decisionToken: staging.decisionToken,
          approverUserId: ctx.approver,
        },
        deps,
      );
      const dossier: DossierModel = {
        title: REL_FLOWS[route].word,
        rows: dossierRowsFor(route, ctx, answers, result),
        footer: dossierFooter(result),
        tokenNote: `Single-use decision token redeemed. ${REL_FLOWS[route].filedWord} against ${ctx.accountName}.`,
        handoff: dossierHandoff(route, result),
      };
      setPhase("filed");
      setFlow(null);
      setLit(true);
      setItems((prev) => {
        const mine = prev.length ? prev[prev.length - 1].step : 0;
        return [...prev, { kind: "dossier", id: nextId("dossier"), step: mine, dossier }];
      });
      setToast(`${REL_FLOWS[route].filedWord} · logged to the activity trail`);
    } catch (e) {
      setFlow((f) => (f ? { ...f, running: false } : f));
      push({ kind: "agent", id: nextId("agent"), text: readableError(e) });
      // ONCE THE CALL HAS REACHED THE ORG the token may be spent and the write
      // may have landed, so the room stops offering the gesture rather than
      // arming a retry that would bounce on a burnt single-use token and tell
      // the banker nothing about what the org did.
      if (e instanceof RelFlowError && e.dispatched) {
        setSealed(true);
        push({
          kind: "agent",
          id: nextId("agent"),
          text: "The filing may have completed despite the error. Do not approve again; check the staging record.",
        });
      }
    } finally {
      setFiling(false);
    }
  }, [answers, ctx, deps, filing, flow, push, route, sealed]);

  /* ---- the halo breathes out ~5s after the dossier lands (rule 69). */
  useEffect(() => {
    if (!lit || reduced) return;
    const t = window.setTimeout(() => setLit(false), HALO_LIFE_MS);
    return () => clearTimeout(t);
  }, [lit, reduced]);

  /* ---- the status line under the execute mark crossfades while it runs. */
  useEffect(() => {
    if (!flow?.running || reduced || !flowSpec) return;
    const t = window.setInterval(
      () => setFlow((f) => (f && f.running ? { ...f, status: (f.status + 1) % flowSpec.loadSteps.length } : f)),
      STATUS_ROTATE_MS,
    );
    return () => clearInterval(t);
  }, [flow?.running, flowSpec, reduced]);

  /* ------------------------------------------------------------- render */

  const liveStep = items.length ? items[items.length - 1].step : 0;
  const grouped = useMemo(() => {
    const out: Array<{ step: number; items: RelItem[] }> = [];
    for (const item of items) {
      const last = out[out.length - 1];
      if (last && last.step === item.step) last.items.push(item);
      else out.push({ step: item.step, items: [item] });
    }
    return out;
  }, [items]);
  /* A ROOM STILL ASKING WHICH REVIEW THIS IS KEEPS THE QUESTION ON SCREEN. The
     question lives in the greeting slot at step 0; a line the room could not
     read as a review starts a step of its own, and collapsing step 0 behind it
     would hide the five chips in the same gesture that said "pick one". */
  const shows = (g: { step: number }) => g.step === liveStep || (!!ask && g.step === 0);
  const hidden = grouped.filter((g) => !shows(g));
  /** The tiers that left the stage, and whether they are back on it. */
  const tiersLeft = choreo.left;
  const tiersShown = choreo.summoned || histOpen;
  const laneFolded = Math.max(0, laneRows.length - LANE_VISIBLE);

  const openingItem = (
    <div className="wk-msg wk-agent" data-who="Agent" key="opening">
      <div className="wk-bub">
        <div className="wk-headline">
          <span className="wk-greet">
            <Words text={brief.greeting} />{" "}
          </span>
          <Words
            text={ask ? ask.line : brief.position}
            offset={brief.greeting.trim().split(/\s+/).length}
          />
        </div>
        {ask && (
          <div className="wk-opts">
            {ask.chips.map((chip) => (
              <button
                type="button"
                className="wk-opt"
                key={chip.label}
                disabled={chip.disabled}
                title={chip.disabled ? chip.reason : undefined}
                onClick={() => chooseRoute(chip)}
              >
                {chip.label}
                {chip.disabled && chip.reason && <span className="rl-opt-d">{chip.reason}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="wk-posfoot">
          <button
            type="button"
            className="wk-dt"
            onClick={(e) =>
              openPeek(e.currentTarget, {
                kicker: "What the room read",
                width: 520,
                content: (
                  <>
                    {brief.why.map((row) => (
                      <div className="wk-have-row" key={row.label}>
                        <div className="wk-l">{row.label}</div>
                        <div className="wk-d">{row.detail}</div>
                      </div>
                    ))}
                    <div className="wk-cav">
                      Everything above is the cockpit's own staged read. Nothing here reaches a live clock, and no
                      signal is raised that the data did not make.
                    </div>
                  </>
                ),
              })
            }
          >
            Why
          </button>
        </div>
      </div>
    </div>
  );

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
          aria-label={title}
          data-room="relationship"
        >
          {/* ONE SLIM LINE (rule 44): the mark, one word, four dots, close. */}
          <header className="wk-head">
            <BrandGlyph />
            <span className="wk-title">{title}</span>
            <span className="wk-spacer" />
            <span className="wk-stepper" aria-label="Stage">
              {["Read", "Collect", "Review", "Filed"].map((label, i) => (
                <i
                  key={label}
                  className={`wk-stg ${steps.stages[i] === "on" ? "wk-on" : steps.stages[i] === "done" ? "wk-done" : ""}`}
                  title={i === 1 && steps.composeCount ? `${label} ${steps.composeCount}` : label}
                />
              ))}
            </span>
            <button type="button" className="wk-icobtn" onClick={onClose} aria-label="Close the relationship room">
              ×
            </button>
          </header>

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
                {grouped.map((group) => (
                  <div
                    className={`wk-step ${shows(group) || histOpen ? "" : "wk-gone"}`}
                    key={`step-${group.step}-${group.items[0].id}`}
                  >
                    {/* THE SUMMON (the entry choreography). Earlier tiers are
                        never lost: one quiet control brings back every one that
                        left the stage, in both rooms, with the same words. */}
                    {group.items.some((i) => relTierOf(i, detailId)) && tiersLeft.length > 0 && !histOpen && (
                      <button
                        type="button"
                        className="wk-summon"
                        data-summon="tiers"
                        aria-expanded={tiersShown}
                        onClick={() => choreo.setSummoned(!choreo.summoned)}
                      >
                        {summonLabel(tiersLeft.length, tiersShown)}
                      </button>
                    )}
                    {group.items.map((item) => {
                      const block = (
                        <RelBlock
                          item={item}
                          opening={openingItem}
                          spec={flowSpec}
                          lit={lit}
                          onOpenPeek={openPeek}
                          onOption={(sayText, label) => void say(sayText, label)}
                          onRestart={(restart) => {
                            setAnswers({});
                            setOrder([]);
                            askedRef.current = null;
                            readyRef.current = false;
                            briefedRef.current = null;
                            detailedRef.current = false;
                            setDetailId(null);
                            choreo.reset();
                            routerRef.current?.onRestart(restart.route, restart.say);
                          }}
                        />
                      );
                      const tier = relTierOf(item, detailId);
                      if (!tier) return <Fragment key={item.id}>{block}</Fragment>;
                      /* A TIER THAT LEFT THE STAGE STAYS MOUNTED, so an absence
                         contract can tell "faded out" from "gone". */
                      return (
                        <div key={item.id} {...tierAttrs(tier, choreo.stateOf(tier), tiersShown)}>
                          {block}
                        </div>
                      );
                    })}
                    {/* THE REVIEW CHIP, in the live exchange. It is the only way
                        to the plan and it never leaves the thread. */}
                    {group.step === liveStep && approvalOpen && !flow && flowSpec && (
                      <button type="button" className="wk-propose" onClick={() => void openFlow()}>
                        <TypeIcon kind={flowSpec.icon} />
                        <span>
                          {order.length} {order.length === 1 ? "answer" : "answers"} collected ·{" "}
                          <b>Review &amp; file</b>
                        </span>
                      </button>
                    )}
                    {group.step === liveStep && flow && flowSpec && (
                      <RelFlowCard
                        flow={flow}
                        spec={flowSpec}
                        accountName={ctx.accountName}
                        approver={ctx.approver}
                        sealed={sealed}
                        filing={filing}
                        onCancel={() => setFlow(null)}
                        onExecute={() => void execute()}
                        onOpenPeek={openPeek}
                      />
                    )}
                  </div>
                ))}
                {thinking && (
                  <div className="wk-compose" role="status" aria-label="Composing an answer">
                    <LiquidMark />
                    <span>Composing…</span>
                  </div>
                )}
              </section>

              <div className="wk-sugg" />

              {/* The composer SLEEPS until the room has read the relationship. */}
              <div className="wk-composer eg-pill">
                <input
                  className="wk-txt"
                  value={draft}
                  disabled={!awake || phase === "filed"}
                  placeholder={
                    phase === "filed"
                      ? `${flowSpec?.filedWord ?? "Filed"}. The room holds.`
                      : !awake
                        ? "Reading the relationship…"
                        : ask
                          ? "Name the review, or pick one above."
                          : (live?.placeholder ?? "Answer above, or say what changes.")
                  }
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const text = draft;
                    setDraft("");
                    void say(text);
                  }}
                  aria-label="Answer the review"
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

          {/* ======================== THE RIGHT LANE: position, then the ledger */}
          <aside className="wk-col-r" aria-label={laneHeading}>
            {/* The lane opens empty (founder call, 2026-09-01): content arrives with
              the review, never as furniture. */}
                        {laneRows.length > 0 && (
            <div className="wk-man-h">
              <span className="wk-kicker">{laneHeading}</span>
              <span className="wk-c">
                {laneRows.length} {laneRows.length === 1 ? "answer" : "answers"}
              </span>
              <button
                type="button"
                className="wk-dt"
                onClick={(e) =>
                  openPeek(e.currentTarget, {
                    kicker: "What this review writes",
                    width: 480,
                    content: flowSpec ? (
                      <>
                        <div className="wk-prose">{flowSpec.covers}</div>
                        <div className="wk-prose" style={{ marginTop: 10 }}>
                          {flowSpec.produces}
                        </div>
                        <div className="wk-cav">
                          Staged intent only: nothing is written until the single approval, and the plan the banker
                          reads is the plan that executes.
                        </div>
                      </>
                    ) : (
                      <div className="wk-prose">
                        No review is bound yet. Pick one above and this states exactly what it covers and what it
                        files.
                      </div>
                    ),
                  })
                }
              >
                Scope
              </button>
            </div>
            )}

            {laneRows.length === 0 && (
              <div className="wk-empty">
                {flowSpec ? "Nothing collected yet. Answers land here as the review takes them." : "Pick a review to begin."}
              </div>
            )}
            {laneFolded > 0 && <div className="rl-fold">↑ {laneFolded} earlier in this review</div>}
            <div className="wk-ents">
              {laneRows.slice(laneFolded).map((row) => (
                <div className="wk-ent" key={row.key}>
                  <TypeIcon kind={row.icon} />
                  <span className="wk-ent-t">
                    <b>{row.label}</b>
                    <span>{row.value}</span>
                  </span>
                  {phase === "work" && (
                    <button
                      type="button"
                      className="wk-ent-x"
                      aria-label={`Take ${row.label} back off the review`}
                      title="Take it back. The room asks again."
                      onClick={() => drop(row.key)}
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className={`wk-toast ${toast ? "wk-show" : ""}`} role="status">
          {toast}
        </div>

        {peek && <Peek spec={peek} roomRef={roomRef} onClose={closePeek} />}
      </div>
    </Portal>
  );
}

/* ---------------------------------------------------------- the step's chips */

/** The option pills a step offers. Optional steps carry the skip as a chip,
 *  because "not assessed" is an ANSWER a governance record should hold, not an
 *  absence the banker has to express by silence. */
function optionsFor(step: RelStep): Opt[] | undefined {
  const opts: Opt[] = (step.options ?? []).map((o) => ({ label: o.label, say: o.value, detail: o.detail }));
  if (step.optional) opts.push({ label: SKIP_LABEL, say: SKIP_LABEL });
  return opts.length ? opts : undefined;
}

/** Which options a typed line named. Exact value first, then a contained-word
 *  match; "all" takes the whole set, which is what a banker says when the
 *  package survey is the point. */
/**
 * CAN THE LIVE STEP GENUINELY READ THIS LINE.
 *
 * The same judgement `answerLive` makes when it decides between recording an
 * answer and re-asking, lifted out so the dispatch can consult it BEFORE the
 * line is spent. A line the step can read is the step's and goes straight
 * through; a line it cannot is what the desk is for.
 *
 * It reads SHAPES. It resolves nothing, records nothing and stages nothing.
 */
function stepAccepts(step: RelStep, text: string): boolean {
  const line = text.trim();
  if (!line) return false;
  if (step.kind === "multi") return matchOptions(step, line).length > 0;
  if (line === SKIP_LABEL || line.toLowerCase() === "skip") return step.optional === true;
  if (step.kind === "number") return Number.isFinite(Number(line.replace(/[$,\s]/g, "")));
  if (step.options?.length && step.kind === "chips") {
    return step.options.some((o) => o.value.toLowerCase() === line.toLowerCase());
  }
  return true;
}

function matchOptions(step: RelStep, text: string): string[] {
  const opts = step.options ?? [];
  const line = text.trim().toLowerCase();
  if (!line) return [];
  if (/^(all|all of them|everything|the lot)$/.test(line)) return opts.map((o) => o.value);
  const exact = opts.filter((o) => o.value.toLowerCase() === line || o.label.toLowerCase() === line);
  if (exact.length) return exact.map((o) => o.value);
  return opts.filter((o) => line.includes(o.label.toLowerCase())).map((o) => o.value);
}

/* ----------------------------------------------------------- thread blocks */

function RelBlock({
  item,
  opening,
  spec,
  lit,
  onOpenPeek,
  onOption,
  onRestart,
}: {
  item: RelItem;
  opening: ReactNode;
  spec: RelFlowSpec | null;
  lit: boolean;
  onOpenPeek: ReturnType<typeof usePeek>["openPeek"];
  onOption: (say: string, label: string) => void;
  onRestart: (restart: { route: RelRoute; say: string }) => void;
}) {
  if (item.kind === "opening") return <>{opening}</>;

  if (item.kind === "lookup") {
    return (
      <div className="wk-loadchip" role="status" aria-label="Reading the relationship">
        <LiquidMark />
        <span className="wk-bars" aria-hidden="true">
          <i />
          <i />
        </span>
      </div>
    );
  }

  /* THE STRUCTURED BRIEF. A governance ritual states its scope before it asks
     anything: what the review covers, then what it produces. Two lines, read
     once, and never repeated by a later bubble. */
  if (item.kind === "brief") {
    if (!spec) return null;
    return (
      <div className="rl-brief">
        <div className="rl-brief-h">
          <TypeIcon kind={spec.icon} />
          <b>{spec.word}</b>
        </div>
        <div className="rl-brief-r">
          <span className="rl-brief-k">Covers</span>
          <span className="rl-brief-t">{spec.covers}</span>
        </div>
        <div className="rl-brief-r">
          <span className="rl-brief-k">Produces</span>
          <span className="rl-brief-t">{spec.produces}</span>
        </div>
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

  /* A QUESTION, ANSWERED. The SAME card the facility room draws: a banker who
     has learned one room has learned both, and a read that looked different in
     the two rooms would be two answers to one question. */
  if (item.kind === "read") return <ReadCard card={item.card} />;

  /* A CREATE THE ROOM CANNOT FILE. The refusal leads, the org-side gap is named
     under it, and no payload was ever composed. */
  if (item.kind === "gap") {
    return (
      <div className="rl-gap">
        <div className="wk-dl">
          <TypeIcon kind="covenant" />
          <span className="wk-kind wk-refusal">Not filed</span>
          <span className="wk-tgt">{item.gap.what}</span>
        </div>
        <div className="rl-gap-l">{item.gap.line}</div>
        <button
          type="button"
          className="wk-dt"
          style={{ alignSelf: "flex-start" }}
          onClick={(e) =>
            onOpenPeek(e.currentTarget, {
              kicker: "What would close this",
              width: 460,
              content: <div className="wk-prose">{item.gap.orgGap}</div>,
            })
          }
        >
          What would close this
        </button>
      </div>
    );
  }

  if (item.kind === "dossier") {
    const d = item.dossier;
    return (
      <>
        <RelDossier dossier={d} lit={lit} />
        <div className="wk-tokline">
          <span className="wk-tick">✓</span>
          <span>{d.tokenNote}</span>
        </div>
        {d.handoff && <div className="wk-handoff">{d.handoff}</div>}
      </>
    );
  }

  const who = item.kind === "banker" ? "You" : "Agent";
  return (
    <div className={`wk-msg wk-${item.kind}`} data-who={who}>
      <div className="wk-bub">
        {item.kind === "agent" && item.kicker && <span className="rl-kicker">{item.kicker}</span>}
        {item.kind === "agent" ? <Words text={item.text} /> : item.text}
        {item.kind === "agent" && item.options && item.options.length > 0 && (
          <div className="wk-opts">
            {item.options.map((opt) => (
              <button type="button" className="wk-opt" key={opt.say} onClick={() => onOption(opt.say, opt.label)}>
                {opt.label}
                {opt.detail && <span className="rl-opt-d">{opt.detail}</span>}
              </button>
            ))}
          </div>
        )}
        {item.kind === "agent" && item.restart && (
          <div className="wk-opts">
            <button
              type="button"
              className="wk-opt"
              onClick={() => onRestart({ route: item.restart!.route, say: item.restart!.say })}
            >
              {item.restart.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the flow card */

function RelFlowCard({
  flow,
  spec,
  accountName,
  approver,
  sealed,
  filing,
  onCancel,
  onExecute,
  onOpenPeek,
}: {
  flow: { staging: StagedRelPlan | null; running: boolean; status: number };
  spec: RelFlowSpec;
  accountName: string;
  approver: string | null;
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
            {spec.loadSteps.map((s, i) => (
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

  const plan: StagedOutput | null = flow.staging?.plan ?? null;
  const refused = (plan?.covenants ?? []).filter((c) => c.state && c.state !== "planned");
  const held = plan?.executionHeld === true;

  return (
    <div className="wk-flowcard">
      <div className="wk-t">
        <TypeIcon kind={spec.icon} />
        <span>{spec.word}</span>
      </div>
      <div className="wk-s">
        {plan?.summary ? plan.summary : `Staging the ${spec.writeObjectLabel} on ${accountName}…`}
      </div>

      {/* BEFORE YOU FILE. The org's own warnings and its own per-covenant
          refusals, verbatim. Advice, never a gate: the approval below is live
          whether it is read or not. */}
      {(plan?.warnings?.length || refused.length > 0) && (
        <div className="rl-warn">
          <div className="rl-warn-k">Before you file</div>
          {(plan?.warnings ?? []).map((w) => (
            <div className="rl-warn-t" key={w}>
              {w}
            </div>
          ))}
          {refused.map((c: StagedCovenant) => (
            <div className="rl-warn-t" key={c.covenantId}>
              {c.covenantName ?? c.covenantType ?? c.covenantId}: {c.reason ?? "not assessable in this plan"}
            </div>
          ))}
        </div>
      )}

      {held && <div className="rl-warn-h">{plan?.heldReason ?? "The org is holding execution on this plan."}</div>}

      <div className="wk-tokrow">
        <span className="wk-tok tnum">
          {flow.staging?.decisionToken
            ? `decision token · single use · ${flow.staging.decisionToken.slice(0, 4)}…${flow.staging.planHash.slice(-4)}`
            : flow.staging
              ? "no token on this plan"
              : "staging the plan…"}
        </span>
        <button
          type="button"
          className="wk-dt"
          onClick={(e) =>
            onOpenPeek(e.currentTarget, {
              kicker: "Governance",
              width: 440,
              content: (
                <div className="wk-prose">
                  Approver is the running identity: {approver ?? "not resolved in this view"}. Staging performs no
                  domain writes; the plan hash is immutable and the decision token is single use, bound to this plan
                  and this identity. Every step below is re-queried after it runs.
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
          {filing ? "Working…" : sealed ? "Approval closed" : held ? "Held by the org" : spec.approveLabel}
        </button>
      </div>
    </div>
  );
}

/* THE RESULT DOSSIER (rule 69). The card CONSTRUCTS itself: the header lands, a
   hairline draws across, each real row materialises ~300ms apart, a second
   hairline, then the check pops last. The halo behind it is the filing's only
   light and it breathes out on its own. */
function RelDossier({ dossier, lit }: { dossier: DossierModel; lit: boolean }) {
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
        <b>{dossier.title}</b>
      </div>
      <div className="rc-line" style={{ animationDelay: `${firstLine}ms` }} />
      {rows.map((row) => (
        <div className="rc-r" style={{ animationDelay: `${row.at}ms` }} key={`${row.label}-${row.value}`}>
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

/* =============================================================================
   THE ONE MOUNT.

   The mirror of `WorkroomHost`: it sits inside the app provider, so it is the
   only place in this room's tree that can see the read. The room itself takes a
   context and a route and asks nothing about where they came from — which is
   what keeps it testable without a provider above it.
   ============================================================================= */

/** The lane, or nothing. Built once per render rather than per line: the room
 *  takes a function and asks nothing about what is on the other end of it. */
function relBrainLane(): ((envelope: BrainEnvelope) => Promise<BrainReply>) | undefined {
  return brainReachable() ? (envelope: BrainEnvelope) => askBrain(envelope) : undefined;
}

export function RelationshipRoomHost() {
  const session = useRelationshipRoom();
  const { data, state, dispatch } = useApp();

  const accountId = session?.accountId ?? null;
  const bundle = useMemo(() => {
    if (!accountId) return null;
    const baked = resolveBundle(data, accountId);
    const patch = state.livePatches[accountId];
    return baked && patch ? { ...baked, ...patch } : baked;
  }, [data, state.livePatches, accountId]);

  const accountName = session?.accountName ?? null;
  const ctx = useMemo<RelContext | null>(() => {
    if (!accountId || !accountName) return null;
    return relContextFor({ data, bundle, accountId, accountName });
  }, [accountId, accountName, bundle, data]);

  const close = useCallback(() => {
    if (accountId) dispatch({ type: "ARM_WASH", accountId });
    closeRelationshipRoom();
  }, [accountId, dispatch]);

  const router = useMemo<RelRouter | undefined>(() => {
    if (!session) return undefined;
    const neutral = () => neutralRelAsk({ data, accountId: session.accountId });
    return {
      question: session.route ? null : session.opening ? smartRelAsk(session.opening) : neutral(),
      say: session.say,
      preselectCovenantId: session.covenantId,
      neutral,
      onBind: (route, opts) => bindRelRoute(route, opts),
      onRestart: (route, say) => restartRelRoute(route, say),
    };
  }, [data, session]);

  if (!ctx || !session) return null;
  /* Keyed on the route so binding one REBUILDS the room rather than carrying
     one review's collected answers into another. Route binding is final per
     plan, and this key is what makes that structural rather than a promise. */
  return (
    <RelationshipRoom
      key={`${session.accountId}-${session.route ?? "unbound"}`}
      ctx={ctx}
      route={session.route}
      router={router}
      /* THE SECOND LANE, WIRED HERE AND NOWHERE ELSE, on the same capability
         gate the facility room uses: with no mcp capability there is no arm of
         the bridge that returns a reply, so the prop is ABSENT and the room
         keeps the step machine alone. */
      brain={relBrainLane()}
      onClose={close}
    />
  );
}

/* ------------------------------------------------------------ the arc's read

   The opener the FAB calls needs a signal, and deriving it needs the cockpit's
   read. This is the one line the orchestrator wires the arc through, so the
   satellite does not have to know how a governance signal is derived. */
export function relOpeningForAccount(args: {
  data: Parameters<typeof relOpeningFor>[0]["data"];
  accountId: string;
}): RelOpening | null {
  return relOpeningFor({ data: args.data, bundle: resolveBundle(args.data, args.accountId) });
}

/** A stable key for a fresh idempotency key, exported so a test can pin the
 *  room's key discipline without reaching into the module. */
export const newRelKey = newRequestId;
