import type { BorrowerBundle, C360Data, Collateral, Covenant } from "../../data/contract";
import { fmtMoney } from "../../data/format";
import { isActiveFacility } from "../../data/worklist";
import { classifyCovenant } from "../../domain/covenantStatus";
import { ACTIONS_BY_ID, stageRationale } from "../../actions/registry";
import { COVENANT_ASSESSMENT_STATUSES, observedOptions } from "../../actions/observedPicklists";
import { assertNoRecordIds, type StagedOutput } from "../../actions/stagedPlan";
import { validatePlan } from "../../actions/transitionAllowlist";
import { newRequestId } from "../../channel/adapter";
import { mcpAvailable } from "../../channel/mcp";
import {
  executeAction,
  parseLegalValues,
  resolveApproverUserId,
  stageAction,
  toolErrorCopy,
  type ExecutePayload,
  type ExecuteResult,
  type StagePayloads,
  type ToolError,
  type ToolOutcome,
  type WriteActionId,
} from "../../channel/writeTools";
import type { IconKind } from "../workroom/TypeIcon";
import type { RelRoute } from "./relRoute";

/* =============================================================================
   THE FIVE REVIEWS — ONE STEP MACHINE OVER THE FLOWS THAT ALREADY EXIST.

   THE ROOM RE-CLOTHES, IT DOES NOT REINVENT. Every route below drives the SAME
   `stage_*` / `execute_*` pair the Action Panel drives today, with the SAME
   payload shape, read from `channel/writeTools.ts` and from the panel's own
   `stagePayload()`. Not one wire key is composed here that the panel does not
   already send. The ActionPanel machinery is untouched and still ships.

   WHAT IS NEW is the CHOREOGRAPHY: instead of a form the banker fills, the room
   asks one question at a time, in a professional register, with the org's own
   legal values as chips, and stages only when the flow has everything its tool
   demands.

   A STEP MACHINE, NOT A STEP LIST. Three of the five routes are conditional —
   a covenant assessed Exception has to say whether it was breached or overdue,
   a valuation needs one figure per asset the banker chose — so the next
   question is DERIVED from what has been answered rather than walked down a
   fixed array. `nextStep` returning null is the whole readiness test, and it is
   the same test in the room and in its tests.

   CREATION SEMANTICS (founder, 2026-08-31). Relationship-level creates belong
   here: a covenant authored standalone on the Account, a collateral asset the
   borrower owns plus its ownership junction, unpledged. NEITHER IS BACKED BY A
   DEPLOYED TOOL TODAY, and this module says so by name rather than composing a
   payload the org has never accepted. See `CREATE_GAPS` at the foot of the
   file: the room takes the banker all the way to the proposal and then states
   the org-side gap, because an unbacked write invented at the client is exactly
   the failure this campaign has already paid for twice.
   ============================================================================= */

/* ------------------------------------------------------------- the context */

export interface RelContext {
  accountId: string;
  accountName: string;
  bundle: BorrowerBundle | null;
  /** The relationship's product package. Both bulk tools are anchored on it and
   *  refuse a batch without one. */
  productPackageId: string | null;
  /** `meta.generatedAt` — the artifact's own clock. Never `new Date()`. */
  asOf: string | null;
  /** The Salesforce user id `execute_*` will accept, or null. */
  approver: string | null;
}

export function relContextFor(args: {
  data: C360Data;
  bundle: BorrowerBundle | null;
  accountId: string;
  accountName: string;
}): RelContext {
  return {
    accountId: args.accountId,
    accountName: args.accountName,
    bundle: args.bundle,
    productPackageId: args.bundle?.snapshot?.productPackageId ?? null,
    asOf: args.data.meta?.generatedAt ?? null,
    approver: resolveApproverUserId(args.data.meta),
  };
}

/* --------------------------------------------------------------- the steps */

export type StepKind = "chips" | "multi" | "text" | "number" | "date";

export interface StepOption {
  label: string;
  value: string;
  /** A second line under the label, where the org has one worth reading. */
  detail?: string;
}

export interface RelStep {
  /** Where the answer lands in the answer map. */
  key: string;
  /** The question, banker-formal. One sentence, no exclamation points. */
  ask: string;
  kind: StepKind;
  /** Closed-set answers, offered as chips. Every value here is the ORG's own. */
  options?: StepOption[];
  /** The step may be answered with "Not assessed" and left out of the payload. */
  optional?: boolean;
  /** The composer's placeholder while this step is live. */
  placeholder?: string;
  /** The org field this answer is aimed at, for the "what this writes" peek. */
  target?: { object: string; field: string };
}

/** Everything the banker has answered, keyed by step. Multi-answers are arrays;
 *  per-record answers are keyed maps. */
export type Answers = Record<string, unknown>;

/** The sentinel a banker's "skip" writes, so an optional step that was ANSWERED
 *  WITH NOTHING is distinguishable from one never reached. */
export const SKIPPED = "__skipped__";

const isSkipped = (v: unknown) => v === SKIPPED;
const answered = (a: Answers, key: string) => Object.prototype.hasOwnProperty.call(a, key);

/* -------------------------------------------------------------- the briefs */

