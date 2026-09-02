import { describe, expect, it, vi } from "vitest";
import { BRAIN_TOOL_NAMES, READ_DOORS, assertReadDoor, buildBrainTools, type BrainToolCall } from "./brainTools";
import { SERVERS, TOOLS } from "./mcp";

/* =============================================================================
   THE TWO CALL-OUTS, HELD TO THE WRITE FENCE.

   This suite exists for one assertion above all others: no path from a model
   reply reaches a door that writes. Everything else here is about keeping the
   list short and the results small, because every extra tool and every extra
   byte is another paid round on the banker's own account.
   ============================================================================= */

const ANCHOR = { accountId: "001bb00001I7NZkAAN", company: "Hartwell Precision Manufacturing LLC" };
const ctx = { signal: new AbortController().signal };

const graphPayload = {
  content: [
    {
      isSuccess: true,
      outputValues: {
        legalEntities: [
          { accountName: "Hartwell Precision Manufacturing LLC", borrowerType: "Borrower", loanId: null, ownershipPercent: 100 },
          { accountName: "Hartwell Industrial Holdings LLC", borrowerType: "Guarantor", loanId: "a4Zbb0000027MaYEAU" },
        ],
      },
    },
  ],
};

const stub = (payload: unknown): BrainToolCall => vi.fn(async () => ({ payload }));

describe("the list is exactly two, each narrow", () => {
  it("builds those two tools and no others", () => {
    const tools = buildBrainTools({ anchor: ANCHOR, call: stub({}) });
    expect(tools.map((t) => t.name)).toEqual([...BRAIN_TOOL_NAMES]);
  });

  it("takes no argument, so a tool cannot be pointed at another borrower", () => {
    for (const tool of buildBrainTools({ anchor: ANCHOR, call: stub({}) })) {
      expect(tool.inputSchema).toBeUndefined();
    }
  });

  it("names the cheaper source in every description, because models over-call", () => {
    for (const tool of buildBrainTools({ anchor: ANCHOR, call: stub({}) })) {
      expect(tool.description).toMatch(/ONLY/);
      expect(tool.description).toMatch(/context/i);
      expect(tool.description.length).toBeLessThanOrEqual(1024);
      expect(tool.description).not.toMatch(/[—–]/);
    }
  });
});

describe("the write fence is absolute", () => {
  it("allows exactly the two read doors", () => {
    expect([...READ_DOORS].sort()).toEqual([TOOLS.boomRatios, TOOLS.graph].sort());
  });

  it("admits no stage or execute door to the allow-list", () => {
    for (const door of READ_DOORS) {
      expect(door).not.toMatch(/^stage_/);
      expect(door).not.toMatch(/^execute_/);
    }
    // And every write tool the connector layer knows about is outside it.
    const writers = Object.values(TOOLS).filter((t) => /^(stage|execute)_/.test(t));
    expect(writers.length).toBeGreaterThan(0);
    for (const w of writers) expect(READ_DOORS.has(w)).toBe(false);
  });

  it("refuses a write door before the connector is touched at all", () => {
    expect(() => assertReadDoor(TOOLS.stageLoanModification)).toThrow(/not a read door/);
    expect(() => assertReadDoor(TOOLS.executeLoanModification)).toThrow(/not a read door/);
    expect(() => assertReadDoor(TOOLS.stageNewFacility)).toThrow(/not a read door/);
    expect(() => assertReadDoor(TOOLS.boomRatios)).not.toThrow();
    expect(() => assertReadDoor(TOOLS.graph)).not.toThrow();
  });

  it("never names anything but a read door, on either tool", async () => {
    const call = vi.fn(async () => ({ payload: graphPayload }));
    for (const tool of buildBrainTools({ anchor: ANCHOR, call })) {
      await Promise.resolve(tool.execute({}, ctx)).catch(() => null);
    }
    for (const [, door] of call.mock.calls as unknown as Array<[string, string]>) {
      expect(READ_DOORS.has(door)).toBe(true);
    }
  });

  it("calls every door as a READ", async () => {
    const call = vi.fn(async () => ({ payload: graphPayload }));
    const tools = buildBrainTools({ anchor: ANCHOR, call });
    for (const tool of tools) await tool.execute({}, ctx);
    for (const args of call.mock.calls as unknown as Array<[string, string, unknown, { read: boolean }]>) {
      expect(args[3].read).toBe(true);
    }
  });
});

