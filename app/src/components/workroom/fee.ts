import type { ElicitMember } from "./elicit";
import { namedFamily, readScope } from "./elicit";

/* =============================================================================
   A FEE CREATE IS THE FAST LANE'S (C, founder drive 2026-09-02).

   "add a 1% origination fee to LOC" went to the BRAIN lane, which asked which
   line (fair), and then invented five more rounds: the fee basis on the increase
   against the full commitment, the payment method, "financed from proceeds /
   paid outside closing / bank paid / waived", and a confirmation. Then the
   deterministic layer asked "Is the origination fee 1% or $20,000,000.00?",
   because the model's restated line had carried the commitment figure into it.
   Seven exchanges for a fee the parser reads in one.

   WHY IT REACHED THE DESK AT ALL. The same reason the exception create did:
   `provablyClean` requires DELTAS, and "to LOC" names a product this package
   carries two of, so the parser legitimately came back with a question. A
   question is not a failed parse. The room asks it itself.

   THE ONLY QUESTIONS A FEE CREATE MAY ASK ARE THE ONES THE WIRE CARRIES.
   `feeAddsJson` takes the fee type, the human label, and either a percentage or
   a flat amount, against ONE facility. There is no basis field, no payment
   method, no timing and no paid-by on the wire this room files, so there is
   nothing for the room to ask about them. That rule is in the doctrine too, and
   `brainRoute` holds a clarify to it.

   AND A PERCENTAGE FEE IS NEVER ASKED FOR A FIGURE. The org computes the money
   from the moved commitment on insert, which is the whole reason a hand-set
   amount beside a percentage is refused. The room says that in one line rather
   than asking a question it already knows the answer to.

   NOTHING HERE IS A NEW WRITE PATH. What it composes is a sentence the fenced
   parser already files, and `app/src/workroom/` is untouched by all of it.
   ============================================================================= */

/** The verbs a banker opens a fee create on. A list, never a pattern. */
const CREATE_VERB = /\b(add|adds|charge|charged|apply|applies|put|include|attach|bill)\b/i;

/** The noun that makes it a fee at all. */
const FEE_NOUN = /\bfees?\b/i;

/** A line about the fees already on the deal, or one taking one OFF, rather
 *  than a new one. A removal has its own lane and would be ruined here. */
const READ_SHAPE = /\b(what|which|who|list|show|tell me|any|do we|have we|are there|is there|how many|waive|waived|remove|drop|delete|off)\b/i;

/**
 * THE FEE KINDS THIS ROOM OFFERS, each one a phrase the fenced reader resolves
 * to a legal fee type. A mirror of `parseModify`'s own FEE_TYPE_MAP heads, and
 * marked as one: the org's fee-type picklist is a residential set, so a C&I fee
 * files as Other with the banker's own words as the label.
 */
export const FEE_KINDS = [
  "Origination fee",
  "Commitment fee",
  "Amendment fee",
  "Attorney fee",
  "Appraisal fee",
  "Agency fee",
] as const;

/** The words that settle a kind, in the same order the fenced reader reads
 *  them, so a chip and a typed line resolve to the same fee. */
const KIND_WORDS: Array<{ said: string; match: RegExp }> = [
  { said: "Origination fee", match: /\b(origination|arrangement|upfront|up[- ]front|front[- ]end|structuring)\b/i },
  { said: "Attorney fee", match: /\b(attorney|legal|counsel|documentation)\b/i },
  { said: "Appraisal fee", match: /\b(appraisal|reappraisal)\b/i },
  { said: "Commitment fee", match: /\b(commitment|facility)\s+fee\b/i },
  { said: "Amendment fee", match: /\bamendment\b/i },
  { said: "Agency fee", match: /\b(agency|agent)\b/i },
];

export interface FeeOpen {
  /** The fee's kind, in the room's own words. Absent where the line said none. */
  kind?: string;
  /** A percentage of the commitment. Never beside an amount. */
  percentage?: number;
  /** A flat amount. Never beside a percentage. */
  amount?: number;
  /** The facility, where the line named exactly one. */
  memberId?: string;
  /** The facilities the line's product word could have meant, where it named a
   *  family rather than one of them. The chips come from here. */
  candidates?: string[];
}

/** A percentage, in basis points or in percent. */
function percentIn(line: string): number | undefined {
  const bps = /(\d+(?:\.\d+)?)\s*(?:bps|basis points?)\b/i.exec(line);
  if (bps) return Number(bps[1]) / 100;
  const pct = /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b|percent\b)/i.exec(line);
  return pct ? Number(pct[1]) : undefined;
}

/** A flat amount. Only where it is written as money: a bare number beside a
 *  percentage is the drive's own "1% or $20,000,000" question. */
