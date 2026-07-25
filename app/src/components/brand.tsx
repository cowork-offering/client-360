/* =============================================================================
   Accenture brand marks (SPEC §12 A24/A25).

   SOURCE NOTE: the engagement's shared asset
   (credit-memo-reinvented/credit-memo-agent/assets/accenture-logo.svg) declares
   itself a PLACEHOLDER traced approximation and says "SWAP FOR OFFICIAL". There
   is no official mark on disk, so this is a corrected rendition of that
   placeholder, not a verified reproduction. Two defects from the legacy version
   are fixed here (A25.1/A25.2):
     1. the ">" accent had only ~5 units of headroom and sat down in the
        wordmark's ascender band — it now clears the "t" with optical breathing
        room (viewBox extended upward rather than shrinking the wordmark);
     2. the accent used round caps/joins — the real Accenture ">" is SHARP, so
        caps/joins are now butt/miter.
   Both marks share ONE path geometry (ACCENT_PATH) so nav and watermark cannot
   drift apart.
   ============================================================================= */

/** The sharp ">" accent. Apex at x=114, centred over the wordmark's "t". */
const ACCENT_PATH = "M104 -4 L114 2 L104 8";

/** Shared stroke settings — sharp (miter/butt), never rounded. */
const ACCENT_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3.2,
  strokeLinecap: "butt",
  strokeLinejoin: "miter",
  strokeMiterlimit: 10,
} as const;

/* Wordmark metrics (F10). The mark must lay out IDENTICALLY on any host,
   including a sandbox with no webfonts. A bare <text> reflows to whatever font
   resolves, drifting the accent off the "t", so the run is pinned:
     - a generic `sans-serif` family (always resolvable, never a webfont), and
     - textLength + lengthAdjust, which force the run to occupy exactly
       WORDMARK_WIDTH whatever font the host actually uses.
   The "t" centre — and therefore the accent above it — is then deterministic.

   ACCEPTED LIMITATION (Codex round 3 — adjudicated NO ACTION): pinning the run
   makes LAYOUT deterministic, but the GLYPH SHAPES still come from whatever
   sans-serif the host resolves, so this remains an approximation of the
   Accenture wordmark rather than a faithful reproduction. That is not solvable
   with <text>.
   >>> OFFICIAL-ASSET SWAP SLOT — THIS IS THE REAL FIX <<<
   Obtain the official Accenture logo SVG from Accenture brand channels and
   replace the <text> run below with its traced path geometry. ACCENT_PATH and
   the viewBox stay as-is; only the wordmark run changes. */
const WORDMARK_X = 2;
const WORDMARK_BASELINE = 38;
const WORDMARK_WIDTH = 186; // exact advance the glyph run is fitted to
const WORDMARK_TEXT = "accenture";

export function AccentureWordmark({ height = 19 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 -8 200 54"
      role="img"
      aria-label="accenture"
      style={{ display: "block", width: "auto", color: "var(--ink)" }}
    >
      <text
        x={WORDMARK_X}
        y={WORDMARK_BASELINE}
        textLength={WORDMARK_WIDTH}
        lengthAdjust="spacingAndGlyphs"
        fontFamily="sans-serif"
        fontSize="38"
        fontWeight="600"
        fill="currentColor"
        style={{ fontKerning: "none" }}
      >
        {WORDMARK_TEXT}
      </text>
      <path d={ACCENT_PATH} {...ACCENT_STROKE} />
    </svg>
  );
}

/** The ">" alone, as the oversized brand watermark behind profile chrome.
 *  Same geometry as the nav accent, scaled up — sharp, never a rounded chevron. */
export function AccentureCaretWatermark() {
  return (
    <svg
      viewBox="100 -8 20 20"
      aria-hidden="true"
      style={{
        position: "absolute",
        right: -30,
        top: -34,
        height: 190,
        width: "auto",
        opacity: 0.05,
        pointerEvents: "none",
        userSelect: "none",
        color: "var(--accent)",
      }}
    >
      <path d={ACCENT_PATH} {...ACCENT_STROKE} />
    </svg>
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
