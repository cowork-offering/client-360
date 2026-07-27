import { describe, expect, it } from "vitest";
import type { Covenant } from "./contract";
import { covenantCushion, covenantDirection, covenantUnit, covTone, fmtCovThreshold, fmtCovVal, gradeTone } from "./finance";

describe("covenantUnit — the TYPE decides, not the magnitude", () => {
  it("reads coverage, leverage and multiples as ratios", () => {
    for (const t of [
      "Debt Service Coverage of Borrower",
      "Debt Service Coverage with and without Distributions",
      "Fixed Charge Coverage Ratio",
      "Maximum Debt to Worth",
      "Debt-to-Worth",
      "Current Ratio",
      "Senior Leverage",
    ]) {
      expect(covenantUnit(t), t).toBe("ratio");
    }
  });

  it("reads advance and rate tests as percents", () => {
    for (const t of [
      "Accounts Receivable",
      "Accounts Receivable Advance Rate",
      "Inventory Advance",
      "Loan-to-Value",
      "LTV",
      "Customer Concentration",
    ]) {
      expect(covenantUnit(t), t).toBe("percent");
    }
  });

  it("reads money floors and caps as currency", () => {
    for (const t of ["Minimum Liquidity", "Tangible Net Worth", "Fixed Asset Purchases", "Working Capital", "Capex"]) {
      expect(covenantUnit(t), t).toBe("currency");
    }
  });

  it("never reads a hint out of the middle of a word", () => {
    // "corporate" contains "rate"; a substring test would relabel this covenant
    // as a percent and print "1.20%" where the org means 1.20×.
    expect(covenantUnit("Corporate Guarantee Coverage")).toBe("ratio");
  });

  it("falls back to magnitude only where the type says nothing", () => {
    // An amount is not a multiple: that is the one thing magnitude can prove.
    expect(covenantUnit("Mystery Covenant", 6_800_000)).toBe("currency");
    // It cannot tell a percent from a multiple, so the old default stands.
    expect(covenantUnit("Mystery Covenant", 1.25)).toBe("ratio");
    expect(covenantUnit(undefined)).toBe("ratio");
  });
});

describe("fmtCovVal renders a covenant in ITS OWN unit", () => {
  it("prints the Hartwell advance test as a percent, not a multiple", () => {
    // The literal defect from the validation audit: 80 rendered "80.00×".
    expect(fmtCovVal(80, "Accounts Receivable")).toBe("80%");
    expect(fmtCovThreshold("Accounts Receivable", 80, 80)).toBe("≥ 80%");
    expect(fmtCovVal(79.5, "Accounts Receivable")).toBe("79.5%");
  });

  it("prints money covenants as money", () => {
    expect(fmtCovVal(6_800_000, "Minimum Liquidity")).toBe("$6.80M");
    expect(fmtCovVal(5_000_000, "Minimum Liquidity")).toBe("$5M");
  });

  it("prints coverage covenants as multiples", () => {
    expect(fmtCovVal(1.38, "Debt Service Coverage of Borrower")).toBe("1.38×");
    expect(fmtCovVal(2.42, "Maximum Debt to Worth")).toBe("2.42×");
  });

  it("says nothing at all when the org has no figure", () => {
    expect(fmtCovVal(null, "Term Covenants")).toBe("—");
    expect(fmtCovVal(undefined, "Term Covenants")).toBe("—");
    expect(fmtCovThreshold("Term Covenants", null, null)).toBe("—");
  });

  it("keeps the magnitude behaviour for a caller with no type to give", () => {
    expect(fmtCovVal(1.42)).toBe("1.42×");
    expect(fmtCovVal(8_200_000)).toBe("$8.20M");
  });
});


describe("covenantDirection", () => {
  it("treats coverage/liquidity as floors", () => {
    expect(covenantDirection("Debt Service Coverage Ratio", 1.4, 1.25)).toBe("floor");
    expect(covenantDirection("Minimum Liquidity", 8_200_000, 5_000_000)).toBe("floor");
  });
  it("treats leverage/capex/limits as caps", () => {
    expect(covenantDirection("Debt-to-Worth", 2.18, 3.0)).toBe("cap");
    expect(covenantDirection("Fixed Asset Purchases Limit", 1_250_000, 7_500_000)).toBe("cap");
  });
  it("falls back to the compliant sign when keywords are inconclusive", () => {
    expect(covenantDirection("Mystery Ratio", 5, 3)).toBe("floor"); // actual >= threshold
    expect(covenantDirection("Mystery Ratio", 2, 3)).toBe("cap"); // actual < threshold
  });
});

describe("covenantCushion", () => {
  it("computes a positive floor cushion (actual − threshold)", () => {
    const c = covenantCushion("DSC", 1.42, 1.25);
    expect(c.dir).toBe("floor");
    expect(c.cushion).toBeCloseTo(0.17, 5);
    expect(c.safe).toBe(true);
  });
  it("computes a positive cap cushion (threshold − actual)", () => {
    const c = covenantCushion("Leverage", 2.18, 3.0);
    expect(c.dir).toBe("cap");
    expect(c.cushion).toBeCloseTo(0.82, 5);
    expect(c.safe).toBe(true);
  });
  it("flags a breached cap (actual above the cap)", () => {
    const c = covenantCushion("Leverage", 4.2, 3.0);
    expect(c.safe).toBe(false);
    expect(c.cushion).toBeLessThan(0);
  });
  it("returns null cushion when a value is missing", () => {
    expect(covenantCushion("DSC", null, 1.25).cushion).toBeNull();
    expect(covenantCushion("DSC", 1.4, undefined).safe).toBeNull();
  });
  it("clamps the headroom percentage to 0..100", () => {
    expect(covenantCushion("Leverage", 4.2, 3.0).pct).toBe(0); // unsafe → 0 room
    expect(covenantCushion("Liquidity", 50_000_000, 5_000_000).pct).toBe(100);
  });
});

describe("covTone", () => {
  const base: Covenant = { covenantType: "DSC", actualValue: 1.4, thresholdValue: 1.25 };
  it("is red when breached", () => expect(covTone({ ...base, breached: true })).toBe("red"));
  it("is red on a non-compliant status", () => expect(covTone({ ...base, lastEvaluationStatus: "Non-Compliant" })).toBe("red"));
  it("is amber on a watch status", () => expect(covTone({ ...base, lastEvaluationStatus: "Watch" })).toBe("amber"));
  it("is green when compliant", () => expect(covTone({ ...base, lastEvaluationStatus: "Compliant" })).toBe("green"));
});

describe("gradeTone", () => {
  it("maps grade bands to tones", () => {
    expect(gradeTone(3)).toBe("green");
    expect(gradeTone(5)).toBe("amber");
    expect(gradeTone(8)).toBe("red");
    expect(gradeTone(null)).toBe("neutral");
  });
});
