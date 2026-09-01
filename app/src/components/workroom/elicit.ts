import type { BorrowerBundle, Covenant, Facility } from "../../data/contract";
import { isActiveFacility } from "../../data/worklist";
import type { WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE CREATE GRAMMAR - WHAT THIS CREATE STILL NEEDS.

   THE DEFECT THIS EXISTS FOR. "add another covenant to all of the loans" put a
   chip on the table reading `New covenant / not on the facility today / to all
   of the loans`. The leftover words became the covenant. A create that has not
   resolved must never reach a chip (D1), a scope word must never be narrowed to
   the focused member in silence (D2), and the sentence over the chips must never
   say the change lands somewhere the chips do not (D3).

   WHAT THIS MODULE IS. A state machine over ONE create: what the human owns,
   what has been settled, what is still missing, and the single next question -
   grounded, in the room's own vocabulary, with the answers as chips. It is
   surface-agnostic: a surface is DESCRIBED (its slots, how it reads a line, how
   it composes the sentence the parser already knows, what it cannot file) and
   the machine does the rest.

   IT PARSES NOTHING THAT MATTERS AND IT STAGES NOTHING. The sentence it composes
   goes through the SAME deterministic parser every typed line goes through, and
   the delta that comes back is VERIFIED against what was elicited before it can
   become a chip. `app/src/workroom/` is untouched by all of it: this adds no
   write arm, no wire and no field. Everything it can compose is something the
   engines already file.

   ONLY ASK FOR WHAT THE HUMAN ACTUALLY OWNS. The bank decides the test, the
   threshold, the frequency, the scope, which asset and the lien position. The
   ORG computes the advance rate, the lendable value and the compliance
   schedule, and this room never asks for those. Asking for a computed field is
   noise; inventing a decided one is a fabrication, and the threshold in
   particular comes from the approved credit agreement and from nowhere else.

   TWO PICTURES, HELD BEFORE ANYTHING IS PROPOSED OR ASKED.
     THE BOOK - what the relationship already carries. Proposals mirror it
       first, a create that duplicates it is named rather than staged blindly,
       and a question the book already answers is not asked.
     THE PLAN - what this session already staged. Nothing already on the plan is
       proposed again, and a line touching a staged entry amends THAT entry
       instead of putting a second, contradicting one beside it.
   ============================================================================= */

/* ------------------------------------------------------------- the surfaces */

/** The create surfaces this room knows. Phase 2 adds a member here and a
 *  {@link SurfaceSpec} beside it; nothing else in the machine changes. */
export type SurfaceId = "covenant" | "collateral";

/** Every slot any surface can need. A surface declares which ones it uses; the
 *  machine never invents one, and a slot no surface declares is inert. */
export type SlotId =
  | "scope"
  | "test"
  | "threshold"
  | "frequency"
  | "asset"
  | "assetKind"
  | "assetValue"
  | "lien";

/** What a create has settled so far. Every field is optional because a create
 *  arrives in pieces and the room asks for the piece it is missing. */
export interface Slots {
  /** The org catalog's own covenant type name, exactly as the book carries it. */
  test?: string;
  /**
   * HOW THE THRESHOLD IS WRITTEN, where the room can tell.
   *
   * "ratio" and "money" come from the banker's own words: an "x" or a currency
   * mark. Absent is the honest third state and it is the BOOK's state: the org
   * keeps every threshold on one numeric field with no unit beside it, so an
   * 80 on a receivables test is an 80 and printing it as "80x" would be a unit
   * this room invented.
   */
  unit?: "ratio" | "money";
  threshold?: number;
  /** The org's own schedule word: Quarterly, Monthly, Annually, One-Off. */
  frequency?: string;
  /** Where the frequency came from, so the card can say it. */
  frequencyFrom?: "said" | "book";
  /** An asset the deal already carries. The org's own record id travels. */
  assetId?: string;
  assetLabel?: string;
  /** The org's autonumber (COL-000762), which names exactly one row. */
  assetName?: string;
  /** The banker asked for a SECOND pledge of an asset already on the member. */
  second?: boolean;
  /** The asset is net-new: the whole chain has to be authored. */
  isNew?: boolean;
  assetKind?: string;
  assetValue?: number;
  assetDescription?: string;
  /** First, second, third. The bank's decision, and no wire carries it. */
  lien?: string;
}

/* ------------------------------------------------------------- the members */

/** A member, as the create grammar needs it. */
export interface ElicitMember {
  id: string;
  /** The product word. Legitimately repeats across a deal with two lines. */
  key: string;
  /** The room's own display label, with the commitment in front where the
   *  product repeats. What the banker is shown and what a chip says. */
  label: string;
  /**
   * THE ORG'S OWN LOAN NAME, and the reason it is carried.
   *
   * The parser resolves a member on the product word, so "$15.0MM Line of
   * Credit" lands on BOTH lines of credit and the shell's qualifier filter is
   * what narrows it afterwards. The org names a loan `<Borrower> - <Product> -
   * <$Amount>` and that name resolves exactly one member inside the parser
   * itself, which is what lets a composed sentence be exact rather than
   * narrowed. Null where the read carries no name; composition then falls back
   * to the label and verification catches a fan-out.
   */
  orgName: string | null;
  committed: number | null;
}

/* ---------------------------------------------------------------- the book */

export interface BookCovenant {
  /** The org catalog's own type name. */
  type: string;
  threshold: number | null;
  frequency: string | null;
  /** The facilities the covenant is attached to. */
  loanIds: string[];
  /** Attached to the relationship rather than to any facility. */
  accountLevel: boolean;
}

export interface BookAsset {
  id: string;
  label: string;
  name: string | null;
  kind: string | null;
  value: number | null;
  lien: string | null;
  /** The facilities this asset is pledged to today. */
  loanIds: string[];
}

export interface Book {
  covenants: BookCovenant[];
  assets: BookAsset[];
  /** The lien positions this relationship actually uses, most common first. */
  liens: string[];
}

export const EMPTY_BOOK: Book = { covenants: [], assets: [], liens: [] };

/**
 * THE BOOK, READ OFF THE BUNDLE THE ROOM IS ALREADY HOLDING.
 *
 * No read is issued for it. Where the room stands on no bundle the book is
 * empty, every proposal falls back to the doctrine band and every duplicate
 * check simply finds nothing - which is the channel-none doctrine applied to
 * awareness rather than a degraded mode of it.
 */
export function buildBook(bundle: BorrowerBundle | null | undefined, memberIds: string[]): Book {
  if (!bundle) return EMPTY_BOOK;
  const inScope = new Set(memberIds);

  const covenants: BookCovenant[] = [];
  for (const c of (bundle.covenants?.covenants ?? []) as Covenant[]) {
    const type = (c.covenantType ?? "").trim();
    if (!type) continue;
    const attached = c.attachedLoans;
    const loanIds = (attached ?? []).map((a) => a.loanId ?? "").filter((id) => id && inScope.has(id));
    covenants.push({
      type,
      threshold: typeof c.thresholdValue === "number" ? c.thresholdValue : null,
      frequency: (c.frequency ?? "").trim() || null,
      loanIds,
      // ABSENT AND EMPTY ARE DIFFERENT FACTS. An empty array is the org saying
      // the covenant hangs off the relationship; an absent one is a read that
      // does not carry the field, and neither may be read as the other.
      accountLevel: Array.isArray(attached) && attached.length === 0,
    });
  }

  const byId = new Map<string, BookAsset>();
  const lienCount = new Map<string, number>();
  for (const f of (bundle.exposure?.facilities ?? []) as Facility[]) {
    if (!isActiveFacility(f) || !f.loanId || !inScope.has(f.loanId)) continue;
    for (const row of f.collateral ?? []) {
      if (!row.collateralId) continue;
      const lien = (row.lienPosition ?? "").trim();
      if (lien) lienCount.set(lien, (lienCount.get(lien) ?? 0) + 1);
      const held = byId.get(row.collateralId);
      if (held) {
        held.loanIds.push(f.loanId);
        continue;
      }
      byId.set(row.collateralId, {
        id: row.collateralId,
        label: (row.collateralDescription ?? row.collateralName ?? row.collateralType ?? row.collateralId).trim(),
        name: (row.collateralName ?? "").trim() || null,
        kind: (row.collateralType ?? "").trim() || null,
        value: typeof row.collateralValue === "number" ? row.collateralValue : null,
        lien: lien || null,
        loanIds: [f.loanId],
      });
    }
  }

  return {
    covenants,
    assets: [...byId.values()],
    liens: [...lienCount.entries()].sort((a, b) => b[1] - a[1]).map(([lien]) => lien),
  };
}

/* ---------------------------------------------------------------- the plan */

/** One create this session has already put up: open on a chip, or staged on the
 *  manifest. The room reads it back rather than proposing the same thing twice. */
export interface PlanEntry {
  deltaId: string;
  surface: SurfaceId;
  memberId: string | null;
  /** What it is, in the words the plan will show. */
  title: string;
  target: string;
  slots: Slots;
  /** Still a chip waiting on a decision, rather than staged on the manifest. */
  open: boolean;
}

export interface ElicitContext {
  members: ElicitMember[];
  focused: ElicitMember | null;
  book: Book;
  plan: PlanEntry[];
  relationship: string;
}

/* --------------------------------------------------------------- the draft */

export interface Draft {
  surface: SurfaceId;
  slots: Slots;
  /** The members this create lands on. Empty until the scope is settled. */
  scope: string[];
  /** The line carried a scope word. It is honoured or it is asked about; it is
   *  never narrowed to the focused member in silence (D2). */
  scopeWord: boolean;
  /** What the opening line said that the room could not use (rule 8). */
  unused: string | null;
  /** The catalog names a line matched more than one of. The room asks which
   *  rather than filing one test as another. */
  ambiguousTests?: string[];
}

export interface Ask {
  slot: SlotId;
  text: string;
  options: Array<{ label: string; say: string }>;
}

/* ============================================================== scope reading

   A SCOPE WORD FANS OUT OR IT ASKS. It is never dropped and it is never
   narrowed to whatever member happened to be focused (D2, the founder's own
   "he said ALL of the loans; it landed silently on the focused member").

   "LOANS" IS AMBIGUOUS AND THE ROOM SAYS SO. A package carrying revolving lines
   beside term facilities is one where "all of the loans" may mean all six or
   may mean the four that are not lines, and a room that picked one reading
   would be guessing about the scope of a credit action. "Facilities", "all of
   them" and a COUNT that matches are not ambiguous, and they resolve straight
   through.                                                                   */

const ALL_WORD = /\b(all|every|each|both)\b/i;
const GENERIC_NOUN = /\b(facilit(?:y|ies)|members?|them|these|those|loans?)\b/i;
const LOAN_NOUN = /\b(loans?)\b/i;
const RELATIONSHIP_LEVEL = /\b(relationship\s+level|whole\s+relationship|account\s+level|across\s+the\s+relationship)\b/i;

const NUMBER_WORD: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, both: 2,
};

