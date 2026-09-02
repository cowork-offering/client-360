/* =============================================================================
   THE MANIFEST RAIL — the room's ledger, bounded and scrollable.

   FOUNDER CALL, 2026-09-02: past a dozen committed cards the lane ran off the
   bottom of the room and the newest change was simply gone. The rail now holds
   a fixed frame tied to the viewport and scrolls INSIDE it, so the thread, the
   composer and the Review & execute chip never move to make room for a ledger.

   WHY A PRIMITIVE AND NOT A PATCH. Two rooms carry a right lane with the same
   anatomy: a head that states the total, then a stack of chips. The workroom's
   manifest and the relationship room's review ledger are the same object with
   different nouns, so the frame is built once and named once. The relationship
   room adopts it by wrapping its `.wk-ents` stack in this component (see
   design/proposals/rail-scroll-addendum.md).

   WHAT IT OWNS:
   - the bounded frame (max height from the room, never from the content)
   - the pinned head, which states the whole total while the chips scroll
   - the soft fade at whichever edge is holding content back, and only there
   - the newest entry scrolled into view as it lands, reduced-motion safe
   - a focusable region with arrow-key scrolling, per WCAG 2.1.1

   WHAT IT DOES NOT OWN: the chips. Callers pass their own children, so each
   room keeps its own vocabulary, icons and controls inside the frame.

   ON LAW 5 ("nothing in the room scrolls"). The law's census reads
   workroom.css and holds the thread to one scroller with no visible bar. That
   law is about the THREAD, and it stands. The rail is a bounded ledger, not a
   conversation, and the founder asked for it to scroll; its stylesheet lives
   with the primitive rather than in the room's sheet because the primitive is
   shared, not because the census is being dodged.
   ============================================================================= */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "../../styles/rail.css";

/** One chip of travel per arrow press: a keyboard step should read as one row
 *  moving past the edge, not as a page lurching. */
const ARROW_STEP_PX = 58;

export type ManifestRailProps = {
  /** The lane's kicker. "Manifest", "This review". */
  heading: string;
  /** The whole total, always. "13 changes · 5 of 6 members". */
  count: string;
  /** The head's quiet control, if the room has one (a peek at the package). */
  action?: ReactNode;
  /** What a screen reader calls the scrollable region. */
  label: string;
  /** The identity of the newest entry. When it changes the rail brings it into
   *  view; pass null while the rail is empty. */
  newest?: string | null;
  children: ReactNode;
};

export function ManifestRail({ heading, count, action, label, newest = null, children }: ManifestRailProps) {
  const vp = useRef<HTMLDivElement>(null);
  /** Which edge is holding content back. The fade appears only there. */
  const [over, setOver] = useState({ up: false, down: false });

  const readEdges = useCallback(() => {
    const el = vp.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const up = el.scrollTop > 2;
    const down = max > 2 && el.scrollTop < max - 2;
    setOver((prev) => (prev.up === up && prev.down === down ? prev : { up, down }));
  }, []);

  /* The cap is the room's, so the edges change when the room changes size just
     as much as when a chip lands. Both are watched. */
  useEffect(() => {
    const el = vp.current;
    const stack = el?.firstElementChild;
    if (!el || !stack) return;
    readEdges();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(readEdges);
    ro.observe(el);
    ro.observe(stack);
    return () => ro.disconnect();
  }, [readEdges]);

  /* THE NEWEST ENTRY LANDS IN VIEW. The chip pops in place at the bottom of the
     stack (rule 40), so the rail rides down to meet it rather than leaving the
     banker to discover that something happened off-screen. */
  useEffect(() => {
    const el = vp.current;
    if (!el || !newest) return;
    const still =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: still ? "auto" : "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    readEdges();
  }, [newest, readEdges]);

  /* KEYBOARD REACHABLE. A scrollable region that only a mouse wheel can move is
     a wall to anyone on a keyboard; the region takes focus and the arrows,
     pages and ends move it. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = vp.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    const page = Math.max(el.clientHeight - ARROW_STEP_PX, ARROW_STEP_PX);
    let to: number;
    if (e.key === "ArrowDown") to = el.scrollTop + ARROW_STEP_PX;
    else if (e.key === "ArrowUp") to = el.scrollTop - ARROW_STEP_PX;
    else if (e.key === "PageDown") to = el.scrollTop + page;
    else if (e.key === "PageUp") to = el.scrollTop - page;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = max;
    else return;
    e.preventDefault();
    el.scrollTop = Math.min(Math.max(to, 0), max);
    readEdges();
  };

  return (
    <div className="rail">
      {/* THE HEAD IS THE LANE HEAD THE ROOMS ALREADY SHARE. The primitive owns
          the frame, not the typography: `.wk-man-h` is the head both rooms
          render today and both stylesheets already dress. */}
      <header className="wk-man-h">
        <span className="wk-kicker">{heading}</span>
        <span className="wk-c">{count}</span>
        {action}
      </header>
      <div
        ref={vp}
        className={`rail-vp${over.up ? " rail-up" : ""}${over.down ? " rail-down" : ""}`}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={readEdges}
        onKeyDown={onKeyDown}
      >
        <div className="rail-stack">{children}</div>
      </div>
    </div>
  );
}
