import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { AgentChannel } from "../channel/adapter";
import { createChannel, formatProbe, probeChannels } from "../channel/adapter";
import type { ActivityEntry, C360Data, Worklist } from "../data/contract";
import { deriveWorklist } from "../data/worklist";
import { loadUi, saveUi, type PersistedUi } from "./persist";

export const ACCOUNT_TABS = [
  // A30.1 — Activity is FIRST: the account's narrative spine (what happened,
  // what the analysis concluded, what to do next) before the balance detail.
  { id: "activity", label: "Activity" },
  { id: "exposure", label: "Exposure & Collateral" },
  { id: "covenants", label: "Covenants" },
  { id: "graph", label: "Relationship Graph" },
  { id: "opportunities", label: "Opportunities" },
  { id: "signals", label: "Structural Signals" },
  { id: "financials", label: "Financials" },
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number]["id"];

/** Session-local echo of a message. Mirrors AiMessage's A12 vocabulary so the
 *  merge in ChatPanel is type-identical (F7). */
export interface LocalMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  ts?: string;
  context?: { accountId?: string; tab?: string };
}

export type PanelKind = "none" | "chat" | "actions";

export interface ViewState {
  view: "home" | "account";
  accountId: string | null;
  tab: AccountTab;
  /** Floating panel state — chat and actions are mutually exclusive (A27). */
  panel: PanelKind;
  draft: string;
  localMessages: LocalMessage[];
  /** High-water mark over SERVER messages only; the FAB badges anything newer. */
  seenServerCount: number;
  /** Session-local ACTION_TRIGGERED entries per account (A31.3). */
  sessionActivity: Record<string, ActivityEntry[]>;
}

type Action =
  | { type: "OPEN_ACCOUNT"; accountId: string }
  | { type: "GO_HOME" }
  | { type: "SET_TAB"; tab: AccountTab }
  | { type: "SET_PANEL"; panel: PanelKind }
  | { type: "SET_SEEN"; count: number }
  | { type: "LOG_ACTION"; accountId: string; actionLabel: string }
  | { type: "SET_DRAFT"; draft: string }
  | { type: "PUSH_MESSAGE"; message: LocalMessage }
  | { type: "RESTORE"; ui: Partial<PersistedUi> };

const initial: ViewState = {
  view: "home",
  accountId: null,
  tab: "activity",
  panel: "none",
  draft: "",
  localMessages: [],
  seenServerCount: 0,
  sessionActivity: {},
};

function reducer(state: ViewState, action: Action): ViewState {
  switch (action.type) {
    case "OPEN_ACCOUNT":
      return { ...state, view: "account", accountId: action.accountId };
    case "GO_HOME":
      // Client Actions is an ACCOUNT-ONLY surface (founder feedback
      // 2026-07-25): there is no trigger on home, so it must not survive
      // navigation back there as an orphaned panel with nothing to act on.
      return { ...state, view: "home", panel: state.panel === "actions" ? "none" : state.panel };
    case "SET_TAB":
      return { ...state, tab: action.tab };
    case "SET_PANEL":
      return { ...state, panel: action.panel };
    case "LOG_ACTION": {
      // `Date.now()` is LEGITIMATE here and does not violate A10. A10 governs
      // DATA-DERIVED reasoning, which must be reproducible against the baked
      // meta.generatedAt snapshot. This is live user-generated state — the
      // banker just clicked, in this session, on this clock. Using the render
      // clock instead would timestamp their action in the past.
      const entry: ActivityEntry = {
        id: `local-${action.accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        kind: "ACTION_TRIGGERED",
        title: action.actionLabel,
        summary: "Sent to the desk",
        actor: "You",
        sessionLocal: true,
      };
      const prev = state.sessionActivity[action.accountId] ?? [];
      return {
        ...state,
        sessionActivity: {
          ...state.sessionActivity,
          // Newest first, capped so a long session cannot grow unbounded.
          [action.accountId]: [entry, ...prev].slice(0, 25),
        },
      };
    }
    case "SET_SEEN":
      // Exact set, not a max: the watermark must be able to move DOWN when the
      // server prunes its thread history (C7 clamp).
      return state.seenServerCount === action.count ? state : { ...state, seenServerCount: action.count };
    case "SET_DRAFT":
      return { ...state, draft: action.draft };
    case "PUSH_MESSAGE":
      return { ...state, localMessages: [...state.localMessages, action.message] };
    case "RESTORE":
      return {
        ...state,
        view: action.ui.view ?? state.view,
        accountId: action.ui.accountId ?? state.accountId,
        tab: (action.ui.tab as AccountTab) ?? state.tab,
        panel: action.ui.panel ?? state.panel,
        draft: action.ui.draft ?? state.draft,
        seenServerCount: action.ui.seenServerCount ?? state.seenServerCount,
      };
    default:
      return state;
  }
}

interface AppContextValue {
  data: C360Data;
  worklist: Worklist;
  channel: AgentChannel;
  state: ViewState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Only restore an account view if that account is actually staged (has a bundle
 *  / portfolio row) and the tab is a known one (SPEC §12 A16). Otherwise fall
 *  back to a safe home view rather than an empty workspace. */
function sanitizeRestore(ui: PersistedUi, data: C360Data): Partial<PersistedUi> {
  const knownTabs = new Set(ACCOUNT_TABS.map((t) => t.id));
  const staged = new Set([
    ...Object.keys(data.borrowers ?? {}),
    ...(data.borrower?.snapshot?.accountId ? [data.borrower.snapshot.accountId] : []),
  ]);
  const tab = knownTabs.has(ui.tab as AccountTab) ? ui.tab : "activity";
  const accountOk = !!ui.accountId && staged.has(ui.accountId);
  return {
    view: ui.view === "account" && accountOk ? "account" : "home",
    accountId: accountOk ? ui.accountId : null,
    tab,
    panel: ui.panel === "chat" || ui.panel === "actions" ? ui.panel : "none",
    draft: ui.draft,
    seenServerCount: typeof ui.seenServerCount === "number" ? ui.seenServerCount : 0,
  };
}

export function AppProvider({ data, children }: { data: C360Data; children: ReactNode }) {
  const anchor = data.meta.anchorAccountId;
  const worklist = useMemo(() => deriveWorklist(data), [data]);
  const channel = useMemo(() => createChannel(), []);

  // Channel diagnostics: log ONCE on mount so the founder can read the real
  // runtime surface straight out of the Cowork console (2026-07-25 — the live
  // test showed window.sendPrompt is not exposed; this is how we find what is).
  useEffect(() => {
    try {
      const report = probeChannels();
      console.log("[C360-CHANNEL-PROBE]\n" + formatProbe(report));
      console.log("[C360-CHANNEL-PROBE] raw", report);
    } catch {
      /* diagnostics must never break the render */
    }
  }, []);

  const [state, dispatch] = useReducer(reducer, initial, (base) => {
    const restored = loadUi(anchor);
    return restored ? reducer(base, { type: "RESTORE", ui: sanitizeRestore(restored, data) }) : base;
  });

  useEffect(() => {
    saveUi(anchor, {
      view: state.view,
      accountId: state.accountId,
      tab: state.tab,
      panel: state.panel,
      draft: state.draft,
      seenServerCount: state.seenServerCount,
    });
  }, [anchor, state.view, state.accountId, state.tab, state.panel, state.draft, state.seenServerCount]);

  const value = useMemo<AppContextValue>(
    () => ({ data, worklist, channel, state, dispatch }),
    [data, worklist, channel, state],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
