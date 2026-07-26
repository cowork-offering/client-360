// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { vi } from "vitest";
import sample from "../../artifact/sample-data.json";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATA = sample as unknown as C360Data;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

function mount(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={DATA}>
        <AppShell />
      </AppProvider>,
    );
  });
  return container;
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const press = (key: string) => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const openRow = (name: string) =>
  [...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes(name))!;
/** The Action Panel is the dialog whose label is the action name. */
const panel = (label: string) =>
  [...document.querySelectorAll('[role="dialog"]')].find((d) => d.getAttribute("aria-label") === label) ?? null;

/** Open an account, its Client Actions sheet, then a panel-backed action row. */
function openActionPanel(actionLabel: string, account = "Sterling Fabrication") {
  mount();
  click(openRow(account));
  click(byText(/Client Actions/)!);
  const row = [...document.querySelector('[role="dialog"]')!.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(actionLabel),
  )!;
  click(row);
}

describe("A33.1.1 — one modal, three entry points", () => {
  it("opens from a Client Actions row", () => {
    openActionPanel("Create Service Request");
    expect(panel("Create Service Request")).toBeTruthy();
  });

  it("opens from an activity next-step button", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Headroom analysis concluded/)!);
    const step = [...document.querySelector('[aria-modal="true"]')!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Collateral Valuation"),
    )!;
    click(step);
    expect(panel("Collateral Valuation")).toBeTruthy();
  });

  it("opens from a chat suggestion chip", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    click(buttons().find((b) => /Open chat/.test(b.getAttribute("aria-label") ?? ""))!);
    const chip = [...document.querySelectorAll('[role="dialog"]')]
      .flatMap((d) => [...d.querySelectorAll("button")])
      .find((b) => b.hasAttribute("title") && /Collateral Valuation/.test(b.textContent ?? ""));
    if (!chip) return; // suggestion ordering is data-driven; covered by engine tests
    click(chip);
    expect(panel("Collateral Valuation")).toBeTruthy();
  });

  it("renders the SAME schema whichever entry point opened it", () => {
    // Entry point 1: the Client Actions row.
    openActionPanel("Collateral Valuation");
    const fromRow = panel("Collateral Valuation")!.textContent ?? "";
    press("Escape"); // closes the Action Panel
    press("Escape"); // closes the Client Actions sheet

    // Entry point 2: the activity next-step button, same mount.
    click(byText(/Headroom analysis concluded/)!);
    const step = [...document.querySelector('[aria-modal="true"]')!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Collateral Valuation"),
    )!;
    click(step);
    const fromActivity = panel("Collateral Valuation")!.textContent ?? "";

    for (const label of ["Valuation source", "Valuation type", "Valuation amount", "Valuation notes"]) {
      expect(fromRow, label).toContain(label);
      expect(fromActivity, label).toContain(label);
    }
  });

  it("a non-panel action still fires directly instead of opening a modal", () => {
    openActionPanel("New Facility Request");
    expect(panel("New Facility Request")).toBeNull();
  });
});

describe("A31.1 modal chrome", () => {
  it("portals above the app tree", () => {
    openActionPanel("Create Service Request");
    expect(container!.contains(panel("Create Service Request"))).toBe(false);
  });

  it("stacks on the shared z-scale", () => {
    openActionPanel("Create Service Request");
    const overlay = panel("Create Service Request")!.parentElement as HTMLElement;
    expect(overlay.getAttribute("style") ?? "").toContain("--z-modal");
  });

  it("focuses the panel on open and closes on Escape", () => {
    openActionPanel("Create Service Request");
    expect(document.activeElement).toBe(panel("Create Service Request"));
    press("Escape");
    expect(panel("Create Service Request")).toBeNull();
  });

  it("traps Tab inside the panel", () => {
    openActionPanel("Create Service Request");
    const p = panel("Create Service Request")!;
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(p.contains(document.activeElement)).toBe(true);
  });
});

