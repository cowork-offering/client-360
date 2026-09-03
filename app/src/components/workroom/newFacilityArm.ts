/* =============================================================================
   A NEW FACILITY INSIDE A MODIFICATION, AND INSIDE A RENEWAL.

   THE FOUNDER, 2026-09-03: "Do we allow new loans to be created as part of the
   modification and renewal? This should be fully possible."

   It was not. `readSteer` matched "add a new loan" as an ORIGINATION and the
   room RESTARTED in the create route, which throws away the manifest the banker
   has been building. That is the wrong answer twice over: it loses work, and it
   is wrong about nCino. A modification is anchored on the PRODUCT PACKAGE and
   produces the next VERSION of it; new money goes on the version being approved,
   not on a package nobody is looking at.

   SO THE LINE STAYS IN THIS ROOM and stages a card. The card rides the org arm
   `newFacilitiesJson` through the same sentinel `fieldWire` every other arm uses
   (see `orgArms.ts`), and the facility becomes a target the LATER lines can name:
   "add Elena Hartwell as limited guarantor on the new equipment loan" resolves to
   the label `new:1` and the org attaches it to the loan it just created.

   NOTHING HERE HOLDS STATE BETWEEN TURNS. Every question the room asks offers
   chips whose `say` is the WHOLE sentence again with one more answer in it, so
   the room re-reads the line from scratch and gets the same result. That is the
   rule `pricingGate.ts` already runs on, and it is why an elicitation can never
   drift out of step with what the banker actually typed.

   THE PRICING GATE IS PART OF THE GRAMMAR, not an afterthought. nCino hides the
   rate and the payment stream until the amount, the term, the AMORTISED term and
   the FIRST PAYMENT DATE are all set. A modification that moves a commitment is
   asked for the last two; a facility this room CREATES is asked for them on the
   same terms, because a new loan nobody can price is the same defect arriving
   from the other direction.
   ============================================================================= */

import type { WorkroomDelta, WorkroomMode } from "../../workroom/types";
import { ARM_FIELD, encodeArm, type ArmEntry, type NewFacilitySpec } from "./orgArms";
import type { ElicitMember } from "./elicit";
import { PRICING_WHY, firstOfMonth, monthLabel, readDate } from "./pricingGate";

/* ------------------------------------------------------------- the catalog */

/**
 * THE ORG-EXACT PRODUCTS, and the words a banker reaches for.
 *
 * The value on the left is what the Commercial Loan record type actually offers
 * (`C360NewFacilities.RT_PRODUCT_VALUES`, read off the org 2026-07-26). Record
 * type scoping is NOT enforced by the API: a product outside this list is
 * ACCEPTED and STORED and then renders wrong in nCino, so the room offers only
 * these and the org refuses anything else by name.
 */
const PRODUCTS: Array<{ product: string; words: RegExp }> = [
  { product: "Line of Credit", words: /\b(line\s+of\s+credit|revolver|revolving|loc|working\s+capital\s+line)\b/i },
  { product: "Equipment", words: /\bequipment\b/i },
  { product: "Construction", words: /\bconstruction\b/i },
  { product: "Purchase", words: /\bpurchase\b/i },
  { product: "HELOC", words: /\bheloc\b/i },
  { product: "Deposit", words: /\bdeposit\b/i },
];

/** Every product the room can offer, in the order a C&I banker meets them. */
export const NEW_FACILITY_PRODUCTS = PRODUCTS.map((p) => p.product);

/** The product this line names, or null. */
export function readProduct(line: string): string | null {
  for (const p of PRODUCTS) if (p.words.test(line)) return p.product;
  return null;
}

/* ------------------------------------------------------------- the figures */

const MAGNITUDE: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, thousand: 1e3, million: 1e6, billion: 1e9 };

const MONEY_WORD =
  /(?:\$\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|mm|m|b|thousand|million|billion)?\b/gi;

/**
 * THE COMMITMENT THIS LINE ASKS FOR, or null.
 *
 * A figure carrying a magnitude ("3M", "$3,000,000", "3 million") is money. A
 * bare small number is NOT: "60 month term" would otherwise be read as a $60
 * commitment, which is the decimal-slip defect the room already knows about from
 * the pricing gate's own $1 incident.
 */
