/* =============================================================================
   DETERMINISTIC NARRATIVE DRAFTING (WP7.2)

   The agent drafts everything it can already know, so the banker confirms prose
   rather than composing it from a blank field.

   THESE ARE NOT LLM CALLS. Every sentence below is assembled from staged
   figures by pure functions. That buys three things at once: no connector
   budget, no latency, and an SR 11-7 clean surface, because a third party can
   recompute every drafted sentence from the same staged data.

   THE HARD RULE: a drafted narrative may never invent a number. Every figure a
   draft renders is registered in `figures[]` with the staged path it came from
   (or the derivation and its inputs). `draftFigureViolations()` walks the
   finished prose and fails on any money, ratio or percent token that is not
   registered, and the test suite runs it over every draft.

   Provenance stays AGENT: the prose is agent-composed even though the figures
   inside it are NCINO. Editing it flips on NarrativeAttribution and never
   changes the kind (A33.1.7).
   ============================================================================= */

import type { BorrowerBundle, Covenant, ReasonCode } from "../data/contract";
import type { PanelSchema } from "./panelSchema";
import { fmtMoney } from "../data/format";
import { covenantCushion } from "../data/finance";
import { aggregateInvolvements, isGuarantyRole } from "../data/graphAggregate";
import { isActiveFacility } from "../data/worklist";

/** One figure rendered inside drafted prose, with where it came from. */
export interface DraftFigure {
  /** Exactly as it appears in the text. */
  rendered: string;
  /** Dotted path into the staged bundle. */
  path: string;
  /** Present when the figure is computed rather than read. */
  derivation?: string;
}

export interface Draft {
  text: string;
  figures: DraftFigure[];
}

const empty: Draft = { text: "", figures: [] };

/** Render a staged money value and register it in one step. */
export function money(value: number | null | undefined, path: string, figures: DraftFigure[]): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const rendered = fmtMoney(value);
  figures.push({ rendered, path });
  return rendered;
}

function ratio(value: number | null | undefined, path: string, figures: DraftFigure[]): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const rendered = `${Number(value).toFixed(2)}x`;
  figures.push({ rendered, path });
  return rendered;
}

function percent(value: number, path: string, derivation: string, figures: DraftFigure[]): string {
  const rendered = `${Math.round(value)} percent`;
  figures.push({ rendered, path, derivation });
  return rendered;
}

/** Money or ratio, whichever the covenant's magnitude implies. */
function covFigure(value: number | null | undefined, path: string, figures: DraftFigure[]): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.abs(value) >= 1000 ? money(value, path, figures) : ratio(value, path, figures);
}

