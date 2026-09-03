import { describe, expect, it } from "vitest";
import live from "../../../../artifact/live-data.json";
import type { BorrowerBundle, C360Data, Facility, LegalEntity } from "../../data/contract";
import { facilityProduct, shortFacilityName } from "../../data/facilityStage";
import { buildBook, openCreate, type Book, type ElicitContext, type ElicitMember } from "../workroom/elicit";
import { focusQualifier, readRemove, type QualifierMember } from "../workroom/dispatch";
import { readArmRemoval } from "../workroom/orgArms";
import { readFeeOpen } from "../workroom/fee";
import { readExceptionOpen } from "../workroom/exception";
import { parseModify, type ParseContext } from "../../workroom/parseModify";
import { readRelRouteIntent } from "../relationship/relRoute";
import {
  FACILITY_TOPICS,
  facilityEntries,
  facilityPhrase,
  filled,
  leaves,
  PLACEHOLDER,
  relationshipTopics,
  shortMoney,
  type CatalogAction,
  type FacilityEntry,
} from "./catalog";

/* =============================================================================
   EVERY TEMPLATE, THROUGH THE ROOM'S OWN READER, ON THE LIVE PACKAGE.

   The bar is the founder's: a template must never come back as a REFUSAL. It
   either stages a delta or it comes back as the room's own question, and the
   same template with its placeholders typed over stages on the member the menu
   was standing on. Anything else is a menu entry that leads nowhere, which is
   the one thing a plus menu may not be.

   THE DATA IS `artifact/live-data.json`, the Hartwell package as it was read
   out of the org: six booked members, six covenants, four collateral records,
   four distinct parties. Nothing here is a fixture written to pass.
   ============================================================================= */

const ACCOUNT = "001bb00001I7FPNAA3";
const REL = "Hartwell Precision Manufacturing LLC";

const bundle = ((live as unknown as C360Data).borrowers ?? {})[ACCOUNT] as BorrowerBundle;
const allFacilities = (bundle.exposure?.facilities ?? []) as Facility[];
const booked = allFacilities.filter((f) => f.stage === "Booked" && f.loanId);
const keys = booked.map((f) => facilityProduct(f, REL));

const MM = (n: number) => `$${(n / 1e6).toFixed(1)}MM`;

/** The members exactly as `Workroom.tsx` builds them: the product word as the
 *  key, the commitment in front where the product repeats, the org's own loan
 *  name with the borrower prefix off it. */
const members: ElicitMember[] = booked.map((f, i) => ({
  id: f.loanId as string,
  key: keys[i],
  label: keys.filter((k) => k === keys[i]).length > 1 ? `${MM(f.committed ?? 0)} ${keys[i]}` : keys[i],
  orgName: f.name ?? null,
  shortName: shortFacilityName(f.name, REL) || null,
  committed: f.committed ?? null,
}));

/** The qualifier members, as the room builds them: the label is the bare
 *  product word, which is what `focusQualifier` matches the noun against. */
const qualifierMembers: QualifierMember[] = booked.map((f, i) => ({
  id: f.loanId as string,
  label: keys[i],
  committed: f.committed ?? null,
}));

const book: Book = buildBook(bundle, members.map((m) => m.id));
const entries: FacilityEntry[] = facilityEntries(members, allFacilities);

const parseCtx: ParseContext = {
  facilities: allFacilities,
  booked,
  relationship: REL,
  entities: (bundle.graph?.legalEntities ?? []) as LegalEntity[],
};

/* ------------------------------------------------------- the reader, per gate */

type Outcome = { ok: boolean; staged: boolean; member: string | null; how: string };

/** `parseModify`, the way the room calls it: the whole line, no stripping. */
function throughParse(line: string, focus: Facility | null): Outcome {
  const out = parseModify(line, { ...parseCtx, focus });
  if (out.kind === "amendments") {
    const ids = [...new Set(out.amendments.map((a) => a.facility?.loanId ?? null))];
    return { ok: true, staged: true, member: ids.length === 1 ? ids[0] : null, how: "amendments" };
  }
  return { ok: out.kind === "clarify", staged: false, member: null, how: out.kind };
}

/**
 * THE CREATE SURFACES, in the room's own order: the dollar qualifier stands the
 * room on the member and comes out of the line, then the create grammar, then
 * the fee reader, then the exception reader, then the parser behind them all.
 */
