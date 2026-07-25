// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLivePortfolio } from "./useLivePortfolio";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  delete w.claude;
});

/** Renders the hook and exposes the latest value + the captured watch handler. */
function mountHook(enabled = true) {
  const captured: { handler?: (ev: unknown) => void; opts?: Record<string, unknown> } = {};
  const unsub = vi.fn();
  w.claude = {
    mcp: {
      callTool: vi.fn(),
      listTools: vi.fn(),
      invalidate: vi.fn(),
      watchTool: vi.fn().mockImplementation((_s, _t, _i, h, o) => {
        captured.handler = h as (ev: unknown) => void;
        captured.opts = o as Record<string, unknown>;
        return unsub;
      }),
    },
  };
  let latest: ReturnType<typeof useLivePortfolio> = {};
  function Probe() {
    latest = useLivePortfolio(enabled);
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Probe />));
  return { captured, unsub, get value() { return latest; } };
}

const envelope = (data: unknown) => ({ content: [{ isSuccess: true, errors: null, outputValues: data }] });

describe("useLivePortfolio", () => {
  it("polls above the platform's ~30s floor", () => {
    const h = mountHook();
    expect(h.captured.opts?.refetchInterval as number).toBeGreaterThanOrEqual(30_000);
  });

  it("unwraps the invocable envelope and records cache freshness", () => {
    const h = mountHook();
    act(() =>
      h.captured.handler!({
        type: "data",
        result: { payload: envelope({ accounts: [{ accountId: "A" }] }), cache: { storedAt: 555, revalidating: false } },
      }),
    );
    expect(h.value.portfolio?.accounts?.[0]?.accountId).toBe("A");
    expect(h.value.storedAt).toBe(555);
  });

  it("keeps last-good data on a transient failure", () => {
    const h = mountHook();
    act(() => h.captured.handler!({ type: "data", result: { payload: envelope({ accounts: [{ accountId: "A" }] }) } }));
    act(() => h.captured.handler!({ type: "error", error: { code: "server_unavailable", retryable: true } }));
    expect(h.value.portfolio?.accounts?.[0]?.accountId).toBe("A"); // retained
    expect(h.value.failure?.code).toBe("server_unavailable");
  });

  it("RETRACTS data on an authz denial", () => {
    const h = mountHook();
    act(() => h.captured.handler!({ type: "data", result: { payload: envelope({ accounts: [{ accountId: "A" }] }) } }));
    act(() => h.captured.handler!({ type: "error", error: { code: "needs_reauth" } }));
    expect(h.value.portfolio).toBeUndefined(); // retracted
    expect(h.value.failure?.retract).toBe(true);
  });

  it("unsubscribes on unmount", () => {
    const h = mountHook();
    act(() => root?.unmount());
    root = null;
    expect(h.unsub).toHaveBeenCalled();
  });

  it("does not register a watch when disabled", () => {
    const h = mountHook(false);
    expect(h.captured.handler).toBeUndefined();
  });
});
