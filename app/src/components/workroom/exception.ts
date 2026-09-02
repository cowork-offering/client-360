import type { ElicitMember } from "./elicit";
import { readScope } from "./elicit";

/* =============================================================================
   A POLICY EXCEPTION CREATE IS THE FAST LANE'S (E7, founder drive 2026-09-02).

   "log a policy exception for leverage above policy approved by credit
   committee" went to the BRAIN lane, which read it as a QUESTION about the
   exception this relationship already holds (CRE-AR-01, the construction
   advance rate) and closed on "proceed to draft" with nothing staged. Then the
   re-typed create landed on the manifest as:

     Draft the exception; committee approved on Equipment ($8M) ... logged as waived

   Three things wrong in one entry: the banker's own VERB PHRASE became the
   exception's NAME, it landed on the FOCUSED facility rather than the one the
   line named, and a status nobody chose was filed as a credit decision.

   WHY IT REACHED THE DESK AT ALL. `provablyClean` requires the parser to come
   back with DELTAS, and an exception create legitimately comes back with a
   QUESTION: the status is a credit judgement the org defaults to Unmitigated
   and the fenced reader refuses to take that default. A question is not a
   failed parse, and sending one to the desk turns the room's own elicitation
   into a conversation with a model.

   SO THE ROOM ELICITS IT ITSELF, in front of the parser, exactly as the create
   grammar does for a covenant or a pledge:

     THE NAME is what is out of policy, in the vocabulary of the thing that is
       out of policy. Never the banker's verb, and never the aside about who
       signed it off.
     THE NOTE is that aside. "approved by credit committee" says WHO decided,
       which is a mitigant when the status is Mitigated and is never a name.
     THE STATUS is asked with the org's own three, unless the line states one.
     THE FACILITY is the room's own scope reader's answer, and it is put in
       front of the composed sentence by the org's own loan name so the parser
       resolves ONE member rather than falling back on whatever was focused.

   NOTHING HERE IS A NEW WRITE PATH. What it composes is a sentence the fenced
   parser already files, and `app/src/workroom/` is untouched by all of it.
   ============================================================================= */

export type ExceptionStatusWord = "Waived" | "Mitigated" | "Unmitigated";

export interface ExceptionOpen {
  /** The exception's own name: the type or the reason that is out of policy. */
  name: string;
  /** The banker's aside about who decided. A mitigant, never a name. */
  note?: string;
  /** The status the line stated, where it stated one. */
  status?: ExceptionStatusWord;
  /** The facility the line named, where it named exactly one. */
  memberId?: string;
}

/** The verbs a banker opens an exception create on. A list, never a pattern:
 *  the cost of reading a question as a create is a staged credit record. */
const CREATE_VERB =
  /\b(log|logged|logging|record|recording|raise|raising|grant|note|add|register|file|draft|document|put)\b/i;

/** The noun that makes it an exception at all. */
const EXCEPTION_NOUN = /\b(policy\s+exceptions?|exceptions?|waivers?)\b/i;

/** A line about the exceptions already on file rather than a new one. */
const READ_SHAPE = /\b(what|which|who|list|show|tell me|any|do we|have we|are there|is there|how many)\b/i;

/** The status words, in the org's own vocabulary. `unmitigated` is tested
 *  first for readability; the word boundary already keeps `mitigated` out of
 *  it. */
function statusIn(line: string): ExceptionStatusWord | undefined {
  const lower = line.toLowerCase();
  if (/\bunmitigated\b/.test(lower)) return "Unmitigated";
  if (/\b(?:waived|waive it|waive this|as a waiver)\b/.test(lower)) return "Waived";
  if (/\bmitigat(?:ed|ing|ion|ions|ant|ants)\b/.test(lower)) return "Mitigated";
  return undefined;
}

/** WHO DECIDED, AND IT IS NOT THE NAME. "approved by credit committee" is the
 *  aside a banker adds to say the decision has already been taken; read as the
 *  record's name it puts a sentence about governance where the credit reason
 *  belongs. */
const APPROVAL_NOTE =
  /[,;]?\s*(?:and\s+|as\s+|which\s+was\s+|that\s+was\s+)?\b(approved|signed\s+off|agreed|cleared|sanctioned|authorised|authorized|ratified|blessed)\s+by\s+(.+)$/i;

/** The same aside, written the way a mitigation reason reads. */
function mitigantOf(note: string): string {
  const hit = APPROVAL_NOTE.exec(` ${note}`);
  if (hit) return `${hit[2].trim().replace(/[.,;:]+$/, "")} approval`;
  return note.trim().replace(/[.,;:]+$/, "");
}

/** The mitigant clause, where the line already carries one. */
const MITIGATION_LEAD = /\bmitigat(?:ed|ing|ion|ions|ant|ants)\b\s*(?:by|with|are|is|:)?\s*/i;

