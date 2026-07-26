/* =============================================================================
   THE DEAL TICKET (WP8)

   Same plumbing, different object. The briefing was prose with the editable
   values embedded as chips; the ticket is a piece of work with a hierarchy:

     subject card      what this is, and what it acts on
     hero input        the one value that carries the decision
     delta readout     what that value does to the figures, live
     property pills    the remaining choices, each opening a sheet
     narrative cards   the drafted prose, collapsed until wanted

   NOTHING BELOW IS A SECOND SOURCE OF TRUTH. The fields, their order and which
   ones the banker owns all come from the SAME `PanelSchema` and the SAME
   briefing declaration the previous presentation read. This module only decides
   which of those fields is the hero and which are pills.

   The delta readout runs the product's own coverage math and renders NOTHING
   when an input is missing: an incomplete calculation shown as a number is
   worse than no number.
   ============================================================================= */

import type { BorrowerBundle } from "../data/contract";
import type { PanelSchema } from "./panelSchema";
import type { Briefing } from "./briefing";
import { fmtMoney } from "../data/format";
import { covenantCushion, fmtCovVal, fmtRatio } from "../data/finance";
import { isActiveFacility } from "../data/worklist";
import { draftForAction } from "./drafts";
import type { ReasonCode } from "../data/contract";

export interface TicketLayout {
  title: string;
  context: string;
  /** The one value the banker leads with. Absent when the action has none. */
  heroKey?: string;
  /** Everything else they own, in the briefing's reading order. */
  pillKeys: string[];
  /** Drafted narratives, collapsed. */
  sections: string[];
}

/** The value that carries each action. Everything else is a property. */
const HERO: Record<string, string> = {
  "collateral-valuation": "value",
  "create-service-request": "subject",
  "annual-review": "reviewType",
  "new-facility-request": "amount",
  "risk-rating-review": "overrideValue",
  "covenant-review": "assessmentResult",
  "loan-modification": "newCommitment",
  renewal: "newMaturityDate",
};

export function buildTicket(actionId: string, schema: PanelSchema, briefing: Briefing): TicketLayout {
  const owned = briefing.lead.flatMap((s) => (s.kind === "field" ? [s.fieldKey] : []));
  const heroKey = HERO[actionId] && owned.includes(HERO[actionId]) ? HERO[actionId] : undefined;
  return {
    title: briefing.subject.title,
    context: briefing.subject.context,
    heroKey,
    pillKeys: owned.filter((k) => k !== heroKey),
    sections: briefing.sections.filter((k) => schema.fields.some((f) => f.key === k)),
  };
}

/**
 * The heading a delta readout carries, and the caveat under it.
 *
 * Collateral valuation gets a different heading from every other action because
 * it is the one case where the figures move and the ORG DOES NOT: filing the
 * valuation records the number, and the collateral keeps its old value until
 * someone presses nCino's Add Valuation button (Probe 6, confirmed negative).
 */
export function deltaHeading(actionId: string): { title: string; caveat?: string } {
  if (actionId === "collateral-valuation") {
    return {
      title: "What this valuation implies",
      caveat:
        "Filing here records the valuation. It does not move the collateral value: nCino updates that from its own Add Valuation button, so coverage is unchanged until it does.",
    };
  }
  return { title: "What this changes" };
}

/** The prompt a pill or the hero shows when its value is still empty. */
export function promptFor(briefing: Briefing, fieldKey: string): string {
  for (const seg of briefing.lead) if (seg.kind === "field" && seg.fieldKey === fieldKey) return seg.prompt;
  return "choose";
}

/* ---------------------------------------------------------------- deltas */

