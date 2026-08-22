import { describe, expect, it } from "vitest";
import type { Covenant } from "../data/contract";
import {
  ADMINISTRATIVE_EXCEPTION_NOTE,
  administrativeExceptions,
  classifyCovenant,
  financialBreaches,
  severityTone,
  thresholdViolation,
} from "./covenantStatus";

/** What a surface renders: the verdict's severity, as a tone. */
const tone = (c: Covenant) => severityTone(classifyCovenant(c).severity);

/* =============================================================================
   THE CLASSIFIER, AGAINST THE ORG'S OWN VOCABULARY.

   The status strings tested here are the ones `bankinggpt` actually holds.
   `LLC_BI__Covenant_Status__c` is `restricted = false`, so the live values run
   past the documented picklist: Pending, In Progress, Compliant, Waived,
   Exception, breached, overdue, <10% headroom, >10% headroom, Active, Pass,
   Fail (ACTIONS-DESIGN 5.4). `LLC_BI__Last_Evaluation_Status__c` carries
   Compliant / Non-Compliant in the staged reads.

   The load-bearing case: Exception with NOTHING measured. 101 of 140 compliance
   rows in this org sit exactly there, and calling any of them a breach would
   overstate credit deterioration across most of the book.
   ============================================================================= */

/** A floor test (DSC): actual must be at or above the threshold. */
const floor = (over: Partial<Covenant> = {}): Covenant => ({
  covenantType: "Debt Service Coverage Ratio",
  actualValue: 1.4,
  thresholdValue: 1.25,
  ...over,
});
/** A cap test (leverage): actual must be at or below the threshold. */
const cap = (over: Partial<Covenant> = {}): Covenant => ({
  covenantType: "Maximum Debt to Worth",
  actualValue: 2.1,
  thresholdValue: 3.0,
  ...over,
});

describe("thresholdViolation — both operator directions, and the gaps", () => {
  it("a floor test is violated when the actual falls below the threshold", () => {
    expect(thresholdViolation(floor({ actualValue: 1.1 }))).toBe(true);
    expect(thresholdViolation(floor({ actualValue: 1.4 }))).toBe(false);
  });

  it("a cap test is violated when the actual rises above the threshold", () => {
    expect(thresholdViolation(cap({ actualValue: 4.2 }))).toBe(true);
    expect(thresholdViolation(cap({ actualValue: 2.1 }))).toBe(false);
  });

  it("sitting exactly on the threshold is not a violation, either way", () => {
    expect(thresholdViolation(floor({ actualValue: 1.25 }))).toBe(false);
    expect(thresholdViolation(cap({ actualValue: 3.0 }))).toBe(false);
  });

  it("cannot be answered without both numbers, and says so rather than guessing", () => {
    expect(thresholdViolation(floor({ actualValue: undefined }))).toBeNull();
    expect(thresholdViolation(floor({ thresholdValue: undefined }))).toBeNull();
    expect(thresholdViolation({ covenantType: "Term Covenants" })).toBeNull();
    expect(thresholdViolation(floor({ actualValue: Number.NaN }))).toBeNull();
  });
});

describe("Exception is ADMINISTRATIVE by default", () => {
  const admin = classifyCovenant({ covenantType: "Term Covenants", lastEvaluationStatus: "Exception" });

  it("is its own kind, never a breach", () => {
    expect(admin.kind).toBe("exception");
    expect(admin.financialBreach).toBe(false);
  });

  it("renders its own chip and the exact tooltip the banker needs", () => {
    expect(admin.label).toBe("Exception");
    expect(admin.explanation).toBe(`${ADMINISTRATIVE_EXCEPTION_NOTE}.`);
  });

  it("is a watch, not a critical", () => {
    expect(admin.severity).toBe("watch");
    expect(severityTone(admin.severity)).toBe("amber");
  });

  it("stays administrative when a measured value is present and COMPLIES", () => {
    const v = classifyCovenant(floor({ lastEvaluationStatus: "Exception" }));
    expect(v.kind).toBe("exception");
    expect(v.financialBreach).toBe(false);
    expect(v.measured).toBe(true);
  });

  it("reads the same on covenantStatus as on lastEvaluationStatus", () => {
    expect(classifyCovenant({ covenantStatus: "Exception" }).kind).toBe("exception");
  });

  it("treats overdue the same way, in the org's own word", () => {
    const v = classifyCovenant({ covenantStatus: "overdue" });
    expect(v.kind).toBe("exception");
    expect(v.financialBreach).toBe(false);
    expect(v.label).toBe("overdue");
    expect(v.explanation).toContain("not a measured breach");
  });
});

