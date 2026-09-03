/* =============================================================================
   REFRACTIVE GLASS — THE FILTER SHEET.

   Blur AVERAGES the pixels behind a panel. Real glass BENDS them. This sheet is
   the bend: a fractal-noise field, smoothed so it reads as a wobble rather than
   as grain, driving a displacement map over the backdrop. It is fed into
   backdrop-filter ahead of the blur (electric-glass.css, the eg-refract block),
   so the backdrop is bent while it is still sharp and only then softened.

   MOUNTED ONCE, AT THE APP ROOT. A url() filter reference resolves inside the
   SAME document, and the shipped cockpit is one self-contained HTML file, so
   the sheet has to live in the tree that React renders rather than in a
   separate asset. The two ids are global; nothing else in the app may take
   them.

   THE FRINGE FIX IS THE LAST PRIMITIVE. Displacement samples OUTSIDE the
   backdrop image, and outside it there is transparent black, which shows up as
   a smeared or see-through band along the edges and in the rounded corners.
   Compositing the displaced result back OVER the undisplaced source fills
   exactly those pixels with the original backdrop. It is geometry-independent,
   so it works for a 999px pill and a 22px pane without either one knowing.

   SEEDS ARE FIXED. An unseeded feTurbulence is still deterministic, but pinning
   it makes the screenshot comparison reproducible run to run.
   ============================================================================= */