export interface RelFlowSpec {
  route: RelRoute;
  actionId: WriteActionId;
  /** The room's own word for the route, in the slim bar. */
  word: string;
  icon: IconKind;
  /** THE STRUCTURED BRIEF. What the review covers, then what it produces. Two
   *  sentences, read before the first question, because a governance ritual
   *  states its scope before it asks anything. */
  covers: string;
  produces: string;
  /** The object the plan writes, in banker language. */
  writeObjectLabel: string;
  /** The ink button's word once the plan is staged. */
  approveLabel: string;
  /** The past-tense word the room uses once it has filed. */
  filedWord: string;
  /** The status line rotation under the execute mark. */
  loadSteps: string[];
}

export const REL_FLOWS: Record<RelRoute, RelFlowSpec> = {
  annual: {
    route: "annual",
    actionId: "annual-review",
    word: "Annual Review",
    icon: "package",
    covers:
      "The annual review covers the whole relationship: exposure, performance against the package, covenant compliance and the standing risk grade.",
    produces:
      "It files a credit review record at In Progress carrying the narratives, then hands control to the bank's own Submit for Approval process.",
    writeObjectLabel: "credit review",
    approveLabel: "File the review",
    filedWord: "Filed",
    loadSteps: ["Composing the review", "Filing the credit review", "Verifying the record"],
  },
  covenant: {
    route: "covenant",
    actionId: "covenant-review",
    word: "Covenant Review",
    icon: "covenant",
    covers:
      "The covenant review covers the tests this package carries: each covenant's latest compliance row, its schedule and whether it is measurable this period.",
    produces:
      "It writes one assessment per covenant onto its compliance row. Only a row sitting at Pending advances the covenant schedule.",
    writeObjectLabel: "covenant assessment",
    approveLabel: "File the assessments",
    filedWord: "Filed",
    loadSteps: ["Assessing the covenants", "Writing the compliance rows", "Re-querying the schedule"],
  },
  valuation: {
    route: "valuation",
    actionId: "collateral-valuation",
    word: "Collateral Valuation",
    icon: "collateral",
    covers:
      "The valuation covers the collateral pledged against this package: the asset, the basis the figure is struck on and where the number came from.",
    produces:
      "It files one valuation record per asset. Whether the value rolls up onto the collateral record is nCino's own automation and is reported, never claimed.",
    writeObjectLabel: "collateral valuation",
    approveLabel: "File the valuation",
    filedWord: "Filed",
    loadSteps: ["Composing the valuation", "Filing the valuation", "Re-querying the collateral"],
  },
  rating: {
    route: "rating",
    actionId: "risk-rating-review",
    word: "Risk-Rating Review",
    icon: "commit",
    covers:
      "The risk-rating review covers the four factors the grade is built from: cash-flow coverage, revenue growth, management experience and credit score.",
    produces:
      "It files a risk-rating review carrying the factor scores and the rationale. The grade the org computes from them is the org's, not this room's.",
    writeObjectLabel: "risk-rating review",
    approveLabel: "File the rating review",
    filedWord: "Filed",
    loadSteps: ["Scoring the factors", "Filing the rating review", "Verifying the record"],
  },
  service: {
    route: "service",
    actionId: "create-service-request",
    word: "Service Request",
    icon: "maturity",
    covers:
      "The service request covers a servicing ask on this relationship: statements, payoff quotes, document requests or account changes.",
    produces:
      "It creates the request at status New. The tool performs no status transitions and never closes a case.",
    writeObjectLabel: "service request",
    approveLabel: "Log the request",
    filedWord: "Logged",
    loadSteps: ["Composing the request", "Creating the request", "Verifying the record"],
  },
};

/* ------------------------------------------------------- what the read holds */

/** The covenants this package carries, with the org's own verdict on each.
 *  Only covenants the org gave an id are offerable: the bulk tool is anchored
 *  on `covenantId` and a covenant without one cannot be assessed. */
export function reviewableCovenants(ctx: RelContext): Covenant[] {
  return (ctx.bundle?.covenants?.covenants ?? []).filter((c) => !!c.covenantId);
}

/** The collateral pledged against the ACTIVE facilities, deduplicated by
 *  collateral id. A cross-pledged asset appears on two facilities and is ONE
 *  asset: offering it twice would invite the duplicate the tool refuses. */
export function valuableCollateral(ctx: RelContext): Collateral[] {
  const out = new Map<string, Collateral>();
  for (const f of (ctx.bundle?.exposure?.facilities ?? []).filter(isActiveFacility)) {
    for (const c of f.collateral ?? []) {
      if (c.collateralId && !out.has(c.collateralId)) out.set(c.collateralId, c);
    }
  }
  return [...out.values()];
}

/** The name a collateral row reads under. The friendly description leads where
 *  the org staged one; the autonumber is the fallback, never a guess. */
export function collateralLabel(c: Collateral): string {
  return c.collateralDescription?.trim() || c.collateralName?.trim() || c.collateralId || "collateral";
}

/** The name a covenant reads under. */
export function covenantLabel(c: Covenant): string {
  return (c.covenantType ?? "").trim() || "covenant";
}

/** The batch cap `stage_collateral_valuation` enforces (WS0.5, 2026-08-22). */
export const VALUATION_BATCH_CAP = 20;

/* --------------------------------------------------------- the step machine */

