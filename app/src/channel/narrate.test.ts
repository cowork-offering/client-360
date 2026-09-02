import { describe, expect, it } from "vitest";
import {
  NARRATION_MAX_BULLETS,
  composeNarratePrompt,
  narrationText,
  parseNarration,
  resolveEntities,
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
    expect(prompt).toMatch(/up to three line items/);
    expect(prompt).toMatch(/at most eighteen words/);
    expect(prompt).toMatch(/A LINE ITEM IS ONE HYPHEN BULLET/);
    // THE ENTITY NAME IS BOLD NOW. A rule saying "bold only for a figure"
    // would train the model out of the feature it is being asked for, so both
    // halves of the replacement are pinned: the room owns the figures, and
    // nothing else in the remark is bold.
    expect(prompt).toMatch(/THE ROOM PRINTS THAT ENTITY'S OWN FIGURES/);
    expect(prompt).toMatch(/Nothing else is bold/);
    expect(prompt).toMatch(/No headings, no tables, no links, no code/);
    expect(prompt).not.toMatch(/Bold only for a figure/);
  });

  it("carries the budget for THIS act and no other", () => {
    expect(prompt).toMatch(/ABOUT FIFTY-FIVE WORDS/);
    expect(prompt).not.toMatch(/ABOUT NINETY WORDS/);
    for (const act of ["greeting", "answered", "staged", "refused", "mail"] as const) {
      expect(composeNarratePrompt(envelope, { ...staged, act })).toMatch(/ABOUT [A-Z-]+ WORDS in all/);
    }
  });

  it("says where the route stands, bound or not, on every remark", () => {
    expect(prompt).toMatch(/THE ROUTE IS BOUND: this is a modify/);
    const open = composeNarratePrompt(
      { ...envelope, route: "unbound", routeOpen: true, routeOptions: ["modify", "renew", "create"] },
      staged,
    );
    expect(open).toMatch(/THE ROUTE IS NOT BOUND YET/);
    expect(open).toMatch(/modify, renew, create/);
    expect(open).not.toMatch(/THE ROUTE IS BOUND/);
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


/* =============================================================================
   THE LINE ITEM (founder, 2026-09-02).

   "some are a bit long winded and hard to read, maybe more sections, better
   structured, for instance showing XYZ covenant as a line item with text
   around it."

   THE MODEL WRITES THE NAME AND THE CLAUSE; THE ROOM WRITES THE NUMBER. Every
   assertion below is about that seam: what resolves, what deliberately does
   NOT, and what a row looks like when nothing does.
   ============================================================================= */

const book: BrainEnvelope = {
  v: 2,
  line: "",
  room: "facility",
  relationship: "Hartwell Precision Manufacturing LLC",
  route: "modify",
  packageName: "Hartwell Industrial C&I Credit Package",
  productPackageId: "a5Fbb000000IHFJEA4",
  selectedFacility: null,
  // Two Lines of Credit, exactly as this package carries them: the room names a
  // shared key with its commitment, the banker writes it the other way round.
  facilities: [
    { loanId: "a4Zbb0000027MaYEAU", label: "$15.0MM Line of Credit", commitment: "$15.0MM" },
    { loanId: "a4Zbb0000027MbZEAU", label: "$2.50MM Line of Credit", commitment: "$2.50MM" },
    { loanId: "a4Zbb0000027McAEAU", label: "Equipment", commitment: "$8.0MM" },
  ],
  staged: [],
  reads: {
    covenants: [
      {
        name: "Debt Service Coverage of Borrower",
        threshold: "≥ 1.25×",
        measured: "1.38×",
        status: "Compliant",
        severity: "clear",
        scope: "across the relationship",
      },
      {
        name: "Accounts Receivable",
        threshold: "≤ 80%",
        measured: "80%",
        status: "Watch",
        severity: "watch",
        scope: "$15.0MM Line of Credit",
      },
      {
        name: "Minimum Liquidity",
        threshold: "≥ $5.00M",
        measured: "$4.10M",
        status: "Breach",
        severity: "breach",
        scope: "across the relationship",
      },
    ],
    involvements: [{ name: "James Hartwell", role: "Guarantor", scope: "across the relationship" }],
    collateral: [{ asset: "UCC-Accounts", pledged: "$8.0M", lendable: "$6.4M", scope: "$15.0MM Line of Credit" }],
    pricing: [{ facility: "Equipment", rate: "7.25%" }],
    notCarried: [],
  },
  grounding: "plugin-skill:workroom-brain",
};

const rowsOf = (raw: string, envelope: BrainEnvelope = book) => {
  const blocks = resolveEntities(parseNarration(raw), envelope);
  const entity = blocks.find((b) => b.kind === "entity");
  return entity && entity.kind === "entity" ? entity.rows : [];
};

describe("a covenant as a line item, with the book's own figure beside it", () => {
  it("resolves a covenant to measured against threshold, with no colour when it is clean", () => {
    const [row] = rowsOf("- **Debt Service Coverage of Borrower**: the widest cushion on the deal.");
    expect(row.label.map((s) => s.text).join("")).toBe("Debt Service Coverage of Borrower");
    expect(row.value).toBe("1.38× vs ≥ 1.25×");
    expect(row.tone).toBeUndefined();
  });

  it("takes the room's own colour from the verdict's severity, never from a label string", () => {
    expect(rowsOf("- **Minimum Liquidity**: below the floor this quarter.")[0].tone).toBe("bad");
    expect(rowsOf("- **Accounts Receivable**: exactly on its ceiling.")[0].tone).toBe("warn");
  });

  it("matches a facility the banker's way round, not only the room's", () => {
    // The room prints "$15.0MM Line of Credit"; the founder's own example
    // writes "Line of Credit ($15.0MM)". Only the normalised form joins them.
    const [row] = rowsOf("- **Line of Credit ($15.0MM)**: commitment moves.");
    expect(row.value).toBe("$15.0MM");
  });

  it("resolves an involvement to its role and a staged change to its reading", () => {
    expect(rowsOf("- **James Hartwell**: unlimited on all six.")[0].value).toBe("Guarantor");
    const withPlan = { ...book, staged: [{ title: "Equipment", target: "a4Zbb0000027McAEAU", after: "84 months" }] };
    // RANK ORDER: a staged title of the same name beats the facility.
    expect(rowsOf("- **Equipment**: the term moves.", withPlan)[0].value).toBe("84 months");
    expect(rowsOf("- **Equipment**: the term moves.")[0].value).toBe("$8.0MM");
  });

  it("resolves collateral to what is lendable, falling back to what is pledged", () => {
    expect(rowsOf("- **UCC-Accounts**: first lien, and the pool does not grow.")[0].value).toBe("$6.4M");
  });

  it("REFUSES a name two entries in one table both produce, rather than guessing", () => {
    // Two Lines of Credit share this key. Printing one facility's commitment
    // beside the other's name is the 2026-09-01 evening drive's own failure.
    const [row] = rowsOf("- **Line of Credit**: which one is anyone's guess.");
    expect(row.value).toBeUndefined();
    expect(row.label.map((s) => s.text).join("")).toBe("Line of Credit");
  });

  it("never takes a RATE from pricing: a facility head gets its commitment", () => {
    expect(rowsOf("- **Equipment**: priced where it was.")[0].value).toBe("$8.0MM");
  });

  it("keeps an unmatched name as a plain-reading row, with no rail and no error", () => {
    const [row] = rowsOf("- **Piedmont Precision Components**: not on this book at all.");
    expect(row.value).toBeUndefined();
    expect(row.spans.map((s) => s.text).join("")).toContain("not on this book");
  });

  it("is a bullet unless the head is bold AND followed by a colon", () => {
    const plain = parseNarration("- Debt Service Coverage of Borrower: 1.38x against a 1.25x floor.");
    expect(plain[0].kind).toBe("bullets");
    const midBold = parseNarration("- Coverage sits at **1.38x**: comfortable.");
    expect(midBold[0].kind).toBe("bullets");
  });

  it("survives the stream: a half-written head is a bullet until the colon lands", () => {
    expect(parseNarration("- **Debt Serv")[0].kind).toBe("bullets");
    expect(parseNarration("- **Debt Service Coverage of Borrower**")[0].kind).toBe("bullets");
    expect(parseNarration("- **Debt Service Coverage of Borrower**: the widest cushion.")[0].kind).toBe("entity");
  });

  it("refuses a head that is really a sentence", () => {
    const long = `- **${"x".repeat(90)}**: this is a paragraph wearing a name.`;
    expect(parseNarration(long)[0].kind).toBe("bullets");
  });

  it("holds a run of line items to the same three the bullets are held to", () => {
    const many = ["a", "b", "c", "d"].map((n) => `- **${n}${n}**: one clause.`).join("\n");
    const block = parseNarration(many)[0];
    expect(block.kind === "entity" && block.rows).toHaveLength(NARRATION_MAX_BULLETS);
  });

  it("splits a mixed run rather than pretending a bullet is a row", () => {
    const blocks = parseNarration("- **Equipment**: the term moves.\n- and something else entirely");
    expect(blocks.map((b) => b.kind)).toEqual(["entity", "bullets"]);
  });

  it("leaves a remark with no line items exactly as it was", () => {
    const blocks = parseNarration("Coverage thins.\n- DSC at 1.25x\n- Liquidity at $2M");
    expect(resolveEntities(blocks, book)).toBe(blocks);
  });

  it("reads back as plain text, rail included, with no markup", () => {
    const text = narrationText(resolveEntities(parseNarration("- **James Hartwell**: unlimited."), book));
    expect(text).toBe("James Hartwell: unlimited. Guarantor");
    expect(text).not.toMatch(/[*_#]/);
  });
});
