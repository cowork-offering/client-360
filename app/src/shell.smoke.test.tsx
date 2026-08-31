// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
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
  // The shell PERSISTS the open view to sessionStorage, so a test that opens a
  // relationship would otherwise hand the next one an app that boots straight
  // into the client with no worklist to click.
  sessionStorage.clear();
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

  /* A24 unchanged: the Accenture mark belongs in this app and Connectry does
     not. What changed is WHERE the mark lives. DIRECTION-LOCKED rule 45 retired
     the spelled-out "accenture / Commercial Credit 360" lockup from the 52px
     bar and left the original ">" alone carrying the brand, so the branding is
     now an accessible name on the mark rather than a run of text. Asserting on
     textContent would be asserting on the retired header. */
  it("carries the Accenture engagement chrome (A24) but no Connectry assets", () => {
    render();
    const mark = document.body.querySelector('[aria-label="accenture"]');
    expect(mark, "the brand mark must carry the accenture name").toBeTruthy();
    // 2026-08-31 founder lock: the mark is the ORIGINAL vector (path8760), not a typed ">".
    expect(mark!.querySelector("svg path"), "the mark renders the official vector").toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Connectry/i); // devpersonal wall still bans Connectry
  });
});

/* THESE GO THROUGH THE SHELL NOW. DIRECTION-LOCKED rule 11 moved the workspace
   nav out of the workspace and into the header capsule, so the pane and the
   control that selects it no longer live in the same component: mounting
   AccountWorkspace alone renders a client with no way to change tab. The
   assertions are unchanged — the same anchor bundle, the same panes. */
describe("the client view — L2 panes render from the anchor bundle", () => {
  function openAnchor() {
    render();
    const row = [...document.body.querySelectorAll('[role="button"]')].find((r) =>
      r.textContent?.includes("Piedmont Precision"),
    )!;
    act(() => row.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("A30.1 — Activity is the FIRST tab and the default view", () => {
    openAnchor();
    const text = container!.textContent ?? "";
    expect(text).toContain("Piedmont Precision"); // the hero's name
    expect(text).toContain("Activity · audit trail");
    // Newest first: the concluded analysis leads the anchor's timeline.
    expect(text).toContain("Relationship review concluded");
    expect(text).toContain("Debt Service Coverage Ratio tested");
    expect(text).toContain("1 suggested next step");
  });

  it("renders Exposure pane content when its capsule tab is selected", () => {
    openAnchor();
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