/** The count a line states about facilities, or null. */
function statedCount(line: string): number | null {
  const words = line.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|both)\b/);
  if (words) return NUMBER_WORD[words[1]];
  // A BARE DIGIT COUNTS ONLY BESIDE A FACILITY NOUN. "1.25" is a threshold and
  // "20" is a term, and reading either as a count would be the mirror of D1.
  const digits = line.toLowerCase().match(/\b(\d{1,2})\s+(?:facilit(?:y|ies)|members?|loans?|lines?)\b/);
  return digits ? Number(digits[1]) : null;
}

/** The product words this package actually uses, longest first so "line of
 *  credit" wins over "line". Derived from the members, never from a list. */
function productWords(members: ElicitMember[]): Array<{ word: string; ids: string[] }> {
  const groups = new Map<string, string[]>();
  for (const m of members) {
    const key = m.key.toLowerCase().trim();
    if (!key) continue;
    for (const word of [key, key.split(/\s+/)[0]]) {
      if (!word || word.length < 4) continue;
      const held = groups.get(word) ?? [];
      if (!held.includes(m.id)) held.push(m.id);
      groups.set(word, held);
    }
  }
  return [...groups.entries()]
    .map(([word, ids]) => ({ word, ids }))
    .sort((a, b) => b.word.length - a.word.length);
}

/** Two figures are the same figure. The room prints commitments to one decimal
 *  in millions, so "2.5M" and a $2,499,000 record are the same thing said two
 *  ways. Held to the same tolerance the qualifier filter uses. */
function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(50_000, Math.abs(b) * 0.005);
}

const MAGNITUDE: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
};

/** Every dollar figure a line carries. A figure counts as money only where it is
 *  written as money: with a currency mark, a magnitude word, or in full. */
export function moneyIn(line: string): number[] {
  const out: number[] = [];
  const re = /(\$\s*)?(\d[\d,]*(?:\.\d+)?)\s*(mm|m|k|bn|b|million|thousand|billion)?\b/gi;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const bare = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(bare)) continue;
    const suffix = (m[3] ?? "").toLowerCase();
    if (!suffix && !m[1] && !(m[2].includes(",") || bare >= 1000)) continue;
    out.push(bare * (MAGNITUDE[suffix] ?? 1));
  }
  return out;
}

export interface ScopeRead {
  ids: string[];
  /** The line carried a scope word of some kind. */
  word: boolean;
  /** The word is there and the set is not settled. The room asks. */
  ambiguous: boolean;
  /** The room said this about the reading, where the reading is worth saying. */
  said: string | null;
}

/**
 * WHICH MEMBERS THE LINE NAMES.
 *
 * Four readings, in the order they should win: a relationship-level word, a
 * dollar qualifier naming exactly one member, a product word naming a group,
 * and an all-word over a generic noun. A line naming none of them carries no
 * scope word at all, and the caller then falls back to the focused member -
 * which is the ONLY place a focus may settle a scope, and only because the line
 * asked for nothing else.
 */
