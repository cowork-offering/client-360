import type { WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   WHAT KIND OF THING THE BANKER JUST SAID.

   THE GUARD RUNS BEFORE THE PARSER, AND IT IS NOT A PARSER (founder, live run
   2026-09-01). Two transcripts made the case:

     "which borrowers have we already in the package?"
        -> the parser's refusal boilerplate, over a bundle holding all 21
           involvements. A question the room could answer, refused.

     "what covenants are against this Product Package"
        -> matched field="Product", value="Package" on the Line of Credit and
           STAGED A TERM CHANGE. Confidently wrong, which is worse.

   So: a question never becomes a delta. It is answered from the read the room
   already holds, or it is answered honestly with what the room can do. That is
   the whole of this module — it recognises SHAPES, it resolves no records and
   it stages nothing. The engines under `app/src/workroom/` are untouched by it.

   THE HUMAN GATE HELD THROUGH BOTH TRANSCRIPTS: nothing could be written
   without Confirm. What failed was the intelligence, and these are the two
   deterministic guards that stand in front of it until the agent layer lands.
   ============================================================================= */

/* ------------------------------------------------------------ question shape */

/** The words that open a question. `can` is in the founder's own list. */
const INTERROGATIVE_OPENERS =
  /^(what|which|who|whom|whose|when|where|why|how|is|are|was|were|do|does|did|can|could|should|would|will|have|has|had|any|anything)\b/i;

/** The same words, wherever they sit, for the value bounds below. A staged
 *  VALUE containing "what" is a sentence someone sliced, not a value. */
const INTERROGATIVE_ANYWHERE =
  /\b(what|which|who|whom|whose|when|where|why|how|do i|do we|does|did|can i|can we|should|would)\b/i;

/**
 * IS THIS A QUESTION.
 *
 * A leading interrogative, or a question mark anywhere. Deliberately blunt:
 * the cost of treating an instruction as a question is one clarifying
 * exchange, and the cost of treating a question as an instruction is a staged
 * delta nobody asked for.
 *
 * KNOWN CONSEQUENCE, accepted on the founder's own wording: "can you increase
 * the Line of Credit to $20M" opens on `can` and is therefore answered rather
 * than staged. The banker's own phrasing without the courtesy ("increase the
 * Line of Credit to $20M") stages exactly as it always has.
 */
export function isQuestion(text: string): boolean {
  const line = text.trim();
  if (!line) return false;
  return line.includes("?") || INTERROGATIVE_OPENERS.test(line);
}

/* -------------------------------------------------------------- read intents */

export type ReadTopic = "structure" | "covenants" | "collateral" | "fees" | "facilities";

/** The openers that make a line a READ rather than an instruction. Without one
 *  of these "add a covenant to the revolver" would be read as a request to LIST
 *  the covenants, which is the mirror image of the bug this module exists for. */
const READ_OPENER =
  /\b(which|who|whose|what|list|show|tell me|do we|do i|have we|have i|are there|is there|how many|what's|whats)\b/i;

/** One topic per line, tested in the order a collision should resolve. A line
 *  naming two topics is answered on the first one named here rather than on
 *  whichever regex happened to run first. */
const TOPICS: Array<[ReadTopic, RegExp]> = [
  ["structure", /\b(borrowers?|guarantors?|entit(?:y|ies)|involvements?|parties|obligors?|co-?borrowers?|structure|who is on|who's on)\b/i],
  ["covenants", /\b(covenants?|tests?|financial covenants?)\b/i],
  ["collateral", /\b(collateral|security|pledges?|pledged)\b/i],
  ["fees", /\b(fees?)\b/i],
  ["facilities", /\b(facilit(?:y|ies)|members?|loans?|lines?\s+of\s+credit)\b/i],
];

/**
 * THE TOPIC A READ QUESTION IS ABOUT, or null.
 *
 * Null is not a failure and it is not an apology: it means this line is not one
 * of the reads the room can answer deterministically, and the caller then falls
 * through to `isQuestion` (an honest account of what the room CAN do) or to the
 * parser (an instruction).
 */
export function readTopic(text: string): ReadTopic | null {
  const line = text.trim();
  if (!line || !READ_OPENER.test(line)) return null;
  for (const [topic, re] of TOPICS) if (re.test(line)) return topic;
  return null;
}

/* --------------------------------------------------------------- value bounds

   THE FIELD WAVE TOOK EVERYTHING AFTER THE LABEL (founder repro 11b). The
   longer covenant question staged field="Product" with a value of the entire
   fifteen-word tail of the sentence, question mark included. The wave has no
   shape validation of its own, so the room refuses to SHOW a delta whose value
   is not a value — the same judgement a banker makes reading the chip, applied
   before the chip is drawn.

   Scoped to the FIELD WAVE alone (`fieldWire`). A commitment, a rate and a
   maturity are parsed into typed values by their own waves and carry their own
   validation; second-guessing those here would be a rule written twice.       */

/** Past this a "value" is prose. Five words is a generous picklist label. */
const VALUE_WORD_CAP = 5;

/** A line that ASSIGNS. Two colocated nouns are not an instruction, however
 *  confidently a label matched inside them. */
const ASSIGNMENT = /\b(set|sets|change|changes|changed|make|makes|made|move|moves|update|updates|switch|switches|to)\b/i;

/**
 * Why this staged value must not be offered, or null when it is sound.
 *
 * The sentence comes back rather than a boolean because the room says it out
 * loud: a delta the room silently dropped would be the same silence the founder
 * hit from the other direction.
 */
export function unsoundFieldChange(line: string, delta: WorkroomDelta): string | null {
  if (!delta.fieldWire) return null;
  const value = String(delta.fieldWire.display ?? delta.after ?? "").trim();
  if (!value) return "the line did not carry a new value for it";
  if (value.includes("?")) return "what it read as the new value is a question, not a value";
  if (INTERROGATIVE_ANYWHERE.test(value)) return "what it read as the new value is part of a question, not a value";
  if (value.split(/\s+/).length > VALUE_WORD_CAP) return "what it read as the new value is a sentence, not a value";
  if (!ASSIGNMENT.test(line)) return "the line names the field but never says what to change it to";
  return null;
}

/* ------------------------------------------------------------- banker copy

   THE ROOM TALKS LIKE A BANKER (founder, 2026-09-01). The engines compose
   their sentences in the vocabulary of their own machinery — what they "hold",
   what they "file", what "rides the plan" — which is precise for whoever wrote
   the wave and unreadable for whoever is being asked to approve a credit
   action. This rewrites those phrases on the way to the glass and nothing else.

   IT IS A PRESENTATION FILTER AND IT STAYS ONE. Every engine string is
   unchanged (`app/src/workroom/` is untouched), the engine tests still assert
   the engine's own words, and a phrase not in this table is rendered verbatim.
   The moment a phrase reaches the banker in the engine's own good words, its
   row here can go.                                                          */

const PHRASES: Array<[RegExp, string]> = [
  [/\bit names no member I hold and no term I file\b/gi, "it names no facility on this package and no term I can change"],
  [/\bit names no member I hold and no field I file\b/gi, "it names no facility on this package and no field I can change"],
  [/\bno member I hold\b/gi, "no facility on this package"],
  [/\bI could not map that onto this package\b/gi, "I could not match that to anything on this package"],
  [/\brides the plan as a handoff\b/gi, "goes onto the plan for you to carry out"],
  [/\brides the plan\b/gi, "goes onto the plan"],
  [/\brecorded rather than filed\b/gi, "recorded for the file rather than written to the org"],
  [/\btoday's value is not staged in this read\b/gi, "this read does not carry today's value"],
  [/\bnot staged in this read\b/gi, "not carried in this read"],
  [/\bnot staged in this view\b/gi, "not carried in this view"],
];

/** The same sentence, in the words a credit officer uses. */
export function bankerly(text: string): string {
  let out = text;
  for (const [re, to] of PHRASES) out = out.replace(re, to);
  return out;
}

/* ------------------------------------------------------- the honest fallback */

/**
 * WHAT THE ROOM CAN DO, said plainly.
 *
 * The answer to a question the room cannot read from the package. It names the
 * work in credit language with a worked example, because "I could not parse
 * that" tells a banker nothing about what would have worked.
 */
export function whatICanDo(relationship: string): string {
  return (
    `I cannot answer that one from what I hold on ${relationship}. ` +
    "What I can do is change this package: a commitment, a rate, a maturity or a term on one of the facilities above, " +
    "a covenant, a fee, collateral or who is on the deal. " +
    'Say it the way you would write it, for example "take the Line of Credit to $19M" or "move the Seasonal maturity to 2027-06-30", ' +
    "and I will put it up as a change for you to confirm."
  );
}
