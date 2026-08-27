// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModifyEngine, WorkroomRefusalError, type ModifyEngineDeps } from "./modifyEngine";
import { assertNoRecordIds } from "../actions/stagedPlan";
import { validatePlan } from "../actions/transitionAllowlist";
import type { BorrowerBundle, C360Data, Facility } from "../data/contract";
import type { WorkroomContext, WorkroomDelta } from "./types";

/* =============================================================================
   THE REAL ENGINE, ON A MOCKED CHANNEL.

   What is proved here is the wiring, not a storyline:

     - the ORDERED composer (W1): step 1 is the credit-action clone and the
       mutations that follow land on it, in the org's own order;
     - the FIELD CATALOG mapping: a sentence becomes the request key the tool
       actually accepts, and LLC_BI__InterestRate__c is the field it names;
     - the HONEST HANDOFF: an amendment no tool files is staged, excluded from
       the payload, and reported as not filed;
     - the GOVERNANCE the ConfirmGate carries: allowlist, no record ids in a
       staged plan, a drift recompute, the org's approver id, one use of one
       token.

   The channel is mocked exactly as `writeTools.test.ts` mocks it — the tool
   wrappers are the real ones, and what is faked is the connector.
   ============================================================================= */

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ fixture */

/* THE REAL HARTWELL PACKAGE, read live from bankinggpt on 2026-08-27: seven
   members, the $15.0MM Line of Credit booked and open, the $3.0MM Equipment
   showcase member at Proposal. The org calls it a "Line of Credit"; the word
   "revolver" appears nowhere in the data, which is why the parser carries the
   vocabulary and these fixtures do not. */

const PACKAGE_ID = "a5Fbb000000IHFJEA4";
const LINE_ID = "a4Zbb0000027MaYEAU";
const EQUIPMENT_ID = "a4Zbb0000027MnREAU";
const PROPOSAL_ID = "a4Zbb000002CECXEA4";

const line: Facility = {
  loanId: LINE_ID,
  name: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00",
  productType: "Line of Credit",
  productPackageId: PACKAGE_ID,
  stage: "Booked",
  status: "Active",
  committed: 15_000_000,
  outstanding: 9_200_000,
  available: 5_800_000,
  interestRate: 7.6,
  maturityDate: "2027-03-15",
  // The roll-over baseline the clone would carry, as the org holds it.
  loanCovenants: [{ id: "a4Vbb000000pNIjEAM", name: "COV-0107", covenantType: "Accounts Receivable", covenantId: "a3Bbb000000S0bNEAS" }],
  collateral: [
    { loanId: LINE_ID, collateralId: "a35bb0000013xz3AAA", collateralName: "COL-000762", amountPledged: 8_000_000, advanceRate: 80, lienPosition: "1st", pledgedStatus: "Inactive" },
    { loanId: LINE_ID, collateralId: "a35bb0000013y0fAAA", collateralName: "COL-000763", amountPledged: 4_000_000, advanceRate: 50, lienPosition: "1st", pledgedStatus: "Inactive" },
  ],
};

const equipment: Facility = {
  loanId: EQUIPMENT_ID,
  name: "Hartwell Precision Manufacturing LLC - Equipment - $8,000,000.00",
  productType: "Equipment",
  productPackageId: PACKAGE_ID,
  stage: "Booked",
  status: "Active",
  committed: 8_000_000,
  outstanding: 5_900_000,
};

/** The showcase member. Proposal stage: never a modification target. */
const proposal: Facility = {
  loanId: PROPOSAL_ID,
  name: "Hartwell Precision Manufacturing LLC - Equipment - $3,000,000.00",
  productType: "Equipment",
  productPackageId: PACKAGE_ID,
  stage: "Proposal",
  status: "Active",
  committed: 3_000_000,
};

