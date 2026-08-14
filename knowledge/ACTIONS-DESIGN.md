# Customer 360 v2 — Apex Actions Design Basis

**Status:** RESEARCH COMPLETE → design-ready. No code written, no org mutated.
**Date:** 2026-07-25
**Method:** nCino product documentation (Admin Digital Partner knowledge MCP) + live read-only
reconnaissance of the `bankinggpt` sandbox (sobject-sf MCP + `sf` CLI Tooling API).
**Discipline:** every doc claim carries an article Title + Map ID. Every org claim carries the query
or describe call that produced it. No object or field name appears here unless it was read verbatim
from a describe, a SOQL result, or a documentation article. Inferences are marked `[INFERRED]`.
Anything neither source could answer is in §7 UNKNOWNS — never guessed.

---

## 0. Org identity — verified before any org work

| Check | Call | Result |
|---|---|---|
| User | `mcp__sobject-sf__getUserInfo` | `fabian.goetzens@accenture.com.bankinggpt`, System Administrator, `005bb00000ftouDAAQ` |
| Org | `SELECT Id, Name, OrganizationType, InstanceName, IsSandbox FROM Organization` | `00DDz000001qeO2MAI` · **Project Buzz - FS** · Unlimited Edition · `USA870S` · IsSandbox `true` |
| CLI | `sf org list --json` | alias `bankinggpt` → same org id, `connectedStatus: Connected`, API 67.0 |

Both the MCP data path and the CLI metadata path target the **same** org. Every finding below is
bankinggpt-specific unless explicitly labelled otherwise. No findings from any reference org are mixed in.

> **Describe caveat.** All describes ran as System Administrator. `createable` / `updateable` flags are
> FLS-scoped to the running user. A dedicated integration user will see a **narrower** write surface.
> Re-run the write-contract describes as the actual service identity before shipping Apex.

---

## 1. What a "credit action" actually is in nCino

### 1.1 Canon

nCino's term for the family {Renewal, Modification, Extension, No Action} is **Credit Actions**. It is
not a record type and not a status — it is a **clone-and-link operation**.

Canonical mechanism, verbatim from *How to Configure Loan Renewals and Loan Modifications*
(Map ID `oI2xyBwwnmByAdYBQ~1KCg`), section "Background Process":

> 1. Clones the loan record.
> 2. On the newly created renewal loan, it sets the IsRenewal checkbox to True. On the newly created
>    modification loan, it sets the Is_Modification checkbox to True.
> 3. On the original loan, it sets the HasRenewal checkbox to true.
> 4. Additionally, the system creates a LoanRenewal record. The LoanRenewal object is a junction between
>    the original parent loan and the new renewal loan… The record keeps track of the revision number,
>    and also controls the status of the original loan. The default status is Superseded on closing or
>    booking the renewal or modification.

**Loan-level vs relationship-level — this matters for us.** The same article scopes itself explicitly:

> "This document explains the modification and renewal process for **Small Business and Retail** loans,
> where the credit action occurs at the loan level. You can also use renewals and modifications at the
> **relationship level**."

For commercial (our case — Piedmont sits under a Product Package), the canonical surfaces are
*How to Use Credit Actions on Product Package* (`oCOdPaJSYrwRfbKN2zNqFg`) and *How to Use Credit Actions
on Relationship* (`hMOsocYqmJ~VN~rsb7M6pQ`), configured by *How to Configure Credit Actions*
(`4CyghpwbWZ33uzVu8XlJAg`).

### 1.2 The documented API surface (the real integration points)

This is the single most valuable Phase-1 finding: nCino ships **supported programmatic entry points**
for credit actions. We should call these rather than hand-rolling the clone.

| Entry point | Type | Purpose | Source |
|---|---|---|---|
| `nFORCE.CallableApi_v1` | `Callable` | General service gateway: `Type.forName('nFORCE.CallableApi_v1').newInstance().call(service, Map<String,Object>)`. Supports a `verify` action to probe availability. | *How to Use the nCino Callable API*, `sM2rPFyKry939TyfPon1rw` |
| `InvocableCreditActionXPkg` | Invocable Apex | Bulk Renewal / Modification across many loans | *How to Use Credit Actions APIs*, `KZlO8zPTPLg~nBTN~dzx8w` |
| `CreditActionSoaXPkg` | Cross-package service | Credit actions for booked loans on a Product Package; takes Package Id + list of (Booked Loan Id, action) | same |
| `Create Credit Review` | Flow Action | Opens a `LLC_BI__Review__c`. Inputs: Account Id, Review Type, Loan Ids, Mode (`All`/`Non-reviewed`), Borrower Types | `4CyghpwbWZ33uzVu8XlJAg` |
| `nFORMS__HTMLToPDFServiceInvoker` | Flow Action | Renders + files a credit memo. Inputs: Form Template Id, Notified Users, **Placeholder Id**, Record Id, Comments | *How to Configure Autosave Credit Memo to Document Manager*, `2MUAdtYMUz3auysumZvFoQ` |
| `NDOC.DocumentManagerService.initializeDocumentManager(loanId)` | Apex | Supported placeholder init. **Not bulkified — one loan per call.** | PDI-00023412, `a2BPY00000iiGJ32AM` |
| `LLC_BI.CovenantComplianceBatchUpdater` | Batchable | Force covenant compliance generation | *Summary of nCino's Covenant Automation…*, `kAHHu000000XZRJOA4` |
| `nFORCE.ExecutionContext.containsContext('CREDIT_ACTION')` | Context check | The ONLY supported credit-action bypass hook. **Apex-only — VRs and Flows cannot read it.** | *How to Implement Credit Action Bypass for Custom Code*, `kAHPY0000003PjR4AU` |

**Design consequence:** `approve_loan_modification` and `approve_renewal` should delegate to
`InvocableCreditActionXPkg` / `CreditActionSoaXPkg`, not re-implement cloning. Hand-rolling the clone
means re-implementing `*_Relatives_to_Clone` config, the LoanRenewal junction, revision numbering, and
the Superseded cascade — all of which nCino already does and all of which have documented failure modes
(§6).

### 1.3 Org reality — the clone model is confirmed, the record-type model is refuted

Query: `SELECT Id, Name, DeveloperName, SobjectType, IsActive FROM RecordType ORDER BY SobjectType, DeveloperName`

`LLC_BI__Loan__c` has **five** record types, only **two active**:

| DeveloperName | Active |
|---|---|
| `Commercial_Loan_Record_Type` (`012bb000000NfLpAAK`) | ✅ |
| `Consumer_Loan_Record_Type` (`012bb000001RnbxAAC`) | ✅ |
| `Start`, `Test_Product_Type_1`, `Test_Product_Type_1v2` | ❌ |

> **There is no Modification record type and no Renewal record type.** Any design that says
> "insert a Loan with the Modification record type" is wrong. Modification/renewal is a **flag pair +
> junction row**, exactly as canon describes.

Query: `SELECT COUNT() FROM <obj>` per object.

| Object | Rows | Read |
|---|---|---|
| `LLC_BI__LoanRenewal__c` | **43** | the live credit-action chain |
| `LLC_BI__Loan_Modification__c` | **0** | exists, **entirely unused** — do not model modification here |
| `LLC_BI__Loan__c` | 536 | |
| `LLC_BI__Product_Package__c` | 518 | |
| `LLC_BI__Covenant2__c` | 633 | modern covenants, heavily populated |
| `LLC_BI__Covenant_Compliance2__c` | 140 | the evaluation records |
| `LLC_BI__Collateral__c` | 760 | |
| `LLC_BI__Collateral_Valuation__c` | **0** | valuation history object exists, **never used in this org** |
| `LLC_BI__Loan_Collateral2__c` | 8 | the live pledge junction |
| `LLC_BI__Loan_Collateral__c` | **0** | legacy, dead |
| `LLC_BI__Review__c` | 3 | |
| `LLC_BI__Annual_Review__c` (label "Risk Rating Review") | 1 | |
| `LLC_BI__Credit_Memo__c` / `_Screen__c` / `LLC_BI__Credit_Decision__c` / `LLC_BI__Credit_Analysis_Summary__c` | **0, 0, 0, 0** | the entire nCino credit-memo object family is unused |
| `LLC_BI__Spread__c` | **0** | but `LLC_BI__Spread_Statement_Record__c` = 2,433 |

Org-wide flag counts:
`isRenewal = true` → **3** · `Is_Modification = true` → **15** · `hasRenewal = true` → **19** ·
LoanRenewal rows → **43**. **Modifications outnumber renewals 5:1, and both ride the object named
`LoanRenewal`.**

### 1.4 The lineage trap

Query on Piedmont's three loans returned `LLC_BI__ParentLoan__c` = **null** and
`LLC_BI__OriginalParentLoan__c` = **null** on all three — even though one carries `hasRenewal = true`
and another `Is_Modification = true`.

> **Lineage is NOT on the Loan self-lookups in this org.** It lives only in
> `LLC_BI__LoanRenewal__c.LLC_BI__ParentLoanId__c → LLC_BI__RenewalLoanId__c`, anchored by the *text*
> field `LLC_BI__RootLoanId__c`. Any availability predicate or chain-walk that reads `ParentLoan__c`
> will find nothing and silently report "no modification history".

Piedmont's actual chain
(`SELECT … FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__ParentLoanId__c IN (…) OR LLC_BI__RenewalLoanId__c IN (…)`):

| | RL-00000191 | RL-00000192 |
|---|---|---|
| ParentLoanId | LoC $5M `a4Zbb000001vavpEAA` | LoC $5M `a4Zbb000001vavpEAA` |
| RenewalLoanId | **itself** (anchor row) | LoC $7.5M `a4Zbb000001zEQTEA2` |
| RevisionNumber | 0 | 1 |
| RevisionStatus | `Available` | `Superseded` |
| PreviousVersionStage / Status | `Booked` / `Open` | `Final Review` / `Open` |
| HasActiveRenewalLoan | false | **true** |

Note revision 0 is a **self-referential anchor row**. A naive "find the child" join must exclude
`ParentLoanId == RenewalLoanId` or it will report a loan as its own modification.

---

## 2. BANK RULES DISCOVERY SCAN — bankinggpt

*Structured as the output of an automated org scan (object → rules → implications). See §8 for why this
section is a product capability, not a one-off.*

### 2.1 Scan coverage