function throughSurface(line: string): Outcome {
  const focus = focusQualifier(line, qualifierMembers);
  const rest = focus ? focus.line : line;
  const focused = focus ? (members.find((m) => m.id === focus.memberId) ?? null) : null;
  const ctx: ElicitContext = { members, focused, book, plan: [], relationship: REL };

  const draft = openCreate(rest, ctx);
  if (draft) {
    const scoped = draft.scope.length === 1 ? draft.scope[0] : (focused?.id ?? null);
    return { ok: true, staged: true, member: scoped, how: `create:${draft.surface}` };
  }
  const fee = readFeeOpen(rest, members, focused);
  if (fee) return { ok: true, staged: true, member: fee.memberId ?? null, how: "fee" };
  const exception = readExceptionOpen(rest, members, focused);
  if (exception) return { ok: true, staged: true, member: exception.memberId ?? null, how: "exception" };

  const parsed = throughParse(rest, focused ? (booked.find((f) => f.loanId === focused.id) ?? null) : null);
  return { ...parsed, member: parsed.member ?? focused?.id ?? null, how: `parse:${parsed.how}` };
}

/** A carry exclusion: fenced by `readRemove`, filed by `readArmRemoval`. */
function throughArm(line: string): Outcome {
  const read = readRemove(line, [], book, members);
  if (!read || read.kind !== "fence") return { ok: false, staged: false, member: null, how: `remove:${read?.kind ?? "null"}` };
  const armed = readArmRemoval({
    line,
    scope: read.scope,
    name: read.name,
    book,
    members,
    focused: null,
    mode: "modify",
  });
  return {
    ok: armed?.kind === "exclusion",
    staged: armed?.kind === "exclusion",
    member: armed?.kind === "exclusion" ? (armed.delta.member ?? null) : null,
    how: `arm:${armed?.kind ?? "null"}`,
  };
}

function run(gate: CatalogAction["gate"], line: string, facility: FacilityEntry): Outcome {
  if (gate === "parse") return throughParse(line, booked.find((f) => f.loanId === facility.id) ?? null);
  if (gate === "surface") return throughSurface(line);
  return throughArm(line);
}

/* ------------------------------------------------------------------- the book */

describe("the package the menu lists", () => {
  it("lists every booked member of the Hartwell package, with its figures", () => {
    expect(entries).toHaveLength(6);
    const loc = entries.find((e) => e.committed === 15_000_000);
    expect(loc).toBeTruthy();
    expect(loc?.shortName).toBe("Line of Credit - $15,000,000.00");
    expect(loc?.phrase).toBe("15M line of credit");
    expect(loc?.drawn).toBe(9_200_000);
    expect(loc?.maturity).toBe("2027-03-15");

    const equipment = entries.find((e) => e.committed === 8_000_000);
    expect(equipment?.phrase).toBe("8M equipment loan");
    expect(equipment?.shortName).toBe("Equipment - $8,000,000.00");
  });

  it("says a commitment the way a banker does", () => {
    expect(shortMoney(15_000_000)).toBe("15M");
    expect(shortMoney(2_500_000)).toBe("2.5M");
    expect(shortMoney(3_500_000)).toBe("3.5M");
  });

  it("puts a facility noun behind a product word that has none", () => {
    expect(facilityPhrase(8_000_000, "Equipment")).toBe("8M equipment loan");
    expect(facilityPhrase(15_000_000, "Line of Credit")).toBe("15M line of credit");
  });
});

/* -------------------------------------------------- the record lists are real */