describe("Exception becomes a breach ONLY when a measured value misses", () => {
  const missed = classifyCovenant(floor({ actualValue: 1.1, lastEvaluationStatus: "Exception" }));

  it("is a breach, and says which half of the verdict is measured", () => {
    expect(missed.kind).toBe("breach");
    expect(missed.financialBreach).toBe(true);
    expect(missed.label).toBe("Exception, threshold not met");
    expect(missed.severity).toBe("breach");
  });

  it("carries the measurement in the explanation, in the covenant's own unit", () => {
    expect(missed.explanation).toContain("1.10×");
    expect(missed.explanation).toContain("≥ 1.25×");
  });

  it("works on a cap test too", () => {
    const v = classifyCovenant(cap({ actualValue: 4.2, covenantStatus: "Exception" }));
    expect(v.financialBreach).toBe(true);
    expect(v.label).toBe("Exception, threshold not met");
  });
});

describe("Waived is its own neutral chip and is never a breach", () => {
  it("renders neutral", () => {
    const v = classifyCovenant(floor({ lastEvaluationStatus: "Waived" }));
    expect(v.kind).toBe("waived");
    expect(v.severity).toBe("neutral");
    expect(tone(floor({ lastEvaluationStatus: "Waived" }))).toBe("neutral");
  });

  it("stays neutral even when the measured value misses the threshold", () => {
    const v = classifyCovenant(floor({ actualValue: 1.1, lastEvaluationStatus: "Waived" }));
    expect(v.kind).toBe("waived");
    expect(v.financialBreach).toBe(false);
    // The miss is still SHOWN — a waiver hides nothing, it only reclassifies.
    expect(v.explanation).toContain("1.10×");
  });

  it("outranks even the org's Breached flag, because a waiver is a decision", () => {
    expect(classifyCovenant(floor({ lastEvaluationStatus: "Waived", breached: true })).financialBreach).toBe(false);
  });
});

describe("explicit financial breach", () => {
  it("fires on the org's Breached flag", () => {
    const v = classifyCovenant(floor({ breached: true }));
    expect(v.kind).toBe("breach");
    expect(v.financialBreach).toBe(true);
    expect(v.explanation).toContain("Breached flag");
  });

  it("fires on Non-Compliant, and keeps the org's own wording as the label", () => {
    const v = classifyCovenant(floor({ lastEvaluationStatus: "Non-Compliant" }));
    expect(v.kind).toBe("breach");
    expect(v.label).toBe("Non-Compliant");
  });

  it("fires on the org's lowercase breached and on Fail", () => {
    expect(classifyCovenant({ covenantStatus: "breached" }).financialBreach).toBe(true);
    expect(classifyCovenant({ covenantStatus: "Fail" }).financialBreach).toBe(true);
  });

  it("fires on a measured miss with no status recorded at all", () => {
    const v = classifyCovenant(floor({ actualValue: 1.1 }));
    expect(v.financialBreach).toBe(true);
    expect(v.label).toBe("Threshold not met");
  });

  it("fires when nCino says Compliant but the measured value misses", () => {
    const v = classifyCovenant(floor({ actualValue: 1.1, lastEvaluationStatus: "Compliant" }));
    expect(v.financialBreach).toBe(true);
    expect(v.label).toBe("Compliant, threshold not met");
  });
});

describe("compliant and pending", () => {
  it("Compliant is clear", () => {
    const v = classifyCovenant(floor({ lastEvaluationStatus: "Compliant" }));
    expect(v.kind).toBe("compliant");
    expect(v.severity).toBe("clear");
    expect(tone(floor({ lastEvaluationStatus: "Compliant" }))).toBe("green");
  });

  it("Pass is clear", () => {
    expect(classifyCovenant({ covenantStatus: "Pass" }).kind).toBe("compliant");
  });

  it("Pending and In Progress are outstanding tests, not outcomes", () => {
    for (const s of ["Pending", "In Progress"]) {
      const v = classifyCovenant({ covenantStatus: s });
      expect(v.kind, s).toBe("pending");
      expect(v.financialBreach, s).toBe(false);
      expect(v.label, s).toBe(s);
    }
  });
});

describe("a status this cockpit does not map renders VERBATIM, never as a breach", () => {
  for (const s of ["Active", "<10% headroom", ">10% headroom", "Awaiting Spread Review"]) {
    it(`keeps "${s}" as written`, () => {
      const v = classifyCovenant({ covenantStatus: s, covenantType: "Some Test" });
      expect(v.label).toBe(s);
      expect(v.financialBreach).toBe(false);
      expect(v.kind === "unknown" || v.kind === "pending").toBe(true);
    });
  }

  it("keeps the org's warning vocabulary amber without claiming to understand it", () => {
    const v = classifyCovenant(floor({ lastEvaluationStatus: "Watch" }));
    expect(v.kind).toBe("unknown");
    expect(tone(floor({ lastEvaluationStatus: "Watch" }))).toBe("amber");
  });

  it("still becomes a breach if the MEASURED value misses, keeping the string in the label", () => {
    const v = classifyCovenant(floor({ actualValue: 1.1, covenantStatus: "<10% headroom" }));
    expect(v.financialBreach).toBe(true);
    expect(v.label).toBe("<10% headroom, threshold not met");
  });
});