| Layer | Method | Result |
|---|---|---|
| Validation rules | `sf data query … FROM ValidationRule` (Tooling), then per-rule `sf api request rest /tooling/sobjects/ValidationRule/<Id>` for `Metadata.errorConditionFormula` | **169 org-wide**, 41 on in-scope objects |
| Apex triggers | `sf data query … FROM ApexTrigger` (Tooling) | **396 org-wide**, 40 on in-scope objects |
| Record-triggered flows | `sf data query … FROM FlowDefinitionView WHERE IsActive = true` (standard API, **not** tooling) | **600 active defs**, 53 record-triggered, **19 on in-scope objects** |
| Workflow rules | `FROM WorkflowRule` (Tooling) + per-rule metadata | 87 org-wide; **only 3 active**, none blocking |
| Custom permissions | `FROM CustomPermission` + `SetupEntityAccess` + `PermissionSetAssignment` (**standard API — these are NOT tooling objects in this org**) | 182 perms; 3 bypasses found |

> **CLI quirks that cost time — record them for the scanner.** (a) `sf` prints an update warning to
> stderr that corrupts JSON piping → always `2>/dev/null`. (b) Filtering `ValidationRule` by
> `EntityDefinitionId` in a WHERE clause returns 0 rows, and selecting `Metadata` in bulk returns 0 rows
> → query all, filter client-side, then fetch each by REST. (c) `CustomPermission` and
> `SetupEntityAccess` reject `--use-tooling-api`. (d) `EntityDefinition.Id` returns a dummy
> `000000000000000AAA` — use `DurableId`.

### 2.2 The bypass architecture — the single most design-relevant finding

Three custom permissions exist, each granted by exactly one standalone permission set, by **zero** profiles:

| Custom Permission | Id | Granting perm set | Current active holder |
|---|---|---|---|
| `LLC_BI__Exclude_Validation` | `0CPbb0000002ENMGA2` | `Exclude_Validation` | `dataservices@accenture.com.bankinggpt` |
| `LLC_BI__Exclude_Flow` | `0CPbb0000002ENKGA2` | `Exclude_Flow` | same |
| `LLC_BI__Exclude_Trigger` | `0CPbb0000002ENLGA2` | `Exclude_Trigger` | same |

**Our service user CAN be granted these** — one `PermissionSetAssignment` insert each, no profile edit,
with working precedent already in the org (`nCino Data Services`).

But the bypass is **not uniform**, and that asymmetry is the whole design:

| Layer | Bypassable? |
|---|---|
| Validation rules on `LLC_BI__Loan__c` | **YES** — 18 of 18 active rules end with `NOT($Permission.LLC_BI__Exclude_Validation)` |
| Validation rules on Covenant, Collateral Type, Collateral Pledged, Review, Risk Rating Review, Entity Involvement | **NO** — not one references `$Permission`. Hard walls. |
| Record-triggered flows | **MOSTLY** — most gate on `{!$Permission.LLC_BI__Exclude_Flow} = FALSE` (or `Exclude_Trigger` for Product Package) |
| 3 specific flows | **NO** — `nCino Baseline - Loan After Save`, `ACNPEX_Covenant Mgmt Calculation Logic Update`, `PPCacheCreation` carry no bypass token and always fire |
| nCino managed triggers | **NO** documented data-layer bypass; only the Apex-context check `nFORCE.ExecutionContext.containsContext('CREDIT_ACTION')`, which VRs and Flows cannot read |

Global scan: only **21 of 169** validation rules reference `$Permission`, and 18 of those are on Loan.

> **Doctrine consequence.** `Exclude_Validation` is a **Loan-shaped tool**. Granting it to the service
> user unlocks Loan stage movement and nothing else in our scope. Every covenant, collateral, review and
> entity-involvement rule applies to us exactly as it applies to a banker. **That is correct and we
> should not fight it** — those are the bank's credit-policy rules, and an agent that could bypass them
> would be an SR 11-7 problem, not a feature.

### 2.3 Object → rules → implications

#### `LLC_BI__Loan__c` — 28 VRs (18 active), 6 triggers, 5 flows

Active stage-gate rules, all bypassable via `Exclude_Validation`. **All fire on a specific
`PRIORVALUE → new` transition**, so they only bite on the exact hop:

| Rule | Transition | Requires |
|---|---|---|
| `Loan_Validation_11` | Qualification → Proposal | `LLC_BI__Amount__c` |
| `Loan_Validation_12` | Qualification → Proposal | `LLC_BI__Loan_Detail__r.LLC_BI__Primary_Loan_Purpose__c` (**child record**) |
| `Loan_Validation_13` | Qualification → Proposal | `LLC_BI__Loan_Detail__r.LLC_BI__Application_Method__c` (**child record**) |
| `Loan_Validation_14` | Qualification → Proposal | `LLC_BI__Loan_Officer__c` |
| `Loan_Validation_15` | Proposal → Credit Underwriting | `Primary_Source_of_Repayment__c` |
| `Loan_Validation_16` | Proposal → Credit Underwriting | `LLC_BI__Term_Months__c` |
| `Loan_Validation_17` | Proposal → Credit Underwriting | `LLC_BI__Amortized_Term_Months__c` |
| `Loan_Validation_18` | Proposal → Credit Underwriting | `LLC_BI__CloseDate__c` |
| `Loan_Validation_05` | → Booked | `LLC_BI__lookupKey__c` (message says "Loan Number", formula tests `lookupKey`) |
| `Loan_Validation_10` | in post-approval stages | `LLC_BI__Is_Review_Ready__c` must be `false` |

The two that shape the whole approve-side design:

```
Loan_Validation_06  (ACTIVE)
AND( OR( PRIORVALUE(Stage) ∈ {Qualification, Proposal, Credit Underwriting, Final Review} )
     && Stage ∈ {Processing, Doc Prep, Closing, Boarding, Booked}
     && $Permission.LLC_BI__Exclude_Validation = FALSE )
→ "You Cannot Manually Change the Loan to a Post Approval Stage. The Loan Must be Approved by
   pressing the 'Submit for Approval' Button at the top of the page. - LV06"
```

```
Cannot_Check_More_Than_One_Loan_Type  (ACTIVE, NO bypass)
AND( LLC_BI__isRenewal__c = true, LLC_BI__Is_Modification__c = true )
→ "A loan can be a renewal OR a modification.  It cannot be both."
```

**Implications.**
1. Without `Exclude_Validation`, an action can only move a loan **within** pre-approval stages
   (Qualification → Proposal → Credit Underwriting → Final Review). Crossing into
   Processing/Doc Prep/Closing/Boarding/Booked is blocked. This is exactly the fence we want:
   **`stage_*` moves within pre-approval; `approve_*` must go through the approval process, not a
   stage write.**
2. `Cannot_Check_More_Than_One_Loan_Type` has **no bypass** — the renewal/modification flags are
   mutually exclusive at the data layer for everyone. Our tools must pick one.
3. Rules 12/13 dereference `LLC_BI__Loan_Detail__r`. The flow
   `nCino Baseline - Record Trigger: Loan Detail Creation Async` creates that child **asynchronously**,
   so it does not exist in the insert transaction. **A freshly cloned loan cannot pass
   Qualification → Proposal in the same transaction it was created.**

Notable **inactive** rules (do not design around them, but know they can be switched on):
`Loan_Validation_09` ("This Loan has been Superseded and cannot be edited") and `Loan_Validation_04`
(blocks manual move to Approval / Loan Committee). Both are currently **off** in bankinggpt — nCino's
docs flag LV-09 as a classic renewal blocker (`kAHHu000000XaL9OAK`), so its being off is a
bankinggpt-specific relaxation.

Triggers on Loan: `LLC_BI.LoanTrigger` (all 6 contexts), `nCino.LoanTrigger`, `nCRED.loan_BeforeInsert`,
`nCRED.loan_BeforeDelete`, `nCRED.loan_AfterDelete`, `NDOC.loan_AfterUpdate`. **Zero local triggers.**
All managed bodies return `(hidden)` — they are thin dispatchers (62–362 chars) `[INFERRED from length]`.

> **A single Loan insert wakes 3 triggers + 5 flows = 8 automation entry points**, two of which mutate
> the record before save. Bulkify or die.

Flow side effects worth naming (from flow `Description` fields):
- **`nCino Commercial - Loan After Save`**: "On Loan Stage Change: Booked stage sends **email alert**;
  Processing Stage updates any Under Review Memo to **Approved**." → writing Loan stage can fire outbound
  email and silently approve a memo.
- **`ACNPEX_ AccountOwnerAsLoanOfficer`** (local, unmanaged, before-save): overwrites Loan Officer from
  the Account owner.

#### `LLC_BI__LoanRenewal__c` — 0 VRs, **0 triggers, 0 flows**

> Nothing validates or back-fills this object. Every field — including the two free-text
> `PreviousVersion*` strings — is entirely our code's responsibility, and a malformed row fails
> **silently** rather than being corrected. This is the highest-consequence unguarded surface in scope.

#### `LLC_BI__Review__c` — 2 VRs, both **local `cm_` = BANK rules**, both hard walls

```
Review_Validation_01  (ACTIVE, NO permission bypass)
AND( OR(ISNEW(), ISCHANGED(cm_Review_Stage__c)), ISPICKVAL(cm_Review_Stage__c, "Approval"), TRUE )
→ "You Cannot Manually Change the Review Stage to Approval… Press the 'Submit for Approval' Button - RV01"

Review_Validation_02  (ACTIVE)
AND( ISPICKVAL(cm_Review_Stage__c,'Complete'), ISBLANK(cm_Approved_Date__c), …,
     $User.No_Validation__c = False )
→ "You Cannot Manually Change the Review to a Post Approval Stage - RV02"
```

**Implications.** `cm_Review_Stage__c = 'Approval'` can NEVER be set via API by anyone — the formula has
no escape at all. RV02's escape is `$User.No_Validation__c`, a **User custom checkbox** (a different
bypass mechanism than the Loan rules use); `SELECT COUNT(Id) FROM User WHERE No_Validation__c = true AND
IsActive = true` → **0**. Nobody holds it.

> A "complete the annual review" action **cannot** drive `cm_Review_Stage__c` to Approval. It must stage
> the narrative and hand off to the org's approval process.

#### `LLC_BI__Annual_Review__c` (Risk Rating Review) — 1 VR, hard wall

```
Mandatory_comment  (ACTIVE, NO bypass)
LEN(LLC_BI__Comments__c) == 0 && LLC_BI__Overridden_Risk_Grade_Value__c > 0
→ "Please add a comment before overriding the computed risk grade value."
```
Plus: **`LLC_BI__Final_Risk_Grade__c` is a FORMULA** — the final grade cannot be written. Only the
inputs (`LLC_BI__Computed_Risk_Grade_Value__c`, `LLC_BI__Overridden_Risk_Grade_Value__c`,
`LLC_BI__Override__c`, and the `*_actual__c` / `*_RG__c` score pairs) are writable.

