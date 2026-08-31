import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Portal } from "./Portal";
import { useApp } from "../state/appState";
import { ACTIONS, resolveBundle } from "../actions/registry";
import { openWorkroom, workroomContextFor, workroomModeFor } from "../workroom/openWorkroom";
import "../styles/cmdk.css";

/* =============================================================================
   SURFACE 6 — THE CMDK LENS (DIRECTION-LOCKED rule 63, 70.2, 46, 47).

   THE PALETTE IS A LENS. Opening it pushes the cockpit into depth of field
   (body.lensed, see cmdk.css) and the glass field rises out of the softness.
   This file owns the field, its commands and its keyboard; the defocus is
   entirely material and lives in the stylesheet.

   THE BOOK IS THE APP'S BOOK. The dummy authored three rows against one
   client; the port lists what this snapshot actually holds — every staged
   client, and the workroom actions the registry says are available on the
   client currently open. The materialize cascade is index-driven for exactly
   that reason: it has to fit however many commands there are.
   ============================================================================= */

/** The header's ⌘K chip opens the same palette the shortcut does (rule 45 puts
 *  search in that chip). An event rather than lifted state: the palette owns its
 *  own open/close and the header should not have to hold it. */
export const CMDK_OPEN_EVENT = "c360:cmdk-open";

type CommandKind = "Action" | "Client" | "View";

interface Command {
  id: string;
  /** What the row reads. */
  label: string;
  /** The right-hand kind label, and part of what the filter matches. */
  kind: CommandKind;
  /** Extra text the filter should match but the row should not show. */
  aka?: string;
  run: () => void;
}

/** Cmd/Ctrl+K palette to jump to any staged account or open a workroom
 *  (SPEC §6.2, rule 63). */
export function CommandPalette() {
  const { data, state, dispatch } = useApp();
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

  const openAccountId = state.view === "account" ? state.accountId : null;

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [];

    /* ACTIONS FIRST, and only the ones that are real right now. A palette row
       is a thing the banker can do, so an action the registry says this data
       cannot support does not get one — unlike the Client Actions control
       centre, which keeps it visible and disabled because its job is to be the
       map of what exists (A27.3). They route through the SAME seam that panel
       uses, `openWorkroom(workroomContextFor(...))`, so the room can never
       disagree with itself about which package a banker is standing in. */
    const accountName = openAccountId ? staged.find((s) => s.id === openAccountId)?.name : null;
    if (openAccountId && accountName) {
      for (const action of ACTIONS) {
        const mode = workroomModeFor(action.id);
        if (!mode || !action.availability(data, openAccountId).available) continue;
        out.push({
          id: `action:${action.id}`,
          label: `${action.label} · ${accountName}`,
          kind: "Action",
          run: () =>
            openWorkroom(
              workroomContextFor({
                mode,
                data,
                bundle: resolveBundle(data, openAccountId),
                accountId: openAccountId,
                accountName,
              }),
            ),
        });
      }
    }

    for (const s of staged) {
      out.push({
        id: `client:${s.id}`,
        label: `Open ${s.name}`,
        kind: "Client",
        // The industry stays searchable without crowding the row: the dummy's
        // row shape is one line plus its kind, and this palette already let a
        // banker find a client by sector.
        aka: s.industry,
        run: () => dispatch({ type: "OPEN_ACCOUNT", accountId: s.id }),
      });
    }

    out.push({
      id: "view:home",
      label: "Back to worklist",
      kind: "View",
      run: () => dispatch({ type: "GO_HOME" }),
    });

    return out;
  }, [data, dispatch, openAccountId, staged]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.kind} ${c.aka ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    const onChip = () => setOpen(true);
    window.addEventListener(CMDK_OPEN_EVENT, onChip);
    return () => window.removeEventListener(CMDK_OPEN_EVENT, onChip);
  }, []);

  /* THE KEYBOARD LIVES ON THE WINDOW (rule 70.2). Arrow keys traverse the
     VISIBLE rows and Enter fires the selection, which has to hold whether or
     not the caret is in the field — a palette that only answers keys while its
     input has focus stops being keyboard-driven the moment anything else takes
     focus, and is unreachable to automation.

     NO DEPENDENCY ARRAY ON PURPOSE: the handler reads the current filter and
     the current selection, so it is rebound each render rather than closing
     over a stale pair. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      if (!visible.length) return;
      e.preventDefault();
      if (e.key === "Enter") {
        fire(visible[active] ?? visible[0]);
        return;
      }
      setActive((i) =>
        e.key === "ArrowDown" ? Math.min(i + 1, visible.length - 1) : Math.max(i - 1, 0),
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    document.body.classList.add("lensed");
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove("lensed");
    };
  }, [open]);

  /* THE FILTER LISTENS NATIVELY. React's value tracker swallows a programmatic
     `input.value = x` followed by a dispatched `input` event, which is how the
     acceptance probes and any keyboard automation drive this field. A native
     listener on an uncontrolled input answers both a real keystroke and a
     scripted one. */
  useEffect(() => {
    const el = inputRef.current;
    if (!open || !el) return;
    const onInput = () => {
      setQuery(el.value);
      setActive(0);
    };
    el.addEventListener("input", onInput);
    return () => el.removeEventListener("input", onInput);
  }, [open]);

  function fire(command: Command) {
    setOpen(false);
    command.run();
  }

  return (
    <Portal>
      {/* THE WRAP IS THE PERMANENT HOOK, ITS CONTENT IS NOT. `#cmdkWrap` stays
          in the document with `show` as its open state (that is the element the
          acceptance probes hold a reference to before they open anything); the
          field itself mounts with the palette, which is both what replays the
          rise and the row cascade on every open and what keeps a second,
          invisible dialog out of the accessibility tree. */}
      <div
        className={`cmdk-wrap${open ? " show" : ""}`}
        id="cmdkWrap"
        onClick={() => setOpen(false)}
        role="presentation"
      >
        {open && (
        <div
          className="cmdk eg-glass eg-glass-panel"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Search clients, actions, records"
        >
          <div className="inrow">
            {/* Rule 46, the mark census: a SEARCH glyph here, never the > mark. */}
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
              style={{ stroke: "var(--ink-faint)", fill: "none", strokeWidth: 1.5, strokeLinecap: "round" }}
            >
              <circle cx="7" cy="7" r="4.6" />
              <path d="M10.5 10.5 14 14" />
            </svg>
            <input
              ref={inputRef}
              id="cmdkInput"
              placeholder="Search clients, actions, records…"
              aria-label="Search clients, actions, records"
            />
          </div>
          <div className="res">
            {commands.map((c, i) => {
              const index = visible.indexOf(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`r${index === -1 ? " hid" : ""}${index === active ? " sel" : ""}`}
                  style={{ "--i": i } as CSSProperties}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => fire(c)}
                >
                  {c.label}
                  <span className="act">{c.kind}</span>
                </button>
              );
            })}
            <div className={`nores${visible.length ? "" : " on"}`} id="cmdkNores">
              Nothing matches. Try a client or an action.
            </div>
          </div>
        </div>
        )}
      </div>
    </Portal>
  );
}
