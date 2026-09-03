/* =============================================================================
   THE GROUND SHEET: whatever the refraction has to bend.

   It carried four coarse violet strands for about an hour on 2026-09-03. The
   founder killed them on sight ("I hate those thick lines"), and the rule that
   came out of it is worth keeping in front of whoever reads this next: the
   header weave is the ONE sanctioned place for ambient linework, and the page
   ground gets none, at any alpha.

   So the sheet is a mount point and nothing else. In liquid mode it holds two
   blooms, which is the only structure the main pages put behind their glass; in
   every other mode it renders an empty, inert layer.

   FIXED, NOT ABSOLUTE. The glass surfaces that need it are spread across the
   whole app: the bar at the top, the hero under it, the arc at the bottom
   right. A document-flow layer would reach the first screen only.

   IT IS ALSO COMPLETELY STILL, AND THAT IS THE POINT. The blooms drifted on a
   78s loop for one round. A transform under the glass changes the BACKDROP of
   every lensed surface above it, and in Chromium a changed backdrop means the
   reference filter is rasterised again, on the CPU, on the main thread. A
   ground that drifts forever is a promise to re-rasterise every lens forever,
   and the founder felt that as input latency. The idle-park machinery that used
   to sit here (six listeners and a timer, to stop the drift after 30 seconds)
   went with the drift: there is nothing left to park.

   No state, no rAF, no listeners, no animation. One element with two gradients.
   ============================================================================= */
export function GroundSheet() {
  return (
    <div className="ground-sheet" aria-hidden="true">
      <div className="ground-blooms" />
    </div>
  );
}
