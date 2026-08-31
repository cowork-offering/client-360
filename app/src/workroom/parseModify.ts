import type { Facility, LegalEntity } from "../data/contract";
import { facilityProduct, shortFacilityLabel } from "../data/facilityStage";
import { catalogField, isFileable, matchCatalog, type CatalogField, type CatalogMatch } from "./fieldCatalog";

/** The only money field the modification tool carries. See `inferAmount`. */
const FILEABLE_AMOUNT = catalogField("loan.amount")!;

/* =============================================================================
   THE DETERMINISTIC PARSE.

   Natural language in, AMENDMENTS out — or a question, or nothing. There is no
   fourth outcome and, in particular, there is no "best guess": a line this
   cannot read comes back as a question naming what is missing, because a chip
   the banker did not mean is worse than a chip that never arrived.

   IT STANDS ALONE. The gateway LLM is an optional assist in the engine above
   this, gated behind a deterministic miss, and whatever it returns is validated
   back through THIS module before it can become a chip. Nothing reaches the org
   that this file did not resolve against the field catalog and the real package.

   Two refusals worth naming, because both are places a parser is tempted to
   invent money:
     - a bare number with no magnitude ("increase the line to 20") is a
       question, never twenty million;
     - a spread ("SOFR+300") is not an absolute rate, and the tool writes an
       absolute rate. It asks rather than converting.
   ============================================================================= */

export type ParsedValue =
  | { kind: "currency"; amount: number; text: string }
  | { kind: "percent"; rate: number; text: string }
  | { kind: "months"; months: number; text: string }
  | { kind: "date"; iso: string; text: string }
  | { kind: "text"; text: string }
  /** A NET-NEW COVENANT, fully resolved: the exact org catalog type name, the
   *  threshold, and the operator symbol the org's picklists express. Only a
   *  value this complete files; anything looser stays a question or a handoff. */
  | { kind: "covenant"; typeName: string; threshold: number; operator: "<" | "<=" | "=" | ">=" | ">"; text: string };

/** One amendment the banker asked for, resolved against the catalog and the
 *  package. `value` is null where the field takes no scalar (a party add, a
 *  pledge) — the amendment is still real, it just has nothing to compare. */
export interface Amendment {
  field: CatalogField;
  /** The member it lands on. Null for package-level and party-level asks. */
  facility: Facility | null;
  value: ParsedValue | null;
  /** The entity named, for a party amendment. */
  party?: string;
  /** The borrowing-structure role the line names, for a party amendment. */
  role?: string;
  /** Ownership percentage, when the line states one for a party add. */
  ownership?: number;
  /** The banker's own word for the field, so a reply can quote it back. */
  matched: string;
  /**
   * WHAT THIS DOES TO THE ROLL-OVER BASELINE.
   *
   * A modification carries the parent's whole record graph onto the clone —
   * covenants, pledges, borrowing structure, fees, pricing — so every amendment
   * is a DELTA against what is already there. Keeping is the default and is
   * never staged; the three that are staged are change, add and remove, and
   * REMOVE is the one that has to be unmistakable in the manifest.
   */
  op: AmendmentOp;
}

export type AmendmentOp = "change" | "add" | "remove";

export type ParseOutcome =
  | { kind: "amendments"; amendments: Amendment[] }
  /** Read, but not resolvable without one more fact. Never a guess.
   *  `awaiting` names WHAT the question is about, so the next line can answer
   *  it with the missing fact alone — "$20,000,000" is an answer, and a room
   *  that made the banker restate the whole instruction would not be a
   *  conversation. */
  | { kind: "clarify"; question: string; awaiting?: { field: CatalogField; facility: Facility | null } }
  | { kind: "none" };

export interface ParseContext {
  /** Members of the package, booked and otherwise. */
  facilities: Facility[];
  /** Members a credit action may actually run against. */
  booked: Facility[];
  /** The relationship's name, so member labels read short. */
  relationship: string;
  /** Entities already on the deal, for resolving "remove Elena". */
  entities: LegalEntity[];
  /**
   * THE MEMBER THE BANKER IS STANDING ON.
   *
   * Set when they picked one off the package strip. It is a default, never an
   * override: a line that NAMES a member always resolves to what it named, and
   * the focus only answers the question "which one?" for a line that names
   * none. Without it, picking a facility and then saying "take it to twenty
   * million" would be answered with "which member?" about the member just
   * clicked, which is the room forgetting what the banker did one turn ago.
   */
  focus?: Facility | null;
}

