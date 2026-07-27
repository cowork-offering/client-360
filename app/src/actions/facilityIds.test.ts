// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageAction } from "../channel/writeTools";
import { assertNoRecordIds } from "./stagedPlan";
import OBSERVED from "./observed-facilityIds-envelopes.json";

/* =============================================================================
   PACKAGE-ANCHORED CREDIT ACTIONS — `facilityIds`, observed live 2026-07-27.

   Every envelope below is READ OUT OF the archived observation file, byte for
   byte: `observed-facilityIds-envelopes.json` is a verbatim copy of
   sf-build-v2/wp2/observed-envelopes-facilityIds.json, captured against the
   Hartwell package a5Fbb000000IHFJEA4. Nothing here is hand-written, because a
   hand-written envelope is a guess about the wire and this campaign has already
   paid for two of those.
   ============================================================================= */

type Invocable = { outputValues: { ok: boolean; result: Record<string, unknown> } };
const observed = OBSERVED as unknown as Record<string, Invocable[]>;

/** The `outputValues` slot of a named observation, exactly as the org sent it. */
const outputs = (key: string) => observed[key][0].outputValues;

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

function installMcp(outputValues: unknown) {
  const callTool = vi.fn().mockResolvedValue({
    payload: { content: [{ actionName: "t", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
  });
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return callTool;
}

const bodyOf = (callTool: ReturnType<typeof installMcp>) =>
  (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];

describe("the request names the facilities the way the tool accepts them", () => {
  it("sends `facilityIds` for several, and NEVER a loanId alongside it", async () => {
    const callTool = installMcp(outputs("package_anchored_modification_multi"));
    await stageAction("loan-modification", {
      idempotencyKey: "k",
      facilityIds: ["a4Zbb0000027MaYEAU", "a4Zbb0000027Mp3EAE"],
      productPackageId: "a5Fbb000000IHFJEA4",
      requestedAmount: 20_000_000,
    });
    const body = bodyOf(callTool);
    expect(body.facilityIds).toEqual(["a4Zbb0000027MaYEAU", "a4Zbb0000027Mp3EAE"]);
    // Mixing the two shapes is refused by the tool. The union type makes it a
    // compile error; this makes it a test failure too.
    expect("loanId" in body).toBe(false);
  });

  it("sends the flat `loanId` for one, and NEVER an empty facilityIds", async () => {
    const callTool = installMcp(outputs("modification_flat_backcompat"));
    await stageAction("renewal", {
      idempotencyKey: "k",
      loanId: "a4Zbb0000027MaYEAU",
      productPackageId: "a5Fbb000000IHFJEA4",
      newMaturityDate: "2028-07-15",
    });
    const body = bodyOf(callTool);
    expect(body.loanId).toBe("a4Zbb0000027MaYEAU");
    expect("facilityIds" in body).toBe(false);
  });
});

describe("the plan that comes back is read per facility", () => {
  it("carries one row per facility, each with its own steps and carryover", async () => {
    installMcp(outputs("package_anchored_modification_multi"));
    const out = await stageAction("loan-modification", {
      idempotencyKey: "k",
      facilityIds: ["a4Zbb0000027MaYEAU", "a4Zbb0000027Mp3EAE"],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.result.facilityCount).toBe(2);
    expect(out.result.facilities).toEqual([
      {
        facilityId: "a4Zbb0000027MaYEAU",
        facilityName: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00",
        creditActionStepId: "credit_action_0",
        verifyStepId: "verify_clone_0",
        applyStepId: "apply_changes_0",
        covenantCarryoverCount: 1,
      },
      {
        facilityId: "a4Zbb0000027Mp3EAE",
        facilityName: "Hartwell Precision Manufacturing LLC - Construction - $12,000,000.00",
        creditActionStepId: "credit_action_1",
        verifyStepId: "verify_clone_1",
        applyStepId: "apply_changes_1",
        covenantCarryoverCount: 1,
      },
    ]);
  });

  it("is ONE plan: one hash, one token, one staging row over both facilities", async () => {
    installMcp(outputs("package_anchored_modification_multi"));
    const out = await stageAction("loan-modification", { idempotencyKey: "k", facilityIds: ["a", "b"] });
    if (!out.ok) return;
    expect(out.result.planHash).toBe("e7c56fb8e9dc46127cd7ded443ebac2b34502a486c63e5701cd64d5a37edf52d");
    expect(out.result.decisionToken).toBe("4ff2bdc34b855bc059ee32aea036ab362e72a86b9e0edf5d55cd986d837bcfdb");
    expect(out.result.stagingId).toBe("a8abb00001KyVHvAAN");
    // Eight steps: three per facility, plus the side-effect and handoff rows.
    expect(out.result.steps).toHaveLength(8);
    // The batch total, alongside the per-facility ones.
    expect(out.result.covenantCarryoverCount).toBe(2);
  });

  it("surfaces the org's own HELD verdict rather than restating it", async () => {
    installMcp(outputs("package_anchored_modification_multi"));
    const out = await stageAction("loan-modification", { idempotencyKey: "k", facilityIds: ["a", "b"] });
    if (!out.ok) return;
    expect(out.result.executionHeld).toBe(true);
    expect(out.result.heldReason).toBe(outputs("package_anchored_modification_multi").result.heldReason);
    expect(out.result.heldReason).toContain("Loan_Validation_06");
  });

  it("carries the renewal's Opportunity warning, verbatim and in order", async () => {
    installMcp(outputs("package_anchored_renewal"));
    const out = await stageAction("renewal", { idempotencyKey: "k", facilityIds: ["a4Zbb0000027MaYEAU"] });
    if (!out.ok) return;
    expect(out.result.warnings).toEqual(outputs("package_anchored_renewal").result.warnings);
    expect(out.result.warnings).toContain(
      "A renewal auto-creates a new Opportunity and is effectively irreversible once run.",
    );
    expect(out.result.facilityCount).toBe(1);
  });

  it("reads the flat back-compat plan exactly as before, facilities row included", async () => {
    installMcp(outputs("modification_flat_backcompat"));
    const out = await stageAction("loan-modification", { idempotencyKey: "k", loanId: "a4Zbb0000027MaYEAU" });
    if (!out.ok) return;
    // The org returns the SAME hash for the flat call and for the flat call
    // with an empty list, which is what "byte-identical behaviour" means here.
    expect(out.result.planHash).toBe(outputs("modification_flat_with_empty_list").result.planHash);
    expect(out.result.facilityCount).toBe(1);
    expect(out.result.facilities).toHaveLength(1);
    expect(out.result.steps).toHaveLength(5);
  });

  it("does not read a named booked facility as proof that something was written", async () => {
    installMcp(outputs("package_anchored_modification_multi"));
    const out = await stageAction("loan-modification", { idempotencyKey: "k", facilityIds: ["a", "b"] });
    if (!out.ok) return;
    // A33.5.3: the facility ids are pre-existing loans the plan is AIMED at.
    // Flagging them would block every real package-anchored plan.
    expect(assertNoRecordIds(out.result)).toEqual([]);
  });
});

describe("a refusal reaches the banker in the tool's own words", () => {
  /* The refusal ENVELOPE SHAPE is the deployed Apex contract (VALIDATION_FAILED
     with message / idempotencyKey / resumable / orgError). The message below is
     the VERBATIM live refusal observed on the wire 2026-07-27 (mixed-shapes case,
     archived in observed-facilityIds-envelopes.json as
     modification_refusal_mixed_shapes). The test still asserts pass-through:
     whatever the tool says arrives unedited. */
  const SENTINEL =
    "Supply either the single loanId or facilityIds, but not both. Two shapes in one request is two intentions, and guessing which one wins would stage a modification against facilities the banker did not choose.";

  it("passes VALIDATION_FAILED through without paraphrase", async () => {
    installMcp({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: SENTINEL,
        idempotencyKey: "k",
        resumable: false,
        orgError: "SENTINEL: the org's raw error.",
      },
      result: null,
    });
    const out = await stageAction("loan-modification", { idempotencyKey: "k", facilityIds: ["a", "a"] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("VALIDATION_FAILED");
    expect(out.error.message).toBe(SENTINEL);
    expect(out.error.orgError).toBe("SENTINEL: the org's raw error.");
    expect(out.error.resumable).toBe(false);
  });
});
