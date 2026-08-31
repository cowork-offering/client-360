/* =============================================================================
   THE LANDING WEAVE, GENERATED — DIRECTION-LOCKED rule 66 (post-freeze addendum).

   Twelve seeded filament threads from the truist-brain hero, tuned all the way
   down for the Apple-light ground: a 380px band behind the briefing headline,
   double-fade-masked, reaching just past the KPI band's top edge. Violet family,
   the lead thread at .20 and the rest between .06 and .14, strokes .5-1.2px,
   each drifting on its own sine. Identity TEXTURE, like the hero watermark. It
   is the one sanctioned use of ambient violet linework, and it is emphatically
   not a spine.

   THE RNG IS THE SHAPE. This is a transcription of the dummy's generator, not a
   re-derivation: the same seed, the same LCG, and — the part that actually
   matters — the same NUMBER and ORDER of draws per thread. Move one rnd() call
   and every thread after it lands somewhere else, so the port would render a
   different picture from the frozen mint while passing every count-shaped
   probe. The draw order below is therefore load-bearing and is commented as
   such; read it against the dummy before touching it.

   It lives in the data layer, not beside the component, because it is pure
   geometry over a seed: no React, no DOM, and the numbers in it (a 1.1px lead
   stroke, a 380-unit band) are curve data rather than anything anyone decides.
   ============================================================================= */


const VW = 1000;
const VH = 380;
const N = 12;
const SEED = 20260831;

const DEEP = "#5B2D90";
const MID = "#7B3FB0";
const CORE = "#A100FF";

/** The band's own coordinate space. `preserveAspectRatio="none"` stretches it
 *  across whatever width the landing is, which is why the threads read the same
 *  at 1360 and at 1024. */
export const WEAVE_VIEWBOX = `0 0 ${VW} ${VH}`;

export interface Thread {
  d: string;
  stroke: string;
  width: string;
  opacity: string;
  amp: number;
  ax: number;
  freq: number;
  phase: number;
}

export function buildThreads(): Thread[] {
  let s = SEED;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  /* Two draws (y0, y4) live INSIDE the path builder, between the stroke draws
     and the drift draws. That position is part of the sequence. */
  const pathFor = (y: number, k: number) => {
    const x1 = VW * 0.3;
    const y1 = y + Math.sin(k * 1.7) * 46 - 12;
    const x2 = VW * 0.58;
    const y2 = y + Math.sin(k * 2.3 + 1.1) * 56;
    const x3 = VW * 0.82;
    const y3 = y + Math.sin(k * 1.3 + 2.0) * 40;
    const y0 = y + (rnd() * 2 - 1) * 26;
    const y4 = y + (rnd() * 2 - 1) * 30;
    return (
      "M -40 " +
      y0.toFixed(1) +
      " C " + x1 + " " + (((y0 + y1) / 2) | 0) + " " + x1 + " " + y1.toFixed(1) +
      " " + (((x1 + x2) / 2) | 0) + " " + (((y1 + y2) / 2) | 0) +
      " S " + x2 + " " + y2.toFixed(1) + " " + (((x2 + x3) / 2) | 0) + " " + (((y2 + y3) / 2) | 0) +
      " S " + x3 + " " + y3.toFixed(1) + " " + (VW + 40) + " " + y4.toFixed(1)
    );
  };

  const out: Thread[] = [];
  for (let i = 0; i < N; i++) {
    const k = i * 0.9 + rnd() * 0.4;
    const y = 50 + (i / (N - 1)) * (VH - 100) + (rnd() * 2 - 1) * 12;
    const lead = i === 0;
    const r = rnd();
    let stroke: string;
    let op: number;
    let w: number;
    if (lead) {
      stroke = CORE;
      op = 0.2;
      w = 1.1;
    } else if (r < 0.4) {
      stroke = DEEP;
      op = 0.06 + rnd() * 0.05;
      w = 0.5 + rnd() * 0.5;
    } else if (r < 0.75) {
      stroke = MID;
      op = 0.07 + rnd() * 0.06;
      w = 0.5 + rnd() * 0.5;
    } else {
      stroke = CORE;
      op = 0.08 + rnd() * 0.06;
      w = 0.5 + rnd() * 0.5;
    }
    out.push({
      d: pathFor(y, k),
      stroke,
      width: w.toFixed(2),
      opacity: op.toFixed(3),
      amp: 4 + rnd() * 10,
      ax: 3 + rnd() * 7,
      freq: 0.05 + rnd() * 0.08,
      phase: rnd() * Math.PI * 2,
    });
  }
  return out;
}

