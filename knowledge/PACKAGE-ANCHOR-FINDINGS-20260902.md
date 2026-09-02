# Package anchor findings, 2026-09-02

How the Facility Actions room knows which product package it is standing in, what it tells the
model about that package before the banker has chosen one, and what happens on a relationship
that carries more than one.

Repo: `customer-360-reinvented`, branch `main`, HEAD `6fc1eee`. Every code citation below was
read on that commit. Every org figure below was pulled read only from `bankinggpt-at` on
2026-09-02. Engine fence (`app/src/workroom/`) untouched: this is a findings document, no code
was changed to produce it.

---

## 1. The founder's question, verbatim

Fabian, 2026-09-02, after opening Hartwell then Facility Actions in his claude.ai panel. The
room's opening remark read:

> "The room has opened on a $46MM package across six facilities with Hartwell Precision
> Manufacturing as borrower and dual guarantors... The staged plan is empty..."

His question:

> "by that time we have not even selected a Product Package, why does it know that we are talking
> about this package (there is only one but what happens on multiple ones)?"

---

## 2. The answer in plain words

**The room was not guessing. It resolved the anchor itself, from the book, before the first frame.**

Hartwell's snapshot carries no `productPackageId` at all. All six of its facilities carry the
same one, `a5Fbb000000IHFJEA4`. `packageRecords()` collects the distinct ids off the snapshot and
then off the active facilities, so on Hartwell it returns a list of exactly one. `workroomContextFor()`
reads that list and, when it holds exactly one id, takes it as the anchor with no banker gesture
involved. That happens inside `WorkroomHost`'s context memo on the very first render, which is
before the lookup beat, before the routing question is answered, and before any package card could
exist. The room's own source says this out loud, in the header comment on `workroomContextFor`:
`productPackageId` names a package "where the caller already knows it, which is both the
single-package case and the banker's own choice coming back in."

So on Hartwell the greeting was correct by construction. One package is not a choice, and the room
treated it as already made.

**What the greeting was actually told.** The greeting narration is not a special prompt. It is
built by the same `buildEnvelope` every other line uses, and the whole envelope is serialised
verbatim into the prompt under a line that says the room has just opened. On Hartwell that envelope
carried `packageName: "Hartwell Precision Manufacturing LLC credit package"`,
`productPackageId: "a5Fbb000000IHFJEA4"`, all six facilities by name, `staged: []`, and read blocks
whose exposure figures were `committed $46M, drawn $31.03M, available $14.97M, facilities 6`,
plus 22 involvement rows (12 Guarantor, 2 Limited Guarantor). Every clause of the founder's
sentence maps onto a field of that envelope. The model invented nothing.

**Two things were wrong anyway.** First, the room never said how it knew. Nowhere on the glass, in
the envelope, or in the model's doctrine does the word "the relationship stages exactly one package,
so the room anchored on it" appear. The banker is left to infer whether a choice was made for him.
Second, and this is the real defect, the same code path with several packages sends a greeting
whose package name is a count and whose figures are the whole relationship. See section 3.

---

## 3. What happens with several packages TODAY, as observed on the glass

