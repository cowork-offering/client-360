import { fmtMoney } from "../../data/format";
import { catalogField } from "../../workroom/fieldCatalog";
import type { IntentResult, WorkroomAdvisory, WorkroomDelta, WorkroomRefusal } from "../../workroom/types";
import { clipTitle, facilitiesFor, readScope, rolesOnFacility, samePartyName, type Book, type BookAsset, type ElicitMember } from "./elicit";

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

/* ============================ THE DOLLAR QUALIFIER, READ AS FOCUS (N3)

   "add a 1% origination fee on the 15M line of credit" was read by the fenced
   engine as a $15,000,000 FEE, so it asked "is the fee 1% or $15,000,000?" -
   and then took the banker's NEXT line as the answer to that question and
   staged a fifteen million dollar fee. One phrase, two changes wrong.

   THE QUALIFIER ONLY EVER WORKED ON COMMITMENT LINES, where the post-parse
   filter above narrows the members after the fact. It cannot work that way on a
   fee, an exception, a covenant, a pledge or a party: there the figure is not
   selecting between deltas, it is being READ AS THE VALUE, and by the time the
   filter runs the damage is in the wire.

   SO IT IS PRE-EMPTED, BEFORE THE ENGINE SEES THE LINE. Where a figure resolves
   to exactly ONE facility, the room sets its FOCUS to that facility and takes
   the qualifier phrase out of the line. "on the 15M line of credit" then behaves
   exactly like clicking the facility chip, which is the gesture it was always
   standing in for. Nothing extra is said on the glass: the card names the
   facility, as it does after a click.

   FOUR GUARDS, and each one closes a way this could be wrong:

     1. ONE CLAUSE. A line naming two facilities in two clauses is the brain's,
        and stripping the first phrase would carry the second clause onto the
        wrong member;
     2. A SURFACE THAT MISREADS THE FIGURE. Commitment lines are left alone -
        they work today on the filter above, and a commitment line's figure IS
        its value;
     3. A PREPOSITION IN FRONT AND A FACILITY NOUN BEHIND. "add a fee of
        $15,000,000" carries a figure that happens to match a facility and names
        no facility at all, and it must come through untouched;
     4. EXACTLY ONE MEMBER. A figure matching two facilities names neither, and
        the engine's own behaviour stands.
   ============================================================================= */

/** The surfaces where a dollar figure in the line is a FACILITY NAME rather
 *  than the change's own value. Commitment is deliberately absent. */
const QUALIFIER_SURFACE =
  /\b(fees?|origination|arrangement|unused|upfront|waiver|exceptions?|policy|covenants?|tests?|pledges?|pledged|collateral|security|liens?|guarantors?|co-?borrowers?|borrowers?|related\s+entity|involvement)\b/i;

/** The nouns that make the words after a figure a FACILITY rather than the rest
 *  of the sentence. A member's own product words count too, and are added per
 *  member below. */
const FACILITY_NOUN = new Set(["line", "lines", "loan", "loans", "facility", "facilities", "credit", "revolver", "note", "notes"]);

/** Words a facility phrase may carry without naming anything itself. */
const PHRASE_FILLER = new Set(["of", "the", "a", "an"]);

/** A preposition and its article, immediately in front of the figure. Without
 *  one the figure is not naming a facility, it is being one. */
const QUALIFIER_LEAD = /(?:\b(?:on|onto|to|for|against|under|at|in|from|across)\s+(?:the|this|our|that)\s+)$/i;

/** Every dollar figure in the line, with where it sits. */
function moneySpans(line: string): Array<{ value: number; start: number; end: number }> {
  const out: Array<{ value: number; start: number; end: number }> = [];
  for (const match of line.matchAll(MONEY)) {
    const digits = match[1] ?? match[3];
    const suffix = (match[2] ?? match[4] ?? "").toLowerCase();
    const base = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(base) || match.index === undefined) continue;
    out.push({ value: base * (MAGNITUDE[suffix] ?? 1), start: match.index, end: match.index + match[0].length });
  }
  return out;
}

export interface FocusRead {
  /** The facility the figure named. The room stands on it. */
  memberId: string;
  /** The line with the qualifier phrase taken out of it. */
  line: string;
  /** The phrase that came out, for the record. Never said on the glass. */
  qualifier: string;
}