function bundleWith(facilities: Facility[] = [line, equipment, proposal]): BorrowerBundle {
  return {
    snapshot: {
      accountId: "001bb00001I7FPNAA3",
      name: "Hartwell Precision Manufacturing LLC",
      productPackageId: PACKAGE_ID,
      packageStage: "Complete",
      primaryRiskRating: "4",
    },
    exposure: {
      totalCommitted: 46_000_000,
      totalOutstanding: 31_030_000,
      totalUniqueCollateralLendableValue: 34_600_000,
      uniqueCollateralCount: 5,
      coverageRatio: 1.13,
      facilities,
    },
    covenants: {
      covenants: [
        { covenantId: "a3Bbb000000S0ZlEAK", covenantType: "Fixed Charge Coverage", thresholdValue: 1.15, actualValue: 1.22, latestComplianceStatus: "Compliant" },
        { covenantId: "a3Bbb000000S0UvEAK", covenantType: "Debt Service Coverage", thresholdValue: 1.25, actualValue: 1.38, latestComplianceStatus: "Compliant" },
      ],
    },
    graph: {
      // The four involvement rows the org holds on the Line of Credit.
      legalEntities: [
        { accountName: "Hartwell Precision Manufacturing LLC", borrowerType: "Borrower", loanId: LINE_ID, packageId: PACKAGE_ID },
        { accountName: "Hartwell Industrial Holdings LLC", borrowerType: "Guarantor", loanId: LINE_ID, packageId: PACKAGE_ID },
        { accountName: "James Hartwell", borrowerType: "Guarantor", loanId: LINE_ID, packageId: PACKAGE_ID },
        { accountName: "Elena Hartwell", borrowerType: "Limited Guarantor", loanId: LINE_ID, packageId: PACKAGE_ID },
      ],
      // The household around the deal: related, and NOT on it yet.
      connections: [{ counterpartyName: "Hartwell Logistics LLC", role: "Subsidiary", ownershipPercent: 100, isActive: true }],
    },
    requests: [
      {
        id: "req-1",
        channel: "email",
        receivedAt: "2026-08-27T08:02:00Z",
        summary: "Increase the operating line to fund the Kokomo tooling ramp.",
        ask: { type: "facility_increase", from: 15_000_000, to: 20_000_000, facilityName: "Line of Credit" },
      },
    ],
  };
}

const data = { meta: { anchorAccountId: "001bb00001DLtRMAA1", generatedAt: "2026-08-27T08:00:00Z", user: "Fabian Goetzens", userId: "005bb00000ftouDAAQ" } } as unknown as C360Data;

const context: WorkroomContext = {
  mode: "modify",
  door: "package",
  accountId: "001bb00001DLtRMAA1",
  accountName: "Hartwell Precision Manufacturing LLC",
  productPackageId: PACKAGE_ID,
  packageName: "Hartwell Precision Manufacturing LLC credit package",
  approver: "Fabian Goetzens",
};

/* THE OBSERVED ENVELOPES, trimmed to what the wrappers read. Every key below
   appears verbatim in `knowledge/sf-build-v2/wp2/observed-envelopes-execute-loan-modification.json`. */

const STAGE_RESULT = {
  stagingId: "a8abb00001N6Z0XAAV",
  planHash: "962ba9589fe41637d48392575f63dd2cfb25245fe7f54e615de38de67847ed8c",
  decisionToken: "8fc5099ec8f0a9fa83dc7c6c39c4ed7f76e07d6b8494e7f0bf0d6bd29285ee86",
  replayed: false,
  accountId: "001bb00001DLtRMAA1",
  productPackageId: PACKAGE_ID,
  summary: "Plans a modification on the package.",
  warnings: ["Execution is available."],
  executionHeld: false,
  facilityCount: 1,
  facilities: [{ facilityId: LINE_ID, facilityName: line.name, creditActionStepId: "credit_action_0", verifyStepId: "verify_clone_0", applyStepId: "apply_changes_0", covenantCarryoverCount: 0 }],
  steps: [
    { id: "credit_action_0", type: "write", label: "Invoke the modification credit action on the package", objectName: "LLC_BI__Loan__c", fields: ["clone created by nCino"], state: "pending" },
    { id: "verify_clone_0", type: "verification", label: "Re-query for the new facility and its junction row", objectName: "LLC_BI__LoanRenewal__c", fields: ["LLC_BI__ParentLoanId__c"], state: "pending" },
    { id: "apply_changes_0", type: "write", label: "Apply the requested changes to the new facility", objectName: "LLC_BI__Loan__c", fields: ["LLC_BI__Amount__c", "LLC_BI__Maturity_Date__c", "LLC_BI__InterestRate__c", "LLC_BI__Term_Months__c"], state: "pending" },
    { id: "observe_side_effects", type: "observed_side_effect", label: "Stage-driven email alerts", state: "pending" },
    { id: "held_execution", type: "handoff", label: "HANDOFF: booking the modification is nCino's own approval run", state: "pending" },
  ],
};

