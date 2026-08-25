# Evidence ledger — road to Sept 4

Every gate claim lands here with receipts. No receipt, no claim.

## G0 — WS0 verification campaign (2026-08-20, Archy seat)

| Step | Expected | Observed | Receipt |
|---|---|---|---|
| 0 July receipts | CV-0000000002/3, R-4, permset standing | ALL standing | `a34bb00000399GrAAI`, `a34bb00000399OvAAI`; R-4 `a5nbb00000kZfInAAK` (LLC_BI__Review__c, Piedmont); permset `0PSbb000001Mlu9GAC` assigned to `005bb00000ftouDAAQ` |
| 1 Manifest | Customer360 McpServerDefinition, 23 tools | 23 exact (9 reads, 8 stage, 6 execute) | retrieved `unpackaged/mcpServerDefinitions/Customer360.mcpServerDefinition` 2026-08-20 |
| 1 Hartwell 18/18 | counts per DEMO-RELATIONSHIP | **18/18 green**: 5 accts, 14 conns, 1 pkg, 6 loans (6 Booked+Open+keyed), 6 details, 21 EI, 6 cov, 2 junctions, 4 collateral, 8 valuations, 7 pledges, 4 liens, 1 policy exc, 2 pricing, 2 cases, 1 opp, 1 review | SOQL sweep 2026-08-20; aggregate exact 46,000,000 / 31,030,000 / 6 |
| 2 Apex suite | green | **138/138 pass** after drift fix (below). Correction: docs said "170/170"; the 10 C360 test classes carry 138 tests | testRunId `707bb0000Xh6Y30` (the 22/138 drift run), sync rerun Passed 138/138, 81s |
| 3 Reads live | figures match baked bundle | Snapshot ($46.0MM, grade 4, Booked), Exposure (coverage 1.02, honest nulls), Covenants (compliant, latestComplianceId null by design) all isSuccess:true | Actions API POST `/actions/custom/apex/Customer360*`, 2026-08-20 |
| 4 Stage real mod | plan/hash/token, zero DML, delete row | Staged 15MM→20MM on `a4Zbb0000027MaYEAU`: 5 typed steps (credit_action → verify_clone → apply_changes → observe_side_effects → held_execution), covenantCarryover 1, executionHeld true, planHash `4f8ae3aa…`, single-use token issued. Row deleted, residue unchanged | stagingId `a8abb00001MwM6QAAV` (created+deleted) |
| 5 Bulk valuation stage | items[] one token, zero DML, delete row | 2 items staged (write/verify/rollup steps each), ok:true, planHash `8547a718…`. Domain count before==after (4 valuations). Row deleted, residue 11 | stagingId `a8abb00001MwcXxAAJ` (created+deleted) |
| 6 Artifact golden path | — | **PENDING: needs Fabian's browser** | — |

### Drift found and fixed (the campaign earning its keep)

**116/138 tests failed on first run** — root cause: 24 org-local `*CDC` triggers (created 2026-08-03
by Asmita Karve) on every object we touch, each enqueueing `EventBridgeCallout` (Queueable +
AllowsCallouts → AWS API Gateway, created 2026-07-30). Every test-context DML flushed a callout with
no mock = platform refusal. NOTE: this breaks EVERY Apex test suite in the shared org, not just ours
— worth telling the program team.

Fix (our side only, foreign triggers untouched): `C360TestFixture.NoopCalloutMock` +
`armCalloutMock()` called first in every @TestSetup and test method. Deployed, suite 138/138.
Standing rule: **every new test method arms the mock first.** Commit `f6c0b05`.

Also inventoried: nCino managed package upgrade landed 2026-08-14 (large class/trigger churn, all
`nCino Communicator`). No impact observed on our surface after the callout fix.

### Staging residue (11 rows, KEPT deliberately)

July history: STG-0000000000–0003 + 0019 + 0029 Staged (held plans, incl. the two persisted
loan-modification plans), 0004–0007 + 0016 Completed/consumed (the audit rows behind CV-2/3, R-4,
annual review, new facility). These are the action-history story; campaign probes delete only their
own rows.

**G0: PASSED** (step 6 pending Fabian). Ground is solid; WS1/WS2 may build.

## Mod-execute probe (2026-08-20, greenlit by Fabian incl. approval flows)

**The modification credit action was EXECUTED LIVE for the first time** — on throwaway data,
residue zero. This converts execute_loan_modification from designed to buildable-on-proven-mechanics.

