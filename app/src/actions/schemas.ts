/* =============================================================================
   PANEL SCHEMAS for the three SHIPPING actions (A33.4.5 / A33.4.6 / A33.4.8).

   Only these three have a schema. The other seven registry actions have no
   `panelSchema` yet and stay analysis-only — an action without a schema simply
   does not open the panel.

   Every field below traces to a contract table. Notably NOT rendered as inputs:
     - `LLC_BI__Collateral__c.LLC_BI__Lendable_Value__c` (formula on the parent)
     - `LLC_BI__Review__c.RecordTypeId` (the after-save flow assigns it)
     - `cm_Review_Stage__c` (local ladder: read and labelled, never written)
   Picklist option SETS are deliberately absent: A33.1.6 requires them to be read
   from the org. Each picklist declares `optionsFrom` and the renderer disables it
   until the org supplies values.
   ============================================================================= */

import type { BorrowerBundle, Facility } from "../data/contract";
import { fmtCovVal } from "../data/finance";
import { isActiveFacility } from "../data/worklist";
import { bookedFacilities, facilityLabel, unbookedFacilities } from "../data/facilityStage";
import type { PanelField, PanelSchema } from "./panelSchema";
import { PREFILL_PROVENANCE } from "./panelSchema";

export interface SchemaContext {
  bundle: BorrowerBundle | null;
  accountId: string;
  accountName: string;
  /** Picklist values loaded from the org, keyed "Object.Field". Absent = not loaded. */
  orgPicklists?: Record<string, string[]>;
}

const provenanceOf = (source: PanelField["prefill"]["source"]) => PREFILL_PROVENANCE[source] ?? undefined;

/** Small helper so every field declaration stays readable and consistent. */
function field(f: Omit<PanelField, "prefill"> & { prefill: PanelField["prefill"] }): PanelField {
  return { ...f, prefill: { ...f.prefill, provenance: f.prefill.provenance ?? provenanceOf(f.prefill.source) } };
}

const picklist = (ctx: SchemaContext, object: string, fieldName: string): string[] | undefined =>
  ctx.orgPicklists?.[`${object}.${fieldName}`];

/* -------------------------------------------------- collateral-valuation */

/** The pledge carrying the largest lendable value on an ACTIVE facility — the
 *  natural anchor for a revaluation. */
function primaryPledge(
  bundle: BorrowerBundle | null,
): { facility: Facility; type?: string; value?: number; collateralId?: string } | null {
  let best: { facility: Facility; type?: string; value?: number; collateralId?: string } | null = null;
  for (const f of bundle?.exposure?.facilities ?? []) {
    for (const c of f.collateral ?? []) {
      const v = c.currentLendableValue ?? c.collateralValue;
      // Deterministic largest-pledge selection. We deliberately do NOT prefer a
      // pledge that happens to carry an id: that would hide a staging gap
      // behind a different, arbitrary record.
      if (best === null || (v ?? 0) > (best.value ?? 0)) {
        best = { facility: f, type: c.collateralType, value: v, collateralId: c.collateralId };
      }
    }
  }
  return best;
}