const REVIEW_TYPE = observedOptions("LLC_BI__Review__c", "LLC_BI__Review_Type__c");
const VALUATION_BASIS = observedOptions("LLC_BI__Collateral_Valuation__c", "LLC_BI__Type__c");
const VALUATION_SOURCE = observedOptions("LLC_BI__Collateral_Valuation__c", "LLC_BI__Source__c");
const EXCEPTION_REASON = observedOptions("LLC_BI__Covenant_Compliance2__c", "LLC_BI__Reason_for_Exception__c");

const asOptions = (values: readonly string[] | undefined): StepOption[] =>
  (values ?? []).map((v) => ({ label: v, value: v }));

const pickedList = (a: Answers, key: string): string[] =>
  Array.isArray(a[key]) ? (a[key] as unknown[]).filter((v): v is string => typeof v === "string") : [];

const perRecord = (a: Answers, key: string): Record<string, unknown> =>
  a[key] && typeof a[key] === "object" && !Array.isArray(a[key]) ? (a[key] as Record<string, unknown>) : {};

/**
 * THE NEXT QUESTION, or null when the flow has everything its tool demands.
 *
 * Null is the readiness test. It is deliberately the ONLY readiness test: a
 * second "is this complete" predicate beside it is how the room and the payload
 * builder drift apart, and the drift shows up as a refusal the banker has to
 * read.
 */
export function nextStep(route: RelRoute, ctx: RelContext, a: Answers): RelStep | null {
  switch (route) {
    case "annual":
      return annualStep(ctx, a);
    case "covenant":
      return covenantStep(ctx, a);
    case "valuation":
      return valuationStep(ctx, a);
    case "rating":
      return ratingStep(a);
    case "service":
      return serviceStep(ctx, a);
  }
}

function annualStep(_ctx: RelContext, a: Answers): RelStep | null {
  if (!answered(a, "reviewType")) {
    return {
      key: "reviewType",
      ask: "Which review is this?",
      kind: "chips",
      options: asOptions(REVIEW_TYPE?.values),
      placeholder: "Name the review type, or pick one above.",
      target: { object: "LLC_BI__Review__c", field: "LLC_BI__Review_Type__c" },
    };
  }
  if (!answered(a, "relationshipSummary")) {
    return {
      key: "relationshipSummary",
      ask: "State the relationship position for the record. One or two sentences.",
      kind: "text",
      optional: true,
      placeholder: "The position, in your own words.",
      target: { object: "LLC_BI__Review__c", field: "LLC_BI__Relationship_Summary__c" },
    };
  }
  if (!answered(a, "recommendation")) {
    return {
      key: "recommendation",
      ask: "And the recommendation this review carries.",
      kind: "text",
      optional: true,
      placeholder: "The recommendation.",
      target: { object: "LLC_BI__Review__c", field: "LLC_BI__Recommendation__c" },
    };
  }
  return null;
}

function covenantStep(ctx: RelContext, a: Answers): RelStep | null {
  const covenants = reviewableCovenants(ctx);
  if (!answered(a, "covenants")) {
    return {
      key: "covenants",
      ask: "Which covenants are we assessing?",
      kind: "multi",
      options: covenants.map((c) => {
        const verdict = classifyCovenant(c);
        return {
          label: covenantLabel(c),
          value: c.covenantId!,
          detail: `${verdict.label}${c.latestComplianceStatus ? ` · row at ${c.latestComplianceStatus}` : ""}`,
        };
      }),
      placeholder: "Name the covenants, or pick them above.",
    };
  }
  const picked = pickedList(a, "covenants");
  const statuses = perRecord(a, "covenantStatuses");
  for (const id of picked) {
    if (typeof statuses[id] === "string") continue;
    const cov = covenants.find((c) => c.covenantId === id);
    return {
      key: `covenantStatuses.${id}`,
      ask: `How does the ${covenantLabel(cov ?? {})} test assess?`,
      kind: "chips",
      options: asOptions(COVENANT_ASSESSMENT_STATUSES),
      placeholder: "Compliant, Waived or Exception.",
      target: { object: "LLC_BI__Covenant_Compliance2__c", field: "LLC_BI__Status__c" },
    };
  }
  const observed = perRecord(a, "covenantObservedValues");
  for (const id of picked) {
    if (answered(observed, id)) continue;
    const cov = covenants.find((c) => c.covenantId === id);
    return {
      key: `covenantObservedValues.${id}`,
      ask: `What figure was tested on the ${covenantLabel(cov ?? {})}?`,
      kind: "number",
      optional: true,
      placeholder: "The tested figure, or skip it.",
      target: { object: "LLC_BI__Covenant_Compliance2__c", field: "LLC_BI__Observed_Value__c" },
    };
  }
  const reasons = perRecord(a, "covenantReasons");
  for (const id of picked) {
    if (statuses[id] !== "Exception" || typeof reasons[id] === "string") continue;
    const cov = covenants.find((c) => c.covenantId === id);
    return {
      key: `covenantReasons.${id}`,
      ask: `Is the ${covenantLabel(cov ?? {})} exception a failed test or an undelivered document?`,
      kind: "chips",
      options: asOptions(EXCEPTION_REASON?.values),
      placeholder: "Breached or Overdue.",
      target: { object: "LLC_BI__Covenant_Compliance2__c", field: "LLC_BI__Reason_for_Exception__c" },
    };
  }
  if (!answered(a, "assessmentNarrative")) {
    return {
      key: "assessmentNarrative",
      ask: "State the basis for these assessments.",
      kind: "text",
      optional: true,
      placeholder: "The basis, for the record.",
      target: { object: "LLC_BI__Covenant_Compliance2__c", field: "LLC_BI__Narrative__c" },
    };
  }
  return null;
}