| Observation | Value |
|---|---|
| Door | `acnpex_CreditActionRequest` invocable (org wrapper over the credit-action engine): `{actionType:"Modification", loanIds:[…] (List<String> on the wire), sourcePackageId, isAsync:false}` → sync JSON `{success, outputLoanId, outputPackageId, failureReasons[]}` |
| Precondition found | Running user MUST have a UserRole — engine refuses with "User has not been assigned a role." Fixed: `Commercial Banking Manager` (00Ebb000001BAptEAG) assigned to 005bb00000ftouDAAQ (was null; KEPT — execute needs it) |
| Throwaway fixture | insert-at-Booked re-proven (Account 001bb00001KL2W5AAL → PKG a5Fbb000000Ij57EAC → Loan a4Zbb000002BV49EAG Booked/Open/ZZWS0PROBE1) |
| Clone | a4Zbb000002BV5lEAG: Stage `Qualification`, `Is_Modification=true`, lookupKey auto-suffixed `ZZWS0PROBE1_M1`, same package |
| Parent | untouched Booked/Open, `hasRenewal=true` |
| Junction | RL-00000193 anchor (rev 0, Available, ParentLoanId==RenewalLoanId) + RL-00000194 (rev 1, In Progress, HasActiveRenewalLoan=true) — exactly the Piedmont pattern incl. the self-reference gotcha |
| Cleanup | 2 junctions + 2 loans + package + account deleted; probe residue 0 |

Build consequence for execute_loan_modification: call acnpex_CreditActionRequest sync, verify by
re-query (clone id + junction chain), then apply the staged field changes to the CLONE (Qualification
stage = freely editable), never the parent. The plan's apply_changes step lands on outputLoanId.

## WS0.5 item 1: execute_loan_modification (2026-08-22, worktree c360-ws05, branch ws05-execute-mod)

**The modification pair is complete.** stage_loan_modification is no longer a held plan: the new
`execute_loan_modification` tool runs it behind the single-use decision token, and it was exercised
live on throwaway data over the REST Actions API. Booking the resulting clone is still nCino's own
Submit for Approval run (LV06), and every surface says so.

### Deployed (additive only, nothing pre-existing touched)

| Component | State | Note |
|---|---|---|
| `ExecuteLoanModification.cls` (+meta) | Created | `global with sharing`, contract `{idempotencyKey, stagingId, planHash, decisionToken, approverUserId}`, all `required=true` |
| `StageExecuteLoanModificationTest.cls` (+meta) | Created | 10 methods, real Booked fixture, stubbed engine + one real-bean integration test |
| `StageLoanModification.cls` | Changed | `executionHeld` false, `heldReason` null, header/summary/warnings retired the hold, `held_execution` step relabelled to the BOOKING handoff (id kept), apply_changes field list corrected |
| `StageHeldCreditActionsTest.cls` | Changed | asserts the new non-held modification behaviour; renewal stays held |
| `Customer360.mcpServerDefinition` | Changed | +1 tool row: `execute_loan_modification` → operation `ExecuteLoanModification` |
| `sfdx-project.json` | Changed | `sourceApiVersion` 61.0 → 67.0 (see org facts) |

Deploy receipts: classes `Succeeded`, 38 components, 0 errors. McpServerDefinition `Succeeded`,
1 component. Live manifest re-read from the org: **24 tools** (was 23), `execute_loan_modification`
present (`SELECT ToolName FROM McpServerToolDefinition`, Tooling API).

### Suite

`sf apex run test` over all 11 C360 classes: **149/149 pass, 0 fail**, 38.7s execution,
testRunId `707bb0000XhTCNW`. Was 138 before this work; the 11 new rows are
`StageExecuteLoanModificationTest` (10 methods + its @TestSetup row). Per class: C360ActionStaging 8,
C360WriteGuard 22, C360ZeroDml 4, AnnualReview 8, CollateralValuation 16, CovenantReview 12,
NewFacility 26, RiskRatingReview 11, ServiceRequest 6, HeldCreditActions 25, LoanModification 11.

### Wire probe: REAL execution, throwaway data, residue zero

Envelopes (request AND response, verbatim, both calls plus the replay):
`knowledge/sf-build-v2/wp2/observed-envelopes-execute-loan-modification.json`.

| Step | Observed |
|---|---|
| Fixture | Account `001bb00001KUeaHAAT` "ZZ-WS05-PROBE Borrower" → package `a5Fbb000000IltJEAS` → loan `a4Zbb000002Br4fEAC` inserted AT Booked/Open with lookupKey `ZZWS05PROBE1`, $1,000,000 |
| Stage | `POST /services/data/v67.0/actions/custom/apex/StageLoanModification`, facilityIds shape, requestedAmount 1,500,000 → ok, stagingId `a8abb00001N6Z0XAAV`, planHash `962ba958…`, token issued, **executionHeld false, heldReason null**, 5 steps, zero domain DML |
| Execute | `POST .../ExecuteLoanModification` with approverUserId `005bb00000ftouDAAQ` → ok, **terminalState success**, all four non-observed steps verified |
| Clone | `a4Zbb000002Br6HEAS`: Stage `Qualification`, Status Open, `Is_Modification__c` true, lookupKey `ZZWS05PROBE1_M1`, same package, Amount **1,500,000** (the staged change, applied to the clone) |
| Junctions | `RL-00000197` (`a4Obb000000FXGbEAO`) rev 0 self-referential anchor, Available · `RL-00000198` (`a4Obb000000FXGcEAO`) rev 1, In Progress, RenewalLoanId = clone, HasActiveRenewalLoan true |
| Parent | re-read **unchanged**: Booked / Open / $1,000,000. Only the `hasRenewal__c` formula flipped to true |
| Replay | Second execute with the same idempotency key → ok, `replayed: true`, same clone id, **2 loans on the account, never 3** |
| Cleanup | 2 junctions, 2 loans, package, account, staging row all deleted (HTTP 204 each) |

