// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishMemo } from "./publish";
import { syncableSections } from "./publishLanes";
import { LANE_IDS, type MemoDraft, type MemoPublishContext } from "./publishTypes";

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

/** Every tool the publish reaches, answering as the live connectors did on
 *  2026-09-04 (app/src/memo/OBSERVED.md), with the fixture markers removed:
 *  these are the shapes, never the observed values. */
const ANSWERS: Record<string, unknown> = {
  ncino_sync_memo_sections: {
    ok: true,
    packageId: "PKG",
    mapped: [
      { section: "deal_summary", field: "cm_Deal_Summary_Loan__c", chars: 120 },
      { section: "risk_assessment", field: "cm_Risk_Analysis_Loan__c", chars: 140 },
    ],
    unmapped: [],
    truncated: [],
    message: "Synced 2 narrative section(s) to the Product Package.",
  },
  ncino_publish_credit_memo: {
    ok: true,
    templateCreated: true,
    templateId: "a77TEMPLATE0001",
    templateName: "Acme Bank Credit Memo (Agent)",
    attachmentId: "00PATTACH0001",
    bytes: 4096,
    generateUrl: "https://example.my.salesforce.com/apex/nFORMS__HtmlFormGenerator?contextId=PKG",
    message: "Published 4096 chars to the credit-memo template.",
  },
  ncino_finalize_credit_memo: {
    ok: true,
    sectionsSynced: 7,
    fields: ["cm_Deal_Summary_Loan__c"],
    packageStage: "Credit Decisioning",
    audited: true,
    message: "Synced 7 narrative section(s) and advanced the package to 'Credit Decisioning'.",
  },
  ncino_submit_for_approval: {
    ok: true,
    newStage: "Credit Decisioning",
    processInstanceId: "04gPROCESS0001",
    notified: ["credit.lead@example.com"],
    message: "Submitted Product Package for credit approval.",
  },
  ncino_notify: { ok: true, to: ["credit.lead@example.com"], message: "Queued notification to 1 recipient(s)." },
  record_decision: { recorded: { occurredAt: "2026-09-04T11:36:58.328Z" } },
  log_audit_event: { logged: { occurredAt: "2026-09-04T11:37:05.393Z" } },
  create_workpackage: { workpackageId: "32590", workflow: "postApproval", messages: [{ severity: "info", text: "Workpackage created." }] },
};

function installMcp(answer: (tool: string, input: unknown) => unknown = (tool) => ANSWERS[tool]) {
  const calls: Array<{ server: string; tool: string; input: unknown; options: { cache?: unknown } }> = [];
  const callTool = vi.fn(async (server: string, tool: string, input: unknown, options: { cache?: unknown } = {}) => {
    calls.push({ server, tool, input, options });
    const result = answer(tool, input);
    if (result instanceof Error) throw result;
    if (result && typeof result === "object" && "__reject" in (result as Record<string, unknown>)) {
      throw (result as { __reject: unknown }).__reject;
    }
    return { payload: result };
  });
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return { calls };
}

afterEach(() => {
  delete w.claude;
  vi.restoreAllMocks();
});

const DRAFT: MemoDraft = {
  memoId: "memo-0001",
  packageId: "PKG",
  html: "<style>h2{color:#2E0A4F}</style><h2>Deal Summary</h2><p>The relationship is performing.</p>",
  sections: [
    { id: "deal_summary", title: "Deal Summary", html: "<p>The relationship is performing.</p>" },
    { id: "risk_assessment", title: "Risk Assessment", html: "<p>The rating is held.</p>" },
  ],
  afs: { bank: "5", obligor: "13", obligation: "42" },
  servicingFacilities: [{ name: "Revolving LOC", amount: 7500000, revolvingType: "R" }],
};

const CTX: MemoPublishContext = {
  packageId: "PKG",
  accountId: "001ACCOUNT0001",
  actingUserId: "005USER00000001",
  actingUserName: "A Banker",
  approverEmails: ["credit.lead@example.com"],
  notificationEmails: ["credit.lead@example.com"],
};

const lane = (pub: Awaited<ReturnType<typeof publishMemo>>, id: string) => pub.lanes.find((l) => l.lane === id)!;

