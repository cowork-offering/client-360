/* =============================================================================
   C360_DATA contract — the single source of shape truth for the cockpit.
   Field names mirror the Customer360*.cls @InvocableVariable members (the JSON
   keys the Salesforce-hosted MCP emits), per MAPPING.md §1.

   SYNC DUTY: render/assemble-cockpit.mjs duplicates the load-bearing checks
   (meta.anchorAccountId, portfolio.accounts, borrowers coverage) as plain JS.
   Keep the two in sync by hand — if you add a required field here, mirror the
   guard there.
   ============================================================================= */


export type Id = string;

/* =============================================================================
   PROVENANCE (SPEC §12 A26.1) — every rendered figure traces to a source.

   HARD RULE: components render numbers/dates/statuses ONLY from C360_DATA or a
   pure derivation listed below. No invented literals, no placeholder
   percentages, no decorative counts. A field with no source renders "—".

   Sources:
     NCINO   — Salesforce/nCino via the Customer360* Apex @InvocableMethod tools
     BOOM    — Boom MCP (boom_get_spread / boom_get_ratios)
     AGENT   — agent-COMPOSED narrative/content (prose, anchor chips, chat). NOT
               integration-sourced: it is model-written text about the figures.
               Never conflate with NCINO — doing so would let generated prose
               inherit the source-system guarantee.
     DERIVED — computed from the above; formula recorded (client-side or assembler)
     PENDING — real field, integration not wired yet (Snowflake); render "—"
     GAP     — not modelled in the source org at all; render an honest gap chip
   ============================================================================= */

export type ProvenanceKind = "NCINO" | "BOOM" | "AGENT" | "DERIVED" | "PENDING" | "GAP";

export interface ProvenanceEntry {
  kind: ProvenanceKind;
  /** Tool / object that emits it, or the derivation formula for DERIVED. */
  source: string;
}