Three relationships were driven headlessly through the same Facility Actions click: Hartwell
(one package, the founder's case), a synthetic two-package fixture, and Bright Logistics
(001bb00000O40U2AAJ, ten packages, live from the org).

### 3.1 The greeting prompt leaves the page BEFORE the package card exists. Always.

| Relationship | Packages | Greeting prompt sent at | On the thread at that instant |
|---|---|---|---|
| Hartwell | 1 | t+1590ms | opening bubble, lookup chip |
| Synthetic | 2 | t+1613ms | opening bubble, lookup chip |
| Bright Logistics | 10 | t+1559ms | opening bubble, lookup chip |

The room opens on the routing question. The tier effect that renders the package card is gated on
`if (!lookedUp || ask) return;`, so the card lands only after the banker takes a route chip
(measured at +277ms after the chip on the synthetic book, +262ms on Bright). The greeting effect
carries no such gate: it fires on `lookedUp` alone. So the model speaks about the package before
the package card exists, in every case, by however long the banker takes to answer the route
question. This is the crux, and it is the same in the single-package room.

### 3.2 One package: correct, and mute about why

Auto-anchored on the first render. Composer AWAKE from open ("Say what we are doing, or pick one
above."). Envelope package scoped and complete. Route chip "Modify" does NOT remount: the marked
opening bubble survived, because binding the provisional route leaves `session.route` where it
already was, so the `WorkroomHost` key does not move. The typed question "what facilities are on
this package" was answered immediately, deterministically, with all six facilities. Choosable
package cards: zero, because there is nothing to choose. Total greeting prompts: 1.

### 3.3 Several packages: the room opens on a name that is a count, over figures that are the whole book

Unanchored, the three engines hand back an EMPTY member list by construction, so the envelope's
`facilities` array is empty. But `readBlocks` filters facilities with `!src.productPackageId || f.productPackageId === src.productPackageId`,
and a null id narrows nothing, so exposure, pricing, collateral and covenant scoping stay
relationship wide. The result:

| | Two-package fixture | Bright Logistics, ten packages |
|---|---|---|
| `packageName` | "Hartwell Two-Package Test · 2 packages" | "Bright Logistics · 10 packages" |
| `productPackageId` | null | null |
| `facilities` | `[]` | `[]` |
| `staged` | `[]` | `[]` |
| `reads.exposure` | committed $46M, drawn $31.03M, available $14.97M, facilities 6 | committed $26.06M, drawn $2.32M, available $23.73M, facilities 10 |
| read blocks | covenants, involvements, collateral, all relationship wide | exposure only (the org read returns no covenants or collateral for this account) |

A label that reads like the name of a deal, sitting beside four figures that cover every package on
the relationship, with nothing marking the scope. That is precisely the shape from which a model
writes "the room has opened on a $46MM package across six facilities". The founder's sentence is
not a model failure. It is what the envelope says.

### 3.4 The multi-package room is a dead end at open

At open, both multi-package rooms show the composer DISABLED with the placeholder
"Reading the package…", because `brief.packageChoices.length > 0` keeps `awake` false. There is no
package card yet, because the route question holds the tiers. The only live controls are the route
chips. The typed question "what facilities are on this package" could not be sent at beat 1 or at
beat 2 in either room. The room has finished reading and is waiting on the banker, but it says it
is still reading.

### 3.5 The smart opening prints a single package's figure at relationship altitude

Bright Logistics opened on "Hey Fabian. The package is drawn to 90% of commitment. Worth a headroom
conversation?" with ten packages and nothing chosen. `ChatFab` passes `productPackageId: null` into
`smartOpeningFor`, whose package filter then narrows nothing, so `deriveNextMove` ranked across the
one BOOKED facility in the whole relationship ($2.32M drawn of $2.59M committed) and printed it as
"The package". The relationship is drawn to 8.9%. This sentence is deterministic, not model written,
and it is on the glass before any model call.

### 3.6 Choosing a package REMOUNTS the room. Taking a route does not.

Verified by marking the opening bubble with a data attribute before each gesture.

- Route chip: mark survived, `remounted = false`. `bindFacilityRoute` does not change
  `context.mode`, `context.door` or `context.productPackageId`, so the host's key is unchanged.
  (Binding renew or create WOULD remount, because the mode is in the key.)
- Package card click: mark gone, `remounted = true`, in both multi-package rooms.
  `anchorFacilityRoom` writes the id into the session, the context memo changes, the key changes,
  the room and its engine rebuild, and the entry ritual replays from scratch: lookup chip returns,
  packages(1) at +1712ms, facilities(2) at +2325ms on the synthetic book.

### 3.7 No second greeting call goes out, and the STALE remark survives the remount

Total greeting prompts per relationship: **1**, in all three cases.

The remounted room does call `narration.open()` again with a fresh opening id. That routes through
`primeConsent`, whose promise is memoised at module scope and DISCARDS the new prompt. So the second
greeting resolves with the first greeting's text, composed against the unanchored envelope. It also
cannot stream, because the `onText` handler belongs to the call that never runs.

On the glass after choosing the $6M two-facility package:

- headline, correct: "Hey Fabian. All 2 members are booked: the whole $6M is open. Pick one."
- package card, correct: "2 members · $6.0MM committed · 4/4 covenants"
- the remark directly under it, STALE: `packageName "Hartwell Two-Package Test · 2 packages"`,
  `productPackageId null`, `facilities 0`

Same on Bright: "Bright Logistics · 10 packages" sitting under an anchored $2.6MM one-member
package. With a real model rather than the stub, that is the "$46MM across six facilities" sentence
printed under a $6M two-facility package. **This is the one unambiguous defect in the set.**

### 3.8 After anchoring, everything else narrows correctly

Post anchor envelopes are right. Synthetic: `packageName "Hartwell Two-Package Test credit package · Non-Real Estate"`,
`productPackageId a5Fbb000000SYNTH02`, facilities 2, exposure committed $6M / drawn $4.16M /
available $1.84M / facilities 2. Bright: `packageName "Bright Logistics credit package · Real Estate"`,
`productPackageId a5Fbb0000001C9FEAU`, facilities 1, exposure committed $2.59M / drawn $2.32M /
available $269K / facilities 1. The deterministic read card answers correctly too
("This package holds 2 facilities." / "This package holds 1 facility."), and the narration written
under THAT card carries the anchored envelope. Only the greeting slot is stale.

### 3.9 Ten packages produce two distinct labels, and nine cards carry no figure

Bright's choice screen renders 10 cards carrying exactly 2 distinct labels:
"Bright Logistics credit package · Non-Real Estate" (five of them) and
"... · Real Estate" (five of them). `packageLabel()` disambiguates on product type and this org
carries only two. Nine of the ten are ineligible, and an ineligible card REPLACES its figure with
the reason, so five cards read "All members are at Qualification, and a credit action only runs
against a booked one." verbatim and nothing else. Exactly one card ("$2.59M committed · 1 member")
can be told apart from its neighbours. The ten cards also scroll the greeting and the framing
question off the top of the thread.

### 3.10 The question that frames the choice leaves the stage on the beat its own cards land

The choosing sentence ("2 packages on this relationship. Pick the one to work in: a modification is
anchored on one package, and one package is one plan under one approval.") is the QUESTION tier.
The package cards are the IDENTITY tier. A tier landing fades the tier above it, per the entry
choreography shipped on 2026-09-01. So the banker is left with bare cards and a
"↑ show what the room read (1)" control where the sentence was.

### 3.11 Lanes and console

The typed question "what facilities are on this package" was answered by the DETERMINISTIC read
card every time; the session door was called only to write the remark under it. No gateway LLM call
fired in any of the three runs. The only MCP tool call was `outlook_email_search`, once per room
mount. Console across all three relationships: 0 errors, 0 warnings, 0 page errors.

---

## 4. The org reality

Queried read only against `bankinggpt-at` on 2026-09-02. This corrects the framing the
investigation started from ("8 accounts carrying 8 to 10 product packages each").

- **776** Accounts in the org. **519** `LLC_BI__Product_Package__c` records.
- **107** accounts carry at least one package (4 packages hang off a null account).
- **100 of those 107 carry MORE than one.** Only **7** accounts in the whole org carry exactly one.
  Hartwell is one of the 7.
- Distribution: 10 packages on 2 accounts, 9 on 5, 8 on 8, 7 on 8, 6 on 14, 5 on 15, 4 on 27,
  3 on 14, 2 on 7, 1 on 7.
- The "8 to 10" bucket is **15** accounts, not 8: Summit Consulting and Bright Logistics (10);
  NextGen Logistics, Pinnacle Group, Global Enterprises, Bright Solutions, Horizon Technologies (9);
  NextGen Holdings, Pinnacle Consulting, Pinnacle Systems, Pinnacle Logistics, Quantum Holdings,
  Vertex Logistics, Bright Technologies, BlueSky Partners (8).
- **Those 15 read as bulk seed, not as parallel live deals.** All 15 share the identical
  `Account.CreatedDate` (2025-04-16T01:05:58Z) and use templated names (Bright*, NextGen*,
  Pinnacle*, Quantum*, Horizon*, Vertex*, BlueSky*). All ten of Bright Logistics' packages are
  identically named "Bright Logistics - 4/22/2025 - PP", created inside an 8 second window on
  2025-04-23, every one with `LLC_BI__Stage__c` blank and `LLC_BI__Approval_Status__c` "Not
  Submitted". Package level fields carry zero differentiation. Yet each package does carry one
  real, distinctly named, distinctly staged Loan. That is a one-package-per-facility seeding
  pattern, not the way Hartwell's real six facilities share a single package.
- **Hartwell**: `001bb00001I7FPNAA3` carries exactly one package, `a5Fbb000000IHFJEA4`,
  "Hartwell Industrial C&I Credit Package".
- **The shipped artifact book** (`artifact/live-data.json`) holds 5 borrowers. Every one carries
  `snapshot.productPackageId` null and exactly one distinct facility level package id: Piedmont
  Precision Components (3 facilities), Brightwater (2), Sterling (2), Kingsley (4), Hartwell
  (6 facilities, $46,000,000 committed, 22 involvement rows). **The unanchored branch has never
  been exercised by the shipped book, in either the engines or the UI.**

**The open question nobody has answered.** Whether those 100 multi-package accounts are a target
scenario worth designing the choice UX around, or a load-script artifact that should be corrected
upstream so most of them collapse back to one package each. The seeding evidence points at the
second. That answer changes how much investment the multi-package beat deserves. No design, vision
or brain document addresses it.

---

## 5. The standing claims, with file:line

**How the anchor resolves**

- `app/src/components/ChatFab.tsx:93` defines the Facility Actions satellite
  (`actionId: "loan-modification"`). `ChatFab.tsx:551-555` is the handler: it calls
  `openFacilityRoom` with an account id and an opening, and no package id. The satellite names only
  a relationship.
- `app/src/components/workroom/roomSession.ts:50` `const PROVISIONAL: WorkroomMode = "modify";` and
  `roomSession.ts:73` `productPackageId: null` on the seeded session. The room stands on an engine
  before any question is answered.
- `app/src/components/workroom/WorkroomHost.tsx:63` reads `session?.productPackageId ?? null` and
  `WorkroomHost.tsx:66-73` forwards it into `workroomContextFor` on every render.
- `app/src/workroom/openWorkroom.ts:57-60` is the auto-anchor:
  `const pkg = named ?? (packages.length === 1 ? packages[0] : null);`. With more than one it opens
  unanchored, and `openWorkroom.ts:67-68` names the package
  `` `${args.accountName} · ${packages.length} packages` ``.
- `app/src/actions/schemas.ts:916-922` `packageRecords()` derives ids from
  `snapshot.productPackageId` first, then from each active facility's own `productPackageId`. On
  this book the snapshot half contributes nothing, so every id comes off the facilities.
- `app/src/components/CommandPalette.tsx:104-112` is the second entry point and passes no
  `productPackageId` key at all, so it relies on the same auto-anchor and hits the same unanchored
  branch.

**The ritual, and the gate the greeting does not have**

- `app/src/components/workroom/Workroom.tsx:249` `const LOOKUP_MS = 1500;`
- `Workroom.tsx:832-833` `if (choosing) return; setAwake(true);` The composer sleeps behind a
  pending package choice, and `Workroom.tsx:3074-3082` disables the input on `awake` with the
  placeholder "Reading the package…".
- `Workroom.tsx:885` `if (!lookedUp || ask) return;` The tier effect refuses to run while the route
  question is open, and `Workroom.tsx:900` `if (choosing) return;` stops it after the identity tier
  when a choice is pending.
- **`Workroom.tsx:1331-1335` carries NEITHER guard.** It fires on `lookedUp` alone:
  `if (!brain || !lookedUp || !openingIdRef.current) return;` then
  `narration.open(openingIdRef.current, { act: "greeting", sentence: said })`. This is the crux.
- `Workroom.tsx:1333` `const said = ` greeting plus (`ask ? ask.line : brief.position`). The
  greeting itself is only a name: `app/src/workroom/viewer.ts:40-43` `greetingFor` returns
  `Hey <first name>.` or empty, fed at `app/src/workroom/modifyEngine.ts:1189`.

**What travels**

- `Workroom.tsx:1277-1292` `envelopeFor` calls `buildEnvelope`, and `Workroom.tsx:1321`
  `useNarration({ enabled: Boolean(brain), envelopeFor: (line) => envelopeFor(line) })`. The
  greeting uses the same envelope as every other line.
- `app/src/components/workroom/brainRoute.ts:100` is where `buildEnvelope` lives (NOT
  `brainLane.ts`, which holds the type, `capEnvelope` and the drop order). `brainRoute.ts:139-144`
  sets `packageName`, `productPackageId`, the eligible `facilities`, `staged` and
  `reads: buildReadBlocks(...)`.
- `app/src/channel/narrate.ts:100` `greeting: "The room has just OPENED on this relationship and greeted the banker."`
  and `narrate.ts:136` `JSON.stringify(envelope)` under a `CONTEXT:` line. Nothing summarises or
  narrows the envelope on the way to the model.
- `app/src/workroom/modifyEngine.ts:727-730` `const unanchored = !context.productPackageId && choices.length > 1;`
  then `const members = unanchored ? [] : packageMembers(...)`, and `modifyEngine.ts:1190`
  `packageChoices: unanchored ? choices : []`. Same pair at `renewEngine.ts:267-270` / `:628-631`
  and `createEngine.ts:179-183` / `:497-500`. The engines are correct: unanchored means no members,
  no suggestion, no plan.
- `app/src/components/workroom/readBlocks.ts:45-49` `scoped()` filters
  `!src.productPackageId || f.productPackageId === src.productPackageId`. A null narrows nothing, so
  exposure (`:126`), pricing (`:139`), collateral (`:109`) and covenant scoping (`:70`) are
  relationship wide when the room is unanchored, and `buildReadBlocks` (`:146-156`) emits them all
  unconditionally. The `ReadSource` is fed `productPackageId: context?.productPackageId ?? null` at
  `WorkroomHost.tsx:111`.
- `readBlocks.ts:90-97` the involvements block is never package scoped at all, anchored or not.
  Every legal entity travels; the package only affects how a row's `scope` is LABELLED, with
  `readBlocks.ts:29` `const RELATIONSHIP = "across the relationship";`
- `app/src/components/workroom/route.ts:136-138` `smartOpeningFor` filters booked facilities on
  `!args.productPackageId || ...`, so with the FAB's null (`ChatFab.tsx:554`) the maturity and
  utilization ranking in `deriveNextMove` is fed every package's facilities at once.

**Anchoring, and the stale remark**

- `roomSession.ts:80-84` `anchorFacilityRoom` only writes the id into the session. It binds no route
  and rebuilds nothing itself.
- `WorkroomHost.tsx:187`
  `` key={`${context.mode}-${context.door}-${context.accountId}-${context.productPackageId ?? "none"}`} ``.
  Anchoring moves the key from `...-none` to `...-a5F...`, so the room and its engine REMOUNT.
  `WorkroomHost.tsx:203-207` shows both doors (`anchorFacilityRoom` on an open session,
  `openWorkroom` otherwise) reaching the same outcome.
- `Workroom.tsx:806-821` the remount replays the entry ritual from scratch: fresh items, a fresh
  opening id (`Workroom.tsx:285-286` guarantees a new one), `setLookedUp(false)`, tiers reset.
- `app/src/channel/sampleDoor.ts:309` `let priming: Promise<string | null> | undefined;` and
  `sampleDoor.ts:328-330` `if (priming) return priming;`. **The memoised promise discards the new
  prompt**, so the second greeting hands back the first greeting's text. The suite already asserts
  exactly this at `app/src/channel/sampleDoor.test.ts:178-184`.
- `app/src/channel/Narration.tsx:119` `const call = greeting ? prime(prompt, options) : ask(prompt, options);`
  with `Narration.tsx:76` `const prime = deps.prime ?? primeConsent;` and no prime injected at
  `Workroom.tsx:1321`. Every greeting routes through prime and never through ask, so a replayed
  greeting cannot reach the model. It cannot stream either: `onText` (`Narration.tsx:116`) belongs
  to `options`, which the memoised promise ignores.
- `sampleDoor.ts:334` `askSession(prompt, { ...options, kind: "greeting", tier: "quick", cache: true })`.
  The `cache: true` is real and reaches the platform, asserted at `sampleDoor.test.ts:195-197`, but
  only on the single call that actually happens.
- `Narration.tsx:103-104` `if (asked.current.has(id)) return;` latches one remark per item id, so
  within one mount the greeting runs at most once even though `ask` is a dependency of the effect
  at `Workroom.tsx:1335`.
- `Workroom.tsx:2324-2325` binding a route calls `router.onBind`, into `roomSession.ts:99-105`.
  Binding a DIFFERENT route also remounts (mode is in the key); binding the provisional `modify`
  does not, because `sessionRoute` never moves. `app/src/workroom/modes.ts:98-101` keeps the door
  as `package` for modify and renew regardless of anchoring.

**The choice card, and the composer**

- `app/src/workroom/modifyEngine.ts:152-171` defines `packageChoices(bundle)` off `packageRecords`
  with an eligibility read from `bookedFacilities`; mirrored at `renewEngine.ts:136` and
  `createEngine.ts:106`. `app/src/workroom/engine.ts:332-334` notes the storyline engine stands on
  ONE package by construction and returns `packageChoices: []`.
- `app/src/workroom/engine.ts:62-71` is the `PackageChoice` shape: `id`, `label`, `figure`,
  `eligible`, and `reason` "present exactly when NOT eligible".
- `Workroom.tsx:3423-3439` renders the block. With choices it renders selectable cards calling
  `onAnchor`; with none it renders the single anchored package as a disabled, selected card. The
  card body is `{choice.eligible ? choice.figure : choice.reason}`, which is why an ineligible card
  loses its figure.
- `Workroom.tsx:2710-2714` builds `anchoredPackage` from `context.productPackageId ?? "anchored"`
  and `brief.packageName`, fed at `Workroom.tsx:2939-2942`.

**Doctrine**

- `app/src/channel/doctrine.ts:62-72` IDENTITY, `always: true`. Line 67 asserts the singular as
  fact: "A commercial banker is standing in a deal, looking at one borrower's product package".
  The block list at `doctrine.ts:313-330` contains no package-selection block, and the selection
  rule at `doctrine.ts:391-393` admits only `always` blocks plus blocks whose `match` regex hits
  the line.
- `doctrine.ts:91-100` the WIRE block is the one place `productPackageId` is named, and it is
  `modes: ["reply"]`, filtered at `doctrine.ts:390`. It never travels on a greeting.
- `Narration.tsx:110` composes the prompt with `line` = "" for a greeting (`Narration.tsx:134`), and
  `narrate.ts:112` selects doctrine on `envelope.line || subject.sentence`. So doctrine surface
  selection for the greeting is driven by the greeting SENTENCE, not by a banker line.

**Adjacent, real, not part of the greeting**

- `readCard.ts:117` `const all = entities.filter((e) => !e.loanId || byLoan.has(e.loanId));` DROPS
  involvement rows whose loanId is out of scope, where `readBlocks.ts:90-97` KEEPS them labelled
  "across the relationship". Verified numerically on the shipped book: Hartwell has 22 involvement
  rows over 6 facilities, and exactly one row (a Borrower row on loanId `a4Zbb000002CECXEA4`) is
  not on any of the six. The glass and the envelope disagree by that one row, on the demo account.
- `app/src/components/DeepLink.tsx:95-96` reads `snapshot?.productPackageId` only, which is null on
  all five shipped borrowers, so the OpenInNcino chip renders disabled; against
  `ChatFab.tsx:592-595` which reads `packageRecords(...)[0]?.id` and works. Same split at
  `ActionPanel.tsx:697` and `schemas.ts:448`, and at
  `app/src/components/relationship/reviewFlows.ts:83`, whose snapshot-only anchor hard-blocks the
  covenant and valuation routes (`reviewFlows.ts:643-644`, `:679`) on the entire shipped book.
- `ActionPanel.tsx:838-845` the modification and renewal payloads fail CLOSED instead, taking the
  package from the chosen facilities and refusing when the ticket's own chooser disagrees.
- `schemas.ts:991-995` and `:1008-1014` the staged ticket's Deal chooser is package derived and
  editable only when the relationship stages more than one. Same fact the workroom asks about,
  expressed as a form field rather than a blocking beat.
- `WorkroomHost.tsx:144-151` the executed-activity trail entry carries `context.productPackageId` as
  its record reference, into `app/src/actions/executedActivity.ts:221-224`. An entry filed from an
  unanchored room would carry a null reference. Today only the sleeping composer prevents that.

---

## 6. The refuted claims, and why

**"The single-package shape the artifact ships is the exception in the org: 101 of 107 accounts
carrying packages carry more than one."** REFUTED as stated, on two counts, though the underlying
direction is right.

1. The arithmetic is close but not what was claimed. Verified directly: **100** of the 107
   package-carrying accounts carry more than one, not 101. The 101 figure comes from a GROUP BY
   that returned 101 rows, one of which is a null-account group holding 4 orphan packages. It is
   not 101 accounts.
2. More importantly, the FRAMING is wrong. Hartwell's single-package state is not an incidentally
   discovered outlier. It is an engineered and maintained baseline:
   `knowledge/sf-build-v2/tools/revert-hartwell.py` and `revert-finish.py` are both hardcoded to
   `ACCT='001bb00001I7FPNAA3'` and exist to delete a second cloned package and its whole dependent
   graph off Hartwell, restoring it to a single-package "BASELINE VERIFY" state.
   `knowledge/BASELINE-2026-08-20.md` Layer 0 records this as the New-facility write-action test,
   "live-proven e2e, then tree-deleted". And `artifact/live-data.json` ships five borrowers, of
   which three are wholly synthetic SAMPLE accounts that do not exist in the org at all, every one
   carrying exactly one package. The single-package shape is the artifact's DESIGNED baseline, not
   a statistical accident the artifact happens to inherit.

   The corrected statement worth keeping: **only 7 of 107 package-carrying accounts in this org
   carry exactly one package, and the org's multi-package accounts read as one-package-per-facility
   seed data rather than parallel live deals.**

**"The greeting call bypasses the narration fence entirely: `shouldNarrate` is never consulted for
it, so it always runs whenever the session door exists."** REFUTED in its conclusion; the narrow
half is true.

`Narration.tsx:102` really is `if (!greeting && !shouldNarrate(subject)) return;`, so `shouldNarrate`
is skipped for a greeting. But "always runs whenever the session door exists" does not follow.
`Narration.tsx:101` is `if (!enabled || !sampleAvailable()) return;`, and `enabled` is
`Boolean(brain)` at both call sites (`Workroom.tsx:1321`, `RelationshipRoom.tsx:925`) which is a
separate gate from the door. And `Narration.tsx:103-104` latches one run per item id. The drive
confirms the practical shape: exactly one greeting prompt per relationship mount, and on remount
the second `open()` resolves against the memoised promise rather than firing an unconditional ask.
The greeting path is still gated; it is just gated on the wrong things (it lacks the `ask` and
`choosing` guards its siblings have).

---

## 7. What none of this fixes, and what is a founder call

**Not a defect, keep it.** The auto-anchor. One package is not a choice, and the banker should not
be made to click a certainty. What is missing is the room SAYING so.

**The one unambiguous defect.** The stale greeting remark surviving the anchoring remount (3.7). A
banker who picks a $6M two-facility package reads a sentence about a $46MM six-facility package
underneath it.

**Founder calls, not engineering calls.**

1. Whether the multi-package room should wake its composer during the route question. Today it
   sleeps by documented intent (`Workroom.tsx` ritual comment: "A room still waiting for a package
   to be chosen has nothing to take an instruction about"). Waking it opens a typed lane into a
   zero-member engine, and the only refusal copy that exists (`NO_PACKAGE_REFUSAL`, inside the
   byte-untouchable fence) says "this relationship stages none", which is false for a relationship
   that stages three.
2. Whether the package question should come BEFORE the route question. It cannot simply be
   reordered: package eligibility is computed against the route
   (`modifyEngine.ts:152-171` and `renewEngine.ts:136` mark a package ineligible with no booked
   member, while `createEngine.ts:106` carries the explicit comment that for a new facility none of
   them is ineligible). Asking package first on Bright would show nine of ten cards disabled to a
   banker who may be heading for a new facility, where all ten are open. It also inverts
   `design/ENTRY-CHOREOGRAPHY-INTENT-20260901.md`, which says the question stands alone first and
   the package identity blends in after.
3. Whether the 100 multi-package accounts are a target scenario or a seed defect (section 4).

**Doctrine gaps that should close in a design doc, not in source.** The auto-anchor rule is written
down in exactly one place in the entire repo: a code comment in `openWorkroom.ts`, which is inside
the engine fence. `brain/WORKROOM-BRAIN.md` (1637 lines) never discusses a relationship carrying
more than one package; its opening frame states the banker is "looking at one borrower's product
package" as a given. `knowledge/VISION-THE-ROOM-IS-A-SESSION.md`, dated the same day as the
founder's question, opens on "Open Hartwell" with the deal pre-known.
`design/SAMPLE-CHANNEL-SPEC-20260901.md` and `design/ENTRY-CHOREOGRAPHY-INTENT-20260901.md` contain
zero mentions of package choice. Nobody reading the doctrine would learn that "exactly one package
exists" is silently treated as "the banker chose it", ahead of the routing question.

**Separate, smaller, and booth-visible.** The snapshot-versus-facility split (section 5, adjacent).
A credit officer clicking through to nCino on the Hartwell demo path meets a disabled chip today.
That is a smaller ticket than the greeting work and should be raised alongside it.
