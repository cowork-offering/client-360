import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { buildTicket, deltaHeading, promptFor, ratingFacts, reviewFacts, ticketDeltas } from "./dealTicket";
import { buildBriefing } from "./briefing";
import { buildPanelSchema, overrideNeedsComment } from "./schemas";
import sample from "../../../artifact/sample-data.json";

const DATA = sample as unknown as C360Data;
const BUNDLES = Object.entries(DATA.borrowers ?? {});
const ACTIONS = [
  "annual-review",
  "collateral-valuation",
  "create-service-request",
  "new-facility-request",
  "risk-rating-review",
  "covenant-review",
  "loan-modification",
  "renewal",
];

function ticketFor(actionId: string, accountId: string, bundle: BorrowerBundle) {
  const name = bundle.snapshot?.name ?? "the relationship";
  const schema = buildPanelSchema(actionId, { bundle, accountId, accountName: name })!;
  const briefing = buildBriefing(actionId, schema, bundle, name)!;
  return { schema, briefing, ticket: buildTicket(actionId, schema, briefing) };
}

describe("the ticket is a view over the schema, never a second declaration", () => {
  it("asks for every value the banker owns, as hero or pill, on every action", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of ACTIONS) {
        const { schema, ticket } = ticketFor(actionId, id, b as BorrowerBundle);
        const asked = new Set([ticket.heroKey, ...ticket.pillKeys].filter(Boolean));
        for (const f of schema.fields.filter((x) => x.required && x.editable)) {
          expect(asked.has(f.key), `${actionId}: ${f.key} is required but never asked for`).toBe(true);
        }
      }
    }
  });

  it("never puts one field in two places", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of ACTIONS) {
        const { ticket } = ticketFor(actionId, id, b as BorrowerBundle);
        expect(ticket.pillKeys).not.toContain(ticket.heroKey);
        expect(new Set(ticket.pillKeys).size).toBe(ticket.pillKeys.length);
      }
    }
  });

  it("leads with the value that carries each action", () => {
    const [id, b] = BUNDLES[0];
    expect(ticketFor("collateral-valuation", id, b as BorrowerBundle).ticket.heroKey).toBe("value");
    expect(ticketFor("create-service-request", id, b as BorrowerBundle).ticket.heroKey).toBe("subject");
    expect(ticketFor("annual-review", id, b as BorrowerBundle).ticket.heroKey).toBe("reviewType");
    expect(ticketFor("new-facility-request", id, b as BorrowerBundle).ticket.heroKey).toBe("amount");
    expect(ticketFor("loan-modification", id, b as BorrowerBundle).ticket.heroKey).toBe("newCommitment");
    expect(ticketFor("renewal", id, b as BorrowerBundle).ticket.heroKey).toBe("newMaturityDate");
    // A package-scoped covenant review has NO hero: the verdict is per covenant
    // and lives on the covenant row, so no single value carries the ticket.
    expect(ticketFor("covenant-review", id, b as BorrowerBundle).ticket.heroKey).toBeUndefined();
  });

  it("names every section against a field the schema actually has", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of ACTIONS) {
        const { schema, ticket } = ticketFor(actionId, id, b as BorrowerBundle);
        const keys = new Set(schema.fields.map((f) => f.key));
        for (const k of ticket.sections) expect(keys.has(k), `${actionId}: ${k}`).toBe(true);
      }
    }
  });

  it("carries the subject from the briefing, so both surfaces say one thing", () => {
    const [id, b] = BUNDLES.find(([, x]) => (x as BorrowerBundle).snapshot?.name === "Sterling Fabrication Co.")!;
    const { briefing, ticket } = ticketFor("annual-review", id, b as BorrowerBundle);
    expect(ticket.title).toBe(briefing.subject.title);
    expect(ticket.title).toContain("Sterling Fabrication Co.");
    expect(ticket.context).toMatch(/is carried at \$[\d.]+[KMB] committed/);
  });

  it("reuses the briefing's prompt for an empty value", () => {
    const [id, b] = BUNDLES[0];
    const { briefing } = ticketFor("collateral-valuation", id, b as BorrowerBundle);
    expect(promptFor(briefing, "valuationDate")).toBe("pick the valuation date");
    expect(promptFor(briefing, "nonesuch")).toBe("choose");
  });
});