/** Keyed by dotted path into C360_DATA (or a `display.*` derived concept). */
export const PROVENANCE = {
  "portfolio.accounts[]": { kind: "NCINO", source: "Customer360Portfolio — accounts[]" },
  "portfolio.accounts[].naicsCode": { kind: "NCINO", source: "Customer360Portfolio — NAICS industry code" },
  "portfolio.bookTotals": { kind: "NCINO", source: "Customer360Portfolio — package-level rollups" },
  "portfolio.signals.covenantsDueSoon": { kind: "NCINO", source: "Customer360Portfolio — 90d window" },
  "portfolio.signals.maturitiesSoon": { kind: "NCINO", source: "Customer360Portfolio — 90d window" },
  "portfolio.signals.breachedCount": { kind: "NCINO", source: "Customer360Portfolio" },

  "borrower.snapshot": { kind: "NCINO", source: "Customer360Snapshot — LLC_BI__Product_Package__c" },
  "borrower.snapshot.primaryRiskRating": { kind: "NCINO", source: "Customer360Snapshot — nCino risk grade" },
  "borrower.snapshot.computedRiskRating": { kind: "NCINO", source: "Customer360Snapshot — the org's computed grade. Rendered only when staged; the cockpit derives no grade of its own" },
  "borrower.exposure.facilities[]": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Loan__c" },
  "borrower.exposure.facilities[].collateral[]": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Loan_Collateral2__c" },
  "borrower.exposure.facilities[].collateral[].collateralId": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Collateral__c record id from the pledge junction. The only valid anchor for a valuation write; absent means the id was not staged and the action is blocked" },
  "borrower.exposure.facilities[].totalLendableValue": { kind: "NCINO", source: "Customer360Exposure — the facility's PLEDGED SHARE, Σ LLC_BI__Amount_Pledged__c over the included pledges. NOT the summed whole-collateral lendable, which double-counts a cross-pledged asset. Null when no pledged share is recorded" },
  "borrower.exposure.facilities[].totalPledgedValue": { kind: "NCINO", source: "Customer360Exposure — unambiguous alias of totalLendableValue under its current meaning" },
  "borrower.exposure.facilities[].coverageNote": { kind: "NCINO", source: "Customer360Exposure — the org's own reason a coverage ratio is null. Rendered VERBATIM; this is what replaced a blank coverage state" },
  "borrower.exposure.facilities[].collateral[].amountPledged": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Amount_Pledged__c, this facility's share of the collateral" },
  "borrower.exposure.facilities[].collateral[].advanceRateSource": { kind: "NCINO", source: "Customer360Exposure — which source set the advance rate: pledge override, auto-applied, or collateral type default" },
  "borrower.covenants.covenants[]": { kind: "NCINO", source: "Customer360Covenants — LLC_BI__Covenant2__c" },
  "borrower.exposure.facilities[].collateral[].collateralName": { kind: "NCINO", source: "Customer360Exposure — the collateral's autonumber name" },
  "borrower.exposure.facilities[].collateral[].collateralDescription": { kind: "NCINO", source: "Customer360Exposure — friendly description, additive; absent falls back to the autonumber name" },
  "borrower.covenants.covenants[].attachedLoans": { kind: "NCINO", source: "Customer360Covenants — loans this covenant is attached to. Empty means account-level; ABSENT means the read predates the field and the cockpit groups nothing" },
  "borrower.covenants.covenants[].complianceId": { kind: "NCINO", source: "Customer360Covenants — LLC_BI__Covenant_Compliance__c record id. Context for the assessment, not its anchor: stage_covenant_review is anchored on the product package and resolves the row itself (WS0.5, 2026-08-22)" },
  "borrower.covenants.covenants[].latestComplianceStatus": { kind: "NCINO", source: "Customer360Covenants — LLC_BI__Status__c on the latest compliance row: Compliant, Exception, In Progress, Pending or Waived. Only a Pending row advances the covenant schedule when it moves to a complete status" },
  "borrower.covenants.covenants[].reasonForException": { kind: "NCINO", source: "Customer360Covenants — LLC_BI__Reason_for_Exception__c on that row: Breached or Overdue. The org's own answer to whether an Exception is a failed test or an undelivered document, read rather than inferred" },
  "borrower.graph.connections[]": { kind: "NCINO", source: "Customer360RelationshipGraph — LLC_BI__Connection__c" },
  "borrower.graph.legalEntities[]": { kind: "NCINO", source: "Customer360RelationshipGraph — LLC_BI__Legal_Entities__c" },
  "borrower.opportunities.opportunities[]": { kind: "NCINO", source: "Customer360Opportunities — open Opportunity" },
  "borrower.signals": { kind: "NCINO", source: "Customer360StructuralSignals" },

  // --- activity / audit trail (A30.2) ------------------------------------
  "borrower.activity[]": { kind: "NCINO", source: "Recorded relationship events (covenant evaluations, facility modifications, render/audit)" },
  "display.sessionActivity": { kind: "DERIVED", source: "ACTION_TRIGGERED entries minted locally when the banker fires a registry action (A31.3). Session-local, never persisted as history, dropped on fresh data injection" },
  "borrower.activity[].ts": { kind: "NCINO", source: "Event timestamp as recorded; rendered relative to meta.generatedAt" },
  "borrower.activity[].reference": { kind: "NCINO", source: "Source citation (message/record id). webLink absent until the M365 intake exists — rendered as plain text, never a fabricated link" },
  "borrower.requests[]": { kind: "NCINO", source: "Inbound client requests (A29 seam); live intake pending M365/Graph" },

  "borrower.boom.ratios": { kind: "BOOM", source: "boom_get_ratios" },
  "borrower.boom.ratios.ebitda": { kind: "BOOM", source: "boom_get_ratios — spread EBITDA" },
  "borrower.boom.ratios.ebitdaMargin": { kind: "BOOM", source: "boom_get_ratios — EBITDA ÷ revenue" },
  "borrower.boom.ratios.totalLeverage": { kind: "BOOM", source: "boom_get_ratios — debt ÷ EBITDA" },
  "borrower.boom.ratios.interestCoverage": { kind: "BOOM", source: "boom_get_ratios — EBITDA ÷ interest expense" },
  "borrower.boom.spread.sourceFile": { kind: "BOOM", source: "boom_get_spread — originating workbook filename" },
  "borrower.boom.spread": { kind: "BOOM", source: "boom_get_spread" },

  // --- rendered narrative / anchor chrome (F2) -------------------------------
  "borrower.verdict": { kind: "AGENT", source: "Agent-composed prose over live Customer360* figures. Rendered verbatim; never generated in-app and never source-guaranteed" },
  "borrower.anchors[]": { kind: "AGENT", source: "Agent-composed anchor chips (label/value/sub/dir) summarising live figures; rendered verbatim" },
  "borrower.snapshot.primaryStage": { kind: "NCINO", source: "Customer360Snapshot — package stage" },
  "borrower.snapshot.productPackageId": { kind: "NCINO", source: "Customer360Snapshot — the deal container, anchor for the A33.3.6 deep link" },
  "borrower.snapshot.packageStage": { kind: "NCINO", source: "Customer360Snapshot — managed LLC_BI__Stage__c, the authoritative package stage (A33.3.7)" },
  "borrower.snapshot.localCreditStage": { kind: "NCINO", source: "Customer360Snapshot — local cm_Credit_Stage__c. NOT an authority; read only to raise a DQ finding on disagreement" },
  "display.packageStageDq": { kind: "DERIVED", source: "A33.3.7 — flags when cm_Credit_Stage__c disagrees with the managed LLC_BI__Stage__c" },
  "borrower.snapshot.note": { kind: "NCINO", source: "Customer360Snapshot — tool note" },
  "meta.userId": { kind: "NCINO", source: "Assembler — UserInfo.getUserId() of the connector identity. The only accepted approverUserId on execute_*; absent means the confirm gesture fails closed rather than sending a name the org will refuse" },
  "borrower.exposure.totalCommitted": { kind: "NCINO", source: "Customer360Exposure — Σ facility commitments" },
  "borrower.exposure.totalOutstanding": { kind: "NCINO", source: "Customer360Exposure — Σ drawn" },
  "borrower.exposure.totalAvailable": { kind: "NCINO", source: "Customer360Exposure — Σ available" },
  "borrower.exposure.coverageRatio": { kind: "NCINO", source: "Customer360Exposure — RELATIONSHIP coverage over the distinct collateral, deduped by collateral id. Nullable; absent renders 'not computed', never a client-side substitute" },
  "borrower.exposure.coverageShortfall": { kind: "NCINO", source: "Customer360Exposure — org-computed relationship shortfall flag" },
  "borrower.exposure.totalUniqueCollateralLendableValue": { kind: "NCINO", source: "Customer360Exposure — lendable value of the DISTINCT collateral, the relationship coverage numerator" },
  "borrower.exposure.uniqueCollateralCount": { kind: "NCINO", source: "Customer360Exposure — how many distinct collateral records that numerator spans" },
  "borrower.exposure.facilities[].coverageRatio": { kind: "NCINO", source: "Customer360Exposure — org-computed per-facility coverage; nullable, renders '—'" },
  "borrower.exposure.facilities[].coverageShortfall": { kind: "NCINO", source: "Customer360Exposure — org-computed shortfall flag; drives the facility status chip" },
  "borrower.exposure.facilities[].status": { kind: "NCINO", source: "Customer360Exposure — lifecycle status; absent ⇒ treated active (F6)" },
  "borrower.exposure.facilities[].productPackageId": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Product_Package__c on the loan. Required to anchor a modification or renewal on the SAME package as the facility; absent blocks staging" },
  "borrower.exposure.facilities[].stage": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Stage__c, the nCino loan stage. Gates modification and renewal, which the org accepts only against a Booked facility. Additive output; absent means not staged in this view and the action fails closed" },
  "borrower.exposure.facilities[].loanCovenants[]": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Loan_Covenant__c junction rows; an empty array is a fact, not a gap" },
  "borrower.exposure.facilities[].riskGrade": { kind: "NCINO", source: "Customer360Exposure — per-facility risk grade" },
  "borrower.exposure.facilities[].interestRate": { kind: "NCINO", source: "Customer360Exposure — note rate" },
  "borrower.exposure.facilities[].maturityDate": { kind: "NCINO", source: "Customer360Exposure — facility maturity" },
  "borrower.covenants.covenants[].lastEvaluationStatus": { kind: "NCINO", source: "Customer360Covenants — nCino evaluation as of lastEvaluationDate" },
  "borrower.covenants.covenants[].breached": { kind: "NCINO", source: "Customer360Covenants — breach flag" },
  "borrower.signals.maturityWatch[]": { kind: "NCINO", source: "Customer360StructuralSignals — maturity watch window" },
  "borrower.signals.modifications[]": { kind: "NCINO", source: "Customer360StructuralSignals — loan modifications" },
  "borrower.signals.modificationClusterFlag": { kind: "NCINO", source: "Customer360StructuralSignals — server-set cluster flag" },
  "borrower.signals.guarantorSignals[]": { kind: "NCINO", source: "Customer360StructuralSignals — guarantor distress" },
  "borrower.signals.renewals[]": { kind: "NCINO", source: "Customer360StructuralSignals — in-flight renewals" },
  "meta.generatedAt": { kind: "DERIVED", source: "Assembler-stamped at render time — the deterministic clock for all time derivation (A10)" },
  "meta.instanceUrl": { kind: "NCINO", source: "Session org Lightning host, supplied by the assembler for the A33.3.6 deep link. Never hardcoded, never reconstructed from an org id" },
  "meta.user": { kind: "NCINO", source: "Session user, rendered in the nav" },
  "aiPanel.threads[]": { kind: "AGENT", source: "Agent-authored chat history (A12); plain text, rendered verbatim (A13)" },
  "borrower.activity[].detail.verdict": { kind: "AGENT", source: "Agent-composed conclusion on the relationship/request; rendered verbatim" },
  "borrower.activity[].detail.headroom": { kind: "AGENT", source: "Agent-composed capacity read supporting the verdict" },
  "borrower.activity[].detail.risks": { kind: "AGENT", source: "Agent-composed risk list on the concluded analysis" },
  "borrower.activity[].detail.body": { kind: "AGENT", source: "Agent-composed narrative body of the entry" },
  "display.actionHistory": { kind: "NCINO", source: "Customer360ActionHistory — the durable action trail, newest first. Survives a reload; supersedes the session echo for the same stagingId" },
  "display.activity.executed": { kind: "DERIVED", source: "A30 — minted from the execute_* response when the banker confirms a plan. Session-local, actor is the signed-in user, carries the created record id and the stagingId for audit" },
  "borrower.activity[].detail.nextSteps": { kind: "AGENT", source: "Agent-selected registry action ids (A30.4). Shared state: feeds the detail popup, the chat chips and the actions panel" },

  // --- derived --------------------------------------------------------------
  "borrower.covenantChallenge[]": { kind: "DERIVED", source: "Assembler validateC360 — recomputes each covenant from the Boom spread and compares to the nCino evaluation (SR 11-7 effective challenge). Inputs: BOOM + NCINO" },
  "worklist.reasons": { kind: "DERIVED", source: "data/worklist.ts — thresholds vs meta.generatedAt (A10)" },
  "display.suggestionTrigger": { kind: "DERIVED", source: "actions/suggestionEngine.ts — deterministic Tier 1 math over staged figures against a bank-policy threshold (A33.2)" },
  "display.panelPrefill": { kind: "DERIVED", source: "actions/schemas.ts — panel field values mapped from staged records; per-field provenance carried on the field itself (A33.1.3)" },
  "borrower.activity[].detail.ask": { kind: "DERIVED", source: "Parsed from the source client message (from/to amounts, facility)" },
  "display.clientRequestReason": { kind: "DERIVED", source: "CLIENT_REQUEST fires when the bundle carries a REQUEST_RECEIVED activity entry or a requests[] entry" },
  "display.activityRelativeTime": { kind: "DERIVED", source: "activity[].ts − meta.generatedAt, whole UTC days" },
  "display.gradeTone": { kind: "DERIVED", source: "data/finance.ts — grade <=4 green, <=6 amber, else red" },
  "display.covenantDirection": { kind: "DERIVED", source: "data/finance.ts — cap/floor keyword heuristic, else compliant-sign fallback" },
  "display.covenantTone": {
    kind: "DERIVED",
    source: "domain/covenantStatus.ts — Reason for Exception on the compliance row, then the Breached flag, the status string and the measured value vs threshold -> compliant|breach|exception|waived|pending|unknown",
  },
  "display.aggregateCoverageStatus": { kind: "DERIVED", source: "exposure.coverageShortfall when the read carries it, else coverage < 1.0 -> Under-covered; null -> Not computed by the source" },
  "display.facilityShortfallCount": { kind: "DERIVED", source: "count of active facilities with coverageShortfall true — a relationship can clear its floor while individual facilities do not" },
  "display.drawnPct": { kind: "DERIVED", source: "exposure.totalOutstanding ÷ totalCommitted" },
  "display.totalLendable": { kind: "NCINO", source: "exposure.totalUniqueCollateralLendableValue — read, not summed. Σ over pledges or facilities is the double count and is no longer computed anywhere" },
  "display.ewsTimeline": { kind: "DERIVED", source: "SignalsTab — modifications + guarantorSignals + renewals + breached covenants, severity-ranked" },
  "display.renewalClockPct": { kind: "DERIVED", source: "1 − daysUntilMaturity ÷ 270 (watch window)" },
  "display.bookConcentration": { kind: "DERIVED", source: "Σ tce grouped by portfolio.accounts[].industry" },
  "display.covenantCushion": { kind: "DERIVED", source: "data/finance.ts — floor: actual−threshold; cap: threshold−actual" },
  "display.coverageRatio": { kind: "NCINO", source: "exposure.coverageRatio — org-computed over the distinct collateral. The cockpit no longer derives a relationship ratio of its own" },
  "display.utilizationPct": { kind: "DERIVED", source: "bookTotals.totalOutstanding ÷ bookTotals.totalCommitted" },
  "display.incomeStatementChange": { kind: "DERIVED", source: "(lineItem.ltm − lineItem.priorFy) ÷ |priorFy|" },
  "display.nextTestDays": { kind: "DERIVED", source: "earliest covenant nextEvaluationDate − meta.generatedAt (UTC days)" },
  "display.maturityDays": { kind: "DERIVED", source: "earliest facility maturityDate − meta.generatedAt (UTC days)" },

  "borrower.pd": { kind: "PENDING", source: "Snowflake — PD, last-rated date, rating migration" },
  "borrower.decisionLedger": { kind: "PENDING", source: "deal workspace / experience-mcp (recall_decisions)" },

  "borrower.deposits": { kind: "GAP", source: "No Deposit records in the source org — never size a wallet" },
  "borrower.kycScreening": { kind: "GAP", source: "KYC/OFAC/PEP not modelled in the org — never assert clearance" },
  "worklist.lastModified": { kind: "GAP", source: "Not in the contract — renders '—' until Apex provides it (A11)" },
} as const satisfies Record<string, ProvenanceEntry>;

