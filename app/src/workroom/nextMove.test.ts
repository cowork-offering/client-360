import { describe, expect, it } from "vitest";
import type { Covenant, Facility } from "../data/contract";
import {
  COVENANT_DUE_DAYS,
  MATURITY_QUARTER_DAYS,
  UTILIZATION_WORTH_ACTING_PCT,
  deriveNextMove,
  type NextMoveInput,
} from "./nextMove";

/* =============================================================================
   `deriveNextMove` IN ISOLATION — pure, no engine, no bundle. `modifyEngine.
   test.ts` proves this wires correctly into `position()`; this file proves the
   date math and the priority order on their own.
   ============================================================================= */

const TODAY = "2026-08-31T00:00:00Z";

/** YYYY-MM-DD that is `offset` whole UTC days from TODAY (negative = past). */
function day(offset: number): string {
  const base = Date.UTC(2026, 7, 31); // 2026-08-31
  return new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
}

const RELATIONSHIP = "Hartwell Precision Manufacturing LLC";

function facility(over: Partial<Facility> = {}): Facility {
  return {
    loanId: "L1",
    name: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00",
    committed: 15_000_000,
    outstanding: 9_000_000,
    ...over,
  };
}

function covenant(over: Partial<Covenant> = {}): Covenant {
  return {
    covenantType: "Accounts Receivable",
    covenantStatus: "Compliant",
    latestComplianceStatus: "Compliant",
    ...over,
  };
}

function inputWith(over: Partial<NextMoveInput> = {}): NextMoveInput {
  return {
    facilities: [],
    covenants: [],
    committed: 0,
    outstanding: 0,
    relationship: RELATIONSHIP,
    ...over,
  };
}

describe("no move applies — the caller falls back to its own inventory sentence", () => {
  it("returns null on a completely empty read", () => {
    expect(deriveNextMove(inputWith(), TODAY)).toBeNull();
  });

  it("returns null when the clock itself is unusable — never a guess off a bad date", () => {
    const input = inputWith({ facilities: [facility({ maturityDate: day(10) })] });
    expect(deriveNextMove(input, "")).toBeNull();
    expect(deriveNextMove(input, "not-a-date")).toBeNull();
  });

  it("returns null when no facility carries a maturity date at all", () => {
    const input = inputWith({ facilities: [facility({ maturityDate: undefined })] });
    expect(deriveNextMove(input, TODAY)).toBeNull();
  });

  it("returns null when a maturity is unparseable rather than absent", () => {
    const input = inputWith({ facilities: [facility({ maturityDate: "not-a-date" })] });
    expect(deriveNextMove(input, TODAY)).toBeNull();
  });
});

describe("tier 1 — a facility maturing within the coming quarter", () => {
  it("leads on a maturity due today (day zero counts as upcoming)", () => {
    const move = deriveNextMove(inputWith({ facilities: [facility({ maturityDate: day(0) })] }), TODAY);
    expect(move?.kind).toBe("maturity");
    expect(move?.line).toBe("The $15M Line of Credit matures today. Start the renewal?");
  });

  it("names the days out, singular for one day", () => {
    const move = deriveNextMove(inputWith({ facilities: [facility({ maturityDate: day(1) })] }), TODAY);
    expect(move?.line).toContain("matures in 1 day.");
  });

  it("fires at the exact edge of the quarter window", () => {
    const move = deriveNextMove(
      inputWith({ facilities: [facility({ maturityDate: day(MATURITY_QUARTER_DAYS) })] }),
      TODAY,
    );
    expect(move?.kind).toBe("maturity");
    expect(move?.line).toContain(`in ${MATURITY_QUARTER_DAYS} days`);
  });

  it("does not fire one day past the quarter window", () => {
    const move = deriveNextMove(
      inputWith({ facilities: [facility({ maturityDate: day(MATURITY_QUARTER_DAYS + 1) })] }),
      TODAY,
    );
    expect(move).toBeNull();
  });

  it("never fires on a maturity already in the past", () => {
    const move = deriveNextMove(inputWith({ facilities: [facility({ maturityDate: day(-1) })] }), TODAY);
    expect(move).toBeNull();
  });

  it("picks the SOONEST of several qualifying facilities", () => {
    const soon = facility({ loanId: "L-soon", committed: 2_000_000, maturityDate: day(10) });
    const sooner = facility({ loanId: "L-sooner", committed: 1_000_000, maturityDate: day(3) });
    const far = facility({ loanId: "L-far", committed: 9_000_000, maturityDate: day(40) });
    const move = deriveNextMove(inputWith({ facilities: [soon, sooner, far] }), TODAY);
    expect(move?.line).toContain("in 3 days");
  });

  it("breaks a same-day tie toward the LARGER commitment", () => {
    const small = facility({ loanId: "L-small", committed: 2_000_000, maturityDate: day(20) });
    const big = facility({ loanId: "L-big", committed: 18_000_000, maturityDate: day(20) });
    const move = deriveNextMove(inputWith({ facilities: [small, big] }), TODAY);
    expect(move?.line).toContain("$18M");
  });

  it("degrades gracefully when the maturing facility carries no committed figure — names the product, not a fabricated amount", () => {
    const bare = facility({ committed: undefined, maturityDate: day(5) });
    const move = deriveNextMove(inputWith({ facilities: [bare] }), TODAY);
    expect(move?.line).toBe("The Line of Credit matures in 5 days. Start the renewal?");
  });

  it("outranks a covenant due soon AND a high utilization when several tiers qualify at once", () => {
    const input = inputWith({
      facilities: [facility({ maturityDate: day(5) })],
      covenants: [covenant({ nextEvaluationDate: day(2) })],
      committed: 10_000_000,
      outstanding: 9_500_000,
    });
    expect(deriveNextMove(input, TODAY)?.kind).toBe("maturity");
  });
});

