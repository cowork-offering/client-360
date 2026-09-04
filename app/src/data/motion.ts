/* Motion helpers — all reduced-motion aware and SSR/jsdom safe.

   Contract: when the user prefers reduced motion (or the environment has no
   matchMedia / rAF, e.g. jsdom under vitest), every helper resolves to its
   FINAL value on the first render. Animation is a progressive enhancement and
   never gates content, so the smoke tests read real figures, not "0". */

import { useEffect, useState } from "react";

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

/* =============================================================================
   ONE LOOP FOR EVERY TWEEN ON THE PAGE (founder, 2026-09-04: the cockpit "seems
   to overload").

   `useCountUp` used to open a requestAnimationFrame loop of its own. That is
   fine for one figure and wrong for a KPI band, an exposure table and a hero
   that mount together: each loop is its own callback, its own setState and its
   own React commit, and the browser runs all of them in the same frame anyway.
   Five figures counting up was five renders a frame where one would do.

   SO THERE IS ONE LOOP AND A SET OF SUBSCRIBERS. It starts on the first
   subscriber and stops on the last, so a settled page holds no rAF at all; a
   loop that runs forever to do nothing is the thing this file is trying to stop
   other people from writing.
   ============================================================================= */

/** One tween's frame. Return false when it is finished. */
type Tick = (now: number) => boolean;

const ticks = new Set<Tick>();
let pumpHandle = 0;

function pump(now: number): void {
  pumpHandle = 0;
  // Iterate a copy: a tween that finishes removes itself, and one that starts
  // another must not run twice in the frame it was added.
  for (const tick of [...ticks]) {
    let alive = false;
    try {
      alive = tick(now);
    } catch {
      alive = false;
    }
    if (!alive) ticks.delete(tick);
  }
  if (ticks.size) pumpHandle = requestAnimationFrame(pump);
}

/** Add a tween to the shared loop. Returns the removal, which is idempotent. */
export function onAnimationFrame(tick: Tick): () => void {
  ticks.add(tick);
  if (!pumpHandle) pumpHandle = requestAnimationFrame(pump);
  return () => {
    ticks.delete(tick);
    if (!ticks.size && pumpHandle) {
      cancelAnimationFrame(pumpHandle);
      pumpHandle = 0;
    }
  };
}

/** Ease-out cubic — decelerating, the banking-appropriate curve. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Tween a number from 0 to `target` on mount. Returns `target` immediately
 *  when motion is reduced or rAF is unavailable. */
export function useCountUp(target: number, durationMs = 420): number {
  const [value, setValue] = useState(() => (canAnimate() ? 0 : target));

  useEffect(() => {
    if (!canAnimate()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    return onAnimationFrame((now) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * easeOut(t));
      return t < 1;
    });
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
