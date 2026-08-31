/* =============================================================================
   THE NAME FLIGHT — DIRECTION-LOCKED rule 58 (continuity) and rule 60 (landing).

   NOTHING TELEPORTS. Opening a relationship moves the client NAME out of the
   worklist row and into the hero: a fixed ghost that grows 14.5px -> 25px with
   its letter-spacing morphing with it, over .52s on the settle-with-lift curve.

   TWO TRAPS LIVE IN THESE THIRTY LINES, and both cost a root-cause round:

   TRAP 2 — the suppressed entry animation. The client view must hold perfectly
   still while the ghost carries all the motion, so its entry animation is
   suppressed by `noanim` ON THE VIEW (`.view.noanim.show`, which outranks
   `.view.show`). The class is added BEFORE the view is shown and is cleared only
   when the view next HIDES — AppShell owns that half. Removing it while the view
   is visible flips animation none -> viewin and restarts the entry animation
   mid-flight, which is the "ms refresh" blip. A body-level class removed at
   flight end is the same bug wearing a different name.

   TRAP 4 — the handoff. A shared-element morph does not end by fading the ghost
   out onto nothing; it ends as a CROSSFADE IN PLACE. At .52s the real name is
   restored to full opacity UNDERNEATH the ghost, and only then does the ghost
   dissolve over identical pixels. At every frame of the flight something at full
   opacity is carrying the name, so there is no dip anywhere in the window.
   ============================================================================= */

import { prefersReducedMotion } from "../data/motion";

/** The geometry leg, matching `.flyname`'s transition in client.css. */
const FLIGHT_MS = 520;
/** The dissolve, and the beat after it before the ghost is taken out of the DOM. */
const DISSOLVE_MS = 160;
const REMOVE_MS = 180;

/**
 * Fly `src`'s text into the hero, then open the client.
 *
 * @param src  the element holding the name in the row (the worklist `.who b`)
 * @param open the navigation itself — dispatched between the two measurements
 */
export function flyName(src: HTMLElement, open: () => void): void {
  const view = document.getElementById("view-account");
  if (!view || prefersReducedMotion()) {
    open();
    return;
  }

  const from = src.getBoundingClientRect();
  view.classList.add("noanim"); // before the view is shown, or the animation has already started
  open();
  window.scrollTo(0, 0); // geometry must be settled before the destination is measured

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const dst = document.querySelector<HTMLElement>(".acct-name");
      if (!dst) return; // the client never opened; the view keeps `noanim` until it hides
      const to = dst.getBoundingClientRect();

      const ghost = document.createElement("div");
      ghost.className = "flyname";
      ghost.textContent = src.textContent;
      ghost.style.left = `${from.left}px`;
      ghost.style.top = `${from.top}px`;
      document.body.appendChild(ghost);

      dst.style.opacity = "0";
      ghost.getBoundingClientRect(); // commit the start frame before it is changed
      ghost.style.left = `${to.left}px`;
      ghost.style.top = `${to.top}px`;
      ghost.style.fontSize = "25px";
      ghost.style.letterSpacing = "-.02em";

      window.setTimeout(() => {
        dst.style.opacity = ""; // identical pixels appear beneath the ghost
        ghost.style.transition = `opacity ${DISSOLVE_MS}ms var(--ease-out)`;
        ghost.style.opacity = "0"; // and it dissolves over them; never a gap
        window.setTimeout(() => ghost.remove(), REMOVE_MS);
      }, FLIGHT_MS);
    }),
  );
}
