import { describe, expect, it, vi } from "vitest";
import type { BorrowerBundle, C360Data } from "../../data/contract";
import type { StagedOutput } from "../../actions/stagedPlan";
import type { ExecuteResult, StagePayloads, ToolOutcome } from "../../channel/writeTools";
import {
  CREATE_GAPS,
  NO_CONNECTOR,
  OVERRIDE_NOT_FILEABLE,
  REL_FLOWS,
  RelFlowError,
  SKIPPED,
  VALUATION_BATCH_CAP,
  asksForOverride,
  buildStagePayload,
  dossierRowsFor,
  executeRelPlan,
  nextStep,
  readCreateAsk,
  relContextFor,
  relRouteBlock,
  routeAvailability,
  stageRelPlan,
  type Answers,
  type RelContext,
  type RelFlowDeps,
} from "./reviewFlows";
import type { RelRoute } from "./relRoute";

/* =============================================================================
   THE FIVE FLOWS.

   The room re-clothes flows that already exist, so these prove the two things
   that would break if it drifted: the STEP MACHINE asks exactly what each tool
   demands, and the PAYLOAD it composes carries only wire keys the org has
   already accepted. Plus the two creates the room cannot file, which are
   asserted as proposal-only by name.
   ============================================================================= */

const PACKAGE = "a5Fbb000000IHFJEA4";

function ctxFor(overrides: Partial<BorrowerBundle> = {}): RelContext {
  const bundle = {
    snapshot: {
      accountId: "001X",
      name: "Testco",
      productPackageId: PACKAGE,
      primaryRiskRating: "4",
      computedRiskRating: "5",
    },
    exposure: {
      totalCommitted: 18_400_000,
      facilities: [
        {
          loanId: "0Cb1",
          status: "Active",
          productPackageId: PACKAGE,
          committed: 10_000_000,
          collateral: [
            { collateralId: "a35A", collateralName: "COL-000762", collateralType: "Equipment", collateralValue: 4_000_000 },
            { collateralId: "a35B", collateralDescription: "Receivables", collateralType: "Accounts Receivable" },
          ],
        },
        // The SAME collateral pledged to a second facility. It is one asset and
        // must be offered once: a duplicate id inside a batch is refused.
        {
          loanId: "0Cb2",
          status: "Active",
          productPackageId: PACKAGE,
          collateral: [{ collateralId: "a35A", collateralName: "COL-000762" }],
        },
      ],
    },
    covenants: {
      covenants: [
        { covenantId: "cov1", covenantType: "Debt Service Coverage", latestComplianceStatus: "Pending" },
        { covenantId: "cov2", covenantType: "Leverage", latestComplianceStatus: "Pending" },
        // No id: the bulk tool is anchored on covenantId, so this one cannot be
        // assessed and must never be offered.
        { covenantType: "Fixed Charge Coverage" },
      ],
    },
    ...overrides,
  } as unknown as BorrowerBundle;
  const data = {
    meta: { generatedAt: "2026-08-31", userId: "005bb000001AAAAAAA" },
    portfolio: { accounts: [] },
    borrower: bundle,
    borrowers: { "001X": bundle },
  } as unknown as C360Data;
  return relContextFor({ data, bundle, accountId: "001X", accountName: "Testco" });
}

/** Drive the machine to the end, answering each step with the value the test
 *  names for it. Returns everything collected, in order. */
function driveTo(route: RelRoute, ctx: RelContext, answersFor: Record<string, unknown>): Answers {
  const a: Answers = {};
  for (let guard = 0; guard < 64; guard++) {
    const step = nextStep(route, ctx, a);
    if (!step) return a;
    const value = Object.prototype.hasOwnProperty.call(answersFor, step.key)
      ? answersFor[step.key]
      : step.optional
        ? SKIPPED
        : undefined;
    if (value === undefined) throw new Error(`no answer supplied for required step ${step.key}`);
    const dot = step.key.indexOf(".");
    if (dot === -1) a[step.key] = value;
    else {
      const group = step.key.slice(0, dot);
      const held = (a[group] as Record<string, unknown>) ?? {};
      a[group] = { ...held, [step.key.slice(dot + 1)]: value };
    }
  }
  throw new Error("the step machine did not settle");
}

const PLAN: StagedOutput = {
  stagingId: "a8a000",
  planHash: "hash-abcd",
  decisionToken: "6b3490fc91cf",
  summary: "Files the review.",
  steps: [],
  warnings: [],
  suggestions: [],
};

