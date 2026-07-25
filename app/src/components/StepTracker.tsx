import type { Snapshot } from "../data/contract";
import type { StagedOutput } from "../actions/stagedPlan";
import { actionTerminal, blockingPrecondition, STEP_TYPE_LABEL, type StepState, type TrackerState } from "../actions/tracker";
import type { DecisionToken } from "../actions/decisionToken";
import { OpenInNcino } from "./DeepLink";

/* A33.3.3 / A33.3.5 — the tracker shows WHERE a plan got to, never a false
   green. Failure is located, preserved and resumable; a timeout reads as filed
   but unverified, and a step blocked on an unverified precondition says which
   fact it is waiting on rather than quietly running anyway. */

const STATE_COPY: Record<StepState, { label: string; bg: string; fg: string }> = {
  pending: { label: "Not started", bg: "var(--wash-2)", fg: "var(--ink-muted)" },
  running: { label: "Running", bg: "var(--accent-wash)", fg: "var(--accent)" },
  waiting: { label: "Waiting", bg: "var(--warning-bg)", fg: "var(--warning)" },
  filed_unverified: { label: "Filed, unverified", bg: "var(--warning-bg)", fg: "var(--warning)" },
  verified: { label: "Verified", bg: "var(--positive-bg)", fg: "var(--positive)" },
  failed: { label: "Failed", bg: "var(--critical-bg)", fg: "var(--critical)" },
  ambiguous: { label: "Outcome unknown", bg: "var(--critical-bg)", fg: "var(--critical)" },
  skipped_not_attempted: { label: "Not attempted", bg: "var(--wash-2)", fg: "var(--ink-faint)" },
};

const TERMINAL_COPY: Record<string, string> = {
  in_progress: "Running.",
  success: "Every step completed or handed off as planned.",
  partial: "Some steps completed and some did not. Nothing below is claimed as verified unless it says so.",
  failed: "Nothing was verified. The plan stopped at the first failure.",
};

export function StepTracker({
  plan,
  state,
  token,
  snapshot,
}: {
  plan: StagedOutput;
  state: TrackerState;
  token: DecisionToken | null;
  snapshot: Snapshot | undefined;
  onChange?: (s: TrackerState) => void;
}) {
  const terminal = actionTerminal(state, plan.steps);

  return (
    <div className="flex flex-col">
      <div className="border-b border-divider px-5 py-4">
        <div className="kicker mb-1.5">Progress</div>
        <p className="text-[12.5px] leading-relaxed text-ink-body">{TERMINAL_COPY[terminal]}</p>
        {token && (
          <p className="mt-1 text-[10.5px] text-ink-faint">
            Confirmed by {token.userId}. This records that a named person saw this plan, and nothing more.
          </p>
        )}
      </div>

      <div className="border-b border-divider">
        {plan.steps.map((s) => {
          const rt = state.steps.find((r) => r.id === s.id)!;
          const copy = STATE_COPY[rt.state];
          const blocked = rt.state === "pending" ? blockingPrecondition(s, state) : null;
          return (
            <div key={s.id} className="flex items-start gap-3 border-b border-divider px-5 py-3 last:border-b-0">
              <span
                className="mt-0.5 flex-none rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                style={{ background: copy.bg, color: copy.fg }}
              >
                {copy.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                    {STEP_TYPE_LABEL[s.type]}
                  </span>
                  <span className="text-[12.5px] font-medium text-ink">{s.label}</span>
                </span>
                {rt.note && <span className="mt-0.5 block text-[11px] text-ink-muted">{rt.note}</span>}
                {blocked && (
                  <span className="mt-0.5 block text-[11px] text-ink-muted">
                    Waiting on step {blocked} to be verified. It will not run on its own.
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* A33.3.6 — every terminal state offers the deep link. */}
      <div className="flex items-center gap-2 px-5 py-4">
        <OpenInNcino snapshot={snapshot} />
      </div>
    </div>
  );
}
