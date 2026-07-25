import { describe, expect, it } from "vitest";
import type { Covenant } from "./contract";
import { covenantCushion, covenantDirection, covTone, gradeTone } from "./finance";

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
