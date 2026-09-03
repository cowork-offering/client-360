import { useEffect } from "react";

/* =============================================================================
   THE GROUND SHEET: whatever the refraction has to bend.

   It carried four coarse violet strands for about an hour on 2026-09-03. The
   founder killed them on sight ("I hate those thick lines"), and the rule that
   came out of it is worth keeping in front of whoever reads this next: the
   header weave is the ONE sanctioned place for ambient linework, and the page
   ground gets none, at any alpha.

   So the sheet is now a mount point and nothing else. In liquid mode it holds
   two drifting blooms, which is the only structure the main pages put behind
   their glass; in every other mode it renders an empty, inert layer.

   FIXED, NOT ABSOLUTE. The glass surfaces that need it are spread across the
   whole app: the bar at the top, the hero under it, the arc at the bottom
   right. A document-flow layer would reach the first screen only.
   ============================================================================= */

/** Quiet after this long with no sign of a reader, and the decoration stops. */
const IDLE_MS = 30000;

/* THE IDLE PARK.

   The drift and the specular sweep are the two things in the cockpit that ask
   the compositor for work when nobody is doing anything, so they stop when
   nobody is. One class on <html>, one timer, listeners that are passive and
   never touch layout.

   BE HONEST ABOUT WHAT THIS BUYS. Measured on the client page, headless, no
   GPU: liquid runs at 141 ms/frame with the drift running and 139 with it
   stopped. The frame cost is the LENS, not the animation, and parking the
   drift does not move it. What this does buy is a tab that is not asking a
   real GPU to recomposite twelve backdrop-filtered surfaces forever while its
   reader is in another window, which is a battery argument rather than a
   frame-rate one, and it is still the right thing to do.

   It is deliberately not a rAF loop or a scroll-position poll: four passive
   listeners and a setTimeout cost nothing to have. */
function useIdlePark() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const park = () => root.classList.add("eg-idle");
    const wake = () => {
      if (root.classList.contains("eg-idle")) root.classList.remove("eg-idle");
      window.clearTimeout(timer);
      timer = window.setTimeout(park, IDLE_MS);
    };
    const onVisibility = () => {
      if (document.hidden) park();
      else wake();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    wake();
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, wake);
      document.removeEventListener("visibilitychange", onVisibility);
      root.classList.remove("eg-idle");
    };
  }, []);
}

export function GroundSheet() {
  useIdlePark();
  return (
    <div className="ground-sheet" aria-hidden="true">
      <div className="ground-blooms" />
    </div>
  );
}
