/* =============================================================================
   EXECUTED ACTIONS IN THE TRAIL (A30, 2026-07-26)

   Every user-driven event belongs in the Activity tab, and an execution is the
   most consequential one the cockpit produces: a record now exists in the org
   because a named person confirmed a plan. Success and failure both land — an
   attempted write is trail-worthy, and a trail that only records what worked is
   not an audit trail.

   HONEST NAMING. The executor returns `recordName` and `anchorName` when the
   org read them back, and the entry uses them: "Collateral valuation
   CV-0000000002 filed against COL-000758".

   A NULL `recordName` is not a missing nicety. It means the verification
   read-back FAILED — the filed_unverified case — so the entry says the name was
   not confirmed instead of falling back to a generic label. A fallback there
   would hide a real verification failure behind copy that reads like success.
   ============================================================================= */

import type { ActivityEntry } from "../data/contract";
import type { ExecuteResult } from "../channel/writeTools";
import { CREATED_OBJECT, recordDeepLink } from "../components/DeepLink";

export interface ExecutedEntryInput {
  actionId: string;
  /** The executor's own result. Its words and its ids, never ours. */
  outcome: ExecuteResult;
  /** What the action was filed against, in banker language, from the schema. */
  target?: string;
  /** The signed-in user. */
  actor?: string;
  instanceUrl?: string;
  /** Session clock: the banker just did this, on this clock (A10 carve-out). */
  now?: () => Date;
}

/** The created record's id for this action, or undefined when none came back. */
export function createdRecordId(actionId: string, outcome: ExecuteResult): string | undefined {
  if (actionId === "collateral-valuation") return outcome.valuationId;
  if (actionId === "create-service-request") return outcome.caseId;
  if (actionId === "annual-review") return outcome.reviewId;
  return undefined;
}

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The step that stopped the plan, for the failure entry's detail. */
function failingStep(outcome: ExecuteResult): { label: string; detail?: string } | null {
  const bad = outcome.steps.find((s) => s.state === "failed" || s.state === "ambiguous");
  return bad ? { label: bad.label, detail: bad.detail } : null;
}

/**
 * Mint the trail entry for one execution. Returns null when there is nothing
 * honest to log — no terminal state means nothing was attempted.
 */
export function executedActivityEntry(input: ExecutedEntryInput): ActivityEntry | null {
  const { actionId, outcome, target, actor, instanceUrl } = input;
  const now = (input.now ?? (() => new Date()))();
  const label = CREATED_OBJECT[actionId]?.label ?? "action";
  const recordId = createdRecordId(actionId, outcome);
  const succeeded = outcome.terminalState === "success";
  // The org's own name for what this was filed against wins over the panel's
  // staged label for the same thing.
  const anchor = outcome.anchorName ?? target;
  const against = anchor ? ` against ${anchor}` : "";
  const recordName = outcome.recordName ?? null;
  const nameConfirmed = recordName !== null;

  if (!outcome.terminalState) return null;

  const base = {
    // Keyed on the staging id: one execution, one entry, however many times the
    // tracker re-renders or a replay returns the same result.
    id: `exec-${outcome.stagingId || recordId || now.getTime()}`,
    ts: now.toISOString(),
    actor: actor ?? "You",
    sessionLocal: true,
  };

  if (succeeded || (recordId && !nameConfirmed)) {
    const href = recordDeepLink(instanceUrl, CREATED_OBJECT[actionId]?.object, recordId);
    // Named: "Collateral valuation CV-0000000002 filed against COL-000758".
    // Unnamed: the read-back failed, and the title says exactly that.
    const title = nameConfirmed
      ? `${sentenceCase(label)} ${recordName} filed${against}`
      : `${sentenceCase(label)} filed${against}, name not confirmed`;
    return {
      ...base,
      kind: "ACTION_EXECUTED",
      title,
      // The executor's own sentence, not a restatement of it.
      summary: outcome.outcome || undefined,
      reference: {
        kind: "ncino-record",
        id: recordId,
        label: CREATED_OBJECT[actionId]?.object,
        source: "Customer 360",
        // Absent instanceUrl leaves this undefined, and the popup renders the
        // id as plain text rather than a fabricated link (A29).
        webLink: href ?? undefined,
      },
      detail: {
        body: [
          outcome.outcome,
          nameConfirmed
            ? null
            : "The verification read-back did not return the record name, so this is filed but unverified.",
          recordId ? `Record ${recordId}.` : null,
          outcome.stagingId ? `Staged as ${outcome.stagingId}.` : null,
          outcome.replayed ? "Replayed under the same idempotency key; nothing was written twice." : null,
        ]
          .filter(Boolean)
          .join(" "),
      },
    };
  }

  const failed = failingStep(outcome);
  return {
    ...base,
    kind: "ACTION_EXECUTION_FAILED",
    title: `${sentenceCase(label)} did not complete${against}`,
    summary: outcome.outcome || undefined,
    reference: recordId ? { kind: "ncino-record", id: recordId, source: "Customer 360" } : undefined,
    detail: {
      body: [
        failed ? `Stopped at: ${failed.label}.` : null,
        failed?.detail ?? null,
        `Terminal state ${outcome.terminalState}.`,
        outcome.stagingId ? `Staged as ${outcome.stagingId}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  };
}