export function focusQualifier(line: string, members: QualifierMember[]): FocusRead | null {
  if (!singleClause(line)) return null;
  if (!QUALIFIER_SURFACE.test(line)) return null;

  const hits: Array<{ member: QualifierMember; start: number; end: number }> = [];
  for (const span of moneySpans(line)) {
    const named = members.filter((m) => typeof m.committed === "number" && sameMoney(span.value, m.committed));
    if (named.length !== 1) continue;
    hits.push({ member: named[0], start: span.start, end: span.end });
  }
  if (hits.length !== 1) return null;
  const { member, start, end } = hits[0];

  // THE PREPOSITION IN FRONT. Without one the figure is the change's own value.
  const lead = QUALIFIER_LEAD.exec(line.slice(0, start));
  if (!lead) return null;

  // AND THE FACILITY NOUN BEHIND, from the package's own vocabulary.
  const own = new Set(
    member.label
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  let cursor = end;
  let named = false;
  for (;;) {
    const next = /^\s+([a-z]+)/i.exec(line.slice(cursor));
    if (!next) break;
    const word = next[1].toLowerCase();
    const isNoun = FACILITY_NOUN.has(word) || own.has(word);
    if (!isNoun && !PHRASE_FILLER.has(word)) break;
    if (isNoun) named = true;
    cursor += next[0].length;
  }
  if (!named) return null;

  const qualifier = line.slice(start - lead[0].length, cursor).trim();
  const stripped = `${line.slice(0, start - lead[0].length)} ${line.slice(cursor)}`
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  if (!stripped) return null;
  return { memberId: member.id, line: stripped, qualifier };
}

/* ------------------------------------------------- the narrative, reconciled

   THE SENTENCE CONTRADICTED THE CHIPS (D3). "add a DSCR covenant of 1.25x on
   the 15M line of credit" put ONE chip on the table, correctly narrowed, over a
   sentence that said "it lands on all of them: Line of Credit ($15M), Line of
   Credit ($2.50M)". The chips were right and the words were wrong, which is
   worse than either being wrong alone: a banker reads the words.

   The engine composed that sentence before the filter ran and cannot know the
   filter ran, so the reconciliation is here, with the filter. THREE MOVES, and
   none of them invents a claim:

     1. the fan-out ANNOUNCEMENT goes. It exists only to say a line reached
        every facility of a product, and the filter has just made that untrue;
     2. a member the filter dropped comes out of every list that names it;
     3. the count of what goes on the clone is restated from what survived.

   A PRESENTATION FILTER, LIKE `bankerly`. No engine string changed, the engine
   tests still assert the engine's own words, and a reply with no fan-out in it
   comes back byte-identical.                                                 */

/** The engine's own fan-out sentence. `(?:[^.]|\.\d)*` lets a decimal point
 *  inside a figure ("$2.50M") stay part of the sentence, so the match ends on
 *  the full stop that ends it rather than on the one inside the money. */
const FANOUT_ANNOUNCEMENT = /That names a product this package carries \d+ of, so it lands on all of them:(?:[^.]|\.\d)*\.\s*/g;
const ON_THE_CLONE = /\b\d+ of these go on the clone\b/g;

const escapeLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function reconcileNarrative(reply: string, kept: WorkroomDelta[], dropped: WorkroomDelta[]): string {
  if (!dropped.length) return reply;
  const droppedLabels = [...new Set(dropped.map((d) => d.target).filter(Boolean))];
  const keptLabels = new Set(kept.map((d) => d.target));
  let out = reply.replace(FANOUT_ANNOUNCEMENT, "");
  for (const label of droppedLabels) {
    if (keptLabels.has(label)) continue;
    const l = escapeLiteral(label);
    out = out
      .replace(new RegExp(`\\s+and\\s+${l}(?![\\w(])`, "g"), "")
      .replace(new RegExp(`,\\s*${l}(?![\\w(])`, "g"), "")
      .replace(new RegExp(`${l}\\s+and\\s+`, "g"), "")
      .replace(new RegExp(`${l},\\s*`, "g"), "");
  }
  const survivors = new Set(kept.map((d) => d.id)).size;
  return out.replace(ON_THE_CLONE, `${survivors} of these go on the clone`).trim();
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

/* ================================================== the borrowing-structure layers

   THREE POST-PARSE CORRECTIONS AND ONE PRE-PARSE REWRITE, all on the same
   material: what the BOOK says about who is on which facility in what role. The
   engines under `app/src/workroom/` resolve none of it - a party amendment
   carries whatever role the LINE happened to name - so the corrections live
   here, beside the qualifier filter, for exactly the reason that one does.
   ============================================================================= */

/** The role words a borrowing-structure change may carry. Two names for the same
 *  role differ only by case in this org's reads, so the comparison is case-
 *  insensitive and nothing else. */
const sameRole = (a: string | undefined, b: string | undefined): boolean =>
  Boolean(a) && Boolean(b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

export interface RoleStamp {
  /** The deltas that may go on the table. A removal the book cannot ground is
   *  NOT among them: nothing is staged against a row the org will not find. */
  deltas: WorkroomDelta[];
  /** What the room says about the roles it read. Never silent. */
  said: string[];
  /** The question that has to be answered before the removal can be staged. */
  ask: { text: string; options: Array<{ label: string; say: string }> } | null;
}

/**
 * THE ROLE ON A CARRY EXCLUSION COMES FROM THE BOOK (E8, the drive's blocker).
 *
 * "take Elena Hartwell off the 15M line of credit" staged the exclusion with
 * role Guarantor. Her actual role on that facility is LIMITED Guarantor, so the
 * org found no Guarantor row for her, answered "nothing to remove" and REFUSED
 * THE WHOLE PLAN - nine sound changes lost to one wrong word.
 *
 * The org holds involvement as rows, one per facility, so the role is a fact
 * about a NAME ON A FACILITY and never about a name. This resolves it from the
 * involvements the room is already holding and stamps the wire before the chip
 * is drawn:
 *
 *   exactly one role  - use it, and SAY it, because a role the banker did not
 *                       type is a fact he is entitled to see before he signs;
 *   several           - ask which, because taking the wrong row off a guaranty
 *                       is not a mistake to make quietly;
 *   none              - say so, and name the facilities the party IS on, rather
 *                       than staging a removal the org would refuse.
 */
export function stampRemovalRoles(args: {
  deltas: WorkroomDelta[];
  book: Book;
  /** The member's own display label, for a sentence a banker can read. */
  label: (loanId: string) => string;
}): RoleStamp {
  const out: WorkroomDelta[] = [];
  const said: string[] = [];
  let ask: RoleStamp["ask"] = null;

  for (const delta of args.deltas) {
    const wire = delta.involvementWire;
    if (!wire || wire.op !== "remove") {
      out.push(delta);
      continue;
    }
    const where = args.label(wire.facilityId);
    const roles = rolesOnFacility(args.book, wire.accountName, wire.facilityId);

    if (roles.length === 1) {
      const role = roles[0];
      if (!sameRole(wire.role, role)) {
        said.push(
          wire.role
            ? `${wire.accountName} is ${role} on the ${where}, not ${wire.role}. I am taking the row the book actually holds.`
            : `${wire.accountName}, ${role} on the ${where}.`,
        );
      } else {
        said.push(`${wire.accountName}, ${role} on the ${where}.`);
      }
      out.push({
        ...delta,
        involvementWire: { ...wire, role },
        // The role belongs where the banker signs, not only in the sentence
        // above it: the exclusion takes THIS row off the clone and no other.
        before: `${role}, carried over from the parent`,
      });
      continue;
    }

    if (roles.length > 1) {
      ask = {
        text: `${wire.accountName} holds ${roles.length} roles on the ${where}: ${roles.join(" and ")}. A carry exclusion takes one row off the clone, so which of them comes off?`,
        options: roles.map((role) => ({ label: role, say: `remove the ${role.toLowerCase()} ${wire.accountName} from the ${where}` })),
      };
      continue;
    }

    /* NOT ON THAT FACILITY, or NOT IN THIS READ AT ALL. They are two different
       facts and only one of them is a refusal.

       Where the read carries the name somewhere else on the package, the room
       KNOWS they are not on this facility, and the honest answer names where
       they are: a banker restructuring a guaranty is holding the whole
       relationship in mind, and "no" on its own sends them back to a read they
       should not need.

       Where the read carries the name NOWHERE, the room knows nothing about it
       and the ORG is the authority on who is on a facility. Refusing there
       would be the cockpit's own thin read overruling the bank's record. So the
       exclusion goes up, and the unverified role comes OFF the wire: a remove
       needs no role (the org resolves the exact row at stage time and refuses
       ambiguity), and a role nothing corroborates is exactly what blocked the
       drive. */
    const elsewhere = facilitiesFor(args.book, wire.accountName);
    if (elsewhere.length) {
      said.push(
        `${wire.accountName} is not on the ${where} today, so there is nothing there to take off. This book carries ${wire.accountName} on ${elsewhere
          .map((f) => `${args.label(f.loanId)} as ${f.role}`)
          .join(", ")}.`,
      );
      continue;
    }
    said.push(
      `This read does not carry ${wire.accountName} on the borrowing structure, so I cannot tell you which row comes off: the exclusion goes up naming ${wire.accountName} and the facility, and the org resolves the row itself when it is filed.`,
    );
    out.push({
      ...delta,
      involvementWire: { ...wire, role: undefined },
      before: "carried over from the parent",
    });
  }

  return { deltas: out, said, ask };
}

/* ------------------------------- "take X off Y" AND THE SENTENCE IT BECOMES
   (E5 + E8, rung 0, in front of a fenced engine.)

   TWO DEFECTS, ONE PHRASE. parseModify.ts puts `take off` in the collateral
   verb class (457) and in the party verb class (477), and collateral wins, so
   "take Elena Hartwell off the 15M line of credit" was read as an unpledge
   (E5). And the party catalog matches a removal on "remove the <role>", so even
   restated with the right verb the line names no role, resolves both lines of
   credit and comes back as an honest miss.

   SO THE SHELL COMPOSES THE SENTENCE THE ENGINE ALREADY STAGES ON, and it takes
   the role from the BOOK rather than from the banker's words - which is E8's
   rule applied one step earlier, where it can also fix the verb. Everything it
   composes is a sentence a banker could have typed, it goes through the same
   parser every typed line goes through, and `stampRemovalRoles` still checks
   the delta that comes back.

   IT IS SILENT ABOUT ITSELF. A banker does not need to be told the room
   reworded his sentence to itself; what he needs to be told is the ROLE it
   read, and that is said on the chip and in the sentence above it.          */

/** The phrase, and where its object sits inside it. */
const OFF_PHRASE = /\b(?:take|takes|taking)\s+(.+?)\s+off(?:\s+of)?\s+/i;
const FROM_PHRASE = /\b(?:drop|drops|dropping|remove|removes|release|releases)\s+(.+?)\s+(?:from|off)\s+/i;

/** Words that name nothing in particular, so a hit on one proves nothing. */
const OBJECT_STOP = new Set(["the", "a", "an", "this", "that", "our", "their", "his", "her", "its"]);

const objectWords = (object: string): string[] =>
  object
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !OBJECT_STOP.has(w));

/** Does the object name an asset the deal already carries? Same reading the
 *  create grammar makes: the distinctive words of the asset's own label. */
function namesAsset(object: string, assets: BookAsset[]): boolean {
  const words = objectWords(object);
  if (!words.length) return false;
  return assets.some((a) => {
    const tokens = `${a.label} ${a.name ?? ""} ${a.kind ?? ""}`.toLowerCase();
    return words.some((w) => tokens.includes(w));
  });
}

/** Does the object name a party on the book? The book's spelling comes back,
 *  because the org has to find the row. */
function namesParty(object: string, book: Book): string | null {
  const lower = ` ${object.toLowerCase()} `;
  for (const p of book.parties) {
    if (lower.includes(` ${p.name.toLowerCase()} `) || samePartyName(object, p.name)) return p.name;
  }
  return null;
}

export type PartyRemoval =
  /** The line the parser is given instead. Same party, same facility, same op. */
  | { kind: "rewrite"; line: string }
  /** The object names a party AND something pledged, or a party holding two
   *  roles on the facility. Neither reading is safe to pick. */
  | { kind: "ask"; text: string; options: Array<{ label: string; say: string }> }
  /** The book carries the party, and not on that facility. Nothing is staged. */
  | { kind: "refusal"; text: string }
  | null;

export function readPartyRemoval(args: { line: string; book: Book; members: ElicitMember[] }): PartyRemoval {
  const { line, book, members } = args;
  const match = OFF_PHRASE.exec(line) ?? FROM_PHRASE.exec(line);
  if (!match) return null;
  const object = match[1].trim();
  if (!object) return null;

  const party = namesParty(object, book);
  if (!party) return null;

  const plain: PartyRemoval = { kind: "rewrite", line: line.replace(match[0], `remove ${party} from `) };

  if (namesAsset(object, book.assets)) {
    return {
      kind: "ask",
      text: `"${object}" names both a party on this deal and something the deal has pledged, and those are two different changes. Which did you mean?`,
      options: [
        { label: `${party}, the party`, say: plain.line },
        { label: "The pledged asset", say: `release ${object}` },
      ],
    };
  }

  /* WHICH FACILITY, AND THEREFORE WHICH ROW. The role is a fact about a name ON
     A FACILITY, so the facility has to resolve before the role can. Where it
     does not, the plain restatement goes through and the post-parse layer takes
     whatever the engine makes of it. */
  const scope = readScope(line, members);
  if (scope.ids.length !== 1) return plain;
  const member = members.find((m) => m.id === scope.ids[0]);
  if (!member) return plain;
  const named = member.shortName ?? member.label;

  const roles = rolesOnFacility(book, party, member.id);
  if (roles.length === 1) {
    return { kind: "rewrite", line: `on the ${named} remove the ${roles[0].toLowerCase()} ${party}` };
  }
  if (roles.length > 1) {
    return {
      kind: "ask",
      text: `${party} holds ${roles.length} roles on the ${member.label}: ${roles.join(" and ")}. A carry exclusion takes one row off the clone, so which of them comes off?`,
      options: roles.map((role) => ({ label: role, say: `on the ${named} remove the ${role.toLowerCase()} ${party}` })),
    };
  }

  const elsewhere = facilitiesFor(book, party);
  if (elsewhere.length) {
    return {
      kind: "refusal",
      text: `${party} is not on the ${member.label} today, so there is nothing there to take off. This book carries ${party} on ${elsewhere
        .map((f) => `${members.find((m) => m.id === f.loanId)?.label ?? f.loanId} as ${f.role}`)
        .join(", ")}.`,
    };
  }
  return plain;
}

/* ------------------------------------------------------ reading the plan back

   "WHAT IS ON THE PLAN" IS THE FOUNDER'S OWN CEREMONY LINE (step 14 of the
   everything-plan script) and the rail's own phrase list does not carry it, so
   it went to the desk and came back as a round trip the room did not need. The
   phrases the rail already knows stay where they are; these are the ones it
   misses, recognised here because the rail lives behind the fence.          */

const PLAN_PHRASES = [
  "what is on the plan",
  "what's on the plan",
  "whats on the plan",
  "what is on this plan",
  "read the plan back",
  "read me the plan",
  "show me the plan",
  "what have we got on the plan",
  "what is on the manifest",
];

export const readsThePlan = (line: string): boolean => {
  const lower = line.toLowerCase().trim();
  return PLAN_PHRASES.some((p) => lower.includes(p));
};

/* ------------------------------------------------- what a REMOVE line is about

   THE MANIFEST-ADDRESS HANDLER UN-STAGED THE BANKER'S OWN COVENANT (E1, the
   destructive one). "remove the Minimum Liquidity covenant from the 15M line of
   credit" matched the word "covenant" against a staged covenant on a DIFFERENT
   facility and quietly took it off the manifest. Nothing about that line named
   the entry it removed.

   SO A REMOVE IS ROUTED, AND THE ROUTING IS EXPLICIT:

     manifest  - the line names a STAGED entry by TITLE and by TARGET. Both, and
                 the target is what E1 failed on;
     fence     - the line names a BOOK item: an existing covenant on a facility
                 (detach is fenced) or an existing pledge (deletes are fenced).
                 Nothing is un-staged and the room refuses by name;
     null      - the parser's line. A party removal lives there, because an
                 involvement remove FILES as a carry exclusion.

   A BOOK ITEM BEATS A STAGED ENTRY UNLESS THE STAGED ENTRY IS THAT ITEM. A
   banker who names a covenant the book already carries is talking about the
   book, whatever else happens to be on the manifest.                        */

const REMOVAL_VERB = /\b(remove|removing|drop|dropping|delete|detach|unpledge|strike|take\s+off|take\s+out|scrap)\b/i;

/** The words that make a line a COVENANT line. A covenant type whose name
 *  happens to read like an asset ("Accounts Receivable") does not. */
const COVENANT_NOUN = /\b(covenants?|tests?|ratios?|thresholds?)\b/i;

/* THE WORDS NOBODY NAMED AN ENTRY WITH (E1, the third time, 2026-09-02).

   `entryWords` kept every token over two characters, so "the" counted. A
   truncated asset title carries "the" inside it and every line anyone types
   carries "the" too, which is how "remove the equipment pledge from the 8M
   equipment loan" un-staged a pledge on the $15M line: both sides of the
   address matched on that one word.

   The list is closed and generic on purpose. A product word, a covenant type
   and an asset word are never on it, so nothing a banker actually names an
   entry with is lost. */
const STOPWORD = new Set([
  "the", "and", "not", "for", "from", "with", "that", "this", "its", "was", "are",
  "off", "out", "onto", "into", "over", "under", "than", "then", "them", "they",
  "all", "any", "has", "have", "had", "been", "but", "per", "via", "upon",
]);

/** The words of a staged entry a banker can actually see on it. */
const entryWords = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9$.]+/)
    .filter((w) => w.length > 2 && !STOPWORD.has(w) && !REMOVAL_VERB.test(w));