export type ProvenanceKey = keyof typeof PROVENANCE;

/** Reason codes for the worklist. Server-side (Apex) codes take precedence when
 *  present in `worklist`; otherwise derived client-side (see data/worklist.ts). */
export type ReasonCode =
  /** A29/A30: an inbound client request is waiting on this relationship. Ranks
   *  above every risk signal — a human is actively waiting for an answer. */
  | "CLIENT_REQUEST"
  | "COVENANT_BREACH"
  /** An administrative Exception is recorded in nCino with nothing measured
   *  against the threshold. It needs a document or an evaluation, NOT a credit
   *  decision — so it is a reason of its own and never says "breach"
   *  (domain/covenantStatus.ts). */
  | "COVENANT_EXCEPTION"
  | "COVENANT_DUE"
  | "MATURITY_NEAR"
  | "MODIFICATION_CLUSTER"
  | "GUARANTOR_SIGNAL"
  | "RECENTLY_MODIFIED";

export interface Meta {
  anchorAccountId: Id;
  /** REQUIRED (A10 + Codex F5). The deterministic clock for ALL time-based
   *  derivation. Must be a valid ISO instant; the assembler enforces validity.
   *  There is no fallback chain — without it, time reasons do not run. */
  generatedAt: string;
  dateISO?: string;
  orgAlias?: string;
  orgLabel?: string;
  /** A33.3.6 — the session org's Lightning host, used to build the deep link to
   *  the Product Package. NEVER hardcoded and never reconstructed from an org id
   *  or a guessed my.salesforce.com host. Absent means the link renders as a
   *  disabled chip with the record id as selectable text. */
  instanceUrl?: string;
  /** DISPLAY name of the viewer. Rendered, never sent to a tool. */
  user?: string;
  /**
   * The SALESFORCE USER ID (005…) of the connector identity, staged by the
   * assembler. This is the ONLY value the execute tools accept as
   * `approverUserId`: the Apex compares it to the running identity before it
   * will redeem a decision token, so a display name or an email is refused
   * and nothing is written (live defect, 2026-07-26).
   */
  userId?: string;
  accent?: string;
  screen?: string;
  activeTab?: string;
}

