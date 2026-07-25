/* =============================================================================
   TRACKER STATE MACHINE (A33.3.3)

   Eight states, one transition table, and three rules that make it safe:

     - BOUNDED WAITS. Exhaustion lands in `filed_unverified` with the reason
       shown. NEVER `failed`: a timeout is not evidence of failure.
     - NO DEPENDENT AUTO-RUN ON AN UNVERIFIED PRECONDITION. A step whose
       precondition ended `filed_unverified` stays `pending` and needs a banker
       gesture; the panel says which unverified fact it is waiting on.
     - AMBIGUOUS NEVER SELF-RESOLVES. There is no automatic transition out of
       `ambiguous` — only a re-query on resume. A rejection is not proof the
       tool did not run.

   Persistence note (A33.3.3): tracker state lives in the staging record
   server-side, keyed by idempotencyKey. Anything the client holds is a CACHE
   and never the authority, so a full artifact replace can neither lose nor
   fabricate progress.
   ============================================================================= */

import type { PlanStep } from "./stagedPlan";

export type StepState =
  | "pending"
  | "running"
  | "waiting"
  | "filed_unverified"
  | "verified"
  | "failed"
  | "ambiguous"
  | "skipped_not_attempted";

/** Transport codes already classified as outcome-ambiguous in channel/mcp.ts. */
export const AMBIGUOUS_TRANSPORT_CODES = ["server_unavailable", "upstream_error", "cancelled"] as const;

export type TransitionEvent =
  | { kind: "executor_reached" }
  | { kind: "verification_passed" }
  | { kind: "async_outstanding" }
  | { kind: "verification_impossible"; reason: string }
  | { kind: "org_error"; message: string }
  | { kind: "transport_ambiguous"; code: string }
  | { kind: "wait_budget_exhausted" }
  | { kind: "earlier_step_ended_badly" }
  | { kind: "requery_resolved"; verified: boolean }
  | { kind: "resume" };

export interface StepRuntime {
  id: string;
  state: StepState;
  /** Banker-facing explanation of the current state. */
  note?: string;
  /** The unverified precondition this step is waiting on, when blocked. */
  blockedOn?: string;
}

/** The A33.3.3 table, encoded. `null` means the transition is refused. */
export function nextState(
  from: StepState,
  event: TransitionEvent,
  ctx: { preconditionsVerified: boolean; freshGesture: boolean; planHashMatches: boolean; requeried: boolean },
): { to: StepState; note?: string } | null {
  switch (from) {
    case "pending":
      if (event.kind === "executor_reached") {
        // Only when ALL preconditions are verified. A filed_unverified
        // precondition holds the step at pending until a banker gesture.
        return ctx.preconditionsVerified ? { to: "running" } : null;
      }
      if (event.kind === "earlier_step_ended_badly") return { to: "skipped_not_attempted", note: "an earlier step did not complete" };
      return null;

    case "running":
      if (event.kind === "verification_passed") return { to: "verified" };
      if (event.kind === "async_outstanding") return { to: "waiting", note: "asynchronous org automation is outstanding" };
      if (event.kind === "verification_impossible") return { to: "filed_unverified", note: event.reason };
      if (event.kind === "org_error") return { to: "failed", note: event.message };
      if (event.kind === "transport_ambiguous") {
        return { to: "ambiguous", note: `outcome unknown after a ${event.code} transport failure; the write may still have landed` };
      }
      return null;

    case "waiting":
      if (event.kind === "verification_passed") return { to: "verified" };
      // A timeout is NOT evidence of failure.
      if (event.kind === "wait_budget_exhausted") {
        return { to: "filed_unverified", note: "the wait budget was exhausted before verification succeeded" };
      }
      if (event.kind === "org_error") return { to: "failed", note: event.message };
      return null;

    case "ambiguous":
      // ONLY a re-query on resume resolves this. No automatic exit.
      if (event.kind === "requery_resolved" && ctx.requeried) {
        return event.verified ? { to: "verified", note: "re-query confirmed the write landed" } : { to: "failed", note: "re-query confirmed the write did not land" };
      }
      if (event.kind === "resume") return resumeTransition(ctx);
      return null;

    case "failed":
      if (event.kind === "resume") return resumeTransition(ctx);
      return null;

    // Terminal for this run.
    case "verified":
    case "filed_unverified":
    case "skipped_not_attempted":
      return null;
  }
}

/** A33.3.3 resume preconditions, ALL required. */
function resumeTransition(ctx: { freshGesture: boolean; planHashMatches: boolean; requeried: boolean }): { to: StepState; note?: string } | null {
  if (!ctx.freshGesture) return null;
  if (!ctx.planHashMatches) return null; // org state moved; the action must be re-staged
  if (!ctx.requeried) return null; // re-query the target state before any resumed write
  return { to: "running", note: "resumed after re-query" };
}

export interface ResumeRefusal {
  allowed: false;
  reason: string;
}
export type ResumeDecision = { allowed: true } | ResumeRefusal;

/** Explain a resume refusal in banker language rather than failing silently. */
export function canResume(ctx: { freshGesture: boolean; planHashMatches: boolean; requeried: boolean }): ResumeDecision {
  if (!ctx.freshGesture) return { allowed: false, reason: "a resume needs a fresh gesture from you; nothing retries on its own" };
  if (!ctx.planHashMatches) return { allowed: false, reason: "the org has moved since this plan was staged, so it must be staged again" };
  if (!ctx.requeried) return { allowed: false, reason: "the target state has to be re-queried before anything is written again" };
  return { allowed: true };
}