export function GlassFilters() {
  return (
    <svg
      className="c360-filter-sheet"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/* PANES, BAR, RAIL. The big surfaces, where there is enough area for a
            slow bend to read as thickness. TUNED BY EYE against the top bar
            with the landing headline sliding under it, which is the highest
            contrast backdrop in the app: 0.009 at scale 30 wobbles the
            individual letterforms, which reads as a texture; 0.006 at scale 36
            slides the whole word, which reads as a slab. Longer wavelength,
            larger throw, fewer visible events. */}
        <filter
          id="eg-refract"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves={2} seed={7} result="egNoise" />
          <feGaussianBlur in="egNoise" stdDeviation="3" result="egNoiseSoft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="egNoiseSoft"
            scale={36}
            xChannelSelector="R"
            yChannelSelector="G"
            result="egBent"
          />
          <feComposite in="egBent" in2="SourceGraphic" operator="over" />
        </filter>

        {/* CHIPS AND SATELLITES. A small piece of glass is a thinner piece of
            glass: a shorter wavelength and 40% of the throw, so a 34px pill
            bends instead of melting. The throw came up from 14 to 22 on
            2026-09-03: at 14 the chips measured a mean 0.02/255 against the
            ground, which is not a bend, it is a rounding error. 22 is the
            most the 34px pill takes before its corners start to travel. */}
        <filter
          id="eg-refract-soft"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves={2} seed={7} result="egNoiseS" />
          <feGaussianBlur in="egNoiseS" stdDeviation="2" result="egNoiseSoftS" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="egNoiseSoftS"
            scale={22}
            xChannelSelector="R"
            yChannelSelector="G"
            result="egBentS"
          />
          <feComposite in="egBentS" in2="SourceGraphic" operator="over" />
        </filter>

        {/* ====================================================== LIQUID
            THE EDGE LENS. Real glass does almost nothing in the middle of a
            pane and everything at the rim, where the surface curves away and
            the light has the furthest to travel through it. A uniform
            turbulence field is the opposite of that: the same wobble edge to
            edge, which is why the subtle pass reads as a texture rather than as
            a thickness.

            The rim mask is built INSIDE the filter, so it stretches to whatever
            element takes it and nothing has to know its own shape: blur the
            source alpha, then subtract the blurred copy from the sharp one.
            What is left is a soft ring, zero in the interior, about a half at
            the border, zero outside.

            THE LEAN PASS, AND WHAT IT COST. Chromium rasterises this filter on
            the CPU, per backdrop pixel, on every change to the backdrop, so
            every primitive here is paid for over the whole filter region on
            every frame that touches the surface. Three things came out:

              THE CHROMATIC SPLIT IS GONE. It was three isolated channels at
              three throws, then two, and it is now one displacement of the
              whole image. Each channel was a full-region resampling pass for a
              fringe that only ever appeared in the outer few pixels of a rim.
              It is the single most expensive thing that was ever in here per
              unit of anything anyone could see.

              numOctaves 1, NOT 2. A second octave doubles the turbulence work
              for detail at half the wavelength, and the field is smoothed by a
              blur immediately afterwards anyway. The blur came down with it,
              because there is less high-frequency noise left to remove.

              THE REGION IS AS TIGHT AS THE CORNERS ALLOW. It was -10% / 120%,
              which on a full-viewport pane is a third more pixels than the pane
              has. The throw is 56 and the mask is 10, so 4 percent of a 1330px
              pane (about 53px) is the margin the displaced edge can actually
              reach; the small filter keeps 8 percent because 8 percent of a
              40px satellite is only 3px. Both were checked at 2x on all four
              corners of the pane and on the arc.

            TWO COMPOSITES CLOSE IT, not one. The centre pass can smear its own
            10px of transparent edge before the ring is ever applied, so the
            result goes over the lightly-bent image AND then over the untouched
            source. Corners stay corners. */}
        <filter
          id="eg-liquid"
          x="-4%"
          y="-4%"
          width="108%"
          height="108%"
          colorInterpolationFilters="sRGB"
        >
          {/* life: a small bend everywhere, so the middle is glass and not a window */}
          <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves={1} seed={7} result="lqN" />
          <feGaussianBlur in="lqN" stdDeviation="2" result="lqNs" />
          <feDisplacementMap in="SourceGraphic" in2="lqNs" scale={10} xChannelSelector="R" yChannelSelector="G" result="lqBase" />

          {/* the rim field: longer wavelength, far bigger throw, ONE pass */}
          <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves={1} seed={11} result="lqE" />
          <feGaussianBlur in="lqE" stdDeviation="2.5" result="lqEs" />
          <feDisplacementMap in="lqBase" in2="lqEs" scale={56} xChannelSelector="R" yChannelSelector="G" result="lqHeavy" />

          {/* the ring, built from the element's own alpha */}
          <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="lqCoreSoft" />
          <feComposite in="SourceAlpha" in2="lqCoreSoft" operator="out" result="lqRim" />

          <feComposite in="lqHeavy" in2="lqRim" operator="in" result="lqRimBent" />
          <feComposite in="lqRimBent" in2="lqBase" operator="over" result="lqJoined" />
          <feComposite in="lqJoined" in2="SourceGraphic" operator="over" />
        </filter>

        {/* THE SAME LENS AT CHIP SCALE. A 40px satellite has no room for a 10px
            ring or a 56px throw: both are scaled to the geometry, or the pill
            stops being a pill. Its region stays at 8 percent because 8 percent
            of 40px is three pixels. */}
        <filter
          id="eg-liquid-soft"
          x="-8%"
          y="-8%"
          width="116%"
          height="116%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves={1} seed={7} result="lsN" />
          <feGaussianBlur in="lsN" stdDeviation="1.5" result="lsNs" />
          <feDisplacementMap in="SourceGraphic" in2="lsNs" scale={6} xChannelSelector="R" yChannelSelector="G" result="lsBase" />

          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves={1} seed={11} result="lsE" />
          <feGaussianBlur in="lsE" stdDeviation="1.8" result="lsEs" />
          <feDisplacementMap in="lsBase" in2="lsEs" scale={22} xChannelSelector="R" yChannelSelector="G" result="lsHeavy" />

          <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="lsCoreSoft" />
          <feComposite in="SourceAlpha" in2="lsCoreSoft" operator="out" result="lsRim" />

          <feComposite in="lsHeavy" in2="lsRim" operator="in" result="lsRimBent" />
          <feComposite in="lsRimBent" in2="lsBase" operator="over" result="lsJoined" />
          <feComposite in="lsJoined" in2="SourceGraphic" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
