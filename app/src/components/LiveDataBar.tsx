import { useState } from "react";
import { useApp } from "../state/appState";
import { mcpAvailable, type McpFailure } from "../channel/mcp";
import { refreshAccountDetail, searchMailbox, matchesAccount } from "../channel/cockpitTools";
import type { ActivityEntry } from "../data/contract";
import { fmtRelative } from "../data/format";

type Busy = null | "refresh" | "mail";

/** Live-data affordances for an account (A32.4/A32.5). Rendered only when the
 *  mcp capability is present — with no connector bridge there is nothing to
 *  refresh, and an inert button would be a lie. */
export function LiveDataBar({ accountId, accountName }: { accountId: string; accountName: string }) {
  const { data, state, dispatch } = useApp();
  const [busy, setBusy] = useState<Busy>(null);
  const [failure, setFailure] = useState<McpFailure | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!mcpAvailable()) return null;

  const storedAt = state.liveStoredAt[accountId];

  async function refresh() {
    setBusy("refresh");
    setFailure(null);
    setNote(null);
    try {
      const { patch, failed, storedAt: at } = await refreshAccountDetail(accountId);
      dispatch({ type: "PATCH_BUNDLE", accountId, patch, storedAt: at });
      setNote(
        failed.length
          ? `Refreshed with ${failed.length} of 6 reads unavailable — those sections kept their previous values.`
          : "Refreshed from the org.",
      );
    } catch (e) {
      setFailure(e as McpFailure);
    } finally {
      setBusy(null);
    }
  }

  async function checkInbox() {
    setBusy("mail");
    setFailure(null);
    setNote(null);
    try {
      const { hits } = await searchMailbox(accountName);
      const matched = hits.filter((h) => matchesAccount(h, accountName));
      if (!matched.length) {
        setNote("No client requests found in your mailbox for this relationship.");
        return;
      }
      const generatedAt = data.meta?.generatedAt ?? new Date().toISOString();
      const entries: ActivityEntry[] = matched.map((m) => ({
        id: `mail-${m.id ?? m.subject ?? Math.random().toString(36).slice(2)}`,
        // Clamp a skewed timestamp to the render clock rather than showing a
        // message that appears to arrive from the future.
        ts: m.receivedAt && m.receivedAt <= generatedAt ? m.receivedAt : generatedAt,
        kind: "REQUEST_RECEIVED",
        title: m.subject ?? "Client message",
        summary: m.preview,
        actor: m.from,
        sessionLocal: true,
        reference: { kind: "m365-message", id: m.id, webLink: m.webLink },
      }));
      dispatch({ type: "INGEST_REQUESTS", accountId, entries });
      setNote(`${entries.length} message${entries.length > 1 ? "s" : ""} matched and added to the timeline.`);
    } catch (e) {
      setFailure(e as McpFailure);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-divider px-1 pb-3">
      <button
        type="button"
        onClick={refresh}
        disabled={busy !== null}
        className="c360-press c360-accent-btn inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
      >
        {busy === "refresh" ? "Refreshing…" : "Refresh from org"}
      </button>
      <button
        type="button"
        onClick={checkInbox}
        disabled={busy !== null}
        className="c360-press inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink disabled:opacity-50"
      >
        {busy === "mail" ? "Checking…" : "Check my inbox"}
      </button>
      {storedAt != null && (
        <span className="text-[10.5px] text-ink-faint">
          Live data as of {fmtRelative(new Date(storedAt).toISOString(), data.meta?.generatedAt ?? "")}
        </span>
      )}
      {note && <span className="text-[10.5px] text-ink-muted">{note}</span>}
      {failure && (
        <span className="text-[10.5px] font-semibold" style={{ color: "var(--critical)" }}>
          {failure.fix}
        </span>
      )}
    </div>
  );
}
