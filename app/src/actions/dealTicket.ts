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
 * What the hero value does to the figures the cockpit already renders.
 *
 * Collateral coverage only, because it is the only action whose input moves a
 * figure elsewhere in the product. The math is the same as the Exposure tab's:
 * lendable value over drawn. Any missing input returns [] and the readout does
 * not render — a coverage ratio computed from a guess is worse than silence.
 */
export function ticketDeltas(actionId: string, bundle: BorrowerBundle | null, values: Record<string, unknown>): TicketDelta[] {
  if (actionId !== "collateral-valuation" || !bundle) return [];

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
      note: `at the pledge's ${advanceRate} percent advance rate`,
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
