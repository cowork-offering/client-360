import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, Covenant } from "../../data/contract";
import {
  FACILITY_HANDOFF,
  NEUTRAL_QUESTION,
  REL_ROUTE_CHIPS,
  REL_ROUTE_WORD,
  asksForFacilityWork,
  readRelRouteIntent,
  readRelRouteSwitch,
  relOpeningFor,
} from "./relRoute";

/* =============================================================================
   THE RELATIONSHIP ROUTER.

   Which of the five reviews takes the session, and what the room is allowed to
   open on. The channel-none doctrine is the load-bearing rule here: a signal is
   derived from data the read actually carries or it is null, and null opens the
   neutral question rather than an invented one.
   ============================================================================= */

const TODAY = "2026-08-31";

function dataWith(covenants: Covenant[], generatedAt: string | null = TODAY): {
  data: C360Data;
  bundle: BorrowerBundle;
} {
  const bundle = {
    snapshot: { accountId: "001X", name: "Testco", primaryRiskRating: "4" },
    covenants: { covenants },
  } as unknown as BorrowerBundle;
  const data = {
    meta: generatedAt ? { generatedAt } : {},
    portfolio: { accounts: [] },
    borrower: bundle,
    borrowers: { "001X": bundle },
  } as unknown as C360Data;
  return { data, bundle };
}

/** A covenant due in `days`, clean. */
function due(days: number, type = "Debt Service Coverage", id = "cov-1"): Covenant {
  const d = new Date(Date.UTC(2026, 7, 31));
  d.setUTCDate(d.getUTCDate() + days);
  return {
    covenantId: id,
    covenantType: type,
    nextEvaluationDate: d.toISOString().slice(0, 10),
    lastEvaluationStatus: "Compliant",
    latestComplianceStatus: "Pending",
  };
}

describe("the five routes", () => {
  it("offers exactly five, in the governance calendar's order", () => {
    expect(REL_ROUTE_CHIPS.map((c) => c.route)).toEqual(["annual", "covenant", "valuation", "rating", "service"]);
  });

  it("names each route in banker grammar", () => {
    expect(REL_ROUTE_WORD.annual).toBe("annual review");
    expect(REL_ROUTE_WORD.valuation).toBe("collateral valuation");
    expect(REL_ROUTE_WORD.service).toBe("service request");
  });

  it("asks the neutral question without naming the five twice", () => {
    // The chips carry the list. A question that also read it out would spend
    // the opening view's whole budget saying the same thing twice.
    for (const chip of REL_ROUTE_CHIPS) expect(NEUTRAL_QUESTION).not.toContain(chip.label);
  });

  it("keeps house style: no em dashes, no exclamation points", () => {
    const copy = [NEUTRAL_QUESTION, FACILITY_HANDOFF, ...Object.values(REL_ROUTE_WORD)].join(" ");
    expect(copy).not.toMatch(/[—!]/);
  });
});

describe("the smart opening", () => {
  it("is null with no covenants at all, so the room asks the neutral question", () => {
    const { data, bundle } = dataWith([]);
    expect(relOpeningFor({ data, bundle })).toBeNull();
  });

  it("is null with no clock, rather than guessing one", () => {
    const { data, bundle } = dataWith([due(6)], null);
    expect(relOpeningFor({ data, bundle })).toBeNull();
  });

  it("leads on a test due soon, and routes it to the covenant review", () => {
    const { data, bundle } = dataWith([due(6)]);
    const opening = relOpeningFor({ data, bundle })!;
    expect(opening.line).toBe("The Debt Service Coverage test is due in 6 days. Run the covenant review?");
    expect(opening.route).toBe("covenant");
    expect(opening.covenantId).toBe("cov-1");
  });

  it("says today rather than in 0 days", () => {
    const { data, bundle } = dataWith([due(0)]);
    expect(relOpeningFor({ data, bundle })!.line).toContain("is due today.");
  });

  it("leads on the NEAREST of several due tests", () => {
    const { data, bundle } = dataWith([due(30, "Fixed Charge Coverage", "far"), due(4, "Leverage", "near")]);
    expect(relOpeningFor({ data, bundle })!.covenantId).toBe("near");
  });

  it("ignores a test due beyond the window", () => {
    const { data, bundle } = dataWith([due(120)]);
    expect(relOpeningFor({ data, bundle })).toBeNull();
  });

  it("leads on an OVERDUE test before a due one, and says how long", () => {
    const { data, bundle } = dataWith([due(3, "Leverage", "soon"), due(-12, "Fixed Charge Coverage", "late")]);
    const opening = relOpeningFor({ data, bundle })!;
    expect(opening.line).toBe("The Fixed Charge Coverage test was due 12 days ago. Run the covenant review?");
    expect(opening.covenantId).toBe("late");
  });

  it("leads on a FINANCIAL BREACH above everything, and routes it to the rating review", () => {
    const { data, bundle } = dataWith([
      due(2, "Leverage", "soon"),
      { covenantId: "bad", covenantType: "Debt Service Coverage", breached: true, latestComplianceStatus: "Exception" },
    ]);
    const opening = relOpeningFor({ data, bundle })!;
    expect(opening.line).toBe("The Debt Service Coverage test is in breach. Run the risk-rating review?");
    expect(opening.route).toBe("rating");
  });

  it("does NOT read an administrative Exception as a breach", () => {
    // nCino forces Exception onto any row whose due date has passed, measured or
    // not. Reading that as a breach would overstate deterioration on most of the
    // book, so the shared classifier's answer is the one that counts.
    const { data, bundle } = dataWith([
      { covenantId: "adm", covenantType: "Leverage", latestComplianceStatus: "Exception", nextEvaluationDate: "2026-09-05" },
    ]);
    const opening = relOpeningFor({ data, bundle })!;
    expect(opening.route).toBe("covenant");
    expect(opening.line).not.toContain("breach");
  });

  it("never leads on a waived test", () => {
    const { data, bundle } = dataWith([
      { covenantId: "w", covenantType: "Leverage", covenantStatus: "Waived", nextEvaluationDate: "2026-09-05" },
    ]);
    expect(relOpeningFor({ data, bundle })).toBeNull();
  });

  it("replaces the whole noun phrase when the covenant type is missing", () => {
    const { data, bundle } = dataWith([{ covenantId: "x", nextEvaluationDate: "2026-09-05", lastEvaluationStatus: "Compliant" }]);
    const line = relOpeningFor({ data, bundle })!.line;
    expect(line).toContain("The covenant test is due");
    expect(line).not.toContain("covenant covenant");
  });
});

