# Addendum: more than one product package

**Status: BUILT, on branch `multi-package`, not merged and not published.** Answers the founder's
question of 2026-09-02, asked on day one and deferred until now:

> "by that time we have not even selected a Product Package, why does it know that we are talking
> about this package (there is only one but what happens on multiple ones)?"

Evidence: `knowledge/PACKAGE-ANCHOR-FINDINGS-20260902.md` (what the room did before) and
`design/proposals/package-anchor-addendum.md` (the design this build is the first half of).
Screens: https://bot.connectry.io/s/da6a8a5dcce8/

Date: 2026-09-03. Rooms: Facility Actions (`Workroom.tsx`) and Relationship Actions
(`RelationshipRoom.tsx`).

**Fence.** `app/src/workroom/` is BYTE-UNTOUCHABLE and nothing here touched it. The three engines,
the auto-anchor in `openWorkroom.ts` and every deterministic sentence are unchanged. What changed is
the SHELL (what the room draws, and when) and one derivation that did not exist.

---

## 1. The rule

**One package is not a choice. Several is, and the room asks before it speaks.**

Where the relationship stages exactly one product package the room anchors on it without asking,
states on the header line that it did, and behaves byte-identically to the room that shipped. Where
it stages more than one and none is named, the room asks FIRST: no route chips, no package card, no
facilities, no greeting remark and no package figure anywhere on the glass until the banker answers.

## 2. Where the package list comes from

**It is derived, in one place, for both books.** No connector tool returns product packages.
`Customer360Exposure` returns FACILITIES, each carrying its own `productPackageId`, `stage`,
`status`, `productType` and `committed`; `Customer360Snapshot` names the relationship's own package
where the org staged one (checked against
`knowledge/sf-build-v2/wp2/observed-envelopes-exposure-v2.json`).

| Book | Facilities come from | Derivation |
|---|---|---|
| The five baked borrowers | `artifact/live-data.json`, `borrowers.<id>.exposure.facilities` | `packageRoster()` |
| Any relationship opened by name | the live `Customer360Exposure` read, assembled by `book/aggregate.ts` into the identical bundle shape | `packageRoster()` |

`app/src/book/packages.ts` is that one function. It stands on `packageRecords()` (`schemas.ts`) for
the id order and the deal's headline, and adds what the ask needs: stage, booked versus in progress,
the member facilities and the summed commitment. `artifact/live-data.json` was NOT extended: the
package list was already there, one level down, on the facilities.

**It is not the engines' `packageChoices`.** That list is ROUTE-SCOPED: it marks a package
ineligible when no member of it is booked, because a modification only runs against a booked
facility. The roster is route-NEUTRAL, because the room now asks which package before it asks which
route, and a package no modification can touch still takes a new facility. Eligibility stays exactly
where it was, on the route's own card.

This is also what unblocks the ordering that
`design/proposals/package-anchor-addendum.md` section 8.2 ruled out. That objection was correct
about the ROUTE-SCOPED cards (on Bright, nine of ten would render disabled to a banker heading for a
new facility where all ten are open) and does not apply to a route-neutral list.

## 3. What changed, file:line

### The facility room

| Where | What |
|---|---|
| `Workroom.tsx:362-372` | The package question, verbatim shell copy, and the header's word for each of the three states. |
| `Workroom.tsx:850-873` | `roster`, `packagePending` and `scopedFacilities`. `mustChoosePackage` is false for the whole shipped book. |
| `Workroom.tsx:1190-1199` | The ritual: on a pending choice the lookup lands the ask and returns. Nothing else lands. |
| `Workroom.tsx:1256-1258` | The tier effect refuses to run under an unanswered package question. |
| `Workroom.tsx:1894-1902` | The greeting effect returns while pending. The greeting is composed once, after the pick, against the anchored envelope. |
| `Workroom.tsx:4137-4213` | The header's Package line: the label, the stance sentence, the switch and its peek. |
| `Workroom.tsx:4368-4381` | `wk-pkgline`, on the header from the first frame in every state. |
| `Workroom.tsx:4239` | The ask-pin waits for the package: "$10M → $13M" over an unanswered package question is the founder's own complaint in miniature. |
| `Workroom.tsx:4267` | The route chips wait for the package. |
| `Workroom.tsx:4654` | The composer's `facilities` prop is the anchored package's, not the relationship's. |
| `Workroom.tsx:5043-5072` | The `pkgask` block: one line item per package, `role="radiogroup"`. |
| `route.ts:134-140` | `smartOpeningFor` returns null on an unanchored multi-package relationship. A signal ranked across every package is not a signal. |
| `roomSession.ts:61-89` | `openFacilityRoom` takes a `productPackageId` the caller already knew. |
| `intent/contract.ts:57-64, 98-103, 167-168` | An intent may name a package. Shape-checked as a record id; membership is checked by `workroomContextFor`. |
| `intent/open.ts:98-108` | An intent that names one binds it without asking. One that does not, asks. |