describe("the sequence", () => {
  it("runs every step once, in order, and names the system each wrote to", async () => {
    const { calls } = installMcp();
    const pub = await publishMemo(DRAFT, CTX);

    expect(pub.lanes.map((l) => l.lane)).toEqual([...LANE_IDS]);
    expect(calls.map((c) => c.tool)).toEqual([
      "ncino_sync_memo_sections",
      "ncino_publish_credit_memo",
      "ncino_finalize_credit_memo",
      "ncino_submit_for_approval",
      "ncino_notify",
      "record_decision",
      "log_audit_event",
      "create_workpackage",
    ]);
    expect(pub.lanes.map((l) => l.system)).toEqual(["ncino", "nforms", "ncino", "ncino", "ncino", "ledger", "afs"]);
  });

  it("reports published, and carries what each system named", async () => {
    installMcp();
    const pub = await publishMemo(DRAFT, CTX);

    expect(pub.status).toBe("published");
    expect(pub.lanes.every((l) => l.status === "done")).toBe(true);
    expect(pub.sections).toEqual({ synced: ["deal_summary", "risk_assessment"], unmapped: [], truncated: [] });
    expect(pub.nforms?.templateId).toBe("a77TEMPLATE0001");
    expect(lane(pub, "document").url).toContain("nFORMS__HtmlFormGenerator");
    expect(pub.approval?.processInstanceId).toBe("04gPROCESS0001");
    expect(pub.ledger).toEqual({ decisionAt: "2026-09-04T11:36:58.328Z", auditAt: "2026-09-04T11:37:05.393Z" });
    expect(pub.afs).toEqual({ workpackageId: "32590" });
    expect(pub.simulated).toBeUndefined();
  });

  it("sends each connector its own tools, by display name", async () => {
    const { calls } = installMcp();
    await publishMemo(DRAFT, CTX);
    expect(new Set(calls.filter((c) => c.tool.startsWith("ncino_")).map((c) => c.server))).toEqual(new Set(["Experience / nCino"]));
    expect(calls.find((c) => c.tool === "create_workpackage")?.server).toBe("AFS");
  });

  it("attributes every write to the acting banker", async () => {
    const { calls } = installMcp();
    await publishMemo(DRAFT, CTX);
    for (const call of calls.filter((c) => c.server === "Experience / nCino")) {
      expect(call.input).toMatchObject({ actingUserId: "005USER00000001", actingUserName: "A Banker" });
    }
  });

  it("publishes nCino-safe HTML, never the memo's own markup", async () => {
    const { calls } = installMcp();
    await publishMemo(DRAFT, CTX);
    const html = (calls.find((c) => c.tool === "ncino_publish_credit_memo")?.input as { html: string }).html;
    expect(html).not.toContain("<style");
    expect(html).toContain("color:#2E0A4F");
  });
});

describe("prerequisite gating", () => {
  it("holds the approval when the document did not publish, and runs everything else", async () => {
    const { calls } = installMcp((tool) => (tool === "ncino_publish_credit_memo" ? { ok: false, message: "nFORMS refused the template." } : ANSWERS[tool]));
    const pub = await publishMemo(DRAFT, CTX);

    expect(lane(pub, "document").status).toBe("failed");
    expect(lane(pub, "approval").status).toBe("skipped");
    expect(lane(pub, "approval").detail).toContain("document");
    expect(calls.some((c) => c.tool === "ncino_submit_for_approval")).toBe(false);
    // Independence: the other three systems still ran.
    expect(lane(pub, "finalize").status).toBe("done");
    expect(lane(pub, "ledger").status).toBe("done");
    expect(lane(pub, "servicing").status).toBe("done");
    expect(pub.status).toBe("partial");
  });

  it("does NOT hold the rest of the sequence on a failed narrative sync", async () => {
    const { calls } = installMcp((tool) => (tool === "ncino_sync_memo_sections" ? { ok: false, message: "The package is locked." } : ANSWERS[tool]));
    const pub = await publishMemo(DRAFT, CTX);
    expect(lane(pub, "sections").status).toBe("failed");
    expect(lane(pub, "approval").status).toBe("done");
    expect(calls.some((c) => c.tool === "ncino_submit_for_approval")).toBe(true);
  });

  it("reports failed when nothing landed, and still reports every lane", async () => {
    installMcp(() => new Error("connector down"));
    const pub = await publishMemo(DRAFT, CTX);
    expect(pub.status).toBe("failed");
    expect(pub.lanes).toHaveLength(LANE_IDS.length);
    expect(pub.lanes.filter((l) => l.status === "failed").length).toBeGreaterThan(0);
  });
});

describe("writes are never retried", () => {
  it("calls a rejected write exactly once, even when the platform stamps it retryable", async () => {
    const rejection = { __reject: { code: "server_unavailable", message: "briefly unreachable", retryable: true } };
    const { calls } = installMcp((tool) => (tool === "ncino_sync_memo_sections" ? rejection : ANSWERS[tool]));
    const pub = await publishMemo(DRAFT, CTX);
    expect(calls.filter((c) => c.tool === "ncino_sync_memo_sections")).toHaveLength(1);
    expect(lane(pub, "sections").status).toBe("failed");
  });

  it("says the outcome is unknown when the failure was ambiguous", async () => {
    const rejection = { __reject: { code: "server_unavailable", message: "briefly unreachable" } };
    installMcp((tool) => (tool === "ncino_submit_for_approval" ? rejection : ANSWERS[tool]));
    const pub = await publishMemo(DRAFT, CTX);
    expect(lane(pub, "approval").ambiguous).toBe(true);
    expect(lane(pub, "approval").detail).toContain("may already have run");
  });

  it("never caches a write", async () => {
    // The retry flag never leaves `callTool` (it decides there); what reaches
    // the platform is the cache instruction, and a write is never cached.
    const { calls } = installMcp();
    await publishMemo(DRAFT, CTX);
    for (const call of calls) expect(call.options).toMatchObject({ cache: false });
  });
});

