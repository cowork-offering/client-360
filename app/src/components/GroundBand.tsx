import { useMemo } from "react";
import { BAND_VIEWBOX, buildBand } from "../data/weave";

/* =============================================================================
   THE GROUND BAND: the strand the refraction bends.

   One fixed sheet behind both views, four coarse violet strands at 3 to 5
   percent alpha. On the open canvas it is a haze you have to hunt for; under a
   frost it is the only thing left with an edge, which is the entire point
   (data/weave.ts carries the reasoning).

   FIXED, NOT ABSOLUTE. The glass surfaces that need it are spread across the
   whole app: the bar at the top, the hero under it, the arc at the bottom
   right, the rail inside the room. A document-flow band would reach the first
   screen only.

   THE DRIFT SHEET IS LIQUID-ONLY and is a SECOND element rather than a class on
   the first, because the two move differently: the strands are still (a ground
   that moves puts a compositor job under every view for a texture nobody is
   meant to notice) and the blooms drift, which is what makes the bend visible
   while nothing at all is scrolling. It is transform-only, one element, and
   electric-glass.css kills it under prefers-reduced-motion.

   z -1 keeps both under every written thing while staying above the body's own
   gradients, and neither ever creates work: no state, no rAF, no listeners.
   ============================================================================= */
export function GroundBand() {
  const band = useMemo(buildBand, []);
  return (
    <div className="ground-band" aria-hidden="true">
      <div className="ground-blooms" />
      <svg viewBox={BAND_VIEWBOX} preserveAspectRatio="none">
        {band.map((t, i) => (
          <path key={i} d={t.d} stroke={t.stroke} strokeWidth={t.width} opacity={t.opacity} />
        ))}
      </svg>
    </div>
  );
}
