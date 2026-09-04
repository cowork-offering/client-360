import type { ActionHistoryRow, ActionPlanStep } from "../../data/contract";
import type { MemoChange } from "../../memo/types";
import type { RenderPlan } from "../../memo/renderMemo";
import type { MemoTrigger } from "./memoSession";

/* =============================================================================
   THE GREETING FROM THE ORG.

   NON-NEGOTIABLE 1 (memo requirements, 2026-09-04): the room knows what was
   done to the relationship, from the ORG and not from browser memory, so the
   memo can be opened at any time by any viewer and it still states what was
   recently executed. That is what this file composes.

   THE ORG READ IS THE SOURCE, THE HANDOVER IS THE FALLBACK, AND THE ROOM SAYS
   WHICH. `Customer360ActionHistory` returns ids and status today; Phase B adds
   the executed plan's STEPS to its Completed rows. So there are three states
   and the greeting reads differently in each:

     steps present     the room states the executed changes, from the trail.
     steps absent,
     opened from a
     finale            the room says the org read carries no step detail yet and
                       works from the ledger the finale handed over.
     steps absent,
     opened cold       the room says the same thing and drafts the memo on the
                       package as it stands. It never guesses what changed.

   THE BUDGET IS THE FOUNDER'S (2026-09-02): one lead line and at most four
   lines under it. Everything the greeting could say and does not is in the
   memo, which is on the glass beside it.
   ============================================================================= */

/** The chip the greeting offers. `open` is present only where a memo exists. */
export interface MemoChip {
  id: "draft" | "steer" | "open";
  label: string;
}

export interface MemoGreeting {
  lead: string;
  /** At most four. The render plan, and whatever honesty the read demands. */
  lines: string[];
  ask: string;
  chips: MemoChip[];
  /** True where the greeting is standing on the org's own step detail. */
  fromOrg: boolean;
}

/* ------------------------------------------------------- reading the trail */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Sep", off an ISO instant. Undefined where the row carries no stamp. */
export function shortDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** An org id, short enough to sit in a sentence and long enough to be one id. */
export const shortId = (id: string): string => (id.length > 8 ? `${id.slice(0, 8)}…` : id);

/** The room's word for what an action did. The org's own action id wins over
 *  the trigger, because the row is what actually happened. */
export function actionWord(actionId: string | undefined, trigger: MemoTrigger): string {
  const id = actionId ?? "";
  if (/modif/i.test(id)) return "a modification";
  if (/renew/i.test(id)) return "a renewal";
  if (/new-facility|new_facility|origination/i.test(id)) return "a new facility";
  if (/annual-review|annual_review/i.test(id)) return "an annual review";
  if (/risk-rating|risk_rating/i.test(id)) return "a risk rating review";
  if (/covenant/i.test(id)) return "a covenant review";
  if (/valuation/i.test(id)) return "a collateral valuation";
  return trigger === "renew"
    ? "a renewal"
    : trigger === "create"
      ? "a new facility"
      : trigger === "modify"
        ? "a modification"
        : "an action";
}

/** One executed plan step, as a `MemoChange`. The two shapes are one shape;
 *  this is the coercion, not a translation. */
export function changeFromStep(step: ActionPlanStep, at: number): MemoChange {
  return {
    id: step.id ?? `step-${at}`,
    label: step.label ?? step.target?.name ?? `Step ${at + 1}`,
    target: { kind: step.target?.kind ?? "record", id: step.target?.id, name: step.target?.name },
    before: step.before,
    after: step.after,
    verification: step.verification,
    orgId: step.orgId,
  };
}

export interface ExecutedRead {
  /** The newest Completed row on this package, or null. */
  row: ActionHistoryRow | null;
  /** Its steps as changes. Empty where the read carried none. */
  changes: MemoChange[];
  /** Whether the row actually carried step detail. */
  hasSteps: boolean;
}

/**
 * THE LAST THING THE ORG RECORDS AGAINST THIS PACKAGE.
 *
 * Newest Completed row first. A row for another package is not this memo's
 * business, so a package anchor filters; a row with no package on it is kept
 * only when the room has no anchor either, which is the honest reading of a
 * trail that does not say which package it touched.
 */
