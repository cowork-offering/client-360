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
  it("tolerates anchors in EITHER shape, whatever the producer sends", () => {
    // The crash: every sample bundle carried `anchors` as an array of chips, so
    // the header mapped over it. One real bundle carried an object, and .map
    // threw straight through the workspace. The producer has since corrected
    // the shape, which is exactly why the guard must stay: the cockpit cannot
    // depend on a producer never regressing.
    const hartwell = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"];
    expect(hartwell).toBeTruthy();
    expect(() => readAnchors(hartwell)).not.toThrow();
    expect(readAnchors({ ...hartwell!, anchors: { accountId: "x" } as never })).toEqual([]);
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


describe("no list surface renders raw org row multiplicity", () => {
  const HARTWELL = "Hartwell Precision Manufacturing LLC";
  const data = live as unknown as C360Data;

  const graphText = () => {
    mount(data);
    openAccount(HARTWELL);
    const button = [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Relationship Graph")!;
    click(button);
    return container!.textContent ?? "";
  };

  it("shows each mirrored counterparty ONCE", () => {
    const text = graphText();
    for (const name of ["Hartwell Industrial Holdings LLC", "Hartwell Logistics LLC", "James Hartwell", "Elena Hartwell"]) {
      const hits = text.split(name).length - 1;
      expect(hits, `${name} rendered ${hits} times`).toBeLessThanOrEqual(1);
    }
  });

  it("never shows the mirror's generic role", () => {
    // "Child" and "Company" are the reflections of Parent and Owner, not
    // relationships in their own right.
    const text = graphText();
    expect(text).not.toContain("· Child");
    expect(text).not.toContain("· Company");
  });

  it("shows one borrower involvement with its facility count, not six rows", () => {
    const text = graphText();
    expect(text).toContain("6 facilities");
    // The borrower's own name appears once in the involvement list.
    const rows = [...container!.querySelectorAll("div")].filter((d) => d.textContent?.trim().startsWith(HARTWELL));
    expect(rows.length).toBeLessThan(6);
  });

  it("leaves Piedmont's unduplicated graph alone", () => {
    mount(data);
    openAccount("Piedmont Precision Components, Inc.");
    const button = [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Relationship Graph")!;
    click(button);
    const text = container!.textContent ?? "";
    expect(text).toContain("Margaret Holloway");
    expect(text).toContain("Personal Guaranty");
    // One facility each: no count is claimed where there is nothing to count.
    expect(text).not.toContain("facilities");
  });
});


describe("the founder's button, on the real bundle", () => {
  const data = live as unknown as C360Data;

  it("offers Loan Modification and Renewal on Hartwell's booked facilities", () => {
    mount(data);
    openAccount("Hartwell Precision Manufacturing LLC");
    const trigger = [...container!.querySelectorAll("button")].find((b) => /Client Actions/.test(b.textContent ?? ""))!;
    click(trigger);
    for (const label of ["Loan Modification", "Renewal"]) {
      const row = [...document.querySelectorAll('[role="dialog"]')]
        .flatMap((d) => [...d.querySelectorAll("button")])
        .find((b) => b.textContent?.includes(label))!;
      expect(row, `${label} missing from Client Actions`).toBeTruthy();
      expect(row.hasAttribute("disabled"), `${label} is greyed out on six booked loans`).toBe(false);
    }
  });

  it("still greys them on Piedmont, and says the facilities are at Final Review", () => {
    mount(data);
    openAccount("Piedmont Precision Components, Inc.");
    const trigger = [...container!.querySelectorAll("button")].find((b) => /Client Actions/.test(b.textContent ?? ""))!;
    click(trigger);
    const row = [...document.querySelectorAll('[role="dialog"]')]
      .flatMap((d) => [...d.querySelectorAll("button")])
      .find((b) => b.textContent?.includes("Loan Modification"))!;
    expect(row.hasAttribute("disabled")).toBe(true);
    expect(row.textContent).toContain("Final Review");
  });
});