/* ------------------------------------------------------------------- money */

const MAGNITUDE: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  millions: 1e6,
  bn: 1e9,
  b: 1e9,
  billion: 1e9,
};

/* THE SCALAR READERS ARE SHARED, and deliberately so. `parseCreate` reads the
   same money, the same months and the same dates out of a banker's line, and a
   second implementation of "is 20 twenty million or twenty dollars" is a second
   place for the answer to drift. Exported: `Scalar`, `moneyTokens`,
   `monthTokens`, `DateRead`, `readDate`. Everything else here stays private. */
export interface Scalar {
  value: number;
  text: string;
  index: number;
}

/** Money tokens, with position. A magnitude suffix or a `$` is REQUIRED, or the
 *  number has to be written out in full — see the module note on bare numbers. */
export function moneyTokens(lower: string): Scalar[] {
  const out: Scalar[] = [];
  const re = /(\$\s*)?(\d[\d,]*(?:\.\d+)?)\s*(mm|million|millions|bn|billion|k|m|b)?\b/g;
  for (let m = re.exec(lower); m; m = re.exec(lower)) {
    const [text, dollar, digits, suffix] = m;
    const bare = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(bare)) continue;
    const factor = suffix ? MAGNITUDE[suffix] : 1;
    // Written out in full ($18,000,000 or 18000000) counts on its own; a short
    // number needs either a magnitude word or a currency mark to be money.
    const written = digits.includes(",") || bare >= 1000;
    if (!suffix && !dollar && !written) continue;
    out.push({ value: bare * (factor ?? 1), text: text.trim(), index: m.index });
  }
  return out;
}

