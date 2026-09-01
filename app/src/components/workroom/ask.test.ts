import { describe, expect, it } from "vitest";
import { bankerly, isQuestion, readRole, readTopic, unsoundFieldChange, whatICanDo } from "./ask";
import type { WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE TWO GUARDS, AND THE TWO TRANSCRIPTS THAT EARNED THEM.

   Both lines below are the founder's own, verbatim from the 2026-09-01 live
   run. The first was answered with the parser's refusal boilerplate over a
   bundle holding every involvement; the second was parsed into a STAGED TERM
   CHANGE on the Line of Credit. They are fixtures rather than paraphrases
   because the exact wording is what the guards have to survive - including the
   typo, the trailing question mark and the fifteen-word tail.
   ============================================================================= */

/** Founder transcript 1 (tweak 10): a read the bundle answers completely. */
export const TRANSCRIPT_READ = "which borrowers have we already in the package?";
/** Founder transcript 2 (tweak 11): the question that became a term change. */
export const TRANSCRIPT_MISPARSE = "what covenants are against this Product Package";
/** Founder transcript 3 (tweak 11b): the same, worse - the whole tail staged. */
export const TRANSCRIPT_TAIL =
  "package with information and what exisiting covenants do i have against this relationship i can use ?";

describe("the question guard", () => {
  it("catches all three founder transcripts", () => {
    for (const line of [TRANSCRIPT_READ, TRANSCRIPT_MISPARSE, TRANSCRIPT_TAIL]) {
      expect(isQuestion(line)).toBe(true);
    }
  });

  it("catches a leading interrogative with no question mark", () => {
    // The misparse transcript carried none, which is exactly why the mark
    // alone was never going to be enough.
    expect(TRANSCRIPT_MISPARSE).not.toContain("?");
    expect(isQuestion("how much headroom is left on the revolver")).toBe(true);
    expect(isQuestion("are there any covenants on the seasonal line")).toBe(true);
  });

  it("catches a question mark anywhere, not only at the end", () => {
    expect(isQuestion("the revolver? what is on it")).toBe(true);
  });

  it("lets a plain instruction through untouched", () => {
    for (const line of [
      "increase the Line of Credit to $19M",
      "take the Seasonal maturity to 2027-06-30",
      "add a fixed charge coverage covenant at 1.15 on the revolver",
      "reprice the equipment loan to SOFR+250",
      "pledge the Duluth warehouse to the construction loan",
    ]) {
      expect(isQuestion(line)).toBe(false);
    }
  });

  it("does not fire on an empty line", () => {
    expect(isQuestion("   ")).toBe(false);
  });
});

describe("read intents", () => {
  it("reads the borrowers question as the structure topic", () => {
    expect(readTopic(TRANSCRIPT_READ)).toBe("structure");
  });

  it("reads both covenant transcripts as the covenants topic", () => {
    expect(readTopic(TRANSCRIPT_MISPARSE)).toBe("covenants");
    expect(readTopic(TRANSCRIPT_TAIL)).toBe("covenants");
  });

  for (const [line, topic] of [
    ["who is on the deal", "structure"],
    ["list the guarantors", "structure"],
    ["show me the collateral", "collateral"],
    ["what fees are on this package", "fees"],
    ["which facilities are booked", "facilities"],
    ["how many covenants do we have", "covenants"],
  ] as Array<[string, string]>) {
    it(`reads "${line}" as ${topic}`, () => {
      expect(readTopic(line)).toBe(topic);
    });
  }

  it("REFUSES to read an instruction as a read, however many topic words it names", () => {
    // The mirror image of the bug this module exists for: "add a covenant to
    // the revolver" naming `covenant` must never become a request to LIST the
    // covenants. Without a read opener there is no read.
    for (const line of [
      "add a covenant to the revolver",
      "pledge the warehouse as collateral on the construction loan",
      "put Hartwell Holdings on the equipment facility as guarantor",
      "add a 25bp facility fee",
    ]) {
      expect(readTopic(line)).toBeNull();
    }
  });

  it("is null on a question the room holds no read for, which the guard then answers honestly", () => {
    // Neither names one of the topics the bundle can answer, so neither gets a
    // card. `isQuestion` still catches both, and the room says what it CAN do
    // rather than proposing something.
    for (const line of ["who is the relationship manager", "what is the weather"]) {
      expect(readTopic(line)).toBeNull();
      expect(isQuestion(line)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------- value bounds */

function fieldDelta(display: string, title = "Product"): WorkroomDelta {
  return {
    id: "d1",
    group: "terms",
    kind: "Term change",
    badge: "b",
    title,
    target: "Line of Credit",
    before: "-",
    after: display,
    map: [],
    fields: [],
    filed: { recordId: "r", verification: "v" },
    fieldWire: { field: "Product__c", label: title, value: display, display, facilityId: "HW1001" },
  };
}

describe("value bounds on the field wave", () => {
  it("refuses the tail the founder's second repro staged", () => {
    // The whole fifteen-word remainder of the sentence, question mark included.
    const value = "package with information and what exisiting covenants do i have against this relationship i can use ?";
    expect(unsoundFieldChange(TRANSCRIPT_TAIL, fieldDelta(value))).toBeTruthy();
  });

  it("refuses a value carrying a question mark", () => {
    expect(unsoundFieldChange("set the product to Package?", fieldDelta("Package?"))).toContain("question");
  });

  it("refuses a value that is part of a question", () => {
    expect(unsoundFieldChange("change it to what we said", fieldDelta("what we said"))).toContain("question");
  });

  it("refuses a value longer than a picklist label", () => {
    expect(
      unsoundFieldChange("set the product to one two three four five six", fieldDelta("one two three four five six")),
    ).toContain("sentence");
  });

  it("refuses two colocated nouns with no assignment verb in the line", () => {
    // "Product Package" is the exact shape that staged a term change.
    expect(unsoundFieldChange(TRANSCRIPT_MISPARSE, fieldDelta("Package"))).toContain("never says what to change it to");
  });

  it("passes a real field change", () => {
    expect(unsoundFieldChange("change the product to Equipment", fieldDelta("Equipment"))).toBeNull();
    expect(unsoundFieldChange("set the risk grade to 5", fieldDelta("5", "Risk grade"))).toBeNull();
    expect(unsoundFieldChange("move the maturity to 2027-06-30", fieldDelta("2027-06-30", "Maturity"))).toBeNull();
  });

  it("leaves every other wave alone", () => {
    // A commitment, a rate and a maturity are parsed into typed values by
    // their own waves; re-judging them here would be a rule written twice.
    const commitment = { ...fieldDelta("$19.0MM"), fieldWire: undefined };
    expect(unsoundFieldChange("anything at all", commitment)).toBeNull();
  });
});

/* --------------------------------------------------------------- banker copy */

describe("the room talks like a banker", () => {
  for (const [engine, gone] of [
    ["it names no member I hold and no term I file", "no member I hold"],
    ["it names no member I hold and no field I file", "no field I file"],
    ["so it rides the plan as a handoff and nothing is silently dropped", "rides the plan"],
    ["why an entry is recorded rather than filed", "recorded rather than filed"],
    ["today's value is not staged in this read", "not staged in this read"],
    ["I could not map that onto this package", "could not map that onto"],
  ] as Array<[string, string]>) {
    it(`retires "${gone}"`, () => {
      const out = bankerly(engine);
      expect(out).not.toContain(gone);
      expect(out.length).toBeGreaterThan(0);
    });
  }

  it("leaves a sentence with none of those phrases byte-identical", () => {
    const clean = "Commitment on the Line of Credit is in the manifest: $15.0MM to $19.0MM.";
    expect(bankerly(clean)).toBe(clean);
  });

  it("names the work in credit language, with a worked example", () => {
    const said = whatICanDo("Hartwell Precision Manufacturing LLC");
    expect(said).toContain("Hartwell Precision Manufacturing LLC");
    expect(said).toMatch(/commitment|rate|maturity/i);
    expect(said).toContain("$19M");
    // House style: no em dashes anywhere in UI copy.
    expect(said).not.toContain("—");
  });
});

/* =============================================================================
   THE SHORTEST READS, AND THE HOUSE RULE ON DASHES (E7 + COPY, drive
   2026-09-01).
   ============================================================================= */

describe("a bare topic is a read, and it is answered locally (E7)", () => {
  it("takes \"Any guarantors?\" the way it takes \"who are the guarantors?\"", () => {
    // The drive: "Any guarantors?" carried no opener, so it went to the desk and
    // came back as a card with the heading and no rows under it.
    expect(readTopic("Any guarantors?")).toBe("structure");
    expect(readTopic("who are the guarantors?")).toBe("structure");
    expect(readTopic("guarantors?")).toBe("structure");
    expect(readTopic("any covenants?")).toBe("covenants");
    expect(readTopic("collateral?")).toBe("collateral");
  });

  it("never takes an instruction, however short", () => {
    expect(readTopic("add a guarantor")).toBeNull();
    expect(readTopic("remove the guarantor?")).toBeNull();
    expect(readTopic("pledge collateral")).toBeNull();
    expect(readTopic("take Elena Hartwell off the 15M line of credit")).toBeNull();
    // A sentence is not a bare topic, whatever it ends on.
    expect(readTopic("this facility has guarantors on it already, doesn't it?")).toBeNull();
  });

  it("reads a question about GUARANTORS as a question about a role", () => {
    expect(readRole("Any guarantors?")).toBe("guarantor");
    expect(readRole("who are the guarantors?")).toBe("guarantor");
    expect(readRole("which borrowers are on the package?")).toBeNull();
  });
});

describe("no em dash reaches the glass", () => {
  it("turns the split-offer sentence the desk wrote into house style", () => {
    const desk = "The line names two changes—one I can file, one I cannot.";
    expect(bankerly(desk)).toBe("The line names two changes, one I can file, one I cannot.");
    expect(bankerly(desk)).not.toContain("—");
  });

  it("turns a spaced dash into a comma too, and leaves the null placeholder alone", () => {
    expect(bankerly("Staged on the clone — nothing is filed yet.")).toBe("Staged on the clone, nothing is filed yet.");
    expect(bankerly("—")).toBe("—");
    expect(bankerly("Grade —")).toBe("Grade —");
  });
});
