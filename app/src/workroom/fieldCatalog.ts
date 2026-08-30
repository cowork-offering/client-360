import type { ManifestGroupId } from "./types";

/* =============================================================================
   THE MODIFICATION FIELD CATALOG (W1).

   "Loan/package FIELDS MUST BE INDEXED so natural-language amendments map to
   the correct real fields (cf. the LLC_BI__InterestRate__c lesson)."

   That lesson cost a live wave: the staged plan declared `LLC_BI__Interest_Rate__c`,
   which DOES NOT EXIST on Loan in this org, and nothing dereferenced it until an
   execution tried. So every amendment a banker can say is indexed here against a
   REAL field, with where the name came from written down beside it.

   FOUR PROVENANCE TIERS, and the difference is load-bearing:

     live-verified   — read from a LIVE DESCRIBE of this org on 2026-08-27. The
                       API name, the type and the picklist below are the org's
                       own answer, not a convention.
     observed        — seen on the wire, or read out of deployed Apex that ran
                       live (the stage/execute envelopes, the Customer360* SOQL,
                       the DEMO-RELATIONSHIP build).
     schema-known    — from `knowledge/SCHEMA-VERIFIED.md`, which is an earlier
                       live describe of this org (2026-06-28), or from a probe
                       finding recorded in PROBE-LEDGER / LESSONS-NCINO-APEX.
     to-verify-live  — a CANDIDATE. Named by nCino convention and not confirmed
                       on this org, because the describe that would settle it has
                       not been run for that object.

   THE RULE THAT MAKES `to-verify-live` SAFE: a candidate name NEVER travels to
   the org. Only `wireKey` fields are sent, all four of them are live-verified,
   and an entry with no `wireKey` can only ever be spoken about — manifested and
   handed off. A wrong candidate is therefore a wrong sentence, never a wrong
   write, which is the whole difference from the Interest_Rate lesson.

   `apiName: null` means the entry is a RECORD rather than a field (a covenant, a
   pledge, an involvement row, a fee), or that the org has not established a name
   for the concept. A describe fills the name in and flips the tag; nothing else
   about the entry, and nothing that reads it, changes shape.

   Full scope-vs-tools mapping: `knowledge/sf-build-v2/wiring-gap-analysis.md`.
   ============================================================================= */

export type CatalogSource = "live-verified" | "observed" | "schema-known" | "to-verify-live";

/** What a banker is amending. Drives the handoff copy and the manifest group. */
export type CatalogCategory =
  | "loan-terms"
  | "loan-other"
  | "package"
  | "covenant"
  | "collateral"
  | "party"
  | "pricing"
  | "fee"
  | "exception";

/** The four request keys `stage_loan_modification` accepts. Nothing else is a
 *  change this tool can carry, and the tool refuses a call with none of them. */
export type WireKey = "requestedAmount" | "requestedMaturityDate" | "requestedRate" | "requestedTermMonths";

export type CatalogType = "currency" | "percent" | "months" | "date" | "picklist" | "text" | "number" | "record";

/** One link in a create's chain: the record, how it attaches, and what proves
 *  it landed. Ordered — link N cannot be written before link N-1 verifies. */
export interface ChainLink {
  object: string;
  /** The lookup that ties this link to the one before it. */
  via: string;
  label: string;
  /** A fact about this link an implementation must not discover the hard way. */
  note?: string;
}

export interface CatalogField {
  /** Stable id. The parser, the manifest and the tests all address fields by it. */
  id: string;
  /** The nCino object the amendment lands on. */
  object: string;
  /** The field's API name, or null where this org has not established one. */
  apiName: string | null;
  /** What the banker calls it. */
  label: string;
  type: CatalogType;
  category: CatalogCategory;
  /** Which manifest heading the entry files under. */
  group: ManifestGroupId;
  source: CatalogSource;
  /** Present ⇒ THIS FILES. Absent ⇒ manifest and honest handoff only. */
  wireKey?: WireKey;
  /** A RECORD wire: the entry files as a structured record rather than a scalar.
   *  "covenantAdd" rides stage_loan_modification's covenantAddsJson; an
   *  "involvementChange" rides involvementChangesJson (adds authored on the
   *  clone, removes as carry exclusions). Both 2026-08-30. */
  recordWire?: "covenantAdd" | "involvementChange";
  /** Why nothing files it. Required whenever `wireKey` is absent. */
  gap?: string;
  /** What would close the gap. Design only — nothing here is deployed. */
  closes?: string;
  /** Legal values, where the org's own picklist is known. */
  values?: string[];
  /**
   * CONNECTED CREATION, NEVER ORPHANS (founder law, 2026-08-27).
   *
   * A record created without its junction chain is an orphan the deal cannot
   * see. So a creatable entry carries the WHOLE chain it must be created with,
   * in order, and every link is verified by re-query before the next one runs.
   * A create without its junctions must be impossible to stage — which is why
   * this lives on the catalog rather than in a plan builder that could forget.
   */
  chain?: ChainLink[];
  /**
   * WHAT COUNTS AS THE SAME THING ALREADY ON THE DEAL (founder law 1).
   *
   * Association-aware first: before a create is proposed, the room looks for a
   * matching record already attached to the facility. `associationScope` names
   * where to look; a hit turns the proposal into amend-or-add-a-second rather
   * than a silent duplicate.
   */
  associationScope?: "loan-covenants" | "pledges" | "parties" | "fees";
  /** What a banker says for this. Lower case; matched as whole phrases. */
  synonyms: string[];
}

/* --------------------------------------------------------------- the index */

/** THE FOUR THAT FILE. Request key read off the deployed Apex, target field
 *  confirmed on the wire AND in the live describe (`LLC_BI__Loan__c`, 333
 *  fields, 2026-08-27). The org's own labels are in the comments where they
 *  differ from what a banker calls the field. */
