// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageAction, executeAction, isExecutionHeld, WRITE_TOOLS } from "../channel/writeTools";

/* =============================================================================
   OBSERVED ENVELOPES (wave 2, 2026-07-26)

   Every payload and every field name below is copied from a request or response
   the org actually accepted. These are the tests that would fail if somebody
   "tidied" a field name back to something plausible-but-wrong.
   ============================================================================= */

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

const envelope = (outputValues: unknown) => ({
  payload: { content: [{ actionName: "t", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
});

function installMcp(outputValues: unknown) {
  const callTool = vi.fn().mockResolvedValue(envelope(outputValues));
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return callTool;
}

const PLAN = {
  ok: true,
  error: null,
  result: { stagingId: "a8abb00001KtvRVAAZ", planHash: "ff5846", decisionToken: "f465a7", summary: "x", warnings: [], steps: [] },
};

describe("the held verdict comes from the ORG, verbatim", () => {
  const HELD_REASON =
    "A credit action requires a Booked, core-keyed facility, and Loan_Validation_06 makes Booked unreachable through the API with no bypass. Reaching it needs nCino's Submit for Approval with real approvers. This plan is staged and persisted so it can be executed once that path exists.";

  it("reads executionHeld and heldReason off the stage result", async () => {
    installMcp({
      ok: true,
      error: null,
      result: { ...PLAN.result, executionHeld: true, heldReason: HELD_REASON, covenantCarryoverCount: 0 },
    });
    const out = await stageAction("loan-modification", {
      idempotencyKey: "k",
      loanId: "a4Zbb000001vavpEAA",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.executionHeld).toBe(true);
    expect(out.result.heldReason).toBe(HELD_REASON);
    expect(out.result.covenantCarryoverCount).toBe(0);
  });

  it("leaves executionHeld false on a plan the org will run", async () => {
    installMcp(PLAN);
    const out = await stageAction("risk-rating-review", { idempotencyKey: "k", accountId: "001X" });
    expect(out.ok && out.result.executionHeld).toBe(false);
  });

  it("agrees with the client tool map on which actions are held", () => {
    expect(isExecutionHeld("loan-modification")).toBe(true);
    expect(isExecutionHeld("renewal")).toBe(true);
    for (const id of ["new-facility-request", "risk-rating-review", "covenant-review"]) {
      expect(isExecutionHeld(id), id).toBe(false);
      expect(WRITE_TOOLS[id as keyof typeof WRITE_TOOLS].execute, id).toBeTruthy();
    }
  });
});

describe("the wave-2 request bodies match what the org accepted", () => {
  const sent = async (actionId: Parameters<typeof stageAction>[0], payload: unknown) => {
    const callTool = installMcp(PLAN);
    await stageAction(actionId, payload as never);
    return (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
  };

  it("anchors a new facility on the PACKAGE and names the product field `product`", async () => {
    const body = await sent("new-facility-request", {
      idempotencyKey: "zz",
      productPackageId: "a5Fbb000000IGZNEA4",
      product: "Term",
      amount: 750000,
      termMonths: 60,
      primaryLoanPurpose: "business_expansion",
    });
    expect(Object.keys(body).sort()).toEqual(["amount", "idempotencyKey", "primaryLoanPurpose", "product", "productPackageId", "termMonths"]);
    // The observed request carries no accountId: the package is the anchor.
    expect(body.accountId).toBeUndefined();
    expect(body.productType).toBeUndefined();
  });

  it("sends the four named risk factor actuals, not a map", async () => {
    const body = await sent("risk-rating-review", {
      idempotencyKey: "zz",
      accountId: "001bb00001I6PfJAAV",
      computedRiskGradeValue: 6,
      cashFlowCoverageActual: 1.35,
      revenueGrowthActual: 4.2,
      managementExperienceActual: 12,
      creditScoreActual: 710,
      comments: "x",
    });
    for (const k of ["cashFlowCoverageActual", "revenueGrowthActual", "managementExperienceActual", "creditScoreActual"]) {
      expect(body, k).toHaveProperty(k);
    }
    expect(body.factorScores).toBeUndefined();
  });

  it("sends the covenant compliance id and the observed value as a STRING", async () => {
    const body = await sent("covenant-review", {
      idempotencyKey: "zz",
      accountId: "001bb00000O40U8AAJ",
      covenantComplianceId: "a3Cbb00000DzjdREAR",
      result: "Compliant",
      observedValue: "1.42",
      narrative: "x",
    });
    expect(body.covenantComplianceId).toBe("a3Cbb00000DzjdREAR");
    expect(typeof body.observedValue).toBe("string");
    expect(body.complianceId).toBeUndefined();
  });

  it("names the modification's amount `requestedAmount`", async () => {
    const body = await sent("loan-modification", {
      idempotencyKey: "zz",
      loanId: "a4Zbb000001vavpEAA",
      productPackageId: "a5Fbb000000HA1NEAW",
      requestedAmount: 6000000,
      requestedTermMonths: 36,
      requestedRate: 7.25,
    });
    expect(body.requestedAmount).toBe(6000000);
    expect(body.newCommitment).toBeUndefined();
  });

  it("sends a renewal's maturity and rate, and no commitment", async () => {
    const body = await sent("renewal", {
      idempotencyKey: "zz",
      loanId: "a4Zbb000001vavpEAA",
      newMaturityDate: "2028-07-15",
      requestedRate: 7.5,
    });
    expect(body.newMaturityDate).toBe("2028-07-15");
    expect(body.newCommitment).toBeUndefined();
  });
});

describe("the two-phase execute (new facility) — VERIFIED live 2026-07-26", () => {
  const RESUME_PAYLOAD = {
    idempotencyKey: "zz-verifyb-20260726-newfacility",
    stagingId: "a8abb00001Ktj4gAAB",
    planHash: "40c9630ae3796547241638b8a146569f3bcf831ac39f020c307d1e28776b6118",
    decisionToken: "22f825ad70a83f1f1ffa2358b88820c3d8a7448af6db1f902f57c840c1e5e000",
    approverUserId: "005bb00000ftouDAAQ",
  };

  /** Invocation 1, verbatim: the loan is written and the org is still working. */
  const PHASE_1 = {
    ok: true,
    error: null,
    result: {
      stagingId: "a8abb00001Ktj4gAAB",
      terminalState: "partial",
      stage: "Qualification",
      resumable: true,
      resumeDescriptor:
        "Continue this action to verify the Loan Detail and complete the move to Proposal. No new confirmation is needed: the same plan is still running.",
      replayed: false,
      loanId: "a4Zbb0000027KdZEAU",
      loanDetailId: null,
      recordName: "ZZ-VERIFY-20260726B DO NOT USE - Term - $750,000.00",
      anchorName: "ZZ-VERIFY-20260726B DO NOT USE - 7/25/2026 - PP",
      outcome: "Facility filed at Qualification.",
      steps: [
        { id: "write_loan", type: "write", label: "Create the facility", state: "verified", detail: "Facility a4Zbb0000027KdZEAU created at Qualification." },
        { id: "verify_loan", type: "verification", label: "Verify", state: "verified" },
        {
          id: "wait_loan_detail",
          type: "wait",
          label: "Wait for the Loan Detail",
          state: "waiting",
          detail: "nCino creates the Loan Detail moments after this filing, in a separate transaction. It cannot be seen from here.",
        },
        { id: "write_loan_purpose", type: "write", label: "Write the purpose", state: "pending" },
        { id: "hop_to_proposal", type: "write", label: "Move to Proposal", state: "pending" },
        { id: "verify_hop", type: "verification", label: "Verify the hop", state: "pending" },
        { id: "observe_loan_officer", type: "observed_side_effect", label: "Loan officer", state: "pending" },
      ],
    },
  };

  /** Invocation 2, verbatim: the org finished and the plan completed. */
  const PHASE_2 = {
    ok: true,
    error: null,
    result: {
      ...PHASE_1.result,
      terminalState: "success",
      stage: "Proposal",
      resumable: false,
      resumeDescriptor: null,
      loanDetailId: "a4Wbb000001Gi1JEAS",
      anchorName: null,
      steps: [
        { id: "write_loan", type: "write", label: "Create the facility", state: "verified" },
        { id: "verify_loan", type: "verification", label: "Verify", state: "verified" },
        { id: "wait_loan_detail", type: "wait", label: "Wait for the Loan Detail", state: "verified", detail: "nCino created Loan Detail a4Wbb000001Gi1JEAS." },
        { id: "write_loan_purpose", type: "write", label: "Write the purpose", state: "verified", detail: "Primary loan purpose set to business_expansion." },
        { id: "hop_to_proposal", type: "write", label: "Move to Proposal", state: "verified", detail: "Stage moved from Qualification to Proposal." },
        { id: "verify_hop", type: "verification", label: "Verify the hop", state: "verified", detail: "Facility reads back at stage Proposal." },
        {
          id: "observe_loan_officer",
          type: "observed_side_effect",
          label: "Loan officer",
          state: "filed_unverified",
          detail: "The loan officer was assigned by org automation from the account owner. This tool did not set it.",
        },
      ],
    },
  };

  it("reads the waiting phase as resumable, not as a failure", async () => {
    installMcp(PHASE_1);
    const out = await executeAction("new-facility-request", RESUME_PAYLOAD);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.resumable).toBe(true);
    expect(out.result.terminalState).toBe("partial");
    expect(out.result.stage).toBe("Qualification");
    // The loan EXISTS from invocation 1 onward, whatever happens next.
    expect(out.result.loanId).toBe("a4Zbb0000027KdZEAU");
    expect(out.result.loanDetailId).toBeUndefined();
    expect(out.result.resumeDescriptor).toContain("No new confirmation is needed");
  });

  it("RESENDS THE STAGE TOKEN on the resume: the wire requires it even though Apex ignores it", async () => {
    const callTool = installMcp(PHASE_2);
    await executeAction("new-facility-request", RESUME_PAYLOAD);
    const body = (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
    // Five fields on the resume, exactly as on invocation 1. A null or omitted
    // decisionToken is rejected by the PLATFORM with REQUIRED_FIELD_MISSING,
    // before Apex runs, so it is sent even though the resume path never reads it.
    expect(body).toEqual(RESUME_PAYLOAD);
    expect(body.decisionToken).toBe(RESUME_PAYLOAD.decisionToken);
    expect(String(body.decisionToken)).not.toBe("");
  });

  it("completes on the second call, with the org's own words on every step", async () => {
    installMcp(PHASE_2);
    const out = await executeAction("new-facility-request", RESUME_PAYLOAD);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.terminalState).toBe("success");
    expect(out.result.resumable).toBe(false);
    expect(out.result.stage).toBe("Proposal");
    expect(out.result.loanDetailId).toBe("a4Wbb000001Gi1JEAS");
    const officer = out.result.steps.find((s) => s.id === "observe_loan_officer")!;
    // The org assigned it, and the tool says so rather than claiming the work.
    expect(officer.state).toBe("filed_unverified");
    expect(officer.detail).toContain("This tool did not set it");
  });

  it("keeps the org-assigned name, never one the panel proposed", async () => {
    installMcp(PHASE_1);
    const out = await executeAction("new-facility-request", RESUME_PAYLOAD);
    expect(out.ok && out.result.recordName).toBe("ZZ-VERIFY-20260726B DO NOT USE - Term - $750,000.00");
  });

  it("is idempotent: a third identical call replays and creates nothing", async () => {
    installMcp({ ...PHASE_2, result: { ...PHASE_2.result, replayed: true } });
    const out = await executeAction("new-facility-request", RESUME_PAYLOAD);
    expect(out.ok && out.result.replayed).toBe(true);
    expect(out.ok && out.result.loanId).toBe("a4Zbb0000027KdZEAU");
  });
});