describe("currentBoomRatios", () => {
  it("reads the gateway ratios door for the bound company", async () => {
    const call = stub({ ratios: { totalLeverage: 2.8, interestCoverage: 6.1, ebitda: 9_400_000 } });
    const [boom] = buildBrainTools({ anchor: ANCHOR, call });
    const out = await boom.execute({}, ctx);
    expect(call).toHaveBeenCalledWith(SERVERS.gateway, TOOLS.boomRatios, { company: ANCHOR.company }, expect.anything());
    expect(out).toEqual({ totalLeverage: 2.8, interestCoverage: 6.1, ebitda: 9_400_000 });
  });

  it("says the door carried no figures rather than returning an empty fact", async () => {
    const [boom] = buildBrainTools({ anchor: ANCHOR, call: stub({ ratios: {} }) });
    expect(await boom.execute({}, ctx)).toMatch(/no ratio figures/);
  });

  it("refuses without a bound company rather than reading somebody else's book", async () => {
    const call = stub({});
    const [boom] = buildBrainTools({ anchor: { accountId: "001", company: null }, call });
    expect(await boom.execute({}, ctx)).toMatch(/No company is bound/);
    expect(call).not.toHaveBeenCalled();
  });

  it("reports itself as an over-call where the envelope already carried pricing", () => {
    const held = buildBrainTools({
      anchor: ANCHOR,
      call: stub({}),
      reads: { pricing: [{ facility: "Line of Credit", rate: "7.25%" }], notCarried: [] },
    })[0];
    expect(held.heldAlready?.()).toBe(true);
    const needed = buildBrainTools({ anchor: ANCHOR, call: stub({}), reads: { notCarried: [] } })[0];
    expect(needed.heldAlready?.()).toBe(false);
  });
});

describe("liveInvolvements is the N4 gap, read live", () => {
  it("returns the union of the anchor's rows and its loans' rows, in role terms", async () => {
    const call = stub(graphPayload);
    const [, parties] = buildBrainTools({ anchor: ANCHOR, call });
    const out = await parties.execute({}, ctx);
    expect(call).toHaveBeenCalledWith(
      SERVERS.customer360,
      TOOLS.graph,
      { inputs: [{ accountId: ANCHOR.accountId }] },
      expect.anything(),
    );
    expect(out).toEqual([
      {
        name: "Hartwell Precision Manufacturing LLC",
        role: "Borrower",
        scope: "across the relationship",
        ownership: 100,
        guaranty: null,
      },
      {
        name: "Hartwell Industrial Holdings LLC",
        role: "Guarantor",
        scope: "a4Zbb0000027MaYEAU",
        ownership: null,
        guaranty: null,
      },
    ]);
  });

  it("reads a null loanId as relationship level, which is an answer and not a gap", async () => {
    const [, parties] = buildBrainTools({ anchor: ANCHOR, call: stub(graphPayload) });
    const out = (await parties.execute({}, ctx)) as Array<{ scope: string }>;
    expect(out[0].scope).toBe("across the relationship");
  });

  it("surfaces a per-element failure rather than reporting no parties", async () => {
    const failed = { content: [{ isSuccess: false, errors: "insufficient access" }] };
    const [, parties] = buildBrainTools({ anchor: ANCHOR, call: stub(failed) });
    expect(await parties.execute({}, ctx)).toMatch(/could not be read: insufficient access/);
  });

  it("says the graph carries no rows rather than returning an empty list", async () => {
    const empty = { content: [{ isSuccess: true, outputValues: { legalEntities: [] } }] };
    const [, parties] = buildBrainTools({ anchor: ANCHOR, call: stub(empty) });
    expect(await parties.execute({}, ctx)).toMatch(/no involvement rows/);
  });

  it("reports itself as an over-call where the envelope already carried involvements", () => {
    const held = buildBrainTools({
      anchor: ANCHOR,
      call: stub({}),
      reads: { involvements: [{ name: "Holdings", role: "Guarantor", scope: "all 6" }], notCarried: [] },
    })[1];
    expect(held.heldAlready?.()).toBe(true);
  });
});
