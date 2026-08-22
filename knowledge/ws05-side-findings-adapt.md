# WS0.5 side findings: adapting the cockpit to the reshaped tools (2026-08-22, branch `ws05-app-adapt`)

The org reshaped two tool pairs (EVIDENCE-SEPT4, "WS0.5 items 2+3"). This branch makes the React
cockpit send the new shapes. App only: no Apex was touched, no org was contacted, nothing was
published. Every shape here is read out of the archived envelopes
(`knowledge/sf-build-v2/wp2/observed-envelopes-covenant-bulk.json` and
`observed-envelopes-valuation-hardened.json`), which are now copied into `app/src/actions/` so the
tests run against the real wire rather than against retyped field names.

## 1. What was sent before, and what is sent now

### `stage_covenant_review`

Before, one assessment per call, anchored on a compliance ROW:

```json
{ "idempotencyKey": "…", "accountId": "001…", "covenantComplianceId": "a3C…",
  "result": "Compliant", "observedValue": "1.42", "narrative": "…", "comments": "…" }
```

Now, one plan over N assessments, anchored on the PRODUCT PACKAGE:

```json
{ "idempotencyKey": "…", "productPackageId": "a5F…", "rationale": "…",
  "covenantIds": ["a3B…"], "allowNonPending": true,
  "assessments": [{ "covenantId": "a3B…", "status": "Compliant", "observedValue": 1.42,
                    "reasonForException": "Breached", "narrative": "…", "comments": "…" }] }
```

Four changes that would each have broken the wire on their own:

1. `accountId`, `covenantComplianceId` and `result` are **gone from the org**, and they carried
   `required=true`, so leaving any of them in makes the new shape unreachable. All three are now
   asserted absent by test.
2. `observedValue` is a **number**, not the string the old envelope carried. The invocable declares
   `Decimal`.
3. `reasonForException` is new and is the only field that separates a failed test from an undelivered
   document.
4. `covenantIds` and `allowNonPending` are sent **only when set**. A `false` `allowNonPending` would
   claim a decision nobody made, so the key is omitted instead.

