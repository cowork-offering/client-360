/* =============================================================================
   PER-OBJECT TRANSITION ALLOWLIST (A33.3.1 v3, binding)

   Each tool declares the exact object states it may create or transition.
   Anything not on this table is REFUSED BY THE TOOL, not merely absent from the
   UI. This file is the client-side mirror: the tracker validates every plan
   against it before the banker ever sees a confirm gesture, so a malformed plan
   is caught here rather than at the org boundary.

   Why an allowlist and not a permission: v1 generalised a Loan-specific fact
   into a whole-system claim. Withholding `LLC_BI__Exclude_Validation` fences
   Loan STAGE MOVEMENT and nothing else. It does nothing about Case creation,
   valuation insertion, risk-review write-back or covenant workflow. Those
   objects need their own fence, and this table IS that fence.
   ============================================================================= */

export interface ObjectPolicy {
  /** API name of the object. */
  object: string;
  /** Banker-facing name, so no UI ever renders the API name. */
  label: string;
  /** May the tool create this object at all? */
  mayCreate: boolean;
  /** Field/value pairs a create is allowed to set as its state. */
  createStates: Array<{ field: string; value: string }>;
  /** Permitted state transitions. Empty means: none, ever. */
  transitions: Array<{ field: string; from: string[]; to: string[]; condition?: string }>;
  /** Fields this tool may never write, with the reason. */
  refusedFields: Array<{ field: string; reason: string }>;
  /** Prose refusals that are not field-shaped (deletes, sub-record creation). */
  refusedOperations: string[];
  /** HELD means: specified but not shippable until a named probe lands. */
  held?: string;
}

/** The A33.3.1 table, verbatim. Keys are the plan's `object` values. */
export const TRANSITION_ALLOWLIST: Record<string, ObjectPolicy> = {
  "LLC_BI__Loan__c": {
    object: "LLC_BI__Loan__c",
    label: "facility",
    mayCreate: true,
    createStates: [
      { field: "LLC_BI__Stage__c", value: "Qualification" },
      { field: "LLC_BI__Status__c", value: "Open" },
    ],
    transitions: [
      {
        field: "LLC_BI__Stage__c",
        from: ["Qualification"],
        to: ["Proposal"],
        // Exactly one hop, in execute_new_facility phase 2, and only after the
        // Loan Detail verification step passes (founder decision 2026-07-26).
        condition: "loan-detail-verified",
      },
    ],
    refusedFields: [
      { field: "LLC_BI__hasRenewal__c", reason: "formula field" },
      { field: "LLC_BI__Number_Of_Renewals__c", reason: "formula field" },
    ],
    refusedOperations: [
      "every stage transition other than the single Qualification to Proposal hop, in either direction",
      "any write to a post-approval stage",
      "the Qualification to Proposal hop while Loan Detail is unverified",
      "setting both loan-type flags on a clone",
    ],
  },

  "LLC_BI__LoanRenewal__c": {
    object: "LLC_BI__LoanRenewal__c",
    label: "renewal junction",
    // nCino's invocable owns this junction (founder decision 2026-07-26).
    mayCreate: false,
    createStates: [],
    transitions: [],
    refusedFields: [{ field: "LLC_BI__ParentLoanId__c", reason: "set once at creation" }],
    refusedOperations: [
      "creation by us: nCino's credit action owns the junction",
      "updates of any kind",
      "deletion: removing a chain row is permanent poison",
    ],
  },

  "LLC_BI__Covenant_Compliance2__c": {
    object: "LLC_BI__Covenant_Compliance2__c",
    label: "covenant compliance record",
    // Generation is managed automation; we never create these.
    mayCreate: false,
    createStates: [],
    transitions: [
      { field: "LLC_BI__Status__c", from: ["Pending", "In Progress"], to: ["Compliant", "Exception"] },
    ],
    refusedFields: [
      { field: "LLC_BI__Effective_Date__c", reason: "writing it corrupts the whole compliance schedule" },
      { field: "LLC_BI__Covenant__c", reason: "set once at creation" },
    ],
    refusedOperations: ["creation: generation is managed automation", "any status transition outside the permitted pair"],
    held: "the acnpex_covenantApprovalProcess entry-criteria probe has not landed, so no covenant tool ships",
  },

  "LLC_BI__Collateral_Valuation__c": {
    object: "LLC_BI__Collateral_Valuation__c",
    label: "collateral valuation",
    mayCreate: true,
    createStates: [
      { field: "LLC_BI__Active__c", value: "true" },
      { field: "LLC_BI__Primary__c", value: "true" },
    ],
    transitions: [],
    refusedFields: [
      { field: "LLC_BI__Lendable_Value__c", reason: "formula on the parent collateral record" },
    ],
    refusedOperations: ["updates", "deletes", "sub-collateral creation"],
  },

  "LLC_BI__Review__c": {
    object: "LLC_BI__Review__c",
    label: "credit review",
    mayCreate: true,
    createStates: [{ field: "LLC_BI__Status__c", value: "In Progress" }],
    transitions: [],
    refusedFields: [
      { field: "cm_Review_Stage__c", reason: "the bank's own process owns this ladder" },
      { field: "RecordTypeId", reason: "the after-save flow assigns it" },
      { field: "cm_Approved_Date__c", reason: "belongs to the approval path, which is not ours" },
    ],
    refusedOperations: [
      "any status transition, including to Complete",
      "writing cm_Review_Stage__c to Approval or Complete",
    ],
  },

  "LLC_BI__Annual_Review__c": {
    object: "LLC_BI__Annual_Review__c",
    label: "risk rating review",
    mayCreate: true,
    createStates: [{ field: "LLC_BI__Status__c", value: "In Review" }],
    transitions: [],
    refusedFields: [{ field: "LLC_BI__Final_Risk_Grade__c", reason: "formula field" }],
    refusedOperations: [
      "any decision transition: Approved and Declined belong to the org's own decisioning path",
    ],
  },

  Case: {
    object: "Case",
    label: "service request",
    mayCreate: true,
    createStates: [{ field: "Status", value: "New" }],
    transitions: [],
    refusedFields: [],
    refusedOperations: ["any status transition", "case closure"],
  },
};