Flow `nCino Commercial - Risk Rating (Annual) Review After Save`: "Updates Loan Risk Rating and Status
on Risk Rating" — **writes back onto Loan**. Gated on `Exclude_Flow` + Product Line = Commercial.

#### `LLC_BI__Loan_Collateral2__c` (Collateral Pledged) — 3 VRs, 2 active, no permission bypass

```
Pledge_More_Than_Lendable_Value  (ACTIVE)
AND( LLC_BI__Amount_Pledged__c > LLC_BI__Current_Lendable_Value__c, LLC_BI__Authorize__c == false )
→ data-level escape: set LLC_BI__Authorize__c = true in the same write

Advance_Rate_Override  (ACTIVE)
AND( NOT(ISBLANK(LLC_BI__Advance_Rate_Override__c)) || (…== 0), ISBLANK(LLC_BI__Override_Reason__c) )
→ requires LLC_BI__Override_Reason__c
```

#### `LLC_BI__Covenant2__c` — 1 VR

`Template_Covenants_Cannot_Be_Active` (ACTIVE, no bypass):
`AND(LLC_BI__Is_Template__c = true, LLC_BI__Active__c = true)`.

Flow **`ACNPEX_Covenant Mgmt Calculation Logic Update`** (local, unmanaged, **no bypass token — always
fires**) auto-populates `Calculation_Logic__c` when `Acnpex_Category__c = 'Financial Indicators'`.

#### `LLC_BI__Covenant_Compliance2__c` — **0 VRs**, but an approval workflow

Flow **`acnpex_covenantApprovalProcess`** is `ProcessType = ApprovalWorkflow`, RecordAfterSave, local/unmanaged.
**An approval chain fires on covenant compliance writes.** Plus 3 triggers
(`LLC_BI`, `nCino`, `nCRED.covenantCompliance_BeforeUpdate`).

#### `LLC_BI__Legal_Entities__c` (Entity Involvement) — 5 VRs, 4 active, no bypass

Arithmetic guards on `LLC_BI__Contingent_Amount__c` / `LLC_BI__Ownership__c`. Plus flow
`Entity Involvement Before Save`: "If borrower type is guarantor household or borrower household,
contingent amount will be set to null" — **silently nulls our write**.

#### Objects with **zero active validation rules** (open surfaces)

`LLC_BI__Product_Package__c` · `LLC_BI__Covenant_Compliance2__c` · `LLC_BI__Loan_Covenant__c` ·
`LLC_BI__Account_Covenant__c` · `LLC_BI__Collateral__c` · `LLC_BI__Collateral_Valuation__c` ·
`LLC_BI__Loan_Collateral_Aggregate__c` · `LLC_BI__LoanRenewal__c` · `LLC_BI__Review_Loan__c` ·
`LLC_BI__Review_Account__c` · `LLC_BI__LLC_LoanDocument__c` · `Case` · `LLC_BI__Credit_Memo__c` (2 rules, both inactive).

Risk on these is **flow side-effects and approval workflows, not validation**.

#### Local (client-built) automation — the bank's own layer

7 local triggers org-wide; **exactly 1 on an in-scope object**:

**`ProductPackageBaselineCaptureTrigger`** — `LLC_BI__Product_Package__c`, after insert, Active, 855 chars.
Body read in full: enqueues `LoanMomentumBaselineCaptureQueueable(ppIds)`; its own comment says it
*"finds the proposed loan linked to this PP → finds the existing loan via **LoanRenewal** records →
captures baseline values for all shared collaterals, asset collaterals, and covenants."*
The enqueue is wrapped in try/catch and **failure is swallowed to `System.debug`**.

> There is already client code that walks the LoanRenewal junction to pair proposed↔existing loans.
> **Read `LoanMomentumBaselineCaptureQueueable` before building a second traversal.** It runs async, so
> baselines are not readable in the same transaction, and a broken capture looks like success.

Local unmanaged flows (Accenture-built, `ACNPEX_`/`acnpex_` prefix):
`ACNPEX_ AccountOwnerAsLoanOfficer` (Loan) · `ACNPEX_Covenant Mgmt Calculation Logic Update` (Covenant2) ·
`acnpex_covenantApprovalProcess` (Covenant Compliance) · `ACNPEX_RelationshipManagerNotesAnalysisFlows`
(Account) · `acnpex_Account_Field_Update` (Account) · `PPCacheCreation` (Product Package).
**17 of 19 record-triggered flows in scope are `ManageableState = unmanaged`** — the policy layer here is
bespoke and will NOT match stock nCino documentation.

---

## 3. Where docs and org DIVERGE

The org is a demo sandbox. These gaps are real and must not be papered over.

| # | Canon says | bankinggpt reality | Consequence |
|---|---|---|---|
| 1 | Modification/renewal via Credit Actions on Package/Relationship | `LLC_BI__Loan_Modification__c` = **0 rows**; all 43 chain rows in `LLC_BI__LoanRenewal__c` | Model both actions on LoanRenewal. Ignore Loan_Modification. |
| 2 | Loan lineage via parent lookups | `ParentLoan__c` / `OriginalParentLoan__c` **null** on all Piedmont loans | Chain-walk must use the junction, not the lookups |
| 3 | `LLC_BI__Collateral_Valuation__c` maintains valuation history | **0 rows** — never used in this org | No precedent, no seeded data. Valuation action ships into an empty object. |
| 4 | Covenants attach to Loan via `LLC_BI__Loan_Covenant__c` | Piedmont has 4 covenants, **all Account-level, ZERO loan junction rows** | A loan-centric covenant query returns **nothing** for the flagship demo account |
| 5 | Credit memo = nFORMS template + DocMan placeholder | Entire `LLC_BI__Credit_Memo__c` family **empty**; memo lives in `cm_*` long-text fields on Product Package | Our memo action writes `cm_*` fields, not nCino's memo objects |
| 6 | `LLC_BI__Stage__c` on Product Package ∈ {Pending, In Review, Complete} | Piedmont's package holds **`Credit Underwriting`** — not a valid value for that picklist (it is a *Loan* stage value) | Package stage data is corrupt; there are **two** competing stage fields (`LLC_BI__Stage__c` vs local `cm_Credit_Stage__c`). **Pick one as authoritative.** |
| 7 | Loan Status picklist has 11 values | 3 loans carry **`Superseded`**, which is **not in the picklist** (field is `restricted = false`) | Never treat the picklist as the closed set when reading |
| 8 | `RevisionStatus` tracks revision state | Free-text `string(255)`, and data contains **`Superceded`** (3, misspelled) alongside **`Superseded`** (1) | Any filter on this value must handle both spellings or miss 75% |
| 9 | Product Package "Deal Proposal" record type | `Deal_Proposal` is **INACTIVE**; only `Treasury_Maintenance` is active | Cannot assign the obvious record type on a new package insert |
| 10 | Case = service request container | `Type` picklist has **no "Service Request"** value (`Problem, Feature Request, Question, Complaint, Vehicle Maintenance`); `Origin` has no API/Agent value; both record types are complaint-oriented | **Case is not configured for service requests.** Config prerequisite, not a code problem. |
| 11 | Stage ladder is the credit funnel | 514 of 536 loans sit in Booked/Doc Prep/Qualification. **`Credit Underwriting` = 0 loans, `Processing` = 0 loans** | The mid-funnel our actions target is nearly unexercised. Piedmont's 3 loans are 3 of only 4 org-wide in `Final Review`. |

**Piedmont, the concrete example** (`Account` `001bb00001DLtRMAA1`, "Piedmont Precision Components, Inc.",
RecordType `Business`):
- Package `a5Fbb000000HA1NEAW` "Piedmont Precision C&I Credit Package" — Stage `Credit Underwriting`
  (invalid), Status `Rejected`, Approval Status `Not Submitted` (contradictory), Risk Rating `5`,
  3 facilities / $12.5M, `LLC_BI__Credit_Memo__c` = **null**.
- 3 loans, all `Commercial_Loan_Record_Type`, all Stage `Final Review` / Status `Open`, Risk Grade `5`:
  Equipment $5M (standalone) · LoC $5M (`hasRenewal = true`, `Number_Of_Renewals = 1`) ·
  LoC $7.5M (`Is_Modification = true`).
- Collateral: 5 pledges, but **the modified $7.5M LoC has zero pledges** — collateral did not carry
  across the modification. 3 of 5 pledges are `Inactive`.
- Reviews: **none**. The org's only 3 `LLC_BI__Review__c` rows belong to "Flowers For Dreams".

---

## 4. Doctrine for these actions

Inherited from `INBOUND-REQUESTS-DESIGN.md` and `kyc-onboarding/WRITE-FEASIBILITY.md`:

1. **`stage_*` / `approve_*` pairs.** `stage_*` is agent-callable and creates a reviewable draft.
   `approve_*` requires a human decision and is the only thing that advances real state.
2. **SR 11-7 fence.** Everything an agent produces is decision **support**, provenance `AGENT`. The
   banker decides. Nothing auto-executes.
3. **Audit to the Snowflake decision ledger** (`DECISION_LEDGER` / `AUDIT_EVENTS`), with `actorStamp()`
   attribution, per the `experience-mcp` pattern.
4. **Writes behind a flag** (`assertWritesAllowed()`), idempotency key per action.
5. **No field name ships unverified.**

To which this research adds two org-specific rules:

6. **The permission posture IS the doctrine.** Grant the service user `Exclude_Flow` +
   `Exclude_Trigger` (to avoid waking side-effect automation like the Booked email alert and the
   silent memo approval) but **withhold `Exclude_Validation`**. Result: bank credit-policy rules apply
   to the agent exactly as to a human, and the agent is structurally incapable of moving a loan past
   approval without the approval process. That is the SR 11-7 fence expressed in permissions rather
   than in code.
   *Caveat:* `Exclude_Flow` also suppresses flows that do legitimate back-fill (e.g. Loan Detail
   creation). Decide per-action; do not blanket-suppress. **DECISION REQUIRED — see §7.**
7. **Availability predicates are server-side and read the junction**, never the Loan self-lookups.

---

## 5. Per-action design

Legend for rule classification (SPEC A31.5):
**[PRODUCT]** = true of nCino everywhere, ships with our accelerator.
**[BANK]** = specific to this institution's configuration, must be discovered per org (§8).

> **SPEC A31.5 note:** the spec file itself was not found in this project directory
> (`grep -rn "A31\.5"` → no hits). Classification below applies the *stated* product-vs-bank
> distinction from the brief. **Reconcile against the actual spec before building.**

---

### 5.1 Loan Modification