describe("tier 2 — a covenant test due soon", () => {
  it("leads with the covenant type and the days out", () => {
    const move = deriveNextMove(inputWith({ covenants: [covenant({ nextEvaluationDate: day(6) })] }), TODAY);
    expect(move?.kind).toBe("covenant");
    expect(move?.line).toBe("The Accounts Receivable covenant is due in 6 days. Start the review?");
  });

  it("fires at the exact edge of the due-soon window", () => {
    const move = deriveNextMove(
      inputWith({ covenants: [covenant({ nextEvaluationDate: day(COVENANT_DUE_DAYS) })] }),
      TODAY,
    );
    expect(move?.kind).toBe("covenant");
  });

  it("does not fire one day past the due-soon window", () => {
    const move = deriveNextMove(
      inputWith({ covenants: [covenant({ nextEvaluationDate: day(COVENANT_DUE_DAYS + 1) })] }),
      TODAY,
    );
    expect(move).toBeNull();
  });

  it("never fires on a test that is already overdue", () => {
    const move = deriveNextMove(inputWith({ covenants: [covenant({ nextEvaluationDate: day(-3) })] }), TODAY);
    expect(move).toBeNull();
  });

  it("excludes a financial breach — a breach is a different, already-surfaced situation, not 'due soon'", () => {
    const breached = covenant({
      nextEvaluationDate: day(5),
      covenantStatus: "Breached",
      lastEvaluationStatus: "Breached",
      breached: true,
    });
    expect(deriveNextMove(inputWith({ covenants: [breached] }), TODAY)).toBeNull();
  });

  it("excludes a waived covenant — nobody is testing it", () => {
    const waived = covenant({ nextEvaluationDate: day(5), covenantStatus: "Waived", lastEvaluationStatus: "Waived" });
    expect(deriveNextMove(inputWith({ covenants: [waived] }), TODAY)).toBeNull();
  });

  it("picks the SOONEST of several qualifying covenants", () => {
    const dsc = covenant({ covenantType: "Debt Service Coverage", nextEvaluationDate: day(30) });
    const ar = covenant({ covenantType: "Accounts Receivable", nextEvaluationDate: day(6) });
    const move = deriveNextMove(inputWith({ covenants: [dsc, ar] }), TODAY);
    expect(move?.line).toContain("Accounts Receivable");
  });

  it("breaks a same-day tie alphabetically by covenant type — deterministic, not a coin flip", () => {
    const b = covenant({ covenantType: "Minimum Liquidity", nextEvaluationDate: day(12) });
    const a = covenant({ covenantType: "Debt Service Coverage", nextEvaluationDate: day(12) });
    const move = deriveNextMove(inputWith({ covenants: [b, a] }), TODAY);
    expect(move?.line).toContain("Debt Service Coverage");
  });

  it("degrades to a generic 'covenant' where the type itself is missing", () => {
    const nameless = covenant({ covenantType: undefined, nextEvaluationDate: day(5) });
    const move = deriveNextMove(inputWith({ covenants: [nameless] }), TODAY);
    expect(move?.line).toBe("The covenant is due in 5 days. Start the review?");
  });

  it("outranks a high utilization when both qualify", () => {
    const input = inputWith({
      covenants: [covenant({ nextEvaluationDate: day(5) })],
      committed: 10_000_000,
      outstanding: 9_500_000,
    });
    expect(deriveNextMove(input, TODAY)?.kind).toBe("covenant");
  });
});

describe("tier 3 — the package drawn hard against its commitment", () => {
  it("fires at or above the threshold", () => {
    const move = deriveNextMove(
      inputWith({ committed: 10_000_000, outstanding: (10_000_000 * UTILIZATION_WORTH_ACTING_PCT) / 100 }),
      TODAY,
    );
    expect(move?.kind).toBe("utilization");
    expect(move?.line).toBe(`The package is drawn to ${UTILIZATION_WORTH_ACTING_PCT}% of commitment. Worth a headroom conversation?`);
  });

  it("does not fire just under the threshold", () => {
    const move = deriveNextMove(
      inputWith({ committed: 10_000_000, outstanding: 10_000_000 * (UTILIZATION_WORTH_ACTING_PCT / 100 - 0.01) }),
      TODAY,
    );
    expect(move).toBeNull();
  });

  it("never claims a trend — the sentence is a level, not a slope", () => {
    const move = deriveNextMove(inputWith({ committed: 10_000_000, outstanding: 9_800_000 }), TODAY);
    expect(move?.line).not.toMatch(/trend|rising|increasing|climbing/i);
  });

  it("returns null on a zero or negative committed total rather than dividing by it", () => {
    expect(deriveNextMove(inputWith({ committed: 0, outstanding: 0 }), TODAY)).toBeNull();
    expect(deriveNextMove(inputWith({ committed: -1, outstanding: 5 }), TODAY)).toBeNull();
  });

  it("is the last resort: with nothing in tiers 1 or 2, a heavily drawn package still leads", () => {
    const input = inputWith({
      facilities: [facility({ maturityDate: day(400) })], // far outside the quarter window
      covenants: [covenant({ nextEvaluationDate: day(200) })], // far outside the due-soon window
      committed: 20_000_000,
      outstanding: 19_000_000,
    });
    expect(deriveNextMove(input, TODAY)?.kind).toBe("utilization");
  });
});
