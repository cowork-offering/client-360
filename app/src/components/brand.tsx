/* =============================================================================
   THE ACCENTURE MARK, TYPOGRAPHIC — and the ">" that carries every loading,
   stepping and arrival moment in this app.

   FOUNDER DIRECTIVE (Banksy deck studio, restated 2026-08-27): the mark is a
   lowercase wordmark with a bold ">" kerned tight onto it. It is NOT a drawn
   stroke chevron, and neither is any progress motif built from it. The earlier
   SVG rendition here traced a placeholder asset that declared itself an
   approximation, pinned its glyph run to a generic `sans-serif` so the drawn
   caret would stay over the "t", and still drifted on any host — a drawn mark
   solving a problem the typographic mark does not have. It is gone.

   ONE implementation, used by the cockpit nav, the app boot, the profile
   watermark and the workroom. The choreography lives in styles/tokens.css
   under `.c360-glyph` / `.c360-beat`; the `wk-` classes are the workroom's
   contextual hooks and carry no base styling of their own.
   ============================================================================= */

/** The negative margin that kerns the ">" onto the wordmark. The founder gave
 *  three points on this curve; beyond them it stays proportional rather than
 *  flattening out, because the kern is an optical fraction of the glyph. */
function kern(size: number): number {
  if (size <= 10) return -3;
  if (size <= 13) return -4;
  if (size <= 14) return -5;
  return Math.round(size * -0.36);
}

/** The full lockup: `accenture` + the brand ">". */
export function BrandLockup({ size = 13.5, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`c360-lockup ${className}`} style={{ fontSize: size }} aria-label="accenture">
      <span className="c360-lockup-word" style={{ fontSize: size }} aria-hidden="true">
        accenture
      </span>
      <span
        className="c360-lockup-mark"
        style={{ fontSize: size, marginLeft: kern(size) }}
        aria-hidden="true"
      >
        &gt;
      </span>
    </span>
  );
}

/** The ">" alone: the app's load, step, fold and arrival motif. Size comes from
 *  the context it sits in, so it inherits rather than declares.
 *
 *  DECORATION BY DEFAULT, BRAND ON REQUEST. Everywhere the glyph is a loading
 *  beat or a step marker it is noise to a screen reader and stays aria-hidden.
 *  In the app header it is not decoration — rule 45 retired the wordmark and
 *  left the mark ALONE carrying the brand, so there it takes `label` and
 *  announces itself as the mark it is. */
export function BrandGlyph({ className = "", label }: { className?: string; label?: string }) {
  return (
    <span
      className={`c360-glyph ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const })}
    >
      &gt;
    </span>
  );
}

/** The ">" oversized behind profile chrome. The same glyph as everywhere else,
 *  set large and faint — never a second, drawn rendition of the same shape.
 *  A SOLID glyph carries far more ink than the 3.2-unit stroke it replaced, so
 *  it runs at a lower opacity and exits the top-right corner rather than
 *  finishing inside the header. */
export function AccentureCaretWatermark() {
  return (
    <span
      aria-hidden="true"
      className="c360-glyph"
      style={{
        position: "absolute",
        right: -26,
        top: -62,
        fontSize: 230,
        lineHeight: 1,
        opacity: 0.035,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      &gt;
    </span>
  );
}

/** Cinematic ambient wash for the profile header (A25.2): two very low-opacity
 *  accent blooms drifting on a >20s cycle. Transform/opacity only (GPU-cheap),
 *  no external assets, no canvas. tokens.css neutralises the animation under
 *  prefers-reduced-motion, leaving a static wash. */
export function AmbientWash() {
  return (
    <div aria-hidden="true" className="c360-ambient">
      <span className="c360-ambient-a" />
      <span className="c360-ambient-b" />
    </div>
  );
}
