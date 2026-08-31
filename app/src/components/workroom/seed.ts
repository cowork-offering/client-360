import { prefersReducedMotion } from "../../data/motion";

/* =============================================================================
   THE SEED (rule 58) — NOTHING TELEPORTS.

   A white glass seed circle ripples out of the EXACT control that summoned the
   room, timed with the room's opacity entrance. 340px, a soft violet bloom, and
   deliberately NO backdrop-filter: a backdrop-filtered circle scaling across
   the viewport is the Safari compositing case that stutters, and the bloom does
   the same work without it.

   THE CALLER SOWS IT, not the room. The control that was pressed is the only
   thing that knows where it is, and `openWorkroom` is a module store with no
   opinion about presentation — so the arc button hands its own rect over here
   and the room never has to be told where it came from.
   ============================================================================= */

const SEED_PX = 340;
const SEED_LIFE_MS = 600;

export function sowSeed(from: Element | null): void {
  if (!from || prefersReducedMotion() || typeof document === "undefined") return;
  const r = from.getBoundingClientRect();
  const seed = document.createElement("div");
  seed.className = "wkseed";
  seed.style.left = `${r.left + r.width / 2}px`;
  seed.style.top = `${r.top + r.height / 2}px`;
  seed.style.width = `${SEED_PX}px`;
  seed.style.height = `${SEED_PX}px`;
  document.body.appendChild(seed);
  // One frame at scale(0) before the class lands, or the two transforms
  // coalesce into a single computation and the circle never travels.
  seed.getBoundingClientRect();
  seed.classList.add("go");
  window.setTimeout(() => seed.remove(), SEED_LIFE_MS);
}
