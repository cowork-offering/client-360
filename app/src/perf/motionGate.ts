import { useEffect, type RefObject } from "react";

/* =============================================================================
   NOTHING PAYS FOR MOTION NOBODY IS WATCHING.

   FOUNDER, 2026-09-04: the cockpit "seems to overload" on a shared screen.

   Two of the cheapest wins in the whole pass are here, and neither of them
   changes how anything looks to a person who IS looking at it.

   THE HIDDEN PAGE. A cockpit behind the founder's slide deck is still running
   every aura, every breath and every drift, and the compositor is still
   rasterising them; a browser throttles rAF on a hidden tab but it does not
   stop a CSS animation. One class on <html> and the stylesheet stops all of
   them at once, `animation-play-state: paused`, not `none`, so a page that
   comes back is exactly where it was rather than snapped to a resting frame.

   THE OFF-SCREEN ELEMENT. The same argument at element scale, through ONE
   shared IntersectionObserver rather than one per component: a room's aura
   scrolled out of the thread, a mark below the fold, a card the reader has
   moved past. `eg-off` pauses it and nothing else.

   THE CLASSES DO NOT STACK OR FIGHT. Both are pause, both are reversible, and
   an element that is both hidden and off screen is paused once.
   ============================================================================= */

/** On <html> while the document is hidden. */
export const HIDDEN_CLASS = "eg-hidden";

/** On an element while it is outside the viewport. */
export const OFFSCREEN_CLASS = "eg-off";

/**
 * Stop every animation while the document is hidden. Returns the stop.
 *
 * Called once, at boot. Safe where there is no document (jsdom without a DOM,
 * SSR): a page nobody can hide needs no listener.
 */
export function startHiddenPause(): () => void {
  if (typeof document === "undefined") return () => {};
  const sync = () => {
    document.documentElement.classList.toggle(HIDDEN_CLASS, document.visibilityState === "hidden");
  };
  sync();
  document.addEventListener("visibilitychange", sync);
  return () => {
    document.removeEventListener("visibilitychange", sync);
    document.documentElement.classList.remove(HIDDEN_CLASS);
  };
}

/* ------------------------------------------------------- the shared observer

   ONE observer PER ROOT, and for almost everything the root is the viewport. A
   component that made its own would be a second callback queue, a second set of
   thresholds and a second thing to leak; the browser is perfectly happy watching
   fifty elements through one.

   THE ROOT ARGUMENT IS FOR CLIPPED SCROLLERS. The manifest rail is a bounded box
   with its own scrollbar, so a chip can be well inside the viewport and still be
   invisible: only the rail knows. Those callers pass the rail, and get their own
   observer for it. */

const observers = new Map<Element | null, IntersectionObserver>();
const watched = new WeakMap<Element, boolean>();

function shared(root: Element | null): IntersectionObserver | null {
  if (typeof IntersectionObserver !== "function") return null;
  const held = observers.get(root);
  if (held) return held;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const off = !entry.isIntersecting;
        if (watched.get(entry.target) === off) continue;
        watched.set(entry.target, off);
        entry.target.classList.toggle(OFFSCREEN_CLASS, off);
      }
    },
    /* A MARGIN, BECAUSE A LOOP THAT STARTS AS IT ARRIVES IS A LOOP THAT STUTTERS.
       An element resumes a screen's width before it is seen, so whatever it is
       doing is already at speed by the time the reader gets to it. A clipped
       scroller gets a tighter one: 200px inside a 300px rail is the whole rail. */
    { root, rootMargin: root ? "80px" : "200px", threshold: 0 },
  );
  observers.set(root, io);
  return io;
}

/** Register an element. Returns the unregister. Exported for the suite and for
 *  the callers that hold a raw element rather than a React ref. */
export function pauseWhenOffscreen(el: Element | null, root: Element | null = null): () => void {
  const io = shared(root);
  if (!el || !io) return () => {};
  io.observe(el);
  return () => {
    io.unobserve(el);
    watched.delete(el);
    el.classList.remove(OFFSCREEN_CLASS);
  };
}

/** Register several at once, against one root. Returns the unregister for all
 *  of them. This is the rail's form: it holds a stack of chips it did not
 *  render and cannot put a ref on. */
export function pauseGroupWhenOffscreen(els: Iterable<Element>, root: Element | null = null): () => void {
  const stops = [...els].map((el) => pauseWhenOffscreen(el, root));
  return () => stops.forEach((stop) => stop());
}

/** The hook form. Pauses whatever the element is animating while it is out of
 *  the viewport, and puts it back when it returns. */
export function useOffscreenPause(ref: RefObject<Element | null>): void {
  useEffect(() => pauseWhenOffscreen(ref.current), [ref]);
}

/** THE SUITE'S RESET. The observers are module state and vitest reuses a module
 *  across files in one worker; without this a test's element stays observed by
 *  an observer whose document is gone. */
export function resetOffscreenObserver(): void {
  for (const io of observers.values()) io.disconnect();
  observers.clear();
}
