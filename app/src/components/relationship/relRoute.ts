import type { BorrowerBundle, C360Data, Covenant } from "../../data/contract";
import { dayDiff } from "../../data/time";
import { classifyCovenant } from "../../domain/covenantStatus";

/* =============================================================================
   THE RELATIONSHIP ROUTER — WHICH REVIEW TAKES THE SESSION.

   ONE ROOM, FIVE ROUTES. Annual review, covenant review, collateral valuation,
   risk-rating review and service request are the same room; what differs is
   which staged flow is behind it and what the room has to collect before it can
   stage. The room's FIRST QUESTION decides, and this module is everything that
   question needs: the neutral form, the five chips, the governance signal
   derived from the deal, and the thin shim that reads a route out of a typed
   line.

   PRESENTATION ORCHESTRATION, NOT A FLOW. Nothing here stages and nothing here
   writes. It decides which review the banker is running; `reviewFlows.ts` then
   drives the staged flow the ActionPanel has always driven, unchanged.

   NO SECOND NLP LAYER. The route words below are the coarsest possible read:
   which of the five reviews is this. Once the route is bound the room asks for
   the parameters that route needs, in its own guided steps, and never tries to
   pull them out of the sentence that named the route.

   THE CHANNEL-NONE DOCTRINE APPLIES TO THE GREETING SLOT. A signal is derived
   only from data the read actually carries. Two things a banker would expect to
   see here are DELIBERATELY ABSENT because nothing in the contract backs them:
   time since the last annual review (no review date is read anywhere) and a
   stale collateral valuation (`Collateral` carries no valuation date). Leading
   on either would be a suggestion the data never made.
   ============================================================================= */

export type RelRoute = "annual" | "covenant" | "valuation" | "rating" | "service";

/** The neutral form, when the relationship gives the room nothing to lead on.
 *  It names the register the room is in rather than listing five nouns: the
 *  chips below carry the list, and a question that also read it out would spend
 *  the opening view's whole budget saying the same thing twice. */
export const NEUTRAL_QUESTION =
  "Which review are we running on this relationship?";

/** The chip a governance signal offers instead of the yes it is proposing. */
export const SOMETHING_ELSE = "Something else";

export interface RelRouteChip {
  label: string;
  route: RelRoute;
}

/** The five routes, in the room's own option-pill style. The order is the order
 *  the governance calendar imposes them: the periodic review of the whole
 *  relationship, then the tests inside it, then the security behind it, then the
 *  rating that follows from all three, then the servicing ask that is none of
 *  them. */
export const REL_ROUTE_CHIPS: readonly RelRouteChip[] = [
  { label: "Annual review", route: "annual" },
  { label: "Covenant review", route: "covenant" },
  { label: "Collateral valuation", route: "valuation" },
  { label: "Risk-rating review", route: "rating" },
  { label: "Service request", route: "service" },
];

/** The room's own word for a route, for the sentence that refuses to switch and
 *  for the sentence that hands facility work back to the facility room. */
export const REL_ROUTE_WORD: Record<RelRoute, string> = {
  annual: "annual review",
  covenant: "covenant review",
  valuation: "collateral valuation",
  rating: "risk-rating review",
  service: "service request",
};

/* ------------------------------------------------------------ smart opening */

export interface RelOpening {
  /** The insight. A fact the read carries, then the question it implies. */
  line: string;
  /** The route the yes-chip binds. */
  route: RelRoute;
  yesLabel: string;
  /** The covenant the insight named, so binding the yes opens the brief on it.
   *  Null where the signal names no single covenant. */
  covenantId: string | null;
}

/** "Due soon", for a covenant test. The SAME window `nextMove.ts` and
 *  `worklist.ts` use, so "due soon" means one thing across the cockpit. */
export const COVENANT_DUE_DAYS = 45;

function dayWord(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "in 1 day";
  return `in ${d} days`;
}