**Canonical flow.** Credit action on a booked/actioned loan. nCino clones the loan, sets
`Is_Modification = true` on the clone, `hasRenewal = true` on the original, creates a `LoanRenewal`
junction row carrying the revision number and the prior stage/status, and on booking/closing sets the
original to `Superseded`. (`oI2xyBwwnmByAdYBQ~1KCg` §Background Process; commercial surface
`oCOdPaJSYrwRfbKN2zNqFg`, `hMOsocYqmJ~VN~rsb7M6pQ`.) Supported API: `InvocableCreditActionXPkg` /
`CreditActionSoaXPkg` (`KZlO8zPTPLg~nBTN~dzx8w`).

**bankinggpt reality.** Confirmed live: Piedmont's $7.5M LoC is a modification of the $5M LoC, carried
on RL-00000192 with `RevisionNumber = 1`. `Is_Modification = true` on the child; parent lookups null;
`LLC_BI__Loan_Modification__c` empty. Eligibility per canon requires the loan to be booked or actioned —
but **Piedmont's loans are all in `Final Review`, not `Booked`**, so the flagship example does not
actually satisfy nCino's documented modification eligibility. Flag to the demo owner.

**Proposed design.**

> **ANCHOR CORRECTION (Fabian, 2026-07-25): the modification is ALWAYS anchored on the Product
> Package in commercial.** The package is the deal container and the invocation surface —
> `CreditActionSoaXPkg` takes **Package Id + (Booked Loan Id, action) list**; the loan is a member
> selection *within* the package, and the cloned/modified loan lands under the package. Therefore:
> the PRIMARY caller parameter is `productPackageId`; `loanId`(s) identify which member facility to
> modify; availability is evaluated in package context (package active, member loan eligible); and
> the cockpit action fires from the account/package view it already lives in. The loan-first framing
> below is retained for the field mechanics but the invocation and anchoring are package-first.
> Same applies to 5.2 Renewal.

`stage_loan_modification` — creates a **staging record**, not an `LLC_BI__Loan__c`.

Rationale: creating a real draft loan wakes 8 automation entry points, cannot pass
Qualification→Proposal in-transaction (async Loan Detail), and leaves a half-built loan if the agent's
proposal is rejected. The nCino-native path (`InvocableCreditActionXPkg`) does the clone properly — so
`stage_` should *describe* the intended action and `approve_` should *invoke nCino*.

| Input contract — `stage_loan_modification` | |
|---|---|
| **Caller must supply** | `loanId` (`LLC_BI__Loan__c` Id), `requestedChanges` (typed: `{ amount?, maturityDate?, rate?, term? }`), `rationale` (string, required — feeds the memo and the audit ledger) |
| **Apex derives** | current stage/status/amount/maturity from the loan; the existing chain via `LLC_BI__LoanRenewal__c` (root, max revision, whether `HasActiveRenewalLoan = true`); the Product Package; borrower Account |
| **Must come from existing record** | `RecordTypeId`, `LLC_BI__Product_Package__c`, `LLC_BI__Account__c` — **clone, never hardcode** |
| **Writes** | staging record + Snowflake ledger entry, provenance `AGENT`. **No nCino DML.** |
| **Availability predicate (server-side)** | loan exists AND `LLC_BI__isRenewal__c = false` (mutual exclusion, §2.3) AND no open chain row where `LLC_BI__HasActiveRenewalLoan__c = true` AND `LLC_BI__Is_Review_Ready__c = false` (docs: any true value in the hierarchy blocks the whole credit action — `kAHPY0000004Oer4AE`) AND stage ∉ terminal. **Read the chain via the junction.** |
| **Known automation risks** | none — staging record only |

| Input contract — `approve_loan_modification` | |
|---|---|
| **Caller must supply** | `stagingId`, `approverUserId`, human decision token |
| **Apex does** | invoke `InvocableCreditActionXPkg` (or `CreditActionSoaXPkg` for package-level) with action = Modification. **Do not hand-roll the clone.** |
| **Apex must NOT set** | `LLC_BI__hasRenewal__c` — **it is a FORMULA field, `createable = false`, `updateable = false`** (describe). Canon's phrase "sets the HasRenewal checkbox" describes older behaviour; in this org it is derived. |
| **Known automation risks** | `Cannot_Check_More_Than_One_Loan_Type` (no bypass) — never set both flags. `nCino Commercial - Loan After Save` fires email alerts and can flip memos to Approved on stage change. Async clone failure can silently recycle-bin the whole thing (PDI-00017266, `a2BHu000003Zf0AMAS`) — **verify record existence after async completion; do not trust the synchronous response.** >200 collateral rows breaks rollback (PDI-00015762). |
| **Blockers / decisions to surface** | If we hand-roll instead: `LLC_BI__LoanRenewal__c` requires `LLC_BI__ParentLoanId__c` (**createable, NOT updateable — set-once**), `LLC_BI__PreviousVersionStage__c`, `LLC_BI__PreviousVersionStatus__c` (both free-text, copy the parent's current values verbatim), and the object has **0 triggers / 0 flows / 0 VRs** so nothing corrects a malformed row. |

**Classification.** The clone+flag+junction mechanism is **[PRODUCT]**. Whether a modification requires
a fresh collateral valuation, a covenant re-test, or a new risk rating is **[BANK]** — nothing in nCino
canon couples them, and in bankinggpt the modified $7.5M LoC carries **zero** collateral pledges, proving
the coupling is policy, not product.

---

### 5.2 Renewal

**Canonical flow.** Identical machinery to modification; only the flag differs
(`LLC_BI__isRenewal__c` instead of `LLC_BI__Is_Modification__c`) plus renewal-specific config
(`Renewal Number`, "Whether renewals are allowed", `IncludeRenewedLoans` in exposure). Same
`oI2xyBwwnmByAdYBQ~1KCg`.

**bankinggpt reality.** Only **3** loans have `isRenewal = true` org-wide (vs 15 modifications). Piedmont
has **no** renewal. `LLC_BI__Renewal_Number__c` and `LLC_BI__Number_Of_Renewals__c` exist on Loan; the
latter is **not createable/updateable** (rollup).

**Proposed design.** Same `stage_` / `approve_` shape as 5.1, with:
- action = Renewal on the invocable;
- availability predicate additionally reads `LLC_BI__Maturity_Date__c` (renewal is maturity-driven);
- mutual-exclusion predicate flips: require `LLC_BI__Is_Modification__c = false`.

| Additional input contract deltas | |
|---|---|
| **Caller must supply** | `loanId`, `newMaturityDate`, `rationale`; optional repricing |
| **Apex derives** | current maturity, days-to-maturity, existing revision number |
| **Known automation risks** | Blank Renewal/Modification Number at action time yields loan name `_Rnull` and breaks core sync (`kAHHu000000XaQYOA0`). Missing FLS edit on the flag fields causes **silent** mis-typing as "Original Loan" with no exception (`kAHHu000000XaQaOAK`) — **re-run the describe as the service user**. Renewal is effectively irreversible (`kAHHu000000Xb0eOAC`). A new **Opportunity is auto-created** on every renewal (`kAHPY00000035Pl4AI`). |

**Classification.** Machinery **[PRODUCT]**. Renewal *window* (how many days before maturity a renewal
may be initiated), required approvals, and whether renewal forces a re-rating are **[BANK]**.

---

### 5.3 New Facility Request

**Canonical flow.** A new `LLC_BI__Loan__c` under an existing `LLC_BI__Product_Package__c`, entering at
the bottom of the stage ladder. Minimal graph: Package → Loan (+ `LLC_BI__Account__c` relationship,
Entity Involvement rows, Loan Detail child).

**bankinggpt reality.**
- `LLC_BI__Loan__c` has **ZERO hard-required fields at the API level** (0 fields where
  `createable && !nillable && no default`). `Name` is a writable Text field, not autonumber.
- The real contract is the **validation ladder** (§2.3), not the describe.
- `LLC_BI__Product_Package__c` also has **zero** hard-required fields, but its `Deal_Proposal` record
  type is **INACTIVE**.
- 56 fields on Loan are non-createable (44 formula, 11 rollup, 1 autonumber) — **build the insert from an
  explicit allowlist, never `SELECT FIELDS(ALL)`**.

| Input contract — `stage_new_facility` | |
|---|---|
| **Caller must supply** | `productPackageId`, `accountId`, `product` (∈ `Construction, Equipment, Line of Credit, HELOC, Purchase, Deposit, Term`), `amount`, `termMonths`, `purpose` |
| **Apex sets** | `LLC_BI__Stage__c = 'Qualification'`, `LLC_BI__Status__c = 'Open'`, `LLC_BI__isRenewal__c = false`, `LLC_BI__Is_Modification__c = false` |
| **Must come from existing record** | `RecordTypeId` = `Commercial_Loan_Record_Type` (`012bb000000NfLpAAK`) — or cloned from a sibling loan on the package; `LLC_BI__Account__c` from the package |
| **Must NOT set** | any of the 56 non-createable fields; notably `LLC_BI__hasRenewal__c`, `LLC_BI__Number_Of_Renewals__c`, `LLC_BI__Stage_And_Status__c`, `LLC_BI__Is_Booked__c`, `LLC_BI__Amount_Available__c`, `LLC_BI__Current_LTV__c` |
| **Known automation risks** | insert wakes 3 triggers + 5 flows; `ACNPEX_ AccountOwnerAsLoanOfficer` (before-save, local) **overwrites** `LLC_BI__Loan_Officer__c` from the Account owner — do not fight it. `PPCacheCreation` and `ProductPackageBaselineCaptureTrigger` fire on package writes with **no bypass** and swallow failures. |
| **Blocker — surface, do not guess** | To reach `Proposal`, `LLC_BI__Loan_Detail__r.LLC_BI__Primary_Loan_Purpose__c` and `..._Application_Method__c` must be set — but Loan Detail is created **asynchronously** by a flow. **`stage_new_facility` therefore cannot advance past `Qualification` in one transaction.** Either (a) stop at Qualification and let `approve_` do the second hop in a later transaction, or (b) create the Loan Detail child ourselves. **DECISION REQUIRED.** |

**Classification.** Object graph **[PRODUCT]**. The stage-entry point, required underwriting fields per
stage, and the approval ladder are **[BANK]** — every `Loan_Validation_*` rule in this org is bank
configuration layered on nCino.

---

### 5.4 Covenant Review

**Canonical flow.** The evaluation record is `LLC_BI__Covenant_Compliance2__c`, a child of
`LLC_BI__Covenant2__c`. Compliance records are **system-generated** by managed automation when the
parent is Active + has a Frequency Template + Effective Date; the next record generates when the prior
one moves into a status listed in the *Covenant Compliance Record Create Trigger Statuses* system
property (default `Compliant,Waived,Exception`). Pass → `Compliant`; Fail → `Exception` with
`Reason for Exception = Breached`. (*How to Configure Covenant Mgmt & Servicing*, `T6IdqRKUWVuiXmZj5j3bfw`;
*Summary of nCino's Covenant Automation*, `kAHHu000000XZRJOA4`; *How to Use Automated Covenant Testing*,
`FE_EonXfEU5WbW_VcgN7kw`.) Covenants attach to **Loan** and **Account** via master-detail junctions;
**Product Package is NOT an attachment point** — the package view is a read-only roll-up
(`hEPh~pql27bL6lPiYuPHlA`, `kAHHu000000Xb8KOAS`).

**bankinggpt reality.**
- `LLC_BI__Covenant_Compliance2__c` — **1 hard-required field: `LLC_BI__Covenant__c`** (createable,
  **NOT updateable** — set-once). 140 rows.
- Status field is `LLC_BI__Status__c` ∈ `Compliant, Exception, In Progress, Pending, Waived`
  (`restricted = false`). Live distribution: Exception 101 · Pending 31 · Compliant 2 · null 6.
- `LLC_BI__Automated_Testing_Status__c` ∈ `Pass, Fail, Incomplete`.
- `LLC_BI__Reason_for_Exception__c` ∈ `Breached, Overdue`.
- **On the parent `LLC_BI__Covenant2__c` there is NO `LLC_BI__Status__c`** — it is
  `LLC_BI__Covenant_Status__c`, and its value set is messy: `Pending, In Progress, Compliant, Waived,
  Exception, breached, overdue, <10% headroom, >10% headroom, Active, Pass, Fail` (mixed case, mixed
  vocabularies). Also no `LLC_BI__Loan__c` field — loan linkage only via `LLC_BI__Loan_Covenant__c`.
- Useful pre-existing write targets found on Compliance: `LLC_BI__Comments__c`, `LLC_BI__Evaluation_Date__c`,
  `LLC_BI__Evaluated_By__c`, `cm_Approver__c`, `cm_Covenant_Compliance_Indicator_Value__c`, and
  **`Agentic_AI_Response__c`** (textarea) — the org already has a field shaped for our output.
- **Piedmont's 4 covenants are all Account-level with ZERO `LLC_BI__Loan_Covenant__c` rows.**

| Input contract — `stage_covenant_review` | |
|---|---|
| **Caller must supply** | `covenantComplianceId` (**not** covenantId — we evaluate an existing compliance record, we do not create the schedule), `assessment` (`{ result: Pass\|Fail, observedValue, periodEnd, narrative }`) |
| **Apex derives** | the parent covenant, its threshold/operator (`Acnpex_Operator__c`, `Financial_Indicator_Operator__c`), the Boom-spread value used |
| **Apex writes (stage)** | `Agentic_AI_Response__c` + `LLC_BI__Comments__c` + `cm_Covenant_Compliance_Indicator_Value__c`. **Does NOT touch `LLC_BI__Status__c`.** |
| **approve_ writes** | `LLC_BI__Status__c` → `Compliant` / `Exception`; if Exception, `LLC_BI__Reason_for_Exception__c = 'Breached'` + `LLC_BI__Exception_Date__c`; `LLC_BI__Evaluation_Date__c`, `LLC_BI__Evaluated_By__c` |
| **Must NOT do** | **create** compliance records. Generation is managed automation; hand-creating them desynchronises the schedule. If forcing is genuinely needed, the documented lever is `Database.executeBatch(new LLC_BI.CovenantComplianceBatchUpdater(null));` (`kAHHu000000XZRJOA4`). |
| **Known automation risks** | **`acnpex_covenantApprovalProcess` (ApprovalWorkflow) fires on Covenant Compliance after-save** — writing a status kicks off a real approval chain. 3 triggers fire. Writing `LLC_BI__Effective_Date__c` on the **parent** corrupts the whole compliance schedule (PDI-00023403, `a2BPY00000ieDEw2AM`, **unresolved**). Automated Covenant Testing itself is UI-only (Spreads magic wand, locked periods only) — **no Apex entry point** (`FE_EonXfEU5WbW_VcgN7kw`). Compliance evaluation is batch-driven, not real-time (`kAHHu000000XZP1OAO`). Max 49 covenants per loan (`kAHHu000000XZSSOA4`). |
| **Availability predicate** | compliance record exists, `LLC_BI__Status__c ∈ {Pending, In Progress}`, parent covenant `LLC_BI__Active__c = true` |

**Classification.** The compliance-record model and the Pass→Compliant / Fail→Exception mapping are
**[PRODUCT]**. Thresholds, `Acnpex_*` categories/types, the approval chain, cure periods and waiver
authority are **[BANK]** — note nCino has **no cure-period concept at all** (§7), so any cure logic is
100% bank rule.

---

### 5.5 Collateral Valuation

**Canonical flow.** `LLC_BI__Collateral_Valuation__c` "maintains a historical record of all valuations
for each piece of collateral throughout its lifecycle" (*How to Configure Collateral Valuation*,
`2opWW8UJI0Rg_v6i6wVYoQ`). Packaged fields, verbatim: `LLC_BI__Collateral__c`, `LLC_BI__Source__c`,
`LLC_BI__Type__c`, `LLC_BI__Valuation_Date__c`, `LLC_BI__Value__c`, `LLC_BI__Primary__c`,
`LLC_BI__Valuation_Description__c`. Auto-update onto the collateral is per Collateral Type via the
`Auto-Update Collateral Value` checkbox, mapping Valuation Type→Assessment Method, Valuation Date→
Assessment Date, Collateral Value→Value.

