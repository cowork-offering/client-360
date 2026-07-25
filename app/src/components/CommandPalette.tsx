import { useEffect, useMemo, useRef, useState } from "react";
import { Portal } from "./Portal";
import { useApp } from "../state/appState";

/** Cmd/Ctrl+K palette to jump to any staged account (SPEC §6.2). */
export function CommandPalette() {
  const { data, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const staged = useMemo(() => {
    const ids = new Set<string>(Object.keys(data.borrowers ?? {}));
    const anchor = data.borrower?.snapshot?.accountId;
    if (anchor) ids.add(anchor);
    const byId = new Map(data.portfolio.accounts.map((a) => [a.accountId, a]));
    return [...ids].map((id) => {
      const a = byId.get(id);
      const b = (data.borrowers ?? {})[id] ?? data.borrower;
      return { id, name: a?.name ?? b?.snapshot?.name ?? id, industry: a?.industry ?? b?.snapshot?.industry ?? "" };
    });
  }, [data]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? staged.filter((s) => `${s.name} ${s.industry}`.toLowerCase().includes(q)) : staged;
  }, [staged, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  function choose(id: string) {
    dispatch({ type: "OPEN_ACCOUNT", accountId: id });
    setOpen(false);
  }

  return (
    <Portal>
    <div className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh]" style={{ zIndex: "var(--z-palette)", background: "var(--scrim)" }} onClick={() => setOpen(false)} role="presentation">
      <div
        className="c360-row-in w-full max-w-lg overflow-hidden rounded-[14px] bg-raised"
        style={{ boxShadow: "var(--shadow-card-hover)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to account"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <svg width="15" height="15" viewBox="0 0 16 16" className="flex-none text-ink-faint">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                choose(results[active].id);
              }
            }}
            placeholder="Jump to a staged account…"
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-ink-faint">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-ink-muted">No staged account matches “{query}”.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r.id)}
                className="c360-press flex w-full items-center justify-between px-4 py-2.5 text-left"
                style={{ background: i === active ? "var(--surface-overlay)" : "transparent" }}
              >
                <span className="text-[13.5px] font-semibold text-ink">{r.name}</span>
                <span className="text-[11.5px] text-ink-muted">{r.industry}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