describe("the delta readout", () => {
  const bundle: BorrowerBundle = {
    snapshot: { accountId: "001X" },
    exposure: {
      totalOutstanding: 10_000_000,
      facilities: [
        {
          loanId: "a1X1",
          totalLendableValue: 8_000_000,
          collateral: [{ collateralId: "COL1", advanceRate: 80, currentLendableValue: 8_000_000, collateralValue: 10_000_000 }],
        },
      ],
    },
  };

  it("runs the product's own coverage math on the hero value", () => {
    const deltas = ticketDeltas("collateral-valuation", bundle, { value: 12_000_000 });
    // 12.0M at an 80 percent advance rate is 9.6M lendable, against 10.0M drawn.
    expect(deltas[0]).toMatchObject({ label: "Lendable value", before: "$8M", after: "$9.60M", direction: "up" });
    expect(deltas[1]).toMatchObject({ label: "Collateral coverage", before: "0.80×", after: "0.96×", direction: "up" });
    expect(deltas[1].note).toContain("$10M drawn");
  });

  it("shows a fall as a fall", () => {
    const deltas = ticketDeltas("collateral-valuation", bundle, { value: 5_000_000 });
    expect(deltas[0].direction).toBe("down");
    expect(deltas[1].direction).toBe("down");
  });

  it("renders nothing until the hero value is there", () => {
    expect(ticketDeltas("collateral-valuation", bundle, {})).toEqual([]);
    expect(ticketDeltas("collateral-valuation", bundle, { value: null })).toEqual([]);
    expect(ticketDeltas("collateral-valuation", bundle, { value: 0 })).toEqual([]);
  });

  it("renders nothing when an input it needs is missing, rather than guessing", () => {
    const noRate = structuredClone(bundle);
    delete noRate.exposure!.facilities![0].collateral![0].advanceRate;
    expect(ticketDeltas("collateral-valuation", noRate, { value: 12_000_000 })).toEqual([]);

    // A missing lendable value is not a zero.
    const noLendable = structuredClone(bundle);
    delete noLendable.exposure!.facilities![0].totalLendableValue;
    expect(ticketDeltas("collateral-valuation", noLendable, { value: 12_000_000 })).toEqual([]);

    const noCollateral = structuredClone(bundle);
    noCollateral.exposure!.facilities![0].collateral = [];
    expect(ticketDeltas("collateral-valuation", noCollateral, { value: 12_000_000 })).toEqual([]);
  });

  it("gives the lendable line without a coverage line when nothing is drawn", () => {
    const undrawn = structuredClone(bundle);
    undrawn.exposure!.totalOutstanding = 0;
    const deltas = ticketDeltas("collateral-valuation", undrawn, { value: 12_000_000 });
    expect(deltas).toHaveLength(1);
    expect(deltas[0].label).toBe("Lendable value");
  });

  it("has nothing to say for actions whose input moves no figure", () => {
    expect(ticketDeltas("annual-review", bundle, { reviewType: "Annual" })).toEqual([]);
    expect(ticketDeltas("create-service-request", bundle, { subject: "x" })).toEqual([]);
    expect(ticketDeltas("collateral-valuation", null, { value: 1 })).toEqual([]);
  });
});

