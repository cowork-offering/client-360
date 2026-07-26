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

import type { ActionHistoryRow, ActivityEntry } from "../data/contract";
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


/* ------------------------------------------------- the org's durable trail */

/** Banker language for an action id the org recorded. */
const ACTION_LABEL: Record<string, string> = {
  "collateral-valuation": "Collateral valuation",
  "create-service-request": "Service request",
  "annual-review": "Annual credit review",
};

/**
 * One org-history row as a trail entry.
 *
 * Keyed IDENTICALLY to the session echo (`exec-<stagingId>`) so the two dedupe
 * against each other without a second matching rule: the org row is the same
 * event, read back from the system of record.
 */
export function historyActivityEntry(row: ActionHistoryRow, instanceUrl?: string): ActivityEntry | null {
  if (!row.stagingId) return null;
  const label = (row.actionId && ACTION_LABEL[row.actionId]) ?? "Action";
  const ts = row.executedAt ?? row.createdDate;
  if (!ts) return null; // an entry with no time cannot be placed on a timeline

  const object = row.actionId ? CREATED_OBJECT[row.actionId]?.object : undefined;
  const href = recordDeepLink(instanceUrl, object, row.resultRecordId);
  const status = row.status ?? "";
  const completed = status.toLowerCase() === "completed";
  const staged = status.toLowerCase() === "staged";
  const name = row.resultRecordName ?? null;

  const base = {
    id: `exec-${row.stagingId}`,
    ts,
    actor: row.approverUserId ?? row.actorUserId,
    orgConfirmed: true,
    detail: {
      body: [
        `Staged as ${row.stagingId}.`,
        row.resultRecordId ? `Record ${row.resultRecordId}.` : null,
        row.approverUserId ? `Confirmed by ${row.approverUserId}.` : null,
        row.status ? `The org records this as ${row.status}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  };

  if (completed) {
    // The null-name doctrine applies HERE and only here: on a completed row a
    // missing name means the read-back failed, which is a verification failure
    // worth saying out loud. On a staged row it means nothing was created.
    return {
      ...base,
      kind: "ACTION_EXECUTED",
      title: name ? `${label} ${name} filed` : `${label} filed, name not confirmed`,
      summary: name ? undefined : "The org completed this but did not return the record name, so it is filed but unverified.",
      reference: row.resultRecordId
        ? { kind: "ncino-record", id: row.resultRecordId, label: object, source: "Customer 360", webLink: href ?? undefined }
        : undefined,
    };
  }

  // Staged, and anything else the org may report: neither a write nor a
  // failure. The org's own word for the state is carried verbatim rather than
  // being mapped onto a claim we cannot support.
  return {
    ...base,
    kind: "ACTION_STAGED",
    title: staged ? `${label} staged, never filed` : `${label} recorded as ${row.status ?? "unknown"}`,
    summary: staged ? "A plan was built and confirmed by nobody. Nothing was written." : undefined,
  };
}

/**
 * The trail the Activity tab renders: the org's durable rows, the session's own
 * echoes, and the staged history, newest first.
 *
 * ORG WINS. When both describe the same stagingId the org row replaces the
 * session echo — same event, stronger evidence. A session echo with no org row
 * yet still renders instantly, which is what makes the tab feel live.
 */
export function mergeTrail(
  orgRows: ActivityEntry[],
  sessionEntries: ActivityEntry[],
  staged: ActivityEntry[],
): ActivityEntry[] {
  const byId = new Map<string, ActivityEntry>();
  for (const e of staged) byId.set(e.id, e);
  for (const e of sessionEntries) byId.set(e.id, e);
  for (const e of orgRows) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}
