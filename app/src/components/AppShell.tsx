import { useApp } from "../state/appState";
import { TopBar } from "./TopBar";
import { KpiBand } from "./KpiBand";
import { Worklist } from "./Worklist";
import { AccountWorkspace } from "./AccountWorkspace";
import { ChatFab } from "./ChatFab";
import { CommandPalette } from "./CommandPalette";
import { EmptyState, PageContainer } from "./ui";
import { WorkroomHost } from "./workroom/WorkroomHost";

export function AppShell() {
  const { data, state } = useApp();
  const staged =
    state.view === "account" && state.accountId
      ? (data.borrowers ?? {})[state.accountId] ??
        (data.borrower?.snapshot?.accountId === state.accountId ? data.borrower : undefined)
      : undefined;
  // Live refreshes are merged OVER the staged snapshot at read time, so a
  // partial refresh never blanks a slice the org failed to return.
  const patch = state.accountId ? state.livePatches[state.accountId] : undefined;
  const bundle = staged && patch ? { ...staged, ...patch } : staged;

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col">
          {state.view === "home" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <PageContainer className="flex flex-col py-6">
                <div className="flex flex-col" style={{ gap: "var(--stack)" }}>
                  <KpiBand />
                  <Worklist />
                </div>
              </PageContainer>
            </div>
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
      <ChatFab />
      <CommandPalette />
      {/* The workroom is a FULL-SURFACE overlay over the cockpit, so it mounts
          at the shell rather than inside the panel that opened it: closing that
          panel must not take the room down with it. */}
      <WorkroomHost />
    </div>
  );
}
