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
        {/* PANES, BAR, RAIL, GREETING. The big surfaces, where there is enough
            area for a slow bend to read as thickness. */}
        <filter
          id="eg-refract"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves={2} seed={7} result="egNoise" />
          <feGaussianBlur in="egNoise" stdDeviation="2.4" result="egNoiseSoft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="egNoiseSoft"
            scale={30}
            xChannelSelector="R"
            yChannelSelector="G"
            result="egBent"
          />
          <feComposite in="egBent" in2="SourceGraphic" operator="over" />
        </filter>

        {/* CHIPS AND SATELLITES. A small piece of glass is a thinner piece of
            glass: the same noise at a shorter wavelength and a third of the
            throw, so a 34px pill wobbles instead of melting. */}
        <filter
          id="eg-refract-soft"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={2} seed={7} result="egNoiseS" />
          <feGaussianBlur in="egNoiseS" stdDeviation="1.8" result="egNoiseSoftS" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="egNoiseSoftS"
            scale={12}
            xChannelSelector="R"
            yChannelSelector="G"
            result="egBentS"
          />
          <feComposite in="egBentS" in2="SourceGraphic" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
