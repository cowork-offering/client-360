import { describe, expect, it } from "vitest";
import { rungFor, toolsCovering } from "./ladder";
import type { BrainEnvelope } from "./brainLane";

/* =============================================================================
   THE LADDER, ON TEN REPRESENTATIVE LINES.

   The founder's constraint is that a call-out is another whole round: 30 to 90
   seconds, and the banker watching. So the number this suite protects is how
   RARE rung 3 is. Eight of the ten lines below are lines a booth audience will
   actually see, and eight of them answer without a tool.
   ============================================================================= */

const base: BrainEnvelope = {
  v: 2,
  line: "",
  room: "facility",
  relationship: "Hartwell Precision Manufacturing LLC",
  route: "modify",
  packageName: "Hartwell Industrial C&I Credit Package",
  productPackageId: "a5Fbb000000IHFJEA4",
  selectedFacility: null,
  facilities: [],
  staged: [],
  reads: {
    involvements: [{ name: "Hartwell Industrial Holdings LLC", role: "Guarantor", scope: "all 6 facilities" }],
    notCarried: ["spread", "orderly liquidation value"],
  },
  grounding: "plugin-skill:workroom-brain",
};

const at = (line: string, over: Partial<BrainEnvelope> = {}) => rungFor({ ...base, ...over, line });

describe("rung 2 quick resolves a phrasing against the book", () => {
  it("takes a fuzzy instruction on the quick tier", () => {
    expect(at("bump the big revolver by five million")).toMatchObject({ rung: 2, tier: "quick" });
  });

  it("takes a plain instruction on the quick tier", () => {
    expect(at("take the equipment term to seven years")).toMatchObject({ rung: 2, tier: "quick" });
  });

  it("takes a plain read the envelope already holds on the quick tier", () => {
    expect(at("who is on the construction loan")).toMatchObject({ rung: 2, tier: "quick" });
  });

  it("takes an add on the quick tier", () => {
    expect(at("add Hartwell Logistics as a guarantor on the equipment loan")).toMatchObject({
      rung: 2,
      tier: "quick",
    });
  });
});

describe("rung 2 default is where judgment is paid for", () => {
  it("reasons over cushion", () => {
    expect(at("which covenant has the least cushion")).toMatchObject({ rung: 2, tier: "default" });
  });

  it("reasons over a why", () => {
    expect(at("why did we set liquidity where it is")).toMatchObject({ rung: 2, tier: "default" });
  });

  it("reasons over a should", () => {
    expect(at("should we add a fixed charge covenant instead")).toMatchObject({ rung: 2, tier: "default" });
  });

  it("reasons over a comparison and names the risk", () => {
    const choice = at("compare the coverage risk on the two lines");
    expect(choice).toMatchObject({ rung: 2, tier: "default" });
    expect(choice.why).toMatch(/judgment/);
  });
});

describe("rung 3 is reached only for something current a tool actually covers", () => {
  it("goes to the tool for a current ratio", () => {
    const choice = at("what is the current DSCR on the latest Boom spread");
    expect(choice.rung).toBe(3);
    expect(choice.why).toMatch(/currentBoomRatios/);
  });

  it("goes to the tool for a party that may have moved since the snapshot", () => {
    const choice = at("is Elena still a guarantor on the loan they just booked");
    expect(choice.rung).toBe(3);
    expect(choice.why).toMatch(/liveInvolvements/);
  });

  it("STAYS at rung 2 where the line asks for something current no tool covers", () => {
    // A fresh valuation is a genuine gap, and neither exposed tool reads one. A
    // 30 to 90 second round trip that ends in "no tool carries that" is the
    // worst of both, so the refusal is instant instead.
    const choice = at("is there a newer valuation on the Kokomo plant");
    expect(choice).toMatchObject({ rung: 2, tier: "default" });
    expect(choice.why).toMatch(/no exposed tool covers it/);
  });

  it("STAYS at rung 2 where the book admits a gap no tool fills", () => {
    const choice = at("what is the spread on the revolver");
    expect(choice).toMatchObject({ rung: 2, tier: "default" });
    expect(choice.why).toMatch(/does not carry spread/);
  });

  it("goes to the tool where the book admits a gap a tool DOES fill", () => {
    const choice = at("what is the total leverage", {
      reads: { notCarried: ["total leverage"] },
    });
    expect(choice.rung).toBe(3);
    expect(choice.why).toMatch(/currentBoomRatios/);
  });
});

describe("coverage is the mirror of the exposed tool list", () => {
  it("names the tool whose subject the line touches, and nothing else", () => {
    expect(toolsCovering("what is the current leverage")).toEqual(["currentBoomRatios"]);
    expect(toolsCovering("who guarantees the construction loan")).toEqual(["liveInvolvements"]);
    expect(toolsCovering("is there a newer appraisal")).toEqual([]);
  });
});
