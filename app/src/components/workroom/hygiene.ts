/* =============================================================================
   THREAD HYGIENE - the deterministic cuts, made at render.

   FOUNDER, 2026-09-03: "it reads like double chats". The room works; it says
   too much, and it says several of the same things twice. Every sentence this
   module touches is composed BEHIND THE ENGINE FENCE and reaches the glass
   through the shell's own rendering, so the cut is made HERE, on the way to the
   bubble, and `app/src/workroom/` is not opened.

   NOTHING HERE INVENTS A SENTENCE. Each rule either drops a clause the room
   already said, shortens one to the fact it carries, or holds one back until it
   is the first time the banker could need it. A cut that changed the MEANING of
   what the room claims would be a different kind of change and does not belong
   in a hygiene pass.

   THE RULES, in the founder's own numbering:

     0  the focus prompt is ONE line, and the capability list is said once per
        room open, the first time a facility is focused;
     a  the parser preamble only where a qualifier actually narrowed;
     b  the version paragraph once per plan, one sentence, under the first card;
     c  the pricing reason once per facility, not on each of its two questions;
     d  the "anything else" tail drops while a further line is already queued;
     e  where the model does not speak, the room's own sentence caps at two;
     f  no sentence restates a figure the card beside it already carries.
   ============================================================================= */

import type { WorkroomDelta } from "../../workroom/types";

/* ------------------------------------------------------- 0. the focus prompt

   Clicking a facility chip put TWO bubbles on the glass at once: the engine's
   deterministic focus prompt AND the model narrating the whole plan under it.
   The model's half is silenced in `narrate.ts` (a question gets no remark, and
   a selection is routine); this half is the deterministic one.

   The engine writes:

     "Line of Credit: $15.0MM committed, $9.20MM drawn, matures Mar 15, 2027.
      What should change on it? Commitment, rate, maturity, term, covenants,
      entities, fees, collateral and policy exceptions all file on the clone;
      pricing I stage and hand off with the reason."

   THE COMMITMENT IS THE FACILITY'S NAME, not a third figure in a list: the
   strip, the rail and every card in this room already print it in parentheses,
   so the line reads as one identity and two facts rather than as three facts
   with a label in front. */

/** The capability list. Byte-identical to the engine's own sentence, because it
 *  is matched against the engine's output rather than composed here. */
export const CAPABILITY_LINE =
  "Commitment, rate, maturity, term, covenants, entities, fees, collateral and policy exceptions all file on the clone; pricing I stage and hand off with the reason.";

/** `Label: $X committed, <rest>. What should change on it?` The commitment is
 *  the only clause lifted; a prompt that carries no commitment is left alone. */
const FOCUS_HEAD = /^([^:]+): ([^,]+) committed, (.+?)\. What should change on it\?/;

export interface FocusPrompt {
  /** The line as it should read on the glass. */
  text: string;
  /** TRUE where the capability list was included, so the room can record that
   *  it has now been said and never say it again this open. */
  saidCapabilities: boolean;
}

/**
 * THE FOCUS PROMPT, AS ONE LINE.
 *
 * @param capabilitiesSaid has this room already shown the capability list?
 */
export function focusPrompt(reply: string, capabilitiesSaid: boolean): FocusPrompt {
  const withoutList = reply.replace(CAPABILITY_LINE, "").replace(/\s{2,}/g, " ").trim();
  const carriedList = withoutList !== reply.trim();
  const one = withoutList.replace(FOCUS_HEAD, (_m, label, committed, rest) => `${label} (${committed}): ${rest}. What should change on it?`);
  // The list rides the FIRST focus of a room open and no later one. A prompt
  // that never carried it cannot start carrying it here.
  const show = carriedList && !capabilitiesSaid;
  return { text: show ? `${one} ${CAPABILITY_LINE}` : one, saidCapabilities: show };
}

/* ------------------------------------------------ a. the parser preamble

   "Read that as the $15M Line of Credit. The other facility that line could
   have named is left alone."

   The preamble is worth its words exactly when the room NARROWED: two members
   were on the table, the line named one, and the banker is entitled to read
   which one the room took and that the sibling is untouched. Anywhere else it
   is the room narrating its own plumbing. */

export interface QualifierRead {
  keep: WorkroomDelta[];
  dropped: WorkroomDelta[];
  said: string | null;
}

/** The preamble, or nothing. Nothing unless deltas were actually dropped from a
 *  set that reached more than one member. */
export function preambleFor(read: QualifierRead): string | null {
  if (!read.said) return null;
  if (!read.dropped.length || !read.keep.length) return null;
  return read.said;
}

/* ------------------------------------------ b. the version paragraph, once

   "Confirming stages the next VERSION of the package: every eligible member
   rolls into it with its covenants, collateral and borrowers, and the clone of
   X carries the new terms. The booked facilities and the current package stay
   exactly as they are until the bank's own approval books the new version."

   Two sentences of methodology under EVERY card. It is the fact that makes a
   confirm safe to press, so it is not dropped - it is said ONCE per plan, in
   one sentence, under the first card. */