describe("what an annual review covers", () => {
  const bundle: BorrowerBundle = {
    snapshot: { accountId: "001X", primaryRiskRating: "5" },
    exposure: {
      totalCommitted: 18_000_000,
      totalOutstanding: 16_900_000,
      facilities: [{ loanId: "a1X1", totalLendableValue: 8_000_000 }],
    },
    covenants: {
      covenants: [
        { covenantId: "c1", covenantType: "Debt Service Coverage Ratio", actualValue: 1.38, thresholdValue: 1.3 },
        { covenantId: "c2", covenantType: "Total Leverage", actualValue: 2.95, thresholdValue: 3.5 },
      ],
    },
  };

  it("summarises the covenant position and names where it is tightest", () => {
    const facts = reviewFacts(bundle);
    const cov = facts.find((f) => f.label === "Covenants")!;
    expect(cov.value).toBe("2 of 2 within threshold");
    expect(cov.note).toContain("Debt Service Coverage Ratio");
  });

  it("states utilisation only when both sides are staged", () => {
    expect(reviewFacts(bundle).find((f) => f.label === "Utilisation")!.value).toBe("94 percent");
    const noDrawn = structuredClone(bundle);
    delete noDrawn.exposure!.totalOutstanding;
    expect(reviewFacts(noDrawn).some((f) => f.label === "Utilisation")).toBe(false);
  });

  it("drops a line rather than inventing a value for it", () => {
    const bare: BorrowerBundle = { snapshot: { accountId: "001X" } };
    const facts = reviewFacts(bare);
    expect(facts.some((f) => f.label === "Covenants")).toBe(false);
    expect(facts.some((f) => f.label === "Utilisation")).toBe(false);
    expect(facts.some((f) => f.label === "In scope")).toBe(false);
    // Nothing renders a dash, a zero or an "unknown".
    for (const f of facts) expect(f.value).not.toMatch(/^(—|0|unknown)$/i);
  });

  it("counts an unmeasurable covenant out rather than calling it compliant", () => {
    const partial = structuredClone(bundle);
    partial.covenants!.covenants!.push({ covenantId: "c3", covenantType: "Fixed Charge", actualValue: undefined });
    expect(reviewFacts(partial).find((f) => f.label === "Covenants")!.value).toBe("2 of 2 within threshold");
  });

  it("says what the narratives will carry, and that every figure traces", () => {
    const n = reviewFacts(bundle).find((f) => f.label === "Narratives")!;
    expect(n.value).toMatch(/^\d+ drafted$/);
    expect(n.note).toContain("traceable");
  });

  it("has nothing to say without a bundle", () => {
    expect(reviewFacts(null)).toEqual([]);
  });
});

describe("wave 2 — the modification's delta drama", () => {
  const bundle: BorrowerBundle = {
    snapshot: { accountId: "001X" },
    exposure: {
      totalCommitted: 10_000_000,
      totalOutstanding: 9_000_000,
      facilities: [{ loanId: "a1X1", committed: 10_000_000, totalLendableValue: 12_000_000 }],
    },
    boom: { ratios: { ebitda: 5_000_000, totalLeverage: 2.0 } },
  };

  it("moves commitment, coverage and leverage together", () => {
    const d = ticketDeltas("loan-modification", bundle, { newCommitment: 13_000_000 });
    expect(d.map((x) => x.label)).toEqual(["Commitment", "Collateral coverage", "Total leverage"]);
    expect(d[0]).toMatchObject({ before: "$10M", after: "$13M", direction: "up" });
    // 12.0M lendable over 13.0M committed.
    expect(d[1]).toMatchObject({ before: "1.20×", after: "0.92×", direction: "down" });
    // +3.0M of debt on 5.0M of EBITDA: 2.00x becomes 2.60x, and MORE leverage
    // is a worse position, so the direction reads as a fall.
    expect(d[2]).toMatchObject({ before: "2.00x", after: "2.60x", direction: "down" });
  });

  it("restates leverage on unchanged earnings, and says so", () => {
    const d = ticketDeltas("loan-modification", bundle, { newCommitment: 13_000_000 });
    expect(d[2].note).toContain("earnings unchanged");
  });

  it("drops the leverage line when Boom staged no EBITDA to restate on", () => {
    const noBoom = structuredClone(bundle);
    delete noBoom.boom;
    const d = ticketDeltas("loan-modification", noBoom, { newCommitment: 13_000_000 });
    expect(d.map((x) => x.label)).toEqual(["Commitment", "Collateral coverage"]);
  });

  it("drops the coverage line when a lendable value is missing, never treating it as zero", () => {
    const partial = structuredClone(bundle);
    delete partial.exposure!.facilities![0].totalLendableValue;
    expect(ticketDeltas("loan-modification", partial, { newCommitment: 13_000_000 }).map((x) => x.label)).toEqual([
      "Commitment",
      "Total leverage",
    ]);
  });

  it("says nothing until a new commitment is entered", () => {
    expect(ticketDeltas("loan-modification", bundle, {})).toEqual([]);
    expect(ticketDeltas("loan-modification", bundle, { newCommitment: 0 })).toEqual([]);
  });

  it("adds a new facility to the book total", () => {
    const d = ticketDeltas("new-facility-request", bundle, { amount: 5_000_000 });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ label: "Total committed", before: "$10M", after: "$15M", direction: "up" });
  });

  it("has nothing to say for a renewal's maturity date", () => {
    expect(ticketDeltas("renewal", bundle, { newMaturityDate: "2027-01-01" })).toEqual([]);
  });
});