export function readAmount(line: string): number | null {
  const stripped = line.replace(/\b\d+\s*(?:month|months|mo|year|years|yr|yrs)\b/gi, " ");
  MONEY_WORD.lastIndex = 0;
  let hit: RegExpExecArray | null;
  while ((hit = MONEY_WORD.exec(stripped))) {
    const raw = Number(hit[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const mult = hit[2] ? MAGNITUDE[hit[2].toLowerCase()] : undefined;
    if (mult) return raw * mult;
    // No magnitude word: only a figure written out in full is money.
    if (raw >= 10000) return raw;
  }
  return null;
}

/** The term in months, or null. Years are converted; nothing else is guessed. */
export function readTermMonths(line: string): number | null {
  const months = /\b(\d{1,3})\s*(?:-|\s)?\s*month\b/i.exec(line) ?? /\b(\d{1,3})\s*months\b/i.exec(line);
  if (months) return Number(months[1]);
  const years = /\b(\d{1,2})\s*(?:-|\s)?\s*(?:year|yr)s?\b/i.exec(line);
  if (years) return Number(years[1]) * 12;
  return null;
}

/**
 * THE AMORTISED TERM, which is a different question to the term and is written
 * as one: "amortised over 240 months", "25 year amortisation".
 */
export function readAmortisation(line: string): number | null {
  const over = /\bamorti[sz](?:ed|ation|sation)?\s+(?:term\s+)?(?:of\s+|over\s+)?(\d{1,3})\s*(month|months|year|years|yr|yrs)?\b/i.exec(line);
  if (over) return /year|yr/i.test(over[2] ?? "month") ? Number(over[1]) * 12 : Number(over[1]);
  const ahead = /\b(\d{1,3})\s*(month|months|year|years|yr|yrs)?\s*amorti[sz]/i.exec(line);
  if (ahead) return /year|yr/i.test(ahead[2] ?? "month") ? Number(ahead[1]) * 12 : Number(ahead[1]);
  return null;
}

/**
 * The first payment date, in the forms a banker writes one.
 *
 * The date is taken WORD BY WORD from the front of what follows the marker,
 * longest first, because "Oct 1, 2026" carries a comma of its own and a clause
 * split on commas would hand `readDate` the string "Oct 1".
 */
export function readFirstPayment(line: string): string | null {
  const said = /\bfirst\s+payment(?:\s+date)?\s+(?:of\s+|on\s+|is\s+)?(.+)$/i.exec(line);
  if (!said) return null;
  const words = said[1].trim().split(/\s+/);
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    const hit = readDate(words.slice(0, n).join(" "));
    if (hit) return hit;
  }
  return null;
}

/**
 * THE PURPOSE, which is the only free-text answer on the card.
 *
 * "for CNC line expansion" is a purpose; "for the 15M line of credit" is a
 * target and never one, so the phrase is refused where it names a facility or a
 * figure. A purpose the room reads wrong is a purpose the credit file carries
 * wrong, and there is no describe to check it against.
 */
export function readPurpose(line: string): string | null {
  const said = /\bfor\s+([^,;.]+)/i.exec(line);
  if (!said) return null;
  /* THE PURPOSE ENDS WHERE THE NEXT ANSWER BEGINS. The banker's whole sentence
     is re-read on every turn, so by the last question it carries the pricing
     answers too, and a phrase that ran to the end of the line would file
     "CNC line expansion amortised over 60 months" as the purpose. */
  const text = said[1]
    .split(/\s+(?:amorti[sz]|first\s+payment|with\s+a\b|and\b|over\s+\d)/i)[0]
    .trim()
    .replace(/\s+$/, "");
  if (!text || text.split(/\s+/).length > 12) return null;
  /* A TARGET IS NOT A PURPOSE. "for the 15M line of credit" names a facility, and
     the tell is a definite article beside a facility noun, a dollar sign, or a
     figure carrying a magnitude. "CNC line expansion" carries the word "line"
     and is a purpose, so the noun alone can never be the test. */
  if (/\$/.test(text)) return null;
  if (/\b\d[\d,.]*\s*(k|mm|m|b|thousand|million|billion)\b/i.test(text)) return null;
  if (/\bthe\b/i.test(text) && /\b(loans?|facilit(?:y|ies)|lines?|notes?|revolver)\b/i.test(text)) return null;
  return text;
}

/* --------------------------------------------------------------- the intent */

/** The line asks this room to CREATE a facility rather than to change one. */
const CREATE_VERB = /\b(add|adding|structure|structuring|originate|originating|set\s+up|write|put\s+on|include)\b/i;
const NEW_LOAN = /\b(?:a\s+)?(?:new|another|additional|second|extra)\s+(?:[a-z$0-9,.\s]{0,28}?)\b(loan|facility|line|note|term\s+loan)\b/i;

/** Does this line ask for a new facility on the version being approved? */
export function namesANewFacility(line: string): boolean {
  return CREATE_VERB.test(line) && NEW_LOAN.test(line);
}

/* ---------------------------------------------------------------- the delta */

/** How the room says a commitment. Matches the manifest's own money voice. */
const money = (n: number): string =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}MM` : `$${n.toLocaleString("en-US")}`;

/** The phrase the manifest, the confirm and every later line know it by. */
export const newFacilityTitle = (spec: NewFacilitySpec): string => `${money(spec.amount)} ${spec.product}`;

export interface NewFacilityArgs {
  /** The BOOKED member the plan is anchored on. The engine builds `facilityIds`
   *  from every delta's `facilityId`, so a label there would put "new:1" into
   *  the payload's facility list and the org would refuse the whole plan. The
   *  arm carries the label; the wire carries a real member. */
  anchorId: string;
  anchorLabel: string;
}

/**
 * THE CARD. One entry on the manifest, one facility on the new version.
 *
 * `op` is "add" and `newMember` is true, because this genuinely moves the member
 * count on the package: the new version holds one facility more than the current
 * one, and the rail's "N of M members" would otherwise under-report it.
 */
export function newFacilityDelta(spec: NewFacilitySpec, args: NewFacilityArgs): WorkroomDelta {
  const arm: ArmEntry = { kind: "newFacility", recordId: spec.label, targetLoanId: spec.label, facility: spec };
  const said = newFacilityTitle(spec);
  const priced = spec.amortizedTermMonths !== undefined && spec.firstPaymentDate !== undefined;
  return {
    id: `facility.new:${spec.label}`,
    group: "terms",
    op: "add",
    kind: "New facility",
    kindTone: "new",
    badge: `${said} added to the new version`,
    title: said,
    target: "the new package version",
    before: "not on this relationship",
    after: `${spec.termMonths} month term, for ${spec.purpose}`,
    newMember: true,
    committedDeltaMM: spec.amount / 1e6,
    map: [
      ["Object", "LLC_BI__Loan__c"],
      ["Product", spec.product],
      ["Amount", money(spec.amount)],
      ["Term", `${spec.termMonths} months`],
      ["Primary loan purpose", spec.purpose],
      [
        "Pricing",
        priced
          ? `amortised over ${spec.amortizedTermMonths} months, first payment ${spec.firstPaymentDate}`
          : "not set. nCino will show no rate and no payment stream until it is",
      ],
      [
        "Written as",
        "A NEW loan on the new package version, filed at Qualification with the borrower on its own borrowing structure. It carries no chain row and no modification flag: it is not a version of anything, and nothing on the booked side of this relationship changes because of it.",
      ],
    ],
    fields: ["LLC_BI__Product__c", "LLC_BI__Amount__c", "LLC_BI__Term_Months__c"],
    fileable: true,
    fieldWire: {
      field: ARM_FIELD,
      label: "New facility",
      value: encodeArm(arm),
      display: `${said} is filed on the new package version, ${spec.termMonths} months, for ${spec.purpose}`,
      facilityId: args.anchorId,
    },
    filed: {
      recordId: "assigned by the org on execution",
      verification:
        "The facility is re-read after the write and reported under the name the org assigned it, with its package, product, commitment and term proved against what was staged.",
    },
  };
}

/* ----------------------------------------------------------- the elicitation

   THE CHIP TYPES BACK A COMPLETE SENTENCE. No state is held between turns: the
   room reads the whole line again and reaches the same answer, which is what
   keeps an elicitation from drifting out of step with what the banker typed. */

/** The line, with one more answer folded into it. */
const withAnswer = (line: string, more: string): string => `${line.trim().replace(/[.\s]+$/, "")} ${more}`;

export interface NewFacilityAsk {
  kind: "ask";
  text: string;
  options?: Array<{ label: string; say: string }>;
}
export interface NewFacilityCard {
  kind: "card";
  spec: NewFacilitySpec;
  said: string;
}
/** The route cannot file it, and the sentence names the one that can. */
export interface NewFacilityHandoff {
  kind: "handoff";
  text: string;
}
export type NewFacilityRead = NewFacilityAsk | NewFacilityCard | NewFacilityHandoff | null;

/**
 * WHY A RENEWAL DOES NOT FILE ONE, AND WHAT DOES.
 *
 * `stage_renewal` takes the same arm and validates it against the org's own
 * product catalog, so the plan a renewal builds NAMES the facility. What it does
 * not do is file it: execution of a renewal is held, because a credit action
 * needs a Booked facility and Booked is reachable only through nCino's own
 * Submit for Approval. Understating what the room can do is the same defect as
 * overstating it, so this says both halves.
 */
export const RENEWAL_HANDOFF =
  "A renewal versions the whole package too, so a new facility belongs on its new version and stage_renewal plans one. " +
  "What it does not do is FILE it: execution of a renewal is held, because a credit action needs a Booked facility and " +
  "Booked is reachable only through nCino's own Submit for Approval. Run this as a modification and I will stage the " +
  "facility and file it on the new version. Nothing has been staged and nothing has come off the manifest.";

export interface NewFacilityContext {
  line: string;
  mode: WorkroomMode;
  members: ElicitMember[];
  /** Net-new facilities already on the manifest, for the next label. */
  staged: number;
  /** The artifact's own instant, for the first-payment chips. Never a clock. */
  generatedAt?: string;
}

/**
 * WHAT THIS LINE ASKS FOR, and what is still missing before it can be staged.
 *
 * Null hands the line back to every other lane, which is the right answer on the
 * CREATE route: that room's own tool files a facility against the current
 * package and this arm would be a second way to do one thing.
 */
export function readNewFacility(ctx: NewFacilityContext): NewFacilityRead {
  if (ctx.mode !== "modify" && ctx.mode !== "renew") return null;
  if (!namesANewFacility(ctx.line)) return null;
  if (ctx.mode === "renew") return { kind: "handoff", text: RENEWAL_HANDOFF };

  const line = ctx.line;
  const product = readProduct(line);
  if (!product) {
    return {
      kind: "ask",
      text:
        "What product is the new facility? The org builds the loan's own name from it and self-populates Construction when it is blank, " +
        "so a facility filed without one ships mislabelled.",
      options: NEW_FACILITY_PRODUCTS.map((p) => ({ label: p, say: withAnswer(line, `as a ${p.toLowerCase()}`) })),
    };
  }

  const amount = readAmount(line);
  if (amount === null) {
    return { kind: "ask", text: `How much is the new ${product.toLowerCase()}? Say the commitment and I will put it on the new version.` };
  }
  if (amount <= 0) {
    return { kind: "ask", text: "A commitment is greater than zero. What is the amount on the new facility?" };
  }

  const termMonths = readTermMonths(line);
  if (termMonths === null) {
    return {
      kind: "ask",
      text: `What term does the ${money(amount)} ${product.toLowerCase()} run for? nCino prices on the amount and the term, and a facility with neither cannot be priced at all.`,
      options: [36, 60, 84, 120].map((m) => ({ label: `${m} months`, say: withAnswer(line, `with a ${m} month term`) })),
    };
  }

  const purpose = readPurpose(line);
  if (!purpose) {
    return {
      kind: "ask",
      text:
        "What is the primary loan purpose? It goes on the Loan Detail nCino creates for the facility, and the org leaves it null, " +
        "so nobody sets it unless this plan carries it.",
    };
  }

  /* THE PRICING GATE, on the same terms a commitment change gets it. Two more
     questions, one at a time, and neither is optional-by-silence: a facility
     filed without them opens in nCino with no rate and no payment stream. */
  const amortizedTermMonths = readAmortisation(line);
  if (amortizedTermMonths === null) {
    const same = { label: `Same as the term (${termMonths} months)`, say: withAnswer(line, `amortised over ${termMonths} months`) };
    return {
      kind: "ask",
      text: `What is the amortisation term on the new ${product.toLowerCase()}? ${PRICING_WHY} It is a new loan, so nothing carries one for it.`,
      options: [
        same,
        ...[240, 300].filter((m) => m !== termMonths).map((m) => ({ label: `${m} months`, say: withAnswer(line, `amortised over ${m} months`) })),
      ],
    };
  }

  const firstPaymentDate = readFirstPayment(line);
  if (!firstPaymentDate) {
    const next = firstOfMonth(ctx.generatedAt, 1);
    const after = firstOfMonth(ctx.generatedAt, 2);
    const dates = [next, after].filter((d): d is string => d !== null);
    return {
      kind: "ask",
      text:
        `What is the first payment date on the new ${product.toLowerCase()}? ${PRICING_WHY} This is the last of the four.` +
        (dates.length ? "" : " This view carries no snapshot instant, so I will not offer a month; say the date."),
      options: dates.map((iso) => ({
        label: `1 ${monthLabel(iso)}`,
        say: withAnswer(line, `first payment ${iso}`),
      })),
    };
  }

  const spec: NewFacilitySpec = {
    label: `new:${ctx.staged + 1}`,
    product,
    amount,
    termMonths,
    purpose,
    amortizedTermMonths,
    firstPaymentDate,
  };
  return {
    kind: "card",
    spec,
    said:
      `${newFacilityTitle(spec)} goes onto the new version of this package, at Qualification with the borrower on its own structure, ` +
      `over ${termMonths} months for ${purpose}. It is a new loan rather than a version of one, so nothing on the booked side of this ` +
      `relationship moves because of it, and booking it is nCino's own Submit for Approval like everything else on the version.`,
  };
}

