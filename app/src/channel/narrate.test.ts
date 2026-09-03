import { describe, expect, it } from "vitest";
import {
  CLAIM_MARK,
  FIGURE_MARK,
  GREETING_MAX_SENTENCES,
  NARRATION_MAX_BULLETS,
  NARRATION_MAX_SENTENCES,
  composeNarratePrompt,
  guardClaims,
  guardFigures,
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

  /* THE STAGED BUDGET WAS CUT TO THIRTY-FIVE WORDS (founder, 2026-09-03: "even
     a single bubble is too much text to read"). A refused remark is one
     sentence and names no word count, so the loop below asks each act for its
     own budget line rather than for one shape of words. */
  it("carries the budget for THIS act and no other", () => {
    expect(prompt).toMatch(/ABOUT THIRTY-FIVE WORDS/);
    expect(prompt).not.toMatch(/ABOUT NINETY WORDS/);
    for (const act of ["greeting", "answered", "staged", "mail"] as const) {
      expect(composeNarratePrompt(envelope, { ...staged, act })).toMatch(/ABOUT [A-Z-]+ WORDS in all/);
    }
    expect(composeNarratePrompt(envelope, { ...staged, act: "refused" })).toMatch(/ONE SENTENCE, about twenty-five words/);
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

  it("carries the mail doctrine only where the envelope carries mail", () => {
    expect(prompt).not.toMatch(/THE CLIENT HAS WRITTEN/);
    expect(prompt).not.toContain('"mail"');
    const withMail = composeNarratePrompt(
      {
        ...envelope,
        mail: {
          source: "mailbox",
          from: "james@hartwellprecision.com",
          received: "Aug 28, 2026",
          subject: "Equipment loan",
          gist: "Can we renew the equipment loan when it matures?",
          route: "renew",
        },
      },
      staged,
    );
    expect(withMail).toMatch(/THE CLIENT HAS WRITTEN/);
    expect(withMail).toMatch(/Do not assume it is an increase/);
    expect(withMail).toMatch(/IT IS A REQUEST, NEVER A READ/);
    // The message travels VERBATIM, inside the envelope, and nowhere else.
    expect(withMail).toContain("james@hartwellprecision.com");
    expect(withMail).toContain("Can we renew the equipment loan when it matures?");
  });

  it("carries the route-open doctrine only while the route is open", () => {
    expect(prompt).not.toMatch(/THE ROUTE IS NOT BOUND\./);
    const open = composeNarratePrompt(
      { ...envelope, route: "unbound", routeOpen: true, routeOptions: ["modify", "renew", "create"] },
      { act: "greeting", sentence: "Hey Fabian. What are we doing with this relationship?" },
    );
    expect(open).toMatch(/THE ROUTE IS NOT BOUND\./);
    expect(open).toMatch(/NEVER say which facility moves, never say what changes follow/);
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
    for (const kind of ["banker", "opening", "brief", "packages", "lookup"]) {
      expect(subjectFor({ kind, text: "whatever" })).toBeNull();
    }
  });

  /* THE FACILITY ROOM'S OWN SHAPES, VERBATIM.

     `notice` and `dossier` are shared with the relationship room by NAME AND BY
     SHAPE, so the loop above -- which fed `{kind, text}` -- proved nothing
     about either: the arms it was guarding read `title`/`body` and `dossier`,
     which a bare `text` item does not carry. The three items below are what
     `Workroom.tsx` actually appends (:278, :279, :3249, :3332), and the
     facility room's demo ends on the dossier. Every one of them must read as
     no remark at all. */
  const facilityNotice = {
    kind: "notice",
    title: "This view is not connected to the bank's systems.",
    body: "The connector did not answer.",
  };
  const facilityDossier = {
    kind: "dossier",
    dossier: {
      title: "Filed against Hartwell Grocery Holdings",
      footer: "Single-use decision token redeemed.",
      rows: [{ label: "Commitment", value: "$20.0MM" }],
    },
  };
  const facilityReply = { kind: "reply", reply: { subject: "Your facility", body: "As discussed." } };

  it("does not narrate the FACILITY room's notice, dossier or reply", () => {
    expect(subjectFor(facilityNotice)).toBeNull();
    expect(subjectFor(facilityDossier)).toBeNull();
    expect(subjectFor(facilityReply)).toBeNull();
  });

  it("narrates the SAME shapes once the relationship room owns them", () => {
    const notice = subjectFor({ ...facilityNotice, room: "relationship" });
    expect(notice).toMatchObject({ act: "refused" });
    expect(notice?.sentence).toBe(
      "This view is not connected to the bank's systems. The connector did not answer.",
    );
    const dossier = subjectFor({ ...facilityDossier, room: "relationship" });
    expect(dossier).toMatchObject({ act: "filed", sentence: "Single-use decision token redeemed." });
    expect(dossier?.card).toEqual({
      title: "Filed against Hartwell Grocery Holdings",
      rows: [{ label: "Commitment", value: "$20.0MM" }],
    });
  });

  it("narrates a create the relationship room cannot file", () => {
    const gap = subjectFor({
      kind: "gap",
      room: "relationship",
      gap: { what: "Add a covenant", line: "I cannot file this one.", orgGap: "no deployed tool takes it" },
    });
    expect(gap).toMatchObject({ act: "refused", sentence: "I cannot file this one." });
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

describe("one voice per moment (founder drive, 2026-09-02)", () => {
  /** A routine confirm, as the chips block carries it: one scalar term change,
   *  no advisory, no refusal. */
  const routineChips = {
    kind: "chips",
    chips: [{ delta: { title: "Commitment", target: "Line of Credit", after: "$20.0MM", group: "terms" } }],
  };

  it("reads a plain scalar change with no advisory as ROUTINE", () => {
    expect(subjectFor(routineChips)?.routine).toBe(true);
  });

  it("does not consult the model on one: the chip already says the whole of it", () => {
    expect(shouldNarrate(subjectFor(routineChips)!)).toBe(false);
  });

  it("still speaks where the card carries an advisory", () => {
    const subject = subjectFor({ ...routineChips, advisories: [{ id: "advice:magnitude:1" }] })!;
    expect(subject.routine).toBe(false);
    expect(shouldNarrate(subject)).toBe(true);
  });

  it("still speaks on a create, which is not a scalar term change", () => {
    const subject = subjectFor({
      kind: "chips",
      chips: [{ delta: { title: "New covenant", target: "Line of Credit", after: ">= 1.25x", group: "covenants", op: "add" } }],
    })!;
    expect(subject.routine).toBe(false);
    expect(shouldNarrate(subject)).toBe(true);
  });

  it("still speaks on a refusal", () => {
    const subject = subjectFor({
      kind: "chips",
      chips: [{ refusal: { title: "Detach covenant", target: "Line of Credit", reason: "not updateable" } }],
    })!;
    expect(subject.routine).toBe(false);
    expect(shouldNarrate(subject)).toBe(true);
  });

  it("caps a remark at two sentences of prose, and the rows are not prose", () => {
    const blocks = parseNarration(
      "One. Two. Three.\n- **DSC**: the widest cushion.\n- **AR**: on its ceiling.\nAnd a close.",
    );
    const lines = blocks.filter((b) => b.kind === "line");
    expect(narrationText(lines)).toBe("One. Two.");
    expect(blocks.some((b) => b.kind === "entity" && b.rows.length === 2)).toBe(true);
  });

  it("counts sentences ACROSS the lines, so a lead and a close is the whole budget", () => {
    const blocks = parseNarration("A lead line.\n\nA closing line.\n\nA third the glass does not carry.");
    expect(narrationText(blocks)).toBe("A lead line. A closing line.");
  });

  it("lets the greeting keep its third: the addendum's lead, rows and close", () => {
    expect(GREETING_MAX_SENTENCES).toBeGreaterThan(NARRATION_MAX_SENTENCES);
    const said = "The package is clean.\n\nJames asked for a certificate. Modify, renew, or structure something new?";
    expect(narrationText(parseNarration(said, GREETING_MAX_SENTENCES))).toContain("Modify, renew, or structure something new?");
    expect(narrationText(parseNarration(said))).not.toContain("Modify, renew, or structure something new?");
  });
});

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

/* ================= THE FIGURE GUARD (founder drive 2026-09-02)

   The card said CRE-AR-01 is 75 percent approved against a 65 percent
   guideline. The remark said "80 percent advance, above the bank's 70 percent
   construction guideline" and then computed "$5.2MM lendable value". These are
   the founder's own sentences.                                                */

const exceptionCard: NarrateSubject = {
  act: "answered",
  sentence: "CRE-AR-01 is on this relationship, Major and Mitigated.",
  card: {
    title: "CRE-AR-01",
    rows: [
      { label: "Approved advance rate", value: "75%", sub: "Construction" },
      { label: "Policy guideline", value: "65%", sub: "Construction" },
    ],
  },
};

const guarded = (text: string, subject: NarrateSubject = exceptionCard, env: BrainEnvelope = envelope) =>
  guardFigures(parseNarration(text), env, subject);

describe("the remark describes the card on the glass and nothing else", () => {
  /* THE DRIVE'S OWN FAILURE. The card said "Commitment amount $15M -> $1". The
     remark said the banker had moved the first payment date forward two months
     to Oct 1, 2026. Nothing of the kind had happened, and every figure in the
     sentence was in the envelope, so a figure guard could never catch it. */
  const HIS_CLAIM = "The banker moved the first payment date forward two months to Oct 1, 2026.";

  /* THE CONTROL SENTENCE NO LONGER CARRIES THE CARD'S OWN FIGURE (founder,
     2026-09-03). "$20.0MM" is printed on the card this remark sits under, so
     the card-echo rule drops it before the claim guard ever runs and the test
     could no longer tell the two rules apart. The control says something the
     card does NOT show, which is what a remark is for. */
  it("drops the sentence that claims an action nobody took", () => {
    const kept = "The revolver carries the whole increase on its own.";
    const guarded = guardClaims(parseNarration(`${kept} ${HIS_CLAIM}`), envelope, staged);
    expect(narrationText(guarded.blocks)).not.toContain("moved the first payment date");
    expect(guarded.claimed).toContain("first payment date");
    expect(narrationText(guarded.blocks)).toContain(kept);
  });

  it("marks what it dropped rather than editing the remark in silence", () => {
    const guarded = guardClaims(parseNarration(HIS_CLAIM), envelope, staged);
    expect(narrationText(guarded.blocks)).toContain(CLAIM_MARK);
  });

  it("keeps a field the card DOES carry", () => {
    const onTheCard: NarrateSubject = {
      act: "staged",
      sentence: "The first payment date goes on the plan.",
      card: { title: "On the plan", rows: [{ label: "First payment date", value: "Oct 1, 2026", sub: "Line of Credit" }] },
    };
    const guarded = guardClaims(parseNarration("That settles the first payment date on this facility."), envelope, onTheCard);
    expect(narrationText(guarded.blocks)).toContain("first payment date");
    expect(guarded.claimed).toHaveLength(0);
  });

  it("lets a remark name what the BOOK carries: a colleague mentions the covenants", () => {
    const guarded = guardClaims(parseNarration("The covenants on this package stay where they are."), envelope, staged);
    expect(narrationText(guarded.blocks)).toContain("covenants");
    expect(guarded.claimed).toHaveLength(0);
  });

  it("drops a claimed field out of a line item too, and keeps the rest", () => {
    const said = "Two things.\n- **Line of Credit**: the commitment on it moves.\n- **Equipment**: its advance rate moves too.";
    const guarded = guardClaims(parseNarration(said), envelope, staged);
    const text = narrationText(guarded.blocks);
    expect(text).toContain("Line of Credit");
    expect(text).not.toContain("its advance rate moves too");
    expect(guarded.claimed).toEqual(["advance rate"]);
  });

  it("holds NOTHING where there is no card: the greeting is about the whole book", () => {
    const greeting: NarrateSubject = { act: "greeting", sentence: "Hey Fabian. What are we doing with this relationship?" };
    const said = "The commitments sit clean across six facilities. Modify, renew, or structure something new?";
    const guarded = guardClaims(parseNarration(said, 3), envelope, greeting);
    expect(narrationText(guarded.blocks)).toContain("The commitments sit clean across six facilities.");
    expect(guarded.claimed).toHaveLength(0);
  });

  it("still strips the emphasis off an ungrounded figure, exactly as before", () => {
    const guarded = guardClaims(parseNarration("The cover is **$5.2MM** lendable."), envelope, staged);
    expect(narrationText(guarded.blocks)).toContain(FIGURE_MARK);
    expect(guarded.ungrounded).toContain("$5.2MM");
  });
});

describe("a figure the room cannot point at is not endorsed", () => {
  it("marks the founder's own drifted sentence, figure by figure", () => {
    const out = guarded(
      "The exception records an **80 percent** advance, above the bank's **70 percent** construction guideline.",
    );
    expect(out.ungrounded).toContain("80 percent");
    expect(out.ungrounded).toContain("70 percent");
    expect(narrationText(out.blocks)).toContain(FIGURE_MARK);
  });

  it("renders a drifted figure WITHOUT emphasis, and keeps the words", () => {
    const out = guarded("The exception records an **80 percent** advance.");
    const line = out.blocks.find((b) => b.kind === "line");
    expect(line?.kind === "line" ? line.spans.some((s) => s.bold) : true).toBe(false);
    expect(narrationText(out.blocks)).toContain("80 percent");
  });

  it("marks a figure the model DERIVED, which is on no read at all", () => {
    const out = guarded("That is **$5.2MM** of lendable value against the construction line.");
    expect(out.ungrounded).toEqual(["$5.2MM"]);
  });

  it("leaves the CARD's own figures exactly as the model wrote them", () => {
    const out = guarded("The approved rate is **75%** against a **65%** guideline.");
    expect(out.ungrounded).toEqual([]);
    expect(narrationText(out.blocks)).not.toContain(FIGURE_MARK);
    const line = out.blocks.find((b) => b.kind === "line");
    expect(line?.kind === "line" ? line.spans.filter((s) => s.bold).map((s) => s.text) : []).toEqual(["75%", "65%"]);
  });

  it("reads two spellings of one figure as one figure", () => {
    // "75 percent" on the card and "75%" in the remark are the same number.
    expect(guarded("The rate is **75 percent**.").ungrounded).toEqual([]);
    // And money magnitudes compare by value, not by spelling.
    const env: BrainEnvelope = { ...envelope, facilities: [{ loanId: "a1", label: "Line of Credit", commitment: "$15.0M" }] };
    expect(guarded("The line stands at **$15,000,000**.", exceptionCard, env).ungrounded).toEqual([]);
  });

  it("does not compare across kinds: a 1.25x is not a 125 percent", () => {
    const out = guarded("Coverage runs at **1.25x**.");
    expect(out.ungrounded).toEqual([]);
  });

  it("holds a line item's clause to the same rule and leaves the room's own value alone", () => {
    const env: BrainEnvelope = {
      ...envelope,
      facilities: [{ loanId: "a1", label: "Line of Credit", commitment: "$15.0M" }],
    };
    const blocks = resolveEntities(
      parseNarration("- **Line of Credit**: it lends **$5.2MM** against the pool."),
      env,
    );
    const out = guardFigures(blocks, env, exceptionCard);
    expect(out.ungrounded).toEqual(["$5.2MM"]);
    const entity = out.blocks.find((b) => b.kind === "entity");
    // The RAIL is the room's own figure, resolved out of the envelope. It is
    // never marked: marking it would be the room marking itself.
    expect(entity?.kind === "entity" ? entity.rows[0].value : "").toBe("$15.0M");
  });

  it("says nothing at all about a remark carrying no figures", () => {
    const out = guarded("The exception stands where the credit committee left it.");
    expect(out.ungrounded).toEqual([]);
    expect(out.blocks.some((b) => b.kind === "mark")).toBe(false);
  });
});
