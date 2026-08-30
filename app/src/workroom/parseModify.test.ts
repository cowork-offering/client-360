import { describe, expect, it } from "vitest";
import type { Facility, LegalEntity } from "../data/contract";
import { parseModify, type ParseContext } from "./parseModify";

/* =============================================================================
   THE DETERMINISTIC PARSE, AND ITS REFUSALS.

   The interesting cases here are the ones where a parser is tempted to invent:
   a bare number, a spread, a month with no day. Each has to come back as a
   question, because a chip the banker did not mean is worse than one that never
   arrived — and every one of those chips is a figure that would reach the org.
   ============================================================================= */

/* THE REAL HARTWELL PACKAGE, read live from bankinggpt 2026-08-27
   (a5Fbb000000IHFJEA4, seven members). The org calls the $15MM member a
   "Line of Credit"; the word "revolver" appears nowhere in the data, which is
   exactly why the parser carries the vocabulary and the data does not. */

const line15: Facility = {
  loanId: "a4Zbb0000027MaYEAU",
  name: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00",
  productType: "Line of Credit",
  productPackageId: "a5Fbb000000IHFJEA4",
  stage: "Booked",
  status: "Active",
  committed: 15_000_000,
  outstanding: 9_200_000,
  interestRate: 7.6,
  maturityDate: "2027-03-15",
};

const line25: Facility = {
  loanId: "a4Zbb0000027MttEAE",
  name: "Hartwell Precision Manufacturing LLC - Line of Credit - $2,500,000.00",
  productType: "Line of Credit",
  productPackageId: "a5Fbb000000IHFJEA4",
  stage: "Booked",
  status: "Active",
  committed: 2_500_000,
  maturityDate: "2026-06-30",
};

const equipment: Facility = {
  loanId: "a4Zbb0000027MnREAU",
  name: "Hartwell Precision Manufacturing LLC - Equipment - $8,000,000.00",
  productType: "Equipment",
  productPackageId: "a5Fbb000000IHFJEA4",
  stage: "Booked",
  status: "Active",
  committed: 8_000_000,
  maturityDate: "2028-01-31",
};

/** The showcase member. Proposal stage: never a modification target. */
const proposal: Facility = {
  loanId: "a4Zbb000002CECXEA4",
  name: "Hartwell Precision Manufacturing LLC - Equipment - $3,000,000.00",
  productType: "Equipment",
  productPackageId: "a5Fbb000000IHFJEA4",
  stage: "Proposal",
  status: "Active",
  committed: 3_000_000,
};

const entities: LegalEntity[] = [
  { accountName: "Hartwell Industrial Holdings LLC", borrowerType: "Guarantor" },
  { accountName: "Elena Hartwell", borrowerType: "Limited Guarantor" },
];

const ctx: ParseContext = {
  facilities: [line15, line25, equipment, proposal],
  booked: [line15, line25, equipment],
  relationship: "Hartwell Precision Manufacturing LLC",
  entities,
};

/** One facility on the package: the member never has to be named. */
const single: ParseContext = { ...ctx, facilities: [line15], booked: [line15] };