export function readScope(line: string, members: ElicitMember[], claimed: number[] = []): ScopeRead {
  const none: ScopeRead = { ids: [], word: false, ambiguous: false, said: null };
  const lower = line.toLowerCase();
  if (!members.length) return none;

  if (RELATIONSHIP_LEVEL.test(lower)) {
    return { ids: [], word: true, ambiguous: true, said: null };
  }

  const all = ALL_WORD.test(lower);
  const generic = GENERIC_NOUN.test(lower);
  const count = statedCount(lower);

  /* A DOLLAR QUALIFIER NAMES ONE MEMBER, and it is the most precise thing a
     banker writes. It only counts where it matches exactly one commitment: a
     figure matching two members names neither. */
  /* A FIGURE THE CREATE ITSELF CLAIMED IS NOT A QUALIFIER. "add a minimum
     liquidity covenant of $5,000,000" on a package carrying a $5.0MM Purchase
     facility would otherwise read its own THRESHOLD as the name of a facility
     and land the covenant somewhere nobody said. Same reading the qualifier
     filter makes on the other side of the parse. */
  const figures = moneyIn(lower).filter((n) => !claimed.some((c) => sameMoney(n, c)));
  const qualified = new Set<string>();
  for (const figure of figures) {
    const hits = members.filter((m) => typeof m.committed === "number" && sameMoney(figure, m.committed));
    if (hits.length === 1) qualified.add(hits[0].id);
  }

  /* THE PRODUCT WORDS THE LINE USES, from the package's own vocabulary. */
  const products = productWords(members);
  const named = new Set<string>();
  let namedGroup: { word: string; ids: string[] } | null = null;
  for (const p of products) {
    if (!new RegExp(`\\b${p.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(lower)) continue;
    namedGroup = namedGroup ?? p;
    for (const id of p.ids) named.add(id);
  }

  // The qualifier wins over the group it sits inside: "the 2.5M line of credit"
  // names one line, not both.
  if (qualified.size === 1) {
    const id = [...qualified][0];
    const member = members.find((m) => m.id === id)!;
    return { ids: [id], word: true, ambiguous: false, said: `Reading that as the ${member.label}.` };
  }
  if (qualified.size > 1) {
    return { ids: [...qualified], word: true, ambiguous: false, said: null };
  }

  /* ALL, over a generic noun. "all six facilities", "every facility", "all of
     them". A COUNT that does not match what the room holds is not a scope: it
     is a disagreement about the package, and the room says so. */
  if (all && generic && !namedGroup) {
    if (LOAN_NOUN.test(lower) && !/\bfacilit(?:y|ies)\b/i.test(lower) && hasLines(members)) {
      // "all of the loans" on a package that also carries lines. Ambiguous by
      // construction, and the founder's own worked line.
      return { ids: [], word: true, ambiguous: true, said: null };
    }
    if (count !== null && count !== members.length) {
      return { ids: [], word: true, ambiguous: true, said: null };
    }
    return { ids: members.map((m) => m.id), word: true, ambiguous: false, said: null };
  }

  /* A PRODUCT GROUP. "both lines", "the two equipment loans", "the lines of
     credit". A stated count that contradicts the group is asked about. */
  if (namedGroup) {
    const ids = namedGroup.ids;
    if (count !== null && count !== ids.length) {
      return { ids: [], word: true, ambiguous: true, said: null };
    }
    // A single product word matching several members, with no count and no
    // all-word, names a PRODUCT rather than a facility. That is exactly the
    // silent fan-out the room was fixed for, so it asks.
    if (ids.length > 1 && !all && count === null) {
      return { ids: [], word: true, ambiguous: true, said: null };
    }
    return { ids, word: true, ambiguous: false, said: null };
  }

  if (all || (count !== null && generic)) {
    if (count !== null && count === members.length) {
      return { ids: members.map((m) => m.id), word: true, ambiguous: false, said: null };
    }
    return { ids: [], word: true, ambiguous: true, said: null };
  }

  return none;
}

/** The package carries a revolving line beside something that is not one. */
function hasLines(members: ElicitMember[]): boolean {
  const lines = members.filter((m) => /\bline\b/i.test(m.key));
  return lines.length > 0 && lines.length < members.length;
}

/** The scope question, with the package's own groups as the answers. */
function scopeAsk(ctx: ElicitContext): Ask {
  const groups = new Map<string, string[]>();
  for (const m of ctx.members) {
    const held = groups.get(m.key) ?? [];
    held.push(m.id);
    groups.set(m.key, held);
  }
  const options: Array<{ label: string; say: string }> = [
    { label: `All ${ctx.members.length}`, say: `all ${ctx.members.length} facilities` },
  ];
  for (const [key, ids] of groups) {
    if (ids.length < 2) continue;
    options.push({
      label: `The ${ids.length} ${key} facilities`,
      say: `all ${ids.length} ${key.toLowerCase()} facilities`,
    });
  }
  for (const m of ctx.members) options.push({ label: m.label, say: `the ${m.orgName ?? m.label}` });
  return {
    slot: "scope",
    text:
      `${count(ctx.members.length)} ${ctx.members.length === 1 ? "facility" : "facilities"} on this package. ` +
      "Which of them should this land on?",
    options,
  };
}

const COUNT_WORDS = ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const count = (n: number) => COUNT_WORDS[n] ?? String(n);

/* ======================================================= the covenant surface

   THE HUMAN SUPPLIES the test, the threshold, the frequency and the scope. The
   ORG fixes the effective date at creation and owns the compliance schedule.
   THE THRESHOLD IS NEVER INVENTED: it comes from the approved credit agreement,
   and the most the room does is PROPOSE - labelled as a proposal - what this
   relationship already tests, or the band the bank typically writes.

   AN ADD IS SAFE AND AN AMEND IS NOT. The junction fields are non-updateable,
   so a covenant is right at creation or it is wrong forever. That is the whole
   reason a hollow covenant must never stage.                                 */

/** The bands a credit officer would quote, and they are QUOTED, never applied.
 *  No entry here ever becomes a threshold: it is the sentence the room says
 *  while asking the banker for the figure the credit agreement carries. */
const DOCTRINE_BAND: Array<{ match: RegExp; band: string }> = [
  { match: /debt service coverage|dscr/i, band: "banks typically write debt service coverage between 1.20x and 1.25x" },
  { match: /fixed charge|fccr/i, band: "banks typically write fixed charge coverage between 1.15x and 1.25x" },
  { match: /debt to worth|leverage|debt.to.net worth|tnw/i, band: "banks typically cap debt to tangible net worth at 3.00x" },
];

const COVENANT_OPENS =
  /\b(add|create|put|impose|include|attach|set\s+up|write)\b[^.]{0,40}\b(covenants?|tests?)\b|\b(covenants?)\b[^.]{0,20}\b(add|create)\b/i;

/** Reading verbs. "waive the covenant" and "drop the covenant" are not creates,
 *  and neither is a question the read card already answers. */
const NOT_A_CREATE = /\b(waive|waived|drop|remove|delete|release|reset|assess|review|value|show|list|what|which)\b/i;

const FREQUENCIES = ["Quarterly", "Monthly", "Annually", "Semi-Annually", "One-Off"];

const FREQUENCY_WORDS: Array<{ match: RegExp; word: string }> = [
  { match: /\bquarterly|each quarter|every quarter\b/i, word: "Quarterly" },
  { match: /\bmonthly|each month|every month\b/i, word: "Monthly" },
  { match: /\bsemi[- ]?annual(?:ly)?|half[- ]?yearly\b/i, word: "Semi-Annually" },
  { match: /\bannual(?:ly)?|yearly|each year|every year\b/i, word: "Annually" },
  { match: /\bone[- ]?off|once\b/i, word: "One-Off" },
];

/**
 * THE ONE SCHEDULE THE MODIFICATION WIRE WRITES.
 *
 * `covenantAddsJson` files every covenant on the quarterly schedule; there is no
 * frequency input on it. A room that took "tested monthly" and filed a quarterly
 * test would be putting a figure on the glass the org would not receive, which
 * is the fabrication this whole grammar exists to prevent. So the frequency is
 * asked for, and a schedule the wire cannot carry is named as a gap rather than
 * quietly rounded to the one it can.
 */
export const WIRED_FREQUENCY = "Quarterly";

function readFrequency(line: string): string | null {
  for (const f of FREQUENCY_WORDS) if (f.match.test(line)) return f.word;
  return null;
}

/** The threshold a line states, in the unit the line stated it in. A bare
 *  number is a threshold only where an anchor word puts it there: a lone "1.25"
 *  beside a facility is a figure about the deal, not an instruction, and the
 *  unit is left ABSENT rather than assumed. */
function readThreshold(line: string): { value: number; unit?: "ratio" | "money" } | null {
  const lower = line.toLowerCase();
  const ratio = /(\d+(?:\.\d+)?)\s*x\b/.exec(lower);
  if (ratio) return { value: Number(ratio[1]), unit: "ratio" };
  const money = moneyIn(lower);
  if (money.length === 1) return { value: money[0], unit: "money" };
  const anchored = /\b(?:max(?:imum)?|min(?:imum)?|at least|at most|no more than|no less than|of|to|above|below|over|under)\s+(\d+(?:\.\d+)?)\b/.exec(lower);
  return anchored ? { value: Number(anchored[1]) } : null;
}

/** The covenant type the line names, out of the org's own catalog as the book
 *  carries it. Longest name first, so a specific test beats a generic one. */
function readTest(line: string, book: Book): { type: string } | { ambiguous: string[] } | null {
  const lower = ` ${line.toLowerCase()} `;
  const exact = [...book.covenants]
    .sort((a, b) => b.type.length - a.type.length)
    .find((c) => lower.includes(` ${c.type.toLowerCase()} `) || lower.includes(`${c.type.toLowerCase()} covenant`));
  if (exact) return { type: exact.type };

  /* A BANKER'S SHORTHAND. "dscr" names a FAMILY, and this book carries two
     tests in that family, so the shorthand resolves to a question rather than
     to whichever one sorted first. */
  const SHORTHAND: Array<{ match: RegExp; family: RegExp }> = [
    { match: /\b(dscr|debt service coverage|debt service)\b/i, family: /debt service coverage/i },
    { match: /\b(liquidity)\b/i, family: /liquidity/i },
    { match: /\b(leverage|debt to worth|debt.to.net worth|tnw)\b/i, family: /debt to worth|leverage/i },
    { match: /\b(current ratio)\b/i, family: /current ratio/i },
    { match: /\b(net worth)\b/i, family: /net worth/i },
    { match: /\b(fixed charge|fccr)\b/i, family: /fixed charge/i },
  ];
  for (const s of SHORTHAND) {
    if (!s.match.test(line)) continue;
    const hits = book.covenants.filter((c) => s.family.test(c.type));
    const names = [...new Set(hits.map((h) => h.type))];
    if (names.length === 1) return { type: names[0] };
    if (names.length > 1) return { ambiguous: names };
  }
  return null;
}

/* ===================================================== the collateral surface

   THE HUMAN SUPPLIES which asset - or, for a net-new one, its description, kind
   and value - and the lien position. THE ORG RESOLVES THE ADVANCE RATE AND THE
   LENDABLE VALUE IN-TRANSACTION and this room does not ask for either: the
   advance rate on the pledge is a formula with an override, the lendable value
   is derived from it, and asking a banker to type a number the org computes is
   noise dressed as diligence.                                                */

const COLLATERAL_OPENS =
  /\b(pledge|add|attach|take\s+security|secure)\b[^.]{0,40}\b(collateral|security|asset|lien|receivables?|inventory|equipment|machinery|real\s*estate|warehouse|property|vehicles?|deposits?)\b|\bpledge\b/i;

const LIEN_WORDS: Array<{ match: RegExp; word: string }> = [
  { match: /\b(first|1st)\b/i, word: "1st" },
  { match: /\b(second|2nd)\b/i, word: "2nd" },
  { match: /\b(third|3rd)\b/i, word: "3rd" },
];

const LIEN_OPTIONS = ["1st", "2nd", "3rd"];

/** Words that name no asset in particular, so a hit on one proves nothing. */
const ASSET_STOP = new Set([
  "the", "and", "for", "all", "llc", "inc", "collateral", "asset", "assets", "value", "loan", "pledge", "with",
  "present", "future", "over", "per", "cap", "from", "that", "this", "under", "into", "onto", "position", "lien",
]);

/** The assets a line could mean, best match first. An exact autonumber or record
 *  id names one row and settles it; otherwise the distinctive words of each
 *  label are counted and only the top score survives. */
function matchAsset(line: string, assets: BookAsset[]): BookAsset[] {
  const lower = line.toLowerCase();
  const scored: Array<{ a: BookAsset; score: number }> = [];
  for (const a of assets) {
    if (lower.includes(a.id.toLowerCase())) return [a];
    if (a.name && a.name.length > 3 && lower.includes(a.name.toLowerCase())) return [a];
    const tokens = [...new Set(`${a.label} ${a.kind ?? ""}`.toLowerCase().split(/[^a-z0-9]+/))].filter(
      (t) => t.length > 3 && !ASSET_STOP.has(t),
    );
    const score = tokens.filter((t) => lower.includes(t)).length;
    if (score) scored.push({ a, score });
  }
  if (!scored.length) return [];
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === top).map((s) => s.a);
}

const NEW_ASSET = /\b(new|newly|another|additional|just\s+(?:bought|financed)|not\s+on\s+the\s+deal)\b/i;

const ASSET_KINDS: Array<{ match: RegExp; word: string }> = [
  { match: /\b(equipment|machine|machines|machinery|tooling|press|lathe|cnc|forklift)\b/i, word: "Equipment" },
  { match: /\b(warehouse|building|plant|premises|real\s*estate|property|land)\b/i, word: "Real Estate" },
  { match: /\b(inventory|raw\s+materials?|finished\s+goods)\b/i, word: "Inventory" },
  { match: /\b(receivables?|accounts\s+receivable|a\/r)\b/i, word: "Accounts Receivable" },
  { match: /\b(vehicles?|trucks?|trailers?|fleet)\b/i, word: "Vehicle" },
  { match: /\b(securities|deposits?|certificate\s+of\s+deposit)\b/i, word: "Cash" },
];

const ASSET_KIND_OPTIONS = ["Equipment", "Real estate", "Inventory", "Accounts receivable", "Vehicles", "Securities"];

/* ========================================================== opening a create */

/**
 * WHICH CREATE THIS LINE OPENS, with everything it already carries read into it.
 *
 * Null is the common case and it is not a failure: the line is not a create,
 * and the room's existing lanes take it exactly as they always have.
 */
export function openCreate(line: string, ctx: ElicitContext): Draft | null {
  const text = line.trim();
  if (!text) return null;

  const surface: SurfaceId | null = COVENANT_OPENS.test(text)
    ? "covenant"
    : COLLATERAL_OPENS.test(text)
      ? "collateral"
      : null;
  if (!surface) return null;
  // A REMOVAL IS NOT A CREATE, and neither is a question. Both have lanes of
  // their own and both would be ruined by being gathered for.
  if (NOT_A_CREATE.test(text) && !/\bsecond\b/i.test(text)) return null;

  const draft: Draft = { surface, slots: {}, scope: [], scopeWord: false, unused: null };
  return readInto(draft, text, ctx, { opening: true });
}

/* ============================================================ reading a line */

/**
 * EVERYTHING THIS LINE SETTLES, folded onto what the draft already holds.
 *
 * FREE TEXT ALWAYS WINS. The room asks one question at a time and offers chips,
 * and a banker who types the whole answer skips every one of them: this reads
 * the line for EVERY slot the surface takes, not only for the one just asked.
 */
export function readInto(draft: Draft, line: string, ctx: ElicitContext, opts: { opening?: boolean } = {}): Draft {
  const next: Draft = { ...draft, slots: { ...draft.slots }, scope: [...draft.scope] };
  const text = line.trim();
  /** The figures this create claimed for itself. Never read as a facility. */
  const claimed: number[] = [];

  if (next.surface === "covenant") {
    const test = readTest(text, ctx.book);
    if (test && "type" in test) {
      next.slots.test = test.type;
      next.ambiguousTests = undefined;
    } else if (test && "ambiguous" in test) {
      /* THE CATALOG CARRIES THE FAMILY TWICE. "dscr" on this book names two
         different tests, and the parser under this room resolves both to the
         first one it matches, so a room that picked would file one test as
         another. It asks instead, with the catalog's own two names. */
      next.ambiguousTests = test.ambiguous;
    }
    const threshold = readThreshold(text);
    if (threshold) {
      next.slots.threshold = threshold.value;
      if (threshold.unit) next.slots.unit = threshold.unit;
      if (threshold.unit === "money") claimed.push(threshold.value);
    }
    const frequency = readFrequency(text);
    if (frequency) {
      next.slots.frequency = frequency;
      next.slots.frequencyFrom = "said";
    }
  }

  if (/\bsecond\b/i.test(text)) next.slots.second = true;

  if (next.surface === "collateral") {
    /* THE BANKER CAME BACK TO WHAT THE DEAL ALREADY HOLDS. A net-new asset is
       the one shape this room cannot compose on its own, so the way back out of
       it has to exist and has to be explicit. */
    if (/\bexisting\b|\balready carries\b|\bon the deal\b/i.test(text)) delete next.slots.isNew;
    else if (NEW_ASSET.test(text) && !next.slots.second) next.slots.isNew = true;
    if (!next.slots.isNew) {
      const hits = matchAsset(text, ctx.book.assets);
      if (hits.length === 1) {
        next.slots.assetId = hits[0].id;
        next.slots.assetLabel = hits[0].label;
        next.slots.assetName = hits[0].name ?? undefined;
        if (hits[0].lien && next.slots.lien === undefined) next.slots.lien = hits[0].lien;
      }
    }
    if (next.slots.isNew) {
      const kind = ASSET_KINDS.find((k) => k.match.test(text));
      if (kind) next.slots.assetKind = kind.word;
      const money = moneyIn(text);
      if (money.length) {
        next.slots.assetValue = money[money.length - 1];
        claimed.push(money[money.length - 1]);
      }
    }
    const lien = LIEN_WORDS.find((l) => l.match.test(text));
    if (lien) next.slots.lien = lien.word;
  }

  /* ---- the scope, LAST, so the create's own figures cannot be mistaken for a
          facility. A scope word is honoured or asked about, never narrowed. */
  const scope = readScope(text, ctx.members, claimed);
  if (scope.word) {
    next.scopeWord = true;
    next.scope = scope.ids;
  } else if (opts.opening && ctx.focused) {
    // NO SCOPE WORD AT ALL. The focused member is the answer to "which one?"
    // for a line that asked nothing else, and only for such a line.
    next.scope = [ctx.focused.id];
  }

  return next;
}

/* ================================================== the one question, grounded

   OFFER BEFORE ASKING, AND SAY WHERE THE ANSWER COMES FROM. Every proposal is
   grounded in this relationship FIRST - what the book already tests, what the
   deal already pledges - then in the org's own catalog, and only then in the
   doctrine band, which is quoted as guidance and never applied as a value.  */

export function nextAsk(draft: Draft, ctx: ElicitContext): Ask | null {
  /* THE SCOPE WORD IS ANSWERED FIRST WHERE IT IS THE THING IN DOUBT. The
     founder's own line opens on one: "add another covenant to all of the loans"
     is a question about WHICH FACILITIES before it is a question about which
     test, and a room that asked for the threshold first would have parked the
     word it could not read. Where the line carried no scope word the scope is
     the LAST question, because by then the room can say what it is scoping. */
  if (draft.scopeWord && !draft.scope.length) return scopeAskFor(draft, ctx);
  if (draft.surface === "covenant") return covenantAsk(draft, ctx);
  return collateralAsk(draft, ctx);
}

/**
 * WHAT THE BOOK ALREADY ANSWERS, TAKEN FROM THE BOOK.
 *
 * Streamlined means fewer GESTURES, not fewer facts. A relationship that tests
 * this covenant on one schedule everywhere it carries it has already answered
 * "how often", so the room takes the answer instead of asking for it - and the
 * card says where it came from, because a fact taken silently is indistinguish-
 * able from one invented. The threshold and the scope are never settled here:
 * those are the banker's, and awareness is never spent on skipping a decision.
 */
export function settleFromBook(draft: Draft, ctx: ElicitContext): Draft {
  if (draft.surface !== "covenant" || !draft.slots.test || draft.slots.frequency) return draft;
  const schedules = [
    ...new Set(ctx.book.covenants.filter((c) => c.type === draft.slots.test).map((c) => c.frequency).filter((f): f is string => Boolean(f))),
  ];
  if (schedules.length !== 1) return draft;
  return { ...draft, slots: { ...draft.slots, frequency: schedules[0], frequencyFrom: "book" } };
}

/** The draft with everything the book settles folded in, and the one question
 *  that is left. `ask` null means the create is complete and can be composed. */
export function advance(draft: Draft, ctx: ElicitContext): { draft: Draft; ask: Ask | null } {
  const settled = settleFromBook(draft, ctx);
  return { draft: settled, ask: nextAsk(settled, ctx) };
}

function covenantAsk(draft: Draft, ctx: ElicitContext): Ask | null {
  const s = draft.slots;

  /* THE FAMILY NAMES TWO TESTS. The catalog carries "Debt Service Coverage of
     Borrower" and "Debt Service Coverage with and without Distributions", and a
     banker who writes "DSCR" has named the family rather than the test. Saying
     one when the covenant means the other is a classic memo failure, and it is
     unrecoverable here: covenant AMEND is refused outright, so a covenant is
     right at creation or it is wrong forever. */
  if (!s.test && draft.ambiguousTests?.length) {
    return {
      slot: "test",
      text: `The bank's catalog carries ${count(draft.ambiguousTests.length).toLowerCase()} tests in that family, and they are not the same test. Which one?`,
      options: draft.ambiguousTests.map((name) => ({ label: name, say: `a ${name} covenant` })),
    };
  }

  if (!s.test) {
    /* MIRROR THE BOOK FIRST. What this relationship already tests is the
       grounded proposal, it carries its own threshold and its own schedule, and
       taking one is a single gesture that settles three slots. */
    const mirrors = mirrorChips(ctx.book);
    return {
      slot: "test",
      text:
        "To file one I need the test, the threshold and how often it is tested. " +
        (mirrors.length
          ? `This relationship already runs ${sentenceList(mirrors.map((m) => m.what))}. I can mirror one of those, or take new terms from the approved credit agreement. I will not set a threshold myself.`
          : "The approved credit agreement is the authority on all three, and I will not set a threshold myself. Name the test and I will take it from there."),
      options: [...mirrors.map((m) => ({ label: m.label, say: m.say })), { label: "A different test", say: "a different test" }],
    };
  }

  if (s.threshold === undefined) {
    const band = DOCTRINE_BAND.find((b) => b.match.test(s.test!));
    const held = ctx.book.covenants.filter((c) => c.type === s.test && typeof c.threshold === "number");
    return {
      slot: "threshold",
      text:
        `What should the ${s.test} test be set at? The threshold IS the covenant and it comes from the approved credit agreement, so I will not pick one. ` +
        (held.length
          ? `This relationship carries it at ${thresholdText(held[0].threshold!)} today.`
          : band
            ? `As a band rather than a figure: ${band.band}.`
            : "Say it the way the agreement writes it."),
      options: held.length
        ? [{ label: `Keep it at ${thresholdText(held[0].threshold!)}`, say: `of ${thresholdText(held[0].threshold!)}` }]
        : [],
    };
  }

  if (!s.frequency) {
    /* WHERE THE BOOK ANSWERS IT, THE ROOM DOES NOT ASK. A relationship that
       tests this covenant on one schedule everywhere it carries it has already
       answered the question, and the card says where the answer came from. */
    const schedules = [...new Set(ctx.book.covenants.filter((c) => c.type === s.test).map((c) => c.frequency).filter(Boolean))];
    if (schedules.length === 1) {
      // Settled from the book. Not an ask.
      return null;
    }
    const seen = [...new Set(ctx.book.covenants.map((c) => c.frequency).filter((f): f is string => Boolean(f)))];
    const offered = seen.length ? seen : FREQUENCIES;
    return {
      slot: "frequency",
      text: `How often is the ${s.test} test measured?`,
      options: offered.map((f) => ({ label: f, say: `tested ${f.toLowerCase()}` })),
    };
  }

  if (!draft.scope.length) return scopeAskFor(draft, ctx);
  return null;
}

function collateralAsk(draft: Draft, ctx: ElicitContext): Ask | null {
  const s = draft.slots;

  if (!s.assetId && !s.isNew) {
    const assets = ctx.book.assets;
    return {
      slot: "asset",
      text: assets.length
        ? `Which asset? The deal already carries ${count(assets.length).toLowerCase()}, and a pledge sends the bank's own record rather than a name, so I will not choose between them.`
        : "This read carries no collateral on the deal, so there is nothing here to pledge by name. Say it is a new asset and what it is.",
      options: [...assets.map((a) => ({ label: shortLabel(a), say: `pledge ${a.name ?? a.id}` })), { label: "A new asset", say: "a new asset" }],
    };
  }

  if (s.isNew) {
    if (!s.assetKind) {
      return {
        slot: "assetKind",
        text: "What kind of asset is it? The bank keeps its own collateral-type catalog and resolves the word against it, so I will not invent a type.",
        options: ASSET_KIND_OPTIONS.map((k) => ({ label: k, say: `a new ${k.toLowerCase()} asset` })),
      };
    }
    if (s.assetValue === undefined) {
      return {
        slot: "assetValue",
        text: "What is it worth? Say it in full, $2,000,000 or 2 million; I will not read a bare number as money. What the bank will lend against it is the org's to work out, not yours to type.",
        options: [],
      };
    }
  }

  if (!s.lien) {
    const held = ctx.book.liens;
    const offered = held.length ? [...new Set([...held, ...LIEN_OPTIONS])] : LIEN_OPTIONS;
    return {
      slot: "lien",
      text:
        "What lien position does the bank take on it?" +
        (held.length === 1 ? ` Every pledge on this relationship sits at ${held[0]} today.` : ""),
      options: offered.map((l) => ({ label: `${l} position`, say: `${l} lien position` })),
    };
  }

  if (!draft.scope.length) return scopeAskFor(draft, ctx);
  return null;
}

function scopeAskFor(draft: Draft, ctx: ElicitContext): Ask {
  const ask = scopeAsk(ctx);
  if (!draft.scopeWord) return ask;
  /* THE SCOPE WORD IS THERE AND THE SET IS NOT SETTLED. The room says the word
     back rather than dropping it, which is the whole of D2. */
  return {
    ...ask,
    text: `${count(ctx.members.length)} facilities on this package, and more than one reading of that. Which of them should this land on?`,
  };
}

/**
 * THE FAMILIES THE BANK'S OWN CATALOG SETTLES FROM A SENTENCE.
 *
 * A HINT, NEVER AN AUTHORITY. The catalog resolution lives in the fenced
 * parser and this is a shell-side reading of which of the book's own tests are
 * worth OFFERING: a chip that leads to "the catalog did not settle on that" is
 * a wasted gesture. Getting the hint wrong costs a gesture and never costs
 * correctness, because every composed sentence is verified afterwards anyway.
 * `elicit.test.ts` drives every offered mirror through the real engine, so a
 * change in the catalog map breaks a test rather than a demo.
 */
const CATALOG_FAMILIES =
  /leverage|liquidity|debt service coverage|debt.to.worth|current ratio|net worth|ebitda|debt.to.equity|net profit/i;

/** What the relationship already tests, as chips that carry their own terms. */
export function mirrorChips(book: Book): Array<{ what: string; label: string; say: string }> {
  const out: Array<{ what: string; label: string; say: string }> = [];
  const seen = new Set<string>();
  for (const c of book.covenants) {
    if (seen.has(c.type) || typeof c.threshold !== "number" || !c.frequency) continue;
    if (!CATALOG_FAMILIES.test(c.type)) continue;
    seen.add(c.type);
    const threshold = thresholdText(c.threshold);
    out.push({
      what: `${c.type} ${c.frequency.toLowerCase()}`,
      label: `${c.type} at ${threshold}`,
      say: `a ${c.type} covenant of ${threshold} tested ${c.frequency.toLowerCase()}`,
    });
    if (out.length === 4) break;
  }
  return out;
}

/**
 * THE THRESHOLD, IN THE UNIT IT WAS ACTUALLY GIVEN IN.
 *
 * An absent unit prints the bare figure. That is not a gap: the org stores no
 * unit beside a covenant threshold, so a book-derived 80 on a receivables test
 * prints as 80, and printing it as "80x" or "$80" would be this room asserting
 * something nobody wrote down.
 */
export function thresholdText(value: number, unit?: "ratio" | "money"): string {
  if (unit === "ratio") return `${value}x`;
  if (unit === "money") return `$${value.toLocaleString("en-US")}`;
  // Separators are formatting, not a claim: 5000000 and 5,000,000 are the same
  // figure, and only one of them can be read at a glance.
  return value.toLocaleString("en-US");
}

const shortLabel = (a: BookAsset) => (a.label.length > 44 ? `${a.label.slice(0, 42).trim()}...` : a.label);

function sentenceList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/* ============================================== what the room already knows

   THE BOOK AND THE PLAN, READ BACK BEFORE ANYTHING IS PUT UP. A create that
   duplicates what the relationship already carries is NAMED, and a create
   already on this session's plan is not proposed a second time.             */

export interface Awareness {
  /** What the book already carries that makes this create a duplicate. */
  onTheBook: string | null;
  /** What this session already put up that makes it a duplicate. */
  onThePlan: string | null;
  /** The members this create can still land on. */
  fresh: string[];
  /** The chips the room offers instead of staging a duplicate blindly. */
  options: Array<{ label: string; say: string }>;
}

export function awarenessFor(draft: Draft, ctx: ElicitContext): Awareness {
  const label = (id: string) => ctx.members.find((m) => m.id === id)?.label ?? id;
  const none: Awareness = { onTheBook: null, onThePlan: null, fresh: draft.scope, options: [] };

  if (draft.surface === "covenant" && draft.slots.test) {
    const already = ctx.book.covenants.filter((c) => c.type === draft.slots.test);
    const accountLevel = already.find((c) => c.accountLevel);
    const onBook = draft.slots.second ? [] : draft.scope.filter((id) => already.some((c) => c.loanIds.includes(id)));
    const staged = ctx.plan.filter(
      (p) => p.surface === "covenant" && p.slots.test === draft.slots.test && p.memberId && draft.scope.includes(p.memberId),
    );
    const onPlan = staged.map((p) => p.memberId!).filter((id, i, all) => all.indexOf(id) === i);
    const blocked = new Set([...onBook, ...onPlan]);
    const fresh = draft.scope.filter((id) => !blocked.has(id));
    return {
      onTheBook: accountLevel && !draft.slots.second
        ? `${draft.slots.test} already runs at the relationship level on this book${accountLevel.threshold !== null ? ` at ${thresholdText(accountLevel.threshold)}` : ""}${accountLevel.frequency ? `, tested ${accountLevel.frequency.toLowerCase()}` : ""}, so it already reaches every facility on the package.`
        : onBook.length
          ? `${draft.slots.test} is already on ${sentenceList(onBook.map(label))}, and a modification carries it onto the clone.`
          : null,
      onThePlan: onPlan.length ? `${draft.slots.test} is already on this plan for ${sentenceList(onPlan.map(label))}.` : null,
      fresh: accountLevel && !draft.slots.second ? [] : fresh,
      options:
        (accountLevel && !draft.slots.second) || onBook.length || onPlan.length
          ? [
              { label: "Put a second one on the facility", say: `add a second ${draft.slots.test} covenant` },
              { label: "A different test", say: "a different test" },
            ]
          : [],
    };
  }

  if (draft.surface === "collateral" && draft.slots.assetId) {
    const asset = ctx.book.assets.find((a) => a.id === draft.slots.assetId);
    const onBook = draft.slots.second ? [] : draft.scope.filter((id) => asset?.loanIds.includes(id));
    const staged = ctx.plan.filter(
      (p) => p.surface === "collateral" && p.slots.assetId === draft.slots.assetId && p.memberId && draft.scope.includes(p.memberId),
    );
    const onPlan = staged.map((p) => p.memberId!).filter((id, i, all) => all.indexOf(id) === i);
    const blocked = new Set([...onBook, ...onPlan]);
    return {
      onTheBook: onBook.length
        ? `${shortLabel(asset!)} is already pledged to ${sentenceList(onBook.map(label))}, and a modification carries the pledge onto the clone.`
        : null,
      onThePlan: onPlan.length ? `That pledge is already on this plan for ${sentenceList(onPlan.map(label))}.` : null,
      fresh: draft.scope.filter((id) => !blocked.has(id)),
      options:
        onBook.length || onPlan.length
          ? [
              { label: "Add a second", say: `add a second pledge of ${draft.slots.assetName ?? draft.slots.assetId}` },
              { label: "A different facility", say: "a different facility" },
            ]
          : [],
    };
  }

  return none;
}

/* ================================================================= composing

   THE SENTENCE THE PARSER ALREADY KNOWS. Nothing here is a new write path: the
   composed line goes through `parseIntent` exactly as a typed one does, and the
   delta that comes back is verified against what was elicited before it is
   allowed to become a chip.

   THE MEMBER IS NAMED BY THE ORG'S OWN LOAN NAME. A product word lands on every
   facility of that product - proven twice in the drive and again here - so the
   composed sentence uses the name the org gives the loan, which resolves one
   member inside the parser rather than relying on a filter afterwards.

   THE FACILITY COMES FIRST AND THE FIGURE COMES LAST. The covenant reader takes
   the LAST money token in the line as the threshold, so a sentence ending in the
   facility's own commitment would file the facility's size as the covenant. */

export interface ComposedLine {
  memberId: string;
  say: string;
}

export interface Composition {
  lines: ComposedLine[];
  /** What a complete create still cannot file, named rather than dropped. */
  gaps: string[];
  /** The room's own sentence over the chips. */
  lede: string;
}

export function compose(draft: Draft, ctx: ElicitContext): Composition {
  const member = (id: string) => ctx.members.find((m) => m.id === id)!;
  const target = (id: string) => member(id).orgName ?? member(id).label;
  const lines: ComposedLine[] = [];
  const gaps: string[] = [];
  const s = draft.slots;

  if (draft.surface === "covenant") {
    const threshold = thresholdText(s.threshold!, s.unit);
    for (const id of draft.scope) {
      lines.push({ memberId: id, say: `on the ${target(id)} add a ${s.test!.toLowerCase()} covenant of ${threshold}` });
    }
    if (s.frequency && s.frequency !== WIRED_FREQUENCY) {
      gaps.push(
        `A ${s.frequency.toLowerCase()} schedule. The modification files a new covenant on the ${WIRED_FREQUENCY.toLowerCase()} schedule and carries no other, so the ${s.frequency.toLowerCase()} test is recorded on the plan for the credit file and is not written to the bank's systems.`,
      );
    }
    return {
      lines,
      gaps,
      lede: `${s.test} of ${threshold}, tested ${(s.frequency ?? WIRED_FREQUENCY).toLowerCase()}${s.frequencyFrom === "book" ? " as this relationship already tests it" : ""}, on ${sentenceList(draft.scope.map((id) => member(id).label))}. The effective date is set once when it is created and never updated afterwards.`,
    };
  }

  for (const id of draft.scope) {
    const lead = s.second ? "add a second pledge of" : "pledge";
    lines.push({ memberId: id, say: `${lead} ${s.assetName ?? s.assetId} to the ${target(id)}` });
  }
  if (s.lien) {
    gaps.push(
      `The ${s.lien} lien position. No deployed write carries a lien position onto a pledge, so it is recorded on the plan for the credit file rather than written to the bank's systems.`,
    );
  }
  const asset = ctx.book.assets.find((a) => a.id === s.assetId);
  const lien = s.lien
    ? ` at ${s.lien} position${asset?.lien === s.lien ? ", as the deal already holds it" : ""}`
    : "";
  return {
    lines,
    gaps,
    lede:
      `Pledging ${shortLabel(asset ?? ({ label: s.assetLabel ?? "the asset" } as BookAsset))}` +
      `${lien} to ${sentenceList(draft.scope.map((id) => member(id).label))}. ` +
      "What the bank will lend against it is worked out when the change is filed, so there is no advance rate for you to set here.",
  };
}

/**
 * THE CREATE THAT CANNOT BE COMPOSED AT ALL, named.
 *
 * A net-new asset needs an advance rate on the pledge, which is a credit
 * decision on something the bank has never lent against. The room will not set
 * one and the doctrine forbids asking for it as if it were routine, so this is
 * said BY NAME after everything else is gathered rather than guessed at.
 */
export function blockedReason(draft: Draft): string | null {
  if (draft.surface === "collateral" && draft.slots.isNew) {
    return (
      "Creating an asset the bank has never lent against and pledging it needs an advance rate recorded on the pledge, and that is a credit decision out of the approved credit terms rather than something I will set. " +
      "I can pledge an existing asset the deal already carries, or you can give me the rate the credit terms carry and I will compose the whole chain."
    );
  }
  return null;
}

/* ================================================================ verifying

   A CREATE WHOSE VALUE DID NOT RESOLVE MUST NEVER REACH A CHIP (D1).

   The parser is generous where a catalog match fails: the leftover words of the
   line become a text value and a handoff chip goes up reading `New covenant /
   not on the facility today / to all of the loans`. That chip is the defect.
   So every delta a composed sentence produces is checked against what was
   elicited - the right member, the right kind of wire, the right catalog type,
   the right figure - and anything that does not match is refused BY NAME.  */

export type Verdict = { ok: true; delta: WorkroomDelta } | { ok: false; why: string };

export function verify(draft: Draft, memberId: string, deltas: WorkroomDelta[]): Verdict {
  const mine = deltas.filter((d) => (d.member ?? d.covenantWire?.facilityId ?? d.pledgeWire?.facilityId) === memberId);
  const others = deltas.filter((d) => !mine.includes(d));

  if (draft.surface === "covenant") {
    const wired = mine.filter((d) => d.covenantWire);
    if (wired.length !== 1) {
      return {
        ok: false,
        why: `the bank's covenant catalog did not settle on "${draft.slots.test}" from that sentence, and I will not file a test the catalog did not name`,
      };
    }
    const wire = wired[0].covenantWire!;
    if (wire.typeName !== draft.slots.test) {
      return {
        ok: false,
        why: `the catalog read that as ${wire.typeName} rather than ${draft.slots.test}, and filing one test as another is not something I will do`,
      };
    }
    if (Math.abs(wire.threshold - (draft.slots.threshold ?? NaN)) > 1e-9) {
      return {
        ok: false,
        why: `the threshold came back as ${wire.threshold} rather than ${draft.slots.threshold}, so the figure did not survive the reading`,
      };
    }
    if (others.length) return { ok: false, why: "that sentence reached more facilities than the one it named" };
    return { ok: true, delta: wired[0] };
  }

  const wired = mine.filter((d) => d.pledgeWire);
  if (wired.length !== 1) return { ok: false, why: "the pledge did not resolve to one asset and one facility" };
  const wire = wired[0].pledgeWire!;
  if (draft.slots.assetId && wire.collateralId !== draft.slots.assetId) {
    return { ok: false, why: "the asset the sentence resolved is not the one you picked" };
  }
  if (others.length) return { ok: false, why: "that sentence reached more facilities than the one it named" };
  return { ok: true, delta: wired[0] };
}

/* =============================================================== amendment

   THE CARD IS AMENDABLE. "actually make it 1.30x", "no, quarterly", "on the
   construction loan instead" corrects THE OPEN CARD in place and says what
   changed. It never stages a second, contradicting chip: amending the open card
   IS the one decision, so it does not violate one-decision-at-a-time. It is the
   same decision, corrected.

   The plan is amendable on the same terms. A line touching something already
   staged acts on THAT entry rather than putting a parallel one beside it, and
   two entries moving the same test is exactly the contradiction the banker
   would otherwise have to reconcile by hand.                                */

/** The words a correction opens on. A bare value counts too: "1.30x" answered
 *  into an open card is a correction, not a new instruction. */
const CORRECTION =
  /^\s*(?:no[,\s]+|actually[,\s]*|instead[,\s]*|rather[,\s]*|sorry[,\s]*|make\s+(?:it|that)\b|change\s+(?:it|that)\b|let'?s\s+make\s+it\b)/i;
const INSTEAD = /\binstead\b/i;

/**
 * VERBS THAT MOVE A FACILITY'S OWN TERMS, and therefore never correct a create.
 *
 * "take the 2.5M line of credit to $4,000,000" over an open covenant card is a
 * NEW instruction. Reading it as a correction would move the covenant onto the
 * facility that line happened to name and answer a commitment change with
 * "updated on the card", which is the room agreeing with something nobody said.
 * The room's own one-decision-at-a-time refusal is the right answer to it.
 */
const TERM_VERB = /\b(take|takes|increase|decrease|reduce|raise|lower|bump|extend|shorten|reprice|renew|waive|price)\b/i;

export interface Amendment {
  draft: Draft;
  /** What changed, in the room's own words. */
  changed: string[];
}

/**
 * THE CORRECTION THIS LINE MAKES TO AN OPEN CREATE, or null.
 *
 * Null means the line is not a correction of this create and the room's other
 * lanes should take it. A correction that changes NOTHING is also null: saying
 * "actually make it 1.25x" over a card that already reads 1.25x has corrected
 * nothing, and answering it with "updated" would be the room agreeing with
 * itself.
 */
export function amendmentOf(line: string, draft: Draft, ctx: ElicitContext): Amendment | null {
  const text = line.trim();
  if (!text) return null;

  if (TERM_VERB.test(text)) return null;
  const looksLikeCorrection =
    CORRECTION.test(text) ||
    INSTEAD.test(text) ||
    // A BARE VALUE. "quarterly", "1.30x", "$5,000,000" and "the construction
    // loan" are all complete corrections when a card is open.
    isBareValue(text, draft, ctx);
  if (!looksLikeCorrection) return null;

  const after = readInto(draft, text, ctx);
  const changed: string[] = [];
  const before = draft.slots;

  if (after.slots.test !== before.test && after.slots.test) changed.push(`the test is now ${after.slots.test}`);
  if (after.slots.threshold !== before.threshold && after.slots.threshold !== undefined) {
    changed.push(`the threshold is now ${thresholdText(after.slots.threshold, after.slots.unit)}`);
  }
  if (after.slots.frequency !== before.frequency && after.slots.frequency) {
    changed.push(`it is tested ${after.slots.frequency.toLowerCase()}`);
  }
  if (after.slots.assetId !== before.assetId && after.slots.assetId) changed.push("the asset has changed");
  if (after.slots.lien !== before.lien && after.slots.lien) changed.push(`the lien position is now ${after.slots.lien}`);
  if (after.scope.join("|") !== draft.scope.join("|") && after.scope.length) {
    changed.push(`it lands on ${sentenceList(after.scope.map((id) => ctx.members.find((m) => m.id === id)?.label ?? id))}`);
  }

  return changed.length ? { draft: after, changed } : null;
}

/** A line that is nothing but an answer: a value, a schedule, a facility. */
function isBareValue(text: string, draft: Draft, ctx: ElicitContext): boolean {
  if (text.split(/\s+/).length > 8) return false;
  if (readFrequency(text)) return true;
  if (/^\s*\$?[\d,.]+\s*x?\s*$/i.test(text)) return true;
  if (readScope(text, ctx.members).ids.length === 1 && !/\b(add|pledge|change|set)\b/i.test(text)) return true;
  if (draft.surface === "covenant" && readTest(text, ctx.book)) return true;
  return false;
}

/* ------------------------------------------------------------- the summary */

/** The one line the room says when a create finally goes up, and the sentence a
 *  correction lands as. Banker language, no schema words, no field names. */
export function changedLine(changed: string[]): string {
  return `Updated on the card: ${sentenceList(changed)}.`;
}
