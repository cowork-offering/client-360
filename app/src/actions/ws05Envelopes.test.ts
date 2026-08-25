// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction, stageAction } from "../channel/writeTools";
import {
  batchStagingGap,
  buildPanelSchema,
  COVENANT_CAP_REASON,
  COVENANT_WITHOUT_ASSESSMENT,
  MODIFICATION_NEEDS_A_CHANGE,
  NO_COLLATERAL_SELECTED,
  NO_COVENANT_SELECTED,
  packageRecords,
  VALUATION_CAP_REASON,
} from "./schemas";
import { unansweredItems } from "./panelSchema";
import { COVENANT_ASSESSMENT_STATUSES } from "./observedPicklists";
import { assertNoRecordIds, type StagedOutput } from "./stagedPlan";
import { executedActivityEntry } from "./executedActivity";
import type { BorrowerBundle } from "../data/contract";
import covenantEnvelopes from "./observed-covenant-bulk-envelopes.json";
import valuationEnvelopes from "./observed-valuation-hardened-envelopes.json";

/* =============================================================================
   WS0.5 items 2+3 — THE OBSERVED WIRE, 2026-08-22.

   Every request body, response body and refusal string below is read out of the
   archived envelopes rather than retyped, so a "tidy-up" of a field name breaks
   a test instead of a banker's write. The org is the authority here: these
   assertions describe what the tool DID, not what the cockpit hopes it does.

   `stage_covenant_review` became PACKAGE-SCOPED BULK and its old single shape
   was deleted; `stage_collateral_valuation` gained a required package anchor, a
   required per-item date, a 20-item cap and a same-date duplicate refusal.
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

const arm1 = covenantEnvelopes.arm1_bulk_with_one_refusal;
const arm2 = covenantEnvelopes.arm2_allowNonPending_optin;
const valuation = valuationEnvelopes.happyPath;
const refusals = valuationEnvelopes.refusalArms;

/* ========================================================= covenant, staging */

