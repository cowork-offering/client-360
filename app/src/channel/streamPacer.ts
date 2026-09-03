/* =============================================================================
   THE STREAM PACER - a remark that arrives at a readable pace.

   FOUNDER, 2026-09-03: the streamed narration "feels stuck and jerky". It was.
   The door hands the page whatever the model has produced since the last
   callback, and a model produces in bursts: four words, then nothing for four
   hundred milliseconds, then a whole paragraph. The page rendered each burst
   the moment it landed, so the glass showed a stall and then a jump, and the
   pane's height jumped with it.

   THE FIX IS A BUFFER AND A CLOCK. Deltas go into a buffer; a requestAnimationFrame
   loop releases from it at a STEADY word rate. What the reader sees is a hand
   writing at one speed, whatever the network and the model did underneath.

   IT CATCHES UP GENTLY, IT NEVER JUMPS. Where the buffer has run deep - a burst
   landed, or a frame was dropped - the release rate rises in proportion to the
   backlog and is CAPPED: {@link MAX_RATE} words a second is quick reading, and
   the pacer will not exceed it to clear a backlog. A pacer that emptied its
   buffer in one frame would be the jump this exists to remove.

   IT ALWAYS FINISHES. When the door says the remark is complete, the pacer
   drains what is left at the catch-up rate and then lands the final text
   exactly: no remark is ever left one word short because a frame did not fire.

   NOTHING HERE PARSES, GUARDS OR RENDERS. It hands out a PREFIX of the text the
   door produced, and every guard the room already runs runs on that prefix
   exactly as it ran on the raw delta. The pacer cannot change what a remark
   says; it can only change when the reader gets to see it.

   REDUCED MOTION HAS NO PACER AT ALL. A reader who has asked for no motion is
   asking for the text, not for a performance, and every jsdom test takes the
   same path because jsdom has no matchMedia and no rAF worth waiting on.
   ============================================================================= */

/** Words a second at rest. Comfortable reading aloud, and a shade under the
 *  word speech's own 26ms stagger so the two never fight. */
export const BASE_RATE = 26;

/** The ceiling, however deep the buffer runs. Past this the eye reads a jump
 *  rather than a stream. */
export const MAX_RATE = 72;

/** How much of the backlog a frame is allowed to spend clearing, per second.
 *  A third of the buffer a second is a lean forward, not a lurch. */
export const CATCH_UP = 0.34;

/**
 * THE RELEASE SCHEDULE, AS A PURE FUNCTION.
 *
 * @param behind how many words are buffered and not yet released
 * @returns words a second to release at
 */
export function rateFor(behind: number): number {
  return Math.min(MAX_RATE, BASE_RATE + behind * CATCH_UP);
}

/** Split a text into the units the pacer releases: words, with the whitespace
 *  that follows each of them, so a released prefix is always a real prefix of
 *  the original and never loses a space. */
export function unitsOf(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

export interface Pacer {
  /** A delta landed. The pacer releases toward it at its own pace. */
  push: (full: string) => void;
  /** The door finished. What is left drains, and the final text lands exactly. */
  finish: (full: string) => void;
  /** Stop, release nothing more, and forget the buffer. */
  cancel: () => void;
}

export interface PacerHost {
  /** Called with the prefix the reader may see now. Monotonic BY CONSTRUCTION:
   *  the pacer never hands out a shorter prefix than the one before it. */
  emit: (visible: string, done: boolean) => void;
  /** Injected for the suite. Defaults to the platform's own. */
  raf?: (cb: (t: number) => void) => number;
  cancelRaf?: (h: number) => void;
  now?: () => number;
  /** No pacing at all: every push lands whole. The reduced-motion path. */
  instant?: boolean;
}

/**
 * START A PACER.
 *
 * One per remark. The host emits; the pacer owns nothing but the clock and the
 * count of words it has let through.
 */
export function startPacer(host: PacerHost): Pacer {
  const raf = host.raf ?? ((cb: (t: number) => void) => window.requestAnimationFrame(cb));
  const cancelRaf = host.cancelRaf ?? ((h: number) => window.cancelAnimationFrame(h));
  const now = host.now ?? (() => (typeof performance === "object" ? performance.now() : Date.now()));

  /** The whole text the door has produced so far, and its units. */
  let full = "";
  let target: string[] = [];
  /** How many of those units the reader has seen. */
  let shown = 0;
  /** Fractional carry, so a rate that is not a whole number of words a frame
   *  still averages out rather than rounding to zero and stalling. */
  let carry = 0;
  let last = 0;
  let handle: number | null = null;
  let closing = false;
  let dead = false;

  /* THE LAST EMIT IS THE DOOR'S OWN TEXT, byte for byte. Joining the units back
     up is a faithful reconstruction of everything but leading whitespace, and a
     remark must never be one character different from what the guards ran on. */
  const visible = () => (shown >= target.length ? full : target.slice(0, shown).join(""));

  const stop = () => {
    if (handle !== null) cancelRaf(handle);
    handle = null;
  };

  const tick = (t: number) => {
    handle = null;
    if (dead) return;
    const dt = Math.min(Math.max((t - last) / 1000, 0), 0.25);
    last = t;
    const behind = target.length - shown;
    carry += rateFor(behind) * dt;
    const take = Math.floor(carry);
    if (take > 0) {
      carry -= take;
      shown = Math.min(target.length, shown + take);
    }
    const done = closing && shown >= target.length;
    host.emit(visible(), done);
    if (!done) schedule();
  };

  const schedule = () => {
    if (dead || handle !== null) return;
    if (shown >= target.length && !closing) return;
    last = now();
    handle = raf(tick);
  };

  return {
    push(text: string) {
      if (dead) return;
      full = text;
      target = unitsOf(text);
      if (host.instant) {
        shown = target.length;
        host.emit(text, false);
        return;
      }
      schedule();
    },
    finish(text: string) {
      if (dead) return;
      full = text;
      target = unitsOf(text);
      closing = true;
      if (host.instant) {
        shown = target.length;
        host.emit(text, true);
        return;
      }
      schedule();
    },
    cancel() {
      dead = true;
      stop();
    },
  };
}
