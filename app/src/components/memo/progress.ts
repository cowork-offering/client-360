import type { SettledRow } from "../workroom/settle";

/* =============================================================================
   THE WORKING EXCHANGE: what the room is doing, while it is doing it.

   FOUNDER, 2026-09-04: "when it drafts or steers, gentle loading with the >
   getting filled; right now it flickers and updates, not sexy. The chat becomes
   unresponsive during draft or steer; it should be more like a timeline, think
   of when a connector connects in Claude Cowork, elegant, always showing only
   the latest two interactions, and clear that it is working on something."

   THE DRAFT USED TO SPEAK IN RECEIPTS. Each section that landed said "X
   written." into the thread, so a seven-section draft was seven bubbles that
   pushed the greeting off the glass and told the banker nothing until the
   section after the one they were waiting for had already arrived. The work was
   only ever legible in the past tense.

   SO THE WORK IS ONE OBJECT NOW, and it is on the stage while it happens: the
   manifest's sections as a timeline, one row each, each row in one of four
   states. Nothing here draws anything: the room owns the markup and the
   stylesheet owns the motion. What lives in this file is the STATE MACHINE and
   the sentences, because both are things a test should be able to assert
   without mounting a room.

   FOUR STATES AND NOT THREE. `missed` is a section the desk did not answer:
   the memo keeps the plugin's own pending placeholder where it sits, and the
   row says so rather than printing a check over a paragraph nobody wrote. That
   is the same gap rule the renderer follows in its cells.
   ============================================================================= */

/** Where one row of the timeline stands. */
export type WorkRowState = "queued" | "writing" | "done" | "missed";

/** A section of the memo, or a line the banker typed while the draft ran. */
export type WorkRowKind = "section" | "steer";

export interface WorkRow {
  /** Module id for a section; `steer:<n>` for a queued line. */
  id: string;
  title: string;
  kind: WorkRowKind;
  state: WorkRowState;
  /** How long the desk took over it, once it is off `writing`. */
  ms?: number;
  /** The room's clock when this row started writing. Internal to the machine. */
  since?: number;
}

export interface MemoWork {
  kind: "draft" | "steer";
  /** What the memo is about, for the lead line. The package, as it is named. */
  packageName: string;
  rows: readonly WorkRow[];
  /** The room's clock at the moment the work began. */
  startedAt: number;
  /** How long the whole thing took, once it is over. */
  ms?: number;
}

/* -----------------------------------------------------------------------------
   THE MACHINE. Every transition returns a NEW work: the room holds this in
   React state and a mutated row would not re-render the timeline it is in.
   ----------------------------------------------------------------------------- */

export function beginWork(args: {
  kind: "draft" | "steer";
  packageName: string;
  sections: ReadonlyArray<{ id: string; title: string }>;
  now: number;
}): MemoWork {
  return {
    kind: args.kind,
    packageName: args.packageName,
    rows: args.sections.map((s) => ({ id: s.id, title: s.title, kind: "section", state: "queued" })),
    startedAt: args.now,
  };
}

/** This section is being written now. Everything else keeps its state. */
export function startRow(work: MemoWork, id: string, now: number): MemoWork {
  return mapRow(work, id, (row) => ({ ...row, state: "writing", since: now }));
}

/** The desk answered (or did not), and the row records how long it took. */
export function finishRow(work: MemoWork, id: string, now: number, missed = false): MemoWork {
  return mapRow(work, id, (row) => ({
    ...row,
    state: missed ? "missed" : "done",
    ms: Math.max(0, now - (row.since ?? work.startedAt)),
    since: undefined,
  }));
}

/**
 * A LINE TYPED WHILE THE DRAFT RUNS, ON THE TIMELINE WHERE IT WILL HAPPEN.
 *
 * The composer never closes (founder, above), so a banker who reads the
 * covenant section arriving and wants it tighter says so THEN. The room does
 * not interrupt a draft to serve it and it does not swallow it either: it
 * stands at the foot of the timeline, in the banker's own words, as the next
 * thing that will happen.
 */
export function queueSteer(work: MemoWork, text: string): MemoWork {
  const n = work.rows.filter((r) => r.kind === "steer").length + 1;
  const when = work.kind === "steer" ? "after this" : "after the draft";
  return {
    ...work,
    rows: [...work.rows, { id: `steer:${n}`, title: `${when}: ${text}`, kind: "steer", state: "queued" }],
  };
}

/** The work is over. Anything still queued was never reached. */
export function endWork(work: MemoWork, now: number): MemoWork {
  return { ...work, ms: Math.max(0, now - work.startedAt) };
}

/** The lines the banker queued, in order, for the room to run next. */
export function queuedSteers(work: MemoWork): string[] {
  return work.rows.filter((r) => r.kind === "steer" && r.state === "queued").map((r) => r.title.replace(/^after [^:]+: /, ""));
}

function mapRow(work: MemoWork, id: string, fn: (row: WorkRow) => WorkRow): MemoWork {
  return { ...work, rows: work.rows.map((row) => (row.id === id ? fn(row) : row)) };
}

/* -----------------------------------------------------------------------------
   WHAT THE ROOM SAYS ABOUT IT
   ----------------------------------------------------------------------------- */

/** Sections only. A queued steer is the next piece of work, never progress. */
export function workProgress(work: MemoWork): { done: number; total: number } {
  const sections = work.rows.filter((r) => r.kind === "section");
  return { done: sections.filter((r) => r.state === "done" || r.state === "missed").length, total: sections.length };
}

/** 0 to 1, for the mark that fills. Zero sections is zero, never a divide. */
export function workFraction(work: MemoWork): number {
  const { done, total } = workProgress(work);
  return total ? done / total : 0;
}

/** The lead line above the timeline. */
export function workLead(work: MemoWork): string {
  const { done, total } = workProgress(work);
  if (work.kind === "steer") {
    const title = work.rows.find((r) => r.kind === "section")?.title ?? "one section";
    return `Rewriting ${title} in the memo for ${work.packageName}`;
  }
  return `Drafting the memo for ${work.packageName}: ${done} of ${total} sections`;
}

/** The same state, in the one line above the reading pane (requirement 5). */
export function workProgressLine(work: MemoWork): string {
  const { done, total } = workProgress(work);
  return `${work.kind === "steer" ? "Rewriting" : "Drafting"}: ${done} of ${total} section${total === 1 ? "" : "s"}`;
}

/**
 * THE COMPACT ROW THE FINISHED WORK BECOMES.
 *
 * The rooms' own two fields: what settled, and how. The whole timeline is one
 * click away under it, which is where the per-section seconds live now.
 */
export function rowForWork(work: MemoWork): SettledRow {
  const { done, total } = workProgress(work);
  const took = secs(work.ms ?? 0);
  if (work.kind === "steer") {
    const title = work.rows.find((r) => r.kind === "section")?.title ?? "one section";
    return { what: `Rewrote ${title} in ${took}`, how: "written" };
  }
  const count = done === total ? `${done} section${done === 1 ? "" : "s"}` : `${done} of ${total} sections`;
  return { what: `Drafted ${count} in ${took}`, how: "written" };
}

/**
 * SECONDS, AS THE ROOM PRINTS THEM.
 *
 * One decimal under ten seconds, where the difference between 2.1 and 2.8 is
 * the difference a reader can feel; whole seconds above it, where it is not.
 */
export function secs(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}