describe("stage_covenant_review — the package-scoped bulk request", () => {
  const sent = async (payload: unknown) => {
    const callTool = installMcp(arm1.stageResponse[0].outputValues);
    await stageAction("covenant-review", payload as never);
    return (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
  };

  it("sends the observed body byte for byte", async () => {
    const observed = arm1.stageRequest.inputs[0];
    const body = await sent(observed);
    expect(body).toEqual(observed);
  });

  it("anchors on productPackageId and NEVER on the deleted single-row fields", async () => {
    const body = await sent(arm1.stageRequest.inputs[0]);
    expect(body.productPackageId).toBe("a5Fbb000000ImNxEAK");
    // These three carried required=true on the superseded invocable. Sending
    // one makes the new shape unreachable on the wire, so none may appear.
    expect(body.accountId).toBeUndefined();
    expect(body.covenantComplianceId).toBeUndefined();
    expect(body.result).toBeUndefined();
  });

  it("sends observedValue as a NUMBER, which is what the invocable declares", async () => {
    const body = await sent(arm1.stageRequest.inputs[0]);
    const assessments = body.assessments as Array<Record<string, unknown>>;
    expect(assessments).toHaveLength(2);
    expect(assessments[0].observedValue).toBe(1.42);
    expect(typeof assessments[0].observedValue).toBe("number");
  });

  it("carries reasonForException per assessment: the breach-versus-paperwork answer", async () => {
    const body = await sent(arm1.stageRequest.inputs[0]);
    const assessments = body.assessments as Array<Record<string, unknown>>;
    expect(assessments[1].status).toBe("Exception");
    expect(assessments[1].reasonForException).toBe("Breached");
  });

  it("sends covenantIds and allowNonPending only when the caller set them", async () => {
    const plain = await sent(arm1.stageRequest.inputs[0]);
    expect("covenantIds" in plain).toBe(false);
    expect("allowNonPending" in plain).toBe(false);

    const optIn = await sent(arm2.stageRequest.inputs[0]);
    expect(optIn.covenantIds).toEqual(["a3Bbb000000StxeEAC"]);
    expect(optIn.allowNonPending).toBe(true);
  });
});

describe("stage_covenant_review — the plan that comes back", () => {
  const stage = async (outputValues: unknown) => {
    installMcp(outputValues);
    return stageAction("covenant-review", arm1.stageRequest.inputs[0] as never);
  };

  it("reads the per-covenant list, planned and refused alike", async () => {
    const out = await stage(arm1.stageResponse[0].outputValues);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.scopeCount).toBe(2);
    expect(out.result.assessedCount).toBe(1);
    expect(out.result.refusedCount).toBe(1);
    expect(out.result.covenants).toHaveLength(2);

    const [planned, refused] = out.result.covenants!;
    expect(planned.covenantName).toBe("COV-000652");
    expect(planned.state).toBe("planned");
    expect(planned.currentComplianceStatus).toBe("Pending");
    expect(planned.assessedStatus).toBe("Compliant");
    expect(planned.attachment).toBe("relationship");
    expect(planned.generatesNextRow).toBe(false);
    expect(planned.reason).toBeNull();

    expect(refused.covenantName).toBe("COV-000653");
    expect(refused.state).toBe("not_assessable_row_not_pending");
    expect(refused.currentComplianceStatus).toBe("In Progress");
    // The refusal is REPORTED, never dropped: the covenant carries no step ids.
    expect(refused.writeStepId).toBeUndefined();
  });

  it("keeps the org's refusal reason VERBATIM, so the banker reads the org", async () => {
    const out = await stage(arm1.stageResponse[0].outputValues);
    expect(out.ok && out.result.covenants![1].reason).toBe(
      "The compliance row is at In Progress, not Pending. Only a Pending row advances the schedule when it moves to a complete status, so a write here would succeed and change nothing. Set allowNonPending to record the assessment on the row anyway, knowing the schedule will not move.",
    );
  });

  it("keeps the four approval-trap warnings verbatim, all of them", async () => {
    const out = await stage(arm1.stageResponse[0].outputValues);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings).toEqual(arm1.stageResponse[0].outputValues.result.warnings);
    expect(out.result.warnings).toHaveLength(4);
    // The one that matters most: Exception is not a synonym for a breach.
    expect(out.result.warnings.some((x) => x.includes("Exception in nCino is not a synonym for a breach"))).toBe(true);
  });

  it("carries the org's own allowNonPending warning on the opt-in arm", async () => {
    installMcp(arm2.stageResponse[0].outputValues);
    const out = await stageAction("covenant-review", arm2.stageRequest.inputs[0] as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings.some((x) => x.includes("the covenant schedule does NOT advance"))).toBe(true);
    // Under the opt-in the covenant is PLANNED and still carries a reason: the
    // reason says what will not happen, not why nothing will.
    expect(out.result.covenants![0].state).toBe("planned");
    expect(out.result.covenants![0].reason).toContain("will NOT advance");
  });

  it("does not read a staged covenant plan as evidence that something was written", async () => {
    const out = await stage(arm1.stageResponse[0].outputValues);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The plan names covenants and compliance rows that existed long before it.
    // Reading those as "a record exists" would block every real plan.
    expect(assertNoRecordIds(out.result as StagedOutput)).toEqual([]);
  });
});

/* ======================================================== covenant, execute */

