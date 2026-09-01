import { fmtMoney } from "../../data/format";
import type { IntentResult, WorkroomAdvisory, WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE DISPATCH RULE, AND THE TWO SAFETY LAYERS BESIDE IT.

   THE INVERSION (founder, 2026-09-01: "there is no agent in the room"). The
   lanes used to split on SHAPE: questions to the brain, instructions to the
   parser, unconditionally. So every line that needed intelligence was routed
   away from the component built to supply it. The rule is now:

     reads          -> answered LOCALLY, from the bundle, always and first;
     provably clean -> the parser, straight through, so proven phrasings keep
                       their instant card;
     everything else-> the brain, with the parser's own reply held behind it as
                       the degrade.

   "PROVABLY CLEAN" IS A HIGH BAR ON PURPOSE. It is not "the parser returned
   something": it is the parser staging at least one sound delta, off a single
   clause, with no dollar qualifier in the line contradicting the member set it
   resolved. Every one of the drive's misses failed at least one of the three.

   NOTHING HERE PARSES A VALUE OR RESOLVES A RECORD. It reads the line's shape
   and the deltas the engine already produced. The engines under
   `app/src/workroom/` are untouched by it, which is why the two safety layers
   below live here rather than in the resolver that caused them.
   ============================================================================= */

/* ------------------------------------------------------------ money in a line

   A FIGURE COUNTS ONLY WHERE IT IS WRITTEN AS MONEY: with a currency mark or
   with a magnitude word. A bare "240" is a term in months and a bare "1.15" is
   a covenant threshold, and reading either as a dollar qualifier is the mirror
   of the bug this layer exists to fix.                                       */

const MAGNITUDE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

const MONEY =
  /(?:\$\s*(\d[\d,]*(?:\.\d+)?)\s*(mm|m|k|bn|b|million|thousand|billion)?|\b(\d[\d,]*(?:\.\d+)?)\s*(mm|m|k|bn|b|million|thousand|billion)\b)/gi;

/** Every dollar figure the line carries, in the order it carries them. */
export function dollarFigures(line: string): number[] {
  const out: number[] = [];
  for (const match of line.matchAll(MONEY)) {
    const digits = match[1] ?? match[3];
    const suffix = (match[2] ?? match[4] ?? "").toLowerCase();
    const base = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    out.push(base * (MAGNITUDE[suffix] ?? 1));
  }
  return out;
}

/** Two figures are the same figure. The room prints commitments to one decimal
 *  in millions, so "2.5M" and a $2,499,000 record are the same thing said two
 *  ways, and an exact-match rule would miss every one of them. */
function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(50_000, Math.abs(b) * 0.005);
}

/* -------------------------------------------------------------- one clause?

   THE THREE-PART LINE COLLAPSED (F6). "increase the line to 20M, extend the
   equipment to 240 months and add a 1% fee" produced ONE wrong delta and two
   silent drops. The parser's own multi-change path did not engage on that
   phrasing, and the room had no way to know it had been given three things.

   A MULTI-CLAUSE LINE IS THE BRAIN'S. It comes back as a proposal with one
   entry per clause, restated through proven phrasings, with whatever carried no
   phrasing said out loud. That is the fix, and this is the only judgement the
   shell has to make for it.                                                  */

/** The breaks between clauses. The comma is guarded against a DIGIT, because
 *  "$2,500,000" is one figure and splitting it would read as three clauses. */
const CONNECTOR = /\s*;\s*|,(?!\d)\s*(?:and\s+|then\s+|also\s+|plus\s+)?|\s+and\s+then\s+|\s+and\s+also\s+|\s+and\s+|\s+plus\s+/gi;

/** How many clauses the line carries. A segment with no word in it is not one. */
export function clauseCount(line: string): number {
  return line
    .split(CONNECTOR)
    .map((part) => part.trim())
    .filter((part) => /[a-z0-9]/i.test(part)).length;
}

export const singleClause = (line: string): boolean => clauseCount(line) <= 1;

