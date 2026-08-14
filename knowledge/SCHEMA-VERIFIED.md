# Customer 360 MCP — Verified Tool Surface + Data State (2026-06-28, Fabian)

Artifact of the live schema sweep (handover steps 1 to 3). Every object/field below was confirmed by
live `describe` / SOQL against the **bankinggpt sandbox** via the `sobject-sf` connector
(`fabian.goetzens@accenture.com.bankinggpt`, System Administrator, API v64.0). This is ground truth,
not assumption. Supersedes the speculative tool-surface table in HANDOVER.md where they differ.

## Access (confirmed live)
- `sobject-sf` MCP loaded this session, reads FSC + nCino in one org under one identity. The
  session-restart blocker is cleared.
- Org carries **484 queryable objects**. nCino (`LLC_BI__*`, `cm_*`, `nFORCE__*`, `nFORMS__*`,
  `ncinoocr__*`, `nCinoCB__*`), FSC (`FinServ__*` + standard Industries objects), Boom mirror
  (`Boom_*__c`), and credit-memo-reinvented customs (`cm_*`, `NAICS_Codes__c`, `Compliance_Check__c`,
  `KYC__c`) all co-resident. One auth boundary = one MCP. Doctrine confirmed in data.

## describe API constraints (matter for the server design)
- `getObjectSchema` accepts **max 10 objects per call**; one invalid name fails the whole batch.
- Large describes **overflow to a file** instead of returning inline (Loan = 333 fields, Account ~300,
  FinancialAccount 154, Deposit 149). Distill with `jq` on the saved file, do not pull raw inline.

## Handover corrections (caught by live describe)
1. **`LLC_BI__Account__c` does NOT exist.** nCino rides the **standard `Account`** object here (with
   `LLC_BI__*` + `cm_*` fields and record types on it). The Header tool anchors to `Account`.
2. **`LLC_BI__Risk_Rating__c` (as an object) does NOT exist.** Deal risk rating is a **picklist field**
   `LLC_BI__Product_Package__c.LLC_BI__Risk_Rating__c`; loan risk is `LLC_BI__Loan__c.LLC_BI__Risk_Grade__c`.
   Relationship risk lives in `LLC_BI__Relationship_Risk_Review__c`.
3. **"Household" is an Account record type**, not an object. Account record types present: `Business`,
   `Household`, `Individual`, `Lender`, `Vendor`, plus Industries variants (`IndustriesBusiness`,
   `IndustriesHousehold`, `IndustriesInstitution`, `IndustriesIndividual`) and `PersonAccount`.

## Verified tool surface (anchored to real fields)

### 1. `customer_360(accountId)` — Header
- **Account** (standard, RecordType `Business`/`Household`/...): `Name`, `Industry`, `Sic`/`SicDesc`,
  `NAICS_Code__c`, `AnnualRevenue`, `NumberOfEmployees`, `AccountTier__c`/`Tier__c`, `Bank_Segment__c`,
  `LLC_BI__Relationship_Class__c`, `FinServ__CustomerSegment__c`.
- Officers (persona anchors): `Bank_Relationship_Manager__c`, `Primary_Officer__c` (Commercial Lending),
  `Secondary_Officer__c` (Trust), `Mortgage_Relationship_Manager__c` (all -> User).
- Relationship grouping lookups: `ParentId -> Account`, `ACNPEX_Relationship__c -> Account`.
- Denormalized rollups EXIST but are UNPOPULATED in this sandbox (see Data State): `Committed_Direct_Exposure__c`,
  `Committed_Indirect_Exposure__c`, `LLC_BI__Committed_*_Exposure__c`, `Total_Deposits_at_Bank__c`,
  `FinServ__TotalBankDeposits__c`. **Header must roll up children live; do not trust these fields.**
- Profitability: **`LLC_BI__Profitability__c`** (`LLC_BI__Relationship__c -> Account`) carries
  `Profitability__c`, `Net_Interest_Income__c`, `Deposit_Revenue__c`, `Fee_Income__c`,
  `Net_Treasury_Income__c`, `Forecasted_Profitability__c`. Links to Package/Loan/Deposit/Opportunity.