function collateralValuationSchema(ctx: SchemaContext): PanelSchema {
  const OBJ = "LLC_BI__Collateral_Valuation__c";
  const pledge = primaryPledge(ctx.bundle);

  return {
    writeObject: OBJ,
    writeObjectLabel: "collateral valuation",
    intro: "Records a new valuation against the pledged collateral. The lendable value on the collateral record is a formula and is not written here.",
    fields: [
      field({
        key: "collateral",
        label: "Collateral",
        type: "readonly",
        // Label may name the facility for the banker's benefit; the ANCHOR must
        // not. The write goes to LLC_BI__Collateral__c, so the citation is the
        // collateral record id or nothing at all.
        value: pledge ? `${pledge.type ?? "Collateral"} on ${pledge.facility.name ?? "facility"}` : null,
        prefill: { source: "NCINO_RECORD", citation: pledge?.collateralId },
        editable: false,
        editableReason: "set once at creation",
        required: true,
        target: { object: OBJ, field: "LLC_BI__Collateral__c" },
        gap: pledge?.collateralId
          ? undefined
          : {
              reason: pledge
                ? "The collateral record id is not staged in this view, so there is nothing to write the valuation against."
                : "No collateral is pledged against the active facilities on this relationship.",
              blocksStaging: true,
            },
      }),
      field({
        key: "source",
        label: "Valuation source",
        type: "picklist",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: true,
        optionsFrom: { object: OBJ, field: "LLC_BI__Source__c" },
        options: picklist(ctx, OBJ, "LLC_BI__Source__c"),
        target: { object: OBJ, field: "LLC_BI__Source__c" },
      }),
      field({
        key: "type",
        label: "Valuation type",
        type: "picklist",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: true,
        optionsFrom: { object: OBJ, field: "LLC_BI__Type__c" },
        options: picklist(ctx, OBJ, "LLC_BI__Type__c"),
        target: { object: OBJ, field: "LLC_BI__Type__c" },
      }),
      field({
        key: "valuationDate",
        label: "Valuation date",
        type: "date",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: true,
        target: { object: OBJ, field: "LLC_BI__Valuation_Date__c" },
      }),
      field({
        key: "value",
        label: "Valuation amount",
        type: "currency",
        value: pledge?.value ?? null,
        prefill: {
          source: "NCINO_RECORD",
          citation: pledge ? "current lendable value on the pledge" : undefined,
        },
        editable: true,
        required: true,
        target: { object: OBJ, field: "LLC_BI__Value__c" },
        help: "Prefilled from the current pledge value. Replace with the new valuation.",
      }),
      field({
        key: "primary",
        label: "Primary valuation",
        type: "boolean",
        // The three booleans default to false in the org, so a revaluation sets
        // Active and Primary explicitly (A33.4.5(a)).
        value: true,
        prefill: { source: "COMPUTED", citation: "revaluation sets Active and Primary explicitly" },
        editable: true,
        required: false,
        target: { object: OBJ, field: "LLC_BI__Primary__c" },
      }),
      field({
        key: "description",
        label: "Valuation notes",
        type: "longtext",
        value: null,
        prefill: { source: "AGENT_NARRATIVE" },
        editable: true,
        required: false,
        target: { object: OBJ, field: "LLC_BI__Valuation_Description__c" },
      }),
    ],
  };
}

/* ------------------------------------------------- create-service-request */

function serviceRequestSchema(ctx: SchemaContext): PanelSchema {
  const OBJ = "Case";
  const req = (ctx.bundle?.requests ?? [])[0];

  return {
    writeObject: OBJ,
    writeObjectLabel: "service request",
    intro: "Logs a service request against the relationship. Created at status New; the tool performs no status transitions and never closes a case.",
    fields: [
      field({
        key: "account",
        label: "Relationship",
        type: "readonly",
        value: ctx.accountName,
        prefill: { source: "NCINO_RECORD", citation: ctx.accountId },
        editable: false,
        editableReason: "the action is anchored on this relationship",
        required: true,
        target: { object: OBJ, field: "AccountId" },
      }),
      field({
        key: "type",
        label: "Request type",
        type: "picklist",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: true,
        optionsFrom: { object: OBJ, field: "Type" },
        options: picklist(ctx, OBJ, "Type"),
        target: { object: OBJ, field: "Type" },
      }),
      field({
        key: "origin",
        label: "Origin",
        type: "picklist",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: true,
        optionsFrom: { object: OBJ, field: "Origin" },
        options: picklist(ctx, OBJ, "Origin"),
        target: { object: OBJ, field: "Origin" },
      }),
      field({
        key: "status",
        label: "Status",
        type: "readonly",
        value: "New",
        prefill: { source: "COMPUTED", citation: "created at New; no transitions in this tool" },
        editable: false,
        editableReason: "the tool creates at New only",
        required: true,
        target: { object: OBJ, field: "Status" },
      }),
      field({
        key: "subject",
        label: "Subject",
        type: "text",
        value: req?.summary ? req.summary.slice(0, 120) : null,
        prefill: req?.summary
          ? { source: "CLIENT_REQUEST", citation: req.reference?.id }
          : { source: "BANKER" },
        editable: true,
        required: true,
        target: { object: OBJ, field: "Subject" },
      }),
      field({
        key: "description",
        label: "Description",
        type: "longtext",
        value: req?.summary ?? null,
        prefill: req?.summary
          ? { source: "CLIENT_REQUEST", citation: req.reference?.id }
          : { source: "AGENT_NARRATIVE" },
        editable: true,
        required: false,
        target: { object: OBJ, field: "Description" },
      }),
    ],
  };
}

