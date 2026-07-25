// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChannel, formatProbe, probeChannels } from "./adapter";

type W = Record<string, unknown>;
const w = window as unknown as W;

afterEach(() => {
  for (const k of ["sendPrompt", "claude", "openai", "coworkBridge"]) delete w[k];
});

const CTX = { requestId: "req-1", accountId: "001X", accountName: "Acme Co.", tab: "Covenants" };
const find = (name: string) => probeChannels().find((e) => e.name === name)!;

describe("probeChannels — structure", () => {
  it("returns an entry per inspected surface, each with name/present/type", () => {
    const report = probeChannels();
    expect(report.length).toBeGreaterThan(5);
    for (const e of report) {
      expect(typeof e.name).toBe("string");
      expect(typeof e.present).toBe("boolean");
      expect(typeof e.type).toBe("string");
    }
    const names = report.map((e) => e.name);
    for (const n of [
      "window.sendPrompt",
      "window.claude",
      "window.openai",
      "window.parent !== window",
      "matching globals",
      "location.origin",
      "document.referrer",
      "detected channel",
    ]) {
      expect(names, `probe must cover ${n}`).toContain(n);
    }
  });

  it("reports absence honestly when nothing is exposed", () => {
    expect(find("window.sendPrompt").present).toBe(false);
    expect(find("window.claude").present).toBe(false);
    expect(find("detected channel").value).toBe("none");
  });

  it("never throws, whatever the host looks like", () => {
    Object.defineProperty(w, "claude", {
      configurable: true,
      get() {
        throw new Error("cross-origin denied");
      },
    });
    expect(() => probeChannels()).not.toThrow();
    const e = find("window.claude");
    expect(e.present).toBe(false);
    expect(e.error).toMatch(/cross-origin denied/);
  });
});

describe("probeChannels — discovery", () => {
  it("enumerates the keys of a claude-like host object, marking functions", () => {
    w.claude = { complete: () => {}, callTool: () => {}, version: "1.2.3" };
    const keys = find("window.claude").keys ?? [];
    expect(keys).toContain("complete()");
    expect(keys).toContain("callTool()");
    expect(keys).toContain("version:string");
  });

  it("surfaces matching globals by regex with their types", () => {
    w.coworkBridge = () => {};
    const v = find("matching globals").value ?? "";
    expect(v).toContain("coworkBridge:function");
  });

  it("reports frame context without throwing on parent access", () => {
    const e = find("window.parent !== window");
    expect(e.error).toBeUndefined();
    expect(e.value).toMatch(/framed=/);
    expect(e.value).toMatch(/parentAccessible=/);
  });

  it("formats a human-readable report", () => {
    w.claude = { callTool: () => {} };
    const text = formatProbe(probeChannels());
    expect(text).toContain("window.claude");
    expect(text).toContain("callTool()");
    expect(text).toContain("detected channel");
    expect(text.split("\n").length).toBeGreaterThan(5);
  });
});

describe("candidate bridges — discovered surfaces are actually usable", () => {
  it("prefers window.sendPrompt when present", async () => {
    const fn = vi.fn();
    w.sendPrompt = fn;
    const c = createChannel();
    expect(c.kind()).toBe("sendPrompt");
    await c.request("hi", CTX);
    expect(String(fn.mock.calls[0][0])).toContain("requestId: req-1");
  });

  it("falls through to window.claude.sendPrompt with the framed string", async () => {
    const fn = vi.fn();
    w.claude = { sendPrompt: fn };
    const c = createChannel();
    expect(c.kind()).toBe("claude.sendPrompt");
    expect(c.available()).toBe(true);
    await c.request("hi", CTX);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(String(fn.mock.calls[0][0])).toContain("requestId: req-1");
  });

  it("tries window.claude.complete as a text bridge", async () => {
    const fn = vi.fn();
    w.claude = { complete: fn };
    const c = createChannel();
    expect(c.kind()).toBe("claude.complete");
    await c.request("hi", CTX);
    expect(typeof fn.mock.calls[0][0]).toBe("string");
  });

  it("uses the documented (name, args) shape for callTool bridges", async () => {
    const fn = vi.fn();
    w.claude = { callTool: fn };
    const c = createChannel();
    expect(c.kind()).toBe("claude.callTool");
    await c.request("hi", CTX);
    expect(fn.mock.calls[0][0]).toBe("cockpit_prompt");
    expect(fn.mock.calls[0][1]).toMatchObject({ requestId: "req-1" });
  });

  it("a throwing candidate surfaces as an error, not a fake hand-off", async () => {
    w.claude = {
      sendPrompt: () => {
        throw new Error("nope");
      },
    };
    await expect(createChannel().request("hi", CTX)).rejects.toThrow(/claude\.sendPrompt relay failed/);
  });

  it("still reports none when no candidate exists", async () => {
    const c = createChannel();
    expect(c.kind()).toBe("none");
    await expect(c.request("hi", CTX)).rejects.toThrow(/no agent channel/);
  });
});