/* ------------------------------------------------- naming it on a later line

   "add Elena Hartwell as limited guarantor on the new equipment loan" is about a
   facility that has no id, so it can only be named by what the banker just
   staged. The room resolves it to the LABEL and the org resolves the label to
   the loan it created.                                                        */

/** A staged net-new facility, as the later lines need to see it. */
export interface StagedNewFacility {
  label: string;
  product: string;
  title: string;
}

/** Every net-new facility on the manifest, in the order they were staged. */
export function stagedNewFacilities(deltas: WorkroomDelta[]): StagedNewFacility[] {
  const out: StagedNewFacility[] = [];
  for (const d of deltas) {
    if (d.fieldWire?.field !== ARM_FIELD) continue;
    try {
      const arm = JSON.parse(String(d.fieldWire.value)) as ArmEntry;
      if (arm.kind === "newFacility" && arm.facility) {
        out.push({ label: arm.facility.label, product: arm.facility.product, title: d.title });
      }
    } catch {
      /* a delta whose arm will not decode is not one this reader claims. */
    }
  }
  return out;
}

/**
 * WHICH STAGED NEW FACILITY THIS LINE NAMES, or null.
 *
 * "the new loan" settles it where exactly one is staged. Where there are two,
 * the product word settles it, and where nothing settles it the caller asks
 * rather than guessing: an arm aimed at the wrong new facility is a covenant on
 * the wrong loan, and nothing downstream would catch it.
 */
export function readNewFacilityTarget(
  line: string,
  staged: StagedNewFacility[],
): { label: string; title: string } | { ambiguous: StagedNewFacility[] } | null {
  if (!staged.length) return null;
  if (!/\bthe\s+new\b|\bnew\s+(loan|facility|line|note)\b/i.test(line)) return null;
  const byProduct = staged.filter((s) => {
    const p = readProduct(line);
    return p !== null && p === s.product;
  });
  if (byProduct.length === 1) return { label: byProduct[0].label, title: byProduct[0].title };
  if (byProduct.length > 1) return { ambiguous: byProduct };
  if (staged.length === 1) return { label: staged[0].label, title: staged[0].title };
  return { ambiguous: staged };
}