/** Everything that is a field of its own, taken off the name. */
function nameOf(text: string): { name: string; note?: string } {
  let rest = ` ${text} `;
  let note: string | undefined;

  const mitigation = MITIGATION_LEAD.exec(rest);
  if (mitigation) {
    const said = rest.slice(mitigation.index + mitigation[0].length).trim().replace(/[.,;:]+$/, "");
    if (said) note = said;
    rest = rest.slice(0, mitigation.index);
  }
  rest = rest.replace(/[,;]?\s*(?:and\s+)?\b(?:status\s*(?:is\s*|[:=]\s*)?)?(?:unmitigated|waived|as a waiver)\b/gi, " ");

  const approval = APPROVAL_NOTE.exec(rest);
  if (approval) {
    if (!note) note = approval[0].replace(/^[,;\s]+/, "").trim();
    rest = rest.slice(0, approval.index);
  }

  const name = rest
    .replace(/^\s*(?:please\s+)?(?:let'?s\s+)?(?:log|logged|logging|record|recording|raise|raising|grant|note|add|register|file|draft|document|put)\s+/i, " ")
    .replace(/^\s*(?:an?|the)\s+/i, " ")
    .replace(/^\s*(?:policy\s+)?(?:exception|waiver)s?\b/i, " ")
    .replace(/^\s*(?:to|against)\s+policy\b/i, " ")
    .replace(/^\s*[:\-,]\s*/, " ")
    .replace(/^\s*(?:for|on|about|regarding|covering|because\s+of)\b/i, " ")
    .replace(/^\s*(?:an?|the)\s+/i, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\s.,;:]+$/, "");

  return { name: name.length > 2 ? name[0].toUpperCase() + name.slice(1) : "", note };
}

/** THE FACILITY, TAKEN OUT BEFORE THE NAME IS READ. A loan's own words sitting
 *  inside the name is how "Draft the exception; committee approved on Equipment
 *  ($8M)" happened. */
function withoutFacility(line: string, members: ElicitMember[]): string {
  let rest = ` ${line} `;
  const names = members
    .flatMap((m) => [m.orgName, m.shortName, m.label, m.key])
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    rest = rest.replace(
      new RegExp(
        `\\b(?:on|onto|to|against|for|under)\\s+(?:the\\s+|this\\s+|our\\s+)?(?:[$\\d][\\w.,$]*\\s+)?${name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?:\\s+(?:loan|line|facility|note|revolver))?\\b`,
        "gi",
      ),
      " ",
    );
  }
  return rest
    .replace(/\b(?:on|onto|against|under)\s+(?:the|this|our)\s+[^,:;]*?\b(?:loans?|lines?\s+of\s+credit|lines?|facilit(?:y|ies)|revolvers?|notes?)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * THE EXCEPTION CREATE THIS LINE OPENS, or null.
 *
 * Null is the common case and it is not a failure: the line is not an exception
 * create and every lane the room already has takes it exactly as it always did.
 */
export function readExceptionOpen(
  line: string,
  members: ElicitMember[],
  focused?: ElicitMember | null,
): ExceptionOpen | null {
  const text = (line ?? "").trim();
  if (!text) return null;
  if (!EXCEPTION_NOUN.test(text) || !CREATE_VERB.test(text)) return null;
  if (READ_SHAPE.test(text) || text.includes("?")) return null;

  const scope = readScope(text, members);
  const memberId = scope.ids.length === 1 ? scope.ids[0] : (focused?.id ?? undefined);

  const { name, note } = nameOf(withoutFacility(text, members));
  if (!name) return null;
  const status = statusIn(text);
  return { name, note, status, memberId };
}

/** The facility, by the org's own loan name, which resolves ONE member inside
 *  the parser rather than relying on a filter afterwards. */
const targetOf = (m: ElicitMember): string => m.orgName ?? m.label;

/**
 * THE SENTENCE THE PARSER ALREADY FILES.
 *
 * ONE CLAUSE, DELIBERATELY. A comma makes it two to `clauseCount`, and a
 * two-clause line is the brain's by contract, which is the very trip this whole
 * module exists to stop.
 */
export function exceptionSay(open: ExceptionOpen, member: ElicitMember): string {
  const mitigant = open.status === "Mitigated" ? mitigantOf(open.note ?? "") : "";
  const tail =
    open.status === "Mitigated"
      ? // NO NOTE IS NOT AN INVENTED MITIGANT. The sentence says mitigated and
        // the fenced reader asks what mitigates it, which is the right question
        // and is answered in this same lane.
        mitigant
        ? ` mitigated by ${mitigant}`
        : " mitigated"
      : open.status
        ? ` ${open.status.toLowerCase()}`
        : /* NO STATUS YET, SO THE NOTE HAS TO SURVIVE THE ROUND TRIP. The
             facility chip composes a sentence with no status on it, and the
             room reads that sentence again on the next turn: a note dropped
             here is a mitigant the banker typed once and is asked for twice.
             It travels in the banker's OWN words, which is the phrasing
             `nameOf` already reads back as a note. */
          open.note
          ? ` ${open.note}`
          : "";
  return `on the ${targetOf(member)} log a policy exception for ${open.name}${tail}`;
}

export interface ExceptionAsk {
  text: string;
  options: Array<{ label: string; say: string }>;
}

/**
 * WHAT THE CREATE STILL NEEDS, or null where it needs nothing.
 *
 * One question at a time, and every chip types back a COMPLETE sentence, so no
 * state is held between turns: the room reads the whole thing again and gets
 * the same answer.
 */
export function exceptionAsk(open: ExceptionOpen, members: ElicitMember[]): ExceptionAsk | null {
  const member = open.memberId ? (members.find((m) => m.id === open.memberId) ?? null) : null;

  if (!member) {
    return {
      text: `Which facility is "${open.name}" out of policy on? An exception is anchored on one loan, and I will not pick between them for you.`,
      options: members.map((m) => ({
        label: m.label,
        say: exceptionSay({ ...open, memberId: m.id }, m),
      })),
    };
  }

  if (!open.status) {
    return {
      text:
        `Is "${open.name}" waived, mitigated, or standing unmitigated on the ${member.label}? ` +
        "The org defaults a new exception to Unmitigated, which reads as a decision rather than as nobody having said, so I will not take that default for you." +
        (open.note ? ` Your own note, "${open.note}", travels as the mitigant if you say mitigated.` : ""),
      options: (["Waived", "Mitigated", "Unmitigated"] as ExceptionStatusWord[]).map((status) => ({
        label: status,
        say: exceptionSay({ ...open, status }, member),
      })),
    };
  }

  return null;
}
