// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DECLINE_NOTICE,
  acquireSample,
  askSession,
  askSessionJson,
  consentPrimed,
  primeConsent,
  resetSessionDoor,
  sampleAvailable,
  sessionDeclined,
  takeDeclineNotice,
  type SampleOptions,
  type SessionFailure,
} from "./sampleDoor";
import { resetSampleMetrics, sampleSummary, sampleTimings } from "./sampleMetrics";

/* =============================================================================
   THE SESSION DOOR, HELD TO THE RUNTIME CONTRACT.

   `claude.use("sample")` is NULL outside a real viewer, so everything here runs
   against a stub of the documented shape. What the suite pins is the behaviour
   the banker sees: absence is never an error on the glass, a decline is said
   once and never again, and the consent moment happens exactly once per view,
   on the greeting, and never mid-plan.
   ============================================================================= */

type SampleStub = ((input: string, options?: SampleOptions) => Promise<unknown>) & {
  json?: (input: string, options?: SampleOptions) => Promise<unknown>;
};

function install(sample: SampleStub | null): void {
  (window as unknown as { claude?: unknown }).claude = {
    use: async (name: string) => (name === "sample" ? sample : null),
  };
}

const reject = (code: string, extra: Record<string, unknown> = {}) =>
  Promise.reject({ code, message: `stub ${code}`, ...extra });

beforeEach(() => {
  resetSessionDoor();
  resetSampleMetrics();
});

afterEach(() => {
  delete (window as unknown as { claude?: unknown }).claude;
});

describe("acquisition designs for absence", () => {
  it("resolves to no door where the runtime has no sample capability", async () => {
    install(null);
    await acquireSample(50);
    expect(sampleAvailable()).toBe(false);
  });

  it("resolves to no door where there is no claude root at all", async () => {
    await acquireSample(50);
    expect(sampleAvailable()).toBe(false);
  });

  it("does not hang on a use() that never settles", async () => {
    (window as unknown as { claude?: unknown }).claude = { use: () => new Promise(() => {}) };
    await acquireSample(20);
    expect(sampleAvailable()).toBe(false);
  });

  it("acquires once and memoises the acquisition", async () => {
    const use = vi.fn(async () => (async () => ({ text: "hi", truncated: false, modelTierApplied: "quick" })) as unknown);
    (window as unknown as { claude?: unknown }).claude = { use };
    await Promise.all([acquireSample(50), acquireSample(50), acquireSample(50)]);
    expect(use).toHaveBeenCalledTimes(1);
    expect(sampleAvailable()).toBe(true);
  });
});

describe("asking the session", () => {
  it("carries the tier the ladder picked and streams through onText", async () => {
    const seen: SampleOptions[] = [];
    install(async (_input, options) => {
      seen.push(options ?? {});
      options?.onText?.({ text: "the ", delta: "the " });
      options?.onText?.({ text: "the line", delta: "line" });
      return { text: "the line", truncated: false, modelTierApplied: "default" };
    });
    await acquireSample(50);
    const chunks: string[] = [];
    const text = await askSession("ask", { tier: "default", onText: (u) => chunks.push(u.text) });
    expect(text).toBe("the line");
    expect(seen[0].modelTier).toBe("default");
    expect(chunks).toEqual(["the ", "the line"]);
  });

  it("never sends cache beside tools, which the contract refuses", async () => {
    const seen: SampleOptions[] = [];
    install(async (_input, options) => {
      seen.push(options ?? {});
      return { text: "{}", truncated: false, modelTierApplied: "quick" };
    });
    await acquireSample(50);
    await askSession("ask", {
      cache: true,
      tools: [{ name: "t", description: "d", execute: () => "x" }],
    });
    expect(seen[0].tools).toHaveLength(1);
    expect(seen[0].cache).toBeUndefined();
  });

  it("rejects with the branchable failure shape, never a raw platform error", async () => {
    install(() => reject("upstream_error", { text: "half an answer" }));
    await acquireSample(50);
    const failure = await askSession("ask").then(
      () => null,
      (e: SessionFailure) => e,
    );
    expect(failure).toMatchObject({ code: "upstream_error", permanent: false, text: "half an answer" });
  });

  it("refuses before the wire where there is no door", async () => {
    const failure = await askSession("ask").then(
      () => null,
      (e: SessionFailure) => e,
    );
    expect(failure).toMatchObject({ code: "unavailable", permanent: true });
  });
});