const LOAN_TERMS: CatalogField[] = [
  {
    id: "loan.amount",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Amount__c",
    // The org labels it "Original Amount".
    label: "Commitment amount",
    type: "currency",
    category: "loan-terms",
    group: "terms",
    source: "live-verified",
    wireKey: "requestedAmount",
    synonyms: ["commitment", "amount", "facility amount", "limit", "line size", "committed", "increase", "decrease", "raise", "reduce"],
  },
  {
    id: "loan.maturityDate",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Maturity_Date__c",
    label: "Maturity date",
    type: "date",
    category: "loan-terms",
    group: "terms",
    source: "live-verified",
    wireKey: "requestedMaturityDate",
    synonyms: ["maturity", "maturity date", "matures", "mature", "expiry", "expiration", "final maturity"],
  },
  {
    id: "loan.interestRate",
    object: "LLC_BI__Loan__c",
    // THE LESSON, now settled by a describe rather than by a failure: the 333
    // fields on Loan include `LLC_BI__InterestRate__c` (percent, "Interest
    // Rate") and `LLC_BI__Current_Interest_Rate__c` (percent, a different
    // field the read tool uses). `LLC_BI__Interest_Rate__c` is not among them.
    apiName: "LLC_BI__InterestRate__c",
    label: "Interest rate",
    type: "percent",
    category: "loan-terms",
    group: "terms",
    source: "live-verified",
    wireKey: "requestedRate",
    synonyms: ["rate", "interest rate", "pricing", "price", "priced", "reprice", "coupon", "margin", "spread", "all-in rate"],
  },
  {
    id: "loan.termMonths",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Term_Months__c",
    // The org labels it "Loan Term (Months)".
    label: "Term (months)",
    type: "months",
    category: "loan-terms",
    group: "terms",
    source: "live-verified",
    wireKey: "requestedTermMonths",
    synonyms: ["term", "tenor", "term months", "months"],
  },
];

/** The rest of the loan. Real fields, and no tool writes any of them: the
 *  modification pair takes exactly four scalars and `C360WriteGuard` permits one
 *  loan transition (Stage: Qualification to Proposal) and nothing else. */
const NO_LOAN_TOOL =
  "stage_loan_modification carries exactly four changes — amount, maturity date, rate and term. No tool writes any other loan field.";
const LOAN_TOOL_FIX =
  "Add a typed fieldChanges[] block to the modification pair and a per-field clone allowlist to C360WriteGuard, applied in the existing apply_changes step and verified by re-query.";

const LOAN_OTHER: CatalogField[] = [
  {
    id: "loan.currentInterestRate",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Current_Interest_Rate__c",
    label: "Current interest rate",
    type: "percent",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    gap: "This is the rate the org REPORTS, read by Customer360Exposure. A modification moves LLC_BI__InterestRate__c on the clone; this field follows the org's own pricing, and no tool writes it.",
    closes: "Nothing should. Writing a reported rate directly would decouple it from the pricing that produced it.",
    synonyms: ["current rate", "rate today", "reported rate"],
  },
  {
    id: "loan.riskGrade",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Risk_Grade__c",
    label: "Facility risk grade",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    values: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
    gap: NO_LOAN_TOOL + " Facility risk grade is also downstream of the risk-rating review, which is its own credit action.",
    closes: LOAN_TOOL_FIX,
    synonyms: ["risk grade", "facility grade", "grade"],
  },
  {
    id: "loan.product",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Product__c",
    label: "Product",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    // The org's own product set. `parseModify` maps banker nicknames onto these
    // exact values — "the revolver" is a Line of Credit here.
    values: ["Construction", "Equipment", "Line of Credit", "HELOC", "Purchase", "Deposit", "Term"],
    gap: NO_LOAN_TOOL + " Product is set when a facility is created; changing it on a modification has never been staged here.",
    closes: LOAN_TOOL_FIX,
    synonyms: ["product", "product type", "facility type"],
  },
  {
    id: "loan.primaryLoanPurpose",
    object: "LLC_BI__Loan_Detail__c",
    apiName: "LLC_BI__Primary_Loan_Purpose__c",
    label: "Primary loan purpose",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "observed",
    gap: "The Loan Detail is created by an AFTER-COMMIT flow, so no synchronous call can write it in the same transaction; only execute_new_facility reaches it, and only on a resume.",
    closes: "Extend the modification pair with the same two-invocation resume execute_new_facility already uses for the Loan Detail.",
    synonyms: ["purpose", "loan purpose", "use of proceeds"],
  },
  {
    id: "loan.stage",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Stage__c",
    label: "Facility stage",
    type: "picklist",
    category: "loan-other",
    group: "structure",
    source: "live-verified",
    // ELEVEN stages, not four. The clone lands at Qualification and Booked is
    // the far end of the org's own approval run.
    values: ["Qualification", "Proposal", "Credit Underwriting", "Final Review", "Approval / Loan Committee", "Processing", "Doc Prep", "Closing", "Boarding", "Booked", "Complete"],
    gap: "Loan_Validation_06 refuses a manual move to a post-approval stage and carries no permission bypass. The one hop any tool may make is Qualification to Proposal, inside execute_new_facility.",
    closes: "Nothing. Booking is nCino's own Submit for Approval run with real approvers, and that is correct.",
    synonyms: ["stage", "book it", "booked", "move to booked", "advance the stage"],
  },
  {
    id: "loan.status",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Status__c",
    label: "Facility status",
    type: "picklist",
    category: "loan-other",
    group: "structure",
    source: "live-verified",
    values: ["Hold", "Withdrawn", "Open", "Paid Out", "Declined", "Charge-Off", "Lost", "Pre-approval", "Pre-approved", "Pre-qualification", "Pre-qualified"],
    gap: NO_LOAN_TOOL,
    closes: LOAN_TOOL_FIX,
    synonyms: ["status", "close the facility", "pay off"],
  },
  {
    id: "loan.paymentType",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Payment_Type__c",
    label: "Payment type",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    values: ["Installment", "Single Pay", "Balloon", "Draw Down Line Of Credit", "Principal+Interest", "Irregular", "Generic Non-Disclosable", "Construction Permanent", "Revolving Line Of Credit"],
    gap: NO_LOAN_TOOL,
    closes: LOAN_TOOL_FIX,
    synonyms: ["payment type", "payment structure", "interest only", "amortising", "amortizing"],
  },
  {
    id: "loan.accrualMethod",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Interest_Accrual_Method__c",
    label: "Interest accrual method",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    values: ["30_360", "30_365", "Actual_360", "Actual_365", "Actual_Actual", "True360_360", "True360_365", "True360_DaysPerPeriod", "UnitPeriod_365.25", "True360_365.25", "True365_360", "True365_365"],
    gap: NO_LOAN_TOOL,
    closes: LOAN_TOOL_FIX,
    synonyms: ["accrual", "accrual method", "day count", "actual/360", "30/360"],
  },
  {
    id: "loan.amortisedTerm",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Amortized_Term_Months__c",
    label: "Amortisation term (months)",
    type: "months",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    // DISTINCT FROM THE TERM THE TOOL WRITES. `LLC_BI__Term_Months__c` is the
    // facility's own term and is fileable; this is the schedule the payment is
    // struck on, and moving one without the other is a real amendment.
    gap: NO_LOAN_TOOL + " It is also a different field from the term the tool does carry, so an amortisation change cannot ride on requestedTermMonths.",
    closes: LOAN_TOOL_FIX,
    synonyms: ["amortisation", "amortization", "amortisation term", "amortization term", "amort"],
  },
  {
    id: "loan.paymentSchedule",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Payment_Schedule__c",
    label: "Payment schedule",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    values: ["Weekly", "Bi-Monthly", "Monthly", "Quarterly", "Semi-Annual", "Annual", "Single Pay"],
    gap: NO_LOAN_TOOL,
    closes: LOAN_TOOL_FIX,
    synonyms: ["payment schedule", "payment frequency", "pay monthly", "pay quarterly"],
  },
];

