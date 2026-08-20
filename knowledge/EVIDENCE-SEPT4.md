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