function depsFor(over: Partial<RelFlowDeps> = {}): RelFlowDeps & {
  staged: Array<{ actionId: string; payload: Record<string, unknown> }>;
} {
  const staged: Array<{ actionId: string; payload: Record<string, unknown> }> = [];
  return {
    staged,
    available: () => true,
    newKey: () => "key-1",
    stage: async (actionId, payload) => {
      staged.push({ actionId, payload: payload as Record<string, unknown> });
      return { ok: true, result: PLAN } as ToolOutcome<StagedOutput>;
    },
    execute: async () =>
      ({
        ok: true,
        result: { stagingId: "a8a000", terminalState: "success", outcome: "Filed and verified.", steps: [] },
      }) as ToolOutcome<ExecuteResult>,
    ...over,
  };
}

/* ------------------------------------------------------------- the wiring */

describe("the five routes drive the flows that already exist", () => {
  it("maps each route onto the deployed action id, and invents none", () => {
    expect(REL_FLOWS.annual.actionId).toBe("annual-review");
    expect(REL_FLOWS.covenant.actionId).toBe("covenant-review");
    expect(REL_FLOWS.valuation.actionId).toBe("collateral-valuation");
    expect(REL_FLOWS.rating.actionId).toBe("risk-rating-review");
    expect(REL_FLOWS.service.actionId).toBe("create-service-request");
  });

  it("states what each review covers AND what it produces, before it asks anything", () => {
    for (const spec of Object.values(REL_FLOWS)) {
      expect(spec.covers.length).toBeGreaterThan(40);
      expect(spec.produces.length).toBeGreaterThan(40);
      // Banker-formal: no em dashes, no exclamation points.
      expect(`${spec.covers} ${spec.produces} ${spec.approveLabel}`).not.toMatch(/[—!]/);
    }
  });

  it("reads availability off the registry rather than a second table", () => {
    const ctx = ctxFor();
    const data = { borrowers: { "001X": {} }, borrower: {}, portfolio: { accounts: [] }, meta: {} } as unknown as C360Data;
    // A relationship with no covenants cannot support the covenant review, and
    // the registry's own sentence is what the room says.
    expect(routeAvailability("covenant", data, "001X").available).toBe(false);
    expect(routeAvailability("covenant", data, "001X").reason).toBe("No covenants recorded for this relationship");
    expect(ctx.productPackageId).toBe(PACKAGE);
  });
});

/* --------------------------------------------------------- the step machine */

describe("the annual review collects what stage_annual_review takes", () => {
  it("asks the review type first, with the org's own three values", () => {
    const step = nextStep("annual", ctxFor(), {})!;
    expect(step.key).toBe("reviewType");
    expect(step.options?.map((o) => o.value)).toEqual(["Annual", "AdHoc", "Problem Loan"]);
    expect(step.optional).toBeFalsy();
  });

  it("settles after the type and two optional narratives", () => {
    const answers = driveTo("annual", ctxFor(), { reviewType: "Annual" });
    expect(Object.keys(answers)).toEqual(["reviewType", "relationshipSummary", "recommendation"]);
  });

  it("composes the account-anchored payload the tool accepts", () => {
    const ctx = ctxFor();
    const answers = driveTo("annual", ctx, { reviewType: "Annual", recommendation: "Renew at current terms." });
    const built = buildStagePayload("annual", ctx, answers, "key-1");
    expect(built.ok).toBe(true);
    const p = (built as { payload: StagePayloads["annual-review"] }).payload;
    expect(p.accountId).toBe("001X");
    expect(p.reviewType).toBe("Annual");
    expect(p.productPackageId).toBe(PACKAGE);
    expect(p.recommendationNarrative).toBe("Renew at current terms.");
    // A SKIPPED optional is an ABSENT value on the wire, never the sentinel.
    expect(p.relationshipSummary).toBeNull();
    expect(JSON.stringify(p)).not.toContain(SKIPPED);
  });
});

