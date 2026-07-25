// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callTool,
  describeFailure,
  mcpAvailable,
  SERVERS,
  TOOLS,
  unwrapInvocable,
  unwrapInvocableOne,
  unwrapLlm,
  unwrapMail,
  watchTool,
} from "./mcp";
import { createChannel } from "./adapter";

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

function installMcp(impl: Partial<Record<string, unknown>>) {
  w.claude = { mcp: { callTool: vi.fn(), watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn(), ...impl } };
  return (w.claude!.mcp as Record<string, ReturnType<typeof vi.fn>>);
}

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

const rejectWith = (code: string, extra: Record<string, unknown> = {}) =>
  vi.fn().mockRejectedValue({ code, message: `${code} happened`, ...extra });

describe("availability gate", () => {
  it("is false without the capability and true with it", () => {
    expect(mcpAvailable()).toBe(false);
    installMcp({});
    expect(mcpAvailable()).toBe(true);
  });

  it("makes the channel report kind 'mcp', outranking legacy bridges", () => {
    (window as unknown as { sendPrompt?: unknown }).sendPrompt = () => {};
    installMcp({});
    expect(createChannel().kind()).toBe("mcp");
    delete (window as unknown as { sendPrompt?: unknown }).sendPrompt;
  });
});

describe("error doctrine", () => {
  it("gives each code its own fix copy, never one generic banner", () => {
    const codes = [
      "needs_reauth", "server_not_connected", "selection_required", "server_unavailable",
      "not_in_manifest", "blocked_by_policy", "approval_required", "tool_error", "rate_limited",
    ] as const;
    const copies = codes.map((c) => describeFailure({ code: c }, "Customer 360", "X").fix);
    expect(new Set(copies).size).toBe(codes.length); // all distinct
    expect(describeFailure({ code: "needs_reauth" }, "Customer 360", "X").fix).toMatch(/Reconnect Customer 360/);
    expect(describeFailure({ code: "server_not_connected" }, "IDB Gateway", "X").fix).toMatch(/Add IDB Gateway/);
  });

  it("treats unknown codes as upstream_error", () => {
    expect(describeFailure({ code: "some_new_code" }, "S", "T").code).toBe("upstream_error");
  });

  it("marks authz denials as retract-rendered-data", () => {
    for (const c of ["needs_reauth", "server_not_connected", "blocked_by_policy", "approval_required"]) {
      expect(describeFailure({ code: c }, "S", "T").retract, c).toBe(true);
    }
    expect(describeFailure({ code: "server_unavailable" }, "S", "T").retract).toBe(false);
  });

  it("flags lifecycle codes as no-capability", () => {
    for (const c of ["not_granted", "capability_disabled", "capability_removed"]) {
      expect(describeFailure({ code: c }, "S", "T").noCapability, c).toBe(true);
    }
  });

  it("marks outcome-ambiguous codes (a rejection is not proof it did not run)", () => {
    for (const c of ["server_unavailable", "upstream_error", "cancelled"]) {
      expect(describeFailure({ code: c }, "S", "T").ambiguous, c).toBe(true);
    }
    expect(describeFailure({ code: "not_in_manifest" }, "S", "T").ambiguous).toBe(false);
  });

  it("trusts only the platform's retryable stamp, never the code", () => {
    expect(describeFailure({ code: "server_unavailable" }, "S", "T").retryable).toBe(false);
    expect(describeFailure({ code: "server_unavailable", retryable: true }, "S", "T").retryable).toBe(true);
  });
});