function amountIn(line: string): number | undefined {
  const money = /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|million|thousand)?\b/i.exec(line);
  if (!money) return undefined;
  const base = Number(money[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return undefined;
  const scale = /^(m|mm|million)$/i.test(money[2] ?? "") ? 1e6 : /^(k|thousand)$/i.test(money[2] ?? "") ? 1e3 : 1;
  return base * scale;
}

/**
 * THE FEE CREATE THIS LINE OPENS, or null.
 *
 * Null is the common case and it is not a failure: the line is not a fee create
 * and every lane the room already has takes it exactly as it always did.
 */
export function readFeeOpen(line: string, members: ElicitMember[], focused?: ElicitMember | null): FeeOpen | null {
  const text = (line ?? "").trim();
  if (!text) return null;
  if (!FEE_NOUN.test(text) || !CREATE_VERB.test(text)) return null;
  if (READ_SHAPE.test(text) || text.includes("?")) return null;

  const percentage = percentIn(text);
  const amount = percentage === undefined ? amountIn(text) : undefined;
  const kind = KIND_WORDS.find((k) => k.match.test(text))?.said;

  const scope = readScope(text, members, amount !== undefined ? [amount] : []);
  const family = namedFamily(text, members);
  const memberId = scope.ids.length === 1 ? scope.ids[0] : undefined;
  const open: FeeOpen = { kind, percentage, amount };
  if (memberId) open.memberId = memberId;
  else if (family.length > 1) open.candidates = family;
  else if (!scope.word && focused) open.memberId = focused.id;
  return open;
}

/**
 * THE FACILITY, BY THE ORG'S OWN NAME WITH THE BORROWER'S NAME OFF THE FRONT.
 *
 * `shortName`, not `orgName`, and for the reason the involvement surface uses
 * it: a fee create opens on "add", and the party reader resolves the first
 * account name it finds in the line. A full loan name begins with the
 * borrower's, so "on the Hartwell Precision Manufacturing LLC - Line of Credit
 * - $15,000,000.00 add a 1% origination fee" opens an INVOLVEMENT create and
 * asks what role Hartwell takes. `<Product> - <$Amount>` resolves exactly one
 * member inside the parser and carries no account name at all.
 */
const targetOf = (m: ElicitMember): string => m.shortName ?? m.orgName ?? m.label;

/** The figure, as the fenced reader reads it back. */
const figureOf = (open: FeeOpen): string =>
  open.percentage !== undefined
    ? `${open.percentage}%`
    : `$${(open.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * THE SENTENCE THE PARSER ALREADY FILES.
 *
 * ONE CLAUSE, DELIBERATELY. A comma makes it two to `clauseCount`, and a
 * two-clause line is the brain's by contract, which is the trip this module
 * exists to stop.
 */
export function feeSay(open: FeeOpen, member: ElicitMember): string {
  return `on the ${targetOf(member)} add a ${figureOf(open)} ${(open.kind ?? "fee").toLowerCase()}`;
}

export interface FeeAsk {
  text: string;
  options: Array<{ label: string; say: string }>;
}

/**
 * WHAT THE CREATE STILL NEEDS, or null where it needs nothing.
 *
 * THREE QUESTIONS AT MOST, AND THEY ARE THE WIRE'S OWN: which facility, what
 * kind of fee, and how much. One at a time, and every chip types back a
 * COMPLETE sentence, so no state is held between turns.
 */
export function feeAsk(open: FeeOpen, members: ElicitMember[]): FeeAsk | null {
  const named = (open.kind ?? "fee").toLowerCase();
  const member = open.memberId ? (members.find((m) => m.id === open.memberId) ?? null) : null;

  if (!member) {
    const offered = open.candidates?.length
      ? members.filter((m) => open.candidates!.includes(m.id))
      : members;
    return {
      text: `Which facility does the ${named} go on? A fee is authored on one loan's own version, so I will not pick between them for you.`,
      options: offered.map((m) => ({ label: m.label, say: feeSay({ ...open, memberId: m.id, candidates: undefined }, m) })),
    };
  }

  if (!open.kind) {
    return {
      text:
        `What kind of fee is that on the ${member.label}? ` +
        "The org's own fee list is a closing-cost set, so a commercial fee files as Other with your words as the label, and I will not pick the kind for you.",
      options: FEE_KINDS.map((label) => ({
        label,
        say: feeSay({ ...open, kind: label }, member),
      })),
    };
  }

  if (open.percentage === undefined && open.amount === undefined) {
    return {
      text: `How much is the ${named} on the ${member.label}? A percentage of the commitment, or a flat amount.`,
      options: [],
    };
  }

  return null;
}

/**
 * WHAT THE ROOM SAYS BESIDE A PERCENTAGE FEE, and why it asks nothing further.
 *
 * The org's own FeeTrigger derives the money from the commitment on the clone,
 * so the amount is not the bank's to state and the basis is not a question: it
 * is the facility this fee is authored on. One line, said once, instead of the
 * two rounds the desk spent on it.
 */
export const feePercentageNote = (member: ElicitMember): string =>
  `The org works the money out itself from the ${member.label}'s own commitment on the new version, so there is no amount for me to set and nothing further to ask.`;
