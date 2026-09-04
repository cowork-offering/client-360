// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCROLLING_CLASS, SETTLE_MS, startScrollGate } from "./perf/scrollGate";

/* =============================================================================
   THE LENS COMES OFF WHILE THE PAGE IS MOVING.

   FOUNDER, 2026-09-04 (through the coordinator): the liquid glass itself has to
   run smooth. Ablation on the shipped bundle at 4x CPU throttle says the url()
   backdrop filter is very nearly the whole bill on the two surfaces a demo
   lives on, and it is a bill paid on every frame the backdrop moves.

   THREE CLAIMS.

     1. The first scroll event takes the lens off, in the same task. A gate that
        waited a frame would leak the frame the gesture starts on, which is the
        most expensive one.
     2. It comes back a beat after the LAST event, not the first: one settle
        timer, restarted, so a long flick is one on and one off rather than
        forty.
     3. Every scroller counts. A `scroll` event does not bubble, so the listener
        captures. The room's thread, the manifest rail and the memo's reading pane
        are all scrollers the window never hears about.
   ============================================================================= */

let timers: Array<{ id: number; fn: () => void }> = [];
let nextId = 1;

const host = {
  setTimer: (fn: () => void) => {
    const id = nextId++;
    timers.push({ id, fn });
    return id;
  },
  clearTimer: (id: number) => {
    timers = timers.filter((t) => t.id !== id);
  },
};

/** Fire whatever settle timer is standing, if any. */
function settle() {
  const t = timers.pop();
  t?.fn();
}

const scrolling = () => document.documentElement.classList.contains(SCROLLING_CLASS);

beforeEach(() => {
  timers = [];
  nextId = 1;
  document.documentElement.className = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  document.documentElement.className = "";
  document.body.innerHTML = "";
});

describe("the scroll gate", () => {
  it("takes the lens off on the first event and puts it back after the last", () => {
    const stop = startScrollGate(host);
    expect(scrolling()).toBe(false);

    document.dispatchEvent(new Event("scroll"));
    expect(scrolling()).toBe(true);

    settle();
    expect(scrolling()).toBe(false);
    stop();
  });

  it("holds one settle timer across a whole gesture", () => {
    const stop = startScrollGate(host);
    for (let i = 0; i < 20; i++) document.dispatchEvent(new Event("scroll"));
    // Twenty events, one standing timer: the earlier ones were cleared.
    expect(timers.length).toBe(1);
    expect(scrolling()).toBe(true);
    settle();
    expect(scrolling()).toBe(false);
    stop();
  });

  /* A scroll event does not bubble. Only a capturing listener sees an inner
     scroller, and the inner scrollers are where the room does its reading. */
  it("hears a scroller that is not the window", () => {
    const rail = document.createElement("div");
    document.body.appendChild(rail);
    const stop = startScrollGate(host);

    rail.dispatchEvent(new Event("scroll")); // does not bubble
    expect(scrolling()).toBe(true);
    stop();
  });

  it("leaves the page unmarked when it is stopped mid-gesture", () => {
    const stop = startScrollGate(host);
    document.dispatchEvent(new Event("scroll"));
    expect(scrolling()).toBe(true);
    stop();
    expect(scrolling()).toBe(false);
    // And it is no longer listening.
    document.dispatchEvent(new Event("scroll"));
    expect(scrolling()).toBe(false);
  });

  it("settles inside a beat, so a reader who stopped is looking at glass", () => {
    expect(SETTLE_MS).toBeLessThanOrEqual(200);
  });
});
