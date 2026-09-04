// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HIDDEN_CLASS,
  OFFSCREEN_CLASS,
  pauseWhenOffscreen,
  resetOffscreenObserver,
  startHiddenPause,
} from "./perf/motionGate";

/* =============================================================================
   NOTHING PAYS FOR MOTION NOBODY IS WATCHING.

   Two claims, both of them things a viewer can check on a shared screen.

     1. A cockpit behind a slide deck stops animating, and picks up where it
        left off when it comes back. PAUSED, never stopped: a loop that snapped
        to its resting frame on return would be a visible glitch every time the
        founder switched windows.
     2. An element scrolled out of the thread stops too, through ONE observer
        rather than one per component, and resumes before it is seen.
   ============================================================================= */

/** jsdom has no IntersectionObserver. This is the smallest one that can be
 *  driven by hand, and it records what was observed so the "one shared
 *  observer" claim is assertable rather than assumed. */
class FakeIO {
  static made = 0;
  static live: FakeIO[] = [];
  observed = new Set<Element>();
  constructor(private cb: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) {
    FakeIO.made += 1;
    FakeIO.live.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  /** Say what the viewport can see. */
  report(el: Element, isIntersecting: boolean) {
    this.cb([{ target: el, isIntersecting }]);
  }
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  FakeIO.made = 0;
  FakeIO.live = [];
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  resetOffscreenObserver();
  document.documentElement.className = "";
  document.body.innerHTML = "";
  setVisibility("visible");
});

afterEach(() => {
  resetOffscreenObserver();
  document.documentElement.className = "";
  document.body.innerHTML = "";
});

describe("the hidden document", () => {
  it("pauses everything while the page is away, and releases it on return", () => {
    const stop = startHiddenPause();
    expect(document.documentElement.classList.contains(HIDDEN_CLASS)).toBe(false);

    setVisibility("hidden");
    expect(document.documentElement.classList.contains(HIDDEN_CLASS)).toBe(true);

    setVisibility("visible");
    expect(document.documentElement.classList.contains(HIDDEN_CLASS)).toBe(false);
    stop();
  });

  it("leaves nothing behind when it is stopped", () => {
    const stop = startHiddenPause();
    setVisibility("hidden");
    stop();
    expect(document.documentElement.classList.contains(HIDDEN_CLASS)).toBe(false);
    // And it is no longer listening: a later change must not put the class back.
    setVisibility("visible");
    setVisibility("hidden");
    expect(document.documentElement.classList.contains(HIDDEN_CLASS)).toBe(false);
  });
});

describe("the off-screen element", () => {
  it("pauses what has scrolled away and resumes what comes back", () => {
    const el = document.createElement("span");
    document.body.appendChild(el);
    const stop = pauseWhenOffscreen(el);

    FakeIO.live[0].report(el, false);
    expect(el.classList.contains(OFFSCREEN_CLASS)).toBe(true);

    FakeIO.live[0].report(el, true);
    expect(el.classList.contains(OFFSCREEN_CLASS)).toBe(false);
    stop();
  });

  /* ONE OBSERVER FOR THE WHOLE APP. A thread carries a mark per exchange, and
     one IntersectionObserver each would be a second callback queue per row. */
  it("watches every element through a single observer", () => {
    const a = document.createElement("span");
    const b = document.createElement("span");
    document.body.append(a, b);
    const stopA = pauseWhenOffscreen(a);
    const stopB = pauseWhenOffscreen(b);
    expect(FakeIO.made).toBe(1);
    expect(FakeIO.live[0].observed.size).toBe(2);
    stopA();
    stopB();
    expect(FakeIO.live[0].observed.size).toBe(0);
  });

  it("hands the element back unpaused when it unregisters", () => {
    const el = document.createElement("span");
    document.body.appendChild(el);
    const stop = pauseWhenOffscreen(el);
    FakeIO.live[0].report(el, false);
    expect(el.classList.contains(OFFSCREEN_CLASS)).toBe(true);
    stop();
    expect(el.classList.contains(OFFSCREEN_CLASS)).toBe(false);
  });

  /* A BROWSER WITHOUT THE OBSERVER STILL RENDERS THE APP. Absence is a state. */
  it("is a no-op where the platform has no observer", () => {
    resetOffscreenObserver();
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined;
    const el = document.createElement("span");
    expect(() => pauseWhenOffscreen(el)()).not.toThrow();
    expect(el.classList.contains(OFFSCREEN_CLASS)).toBe(false);
  });
});
