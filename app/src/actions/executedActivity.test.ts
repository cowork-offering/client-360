import { describe, expect, it } from "vitest";
import { createdRecordId, executedActivityEntry, historyActivityEntry, mergeTrail } from "./executedActivity";
import type { ExecuteResult } from "../channel/writeTools";

const OK: ExecuteResult = {
  stagingId: "a8abb00001KtalSAAR",
  terminalState: "success",
  outcome: "The valuation was created and verified. The collateral rollup did not change.",
  valuationId: "a34bb00000399FFAAY",
  recordName: "CV-0000000002",
  anchorName: "COL-000758",
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
  it("names the record and its anchor with the org's own names", () => {
    const e = executedActivityEntry({ ...BASE, target: "Equipment on Term Loan A" })!;
    expect(e.kind).toBe("ACTION_EXECUTED");
    // The org's anchorName wins over the panel's staged label for the same thing.
    expect(e.title).toBe("Collateral valuation CV-0000000002 filed against COL-000758");
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

  it("falls back to the panel's staged label when the org names no anchor", () => {
    const e = executedActivityEntry({ ...BASE, outcome: { ...OK, anchorName: null }, target: "Equipment on Term Loan A" })!;
    expect(e.title).toBe("Collateral valuation CV-0000000002 filed against Equipment on Term Loan A");
  });

  it("reads the per-action aliases as the same fact, via the parser", () => {
    // recordName is canonical; caseNumber/reviewName carry it on older tools.
    const e = executedActivityEntry({ ...BASE, actionId: "create-service-request", outcome: { ...OK, valuationId: undefined, caseId: "500X", recordName: "00001234" } })!;
    expect(e.title).toContain("Service request 00001234 filed");
  });
});

describe("a null recordName is a verification failure, never a label to paper over", () => {
  const UNVERIFIED = { ...OK, recordName: null, terminalState: "partial" };

  it("says the name was not confirmed rather than naming the object generically", () => {
    const e = executedActivityEntry({ ...BASE, outcome: UNVERIFIED })!;
    expect(e.title).toBe("Collateral valuation filed against COL-000758, name not confirmed");
    // The failure must not be dressed as a clean filing.
    expect(e.title).not.toBe("Collateral valuation filed against COL-000758");
  });

  it("still records it as an execution: the record exists and its id is real", () => {
    const e = executedActivityEntry({ ...BASE, outcome: UNVERIFIED })!;
    expect(e.kind).toBe("ACTION_EXECUTED");
    expect(e.reference?.id).toBe("a34bb00000399FFAAY");
  });

  it("states the read-back failure in the detail", () => {
    const e = executedActivityEntry({ ...BASE, outcome: UNVERIFIED })!;
    expect(e.detail?.body).toContain("filed but unverified");
  });

  it("does not claim a name anywhere in the entry", () => {
    const e = executedActivityEntry({ ...BASE, outcome: UNVERIFIED })!;
    const text = `${e.title} ${e.summary} ${e.detail?.body}`;
    expect(text).not.toMatch(/CV-\d+/);
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
    expect(e.title).toBe("Collateral valuation did not complete against COL-000758");
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

describe("the org's durable action trail (observed envelope 2026-07-26)", () => {
  /** A row exactly as Customer360ActionHistory returns it, verbatim shape. */
  const ROW = {
    stagingId: "a8abb00001KtalSAAR",
    actionId: "collateral-valuation",
    status: "Completed",
    actorUserId: "005bb00000ftouDAAQ",
    approverUserId: "005bb00000ftouDAAQ",
    createdDate: "2026-07-25T20:18:36Z",
    executedAt: "2026-07-25T20:19:02Z",
    resultRecordId: "a34bb00000399FFAAY",
    resultRecordName: "CV-0000000002",
    planHashPresent: true,
  };

  it("keys identically to the session echo, so the two dedupe", () => {
    const org = historyActivityEntry(ROW)!;
    const session = executedActivityEntry(BASE)!;
    expect(org.id).toBe(session.id);
    expect(org.id).toBe("exec-a8abb00001KtalSAAR");
  });

  it("is marked as coming from the org, not from this session", () => {
    const e = historyActivityEntry(ROW)!;
    expect(e.orgConfirmed).toBe(true);
    expect(e.sessionLocal).toBeUndefined();
    expect(e.kind).toBe("ACTION_EXECUTED");
    expect(e.title).toBe("Collateral valuation CV-0000000002 filed");
    expect(e.actor).toBe("005bb00000ftouDAAQ");
  });

  it("uses the executed time, falling back to the created time", () => {
    expect(historyActivityEntry(ROW)!.ts).toBe(ROW.executedAt);
    expect(historyActivityEntry({ ...ROW, executedAt: undefined })!.ts).toBe(ROW.createdDate);
    expect(historyActivityEntry({ ...ROW, executedAt: undefined, createdDate: undefined })).toBeNull();
  });

  it("links to the created record when the org address is known", () => {
    const e = historyActivityEntry(ROW, "https://x.lightning.force.com")!;
    expect(e.reference?.webLink).toContain("/LLC_BI__Collateral_Valuation__c/a34bb00000399FFAAY/view");
  });

  it("keeps the staging id, the approver and the org's own status in the detail", () => {
    const body = historyActivityEntry(ROW)!.detail!.body!;
    expect(body).toContain("a8abb00001KtalSAAR");
    expect(body).toContain("005bb00000ftouDAAQ");
    expect(body).toContain("The org records this as Completed.");
  });

  it("renders a Staged row as real history: built, never confirmed", () => {
    const e = historyActivityEntry({
      ...ROW,
      status: "Staged",
      executedAt: undefined,
      resultRecordId: undefined,
      resultRecordName: undefined,
    })!;
    expect(e.kind).toBe("ACTION_STAGED");
    expect(e.title).toBe("Collateral valuation staged, never filed");
    expect(e.summary).toContain("Nothing was written.");
    // Not a failure, and not a write: it claims neither.
    expect(e.title).not.toContain("did not complete");
    expect(e.reference).toBeUndefined();
  });

  it("treats a null name on a STAGED row as simply unexecuted", () => {
    const e = historyActivityEntry({ ...ROW, status: "Staged", resultRecordName: undefined })!;
    expect(e.title).not.toContain("name not confirmed");
  });

  it("treats a null name on a COMPLETED row as the verification failure it is", () => {
    const e = historyActivityEntry({ ...ROW, resultRecordName: undefined })!;
    expect(e.kind).toBe("ACTION_EXECUTED");
    expect(e.title).toBe("Collateral valuation filed, name not confirmed");
    expect(e.summary).toContain("filed but unverified");
  });

  it("carries an unrecognised status verbatim rather than guessing at it", () => {
    const e = historyActivityEntry({ ...ROW, status: "Superseded" })!;
    expect(e.title).toBe("Collateral valuation recorded as Superseded");
    expect(e.kind).toBe("ACTION_STAGED");
  });

  it("names the annual review by the org's own record name", () => {
    const e = historyActivityEntry({ ...ROW, actionId: "annual-review", resultRecordName: "R-4", resultRecordId: "a5nbb0001" })!;
    expect(e.title).toBe("Annual credit review R-4 filed");
  });

  it("drops a row with no staging id rather than rendering an undedupable one", () => {
    expect(historyActivityEntry({ ...ROW, stagingId: "" })).toBeNull();
  });
});

describe("merging the trail", () => {
  const staged = { id: "baked-1", ts: "2026-07-01T00:00:00Z", kind: "ANALYSIS_CONCLUDED" as const, title: "Analysis" };
  const session = { id: "exec-S1", ts: "2026-07-26T11:00:00Z", kind: "ACTION_EXECUTED" as const, title: "Session echo", sessionLocal: true };
  const org = { id: "exec-S1", ts: "2026-07-26T11:04:00Z", kind: "ACTION_EXECUTED" as const, title: "Org record", orgConfirmed: true };

  it("lets the org row win over the session echo of the same execution", () => {
    const out = mergeTrail([org], [session], [staged]);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("Org record");
    expect(out[0].orgConfirmed).toBe(true);
  });

  it("renders the session echo instantly while the org has nothing yet", () => {
    const out = mergeTrail([], [session], [staged]);
    expect(out[0].title).toBe("Session echo");
    expect(out[0].sessionLocal).toBe(true);
  });

  it("renders the durable trail with no session entries at all", () => {
    const out = mergeTrail([org], [], [staged]);
    expect(out.map((e) => e.id)).toEqual(["exec-S1", "baked-1"]);
  });

  it("keeps everything newest first", () => {
    const older = { id: "exec-S0", ts: "2026-07-20T00:00:00Z", kind: "ACTION_EXECUTED" as const, title: "Older" };
    const out = mergeTrail([org, older], [], [staged]);
    expect(out.map((e) => e.ts)).toEqual(["2026-07-26T11:04:00Z", "2026-07-20T00:00:00Z", "2026-07-01T00:00:00Z"]);
  });
});


/* The modification's trail entry. The created record is the CLONE nCino made;
   the parent facility existed already and is the anchor, not the result. Values
   read out of the live wire probe of 2026-08-22. */
describe("a loan modification in the trail", () => {
  const MOD: ExecuteResult = {
    stagingId: "a8abb00001N6Z0XAAV",
    terminalState: "success",
    outcome:
      "Modification ZZ-WS05-PROBE Borrower - Equipment - $1,500,000.00 created from ZZ-WS05-PROBE Borrower - Equipment - $1,000,000.00 at stage Qualification.",
    cloneLoanId: "a4Zbb000002Br6HEAS",
    recordName: "ZZ-WS05-PROBE Borrower - Equipment - $1,500,000.00",
    anchorName: "ZZ-WS05-PROBE Borrower - Equipment - $1,000,000.00",
    steps: [{ id: "credit_action_0", type: "write", label: "Invoke the modification credit action", state: "verified" }],
  };

  it("names the clone as the created record, never the parent", () => {
    expect(createdRecordId("loan-modification", MOD)).toBe("a4Zbb000002Br6HEAS");
  });

  it("titles the entry with the clone filed against the parent", () => {
    const e = executedActivityEntry({ actionId: "loan-modification", outcome: MOD, now: NOW })!;
    expect(e.kind).toBe("ACTION_EXECUTED");
    expect(e.title).toBe(
      "Modification ZZ-WS05-PROBE Borrower - Equipment - $1,500,000.00 filed against ZZ-WS05-PROBE Borrower - Equipment - $1,000,000.00",
    );
  });

  it("deep links the clone as a facility", () => {
    const e = executedActivityEntry({
      actionId: "loan-modification",
      outcome: MOD,
      instanceUrl: "https://x.lightning.force.com",
      now: NOW,
    })!;
    expect(e.reference?.webLink).toBe(
      "https://x.lightning.force.com/lightning/r/LLC_BI__Loan__c/a4Zbb000002Br6HEAS/view",
    );
  });

  it("says nothing was written twice on a replay, and still names the clone", () => {
    const e = executedActivityEntry({
      actionId: "loan-modification",
      outcome: { ...MOD, replayed: true, anchorName: null, outcome: "This idempotency key already produced modification facility a4Zbb000002Br6HEAS. Nothing was written." },
      now: NOW,
    })!;
    expect(e.detail?.body).toContain("Replayed under the same idempotency key; nothing was written twice.");
    expect(e.reference?.id).toBe("a4Zbb000002Br6HEAS");
  });
});
