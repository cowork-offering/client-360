// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchActionHistory, normalizeStamp } from "./cockpitTools";

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

/** The OBSERVED envelope: a read tool, so outputValues carries the payload
 *  directly — no ok/result wrapper, which belongs to the write tools. */
const observed = (outputValues: unknown) => ({
  payload: {
    content: [{ actionName: "Customer360ActionHistory", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }],
  },
});

function installMcp(payload: unknown) {
  const callTool = vi.fn().mockResolvedValue(payload);
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return callTool;
}

const ENTRY = {
  stagingId: "a8abb00001KtalSAAR",
  actionId: "collateral-valuation",
  status: "Completed",
  actorUserId: "005bb00000ftouDAAQ",
  approverUserId: "005bb00000ftouDAAQ",
  createdDate: "2026-07-25 20:18:36",
  executedAt: "2026-07-25 20:19:02",
  resultRecordId: "a34bb00000399FFAAY",
  resultRecordName: "CV-0000000002",
  productPackageId: null,
  planHashPresent: true,
  accountId: "001bb00001DLtRMAA1",
};

describe("reading the observed action-history envelope", () => {
  it("reads entries[] off outputValues directly", async () => {
    installMcp(observed({ accountId: "001bb00001DLtRMAA1", count: 1, entries: [ENTRY] }));
    const { rows } = await fetchActionHistory("001bb00001DLtRMAA1");
    expect(rows).toHaveLength(1);
    expect(rows[0].stagingId).toBe(ENTRY.stagingId);
    expect(rows[0].planHashPresent).toBe(true);
  });

  it("normalises the org's space-separated datetimes to ISO instants", async () => {
    installMcp(observed({ count: 1, entries: [ENTRY] }));
    const { rows } = await fetchActionHistory("001X");
    expect(rows[0].createdDate).toBe("2026-07-25T20:18:36Z");
    expect(rows[0].executedAt).toBe("2026-07-25T20:19:02Z");
  });

  it("leaves a null executedAt null rather than inventing one", async () => {
    installMcp(observed({ count: 1, entries: [{ ...ENTRY, status: "Staged", executedAt: null, resultRecordName: null }] }));
    const { rows } = await fetchActionHistory("001X");
    expect(rows[0].executedAt).toBeUndefined();
    expect(rows[0].resultRecordName).toBeUndefined();
    expect(rows[0].status).toBe("Staged");
  });

  it("drops a row with no staging id: it could not be deduped against the echo", async () => {
    installMcp(observed({ count: 2, entries: [ENTRY, { ...ENTRY, stagingId: null }] }));
    expect((await fetchActionHistory("001X")).rows).toHaveLength(1);
  });

  it("reads an empty trail as empty, not as a failure", async () => {
    installMcp(observed({ accountId: "001X", count: 0, entries: [] }));
    expect((await fetchActionHistory("001X")).rows).toEqual([]);
  });

  it("survives a malformed payload without throwing", async () => {
    installMcp(observed({ accountId: "001X", count: 3 }));
    expect((await fetchActionHistory("001X")).rows).toEqual([]);
  });

  it("sends the account id and a limit, as one input row", async () => {
    const callTool = installMcp(observed({ count: 0, entries: [] }));
    await fetchActionHistory("001bb00001DLtRMAA1", 25);
    const input = callTool.mock.calls[0][2] as { inputs: Array<Record<string, unknown>> };
    expect(input.inputs).toEqual([{ accountId: "001bb00001DLtRMAA1", limit: 25 }]);
  });

  it("raises the element's own error when the invocable reports failure", async () => {
    installMcp({
      payload: { content: [{ actionName: "Customer360ActionHistory", isSuccess: false, errors: ["no access"], sortOrder: 0, version: 1 }] },
    });
    await expect(fetchActionHistory("001X")).rejects.toMatchObject({ code: "tool_error" });
  });
});

describe("normalizeStamp", () => {
  it("stamps the org's space-separated UTC datetimes", () => {
    expect(normalizeStamp("2026-07-25 20:18:36")).toBe("2026-07-25T20:18:36Z");
    expect(normalizeStamp("2026-07-25 20:18:36.123")).toBe("2026-07-25T20:18:36.123Z");
  });

  it("passes an instant that already carries a zone through untouched", () => {
    expect(normalizeStamp("2026-07-25T20:18:36.000Z")).toBe("2026-07-25T20:18:36.000Z");
  });

  it("drops anything it cannot place on a timeline", () => {
    expect(normalizeStamp("last Tuesday")).toBeUndefined();
    expect(normalizeStamp(null)).toBeUndefined();
    expect(normalizeStamp("")).toBeUndefined();
    expect(normalizeStamp(1753478316000)).toBeUndefined();
  });
});
