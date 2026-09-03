import { beforeEach, describe, expect, it } from "vitest";
import type { PlanStep } from "./stagedPlan";
import { assertNoRecordIds, isSimulationAllowed, simulateStagedOutput } from "./stagedPlan";
import {
  actionTerminal,
  applyEvent,
  blockingPrecondition,
  canResume,
  initTracker,
  nextState,
  preconditionsVerified,
  type StepState,
  type TrackerState,
} from "./tracker";
import { TRANSITION_ALLOWLIST, validatePlan, validateStep } from "./transitionAllowlist";
import { __resetSpentTokens, mintDecisionToken, redeemDecisionToken } from "./decisionToken";
import { CLOSING_LINE, FORBIDDEN_GATE_WORDS } from "../components/ConfirmGate";

const CTX = { preconditionsVerified: true, freshGesture: false, planHashMatches: false, requeried: false };
const RESUME_OK = { preconditionsVerified: true, freshGesture: true, planHashMatches: true, requeried: true };

const plan: PlanStep[] = [
  { id: "s1", type: "write", label: "write", objectName: "Case", fields: ["Status"] },
  { id: "s2", type: "verification", label: "verify", dependsOn: ["s1"] },
  { id: "s3", type: "handoff", label: "hand off", dependsOn: ["s2"] },
];

describe("A33.3.3 — every transition in the table", () => {
  const T = (from: StepState, ev: Parameters<typeof nextState>[1], ctx = CTX) => nextState(from, ev, ctx)?.to ?? null;

  it("pending to running when the executor reaches it and preconditions are verified", () => {
    expect(T("pending", { kind: "executor_reached" })).toBe("running");
  });

  it("pending to skipped_not_attempted when an earlier step ended badly", () => {
    expect(T("pending", { kind: "earlier_step_ended_badly" })).toBe("skipped_not_attempted");
  });

  it("running to verified when verification passes", () => {
    expect(T("running", { kind: "verification_passed" })).toBe("verified");
  });

  it("running to waiting when async automation is outstanding", () => {
    expect(T("running", { kind: "async_outstanding" })).toBe("waiting");
  });

  it("running to filed_unverified when verification is impossible by design", () => {
    expect(T("running", { kind: "verification_impossible", reason: "the org swallows the failure" })).toBe("filed_unverified");
  });

  it("running to failed on a deterministic org error", () => {
    expect(T("running", { kind: "org_error", message: "VALIDATION_RULE" })).toBe("failed");
  });

  it("running to ambiguous on an ambiguous transport code", () => {
    for (const code of ["server_unavailable", "upstream_error", "cancelled"]) {
      expect(T("running", { kind: "transport_ambiguous", code }), code).toBe("ambiguous");
    }
  });

  it("waiting to verified when polling succeeds inside the budget", () => {
    expect(T("waiting", { kind: "verification_passed" })).toBe("verified");
  });

  it("waiting to failed on a definite org error", () => {
    expect(T("waiting", { kind: "org_error", message: "boom" })).toBe("failed");
  });

  it("ambiguous resolves ONLY via a re-query, in both directions", () => {
    expect(T("ambiguous", { kind: "requery_resolved", verified: true }, { ...CTX, requeried: true })).toBe("verified");
    expect(T("ambiguous", { kind: "requery_resolved", verified: false }, { ...CTX, requeried: true })).toBe("failed");
  });

  it("failed and ambiguous return to running only on a qualified resume", () => {
    expect(T("failed", { kind: "resume" }, RESUME_OK)).toBe("running");
    expect(T("ambiguous", { kind: "resume" }, RESUME_OK)).toBe("running");
  });
});