describe("callTool", () => {
  it("resolves payload and cache marker", async () => {
    const api = installMcp({
      callTool: vi.fn().mockResolvedValue({ payload: { a: 1 }, cache: { storedAt: 123, revalidating: false } }),
    });
    const res = await callTool(SERVERS.gateway, TOOLS.llm, { prompt: "hi" });
    expect(res.payload).toEqual({ a: 1 });
    expect(res.cache?.storedAt).toBe(123);
    expect(api.callTool).toHaveBeenCalledWith(SERVERS.gateway, TOOLS.llm, { prompt: "hi" }, expect.anything());
  });

  it("rejects with a normalized failure, never the raw error", async () => {
    installMcp({ callTool: rejectWith("needs_reauth", { server: "Customer 360" }) });
    await expect(callTool(SERVERS.customer360, TOOLS.snapshot)).rejects.toMatchObject({
      code: "needs_reauth",
      retract: true,
      fix: expect.stringMatching(/Reconnect/),
    });
  });

  it("retries a retryable READ exactly once", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: "server_unavailable", retryable: true, retryAfterMs: 1 })
      .mockResolvedValue({ payload: "ok" });
    installMcp({ callTool: fn });
    const res = await callTool(SERVERS.customer360, TOOLS.portfolio, {}, { read: true });
    expect(res.payload).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("never retries a write, even when stamped retryable", async () => {
    const fn = rejectWith("server_unavailable", { retryable: true, retryAfterMs: 1 });
    installMcp({ callTool: fn });
    await expect(callTool(SERVERS.customer360, TOOLS.snapshot, {}, { read: false })).rejects.toMatchObject({
      ambiguous: true,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-retryable read", async () => {
    const fn = rejectWith("not_in_manifest");
    installMcp({ callTool: fn });
    await expect(callTool(SERVERS.m365, TOOLS.mailSearch, {}, { read: true })).rejects.toMatchObject({
      code: "not_in_manifest",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fails with capability_disabled when the namespace is absent", async () => {
    await expect(callTool(SERVERS.gateway, TOOLS.llm)).rejects.toMatchObject({
      code: "capability_disabled",
      noCapability: true,
    });
  });
});

describe("watchTool", () => {
  it("routes data and error events, and returns a synchronous unsubscribe", () => {
    const unsub = vi.fn();
    let handler: ((ev: unknown) => void) | undefined;
    installMcp({
      watchTool: vi.fn().mockImplementation((_s, _t, _i, h) => {
        handler = h as (ev: unknown) => void;
        return unsub;
      }),
    });
    const events: Array<Record<string, unknown>> = [];
    const stop = watchTool(SERVERS.customer360, TOOLS.portfolio, {}, (e) => events.push(e));
    expect(typeof stop).toBe("function");

    handler!({ type: "data", result: { payload: { x: 1 }, cache: { storedAt: 9, revalidating: true } } });
    handler!({ type: "error", error: { code: "server_unavailable", retryable: true } });

    expect(events[0].data).toMatchObject({ payload: { x: 1 } });
    expect(events[1].failure).toMatchObject({ code: "server_unavailable", retryable: true });
    stop();
    expect(unsub).toHaveBeenCalled();
  });

  it("reports a failure event instead of throwing when the capability is absent", () => {
    const events: Array<Record<string, unknown>> = [];
    const stop = watchTool(SERVERS.customer360, TOOLS.portfolio, {}, (e) => events.push(e));
    expect(events[0].failure).toMatchObject({ noCapability: true });
    expect(() => stop()).not.toThrow();
  });
});

describe("envelope unwrapping — Salesforce invocable", () => {
  const env = (elements: unknown[]) => ({ content: elements });

  it("unwraps outputValues positionally", () => {
    const payload = env([
      { actionName: "Customer360Snapshot", isSuccess: true, errors: null, outputValues: { name: "A" }, sortOrder: 0 },
      { actionName: "Customer360Snapshot", isSuccess: true, errors: null, outputValues: { name: "B" }, sortOrder: 1 },
    ]);
    const slots = unwrapInvocable<{ name: string }>(payload, 2);
    expect(slots[0]).toEqual({ ok: true, data: { name: "A" } });
    expect(slots[1]).toEqual({ ok: true, data: { name: "B" } });
  });

  it("isolates an isSuccess:false element without contaminating siblings", () => {
    const payload = env([
      { isSuccess: false, errors: ["row locked"], outputValues: null },
      { isSuccess: true, errors: null, outputValues: { name: "B" } },
    ]);
    const slots = unwrapInvocable<{ name: string }>(payload, 2);
    expect(slots[0]).toMatchObject({ ok: false, error: "row locked" });
    expect(slots[1]).toMatchObject({ ok: true });
  });

  it("treats non-null errors as failure even when isSuccess is absent", () => {
    const slots = unwrapInvocable(env([{ errors: "boom", outputValues: { a: 1 } }]), 1);
    expect(slots[0]).toMatchObject({ ok: false, error: "boom" });
  });

  it("fails closed on a malformed envelope rather than yielding undefined data", () => {
    for (const bad of [undefined, null, {}, { content: "nope" }]) {
      const slots = unwrapInvocable(bad, 2);
      expect(slots).toHaveLength(2);
      expect(slots.every((s) => !s.ok)).toBe(true);
    }
  });

  it("detects positional misalignment when the envelope is short", () => {
    const slots = unwrapInvocable(env([{ isSuccess: true, outputValues: { a: 1 } }]), 3);
    expect(slots).toHaveLength(3);
    expect(slots[2]).toMatchObject({ ok: false });
  });

  it("unwrapInvocableOne reads the single-input case", () => {
    expect(unwrapInvocableOne(env([{ isSuccess: true, outputValues: { a: 1 } }]))).toEqual({ ok: true, data: { a: 1 } });
  });
});

describe("envelope unwrapping — LLM body string", () => {
  it("parses the JSON body string and reads .response", () => {
    const payload = {
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ response: "## Analysis\nLeverage is 3.85x.", model: "claude-x", cost_usd: 0.0021 }),
    };
    const a = unwrapLlm(payload);
    expect(a.text).toContain("Leverage is 3.85x");
    expect(a.model).toBe("claude-x");
    expect(a.costUsd).toBeCloseTo(0.0021);
  });

  it("survives a non-JSON body by surfacing it verbatim", () => {
    expect(unwrapLlm({ statusCode: 200, body: "plain text answer" }).text).toBe("plain text answer");
  });

  it("handles an already-parsed body object", () => {
    expect(unwrapLlm({ body: { response: "hi" } }).text).toBe("hi");
  });

  it("returns empty text rather than throwing on a shapeless payload", () => {
    expect(unwrapLlm(undefined).text).toBe("");
    expect(unwrapLlm({}).text).toBe("");
  });
});

describe("envelope unwrapping — mailbox", () => {
  it("accepts a bare array and common wrappers", () => {
    expect(unwrapMail([{ id: "1" }])).toHaveLength(1);
    expect(unwrapMail({ results: [{ id: "1" }] })).toHaveLength(1);
    expect(unwrapMail({ value: [{ id: "1" }] })).toHaveLength(1);
  });

  it("treats no matches as an honest empty list", () => {
    expect(unwrapMail([])).toEqual([]);
    expect(unwrapMail({})).toEqual([]);
    expect(unwrapMail(null)).toEqual([]);
  });
});
