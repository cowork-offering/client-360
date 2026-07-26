// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPacer, LAUNCH_GAP_MS, MAX_IN_FLIGHT, runSyncSweep } from "./syncSweep";
import { callTool, DETAIL_TOOLS, TOOLS } from "./mcp";

/* =============================================================================
   THE SWEEP MUST NOT BURST.

   Evidence, 2026-07-26: the founder saw EVERY line of a sweep report the
   customer briefly unreachable. All four read tools were then run live from the
   box moments later and returned isSuccess:true instantly. The org and the tools
   were healthy; the failure was turbulence on the artifact-connector bridge when
   nine calls left at once.

   So the sweep launches at most two at a time, spaced. Retry is NOT added here:
   `callTool` already retries once for a read the platform stamped retryable, and
   a second layer would mean two retries and a bigger burst — the opposite of the
   fix. The tests below pin both halves of that.
   ============================================================================= */

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

const envelope = (outputValues: unknown) => ({
  payload: { content: [{ actionName: "t", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
});

describe("createPacer", () => {
  const immediate = () => Promise.resolve();

  it("never runs more than the limit at once", async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    let inFlight = 0;
    let peak = 0;
    const gates: Array<() => void> = [];
    const pace = createPacer({ gap: 0, limit: 2, sleep: immediate });

    const jobs = Array.from({ length: 9 }, () =>
      pace(() => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise<void>((resolve) => {
          gates.push(() => {
            inFlight -= 1;
            resolve();
          });
        });
      }),
    );

    // Whatever can start has started: the ceiling holds from the first moment.
    await tick();
    expect(peak).toBe(2);

    // Drain one at a time, re-checking the ceiling as each new job takes a slot.
    for (let released = 0; released < 9; released += 1) {
      await tick();
      const open = gates.shift();
      expect(open, `no job in flight at release ${released}`).toBeTruthy();
      open!();
      await tick();
      expect(peak, "the pacer let a third call through").toBeLessThanOrEqual(2);
    }

    await Promise.all(jobs);
    expect(inFlight).toBe(0);
  });

  it("spaces each launch by the gap", async () => {
    const waits: number[] = [];
    const sleep = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    const pace = createPacer({ gap: 200, limit: 2, sleep });
    await Promise.all([pace(immediate), pace(immediate), pace(immediate)]);
    expect(waits).toEqual([200, 200, 200]);
  });

  it("preserves order and resolves every caller", async () => {
    const order: number[] = [];
    const pace = createPacer({ gap: 0, limit: 2, sleep: immediate });
    const out = await Promise.all([1, 2, 3, 4].map((n) => pace(async () => { order.push(n); return n; })));
    expect(out).toEqual([1, 2, 3, 4]);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("releases the slot even when the call fails", async () => {
    const pace = createPacer({ gap: 0, limit: 1, sleep: immediate });
    await expect(pace(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // A slot leaked here would deadlock the whole sweep on the next line.
    await expect(pace(() => Promise.resolve("fine"))).resolves.toBe("fine");
  });

  it("ships the burst-safe defaults", () => {
    expect(MAX_IN_FLIGHT).toBe(2);
    expect(LAUNCH_GAP_MS).toBe(200);
  });
});

describe("the sweep paces its nine calls", () => {
  it("keeps at most two connector calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const callTool = vi.fn(async (_s: string, tool: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      if (tool === TOOLS.mailSearch) return { payload: { value: [] } };
      return envelope({ rows: [], entries: [] });
    });
    w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };

    await runSyncSweep({
      accountId: "001X",
      accountName: "Testco",
      generatedAt: "2026-07-26T00:00:00Z",
      minPace: 0,
      sleep: () => Promise.resolve(),
    });

    expect(callTool.mock.calls.length).toBeGreaterThanOrEqual(DETAIL_TOOLS.length + 2);
    expect(peak, "the sweep burst past the in-flight ceiling").toBeLessThanOrEqual(MAX_IN_FLIGHT);
  });

  it("reads ONLY the open account's detail, never the whole book", async () => {
    const callTool = vi.fn(async (_s: string, tool: string, _input?: unknown) => {
      if (tool === TOOLS.mailSearch) return { payload: { value: [] } };
      return envelope({ rows: [], entries: [] });
    });
    w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };

    await runSyncSweep({
      accountId: "001OPEN",
      accountName: "Testco",
      generatedAt: "2026-07-26T00:00:00Z",
      minPace: 0,
      sleep: () => Promise.resolve(),
    });

    for (const call of callTool.mock.calls) {
      const input = call[2] as { inputs?: Array<Record<string, unknown>> } | undefined;
      for (const row of input?.inputs ?? []) {
        if (row.accountId !== undefined) expect(row.accountId).toBe("001OPEN");
      }
    }
  });
});

describe("retry-once lives in callTool, and is not doubled in the sweep", () => {
  const install = (attempts: { n: number }, failure: unknown) => {
    const callTool = vi.fn(async () => {
      attempts.n += 1;
      if (attempts.n === 1) throw failure;
      return { payload: { ok: true } };
    });
    w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
    return callTool;
  };

  it("retries a read the platform stamped retryable, exactly once", async () => {
    const attempts = { n: 0 };
    install(attempts, { code: "rate_limited", message: "slow down", retryable: true, retryAfterMs: 1 });
    await expect(callTool("Customer 360", "Customer360Snapshot", { inputs: [{}] }, { read: true })).resolves.toBeTruthy();
    expect(attempts.n).toBe(2);
  });

  it("does NOT retry a failure the platform did not stamp", async () => {
    const attempts = { n: 0 };
    install(attempts, { code: "bad_request", message: "malformed", retryable: false });
    await expect(callTool("Customer 360", "Customer360Snapshot", { inputs: [{}] }, { read: true })).rejects.toBeTruthy();
    expect(attempts.n).toBe(1);
  });

  it("does NOT retry a WRITE, however it failed", async () => {
    const attempts = { n: 0 };
    install(attempts, { code: "rate_limited", message: "slow down", retryable: true, retryAfterMs: 1 });
    await expect(callTool("Customer 360", "execute_annual_review", { inputs: [{}] }, { read: false })).rejects.toBeTruthy();
    // An ambiguous write outcome is not proof the tool did not run.
    expect(attempts.n).toBe(1);
  });
});
