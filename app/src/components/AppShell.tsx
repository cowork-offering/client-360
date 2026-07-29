import { useApp } from "../state/appState";
import { TopBar } from "./TopBar";
import { KpiBand } from "./KpiBand";
import { Worklist } from "./Worklist";
import { AccountWorkspace } from "./AccountWorkspace";
import { OnboardingWorkspace } from "./OnboardingWorkspace";
import { OnboardingList, ZoneToggle } from "./OnboardingList";
import { findOnboardingCase } from "../data/onboarding";
import { ChatFab } from "./ChatFab";
import { CommandPalette } from "./CommandPalette";
import { EmptyState, PageContainer } from "./ui";

export function AppShell() {
  const { data, state, worklist } = useApp();
  // Lifecycle is DERIVED, never stored (BUILD-SPEC-V1 §6.3): the shell asks the
  // data whether this relationship is still being onboarded, every render. When
  // its stage reaches Complete it stops being an onboarding case here, leaves
  // the pipeline zone, and the classic tab set mounts with nothing else changed.
  const kase =
    state.view === "account" && state.accountId ? findOnboardingCase(data, state.accountId) : null;
  const inOnboarding = kase !== null && kase.stage !== "Complete";
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
              <PageContainer className="flex flex-col py-6" >
                <div className="flex flex-col" style={{ gap: "var(--stack)" }}>
                  <ZoneToggle bookCount={worklist.accountIds.length} />
                  {state.zone === "onboarding" ? (
                    <OnboardingList />
                  ) : (
                    <>
                      <KpiBand />
                      <Worklist />
                    </>
                  )}
                </div>
              </PageContainer>
            </div>
          ) : inOnboarding && kase ? (
            <OnboardingWorkspace kase={kase} />
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
    </div>
  );
}