function valuationStep(ctx: RelContext, a: Answers): RelStep | null {
  const assets = valuableCollateral(ctx);
  if (!answered(a, "records")) {
    return {
      key: "records",
      ask: "Which collateral are we valuing?",
      kind: "multi",
      options: assets.map((c) => ({
        label: collateralLabel(c),
        value: c.collateralId!,
        detail: [c.collateralType, typeof c.collateralValue === "number" ? fmtMoney(c.collateralValue) : null]
          .filter(Boolean)
          .join(" · "),
      })),
      placeholder: "Name the assets, or pick them above.",
    };
  }
  const picked = pickedList(a, "records");
  const values = perRecord(a, "recordValues");
  for (const id of picked) {
    if (typeof values[id] === "number") continue;
    const asset = assets.find((c) => c.collateralId === id);
    return {
      key: `recordValues.${id}`,
      ask: `What value are we filing for ${collateralLabel(asset ?? {})}?`,
      kind: "number",
      placeholder: "The figure, in dollars.",
      target: { object: "LLC_BI__Collateral_Valuation__c", field: "LLC_BI__Value__c" },
    };
  }
  if (!answered(a, "valuationDate")) {
    return {
      key: "valuationDate",
      ask: "As of what date was the valuation struck?",
      kind: "date",
      placeholder: "YYYY-MM-DD.",
      target: { object: "LLC_BI__Collateral_Valuation__c", field: "LLC_BI__Valuation_Date__c" },
    };
  }
  if (!answered(a, "type")) {
    return {
      key: "type",
      ask: "On what basis was it struck?",
      kind: "chips",
      options: asOptions(VALUATION_BASIS?.values),
      placeholder: "The valuation basis.",
      target: { object: "LLC_BI__Collateral_Valuation__c", field: "LLC_BI__Type__c" },
    };
  }
  if (!answered(a, "source")) {
    return {
      key: "source",
      ask: "And where did the figure come from?",
      kind: "chips",
      options: asOptions(VALUATION_SOURCE?.values),
      placeholder: "The source of the number.",
      target: { object: "LLC_BI__Collateral_Valuation__c", field: "LLC_BI__Source__c" },
    };
  }
  return null;
}

/**
 * The four factors, in the order the org's own request class carries them.
 *
 * THE WRITE OBJECT IS `LLC_BI__Annual_Review__c`. There is no
 * `LLC_BI__Risk_Rating_Review__c` in this org — the label and the API name do
 * not agree, and the panel schema records the same mismatch. The room names the
 * object the plan actually writes.
 */
const RATING_FACTORS: Array<{ key: string; label: string; ask: string; field: string }> = [
  { key: "cashFlowCoverage", label: "cash-flow coverage", ask: "What is cash-flow coverage on this borrower?", field: "cashFlowCoverageActual" },
  { key: "revenueGrowth", label: "revenue growth", ask: "And revenue growth?", field: "revenueGrowthActual" },
  { key: "managementExperience", label: "management experience", ask: "Management experience, in years?", field: "managementExperienceActual" },
  { key: "creditScore", label: "credit score", ask: "And the credit score?", field: "creditScoreActual" },
];

const RATING_OBJECT = "LLC_BI__Annual_Review__c";

function ratingStep(a: Answers): RelStep | null {
  for (const factor of RATING_FACTORS) {
    if (answered(a, factor.key)) continue;
    return {
      key: factor.key,
      ask: factor.ask,
      kind: "number",
      optional: true,
      placeholder: "The figure, or skip it.",
      target: { object: RATING_OBJECT, field: factor.field },
    };
  }
  if (!answered(a, "overrideComment")) {
    return {
      key: "overrideComment",
      ask: "State the rationale for the record.",
      kind: "text",
      optional: true,
      placeholder: "The rationale.",
      target: { object: RATING_OBJECT, field: "LLC_BI__Comments__c" },
    };
  }
  return null;
}

/**
 * THE GRADE OVERRIDE IS NOT COLLECTED, and the room says so rather than taking
 * a figure it cannot file.
 *
 * The staged plan writes `LLC_BI__Overridden_Risk_Grade_Value__c`, so the tool
 * almost certainly accepts an override input — but no observed request has ever
 * carried one and its wire name would be a guess. Guessing a field name is the
 * failure this campaign has already paid for twice, so the room states the gap
 * exactly as the ticket does instead of sending an invented key.
 */
export const OVERRIDE_NOT_FILEABLE =
  "The rating override cannot be filed from here. The plan writes the overridden grade, but the input's wire name has never been observed and this room does not guess one. Record the rationale and set the override in nCino.";

/** "override the grade to 6", "downgrade it to 7 manually". */
const OVERRIDE_ASK = /\b(override|overrid\w*)\b/i;

