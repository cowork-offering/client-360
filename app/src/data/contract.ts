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
  "borrower.exposure.facilities[]": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Loan__c" },
  "borrower.exposure.facilities[].collateral[]": { kind: "NCINO", source: "Customer360Exposure — LLC_BI__Loan_Collateral2__c" },
  "borrower.exposure.facilities[].totalLendableValue": { kind: "NCINO", source: "Customer360Exposure — org-computed Current_Lendable_Value" },
  "borrower.covenants.covenants[]": { kind: "NCINO", source: "Customer360Covenants — LLC_BI__Covenant2__c" },
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
  "borrower.exposure.totalCommitted": { kind: "NCINO", source: "Customer360Exposure — Σ facility commitments" },
  "borrower.exposure.totalOutstanding": { kind: "NCINO", source: "Customer360Exposure — Σ drawn" },
  "borrower.exposure.totalAvailable": { kind: "NCINO", source: "Customer360Exposure — Σ available" },
  "borrower.exposure.facilities[].coverageRatio": { kind: "NCINO", source: "Customer360Exposure — org-computed per-facility coverage; nullable, renders '—'" },
  "borrower.exposure.facilities[].coverageShortfall": { kind: "NCINO", source: "Customer360Exposure — org-computed shortfall flag; drives the facility status chip" },
  "borrower.exposure.facilities[].status": { kind: "NCINO", source: "Customer360Exposure — lifecycle status; absent ⇒ treated active (F6)" },
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
  "display.covenantTone": { kind: "DERIVED", source: "data/finance.ts — breached/status string -> red|amber|green" },
  "display.aggregateCoverageStatus": { kind: "DERIVED", source: "coverage < 1.0 -> Under-covered, else Covered; null -> Not computable" },
  "display.drawnPct": { kind: "DERIVED", source: "exposure.totalOutstanding ÷ totalCommitted" },
  "display.totalLendable": { kind: "DERIVED", source: "Σ facilities.totalLendableValue" },
  "display.ewsTimeline": { kind: "DERIVED", source: "SignalsTab — modifications + guarantorSignals + renewals + breached covenants, severity-ranked" },
  "display.renewalClockPct": { kind: "DERIVED", source: "1 − daysUntilMaturity ÷ 270 (watch window)" },
  "display.bookConcentration": { kind: "DERIVED", source: "Σ tce grouped by portfolio.accounts[].industry" },
  "display.covenantCushion": { kind: "DERIVED", source: "data/finance.ts — floor: actual−threshold; cap: threshold−actual" },
  "display.coverageRatio": { kind: "DERIVED", source: "Σ facilities.totalLendableValue ÷ exposure.totalOutstanding" },
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
  user?: string;
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
  primaryStage?: string;
  note?: string;
}

export interface Covenant {
  covenantId?: string;
  covenantType?: string;
  thresholdValue?: number;
  actualValue?: number;
  lastEvaluationStatus?: string;
  lastEvaluationDate?: string;
  nextEvaluationDate?: string;
  daysUntilNextEvaluation?: number;
  frequency?: string;
  breached?: boolean;
  covenantStatus?: string;
}

export interface Collateral {
  loanId?: string;
  collateralType?: string;
  collateralValue?: number;
  advanceRate?: number;
  currentLendableValue?: number;
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
  name?: string;
  productType?: string;
  riskGrade?: string;
  committed?: number;
  outstanding?: number;
  available?: number;
  maturityDate?: string;
  interestRate?: number;
  totalLendableValue?: number;
  coverageRatio?: number | null;
  coverageShortfall?: boolean;
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
    totalCommitted?: number;
    totalOutstanding?: number;
    totalAvailable?: number;
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
