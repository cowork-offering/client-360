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
            edge, which is why the ON pass reads as a texture rather than as a
            thickness.

            The rim mask is built INSIDE the filter, so it stretches to whatever
            element takes it and nothing has to know its own shape: erode the
            source alpha (a backdrop-filter's source is opaque across the
            element box, so eroding it inwards leaves the core), soften it, and
            subtract it from the alpha again. What is left is a soft ring the
            width of the erode radius.

            The heavy throw is then composited THROUGH that ring and dropped
            over the lightly-bent centre, which is how the scale gets to be 56
            at the edge and 10 in the middle without feDisplacementMap ever
            having to take a per-pixel scale, which it cannot.

            CHROMATIC ABERRATION is the same displacement run three times at
            three scales on three isolated channels, screen-blended back
            together. Where the three land on top of each other the colour
            reconstructs exactly; where the throw is large they separate, so the
            fringe appears only where the bend is strong, which is only at the
            rim. That is the physics and it is also the cheap way.

            TWO COMPOSITES CLOSE IT, not one. The centre pass can smear its own
            10px of transparent edge before the ring is ever applied, so the
            result goes over the lightly-bent image AND then over the untouched
            source. Corners stay corners. */}
        <filter
          id="eg-liquid"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          {/* life: a small bend everywhere, so the middle is glass and not a window */}
          <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves={2} seed={7} result="lqN" />
          <feGaussianBlur in="lqN" stdDeviation="3" result="lqNs" />
          <feDisplacementMap in="SourceGraphic" in2="lqNs" scale={10} xChannelSelector="R" yChannelSelector="G" result="lqBase" />

          {/* the rim field: longer wavelength, far bigger throw */}
          <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves={2} seed={11} result="lqE" />
          <feGaussianBlur in="lqE" stdDeviation="4" result="lqEs" />

          {/* split, throw each channel a different distance, screen back together */}
          <feColorMatrix in="lqBase" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="lqR" />
          <feColorMatrix in="lqBase" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="lqG" />
          <feColorMatrix in="lqBase" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="lqB" />
          <feDisplacementMap in="lqR" in2="lqEs" scale={64} xChannelSelector="R" yChannelSelector="G" result="lqRd" />
          <feDisplacementMap in="lqG" in2="lqEs" scale={56} xChannelSelector="R" yChannelSelector="G" result="lqGd" />
          <feDisplacementMap in="lqB" in2="lqEs" scale={48} xChannelSelector="R" yChannelSelector="G" result="lqBd" />
          <feBlend in="lqRd" in2="lqGd" mode="screen" result="lqRG" />
          <feBlend in="lqRG" in2="lqBd" mode="screen" result="lqHeavy" />

          {/* the ring, built from the element's own alpha */}
          <feMorphology in="SourceAlpha" operator="erode" radius={18} result="lqCore" />
          <feGaussianBlur in="lqCore" stdDeviation="9" result="lqCoreSoft" />
          <feComposite in="SourceAlpha" in2="lqCoreSoft" operator="out" result="lqRim" />

          <feComposite in="lqHeavy" in2="lqRim" operator="in" result="lqRimBent" />
          <feComposite in="lqRimBent" in2="lqBase" operator="over" result="lqJoined" />
          <feComposite in="lqJoined" in2="SourceGraphic" operator="over" />
        </filter>

        {/* THE SAME LENS AT CHIP SCALE. A 34px pill has no room for an 18px
            ring or a 56px throw: both are scaled to the geometry, the erode to
            6 and the rim throw to a third, or the pill stops being a pill. */}
        <filter
          id="eg-liquid-soft"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves={2} seed={7} result="lsN" />
          <feGaussianBlur in="lsN" stdDeviation="2" result="lsNs" />
          <feDisplacementMap in="SourceGraphic" in2="lsNs" scale={6} xChannelSelector="R" yChannelSelector="G" result="lsBase" />

          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves={2} seed={11} result="lsE" />
          <feGaussianBlur in="lsE" stdDeviation="2.5" result="lsEs" />

          <feColorMatrix in="lsBase" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="lsR" />
          <feColorMatrix in="lsBase" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="lsG" />
          <feColorMatrix in="lsBase" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="lsB" />
          <feDisplacementMap in="lsR" in2="lsEs" scale={26} xChannelSelector="R" yChannelSelector="G" result="lsRd" />
          <feDisplacementMap in="lsG" in2="lsEs" scale={22} xChannelSelector="R" yChannelSelector="G" result="lsGd" />
          <feDisplacementMap in="lsB" in2="lsEs" scale={18} xChannelSelector="R" yChannelSelector="G" result="lsBd" />
          <feBlend in="lsRd" in2="lsGd" mode="screen" result="lsRG" />
          <feBlend in="lsRG" in2="lsBd" mode="screen" result="lsHeavy" />

          <feMorphology in="SourceAlpha" operator="erode" radius={6} result="lsCore" />
          <feGaussianBlur in="lsCore" stdDeviation="3" result="lsCoreSoft" />
          <feComposite in="SourceAlpha" in2="lsCoreSoft" operator="out" result="lsRim" />

          <feComposite in="lsHeavy" in2="lsRim" operator="in" result="lsRimBent" />
          <feComposite in="lsRimBent" in2="lsBase" operator="over" result="lsJoined" />
          <feComposite in="lsJoined" in2="SourceGraphic" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
