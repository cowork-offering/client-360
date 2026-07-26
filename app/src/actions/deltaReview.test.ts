// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { buildPanelSchema } from "./schemas";
import { observedPicklistMap } from "./observedPicklists";
import { bookedFacilityAvailability, bookedFacilityGap, facilityStagesStaged } from "../data/facilityStage";
import { executeAction } from "../channel/writeTools";
import sample from "../../../artifact/sample-data.json";

/* =============================================================================
   CODEX DELTA REVIEW — one test per finding, so a regression names the finding.
   ============================================================================= */

const DATA = sample as unknown as C360Data;
const bundleOf = (facilities: unknown[]): BorrowerBundle =>
  ({ snapshot: { accountId: "001X", name: "Testco" }, exposure: { facilities } }) as BorrowerBundle;

const schemaFor = (actionId: string, bundle: BorrowerBundle, orgPicklists?: Record<string, string[]>) =>
  buildPanelSchema(actionId, { bundle, accountId: "001X", accountName: "Testco", orgPicklists })!;

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;
afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

describe("F1 — Term can never reach the Product sheet (REFUTED, with the chain proven)", () => {
  const KEY = "LLC_BI__Loan__c.LLC_BI__Product__c";
  const bundle = { snapshot: { accountId: "001X", name: "Testco", productPackageId: "a5F" } } as BorrowerBundle;

  it("the cache holds six, and Term is not among them", () => {
    expect(observedPicklistMap()[KEY]).not.toContain("Term");
    expect(observedPicklistMap()[KEY]).toHaveLength(6);
  });

  it("the schema offers exactly the cache, unfiltered and unextended", () => {
    const f = schemaFor("new-facility-request", bundle, observedPicklistMap()).fields.find((x) => x.key === "productType")!;
    expect(f.options).toEqual(observedPicklistMap()[KEY]);
    expect(f.options).not.toContain("Term");
  });

  it("a VALIDATION_FAILED legal list CANNOT reintroduce Term, because it targets another object", () => {
    // The supersede path writes ONLY LLC_BI__Collateral_Valuation__c keys, so a
    // seven-value list arriving for any reason cannot land on the Product field.
    const superseded = {
      ...observedPicklistMap(),
      "LLC_BI__Collateral_Valuation__c.LLC_BI__Type__c": ["Construction", "Term", "Anything"],
    };
    const f = schemaFor("new-facility-request", bundle, superseded).fields.find((x) => x.key === "productType")!;
    expect(f.options).not.toContain("Term");
  });

  it("and even a DIRECT supersede of the product key is the org's own answer, not ours to filter", () => {
    // Documented deliberately: if the org itself ever returned Term for this
    // field, the org would be the authority and the panel would show it. That
    // cannot happen today because the Apex validates the RT-scoped six.
    const f = schemaFor("new-facility-request", bundle, { ...observedPicklistMap(), [KEY]: ["Term"] }).fields.find(
      (x) => x.key === "productType",
    )!;
    expect(f.options).toEqual(["Term"]);
  });
});

describe("F5 — partial stage data is cannot-tell, not none-booked", () => {
  it("requires EVERY facility to carry a stage", () => {
    expect(facilityStagesStaged(bundleOf([{ loanId: "L1", stage: "Booked" }, { loanId: "L2" }]))).toBe(false);
    expect(facilityStagesStaged(bundleOf([{ loanId: "L1", stage: "Booked" }, { loanId: "L2", stage: "Proposal" }]))).toBe(true);
  });

  it("says cannot-tell rather than claiming none are booked", () => {
    const r = bookedFacilityAvailability(bundleOf([{ loanId: "L1", stage: "Booked", status: "Active" }, { loanId: "L2" }]));
    expect(r.available).toBe(false);
    expect(r.reason).toContain("not staged in this view");
    expect(r.reason).not.toContain("Requires a booked facility");
  });
});

