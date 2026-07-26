import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { buildTicket, promptFor, reviewFacts, ticketDeltas } from "./dealTicket";
import { buildBriefing } from "./briefing";
import { buildPanelSchema } from "./schemas";
import sample from "../../../artifact/sample-data.json";

const DATA = sample as unknown as C360Data;
const BUNDLES = Object.entries(DATA.borrowers ?? {});
const ACTIONS = ["annual-review", "collateral-valuation", "create-service-request"];

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
