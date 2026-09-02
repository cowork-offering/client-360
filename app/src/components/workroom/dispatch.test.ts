import { describe, expect, it } from "vitest";
import {
  MAGNITUDE_MULTIPLE,
  clauseCount,
  committedSentence,
  fenceRefusal,
  focusQualifier,
  magnitudeAdvisories,
  dollarFigures,
  provablyClean,
  qualifierFilter,
  readRemove,
  readPartyRemoval,
  readsThePlan,
  singleClause,
  stampRemovalRoles,
  type QualifierMember,
} from "./dispatch";
import type { Book, ElicitMember } from "./elicit";
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

/* =============================================================================
   THE EVERYTHING-PLAN FIX BATCH (founder drive, 2026-09-01).

   Four findings, four layers, and every case below is a line the founder typed
   at the panel. The org facts they are held against are the ones the drive was
   pre-flighted on: Hartwell Industrial Holdings is Guarantor on all six
   eligible loans, and Elena Hartwell is Limited Guarantor on Construction and
   on the $15M line ONLY.
   ============================================================================= */

const CONSTRUCTION = "a4Zbb0000027Mp3EAE";

const HOLDINGS = "Hartwell Industrial Holdings LLC";
const ELENA = "Elena Hartwell";

/** The book, carrying the org facts the drive was pre-flighted on. */
const BOOK: Book = {
  covenants: [
    { id: "a3Bbb00000000L1", type: "Minimum Liquidity", threshold: 5_000_000, frequency: "Quarterly", loanIds: [LOC], accountLevel: false },
    { id: "a3Bbb00000000L2", type: "Leverage", threshold: 3, frequency: "Quarterly", loanIds: [EQUIPMENT], accountLevel: false },
  ],
  assets: [
    /* THE ORG'S OWN DESCRIPTIONS, verbatim off `artifact/live-data.json`. The
       shipped delta is titled with the FIRST SENTENCE of one of these, so a
       fixture with a tidier label tests a title the room never composes. */
    {
      id: "a3Ubb00000001AR",
      label:
        "All present and future accounts receivable. Excludes invoices over 90 days past due, uninsured foreign debtors, intercompany and contra accounts. 20% concentration cap per account debtor.",
      name: "COL-000762",
      kind: "Accounts Receivable",
      value: 9_000_000,
      lien: "1st",
      loanIds: [LOC],
    },
    {
      id: "a3Ubb00000001AS",
      label:
        "Blanket lien on all production machinery and equipment at the Fort Wayne and Kokomo plants, including CNC machining centres, robotic welding cells, heat-treat furnaces and CMM inspection equipment.",
      name: "COL-000764",
      kind: "Equipment",
      value: 6_000_000,
      lien: "1st",
      loanIds: [EQUIPMENT],
    },
  ],
  liens: ["1st"],
  parties: [
    { name: "Hartwell Precision Manufacturing LLC", role: "Borrower", loanId: LOC },
    { name: "Hartwell Precision Manufacturing LLC", role: "Borrower", loanId: EQUIPMENT },
    { name: "Hartwell Precision Manufacturing LLC", role: "Borrower", loanId: CONSTRUCTION },
    { name: HOLDINGS, role: "Guarantor", loanId: LOC },
    { name: HOLDINGS, role: "Guarantor", loanId: EQUIPMENT },
    { name: HOLDINGS, role: "Guarantor", loanId: CONSTRUCTION },
    { name: ELENA, role: "Limited Guarantor", loanId: LOC },
    { name: ELENA, role: "Limited Guarantor", loanId: CONSTRUCTION },
  ],
};

/** THE MEMBERS AS THE ROOM HOLDS THEM, for the scope reader. A removal address
 *  turns on WHICH FACILITY the line names, and that is the reader that says so. */
const SCOPE: ElicitMember[] = [
  { id: LOC, key: "line of credit", label: "$15.0MM Line of Credit", orgName: null, shortName: "Line of Credit - $15,000,000.00", committed: 15_000_000 },
  { id: SEASONAL, key: "line of credit", label: "$2.50MM Line of Credit", orgName: null, shortName: "Line of Credit - $2,500,000.00", committed: 2_500_000 },
  { id: EQUIPMENT, key: "equipment loan", label: "$8.0MM Equipment Loan", orgName: null, shortName: "Equipment - $8,000,000.00", committed: 8_000_000 },
];

