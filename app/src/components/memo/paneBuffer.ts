/* =============================================================================
   TWO FRAMES, ONE DOCUMENT ON THE GLASS. THE PANE NEVER BLANKS.

   FOUNDER, 2026-09-04: "right now it flickers and updates, not sexy."

   THE FLICKER IS STRUCTURAL, not a missing transition. A `srcdoc` change
   RELOADS the frame: the browser tears the old document down, paints whatever
   the frame's background is, parses the new one, runs the review shell, and
   only then has something to show. The room used to catch the reader's scroll
   offset on the far side of that, which put them back where
   they were but could not stop the white flash on the way, and it fired on
   every narrative that landed, so a seven-section draft flashed seven times.

   SO THE NEW DOCUMENT IS BUILT WHERE NOBODY IS LOOKING. Two frames, exactly
   one of them visible. A present writes into the hidden one, waits for its
   LOAD, copies the reader's place across, lets the room do its business with
   it (rebinding the review bridge, which is how the sign-offs survive the
   swap), and only then crossfades. What the reader sees is the old document
   until the new one is complete, and then a 240ms dissolve between two
   documents that are scrolled to the same line.

   NOTHING IN HERE TOUCHES AN IFRAME. Everything is a {@link BufferPane}, two
   writes and two reads, which is what lets the suite drive the whole
   choreography in jsdom, where a `srcdoc` frame never loads at all and this
   would otherwise be untestable by construction. The room fills the seam with
   its two real frames; a test fills it with a pair of fakes and fires the load
   itself.
   ============================================================================= */

/** How long the dissolve takes. Founder's own number for this beat. */
export const PANE_FADE_MS = 240;

/** What a pane is doing: the document on the glass, the one being built, or
 *  the one dissolving in over the top of the one it replaces. */
export type PaneRole = "visible" | "hidden" | "arriving";

/** One frame, as everything here sees it. */
export interface BufferPane {
  /** Put a document in this pane. The load is asynchronous and always comes. */
  write: (html: string) => void;
  /** Tell me when this pane's document has loaded. Returns the unbind. */
  onLoad: (cb: () => void) => () => void;
  /** Where the reader is in this pane's document, or null off a browser. */
  scrollTop: () => number | null;
  scrollTo: (top: number) => void;
  /** Paint the pane's part in the swap. The stylesheet owns what that means. */
  role: (role: PaneRole) => void;
}

export interface PaneBuffers {
  /**
   * Put this document on the glass without ever blanking what is on it.
   *
   * A present while another one is still loading SUPERSEDES it: the hidden
   * pane is rewritten and the same load carries the newer document. A draft
   * that lands three sections faster than a frame can parse must not queue
   * three swaps for documents nobody will ever see.
   */
  present: (html: string) => void;
  /** Which pane the reader is looking at. */
  visible: () => 0 | 1;
  /** The document currently on the glass, or null before the first one. */
  shown: () => string | null;
  dispose: () => void;
}

/** The clock, injectable so a test does not have to wait 240 real milliseconds. */
export interface PaneTimer {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

const REAL_TIMER: PaneTimer = {
  set: (fn, ms) => (typeof window === "undefined" ? 0 : window.setTimeout(fn, ms)),
  clear: (id) => {
    if (typeof window !== "undefined") window.clearTimeout(id);
  },
};

export function createPaneBuffers(args: {
  panes: readonly [BufferPane, BufferPane];
  /** No dissolve. The swap happens in one commit, which is also what jsdom sees. */
  reduced?: boolean;
  fadeMs?: number;
  /**
   * THE ROOM'S BUSINESS WITH A DOCUMENT THAT IS ABOUT TO BE SEEN.
   *
   * Called after the load and after the scroll has been copied, and BEFORE the
   * pane becomes visible. This is where the review bridge is rebound and the
   * writing marker is repainted: a document that became visible first would be
   * a document the room was not listening to yet.
   */
  onReady?: (pane: BufferPane, index: 0 | 1) => void;
  timer?: PaneTimer;
}): PaneBuffers {
  const { panes, reduced = false } = args;
  const fadeMs = args.fadeMs ?? PANE_FADE_MS;
  const timer = args.timer ?? REAL_TIMER;

  let vis: 0 | 1 = 0;
  let shown: string | null = null;
  /** The document being built in the hidden pane, or null when none is. */
  let pending: string | null = null;
  let unbind: (() => void) | null = null;
  let fade = 0;
  let fadeEnd: (() => void) | null = null;
  let alive = true;

  /** End a dissolve that is still running, now. A second present must not find
   *  two panes both claiming to be on the glass. */
  const flushFade = () => {
    if (!fadeEnd) return;
    timer.clear(fade);
    const end = fadeEnd;
    fadeEnd = null;
    end();
  };

  const present = (html: string) => {
    if (!alive) return;
    if (pending !== null) {
      // SUPERSEDED. Same load, newer document; no second swap is queued.
      pending = html;
      panes[(1 - vis) as 0 | 1].write(html);
      return;
    }
    if (html === shown) return;
    flushFade();

    if (shown === null) {
      // THE FIRST DOCUMENT. There is nothing behind it to dissolve from, so it
      // simply is the pane, and the room still hears about it when it loads.
      shown = html;
      panes[vis].role("visible");
      panes[(1 - vis) as 0 | 1].role("hidden");
      unbind = panes[vis].onLoad(() => {
        unbind?.();
        unbind = null;
        if (alive) args.onReady?.(panes[vis], vis);
      });
      panes[vis].write(html);
      return;
    }

    const next = (1 - vis) as 0 | 1;
    pending = html;
    panes[next].role("hidden");
    unbind = panes[next].onLoad(() => {
      unbind?.();
      unbind = null;
      if (!alive) return;
      /* THE READER'S PLACE, CARRIED ACROSS BEFORE ANYONE SEES THE NEW PAGE. A
         document that dissolved in at the top and then jumped to the covenant
         table is the same lost place, performed. */
      const at = panes[vis].scrollTop();
      if (at != null) panes[next].scrollTo(at);
      args.onReady?.(panes[next], next);

      const from = vis;
      vis = next;
      shown = pending;
      pending = null;

      if (reduced || fadeMs <= 0) {
        panes[from].role("hidden");
        panes[next].role("visible");
        return;
      }
      panes[next].role("arriving");
      fadeEnd = () => {
        panes[from].role("hidden");
        panes[next].role("visible");
      };
      fade = timer.set(() => {
        const end = fadeEnd;
        fadeEnd = null;
        end?.();
      }, fadeMs);
    });
    panes[next].write(html);
  };

  return {
    present,
    visible: () => vis,
    shown: () => shown,
    dispose: () => {
      alive = false;
      unbind?.();
      unbind = null;
      timer.clear(fade);
      fadeEnd = null;
    },
  };
}