describe("execute_covenant_review — per covenant, measured", () => {
  it("sends exactly the five fields the executor reads", async () => {
    const callTool = installMcp(arm1.executeResponse[0].outputValues);
    await executeAction("covenant-review", arm1.executeRequest.inputs[0] as never);
    const body = (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
    expect(body).toEqual(arm1.executeRequest.inputs[0]);
    expect(Object.keys(body).sort()).toEqual([
      "approverUserId",
      "decisionToken",
      "idempotencyKey",
      "planHash",
      "stagingId",
    ]);
  });

  it("reads one result per covenant, with the status transition the org read back", async () => {
    installMcp(arm1.executeResponse[0].outputValues);
    const out = await executeAction("covenant-review", arm1.executeRequest.inputs[0] as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.terminalState).toBe("success");
    expect(out.result.items).toHaveLength(1);
    const item = out.result.items![0];
    expect(item.covenantId).toBe("a3Bbb000000StxdEAC");
    expect(item.covenantComplianceId).toBe("a3Cbb00000EK9iDEAT");
    expect(item.written).toBe(true);
    expect(item.sourceStatus).toBe("Pending");
    expect(item.status).toBe("Compliant");
    expect(item.recordName).toBe("COMP-0489");
    expect(item.anchorName).toBe("COV-000652");
    // Whether a successor row appeared is the org's own sentence on the item,
    // rendered verbatim rather than re-derived from a flag.
    expect(item.outcome).toContain("No successor compliance record was observed in this transaction");
  });

  it("reads approvalChainStarted as MEASURED, and null on a replay as not measured", async () => {
    installMcp(arm1.executeResponse[0].outputValues);
    const first = await executeAction("covenant-review", arm1.executeRequest.inputs[0] as never);
    expect(first.ok && first.result.approvalChainStarted).toBe(false);

    installMcp(arm1.replayResponse[0].outputValues);
    const replay = await executeAction("covenant-review", arm1.executeRequest.inputs[0] as never);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.result.replayed).toBe(true);
    // NOT false. A replay observed nothing, and reporting "no approval was
    // raised" would be this run answering the first run's question.
    expect(replay.result.approvalChainStarted).toBeNull();
    expect(replay.result.items).toEqual([]);
  });

  it("records the opt-in arm's outcome, schedule caveat and all", async () => {
    installMcp(arm2.executeResponse[0].outputValues);
    const out = await executeAction("covenant-review", arm2.executeRequest.inputs[0] as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const item = out.result.items![0];
    expect(item.sourceStatus).toBe("In Progress");
    expect(item.status).toBe("Exception");
    expect(item.outcome).toContain("the schedule did not advance because the row was not Pending");
  });
});

describe("the trail entry for a covenant batch", () => {
  const executed = (items: unknown[]) => ({
    stagingId: "a8abb00001N9xRJAAZ",
    terminalState: "success",
    outcome: "Two assessments recorded.",
    steps: [],
    recordName: "COMP-0489",
    anchorName: "COV-000652",
    items,
  });

  it("counts the assessments instead of naming one row as if it were the batch", () => {
    const entry = executedActivityEntry({
      actionId: "covenant-review",
      outcome: executed([
        { covenantId: "a3B1", covenantComplianceId: "a3C1", written: true, sourceStatus: "Pending", status: "Compliant", anchorName: "COV-1" },
        { covenantId: "a3B2", covenantComplianceId: "a3C2", written: true, sourceStatus: "Pending", status: "Waived", anchorName: "COV-2" },
      ]) as never,
      actor: "Fabian Goetzens",
    })!;
    expect(entry.title).toBe("2 covenant assessments recorded");
    expect(entry.detail?.body).toContain("COV-1 Pending to Compliant.");
    expect(entry.detail?.body).toContain("COV-2 Pending to Waived.");
  });

  it("keeps the single-assessment wording when the batch held one", () => {
    const entry = executedActivityEntry({
      actionId: "covenant-review",
      outcome: executed([
        { covenantId: "a3B1", covenantComplianceId: "a3C1", written: true, sourceStatus: "Pending", status: "Compliant", anchorName: "COV-1" },
      ]) as never,
      actor: "Fabian Goetzens",
    })!;
    expect(entry.title).toContain("COMP-0489");
  });
});

/* ================================================== valuation, hardened wire */

describe("stage_collateral_valuation — hardened", () => {
  const sent = async (payload: unknown) => {
    const callTool = installMcp(valuation.stageResponse[0].outputValues);
    await stageAction("collateral-valuation", payload as never);
    return (callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> }).inputs[0];
  };

  it("sends the observed body byte for byte", async () => {
    const observed = valuation.stageRequest.inputs[0];
    expect(await sent(observed)).toEqual(observed);
  });

  it("carries the package anchor and a valuationDate on EVERY item", async () => {
    const body = await sent(valuation.stageRequest.inputs[0]);
    expect(body.productPackageId).toBe("a5Fbb000000ImPZEA0");
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.valuationDate).toBe("2026-08-22");
  });

  it("reads the package-membership warning the org attaches to the plan", async () => {
    installMcp(valuation.stageResponse[0].outputValues);
    const out = await stageAction("collateral-valuation", valuation.stageRequest.inputs[0] as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings.some((x) => x.includes("proved to belong to the named product package"))).toBe(true);
    expect(out.result.productPackageId).toBe("a5Fbb000000ImPZEA0");
    expect(out.result.items).toHaveLength(2);
  });

  it("does not read a staged valuation plan as evidence that something was written", async () => {
    installMcp(valuation.stageResponse[0].outputValues);
    const out = await stageAction("collateral-valuation", valuation.stageRequest.inputs[0] as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Regression: `items[].collateralId` used to trip the id fence, which meant
    // every real bulk plan was blocked at the confirm gate as if a record had
    // already been written. The collateral existed before the plan did.
    expect(assertNoRecordIds(out.result as StagedOutput)).toEqual([]);
  });

  it("surfaces each refusal string VERBATIM, and never resumable", async () => {
    for (const [i, expected] of refusals.response.entries()) {
      installMcp(expected.outputValues);
      const out = await stageAction("collateral-valuation", refusals.request.inputs[i] as never);
      expect(out.ok, `arm ${i + 1}`).toBe(false);
      if (out.ok) continue;
      expect(out.error.code).toBe("VALIDATION_FAILED");
      expect(out.error.message).toBe(expected.outputValues.error!.message);
      expect(out.error.resumable).toBe(false);
    }
  });

  it("names the four refusals the org actually raised", () => {
    const messages = refusals.response.map((r) => r.outputValues.error!.message);
    expect(messages[0]).toContain("is not part of product package");
    expect(messages[1]).toContain("valuationDate is required");
    expect(messages[2]).toContain("productPackageId is required");
    expect(messages[3]).toContain("already carries valuation CV-0000000014 dated 2026-08-22");
  });
});

