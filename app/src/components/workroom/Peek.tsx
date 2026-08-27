import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Portal } from "../Portal";
import { isTopmost, pushModal } from "../modalStack";

/* =============================================================================
   THE PEEK — LAW 5'S STRUCTURAL ANSWER.

   ONE overlay primitive, used for EVERY disclosure in the room: the client
   email, Why, the member cards, the org record map, the field names, the maths
   behind a check, governance, the drafted reply, a clamped bubble, a folded
   turn. It floats OVER the layout instead of growing inside it, so no pane can
   ever be pushed past its own height and nothing in the room needs a scrollbar.

   DIRECTIVE, carried from the mock: every new disclosure opens through here. An
   inline drawer anywhere in this room re-breaks law 5, and the fit pass cannot
   rescue a pane it does not own.
   ============================================================================= */

export interface PeekSpec {
  kicker: string;
  /** The card's width. The mock's four widths are 420, 440, 460 and 760. */
  width: number;
  content: ReactNode;
  /** What the peek came out of, so it opens beside it rather than in the middle
   *  of the room. Null centres it. */
  anchor: DOMRect | null;
}

/** Anchored placement, clamped to the room. Ported from the mock: below the
 *  anchor by preference, above it when it would not fit, and never outside the
 *  room's own edges. */
function place(card: DOMRect, room: DOMRect, anchor: DOMRect | null): { top: number; left: number } {
  let top: number;
  let left: number;
  if (anchor) {
    top = anchor.bottom + 8;
    left = anchor.left - 6;
    if (top + card.height > room.bottom - 14) top = anchor.top - 8 - card.height;
  } else {
    top = room.top + 70;
    left = room.left + (room.width - card.width) / 2;
  }
  if (top + card.height > room.bottom - 14) top = room.bottom - 14 - card.height;
  if (top < room.top + 14) top = room.top + 14;
  if (left + card.width > room.right - 14) left = room.right - 14 - card.width;
  if (left < room.left + 14) left = room.left + 14;
  return { top, left };
}

export function Peek({
  spec,
  roomRef,
  onClose,
}: {
  spec: PeekSpec;
  roomRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => pushModal("workroom-peek"), []);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const room = roomRef.current;
    if (!card || !room) return;
    setPos(place(card.getBoundingClientRect(), room.getBoundingClientRect(), spec.anchor));
  }, [spec, roomRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!isTopmost("workroom-peek")) return;
      // The peek is the innermost layer, so Escape closes it and the room stays
      // exactly where the banker left it.
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <Portal>
      <div className="wk-root wk-peek">
        <div className="wk-peek-bd" onClick={onClose} role="presentation" />
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={spec.kicker}
          className="wk-peek-card"
          style={{ width: spec.width, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? undefined : "hidden" }}
        >
          <div className="wk-peek-h">
            <div className="wk-kicker">{spec.kicker}</div>
            <button type="button" className="wk-peek-x" onClick={onClose} aria-label="Close">
              <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="wk-peek-b">{spec.content}</div>
        </div>
      </div>
    </Portal>
  );
}

/** Opening a peek needs the thing it came out of. This hands back an opener
 *  that takes the event's own element, so no caller has to hold a ref for a
 *  button it already has. */
export function usePeek(): {
  peek: PeekSpec | null;
  openPeek: (from: EventTarget | null, spec: Omit<PeekSpec, "anchor">) => void;
  closePeek: () => void;
} {
  const [peek, setPeek] = useState<PeekSpec | null>(null);
  const openPeek = useCallback((from: EventTarget | null, spec: Omit<PeekSpec, "anchor">) => {
    const el = from instanceof Element ? from.closest("button, .wk-bub, .wk-ent") : null;
    setPeek({ ...spec, anchor: el ? el.getBoundingClientRect() : null });
  }, []);
  const closePeek = useCallback(() => setPeek(null), []);
  return { peek, openPeek, closePeek };
}