const label = (id: string) => MEMBERS.find((m) => m.id === id)?.label ?? id;

const exclusion = (id: string, loanId: string, party: string, role?: string): WorkroomDelta =>
  delta({
    id,
    member: loanId,
    op: "remove",
    title: "Remove a legal entity",
    target: label(loanId),
    before: "carried over from the parent",
    after: "off the modification",
    involvementWire: { op: "remove", role, accountName: party, facilityId: loanId },
  });

/* ------------------------------------------------- E8, the drive's blocker */

describe("the role on a carry exclusion comes from the book (E8)", () => {
  it("corrects Guarantor to Limited Guarantor on the 15M line, and says so", () => {
    // The line that refused the whole plan: her role there is LIMITED
    // Guarantor, the org found no Guarantor row, and nine sound changes died.
    const read = stampRemovalRoles({ deltas: [exclusion("x", LOC, ELENA, "Guarantor")], book: BOOK, label });
    expect(read.deltas).toHaveLength(1);
    expect(read.deltas[0].involvementWire?.role).toBe("Limited Guarantor");
    expect(read.said.join(" ")).toContain("Limited Guarantor");
    expect(read.said.join(" ")).toContain("not Guarantor");
    expect(read.ask).toBeNull();
  });

  it("stamps the role the book holds when the line named none, and says it", () => {
    const read = stampRemovalRoles({ deltas: [exclusion("x", LOC, ELENA)], book: BOOK, label });
    expect(read.deltas[0].involvementWire?.role).toBe("Limited Guarantor");
    expect(read.said[0]).toContain("Elena Hartwell, Limited Guarantor on the");
    expect(read.deltas[0].before).toContain("Limited Guarantor");
  });

  it("asks which row comes off where the book holds two", () => {
    const twoRoles: Book = { ...BOOK, parties: [...BOOK.parties, { name: ELENA, role: "Co-Borrower", loanId: LOC }] };
    const read = stampRemovalRoles({ deltas: [exclusion("x", LOC, ELENA, "Guarantor")], book: twoRoles, label });
    expect(read.deltas).toHaveLength(0);
    expect(read.ask?.text).toContain("Limited Guarantor and Co-Borrower");
    expect(read.ask?.options.map((o) => o.label)).toEqual(["Limited Guarantor", "Co-Borrower"]);
  });

  it("refuses honestly where the party is on the book but not on that facility", () => {
    // Elena is on Construction and the $15M line only. Nothing is staged, and
    // the answer names the facilities she IS on.
    const read = stampRemovalRoles({ deltas: [exclusion("x", EQUIPMENT, ELENA, "Guarantor")], book: BOOK, label });
    expect(read.deltas).toHaveLength(0);
    expect(read.said[0]).toContain("is not on the");
    expect(read.said[0]).toContain("Limited Guarantor");
  });

  it("strips an unverified role rather than refusing where the read carries the name nowhere", () => {
    // The org is the authority on who is on a facility. A thin read must not
    // overrule it — but it must not send a role nothing corroborates either,
    // which is exactly what refused the plan.
    const thin: Book = { ...BOOK, parties: BOOK.parties.filter((p) => p.role === "Borrower") };
    const read = stampRemovalRoles({ deltas: [exclusion("x", LOC, ELENA, "Guarantor")], book: thin, label });
    expect(read.deltas).toHaveLength(1);
    expect(read.deltas[0].involvementWire?.role).toBeUndefined();
    expect(read.said[0]).toContain("does not carry Elena Hartwell");
  });

  it("leaves every other delta exactly as it found it", () => {
    const staged = [commitment("a", LOC, 20_000_000)];
    const read = stampRemovalRoles({ deltas: staged, book: BOOK, label });
    expect(read.deltas).toEqual(staged);
    expect(read.said).toEqual([]);
  });
});

/* ------------------------------------------ E5, "take X off Y" at rung zero */