**Residue proof (SOQL after cleanup):** Account `Name LIKE 'ZZ-WS05%'` = 0 · Loan
`lookupKey LIKE 'ZZWS05%'` = 0 · Product Package `Name LIKE 'ZZ-WS05%'` = 0 · staging
`cm_Idempotency_Key__c LIKE 'ZZ-WS05%'` = 0. Org-wide baselines restored exactly:
`LLC_BI__LoanRenewal__c` back to **43** rows, `cm_Action_Staging__c` back to the **11** kept rows.
A trace flag and one ApexLog created to read a test's debug output were both deleted (HTTP 204);
`SELECT COUNT() FROM ApexLog` = 0. Deleted records sit in the Recycle Bin, as with the August 20 probe.

### Org facts discovered (all new, all cost real time)

1. **`LLC_BI__Interest_Rate__c` DOES NOT EXIST on `LLC_BI__Loan__c`.** The staged plan's
   `apply_changes` step had been declaring it since the tool was written. The real field is
   **`LLC_BI__InterestRate__c`** (percent); `LLC_BI__Current_Interest_Rate__c` is a separate field.
   Corrected in `StageLoanModification`, and the execute tool writes the real one. The held wave never
   caught this because a field name in a plan's `fields` list is never dereferenced until something
   executes the plan.
2. **`LLC_BI__LoanRenewal__c` refuses an insert without `LLC_BI__PreviousVersionStage__c` AND
   `LLC_BI__PreviousVersionStatus__c`** (`REQUIRED_FIELD_MISSING`). The object carries no validation
   rules, triggers or flows, so this is universally-required field configuration. Anything writing a
   chain row by hand must carry both. Found by the first live run of the new suite.
3. **`nFORCE.BeanFactory.getInstance().getBeanByUniqueName('LLC_BI.InvokableCreditActionXPkg')`
   returns NULL inside an Apex TEST context**, and returns the real service at runtime (proved by the
   wire probe). Captured in the suite by an integration-style test that asserts either a verified
   clone or a labelled org refusal; it takes the refusal branch, and that is now recorded rather than
   assumed. This is why the engine sits behind a `@TestVisible` seam.
4. **The bean returns no clone id.** Its output parameters, read off the org's own visible wrapper
   `acnpex_CreditActionRequest`, are `success`, `outputPackageId`, `apexJobId` and `failureReasons`:
   nothing that names the created loan, and our live run confirmed the clone had to be found by query. The org's `acnpex_CreditActionRequest`
   wrapper fakes one by taking the most-recently-created loan on the output package, which races the
   moment two facilities are modified in one call. Our tool maps clone → parent through the
   `LLC_BI__LoanRenewal__c` chain instead, ignoring pre-existing rows and the rev-0 self-reference.
5. **`outputPackageId` equals the SOURCE package for a Modification** (observed `a5Fbb000000IltJEAS`
   both ways). No new package is minted.
6. **The org rewrote the clone's Name after our amount update** to
   "ZZ-WS05-PROBE Borrower - Equipment - $1,500,000.00". Names are read back, never echoed.
7. **`McpServerDefinition` cannot be deployed at `sourceApiVersion` 61.0**: "Not available for deploy
   for this API version", and `--api-version 67.0` on the command does NOT override it (the package
   manifest version comes from `sfdx-project.json`). Bumped to 67.0. This also re-proves lesson 5:
   deploy the classes FIRST and the server definition SECOND. A combined deploy is atomic, so the
   definition's failure rolled back all 38 class components on the first attempt.
8. **`LoanCDC` + `Test.stopTest()` = `CalloutException: You have uncommitted work pending`.** Every
   Loan insert/update enqueues `EventBridgeCallout` (Queueable, AllowsCallouts). Jobs queued inside
   the `Test.startTest`/`stopTest` window are flushed inside the test transaction, which still holds
   uncommitted DML, and the platform refuses the callout before the armed mock is consulted. Fix used
   here: the writing tests stage inside the window and execute AFTER `stopTest`, where nothing
   flushes. The `armCalloutMock()` rule still stands; it is a shield, not a cure.

### UNVERIFIED

- **Multi-facility execution (N > 1) has never run on the wire.** The plan, the engine call and the
  per-facility results are all built for N, and the stage side is tested at N=3, but the live probe
  ran one facility. The partial-failure path (engine succeeds, one facility produces no chain row) is
  likewise code-and-unit-tested only.
- **The clone's covenant carryover was zero on the probe fixture.** nCino's junction-cloning behaviour
  on a facility that actually carries `LLC_BI__Loan_Covenant__c` rows was not observed here.
- **The app still holds this action client-side.** `app/src/channel/writeTools.ts` carries a
  `heldReason` for `loan-modification` and `ConfirmGate` ORs it with the org's answer, so the panel
  will keep showing the action as held until that entry is cleared. Apex and the manifest are ready;
  the client is not, and no client change was made in this work package.
