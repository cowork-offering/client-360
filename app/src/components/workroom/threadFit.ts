import type { FitBlock, FitState, Measure } from "../../workroom/thread";

/* =============================================================================
   THE FIT PASS, MEASURED.

   `workroom/thread.ts` owns the RULES and knows nothing about the DOM. This
   owns the MEASUREMENT and knows nothing about the rules. The pass asks "how
   far does the thread overflow under this candidate state" and gets an answer
   in pixels.

   TWO THINGS THIS FILE EXISTS TO GET RIGHT.

   1. THE CACHE. A folded turn is not in the tree, so it cannot be measured —
      and a pass that can only measure what is already visible can only ever
      tighten. It folds a turn, the turn leaves the DOM, the next pass no longer
      sees it, and the fold either sticks forever or is silently dropped and the
      thread overruns its pane. So every block's height is remembered the first
      time it is seen, and the pass reasons over ALL of them. That is what lets
      the thread relax as well as tighten.

   2. ARITHMETIC, NOT REHEARSAL. Heights are read once per pass and a clamp's
      effect is computed rather than applied. Applying candidate classes and
      re-measuring inside the loop costs a layout per attempt.
   ============================================================================= */

/** `gap: 9px` on `.wk-thread`. */
const GAP = 9;

/** `.wk-bub.wk-c3` and `.wk-bub.wk-c2` max-heights, border-box. */
const CLAMP_HEIGHT: Record<number, number> = { 3: 78, 2: 58 };

/** What the fold line takes when there is anything folded. One line of 10.5px
 *  caps at 2px padding; reserving it is cheaper than measuring an element that
 *  is not in the tree when the count is zero. */
const FOLD_LINE = 20;

/**
 * THE PASS ERRS TIGHT, BY MORE THAN A PIXEL.
 *
 * Arithmetic over cached heights lands a few pixels under what the browser
 * lays out — sub-pixel line boxes, and a bubble whose unclamped height is
 * derived rather than measured. A thread ten pixels under its pane reads
 * identically to one exactly on it. A thread a few pixels over cuts the bottom
 * off the newest turn, which is the one the banker is reading. The slack is
 * paid in the rare turn folded one beat early; the alternative is a clipped
 * sentence, and law 5 does not trade that way.
 */
const GUARD = 10;

interface BubbleMetric {
  id: string;
  current: number;
  full: number;
}

export interface BlockMetric {
  height: number;
  bubbles: BubbleMetric[];
}

/** Block id to its last measured metrics. Lives across passes, in a ref. */
export type FitCache = Map<string, BlockMetric>;

/**
 * Read every block currently in the tree into the cache and return the pane's
 * capacity, or null while the pane has no height yet (first paint, or a
 * detached tree in a test).
 */
export function readMetrics(thread: HTMLElement | null, cache: FitCache): number | null {
  if (!thread) return null;
  const capacity = thread.clientHeight;
  if (!capacity) return null;
  for (const el of thread.querySelectorAll<HTMLElement>("[data-block]")) {
    const id = el.dataset.block;
    if (!id) continue;
    cache.set(id, {
      // FRACTIONAL, ALWAYS. `offsetHeight` rounds to whole pixels, and over a
      // handful of blocks that rounding under-reports the thread by enough for
      // the pass to call it fitted while the browser clips a turn.
      height: el.getBoundingClientRect().height,
      bubbles: [...el.querySelectorAll<HTMLElement>("[data-bubble]")].map((b) => ({
        id: b.dataset.bubble ?? "",
        current: b.getBoundingClientRect().height,
        // scrollHeight is the padding box; offsetHeight - clientHeight is the
        // border. Together they are the height the bubble would take unclamped.
        full: b.scrollHeight + (b.offsetHeight - b.clientHeight),
      })),
    });
  }
  return capacity;
}

/**
 * WHAT THE BROWSER SAYS, after the pass has had its turn.
 *
 * The arithmetic above is a model, and a model can be a few pixels out: a
 * sub-pixel line box, a bubble whose unclamped height is derived rather than
 * measured, a descendant that sits a little outside the box it is in. This asks
 * the laid-out tree directly — how far below the pane does anything reach — so
 * the shell can take one more step when the model says fitted and the pane says
 * otherwise. Positive means something is being cut off.
 */
export function realOverflow(thread: HTMLElement): number {
  const pane = thread.getBoundingClientRect();
  let lowest = pane.top;
  for (const el of thread.querySelectorAll<HTMLElement>("*")) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) lowest = Math.max(lowest, r.bottom);
  }
  return Math.max(thread.scrollHeight - thread.clientHeight, lowest - pane.bottom);
}

/** A measure over the cached metrics for exactly these blocks, in this order. */
export function measureWith(cache: FitCache, blocks: FitBlock[], capacity: number): Measure {
  return (state: FitState) => {
    let total = 0;
    let shown = 0;
    for (const block of blocks) {
      if (state.folded.includes(block.id)) continue;
      const metric = cache.get(block.id);
      if (!metric) continue;
      total += metric.bubbles.reduce((h, b) => {
        const level = state.clamped[b.id] ?? 0;
        const target = level === 0 ? b.full : Math.min(b.full, CLAMP_HEIGHT[level]);
        return h + (target - b.current);
      }, metric.height);
      shown++;
    }
    total += Math.max(0, shown - 1) * GAP;
    if (state.folded.length) total += FOLD_LINE + GAP;
    return total - (capacity - GUARD);
  };
}
