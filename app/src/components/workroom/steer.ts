import type { ElicitMember } from "./elicit";
import { readScope } from "./elicit";

/* =============================================================================
   NAVIGATIONAL INTENT IS ANSWERED WITH THE CHOICE.

   "let's modify a new loan" and "a different facility" are not amendments and
   they are not questions. They are the banker saying WHERE they want to work,
   and the room used to answer both with the parser's refusal boilerplate: "I
   could not map that onto this package". A capability lecture is the wrong
   answer to a line that was already perfectly clear.

   THE ORDER MATTERS, AND IT IS THE WHOLE POINT OF THIS MODULE. "modify a new
   loan" contains "new loan", which the route reader matches as a request to
   STRUCTURE one, so the room would restart in the new-facility room over a line
   that asked to change an existing facility. The verb settles it: work-on verbs
   steer inside this room, origination verbs open the other one.

   NOTHING HERE RESOLVES A RECORD OR STAGES ANYTHING. It reads intent and hands
   back the choice; the members come from the room's own strip.
   ============================================================================= */

/** Verbs that mean "work on something already booked". */
const WORK_VERB = /\b(modify|modifying|change|changing|amend|work\s+on|switch\s+to|look\s+at|go\s+to|move\s+to|pick|open|take|do)\b/i;

/** Verbs that mean "bring a facility into existence". */
const ORIGINATE_VERB = /\b(add|adding|structure|structuring|originate|originating|set\s+up|book|write)\b/i;

/** "a different facility", "another loan", "a new loan", "one of the others". */
const ANOTHER =
  /\b(different|another|other|others|a\s+new|the\s+next)\b[^.]{0,24}\b(facilit(?:y|ies)|loans?|lines?|members?|one|ones)\b|\b(facilit(?:y|ies)|loans?|lines?|members?)\b[^.]{0,16}\b(instead|as\s+well)\b/i;

/** The facility nouns a navigational line lands on. */
const FACILITY_NOUN = /\b(facilit(?:y|ies)|loans?|lines?|revolver|members?)\b/i;

/** THE NOUN OF A CREATE, WHICH IS NOT A DESTINATION. "add another covenant to
 *  all of the loans" carries "another" and "loans" and is not navigation at
 *  all: it is a create whose first question happens to be where it lands. The
 *  create grammar runs first in the room, and this is the second guard. */
const CREATE_NOUN = /\b(covenants?|collateral|security|pledges?|assets?|fees?|exceptions?|guarantors?|borrowers?|tests?)\b/i;

export type Steer =
  | {
      kind: "pick-facility";
      text: string;
      options: Array<{ label: string; say: string }>;
    }
  | { kind: "new-facility"; text: string };

/**
 * THE NAVIGATION THIS LINE ASKS FOR, or null.
 *
 * Null is the common case: the line is about the package rather than about
 * where to stand in it, and every existing lane takes it unchanged.
 */
export function readSteer(line: string, members: ElicitMember[]): Steer | null {
  const text = line.trim();
  if (!text || !ANOTHER.test(text)) return null;
  if (CREATE_NOUN.test(text)) return null;

  /* AN ORIGINATION VERB OPENS THE OTHER ROOM. "add a new loan" is a new
     facility, and the room says so and hands over rather than steering. */
  if (ORIGINATE_VERB.test(text) && /\ba\s+new\b|\banother\b/i.test(text) && !WORK_VERB.test(text)) {
    return {
      kind: "new-facility",
      text: "A new facility is a different piece of work to changing one that is booked, and it opens its own room.",
    };
  }

  /* A WORK VERB, OR NO VERB AT ALL, STEERS INSIDE THIS ROOM. "a different
     facility" on its own is the banker pointing, and it is answered with the
     list of what they can point AT. */
  if (!WORK_VERB.test(text) && !FACILITY_NOUN.test(text)) return null;
  if (!members.length) return null;
  return {
    kind: "pick-facility",
    text: `${members.length === 1 ? "One facility" : `${members.length} facilities`} on this package. Which one?`,
    options: members.map((m) => ({ label: m.label, say: `the ${m.orgName ?? m.label}` })),
  };
}

/**
 * THE MEMBER A BARE LINE NAMES, or null.
 *
 * The answer to the question above, and to a banker who simply typed the
 * facility's name. Deliberately narrow: a line carrying an instruction is an
 * instruction about that member, not a request to stand on it, and only a line
 * that says nothing else is read as a pick.
 */
export function bareMemberPick(line: string, members: ElicitMember[]): string | null {
  const text = line.trim();
  if (!text || text.split(/\s+/).length > 14) return null;
  if (
    /\b(add|pledge|increase|decrease|reduce|raise|lower|take|extend|shorten|change|set|move|bump|waive|drop|remove|renew|reprice|price|make|put|stage|file)\b/i.test(
      text,
    )
  ) {
    return null;
  }
  const scope = readScope(text, members);
  return scope.ids.length === 1 ? scope.ids[0] : null;
}
