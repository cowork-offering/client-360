import { describe, expect, it } from "vitest";
import {
  NARRATION_MAX_BULLETS,
  composeNarratePrompt,
  narrationText,
  parseNarration,
  shouldNarrate,
  subjectFor,
  type NarrateSubject,
} from "./narrate";
import type { BrainEnvelope } from "./brainLane";

/* =============================================================================
   THE REMARK, HELD TO ITS FENCE.

   Three things must be true or this is a regression rather than a feature. The
   remark is PROSE and can never carry a shape. No markdown character ever
   reaches the glass. And chrome is not narrated: a colleague does not comment on
   a confirm.
   ============================================================================= */

const envelope: BrainEnvelope = {
  v: 2,
  line: "take the line to $20M",
  room: "facility",
  relationship: "Hartwell Precision Manufacturing LLC",
  route: "modify",
  packageName: "Hartwell Industrial C&I Credit Package",
  productPackageId: "a5Fbb000000IHFJEA4",
  selectedFacility: null,
  facilities: [],
  staged: [],
  reads: { covenants: [{ name: "DSC", threshold: ">= 1.25x", status: "Compliant", scope: "relationship" }], notCarried: [] },
  grounding: "plugin-skill:workroom-brain",
};

const staged: NarrateSubject = {
  act: "staged",
  sentence: "Reading that as: take the Line of Credit to $20,000,000.",
  card: { title: "On the plan", rows: [{ label: "Commitment", value: "$20.0MM", sub: "Line of Credit" }] },
};

describe("the prompt hands over the act, the card and the book", () => {
  const prompt = composeNarratePrompt(envelope, staged);

  it("tells the model the room has already acted and it is writing beside it", () => {
    expect(prompt).toMatch(/THE ROOM HAS ALREADY ACTED/);
    expect(prompt).toMatch(/The room STAGED a change/);
    expect(prompt).toContain("Reading that as: take the Line of Credit to $20,000,000.");
    expect(prompt).toContain("Commitment: $20.0MM (Line of Credit)");
  });

  it("forbids a shape, because a remark may never stage anything", () => {
    expect(prompt).toMatch(/Reply with PROSE only/);
    expect(prompt).toMatch(/Never JSON, never a shape/);
    expect(prompt).toMatch(/cannot stage, amend or un-stage/);
    // The shape contract and the wire schema are the reply prompt's, not this one.
    expect(prompt).not.toMatch(/EXACTLY ONE JSON object/);
    expect(prompt).not.toMatch(/scalarChangesJson/);
  });

  it("states the light-structure rules the parser then enforces", () => {
    expect(prompt).toMatch(/at most three bullets/i);
    expect(prompt).toMatch(/Bold only for a figure/);
    expect(prompt).toMatch(/No headings, no tables, no links, no code/);
  });

  it("carries the doctrine and the book", () => {
    expect(prompt).toMatch(/IDENTITY\./);
    expect(prompt).toMatch(/Never fabricate a figure/);
    expect(prompt).toContain(JSON.stringify(envelope));
  });
});

describe("chrome is not narrated", () => {
  const chrome = [
    "That is 3 changes. One at a time.",
    "Confirmed.",
    "Discarded.",
    "Nothing staged yet.",
    "Done.",
    "Ok.",
  ];

  it("refuses every sentence a colleague would not comment on", () => {
    for (const sentence of chrome) {
      expect(shouldNarrate({ act: "answered", sentence })).toBe(false);
    }
  });

  it("refuses a short sentence that carries no card", () => {
    expect(shouldNarrate({ act: "answered", sentence: "Which line?" })).toBe(false);
  });

  it("narrates a staged card and a read", () => {
    expect(shouldNarrate(staged)).toBe(true);
    expect(
      shouldNarrate({
        act: "answered",
        sentence: "Six covenants across the relationship, four of them at relationship level.",
      }),
    ).toBe(true);
  });
});

