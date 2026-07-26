// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { resetModalStack } from "./components/modalStack";
import sample from "../../artifact/sample-data.json";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetModalStack();
  delete (window as unknown as { claude?: unknown }).claude;
  vi.restoreAllMocks();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

/** The live shape: a pledge that DOES carry its collateral record id, so the
 *  valuation is stageable exactly as it was in Fabian's org. */
function liveData(): C360Data {
  const d = structuredClone(sample) as unknown as C360Data;
  d.meta = { ...d.meta, userId: "005bb00000ftouDAAQ", instanceUrl: "https://bankinggpt.lightning.force.com" };
  const b = (d.borrowers ?? {})["001SAMPLE0000STRL"];
  for (const f of b.exposure?.facilities ?? []) {
    for (const c of f.collateral ?? []) c.collateralId = "a34bb00000COL758AAA";
  }
  return d;
}

const envelope = (outputValues: unknown) => ({
  payload: { content: [{ actionName: "t", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
});

const PLAN = {
  ok: true,
  error: null,
  result: {
    stagingId: "a8abb00001KtalSAAR",
    planHash: "9f2c1d",
    decisionToken: "dt-server-001",
    accountId: "001SAMPLE0000STRL",
    summary: "Files a collateral valuation.",
    warnings: [],
    steps: [
      { id: "s1", type: "write", label: "Create the collateral valuation", objectName: "LLC_BI__Collateral_Valuation__c", fields: ["LLC_BI__Value__c"], state: "pending" },
    ],
  },
};

const EXECUTED = {
  ok: true,
  error: null,
  result: {
    stagingId: "a8abb00001KtalSAAR",
    terminalState: "success",
    outcome: "The valuation was created and verified.",
    valuationId: "a34bb00000399FFAAY",
    recordName: "CV-0000000002",
    anchorName: "COL-000758",
    steps: [{ id: "s1", type: "write", label: "Create the collateral valuation", state: "verified" }],
  },
};

function installMcp() {
  const callTool = vi.fn(async (_server: string, tool: string, _input?: unknown) => {
    if (tool.startsWith("stage_")) return envelope(PLAN);
    if (tool.startsWith("execute_")) return envelope(EXECUTED);
    return envelope({});
  });
  (window as unknown as { claude?: unknown }).claude = {
    mcp: { callTool, watchTool: vi.fn().mockReturnValue(() => {}), listTools: vi.fn(), invalidate: vi.fn() },
  };
  return callTool;
}

function mount(data: C360Data) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={data}>
        <AppShell />
      </AppProvider>,
    );
  });
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const press = (key: string) => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("an executed action is VISIBLE in the Activity tab (live defect 2026-07-26)", () => {
  it("uses one account key for the writer and the reader", async () => {
    installMcp();
    const data = liveData();
    // The panel used to key the entry off state.accountId alone while the tab
    // read state.accountId with a fallback. Any path that opens an action with
    // no account selected wrote under "" and the entry became unreadable.
    mount(data);
    click([...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes("Sterling Fabrication"))!);
    click(byText(/Client Actions/)!);
    click([...document.querySelector('[role="dialog"]')!.querySelectorAll("button")].find((b) => b.textContent?.includes("Collateral Valuation"))!);
    click(byText(/Review the plan/)!);
    await flush();
    click(byText(/Confirm and file/)!);
    await flush();
    press("Escape");
    press("Escape");

    // The rendered row, found by the account the tab is actually showing.
    const rows = [...document.querySelectorAll('[data-origin="user"]')];
    expect(rows.some((r) => /CV-0000000002/.test(r.textContent ?? ""))).toBe(true);
  });

  it("renders the entry in the timeline the banker is looking at", async () => {
    installMcp();
    mount(liveData());
    click([...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes("Sterling Fabrication"))!);
    click(byText(/Client Actions/)!);
    click([...document.querySelector('[role="dialog"]')!.querySelectorAll("button")].find((b) => b.textContent?.includes("Collateral Valuation"))!);

    click(byText(/Review the plan/)!);
    await flush();
    click(byText(/Confirm and file/)!);
    await flush();

    // Close the panel and the Client Actions sheet, landing back on the tab.
    press("Escape");
    press("Escape");

    // The ACTUAL RENDERED TIMELINE, not the store behind it.
    const timeline = [...document.querySelectorAll('[data-origin="user"]')];
    const filed = timeline.find((r) => /CV-0000000002/.test(r.textContent ?? ""));
    expect(filed, "no ACTION_EXECUTED row rendered in the Activity tab").toBeTruthy();
    expect(filed!.textContent).toContain("COL-000758");
  });
});
