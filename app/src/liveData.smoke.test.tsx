// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { ACCOUNT_TABS } from "./state/appState";
import { resetModalStack } from "./components/modalStack";
import { readAnchors } from "./data/contract";
import live from "../../artifact/live-data.json";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   EVERY STAGED ACCOUNT RENDERS. EVERY TAB.

   The gap this exists to close: a real bundle merged from live tool responses
   crashed the profile to a blank screen, because one field arrived in a shape
   no sample bundle had ever used. Unit tests over helpers cannot catch that —
   only mounting the real data can.

   So this walks EVERY account in EVERY staged data file through EVERY tab and
   asserts something rendered. A gap state is a pass. A blank screen is not.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetModalStack();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", live as unknown as C360Data],
  ["sample-data.json", sample as unknown as C360Data],
];

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

const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

function openAccount(name: string) {
  const row = [...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes(name));
  expect(row, `no worklist row for ${name}`).toBeTruthy();
  click(row!);
}

for (const [fileName, data] of FILES) {
  const accounts = Object.entries(data.borrowers ?? {});

  describe(`${fileName} — every staged account renders`, () => {
    it("has accounts to render", () => {
      expect(accounts.length).toBeGreaterThan(0);
    });

    for (const [accountId, bundle] of accounts) {
      const name = bundle.snapshot?.name ?? accountId;

      it(`renders the profile for ${name}`, () => {
        mount(data);
        openAccount(name);
        const workspace = container!.textContent ?? "";
        // The account view rendered SOMETHING about this relationship, not a
        // blank shell.
        expect(workspace, `${name} rendered blank`).toContain(name);
        expect(workspace.length).toBeGreaterThan(200);
      });

      it(`renders every tab for ${name}`, () => {
        mount(data);
        openAccount(name);
        for (const tab of ACCOUNT_TABS) {
          const button = [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === tab.label);
          expect(button, `${name}: no tab button for ${tab.label}`).toBeTruthy();
          click(button!);
          const text = container!.textContent ?? "";
          // A gap state is a pass. A crash is not: React unmounts the tree and
          // the workspace loses the account name it was rendering a moment ago.
          expect(text, `${name}: ${tab.label} crashed the workspace`).toContain(name);
          expect(text.length, `${name}: ${tab.label} rendered nothing`).toBeGreaterThan(200);
        }
      });
    }
  });
}

describe("the shapes a real bundle is allowed to arrive in", () => {
  it("tolerates anchors as an OBJECT, which is how the live merge produced them", () => {
    // The crash: every sample bundle carried `anchors` as an array of chips, so
    // the header mapped over it. One real bundle carried an object, and .map
    // threw straight through the workspace.
    const hartwell = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"];
    expect(hartwell).toBeTruthy();
    expect(Array.isArray(hartwell!.anchors)).toBe(false);
  });

  it("tolerates a bundle with no boom, no verdict and no requests", () => {
    const hartwell = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"]!;
    expect(hartwell.boom).toBeUndefined();
    expect(hartwell.verdict).toBeUndefined();
    expect(hartwell.requests).toBeUndefined();
  });
});


describe("Hartwell's real-data conditions each render as a gap, not a crash", () => {
  const HARTWELL = "Hartwell Precision Manufacturing LLC";
  const data = live as unknown as C360Data;

  const openTab = (label: string) => {
    mount(data);
    openAccount(HARTWELL);
    const button = [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
    click(button);
    return container!.textContent ?? "";
  };

  it("no Boom workbook: the Financials tab states the gap", () => {
    const text = openTab("Financials");
    expect(text).toContain(HARTWELL);
    // An honest gap, in the tab's own words, rather than an empty panel.
    expect(text.length).toBeGreaterThan(200);
  });

  it("a covenant with null actual and threshold still renders its row", () => {
    const covenants = data.borrowers?.["001bb00001I7FPNAA3"]?.covenants?.covenants ?? [];
    const nulls = covenants.filter((c) => c.actualValue == null || c.thresholdValue == null);
    expect(nulls.length, "the fixture should carry a null-valued covenant").toBeGreaterThan(0);
    const text = openTab("Covenants");
    expect(text).toContain(nulls[0].covenantType ?? "");
  });

  it("a facility that matured in the past renders without throwing", () => {
    const facs = data.borrowers?.["001bb00001I7FPNAA3"]?.exposure?.facilities ?? [];
    const past = facs.filter((f) => f.maturityDate && f.maturityDate < "2026-07-26");
    expect(past.length, "the fixture should carry a matured facility").toBeGreaterThan(0);
    expect(openTab("Exposure & Collateral")).toContain(HARTWELL);
  });

  it("no verdict key: the header renders without one", () => {
    mount(data);
    openAccount(HARTWELL);
    expect(container!.textContent).toContain(HARTWELL);
  });
});

describe("readAnchors tolerates whatever a producer sends", () => {
  it("keeps well-formed chips", () => {
    const chips = [{ label: "Rating", value: "Grade 5" }];
    expect(readAnchors({ snapshot: { accountId: "x" }, anchors: chips } as never)).toEqual(chips);
  });

  it("treats a non-array as no chips at all, rather than throwing", () => {
    for (const shape of [{ accountId: "x" }, "chips", 7, null, undefined]) {
      expect(readAnchors({ snapshot: { accountId: "x" }, anchors: shape } as never)).toEqual([]);
    }
  });

  it("drops malformed entries and keeps the rest", () => {
    const mixed = [{ label: "Rating", value: "Grade 5" }, { label: "Broken" }, null, "nope"];
    expect(readAnchors({ snapshot: { accountId: "x" }, anchors: mixed } as never)).toEqual([
      { label: "Rating", value: "Grade 5" },
    ]);
  });
});
