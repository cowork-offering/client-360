# Write Probe Ledger: bankinggpt

**Purpose.** The immutable evidence artifact for every controlled write probe run against the target
org. A33 (`A33-DRAFT.md`) cites this file. No writability claim in any spec may cite a describe read;
it must cite a row here.

**Org:** `bankinggpt`, `00DDz000001qeO2MAI`, Project Buzz - FS, Unlimited Edition, `USA870S`,
IsSandbox `true`.
**Actor for every probe below:** `fabian.goetzens@accenture.com.bankinggpt`, System Administrator,
`005bb00000ftouDAAQ`, through the `sobject-sf` MCP session.
**Dates:** 2026-07-25 and 2026-07-26.

---

## Relationship to ACTIONS-DESIGN.md

`ACTIONS-DESIGN.md` states, correctly and verifiably for its own scope: *"RESEARCH COMPLETE. No code
written, no org mutated"* and *"Zero DML. Zero metadata changes."* That statement describes the
**read-only reconnaissance pass** and it remains true of that pass.

**The probes in this ledger POSTDATE that document.** They were run afterwards, deliberately, as the
first controlled writes against the org, precisely because ACTIONS-DESIGN itself named the questions
they answer (its §7 blocking unknown 1, the collateral valuation write path). Nothing here contradicts
ACTIONS-DESIGN. It supersedes ACTIONS-DESIGN only where a probe result settles something that document
listed as unknown, and each row below says which.

**Traceability rule for A33 and any successor spec:** a fact is citable to ACTIONS-DESIGN only if
ACTIONS-DESIGN contains it. Probe outcomes cite this ledger. Founder decisions cite the decision and its
date. Those are three distinct provenance classes and they must not be blended into a single "per the
research" citation.

---

## Why any probe at all: the describe cannot be trusted for writability

The `sobject-sf` MCP `getObjectSchema` call **strips permission facts**. It reported
**0 createable fields** on `LLC_BI__Collateral_Valuation__c` for a System Administrator who then
inserted into that object successfully (Probe 1 below).

Therefore: a describe reporting a field as non-createable is not evidence that a write will fail, and a
describe reporting it as createable is not evidence that a write will succeed. **Only an insert settles
it.** This is the standing rule A33.4.10 enforces.

---

## Probe 1: `LLC_BI__Collateral_Valuation__c`

