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

import type { BorrowerBundle, Facility } from "../data/contract";
import type { PanelSchema } from "./panelSchema";
import type { Briefing } from "./briefing";
import { fmtMoney } from "../data/format";
import { covenantCushion, fmtCovVal, fmtRatio } from "../data/finance";
import { isActiveFacility } from "../data/worklist";
import { shortFacilityLabel } from "../data/facilityStage";
import { draftForAction } from "./drafts";
import type { ReasonCode } from "../data/contract";

/**
 * N OF M SELECTED, EVERYWHERE A SELECTION IS COUNTED.
 *
 * A bare "1 facility" on a ticket anchored to a seven-member package reads as
 * the package's own size, and the founder read it exactly that way on
 * 2026-08-26. The deal HEADER may state a plain total, because that is what it
 * is. Every selection-scoped label states both numbers.
 */
export function selectionLabel(selected: number, total: number): string {
  return `${selected} of ${total} selected`;
}

/**
 * How many facilities the deal has: the active members of that product package,
 * or the relationship's active facilities when the read stages no package at
 * all. The denominator behind `selectionLabel` on every facility surface.
 */
export function packageFacilityCount(bundle: BorrowerBundle | null, packageId: string | null | undefined): number {
  const active = (bundle?.exposure?.facilities ?? []).filter(isActiveFacility);
  if (!packageId || !active.some((f) => f.productPackageId)) return active.length;
  return active.filter((f) => f.productPackageId === packageId).length;
}

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
  // NO HERO. A package-scoped covenant review has no single value that carries
  // it: the verdict is per covenant and lives on the covenant row itself.
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
  if (actionId === "loan-modification") return commitmentDeltas(bundle, num(values.newCommitment), values.facility);
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

  const totalLendable = relationshipLendable(bundle, facs);
  if (totalLendable === null) return [];

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


/**
 * The relationship's lendable base for a what-if.
 *
 * The org's DISTINCT-collateral figure when the read carries it — that is the
 * quantity a revaluation actually moves. Older bundles fall back to the sum of
 * facility PLEDGED SHARES, which is second best but never the double count:
 * a share is this facility's slice, not the whole asset repeated per pledge.
 * A missing share is not a zero, so the whole delta is withheld instead.
 */
