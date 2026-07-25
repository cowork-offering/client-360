import { useMemo, useState } from "react";
import { useApp, ACCOUNT_TABS } from "../state/appState";
import type { AiMessage } from "../data/contract";
import { formatProbe, newRequestId, probeChannels } from "../channel/adapter";
import { suggestActions, type Suggestion } from "../actions/suggest";
import { ACTIONS_BY_ID } from "../actions/registry";

type SendState = "idle" | "sending" | "handedOff" | "error";

/** Channel diagnostics disclosure, shown only in the no-channel state.
 *  Collapsed by default; the probe runs on first open (and not before), so a
 *  banker who never opens it pays nothing. No polling — one read per open. */
function ConnectionDetails() {
  const [report, setReport] = useState<string | null>(null);

  return (
    <details
      className="mt-2"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && report === null) {
          try {
            setReport(formatProbe(probeChannels()));
          } catch (err) {
            setReport("probe failed: " + String(err));
          }
        }
      }}
    >
      <summary className="cursor-pointer text-[11px] font-semibold text-ink-faint hover:text-ink-muted">
        Connection details
      </summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-muted">
        {report ?? "…"}
      </pre>
    </details>
  );
}

/** Merge injected threads + session-local messages, dedupe by id (A15). */
function mergeMessages(threads: AiMessage[], local: AiMessage[]): AiMessage[] {
  const seen = new Set<string>();
  const out: AiMessage[] = [];
  for (const m of [...threads, ...local]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** Suggestion chips (A27.5). Data-driven by design: this component renders
 *  whatever Suggestion[] it is handed, so agent-supplied suggestions can
 *  replace the client-computed ones without touching the UI. */
function SuggestionChips({
  suggestions,
  disabled,
  onPick,
}: {
  suggestions: Suggestion[];
  disabled: boolean;
  onPick: (s: Suggestion) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {suggestions.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          title={s.prompt}
          className="c360-press rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function ChatPanelBody() {
  const { data, worklist, channel, state, dispatch } = useApp();
  const [sendState, setSendState] = useState<SendState>("idle");

  const account =
    state.view === "account" && state.accountId
      ? data.portfolio.accounts.find((a) => a.accountId === state.accountId)
      : null;
  const tabLabel =
    state.view === "account" ? (ACCOUNT_TABS.find((t) => t.id === state.tab)?.label ?? null) : "Worklist";

  const historyMessages = useMemo<AiMessage[]>(() => {
    const out: AiMessage[] = [];
    for (const t of data.aiPanel?.threads ?? []) for (const m of t.messages ?? []) if (m?.id) out.push(m);
    return out;
  }, [data.aiPanel]);

  const messages = useMemo(
    () => mergeMessages(historyMessages, state.localMessages),
    [historyMessages, state.localMessages],
  );

  const suggestions = useMemo(
    () => suggestActions(data, worklist, account?.accountId ?? null, account?.name ?? null),
    [data, worklist, account],
  );

  const available = channel.available();
  const sending = sendState === "sending";
  const canSend = available && !sending && state.draft.trim().length > 0;

  /** Chip click: send, and if the chip is registry-backed log it to the
   *  account timeline like any other triggered action (A31.3). Book-level
   *  chips have no registry action, so nothing is logged. */
  async function sendSuggestion(s: Suggestion) {
    const action = ACTIONS_BY_ID[s.id];
    if (action && account?.accountId) {
      dispatch({ type: "LOG_ACTION", accountId: account.accountId, actionLabel: action.label });
    }
    await send(s.prompt);
  }

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || !channel.available() || sending) return;

    const requestId = newRequestId();
    dispatch({
      type: "PUSH_MESSAGE",
      message: {
        id: requestId,
        role: "user",
        text: prompt,
        ts: new Date().toISOString(),
        context: { accountId: account?.accountId, tab: tabLabel ?? undefined },
      },
    });
    dispatch({ type: "SET_DRAFT", draft: "" });
    setSendState("sending");
    try {
      await channel.request(prompt, {
        requestId,
        accountId: account?.accountId,
        accountName: account?.name,
        tab: tabLabel ?? undefined,
      });
      setSendState("handedOff");
    } catch {
      setSendState("error");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Ask about exposure, covenants, structure, or the next best action. Answers are grounded in the staged
            relationship data.
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`c360-row-in ${m.role === "user" ? "flex justify-end" : "flex justify-start"}`}>
                <div
                  className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: "var(--accent)", color: "var(--accent-ink)" }
                      : { background: "var(--surface-overlay)", color: "var(--ink)" }
                  }
                >
                  {/* PLAIN TEXT ONLY (A13) — React escapes; no HTML/Markdown parsing. */}
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(sendState === "handedOff" || sendState === "error") && (
        <div
          className="flex-none border-t border-divider px-4 py-2 text-[10.5px]"
          style={{ color: sendState === "error" ? "var(--critical)" : "var(--ink-faint)" }}
        >
          {sendState === "error"
            ? "Could not reach the desk. Try again from an agent-connected session."
            : "Handed off to the desk. The cockpit refreshes in place when the answer lands."}
        </div>
      )}

      {/* Composer */}
      <div className="flex-none border-t border-divider pt-2">
        <SuggestionChips suggestions={suggestions} disabled={!available || sending} onPick={(s) => void sendSuggestion(s)} />
        {available ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(state.draft);
            }}
            className="flex items-end gap-2 px-3 pb-3"
          >
            <textarea
              data-autofocus
              value={state.draft}
              onChange={(e) => dispatch({ type: "SET_DRAFT", draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(state.draft);
                }
              }}
              rows={2}
              disabled={sending}
              placeholder={sending ? "Sending…" : "Ask about this relationship…"}
              className="min-h-0 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-border-strong focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="c360-btn flex-none rounded-md px-3 py-2 text-[12px] font-semibold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {sending ? "…" : "Send"}
            </button>
          </form>
        ) : (
          <div className="mx-3 mb-3 rounded-md border border-dashed border-border bg-surface px-3 py-3">
            <div className="text-[12px] font-semibold text-ink">Chat unavailable in this view</div>
            <div className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
              No agent channel is connected to this artifact. Open the cockpit through the agent to ask questions; the
              staged data stays fully navigable offline.
            </div>
            <ConnectionDetails />
          </div>
        )}
      </div>
    </div>
  );
}