describe("execute_collateral_valuation — unchanged contract, per item", () => {
  it("reads one result per collateral and claims no coverage improvement", async () => {
    installMcp(valuation.executeResponse[0].outputValues);
    const out = await executeAction("collateral-valuation", valuation.executeRequest.inputs[0] as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.items!.map((i) => i.recordName)).toEqual(["CV-0000000014", "CV-0000000015"]);
    for (const item of out.result.items!) expect(item.collateralValueMoved).toBe(false);
    // No covenant half is invented on a valuation result.
    for (const item of out.result.items!) expect(item.covenantId).toBeUndefined();
  });
});

/* =========================================================== the ticket side */

const DEAL = "a5Fbb000000ImNxEAK";

const bundle: BorrowerBundle = {
  snapshot: { accountId: "001X", name: "Testco", productPackageId: DEAL },
  exposure: {
    facilities: [
      {
        loanId: "L1",
        name: "Term Loan",
        stage: "Booked",
        productPackageId: DEAL,
        collateral: [{ collateralId: "a35bb00000184kDAAQ", collateralType: "Equipment", currentLendableValue: 900_000 }],
      },
    ],
  },
  covenants: {
    covenants: [
      {
        covenantId: "a3Bbb000000StxdEAC",
        covenantType: "Debt Service Coverage Ratio",
        thresholdValue: 1.3,
        actualValue: 1.42,
        latestComplianceStatus: "Pending",
        attachedLoans: [],
      },
      {
        covenantId: "a3Bbb000000StxeEAC",
        covenantType: "Debt-to-Worth",
        thresholdValue: 3.5,
        actualValue: 1.05,
        latestComplianceStatus: "In Progress",
        reasonForException: "Overdue",
        attachedLoans: [{ loanId: "L1", loanName: "Term Loan" }],
      },
      {
        covenantId: "a3BOTHER",
        covenantType: "Minimum Liquidity",
        attachedLoans: [{ loanId: "L9", loanName: "Someone else's facility" }],
      },
    ],
  },
};