function percentTokens(lower: string): Scalar[] {
  const out: Scalar[] = [];
  const pct = /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|percent)/g;
  for (let m = pct.exec(lower); m; m = pct.exec(lower)) {
    out.push({ value: Number(m[1]), text: m[0].trim(), index: m.index });
  }
  const bps = /(\d+(?:\.\d+)?)\s*(?:bps|basis\s+points?|bp)\b/g;
  for (let m = bps.exec(lower); m; m = bps.exec(lower)) {
    out.push({ value: Number(m[1]) / 100, text: m[0].trim(), index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function monthTokens(lower: string): Scalar[] {
  const out: Scalar[] = [];
  const months = /(\d+)\s*(?:months?|mos?\b)/g;
  for (let m = months.exec(lower); m; m = months.exec(lower)) {
    out.push({ value: Number(m[1]), text: m[0].trim(), index: m.index });
  }
  const years = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?\b|-year\b)/g;
  for (let m = years.exec(lower); m; m = years.exec(lower)) {
    out.push({ value: Math.round(Number(m[1]) * 12), text: m[0].trim(), index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

/* -------------------------------------------------------------------- date */

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const iso2 = (n: number) => String(n).padStart(2, "0");

export interface DateRead {
  iso?: string;
  text: string;
  /** A month and a year with no day. Refused, with the reason. */
  dayMissing?: true;
}

export function readDate(lower: string): DateRead | null {
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return { iso: isoMatch[0], text: isoMatch[0] };

  const monthAlt = MONTH_NAMES.map((m) => `${m}|${m.slice(0, 3)}`).join("|");
  // "15 March 2028" and "March 15, 2028" both, and the day is what separates a
  // date from a month.
  const dmy = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthAlt})\\.?\\,?\\s+(\\d{4})\\b`));
  if (dmy) {
    const month = MONTH_NAMES.findIndex((m) => m.startsWith(dmy[2]));
    return { iso: `${dmy[3]}-${iso2(month + 1)}-${iso2(Number(dmy[1]))}`, text: dmy[0] };
  }
  const mdy = lower.match(new RegExp(`\\b(${monthAlt})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\,?\\s+(\\d{4})\\b`));
  if (mdy) {
    const month = MONTH_NAMES.findIndex((m) => m.startsWith(mdy[1]));
    return { iso: `${mdy[3]}-${iso2(month + 1)}-${iso2(Number(mdy[2]))}`, text: mdy[0] };
  }
  const my = lower.match(new RegExp(`\\b(${monthAlt})\\.?\\s+(\\d{4})\\b`));
  if (my) return { text: my[0], dayMissing: true };

  return null;
}

/** "extend by 18 months" against a maturity the org staged. Derived, not
 *  invented: without a staged maturity there is nothing to extend from. */
function shiftMaturity(from: string | undefined, months: number): string | null {
  if (!from) return null;
  const m = from.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp into the target month rather than rolling into the next one: an
  // 18-month extension of the 31st must not silently become the 1st.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return `${d.getUTCFullYear()}-${iso2(d.getUTCMonth() + 1)}-${iso2(d.getUTCDate())}`;
}

/* ---------------------------------------------------------------- members */

/** HOW a member was named, because it changes what an ambiguity means.
 *  `identity` — the banker named THIS member (its label, its name, its id).
 *  `product`  — the banker named a product, which legitimately spreads across
 *               every member carrying it ("the equipment facilities").
 *  `alias`    — the banker used a nickname. It resolves to a product, so more
 *               than one match is a question rather than a selection: "the
 *               revolver" on a deal with two lines of credit names neither. */
type NameMatch = { facilities: Facility[]; how: "identity" | "product" | "alias" };

/** Words that name THIS member and no other: its own label, name and record id. */
function identityTokens(f: Facility, relationship: string): string[] {
  const out = [shortFacilityLabel(f, relationship), f.name ?? ""].map((t) => t.toLowerCase().trim()).filter(Boolean);
  if (f.loanId) out.push(f.loanId.toLowerCase());
  return [...new Set(out)];
}

function namedFacilities(lower: string, ctx: ParseContext): NameMatch {
  // IDENTITY FIRST. A line carrying "Line of Credit - $15,000,000.00" names one
  // member, and the product word inside it must not sweep in its siblings.
  const identity = ctx.facilities.filter((f) =>
    identityTokens(f, ctx.relationship).some((t) => t.length > 2 && lower.includes(t)),
  );
  if (identity.length) return { facilities: identity, how: "identity" };

  // A product word on its own ("the equipment facility") names every member of
  // that product, which is a real selection and not an ambiguity to refuse.
  // THE PRODUCT COMES OUT OF THE NAME, not out of `productType` — that field is
  // the regulatory classification ("Non-Real Estate"), and matching a banker's
  // "equipment facility" against it would never hit.
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const byProduct = ctx.facilities.filter((f) => {
    const product = facilityProduct(f, ctx.relationship).toLowerCase();
    return product.length > 3 && words.some((w) => product.includes(w));
  });
  if (byProduct.length) return { facilities: byProduct, how: "product" };

  // AND THE WORDS BANKERS ACTUALLY USE. The org's product picklist says "Line
  // of Credit"; the word "revolver" appears nowhere in the data, and it is what
  // every banker says. The keys below are the org's own picklist values (live
  // describe of LLC_BI__Loan__c.LLC_BI__Product__c, 2026-08-27), so this maps
  // vocabulary onto real products rather than inventing a product set.
  const aliased = new Set(
    Object.entries(PRODUCT_ALIASES)
      .filter(([, nicknames]) => nicknames.some((n) => wordIn(lower, n)))
      .map(([product]) => product.toLowerCase()),
  );
  return {
    facilities: aliased.size
      ? ctx.facilities.filter((f) => aliased.has(facilityProduct(f, ctx.relationship).toLowerCase()))
      : [],
    how: "alias",
  };
}

/** WHICH MEMBERS A LINE NAMED, for a refusal that can say what it DID read.
 *  "I could not read an amendment in that" is a true answer and a useless one;
 *  "I read the Line of Credit, but not what should change on it" is the same
 *  refusal with the half that landed named. */
export function membersNamedIn(text: string, ctx: ParseContext): Facility[] {
  return namedFacilities(text.toLowerCase(), ctx).facilities;
}

/** The org's own `LLC_BI__Product__c` picklist, and what bankers call each one. */
const PRODUCT_ALIASES: Record<string, string[]> = {
  "Line of Credit": ["revolver", "revolving line", "revolving facility", "operating line", "working capital line", "the line", "loc", "rcf"],
  Equipment: ["equipment line", "kit", "machinery", "tooling facility"],
  Construction: ["construction loan", "build facility"],
  Term: ["term loan"],
  Purchase: ["purchase loan", "acquisition facility"],
  HELOC: ["home equity line"],
};

function wordIn(haystack: string, needle: string): boolean {
  const at = haystack.indexOf(needle);
  if (at === -1) return false;
  const before = at === 0 ? " " : haystack[at - 1];
  const after = at + needle.length >= haystack.length ? " " : haystack[at + needle.length];
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

/* ---------------------------------------------------------- delta semantics */

const REMOVE_VERBS = /\b(remove|removing|drop|dropping|release|releasing|detach|unpledge|take\s+off|strike|cancel)\b/;
const ADD_VERBS = /\b(add|adding|pledge|pledging|impose|introduce|bring\s+in|attach|include)\b/;

/** Which way an amendment moves against the baseline. The FIELD decides where
 *  it can only be one thing (a `.remove` entry is a removal, a record entry is
 *  an add); otherwise the banker's own verb does. */
function operationFor(field: CatalogField, lower: string): AmendmentOp {
  if (field.id.endsWith(".remove") || field.id === "collateral.release") return "remove";
  if (REMOVE_VERBS.test(lower)) return field.type === "record" || field.category === "party" ? "remove" : "change";
  if (field.type === "record") return ADD_VERBS.test(lower) ? "add" : "add";
  return "change";
}

/* ---------------------------------------------------------------- parties */

/** The entity a party amendment names. Matched against the deal's own entities
 *  first; an unknown name is kept verbatim, because ADDING an entity that is not
 *  on the deal yet is exactly what the ask is. */
function readParty(text: string, ctx: ParseContext): string | undefined {
  const lower = text.toLowerCase();
  const known = [...new Set(ctx.entities.map((e) => (e.accountName ?? "").trim()).filter(Boolean))];
  const onDeal = known.find((n) => lower.includes(n.toLowerCase()));
  if (onDeal) return onDeal;

  // "add Hartwell Logistics as a guarantor" / "remove Elena Hartwell from".
  const after = text.match(
    /\b(?:add|remove|release|drop|bring\s+in|take\s+off)\b\s+(?:the\s+)?([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*(?:\s+(?:LLC|Inc\.?|Ltd\.?|LP|LLP|Corp\.?|Co\.?|Holdings|Industrial))?)/,
  );
  const candidate = after?.[1]?.trim();
  // A role word is not a name: "add a guarantor" names nobody.
  if (!candidate || /^(a|an|the|borrower|guarantor|co-borrower|entity)$/i.test(candidate)) return undefined;
  return candidate;
}

/** The borrowing-structure role the line names. Longest match first, so
 *  "limited guarantor" never reads as "guarantor". */
function readRole(lower: string): string | undefined {
  if (/\blimited guarantor\b/.test(lower)) return "Limited Guarantor";
  if (/\bco[- ]?borrower\b/.test(lower)) return "Co-Borrower";
  if (/\brelated entity\b/.test(lower)) return "Related Entity";
  if (/\bguarantor\b/.test(lower)) return "Guarantor";
  if (/\bborrower\b/.test(lower)) return "Borrower";
  return undefined;
}

/** Ownership, when the line states it: "at 40% ownership", "owns 25%". */
function readOwnership(lower: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*%\s*(?:ownership|owner|stake)?/.exec(lower);
  return m ? Number(m[1]) : undefined;
}

/* ------------------------------------------------------------------- parse */

/** Which member(s) an amendment lands on, or the question that resolves it. */
function resolveTarget(
  lower: string,
  ctx: ParseContext,
): { facilities: Facility[] } | { question: string } {
  const named = namedFacilities(lower, ctx);
  if (named.facilities.length) {
    // BOOKED AND OPEN, OR NOT AT ALL. nCino accepts a credit action only against
    // a booked facility, and the showcase Proposal member is exactly the kind of
    // row a product word would otherwise sweep up. Naming an unbookable member
    // is answered with the org's reason rather than staged and refused later.
    const bookable = named.facilities.filter((f) => ctx.booked.some((b) => b.loanId === f.loanId));
    if (!bookable.length) {
      const stages = [...new Set(named.facilities.map((f) => f.stage).filter(Boolean))];
      return {
        question: `${named.facilities.map((f) => shortFacilityLabel(f, ctx.relationship)).join(", ")} ${
          named.facilities.length === 1 ? "is" : "are"
        } ${stages.length ? `at ${stages.join(", ")}` : "not staged as booked in this read"}, and a credit action only runs against a booked facility. Nothing there can be modified.`,
      };
    }
    // A NICKNAME THAT FITS SEVERAL NAMES NONE OF THEM. "The revolver" on a deal
    // with two lines of credit is a question; "the equipment facilities" is a
    // selection, because the banker said the product.
    if (named.how === "alias" && bookable.length > 1) {
      return {
        question: `This package has ${bookable.length} of those: ${bookable
          .map((f) => shortFacilityLabel(f, ctx.relationship))
          .join(", ")}. Which one?`,
      };
    }
    return { facilities: bookable };
  }
  const focused = ctx.focus && ctx.booked.find((b) => b.loanId === ctx.focus!.loanId);
  if (focused) return { facilities: [focused] };
  if (ctx.booked.length === 1) return { facilities: ctx.booked };
  if (ctx.booked.length === 0) {
    return {
      question:
        "No booked facility is staged on this package, and a credit action only runs against a booked one. There is nothing here I can modify.",
    };
  }
  const names = ctx.booked.map((f) => shortFacilityLabel(f, ctx.relationship)).filter(Boolean);
  return {
    question: `Which member should this land on? The package has ${ctx.booked.length}: ${names.join(", ")}.`,
  };
}

/**
 * THE MEMBER'S OWN NAME IS NOT A VALUE.
 *
 * nCino names a loan "<Borrower> - <Product> - <$Amount>", so a line that names
 * the member by its label carries that member's CURRENT figure inside the name.
 * Read naively, "increase the Line of Credit - $15,000,000.00" becomes a change
 * to fifteen million — the number the facility already reads at. So the
 * identity the line matched on is removed before any value is read out of it.
 */
function scrubIdentity(text: string, facilities: Array<Facility | null>, relationship: string): string {
  let out = text;
  for (const f of facilities) {
    if (!f) continue;
    for (const token of identityTokens(f, relationship)) {
      if (token.length < 3) continue;
      const at = out.toLowerCase().indexOf(token);
      if (at >= 0) out = `${out.slice(0, at)} ${out.slice(at + token.length)}`;
    }
  }
  return out;
}

/* ----------------------------------------------------- net-new covenant read

   THE TYPE MAP IS DELIBERATELY PARTIAL. The org's catalog carries 60 covenant
   types, several with DUPLICATE names ("Minimum Working Capital" twice,
   "Minimum Times Interest Earned" twice, two distinct DSCR-with-distributions
   rows); the server refuses an ambiguous name and demands an id. So the room
   maps only banker vocabulary that lands on a UNIQUELY-NAMED catalog type, and
   everything else stays a manifest handoff — named, never guessed. */

const COVENANT_TYPE_MAP: Array<{ match: RegExp; typeName: string; defaultOp: "<=" | ">=" }> = [
  { match: /\bleverage\b/, typeName: "Leverage", defaultOp: "<=" },
  { match: /\bliquidity\b/, typeName: "Minimum Liquidity", defaultOp: ">=" },
  { match: /\b(dscr|debt service coverage)\b/, typeName: "Debt Service Coverage of Borrower", defaultOp: ">=" },
  { match: /\bdebt.to.worth\b/, typeName: "Maximum Debt to Worth", defaultOp: "<=" },
  { match: /\bcurrent ratio\b/, typeName: "Minimum Current Ratio", defaultOp: ">=" },
  { match: /\bnet worth\b/, typeName: "Net Worth", defaultOp: ">=" },
  { match: /\bebitda\b/, typeName: "EBITDA", defaultOp: ">=" },
  { match: /\bdebt.to.equity\b/, typeName: "Debt to Equity", defaultOp: "<=" },
  { match: /\bnet profit\b/, typeName: "Net Profit", defaultOp: ">=" },
];

/**
 * Reads a net-new covenant out of the line: catalog type, threshold, operator.
 * Returns null when the type is not one the map can settle (the caller keeps
 * the honest handoff), and a QUESTION when the type is known but the threshold
 * is not — the threshold IS the covenant, and the room never picks one.
 */
function readCovenant(lower: string): { value: ParsedValue } | { question: string } | null {
  const mapped = COVENANT_TYPE_MAP.find((m) => m.match.test(lower));
  if (!mapped) return null;

  // "maximum 3.5x" wording beats the type's own default; the default only
  // settles a line that states the figure bare.
  const op: "<" | "<=" | "=" | ">=" | ">" = /\b(max|maximum|no more than|not exceed|not to exceed|under|below|cap|at most)\b/.test(lower)
    ? "<="
    : /\b(min|minimum|at least|above|over|floor|no less than)\b/.test(lower)
      ? ">="
      : mapped.defaultOp;

  // A ratio covenant reads "3.5x" or "1.25x"; a dollar covenant (liquidity, net
  // worth, EBITDA) reads money. A bare number is accepted only when an operator
  // word anchors it — "max 3.5" is a threshold, a lone "3.5" is not.
  const ratio = /(\d+(?:\.\d+)?)\s*x\b/.exec(lower);
  const money = moneyTokens(lower).at(-1);
  const anchored = /(?:max(?:imum)?|min(?:imum)?|at least|at most|under|below|above|over|of|to)\s+(\d+(?:\.\d+)?)(?:\s|$|[.,;])/.exec(lower);
  const threshold = ratio ? Number(ratio[1]) : money ? money.value : anchored ? Number(anchored[1]) : null;
  if (threshold === null) {
    return {
      question:
        `What threshold should the ${mapped.typeName} covenant test? The threshold IS the covenant — say it like "maximum 3.5x" or "at least $5,000,000".`,
    };
  }

  return {
    value: {
      kind: "covenant",
      typeName: mapped.typeName,
      threshold,
      operator: op,
      text: `${mapped.typeName} ${op} ${ratio ? ratio[1] + "x" : money ? money.text : String(threshold)}`,
    },
  };
}

/** Read the value for ONE catalog field out of the line. */
function readValue(
  field: CatalogField,
  text: string,
  lower: string,
  match: CatalogMatch,
  facility: Facility | null,
): { value: ParsedValue } | { question: string } | { value: null } {
  if (field.type === "currency") {
    const tokens = moneyTokens(lower);
    if (!tokens.length) {
      // A bare number is a question, never money. This is the "increase the
      // line to 20" case, and twenty of what is the banker's to say.
      return /\bto\s+\d/.test(lower)
        ? { question: "Say the amount in full — $20,000,000 or 20 million. I will not read a bare number as money." }
        : { question: `What should ${field.label.toLowerCase()} become?` };
    }
    // "from 15 to 20 million" — the target is the one after the last "to".
    const to = lower.lastIndexOf(" to ");
    const target = (to >= 0 ? tokens.filter((t) => t.index > to) : []).at(0) ?? tokens.at(-1)!;
    return { value: { kind: "currency", amount: target.value, text: target.text } };
  }

  if (field.type === "percent" || field.type === "months" || field.type === "date") {
    if (field.id === "loan.interestRate") {
      // A SPREAD is not an absolute rate, and the tool writes an absolute rate.
      if (/\b(sofr|libor|prime|base\s+rate)\b/.test(lower)) {
        return {
          question:
            "That is a spread over an index, and the field the modification writes is an absolute rate. Give me the all-in rate as a percentage.",
        };
      }
      const pcts = percentTokens(lower);
      if (!pcts.length) return { question: "What rate should it move to? A percentage, or a move in basis points." };
      const last = pcts.at(-1)!;
      return { value: { kind: "percent", rate: last.value, text: last.text } };
    }

    if (field.type === "months") {
      const months = monthTokens(lower);
      if (!months.length) return { question: "How long — in months or years?" };
      const last = months.at(-1)!;
      return { value: { kind: "months", months: last.value, text: last.text } };
    }

    if (field.type === "date") {
      const read = readDate(lower);
      if (read?.iso) return { value: { kind: "date", iso: read.iso, text: read.text } };
      if (read?.dayMissing) {
        return { question: `${read.text} names a month. A ${field.label.toLowerCase()} is a day, and I will not pick one for you.` };
      }
      // "extend by 18 months" is a real, derivable maturity move — and ONLY a
      // maturity move. The baseline it shifts from is the member's own maturity,
      // so no other date field may borrow it (the field wave brought a second
      // one: a first payment date derived off maturity would be fiction).
      const months = monthTokens(lower);
      if (field.id === "loan.maturityDate" && months.length && /\b(extend|push|roll|out\s+by)\b/.test(lower)) {
        const shifted = shiftMaturity(facility?.maturityDate, months.at(-1)!.value);
        if (shifted) {
          return { value: { kind: "date", iso: shifted, text: `${months.at(-1)!.text} from ${facility?.maturityDate}` } };
        }
        return {
          question: "This member's maturity is not staged in the read, so there is nothing here to extend from. Give me the new maturity date.",
        };
      }
      return { question: `What should the new ${field.label.toLowerCase()} be?` };
    }

    const pcts = percentTokens(lower);
    if (pcts.length) return { value: { kind: "percent", rate: pcts.at(-1)!.value, text: pcts.at(-1)!.text } };
    return { value: null };
  }

  // A net-new covenant files (2026-08-30), so its read is exact or it is a
  // question: the type must map to the org's own catalog and the threshold must
  // be stated. A covenant the map does not know falls through to the manifest
  // handoff below — named, never guessed.
  if (field.id === "covenant.add") {
    const cov = readCovenant(lower);
    if (cov) return cov;
  }

  // A PICKLIST IS THE ORG'S OWN CLOSED SET, so the value is quoted from it or it
  // is a question. Longest value first, because "Monthly" sits inside
  // "Bi-Monthly" and the shorter read would file a schedule nobody said. The
  // scan runs on the line the branch was handed, which is the SCRUBBED one: the
  // org names a loan "<Borrower> - <Product> - <$Amount>", so an unscrubbed line
  // carries a product picklist value inside the member's own name.
  if (field.type === "picklist" && field.values?.length) {
    const said = [...field.values].sort((a, b) => b.length - a.length).find((v) => wordIn(lower, v.toLowerCase()));
    if (said) return { value: { kind: "text", text: said } };
    // A FIELD THAT FILES ASKS, and names every value it would accept. One that
    // only ever travels as a handoff keeps the banker's own words instead:
    // sending them to pick off a list and then handing the ask off regardless
    // would be a question with nothing behind it.
    if (isFileable(field)) {
      return {
        question: `${field.label} takes one of the org's own values, and I will not write one it does not hold. The org offers: ${field.values.join(", ")}.`,
      };
    }
  }

  // Everything else is spoken about rather than filed, so a scalar is optional:
  // the amendment is the ask, and the handoff carries the banker's own words.
  const money = moneyTokens(lower).at(-1);
  const pct = percentTokens(lower).at(-1);
  if (field.type === "record" || field.type === "picklist" || field.type === "text" || field.type === "number") {
    if (money && field.type !== "picklist") return { value: { kind: "currency", amount: money.value, text: money.text } };
    if (pct) return { value: { kind: "percent", rate: pct.value, text: pct.text } };
    const tail = text.slice(match.index + match.matched.length).trim();
    return tail ? { value: { kind: "text", text: tail } } : { value: null };
  }
  return { value: null };
}

/**
 * THE ONE INFERENCE, and it is over a CLOSED SET.
 *
 * Of the four changes the modification tool carries, exactly one is money. So a
 * line that ESTABLISHES a member and moves a figure "to" something has only one
 * field it can mean, and reading it as the commitment is a deduction rather than
 * a guess. Both halves are required: without a member the line names nothing,
 * and without the "to" there is no move — a figure on its own is a fact about
 * the deal, not an instruction.
 *
 * A member is established by being NAMED, or by having been picked off the
 * package strip one turn ago. "Take it to twenty million" is a complete
 * instruction when the banker has just clicked the facility it refers to, and a
 * room that answered it with "which member?" would be a room asking about the
 * thing the banker had pointed at.
 */
function inferAmount(lower: string, ctx: ParseContext): ParseOutcome | null {
  const named = namedFacilities(lower, ctx).facilities;
  const established = named.length ? named : ctx.focus ? [ctx.focus] : [];
  if (!established.length) return null;
  const scrubbed = scrubIdentity(lower, established, ctx.relationship).toLowerCase();
  const to = scrubbed.lastIndexOf(" to ");
  if (to < 0) return null;
  const target = moneyTokens(scrubbed).find((t) => t.index > to);
  if (!target) return null;
  // THROUGH THE SAME GATE as a named field: booked only, nicknames resolved.
  const resolved = resolveTarget(lower, ctx);
  if ("question" in resolved) return { kind: "clarify", question: resolved.question };
  return {
    kind: "amendments",
    amendments: resolved.facilities.map((facility) => ({
      field: FILEABLE_AMOUNT,
      facility,
      value: { kind: "currency" as const, amount: target.value, text: target.text },
      matched: target.text,
      op: "change" as const,
    })),
  };
}

/**
 * ANSWER A QUESTION THE ROOM ASKED. The field and the member are already
 * settled; all that was missing is the value, and this reads it out of a line
 * that carries nothing else. Returns null when the answer is not one either —
 * an unreadable answer is still unreadable.
 */
export function parseAnswer(
  awaiting: { field: CatalogField; facility: Facility | null },
  text: string,
): ParseOutcome | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const at: CatalogMatch = { field: awaiting.field, matched: "", index: 0 };
  const read = readValue(awaiting.field, trimmed, lower, at, awaiting.facility);
  if ("question" in read) return { kind: "clarify", question: read.question, awaiting };
  if (read.value === null) return null;
  return {
    kind: "amendments",
    amendments: [
      {
        field: awaiting.field,
        facility: awaiting.facility,
        value: read.value,
        matched: trimmed,
        op: operationFor(awaiting.field, lower),
      },
    ],
  };
}