const NO_PACKAGE_TOOL =
  "The product package is CREATE-ONLY for every tool we deploy: C360WriteGuard lists it under CREATE_ONLY, so there is no update path to any package field. The fields themselves are writable — it is the tool surface that is missing, not the permission.";
const PACKAGE_FIX =
  "Add a packageFields block to the modification pair (the package is already its anchor) plus an UPDATE_TRANSITIONS entry per field, picklist-validated through C360Picklist.";

const PACKAGE_FIELDS: CatalogField[] = [
  {
    id: "package.riskRating",
    object: "LLC_BI__Product_Package__c",
    apiName: "LLC_BI__Risk_Rating__c",
    label: "Deal risk rating",
    type: "picklist",
    category: "package",
    group: "structure",
    source: "live-verified",
    // 1-10 on the package; the FACILITY grade runs 0-11. Two different scales.
    values: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    gap: NO_PACKAGE_TOOL,
    closes: PACKAGE_FIX,
    synonyms: ["deal rating", "package risk rating", "deal risk rating"],
  },
  {
    id: "package.name",
    object: "LLC_BI__Product_Package__c",
    apiName: "Name",
    label: "Package name",
    type: "text",
    category: "package",
    group: "structure",
    source: "live-verified",
    gap: NO_PACKAGE_TOOL,
    closes: PACKAGE_FIX,
    synonyms: ["package name", "deal name", "rename the package"],
  },
  {
    id: "package.stage",
    object: "LLC_BI__Product_Package__c",
    apiName: "LLC_BI__Stage__c",
    label: "Package stage",
    type: "picklist",
    category: "package",
    group: "structure",
    source: "live-verified",
    // THREE values, and none of them is a loan stage. A package is Pending, In
    // Review or Complete; the facility underneath it has its own eleven.
    values: ["Pending", "In Review", "Complete"],
    gap: "Package stage and status belong to the org's own package automation (PPCacheCreation, ProductPackageBaselineCaptureTrigger). C360WriteGuard forbids both outright.",
    closes: "Nothing here. Moving a deal through its stages is the bank's process, not a field edit.",
    synonyms: ["package stage", "deal stage", "move the deal"],
  },
  {
    id: "package.status",
    object: "LLC_BI__Product_Package__c",
    apiName: "LLC_BI__Status__c",
    label: "Package status",
    type: "picklist",
    category: "package",
    group: "structure",
    source: "live-verified",
    values: ["New", "In Review", "Intermediately Approved", "Approved", "Intermediately Rejected", "Rejected", "Recalled", "Declined", "Open", "Complete", "Hold", "Lost"],
    gap: "Same automation, same fence: C360WriteGuard forbids package status outright.",
    closes: "Nothing here. Approval status is the outcome of the bank's process, not an input to it.",
    synonyms: ["package status", "deal status", "approve the package"],
  },
];