export interface AccountRow {
  accountId: Id;
  name: string;
  industry?: string;
  naicsCode?: string;
  annualRevenue?: number;
  tce?: number;
  tbe?: number;
  toe?: number;
  outstanding?: number;
  riskRating?: string;
  stage?: string;
  packageCount?: number;
  _sample_only?: boolean;
}

export interface CovenantDueSignal {
  accountId: Id;
  accountName?: string;
  covenantType?: string;
  nextEvaluationDate?: string;
  daysUntilNextEvaluation?: number;
  overdue?: boolean;
}

export interface MaturitySignal {
  accountId?: Id;
  loanId?: string;
  name?: string;
  maturityDate?: string;
  daysUntilMaturity?: number;
}

export interface PortfolioSignals {
  covenantsDueSoon?: CovenantDueSignal[];
  breachedCount?: number;
  maturitiesSoon?: MaturitySignal[];
}

export interface BookTotals {
  totalCommitted?: number;
  totalOutstanding?: number;
  accountCount?: number;
  utilizationPct?: number;
}

export interface Portfolio {
  accounts: AccountRow[];
  bookTotals?: BookTotals;
  signals?: PortfolioSignals;
  note?: string;
}

export interface Snapshot {
  accountId: Id;
  /** The deal container. Anchor for the A33.3.6 deep link. */
  productPackageId?: string;
  /** A33.3.7 — the MANAGED package stage field. This is the authority.
   *  Display-only; the credit lifecycle a banker means is the LOAN stage. */
  packageStage?: string;
  /** The LOCAL field. NOT an authority and never read as one. Rendered only to
   *  raise a data-quality finding when it disagrees with the managed field. */
  localCreditStage?: string;
  name?: string;
  industry?: string;
  annualRevenue?: number;
  naicsCode?: string;
  packageCount?: number;
  totalCreditExposure?: number;
  totalBorrowerExposure?: number;
  totalObligorExposure?: number;
  totalOutstanding?: number;
  primaryRiskRating?: string;
  /** The org's own computed grade, when it stages one. Never derived here:
   *  there is no grade model in the artifact, and a credit grade that looks
   *  computed but is not would be the worst thing this cockpit could render. */
  computedRiskRating?: string;
  primaryStage?: string;
  note?: string;
}

