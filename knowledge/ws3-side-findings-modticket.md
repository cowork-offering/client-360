# WS3: the loan-modification ticket becomes package-first (2026-08-25, branch `ws3-mod-ticket-pp`)

The founder's reading, live: the modification ticket still LOOKS single-loan. It was right. The
covenant review and the collateral valuation had already been rebuilt around the deal; the
modification had a multiselect bolted onto a form whose reading order, prefills, deltas and payload
were all still about one facility.

Nothing was deployed, no Apex was touched, no org was contacted. Every shape here is read out of the
deployed `StageLoanModification.cls` and the archived envelopes.

## 1. What was actually single-loan about it

Not the multiselect, which had landed on 2026-07-27. Six other things:

| Symptom | What it did |
|---|---|
| No deal anchor in the ticket | `productPackageId` is `required=true` on the invocable, and the ticket never showed it. The payload dug it out of whichever facility the banker happened to tick. |
| Amount first, members second | The hero commitment rendered ABOVE the facility list, so the ticket asked for a number before it asked what the number was about. |
| Facility list spanned the relationship | Every booked facility, whatever deal it sat on. The only defence was `FACILITIES_SPAN_PACKAGES` refusing the selection AFTER the banker made it. |
| Commitment prefilled from one facility | `asked ?? fac?.committed`: with several members selected, one member's current figure was offered as everyone's new one, and on its own it satisfied the org's at-least-one-change rule while asking for nothing. |
| No maturity control at all | `requestedMaturityDate` has been on `StageLoanModification.Request` all along and the ticket had no field for it. The single change a modification most often is could not be asked for. |
| Deltas assumed one facility | `commitmentDeltas` read the RELATIONSHIP's total as the "before" and the proposed figure as the "after". Correct only where the relationship has exactly one facility; silently wrong everywhere else. |

## 2. What changed

| File | Change |
|---|---|
| `app/src/actions/schemas.ts` | `facilityChangeSchema` for `modification` now leads with `packageField`. New `packageFacilities()` scopes the member list to the chosen deal and lists off-deal booked facilities with "booked on another deal". New exported `impliedFacility()` derives the preselection. `newCommitment` is no longer `required` and no longer prefills from a facility's own commitment. New `requestedMaturityDate` field. New `MODIFICATION_NEEDS_A_CHANGE` (the org's sentence, verbatim) and `EACH_SELECTED`. `batchStagingGap` gains a `loan-modification` arm. `packageRecords` details gain drawn, and its label caps at three member names. `primaryFacility()` deleted. |
| `app/src/actions/briefing.ts` | The modification subject states the DEAL: booked member count, committed, drawn, one plan / one token / one confirmation, and that each change reaches each member. The lead carries the deal chip when the relationship stages more than one, and the maturity chip always. |
| `app/src/actions/dealTicket.ts` | `commitmentDeltas` aggregates over the SELECTED members. |
| `app/src/components/DealTicket.tsx` | New `DealHeader`, rendered first, read off the schema rather than the briefing's reading order. Member multiselects moved ABOVE the hero. Properties exclude the deal. |
| `app/src/components/ActionPanel.tsx` | The modification always sends `facilityIds[]`. `requestedMaturityDate` on the payload. The deal the ticket shows is cross-checked against the deal the picked members hang off. Changing the deal clears the member selection, the way it already cleared covenants and collateral. |
| `app/src/channel/writeTools.ts` | `requestedMaturityDate` on `StagePayloads["loan-modification"]`. |
| `app/src/actions/derived-execute-modification-n2.json` | New. DERIVED, not observed. See section 5. |
| `app/src/modTicket.render.test.tsx` | New. 26 tests. |

## 3. The rules, and where each one comes from

**The deal is the anchor.** `StageLoanModification.Request.productPackageId` carries `required=true`
and `C360Facilities.validate` refuses any facility that is not a member of it. The ticket now names
the deal first and scopes the member list to it, so the org never has to refuse a selection the
ticket offered.

**Every requested change reaches every member.** `requestedAmount`, `requestedMaturityDate`,
`requestedRate` and `requestedTermMonths` are single scalars on the Request, put into `resolved` once
and applied by every `apply_changes_*` step. The org's own N>1 warning says it: "The requested
changes apply to every selected facility. Stage them separately if they need different terms." The
ticket now says the same thing on each of the four fields.

**At least one change.** `StageLoanModification.build`, before it reads a facility:

```apex
if (req.requestedAmount == null && req.requestedMaturityDate == null
    && req.requestedRate == null && req.requestedTermMonths == null) {
    throw new ToolException('At least one requested change is required: amount, maturity date, rate or term.');
}
```

`MODIFICATION_NEEDS_A_CHANGE` is that string, character for character, and `batchStagingGap` returns
it. The banker meets the rule in the ticket rather than in a round trip that refused the whole batch.

**The ticket always sends `facilityIds[]`.** One member is a selection of one, not a different kind
of request. The flat `loanId` is unchanged on the wire (`FacilityAnchor` still models the XOR,
`stage_renewal` still sends it for one facility, and the back-compat envelope test still passes), so
nothing that worked stopped working.

