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
