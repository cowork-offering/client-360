// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeAction,
  executionHeldReason,
  isExecutionHeld,
  resolveApproverUserId,
  isWriteAction,
  parseLegalValues,
  parseProvenance,
  stageAction,
  WRITE_TOOLS,
} from "./writeTools";
import { SERVERS, TOOLS } from "./mcp";
import { validatePlan } from "../actions/transitionAllowlist";

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

/** The observed positional envelope: content[i] carries outputValues for input i. */
const envelope = (outputValues: unknown) => ({
  content: [{ actionName: "stage_collateral_valuation", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }],
});

function installMcp(payload: unknown) {
  const callTool = vi.fn().mockResolvedValue({ payload });
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return callTool;
}

/** The observed happy-path StageResult. */
const STAGE_RESULT = {
  ok: true,
  error: null,
  result: {
    stagingId: "a8abb00001KtalSAAR",
    planHash: "9f2c1d",
    decisionToken: "dt-server-001",
    replayed: false,
    accountId: "001bb00001DLtRMAA1",
    productPackageId: "a5Fbb000000HA1NEAW",
    summary: "Files a collateral valuation.",
    warnings: ["The roll-up may not fire."],
    steps: [
      {
        id: "s1",
        type: "write",
        label: "Create the collateral valuation",
        objectName: "LLC_BI__Collateral_Valuation__c",
        fields: ["LLC_BI__Value__c", "LLC_BI__Active__c"],
        automationWoken: ["CollateralValuationTrigger"],
        verification: "SELECT Id FROM LLC_BI__Collateral_Valuation__c",
        state: "pending",
      },
    ],
    provenanceJson: '{"LLC_BI__Value__c":{"source":"NCINO_RECORD"}}',
  },
};

/** The observed domain failure. */
const VALIDATION_FAILED = {
  ok: false,
  result: null,
  error: {
    code: "VALIDATION_FAILED",
    message: "type is not a legal value on this org. Legal values are: Fair Market Value - Real Estate, Net Orderly Liquidation Value, As Is Value",
    orgError: "FIELD_INTEGRITY_EXCEPTION",
    idempotencyKey: "idem-1",
    resumable: false,
  },
};

const PAYLOAD = { idempotencyKey: "idem-1", collateralId: "a34bb00000398KnAAI", value: 1000 };

describe("tool registry", () => {
  it("names every stage tool and every execute tool that exists", () => {
    expect(Object.values(WRITE_TOOLS).flatMap((t) => [t.stage, t.execute]).filter(Boolean).sort()).toEqual([
      "execute_annual_review",
      "execute_collateral_valuation",
      "execute_loan_modification",
      "execute_new_facility",
      "execute_risk_rating_review",
      "execute_service_request",
      "stage_annual_review",
      "stage_collateral_valuation",
      "stage_covenant_review",
      "stage_loan_modification",
      "stage_new_facility",
      "stage_renewal",
      "stage_risk_rating_review",
      "stage_service_request",
    ]);
  });

  it("holds execution for renewal only, with no tool name invented", () => {
    // No execute_renewal was built, so a null is the honest record of that; a
    // plausible-looking name would be a lie the panel would eventually call.
    expect(WRITE_TOOLS.renewal.execute).toBeNull();
    // Founder-gated rather than unbuilt, and held for its own reason.
    expect(WRITE_TOOLS["covenant-review"].execute).toBeNull();
    expect(isExecutionHeld("renewal")).toBe(true);
    expect(isExecutionHeld("covenant-review")).toBe(true);
    expect(isExecutionHeld("collateral-valuation")).toBe(false);
  });

  it("no longer holds the modification: the client hold is gone and the tool is named", () => {
    // WS0.5: execute_loan_modification is deployed and was exercised live. The
    // cockpit adds no hold of its own; the ORG still holds via the staged plan.
    expect(WRITE_TOOLS["loan-modification"].execute).toBe("execute_loan_modification");
    expect(WRITE_TOOLS["loan-modification"].heldReason).toBeNull();
    expect(isExecutionHeld("loan-modification")).toBe(false);
    expect(executionHeldReason("loan-modification")).toBeNull();
  });

  it("refuses to execute a held action rather than calling a tool that is not there", async () => {
    const callTool = installMcp(envelope({ ok: true, result: {} }));
    const out = await executeAction("renewal", {
      idempotencyKey: "k",
      stagingId: "s",
      planHash: "h",
      decisionToken: "t",
      approverUserId: "005bb00000ftouDAAQ",
    });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error.code).toBe("EXECUTION_HELD");
    expect(callTool).not.toHaveBeenCalled();
  });

  it("exposes them on the manifest constants too", () => {
    for (const t of Object.values(WRITE_TOOLS)) {
      expect(Object.values(TOOLS)).toContain(t.stage);
      if (t.execute) expect(Object.values(TOOLS)).toContain(t.execute);
    }
  });

  it("recognises exactly the three write actions", () => {
    expect(isWriteAction("collateral-valuation")).toBe(true);
    expect(isWriteAction("annual-review")).toBe(true);
    expect(isWriteAction("create-service-request")).toBe(true);
    expect(isWriteAction("generate-spreading")).toBe(false);
  });
});

