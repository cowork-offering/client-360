/* =============================================================================
   THE COMPOSER PLUS CATALOGUE — WHAT THE ROOM CAN BE ASKED TO DO, AS DATA.

   THE MENU WRITES A LINE. IT NEVER SENDS ONE (founder, 2026-09-03). Every entry
   here resolves to a TEMPLATE: a sentence in the room's own grammar that lands
   in the composer with the caret on the first placeholder, so the banker still
   steers it, still adds their own note, and still presses send themselves.

   TWO REFERENCE FORMS FOR THE SAME FACILITY, AND THE DIFFERENCE IS LOAD-BEARING.

     `shortName`  `Equipment - $8,000,000.00` — the ORG'S OWN loan name with the
                  borrower's name off the front. It is one of the member's own
                  identity tokens, so `parseModify` resolves exactly one member
                  on it. Used by every line the deterministic parser takes: the
                  term changes, the pricing fields, a party removal.

     `phrase`     `8M equipment loan` — the DOLLAR QUALIFIER the room's own
                  `focusQualifier` reads: it resolves the member, STANDS on it,
                  and takes the phrase out of the line before any surface reader
                  sees it. Used by every line a create surface takes (covenant,
                  collateral, involvement, fee, exception), because those
                  readers would otherwise read the facility's own commitment as
                  the covenant threshold or the fee. Verified: with the phrase
                  stripped, `[threshold]` has no money left to steal.

   PLACEHOLDERS ARE MEANT TO BE TYPED OVER. `[amount]`, `[rate]`, `[threshold]`,
   `[entity]` — square-bracketed, the first one selected on insert. A template
   carrying one is still a line the room reads: it comes back as the room's own
   question rather than as a refusal, and the same line with the figure in it
   stages. `catalog.test.ts` asserts BOTH, for every facility on the package.

   NO PLACEHOLDER MAY CARRY A READING WORD. `what`, `which`, `show`, `list`,
   `value` are read-shape words to `fee.ts`, `exception.ts` and `elicit.ts`, and
   a placeholder carrying one turns a create into a question about the book.
   That is why it is `[name the exception]` and not `[what is out of policy]`.

   THE RECORD LISTS ARE THE BOOK'S, NEVER A GUESS. Remove a borrower offers the
   parties actually on that facility; remove a covenant offers the covenants
   actually attached to it; associate offers the relationship's covenants that
   are NOT on it; release offers its own pledges; pledge-existing offers the
   relationship's assets not yet pledged to it. An action whose list comes back
   empty is not offered at all.
   ============================================================================= */

import type { Facility } from "../../data/contract";
import { CATALOG_TESTS, INVOLVEMENT_ROLES, type Book, type ElicitMember } from "../workroom/elicit";
import { FEE_KINDS } from "../workroom/fee";
import { REL_ROUTE_CHIPS, type RelRoute } from "../relationship/relRoute";

/* ------------------------------------------------------------- the facility */

/** One member of the package, in the two reference forms and the figures the
 *  level-one row prints. Built from what the room already holds; no read. */
export interface FacilityEntry {
  id: string;
  /** The room's own display label ("$8.0MM Equipment"). */
  label: string;
  /** The product word, shared across a package with two of the same product. */
  key: string;
  /** The org's own loan name, borrower prefix stripped. The parser's token. */
  shortName: string;
  /** The dollar-qualifier phrase `focusQualifier` resolves and strips. */
  phrase: string;
  committed: number | null;
  drawn: number | null;
  maturity: string | null;
}

/** `15000000` to `15M`, `2500000` to `2.5M`. The way a banker says it, and the
 *  way `focusQualifier` reads it back. */
export function shortMoney(n: number): string {
  const mm = n / 1e6;
  return `${Number.isInteger(mm) ? mm : Number(mm.toFixed(2))}M`;
}

/** The nouns a product word already ends on. Anything else takes "loan" behind
 *  it, because `focusQualifier` needs a facility noun after the figure. */
const CARRIES_NOUN = /\b(line|credit|loan|facility|note|revolver)\b/i;

export function facilityPhrase(committed: number | null, key: string): string {
  const product = key.toLowerCase();
  const noun = CARRIES_NOUN.test(product) ? "" : " loan";
  return committed === null ? `${product}${noun}` : `${shortMoney(committed)} ${product}${noun}`;
}

/**
 * THE PACKAGE, AS THE MENU LISTS IT.
 *
 * `members` is the room's own eligible-member list, so a facility the room will
 * not act on never reaches the menu. `facilities` is the read behind it, for
 * the drawn figure and the maturity the level-one row prints.
 */