export interface Covenant {
  covenantId?: string;
  /** The COMPLIANCE record (LLC_BI__Covenant_Compliance__c) this covenant's
   *  assessment lands on. Distinct from `covenantId`, which is the covenant
   *  definition. STAGED BUT NO LONGER READ by any surface: since WS0.5 the
   *  review is anchored on the PRODUCT PACKAGE and the plan resolves the row
   *  itself, so an absent id no longer blocks the action. Kept because the
   *  assembler emits it and the staged bundles carry it. */
  complianceId?: string;
  /** The org's own latest-compliance anchor. Null is CORRECT where an account
   *  carries no compliance rows by design; not every relationship has them. */
  latestComplianceId?: string | null;
  /**
   * `LLC_BI__Status__c` on that latest compliance row: Compliant, Exception,
   * In Progress, Pending or Waived. DISTINCT from `covenantStatus`, which is
   * the covenant-level field, and it is the one that decides whether an
   * assessment would advance the schedule — only a Pending row does.
   */
  latestComplianceStatus?: string;
  /**
   * `LLC_BI__Reason_for_Exception__c` on that row: Breached or Overdue.
   *
   * THE field that separates a failed test from an undelivered document. nCino
   * forces Exception onto any row whose due date has passed, measured or not,
   * so Exception alone must never be read as a breach. Null when the row
   * carries no reason.
   */
  reasonForException?: string;
  covenantType?: string;
  thresholdValue?: number;
  actualValue?: number;
  lastEvaluationStatus?: string;
  /** The facilities this covenant is attached to. An EMPTY array means the
   *  covenant is account-level. ABSENT means the read does not carry the field
   *  yet, which is not the same fact and must not be read as either. */
  attachedLoans?: Array<{ loanId?: string; loanName?: string }>;
  lastEvaluationDate?: string;
  nextEvaluationDate?: string;
  daysUntilNextEvaluation?: number;
  frequency?: string;
  breached?: boolean;
  covenantStatus?: string;
}

export interface Collateral {
  loanId?: string;
  /** The COLLATERAL record id (LLC_BI__Collateral__c). Distinct from `loanId`,
   *  which is the FACILITY the pledge hangs off. A valuation is written against
   *  this id and never against the facility: the org refuses a facility id,
   *  correctly. Absent when the assembler did not stage it. */
  collateralId?: string;
  /** The org's autonumber name, e.g. COL-000762. */
  collateralName?: string;
  /** A friendly description, added additively to the read. Rendered when
   *  present; the autonumber name is the fallback, never a guess. */
  collateralDescription?: string;
  collateralType?: string;
  collateralValue?: number;
  advanceRate?: number;
  /**
   * WHICH source set `advanceRate`: the pledge's own override, the auto-applied
   * value, or the collateral type default. A banker reading 75 percent wants to
   * know whether someone chose it or the org defaulted it.
   */
  advanceRateSource?: string;
  /** The COLLATERAL's whole lendable value, repeated on every pledge of a
   *  cross-pledged asset. Never summed across pledges — that is the double
   *  count (NCINO-FUNCTIONAL-VALIDATION §2.6). */
  currentLendableValue?: number;
  /**
   * THIS FACILITY'S SHARE of the collateral (`LLC_BI__Amount_Pledged__c`). The
   * figure that makes a cross-pledged asset add up: COL-000762 carries 9.6MM of
   * lendable value and is pledged 8.0MM to one facility and 1.6MM to another.
   */
  amountPledged?: number;
  lienPosition?: string;
  pledgedStatus?: string;
  isPrimary?: boolean;
}