describe("a simulated write is not a write", () => {
  it("marks the lane and the publication when the connector answered from fixtures", async () => {
    installMcp((tool) => ({ ...(ANSWERS[tool] as object), _source: "NCINO-FIXTURE", simulated: true }));
    const pub = await publishMemo(DRAFT, CTX);
    expect(pub.simulated).toBe(true);
    expect(lane(pub, "sections").simulated).toBe(true);
    expect(pub.status).toBe("published");
  });

  it("reads the AFS fixture marker off the workpackage id", async () => {
    installMcp((tool) =>
      tool === "create_workpackage"
        ? { workpackageId: "WP-FIXTURE-1", messages: [{ severity: "info", text: "Workpackage created (fixture)." }] }
        : ANSWERS[tool],
    );
    const pub = await publishMemo(DRAFT, CTX);
    expect(lane(pub, "servicing").simulated).toBe(true);
  });
});

describe("the ledger is one step and two writes", () => {
  it("fails the lane, naming what did land, when only one of the two reached it", async () => {
    installMcp((tool) => (tool === "log_audit_event" ? { __reject: { code: "tool_error", message: "no" } } : ANSWERS[tool]));
    const pub = await publishMemo(DRAFT, CTX);
    expect(lane(pub, "ledger").status).toBe("failed");
    expect(lane(pub, "ledger").detail).toContain("The decision was recorded");
  });
});

describe("what is skipped rather than guessed", () => {
  it("stages no AFS workpackage without a servicing key, and calls AFS not at all", async () => {
    const { calls } = installMcp();
    const pub = await publishMemo({ ...DRAFT, afs: undefined }, CTX);
    expect(lane(pub, "servicing").status).toBe("skipped");
    expect(calls.some((c) => c.server === "AFS")).toBe(false);
  });

  it("stages no workpackage without declared facilities, rather than letting AFS supply its own", async () => {
    const { calls } = installMcp();
    const pub = await publishMemo({ ...DRAFT, servicingFacilities: [] }, CTX);
    expect(lane(pub, "servicing").status).toBe("skipped");
    expect(lane(pub, "servicing").detail).toContain("sample facilities");
    expect(calls.some((c) => c.server === "AFS")).toBe(false);
  });

  it("skips the approval when no approver was named", async () => {
    const { calls } = installMcp();
    const pub = await publishMemo(DRAFT, { ...CTX, approverEmails: [] });
    expect(lane(pub, "approval").status).toBe("skipped");
    expect(calls.some((c) => c.tool === "ncino_submit_for_approval")).toBe(false);
  });

  it("syncs no narrative when the draft carries no section nCino has a field for", async () => {
    const { calls } = installMcp();
    const pub = await publishMemo({ ...DRAFT, sections: [{ id: "peer_outlook", title: "Peers", html: "<p>x</p>" }] }, CTX);
    expect(lane(pub, "sections").status).toBe("skipped");
    expect(calls.some((c) => c.tool === "ncino_sync_memo_sections")).toBe(false);
  });

  it("publishes no document when the draft carries no rendered memo", async () => {
    const { calls } = installMcp();
    const pub = await publishMemo({ ...DRAFT, html: "" }, CTX);
    expect(lane(pub, "document").status).toBe("skipped");
    expect(calls.some((c) => c.tool === "ncino_publish_credit_memo")).toBe(false);
  });
});

describe("the sections that go to nCino", () => {
  it("keys by nCino's own section ids and drops the rest", () => {
    const sections = syncableSections({
      ...DRAFT,
      sections: [
        { id: "deal_summary", title: "Deal", html: "<p>A</p>" },
        { id: "peer_outlook", title: "Peers", html: "<p>B</p>" },
        { id: "background", title: "Background", html: "   " },
      ],
    });
    expect(Object.keys(sections)).toEqual(["deal_summary"]);
  });

  it("inlines a section's own stylesheet and sends no stylesheet", () => {
    const sections = syncableSections({
      ...DRAFT,
      sections: [{ id: "background", title: "Background", html: `<style>p{color:red}</style><section><p>A</p></section>` }],
    });
    expect(sections.background).toBe('<p style="color:red">A</p>');
  });
});