const EXECUTE_RESULT = {
  terminalState: "success",
  stagingId: STAGE_RESULT.stagingId,
  replayed: false,
  recordName: "Hartwell - Revolving line of credit - $20,000,000",
  outcome: "Modification created at stage Qualification. The parent was not touched.",
  facilityCount: 1,
  facilities: [
    {
      facilityId: LINE_ID,
      facilityName: line.name,
      cloneLoanId: "a4Zbb000002Br6HEAS",
      cloneName: "Hartwell - Revolving line of credit - $20,000,000",
      cloneStage: "Qualification",
      junctionId: "a4Obb000000FXGcEAO",
      junctionName: "RL-00000198",
      revisionNumber: 1,
      parentUnchanged: true,
      appliedChanges: "Amount reads back at 20000000.00.",
      verification: "the clone reads back with Is_Modification true; chain row RL-00000198 records revision 1.",
    },
  ],
  cloneLoanId: "a4Zbb000002Br6HEAS",
  bookingHandoff: "Booking it requires nCino's Submit for Approval with real approvers. Nothing here has been approved.",
  steps: STAGE_RESULT.steps.map((s) => ({ ...s, state: "verified" })),
};

/** A deps set whose stage/execute are the observed envelopes, and whose LLM
 *  assist is off unless a test turns it on. */
function deps(over: Partial<ModifyEngineDeps> = {}): ModifyEngineDeps {
  return {
    stage: vi.fn().mockResolvedValue({ ok: true, result: STAGE_RESULT }),
    execute: vi.fn().mockResolvedValue({ ok: true, result: EXECUTE_RESULT }),
    available: () => true,
    newKey: () => "wr-test-key",
    restate: undefined,
    ...over,
  };
}

function engineOn(over: Partial<ModifyEngineDeps> = {}, bundle: BorrowerBundle | null = bundleWith()) {
  const d = deps(over);
  return { engine: createModifyEngine({ context, data, bundle, deps: d }), deps: d };
}

async function confirm(engine: ReturnType<typeof createModifyEngine>, line: string): Promise<WorkroomDelta[]> {
  const result = await engine.parseIntent(line, context);
  if (result.kind !== "deltas") throw new Error(`${line} → ${result.kind}: ${result.reply}`);
  return result.deltas;
}

/* --------------------------------------------------------------------------- */

describe("the modify engine reads the real package", () => {
  it("resolves the strip, the members and the covenants from the bundle, and is not scripted", () => {
    const { engine } = engineOn();
    expect(engine.scripted).toBe(false);
    const brief = engine.brief(context);
    expect(brief.baselineMembers).toBe(3);
    expect(brief.baselineCommittedMM).toBe(26);
    expect(brief.covenantFigure).toBe("2/2");
    expect(brief.loadSteps.at(-1)).toBe("Ready");
    // The chip says the PRODUCT; the amount beside it tells two lines apart.
    expect(brief.members.map((m) => m.short)).toContain("Line of Credit");
    expect(brief.members.find((m) => m.short === "Line of Credit")!.amount).toBe("$15.0MM");
  });

  it("marks a member that is NOT booked as pending work (W4)", () => {
    const brief = engineOn().engine.brief(context);
    const booked = brief.members.find((m) => m.key === "Line of Credit")!;
    const staged = brief.members.find((m) => m.amount === "$3.0MM")!;
    expect(booked.proposed).toBe(false);
    expect(booked.tag).toBe("Booked");
    expect(staged.proposed).toBe(true);
    expect(staged.tag).toBe("Proposal");
  });

  it("says stage-not-staged rather than calling an unknown member booked", () => {
    const blind = bundleWith([{ ...line, stage: undefined }, equipment]);
    const brief = createModifyEngine({ context, data, bundle: blind, deps: deps() }).brief(context);
    expect(brief.members.every((m) => m.proposed)).toBe(true);
    expect(brief.members[0].tag).toBe("Stage not staged");
  });

  it("answers its own question, so a bare figure completes the instruction", async () => {
    const { engine } = engineOn();
    // No figure in the line: the room asks rather than inventing one.
    const asked = await engine.parseIntent("increase the line of credit - $15,000,000.00", context);
    expect(asked.kind).toBe("unparsed");
    if (asked.kind !== "unparsed") return;
    expect(asked.reply).toMatch(/what should commitment amount become/i);

    // And the answer alone is a complete instruction.
    const answered = await engine.parseIntent("$20,000,000", context);
    expect(answered.kind).toBe("deltas");
    if (answered.kind !== "deltas") return;
    expect(answered.deltas[0].wire).toEqual({ key: "requestedAmount", value: 20_000_000, facilityId: LINE_ID });
  });

  it("will not invent a target figure when no client ask exists", () => {
    const noAsk = bundleWith();
    delete noAsk.requests;
    const engine = createModifyEngine({ context, data, bundle: noAsk, deps: deps() });
    const pill = engine.suggest()!;
    expect(pill).toMatch(/^Increase the Line of Credit - \$15,000,000\.00$/);
    expect(pill).not.toMatch(/to \$/);
  });

  it("leads on the client's own ask where the read carries one", () => {
    const { engine } = engineOn();
    expect(engine.brief(context).askPin).toContain("$20M");
    expect(engine.suggest()).toMatch(/Increase the Line of Credit - \$15,000,000\.00 to \$20M/);
  });

  it("states plainly when nothing on the package is booked", () => {
    const none = bundleWith([{ ...line, stage: "Proposal" }]);
    const brief = createModifyEngine({ context, data, bundle: none, deps: deps() }).brief(context);
    expect(brief.position).toMatch(/none of them is booked/i);
  });
});