The response is read in full: `covenants[]` (per covenant: current compliance status, assessed
status, state, the org's reason, `generatesNextRow`, and the four step ids), plus `scopeCount`,
`assessedCount` and `refusedCount`.

### `execute_covenant_review`

The contract is unchanged: the same five fields. What changed is that the cockpit now **calls** it.
It was held client-side (`execute: null`) on a founder gate whose stated reason was that the tool had
never been run live. It has now been run live on both arms on throwaway data, so the reason is spent
and the hold is gone. Two things still hold the gesture, and neither is ours:

- the ORG's own `executionHeld` / `heldReason` on the staged plan, which still blocks the confirm
  gate whatever the client map says (a test pins this);
- the plan's **per-covenant** refusal of any compliance row that is not `Pending`, unless the banker
  sets `allowNonPending`.

Per-covenant results (`items[]`: `written`, `sourceStatus` to `status`, `recordName`,
`nextComplianceRowCreated`, the org's own outcome sentence) now reach the tracker, and
`approvalChainStarted` is rendered as the **measurement** it is. Tri-state, with `null` on a replay
meaning "this run observed nothing", never "no approval was raised".

### `stage_collateral_valuation`

Before: `{ idempotencyKey, rationale, items: [{ collateralId, value, valuationDate?, … }] }`.

Now the same, plus a required `productPackageId`, and `valuationDate` typed non-optional per item so
an omission is a compile error here rather than a refusal the banker has to read. The 20-item cap is
enforced client-side with the org's own governor reason. All four observed refusal strings
(wrong package · missing date · missing package · same-collateral-same-date) are surfaced verbatim.

## 2. The ticket, before and after

| | Before | After |
|---|---|---|
| Covenant anchor | the first covenant carrying a `complianceId`, readonly | the DEAL: a package chooser defaulting to the relationship's own package, editable only when more than one is staged |
| Covenant selection | none, one covenant chosen for the banker | a multiselect over the package's covenants, **nothing preselected**, each row showing its current compliance status and reason |
| Assessment | one status, one observed value, one narrative for the ticket | per covenant: status, observed value, reason for exception, note. One shared narrative for the exercise |
| Status values | the org's `LLC_BI__Status__c` picklist | the TOOL's three complete statuses (`Compliant`, `Waived`, `Exception`). The org's picklist holds five; `Pending` and `In Progress` are states a row arrives in and the tool refuses them |
| Non-Pending rows | not a concept | explicit banker opt-in, off by default, with the org's "the covenant schedule does NOT advance" sentence stated wherever the opt-in is offered |
| Valuation anchor | the collateral records alone | the collateral records **plus** the deal |
| Valuation date | empty, banker-entered | defaulted to `meta.generatedAt` (A10 clock, never `new Date()`), editable, with the org's duplicate rule stated on the field |

The confirm gate now renders the per-covenant plan before the gesture: every covenant the plan
touched, planned and refused alike, with the org's reason verbatim and the approval-trap warnings
unchanged. `1 of 2 assessed covenants will be written` is stated as arithmetic, so a partial write is
never a surprise.

## 3. Five latent defects this work exposed, all fixed

**a. Every live bulk plan was blocked at the confirm gate.** `assertNoRecordIds` refused
`items[].collateralId` as evidence that something had already been written. The collateral existed
long before the plan was staged, which is the same reason `facilityId` was whitelisted a wave earlier.
`collateralId`, `covenantId` and `covenantComplianceId` are now id carriers. Regression-tested
against the observed valuation plan.

**b. Every covenant plan would have been refused by the transition allowlist.** Two causes:

- the policy carried `held: "the acnpex_covenantApprovalProcess entry-criteria probe has not
  landed"`. That probe has landed: the plan now reads Active + Frequency Template + Effective Date
  per covenant and execute MEASURES whether a successor row appeared. The hold is spent.
- `validateStep` read every write step with no `transition` as a CREATE. The compliance row is the
  first object the cockpit only ever UPDATES, and `mayCreate: false` refused all four of its write
  steps. A heuristic that inferred create-versus-update from the fields was tried and was wrong both
  ways (it then refused a valuation step that did not restate `LLC_BI__Active__c`). The mirror now
  declines to guess: `mayCreate` and `mayUpdate` say whether the tool touches the object at all, and
  the one create that must be caught on an update-only object is caught by `refusedFields`, because
  creating a compliance row means writing `LLC_BI__Covenant__c`.

The allowlist also gained `Waived` on the compliance transition, matching the org's own
`C360WriteGuard.UPDATE_TRANSITIONS`.

**c. The batch rules never reached the banker.** `batchStagingGap` computed the right sentence and
the footer and the gesture read neither, so a covenant selected with no verdict, an empty selection
or a cleared valuation date all left "Review the plan" enabled and the footer reading "Creates a
covenant assessment." The banker met the rule as a thrown compile error instead. Both expressions now
read it, and three UI tests hold the gesture to it.

**d. The deal picker changed nothing.** `packageField` is editable when the relationship stages more
than one package, but the schema resolved its scope from `packageRecords()[0]` and the schema memo
had no dependency on the pick. Switching deals would have sent package B with member ids resolved
against package A, which the tool refuses by name. `SchemaContext` now carries `packageId`, both
tickets resolve their members from it, and changing the deal clears a selection that belonged to the
previous one. The same filter now applies to the collateral picker, which listed every pledge on the
relationship regardless of deal.

**e. The valuation tracker printed raw record ids.** The per-collateral rows read
`item.collateralName`, which only the STAGE item carries; the execute item names the collateral in
`anchorName`. The existing test passed on a hand-written fixture that added the missing field.

## 4. The Exception classifier, unchanged in doctrine and better in evidence

`Customer360Covenants` now returns `latestComplianceStatus` and `reasonForException` additively,
which is exactly what the predecessor branch asked for. `domain/covenantStatus.ts` reads them:

- `Reason for Exception = Breached` ranks WITH the `Breached` flag. Both are the org stating that the
  test failed, and this one is the answer the exception batch cannot fake.
- `Reason for Exception = Overdue` makes the administrative reading explicit rather than inferred
  from whether a value was measured.
- Everything else is unchanged: `Exception` alone is still never a breach, `Waived` is still its own
  neutral state and outranks the arithmetic, and an unmapped status still renders verbatim.

Nothing else was changed to depend on the compliance-row status: the covenant-level status still
drives the classification kind, so no existing surface's verdict moved on data that predates the
additive read.

## 5. Test counts

Clean room: `rm -rf node_modules && npm ci`, then `npm run typecheck`, `npx vitest run`,
`npm run contrast`.

| | Files | Tests |
|---|---|---|
| Before | 52 | 1415 |
| After | 54 | 1483 |

All green. Typecheck clean. All contrast checks pass (no new colour was introduced).

New files: `app/src/actions/ws05Envelopes.test.ts` (46 tests covering the wire in both directions, the
ticket, the deal pick and the batch gates) and `app/src/covenantBatch.render.test.tsx` (11 tests
covering what the banker actually sees at the gate and in the tracker, rendered from the archived
envelopes). The rest is new coverage in `covenantStatus.test.ts` (+6, the Reason for Exception
branch), `actionPanel.ui.test.tsx` (+7, the gesture actually blocking) and `tracker.test.ts` (+1, the
allowlist permitting an update-only object). Existing suites were updated rather than deleted where
the old assertion described a shape the org no longer has. The suite was run four times end to end
with the same result, because a prior review reported the shell render tests as load-sensitive.

## 6. Build

From `app/`: `npm run build` (660,319 bytes) → `node app/scripts/release-artifact.mjs` (promoted to
`artifact/customer-360-template.html`, marker verified) → `node app/scripts/assemble-artifact.mjs`
(`/tmp/c360-publish.html`, 789,243 bytes, 5 borrowers, slot verified) → `node
scripts/sync-plugin-assets.mjs` (`client-360/assets` back in parity). **Nothing was published.**

## 7. Connector manifest

**No tool NAME changed in the org this wave.** `stage_covenant_review` and
`stage_collateral_valuation` changed SHAPE only; the `McpServerDefinition` was not touched and still
carries 24 tools. As expected, no rename was needed.

One ADDITION was needed and is not a rename: `execute_covenant_review` was excluded from
`knowledge/artifact-capabilities-manifest.json` on the founder gate, and the cockpit now calls it.
A non-empty capabilities object is a full-set declaration, so a tool the page calls but does not
declare would simply fail. The Customer 360 set goes from 22 to 23 declared of the org's 24;
`Customer360SearchAccounts` remains out, unchanged, because nothing calls it.

## 8. UNVERIFIED

Stated plainly, because none of it was proved from this branch.

1. **Nothing here has been run against the live org from the app.** Every assertion is against
   archived envelopes replayed through a mocked `window.claude.mcp`. The request bodies are byte-
   compared to bodies the org accepted, which is strong, and it is not the same as a round trip.
2. **`latestComplianceStatus` and `reasonForException` are absent from the staged data.** All five
   borrowers in `client-360/assets/live-data.json` carry `0` of each: the read predates the additive
   fields. So the classifier's new branch and the ticket's compliance-status detail line are
   exercised only by fixtures until the data is re-staged. Re-run the read before demoing either.
3. **No borrower stages `snapshot.productPackageId`.** All five carry it on their facilities instead,
   which `packageRecords` handles, and every one of them resolves to exactly ONE package, so the
   multi-package chooser has never been rendered against real data. `artifact/sample-data.json` (the
   built-in fallback) stages no package at all, so under sample data both bulk actions block with the
   org's reason. That is correct behaviour and it will look like a regression to anyone who does not
   know why.
4. **No package NAME exists anywhere in the read.** The chooser labels each package by the facilities
   hanging off it. If a relationship ever stages two packages with the same facility names, the two
   options read identically; the id is in the detail line, which is a poor tiebreaker for a banker.
   An additive `packageName` on `Customer360Snapshot` or `Customer360Exposure` would fix it.
5. **The covenant scope is approximated client-side.** The org resolves it as the union of the
   package's loan-level and relationship-level junctions; the cockpit can only reason from
   `attachedLoans`, so it is deliberately generous: a covenant is offered unless the read PROVES it
   hangs off another package's facilities. A covenant the cockpit offers wrongly is refused by the
   tool by name; a covenant it hid would be invisible. The generous direction is the intended one.
6. **The 20 caps are mirrored, not derived.** `C360Covenants.MAX_ASSESSMENTS` and
   `StageCollateralValuation.MAX_ITEMS` are both 20 today. If either moves in the org, the client
   copy drifts silently. The refusal still comes back correctly from the tool; only the pre-emptive
   message would be stale.
7. **`allowNonPending` cannot be offered contextually.** The panel would ideally surface it only when
   a selected covenant sits on a non-Pending row, but that needs `latestComplianceStatus`, which the
   staged data does not carry (see 2). It is therefore always offered, with its warning always
   stated.
8. **The assessment status set is the TOOL's, hardcoded from the deployed Apex.** Three values read
   from `C360Covenants.TERMINAL_STATUSES`, not from an org describe, because the constraint is the
   tool's and not the org's, and the org's picklist is a superset the tool refuses. This is a deliberate
   exception to A33.1.6 and is documented where the constant lives.
9. **The multi-package path has no live evidence at all.** Every fix in defect (d) is exercised by
   fixtures only, because no staged relationship carries two packages (see 3). The behaviour is
   right by construction and by test; it has never been seen against real data.
10. **The valuation execute path was not re-observed this wave.** Its contract is unchanged and the
   happy-path envelope is replayed, but only the STAGE side of the valuation was hardened, so the
   execute assertions carry no new evidence.