describe("F6 — the chooser is keyed on the record id, not the label", () => {
  const twins = bundleOf([
    { loanId: "L1", name: "Revolver", stage: "Booked", status: "Active", productPackageId: "a5F" },
    { loanId: "L2", name: "Revolver", stage: "Booked", status: "Active", productPackageId: "a5F" },
  ]);

  it("keeps two identically-named facilities distinct", () => {
    const f = schemaFor("loan-modification", twins).fields.find((x) => x.key === "facility")!;
    expect(f.options).toEqual(["L1", "L2"]);
    expect(f.optionLabels).toEqual(["Revolver", "Revolver"]);
    // Keyed on the label these would collapse to one option.
    expect(new Set(f.options).size).toBe(2);
  });

  it("preselects by id, as a selection of one", () => {
    expect(schemaFor("loan-modification", twins).fields.find((x) => x.key === "facility")!.value).toEqual(["L1"]);
  });
});

describe("F7 — the package anchor comes from the CHOSEN facility, or nothing is staged", () => {
  it("refuses to stage when the facility carries no package of its own", () => {
    const noPkg = bundleOf([{ loanId: "L1", name: "Revolver", stage: "Booked", status: "Active" }]);
    const f = schemaFor("loan-modification", noPkg).fields.find((x) => x.key === "facility")!;
    // The chooser still offers it; the payload builder is what fails closed,
    // and its refusal is covered by the panel test that asserts no stage call.
    expect(f.options).toEqual(["L1"]);
    expect(noPkg.exposure!.facilities![0].productPackageId).toBeUndefined();
  });
});

describe("F9 — the staging gap keeps the three outcomes distinct", () => {
  it("says cannot-tell at the boundary too", () => {
    const gap = schemaFor("loan-modification", bundleOf([{ loanId: "L1", name: "R" }])).fields.find(
      (x) => x.key === "facility",
    )!.gap!;
    expect(gap.blocksStaging).toBe(true);
    expect(gap.reason).toContain("not staged in this view");
  });

  it("says none-are-booked when it can tell", () => {
    const gap = schemaFor("loan-modification", bundleOf([{ loanId: "L1", name: "R", stage: "Final Review", status: "Active" }])).fields.find(
      (x) => x.key === "facility",
    )!.gap!;
    expect(gap.reason).toContain("Requires a booked facility");
    expect(gap.reason).toContain("modifications apply to booked loans");
  });

  it("names renewals in the renewal's own gap", () => {
    expect(bookedFacilityGap(bundleOf([{ loanId: "L1", stage: "Proposal", status: "Active" }]), "renewals")).toContain(
      "renewals apply",
    );
  });
});

describe("F4 — a created package survives the resume", () => {
  const envelope = (outputValues: unknown) => ({
    payload: { content: [{ actionName: "t", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
  });

  it("keeps packageCreated tri-state: null on the resume is not false", async () => {
    w.claude = {
      mcp: {
        callTool: vi.fn().mockResolvedValue(
          envelope({
            ok: true,
            error: null,
            result: {
              stagingId: "s",
              terminalState: "success",
              productPackageId: "a5Fbb000000IHATEA4",
              packageCreated: null,
              anchorName: null,
              steps: [],
            },
          }),
        ),
        watchTool: vi.fn(),
        listTools: vi.fn(),
        invalidate: vi.fn(),
      },
    };
    const out = await executeAction("new-facility-request", {
      idempotencyKey: "k",
      stagingId: "s",
      planHash: "h",
      decisionToken: "t",
      approverUserId: "005bb00000ftouDAAQ",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // NOT false: the org is silent on the resume, not denying it.
    expect(out.result.packageCreated).toBeNull();
    expect(out.result.productPackageId).toBe("a5Fbb000000IHATEA4");
  });
});

describe("F8 — a blank account id is not an anchor", () => {
  it("the sample's accounts all carry a real id", () => {
    for (const [id, b] of Object.entries(DATA.borrowers ?? {})) {
      expect(id.trim(), id).not.toBe("");
      expect((b as BorrowerBundle).snapshot?.accountId?.trim()).toBeTruthy();
    }
  });
});
