import { describe, expect, it } from "vitest";
import {
  MAGNITUDE_MULTIPLE,
  clauseCount,
  magnitudeAdvisories,
  dollarFigures,
  provablyClean,
  qualifierFilter,
  singleClause,
  type QualifierMember,
} from "./dispatch";
import type { IntentResult, WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE DISPATCH RULE, AND THE TWO SAFETY LAYERS.

   Every case below is a line from the 2026-09-01 brain drive or its mirror. The
   drive's four misses are the four assertions that matter: the qualifier that
   was ignored twice (P6, P7), the magnitude that had no bound (P7), the
   three-part line that collapsed (P11), and the instruction the parser could
   not read at all (P5).
   ============================================================================= */

const LOC = "a4Zbb0000027MaYEAU";
const SEASONAL = "a4Zbb0000027MnREAU";
const EQUIPMENT = "a4Zbb0000027MpXEAU";

const MEMBERS: QualifierMember[] = [
  { id: LOC, label: "Line of Credit", committed: 15_000_000 },
  { id: SEASONAL, label: "Seasonal Line of Credit", committed: 2_500_000 },
  { id: EQUIPMENT, label: "Equipment Loan", committed: 8_000_000 },
];

function delta(over: Partial<WorkroomDelta> & { id: string }): WorkroomDelta {
  return {
    group: "terms",
    kind: "Term change",
    badge: "",
    title: "Commitment",
    target: "Line of Credit",
    before: "$15.0M",
    after: "$4.0M",
    map: [],
    fields: [],
    filed: { recordId: "", verification: "" },
    ...over,
  } as WorkroomDelta;
}

const commitment = (id: string, loanId: string, value: number): WorkroomDelta =>
  delta({ id, member: loanId, after: `$${value / 1e6}M`, wire: { key: "requestedAmount", value, facilityId: loanId } });

const deltasResult = (deltas: WorkroomDelta[]): IntentResult => ({ kind: "deltas", reply: "Put up.", deltas });

/* ------------------------------------------------------------------ money */

describe("a figure counts only where it is written as money", () => {
  it("reads the currency mark and the magnitude word", () => {
    expect(dollarFigures("take the 2.5M line of credit to 4M")).toEqual([2_500_000, 4_000_000]);
    expect(dollarFigures("increase the Line of Credit to $20M")).toEqual([20_000_000]);
    expect(dollarFigures("move it to $2,500,000")).toEqual([2_500_000]);
    expect(dollarFigures("take it to 900M")).toEqual([900_000_000]);
    expect(dollarFigures("a $250K fee")).toEqual([250_000]);
  });

  it("reads no dollar figure out of a term or a threshold", () => {
    // A term in months and a covenant threshold are not money, and reading
    // either as a qualifier is the mirror of the bug this layer exists to fix.
    expect(dollarFigures("give the equipment loan a 240 month term")).toEqual([]);
    expect(dollarFigures("add a Fixed Charge Coverage covenant >= 1.15")).toEqual([]);
    expect(dollarFigures("move the maturity to 2028-03-31")).toEqual([]);
  });
});

/* ---------------------------------------------------------------- clauses */

describe("a multi-clause line is not a single instruction", () => {
  it("counts the founder's three-part relay line as three", () => {
    // P11: one misparsed card staged, two clauses silently dropped.
    expect(
      clauseCount(
        "increase the line of credit to 20M, extend the equipment loan to 240 months and add a 1% commitment fee",
      ),
    ).toBe(3);
    expect(singleClause("take the Line of Credit to $20M and the Equipment Loan to $10M")).toBe(false);
    expect(singleClause("raise the revolver; extend the term loan")).toBe(false);
  });

  it("leaves a proven single phrasing alone", () => {
    expect(singleClause("take the Line of Credit to $20M")).toBe(true);
    expect(singleClause("move the Seasonal maturity to 2027-06-30")).toBe(true);
    expect(singleClause("add a Fixed Charge Coverage covenant >= 1.15 on the Equipment Loan")).toBe(true);
  });
});

/* -------------------------------------------------------- the qualifier (F4) */

describe("a dollar qualifier names one member and its siblings come off the table", () => {
  it("keeps the $2.5M line and drops the $15M one (P6)", () => {
    const staged = [commitment("a", LOC, 4_000_000), commitment("b", SEASONAL, 4_000_000)];
    const read = qualifierFilter("take the 2.5M line of credit to 4M", staged, MEMBERS);
    expect(read.keep.map((d) => d.id)).toEqual(["b"]);
    expect(read.dropped.map((d) => d.id)).toEqual(["a"]);
    expect(read.said).toMatch(/Read that as the \$2\.50M Seasonal Line of Credit/);
    // SAID OUT LOUD, always. A silent drop is the same failure from the other side.
    expect(read.said).toMatch(/left alone/);
  });

  it("says nothing where the line resolved one member already", () => {
    const staged = [commitment("a", LOC, 20_000_000)];
    expect(qualifierFilter("take the 2.5M line of credit to 20M", staged, MEMBERS).said).toBeNull();
  });

  it("never reads the TARGET figure as the qualifier", () => {
    // "to 4M" is where the facility is going, not which facility it is. A layer
    // that read it as a qualifier would resolve the wrong member every time.
    const staged = [commitment("a", LOC, 2_500_000), commitment("b", EQUIPMENT, 2_500_000)];
    const read = qualifierFilter("take both lines to 2.5M", staged, MEMBERS);
    expect(read.dropped).toHaveLength(0);
    expect(read.said).toBeNull();
  });

  it("stays quiet where a figure names two members, or none", () => {
    const twins: QualifierMember[] = [
      { id: LOC, label: "Line of Credit", committed: 5_000_000 },
      { id: SEASONAL, label: "Seasonal Line of Credit", committed: 5_000_000 },
    ];
    const staged = [commitment("a", LOC, 9_000_000), commitment("b", SEASONAL, 9_000_000)];
    expect(qualifierFilter("take the 5M line to 9M", staged, twins).dropped).toHaveLength(0);
    expect(qualifierFilter("take the 7M line to 9M", staged, MEMBERS).dropped).toHaveLength(0);
  });

  it("never drops every delta it was given", () => {
    // A qualifier naming a member NOTHING was staged on narrows nothing: the
    // room would otherwise answer a staged change with an empty table.
    const staged = [commitment("a", LOC, 4_000_000), commitment("b", EQUIPMENT, 4_000_000)];
    expect(qualifierFilter("the 2.5M line to 4M", staged, MEMBERS).dropped).toHaveLength(0);
  });
});

/* -------------------------------------------------------- the magnitude (F5) */

describe("a commitment out of the relationship's range is challenged", () => {
  const committed = 49_000_000;

  it("speaks up on the 900M probe, in banker language, staged all the same (P7)", () => {
    const advice = magnitudeAdvisories({
      deltas: [commitment("a", LOC, 900_000_000)],
      members: MEMBERS,
      committed,
    });
    expect(advice).toHaveLength(1);
    expect(advice[0].rule).toBe("commitment-out-of-range");
    expect(advice[0].line).toMatch(/\$900M on the Line of Credit is 18 times/);
    expect(advice[0].line).toMatch(/\$49M this whole relationship has committed today/);
    // The plausible correction is a decimal slip, said as a line the banker
    // could have typed.
    expect(advice[0].resolution?.say).toMatch(/^change the commitment on the Line of Credit to \d+$/);
  });

  it("says nothing inside the bound", () => {
    expect(
      magnitudeAdvisories({ deltas: [commitment("a", LOC, committed * MAGNITUDE_MULTIPLE)], members: MEMBERS, committed }),
    ).toHaveLength(0);
    expect(magnitudeAdvisories({ deltas: [commitment("a", LOC, 20_000_000)], members: MEMBERS, committed })).toHaveLength(0);
  });

  it("catches a limit below zero, which is not a limit at all", () => {
    const advice = magnitudeAdvisories({ deltas: [commitment("a", LOC, -5_000_000)], members: MEMBERS, committed });
    expect(advice).toHaveLength(1);
    expect(advice[0].line).toMatch(/below zero/);
    expect(advice[0].resolution).toBeUndefined();
  });

  it("offers no correction it cannot resolve onto one facility", () => {
    const twins: QualifierMember[] = [
      { id: LOC, label: "Line of Credit", committed: 15_000_000 },
      { id: SEASONAL, label: "Line of Credit", committed: 2_500_000 },
    ];
    const advice = magnitudeAdvisories({ deltas: [commitment("a", LOC, 900_000_000)], members: twins, committed });
    expect(advice[0].resolution).toBeUndefined();
  });

  it("reads nothing off a package with no committed figure", () => {
    expect(magnitudeAdvisories({ deltas: [commitment("a", LOC, 900_000_000)], members: MEMBERS, committed: 0 })).toHaveLength(0);
  });
});

/* ------------------------------------------------------------- the fast path */

describe("the fast path is only for a parse that is provably clean", () => {
  const clean = (line: string, deltas: WorkroomDelta[]) => {
    const result = deltasResult(deltas);
    return provablyClean({ line, result, sound: deltas, qualifier: qualifierFilter(line, deltas, MEMBERS) });
  };

  it("takes a single-clause proven phrasing straight through", () => {
    expect(clean("take the Line of Credit to $20M", [commitment("a", LOC, 20_000_000)])).toBe(true);
  });

  it("refuses a line the parser staged nothing for (P5)", () => {
    expect(clean("bump the big revolver by five million", [])).toBe(false);
    expect(
      provablyClean({
        line: "bump the big revolver by five million",
        result: { kind: "unparsed", reply: "I could not read that." },
        sound: [],
        qualifier: { keep: [], dropped: [], said: null },
      }),
    ).toBe(false);
  });

  it("refuses a refusal, however honest", () => {
    expect(
      provablyClean({
        line: "renew the equipment loan",
        result: { kind: "refusal", reply: "Not booked.", refusal: { title: "", body: "", detail: "" } as never },
        sound: [],
        qualifier: { keep: [], dropped: [], said: null },
      }),
    ).toBe(false);
  });

  it("refuses a multi-clause line even where every clause parsed (P11)", () => {
    const staged = [commitment("a", LOC, 20_000_000), commitment("b", EQUIPMENT, 10_000_000)];
    expect(clean("take the Line of Credit to $20M and the Equipment Loan to $10M", staged)).toBe(false);
  });

  /* THE SECOND DRIVE REVERSED THIS ONE (2026-09-01 evening), on evidence.
     The original assertion read a qualifier conflict as a reason to distrust
     the parse. But `qualifierFilter` narrows ONLY when exactly one member
     matches exactly one reading, so it comes out exactly resolved and says so:
     driven with no channel the room staged the single correct chip instantly,
     and driven WITH a channel the same line sat waiting on the desk. Punting a
     resolved line made the connected room worse than the disconnected one, so
     a resolved qualifier is now clean and only an unresolved one is the
     brain's. */
  it("takes a line the qualifier RESOLVED to one member (P6)", () => {
    const staged = [commitment("a", LOC, 4_000_000), commitment("b", SEASONAL, 4_000_000)];
    expect(clean("take the 2.5M line of credit to 4M", staged)).toBe(true);
  });

  it("still refuses a line the qualifier could not resolve", () => {
    const staged = [commitment("a", LOC, 4_000_000), commitment("b", SEASONAL, 4_000_000)];
    expect(
      provablyClean({
        line: "take the 2.5M line of credit to 4M",
        result: deltasResult(staged),
        sound: staged,
        qualifier: { keep: [], dropped: staged, said: "dropped everything" },
      }),
    ).toBe(false);
  });
});
