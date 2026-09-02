# Relationship room audit, 2026-09-02

Read-only. Repo at `main 4bcb809`. Facility workroom and `app/src/workroom/**` untouched by this pass.
Scope: `app/src/components/relationship/**`, its tests, the five Stage/Execute Apex classes, and the
facility room's shell layers it does or does not share.

---

## 1. What the room does today, route by route

Shell: `RelationshipRoom.tsx` (2137 lines) + `relSession.ts` (module store, no provisional route) +
`relRoute.ts` (router) + `reviewFlows.ts` (step machine and payloads) + `relBrain.ts` (envelope).
Host `RelationshipRoomHost` resolves the bundle, builds `RelContext`, and wires `brain={relBrainLane()}`.

Opening. `relOpeningFor` derives one governance signal from covenants only: financial breach ->
rating route; overdue test -> covenant route; test due within `COVENANT_DUE_DAYS` (45) -> covenant
route. Null is the common case and falls to `NEUTRAL_QUESTION` with five chips, each disabled with
the registry's own reason where `routeAvailability` refuses it. Free text binds through
`readRelRouteIntent` (SERVICE, VALUATION, RATING, ANNUAL, then COVENANT, narrowest first).
`asksForFacilityWork` answers `FACILITY_HANDOFF` in one line.

