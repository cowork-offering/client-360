/* =============================================================================
   THE ACCENTURE MARK, TYPOGRAPHIC.

   FOUNDER DIRECTIVE, canonical treatment from the Banksy deck studio: the mark
   is a lowercase wordmark with a bold ">" glyph kerned tight onto it. It is NOT
   a drawn stroke chevron, and neither is the room's loading, step, fold and
   arrival motif — every one of those is this same glyph, pulsed or stepped with
   opacity and transform.

   `components/brand.tsx` holds the cockpit's SVG rendition, which exists to
   swap for the official asset when one arrives. This is a different thing: the
   room's own typographic lockup and its progress glyph, at the sizes the room
   uses them at.
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

export function BrandLockup({ size = 13.5 }: { size?: number }) {
  return (
    <span className="wk-lockup" style={{ fontSize: size }} aria-label="accenture">
      <span className="wk-lockup-word" style={{ fontSize: size }} aria-hidden="true">
        accenture
      </span>
      <span className="wk-lockup-mark" style={{ fontSize: size, marginLeft: kern(size) }} aria-hidden="true">
        &gt;
      </span>
    </span>
  );
}

/** The ">" alone: the room's load, step, fold and arrival motif. Size comes
 *  from the context it sits in, so it inherits rather than declares. */
export function BrandGlyph({ className = "" }: { className?: string }) {
  return (
    <span className={`wk-glyph ${className}`} aria-hidden="true">
      &gt;
    </span>
  );
}
