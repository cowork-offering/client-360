/* =============================================================================
   LIVE WRITE TOOLS (WP5) — stage_* / execute_* on the Customer 360 server.

   Transport is the SAME positional invocable envelope as the read tools, so
   `unwrapInvocableOne` does the outer unwrap. The typed result lives INSIDE
   `outputValues`, discriminated by `ok` (A33.5.1):

     transport failure -> isSuccess:false / errors  (handled by unwrapInvocable)
     domain failure    -> isSuccess:true, outputValues.ok === false
     success           -> outputValues.ok === true, outputValues.result

   A domain failure is a SUCCESSFUL INVOCATION carrying ok:false. Keeping the
   two layers separate is what makes them independently testable, so this module
   never collapses one into the other.

   Shapes read from the deployed Apex Stage and Execute classes (their Request
   and Result inner classes), never guessed.
   ============================================================================= */

import { callTool, SERVERS, unwrapInvocableOne, type McpFailure } from "./mcp";
import type { PlanStep, StagedOutput, StepType } from "../actions/stagedPlan";

/** The six deployed write tools. */
export const WRITE_TOOLS = {
  "collateral-valuation": { stage: "stage_collateral_valuation", execute: "execute_collateral_valuation" },
  "create-service-request": { stage: "stage_service_request", execute: "execute_service_request" },
  "annual-review": { stage: "stage_annual_review", execute: "execute_annual_review" },
} as const;

export type WriteActionId = keyof typeof WRITE_TOOLS;

export function isWriteAction(actionId: string): actionId is WriteActionId {
  return actionId in WRITE_TOOLS;
}

/** A33.5.1 domain error. Distinct from McpFailure, which is transport. */
export interface ToolError {
  code: string;
  message: string;
  orgError?: string;
  resumable?: boolean;
  idempotencyKey?: string;
  /** Parsed from the message when the tool rejects an illegal picklist value. */
  legalValues?: string[];
}

export type ToolOutcome<T> = { ok: true; result: T } | { ok: false; error: ToolError };

export interface ExecuteStepResult {
  id: string;
  type: string;
  label: string;
  state: string;
  detail?: string;
}

export interface ExecuteResult {
  stagingId: string;
  terminalState: string;
  steps: ExecuteStepResult[];
  outcome: string;
  replayed?: boolean;
  /** Collateral valuation only: states plainly when the value did not move. */
  collateralValueMoved?: boolean;
  valuationId?: string;
  caseId?: string;
  reviewId?: string;
  /**
   * The created record's NAME, read back from the org after the write.
   *
   * CRITICAL SEMANTIC (Apex builder, 2026-07-26): this is null EXACTLY when the
   * verification read-back failed — the `filed_unverified` case. A null here is
   * therefore evidence of a verification failure, not a missing nicety, and it
   * must never be papered over with a generic label. Doing so would hide a real
   * failure behind copy that reads like success.
   */
  recordName?: string | null;
  /** The thing the record was filed against, named by the org. */
  anchorName?: string | null;
}

/* ------------------------------------------------------------- unwrapping */

const STEP_TYPES: StepType[] = ["write", "verification", "wait", "handoff", "observed_side_effect"];

function toStepType(v: unknown): StepType {
  return STEP_TYPES.includes(v as StepType) ? (v as StepType) : "observed_side_effect";
}

/** Map a wire step onto our PlanStep. Defensive: the wire may omit optionals. */
function toPlanStep(raw: Record<string, unknown>): PlanStep {
  return {
    id: String(raw.id ?? ""),
    type: toStepType(raw.type),
    label: String(raw.label ?? ""),
    objectName: typeof raw.objectName === "string" ? raw.objectName : undefined,
    fields: Array.isArray(raw.fields) ? raw.fields.map(String) : undefined,
    automationWoken: Array.isArray(raw.automationWoken) ? raw.automationWoken.map(String) : undefined,
    verification: typeof raw.verification === "string" ? raw.verification : undefined,
    state: typeof raw.state === "string" ? raw.state : undefined,
    detail: typeof raw.detail === "string" ? raw.detail : undefined,
  };
}

/** `provenanceJson` arrives as a STRING. Parse defensively: a malformed blob
 *  must not take down a staging call that is otherwise fine. */
