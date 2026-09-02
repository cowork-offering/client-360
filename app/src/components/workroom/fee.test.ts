import { describe, expect, it } from "vitest";
import { FEE_KINDS, feeAsk, feePercentageNote, feeSay, readFeeOpen } from "./fee";
import { namedFamily, readScope } from "./elicit";
import type { ElicitMember } from "./elicit";

/* =============================================================================
   THE FEE CASCADE (C, founder drive 2026-09-02).

   "add a 1% origination fee to LOC" went to the BRAIN lane, which asked which
   line (fair) and then invented five more rounds: the fee basis on the increase
   against the full commitment, the payment method, "financed from proceeds /
   paid outside closing / bank paid / waived", and a confirmation. Then the
   deterministic layer asked "Is the origination fee 1% or $20,000,000.00?"
   because the model's restated line had carried the commitment figure into it.

   Seven exchanges for a fee whose wire carries four things: the type, the
   label, a percentage OR an amount, and one facility.
   ============================================================================= */

const LOC15 = "a4Zbb0000027MaYEAU";
const LOC2 = "a4Zbb0000027MnREAU";
const EQ8 = "a4Zbb0000027MpXEAU";

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
    id: LOC2,
    key: "Line of Credit",
    label: "$2.5MM Line of Credit",
    orgName: "Hartwell Precision Manufacturing LLC - Line of Credit - $2,500,000.00",
    shortName: "Line of Credit - $2,500,000.00",
    committed: 2_500_000,
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

describe("LOC is the lines of credit", () => {
  it("resolves the desk's own shorthand to the family, and asks which one", () => {
    expect(namedFamily("add a 1% origination fee to LOC", MEMBERS)).toEqual([LOC15, LOC2]);
    // A product word naming two members is a PRODUCT, not a facility, so the
    // scope reader still refuses to pick. That is the fan-out rule, unchanged.
    expect(readScope("add a 1% origination fee to LOC", MEMBERS).ambiguous).toBe(true);
  });

  it("resolves 'line' the same way it always did", () => {
    expect(namedFamily("add a fee to the line of credit", MEMBERS)).toEqual([LOC15, LOC2]);
  });

  it("names no family where the line names none", () => {
    expect(namedFamily("add a fee", MEMBERS)).toEqual([]);
  });
});

describe("the founder's own fee line", () => {
  const open = () => readFeeOpen("add a 1% origination fee to LOC", MEMBERS)!;

  it("settles the kind and the percentage off the line itself", () => {
    expect(open()).toMatchObject({ kind: "Origination fee", percentage: 1 });
    expect(open().amount).toBeUndefined();
  });

  it("offers the two lines of credit and nothing else", () => {
    const ask = feeAsk(open(), MEMBERS)!;
    expect(ask.text).toContain("Which facility does the origination fee go on?");
    expect(ask.options.map((o) => o.label)).toEqual(["$15.0MM Line of Credit", "$2.5MM Line of Credit"]);
  });

  it("asks NOTHING once the facility is named: that is the whole cascade gone", () => {
    const picked = { ...open(), memberId: LOC15, candidates: undefined };
    expect(feeAsk(picked, MEMBERS)).toBeNull();
  });

  it("composes one clause the fenced parser already files", () => {
    const picked = { ...open(), memberId: LOC15, candidates: undefined };
    // shortName, never orgName: a full loan name opens on the borrower's name
    // and "add" would make the party reader open an involvement create.
    expect(feeSay(picked, MEMBERS[0])).toBe("on the Line of Credit - $15,000,000.00 add a 1% origination fee");
  });

  it("says why it is not asking for an amount, instead of asking", () => {
    expect(feePercentageNote(MEMBERS[0])).toContain("works the money out itself");
  });
});

describe("the only questions it may ask are the wire's own", () => {
  it("asks the kind where the line named none, from the org's own set", () => {
    const open = readFeeOpen("add a 1% fee to the 8M equipment loan", MEMBERS)!;
    const ask = feeAsk(open, MEMBERS)!;
    expect(ask.text).toContain("What kind of fee");
    expect(ask.options.map((o) => o.label)).toEqual([...FEE_KINDS]);
  });

  it("asks how much where the line carried neither figure", () => {
    const open = readFeeOpen("add an origination fee to the 8M equipment loan", MEMBERS)!;
    expect(feeAsk(open, MEMBERS)!.text).toContain("How much is the origination fee");
  });

  it("reads bps as a percentage, and never as an amount", () => {
    const open = readFeeOpen("add a 25bps commitment fee to the 8M equipment loan", MEMBERS)!;
    expect(open).toMatchObject({ kind: "Commitment fee", percentage: 0.25 });
    expect(open.amount).toBeUndefined();
  });

  it("reads a flat amount where the line carries money and no percentage", () => {
    const open = readFeeOpen("add a $5,000 attorney fee to the 8M equipment loan", MEMBERS)!;
    expect(open).toMatchObject({ kind: "Attorney fee", amount: 5000 });
    expect(open.percentage).toBeUndefined();
  });
});

describe("what is not a fee create", () => {
  it("leaves a question about the fees on file alone", () => {
    expect(readFeeOpen("what fees are on this package?", MEMBERS)).toBeNull();
    expect(readFeeOpen("show me the fees", MEMBERS)).toBeNull();
  });

  it("leaves every other line alone", () => {
    expect(readFeeOpen("take the 15M line of credit to $20,000,000", MEMBERS)).toBeNull();
    expect(readFeeOpen("add a DSCR covenant of 1.25x on the 8M equipment loan", MEMBERS)).toBeNull();
  });

  it("falls back to the focused facility only where the line named no scope at all", () => {
    expect(readFeeOpen("add a 1% origination fee", MEMBERS, MEMBERS[2])?.memberId).toBe(EQ8);
    expect(readFeeOpen("add a 1% origination fee to LOC", MEMBERS, MEMBERS[2])?.memberId).toBeUndefined();
  });
});