describe("the record lists come off the book", () => {
  const loc15 = entries.find((e) => e.committed === 15_000_000)!;
  const equipment8 = entries.find((e) => e.committed === 8_000_000)!;
  const construction = entries.find((e) => e.committed === 12_000_000)!;

  const action = (topic: string, id: string) =>
    FACILITY_TOPICS.find((t) => t.id === topic)!.actions.find((a) => a.id === id)!;

  it("removes only the parties actually on that facility", () => {
    const on15 = leaves(action("entity", "entity.remove"), loc15, book).map((c) => `${c.label}|${c.sub}`);
    expect(on15).toEqual([
      "Hartwell Precision Manufacturing LLC|Borrower",
      "Hartwell Industrial Holdings LLC|Guarantor",
      "James Hartwell|Guarantor",
      "Elena Hartwell|Limited Guarantor",
    ]);
    const onEquipment = leaves(action("entity", "entity.remove"), equipment8, book).map((c) => c.label);
    // Elena Hartwell guarantees the construction loan and the 15M line, not this one.
    expect(onEquipment).not.toContain("Elena Hartwell");
  });

  it("leaves off only the covenants attached to that facility", () => {
    expect(leaves(action("covenant", "covenant.remove"), loc15, book).map((c) => c.label)).toEqual([
      "Accounts Receivable",
    ]);
    expect(leaves(action("covenant", "covenant.remove"), construction, book).map((c) => c.label)).toEqual([
      "Term Covenants",
    ]);
    // No junction on the 8M equipment loan at all.
    expect(leaves(action("covenant", "covenant.remove"), equipment8, book)).toHaveLength(0);
  });

  it("associates only covenants the relationship holds and this facility does not", () => {
    const offered = leaves(action("covenant", "covenant.associate"), loc15, book).map((c) => c.label);
    expect(offered).not.toContain("Accounts Receivable");
    expect(offered).toContain("Minimum Liquidity");
    expect(offered).toContain("Term Covenants");
    expect(offered).toHaveLength(5);
  });

  it("releases only the pledges on that facility, and offers only assets it does not carry", () => {
    expect(leaves(action("collateral", "collateral.release"), loc15, book).map((c) => c.label).sort()).toEqual([
      "COL-000762",
      "COL-000763",
    ]);
    expect(leaves(action("collateral", "collateral.pledge"), loc15, book).map((c) => c.label).sort()).toEqual([
      "COL-000764",
      "COL-000765",
    ]);
    expect(leaves(action("collateral", "collateral.release"), equipment8, book).map((c) => c.label)).toEqual([
      "COL-000764",
    ]);
  });
});

/* ------------------------------------------------- every template, every member */

describe("every template, on every member of the package", () => {
  const cases: Array<{ name: string; gate: CatalogAction["gate"]; facility: FacilityEntry; template: string }> = [];
  for (const facility of entries) {
    for (const topic of FACILITY_TOPICS) {
      for (const action of topic.actions) {
        for (const choice of leaves(action, facility, book)) {
          cases.push({ name: `${facility.label} · ${topic.label} · ${choice.label}`, gate: action.gate, facility, template: choice.template });
        }
      }
    }
  }

  it("covers the whole catalogue against the live package", () => {
    // Six members; the catalogue expands per member against the book behind it.
    expect(cases.length).toBeGreaterThan(200);
  });

  it("never composes a line with a reading word inside a placeholder", () => {
    for (const c of cases) {
      const holes = c.template.match(/\[[^\]]+\]/g) ?? [];
      for (const hole of holes) {
        expect(hole, `${c.name}: ${hole}`).not.toMatch(/\b(what|which|show|list|value|waive|remove|drop)\b/i);
      }
    }
  });

  it("is read by the room, and is never a refusal", () => {
    const refused = cases.filter((c) => !run(c.gate, c.template, c.facility).ok);
    expect(refused.map((c) => `${c.name} :: ${c.template}`)).toEqual([]);
  });

  it("lands on the member the menu was standing on, once the placeholders are typed over", () => {
    const wrong: string[] = [];
    for (const c of cases) {
      const out = run(c.gate, filled(c.template), c.facility);
      if (!out.ok || !out.staged) {
        wrong.push(`${c.name} :: not staged (${out.how})`);
        continue;
      }
      if (out.member && out.member !== c.facility.id) {
        wrong.push(`${c.name} :: landed on ${out.member}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("leaves no placeholder behind once they are typed over", () => {
    const withHoles = cases.filter((c) => PLACEHOLDER.test(c.template));
    expect(withHoles.length).toBeGreaterThan(0);
    for (const c of withHoles) expect(filled(c.template), c.name).not.toMatch(PLACEHOLDER);
  });
});

/* ------------------------------------------------------- the relationship room */

describe("the relationship entries bind the room's own routes", () => {
  it("offers the reviews and the service request this build carries", () => {
    const topics = relationshipTopics();
    expect(topics.map((t) => t.id)).toContain("reviews");
    expect(topics.map((t) => t.id)).toContain("service");
    const reviews = topics.find((t) => t.id === "reviews")!;
    expect(reviews.actions.map((a) => a.route)).toEqual(["annual", "covenant", "valuation", "rating"]);
  });

  it("binds the route each entry names", () => {
    for (const topic of relationshipTopics()) {
      for (const action of topic.actions) {
        const line = action.template!({} as FacilityEntry);
        expect(readRelRouteIntent(line), `${action.label}: ${line}`).toBe(action.route);
      }
    }
  });

  it("picks up any route this build adds, without being told about it", () => {
    // Feature detection, not a name list: the topics are derived from
    // REL_ROUTE_CHIPS, so an intake route added by another branch lands here.
    const routes = relationshipTopics().flatMap((t) => t.actions.map((a) => a.route));
    expect(new Set(routes).size).toBe(routes.length);
  });
});