/* -------------------------------------------------------- annual-review */

/** The nine narrative fields the execute step writes (A33.4.6(a)). */
const REVIEW_NARRATIVES: Array<[string, string, string]> = [
  ["narrative", "Review narrative", "LLC_BI__Narrative__c"],
  ["relationshipSummary", "Relationship summary", "cm_Relationship_Summary__c"],
  ["strengths", "Strengths", "cm_Strengths_Narrative__c"],
  ["weaknesses", "Weaknesses", "cm_Weakness_Narrative__c"],
  ["recommendation", "Recommendation", "cm_Recommendation_Narrative__c"],
  ["collateralAnalysis", "Collateral analysis", "cm_Collateral_Analysis_Narrative__c"],
  ["financialAnalysis", "Financial analysis", "cm_Financial_Analyst_Narrative__c"],
  ["guarantor", "Guarantor analysis", "cm_Guarantor_Narrative__c"],
  ["riskRatingComments", "Risk rating comments", "cm_Risk_Rating_Comments__c"],
];

function annualReviewSchema(ctx: SchemaContext): PanelSchema {
  const OBJ = "LLC_BI__Review__c";

  const head: PanelField[] = [
    field({
      key: "account",
      label: "Relationship",
      type: "readonly",
      value: ctx.accountName,
      prefill: { source: "NCINO_RECORD", citation: ctx.accountId },
      editable: false,
      editableReason: "the action is anchored on this relationship",
      required: true,
      target: { object: OBJ, field: "LLC_BI__Account__c" },
    }),
    field({
      key: "status",
      label: "Status",
      type: "readonly",
      // Probe-confirmed: nothing defaults this, so the execute step sets it
      // explicitly rather than letting it land NULL (A33.4.6(a)).
      value: "In Progress",
      prefill: { source: "COMPUTED", citation: "set explicitly; the org defaults nothing" },
      editable: false,
      editableReason: "the tool creates at In Progress and stops",
      required: true,
      target: { object: OBJ, field: "LLC_BI__Status__c" },
    }),
    field({
      key: "reviewType",
      label: "Review type",
      type: "picklist",
      value: null,
      prefill: { source: "BANKER" },
      editable: true,
      required: true,
      optionsFrom: { object: OBJ, field: "LLC_BI__Review_Type__c" },
      options: picklist(ctx, OBJ, "LLC_BI__Review_Type__c"),
      target: { object: OBJ, field: "LLC_BI__Review_Type__c" },
    }),
    field({
      key: "isAgentic",
      label: "Agent-authored review",
      type: "readonly",
      value: true,
      prefill: { source: "COMPUTED", citation: "the org is pre-wired for agent-authored reviews" },
      editable: false,
      editableReason: "set by the tool",
      required: false,
      target: { object: OBJ, field: "LLC_BI__Is_Agentic_Review__c" },
    }),
    field({
      key: "reviewStage",
      label: "Review stage (nCino)",
      type: "readonly",
      value: null,
      prefill: { source: "NCINO_RECORD" },
      editable: false,
      editableReason: "read and labelled, never written by this tool",
      required: false,
      target: { object: OBJ, field: "cm_Review_Stage__c" },
      help: "The bank's own process moves this ladder. The tool creates the review and stops.",
    }),
  ];

  const narratives = REVIEW_NARRATIVES.map(([key, label, apiField]) =>
    field({
      key,
      label,
      type: "longtext",
      value: null,
      prefill: { source: "AGENT_NARRATIVE" },
      editable: true,
      required: false,
      target: { object: OBJ, field: apiField },
    }),
  );

  return {
    writeObject: OBJ,
    writeObjectLabel: "annual credit review",
    intro: "Stages an annual credit review at In Progress with the drafted narratives. The bank's own Submit for Approval process mints Complete; this tool never does.",
    fields: [...head, ...narratives],
  };
}