### The relationship room

| Where | What |
|---|---|
| `reviewFlows.ts:80-104` | `relContextFor` takes the banker's choice and carries the roster. |
| `reviewFlows.ts:612-635` | `relRouteNeedsPackage` (covenant and valuation, not annual/rating/service) and `relPackagePending`. `relRouteBlock` returns null while pending: `NO_PACKAGE_ANCHOR` says "the read stages none", which is false for a relationship that stages two. |
| `RelationshipRoom.tsx:721-729` | `packagePending`, and `ready` gated on it. |
| `RelationshipRoom.tsx:779-783` | The ask lands with the brief, before the first step. |
| `RelationshipRoom.tsx:809-811` | No step is asked under an unanswered package question. |
| `RelationshipRoom.tsx:1765-1834` | The Package line, its stance and its switch. |
| `RelationshipRoom.tsx:1911-1924` | The header control. |
| `RelationshipRoom.tsx:2385-2413` | The `pkgask` block, the same material as the facility room's. |
| `relSession.ts:41-46, 74, 79-85` | The session carries the chosen package; `anchorRelPackage` writes it. |

### Not touched, deliberately

The snapshot-only anchor is NOT widened. `relContextFor` still reads `snapshot.productPackageId`
alone for the single-package case, because `DeepLink.tsx:95`, `ActionPanel.tsx:697` and
`schemas.ts:448` carry the identical split and it is one ticket, not four half-fixes (see
`package-anchor-addendum.md` section 8). Widening it here alone changed six existing assertions for
a case this build is not about.

Also not in this build, and still open from the earlier addendum: the anchor CHIP in the opening
bubble's foot, the envelope's `anchor` / `packageCount` / `packageChoices` / `packageStance` fields,
`reads.scope`, the doctrine block, and the per-altitude memo in `sampleDoor.ts`. This build makes the
last one unnecessary for the case that motivated it (the greeting no longer fires before the pick,
so there is no stale sentence to replay), but the cross-relationship case it also fixes remains.

## 4. Switching

The Package line lists every package with the anchored one marked "you are here". Taking another
calls the same anchor door the ask calls: the host re-keys, the engine rebuilds, the stage clears and
the room re-greets for the new package.

**A staged plan blocks the switch.** One session is one package is one plan is one approval, so a
manifest composed against one package must be confirmed or dropped first; the room says so rather
than dropping it. The relationship room refuses the same way once a review has collected an answer.

## 5. The fixture

`scripts/two-package-fixture.mjs`. Sterling Fabrication keeps its two booked facilities in its own
package and gains a SECOND package holding one facility still in credit approval, and its snapshot
anchor is cleared because that is what the org does (`aggregate.ts` writes
`snapshot.productPackageId` only where the facilities name precisely one). Every other borrower comes
back by reference, so the Hartwell regression runs against exactly the book it always ran against.

ONE source for two readers: the vitest suite imports `withSecondPackage` and the Playwright probe
assembles its artifact from `twoPackageData()`, so the shot on the glass and the assertion in the
suite stand on the same bytes.

## 6. Evidence

- `app/src/multiPackage.render.test.tsx`, 21 assertions: the roster's figures, one-binds-silently,
  the ask's two line items, the pick, the scope, the composer's menu, the greeting's envelope, the
  switch, the staged-plan refusal, the intent that names a package, and the relationship room's own
  five.
- Facility regression: `design/probes/drive-hygiene.mjs` against Hartwell on the assembled build
  returns bubble counts, settled rows, expand behaviour and errors byte-identical to `117b12c` across
  all three runs (intent, manual, relationship).
- `cd app && npx tsc --noEmit && npx vitest run && npm run build` green. 3281 tests, 115 files.
- `design/probes/shot-multi-package.mjs`, four beats at deviceScaleFactor 2, zero page errors.

## 7. Open, for the founder

`knowledge/PACKAGE-ANCHOR-FINDINGS-20260902.md` section 4 is still unanswered and it decides how much
more this beat deserves: 100 of the 107 org accounts that carry packages carry more than one, but the
15 in the 8-to-10 bucket read as bulk seed (one identical `Account.CreatedDate`, ten identically
named packages created inside an eight second window, every package field blank), not as parallel
live deals. If that seeding is corrected upstream, most of those accounts collapse back to one
package each and this beat is a correctness fix rather than a workflow. If it is not, the ask is the
front door for most of the book and the folding, ordering and eligibility work in
`package-anchor-addendum.md` section 5.2 becomes worth doing.
