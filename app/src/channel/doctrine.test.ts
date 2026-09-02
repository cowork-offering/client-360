import { describe, expect, it } from "vitest";
import {
  ALWAYS_BLOCK_IDS,
  alwaysBlockIds,
  DOCTRINE_BLOCKS,
  DOCTRINE_BUDGET_BYTES,
  DOCTRINE_DROP_ORDER,
  NEVER_INVENT_AN_INDEX,
  NEVER_SET_A_THRESHOLD,
  budgetPrompt,
  composeDoctrine,
} from "./doctrine";
import type { BrainEnvelope } from "./brainLane";

/* =============================================================================
   THE DOCTRINE, SLICED AND BUDGETED.

   Two failures this suite exists to make impossible. First, a line that travels
   WITHOUT the rules whose absence makes an answer wrong (the model then answers
   ungrounded and sounds confident doing it). Second, a prompt that gives up the
   READ BLOCKS to fit, which turns a room that knows the deal into one that
   reports silence as a fact.
   ============================================================================= */

const envelope: BrainEnvelope = {
  v: 2,
  line: "which covenant has the least cushion",
  room: "facility",
  relationship: "Hartwell Precision Manufacturing LLC",
  route: "modify",
  packageName: "Hartwell Industrial C&I Credit Package",
  productPackageId: "a5Fbb000000IHFJEA4",
  selectedFacility: null,
  facilities: [{ loanId: "a4Zbb0000027MaYEAU", label: "Line of Credit", commitment: "$15.0M" }],
  staged: [],
  grounding: "plugin-skill:workroom-brain",
};

describe("the always blocks travel on every line", () => {
  const lines = [
    "anything at all",
    "who guarantees the construction loan",
    "take the line to $20M",
    "hello",
  ];

  it("carries identity, the shapes, the hard rules, the fences and the ladder", () => {
    for (const line of lines) {
      const { included } = composeDoctrine(line);
      expect(included).toEqual(expect.arrayContaining(ALWAYS_BLOCK_IDS));
    }
    expect(ALWAYS_BLOCK_IDS).toEqual(["identity", "shapes", "wire", "hard-rules", "files-vs-fenced", "ladder"]);
  });

  it("carries the two rules a paraphrase would soften, verbatim", () => {
    for (const line of lines) {
      const text = composeDoctrine(line).lines.join("\n");
      expect(text).toContain(NEVER_SET_A_THRESHOLD);
      expect(text).toContain(NEVER_INVENT_AN_INDEX);
    }
  });

  it("states the ladder rule the founder's constraint turns on", () => {
    const text = composeDoctrine("anything at all").lines.join("\n");
    expect(text).toContain("Answer from the envelope; a tool call costs 30 to 90 seconds");
    expect(text).toMatch(/Do NOT call a tool for anything already here/);
  });

  it("names the fence and the route beside it, never a bare refusal", () => {
    const text = composeDoctrine("anything at all").lines.join("\n");
    expect(text).toMatch(/Fenced, deliberately/);
    expect(text).toMatch(/A fence is not a gap/);
  });
});

describe("a narration carries the doctrine but never a shape it could emit", () => {
  it("drops the shape contract and the wire schema", () => {
    const { included } = composeDoctrine("add a DSCR covenant", { mode: "narrate" });
    expect(included).not.toContain("shapes");
    expect(included).not.toContain("wire");
    expect(included).toEqual(expect.arrayContaining(["identity", "hard-rules", "files-vs-fenced", "ladder"]));
  });

  it("still carries the surface the line is about", () => {
    const { included } = composeDoctrine("pledge the Kokomo plant", { mode: "narrate" });
    expect(included).toContain("collateral-chain");
  });
});