/* =============================================================================
   WAVE 2 (A33.5.7 frozen contracts)

   Built against the CONTRACT while the Apex lane deploys, on the same seam
   discipline as WP5: field names and option sets are declared here once, so the
   swap when observed envelopes land is a single edit per action.

   Two of the five stage but cannot execute (LV06). That is a property of the
   tool map, not of these schemas: the ticket is complete and the plan is real,
   and the confirm gate is where the held state is explained.
   ============================================================================= */

/** The facility a modification or renewal acts on: the largest active one. */
function primaryFacility(bundle: BorrowerBundle | null): Facility | null {
  let best: Facility | null = null;
  for (const f of (bundle?.exposure?.facilities ?? []).filter(isActiveFacility)) {
    if (!best || (f.committed ?? 0) > (best.committed ?? 0)) best = f;
  }
  return best;
}

/** The commitment the client actually asked for, when one is staged. */
function requestedCommitment(bundle: BorrowerBundle | null): number | null {
  const ask = (bundle?.requests ?? [])[0]?.ask;
  return typeof ask?.to === "number" ? ask.to : null;
}

function newFacilitySchema(ctx: SchemaContext): PanelSchema {
  const OBJ = "LLC_BI__Loan__c";
  const pkg = ctx.bundle?.snapshot?.productPackageId;

  return {
    writeObject: OBJ,
    writeObjectLabel: "facility request",
    intro: pkg
      ? "Requests a new facility on this relationship's package, with the borrower added to its borrowing structure at 100 percent. nCino names the loan itself on creation and fills in the application method; the Loan Detail record follows about four seconds later."
      : "Requests a new facility for this relationship. No credit package exists yet, so one is created first and the facility filed under it, with the borrower added to its borrowing structure at 100 percent. nCino names the loan itself on creation and fills in the application method; the Loan Detail record follows about four seconds later.",
    fields: [
      field({
        key: "account",
        label: "Relationship",
        type: "readonly",
        value: ctx.accountName,
        prefill: { source: "NCINO_RECORD", citation: ctx.accountId },
        editable: false,
        editableReason: "the action is anchored on this relationship",
        required: true,
        target: { object: OBJ, field: "LLC_BI__Account__c" },
      }),
      field({
        key: "package",
        label: "Package",
        type: "readonly",
        // A relationship with no package is not a dead end: the org's own wizard
        // creates one first, and so does the plan. No blocking gap.
        value: pkg ? "This relationship's deal package" : "A new package will be created first",
        prefill: pkg
          ? { source: "NCINO_RECORD", citation: pkg }
          : { source: "COMPUTED", citation: "created by the plan, named the way nCino's wizard names it" },
        editable: false,
        editableReason: pkg ? "the facility hangs off the existing package" : "the plan creates it before the facility",
        required: false,
        target: { object: OBJ, field: "LLC_BI__Product_Package__c" },
      }),
      field({
        key: "amount",
        label: "Amount",
        type: "currency",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: true,
        target: { object: OBJ, field: "LLC_BI__Amount__c" },
      }),
      field({
        key: "productType",
        label: "Product",
        type: "picklist",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        // PROBE 5, finding 2: the org self-populates this to `Construction`
        // when it is left blank, and then builds the loan's Name from it. A
        // tool that does not collect Product ships loans mislabelled.
        required: true,
        optionsFrom: { object: OBJ, field: "LLC_BI__Product__c" },
        options: picklist(ctx, OBJ, "LLC_BI__Product__c"),
        target: { object: OBJ, field: "LLC_BI__Product__c" },
        help: "Left blank, the org files this as Construction and names the loan accordingly.",
      }),
      field({
        key: "termMonths",
        label: "Term (months)",
        type: "text",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: false,
        target: { object: OBJ, field: "LLC_BI__Term__c" },
      }),
      field({
        key: "purpose",
        label: "Primary loan purpose",
        type: "picklist",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        // PROBE 5, finding 4: of the two fields LV12/LV13 gate, the org
        // pre-fills Application Method and leaves this one null. It is the one
        // thing the banker actually has to supply, and it lives on the Loan
        // DETAIL, which the org creates asynchronously.
        required: true,
        optionsFrom: { object: "LLC_BI__Loan_Detail__c", field: "LLC_BI__Primary_Loan_Purpose__c" },
        options: picklist(ctx, "LLC_BI__Loan_Detail__c", "LLC_BI__Primary_Loan_Purpose__c"),
        target: { object: "LLC_BI__Loan_Detail__c", field: "LLC_BI__Primary_Loan_Purpose__c" },
        help: "Written to the Loan Detail once the org has created it.",
      }),
      field({
        key: "applicationMethod",
        label: "Application method",
        type: "readonly",
        value: "Online",
        prefill: { source: "COMPUTED", citation: "org-defaulted on the Loan Detail; nothing is sent for it" },
        editable: false,
        editableReason: "the org fills this in",
        required: false,
        target: { object: "LLC_BI__Loan_Detail__c", field: "LLC_BI__Application_Method__c" },
      }),
      field({
        key: "loanOfficer",
        label: "Loan officer",
        type: "readonly",
        value: "Assigned by the org",
        prefill: { source: "COMPUTED", citation: "org-assigned; ACNPEX_AccountOwnerAsLoanOfficer overwrites anything set here" },
        editable: false,
        editableReason: "the org assigns this and overwrites what we send",
        required: false,
        target: { object: OBJ, field: "LLC_BI__Loan_Officer__c" },
        help: "Set by nCino's own assignment routine, so the cockpit does not propose one.",
      }),
    ],
  };
}