describe("reading a route out of a typed line", () => {
  it("binds each of the five from the words a banker uses", () => {
    expect(readRelRouteIntent("run the annual review")).toBe("annual");
    expect(readRelRouteIntent("let's do the covenant review")).toBe("covenant");
    expect(readRelRouteIntent("revalue the collateral")).toBe("valuation");
    expect(readRelRouteIntent("re-rate this borrower")).toBe("rating");
    expect(readRelRouteIntent("raise a ticket for a payoff quote")).toBe("service");
  });

  it("reads the narrowest phrase first, so a valuation is not a rating", () => {
    // "collateral valuation" contains neither word the rating test looks for,
    // and the valuation test runs before the rating one regardless.
    expect(readRelRouteIntent("collateral valuation")).toBe("valuation");
    expect(readRelRouteIntent("review the risk rating")).toBe("rating");
  });

  it("reads 'annual covenant review' as the COVENANT review, and that is the honest read", () => {
    // A banker who says this means the covenant review that falls due annually,
    // not the periodic review of the whole relationship. The annual test looks
    // for "annual review" as a phrase precisely so this line does not steal it.
    expect(readRelRouteIntent("annual covenant review")).toBe("covenant");
    expect(readRelRouteIntent("run the annual review")).toBe("annual");
  });

  it("is null where the line names no review, so the room asks again", () => {
    // Guessing here picks a WRITE PATH, which is not a guess worth making.
    expect(readRelRouteIntent("what is going on with this client")).toBeNull();
    expect(readRelRouteIntent("")).toBeNull();
  });
});

describe("switching route mid-session", () => {
  it("moves only on a DIFFERENT review", () => {
    expect(readRelRouteSwitch("run the covenant review", "covenant")).toBeNull();
    expect(readRelRouteSwitch("actually value the collateral", "covenant")).toBe("valuation");
  });

  it("does not move on a line that merely mentions the other subject", () => {
    expect(readRelRouteSwitch("the collateral behind it is fine", "covenant")).toBeNull();
  });
});

describe("facility work", () => {
  it("recognises the four things this room does not do", () => {
    expect(asksForFacilityWork("pledge the receivables to the LoC")).toBe(true);
    expect(asksForFacilityWork("renew the revolver")).toBe(true);
    expect(asksForFacilityWork("modify the term loan")).toBe(true);
    expect(asksForFacilityWork("structure a new facility")).toBe(true);
  });

  it("does NOT claim a relationship-level create as facility work", () => {
    // Creating a covenant on the Account and creating a collateral the borrower
    // owns both live in THIS room, so "create" and "add" are deliberately not
    // facility words.
    expect(asksForFacilityWork("add a covenant on the relationship")).toBe(false);
    expect(asksForFacilityWork("create a new collateral asset")).toBe(false);
  });

  it("hands off in one professional line that names where the work lives", () => {
    expect(FACILITY_HANDOFF).toContain("Facility Actions");
    expect(FACILITY_HANDOFF).not.toMatch(/[—!]/);
  });
});
