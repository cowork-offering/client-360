import { describe, expect, it, vi } from "vitest";
import type { ActionHistoryRow } from "../../data/contract";
import { awaitFiling, POLL_BUDGET_MS, POLL_EVERY_MS, type SettleDeps } from "./settleExecution";

/* =============================================================================
   THE WAIT, ON ITS OWN.

   Its whole job is to be sure BEFORE it says the run is over. The fact it stands
   on is measured against the live org (bankinggpt-at, 2026-09-03): `cm_Status__c`
   reads Executing from the moment the decision token is consumed and STAYS
   Executing across the engine hop's interim write. Only Completed, Partial and
   Failed mean the run is finished.
   ============================================================================= */

const ACCOUNT = "001bb00001I7FPNAA3";
const STAGING = "a8abb00001O2gwGAAR";

const row = (status: string): ActionHistoryRow => ({ stagingId: STAGING, status });

function harness(over: Partial<SettleDeps> = {}): SettleDeps {
  let clock = 0;
  return {
    readState: vi.fn().mockResolvedValue(undefined),
    wait: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    ...over,
  };
}

const wait = (deps: SettleDeps) => awaitFiling(ACCOUNT, STAGING, deps);

describe("waiting out a filing whose answer was lost", () => {
  it("reports the run over once the staging row goes terminal", async () => {
    const readState = vi.fn().mockResolvedValueOnce(row("Executing")).mockResolvedValue(row("Completed"));
    await expect(wait(harness({ readState }))).resolves.toEqual({ kind: "terminal", status: "Completed" });
    expect(readState).toHaveBeenCalledTimes(2);
    expect(readState).toHaveBeenLastCalledWith(ACCOUNT, STAGING);
  });

  it("counts Partial as over: the founder's own run ended Partial and had filed everything", async () => {
    // Two steps of that plan carried `filed_unverified` — a carry the tool would
    // not claim by count, and an observed side effect that can never be verified
    // — which is what makes a terminal state partial rather than failed.
    await expect(wait(harness({ readState: vi.fn().mockResolvedValue(row("Partial")) }))).resolves.toEqual({
      kind: "terminal",
      status: "Partial",
    });
  });

  it("NEVER settles on Executing, which is where consuming the token leaves it", async () => {
    await expect(wait(harness({ readState: vi.fn().mockResolvedValue(row("Executing")) }))).resolves.toEqual({
      kind: "unsettled",
    });
  });

  it("ends the wait on Staged twice running: the token was never redeemed", async () => {
    const readState = vi.fn().mockResolvedValue(row("Staged"));
    await expect(wait(harness({ readState }))).resolves.toEqual({ kind: "never-ran" });
    expect(readState).toHaveBeenCalledTimes(2);
  });

  it("does NOT believe one Staged: that is where a real dispatch sits mid-flight", async () => {
    // Between the outer leg's callout and the inner leg claiming the token the
    // row still reads Staged. A single read there would call a live filing dead.
    const readState = vi.fn().mockResolvedValueOnce(row("Staged")).mockResolvedValue(row("Executing"));
    await expect(wait(harness({ readState }))).resolves.toEqual({ kind: "unsettled" });
  });

  it("carries a terminal Failed back as itself, for the room to say in its own words", async () => {
    await expect(wait(harness({ readState: vi.fn().mockResolvedValue(row("Failed")) }))).resolves.toEqual({
      kind: "terminal",
      status: "Failed",
    });
  });

  it("spends its whole budget and no more", async () => {
    const readState = vi.fn().mockResolvedValue(undefined);
    await wait(harness({ readState }));
    expect(readState).toHaveBeenCalledTimes(POLL_BUDGET_MS / POLL_EVERY_MS);
  });

  it("waits BEFORE the first read: the answer was lost a moment ago, not a minute", async () => {
    const order: string[] = [];
    const deps = harness({
      wait: async () => {
        order.push("wait");
      },
      readState: vi.fn(async () => {
        order.push("read");
        return row("Completed");
      }),
      // Frozen: the loop would never end if the first read did not settle it.
      now: () => 0,
    });
    await wait(deps);
    expect(order).toEqual(["wait", "read"]);
  });

  it("treats an unreadable trail as silence, not as evidence about a filing", async () => {
    const readState = vi
      .fn()
      .mockRejectedValueOnce({ code: "upstream_error" })
      .mockRejectedValueOnce({ code: "rate_limited" })
      .mockResolvedValue(row("Completed"));
    await expect(wait(harness({ readState }))).resolves.toMatchObject({ kind: "terminal" });
  });

  it("treats a row that is not on the trail yet as silence too", async () => {
    // The staging store is Private to the acting banker, and a row that has not
    // committed is a row nobody can see. Neither is a verdict.
    const readState = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(row("Completed"));
    await expect(wait(harness({ readState }))).resolves.toMatchObject({ kind: "terminal" });
  });
});