function riskRatingSchema(ctx: SchemaContext): PanelSchema {
  // PROBE 4 (ledger wave 3): the object is LLC_BI__Annual_Review__c. There is
  // no LLC_BI__Risk_Rating_Review__c in this org; the label/API mismatch is
  // A33.4.7. It has no RecordTypeId and no OwnerId, and it is a cascade-delete
  // child of Account. Every field below was read back by the insert probe.
  const OBJ = "LLC_BI__Annual_Review__c";
  const grade = ctx.bundle?.snapshot?.primaryRiskRating;
  const computed = ctx.bundle?.snapshot?.computedRiskRating;

  return {
    writeObject: OBJ,
    writeObjectLabel: "risk rating review",
    intro:
      "Records a rating review against this relationship. It is created In Review; the org's own decision path owns Approved and Declined. An override is the banker's call, and the org requires it to carry a reason.",
    fields: [
      field({
        key: "account",
        label: "Relationship",
        type: "readonly",
        value: ctx.accountName,
        prefill: { source: "NCINO_RECORD", citation: ctx.accountId },
        editable: false,
        editableReason: "the action is anchored on this relationship",
        required: true,
        target: { object: OBJ, field: "LLC_BI__Account__c" },
      }),
      field({
        key: "status",
        label: "Status",
        type: "readonly",
        // PROBE 4: an omitted status lands in `Not Approved`, which reads as a
        // DECISION rather than an absent value. The tool sets In Review
        // explicitly for exactly that reason.
        value: "In Review",
        prefill: { source: "COMPUTED", citation: "set explicitly; the org would otherwise default this to Not Approved" },
        editable: false,
        editableReason: "the tool creates at In Review and stops",
        required: true,
        target: { object: OBJ, field: "LLC_BI__Status__c" },
        help: "Left unset, the org files this as Not Approved, which reads as a decision nobody made.",
      }),
      field({
        key: "computedGrade",
        label: "Computed grade",
        type: "readonly",
        value: computed != null ? `Grade ${computed}` : null,
        prefill: { source: "NCINO_RECORD", citation: "Customer360Snapshot — the org's computed grade" },
        editable: false,
        editableReason: "the org computes this",
        required: false,
        target: { staging: true },
      }),
      field({
        key: "finalGrade",
        label: "Final grade",
        type: "readonly",
        value: grade != null ? `Grade ${grade}` : null,
        prefill: { source: "NCINO_RECORD", citation: "Customer360Snapshot — nCino risk grade" },
        editable: false,
        editableReason: "the org's decision path sets the final grade",
        required: false,
        // Displayed, never targeted: A33.1.6 bans this field as a write target
        // and the decision path owns it.
        target: { staging: true },
      }),
      // OBSERVED: the stage tool takes four NAMED factor actuals. They are the
      // inputs the org computes the grade from, so the ticket collects them.
      ...([
        ["cashFlowCoverage", "Cash flow coverage"],
        ["revenueGrowth", "Revenue growth"],
        ["managementExperience", "Management experience"],
        ["creditScore", "Credit score"],
      ] as Array<[string, string]>).map(([key, label]) =>
        field({
          key,
          label,
          type: "currency",
          value: null,
          prefill: { source: "BANKER" },
          editable: true,
          required: false,
          target: { object: OBJ, field: `LLC_BI__${label.replace(/ /g, "_")}_actual__c` },
        }),
      ),
      field({
        key: "overrideValue",
        label: "Override grade",
        type: "currency",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: false,
        target: { object: OBJ, field: "LLC_BI__Overridden_Risk_Grade_Value__c" },
        help: "Leave empty to accept the computed grade.",
      }),
      field({
        key: "overrideComment",
        label: "Reason for the override",
        type: "longtext",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        // Conditionally required: see `overrideNeedsComment` below. The schema
        // cannot express "required when another field is set", so the rule is a
        // function the panel and the tests share rather than a duplicated
        // condition in each.
        required: false,
        target: { object: OBJ, field: "LLC_BI__Comments__c" },
      }),
    ],
  };
}

