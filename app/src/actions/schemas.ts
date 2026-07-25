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
function primaryPledge(bundle: BorrowerBundle | null): { facility: Facility; type?: string; value?: number } | null {
  let best: { facility: Facility; type?: string; value?: number } | null = null;
  for (const f of bundle?.exposure?.facilities ?? []) {
    for (const c of f.collateral ?? []) {
      const v = c.currentLendableValue ?? c.collateralValue;
      if (best === null || (v ?? 0) > (best.value ?? 0)) best = { facility: f, type: c.collateralType, value: v };
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
        value: pledge ? `${pledge.type ?? "Collateral"} on ${pledge.facility.name ?? "facility"}` : null,
        prefill: { source: "NCINO_RECORD", citation: pledge?.facility.loanId },
        editable: false,
        editableReason: "set once at creation",
        required: true,
        target: { object: OBJ, field: "LLC_BI__Collateral__c" },
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

/* ------------------------------------------------------------- registry */

export type SchemaBuilder = (ctx: SchemaContext) => PanelSchema;

/** Only the three shipping actions. An action absent here has no panel. */
export const PANEL_SCHEMAS: Record<string, SchemaBuilder> = {
  "collateral-valuation": collateralValuationSchema,
  "create-service-request": serviceRequestSchema,
  "annual-review": annualReviewSchema,
};

export function buildPanelSchema(actionId: string, ctx: SchemaContext): PanelSchema | null {
  const builder = PANEL_SCHEMAS[actionId];
  return builder ? builder(ctx) : null;
}