/* ----------------------------------------------------- the qualifier filter

   THE DOLLAR QUALIFIER WAS IGNORED (F4, struck twice in the drive). "the 2.5M
   line of credit to 4M" resolved BOTH lines of credit and staged a 15M -> 4M
   reduction beside the change the banker asked for. Member resolution lives in
   the fenced engine, so the fix is post-parse and it is here: where the line
   carries a figure that names exactly ONE member, its siblings come off the
   table BEFORE any chip is drawn, and the room says which one it read.
   ============================================================================= */

/** A member, as this layer needs it: an id to match deltas on, a label to say
 *  out loud, and the commitment the qualifier is matched against. */
export interface QualifierMember {
  id: string;
  label: string;
  /** Null where no read carries the figure. Such a member never qualifies. */
  committed: number | null;
}

export interface QualifierRead {
  keep: WorkroomDelta[];
  /** The siblings the qualifier ruled out. Never silently: see `said`. */
  dropped: WorkroomDelta[];
  /** What the room says about the reading. Null where nothing was dropped. */
  said: string | null;
}

/** Which member a delta lands on. The engines stamp the loan id on `member`;
 *  the wire carries it too, and either is the same fact. */
const loanOf = (d: WorkroomDelta): string | null => d.member ?? d.wire?.facilityId ?? null;

/** The figures the deltas are moving TO. A target is not a qualifier, and
 *  reading "to 4M" as one would resolve the wrong member every time. */
function claimedValues(deltas: WorkroomDelta[]): number[] {
  const out: number[] = [];
  for (const d of deltas) {
    if (typeof d.wire?.value === "number") out.push(d.wire.value);
    for (const n of dollarFigures(String(d.after ?? ""))) out.push(n);
  }
  return out;
}

export function qualifierFilter(
  line: string,
  deltas: WorkroomDelta[],
  members: QualifierMember[],
): QualifierRead {
  const none: QualifierRead = { keep: deltas, dropped: [], said: null };
  const targets = new Set(deltas.map(loanOf).filter((id): id is string => Boolean(id)));
  // A line that resolved one member cannot have resolved the wrong sibling.
  if (targets.size < 2) return none;

  const claimed = claimedValues(deltas);
  const qualifiers = dollarFigures(line).filter((n) => !claimed.some((c) => sameMoney(n, c)));
  if (!qualifiers.length) return none;

  // EXACTLY ONE MEMBER, FROM EXACTLY ONE READING. A figure matching two members
  // names neither, and two figures naming two different members is a line this
  // layer has no business narrowing.
  const named = new Set<string>();
  let matched: QualifierMember | null = null;
  for (const q of qualifiers) {
    const hits = members.filter((m) => typeof m.committed === "number" && sameMoney(q, m.committed));
    if (hits.length !== 1) continue;
    named.add(hits[0].id);
    matched = hits[0];
  }
  if (named.size !== 1 || !matched || !targets.has(matched.id)) return none;

  const on = matched;
  const keep = deltas.filter((d) => loanOf(d) === on.id);
  const dropped = deltas.filter((d) => loanOf(d) !== on.id);
  if (!keep.length || !dropped.length) return none;

  const plural = dropped.length === 1;
  return {
    keep,
    dropped,
    said:
      `Read that as the ${fmtMoney(on.committed as number)} ${on.label}. ` +
      `The other ${plural ? "facility" : "facilities"} that line could have named ${plural ? "is" : "are"} left alone.`,
  };
}

/* ---------------------------------------------------------- the magnitude bound

   $900M STAGED ON A $49MM PACKAGE, with no objection of any kind (F5). The
   engine's own soundness check covers misparse SHAPES and nothing else, so a
   figure two orders of magnitude out of the relationship's range reached a chip
   looking exactly like a figure the banker meant.

   IT IS AN ADVISORY, NOT A GATE. Same pattern as the drawn-balance rule: the
   chip still arrives, still open, still with its Confirm on it. The room says
   the thing a credit officer would say across the desk and offers the reading
   that would have made sense, where one does.                                */

/** How far past the whole relationship's commitment a single facility may go
 *  before the room says something. */
