import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../../data/contract";
import { NO_COMPLIANCE_ROW, relBookFor, relEntities } from "./relBook";
import { relContextFor, type RelContext } from "./reviewFlows";

/* =============================================================================
   THE BOOK THIS RELATIONSHIP ALREADY CARRIES.

   Two things this holds. First, that the book REMOVES QUESTIONS and never
   removes a decision: every verdict and every figure is offered with the org's
   own reading beside it and not one is answered on the banker's behalf. Second,
   and harder, that every ABSENCE is honest: the read carries no valuation date
   and no filed review, and the book says so rather than implying there is none.
   ============================================================================= */

const PACKAGE = "a5Fbb000000IHFJEA4";

function ctxFor(covenants: unknown[]): RelContext {
  const bundle = {
    snapshot: { accountId: "001X", name: "Hartwell", productPackageId: PACKAGE, primaryRiskRating: "4" },
    exposure: {
      facilities: [
        {
          loanId: "0Cb1",
          status: "Active",
          productPackageId: PACKAGE,
          collateral: [
            {
              collateralId: "a35A",
              collateralName: "COL-000763",
              collateralDescription: "Inventory, Fort Wayne",
              collateralType: "UCC-Inventory",
              collateralValue: 8_000_000,
              // THE PLEDGE FIGURE, at the 50 percent policy rate. The ASSET's
              // own formula says 6,400,000 at the 80 percent type rate.
              currentLendableValue: 4_000_000,
              advanceRate: 50,
              advanceRateSource: "Pledge override",
            },
          ],
        },
      ],
    },
    covenants: { covenants },
  } as unknown as BorrowerBundle;
  const data = { meta: { generatedAt: "2026-09-02" } } as unknown as C360Data;
  return relContextFor({ data, bundle, accountId: "001X", accountName: "Hartwell" });
}

const COV = {
  covenantId: "cov1",
  covenantType: "Debt Service Coverage of Borrower",
  thresholdValue: 1.25,
  actualValue: 1.38,
  nextEvaluationDate: "2026-09-30",
  frequency: "Quarterly",
  lastEvaluationStatus: "Compliant",
};

describe("the book reads what the relationship carries", () => {
  it("builds the rail the room writes, and the model never does", () => {
    const book = relBookFor(ctxFor([{ ...COV, latestComplianceId: "a2X", latestComplianceStatus: "Pending" }]));
    expect(book.covenants[0].rail).toBe("1.38× vs ≥ 1.25×");
    expect(book.covenants[0].daysToTest).toBe(28);
    expect(book.covenants[0].frequency).toBe("Quarterly");
  });

  it("names the PLEDGE lendable value, never the asset's own formula", () => {
    const book = relBookFor(ctxFor([]));
    // 8.0MM at the 80 percent TYPE rate would read $6.4MM. The bank lends
    // against the pledge, and the pledge carries a 50 percent policy override.
    expect(book.assets[0].lendable).toBe("$4M");
    expect(book.assets[0].value).toBe("$8M");
    expect(book.assets[0].advanceRateSource).toBe("Pledge override");
  });

  it("carries NO valuation date on any asset, because no read holds one", () => {
    const book = relBookFor(ctxFor([]));
    // An honest null. When Customer360Exposure starts returning
    // LLC_BI__Valuation_Date__c this becomes a date and the staleness signal
    // becomes sayable; until then it is not, and the room says nothing.
    expect(book.assets.every((a) => a.lastValued === null)).toBe(true);
  });

  it("reads a row from EITHER signal: an id, or that row's own status", () => {
    // Hartwell carries neither on all six covenants, which is the case the
    // predicate exists for. A staged status with no id is still a row.
    const byStatus = relBookFor(ctxFor([{ ...COV, latestComplianceStatus: "Pending" }]));
    expect(byStatus.covenants[0].assessable).toBe(true);
    expect(byStatus.noComplianceRows).toBe(false);
    const byId = relBookFor(ctxFor([{ ...COV, latestComplianceId: "a2X" }]));
    expect(byId.covenants[0].assessable).toBe(true);
  });

  it("says it cannot see the reviews already on file rather than implying there are none", () => {
    expect(relBookFor(ctxFor([])).reviews).toEqual({ carried: false, open: [] });
  });
});

describe("the covenant route refuses first, in banker language", () => {
  it("raises the honesty gate where NOT ONE covenant carries a compliance row", () => {
    const book = relBookFor(
      ctxFor([
        { ...COV, latestComplianceId: null },
        { ...COV, covenantId: "cov2", covenantType: "Minimum Liquidity", latestComplianceId: null },
      ]),
    );
    expect(book.noComplianceRows).toBe(true);
    expect(book.assessableCount).toBe(0);
    expect(book.covenants[0].assessable).toBe(false);
    expect(book.covenants[0].reason).toContain("no compliance row");
    expect(NO_COMPLIANCE_ROW(2)).toContain("no open test period on any of the 2 covenants");
  });

  it("does not raise it where one covenant can be assessed", () => {
    const book = relBookFor(
      ctxFor([
        { ...COV, latestComplianceId: "a2X", latestComplianceStatus: "Pending" },
        { ...COV, covenantId: "cov2", latestComplianceId: null },
      ]),
    );
    expect(book.noComplianceRows).toBe(false);
    expect(book.assessableCount).toBe(1);
  });

  it("marks a row that is open and NOT Pending as needing the explicit opt-in", () => {
    const book = relBookFor(ctxFor([{ ...COV, latestComplianceId: "a2X", latestComplianceStatus: "In Progress" }]));
    expect(book.covenants[0].assessable).toBe(true);
    expect(book.covenants[0].needsNonPendingOptIn).toBe(true);
  });

  it("leaves a Pending row needing no opt-in at all", () => {
    const book = relBookFor(ctxFor([{ ...COV, latestComplianceId: "a2X", latestComplianceStatus: "Pending" }]));
    expect(book.covenants[0].needsNonPendingOptIn).toBe(false);
  });

  it("raises nothing on a relationship with no covenants: an empty book is not a refusal", () => {
    expect(relBookFor(ctxFor([])).noComplianceRows).toBe(false);
  });
});

describe("the entities the greeting rail needs and no read block carries", () => {
  it("offers the grade on file, so the greeting's grade row gets a rail", () => {
    const rows = relEntities(relBookFor(ctxFor([])));
    expect(rows.map((r) => r.name)).toEqual(["Risk grade", "Grade on file"]);
    expect(rows[0].value).toBe("grade 4");
  });

  it("offers nothing where the read stages no grade", () => {
    const ctx = ctxFor([]);
    const stripped = { ...ctx, bundle: { ...ctx.bundle!, snapshot: { accountId: "001X" } } } as RelContext;
    expect(relEntities(relBookFor(stripped))).toEqual([]);
  });
});
