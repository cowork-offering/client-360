import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { buildPanelSchema } from "./schemas";
import sample from "../../../artifact/sample-data.json";

/* =============================================================================
   PROBE-BACKED SCHEMA FACTS (PROBE-LEDGER wave 3, LESSONS 3b)

   Each assertion below corresponds to a probe finding that cost somebody a real
   write against bankinggpt. They are pinned here so a future edit cannot
   quietly reintroduce a name or a default the org has already disproved.
   ============================================================================= */

const DATA = sample as unknown as C360Data;
const BUNDLE = Object.values(DATA.borrowers ?? {})[0] as BorrowerBundle;
const ACTIONS = [
  "annual-review",
  "collateral-valuation",
  "create-service-request",
  "new-facility-request",
  "risk-rating-review",
  "covenant-review",
  "loan-modification",
  "renewal",
];

const schemaFor = (actionId: string) =>
  buildPanelSchema(actionId, { bundle: BUNDLE, accountId: "001X", accountName: "Testco" })!;

describe("Probe 4 — the Risk Rating Review object", () => {
  it("writes to LLC_BI__Annual_Review__c", () => {
    const s = schemaFor("risk-rating-review");
    expect(s.writeObject).toBe("LLC_BI__Annual_Review__c");
    // The object the LABEL implies does not exist in this org (A33.4.7).
    expect(JSON.stringify(s)).not.toContain("LLC_BI__Risk_Rating_Review");
  });

  it("sets the status explicitly, because the org's default reads as a decision", () => {
    const status = schemaFor("risk-rating-review").fields.find((f) => f.key === "status")!;
    expect(status.value).toBe("In Review");
    expect(status.editable).toBe(false);
    expect(status.help).toContain("Not Approved");
  });

  it("sets neither a record type nor an owner: the object has neither field", () => {
    const s = JSON.stringify(schemaFor("risk-rating-review"));
    expect(s).not.toContain("RecordTypeId");
    expect(s).not.toContain("OwnerId");
  });

  it("displays the org's grades without targeting them", () => {
    const s = schemaFor("risk-rating-review");
    for (const key of ["computedGrade", "finalGrade"]) {
      const f = s.fields.find((x) => x.key === key)!;
      expect(f.editable, key).toBe(false);
      expect(f.target, key).toEqual({ staging: true });
    }
  });
});

describe("Probe 8 — the covenant compliance object", () => {
  it("anchors on the Compliance2 object", () => {
    expect(schemaFor("covenant-review").writeObject).toBe("LLC_BI__Covenant_Compliance2__c");
  });

  it("records no observed value, because no write target for one was probed", () => {
    const f = schemaFor("covenant-review").fields.find((x) => x.key === "observedValue")!;
    expect(f.editable).toBe(false);
    expect(f.target).toEqual({ staging: true });
  });
});

describe("Probe 5 — the new facility insert", () => {
  it("collects Product, because a blank one is filed as Construction", () => {
    const product = schemaFor("new-facility-request").fields.find((f) => f.key === "productType")!;
    expect(product.required).toBe(true);
    expect(product.target).toEqual({ object: "LLC_BI__Loan__c", field: "LLC_BI__Product__c" });
    expect(product.help).toContain("Construction");
  });

  it("collects the loan purpose and leaves the application method to the org", () => {
    const s = schemaFor("new-facility-request");
    const purpose = s.fields.find((f) => f.key === "purpose")!;
    const method = s.fields.find((f) => f.key === "applicationMethod")!;
    expect(purpose.required).toBe(true);
    expect(purpose.target).toEqual({ object: "LLC_BI__Loan_Detail__c", field: "LLC_BI__Primary_Loan_Purpose__c" });
    expect(method.editable).toBe(false);
    expect(method.value).toBe("Online");
  });

  it("proposes no loan name: the org rewrites whatever it is sent", () => {
    const s = schemaFor("new-facility-request");
    expect(s.fields.some((f) => f.key === "name")).toBe(false);
    expect(s.intro).toContain("nCino names the loan itself");
  });

  it("reports the loan officer as org-assigned", () => {
    const officer = schemaFor("new-facility-request").fields.find((f) => f.key === "loanOfficer")!;
    expect(officer.editable).toBe(false);
    expect(officer.prefill.citation).toContain("ACNPEX");
  });

  it("references no field this org does not have", () => {
    for (const actionId of ACTIONS) {
      const s = JSON.stringify(schemaFor(actionId));
      expect(s, actionId).not.toContain("RootLoanId");
      expect(s, actionId).not.toContain("ChildLoanId");
    }
  });
});