const ctx = { bundle, accountId: "001X", accountName: "Testco", asOf: "2026-08-22T09:00:00Z" };
const schemaFor = (id: string) => buildPanelSchema(id, ctx)!;

describe("the covenant ticket is package-anchored and per covenant", () => {
  it("defaults the deal to the relationship's own package", () => {
    const f = schemaFor("covenant-review").fields.find((x) => x.key === "package")!;
    expect(f.value).toBe(DEAL);
    expect(f.optionsAreRecords).toBe(true);
    // One package, so there is nothing to choose and the field says so.
    expect(f.editable).toBe(false);
    expect(f.editableReason).toContain("one product package");
  });

  it("offers a real choice only when the relationship stages more than one deal", () => {
    const twoDeals: BorrowerBundle = {
      ...bundle,
      exposure: {
        facilities: [
          { loanId: "L1", name: "Term Loan", productPackageId: DEAL },
          { loanId: "L2", name: "Revolver", productPackageId: "a5FOTHERDEAL0001" },
        ],
      },
    };
    expect(packageRecords(twoDeals)).toHaveLength(2);
    const f = buildPanelSchema("covenant-review", { ...ctx, bundle: twoDeals })!.fields.find((x) => x.key === "package")!;
    expect(f.editable).toBe(true);
    expect(f.options).toEqual([DEAL, "a5FOTHERDEAL0001"]);
    expect(f.optionLabels?.[1]).toBe("Revolver");
  });

  it("offers a covenant whose facility the read does not stage, rather than hiding it", () => {
    // DELIBERATELY GENEROUS. The org resolves the real scope as the union of
    // the package's loan-level and relationship-level junctions; the cockpit can
    // only approximate that. A covenant hanging off a facility this read never
    // staged cannot be PROVEN to be on another deal, so it is offered and the
    // tool decides — and refuses by name if the cockpit guessed wrong. A
    // covenant silently missing from the list is the worse failure.
    const f = schemaFor("covenant-review").fields.find((x) => x.key === "covenants")!;
    expect(f.options).toEqual(["a3Bbb000000StxdEAC", "a3Bbb000000StxeEAC", "a3BOTHER"]);
    // Nothing preselected: an assessment is a verdict, never a default.
    expect(f.value).toEqual([]);
  });

  it("re-lists the covenants when the banker picks a DIFFERENT deal", () => {
    // Before this, the chooser moved and the lists did not: the ticket would
    // send package B with member ids resolved against package A, which the tool
    // refuses by name.
    const twoDeals: BorrowerBundle = {
      ...bundle,
      exposure: {
        facilities: [
          { loanId: "L1", name: "Term Loan", productPackageId: DEAL },
          { loanId: "L9", name: "Someone else's facility", productPackageId: "a5FOTHERDEAL0001" },
        ],
      },
    };
    const onDefault = buildPanelSchema("covenant-review", { ...ctx, bundle: twoDeals })!;
    expect(onDefault.fields.find((f) => f.key === "package")!.value).toBe(DEAL);
    expect(onDefault.fields.find((f) => f.key === "covenants")!.options).toEqual([
      "a3Bbb000000StxdEAC",
      "a3Bbb000000StxeEAC",
    ]);

    const onSecond = buildPanelSchema("covenant-review", { ...ctx, bundle: twoDeals, packageId: "a5FOTHERDEAL0001" })!;
    expect(onSecond.fields.find((f) => f.key === "package")!.value).toBe("a5FOTHERDEAL0001");
    // The second deal's own covenant, and the first deal's loan-level one now
    // listed with its reason.
    expect(onSecond.fields.find((f) => f.key === "covenants")!.options).toEqual([
      "a3Bbb000000StxdEAC",
      "a3BOTHER",
    ]);
    expect(onSecond.fields.find((f) => f.key === "covenants")!.disabledOptions).toEqual([
      { value: "Debt-to-Worth against 3.50×", reason: "attached to facilities on another package" },
    ]);
  });

  it("ignores a deal id the read cannot place, rather than emptying the ticket", () => {
    const f = buildPanelSchema("covenant-review", { ...ctx, packageId: "a5FNOTAREALDEAL1" })!.fields.find(
      (x) => x.key === "package",
    )!;
    expect(f.value).toBe(DEAL);
  });

  it("blocks a covenant the read PROVES hangs off another package's facilities", () => {
    const twoDeals: BorrowerBundle = {
      ...bundle,
      exposure: {
        facilities: [
          { loanId: "L1", name: "Term Loan", productPackageId: DEAL },
          { loanId: "L9", name: "Someone else's facility", productPackageId: "a5FOTHERDEAL0001" },
        ],
      },
    };
    const f = buildPanelSchema("covenant-review", { ...ctx, bundle: twoDeals })!.fields.find((x) => x.key === "covenants")!;
    expect(f.options).toEqual(["a3Bbb000000StxdEAC", "a3Bbb000000StxeEAC"]);
    // Listed with its reason rather than dropped: a banker hunting for their
    // covenant should learn why it is not on offer.
    expect(f.disabledOptions).toEqual([
      { value: "Minimum Liquidity", reason: "attached to facilities on another package" },
    ]);
  });

  it("shows each covenant's CURRENT compliance status, and its reason when there is one", () => {
    const f = schemaFor("covenant-review").fields.find((x) => x.key === "covenants")!;
    expect(f.optionDetails![0]).toContain("compliance row Pending");
    expect(f.optionDetails![1]).toContain("compliance row In Progress, not Pending");
    expect(f.optionDetails![1]).toContain("reason Overdue");
  });

  it("offers the TOOL's three complete statuses per covenant, not the org's five", () => {
    const f = schemaFor("covenant-review").fields.find((x) => x.key === "covenants")!;
    const status = f.perItemInputs!.find((i) => i.valueKey === "covenantStatuses")!;
    expect(status.options).toEqual(["Compliant", "Waived", "Exception"]);
    expect(status.options).toEqual(COVENANT_ASSESSMENT_STATUSES);
    expect(status.required).toBe(true);
    // Pending and In Progress are states a row ARRIVES in. The tool refuses
    // them, so the control never offers them.
    expect(status.options).not.toContain("Pending");
    expect(status.options).not.toContain("In Progress");
  });

  it("reads the reason picklist from the ORG, because that set is the org's", () => {
    const f = schemaFor("covenant-review").fields.find((x) => x.key === "covenants")!;
    const reason = f.perItemInputs!.find((i) => i.valueKey === "covenantReasons")!;
    expect(reason.optionsFrom).toEqual({
      object: "LLC_BI__Covenant_Compliance2__c",
      field: "LLC_BI__Reason_for_Exception__c",
    });
    const loaded = buildPanelSchema("covenant-review", {
      ...ctx,
      orgPicklists: { "LLC_BI__Covenant_Compliance2__c.LLC_BI__Reason_for_Exception__c": ["Breached", "Overdue"] },
    })!.fields.find((x) => x.key === "covenants")!;
    expect(loaded.perItemInputs!.find((i) => i.valueKey === "covenantReasons")!.options).toEqual(["Breached", "Overdue"]);
  });

  it("names every covenant the banker selected but never assessed", () => {
    const f = schemaFor("covenant-review").fields.find((x) => x.key === "covenants")!;
    const values = {
      covenants: ["a3Bbb000000StxdEAC", "a3Bbb000000StxeEAC"],
      covenantStatuses: { a3Bbb000000StxdEAC: "Compliant" },
    };
    const unanswered = unansweredItems(f, values);
    expect(unanswered).toHaveLength(1);
    expect(unanswered[0].optionIds).toEqual(["a3Bbb000000StxeEAC"]);
    // Answer it and the block clears.
    expect(unansweredItems(f, { ...values, covenantStatuses: { a3Bbb000000StxdEAC: "Compliant", a3Bbb000000StxeEAC: "Waived" } })).toEqual([]);
  });

  it("carries the caps and their reasons in the tool's own terms", () => {
    expect(COVENANT_CAP_REASON).toContain("at most 20 covenants per plan");
    expect(COVENANT_CAP_REASON).toContain("ceiling of 50 queued jobs");
    expect(VALUATION_CAP_REASON).toContain("at most 20 collaterals per plan");
    expect(VALUATION_CAP_REASON).toContain("ceiling of 50 queued jobs");
  });
});