/**
 * The org's validation rule, stated once: an override without a reason is
 * refused. Enforced in the panel so the banker learns it here rather than from
 * a rejected write.
 */
export function overrideNeedsComment(values: Record<string, unknown>): boolean {
  const comment = typeof values.overrideComment === "string" ? values.overrideComment.trim() : "";
  return overrideIsSet(values) && comment === "";
}

export const OVERRIDE_COMMENT_REQUIRED = "An override requires a stated reason.";

/**
 * The override is typed but cannot yet be FILED.
 *
 * The staged plan writes `LLC_BI__Overridden_Risk_Grade_Value__c`, so the tool
 * almost certainly accepts an override input, but no observed request has ever
 * carried one and its wire name would be a guess. Guessing a field name is the
 * failure this campaign has already paid for twice.
 *
 * So the input stays — the banker's judgement is worth capturing — and staging
 * is BLOCKED with this said out loud. Silently dropping what somebody typed is
 * the one option that is not available.
 */
export const OVERRIDE_NOT_YET_FILEABLE =
  "Filing an override needs one live-probe confirmation of the org's field name, coming in the next wave. Clear the override to stage this review, or keep it and wait.";

export function overrideIsSet(values: Record<string, unknown>): boolean {
  const v = values.overrideValue;
  return typeof v === "number" ? v > 0 : typeof v === "string" && v.trim() !== "" && Number(v) > 0;
}