describe("a line carries the surfaces it is about, and no others", () => {
  it("gives a covenant line the two levels and the families", () => {
    const { included } = composeDoctrine("add a DSCR covenant of 1.25x on the equipment loan");
    expect(included).toContain("covenant-levels");
    expect(included).toContain("covenant-families");
    expect(included).not.toContain("fees");
    expect(included).not.toContain("involvement-roles");
  });

  it("gives a party line the roles", () => {
    const { included } = composeDoctrine("who guarantees the construction loan");
    expect(included).toContain("involvement-roles");
    expect(included).not.toContain("fees");
  });

  it("gives a pledge line the collateral chain", () => {
    const { included } = composeDoctrine("pledge the warehouse to the equipment loan");
    expect(included).toContain("collateral-chain");
  });

  it("gives a fee line the fee shapes", () => {
    const { included } = composeDoctrine("add a 0.5% origination fee");
    expect(included).toContain("fees");
  });

  it("gives an exception line the egress warning", () => {
    const { included } = composeDoctrine("log a policy exception for the advance rate");
    expect(included).toContain("policy-exceptions");
    expect(composeDoctrine("log a policy exception for the advance rate").lines.join("\n")).toMatch(
      /the borrower's data leaves the org/,
    );
  });

  it("gives a modification line the version, clone and carry model", () => {
    const { included } = composeDoctrine("take the line to $20M on this modification");
    expect(included).toContain("version-carry");
    expect(composeDoctrine("exclude Minimum Liquidity from the clone").lines.join("\n")).toMatch(
      /A remove is a CARRY EXCLUSION/,
    );
  });

  it("gives a cushion line the sign rule and the four states", () => {
    const text = composeDoctrine("which covenant has the least cushion").lines.join("\n");
    expect(text).toMatch(/Getting the sign backwards is a named failure mode/);
    expect(text).toMatch(/10 percent is the standard watch band/);
  });

  it("gives a pricing line the conventions and no derived index", () => {
    const { included } = composeDoctrine("what is the spread on the revolver");
    expect(included).toContain("pricing");
  });
});

describe("the budget gives up doctrine, and never the always blocks", () => {
  it("fits every block firing at once inside the default budget", () => {
    // The widest line this room can be asked: every surface matches at once.
    const wide =
      "on this modification, add a DSCR covenant, pledge the equipment, add a fee, log a policy exception, change the guarantor and reprice it";
    const { dropped, bytes } = composeDoctrine(wide);
    expect(dropped).toEqual([]);
    expect(bytes).toBeLessThanOrEqual(DOCTRINE_BUDGET_BYTES);
  });

  it("keeps the always blocks even at a budget of zero", () => {
    const { included, dropped } = composeDoctrine(
      "add a DSCR covenant and pledge the warehouse and add a fee",
      { budget: 0 },
    );
    expect(included).toEqual(ALWAYS_BLOCK_IDS);
    expect(dropped).toEqual(expect.arrayContaining(["covenant-levels", "collateral-chain", "fees"]));
  });

  it("gives up policy guidance before the org's own structure", () => {
    const wide = "increase the line and add a DSCR covenant";
    const full = composeDoctrine(wide);
    // A budget one byte under the full selection sheds exactly the first entry
    // of the drop order that is present, and nothing else.
    const tight = composeDoctrine(wide, { budget: full.bytes - 1 });
    expect(tight.dropped).toEqual(["credit-policy"]);
    expect(tight.included).toContain("covenant-levels");
  });

  it("names the pack section every block is sliced from", () => {
    // The provenance is IN the data, not in a comment beside it: a block whose
    // source nobody can name is a rule nobody can check against the pack.
    for (const block of DOCTRINE_BLOCKS) {
      expect(block.source.length).toBeGreaterThan(0);
      expect(block.lines.length).toBeGreaterThan(0);
    }
  });

  it("names what it gave up rather than trimming in silence", () => {
    const { dropped } = composeDoctrine("add a fee to the line", { budget: 0 });
    expect(dropped.length).toBeGreaterThan(0);
    for (const id of dropped) expect(DOCTRINE_BLOCKS.map((b) => b.id)).toContain(id);
  });
});

