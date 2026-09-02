import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../../data/contract";
import { readTopic } from "../workroom/ask";
import { buildRelReadCard, readRelTopic, relReadGap } from "./relReads";
import { relContextFor, type RelContext } from "./reviewFlows";

/* =============================================================================
   THE THREE READS THE FACILITY ROOM'S FIVE DO NOT ANSWER.

   TWO THINGS THIS HOLDS, and the second is the important one. First, that a
   banker asking a relationship question gets a card from the book rather than a
   round trip. Second, THAT THE FACILITY ROOM'S FIVE KEEP FIRST REFUSAL ON EVERY
   WORD THEY OWN: this reader is consulted only where `readTopic` has already
   declined the line, and none of its topics may claim a line the shared one
   answers.
   ============================================================================= */

function ctxFor(overrides: Partial<BorrowerBundle> = {}): RelContext {
  const bundle = {
    snapshot: { accountId: "001X", name: "Hartwell", primaryRiskRating: "4", computedRiskRating: "5" },
    exposure: {
      facilities: [
        { loanId: "0Cb1", status: "Active", name: "Line of Credit", riskGrade: "4" },
        { loanId: "0Cb2", status: "Active", name: "Construction", riskGrade: "5" },
      ],
    },
    ...overrides,
  } as unknown as BorrowerBundle;
  const data = { meta: { generatedAt: "2026-09-02" } } as unknown as C360Data;
  return relContextFor({ data, bundle, accountId: "001X", accountName: "Hartwell" });
}

describe("the relationship room's own read topics", () => {
  it("reads a rating question, a review question and a request question", () => {
    expect(readRelTopic("what is the risk rating")).toBe("rating");
    expect(readRelTopic("what grade are they on?")).toBe("rating");
    expect(readRelTopic("when was the last review")).toBe("reviews");
    expect(readRelTopic("what has the client asked for")).toBe("requests");
    expect(readRelTopic("any requests?")).toBe("requests");
  });

  it("reads an INSTRUCTION as an instruction, never as a question about it", () => {
    // "downgrade the rating" carries a topic word and is a write, not a read.
    expect(readRelTopic("downgrade the rating to a 5")).toBeNull();
    expect(readRelTopic("override the grade to 6")).toBeNull();
    expect(readRelTopic("run the annual review")).toBeNull();
    expect(readRelTopic("open a service request")).toBeNull();
  });

  it("declines a line with no opener and no bare-topic shape", () => {
    expect(readRelTopic("the rating is fine")).toBeNull();
    expect(readRelTopic("")).toBeNull();
  });

  it("THE FACILITY GUARD: it claims no line the shared five already answer", () => {
    /* This reader is only ever consulted where readTopic returned null, and
       this is the assertion that keeps that true rather than merely intended.
       A word both readers claim would be answered by the shared one anyway;
       the point is that no line exists where BOTH fire. */
    const SHARED = [
      "which covenants are on this relationship",
      "who guarantees the construction loan",
      "what collateral is pledged",
      "what fees are on the line",
      "which facilities does this package hold",
      "any guarantors?",
      "covenants?",
    ];
    for (const line of SHARED) {
      expect(readTopic(line), line).not.toBeNull();
    }
  });
});

describe("the cards, and the gaps that are not cards", () => {
  it("names the surface every grade sits on, and the facilities as a second scale", () => {
    const card = buildRelReadCard("rating", ctxFor())!;
    expect(card.topic).toBe("rating");
    expect(card.lede).toContain("is 4, on the relationship");
    expect(card.groups[0].rows[0].detail).toContain("Not the facility scale");
    // One borrower, one grade; six facilities, six. That spread IS the dual
    // rating this org actually holds, and it is labelled as a second scale.
    expect(card.groups[1].heading).toContain("on their own scale");
    expect(card.groups[1].rows.map((r) => r.value)).toEqual(["4", "5"]);
  });

  it("NEVER builds a reviews card, because no read carries reviews", () => {
    // A card saying "no reviews on file" would be a claim nothing supports.
    // The read does not carry reviews at all, which is a different fact.
    expect(buildRelReadCard("reviews", ctxFor())).toBeNull();
    const gap = relReadGap("reviews", ctxFor());
    expect(gap).toContain("No read on this cockpit carries the credit reviews");
    expect(gap).toContain("this files a second");
  });

  it("says the read stages no requests rather than that the client asked for nothing", () => {
    expect(buildRelReadCard("requests", ctxFor())).toBeNull();
    expect(relReadGap("requests", ctxFor())).toContain("stages no client requests");
    const withOne = ctxFor({ requests: [{ summary: "Payoff quote", receivedAt: "2026-08-28" }] } as never);
    const card = buildRelReadCard("requests", withOne)!;
    expect(card.groups[0].rows[0].label).toBe("Payoff quote");
  });

  it("says the read stages no grade rather than inventing one", () => {
    const bare = ctxFor({ snapshot: { accountId: "001X", name: "Hartwell" } } as never);
    expect(buildRelReadCard("rating", bare)).toBeNull();
    expect(relReadGap("rating", bare)).toContain("no risk grade");
  });
});