describe("the covenant review is package-anchored bulk", () => {
  const ctx = ctxFor();

  it("offers only covenants the org gave an id", () => {
    const step = nextStep("covenant", ctx, {})!;
    expect(step.key).toBe("covenants");
    expect(step.kind).toBe("multi");
    expect(step.options?.map((o) => o.value)).toEqual(["cov1", "cov2"]);
  });

  it("asks a verdict for every covenant chosen, one at a time", () => {
    const a: Answers = { covenants: ["cov1", "cov2"] };
    expect(nextStep("covenant", ctx, a)!.key).toBe("covenantStatuses.cov1");
    a.covenantStatuses = { cov1: "Compliant" };
    expect(nextStep("covenant", ctx, a)!.key).toBe("covenantStatuses.cov2");
  });

  it("offers only the three statuses the tool will write", () => {
    const step = nextStep("covenant", ctx, { covenants: ["cov1"] })!;
    expect(step.options?.map((o) => o.value)).toEqual(["Compliant", "Waived", "Exception"]);
  });

  it("asks the exception reason ONLY where the verdict was Exception", () => {
    const a: Answers = {
      covenants: ["cov1", "cov2"],
      covenantStatuses: { cov1: "Compliant", cov2: "Exception" },
      covenantObservedValues: { cov1: SKIPPED, cov2: SKIPPED },
    };
    const step = nextStep("covenant", ctx, a)!;
    expect(step.key).toBe("covenantReasons.cov2");
    expect(step.options?.map((o) => o.value)).toEqual(["Breached", "Overdue"]);
  });

  it("composes assessments with the org's own keys, and the member selection stated", () => {
    const answers = driveTo("covenant", ctx, {
      covenants: ["cov1", "cov2"],
      "covenantStatuses.cov1": "Compliant",
      "covenantStatuses.cov2": "Exception",
      "covenantObservedValues.cov1": 1.42,
      "covenantReasons.cov2": "Breached",
      assessmentNarrative: "Q2 statements tested.",
    });
    const built = buildStagePayload("covenant", ctx, answers, "key-1");
    const p = (built as { payload: StagePayloads["covenant-review"] }).payload;
    expect(p.productPackageId).toBe(PACKAGE);
    expect(p.covenantIds).toEqual(["cov1", "cov2"]);
    expect(p.assessments).toEqual([
      { covenantId: "cov1", status: "Compliant", observedValue: 1.42, reasonForException: null, narrative: "Q2 statements tested.", comments: null },
      { covenantId: "cov2", status: "Exception", observedValue: null, reasonForException: "Breached", narrative: "Q2 statements tested.", comments: null },
    ]);
    // The superseded single shape is GONE from the org. Sending its fields makes
    // the new shape unreachable on the wire, so none of them may appear.
    expect(p).not.toHaveProperty("accountId");
    expect(p).not.toHaveProperty("covenantComplianceId");
    // allowNonPending is sent only when the banker turns it on; a false would
    // claim a decision nobody made.
    expect(p).not.toHaveProperty("allowNonPending");
  });

  it("refuses to compose when a chosen covenant carries no verdict", () => {
    const built = buildStagePayload("covenant", ctx, { covenants: ["cov1", "cov2"], covenantStatuses: { cov1: "Compliant" } }, "k");
    expect(built.ok).toBe(false);
    expect((built as { blocked: string }).blocked).toContain("needs a verdict");
  });

  it("refuses to compose without a package anchor, in the org's own terms", () => {
    const noPackage = ctxFor({ snapshot: { accountId: "001X", name: "Testco" } as never });
    const built = buildStagePayload("covenant", noPackage, { covenants: [], covenantStatuses: {} }, "k");
    expect(built.ok).toBe(false);
    expect((built as { blocked: string }).blocked).toContain("anchored on the product package");
  });
});

describe("the collateral valuation is package-anchored bulk too", () => {
  const ctx = ctxFor();

  it("offers each asset ONCE, even cross-pledged, and only with a collateral id", () => {
    const step = nextStep("valuation", ctx, {})!;
    expect(step.key).toBe("records");
    expect(step.options?.map((o) => o.value)).toEqual(["a35A", "a35B"]);
  });

  it("asks a figure per asset, then the exercise's own four facts", () => {
    const a: Answers = { records: ["a35A"] };
    expect(nextStep("valuation", ctx, a)!.key).toBe("recordValues.a35A");
    a.recordValues = { a35A: 4_200_000 };
    expect(nextStep("valuation", ctx, a)!.key).toBe("valuationDate");
    a.valuationDate = "2026-08-31";
    expect(nextStep("valuation", ctx, a)!.key).toBe("type");
    a.type = "Net Orderly Liquidation Value";
    expect(nextStep("valuation", ctx, a)!.key).toBe("source");
  });

  it("offers the org's complete 16 bases and 14 sources, never an invented set", () => {
    const basis = nextStep("valuation", ctx, { records: ["a35A"], recordValues: { a35A: 1 }, valuationDate: "2026-08-31" })!;
    expect(basis.options).toHaveLength(16);
    expect(basis.options?.map((o) => o.value)).toContain("Net Orderly Liquidation Value");
  });

  it("composes items[] only, with the date and basis shared and the figure per record", () => {
    const answers = driveTo("valuation", ctx, {
      records: ["a35A", "a35B"],
      "recordValues.a35A": 4_200_000,
      "recordValues.a35B": 900_000,
      valuationDate: "2026-08-31",
      type: "Net Orderly Liquidation Value",
      source: "Appraisal",
      primary: "no",
    });
    const built = buildStagePayload("valuation", ctx, answers, "key-1");
    const p = (built as { payload: StagePayloads["collateral-valuation"] }).payload;
    expect(p.productPackageId).toBe(PACKAGE);
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toEqual({
      collateralId: "a35A",
      value: 4_200_000,
      valuationDate: "2026-08-31",
      type: "Net Orderly Liquidation Value",
      source: "Appraisal",
      description: null,
      primary: false,
    });
    // Mixing flat fields with items[] is REFUSED by the tool.
    expect(p).not.toHaveProperty("collateralId");
    expect(p).not.toHaveProperty("value");
  });

  it("refuses a batch past the tool's cap rather than letting the org refuse it", () => {
    const many = Array.from({ length: VALUATION_BATCH_CAP + 1 }, (_, i) => `a35${i}`);
    const built = buildStagePayload("valuation", ctx, { records: many, valuationDate: "2026-08-31" }, "k");
    expect(built.ok).toBe(false);
    expect((built as { blocked: string }).blocked).toContain(String(VALUATION_BATCH_CAP));
  });

  it("refuses without the valuation date, which the tool never defaults", () => {
    const built = buildStagePayload("valuation", ctx, { records: ["a35A"] }, "k");
    expect(built.ok).toBe(false);
  });
});