describe("wave 2 — the rating position", () => {
  it("states the grade on file", () => {
    const b: BorrowerBundle = { snapshot: { accountId: "001X", primaryRiskRating: "5" } };
    expect(ratingFacts(b)[0]).toMatchObject({ label: "Current grade", value: "Grade 5" });
  });

  it("reports a computed grade ONLY when the org staged one", () => {
    const b: BorrowerBundle = { snapshot: { accountId: "001X", primaryRiskRating: "5" } };
    expect(ratingFacts(b).some((f) => f.label === "Computed grade")).toBe(false);

    const withComputed: BorrowerBundle = { snapshot: { accountId: "001X", primaryRiskRating: "5", computedRiskRating: "6" } };
    const f = ratingFacts(withComputed).find((x) => x.label === "Computed grade")!;
    expect(f.value).toBe("Grade 6");
    expect(f.note).toContain("differs");
  });

  it("shows the override as the banker's own call once one is entered", () => {
    const b: BorrowerBundle = { snapshot: { accountId: "001X", primaryRiskRating: "5" } };
    const f = ratingFacts(b, { overrideValue: 4 }).find((x) => x.label === "Override")!;
    expect(f.value).toBe("Grade 4");
    expect(f.note).toContain("stated reason");
  });

  it("has nothing to say without a bundle", () => {
    expect(ratingFacts(null)).toEqual([]);
  });
});

describe("wave 2 — an override requires a stated reason (org VR)", () => {
  it("refuses an override with no reason", () => {
    expect(overrideNeedsComment({ overrideValue: 4 })).toBe(true);
    expect(overrideNeedsComment({ overrideValue: 4, overrideComment: "   " })).toBe(true);
    expect(overrideNeedsComment({ overrideValue: "4" })).toBe(true);
  });

  it("is satisfied by a reason, and irrelevant without an override", () => {
    expect(overrideNeedsComment({ overrideValue: 4, overrideComment: "Collateral position improved." })).toBe(false);
    expect(overrideNeedsComment({})).toBe(false);
    expect(overrideNeedsComment({ overrideValue: 0 })).toBe(false);
    expect(overrideNeedsComment({ overrideComment: "orphan reason" })).toBe(false);
  });
});