const COVENANT_FIELDS: CatalogField[] = [
  {
    id: "covenant.add",
    object: "LLC_BI__Covenant2__c",
    apiName: null,
    label: "New covenant",
    type: "record",
    category: "covenant",
    group: "covenants",
    source: "live-verified",
    // FILES since 2026-08-30: stage_loan_modification takes covenantAddsJson and the pair creates
    // the covenant Pending/Active on the borrower, attaches the LLC_BI__Loan_Covenant__c junction
    // to the CLONE on the new package version, and verifies both by re-query. Probed safe live: no
    // compliance row is minted and no approval starts, so the unrecallable acnpex approval email
    // (which fires on compliance CREATE only) is structurally out of reach. The read is exact or it
    // is a question: the type must land on a uniquely-named catalog entry and the threshold must be
    // stated; anything looser stays a manifest handoff.
    recordWire: "covenantAdd",
    gap: "A covenant type the room's map cannot settle against the org catalog (60 types, several duplicate names) travels as a handoff rather than a guess.",
    closes: "Nothing structural. The unmapped-type case closes with a picker fed by the live LLC_BI__Covenant_Type__c catalog.",
    associationScope: "loan-covenants",
    chain: [
      { object: "LLC_BI__Covenant2__c", via: "LLC_BI__Account__c", label: "Create the covenant on the relationship", note: "The modern object. Legacy LLC_BI__Covenant__c is empty org-wide and is never written." },
      {
        object: "LLC_BI__Loan_Covenant__c",
        via: "LLC_BI__Covenant2__c + LLC_BI__Loan__c",
        label: "Attach it to the modification clone",
        note: "Every field on this junction is non-updateable, so the attachment is set at insert and can never be edited afterwards.",
      },
    ],
    synonyms: ["add a covenant", "new covenant", "covenant", "add covenant", "impose a covenant"],
  },
  {
    id: "covenant.remove",
    object: "LLC_BI__Loan_Covenant__c",
    apiName: null,
    label: "Drop a covenant from the facility",
    type: "record",
    category: "covenant",
    group: "covenants",
    source: "live-verified",
    // THE DESCRIBE SETTLES THE METHOD. Every field on the junction is
    // non-updateable — Covenant2, Loan and even Active. There is no way to
    // deactivate the link, so detaching a covenant is a DELETE of the row, and
    // C360WriteGuard refuses OP_DELETE on everything.
    gap: "The loan-covenant junction carries no updateable field at all — not even Active — so detaching a covenant means deleting the junction row, and C360WriteGuard refuses OP_DELETE on every object.",
    closes: "A covenants[] block with a detach arm, scoped to junctions on a clone this plan created in the same run, never on a booked parent. Founder-gated, like every other delete.",
    synonyms: ["drop the covenant", "remove the covenant", "detach the covenant", "release the covenant", "take the covenant off"],
  },
  {
    id: "covenant.threshold",
    object: "LLC_BI__Covenant2__c",
    apiName: "LLC_BI__Financial_Indicator_Value__c",
    label: "Covenant threshold",
    type: "number",
    category: "covenant",
    group: "covenants",
    source: "live-verified",
    // The org carries TWO threshold fields: nCino's own, which the read tool
    // uses, and the Accenture overlay's `Acnpex_Threshold_Value__c`. Any
    // extension has to decide which one a banker's "tighten it" moves.
    gap: "The threshold lives on the covenant record, which no tool writes. This org also carries a second threshold field, Acnpex_Threshold_Value__c, on the same object.",
    closes: "The same covenants[] block, update arm, with an explicit decision on which of the two threshold fields an amendment moves.",
    synonyms: ["threshold", "covenant threshold", "floor", "ceiling", "test level", "tighten the covenant", "loosen the covenant"],
  },
  {
    id: "covenant.operator",
    object: "LLC_BI__Covenant2__c",
    apiName: "Acnpex_Operator__c",
    label: "Covenant operator",
    type: "picklist",
    category: "covenant",
    group: "covenants",
    source: "live-verified",
    values: ["<", "<=", "=", ">=", ">"],
    gap: "Same object, same wall: no tool writes the covenant record.",
    closes: "The same covenants[] block.",
    synonyms: ["operator", "at least", "no more than", "actual must be"],
  },
  {
    id: "covenant.frequency",
    object: "LLC_BI__Covenant2__c",
    apiName: "LLC_BI__Frequency__c",
    label: "Test frequency",
    type: "picklist",
    category: "covenant",
    group: "covenants",
    source: "live-verified",
    values: ["Annually", "Semi-Annually", "Quarterly", "Every 2 Months", "Monthly", "One-Off", "Custom"],
    gap: "The frequency lives on the covenant record, which no tool writes. Its effective date drives the whole compliance schedule and is fenced separately.",
    closes: "The same covenants[] block, keeping LLC_BI__Effective_Date__c forbidden (writing it corrupts the schedule — PDI-00023403).",
    synonyms: ["frequency", "test frequency", "quarterly", "monthly", "annually", "how often"],
  },
  {
    id: "covenant.complianceStatus",
    object: "LLC_BI__Covenant_Compliance2__c",
    apiName: "LLC_BI__Status__c",
    label: "Covenant compliance status",
    type: "picklist",
    category: "covenant",
    group: "covenants",
    source: "observed",
    values: ["Compliant", "Waived", "Exception"],
    gap: "This one HAS a tool — execute_covenant_review — and it is a separate, founder-gated credit action: filing a status can make nCino mint the next compliance row, which fires an unrecallable approval email at a named human. A modification never fires it as a side effect.",
    closes: "Nothing to build. It is a different action, taken deliberately.",
    synonyms: ["mark compliant", "waive the covenant", "covenant exception", "assess the covenant", "covenant breach"],
  },
];

const NO_PLEDGE_TOOL =
  "The pledge junction LLC_BI__Loan_Collateral2__c is not on C360WriteGuard's allowlist. stage_collateral_valuation writes a VALUATION against an existing collateral, which is a different fact from pledging one to a facility.";
const PLEDGE_FIX =
  "A pledges[] block on the modification pair, writing the junction against the CLONE. LLC_BI__Advance_Rate__c and the rollup totals are formulas and must be forbidden; LLC_BI__Advance_Rate_Override__c is the writable one.";

