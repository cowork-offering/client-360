import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PRICING_FIELD,
  bookCarriesPricing,
  carriesPricing,
  firstOfMonth,
  monthLabel,
  movesPricing,
  pricingAsk,
  pricingDeclinedLine,
  pricingLaterSay,
  pricingNeed,
  pricingOtherSay,
  pricingSay,
  readPricingDecline,
  readPricingFreeText,
  readPricingLine,
  readPricingOther,
  stagedTermMonths,
} from "./pricingGate";
import type { ElicitMember } from "./elicit";
import type { Facility } from "../../data/contract";
import type { WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE FOUR FIELDS nCINO PRICES ON (founder, 2026-09-02).

   nCino hides the rate and the payment stream until the amount, the term, the
   amortised term and the first payment date are all set. On Hartwell the last
   two are blank, so a modification that moves the $15M line to $20M leaves a
   version nobody can price.
   ============================================================================= */

const LOC15 = "a4Zbb0000027MaYEAU";
const EQ8 = "a4Zbb0000027MnREAU";

const MEMBERS: ElicitMember[] = [
  {
    id: LOC15,
    key: "Line of Credit",
    label: "$15.0MM Line of Credit",
    orgName: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00",
    shortName: "Line of Credit - $15,000,000.00",
    committed: 15_000_000,
  },
  {
    id: EQ8,
    key: "Equipment",
    label: "$8.0MM Equipment",
    orgName: "Hartwell Precision Manufacturing LLC - Equipment - $8,000,000.00",
    shortName: "Equipment - $8,000,000.00",
    committed: 8_000_000,
  },
];

const on = MEMBERS[0];

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

const NONE = new Set<string>();
const facilities = (over: Partial<Facility> = {}) =>
  new Map<string, Facility>([[LOC15, { loanId: LOC15, name: "Line of Credit", ...over }]]);

describe("what makes the pricing fields matter", () => {
  it("is the amount and the term, and nothing else", () => {
    expect(movesPricing(amountMove)).toBe(true);
    expect(movesPricing(termMove)).toBe(true);
    expect(
      movesPricing(delta({ id: "r", member: LOC15, wire: { key: "requestedRate", value: 7, facilityId: LOC15 } })),
    ).toBe(false);
    expect(movesPricing(amortised)).toBe(false);
  });

  it("reads the plan's own term, because the read carries none", () => {
    expect(stagedTermMonths([amountMove, termMove], LOC15)).toBe(60);
    expect(stagedTermMonths([amountMove], LOC15)).toBeNull();
  });

  it("knows what the plan already carries, by the org's own API name", () => {
    expect(carriesPricing([amountMove, amortised], LOC15, "amortisedTerm")).toBe(true);
    expect(carriesPricing([amountMove, amortised], LOC15, "firstPaymentDate")).toBe(false);
    // And never across facilities.
    expect(carriesPricing([{ ...amortised, member: EQ8 }], LOC15, "amortisedTerm")).toBe(false);
  });

  it("treats an absent read as UNKNOWN, never as fine", () => {
    expect(bookCarriesPricing(facilities().get(LOC15), "amortisedTerm")).toBe(false);
    expect(bookCarriesPricing(facilities().get(LOC15), "firstPaymentDate")).toBe(false);
    expect(bookCarriesPricing(facilities({ amortizedTermMonths: 240 }).get(LOC15), "amortisedTerm")).toBe(true);
    expect(bookCarriesPricing(facilities({ firstPaymentDate: "2026-10-01" }).get(LOC15), "firstPaymentDate")).toBe(true);
    // An empty string is not a date.
    expect(bookCarriesPricing(facilities({ firstPaymentDate: "  " }).get(LOC15), "firstPaymentDate")).toBe(false);
  });
});

describe("the one field the plan still needs", () => {
  const need = (entries: WorkroomDelta[], declined = NONE, book = facilities()) =>
    pricingNeed({ entries, facilities: book, declined });

  it("asks the amortised term first, then the first payment date", () => {
    expect(need([amountMove])).toEqual({ memberId: LOC15, slot: "amortisedTerm" });
    expect(need([amountMove, amortised])).toEqual({ memberId: LOC15, slot: "firstPaymentDate" });
    expect(need([amountMove, amortised, firstPayment])).toBeNull();
  });

  it("asks nothing where the plan moves neither the amount nor the term", () => {
    expect(need([delta({ id: "x", member: LOC15, wire: { key: "requestedRate", value: 7, facilityId: LOC15 } })])).toBeNull();
    expect(need([])).toBeNull();
  });

  it("asks nothing where the READ already carries both", () => {
    expect(need([amountMove], NONE, facilities({ amortizedTermMonths: 240, firstPaymentDate: "2026-10-01" }))).toBeNull();
  });

  it("asks nothing about a facility the banker left for later", () => {
    expect(need([amountMove], new Set([LOC15]))).toBeNull();
  });

  it("asks in manifest order, one facility at a time", () => {
    const other = delta({
      id: "loan.amount:eq",
      member: EQ8,
      target: "$8.0MM Equipment",
      wire: { key: "requestedAmount", value: 9_000_000, facilityId: EQ8 },
    });
    expect(need([amountMove, other])).toEqual({ memberId: LOC15, slot: "amortisedTerm" });
    expect(need([amountMove, amortised, firstPayment, other])).toEqual({ memberId: EQ8, slot: "amortisedTerm" });
  });
});

describe("the question, and the chips under it", () => {
  it("offers the plan's own term, the bank's two lengths, another figure and later", () => {
    const ask = pricingAsk({ memberId: LOC15, slot: "amortisedTerm" }, on, { entries: [amountMove, termMove] });
    expect(ask.options.map((o) => o.label)).toEqual([
      "Same as the term (60 months)",
      "240 months",
      "300 months",
      "Another figure",
      "Leave pricing for later",
    ]);
    expect(ask.text).toContain("nCino needs the amount, the term, the amortised term and the first payment date");
  });

  it("says so where the plan sets no term to match", () => {
    const ask = pricingAsk({ memberId: LOC15, slot: "amortisedTerm" }, on, { entries: [amountMove] });
    expect(ask.options.map((o) => o.label)).toEqual([
      "240 months",
      "300 months",
      "Another figure",
      "Leave pricing for later",
    ]);
    expect(ask.text).toContain("This plan sets no term either");
  });

  it("computes the two dates from the artifact's own instant, never from a clock", () => {
    const ask = pricingAsk({ memberId: LOC15, slot: "firstPaymentDate" }, on, {
      entries: [amountMove],
      generatedAt: "2026-07-25T21:04:49Z",
    });
    expect(ask.options.map((o) => o.label)).toEqual([
      "1 August 2026",
      "1 September 2026",
      "Another date",
      "Leave pricing for later",
    ]);
    expect(ask.options[0].say).toContain("set the first payment date to 2026-08-01");
    expect(ask.options[1].say).toContain("set the first payment date to 2026-09-01");
  });

  it("offers no month at all where this view carries no instant", () => {
    const ask = pricingAsk({ memberId: LOC15, slot: "firstPaymentDate" }, on, { entries: [amountMove] });
    expect(ask.options.map((o) => o.label)).toEqual(["Another date", "Leave pricing for later"]);
    expect(ask.text).toContain("no snapshot instant");
  });

  it("rolls the year over", () => {
    expect(firstOfMonth("2026-12-11T00:00:00Z", 1)).toBe("2027-01-01");
    expect(firstOfMonth("2026-12-11T00:00:00Z", 2)).toBe("2027-02-01");
    expect(firstOfMonth(undefined, 1)).toBeNull();
    expect(firstOfMonth("not a date", 1)).toBeNull();
    expect(monthLabel("2027-01-01")).toBe("January 2027");
  });
});

describe("the answers are sentences, and they read back", () => {
  it("names the facility by the org's own loan name so the parser resolves one", () => {
    const say = pricingSay(on, "amortisedTerm", "240");
    expect(say).toBe(
      "on the Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00 set the amortisation term to 240 months",
    );
    expect(readPricingLine(say, MEMBERS)).toEqual({ memberId: LOC15, slot: "amortisedTerm", value: "240" });
  });

  it("reads the first payment date back as the ISO day it sent", () => {
    const say = pricingSay(on, "firstPaymentDate", "2026-10-01");
    expect(readPricingLine(say, MEMBERS)).toEqual({
      memberId: LOC15,
      slot: "firstPaymentDate",
      value: "2026-10-01",
    });
  });

  it("claims nothing that is not one of its own sentences", () => {
    expect(readPricingLine("take the line of credit to $20,000,000", MEMBERS)).toBeNull();
    expect(readPricingLine("on the Nowhere Loan set the amortisation term to 240 months", MEMBERS)).toBeNull();
  });

  it("reads the decline, and only for a facility the room holds", () => {
    expect(readPricingDecline(pricingLaterSay(on), MEMBERS)).toBe(LOC15);
    expect(readPricingDecline("leave pricing for later on the Nowhere Loan", MEMBERS)).toBeNull();
    expect(pricingDeclinedLine(on)).toContain("will not show a rate or a payment stream");
  });

  it("reads 'another figure' as the slot it is about", () => {
    expect(readPricingOther(pricingOtherSay(on, "amortisedTerm"), MEMBERS)).toEqual({
      memberId: LOC15,
      slot: "amortisedTerm",
    });
    expect(readPricingOther(pricingOtherSay(on, "firstPaymentDate"), MEMBERS)).toEqual({
      memberId: LOC15,
      slot: "firstPaymentDate",
    });
  });

  it("takes a bare figure as the answer to the question it just asked", () => {
    expect(readPricingFreeText("240", "amortisedTerm")).toBe("240");
    expect(readPricingFreeText("240 months", "amortisedTerm")).toBe("240");
    expect(readPricingFreeText("20 years", "amortisedTerm")).toBe("240");
    expect(readPricingFreeText("2026-10-01", "firstPaymentDate")).toBe("2026-10-01");
  });

  it("takes nothing else, so an ordinary line still reaches the ordinary lanes", () => {
    expect(readPricingFreeText("take the line to 20M", "amortisedTerm")).toBeNull();
    expect(readPricingFreeText("next October", "firstPaymentDate")).toBeNull();
    expect(readPricingFreeText("240", "firstPaymentDate")).toBeNull();
  });
});

/* ============ THE TWO FIELDS ARE WRITABLE, AND THE ORG SAYS SO

   Both ride `fieldChangesJson` like any other loan field, and both are refused
   at once if anybody adds them to a deny list. This reads the deployed classes
   rather than restating what they say, so the day one of them moves this test
   is what says so.                                                            */

describe("the org's own classes accept both fields", () => {
  const classes = new URL("../../../../knowledge/sf-build-v2/wp2/classes/", import.meta.url);
  const read = (name: string) => readFileSync(new URL(name, classes), "utf8");

  it("neither is on C360WriteGuard's OBJ_LOAN forbidden list", () => {
    const guard = read("C360WriteGuard.cls");
    const objLoan = /OBJ_LOAN => new Set<String>\{([\s\S]*?)\}/.exec(guard);
    expect(objLoan).not.toBeNull();
    const forbidden = objLoan![1].toLowerCase();
    expect(forbidden).not.toContain("amortized_term_months");
    expect(forbidden).not.toContain("first_payment_date");
    // And the list is what it was: three formula and non-existent fields.
    expect(forbidden).toContain("hasrenewal");
  });

  it("neither is on StageLoanModification's field-wave deny list", () => {
    const stage = read("StageLoanModification.cls");
    const deny = /FIELD_WAVE_DENY = new Set<String>\{([\s\S]*?)\}/.exec(stage);
    expect(deny).not.toBeNull();
    const denied = deny![1].toLowerCase();
    expect(denied).not.toContain("amortized_term_months");
    expect(denied).not.toContain("first_payment_date");
    // The four scalars ARE on it, which is why the room never sends them here.
    expect(denied).toContain("llc_bi__amount__c");
    expect(denied).toContain("llc_bi__term_months__c");
  });

  it("resolves a field change by API name against the org's own describe", () => {
    const stage = read("StageLoanModification.cls");
    expect(stage).toContain("Schema.SObjectType.LLC_BI__Loan__c.fields.getMap()");
    expect(stage).toContain('No field named "');
    // A DATE arrives as YYYY-MM-DD, which is exactly what the room composes.
    expect(stage).toContain("is a date; supply YYYY-MM-DD");
  });
});
