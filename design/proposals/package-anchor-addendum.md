# Proposed addendum: the package anchor

**Status: PROPOSAL, not contract.** Answers the founder's question of 2026-09-02 ("by that time we
have not even selected a Product Package, why does it know that we are talking about this
package?"). Evidence and citations: `knowledge/PACKAGE-ANCHOR-FINDINGS-20260902.md`. The rule text
in section 9 is the wording proposed for the mint AFTER the founder confirms the built behaviour on
screen.

Date: 2026-09-02 · Room: Facility Actions (`Workroom.tsx`) plus the channel it speaks through.

**Sequencing.** This builds AFTER `.claude/worktrees/wire-arms` merges. That branch edits
`app/src/components/workroom` and `app/src/channel`, which is exactly where this lands. Do not
start until it is on main.

**Fence.** `app/src/workroom/` is BYTE-UNTOUCHABLE and nothing here touches it. The auto-anchor in
`openWorkroom.ts` stays exactly as written, the three engines stay exactly as written, and every
deterministic sentence quoted below is engine output that this change does not author. What changes
is the SHELL (what the room draws and what it puts in the envelope) and the CHANNEL (which calls go
out and what doctrine travels with them). SHA-attest the fence before and after.

---

## 1. The principle

**The room may state an anchor it derived. It may not SPEAK from an anchor the banker has not seen.**

One package is not a choice, so the room anchors on it and says why. Several packages is a choice,
so the room speaks at relationship altitude, labels every figure as the relationship's, and waits.
And a sentence composed at one altitude is never replayed at another.

---

## 2. The behaviour, in three rooms

### A. Anchored by the book (one package, the whole shipped demo set)

Unchanged in every beat. The room auto-anchors on the first render, the composer is awake from
open, the envelope is package scoped. Two additions: the room now SAYS it anchored (the chip, 5.1;
the stance line in the envelope, 4.2), and the model is told it may say so.

Calls: **1** (the consent moment). Binding any route, including renew or create, spends **0** more:
the remount hits the same altitude key and the held promise comes back. That is correct, because a
route bind changes the engine, not the book.

### B. Unanchored (several packages, nothing chosen)

The room opens on the route question exactly as today. The composer stays ASLEEP, as today, and now
says so honestly. The envelope carries no package name, no package figure and no package id; it
carries the count, the choices and a scope word on every read. After the route chip the cards land,
legibly (5.2).

Calls: **1**.

### C. Anchored by the banker (the card click)

The room remounts and replays the ritual, as today. The altitude key has changed, so the greeting
slot is composed AGAIN, for real, against the anchored envelope, as act `anchored`. It streams.

Calls: **2** total for the view, and the second one is the only one that is true.

**Ceiling: one call per (relationship, package) the banker actually stands in.** Bounded by
gestures, never by renders, remounts or route binds.

---

## 3. Exact copy

Two different things wear the word "greeting" and the build must not confuse them.

- **The deterministic sentence** is composed by the engines inside the fence and printed by the
  room. It is quoted below unchanged and is NOT authored by this change.
- **The remark** is the model's one sentence underneath it. This change does not write that
  sentence either; it decides what the model is allowed to know. The exemplars below are the target
  shape, to be checked on the glass, not strings to hardcode.
- **The chip** is shell copy this change does author, verbatim.

### 3.1 One package

Deterministic, unchanged: `Hey Fabian. What are we doing with this relationship, modifying,
renewing, or structuring something new?`

Chip, verbatim: `Hartwell Industrial C&I Credit Package · the relationship's only package`

Remark, target shape: names the package, says in one clause that the relationship stages exactly
one so the room is standing in it, then the deal. For example: "The book stages one package here,
so the room anchored on it rather than asking: six facilities, $46M committed against $31.03M
drawn, and Accounts Receivable tests in six days."

### 3.2 Several packages, nothing chosen

Deterministic, unchanged: the same route question. Then, after the route chip, the engine's own
choosing sentence: `3 packages on this relationship. Pick the one to work in: a modification is
anchored on one package, and one package is one plan under one approval.`

