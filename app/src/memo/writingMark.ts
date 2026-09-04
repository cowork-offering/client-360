/* =============================================================================
   WHERE THE WORDS ARE ABOUT TO LAND, MARKED IN THE DOCUMENT ITSELF.

   THE TIMELINE IN THE CONVERSATION SAYS WHICH SECTION IS BEING WRITTEN. That is
   the left lane. The banker is reading the RIGHT one, and until now the memo
   gave them nothing: a paragraph simply changed under them, some seconds after
   a line in the chat said it would.

   SO THE SECTION BEING WRITTEN WEARS IT. A soft shimmer over the module's
   narrative blocks and one small "writing" tag beside its title, in the
   document the reader is actually looking at. Nothing moves, nothing reflows:
   the tag is inline in the header the renderer already emits and the shimmer is
   a background on a block that is already there, so a reader mid-sentence is
   never pushed down the page by the fact that a different section is arriving.

   THIS IS A SIBLING OF `reviewBridge.ts` AND FOR THE SAME REASON. The frame is
   same-origin by construction (srcdoc), so the room reaches into its document
   directly rather than posting messages at it; everything here takes a
   `Document` and nothing here reaches for an iframe, which is what lets the
   suite drive it against a parsed document in jsdom.

   THE MARK IS NEVER PART OF THE MEMO. It is painted onto the live document
   after a render, never into the html the room holds, so nothing that is
   stored, published or attested has ever seen it. `editedSectionHtml` strips it
   on the way out for the one case where it could otherwise be caught in a
   banker's own edit.
   ============================================================================= */

/** The class the section being written wears. */
export const WRITING_CLASS = "mm-writing";

/** The small tag beside its title. */
export const WRITING_TAG_CLASS = "mm-writing-tag";

/** A module id, as the manifest writes them. Anything else is not a selector. */
const MOD_ID = /^[A-Za-z0-9_-]+$/;

const STYLE_ID = "mm-writing-style";

/* THE SHIMMER LIVES IN THE FRAME, because the section it paints does. The
   memo's own stylesheet is the plugin's and is not ours to add to, so this goes
   in as one style element of the room's own, once per document, addressed by
   id so a repaint never leaves two of them behind. Colour is deliberately
   borrowed from the document's own ink rather than the cockpit's tokens: the
   memo is a page, and a page does not know what room it is being read in. */
const CSS = `
.${WRITING_CLASS} .rte-narrative{position:relative;border-radius:6px;background-image:linear-gradient(100deg,rgba(161,0,255,0) 20%,rgba(161,0,255,0.09) 48%,rgba(161,0,255,0) 76%);background-size:220% 100%;background-repeat:no-repeat;animation:mm-writing-sheen 1600ms linear infinite}
.${WRITING_TAG_CLASS}{margin-left:8px;font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#a100ff;opacity:.85;vertical-align:middle}
@keyframes mm-writing-sheen{from{background-position:140% 0}to{background-position:-40% 0}}
@media (prefers-reduced-motion:reduce){.${WRITING_CLASS} .rte-narrative{animation:none;background-image:none;box-shadow:inset 0 0 0 1px rgba(161,0,255,.16)}}
`;

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const head = doc.head ?? doc.documentElement;
  if (!head) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  head.appendChild(style);
}

/** Take the mark off every section that is wearing it. */
function clear(doc: Document): void {
  doc.querySelectorAll(`.${WRITING_CLASS}`).forEach((el) => el.classList.remove(WRITING_CLASS));
  doc.querySelectorAll(`.${WRITING_TAG_CLASS}`).forEach((el) => el.remove());
}

/**
 * ONE SECTION IS BEING WRITTEN. Null means none is, which is also how the mark
 * comes off: the room calls this on every change of the writing section and on
 * every document it swaps onto the glass, and this is the only writer.
 */
export function markWriting(doc: Document, modId: string | null): void {
  clear(doc);
  if (!modId || !MOD_ID.test(modId)) return;
  const section = doc.querySelector(`section[data-mod="${modId}"]`);
  if (!section) return;
  ensureStyle(doc);
  section.classList.add(WRITING_CLASS);
  const header = section.querySelector(".section-header") ?? section;
  const tag = doc.createElement("span");
  tag.className = WRITING_TAG_CLASS;
  tag.textContent = "writing";
  header.appendChild(tag);
}