describe("\"take X off Y\" is routed by what X is, and composed from the book (E5 + E8)", () => {
  const MEM = [
    { id: LOC, key: "Line of Credit", label: "$15.0MM Line of Credit", orgName: null, shortName: "Line of Credit - $15,000,000.00", committed: 15_000_000 },
    { id: SEASONAL, key: "Line of Credit", label: "$2.5MM Line of Credit", orgName: null, shortName: "Line of Credit - $2,500,000.00", committed: 2_500_000 },
    { id: EQUIPMENT, key: "Equipment", label: "$8.0MM Equipment", orgName: null, shortName: "Equipment - $8,000,000.00", committed: 8_000_000 },
    { id: CONSTRUCTION, key: "Construction", label: "Construction", orgName: null, shortName: "Construction - $12,000,000.00", committed: 12_000_000 },
  ];
  const read = (line: string, book: Book = BOOK) => readPartyRemoval({ line, book, members: MEM });

  it("composes the sentence the engine stages on, with the role the BOOK holds", () => {
    // The line that refused the whole plan. The verb moves off the collateral
    // class AND the role comes from the book, so the org gets the row it has.
    expect(read("take Elena Hartwell off the 15M line of credit")).toEqual({
      kind: "rewrite",
      line: "on the Line of Credit - $15,000,000.00 remove the limited guarantor Elena Hartwell",
    });
  });

  it("leaves a collateral line exactly as it is", () => {
    expect(read("take the Fort Wayne equipment off the 8M equipment loan")).toBeNull();
    expect(read("drop the accounts receivable from the 15M line of credit")).toBeNull();
  });

  it("reads the same removal out of \"drop X from Y\" and out of \"remove X from Y\"", () => {
    expect(read("drop Hartwell Industrial Holdings LLC from the construction loan")).toEqual({
      kind: "rewrite",
      line: "on the Construction - $12,000,000.00 remove the guarantor Hartwell Industrial Holdings LLC",
    });
    expect(read("remove Elena Hartwell from the 15M line of credit")).toEqual({
      kind: "rewrite",
      line: "on the Line of Credit - $15,000,000.00 remove the limited guarantor Elena Hartwell",
    });
  });

  it("refuses honestly where the book carries the party, and not on that facility", () => {
    const out = read("take Elena Hartwell off the 8M equipment loan");
    expect(out?.kind).toBe("refusal");
    expect(out?.kind === "refusal" && out.text).toContain("is not on the $8.0MM Equipment today");
    expect(out?.kind === "refusal" && out.text).toContain("Limited Guarantor");
  });

  it("asks which row comes off where the book holds two", () => {
    const twoRoles: Book = { ...BOOK, parties: [...BOOK.parties, { name: ELENA, role: "Co-Borrower", loanId: LOC }] };
    const out = read("take Elena Hartwell off the 15M line of credit", twoRoles);
    expect(out?.kind).toBe("ask");
    expect(out?.kind === "ask" && out.options.map((o) => o.label)).toEqual(["Limited Guarantor", "Co-Borrower"]);
  });

  it("restates the verb and nothing else where the read carries the party nowhere", () => {
    const thin: Book = { ...BOOK, parties: BOOK.parties.filter((p) => p.role === "Borrower") };
    // The org is the authority on who is on a facility; a thin read must not
    // refuse. It also must not invent a role, so the plain restatement goes.
    expect(read("take Hartwell Precision Manufacturing LLC off the 15M line of credit", thin)).toEqual({
      kind: "rewrite",
      line: "on the Line of Credit - $15,000,000.00 remove the borrower Hartwell Precision Manufacturing LLC",
    });
  });

  it("touches nothing that is not a party removal", () => {
    expect(read("increase the 15M line of credit to 20M")).toBeNull();
    expect(read("add a 1% origination fee on the 15M line of credit")).toBeNull();
  });
});

/* ------------------------------------- N3, the dollar qualifier as focus */

