// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSyncSweep } from "./syncSweep";
import { DETAIL_TOOLS, SERVERS, TOOLS } from "./mcp";
import { diffBundles, deltaReport } from "../data/delta";
import type { BorrowerBundle } from "../data/contract";

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

const ok = (outputValues: unknown) => ({
  payload: { content: [{ actionName: "t", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
});

/** No pacing in tests: the ORDER and the binding are the contract, not the wait. */
const nopause = () => Promise.resolve();

function installMcp(handler: (server: string, tool: string, input: unknown) => unknown) {
  const callTool = vi.fn(async (server: string, tool: string, input: unknown) => handler(server, tool, input));
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return callTool;
}

const SWEEP = { accountId: "001X", accountName: "Sterling Fabrication Co.", generatedAt: "2026-07-02T09:15:00Z", sleep: nopause };

describe("every line is bound to a real call", () => {
  it("fires one call per line and ticks in order", async () => {
    const calls: string[] = [];
    installMcp((_s, tool) => {
      calls.push(tool);
      if (tool === TOOLS.mailSearch) return { payload: { value: [] } };
      return ok({ ok: true });
    });

    const seen: string[][] = [];
    const result = await runSyncSweep({ ...SWEEP, onLines: (lines) => seen.push(lines.map((l) => `${l.id}:${l.state}`)) });

    // One call per detail tool, plus the portfolio read, plus the mail search.
    for (const tool of DETAIL_TOOLS) expect(calls).toContain(tool);
    expect(calls).toContain(TOOLS.portfolio);
    expect(calls).toContain(TOOLS.mailSearch);
    expect(calls).toContain(TOOLS.actionHistory);
    expect(calls).toHaveLength(DETAIL_TOOLS.length + 3);

    // Every line ends settled, and no line ticked before the one before it.
    const order = result.lines.map((l) => l.id);
    expect(order[0]).toBe("portfolio");
    expect(order.at(-1)).toBe("mail");
    for (const l of result.lines) expect(["done", "failed"]).toContain(l.state);

    // A line is never shown as done before it has been shown as running.
    const first = seen.find((s) => s.includes("snapshot:done"));
    expect(seen.findIndex((s) => s.includes("snapshot:running"))).toBeLessThan(seen.indexOf(first!));
  });

  it("never ticks a line before its own call has returned", async () => {
    let releaseExposure: (() => void) | null = null;
    const gate = new Promise<void>((r) => (releaseExposure = r));
    installMcp(async (_s, tool) => {
      if (tool === TOOLS.exposure) await gate;
      if (tool === TOOLS.mailSearch) return { payload: { value: [] } };
      return ok({ ok: true });
    });

    let exposureDoneWhileGated = false;
    const run = runSyncSweep({
      ...SWEEP,
      onLines: (lines) => {
        if (lines.find((l) => l.id === "exposure")?.state === "done" && releaseExposure) exposureDoneWhileGated = true;
      },
    });
    await Promise.resolve();
    expect(exposureDoneWhileGated).toBe(false);
    releaseExposure!();
    releaseExposure = null;
    await run;
    expect(exposureDoneWhileGated).toBe(false);
  });

  it("runs on the gesture only: nothing is called until the sweep is invoked", async () => {
    const callTool = installMcp(() => ok({ ok: true }));
    expect(callTool).not.toHaveBeenCalled();
    await runSyncSweep(SWEEP);
    expect(callTool).toHaveBeenCalled();
  });
});

describe("failure keeps the last-good data", () => {
  it("marks the failed line and patches nothing for it", async () => {
    installMcp((_s, tool) => {
      if (tool === TOOLS.covenants) throw { code: "upstream_error", message: "boom" };
      if (tool === TOOLS.mailSearch) return { payload: { value: [] } };
      return ok({ ok: true, marker: tool });
    });

    const result = await runSyncSweep(SWEEP);
    const line = result.lines.find((l) => l.id === "covenants")!;
    expect(line.state).toBe("failed");
    expect(line.detail).toBeTruthy();
    expect(result.partial).toBe(true);
    // The section is simply absent from the patch, so the view keeps what it had.
    expect(result.patch.covenants).toBeUndefined();
    expect(result.patch.exposure).toBeDefined();
  });

  it("treats a per-element failure inside a good envelope the same way", async () => {
    installMcp((_s, tool) => {
      if (tool === TOOLS.exposure) {
        return { payload: { content: [{ actionName: "t", isSuccess: false, errors: ["no access"], sortOrder: 0, version: 1 }] } };
      }
      if (tool === TOOLS.mailSearch) return { payload: { value: [] } };
      return ok({ ok: true });
    });
    const result = await runSyncSweep(SWEEP);
    expect(result.lines.find((l) => l.id === "exposure")!.state).toBe("failed");
    expect(result.patch.exposure).toBeUndefined();
  });
});

describe("the inbox line is opportunistic (A29)", () => {
  it("disappears without a trace when Microsoft 365 is not connected", async () => {
    installMcp((_s, tool) => {
      if (tool === TOOLS.mailSearch) throw { code: "server_not_connected", message: "not connected" };
      return ok({ ok: true });
    });
    const result = await runSyncSweep(SWEEP);
    expect(result.lines.find((l) => l.id === "mail")).toBeUndefined();
    expect(result.lines.some((l) => l.state === "failed")).toBe(false);
    expect(result.partial).toBe(false);
  });

  it("ingests only the messages that clearly name the account", async () => {
    installMcp((_s, tool) => {
      if (tool === TOOLS.mailSearch) {
        return {
          payload: {
            value: [
              { id: "m1", subject: "Sterling Fabrication Co. covenant question", receivedDateTime: "2026-07-01T10:00:00Z" },
              { id: "m2", subject: "Lunch on Thursday", receivedDateTime: "2026-07-01T11:00:00Z" },
            ],
          },
        };
      }
      return ok({ ok: true });
    });
    const result = await runSyncSweep(SWEEP);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].kind).toBe("REQUEST_RECEIVED");
    expect(result.requests[0].id).toContain("m1");
  });

  it("clamps a message dated after the render clock", async () => {
    installMcp((_s, tool) => {
      if (tool === TOOLS.mailSearch) {
        return { payload: { value: [{ id: "m9", subject: "Sterling Fabrication Co. update", receivedDateTime: "2027-01-01T00:00:00Z" }] } };
      }
      return ok({ ok: true });
    });
    const result = await runSyncSweep(SWEEP);
    expect(result.requests[0].ts).toBe(SWEEP.generatedAt);
  });
});

describe("delta detection", () => {
  const before: BorrowerBundle = {
    snapshot: { accountId: "001X", totalCreditExposure: 18_000_000, primaryRiskRating: "5" },
    exposure: {
      totalCommitted: 18_000_000,
      totalOutstanding: 16_900_000,
      facilities: [{ loanId: "a1X1", name: "Revolver", committed: 10_000_000, outstanding: 9_000_000 }],
    },
    covenants: { covenants: [{ covenantId: "cv1", covenantType: "DSCR", actualValue: 1.38, thresholdValue: 1.3 }] },
  };

  it("reports a changed figure with its display id", () => {
    const after = structuredClone(before);
    after.exposure!.totalOutstanding = 17_400_000;
    after.covenants!.covenants![0].actualValue = 1.21;
    const deltas = diffBundles(before, after);
    expect(deltas.map((d) => d.id).sort()).toEqual(["covenant.cv1.actualValue", "exposure.totalOutstanding"]);
    expect(deltaReport(deltas, 0)).toBe("2 figures changed.");
  });

  it("reports nothing when nothing moved", () => {
    expect(diffBundles(before, structuredClone(before))).toEqual([]);
    expect(deltaReport([], 0)).toBe("Everything current, nothing new.");
  });

  it("keys facilities by record id, so a reorder is not a change", () => {
    const after = structuredClone(before);
    after.exposure!.facilities!.unshift({ loanId: "a1X2", name: "Term Loan", committed: 8_000_000, outstanding: 7_900_000 });
    // The new facility was not on screen before, so it is not reported as a
    // change to a figure the banker had already read.
    expect(diffBundles(before, after)).toEqual([]);
  });

  it("counts new client requests alongside the figures", () => {
    expect(deltaReport([], 1)).toBe("1 new client request.");
    const after = structuredClone(before);
    after.snapshot!.primaryRiskRating = "6";
    expect(deltaReport(diffBundles(before, after), 2)).toBe("1 figure changed, 2 new client requests.");
  });
});

describe("budget discipline", () => {
  it("costs one round of reads per sweep, not one per line", async () => {
    const callTool = installMcp((_s, tool) => (tool === TOOLS.mailSearch ? { payload: { value: [] } } : ok({ ok: true })));
    await runSyncSweep(SWEEP);
    expect(callTool.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it("reads only: every call is marked read on the connector", async () => {
    const callTool = installMcp((_s, tool) => (tool === TOOLS.mailSearch ? { payload: { value: [] } } : ok({ ok: true })));
    await runSyncSweep(SWEEP);
    for (const call of callTool.mock.calls) {
      expect([SERVERS.customer360, SERVERS.m365]).toContain(String(call[0]));
      expect([TOOLS.mailSearch, TOOLS.portfolio, TOOLS.actionHistory, ...DETAIL_TOOLS]).toContain(String(call[1]));
    }
  });
});