describe("the valuation readout never claims the rollup will fire (Probe 6)", () => {
  it("says IMPLIES, and carries the org's actual behaviour as a caveat", () => {
    const h = deltaHeading("collateral-valuation");
    expect(h.title).toBe("What this valuation implies");
    expect(h.caveat).toContain("does not move the collateral value");
    expect(h.caveat).toContain("Add Valuation");
    // The one sentence the ledger forbids.
    expect(`${h.title} ${h.caveat}`.toLowerCase()).not.toContain("coverage improves");
  });

  it("qualifies the lendable line as conditional on a revaluation", () => {
    const bundle: BorrowerBundle = {
      snapshot: { accountId: "001X" },
      exposure: {
        totalOutstanding: 10_000_000,
        facilities: [
          {
            loanId: "a1X1",
            totalLendableValue: 8_000_000,
            collateral: [{ collateralId: "COL1", advanceRate: 80, currentLendableValue: 8_000_000 }],
          },
        ],
      },
    };
    expect(ticketDeltas("collateral-valuation", bundle, { value: 12_000_000 })[0].note).toContain("if the collateral is revalued");
  });

  it("leaves every other action's heading plain", () => {
    expect(deltaHeading("loan-modification")).toEqual({ title: "What this changes" });
    expect(deltaHeading("new-facility-request").caveat).toBeUndefined();
  });
});

describe("the delta readout on the distinct-collateral basis", () => {
  /* A revaluation moves the DISTINCT collateral base, not a sum of facility
     shares. Piedmont is the case that separates them: 9.25MM of pledged share
     against a 14.0MM distinct lendable base. The what-if reads the org's own
     figure where the read carries it. */
  const bundle: BorrowerBundle = {
    snapshot: { accountId: "001bb00001DLtRMAA1" },
    exposure: {
      totalCommitted: 17_500_000,
      totalOutstanding: 8_500_000,
      coverageRatio: 1.65,
      totalUniqueCollateralLendableValue: 14_000_000,
      uniqueCollateralCount: 2,
      facilities: [
        {
          loanId: "a4Zbb000001vaxREAQ",
          totalPledgedValue: 9_250_000,
          totalLendableValue: 9_250_000,
          collateral: [
            { collateralId: "a35bb000000zOgXAAU", advanceRate: 80, currentLendableValue: 10_000_000, collateralValue: 12_500_000, amountPledged: 5_000_000 },
          ],
        },
      ],
    },
  };

  it("takes the org's distinct-collateral base, not the sum of facility shares", () => {
    const deltas = ticketDeltas("collateral-valuation", bundle, { value: 15_000_000 });
    // 14.0M base, less the 10.0M record being revalued, plus 15.0M at 80 percent.
    expect(deltas[0]).toMatchObject({ label: "Lendable value", before: "$14M", after: "$16M", direction: "up" });
    expect(deltas[1]).toMatchObject({ label: "Collateral coverage", before: "1.65×", after: "1.88×" });
  });

  it("falls back to the sum of PLEDGED SHARES on a bundle without the org figure", () => {
    const older = structuredClone(bundle);
    delete older.exposure!.totalUniqueCollateralLendableValue;
    const deltas = ticketDeltas("collateral-valuation", older, { value: 15_000_000 });
    // 9.25M of share, less the 10.0M record, plus 12.0M lendable.
    expect(deltas[0]).toMatchObject({ label: "Lendable value", before: "$9.25M" });
  });

  it("withholds the whole readout when a facility's pledged share is missing", () => {
    const partial = structuredClone(bundle);
    delete partial.exposure!.totalUniqueCollateralLendableValue;
    delete partial.exposure!.facilities![0].totalPledgedValue;
    delete partial.exposure!.facilities![0].totalLendableValue;
    expect(ticketDeltas("collateral-valuation", partial, { value: 15_000_000 })).toEqual([]);
  });

  it("prices a modification against the same distinct-collateral base", () => {
    const deltas = ticketDeltas("loan-modification", bundle, { newCommitment: 20_000_000 });
    const coverage = deltas.find((d) => d.label === "Collateral coverage")!;
    expect(coverage.note).toContain("$14M lendable");
  });
});
