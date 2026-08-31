import { useEffect, useMemo, useRef } from "react";
import { prefersReducedMotion } from "../data/motion";
import { buildThreads, WEAVE_VIEWBOX } from "../data/weave";

/* =============================================================================
   THE LANDING WEAVE — DIRECTION-LOCKED rule 66 (post-freeze addendum).

   The band behind the briefing: twelve violet filaments, each on its own slow
   sine, z0 behind the page and pointer-events none so the worklist stays
   clickable straight through it. The threads themselves are generated in
   data/weave.ts from the dummy's seed; what lives here is the surface they hang
   on and the one rAF loop that breathes them.

   Landing only, and dead under prefers-reduced-motion: CSS can switch off an
   animation, but nothing in CSS stops a rAF loop, so the loop refuses to start.
   ============================================================================= */

export function Weave() {
  const threads = useMemo(buildThreads, []);
  const groups = useRef<Array<SVGGElement | null>>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    let t0: number | null = null;
    let clk = 0;
    const frame = (ts: number) => {
      if (t0 == null) t0 = ts || 0;
      const dt = Math.min(64, (ts || 0) - t0);
      t0 = ts || 0;
      clk += dt * 0.001;
      for (let j = 0; j < threads.length; j++) {
        const g = groups.current[j];
        if (!g) continue;
        const th = threads[j];
        const dy = Math.sin(clk * th.freq * Math.PI * 2 + th.phase) * th.amp;
        const dx = Math.cos(clk * th.freq * Math.PI * 1.4 + th.phase * 0.7) * th.ax;
        g.setAttribute("transform", "translate(" + dx.toFixed(2) + " " + dy.toFixed(2) + ")");
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [threads]);

  return (
    <div className="weave" aria-hidden="true">
      <svg id="hweave" viewBox={WEAVE_VIEWBOX} preserveAspectRatio="none">
        <g id="hweaveG">
          {threads.map((t, i) => (
            <g
              key={i}
              ref={(el) => {
                groups.current[i] = el;
              }}
            >
              <path d={t.d} stroke={t.stroke} strokeWidth={t.width} opacity={t.opacity} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
