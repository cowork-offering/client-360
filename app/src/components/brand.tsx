/* =============================================================================
   THE ACCENTURE MARK — THE ORIGINAL VECTOR.

   FOUNDER DIRECTIVE (Fabian, 2026-08-31, Electric Glass lock): the ">" is the
   ORIGINAL Accenture asset — the exact path extracted verbatim from the
   official wordmark SVG (path8760, ds/logos/accenture-logo-black.svg) — never
   a typed ">" character. This supersedes the 2026-08-27 typographic directive:
   that rule existed because the earlier SVG was a traced approximation that
   drifted; this one is the brand's own geometry, so the objection is gone.

   The mark appears in exactly three sanctioned places (locked spec):
   eyebrow/lockup, empty-state watermark, and the loading moment. Loading is
   the BREATHE (approved in the three-way lab): the glyph stands still and
   breathes — it never marches, and there is never more than one.

   ONE implementation, used by the cockpit nav, the app boot, the profile
   watermark and the workroom. Choreography lives in styles/tokens.css under
   `.c360-glyph` / `.c360-beat` (now the breathe).
   ============================================================================= */

import type { CSSProperties } from "react";

/* The official geometry. viewBox is the mark's own bounding box inside the
   wordmark; ratio ≈ 0.945 : 1. Fill rides currentColor so tokens decide. */
const GT_VIEWBOX = "116.99973 0 19.79227 20.94533";
const GT_PATH =
  "m 116.99973,0 v 5.97866 l 11.556,4.516 -11.556,4.296 v 6.15467 l 19.792,-8.016 V 7.97066 Z";

function GtSvg({ style, className = "" }: { style?: CSSProperties; className?: string }) {
  return (
    <svg
      viewBox={GT_VIEWBOX}
      className={className}
      style={{ width: "0.94em", height: "1em", display: "inline-block", verticalAlign: "-0.08em", ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={GT_PATH} fill="currentColor" />
    </svg>
  );
}

/** The full lockup: `accenture` wordmark text + the original ">" vector. */
export function BrandLockup({ size = 13.5, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`c360-lockup ${className}`} style={{ fontSize: size }} aria-label="accenture">
      <span className="c360-lockup-word" style={{ fontSize: size }} aria-hidden="true">
        accenture
      </span>
      <span className="c360-lockup-mark" style={{ fontSize: size, marginLeft: "0.09em" }} aria-hidden="true">
        <GtSvg style={{ width: "0.8em", height: "0.85em", verticalAlign: "-0.02em" }} />
      </span>
    </span>
  );
}

/** The ">" alone: the app's load, step, fold and arrival motif. Sizes from the
 *  font-size of the context it sits in, so it inherits rather than declares. */
export function BrandGlyph({ className = "", label }: { className?: string; label?: string }) {
  return (
    <span
      className={`c360-glyph ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const })}
    >
      <GtSvg />
    </span>
  );
}

/** The ">" oversized behind profile chrome — the same vector as everywhere
 *  else, set large and faint (the empty-state/watermark placement from the
 *  locked spec). */
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
        opacity: 0.04,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <GtSvg />
    </span>
  );
}

/** Cinematic ambient wash for the profile header (A25.2): two very low-opacity
 *  blooms drifting on a >20s cycle — the second is the official teal now, at a
 *  whisper. Transform/opacity only; tokens.css neutralises it under
 *  prefers-reduced-motion. */
export function AmbientWash() {
  return (
    <div aria-hidden="true" className="c360-ambient">
      <span className="c360-ambient-a" />
      <span className="c360-ambient-b" />
    </div>
  );
}
