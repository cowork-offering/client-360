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
import { fmtRatio } from "../data/finance";
import { isActiveFacility } from "../data/worklist";

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