### 2. `relationship_entities(accountId)` — Entity & ownership graph
- **`LLC_BI__Connection__c`** (nCino ownership graph): `LLC_BI__Connected_From__c`/`LLC_BI__Connected_To__c -> Account`,
  `LLC_BI__Ownership_Percent__c`, `LLC_BI__Indirect_Ownership_Percent__c`,
  `LLC_BI__Total_Direct_Indirect_Ownership_Percent__c`, role + reciprocal role. Primary org-chart source.
- **`FinServ__AccountAccountRelation__c`** (FSC): `FinServ__Account__c`/`FinServ__RelatedAccount__c -> Account`,
  `FinServ__Role__c -> FinServ__ReciprocalRole__c`, `FinServ__Active__c`, Start/End dates, AssociationType.
- **`LLC_BI__Legal_Entities__c`** (facility involvement): Account ↔ Loan/Package/Deposit/Treasury/Collateral
  with `LLC_BI__Borrower_Type__c`, `LLC_BI__Entity_Type__c`, `LLC_BI__Guaranty_Amount__c`,
  `LLC_BI__Contingent_Amount__c`, and `Exclude_From_Account_Exposure__c` / `Exclude_From_Product_Package_Exposure__c`
  (respect these in exposure math).

### 3. `relationship_exposure(accountId)` — Exposure across facilities
- **`LLC_BI__Product_Package__c`** (deal hub, joins `LLC_BI__Account__c`/`LLC_BI__Primary_Entity__c`/`cm_Household__c -> Account`):
  rollups `LLC_BI__TCE__c` (Total Credit Exp), `LLC_BI__TBE__c` (Borrower), `LLC_BI__TOE__c` (Obligor),
  `LLC_BI__Outstanding__c`, `LLC_BI__Total_Loan_Facilities_Amount__c`, plus Direct/Indirect/Affiliated
  committed+proposed breakdowns. `LLC_BI__Risk_Rating__c` (picklist).
- **`LLC_BI__Loan__c`** (`LLC_BI__Account__c -> Account`, `LLC_BI__Product_Package__c`): `LLC_BI__AmountOutstanding__c`,
  `LLC_BI__Principal_Balance__c`, `LLC_BI__UNGTD_Exposure__c` (Net Exposure), `LLC_BI__Total_Facility_Amount__c`,
  `LLC_BI__Amount_Available__c`, `LLC_BI__Maturity_Date__c`, `LLC_BI__Risk_Grade__c`. Officer `cm_Portfolio_Manager__c -> User`.
- **`LLC_BI__Participation__c`** (sold/retained) and **`LLC_BI__Excluded_Exposure__c`** (exposure adjustments).

### 4. `deposits_and_treasury(accountId)` — Share of wallet  [TWO co-resident models]
- **nCino commercial (preferred for C&I):** `LLC_BI__Deposit__c` (`LLC_BI__Account__c -> Account`,
  `LLC_BI__Average_Deposit_Account_Balance__c`, `LLC_BI__Amount__c`, deposit-type picklists) +
  `LLC_BI__Treasury_Service__c` (`LLC_BI__Relationship__c -> Account`, links full TM suite: ACH, Lockbox,
  Wire, Sweep, ZBA, RDC, Reconciliation, Online Banking).
- **FSC (retail/wealth fallback + cross-sell signal):** `FinServ__FinancialAccount__c`
  (`FinServ__PrimaryOwner__c`/`FinServ__JointOwner__c`/`FinServ__Household__c -> Account`,
  `FinServ__Balance__c`, `FinServ__AverageBalance__c`, `FinServ__FinancialAccountType__c`) +
  `FinServ__FinancialAccountRole__c` (account/contact ↔ financial account + role).
- DESIGN CALL: for the commercial cockpit, treat nCino Treasury/Deposit as authoritative wallet; surface
  FSC FinancialAccount when populated. Two household groupings exist (`cm_Household__c` vs `FinServ__Household__c`);
  reconcile against live data before relying on either.