> **The documented hard gate, verbatim:** *"You must replace the New button with the **Add Valuation**
> button on the Collateral Valuation related list to trigger the automation to update the collateral
> management record. **The automation does not function if you use the New button.**"*

**bankinggpt reality.**
- All 7 canonical fields **exist and are createable AND updateable**. The object has **1 hard-required
  field (`LLC_BI__Collateral__c`)**, **zero formula fields, zero rollups** — the cleanest write target
  in scope.
- `LLC_BI__Type__c` — 16 values incl. `Fair Market Value - Real Estate`, `Net Orderly Liquidation Value`,
  `As Is Value`, `Appraisal`-adjacent types. `LLC_BI__Source__c` — 14 values incl. `Appraisal`,
  `Internal Valuation`, `Third Party Source`, `Real Estate Restricted Appraisal`.
- The 3 booleans (`LLC_BI__Active__c`, `LLC_BI__Original_Value__c`, `LLC_BI__Primary__c`) default to
  **false** — a revaluation must set `Active` and `Primary` **explicitly**.
- **0 rows, 0 VRs, 0 flows, 1 trigger (`LLC_BI.CollateralValuationTrigger`, before-insert only).**
- On `LLC_BI__Collateral__c`, `LLC_BI__Lendable_Value__c` is a **formula** — confirming the value must be
  written to the valuation child, never to the collateral directly.

| Input contract — `stage_collateral_valuation` | |
|---|---|
| **Caller must supply** | `collateralId`, `value` (currency), `valuationDate`, `type` (from the 16), `source` (from the 14), `description` |
| **Apex sets** | `LLC_BI__Active__c = true`, `LLC_BI__Primary__c = true` (explicitly — defaults are false), `LLC_BI__Original_Value__c = false` |
| **Must come from existing record** | `LLC_BI__Collateral__c` (required, set-once in practice) |
| **Known automation risks** | `LLC_BI.CollateralValuationTrigger` fires **before insert only**. Sub-collateral creation fires the **parent's** validation rules even when nothing changed, and the documented workaround is a UI edit-then-revert — **no headless workaround exists** (PDI-00021908, `a2BPY00000WnkaL2AR`). |
| **Blocker — the load-bearing unknown** | Docs say the collateral auto-update is bound to the **Add Valuation button**. It is not stated whether the mechanism is a trigger (which our DML would hit) or LWC controller logic (which it would not). The org has a **before-insert trigger**, which is *suggestive* of trigger-based mapping `[INFERRED]` — but **0 existing rows means zero empirical evidence**. **Must be settled by a controlled insert in a scratch/sandbox before this action is trusted to update `LLC_BI__Collateral__c`.** See §7. |

**Classification.** The valuation-history object and its field set are **[PRODUCT]**. Which valuation
types/sources are acceptable for which collateral type, revaluation frequency, and whether a
modification *requires* a fresh valuation are **[BANK]**.

---

### 5.6 Annual Review

**Canonical flow.** `LLC_BI__Review__c`, opened from Relationship Credit Actions, Product Package Credit
Actions, or the documented **`Create Credit Review` flow action** (inputs: Account Id, Review Type,
Loan Ids, Mode, Borrower Types) — `4CyghpwbWZ33uzVu8XlJAg`. Record type encodes the origin surface
(`Account_*` vs `Package_*`) and the lifecycle half (`*_In_Progress` vs `*_Complete`). On creation the
system writes one `LLC_BI__Review_Account__c` per entity involvement with a JSON snapshot in
`LLC_BI__Data__c`; on completion it writes a **second** snapshot per entity. Completion advances
`Account.LLC_BI__Next_Review_Date__c` by the Review Frequency — **and nulls it if Frequency is blank**
(`kAHHu000000XaWsOAK`).

**bankinggpt reality.**
- `LLC_BI__Review__c`: **zero hard-required fields**, only `Name` non-createable (autonumber), **zero
  formula/rollup** — fully writable. 3 rows, all `In Progress`, none for Piedmont, none linked to a package.
- `LLC_BI__Status__c` ∈ `In Progress, Pending Approval, Complete`. `LLC_BI__Review_Type__c` ∈
  `Annual, AdHoc, Problem Loan`.
- **`LLC_BI__Is_Agentic_Review__c`** (boolean, createable/updateable) already exists — the org is
  pre-wired for agent-authored reviews. Use it.
- Rich narrative targets exist: `LLC_BI__Narrative__c`, `cm_Relationship_Summary__c`,
  `cm_Strengths_Narrative__c`, `cm_Weakness_Narrative__c`, `cm_Recommendation_Narrative__c`,
  `cm_Collateral_Analysis_Narrative__c`, `cm_Financial_Analyst_Narrative__c`, `cm_Guarantor_Narrative__c`,
  `cm_Risk_Rating_Comments__c`, and more.
- **Local stage ladder `cm_Review_Stage__c` ∈ `Qualification, Underwriting, Final Review, Approval,
  Complete` (default `Qualification`)** — different from the Loan ladder.
- Flow `Review After Save`: "Updates Record Type to 'Account Review in Progress' on Create. Populates
  Loan Officer lookup from Relationship owner" — **the record type is set for us on insert.**