/**
 * Read a banker's line into amendments.
 *
 * ORDER OF WORK: match the catalog, resolve the member, read the value. A miss
 * at any step is a question about THAT step rather than a silent drop, which is
 * what keeps "I did not understand" from being the only failure mode.
 */
export function parseModify(text: string, ctx: ParseContext): ParseOutcome {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "none" };
  const lower = trimmed.toLowerCase();

  const matches = matchCatalog(trimmed);
  if (!matches.length) {
    const inferred = inferAmount(lower, ctx);
    if (inferred) return inferred;
    return { kind: "none" };
  }

  const target = resolveTarget(lower, ctx);
  const amendments: Amendment[] = [];

  for (const match of matches) {
    const { field } = match;

    // Party and package amendments are not member-scoped: a guarantor joins the
    // deal, not one facility, and asking which member would be the wrong
    // question. Everything else needs a member before it needs a value.
    const memberScoped = field.category !== "party" && field.category !== "package";
    if (memberScoped && "question" in target) return { kind: "clarify", question: target.question };
    // A party amendment is deal-scoped by default, BUT a line that NAMES a member
    // binds to it — that is what makes the involvement change fileable, because
    // the org anchors every involvement row on one loan.
    const facilities =
      memberScoped && "facilities" in target
        ? target.facilities
        : field.category === "party" && "facilities" in target && target.facilities.length
          ? target.facilities
          : [null];

    // Values are read from the line WITHOUT the member's own name in it.
    const scrubbed = scrubIdentity(trimmed, facilities, ctx.relationship);
    const scrubbedLower = scrubbed.toLowerCase();
    for (const facility of facilities) {
      const at: CatalogMatch = { ...match, index: Math.max(0, scrubbedLower.indexOf(match.matched)) };
      const read = readValue(field, scrubbed, scrubbedLower, at, facility);
      if ("question" in read) return { kind: "clarify", question: read.question, awaiting: { field, facility } };
      const party = field.category === "party" ? readParty(trimmed, ctx) : undefined;
      if (field.category === "party" && !party) {
        return { kind: "clarify", question: "Which entity? Name it and I will stage the involvement." };
      }
      const role = field.category === "party" ? readRole(scrubbedLower) : undefined;
      const ownership = field.category === "party" ? readOwnership(scrubbedLower) : undefined;
      amendments.push({ field, facility, value: read.value, party, role, ownership, matched: match.matched, op: operationFor(field, lower) });
    }
  }

  return amendments.length ? { kind: "amendments", amendments } : { kind: "none" };
}
