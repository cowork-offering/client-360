# Morning brief, 2026-09-02 (overnight landing, founder returns)

Main: **f8209eb**, pushed. Artifact 91b5e835 published at label **session-build**. Org: **nothing
deployed**, one check-only validated (119/119). Hartwell at baseline (1 package, 7 loans).

## What landed overnight (all verified independently by the integrator, fence 91c751e4 unchanged)

| Build | Commit | What it does | Tests |
|---|---|---|---|
| shell-fixes | 92173ea | P1 covenant dedupe per LOAN junction with three chips (create / associate / different); P3 create-then-pledge asks rate + lien with the bank's guideline band, never refuses; P4 collateral fence speaks collateral; N3 "the 15M line of credit" becomes focus on fee/exception/party lines | 2536 |
| session-build | b258431 | THE SWITCH: the workroom brain is your session Claude via `sample`; doctrine sliced and inlined (16 blocks); the ladder (quick for restate, default for judgment, tools only for what is current); two read-only tools (currentBoomRatios, liveInvolvements); NARRATION under every card in the room's own components; consent rides the greeting at room open; latency instrumented | 2631 |
| org-arms | f8209eb | N4 the graph read returns EVERY party on the deal (7 rows -> 22); P2 covenant + pledge CARRY-EXCLUSIONS on the modification; P1 associate-existing covenant (junction-only create); Customer360Catalog read (live picklists); both guards mirrored in one commit | check-only 119/119 |

Integration gate on merged main: tsc clean, **2659 tests**, build green, probe gate rim 0 / no new fails.

## What only you can do this morning, in order

**1. The org deploy (one word: go).** Two steps, because a check-only carrying Apex AND the
McpServerDefinition together never starts its tests (three runs proved it) and cancelling wedged
the queue 20 minutes:
   - Step A: the 12 classes with tests (`sf project deploy start --metadata-dir /tmp/deploy-pkgver
     -o bankinggpt-at --test-level RunSpecifiedTests --tests StageExecuteLoanModificationTest
     --tests C360WriteGuardTest --tests StageHeldCreditActionsTest --tests Customer360CatalogTest
     --tests Customer360RelationshipGraphTest`). I run it on your go and paste the result.
   - Step B: the McpServerDefinition alone (adds Customer360Catalog as the 25th tool, removes
     none; verified byte-equal to the live 24 before the add). Connector change: needs a FRESH
     claude.ai session afterwards for the tool-schema cache. Not hours before a demo (the widget
     URI lesson); today is fine.
   - Then I refresh `artifact/live-data.json` from the fixed graph read and republish, so the
     room's local book finally holds all 22 parties.

**2. Open the room and let it talk.** Fresh claude.ai session, Customer 360 + IDB Gateway + M365
attached. Open Hartwell -> Facility Actions. The greeting is the first session call: the
one-time consent dialog appears there. Allow it. Then:
   - `who guarantees the construction loan` (after the deploy + refresh: Holdings and Elena with
     roles; before it: still the 6 borrower rows, the read is the org's)
   - `take the 15M line of credit to 20M` -> card instant, then watch the sentence stream in
     under it. That is the model speaking.
   - `which covenant has the least cushion, and why` -> a judgment answer, reasoned.
   - `add a debt service coverage of borrower covenant of 1.30 on the 8M equipment loan` -> the
     three chips (create / associate / different test), no "relationship level covers it".
   - `pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued
     at 6,500,000` -> asks the rate with 75/80 chips, then the lien, then stages.
   - `add a 1% origination fee on the 15M line of credit` -> one fee, right facility, instantly.
   - `is there a newer valuation on the Kokomo plant` -> honest: no tool covers it, answered at
     rung 2 instantly rather than a 60s round to say so.
   - In the console: `c360SampleGate()` prints first-token and full-answer per tier and the
     over-call rate. THAT is the latency gate. Paste it to me.

**3. After the deploy: the full 13-line modification, removes included.** The script in
knowledge/MODIFICATION-DRIVE-SCRIPT-20260901.md still holds, with these changes now valid:
   - line 6 `remove the Minimum Liquidity covenant from the 15M line of credit` -> a CARRY
     EXCLUSION card (booked loan untouched, the clone does not carry it), not a refusal
   - line 9 the AR pledge -> pledge carry exclusion, same
   - line 10b Holdings -> named as already Guarantor on Construction, role-change offered
   - line 11 `take Elena Hartwell off the 15M line of credit` -> stamped Limited Guarantor from
     the book, files
   NOTE: the shell half of P2 (staging exclusion cards from a "remove" line) is the ONE piece not
   yet wired: shell-fixes deliberately kept the refusal until the arm existed; the arm now exists
   (JSON shapes in design/proposals/org-arms-addendum.md). That is a small shell follow-up
   right after the deploy, before the 13-line drive. I will do it in the morning while you run
   step 2.

## Findings you should know

- **Fee types in this org are 37 residential/TRID values with no C&I entry** (Loan Origination,
  Attorney, Appraisal are the only commercial-sounding ones). "Origination fee" maps to Loan
  Origination. If the booth shows fee chips, they will look residential. Decision: filter the
  chips to a curated commercial subset for the demo, or leave the org honest. Your call.
- Covenant catalog is 71 types (the pack said 60); the deployed fileable map is still nine.
  Chips show nine, the rest are named as not fileable.
- Case.Type / Case.Origin were read off the org for the first time (backlog B.10 closed).
- The exception status field: Waived / Mitigated / Unmitigated. `Policy_Exception.Type` is free
  text, not a picklist.
- The Customer 360 connector in MY session returns INVALID_JWT_FORMAT: re-authorise in claude.ai
  connector settings before the booth. Yours may be fine.

## What is NOT done
- The shell wiring of exclusion/associate cards (above). Small, morning.
- Latency numbers: empty until your panel drive. `claude.use("sample")` is null outside a real
  viewer, so every test ran against a stub of the documented shape.
- Stream G (probes/harness/gate) has committed work on branch stream-g plus uncommitted gate
  work; not merged, not blocking.
- Multi-member exclusions, rateless collateral types, a challenge card narration: untested
  edges, named in the addenda.
- Worktrees: merged ones removed; stream-g kept.