/** The words a BOOK asset is known by, on the same bar `rank` uses. */
const assetTokens = (a: BookAsset): string[] =>
  [...new Set(`${a.label} ${a.kind ?? ""}`.toLowerCase().split(/[^a-z0-9]+/))].filter((t) => t.length > 3);

/** HOW MUCH OF A NAME THE LINE ACTUALLY ACCOUNTS FOR, between 0 and 1.
 *
 *  A staged entry titled "Kokomo plant expansion" is entirely named by a line
 *  carrying those three words. A book pledge whose paragraph merely CONTAINS
 *  them is not, and the raw count cannot tell the two apart because it is the
 *  same three words on both sides. */
const coverage = (tokens: string[], lower: string): number => {
  const uniq = [...new Set(tokens)];
  if (!uniq.length) return 0;
  return uniq.filter((t) => lower.includes(t)).length / uniq.length;
};

/** Does the line name this side of the entry at all? One distinctive word is
 *  enough on its own; what makes the rule safe is that BOTH sides are required. */
const names = (line: string, words: string[]): boolean => {
  const lower = line.toLowerCase();
  return words.some((w) => lower.includes(w));
};

/** The covenant name a line puts in front of the category word, title-cased the
 *  way the catalog holds one. Null where the line names no covenant at all. */
