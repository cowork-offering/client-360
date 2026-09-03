import type { CSSProperties } from "react";
import { TypeIcon, iconForDelta, type IconKind } from "./TypeIcon";
import { derivedReasonOf } from "./derivedDelta";
import type { FiledEntry, HandoffEntry, WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   WHAT WAS FILED. THE LEDGER THE CARD CARRIES OUT OF THE DRAIN.

   FOUNDER, 2026-09-04: "the cinematic closing with the button, please include
   the card with WHAT HAS BEEN GENERATED as well; cinematic, elegant."

   THE FINALE WIPES THE ONE SURFACE THAT LISTED THE WRITES. The right rail held
   a card per staged change, each carrying the org record id that proves it
   landed, and the finale drains the rail with everything else (finale.ts, beat
   one). What survives is the dossier, alone, and the dossier's own rows name
   the change and its new value and nothing more. The proof left the glass with
   the rail.

   SO THE CARD CARRIES IT. One aligned row per entry, in RAIL ORDER, with the
   rail's own vocabulary: the type icon, the title, the Derived badge where the
   room added the change rather than the banker, the target, before → after, and
   the org record id as a quiet mono chip.

   NOTHING HERE IS RECOMPUTED. The rows are the same `entries` the rail drew and
   the same `filed` map execute verified them with; an entry no tool files
   carries its handoff word where an id would be, because "handed off" is the
   truth about that row and a blank is not.

   THE CHOREOGRAPHY CONTINUES THE CARD'S OWN. The dossier paces itself from the
   inside (header, hairline, rows, hairline, footer) and this section is the
   next beat of that same clock rather than a second animation over it: the head
   lands after the footer's check, then the rows rise {@link FILED_ROW_STAGGER_MS}
   apart. The aura is untouched and keeps breathing behind all of it.
   ============================================================================= */

/** The breath between the card's own last line and the ledger under it. Long
 *  enough that the check has popped and been read; short enough that the two
 *  are one construction rather than two arrivals. */
export const FILED_SECTION_MS = 220;

/** The rows, a beat after the section head. */
export const FILED_HEAD_MS = 160;

/** The beat between one row starting to rise and the next. Founder's number. */
export const FILED_ROW_STAGGER_MS = 60;

/** How long one row takes to rise its 6px and fade in. */
export const FILED_ROW_MS = 320;

/** The whole list is on the glass inside this, counted from the head. */
export const FILED_LIST_MS = 1200;

/**
 * HOW MANY ROWS MAY CARRY A STAGGER.
 *
 * The same argument the drain's own cap makes (`FINALE_STAGGER_CAP`): a plan of
 * twenty entries would spend two seconds performing its own length, and the
 * founder's budget is 1.2s for the list however long it is. Past this the rows
 * share the last beat, so the head, the stagger and one row's rise always fit
 * inside {@link FILED_LIST_MS}.
 */
export const FILED_ROW_CAP = Math.floor((FILED_LIST_MS - FILED_HEAD_MS - FILED_ROW_MS) / FILED_ROW_STAGGER_MS);

/** Where a row's rise starts, measured from the section's own base. */
export function filedRowAt(index: number): number {
  return FILED_HEAD_MS + Math.min(Math.max(index, 0), FILED_ROW_CAP) * FILED_ROW_STAGGER_MS;
}

/**
 * ONE FILED CHANGE, AS THE CARD STATES IT.
 *
 * `before`/`after` are optional because not every room's ledger is a delta: the
 * relationship room files ANSWERS, which carry one figure and no baseline, and
 * a row with only an `after` states that figure alone rather than an arrow from
 * nothing.
 */
export interface FiledLine {
  key: string;
  icon: IconKind;
  title: string;
  /** The facility, or whatever the room files against. Absent where the row is
   *  about the relationship itself. */
  target?: string;
  before?: string;
  after?: string;
  /** The org's own id for what this wrote. */
  recordId?: string;
  /** Where nothing was written: the word that stands in an id's place. */
  handoff?: string;
  /** Why, on the native tooltip, so the row spends no further words. */
  handoffReason?: string;
  /** Non-null where the ROOM added this change rather than the banker. */
  derivedReason?: string | null;
}

/** The facility room's ledger: the manifest, in rail order, with the execution's
 *  own verification carried onto it. */
export function filedLinesFor(
  entries: readonly WorkroomDelta[],
  filed: ReadonlyMap<string, FiledEntry>,
  handoffs: ReadonlyMap<string, HandoffEntry> = new Map(),
): FiledLine[] {
  return entries.map((delta) => {
    const wrote = filed.get(delta.id);
    const off = wrote ? undefined : handoffs.get(delta.id);
    return {
      key: delta.id,
      icon: iconForDelta(delta),
      title: delta.title,
      target: delta.target,
      before: delta.before,
      after: delta.after,
      recordId: wrote?.recordId,
      handoff: off ? "Handed off" : undefined,
      handoffReason: off?.reason,
      derivedReason: derivedReasonOf(delta),
    };
  });
}

/**
 * @param head  the counts line, in the room's own nouns ("6 changes · 4
 *              requested · 2 derived"). Built by the caller off the same split
 *              the rail head carried, never recounted here.
 * @param at    when the section starts, in ms: the end of the card's own paced
 *              reveal, which already carries the finale's `hold`.
 */
export function FiledList({ head, lines, at }: { head: string; lines: readonly FiledLine[]; at: number }) {
  if (!lines.length) return null;
  return (
    <div className="rc-fl" style={{ "--wk-fl-ms": `${FILED_ROW_MS}ms` } as CSSProperties}>
      <div className="rc-fl-h" style={{ animationDelay: `${at}ms` }}>
        <span className="rc-fl-t">What was filed</span>
        <span className="rc-fl-n">{head}</span>
      </div>
      {lines.map((line, i) => (
        <div className="rc-fl-r" style={{ animationDelay: `${at + filedRowAt(i)}ms` }} key={line.key}>
          <TypeIcon kind={line.icon} />
          <span className="rc-fl-l">
            <b>{line.title}</b>
            {line.derivedReason && (
              <span className="wk-derived" title={line.derivedReason}>
                Derived
              </span>
            )}
          </span>
          {line.target && <span className="rc-fl-tg">{line.target}</span>}
          <span className="rc-fl-d tnum">
            {/* BEFORE → AFTER WHERE THE ROW HAS BOTH. A review's answer has one
                figure and no baseline, and an arrow from nothing would invent a
                delta the flow never filed. */}
            {line.before && line.after && (
              <>
                <span className="rc-fl-was">{line.before}</span>
                <span className="rc-fl-arw" aria-hidden="true">
                  →
                </span>
              </>
            )}
            <span className="rc-fl-now">{line.after ?? line.before}</span>
          </span>
          {line.recordId ? (
            <span className="rc-fl-id">{line.recordId}</span>
          ) : line.handoff ? (
            <span className="rc-fl-off" title={line.handoffReason}>
              {line.handoff}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
