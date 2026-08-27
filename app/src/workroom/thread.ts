/* =============================================================================
   THE WINDOWED THREAD (law 5, in rules).

   The conversation never scrolls. It fits its pane by relaxing and tightening
   in BOTH directions: clamp prose first, then fold settled turns behind a
   chevron line, and give the space back the moment a confirm collapses a chip
   into a receipt. Nothing is lost — a clamped bubble and a folded turn both
   open in full as a peek.

   TWO RULES THE PASS MAY NEVER BREAK:
     1. a block holding a LIVE GATE (an unconfirmed chip, an unacknowledged
        check) is never folded away, and
     2. at least one settled block stays visible, so the thread never empties
        itself into the fold line.

   The pass recomputes from nothing every time rather than adjusting the state
   it is in. Relaxing and then tightening from the current state gives the same
   answer and can drift; recomputing cannot.
   ============================================================================= */

/** 0 unclamped, then three lines, then two. The mock's ladder exactly. */
export type ClampLevel = 0 | 3 | 2;

export interface FitBlock {
  id: string;
  /** True while something in this block is still waiting on the banker. */
  live: boolean;
  /** Prose bubbles that may clamp, oldest first. A challenge message never
   *  appears here: its verdict and its acknowledge button are a live gate. */
  clampable: string[];
}

export interface FitState {
  /** Block ids, oldest first. */
  folded: string[];
  /** Bubble id to clamp level. Absent means unclamped. */
  clamped: Record<string, ClampLevel>;
}

/** How much the thread overflows its pane under a candidate state, in pixels.
 *  Zero or less fits. The component measures the real DOM; a test measures a
 *  model. */
export type Measure = (state: FitState) => number;

export const EMPTY_FIT: FitState = { folded: [], clamped: {} };

/** The guard exists because a measure that never shrinks would otherwise spin.
 *  Forty is well past the number of moves a full storyline can need. */
const MAX_PASSES = 40;

export function fitThread(blocks: FitBlock[], measure: Measure): FitState {
  const state: FitState = { folded: [], clamped: {} };
  if (measure(state) <= 0) return state;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (measure(state) <= 0) return state;

    // 1. Clamp the oldest prose that can still give a line.
    const visible = blocks.filter((b) => !state.folded.includes(b.id));
    let clamped = false;
    for (const block of visible) {
      for (const bubble of block.clampable) {
        const level = state.clamped[bubble] ?? 0;
        if (level === 2) continue;
        state.clamped[bubble] = level === 0 ? 3 : 2;
        clamped = true;
        break;
      }
      if (clamped) break;
    }
    if (clamped) continue;

    // 2. Fold the oldest settled block, and never the last one standing.
    const foldable = visible.filter((b) => !b.live);
    if (foldable.length <= 1) return state;
    state.folded.push(foldable[0].id);
  }
  return state;
}

/** The fold line's own label. It is a count of turns, not of blocks, because a
 *  block is an implementation detail and a turn is what the banker remembers. */
export function foldLabel(count: number): string {
  return `${count} ${count === 1 ? "earlier turn" : "earlier turns"}`;
}