const COVENANT_NAMED = /\b(?:the|a|an)\s+([a-z0-9][a-z0-9 '\u2019./-]*?)\s+(?:covenants?|tests?|ratios?|thresholds?)\b/i;

export function covenantNamed(line: string): string | null {
  const hit = COVENANT_NAMED.exec(line);
  if (!hit) return null;
  const said = hit[1].trim();
  return said ? said.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : null;
}

/**
 * A COVENANT THE BOOK DOES NOT CARRY, ANSWERED FROM THE BOOK.
 *
 * "remove the leverage covenant from the 15M line of credit" named a test this
 * relationship does not hold at all, so nothing resolved and the line fell
 * through to the desk. The room is holding the covenants read: it can say the
 * relationship carries no such test and name what the facility does carry,
 * which is the answer the banker asked for.
 */
export function covenantGap(
  said: string | null,
  facility: { id: string; label: string } | null,
  book: Book,
): string {
  const held = facility ? book.covenants.filter((c) => c.loanIds.includes(facility.id)) : [];
  const level = book.covenants.filter((c) => !c.loanIds.length);
  const list = (types: string[]) =>
    types.length > 1 ? `${types.slice(0, -1).join(", ")} and ${types[types.length - 1]}` : types[0];
  return (
    `This relationship carries no ${said ? `${said} covenant` : "covenant by that name"}. ` +
    (facility
      ? held.length
        ? `The ${facility.label} carries ${list([...new Set(held.map((c) => c.type))])}. `
        : `The ${facility.label} carries no covenant on its own loan junction. `
      : "") +
    (level.length
      ? `The book holds ${list([...new Set(level.map((c) => c.type))])} at the relationship level, with no loan junction. `
      : "") +
    "Nothing has been staged and nothing has come off the manifest."
  );
}

export type RemoveRead =
  | { kind: "manifest"; entry: WorkroomDelta }
  | { kind: "ambiguous"; reason: string }
  | { kind: "fence"; scope: "covenant" | "pledge"; name: string }
  /** The facility carries pledges and the line settles none of them. */
  | { kind: "ask"; text: string; options: Array<{ label: string; say: string }> }
  /** A covenant line naming a test the book does not carry anywhere. */
  | { kind: "gap"; text: string }
  | null;

export function readRemove(
  line: string,
  entries: WorkroomDelta[],
  book: Book,
  members: ElicitMember[] = [],
): RemoveRead {
  if (!REMOVAL_VERB.test(line)) return null;
  const lower = line.toLowerCase();

  /* WHICH FACILITY THE LINE NAMES, read once by the room's own scope reader.
     It is the identity every side of this rule turns on: which staged entry the
     line can be addressing, which pledges are in the pool, and where the book
     is asked whether the junction is even there. */
  const scope = readScope(line, members);
  const facility = scope.ids.length === 1 ? (members.find((m) => m.id === scope.ids[0]) ?? null) : null;

  /* A BOOK COVENANT, NAMED BY THE CATALOG'S OWN NAME. Nothing looser: "covenant"
     on its own names no covenant, and a line that carries only the category word
     is talking about whatever is on the manifest. */
  const covenant =
    [...book.covenants]
      .sort((a, b) => b.type.length - a.type.length)
      .find((c) => lower.includes(c.type.toLowerCase())) ?? null;

  /* A BOOK ASSET. Its own COL autonumber names one row outright. Otherwise the
     line has to carry a COLLATERAL NOUN and enough of the asset's own label to
     settle it.

     HOW MUCH IS ENOUGH DEPENDS ON THE POOL. Across the whole book "equipment"
     sits inside half the package's vocabulary, so two distinctive words is the
     bar. Among the pledges of ONE NAMED FACILITY a single word settles it
     wherever it is unique there, which is what "remove the inventory pledge
     from the 15M line of credit" always meant: that line resolved nothing and
     fell through to the pre-arm handoff, while the same line with two words in
     front of it staged a real exclusion. */
  const collateralNoun = /\b(pledge|pledges|pledged|collateral|security|lien|liens)\b/i.test(line);
  const rank = (assets: BookAsset[], floor: number) =>
    assets
      .map((a) => {
        const tokens = [...new Set(`${a.label} ${a.kind ?? ""}`.toLowerCase().split(/[^a-z0-9]+/))].filter((t) => t.length > 3);
        return { asset: a, score: tokens.filter((t) => lower.includes(t)).length };
      })
      .filter((s) => s.score >= floor)
      .sort((a, b) => b.score - a.score);
  const pool = facility ? book.assets.filter((a) => a.loanIds.includes(facility.id)) : [];
  const here = facility ? rank(pool, 1) : [];
  const anywhere = rank(book.assets, 2);
  const byAutonumber = book.assets.find((a) => (a.name ? lower.includes(a.name.toLowerCase()) : false)) ?? null;
  /* A TIE ON THE FACILITY SETTLES NOTHING. Two of its pledges answering the same
     one word is a question, not a resolution, and the room asks it with that
     facility's own pledges as the answers rather than picking on sort order. */
  const tied = here.length > 1 && here[0].score === here[1].score;
  /* AND WHERE THE NAMED FACILITY CARRIES NOTHING LIKE IT, the whole book is
     read at the wider bar: the asset resolves, and the arm layer answers with
     the facilities it IS pledged to rather than with covenant words. */
  const settled = here.length && !tied ? here[0].asset : here.length ? null : (anywhere[0]?.asset ?? null);
  const asset = byAutonumber ?? (collateralNoun ? settled : null);

  /* THE NOUN THE LINE USES DECIDES BETWEEN THEM (N1/P4, founder 2026-09-02).
     This book carries a covenant TYPE called "Accounts Receivable" and an asset
     described as accounts receivable, so "remove the accounts receivable pledge
     from the 15M line of credit" resolved both and the covenant won on order
     alone - and the room answered a collateral line with the covenant-detach
     refusal. A line carrying a COLLATERAL noun and no covenant noun is a
     collateral line, whatever a covenant type happens to be called. */
  const covenantNoun = COVENANT_NOUN.test(line);
  const speaksCollateral = collateralNoun && !covenantNoun;

  /* THE TITLE, NEVER THE CATEGORY WORD (E1, found again by the wire-arms drive
     2026-09-02). `remove the leverage covenant from the 2.5M line of credit`
     named a covenant this book does not carry, so nothing resolved on the book
     side - and the bare word "covenant" matched the KIND of a staged covenant
     exclusion while "line of credit" matched its target, and the banker's own
     entry came off the manifest in silence. That is E1 exactly, reached through
     the category word rather than through the title.

     The category word is what E1 already said must not be enough. So the title
     side is matched on the TITLE alone.

     AND THE TARGET SIDE IS THE FACILITY'S IDENTITY, NOT ITS PROSE (E1 again,
     third time, 2026-09-02). The target side used to match the words of
     `${e.target} ${e.after}`, and every carry exclusion's `after` is the
     sentence "not carried onto the new version", so "the" alone satisfied it
     and any removal line reached any staged entry. `after` is off the address
     entirely now, and where the LINE NAMES A FACILITY the entry has to be ON
     that facility: the same id the delta was staged against, not a word that
     happens to appear in a label. A line naming a covenant the book carries
     against a facility that does not carry it therefore reaches no manifest
     entry at all, and goes on to the book, which says where it actually is. */
  const onFacility = (e: WorkroomDelta): boolean =>
    facility && e.member ? e.member === facility.id : names(line, entryWords(e.target));
  const named = entries
    .filter((e) => names(line, entryWords(e.title)) && onFacility(e))
    /* AND THE NOUN NARROWS THE MANIFEST TOO (N1, one layer deeper). Once a
       carry exclusion can be STAGED, one facility can hold an exclusion of the
       covenant called Accounts Receivable beside an exclusion of the asset
       described as accounts receivable, and the line's own noun is what tells
       them apart on the manifest exactly as it does on the book. */
    .filter((e) => (collateralNoun && !COVENANT_NOUN.test(line) ? e.group === "security" : true))
    .filter((e) => (COVENANT_NOUN.test(line) && !collateralNoun ? e.group === "covenants" : true));
  /* THE STAGED ENTRY MUST BE THE THING NAMED. Where the line names a book item,
     only a staged entry carrying that same item can be the one the banker means;
     everything else is the book's line and the fence answers it.

     THE SUBJECT IS THE NOUN'S, not the ordering's. A collateral line's subject is
     the ASSET even where a covenant type of the same name also resolved, which is
     the same rule `speaksCollateral` makes about the book. The asset is named by
     its first sentence, because that is what a staged entry is titled with. */
  const assetSubject = asset
    ? asset.name && lower.includes(asset.name.toLowerCase())
      ? asset.name
      : assetPhrase(asset.label)
    : null;
  const subject = speaksCollateral ? assetSubject : (covenant?.type ?? assetSubject);
  const claimed = subject
    ? named.filter((e) => `${e.title} ${e.after} ${e.before}`.toLowerCase().includes(subject.toLowerCase()))
    : named;

  /* ============ THE MANIFEST IS ADDRESSED BEFORE THE BOOK WHERE THE LINE
     ADDRESSES IT BETTER (E1, a fourth time, founder drive 2026-09-02).

     "remove the Kokomo plant expansion pledge from the construction loan" named
     a STAGED create-then-pledge titled exactly that. It did not un-stage it: the
     line's own words also sit inside the description of the BOOK pledge on the
     same facility ("First mortgage on the owner-occupied Fort Wayne
     manufacturing campus ... and the Kokomo plant (140,000 sq ft, under
     expansion)"), the asset resolved on those three words, and `subject` then
     narrowed the manifest to entries carrying the FIRST MORTGAGE's title. None
     did. So the room staged a carry exclusion of a booked first mortgage the
     banker never mentioned.

     WHAT SETTLES IT IS COVERAGE, not the raw count. Both sides matched the same
     three words, so counting them is a tie; the staged entry's title is
     ACCOUNTED FOR by the line and the book pledge's paragraph is not, and that
     is the difference a banker sees. A book pledge is excluded only where no
     staged entry is named better than it is. */
  if (!claimed.length && named.length) {
    const bookCover = asset ? coverage(assetTokens(asset), lower) : 0;
    const ranked = named
      .map((entry) => ({ entry, cover: coverage(entryWords(entry.title), lower) }))
      .sort((a, b) => b.cover - a.cover);
    if (ranked[0].cover > bookCover) {
      const tied = ranked.filter((r) => r.cover === ranked[0].cover);
      if (tied.length > 1) {
        return {
          kind: "ambiguous",
          reason: `That could be ${tied.map((t) => `${t.entry.title} on ${t.entry.target}`).join(" or ")}. Name one.`,
        };
      }
      return { kind: "manifest", entry: ranked[0].entry };
    }
  }

  if (claimed.length === 1) return { kind: "manifest", entry: claimed[0] };
  if (claimed.length > 1) {
    return {
      kind: "ambiguous",
      reason: `That could be ${claimed.map((e) => `${e.title} on ${e.target}`).join(" or ")}. Name one.`,
    };
  }
  if (asset && speaksCollateral) return { kind: "fence", scope: "pledge", name: asset.label };
  if (covenant) return { kind: "fence", scope: "covenant", name: covenant.type };
  if (asset) return { kind: "fence", scope: "pledge", name: asset.label };

  /* A FACILITY THAT CARRIES PLEDGES NEVER FALLS THROUGH TO THE HANDOFF. The
     pre-arm card said "no deployed write reaches it yet", which was true in
     August and is not true now, so a collateral line the room could not settle
     asks which pledge rather than answering with copy the arm has retired. */
  if (collateralNoun && facility && pool.length) {
    return {
      kind: "ask",
      text: `Which pledge should the new version leave off the ${facility.label}? It carries ${pool.length === 1 ? "one" : pool.length}.`,
      options: pool.map((a) => ({
        label: assetPhrase(a.label),
        say: `remove the ${a.name ?? assetPhrase(a.label)} pledge from the ${facility.shortName ?? facility.label}`,
      })),
    };
  }

  /* A COVENANT THE BOOK DOES NOT CARRY IS ANSWERED FROM THE BOOK, not sent to
     the desk. The room holds the covenants read; the desk holds nothing this
     question needs. */
  if (covenantNoun) return { kind: "gap", text: covenantGap(covenantNamed(line), facility, book) };
  return null;
}

/* ================== THE ORG REFUSED A COLLATERAL TYPE, AND IT SENT ITS OWN LIST
   (E6, founder drive 2026-09-02.)

   The room staged a net-new pledge typed "Real Estate", and the org answered:

     "Real Estate" matches 12 collateral types on this org: Real Estate-1-4
     Family, ... Real Estate-Warehouse. Name one of them exactly.

   The room relayed that sentence and offered nothing, so the banker's only way
   on was to type a name into a room that then mapped it straight back onto the
   word. The refusal CARRIES the answer set: it is parsed into chips, each of
   which re-types the entry the refusal is about. Nothing is re-staged and
   nothing is written; staging wrote nothing in the first place.               */

/** The org's sentence, and the list inside it. Keyed on the org's own wording so
 *  a refusal about anything else is left exactly as the org wrote it. */
const TYPE_REFUSAL =
  /"([^"]+)"\s+matches\s+\d+\s+collateral\s+types?\s+on\s+this\s+org:\s*([\s\S]+?)\.\s*Name\s+one\s+of\s+them\s+exactly/i;