export const MAGNITUDE_MULTIPLE = 2;

/** The decimal slips a banker actually makes, smallest first. */
const SHIFTS = [10, 100, 1000];

export function magnitudeAdvisories(args: {
  deltas: WorkroomDelta[];
  members: QualifierMember[];
  /** The package's committed total today, in dollars. */
  committed: number;
}): WorkroomAdvisory[] {
  const out: WorkroomAdvisory[] = [];
  const ceiling = args.committed * MAGNITUDE_MULTIPLE;
  for (const delta of args.deltas) {
    if (delta.wire?.key !== "requestedAmount" || typeof delta.wire.value !== "number") continue;
    const limit = delta.wire.value;
    const member = args.members.find((m) => m.id === loanOf(delta));
    const name = member?.label ?? delta.target ?? "that facility";

    if (limit < 0) {
      out.push({
        id: `advice:magnitude:negative:${delta.id}`,
        rule: "commitment-out-of-range",
        line: `A commitment of ${fmtMoney(limit)} on the ${name} is below zero, so it is not a limit the bank can approve. That figure came out wrong.`,
      });
      continue;
    }
    if (!(args.committed > 0) || limit <= ceiling) continue;

    const times = limit / args.committed;
    out.push({
      id: `advice:magnitude:${delta.id}:${limit}`,
      rule: "commitment-out-of-range",
      line:
        `${fmtMoney(limit)} on the ${name} is ${times.toFixed(times >= 10 ? 0 : 1)} times the ` +
        `${fmtMoney(args.committed)} this whole relationship has committed today. It stages as asked, and on the numbers this read carries it is not a figure a credit file would survive.`,
      resolution: correction(limit, ceiling, member, args.members),
    });
  }
  return out;
}

/** The reading that would have made sense, where exactly one does. A member
 *  whose label repeats across the package gets NO resolution: a sentence that
 *  cannot resolve one facility out of two would stage the wrong one. */
function correction(
  limit: number,
  ceiling: number,
  member: QualifierMember | undefined,
  members: QualifierMember[],
): WorkroomAdvisory["resolution"] {
  if (!member) return undefined;
  if (members.filter((m) => m.label === member.label).length !== 1) return undefined;
  const floor = typeof member.committed === "number" ? member.committed : 0;
  for (const shift of SHIFTS) {
    const candidate = limit / shift;
    if (candidate <= ceiling && candidate >= floor) {
      return {
        label: `Make it ${fmtMoney(candidate)}`,
        say: `change the commitment on the ${member.label} to ${Math.round(candidate)}`,
      };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------- the fast path */

/**
 * IS THIS PARSE PROVABLY CLEAN.
 *
 * Three conditions, and every miss in the 2026-09-01 drive failed at least one:
 * the parser staged something sound (P5 staged nothing), off a single clause
 * (P11 carried three), with a member set the qualifier does not contradict
 * (P6 and P7 both did). A line that fails any of them is the brain's.
 *
 * A QUALIFIER THAT RESOLVED THE LINE IS A STRONGER PARSE, NOT A WEAKER ONE
 * (the second drive, 2026-09-01 evening). `qualifierFilter` narrows ONLY when
 * exactly one member matches exactly one reading, so "the 2.5M line of credit"
 * comes out of it exactly resolved and says so. Treating that as unclean sent
 * the most precise line shape the banker writes on a round trip it did not
 * need, and made the connected room WORSE than the disconnected one: with no
 * channel the filter staged the right single chip instantly, while with a
 * channel the same line waited on the desk. Unresolved is still the brain's:
 * where the filter dropped everything it had nothing left to stand on.
 */
export function provablyClean(args: {
  line: string;
  result: IntentResult;
  /** The deltas left after the value bounds. */
  sound: WorkroomDelta[];
  qualifier: QualifierRead;
}): boolean {
  if (args.result.kind !== "deltas") return false;
  if (!args.sound.length) return false;
  if (!singleClause(args.line)) return false;
  if (!args.qualifier.dropped.length) return true;
  return args.qualifier.keep.length > 0;
}
