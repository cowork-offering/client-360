import { useState } from "react";
import { useApp } from "../state/appState";
import { Portal } from "./Portal";
import { mcpAvailable } from "../channel/mcp";
import { runSyncSweep, type SyncLine } from "../channel/syncSweep";
import { diffBundles, deltaReport, type DeltaField } from "../data/delta";
import type { BorrowerBundle } from "../data/contract";
import { fmtRelative } from "../data/format";

/* =============================================================================
   SYNC (WP7)

   One button in the account header, replacing the separate refresh and inbox
   controls that used to sit on the Activity tab. The entries those produced are
   unchanged; only the trigger moved.

   The sweep is GESTURE ONLY. No polling, no auto-sync, and the button is
   disabled while a sweep runs, so one gesture is one round of reads.
   ============================================================================= */

function Tick({ state }: { state: SyncLine["state"] }) {
  if (state === "done") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={{ color: "var(--positive)" }}>
        <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "failed") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={{ color: "var(--warning)" }}>
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "running") {
    return (
      <span
        className="c360-sync-spin block h-[11px] w-[11px] rounded-full"
        style={{ border: "1.8px solid var(--accent)", borderTopColor: "transparent" }}
        aria-hidden="true"
      />
    );
  }
  return <span className="block h-[11px] w-[11px] rounded-full" style={{ border: "1.5px solid var(--border)" }} aria-hidden="true" />;
}

function SweepConsole({ lines, report }: { lines: SyncLine[]; report: string | null }) {
  return (
    <Portal>
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: "var(--z-modal)", background: "var(--scrim)" }}
        role="presentation"
      >
        <div
          role="status"
          aria-live="polite"
          aria-label="Syncing this relationship"
          className="c360-panel-in w-full max-w-[380px] rounded-[16px] bg-raised px-5 py-4"
          style={{ boxShadow: "var(--shadow-panel)", border: "1px solid var(--border)", transformOrigin: "center" }}
        >
          <div className="kicker mb-3">Syncing</div>
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <li key={l.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex-none">
                  <Tick state={l.state} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="text-[12.5px] leading-snug"
                    style={{ color: l.state === "pending" ? "var(--ink-faint)" : "var(--ink-body)" }}
                  >
                    {l.label}
                  </span>
                  {l.detail && (
                    <span
                      className="block text-[11px] leading-snug"
                      style={{ color: l.state === "failed" ? "var(--warning)" : "var(--ink-faint)" }}
                    >
                      {l.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {report && <div className="mt-3 border-t border-divider pt-3 text-[12.5px] font-semibold text-ink">{report}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function SyncButton({ accountId, accountName, bundle }: { accountId: string; accountName: string; bundle: BorrowerBundle }) {
  const { data, state, dispatch } = useApp();
  const [lines, setLines] = useState<SyncLine[] | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  if (!mcpAvailable()) return null;

  const storedAt = state.liveStoredAt[accountId];

  async function sync() {
    if (running) return; // one gesture, one sweep
    setRunning(true);
    setReport(null);
    dispatch({ type: "CLEAR_PULSE" });

    /** The bundle as the banker was reading it when the sweep started. */
    const before = bundle;
    let deltas: DeltaField[] = [];
    let requestCount = 0;
    try {
      const result = await runSyncSweep({
        accountId,
        accountName,
        generatedAt: data.meta?.generatedAt ?? new Date().toISOString(),
        onLines: setLines,
      });
      // The delta is measured on what the banker was actually reading, against
      // what the org just returned, merged the same way the view merges it.
      deltas = diffBundles(before, { ...before, ...result.patch });
      requestCount = result.requests.length;

      dispatch({ type: "PATCH_BUNDLE", accountId, patch: result.patch, storedAt: result.storedAt });
      if (result.requests.length) dispatch({ type: "INGEST_REQUESTS", accountId, entries: result.requests });
    } catch {
      // A sweep that falls over keeps the workspace exactly as it was. The
      // per-line failures already said what did not come back.
    } finally {
      const summary = deltaReport(deltas, requestCount);
      setReport(summary);
      // Hold the report on the console briefly, then lift the scrim and let
      // the changed values pulse where they sit.
      setTimeout(() => {
        setLines(null);
        setRunning(false);
        if (deltas.length) {
          dispatch({ type: "PULSE", ids: deltas.map((d) => d.id) });
          setTimeout(() => dispatch({ type: "CLEAR_PULSE" }), 2000);
        }
      }, 900);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void sync()}
        disabled={running}
        title={
          storedAt != null
            ? `Live data as of ${fmtRelative(new Date(storedAt).toISOString(), data.meta?.generatedAt ?? "")}`
            : "Read this relationship from the org and check your inbox"
        }
        className="c360-press inline-flex flex-none items-center gap-1.5 self-center rounded-[8px] border border-border px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink disabled:opacity-50"
      >
        <svg width="13" height="13" viewBox="0 0 18 18" aria-hidden="true">
          <path
            d="M15 9a6 6 0 1 1-1.8-4.3M15 3v3.4h-3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {running ? "Syncing…" : "Sync"}
      </button>
      {lines && <SweepConsole lines={lines} report={report} />}
    </>
  );
}
