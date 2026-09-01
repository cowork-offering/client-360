# Intent overrides (founder call, Fabian 2026-08-31, AskUserQuestion)

Three places where the frozen dummy's rendered behavior breaks its own locked rules
(dead/overridden CSS). The PORT implements the WRITTEN INTENT; compare.mjs runs against
the dummy baseline, so these three leaves are expected to DIFFER, in exactly this way:

1. Write-back wash (rule 62): dummy renders washAnimationName "ancup" (the wash never
   plays, loses specificity to .view.show .anchor). PORT: the violet wash PLAYS,
   rgba(161,0,255,.09) bg + .2 hairline, 1.7s settle, once per changed anchor on room close.
2. Header scroll shadow (rule 70.5): dummy snaps (transition overridden by the lens rule).
   PORT: box-shadow eases .4s both ways. Leaf topbarBoxShadowTransitionMs: 400, not null.
3. cmdk backdrop dim (rule 63): dummy renders rgba(16,4,30,.14) via a later rule; the .10
   rule is dead. PORT: .10 as written.

Everything else: the dummy wins, byte for byte.

## Consolidated-sweep probe artifacts (2026-08-31, orchestrator-verified, not regressions)

Direct Playwright measurement on the merged 4-surface build confirmed the UI matches baseline
where the suite reports null/FAIL for module-logic reasons:
- `cmdk.lens.lensFabBlurPx: null` - the module reads the blur on #fabwrap; the port applies it
  on #fab (measured: blur(10px) while lensed). Fix the module to read sel.fab, or accept.
- `client.perClient.*.meterFill*: null` - module tab-navigation assumes the dummy's tab order;
  direct click on data-pane="exposure" shows meterfill 150ms/900ms exactly per baseline.
- `glass.*.glassSurfaceCount` low vs dummy: React mounts chrome lazily (dummy holds all views
  in DOM). The gating number is glassRimViolationCount = 0, which passes in every state.

## Post-mint founder directives (2026-08-31 night, Fabian, verbatim decisions)

The unified workroom router. Renewal, modification and new facility fold into ONE room whose
first question routes, and the arc's Modification + Renewal satellites collapse into one
"Facility Actions" satellite. The mint baseline still carries the five-satellite arc, so these
leaves are expected to DIFFER from it. Measured on the assembled live-data build against a probe
run of the mint itself (1bc2256), 3 runs each, `--target port --stub-connector`:
- `fab.arc.arcSatelliteCount: 5 -> 4` - Modification and Renewal are the same room now, so they
  are one satellite. Founder-directed, not a regression.
- `fab.arc.arcRadiiPx: [118,117.92,117.38,117.92,118] -> [118,117.92,117.38,117.92]` and
  `arcNeighbourSpacingPx: [45.89,46.04,46.04,45.89] -> [45.89,46.04,46.04]` - the four kept
  offsets are byte-identical to the dummy's first four. The 46px rhythm is the recipe (22.5deg
  steps on r=118), so dropping a satellite drops the LAST POSITION rather than re-spreading four
  across the same 90deg, which would open the gaps to 61px. `arcRadiusPx` reads 117.81 (was
  117.84) and `arcNeighbourSpacingMeanPx` 45.99 (was 45.97), both inside tolerance and both OK.
- `fab.arc.narratorHoverLabels: [...,"Modification","Renewal",...] -> [...,"Facility Actions",...]`
  (SOFT/WARN) - the satellite's own word, two words so the centred chip still fits at 1360w.
- `sel.arcModify` in targets.port.json now resolves to `#actFacility`. The KEY is the probe's
  contract and only the value moved; `workroom.openRoom` still enters through it.
- `glass.{client,cmdk,workroom}.glassSurfaceCount: -1 in every state` - one fewer `.arcbtn`
  glass satellite, nothing else. The gating number `glassRimViolationCount` is 0 in all four
  states, and `glass.hairlines.glassWhiteBorderCount` is 0.
- `workroom.ritual.agentWordSpanCount: 14 -> 16` (SOFT/WARN) - the routing question rides the
  greeting slot (rule 30), so the first agent bubble is two words longer. The opening view is
  still under sixty words; asserted in workroom.render.test.tsx for both openings.
