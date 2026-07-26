import { describe, expect, it } from "vitest";
import { createdRecordId, executedActivityEntry } from "./executedActivity";
import type { ExecuteResult } from "../channel/writeTools";

const OK: ExecuteResult = {
  stagingId: "a8abb00001KtalSAAR",
  terminalState: "success",
  outcome: "The valuation was created and verified. The collateral rollup did not change.",
  valuationId: "a34bb00000399FFAAY",
  steps: [{ id: "s1", type: "write", label: "Create the valuation", state: "verified" }],
};

const NOW = () => new Date("2026-07-26T12:00:00Z");
const BASE = { actionId: "collateral-valuation", outcome: OK, actor: "Fabian Goetzens", now: NOW };

describe("the created record id, per action", () => {
  it("reads the field the executor returns for each write", () => {
    expect(createdRecordId("collateral-valuation", OK)).toBe("a34bb00000399FFAAY");
    expect(createdRecordId("create-service-request", { ...OK, caseId: "500X" })).toBe("500X");
    expect(createdRecordId("annual-review", { ...OK, reviewId: "a5nX" })).toBe("a5nX");
    expect(createdRecordId("renewal", OK)).toBeUndefined();
  });
});

describe("the trail entry for an execution", () => {
  it("names the object and what it was filed against, in banker language", () => {
    const e = executedActivityEntry({ ...BASE, target: "Equipment on Term Loan A" })!;
    expect(e.kind).toBe("ACTION_EXECUTED");
    expect(e.title).toBe("Collateral valuation filed against Equipment on Term Loan A");
    expect(e.actor).toBe("Fabian Goetzens");
    expect(e.sessionLocal).toBe(true);
    expect(e.ts).toBe("2026-07-26T12:00:00.000Z");
  });

  it("quotes the executor's own outcome rather than restating it", () => {
    expect(executedActivityEntry(BASE)!.summary).toBe(OK.outcome);
  });

  it("attaches the record deep link when the org address is known", () => {
    const e = executedActivityEntry({ ...BASE, instanceUrl: "https://x.lightning.force.com" })!;
    expect(e.reference?.webLink).toBe("https://x.lightning.force.com/lightning/r/LLC_BI__Collateral_Valuation__c/a34bb00000399FFAAY/view");
    expect(e.reference?.id).toBe("a34bb00000399FFAAY");
  });

  it("leaves the link absent rather than fabricating one (A29)", () => {
    const e = executedActivityEntry(BASE)!;
    expect(e.reference?.webLink).toBeUndefined();
    expect(e.reference?.id).toBe("a34bb00000399FFAAY");
  });

  it("retains the staging id in the detail for audit", () => {
    expect(executedActivityEntry(BASE)!.detail?.body).toContain("a8abb00001KtalSAAR");
  });

  it("invents no record name: only ids the executor actually returned", () => {
    const e = executedActivityEntry(BASE)!;
    const text = `${e.title} ${e.summary} ${e.detail?.body}`;
    expect(text).not.toMatch(/CV-\d+/);
    expect(text).toContain("a34bb00000399FFAAY");
  });

  it("says so when the write was replayed under the same key", () => {
    const e = executedActivityEntry({ ...BASE, outcome: { ...OK, replayed: true } })!;
    expect(e.detail?.body).toContain("nothing was written twice");
  });

  it("is keyed on the staging id, so one execution cannot log twice", () => {
    const a = executedActivityEntry(BASE)!;
    const b = executedActivityEntry(BASE)!;
    expect(a.id).toBe(b.id);
  });
});

describe("a failed execution is trail-worthy too", () => {
  const BAD: ExecuteResult = {
    ...OK,
    terminalState: "partial",
    valuationId: undefined,
    outcome: "The valuation was created but could not be verified.",
    steps: [
      { id: "s1", type: "write", label: "Create the valuation", state: "failed", detail: "INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY" },
      { id: "s2", type: "verification", label: "Confirm it exists", state: "skipped_not_attempted" },
    ],
  };

  it("logs the failing step and the org's own code", () => {
    const e = executedActivityEntry({ ...BASE, outcome: BAD, target: "Equipment on Term Loan A" })!;
    expect(e.kind).toBe("ACTION_EXECUTION_FAILED");
    expect(e.title).toBe("Collateral valuation did not complete against Equipment on Term Loan A");
    expect(e.detail?.body).toContain("Stopped at: Create the valuation.");
    expect(e.detail?.body).toContain("INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY");
    expect(e.detail?.body).toContain("Terminal state partial");
  });

  it("claims no record when none was created", () => {
    expect(executedActivityEntry({ ...BASE, outcome: BAD })!.reference).toBeUndefined();
  });

  it("logs nothing at all when nothing was attempted", () => {
    expect(executedActivityEntry({ ...BASE, outcome: { ...OK, terminalState: "" } })).toBeNull();
  });
});
