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
   *  clone, removes as carry exclusions). Both 2026-08-30. "feeAdd" rides
   *  feeAddsJson and authors LLC_BI__Fee__c on the clone (2026-08-31). */
  recordWire?: "covenantAdd" | "involvementChange" | "feeAdd";
  /** A DYNAMIC FIELD wire: the entry files through `stage_loan_modification`'s
   *  `fieldChangesJson` under this API name, and the ORG resolves it against its
   *  own live describe at stage time — updateable, non-formula, off the
   *  deny-list — coercing by type and validating a picklist against its active
   *  values. The name below is what the room SENDS; the describe is what decides
   *  (2026-08-31). */
  dynamicField?: string;
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
    // "spread" and "margin" moved to `loan.spread` with the field wave: the org
    // holds LLC_BI__Spread__c and this field is the ALL-IN rate. Reading a margin
    // as an absolute rate is the mistake `readValue` already refuses out loud for
    // "SOFR+300", and it had two words here that would have walked straight past
    // that refusal.
    synonyms: ["rate", "interest rate", "pricing", "price", "priced", "reprice", "coupon", "all-in rate"],
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

/** The rest of the loan. Real fields the FIELD WAVE deliberately left out: it is
 *  a CURATED list, not everything the describe would accept, because a field a
 *  banker has no settled phrasing for is a field the room would be guessing at.
 *  `C360WriteGuard` still permits exactly one loan transition (Stage:
 *  Qualification to Proposal) and nothing else. */
const NO_LOAN_TOOL =
  "The field wave carries loan fields through fieldChangesJson, resolved against the org's live describe at stage time. This one is not in the curated set the room will send.";
const LOAN_TOOL_FIX =
  "Add it to the wave's curated list once the describe, the deny-list and a banker's phrasing for it are all settled.";

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
    gap: NO_LOAN_TOOL + " Status sits on the server's own deny-list beside stage: the org refuses it whatever a client sends.",
    closes: "Nothing. Where a facility stands is the output of nCino's approval run, not an input a room can type.",
    synonyms: ["status", "close the facility", "pay off"],
  },
];

/* ------------------------------------------------------------ the field wave

   THE SECOND KIND OF FILING (2026-08-31). The four scalars ride their own
   request keys; everything here rides `fieldChangesJson`, and the difference
   that matters is WHO RESOLVES THE NAME. The room sends an API name and a typed
   value; the ORG reads its own live describe and takes the field only if it is
   updateable, non-formula and off the deny-list, coercing by type and refusing
   an illegal picklist value with the legal list. A wrong name is therefore a
   refusal the banker can read, not a plan that dereferences to nothing on
   execution — which is the Interest_Rate lesson, closed from the other side.

   THE LIST IS CURATED, AND THAT IS THE SAFETY. The describe would accept far
   more than these nine. What earns a place is a field a banker actually says in
   a modification conversation, whose values this file can quote from the org's
   own answer (`knowledge/sf-build-v2/field-inventory-20260831.json`, the live
   describe of 2026-08-31: 267 fields on Loan).

   NO BOOLEAN IN THIS WAVE, deliberately. A prepayment-penalty flag reads as
   "add a prepayment penalty" and the parse model has no honest way to tell a
   banker asking to SET one from a banker asking what one IS — a yes/no with no
   value in the line looks identical to a question. Booleans wait for a wave
   that gives them their own reader.                                          */

