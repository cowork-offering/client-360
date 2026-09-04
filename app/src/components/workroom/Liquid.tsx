import { useRef } from "react";
import { BrandGlyph } from "../brand";
import { useOffscreenPause } from "../../perf/motionGate";
import "../../styles/liquid.css";

/* =============================================================================
   THE LIQUID MOMENT.

   A gooey halo merges and parts behind the breathing mark while the room
   composes. The metaball effect is a NATIVE SVG filter — six lines of
   feGaussianBlur + feColorMatrix, no package — because a decorative blur is not
   worth a dependency and the dummy proves it does not need one.

   THE SYSTEM IS MOLTEN ONLY WHILE IT COMPOSES. Data never melts: this appears
   in the composing beat, the lookup chip and the execute loader, and nowhere a
   figure is being read.
   ============================================================================= */

/** The filter lives once per room. `id` is global to the document, so the room
 *  renders exactly one of these and every mark inside it points at it. */
export function GooFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <filter id="wk-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11" />
        </filter>
      </defs>
    </svg>
  );
}

/** The mark, breathing, with the goo behind it. `mini` is the in-thread size.
 *
 *  IT STOPS WHEN IT SCROLLS AWAY (founder, 2026-09-04: the room gets "delayed").
 *  A thread accumulates marks, and every one of them keeps three blobs moving
 *  through an SVG metaball filter whether it is on the glass or four screens up.
 *  The shared observer pauses the ones nobody is looking at and resumes them a
 *  screen before they come back, so a mark is always already breathing by the
 *  time it is seen. */
export function LiquidMark({ mini = true }: { mini?: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useOffscreenPause(ref);
  return (
    <span ref={ref} className={`liquidmark ${mini ? "mini" : ""}`.trim()}>
      <span className="goo" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <BrandGlyph className="gtbreathe" />
    </span>
  );
}

/* =============================================================================
   THE ORBIT - the compile card's own ambient glow (founder, 2026-09-03).

   The compiling card and the confirmation card are ONE card that morphs, and
   the light behind it is what makes the morph read as one thing happening
   rather than as two cards swapping. Three brand-tinted blobs travel a slow
   circle behind the glass through the SAME metaball filter the liquid mark
   uses: it is the room's existing vocabulary at a larger radius, never a new
   one.

   WHEN THE PLAN LANDS, THE GLOW SETTLES TO STILL. The blobs stop where they
   are; they do not vanish. The card is still warm, it is simply no longer
   working, and that is the difference the banker reads.
   ============================================================================= */
export function Orbit({ still = false }: { still?: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useOffscreenPause(ref);
  return (
    <span
      ref={ref}
      className={`wk-orbit${still ? " wk-orbit-still" : ""}`}
      aria-hidden="true"
      data-orbit={still ? "still" : "circling"}
    >
      <i />
      <i />
      <i />
    </span>
  );
}
