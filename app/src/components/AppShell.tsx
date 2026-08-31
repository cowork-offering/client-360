import { useEffect, useMemo } from "react";
import { useApp } from "../state/appState";
import { TopBar } from "./TopBar";
import { Landing } from "./Landing";
import { Whisper } from "./Whisper";
import { AccountWorkspace } from "./AccountWorkspace";
import { ChatFab } from "./ChatFab";
import { CommandPalette } from "./CommandPalette";
import { EmptyState } from "./ui";
import { WorkroomHost } from "./workroom/WorkroomHost";
import { buildWorklistRows } from "../data/worklistRows";

export function AppShell() {
  const { data, worklist, state } = useApp();
  const staged =
    state.view === "account" && state.accountId
      ? (data.borrowers ?? {})[state.accountId] ??
        (data.borrower?.snapshot?.accountId === state.accountId ? data.borrower : undefined)
      : undefined;
  // Live refreshes are merged OVER the staged snapshot at read time, so a
  // partial refresh never blanks a slice the org failed to return.
  const patch = state.accountId ? state.livePatches[state.accountId] : undefined;
  const bundle = staged && patch ? { ...staged, ...patch } : staged;
  const home = state.view === "home";

  // The header capsule appears only on a client (rule 45). The flag is a body
  // class rather than a prop because the capsule is positioned chrome, and CSS
  // is where its enter and exit live.
  useEffect(() => {
    document.body.classList.toggle("on-client", !home);
    return () => document.body.classList.remove("on-client");
  }, [home]);

  const topRow = useMemo(() => buildWorklistRows(data, worklist)[0], [data, worklist]);

  return (
    /* THE LANDING IS A DOCUMENT, THE CLIENT VIEW IS A PANE. The landing flows
       past the fold and lets the WINDOW scroll it, which is the only way the
       sticky bar can know content has slid beneath it (rule 70.5). The client
       view keeps its viewport-locked shell with its own inner scroller until
       Surface 2 re-cuts it. */
    <div className={home ? "flex min-h-screen flex-col" : "flex h-screen flex-col"}>
      <TopBar />
      <div className={home ? "flex flex-1" : "flex min-h-0 flex-1"}>
        <main className={home ? "flex flex-1 flex-col" : "flex min-h-0 flex-1 flex-col"}>
          {home ? (
            <Landing />
          ) : bundle ? (
            <AccountWorkspace bundle={bundle} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                title="Account not staged"
                body="This account has no bundle in the current snapshot. Return to the worklist and open it via the agent."
              />
            </div>
          )}
        </main>
      </div>
      {home && <Whisper row={topRow} />}
      <ChatFab />
      <CommandPalette />
      {/* The workroom is a FULL-SURFACE overlay over the cockpit, so it mounts
          at the shell rather than inside the panel that opened it: closing that
          panel must not take the room down with it. */}
      <WorkroomHost />
    </div>
  );
}
