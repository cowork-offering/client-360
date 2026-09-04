/* =============================================================================
   THE FRAME SENSOR. The page notices it is drowning, and gets out of the way.

   FOUNDER, 2026-09-04: "when I share via video there is latency, stuff gets
   delayed, the system seems to overload; stabilise it so it runs super smooth,
   in all instances."

   THE MACHINE IS NOT THE SAME MACHINE DURING A SHARE. A screen share hands a
   core to the encoder and takes the compositor's headroom with it, so the
   cockpit that was glass on the founder's desk is syrup on the call. Nothing
   about the page changed; the budget did. Since the budget is the thing that
   moved, the page is what has to move with it.

   SO THE PAGE MEASURES ITSELF. One rAF loop, frame deltas into a one-second
   window, the 95th percentile of each window against a threshold. Two
   consecutive bad seconds and the cockpit drops to CALM: the same surfaces, the
   same layout, no bend, half the blur, and every decorative loop stopped.

   TWO SECONDS, NOT ONE, AND NOT FIVE. One second trips on the entry
   choreography, which is EXPECTED to be expensive and is over before anyone
   could act on it. Five seconds is long enough for the founder to have said the
   word "laggy" out loud. Two is the shortest window that cannot be tripped by a
   single beat of intentional motion.

   28ms IS A FRAME AND A HALF. At 60Hz a frame is 16.7ms; a p95 past 28ms means
   one frame in twenty is missing a vsync, which is the point at which a pointer
   starts to feel attached to something other than the hand.

   IT ONLY EVER GOES ONE WAY. There is no exit from calm, and that is deliberate:
   a page that oscillated between materials while the founder talked over it
   would be worse than either material. Calm lasts the session; the palette is
   the way back.

   NOTHING HERE READS LAYOUT, queries an element or touches a style. A sensor
   that forced a reflow every frame would be the jank it exists to detect.
   ============================================================================= */

/** A frame and a half at 60Hz. Past this the pointer stops feeling attached. */
export const CALM_P95_MS = 28;

/** How much frame time makes a window worth judging. */
export const CALM_WINDOW_MS = 1000;

/** Bad windows in a row before the material changes. */
export const CALM_CONSECUTIVE = 2;

export interface CalmDetectorOptions {
  thresholdMs?: number;
  windowMs?: number;
  consecutive?: number;
}

export interface CalmDetector {
  /**
   * Feed one frame's duration.
   *
   * @returns true EXACTLY ONCE, on the frame that closes the last bad window.
   *          Every call after that returns false: the decision is made.
   */
  push: (deltaMs: number) => boolean;
  /** For the suite: how many bad windows are standing. */
  streak: () => number;
}

/** The 95th percentile of a window, by nearest rank. A window of one frame is
 *  that frame, which is what makes a coarse test readable. */
export function p95(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1))];
}

/**
 * THE DECISION, WITH NO CLOCK AND NO DOM.
 *
 * Split out from the loop below so the rule can be tested as a rule: at the
 * threshold nothing happens, past it for one window nothing happens, past it
 * for two and the page changes material.
 */
export function createCalmDetector(options: CalmDetectorOptions = {}): CalmDetector {
  const thresholdMs = options.thresholdMs ?? CALM_P95_MS;
  const windowMs = options.windowMs ?? CALM_WINDOW_MS;
  const consecutive = options.consecutive ?? CALM_CONSECUTIVE;

  let window: number[] = [];
  let elapsed = 0;
  let streak = 0;
  let decided = false;

  return {
    streak: () => streak,
    push(deltaMs) {
      if (decided) return false;
      /* A FRAME THE PAGE DID NOT SPEND IS NOT A SLOW FRAME. A backgrounded tab,
         a paused debugger or a machine coming out of sleep hands back one
         enormous delta that says nothing about how the cockpit renders. It is
         dropped rather than counted, and it closes no window. */
      if (deltaMs > 4 * windowMs) {
        window = [];
        elapsed = 0;
        return false;
      }
      window.push(deltaMs);
      elapsed += deltaMs;
      if (elapsed < windowMs) return false;

      const bad = p95(window) > thresholdMs;
      window = [];
      elapsed = 0;
      streak = bad ? streak + 1 : 0;
      if (streak < consecutive) return false;
      decided = true;
      return true;
    },
  };
}

export interface CalmSensorHost {
  raf?: (cb: (t: number) => void) => number;
  cancelRaf?: (handle: number) => void;
  /** Called once, on the frame the page decides it cannot hold the glass. */
  onCalm: () => void;
  detector?: CalmDetectorOptions;
}

/**
 * Run the sensor. Returns the stop, which is idempotent.
 *
 * OFF WHERE THERE IS NO rAF (jsdom, SSR): a sensor that cannot see a frame has
 * nothing to say, and every unit test takes that path.
 */
export function startCalmSensor(host: CalmSensorHost): () => void {
  const raf = host.raf ?? (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
  const cancel = host.cancelRaf ?? (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
  if (!raf || !cancel) return () => {};

  const detector = createCalmDetector(host.detector);
  let handle = 0;
  let last: number | null = null;
  let stopped = false;

  const frame = (ts: number) => {
    if (stopped) return;
    if (last !== null && detector.push(ts - last)) {
      stopped = true;
      host.onCalm();
      return;
    }
    last = ts;
    handle = raf(frame);
  };
  handle = raf(frame);

  return () => {
    if (stopped) return;
    stopped = true;
    cancel(handle);
  };
}