/** A `LLC_BI__Loan_Covenant__c` junction row. nCino canon: a renewal clones the
 *  JUNCTION, not the covenant, so these are what carry onto a new facility. */
export interface LoanCovenantJunction {
  id?: string;
  name?: string;
  covenantType?: string;
  covenantId?: string;
}

export interface Facility {
  loanId?: string;
  /** Lifecycle status. Absent or "Active" ⇒ active (F6). Explicitly closed /
   *  paid-off facilities are excluded from maturity derivation and display. */
  status?: string;
  /** The package this facility hangs off. A credit action anchors on the
   *  facility AND its own package, so a facility chosen from one package must
   *  never be staged against another's. Absent means the correspondence cannot
   *  be proven and staging is refused. */
  productPackageId?: string;
  /**
   * The nCino LOAN STAGE (`LLC_BI__Stage__c`): Qualification, Proposal, Final
   * Review, Booked. DISTINCT from `status`, which is the lifecycle flag.
   *
   * A credit action accepts only a BOOKED facility (probe-proven), so this
   * field decides whether modification and renewal are offered at all. It is
   * additive on the Customer360Exposure read and may be ABSENT until that lands;
   * absent means "not staged in this view", never "not booked", and the
   * predicate fails closed rather than assuming either way.
   */
  stage?: string;
  name?: string;
  productType?: string;
  riskGrade?: string;
  committed?: number;
  outstanding?: number;
  available?: number;
  maturityDate?: string;
  interestRate?: number;
  /**
   * The facility's PLEDGED SHARE of its collateral (Σ `amountPledged` over the
   * included pledges) — NOT the summed whole-collateral lendable, which every
   * pledge of a cross-pledged asset repeats.
   *
   * NULL, not zero, when the org records no pledged share. The two are
   * different facts and the coverage math must not read them the same way.
   */
  totalLendableValue?: number | null;
  /** Unambiguous alias of `totalLendableValue` under its current meaning. Same
   *  figure, named so the semantics cannot be misread by a later reader. */
  totalPledgedValue?: number | null;
  coverageRatio?: number | null;
  coverageShortfall?: boolean;
  /**
   * WHY `coverageRatio` is null, in the org's own words — "all 3 collateral
   * pledges on this facility are flagged Excluded or Abundance-of-Caution", "no
   * collateral is pledged to this facility", "this facility carries no
   * outstanding balance to cover".
   *
   * Rendered VERBATIM. This is the field that replaced a guessed or blank
   * coverage state with a reason a credit officer can act on.
   */
  coverageNote?: string | null;
  /**
   * THE TERM, THE AMORTISED TERM AND THE FIRST PAYMENT DATE.
   *
   * nCino hides the rate and the payment stream on a loan until FOUR fields are
   * set: the amount, the term (`LLC_BI__Term_Months__c`), the amortised term
   * (`LLC_BI__Amortized_Term_Months__c`) and the first payment date
   * (`LLC_BI__First_Payment_Date__c`). A modification that moves the amount and
   * leaves the last two blank produces a version nobody can price in the UI.
   *
   * NO READ ON THIS COCKPIT CARRIES ANY OF THEM TODAY. `Customer360Exposure`
   * returns the amount, the maturity and the rate and nothing else about the
   * schedule, so these are declared, ABSENT, and absent means UNKNOWN. The room
   * asks rather than assuming either way, which is the same fail-closed reading
   * `stage` takes.
   */
  termMonths?: number | null;
  amortizedTermMonths?: number | null;
  firstPaymentDate?: string | null;
  collateral?: Collateral[];
  /** Loan-level covenant junctions. An EMPTY array is a legitimate fact (all of
   *  Piedmont's covenants are Account-level), not missing data. */
  loanCovenants?: LoanCovenantJunction[];
}

export interface Connection {
  counterpartyId?: string;
  counterpartyName?: string;
  direction?: string;
  role?: string;
  ownershipPercent?: number | null;
  indirectOwnershipPercent?: number | null;
  totalOwnershipPercent?: number | null;
  isActive?: boolean;
}

export interface LegalEntity {
  accountName?: string;
  borrowerType?: string;
  relationshipType?: string;
  ownershipPercent?: number | null;
  guarantyAmountType?: string | null;
  contingentAmount?: number | null;
  loanId?: string | null;
  packageId?: string;
}

export interface RelationshipGraph {
  accountId?: Id;
  connections?: Connection[];
  legalEntities?: LegalEntity[];
  note?: string;
}

export interface Opportunity {
  opportunityId?: string;
  name?: string;
  stage?: string;
  amount?: number;
  closeDate?: string;
  type?: string;
  probability?: number;
  ownerName?: string;
}

export interface GuarantorSignal {
  guarantorName?: string;
  riskStatus?: string;
  highestRiskGrade?: string | number;
}

