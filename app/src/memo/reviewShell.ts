/* =============================================================================
   THE MEMO'S OWN REVIEW SHELL, INTO THE COCKPIT'S FRAME.

   THE MEMO ALREADY HAS A REVIEW PANEL and it is the plugin's, not ours:
   `vendor/assets/review-shell.js` draws a "Review as drafted" control under
   every module's attestation badge, an Edit path over the narrative the
   renderer marked `[data-editable]`, and a sticky bar with "Review all
   remaining" and a running count. The plugin's CLI assembler injects it into
   the artifact it writes (`vendor/render/assemble-memo.mjs`, the non-`--static`
   branch); this file is the same injection for the browser, from the same two
   vendored files, so the panel in the cockpit's pane is the panel the plugin
   ships and not a second implementation of it.

   THE ORDER IS THE WHOLE POINT. The shell reads `window.RV_REVIEWER` and
   `window.RV_ATTESTATION_IN` ON ITS FIRST LINE, at init, and never again. So
   both are written into the DOCUMENT as a script that stands BEFORE the
   shell's own script: classic scripts in a parsed document execute in document
   order, which makes "the reviewer was there before the shell looked" a
   property of the HTML rather than a race the room has to win. Setting them on
   `contentWindow` after the frame loads would be too late by construction:
   the shell has already named the reviewer "Reviewer" on every badge.

   TWO CONTROLS THE ROOM TAKES BACK. "Export sign-offs" and its `#rv-export`
   pre are the CLI's hand-off, for a reviewer who has to carry the map back to
   an agent by hand. In the room there is nobody to carry it to: the room reads
   `window.RV_ATTESTATION` off the frame directly (`reviewBridge.ts`) on every
   change. So both are hidden, and "Review all remaining" stays.
   ============================================================================= */

import shellCss from "./vendor/assets/review-shell.css?raw";
import shellJs from "./vendor/assets/review-shell.js?raw";
import type { MemoAttestation } from "./types";

/** Who the badges name. The shell's own shape, from the view's meta. */
export interface MemoReviewer {
  name: string;
  role: string;
  /** As a badge prints it: "Sep 4, 2026". */
  date: string;
  /** As the renderer stores it on a re-render. The room's clock. */
  iso: string;
}

/* THE ROOM READS THE MAP, SO NOBODY EXPORTS IT BY HAND. */
const HIDE_EXPORT = ".rv-bar .rv-export{display:none!important}#rv-export{display:none!important}";

/* A STORED MEMO IS READ, NOT REVIEWED AGAIN. The badges still render from the
   map it was saved with, which is what "read only, with the attestations it
   was saved with" means; what goes is every control that could change them. */
const READ_ONLY = ".rv-bar,.rv-ctrl{display:none!important}";

/** Safe inside a `<script>`: the one sequence that could close it early. */
const json = (value: unknown): string => JSON.stringify(value ?? {}).replace(/</g, "\\u003c");

/**
 * The rendered memo with the plugin's review shell in it.
 *
 * `attestation` is replayed as `RV_ATTESTATION_IN`, which is what makes a
 * re-render (a narrative landing, a steered section) rehydrate the sign-offs
 * instead of resetting the checklist to pending. `readOnly` is the stored
 * memo: same badges, no controls.
 */
export function withReviewShell(
  html: string,
  args: { reviewer: MemoReviewer; attestation: MemoAttestation; readOnly?: boolean },
): string {
  const block =
    `<style>${shellCss}\n${HIDE_EXPORT}${args.readOnly ? `\n${READ_ONLY}` : ""}</style>\n` +
    `<script>window.RV_REVIEWER=${json(args.reviewer)};window.RV_ATTESTATION_IN=${json(args.attestation)};</script>\n` +
    `<script>${shellJs}</script>\n`;
  // The renderer's shell always closes its body; the fallback is for a caller
  // holding a fragment, and appending keeps the order this file depends on.
  return html.includes("</body>") ? html.replace("</body>", `${block}</body>`) : html + block;
}

/** The reviewer the room signs with: the view's own user, on the room's clock. */
export function reviewerFor(user: string | null | undefined, memoDate: string | null, generatedAt: string): MemoReviewer {
  return {
    name: user?.trim() || "Reviewer",
    role: "Relationship Manager",
    date: memoDate ?? "",
    iso: generatedAt,
  };
}
