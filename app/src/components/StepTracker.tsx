import { useEffect, useState } from "react";
import type { Snapshot } from "../data/contract";
import type { StagedOutput } from "../actions/stagedPlan";
import { actionTerminal, blockingPrecondition, STEP_TYPE_LABEL, type StepState, type TrackerState } from "../actions/tracker";
import type { DecisionToken } from "../actions/decisionToken";
import { OpenInNcino } from "./DeepLink";
import type { ExecuteResult } from "../channel/writeTools";
import { compilePace } from "../actions/compile";

/* A33.3.3 / A33.3.5 — the tracker shows WHERE a plan got to, never a false
   green. Failure is located, preserved and resumable; a timeout reads as filed
   but unverified, and a step blocked on an unverified precondition says which
   fact it is waiting on rather than quietly running anyway.

   WP7.4 adds the reveal, and the reveal is PRESENTATION ONLY. The executor has
   already returned every step's final state and the state machine still owns
   every transition. What the reveal changes is the pace at which those settled
   states are shown, one row at a time, so the banker reads the outcome instead
   of being handed a wall of it. A row that has not landed yet renders as the
   plan's own pre-execution state; no row ever shows a state the executor did
   not return. Reduced motion lands everything at once. */

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

/** The record the write created, in banker language with its id underneath. */
function filedRecord(outcome: ExecuteResult | null | undefined): { label: string; id: string } | null {
  if (!outcome) return null;
  if (outcome.valuationId) return { label: "collateral valuation", id: outcome.valuationId };
  if (outcome.caseId) return { label: "service request", id: outcome.caseId };
  if (outcome.reviewId) return { label: "annual credit review", id: outcome.reviewId };
  return null;
}

/** Reveal the settled rows one at a time. Returns how many have landed. */
function useReveal(count: number, paused: boolean): number {
  const [landed, setLanded] = useState(() => (compilePace() === 0 || paused ? count : 0));

  useEffect(() => {
    const pace = compilePace();
    if (pace === 0 || paused) {
      setLanded(count);
      return;
    }
    setLanded(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setLanded(i);
      if (i >= count) clearInterval(timer);
    }, pace);
    return () => clearInterval(timer);
  }, [count, paused]);

  return landed;
}

export function StepTracker({
  plan,
  state,
  token,
  snapshot,
  outcome,
}: {
  plan: StagedOutput;
  state: TrackerState;
  token: DecisionToken | null;
  snapshot: Snapshot | undefined;
  /** Present once the executor has run. Its own words win over ours. */
  outcome?: ExecuteResult | null;
  onChange?: (s: TrackerState) => void;
}) {
  const terminal = actionTerminal(state, plan.steps);
  // Nothing to reveal when no executor has run: the rows are already the plan's
  // own starting states and there is no outcome to pace out.
  const landed = useReveal(plan.steps.length, !outcome);
  const revealing = landed < plan.steps.length;
  const filed = filedRecord(outcome);
  const firstBadIndex = plan.steps.findIndex((s) => {
    const rt = state.steps.find((r) => r.id === s.id);
    return rt?.state === "failed" || rt?.state === "ambiguous";
  });

  return (
    <div className="flex flex-col">
      <div className="border-b border-divider px-5 py-4">
        <div className="kicker mb-1.5">Progress</div>
        <p className="text-[12.5px] leading-relaxed text-ink-body">{outcome?.outcome || TERMINAL_COPY[terminal]}</p>
        {outcome?.replayed && (
          <p className="mt-1 text-[11px] text-ink-muted">
            This had already been filed under the same key, so nothing was written again.
          </p>
        )}
        {outcome?.collateralValueMoved === false && (
          <p className="mt-1 text-[11px] text-ink-muted">
            The collateral value did not change, so no coverage improvement is claimed.
          </p>
        )}
        {token && (
          <p className="mt-1 text-[10.5px] text-ink-faint">
            Confirmed by {token.userId}. This records that a named person saw this plan, and nothing more.
          </p>
        )}
      </div>

      <div className="border-b border-divider">
        {plan.steps.map((s, i) => {
          const settled = state.steps.find((r) => r.id === s.id)!;
          // Before its turn, the row shows the state it had BEFORE execution.
          const shown: StepState = i < landed ? settled.state : (s.state as StepState) ?? "pending";
          const copy = STATE_COPY[shown];
          const blocked = shown === "pending" ? blockingPrecondition(s, state) : null;
          const focus = !revealing && i === firstBadIndex;
          return (
            <div
              key={s.id}
              className={`flex items-start gap-3 border-b border-divider px-5 py-3 last:border-b-0 ${i < landed ? "c360-row-land" : ""}`}
              style={focus ? { background: "var(--critical-bg)" } : undefined}
            >
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
                {i < landed && settled.note && (
                  <span
                    className="mt-0.5 block text-[11px] leading-relaxed"
                    style={{ color: focus ? "var(--critical)" : "var(--ink-muted)" }}
                  >
                    {settled.note}
                  </span>
                )}
                {blocked && (
                  <span className="mt-0.5 block text-[11px] text-ink-muted">
                    Waiting on step {blocked} to be verified. It will not run on its own.
                  </span>
                )}
                {focus && (
                  <span className="mt-1 block text-[11px] leading-relaxed" style={{ color: "var(--critical)" }}>
                    This is where the plan stopped. Nothing after it was attempted, and it can be resumed from here once
                    the cause is cleared.
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* The stamp. Sober by design: a record was filed, which is a fact, not a
          celebration. It appears only once every row has landed. */}
      {!revealing && filed && terminal === "success" && (
        <div className="c360-row-land border-b border-divider px-5 py-4">
          <div className="text-[15px] font-extrabold tracking-tight text-ink">Filed — {filed.label}</div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{filed.id}</div>
        </div>
      )}

      {/* A33.3.6 — every terminal state offers the deep link. On success it is
          the hero: the banker's next move is in nCino, not here. */}
      <div className="flex items-center gap-2 px-5 py-4">
        <OpenInNcino snapshot={snapshot} />
        {!revealing && terminal !== "success" && (
          <span className="text-[11px] leading-relaxed text-ink-muted">
            {terminal === "partial"
              ? "Resume from the step above once the cause is cleared."
              : "Nothing was verified, so there is nothing to open yet."}
          </span>
        )}
      </div>
    </div>
  );
}