function sentences(parts: Array<string | null>): string {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------- shared reads */

const activeFacilities = (b: BorrowerBundle) => (b.exposure?.facilities ?? []).filter(isActiveFacility);

/**
 * The relationship's lendable value AND the path it came from, so the drafted
 * sentence cites the field it actually read.
 *
 * The org's distinct-collateral figure first. Older bundles fall back to the
 * sum of facility PLEDGED SHARES; nothing here ever sums pledge lendable
 * values, which repeat the whole asset once per pledge.
 */
function lendableBasis(b: BorrowerBundle): { value: number; path: string } | null {
  const unique = b.exposure?.totalUniqueCollateralLendableValue;
  if (unique != null) return { value: unique, path: "borrower.exposure.totalUniqueCollateralLendableValue" };

  let total: number | null = null;
  for (const x of activeFacilities(b)) {
    const v = x.totalPledgedValue ?? x.totalLendableValue;
    if (v != null) total = (total ?? 0) + v;
  }
  return total === null ? null : { value: total, path: "borrower.exposure.facilities[].totalLendableValue" };
}

function tightestCovenant(covs: Covenant[]): { cov: Covenant; pct: number } | null {
  let best: { cov: Covenant; pct: number } | null = null;
  for (const c of covs) {
    if (c.actualValue == null || c.thresholdValue == null) continue;
    const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
    const pct = cu.safe === false ? -1 : cu.pct;
    if (!best || pct < best.pct) best = { cov: c, pct };
  }
  return best;
}

/* -------------------------------------------------------- annual review */

export function draftRelationshipSummary(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const snap = b.snapshot ?? { accountId: "" };
  const exp = b.exposure ?? {};
  const name = snap.name ?? "The borrower";
  const grade = snap.primaryRiskRating;

  const committed = money(exp.totalCommitted ?? snap.totalCreditExposure, "borrower.exposure.totalCommitted", f);
  const drawn = money(exp.totalOutstanding ?? snap.totalOutstanding, "borrower.exposure.totalOutstanding", f);
  const revenue = money(snap.annualRevenue, "borrower.snapshot.annualRevenue", f);
  const facs = activeFacilities(b);

  const lead = grade
    ? `${name} is carried at risk grade ${grade}`
    : `${name} is not currently rated in the source system`;
  const exposure = committed ? `, with ${committed} committed${drawn ? ` and ${drawn} drawn` : ""}` : "";
  const structure = facs.length
    ? ` The relationship is structured across ${facs.length} active ${facs.length === 1 ? "facility" : "facilities"}.`
    : "";
  const industry = snap.industry ? ` The borrower operates in ${snap.industry}${revenue ? ` on ${revenue} of annual revenue` : ""}.` : "";

  return { text: `${lead}${exposure}.${structure}${industry}`, figures: f };
}

export function draftStrengths(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const covs = b.covenants?.covenants ?? [];
  const parts: Array<string | null> = [];

  const compliant = covs.filter((c) => {
    const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
    return cu.safe === true;
  });
  if (compliant.length) {
    parts.push(
      `All ${compliant.length === covs.length ? "" : `${compliant.length} of ${covs.length} `}measured covenants are within threshold.`.replace(
        /\s+/g,
        " ",
      ),
    );
    const best = compliant[0];
    const actual = covFigure(best.actualValue, "borrower.covenants.covenants[].actualValue", f);
    const threshold = covFigure(best.thresholdValue, "borrower.covenants.covenants[].thresholdValue", f);
    if (actual && threshold) {
      parts.push(`${best.covenantType ?? "The lead covenant"} stands at ${actual} against a ${threshold} requirement.`);
    }
  }

  const exp = b.exposure ?? {};
  if (exp.totalCommitted && exp.totalOutstanding != null && exp.totalCommitted > 0) {
    const util = (exp.totalOutstanding / exp.totalCommitted) * 100;
    if (util < 80) {
      const rendered = percent(util, "borrower.exposure.totalOutstanding", "outstanding divided by committed", f);
      parts.push(`Utilisation sits at ${rendered} of the committed lines, leaving undrawn capacity.`);
    }
  }

  const basis = lendableBasis(b);
  if (basis && exp.totalOutstanding != null && exp.totalOutstanding > 0 && basis.value >= exp.totalOutstanding) {
    const lv = money(basis.value, basis.path, f);
    if (lv) parts.push(`Pledged collateral carries ${lv} of lendable value against the drawn balance.`);
  }

  return parts.length ? { text: sentences(parts), figures: f } : empty;
}

export function draftWeaknesses(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const covs = b.covenants?.covenants ?? [];
  const parts: Array<string | null> = [];

  const tight = tightestCovenant(covs);
  if (tight) {
    const actual = covFigure(tight.cov.actualValue, "borrower.covenants.covenants[].actualValue", f);
    const threshold = covFigure(tight.cov.thresholdValue, "borrower.covenants.covenants[].thresholdValue", f);
    if (actual && threshold) {
      if (tight.pct < 0) {
        parts.push(`${tight.cov.covenantType ?? "A covenant"} is at or past its threshold, measured at ${actual} against ${threshold}.`);
      } else {
        const cushion = percent(tight.pct, "borrower.covenants.covenants[].thresholdValue", "cushion divided by threshold", f);
        parts.push(
          `The tightest covenant is ${tight.cov.covenantType ?? "unnamed"}, at ${actual} against ${threshold}, leaving roughly ${cushion} of cushion.`,
        );
      }
    }
  }

  const exp = b.exposure ?? {};
  if (exp.totalCommitted && exp.totalOutstanding != null && exp.totalCommitted > 0) {
    const util = (exp.totalOutstanding / exp.totalCommitted) * 100;
    if (util >= 80) {
      const rendered = percent(util, "borrower.exposure.totalOutstanding", "outstanding divided by committed", f);
      parts.push(`Utilisation is elevated at ${rendered} of committed lines, which limits headroom.`);
    }
  }

  const boom = b.boom?.ratios;
  if (boom?.totalLeverage != null) {
    const lev = ratio(boom.totalLeverage, "borrower.boom.ratios.totalLeverage", f);
    const ebitda = money(boom.ebitda, "borrower.boom.ratios.ebitda", f);
    if (lev) parts.push(`Leverage stands at ${lev}${ebitda ? ` on ${ebitda} of EBITDA` : ""}.`);
  }

  return parts.length ? { text: sentences(parts), figures: f } : empty;
}

/** Seeded from the worklist reason, which is why this action is on the queue. */
export function draftRecommendation(_b: BorrowerBundle, reasons: ReasonCode[]): Draft {
  const f: DraftFigure[] = [];
  const lead = "Recommend continuing the relationship on current terms, subject to the review below.";
  const byReason: Partial<Record<ReasonCode, string>> = {
    CLIENT_REQUEST: "An inbound client request is open and should be answered as part of this review.",
    COVENANT_BREACH: "A covenant is at or past its threshold and needs a documented position before anything else moves.",
    COVENANT_DUE: "A covenant test falls due shortly, so the compliance position should be refreshed alongside this review.",
    MATURITY_NEAR: "A facility matures inside the watch window, so the renewal decision should be taken in this cycle.",
    MODIFICATION_CLUSTER: "Repeated modifications on this relationship warrant a look at whether the structure still fits.",
    GUARANTOR_SIGNAL: "A guarantor signal is on file and should be assessed as part of the review.",
    RECENTLY_MODIFIED: "The structure was modified recently, so this review should confirm the revised terms are performing.",
  };
  const drivers = reasons.map((r) => byReason[r]).filter(Boolean) as string[];
  return { text: sentences([lead, ...drivers]), figures: f };
}

export function draftCollateralAnalysis(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const facs = activeFacilities(b);
  const pledges = facs.flatMap((x) => x.collateral ?? []);
  if (!pledges.length) {
    return { text: "No collateral is pledged against the active facilities on this relationship.", figures: f };
  }

  const types = [...new Set(pledges.map((p) => p.collateralType).filter(Boolean))] as string[];
  const basis = lendableBasis(b);

  const parts: Array<string | null> = [
    `Security comprises ${pledges.length} ${pledges.length === 1 ? "pledge" : "pledges"}${types.length ? ` across ${types.join(", ")}` : ""}.`,
  ];
  const lv = basis ? money(basis.value, basis.path, f) : null;
  const drawn = money(b.exposure?.totalOutstanding, "borrower.exposure.totalOutstanding", f);
  if (lv) parts.push(`Total lendable value is ${lv}${drawn ? ` against ${drawn} drawn` : ""}.`);

  // A DRAWN facility the org cannot rate carries its own reason. That is the
  // material fact in a collateral analysis, and it is repeated verbatim rather
  // than left as the silence it used to be. Undrawn facilities are not listed:
  // "nothing to cover" is not a finding.
  for (const x of facs) {
    if (x.coverageNote && (x.outstanding ?? 0) > 0) parts.push(`${x.name ?? "One facility"}: ${x.coverageNote}`);
  }

  return { text: sentences(parts), figures: f };
}

export function draftFinancialAnalysis(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const r = b.boom?.ratios;
  if (!r) return { text: "No spread financials are staged for this borrower in this view.", figures: f };

  const parts: Array<string | null> = [];
  const revenue = money(r.revenue, "borrower.boom.ratios.revenue", f);
  const ebitda = money(r.ebitda, "borrower.boom.ratios.ebitda", f);
  const lev = ratio(r.totalLeverage, "borrower.boom.ratios.totalLeverage", f);
  const cover = ratio(r.interestCoverage, "borrower.boom.ratios.interestCoverage", f);

  if (revenue || ebitda) parts.push(`The spread shows ${[revenue && `${revenue} of revenue`, ebitda && `${ebitda} of EBITDA`].filter(Boolean).join(" and ")}.`);
  if (lev) parts.push(`Leverage measures ${lev}.`);
  if (cover) parts.push(`Interest coverage measures ${cover}.`);

  return parts.length ? { text: sentences(parts), figures: f } : { text: "No spread financials are staged for this borrower in this view.", figures: f };
}

/**
 * THE GUARANTORS, COUNTED AS PEOPLE AND COMPANIES RATHER THAN AS ORG ROWS.
 *
 * The org writes the guaranty once per loan, so the pinned Hartwell read
 * carries 14 guaranty rows for three guarantors. Counted raw this narrative
 * said "supported by 14 guarantors" and then named the same company six times
 * in a row - a sentence that would go into a credit memo.
 */
export function draftGuarantorNarrative(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const guarantors = aggregateInvolvements(b.graph?.legalEntities).filter(isGuarantyRole);
  if (!guarantors.length) return { text: "No guarantor is recorded against this relationship in the source system.", figures: f };
  const names = guarantors.map((g) => g.accountName).filter(Boolean).join(", ");
  const types = [...new Set(guarantors.map((g) => g.guarantyAmountType).filter(Boolean))].join(", ");
  return {
    text: `The credit is supported by ${guarantors.length} ${guarantors.length === 1 ? "guarantor" : "guarantors"}${names ? `: ${names}` : ""}.${types ? ` Guaranty type on file is ${types}.` : ""}`,
    figures: f,
  };
}

export function draftRiskRatingComments(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const snap = b.snapshot ?? { accountId: "" };
  if (!snap.primaryRiskRating) {
    return { text: "No risk rating is on file for this borrower, so no rating position is stated here.", figures: f };
  }
  const stage = snap.primaryStage ? ` The package currently sits at ${snap.primaryStage}.` : "";
  return {
    text: `The borrower is carried at grade ${snap.primaryRiskRating} on the nCino scale, and this review does not propose a change.${stage}`,
    figures: f,
  };
}

export function draftReviewNarrative(b: BorrowerBundle, reasons: ReasonCode[]): Draft {
  const summary = draftRelationshipSummary(b);
  const rec = draftRecommendation(b, reasons);
  return { text: sentences([summary.text, rec.text]), figures: [...summary.figures, ...rec.figures] };
}

/* ------------------------------------------------------ other two actions */

export function draftValuationDescription(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  let best: { type?: string; value?: number; facility?: string } | null = null;
  for (const x of activeFacilities(b)) {
    for (const c of x.collateral ?? []) {
      const v = c.currentLendableValue ?? c.collateralValue;
      if (!best || (v ?? 0) > (best.value ?? 0)) best = { type: c.collateralType, value: v, facility: x.name };
    }
  }
  if (!best) return { text: "No pledged collateral is staged for this relationship in this view.", figures: f };

  const carried = money(best.value, "borrower.exposure.facilities[].collateral[].currentLendableValue", f);
  return {
    text: `Revaluation of the ${best.type ?? "pledged"} security${best.facility ? ` held against the ${best.facility}` : ""}${carried ? `, currently carried at ${carried}` : ""}. Supporting evidence to be attached to the valuation record.`,
    figures: f,
  };
}

export function draftServiceRequestSummary(b: BorrowerBundle): Draft {
  const f: DraftFigure[] = [];
  const req = (b.requests ?? [])[0];
  if (!req) return empty;

  // The client's own words are the fact; we restate, never embellish. Any
  // figure inside them is quoted, so it traces to the summary itself.
  if (req.summary) {
    for (const rendered of extractFigures(req.summary)) {
      f.push({ rendered, path: "borrower.requests[].summary", derivation: "quoted from the client's own summary" });
    }
    return { text: req.summary, figures: f };
  }

  const ask = req.ask;
  if (ask) {
    const from = money(ask.from, "borrower.requests[].ask.from", f);
    const to = money(ask.to, "borrower.requests[].ask.to", f);
    const kind = (ask.type ?? "request").replace(/[_-]+/g, " ");
    return { text: `Client request received: ${kind}${from && to ? ` from ${from} to ${to}` : ""}.`, figures: f };
  }
  return empty;
}

/* -------------------------------------------------------- traceability */

/** Money, ratio and percent tokens as this app renders them. */
const FIGURE_PATTERN = /\$[\d,]+(?:\.\d+)?[KMB]?|\b\d+(?:\.\d+)?x\b|\b\d+ percent\b/g;

export function extractFigures(text: string): string[] {
  return text.match(FIGURE_PATTERN) ?? [];
}

/**
 * THE HARD TEST (WP7.2). Returns every figure in the prose that is not
 * registered against a staged path. A non-empty result means a draft invented a
 * number, which is the one thing drafting may never do.
 */
export function figureViolations(text: string, figures: DraftFigure[]): string[] {
  const registered = new Set(figures.map((x) => x.rendered));
  return extractFigures(text).filter((x) => !registered.has(x));
}

export function draftFigureViolations(draft: Draft): string[] {
  return figureViolations(draft.text, draft.figures);
}

/* ------------------------------------------------------------- assembly */

export interface DraftedNarratives {
  [fieldKey: string]: Draft;
}

/** Overlay the drafts onto a schema: every AGENT_NARRATIVE field the panel would
 *  otherwise open empty is filled with what the agent already knows, and cites
 *  the staged paths its figures came from. Fields that already carry a value
 *  (the client's own words, an nCino figure) are left exactly as they were. */
export function withDrafts(
  schema: PanelSchema,
  actionId: string,
  bundle: BorrowerBundle | null,
  reasons: ReasonCode[] = [],
): PanelSchema {
  const drafts = draftForAction(actionId, bundle, reasons);
  if (!Object.keys(drafts).length) return schema;

  return {
    ...schema,
    fields: schema.fields.map((field) => {
      const draft = drafts[field.key];
      const empty = field.value === null || field.value === undefined || field.value === "";
      if (!draft?.text || !empty || field.prefill.source !== "AGENT_NARRATIVE") return field;
      const paths = [...new Set(draft.figures.map((x) => x.path))];
      return {
        ...field,
        value: draft.text,
        prefill: {
          ...field.prefill,
          citation: paths.length ? `Drafted from ${paths.join(", ")}` : "Drafted from the staged relationship record",
        },
      };
    }),
  };
}

/** All drafts for an action, keyed by the panel field they fill. */
export function draftForAction(actionId: string, bundle: BorrowerBundle | null, reasons: ReasonCode[] = []): DraftedNarratives {
  if (!bundle) return {};
  if (actionId === "annual-review") {
    return {
      narrative: draftReviewNarrative(bundle, reasons),
      relationshipSummary: draftRelationshipSummary(bundle),
      strengths: draftStrengths(bundle),
      weaknesses: draftWeaknesses(bundle),
      recommendation: draftRecommendation(bundle, reasons),
      collateralAnalysis: draftCollateralAnalysis(bundle),
      financialAnalysis: draftFinancialAnalysis(bundle),
      guarantor: draftGuarantorNarrative(bundle),
      riskRatingComments: draftRiskRatingComments(bundle),
    };
  }
  if (actionId === "collateral-valuation") return { description: draftValuationDescription(bundle) };
  if (actionId === "create-service-request") {
    const s = draftServiceRequestSummary(bundle);
    return s.text ? { subject: s, description: s } : {};
  }
  return {};
}