- **No approval was performed and none is claimed.** Reaching Booked still requires nCino's Submit
  for Approval with real approvers. LV06 was never touched and no `Exclude_Validation` permission was
  granted to anyone.

## WS0.5 items 2+3: covenant bulk + valuation hardening (2026-08-22, worktree c360-cov, branch ws05-covenant-valuation)

Two tool pairs. `stage_/execute_covenant_review` rebuilt as PACKAGE-SCOPED BULK; `stage_/execute_collateral_valuation`
hardened. Tool names and the execute contract `{idempotencyKey, stagingId, planHash, decisionToken, approverUserId}`
are unchanged, so the `McpServerDefinition` needed no edit and was not touched. Additive deployment, classes only.

### Part A: covenant review, package-scoped bulk

**Input shape changed, and the old one was dropped.** `stage_covenant_review` now takes required `productPackageId`
plus `assessments[]` of `{covenantId, status, observedValue, reasonForException, narrative, comments}`, optional
`covenantIds[]` as a member selection, and optional `allowNonPending`. The old `accountId` + `covenantComplianceId` +
`result` shape is **gone, deliberately**. It was not cheap to keep: it anchors on a compliance ROW and names no
covenant, so it cannot carry the parent-covenant reads this wave added (Active, Frequency Template, Effective Date),
which are exactly what make the approval-trap warning and the Pending precondition possible. Keeping it would have
meant a second plan shape with a second execute branch that silently skipped both new guards. Lesson 16aa applied to
the removal too: the superseded fields carried `required=true`, and leaving them would have made the new shape
unreachable on the wire.

**New class `C360Covenants`** carries the traversal and the precondition, shared by both tools so the rule cannot
drift between stage-time planning and execute-time resume.

| Rule | How it is implemented | Evidence |
|---|---|---|
| Traversal is a UNION | package → loans → `LLC_BI__Loan_Covenant__c`, UNION package borrower accounts → `LLC_BI__Account_Covenant__c`, deduped by covenant id. Templates excluded (`LLC_BI__Is_Template__c = false`). | Wire probe returned `scopeCount 2` with one covenant reached only by each junction; `attachment` reads `relationship` / `loan` / `both` |
| One plan, one hash, one token, N assessments | Five typed steps per covenant, namespaced `_<n>`: `find_compliance` → `write_assessment` → `write_status` → `verify` → `observe_generation` | Wire probe: 5 steps for 1 planned covenant, all `verified` |
| Pending precondition | A row advances the schedule only from `Pending`. Non-Pending is refused PER COVENANT at stage, and the precondition is re-applied at execute against the re-read row. `allowNonPending` is the only override and it must be carried in the staged plan. | `kb:kAHHu000000XZOTOA4`. Wire probe arm 1 refused the `In Progress` row and wrote the `Pending` one in the same plan |
| Observed value reaches the packaged field | Writes `LLC_BI__Historic_Financial_Indicator__c` (double, org-verified updateable) AND mirrors to `cm_Covenant_Compliance_Indicator_Value__c` | SOQL after the probe: `hist 1.42`, `cm "1.42"` on COMP-0489 |
| Waived is on the allowlist | `C360WriteGuard` UPDATE_TRANSITIONS for the compliance object is now `{Compliant, Waived, Exception}`, plus a new fence on `LLC_BI__Reason_for_Exception__c` = `{Breached, Overdue}` | Org describe, below |
| Structural approval-trap guard | The plan reads Active + `LLC_BI__Frequency_Template__c` + `LLC_BI__Effective_Date__c` per covenant and WARNS when all three are present, naming One-Time templates separately as terminating. Never assumed: the quiet case states the finding too. | `kb:kAHHu000000XZRJOA4`, `PDI-00023403`, `kb:kAHPY00000055lR4AQ` |
| `approvalChainStarted` is MEASURED | Execute snapshots the covenant's compliance row ids before the write and re-queries after, reporting `nextComplianceRowCreated` per item and the batch-level flag. The hard-coded `false` is gone. | Wire probe: `approvalChainStarted false`, matching a SOQL count of 1 row per covenant afterwards |
| Effective Date never written | Already in `C360WriteGuard.FORBIDDEN_FIELDS` for the compliance object; unchanged, and the warning now says why in one sentence. | `PDI-00023403`, open |
| `Exception` is never called a breach | No plan or outcome prose equates them. The distinction is carried in DATA, by a caller-supplied `reasonForException`. | Asserted by test `anExceptionCarriesItsReasonAndIsNeverCalledABreachInProse` |

**Additive read.** `Customer360Covenants` now returns `latestComplianceStatus` and `reasonForException` from the
latest compliance row per covenant. Additive fields only; no existing field changed shape. This is the request in
`knowledge/ws05-side-findings-app.md`: it lets the cockpit read the administrative-versus-financial answer instead of
inferring it from whether a value was measured.

### Part B: collateral valuation hardening