function agoWord(d: number): string {
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/** The noun phrase for a covenant, in the org's own words. The fallback has to
 *  replace the WHOLE phrase: a bare `|| "covenant"` on the type reads as "the
 *  covenant test", which is not a thing anyone calls anything. */
function subjectFor(cov: Covenant): string {
  const type = (cov.covenantType ?? "").trim();
  return type ? `${type} test` : "covenant test";
}

/**
 * THE GOVERNANCE SIGNAL THE RELATIONSHIP CARRIES, or null.
 *
 * Three tiers, ranked by what a credit officer would want raised first:
 *
 *   1. a covenant in FINANCIAL BREACH — the org's own answer, via the shared
 *      classifier, never inferred from an administrative Exception. A breach is
 *      the trigger for reassessing the rating, so it opens the RATING route.
 *   2. a covenant test OVERDUE — its next evaluation date has passed and the
 *      test is neither breached nor waived. That is covenant-review work.
 *   3. a covenant test DUE inside the window. Same route, quieter clock.
 *
 * NULL IS THE COMMON CASE AND IT IS NOT A FAILURE. No signal means the neutral
 * five-way question, never an invented one. `today` is `meta.generatedAt`;
 * nothing here reaches a clock.
 */
export function relOpeningFor(args: { data: C360Data; bundle: BorrowerBundle | null }): RelOpening | null {
  const today = args.data.meta?.generatedAt ?? "";
  if (!today || dayDiff(today, today) === null) return null;
  const covenants = args.bundle?.covenants?.covenants ?? [];
  if (!covenants.length) return null;

  const judged = covenants.map((c) => ({ c, verdict: classifyCovenant(c), d: dayDiff(c.nextEvaluationDate, today) }));

  /* Tier 1 — a financial breach. Ties break on the covenant type name so the
     pick is deterministic over no other signal to break on. */
  const breached = judged
    .filter((x) => x.verdict.financialBreach)
    .sort((a, b) => (a.c.covenantType ?? "").localeCompare(b.c.covenantType ?? ""));
  if (breached.length) {
    const { c } = breached[0];
    return {
      line: `The ${subjectFor(c)} is in breach. Run the risk-rating review?`,
      route: "rating",
      yesLabel: "Open the risk-rating review",
      covenantId: c.covenantId ?? null,
    };
  }

  const testable = judged.filter(
    (x): x is { c: Covenant; verdict: ReturnType<typeof classifyCovenant>; d: number } =>
      x.d !== null && x.verdict.kind !== "breach" && x.verdict.kind !== "waived",
  );

  /* Tier 2 — overdue. The MOST overdue leads: an undelivered test from two
     months ago is a louder governance fact than one that slipped last week. */
  const overdue = testable.filter((x) => x.d < 0).sort((a, b) => a.d - b.d);
  if (overdue.length) {
    const { c, d } = overdue[0];
    return {
      line: `The ${subjectFor(c)} was due ${agoWord(-d)}. Run the covenant review?`,
      route: "covenant",
      yesLabel: "Open the covenant review",
      covenantId: c.covenantId ?? null,
    };
  }

  /* Tier 3 — due inside the window. The NEAREST leads. */
  const due = testable
    .filter((x) => x.d >= 0 && x.d <= COVENANT_DUE_DAYS)
    .sort((a, b) => a.d - b.d || (a.c.covenantType ?? "").localeCompare(b.c.covenantType ?? ""));
  if (due.length) {
    const { c, d } = due[0];
    return {
      line: `The ${subjectFor(c)} is due ${dayWord(d)}. Run the covenant review?`,
      route: "covenant",
      yesLabel: "Open the covenant review",
      covenantId: c.covenantId ?? null,
    };
  }

  return null;
}

/* -------------------------------------------------------------- route words */

/** "annual review", "the yearly review", "review the relationship". */
const ANNUAL = /\b(annual|yearly|periodic)\s+(review|credit\s+review)\b|\bannual\s+review\b|\breview\s+the\s+relationship\b/i;
/** "covenant review", "test the covenants", "covenant compliance". */
const COVENANT = /\bcovenant/i;
/** "revalue the collateral", "collateral valuation", "value the collateral",
 *  "appraisal". The bare verb "value" only counts WITH its object: "the value
 *  is fine" is an observation, not a request to open a valuation. */
const VALUATION =
  /\b(valuation|revalue|re-?value|appraisal|appraise)\b|\bcollateral\s+(value|review)\b|\bvalue\s+(the\s+|these\s+|this\s+)?(collateral|assets?|security)\b/i;
/** "risk rating", "re-rate", "downgrade", "upgrade the grade". */
const RATING = /\b(risk[-\s]?rating|re-?rate|re-?rating|downgrade|upgrade|regrade)\b|\brating\s+review\b/i;
/** "service request", "raise a ticket", "the client asked for a payoff quote". */
const SERVICE = /\b(service\s+request|servicing\s+request|raise\s+a\s+(ticket|request)|payoff|statement\s+request|open\s+a\s+ticket)\b/i;

/**
 * A LINE THAT NAMES FACILITY WORK. This room does not do it, and it says so
 * rather than routing a pledge into a valuation.
 *
 * The four words are the ones that name a FACILITY-CONTEXT change: pledging
 * security to a loan, cloning a covenant onto a renewal, modifying or renewing
 * what is booked. Creating a covenant on the ACCOUNT and creating a collateral
 * asset the relationship owns both live here (founder, 2026-08-31), so "create"
 * and "add" on their own are deliberately NOT in this set.
 */
const FACILITY_WORK =
  /\b(pledge\w*|unpledge\w*|release\s+the\s+(lien|collateral)|renew\w*|modif\w*|amend\w*|restructur\w*|new\s+facility|structure\s+a\s+(new\s+)?(facility|loan|line))\b/i;

/**
 * THE ROUTE A TYPED LINE BINDS, before any route is bound.
 *
 * FREE TEXT ALWAYS WINS: a banker who knows which review they are running types
 * it, the room binds, and the question retires without ever being answered. Null
 * where the line names no route at all — the room then repeats the question
 * rather than guessing, because guessing here picks a WRITE PATH.
 *
 * ORDER IS SPECIFICITY, not preference. "annual covenant review" is an annual
 * review that mentions covenants, and "collateral valuation" contains neither
 * word the rating test looks for. The narrowest phrase wins first.
 */
export function readRelRouteIntent(text: string): RelRoute | null {
  const line = text.trim();
  if (!line) return null;
  if (SERVICE.test(line)) return "service";
  if (VALUATION.test(line)) return "valuation";
  if (RATING.test(line)) return "rating";
  if (ANNUAL.test(line)) return "annual";
  return COVENANT.test(line) ? "covenant" : null;
}

/**
 * A LINE ASKING FOR A DIFFERENT REVIEW, inside a room already bound to one.
 *
 * Deliberately the same read as `readRelRouteIntent` and then a difference
 * test. Unlike the facility room there is no fallback tier to narrow away from:
 * every route word here already names a review explicitly, so a covenant review
 * that mentions "the collateral behind it" does not move the room unless the
 * banker says "valuation".
 */
export function readRelRouteSwitch(text: string, current: RelRoute): RelRoute | null {
  const route = readRelRouteIntent(text);
  return route && route !== current ? route : null;
}

/** TRUE where the line asks for FACILITY work this room does not do. The room
 *  answers with the handoff rather than routing it into the nearest review. */
export function asksForFacilityWork(text: string): boolean {
  const line = text.trim();
  if (!line) return false;
  return FACILITY_WORK.test(line);
}

/** The one-line handoff, in the room's own register. Facility-context creation
 *  (a covenant on a clone, create-then-pledge) stays in the facility room; this
 *  room says where it lives rather than half-doing it. */
export const FACILITY_HANDOFF =
  "That is facility work. Pledging security, cloning a covenant onto a renewal and reshaping a booked facility all run in Facility Actions on this relationship. This room takes the five reviews.";