export interface TypeRefusalRead {
  /** The manifest entry the org refused. */
  entry: WorkroomDelta;
  /** The org's own names, in the org's own order, de-duplicated: this org holds
   *  `Real Estate-Construction` on two records and a banker choosing between
   *  two identical chips is choosing nothing. */
  values: string[];
}

/**
 * THE ORG'S REFUSAL, READ AS AN ANSWER SET, or null.
 *
 * Null wherever the sentence is not that refusal, or wherever the manifest does
 * not carry exactly one entry typed with the word the org refused: a chip that
 * re-typed the wrong entry would be the E1 defect wearing the org's clothes.
 */
export function readTypeRefusal(message: string, entries: WorkroomDelta[]): TypeRefusalRead | null {
  const hit = TYPE_REFUSAL.exec(message ?? "");
  if (!hit) return null;
  const said = hit[1].trim().toLowerCase();
  const values = [...new Set(hit[2].split(",").map((v) => v.trim()).filter((v) => v.length > 2))];
  if (!values.length) return null;
  const named = entries.filter(
    (e) => (e.pledgeWire?.newCollateral?.collateralType ?? "").trim().toLowerCase() === said,
  );
  if (named.length !== 1) return null;
  return { entry: named[0], values };
}

/** The sentence the chip types back. Deterministic on both sides, and it names
 *  the entry so a manifest holding two net-new pledges stays unambiguous. */
