import { useEffect, useRef, type ReactNode } from "react";
import { Portal } from "./Portal";

/* Shared shell for the chat and Client Actions panels (A27.1 / A27.4) — one
   visual family, one keyboard contract:
     - Esc closes.
     - Focus moves into the panel on open and returns to the trigger on close.
     - Tab is trapped inside the panel while it is open.
   `variant` only changes geometry: "popover" springs from the FAB (bottom
   right), "sheet" is the full-height right rail. */

export type PanelVariant = "popover" | "sheet";

export function FloatingPanel({
  title,
  subtitle,
  variant,
  onClose,
  returnFocusTo,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  variant: PanelVariant;
  onClose: () => void;
  /** Resolved at close time so it works for whichever trigger opened the panel
   *  (the Client Actions button moves between nav and verdict row). */
  returnFocusTo?: () => HTMLElement | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = panelRef.current;
    // Move focus in without stealing it from a field the panel itself renders.
    if (node && !node.contains(document.activeElement)) {
      const first = node.querySelector<HTMLElement>("[data-autofocus]") ?? node;
      first.focus({ preventScroll: true });
    }
    return () => returnFocusTo?.()?.focus?.({ preventScroll: true });
  }, [returnFocusTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = panelRef.current;
      if (!node) return;
      // Visibility filter deliberately avoids offsetParent: it is layout-derived
      // and always null in non-layout environments, which would silently empty
      // the ring and disable the trap. Explicit hidden markers only.
      const focusables = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true" && !el.closest("[hidden]"));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const index = active ? focusables.indexOf(active) : -1;

      // C5: focus may sit on the panel ROOT (initial open with no autofocus
      // target) or have escaped entirely via a pointer click outside. In either
      // case it is not in the ring — re-enter at the correct end instead of
      // letting Tab walk out of the panel.
      if (index === -1) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const geometry =
    variant === "popover"
      ? "bottom-24 right-6 w-[min(380px,calc(100vw-3rem))] h-[min(560px,calc(100vh-9rem))]"
      : "bottom-6 right-6 top-6 w-[min(400px,calc(100vw-3rem))]";

  return (
    <Portal>
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      tabIndex={-1}
      className={`c360-panel-in fixed flex flex-col overflow-hidden rounded-[16px] bg-raised ${geometry}`}
      style={{ zIndex: "var(--z-panel)", boxShadow: "var(--shadow-panel)", border: "1px solid var(--border)" }}
    >
      <div className="flex flex-none items-start gap-2 border-b border-divider px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-ink">{title}</div>
          {subtitle && <div className="truncate text-[11.5px] text-ink-muted">{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="c360-press flex h-7 w-7 flex-none items-center justify-center rounded-[8px] border border-border text-ink-muted hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M4 4l7 7M11 4l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {footer && <div className="flex-none border-t border-divider">{footer}</div>}
    </div>
    </Portal>
  );
}
