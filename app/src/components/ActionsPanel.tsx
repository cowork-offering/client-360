import { useState } from "react";
import { useApp } from "../state/appState";
import { ACTIONS, CATEGORY_ORDER, renderPrompt, type ClientAction } from "../actions/registry";
import { newRequestId } from "../channel/adapter";
import { ActionGlyph } from "./ActionIcon";
import { CopyPromptDialog } from "./CopyPromptDialog";

/** Client Actions control center (A27.4). Every registry action is listed,
 *  grouped by category. Unavailable actions stay visible and disabled with the
 *  registry's concrete reason — the control-center honesty rule (A27.3). */
export function ActionsPanelBody() {
  const { data, channel, state, dispatch } = useApp();
  const [sentId, setSentId] = useState<string | null>(null);
  const [fallback, setFallback] = useState<{ prompt: string } | null>(null);

  const accountId = state.view === "account" ? state.accountId : null;
  const account = accountId ? data.portfolio.accounts.find((a) => a.accountId === accountId) : null;
  const accountName = account?.name ?? data.borrower?.snapshot?.name ?? "this relationship";

  async function run(action: ClientAction) {
    if (!accountId) return;
    const prompt = renderPrompt(action, accountName, accountId);
    if (!channel.available()) {
      setFallback({ prompt });
      return;
    }
    try {
      await channel.request(prompt, { requestId: newRequestId(), accountId, accountName, tab: "Client Actions" });
      dispatch({ type: "LOG_ACTION", accountId, actionLabel: action.label });
      setSentId(action.id);
    } catch {
      setFallback({ prompt });
    }
  }

  return (
    <div className="py-1">
      {!accountId && (
        <div className="mx-3 my-2 rounded-md border border-dashed border-border bg-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-muted">
          Open a relationship from the worklist to run actions against it.
        </div>
      )}

      {CATEGORY_ORDER.map((category) => {
        const rows = ACTIONS.filter((a) => a.category === category);
        if (!rows.length) return null;
        return (
          <section key={category}>
            <div className="kicker px-4 pb-1 pt-3">{category}</div>
            {rows.map((action) => {
              const { available, reason } = action.availability(data, accountId);
              const sent = sentId === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={!available}
                  aria-disabled={!available}
                  onClick={() => run(action)}
                  className="c360-action-row flex w-full items-start gap-3 border-b border-divider px-4 py-3 text-left disabled:cursor-not-allowed"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[9px]"
                    style={{
                      background: available ? "var(--accent-wash)" : "var(--wash-2)",
                      color: available ? "var(--accent)" : "var(--ink-faint)",
                    }}
                  >
                    <ActionGlyph name={action.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className="text-[13px] font-bold"
                        style={{ color: available ? "var(--ink)" : "var(--ink-muted)" }}
                      >
                        {action.label}
                      </span>
                      {sent && (
                        <span
                          className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                          style={{ background: "var(--positive-bg)", color: "var(--positive)" }}
                        >
                          Sent to desk
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                      {action.description}
                    </span>
                    {!available && reason && (
                      <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
                        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M8 4.8v.1M8 7v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {reason}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}

      {fallback && accountId && (
        <CopyPromptDialog
          accountName={accountName}
          accountId={accountId}
          prompt={fallback.prompt}
          onClose={() => setFallback(null)}
        />
      )}
    </div>
  );
}