### 5. `relationship_risk(accountId)` — Risk & covenants
- **`LLC_BI__Relationship_Risk_Review__c`** (`LLC_BI__Account__c -> Account`): `On_Balance_Exposure__c`,
  `Off_Balance_Exposure__c`, `Performing_Status__c`, `SCRA_Grade__c`, rating-agency fields.
- **`LLC_BI__Account_Covenant__c`** ("Relationship Covenant", `LLC_BI__Account__c` + `LLC_BI__Covenant2__c`).
- Deal/loan grades: `Product_Package.LLC_BI__Risk_Rating__c`, `Loan.LLC_BI__Risk_Grade__c`.
- Snowflake PD/grade still grafted at `experience-mcp` (outside Salesforce; unchanged).

### 6. `relationship_opportunities(accountId)` — Whitespace / next-best-action
- **`Opportunity`** (`AccountId`, `FinServ__Household__c -> Account`, `LLC_BI__Product_Package__c`,
  `LLC_BI__Loan__c`): `StageName`, `Amount`, `Probability`, `CloseDate`, `Type`, `ForecastCategory`,
  `LLC_BI__Products_Interested_In__c`, `LLC_BI__Product_Line/Type__c`, `LLC_BI__Days_at_Current_Stage__c`.

## Relationship roll-up mechanism (how Customer 360 aggregates)
Anchor on an `Account`. Gather:
- Product Packages where `LLC_BI__Account__c` OR `LLC_BI__Primary_Entity__c` OR `cm_Household__c` = account → sum TCE/TBE/TOE/Outstanding.
- Loans where `LLC_BI__Account__c` = account (or child of those packages) → facility detail.
- Connections where `Connected_From/To` = account → ownership/entity graph; expand to related accounts for true household view.
- Deposits/Treasury where `LLC_BI__Account__c` / `LLC_BI__Relationship__c` = account → wallet.
- Profitability where `LLC_BI__Relationship__c` = account → P&L.
Do the aggregation **server-side** (mirror `experience-mcp/boomFinancials.js`: numbers never pass through the LLM).

## Live data state — Piedmont (Account 001bb00001DLtRMAA1)
- Firmographics POPULATED: "Piedmont Precision Components, Inc.", RecordType `Business`, Industry
  Manufacturing, NAICS 332710, AnnualRevenue $64,500,000 (matches Boom revenue exactly).
- Deal POPULATED: Product Package "Piedmont Precision C&I Credit Package" (a5Fbb000000HA1NEAW) — TCE
  $12.5M, TBE $12.5M, TOE/Outstanding $4.25M, Total Facilities $12.5M, Risk Rating "5". 3 Loans.
- Relationship layer THIN: 2 Connections, 1 Opportunity, **0 Deposits**, denormalized Account rollups
  null/0, no `cm_Household__c`/`ParentId`/`ACNPEX_Relationship__c`, no RM/officer set.
- IMPLICATION: (a) header must compute from children, not Account fields; (b) Piedmont is a credit-only
  relationship with $0 deposit share-of-wallet, which makes "win the operating deposits + treasury" the
  natural headline next-best-action; (c) a richer Customer 360 demo (multi-entity household, deposits,
  treasury, profitability, relationship covenants) needs seeded data in the sandbox.

## Open design decisions (for next session)
- Authoritative wallet source: nCino Treasury/Deposit vs FSC FinancialAccount (lean nCino for C&I).
- Household/relationship grouping key: `cm_Household__c` vs `ACNPEX_Relationship__c` vs `FinServ__Household__c`
  vs Connection graph. None populated for Piedmont; pick the convention and seed it.
- Seed richer relationship data for Piedmont, or scope the demo narrative to the real single-entity shape.
- Widget: experience-mcp-served `ui://` (today) vs AXL (roadmap) — unchanged from handover.

## Next session
1. Decide grouping key + wallet source (above).
2. If seeding: add a 2nd related entity + Connection, deposits + a treasury service, a Profitability record.
3. Write the full concept doc (style of credit-memo-reinvented/docs/architecture) anchored to this file.
4. Prototype `customer_360(accountId)` aggregation in experience-mcp tier.

---

## Addendum 2026-06-28 — Collateral + Covenants (verified; legacy/modern gotcha)