describe("A33.3.3 — the negative cases that make it safe", () => {
  it("wait-budget exhaustion lands in filed_unverified, NEVER failed", () => {
    const r = nextState("waiting", { kind: "wait_budget_exhausted" }, CTX)!;
    expect(r.to).toBe("filed_unverified");
    expect(r.to).not.toBe("failed");
    expect(r.note).toMatch(/wait budget was exhausted/);
  });

  it("there is NO automatic exit from ambiguous", () => {
    for (const ev of [
      { kind: "verification_passed" as const },
      { kind: "async_outstanding" as const },
      { kind: "org_error" as const, message: "x" },
      { kind: "executor_reached" as const },
    ]) {
      expect(nextState("ambiguous", ev, CTX), ev.kind).toBeNull();
    }
    // Even the re-query event is refused unless a re-query actually happened.
    expect(nextState("ambiguous", { kind: "requery_resolved", verified: true }, CTX)).toBeNull();
  });

  it("a dependent step does NOT auto-run on a filed_unverified precondition", () => {
    let s = initTracker(plan);
    s = applyEvent(s, plan, "s1", { kind: "executor_reached" });
    s = applyEvent(s, plan, "s1", { kind: "verification_impossible", reason: "org swallows it" });
    expect(s.steps[0].state).toBe("filed_unverified");

    expect(preconditionsVerified(plan[1], s)).toBe(false);
    const after = applyEvent(s, plan, "s2", { kind: "executor_reached" });
    expect(after.steps[1].state).toBe("pending"); // held, not run
    expect(blockingPrecondition(plan[1], after)).toBe("s1");
  });

  it("terminal states never transition again", () => {
    for (const terminal of ["verified", "filed_unverified", "skipped_not_attempted"] as StepState[]) {
      expect(nextState(terminal, { kind: "executor_reached" }, CTX), terminal).toBeNull();
    }
  });
});