describe("a dollar qualifier names the facility and comes out of the line (N3)", () => {
  const read = (line: string, ms = MEMBERS) => focusQualifier(line, ms);

  it("takes the facility off a FEE line, where the engine read it as the fee", () => {
    const out = read("add a 1% origination fee on the 15M line of credit")!;
    expect(out.memberId).toBe(LOC);
    expect(out.line).toBe("add a 1% origination fee");
    expect(out.qualifier).toBe("on the 15M line of credit");
  });

  it("takes it off a POLICY EXCEPTION line and leaves the narrative whole", () => {
    const out = read(
      "log a policy exception on the 15M line of credit for leverage above policy approved by credit committee",
    )!;
    expect(out.memberId).toBe(LOC);
    expect(out.line).toBe("log a policy exception for leverage above policy approved by credit committee");
  });

  it("takes it off a COVENANT line without touching the threshold", () => {
    const out = read("add a debt service coverage covenant of 1.25x on the 8M equipment loan")!;
    expect(out.memberId).toBe(EQUIPMENT);
    expect(out.line).toBe("add a debt service coverage covenant of 1.25x");
  });

  it("takes it off a COLLATERAL line and off a PARTY line", () => {
    expect(read("pledge the Fort Wayne equipment on the 2.5M line of credit")?.line).toBe(
      "pledge the Fort Wayne equipment",
    );
    expect(read("add Elena Hartwell as a limited guarantor on the 8M equipment loan")?.line).toBe(
      "add Elena Hartwell as a limited guarantor",
    );
  });

  it("leaves a COMMITMENT line to the post-parse filter, which already works on it", () => {
    expect(read("take the 2.5M line of credit to 4M")).toBeNull();
    expect(read("increase the 15M line of credit to 20M")).toBeNull();
  });

  it("does NOT focus where the figure names two facilities", () => {
    const twins: QualifierMember[] = [
      { id: LOC, label: "Line of Credit", committed: 5_000_000 },
      { id: EQUIPMENT, label: "Equipment", committed: 5_000_000 },
    ];
    expect(read("add a 1% origination fee on the 5M line of credit", twins)).toBeNull();
  });

  it("does NOT strip a figure that is the change's own value", () => {
    // No preposition and no facility noun: the figure is the fee, not a name.
    expect(read("add an origination fee of $15,000,000")).toBeNull();
    expect(read("add a $15,000,000 origination fee")).toBeNull();
  });

  it("does NOT touch a line naming two facilities in two clauses", () => {
    expect(
      read("add a 1% origination fee on the 15M line of credit and a covenant on the 8M equipment loan"),
    ).toBeNull();
  });

  it("does NOT fire where the line carries no figure the package answers to", () => {
    expect(read("add a 1% origination fee on the 9M line of credit")).toBeNull();
    expect(read("add a 1% origination fee")).toBeNull();
  });
});

/* ------------------------------------------------ E1, the destructive one */

