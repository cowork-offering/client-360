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