const COLLATERAL_FIELDS: CatalogField[] = [
  {
    id: "collateral.pledge",
    object: "LLC_BI__Loan_Collateral2__c",
    apiName: null,
    label: "Collateral pledge",
    type: "record",
    category: "collateral",
    group: "security",
    source: "live-verified",
    gap: NO_PLEDGE_TOOL,
    closes: PLEDGE_FIX,
    associationScope: "pledges",
    chain: [
      { object: "LLC_BI__Collateral__c", via: "LLC_BI__Account__c", label: "Create the asset, or resolve the one the borrower already owns" },
      { object: "LLC_BI__Account_Collateral__c", via: "LLC_BI__Collateral__c + Account", label: "Record who owns it and on what authority" },
      {
        object: "LLC_BI__Loan_Collateral2__c",
        via: "LLC_BI__Collateral__c + LLC_BI__Loan__c",
        label: "Pledge it to the modification clone",
        note: "MASTER-DETAIL THROUGH THE AGGREGATE: LLC_BI__Loan_Collateral_Aggregate__c is non-updateable on the pledge, so it is set at insert and the aggregate has to exist first. This is the known defect area for a clone (Loan_Collateral_Aggregate), so the step is verified by re-query and never a casual insert.",
      },
    ],
    synonyms: ["pledge", "pledge the", "add collateral", "secure it with", "take security over"],
  },
  {
    id: "collateral.release",
    object: "LLC_BI__Loan_Collateral2__c",
    apiName: "LLC_BI__Active__c",
    label: "Release a pledge",
    type: "picklist",
    category: "collateral",
    group: "security",
    source: "live-verified",
    // BETTER NEWS THAN THE COVENANT JUNCTION: this one carries writable Active,
    // Pledged_Status and End_Date, so a release is an UPDATE rather than a
    // delete — the difference between a fixable extension and a founder gate.
    gap: NO_PLEDGE_TOOL + " Unlike the covenant junction, a release here would be an update (Active, Pledged Status, End Date are all writable) rather than a delete — so this gap needs a tool, not a deletion policy.",
    closes: "A pledges[] block with a release arm setting Active false, Pledged Status Inactive and an End Date on the clone's own junction.",
    synonyms: ["release the collateral", "release the lien", "release the pledge", "unpledge", "drop the collateral"],
  },
  {
    id: "collateral.advanceRate",
    object: "LLC_BI__Loan_Collateral2__c",
    apiName: "LLC_BI__Advance_Rate_Override__c",
    label: "Advance rate",
    type: "percent",
    category: "collateral",
    group: "security",
    source: "live-verified",
    // `LLC_BI__Advance_Rate__c` is NOT updateable on this org; the override is.
    gap: NO_PLEDGE_TOOL + " Note the field: LLC_BI__Advance_Rate__c is read-only here and LLC_BI__Advance_Rate_Override__c is the one an amendment moves.",
    closes: PLEDGE_FIX,
    synonyms: ["advance rate", "advance", "lending value percent", "borrowing base rate"],
  },
  {
    id: "collateral.lienPosition",
    object: "LLC_BI__Loan_Collateral2__c",
    apiName: "LLC_BI__Lien_Position__c",
    label: "Lien position",
    type: "picklist",
    category: "collateral",
    group: "security",
    source: "live-verified",
    values: ["1st", "2nd", "3rd", "Other"],
    gap: NO_PLEDGE_TOOL,
    closes: PLEDGE_FIX,
    synonyms: ["lien", "lien position", "first lien", "second lien", "priority"],
  },
  {
    id: "collateral.amountPledged",
    object: "LLC_BI__Loan_Collateral2__c",
    apiName: "LLC_BI__Amount_Pledged__c",
    label: "Amount pledged",
    type: "currency",
    category: "collateral",
    group: "security",
    source: "live-verified",
    gap: NO_PLEDGE_TOOL,
    closes: PLEDGE_FIX,
    synonyms: ["amount pledged", "pledge amount", "pledged value"],
  },
  {
    id: "collateral.valuation",
    object: "LLC_BI__Collateral_Valuation__c",
    apiName: "LLC_BI__Value__c",
    label: "Collateral valuation",
    type: "currency",
    category: "collateral",
    group: "security",
    source: "observed",
    gap: "This one HAS a tool — stage/execute_collateral_valuation, package-anchored, items[] only, valuationDate required per item. It is its own credit action and is not folded into a modification plan.",
    closes: "Nothing to build. It is a different action.",
    synonyms: ["revalue", "valuation", "appraisal", "new appraisal", "reappraise"],
  },
];

/** BORROWING STRUCTURE (W1: "must support add/REMOVE borrowers"; founder
 *  directive 2026-08-27: legal-entity specifics are first-class, and the
 *  suggestions come from the relationship household). The object is on the
 *  guard's allowlist, which makes this the closest gap to closing — and it is
 *  still a gap, because the only path to it is bound to a loan that
 *  execute_new_facility just created. */
const PARTY_NO_TOOL =
  "An involvement change files when the line names the MEMBER and (for an add) the ROLE. This one did not, so it travels as a handoff rather than a guess about where the structure lands.";
const PARTY_FIX =
  "Name the member and the role: \"add Hartwell Logistics LLC as a guarantor on the Line of Credit\" files; adds are authored on the clone, removes are carry exclusions the parent never feels.";

