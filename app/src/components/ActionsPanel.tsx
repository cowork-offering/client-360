import { useState, type ReactNode } from "react";
import { useApp } from "../state/appState";
import { ACTIONS, ACTIONS_BY_ID, CATEGORY_ORDER, renderPrompt, type ActionIcon, type ClientAction } from "../actions/registry";
import { newRequestId } from "../channel/adapter";
import { mcpAvailable, type McpFailure } from "../channel/mcp";
import { executeAction } from "../actions/execute";
import { resolveBundle } from "../actions/registry";
import { ActionGlyph } from "./ActionIcon";
import { CopyPromptDialog } from "./CopyPromptDialog";
import { ActionPanel } from "./ActionPanel";
import { findOnboardingCase, type OnboardingCase } from "../data/onboarding";
import {
  ONBOARDING_ACTIONS,
  ONBOARDING_CATEGORY_ORDER,
  onboardingAvailability,
  type OnboardingAction,
} from "../actions/onboardingActions";
import { OnboardingTicket } from "./OnboardingTicket";
import { openWorkroom, workroomContextFor, workroomModeFor } from "../workroom/openWorkroom";

/** The case behind the open workspace, or null when the open relationship is
 *  booked. DERIVED every render, on the same rule AppShell mounts the shell
 *  with (BUILD-SPEC-V1 §6.3), so the panel and the workspace can never disagree
 *  about which lifecycle the banker is in. */
export function useOpenOnboardingCase(): OnboardingCase | null {
  const { data, state } = useApp();
  const kase = state.view === "account" && state.accountId ? findOnboardingCase(data, state.accountId) : null;
  return kase && kase.stage !== "Complete" ? kase : null;
}

/** One row of the actions panel — the product's single action grammar: glyph,
 *  label, description, and either a run or an open. Both lifecycles render
 *  through this, which is the point: a banker cannot tell the surfaces apart. */
function ActionRow({
  icon,
  label,
  description,
  available,
  reason,
  onClick,
  status,
  detail,
  rowClass = "c360-action-row",
}: {
  icon: ActionIcon;
  label: string;
  description: string;
  available: boolean;
  reason?: string;
  onClick: () => void;
  status?: ReactNode;
  detail?: ReactNode;
  /** The row's own class. Defaults to the registry's, which the panel's row
   *  count is asserted against; the workroom entries carry their own. */
  rowClass?: string;
}) {
  return (
    <button
      type="button"
      disabled={!available}
      aria-disabled={!available}
      onClick={onClick}
      className={`${rowClass} flex w-full items-start gap-3 border-b border-divider px-4 py-3 text-left disabled:cursor-not-allowed`}
    >
      <span
        className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[9px]"
        style={{
          background: available ? "var(--accent-wash)" : "var(--wash-2)",
          color: available ? "var(--accent)" : "var(--ink-faint)",
        }}
      >
        <ActionGlyph name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: available ? "var(--ink)" : "var(--ink-muted)" }}>
            {label}
          </span>
          {status}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">{description}</span>
        {detail}
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
}

/** The onboarding half of the panel. Same rows, same categories, same "opens
 *  the ticket" affordance — every onboarding action has a panel, so nothing
 *  here fires directly and the ticket owns the confirm gesture. */
function OnboardingRows({ kase }: { kase: OnboardingCase }) {
  const [ticket, setTicket] = useState<OnboardingAction | null>(null);
  return (
    <>
      {ONBOARDING_CATEGORY_ORDER.map((category) => {
        const rows = ONBOARDING_ACTIONS.filter((a) => a.category === category);
        if (!rows.length) return null;
        return (
          <section key={category}>
            <div className="kicker px-4 pb-1 pt-3">{category}</div>
            {rows.map((action) => {
              const { available, reason } = onboardingAvailability(action, kase);
              return (
                <ActionRow
                  key={action.id}
                  icon={action.icon}
                  label={action.label}
                  description={action.description}
                  available={available}
                  reason={reason}
                  onClick={() => setTicket(action)}
                />
              );
            })}
          </section>
        );
      })}
      {ticket && <OnboardingTicket action={ticket} kase={kase} onClose={() => setTicket(null)} />}
    </>
  );
}

/**
 * THE WORKROOM ROWS.
 *
 * Three registry actions are being rebuilt as workroom work — reshaping a
 * package, renewing what is maturing, composing something new — and each opens
 * the room in its own mode with the package context already resolved. They sit
 * in their own section ABOVE the registry rather than replacing those rows,
 * because the wired tickets still file real records and the room does not yet.
 * When it does, the registry rows retire and this section becomes the surface.
 *
 * AVAILABILITY comes from the registry action each row shadows, so a package
 * the org will not let a banker modify does not offer a workroom for it either.
 */
const WORKROOM_ROWS: { actionId: string; label: string; description: string }[] = [
  {
    actionId: "loan-modification",
    label: "Reshape this package",
    description: "Talk the change into shape. Confirmed changes stack in one manifest under one approval.",
  },
  {
    actionId: "renewal",
    label: "Renew what is maturing",
    description: "Compose the renewal terms. Booking runs through nCino's own Submit for Approval process.",
  },
  {
    actionId: "new-facility-request",
    label: "Compose something new",
    description: "A facility inside this package, or a package of its own, from the account's collateral and structure.",
  },
];