describe("the risk-rating review is account-level and carries no facility scope", () => {
  const ctx = ctxFor();

  it("asks the four named factors, every one of them skippable", () => {
    const answers = driveTo("rating", ctx, {});
    expect(Object.keys(answers)).toEqual([
      "cashFlowCoverage",
      "revenueGrowth",
      "managementExperience",
      "creditScore",
      "overrideComment",
    ]);
  });

  it("composes four NAMED scalars, never a factor map, and no override key", () => {
    const answers = driveTo("rating", ctx, { cashFlowCoverage: 1.35, creditScore: 680, overrideComment: "Held at 5." });
    const built = buildStagePayload("rating", ctx, answers, "key-1");
    const p = (built as { payload: StagePayloads["risk-rating-review"] }).payload;
    expect(p.accountId).toBe("001X");
    expect(p.cashFlowCoverageActual).toBe(1.35);
    expect(p.creditScoreActual).toBe(680);
    expect(p.revenueGrowthActual).toBeNull();
    expect(p.computedRiskGradeValue).toBe(5);
    expect(p.comments).toBe("Held at 5.");
    expect(p).not.toHaveProperty("factorScores");
    expect(Object.keys(p).some((k) => /override/i.test(k))).toBe(false);
  });

  it("refuses the grade override by name rather than guessing its wire key", () => {
    expect(asksForOverride("override the grade to 6", "rating")).toBe(true);
    expect(asksForOverride("override the grade to 6", "covenant")).toBe(false);
    expect(OVERRIDE_NOT_FILEABLE).toContain("has never been observed");
  });
});

describe("the service request is purely account-level", () => {
  const ctx = ctxFor();

  it("takes the org's word for type and origin rather than offering an invented set", () => {
    // Case.Type and Case.Origin have never been read off this org, so there is
    // no cached value set and the room must not compose one.
    const step = nextStep("service", ctx, {})!;
    expect(step.key).toBe("type");
    expect(step.kind).toBe("text");
    expect(step.options).toBeUndefined();
  });

  it("composes the one free-text field the wire actually carries", () => {
    const answers = driveTo("service", ctx, {
      type: "Service Request",
      origin: "Agent",
      subject: "Payoff quote for the equipment loan",
      detail: "Client asked by email on the 29th.",
    });
    const built = buildStagePayload("service", ctx, answers, "key-1");
    const p = (built as { payload: StagePayloads["create-service-request"] }).payload;
    expect(p.accountId).toBe("001X");
    expect(p.requestType).toBe("Service Request");
    expect(p.origin).toBe("Agent");
    expect(p.summary).toBe("Payoff quote for the equipment loan");
    // The detail rides the AUDIT RATIONALE, which is on the wire. There is no
    // `description` key on this request class and the room does not invent one.
    expect(p).not.toHaveProperty("description");
    expect(p.rationale).toContain("Client asked by email on the 29th.");
  });

  it("offers the client's own words as a chip where the read staged a request", () => {
    const withRequest = ctxFor({
      requests: [{ summary: "Please send a payoff quote", reference: { kind: "email", id: "AAM1" } }],
    } as never);
    const step = nextStep("service", withRequest, { type: "x", origin: "y" })!;
    expect(step.key).toBe("subject");
    expect(step.options?.[0].value).toBe("Please send a payoff quote");
  });
});

/* ------------------------------------------------------------- staging path */

