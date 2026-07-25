// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChannel, newRequestId } from "./adapter";

type W = { sendPrompt?: unknown; openai?: unknown };

afterEach(() => {
  delete (window as unknown as W).sendPrompt;
  delete (window as unknown as W).openai;
});

const CTX = { requestId: "req-abc123", accountId: "001X", accountName: "Acme Co.", tab: "Covenants" };

describe("channel adapter", () => {
  it("reports none when no host global exists", () => {
    const c = createChannel();
    expect(c.kind()).toBe("none");
    expect(c.available()).toBe(false);
  });

  it("re-detects the channel at request time, not at construction (A14)", async () => {
    const c = createChannel();
    expect(c.available()).toBe(false);
    const sendPrompt = vi.fn();
    (window as unknown as W).sendPrompt = sendPrompt;
    expect(c.available()).toBe(true);
    await c.request("hi", CTX);
    expect(sendPrompt).toHaveBeenCalledTimes(1);
  });

  it("F8 — includes the requestId (and context) in the prompt frame", async () => {
    const sendPrompt = vi.fn();
    (window as unknown as W).sendPrompt = sendPrompt;
    await createChannel().request("Explain the cushion", CTX);
    const framed = String(sendPrompt.mock.calls[0][0]);
    expect(framed).toContain("Explain the cushion");
    expect(framed).toContain("requestId: req-abc123");
    expect(framed).toContain("Acme Co.");
    expect(framed).toContain("Covenants");
  });

  it("F9 — a rejected thenable from sendPrompt surfaces as an error", async () => {
    (window as unknown as W).sendPrompt = () => Promise.reject(new Error("host refused"));
    await expect(createChannel().request("x", CTX)).rejects.toThrow(/sendPrompt failed/);
  });

  it("F9 — a resolved thenable resolves normally", async () => {
    (window as unknown as W).sendPrompt = () => Promise.resolve("queued");
    await expect(createChannel().request("x", CTX)).resolves.toBeUndefined();
  });

  it("F9 — a synchronous throw still surfaces as an error", async () => {
    (window as unknown as W).sendPrompt = () => {
      throw new Error("boom");
    };
    await expect(createChannel().request("x", CTX)).rejects.toThrow(/sendPrompt failed/);
  });

  it("F9 — a rejected callTool relay surfaces as an error", async () => {
    (window as unknown as W).openai = { callTool: () => Promise.reject(new Error("nope")) };
    const c = createChannel();
    expect(c.kind()).toBe("callTool");
    await expect(c.request("x", CTX)).rejects.toThrow(/callTool relay failed/);
  });

  it("rejects when there is no channel at all", async () => {
    await expect(createChannel().request("x", CTX)).rejects.toThrow(/no agent channel/);
  });

  it("mints unique request ids", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});
