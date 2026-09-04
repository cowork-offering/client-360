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

   Landing first, and dead under prefers-reduced-motion: CSS can switch off an
   animation, but nothing in CSS stops a rAF loop, so the loop refuses to start.

   The className prop (founder, 2026-09-01) lets the client hero hang the SAME
   threads inside its glass as `.hero-weave` — one thread generator, one loop,
   two surfaces. The texture is identity; it is never redrawn per surface.
   ============================================================================= */

export function Weave({ className = "weave" }: { className?: string }) {
  const threads = useMemo(buildThreads, []);
  const groups = useRef<Array<SVGGElement | null>>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    let t0: number | null = null;
    let clk = 0;
    let parked = false;
    const frame = (ts: number) => {
      if (t0 == null) t0 = ts || 0;
      const dt = Math.min(64, (ts || 0) - t0);
      t0 = ts || 0;
      clk += dt * 0.001;
      /* THE WEAVE HOLDS STILL UNDER THE LENS (founder, 2026-09-03: input
         latency on liquid). The landing band sits directly beneath the top bar,
         which in liquid carries a url() reference filter, and Chromium
         rasterises those on the CPU every time the backdrop under them changes.
         Twelve threads breathing on rAF is a promise to re-rasterise the bar on
         every single frame, forever, on the thread the pointer lives on.

         AND IN CALM, WHICH HAS NO LENS AND STILL CANNOT AFFORD IT (founder,
         2026-09-04: "stabilise it so it runs super smooth"). Calm exists for a
         machine that has run out of budget; the bar still blurs its backdrop
         there, and a blur is re-rasterised on a moving backdrop exactly the way
         a bend is. Measured at 4x throttle on an idle landing, with everything
         else in this pass already in: 33.3ms with the band breathing, 16.7ms
         with it still. Calm was the SLOWEST material in the app until this line,
         which is the opposite of what it is for.

         The loop is not stopped, it stops WRITING: one classList read per frame
         costs nothing, the transforms are put back to identity once, and the
         moment the palette switches back to frost the breath resumes without
         anything having to be remounted. */
      const cls = document.documentElement.classList;
      if (cls.contains("eg-liquid") || cls.contains("eg-calm")) {
        if (!parked) {
          for (const g of groups.current) g?.setAttribute("transform", "translate(0 0)");
          parked = true;
        }
        raf = requestAnimationFrame(frame);
        return;
      }
      parked = false;
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
    <div className={className} aria-hidden="true">
      {/* The probe ids belong to the LANDING instance alone: a second surface
          reusing the threads must never present a duplicate #hweave to the
          probes (or the DOM). */}
      <svg id={className === "weave" ? "hweave" : undefined} viewBox={WEAVE_VIEWBOX} preserveAspectRatio="none">
        <g id={className === "weave" ? "hweaveG" : undefined}>
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
