import { useMemo, useState } from "react";
import { useApp } from "../state/appState";
import type { StagedOutput } from "../actions/stagedPlan";
import { SIMULATION_BANNER, assertNoRecordIds } from "../actions/stagedPlan";
import { computeSuggestions, detectDrift, type DriftReason } from "../actions/suggestionEngine";
import { validatePlan } from "../actions/transitionAllowlist";
import { mintDecisionToken, type DecisionToken } from "../actions/decisionToken";
import { STEP_TYPE_LABEL } from "../actions/tracker";
import { resolveBundle } from "../actions/registry";

/* =============================================================================
   THE CONFIRM GATE (A33.3.1)

   The confirm step is a STAGING SUMMARY, not a credit approval. The copy states
   what will be written, to which object, and what automation the write is
   expected to wake. It must never use "approve", "submit for credit approval",
   or any phrasing implying a credit decision, and it always ends with the fixed
   closing line.

   Before the gesture is offered:
     - every suggestion that fed the plan is RECOMPUTED (A33.2.7). Any drift
       blocks the confirm and the panel re-renders naming what moved.
     - the plan is validated against the transition allowlist (A33.3.1).
     - warnings[] are surfaced, because a banker must see the side effects
       BEFORE confirming, not after.
   ============================================================================= */

/** The fixed closing line. Not a variant, not a template. */
export const CLOSING_LINE = "Real approval happens in nCino's credit-risk process.";

/** Vocabulary the summary may never contain (A33.3.1). */
export const FORBIDDEN_GATE_WORDS = ["approve", "approval of", "submit for credit approval", "authorise credit", "credit decision"];

function DriftNotice({ drift }: { drift: DriftReason[] }) {
  return (
    <div className="rounded-[10px] px-3.5 py-3" style={{ background: "var(--warning-bg)" }}>
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
        The figures moved
      </div>
      <ul className="mt-1.5 space-y-1">
        {drift.map((d, i) => (
          <li key={i} className="text-[12px] leading-relaxed" style={{ color: "var(--warning-prose)" }}>
            {d.kind === "value_moved" && `${d.figure} was ${d.was}, now ${d.now}.`}
            {d.kind === "policy_changed" && `The bank policy pack changed from ${d.was} to ${d.now}.`}
            {d.kind === "data_replaced" && "The staged data was replaced after this plan was built."}
            {d.kind === "suggestion_vanished" && `The ${d.suggestionId} finding no longer applies.`}
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[11.5px]" style={{ color: "var(--warning-prose)" }}>
        Review the new figures and confirm again. Nothing runs against numbers you did not see.
      </div>
    </div>
  );
}

export function ConfirmGate({
  plan,
  actionId,
  simulated,
  onConfirmed,
  onBack,
}: {
  plan: StagedOutput;
  actionId: string;
  /** True when the plan came from the NOT-LIVE adapter. */
  simulated: boolean;
  onConfirmed: (token: DecisionToken) => void;
  onBack: () => void;
}) {
  const { data, state } = useApp();
  const [drift, setDrift] = useState<DriftReason[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bundle = resolveBundle(data, state.accountId);

  // A33.3.1 — the plan must be allowlisted before a gesture is offered at all.
  const violations = useMemo(() => validatePlan(plan.steps), [plan.steps]);
  // A33.5.3 — a staged plan carrying a record id means something already wrote.
  const idLeaks = useMemo(() => assertNoRecordIds(plan), [plan]);

  const blocked = violations.length > 0 || idLeaks.length > 0;

  function confirm() {
    setError(null);

    // A33.2.7 — MANDATORY recompute. A plan is never executed against figures
    // the banker did not see.
    const fresh = computeSuggestions({ data, bundle, actionId });
    const moved = detectDrift(plan.suggestions, fresh, data.meta?.generatedAt ?? "");
    if (moved.length > 0) {
      setDrift(moved);
      return;
    }

    const userId = data.meta?.user;
    if (!userId) {
      setError("The confirmation must name the banker making it, and this view has no user.");
      return;
    }
    try {
      onConfirmed(mintDecisionToken({ stagingId: plan.stagingId, planHash: plan.planHash, userId }));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div className="flex flex-col">
      {simulated && (
        <div className="border-b border-divider px-5 py-2 text-[11px] font-semibold" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
          {SIMULATION_BANNER}
        </div>
      )}

      <div className="border-b border-divider px-5 py-4">
        <div className="kicker mb-1.5">What will happen</div>
        <p className="text-[13px] leading-relaxed text-ink">{plan.summary}</p>
      </div>

      {/* The plan, step by step, with types visually distinct. */}
      <div className="border-b border-divider px-5 py-4">
        <div className="kicker mb-2">The plan</div>
        <ol className="space-y-2">
          {plan.steps.map((s, i) => (
            <li key={s.id} className="flex gap-2.5">
              <span className="mt-0.5 w-5 flex-none text-[11px] font-bold text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                    style={
                      s.type === "write"
                        ? { background: "var(--accent-wash)", color: "var(--accent)" }
                        : s.type === "verification"
                          ? { background: "var(--positive-bg)", color: "var(--positive)" }
                          : s.type === "wait"
                            ? { background: "var(--warning-bg)", color: "var(--warning)" }
                            : s.type === "handoff"
                              ? { background: "var(--user-tone-wash)", color: "var(--user-tone)" }
                              : { background: "var(--wash-2)", color: "var(--ink-muted)" }
                    }
                  >
                    {STEP_TYPE_LABEL[s.type]}
                  </span>
                  <span className="text-[12.5px] font-medium text-ink">{s.label}</span>
                </span>
                {(s.automationWoken?.length ?? 0) > 0 && (
                  <span className="mt-0.5 block text-[11px] text-ink-muted">
                    Wakes: {s.automationWoken!.join("; ")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* A33.5.3 — warnings are seen BEFORE the gesture, never after. */}
      {plan.warnings.length > 0 && (
        <div className="border-b border-divider px-5 py-4">
          <div className="kicker mb-2">Before you confirm</div>
          <ul className="space-y-1.5">
            {plan.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-ink-body">
                <span className="mt-[7px] h-1 w-1 flex-none rounded-full" style={{ background: "var(--warning)" }} />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocked && (
        <div className="border-b border-divider px-5 py-4">
          <div className="rounded-[10px] px-3.5 py-3" style={{ background: "var(--critical-bg)" }}>
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--critical)" }}>
              This plan cannot be confirmed
            </div>
            <ul className="mt-1.5 space-y-1">
              {violations.map((v, i) => (
                <li key={`v${i}`} className="text-[12px] leading-relaxed" style={{ color: "var(--critical)" }}>
                  Step {v.stepId}: {v.reason}
                </li>
              ))}
              {idLeaks.map((v, i) => (
                <li key={`l${i}`} className="text-[12px] leading-relaxed" style={{ color: "var(--critical)" }}>
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {drift && (
        <div className="border-b border-divider px-5 py-4">
          <DriftNotice drift={drift} />
        </div>
      )}

      {error && (
        <div className="border-b border-divider px-5 py-3 text-[12px]" style={{ color: "var(--critical)" }}>
          {error}
        </div>
      )}

      <div className="px-5 py-4">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">{CLOSING_LINE}</p>
      </div>

      <div className="flex items-center gap-2 border-t border-divider px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="c360-press rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
        >
          Back
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={blocked}
          onClick={confirm}
          className="c360-btn rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {drift ? "Confirm the new figures" : "Confirm and stage"}
        </button>
      </div>
    </div>
  );
}