const VERSION_PARAGRAPH =
  /Confirming stages the next VERSION of the package:.*?until the bank's own approval books the new version\./s;

/** The one sentence that survives. The methodology is the room's; the FACT the
 *  banker needs is that nothing booked moves until the bank approves. */
export const VERSION_LINE =
  "Confirming stages the next version of the package: nothing booked moves until the bank's own approval books it.";

/**
 * Cut the version paragraph out of an engine reply.
 *
 * @param first is this the first card of this plan?
 */
export function cutVersionParagraph(reply: string, first: boolean): string {
  if (!VERSION_PARAGRAPH.test(reply)) return reply;
  return reply.replace(VERSION_PARAGRAPH, first ? VERSION_LINE : "").replace(/\s{2,}/g, " ").trim();
}

/** Did this reply carry the paragraph? The room records that it has been said
 *  only where it actually went out. */
export const carriesVersionParagraph = (reply: string): boolean => VERSION_PARAGRAPH.test(reply);

/* --------------------------------------------- b2. the clone count, on the card

   "1 of these goes on the clone." The cards are on the glass, side by side, and
   the banker can count them without help. The sentence exists for the case
   where nothing was drawn - a refusal, a handoff - and there it earns its
   words. Beside a card it is the room reading its own card out loud. */

const CLONE_COUNT = /\b\d+ of these (?:goes|go) on the clone\.\s*/g;

/** Drop the clone count where cards are on the glass to be counted. */
export function cutCloneCount(text: string, cards: number): string {
  if (cards < 1) return text;
  return text.replace(CLONE_COUNT, "").replace(/\s{2,}/g, " ").trim();
}

/* ------------------------------------------- c. the pricing reason, once

   nCino wants four fields and the room asks for two of them, one at a time. The
   REASON is the same reason both times, and reading it twice on one facility is
   the room explaining itself to somebody who has just proved they understood. */

/** Strip the pricing reason from a line that already said it on this facility. */
export function cutPricingWhy(text: string, why: string, alreadySaid: boolean): string {
  if (!alreadySaid) return text;
  return text.replace(why, "").replace(/\s{2,}/g, " ").trim();
}

/* -------------------------------------------------- d. the "anything else"

   "Anything else on this facility, or shall I stage it?" is the room keeping
   the conversation open. With a fed line already queued behind it, or another
   question of the room's own about to land, it is the room asking a question it
   is about to answer itself. */

/** The tail, or nothing, given whether the room is holding a further line. */
export function tail(nextMove: string, queued: boolean): string {
  return queued ? "" : nextMove;
}

/** Drop the tail from a sentence that has already been composed with it. */
export function cutTail(text: string, nextMove: string, queued: boolean): string {
  if (!queued || !nextMove) return text;
  return text.replace(nextMove, "").replace(/\s{2,}/g, " ").trim();
}

/* ------------------------------------------------------ e. the two-sentence cap

   Where the model speaks, the room's own paragraph steps back to the address
   (`speaksFor`, already built). Where it does NOT speak - a decline, a rate
   limit, the feature off - the deterministic paragraph is all there is, and it
   is allowed to be a paragraph. Two sentences of it. */

export const ROOM_SENTENCE_CAP = 2;

/** Split on sentence ends that are followed by a space and a capital, so
 *  "$15.0MM" and "Mar 15, 2027" are never read as two sentences. */
const SENTENCE_END = /(?<=[.?!])\s+(?=[A-Z(])/;

export function capSentences(text: string, cap = ROOM_SENTENCE_CAP): string {
  const parts = text.trim().split(SENTENCE_END);
  if (parts.length <= cap) return text.trim();
  return parts.slice(0, cap).join(" ").trim();
}

/* ------------------------------------------------- f. no figure said twice

   The card carries the field, the facility, the before and the after. A
   sentence beside it that prints the same two figures is the room reading its
   own card out loud. */

/** Every figure a delta puts on its card: the before, the after, and the
 *  wire value where the card prints one. */
export function cardFigures(deltas: readonly WorkroomDelta[]): string[] {
  const out: string[] = [];
  for (const d of deltas) {
    for (const v of [d.before, d.after]) {
      const s = typeof v === "string" ? v.trim() : "";
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * DROP A SENTENCE THAT ONLY RESTATES THE CARD.
 *
 * A sentence goes only where BOTH of the card's figures are in it and it adds
 * no other figure of its own: that is the restatement. A sentence carrying one
 * of them plus something the card does not say is a sentence worth reading.
 */
export function cutFigureEcho(text: string, figures: readonly string[]): string {
  if (figures.length < 2) return text;
  const kept = text
    .trim()
    .split(SENTENCE_END)
    .filter((sentence) => {
      const hits = figures.filter((f) => sentence.includes(f));
      return new Set(hits).size < 2;
    });
  return kept.join(" ").trim();
}
