# Customer 360 — The Customer & Household Construct (2026-06-28, Fabian)

The correction that reframes the cockpit: the **customer is the relationship / obligor group**, not a single
Account and not a single deal. The deal (one Product Package) is ONE facet of the customer. The cockpit centers
on the whole connected group: the operating entity, its owners and principals, guarantors, affiliated
companies, subsidiaries, and the household. Exposure, wallet, risk, KYC, and profitability all roll up at the
group / obligor grain. Verified live against the bankinggpt sandbox.

## Two co-resident models for "who is the customer"

### A. nCino — the commercial / obligor lens (primary for C&I)
- **`LLC_BI__Connection__c`** = account-to-account relationships, the relationship graph. `Connected_From__c` /
  `Connected_To__c -> Account`, `LLC_BI__Ownership_Percent__c`, `Total_Direct_Indirect_Ownership_Percent__c`,
  role via `LLC_BI__Connection_Role__c`.
- **`LLC_BI__Connection_Role__c`** = a 35-role catalog. Ownership/structure: **Beneficial Owner, Owner,
  Co-Owner, Parent, Subsidiary, Affiliated Company, Company**. Household/personal: **Household, Household
  Member, Spouse, Life Partner, Child, Sibling**. Management: **Officer, Manager, Employee, Employer**.
  Plus Business Partner, Service Provider, Client, etc. THIS is the relationship taxonomy that defines the group.
- **`LLC_BI__Legal_Entities__c`** = per-facility involvement: who is **Borrower** vs **Guarantor** on each
  Loan/Package, with `Guaranty_Amount__c`, `Contingent_Amount__c`, and `Exclude_From_Account_Exposure__c` /
  `Exclude_From_Product_Package_Exposure__c`.
- **Obligor exposure rollup**: nCino aggregates exposure across the connected group, `LLC_BI__TBE__c` (Total
  Borrower Exposure) and `LLC_BI__TOE__c` (Total Obligor Exposure) vs `LLC_BI__TCE__c` (Total Credit Exposure).
  The group, not the single facility, is the exposure unit.
- **Grouping keys**: `Product_Package.cm_Household__c -> Account`, `Account.ACNPEX_Relationship__c -> Account`,
  `Account.ParentId` (legal hierarchy). All optional / config (none set for the Piedmont example).
- **Data state (this sandbox)**: the model is rich, the seeded data is SHALLOW. All 208 `Connection` rows use
  the generic role "Connection" (not the taxonomy), max 2 edges per account. So the rich relationship taxonomy
  is a MODEL capability to demonstrate, with the live signal being ownership % (e.g. a 100% owner/guarantor).

### B. FSC — the relationship / household / wealth lens
- A **Group / Household is an Account** (record type `Household` / `IndustriesHousehold`). The household IS a
  record, not a field.
- **Members attach to the group**:
  - `AccountContactRelation` (people): `FinServ__Primary__c` (primary member), `FinServ__PrimaryGroup__c`
    (this is the member's primary group), `FinServ__IncludeInGroup__c`, `FinServ__Rollups__c` (what rolls up:
    Financial Accounts, Assets & Liabilities, Opportunities, Goals, ...).
  - `FinServ__AccountAccountRelation__c` (related accounts): reciprocal roles via `FinServ__ReciprocalRole__c`
    (**Household / Household Member**, **Business / Owner**, Parent / Child, Advisor / Client, Director).
- **Roll-ups to the group**: financial accounts, balances, A&L, opportunities roll up to the household Account
  (`FinServ__TotalBankDeposits__c`, etc.). This is the FSC "total household 360".

## The synthesis: how the cockpit assembles the customer
The commercial Customer 360 customer = the **obligor / relationship group**, assembled primarily from the
**nCino** side (Connection graph + Legal Entities + obligor exposure rollup: owners, guarantors, affiliates,
subsidiaries), and **enriched by the FSC Household / Group** where it exists (members + the deposit/wealth
roll-up). One customer can be expressed both ways in the same org; the cockpit reconciles them:
1. Anchor on the subject Account.
2. Walk `LLC_BI__Connection__c` (ownership/role) + `LLC_BI__Legal_Entities__c` (borrower/guarantor) to build
   the obligor group; honor the exclusion flags; roll exposure at TBE/TOE grain.
3. Overlay the FSC Household/Group (AccountContactRelation + AccountAccountRelation + financial-account
   roll-ups) for the people, the household, and the wallet.
4. The `groupingKey` config (`cm_Household__c` | `ACNPEX_Relationship__c` | `FinServ__Household__c` |
   Connection-graph) selects the authoritative grouping per tenant; the Connection graph is the default.