| Input contract — `stage_annual_review` | |
|---|---|
| **Caller must supply** | `accountId` (and/or `productPackageId`), `reviewType` ∈ `Annual, AdHoc, Problem Loan`, the narrative bundle |
| **Apex sets** | `LLC_BI__Is_Agentic_Review__c = true`, `LLC_BI__Status__c = 'In Progress'`, the `cm_*` narrative fields, `LLC_BI__Narrative__c` |
| **Apex must NOT set** | `RecordTypeId` — the `Review After Save` flow assigns it. `cm_Review_Stage__c = 'Approval'` — **impossible, RV01 has no bypass for anyone**. |
| **approve_ writes** | `LLC_BI__Status__c → 'Complete'`; and if `cm_Review_Stage__c → 'Complete'` is wanted, `cm_Approved_Date__c` **must** be populated in the same write (RV02) |
| **Known automation risks** | **RV01 is an absolute wall** — the Approval stage is reachable only through the org's Submit-for-Approval process. RV02's only escape is the User checkbox `$User.No_Validation__c`, held by **zero active users**. Prefer the documented `Create Credit Review` flow action over raw DML so nCino writes the `Review_Account` snapshots. Entities added to the borrowing structure **after** review creation get no snapshot row and become invisible (`kAHPY0000003R3h4AE`). Do **not** retry/refresh after creating a credit action — it can create two records (`hMOsocYqmJ~VN~rsb7M6pQ`). Package rollups recalculate **based on the running user's record access** — an integration user with partial sharing produces wrong rollups (PDI-00015160, `a2BHu000003CJdlMAG`). |

**Classification.** The Review object, junction snapshots, and Next-Review-Date advance are **[PRODUCT]**.
`cm_Review_Stage__c`, RV01/RV02, the 1–12 rating scales, and review frequency policy are **[BANK]** —
the `cm_` prefix is literally the bank's namespace.

---

### 5.7 Risk Rating Review

**Canonical flow.** Ratings live on a **Risk Rating Review** object created from a **Risk Grade
Template**; each review **snapshots a unique duplicate of the template**, so template edits never
retro-alter prior ratings — the snapshot *is* the refresh mechanism (*How to Configure Risk Rating*,
`n_AePhUEhm7LJaz9_F2iLQ`). Write-back to the relationship is governed by system property
Category `REVIEW`, Key `RiskRatingReviewDecisioned` (Value `Declined, Approved`), which stamps
`Risk Rating Review Date Decisioned` and `Risk Rating Review Grade` on the Account. Risk Rating Review
**cannot be initiated from a Product Package** (`kAHHu000000Xar5OAC`).

**bankinggpt reality — the naming resolution.** The docs never print the object's API name. The org
settles it: **`LLC_BI__Annual_Review__c` carries the label "Risk Rating Review"**. It is a *different
object* from `LLC_BI__Review__c`. (`getObjectSchema` index scan: **zero** objects contain "Rating" in
the API name; the rating structures use "Grade" — `LLC_BI__Risk_Grade_Template__c`,
`LLC_BI__Risk_Grade_Factor__c`, `LLC_BI__Risk_Grade_Criteria__c`, `LLC_BI__Risk_Grade_Group__c`,
`LLC_BI__Risk_Grade_Factor_Value__c`.)

- **1 hard-required field: `LLC_BI__Account__c`.** `LLC_BI__Loan__c` is nillable — **this object hangs
  off Account, not Loan.** 1 row exists.
- `LLC_BI__Status__c` ∈ `Not Approved, Approved, Declined, In Review`, **default `Not Approved`** — an
  insert that omits Status lands in `Not Approved`, not null.
- **`LLC_BI__Final_Risk_Grade__c` is a FORMULA — not writable.**
- On Loan the rating field is **`LLC_BI__Risk_Grade__c`** (picklist). **`LLC_BI__Risk_Rating__c` does NOT
  exist on Loan** — it exists on `LLC_BI__Product_Package__c` (values 1–10). Same concept, two names,
  two scales (Review uses 1–12). Easy to get wrong.

| Input contract — `stage_risk_rating_review` | |
|---|---|
| **Caller must supply** | `accountId`, the factor scores, and — **if proposing an override** — `overrideValue` **and** a non-empty `comment` |
| **Apex sets** | `LLC_BI__Status__c = 'In Review'` (explicitly; the default is `Not Approved`) |
| **Apex must NOT set** | `LLC_BI__Final_Risk_Grade__c` (formula). Write the inputs: `LLC_BI__Computed_Risk_Grade_Value__c`, `LLC_BI__Overridden_Risk_Grade_Value__c`, `LLC_BI__Override__c`, and the `*_actual__c` / `*_RG__c` score pairs. **Naming trap:** the writable input is `LLC_BI__Cash_Flow_Coverage_actual__c`; the bare `LLC_BI__Cash_Flow_Coverage__c` is the read-only formula. |
| **Known automation risks** | `Mandatory_comment` (**no bypass**): any `LLC_BI__Overridden_Risk_Grade_Value__c > 0` requires `LLC_BI__Comments__c` non-empty — the describe agent reported the VR's error field as `LLC_BI__Override_Comment__c` while the formula tests `LLC_BI__Comments__c`; **use the formula's field**. Flow `Risk Rating (Annual) Review After Save` **writes back onto the Loan**. A Risk Rating Review launched from a Loan can hang on an infinite spinner with no error when the Account violates a VR (`kAHPY0000003zdF4AQ`) — a synchronous caller gets **no failure signal**. `Account.LLC_BI__Highest_Risk_Grade__c` has **max length 2**; writing "2 - High Quality" throws `STRING_TOO_LONG` (PDI-00002808). |

**Classification.** Template-snapshot versioning and the computed/override/final triad are **[PRODUCT]**.
The 1–12 vs 1–10 scales, factor weights, override authority, and the `RiskRatingReviewDecisioned` value
list are **[BANK]**.

> **Terminology note:** the rating platform referenced in this programme is **Snowflake**. Use that name.

---

### 5.8 Draft Credit Memo

> **OWNERSHIP BOUNDARY (Fabian, 2026-07-25) — this action is NOT part of the Customer 360 v2 Apex
> build.** The credit memo solution is **Noland's**, delivered through the **Credit Memo MCP server**
> (standalone connector today; becoming an **IDB Gateway target** like Boom already is). The cockpit's
> "Draft Credit Memo" action therefore wires to the Credit Memo MCP's tools through whichever door the
> session exposes (doors-not-connectors rule) — it does **not** get a `stage_`/`approve_` Apex pair of
> its own, and nothing below should be re-implemented by us. The canonical/nFORMS analysis below stays
> as REFERENCE for what Noland's server does under the hood (and the PDI-00023618 hash-collision
> landmine remains OUR verification duty on any memo the cockpit surfaces), but build-wise this action
> is an integration seam, not a build item. Same expectation applies when the Customer360 write tools
> themselves become gateway targets: memo = Noland's domain, relationship actions = ours.

**Canonical flow.** There is **no credit memo object**. A credit memo is an **nFORMS Form Template**
(`nFORMS__Form_Template__c`, `Form Purpose = Credit Memo`) whose narrative sections are **Rich Text
fields on a primary object** (worked example: Product Package), rendered to PDF and filed into a
**pre-existing DocMan placeholder** (*How to Configure Credit Memo*, `MddkqQFpsryv3XbkKRy1VA`;
*How to Configure Autosave Credit Memo to Document Manager*, `2MUAdtYMUz3auysumZvFoQ`).