describe("a remove is routed, and it un-stages nothing it was not told to (E1)", () => {
  const stagedCovenant = delta({
    id: "covenant.add:eq:0",
    member: EQUIPMENT,
    group: "covenants",
    kind: "Add Covenant",
    title: "New covenant",
    target: "Equipment Loan",
    before: "not on the facility today",
    after: "Debt Service Coverage of Borrower >= 1.30",
  });

  it("does NOT un-stage the banker's own covenant on another facility", () => {
    // The destructive case, verbatim from the drive: this line matched the bare
    // word "covenant" and took a DIFFERENT covenant off a DIFFERENT facility.
    const read = readRemove("remove the Minimum Liquidity covenant from the 15M line of credit", [stagedCovenant], BOOK, SCOPE);
    expect(read).toEqual({ kind: "fence", scope: "covenant", name: "Minimum Liquidity" });
  });

  it("refuses a book covenant by name, with the route that exists", () => {
    const fence = fenceRefusal("covenant", "Minimum Liquidity");
    expect(fence.title).toBe("Detach Minimum Liquidity");
    expect(fence.why).toContain("Minimum Liquidity");
    expect(fence.why).toContain("covenant compliance update");
    expect(fence.why).toContain("Nothing has been staged");
    expect(fence.reason).toContain("no updateable field");
  });

  it("still un-stages a manifest entry the line names by title AND target", () => {
    const read = readRemove("drop the new covenant on the Equipment Loan", [stagedCovenant], BOOK, SCOPE);
    expect(read).toEqual({ kind: "manifest", entry: stagedCovenant });
  });

  it("refuses a book pledge as a delete rather than un-staging anything", () => {
    const read = readRemove("remove the accounts receivable pledge from the 15M line of credit", [stagedCovenant], BOOK, SCOPE);
    expect(read?.kind).toBe("fence");
    expect(read?.kind === "fence" && read.scope).toBe("pledge");
    const fence = fenceRefusal("pledge", "Accounts receivable, present and future");
    expect(fence.why).toContain("COLLATERAL release");
    expect(fence.why).toContain("Nothing has been staged");
  });

  it("leaves a party removal to the parser, where it files as a carry exclusion", () => {
    expect(readRemove("remove Elena Hartwell from the 15M line of credit", [stagedCovenant], BOOK, SCOPE)).toBeNull();
  });

  /* ------------------------------------------- N1 and P4, the pledge fence

     THE ORG'S OWN COVENANT CATALOG CARRIES A TEST CALLED "Accounts Receivable"
     (a3Bbb000000S0bNEAS on this relationship, 80, monthly) beside an asset
     described as accounts receivable. That collision is what put the covenant
     refusal on a collateral line in the drive: both resolved and the covenant
     won on order alone. */
  const AR_BOOK: Book = {
    ...BOOK,
    covenants: [
      ...BOOK.covenants,
      { id: "a3Bbb000000S0bN", type: "Accounts Receivable", threshold: 80, frequency: "Monthly", loanIds: [LOC], accountLevel: false },
    ],
  };

  it("reads a pledge line as COLLATERAL even where a covenant type carries the same words (N1)", () => {
    const read = readRemove("remove the accounts receivable pledge from the 15M line of credit", [stagedCovenant], AR_BOOK, SCOPE);
    expect(read?.kind).toBe("fence");
    expect(read?.kind === "fence" && read.scope).toBe("pledge");
  });

  it("still reads the covenant line as a covenant, on the same book", () => {
    const read = readRemove("remove the accounts receivable covenant from the 15M line of credit", [stagedCovenant], AR_BOOK, SCOPE);
    expect(read).toEqual({ kind: "fence", scope: "covenant", name: "Accounts Receivable" });
  });

  /* ONE FACILITY, TWO EXCLUSIONS, ONE NAME. Once the arms let a removal be
     STAGED, the same collision lands on the manifest: a covenant carry exclusion
     titled "Accounts Receivable" beside a pledge carry exclusion of the asset
     described as accounts receivable. The line's noun tells them apart there too. */
  const stagedCovenantExclusion = delta({
    id: "covenant.exclude:loc:a3Bbb000000S0bN",
    member: LOC,
    group: "covenants",
    kind: "Covenant carry exclusion",
    title: "Accounts Receivable",
    target: "$15.0MM Line of Credit",
    before: "on the booked facility, and carried onto the clone today",
    after: "not carried onto the new version",
  });
  /* THE TITLE THE ROOM ACTUALLY STAGES: `pledgeExclusionDelta` titles the entry
     with the FIRST SENTENCE of the org's own description, so the fixture is that
     sentence and not a tidier paraphrase of it. */
  const stagedPledgeExclusion = delta({
    id: "collateral.exclude:loc:a35bb0000013xz3AAA",
    member: LOC,
    group: "security",
    kind: "Pledge carry exclusion",
    title: "All present and future accounts receivable",
    target: "$15.0MM Line of Credit",
    before: "pledged to the booked facility, and carried onto the clone today",
    after: "not carried onto the new version",
  });
  const bothStaged = [stagedCovenantExclusion, stagedPledgeExclusion];

  /** Hartwell's real book carries no Leverage covenant anywhere. */
  const BOOK_WITHOUT_LEVERAGE: Book = { ...BOOK, covenants: BOOK.covenants.filter((c) => c.type !== "Leverage") };

  it("un-stages the COVENANT exclusion on a covenant line, with both on the manifest", () => {
    const read = readRemove("remove the accounts receivable covenant from the 15M line of credit", bothStaged, AR_BOOK, SCOPE);
    expect(read).toEqual({ kind: "manifest", entry: stagedCovenantExclusion });
  });

  it("un-stages the PLEDGE exclusion on a pledge line, with both on the manifest", () => {
    const read = readRemove("remove the accounts receivable pledge from the 15M line of credit", bothStaged, AR_BOOK, SCOPE);
    expect(read).toEqual({ kind: "manifest", entry: stagedPledgeExclusion });
  });

  it("never un-stages a covenant entry over a collateral line, whatever it is titled", () => {
    const read = readRemove("remove the accounts receivable pledge from the 15M line of credit", [stagedCovenantExclusion], AR_BOOK, SCOPE);
    expect(read?.kind).toBe("fence");
    expect(read?.kind === "fence" && read.scope).toBe("pledge");
  });

  /* THE DRIVE FOUND E1 AGAIN, through the category word (2026-09-02). A line
     naming a covenant the book does NOT carry resolved nothing on the book side,
     and then the bare word "covenant" matched the KIND of a staged covenant
     exclusion while "line of credit" matched its target. The banker's own entry
     came off the manifest in silence, which is E1 exactly. */
  it("never un-stages an entry over the CATEGORY word alone", () => {
    // Leverage IS on this book, on the EQUIPMENT loan. The line names the $2.5M
    // line, which does not carry it, so nothing on the manifest is addressed and
    // the book answers instead.
    const read = readRemove("remove the leverage covenant from the 2.5M line of credit", bothStaged, AR_BOOK, SCOPE);
    expect(read).not.toMatchObject({ kind: "manifest" });
    expect(read).toEqual({ kind: "fence", scope: "covenant", name: "Leverage" });
  });

  /* ============ E1, THIRD TIME: THE TARGET SIDE WAS PROSE (2026-09-02)

     `names(line, entryWords(`${e.target} ${e.after}`))` matched the target side
     on the words of the entry's `after`, and every carry exclusion's `after` is
     "not carried onto the new version". So "the" satisfied the target side of
     the address and, once the title side had a truncated title with "the"
     inside it, both sides. Three lines from the drive, each of which un-staged
     an entry on a DIFFERENT facility from the one it named. The address is the
     facility identity now, so all three reach the book, which says where the
     thing they name actually lives.                                          */

  it("refuses a book-carried COVENANT named against a facility that does not carry it", () => {
    const read = readRemove("remove the accounts receivable covenant from the 2.5M line of credit", bothStaged, AR_BOOK, SCOPE);
    // NOT the $15M entry, which is what came off the manifest in the drive.
    expect(read).not.toMatchObject({ kind: "manifest" });
    expect(read).toEqual({ kind: "fence", scope: "covenant", name: "Accounts Receivable" });
  });

  it("refuses a book-carried PLEDGE named against a facility that does not carry it", () => {
    const read = readRemove("remove the accounts receivable pledge from the 2.5M line of credit", bothStaged, AR_BOOK, SCOPE);
    expect(read).not.toMatchObject({ kind: "manifest" });
    // Collateral words, never the covenant's: the asset still resolves, so the
    // arm layer can answer with the facility it IS pledged to.
    expect(read).toEqual({ kind: "fence", scope: "pledge", name: AR_BOOK.assets[0].label });
  });

  it("leaves a STAGED COMMITMENT CHANGE alone when the line names another facility", () => {
    const staged = commitment("amount:loc", LOC, 20_000_000);
    expect(readRemove("drop the commitment on the 2.5M line of credit", [staged], AR_BOOK, SCOPE)).not.toMatchObject({
      kind: "manifest",
    });
    // And the same line, naming the facility it IS on, still un-stages it.
    expect(readRemove("drop the commitment on the 15M line of credit", [staged], AR_BOOK, SCOPE)).toEqual({
      kind: "manifest",
      entry: staged,
    });
  });

  it("never un-stages a pledge exclusion over the word THE, whatever else the line says", () => {
    // The third drive line: an equipment removal on the equipment loan took a
    // pledge off the $15M line, because "the" was in both.
    const read = readRemove("remove the equipment pledge from the 8M equipment loan", bothStaged, AR_BOOK, SCOPE);
    expect(read).not.toMatchObject({ kind: "manifest" });
  });

  /* ================= ONE DISTINCTIVE WORD, AMONG ONE FACILITY'S PLEDGES

     "remove the inventory pledge from the 15M line of credit" resolved nothing
     and fell through to the pre-arm handoff card, while the same line with
     "fort wayne" in front of it staged a real exclusion. Both name the same
     row: on a named facility, a word that is unique among ITS pledges settles
     it.                                                                       */

  const INVENTORY_BOOK: Book = {
    ...AR_BOOK,
    assets: [
      ...AR_BOOK.assets,
      {
        id: "a35bb0000013y0fAAA",
        label:
          "All present and future inventory at the Fort Wayne and Kokomo plants: raw bar and plate stock, work in process and finished goods. Excludes consigned material and stock over 12 months old.",
        name: "COL-000763",
        kind: "Inventory",
        value: 8_000_000,
        lien: "1st",
        loanIds: [LOC],
      },
    ],
  };

  it("settles a single distinctive word against the pledges of the facility named", () => {
    const read = readRemove("remove the inventory pledge from the 15M line of credit", [], INVENTORY_BOOK, SCOPE);
    expect(read).toEqual({ kind: "fence", scope: "pledge", name: INVENTORY_BOOK.assets[2].label });
  });

  it("reads the longer phrasing of the same line as the same pledge", () => {
    const read = readRemove("remove the fort wayne inventory pledge from the 15M line of credit", [], INVENTORY_BOOK, SCOPE);
    expect(read).toEqual({ kind: "fence", scope: "pledge", name: INVENTORY_BOOK.assets[2].label });
  });

  it("asks with that facility's own pledges rather than falling through to the handoff", () => {
    const read = readRemove("remove the pledge from the 15M line of credit", [], INVENTORY_BOOK, SCOPE);
    expect(read?.kind).toBe("ask");
    if (read?.kind !== "ask") throw new Error("expected an ask");
    expect(read.options.map((o) => o.label)).toEqual([
      "All present and future accounts receivable",
      "All present and future inventory at the Fort Wayne and Kokomo p…",
    ]);
    expect(read.options[1].say).toContain("COL-000763");
  });

  /* ============ A COVENANT THE BOOK DOES NOT CARRY IS ANSWERED FROM THE BOOK

     It used to fall through to the desk, which holds nothing this question
     needs. The room is holding the covenants read.                           */

  it("answers a covenant the relationship does not hold at all, from the book", () => {
    const read = readRemove("remove the leverage covenant from the 15M line of credit", [], BOOK_WITHOUT_LEVERAGE, SCOPE);
    expect(read?.kind).toBe("gap");
    if (read?.kind !== "gap") throw new Error("expected a gap");
    expect(read.text).toContain("This relationship carries no Leverage covenant");
    expect(read.text).toContain("The $15.0MM Line of Credit carries Minimum Liquidity");
    expect(read.text).toContain("Nothing has been staged");
  });

  it("still un-stages on the entry's own TITLE, said again", () => {
    const read = readRemove("remove the accounts receivable covenant from the 15M line of credit", bothStaged, AR_BOOK, SCOPE);
    expect(read).toEqual({ kind: "manifest", entry: stagedCovenantExclusion });
  });

  it("speaks collateral on a pledge and covenant on a covenant, and the two are not the same refusal (P4)", () => {
    const pledge = fenceRefusal("pledge", "Accounts receivable, present and future");
    const covenant = fenceRefusal("covenant", "Minimum Liquidity");

    // The collateral fence, in the collateral's own words.
    expect(pledge.why).toContain("COLLATERAL release");
    expect(pledge.why).toContain("never deleted on the booked loan");
    expect(pledge.why).toContain("CARRY EXCLUSION");
    // AND THE ARM IS DEPLOYED. The copy said it was "being built on the org
    // side" until 2026-09-02; saying that now would be the room understating
    // what it can do rather than overstating it, which is the same defect.
    expect(pledge.why).not.toMatch(/being built|not deployed/i);
    expect(pledge.why).toContain("Run it as a modification");
    // And NEVER the covenant's.
    expect(pledge.why).not.toMatch(/loan-covenant junction/i);
    expect(pledge.why).not.toMatch(/covenant DETACH/i);
    expect(pledge.title).not.toMatch(/detach/i);

    // The covenant fence keeps its own constraint and does not borrow the
    // collateral one. It names the covenant CARRY EXCLUSION since the arm
    // deployed (2026-09-02) and, with it, the route that carries it: this
    // refusal is only ever reached on a renewal or a new facility now.
    expect(covenant.why).toContain("loan-covenant junction");
    expect(covenant.why).toContain("covenant CARRY EXCLUSION");
    expect(covenant.why).toContain("Run it as a modification");
    expect(covenant.why).not.toMatch(/pledge/i);
    expect(covenant.title).toBe("Detach Minimum Liquidity");
  });

  it("titles the refusal with the asset rather than with the whole credit-agreement paragraph", () => {
    const fence = fenceRefusal(
      "pledge",
      "All present and future accounts receivable. Excludes invoices over 90 days past due, uninsured foreign debtors, intercompany and contra accounts. 20% concentration cap per account debtor.",
    );
    expect(fence.title).toBe("Release All present and future accounts receivable");
    expect(fence.why).not.toContain("concentration cap");
  });

  it("names both rather than choosing where two staged entries fit", () => {
    const second = { ...stagedCovenant, id: "covenant.add:eq:1", after: "Leverage <= 3.00" };
    const read = readRemove("drop the new covenant on the Equipment Loan", [stagedCovenant, second], BOOK, SCOPE);
    expect(read?.kind).toBe("ambiguous");
  });
});

