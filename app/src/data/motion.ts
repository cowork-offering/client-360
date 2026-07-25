/* Motion helpers — all reduced-motion aware and SSR/jsdom safe.

   Contract: when the user prefers reduced motion (or the environment has no
   matchMedia / rAF, e.g. jsdom under vitest), every helper resolves to its
   FINAL value on the first render. Animation is a progressive enhancement and
   never gates content, so the smoke tests read real figures, not "0". */

import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

function canAnimate(): boolean {
  return typeof requestAnimationFrame === "function" && !prefersReducedMotion();
}

/** Ease-out cubic — decelerating, the banking-appropriate curve. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Tween a number from 0 to `target` on mount. Returns `target` immediately
 *  when motion is reduced or rAF is unavailable. */
export function useCountUp(target: number, durationMs = 420): number {
  const [value, setValue] = useState(() => (canAnimate() ? 0 : target));
  const frame = useRef(0);

  useEffect(() => {
    if (!canAnimate()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * easeOut(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs]);

  return value;
}

/** False on first paint, true immediately after mount — drives CSS transitions
 *  for dials/gauges/bars so they animate to value on entry. Under reduced
 *  motion the CSS transition itself is neutralised (tokens.css), so the value
 *  simply appears. */
export function useEnterTransition(): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(true);
  }, []);
  return entered;
}

/** Per-row entrance delay, capped so a long list never feels sluggish. */
export function staggerDelay(index: number, stepMs = 24, capMs = 320): string {
  return `${Math.min(index * stepMs, capMs)}ms`;
}
