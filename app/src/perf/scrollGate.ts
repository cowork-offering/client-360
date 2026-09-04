/* =============================================================================
   THE LENS COMES OFF WHILE THE PAGE IS MOVING.

   FOUNDER, 2026-09-04 (through the coordinator): calm and frost are the safety
   net, not the answer. The LIQUID glass itself has to run smooth.

   THE ARITHMETIC OF A url() REFERENCE FILTER IN backdrop-filter. Chromium
   rasterises it ON THE CPU, over the whole filter region, every time the
   backdrop underneath it changes. Standing still, that is a cost paid ONCE: the
   result is cached and the bar is just a picture. Scrolling, it is paid on every
   single frame, for every lensed surface, on the main thread (which is the
   thread the scroll itself is being handled on). The top bar with the whole book
   sliding under it is the worst case in the app and it is also the most common
   thing a banker does.

   AND IT IS THE ONE FRAME WHERE NOBODY CAN SEE IT. The bend is a rim effect
   measured in single pixels; during a scroll the eye is tracking content, not
   inspecting the edge of the chrome. So the lens is dropped to the plain frost
   underneath it while the page moves, and comes back a beat after it stops.
   What the banker sees is glass, then glass.

   THE CLASS IS ON <html> AND THE STYLESHEET DOES THE REST. Nothing here reads
   layout, nothing queries an element, and no React state changes: one class
   toggle per scroll gesture, which is two style recalculations for a gesture
   that would otherwise have cost a full CPU filter pass per frame.

   CAPTURE, NOT BUBBLE. A `scroll` event does not bubble, and the cockpit has
   four scrollers that matter (the window, the room's thread, the manifest rail
   and the memo's reading pane). One capturing listener on the document sees all
   of them, present and future, without any of them having to register.
   ============================================================================= */

/** On <html> from the first scroll event until {@link SETTLE_MS} after the last. */
export const SCROLLING_CLASS = "eg-scrolling";

/**
 * HOW LONG AFTER THE LAST SCROLL EVENT THE LENS COMES BACK.
 *
 * Long enough to cover the gap between two flicks of a trackpad, which is
 * around 100ms of nothing in the middle of one continuous gesture; short enough
 * that a reader who has stopped to look at something is looking at the glass.
 */
export const SETTLE_MS = 140;

export interface ScrollGateHost {
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
  settleMs?: number;
}

/**
 * Start the gate. Returns the stop, which is idempotent.
 *
 * Off where there is no document. A page nobody can scroll needs no listener,
 * and that is also every jsdom test.
 */
export function startScrollGate(host: ScrollGateHost = {}): () => void {
  if (typeof document === "undefined") return () => {};
  const settleMs = host.settleMs ?? SETTLE_MS;
  const setTimer = host.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
  const clearTimer = host.clearTimer ?? ((id) => window.clearTimeout(id));

  const root = document.documentElement;
  let timer = 0;
  let moving = false;

  const settle = () => {
    moving = false;
    root.classList.remove(SCROLLING_CLASS);
  };

  const onScroll = () => {
    if (!moving) {
      moving = true;
      root.classList.add(SCROLLING_CLASS);
    }
    clearTimer(timer);
    timer = setTimer(settle, settleMs);
  };

  // Passive and capturing: never delays a scroll, and sees every scroller.
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  return () => {
    document.removeEventListener("scroll", onScroll, { capture: true });
    clearTimer(timer);
    settle();
  };
}