export function parseProvenance(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Pull the legal picklist set out of a VALIDATION_FAILED message. The tool
 *  lists them; we surface exactly what it returned and never invent the rest. */
export function parseLegalValues(message: string): string[] | undefined {
  // The COLON is required: the message often says "is not a legal value on this
  // org" earlier in the sentence, and matching that prose instead of the list
  // silently mangles the first value.
  const m = message.match(/(?:legal values?(?:\s+are)?|one of)\s*:\s*(.+)$/i);
  if (!m) return undefined;
  const values = m[1]
    .replace(/\.$/, "")
    .split(/\s*(?:,|;|\bor\b)\s*/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
  return values.length ? values : undefined;
}

function toToolError(raw: Record<string, unknown>): ToolError {
  const message = String(raw.message ?? "The tool reported a failure.");
  return {
    code: String(raw.code ?? "UNKNOWN"),
    message,
    orgError: typeof raw.orgError === "string" ? raw.orgError : undefined,
    resumable: raw.resumable === true,
    idempotencyKey: typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : undefined,
    legalValues: parseLegalValues(message),
  };
}

/** Unwrap the positional envelope, then branch on outputValues.ok (A33.5.6). */
function unwrapToolOutcome<T>(payload: unknown, map: (r: Record<string, unknown>) => T): ToolOutcome<T> {
  const slot = unwrapInvocableOne<Record<string, unknown>>(payload);
  if (!slot.ok) {
    // Transport-level: isSuccess:false or non-null errors on the element.
    return { ok: false, error: { code: "TRANSPORT", message: slot.error } };
  }
  const out = slot.data;
  if (out?.ok === true && out.result && typeof out.result === "object") {
    return { ok: true, result: map(out.result as Record<string, unknown>) };
  }
  if (out?.error && typeof out.error === "object") {
    return { ok: false, error: toToolError(out.error as Record<string, unknown>) };
  }
  return { ok: false, error: { code: "UNEXPECTED", message: "The tool returned neither a result nor an error." } };
}

/* ------------------------------------------------------------------ stage */

export interface StagePayloads {
  "collateral-valuation": {
    idempotencyKey: string;
    rationale?: string;
    collateralId: string;
    value?: number | null;
    valuationDate?: string | null;
    type?: string | null;
    source?: string | null;
    description?: string | null;
    primary?: boolean;
  };
  "create-service-request": {
    idempotencyKey: string;
    accountId: string;
    rationale?: string;
    requestType?: string | null;
    summary?: string | null;
    referenceKind?: string | null;
    referenceId?: string | null;
    referenceWebLink?: string | null;
  };
  "annual-review": {
    idempotencyKey: string;
    accountId: string;
    rationale?: string;
    reviewType?: string | null;
    productPackageId?: string | null;
    narrative?: string | null;
    relationshipSummary?: string | null;
    strengthsNarrative?: string | null;
    weaknessNarrative?: string | null;
    recommendationNarrative?: string | null;
    collateralAnalysisNarrative?: string | null;
    financialAnalystNarrative?: string | null;
    guarantorNarrative?: string | null;
    riskRatingComments?: string | null;
  };
}

/** Call `stage_*`. USER GESTURE ONLY — never on mount, never polled. */
export async function stageAction<K extends WriteActionId>(
  actionId: K,
  payload: StagePayloads[K],
): Promise<ToolOutcome<StagedOutput>> {
  const res = await callTool(
    SERVERS.customer360,
    WRITE_TOOLS[actionId].stage,
    { inputs: [payload] },
    // A stage call computes and plans; it writes nothing, but it is not a read
    // either. No caching, no retry: `read` stays false so a stamped-retryable
    // failure is never auto-repeated.
    { cache: false },
  );
  return unwrapToolOutcome<StagedOutput>(res.payload, (r) => ({
    stagingId: String(r.stagingId ?? ""),
    planHash: String(r.planHash ?? ""),
    decisionToken: typeof r.decisionToken === "string" ? r.decisionToken : null,
    replayed: r.replayed === true,
    accountId: typeof r.accountId === "string" ? r.accountId : undefined,
    productPackageId: typeof r.productPackageId === "string" ? r.productPackageId : undefined,
    summary: String(r.summary ?? ""),
    steps: Array.isArray(r.steps) ? r.steps.map((s) => toPlanStep(s as Record<string, unknown>)) : [],
    warnings: Array.isArray(r.warnings) ? r.warnings.map(String) : [],
    suggestions: [],
    provenanceJson: typeof r.provenanceJson === "string" ? r.provenanceJson : undefined,
    provenance: parseProvenance(r.provenanceJson),
  }));
}

/* ---------------------------------------------------------------- execute */

/** Identical across all three tools (read from the Execute*.cls Request classes). */
export interface ExecutePayload {
  idempotencyKey: string;
  stagingId: string;
  planHash: string;
  decisionToken: string;
  approverUserId: string;
}

/**
 * The Salesforce user id the execute tools will accept as `approverUserId`.
 *
 * LIVE DEFECT, 2026-07-26. The panel was sending `meta.user`, which is the
 * DISPLAY NAME ("Fabian Goetzens"). The Apex checks, in order: staging row →
 * planHash → `approverUserId` equals the running identity → token hash. The
 * name failed the third check, so every attempt died BEFORE token redemption
 * and the staging rows all sat at Staged with cm_Token_Consumed_At__c null.
 *
 * So this refuses anything that is not shaped like a user id. Fail closed: it
 * is better to say the id is not staged than to send a value the org will
 * refuse and report as a generic tool failure.
 */
const SF_USER_ID = /^005[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/;

export function resolveApproverUserId(meta: { user?: string; userId?: string } | undefined): string | null {
  // `userId` is the field the assembler stages for this. `user` is checked only
  // because an assembler that stages the id there is still correct; a name
  // there is not, and falls through to null.
  for (const candidate of [meta?.userId, meta?.user]) {
    if (typeof candidate === "string" && SF_USER_ID.test(candidate.trim())) return candidate.trim();
  }
  return null;
}

/** Call `execute_*`. USER GESTURE ONLY, and only behind a confirmed plan. */
export async function executeAction(
  actionId: WriteActionId,
  payload: ExecutePayload,
): Promise<ToolOutcome<ExecuteResult>> {
  const res = await callTool(
    SERVERS.customer360,
    WRITE_TOOLS[actionId].execute,
    { inputs: [payload] },
    // A write is never cached and never auto-retried: an ambiguous transport
    // outcome is not proof the tool did not run.
    { cache: false, read: false },
  );
  return unwrapToolOutcome<ExecuteResult>(res.payload, (r) => ({
    stagingId: String(r.stagingId ?? ""),
    terminalState: String(r.terminalState ?? "failed"),
    outcome: String(r.outcome ?? ""),
    replayed: r.replayed === true,
    collateralValueMoved: typeof r.collateralValueMoved === "boolean" ? r.collateralValueMoved : undefined,
    valuationId: typeof r.valuationId === "string" ? r.valuationId : undefined,
    caseId: typeof r.caseId === "string" ? r.caseId : undefined,
    reviewId: typeof r.reviewId === "string" ? r.reviewId : undefined,
    // `recordName` is canonical; the per-action aliases carry the SAME fact for
    // tools that predate it. All absent means the read-back did not confirm a
    // name, which is a state the UI must show rather than fill in.
    recordName: str(r.recordName) ?? str(r.caseNumber) ?? str(r.reviewName) ?? null,
    anchorName: str(r.anchorName) ?? null,
    steps: Array.isArray(r.steps)
      ? r.steps.map((s) => {
          const raw = s as Record<string, unknown>;
          return {
            id: String(raw.id ?? ""),
            type: String(raw.type ?? ""),
            label: String(raw.label ?? ""),
            state: String(raw.state ?? "pending"),
            detail: typeof raw.detail === "string" ? raw.detail : undefined,
          };
        })
      : [],
  }));
}

/** A non-empty string, or undefined. Blank is not a name. */
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Banker-readable copy for a domain failure, keeping the org's own words. */
export function toolErrorCopy(e: ToolError): string {
  if (e.code === "TRANSPORT") return e.message;
  return e.message;
}

export type { McpFailure };