describe("A33.3.3 — resume preconditions, all required", () => {
  it("refuses without a fresh gesture", () => {
    const d = canResume({ freshGesture: false, planHashMatches: true, requeried: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/fresh gesture/);
  });

  it("refuses when the plan hash no longer matches, demanding a re-stage", () => {
    const d = canResume({ freshGesture: true, planHashMatches: false, requeried: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/staged again/);
  });

  it("refuses without a re-query first", () => {
    const d = canResume({ freshGesture: true, planHashMatches: true, requeried: false });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/re-queried/);
  });

  it("allows only when all three hold", () => {
    expect(canResume({ freshGesture: true, planHashMatches: true, requeried: true }).allowed).toBe(true);
  });
});

describe("cascade and terminal derivation", () => {
  function runTo(events: Array<[string, Parameters<typeof applyEvent>[3]]>): TrackerState {
    let s = initTracker(plan);
    for (const [id, ev] of events) s = applyEvent(s, plan, id, ev);
    return s;
  }

  it("a failed step marks its dependents not attempted", () => {
    const s = runTo([
      ["s1", { kind: "executor_reached" }],
      ["s1", { kind: "org_error", message: "nope" }],
    ]);
    expect(s.steps[0].state).toBe("failed");
    expect(s.steps[1].state).toBe("skipped_not_attempted");
  });

  it("success when everything verified or handed off", () => {
    const s = runTo([
      ["s1", { kind: "executor_reached" }],
      ["s1", { kind: "verification_passed" }],
      ["s2", { kind: "executor_reached" }],
      ["s2", { kind: "verification_passed" }],
      ["s3", { kind: "executor_reached" }],
      ["s3", { kind: "verification_passed" }],
    ]);
    expect(actionTerminal(s, plan)).toBe("success");
  });

  it("partial when something verified and something did not", () => {
    const s = runTo([
      ["s1", { kind: "executor_reached" }],
      ["s1", { kind: "verification_passed" }],
      ["s2", { kind: "executor_reached" }],
      ["s2", { kind: "verification_impossible", reason: "x" }],
      ["s3", { kind: "executor_reached" }],
    ]);
    expect(actionTerminal(s, plan)).toBe("partial");
  });

  it("failed when the first write failed with nothing verified", () => {
    const s = runTo([
      ["s1", { kind: "executor_reached" }],
      ["s1", { kind: "org_error", message: "nope" }],
    ]);
    expect(actionTerminal(s, plan)).toBe("failed");
  });

  it("in_progress while anything is still moving", () => {
    const s = runTo([["s1", { kind: "executor_reached" }]]);
    expect(actionTerminal(s, plan)).toBe("in_progress");
  });
});

describe("A33.3.1 — the transition allowlist", () => {
  it("encodes the table's refusals verbatim", () => {
    expect(TRANSITION_ALLOWLIST["LLC_BI__LoanRenewal__c"].mayCreate).toBe(false);
    expect(TRANSITION_ALLOWLIST["LLC_BI__LoanRenewal__c"].transitions).toEqual([]);
    expect(TRANSITION_ALLOWLIST["LLC_BI__LoanRenewal__c"].refusedOperations.join(" ")).toMatch(/deletion/);
    // The compliance row is the one object this cockpit only ever UPDATES: the
    // create is what raises the bank's covenant approval at a named human.
    expect(TRANSITION_ALLOWLIST["LLC_BI__Covenant_Compliance2__c"].mayCreate).toBe(false);
    expect(TRANSITION_ALLOWLIST["LLC_BI__Covenant_Compliance2__c"].mayUpdate).toBe(true);
    // Waived is the org's own third complete status, and never a synonym.
    expect(TRANSITION_ALLOWLIST["LLC_BI__Covenant_Compliance2__c"].transitions[0].to).toEqual([
      "Compliant",
      "Waived",
      "Exception",
    ]);
    expect(TRANSITION_ALLOWLIST["Case"].createStates).toEqual([{ field: "Status", value: "New" }]);
    expect(TRANSITION_ALLOWLIST["LLC_BI__Review__c"].createStates).toEqual([{ field: "LLC_BI__Status__c", value: "In Progress" }]);
    expect(TRANSITION_ALLOWLIST["LLC_BI__Annual_Review__c"].createStates).toEqual([{ field: "LLC_BI__Status__c", value: "In Review" }]);
  });

  it("permits exactly one Loan hop, and only with its precondition", () => {
    const hop = { id: "x", type: "write", object: "LLC_BI__Loan__c", transition: { field: "LLC_BI__Stage__c", from: "Qualification", to: "Proposal" } };
    expect(validateStep({ ...hop, satisfiedConditions: ["loan-detail-verified"] })).toEqual([]);
    // Without the verification precondition the hop is refused.
    expect(validateStep(hop)[0].reason).toMatch(/loan-detail-verified/);
    // Any other hop, in either direction, is refused.
    expect(validateStep({ ...hop, transition: { field: "LLC_BI__Stage__c", from: "Proposal", to: "Qualification" }, satisfiedConditions: ["loan-detail-verified"] })[0].reason).toMatch(/not permitted/);
    expect(validateStep({ ...hop, transition: { field: "LLC_BI__Stage__c", from: "Proposal", to: "Approval" }, satisfiedConditions: ["loan-detail-verified"] })[0].reason).toMatch(/not permitted/);
  });

  it("refuses any write to an object the tool may neither create nor update", () => {
    expect(validateStep({ id: "x", type: "write", object: "LLC_BI__LoanRenewal__c", fields: [] })[0].reason).toMatch(/never be written/);
  });

  it("permits the covenant review's UPDATE steps, which create nothing", () => {
    // The mirror used to read every write step as a create, which refused every
    // real covenant plan at the confirm gate. The compliance row may not be
    // created and may be updated, and the plan only ever updates.
    const write = {
      id: "write_assessment_0",
      type: "write",
      objectName: "LLC_BI__Covenant_Compliance2__c",
      fields: ["Agentic_AI_Response__c", "LLC_BI__Comments__c", "LLC_BI__Historic_Financial_Indicator__c"],
    };
    expect(validateStep(write)).toEqual([]);
    expect(
      validateStep({ ...write, id: "write_status_0", fields: ["LLC_BI__Status__c", "LLC_BI__Evaluation_Date__c"] }),
    ).toEqual([]);
    // A CREATE on that object still cannot get through: creating a compliance
    // row means writing its parent covenant, which is a refused field.
    expect(validateStep({ ...write, fields: ["LLC_BI__Covenant__c"] })[0].reason).toMatch(/set once at creation/);
  });

  it("refuses a formula field write on any object", () => {
    const v = validateStep({ id: "x", type: "write", object: "LLC_BI__Annual_Review__c", fields: [{ field: "LLC_BI__Final_Risk_Grade__c", value: "5" }] });
    expect(v[0].reason).toMatch(/formula field/);
  });

  it("refuses creating a Case at any status other than New", () => {
    const v = validateStep({ id: "x", type: "write", object: "Case", fields: [{ field: "Status", value: "Closed" }] });
    expect(v[0].reason).toMatch(/may only be created as New/);
  });

  it("refuses an object that is not on the allowlist at all", () => {
    expect(validateStep({ id: "x", type: "write", object: "Opportunity", fields: [] })[0].reason).toMatch(/not on the transition allowlist/);
  });

  it("ignores non-write steps, which touch nothing", () => {
    for (const type of ["verification", "wait", "handoff", "observed_side_effect"]) {
      expect(validateStep({ id: "x", type, object: "Opportunity" }), type).toEqual([]);
    }
  });

  it("ACCEPTANCE: every step in every simulated plan writes only allowlisted states", () => {
    for (const actionId of ["collateral-valuation", "create-service-request", "annual-review"]) {
      const p = simulateStagedOutput({ actionId, accountName: "Testco", suggestions: [] })!;
      expect(p, actionId).toBeTruthy();
      expect(validatePlan(p.steps), `${actionId} violates the allowlist`).toEqual([]);
    }
  });

  it("ACCEPTANCE: the package-versioning modification plan, exactly as the org stages it, passes the mirror", () => {
    // The live plan shape of stage_loan_modification after the 2026-08-30 package-versioning wave.
    // This is the regression that nearly burned the acceptance run: the server grew roll_package and
    // carry_junctions write steps, and a mirror that does not know their objects refuses the whole
    // plan at the confirm gate.
    const staged = [
      { id: "roll_package", type: "write", objectName: "LLC_BI__Product_Package__c", fields: ["new package version created by Salesforce"] },
      { id: "credit_action_0", type: "write", objectName: "LLC_BI__Loan__c", fields: ["clone created by Salesforce on the new package version"] },
      { id: "verify_clone_0", type: "verification", objectName: "LLC_BI__LoanRenewal__c" },
      { id: "apply_changes_0", type: "write", objectName: "LLC_BI__Loan__c", fields: ["LLC_BI__Amount__c", "LLC_BI__Maturity_Date__c", "LLC_BI__InterestRate__c", "LLC_BI__Term_Months__c"] },
      { id: "verify_package", type: "verification", objectName: "LLC_BI__Product_Package__c" },
      { id: "carry_junctions", type: "write", objectName: "LLC_BI__Loan_Covenant__c", fields: ["replicas retargeted at the clones, verified by count"] },
      // The net-new covenant arm (2026-08-30): create on the borrower, attach to the clone.
      { id: "covenant_create_0", type: "write", objectName: "LLC_BI__Covenant2__c", fields: ["LLC_BI__Covenant_Type__c", "LLC_BI__Financial_Indicator_Value__c", "Financial_Indicator_Operator__c", "LLC_BI__Frequency__c", "LLC_BI__Effective_Date__c"] },
      { id: "covenant_attach_0", type: "write", objectName: "LLC_BI__Loan_Covenant__c", fields: ["LLC_BI__Loan__c", "LLC_BI__Covenant2__c"] },
      { id: "covenant_verify_0", type: "verification", objectName: "LLC_BI__Covenant2__c" },
      // The field wave (2026-08-31): a curated loan field applied to the clone.
      // The mirror asks whether the tool may write the OBJECT; the org's own
      // describe is what settles the field, and neither is a formula field the
      // policy refuses.
      { id: "field_change_0", type: "write", objectName: "LLC_BI__Loan__c", fields: ["LLC_BI__Payment_Schedule__c"] },
      { id: "observe_side_effects", type: "observed_side_effect" },
      { id: "held_execution", type: "handoff" },
    ];
    expect(validatePlan(staged)).toEqual([]);
  });
});

describe("A33.5.3 — staged output is a plan, and only a plan", () => {
  it("is available only where simulation is allowed", () => {
    expect(isSimulationAllowed()).toBe(true); // under the test runner
  });

  it("carries no record id, because stage_ created nothing", () => {
    for (const actionId of ["collateral-valuation", "create-service-request", "annual-review"]) {
      const p = simulateStagedOutput({ actionId, accountName: "Testco", suggestions: [] })!;
      expect(assertNoRecordIds(p), actionId).toEqual([]);
    }
  });

  it("detects a record id if one ever leaked into a plan", () => {
    const p = simulateStagedOutput({ actionId: "create-service-request", accountName: "T", suggestions: [] })!;
    p.steps[0].fields!.push("500bb00000qor81AAA");
    expect(assertNoRecordIds(p).length).toBeGreaterThan(0);
  });

  describe("the guard is field-scoped, not blanket (live fix 2026-07-26)", () => {
    /** The REAL StageResult Fabian's live call returned. Every id below is a
     *  legitimate carrier per A33.5.3 and A26, and none proves a write. */
    const realPlan = () =>
      ({
        stagingId: "a8abb00001KtalSAAR",
        planHash: "9f2c1d",
        decisionToken: "dtServerTokenAbc",
        summary: "Files a collateral valuation.",
        warnings: [],
        suggestions: [],
        accountId: "001bb00001DLtRMAA1",
        productPackageId: "a5Fbb000000HA1NEAW",
        provenance: { "LLC_BI__Collateral__c": { citation: "a35bb000000zOgXAAU", source: "NCINO_RECORD" } },
        steps: [
          {
            id: "s1",
            type: "write" as const,
            label: "Create the collateral valuation",
            objectName: "LLC_BI__Collateral_Valuation__c",
            fields: ["LLC_BI__Value__c"],
          },
        ],
      }) as never;

    it("(a) the real live plan passes the gate", () => {
      expect(assertNoRecordIds(realPlan())).toEqual([]);
    });

    it("does not flag the spec's own id carriers", () => {
      for (const key of ["accountId", "productPackageId", "stagingId", "decisionToken"]) {
        const p = realPlan() as unknown as Record<string, unknown>;
        expect(assertNoRecordIds(p as never).join(" "), key).not.toContain(key);
      }
    });

    it("does not flag a provenance citation, which IS a record id by design", () => {
      expect(assertNoRecordIds(realPlan()).join(" ")).not.toContain("citation");
    });

    it("(b) still blocks a stray resultRecordId outside the carriers", () => {
      const p = realPlan() as unknown as Record<string, unknown>;
      p.resultRecordId = "a99bb00000zzzzzAAA";
      const v = assertNoRecordIds(p as never);
      expect(v).toHaveLength(1);
      expect(v[0]).toContain("looks like an org record id");
    });

    it("(b) still blocks a WRITE-TARGET id anywhere, whitelist included", () => {
      for (const [prefix, label] of [["a34", "collateral valuation"], ["500", "service request"], ["a5n", "credit review"]]) {
        // Even in a whitelisted carrier: a created record's id has no place here.
        const p = realPlan() as unknown as Record<string, unknown>;
        p.accountId = `${prefix}bb00000zzzzzAAA`;
        const v = assertNoRecordIds(p as never);
        expect(v.length, prefix).toBeGreaterThan(0);
        expect(v[0], prefix).toContain(label);
        expect(v[0], prefix).toContain("already written");
      }
    });

    it("(b) blocks a write-target id buried in a step field", () => {
      const p = realPlan() as unknown as { steps: Array<{ fields: string[] }> };
      p.steps[0].fields.push("a34bb00000zzzzzAAA");
      expect(assertNoRecordIds(p as never).length).toBeGreaterThan(0);
    });

    it("(c) the blocker copy for a real block is unchanged", () => {
      const p = realPlan() as unknown as Record<string, unknown>;
      p.resultRecordId = "a99bb00000zzzzzAAA";
      expect(assertNoRecordIds(p as never)[0]).toBe(
        "resultRecordId looks like an org record id (a99bb00000zzzzzAAA)",
      );
    });
  });

  it("hashes the plan over its ordered steps and values", () => {
    const a = simulateStagedOutput({ actionId: "annual-review", accountName: "T", suggestions: [] })!;
    const b = simulateStagedOutput({ actionId: "annual-review", accountName: "T", suggestions: [] })!;
    expect(a.planHash).toBe(b.planHash);
    const c = simulateStagedOutput({ actionId: "collateral-valuation", accountName: "T", suggestions: [] })!;
    expect(c.planHash).not.toBe(a.planHash);
  });

  it("surfaces warnings the banker must see before confirming", () => {
    const p = simulateStagedOutput({ actionId: "create-service-request", accountName: "T", suggestions: [] })!;
    expect(p.warnings.join(" ")).toMatch(/Slack/);
  });

  it("returns null for an action with no contract", () => {
    expect(simulateStagedOutput({ actionId: "generate-spreading", accountName: "T", suggestions: [] })).toBeNull();
  });
});

describe("A33.5.4 — the decision token", () => {
  beforeEach(() => __resetSpentTokens());

  it("binds to stagingId, planHash and the banker", () => {
    const t = mintDecisionToken({ stagingId: "s1", planHash: "h1", userId: "fabian" });
    expect(t).toMatchObject({ stagingId: "s1", planHash: "h1", userId: "fabian" });
    expect(t.token).toMatch(/^dt-/);
  });

  it("refuses to mint without a plan or a named human", () => {
    expect(() => mintDecisionToken({ stagingId: "", planHash: "h", userId: "u" })).toThrow();
    expect(() => mintDecisionToken({ stagingId: "s", planHash: "h", userId: "" })).toThrow(/name the banker/);
  });

  it("is single use", () => {
    const t = mintDecisionToken({ stagingId: "s1", planHash: "h1", userId: "u" });
    expect(redeemDecisionToken(t, { stagingId: "s1", planHash: "h1" }).valid).toBe(true);
    const second = redeemDecisionToken(t, { stagingId: "s1", planHash: "h1" });
    expect(second.valid).toBe(false);
    if (!second.valid) expect(second.reason).toMatch(/already been used/);
  });

  it("never travels to a different plan hash", () => {
    const t = mintDecisionToken({ stagingId: "s1", planHash: "h1", userId: "u" });
    const r = redeemDecisionToken(t, { stagingId: "s1", planHash: "h2" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/plan changed after you confirmed/);
  });

  it("never travels to a different staging record", () => {
    const t = mintDecisionToken({ stagingId: "s1", planHash: "h1", userId: "u" });
    expect(redeemDecisionToken(t, { stagingId: "s2", planHash: "h1" }).valid).toBe(false);
  });
});

describe("A33.3.1 — confirm gate vocabulary", () => {
  it("closes with the fixed line", () => {
    expect(CLOSING_LINE).toBe("Real approval happens in Salesforce's credit-risk process.");
  });

  it("no simulated summary or warning uses approval vocabulary", () => {
    for (const actionId of ["collateral-valuation", "create-service-request", "annual-review"]) {
      const p = simulateStagedOutput({ actionId, accountName: "Testco", suggestions: [] })!;
      const prose = `${p.summary} ${p.warnings.join(" ")} ${p.steps.map((s) => s.label).join(" ")}`.toLowerCase();
      for (const word of FORBIDDEN_GATE_WORDS) {
        // "Submit for Approval" naming the BANK's own process is allowed; the
        // ban is on us claiming to approve.
        if (word === "approve") continue;
        expect(prose, `${actionId} uses "${word}"`).not.toContain(word);
      }
    }
  });

  it("the annual review plan hands off rather than completing", () => {
    const p = simulateStagedOutput({ actionId: "annual-review", accountName: "T", suggestions: [] })!;
    expect(p.steps.some((s) => s.type === "handoff")).toBe(true);
    expect(p.steps.some((s) => (s.fields ?? []).some((f) => String(f) === "Complete"))).toBe(false);
  });
});