export interface Renewal {
  revisionNumber?: number | string;
  revisionStatus?: string;
  hasActiveRenewalLoan?: boolean;
}

export interface BoomPeriod {
  period?: string;
  revenue?: number;
  ebitda?: number;
  margin?: number;
}

export interface BoomLineItem {
  line?: string;
  ltm?: number;
  priorFy?: number;
}

export interface Boom {
  ratios?: {
    revenue?: number;
    ebitda?: number;
    ebitdaMargin?: number;
    totalLeverage?: number;
    interestCoverage?: number;
  };
  spread?: {
    sourceFile?: string;
    periods?: BoomPeriod[];
    lineItems?: BoomLineItem[];
  };
  note?: string;
}

/** Boom-vs-nCino effective-challenge entry (SR 11-7 corroboration). */
export interface CovenantChallenge {
  covenantId?: string;
  status?: "corroborated" | "diverges" | "not-computable" | string;
  boomImplied?: { value?: number; formula?: string; inputs?: unknown; period?: string } | null;
  threshold?: number;
  nCinoActual?: number;
  breachRiskFlag?: boolean;
  note?: string;
}

/** A recorded loan modification. Date is read from the first present of these
 *  keys (source field name varies) — see readModDate() in worklist.ts. */
export interface ModificationEntry {
  date?: string;
  modifiedDate?: string;
  modificationDate?: string;
  effectiveDate?: string;
  loanId?: string;
  [k: string]: unknown;
}

export interface StructuralSignals {
  accountId?: Id;
  modifications?: ModificationEntry[];
  modificationClusterFlag?: boolean;
  renewals?: Renewal[];
  maturityWatch?: MaturitySignal[];
  guarantorSignals?: GuarantorSignal[];
  note?: string;
}

/* =============================================================================
   ACTIVITY / AUDIT TRAIL (SPEC §12 A30.2)

   CONTRACT COORDINATION NOTE — read before changing:
   `detail.nextSteps[].actionId` MUST reference an id in src/actions/registry.ts
   (ACTIONS[].id). The data producer reads those ids from the registry; the app
   resolves them back through it, availability-gated. An unknown actionId is
   dropped, never rendered as a dead button.

   PROVENANCE (A30.2): record-derived events (COVENANT_EVALUATED,
   FACILITY_MODIFIED, RENDER_AUDIT) are NCINO/DERIVED. The verdict, brief and
   nextSteps on ANALYSIS_CONCLUDED / REQUEST_RECEIVED are AGENT-composed. A
   request's `ask` is DERIVED from the source message. Absent activity renders
   an honest empty state — never invented history.
   ============================================================================= */

export type ActivityKind =
  /** A31.3 — the banker triggered a registry action. Session-local until the
   *  v2 write/audit path persists it; never fabricated as historical. */
  | "ACTION_TRIGGERED"
  /** A30 — the banker confirmed a plan and the org executed it. Session-local
   *  on the same terms as ACTION_TRIGGERED: an attempted write belongs in the
   *  trail whether it landed or not, so the failure kind is logged too. */
  | "ACTION_EXECUTED"
  | "ACTION_EXECUTION_FAILED"
  /** The org holds a staging row that was never confirmed. Real trail content:
   *  someone built a plan and stopped. Neither a write nor a failure. */
  | "ACTION_STAGED"
  | "REQUEST_RECEIVED"
  | "ANALYSIS_CONCLUDED"
  | "COVENANT_EVALUATED"
  | "FACILITY_MODIFIED"
  | "RENDER_AUDIT";

/** A registry action to take next, with optional banker context. */
export interface NextStep {
  /** Must match ACTIONS[].id in src/actions/registry.ts. */
  actionId: string;
  note?: string;
}

/** Citation for an activity entry. Until the M365 intake exists `webLink` is
 *  ABSENT and the UI renders the id as plain text — never a fake link (A29). */
export interface ActivityReference {
  id?: string;
  label?: string;
  /** Producer's reference kind, e.g. "m365-message", "ncino-record". */
  kind?: string;
  /** Optional display source label. */
  source?: string;
  /** Absent until the M365 intake exists — never render a fabricated link. */
  webLink?: string;
}

/** The commercial ask carried by a client request (DERIVED from the message).
 *  Field names match the producer's emitted shape — do not rename without
 *  coordinating: the data agent writes these keys. */
export interface RequestAsk {
  /** e.g. "facility_increase". */
  type?: string;
  from?: number;
  to?: number;
  facilityName?: string;
}

/**
 * One row of the DURABLE action trail, read back from the org
 * (`Customer360ActionHistory`). Distinct from the session-local echo the panel
 * mints at execute time: this survives a reload, a republish and a new banker.
 * Built against the declared shape; the seam swaps when the envelope is observed.
 */
export interface ActionHistoryRow {
  stagingId: string;
  actionId?: string;
  status?: string;
  actorUserId?: string;
  approverUserId?: string;
  executedAt?: string;
  createdDate?: string;
  resultRecordId?: string;
  /** The org's name for the created record. Null on an unexecuted row (nothing
   *  was created) AND on a completed row whose read-back failed — two different
   *  facts, told apart by `status`. */
  resultRecordName?: string;
  accountId?: string;
  productPackageId?: string;
  collateralId?: string;
  /** Whether the staging row still carries its plan hash. */
  planHashPresent?: boolean;
}