## What this means for the cockpit (the reframe)
- The **entity & ownership graph and the group roll-up are the CENTER**, not the deal. The header verdict is
  about the CUSTOMER (the group): who they are, the whole exposure across the group, the wallet across the
  group, the risk across the group, and the next move. The deal is a drill-in, one facet.
- Everything aggregates at the **group / obligor grain** (exposure TBE/TOE, wallet, risk, KYC beneficial
  ownership, profitability), not the single facility.
- **KYC is a customer/group property**: beneficial ownership (Connection: Beneficial Owner / Owner %),
  CDD on the principals, sanctions on every party in the group, not just the borrower.

## Illustrative examples (references, not the subject)
- **A single-entity C&I borrower** (example: Piedmont Precision Components): operating company + one 100%
  individual owner who is also the full-note guarantor. The simplest group: 2 nodes. Shows ownership +
  guaranty + obligor exposure with no deposit/household depth.
- **An FSC household** (example: Timothy Norton Household): a Household Account grouping a primary member
  (Timothy Norton) + a member (Alex Jones) + a related business (Smart Snacks) with financial accounts
  ($910,800) rolling up. Shows the people, the household, and the share-of-wallet roll-up.
These are illustrations of the construct; the cockpit is generic and works for any relationship group.

## Active deals, modifications, and maintenance — the in-flight relationship (Fabian, 2026-06-29)
The Customer 360 is **not** a static snapshot of booked exposure; it includes the relationship's **in-flight
work**, all co-resident in the same org and rolled up at the group grain:
- **Active / pipeline deals** — `LLC_BI__Product_Package__c` by `LLC_BI__Stage__c` (Piedmont sits at
  "Credit Decisioning"). Packages in pre-booking stages are the live origination / expansion pipeline on the
  relationship. (Sandbox: stage populated on 1 of 518 packages; the field is the hook, the data is shallow.)
- **Modifications** — `LLC_BI__Loan_Modification__c`: rate reductions, payment deferrals, amount
  increase/decrease, amortization extensions, interest-only. `Mod_Type` (Notification | Approval),
  `Modification_Type`, `Owner` (Credit / Servicing / Loan Ops / Compliance / Finance), `Status`
  (New → Under Review → Approved / Rejected / Recalled), `New_Amount`, `New_Rate`, `Effective_Date`,
  link to `LLC_BI__Loan__c`. (Sandbox: 0 rows; rich model.)
- **Renewals** — `LLC_BI__LoanRenewal__c` (**43 live**): a revisioned clone of a loan/package
  (`ParentLoanId`, `Original_Product_Package__c`, `RevisionNumber/Status`, `PreviousVersionStage/Status`,
  `HasActiveRenewalLoan`). Its child `LLC_BI__Credit_Memo_Modifcation__c` ties the renewal to a credit memo.
- **Servicing maintenance** — AFS (revolver utilization, payment history) + nCino covenant tests / exceptions /
  ticklers = the ongoing monitoring grain.
These belong in the 360 because RM / PM / Servicing personas live in the in-flight work: what is renewing this
quarter, which modifications are mid-approval, which packages are stuck in stage. The cockpit shows the
relationship as a moving book, not a frozen balance.

## The credit memo is a co-resident SOURCE, not a layer (Fabian, 2026-06-29)
The deal-level credit memo and the Customer 360 are **co-existing peers on one Product Package + Account
spine**, not a stack where one sits beneath the other. Two facts settle it:
1. **They share the org and the spine.** The memo's content lives in nCino — the `cm_*` Product-Package
   narrative fields and the `LLC_BI__Credit_Memo__c` / `LLC_BI__Credit_Memo_Modifcation__c` objects — the same
   place the 360 reads. The memo zooms into one deal's underwriting; the 360 zooms out to the whole group.
   Neither contains the other.
2. **The memo is a SOURCE the 360 consumes**, exactly like Boom / AFS / Snowflake / IBIS. It produces: the rating
   recommendation + rationale, covenant analysis / grades, the underwriting narratives (background, financials,
   collateral, risk), and the decision + attestation (logged to the Snowflake ledger via experience-mcp). The
   360 surfaces those as the relationship's credit history and verdict ("last underwrite concluded 5 Pass/Watch
   because…"). Conversely the memo pulls relationship context (group exposure, wallet, household) from the 360
   side. They feed each other — hand in hand.
So in the data-flow the credit memo sits **alongside** the other fleet sources feeding the 360, not as a layer
beneath it. The Live Portfolio Dashboard is the book-level entry; the Customer 360 and the credit memo are
co-equal working surfaces over the shared spine. (This corrects the earlier "Dashboard → 360 → Memo" nesting:
the memo co-exists and contributes, it is not a drill-down tier.)