function relationshipLendable(bundle: BorrowerBundle, facs: Facility[]): number | null {
  const unique = num(bundle.exposure?.totalUniqueCollateralLendableValue);
  if (unique !== null) return unique;

  let total = 0;
  for (const f of facs) {
    const v = num(f.totalPledgedValue ?? f.totalLendableValue);
    if (v === null) return null;
    total += v;
  }
  return total;
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
 * AGGREGATED OVER THE SELECTED MEMBERS, because that is the wire semantic.
 * `requestedAmount` is ONE scalar applied to EVERY facility in `facilityIds`,
 * so a selection of three at 4MM each asking for 5MM adds 3MM to the book, not
 * a move from the relationship's total to 5MM. The old reading was only ever
 * right on a relationship with exactly one facility, and it was silently wrong
 * everywhere else.
 *
 * Coverage is lendable over the relationship's commitment AFTER the change.
 * Leverage is Boom's, restated on the selected members' delta and only when
 * Boom staged the debt figure it was computed from; otherwise that line is
 * absent rather than approximated.
 *
 * SILENCE OVER INVENTION, unchanged: no selection, an unresolvable member or a
 * member with no committed figure returns nothing at all. A partial sum shown
 * as a total is worse than no number.
 */
function commitmentDeltas(bundle: BorrowerBundle, proposed: number | null, selection: unknown): TicketDelta[] {
  const committed = num(bundle.exposure?.totalCommitted);
  if (proposed === null || proposed <= 0 || committed === null || committed <= 0) return [];

  const picked = [...new Set(Array.isArray(selection) ? (selection as string[]) : [])];
  if (!picked.length) return [];

  const facilities = bundle.exposure?.facilities ?? [];
  const members = picked.map((id) => facilities.find((f) => f.loanId === id));
  if (members.some((f) => !f || num(f.committed) === null)) return [];

  const n = members.length;
  // The deal the selection sits on, so the note can say "2 of 7 selected".
  const scope = packageFacilityCount(bundle, members[0]!.productPackageId);
  const selected = members.reduce((sum, f) => sum + (f!.committed as number), 0);
  // Each member moves TO the proposed figure, so the selection carries n × it.
  const selectedAfter = proposed * n;
  const after = committed - selected + selectedAfter;

  const out: TicketDelta[] = [
    {
      label: "Commitment",
      before: fmtMoney(selected),
      after: fmtMoney(selectedAfter),
      direction: selectedAfter > selected ? "up" : selectedAfter < selected ? "down" : "flat",
      // The selection is stated as a fraction of the deal on BOTH branches: a
      // note reading "on CapEx" or "across 2 facilities" left the banker to
      // guess how much of the package the move covers.
      note:
        n === 1
          ? `on ${shortFacilityLabel(members[0]!, bundle.snapshot?.name) || "the selected facility"}, ${selectionLabel(n, scope)}`
          : `${selectionLabel(n, scope)}, each moving to ${fmtMoney(proposed)}`,
    },
  ];

  const lendable = relationshipLendable(bundle, facilities.filter(isActiveFacility));
  if (lendable !== null && lendable > 0 && after > 0) {
    const before = lendable / committed;
    const now = lendable / after;
    out.push({
      label: "Collateral coverage",
      before: fmtRatio(before),
      after: fmtRatio(now),
      direction: now > before ? "up" : now < before ? "down" : "flat",
      note: `${fmtMoney(lendable)} lendable against the relationship's ${fmtMoney(after)} commitment after this`,
    });
  }

  const ebitda = num(bundle.boom?.ratios?.ebitda);
  const leverage = num(bundle.boom?.ratios?.totalLeverage);
  if (ebitda !== null && ebitda > 0 && leverage !== null) {
    // Restated on the same EBITDA: the ask changes the debt, not the earnings.
    const now = leverage + (selectedAfter - selected) / ebitda;
    out.push({
      label: "Total leverage",
      before: `${leverage.toFixed(2)}x`,
      after: `${now.toFixed(2)}x`,
      direction: now > leverage ? "down" : now < leverage ? "up" : "flat",
      note: `on ${fmtMoney(ebitda)} of EBITDA, earnings unchanged`,
    });
  }

  return out;
}

/* ------------------------------------------------------------- security (F6) */

export interface SecurityPledge {
  /** The org's own name for the collateral, with its description when staged. */
  name: string;
  description?: string;
  /** Type, lien position and whether the pledge is the primary one. */
  facts: string;
  /** This facility's SHARE, the advance rate, and the collateral's lendable
   *  value — the three figures a banker reads a pledge by. */
  figures: string;
}

export interface SecurityRow {
  loanId: string;
  facility: string;
  pledges: SecurityPledge[];
  /** Present INSTEAD of pledges, in banker language, when there are none or
   *  when the read does not carry them. Two different facts, two sentences. */
  note?: string;
  /** This facility's pledged share of collateral, org-computed. */
  share: number | null;
}

export interface SecurityContext {
  rows: SecurityRow[];
  /**
   * The relationship's whole lendable collateral — the SAME numerator the
   * coverage check divides by the commitment. Stated here so the challenge
   * card's ratio and these rows are visibly one calculation rather than two
   * unrelated blocks on one screen (founder finding F6, 2026-08-25).
   */
  coverageBasis: number | null;
}

/**
 * WHAT SECURES THE FACILITIES THE BANKER JUST TICKED.
 *
 * Same principle as the covenant context: a member selection is not just a name
 * and an amount, it is a position, and the position is what the security says.
 * Read straight off `exposure.facilities[].collateral[]`, which the org already
 * stages per pledge with its share, advance rate and lien.
 *
 * HONEST GAPS. A facility with an EMPTY pledge list says it carries no
 * collateral. A facility whose read does not carry the list at all says that
 * instead, and the two never render the same way. Where the org itself supplies
 * a reason (`coverageNote`) that reason is rendered rather than paraphrased.
 */
export function securityContext(bundle: BorrowerBundle | null, selection: unknown): SecurityContext | null {
  const picked = [...new Set(Array.isArray(selection) ? (selection as string[]) : [])];
  if (!bundle || !picked.length) return null;

  const facilities = bundle.exposure?.facilities ?? [];
  const relationship = bundle.snapshot?.name;
  const rows: SecurityRow[] = [];

  for (const id of picked) {
    const f = facilities.find((x) => x.loanId === id);
    if (!f) continue;
    const pledges = f.collateral;
    const row: SecurityRow = {
      loanId: id,
      facility: shortFacilityLabel(f, relationship),
      pledges: [],
      share: num(f.totalPledgedValue ?? f.totalLendableValue),
    };

    if (!Array.isArray(pledges)) {
      row.note = "The security for this facility is not carried in this read, so what secures it could not be shown.";
    } else if (!pledges.length) {
      row.note = f.coverageNote ?? "No collateral is pledged to this facility.";
    } else {
      row.pledges = pledges.map((p) => ({
        name: p.collateralName ?? p.collateralType ?? "Pledged collateral",
        description: p.collateralDescription,
        facts: [p.collateralType, p.lienPosition ? `${p.lienPosition} lien` : null, p.isPrimary ? "primary" : null]
          .filter(Boolean)
          .join(" · "),
        figures:
          [
            p.amountPledged != null ? `${fmtMoney(p.amountPledged)} pledged here` : null,
            p.advanceRate != null ? `${p.advanceRate} percent advance` : null,
            p.currentLendableValue != null ? `${fmtMoney(p.currentLendableValue)} lendable in total` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "no figures staged against this pledge",
      }));
      // The org's own reason still travels where it gave one.
      if (f.coverageNote) row.note = f.coverageNote;
    }
    rows.push(row);
  }

  if (!rows.length) return null;
  return { rows, coverageBasis: relationshipLendable(bundle, facilities.filter(isActiveFacility)) };
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
export function reviewFacts(
  bundle: BorrowerBundle | null,
  reasons: ReasonCode[] = [],
  /** The deal the review is filed against, when the ticket has one picked. */
  packageId?: string | null,
): TicketFact[] {
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
        ? `tightest is ${tightest.type} at ${fmtCovVal(tightest.actual, tightest.type)} against ${fmtCovVal(tightest.threshold, tightest.type)}`
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

  // WHAT THE REVIEW COVERS, AGAINST WHAT THE RELATIONSHIP CARRIES. The review
  // is filed against ONE product package while the bundle is the whole
  // relationship, so a bare count here reads as either and is reliably misread
  // as the deal's size. Both numbers, whenever they differ.
  const active = (bundle.exposure?.facilities ?? []).filter(isActiveFacility);
  const scoped = packageId ? active.filter((f) => f.productPackageId === packageId) : active;
  const covered = scoped.length || active.length;
  if (active.length) {
    facts.push({
      label: "In scope",
      value:
        covered === active.length
          ? `${active.length} active ${active.length === 1 ? "facility" : "facilities"}`
          : `${covered} of ${active.length} active facilities`,
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