/* ------------------------------------------------------------- validation */

export interface AllowlistViolation {
  stepId: string;
  object: string;
  reason: string;
}

export interface StepFieldWrite {
  field: string;
  value?: unknown;
}

export interface ValidatableStep {
  id: string;
  type: string;
  /** Locally-built plans use `object`; the live wire uses `objectName`. */
  object?: string;
  objectName?: string;
  /** Locally-built plans carry values; the wire carries field NAMES only. */
  fields?: Array<StepFieldWrite | string>;
  /** Present when the step transitions rather than creates. */
  transition?: { field: string; from: string; to: string };
  /** Preconditions the executor has verified, for conditional transitions. */
  satisfiedConditions?: string[];
}

const asString = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/**
 * Validate one step against the allowlist. Returns every violation rather than
 * the first, so a malformed plan reports fully instead of one problem at a time.
 */
/** Normalise both shapes: locally-built `{field, value}` and the wire's bare name. */
function normalizeFields(fields: ValidatableStep["fields"]): StepFieldWrite[] {
  return (fields ?? []).map((f) => (typeof f === "string" ? { field: f } : f));
}

export function validateStep(step: ValidatableStep): AllowlistViolation[] {
  const objectName = step.object ?? step.objectName;
  // Non-write steps touch nothing, so nothing to police.
  if (step.type !== "write" || !objectName) return [];

  const policy = TRANSITION_ALLOWLIST[objectName];
  if (!policy) {
    return [{ stepId: step.id, object: objectName, reason: `${objectName} is not on the transition allowlist` }];
  }

  const out: AllowlistViolation[] = [];
  const fields = normalizeFields(step.fields);

  if (policy.held) {
    out.push({ stepId: step.id, object: objectName, reason: `held: ${policy.held}` });
  }

  // Refused fields, whatever the operation.
  for (const f of fields) {
    const refused = policy.refusedFields.find((r) => r.field === f.field);
    if (refused) {
      out.push({ stepId: step.id, object: objectName, reason: `${f.field} may never be written: ${refused.reason}` });
    }
  }

  if (step.transition) {
    const t = policy.transitions.find(
      (x) => x.field === step.transition!.field && x.from.includes(step.transition!.from) && x.to.includes(step.transition!.to),
    );
    if (!t) {
      out.push({
        stepId: step.id,
        object: objectName,
        reason: `transition ${step.transition.field} ${step.transition.from} to ${step.transition.to} is not permitted on ${policy.label}`,
      });
    } else if (t.condition && !(step.satisfiedConditions ?? []).includes(t.condition)) {
      out.push({
        stepId: step.id,
        object: objectName,
        reason: `transition requires the ${t.condition} precondition, which is not satisfied`,
      });
    }
    return out;
  }

  // A create.
  if (!policy.mayCreate) {
    out.push({ stepId: step.id, object: objectName, reason: `${policy.label} may never be created by this tool` });
    return out;
  }

  // Any state field the policy pins must carry the pinned value.
  // Value pinning only applies where values are present: the live wire carries
  // field NAMES, and the server enforces the values itself.
  for (const pinned of policy.createStates) {
    const written = fields.find((f) => f.field === pinned.field);
    if (written && written.value !== undefined && asString(written.value) !== pinned.value) {
      out.push({
        stepId: step.id,
        object: objectName,
        reason: `${pinned.field} may only be created as ${pinned.value}, got ${asString(written.value)}`,
      });
    }
  }

  return out;
}

/** Validate a whole plan. An empty array means every step is allowlisted. */
export function validatePlan(steps: ValidatableStep[]): AllowlistViolation[] {
  return steps.flatMap(validateStep);
}