describe("staging and the token", () => {
  const ctx = ctxFor();
  const answers = driveTo("annual", ctx, { reviewType: "Annual" });

  it("stages against the route's own tool and returns the ORG's token", async () => {
    const deps = depsFor();
    const staged = await stageRelPlan("annual", ctx, answers, "key-1", deps);
    expect(deps.staged[0].actionId).toBe("annual-review");
    expect(deps.staged[0].payload.idempotencyKey).toBe("key-1");
    expect(staged.decisionToken).toBe("6b3490fc91cf");
    expect(staged.planHash).toBe("hash-abcd");
  });

  it("refuses to stage with no connector, and burns nothing getting there", async () => {
    const stage = vi.fn();
    const deps = depsFor({ available: () => false, stage });
    await expect(stageRelPlan("annual", ctx, answers, "k", deps)).rejects.toThrow(/not connected to the bank's systems/);
    expect(stage).not.toHaveBeenCalled();
    expect(NO_CONNECTOR).toContain("nothing here is ever simulated");
  });

  it("withholds the token when the ORG says execution is held", async () => {
    const deps = depsFor({
      stage: async () => ({ ok: true, result: { ...PLAN, executionHeld: true, heldReason: "LV06." } }) as ToolOutcome<StagedOutput>,
    });
    const staged = await stageRelPlan("annual", ctx, answers, "k", deps);
    expect(staged.decisionToken).toBeNull();
    expect(staged.plan.heldReason).toBe("LV06.");
  });

  it("refuses a plan that would write outside the transition allowlist", async () => {
    // Deliberately an object NOTHING in this cockpit is allowed to write. The
    // allowlist grows (the wave-2 objects landed on it), so this asserts the
    // GUARD rather than the membership of any one object.
    const deps = depsFor({
      stage: async () =>
        ({
          ok: true,
          result: { ...PLAN, steps: [{ id: "s1", type: "write", label: "x", objectName: "LLC_BI__Not_A_Real_Object__c" }] },
        }) as ToolOutcome<StagedOutput>,
    });
    await expect(stageRelPlan("annual", ctx, answers, "k", deps)).rejects.toThrow(/outside what this cockpit permits/);
  });

  it("refuses a plan carrying a write-target record id, because something was already written", async () => {
    const deps = depsFor({
      stage: async () => ({ ok: true, result: { ...PLAN, valuationId: "a34bb000003EzUvAAK" } }) as ToolOutcome<StagedOutput>,
    });
    await expect(stageRelPlan("annual", ctx, answers, "k", deps)).rejects.toThrow(/may already have been written/);
  });

  it("carries the org's legal list out of a refusal so the room can re-offer it", async () => {
    const deps = depsFor({
      stage: async () =>
        ({
          ok: false,
          error: { code: "VALIDATION_FAILED", message: "bad value", legalValues: ["Appraisal", "Invoice / Bill of Sale"] },
        }) as ToolOutcome<StagedOutput>,
    });
    await expect(stageRelPlan("annual", ctx, answers, "k", deps)).rejects.toMatchObject({
      legalValues: ["Appraisal", "Invoice / Bill of Sale"],
    });
  });
});

describe("executing", () => {
  it("redeems the token through the route's own execute tool", async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      result: { stagingId: "a8a000", terminalState: "success", outcome: "Filed.", steps: [] },
    });
    const deps = depsFor({ execute });
    await executeRelPlan("covenant", {
      idempotencyKey: "key-1",
      stagingId: "a8a000",
      planHash: "hash-abcd",
      decisionToken: "6b3490fc91cf",
      approverUserId: "005bb000001AAAAAAA",
    }, deps);
    expect(execute.mock.calls[0][0]).toBe("covenant-review");
    // The STAGE key is reused on execute, and the original token is resent.
    expect(execute.mock.calls[0][1]).toMatchObject({ idempotencyKey: "key-1", decisionToken: "6b3490fc91cf" });
  });

  it("stamps a post-dispatch refusal, so the room stops offering the approval", async () => {
    const deps = depsFor({
      execute: async () => ({ ok: false, error: { code: "TOKEN_REFUSED", message: "already redeemed" } }) as ToolOutcome<ExecuteResult>,
    });
    const err = await executeRelPlan("annual", {
      idempotencyKey: "k",
      stagingId: "s",
      planHash: "h",
      decisionToken: "t",
      approverUserId: "005bb000001AAAAAAA",
    }, deps).catch((e) => e);
    expect(err).toBeInstanceOf(RelFlowError);
    expect((err as RelFlowError).dispatched).toBe(true);
  });
});

/* -------------------------------------------------------------- the dossier */

