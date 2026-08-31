import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../data/motion";

/* =============================================================================
   THE ODOMETER (rule 61) — a figure never swaps, it ROLLS.

   The MATERIAL is foundation (electric-glass.css `.eg-odo`): changed columns
   become 1em strips that slide up on the odometer curve with a blur pulse
   through the middle of the roll. This is the ENGINE that drives it, ported
   from the dummy's `odoRoll` with its semantics intact:

     - it operates on the element's FIRST TEXT NODE, never on its markup, so a
       figure that carries a unit span beside it keeps the span;
     - same-length values only. Different lengths swap plain, because a column
       that has no counterpart cannot roll into one;
     - unchanged characters HOLD STILL. Only the columns that differ become
       strips, which is what makes the roll read as a mechanism rather than a
       wipe;
     - the per-column delay is the character's own index (45ms), so a figure
       whose changed digits sit apart staggers across the gap exactly as the
       dummy's does;
     - plain text is restored after 1.1s. The strips are a moment, not a
       permanent DOM shape, and nothing downstream has to know about them.

   REDUCED MOTION SWAPS. The kill-switch in electric-glass.css would freeze the
   strips mid-roll — an animation that is switched off leaves whatever it was
   animating in its resting state, and the resting state of a strip is the OLD
   digit. So the engine itself checks, and writes the new text.
   ============================================================================= */

/** The dummy's numbers, kept as named constants because two of them are in the
 *  acceptance table: 45ms per column, and 1.1s before plain text returns. */
const COLUMN_STAGGER_MS = 45;
const RESTORE_MS = 1100;

export function odoRoll(el: HTMLElement | null, newText: string): void {
  if (!el) return;
  let tn = el.firstChild;
  if (!tn || tn.nodeType !== Node.TEXT_NODE) {
    tn = document.createTextNode("");
    el.insertBefore(tn, el.firstChild);
  }
  const old = tn.nodeValue ?? "";
  if (prefersReducedMotion() || old.length !== newText.length || old === newText) {
    tn.nodeValue = newText;
    return;
  }

  const wrap = document.createElement("span");
  for (let i = 0; i < old.length; i++) {
    if (old[i] === newText[i]) {
      wrap.appendChild(document.createTextNode(old[i]));
      continue;
    }
    const col = document.createElement("span");
    col.className = "eg-odo";
    const strip = document.createElement("span");
    strip.className = "eg-odo-strip";
    strip.style.transitionDelay = `${i * COLUMN_STAGGER_MS}ms`;
    const o = document.createElement("span");
    o.textContent = old[i];
    const n = document.createElement("span");
    n.textContent = newText[i];
    strip.append(o, n);
    col.appendChild(strip);
    wrap.appendChild(col);
  }
  el.replaceChild(wrap, tn);
  // The strips have to exist at their resting transform for ONE frame before
  // the class lands, or the browser coalesces insertion and target into a
  // single style computation and nothing moves.
  wrap.getBoundingClientRect();
  requestAnimationFrame(() => {
    wrap.querySelectorAll(".eg-odo").forEach((c) => c.classList.add("eg-odo-go"));
  });
  window.setTimeout(() => {
    if (wrap.parentNode === el) el.replaceChild(document.createTextNode(newText), wrap);
  }, RESTORE_MS);
}

/**
 * A FIGURE THAT ROLLS WHEN IT MOVES.
 *
 * React renders the span; NOTHING inside it. The text is written by the effect,
 * which is what lets the roll exist at all — the strips are DOM the renderer
 * does not own, so a re-render cannot clobber them mid-roll and the restore is
 * always the value React last handed down.
 */
export function Odo({
  value,
  className = "",
  id,
}: {
  value: string;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (shown.current === null) {
      el.textContent = value;
    } else if (shown.current !== value) {
      odoRoll(el, value);
    }
    shown.current = value;
  }, [value]);
  // suppressHydrationWarning is not in play (this app never hydrates), but the
  // span must render EMPTY so the effect owns every character in it.
  return <span ref={ref} id={id} className={`tnum ${className}`.trim()} />;
}
