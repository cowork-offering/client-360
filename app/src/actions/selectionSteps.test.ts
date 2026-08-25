import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { buildPanelSchema, REVIEW_FORK } from "./schemas";
import { collateralDetail, collateralRecords, valuableRecords } from "../data/collateralRecords";
import live from "../../../artifact/live-data.json";

/* =============================================================================
   SELECTION STEPS. The UI is real; the wire is not there yet, and the ticket
   says so rather than filing N plans dressed up as one.
   ============================================================================= */

const HARTWELL = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"]!;

const schemaFor = (actionId: string, bundle: BorrowerBundle) =>
  buildPanelSchema(actionId, { bundle, accountId: "001X", accountName: "Testco" })!;

describe("collateral records: one row per piece of security, not per pledge", () => {
  const shared: BorrowerBundle = {
    snapshot: { accountId: "001X", name: "Testco" },
    exposure: {
      facilities: [
        {
          loanId: "L1",
          name: "Term Loan",
          status: "Open",
          collateral: [
            { collateralId: "COL1", collateralType: "Equipment", collateralValue: 6_000_000, advanceRate: 80, lienPosition: "1st" },
          ],
        },
        {
          loanId: "L2",
          name: "Revolver",
          status: "Open",
          // The SAME piece of equipment, pledged again against a second loan.
          collateral: [
            { collateralId: "COL1", collateralType: "Equipment", collateralValue: 6_000_000, advanceRate: 80 },
            { collateralId: "COL2", collateralType: "Accounts Receivable", collateralValue: 2_000_000, advanceRate: 70 },
          ],
        },
      ],
    },
  };

  it("collapses a piece pledged twice into one record", () => {
    const rows = collateralRecords(shared);
    expect(rows.map((r) => r.collateralId)).toEqual(["COL1", "COL2"]);
    expect(rows[0].pledgeRows).toBe(2);
  });

  it("names every facility the piece secures", () => {
    const rows = collateralRecords(shared);
    expect(rows[0].securesFacilities).toEqual(["Term Loan", "Revolver"]);
    expect(collateralDetail(rows[0])).toContain("secures 2 facilities");
    expect(collateralDetail(rows[1])).toContain("secures Revolver");
  });

  it("carries the context a banker needs to choose", () => {
    const detail = collateralDetail(collateralRecords(shared)[0]);
    expect(detail).toContain("carried at 6,000,000");
    expect(detail).toContain("80 percent advance");
    expect(detail).toContain("1st lien");
  });

  it("lists a pledge with no record id, but never as valuable", () => {
    const unanchored: BorrowerBundle = {
      snapshot: { accountId: "001X" },
      exposure: { facilities: [{ loanId: "L1", status: "Open", collateral: [{ collateralType: "Inventory" }] }] },
    };
    expect(collateralRecords(unanchored)).toHaveLength(1);
    expect(valuableRecords(unanchored)).toHaveLength(0);
  });

  it("ignores collateral on facilities that are no longer live", () => {
    const closed: BorrowerBundle = {
      snapshot: { accountId: "001X" },
      exposure: { facilities: [{ loanId: "L1", status: "Paid Off", collateral: [{ collateralId: "C", collateralType: "Equipment" }] }] },
    };
    expect(collateralRecords(closed)).toEqual([]);
  });

  it("offers each record once in the ticket, with its context", () => {
    const f = schemaFor("collateral-valuation", shared).fields.find((x) => x.key === "records")!;
    expect(f.type).toBe("multiselect");
    expect(f.options).toEqual(["COL1", "COL2"]);
    expect(f.optionLabels).toEqual(["Equipment", "Accounts Receivable"]);
    expect(f.optionDetails?.[0]).toContain("secures 2 facilities");
    // Per-item value entry, keyed so each record carries its own new figure.
    expect(f.perItemInputs).toEqual([
      { valueKey: "recordValues", label: "New value", type: "currency", placeholder: "enter the new valuation" },
    ]);
  });

  it("preselects a lone record, and leaves a real choice open", () => {
    const one: BorrowerBundle = {
      snapshot: { accountId: "001X" },
      exposure: { facilities: [{ loanId: "L1", status: "Open", collateral: [{ collateralId: "C", collateralType: "Equipment" }] }] },
    };
    expect(schemaFor("collateral-valuation", one).fields.find((x) => x.key === "records")!.value).toEqual(["C"]);
    expect(schemaFor("collateral-valuation", shared).fields.find((x) => x.key === "records")!.value).toEqual([]);
  });
});

describe("Credit Review and Risk Rating Review are different instruments", () => {
  it("says which instrument each ticket raises", () => {
    expect(schemaFor("annual-review", HARTWELL).intro).toContain("CREDIT REVIEW");
    expect(schemaFor("risk-rating-review", HARTWELL).intro).toContain("RISK RATING REVIEW");
  });

  it("tells the banker what the other one is", () => {
    expect(schemaFor("annual-review", HARTWELL).intro).toContain("Distinct from a Risk Rating Review");
    expect(schemaFor("risk-rating-review", HARTWELL).intro).toContain("Distinct from a Credit Review");
  });

  it("writes to different objects, which is why the distinction matters", () => {
    expect(schemaFor("annual-review", HARTWELL).writeObject).toBe("LLC_BI__Review__c");
    expect(schemaFor("risk-rating-review", HARTWELL).writeObject).toBe("LLC_BI__Annual_Review__c");
  });

  it("gives the rating review NO facility scope: the rating is the relationship's", () => {
    const schema = schemaFor("risk-rating-review", HARTWELL);
    expect(schema.fields.some((f) => f.type === "multiselect")).toBe(false);
    expect(REVIEW_FORK["risk-rating-review"].explains).toContain("carries no facility scope");
  });
});

describe("a credit action is package-centric", () => {
  it("offers Hartwell's six booked facilities as a selection within the package", () => {
    const f = schemaFor("loan-modification", HARTWELL).fields.find((x) => x.key === "facility")!;
    expect(f.type).toBe("multiselect");
    expect(f.options).toHaveLength(6);
    expect(f.label).toContain("Facilities in this credit action");
    // Each carries what a banker needs to choose between them: the figures on
    // the detail line, the stage as its own chip (founder finding F1).
    expect(f.optionDetails?.[0]).toContain("committed");
    expect(f.optionDetails?.[0]).not.toContain("Booked");
    expect(f.optionChips?.[0]).toBe("Booked");
  });

  it("preselects one so the ticket opens ready", () => {
    expect(schemaFor("loan-modification", HARTWELL).fields.find((x) => x.key === "facility")!.value).toHaveLength(1);
  });
});