describe("the deterministic parse", () => {
  it("reads a commitment increase onto the member it names", () => {
    const out = parseModify("increase the line of credit - $15,000,000.00 to $20,000,000", ctx);
    expect(out.kind).toBe("amendments");
    if (out.kind !== "amendments") return;
    expect(out.amendments).toHaveLength(1);
    expect(out.amendments[0].field.id).toBe("loan.amount");
    expect(out.amendments[0].facility?.loanId).toBe(line15.loanId);
    expect(out.amendments[0].value).toEqual({ kind: "currency", amount: 20_000_000, text: "$20,000,000" });
  });

  it("takes the figure after the LAST 'to', so 'from 15 to 20 million' is twenty", () => {
    const out = parseModify("take the revolver from $15,000,000 to 20 million", single);
    if (out.kind !== "amendments") throw new Error(out.kind);
    expect(out.amendments[0].value).toMatchObject({ kind: "currency", amount: 20_000_000 });
  });

  it("REFUSES a bare number rather than reading it as millions", () => {
    const out = parseModify("increase the commitment to 20", single);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/in full/i);
  });

  it("REFUSES a spread, because the field the tool writes is an absolute rate", () => {
    const out = parseModify("move the rate to SOFR+300", single);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/absolute rate/i);
  });

  it("reads basis points as a percentage", () => {
    const out = parseModify("price the revolver at 810 bps", single);
    if (out.kind !== "amendments") throw new Error(out.kind);
    expect(out.amendments[0].value).toMatchObject({ kind: "percent", rate: 8.1 });
  });

  it("REFUSES a month with no day, because a maturity is a day", () => {
    const out = parseModify("push the maturity to March 2028", single);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/names a month/i);
  });

  it("reads a written date in either order", () => {
    for (const line of ["move the maturity to 2028-03-15", "move the maturity to 15 March 2028", "move the maturity to March 15, 2028"]) {
      const out = parseModify(line, single);
      if (out.kind !== "amendments") throw new Error(`${line}: ${out.kind}`);
      expect(out.amendments[0].value).toMatchObject({ kind: "date", iso: "2028-03-15" });
    }
  });

  it("DERIVES an extension from the member's own maturity, and refuses when there is none", () => {
    const out = parseModify("extend the maturity by 18 months", single);
    if (out.kind !== "amendments") throw new Error(out.kind);
    // 2027-03-15 + 18 months.
    expect(out.amendments[0].value).toMatchObject({ kind: "date", iso: "2028-09-15" });

    const blind = parseModify("extend the maturity by 18 months", {
      ...single,
      facilities: [{ ...line15, maturityDate: undefined }],
      booked: [{ ...line15, maturityDate: undefined }],
    });
    expect(blind.kind).toBe("clarify");
  });

  it("reads a term in years as months", () => {
    const out = parseModify("give the revolver a 5 year term", single);
    if (out.kind !== "amendments") throw new Error(out.kind);
    expect(out.amendments[0].value).toMatchObject({ kind: "months", months: 60 });
  });

  it("ASKS WHICH MEMBER when the package has several and the line names none", () => {
    const out = parseModify("increase the commitment to $20,000,000", ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/which member/i);
  });

  it("spreads a product word across every BOOKED member of that product", () => {
    const out = parseModify("take the equipment facilities to $9,000,000", ctx);
    if (out.kind !== "amendments") throw new Error(out.kind);
    // Two Equipment members are booked; the Proposal one is not swept up.
    expect(out.amendments).toHaveLength(1);
    expect(out.amendments[0].facility?.loanId).toBe(equipment.loanId);
  });

  it("maps the banker's word onto the ORG's product, and asks when two share it", () => {
    // The org calls it a Line of Credit; the banker says revolver, and this
    // package has two of them.
    const out = parseModify("increase the revolver to $20,000,000", ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/Line of Credit - \$15,000,000\.00/);
    expect(out.question).toMatch(/Line of Credit - \$2,500,000\.00/);
  });

  it("NEVER targets a member that is not booked, and says why", () => {
    const out = parseModify("increase the equipment - $3,000,000.00 to $4,000,000", ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/at Proposal/);
    expect(out.question).toMatch(/only runs against a booked facility/);
  });

  it("reads a mapped covenant with a threshold as a FILEABLE covenant value", () => {
    const out = parseModify("add a leverage covenant max 3.5x", single, "Hartwell");
    if (out.kind !== "amendments") throw new Error(out.kind);
    const a = out.amendments[0];
    expect(a.field.id).toBe("covenant.add");
    expect(a.value?.kind).toBe("covenant");
    if (a.value?.kind !== "covenant") return;
    expect(a.value.typeName).toBe("Leverage");
    expect(a.value.threshold).toBe(3.5);
    expect(a.value.operator).toBe("<=");
  });

  it("asks for the threshold when a mapped covenant arrives without one", () => {
    const out = parseModify("add a leverage covenant", single, "Hartwell");
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/threshold/i);
    expect(out.question).toMatch(/Leverage/);
  });

  it("reads an out-of-scope amendment as an amendment, not as a failure", () => {
    const out = parseModify("add a collateral insurance covenant", single);
    if (out.kind !== "amendments") throw new Error(out.kind);
    expect(out.amendments[0].field.id).toBe("covenant.add");
    expect(out.amendments[0].field.wireKey).toBeUndefined();
  });

  it("resolves a party already on the deal, and keeps an unknown name verbatim", () => {
    const known = parseModify("remove Elena Hartwell from the guaranty", single);
    if (known.kind !== "amendments") throw new Error(known.kind);
    expect(known.amendments.some((a) => a.party === "Elena Hartwell")).toBe(true);

    const fresh = parseModify("add Hartwell Logistics LLC as a guarantor", single);
    if (fresh.kind !== "amendments") throw new Error(fresh.kind);
    expect(fresh.amendments.some((a) => a.party === "Hartwell Logistics LLC")).toBe(true);
  });

  it("ASKS WHO when a party amendment names a role and nobody", () => {
    const out = parseModify("add a guarantor", single);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/which entity/i);
  });

  it("reads a fee ask (founder directive), and never as a commitment", () => {
    const out = parseModify("add a $50,000 arrangement fee", single);
    if (out.kind !== "amendments") throw new Error(out.kind);
    expect(out.amendments[0].field.category).toBe("fee");
  });

  it("says nothing rather than guessing at a line with no amendment in it", () => {
    expect(parseModify("what is the weather in Kokomo", single).kind).toBe("none");
    expect(parseModify("", single).kind).toBe("none");
  });

  it("says there is nothing to modify when no member is booked", () => {
    const out = parseModify("increase the commitment to $20,000,000", { ...ctx, booked: [] });
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/booked/i);
  });
});
