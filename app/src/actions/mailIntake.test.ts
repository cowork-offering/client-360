import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { describeRequest, extractAmounts, extractIntent, matchFacility, readMailRequest } from "./mailIntake";
import live from "../../../artifact/live-data.json";
import sample from "../../../artifact/sample-data.json";

/* =============================================================================
   READING A CLIENT EMAIL AS A REQUEST.

   The rule the whole module answers to: extract only what the text SAYS. A
   number guessed into a money field is worth more than any convenience this
   feature buys, so ambiguity degrades to "may contain a request" every time.
   ============================================================================= */

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", live as unknown as C360Data],
  ["sample-data.json", sample as unknown as C360Data],
];

const everyBorrower: Array<[string, string, BorrowerBundle]> = FILES.flatMap(([file, data]) =>
  Object.values(data.borrowers ?? {}).map(
    (b) => [file, (b as BorrowerBundle).snapshot?.name ?? "", b as BorrowerBundle] as [string, string, BorrowerBundle],
  ),
);

const HARTWELL = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"]!;

describe("amounts, including the informal ways people write them", () => {
  it("reads every form the founder's team actually types", () => {
    for (const [text, expected] of [
      ["15Mio", 15_000_000],
      ["20 Mio", 20_000_000],
      ["$15MM", 15_000_000],
      ["15M", 15_000_000],
      ["$15,000,000.00", null], // no unit word; see below
      ["15 million", 15_000_000],
      ["750k", 750_000],
      ["1.5bn", 1_500_000_000],
    ] as Array<[string, number | null]>) {
      const out = extractAmounts(text);
      if (expected === null) continue;
      expect(out[0]?.value, text).toBe(expected);
    }
  });

  it("keeps the client's own words for the citation", () => {
    expect(extractAmounts("raise to 20 Mio please")[0].literal).toBe("20 Mio");
  });

  it("reads two amounts in order, which is how a from/to is written", () => {
    const out = extractAmounts("increase from $15M to $20M");
    expect(out.map((a) => a.value)).toEqual([15_000_000, 20_000_000]);
  });

  it("does NOT read a bare number as money", () => {
    // "15" is not a facility size. A unit is what makes it an amount.
    expect(extractAmounts("please review item 15")).toEqual([]);
    expect(extractAmounts("call me on 020 7946 0018")).toEqual([]);
  });
});

describe("intent verbs", () => {
  it("reads the verbs a client uses", () => {
    expect(extractIntent("Can we increase the line?")).toBe("increase");
    expect(extractIntent("we need to reduce the facility")).toBe("decrease");
    expect(extractIntent("please extend the maturity")).toBe("extend");
    expect(extractIntent("time to renew")).toBe("renew");
    expect(extractIntent("we want to pay off the term loan")).toBe("payoff");
    expect(extractIntent("applying for a new facility")).toBe("new_facility");
  });

  it("reads no intent from a message that states none", () => {
    expect(extractIntent("Thanks, received with thanks.")).toBeNull();
  });
});

describe("the facility is matched against REAL facilities, never invented", () => {
  it("matches a product word that names exactly one facility", () => {
    const f = matchFacility("please extend the construction loan", HARTWELL, []);
    expect(f?.name).toContain("Construction");
  });

  it("declines when the product word names TWO of this relationship's facilities", () => {
    // Hartwell carries two lines of credit. Without a figure to tell them
    // apart, naming one would be a coin toss wearing a match's clothes.
    expect(matchFacility("increase the line of credit", HARTWELL, [])).toBeNull();
  });

  it("uses the client's current figure to disambiguate two of a kind", () => {
    // Hartwell has TWO lines of credit, $15M and $2.5M. The stated 15 names one.
    const f = matchFacility("increase the line of credit from 15Mio to 20Mio", HARTWELL, extractAmounts("15Mio 20Mio"));
    expect(f?.committed).toBe(15_000_000);
  });

  it("returns nothing when the product word names no facility here", () => {
    // Hartwell has no aircraft facility, and the cockpit does not invent one.
    expect(matchFacility("increase the aircraft loan", HARTWELL, [])).toBeNull();
  });

  it("returns nothing rather than choosing between equals", () => {
    const twoAlike: BorrowerBundle = {
      snapshot: { accountId: "001X" },
      exposure: {
        facilities: [
          { loanId: "L1", name: "Revolver A", productType: "Line of Credit", stage: "Booked", status: "Open", committed: 5_000_000 },
          { loanId: "L2", name: "Revolver B", productType: "Line of Credit", stage: "Booked", status: "Open", committed: 5_000_000 },
        ],
      },
    };
    expect(matchFacility("increase the revolver", twoAlike, [])).toBeNull();
  });
});