describe("the prompt budget drops thread history first and the read blocks never", () => {
  const reads = {
    covenants: [
      { name: "Debt Service Coverage", threshold: ">= 1.25x", measured: "1.41x", status: "Compliant", scope: "across the relationship" },
    ],
    notCarried: ["spread"],
  };

  it("keeps everything when the whole prompt fits", () => {
    const out = budgetPrompt({ envelope: { ...envelope, reads, thread: [{ who: "banker", text: "hello" }] } });
    expect(out.envelope.omitted).toBeUndefined();
    expect(out.doctrine.dropped).toEqual([]);
    expect(out.envelope.thread).toHaveLength(1);
    expect(out.envelope.reads).toBeDefined();
  });

  it("gives up the oldest turns before it gives up a single doctrine block", () => {
    const thread = Array.from({ length: 40 }, (_, i) => ({
      who: (i % 2 ? "agent" : "banker") as "agent" | "banker",
      text: `turn ${i} `.padEnd(600, "x"),
    }));
    const out = budgetPrompt({ envelope: { ...envelope, reads, thread }, cap: 12_000 });
    expect(out.envelope.omitted).toContain("earlier conversation");
    expect((out.envelope.thread ?? []).length).toBeLessThan(thread.length);
    // The reads are untouched: that is the whole rule.
    expect(out.envelope.reads).toEqual(reads);
  });

  it("gives up doctrine, never the read blocks, when the envelope alone is large", () => {
    const fat = {
      ...envelope,
      reads: {
        ...reads,
        collateral: Array.from({ length: 60 }, (_, i) => ({
          asset: `Asset ${i} `.padEnd(200, "y"),
          scope: "Line of Credit",
        })),
      },
    };
    const out = budgetPrompt({ envelope: fat, cap: 6_000 });
    expect(out.envelope.reads).toEqual(fat.reads);
    expect(out.doctrine.included).toEqual(expect.arrayContaining(ALWAYS_BLOCK_IDS));
  });
});


/* =============================================================================
   THE TWO SLICES A LINE CANNOT ASK FOR.

   The greeting composes its doctrine off an EMPTY line, so a block gated on a
   word in the line is unreachable there however true it is. `include` is how
   the ENVELOPE says what the LINE cannot, and both blocks are out of the drop
   order because the block governing the one call that carries consent must be
   undroppable.
   ============================================================================= */

describe("the caller can force a slice the line would never match", () => {
  it("selects a block that neither always nor match would have selected", () => {
    const line = "take the line to $20M";
    expect(composeDoctrine(line, { mode: "narrate" }).included).not.toContain("mail");
    expect(composeDoctrine(line, { mode: "narrate", include: ["mail"] }).included).toContain("mail");
    expect(composeDoctrine("", { mode: "narrate", include: ["route-open"] }).included).toContain("route-open");
  });

  it("carries what each one is FOR: any mail, attributed, and never a figure", () => {
    const mail = composeDoctrine("", { mode: "narrate", include: ["mail"] }).lines.join("\n");
    expect(mail).toMatch(/Do not assume it is an increase/);
    expect(mail).toMatch(/IT IS A REQUEST, NEVER A READ/);
    expect(mail).toMatch(/NEVER infer a person from a company name/);
    expect(mail).toMatch(/MENTION IT AND STOP/);

    const route = composeDoctrine("", { mode: "narrate", include: ["route-open"] }).lines.join("\n");
    expect(route).toMatch(/NEVER say which facility moves, never say what changes follow/);
    expect(route).toMatch(/never invents a fourth/);
  });

  it("cannot be dropped by the budget, at any budget", () => {
    for (const id of ["mail", "route-open"]) {
      expect([...DOCTRINE_DROP_ORDER]).not.toContain(id);
      const tiny = composeDoctrine("", { mode: "narrate", include: [id], budget: 1 });
      expect(tiny.included).toContain(id);
      expect(tiny.dropped).not.toContain(id);
    }
  });

  it("is a no-op for an id nobody declared", () => {
    const plain = composeDoctrine("", { mode: "narrate" });
    expect(composeDoctrine("", { mode: "narrate", include: ["not-a-block"] }).lines).toEqual(plain.lines);
  });
});

describe("the figure rules travel on every remark (2026-09-02)", () => {
  it("is always-on in narrate mode and never dropped by the budget", () => {
    const { included, dropped } = composeDoctrine("anything at all", { mode: "narrate", budget: 0 });
    expect(included).toContain("figures");
    expect(dropped).not.toContain("figures");
    expect(alwaysBlockIds("narrate")).toContain("figures");
  });

  it("stays off the reply mode, which carries the same rule in hard-rules", () => {
    expect(composeDoctrine("anything at all", { mode: "reply" }).included).not.toContain("figures");
    expect(alwaysBlockIds("reply")).not.toContain("figures");
  });

  it("says the two things the drive proved a remark will otherwise do", () => {
    const text = composeDoctrine("", { mode: "narrate" }).lines.join("\n");
    expect(text).toContain("Every figure you write must already appear in THE CARD ON THE GLASS or in CONTEXT.reads");
    expect(text).toContain("NEVER DERIVE ONE");
    expect(text).toContain("An advance rate is not a lendable value");
  });
});
