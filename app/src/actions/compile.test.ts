import { describe, expect, it, vi } from "vitest";
import { compilePace, COMPILE_PACE, isDomainFailure, runCompile, type CompileLine } from "./compile";

/** Record every emitted frame so the ORDER can be asserted, not just the end. */
function recorder() {
  const frames: string[][] = [];
  return { frames, onLines: (lines: CompileLine[]) => frames.push(lines.map((l) => `${l.id}:${l.state}`)) };
}

const ops = (...ids: string[]) => ids.map((id) => ({ id, label: id, run: () => {} }));

describe("the sequence is bound to the work", () => {
  it("runs the operations in order and ticks each only after its own returns", async () => {
    const ran: string[] = [];
    const r = recorder();
    const outcome = await runCompile(
      [
        { id: "a", label: "A", run: async () => void ran.push("a") },
        { id: "b", label: "B", run: async () => void ran.push("b") },
        { id: "c", label: "C", run: async () => void ran.push("c") },
      ],
      { minPace: 0, onLines: r.onLines, sleep: () => Promise.resolve() },
    );

    expect(outcome).toEqual({ ok: true });
    expect(ran).toEqual(["a", "b", "c"]);
    // No frame ever shows a line done before the line before it is done.
    for (const frame of r.frames) {
      const states = frame.map((f) => f.split(":")[1]);
      const lastDone = states.lastIndexOf("done");
      for (let i = 0; i < lastDone; i++) expect(states[i]).toBe("done");
    }
  });

  it("never ticks a line while its operation is still in flight", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    let doneWhileGated = false;

    const run = runCompile(
      [
        { id: "slow", label: "Slow", run: () => gate },
        { id: "after", label: "After", run: () => {} },
      ],
      {
        minPace: 0,
        sleep: () => Promise.resolve(),
        onLines: (lines) => {
          if (release && lines.find((l) => l.id === "slow")?.state === "done") doneWhileGated = true;
        },
      },
    );

    await Promise.resolve();
    expect(doneWhileGated).toBe(false);
    release!();
    release = null;
    await run;
    expect(doneWhileGated).toBe(false);
  });

  it("holds a fast line for the pacing floor without capping a slow one", async () => {
    const waits: number[] = [];
    const sleep = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    await runCompile(ops("a", "b"), { minPace: COMPILE_PACE, sleep });
    expect(waits).toEqual([COMPILE_PACE, COMPILE_PACE]);

    // The floor is a minimum, never a timeout: a slow op still completes.
    let finished = false;
    await runCompile([{ id: "s", label: "S", run: async () => void (finished = true) }], { minPace: COMPILE_PACE, sleep });
    expect(finished).toBe(true);
  });
});

describe("a failure stops the sequence on its own line", () => {
  it("marks the failing line and leaves the rest never-started", async () => {
    const ran: string[] = [];
    const r = recorder();
    const outcome = await runCompile(
      [
        { id: "a", label: "A", run: () => void ran.push("a") },
        { id: "b", label: "B", run: () => { throw { code: "VALIDATION_FAILED", message: "the org refused it" }; } },
        { id: "c", label: "C", run: () => void ran.push("c") },
      ],
      { minPace: 0, onLines: r.onLines, sleep: () => Promise.resolve() },
    );

    expect(outcome).toEqual({ ok: false, failedId: "b", error: { code: "VALIDATION_FAILED", message: "the org refused it" } });
    expect(ran).toEqual(["a"]); // c never ran
    expect(r.frames.at(-1)).toEqual(["a:done", "b:failed", "c:pending"]);
  });

  it("renders the typed error on the line rather than somewhere else", async () => {
    const r = recorder();
    let last: CompileLine[] = [];
    await runCompile(
      [{ id: "x", label: "X", run: () => { throw { code: "VALIDATION_FAILED", message: "Type is not a legal value", orgError: "FIELD_INTEGRITY_EXCEPTION" }; } }],
      { minPace: 0, sleep: () => Promise.resolve(), onLines: (l) => { r.onLines(l); last = l; } },
    );
    expect(last[0].detail).toBe("Type is not a legal value");
    expect(last[0].error?.orgError).toBe("FIELD_INTEGRITY_EXCEPTION");
  });

  it("offers a retry for a transport failure and none for a domain refusal", async () => {
    let transport: CompileLine[] = [];
    await runCompile([{ id: "t", label: "T", run: () => { throw new Error("socket closed"); } }], {
      minPace: 0,
      sleep: () => Promise.resolve(),
      onLines: (l) => (transport = l),
    });
    expect(transport[0].retryable).toBe(true);
    expect(transport[0].error?.code).toBe("TRANSPORT");

    let domain: CompileLine[] = [];
    await runCompile([{ id: "d", label: "D", run: () => { throw { code: "blocked_by_policy", message: "no" }; } }], {
      minPace: 0,
      sleep: () => Promise.resolve(),
      onLines: (l) => (domain = l),
    });
    expect(domain[0].retryable).toBe(false);
  });

  it("classifies the codes the org actually returns", () => {
    for (const code of ["VALIDATION_FAILED", "PRECONDITION", "NOT_STAGEABLE", "blocked_by_policy", "bad_request"]) {
      expect(isDomainFailure({ code, message: "" }), code).toBe(true);
    }
    for (const code of ["TRANSPORT", "rate_limited", "upstream_error", "server_unavailable"]) {
      expect(isDomainFailure({ code, message: "" }), code).toBe(false);
    }
  });
});

describe("reduced motion collapses the pacing", () => {
  it("drops the floor to zero, so the lines resolve as fast as the work", () => {
    expect(compilePace(true)).toBe(0);
    expect(compilePace(false)).toBe(COMPILE_PACE);
  });

  it("waits for nothing when the floor is zero", async () => {
    const waited: number[] = [];
    const sleep = vi.fn((ms: number) => {
      waited.push(ms);
      return Promise.resolve();
    });
    await runCompile(ops("a", "b", "c"), { minPace: 0, sleep });
    expect(waited).toEqual([0, 0, 0]);
  });
});
