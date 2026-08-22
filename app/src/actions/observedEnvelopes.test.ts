// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageAction, executeAction, executionHeldReason, isExecutionHeld, WRITE_TOOLS } from "../channel/writeTools";
import observedModEnvelopes from "./observed-execute-loan-modification-envelopes.json";

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
    expect(isExecutionHeld("renewal")).toBe(true);
    // The covenant execute tool EXISTS, but the client refuses to be the thing
    // that fires its unapproved first production write.
    expect(isExecutionHeld("covenant-review")).toBe(true);
    expect(executionHeldReason("covenant-review")).toContain("founder-gated");
    // The modification is no longer held CLIENT-side (WS0.5, 2026-08-22). The
    // org's own flag above is the only thing that can hold it now.
    expect(isExecutionHeld("loan-modification")).toBe(false);
    expect(executionHeldReason("loan-modification")).toBeNull();
    for (const id of ["new-facility-request", "risk-rating-review", "loan-modification"]) {
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

  it("OMITS the package id when the relationship has none (wave 2.1)", async () => {
    const body = await sent("new-facility-request", {
      idempotencyKey: "zz",
      product: "Term",
      amount: 750000,
      primaryLoanPurpose: "business_expansion",
    });
    // The KEY IS ABSENT, not null: an omitted key asks the org to create the
    // package first; a null would be a claim about a package that does not
    // exist. The plan then opens with the org's own create_package step.
    expect("productPackageId" in body).toBe(false);
    expect(body.product).toBe("Term");
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

describe("Codex review fixes, pinned against the envelopes", () => {
  const sent = async (actionId: Parameters<typeof stageAction>[0], payload: unknown) => {
    const callTool = installMcp(PLAN);
    await stageAction(actionId, payload as never);
    return (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
  };

  it("#1 never sends an override field whose wire name has not been observed", async () => {
    const body = await sent("risk-rating-review", {
      idempotencyKey: "k",
      accountId: "001X",
      rationale: "r",
      comments: "why",
    });
    expect(body.overriddenRiskGradeValue).toBeUndefined();
    expect(Object.keys(body).some((k) => /override/i.test(k))).toBe(false);
  });

  it("#7 never sends the covenant observed value: it is context, not an input", async () => {
    const body = await sent("covenant-review", {
      idempotencyKey: "k",
      accountId: "001X",
      covenantComplianceId: "a3C",
      result: "Compliant",
      rationale: "r",
    });
    expect(body.observedValue).toBeUndefined();
  });

  it("#8 sends the service request origin the schema advertises", async () => {
    const body = await sent("create-service-request", {
      idempotencyKey: "k",
      accountId: "001X",
      rationale: "r",
      requestType: "Service Request",
      origin: "Agent",
      summary: "s",
    });
    expect(body.origin).toBe("Agent");
  });

  it("#9 parses the status the execute response returns", async () => {
    installMcp({
      ok: true,
      error: null,
      result: { stagingId: "a8a", terminalState: "success", status: "In Review", recordName: "RG-0000002", steps: [] },
    });
    const out = await executeAction("risk-rating-review", {
      idempotencyKey: "k",
      stagingId: "a8a",
      planHash: "h",
      decisionToken: "t",
      approverUserId: "005bb00000ftouDAAQ",
    });
    expect(out.ok && out.result.status).toBe("In Review");
  });

  it("#12 parses the wait budget the plan returns", async () => {
    installMcp({
      ok: true,
      error: null,
      result: {
        ...PLAN.result,
        steps: [{ id: "wait_loan_detail", type: "wait", label: "Wait", state: "pending", waitBudgetMs: 30000 }],
      },
    });
    const out = await stageAction("new-facility-request", { idempotencyKey: "k", productPackageId: "a5F" });
    expect(out.ok && out.result.steps[0].waitBudgetMs).toBe(30000);
  });

  it("#2 refuses to execute the founder-gated covenant review, with its own reason", async () => {
    const callTool = installMcp(PLAN);
    const out = await executeAction("covenant-review", {
      idempotencyKey: "k",
      stagingId: "a8a",
      planHash: "h",
      decisionToken: "t",
      approverUserId: "005bb00000ftouDAAQ",
    });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error.code).toBe("EXECUTION_HELD");
    expect(out.ok === false && out.error.message).toContain("founder-gated");
    // Not one call left the page.
    expect(callTool).not.toHaveBeenCalled();
  });
});


describe("package-first new facility (VERIFIED live 2026-07-26)", () => {
  const sent = async (payload: unknown) => {
    const callTool = installMcp(PLAN);
    await stageAction("new-facility-request", payload as never);
    return (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
  };

  it("sends the ACCOUNT as the anchor when there is no package, and no package key", async () => {
    const body = await sent({
      idempotencyKey: "fable-pkgfirst-20260726-001",
      rationale: "r",
      accountId: "001bb00001I7HKgAAN",
      product: "Equipment",
      amount: 500000,
      termMonths: 36,
      primaryLoanPurpose: "business_expansion",
    });
    expect(Object.keys(body).sort()).toEqual([
      "accountId",
      "amount",
      "idempotencyKey",
      "primaryLoanPurpose",
      "product",
      "rationale",
      "termMonths",
    ]);
    expect("productPackageId" in body).toBe(false);
  });

  it("names the purpose field primaryLoanPurpose: omitting it is REQUIRED_FIELD_MISSING", async () => {
    const body = await sent({ idempotencyKey: "k", accountId: "001X", primaryLoanPurpose: "business_expansion" });
    expect(body.primaryLoanPurpose).toBe("business_expansion");
    expect(body.purpose).toBeUndefined();
  });

  it("reads the planned package name and the createsPackage flag off the plan", async () => {
    installMcp({
      ok: true,
      error: null,
      result: {
        ...PLAN.result,
        createsPackage: true,
        plannedPackageName: "ZZ-FABLE-VERIFY-20260726 DO NOT USE - 7/26/2026 - PP",
        productPackageId: null,
      },
    });
    const out = await stageAction("new-facility-request", { idempotencyKey: "k", accountId: "001X" });
    expect(out.ok && out.result.createsPackage).toBe(true);
    expect(out.ok && out.result.plannedPackageName).toContain("- PP");
  });

  it("reads the created package and the borrowing-structure row off the execute result", async () => {
    installMcp({
      ok: true,
      error: null,
      result: {
        stagingId: "s",
        terminalState: "partial",
        resumable: true,
        stage: "Qualification",
        loanId: "a4Zbb0000027MaXEAU",
        recordName: "ZZ - Equipment - $500,000.00",
        anchorName: "ZZ-FABLE-VERIFY-20260726 DO NOT USE - 7/26/2026 - PP",
        productPackageId: "a5Fbb000000IH1XEAW",
        packageCreated: true,
        involvementId: "a4Lbb000000NJ6nEAG",
        steps: [
          { id: "create_package", type: "write", label: "Create the package", state: "verified" },
          { id: "write_involvement", type: "write", label: "Add the borrower", state: "verified" },
          { id: "wait_loan_detail", type: "wait", label: "Wait", state: "waiting" },
        ],
      },
    });
    const out = await executeAction("new-facility-request", {
      idempotencyKey: "k",
      stagingId: "s",
      planHash: "h",
      decisionToken: "t",
      approverUserId: "005bb00000ftouDAAQ",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The observed field is productPackageId, not packageId.
    expect(out.result.productPackageId).toBe("a5Fbb000000IH1XEAW");
    expect(out.result.packageCreated).toBe(true);
    expect(out.result.involvementId).toBe("a4Lbb000000NJ6nEAG");
    expect(out.result.steps.map((s) => s.id)).toContain("write_involvement");
  });

  it("carries the nine-step plan shape the org returned", async () => {
    const ids = [
      "create_package",
      "write_loan",
      "write_involvement",
      "verify_loan",
      "wait_loan_detail",
      "write_loan_purpose",
      "hop_to_proposal",
      "verify_hop",
      "observe_loan_officer",
    ];
    installMcp({
      ok: true,
      error: null,
      result: { ...PLAN.result, steps: ids.map((id) => ({ id, type: "write", label: id, state: "pending" })) },
    });
    const out = await stageAction("new-facility-request", { idempotencyKey: "k", accountId: "001X" });
    expect(out.ok && out.result.steps.map((s) => s.id)).toEqual(ids);
  });
});


describe("bulk collateral valuation (OBSERVED live 2026-07-27)", () => {
  const sent = async (values: Record<string, unknown>) => {
    const callTool = installMcp(PLAN);
    await stageAction("collateral-valuation", values as never);
    return (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
  };

  it("sends items[] ONLY, with no flat collateralId or value", async () => {
    const body = await sent({
      idempotencyKey: "observe-bulk-20260727-002",
      rationale: "r",
      items: [
        { collateralId: "a35bb0000013xz3AAA", value: 12_000_000, valuationDate: "2026-07-27", type: "Net Orderly Liquidation Value", source: "Receivables Aging", description: "d", primary: false },
      ],
    });
    expect(Object.keys(body).sort()).toEqual(["idempotencyKey", "items", "rationale"]);
    // Mixing flat fields with items[] is REFUSED by the tool.
    expect(body.collateralId).toBeUndefined();
    expect(body.value).toBeUndefined();
  });

  it("carries the observed per-item keys", async () => {
    const body = await sent({
      idempotencyKey: "k",
      items: [{ collateralId: "C1", value: 1, valuationDate: "2026-07-27", type: "T", source: "S", description: "d", primary: false }],
    });
    expect(Object.keys((body.items as Array<Record<string, unknown>>)[0]).sort()).toEqual([
      "collateralId",
      "description",
      "primary",
      "source",
      "type",
      "valuationDate",
      "value",
    ]);
  });

  it("reads the per-item plan the tool returns", async () => {
    installMcp({
      ok: true,
      error: null,
      result: {
        ...PLAN.result,
        itemCount: 2,
        productPackageId: "a5Fbb000000IHFJEA4",
        items: [
          { collateralId: "a35bb0000013xz3AAA", collateralName: "COL-000762", value: 12_000_000, writeStepId: "write_valuation_0", verifyStepId: "verify_valuation_0", rollupStepId: "verify_rollup_0" },
          { collateralId: "a35bb0000013y0fAAA", collateralName: "COL-000763", value: 8_000_000, writeStepId: "write_valuation_1", verifyStepId: "verify_valuation_1", rollupStepId: "verify_rollup_1" },
        ],
      },
    });
    const out = await stageAction("collateral-valuation", { idempotencyKey: "k", items: [] } as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.itemCount).toBe(2);
    expect(out.result.items?.map((i) => i.collateralName)).toEqual(["COL-000762", "COL-000763"]);
    expect(out.result.items?.[1].rollupStepId).toBe("verify_rollup_1");
    // The tool resolves the package itself; the panel never guesses it.
    expect(out.result.productPackageId).toBe("a5Fbb000000IHFJEA4");
  });

  it("keeps ONE token for the whole batch: the execute payload is unchanged", async () => {
    const callTool = installMcp({
      ok: true,
      error: null,
      result: { stagingId: "s", terminalState: "success", steps: [], items: [] },
    });
    const payload = {
      idempotencyKey: "observe-bulk-20260727-002",
      stagingId: "a8abb00001KvCOBAA3",
      planHash: "6a4331a4",
      decisionToken: "tok",
      approverUserId: "005bb00000ftouDAAQ",
    };
    await executeAction("collateral-valuation", payload);
    expect((callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0]).toEqual(payload);
  });

  it("parses each item's own filed result, including an unverified one", async () => {
    installMcp({
      ok: true,
      error: null,
      result: {
        stagingId: "s",
        terminalState: "success",
        steps: [],
        items: [
          { collateralId: "C1", collateralName: "COL-000762", valuationId: "a34a", recordName: "CV-0000000010", anchorName: "COL-000762", collateralValueMoved: false },
          { collateralId: "C2", collateralName: "COL-000763", valuationId: "a34b", recordName: null, collateralValueMoved: false },
        ],
      },
    });
    const out = await executeAction("collateral-valuation", {
      idempotencyKey: "k",
      stagingId: "s",
      planHash: "h",
      decisionToken: "t",
      approverUserId: "005bb00000ftouDAAQ",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.items).toHaveLength(2);
    expect(out.result.items![0].recordName).toBe("CV-0000000010");
    // Per-item unverified carries the same semantic as the single-record case.
    expect(out.result.items![1].recordName).toBeNull();
    // No item may claim a coverage improvement (Probe 6, confirmed negative).
    for (const item of out.result.items!) expect(item.collateralValueMoved).toBe(false);
  });

  it("surfaces a batch refusal's position text verbatim", async () => {
    installMcp({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "item 2 of 2: Source: bad value for restricted picklist field: Nonsense. Legal values are: Appraisal, Receivables Aging",
      },
      result: null,
    });
    const out = await stageAction("collateral-valuation", { idempotencyKey: "k", items: [] } as never);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.message).toContain("item 2 of 2");
    // The per-item legal list is still parsed from the tool's own words.
    expect(out.error.legalValues).toEqual(["Appraisal", "Receivables Aging"]);
  });
});


/* =============================================================================
   LOAN MODIFICATION — the complete pair, OBSERVED live 2026-08-22.

   Read out of the wire probe against throwaway account ZZ-WS05-PROBE (every
   record deleted after capture). Stage, execute and the replay, verbatim.
   ============================================================================= */

const MOD = observedModEnvelopes as unknown as Record<string, { response: Array<{ outputValues: unknown }> }>;
const MOD_STAGE = MOD.stage_loan_modification.response[0].outputValues;
const MOD_EXECUTE = MOD.execute_loan_modification.response[0].outputValues;
const MOD_REPLAY = MOD.execute_loan_modification_replay.response[0].outputValues;

const MOD_EXECUTE_PAYLOAD = {
  idempotencyKey: "ZZ-WS05-PROBE-MOD-1",
  stagingId: "a8abb00001N6Z0XAAV",
  planHash: "962ba9589fe41637d48392575f63dd2cfb25245fe7f54e615de38de67847ed8c",
  decisionToken: "8fc5099ec8f0a9fa83dc7c6c39c4ed7f76e07d6b8494e7f0bf0d6bd29285ee86",
  approverUserId: "005bb00000ftouDAAQ",
};

describe("loan modification, stage and execute (OBSERVED live 2026-08-22)", () => {
  it("stages a plan the org will RUN: executionHeld false, heldReason null", async () => {
    installMcp(MOD_STAGE);
    const out = await stageAction("loan-modification", {
      idempotencyKey: "ZZ-WS05-PROBE-MOD-1",
      productPackageId: "a5Fbb000000IltJEAS",
      facilityIds: ["a4Zbb000002Br4fEAC"],
      requestedAmount: 1_500_000,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.executionHeld).toBe(false);
    expect(out.result.heldReason).toBeUndefined();
    expect(out.result.decisionToken).toBe(MOD_EXECUTE_PAYLOAD.decisionToken);
    expect(out.result.facilities?.[0].facilityId).toBe("a4Zbb000002Br4fEAC");
  });

  it("carries the booking warning the banker acts on, verbatim", async () => {
    installMcp(MOD_STAGE);
    const out = await stageAction("loan-modification", { idempotencyKey: "k", facilityIds: ["a4Zbb000002Br4fEAC"] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings).toHaveLength(5);
    expect(out.result.warnings.some((w) => w.includes("Loan_Validation_06"))).toBe(true);
    expect(out.result.warnings[0]).toContain("Execution is available.");
  });

  it("calls execute_loan_modification on the same five-field contract", async () => {
    const callTool = installMcp(MOD_EXECUTE);
    await executeAction("loan-modification", MOD_EXECUTE_PAYLOAD);
    expect(callTool.mock.calls[0][1]).toBe("execute_loan_modification");
    expect((callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0]).toEqual(
      MOD_EXECUTE_PAYLOAD,
    );
  });

  it("reads the clone, the chain row and the applied change off the result", async () => {
    installMcp(MOD_EXECUTE);
    const out = await executeAction("loan-modification", MOD_EXECUTE_PAYLOAD);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.terminalState).toBe("success");
    expect(out.result.cloneLoanId).toBe("a4Zbb000002Br6HEAS");
    // A modification runs on the SOURCE package: no new package is minted.
    expect(out.result.outputPackageId).toBe("a5Fbb000000IltJEAS");
    expect(out.result.packageCreated).toBeUndefined();

    const f = out.result.facilities![0];
    expect(out.result.facilityCount).toBe(1);
    expect(f.facilityId).toBe("a4Zbb000002Br4fEAC");
    expect(f.cloneLoanId).toBe("a4Zbb000002Br6HEAS");
    expect(f.cloneName).toBe("ZZ-WS05-PROBE Borrower - Equipment - $1,500,000.00");
    expect(f.cloneStage).toBe("Qualification");
    expect(f.cloneLookupKey).toBe("ZZWS05PROBE1_M1");
    expect(f.junctionName).toBe("RL-00000198");
    expect(f.junctionId).toBe("a4Obb000000FXGcEAO");
    expect(f.revisionNumber).toBe(1);
    expect(f.parentUnchanged).toBe(true);
    expect(f.appliedChanges).toBe("Amount reads back at 1500000.00.");
    // The org's per-facility evidence, in its own words. Both are carried
    // through rather than paraphrased: they are what it read back.
    expect(f.verification).toContain("chain row RL-00000198 records revision 1");
    expect(f.verification).toContain("the parent re-reads unchanged at Booked / Open");
    expect(f.outcome).toContain("at stage Qualification");
  });

  it("keeps the org's booking handoff as its own sentence", async () => {
    installMcp(MOD_EXECUTE);
    const out = await executeAction("loan-modification", MOD_EXECUTE_PAYLOAD);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.bookingHandoff).toContain("Submit for Approval with real approvers");
    expect(out.result.bookingHandoff).toContain("Nothing here has been approved.");
    // The name is the org's, rewritten by it after the amount landed.
    expect(out.result.recordName).toBe("ZZ-WS05-PROBE Borrower - Equipment - $1,500,000.00");
    expect(out.result.anchorName).toBe("ZZ-WS05-PROBE Borrower - Equipment - $1,000,000.00");
  });

  it("replays without re-asserting per-facility detail, and still names the clone", async () => {
    installMcp(MOD_REPLAY);
    const out = await executeAction("loan-modification", MOD_EXECUTE_PAYLOAD);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.replayed).toBe(true);
    // NULL is not an empty batch: the org is not restating detail for a call
    // that wrote nothing, so nothing per-facility may be rendered.
    expect(out.result.facilities).toBeUndefined();
    expect(out.result.facilityCount).toBeUndefined();
    expect(out.result.outputPackageId).toBeUndefined();
    expect(out.result.anchorName).toBeNull();
    // The clone still exists and the replay says which one it is.
    expect(out.result.cloneLoanId).toBe("a4Zbb000002Br6HEAS");
    expect(out.result.outcome).toContain("Nothing was written.");
  });
});