function WorkroomRows({ accountId, accountName }: { accountId: string; accountName: string }) {
  const { data } = useApp();
  return (
    <section>
      <div className="kicker px-4 pb-1 pt-3">Workroom</div>
      {WORKROOM_ROWS.map((row) => {
        const action = ACTIONS_BY_ID[row.actionId];
        const mode = workroomModeFor(row.actionId);
        if (!action || !mode) return null;
        const { available, reason } = action.availability(data, accountId);
        return (
          <ActionRow
            key={row.actionId}
            icon={action.icon}
            label={row.label}
            description={row.description}
            available={available}
            reason={reason}
            rowClass="c360-workroom-row"
            onClick={() =>
              openWorkroom(
                workroomContextFor({ mode, data, bundle: resolveBundle(data, accountId), accountId, accountName }),
              )
            }
          />
        );
      })}
    </section>
  );
}

/** Client Actions control center (A27.4). Every registry action is listed,
 *  grouped by category. Unavailable actions stay visible and disabled with the
 *  registry's concrete reason — the control-center honesty rule (A27.3). */
export function ActionsPanelBody() {
  const { data, channel, state, dispatch } = useApp();
  const [sentId, setSentId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; failure: McpFailure } | null>(null);
  const [answer, setAnswer] = useState<{ id: string; text: string } | null>(null);
  const [fallback, setFallback] = useState<{ prompt: string } | null>(null);
  // A33.1.1 entry point 1 of 3.
  const [panelActionId, setPanelActionId] = useState<string | null>(null);
  const kase = useOpenOnboardingCase();

  const accountId = state.view === "account" ? state.accountId : null;
  const account = accountId ? data.portfolio.accounts.find((a) => a.accountId === accountId) : null;
  const accountName = account?.name ?? data.borrower?.snapshot?.name ?? "this relationship";

  async function run(action: ClientAction) {
    if (!accountId) return;
    // A33.1.2 — an action that declares a panel opens it instead of firing.
    // The panel owns the confirm gesture; nothing executes from this row.
    if (action.hasPanel) {
      setPanelActionId(action.id);
      return;
    }
    const prompt = renderPrompt(action, accountName, accountId);
    setFailure(null);
    setAnswer(null);

    // LIVE PATH — execute through the connectors. No copy-prompt dialog here:
    // that fallback exists only where there is no capability at all.
    if (mcpAvailable()) {
      setRunningId(action.id);
      try {
        const result = await executeAction({
          action,
          data,
          bundle: resolveBundle(data, accountId),
          accountId,
          accountName,
          tab: "Client Actions",
        });
        if (result.patch) {
          dispatch({ type: "PATCH_BUNDLE", accountId, patch: result.patch, storedAt: result.storedAt });
        }
        dispatch({ type: "LOG_ACTION", accountId, actionLabel: action.label });
        if (result.text) setAnswer({ id: action.id, text: result.text });
        setSentId(action.id);
      } catch (e) {
        setFailure({ id: action.id, failure: e as McpFailure });
      } finally {
        setRunningId(null);
      }
      return;
    }

    // No capability in this view — carry the ask into a live session.
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

  // A case that is not booked yet has its OWN actions, in this same panel. The
  // credit registry is not merely unavailable here — none of it applies to a
  // relationship with no rating, no exposure and no facilities.
  if (kase) {
    return (
      <div className="py-1">
        <OnboardingRows kase={kase} />
      </div>
    );
  }

  return (
    <div className="py-1">
      {!accountId && (
        <div className="mx-3 my-2 rounded-md border border-dashed border-border bg-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-muted">
          Open a relationship or an onboarding case from the worklist to run actions against it.
        </div>
      )}

      {accountId && <WorkroomRows accountId={accountId} accountName={accountName} />}

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
                <ActionRow
                  key={action.id}
                  icon={action.icon}
                  label={action.label}
                  description={action.description}
                  available={available}
                  reason={reason}
                  onClick={() => run(action)}
                  status={
                    <>
                      {runningId === action.id && (
                        <span className="text-[9.5px] font-bold uppercase tracking-wide text-ink-faint">Running…</span>
                      )}
                      {sent && runningId !== action.id && (
                        <span
                          className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                          style={{ background: "var(--positive-bg)", color: "var(--positive)" }}
                        >
                          {mcpAvailable() ? "Done" : "Sent to desk"}
                        </span>
                      )}
                    </>
                  }
                  detail={
                    <>
                      {answer?.id === action.id && (
                        <span className="mt-2 block whitespace-pre-wrap rounded-md border border-border bg-surface px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-body">
                          {answer.text}
                        </span>
                      )}
                      {failure?.id === action.id && (
                        <span className="mt-1.5 block text-[11px] font-semibold" style={{ color: "var(--critical)" }}>
                          {failure.failure.fix}
                        </span>
                      )}
                    </>
                  }
                />
              );
            })}
          </section>
        );
      })}

      {panelActionId && (
        <ActionPanel actionId={panelActionId} onClose={() => setPanelActionId(null)} />
      )}

      {fallback && accountId && (
        <CopyPromptDialog
          // Every action requires a staged bundle (registry C1), so reaching
          // this fallback always means "no channel", never "not staged".
          cause="no-channel"
          accountName={accountName}
          accountId={accountId}
          prompt={fallback.prompt}
          onClose={() => setFallback(null)}
        />
      )}
    </div>
  );
}