- `workroom.execute.haloBoxSizeStablePx: 8.91 -> 58.8 / 23.11` - NOT deterministic and not a
  regression: two 3-run passes of the same build gave 58.8 and 23.11. The leaf measures the
  aura's box delta 900ms apart while the dossier is still constructing (rule 69), so it samples
  a moving card; the halo's real contract holds identically (`haloBoxTransformIsStatic` true,
  `haloAngleAnimates` true, `resultCardSegmentCount` 5, `resultCardLit` true, trap3 PASS).
- Everything else reproduces the mint: 336 OK of 348 compared leaves, traps 1-4 and glassCensus
  PASS. The workroom flow's typed line (`"Increase the Line of Credit to $19M"`) binds `modify`
  implicitly and the whole ritual behind the question is unchanged.

### The arc comes closer to the mark (founder, 2026-09-01, live run)

Founder verdict on the four-satellite arc, driving the built app: **"closer to the mark"**. The four
kept the five-arc's first offsets on r=118, which put the last satellite two thirds of the way round
a sweep nothing finished - distant from the mark and lopsided in the corner. The radius comes back to
**rule 49's own original 96px** and the four RESPREAD evenly over the full quarter at 30° steps off
vertical: chat at the top, covenant review at the horizontal, the two credit actions between them.
The arc is symmetric about its own 45° axis, which the four-off-a-five never was.

Offsets, and they are the geometry rounded to the pixel the transform paints at:
`(0,-96) (-48,-83) (-83,-48) (-96,0)`. Measured in the browser at 1360x900, they land exactly.

Four leaves therefore DIFFER from the mint baseline, all four founder-directed:
- `fab.arc.arcRadiiPx: [118,117.92,117.38,117.92] -> [96,95.88,95.88,96]`
- `fab.arc.arcRadiusPx: 117.81 -> 95.94`
- `fab.arc.arcNeighbourSpacingPx: [45.89,46.04,46.04] -> [49.73,49.5,49.73]`
- `fab.arc.arcNeighbourSpacingMeanPx: 45.99 -> 49.65`

The neighbour rhythm moves from 46px to 49.7px, and that is the point rather than a side effect:
2·96·sin(15°) is what an EVEN spread of four across the quarter measures. The alternative that held
46px exactly (four at 28° steps on r=96) stops short of the horizontal and reproduces the lopsidedness
the founder objected to. The ~46px feel is preserved; the arithmetic that produced it is not.

`arcRadiiPx` and `arcNeighbourSpacingPx` were ALREADY failing against the mint baseline (the dummy
carries five satellites, the port four - the unify-router divergence above). The two leaves that are
NEW against the baseline are `arcRadiusPx` and `arcNeighbourSpacingMeanPx`.

**Measured, tweaks-round1 vs main @ c8f954d, 3 runs each, `--target port --stub-connector`, both
assembled with `artifact/live-data.json`: 348 compared, 344 OK, 0 WARN, 4 FAIL - and all four FAILs
are the arc leaves above.** Nothing else in the founder tweak pass moved a probe leaf. The glass
census reads `glassRimViolationCount: 0` in all four page states, `glassWhiteBorderCount: 0`, and
traps 1-4 plus glassCensus all PASS.

The arc SCRIM added in the same pass registers on no baseline leaf: it is a `pointer-events:none`
radial behind the satellites at `z-index: calc(var(--z-fab) - 1)` with no backdrop-filter, so the
census does not see it and no arc geometry moves. Verified directly instead - opacity 0 closed,
1 open, back to 0 on the outside click that already closed the arc.

### The Salesforce bubble (founder, 2026-09-01, directed)

Founder, verbatim: *"we add another bubble with the salesforce cloud... when clicking onto this
bubble it should give me either another tree of bubbles for: latest Product Package, Account page"*.

The arc's fourth seat is a CLOUD, and it is the first satellite that routes nowhere. Pressing it
fans a SECOND TIER of two smaller glass bubbles which open the client's Account record and their
Product Package in the org, in a new tab. The corner stays open behind it; Escape, an outside
click, a second press on the cloud, or taking either door folds the whole thing.

**The arc returns to the geometry this file already documents.** Between 668b840 and 86f0c35 the
arc ran at THREE satellites (45deg steps on r=96) after annual and covenant review moved into the
Relationship room, and that interlude was never minted here - the section above still described
four at 30deg. The cloud takes the seat back, so the recorded offsets `(0,-96) (-48,-83) (-83,-48)
(-96,0)`, `arcRadiiPx: [96,95.88,95.88,96]`, `arcRadiusPx: 95.94` and
`arcNeighbourSpacingPx: [49.73,49.5,49.73]` are true of the app again rather than aspirational.
**Measured, sf-bubble vs main @ 86f0c35, 3 runs each, `--target port --stub-connector`, both
assembled with `artifact/live-data.json`: 348 compared, 332 OK, 7 WARN, 9 FAIL.** Every FAIL is
founder-directed and listed here; nothing else in this pass moved a probe leaf.