describe("the dossier is built from the real result", () => {
  const ctx = ctxFor();

  it("names each covenant and the verdict that was written", () => {
    const answers = { covenants: ["cov1"], covenantStatuses: { cov1: "Compliant" } };
    const rows = dossierRowsFor("covenant", ctx, answers, {
      stagingId: "s",
      terminalState: "success",
      outcome: "ok",
      steps: [],
      approvalChainStarted: true,
    } as ExecuteResult);
    expect(rows[0]).toEqual({ icon: "covenant", label: "Debt Service Coverage", value: "Compliant" });
    expect(rows[1]).toEqual({ icon: "package", label: "approval chain", value: "started" });
  });

  it("never claims a coverage improvement the org did not report", () => {
    const rows = dossierRowsFor("valuation", ctx, { records: ["a35A"], recordValues: { a35A: 4_200_000 } }, {
      stagingId: "s",
      terminalState: "success",
      outcome: "ok",
      steps: [],
      collateralValueMoved: false,
    } as ExecuteResult);
    expect(rows.at(-1)).toEqual({ icon: "commit", label: "collateral value", value: "unchanged" });
  });

  it("renders a null recordName as the failed verification it is", () => {
    // `recordName: null` means the read-back did not confirm the write. Papering
    // over it would hide a real failure behind copy that reads like success.
    const rows = dossierRowsFor("annual", ctx, {}, {
      stagingId: "s",
      terminalState: "success",
      outcome: "ok",
      steps: [],
      recordName: null,
    } as ExecuteResult);
    expect(rows[0].value).toBe("filed, unverified");
  });
});

/* --------------------------------------------------------- creation semantics */

describe("the two relationship-level creates are PROPOSAL-ONLY", () => {
  it("recognises a covenant create inside the covenant review", () => {
    expect(readCreateAsk("add a covenant on the relationship", "covenant")).toBe("covenant");
    expect(readCreateAsk("assess the covenant", "covenant")).toBeNull();
    // A create ask is route-scoped: the covenant gap is not raised in a valuation.
    expect(readCreateAsk("add a covenant", "valuation")).toBeNull();
  });

  it("recognises a collateral create inside the valuation", () => {
    expect(readCreateAsk("create a new collateral asset the borrower owns", "valuation")).toBe("collateral");
    expect(readCreateAsk("value the collateral", "valuation")).toBeNull();
  });

  it("states the refusal and names the org-side gap for each, without composing a payload", () => {
    expect(CREATE_GAPS.covenant.line).toContain("cannot file it");
    expect(CREATE_GAPS.covenant.orgGap).toContain("stage_covenant_review accepts no create input");
    expect(CREATE_GAPS.collateral.orgGap).toContain("always terminates in a pledge");
    for (const gap of Object.values(CREATE_GAPS)) expect(`${gap.line} ${gap.orgGap}`).not.toMatch(/[—!]/);
  });

  it("keeps every create key out of the two payloads the room composes", () => {
    // The only deployed covenant create and the only deployed collateral create
    // both live on stage_loan_modification and both terminate on a facility
    // clone. Neither key may appear in anything this room sends.
    const ctx = ctxFor();
    const covenant = buildStagePayload(
      "covenant",
      ctx,
      { covenants: ["cov1"], covenantStatuses: { cov1: "Compliant" } },
      "k",
    );
    const valuation = buildStagePayload(
      "valuation",
      ctx,
      { records: ["a35A"], recordValues: { a35A: 1 }, valuationDate: "2026-08-31" },
      "k",
    );
    const sent = JSON.stringify([covenant, valuation]);
    for (const key of ["covenantAddsJson", "pledgeAddsJson", "newCollateral", "accountCollateral"]) {
      expect(sent).not.toContain(key);
    }
  });
});

/* =============================================================================
   THE COVENANT ROUTE REFUSES FIRST, AND OFFERS THE OPT-IN THE TOOL TAKES.

   Two failures this holds against. The first is the worst moment the addendum
   names: a relationship with no compliance rows was asked which covenants, then
   a verdict each, then a figure each, then a narrative, and only then did the
   org refuse all six. The second is quieter: `allowNonPending` has been on the
   tool since WS0.5 and the room never offered it, so a row that was open and
   not Pending could only ever be REFUSED.
   ============================================================================= */

const ROWLESS = {
  covenants: {
    covenants: [
      { covenantId: "cov1", covenantType: "Debt Service Coverage of Borrower", thresholdValue: 1.25, actualValue: 1.38 },
      { covenantId: "cov2", covenantType: "Minimum Liquidity", thresholdValue: 5_000_000, actualValue: 6_800_000 },
    ],
  },
};

