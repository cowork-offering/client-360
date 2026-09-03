import { describe, expect, it } from "vitest";
import { TOOL_OBJECT_FENCE, TRANSITION_ALLOWLIST, validatePlan, validateStep } from "./transitionAllowlist";

/**
 * The client mirror of C360WriteGuard's per-tool object fence (2026-09-03).
 *
 * The org-side gate is the one that actually refuses a write. This mirror exists so a malformed
 * plan is caught at the confirm gate rather than at the org boundary, which means the two have to
 * say the same thing about the same plan. These tests hold it to that.
 */

const write = (object: string, id = "s1") => ({ id, type: "write", object, fields: [] });

describe("per-tool object fence", () => {
  it("lets relationship intake write its five relationship-level objects", () => {
    for (const object of TOOL_OBJECT_FENCE["relationship-intake"]) {
      expect(validateStep(write(object), "relationship-intake"), object).toEqual([]);
    }
  });

  it("refuses the loan junction and the pledge to relationship intake", () => {
    for (const object of ["LLC_BI__Loan_Covenant__c", "LLC_BI__Loan_Collateral2__c"]) {
      const violations = validateStep(write(object), "relationship-intake");
      expect(violations, object).toHaveLength(1);
      expect(violations[0].reason).toMatch(/may not write/);
    }
  });

  it("still allows the same loan junction with no tool id, so the modification arm is untouched", () => {
    expect(validateStep(write("LLC_BI__Loan_Covenant__c"))).toEqual([]);
    expect(validateStep(write("LLC_BI__Loan_Collateral2__c"))).toEqual([]);
  });

  it("refuses a tool that declares no fence at all", () => {
    const violations = validateStep(write("LLC_BI__Covenant2__c"), "no-such-tool");
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toMatch(/no per-tool object fence/);
  });

  it("validatePlan without a tool id passes no tool id down", () => {
    // flatMap hands the callback (element, index, array). Passing validateStep directly would send
    // the INDEX as the tool id and refuse every step after the first as an undeclared tool.
    const steps = [write("LLC_BI__Covenant2__c", "a"), write("LLC_BI__Loan_Covenant__c", "b")];
    expect(validatePlan(steps)).toEqual([]);
  });

  it("validatePlan carries the tool id to every step", () => {
    const steps = [write("LLC_BI__Covenant2__c", "a"), write("LLC_BI__Loan_Covenant__c", "b")];
    const violations = validatePlan(steps, "relationship-intake");
    expect(violations).toHaveLength(1);
    expect(violations[0].stepId).toBe("b");
  });
});

describe("the relationship covenant junction the mirror was missing", () => {
  it("is on the allowlist, create only", () => {
    const policy = TRANSITION_ALLOWLIST["LLC_BI__Account_Covenant__c"];
    expect(policy).toBeDefined();
    expect(policy.mayCreate).toBe(true);
    expect(policy.mayUpdate).toBe(false);
    expect(policy.createStates).toEqual([]);
  });

  it("no longer reports a covenant-intake step as off the allowlist", () => {
    expect(
      validateStep({
        id: "covenant_create_0",
        type: "write",
        objectName: "LLC_BI__Account_Covenant__c",
        fields: ["LLC_BI__Covenant2__c", "LLC_BI__Account__c"],
      }),
    ).toEqual([]);
  });
});