1. **`productPackageId` required** (enforced in Apex, not `required=true`, so the refusal can name the failing item).
   Every item must be pledged to a loan of that package OR owned by the package's borrower through
   `LLC_BI__Account_Collateral__c`. Verified by describe: `LLC_BI__Collateral__c` carries **no account lookup at all**,
   so the ownership junction is the object's only relationship anchor.
2. **`items[]` capped at 20**, with an error naming the cap and the governor reason (per-record CDC queueables against
   a ceiling of 50 per synchronous transaction). This closed a live uncapped exposure on a deployed tool.
3. **`valuationDate` required in Apex**, refused rather than defaulted to today.
4. **Same collateral, same valuation date is refused at stage** (`PDI-00020349`, and a data-quality rule regardless):
   defaulting the date would have made that collision the normal case, which is why 3 and 4 ship together.

### Suite

`sf apex run test` over the 11 C360 classes plus the two Customer360 read classes: **177 tests, 100% pass, 0 fail**
(run `05mbb000001YWGDAA4`). Baseline before this wave was 139 over the 11 classes.

| Class | Methods |
|---|---|
| C360ActionStagingTest | 7 |
| C360WriteGuardTest | 23 |
| C360ZeroDmlTest | 3 |
| Customer360ActionHistoryTest | 8 |
| Customer360CovenantsTest | 5 |
| StageExecuteAnnualReviewTest | 7 |
| StageExecuteCollateralValuationTest | 20 |
| StageExecuteCovenantReviewTest | 18 |
| StageExecuteLoanModificationTest | 10 |
| StageExecuteNewFacilityTest | 25 |
| StageExecuteRiskRatingReviewTest | 10 |
| StageExecuteServiceRequestTest | 5 |
| StageHeldCreditActionsTest | 24 |

`Customer360CovenantsTest` and `Customer360ActionHistoryTest` were **red before this wave** and are not in the
11-class set for that reason: every method failed with "Methods defined as TestMethod do not support Web service
callouts" because neither armed `C360TestFixture.armCalloutMock()`. Both are fixed and both now run.

**The covenant suite no longer uses the compliance-record seam.** The old suite injected a fake row through a
`@TestVisible` seam to avoid firing `acnpex_covenantApprovalProcess`. That seam could not exercise the traversal, the
row selection, the Pending precondition, the per-item isolation or the generation observation, which is to say it
could not test anything this wave added. The suite now creates real throwaway covenants and compliance rows. The seam
and its two static fields are deleted.

### Wire probes: REAL execution, throwaway data

Envelopes (request AND response, verbatim): `knowledge/sf-build-v2/wp2/observed-envelopes-covenant-bulk.json` and
`knowledge/sf-build-v2/wp2/observed-envelopes-valuation-hardened.json`. Hartwell and every pre-existing record were
off limits throughout.

**Covenant bulk.** Account `001bb00001KVX25AAH` → package `a5Fbb000000ImNxEAK` → loan `a4Zbb000002Bs0jEAC`
(Booked / Open / lookupKey `ZZWS05COV1`) → covenant `a3Bbb000000StxdEAC` COV-000652 (relationship-level, compliance
row COMP-0489 at `Pending`) and covenant `a3Bbb000000StxeEAC` COV-000653 (loan-level, COMP-0490 at `In Progress`).

| Step | Observed |
|---|---|
| Stage arm 1 | `scopeCount 2`, `assessedCount 1`, `refusedCount 1`. COV-000653 refused with the reason naming `In Progress`. `stagingId a8abb00001N9xRJAAZ`, `planHash 61ba9140…`, token issued, zero domain DML |
| Execute arm 1 | `terminalState success`, `writtenCount 1`, all 5 steps `verified`, `approvalChainStarted false` |
| SOQL | COMP-0489 `Compliant`, `Historic_Financial_Indicator 1.42`, `cm_… "1.42"`, `Evaluation_Date 2026-08-22`, `Evaluated_By 005bb00000ftouDAAQ`. COMP-0490 untouched at `In Progress` |
| Replay | same key → `ok true`, `replayed true`, same record id, `approvalChainStarted null` (a replay observed nothing and says so) |
| Stage arm 2 | `covenantIds` selection narrowed scope to 1; `allowNonPending true` accepted with the "schedule does NOT advance" warning |
| Execute arm 2 | COMP-0490 → `Exception` / reason `Overdue` / exception date today / hist 1.05, outcome states the schedule did not advance because the row was not Pending |
| Generation | 1 compliance row per covenant after both arms. No successor minted, which is what the plan predicted (neither covenant has a Frequency Template) and what execute measured |
| Cleanup | covenants (cascading compliance rows and both junctions), covenant types, loan, package, staging rows, account, all deleted |

**Valuation hardened.** Account `001bb00001KVYW1AAP` → package `a5Fbb000000ImPZEA0` → loan `a4Zbb000002Bs2LEAS`
(`ZZWS05VAL1`) → collaterals `a35bb00000184kDAAQ` COL-000766 and `a35bb00000184kEAAQ` COL-000767, both linked to the
borrower by ownership.