export const typeChoiceSay = (entry: WorkroomDelta, value: string): string =>
  `set the collateral type on ${entry.title} to ${value}`;

const TYPE_CHOICE = /^\s*set\s+the\s+collateral\s+type\s+on\s+(.+?)\s+to\s+(.+?)\s*$/i;

/** The banker took one of those chips, or typed the sentence. Null otherwise. */
export function readTypeChoice(
  line: string,
  entries: WorkroomDelta[],
): { entry: WorkroomDelta; type: string } | null {
  const hit = TYPE_CHOICE.exec(line ?? "");
  if (!hit) return null;
  const title = hit[1].trim().toLowerCase();
  const type = hit[2].trim().replace(/[.]+$/, "");
  const entry = entries.find(
    (e) => e.title.trim().toLowerCase() === title && Boolean(e.pledgeWire?.newCollateral),
  );
  return entry && type ? { entry, type } : null;
}

/** The same entry, under the org's own type name. The only field that moves. */
export function retypeEntry(delta: WorkroomDelta, type: string): WorkroomDelta {
  if (!delta.pledgeWire?.newCollateral) return delta;
  return {
    ...delta,
    pledgeWire: {
      ...delta.pledgeWire,
      newCollateral: { ...delta.pledgeWire.newCollateral, collateralType: type },
    },
  };
}

