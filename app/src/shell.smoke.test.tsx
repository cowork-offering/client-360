// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { AccountWorkspace } from "./components/AccountWorkspace";
import type { BorrowerBundle } from "./data/contract";
import sample from "../../artifact/sample-data.json";

// React 19 act() environment flag.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mount(node: React.ReactNode): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<AppProvider data={sample as unknown as C360Data}>{node}</AppProvider>);
  });
  return container.textContent ?? "";
}

const render = () => mount(<AppShell />);

/** Zero-channel render: no window.sendPrompt is set, so the app must be fully
 *  navigable (home worklist + KPIs) with chat gracefully disabled (SPEC §10.4). */
describe("AppShell — standalone zero-channel render", () => {
  it("renders the KPI band, worklist, and the staged anchor", () => {
    const text = render();
    expect(text).toContain("Managed exposure");
    expect(text).toContain("Needs action");
    expect(text).toContain("Piedmont Precision");
  });

  it("disables chat with an inline explanation when no channel is present", () => {
    render();
    // A27.1: the explanation now lives inside the FAB panel, not a persistent drawer.
    const fab = [...document.body.querySelectorAll("button")].find((b) =>
      /Open chat/.test(b.getAttribute("aria-label") ?? ""),
    )!;
    act(() => fab.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.body.textContent).toContain("Chat unavailable in this view");
  });

  it("carries the Accenture engagement chrome (A24) but no Connectry assets", () => {
    const text = render();
    expect(text.toLowerCase()).toContain("accenture"); // engagement branding belongs (A24)
    expect(text).not.toMatch(/Connectry/i); // devpersonal wall still bans Connectry
  });
});

describe("AccountWorkspace — L2 tabs render from the anchor bundle", () => {
  const anchor = (sample as unknown as C360Data).borrower as BorrowerBundle;

  it("A30.1 — Activity is the FIRST tab and the default view", () => {
    const text = mount(<AccountWorkspace bundle={anchor} />);
    expect(text).toContain("Piedmont Precision"); // verdict bar name
    expect(text).toContain("Activity · audit trail");
    // Newest first: the concluded analysis leads the anchor's timeline.
    expect(text).toContain("Relationship review concluded");
    expect(text).toContain("Debt Service Coverage Ratio tested");
    expect(text).toContain("1 suggested next step");
  });

  it("renders Exposure tab content when selected", () => {
    mount(<AccountWorkspace bundle={anchor} />);
    const tab = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Exposure & Collateral",
    )!;
    act(() => tab.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const text = container!.textContent ?? "";
    expect(text).toContain("Committed vs Drawn");
    expect(text).toContain("Coverage ratio");
    expect(text).toContain("Piedmont Equipment Term Loan");
  });
});
