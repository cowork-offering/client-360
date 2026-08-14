# Customer 360 MCP — Validation + Decisions (2026-06-28, Fabian)

Live validation of the identity model, Piedmont's records, the household/relationship graph, and the
authoritative wallet, against the bankinggpt sandbox. Resolves open questions from PERSONAS.md / SCHEMA-VERIFIED.md.

## 1. Identity model — DECIDED + one correction
- **Correction.** The credit memo (experience-mcp) does NOT run as the user. `experience-mcp/src/sfClient.js`
  uses **OAuth 2.0 Client Credentials** (single `SF_CLIENT_ID`/`SF_CLIENT_SECRET` service-account token).
  The `actingUser` threaded through `ncino.js` is an **audit stamp on writes only** (`actorStamp()`), not a
  sharing identity. So the memo runs as a service account and records who acted, for the audit trail.
- **DECISION (Fabian).** Customer 360 runs **AS the user**: per-user OAuth context (the same shape as the
  `sobject-sf` connector already uses), so Salesforce record sharing + FLS are enforced natively by the
  platform on every query. This is a deliberate UPGRADE over the memo, correct for a relationship cockpit
  that reads far more of the customer than a single deal. Plus a **gated admin "god-mode"** (elevated /
  View-All context) for internal + demo use, behind an explicit switch + permission, restricted for real
  users. This resolves the BLOCKING identity precondition. With run-as-user, sections 6.1 to 6.4 of
  PERSONAS.md (sharing floor, FLS-before-aggregation, traversal-level checks) are platform-enforced rather
  than re-implemented; the admin switch is the only path that intentionally bypasses the floor, and it is
  permissioned + audited.

## 2. Piedmont records — VALIDATED (credit seeded; wallet/profitability not)
- nCino credit records PRESENT: Product Package "Piedmont Precision C&I Credit Package" (TCE $12.5M, grade 5,
  Stage Credit Decisioning), 3 Commercial loans (LOC $5M, Equipment $5M, LOC $7.5M; limit/sublimit), 2
  Connection edges, and a real borrower/guarantor structure in `LLC_BI__Legal_Entities__c`:
  - **Piedmont = Borrower**, Entity Type "Operating Company".
  - **Margaret Holloway = Guarantor**, Entity Type "Individual", Guaranty "Amount of Note" (full-note personal
    guaranty). She is a **PersonAccount**, the **100% owner** (Connection, ownership 100%).
- So Piedmont's relationship graph is a real, classic C&I shape: operating-company borrower + 100%-owner
  individual principal giving a full personal guaranty. "Show the household connections" for Piedmont = this
  2-node borrower/guarantor/owner graph. It is not a multi-entity household, but it is a legitimate structure.
- ALSO PRESENT (structured, validated; CORRECTS an earlier "narrative-only" read): **Covenants** = 4
  `LLC_BI__Covenant2__c` records, all Compliant (DSC 1.42x/1.25x, Debt-to-Worth 2.18/3.0, Liquidity
  $8.2M/$5.0M, Fixed-Asset-Purchases $1.25M/$7.5M; match the memo). **Collateral** = 5
  `LLC_BI__Loan_Collateral2__c` pledges (80% advance, 1st lien, lendable to ~$10M) + 5
  `LLC_BI__Account_Collateral__c` ownership rows. NB: the LEGACY objects (`LLC_BI__Loan_Collateral__c`,
  `LLC_BI__Covenant__c`) are EMPTY in this org; use the MODERN `Loan_Collateral2` / `Covenant2`. See the
  SCHEMA-VERIFIED.md Collateral+Covenants addendum.
- ABSENT for Piedmont: nCino Deposits (0), Treasury Services (0), Profitability (0). So wallet + relationship
  P&L are genuinely empty for Piedmont. The "$12.5M credit, $0 operating wallet" next-best-action holds.

## 3. Relationship / ownership graph — authoritative source DECIDED
Org-wide population: **`LLC_BI__Connection__c` = 208 edges** (the populated ownership/relationship graph) vs
**`FinServ__AccountAccountRelation__c` = 8 edges** (sparse). FSC AAR, though sparse, carries richer role
semantics ("Owner", "Household Member", "Household", "Business Owners") than nCino Connection's generic
"Connection" role.
- **DECISION.** `groupingKey` default = the **nCino Connection graph** (it is the populated, authoritative
  ownership model, 208 edges). Where FSC AAR / IndustriesHousehold exist, use them to enrich household-member
  semantics. The `cm_Household__c` / `ACNPEX_Relationship__c` / `FinServ__Household__c` lookups remain optional
  enhancements that light up only when populated (none set for Piedmont).