/**
 * THE FENCE, REFUSED BY NAME, WITH THE ROUTE THAT EXISTS.
 *
 * A fence is not a gap (WORKROOM-BRAIN 2.11): the room names the constraint and
 * the route that does exist. The CONSTRAINT is quoted from the field catalog
 * rather than restated here, so a change behind the fence changes this refusal
 * too instead of leaving it stale.
 */
/** THE ASSET, SAID THE WAY A BANKER WOULD SAY IT. A collateral description runs
 *  to a paragraph in this org ("All present and future accounts receivable.
 *  Excludes invoices over 90 days past due, ..."), and a refusal titled with the
 *  paragraph is unreadable. The first sentence names the asset; the exclusions
 *  behind it are the credit agreement's business, not the refusal's.
 *
 *  THE TRUNCATION MARK IS ONE CHARACTER AND IT IS NOT A FULL STOP, AND THE CUT
 *  IS ON A WORD (2026-09-02). Three dots end a sentence to every reader that
 *  splits on one, and a title cut mid-word read "... Fort Wayne manufacturing
 *  c… on Construction" on the manifest, the read-back and the confirm.
 *  `clipTitle` is the one rule and every shortener in the room uses it. */
function assetPhrase(label: string): string {
  const first = label.split(/(?<=\.)\s+/)[0].replace(/\.$/, "").trim() || label;
  return clipTitle(first, 64);
}