/** TRUE where the banker asked to override the computed grade. */
export function asksForOverride(text: string, route: RelRoute): boolean {
  return route === "rating" && OVERRIDE_ASK.test(text.trim());
}

function serviceStep(ctx: RelContext, a: Answers): RelStep | null {
  /* NO OPTIONS ON THESE TWO, and that is the honest shape. `Case.Type` and
     `Case.Origin` have never been read off this org — they are absent from the
     observed-picklist cache by design — so the room takes the banker's own word
     and lets the tool validate. A refusal comes back carrying the LEGAL LIST,
     which `legalValuesFrom` lifts out and the room re-offers as chips. Inventing
     a value set here is the failure the campaign has already paid for twice. */
  if (!answered(a, "type")) {
    return {
      key: "type",
      ask: "What kind of request is this?",
      kind: "text",
      placeholder: "The request type.",
      target: { object: "Case", field: "Type" },
    };
  }
  if (!answered(a, "origin")) {
    return {
      key: "origin",
      ask: "How did it reach us?",
      kind: "text",
      placeholder: "The origin.",
      target: { object: "Case", field: "Origin" },
    };
  }
  if (!answered(a, "subject")) {
    /* THE CLIENT'S OWN WORDS LEAD, where the read staged an inbound request.
       Offered as a chip, never written silently: a subject the banker did not
       choose is a case nobody can defend at audit. */
    const inbound = (ctx.bundle?.requests ?? [])[0]?.summary?.trim();
    return {
      key: "subject",
      ask: "State the subject, as it should read on the case.",
      kind: "text",
      options: inbound ? [{ label: inbound.slice(0, 120), value: inbound.slice(0, 120), detail: "from the client's request" }] : undefined,
      placeholder: "The subject.",
      target: { object: "Case", field: "Subject" },
    };
  }
  if (!answered(a, "detail")) {
    /* THE DETAIL RIDES `rationale`, NOT A `description` KEY. The Case request
       class carries ONE free-text field on the wire (`summary`, which lands on
       Subject); the panel's own Description control is a fallback for it and
       never a second field. So the detail is folded into the audit rationale,
       which IS on the wire, and the room says nothing about a Description it
       cannot write. */
    return {
      key: "detail",
      ask: "Anything further for the audit record?",
      kind: "text",
      optional: true,
      placeholder: "Further detail, or skip it.",
      target: { object: "Case", field: "Description" },
    };
  }
  return null;
}

/* ------------------------------------------------------------ the payloads */