describe("parseIntent maps a sentence onto the catalog", () => {
  it("turns a commitment increase into a fileable delta on the named member", async () => {
    const { engine } = engineOn();
    const [delta] = await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000");
    expect(delta.fileable).toBe(true);
    expect(delta.wire).toEqual({ key: "requestedAmount", value: 20_000_000, facilityId: LINE_ID });
    expect(delta.before).toBe("$15M");
    expect(delta.after).toBe("$20M");
    expect(delta.fields).toEqual(["LLC_BI__Loan__c.LLC_BI__Amount__c"]);
  });

  it("names LLC_BI__InterestRate__c for a rate change, and never the field that does not exist", async () => {
    const { engine } = engineOn();
    const [delta] = await confirm(engine, "move the rate on the line of credit - $15,000,000.00 to 8.1%");
    expect(delta.wire).toEqual({ key: "requestedRate", value: 8.1, facilityId: LINE_ID });
    expect(delta.fields).toEqual(["LLC_BI__Loan__c.LLC_BI__InterestRate__c"]);
    expect(delta.fields.join()).not.toContain("LLC_BI__Interest_Rate__c");
  });

  it("stages an out-of-scope amendment as NOT fileable, with the reason on it", async () => {
    const { engine } = engineOn();
    const [delta] = await confirm(engine, "add a covenant on minimum liquidity for the line of credit - $15,000,000.00");
    expect(delta.fileable).toBe(false);
    expect(delta.wire).toBeUndefined();
    expect(delta.handoff?.reason).toMatch(/not on C360WriteGuard's allowlist/);
    expect(delta.handoff?.closes).toBeTruthy();
    expect(delta.filed.recordId).toBe("not filed");
  });

  it("stages a FEE ask honestly, saying the org holds no fee records", async () => {
    const { engine } = engineOn();
    const [delta] = await confirm(engine, "add a $50,000 arrangement fee on the line of credit - $15,000,000.00");
    expect(delta.fileable).toBe(false);
    expect(delta.handoff?.reason).toMatch(/re-counted live/);
  });

  it("stages a borrower add and a borrower remove, both as handoffs (W1)", async () => {
    const { engine } = engineOn();
    const [add] = await confirm(engine, "add Hartwell Logistics LLC as a guarantor");
    expect(add.fileable).toBe(false);
    expect(add.target).toBe("Hartwell Logistics LLC");

    const [remove] = await confirm(engine, "remove the guarantor Elena Hartwell");
    expect(remove.fileable).toBe(false);
    expect(remove.handoff?.reason).toMatch(/refuses OP_DELETE/);
  });

  it("REFUSES an ask that belongs to another credit action rather than staging it", async () => {
    const { engine } = engineOn();
    const result = await engine.parseIntent("waive the covenant on the line of credit - $15,000,000.00", context);
    expect(result.kind).toBe("refusal");
    if (result.kind !== "refusal") return;
    expect(result.refusal.reason).toMatch(/founder-gated/);
  });

  it("does not parse a line it cannot read, and says what it can take", async () => {
    const { engine } = engineOn();
    const result = await engine.parseIntent("what is the weather in Kokomo", context);
    expect(result.kind).toBe("unparsed");
    if (result.kind !== "unparsed") return;
    expect(result.reply).toMatch(/could not read an amendment/i);
  });

  it("lets the gateway RESTATE a line, and validates the restatement itself", async () => {
    const restate = vi.fn().mockResolvedValue("increase the line of credit - $15,000,000.00 to $20,000,000");
    const { engine } = engineOn({ restate });
    const result = await engine.parseIntent("give them another five on the operating line", context);
    expect(restate).toHaveBeenCalledOnce();
    expect(result.kind).toBe("deltas");
    if (result.kind !== "deltas") return;
    // The delta came out of the deterministic parser, not out of the model.
    expect(result.deltas[0].wire).toEqual({ key: "requestedAmount", value: 20_000_000, facilityId: LINE_ID });
  });

  it("does not take a restatement the parser cannot read either", async () => {
    const restate = vi.fn().mockResolvedValue("do something clever");
    const { engine } = engineOn({ restate });
    expect((await engine.parseIntent("hmm", context)).kind).toBe("unparsed");
  });
});

describe("stagePlan composes the ORDERED plan (W1)", () => {
  it("sends ONLY the fileable changes, on the tool's own request keys", async () => {
    const { engine, deps: d } = engineOn();
    const deltas = [
      ...(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000")),
      ...(await confirm(engine, "add a covenant on minimum liquidity for the line of credit - $15,000,000.00")),
    ];
    await engine.stagePlan(deltas, context);

    expect(d.stage).toHaveBeenCalledOnce();
    const payload = (d.stage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toMatchObject({
      idempotencyKey: "wr-test-key",
      productPackageId: PACKAGE_ID,
      facilityIds: [LINE_ID],
      requestedAmount: 20_000_000,
      requestedMaturityDate: null,
      requestedRate: null,
      requestedTermMonths: null,
    });
    // The covenant never reaches the wire. There is no key it could travel on.
    expect(JSON.stringify(payload)).not.toMatch(/covenant/i);
    expect(payload.rationale).toContain("Commitment amount");
  });

  it("keeps the org's order: clone, verify, apply, then everything with no tool, then booking", async () => {
    const { engine } = engineOn();
    const deltas = [
      ...(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000")),
      ...(await confirm(engine, "add a covenant on minimum liquidity for the line of credit - $15,000,000.00")),
    ];
    const staged = await engine.stagePlan(deltas, context);
    expect(staged.plan.steps.map((s) => s.id)).toEqual([
      "credit_action_0",
      "verify_clone_0",
      "apply_changes_0",
      "observe_side_effects",
      // CONNECTED CREATION: the covenant is not one step. It is the record and
      // the junction that ties it to the clone, in order.
      "handoff_0",
      "handoff_0_chain_0",
      "handoff_0_chain_1",
      "held_execution",
    ]);
    // Step 1 IS the clone, and the mutation lands after the clone is verified.
    expect(staged.plan.steps[0].type).toBe("write");
    expect(staged.plan.steps[1].type).toBe("verification");
    expect(staged.plan.steps.find((s) => s.id === "handoff_0")!.type).toBe("handoff");
    // The chain names the covenant record AND its loan attachment, in that order.
    expect(staged.plan.steps.find((s) => s.id === "handoff_0_chain_0")!.label).toContain("LLC_BI__Covenant2__c");
    expect(staged.plan.steps.find((s) => s.id === "handoff_0_chain_1")!.label).toContain("LLC_BI__Loan_Covenant__c");
  });

  it("never stages a create without the junctions that connect it", async () => {
    const { engine } = engineOn();
    const deltas = [
      ...(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000")),
      ...(await confirm(engine, "pledge the Mazak tooling to the line of credit - $15,000,000.00")),
    ];
    const staged = await engine.stagePlan(deltas, context);
    const chain = staged.plan.steps.filter((s) => s.id.startsWith("handoff_0_chain_"));
    // Asset, ownership, pledge — and the pledge step names the aggregate defect.
    expect(chain).toHaveLength(3);
    expect(chain[2].label).toContain("Loan_Collateral_Aggregate");
  });

  it("asks amend-or-add when a create names something already on the facility", async () => {
    const { engine } = engineOn();
    // The Line of Credit already carries an Accounts Receivable covenant.
    const result = await engine.parseIntent("add an accounts receivable covenant to the line of credit - $15,000,000.00", context);
    expect(result.kind).toBe("unparsed");
    if (result.kind !== "unparsed") return;
    expect(result.reply).toMatch(/already on/);
    expect(result.reply).toMatch(/add a second/);

    // Said deliberately, it stages.
    const second = await engine.parseIntent("add a second accounts receivable covenant to the line of credit - $15,000,000.00", context);
    expect(second.kind).toBe("deltas");
  });

  it("hands back the ORG's plan hash, staging id and token, untranslated", async () => {
    const { engine } = engineOn();
    const staged = await engine.stagePlan(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000"), context);
    expect(staged.stagingId).toBe(STAGE_RESULT.stagingId);
    expect(staged.planHash).toBe(STAGE_RESULT.planHash);
    expect(staged.decisionToken).toBe(STAGE_RESULT.decisionToken);
  });

  it("stages a plan that passes the allowlist and carries no record id", async () => {
    const { engine } = engineOn();
    const deltas = [
      ...(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000")),
      ...(await confirm(engine, "add a covenant on minimum liquidity for the line of credit - $15,000,000.00")),
    ];
    const staged = await engine.stagePlan(deltas, context);
    expect(validatePlan(staged.plan.steps)).toEqual([]);
    expect(assertNoRecordIds(staged.plan)).toEqual([]);
  });

  it("warns, before the gesture, that part of the manifest is handed off", async () => {
    const { engine } = engineOn();
    const deltas = [
      ...(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000")),
      ...(await confirm(engine, "add a covenant on minimum liquidity for the line of credit - $15,000,000.00")),
    ];
    const staged = await engine.stagePlan(deltas, context);
    expect(staged.plan.warnings.some((wn) => /handed off rather than filed/.test(wn))).toBe(true);
  });

  it("REFUSES a manifest that files nothing rather than staging an empty change", async () => {
    const { engine, deps: d } = engineOn();
    const deltas = await confirm(engine, "add a covenant on minimum liquidity for the line of credit - $15,000,000.00");
    await expect(engine.stagePlan(deltas, context)).rejects.toThrow(WorkroomRefusalError);
    expect(d.stage).not.toHaveBeenCalled();
  });

  it("REFUSES two different amounts in one plan, because the wire carries one scalar", async () => {
    const { engine } = engineOn();
    const deltas = [
      ...(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000")),
      ...(await confirm(engine, "take the equipment - $8,000,000.00 to $9,000,000")),
    ];
    await expect(engine.stagePlan(deltas, context)).rejects.toThrow(/ONE value applied to every facility/);
  });

  it("carries the org's own refusal message rather than a paraphrase", async () => {
    const { engine } = engineOn({
      stage: vi.fn().mockResolvedValue({ ok: false, error: { code: "VALIDATION_FAILED", message: "The request contains invalid facilities" } }),
    });
    const deltas = await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000");
    await expect(engine.stagePlan(deltas, context)).rejects.toThrow("The request contains invalid facilities");
  });

  it("refuses to stage with no connector, rather than simulating a plan", async () => {
    const { engine } = engineOn({ available: () => false });
    const deltas = await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000");
    await expect(engine.stagePlan(deltas, context)).rejects.toThrow(/no connector/i);
  });
});

describe("execute redeems the token and reports what the org read back", () => {
  async function stageOne(over: Partial<ModifyEngineDeps> = {}) {
    const { engine, deps: d } = engineOn(over);
    const deltas = [
      ...(await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000")),
      ...(await confirm(engine, "add a covenant on minimum liquidity for the line of credit - $15,000,000.00")),
    ];
    const staged = await engine.stagePlan(deltas, context);
    return { engine, deps: d, staged, approval: { stagingId: staged.stagingId, planHash: staged.planHash, decisionToken: staged.decisionToken!, approverUserId: context.approver } };
  }

  it("sends the SALESFORCE USER ID, never the display name", async () => {
    const { engine, deps: d, approval } = await stageOne();
    await engine.execute(approval);
    expect((d.execute as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      approverUserId: "005bb00000ftouDAAQ",
      stagingId: STAGE_RESULT.stagingId,
      planHash: STAGE_RESULT.planHash,
      decisionToken: STAGE_RESULT.decisionToken,
      idempotencyKey: "wr-test-key",
    });
  });

  it("refuses to file when the view has no Salesforce user id", async () => {
    const nameOnly = { meta: { user: "Fabian Goetzens" } } as unknown as C360Data;
    const d = deps();
    const engine = createModifyEngine({ context, data: nameOnly, bundle: bundleWith(), deps: d });
    const deltas = await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000");
    const staged = await engine.stagePlan(deltas, context);
    await expect(
      engine.execute({ stagingId: staged.stagingId, planHash: staged.planHash, decisionToken: staged.decisionToken!, approverUserId: "Fabian Goetzens" }),
    ).rejects.toThrow(/no Salesforce user id/);
    expect(d.execute).not.toHaveBeenCalled();
  });

  it("reports the REAL clone id and junction the org named", async () => {
    const { engine, approval } = await stageOne();
    const result = await engine.execute(approval);
    expect(result.filed).toHaveLength(1);
    expect(result.filed[0].recordId).toBe("a4Zbb000002Br6HEAS");
    expect(result.filed[0].verification).toContain("RL-00000198");
    expect(result.filed[0].verification).toContain("Amount reads back at 20000000.00.");
  });

  it("renders the org's booking sentence verbatim and lists what was NOT filed", async () => {
    const { engine, approval } = await stageOne();
    const result = await engine.execute(approval);
    expect(result.handoff).toBe(EXECUTE_RESULT.bookingHandoff);
    expect(result.handoffs).toHaveLength(1);
    expect(result.handoffs![0].title).toMatch(/New covenant/);
    expect(result.reply!.body).toMatch(/not filed, because no tool writes/);
  });

  it("burns the token, and refuses a confirmation that belongs to another plan", async () => {
    const { engine, approval } = await stageOne();
    await engine.execute(approval);
    await expect(engine.execute(approval)).rejects.toThrow(/already been used/);
    await expect(engine.execute({ ...approval, planHash: "changed" })).rejects.toThrow(/no longer applies/);
  });

  it("REFUSES when the figure the entry was composed on has moved (drift)", async () => {
    const d = deps();
    const bundle = bundleWith();
    const engine = createModifyEngine({ context, data, bundle, deps: d });
    const deltas = await confirm(engine, "increase the line of credit - $15,000,000.00 to $20,000,000");
    const staged = await engine.stagePlan(deltas, context);
    // The read moves under the manifest between staging and the gesture.
    bundle.exposure!.facilities![0] = { ...line, committed: 16_000_000 };
    await expect(
      engine.execute({ stagingId: staged.stagingId, planHash: staged.planHash, decisionToken: staged.decisionToken!, approverUserId: context.approver }),
    ).rejects.toThrow(/figures moved/);
    expect(d.execute).not.toHaveBeenCalled();
  });

  it("stops on an org hold rather than sending a plan the org will not run", async () => {
    const { engine, approval } = await stageOne({
      stage: vi.fn().mockResolvedValue({ ok: true, result: { ...STAGE_RESULT, executionHeld: true, heldReason: "LV06 holds this." } }),
    });
    await expect(engine.execute(approval)).rejects.toThrow("LV06 holds this.");
  });

  it("says a replay was a replay rather than claiming a second write", async () => {
    const { engine, approval } = await stageOne({
      execute: vi.fn().mockResolvedValue({ ok: true, result: { ...EXECUTE_RESULT, replayed: true, facilities: undefined } }),
    });
    const result = await engine.execute(approval);
    expect(result.tokenNote).toMatch(/replayed, nothing was written twice/);
    // The clone is still named, because a replay names what already exists.
    expect(result.filed[0].recordId).toBe("a4Zbb000002Br6HEAS");
  });
});