describe("the covenant review says what the book cannot do, before it asks", () => {
  it("blocks the whole route where NOT ONE covenant carries a compliance row", () => {
    const ctx = ctxFor(ROWLESS as never);
    const blocked = relRouteBlock("covenant", ctx);
    expect(blocked).toContain("no open test period on any of the 2 covenants");
    expect(blocked).toContain("recording an assessment needs a compliance row");
    // AND IT ASKS NOTHING. Not one step is reached.
    expect(nextStep("covenant", ctx, {})).toBeNull();
  });

  it("blocks on the package anchor before it reaches the compliance problem", () => {
    // Hartwell's shipped snapshot carries no productPackageId, so this is the
    // refusal the founder actually sees on the demo fixture today.
    const ctx = ctxFor({ ...ROWLESS, snapshot: { accountId: "001X", name: "Testco" } } as never);
    expect(relRouteBlock("covenant", ctx)).toContain("anchored on the product package");
    expect(relRouteBlock("valuation", ctx)).toContain("anchored on the product package");
  });

  it("does not block a relationship whose rows are there", () => {
    expect(relRouteBlock("covenant", ctxFor())).toBeNull();
    expect(relRouteBlock("annual", ctxFor())).toBeNull();
    expect(relRouteBlock("rating", ctxFor())).toBeNull();
    expect(relRouteBlock("service", ctxFor())).toBeNull();
  });

  it("shows a covenant with no row DISABLED, carrying its reason, never hidden", () => {
    const mixed = ctxFor({
      covenants: {
        covenants: [
          { covenantId: "cov1", covenantType: "Debt Service Coverage", latestComplianceStatus: "Pending" },
          { covenantId: "cov2", covenantType: "Minimum Liquidity" },
        ],
      },
    } as never);
    const step = nextStep("covenant", mixed, {})!;
    expect(step.options?.map((o) => o.value)).toEqual(["cov1", "cov2"]);
    expect(step.options?.[0].disabled).toBeFalsy();
    expect(step.options?.[1].disabled).toBe(true);
    expect(step.options?.[1].reason).toContain("no compliance row");
  });

  it("carries the read's own rail on every covenant option", () => {
    const step = nextStep("covenant", ctxFor({
      covenants: {
        covenants: [
          {
            covenantId: "cov1",
            covenantType: "Debt Service Coverage",
            thresholdValue: 1.25,
            actualValue: 1.38,
            latestComplianceStatus: "Pending",
          },
        ],
      },
    } as never), {})!;
    expect(step.options?.[0].detail).toContain("1.38× vs ≥ 1.25×");
    expect(step.options?.[0].detail).toContain("row at Pending");
  });
});

describe("the covenant review proposes the figure and offers the opt-in", () => {
  const withRows = (statuses: string[]) =>
    ctxFor({
      covenants: {
        covenants: statuses.map((status, i) => ({
          covenantId: `cov${i + 1}`,
          covenantType: i === 0 ? "Debt Service Coverage" : "Minimum Liquidity",
          thresholdValue: 1.25,
          actualValue: 1.38,
          latestComplianceId: `a2X${i}`,
          latestComplianceStatus: status,
        })),
      },
    } as never);

  it("PROPOSES the figure the read carries rather than asking cold", () => {
    const ctx = withRows(["Pending"]);
    const step = nextStep("covenant", ctx, { covenants: ["cov1"], covenantStatuses: { cov1: "Compliant" } })!;
    expect(step.key).toBe("covenantObservedValues.cov1");
    expect(step.ask).toContain("The read carries 1.38× vs ≥ 1.25×");
    // AN OPTION, NEVER A DEFAULT. The banker still owns the answer.
    expect(step.options?.[0].value).toBe("1.38");
    expect(step.optional).toBe(true);
  });

  it("names the field the tool ACTUALLY writes on both display peeks", () => {
    const ctx = withRows(["Pending"]);
    const figure = nextStep("covenant", ctx, { covenants: ["cov1"], covenantStatuses: { cov1: "Compliant" } })!;
    // Was LLC_BI__Observed_Value__c, which the tool does not write.
    expect(figure.target?.field).toBe("LLC_BI__Historic_Financial_Indicator__c");
    const basis = nextStep("covenant", ctx, {
      covenants: ["cov1"],
      covenantStatuses: { cov1: "Compliant" },
      covenantObservedValues: { cov1: 1.38 },
    })!;
    // Was LLC_BI__Narrative__c. The tool writes Agentic_AI_Response__c.
    expect(basis.target?.field).toBe("Agentic_AI_Response__c");
  });

  it("offers allowNonPending ONLY where a chosen row is not Pending, and says the schedule holds", () => {
    const ctx = withRows(["In Progress"]);
    const step = nextStep("covenant", ctx, {
      covenants: ["cov1"],
      covenantStatuses: { cov1: "Compliant" },
      covenantObservedValues: { cov1: 1.38 },
    })!;
    expect(step.key).toBe("allowNonPending");
    expect(step.ask).toContain("at In Progress, not Pending");
    expect(step.options?.[0].detail).toContain("the schedule does not advance");
  });

  it("never offers it where every chosen row is Pending", () => {
    const ctx = withRows(["Pending", "In Progress"]);
    const answers: Answers = {
      covenants: ["cov1"],
      covenantStatuses: { cov1: "Compliant" },
      covenantObservedValues: { cov1: 1.38 },
    };
    // cov2 is the non-Pending one and it was NOT chosen.
    expect(nextStep("covenant", ctx, answers)!.key).toBe("assessmentNarrative");
  });

  it("travels the flag only where the banker said yes out loud", () => {
    const ctx = withRows(["In Progress"]);
    const base: Answers = {
      covenants: ["cov1"],
      covenantStatuses: { cov1: "Compliant" },
      covenantObservedValues: { cov1: 1.38 },
      assessmentNarrative: SKIPPED,
    };
    const yes = buildStagePayload("covenant", ctx, { ...base, allowNonPending: "yes" }, "key-1");
    expect((yes as { payload: StagePayloads["covenant-review"] }).payload.allowNonPending).toBe(true);
    // AN ABSENT KEY IS THE TOOL'S OWN DEFAULT. Sending `false` would claim the
    // question had been asked when it had not.
    const no = buildStagePayload("covenant", ctx, { ...base, allowNonPending: "no" }, "key-1");
    expect((no as { payload: StagePayloads["covenant-review"] }).payload).not.toHaveProperty("allowNonPending");
    const never = buildStagePayload("covenant", ctx, base, "key-1");
    expect((never as { payload: StagePayloads["covenant-review"] }).payload).not.toHaveProperty("allowNonPending");
  });
});