| Step | Observed |
|---|---|
| Stage | 2 items, 6 steps, `stagingId a8abb00001NABCXAA5`, package-membership warning present, zero domain DML |
| Execute | `terminalState success`, CV-0000000014 (1,100,000) and CV-0000000015 (275,000), each `Active true`, `Original Valuation Record false`, primary as requested |
| Rollup | COL-000766 stayed at 900,000 and COL-000767 at 300,000. Reported as unchanged; no coverage improvement claimed |
| Refusals, on the wire | wrong-package item named by position and collateral name · missing `valuationDate` · missing `productPackageId` · same collateral and date as CV-0000000014 |
| Cleanup | valuations, ownership rows, collaterals, collateral type, loan, package, staging rows, account, all deleted |

**Residue proof.** Named residue on the `ZZ-WS05%` prefixes: Account 0 · Product Package 0 · Loan 0 · Collateral Type 0
· Covenant Type 0 · `cm_Action_Staging__c` 0. Org-wide baselines restored exactly:
`LLC_BI__Covenant_Compliance2__c` **144**, `LLC_BI__Covenant2__c` **639**, `LLC_BI__Collateral_Valuation__c` **10**,
`LLC_BI__Collateral__c` **764**, `LLC_BI__Account_Collateral__c` **9**, `LLC_BI__Collateral_Type__c` **43**,
`cm_Action_Staging__c` back to the **11** kept rows. Deleted records sit in the Recycle Bin, as with the August 20 probe.

**One residue that could NOT be cleaned, stated plainly.** Creating the two fixture compliance rows fired
`acnpex_covenantApprovalProcess` exactly as D1 predicts. It left 2 `FlowOrchestrationInstance`
(`0jEbb000000D95VEAS`, `0jEbb000000D95WEAS`) and 2 `FlowOrchestrationWorkItem` (`0jfbb0000007tXdAAI`,
`0jfbb0000007tXeAAI`), now orphaned because their target rows are deleted. They cannot be removed: the object takes no
Apex DML at all (compile error) and a REST DELETE returns `INSUFFICIENT_ACCESS_OR_READONLY`. Both work items are
`Assigned` to `005bb00000H6aX0AAJ`, which is an **INACTIVE** user.

### Org facts discovered (all new, all verified live 2026-08-22)

1. **The covenant approval chain materialises as `FlowOrchestrationInstance` + `FlowOrchestrationWorkItem`, not
   `ProcessInstance`.** `ProcessInstance` and `ProcessInstanceWorkitem` counts for the day stayed at 0 while the
   orchestration objects went to 2 each. This positively confirms probe 8's note that ProcessInstance is the wrong
   object to verify this chain against, and it gives the right one. **Our UPDATE raised nothing**: the count stayed at
   2 across four stage/execute calls. The CREATE is what raised them.
2. **`LLC_BI__Covenant_Compliance2__c.LLC_BI__Status__c` offers exactly `Compliant, Exception, In Progress, Pending,
   Waived`** and carries **no separate non-compliant value**. `restricted = false`. So in this org a failed test is
   recorded as `Exception` plus `LLC_BI__Reason_for_Exception__c = Breached`, and there is no third spelling to
   allowlist. `Reason_for_Exception` offers exactly `Breached, Overdue`.
3. **`LLC_BI__Historic_Financial_Indicator__c` is type `double`, updateable, not calculated.** Safe to write, and it
   is where nCino sources the covenant's Last Evaluation Value from.
4. **`LLC_BI__Covenant2__c.Name` is an auto-number and is NOT writeable** (`Field is not writeable` at compile time).
   Any fixture that identifies covenants by a name of its own choosing fails to compile. The suite keys on the
   covenant TYPE name instead.
5. **The org rewrites `LLC_BI__Collateral_Type__c.Name` to the record's own 15-character id on insert**, in a real
   (non-test) transaction. Proved directly: inserted with `Name = 'ZZ-NAMETEST Type'`, read back as
   `a33bb000001ZpQT`, and a `WHERE LLC_BI__Collateral_Type__r.Name = 'ZZ-NAMETEST Type'` traversal matched 0 rows.
   **This is a probe-cleanup trap**: the first valuation cleanup keyed on that name and silently deleted nothing,
   leaving 2 collaterals and 2 valuations behind until a second pass removed them by id. Cleanup scripts must key on
   record ids. Note the rename does NOT happen in a test context, which is why `C360TestFixture.existingCollateral()`
   still finds its fixture by type name.
6. **`LLC_BI__Collateral__c` has no Account lookup of any kind.** The only Account link is the
   `LLC_BI__Account_Collateral__c` junction, labelled "Collateral Ownership". Package membership for a collateral is
   therefore pledge OR ownership, and there is no third route.
7. **`LLC_BI__Date_Template__c.LLC_BI__Template_Type__c` offers `Date Based, Frequency Based, One-Time, Ad Hoc`**, and
   8 template records exist in the org. `One-Time` is the value that makes a Compliant verdict deactivate the covenant
   permanently, and the plan warns on it by name.