describe("the batch is checked HERE, so the org never has to refuse the whole plan", () => {
  const covenantSchema = schemaFor("covenant-review");
  const valuationSchema = schemaFor("collateral-valuation");
  const answered = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "Compliant"]));

  it("refuses an empty covenant selection: it is not the whole package", () => {
    expect(batchStagingGap("covenant-review", { covenants: [] }, covenantSchema)).toBe(NO_COVENANT_SELECTED);
  });

  it("enforces the covenant cap at 20, with the org's governor reason", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `cov-${i}`);
    expect(batchStagingGap("covenant-review", { covenants: twenty, covenantStatuses: answered(twenty) }, covenantSchema)).toBeNull();
    const twentyOne = [...twenty, "cov-20"];
    const gap = batchStagingGap("covenant-review", { covenants: twentyOne, covenantStatuses: answered(twentyOne) }, covenantSchema);
    expect(gap).toBe(COVENANT_CAP_REASON);
    expect(gap).toContain("Stage the rest as a second plan");
  });

  it("refuses a covenant the banker selected but never assessed", () => {
    const gap = batchStagingGap(
      "covenant-review",
      { covenants: ["a", "b"], covenantStatuses: { a: "Compliant" } },
      covenantSchema,
    );
    expect(gap).toBe(COVENANT_WITHOUT_ASSESSMENT);
    expect(gap).toContain("An assessment is a verdict, and it is never defaulted");
  });

  it("enforces the valuation cap at 20, with the org's governor reason", () => {
    const dated = (n: number) => ({
      records: Array.from({ length: n }, (_, i) => `col-${i}`),
      valuationDate: "2026-08-22",
    });
    expect(batchStagingGap("collateral-valuation", dated(20), valuationSchema)).toBeNull();
    expect(batchStagingGap("collateral-valuation", dated(21), valuationSchema)).toBe(VALUATION_CAP_REASON);
  });

  it("refuses a valuation with no date, in the org's own words", () => {
    const gap = batchStagingGap("collateral-valuation", { records: ["col-0"], valuationDate: "" }, valuationSchema);
    expect(gap).toContain("nCino uses it to decide which valuation record is the latest");
  });

  it("tells an empty SELECTION apart from a relationship with nothing to value", () => {
    // Options exist and none is chosen: the banker deselected them.
    expect(batchStagingGap("collateral-valuation", { records: [] }, valuationSchema)).toBe(NO_COLLATERAL_SELECTED);
    // No options at all: that is the field's own gap, already named there, and
    // repeating it as a batch problem would report one fact twice.
    const bare = buildPanelSchema("collateral-valuation", {
      ...ctx,
      bundle: { snapshot: { accountId: "001X", productPackageId: DEAL }, exposure: { facilities: [] } },
    })!;
    expect(batchStagingGap("collateral-valuation", { records: [] }, bare)).toBeNull();
  });

  it("leaves every other action alone", () => {
    for (const id of ["annual-review", "create-service-request", "renewal"]) {
      expect(batchStagingGap(id, {}, null), id).toBeNull();
    }
  });

  it("holds the modification to the org's at-least-one-change rule, in its own words", () => {
    // The rule is the Apex's, verbatim: StageLoanModification.build throws it
    // before it reads a single facility.
    expect(batchStagingGap("loan-modification", {}, null)).toBe(MODIFICATION_NEEDS_A_CHANGE);
    for (const change of [
      { newCommitment: 20_000_000 },
      { requestedMaturityDate: "2028-09-30" },
      { requestedRate: 6.25 },
      { requestedTermMonths: 60 },
    ]) {
      expect(batchStagingGap("loan-modification", change, null), JSON.stringify(change)).toBeNull();
    }
    // An emptied field is not a change: the panel writes "" where a banker
    // cleared an input, and JSON would send it as a null the org counts out.
    expect(batchStagingGap("loan-modification", { newCommitment: "", requestedRate: null }, null)).toBe(
      MODIFICATION_NEEDS_A_CHANGE,
    );
  });
});

