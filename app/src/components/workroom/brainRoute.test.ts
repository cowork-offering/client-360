import { describe, expect, it } from "vitest";
import { buildEnvelope, politeCommand, toReadCardModel } from "./brainRoute";
import { isQuestion } from "./ask";
import type { BrainReadCard } from "../../channel/brainLane";
import type { PackageMember, WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE TWO READINGS OF ONE SENTENCE.

   The founder's own wording ("can you increase the LoC to 20M") is the case
   this module exists for, and it has a mirror that must NOT move: the covenant
   question that staged a term change. Both readings are asserted here, side by
   side, because the whole risk in this refinement is loosening one into the
   other.
   ============================================================================= */

const member = (id: string, key: string, amount: string): PackageMember => ({
  id,
  key,
  short: key,
  tag: "Booked",
  product: key,
  amount,
  detail: `${key} record`,
});

const MEMBERS = [
  member("a4Zbb0000027MaYEAU", "Line of Credit", "$15.0M"),
  member("a4Zbb0000027MnREAU", "Equipment Loan", "$8.0M"),
  { ...member("a4Zbb0000027MpXEAU", "Construction", "$12.0M"), proposed: true },
];

describe("a courtesy in front of an imperative is a COMMAND", () => {
  const commands = [
    ["can you increase the LoC to 20M", "increase the LoC to 20M"],
    ["Can you increase the Line of Credit to $20M?", "increase the Line of Credit to $20M"],
    ["could you move the maturity to 2028-03-31", "move the maturity to 2028-03-31"],
    ["would you please add a leverage covenant max 3.5x", "add a leverage covenant max 3.5x"],
    ["will you take the seasonal line to $4M", "take the seasonal line to $4M"],
    ["please, can you set the amortisation to 240 months", "set the amortisation to 240 months"],
    ["can we pledge the Duluth warehouse to the equipment", "pledge the Duluth warehouse to the equipment"],
    ["can I log a policy exception: hold limit exceeded", "log a policy exception: hold limit exceeded"],
    ["could you remove Elena Hartwell from the revolver", "remove Elena Hartwell from the revolver"],
  ] as const;

  it.each(commands)("strips the courtesy from %s", (line, stripped) => {
    expect(politeCommand(line)).toBe(stripped);
    // And the line it hands the parser carries no question mark, which the
    // field wave would otherwise read as part of a value (founder repro 11b).
    expect(politeCommand(line)).not.toMatch(/\?/);
  });

  it("hands the parser a line the question guard would have caught", () => {
    // The guard still SEES it as a question; the polite reading is what runs
    // first, and the stripped remainder is no longer one.
    expect(isQuestion("can you increase the LoC to 20M")).toBe(true);
    expect(isQuestion(politeCommand("can you increase the LoC to 20M")!)).toBe(false);
  });
});

describe("a courtesy in front of a QUESTION is still a question", () => {
  const questions = [
    "can you tell me what covenants are on this",
    "could you show me the fees",
    "can you list the borrowers",
    "would you explain the advance rate",
    "can you check whether the DSC still works",
    "can you remind me who guarantees the construction line",
    "can you help",
    // The two founder failures, in their original words. Neither may become a
    // command, however the guard is refined.
    "which borrowers have we already in the package?",
    "what covenants are against this Product Package",
    // A courtesy with nothing after it is not an instruction either.
    "can you",
    "could you please",
  ];

  it.each(questions)("leaves %s to the question lane", (line) => {
    expect(politeCommand(line)).toBeNull();
  });

  it("does not read a bare imperative as needing a courtesy to work", () => {
    // The fast lane already had this one and it must not change.
    expect(politeCommand("increase the Line of Credit to $20M")).toBeNull();
  });
});

describe("the envelope carries what the room holds, and no more", () => {
  const entry = (title: string, target: string, after: string): WorkroomDelta =>
    ({ id: title, group: "terms", kind: "Term change", badge: "", title, target, before: "$15.0M", after, map: [], fields: [], filed: { recordId: "", verification: "" } }) as WorkroomDelta;

  it("names every eligible member, the selection and the staged digest", () => {
    const envelope = buildEnvelope({
      line: "what covenants are on this",
      mode: "modify",
      accountName: "Hartwell Precision Manufacturing LLC",
      packageName: "Hartwell Industrial C&I Credit Package",
      productPackageId: "a5Fbb000000IHFJEA4",
      members: MEMBERS,
      eligible: (m) => !m.proposed,
      focused: MEMBERS[0],
      entries: [entry("Commitment", "Line of Credit", "$20.0M")],
    });
    expect(envelope.v).toBe(2);
    expect(envelope.room).toBe("facility");
    expect(envelope.line).toBe("what covenants are on this");
    expect(envelope.route).toBe("modify");
    expect(envelope.grounding).toBe("plugin-skill:workroom-brain");
    // The ineligible member is not offered as something a proposal can target.
    expect(envelope.facilities.map((f) => f.label)).toEqual(["Line of Credit", "Equipment Loan"]);
    expect(envelope.selectedFacility?.loanId).toBe("a4Zbb0000027MaYEAU");
    expect(envelope.staged).toEqual([{ title: "Commitment", target: "Line of Credit", after: "$20.0M" }]);
  });

  it("carries no wire payload, so a reply cannot restate a figure it did not read", () => {
    const envelope = buildEnvelope({
      line: "x",
      mode: "modify",
      accountName: "x",
      packageName: "x",
      productPackageId: null,
      members: MEMBERS,
      eligible: () => true,
      focused: null,
      entries: [entry("Commitment", "Line of Credit", "$20.0M")],
    });
    expect(JSON.stringify(envelope)).not.toMatch(/requestedAmount|planHash|decisionToken|wire/);
    expect(envelope.selectedFacility).toBeNull();
  });
});

describe("a brain read-card renders through the room's own card", () => {
  const card: BrainReadCard = {
    type: "read-card",
    topic: "involvements",
    title: "Borrowing structure on the Hartwell package",
    rows: [
      { icon: "borrower", label: "Hartwell Precision Manufacturing LLC", value: "Borrower", sub: "all 6 facilities" },
      { icon: "warn", label: "Fixed charge coverage", value: "relationship level", sub: "6% cushion . watch" },
      { icon: "not-a-glyph", label: "Something", value: "else" },
    ],
  };

  it("maps the pack's glyph vocabulary onto the room's icons", () => {
    const model = toReadCardModel(card);
    expect(model.groups[0].rows.map((r) => r.icon)).toEqual(["package", "covenant", "package"]);
  });

  it("carries the pack's own topic slug to the DOM, and the title as the lede", () => {
    const model = toReadCardModel(card);
    expect(model.topic).toBe("involvements");
    expect(model.lede).toBe("Borrowing structure on the Hartwell package");
    expect(model.groups[0].heading).toBe("Who is on the deal");
  });

  it("puts the status in the ink, from the pack's own warn glyph", () => {
    const model = toReadCardModel(card);
    expect(model.groups[0].rows[1].tone).toBe("warn");
    expect(model.groups[0].rows[0].tone).toBeUndefined();
  });

  it("hands the conversation back even where the brain ended without a follow-up", () => {
    expect(toReadCardModel(card).followUp).toMatch(/what should change/i);
    expect(toReadCardModel({ ...card, followUp: "Who should be added?" }).followUp).toBe("Who should be added?");
  });

  it("title-cases a topic slug it does not know rather than dropping it", () => {
    const model = toReadCardModel({ ...card, topic: "risk_rating" });
    expect(model.topic).toBe("risk_rating");
    expect(model.groups[0].heading).toBe("Risk rating");
  });
});