function covenantReviewSchema(ctx: SchemaContext): PanelSchema {
  const OBJ = "LLC_BI__Covenant_Compliance2__c";
  // UPDATE-only: the assessment lands on a compliance record that already
  // exists. Same doctrine as the collateral anchor — no id, no staging.
  const cov = (ctx.bundle?.covenants?.covenants ?? []).find((c) => c.complianceId) ?? (ctx.bundle?.covenants?.covenants ?? [])[0];
  const complianceId = cov?.complianceId;

  return {
    writeObject: OBJ,
    writeObjectLabel: "covenant assessment",
    intro:
      "Records an assessment against the existing compliance record. Status changes are recorded on that record; the bank's approval process governs new compliance periods.",
    fields: [
      field({
        key: "covenant",
        label: "Covenant",
        type: "readonly",
        value: cov ? `${cov.covenantType ?? "Covenant"}${cov.thresholdValue != null ? ` against ${fmtCovVal(cov.thresholdValue)}` : ""}` : null,
        prefill: { source: "NCINO_RECORD", citation: complianceId },
        editable: false,
        editableReason: "the assessment updates this compliance record",
        required: true,
        target: { object: OBJ, field: "Id" },
        gap: complianceId
          ? undefined
          : {
              reason: cov
                ? "The compliance record id is not staged in this view, so there is nothing to record an assessment against."
                : "No covenants are staged for this relationship.",
              blocksStaging: true,
            },
      }),
      field({
        key: "assessmentResult",
        label: "Assessment",
        type: "picklist",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: true,
        optionsFrom: { object: OBJ, field: "LLC_BI__Status__c" },
        options: picklist(ctx, OBJ, "LLC_BI__Status__c"),
        target: { object: OBJ, field: "LLC_BI__Status__c" },
      }),
      field({
        key: "observedValue",
        label: "Reported actual",
        type: "readonly",
        // No write target for this was probed, so it is context, not a field we
        // claim to set. The assessment is what this action records.
        value: cov?.actualValue != null ? fmtCovVal(cov.actualValue) : null,
        prefill: { source: "NCINO_RECORD", citation: "Customer360Covenants — last reported actual" },
        editable: false,
        editableReason: "read from the covenant",
        required: false,
        target: { staging: true },
      }),
      field({
        key: "assessmentNarrative",
        label: "Assessment notes",
        type: "longtext",
        value: null,
        prefill: { source: "AGENT_NARRATIVE" },
        editable: true,
        required: false,
        target: { object: OBJ, field: "LLC_BI__Reason_for_Exception__c" },
      }),
    ],
  };
}

/** Modification and renewal share their anchor: both act on an existing booked
 *  facility, both are staged and neither is executed.
 *
 *  EVERY CONTROL BELOW MAPS ONE-FOR-ONE TO AN OBSERVED WIRE FIELD, with one
 *  deliberate exception: the reason. It has no wire field of its own and folds
 *  into `rationale`, so it targets staging rather than claiming an org field. A
 *  control the wire cannot carry is a promise the panel cannot keep. */