Fabian flagged that nCino also carries Loan, Product Package, Collateral, and Covenants. Loan + Package were
already anchored (exposure tool). Collateral + Covenants are added here, both validated against Piedmont.

GOTCHA: nCino ships LEGACY and MODERN versions of both; the LEGACY ones are EMPTY in this org. Use the modern:
- Covenants: `LLC_BI__Covenant2__c` (628 org-wide). Legacy `LLC_BI__Covenant__c` = 0.
- Collateral pledge: `LLC_BI__Loan_Collateral2__c` (Collateral Pledged). Legacy `LLC_BI__Loan_Collateral__c` = 0.

### Covenant compliance (extends tool 5, relationship_risk) — relationship + facility grain
- `LLC_BI__Covenant2__c` (definition + latest result): threshold = `LLC_BI__Financial_Indicator_Value__c`,
  actual = `LLC_BI__Last_Evaluation_Value__c`, status = `LLC_BI__Last_Evaluation_Status__c` /
  `LLC_BI__Covenant_Status__c`, `LLC_BI__Frequency__c`, type via `LLC_BI__Covenant_Type__r.Name`. Ties to the
  spread via `LLC_BI__Linked_Spread_Statement_Record__c`. Relationship link `LLC_BI__Account__c` / `Relationship__c -> Account`.
- Junctions: `LLC_BI__Loan_Covenant__c` (Loan ↔ Covenant2), `LLC_BI__Account_Covenant__c` (Account ↔ Covenant2).
- History: `LLC_BI__Covenant_Compliance2__c` (per-period results; `LLC_BI__Covenant__c -> Covenant2`, Status, Evaluation_Date, Approved_By).
- The deterministic grade (threshold x actual, the experience-mcp covenant.js function) reads these. Piedmont:
  4 covenants, all Compliant (DSC 1.42x/1.25x; Debt-to-Worth 2.18/3.0; Liquidity $8.2M/$5.0M; Fixed-Asset-Purchases $1.25M/$7.5M).

### Collateral coverage (extends tool 3, relationship_exposure) — facility grain
- Pledge: `LLC_BI__Loan_Collateral2__c` (Loan ↔ Collateral): `LLC_BI__Advance_Rate__c`, `LLC_BI__Amount_Pledged__c`,
  `LLC_BI__Current_Lendable_Value__c` (value x advance rate), `LLC_BI__Collateral_Value__c`,
  `LLC_BI__Lien_Position__c` (1st/2nd/3rd), `LLC_BI__Pledged_Status__c` (Active/Inactive/Pending),
  `LLC_BI__Is_Primary__c`, `LLC_BI__Abundance_of_Caution__c`, `LLC_BI__Is_Excluded__c`.
- Ownership: `LLC_BI__Account_Collateral__c` (Account ↔ Collateral): `LLC_BI__Collateral_Association__c`
  (Owner/Lienholder/...), `LLC_BI__Ownership_Percentage__c`, `LLC_BI__Primary_Owner__c`, `LLC_BI__Pledging_Authority__c`.
- Asset: `LLC_BI__Collateral__c` (typed via `LLC_BI__Collateral_Type__c`: Real Estate / Titled / UCC; `LLC_BI__Status__c`;
  property-detail sub-objects). Valuation history: `LLC_BI__Collateral_Valuation__c` (`LLC_BI__Value__c`, `LLC_BI__Valuation_Date__c`).
- COVERAGE MATH: use `Current_Lendable_Value` (value x advance rate), not raw value; EXCLUDE pledges flagged
  `Abundance_of_Caution__c` or `Is_Excluded__c` (they do not secure / are out of LTV). Mirrors the package
  rollup discipline: trust the nCino lendable-value fields, do not recompute naively.
- Piedmont: 5 `Loan_Collateral2` pledges (80% advance, 1st lien, lendable to ~$10M; Active/Inactive/Pending)
  + 5 `Account_Collateral` ownership rows (Owner 100% on four assets, 20% on one shared asset).

NET: Piedmont's exposure + collateral coverage + covenant compliance + risk all read REAL structured data.
Only deposits/treasury/profitability are empty (see VALIDATION-AND-DECISIONS.md).
