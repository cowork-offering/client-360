import { describe, expect, it } from "vitest";
import { exceptionAsk, exceptionSay, readExceptionOpen } from "./exception";
import type { ElicitMember } from "./elicit";

/* =============================================================================
   A POLICY EXCEPTION CREATE IS THE FAST LANE'S (E7, founder drive 2026-09-02).

   Every line below is the founder's own, or its mirror. The defect had three
   halves and they are the three assertions that matter: the line reached the
   BRAIN and was answered as a question about the exception already on file; the
   banker's verb phrase became the record's NAME; and it landed on the FOCUSED
   facility with a status nobody chose.
   ============================================================================= */

const LOC15 = "a4Zbb0000027MaYEAU";
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
    id: EQ8,
    key: "Equipment",
    label: "$8.0MM Equipment",
    orgName: "Hartwell Precision Manufacturing LLC - Equipment - $8,000,000.00",
    shortName: "Equipment - $8,000,000.00",
    committed: 8_000_000,
  },
];

const focused = MEMBERS[1];

describe("the exception's NAME is what is out of policy", () => {
  it("reads the founder's own line as a name and a note, never as one long title", () => {
    const open = readExceptionOpen("log a policy exception for leverage above policy approved by credit committee", MEMBERS)!;
    expect(open.name).toBe("Leverage above policy");
    expect(open.note).toContain("approved by credit committee");
    // NOBODY SAID A STATUS. The org defaults to Unmitigated and the room will
    // not take that default.
    expect(open.status).toBeUndefined();
  });

  it("never lets the banker's verb phrase become the name", () => {
    const open = readExceptionOpen("draft the exception for advance rate above guideline", MEMBERS)!;
    expect(open.name).toBe("Advance rate above guideline");
    expect(open.name.toLowerCase()).not.toContain("draft");
    expect(open.name.toLowerCase()).not.toContain("exception");
  });

  it("takes the facility out of the name and stands on the one the line named", () => {
    const open = readExceptionOpen(
      "log a policy exception on the 15M line of credit for leverage above policy approved by credit committee",
      MEMBERS,
      focused,
    )!;
    expect(open.name).toBe("Leverage above policy");
    // NOT THE FOCUSED ONE. That is the defect, by name.
    expect(open.memberId).toBe(LOC15);
  });

  it("stands on the focused facility only where the line named none", () => {
    const open = readExceptionOpen("log a policy exception for leverage above policy", MEMBERS, focused)!;
    expect(open.memberId).toBe(EQ8);
  });

  it("honours a status the line states, and asks for one it does not", () => {
    expect(readExceptionOpen("log a waived policy exception for leverage above policy", MEMBERS)!.status).toBe("Waived");
    expect(readExceptionOpen("log an unmitigated policy exception for leverage above policy", MEMBERS)!.status).toBe(
      "Unmitigated",
    );
    expect(
      readExceptionOpen("log a policy exception for leverage above policy mitigated by a cash sweep", MEMBERS)!.status,
    ).toBe("Mitigated");
  });

  it("claims no question and no read", () => {
    expect(readExceptionOpen("what policy exceptions are on this relationship?", MEMBERS)).toBeNull();
    expect(readExceptionOpen("list the exceptions", MEMBERS)).toBeNull();
    expect(readExceptionOpen("increase the line of credit to $20,000,000", MEMBERS)).toBeNull();
  });
});

describe("the room asks the status itself, with the org's own three", () => {
  it("asks which facility first where the line named none and nothing is focused", () => {
    const open = readExceptionOpen("log a policy exception for leverage above policy", MEMBERS)!;
    const ask = exceptionAsk(open, MEMBERS)!;
    expect(ask.text).toContain('Which facility is "Leverage above policy" out of policy on');
    expect(ask.options.map((o) => o.label)).toEqual(MEMBERS.map((m) => m.label));
  });

  it("asks the status with waived, mitigated and unmitigated, and names the note it holds", () => {
    const open = readExceptionOpen(
      "log a policy exception on the 15M line of credit for leverage above policy approved by credit committee",
      MEMBERS,
    )!;
    const ask = exceptionAsk(open, MEMBERS)!;
    expect(ask.options.map((o) => o.label)).toEqual(["Waived", "Mitigated", "Unmitigated"]);
    expect(ask.text).toContain('"approved by credit committee"');
    expect(ask.text).toContain("$15.0MM Line of Credit");
  });

  it("asks nothing once the name, the status and the facility are all settled", () => {
    const open = readExceptionOpen(
      "log a waived policy exception on the 15M line of credit for leverage above policy",
      MEMBERS,
    )!;
    expect(exceptionAsk(open, MEMBERS)).toBeNull();
  });
});

describe("the composed sentence is one clause the parser already files", () => {
  const on = MEMBERS[0];

  it("names the facility by the org's own loan name and carries the status", () => {
    const open = readExceptionOpen("log a policy exception for leverage above policy approved by credit committee", MEMBERS)!;
    const say = exceptionSay({ ...open, status: "Waived", memberId: LOC15 }, on);
    expect(say).toBe(
      "on the Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00 log a policy exception for Leverage above policy waived",
    );
    expect(say).not.toContain("approved by credit committee");
  });

  it("turns the banker's own note into the mitigant when the status is Mitigated", () => {
    const open = readExceptionOpen("log a policy exception for leverage above policy approved by credit committee", MEMBERS)!;
    const say = exceptionSay({ ...open, status: "Mitigated", memberId: LOC15 }, on);
    expect(say).toContain("mitigated by credit committee approval");
  });

  it("says mitigated and nothing more where there is no note to stand on", () => {
    const open = readExceptionOpen("log a policy exception for leverage above policy", MEMBERS)!;
    expect(exceptionSay({ ...open, status: "Mitigated", memberId: LOC15 }, on)).toMatch(/ mitigated$/);
  });

  it("round trips: the composed sentence reads back as the same exception", () => {
    const open = readExceptionOpen("log a policy exception for leverage above policy approved by credit committee", MEMBERS)!;
    const say = exceptionSay({ ...open, status: "Mitigated", memberId: LOC15 }, on);
    const again = readExceptionOpen(say, MEMBERS)!;
    expect(again.name).toBe("Leverage above policy");
    expect(again.status).toBe("Mitigated");
    expect(again.memberId).toBe(LOC15);
    expect(exceptionAsk(again, MEMBERS)).toBeNull();
  });

  it("stages a DIFFERENT exception than the one on file rather than substituting it", () => {
    // The relationship's own CRE-AR-01 records the construction advance rate.
    // A line about leverage is a new exception, and the room composes it.
    const open = readExceptionOpen("log a policy exception for leverage above policy", MEMBERS, focused)!;
    expect(open.name).toBe("Leverage above policy");
    expect(open.name).not.toContain("advance rate");
    expect(exceptionSay({ ...open, status: "Unmitigated" }, focused)).toContain("for Leverage above policy unmitigated");
  });
});