8. **`wp2/classes/Customer360Covenants.cls` had NO `.cls-meta.xml`**, so every class-directory deployment had been
   silently skipping it. A field added to that file appeared to ship and did not; the failure only surfaced later,
   when its test referenced the missing field. The meta file is added. A stale duplicate of the same class also sits
   at `knowledge/sf-build-v2/Customer360Covenants.cls`, outside the declared package directory.
9. **`nulls` is a reserved word in Apex** and cannot be used as a local variable name (`Unexpected token 'nulls'`).

### UNVERIFIED

- **Generation and the approval chain have never been observed FIRING through our tools.** Both probe covenants lacked
  a Frequency Template, so `approvalChainStarted` was measured as `false` and the measurement's positive branch is
  code-and-unit-tested only. Proving the positive branch means writing a terminal status onto a compliance row of a
  covenant that carries a Frequency Template, which will mint a successor row and raise a real approval work item.
  That probe was not run.
- **The per-item DML failure path is unit-tested only.** `Database.update(..., false, AccessLevel.USER_MODE)` is used
  so one row the org refuses does not discard its siblings, but no live run has produced a partial failure.
- **Multi-covenant execution above N=1 has not run on the wire.** Stage was probed at N=2 with one refusal, and both
  execute arms wrote a single covenant. The N-item write loop is exercised by the suite, not by the org.
- **Whether the approval work item sends an email was not established.** The assignee is an inactive user, which makes
  delivery unlikely, but org-wide email deliverability was not read and no inbox was checked.
- **The cockpit app has not been updated.** `stage_covenant_review`'s input shape is a breaking change. Any client
  still sending `accountId` + `covenantComplianceId` + `result` will now be refused. No client change was made in this
  work package.

## WS3 envelope probes: the four relationship-actions tools (2026-08-25, worktree `c360-probes`, branch `ws3-envelope-probes`)

Closes UNVERIFIED item 2 from `knowledge/ws3-side-findings.md`: service request, annual review, risk
rating review and new facility had shipped in the `relationship-actions` skill off the deployed Apex
`@InvocableVariable` declarations only, with no archived wire envelope. All four now have one, captured
live on throwaway data, zero residue. Envelopes:
`knowledge/sf-build-v2/wp2/observed-envelopes-relationship-actions.json`.

**Fixture:** Account `001bb00001KfNPkAAN` "ZZ-WS3-PROBE Borrower" → package `a5Fbb000000IokjEAC`
"ZZ-WS3-PROBE Package" (`LLC_BI__Account__c` only). Executes ran as `approverUserId`
`005bb00000ftouDAAQ`, per the recipe.