| | |
|---|---|
| **Date** | 2026-07-25 |
| **Question** | Can this object be written at all, and what is the true minimum field set? ACTIONS-DESIGN §7 blocking unknown 1. Prior state: 0 rows, no precedent in the org. |
| **Request fields** | `LLC_BI__Collateral__c` and `LLC_BI__Value__c` **only**. No source, no type, no valuation date, no booleans. |
| **Parent** | Collateral `COL-000758`, id `a35bb000000zOgXAAU` (corrected 2026-07-26: the original entry recorded `a34bb00000398KnAAI` here, which is the created VALUATION's id, prefix a34; the collateral itself is prefix a35) |
| **Returned id / name** | `CV-0000000000`, id `a34bb00000398KnAAI` |
| **Result** | **SUCCESS.** Insert accepted. No validation rule fired. The object's single hard-required field (`LLC_BI__Collateral__c`) plus a value is sufficient. |
| **Verification** | Record queried back by id after insert and confirmed present with the submitted value. Verbatim query text not captured in the evidence handed to this session; recorded here as a gap, see Outstanding items. |
| **Deletion** | **Confirmed deleted.** |
| **Settles** | The write path. `stage`/`execute_collateral_valuation` is viable as designed. |
| **Does NOT settle** | Whether the insert rolls the value up onto `LLC_BI__Collateral__c`. nCino binds that auto-update to the **Add Valuation** button and states the automation does not function via the New button. The rollup remains **PROBE PENDING** and A33 requires a separate verification step that reports honestly when the collateral value did not move. |

## Probe 2: `Case`

| | |
|---|---|
| **Date** | 2026-07-25 |
| **Question** | Can a service request be written today, before the `Service Request` / `Agent` picklist values are deployed? ACTIONS-DESIGN §7 blocking unknown 4 (Case not configured for service requests). |
| **Request fields** | `AccountId`, `Subject`, `Type = 'Question'`, `Origin = 'Web'` |
| **Parent** | Account `001bb00001DLtRMAA1`, Piedmont Precision Components, Inc. |
| **Returned id** | `500bb00000qor81AAA` |
| **Result** | **SUCCESS.** Insert accepted. **No validation walls** (consistent with the scan finding of zero validation rules on Case). **No automation side effect observed.** |
| **Verification** | Record confirmed created and associated to the Piedmont account. Verbatim query text not captured; recorded as a gap. |
| **Deletion** | **CONFIRMED 2026-07-26.** `deleteSobjectRecord` returned success at probe time, and the absence was re-verified independently: `SELECT Id FROM Case WHERE Id = '500bb00000qor81AAA'` returned `{"totalSize":0,"done":true,"records":[]}`. |
| **Settles** | Case is writable today. The configuration question is a **data-honesty** question, not a code blocker, which is why A33.4.8 specifies a declared degraded mode rather than failing closed. |
| **Does NOT settle** | Whether `slackv2.caseTrigger` posts to Slack on insert. **Absence of an observed side effect is not proof of absence**: nothing in this probe watched Slack. Remains PROBE PENDING and A33 keeps the possible Slack post in the confirm summary until a probe explicitly watches for it. |

## Probe 3: `LLC_BI__Review__c`

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Question** | What does a Review insert actually require, and what does the org fill in for us? |
| **Request fields** | `LLC_BI__Account__c` **only** |
| **Returned id / name** | `a5nbb00000kZKe7AAG`, auto-named `R-3` |
| **Result** | **SUCCESS.** Insert accepted. The org assigned the record type **`Account Review In Progress`** automatically (the `Review After Save` flow, as documented). The name is an autonumber. |
| **Critical negative finding** | **`LLC_BI__Status__c` and `LLC_BI__Review_Type__c` both came back NULL.** Nothing defaults them. A tool that omits them creates a Review in no status and of no type. Both must be set explicitly. |
| **Verification** | Record queried back; record type, name, and the two null fields read from the returned record. Verbatim query: `SELECT Id, Name, LLC_BI__Status__c, LLC_BI__Review_Type__c, RecordType.Name, CreatedDate FROM LLC_BI__Review__c WHERE Id = 'a5nbb00000kZKe7AAG'` returned `R-3`, RecordType `Account Review In Progress`, Status null, Review_Type null, CreatedDate `2026-07-25T22:01:11.000+0000`. |
| **Deletion** | **CONFIRMED 2026-07-26.** `deleteSobjectRecord` returned success at probe time, and the absence was re-verified independently: `SELECT Id FROM LLC_BI__Review__c WHERE Id = 'a5nbb00000kZKe7AAG'` returned `{"totalSize":0,"done":true,"records":[]}`. |
| **Settles** | The insert contract, and the fact that record type must NOT be set by us. |
| **Does NOT settle** | Anything on the approve side. The `cm_Review_Stage__c` to `Complete` transition with `cm_Approved_Date__c` in the same write is untested and remains PROBE PENDING. A33 removed that transition from our tools entirely (finding 2), so it is now a question about the org's own process, not about a tool of ours. |

---

# WAVE 3 (WP3): the throwaway-account campaign, 2026-07-26

**Actor:** `fabian.goetzens@accenture.com.bankinggpt`, System Administrator, `005bb00000ftouDAAQ`,
through the **`sf` CLI** (`sf api request rest`, `sf data query`, `sf apex run`) against alias
`bankinggpt`. Not through the `sobject-sf` MCP: WP3 needed verbatim request bodies and raw REST
responses, and the CLI is the only surface that produces both.

**Prime directive for this wave (founder, verbatim intent):** no existing record or piece of metadata in
bankinggpt is touched. Every probe runs against throwaway data created for the probe. Piedmont
(`001bb00001DLtRMAA1`), Sterling and every demo-visible record are out of bounds. A probe that cannot be
run without touching existing data, or without waking irreversible automation on shared records, is
**HELD** and its reason recorded. **HELD is a successful outcome, not a failure.**

**Throwaway anchor for the whole wave:**

| | |
|---|---|
| Account | `ZZ-PROBE-20260726 DO NOT USE` |
| Id | `001bb00001I6J5LAAV` |
| Request body | `{"Name":"ZZ-PROBE-20260726 DO NOT USE","RecordTypeId":"012bb000000NNdRAAW"}` |
| Created | 2026-07-26T03:33:13Z, RecordType `Business`, Owner `005bb00000ftouDAAQ` |
| Deleted | 2026-07-26T03:55Z, verified, see the residue-zero proof at the end of this wave |

**Debug-log instrumentation.** Probes 5 and 7 needed trigger-level evidence, so the wave created its own
`DebugLevel` `ZZ_PROBE_20260726` (`7dlbb0000002tV3AAI`) and its own `TraceFlag` (`7tfbb000000MV6nAAG`,
`USER_DEBUG`, traced entity = the probe actor). No existing `DebugLevel` or `TraceFlag` was read into,
modified or reused. Both were deleted at the end of the wave and the deletions verified (0 rows each).

---

## Probe 4: `LLC_BI__Annual_Review__c` (Risk Rating Review) insert

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Question** | What does a Risk Rating Review insert require, and does `LLC_BI__Status__c` really default to `Not Approved` as A33.4.7(a) asserts from a describe read? |
| **Verbatim request** | `POST /services/data/v67.0/sobjects/LLC_BI__Annual_Review__c` body `{"LLC_BI__Account__c":"001bb00001I6J5LAAV"}` |
| **Verbatim response** | `{"id":"a2bbb000001Dk1FAAS","success":true,"errors":[]}` |
| **Verification query** | `SELECT Id, Name, LLC_BI__Account__c, LLC_BI__Loan__c, LLC_BI__Status__c, LLC_BI__Final_Risk_Grade__c, LLC_BI__Computed_Risk_Grade_Value__c, LLC_BI__Overridden_Risk_Grade_Value__c, LLC_BI__Comments__c, CreatedDate, LastModifiedDate FROM LLC_BI__Annual_Review__c WHERE Id = 'a2bbb000001Dk1FAAS'` |
| **Verbatim result** | `Name` `RG-0000001`, `LLC_BI__Account__c` `001bb00001I6J5LAAV`, `LLC_BI__Loan__c` `null`, **`LLC_BI__Status__c` `Not Approved`**, `LLC_BI__Final_Risk_Grade__c` `null`, `LLC_BI__Computed_Risk_Grade_Value__c` `null`, `LLC_BI__Overridden_Risk_Grade_Value__c` `null`, `LLC_BI__Comments__c` `null`, `CreatedDate` `2026-07-26T03:33:49.000+0000`, `LastModifiedDate` `2026-07-26T03:33:50.000+0000` |
| **Result** | **SUCCESS.** One field is sufficient. No validation rule fired. |
| **Settles** | The insert contract, and the **`Not Approved` default is CONFIRMED by write**, not merely by describe. A33.4.7(a)'s instruction to set `LLC_BI__Status__c = 'In Review'` explicitly is correct and is now evidence-backed: an omitted status lands in `Not Approved`, which reads as a **decision** rather than as an absent value. That is a worse failure mode than Review's null. |
| **New org facts** | The object has **no `RecordTypeId` field and no `OwnerId` field** (`No such column 'RecordTypeId' on entity 'LLC_BI__Annual_Review__c'`; 81 fields, neither present). It is a **cascade-delete child of Account** (`LLC_BI__Account__c` describe: `cascadeDelete: true`, `nillable: false`). Any tool that tries to set a record type or an owner on this object will fail. `Name` is the autonumber series `RG-…`. |
| **Observed side effect** | `LastModifiedDate` is **one second after** `CreatedDate` with `LastModifiedById` = the probe actor: an after-save automation touched the record inside the same request. No field we queried changed, so the write is invisible in the data but real in the audit trail. A tracker that compares `CreatedDate` to `LastModifiedDate` to detect "the org changed our record" will produce a false positive here. |
| **Deletion** | `sf data delete record -s LLC_BI__Annual_Review__c -i a2bbb000001Dk1FAAS` returned `{"id":"a2bbb000001Dk1FAAS","success":true,"errors":[]}`. Re-query `SELECT Id FROM LLC_BI__Annual_Review__c WHERE Id = 'a2bbb000001Dk1FAAS'` returned `{"records":[],"totalSize":0,"done":true}`. |
| **Does NOT settle** | The decision transitions (`Approved`, `Declined`). Per A33.3.1 they belong to the org's `RiskRatingReviewDecisioned` path and are not ours to write, so they are not ours to probe. |

## Probe 5: `LLC_BI__Loan__c` insert (new facility)

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Question** | Does the new-facility insert of A33.4.3 work headlessly, which automation fires visibly, what does the org overwrite, and is the Loan Detail really created asynchronously? |
| **Verbatim request** | `POST /services/data/v67.0/sobjects/LLC_BI__Loan__c` body `{"Name":"ZZ-PROBE-20260726 Facility","LLC_BI__Account__c":"001bb00001I6J5LAAV","LLC_BI__Stage__c":"Qualification","LLC_BI__Status__c":"Open","LLC_BI__isRenewal__c":false,"LLC_BI__Is_Modification__c":false,"RecordTypeId":"012bb000000NfLpAAK"}` |
| **Verbatim response** | `{"id":"a4Zbb0000027Jj7EAE","success":true,"errors":[]}` |
| **Verification query** | `SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c, LLC_BI__isRenewal__c, LLC_BI__Is_Modification__c, LLC_BI__Loan_Officer__c, LLC_BI__Loan_Officer__r.Name, LLC_BI__Account__c, LLC_BI__Product_Package__c, LLC_BI__Amount__c, LLC_BI__Is_Review_Ready__c, LLC_BI__Loan_Detail__c, RecordTypeId, OwnerId, CreatedDate, LastModifiedDate, SystemModstamp FROM LLC_BI__Loan__c WHERE Id='a4Zbb0000027Jj7EAE'` |
| **Verbatim result** | `Name` **`ZZ-PROBE-20260726 DO NOT USE - Construction - $0`**, `LLC_BI__Stage__c` `Qualification`, `LLC_BI__Status__c` `Open`, `LLC_BI__isRenewal__c` `false`, `LLC_BI__Is_Modification__c` `false`, `LLC_BI__Loan_Officer__c` `005bb00000ftouDAAQ` (`Fabian Goetzens`), `LLC_BI__Product_Package__c` `null`, `LLC_BI__Amount__c` `null`, `LLC_BI__Is_Review_Ready__c` `false`, **`LLC_BI__Loan_Detail__c` `a4Wbb000001GhQDEA0`**, `RecordTypeId` `012bb000000NfLpAAK`, `CreatedDate` `2026-07-26T03:36:02.000+0000`, `LastModifiedDate` `2026-07-26T03:36:08.000+0000`. Second query: `LLC_BI__Product__c` **`Construction`** (never submitted), `LLC_BI__Number_Of_Renewals__c` `0`, `LLC_BI__hasRenewal__c` `false`. |
| **Result** | **SUCCESS.** Zero hard-required fields is confirmed by write. |
| **Finding 1: the org OVERWRITES `Name`.** | We submitted `ZZ-PROBE-20260726 Facility`; the org stored `<Account Name> - <Product> - <Amount>`. A33.4.3(a) says "`Name` is a writable text field, not an autonumber" — writable yes, **but not ours**. A before-save flow (elements `Update_Loan_Name`, `Loan_Name_Updated`, `Get_Loan_Record_Type`, `Set_Application_Date`, `Check_Employee_Loan_Checkbox`, `Check_Reg_O_Loan_Checkbox`, `Subject_To_TRID`, `Loan_Purpose_Sync_Needed`, `Loan_Is_Copy`) rebuilds it. Any tool or panel that echoes back "created facility <name you typed>" will be **wrong**. Report the org-assigned name, exactly as `execute_collateral_valuation` already does with `recordName`. |
| **Finding 2: `LLC_BI__Product__c` self-populates to `Construction`** | We never sent it and the describe reports no default value. An org before-save trigger set it to the first picklist value, and the loan name was then built from it. A new-facility tool that does not collect Product ships loans labelled `Construction`. |
| **Finding 3: the Loan Detail is created by an ASYNC-PATH FLOW in ~4 seconds** | `LLC_BI__Loan_Detail__c` `a4Wbb000001GhQDEA0`, `CreatedDate` `2026-07-26T03:36:06.000+0000` against the loan's `03:36:02` — **4 seconds**. It is a **separate transaction**: `ApexLog` `07Lbb00000pRz6rEAC` (`Operation` `N/A`, start `03:36:06`), whose flow elements are `Loan_Detail_Exists` (decision) → `Create_Loan_Detail` (record create) → `Update_Loan_with_New_Loan_Details_Record` (record update, `DML_BEGIN|Op:Update|Type:LLC_BI__Loan__c|Rows:1`). **It is a Flow, not Apex:** `SELECT Id, JobType, ApexClass.Name, Status, CreatedDate FROM AsyncApexJob WHERE CreatedDate > 2026-07-26T03:30:00Z` returned **no loan-related job**. A33.4.3's `wait` step is therefore correct in shape; a `waitBudgetMs` in the **10–30 s** range is evidence-backed for a single-record insert, and polling `AsyncApexJob` to detect completion would never fire. |
| **Finding 4: Loan Detail defaults** | `SELECT Id, Name, LLC_BI__Loan__c, LLC_BI__Primary_Loan_Purpose__c, LLC_BI__Application_Method__c, CreatedDate, CreatedById, LastModifiedDate FROM LLC_BI__Loan_Detail__c WHERE Id='a4Wbb000001GhQDEA0'` returned `Name` `a4Wbb000001GhQD` (the truncated record id, not a readable label), `LLC_BI__Primary_Loan_Purpose__c` **`null`**, `LLC_BI__Application_Method__c` **`Online`**. So of the two fields LV12/LV13 gate, **`Application_Method` is pre-satisfied by the org and `Primary_Loan_Purpose` is not**. A33.4.3's panel only strictly needs to collect the purpose. |
| **Finding 5: the automation inventory, from the log** | Insert transaction `ApexLog` `07Lbb00000pRz5FEAS`, 562,318 bytes, 6,387 ms. Managed namespaces entered: **`LLC_BI` (1266), `nFORCE` (5452), `nCino` (59), `NDOC` (8), `nCRED` (1)**. **21 distinct validation rules evaluated, 42 `VALIDATION_PASS`, zero failures**: `Loan_Validation_01/02/03/05/06/07/10/11/12/13/14/15/16/17/18`, `cm_First_Payment_Date`, `Balloon_Amount_terms_must_be_equal`, `Balloon_Loan_terms_cannot_be_blank`, `Balloon_Term_loan_not_equal_to_amortized`, `Cannot_Check_More_Than_One_Loan_Type`, `Takedown_Amount_Less_Or_Equal_Parent`. Four flow interviews ran in the insert transaction (`300bb00000HnuH8`, `300bb00000I4dwe`, `300bb00000I51KZ`, `300bb00000JNyBp`); `ACNPEX_ AccountOwnerAsLoanOfficer` is confirmed by its element `Account_Owner_as_a_Loan_Officer`. |
| **Loan officer: honest reading** | `LLC_BI__Loan_Officer__c` came back as the probe actor. The account owner **and** the running user were both `005bb00000ftouDAAQ`, so this probe **cannot distinguish** "the flow assigned the account owner" from "the platform defaulted the creator". The flow element fired, so the mechanism is confirmed; the value is not a clean discriminator. Report loan officer as org-assigned, per A33.4.1(c), and do not claim this probe proved which source won. |
| **Deletion** | `sf data delete record -s LLC_BI__Loan__c -i a4Zbb0000027Jj7EAE` returned success. Re-query `SELECT Id FROM LLC_BI__Loan__c WHERE Id='a4Zbb0000027Jj7EAE'` → `totalSize 0`. **The Loan Detail cascade-deleted with it**: `SELECT Id, LLC_BI__Loan__c FROM LLC_BI__Loan_Detail__c WHERE Id='a4Wbb000001GhQDEA0'` → `totalSize 0`, with no separate delete call. |
| **Spec correction** | **`LLC_BI__RootLoanId__c` DOES NOT EXIST on `LLC_BI__Loan__c` in this org.** `SELECT … LLC_BI__RootLoanId__c …` returns `INVALID_FIELD: No such column 'LLC_BI__RootLoanId__c' on entity 'LLC_BI__Loan__c'`, and the describe's 333 fields contain no field matching `Root`. A33.4.1(a) states "Chain anchoring is the text field `LLC_BI__RootLoanId__c`" — that is **wrong for bankinggpt** and must be removed or re-sourced before any chain-walking code is written. `LLC_BI__ChildLoanId__c` likewise does not exist on `LLC_BI__LoanRenewal__c`. |

## Probe 6: collateral valuation rollup, through the deployed tools

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Question** | The standing PROBE PENDING from Probe 1: does a `LLC_BI__Collateral_Valuation__c` insert roll its value up onto `LLC_BI__Collateral__c`? |
| **Method** | Run the **deployed** `stage_collateral_valuation` / `execute_collateral_valuation` pair through the REST **Actions API**, not a raw insert, so the probe exercises the real shipping path and its own `collateralValueMoved` output. Two arms, because `LLC_BI__Collateral_Type__c` carries a boolean `LLC_BI__Auto_Update_Collateral_Value__c` that looked like the rollup switch. |
| **Org fact discovered first** | **All 43 `LLC_BI__Collateral_Type__c` rows in bankinggpt have `LLC_BI__Auto_Update_Collateral_Value__c = false`** (`SELECT LLC_BI__Auto_Update_Collateral_Value__c, COUNT(Id) c FROM LLC_BI__Collateral_Type__c GROUP BY LLC_BI__Auto_Update_Collateral_Value__c` → one row, `false`, `43`). So arm A reproduces org reality and arm B is the control that would have exonerated the flag. |
| **Fixture, arm A** | Type: `POST …/LLC_BI__Collateral_Type__c` `{"Name":"ZZ-PROBE-20260726 Type A (no auto-update)","LLC_BI__Advance_Rate__c":50,"LLC_BI__Auto_Update_Collateral_Value__c":false}` → `a33bb000001WN49AAG`. Collateral: `{"LLC_BI__Collateral_Type__c":"a33bb000001WN49AAG","LLC_BI__Description__c":"ZZ-PROBE-20260726 DO NOT USE - collateral A","LLC_BI__Value__c":100000}` → `a35bb0000013xHVAAY`, org-named `COL-000760`. |
| **Fixture, arm B** | Type: same body with `"Name":"ZZ-PROBE-20260726 Type B (auto-update ON)"` and **`"LLC_BI__Auto_Update_Collateral_Value__c":true`** → `a33bb000001WN5lAAG`. Collateral → `a35bb0000013xJ7AAI`, org-named `COL-000761`. |
| **Verbatim stage request, arm A** | `POST /services/data/v67.0/actions/custom/apex/StageCollateralValuation` body `{"inputs":[{"idempotencyKey":"zz-probe-20260726-colvalA","rationale":"WP3 probe: settle whether a valuation insert rolls up onto the parent collateral.","collateralId":"a35bb0000013xHVAAY","value":250000,"primary":true}]}` |
| **Verbatim stage response, arm A** | `stagingId` `a8abb00001KtPq7AAF`, `planHash` `9410c3ea5ca9498ed1408c0b8e35160b0ed69634b7b8d40181031c7f8a4fdb14`, `decisionToken` `bdf94d8a74bd48ad621c090704860ea7d87ef4d43cdfefd7bef24f9055d41938`, `replayed` `false`, three steps (`write_valuation`, `verify_valuation`, `verify_rollup`), zero domain DML. |
| **Verbatim execute request, arm A** | `POST /services/data/v67.0/actions/custom/apex/ExecuteCollateralValuation` body `{"inputs":[{"idempotencyKey":"zz-probe-20260726-colvalA","stagingId":"a8abb00001KtPq7AAF","planHash":"9410c3ea5ca9498ed1408c0b8e35160b0ed69634b7b8d40181031c7f8a4fdb14","decisionToken":"bdf94d8a74bd48ad621c090704860ea7d87ef4d43cdfefd7bef24f9055d41938","approverUserId":"005bb00000ftouDAAQ"}]}` |
| **Verbatim execute response, arm A** | `isSuccess` `true`, `valuationId` `a34bb00000399WzAAI`, `recordName` `CV-0000000004`, `anchorName` `COL-000760`, `terminalState` `success`, steps `write_valuation` **verified** ("Valuation a34bb00000399WzAAI inserted."), `verify_valuation` **verified** ("Valuation reads back at 250000.00."), `verify_rollup` **verified** ("**Collateral value unchanged at 100000.00. The rollup did not fire.**"), **`collateralValueMoved` `false`**. |
| **Arm B** | `stagingId` `a8abb00001Ktb2ZAAR`, `planHash` `4cdc58a3afbde53bfccd186851d8e8931548714ba01bbb90f981bda6c85ee8a8`, `decisionToken` `5384ec8911bc2f03179363918786bf40498aa7c440946561ea286816d51513ab`; execute → `valuationId` `a34bb00000399YbAAI`, `recordName` `CV-0000000005`, `anchorName` `COL-000761`, `terminalState` `success`, **`collateralValueMoved` `false`**, same verbatim detail "Collateral value unchanged at 100000.00. The rollup did not fire." |
| **Independent verification, 45 s later** | `SELECT Id, Name, LLC_BI__Value__c, LLC_BI__Lendable_Value__c, LLC_BI__Total_Collateral_Rollup_Value__c, LLC_BI__Collateral_Type__r.LLC_BI__Auto_Update_Collateral_Value__c FROM LLC_BI__Collateral__c WHERE Id IN ('a35bb0000013xHVAAY','a35bb0000013xJ7AAI')` → `COL-000760` value `100000`, lendable `50000`, rollup `null`, flag `false`; `COL-000761` value `100000`, lendable `50000`, rollup `null`, flag `true`. And `SELECT Id, Name, LLC_BI__Collateral__c, LLC_BI__Value__c, LLC_BI__Active__c, LLC_BI__Primary__c, LLC_BI__Original_Value__c FROM LLC_BI__Collateral_Valuation__c WHERE LLC_BI__Collateral__c IN (…)` → both valuations present at `250000`, `Active` `true`, `Primary` `true`, `Original_Value` `false`. |
| **SETTLES — the answer is NO, and it is not the flag** | **A `LLC_BI__Collateral_Valuation__c` insert does NOT move `LLC_BI__Collateral__c.LLC_BI__Value__c`, synchronously or within 45 seconds, and `LLC_BI__Auto_Update_Collateral_Value__c = true` on the collateral type does NOT change that.** The rollup is bound to nCino's **Add Valuation** UI button, exactly as nCino documents, and there is no headless equivalent and no configuration flag that substitutes for it. A33.4.5(d) is now **CONFIRMED negative**: the `verify_rollup` step and the "valuation filed, collateral value unchanged" terminal wording are correct and permanent, not a temporary hedge. Any future claim of coverage improvement from a filed valuation is false. |
| **Bonus fact** | `LLC_BI__Lendable_Value__c` read `50000` on both, i.e. `LLC_BI__Value__c` x the type's 50% advance rate. It is a formula on the **collateral's own** value and is likewise unaffected by valuation children. |
| **Ledger correction to Probe 1** | Probe 1 records its parent as "Collateral `COL-000758`, id `a34bb00000398KnAAI`". That id **is not a collateral**. `SELECT Id, Name FROM LLC_BI__Collateral__c WHERE Name = 'COL-000758'` returns `a35bb000000zOgXAAU`. The `a34` prefix is `LLC_BI__Collateral_Valuation__c` (this wave's own valuations are `a34bb00000399WzAAI` / `a34bb00000399YbAAI`) and `a35` is `LLC_BI__Collateral__c`. Probe 1 therefore recorded the **valuation's** id in the parent field. The probe outcome stands; the id attribution does not. |
| **Deletion** | Six domain records plus two staging rows deleted, each returning `success: true`: valuations `a34bb00000399WzAAI`, `a34bb00000399YbAAI`; collaterals `a35bb0000013xHVAAY`, `a35bb0000013xJ7AAI`; types `a33bb000001WN49AAG`, `a33bb000001WN5lAAG`; `cm_Action_Staging__c` `a8abb00001KtPq7AAF`, `a8abb00001Ktb2ZAAR`. Re-query of all four id pairs returned `totalSize 0` in every case. **The staging rows are recorded here deliberately:** running the shipping tools creates `cm_Action_Staging__c` rows, and a probe that cleans up its domain records but leaves its staging rows behind has not cleaned up. |

## Probe 7: `slackv2.caseTrigger` outbound behaviour on Case insert

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Question** | The standing PROBE PENDING from Probe 2: does the Slack trigger post on insert? Probe 2 recorded absence of observation and explicitly refused to call it absence of the effect. |
| **Config precondition, re-checked first** | `Case.Type` now reads `Problem, Feature Request, Question, Complaint, Vehicle Maintenance, **Service Request**` and `Case.Origin` reads `Email, Phone, Web, Facebook, Twitter, **Agent**`. **The A33.4.8 config prerequisite has landed.** Degraded mode is no longer needed and this probe used the real values, not the `Question`/`Web` fallback. |
| **Verbatim request** | `POST /services/data/v67.0/sobjects/Case` body `{"AccountId":"001bb00001I6J5LAAV","Subject":"ZZ-PROBE-20260726 DO NOT USE - Slack side-effect watch","Description":"WP3 probe: watch whether slackv2.caseTrigger produces observable activity on Case insert.","Type":"Service Request","Origin":"Agent","Status":"New"}` |
| **Verbatim response** | `{"id":"500bb00000qpExRAAU","success":true,"errors":[]}` |
| **Verification query** | `SELECT Id, CaseNumber, OwnerId, Owner.Name, AccountId, Type, Origin, Status, Priority, CreatedDate FROM Case WHERE Id='500bb00000qpExRAAU'` → `CaseNumber` `00001324`, `OwnerId` `005bb00000ftouDAAQ` (`Fabian Goetzens`), `Type` `Service Request`, `Origin` `Agent`, `Status` `New`, **`Priority` `Medium`** (never submitted, confirms the documented default), `CreatedDate` `2026-07-26T03:44:56.000+0000`. |
| **The watch** | `ApexLog` `07Lbb00000pS0AzEAK`, `Operation` `/services/data/v67.0/sobjects/Case`, `Status` `Success`, 16,002 bytes, retrieved with `sf apex get log`. |
| **Evidence 1: slackv2 DID run** | **25 `ENTERING_MANAGED_PKG|slackv2` entries.** The trigger is live and executed on this insert. `LIMIT_USAGE_FOR_NS` blocks are present for `(default)`, **`FinServ`** (1 SOQL, 11 rows) and `slackv2`, so `FinServ.CaseTrigger` fired too. |
| **Evidence 2: it emitted NOTHING outbound** | Verbatim from the log's limit block: `Number of callouts: 0 out of 100`, `Number of Email Invocations: 0 out of 10`, `Number of future calls: 0 out of 50`, `Number of queueable jobs added to the queue: 0 out of 50`, `Number of Publish Immediate DML: 0 out of 150`. `SELECT Id, JobType, ApexClass.NamespacePrefix, ApexClass.Name, Status, CreatedDate FROM AsyncApexJob WHERE CreatedDate > 2026-07-26T03:44:50Z` returned **zero rows**, and no follow-on `ApexLog` was produced. There was no synchronous callout and no deferred one. |
| **Evidence 3: the MECHANISM, and it is queryable** | The log shows slackv2's two decision queries, verbatim: `SELECT Id, CreatedById, Subscription_Id__c, Subscription_Type__c, Field__c, Value__c, User__c, Record_Id__c FROM Subscription__c WHERE (Record_Id__c = NULL AND Object_Type__c = :tmpVar1 AND (Subscription_Type__c IN :tmpVar2 OR (Subscription_Type__c = :tmpVar3 AND User__c IN :tmpVar4)))` → **`Rows:0`**, and `SELECT Id, CreatedById, Record_Id__c, Subscription_Id__c, Subscription_Type__c, Field__c, Value__c, User__c FROM Subscription__c WHERE (Record_Id__c = :tmpVar1 AND Object_Type__c = :tmpVar2 AND Subscription_Type__c IN :tmpVar3)` → **`Rows:0`**. slackv2 posts only where a `slackv2__Subscription__c` row matches. |
| **Evidence 4: why it matched nothing, and when it WOULD** | `SELECT slackv2__Object_Type__c, slackv2__Subscription_Type__c, COUNT(Id) c FROM slackv2__Subscription__c GROUP BY …` → exactly five rows, one `Assigned to Me` each for `Account`, `Case`, `Contact`, `Lead`, `Opportunity`. The Case one: `SELECT Id, slackv2__Object_Type__c, slackv2__Subscription_Type__c, slackv2__User__c, slackv2__Record_Id__c, CreatedById FROM slackv2__Subscription__c WHERE slackv2__Object_Type__c='Case'` → `a7qbb000000BcuqAAC`, type `Assigned to Me`, **`slackv2__User__c` `005bb00000I8VXJAA3`**, `Record_Id__c` `null`. Our Case was owned by `005bb00000ftouDAAQ`, so the `User__c IN :tmpVar4` leg did not match and the query returned nothing. |
| **SETTLES** | **`slackv2.caseTrigger` executes on every Case insert but posts only when a `slackv2__Subscription__c` row matches the record.** In bankinggpt today there is exactly one Case subscription, `Assigned to Me` for user `005bb00000I8VXJAA3`. This is no longer "absence of observation": the trigger ran, the decision query is captured verbatim, and the precondition is a **queryable fact**. Consequence for A33.4.8(c): the Slack warning stays in the confirm summary but becomes **conditional and provable** — a pre-flight `SELECT Id FROM slackv2__Subscription__c WHERE slackv2__Object_Type__c = 'Case' AND (slackv2__Record_Id__c = null OR slackv2__Record_Id__c = :caseId)` tells the banker whether a post is actually possible, and a case created for or assigned to `005bb00000I8VXJAA3` **will** attempt one. |
| **Does NOT settle** | Anything Slack does from its own side. Slack's Salesforce app can subscribe outside Apex (CDC, platform events, polling), and this probe only proves the **Apex trigger** initiated nothing. The confirm summary keeps its warning for that residual reason, not for the trigger. |
| **Deletion** | `sf data delete record -s Case -i 500bb00000qpExRAAU` returned `{"id":"500bb00000qpExRAAU","success":true,…}`; re-query `SELECT Id FROM Case WHERE Id='500bb00000qpExRAAU'` → `totalSize 0`. |

## Probe 8: `acnpex_covenantApprovalProcess` entry criteria — **the gating question, ANSWERED; the live write arm, HELD**

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Question** | Which field write starts the bank's covenant approval chain? This is the gating probe: every covenant tool is HELD until it lands. |
| **Outcome** | **The question is CONFIRMED, from authoritative metadata, with ZERO writes. The live-write arm is HELD, with a reason that is itself the finding.** |
| **Step 1 — the legacy approval process is dead** | `SELECT Id, Name, DeveloperName, TableEnumOrId, Type, State FROM ProcessDefinition` returns 16 rows. The only one on `LLC_BI__Covenant_Compliance2__c` is `CCAP100 Covenant Compliance Approval` (`04abb000002sH7ZAAU`), **`State` = `Obsolete`**. Classic approval processes are not the mechanism. |
| **Step 2 — locating the real one** | `acnpex_covenantApprovalProcess` is a **Flow**, `Id` `301bb00000T6YxZAAV`, `ProcessType` **`ApprovalWorkflow`**, `Status` `Active`, version 3. It is the **only** `ApprovalWorkflow` in the org (`ProcessType` census over 271 active flows: `AutoLaunchedFlow` 208, `Flow` 24, `PromptFlow` 20, `RoutingFlow` 13, `RecommendationStrategy` 2, `Survey` 2, `Workflow` 1, **`ApprovalWorkflow` 1**). |
| **Step 3 — the entry criteria, verbatim** | `GET /services/data/v67.0/tooling/sobjects/Flow/301bb00000T6YxZAAV`, `Metadata.start`: `"object": "LLC_BI__Covenant_Compliance2__c"`, `"triggerType": "RecordAfterSave"`, **`"recordTriggerType": "Create"`**, **`"filters": []`**, `"filterLogic": null`, `"filterFormula": null`, `"conditions": []`, `"conditionLogic": null`, `"doesRequireRecordChangedToMeetCriteria": null`, `"scheduledPaths": []`, connector → `Stage_1`. `Metadata.exitRules` is `[]`. |
| **SETTLES — the answer** | **`acnpex_covenantApprovalProcess` fires on CREATE of `LLC_BI__Covenant_Compliance2__c` only, unconditionally, with no entry filter of any kind. It does NOT fire on ANY update — not on `LLC_BI__Status__c`, not on `LLC_BI__Reason_for_Exception__c`, not on the narrative-only fields of execute phase 1.** |
| **Consequence for A33.4.4** | A33 already forbids creating compliance records ("generation is managed automation"). Our covenant tools **update existing rows only**. Therefore **our tools cannot start the bank's approval chain, by construction**, and the blanket precaution in A33.4.4(c) — treating every write including narrative-only fields as potentially chain-starting — can be **narrowed to its true shape**: the `observed_side_effect` step is accurate for a *create* the tools never perform, and misleading if left on the update path. The A33.3.1 status-transition allowlist entry no longer needs to stay HELD **on the grounds of unknown approval entry criteria**. Any remaining hold must be justified on its own merits, not on this one. |
| **Bypass note** | The trigger has **zero entry filters**, so it consults **no `Exclude_Flow`-style bypass field**. The A33.5.5 bypass matrix cannot suppress it. On a create it fires; there is no token that stops it. |
| **Why the live write arm is HELD** | Getting a throwaway compliance record to update requires **creating** one, and a create is exactly what starts the chain — the probe would have to fire the automation it exists to avoid. And the chain is not contained: `Metadata.orchestratedStages` → `Stage_1` → step `RM_s_Approval`, `actionType` **`stepApproval`**, assignee `assigneeType` `User`, `stringValue` **`robert.mcclaren@outlook.com`** — a **named real human**, followed by a `Field_Update` background step gated on `RM_s_Approval.Status`. Firing it would raise a live approval work item, and very likely a notification, for a real person, about a `ZZ-PROBE` record. That is unrecallable and lands outside the throwaway data. Updating an **existing** compliance record instead is forbidden outright by the prime directive. **Both paths are closed, so the write arm was not run.** |
| **Method note for whoever picks this up** | The task brief said to verify by querying `ProcessInstance` for the record ids. That would have proven nothing: `ProcessInstance` is the **classic** approval object, and a flow-based `ApprovalWorkflow` does not write to it. The org's 62 `ProcessInstance` rows all belong to classic processes on Loan, Product Package and Credit Memo Modification. Verification of this chain must target the orchestration/approval-work-item objects instead. |
| **Records created** | **None.** This probe wrote nothing to the org. |

## Probe 9: the loan clone through nCino's credit action — **HELD, phase-limited, with the exact blocking fact**

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Question** | Can a modification or renewal be executed end to end through nCino's credit-action invocable, on throwaway data? |
| **Outcome** | **HELD.** Modification and renewal are **phase-limited**: `stage_*` plans are buildable; **`execute_*` is HELD**. The blocking fact is a validation rule with no bypass, established below by a real attempt and a real error, not by inference. |
| **Finding 0 — the invocable we were told to use is not reachable, and the one that is has a different name** | `GET /services/data/v67.0/actions/custom/apex` returns 159 Apex actions, 71 namespaced. **`LLC_BI__InvocableCreditActionXPkg` is NOT among them** — no `LLC_BI__*CreditAction*` action is exposed at all, although the classes `LLC_BI.InvocableCreditActionXPkg`, `LLC_BI.InvokableCreditActionXPkg` and `LLC_BI.CreditActionSoaXPkg` all exist. The credit action reaches callers through a **local, org-authored wrapper**: `acnpex_CreditActionRequest`, label `Execute Credit Action`, which resolves `nFORCE.BeanFactory.getInstance().getBeanByUniqueName('LLC_BI.InvokableCreditActionXPkg')` and drives it through `nFORCE.ACrossPackageService`. A duplicate wrapper `acnpex_noland_credit_action` carries the same label. |
| **⚠️ Finding 0b — `acnpex_CreditActionRequestSample` is a LANDMINE, do not call it** | Despite its name and its `@InvocableVariable` inputs, it **ignores every input** and executes a **real `Renewal`** against hardcoded ids: `caRequest.contextId = 'a5Fbb0000001C9kEAE'` and `loans = [Select Id From LLC_BI__Loan__c where id = 'a4Zbb000000xykvEAA']`, with `isAsync = true`. Invoking it to "see the request shape" would run a live credit action against existing org records. **It was NOT called during this wave.** Flag it to the org owner. |
| **Fixture built (all throwaway)** | Product Package: `POST …/LLC_BI__Product_Package__c` `{"Name":"ZZ-PROBE-20260726 DO NOT USE - Source Package","LLC_BI__Account__c":"001bb00001I6J5LAAV","LLC_BI__Stage__c":"Pending","LLC_BI__Status__c":"New"}` → `{"id":"a5Fbb000000IGPhEAO","success":true}`. Loan on it: `{"Name":"ZZ-PROBE-20260726 Source Facility","LLC_BI__Account__c":"001bb00001I6J5LAAV","LLC_BI__Product_Package__c":"a5Fbb000000IGPhEAO","LLC_BI__Stage__c":"Qualification","LLC_BI__Status__c":"Open","LLC_BI__isRenewal__c":false,"LLC_BI__Is_Modification__c":false,"LLC_BI__Amount__c":500000,"RecordTypeId":"012bb000000NfLpAAK"}` → `{"id":"a4Zbb0000027JkjEAE","success":true}`, org-renamed `ZZ-PROBE-20260726 DO NOT USE - Construction - $500,000.00`, Loan Detail `a4Wbb000001GhTREA0` auto-created, `LLC_BI__lookupKey__c` `null`. |
| **A33.4.3(d) GAP is CLOSED, and it was not the blocker** | A33.4.3(d) records "the package record type `Deal_Proposal` is inactive (only `Treasury_Maintenance` is active), so creating a **new** package is not covered by this contract." **A package CAN be created.** `SELECT Id, Name, DeveloperName, IsActive FROM RecordType WHERE SobjectType='LLC_BI__Product_Package__c'` → `Deal_Proposal` `IsActive false`, `Treasury_Maintenance` `IsActive true`; and the describe shows **neither is `available` to the running profile** — only `Master` (`012000000000000AAA`) is available and default. The insert with **no `RecordTypeId`** succeeded and landed on `Master`. Package creation is therefore possible; the record-type gap is a **labelling** problem, not a write blocker. |
| **Attempt 1 — through the Actions API** | Request: `POST /services/data/v67.0/actions/custom/apex/acnpex_CreditActionRequest` body `{"inputs":[{"sourcePackageId":"a5Fbb000000IGPhEAO","loanIds":["a4Zbb0000027JkjEAE"],"actionType":"Modification","isAsync":false,"isNewPackage":true,"newPackageName":"ZZ-PROBE-20260726 DO NOT USE - Target Package","newPackageRelationshipId":"001bb00001I6J5LAAV"}]}`. Response: `isSuccess false`, `statusCode` `UNKNOWN_EXCEPTION`, message **`An Apex error occurred: System.QueryException: List has no rows for assignment to SObject`**. |
| **Finding 1 — the wrapper hides the real reason** | That exception is not the credit action's. It comes from the wrapper's own unguarded tail, `newLoan = [Select Id, LLC_BI__lookupKey__c From LLC_BI__Loan__c where LLC_BI__Product_Package__c = :result.outputPackageId ORDER BY CREATEDDATE DESC limit 1]`, which assumes a clone exists. **Any credit action that produces no output loan surfaces through `acnpex_CreditActionRequest` as `List has no rows for assignment to SObject`, with `failureReasons` discarded.** Any tool built on this wrapper must call `performAction()` directly, or the banker gets a platform stack trace instead of the bank's own refusal. |
| **Attempt 2 — the real reason, via `performAction()`** | Anonymous Apex driving the same class but reading the result object: `svc.contextId='a5Fbb000000IGPhEAO'; svc.isAsync=false; svc.isNewPackage=true; svc.newPackageName='ZZ-PROBE-20260726 DO NOT USE - Target Package'; svc.newPackageRelationshipId='001bb00001I6J5LAAV'; svc.facilityActions.add(new acnpex_CreditActionRequest.FacilityActionDto('a4Zbb0000027JkjEAE','Modification'));` → `success=false`, `outputPackageId=null`, `apexJobId=null`, **`failureReasons=(The request contains invalid facilities)`**. |
| **Attempt 3 — both action types, both stages** | `Renewal` and `Modification`, at `Qualification` and again at `Proposal`, all four returned `success=false … reasons=(The request contains invalid facilities)`. The action type is not the discriminator and neither is the pre-approval stage. |
| **Finding 2 — the Qualification → Proposal hop WORKS headlessly (A33.4.3 phase 2 confirmed)** | `PATCH …/LLC_BI__Loan_Detail__c/a4Wbb000001GhTREA0` `{"LLC_BI__Primary_Loan_Purpose__c":"business_credit_line"}` → 204, then `PATCH …/LLC_BI__Loan__c/a4Zbb0000027JkjEAE` `{"LLC_BI__Stage__c":"Proposal"}` → 204, re-query confirms `LLC_BI__Stage__c` `Proposal`. The LV11/LV12/LV13/LV14 ladder was satisfied by amount `500000`, the purpose written above, the org-defaulted `Application_Method` `Online`, and the org-assigned loan officer. **A33.4.3's phase 2, the one allowlisted hop, is evidence-backed and shippable.** |
| **Finding 3 — what "valid facility" actually means** | Read-only comparison against the org's real renewal chains: `SELECT Id, LLC_BI__ParentLoanId__c, LLC_BI__ParentLoanId__r.LLC_BI__Stage__c, LLC_BI__ParentLoanId__r.LLC_BI__Status__c, LLC_BI__ParentLoanId__r.LLC_BI__lookupKey__c FROM LLC_BI__LoanRenewal__c LIMIT 10`. **Every parent loan is `Stage = Booked`, `Status = Open`, with a non-null core `LLC_BI__lookupKey__c`** (`5555555555`, `LP327`, `LP346`, `LP160`, `LP211`). A credit action acts on a **booked, core-keyed** facility. Our throwaway loan had `lookupKey` `null` and was pre-approval. |
| **THE BLOCKING FACT** | `PATCH …/LLC_BI__Loan__c/a4Zbb0000027JkjEAE` `{"LLC_BI__Stage__c":"Booked"}` → `FIELD_CUSTOM_VALIDATION_EXCEPTION` on `LLC_BI__Stage__c`, two rules, verbatim: **"A Loan Number is Required Prior to Changing the Loan Stage to 'Booked' - LV05"** and **"You Cannot Manually Change the Loan to a Post Approval Stage. The Loan Must be Approved by pressing the 'Submit for Approval' Button at the top of the page. - LV06"**. `Loan_Validation_06` carries **no `$Permission` bypass** and applies to the agent exactly as to bankers. |
| **Why that makes the probe unrunnable, not merely hard** | Reaching a credit-actionable facility requires `Booked`; `Booked` is unreachable by API; the only route is nCino's **Submit for Approval**, which starts `LAP100 - nCino Gold Standard AP` (`04abb000002sH7eAAE`, `Active` on `LLC_BI__Loan__c`) with **real approvers**. That is automation that cannot be contained to throwaway data, and the org's own `ProcessInstance` history shows this process really runs. Per the prime directive, the probe was **stopped**. |
| **VERDICT** | **Modification and renewal are phase-limited.** `stage_loan_modification` / `stage_renewal` can be built and shipped: they compute, plan, hash and hold a token, and write no domain record. **`execute_*` for both is HELD** until a founder-gated path to a booked, core-keyed throwaway facility exists — realistically a dedicated sandbox or an org-owner-supplied fixture loan, not a shared demo org. Nothing about the clone id, the junction row shape, the revision number, the `Superseded` cascade, the async timing or the silent-revert behaviour was observed, and none of it may be asserted from this wave. |
| **Residue from the failed action** | **Zero.** Immediately after the failure: `SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c, CreatedDate FROM LLC_BI__Product_Package__c WHERE LLC_BI__Account__c='001bb00001I6J5LAAV'` → 1 row, our own source package only, no target package created. `SELECT … FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='001bb00001I6J5LAAV'` → 1 row, the source loan only, no clone. `SELECT Id, Name, LLC_BI__ParentLoanId__c, CreatedDate FROM LLC_BI__LoanRenewal__c WHERE CreatedDate = TODAY` → **0 rows**, no junction. The credit action failed **cleanly**: it created nothing before refusing. |
| **Deletion** | Loan `a4Zbb0000027JkjEAE` deleted (`success: true`), Loan Detail `a4Wbb000001GhTREA0` cascaded with it, Product Package `a5Fbb000000IGPhEAO` deleted (`success: true`). All verified at `totalSize 0` in the final sweep. |

---

## WAVE 3 RESIDUE-ZERO PROOF

Every record created during WP3, with its final state. Nothing on this list was an existing org record.

| # | Object | Id | Created by | Deleted | Live re-query |
|---|---|---|---|---|---|
| 1 | `Account` | `001bb00001I6J5LAAV` | wave anchor | yes | 0 rows |
| 2 | `LLC_BI__Annual_Review__c` | `a2bbb000001Dk1FAAS` | Probe 4 | yes | 0 rows |
| 3 | `LLC_BI__Loan__c` | `a4Zbb0000027Jj7EAE` | Probe 5 | yes | 0 rows |
| 4 | `LLC_BI__Loan_Detail__c` | `a4Wbb000001GhQDEA0` | org automation, Probe 5 | cascade | 0 rows |
| 5 | `LLC_BI__Collateral_Type__c` | `a33bb000001WN49AAG` | Probe 6 arm A | yes | 0 rows |
| 6 | `LLC_BI__Collateral_Type__c` | `a33bb000001WN5lAAG` | Probe 6 arm B | yes | 0 rows |
| 7 | `LLC_BI__Collateral__c` | `a35bb0000013xHVAAY` | Probe 6 arm A | yes | 0 rows |
| 8 | `LLC_BI__Collateral__c` | `a35bb0000013xJ7AAI` | Probe 6 arm B | yes | 0 rows |
| 9 | `LLC_BI__Collateral_Valuation__c` | `a34bb00000399WzAAI` | Probe 6 arm A | yes | 0 rows |
| 10 | `LLC_BI__Collateral_Valuation__c` | `a34bb00000399YbAAI` | Probe 6 arm B | yes | 0 rows |
| 11 | `cm_Action_Staging__c` | `a8abb00001KtPq7AAF` | Probe 6 arm A | yes | 0 rows |
| 12 | `cm_Action_Staging__c` | `a8abb00001Ktb2ZAAR` | Probe 6 arm B | yes | 0 rows |
| 13 | `Case` | `500bb00000qpExRAAU` | Probe 7 | yes | 0 rows |
| 14 | `LLC_BI__Product_Package__c` | `a5Fbb000000IGPhEAO` | Probe 9 | yes | 0 rows |
| 15 | `LLC_BI__Loan__c` | `a4Zbb0000027JkjEAE` | Probe 9 | yes | 0 rows |
| 16 | `LLC_BI__Loan_Detail__c` | `a4Wbb000001GhTREA0` | org automation, Probe 9 | cascade | 0 rows |
| 17 | `DebugLevel` (Tooling) | `7dlbb0000002tV3AAI` | instrumentation | yes | 0 rows |
| 18 | `TraceFlag` (Tooling) | `7tfbb000000MV6nAAG` | instrumentation | yes | 0 rows |

**Sweep 1, by id.** Each of ids 1–16 re-queried individually against its own object: `totalSize 0`, sixteen for sixteen. Ids 17–18 re-queried against the Tooling API: `totalSize 0` each.

**Sweep 2, by name pattern**, to catch anything the org created and named for itself:

| Query | Result |
|---|---|
| `SELECT Id,Name FROM Account WHERE Name LIKE 'ZZ-PROBE%'` | 0 |
| `SELECT Id,Name FROM LLC_BI__Collateral_Type__c WHERE Name LIKE 'ZZ-PROBE%'` | 0 |
| `SELECT Id,Name FROM LLC_BI__Product_Package__c WHERE Name LIKE 'ZZ-PROBE%'` | 0 |
| `SELECT Id,Name FROM LLC_BI__Loan__c WHERE Name LIKE 'ZZ-PROBE%'` | 0 |
| `SELECT Id,Subject FROM Case WHERE Subject LIKE 'ZZ-PROBE%'` | 0 |
| `SELECT Id FROM LLC_BI__Collateral__c WHERE LLC_BI__Description__c LIKE 'ZZ-PROBE%'` | 0 |
| `SELECT Id FROM cm_Action_Staging__c WHERE cm_Idempotency_Key__c LIKE 'zz-probe%'` | 0 |

**Sweep 3, by relationship**, run against the anchor account before it was deleted: `LLC_BI__Loan__c` 1 (our own), `LLC_BI__Product_Package__c` 1 (our own), `LLC_BI__Annual_Review__c` 0, `LLC_BI__Review__c` 0, `Case` 0, `Opportunity` 0, `Task` 0, `Event` 0, `Contact` 0, `cm_Action_Staging__c` 0. **No Opportunity was auto-created** at any point in this wave, so the renewal-side Opportunity effect of A33.4.2(c) was never triggered.

**Sweep 4, recycle bin.** `Database.emptyRecycleBin` over all sixteen ids: 8 purged, 8 returned `INVALID_ID_FIELD: invalid record id; no recycle bin entry found` (cascade-deleted children and objects that never entered the bin). Final `ALL ROWS` pass across all sixteen: **`live=0`, tombstones=16.** Zero live rows. The sixteen tombstones are `IsDeleted = true` index entries, invisible to every UI, list view, report and standard SOQL query, and they age out on the platform's own schedule.

**Untouched, as required:** Piedmont `001bb00001DLtRMAA1`, Sterling, and every other pre-existing record and piece of metadata in bankinggpt. No metadata was deployed. `McpServerDefinition` was not read into or modified.

---

# WAVE 4: tool envelope verification pass, 2026-07-26

**Purpose.** All eight wave-2 tools are deployed (23 tools on the server). This pass observes **one real
request/response pair per tool** through the REST Actions API and **live-verifies the execute paths on
throwaway data**. The verbatim pairs are the deliverable consumed by the cockpit's seam swap:
`/tmp/wave2-envelopes.json`.

**Actor and transport:** same as wave 3 — `fabian.goetzens@accenture.com.bankinggpt`,
`005bb00000ftouDAAQ`, `sf` CLI. Endpoint
`POST /services/data/v67.0/actions/custom/apex/<ClassName>`; request `{"inputs":[{…}]}`; response a JSON
array with the tool payload at `[0].outputValues.{ok,result,error}`.

**Throwaway anchor:** Account `ZZ-VERIFY-20260726 DO NOT USE` `001bb00001I6PfJAAV`, Product Package
`a5Fbb000000IGZNEA4`. Both deleted, proof below.

## Per-tool outcome

| Tool | Status | Anchor | Evidence |
|---|---|---|---|
| `stage_new_facility` | **OBSERVED** | throwaway package | 7-step plan, `waitBudgetMs` 30000, staging `a8abb00001KtbXGAAZ` |
| `execute_new_facility` | **VERIFIED LIVE** (after a defect + redeploy) | throwaway | first run failed on CPU; redeployed two-invocation design verified end to end, see wave 4b |
| `stage_risk_rating_review` | **OBSERVED** | throwaway account | staging `a8abb00001KtsFBAAZ` |
| `execute_risk_rating_review` | **VERIFIED LIVE** | throwaway account | created `RG-0000002`, re-queried, replay-tested, deleted |
| `stage_covenant_review` | **OBSERVED** | real `COMP-0468`, read-only | staging `a8abb00001KtnfnAAB`; target unchanged |
| `stage_loan_modification` | **OBSERVED** | Piedmont LoC, read-only | `executionHeld: true`, staging `a8abb00001KtvRVAAZ` |
| `stage_renewal` | **OBSERVED** | Piedmont LoC, read-only | `executionHeld: true`, staging `a8abb00001KtIUCAA3` |
| `execute_covenant_review` | **NOT-OBSERVED, founder-gated** | none | not run, by design; reason below |

## The zero-DML claim is now empirically proven, not just unit-tested

The five `stage_*` calls touched three real records as read anchors and **none of them moved**:

- Piedmont LoC `a4Zbb000001vavpEAA`: `LastModifiedDate` still `2026-07-07T14:56:24.000+0000`, last
  modified by **Noland Smith**, stage `Final Review`, amount `5000000`, maturity `2027-07-15`.
- `SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='001bb00001DLtRMAA1' AND LastModifiedDate = TODAY`
  → **0 rows**. `SELECT Id FROM LLC_BI__LoanRenewal__c WHERE CreatedDate = TODAY` → **0 rows**.
- `COMP-0468` `a3Cbb00000DzjdREAR` (BlueSky Group, deliberately not Piedmont and not Sterling):
  `LastModifiedDate` still `2026-07-24T09:00:14.000+0000`, `LLC_BI__Status__c` still `Pending`.

The only thing a `stage_*` call writes is its own `cm_Action_Staging__c` row. That is the design and it
now has org evidence behind it.

## `execute_risk_rating_review` — VERIFIED LIVE

Created `LLC_BI__Annual_Review__c` `a2bbb000001DkCXAA0`, `RG-0000002`, on the throwaway account.
Tool-reported steps: `write_risk_rating` **verified**, `verify_risk_rating` **verified** ("Review
RG-0000002 reads back at In Review, computed grade 6.00."), `observe_loan_writeback`
**filed_unverified** — the honest state for org automation it cannot confirm. `terminalState` `success`.

**Independent re-query** (not the tool's own claim):
`SELECT Id, Name, LLC_BI__Account__c, LLC_BI__Status__c, LLC_BI__Computed_Risk_Grade_Value__c, LLC_BI__Cash_Flow_Coverage_actual__c, LLC_BI__Comments__c, LLC_BI__Final_Risk_Grade__c FROM LLC_BI__Annual_Review__c WHERE Id='a2bbb000001DkCXAA0'`
→ `RG-0000002`, account `001bb00001I6PfJAAV`, **Status `In Review`** (not the `Not Approved` default
proven in wave 3 probe 4, so the explicit-status contract is working), computed grade `6`, cash flow
coverage `1.35`, comments present, formula `LLC_BI__Final_Risk_Grade__c` `6`. **No decision value
written**, per the A33.3.1 allowlist.

**Idempotency fence tested live.** The identical request was replayed with the same key and the
already-consumed token: response `ok: true`, **`replayed: true`**, same `riskRatingReviewId`, and the
account still held **exactly 1** review. A replay reports the prior result and writes nothing.

## `execute_new_facility` — DEFECT, and it is architectural

**Verbatim response:** `isSuccess: false`, `statusCode: UNKNOWN_EXCEPTION`, message
`An Apex error occurred: System.LimitException: Apex CPU time limit exceeded`. Wall clock 22 s.

**Root cause, proven rather than inferred.** `ExecuteNewFacility.pollForLoanDetail` implements the
declared wait as an **in-transaction busy-spin** (`while (DateTime.now().getTime() < spinUntil) { }`,
with the comment "Apex has no sleep"). Three measurements settle it:

1. **Phase 1 is cheap.** A bare loan insert on the throwaway package cost **681 ms CPU** of the
   **10,000 ms** synchronous limit — 9,319 ms of headroom. The insert is not the problem.
2. **The spin burns real CPU.** A controlled 6,000 ms spin consumed **6,511 ms** of CPU. The staged
   `waitBudgetMs` is **30,000 ms**, which is 3x the entire synchronous CPU ceiling.
3. **The wait can never succeed at all.** In one transaction: insert the loan, spin 6 s (well past the
   ~4 s the flow needs), re-query → **`LLC_BI__Loan_Detail__c` = null**. After the same transaction
   committed, the same loan read `LLC_BI__Loan_Detail__c` = `a4Wbb000001GhrdEAC`. **The Loan Detail is
   created by an AFTER-COMMIT async-path flow and is structurally invisible to the transaction that
   inserted the loan.**

So the wait is not slow, it is **impossible**: the thing being waited for cannot appear until the
waiting transaction ends. The tool then spins its full 30,000 ms budget and dies on CPU at ~10,000 ms,
which also means its own designed `filed_unverified` fallback is **unreachable** — the platform fault
always fires first. Lowering the budget below the ceiling would reach `filed_unverified`, but never
`verified`, so phase 2 (the Qualification → Proposal hop) could never auto-run either.

**This is not a tuning problem and must not be fixed by changing a constant.** No synchronous invocable
can observe this child. The fix is a design change: return after phase 1 with the loan id and a
`filed_unverified` wait step, and let the caller re-invoke once the Loan Detail appears — which the
existing idempotency fence already supports and which A33.3.3's "no dependent auto-run on an unverified
precondition" rule already anticipates. The hop itself is fine: wave 3 probe 9 finding 2 proved
Qualification → Proposal works headlessly.

**Failure was atomic and clean.** No Loan was created
(`SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='001bb00001I6PfJAAV'` → 0 rows), and the
staging row stayed `cm_Status__c` `Staged` with `cm_Token_Consumed_At__c` and `cm_Executed_At__c` both
null. The plan remains resumable and the token unspent. The fence behaved correctly under a platform
fault, which is worth as much as the defect finding.

## `execute_covenant_review` — NOT-OBSERVED, by design

Not run. It **updates an existing compliance record**, which is existing org data and therefore outside
this pass's throwaway-only rule of engagement; its first live invocation is founder-gated. There is no
throwaway substitute: hand-creating a compliance record to update would itself fire
`acnpex_covenantApprovalProcess`, which wave 3 probe 8 proved is **Create-triggered with zero entry
filters** and raises a `stepApproval` work item at a **named real human**. Recorded in the envelopes file
as `NOT-OBSERVED` with this reason; **the publish must disclose this tool as contract-observed but never
live-executed.** Its `stage_covenant_review` counterpart was observed and is zero-DML.

## Wave 3 findings confirmed as shipped in the tool copy

The stage responses carry the wave-3 evidence in banker language, which closes the loop from probe to
product: the name-rewrite warning ("The org rewrites the facility name as *Account - Product -
Amount*"), the async Loan Detail described as a flow rather than a job, `LV06` quoted verbatim as the
`heldReason` on both credit-action tools, the covenant tool stating that the chain "fires only when a
compliance record is CREATED, which this tool never does", and the `_Rnull` and auto-Opportunity
warnings on renewal.

## WAVE 4b: the defect is fixed, and the fix is live-verified (2026-07-26, later same day)

`ExecuteNewFacility` was redeployed at `2026-07-26T04:51:31Z` with a **two-invocation resume design**.
The spin is gone: zero matches for `while (DateTime.now` or `spinUntil` in the deployed body. This
section verifies the fix on a **fresh** throwaway anchor (Account `001bb00001I6Sy3AAF`, Package
`a5Fbb000000IGmHEAW`), not the one the defect run used.

**Invocation 1** (with the decision token) — `terminalState` **`partial`**, `resumable` **true**,
**6 s** wall clock, no fault. Loan `a4Zbb0000027KdZEAU` created at Qualification. `write_loan` and
`verify_loan` **verified**; `wait_loan_detail` **`waiting`** with the honest detail "nCino creates the
Loan Detail moments after this filing, in a separate transaction. **It cannot be seen from here.**";
the three downstream steps **`pending`**; `loanDetailId` null. The org-assigned name was reported back
rather than the submitted one: `ZZ-VERIFY-20260726B DO NOT USE - Term - $750,000.00`.

**Gap:** 12 s. Pre-resume SOQL confirmed the org had filled `LLC_BI__Loan_Detail__c` with
`a4Wbb000001Gi1JEAS` — the after-commit flow behaving exactly as wave 3 probe 5 measured.

**Invocation 2** (same `stagingId`, `planHash`, `idempotencyKey`, approver) — `terminalState`
**`success`**, `resumable` **false**, **4 s** wall clock. All six functional steps **verified**:
`wait_loan_detail` "nCino created Loan Detail a4Wbb000001Gi1JEAS", `write_loan_purpose` "Primary loan
purpose set to business_expansion", `hop_to_proposal` "Stage moved from Qualification to Proposal",
`verify_hop` "Facility reads back at stage Proposal". `observe_loan_officer` correctly
`filed_unverified`. **No still-waiting occurred; one resume sufficed.**

**Independent SOQL verification** (not the tool's own claim): the Loan reads `Stage` **Proposal**,
`Status` Open, Product Term, Amount 750000, Loan Detail `a4Wbb000001Gi1JEAS`, loan officer org-assigned;
the Loan Detail carries `LLC_BI__Primary_Loan_Purpose__c` **`business_expansion`** with
`Application_Method` `Online`; the staging row reads `cm_Status__c` **Completed**,
`cm_Result_Record_Id__c` `a4Zbb0000027KdZEAU`, `cm_Token_Consumed_At__c` `04:55:57Z` (invocation 1) and
`cm_Executed_At__c` `04:57:12Z` (invocation 2). **The token is consumed exactly once, by invocation 1**,
which is precisely what the two-call contract promises.

**Replay tested.** A third identical call on the now-Completed row returned `ok true`, `replayed true`,
the same `loanId`, and created **no duplicate** (account still held exactly 1 loan). The fence holds
across all three call shapes: fresh, resume, replay.

### Caller-contract caveat the seam MUST honour

`decisionToken` is declared `required=true` on the `@InvocableVariable`, and **the Actions API enforces
that at the platform boundary, before Apex runs.** Sending `"decisionToken": null` on invocation 2 is
rejected outright:

```
statusCode: REQUIRED_FIELD_MISSING
message:    Missing required input parameter: decisionToken
```

Omitting the key behaves identically. The Apex resume path never reads the token — it dispatches on the
staging row's status first — so this is purely a wire-contract mismatch, not a logic bug. **The caller
must send a non-blank value on invocation 2.** The captured envelope re-sends the original stage token,
which is the natural caller behaviour and works. Either standardise on "always resend the stage token",
or drop `required=true` on that variable if a literal null is wanted. Left as-is and documented rather
than changed, because changing it is a metadata deploy and this pass deploys nothing.

### Coverage note: this path is probe-verified, not test-covered

The invocation-2 success path **cannot be reached in Apex test context**. The Loan Detail is created by
an after-commit async-path flow, and test context neither commits nor runs that flow, so no unit test
can ever observe `wait_loan_detail` reaching `verified` or the hop executing. The deployed tests
necessarily cover the still-waiting branch only. **The success path's evidence is this ledger row**, and
that is the correct arrangement rather than a gap to close: it is the same class of fact as the rollup
in probe 6 or LV06 in probe 9 — an org behaviour that only the org can demonstrate. Any future refactor
of `ExecuteNewFacility` must re-run this live two-call verification, because green tests will not catch
a regression here.

## WAVE 4 RESIDUE-ZERO PROOF

| # | Object | Id | Origin | Live re-query |
|---|---|---|---|---|
| 1 | `Account` | `001bb00001I6PfJAAV` | wave anchor | 0 rows |
| 2 | `LLC_BI__Product_Package__c` | `a5Fbb000000IGZNEA4` | wave anchor | 0 rows |
| 3 | `LLC_BI__Annual_Review__c` | `a2bbb000001DkCXAA0` | `execute_risk_rating_review` | 0 rows |
| 4 | `LLC_BI__Loan__c` | `a4Zbb0000027KSHEA2` | CPU measurement | 0 rows |
| 5 | `LLC_BI__Loan__c` | `a4Zbb0000027KTtEAM` | in-transaction proof | 0 rows |
| 6 | `LLC_BI__Loan_Detail__c` | `a4Wbb000001GhrdEAC` | org automation | 0 rows |
| 7-11 | `cm_Action_Staging__c` | `a8abb00001KtbXGAAZ`, `a8abb00001KtsFBAAZ`, `a8abb00001KtnfnAAB`, `a8abb00001KtvRVAAZ`, `a8abb00001KtIUCAA3` | the five stage calls | 0 rows each |
| 12 | `Account` | `001bb00001I6Sy3AAF` | wave 4b anchor | 0 rows |
| 13 | `LLC_BI__Product_Package__c` | `a5Fbb000000IGmHEAW` | wave 4b anchor | 0 rows |
| 14 | `LLC_BI__Loan__c` | `a4Zbb0000027KdZEAU` | wave 4b invocation 1 | 0 rows |
| 15 | `LLC_BI__Loan_Detail__c` | `a4Wbb000001Gi1JEAS` | org automation, wave 4b | 0 rows |
| 16 | `cm_Action_Staging__c` | `a8abb00001Ktj4gAAB` | wave 4b stage call | 0 rows |

**Sweep 1, by id:** ids 1-11 all at `totalSize 0`; ids 12-16 (wave 4b) all at `totalSize 0`.
**Sweep 2, by name pattern**, run after both passes: `Account LIKE 'ZZ-VERIFY%'` 0,
`LLC_BI__Loan__c LIKE 'ZZ-VERIFY%'` 0, `LLC_BI__Product_Package__c LIKE 'ZZ-VERIFY%'` 0,
`cm_Action_Staging__c` key `LIKE 'zz-verify%'` 0, and `Account LIKE 'ZZ-PROBE%'` 0 (wave 3 still clean).
**Sweep 3, recycle bin:** wave 4 — `Database.emptyRecycleBin` over 11 ids, 9 purged, 2 already absent,
final `ALL ROWS` pass **`live=0`, tombstones=11**. Wave 4b — over 5 ids, 4 purged, 1 already absent
(the cascade-deleted Loan Detail), final `ALL ROWS` pass **`live=0`, tombstones=5**.

The wave-4 `execute_new_facility` defect run created nothing to sweep: its transaction rolled back
atomically. The wave-4b run created a full tree and it was removed in full.

**Untouched:** Piedmont `001bb00001DLtRMAA1` and its loans, Sterling, BlueSky's `COMP-0468`, and every
other pre-existing record. No metadata deployed. Server definition untouched.

---

# WAVE 5: borrowing structure + field dependencies, 2026-07-26

**Purpose.** Establish with org evidence how bankinggpt models entity involvement on a facility, so the
New Facility flow can carry a borrowing-structure step (existing accounts as co-borrowers and
guarantors; **new legal entities are out of scope, that is onboarding**). Plus a metadata-only pass on
dependent picklists for every field our write tools touch.

**Actor and hygiene:** same as waves 3 and 4. Fixture: two throwaway accounts, one package, one loan,
two involvement rows. Deleted, residue proof at the end.

## 5.1 Object map

| Object | Label | Verdict |
|---|---|---|
| **`LLC_BI__Legal_Entities__c`** | **Entity Involvement** | **THE junction.** Account-to-Loan with a role. 35 rows. |
| `LLC_BI__Connection__c` | Connection | Account-to-Account relationship graph (`Connected_From` / `Connected_To`, `LLC_BI__Role__c` of 19 values like Parent, Subsidiary, Officer). **Relationship-level, not facility-level.** Not the borrowing structure. |
| `LLC_BI__Connection_Role__c` | Connection Role | Config object defining the roles above. Not transactional. |
| `LLC_BI__Product_Connection__c` | Product Connection | Product-to-Product bundling/dependency. Unrelated. |
| `LLC_BI__Treasury_Service_Involvement__c` | Treasury Service Involvement | Treasury products, out of scope. |
| `LLC_BI__Entity_Compliance__c` | Entity Compliance | Per-entity compliance, adjacent but not the structure. |

### `LLC_BI__Legal_Entities__c` shape (61 fields)

- **Hard-required: exactly one** — `LLC_BI__Account__c` (the involved entity), `cascadeDelete: true`,
  so involvement rows die with the account.
- **Anchors, both nillable:** `LLC_BI__Loan__c` and `LLC_BI__Product_Package__c`. Every real row in the
  org populates **both**. Also present: `LLC_BI__Deposit__c`, `LLC_BI__Loan_Collateral__c`,
  `LLC_BI__Treasury_Service__c`, `LLC_BI__Doing_Business_As__c` (a second Account lookup).
- **THE ROLE FIELD is `LLC_BI__Borrower_Type__c`.** Active values, verbatim:
  **`Borrower`, `Guarantor`, `Limited Guarantor`, `Co-Borrower`, `Related Entity`, `Grantor`,
  `Contractor`**. Not record-type scoped (Master RT returns all seven). Not restricted, not dependent.
- **There is NO primary-borrower boolean.** The role *is* the flag. Five **formula** fields derive from
  it and are non-createable: `LLC_BI__Is_Borrower__c`, `Is_CoBorrower__c`, `Is_Guarantor__c`,
  `Is_Grantor__c`, `Is_Related_Entity__c` (numeric 1/0). **Never write these.**
- **Ownership:** `LLC_BI__Ownership__c` (percent, createable). **Guaranty:**
  `LLC_BI__Guarantee_Limit__c`, `LLC_BI__Contingent_Amount__c`, `LLC_BI__Guaranty_Amount__c`
  (`Unlimited` / `Amount of Note` / `Limited`), `LLC_BI__Contingent_Type__c` (`Joint & Several` /
  `Pro Rata` / `Assign Specific`). `LLC_BI__Limited_Guaranty_Amount__c` is a formula.
- **Other defaults:** `LLC_BI__Is_Included_In_Global_Analysis__c` defaults **true**;
  `Exclude_From_Account_Exposure__c` and `Exclude_From_Product_Package_Exposure__c` default false.
  `LLC_BI__Order__c` is a display-order double. `LLC_BI__Entity_Type__c` =
  `Operating Company / Sole Proprietorship / EPC / Individual`.
- **Record types:** `Loan Involvement` (`012bb000000NNduAAG`), `Deposit Involvement`
  (`012bb000000NNdtAAG`), `Master` (default). **Neither named type is `available` to the running
  profile** — same pattern as Product Package in wave 3. Inserts land on `Master`.
- **`Name` is a writable text field that the org overwrites**, exactly like Loan. Our probe submitted no
  Name and the org stored `a4Lbb000000NIyj` (the record's own id prefix). Some existing rows carry a
  *different* id in Name (record `a4Lbb000000Fu3WEAS` is named `a4Lbb00000076qH`), consistent with
  clone-carried values. **Never display or rely on this Name.**

### Validation rules, verbatim (4 active, 1 deprecated)

| Rule | Active | Formula | Message |
|---|---|---|---|
| `Contingent_Amount_Exceeds_Loan_Amount` | yes | `LLC_BI__Contingent_Amount__c > LLC_BI__Loan__r.LLC_BI__Amount__c` | "Contingent amount cannot exceed the loan amount." |
| `Contingent_Amount_Less_Than_0` | yes | `LLC_BI__Contingent_Amount__c < 0` | "Contingent Amount must be greater than 0." |
| `Contingent_Amount_and_Contingent_Percent` | yes | `( LLC_BI__Contingent_Amount__c > 0 && LLC_BI__Ownership__c > 0) && (!CONTAINS(TEXT(LLC_BI__Borrower_Type__c) , 'Household'))` | "Only one field can be used to calculate contingent guarantee. Please specify either amount or percentage before saving." |
| `Ownership_Less_Than_0` | yes | `LLC_BI__Ownership__c < 0` | "Contingent Percentage must be greater than 0." |
| `HMDA_Demographic` | **no** | — | `--DEPRECATED--` |

**Two traps in that table.**

1. **`Contingent_Amount_and_Contingent_Percent` is effectively unconditional.** Its escape hatch tests
   whether the role contains `Household`, and **no active `Borrower_Type` value contains `Household`**.
   So the rule always applies: **`LLC_BI__Ownership__c` and `LLC_BI__Contingent_Amount__c` are mutually
   exclusive on the same row.** Probe-confirmed below.
2. **`Ownership_Less_Than_0` has a mismatched message.** The formula tests `LLC_BI__Ownership__c`; the
   message says "Contingent Percentage". Same class of defect as `Mandatory_comment` in A33.4.7(b):
   **mirror the formula's field, not the message's noun.**

### Automation: 5 triggers across 4 namespaces, plus flows

`LLC_BI.LegalEntitiesTrigger` (all six contexts), `nCRED.legalEntity_AfterUpdate`,
`nCRED.legalEntity_BeforeDelete`, `LLC_HI.entityInvolvement` (after insert/update/delete),
`nCino.LegalEntitiesTrigger` (after insert). Flows: `nCino Baseline - Record Trigger: Entity Involvement
Before Save`, plus two org-authored agent-action flows, `Create Involvement Tool` and `Get Entity
Involvement Tool` — **worth a look before we build our own, someone has already modelled this surface.**

## 5.2 How real deals model it (read-only)

Role distribution across all 35 rows: **`Borrower` 25, `Guarantor` 6, `Co-Borrower` 1,
`Related Entity` 1, null 2.** No `Limited Guarantor`, `Grantor` or `Contractor` in practice.

Piedmont's two facilities each carry exactly two rows: a `Borrower` row for Piedmont itself and a
`Guarantor` row for **Margaret Holloway**, a natural person. Every row sets `LLC_BI__Ownership__c = 100`
— including guarantors — so in this org Ownership is used as an involvement percentage, not an equity
stake. Given VR 3 above, that means **`Contingent_Amount` is null on every real row**.

Every real row populates **both** `LLC_BI__Loan__c` and `LLC_BI__Product_Package__c`.

## 5.3 Does a Loan insert auto-create a primary involvement row? **NO.**

The decisive test, with a built-in control. A throwaway loan was inserted
(`a4Zbb0000027MM1EAM`) and left for 20 seconds:

- **Control:** `LLC_BI__Loan_Detail__c` came back as `a4Wbb000001Gm05EAC` — the after-commit automation
  pipeline demonstrably ran to completion.
- **Result:** `SELECT Id … FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c='a4Zbb0000027MM1EAM' OR LLC_BI__Product_Package__c='a5Fbb000000IGsjEAG' OR LLC_BI__Account__c IN (…)`
  → **0 rows.**

Corroborated by timestamp analysis of all 25 loan-linked rows in the org: the gap between loan creation
and involvement creation ranges from **1 second to 118,037 seconds (1.4 days)**, with only 7 of 25 inside
2 seconds. Automation produces a consistent delta; this scatter is a human in a wizard, and the
day-later rows are guarantors being added after the fact.

**VERDICT: our tool MUST create the borrower involvement row. There is no auto-created row to
duplicate.** A New Facility that creates a loan and stops leaves a facility with **no borrowing
structure at all**, which is exactly the gap the founder asked about.

## 5.4 Probe: involvement inserts on throwaway data

| | |
|---|---|
| **Fixture** | Accounts `001bb00001I7BgdAAF` (ZZ-STRUCT Borrower) and `001bb00001I7GhwAAF` (ZZ-STRUCT Guarantor); package `a5Fbb000000IGsjEAG`; loan `a4Zbb0000027MM1EAM` |
| **Borrower request** | `POST …/LLC_BI__Legal_Entities__c` `{"LLC_BI__Account__c":"001bb00001I7BgdAAF","LLC_BI__Loan__c":"a4Zbb0000027MM1EAM","LLC_BI__Product_Package__c":"a5Fbb000000IGsjEAG","LLC_BI__Borrower_Type__c":"Borrower","LLC_BI__Ownership__c":100}` |
| **Response** | `{"id":"a4Lbb000000NIyjEAG","success":true,"errors":[]}` |
| **Guarantor request** | same shape, account `001bb00001I7GhwAAF`, `"LLC_BI__Borrower_Type__c":"Guarantor"` |
| **Response** | `{"id":"a4Lbb000000NJ0LEAW","success":true,"errors":[]}` |
| **Verification** | `SELECT Id, Name, LLC_BI__Account__r.Name, LLC_BI__Borrower_Type__c, LLC_BI__Ownership__c, LLC_BI__Is_Borrower__c, LLC_BI__Is_Guarantor__c, LLC_BI__Is_Included_In_Global_Analysis__c, LLC_BI__Exclude_From_Account_Exposure__c, CreatedDate FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c='a4Zbb0000027MM1EAM' ORDER BY CreatedDate` → Borrower row: Name `a4Lbb000000NIyj` (org-assigned), Ownership 100, **`Is_Borrower__c` 1, `Is_Guarantor__c` 0**; Guarantor row: **`Is_Borrower__c` 0, `Is_Guarantor__c` 1**; both `Is_Included_In_Global_Analysis__c` **true**, both exposure-exclusion flags **false**. |
| **Result** | **SUCCESS both rows.** The role formulas derive correctly with no extra input. A second account in a second role on the same facility is accepted. |
| **Controlled negative test** | `PATCH …/a4Lbb000000NJ0LEAW` `{"LLC_BI__Contingent_Amount__c":50000}` on a row already carrying `Ownership = 100` → `FIELD_CUSTOM_VALIDATION_EXCEPTION`, verbatim **"Only one field can be used to calculate contingent guarantee. Please specify either amount or percentage before saving."** The mutual exclusion is real and reachable through the API. |
| **Settles** | The involvement write contract: one required field, the role picklist, both anchors, ownership. A borrowing-structure step is buildable from existing accounts today. |

## 5.5 FIELD DEPENDENCIES (metadata only, zero writes)

Decoded from each field's `validFor` bitmap against its controller's value list.

**Result: the Product chain is NOT dependent.** `LLC_BI__Product_Line__c`, `LLC_BI__Product_Type__c` and
`LLC_BI__Product__c` are three **independent, unrestricted** picklists —
`dependentPicklist: false`, `controllerName: null`, `restrictedPicklist: false` on all three. There is no
Line-to-Type-to-Product combination matrix in this org to mirror or validate against.

**Dependent picklists that DO exist on `LLC_BI__Loan__c` (3), verbatim combinations:**

| Dependent field | Controller | Controlling value | Allowed dependent values |
|---|---|---|---|
| `LLC_BI__Lead_Specifics__c` | `LLC_BI__LeadSource__c` | `Broker` | `Other` |
| | | all 14 others | *(none)* |
| `LLC_BI__Lost_To__c` | `LLC_BI__Status__c` | `Withdrawn` | `US Bank`, `Other` |
| | | all 10 others | *(none)* |
| `LLC_BI__Structure_Hierarchy__c` | `LLC_BI__Structure__c` | `Multi Level Future` | `Main`, `Limit`, `Sub Limit`, `Takedown` |
| | | `Regular Future` | `Takedown` |
| | | `ELOC`, `Letter of Credit`, `Term Loan/Current` | *(none)* |

**`LLC_BI__Product_Package__c`, `LLC_BI__Legal_Entities__c` and `LLC_BI__Collateral_Valuation__c` have
ZERO dependent picklists.**

**None of the three dependent fields is on any write field list our tools use.** Our new-facility write
set is `Account`, `Product_Package`, `Stage`, `Status`, `isRenewal`, `Is_Modification`, `Product`,
`Amount`. So **no dependent-picklist constraint currently binds any tool**. The one to watch:
`LLC_BI__Status__c` controls `Lost_To`, so if a future tool ever writes `Status = 'Withdrawn'` it must
also offer `Lost_To` from `{US Bank, Other}`.

### The real constraint is RECORD-TYPE SCOPING, and the API does not enforce it

The global describe and the record-type-scoped list **disagree**, and our panel reads the wrong one if it
trusts the describe:

| Field | Global describe | Commercial Loan RT `012bb000000NfLpAAK` | Missing under the RT |
|---|---|---|---|
| `LLC_BI__Product__c` | 7 values | 6 values | **`Term`** |
| `LLC_BI__Stage__c` | 11 values | 10 values | **`Complete`** |
| `LLC_BI__Status__c` | 11 values | 7 values | **`Pre-approval`, `Pre-approved`, `Pre-qualification`, `Pre-qualified`** |

**Probe-proven: the API accepts a record-type-invalid value silently.**
`PATCH …/LLC_BI__Loan__c/a4Zbb0000027MM1EAM` `{"LLC_BI__Product__c":"Term"}` on a record whose
`RecordType.Name` is `Commercial Loan Record Type` returned **204 No Content**, and the record read back
`LLC_BI__Product__c = Term`. All three picklists are `restrictedPicklist: false`, so there is no
platform enforcement at the API boundary at all.

**We have already done this.** The wave-4b `stage_new_facility` call passed `"product":"Term"` and the
resulting Commercial-record-type loan was named `… - Term - $750,000.00`. That loan carried a picklist
value its own record type does not offer — invisible over the API, visible the moment a banker opens it.

**Consequences, both required:**
1. **The panel must source picklist values from the record type**, via
   `/services/data/v67.0/ui-api/object-info/{object}/picklist-values/{recordTypeId}/{field}`, never from
   the global describe.
2. **The server must validate the combination**, because nothing else will. Record-type scoping is a UI
   convention here, not a constraint.

`LLC_BI__Borrower_Type__c` is **not** record-type scoped: the Master RT returns all seven values,
matching the describe.

## WAVE 5 RESIDUE-ZERO PROOF

| # | Object | Id | Live re-query |
|---|---|---|---|
| 1 | `Account` | `001bb00001I7BgdAAF` | 0 rows |
| 2 | `Account` | `001bb00001I7GhwAAF` | 0 rows |
| 3 | `LLC_BI__Product_Package__c` | `a5Fbb000000IGsjEAG` | 0 rows |
| 4 | `LLC_BI__Loan__c` | `a4Zbb0000027MM1EAM` | 0 rows |
| 5 | `LLC_BI__Loan_Detail__c` | `a4Wbb000001Gm05EAC` | 0 rows (cascade) |
| 6 | `LLC_BI__Legal_Entities__c` | `a4Lbb000000NIyjEAG` | 0 rows |
| 7 | `LLC_BI__Legal_Entities__c` | `a4Lbb000000NJ0LEAW` | 0 rows |

Sweep by name: `Account`, `LLC_BI__Loan__c`, `LLC_BI__Product_Package__c` all `LIKE 'ZZ-%'` → **0 each**
(covers every ZZ prefix from waves 3, 4 and 5). **`SELECT COUNT() FROM LLC_BI__Legal_Entities__c` → 35,
exactly the pre-probe baseline.** Recycle bin: 4 purged, 3 already absent; final `ALL ROWS` pass
**`live=0`, tombstones=7**.

Untouched: Piedmont, Sterling, BlueSky, and all 35 pre-existing involvement rows. No metadata deployed.

---

# WAVE 6: the Hartwell migration, 2026-07-26 — PERMANENT RECORDS

**This wave is not a probe.** It created the flagship demo relationship, and every record **stays**. The
full registry, story and field-population policy live in **`DEMO-RELATIONSHIP.md`**; this section records
only the org facts the migration established and the decisions that a future reader must be able to
audit.

**Founder authorised a migration-mode `Exclude_Validation` bypass. It was never used, because it was
never needed.** That is the headline finding.

## 6.1 A loan CAN be inserted directly at Booked with no bypass

`Loan_Validation_06` keys on `PRIORVALUE(LLC_BI__Stage__c)`. On an **insert** that is blank, so every
`ISPICKVAL(PRIORVALUE(...))` term is false and the rule cannot fire. Only `Loan_Validation_05` applies,
and a non-blank `LLC_BI__lookupKey__c` satisfies it:

| Test (throwaway loan, deleted) | Result |
|---|---|
| Insert `Stage=Booked, Status=Open` **with** `lookupKey` | **SUCCESS** |
| Insert `Stage=Booked, Status=Open` **without** `lookupKey` | `FIELD_CUSTOM_VALIDATION_EXCEPTION` — *"A Loan Number is Required Prior to Changing the Loan Stage to 'Booked' - LV05"* |

Verbatim formulas:
`LV05 = AND( ISPICKVAL(LLC_BI__Stage__c,'Booked'), ISBLANK(LLC_BI__lookupKey__c), !$Permission.LLC_BI__Exclude_Validation)`
`LV06 = AND( OR(ISPICKVAL(PRIORVALUE(Stage),'Qualification') || 'Proposal' || 'Credit Underwriting' || 'Final Review') && (ISPICKVAL(Stage,'Processing') || 'Doc Prep' || 'Closing' || 'Boarding' || 'Booked') && $Permission.LLC_BI__Exclude_Validation = FALSE)`

**Six facilities were created at `Booked` / `Open` with zero bypass, zero metadata change, and the
`Exclude_Validation` fence untouched.** The same `PRIORVALUE` shape means `Review_Validation_01/02` also
do not fire on insert, which let a historical completed Review migrate at `Status = Complete`.

**Method note that matters more than the finding.** The loan-children discovery agent read LV05 and LV06
statically and concluded they *"will block a migration that sets `LLC_BI__Stage__c = 'Booked'`
directly."* The empirical test disproved it. **A static read of a `PRIORVALUE` rule cannot tell you what
happens on insert.** Verify agent conclusions against the org; this one would have cost an unnecessary
permission grant on a shared sandbox.

## 6.2 Record-type enforcement: assignment IS enforced, picklist scoping is NOT

This refines wave-5 lesson 15w with a second, sharper case.

| Surface | Enforced by the API? | Evidence |
|---|---|---|
| `RecordTypeId` the running profile is not assigned | **YES** | `INVALID_CROSS_REFERENCE_KEY: Record Type ID: this ID value isn't valid for the user: 012bb000000NNdjAAG` on `LLC_BI__Collateral__c` |
| **Restricted** picklist value outside the record type | **YES** | `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: bad value for restricted picklist field: Quarterly` on `Acnpex_Statement_Frequency__c` (Financial Ratio RT offers only `Annual` / `Not Annual`) |
| **Unrestricted** picklist value outside the record type | **NO** (wave 5) | `Product = 'Term'` accepted on a Commercial-RT loan that does not offer it |

So "record type scoping is not enforced" is only true of **unrestricted** picklists. Restricted picklists
and record-type assignment are both hard walls. A migration must check `restrictedPicklist` and the
profile's record-type assignments before planning its payloads.

## 6.3 Household is installed but unused; Connections are the real spine

Settled read-only before any insert: all 5 existing Household accounts are test artifacts with **every
FinServ rollup at 0**; **0 of 208 `LLC_BI__Connection__c` rows** use the `Household` or `Household
Member` roles; `Account.ParentId` is null on **all 762** accounts. Only 1 of 8
`FinServ__AccountAccountRelation__c` pairs uses household roles, on a test record.

**Decision: model a commercial family group with `LLC_BI__Connection__c` + `LLC_BI__Legal_Entities__c`,
never a household.** That is what Piedmont does and it is the only exercised path.

Mechanics confirmed by the build: insert **only** the detail-bearing direction;
`LLC_BI.ConnectionTrigger` creates the mirror (`Parent`→`Child`, `Owner`/`Co-Owner`→`Company`,
`Affiliated Company`→itself). 7 inserts produced 14 rows. `LLC_BI__UID__c` is the dedupe key,
`FromId+ToId+RoleId`, and must be populated.

## 6.4 Covenant compliance rows: NOT created, and the flow was NOT deactivated

The founder offered a reversible flow-deactivation. It was declined on evidence.

1. **Piedmont has ZERO compliance rows.**
   `SELECT COUNT() FROM LLC_BI__Covenant_Compliance2__c WHERE LLC_BI__Covenant__r.LLC_BI__Account__c='001bb00001DLtRMAA1'`
   → **0**. Only 6 accounts org-wide have any. The reference relationship carries its compliance story on
   the covenant's own `LLC_BI__Last_Evaluation_Date__c` / `_Status__c` / `_Value__c` plus `Notes`.
2. Creating one fires `acnpex_covenantApprovalProcess` (wave 3 probe 8: Create-triggered, zero filters)
   at a **named real human**, unrecallable.
3. Deactivating the flow is a metadata change in a shared org that would silently swallow *any other
   user's* compliance chain during the window.

**Hartwell's six covenants therefore carry full evaluation history in their own fields and read as a
complete package with no compliance rows.** Consistent with the org's own flagship.

## 6.5 Other org facts established

- **`LLC_BI__Loan_Collateral2__c` needs three parents**, not two: `Collateral`, `Loan`, **and
  `LLC_BI__Loan_Collateral_Aggregate__c`**. The aggregate has no required fields and its Name is
  org-assigned; org convention is **one aggregate per loan**.
- **`Pledge_More_Than_Lendable_Value`** = `AND(Amount_Pledged > Current_Lendable_Value, Authorize == false)`.
  Both operands are writable, so a migration that sets pledged equal to lendable never needs `Authorize`.
  **Account_Must_Have_Authority is INACTIVE**, so no pledging-authority chain is required.
- **`Advance_Rate_Override`** fires when the override is set (including 0) and `Override_Reason` is
  blank. All 43 org collateral types default to an 80% advance rate, so any other rate needs an override
  plus a written reason.
- **The Product Package `Name` is rewritten on insert** to `Account - date - PP`, exactly like the Loan
  name. The rename fires **only on insert**, so a post-insert patch sticks.
- **`LLC_BI__Loan_Number__c` is null on all 181 booked loans** org-wide; the key lives in `lookupKey`
  (`LP###` bulk, `LN####` Piedmont). Follow that, do not invent loan numbers.
- **Field length traps hit during the build:** `LLC_BI__Collateral__c.LLC_BI__Description__c` is 255
  (full narrative goes in `LLC_BI__Collateral_Legal_Description__c`, 32k);
  `LLC_BI__Policy_Exception__c.LLC_BI__Mitigation_Reason_1..3__c` are **100** each.
- **`LLC_BI__Legal_Entities__c` has no `Description` field**; the narrative field is `LLC_BI__Notes__c`.
  It also carries `Migration_ID__c` and `Integration_Source__c`, which are exactly right for provenance.
- **Loan children that do NOT exist as records in this org** (clean negatives, verified by count):
  `LLC_BI__Fee__c` **0 rows org-wide**, `LLC_BI__Participation__c` **0**,
  `LLC_BI__Projected_Draw_Schedule__c` **0**, no amortisation-schedule child of Loan at all, and
  `LLC_BI__Spread__c` **0 rows attached to any loan**. Fees, participations, draw schedules and
  statements are **not** modelled as loan children here. Do not build them.

## 6.6 What was created

84 records inserted directly plus 7 org-generated (6 Loan Details, 7 mirrored Connections): 5 accounts,
7 connections, 1 product package, 6 booked facilities, 21 entity involvements, 6 covenants, 2 covenant
junctions, 4 collateral, 8 valuations, 6 aggregates, 7 pledges, 4 liens, 1 policy exception, 2 pricing
streams, 2 cases, 1 opportunity, 1 review.

Verification sweep: **every one of the 18 object counts matched the design exactly**, and the aggregate
`SUM(Amount) / SUM(Principal_Balance)` over the six facilities returned **46,000,000 / 31,030,000**,
matching the package rollups to the dollar. Pledged amounts per collateral equal lendable value exactly
on all four. Full table in `DEMO-RELATIONSHIP.md`.

**No existing record was modified. No metadata was deployed. No permission was granted or removed. Nothing
was deleted.**

---

## Probe register: everything still outstanding

| Object / question | Status | Note |
|---|---|---|
| `LLC_BI__Collateral_Valuation__c` insert | **CONFIRMED** | Probe 1 |
| `Case` insert | **CONFIRMED** | Probe 2 |
| `LLC_BI__Review__c` insert | **CONFIRMED** | Probe 3 |
| `LLC_BI__Annual_Review__c` (Risk Rating Review) insert | **CONFIRMED** | Probe 4, 2026-07-26. `Not Approved` default proven by write. No `RecordTypeId`, no `OwnerId`, cascade child of Account. |
| `LLC_BI__Loan__c` insert (new facility) | **CONFIRMED** | Probe 5, 2026-07-26. 21 VRs pass, `Name` and `Product` overwritten by the org, Loan Detail created by an async-path Flow in ~4 s. |
| Collateral rollup after a valuation insert | **CONFIRMED (negative)** | Probe 6, 2026-07-26. No rollup, in either arm, and `LLC_BI__Auto_Update_Collateral_Value__c` is not the switch. Bound to the Add Valuation button. |
| `slackv2.caseTrigger` outbound behaviour on Case insert | **CONFIRMED** | Probe 7, 2026-07-26. Trigger runs; 0 callouts, 0 future, 0 queueable, 0 email; gated on `slackv2__Subscription__c` rows. Mechanism is queryable. |
| `acnpex_covenantApprovalProcess` **entry criteria** | **CONFIRMED** | Probe 8, 2026-07-26, from Flow metadata, zero writes. `ApprovalWorkflow` `301bb00000T6YxZAAV`, `recordTriggerType: Create`, **zero filters**. Never fires on update. Our update-only tools cannot start it. |
| `LLC_BI__Covenant_Compliance2__c` field update | PROBE PENDING | Still unprobed as a *write*. The only throwaway route needs a hand-created compliance record, whose create fires the chain at a named human (`robert.mcclaren@outlook.com`). **HELD**, Probe 8. |
| Covenant approval chain, live-write arm | **HELD** | Probe 8. Cannot be contained to throwaway data; both available paths violate the prime directive. |
| Product Package creation | **CONFIRMED** | Probe 9, 2026-07-26. Creatable on the `Master` record type. The A33.4.3(d) `Deal_Proposal` gap is a labelling issue, not a write blocker. |
| `LLC_BI__Loan__c` Qualification → Proposal hop | **CONFIRMED** | Probe 9, 2026-07-26. Works headlessly once `LLC_BI__Primary_Loan_Purpose__c` is set on the Loan Detail. A33.4.3 phase 2 is shippable. |
| `LLC_BI__Loan__c` clone and `LLC_BI__LoanRenewal__c` | **HELD, phase-limited** | Probe 9. Blocked by `LV06` (no bypass): `Booked` is unreachable by API and is a precondition for any credit action. `stage_*` shippable, `execute_*` HELD. |
| `LLC_BI__Legal_Entities__c` (Entity Involvement) insert | **CONFIRMED** | Wave 5. One required field; role is `LLC_BI__Borrower_Type__c`; Borrower + Guarantor rows on one facility both accepted. |
| Loan insert auto-creates a borrower involvement row? | **CONFIRMED: NO** | Wave 5.3, with the Loan Detail as control. Our tool must create it; no duplication risk. |
| Ownership vs Contingent Amount mutual exclusion | **CONFIRMED** | Wave 5.4 negative test; the rule's `Household` escape hatch matches no active role value. |
| Dependent picklists on our write fields | **CONFIRMED: NONE** | Wave 5.5. The Product Line/Type/Product chain is three independent unrestricted picklists. Three dependent fields exist on Loan, none on our write lists. |
| Record-type picklist scoping enforced by the API? | **CONFIRMED: NO** | Wave 5.5. `Product = Term` accepted on a Commercial-RT loan that does not offer it. Panel must read RT-scoped values; server must validate. |

# WAVE 7: `LLC_BI__CreateCreditReviewInvoker`, 2026-07-26

**Actor:** `fabian.goetzens@accenture.com.bankinggpt`, System Administrator, through the `sf` CLI and
raw REST. **Question:** is nCino's own Create Credit Review invocable safe to call headlessly, and
does it populate the loan-scope junction the two pre-existing rows leave empty?

**Outcome: CLEAN. The invoker is the right surface and fires nothing at a human.**

## Why the probe was required

The covenant lesson: a create path through managed automation we have not probed can raise approval
work items for real people. `execute_annual_review` currently does a direct insert; switching it to a
vendor invocable is only safe if the invocable's full side-effect surface is known.

## Baseline, captured before any write

`ProcessInstance` 62, `ProcessInstanceWorkitem` 1, `EmailMessage` 40, `Task` 144,
`LLC_BI__Review__c` 5, `LLC_BI__Review_Loan__c` 2, `LLC_BI__Review_Account__c` 2.

## Fixture (throwaway only)

Account `ZZ-PROBE-W7 DO NOT USE` = `001bb00001I7zgbAAB`. Loan = `a4Zbb0000027OywEAE`
(`Qualification`/`Open`, product `Line of Credit`, amount 250000, RT `012bb000000NfLpAAK`).

## Finding 1: `loanIds` is `List<Id>`, not a scalar

Verbatim refusal on the first attempt: `INVALID_INPUT`, *"Unable to convert value
'a4Zbb0000027OywEAE' to Apex type List<Id> for Apex action LLC_BI__CreateCreditReviewInvoker Variable
loanIds"*. The Actions API describe reports `type: ID` with no array marker, so the describe does not
tell you this. Send `"loanIds": ["<id>"]`.

## Finding 2: it works, and it returns the review id

Request: `{"inputs":[{"accountId":"001bb00001I7zgbAAB","loanIds":["a4Zbb0000027OywEAE"],"reviewType":"Annual"}]}`
Response: `isSuccess true`, `outputValues.error` **null**, `outputValues.reviewIds`
**`["a5nbb00000kbAqlAAE"]`**.

## Finding 3: what it populates, and the two gaps for our tool

Review `R-6`: `LLC_BI__Status__c` **`In Progress`** (the invoker sets it, unlike a raw insert which
leaves it null), `LLC_BI__Review_Type__c` **`Annual`** (from our input), RecordType
**`Account Review In Progress`** (org-assigned), `cm_Review_Stage__c` `Qualification` (field default).
Two gaps a redesign must close: **`LLC_BI__Is_Agentic_Review__c` came back `false`** (the invoker does
not know the review is agent-authored) and **`LLC_BI__Product_Package__c` is null**.

## Finding 4: THE ANSWER on loan scope, and the two empty rows were bad data

**One `LLC_BI__Review_Loan__c` child was created WITH the loan populated**: `a5mbb000001VWizAAG` ->
`LLC_BI__Loan__c` = `a4Zbb0000027OywEAE`. Its `LLC_BI__Data__c` was null.

This settles the earlier discovery worry. The two pre-existing `Review_Loan` rows (April 2025) have
null loan AND null data, and they are **stale rows, not the pattern**. The invocable populates the
lookup directly, so no `Data` blob has to be reverse-engineered. Hand-rolling was never necessary.

**`LLC_BI__Review_Account__c` children: 0.** Consistent with those rows snapshotting involvement rows:
the throwaway account had no borrowing structure, so there was nothing to snapshot. Untested on an
account that HAS involvement rows.

## Finding 5: NOTHING fired at a human

`ProcessInstance` 62, `ProcessInstanceWorkitem` 1, `EmailMessage` 40, `Task` 144 — all **unchanged**,
and **0 rows created today** on each. `ProcessInstance` with `TargetObjectId` = the probe review:
**0**. Every `AsyncApexJob` in the window (22:25 to 22:30Z) is pre-existing scheduled nFORCE and
TwilioSF work, and the invoker call was at **22:32:01Z**, after all of them. No approval chain, no
work item, no email, no task.

**Verdict: gate (c) is not triggered. The redesign in (b) may proceed.**

## Residue-zero proof

`DELETE` returned HTTP 204 for the Review, the Loan and the Account. Re-query by id returned 0 for the
Review, the **Review_Loan child** (cascaded with its parent, no separate delete), the Loan and the
Account. Org-level counts back to baseline exactly: Review 5, Review_Loan 2, Review_Account 2.

---

## Wave 2 build: the covenant live-update arm stays PROBE PENDING

**Status:** `stage_covenant_review` and `execute_covenant_review` are BUILT, TESTED and DEPLOYED
(2026-07-26), but their live update path has never run against a real compliance record.

**Why the test suite does not clear it.** Probe 8 established that `acnpex_covenantApprovalProcess`
fires on CREATE only, unconditionally, with zero entry filters, and that its stage 1 step is a
`stepApproval` assigned to a named human. That address resolves to **active** users in this org.
Testing against a real record would require a fixture to CREATE one, which fires the chain at a real
person; test DML rolls back, but whether a flow-based approval orchestration's notification survives
the rollback cannot be established without firing it once. Probe 8 refused that and the refusal
stands, so `ExecuteCovenantReview` carries a `@TestVisible` seam and the suite injects a record
instead of writing one.

**What clears it.** A founder-gated first invocation of `execute_covenant_review` against one of the
140 existing compliance rows, read-only-first, with the founder aware. That is the coordinator's
verification step, not the build's. Until then the tool ships functional with this marker.

**What is already settled and needs no further probe:** the tool cannot start the approval chain by
construction, because it only ever updates. That is metadata-proven, not inferred.

## Standing rule: loan-clone probes use a throwaway account

**Founder decision, Fabian, 2026-07-26.** The deferred loan-clone probes run **in bankinggpt**, but
**never against Piedmont and never against any demo-visible account**.

Procedure, and every step is recorded here when the probe runs:

1. Create a **disposable Account and Product Package** for the probe. Name them so nobody mistakes them
   for demo data (`ZZ-PROBE-<date>`).
2. Create the facility to be cloned on that package.
3. Exercise the credit action and capture every returned id: the clone, the `LLC_BI__LoanRenewal__c`
   junction row, and anything else the action created.
4. **Clean up and verify the cleanup.** Query for every captured id afterwards and record the result.
   Chain rows are never deleted in production paths, but a throwaway probe account is exactly the case
   where the whole tree gets removed. If any artefact cannot be removed, say so here rather than
   assuming.

Rationale: a credit action is not cleanly reversible, and its async failure mode reverts records to the
Recycle Bin with no error. A half-built clone or an orphaned junction row on the flagship demo
relationship would surface in the next demo and would be effectively unfixable. No exceptions, including
"just one quick test".

## Outstanding items on this ledger itself

1. **RESOLVED 2026-07-26: deletion of Probe 2 and Probe 3 confirmed.** Both delete calls returned
   success at probe time, and both absences were re-verified by independent SOQL after this item was
   raised (zero rows for each id, verbatim queries recorded in the probe rows above). Piedmont carries
   no probe residue.
2. **Verbatim query text and raw results were not captured** for any of the three verifications. Every
   future probe records the exact call and the exact returned payload. A ledger that paraphrases its
   own evidence is weaker than one that quotes it.
   **CLOSED for wave 3 (2026-07-26):** Probes 4 to 9 carry verbatim request bodies, verbatim responses,
   verbatim verification SOQL and verbatim returned values. Wave 1's three probes remain paraphrased and
   are not re-openable retroactively; treat their evidence as weaker than wave 3's on that basis alone.
3. **Every probe from here on records the running identity explicitly**, and the write-contract probes
   are re-run as the **service identity** before any tool ships. All three probes above ran as System
   Administrator, and `createable` / `updateable` are FLS-scoped to the running user.
   **Still open after wave 3.** Probes 4 to 9 also ran as System Administrator
   (`005bb00000ftouDAAQ`). The service-identity re-run is untouched and remains a prerequisite for
   shipping any write tool, in particular for the renewal and modification flag fields where missing FLS
   mis-types loans **silently**.
4. **Probe 1's parent id is wrong** (raised by wave 3). Probe 1 records "Collateral `COL-000758`, id
   `a34bb00000398KnAAI`". `a34` is the `LLC_BI__Collateral_Valuation__c` prefix, not
   `LLC_BI__Collateral__c` (`a35`); `COL-000758` is `a35bb000000zOgXAAU`. Probe 1's **outcome** stands
   and is independently re-confirmed by Probe 6; only the id attribution is wrong. Any code or doc that
   copied `a34bb00000398KnAAI` as a collateral id must be corrected.
5. **Wave 3 instrumented the org with its own debug plumbing** (`DebugLevel` `ZZ_PROBE_20260726`,
   `TraceFlag` on the probe actor), both created fresh, both deleted, both deletions verified. No
   existing `DebugLevel` or `TraceFlag` was reused or modified. Future waves needing trigger-level
   evidence follow the same pattern: create your own, never borrow, always delete.
