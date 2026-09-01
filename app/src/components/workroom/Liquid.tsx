import { BrandGlyph } from "../brand";
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

/** The mark, breathing, with the goo behind it. `mini` is the in-thread size. */
export function LiquidMark({ mini = true }: { mini?: boolean }) {
  return (
    <span className={`liquidmark ${mini ? "mini" : ""}`.trim()}>
      <span className="goo" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <BrandGlyph className="gtbreathe" />
    </span>
  );
}