const FIELD_WAVE: CatalogField[] = [
  {
    id: "loan.paymentSchedule",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Payment_Schedule__c",
    label: "Payment schedule",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    dynamicField: "LLC_BI__Payment_Schedule__c",
    values: ["Weekly", "Bi-Monthly", "Monthly", "Quarterly", "Semi-Annual", "Annual", "Single Pay"],
    gap: "The line named the schedule but no value the org's picklist carries, so there is nothing to write.",
    closes: "Say one of the org's own values and it files on the clone.",
    synonyms: ["payment schedule", "payment frequency", "pay monthly", "pay quarterly", "monthly payments", "quarterly payments"],
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
    dynamicField: "LLC_BI__Payment_Type__c",
    values: ["Installment", "Single Pay", "Balloon", "Draw Down Line Of Credit", "Principal+Interest", "Irregular", "Generic Non-Disclosable", "Construction Permanent", "Revolving Line Of Credit"],
    gap: "The line named the payment type but no value the org's picklist carries, so there is nothing to write.",
    closes: "Say one of the org's own values and it files on the clone.",
    // "interest only" moved to the interest-only PERIOD below: a banker saying
    // it means a number of months, not a payment-type value the org holds.
    synonyms: ["payment type", "payment structure", "balloon", "single pay"],
  },
  {
    id: "loan.interestOnlyMonths",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Interest_Only_Months__c",
    // The org labels it "Interest Only Months" and types it a double.
    label: "Interest-only period (months)",
    type: "months",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    dynamicField: "LLC_BI__Interest_Only_Months__c",
    gap: "An interest-only period is a length, and the line states none.",
    closes: "Say it in months or years and it files on the clone.",
    // "interest only period" came from `pricing.paymentType`, which is a payment
    // STREAM component on another object and holds no period at all. Longest
    // phrase wins the match, so leaving it there pointed the most natural
    // phrasing a banker uses at a handoff while the fileable field sat beside it.
    synonyms: ["interest only", "interest-only", "interest only period", "io period"],
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
    dynamicField: "LLC_BI__Amortized_Term_Months__c",
    // DISTINCT FROM THE TERM THE TOOL WRITES. `LLC_BI__Term_Months__c` is the
    // facility's own term and rides requestedTermMonths; this is the schedule
    // the payment is struck on, and moving one without the other is a real
    // amendment. Two fields, two entries, and neither borrows the other's wire.
    gap: "An amortisation is a length, and the line states none.",
    closes: "Say it in months or years and it files on the clone.",
    // "amortising" and "amortizing" came from `loan.paymentType`, where they
    // named a payment-type value this org's picklist does not hold. Both
    // participles are kept, because a word a banker already said has to keep
    // landing somewhere.
    synonyms: ["amortisation", "amortization", "amortise", "amortize", "amortising", "amortizing", "amortisation term", "amortization term", "amortised term", "amortized term", "amortise over", "amortize over", "amort"],
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
    dynamicField: "LLC_BI__Interest_Accrual_Method__c",
    // THIRTY-FOUR VALUES, all of them, from the describe. The earlier catalog
    // carried the first twelve, which reads as the whole picklist and is not:
    // a banker asking for a Simple variant would have been told it is illegal.
    // The org spells them with underscores, so "30/360" is the banker's word
    // and `30_360` is the value that travels.
    values: ["30_360", "30_365", "Actual_360", "Actual_365", "Actual_Actual", "True360_360", "True360_365", "True360_DaysPerPeriod", "UnitPeriod_365.25", "True360_365.25", "True365_360", "True365_365", "Midnight_366", "Actual_365.25", "UnitPeriod_DaysPerPeriod", "UnitPeriod_360_Simple", "UnitPeriod_365_Simple", "UnitPeriod_DaysPerPeriod_Simple", "UnitPeriod_True360_360_Simple", "UnitPeriod_True360_365_Simple", "UnitPeriod_True360_DaysPerPeriod_Simple", "UnitPeriod_FederalCalendar_Simple", "UnitPeriod_365.25_Simple", "UnitPeriod_True360_365.25_Simple", "True365_360_Simple", "Actual_365_Simple", "True365_365_Simple", "Actual_Actual_Simple", "Midnight_366_Simple", "Actual_365.25_Simple", "UnitPeriod_VARDPY_Simple", "UnitPeriod_True360_DaysPerPeriod", "UnitPeriod_FederalCalendar", "UnitPeriod_VARDPY"],
    gap: "The line named the accrual method but no value the org's picklist carries, so there is nothing to write.",
    closes: "Say one of the org's own values and it files on the clone.",
    synonyms: ["accrual", "accrual method", "day count", "actual/360", "30/360"],
  },
  {
    id: "loan.index",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Index__c",
    label: "Index",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    dynamicField: "LLC_BI__Index__c",
    // SOFR IS NOT IN THIS ORG'S PICKLIST. The last value is a URL-encoded
    // duplicate of the "- 1 Year +" row and it is quoted exactly as the describe
    // returned it: the org validates against its own values, so a tidied-up copy
    // here would be a value the org refuses.
    values: ["ARM", "Fixed", "LIBOR", "Treasury Constant Maturity - 1 Year +", "Treasury Constant Maturity - 2 Year +", "Treasury Constant Maturity - 3 Year +", "Treasury Constant Maturity - 5 Year +", "Treasury Constant Maturity - 7 Year +", "Treasury Constant Maturity - 10 Year +", "WSJ Prime", "Treasury Constant Maturity - 1 Year %2B"],
    gap: "The line named the index but no value the org's picklist carries, so there is nothing to write.",
    closes: "Say one of the org's own values and it files on the clone.",
    synonyms: ["index", "rate index"],
  },
  {
    id: "loan.spread",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__Spread__c",
    // The org labels it "Spread (%)".
    label: "Spread",
    type: "percent",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    dynamicField: "LLC_BI__Spread__c",
    // THE SPREAD IS NOT THE RATE, and the room now has both. `loan.interestRate`
    // writes the ALL-IN rate through requestedRate and refuses spread language
    // outright; this writes the margin over the index. The two words moved here
    // from that entry's synonyms, because sending a margin as an absolute rate
    // is exactly the mistake its own refusal was written to prevent.
    gap: "A spread is a percentage, and the line states none.",
    closes: "Say it as a percentage or in basis points and it files on the clone.",
    synonyms: ["spread", "margin", "margin over index"],
  },
  {
    id: "loan.firstPaymentDate",
    object: "LLC_BI__Loan__c",
    apiName: "LLC_BI__First_Payment_Date__c",
    label: "First payment date",
    type: "date",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    dynamicField: "LLC_BI__First_Payment_Date__c",
    gap: "A first payment date is a day, and the line states none.",
    closes: "Say the date and it files on the clone.",
    synonyms: ["first payment date", "first payment"],
  },
  {
    id: "loan.primarySourceOfRepayment",
    object: "LLC_BI__Loan__c",
    // NOT an LLC_BI__ field: this one is the bank's own, and the describe is the
    // only reason we know it exists on Loan at all.
    apiName: "Primary_Source_of_Repayment__c",
    label: "Primary source of repayment",
    type: "picklist",
    category: "loan-other",
    group: "terms",
    source: "live-verified",
    dynamicField: "Primary_Source_of_Repayment__c",
    values: ["Cash flow from Operations", "Lease Income", "Liquidation of Collateral", "Receivables", "Reliance on Guarantors", "Working Capital Turnover"],
    gap: "The line named the source of repayment but no value the org's picklist carries, so there is nothing to write.",
    closes: "Say one of the org's own values and it files on the clone.",
    synonyms: ["source of repayment", "primary repayment", "repayment source"],
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
    // A BARE CADENCE WORD NAMES NO FIELD. "quarterly", "monthly" and "annually"
    // sat here and matched anywhere they appeared, so with the field wave live
    // "change the payment schedule to monthly" raised a covenant-frequency chip
    // beside the schedule the banker actually said. A cadence qualifies whatever
    // field the line is about; the words that NAME this one are kept.
    synonyms: ["frequency", "test frequency", "how often"],
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
      // The asset has NO account lookup in this org (live describe): the borrower connection IS the
      // ownership junction below. The asset itself needs its collateral type, whose org VR demands
      // an advance rate on the type.
      { object: "LLC_BI__Collateral__c", via: "LLC_BI__Collateral_Type__c", label: "Create the asset, or resolve the one the borrower already owns" },
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
    //
    // EVERY ROLE, WITH EVERY ARTICLE. A banker naming the role between the verb
    // and the name ("add the co-borrower Hartwell Logistics LLC") is saying the
    // same thing as one naming it after; a list that carried only "a" left the
    // "the" phrasings matching nothing at all, which reads as the room having no
    // opinion rather than as a gap in its vocabulary.
    synonyms: [
      "add a borrower", "add borrower", "add the borrower",
      "add a guarantor", "add guarantor", "add the guarantor",
      "add a limited guarantor", "add limited guarantor", "add the limited guarantor",
      "add a co-borrower", "add co-borrower", "add the co-borrower",
      "add a related entity", "add related entity", "add the related entity",
      "as a guarantor", "as guarantor", "as a borrower", "as borrower",
      "as a co-borrower", "as co-borrower", "as a related entity", "as related entity",
      "as a limited guarantor", "as limited guarantor",
      "bring in", "add the entity",
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
    // Same role list as the add, and for the same reason: the demo package
    // carries a Limited Guarantor, and "remove the limited guarantor Elena
    // Hartwell" matched nothing here while "remove the guarantor" did.
    synonyms: [
      "remove the borrower", "remove borrower",
      "remove the guarantor", "remove guarantor",
      "remove the limited guarantor", "remove limited guarantor",
      "remove the co-borrower", "remove co-borrower",
      "remove the related entity", "remove related entity",
      "release the guarantor", "release the limited guarantor",
      "drop the guarantor", "drop the limited guarantor",
      "take off", "release from the guaranty",
    ],
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
    // "interest only period" moved to `loan.interestOnlyMonths` with the field
    // wave: a period is a length, and this entry is a stream's payment type.
    synonyms: ["principal and interest", "payment component"],
  },
];

/* FEES (founder directive 2026-08-27: "we need to include fees etc. whenever we
   ask that"). A WHOLE FEE FILES since 2026-08-31: stage_loan_modification takes
   `feeAddsJson` and the pair authors LLC_BI__Fee__c against the CLONE.

   THREE ORG FACTS THE RECON SETTLED (`knowledge/sf-build-v2/recon-20260831.md`
   Task 1), and each one is a place a naive fee write fails:
     - `Name` is an AUTONUMBER. The human label goes in Fee_Type_Description__c.
     - `RecordTypeId` is refused (INVALID_CROSS_REFERENCE_KEY: no Fee record type
       is assigned to the integration user's profile). The independent picklist
       LLC_BI__Record_Type__c carries Fees / Costs / Adjustments instead.
     - A PERCENTAGE fee needs Basis_Source and Percentage (validation rule
       Percentage_Fee_Required_Fields) and must NOT carry an Amount: the org's
       FeeTrigger computes Basis_Amount and Amount from the loan's commitment.

   The individual fee FIELDS below stay handoffs. They are attributes OF a fee,
   and a banker asking to move one of them on its own is asking to amend an
   existing row rather than to add one — a different arm, not this one. */
const FEE_FIELD_ONLY =
  "A whole fee ADD files on the clone; this entry is one FIELD of a fee rather than the fee itself, and amending a fee row that already exists is a different arm from adding one.";
const FEE_FIELD_FIX =
  "A fees[] update arm, scoped to fee rows on a clone this plan created. The describe settles the shape: LLC_BI__Loan__c on a fee is NOT updateable, so a fee row is bound to its loan at insert and can never be re-pointed.";

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
    // FILES since 2026-08-31: feeAddsJson carries the resolved fee type, the
    // human label and either a percentage (with its basis) or a flat amount,
    // targeted at ONE member — the fee is authored on that member's clone.
    recordWire: "feeAdd",
    gap: "A fee whose TYPE or whose FIGURE the room could not settle travels as a handoff rather than a guess: the org's fee-type picklist is a residential/TRID set, so a C&I fee maps onto a legal value or onto Other with the banker's own words, and a fee with no percentage and no amount is not a fee yet.",
    closes: "Nothing structural. The unmapped case closes with a picker fed by the live LLC_BI__Fee_Type__c picklist.",
    associationScope: "fees",
    chain: [
      {
        object: "LLC_BI__Fee__c",
        via: "LLC_BI__Loan__c",
        label: "Create the fee row against the clone",
        note: "A DIRECT CHILD, no junction (verified live 2026-08-31). LLC_BI__Loan__c on a fee is NOT updateable, so the row is bound to its loan at insert: a roll-over re-creates the parent's fees on the clone rather than re-pointing them.",
      },
    ],
    synonyms: ["fee", "fees", "add a fee", "charge a fee", "waive the fee", "arrangement fee", "commitment fee", "facility fee", "upfront fee", "origination fee", "unused fee", "amendment fee", "attorney fee", "appraisal fee", "agency fee", "waiver fee", "survey fee", "credit report fee"],
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
    gap: FEE_FIELD_ONLY + " On a PERCENTAGE fee it is not writable at all: the org's FeeTrigger derives Amount from Basis_Amount and the percentage.",
    closes: FEE_FIELD_FIX,
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
    // The picklist this org carries is a residential/TRID set (Appraisal,
    // Attorney, Credit Report, taxes). There is no commitment, unused or
    // facility fee value in it, which is a real finding rather than a lookup
    // failure: a C&I fee files as "Other" with the banker's words in the
    // description, and the recon flagged the picklist itself for a founder call.
    values: ["Appraisal", "Attorney", "Credit Report", "Flood Insurance", "Loan Origination", "Settlement/Close", "Survey", "Title Insurance", "Title Search", "Other"],
    gap: FEE_FIELD_ONLY + " The fee-type picklist on this org is residential/TRID-shaped with no commercial commitment, unused or amendment value, so those file as Other with the banker's own words as the label.",
    closes: FEE_FIELD_FIX + " Reading well on screen also needs a picklist decision: add the C&I fee types, or accept Other plus the description.",
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
    gap: FEE_FIELD_ONLY + " It is settled by the ask itself: a percentage said in the line makes the fee a Percentage fee, a money figure makes it a Flat Amount.",
    closes: FEE_FIELD_FIX,
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
    gap: "The aggregate is a rollup the org maintains itself from the fee rows underneath it. Writing a total directly would decouple it from the fees that produced it.",
    closes: "Nothing should. Add or amend the fees and the total follows.",
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
  ...FIELD_WAVE,
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

/** EVERYTHING that files, across all waves: the four request-key scalars, the
 *  record wires (covenants, borrowing structure) and the dynamic field wave.
 *  FILEABLE_FIELDS above deliberately stays the scalar four — wire-key logic
 *  depends on it — and this count is what the room's own narration reports. */
export const FILING_FIELDS: CatalogField[] = FIELD_CATALOG.filter(isFileable);

export function isFileable(field: CatalogField): boolean {
  return field.wireKey !== undefined || field.recordWire !== undefined || field.dynamicField !== undefined;
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

/** The unit an org label states in brackets, right after the field's own name. */
const UNIT_PARENTHETICAL = /^\s*\((?:months?|years?|mos?|yrs?)\)/;

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
    // THE UNIT IN A LABEL BELONGS TO THE FIELD IT FOLLOWS. A banker who pastes
    // the org's own label — "Amortized Term (Months)" — is naming ONE field, and
    // "months" inside the bracket is a synonym of a DIFFERENT one (Term). So the
    // claim extends over a trailing unit parenthetical, and the second read of
    // the same words never happens.
    const unit = UNIT_PARENTHETICAL.exec(lower.slice(span[1]));
    if (unit) span[1] += unit[0].length;
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