const PARTY_FIELDS: CatalogField[] = [
  {
    id: "party.add",
    object: "LLC_BI__Legal_Entities__c",
    apiName: null,
    label: "Add a legal entity",
    type: "record",
    category: "party",
    group: "structure",
    source: "live-verified",
    // FILES since 2026-08-30 when the line names the member and the role:
    // involvementChangesJson authors the row on the CLONE with the new package
    // anchor, under the guard's widened five-role birth state.
    recordWire: "involvementChange",
    gap: PARTY_NO_TOOL,
    closes: PARTY_FIX,
    associationScope: "parties",
    chain: [
      {
        object: "LLC_BI__Legal_Entities__c",
        via: "LLC_BI__Account__c + LLC_BI__Loan__c",
        label: "Create the involvement row against the clone",
        note: "LLC_BI__Product_Package__c is set too: every real involvement row in this org carries it, and the org's own Create Involvement Tool flow does not.",
      },
    ],
    // Directional phrases, not bare nouns: "who is the guarantor" is a question
    // about the deal, not an instruction to put somebody on it.
    synonyms: [
      "add a borrower", "add borrower", "add a guarantor", "add guarantor",
      "as a guarantor", "as guarantor", "as a borrower", "as borrower",
      "as a co-borrower", "as co-borrower", "as a related entity", "as related entity",
      "as a limited guarantor", "as limited guarantor", "add a limited guarantor",
      "bring in", "add the entity", "add a co-borrower",
    ],
  },
  {
    id: "party.remove",
    object: "LLC_BI__Legal_Entities__c",
    apiName: null,
    label: "Remove a legal entity",
    type: "record",
    category: "party",
    group: "structure",
    source: "live-verified",
    // FILES since 2026-08-30 when the line names the member: the remove is a
    // CARRY EXCLUSION — the named row simply never travels to the new package
    // version. The booked parent keeps every row it has today; nothing is
    // deleted anywhere, which is what dissolved the old delete-allowlist risk.
    recordWire: "involvementChange",
    gap: "A removal files when the line names the member it comes off; without the member it travels as a handoff.",
    closes: "Name the member: \"remove Hartwell Logistics LLC from the Line of Credit\" files as a carry exclusion.",
    synonyms: ["remove the borrower", "remove borrower", "remove the guarantor", "remove guarantor", "release the guarantor", "drop the guarantor", "take off", "release from the guaranty"],
  },
  {
    id: "party.borrowerType",
    object: "LLC_BI__Legal_Entities__c",
    apiName: "LLC_BI__Borrower_Type__c",
    label: "Involvement role",
    type: "picklist",
    category: "party",
    group: "structure",
    source: "live-verified",
    // SEVEN roles, not four: the describe adds Co-Borrower, Grantor, Contractor.
    values: ["Borrower", "Guarantor", "Limited Guarantor", "Co-Borrower", "Related Entity", "Grantor", "Contractor"],
    gap: PARTY_NO_TOOL + " The guard also pins a create to Borrower, so the other six roles are unreachable even inside that path.",
    closes: PARTY_FIX,
    synonyms: ["role", "borrower type", "make them a guarantor", "change the role"],
  },
  {
    id: "party.entityType",
    object: "LLC_BI__Legal_Entities__c",
    apiName: "LLC_BI__Entity_Type__c",
    label: "Entity type",
    type: "picklist",
    category: "party",
    group: "structure",
    source: "live-verified",
    // The org has no Holding Company value; Hartwell Holdings carries EPC.
    values: ["Operating Company", "Sole Proprietorship", "EPC", "Individual"],
    gap: PARTY_NO_TOOL,
    closes: PARTY_FIX,
    synonyms: ["entity type", "operating company", "holding company", "epc"],
  },
  {
    id: "party.ownership",
    object: "LLC_BI__Legal_Entities__c",
    apiName: "LLC_BI__Ownership__c",
    label: "Contingent percentage",
    type: "percent",
    category: "party",
    group: "structure",
    source: "live-verified",
    // NAME AND LABEL DISAGREE, and the label is the org's. The field is called
    // Ownership and is labelled "Contingent Percentage"; the read tool maps it
    // to ownershipPercent. Anything writing it should say which it means.
    gap: PARTY_NO_TOOL + " The field's name and its label also disagree on this org — LLC_BI__Ownership__c is labelled Contingent Percentage — so an extension must state which of the two an amendment means.",
    closes: PARTY_FIX + " Ownership and Contingent Amount are mutually exclusive on one row, and the validation rule's only escape tests for a Household role this org does not carry.",
    synonyms: ["ownership", "ownership percent", "owns", "percent owned", "contingent percentage"],
  },
  {
    id: "party.guarantyType",
    object: "LLC_BI__Legal_Entities__c",
    apiName: "LLC_BI__Guaranty_Amount__c",
    label: "Guarantee type",
    type: "picklist",
    category: "party",
    group: "structure",
    source: "live-verified",
    values: ["Unlimited", "Amount of Note", "Limited"],
    gap: PARTY_NO_TOOL,
    closes: PARTY_FIX,
    synonyms: ["guaranty", "guarantee", "unlimited guaranty", "limited guaranty"],
  },
  {
    id: "party.guaranteeLimit",
    object: "LLC_BI__Legal_Entities__c",
    apiName: "LLC_BI__Guarantee_Limit__c",
    label: "Limited guarantee amount",
    type: "currency",
    category: "party",
    group: "structure",
    source: "live-verified",
    gap: PARTY_NO_TOOL,
    closes: PARTY_FIX,
    synonyms: ["guaranty limit", "guarantee limit", "cap the guaranty", "cap the guarantee", "limited to"],
  },
];

/** PRICING (founder directive 2026-08-27: the roll-over carries pricing).
 *  A facility's rate and payment terms live on `LLC_BI__Pricing_Stream__c` and
 *  its two component children, and a modification rolls them onto the clone.
 *  NO READ TOOL COVERS THEM: the cockpit's six detail reads do not fetch a
 *  pricing stream, so the room can name the concept but cannot show today's
 *  value until a read exists. */
const NO_PRICING_TOOL =
  "Pricing lives on LLC_BI__Pricing_Stream__c and its rate and payment components. None of the three is on C360WriteGuard's allowlist, and no read tool fetches them either, so the room can neither show today's stream nor amend it.";
const PRICING_FIX =
  "Two pieces. A read: extend Customer360Exposure with the facility's streams and components so the roll-over baseline can be shown. A write: a pricing[] block on the modification pair cloning the parent's streams onto the clone and applying the amendment, with the formula fields (All_In_Rate, Calculated_Monthly_Interest_Rate) forbidden.";

const PRICING_FIELDS: CatalogField[] = [
  {
    id: "pricing.stream",
    object: "LLC_BI__Pricing_Stream__c",
    apiName: null,
    label: "Pricing stream",
    type: "record",
    category: "pricing",
    group: "terms",
    source: "live-verified",
    values: ["Adjustable", "Draw", "Fixed", "Introductory", "Repayment"],
    gap: NO_PRICING_TOOL,
    closes: PRICING_FIX,
    chain: [
      { object: "LLC_BI__Pricing_Stream__c", via: "LLC_BI__Loan__c", label: "Create the stream on the modification clone" },
      { object: "LLC_BI__Pricing_Rate_Component__c", via: "LLC_BI__Pricing_Stream__c", label: "Create the rate component", note: "All_In_Rate and Calculated_Monthly_Interest_Rate are formulas and are never written." },
      { object: "LLC_BI__Pricing_Payment_Component__c", via: "LLC_BI__Pricing_Stream__c", label: "Create the payment component" },
    ],
    synonyms: ["pricing stream", "rate stream", "payment stream", "pricing structure"],
  },
  {
    id: "pricing.rate",
    object: "LLC_BI__Pricing_Rate_Component__c",
    apiName: "LLC_BI__Rate__c",
    label: "Stream rate",
    type: "percent",
    category: "pricing",
    group: "terms",
    source: "live-verified",
    gap: NO_PRICING_TOOL + " The facility's own LLC_BI__InterestRate__c IS fileable, and moving it does not move the stream underneath it.",
    closes: PRICING_FIX,
    synonyms: ["stream rate", "applied rate", "all-in rate"],
  },
  {
    id: "pricing.spread",
    object: "LLC_BI__Pricing_Rate_Component__c",
    apiName: "LLC_BI__Spread__c",
    label: "Index spread",
    type: "percent",
    category: "pricing",
    group: "terms",
    source: "live-verified",
    gap: NO_PRICING_TOOL + " This is where a SOFR+300 ask actually lands: the spread is a component field, not the facility's absolute rate.",
    closes: PRICING_FIX,
    synonyms: ["spread over", "index spread", "sofr plus", "over sofr", "over libor", "over prime"],
  },
  {
    id: "pricing.index",
    object: "LLC_BI__Pricing_Rate_Component__c",
    apiName: "LLC_BI__Index__c",
    label: "Rate index",
    type: "picklist",
    category: "pricing",
    group: "terms",
    source: "live-verified",
    gap: NO_PRICING_TOOL,
    closes: PRICING_FIX,
    synonyms: ["index", "reference rate", "benchmark"],
  },
  {
    id: "pricing.rateFloor",
    object: "LLC_BI__Pricing_Rate_Component__c",
    apiName: "LLC_BI__Rate_Floor__c",
    label: "Rate floor",
    type: "percent",
    category: "pricing",
    group: "terms",
    source: "live-verified",
    gap: NO_PRICING_TOOL,
    closes: PRICING_FIX,
    synonyms: ["rate floor", "floor rate", "rate ceiling", "cap the rate"],
  },
  {
    id: "pricing.paymentType",
    object: "LLC_BI__Pricing_Payment_Component__c",
    apiName: "LLC_BI__Payment_Type__c",
    label: "Stream payment type",
    type: "picklist",
    category: "pricing",
    group: "terms",
    source: "live-verified",
    values: ["Principal & Interest", "Principal + Interest", "Interest Only"],
    gap: NO_PRICING_TOOL,
    closes: PRICING_FIX,
    synonyms: ["interest only period", "principal and interest", "payment component"],
  },
];