/* ---------------------------------------------------------------- runtime */

export interface TrackerState {
  steps: StepRuntime[];
}

export function initTracker(steps: PlanStep[]): TrackerState {
  return { steps: steps.map((s) => ({ id: s.id, state: "pending" as StepState })) };
}

/** Are every one of this step's declared preconditions verified? */
export function preconditionsVerified(step: PlanStep, state: TrackerState): boolean {
  return (step.dependsOn ?? []).every((id) => state.steps.find((s) => s.id === id)?.state === "verified");
}

/** The unverified precondition holding a step back, for the panel's copy. */
export function blockingPrecondition(step: PlanStep, state: TrackerState): string | null {
  for (const id of step.dependsOn ?? []) {
    const dep = state.steps.find((s) => s.id === id);
    if (dep && dep.state !== "verified") return id;
  }
  return null;
}

/** Apply an event to one step, refusing transitions the table does not allow. */
export function applyEvent(
  state: TrackerState,
  plan: PlanStep[],
  stepId: string,
  event: TransitionEvent,
  ctx?: Partial<{ freshGesture: boolean; planHashMatches: boolean; requeried: boolean }>,
): TrackerState {
  const idx = state.steps.findIndex((s) => s.id === stepId);
  if (idx === -1) return state;
  const step = plan.find((p) => p.id === stepId)!;

  const full = {
    preconditionsVerified: preconditionsVerified(step, state),
    freshGesture: ctx?.freshGesture ?? false,
    planHashMatches: ctx?.planHashMatches ?? false,
    requeried: ctx?.requeried ?? false,
  };

  const result = nextState(state.steps[idx].state, event, full);
  if (!result) return state; // refused: the machine stays where it is

  const steps = [...state.steps];
  steps[idx] = {
    id: stepId,
    state: result.to,
    note: result.note,
    blockedOn: result.to === "pending" ? (blockingPrecondition(step, state) ?? undefined) : undefined,
  };

  // An ended-badly step cascades TRANSITIVELY: a dependent of a skipped step is
  // itself never attempted. Note `filed_unverified` deliberately does NOT
  // cascade — it HOLDS its dependents at `pending` awaiting a banker gesture
  // (A33.3.3), which is a different and recoverable situation.
  const BAD: StepState[] = ["failed", "ambiguous", "skipped_not_attempted"];
  if (BAD.includes(result.to)) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].state !== "pending") continue;
        const s = plan.find((p) => p.id === steps[i].id)!;
        const blockedByBad = (s.dependsOn ?? []).some((dep) => {
          const d = steps.find((x) => x.id === dep);
          return d ? BAD.includes(d.state) : false;
        });
        if (blockedByBad) {
          steps[i] = { id: s.id, state: "skipped_not_attempted", note: "an earlier step did not complete" };
          changed = true;
        }
      }
    }
  }

  return { steps };
}

/* -------------------------------------------------- action terminal state */

export type ActionTerminal = "in_progress" | "success" | "partial" | "failed";

/**
 * A33.3.3 terminal derivation:
 *   success = every step verified, or a deliberate handoff.
 *   partial = at least one verified AND at least one failed / ambiguous /
 *             filed_unverified / skipped_not_attempted.
 *   failed  = the first write step failed with nothing verified.
 */
export function actionTerminal(state: TrackerState, plan: PlanStep[]): ActionTerminal {
  const byId = new Map(plan.map((p) => [p.id, p]));

  // Still moving = something is running or waiting, or a pending step whose
  // preconditions ARE verified and so can still run unattended. A step held
  // pending on an unverified precondition is NOT "in progress": nothing will
  // move without a banker gesture, so the plan has halted and the terminal
  // state must say what actually completed.
  const stillMoving = state.steps.some((s) => {
    if (s.state === "running" || s.state === "waiting") return true;
    if (s.state !== "pending") return false;
    return preconditionsVerified(byId.get(s.id)!, state);
  });
  if (stillMoving) return "in_progress";

  const verified = state.steps.filter((s) => s.state === "verified");
  const handoffs = state.steps.filter((s) => byId.get(s.id)?.type === "handoff");
  // A step halted at `pending` did not complete either, so it counts as
  // degraded for the terminal derivation.
  const degraded = state.steps.filter((s) =>
    ["failed", "ambiguous", "filed_unverified", "skipped_not_attempted", "pending"].includes(s.state),
  );

  // A handoff is a deliberate end to our involvement, not an incomplete step.
  const nonHandoffDegraded = degraded.filter((s) => byId.get(s.id)?.type !== "handoff");

  if (nonHandoffDegraded.length === 0 && (verified.length > 0 || handoffs.length > 0)) return "success";
  if (verified.length > 0 && nonHandoffDegraded.length > 0) return "partial";
  return "failed";
}

/** Step types rendered distinctly (A33.3.2). */
export const STEP_TYPE_LABEL: Record<PlanStep["type"], string> = {
  write: "Writes",
  verification: "Verifies",
  wait: "Waits",
  handoff: "Hands off",
  observed_side_effect: "Side effect",
};
