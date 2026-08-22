# WS0.5: unholding loan modification in the cockpit (2026-08-22, branch `ws05-app-unhold`)

The org shipped `execute_loan_modification` (EVIDENCE-SEPT4, "WS0.5 item 1"). This branch makes the
React cockpit call it. Nothing was deployed, no Apex was touched, no org was contacted: every shape
here is read out of the archived envelopes.

## 1. Where the hold actually lived

Two independent holds existed, and only one of them was the cockpit's.

| Layer | Mechanism | Effect |
|---|---|---|
| CLIENT | `WRITE_TOOLS["loan-modification"].execute = null` plus a `heldReason` string, in `app/src/channel/writeTools.ts` | `isExecutionHeld()` true, so `ConfirmGate` rendered the "Staged, not filed" card and disabled the gesture ("Filing is on hold"). `executeAction()` refused before any call left the page. |
| ORG | `executionHeld` / `heldReason` on the staged plan, parsed in `stageAction()` | `ConfirmGate` blocks whenever the org sends `executionHeld: true`, whatever the client map says. |

`ConfirmGate` combines them as `plan.executionHeld === true || isExecutionHeld(actionId)`. Removing
the client entry therefore removes exactly one of the two, and the org's flag keeps its full force.
That combination line is unchanged by this branch, and the old held-plan fixture
(`observed-facilityIds-envelopes.json`, where the org sent `executionHeld: true`) still drives a
passing test that proves the org can still hold the gesture.

`TOOLS` in `app/src/channel/mcp.ts` carried a third, softer statement of the hold: a comment saying
no execute tool exists for modification or renewal, and no `executeLoanModification` constant. Both
corrected.

## 2. What changed

| File | Change |
|---|---|
| `app/src/channel/writeTools.ts` | `loan-modification` now maps to `execute_loan_modification`, `heldReason: null`. New `ExecutedFacility` interface + `toExecutedFacility()`. `ExecuteResult` gains `facilities[]`, `facilityCount`, `cloneLoanId`, `bookingHandoff`, `outputPackageId`. |
| `app/src/channel/mcp.ts` | `TOOLS.executeLoanModification`; the stage-only comment now covers renewal alone. |
| `app/src/components/StepTracker.tsx` | New "Filed, per facility" block (clone name, stage, chain row + revision, applied change, parent-unchanged, clone id). `filedRecord()` takes `actionId` and treats the clone as the created record. The executor's own `terminalState: "success"` now wins over the locally derived terminal. |
| `app/src/components/DeepLink.tsx` | `CREATED_OBJECT["loan-modification"] = LLC_BI__Loan__c` / "modification". |
| `app/src/actions/executedActivity.ts` | `createdRecordId("loan-modification")` returns `cloneLoanId`. |
| `app/PUBLISH.md` | Section 1 manifest regenerated (was 13 Customer 360 tools, now 22); the "Execution is HELD for modification and renewal" paragraph rewritten to renewal only, with the booking handoff stated. |
| `STATUS.md` | Line 6 of the open list, and the MCP-server row. |
| `app/src/actions/observed-execute-loan-modification-envelopes.json` | New. Byte copy of `knowledge/sf-build-v2/wp2/observed-envelopes-execute-loan-modification.json`, same pattern as the existing `observed-facilityIds-envelopes.json`, so tests run against the real wire. |
| `knowledge/artifact-capabilities-manifest.json` | New. See section 5. |

### Why the terminal-state change was needed

`actionTerminal()` derives `partial` when any non-handoff step ends `filed_unverified`. The observed
modification always ends with `observe_side_effects` at `filed_unverified` (stage-driven email alerts
run in their own transaction and report nothing back), so a run the org calls a **success** derived
as **partial** and the tracker offered "Resume from the step above once the cause is cleared" under a
completed action. `StepTracker` now takes the executor's `terminalState` when it says `success`. The
state machine in `actions/tracker.ts` is untouched: this is a presentation precedence rule, in the
one place that renders it. It also fixes the same latent misread on `execute_new_facility`, whose
`observe_loan_officer` step ends the same way.

### What is NOT held any more, and what still is

- Modification: executes. The clone lands at Qualification.
- Renewal: still `execute: null`. No `execute_renewal` was built, and the clone collateral-aggregate
  re-probe is still outstanding.
- Covenant review: still `execute: null`. Founder gate, unchanged.

## 3. The booking note, verbatim

The org's plan carries five `warnings[]`. `ConfirmGate` already rendered `plan.warnings` verbatim in
its "Before you confirm" block; this branch adds the test that pins it, asserting every one of the
five observed warnings appears, including:

> This plans a modification, NOT an approval. Executing it produces a clone facility at
> Qualification; BOOKING that clone requires nCino's Submit for Approval button, which
> Loan_Validation_06 enforces with no permission bypass.

Nothing paraphrases it, and the same fact reaches the tracker through the `held_execution` handoff
step's own detail plus `bookingHandoff`.

## 4. Tests

`npm ci` clean room (node_modules removed first), `tsc --noEmit` clean, `npm run contrast` all pass.

| | Before | After |
|---|---|---|
| Test files | 52 | 52 |
| Tests | 1399 | 1415 |

Per file:

| File | Before | After | Note |
|---|---|---|---|
| `src/channel/writeTools.test.ts` | 28 | 29 | held-registry test split: renewal + covenant stay held, modification is named |
| `src/actions/observedEnvelopes.test.ts` | 31 | 37 | new describe pinned to the stage / execute / replay envelopes |
| `src/actions/executedActivity.test.ts` | 32 | 36 | the trail entry names the clone, deep-links it as a facility |
| `src/actionPanel.ui.test.tsx` | 103 | 108 | 2 held-state tests removed, 7 added |

The seven panel tests: the ordinary confirm is offered; the org's warnings render verbatim; staging
still precedes execution and writes nothing; the execute call carries exactly
`{approverUserId, decisionToken, idempotencyKey, planHash, stagingId}` with the staging id and token
taken from the plan verbatim; the per-facility block renders the clone, chain row and applied change;
the trail entry lands on the Activity tab; a replay says nothing was written twice and renders no
per-facility detail. One more covers the CHAT surface end to end, so the unhold is proven from the
chat chip as well as the Client Actions row.

## 5. The capabilities manifest

`knowledge/artifact-capabilities-manifest.json`. Every name derived by script, none typed by hand:

- **Customer 360**: the `<toolName>` elements of
  `knowledge/sf-build-v2/wp2/mcpServerDefinitions/Customer360.mcpServerDefinition-meta.xml`, in the
  order the org spells them. The org manifest carries **24**; **22** are declared.
- **IDB Gateway**: `TOOLS.boomRatios`, `TOOLS.boomSpread`, `TOOLS.llm` from
  `app/src/channel/mcp.ts`. Called by `cockpitTools.refreshBoom` and `cockpitTools.askCopilot`.
- **Microsoft 365**: `TOOLS.mailSearch`, the mail intake sweep. One tool.

Customer 360 tools the app never calls, and what was done with each:

| Tool | Why the app never calls it | In the manifest? |
|---|---|---|
| `execute_covenant_review` | Founder decision. The tool is deployed but its first live invocation updates an existing compliance record and has never been run; the cockpit holds it client-side (`execute: null`), so no call path exists. | **EXCLUDED** |
| `Customer360SearchAccounts` | No call path. `TOOLS.searchAccounts` is defined but referenced nowhere, and the build tree-shakes the name out of the bundle. `app/PUBLISH.md` section 1 already recorded this as a deliberate minimality choice. | **EXCLUDED** |

**Read this before the next republish.** The brief asked for the 24 org tool names in the array AND
for `execute_covenant_review` to stay excluded, which cannot both hold. I resolved it toward the
minimal grant, because a capability manifest is a viewer-consented grant and the existing
`PUBLISH.md` rule ("declare a tool only when a call path exists") already excludes
`Customer360SearchAccounts` by name. If the intent was parity with the org's manifest instead,
adding `"Customer360SearchAccounts"` back is a one-line edit and takes the count to 23. Flagging it
rather than deciding it silently.

Passing a non-empty capabilities object is a full-set declaration: anything stored but not restated
is revoked, so this file must be passed whole. The `_comment` key is documentation; pass the `mcp`
object only.

## 6. Build

Real pipeline, in order, nothing published:

```
npm run build                       → dist/cockpit.html, 646,024 bytes
node scripts/release-artifact.mjs   → artifact/customer-360-template.html (marker verified once)
node app/scripts/assemble-artifact.mjs → /tmp/c360-publish.html, 774,958 bytes, 5 borrowers, slot verified
node scripts/sync-plugin-assets.mjs → synced customer-360-template.html; live-data.json and sample-data.json already in parity
```

Both surfaces carry the new bundle: `artifact/` (the publish staging) and `client-360/assets/` (the
plugin). Grep of each built file confirms `execute_loan_modification` present once and the LV06
held copy present once (that one is renewal's, which is correct).

## 7. UNVERIFIED

- **Nothing in this branch was run against the org.** Every shape is read from the archived
  envelopes of the 2026-08-22 wire probe. The cockpit's own execute path has never been exercised
  live end to end, only against those envelopes in vitest.
- **The multi-facility execute response is unobserved.** The live probe modified exactly ONE
  facility. `facilities[]` is rendered as a list and the plural copy is exercised by tests, but the
  org has never returned more than one row from `execute_loan_modification`. EVIDENCE-SEPT4 records
  that the org's own `acnpex_CreditActionRequest` wrapper races when two facilities are modified in
  one call, and that our tool maps clone to parent through the chain instead. Treat a two-facility
  execute as unproven until it is probed.
- **The replay path is observed but not the failure paths.** No domain failure
  (`ok: false`) has been observed from `execute_loan_modification`; the panel renders one through the
  same `ToolError` doctrine as the other execute tools, untested against a real refusal.
- **`terminalState` values other than `success` and the absence of `resumable`.** The modification
  execute has only ever returned `success`. Whether it can return `partial` or set `resumable` is
  unknown; the code treats absence as not-resumable, which is the fail-closed reading.
- **`Customer360ActionHistory` for modification rows.** `historyActivityEntry` already maps
  `loan-modification` to "Modification" and now gets the `LLC_BI__Loan__c` deep-link object, but no
  org history row for an executed modification has been read back.