describe("an empty read is honest about being empty", () => {
  it("says there is no status rather than inventing one", () => {
    const v = classifyCovenant({});
    expect(v.kind).toBe("unknown");
    expect(v.label).toBe("No status");
    expect(v.measured).toBe(false);
    expect(v.financialBreach).toBe(false);
    expect(tone({})).toBe("neutral");
  });

  it("ignores whitespace-only and non-string statuses", () => {
    expect(classifyCovenant({ lastEvaluationStatus: "   " }).label).toBe("No status");
    expect(classifyCovenant({ covenantStatus: 7 as unknown as string }).label).toBe("No status");
  });
});

describe("severityTone", () => {
  it("maps every severity, and only breach is red", () => {
    expect(severityTone("breach")).toBe("red");
    expect(severityTone("watch")).toBe("amber");
    expect(severityTone("clear")).toBe("green");
    expect(severityTone("neutral")).toBe("neutral");
  });
});

describe("the two list helpers the surfaces count with", () => {
  const covs: Covenant[] = [
    floor({ lastEvaluationStatus: "Compliant" }),
    { covenantType: "Term Covenants", lastEvaluationStatus: "Exception" },
    { covenantType: "Reporting", covenantStatus: "overdue" },
    floor({ actualValue: 1.1, lastEvaluationStatus: "Exception" }),
    floor({ breached: true }),
    floor({ actualValue: 1.1, lastEvaluationStatus: "Waived" }),
  ];

  it("counts only the financial breaches as breaches", () => {
    expect(financialBreaches(covs)).toHaveLength(2);
  });

  it("counts the administrative exceptions separately, and the two never overlap", () => {
    expect(administrativeExceptions(covs)).toHaveLength(2);
    const breaches = new Set(financialBreaches(covs));
    expect(administrativeExceptions(covs).some((c) => breaches.has(c))).toBe(false);
  });

  it("is safe on an empty list", () => {
    expect(financialBreaches([])).toEqual([]);
    expect(administrativeExceptions([])).toEqual([]);
  });
});

describe("Reason for Exception: the org's OWN answer, read rather than inferred (WS0.5)", () => {
  it("treats Breached as a financial breach, even where nothing was measured", () => {
    // The exception batch can force `Exception` onto any overdue row. It cannot
    // set this field, so `Breached` here is the org saying the test failed.
    const v = classifyCovenant({
      covenantType: "Debt Service Coverage Ratio",
      covenantStatus: "Exception",
      latestComplianceStatus: "Exception",
      reasonForException: "Breached",
    });
    expect(v.kind).toBe("breach");
    expect(v.financialBreach).toBe(true);
    expect(v.measured).toBe(false);
    expect(v.explanation).toContain("Reason for Exception as Breached");
  });

  it("treats Overdue as administrative, and says so in the org's terms", () => {
    const v = classifyCovenant(floor({ actualValue: undefined, lastEvaluationStatus: "Exception", reasonForException: "Overdue" }));
    expect(v.kind).toBe("exception");
    expect(v.financialBreach).toBe(false);
    expect(v.severity).toBe("watch");
    expect(v.explanation).toContain("the document or evaluation is outstanding, not a measured breach");
  });

  it("still lets a WAIVER outrank the reason, because a waiver outranks everything", () => {
    const v = classifyCovenant(floor({ actualValue: 1.1, lastEvaluationStatus: "Waived", reasonForException: "Breached" }));
    expect(v.kind).toBe("waived");
    expect(v.financialBreach).toBe(false);
  });

  it("still calls a measured miss a breach when the reason says Overdue", () => {
    // The paperwork answer does not survive contact with a figure that misses.
    const v = classifyCovenant(floor({ actualValue: 1.1, lastEvaluationStatus: "Exception", reasonForException: "Overdue" }));
    expect(v.kind).toBe("breach");
    expect(v.financialBreach).toBe(true);
  });

  it("ignores a reason it does not recognise rather than mapping it", () => {
    const v = classifyCovenant(floor({ lastEvaluationStatus: "Compliant", reasonForException: "Something Else" }));
    expect(v.kind).toBe("compliant");
    expect(v.financialBreach).toBe(false);
  });

  it("changes nothing when the read carries no reason at all", () => {
    const withOut = classifyCovenant(floor({ lastEvaluationStatus: "Exception" }));
    expect(withOut.kind).toBe("exception");
    expect(withOut.explanation).toContain(ADMINISTRATIVE_EXCEPTION_NOTE);
  });
});
