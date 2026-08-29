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
  /**
   * May the tool write onto a record that already exists?
   *
   * SEPARATE FROM `mayCreate`, and it has to be. Until WS0.5 every object this
   * mirror saw a write step on was creatable, so reading "write step" as
   * "create" cost nothing. The covenant review broke that: it is the first tool
   * that only ever UPDATES, and reading its writes as creates refused every
   * real plan at the confirm gate before a banker could confirm one.
   *
   * The mirror does NOT try to tell a create from an update. A wire step
   * declares its object and its field names and nothing else, and a heuristic
   * over those was tried and was wrong both ways. What the two flags say is
   * whether the tool touches this object AT ALL, in either mode; the one create
   * that must be caught on an update-only object — a compliance row — is caught
   * by `refusedFields`, because creating one means writing `LLC_BI__Covenant__c`.
   */
  mayUpdate: boolean;
  /** Field/value pairs a create is allowed to set as its state. */
  createStates: Array<{ field: string; value: string }>;
  /** Permitted state transitions. Empty means: none, ever. */
  transitions: Array<{ field: string; from: string[]; to: string[]; condition?: string }>;
  /** Fields this tool may never write, with the reason. */
  refusedFields: Array<{ field: string; reason: string }>;
  /** Prose refusals that are not field-shaped (deletes, sub-record creation). */
  refusedOperations: string[];
}

/** The A33.3.1 table, verbatim. Keys are the plan's `object` values. */
export const TRANSITION_ALLOWLIST: Record<string, ObjectPolicy> = {
  "LLC_BI__Loan__c": {
    object: "LLC_BI__Loan__c",
    label: "facility",
    mayCreate: true,
    // A modification writes the requested amount, term and rate onto the CLONE.
    mayUpdate: true,
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
    mayUpdate: false,
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
    // Generation is managed automation; we never create these. UPDATING an
    // existing row is the entire covenant review.
    mayCreate: false,
    mayUpdate: true,
    createStates: [],
    transitions: [
      // WAIVED joined the pair in WS0.5, matching the org's own write guard
      // (C360WriteGuard UPDATE_TRANSITIONS = Compliant, Waived, Exception). A
      // waiver is a decision not to enforce and is its own outcome, never a
      // synonym for either of the other two.
      //
      // `In Progress` is a legitimate SOURCE only under the banker's explicit
      // allowNonPending opt-in; without it the org refuses that row per
      // covenant, and the plan never contains the step at all.
      { field: "LLC_BI__Status__c", from: ["Pending", "In Progress"], to: ["Compliant", "Waived", "Exception"] },
    ],
    refusedFields: [
      { field: "LLC_BI__Effective_Date__c", reason: "writing it corrupts the whole compliance schedule" },
      { field: "LLC_BI__Covenant__c", reason: "set once at creation" },
    ],
    refusedOperations: [
      "creation: generation is managed automation, and a create is what raises the bank's covenant approval",
      "any status transition outside the three complete statuses",
      "Reason for Exception outside Breached and Overdue, which the org fences too",
    ],
  },

  "LLC_BI__Collateral_Valuation__c": {
    object: "LLC_BI__Collateral_Valuation__c",
    label: "collateral valuation",
    mayCreate: true,
    mayUpdate: false,
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
    mayUpdate: false,
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
    mayUpdate: false,
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
    mayUpdate: false,
    createStates: [{ field: "Status", value: "New" }],
    transitions: [],
    refusedFields: [],
    refusedOperations: ["any status transition", "case closure"],
  },

  /* ---- THE THREE `stage_new_facility` PLANS ON, and this mirror did not know
     about any of them. The Loan policy above covered `write_loan` and the one
     stage hop, and the other three write steps in the org's own observed plan
     — `create_package`, `write_involvement`, `write_loan_purpose` — landed on
     objects with no policy, which reads as "not on the transition allowlist".
     That is the wrong sentence twice over: it says the plan is malformed when
     the plan is the org's, and it would refuse every real creation at the
     confirm gate. Mirrored below from `C360WriteGuard`'s own CREATE_STATES,
     FORBIDDEN_FIELDS and CREATE_ONLY sets, which is the fence the deployed tool
     actually passes through.                                                  */

  "LLC_BI__Product_Package__c": {
    object: "LLC_BI__Product_Package__c",
    label: "credit package",
    // The account door of a creation: the plan makes the package before the
    // facility, exactly as nCino's own wizard does. It never updates one.
    mayCreate: true,
    mayUpdate: false,
    createStates: [],
    transitions: [],
    refusedFields: [
      { field: "RecordTypeId", reason: "real packages in this org have none, and only Master is available to the running profile anyway" },
      { field: "LLC_BI__Stage__c", reason: "the package's own stage belongs to the org's package automation" },
      { field: "LLC_BI__Status__c", reason: "the package's own status belongs to the org's package automation" },
    ],
    refusedOperations: ["updates of any kind", "deletion"],
  },

  "LLC_BI__Legal_Entities__c": {
    object: "LLC_BI__Legal_Entities__c",
    label: "borrowing structure row",
    // ONE row, and it is the borrower's at 100 percent ownership. A facility
    // insert creates none on its own, so without it the facility would have no
    // borrowing structure at all.
    mayCreate: true,
    mayUpdate: false,
    createStates: [{ field: "LLC_BI__Borrower_Type__c", value: "Borrower" }],
    transitions: [],
    refusedFields: [
      { field: "LLC_BI__Is_Borrower__c", reason: "formula derived from Borrower_Type" },
      { field: "LLC_BI__Is_Guarantor__c", reason: "formula derived from Borrower_Type" },
      { field: "LLC_BI__Is_CoBorrower__c", reason: "formula derived from Borrower_Type" },
      { field: "LLC_BI__Is_Grantor__c", reason: "formula derived from Borrower_Type" },
      { field: "LLC_BI__Is_Related_Entity__c", reason: "formula derived from Borrower_Type" },
      {
        field: "LLC_BI__Contingent_Amount__c",
        reason: "mutually exclusive with Ownership on one row, and the validation rule's only escape tests for a Household role this org does not have",
      },
    ],
    refusedOperations: ["updates of any kind", "a second involvement row: the tool files the borrower's and nothing else"],
  },

  "LLC_BI__Loan_Detail__c": {
    object: "LLC_BI__Loan_Detail__c",
    label: "loan detail",
    // NEVER CREATED BY US. nCino creates it in an after-commit flow of its own,
    // which is the whole reason execution is two invocations. The one field the
    // resume writes is the primary loan purpose.
    mayCreate: false,
    mayUpdate: true,
    createStates: [],
    transitions: [],
    refusedFields: [
      { field: "LLC_BI__Application_Method__c", reason: "the org defaults it on the record it creates" },
    ],
    refusedOperations: [
      "creation by us: the org's own after-commit flow owns it",
      "any write other than the primary loan purpose the resume sets",
    ],
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

  // An ordinary field write. The mirror does not guess whether it is a create
  // or an update (see `mayUpdate`); it asks whether the tool may write this
  // object at all.
  if (!policy.mayCreate && !policy.mayUpdate) {
    out.push({ stepId: step.id, object: objectName, reason: `${policy.label} may never be written by this tool` });
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