describe("stage_* — the positional envelope and the typed result", () => {
  it("calls the right server and tool with a positional inputs array", async () => {
    const callTool = installMcp(envelope(STAGE_RESULT));
    await stageAction("collateral-valuation", PAYLOAD as never);
    expect(callTool).toHaveBeenCalledWith(
      SERVERS.customer360,
      "stage_collateral_valuation",
      { inputs: [PAYLOAD] },
      expect.anything(),
    );
  });

  it("never caches a staging call", async () => {
    const callTool = installMcp(envelope(STAGE_RESULT));
    await stageAction("collateral-valuation", PAYLOAD as never);
    expect(callTool.mock.calls[0][3]).toMatchObject({ cache: false });
  });

  it("maps the observed result onto StagedOutput", async () => {
    installMcp(envelope(STAGE_RESULT));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.stagingId).toBe("a8abb00001KtalSAAR");
    expect(out.result.planHash).toBe("9f2c1d");
    expect(out.result.decisionToken).toBe("dt-server-001");
    expect(out.result.productPackageId).toBe("a5Fbb000000HA1NEAW");
    expect(out.result.warnings).toHaveLength(1);
    expect(out.result.steps[0]).toMatchObject({
      id: "s1",
      type: "write",
      objectName: "LLC_BI__Collateral_Valuation__c",
      state: "pending",
    });
    expect(out.result.steps[0].fields).toEqual(["LLC_BI__Value__c", "LLC_BI__Active__c"]);
  });

  it("parses provenanceJson, which arrives as a STRING", async () => {
    installMcp(envelope(STAGE_RESULT));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    if (!out.ok) throw new Error("expected ok");
    expect(out.result.provenance).toMatchObject({ "LLC_BI__Value__c": { source: "NCINO_RECORD" } });
  });

  it("survives a malformed provenanceJson rather than failing the stage", async () => {
    installMcp(envelope({ ...STAGE_RESULT, result: { ...STAGE_RESULT.result, provenanceJson: "{not json" } }));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.provenance).toBeUndefined();
  });

  it("carries no record id, because stage wrote nothing", async () => {
    installMcp(envelope(STAGE_RESULT));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    if (!out.ok) throw new Error("expected ok");
    // The staging id is ours, not an org record; the steps carry field names only.
    for (const s of out.result.steps) {
      for (const f of s.fields ?? []) expect(f).not.toMatch(/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/);
    }
  });

  it("a staged plan from the live tool passes the transition allowlist", async () => {
    installMcp(envelope(STAGE_RESULT));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    if (!out.ok) throw new Error("expected ok");
    expect(validatePlan(out.result.steps)).toEqual([]);
  });
});

describe("A33.5.1 — domain failure is not transport failure", () => {
  it("reports ok:false as a DOMAIN error, not a transport one", async () => {
    installMcp(envelope(VALIDATION_FAILED));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("VALIDATION_FAILED");
    expect(out.error.orgError).toBe("FIELD_INTEGRITY_EXCEPTION");
    expect(out.error.resumable).toBe(false);
    expect(out.error.code).not.toBe("TRANSPORT");
  });

  it("reports a transport failure separately", async () => {
    installMcp({ content: [{ isSuccess: false, errors: ["row locked"], outputValues: null }] });
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("TRANSPORT");
  });

  it("reports a shapeless response rather than pretending it succeeded", async () => {
    installMcp(envelope({ ok: undefined }));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("UNEXPECTED");
  });
});

describe("legal picklist values come from the tool, never from us", () => {
  it("lifts the legal set out of a VALIDATION_FAILED message", async () => {
    installMcp(envelope(VALIDATION_FAILED));
    const out = await stageAction("collateral-valuation", PAYLOAD as never);
    if (out.ok) throw new Error("expected failure");
    expect(out.error.legalValues).toEqual([
      "Fair Market Value - Real Estate",
      "Net Orderly Liquidation Value",
      "As Is Value",
    ]);
  });

  it("parses both phrasings and tolerates neither", () => {
    expect(parseLegalValues("bad value. Legal values are: A, B")).toEqual(["A", "B"]);
    expect(parseLegalValues("must be one of: X; Y or Z")).toEqual(["X", "Y", "Z"]);
    expect(parseLegalValues("something else entirely")).toBeUndefined();
  });

  it("parseProvenance rejects non-objects", () => {
    expect(parseProvenance("[1,2]")).toBeUndefined();
    expect(parseProvenance("")).toBeUndefined();
    expect(parseProvenance(undefined)).toBeUndefined();
  });
});