function facilityChangeSchema(ctx: SchemaContext, kind: "modification" | "renewal"): PanelSchema {
  const OBJ = "LLC_BI__Loan__c";
  const fac = primaryFacility(ctx.bundle);
  const asked = requestedCommitment(ctx.bundle);

  // Only BOOKED facilities can carry a credit action. The rest are listed with
  // their stage rather than hidden, so a banker hunting for a facility learns
  // why it is not on offer.
  const booked = bookedFacilities(ctx.bundle);
  const blocked = unbookedFacilities(ctx.bundle);
  const chosen = booked.find((f) => f.loanId === fac?.loanId) ?? booked[0];

  const anchor = field({
    key: "facility",
    label: "Facility",
    type: "picklist",
    // One booked facility is the answer, not a question: preselect it.
    value: chosen ? facilityLabel(chosen) : null,
    prefill: chosen ? { source: "NCINO_RECORD", citation: chosen.loanId } : { source: "BANKER" },
    editable: booked.length > 1,
    editableReason: booked.length > 1 ? undefined : "the only booked facility on this relationship",
    required: true,
    optionsAreRecords: true,
    options: booked.map(facilityLabel),
    disabledOptions: blocked.map((b) => ({ value: facilityLabel(b.facility), reason: b.reason })),
    target: { object: OBJ, field: "Id" },
    gap: chosen
      ? undefined
      : {
          reason: "No booked facility is staged on this relationship, so there is nothing a credit action can run against.",
          blocksStaging: true,
        },
  });

  /** `requestedRate` on both observed envelopes. */
  const rate = field({
    key: "requestedRate",
    label: "Rate",
    type: "currency",
    value: null,
    prefill: { source: "BANKER" },
    editable: true,
    required: false,
    target: { staging: true },
    help: fac?.interestRate != null ? `Currently ${fac.interestRate} percent.` : undefined,
  });

  const reason = field({
    key: kind === "renewal" ? "renewalReason" : "modificationReason",
    label: "Reason",
    type: "longtext",
    value: null,
    prefill: { source: "AGENT_NARRATIVE" },
    editable: true,
    required: false,
    // No wire field of its own: this text becomes the plan's rationale, which
    // the org does record.
    target: { staging: true },
    help: "Carried on the plan as the stated reason for this change.",
  });

  if (kind === "renewal") {
    return {
      writeObject: OBJ,
      writeObjectLabel: "renewal",
      intro: "Builds the renewal plan for this facility. The plan is staged and preserved; filing it awaits the org's own approval path.",
      fields: [
        anchor,
        field({
          key: "newMaturityDate",
          label: "New maturity",
          type: "date",
          value: null,
          prefill: { source: "BANKER" },
          editable: true,
          required: true,
          target: { object: OBJ, field: "LLC_BI__Maturity_Date__c" },
          help: fac?.maturityDate ? `Currently matures ${fac.maturityDate}.` : undefined,
        }),
        rate,
        reason,
      ],
    };
  }

  return {
    writeObject: OBJ,
    writeObjectLabel: "modification",
    intro: "Builds the modification plan for this facility. The plan is staged and preserved; filing it awaits the org's own approval path.",
    fields: [
      anchor,
      field({
        key: "newCommitment",
        label: "New commitment",
        type: "currency",
        // The client's own ask when one is staged: the banker should not have to
        // retype a number the relationship already carries.
        value: asked ?? fac?.committed ?? null,
        prefill: asked
          ? { source: "CLIENT_REQUEST", citation: (ctx.bundle?.requests ?? [])[0]?.reference?.id }
          : fac?.committed != null
            ? { source: "NCINO_RECORD", citation: "current commitment on the facility" }
            : { source: "BANKER" },
        editable: true,
        required: true,
        target: { object: OBJ, field: "LLC_BI__Amount__c" },
      }),
      field({
        key: "requestedTermMonths",
        label: "Term (months)",
        type: "text",
        value: null,
        prefill: { source: "BANKER" },
        editable: true,
        required: false,
        target: { staging: true },
      }),
      rate,
      reason,
    ],
  };
}


/* ------------------------------------------------------------- registry */

export type SchemaBuilder = (ctx: SchemaContext) => PanelSchema;

/** Only the three shipping actions. An action absent here has no panel. */
export const PANEL_SCHEMAS: Record<string, SchemaBuilder> = {
  "collateral-valuation": collateralValuationSchema,
  "create-service-request": serviceRequestSchema,
  "annual-review": annualReviewSchema,
  "new-facility-request": newFacilitySchema,
  "risk-rating-review": riskRatingSchema,
  "covenant-review": covenantReviewSchema,
  "loan-modification": (ctx) => facilityChangeSchema(ctx, "modification"),
  renewal: (ctx) => facilityChangeSchema(ctx, "renewal"),
};

export function buildPanelSchema(actionId: string, ctx: SchemaContext): PanelSchema | null {
  const builder = PANEL_SCHEMAS[actionId];
  return builder ? builder(ctx) : null;
}