export type PayloadResult =
  | { ok: true; payload: StagePayloads[keyof StagePayloads] }
  | { ok: false; blocked: string };

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const text = (v: unknown): string | null => {
  if (isSkipped(v)) return null;
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/**
 * BUILD THE TOOL PAYLOAD from what the banker answered.
 *
 * Every key below is copied from `ActionPanel.stagePayload()`, which is itself
 * copied from a request body the org actually accepted. Nothing is composed
 * here that the panel does not already send, and a flow that cannot satisfy its
 * tool's hard requirements returns a BLOCKED SENTENCE rather than a payload the
 * org would refuse.
 */
export function buildStagePayload(route: RelRoute, ctx: RelContext, a: Answers, idempotencyKey: string): PayloadResult {
  const spec = REL_FLOWS[route];
  const typed = [text(a.relationshipSummary), text(a.recommendation), text(a.assessmentNarrative), text(a.overrideComment), text(a.detail)]
    .filter((x): x is string => !!x)
    .join(" ");
  const rationale = stageRationale({ actionId: spec.actionId, accountName: ctx.accountName, typed });

  if (route === "annual") {
    return {
      ok: true,
      payload: {
        idempotencyKey,
        accountId: ctx.accountId,
        rationale,
        reviewType: text(a.reviewType),
        productPackageId: ctx.productPackageId,
        narrative: null,
        relationshipSummary: text(a.relationshipSummary),
        strengthsNarrative: null,
        weaknessNarrative: null,
        recommendationNarrative: text(a.recommendation),
        collateralAnalysisNarrative: null,
        financialAnalystNarrative: null,
        guarantorNarrative: null,
        riskRatingComments: null,
      },
    };
  }

  if (route === "covenant") {
    if (!ctx.productPackageId) {
      return { ok: false, blocked: NO_PACKAGE_ANCHOR };
    }
    const picked = [...new Set(pickedList(a, "covenants"))];
    const statuses = perRecord(a, "covenantStatuses");
    const reasons = perRecord(a, "covenantReasons");
    const observed = perRecord(a, "covenantObservedValues");
    // ALL OR NOTHING on the verdict, exactly as the panel does it. A covenant
    // the banker selected but never answered is not filed under a default.
    const assessments = picked
      .filter((covenantId) => typeof statuses[covenantId] === "string" && statuses[covenantId] !== "")
      .map((covenantId) => ({
        covenantId,
        status: statuses[covenantId] as string,
        // A NUMBER on this wire: the invocable declares Decimal.
        observedValue: num(observed[covenantId]),
        reasonForException: typeof reasons[covenantId] === "string" ? (reasons[covenantId] as string) : null,
        narrative: text(a.assessmentNarrative),
        comments: null,
      }));
    if (!assessments.length || assessments.length !== picked.length) {
      return { ok: false, blocked: "Every covenant on the list needs a verdict before the plan can be staged." };
    }
    return {
      ok: true,
      payload: {
        idempotencyKey,
        rationale,
        productPackageId: ctx.productPackageId,
        assessments,
        covenantIds: picked,
      },
    };
  }

  if (route === "valuation") {
    if (!ctx.productPackageId) return { ok: false, blocked: NO_PACKAGE_ANCHOR };
    const picked = [...new Set(pickedList(a, "records"))];
    const valuationDate = text(a.valuationDate);
    if (!picked.length || !valuationDate) {
      return { ok: false, blocked: "The valuation needs at least one asset and the date it was struck on." };
    }
    if (picked.length > VALUATION_BATCH_CAP) {
      return { ok: false, blocked: `The tool caps a valuation batch at ${VALUATION_BATCH_CAP} assets.` };
    }
    const values = perRecord(a, "recordValues");
    // The basis, the origin, the date and the notes describe the EXERCISE and
    // apply to every item in it. Only the figure is per collateral record.
    const shared = {
      valuationDate,
      type: text(a.type),
      source: text(a.source),
      description: null,
      primary: false,
    };
    return {
      ok: true,
      payload: {
        idempotencyKey,
        rationale,
        productPackageId: ctx.productPackageId,
        items: picked.map((collateralId) => ({ collateralId, value: num(values[collateralId]), ...shared })),
      },
    };
  }

  if (route === "rating") {
    const computed = Number(ctx.bundle?.snapshot?.computedRiskRating);
    return {
      ok: true,
      payload: {
        idempotencyKey,
        accountId: ctx.accountId,
        rationale,
        computedRiskGradeValue: Number.isFinite(computed) ? computed : null,
        cashFlowCoverageActual: num(a.cashFlowCoverage),
        revenueGrowthActual: num(a.revenueGrowth),
        managementExperienceActual: num(a.managementExperience),
        creditScoreActual: num(a.creditScore),
        comments: text(a.overrideComment),
        // NO override key. Its wire name has never been observed, and the room
        // does not invent one for the same reason the panel does not.
      },
    };
  }

  const req = (ctx.bundle?.requests ?? [])[0];
  return {
    ok: true,
    payload: {
      idempotencyKey,
      accountId: ctx.accountId,
      rationale,
      requestType: text(a.type),
      origin: text(a.origin),
      summary: text(a.subject),
      referenceKind: req?.reference?.kind ?? null,
      referenceId: req?.reference?.id ?? null,
      referenceWebLink: req?.reference?.webLink ?? null,
    },
  };
}

const NO_PACKAGE_ANCHOR =
  "This review is anchored on the product package and the read stages none for this relationship, so there is nothing to stage against.";

/* ------------------------------------------------------------- the driver */

export interface RelFlowDeps {
  stage: (actionId: WriteActionId, payload: StagePayloads[keyof StagePayloads]) => Promise<ToolOutcome<StagedOutput>>;
  execute: (actionId: WriteActionId, payload: ExecutePayload) => Promise<ToolOutcome<ExecuteResult>>;
  /** Is there a connector at all. The channel-none doctrine turns on this. */
  available: () => boolean;
  newKey: () => string;
}

export const defaultRelDeps: RelFlowDeps = {
  stage: (actionId, payload) => stageAction(actionId, payload as never),
  execute: (actionId, payload) => executeAction(actionId, payload),
  available: mcpAvailable,
  newKey: newRequestId,
};

/** THE ROOM REACHED NO ORG. The one failure that earns a surface of its own:
 *  a banker who cannot tell "not connected" from "something went wrong" will
 *  retry a room that can never answer. No plan, nothing simulated, no token. */
export const NO_CONNECTOR =
  "This view is not connected to the bank's systems, so there is no plan to stage and nothing here is ever simulated. Open the cockpit with the Customer 360 connector enabled and the review will run against the org.";

export class RelFlowError extends Error {
  /** True once the call has REACHED the org: the token may be spent and the
   *  write may have landed, so the approval must not be offered again. */
  readonly dispatched: boolean;
  readonly code: string;
  /** The org's own legal value list, where the refusal carried one. */
  readonly legalValues?: string[];

  constructor(message: string, opts?: { dispatched?: boolean; code?: string; legalValues?: string[] }) {
    super(message);
    this.name = "RelFlowError";
    this.dispatched = opts?.dispatched === true;
    this.code = opts?.code ?? "RELATIONSHIP_FLOW";
    this.legalValues = opts?.legalValues;
  }
}

function fromToolError(e: ToolError, dispatched: boolean): RelFlowError {
  return new RelFlowError(toolErrorCopy(e), { dispatched, code: e.code, legalValues: legalValuesFrom(e) });
}

/** The org's own legal list, lifted out of a refusal so the room can re-offer
 *  it as chips instead of leaving the banker to guess again. */
export function legalValuesFrom(e: ToolError): string[] | undefined {
  return e.legalValues ?? parseLegalValues(e.message);
}

export interface StagedRelPlan {
  plan: StagedOutput;
  stagingId: string;
  planHash: string;
  decisionToken: string | null;
}

/**
 * STAGE THE PLAN. Zero DML by contract, which is the only reason the flow card
 * can show the org's REAL decision token rather than a decoration shaped like
 * one.
 */
export async function stageRelPlan(
  route: RelRoute,
  ctx: RelContext,
  answers: Answers,
  idempotencyKey: string,
  deps: RelFlowDeps = defaultRelDeps,
): Promise<StagedRelPlan> {
  if (!deps.available()) throw new RelFlowError(NO_CONNECTOR, { code: "server_not_connected" });
  const built = buildStagePayload(route, ctx, answers, idempotencyKey);
  if (!built.ok) throw new RelFlowError(built.blocked, { code: "INCOMPLETE" });
  const out = await deps.stage(REL_FLOWS[route].actionId, built.payload);
  if (!out.ok) throw fromToolError(out.error, false);
  const plan = out.result;

  /* THE SAME TWO CHECKS THE CONFIRM GATE RUNS, and for the same reason. A plan
     that would write outside the transition allowlist, or that carries a record
     id the staging call could not have created, is not a plan a banker should
     be offered a token for. Both refuse BEFORE the gesture exists rather than
     after it is made. */
  const violations = validatePlan(plan.steps);
  if (violations.length) {
    throw new RelFlowError(
      `The staged plan would write outside what this cockpit permits: ${violations.map((v) => v.reason).join("; ")}.`,
      { code: "ALLOWLIST" },
    );
  }
  const leaks = assertNoRecordIds(plan);
  if (leaks.length) {
    throw new RelFlowError(
      `The staged plan carries a record id, so something may already have been written: ${leaks.join("; ")}.`,
      { code: "ID_LEAK" },
    );
  }

  if (plan.executionHeld) {
    // THE ORG IS THE AUTHORITY ON HOLDING. A staged plan that says it may not
    // execute is staged, read and reported; the room does not arm the gesture.
    return { plan, stagingId: plan.stagingId, planHash: plan.planHash, decisionToken: null };
  }
  return { plan, stagingId: plan.stagingId, planHash: plan.planHash, decisionToken: plan.decisionToken ?? null };
}

/** REDEEM THE TOKEN. One gesture, one write, and the org's own account of it. */
export async function executeRelPlan(
  route: RelRoute,
  approval: ExecutePayload,
  deps: RelFlowDeps = defaultRelDeps,
): Promise<ExecuteResult> {
  const out = await deps.execute(REL_FLOWS[route].actionId, approval);
  // ONCE THE CALL IS AWAY THE WRITE MAY HAVE LANDED. A domain refusal after
  // dispatch is stamped so the room stops offering the approval rather than
  // arming a retry on a burnt single-use token.
  if (!out.ok) throw fromToolError(out.error, true);
  return out.result;
}

/* -------------------------------------------------------------- the dossier */

export interface DossierRow {
  icon: IconKind;
  label: string;
  value: string;
}

/**
 * THE RESULT DOSSIER, built from the REAL result. Every row is something the
 * org reported; nothing is composed from what the room hoped would happen.
 *
 * `recordName === null` is EVIDENCE OF A FAILED VERIFICATION READ-BACK, not a
 * missing nicety (Apex builder, 2026-07-26), so it renders as the filed-
 * unverified state it is rather than behind a generic label.
 */
export function dossierRowsFor(route: RelRoute, ctx: RelContext, answers: Answers, result: ExecuteResult): DossierRow[] {
  const rows: DossierRow[] = [];
  const named = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : "filed, unverified");

  if (route === "covenant") {
    const covenants = reviewableCovenants(ctx);
    const statuses = perRecord(answers, "covenantStatuses");
    for (const id of pickedList(answers, "covenants")) {
      const cov = covenants.find((c) => c.covenantId === id);
      rows.push({ icon: "covenant", label: covenantLabel(cov ?? {}), value: String(statuses[id] ?? "assessed") });
    }
    if (result.approvalChainStarted === true) {
      rows.push({ icon: "package", label: "approval chain", value: "started" });
    }
    return rows;
  }

  if (route === "valuation") {
    const assets = valuableCollateral(ctx);
    const values = perRecord(answers, "recordValues");
    for (const id of pickedList(answers, "records")) {
      const asset = assets.find((c) => c.collateralId === id);
      const v = num(values[id]);
      rows.push({ icon: "collateral", label: collateralLabel(asset ?? {}), value: v === null ? "filed" : fmtMoney(v) });
    }
    rows.push({
      icon: "commit",
      label: "collateral value",
      value: result.collateralValueMoved === true ? "rolled up" : "unchanged",
    });
    return rows;
  }

  if (route === "annual") {
    rows.push({ icon: "package", label: "credit review", value: named(result.recordName) });
    if (result.status) rows.push({ icon: "maturity", label: "status", value: result.status });
    return rows;
  }

  if (route === "rating") {
    rows.push({ icon: "commit", label: "risk-rating review", value: named(result.recordName) });
    for (const factor of RATING_FACTORS) {
      const v = num(answers[factor.key]);
      if (v !== null) rows.push({ icon: "pricing", label: factor.label, value: String(v) });
    }
    return rows;
  }

  rows.push({ icon: "maturity", label: "service request", value: named(result.recordName) });
  if (result.status) rows.push({ icon: "package", label: "status", value: result.status });
  return rows;
}