/* ------------------------------------------------- E4c, figure integrity */

describe("the committed total moves only on a commitment change (E4c)", () => {
  const reply = (sentence: string) => `Legal entity on Construction: staged on the clone. ${sentence} What else should change?`;

  it("holds the total on an involvement add, whatever else is staged", () => {
    // The drive: "That takes the package from $49M to $54M" after a legal-entity
    // add, because a $5M commitment change was already on the manifest.
    const said = committedSentence({
      reply: reply("That takes the package from $49M to $54M."),
      delta: exclusion("x", CONSTRUCTION, HOLDINGS),
      before: 54_000_000,
    });
    expect(said).toContain("The package total holds at $54M.");
    expect(said).not.toContain("from $49M to $54M");
  });

  it("holds it on a covenant, a pledge, a fee and an exception add too", () => {
    for (const d of [
      delta({ id: "c", group: "covenants", title: "New covenant" }),
      delta({ id: "p", group: "security", title: "Collateral pledge" }),
      delta({ id: "f", group: "terms", title: "Facility fee" }),
      delta({ id: "x", group: "terms", title: "Policy exception" }),
    ]) {
      const said = committedSentence({ reply: reply("That takes the package from $49M to $54M."), delta: d, before: 49_000_000 });
      expect(said).toContain("The package total holds at $49M.");
    }
  });

  it("moves it, from the shell's own figures, on a commitment change", () => {
    const said = committedSentence({
      reply: reply("The package total holds at $49M."),
      delta: { ...commitment("a", LOC, 20_000_000), committedDeltaMM: 5 },
      before: 49_000_000,
    });
    expect(said).toContain("That takes the package from $49M to $54M.");
  });

  it("leaves a reply that carries no package sentence alone", () => {
    expect(committedSentence({ reply: "Staged on the clone.", delta: delta({ id: "a" }), before: 49_000_000 })).toBe(
      "Staged on the clone.",
    );
  });
});

describe("the plan is read back locally", () => {
  it("takes the founder's own ceremony line", () => {
    // Step 14 of the everything-plan script. The rail's own phrase list does not
    // carry it, so it went to the desk and came back as a round trip the room
    // did not need.
    expect(readsThePlan("what is on the plan")).toBe(true);
    expect(readsThePlan("what's on the plan?")).toBe(true);
    expect(readsThePlan("read the plan back to me")).toBe(true);
  });

  it("is not a line that CHANGES the plan", () => {
    expect(readsThePlan("add a covenant to the plan")).toBe(false);
    expect(readsThePlan("increase the 15M line of credit to 20M")).toBe(false);
  });
});