- `fab.arc.arcSatelliteCount: 3 -> 4`
- `fab.arc.arcRadiiPx: [96,96.17,96] -> [96,95.88,95.88,96]`
- `fab.arc.arcNeighbourSpacingPx: [73.54,73.54] -> [49.73,49.5,49.73]`
- `fab.arc.arcNeighbourSpacingMeanPx: 73.54 -> 49.65` - the three-satellite build ran 45deg steps,
  which spaced neighbours 73.5px apart; the four are back on the approved 49.7px rhythm
- `fab.arc.arcRadiusPx: 96.06 -> 95.94` does NOT fail: the radius never moved, only the spread
- `glass.{client,cmdk,workroom}.glassSurfaceCount: +3` and `glass.hairlines.glassSurfaceCountForBorders:
  8 -> 11` - one more `.arcbtn` satellite and the tier's two `.sfbtn` bubbles, which mount with the
  corner rather than with the tier state so the fan is a transition and not a mount.
  `glassRimViolationCount` is **0 in all four page states** and `glassWhiteBorderCount` is 0:
  `.sfbtn` takes `.eg-glass .eg-glass-chip`, so the triple rim and the dark hairline are structural
- `workroom.execute.haloBoxSizeStablePx: 8.91 -> 58.8` - the known nondeterministic leaf recorded in
  the unify-router section above (two 3-run passes of the SAME build gave 58.8 and 23.11). Not this
  pass: nothing here touches the room's aura
- `fab.arc.narratorHoverLabels` gains a trailing `"Salesforce"` (SOFT/WARN) - one word, rule 54, and
  `narratorLabelsFitViewport` stays true at 1360w with the tier's two labels hovered as well
- Traps 1-4 and `glassCensus_pass` all PASS; `glass.landing` is untouched at 4 surfaces, which is
  the landing FAB staying chat-direct

**The tier is deliberately NOT on `sel.arcButton`.** It keeps `.arcbtn`, so every arc geometry leaf
measures the four satellites and never the branch. The tier gets its own hooks:
`sfTierButton` (`.sfbtn`), `sfTierAccount` (`#sfAccount`), `sfTierPackage` (`#sfPackage`),
`sfTierOpenClass` (`tier`, on #fabwrap beside `open`) and `sfTierDeadClass` (`is-dead`).

**Tier geometry, and why.** The two bubbles leave the Salesforce satellite along its OWN radial -
the arc's horizontal, pointing away from the mark - and fan 24deg either side of it at 44px, so the
pair reads as something growing out of one satellite rather than as a second sweep competing with
the first. Absolute offsets from the mark, the way the arc's are written:
`(-96,0) + 44*(cos24, -/+sin24)` = `(-136,-18)` and `(-136,18)`. 34px discs at the CHIP blur tier
rather than the satellite's, because size decides depth of field and nothing else (rule 71). Same
0.42s settle spring, same 28ms stagger, one tier deeper. Reduced motion is handled where it always
is - the global switch in electric-glass.css turns the fan into an instant show/hide.

**NEVER A WRONG LINK.** The host is `meta.instanceUrl` at RUNTIME, never hardcoded and never
rebuilt from an org id; the package is `packageRecords(bundle)[0]`, which is the same record the
workroom anchors on, so the corner and the room can never disagree about which deal "the package"
means. Missing either and the bubble renders VISIBLE BUT DEAD - a `.sfbtn.is-dead` span at ink-3,
no hover, no press, `title="Not connected to the org"` - because a guessed My Domain takes a banker
to a login page for an org they are not in (A29).

**The hero's "Open in nCino" is REMOVED** in the same pass: *"the cloud is the door now"*. The
`.hero-ncino` link, its CSS and its `OpenAccountInNcino` component are gone, and the hero's control
row is back to Sync alone. The dossier's package link SURVIVES but no longer says "Open in nCino"
anywhere: the package's own NAME in the result card's header carries the href, which is the founder's
"the package reference itself is the link". `sel` has no hook on either, so no probe leaf moves;
the contract is asserted in `sfBubble.render.test.tsx` and `ncinoLinks.render.test.tsx` instead.
