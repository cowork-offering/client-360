import type { CompileLine } from "../actions/compile";

/* =============================================================================
   THE COMPILE SCREEN (WP7.3)

   Four lines, four real operations. A line is dim until its operation starts,
   spins while it is genuinely in flight, and ticks only once it has returned.

   When something fails, the sequence STOPS on that line and the typed error is
   rendered right there: this screen is the error surface. Lines below it stay
   dim because they never ran, which is the truth and looks like it.
   ============================================================================= */

function Mark({ state }: { state: CompileLine["state"] }) {
  if (state === "done") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ color: "var(--positive)" }}>
        <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "failed") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ color: "var(--critical)" }}>
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "running") {
    return (
      <span
        className="c360-sync-spin block h-[12px] w-[12px] rounded-full"
        style={{ border: "1.9px solid var(--accent)", borderTopColor: "transparent" }}
        aria-hidden="true"
      />
    );
  }
  return <span className="block h-[12px] w-[12px] rounded-full" style={{ border: "1.5px solid var(--border)" }} aria-hidden="true" />;
}

export function CompileScreen({
  lines,
  onRetry,
  onBack,
}: {
  lines: CompileLine[];
  onRetry: () => void;
  onBack: () => void;
}) {
  const failed = lines.find((l) => l.state === "failed");

  return (
    <div className="flex flex-col">
      <div className="px-5 py-4" role="status" aria-live="polite">
        <div className="kicker mb-3">Building the plan</div>
        <ol className="flex flex-col gap-2.5">
          {lines.map((l) => (
            <li key={l.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex-none">
                <Mark state={l.state} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[12.5px] leading-snug"
                  style={{
                    color:
                      l.state === "pending" ? "var(--ink-faint)" : l.state === "failed" ? "var(--critical)" : "var(--ink-body)",
                  }}
                >
                  {l.label}
                </span>
                {l.detail && (
                  <span
                    className="mt-0.5 block text-[11.5px] leading-relaxed"
                    style={{ color: l.state === "failed" ? "var(--critical)" : "var(--ink-faint)" }}
                  >
                    {l.detail}
                  </span>
                )}
                {l.error?.orgError && (
                  <span className="mt-0.5 block font-mono text-[10.5px] leading-relaxed" style={{ color: "var(--critical)" }}>
                    {l.error.orgError}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {failed && (
        <div className="flex items-center gap-2 border-t border-divider px-5 py-3">
          <span className="flex-1 text-[11px] leading-relaxed text-ink-muted">
            {failed.retryable
              ? "Nothing was written. You can send it again."
              : "Nothing was written. Change the details and build the plan again."}
          </span>
          <button
            type="button"
            onClick={onBack}
            className="c360-press rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
          >
            Back to the briefing
          </button>
          {failed.retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="c360-btn rounded-md px-3.5 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
