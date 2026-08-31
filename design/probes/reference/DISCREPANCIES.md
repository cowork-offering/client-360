# §3 prose vs the frozen dummy — measured discrepancies

Recorded 2026-08-31 from `design/dummy/index.html` at 1360×900, Chromium 147.

**The dummy is ground truth over the prose** (HANDOVER §1). Every item below is a
place where `HANDOVER.md` §3 states a number or mechanism the dummy does not
actually produce. The probes report the DUMMY's value, and `dummy-baseline.json`
locks the dummy's value. None of these were "corrected" in the probe.

A founder call is needed on each: either the prose is amended, or the mint is
amended and the baseline re-locked.

---

## 1. cmdk backdrop dim is `.14`, not `.10`

- §3: "backdrop dim only rgba(16,4,30,**.10**)"
- Measured: `cmdk.lens.backdropDimColor = "rgba(16, 4, 30, 0.14)"`
- Cause: two `.cmdk-wrap` rules exist. The one setting `.10` is at CSS line 164;
  a later rule at line 865 sets `background:rgba(16,4,30,.14)` on the same
  selector, so the `.10` declaration is dead.

## 2. The topbar drop shadow does not transition

- §3: "`body.scrolled` (scrollY>8) adds drop shadow, **.4s both ways**"
- Measured: `header.scrollShadow.topbarBoxShadowTransitionMs = null`;
  `topbarTransitionProperties = ["filter","transform","opacity"]`
- The threshold itself is correct (`bodyScrolledAt8 = false`, `bodyScrolledAt40 = true`)
  and the outer shadow does appear (`topbarShadowAppearsOnScroll = true`) — but it
  snaps. `.topbar{transition:box-shadow .4s}` (line 60) is overridden by the later
  lens rule `.topbar,.view.show,.fabwrap{transition:filter .45s, transform .5s, opacity .3s}`
  (line 161), which replaces the whole shorthand and drops `box-shadow`.

## 3. The violet write-back wash never plays

- §3: "violet wash (**1.7s**, once) on the changed anchor when the room closes"
- Measured: `workroom.closeAndWash.washApplied = true` (the `washed` class IS added
  and removed after 1.9s) but `washAnimationName = "ancup"`,
  `washAnimationIsWashKeyframe = false`, `washDurationMs = 450`.
- Cause: specificity. `.anchor.washed{animation:ancwash 1.7s}` is `(0,2,0)`;
  `.view.show .anchor{animation:ancup .45s}` is `(0,3,0)` and wins, so the
  already-finished entry animation stays and `ancwash` never runs.
- A port that renders the wash correctly will FAIL these three probes. That is the
  right outcome: it means the port is not the dummy, and the founder decides which
  one moves.

## 4. Arc radius / neighbour spacing are sub-pixel under the stated figures

- §3: "5 satellites, radius **118px**, neighbour center distance **46px**"
- Measured: `arcRadiiPx = [118, 117.92, 117.38, 117.92, 118]` (mean 117.84);
  `arcNeighbourSpacingPx = [45.89, 46.04, 46.04, 45.89]` (mean 45.97)
- The diagonal satellite is placed at `--tx:-83px --ty:-83px`, i.e. r = 117.38.
  All within the 1px gate; noted so nobody "fixes" 117.84 into 118.

## 5. Nav capsule height is 40.75px, not 41px

- §3: "capsule height **41px** inside the **52px** bar"
- Measured: `capsuleHeightPx = 40.75`, `barHeightPx = 52`. Within the 1px gate.

## 6. The nav capsule is hidden by opacity, not `display:none`

- §3: "hidden on landing (`display:none` equivalent)"
- Measured: `header.landing.navDisplay = "block"`, `navOpacityOnLandingPct = 0`,
  `navPointerEvents = "none"`.
- The mechanism matters (the capsule has to transition in from `scale(.94)`), so
  the probe asserts the mechanism. A port using real `display:none` will FAIL
  `navDisplay` — deliberately.