export function facilityEntries(members: ElicitMember[], facilities: Facility[]): FacilityEntry[] {
  const byId = new Map(facilities.filter((f) => f.loanId).map((f) => [f.loanId as string, f]));
  return members.map((m) => {
    const f = byId.get(m.id);
    return {
      id: m.id,
      label: m.label,
      key: m.key,
      shortName: m.shortName ?? m.orgName ?? m.label,
      phrase: facilityPhrase(m.committed, m.key),
      committed: m.committed,
      drawn: typeof f?.outstanding === "number" ? f.outstanding : null,
      maturity: f?.maturityDate ?? null,
    };
  });
}

/* --------------------------------------------------------------- the action */

/**
 * WHICH READER THE ROOM RESOLVES THIS LINE WITH.
 *
 * Named rather than inferred, so `catalog.test.ts` drives the REAL path instead
 * of a proxy for it: a template is only in this file once the reader it names
 * has been shown to take it against every member of the live package.
 */
export type Gate =
  /** `parseModify` takes it whole. The facility is named by `shortName`. */
  | "parse"
  /** `focusQualifier` stands the room on the facility, then a create surface
   *  (covenant, collateral, involvement, fee, exception) takes what is left. */
  | "surface"
  /** `readRemove` fences it and `readArmRemoval` files the carry exclusion. */
  | "arm"
  /** `readRelRouteIntent` binds one of the relationship room's reviews. */
  | "relRoute";

/** One leaf of the menu: a sentence, and what it is called. */
export interface ActionChoice {
  id: string;
  label: string;
  /** The second line on the row: what the record is, in the org's own words. */
  sub?: string;
  template: string;
}

export interface CatalogAction {
  id: string;
  label: string;
  gate: Gate;
  /** The route this action binds, for `relRoute` actions only. */
  route?: RelRoute;
  /** A leaf with no sub-choices: the template is the action. */
  template?: (f: FacilityEntry) => string;
  /** A branch: the REAL records this action can act on. Empty means the action
   *  has nothing to offer on this facility and is not listed. */
  choices?: (f: FacilityEntry, book: Book) => ActionChoice[];
}

export type TopicId =
  | "terms"
  | "entity"
  | "covenant"
  | "collateral"
  | "pricing"
  | "fees"
  | "exceptions"
  | "reviews"
  | "service"
  | "relIntake";

export interface CatalogTopic {
  id: TopicId;
  label: string;
  actions: CatalogAction[];
}

/* ------------------------------------------------------------- placeholders */

/** The marker the composer selects on insert, and the test types over. */
export const PLACEHOLDER = /\[[^\]]+\]/;

/**
 * A REPRESENTATIVE VALUE FOR EACH PLACEHOLDER.
 *
 * Used ONLY by `catalog.test.ts`, to prove the filled line stages. Nothing here
 * ever reaches the composer: the banker types the figure, and a menu that
 * pre-filled one would be inventing a number the source never stated.
 */
export const SAMPLE: Record<string, string> = {
  "[amount]": "20,000,000",
  "[rate]": "7.25",
  "[months]": "84",
  "[yyyy-mm-dd]": "2029-06-30",
  "[Monthly]": "Monthly",
  "[threshold]": "1.30",
  "[entity]": "Hartwell Logistics LLC",
  "[percent]": "1",
  "[name the exception]": "hold limit exceeded",
  "[asset]": "Mazak machining centre",
};

/** The template with every placeholder replaced by its representative value. */
export function filled(template: string): string {
  let line = template;
  for (const [key, value] of Object.entries(SAMPLE)) line = line.split(key).join(value);
  return line;
}

/* ------------------------------------------------------- the record readers */

const covenantsOn = (book: Book, id: string) => book.covenants.filter((c) => c.loanIds.includes(id));
const covenantsOff = (book: Book, id: string) =>
  book.covenants.filter((c) => c.id && !c.loanIds.includes(id));