Chip, verbatim: `3 packages on this relationship · none chosen yet`

Card block heading, verbatim, two lines:
`Which package does this run in?` / `One package is one plan under one approval.`

Remark, target shape: relationship altitude only. No package named, no package total quoted, no
"this package". Every figure attributed to the relationship. May say what separates the choices;
may not pick one. For example: "Three packages sit on this relationship and none is chosen yet, so
every figure below covers the whole book: $46M committed across nine facilities. Two of the three
carry a booked facility, so a modification can only run in those two."

### 3.3 After the banker anchors

Deterministic, unchanged: the anchored engine's own position sentence, for example `Hey Fabian.
All 2 members are booked: the whole $6M is open. Pick one.`

Chip, verbatim: `Hartwell Two-Package Test credit package · Non-Real Estate · you chose this package`

Remark, target shape: opens on the narrowing, so the banker can see the earlier figures were
superseded rather than contradicted. For example: "Now working in the Non-Real Estate package: two
facilities, $6M committed, both booked. The figures a moment ago covered both packages on the
relationship, so read that headroom against this one."

### 3.4 No package at all

Chip, verbatim: `no product package on this relationship yet`. Otherwise unchanged; this is the
create door and it is already honest.

---

## 4. The envelope

`BrainEnvelope` is declared in `app/src/channel/brainLane.ts`. `buildEnvelope` lives in
`app/src/components/workroom/brainRoute.ts:100`, **not** in `brainLane.ts`. Both files change.

### 4.1 New and changed fields

| Field | Type | Meaning |
|---|---|---|
| `packageName` | `string \| null` | **Was `string`.** Null while unanchored. A count is not a name and must never travel in the field that holds one. |
| `anchor` | `"only" \| "chosen" \| "named" \| null` | How the room got its package. Null means none is chosen yet. |
| `packageCount` | `number` | How many the relationship stages. Survives anchoring, which `packageChoices` does not. |
| `packageChoices` | `Array<{ label; figure; eligible }>` optional | Present only while unanchored. **No ids travel.** The model may say what separates them; the ROOM anchors. |
| `packageStance` | `string` optional | One banker-language sentence saying how the anchor was got. Omitted while unanchored. |
| `reads.scope` | `string` required | What the figures cover. |

`packageStance` copy, verbatim:
- `only`: "The relationship stages one product package, so the room is anchored on it. The banker was not asked."
- `chosen`: "The banker chose this package from N on the relationship."
- `named`: "The room was opened on this package."

`reads.scope` copy, verbatim:
- anchored: "the anchored product package"
- unanchored: "the whole relationship, across all N product packages"

None of the new fields joins `ENVELOPE_BLOCK_DROP_ORDER`. They are a few hundred bytes and they are
what makes everything else legible. `capEnvelope` must never drop them.

### 4.2 Unanchored versus anchored, side by side

| | Unanchored (today) | Unanchored (after) | Anchored (after) |
|---|---|---|---|
| `packageName` | `"Bright Logistics · 10 packages"` | `null` | the package's own label |
| `productPackageId` | `null` | `null` | the id |
| `anchor` | absent | `null` | `"only"` / `"chosen"` / `"named"` |
| `packageCount` | absent | `10` | `10` (or `1`) |
| `packageChoices` | absent | 10 entries, no ids | absent |
| `packageStance` | absent | absent | the sentence above |
| `facilities` | `[]` | `[]` | the package's members |
| `reads.exposure` | whole relationship, unlabelled | whole relationship, `scope` says so | the package alone, `scope` says so |

The read FILTER does not change. Relationship-wide reads are the right read for an unanchored room.
What was missing is the label on them.

---

## 5. The glass

### 5.1 The anchor chip

In the opening bubble's foot, beside `wk-askpin`, on the glass from the first frame in every case
including the single-package room. It is a button. Clicking it opens an inline peek listing every
row from `packageRecords(bundle)` (label, committed figure, member count), with the anchored one
marked. Copy per state is in section 3, verbatim.

This is the cheapest deterministic answer to the founder's literal question, and unlike the remark
it does not depend on the model saying the right sentence.

### 5.2 The package cards

`Workroom.tsx:3423-3439`. Four changes, all copy and ordering, no behaviour:

1. **The figure ALWAYS prints.** Today the body is `{choice.eligible ? choice.figure : choice.reason}`,
   so an ineligible card LOSES its figure. Print `choice.figure` always, and `choice.reason` on a
   second line beneath it when the card is ineligible. Both fields are already on `PackageChoice`
   (`engine.ts:62-71`). Without this, five of Bright's ten cards read "All members are at
   Qualification, and a credit action only runs against a booked one." and nothing else.
2. **Eligible first**, then committed descending.
3. **Past four cards, fold the ineligible ones** behind one disclosure reading
   `6 more are not open to this action`. Ten cards scroll the greeting and the framing question off
   the top of the thread.
4. **Print the framing heading INSIDE the card block** (section 3.2, two lines). The engine's
   choosing sentence is the question tier and the cards are the identity tier, so a tier arriving
   fades the sentence that framed it. The heading is static shell copy, so it does not duplicate the
   engine sentence while both are on stage, and it survives the fade.

Wrap the group in `role="radiogroup"` labelled by the heading.

### 5.3 The composer

**Stays asleep behind a pending choice.** Do not change `Workroom.tsx:832` this week. See section 8.

Change the placeholder only. `Workroom.tsx:3074-3082`: while a package choice is pending, read
`Pick the package this runs in.` instead of `Reading the package…`. The room has finished reading.
It is waiting on the banker, and it should say so. Disabled state unchanged.

---

## 6. The channel: how one memoised consent and one anchored remark coexist

This is the load-bearing mechanism. Consent still rides the greeting, per
`design/SAMPLE-CHANNEL-SPEC-20260901.md`: the platform dialog lands on the first session call of a
view, and that call must be the one the banker asked for by opening the room.

### 6.1 Key the memo per altitude

`app/src/channel/sampleDoor.ts`. Replace the single module-level `priming` promise with a
`Map<string, Promise<string | null>>`, and give `primeConsent` a third argument: the altitude key.

- Key shape: `` `${accountId}:${productPackageId ?? "relationship"}` ``.
- The FIRST key taken in a view is the consent moment. It keeps `kind: "greeting"`, `tier: "quick"`,
  `cache: true` exactly as today, and it raises the dialog.
- Every LATER key is an ordinary `askSession` call with its own options, so its `onText` fires and
  its text STREAMS. It carries `kind: options.kind ?? "greeting"`, `tier: "quick"`, `cache: true`.
  The identical preamble and doctrine mean it gets a prefix cache hit.
- A REPEAT of a key already in the map returns the held promise and spends nothing. That is what
  keeps route binds free.
- `consentPrimed()` reads map size. `resetSessionDoor()` clears the map.

This single change is the whole of the stale-remark fix. It also fixes the cross-relationship case
(open Bright, anchor, close, open Hartwell) that a per-mount or per-session latch cannot.

### 6.2 Call ledger

| Gesture | Altitude key | Call | kind | tier | cache | streams |
|---|---|---|---|---|---|---|
| Open a one-package room | `acct:pkg` | 1 (consent) | `greeting` | quick | true | no |
| Open a multi-package room | `acct:relationship` | 1 (consent) | `greeting` | quick | true | no |
| Bind any route | unchanged | 0 | | | | |
| Click a package card | `acct:pkg` | 1 | `anchor` | quick | true | yes |
| Re-open the same package | `acct:pkg` | 0 | | | | |

`CallKind` in `app/src/channel/sampleMetrics.ts:18` gains `"anchor"`. The greeting band stays the
band that carries the consent dialog, so the founder's latency gate keeps reading the number it was
built to read instead of pooling two calls of different character.

### 6.3 Wiring

- `Narration.tsx`: `open(id, subject, key)` takes the altitude key and forwards it to `prime`. Set
  `kind` to `"greeting"` when `!consentPrimed()`, `"anchor"` after. The `enabled` gate, the
  `sampleAvailable()` gate and the per-id `asked` latch are all untouched.
- `WorkroomHost.tsx`: beside the context memo, derive `packageCount = packageRecords(bundle).length`
  and `anchor` (`"chosen"` when `session.productPackageId` is set, `"named"` when a caller passed
  one, `"only"` when `context.productPackageId` is set and `packageCount === 1`, else `null`). Pass
  both to `<Workroom>`, and add `scope` to the `reads` memo. The React key at `:187` is unchanged;
  extend its comment to say the remount replays the ritual but no longer replays a stale sentence.
- `Workroom.tsx:1331-1335`, the greeting effect: guards do NOT change. It still fires on `lookedUp`
  alone, because that is the consent moment. It gains the altitude key, and act `"anchored"` when
  `anchor === "chosen"`, `"greeting"` otherwise.
- `Workroom.tsx` `envelopeFor`: pass `anchor`, `packageCount`, `packageStance`, and while unanchored
  `brief.packageChoices` mapped to label, figure and eligible only. Never the `reason` sentence,
  which is already printed on the card.

---

## 7. The rest of the shell

- **`readBlocks.ts`**: `buildReadBlocks` stamps `scope` (section 4.1), derived from
  `src.productPackageId` and `packageRecords(src.bundle)`. `exposureBlock` carries its own `scope`
  too: it is the one roll-up block with no scope word anywhere, and it is where "$46MM across six
  facilities" came from. This one line also repairs the relationship room's envelope for free, since
  `RelationshipRoom` feeds the same builder with a snapshot-only id that is null across the whole
  shipped book.
- **`readCard.ts:117`**: keep an involvement row whose `loanId` is not among the scoped facilities,
  labelled "across the relationship", exactly as `readBlocks.ts:90-97` already does. Verified: on
  Hartwell, the demo account, that is one Borrower row on `a4Zbb000002CECXEA4`, so the glass and the
  envelope disagree by one row on the booth path today.
- **`route.ts` `smartOpeningFor`**: return `null` when `args.productPackageId` is null and
  `packageRecords(bundle).length > 1`. On Bright the room opened on "The package is drawn to 90% of
  commitment", which is one facility on one of ten packages while the relationship is drawn to 8.9%.
  A signal ranked across every package is not a signal. Null is already the documented common case
  and means the neutral question. One production caller (`ChatFab.tsx:554`), so the rule lives here
  and the palette gets it too without a second copy of the anchor logic.
- **`narrate.ts`**: `NarrateAct` gains `"anchored"`, with `ACT_LINE` "The banker has just CHOSEN
  which product package this action runs in, and the room rebuilt on it." Add one altitude paragraph
  read off the envelope, so the bytes are spent only where needed: unanchored, "NO PACKAGE IS CHOSEN
  YET. Every figure in CONTEXT.reads covers the whole relationship. Do not name a package, do not
  quote a package total, do not call the book this package, and do not choose for the banker."
  Anchored, "ONE PACKAGE IS ANCHORED and every figure in CONTEXT.reads is that package's alone.
  CONTEXT.packageStance says how the room came to be standing in it."
- **`doctrine.ts:67`**, IDENTITY, always-on: strike "looking at one borrower's product package",
  which is asserted as fact on every call in both modes and is false for the entire unanchored path.
  Replace with "standing in a deal on one borrower's book, either anchored on one product package or
  still asking which one."
- **`doctrine.ts`**, new always-on `anchor` block, admitted in **both** modes (narrate and reply),
  placed after IDENTITY. Lines: the governance rule (one action, one package, one plan, one
  approval); what each `CONTEXT.anchor` value means; that a null anchor forbids naming a package,
  quoting a package total or writing as though a deal were selected; and that `CONTEXT.packageChoices`
  may be described but never chosen from. The one existing line that names `productPackageId` is
  `modes: ["reply"]` (`doctrine.ts:91-100`) and never reaches a greeting, which is why this block
  has to be its own.

---

## 8. Explicitly NOT in this build

Both are founder calls, both overrule something already written down, and neither is needed to stop
the room lying.

1. **Waking the composer during the route question on a multi-package relationship.** It is the
   right end state and the multi-package room is a dead end without it. But it routes a typed
   instruction into a zero-member engine, and the only refusal copy that exists
   (`NO_PACKAGE_REFUSAL`) says "this relationship stages none", which is false for a relationship
   that stages three, and that string is inside the byte-untouchable fence. Ship the room honest and
   asleep; wake it once the refusal is written and the fence exception is founder-gated.
2. **Asking which package BEFORE asking the route.** It cannot simply be reordered: eligibility is
   route dependent (`modifyEngine.ts:152-171` and `renewEngine.ts:136` refuse a package with no
   booked member, while `createEngine.ts:106` states none is ineligible for a new facility), so on
   Bright it would show nine of ten cards disabled to a banker who may be heading for a new facility
   where all ten are open. It also inverts `design/ENTRY-CHOREOGRAPHY-INTENT-20260901.md`.

Also out of scope, and worth its own smaller ticket: the snapshot-versus-facility split
(`DeepLink.tsx:95`, `ActionPanel.tsx:697`, `schemas.ts:448`, `reviewFlows.ts:83`). It is booth
visible today, because the OpenInNcino chip renders disabled on the Hartwell demo path.

---

## 9. Proposed rule text (for the mint, on founder confirm)

> **Rule 69, the package anchor.** A credit action runs against one product package, and that anchor
> is the governance boundary. Where the relationship stages exactly one, the room anchors on it
> without asking, states on the glass that it did, and tells the model it may say so. Where it
> stages several and none is chosen, the room speaks at relationship altitude: no package name, no
> package figure and no package id travels, every read carries the scope it was taken at, and the
> choices travel without their ids. A sentence composed at one altitude is never replayed at
> another: the room's opening remark is memoised per relationship and package, so choosing a package
> composes a new one and binding a route composes none.

---

## 10. Tests to add

All in existing suites. Nothing under `app/src/workroom/`.

1. `app/src/channel/sampleDoor.test.ts`: the existing "exactly one call however many times it is
   primed" case SPLITS. Same key however many times is still one call and still discards the new
   prompt (consent is still idempotent per view). A SECOND key is a second call that carries its own
   prompt and streams its own text. `cache: true` and `modelTier: "quick"` hold on both. This is the
   assertion that currently locks in the bug at `:178-184`.
2. `app/src/components/workroom/brainRoute.test.ts`: an unanchored envelope carries `packageName`
   null, `anchor` null, a populated `packageCount`, populated `packageChoices` with no ids, and an
   empty `facilities`. An anchored one carries the label, the id, the members and a `packageStance`.
3. `app/src/components/workroom/readBlocks.test.ts`: an unanchored source labels `reads.scope` as
   the relationship and names the count; an anchored one names the package. `exposure` carries its
   own scope in both.
4. `app/src/components/workroom/readCard.test.ts`: the structure card keeps an out-of-scope
   involvement row labelled "across the relationship", and returns the same row count as
   `involvementBlock` on the Hartwell book (22).
5. `app/src/components/workroom/route.test.ts`: `smartOpeningFor` returns null on a bundle whose
   facilities carry two distinct package ids and no id is passed; unchanged on a one-package bundle.
6. `capEnvelope`: `anchor`, `packageCount`, `packageChoices`, `packageStance` and `reads.scope`
   survive a cap that drops read blocks.
7. Call-count assertion over a driven view: exactly one greeting call on a one-package room through
   a route bind, and exactly two on a multi-package room through route bind plus card click.

## 11. Probe and census

Extend the probe suite with the two states that have never been rendered against real data: the
unanchored open and the post-anchor remount. `glassRimViolationCount = 0` through both, reduced
motion respected, and the chip reachable by keyboard in every state. Note for the founder: the
shipped book (`artifact/live-data.json`) is five single-package borrowers, so the multi-package
states can only be probed against a fixture or a live org account. That is also why the open
question in `knowledge/PACKAGE-ANCHOR-FINDINGS-20260902.md` section 4 should be settled before this
beat gets any more investment than section 5 specifies.
