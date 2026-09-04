// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AFS_GAP, afsMapping } from "./afsMapping";
import { readServicing } from "./servicing";

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

function installMcp(answer: (tool: string) => unknown) {
  const calls: Array<{ server: string; tool: string; input: unknown }> = [];
  const callTool = vi.fn(async (server: string, tool: string, input: unknown) => {
    calls.push({ server, tool, input });
    const result = answer(tool);
    if (result instanceof Error) throw result;
    return { payload: result };
  });
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return calls;
}

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

describe("the mapping off the relationship", () => {
  it("reads bank, obligor and obligation from the bundle's snapshot", () => {
    expect(afsMapping({ snapshot: { afs: { bank: "5", obligor: "13", obligation: "42" } } })).toEqual({
      bank: "5",
      obligor: "13",
      obligation: "42",
    });
  });

  it("carries the officer and assignment unit when the relationship names them", () => {
    const m = afsMapping({ snapshot: { afs: { bank: "5", obligor: "13", obligation: "42", officer: "10111111" } } });
    expect(m?.officer).toBe("10111111");
    expect(m?.assignmentUnit).toBeUndefined();
  });

  it("accepts numbers, because a servicing key is a number in AFS", () => {
    const m = afsMapping({ snapshot: { afs: { bank: 5, obligor: 13, obligation: 42 } as never } });
    expect(m).toEqual({ bank: "5", obligor: "13", obligation: "42" });
  });

  it("refuses a PARTIAL mapping, which would let the tool default the rest", () => {
    expect(afsMapping({ snapshot: { afs: { bank: "5", obligor: "13" } } })).toBeUndefined();
    expect(afsMapping({ snapshot: { afs: { bank: "5", obligor: "  ", obligation: "42" } } })).toBeUndefined();
  });

  it("is undefined for a relationship that carries none", () => {
    expect(afsMapping({ snapshot: {} })).toBeUndefined();
    expect(afsMapping(undefined)).toBeUndefined();
  });
});

describe("the servicing module's adapter", () => {
  it("renders the gap and calls AFS not at all when there is no key", async () => {
    const calls = installMcp(() => ({}));
    const module = await readServicing(undefined);
    expect(module).toEqual({ available: false, gap: AFS_GAP });
    expect(calls).toHaveLength(0);
  });

  it("sends the key explicitly on every read, never letting AFS default one", async () => {
    const calls = installMcp(() => ({ commitment: 1 }));
    await readServicing({ bank: "5", obligor: "13", obligation: "42" });
    expect(calls.map((c) => c.tool).sort()).toEqual(["loan_summary", "payment_history", "revolver_utilization"]);
    for (const call of calls) {
      expect(call.server).toBe("AFS");
      expect(call.input).toEqual({ bank: "5", obligor: "13", obligation: "42" });
    }
  });

  it("loses one panel, not the module, when one read does not answer", async () => {
    installMcp((tool) => (tool === "payment_history" ? new Error("upstream") : { commitment: 7500000 }));
    const module = await readServicing({ bank: "5", obligor: "13", obligation: "42" });
    expect(module.available).toBe(true);
    if (!module.available) return;
    expect(module.payments).toBeUndefined();
    expect(module.revolver?.commitment).toBe(7500000);
    expect(module.unreachable).toHaveLength(1);
    expect(module.unreachable[0]).toContain("payment_history");
  });
});