const pledgesOn = (book: Book, id: string) => book.assets.filter((a) => a.loanIds.includes(id));
const pledgesOff = (book: Book, id: string) => book.assets.filter((a) => !a.loanIds.includes(id));
const partiesOn = (book: Book, id: string) => {
  const seen = new Set<string>();
  return book.parties.filter((p) => {
    if (p.loanId !== id) return false;
    const key = `${p.name}|${p.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** A covenant's threshold, as the row prints it beside the name. */
function covenantSub(threshold: number | null, frequency: string | null): string {
  const figure =
    threshold === null
      ? null
      : threshold >= 1000
        ? `$${threshold.toLocaleString("en-US")}`
        : String(threshold);
  return [figure, frequency].filter(Boolean).join(" · ");
}

/** Which way a test runs, from the catalog's own naming. A "Maximum" or a
 *  leverage test is a ceiling; everything else in this catalog is a floor. */
const CEILING = /\b(max|maximum|leverage|debt to worth|debt to equity)\b/i;
const operatorFor = (test: string) => (CEILING.test(test) ? "<=" : ">=");

/** "an origination fee", "a commitment fee". The article the noun takes. */
const article = (noun: string) => (/^[aeiou]/i.test(noun) ? "an" : "a");

/* ==================================================== the facility catalogue */

export const FACILITY_TOPICS: CatalogTopic[] = [
  {
    id: "terms",
    label: "Facility Terms",
    actions: [
      {
        id: "terms.increase",
        label: "Increase the commitment",
        gate: "parse",
        template: (f) => `increase the ${f.shortName} to $[amount]`,
      },
      {
        id: "terms.reduce",
        label: "Reduce the commitment",
        gate: "parse",
        template: (f) => `reduce the ${f.shortName} to $[amount]`,
      },
      {
        id: "terms.rate",
        label: "Change the rate",
        gate: "parse",
        template: (f) => `change the rate on the ${f.shortName} to [rate]%`,
      },
      {
        id: "terms.term",
        label: "Set the term",
        gate: "parse",
        template: (f) => `give the ${f.shortName} a [months] month term`,
      },
      {
        id: "terms.maturity",
        label: "Extend the maturity",
        gate: "parse",
        template: (f) => `extend the maturity of the ${f.shortName} to [yyyy-mm-dd]`,
      },
      {
        id: "terms.schedule",
        label: "Change the payment schedule",
        gate: "parse",
        template: (f) => `change the payment schedule on the ${f.shortName} to [Monthly]`,
      },
    ],
  },
  {
    id: "entity",
    label: "Legal Entity",
    actions: [
      {
        id: "entity.add",
        label: "Add a party",
        gate: "surface",
        choices: (f) =>
          INVOLVEMENT_ROLES.map((role) => ({
            id: `entity.add.${role}`,
            label: role,
            template: `add [entity] as ${role.toLowerCase()} on the ${f.phrase}`,
          })),
      },
      {
        id: "entity.remove",
        label: "Remove a party",
        gate: "parse",
        choices: (f, book) =>
          partiesOn(book, f.id).map((p) => ({
            id: `entity.remove.${p.name}.${p.role}`,
            label: p.name,
            sub: p.role,
            template: `remove the ${p.role.toLowerCase()} ${p.name} from the ${f.shortName}`,
          })),
      },
    ],
  },
  {
    id: "covenant",
    label: "Covenant",
    actions: [
      {
        id: "covenant.add",
        label: "Add a covenant",
        gate: "surface",
        choices: (f) =>
          CATALOG_TESTS.map((test) => ({
            id: `covenant.add.${test}`,
            label: test,
            template: `add a ${test} covenant ${operatorFor(test)} [threshold] tested quarterly on the ${f.phrase}`,
          })),
      },
      {
        id: "covenant.associate",
        label: "Associate an existing covenant",
        gate: "surface",
        choices: (f, book) =>
          covenantsOff(book, f.id).map((c) => ({
            id: `covenant.associate.${c.id}`,
            label: c.type,
            sub: covenantSub(c.threshold, c.frequency),
            template: `attach the existing covenant ${c.type} on the ${f.phrase}`,
          })),
      },
      {
        id: "covenant.remove",
        label: "Leave a covenant off",
        gate: "arm",
        choices: (f, book) =>
          covenantsOn(book, f.id).map((c) => ({
            id: `covenant.remove.${c.id ?? c.type}`,
            label: c.type,
            sub: covenantSub(c.threshold, c.frequency),
            template: `remove the ${c.type} covenant from the ${f.shortName}`,
          })),
      },
    ],
  },
  {
    id: "collateral",
    label: "Collateral",
    actions: [
      {
        id: "collateral.pledge",
        label: "Pledge existing collateral",
        gate: "surface",
        choices: (f, book) =>
          pledgesOff(book, f.id)
            .filter((a) => a.name)
            .map((a) => ({
              id: `collateral.pledge.${a.id}`,
              label: a.name as string,
              sub: a.label,
              template: `pledge ${a.name} to the ${f.phrase}`,
            })),
      },
      {
        id: "collateral.new",
        label: "Pledge a new asset",
        gate: "surface",
        template: (f) => `add a new [asset] as collateral on the ${f.phrase} worth $[amount]`,
      },
      {
        id: "collateral.release",
        label: "Leave a pledge off",
        gate: "arm",
        choices: (f, book) =>
          pledgesOn(book, f.id)
            .filter((a) => a.name)
            .map((a) => ({
              id: `collateral.release.${a.id}`,
              label: a.name as string,
              sub: a.label,
              template: `remove the ${a.name} pledge from the ${f.shortName}`,
            })),
      },
    ],
  },
  {
    id: "pricing",
    label: "Pricing and Payment",
    actions: [
      {
        id: "pricing.amortised",
        label: "Set the amortised term",
        gate: "parse",
        template: (f) => `set the Amortized Term (Months) on the ${f.shortName} to [months]`,
      },
      {
        id: "pricing.firstPayment",
        label: "Set the first payment date",
        gate: "parse",
        template: (f) => `set the first payment date on the ${f.shortName} to [yyyy-mm-dd]`,
      },
    ],
  },
  {
    id: "fees",
    label: "Fees",
    actions: [
      {
        id: "fees.percent",
        label: "Add a percentage fee",
        gate: "surface",
        choices: (f) =>
          FEE_KINDS.map((kind) => ({
            id: `fees.percent.${kind}`,
            label: kind,
            template: `add a [percent]% ${kind.toLowerCase()} to the ${f.phrase}`,
          })),
      },
      {
        id: "fees.flat",
        label: "Add a flat fee",
        gate: "surface",
        choices: (f) =>
          FEE_KINDS.map((kind) => ({
            id: `fees.flat.${kind}`,
            label: kind,
            template: `add ${article(kind)} ${kind.toLowerCase()} of $[amount] to the ${f.phrase}`,
          })),
      },
    ],
  },
  {
    id: "exceptions",
    label: "Exceptions",
    actions: [
      {
        id: "exceptions.open",
        label: "Log a policy exception",
        gate: "surface",
        template: (f) => `log a policy exception on the ${f.phrase}: [name the exception]`,
      },
      {
        id: "exceptions.waived",
        label: "Log a waived exception",
        gate: "surface",
        template: (f) => `log a waived policy exception on the ${f.phrase}: [name the exception]`,
      },
      {
        id: "exceptions.unmitigated",
        label: "Log an unmitigated exception",
        gate: "surface",
        template: (f) => `log an unmitigated policy exception on the ${f.phrase}: [name the exception]`,
      },
    ],
  },
];

/* ================================================ the relationship catalogue

   BY FEATURE, NOT BY NAME. The four reviews and the service request are the
   five routes `relRoute.ts` has always carried; anything the build adds to
   `REL_ROUTE_CHIPS` beyond them (the relationship-level covenant and collateral
   intakes, in flight on `intake-shell`) is picked up here automatically and
   listed under its own topic. A build without them lists four and one, and
   nothing anywhere fails.                                                    */

/** The four routes that are reviews, and the one that is not. */
const REVIEW_ROUTES: RelRoute[] = ["annual", "covenant", "valuation", "rating"];

/** The line each route binds, in `readRelRouteIntent`'s own vocabulary. */
const routeLine = (route: RelRoute, label: string): string =>
  route === "service" ? "raise a service request" : `run the ${label.toLowerCase()}`;

export function relationshipTopics(): CatalogTopic[] {
  const chips = REL_ROUTE_CHIPS;
  const action = (chip: (typeof REL_ROUTE_CHIPS)[number]): CatalogAction => ({
    id: `rel.${chip.route}`,
    label: chip.label,
    gate: "relRoute",
    route: chip.route,
    template: () => routeLine(chip.route, chip.label),
  });

  const reviews = chips.filter((c) => REVIEW_ROUTES.includes(c.route)).map(action);
  const service = chips.filter((c) => c.route === "service").map(action);
  /* WHATEVER ELSE THIS BUILD CARRIES. Never assumed present, never hard-failed
     on when absent: the intake routes land as their own topic the moment the
     chip list grows, and until then this list is empty and the topic is gone. */
  const intake = chips.filter((c) => !REVIEW_ROUTES.includes(c.route) && c.route !== "service").map(action);

  const topics: CatalogTopic[] = [];
  if (reviews.length) topics.push({ id: "reviews", label: "Reviews", actions: reviews });
  if (service.length) topics.push({ id: "service", label: "Service", actions: service });
  if (intake.length) topics.push({ id: "relIntake", label: "Create at relationship level", actions: intake });
  return topics;
}

/* ------------------------------------------------------------------ the sum */

/** Every leaf under one action on one facility: the choices, or the action's
 *  own template where it has no choices. */
export function leaves(action: CatalogAction, facility: FacilityEntry, book: Book): ActionChoice[] {
  if (action.choices) return action.choices(facility, book);
  return action.template ? [{ id: action.id, label: action.label, template: action.template(facility) }] : [];
}

/** How many leaves a topic offers on one facility. The count badge. */
export function topicCount(topic: CatalogTopic, facility: FacilityEntry, book: Book): number {
  return topic.actions.reduce((n, a) => n + (leaves(a, facility, book).length ? 1 : 0), 0);
}