export interface ActivityDetail {
  /** Full narrative body (AGENT for analysis/request briefs). */
  body?: string;
  ask?: RequestAsk;
  /** Concluded verdict text (AGENT). */
  verdict?: string;
  /** Headroom / capacity read supporting the verdict (AGENT). */
  headroom?: string;
  risks?: string[];
  /** SHARED STATE (A30.4) — one source feeding the popup, the chat chips and
   *  the actions panel. Never duplicate these as prose. */
  nextSteps?: NextStep[];
  /** Links a request to the analysis that concluded on it. */
  linkedActivityId?: string;
}

export interface ActivityEntry {
  id: string;
  /** ISO instant; rendered relative to meta.generatedAt. */
  ts: string;
  kind: ActivityKind;
  title: string;
  summary?: string;
  /** Who caused it. "You" for session-local ACTION_TRIGGERED entries (A31.3). */
  actor?: string;
  /** True for entries minted live in this session (never baked data). These are
   *  dropped on a fresh data injection — acceptable until the v2 audit path
   *  persists them server-side. */
  sessionLocal?: boolean;
  /** Read back from the org's own action trail, not minted in this session.
   *  Renders a distinct chip: "the org says this happened" is a stronger claim
   *  than "this page did it a moment ago". */
  orgConfirmed?: boolean;
  reference?: ActivityReference;
  detail?: ActivityDetail;
}

/** A29 seam — an inbound client request on the relationship. May be present
 *  without a matching activity entry; both drive the CLIENT_REQUEST reason. */
export interface ClientRequest {
  id: string;
  receivedAt?: string;
  status?: string;
  /** e.g. "email". */
  channel?: string;
  summary?: string;
  ask?: RequestAsk;
  reference?: ActivityReference;
}

export interface Anchor {
  label: string;
  value: string;
  sub?: string;
  dir?: "up" | "down" | null;
}

/** One staged relationship. Shape mirrors the sample `borrower` object. */
export interface BorrowerBundle {
  snapshot: Snapshot;
  graph?: RelationshipGraph;
  exposure?: {
    accountId?: Id;
    totalCommitted?: number;
    totalOutstanding?: number;
    totalAvailable?: number;
    /**
     * RELATIONSHIP coverage, org-computed over the DISTINCT collateral (deduped
     * by collateral id). Never derivable from the facility rows: Piedmont's
     * facilities pledge 9.25MM of a 14.0MM distinct lendable base, so a sum of
     * facility shares would understate it by a third.
     *
     * Absent means the read does not carry it. The cockpit renders that as an
     * honest "not computed" rather than substituting a derivation of its own.
     */
    coverageRatio?: number | null;
    coverageShortfall?: boolean;
    /** Lendable value of the DISTINCT collateral — the coverage numerator. */
    totalUniqueCollateralLendableValue?: number;
    /** How many distinct collateral records that numerator spans. */
    uniqueCollateralCount?: number;
    facilities?: Facility[];
    note?: string;
  };
  covenants?: { covenants?: Covenant[]; note?: string };
  opportunities?: { opportunities?: Opportunity[]; note?: string };
  covenantChallenge?: CovenantChallenge[];
  /** Audit trail / narrative spine (A30). Absent ⇒ honest empty state. */
  activity?: ActivityEntry[];
  /** Inbound client requests (A29 seam). */
  requests?: ClientRequest[];
  signals?: StructuralSignals;
  boom?: Boom;
  verdict?: string;
  anchors?: Anchor[];
}

/**
 * The anchor chips a bundle carries, defensively.
 *
 * LIVE DEFECT 2026-07-26: a bundle merged from real tool responses arrived with
 * `anchors` as an OBJECT (`{accountId, productPackageId}`) where every staged
 * bundle had used an ARRAY of chips. `.map` threw straight through the account
 * workspace and the founder got a blank profile.
 *
 * The producer's shape is not ours to police, but the cockpit's job is to
 * render what it can and show an honest gap for the rest — never to crash. So
 * anything that is not a well-formed chip is simply not a chip: the strip
 * renders the ones that are, or renders nothing.
 */
export function readAnchors(bundle: BorrowerBundle | null | undefined): Anchor[] {
  const raw = bundle?.anchors as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is Anchor =>
      typeof a === "object" && a !== null && typeof (a as Anchor).label === "string" && typeof (a as Anchor).value === "string",
  );
}

export interface Worklist {
  accountIds: Id[];
  reasons: Record<Id, ReasonCode[]>;
}

export interface AiMessage {
  /** Stable id for dedupe-by-id merge across artifact replaces (SPEC §12 A15). */
  id: string;
  /** A12 vocabulary: the agent side is "agent", never "assistant" (F7). */
  role: "user" | "agent";
  /** PLAIN TEXT only — never rendered as HTML/Markdown (A13). */
  text: string;
  /** ISO timestamp (A12 field name is `ts`). */
  ts?: string;
  context?: { accountId?: Id; tab?: string };
}

export interface AiThread {
  id?: string;
  componentId?: string;
  title?: string;
  messages?: AiMessage[];
}

export interface AiPanel {
  threads?: AiThread[];
  componentId?: string;
}

export interface C360Data {
  meta: Meta;
  portfolio: Portfolio;
  borrower: BorrowerBundle;
  borrowers?: Record<Id, BorrowerBundle>;
  worklist?: Worklist;
  aiPanel?: AiPanel | null;
}
