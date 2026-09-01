import type { BrainEnvelope, BrainFacility, BrainReadCard, BrainRoute } from "../../channel/brainLane";
import type { PackageMember, WorkroomDelta, WorkroomMode } from "../../workroom/types";
import type { IconKind } from "./TypeIcon";
import type { ReadCardModel, ReadGroup, ReadRow } from "./readCard";

/* =============================================================================
   WHICH LANE A LINE TAKES, and what a brain answer looks like in this room.

   THE GUARD RECOGNISES SHAPES; IT STILL RESOLVES NOTHING. Everything here is
   the same kind of judgement `ask.ts` makes — is this a question, is this an
   instruction — extended with the one reading the founder called out after the
   live run: a courtesy prefix in front of an imperative is a COMMAND, not a
   question, and refusing to stage it was the guard being blunt in the wrong
   direction.

   THE ENGINES ARE UNTOUCHED. Nothing in this file parses a value, resolves a
   record or composes a payload. A polite command is STRIPPED and handed to the
   fast lane exactly as if the courtesy had never been typed.
   ============================================================================= */

/* --------------------------------------------------------- polite commands

   "can you increase the LoC to 20M" opens on `can`, so the question guard
   answered it instead of staging it. That was the KNOWN CONSEQUENCE recorded in
   ask.ts, and the founder's call is that it is the wrong one: a banker who
   writes "could you move the maturity to 2028-03-31" has asked for a change and
   is owed a chip, not a capability lecture.

   THE ASYMMETRY IS DELIBERATE AND NARROW. A courtesy prefix alone is not
   enough: the remainder must open on an ACTION VERB and carry something to act
   on. "can you tell me what covenants are on this" opens on `tell`, which is
   not an action verb, and stays a question. "can you show me the fees" stays a
   question. The cost of getting this wrong in the permissive direction is the
   founder's original bug, so the verb list is a list and never a pattern.      */

/** The courtesy, and nothing else. `you`/`we`/`I` because bankers write all
 *  three, and the optional `please` on either side of it. */
const COURTESY = /^\s*(?:please[,\s]+)?(?:can|could|would|will)\s+(?:you|we|i)\s+(?:please\s+)?/i;

/**
 * Verbs that CHANGE the package. Every one of them is a verb the deterministic
 * parser already stages on (app/src/workroom/parseModify.test.ts). Reading
 * verbs — tell, show, list, explain, confirm, check, find, remind — are
 * deliberately absent: those are questions with a courtesy in front.
 */
const ACTION_VERB =
  /^(increase|decrease|reduce|raise|lower|take|move|push|extend|shorten|change|switch|update|set|make|give|price|add|put|bring|remove|drop|delete|exclude|pledge|log|record|renew|amend|stretch)\b/i;

/**
 * THE LINE WITHOUT ITS COURTESY, or null where the line is not a polite
 * command.
 *
 * The trailing question mark goes with the prefix: "would you take the line to
 * $20M?" is one sentence wearing two costumes, and the mark left on the end
 * would be read as part of a value by the field wave (the founder's repro 11b,
 * from the other direction).
 */
export function politeCommand(text: string): string | null {
  const line = text.trim();
  if (!line) return null;
  const match = COURTESY.exec(line);
  if (!match) return null;
  const rest = line.slice(match[0].length).replace(/[?\s]+$/, "").trim();
  if (!rest || !ACTION_VERB.test(rest)) return null;
  return rest;
}

/* ------------------------------------------------------------- the envelope */

/** The label a facility carries in the envelope and in a restated proposal.
 *  The member's own key, which is what the parser resolves a member on. */
const facilityOf = (m: PackageMember): BrainFacility => ({ loanId: m.id, label: m.key, commitment: m.amount });

/**
 * WHAT THE ROOM HANDS OVER. Compact, and derived entirely from what the room is
 * already holding: no read is issued to build it.
 *
 * The staged digest carries titles, targets and the proposed reading. It does
 * NOT carry the wire payload: a reply must not be able to restate a figure it
 * did not read, and the pack says figures come from the live read.
 */
export function buildEnvelope(args: {
  line: string;
  mode: WorkroomMode;
  accountName: string;
  packageName: string;
  productPackageId: string | null;
  members: PackageMember[];
  eligible: (m: PackageMember) => boolean;
  focused: PackageMember | null;
  entries: WorkroomDelta[];
}): BrainEnvelope {
  return {
    v: 1,
    line: args.line,
    relationship: args.accountName,
    route: args.mode as BrainRoute,
    packageName: args.packageName,
    productPackageId: args.productPackageId,
    selectedFacility: args.focused ? facilityOf(args.focused) : null,
    facilities: args.members.filter(args.eligible).map(facilityOf),
    staged: args.entries.map((e) => ({ title: e.title, target: e.target, after: e.after })),
    grounding: "plugin-skill:workroom-brain",
  };
}

/* ------------------------------------------------------- the answer, drawn

   READ-CARDS RENDER THROUGH THE ROOM'S OWN CARD, never through a second one.
   `buildReadCard` turns the bundle into a `ReadCardModel`; this turns a brain
   reply into the same model, so both arrive at the same component and the room
   has exactly one card language. Nothing is forked.                          */

/** The pack's row-glyph vocabulary, mapped onto the room's icon set. An icon we
 *  do not know is `package`, which is the room's own neutral row mark: a wrong
 *  glyph is a claim, an unrecognised one is not. */
const ICONS: Record<string, IconKind> = {
  borrower: "package",
  guarantor: "package",
  covenant: "covenant",
  collateral: "collateral",
  fee: "pricing",
  facility: "revolver",
  date: "maturity",
  money: "commit",
  warn: "covenant",
  ok: "covenant",
};

/** The group heading a topic slug reads as. The slug is the pack's own word;
 *  an unknown one is title-cased rather than dropped. */
function headingFor(topic: string): string {
  const known: Record<string, string> = {
    involvements: "Who is on the deal",
    covenants: "Covenant tests",
    collateral: "Security",
    fees: "Fees",
    exposure: "Exposure",
    pricing: "Pricing",
    exceptions: "Policy exceptions",
    history: "History",
    decisions: "Prior decisions",
  };
  if (known[topic]) return known[topic];
  const words = topic.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Read";
}

/** A brain read-card as the room's own card model. */
export function toReadCardModel(card: BrainReadCard): ReadCardModel {
  const rows: ReadRow[] = card.rows.map((r) => ({
    icon: ICONS[r.icon] ?? "package",
    label: r.label,
    value: r.value,
    detail: r.sub,
    // STATUS LIVES IN THE INK. The pack has no tone field; `warn` is its own
    // word for a row that reads badly, so the glyph key carries the tone.
    tone: r.icon === "warn" ? "warn" : undefined,
  }));
  const groups: ReadGroup[] = [{ heading: headingFor(card.topic), rows }];
  return {
    topic: card.topic,
    lede: card.title,
    groups,
    // A card the brain ended without a follow-up still hands the conversation
    // back: an answer that stops dead is an answer the banker has to restart.
    followUp: card.followUp ?? "What should change on this package?",
  };
}
