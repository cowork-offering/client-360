import { useEffect, useMemo, useRef } from "react";
import { useApp, ACCOUNT_TABS } from "../state/appState";
import { FloatingPanel } from "./FloatingPanel";
import { ChatPanelBody } from "./ChatPanel";
import { ActionsPanelBody } from "./ActionsPanel";
import { ACTIONS_TRIGGER_ID } from "./actionsTrigger";

/** Count of SERVER (agent-authored) messages only — the unread watermark basis.
 *  Locally echoed messages are deliberately excluded: they vanish on a full
 *  artifact replace, so counting them would inflate the watermark past the
 *  server total and swallow the next genuine reply (C7). */
function useServerMessageCount(): number {
  const { data } = useApp();
  return useMemo(() => {
    let n = 0;
    for (const t of data.aiPanel?.threads ?? []) n += (t.messages ?? []).length;
    return n;
  }, [data.aiPanel]);
}

/** Page-agnostic floating action surface (A27.1): the chat FAB, bottom-right,
 *  present on home and every tab. The panel it opens is a sibling — thread and
 *  draft live in app state, so both survive view switches and open/close. */
export function ChatFab() {
  const { data, state, dispatch } = useApp();
  const fabRef = useRef<HTMLButtonElement>(null);
  const serverCount = useServerMessageCount();

  const open = state.panel === "chat";
  const unread = Math.max(0, serverCount - state.seenServerCount);

  // Clamp DOWN when the server prunes its history, so a shrunken thread cannot
  // leave a stale watermark that hides the next reply (C7).
  useEffect(() => {
    if (state.seenServerCount > serverCount) dispatch({ type: "SET_SEEN", count: serverCount });
  }, [serverCount, state.seenServerCount, dispatch]);

  // Opening the panel marks everything currently on the server as seen.
  useEffect(() => {
    if (open && state.seenServerCount !== serverCount) dispatch({ type: "SET_SEEN", count: serverCount });
  }, [open, serverCount, state.seenServerCount, dispatch]);

  const account =
    state.view === "account" && state.accountId
      ? data.portfolio.accounts.find((a) => a.accountId === state.accountId)
      : null;
  const tabLabel =
    state.view === "account" ? (ACCOUNT_TABS.find((t) => t.id === state.tab)?.label ?? null) : "Worklist";
  const subtitle = `${account ? account.name : "Whole book"}${tabLabel ? ` · ${tabLabel}` : ""}`;

  return (
    <>
      {state.panel === "chat" && (
        <FloatingPanel
          title="Ask the desk"
          subtitle={subtitle}
          variant="popover"
          returnFocusTo={() => fabRef.current}
          onClose={() => dispatch({ type: "SET_PANEL", panel: "none" })}
        >
          <ChatPanelBody />
        </FloatingPanel>
      )}

      {state.panel === "actions" && (
        <FloatingPanel
          title="Client Actions"
          subtitle={subtitle}
          variant="sheet"
          returnFocusTo={() => document.getElementById(ACTIONS_TRIGGER_ID)}
          onClose={() => dispatch({ type: "SET_PANEL", panel: "none" })}
        >
          <ActionsPanelBody />
        </FloatingPanel>
      )}

      {/* One floating surface at a time: the FAB stands down while the Client
          Actions panel is open, and returns when it closes (founder feedback
          2026-07-25). */}
      {/* THE MARK'S CORNER (HANDOVER §3): right 44 / bottom 52, off the shared
          --fab-* anchor so the whisper chip hangs on the same object. The FAB's
          own material (ink body, idle halo, action arc) is Surface 4's; this
          wave only gives it its address and the `#fab` hook the whisper's beat
          rides. */}
      {state.panel !== "actions" && (
      <button
        ref={fabRef}
        id="fab"
        type="button"
        onClick={() => dispatch({ type: "SET_PANEL", panel: open ? "none" : "chat" })}
        aria-expanded={open}
        aria-label={open ? "Close chat" : unread > 0 ? `Open chat, ${unread} new` : "Open chat"}
        className="c360-fab fixed flex items-center justify-center rounded-full"
        style={{
          zIndex: "var(--z-fab)",
          background: "var(--accent)",
          color: "var(--accent-ink)",
          right: "var(--fab-right)",
          bottom: "var(--fab-bottom)",
          width: "var(--fab-size)",
          height: "var(--fab-size)",
        }}
      >
        <span className="c360-fab-glyph flex items-center justify-center" data-open={open ? "1" : "0"}>
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="21" height="21" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M17 9.2c0 3.2-3.1 5.8-7 5.8-.86 0-1.68-.13-2.44-.36L3.6 16l.9-2.66C3.55 12.3 3 10.82 3 9.2 3 6 6.1 3.4 10 3.4s7 2.6 7 5.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        {!open && unread > 0 && (
          <span
            className="c360-fab-badge absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10.5px] font-bold"
            style={{ background: "var(--critical)", color: "var(--ink-inverse)", border: "2px solid var(--surface)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      )}
    </>
  );
}