/* =============================================================================
   THE VALUATION STOPS HARDCODING TWO INPUTS THE TOOL ALWAYS TOOK.

   `primary: false` and `description: null` were written into every payload the
   room composed. So a banker filing the valuation that supersedes the one on
   file could not say so, and the appraiser who struck the figure went
   unrecorded on a record whose whole purpose is provenance.
   ============================================================================= */

describe("the valuation collects its primary flag and its note", () => {
  const ctx = ctxFor();
  const upTo = (extra: Record<string, unknown>): Answers => ({
    records: ["a35A"],
    recordValues: { a35A: 11_400_000 },
    valuationDate: "2026-08-31",
    type: "Net Orderly Liquidation Value",
    source: "Receivables Aging",
    ...extra,
  });

  it("asks whether it becomes the primary, and says what each answer means", () => {
    const step = nextStep("valuation", ctx, upTo({}))!;
    expect(step.key).toBe("primary");
    expect(step.kind).toBe("chips");
    expect(step.optional).toBeFalsy();
    expect(step.options?.[0].detail).toContain("supersedes");
    expect(step.options?.[1].detail).toContain("joins the ladder");
    expect(step.target?.field).toBe("LLC_BI__Primary__c");
  });

  it("then asks who struck the figure, and lets it be skipped", () => {
    const step = nextStep("valuation", ctx, upTo({ primary: "yes" }))!;
    expect(step.key).toBe("description");
    expect(step.optional).toBe(true);
    expect(step.target?.field).toBe("LLC_BI__Valuation_Description__c");
  });

  it("travels both when answered", () => {
    const built = buildStagePayload(
      "valuation",
      ctx,
      upTo({ primary: "yes", description: "Q3 field exam, Hilco" }),
      "key-1",
    );
    const p = (built as { payload: StagePayloads["collateral-valuation"] }).payload;
    expect(p.items[0].primary).toBe(true);
    expect(p.items[0].description).toBe("Q3 field exam, Hilco");
  });

  it("travels false and null when skipped, and never the skip sentinel", () => {
    const built = buildStagePayload("valuation", ctx, upTo({ primary: "no", description: SKIPPED }), "key-1");
    const p = (built as { payload: StagePayloads["collateral-valuation"] }).payload;
    expect(p.items[0].primary).toBe(false);
    expect(p.items[0].description).toBeNull();
    expect(JSON.stringify(p)).not.toContain(SKIPPED);
  });

  it("names the PLEDGE lendable value on every asset option, never the asset formula", () => {
    const withOverride = ctxFor({
      exposure: {
        facilities: [
          {
            loanId: "0Cb1",
            status: "Active",
            productPackageId: PACKAGE,
            collateral: [
              {
                collateralId: "a35A",
                collateralDescription: "Inventory, Fort Wayne",
                collateralType: "UCC-Inventory",
                collateralValue: 8_000_000,
                currentLendableValue: 4_000_000,
                advanceRateSource: "Pledge override",
              },
            ],
          },
        ],
      },
    } as never);
    const step = nextStep("valuation", withOverride, {})!;
    // $6.4MM would be the asset formula at the 80 percent type rate. The bank
    // lends against the pledge, and the pledge carries a 50 percent override.
    expect(step.options?.[0].detail).toContain("$4M lendable");
    expect(step.options?.[0].detail).toContain("Pledge override");
    expect(step.options?.[0].detail).not.toContain("$6.4");
  });

  it("says the org offers no BOV and no Field Exam, rather than picking one", () => {
    const step = nextStep("valuation", ctx, {
      records: ["a35A"],
      recordValues: { a35A: 1 },
      valuationDate: "2026-08-31",
      type: "Net Orderly Liquidation Value",
    })!;
    expect(step.key).toBe("source");
    expect(step.placeholder).toContain("No BOV and no Field Exam");
  });
});
