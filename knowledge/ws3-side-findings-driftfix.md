# WS3 side findings — the confirm-gate drift dead end, and bare member counts

Branch `ws3-drift-and-labels`. Two defects from the founder's live test on
2026-08-26. Both fixed in the React cockpit only. No org contact, no Apex.

## Fix 1 — the confirm gate was a dead end after a Sync

### What the founder hit

Staged a modification ticket, ran a live Sync, pressed Confirm. The gate
refused with "The staged data was replaced after this plan was built", named no
changed figure, and offered nothing but Back. Pressing Confirm again produced
the same refusal, because the plan carries the figures it was staged with and
the recompute keeps finding the same divergence.

### Root causes, both real

(a) `detectDrift` raises `data_replaced` on `was.asOf !== currentGeneratedAt`.
A sync moves that instant whether or not it moves a number, so a plan whose
every figure had just been re-proven identical was refused for being re-read.

(b) `ConfirmGate` recomputed with `computeSuggestions({ data, bundle, actionId })`
and compared against `data.meta.generatedAt` — the BAKED assembly time — while
the ticket had computed the displayed suggestions on the live-merged read at
the live instant. So after any sync the two sides could not agree by
construction, and a genuinely moved figure would have been compared against
stale numbers.

(c) The drift panel had no way forward at all.

### What changed

- `app/src/actions/suggestionEngine.ts` — new `blockingDrift()` (drops
  `data_replaced`, keeps `value_moved` / `suggestion_vanished` /
  `policy_changed`), `isRecheckOnly()`, and the `RECHECK_LINE` copy.
  `detectDrift` itself is unchanged: it still reports the newer read. Reporting
  and blocking are now two different decisions.
- `app/src/components/ConfirmGate.tsx` — one `recompute()` used by both the
  render and the gesture; new optional props `liveStoredAt`, `liveSections`,
  `asOf` so the gate recomputes on the same read the ticket did; the recheck
  line renders as plain informational prose; `onRestage` renders a primary
  "Refresh figures and re-stage" action inside the drift notice and the Confirm
  button is disabled while that stands, so there is exactly one way forward.
- `app/src/components/ActionPanel.tsx` — threads the live read into the gate and
  wires `onRestage` to its existing `stage()`, which re-runs the same staging
  call with the same inputs on current data and replaces the plan in place. The
  banker then confirms the fresh plan. Nothing auto-executes.

Surfaces that cannot re-stage (onboarding, the batch previews) pass no
`onRestage` and keep the previous copy and gesture.

## Fix 2 — a member count must read "N of M"

The founder read a bare "1 facility" as the package's own size. Every
selection-scoped label now states both numbers; the deal HEADER still states a
plain total, because that is what it is.

- `app/src/actions/dealTicket.ts` — new `selectionLabel(n, m)` ("N of M
  selected") and `packageFacilityCount(bundle, packageId)` (active members of
  the deal, falling back to the relationship's active facilities when the read
  stages no package). The modification delta note now reads
  `on CapEx, 1 of 7 selected` / `2 of 7 selected, each moving to $12M`.
- `app/src/actions/dealTicket.ts` — `reviewFacts` takes the picked package, so
  "In scope" reads `3 of 5 active facilities` when the review covers one deal
  of a multi-deal relationship, and the plain total when it covers everything.
- `app/src/components/DealTicket.tsx` — the member-list header and the from→to
  kicker both carry `N of M selected`. The denominator is every row the list
  renders, unselectable ones included, because the banker reads those as
  members too.
- `app/src/components/ConfirmGate.tsx` — the batch header reads
  `2 of 3 facilities in this credit action`, falling back to the plain count
  when the read cannot place the plan's package.
- `app/src/actions/schemas.ts` `packageRecords` — UNCHANGED by design. That
  string is the deal header's own total.

## Gates

| Gate | Before | After |
|---|---|---|
| `npm ci` (clean room, node_modules removed) | — | clean |
| `npm run typecheck` | clean | clean |
| `vitest run` | 56 files / 1584 tests, all pass | 57 files / 1601 tests, all pass |
| `npm run contrast` | pass | pass (no new token pairs) |
| `npm run build` | — | 680,296 bytes |
| `release-artifact.mjs` | — | marker verified |
| `assemble-artifact.mjs` | — | 809,208 bytes, 5 borrowers, slot verified |
| `sync-plugin-assets.mjs` | — | template + both data files synced |

New tests: `app/src/confirmGate.render.test.tsx` (10), plus additions to
`suggestionEngine.test.ts`, `dealTicket.test.ts` and `actionPanel.ui.test.tsx`.
Two existing `dealTicket.test.ts` note assertions were updated to the new
phrasing; the `data_replaced` drift test was rewritten to assert reported but
not blocking.

## UNVERIFIED

- Nothing here was run against a live org or a live Sync. The founder's exact
  path (stage, Sync, Confirm) is reproduced in jsdom by stamping the plan's
  suggestions with an older `asOf`, not by running the sync sweep.
- The re-stage affordance is proven to call `stage()` once and to leave the
  confirmation untouched. That a live `stage_loan_modification` round trip
  returns a plan the gate then accepts is NOT proven here.
- `packageFacilityCount` is exercised on fixture data. Whether a live plan's
  `productPackageId` matches the ids the read stages on its facilities is
  untested; when it does not, the label degrades to the plain count by design.
- The `reviewFacts` package scoping changes what the annual-review ticket
  states about its own scope. It has not been read back by a banker.
- Nothing was published.