describe("the valuation ticket is package-anchored and dated", () => {
  it("defaults the valuation date to the view's own clock, never the wall clock", () => {
    const f = schemaFor("collateral-valuation").fields.find((x) => x.key === "valuationDate")!;
    expect(f.value).toBe("2026-08-22");
    expect(f.prefill.source).toBe("COMPUTED");
    expect(f.prefill.citation).toContain("meta.generatedAt");
    expect(f.required).toBe(true);
  });

  it("leaves the date EMPTY rather than guessing when the read stages no clock", () => {
    const f = buildPanelSchema("collateral-valuation", { bundle, accountId: "001X", accountName: "Testco" })!.fields.find(
      (x) => x.key === "valuationDate",
    )!;
    expect(f.value).toBeNull();
    expect(f.prefill.source).toBe("BANKER");
  });

  it("anchors the batch on the same deal the covenant review uses", () => {
    const f = schemaFor("collateral-valuation").fields.find((x) => x.key === "package")!;
    expect(f.value).toBe(DEAL);
  });

  it("offers only the chosen deal's collateral, and names why the rest is off", () => {
    const twoDeals: BorrowerBundle = {
      ...bundle,
      exposure: {
        facilities: [
          {
            loanId: "L1",
            name: "Term Loan",
            productPackageId: DEAL,
            collateral: [{ collateralId: "a35OURS", collateralType: "Equipment", currentLendableValue: 900_000 }],
          },
          {
            loanId: "L9",
            name: "Someone else's facility",
            productPackageId: "a5FOTHERDEAL0001",
            collateral: [{ collateralId: "a35THEIRS", collateralType: "Inventory", currentLendableValue: 100_000 }],
          },
        ],
      },
    };
    const f = buildPanelSchema("collateral-valuation", { ...ctx, bundle: twoDeals })!.fields.find(
      (x) => x.key === "records",
    )!;
    expect(f.options).toEqual(["a35OURS"]);
    expect(f.disabledOptions).toEqual([{ value: "Inventory", reason: "pledged to another package's facilities" }]);
  });

  it("warns about the org's same-date duplicate rule where the banker sets the date", () => {
    const f = schemaFor("collateral-valuation").fields.find((x) => x.key === "valuationDate")!;
    expect(f.help).toContain("same collateral on a date it already carries");
  });
});
