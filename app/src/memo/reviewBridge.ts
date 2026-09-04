/* =============================================================================
   THE BRIDGE BETWEEN THE MEMO'S REVIEW PANEL AND THE ROOM AROUND IT.

   THE ROOM HAS NO CONTROLS OF ITS OWN ANY MORE (founder, 2026-09-04: "we do
   not need the approve / flag chips, we have that inline panel in there
   anyway"). The sign-off happens where the banker is reading (under the
   section, in the memo's own shell) and the room's job is to KNOW about it:
   the count above the pane, the publish door, the stored draft and the map
   replayed on the next re-render all come from the shell's state, not from a
   second set of buttons beside it.

   ONE HOOK, ALREADY THERE. `review-shell.js` calls `window.__memoProgressSync()`
   after every approve / edit / undo / review-all, and publishes the current map
   to `window.RV_ATTESTATION` immediately before it. The shell's own floating
   progress pill (in `memo-shell.html`) claims that hook first, so the bridge
   WRAPS it rather than replacing it: the pill keeps ticking and the room hears
   the same change.

   THE SEAM. jsdom does not load a `srcdoc` frame, so nothing below may reach
   for `iframe.contentWindow` itself. Everything takes a `ReviewFrame`, one
   document and one window-shaped object, which the room fills from the live
   frame and a test fills with a document it built and the vendored shell run
   against it. What the tests drive is the shell's own buttons.
   ============================================================================= */

import { sectionsFrom, type MemoSection } from "./renderMemo";
import type { MemoSectionRecord } from "./store";
import type { MemoAttestation, MemoAttestationEntry } from "./types";
import type { MemoReviewer } from "./reviewShell";

/** The globals the shell writes into its own window, as the room reads them. */
export interface ReviewFrameWindow {
  RV_REVIEWER?: MemoReviewer;
  RV_ATTESTATION_IN?: MemoAttestation;
  RV_ATTESTATION?: MemoAttestation;
  __memoProgressSync?: () => void;
}

/** The frame the memo is being read in, as everything here sees it. */
export interface ReviewFrame {
  doc: Document;
  win: ReviewFrameWindow;
}

/** What one read of the frame tells the room. */
export interface LiftedReview {
  /** Per-section sign-off, keyed by module id, for the room's own state. */
  records: Record<string, MemoSectionRecord>;
  /** The same thing in the shell's vocabulary, to replay on the next render. */
  attestation: MemoAttestation;
  /** The banker's own words, for every section they edited in the frame. */
  edits: Record<string, string>;
}

/* -----------------------------------------------------------------------------
   THE HOOK
   ----------------------------------------------------------------------------- */

/**
 * Listen to the shell, and read it once now.
 *
 * THE IMMEDIATE READ MATTERS AS MUCH AS THE HOOK. By the time a frame has
 * fired `load` the shell has already run its first `recompute()`, so a memo
 * carrying replayed sign-offs is ALREADY partly reviewed. A bridge that only
 * listened would show that memo as untouched until the banker clicked
 * something.
 *
 * THE HOOK FIRES ONE STEP EARLY, and that is a property of the vendored file
 * rather than a guess: `recompute()` calls `__memoProgressSync()` and only
 * THEN `publish()`, so at the instant the hook runs `RV_ATTESTATION` is still
 * the map from before the click. The read is therefore deferred by one
 * microtask, which is after `publish()` (a synchronous call in the same
 * `recompute`) and still inside the click. Reading the badges out of the DOM
 * instead would give the room a second source of truth for the same fact.
 */
export function bindReviewBridge(frame: ReviewFrame, onChange: (frame: ReviewFrame) => void): () => void {
  const pill = frame.win.__memoProgressSync;
  let live = true;
  const sync = () => {
    // THE PILL KEEPS ITS HOOK. It was there first and it is the frame's own.
    if (pill) {
      try {
        pill();
      } catch {
        /* the memo's pill is not the room's problem */
      }
    }
    queueMicrotask(() => {
      if (live) onChange(frame);
    });
  };
  frame.win.__memoProgressSync = sync;
  onChange(frame);
  return () => {
    live = false;
    if (frame.win.__memoProgressSync === sync) frame.win.__memoProgressSync = pill;
  };
}

/* -----------------------------------------------------------------------------
   THE LIFT
   ----------------------------------------------------------------------------- */

/** A module id, as the manifest writes them. Anything else is not a selector. */
const MOD_ID = /^[A-Za-z0-9_-]+$/;