/** FEES (founder directive 2026-08-27: "we need to include fees etc. whenever we
 *  ask that"). Two facts, and both belong in the handoff copy: no tool writes a
 *  fee, AND this org holds none — LLC_BI__Fee__c and LLC_BI__Fee_Loan_Aggregate__c
 *  are both 0 rows, re-counted live on 2026-08-27, with the inline loan fee
 *  fields null on every loan sampled. The object and its fields are now
 *  live-verified; what is empty is the DATA. */
const FEE_NO_TOOL =
  "No tool writes a fee. This org also holds none: LLC_BI__Fee__c and LLC_BI__Fee_Loan_Aggregate__c are both empty (re-counted live 2026-08-27), so a fee amendment on this deal is an ADD rather than a change.";
const FEE_FIX =
  "A fees[] block on the modification pair creating LLC_BI__Fee__c rows against the CLONE. The describe settles the shape: LLC_BI__Loan__c on a fee is NOT updateable, so a fee row is bound to its loan at creation and the roll-over has to re-create rather than re-point.";

const FEE_FIELDS: CatalogField[] = [
  {
    id: "fee.row",
    object: "LLC_BI__Fee__c",
    apiName: null,
    label: "Facility fee",
    type: "record",
    category: "fee",
    group: "terms",
    source: "live-verified",
    gap: FEE_NO_TOOL,
    closes: FEE_FIX,
    associationScope: "fees",
    chain: [
      {
        object: "LLC_BI__Fee_Loan_Aggregate__c",
        via: "LLC_BI__Loan__c",
        label: "Resolve or create the loan's fee aggregate",
        note: "The aggregate carries the totals the loan reads back; a fee row without one leaves LLC_BI__Total_Fee_Income__c unmoved.",
      },
      {
        object: "LLC_BI__Fee__c",
        via: "LLC_BI__Loan__c + LLC_BI__Fee_Loan_Aggregate__c",
        label: "Create the fee row against the clone",
        note: "LLC_BI__Loan__c on a fee is NOT updateable, so the row is bound to its loan at insert: a roll-over re-creates the parent's fees on the clone rather than re-pointing them.",
      },
    ],
    synonyms: ["fee", "fees", "add a fee", "charge a fee", "waive the fee", "arrangement fee", "commitment fee", "facility fee", "upfront fee", "origination fee", "unused fee", "amendment fee"],
  },
  {
    id: "fee.amount",
    object: "LLC_BI__Fee__c",
    apiName: "LLC_BI__Amount__c",
    label: "Fee amount",
    type: "currency",
    category: "fee",
    group: "terms",
    source: "live-verified",
    gap: FEE_NO_TOOL,
    closes: FEE_FIX,
    synonyms: ["fee amount", "fee of"],
  },
  {
    id: "fee.type",
    object: "LLC_BI__Fee__c",
    apiName: "LLC_BI__Fee_Type__c",
    label: "Fee type",
    type: "picklist",
    category: "fee",
    group: "terms",
    source: "live-verified",
    // The picklist this org actually carries is a CLOSING-COST set (Appraisal,
    // Attorney, Credit Report, taxes). There is no "arrangement fee" or
    // "commitment fee" value in it, which is a real finding: a commercial
    // amendment fee has nowhere to go on this org's fee model as configured.
    values: ["Appraisal", "Attorney", "City Property Taxes", "Condo Association Dues", "Cost to Cure", "County Property Taxes", "Credit Report", "DMV", "Flood Insurance"],
    gap: FEE_NO_TOOL + " The fee-type picklist on this org is a closing-cost set — Appraisal, Attorney, Credit Report, taxes — with no commercial arrangement or commitment fee value, so a C&I fee has nowhere to file even once a tool exists.",
    closes: FEE_FIX + " It also needs a picklist decision: add the commercial fee types, or model a C&I fee somewhere other than this object.",
    synonyms: ["fee type", "kind of fee"],
  },
  {
    id: "fee.calculation",
    object: "LLC_BI__Fee__c",
    apiName: "LLC_BI__Calculation_Type__c",
    label: "Fee calculation",
    type: "picklist",
    category: "fee",
    group: "terms",
    source: "live-verified",
    values: ["Flat Amount", "Percentage"],
    gap: FEE_NO_TOOL,
    closes: FEE_FIX,
    synonyms: ["flat fee", "percentage fee", "basis points fee", "bps fee"],
  },
  {
    id: "fee.aggregate",
    object: "LLC_BI__Fee_Loan_Aggregate__c",
    apiName: "LLC_BI__Total_Fee_Amount__c",
    label: "Total fees",
    type: "currency",
    category: "fee",
    group: "terms",
    source: "live-verified",
    gap: FEE_NO_TOOL,
    closes: FEE_FIX,
    synonyms: ["total fees", "fee aggregate"],
  },
];