describe("the markdown subset, parsed into the room's own elements", () => {
  it("keeps plain sentences as lines", () => {
    const blocks = parseNarration("Coverage thins to 0.62x.\nThe pledged pool does not grow with the line.");
    expect(blocks).toEqual([
      { kind: "line", spans: [{ text: "Coverage thins to 0.62x." }] },
      { kind: "line", spans: [{ text: "The pledged pool does not grow with the line." }] },
    ]);
  });

  it("turns bold into a span, never an asterisk on the glass", () => {
    const blocks = parseNarration("Coverage thins to **0.62x** on that pool.");
    expect(blocks[0]).toEqual({
      kind: "line",
      spans: [{ text: "Coverage thins to " }, { text: "0.62x", bold: true }, { text: " on that pool." }],
    });
    expect(narrationText(blocks)).not.toMatch(/\*/);
  });

  it("groups hyphen bullets into one list and caps it", () => {
    const blocks = parseNarration("Three tests move:\n- DSC at 1.25x\n- Liquidity at $2M\n- Capex at $3M\n- Leverage");
    expect(blocks[0]).toMatchObject({ kind: "line" });
    expect(blocks[1].kind).toBe("bullets");
    expect(blocks[1].kind === "bullets" && blocks[1].items).toHaveLength(NARRATION_MAX_BULLETS);
  });

  it("drops a heading, a table, a fence and a quote entirely", () => {
    const blocks = parseNarration(
      "## Summary\n| a | b |\n| - | - |\n```js\ncode()\n```\n> quoted\nThe cushion is thin on liquidity.",
    );
    expect(narrationText(blocks)).toBe("The cushion is thin on liquidity.");
  });

  it("keeps a link's words and drops its target", () => {
    expect(narrationText(parseNarration("See [the covenant](https://example.com) for the threshold."))).toBe(
      "See the covenant for the threshold.",
    );
  });

  it("rewrites an em dash the model slipped in", () => {
    expect(narrationText(parseNarration("Coverage thins — the pool did not grow."))).not.toMatch(/[—–]/);
  });

  it("survives a half-streamed bold without printing the marker", () => {
    expect(narrationText(parseNarration("Coverage thins to **0.6"))).toBe("Coverage thins to 0.6");
  });

  it("holds a remark to a remark", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence ${i}.`).join("\n");
    expect(parseNarration(long).length).toBeLessThanOrEqual(4);
  });

  it("reads an empty or blank reply as no remark at all", () => {
    expect(parseNarration("")).toEqual([]);
    expect(parseNarration("\n\n   \n")).toEqual([]);
  });
});

describe("what the room just did, read from the item it appended", () => {
  it("reads a staged chip block as a staged act, with the line that announced it", () => {
    const subject = subjectFor(
      {
        kind: "chips",
        chips: [{ delta: { title: "Commitment", target: "Line of Credit", after: "$20.0MM" } }],
      },
      "Reading that as: take the Line of Credit to $20,000,000.",
    );
    expect(subject).toMatchObject({ act: "staged", sentence: "Reading that as: take the Line of Credit to $20,000,000." });
    expect(subject?.card?.rows[0]).toEqual({ label: "Commitment", value: "$20.0MM", sub: "Line of Credit" });
  });

  it("reads a refusal-only block as a refusal", () => {
    const subject = subjectFor({
      kind: "chips",
      chips: [{ refusal: { title: "Detach covenant", target: "Line of Credit", reason: "the junction is not updateable" } }],
    });
    expect(subject?.act).toBe("refused");
  });

  it("reads a read card as an answer, with its rows", () => {
    const subject = subjectFor({
      kind: "read",
      card: {
        lede: "Six covenants across the relationship.",
        groups: [{ heading: "Covenant tests", rows: [{ label: "DSC", value: "1.41x", detail: ">= 1.25x" }] }],
      },
    });
    expect(subject).toMatchObject({ act: "answered", sentence: "Six covenants across the relationship." });
    expect(subject?.card?.rows).toEqual([{ label: "DSC", value: "1.41x", sub: ">= 1.25x" }]);
  });

  it("does NOT narrate a clarify carrying option chips: the chips are the question", () => {
    expect(subjectFor({ kind: "agent", text: "Which line do you mean?", options: [{ label: "a", say: "a" }] })).toBeNull();
  });

  it("does not narrate the room's chrome items", () => {
    for (const kind of ["banker", "opening", "brief", "packages", "lookup", "notice", "dossier"]) {
      expect(subjectFor({ kind, text: "whatever" })).toBeNull();
    }
  });
});