| Tool | Stage | Execute | Created record |
|---|---|---|---|
| `stage_service_request` / `execute_service_request` | ok, no refusals. `accountId` alone is sufficient; the tool auto-attached our package as the deep-link `productPackageId` from the account's most-recently-modified package | `terminalState: success`. Type `Service Request`, Origin `Agent` (org offers the preferred pair, `degradedTypeMode: false`) | Case `500bb00000tsVjvAAE` (00001329), Status New — deleted |
| `stage_annual_review` / `execute_annual_review` | ok, no refusals. `reviewType` validated against the live picklist (`Annual`, `AdHoc`, `Problem Loan` all active); used `Annual` | `terminalState: success`. Review created at `In Progress`, org assigned RecordType `012bb000000NNeMAAW` in the `observe_after_save` step (`filed_unverified` by design, per the tool's own contract) | Review `a5nbb00000mLU13AAG` (R-7) — deleted |
| `stage_risk_rating_review` / `execute_risk_rating_review` | ok, no refusals. No override supplied so `Mandatory_comment` never engaged; scoring inputs only | `terminalState: success`. Status `In Review`, `LLC_BI__Final_Risk_Grade__c` formula computed 4.00 from the inputs on read-back | Risk Rating Review `a2bbb000001HzZZAA0` (RG-0000003) — deleted |
| `stage_new_facility` / `execute_new_facility` (two invocations) | ok, no refusals. `productPackageId` supplied (no package-first branch exercised), `product: Equipment` against the maintained RT picklist, `primaryLoanPurpose: equipment` validated live against `LLC_BI__Loan_Detail__c` describe (23 active values) | **Invocation 1**: `terminalState: partial`, `resumable: true`. Loan created at Qualification, involvement row added (100% ownership), org renamed the facility "ZZ-WS3-PROBE Borrower - Equipment - $250,000.00". **Invocation 2** (resume, ~8s later, same stagingId/planHash/idempotencyKey/approver, no new token): Loan Detail had already landed (`a4Wbb000001KLkTEAW`, well inside the 30000ms budget), purpose written, stage hopped Qualification → Proposal. `terminalState: success` | Loan `a4Zbb000002CE2rEAG`, Loan Detail `a4Wbb000001KLkTEAW`, Involvement `a4Lbb000000OsIbEAK` — all deleted |

**No refusals were hit on any of the four tools.** Every field the recipe's read-first pass flagged as
required lined up with what the wire actually accepted; nothing needed adjusting from the Apex-declared
shape. This is a cleaner outcome than the mod-execute and covenant probes, which both found live defects.

### Org facts discovered

1. **`stage_service_request` silently attaches a deep-link package.** The Case itself is
   account-anchored (no `LLC_BI__Product_Package__c` field on Case), but the staged plan's
   `productPackageId` output picked up our fixture package via `ORDER BY LastModifiedDate DESC LIMIT 1`
   on the account, confirming the class comment's documented behavior on live data.
2. **The annual review record type assignment is asynchronous-looking but landed same-transaction on
   read-back.** `observe_after_save` reported `filed_unverified` per the tool's own design (it never
   claims the after-save flow's effect as verified), but the immediate re-query already showed
   RecordType `012bb000000NNeMAAW` set — the flow ran fast enough to be visible, though the tool
   correctly does not depend on that timing.
3. **The two-invocation new-facility resume window was comfortably short in practice.** Probe 5's
   documented ~4 second Loan Detail creation held: an 8 second sleep before invocation 2 was enough,
   nowhere near the 30000ms wait budget the plan declares.
4. **`LLC_BI__Final_Risk_Grade__c` formula computation is immediate.** The 1–12 scale value (4.00) was
   readable on the same synchronous re-query the execute tool performs, no async lag observed.

### Residue proof

SOQL after cleanup: `Account WHERE Name LIKE 'ZZ-WS3%'` = 0 · `LLC_BI__Product_Package__c WHERE Name
LIKE 'ZZ-WS3%'` = 0 · `LLC_BI__Loan__c WHERE Name LIKE 'ZZ-WS3%'` = 0 · `Case WHERE CaseNumber =
'00001329'` = 0 · `LLC_BI__Review__c WHERE Name = 'R-7'` = 0 · `LLC_BI__Annual_Review__c WHERE Name =
'RG-0000003'` = 0 · `cm_Action_Staging__c WHERE cm_Idempotency_Key__c LIKE 'ZZ-WS3-%'` = 0.
`cm_Action_Staging__c` total back to the **11** kept rows (was 15 with our 4 staging rows standing,
confirmed before deletion). Hartwell (`001bb00001I7*`, package `a5Fbb000000IHFJEA4`, loans
`a4Zbb0000027M*`) and every pre-existing record were not touched by this probe.

### UNVERIFIED

- **The package-first branch of `stage_new_facility`/`execute_new_facility` remains unobserved.** This
  probe supplied `productPackageId` throughout. The `createPackage: true` path (no package supplied,
  tool creates one before the loan) is code-and-unit-tested only, per `StageExecuteNewFacilityTest.cls`.
- **The degraded-type-mode branch of `stage_service_request` remains unobserved on this org.** bankinggpt
  offers the preferred `Type = 'Service Request'` / `Origin = 'Agent'` pair, so the fallback substitution
  branch (`Question` / `Web`) has never fired live here.
- **The `Mandatory_comment` override branch of `stage_risk_rating_review` remains unobserved.** This
  probe supplied no `overriddenRiskGradeValue`, so the validation-rule mirror was never exercised against
  a live override + comment pair.
- **The replay path was not probed for these four tools.** `execute_loan_modification`'s replay behavior
  (same idempotency key, `replayed: true`, nothing written twice) is proven on the wire; the equivalent
  replay call was not made here for service request, annual review, risk rating review or new facility.
- **Multi-record staging (N > 1 requests in one `inputs[]` array) was not probed for any of the four.**
  Each call staged and executed exactly one request.

## Showcase build on Hartwell (2026-08-25, Fabian request: "the full show", TEST-flagged, standing)

Governed path end to end, then linkage, then proof via our own reads:
| Piece | Id | How |
|---|---|---|
| Facility "Equipment - $3,000,000.00", Stage Proposal | a4Zbb000002CECXEA4 | stage_new_facility → execute (3 invocations, async Loan Detail resume), borrowing structure + purpose set by the tool |
| TEST collateral (Mazak tooling cells, $4.0M) | a35bb0000018TAjAAM | data build, TEST-flagged description |
| Ownership junction | a2Vbb000001Zpa9EAC | Account_Collateral 100% primary |
| Valuation $4.0M Book Value/Appraisal | a34bb000003FKxZAAW | stage_collateral_valuation (package-anchored) → execute, token-gated |
| Aggregate | a4Sbb00000G7BlVEAV | lookupKey HWTEST-AGG-1 |
| Pledge $3.0M @75% override, 1st | a4Rbb0000027J4nEAE | mirrors fleet pledge conventions incl. override reason |
| Covenant junction (FCCR → new facility) | a4Vbb000000qMCXEA2 | Loan_Covenant |
| Lien 1st $3.0M | a4Mbb000001I41NEAS | Is_Internal not writable by profile (org fact) |

Proof: Customer360Exposure returns 7 facilities; the new one carries pledged share $3.0M with the
TEST collateral at 75% "Pledge override". Customer360Covenants shows the FCCR covenant
(type "Debt Service Coverage with and without Distributions") with the new facility in
attachedLoans. Staging rows SHOWCASE-* Completed (kept while the showcase stands).
Rollback when asked: lien, covenant junction, pledge, aggregate, valuation, ownership, collateral,
facility (+ its Loan Detail/involvement children), staging rows.
