# Customer 360 MCP — Data Model + Roles, Expert Reference (2026-06-28, Fabian)

Read-only deep-dive of the bankinggpt sandbox (`fabian.goetzens@accenture.com.bankinggpt`, API v64.0,
via `sobject-sf`). Companion to SCHEMA-VERIFIED.md (the six-tool field map). This doc is the data-model
+ role expertise that the persona design sits on. No objects created; everything below is observed.

## 1. Namespace layers (and why they make the server bank-agnostic)
- **nCino** `LLC_BI__*` (managed pkg) + config orgs `nFORCE__*`, `nFORMS__*`, `nDESIGN__*`, OCR `ncinoocr__*`,
  Banking Advisor `nCinoCB__*`. The commercial-lending core: Account-as-borrower, Product Package, Loan,
  Covenant, Collateral, Risk, Deposit, Treasury, Teams.
- **FSC** `FinServ__*` + standard Industries objects (FinancialAccount, AccountAccountRelation,
  ReciprocalRole, Household record type). The relationship/wealth/retail layer.
- **Credit-memo-reinvented** `cm_*` custom fields on standard/nCino objects (e.g. `cm_Household__c`,
  `cm_Portfolio_Manager__c`, `cm_Exposure_Calculation__c`) + `NAICS_Codes__c`, `Compliance_Check__c`, `KYC__c`.
- **Boom mirror** `Boom_*__c` (File, Financial_Statement, Period, Line_Item) — SF-side mirror; live spreads
  still come from the Boom MCP.
- **AGNOSTIC INSIGHT**: `LLC_BI__*` and `FinServ__*` are STANDARDIZED managed-package namespaces, identical
  field API names across every nCino / FSC customer org. A server keyed on those namespaces ports to any
  nCino+FSC bank with zero schema rewrite. The only per-bank variance is (a) the `cm_*` / org-custom fields
  and (b) picklist values / record-type dev-names. So: anchor on managed-package fields; push org-specifics
  (custom fields, RT names, role-name strings, grouping key) into a per-tenant CONFIG MAP. That config map
  is the whole agnostic story.

## 2. Relationship spine + roll-up semantics
Account (borrower/relationship) → `LLC_BI__Product_Package__c` (the deal hub) → `LLC_BI__Loan__c` (facility).
- Package joins to Account via `LLC_BI__Account__c`, `LLC_BI__Primary_Entity__c`, and `cm_Household__c` (all -> Account).
- **Trust the PACKAGE rollups, never naive-sum loans.** Package carries `LLC_BI__TCE__c` (Total Credit
  Exposure), `LLC_BI__TBE__c` (Borrower), `LLC_BI__TOE__c` (Obligor), `LLC_BI__Outstanding__c`,
  `LLC_BI__Total_Loan_Facilities_Amount__c`, plus Direct/Indirect/Affiliated committed+proposed breakdowns.
  Proven on Piedmont: 3 facilities (LOC $5M, Equipment $5M, LOC $7.5M) sum to more than TCE $12.5M because
  of nCino LIMIT/SUBLIMIT structure (`LLC_BI__Is_Limit__c` / `Is_Sublimit__c`). Summing loans double-counts.
- **Exposure exclusions** are explicit: `LLC_BI__Legal_Entities__c.Exclude_From_Account_Exposure__c` /
  `Exclude_From_Product_Package_Exposure__c`. Honor them.
- **Ownership / entity graph** = `LLC_BI__Connection__c` (`Connected_From__c`/`Connected_To__c -> Account`,
  `Ownership_Percent__c`, `Total_Direct_Indirect_Ownership_Percent__c`). Piedmont example: 2 edges, both
  Piedmont <-> "Margaret Holloway" at 100% (sole principal/guarantor). FSC alt = `FinServ__AccountAccountRelation__c`.
- **Facility involvement / guaranties** = `LLC_BI__Legal_Entities__c` (Account ↔ Loan/Package/Deposit with
  Borrower vs Guarantor type, guaranty + contingent amounts).
- **Relationship P&L** = `LLC_BI__Profitability__c` (`Relationship__c -> Account`; NII, deposit/fee/treasury revenue).

## 3. Role + team model (the persona backbone)
THREE layers, all observed live:

### 3a. Org role hierarchy — `UserRole` (sharing + approval chain)
```
CEO
├─ Chief Credit Officer
│   └─ Senior Credit Officer
│       └─ Portfolio Manager
│           └─ Credit Analyst / Underwriter
├─ Commercial Banking Manager
│   └─ Loan Officer
├─ Chief Operating Officer
│   ├─ Loan Operations
│   └─ Loan Ops - DM Reviewer
├─ Credit · nCino Administrator · nCino Data Admin
Relationship Manager      (separate root)
```
This hierarchy IS the record-visibility roll-up (a Portfolio Manager sees their analysts' books) AND the
credit approval ladder (Analyst → PM → Sr Credit Officer → Chief Credit Officer).

### 3b. Deal-team role catalog — `LLC_BI__Role__c` (Type = TEAM_ROLES, 12 values)
Officer · Senior Loan Officer · Loan Officer · Credit · Credit Analyst · Underwriting · Loan Approver ·
Loan Approver Queue · Loan Ops · Compliance · Management · IT.

### 3c. Per-deal / per-facility attachment (who is on THIS deal, in what role)
- `LLC_BI__Product_Package_Team__c`: Package ↔ `LLC_BI__User__c` ↔ `LLC_BI__Assigned_Role__c (-> Role)`.
- `LLC_BI__LoanTeam__c`: Loan ↔ User ↔ Assigned_Role + Team_Role.
- `LLC_BI__Team__c` / `LLC_BI__Team_Member__c`: named reusable teams (User ↔ Team ↔ Role).
- `LLC_BI__Team_Keys__c` / `Team_Key_Role__c`: the TEMPLATE/automation layer that auto-stamps teams by role.

### 3d. Named-officer lookup fields (denormalized role pointers)
- Account: `Bank_Relationship_Manager__c` (RM), `Primary_Officer__c` (Commercial Lending Officer),
  `Secondary_Officer__c` (Trust), `Mortgage_Relationship_Manager__c`.
- Loan: `LLC_BI__Loan_Officer__c`, `cm_Portfolio_Manager__c`, `cm_Credit_Analyst_Underwriter__c`,
  `cm_Loan_Ops__c`, `cm_Closer__c`, `cm_Loan_Assistant__c`.
- Package: `LLC_BI__Primary_Officer__c`, `LLC_BI__Secondary_Officer__c`, `Approver_1__c`, `Approver_2__c`.

### 3e. "Book" derivation (how a persona's portfolio is scoped) — layered, with fallback
1. Team membership: Packages/Loans where a `...Team__c` row has `User = me`.
2. Named officer: Packages/Loans/Accounts where an officer lookup = me.
3. Role-hierarchy roll-up: managers see subordinates' books via UserRole + SF sharing.
NB: all three can be sparse (Piedmont has none set), so the server must degrade gracefully and fall back to
SF record sharing as the security floor. NEVER widen beyond what SF sharing grants the running identity.

## 4. Account landscape (752 accounts)
Business 510 · PersonAccount 123 · IndustriesBusiness 109 · IndustriesHousehold 5 · IndustriesIndividual 1 ·
Lender 1 · (null 3). Two populations: classic `Business` (Piedmont lives here, the hero/curated set) and the
FSC `IndustriesBusiness` "4/22/2025" bulk demo set (skeletal packages, null exposure). Multi-entity grouping
patterns live in the 5 `IndustriesHousehold` accounts (FSC) and the Connection graph (nCino).

## 5. Piedmont anatomy (hero record, Account 001bb00001DLtRMAA1)
- Firmographics POPULATED: "Piedmont Precision Components, Inc.", RT `Business`, Manufacturing, NAICS 332710,
  AnnualRevenue $64.5M (= Boom revenue).
- Deal POPULATED: Package "Piedmont Precision C&I Credit Package" (a5Fbb000000HA1NEAW), Stage "Credit
  Decisioning", Risk Rating 5, TCE/TBE $12.5M, TOE/Outstanding $4.25M. 3 Commercial loans (grade 5;
  maturities 2027 + 2031; limit/sublimit structure).
- Ownership: Margaret Holloway, 100% (sole principal).
- THIN/empty: deal team (0), deposits (0), denormalized Account exposure/deposit/officer rollups (null/0),
  `cm_Household__c`/`ParentId`/`ACNPEX_Relationship__c` (null), relationship risk review / account covenant (unverified, likely 0).

## 6. Data-state map vs cockpit areas
| Area | Real for Piedmont? | Source |
|---|---|---|
| Header firmographics | YES | Account |
| Header exposure/wallet rollups | NO (compute from children) | Package TCE + sum deposits |
| Exposure / facilities | YES (1 pkg, 3 loans) | Product Package + Loan |
| Risk grade | YES (grade 5) | Package.LLC_BI__Risk_Rating__c |
| Ownership graph | YES (1 owner 100%) | LLC_BI__Connection__c |
| Whitespace | YES (1 opp) | Opportunity |
| Deposits / treasury | NO (0) | LLC_BI__Deposit__c / FinServ__FinancialAccount__c |
| Deal team / officers | NO (empty) | Product_Package_Team / officer lookups |
| Profitability | unverified (likely 0) | LLC_BI__Profitability__c |
Implication: Piedmont demonstrates exposure + risk + ownership + whitespace honestly; the $0 wallet is the
headline next-best-action, not a defect. Richer multi-entity/wallet demo needs seeding (out of scope now).

## 7. Security / scalable / agnostic design implications
- **Security floor = SF record sharing.** The MCP reads as (or strictly within) the user's sharing; it never
  returns a record the running identity cannot see. FLS respected field-by-field. Least privilege by default.
- **Entitlement tier = Profile + Permission Set** (nCino Lite Seat / Premium CRM / Standard Platform observed).
  Persona feature-gating layers on top of, never replaces, sharing.
- **Agnostic = managed-package namespace + per-tenant config map** (custom fields, RT dev-names, role strings,
  grouping key, wallet-source preference). No bank-specific field names hardcoded in tool logic.
- **Scalable = config-driven persona → view → permission mapping**, role as data (UserRole + LLC_BI__Role__c),
  server-side aggregation (numbers never through the LLM, per boomFinancials.js), stateless tool calls.

## 8. Open questions carried forward
- Grouping key for the relationship roll-up: `cm_Household__c` vs `ACNPEX_Relationship__c` vs Connection graph
  vs `FinServ__Household__c` (none populated for Piedmont). Pick the convention in the config map.
- Authoritative wallet source: nCino Treasury/Deposit (lean) vs FSC FinancialAccount.
- Whether the MCP runs as the user (true per-user sharing) or a service account with explicit scoping.