| route | tool pair | lines it accepts, in order | what it stages |
| --- | --- | --- | --- |
| annual | `stage_annual_review` / `execute_annual_review` | `reviewType` (chips, org's three), `relationshipSummary` (optional text), `recommendation` (optional text) | accountId, rationale, reviewType, productPackageId, relationshipSummary, recommendationNarrative. Seven other narrative wires hard-nulled. |
| covenant | `stage_covenant_review` / `execute_covenant_review` | `covenants` (multi), then per covenant `covenantStatuses.<id>` (Compliant/Waived/Exception), `covenantObservedValues.<id>` (optional number), `covenantReasons.<id>` only on Exception, then `assessmentNarrative` (optional) | productPackageId, covenantIds, assessments[] with status, observedValue, reasonForException, narrative. All-or-nothing on verdicts. |
| valuation | `stage_collateral_valuation` / `execute_collateral_valuation` | `records` (multi, deduped by collateralId), per asset `recordValues.<id>` (number), `valuationDate` (date), `type` (basis chips), `source` (chips) | productPackageId, items[] with per-record value and shared date/type/source; `description: null`, `primary: false`. Cap 20. |
| rating | `stage_risk_rating_review` / `execute_risk_rating_review` | four optional numbers (`cashFlowCoverage`, `revenueGrowth`, `managementExperience`, `creditScore`), then `overrideComment` (optional) | accountId, computedRiskGradeValue from the snapshot, four named scalars, comments. No override key. |
| service | `stage_service_request` / `execute_service_request` | `type` (free text), `origin` (free text), `subject` (free text, client's request offered as a chip), `detail` (optional, folded into rationale) | accountId, requestType, origin, summary, reference kind/id/webLink. |

Discipline that is already right: `nextStep` returning null is the single readiness test;
`stageRelPlan` re-runs `validatePlan` and `assertNoRecordIds` and withholds the token on
`executionHeld`; `executeRelPlan` stamps `dispatched` so the room seals rather than retrying a burnt
token; `dossierRowsFor` reads the org's result, and `recordName === null` renders as
"filed, unverified"; `CREATE_GAPS` refuses the two relationship-level creates by name with the
org-side gap stated.

### Three defects found against the deployed Apex

1. **`origin` is not a wire.** `StageServiceRequest.cls` declares no `origin` invocable variable. It
   resolves Type and Origin itself with `C360Picklist.preferredOrFallback` and reports a
   `degradedTypeMode`. `writeTools.ts` line 492 declares `origin?: string | null` and the room asks
   "How did it reach us?" and stages the answer. That answer is dropped on the wire, so the room asks
   a question it cannot file. `reviewFlows.test.ts:386` pins the current behaviour.
2. **The rating override refusal is now false.** `OVERRIDE_NOT_FILEABLE` says the input's wire name
   "has never been observed". `StageRiskRatingReview.cls` declares
   `overriddenRiskGradeValue` with a description, and `comments` is documented as required whenever
   an override is present. The refusal is stale against the source in this repo.
3. **The activity trail is claimed, not written.** `setToast("... logged to the activity trail")` at
   the execute path, but the room takes no `onFiled` and `RelationshipRoomHost` wires none. The
   facility room does exactly this through `WorkroomHost.tsx:152` and `Workroom.tsx:3354`.

Wires already on the tools that the room never offers: `allowNonPending` (covenant), `description`
and `primary` (valuation items), `loanId` (rating), `narrative`, `strengthsNarrative`,
`weaknessNarrative`, `collateralAnalysisNarrative`, `financialAnalystNarrative`,
`guarantorNarrative`, `riskRatingComments`, `editedNarrativeFields` (annual).

---

## 2. What the facility room has that this one lacks

| capability | facility room | relationship room |
| --- | --- | --- |
| session brain narration under cards | `useNarration` + `<Narration>` on every item | present, same single effect, but only `agent` lines without options and `read` cards produce a subject |
| greeting v2, consent moment | `narration.open(openingIdRef.current, {act:"greeting"})` gated on `mailGate` | **absent**. `narration.open` is never called, so the platform consent dialog lands on whatever agent line narrates first, mid-review |
| line items with a figure rail | greeting act budget of ~90 words, three rows | reachable, but no greeting act is ever emitted |
| client mail on the envelope | `useClientMail` -> `BrainMail`, plus the late-mail second remark | **absent**. `buildRelEnvelope` never sets `mail`, `buildReadBlocks(src)` is called without `hasMail` |
| route-neutral opening | `routeOpen` argument, `route-open` doctrine block | **already correct**: `relBrain.ts` sets `routeOpen` and `routeOptions` |
| elicitation grammar | `elicit.ts`, one question per unowned slot, book and plan held first | a fixed step machine. No "only ask for what the human owns" check, no book-answered-question suppression |
| amendment grammar | `amendmentOf`, `planAmendmentFor`, `amendedPlanLine` | **absent**. An answer can only be dropped by the lane's x button, never amended by a line |
| plan and book awareness | `awarenessFor`, `mirrorChips`, `buildBook` | **absent**. No mirror of what the relationship already carries |
| catalog chips from the org | `readCatalog()` once per view, `chipSet`, `reconcileChips` | **absent**. Chips come from `observedPicklists.ts`, the shell mirror. `Case.Type` and `Case.Origin` get no chips at all although `CATALOG` now carries both |
| read cards | `buildReadCard` on five topics | **shared and already used**, locally and first, before the route gate |
| refusal by name | `fileable` map plus `clarifyOffWire` | `relFileable` is present and good; item 2 above makes one entry wrong |
| activity trail language | `onFiled` with `armTrailSummary` and the pricing decision | toast only |
| safety layers | `dispatch.ts` qualifier filter, magnitude advisories, misread commitments, `provablyClean` | not applicable: the room stages no scalar deltas |
| doctrine coverage | blocks for 2.x, 4.2, 4.3, 4.7, 5 | 4.4 coverage and borrowing-base math and 4.8 risk rating and governance have **no block at all**, and they are exactly this room's subject matter |

---

## 3. Shared layers: what already applies, what needs porting

Already shared and working, no port needed: `Peek`, `Liquid`, `TypeIcon`, `ReadCardView`,
`entryChoreography`, `stepper`, `ask.ts`, `readCard.ts`, `readBlocks.ts`, `brainRoute.toReadCardModel`,
`brainLane.ts` (`capEnvelope`, `askBrain`, `brainReachable`), `Narration.tsx`, `narrate.ts`,
`sampleDoor.ts`, `ladder.ts`, `doctrine.ts`, `writeTools.ts`, `transitionAllowlist.ts`, `workroom.css`.

Nearly applies, needs one call site in the relationship room only: `narrate.subjectFor` (it reads
structure, and the relationship `opening`/`brief`/`gap`/`dossier` kinds simply return null),
`Narration.open` for the consent moment, `clientMail.useClientMail` and `mailNoteFromBundle`,
`catalog.readCatalog` / `chipSet` / `reconcileChips`.

Needs porting, not sharing, because the facility versions are bound to deltas and members:
`elicit.ts` (slots, book, awareness, amendment), `dispatch.ts` (delta safety), `orgArms.ts`,
`exception.ts`, `fee.ts`, `pricingGate.ts`. None of these have a relationship analogue and only the
amendment and book-awareness ideas are worth carrying across.

---

## 4. Port plan, ordered, checkpoint-sized

Every item names its files, the tests that pin it, and whether it touches a file the facility room
reads. `app/src/workroom/**` and `transitionAllowlist.ts` are untouched by all of it.

| # | work | files | tests that pin it | facility risk |
| --- | --- | --- | --- | --- |
| 1 | Consent rides the greeting. Hold an `openingIdRef`, call `narration.open(id, {act:"greeting", sentence: greeting + (ask ? ask.line : position)})` once the lookup has landed. | `RelationshipRoom.tsx` | new case in `relationshipBrain.render.test.tsx`: one `prime` call, zero before the lookup lands; existing "with no bridge" cases must stay green | none, no shared file |
| 2 | Stop asking for `origin`, or stop claiming it writes `Case.Origin`. Recommend deleting the step and the payload key, and saying in `produces` that the org sets type and origin from its own picklists and reports a degrade. | `reviewFlows.ts`, `writeTools.ts` (drop `origin` from `create-service-request`) | rewrite `reviewFlows.test.ts:386`; `relationshipRoom.render.test.tsx` step-count cases | `writeTools.ts` shared: the key is used by no facility payload, so removal is type-safe. Run the facility suite. |
| 3 | Write the activity trail. Add `onFiled` to the room, wire it in `RelationshipRoomHost` the way `WorkroomHost.tsx:152` does, built from `dossierRowsFor` output and the execute result. Do not extract a shared helper. | `RelationshipRoom.tsx`, its host block | new case: filing appends one trail entry naming the review and the record | none if the builder is copied rather than lifted out of `WorkroomHost.tsx` |
| 4 | Org chips. Read `readCatalog()` once in the room, pass the catalog into `nextStep`, and take `covenantType`, `collateralType`, `caseType`, `caseOrigin` from it with the mirror as fallback via `chipSet`. | `reviewFlows.ts`, `RelationshipRoom.tsx` | new: with a catalog, service type offers the org's values; with none, the mirror stands and the room reads as today | `catalog.ts` read-only. None. |
| 5 | Annual review, the full assessment. Collect `strengthsNarrative`, `weaknessNarrative`, `collateralAnalysisNarrative`, `guarantorNarrative`, `riskRatingComments` as optional steps and stop nulling them. All five are declared on `StageAnnualReview.Request`. | `reviewFlows.ts` | extend `reviewFlows.test.ts:193` to assert each key travels when answered and is null when skipped | none |
| 6 | Covenant review, `allowNonPending`. Offer the opt-in as a chip only where a chosen covenant's `latestComplianceStatus` is not Pending, and say the schedule does not advance. | `reviewFlows.ts`, `RelationshipRoom.tsx` | new: the step appears only on a non-Pending row and the payload carries the flag | none |
| 7 | Valuation, `description` and `primary`. One optional note per exercise, and an explicit primary answer instead of a hardcoded false. | `reviewFlows.ts` | extend `reviewFlows.test.ts:308` | none |
| 8 | Doctrine for this room's subject matter. Add a `coverage-math` block from section 4.4 and a `risk-rating` block from 4.8, both `match`-gated, both added to `DOCTRINE_DROP_ORDER`. | `doctrine.ts` | `doctrine.test.ts`: both selected on their own words, both droppable, budget still under `DOCTRINE_BUDGET_BYTES` | `doctrine.ts` is shared. Match words (`coverage`, `rating`, `grade`) overlap facility lines, so the budget test is the gate. Medium. |
| 9 | The client's mail on the greeting. `useClientMail` in the host, `mail` on `buildRelEnvelope`, `buildReadBlocks(src, true)`, and the late-mail second remark through `narrate`, not `prime`. | `relBrain.ts`, `RelationshipRoom.tsx` and host | new: the greeting fires after the gate, one connector call, no second consent | `clientMail.ts` read-only. None. |
| 10 | Book awareness. A `relBook` mirror of what the relationship already carries (reviews filed, last valuation basis per asset, covenant verdicts already on the row) so a step does not ask what the read answers. | new `relBook.ts`, `reviewFlows.ts` | new module test plus a room case: a covenant whose row already carries a verdict is offered with it | none |
| 11 | Amendment grammar. A narrow reader that turns "make the DSCR one Waived instead" into an amendment of a collected answer rather than an unreadable line. | `reviewFlows.ts`, `RelationshipRoom.tsx` | new: the amended answer replaces in place and the lane order does not change | none |
| 12 | The rating override, pending a founder call. `overriddenRiskGradeValue` is declared on the Apex request. Either collect it with the mandatory comment, or restate the refusal to say the input exists and the room chose not to offer it. Do not leave the current sentence, which is false. | `reviewFlows.ts`, `writeTools.ts` | rewrite `reviewFlows.test.ts:376` and `relationshipRoom.render.test.tsx:556` | `writeTools.ts` shared, additive on a payload no facility route sends. Low. |
| 13 | Read topics for this room: `reviews`, `rating`, `requests`. | `ask.ts`, `readCard.ts` | `readCard.test.ts`, plus the full facility read suite | **highest**. `readTopic` order is shared and the facility room's five topics must not move. Do this last, behind a full facility run. |

Items 1 to 7 and 9 to 11 touch no file the facility room reads. Items 2, 8, 12 and 13 do, and 13 is
the only one that can change facility behaviour by construction.

---

## 5. Not in scope, flagged

- The facility room's delta safety layers (`dispatch.ts`, `orgArms.ts`) have no relationship analogue
  and should not be forced into one.
- `stage_renewal` is execution-held (`writeTools.ts:63`) and is not one of the five routes.
- `relOpeningFor` deliberately raises no signal for review age or valuation staleness because no read
  carries either date. That absence is correct and should survive the port.
