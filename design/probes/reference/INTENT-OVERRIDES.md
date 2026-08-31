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