/** The card's last line: the ORG'S OWN account of what it verified, where the
 *  result carries one. Never a slogan the room made up about a write it cannot
 *  see. */
export function dossierFooter(result: ExecuteResult): string {
  if (result.outcome?.trim()) return result.outcome.trim();
  return `Terminal state ${result.terminalState}.`;
}

/** What the filing did NOT do, in the org's own sentence where it has one. */
export function dossierHandoff(route: RelRoute, result: ExecuteResult): string | undefined {
  if (result.bookingHandoff?.trim()) return result.bookingHandoff.trim();
  if (route === "annual") {
    return "The review is filed, not approved. Submitting it for approval runs through the bank's own process.";
  }
  if (route === "valuation" && result.collateralValueMoved === false) {
    return "The valuation is filed and the collateral value did not move. The roll-up is bound to nCino's own Add Valuation button, so no coverage improvement is claimed.";
  }
  return undefined;
}

/* ------------------------------------------------------- the creation gaps

   RELATIONSHIP-LEVEL CREATES LIVE HERE (founder, 2026-08-31) — and neither of
   the two is backed by a deployed tool today. The room takes the banker to the
   proposal and then states the gap, by name, rather than composing a payload
   the org has never accepted.

   THE EVIDENCE, read from `channel/writeTools.ts`:

   COVENANT. `stage_covenant_review` accepts `productPackageId`, `covenantIds`,
   `allowNonPending` and `assessments[]`, where every assessment is anchored on
   an EXISTING `covenantId`. There is no create key of any kind. Covenant
   creation exists in exactly one place in the deployed surface —
   `stage_loan_modification`'s `covenantAddsJson` — and every covenant it
   authors is attached to the CLONE of a targeted facility on a new package
   version. That is facility-context creation by construction, so it cannot
   author a standalone Account covenant even by borrowing the shape.

   COLLATERAL. `stage_collateral_valuation` accepts `items[].collateralId` —
   assets that already exist. The create chain (asset, then the
   `LLC_BI__Account_Collateral__c` ownership junction, then the pledge) exists
   only in `stage_loan_modification`'s `pledgeAddsJson.newCollateral`, and it
   always ends in a pledge onto a facility clone. There is no path to an owned,
   UNPLEDGED asset.

   WHAT WOULD CLOSE EACH ONE is named below and reported upward, never
   improvised at the client. */
