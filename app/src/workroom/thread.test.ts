import { describe, expect, it } from "vitest";
import { fitThread, foldLabel, type FitBlock, type FitState } from "./thread";

/* =============================================================================
   THE THREAD FITS ITS PANE, AND NEVER SCROLLS.

   The measure here is a MODEL: each block has a natural height, each clampable
   bubble gives back what a clamp would save, and the pane has a capacity. That
   is the same arithmetic the DOM measure does, with the numbers chosen so each
   rule can be isolated.
   ============================================================================= */

const GAP = 9;
const CLAMP_SAVING: Record<number, number> = { 3: 22, 2: 44 };

/** A measure over a model. `height` is the block's natural height; a clamped
 *  bubble gives back a fixed saving at each level. */
function measureOver(blocks: (FitBlock & { height: number })[], capacity: number) {
  return (state: FitState) => {
    let total = 0;
    let shown = 0;
    for (const b of blocks) {
      if (state.folded.includes(b.id)) continue;
      const saved = b.clampable.reduce((s, bubble) => s + (CLAMP_SAVING[state.clamped[bubble] ?? 0] ?? 0), 0);
      total += b.height - saved;
      shown++;
    }
    total += Math.max(0, shown - 1) * GAP;
    if (state.folded.length) total += 20 + GAP;
    return total - capacity;
  };
}

const prose = (id: string, height: number): FitBlock & { height: number } => ({
  id,
  live: false,
  clampable: [`${id}-bub`],
  height,
});

const gate = (id: string, height: number): FitBlock & { height: number } => ({
  id,
  live: true,
  clampable: [],
  height,
});

describe("the windowed thread", () => {
  it("leaves the thread alone while it fits", () => {
    const blocks = [prose("a", 60), prose("b", 60)];
    expect(fitThread(blocks, measureOver(blocks, 400))).toEqual({ folded: [], clamped: {} });
  });

  it("clamps the oldest prose before it folds anything", () => {
    const blocks = [prose("a", 100), prose("b", 100)];
    const fit = fitThread(blocks, measureOver(blocks, 195));
    expect(fit.folded).toEqual([]);
    expect(fit.clamped).toEqual({ "a-bub": 3 });
  });

  it("tightens the same bubble to two lines before starting on the next", () => {
    const blocks = [prose("a", 100), prose("b", 100)];
    const fit = fitThread(blocks, measureOver(blocks, 170));
    expect(fit.clamped).toEqual({ "a-bub": 2 });
    expect(fit.folded).toEqual([]);
  });

  it("folds the oldest settled block once clamping has nothing left to give", () => {
    const blocks = [prose("a", 100), prose("b", 100), prose("c", 100)];
    const fit = fitThread(blocks, measureOver(blocks, 130));
    expect(fit.folded).toContain("a");
  });

  it("NEVER folds a block holding a live gate", () => {
    // The unconfirmed chip is the oldest block, and it is the one the pass must
    // leave alone even when folding it would be the cheapest move.
    const blocks = [gate("chips", 160), prose("b", 160), prose("c", 160)];
    const fit = fitThread(blocks, measureOver(blocks, 150));
    expect(fit.folded).not.toContain("chips");
    expect(fit.folded).toContain("b");
  });

  it("keeps at least one settled block visible rather than emptying the thread", () => {
    const blocks = [prose("a", 400), prose("b", 400)];
    const fit = fitThread(blocks, measureOver(blocks, 20));
    expect(fit.folded).toEqual(["a"]);
  });

  it("gives the space back the moment the thread gets shorter", () => {
    const tight = [prose("a", 100), prose("b", 100), prose("c", 100)];
    const folded = fitThread(tight, measureOver(tight, 130));
    expect(folded.folded).toContain("a");
    // A confirm collapses a chip into a receipt: the same blocks, less height.
    const relaxed = [prose("a", 100), prose("b", 100), prose("c", 20)];
    expect(fitThread(relaxed, measureOver(relaxed, 260)).folded).toEqual([]);
  });

  it("labels the fold line by turns", () => {
    expect(foldLabel(1)).toBe("1 earlier turn");
    expect(foldLabel(4)).toBe("4 earlier turns");
  });
});