export interface TicketDelta {
  label: string;
  before: string;
  after: string;
  direction: "up" | "down" | "flat";
  /** What the comparison is against, so the number is never free-floating. */
  note?: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * What the hero value MEANS for the figures the cockpit already renders.
 *
 * READ THE COLLATERAL CASE CAREFULLY. Probe 6 (PROBE-LEDGER wave 3) settled it
 * negative and permanently: filing a valuation does NOT move
 * `LLC_BI__Collateral__c.LLC_BI__Value__c`, not synchronously and not within 45
 * seconds, and the `Auto_Update_Collateral_Value` flag does not change that.
 * nCino binds the rollup to its own Add Valuation button and there is no
 * headless equivalent. The ledger's words: "Any future claim of coverage
 * improvement from a filed valuation is false."
 *
 * So this readout states what the NEW FIGURE IMPLIES, and the caller renders it
 * under a heading that says so. It is not a forecast of what filing will do.
 *
 * Any missing input returns [] and nothing renders — a coverage ratio computed
 * from a guess is worse than silence.
 */
export function ticketDeltas(actionId: string, bundle: BorrowerBundle | null, values: Record<string, unknown>): TicketDelta[] {
  if (!bundle) return [];
  if (actionId === "new-facility-request") return newFacilityDeltas(bundle, values);
  if (actionId === "loan-modification") return commitmentDeltas(bundle, num(values.newCommitment));
  if (actionId !== "collateral-valuation") return [];

  const proposed = num(values.value);
  if (proposed === null || proposed <= 0) return [];

  const facs = (bundle.exposure?.facilities ?? []).filter(isActiveFacility);
  const pledges = facs.flatMap((f) => f.collateral ?? []);
  if (!pledges.length) return [];

  // The pledge this valuation is against: the same largest-value selection the
  // schema anchors on.
  let target = pledges[0];
  for (const p of pledges) {
    const v = p.currentLendableValue ?? p.collateralValue ?? 0;
    const best = target.currentLendableValue ?? target.collateralValue ?? 0;
    if (v > best) target = p;
  }

  const advanceRate = num(target.advanceRate);
  const targetLendable = num(target.currentLendableValue);
  if (advanceRate === null || targetLendable === null) return [];

  let totalLendable = 0;
  for (const f of facs) {
    const v = num(f.totalLendableValue);
    if (v === null) return []; // a missing lendable value is not a zero
    totalLendable += v;
  }

  const proposedLendable = proposed * (advanceRate / 100);
  const lendableAfter = totalLendable - targetLendable + proposedLendable;

  const deltas: TicketDelta[] = [
    {
      label: "Lendable value",
      before: fmtMoney(totalLendable),
      after: fmtMoney(lendableAfter),
      direction: lendableAfter > totalLendable ? "up" : lendableAfter < totalLendable ? "down" : "flat",
      note: `at the pledge's ${advanceRate} percent advance rate, if the collateral is revalued`,
    },
  ];

  const drawn = num(bundle.exposure?.totalOutstanding);
  if (drawn !== null && drawn > 0) {
    const before = totalLendable / drawn;
    const after = lendableAfter / drawn;
    deltas.push({
      label: "Collateral coverage",
      before: fmtRatio(before),
      after: fmtRatio(after),
      direction: after > before ? "up" : after < before ? "down" : "flat",
      note: `against ${fmtMoney(drawn)} drawn`,
    });
  }

  return deltas;
}


/** A new facility adds to the book: what the relationship carries afterwards. */
function newFacilityDeltas(bundle: BorrowerBundle, values: Record<string, unknown>): TicketDelta[] {
  const amount = num(values.amount);
  const committed = num(bundle.exposure?.totalCommitted);
  if (amount === null || amount <= 0 || committed === null) return [];
  const after = committed + amount;
  return [
    {
      label: "Total committed",
      before: fmtMoney(committed),
      after: fmtMoney(after),
      direction: "up",
      note: `across this relationship's facilities`,
    },
  ];
}

/**
 * The modification's drama, and it is real drama: moving a commitment moves
 * coverage and leverage at once, and the banker should see both before staging.
 *
 * Coverage is lendable over the PROPOSED commitment (the suggestion engine's
 * own basis). Leverage is Boom's, restated against the new commitment only when
 * Boom staged the debt figure it was computed from; otherwise that line is
 * absent rather than approximated.
 */
function commitmentDeltas(bundle: BorrowerBundle, proposed: number | null): TicketDelta[] {
  const committed = num(bundle.exposure?.totalCommitted);
  if (proposed === null || proposed <= 0 || committed === null || committed <= 0) return [];

  const out: TicketDelta[] = [
    {
      label: "Commitment",
      before: fmtMoney(committed),
      after: fmtMoney(proposed),
      direction: proposed > committed ? "up" : proposed < committed ? "down" : "flat",
      note: "on this relationship",
    },
  ];

  let lendable = 0;
  let haveLendable = true;
  for (const f of (bundle.exposure?.facilities ?? []).filter(isActiveFacility)) {
    const v = num(f.totalLendableValue);
    if (v === null) haveLendable = false;
    else lendable += v;
  }
  if (haveLendable && lendable > 0) {
    const before = lendable / committed;
    const after = lendable / proposed;
    out.push({
      label: "Collateral coverage",
      before: fmtRatio(before),
      after: fmtRatio(after),
      direction: after > before ? "up" : after < before ? "down" : "flat",
      note: `${fmtMoney(lendable)} lendable against the commitment`,
    });
  }

  const ebitda = num(bundle.boom?.ratios?.ebitda);
  const leverage = num(bundle.boom?.ratios?.totalLeverage);
  if (ebitda !== null && ebitda > 0 && leverage !== null) {
    // Restated on the same EBITDA: the ask changes the debt, not the earnings.
    const after = leverage + (proposed - committed) / ebitda;
    out.push({
      label: "Total leverage",
      before: `${leverage.toFixed(2)}x`,
      after: `${after.toFixed(2)}x`,
      direction: after > leverage ? "down" : after < leverage ? "up" : "flat",
      note: `on ${fmtMoney(ebitda)} of EBITDA, earnings unchanged`,
    });
  }

  return out;
}

/* ------------------------------------------------------- what a review covers */

export interface TicketFact {
  label: string;
  value: string;
  note?: string;
}

/**
 * The annual review's equivalent of the valuation's delta: what this review
 * will actually cover, read from staged data.
 *
 * Same silence-over-invention rule. A missing input removes its LINE, it does
 * not produce a zero, an "unknown" or a dash: the strip states facts or says
 * nothing at all.
 */
export function reviewFacts(bundle: BorrowerBundle | null, reasons: ReasonCode[] = []): TicketFact[] {
  if (!bundle) return [];
  const facts: TicketFact[] = [];

  // Covenants: how many are measurable, how many hold, and where it is tightest.
  const covs = bundle.covenants?.covenants ?? [];
  const measured = covs.filter((c) => c.actualValue != null && c.thresholdValue != null);
  if (measured.length) {
    let tightest: { type: string; pct: number; actual: number; threshold: number } | null = null;
    let holding = 0;
    for (const c of measured) {
      const cu = covenantCushion(c.covenantType, c.actualValue!, c.thresholdValue!);
      if (cu.safe !== false) holding += 1;
      const pct = cu.safe === false ? -1 : cu.pct;
      if (!tightest || pct < tightest.pct) {
        tightest = { type: c.covenantType ?? "covenant", pct, actual: c.actualValue!, threshold: c.thresholdValue! };
      }
    }
    facts.push({
      label: "Covenants",
      value: `${holding} of ${measured.length} within threshold`,
      note: tightest
        ? `tightest is ${tightest.type} at ${fmtCovVal(tightest.actual)} against ${fmtCovVal(tightest.threshold)}`
        : undefined,
    });
  }

  // Utilisation: only when BOTH sides are staged. One without the other is not
  // a percentage of anything.
  const committed = bundle.exposure?.totalCommitted;
  const drawn = bundle.exposure?.totalOutstanding;
  if (typeof committed === "number" && committed > 0 && typeof drawn === "number") {
    facts.push({
      label: "Utilisation",
      value: `${Math.round((drawn / committed) * 100)} percent`,
      note: `${fmtMoney(drawn)} drawn of ${fmtMoney(committed)} committed`,
    });
  }

  const active = (bundle.exposure?.facilities ?? []).filter(isActiveFacility);
  if (active.length) {
    facts.push({
      label: "In scope",
      value: `${active.length} active ${active.length === 1 ? "facility" : "facilities"}`,
      note: bundle.snapshot?.primaryRiskRating ? `carried at grade ${bundle.snapshot.primaryRiskRating}` : undefined,
    });
  }

  // What the drafted narratives will carry. Every figure in them is registered
  // against a staged path, which is the claim worth making here.
  const drafts = draftForAction("annual-review", bundle, reasons);
  const written = Object.values(drafts).filter((d) => d.text);
  if (written.length) {
    const figures = new Set(written.flatMap((d) => d.figures.map((f) => f.rendered)));
    facts.push({
      label: "Narratives",
      value: `${written.length} drafted`,
      note: figures.size ? `citing ${figures.size} staged ${figures.size === 1 ? "figure" : "figures"}, each traceable` : undefined,
    });
  }

  return facts;
}


/**
 * What a rating review has to work with: the grade on file, and the computed
 * grade WHEN the staged inputs derive one.
 *
 * There is no grade model in the artifact, so a computed grade is only ever
 * reported when the org itself staged one. Inventing a number here would be the
 * worst kind of fabrication: a credit grade that looks computed and is not.
 */
export function ratingFacts(bundle: BorrowerBundle | null, values: Record<string, unknown> = {}): TicketFact[] {
  if (!bundle) return [];
  const facts: TicketFact[] = [];
  const grade = bundle.snapshot?.primaryRiskRating;
  if (grade != null) facts.push({ label: "Current grade", value: `Grade ${grade}`, note: "on file in nCino" });

  const computed = bundle.snapshot?.computedRiskRating;
  if (computed != null) {
    facts.push({
      label: "Computed grade",
      value: `Grade ${computed}`,
      note: grade != null && String(computed) !== String(grade) ? "differs from the grade on file" : "agrees with the grade on file",
    });
  }

  const override = num(values.overrideValue);
  if (override !== null && override > 0) {
    facts.push({
      label: "Override",
      value: `Grade ${override}`,
      note: "a banker's call, and the org requires a stated reason",
    });
  }
  return facts;
}