**Preselection, never a lock.** `impliedFacility` reads, in order: the client ask's own
`facilityName`; the ask's `from` figure matched against exactly one member's committed; failing both,
the largest committed member. Ambiguity (two members at the same commitment) falls through rather
than guessing. Sterling's staged ask is "10.0M to 13.0M", so the ticket now opens with the Working
Capital Revolver ticked BECAUSE the client wrote about it, not because it happens to be the largest.

**The unbooked showcase facility stays visible.** `packageFacilities` returns it in
`disabledOptions` with its stage ("at Proposal"), the same as before. A banker hunting for a facility
finds it with a reason rather than finding it absent. Every org refusal that does reach the panel is
still rendered verbatim; nothing in this branch paraphrases one.

## 4. The delta correction

`commitmentDeltas(bundle, proposed, selection)`. The selection is now part of the question:

- **Commitment**: before is the sum of the selected members' committed; after is `n × proposed`,
  because each member moves TO the proposed figure. At N=1 the note names the facility; at N>1 it
  says "across N selected facilities, each moving to $X".
- **Collateral coverage**: lendable over the relationship's commitment AFTER the change
  (`total - selected + n × proposed`), not over the proposed figure alone.
- **Total leverage**: restated on the SELECTED members' delta, on unchanged EBITDA.

Silence over invention is unchanged and now has three more triggers: no selection, a selected id the
read does not stage, and a selected member carrying no committed figure. Each returns `[]`.

Worked example, three members at 10.0M / 6.0M / 4.0M on a 20.0M book: selecting the 6.0M and 4.0M and
asking 9.0M each is +8.0M, so the book reads 28.0M. The old code would have reported a book moving
from 20.0M to 9.0M.

## 5. UNVERIFIED

1. **The N=2 EXECUTE response body was never archived.** The run happened
   (`EVIDENCE-SEPT4.md`, "Multi-facility package-anchored modification PROVEN", 2026-08-25: one
   package anchor, two members, one plan of 8 steps, one token, one approval, two clones at
   Qualification with maturity 2027-09-30, chains RL-00000205/206, both parents untouched, rolled
   back to zero residue) but only its outcome was written down.
   `app/src/actions/derived-execute-modification-n2.json` RECONSTRUCTS the body from three sources it
   names in its own `_derivation` block: the OBSERVED N=2 stage plan, the OBSERVED N=1 execute
   response's per-facility field set, and the recorded N=2 outcome. Its `unverified` list carries the
   five things it does not know: the real `cloneLoanId` values (placeholders here), `junctionId`,
   `cloneLookupKey`, the org's rewritten clone names, and the exact batch-level `outcome` wording for
   N>1. **Nothing in that file may be cited as observed wire behaviour.** It exists so the render
   path is tested at N=2; the N=2 STAGE path is tested against a real envelope.
2. **Renewal is deliberately untouched this wave.** It shares `facilityChangeSchema`, so it gets the
   scoped member list and the reordered ticket, but it has no package header, no at-least-one-change
   rule and still sends the flat `loanId` for one facility. The founder scoped this branch to the
   modification; renewal's own package-first pass is a separate decision.
3. **The member list is scoped client-side.** Same approximation the covenant review documented: the
   org resolves package membership itself, and a facility the cockpit places wrongly is refused by
   the tool by name. The scoping fails OPEN. A read where no facility carries a `productPackageId`
   at all is not filtered, because filtering on a field the read does not carry would empty the list
   on a data gap.
4. **`requestedTermMonths` is still a text field** rendering into a `Decimal` on the Request. That
   predates this branch and is unchanged; `nOf()` coerces it and a non-numeric entry sends null.
5. **No live call was made.** Every assertion here is against archived envelopes and the deployed
   Apex source. The package-first ticket has not been driven against the org.

## 6. Evidence

| Gate | Before | After |
|---|---|---|
| `npm ci` (clean room, `node_modules` deleted) | ok | ok |
| `npm run typecheck` | clean | clean |
| `npm test` | 54 files, 1483 tests, all pass | 55 files, 1521 tests, all pass |
| `npm run contrast` | all pass | all pass |
| `npm run build` | ok | ok, `dist/cockpit.html` 664,585 bytes |
| `node app/scripts/release-artifact.mjs` | not run | promoted, marker verified |
| `node app/scripts/assemble-artifact.mjs` | not run | `/tmp/c360-publish.html`, 793,508 bytes, 5 borrowers, slot verified |
| `node scripts/sync-plugin-assets.mjs` | not run | template + both data files synced |

Nothing was published.

Test movement, +38: `modTicket.render.test.tsx` +26 (the deal anchor, the member scoping, the three
preselection derivations, the four change fields and their labelling, the plan at N=1 and N=2, the
filed result at N=2); `dealTicket.test.ts` +8 (delta aggregation, the N=1 note, dedupe, and the two
new silence cases); `actionPanel.ui.test.tsx` +3 (reading order, the client-ask preselection, the
at-least-one-change refusal and the maturity date reaching the wire); `ws05Envelopes.test.ts` +1 (the
org's rule, in its own words). Two existing tests were rewritten rather than deleted: "keeps the flat
loanId shape when exactly one facility is selected" became two tests, one asserting the modification
now names one member as a member and one asserting renewal still sends the flat shape.