export function fenceRefusal(scope: "covenant" | "pledge", name: string): WorkroomRefusal & { why: string } {
  const field = catalogField(scope === "covenant" ? "covenant.remove" : "collateral.release");
  const said = scope === "pledge" ? assetPhrase(name) : name;
  return {
    id: `fence:${scope}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    target: said,
    title: scope === "covenant" ? `Detach ${name}` : `Release ${said}`,
    why:
      scope === "covenant"
        ? `Taking ${name} off a facility is a covenant DETACH, and this room does not file one: every field on the loan-covenant junction is non-updateable, so detaching means deleting the row and no delete is filed on any object here. What takes it off the NEW version is a covenant CARRY EXCLUSION, and that arm rides the modification alone: a renewal files a new maturity and a repricing, and a new facility files the product, the amount, the term and the purpose, so neither of them can leave a junction behind. Run it as a modification and I will stage the exclusion. Here, ${name} stays on the facility and carries onto the clone with everything else. What the bank does have is a covenant compliance update, to Compliant, Waived or Exception, and it runs as its own credit action. Nothing has been staged and nothing has come off the manifest.`
        : `Taking ${said} off a facility is a COLLATERAL release, and this room files none. A pledge is never deleted on the booked loan: the security the facility carries today stays exactly where it is. What takes it off the NEW version is a pledge CARRY EXCLUSION, the same mechanism the borrowing structure already uses, where the parent keeps its pledge and the clone simply starts without it. That arm rides the modification and nothing else: a renewal files a new maturity and a repricing, and a new facility files the product, the amount, the term and the purpose, so neither of them can leave a pledge behind. Run it as a modification and I will stage the exclusion. What I can file here is a pledge ONTO a facility. Nothing has been staged and nothing has come off the manifest.`,
    reason: field?.gap ?? "No tool files this today.",
    detail: field?.closes ?? "",
  };
}

/* --------------------------------------------- the committed total, per entry

   "THAT TAKES THE PACKAGE FROM $49M TO $54M" AFTER A LEGAL-ENTITY ADD (E4c).
   The engines compose the confirm's closing sentence over the WHOLE manifest
   (modifyEngine.ts:1593, createEngine.ts:655), so a covenant, an involvement, a
   pledge, a fee or an exception confirmed after a commitment change inherits
   that change's arithmetic and reads as though it had moved the money itself. A
   demo that shows a wrong number is the one defect a banker cannot unsee.

   THE SENTENCE IS ABOUT THE ENTRY THE BANKER JUST CONFIRMED, so it is composed
   here from the shell's own figures: what the package read at before this entry
   landed, and what it reads at after. A non-monetary entry moves neither, and
   says so. The manifest-wide sentence on the filed summary is untouched - there
   it is the whole plan being described, and there it is right.              */

/** `(?:[^.]|\.\d)*` lets the decimal point inside a figure ("$54.5M") stay part
 *  of the sentence, so the match ends on the full stop that ends it rather than
 *  on the one inside the money. Same reading `FANOUT_ANNOUNCEMENT` makes. */
const PACKAGE_MOVED = /That takes the package from (?:[^.]|\.\d)*\.\s*/;
const PACKAGE_HELD = /The package total holds at (?:[^.]|\.\d)*\.\s*/;

export function committedSentence(args: {
  reply: string;
  delta: WorkroomDelta;
  /** The package's committed total before this entry landed, in dollars. */
  before: number;
}): string {
  const moved = (args.delta.committedDeltaMM ?? 0) * 1_000_000;
  const sentence = moved
    ? `That takes the package from ${fmtMoney(args.before)} to ${fmtMoney(args.before + moved)}. `
    : `The package total holds at ${fmtMoney(args.before)}. `;
  if (PACKAGE_MOVED.test(args.reply)) return args.reply.replace(PACKAGE_MOVED, sentence).trim();
  if (PACKAGE_HELD.test(args.reply)) return args.reply.replace(PACKAGE_HELD, sentence).trim();
  return args.reply;
}

/* ================================================ ONE VOICE PER MOMENT (A)

   THE BANKER READ THE ROOM TWICE (founder drive, 2026-09-02: "a lot of chat
   coming through, like two chats simultaneously"). Under a staged card the room
   put up its own paragraph - what a modification does to the package, what
   confirming stages, what rides as a handoff - and the model then said the same
   thing in its own words directly underneath it.

   THE CARD IS THE FACT AND THE SENTENCE IS THE JUDGEMENT, so where the model
   speaks the room's own explanation steps back to the ADDRESS: what is staged,
   on which facility, from what to what. The Before-you-confirm advisory is NOT
   part of that paragraph and never was: it renders on the chip block, it is a
   CHECK rather than a comment, and it stays exactly where it is.

   DEGRADE PARITY. Where the model is absent, declines or fails, the room's own
   paragraph is what the banker reads, byte for byte as today. The reduction is
   keyed on the remark, never on the feature being switched on.               */

/** THE ONE-LINE ADDRESS of what a card stages, or "" where the chips carry no
 *  staged delta (a refusal has its own reason on the chip). */
export function stagedAddress(deltas: WorkroomDelta[]): string {
  const said = deltas
    .filter((d) => d.title && d.target)
    .slice(0, 3)
    .map((d) => `${d.title} on ${d.target}: ${d.before} → ${d.after}.`);
  return said.join(" ");
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
