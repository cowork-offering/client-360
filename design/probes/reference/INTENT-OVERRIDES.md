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
