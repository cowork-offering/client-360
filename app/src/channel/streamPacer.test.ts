import { describe, expect, it } from "vitest";
import { BASE_RATE, MAX_RATE, rateFor, startPacer, unitsOf } from "./streamPacer";

/* =============================================================================
   THE STREAM PACER.

   Founder, 2026-09-03: the streamed remark "feels stuck and jerky". The door
   delivers in bursts; the pacer turns those bursts into one steady hand.

   WHAT THESE HOLD:

     MONOTONIC     the reader never sees the remark get shorter, and never sees
                   a word arrive out of order. The prefix only grows.
     NEVER A JUMP  however deep the buffer runs, the release rate is capped. A
                   pacer that emptied its buffer in one frame would be the jump
                   this exists to remove.
     ALWAYS LANDS  when the door finishes, the pacer drains what is left and the
                   final text is the door's own, byte for byte. No remark is
                   left a word short because a frame did not fire.
     NO PACER      under reduced motion every push lands whole. A reader who
                   asked for no motion asked for the text.
   ============================================================================= */

/** A frame clock the test drives by hand. */
function clock() {
  let t = 0;
  const pending: Array<(t: number) => void> = [];
  return {
    raf: (cb: (t: number) => void) => {
      pending.push(cb);
      return pending.length;
    },
    cancelRaf: () => {},
    now: () => t,
    /** Run one frame, `ms` after the last. */
    frame(ms = 16) {
      t += ms;
      const due = pending.splice(0, pending.length);
      for (const cb of due) cb(t);
    },
    get queued() {
      return pending.length;
    },
  };
}

const LINE = "The revolver carries the whole increase and the pledged pool does not move with it at all.";

describe("the pacer releases at a steady, monotonic pace", () => {
  it("never hands back a shorter prefix than the one before it", () => {
    const c = clock();
    const seen: string[] = [];
    const pacer = startPacer({ emit: (v) => seen.push(v), raf: c.raf, cancelRaf: c.cancelRaf, now: c.now });

    pacer.push("The revolver");
    for (let i = 0; i < 4; i++) c.frame(16);
    pacer.push(LINE);
    for (let i = 0; i < 60; i++) c.frame(16);

    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].length).toBeGreaterThanOrEqual(seen[i - 1].length);
      expect(seen[i].startsWith(seen[i - 1])).toBe(true);
    }
  });

  it("does not deliver a whole paragraph in one frame", () => {
    const c = clock();
    const seen: string[] = [];
    const pacer = startPacer({ emit: (v) => seen.push(v), raf: c.raf, cancelRaf: c.cancelRaf, now: c.now });

    // The worst case the door produces: everything at once.
    pacer.push(LINE);
    c.frame(16);

    const words = seen[0].split(/\s+/).filter(Boolean).length;
    // A 16ms frame at the ceiling is barely more than one word. Whatever the
    // backlog, the reader sees writing rather than a wall.
    expect(words).toBeLessThan(4);
    expect(seen[0]).not.toBe(LINE);
  });

  it("leans forward when the buffer runs deep, and stops leaning at the ceiling", () => {
    expect(rateFor(0)).toBe(BASE_RATE);
    expect(rateFor(20)).toBeGreaterThan(BASE_RATE);
    expect(rateFor(10_000)).toBe(MAX_RATE);
  });

  it("lands the door's own text, byte for byte, when it finishes", () => {
    const c = clock();
    let last = "";
    let done = false;
    const pacer = startPacer({
      emit: (v, d) => {
        last = v;
        done = d;
      },
      raf: c.raf,
      cancelRaf: c.cancelRaf,
      now: c.now,
    });

    pacer.push("The revolver");
    c.frame(16);
    pacer.finish(LINE);
    for (let i = 0; i < 200 && !done; i++) c.frame(16);

    expect(done).toBe(true);
    expect(last).toBe(LINE);
    // And it stops: a finished pacer holds no frame open.
    expect(c.queued).toBe(0);
  });

  it("has no pacer at all under reduced motion", () => {
    const seen: string[] = [];
    const pacer = startPacer({ emit: (v) => seen.push(v), instant: true });
    pacer.push(LINE);
    expect(seen).toEqual([LINE]);
    pacer.finish(LINE);
    expect(seen[seen.length - 1]).toBe(LINE);
  });

  it("cancels cleanly: nothing more is released after the room closes", () => {
    const c = clock();
    const seen: string[] = [];
    const pacer = startPacer({ emit: (v) => seen.push(v), raf: c.raf, cancelRaf: c.cancelRaf, now: c.now });
    pacer.push(LINE);
    c.frame(16);
    const after = seen.length;
    pacer.cancel();
    pacer.push(LINE);
    for (let i = 0; i < 10; i++) c.frame(16);
    expect(seen).toHaveLength(after);
  });

  it("splits into units that join back into the original", () => {
    expect(unitsOf(LINE).join("")).toBe(LINE);
    expect(unitsOf("")).toEqual([]);
  });
});