describe("a decline is permanent for the view, and said once", () => {
  it("hides the door after not_granted and says the one sentence once", async () => {
    install(() => reject("not_granted"));
    await acquireSample(50);
    await askSession("ask").catch(() => null);

    expect(sessionDeclined()).toBe(true);
    expect(sampleAvailable()).toBe(false);
    expect(takeDeclineNotice()).toBe(DECLINE_NOTICE);
    // Said once. A room that repeated it would nag about a settled decision.
    expect(takeDeclineNotice()).toBeNull();
    expect(DECLINE_NOTICE).not.toMatch(/[—–]/);
  });

  it("treats sampling_disabled and not_declared the same way", async () => {
    for (const code of ["sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]) {
      resetSessionDoor();
      install(() => reject(code));
      await acquireSample(50);
      await askSession("ask").catch(() => null);
      expect(sessionDeclined()).toBe(true);
    }
  });

  it("does NOT hide the door on a rate limit or an upstream fault", async () => {
    install(() => reject("rate_limited"));
    await acquireSample(50);
    await askSession("ask").catch(() => null);
    expect(sessionDeclined()).toBe(false);
    expect(takeDeclineNotice()).toBeNull();
  });

  it("says nothing at all while the door is healthy", async () => {
    install(async () => ({ text: "fine", truncated: false, modelTierApplied: "quick" }));
    await acquireSample(50);
    await askSession("ask");
    expect(takeDeclineNotice()).toBeNull();
  });
});

describe("the consent moment rides the greeting, once per view", () => {
  it("makes exactly one call however many times it is primed", async () => {
    const calls: string[] = [];
    install(async (input) => {
      calls.push(input);
      return { text: "One covenant is inside 90 days.", truncated: false, modelTierApplied: "quick" };
    });
    await acquireSample(50);

    const first = primeConsent("greeting envelope");
    const second = primeConsent("greeting envelope");
    const third = primeConsent("a different prompt entirely");
    expect(await first).toBe("One covenant is inside 90 days.");
    expect(await second).toBe("One covenant is inside 90 days.");
    expect(await third).toBe("One covenant is inside 90 days.");
    expect(calls).toHaveLength(1);
    expect(consentPrimed()).toBe(true);
  });

  it("caches the greeting, because it is stable across loads of a view", async () => {
    const seen: SampleOptions[] = [];
    install(async (_input, options) => {
      seen.push(options ?? {});
      return { text: "noticed", truncated: false, modelTierApplied: "quick" };
    });
    await acquireSample(50);
    await primeConsent("greeting");
    expect(seen[0].cache).toBe(true);
    expect(seen[0].modelTier).toBe("quick");
  });

  it("resolves NULL on a decline rather than throwing into the opening", async () => {
    install(() => reject("not_granted"));
    await acquireSample(50);
    expect(await primeConsent("greeting")).toBeNull();
    expect(takeDeclineNotice()).toBe(DECLINE_NOTICE);
  });

  it("does not fire on its own: nothing is primed until the room asks", async () => {
    install(async () => ({ text: "x", truncated: false, modelTierApplied: "quick" }));
    await acquireSample(50);
    expect(consentPrimed()).toBe(false);
  });

  it("is the first call of the view, so its wait carries the dialog alone", async () => {
    install(async (_input, options) => {
      options?.onText?.({ text: "noticed", delta: "noticed" });
      return { text: "noticed", truncated: false, modelTierApplied: "quick" };
    });
    await acquireSample(50);
    await primeConsent("greeting");
    await askSession("a later line", { tier: "quick" });

    const summary = sampleSummary();
    expect(summary.consentCall?.kind).toBe("greeting");
    // The later call is measured in a band; the consent call never pollutes one.
    expect(Object.keys(summary.bands)).toEqual(["reply:quick"]);
    expect(summary.bands["reply:quick"].calls).toBe(1);
  });
});

describe("the json arm uses the platform's machine-parse framing", () => {
  it("hands back the serialised value for the room's own validator", async () => {
    const fn: SampleStub = async () => ({ text: "x", truncated: false, modelTierApplied: "quick" });
    fn.json = async () => ({ type: "clarify", text: "which line" });
    install(fn);
    await acquireSample(50);
    expect(await askSessionJson("ask")).toBe('{"type":"clarify","text":"which line"}');
  });

  it("hands back the raw reply on invalid_json, so the room's extractor tries", async () => {
    const fn: SampleStub = async () => ({ text: "x", truncated: false, modelTierApplied: "quick" });
    fn.json = () => reject("invalid_json", { text: 'here you go {"type":"clarify","text":"which line"} ok' });
    install(fn);
    await acquireSample(50);
    expect(await askSessionJson("ask")).toContain('"type":"clarify"');
  });

  it("falls back to the text arm on a runtime with no json method", async () => {
    install(async () => ({ text: "plain text", truncated: false, modelTierApplied: "quick" }));
    await acquireSample(50);
    expect(await askSessionJson("ask")).toBe("plain text");
  });
});

describe("the latency gate is stamped from inside the door", () => {
  it("times first token and full answer, and names the rung", async () => {
    install(async (_input, options) => {
      options?.onText?.({ text: "a", delta: "a" });
      return { text: "a", truncated: false, modelTierApplied: "default" };
    });
    await acquireSample(50);
    await askSession("ask", { tier: "default", rung: 3, kind: "reply" });
    const [row] = sampleTimings();
    expect(row).toMatchObject({ kind: "reply", tier: "default", rung: 3 });
    expect(row.firstTokenMs).not.toBeNull();
    expect(row.totalMs).not.toBeNull();
  });

  it("counts a tool call, and counts an over-call separately", async () => {
    install(async (_input, options) => {
      for (const tool of options?.tools ?? []) await tool.execute({}, { signal: new AbortController().signal });
      return { text: "done", truncated: false, modelTierApplied: "default" };
    });
    await acquireSample(50);
    await askSession("ask", {
      tier: "default",
      rung: 3,
      tools: [
        { name: "held", description: "d", heldAlready: () => true, execute: () => "x" },
        { name: "needed", description: "d", heldAlready: () => false, execute: () => "y" },
      ],
    });
    const summary = sampleSummary();
    expect(summary.toolCalls).toBe(2);
    expect(summary.overCallRate).toBe(0.5);
  });

  it("records the failure code rather than losing the call", async () => {
    install(() => reject("rate_limited"));
    await acquireSample(50);
    await askSession("ask").catch(() => null);
    expect(sampleSummary().failures.rate_limited).toBe(1);
  });
});
