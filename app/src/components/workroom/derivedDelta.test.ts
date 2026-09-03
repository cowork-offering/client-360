import { describe, expect, it } from "vitest";
import { countPhrase, countSplit, derivedReasonOf, isDerivedDelta, splitClause, withDerivedSplit } from "./derivedDelta";
import { PRICING_FIELD, PRICING_WHY } from "./pricingGate";
import type { WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE DEFECT THIS CLOSES (Cowork feedback, 2026-09-03).

   "increase the 15M line of credit to 20M" and one more line landed FOUR
   cards, and the rail said "4 changes": two the banker typed, two the
   pricing gate added so Salesforce can price the loan. These prove the split
   reads the two apart from the delta's own shape, with nothing threaded
   through construction.
   ============================================================================= */

const LOC15 = "a4Zbb0000027MaYEAU";

const delta = (over: Partial<WorkroomDelta> & { id: string }): WorkroomDelta =>
  ({
    group: "terms",
    kind: "Term change",
    badge: "",
    title: "Commitment",
    target: "$15.0MM Line of Credit",
    before: "$15.0M",
    after: "$20.0M",
    map: [],
    fields: [],
    filed: { recordId: "", verification: "" },
    ...over,
  }) as WorkroomDelta;

const amountMove = delta({
  id: "loan.amount:loc",
  member: LOC15,
  wire: { key: "requestedAmount", value: 20_000_000, facilityId: LOC15 },
});

const termMove = delta({
  id: "loan.term:loc",
  member: LOC15,
  title: "Term (months)",
  after: "60 months",
  wire: { key: "requestedTermMonths", value: 60, facilityId: LOC15 },
});

const amortised = delta({
  id: "loan.amortisedTerm:loc",
  member: LOC15,
  title: "Amortisation term (months)",
  after: "240 months",
  fieldWire: {
    field: PRICING_FIELD.amortisedTerm,
    label: "Amortisation term (months)",
    value: 240,
    display: "240 months",
    facilityId: LOC15,
  },
});

const firstPayment = delta({
  id: "loan.firstPaymentDate:loc",
  member: LOC15,
  title: "First payment date",
  after: "Oct 1, 2026",
  fieldWire: {
    field: PRICING_FIELD.firstPaymentDate,
    label: "First payment date",
    value: "2026-10-01",
    display: "Oct 1, 2026",
    facilityId: LOC15,
  },
});

describe("which deltas the room added on its own", () => {
  it("reads the two pricing-prerequisite fields as derived, and nothing else", () => {
    expect(isDerivedDelta(amortised)).toBe(true);
    expect(isDerivedDelta(firstPayment)).toBe(true);
    expect(isDerivedDelta(amountMove)).toBe(false);
    expect(isDerivedDelta(termMove)).toBe(false);
  });

  it("carries the pricing gate's own reason, verbatim", () => {
    expect(derivedReasonOf(amortised)).toBe(PRICING_WHY);
    expect(derivedReasonOf(firstPayment)).toBe(PRICING_WHY);
    expect(derivedReasonOf(amountMove)).toBeNull();
  });

  it("takes an explicit derivedReason over the structural pricing check", () => {
    const flagged = { ...amountMove, derived: true, derivedReason: "A future arm's own words." };
    expect(isDerivedDelta(flagged)).toBe(true);
    expect(derivedReasonOf(flagged)).toBe("A future arm's own words.");
  });

  it("falls back to a plain reason for a bare derived flag with none of its own", () => {
    const flagged = { ...amountMove, derived: true };
    expect(derivedReasonOf(flagged)).toBe("The room added this so the plan can be priced.");
  });
});

describe("the requested/derived split", () => {
  it("counts two requested and two derived on the reported whisper", () => {
    const entries = [amountMove, termMove, amortised, firstPayment];
    expect(countSplit(entries)).toEqual({ total: 4, requested: 2, derived: 2 });
    expect(splitClause(entries)).toBe("2 requested · 2 derived");
  });

  it("reads plain, no clause at all, when nothing on the plan is derived", () => {
    const entries = [amountMove, termMove];
    expect(countSplit(entries)).toEqual({ total: 2, requested: 2, derived: 0 });
    expect(splitClause(entries)).toBeNull();
  });

  it("widens a count line built by figuresFor, right after the leading clause", () => {
    const entries = [amountMove, termMove, amortised, firstPayment];
    expect(withDerivedSplit("4 changes", entries)).toBe("4 changes · 2 requested · 2 derived");
    expect(withDerivedSplit("4 changes · 1 of 7 members", entries)).toBe(
      "4 changes · 2 requested · 2 derived · 1 of 7 members",
    );
  });

  it("leaves an ordinary count line exactly as figuresFor built it", () => {
    const entries = [amountMove, termMove];
    expect(withDerivedSplit("2 changes", entries)).toBe("2 changes");
    expect(withDerivedSplit("Nothing staged", entries)).toBe("Nothing staged");
  });

  it("builds the same split onto an inline count phrase", () => {
    const entries = [amountMove, termMove, amortised, firstPayment];
    expect(countPhrase(4, "changes", entries)).toBe("4 changes · 2 requested · 2 derived");
    expect(countPhrase(2, "changes", [amountMove, termMove])).toBe("2 changes");
  });
});