describe("execute_* — the shape read from the Apex Request classes", () => {
  const EXEC_PAYLOAD = {
    idempotencyKey: "idem-1",
    stagingId: "a8abb00001KtalSAAR",
    planHash: "9f2c1d",
    decisionToken: "dt-server-001",
    approverUserId: "005xx",
  };

  const EXEC_RESULT = {
    ok: true,
    error: null,
    result: {
      stagingId: "a8abb00001KtalSAAR",
      valuationId: "a3Abb0000012345AAA",
      terminalState: "partial",
      outcome: "Valuation filed, collateral value unchanged.",
      collateralValueMoved: false,
      replayed: false,
      steps: [
        { id: "s1", type: "write", label: "Create the valuation", state: "verified" },
        { id: "s2", type: "verification", label: "Re-query the collateral", state: "filed_unverified", detail: "no roll-up observed" },
      ],
    },
  };

  it("sends exactly the five required fields", async () => {
    const callTool = installMcp(envelope(EXEC_RESULT));
    await executeAction("collateral-valuation", EXEC_PAYLOAD);
    const sent = callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> };
    expect(Object.keys(sent.inputs[0]).sort()).toEqual([
      "approverUserId",
      "decisionToken",
      "idempotencyKey",
      "planHash",
      "stagingId",
    ]);
  });

  it("never caches a write", async () => {
    const callTool = installMcp(envelope(EXEC_RESULT));
    await executeAction("collateral-valuation", EXEC_PAYLOAD);
    expect(callTool.mock.calls[0][3]).toMatchObject({ cache: false });
  });

  it("never auto-retries a write, even on a stamped-retryable failure", async () => {
    // An ambiguous transport outcome is NOT proof the tool did not run, so a
    // write is re-issued only behind a fresh gesture.
    const callTool = vi.fn().mockRejectedValue({ code: "server_unavailable", retryable: true, retryAfterMs: 1 });
    w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
    await expect(executeAction("collateral-valuation", EXEC_PAYLOAD)).rejects.toMatchObject({ ambiguous: true });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("maps the executor's step states and banker-language outcome", async () => {
    installMcp(envelope(EXEC_RESULT));
    const out = await executeAction("collateral-valuation", EXEC_PAYLOAD);
    if (!out.ok) throw new Error("expected ok");
    expect(out.result.terminalState).toBe("partial");
    expect(out.result.outcome).toMatch(/collateral value unchanged/);
    expect(out.result.collateralValueMoved).toBe(false);
    expect(out.result.steps.map((s) => s.state)).toEqual(["verified", "filed_unverified"]);
  });

  it("routes each executable action to its own execute tool", async () => {
    for (const [actionId, tools] of Object.entries(WRITE_TOOLS)) {
      if (!tools.execute) continue; // held: covered above
      const callTool = installMcp(envelope(EXEC_RESULT));
      await executeAction(actionId as keyof typeof WRITE_TOOLS, EXEC_PAYLOAD);
      expect(callTool.mock.calls[0][1]).toBe(tools.execute);
    }
  });
});


describe("resolveApproverUserId (live defect 2026-07-26)", () => {
  it("accepts a 15 or 18 character Salesforce user id", () => {
    expect(resolveApproverUserId({ userId: "005bb00000ftouDAAQ" })).toBe("005bb00000ftouDAAQ");
    expect(resolveApproverUserId({ userId: "005bb00000ftouD" })).toBe("005bb00000ftouD");
  });

  it("refuses a display name, an email and an empty view", () => {
    // The exact value the panel used to send. It failed the org's running
    // identity check before the token was ever redeemed.
    expect(resolveApproverUserId({ user: "Fabian Goetzens" })).toBeNull();
    expect(resolveApproverUserId({ user: "fabian.goetzens@connectry.io" })).toBeNull();
    expect(resolveApproverUserId({})).toBeNull();
    expect(resolveApproverUserId(undefined)).toBeNull();
  });

  it("refuses an id of another sObject type", () => {
    expect(resolveApproverUserId({ userId: "001bb00001DLtRMAA1" })).toBeNull(); // Account
    expect(resolveApproverUserId({ userId: "a34bb00000399FFAAY" })).toBeNull(); // valuation
  });

  it("prefers the staged userId over anything in the display field", () => {
    expect(resolveApproverUserId({ user: "Fabian Goetzens", userId: "005bb00000ftouDAAQ" })).toBe("005bb00000ftouDAAQ");
  });

  it("trims surrounding whitespace rather than sending it", () => {
    expect(resolveApproverUserId({ userId: "  005bb00000ftouDAAQ " })).toBe("005bb00000ftouDAAQ");
  });
});