## 4. Authoritative wallet — VALIDATED, recommendation
Org-wide population: **nCino Treasury Services = 0**, **nCino Deposits = 5** (mostly null, no balances),
**FSC `FinServ__FinancialAccount__c` = 50** (populated, real balances, types Deposit/Savings/Credit Card).
The 50 FSC accounts attach mostly to **PersonAccounts** (Jordan Taylor, Moiz, Janie Doe $59.8M, Alex Jones)
and some **IndustriesBusiness** (Flowers For Dreams $100K, Corner Crumbs), several under FSC Households
(e.g. Timothy Norton Household).
- Conceptually for C&I, nCino Treasury/Deposit is the right wallet source, but it is UNSEEDED here.
- The DEMONSTRABLE wallet in this org is FSC FinancialAccount (retail/wealth + some IndustriesBusiness).
- **RECOMMENDATION.** `deposits_and_treasury` reads BOTH via `walletSource` config, priority
  nCino-commercial-first then FSC, unioned for a complete share-of-wallet. In THIS org the FSC side is what
  lights up. Piedmont stays $0 wallet (the credit-only NBA). A bank with seeded nCino treasury gets the
  commercial wallet automatically; no code change, just the config priority.

## 5. Demo-account map (use both to show the full cockpit)
- **Piedmont Precision Components** = the CREDIT 360: exposure ($12.5M / grade 5), the borrower + 100%-owner
  individual guarantor graph, risk, and the "$0 operating wallet = win the deposits + treasury" next-best-action.
- **Timothy Norton Household** (IndustriesHousehold, `FinServ__TotalBankDeposits__c` = $910,800) = the
  HOUSEHOLD + WALLET 360: a household grouping linking Timothy Norton (PersonAccount, Owner) + Smart Snacks
  (business) via FSC AccountAccountRelation, with FSC FinancialAccounts and real deposit balances. This is the
  live example to demonstrate the entity/household graph and share-of-wallet that Piedmont cannot.
- No seeding required to demo the full cockpit: Piedmont shows credit + the wallet gap, Timothy Norton
  Household shows the populated household + wallet.

## 6. Updated open questions
- (Resolved) Identity model = run-as-user + gated admin mode (Section 1).
- (Resolved) Grouping key default = nCino Connection graph (Section 3).
- (DECIDED, Fabian confirmed) Wallet = both sources via `walletSource`, nCino-first then FSC, unioned; FSC is
  the demonstrable side in this org (Section 4).
- (DECIDED, Fabian confirmed) Demo = Piedmont (credit 360) + Timothy Norton Household (household + wallet 360),
  no seeding required (Section 5).
- (Open) OWD + "Grant Access Using Hierarchies" per object still needs live verification to confirm the
  run-as-user sharing floor actually narrows manager vs leaf books (the sandbox sysadmin login masks it).
- (Open) Admin god-mode: which permission/permission-set gates it, and how the switch is surfaced + audited.

---

## Live verification results (2026-06-28) — resolves spec open questions
- **OWD / sharing (the big one).** Internal sharing model in the bankinggpt sandbox is PERMISSIVE: ReadWrite
  (Public) for `Account`, `LLC_BI__Product_Package__c`, `LLC_BI__Deposit__c`, `LLC_BI__Profitability__c`,
  `LLC_BI__Covenant2__c`, `LLC_BI__Relationship_Risk_Review__c`; `LLC_BI__Loan__c` = Read (Public Read);
  `LLC_BI__Loan_Collateral2__c` = ControlledByParent. CONSEQUENCE: run-as-user sharing does NOT narrow
  visibility in this org (every internal user sees every relationship). Persona book-narrowing is UX, NOT a
  security boundary in the sandbox. Real enforcement needs the bank's production OWD (Private + Grant Access
  Using Hierarchies) or server-side acting-user scope filters. The cockpit presents persona views but must NOT
  claim it enforces least privilege in this org.
- **KYC.** `KYC__c` = 0 rows org-wide (thin object: `Account__c` lookup + Name only). `Compliance_Check__c` = 1
  row org-wide (links to `FinServ__FinancialAccount__c`, Approved/Rejected + reason), none for Piedmont
  (Piedmont has no FSC FinancialAccount). So formal KYC/CDD/sanctions records are unpopulated. The KYC section
  concludes on what exists: beneficial ownership established (Margaret Holloway 100% via `LLC_BI__Connection__c`
  + `LLC_BI__Legal_Entities__c`), with formal KYC/CDD/OFAC "not on file, blocks decisioning until cleared."
  Production clearance comes from the bank's KYC/AML system.
- **Peer cohort.** NAICS 332710 cohort = 1 account (Piedmont only); only 2 accounts org-wide have
  `NAICS_Code__c` populated. No peer cohort in the sandbox. The margin/peer baseline is an illustrative
  CapIQ/IBIS capability, labeled as such, never a fabricated sandbox median.
