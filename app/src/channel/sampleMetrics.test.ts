// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installSampleGateReadout,
  markCall,
  resetSampleMetrics,
  sampleSummary,
  sampleTimings,
} from "./sampleMetrics";

/* =============================================================================
   THE LATENCY GATE, AS A MEASURING TAPE.

   The founder's decision was "switch to sample, but PROVE LATENCY FIRST", and
   the one number the whole thing turns on is the over-call rate. So the two
   failures this suite makes impossible are a consent dialog pooled into a
   quick-tier median (which would make the quick tier look broken and hide a
   genuine once-per-view cost) and a tool call that is counted but not judged.
   ============================================================================= */

beforeEach(() => {
  resetSampleMetrics();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { c360SampleGate?: unknown }).c360SampleGate;
  delete (window as unknown as { c360SampleCalls?: unknown }).c360SampleCalls;
});

/** One call that took `first` ms to its first token and `total` ms in all. */
function call(kind: "greeting" | "narrate" | "reply", tier: "quick" | "default", rung: 2 | 3, first: number, total: number) {
  const probe = markCall({ kind, tier, rung });
  vi.advanceTimersByTime(first);
  probe.firstToken();
  vi.advanceTimersByTime(total - first);
  probe.done();
  return probe;
}

describe("a call is logged the moment it leaves, not when it comes back", () => {
  it("shows a call that never settled as a call that never settled", () => {
    markCall({ kind: "reply", tier: "quick", rung: 2 });
    const [row] = sampleTimings();
    expect(row).toMatchObject({ kind: "reply", tier: "quick", firstTokenMs: null, totalMs: null });
  });

  it("stamps first token once, however many times text arrives", () => {
    const probe = markCall({ kind: "reply", tier: "quick", rung: 2 });
    vi.advanceTimersByTime(400);
    probe.firstToken();
    vi.advanceTimersByTime(600);
    probe.firstToken();
    probe.done();
    expect(sampleTimings()[0].firstTokenMs).toBe(400);
    expect(sampleTimings()[0].totalMs).toBe(1000);
  });
});

describe("the consent call is held out of every band", () => {
  it("reports the first call of the view alone, and pools the rest", () => {
    call("greeting", "quick", 2, 9_000, 9_400); // the dialog wait rides this one
    call("reply", "quick", 2, 900, 1_200);
    call("reply", "quick", 2, 1_100, 1_600);

    const summary = sampleSummary();
    expect(summary.consentCall).toEqual({ kind: "greeting", firstTokenMs: 9_000, totalMs: 9_400 });
    // The 9 second dialog is nowhere near the quick-tier median.
    expect(summary.bands["reply:quick"]).toMatchObject({
      calls: 2,
      firstTokenMedianMs: 1_000,
      firstTokenWorstMs: 1_100,
      fullAnswerMedianMs: 1_400,
      fullAnswerWorstMs: 1_600,
    });
    expect(summary.bands["greeting:quick"]).toBeUndefined();
  });

  it("bands the tiers separately, because they answer different questions", () => {
    call("greeting", "quick", 2, 100, 200);
    call("reply", "quick", 2, 900, 1_000);
    call("reply", "default", 2, 12_000, 24_000);
    call("narrate", "quick", 2, 800, 1_100);

    expect(Object.keys(sampleSummary().bands).sort()).toEqual(["narrate:quick", "reply:default", "reply:quick"]);
  });
});

describe("rung 3 is reported end to end, because that is the story it carries", () => {
  it("bands every rung-3 call whatever its kind", () => {
    call("greeting", "quick", 2, 10, 20);
    call("reply", "default", 3, 20_000, 46_000);
    call("reply", "default", 3, 30_000, 62_000);

    expect(sampleSummary().rung3).toMatchObject({ calls: 2, fullAnswerMedianMs: 54_000, fullAnswerWorstMs: 62_000 });
  });
});

describe("the over-call rate", () => {
  it("counts a tool call and judges it against what the envelope already held", () => {
    const probe = markCall({ kind: "reply", tier: "default", rung: 3 });
    probe.tool("currentBoomRatios", false);
    probe.tool("liveInvolvements", true);
    probe.tool("liveInvolvements", true);
    probe.done();

    const summary = sampleSummary();
    expect(summary.toolCalls).toBe(3);
    expect(summary.overCallRate).toBeCloseTo(2 / 3);
  });

  it("is NULL where no tool was called, rather than a flattering zero", () => {
    call("reply", "quick", 2, 100, 200);
    expect(sampleSummary().overCallRate).toBeNull();
  });
});

describe("a failure is a failure, not slowness", () => {
  it("counts by code and still settles the call", () => {
    const probe = markCall({ kind: "reply", tier: "quick", rung: 2 });
    vi.advanceTimersByTime(300);
    probe.failed("rate_limited");
    expect(sampleSummary().failures).toEqual({ rate_limited: 1 });
    expect(sampleTimings()[0].totalMs).toBe(300);
  });
});

describe("the readout is where a founder can reach it", () => {
  it("hangs the summary and the call log on the window", () => {
    installSampleGateReadout();
    const w = window as unknown as { c360SampleGate?: () => unknown; c360SampleCalls?: () => unknown };
    call("reply", "quick", 2, 100, 200);
    expect(typeof w.c360SampleGate).toBe("function");
    expect(w.c360SampleGate!()).toMatchObject({ toolCalls: 0 });
    expect(Array.isArray(w.c360SampleCalls!())).toBe(true);
  });
});
