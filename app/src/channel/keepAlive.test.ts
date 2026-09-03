// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEEPALIVE_INPUT, KEEPALIVE_INTERVAL_MS, startKeepAlive } from "./keepAlive";
import { callTool, SERVERS, TOOLS } from "./mcp";
import { runSyncSweep } from "./syncSweep";

/* =============================================================================
   THE KEEP-ALIVE

   The Salesforce-hosted MCP session expires on idle: the first call after a
   pause fails retryable and the connector re-handshakes. This ping is what
   takes that failure instead of the banker's Sync. It is therefore judged on
   what it does NOT do: no banner, no sweep line, no call while the page is
   hidden, no call while the connector is already busy.
   ============================================================================= */

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

let hidden = false;
const setHidden = (v: boolean) => {
  hidden = v;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
});

afterEach(() => {
  vi.useRealTimers();
  delete w.claude;
  vi.restoreAllMocks();
});

const INTERVAL = 60_000;
/* Fake timers move Date.now() with the interval, so the keep-alive reads the
   same clock the timers do. The connector meter is a MODULE global shared with
   every other test in the file, so it is injected rather than inherited. */
const COLD = { intervalMs: INTERVAL, lastCallAt: () => 0 };

describe("the ping fires on schedule", () => {
  it("calls once per interval while the cockpit is open", async () => {
    const ping = vi.fn().mockResolvedValue({});
    const stop = startKeepAlive({ ...COLD, ping });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(ping).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(ping).toHaveBeenCalledTimes(2);
    stop();

    await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    expect(ping).toHaveBeenCalledTimes(2); // stopped means stopped
  });

  it("is ONE cheap read, never a write", async () => {
    const fn = vi.fn().mockResolvedValue({ payload: { content: [] } });
    w.claude = { mcp: { callTool: fn, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
    const stop = startKeepAlive(COLD);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    stop();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe(SERVERS.customer360);
    expect(fn.mock.calls[0][1]).toBe(TOOLS.searchAccounts);
    expect(fn.mock.calls[0][2]).toEqual(KEEPALIVE_INPUT);
    // UNCACHED: a cached hit would never touch the org, which is the one thing
    // this call exists to do.
    expect(fn.mock.calls[0][3]).toMatchObject({ cache: false });
    expect(String(fn.mock.calls[0][1])).not.toMatch(/^(stage|execute)_/);
  });

  it("sits well inside the idle window it exists for", () => {
    expect(KEEPALIVE_INTERVAL_MS).toBe(4 * 60 * 1000);
  });
});

describe("the ping stays out of the way", () => {
  it("pauses while the page is hidden, and catches up on return", async () => {
    const ping = vi.fn().mockResolvedValue({});
    const stop = startKeepAlive({ ...COLD, ping });

    hidden = true;
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(ping).not.toHaveBeenCalled();

    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ping).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not stack: a ping still in flight blocks the next tick", async () => {
    let release: (() => void) | null = null;
    const ping = vi.fn().mockImplementation(() => new Promise<void>((r) => (release = r)));
    const stop = startKeepAlive({ ...COLD, ping });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(ping).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(ping).toHaveBeenCalledTimes(1); // still in flight

    release!();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(ping).toHaveBeenCalledTimes(2);
    stop();
  });

  it("skips the tick when a real call has already warmed the session", async () => {
    const fn = vi.fn().mockResolvedValue({ payload: "x" });
    w.claude = { mcp: { callTool: fn, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
    const ping = vi.fn().mockResolvedValue({});
    const stop = startKeepAlive({ intervalMs: INTERVAL, ping });

    // The cockpit itself talked to the connector half a window ago.
    await vi.advanceTimersByTimeAsync(INTERVAL / 2);
    await callTool(SERVERS.customer360, TOOLS.snapshot, { inputs: [{}] }, { read: true });
    await vi.advanceTimersByTimeAsync(INTERVAL / 2);
    expect(ping).not.toHaveBeenCalled();
    stop();
  });

  it("is SILENT when it fails: nothing throws, and the next tick still runs", async () => {
    const ping = vi.fn().mockRejectedValue({ code: "server_unavailable", retryable: true });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const stop = startKeepAlive({ ...COLD, ping });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    stop();
    process.off("unhandledRejection", unhandled);

    expect(ping).toHaveBeenCalledTimes(2);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("the ping is not part of the sweep", () => {
  it("adds no line and no failure to a sync", async () => {
    const ok = (outputValues: unknown) => ({
      payload: { content: [{ actionName: "t", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
    });
    w.claude = {
      mcp: {
        callTool: vi.fn(async (_s: string, tool: string) =>
          tool === TOOLS.mailSearch ? { payload: { value: [] } } : ok({ ok: true }),
        ),
        watchTool: vi.fn(),
        listTools: vi.fn(),
        invalidate: vi.fn(),
      },
    };
    // A failing ping runs across the whole sweep and must leave no trace on it.
    const stop = startKeepAlive({ ...COLD, ping: () => Promise.reject({ code: "server_unavailable" }) });
    await vi.advanceTimersByTimeAsync(INTERVAL);

    const result = await runSyncSweep({
      accountId: "001X",
      accountName: "Sterling Fabrication Co.",
      generatedAt: "2026-07-02T09:15:00Z",
      minPace: 0,
      sleep: () => Promise.resolve(),
    });
    stop();

    expect(result.lines.map((l) => l.id)).toEqual([
      "portfolio",
      "snapshot",
      "graph",
      "exposure",
      "covenants",
      "opportunities",
      "signals",
      "history",
      "mail",
    ]);
    expect(result.partial).toBe(false);
    expect(result.unreachable).toBe(0);
  });
});