## 7. The first suggestion chip files nothing

- Not stated in §3, but load-bearing for anyone porting the compose loop.
- `.wk-chipbtn[data-say="Increase the revolver to $20.0M, keep pricing"]` hits
  `parseLine`'s pricing branch (the word "pricing"), finds no bps figure, and
  returns `{kind:"clarify"}` — an explainer message, no delta card, nothing on the
  manifest. Measured: `workroom.ritual.suggestChipProducesDeltaCard = false`.
- The commitment path only fires on a line without the word "pricing". The probe
  therefore types `"Increase the revolver to $19M"` into the compose input, which
  reproduces §3's worked example exactly: $15.0M → $19.0M, $46.2M → $50.2M,
  **6 rolling digit columns**.

## 8. The blur scale has two values the prose omits

- §3: "micro-chips 28 / satellites 28–30 / workroom 30 / bars 36 / floating panels 38"
- Measured set: `[20, 28, 30, 34, 36, 38]`
  - `20` — `.wk-hist` ("earlier steps")
  - `34` — `.chatmini`, `.toast`, `.whisper`
- The census itself is clean: 15 backdrop-filter surfaces, 14 with 3 rims,
  `.arclbl` with 1, **0 violations** in all four page states, and zero white
  borders on glass (only `rgba(0,0,0,.05)` / `rgba(0,0,0,.06)` hairlines).

---

## Everything else in §3 reproduced exactly

Capsule centre delta 0px · bar 52px · tab animation-delays .14→.32s (7 tabs) ·
clicked-tab `transitionDelay` 0s · active wash settling on rgba(161,0,255,.06) ·
FAB right 44 / bottom 52 · 7s `fabidle` halo, `0 0 14px 2px rgba(161,0,255,.13)` ·
5 satellites · mark 180° · narrator chip 0px delta, "Client actions" at rest, all
labels inside 1360w · whisper once at 3.2s with `fabreathe` 3.2s × 2 · name flight
14.5→25px over 520ms `cubic-bezier(.22,1,.36,1)`, landing offset 0/0, entry
animation suppressed (`animationName: none`), no opacity dip · workroom seed 340px
with `backdrop-filter: none` · pane switch 3px settle over 340ms (never 8px) ·
grade ring 119.4 → 41.8 / 74.6 / 14.9 on all three clients over 1000ms · anchors
45ms cascade · meter `meterfill` 900ms +150ms delay · empty watermark `wmbreathe`
8s .04→.08 · thread gap 38 / step gap 32 / identity chip −21px · 26ms word stagger ·
odometer .6s `cubic-bezier(.65,0,.35,1)`, 45ms column stagger, 6 columns ·
halo `aurarot` 9s, box transform static, `--aang` advancing, opacity .38, blur 14 ·
write-back moves all three figures while the room is open and survives navigation ·
chat: FAB opacity 0 / scale .6, panel and pill both at right 44 / bottom 52,
"Assist", FAB returns on close · lens blur 14 saturate .92 scale .988 on topbar and
view, FAB blur 10, Escape restores · live filter + "Nothing matches." · arrows
traverse visible rows, Enter fires · 12 weave nodes, all 12 drifting, rows clickable
through · glass census 0 violations.

---

## Surface 5 — the workroom ritual (2026-08-31)

Twenty `workroom.*` leaves differ from the frozen dummy after the mint. Every
one is accounted for below; none is a fidelity miss. Run: `node probe.mjs
--target port --serve <built cockpit> --stub-connector --runs 3`.

**Written intent, not the dummy's render (INTENT-OVERRIDES.md #1).** These three
are expected to differ, in exactly this way — the dummy's wash is dead CSS that
loses the cascade to `.view.show .anchor`:

| leaf | dummy | port |
|---|---|---|
| `closeAndWash.washAnimationName` | `ancup` | `ancwash` |
| `closeAndWash.washAnimationIsWashKeyframe` | false | **true** |
| `closeAndWash.washDurationMs` | 450 | **1700** |

**The book is the app's book.** The port serves the injected C360 bundle, so
Hartwell has six members and $46.0MM committed where the dummy authors three and
$46.2M; `fmtMoney` also strips a trailing `.00`, and the port's `#ancExpV` holds
the figure while its unit lives in the sibling `.u` span:
`ritual.facilityCount` (3 → 6), `ritual.preExposureAnchorText`,
`ritual.preExposureTotalText`, `ritual.deltaCardText` (WARN),
`execute.postExposureAnchorText`, `execute.postExposureTotalText`,
`closeAndWash.valueBefore/AfterNavigation`.

**React unmounts what the dummy hides.** The dummy keeps every `.view` in the
DOM and toggles `.show`, so `#wlHartAmt` is measurable from the client view. The
port's landing is unmounted while a client is open, so the worklist amount is
not a figure that can be watched rolling — it is correct on return, which
`closeAndWash.executedValueSurvivesNavigation` (**true**) proves:
`ritual.preWorklistAmountText` (null), `execute.postWorklistAmountText` (null),
`execute.writeBackChangedAllThree` (false), `numerals.rollingFigureCount` (3 →
2), `execute.writeBackOdoColumnCount` (6 → 4, two mounted figures rather than
three). The odometer RECIPE matches exactly: 600ms,
`cubic-bezier(0.65, 0, 0.35, 1)`, 45ms column stagger, 1.3px mid-roll blur.

**The engine's own state.** The dummy's suggestion chips are authored markup; the
port's single pill is whatever `engine.suggest()` returns, and after a member
pick this engine returns none: `ritual.suggestChipFound` (false),
`suggestChipVisibleAfterFacilitySelect`, `suggestChipProducesDeltaCard`.

**One exchange, not two.** `ritual.stepCount` (2 → 1). The dummy's briefing is a
second step because its package pick is a click; a single-package book has
nothing to click, so the greeting, the lookup and the brief are ONE exchange —
which is rule 31 as written (a step per SEND).

**Sampling window.** `execute.haloBoxSizeStablePx` (3.53 → 58.8). The halo is
`inset: -4px` on a card that is still CONSTRUCTING through the probe's 900ms
sample, so the box grows with the rows. It does not ROTATE, which is what trap 3
gates: `haloBoxTransformIsStatic` **true**, `haloBoxRotationDeg` **0**,
`haloAngleAnimates` **true** advancing 36deg/900ms on a 9s linear cycle.

### The stand-in connector

`lib/stub-connector.js`, behind `--stub-connector`, and off by default. The room
refuses to invent a plan — with no connector it says so in a glass notice and
burns no token, which is the channel-none doctrine and is asserted in the unit
suite. But the execute-side choreography only exists on the far side of a
successful write, and it is four acceptance numbers. The stub lives OUTSIDE the
app and never ships; the artifact's own build fails closed on simulation
markers.

### Probe changes, and why the dummy baseline did not move

`probes/workroom.mjs` gained three steps, each a NO-OP on the frozen dummy:
select the exposure pane before summoning the room (the dummy's exposure tab is
already active); settle any card the suggestion chip left open before typing (the
dummy's chip routes to `clarify` and leaves nothing open — `suggestChipProducesDeltaCard`
is `false` in the locked baseline); and settle the candidates a confirm leaves
behind (the dummy's delta card is single and trips no check). `lib/inject.js`
gained `P.type()`, which drives an input through the prototype's own value setter
— identical to the assignment it replaces on a vanilla input, and the only way a
CONTROLLED React input sees the line at all. Re-running the dummy after these
edits reproduces `reference/dummy-baseline.json` apart from two timing-jitter
leaves (`haloBoxSizeStablePx`, `haloAngleAdvancedDeg`).
