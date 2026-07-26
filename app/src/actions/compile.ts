/* =============================================================================
   THE COMPILE SEQUENCE (WP7.3)

   Staging a plan used to be a button that said "Staging…" and then jumped. It
   is now a build screen, and every status line on it is BOUND TO A REAL
   OPERATION: gathering the prefills, recomputing the suggestions and drift,
   the `stage_*` call in flight, the plan coming back.

   Two rules make it honest rather than theatre:
     1. A line may never tick before its operation has completed. The pacing
        floor delays a fast line; it can never advance a slow one.
     2. A failure STOPS the sequence on the line that failed and renders the
        typed error there. The sequence is the error surface, not a preamble to
        one somewhere else.

   `prefers-reduced-motion` collapses the pacing to zero, so the lines resolve
   as fast as the work does and nothing shimmers.
   ============================================================================= */

import type { ToolError } from "../channel/writeTools";
import { prefersReducedMotion } from "../data/motion";

export type CompileLineState = "pending" | "running" | "done" | "failed";

export interface CompileLine {
  id: string;
  /** Banker language, present tense. What this operation is doing. */
  label: string;
  state: CompileLineState;
  /** On success: a short note. On failure: the typed error, rendered here. */
  detail?: string;
  error?: ToolError;
  /** True when the banker may re-run the sequence with the same gesture. */
  retryable?: boolean;
}

export interface CompileOp {
  id: string;
  label: string;
  /** The real work. Throwing a ToolError-shaped value fails this line. */
  run: () => Promise<string | void> | string | void;
}

export type CompileOutcome = { ok: true } | { ok: false; failedId: string; error: ToolError };

/**
 * Codes that mean the org (or our own preflight) refused the CONTENT of the
 * request. Re-running the identical call would be refused identically, so no
 * retry is offered: the banker has to change something.
 */
const DOMAIN_CODES = new Set([
  "VALIDATION_FAILED",
  "PRECONDITION",
  "NOT_STAGEABLE",
  "blocked_by_policy",
  "bad_request",
  "not_granted",
]);

export const isDomainFailure = (e: ToolError): boolean => DOMAIN_CODES.has(e.code);

/** Milliseconds a line is held before it may tick. Zero under reduced motion. */
export const COMPILE_PACE = 450;

export function compilePace(reduced = prefersReducedMotion()): number {
  return reduced ? 0 : COMPILE_PACE;
}

const wait = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

const asToolError = (e: unknown): ToolError => {
  const t = e as Partial<ToolError> & { message?: string; fix?: string };
  if (t && typeof t.code === "string") return t as ToolError;
  return { code: "TRANSPORT", message: t?.fix ?? t?.message ?? String(e) };
};

/**
 * Run the ops in order, emitting the line states as they change.
 *
 * On failure the remaining lines stay `pending`: they never ran, and the screen
 * says so rather than showing a green sequence with one red mark in the middle.
 */
export async function runCompile(
  ops: CompileOp[],
  opts: { minPace?: number; onLines?: (lines: CompileLine[]) => void; sleep?: (ms: number) => Promise<void> } = {},
): Promise<CompileOutcome> {
  const minPace = opts.minPace ?? compilePace();
  const sleep = opts.sleep ?? wait;
  const lines: CompileLine[] = ops.map((o) => ({ id: o.id, label: o.label, state: "pending" }));
  const emit = () => opts.onLines?.(lines.map((l) => ({ ...l })));

  emit();
  for (const [i, op] of ops.entries()) {
    const line = lines[i];
    line.state = "running";
    emit();

    const started = Promise.resolve()
      .then(op.run)
      .then(
        (detail) => ({ ok: true as const, detail }),
        (e) => ({ ok: false as const, error: asToolError(e) }),
      );
    const [outcome] = await Promise.all([started, sleep(minPace)]);

    if (!outcome.ok) {
      line.state = "failed";
      line.error = outcome.error;
      line.detail = outcome.error.message;
      line.retryable = !isDomainFailure(outcome.error);
      emit();
      return { ok: false, failedId: op.id, error: outcome.error };
    }

    line.state = "done";
    if (outcome.detail) line.detail = outcome.detail;
    emit();
  }
  return { ok: true };
}