const EXCEPTION_FIELDS: CatalogField[] = [
  {
    id: "exception.record",
    object: "LLC_BI__Policy_Exception__c",
    apiName: null,
    label: "Policy exception",
    type: "record",
    category: "exception",
    group: "covenants",
    source: "live-verified",
    gap: "LLC_BI__Policy_Exception__c is not on C360WriteGuard's allowlist and has no tool. Hartwell carries one today (Major / Mitigated on the construction facility), read-only.",
    closes: "An exceptions[] block on the modification pair, with a new guard object and create state. The describe settles the anchors: LLC_BI__Loan__c for the facility, LLC_BI__Covenant_Mgmt__c for the covenant it arises from, LLC_BI__Relationship__c for the account.",
    chain: [
      {
        object: "LLC_BI__Policy_Exception__c",
        via: "LLC_BI__Loan__c + LLC_BI__Relationship__c",
        label: "Create the exception against the clone and the relationship",
        note: "Where the exception arises from a covenant, LLC_BI__Covenant_Mgmt__c ties it to that covenant and is set in the same insert.",
      },
    ],
    synonyms: ["policy exception", "exception", "raise an exception", "grant an exception", "out of policy"],
  },
  {
    id: "exception.status",
    object: "LLC_BI__Policy_Exception__c",
    apiName: "LLC_BI__Status__c",
    label: "Exception status",
    type: "picklist",
    category: "exception",
    group: "covenants",
    source: "live-verified",
    values: ["Waived", "Mitigated", "Unmitigated"],
    gap: "Same object, same wall.",
    closes: "The same exceptions[] block.",
    synonyms: ["mitigated", "unmitigated", "waive the exception"],
  },
  {
    id: "exception.mitigation",
    object: "LLC_BI__Policy_Exception__c",
    apiName: "LLC_BI__Mitigation_Reason_1__c",
    label: "Mitigation reason",
    type: "text",
    category: "exception",
    group: "covenants",
    source: "live-verified",
    gap: "Same object, same wall. Probe-verified detail: the three mitigation reason fields are 100 characters each.",
    closes: "The same exceptions[] block.",
    synonyms: ["mitigation", "mitigant", "mitigating factor"],
  },
];

/** THE CATALOG. Order matters only for reporting; lookup is by index below. */
export const FIELD_CATALOG: CatalogField[] = [
  ...LOAN_TERMS,
  ...LOAN_OTHER,
  ...PACKAGE_FIELDS,
  ...COVENANT_FIELDS,
  ...COLLATERAL_FIELDS,
  ...PARTY_FIELDS,
  ...PRICING_FIELDS,
  ...FEE_FIELDS,
  ...EXCEPTION_FIELDS,
];

/* ------------------------------------------------------------------ lookup */

const BY_ID = new Map(FIELD_CATALOG.map((f) => [f.id, f]));

export function catalogField(id: string): CatalogField | undefined {
  return BY_ID.get(id);
}

/** The fields a plan can actually send, in wire order. */
export const FILEABLE_FIELDS: CatalogField[] = FIELD_CATALOG.filter((f) => f.wireKey);

export function isFileable(field: CatalogField): boolean {
  return field.wireKey !== undefined || field.recordWire !== undefined;
}

/** Everything a create must write, in order. Empty for a field amendment. */
export function chainFor(field: CatalogField): ChainLink[] {
  return field.chain ?? [];
}

/**
 * Every catalog match in a line, LONGEST SYNONYM FIRST.
 *
 * Longest-first is the whole correctness of the index: "current rate" contains
 * "rate", "commitment fee" contains both "commitment" and "fee", and "maturity
 * date" contains "maturity". Matching the shorter phrase first would file an
 * amount change for a fee waiver, which is precisely the class of mistake this
 * catalog exists to make impossible.
 *
 * A synonym matches on WORD BOUNDARIES, so "rate" does not fire inside
 * "corporate" and "term" does not fire inside "determine".
 */
export interface CatalogMatch {
  field: CatalogField;
  /** The synonym that matched, so a reply can quote the banker's own word. */
  matched: string;
  /** Where in the line it matched, so a value can be read from beside it. */
  index: number;
}

const INDEXED: Array<{ field: CatalogField; synonym: string }> = FIELD_CATALOG.flatMap((field) =>
  field.synonyms.map((synonym) => ({ field, synonym })),
).sort((a, b) => b.synonym.length - a.synonym.length);

function wordBoundedIndex(haystack: string, needle: string): number {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;
    const before = at === 0 ? " " : haystack[at - 1];
    const after = at + needle.length >= haystack.length ? " " : haystack[at + needle.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return at;
    from = at + 1;
  }
}

export function matchCatalog(text: string): CatalogMatch[] {
  const lower = text.toLowerCase();
  const claimed: Array<[number, number]> = [];
  const out: CatalogMatch[] = [];

  for (const { field, synonym } of INDEXED) {
    const at = wordBoundedIndex(lower, synonym);
    if (at === -1) continue;
    const span: [number, number] = [at, at + synonym.length];
    // A longer phrase that already claimed this span wins: the shorter synonym
    // inside it is the same words being read twice.
    if (claimed.some(([s, e]) => at < e && span[1] > s)) continue;
    if (out.some((m) => m.field.id === field.id)) continue;
    claimed.push(span);
    out.push({ field, matched: synonym, index: at });
  }

  return out.sort((a, b) => a.index - b.index);
}

/** What the catalog covers, for the room's own account of itself. */
export function catalogSummary(): {
  total: number;
  fileable: number;
  byCategory: Array<{ category: CatalogCategory; total: number; fileable: number }>;
  bySource: Array<{ source: CatalogSource; total: number }>;
} {
  const categories = [...new Set(FIELD_CATALOG.map((f) => f.category))];
  const sources: CatalogSource[] = ["live-verified", "observed", "schema-known", "to-verify-live"];
  return {
    total: FIELD_CATALOG.length,
    fileable: FILEABLE_FIELDS.length,
    byCategory: categories.map((category) => {
      const on = FIELD_CATALOG.filter((f) => f.category === category);
      return { category, total: on.length, fileable: on.filter(isFileable).length };
    }),
    bySource: sources.map((source) => ({ source, total: FIELD_CATALOG.filter((f) => f.source === source).length })),
  };
}