/** Attested, in the shell's two words for it. Anything else is still a draft. */
const attestedStatus = (status: string | undefined): "approved" | "edited" | null =>
  status === "approved" || status === "edited" ? status : null;

/**
 * READ THE SHELL'S CURRENT STATE, AS THE ROOM'S.
 *
 * `RV_ATTESTATION` is the shell's published map and the only source: the
 * badges in the DOM are drawn from it, so reading the map rather than the
 * markup keeps one truth. Titles come from the room's own sections, because
 * they are the renderer's `data-modname` and the store's records are read by
 * people.
 */
export function liftReview(frame: ReviewFrame, sections: readonly MemoSection[]): LiftedReview {
  const map = frame.win.RV_ATTESTATION ?? {};
  const titles = new Map(sections.map((s) => [s.id, s.title]));
  const records: Record<string, MemoSectionRecord> = {};
  const attestation: MemoAttestation = {};
  const edits: Record<string, string> = {};

  for (const [id, raw] of Object.entries(map)) {
    const entry = (raw ?? {}) as MemoAttestationEntry;
    const status = attestedStatus(entry.status);
    if (!status) {
      attestation[id] = { status: "ai-drafted" };
      records[id] = { id, title: titles.get(id) ?? id, status: "draft" };
      continue;
    }
    attestation[id] = {
      status,
      approvedBy: entry.approvedBy,
      approvedRole: entry.approvedRole,
      approvedDate: entry.approvedDate,
      editNote: entry.editNote,
    };
    records[id] = {
      id,
      title: titles.get(id) ?? id,
      status,
      note: entry.editNote,
      by: entry.approvedBy,
      at: entry.approvedDate,
    };
    /* THE BANKER'S OWN WORDS, TAKEN AT THE MOMENT THEY LANDED. A published
       memo that did not carry the edit would be a memo the banker did not
       write, however green the badge on it was. */
    if (status === "edited") {
      const html = editedSectionHtml(frame.doc, id);
      if (html) edits[id] = html;
    }
  }
  return { records, attestation, edits };
}

/**
 * ONE SECTION, AS IT NOW STANDS IN THE FRAME.
 *
 * The shell's own furniture comes off on the way out (the `.rv-ctrl` row it
 * inserted, the `contenteditable` it toggles, the outline class it paints)
 * because none of that is the memo. What is left is the renderer's section
 * with the narrative the banker retyped inside it, and the badge the shell
 * flipped, which IS part of the record.
 */
export function editedSectionHtml(doc: Document, modId: string): string | null {
  if (!MOD_ID.test(modId)) return null;
  const sec = doc.querySelector(`section[data-mod="${modId}"]`);
  if (!sec) return null;
  const clone = sec.cloneNode(true) as Element;
  clone.querySelectorAll(".rv-ctrl").forEach((n) => n.remove());
  clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  clone.querySelectorAll(".rv-narr-edit").forEach((n) => n.classList.remove("rv-narr-edit"));
  clone.classList.remove("rv-editing");
  return clone.outerHTML;
}

/**
 * THE RENDERED MEMO WITH THE BANKER'S EDITS IN IT.
 *
 * Section by section, by exact string, over the renderer's own output: nothing
 * outside an edited section is re-serialised, so a memo with one edited
 * paragraph is byte-for-byte the rendered memo everywhere else. The replacement
 * is a function on purpose: a `$&` in a credit memo would otherwise be read as
 * a replacement pattern.
 */
export function applyEditedSections(html: string, edits: Record<string, string>): string {
  if (!Object.keys(edits).length) return html;
  let out = html;
  for (const section of sectionsFrom(html)) {
    const edited = edits[section.id];
    if (!edited || edited === section.html) continue;
    out = out.replace(section.html, () => edited);
  }
  return out;
}

/**
 * THE STORED SIGN-OFFS, BACK IN THE SHELL'S VOCABULARY.
 *
 * This is what "Open latest memo" replays into the frame, and what a re-render
 * of this session's memo replays: same map, same shape, one road back in.
 */
export function attestationFrom(sections: readonly MemoSectionRecord[]): MemoAttestation {
  const out: MemoAttestation = {};
  for (const section of sections) {
    const status = attestedStatus(section.status);
    out[section.id] = status
      ? { status, approvedBy: section.by, approvedDate: section.at, editNote: section.note }
      : { status: "ai-drafted" };
  }
  return out;
}