DocMan uses **three parallel placeholder objects chosen by parent** (*How to Configure Document Manager*,
`I7rnD3FkSLEvkBJIn6yQ4g`): Loan → `LLC_BI__LLC_LoanDocument__c`; Relationship → `AccountDocument__c`;
Collateral/Deposit/Treasury/**Product Package** → `Document_Placeholder__c`.

> **Prerequisite, verbatim** (*How to Use Credit Memo*, `~aPtzqq5QE29W0XoBEFD1Q`): *"To use the automated
> flow, you must have manually loaded Document Manager for that record… If no one loads Document Manager
> for the record… then, to the system, those placeholders do not exist yet."*
> Also: bell notifications fire on **failure only** — *"Bell notifications cannot notify the user in the
> event of success."*

**bankinggpt reality.**
- The entire nCino memo object family is **empty** (Credit_Memo 0, Credit_Memo_Screen 0, Credit_Decision 0,
  Credit_Analysis_Summary 0). Piedmont's package has `LLC_BI__Credit_Memo__c = null`.
- The memo actually lives in **`cm_*` long-text fields on `LLC_BI__Product_Package__c`**:
  `cm_Deal_Summary_Loan__c`, `cm_Background_Loan__c`, `cm_Financial_Analysis_Loan__c`,
  `cm_Risk_Analysis_Loan__c`, `cm_Covenant_Analysis__c`, `cm_Collateral_Analysis_Collateral_Mgmt__c`,
  `cm_Relationship_Product_Request_Overview__c`.
- **`HTML_Credit_Memo__c` on Product Package is a FORMULA — the rendered memo CANNOT be written to it.**
  It assembles from the `cm_*` fields.
- Product Package has **only 2 non-createable fields** (`cm_Using_Household__c`, `HTML_Credit_Memo__c`)
  and **zero validation rules** — the memo write path is wide open.
- `LLC_BI__LLC_LoanDocument__c` has **1 hard-required field `LLC_BI__Loan__c` (createable, NOT
  updateable)** — the placeholder is bound to a **Loan**, not a package. For a package-level memo a
  representative loan must be chosen. Status field is `LLC_BI__reviewStatus__c` ∈ `Open, Reviewed,
  Approved, Exception, In-File, Waived, Rejected, Awaiting Review`.

| Input contract — `stage_credit_memo` | |
|---|---|
| **Caller must supply** | `productPackageId`, the section bundle keyed to the `cm_*` fields |
| **Apex writes** | the `cm_*` long-text fields on the package. **Never `HTML_Credit_Memo__c`.** |
| **approve_ / publish** | invoke `nFORMS__HTMLToPDFServiceInvoker` with Form Template Id + **Placeholder Id** + Record Id |
| **Blocker — surface, do not guess** | The placeholder must already exist. `NDOC.DocumentManagerService.initializeDocumentManager(loanId)` is the supported initialiser and is **explicitly not bulkified — one loan per call** (PDI-00023412). **`NDOC.PlaceholdersInitiator` must NOT be used** when the checklist has criteria — it leaves `NDOC__Related_Generation_Context_Id__c` blank and placeholders get **silently set to Waived** on first page load. |
| **Known automation risks** | ⚠️ **The most dangerous defect in this entire research pass:** Credit Memo PDF generation keys on a **hash of loan record Id + template content, and collisions silently substitute another loan's data** — a correct-looking PDF containing **another borrower's** legal entities, no workaround (PDI-00023618, `a2BPY00000kA0Qr2AK`). Any memo we publish must be **verified against the source record before it is treated as a bank document.** Also: PDF output can create a duplicate placeholder on template-name collision (PDI-00020635); `NDOC__fileName__c` >80 chars breaks delete (PDI-00017259); memos with hundreds of collateral/covenant items hit Apex CPU timeout (PDI-00018961). Autosave requires system property `HTML_TO_PDF_SYSTEM_USER` — **mandatory on Hyperforce**, without it autosave is blocked. |

**Classification.** nFORMS + DocMan + the three-placeholder model are **[PRODUCT]**. The `cm_*` section
set, which sections are mandatory, and the approval committee routing (`cm_Approval_Committee__c` ∈
`Loan Committee, Board of Directors`, `Approver_1__c`/`Approver_2__c`) are **[BANK]**.

---

### 5.9 Generate Spreading

**Canonical flow.** Spreads feed covenant testing: the tested value lands in
`LLC_BI__Covenant_Compliance2__c.LLC_BI__Historic_Financial_Indicator__c`, and Automated Covenant Testing
runs from the **Spreads magic wand and only on locked periods** (`FE_EonXfEU5WbW_VcgN7kw`).

**bankinggpt reality.** `LLC_BI__Spread__c` = **0 rows**, but `LLC_BI__Spread_Statement_Record__c` =
**2,433**. Spreads are loaded at statement-record grain only. 15 `Spread*` objects exist
(`LLC_BI__Spread_Statement_Period__c` = 0, `_Record_Value__c`, `_Record_Total__c`, `_Record_Group__c`,
`_Row_Mapping__c`, `_Statement_Type__c`, `_Statement_View__c`, `_Projections_Driver__c`,
`_Projections_Template__c`, …).

**Design.** The spreading *engine* is Boom (the `boom-mcp-*` fleet), not nCino. `stage_spreading` should
produce a Boom spread and attach its provenance; `approve_spreading` writes into the nCino spread
objects so covenant testing can consume it.

> **⚠️ THIS ACTION IS NOT YET SPEC'D. I did not enumerate the write contract for any `Spread*` object.**
> The required-field set, the parent chain (Statement Record → Period → Type), locked-period semantics,
> and whether inserting statement records without a Period is legal are all **UNKNOWN**. Do not write
> Apex for this action from this document. **A follow-up describe pass on
> `LLC_BI__Spread_Statement_Record__c`, `LLC_BI__Spread_Statement_Period__c`,
> `LLC_BI__Spread_Statement_Record_Value__c` and `LLC_BI__Spread_Statement_Type__c` is required.**

**Classification.** Spread→covenant plumbing **[PRODUCT]**. Chart of accounts, statement types, and
normalisation rules **[BANK]**.

---

### 5.10 Create Service Request

**Canonical flow.** Not an nCino concept. Our own doctrine (`INBOUND-REQUESTS-DESIGN.md` §2) specifies
`stage_service_request` with `channel = email` and `reference = { Graph message id, webLink }`, mirroring
the IDB Gateway shape (`capture_channel_interaction` + `create_service_request`).

**bankinggpt reality — this action is BLOCKED on configuration, not code.**
- `Case`: **zero hard-required fields**, **zero validation rules**, only 3 non-createable fields. The
  least-constrained write target in scope. Status defaults `New`, Priority defaults `Medium`.
- **But:** `Type` ∈ `Problem, Feature Request, Question, Complaint, Vehicle Maintenance` — **no "Service
  Request"**. `Origin` ∈ `Email, Phone, Web, Facebook, Twitter` — **no API/Agent/Internal**, so an
  agent-created case has no honest Origin. Both record types (`Complaint_Record_Type`,
  `Pre_Complaint_Risk`) are complaint-oriented. `Vehicle Maintenance` betrays inherited demo data.
- Triggers: `FinServ.CaseTrigger` (bi, bu) and `slackv2.caseTrigger` (ai, au, bd — 1,457 chars, **the
  largest in scope, likely inline logic**, will push to Slack).

| Input contract — `stage_service_request` | |
|---|---|
| **Caller must supply** | `accountId`, `requestType`, `summary`, `reference` (`{ kind: 'm365-message', id, webLink }`) |
| **Apex sets** | `Status = 'New'`, `AccountId`, description + provenance |
| **Blocker — DECISION REQUIRED, do not guess** | Three options: (a) reuse `Type = 'Question'` and accept the semantic mismatch; (b) add `Service Request` to `Type` and an `Agent`/`API` value to `Origin` (**a metadata change — out of scope for read-only research, needs approval**); (c) drive the semantic off a **new record type** and leave `Type` null. **Recommend (b)** — it is a two-picklist-value change and makes the data honest. |
| **Known automation risks** | `slackv2.caseTrigger` will fire on insert and may post to Slack — confirm that is wanted before writing production cases. |

**Classification.** Entirely **[BANK]** — there is no nCino service-request product concept to inherit.

---

## 6. Weird tweaks — nCino-specific traps and what each costs us

Each row: the trap, then the consequence **for our tool design**.

### 6.1 Credit actions

| Trap | Source | Consequence for us |
|---|---|---|
| A credit action = create loan + create package + several loan updates + related-object cloning, and **FI automation executes repeatedly against half-populated clones** | `kAHPY0000003PjR4AU` | Expect CPU timeouts / Too Many SOQL. The only supported detection is `nFORCE.ExecutionContext.containsContext('CREDIT_ACTION')` — **Apex-only; VRs and Flows cannot read it.** If we need VR-level awareness we must persist it to a checkbox in a before-insert trigger. |
| Async credit-action failure can **revert everything silently** — records land in the Recycle Bin with no error | PDI-00017266, `a2BHu000003Zf0AMAS` | **Never trust the synchronous response.** `approve_*` must re-query for record existence after async completion before reporting success. |
| Automatic rollback does **not** run without the "Credit Actions Delete" permission set → half-built loan left behind | PDI-00018042, `a2BPY000001R0bF2AS` | Directly **contradicts** the workaround for the row above; no article reconciles them `[INFERRED conflict]`. Test both postures. |
| Failed background Apex produces **duplicate modification loans with the same loan number** | `kAHHu000000XaJVOA0` | Idempotency key must be enforced by us, not assumed from nCino. |
| Deleting a renewal loan without its LoanRenewal row = permanent poison: *"You can not create a renewal for this loan."* Rows with `LLC_BI__Is_No_Action_Placeholder__c = true` are **legitimate and must not be deleted** | `kAHHu000000XasbOAC`, `kAHHu000000XagKOAS` | Our tools must never delete chain rows. Any cleanup path is out of scope. |
| Blank Renewal/Modification Number → loan name `_Rnull`, core sync breaks | `kAHHu000000XaQYOA0` | Set the number explicitly or let the invocable do it. |
| Missing FLS edit on `isRenewal`/`Is_Modification` → **silent** mis-typing as "Original Loan", no exception | `kAHHu000000XaQaOAK` | **Re-run describes as the service user.** A silent failure here is invisible in testing. |
| Multi-tier credit actions require `ParentLoan__c`, `Highest__c`, `Structure__c`, `Structure_Hierarchy__c`, `Product_Package__c` all populated | `hMOsocYqmJ~VN~rsb7M6pQ` | Availability predicate must check these for multi-tier loans — and in bankinggpt `ParentLoan__c` is null everywhere, so multi-tier is untested here. |
| Any `LLC_BI__Is_Review_Ready__c = true` anywhere in the hierarchy blocks the whole credit action; error surfaces on the **LoanRenewal insert** | `kAHPY0000004Oer4AE` | Predicate must scan the hierarchy, not just the target loan. The error location is misleading. |
| Custom Loan child objects **must** name their Loan lookup exactly `Loan__c` | `4CyghpwbWZ33uzVu8XlJAg` | If we ever add a child object to Loan, this naming is mandatory or every credit action errors. |
| Renewals clone the **Loan Covenant junction, not the covenant** — *"this requires a business process to delete the covenants on the renewed or modified loan"* | `kAHHu000000XZTaOAO` | Post-modification covenant state is a **bank** decision we must surface, not silently inherit. |
| >~10 hierarchical loans per credit action → SOQL 101, some takedowns get **no** snapshot | PDI-00020856 | Cap batch size. Async threshold tunable via `complex_deal_support` / `perform-async-actions`. |

### 6.2 Org-specific (bankinggpt) tweaks

| Trap | Evidence | Consequence |
|---|---|---|
| `LLC_BI__hasRenewal__c` is **lowercase-h** and is a **formula** | describe | SOQL forgives the casing; Apex and metadata do not. And it cannot be set at all. |
| `LLC_BI__LoanRenewal__c` has **0 triggers, 0 flows, 0 VRs** | Tooling scan | Nothing corrects a malformed junction row. Malformed = silent. |
| `RevisionStatus` free-text with **`Superceded`** (3) and **`Superseded`** (1) | `GROUP BY` | Any state filter must handle both spellings or miss 75%. Piedmont uses the *correct* spelling, so **testing against Piedmont alone will not surface this bug.** |
| Loan `Status` contains `Superseded`, absent from the picklist; field is `restricted = false` | describe + `GROUP BY` | Never assume picklist = closed set on read. |
| Product Package `Stage` holds `Credit Underwriting`, not one of its 3 valid values; **two competing stage fields** (`LLC_BI__Stage__c` vs `cm_Credit_Stage__c`) | Piedmont query + describe | **Pick one as authoritative and state it.** `cm_Credit_Stage__c`'s own description says it is "driven by the credit-memo agent". |
| `LLC_BI__Loan_Collateral__c` is **labelled "Collateral"** and is empty; the live junction is `LLC_BI__Loan_Collateral2__c` **labelled "Collateral Pledged"** | describe + counts | Label↔API mismatch. Never resolve objects by label. |
| `LLC_BI__Credit_Memo_Modifcation__c` — **nCino ships this misspelled** (missing the `i`) | object index | Code searching for "Modification" silently misses it. |
| "Risk Rating Review" = `LLC_BI__Annual_Review__c`; **zero** objects contain "Rating" in the API name | object index | The docs never print this API name — the org is the only source of truth. |
| `LLC_BI__Risk_Rating__c` does not exist on Loan (it is `LLC_BI__Risk_Grade__c`); `Risk_Rating__c` exists on **Product Package** with a 1–10 scale while Review uses 1–12 | describe | Same concept, two names, two scales. |
| `NDOC__neededByStage__c` values (`Qualification / Application`, `Underwriting`) **do not string-match** Loan's `LLC_BI__Stage__c` (`Qualification`, `Credit Underwriting`) | describe | Never map document stage to loan stage by string equality. |
| `LLC_BI__Collateral__c` has **no `LLC_BI__Account__c` field** | INVALID_FIELD on query | Collateral cannot be queried by borrower directly — must go via `LLC_BI__Loan_Collateral2__c` or `LLC_BI__Account_Collateral__c`. |
| Pledging one collateral to **4+ loans at once** errors in `LLC_BI.LoanCollateral2Trigger`; pledging where some loans lack a Loan Collateral Aggregate gives a generic *"An error has occurred."* | PDI-00013313, PDI-00016167 | Aggregates must exist first. Cap concurrent pledges. |
| Each loan must reference its **own unique** Loan Collateral Aggregate or LTV is wrong across all sharing loans | `kAHPY0000005A1x4AE` | Read-side correctness issue too — our exposure numbers depend on it. |

---

## 7. UNKNOWNS — neither docs nor org could answer

Ordered by how much they block the build.

### Blocking

1. **Does a raw Apex `insert` on `LLC_BI__Collateral_Valuation__c` roll the value up to
   `LLC_BI__Collateral__c`?** Docs bind the auto-update to the **Add Valuation button** and never say
   whether the mechanism is a trigger or LWC controller logic. The org has a before-insert trigger
   (suggestive `[INFERRED]`) but **0 existing rows = zero empirical evidence**. **This single fact
   determines whether §5.5 is viable as designed.** Settle with a controlled insert in a sandbox.
2. **The entire `Spread*` write contract** (§5.9). Not enumerated. Required fields, parent chain, and
   locked-period semantics all unknown. `stage_spreading` cannot be built from this document.
3. **`SPEC A31.5` itself was not found** in this project directory. The product-vs-bank classifications
   in §5 apply the brief's stated distinction, not the spec's actual text. Reconcile before building.
4. **`Case` is not configured for service requests** (§5.10). Needs a picklist decision (config change),
   not code.

### Design decisions to surface, not guess

5. **Which of `LLC_BI__Stage__c` vs `cm_Credit_Stage__c` is authoritative on Product Package?** The data
   is contradictory and both are live.
6. **Should the service user hold `Exclude_Flow` / `Exclude_Trigger`?** Suppressing side-effect
   automation (Booked email alert, silent memo approval) is desirable; suppressing legitimate back-fill
   (async Loan Detail creation) is not. This is per-action, not global.
7. **Does `stage_new_facility` stop at `Qualification`, or do we create the Loan Detail child
   ourselves** to reach `Proposal` in one flow? (§5.3)
8. **Hand-roll the clone vs call `InvocableCreditActionXPkg`?** This doc recommends the invocable. If
   hand-rolling is chosen for control, the full `*_Relatives_to_Clone` config surface becomes ours to own.

### Genuinely unanswerable from available sources

9. **Managed trigger bodies are not retrievable** — `SELECT Body FROM ApexTrigger` returns literally
   `(hidden)` for every namespaced trigger. All summaries of nCino managed triggers in §2.3 are
   `[INFERRED]` from name, events and length. We cannot know exactly what they do.
10. **Validation rules cannot be enumerated for future org states.** Rules can be added after we ship.
    Concrete risk per object: *"`stage_*` insert may bounce on a VR added after this scan."* The
    mitigation is §8, not a code change.
11. **nCino has no cure-period field or concept.** "Grace Days" is a *pre*-due-date buffer
    (Effective Date + Grace Days = Due Date), **not** a post-breach cure. Any cure logic is 100% bank rule
    with no product anchor.
12. **No obligor-vs-facility rating split, no PD/LGD/EAD, no rating-history object** anywhere in nCino
    docs. If the bank needs these, they are net-new.
13. **No appraisal-ordering workflow exists in nCino.** The words "appraisal"/"appraiser" appear nowhere
    in the Service Management docs. `LLC_BI__Service_Mgmt_Detail__c`'s Appraiser record types in this org
    are `[INFERRED]` customer configuration on a generic object, with **no documented write-back** onto
    collateral.
14. **The one active Process Builder** (`ProcessType = 'Workflow'`, `TriggerType` null) — target object
    unresolved.
15. **API names not printed anywhere in nCino docs**, so unresolvable without further describes: the
    lookup field names on `LLC_BI__Loan_Covenant__c` / `LLC_BI__Account_Covenant__c`; most
    Covenant Compliance field API names; the Placeholder Template config object; the file↔placeholder
    link mechanism (no `ContentDocumentLink` field ever named).
16. **Doc conflict, unreconciled:** `T6IdqRKUWVuiXmZj5j3bfw` says deactivate the managed flow
    `Covenant Compliance Before Save - V.1.0.0`; `_SIByqQh6pNa6HoZs1gY7w` says enable it for ACT
    Exception handling.

---

## 8. Product note — this scan is the capability

*Founder direction, 2026-07-25.*

§2 is not a one-off research artifact. It is the **manual prototype of a product capability**: an
automated **bank-rules discovery scan** run against each client org to derive that institution's policy
layer, so the accelerator can separate what ships (**[PRODUCT]**) from what must be discovered
(**[BANK]**) per SPEC A31.5.

**What the scan reads** (all read-only, all proven against bankinggpt this session):

| Layer | Source | Why it matters |
|---|---|---|
| Validation rules + full `ErrorConditionFormula` | Tooling `ValidationRule`, then per-rule REST for `Metadata` | The literal, machine-readable statement of bank credit policy |
| Bypass topology | grep formulas for `$Permission.*` / `$User.*`; `CustomPermission` + `SetupEntityAccess` + `PermissionSetAssignment` | Determines what an agent identity *can* be permitted to do — the difference between a fence and a wall |
| Apex triggers | Tooling `ApexTrigger` (+ namespace) | Namespaced = product; **no namespace = the bank's own code** |
| Record-triggered flows | `FlowDefinitionView` + per-version `Metadata.filterFormula` | Side effects (emails, auto-approvals) and whether each honours a bypass token |
| Workflow rules | Tooling `WorkflowRule` + metadata | Usually a dead layer — but confirm, don't assume |
| Picklist reality vs definition | describe + `GROUP BY` on live data | Catches out-of-picklist values like `Superseded` and dirty free-text like `Superceded` |
| Record types active vs inactive | `SELECT … FROM RecordType` | Catches inactive-but-in-use types like `Deal_Proposal` |
| Population counts | `SELECT COUNT()` per object | Separates "installed" from "actually used" — the single biggest source of false design assumptions |

**The three signals that make the output valuable**, all demonstrated above:
1. **Namespace = provenance.** `LLC_BI`/`nCino`/`NDOC`/`nFORCE` → product. No namespace or a client
   prefix (`cm_`, `ACNPEX_`) → bank. In bankinggpt this cleanly identified the bank's policy layer:
   `Review_Validation_01/02`, `ProductPackageBaselineCaptureTrigger`, and 6 `ACNPEX_` flows.
2. **Bypass presence = negotiability.** A rule with `$Permission` is a fence the bank chose to leave
   openable. A rule without one is a wall. That distinction, computed automatically, tells us exactly
   which policies an agent identity can be granted past.
3. **Definition vs data divergence** is where demo orgs and real orgs both lie. Only a scan that reads
   both catches it.

**Output shape:** object → rules → implications, exactly as §2.3 is written — machine-generable, and
directly consumable as the bank-rules half of the action registry's availability predicates.

**Caveat to carry into the product:** the scan is a **point-in-time** snapshot (§7 item 10). Rules change
after we ship. The capability should therefore be **re-runnable and diffable**, with drift against the
last scan surfaced as an alert — that, not the first scan, is the durable product.

---

## 9. Research provenance

**nCino documentation consulted: 60+ articles across technical docs, help articles, and PDI/Known Issues.**
Load-bearing ones:

| Title | Map / Doc ID |
|---|---|
| How to Configure Loan Renewals and Loan Modifications | `oI2xyBwwnmByAdYBQ~1KCg` |
| How to Configure Credit Actions | `4CyghpwbWZ33uzVu8XlJAg` |
| How to Use Credit Actions on Relationship | `hMOsocYqmJ~VN~rsb7M6pQ` |
| How to Use Credit Actions on Product Package | `oCOdPaJSYrwRfbKN2zNqFg` |
| How to Use Credit Actions APIs | `KZlO8zPTPLg~nBTN~dzx8w` |
| How to Use the nCino Callable API | `sM2rPFyKry939TyfPon1rw` |
| How to Implement Credit Action Bypass for Custom Code | `kAHPY0000003PjR4AU` |
| How to Configure Covenant Mgmt & Servicing: Required Configuration | `T6IdqRKUWVuiXmZj5j3bfw` |
| Summary of nCino's Covenant Automation and Best Practice Configurations | `kAHHu000000XZRJOA4` |
| How to Use Automated Covenant Testing | `FE_EonXfEU5WbW_VcgN7kw` |
| How Are Covenants, Loan Covenants, Account Covenants, Accounts, and Loans Connected? | `kAHHu000000Xb8KOAS` |
| How to Configure Collateral Valuation | `2opWW8UJI0Rg_v6i6wVYoQ` |
| Collateral Management (Collateral 2) Simplified | `kAHHu000000XZIeOAO` |
| Collateral Management: Collateral Fields Across Various Objects | `kAHHu000000XZSNOA4` |
| How to Configure Credit Memo | `MddkqQFpsryv3XbkKRy1VA` |
| How to Configure Autosave Credit Memo to Document Manager | `2MUAdtYMUz3auysumZvFoQ` |
| How to Use Credit Memo | `~aPtzqq5QE29W0XoBEFD1Q` |
| How to Configure Document Manager | `I7rnD3FkSLEvkBJIn6yQ4g` |
| How to Configure Risk Rating | `n_AePhUEhm7LJaz9_F2iLQ` |
| Feature Deprecation: Classic Covenants | `zo6VWQoUS~MGiS6tLpI5dA` |

Key PDIs: `a2BPY00000kA0Qr2AK` (memo hash collision — borrower data substitution) ·
`a2BHu000003Zf0AMAS` (silent async revert) · `a2BPY000001R0bF2AS` (rollback needs a permission set) ·
`a2BPY00000iiGJ32AM` (`PlaceholdersInitiator` silently waives) · `a2BPY00000ieDEw2AM` (Effective Date
corrupts covenant schedule, unresolved) · `a2BHu000003CJdlMAG` (rollups follow running-user access).

**Org queries/describes run: ~90** across 4 parallel read-only agents plus this session —
`getUserInfo` ×3, `getObjectSchema` (index + 12 objects), ~45 SOQL SELECT/COUNT/GROUP BY,
~25 Tooling API queries and per-record REST metadata fetches. **Zero DML. Zero metadata changes.**

**Written by:** research pass, 2026-07-25, against `bankinggpt` (`00DDz000001qeO2MAI`).
