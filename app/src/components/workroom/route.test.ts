import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, Covenant, Facility } from "../../data/contract";
import { NEUTRAL_QUESTION, ROUTE_CHIPS, readRouteIntent, readRouteSwitch, smartOpeningFor } from "./route";

/* =============================================================================
   THE ROUTER, IN ISOLATION.

   No room, no engine, no bundle beyond the two fields each tier reads. What is
   proved here is the two decisions the router actually makes: which route a
   line names, and which route (if any) the deal signal suggests.

   THE RULE THAT MATTERS MOST IS THE NEGATIVE ONE. No signal, or a signal that
   is not one of this room's three routes, yields NULL — the room then asks the
   neutral question. A router that reached for a route on thin evidence would be
   the channel-none doctrine broken in the greeting slot.
   ============================================================================= */

/** meta.generatedAt is the room's only clock. Nothing here reaches Date.now(). */
const TODAY = "2026-08-31T09:00:00Z";
const PACKAGE = "a5Fbb000000HA1NEAW";
const RELATIONSHIP = "Hartwell Precision Manufacturing LLC";

/** N days out from TODAY, as an ISO date. */
function day(n: number): string {
  const d = new Date("2026-08-31T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function facility(over: Partial<Facility> = {}): Facility {
  return {
    loanId: "a1Hbb000000LoC01",
    name: `${RELATIONSHIP} - Line of Credit - $15,000,000.00`,
    stage: "Booked",
    status: "Active",
    productPackageId: PACKAGE,
    committed: 15_000_000,
    outstanding: 6_000_000,
    maturityDate: day(200),
    ...over,
  } as Facility;
}

function covenant(over: Partial<Covenant> = {}): Covenant {
  return { covenantType: "DSCR", nextEvaluationDate: day(200), ...over } as Covenant;
}

function bundleWith(facilities: Facility[], covenants: Covenant[] = []): BorrowerBundle {
  return { exposure: { facilities }, covenants: { covenants } } as unknown as BorrowerBundle;
}

const dataAt = (generatedAt: string) => ({ meta: { generatedAt } }) as unknown as C360Data;

const openingFor = (bundle: BorrowerBundle | null, generatedAt = TODAY, productPackageId: string | null = PACKAGE) =>
  smartOpeningFor({ data: dataAt(generatedAt), bundle, accountName: RELATIONSHIP, productPackageId });

/* --------------------------------------------------------------- the chips */

describe("the neutral three-way", () => {
  it("names all three routes in the founder's own words", () => {
    expect(NEUTRAL_QUESTION).toBe(
      "What are we doing with this relationship - modifying, renewing, or structuring something new?",
    );
    expect(ROUTE_CHIPS.map((c) => c.label)).toEqual(["Modify", "Renew", "New facility"]);
    expect(ROUTE_CHIPS.map((c) => c.route)).toEqual(["modify", "renew", "create"]);
  });

  it("carries no em dashes, house style", () => {
    expect(NEUTRAL_QUESTION).not.toContain("—");
  });
});

/* ------------------------------------------------------- reading the route */

describe("readRouteIntent — free text always wins", () => {
  it("reads the founder's three examples", () => {
    expect(readRouteIntent("renew the revolver")).toBe("renew");
    expect(readRouteIntent("increase the LoC to 20M")).toBe("modify");
    expect(readRouteIntent("new 5M equipment facility")).toBe("create");
  });

  it("reads the route words themselves, which is what the chips send", () => {
    expect(readRouteIntent("Modify")).toBe("modify");
    expect(readRouteIntent("Renew")).toBe("renew");
    expect(readRouteIntent("New facility")).toBe("create");
  });

  it("reads a change instruction as a modification, whatever verb it uses", () => {
    for (const line of [
      "extend the maturity to March",
      "drop the pricing by 25bps",
      "reduce the commitment to $12M",
      "waive the DSCR test this quarter",
    ]) {
      expect(readRouteIntent(line), line).toBe("modify");
    }
  });

  it("does not read a covenant being ADDED as a new facility", () => {
    // "add a covenant" is a modification. The create tier is the NOUN form only
    // for exactly this reason.
    expect(readRouteIntent("add a covenant to the revolver")).toBe("modify");
  });

  it("does not read 'renew' out of a word that merely contains it", () => {
    expect(readRouteIntent("renewables exposure")).toBeNull();
  });

  it("returns null on a line that names no route at all", () => {
    // Null is what makes the room repeat the question instead of picking an
    // engine on the banker's behalf.
    expect(readRouteIntent("")).toBeNull();
    expect(readRouteIntent("   ")).toBeNull();
    expect(readRouteIntent("who is the relationship manager")).toBeNull();
    expect(readRouteIntent("hello")).toBeNull();
  });

  it("prefers an explicit route word over the change fallback", () => {
    expect(readRouteIntent("increase the commitment as part of the renewal")).toBe("renew");
  });
});

describe("readRouteSwitch — narrower on purpose, inside a bound room", () => {
  it("does not take a renewal's own figures as a request to leave the room", () => {
    expect(readRouteSwitch("increase the commitment to $20M", "renew")).toBeNull();
    expect(readRouteSwitch("extend the maturity by a year", "renew")).toBeNull();
  });

  it("takes an explicit route word for a DIFFERENT route", () => {
    expect(readRouteSwitch("actually let's renew instead", "modify")).toBe("renew");
    expect(readRouteSwitch("modify the package instead", "renew")).toBe("modify");
    expect(readRouteSwitch("open a new equipment facility", "modify")).toBe("create");
  });

  it("is silent when the line names the route the room is already on", () => {
    expect(readRouteSwitch("renew the revolver", "renew")).toBeNull();
    expect(readRouteSwitch("modify the pricing", "modify")).toBeNull();
  });
});

/* --------------------------------------------------------- the smart opening */

describe("smartOpeningFor — derived, never invented", () => {
  it("opens a maturity inside the quarter on the renewal, naming the facility", () => {
    const f = facility({ maturityDate: day(47) });
    const opening = openingFor(bundleWith([f]))!;
    expect(opening.route).toBe("renew");
    expect(opening.yesLabel).toBe("Start the renewal");
    // The insight is the engine's own sentence, verbatim.
    expect(opening.line).toBe("The $15M Line of Credit matures in 47 days. Start the renewal?");
    // And the yes preselects the member the sentence named.
    expect(opening.memberId).toBe(f.loanId);
  });

  it("opens a package drawn hard against its commitment on the modification", () => {
    const opening = openingFor(bundleWith([facility({ outstanding: 14_000_000 })]))!;
    expect(opening.route).toBe("modify");
    expect(opening.yesLabel).toBe("Open the modification");
    expect(opening.line).toContain("drawn to 93% of commitment");
    // Utilization is a PACKAGE fact; it names no single facility, so nothing is
    // preselected rather than something arbitrary being picked.
    expect(opening.memberId).toBeNull();
  });

  it("yields NOTHING for a covenant due soon — that is the review satellite's work", () => {
    // deriveNextMove ranks this second and would return a covenant move; it is
    // not one of this room's three routes, so the room asks the neutral
    // question rather than routing a covenant signal into a modification.
    const quiet = facility({ maturityDate: day(400), outstanding: 1_000_000 });
    expect(openingFor(bundleWith([quiet], [covenant({ nextEvaluationDate: day(12) })]))).toBeNull();
  });

  it("yields nothing on a quiet package", () => {
    expect(openingFor(bundleWith([facility({ maturityDate: day(400), outstanding: 1_000_000 })]))).toBeNull();
  });

  it("yields nothing without a usable clock", () => {
    expect(openingFor(bundleWith([facility({ maturityDate: day(10) })]), "")).toBeNull();
    expect(openingFor(bundleWith([facility({ maturityDate: day(10) })]), "not-a-date")).toBeNull();
  });

  it("yields nothing with no read at all", () => {
    expect(openingFor(null)).toBeNull();
    expect(openingFor(bundleWith([]))).toBeNull();
  });

  it("ignores a maturity on a facility that is not booked", () => {
    expect(openingFor(bundleWith([facility({ maturityDate: day(10), stage: "Final Review" })]))).toBeNull();
  });

  it("ignores a maturity on a facility that is not active", () => {
    expect(openingFor(bundleWith([facility({ maturityDate: day(10), status: "Paid Off" })]))).toBeNull();
  });

  it("ignores a facility hanging off another package once the room is anchored", () => {
    const other = facility({ maturityDate: day(10), productPackageId: "a5Fbb000000OTHER" });
    expect(openingFor(bundleWith([other]))).toBeNull();
    // Unanchored, the same facility is in scope: the room has not narrowed yet.
    expect(openingFor(bundleWith([other]), TODAY, null)?.route).toBe("renew");
  });

  it("preselects the facility the sentence NAMED, not merely the first one", () => {
    const later = facility({ loanId: "a1Hbb000000LATER", maturityDate: day(60) });
    const sooner = facility({
      loanId: "a1Hbb000000SOON0",
      name: `${RELATIONSHIP} - Equipment - $8,000,000.00`,
      committed: 8_000_000,
      outstanding: 1_000_000,
      maturityDate: day(20),
    });
    const opening = openingFor(bundleWith([later, sooner]))!;
    expect(opening.line).toBe("The $8M Equipment matures in 20 days. Start the renewal?");
    expect(opening.memberId).toBe("a1Hbb000000SOON0");
  });
});