export interface CreateGap {
  /** What the banker asked for, in their words. */
  what: string;
  /** The one-line refusal the room says out loud. */
  line: string;
  /** The org-side change that would back it. Reported, never attempted. */
  orgGap: string;
}

export const CREATE_GAPS: Record<"covenant" | "collateral", CreateGap> = {
  covenant: {
    what: "a covenant authored standalone on the relationship",
    line: "The room can compose the covenant, and it cannot file it. No deployed tool authors a standalone covenant on the Account: the covenant review only assesses covenants that already exist.",
    orgGap:
      "stage_covenant_review accepts no create input. Closing this needs an account-anchored covenant create on the org side: either a covenantAdds input on stage_covenant_review that authors LLC_BI__Covenant2__c against LLC_BI__Relationship__c with no loan junction, or a stage_covenant tool of its own.",
  },
  collateral: {
    what: "a collateral asset the borrower owns, unpledged",
    line: "The room can compose the asset and its ownership, and it cannot file them. No deployed tool authors an owned but unpledged collateral record: the only create path in the org ends in a pledge onto a facility.",
    orgGap:
      "stage_collateral_valuation takes existing collateralIds only, and the newCollateral chain inside stage_loan_modification always terminates in a pledge. Closing this needs a create that stops after LLC_BI__Collateral__c plus the LLC_BI__Account_Collateral__c ownership junction, with no LLC_BI__Loan_Collateral2__c row.",
  },
};

/** Words that ask this room to CREATE the thing rather than review it. Narrow
 *  on purpose: "add a covenant" and "new collateral" are creates; "assess the
 *  covenant" and "value the collateral" are the routes themselves. */
const CREATE_COVENANT = /\b(add|create|author|new|set\s+up|put)\b[^.]{0,40}\bcovenant\b|\bcovenant\b[^.]{0,20}\b(create|add)\b/i;
const CREATE_COLLATERAL = /\b(add|create|author|new|register|record)\b[^.]{0,40}\b(collateral|asset|security)\b/i;

/** Which create the banker asked for, or null. */
export function readCreateAsk(text: string, route: RelRoute): keyof typeof CREATE_GAPS | null {
  const line = text.trim();
  if (!line) return null;
  if (route === "covenant" && CREATE_COVENANT.test(line)) return "covenant";
  if (route === "valuation" && CREATE_COLLATERAL.test(line)) return "collateral";
  return null;
}

/* -------------------------------------------------------------- availability

   THE REGISTRY IS THE MAP OF WHAT EXISTS. A route the staged data cannot
   support keeps its chip and says the registry's own reason verbatim, exactly
   as the Client Actions panel does (A27.3): hiding it would take the map away
   from the banker. */
export function routeAvailability(route: RelRoute, data: C360Data, accountId: string | null) {
  return ACTIONS_BY_ID[REL_FLOWS[route].actionId].availability(data, accountId);
}