export function executedRead(rows: readonly ActionHistoryRow[] | undefined, packageId: string | null): ExecutedRead {
  const candidates = (rows ?? [])
    .filter((r) => r.status === "Completed")
    .filter((r) => (packageId ? !r.productPackageId || r.productPackageId === packageId : true));
  // The read hands rows back newest first; sorting on the stamp keeps that true
  // for a caller that merged two reads, and is a no-op for the sweep's own.
  const sorted = [...candidates].sort((a, b) => (b.executedAt ?? "").localeCompare(a.executedAt ?? ""));
  const row = sorted[0] ?? null;
  const steps = row?.steps ?? [];
  return { row, changes: steps.map(changeFromStep), hasSteps: steps.length > 0 };
}

/* ---------------------------------------------------------- the greeting */

/** How many of the filed changes the banker asked for, and how many the room
 *  added on its own. Only a finale handover carries this; the trail does not. */
export interface ChangeSplit {
  requested: number;
  derived: number;
}

export interface MemoGreetingInput {
  packageId: string | null;
  trigger: MemoTrigger;
  executed: ExecutedRead;
  /** The finale's own ledger, where a finale opened the room. */
  carried: readonly MemoChange[] | null;
  carriedSplit?: ChangeSplit | null;
  plan: RenderPlan;
  /** True where `latestMemo()` came back with something. */
  hasStoredMemo: boolean;
}

const countPhrase = (n: number, split?: ChangeSplit | null): string => {
  const base = `${n} change${n === 1 ? "" : "s"}`;
  return split && split.derived > 0 ? `${base}: ${split.requested} requested, ${split.derived} derived` : base;
};

/** The render plan, in one line. Suppressed is counted, never listed here:
 *  the quiet expandable in the reading pane is where the reasons live. */
export function planLine(plan: RenderPlan): string {
  const on = plan.modules.length;
  const off = plan.suppressed.length;
  return off
    ? `Render plan: ${on} module${on === 1 ? "" : "s"} on, ${off} suppressed by the deal's own flags.`
    : `Render plan: ${on} module${on === 1 ? "" : "s"} on, nothing suppressed.`;
}

/** THE ASK. One question, three chips at most, and never a fourth. */
export const MEMO_ASK = "Draft it, or steer me first?";

/** The line the room says when the org read carries no step detail. It is the
 *  honest one and it is said out loud, because a memo that quietly drafted on
 *  no change list would look exactly like a memo that had read one. */
export const NO_STEP_DETAIL = "The org read carries no step detail yet";

export function memoGreeting(input: MemoGreetingInput): MemoGreeting {
  const { executed, carried, packageId } = input;
  const version = packageId ? `version ${shortId(packageId)}` : "this package";
  const lines: string[] = [];
  let lead: string;
  let fromOrg = false;

  if (executed.hasSteps && executed.row) {
    fromOrg = true;
    const when = shortDate(executed.row.executedAt ?? executed.row.createdDate);
    lead = `Since the last memo on this package: ${actionWord(executed.row.actionId, input.trigger)} filed${
      when ? ` ${when}` : ""
    } (${countPhrase(executed.changes.length)}), ${version}; drafting the memo for that version.`;
  } else if (carried?.length) {
    lead = `${NO_STEP_DETAIL}, so I am working from what this session just filed: ${countPhrase(
      carried.length,
      input.carriedSplit,
    )}, ${version}; drafting the memo for that version.`;
  } else {
    lead = `${NO_STEP_DETAIL}, and nothing was handed over, so this memo states ${version} as it stands rather than what changed.`;
  }

  lines.push(planLine(input.plan));

  const chips: MemoChip[] = [
    { id: "draft", label: "Draft" },
    { id: "steer", label: "Steer" },
  ];
  if (input.hasStoredMemo) chips.push({ id: "open", label: "Open latest memo" });

  // THE BUDGET IS A CAP, NOT A TARGET (founder, 2026-09-02). Four is the most
  // the room may say; it says one, and the memo says the rest.
  return { lead, lines: lines.slice(0, 4), ask: MEMO_ASK, chips, fromOrg };
}