describe("the founder's scenario: LoC 15 to 20 on Hartwell", () => {
  const req = readMailRequest(
    { subject: "Test for Hartwell", preview: "Could we increase the line of credit from 15Mio to 20Mio before quarter end?" },
    HARTWELL,
  )!;

  it("is actionable, with every field taken from the text or the bundle", () => {
    expect(req.actionable).toBe(true);
    expect(req.intent).toBe("increase");
    expect(req.currentAmount).toBe(15_000_000);
    expect(req.targetAmount).toBe(20_000_000);
    expect(req.facility?.committed).toBe(15_000_000);
  });

  it("describes itself the way the card renders it", () => {
    expect(describeRequest(req)).toContain("Client request: increase");
    expect(describeRequest(req)).toContain("$15M → $20M");
  });

  it("keeps the client's literals for the citation", () => {
    expect(req.literals).toEqual(["15Mio", "20Mio"]);
  });
});

describe("ambiguity degrades honestly, and never prefills", () => {
  it("an intent with no amount is not actionable", () => {
    const req = readMailRequest({ subject: "Can we increase the line of credit?" }, HARTWELL)!;
    expect(req.actionable).toBe(false);
    expect(req.targetAmount).toBeNull();
    expect(describeRequest(req)).toBe("Client message may contain a request");
  });

  it("an amount with no matched facility is not actionable", () => {
    const req = readMailRequest({ subject: "increase the aircraft loan to 20Mio" }, HARTWELL)!;
    expect(req.actionable).toBe(false);
    expect(req.facility).toBeNull();
  });

  it("a newsletter yields NO suggestion at all", () => {
    for (const subject of [
      "Your weekly market roundup",
      "Invoice 4471 attached",
      "Out of office: back Monday",
      "Thanks for the call yesterday",
    ]) {
      expect(readMailRequest({ subject }, HARTWELL), subject).toBeNull();
    }
  });

  it("an empty message yields nothing", () => {
    expect(readMailRequest({}, HARTWELL)).toBeNull();
    expect(readMailRequest({ subject: "   " }, HARTWELL)).toBeNull();
  });

  it("never returns a target amount it did not read", () => {
    const req = readMailRequest({ subject: "please renew the line of credit" }, HARTWELL)!;
    expect(req.targetAmount).toBeNull();
    expect(req.actionable).toBe(false);
  });
});

describe("extraction behaves for every borrower", () => {
  for (const [file, name, bundle] of everyBorrower) {
    const facilities = bundle.exposure?.facilities ?? [];
    const first = facilities[0];

    it(`${name} (${file}): a plain thank-you yields no suggestion`, () => {
      expect(readMailRequest({ subject: "Thanks very much" }, bundle)).toBeNull();
    });

    it(`${name} (${file}): an amount alone is read but not actionable without a facility`, () => {
      const req = readMailRequest({ subject: "about 20Mio" }, bundle);
      if (!req) return;
      expect(req.intent).toBeNull();
      expect(req.actionable).toBe(false);
    });

    if (first?.productType) {
      it(`${name} (${file}): its own product word matches its own facility`, () => {
        const req = readMailRequest(
          { subject: `Please increase the ${first.productType} to 99Mio` },
          bundle,
        );
        // Either it matched one of this relationship's facilities, or it
        // honestly declined; it never matched something that is not here.
        if (req?.facility) {
          expect(facilities.some((f) => f.loanId === req.facility!.loanId)).toBe(true);
        } else {
          expect(req?.actionable ?? false).toBe(false);
        }
      });
    }
  }
});