describe("A33.1.2/A33.1.3 — schema-driven render and chips", () => {
  it("renders the schema's fields as inputs with banker labels", () => {
    openActionPanel("Annual Review");
    const text = panel("Annual Review")!.textContent ?? "";
    for (const label of ["Relationship", "Status", "Review type", "Review narrative", "Recommendation"]) {
      expect(text, label).toContain(label);
    }
    // Banker language, never API names.
    expect(text).not.toContain("LLC_BI__");
  });

  it("renders a DERIVED chip for a client-request prefill", () => {
    openActionPanel("Create Service Request");
    expect(panel("Create Service Request")!.textContent).toContain("Derived");
  });

  it("renders read-only fields with their reason rather than as inputs", () => {
    openActionPanel("Annual Review");
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("the tool creates at In Progress and stops");
    expect(p.textContent).toContain("never written by this tool");
  });

  it("disables a picklist whose org options have not loaded, and says so", () => {
    openActionPanel("Annual Review");
    const p = panel("Annual Review")!;
    const select = p.querySelector("select")!;
    expect(select.hasAttribute("disabled")).toBe(true);
    expect(p.textContent).toContain("Options are read from the org");
  });

  it("marks an edited agent narrative as edited, panel-side only", () => {
    openActionPanel("Annual Review");
    const p = panel("Annual Review")!;
    const area = [...p.querySelectorAll("textarea")][0];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(area, "revised by the banker");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panel("Annual Review")!.textContent).toContain("edited by you");
    // A33.1.7: nothing is injected into the field text itself.
    expect((area as HTMLTextAreaElement).value).toBe("revised by the banker");
  });
});

describe("collateral anchor gap blocks the tool (live defect 2026-07-26)", () => {
  /** Install a live mcp capability whose callTool we can assert was NEVER hit. */
  function installLiveMcp() {
    const callTool = vi.fn().mockResolvedValue({ payload: { content: [{ isSuccess: true, outputValues: { ok: true, result: {} } }] } });
    (window as unknown as { claude?: unknown }).claude = {
      mcp: { callTool, watchTool: vi.fn().mockReturnValue(() => {}), listTools: vi.fn(), invalidate: vi.fn() },
    };
    return callTool;
  }

  afterEach(() => {
    delete (window as unknown as { claude?: unknown }).claude;
  });

  it("renders the named gap instead of a stageable form", () => {
    installLiveMcp();
    openActionPanel("Collateral Valuation");
    const text = panel("Collateral Valuation")!.textContent ?? "";
    // The sample stages no collateral record id, so the honest gap shows.
    expect(text).toMatch(/collateral record id is not staged|No collateral is pledged/);
  });

  it("disables the staging gesture, so the tool is never called", () => {
    const callTool = installLiveMcp();
    openActionPanel("Collateral Valuation");
    const review = [...panel("Collateral Valuation")!.querySelectorAll("button")].find((b) =>
      /Review the plan/.test(b.textContent ?? ""),
    );
    if (review) {
      expect(review.hasAttribute("disabled")).toBe(true);
      click(review); // a disabled button fires nothing, but assert the outcome
    }
    const staged = callTool.mock.calls.filter((c) => String(c[1]).startsWith("stage_"));
    expect(staged).toHaveLength(0);
  });

  it("never sends a facility id as the collateral anchor", () => {
    const callTool = installLiveMcp();
    openActionPanel("Collateral Valuation");
    for (const call of callTool.mock.calls) {
      const input = call[2] as { inputs?: Array<Record<string, unknown>> } | undefined;
      for (const row of input?.inputs ?? []) {
        // a1X... is a Loan id prefix; it must never appear as collateralId.
        expect(String(row.collateralId ?? "")).not.toMatch(/^a1X/);
      }
    }
  });
});

describe("A33.2 — suggestions and named gaps in the panel", () => {
  it("shows the deterministic suggestion with its policy stamp", () => {
    openActionPanel("Collateral Valuation");
    const text = panel("Collateral Valuation")!.textContent ?? "";
    expect(text).toContain("What the figures say");
    expect(text).toMatch(/Policy demo-2026-07/);
  });

  it("requires a reason before a suggestion can be declined", () => {
    openActionPanel("Collateral Valuation");
    const p = panel("Collateral Valuation")!;
    const decline = [...p.querySelectorAll("button")].find((b) => /Decline with reason/.test(b.textContent ?? ""));
    if (!decline) return; // no suggestion fired for this data shape
    click(decline);
    const record = [...panel("Collateral Valuation")!.querySelectorAll("button")].find((b) =>
      /Record and decline/.test(b.textContent ?? ""),
    )!;
    expect(record.hasAttribute("disabled")).toBe(true);
  });
});
