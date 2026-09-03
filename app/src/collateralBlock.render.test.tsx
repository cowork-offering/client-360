// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BorrowerBundle, C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { ExposureTab } from "./components/tabs/ExposureTab";
import { collateralAssets, firstSentence, splitCollateralType } from "./domain/collateralAssets";
import live from "../../artifact/live-data.json";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   THE ACCOUNT'S COLLATERAL, ON THE EXPOSURE PANE.

   FOUNDER READ (2026-09-03): "Why is the collateral name that long? Should it
   not be Collateral Type and Sub-type and address information? Same as for the
   covenants: I would like to have the account collaterals shown here nicely and
   not confusing; clicking onto it shows the active pledges."

   So the asset is named by WHAT IT IS, one row each however many facilities it
   secures, and the pledges are its detail behind a click. These mirror the
   covenant tests one for one, because it is the same list primitive.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", live as unknown as C360Data],
  ["sample-data.json", sample as unknown as C360Data],
];

const everyBorrower: Array<[string, string, C360Data, BorrowerBundle]> = FILES.flatMap(([file, data]) =>
  Object.entries(data.borrowers ?? {}).map(
    ([id, b]) =>
      [file, (b as BorrowerBundle).snapshot?.name ?? id, data, b as BorrowerBundle] as [
        string,
        string,
        C360Data,
        BorrowerBundle,
      ],
  ),
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(data: C360Data, bundle: BorrowerBundle): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={data}>
        <ExposureTab bundle={bundle} />
      </AppProvider>,
    );
  });
  return container;
}

const COLUMNS = 7;
const headers = (el: HTMLElement) => [...el.querySelectorAll('[data-x-head="collateral"]')];
const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-x-row="collateral"]')];
const pledgeRows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-x-sub="collateral"]')];
const cell = (row: HTMLElement, i: number) => (row.children[i].textContent ?? "").trim();
const rowFor = (el: HTMLElement, sub: string) => rows(el).find((r) => cell(r, 1) === sub)!;
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("the org's own two-level type name", () => {
  it("splits on the FIRST hyphen, so a two-word family survives", () => {
    expect(splitCollateralType("Real Estate-Warehouse")).toEqual({ type: "Real Estate", subType: "Warehouse" });
    expect(splitCollateralType("UCC-Accounts")).toEqual({ type: "UCC", subType: "Accounts" });
  });

  it("leaves a type with no hyphen whole, rather than cutting it in half", () => {
    expect(splitCollateralType("Equipment")).toEqual({ type: "Equipment", subType: null });
    expect(splitCollateralType(undefined)).toEqual({ type: "Collateral", subType: null });
  });

  it("takes the first sentence as the descriptor, and nothing when there is none", () => {
    expect(firstSentence("One thing. And then another.")).toBe("One thing.");
    expect(firstSentence("No stop at all")).toBe("No stop at all");
    expect(firstSentence(null)).toBeNull();
  });
});

describe("one row per asset, in every relationship", () => {
  for (const [file, name, data, bundle] of everyBorrower) {
    const assets = collateralAssets(bundle);

    it(`${name} (${file}): one header, and every asset exactly once`, () => {
      const el = render(data, bundle);
      expect(headers(el)).toHaveLength(assets.length ? 1 : 0);
      expect(rows(el)).toHaveLength(assets.length);
    });

    it(`${name} (${file}): every row carries all seven columns and is a button`, () => {
      const el = render(data, bundle);
      for (const row of rows(el)) {
        expect(row.children.length, `${name}: a row with ${row.children.length} columns`).toBe(COLUMNS);
        expect(row.tagName).toBe("BUTTON");
        expect(row.getAttribute("aria-expanded")).toBe("false");
      }
    });

    it(`${name} (${file}): never puts the org's long description in the row`, () => {
      const el = render(data, bundle);
      for (const row of rows(el)) {
        // The descriptor is one sentence; the paragraph lives on the title.
        const shown = cell(row, 2);
        expect(shown.split(". ").length, `${name}: a paragraph in the row`).toBeLessThanOrEqual(2);
      }
    });
  }
});

/* =========================================================================== */
describe("Hartwell: four assets, and the pledges under each", () => {
  const data = live as unknown as C360Data;
  const hartwell = data.borrowers!["001bb00001I7FPNAA3"] as BorrowerBundle;

  it("lists four assets once each, though the read carries seven pledges", () => {
    const el = render(data, hartwell);
    const pledgeCount = (hartwell.exposure?.facilities ?? []).reduce((n, f) => n + (f.collateral?.length ?? 0), 0);
    expect(pledgeCount).toBe(7);
    expect(rows(el)).toHaveLength(4);
    expect(headers(el)).toHaveLength(1);
  });

  it("names each asset by its type and sub-type, not by its description", () => {
    const el = render(data, hartwell);
    const warehouse = rowFor(el, "Warehouse");
    expect(cell(warehouse, 0)).toBe("Real Estate");
    expect(cell(warehouse, 1)).toBe("Warehouse");
    expect(cell(rowFor(el, "Accounts"), 0)).toBe("UCC");
    expect(cell(rowFor(el, "Inventory"), 0)).toBe("UCC");
    expect(cell(rowFor(el, "Equipment"), 0)).toBe("UCC");
  });

  it("shows one descriptor sentence with the org's own record name beside it", () => {
    const el = render(data, hartwell);
    const ar = rowFor(el, "Accounts");
    // One cell, two facts: the descriptor truncates, the record name never does.
    expect(cell(ar, 2)).toBe("All present and future accounts receivable.COL-000762");
    // The whole paragraph is on hover, and only there.
    const title = ar.children[2].getAttribute("title") ?? "";
    expect(title).toContain("20% concentration cap per account debtor.");
  });

  it("carries the asset's value, advance rate and lendable value off the bundle", () => {
    const el = render(data, hartwell);
    const ar = rowFor(el, "Accounts");
    expect(cell(ar, 3)).toBe("$12M");
    expect(cell(ar, 4)).toBe("80%");
    expect(cell(ar, 5)).toBe("$9.60M");
    const wh = rowFor(el, "Warehouse");
    expect(cell(wh, 3)).toBe("$14M");
    expect(cell(wh, 4)).toBe("75%");
    expect(cell(wh, 5)).toBe("$10.50M");
  });

  it("badges each asset with how many active pledges it carries", () => {
    const el = render(data, hartwell);
    const badge = (sub: string) => rowFor(el, sub).querySelector("[data-col-badge]")!.textContent;
    expect(badge("Accounts")).toBe("2 pledges");
    expect(badge("Inventory")).toBe("1 pledge");
    expect(badge("Warehouse")).toBe("2 pledges");
  });

  it("opens the warehouse onto its two facilities, with each pledge's figures", () => {
    const el = render(data, hartwell);
    const wh = rowFor(el, "Warehouse");
    expect(pledgeRows(el)).toHaveLength(0);
    click(wh);
    expect(wh.getAttribute("aria-expanded")).toBe("true");

    const opened = pledgeRows(el);
    expect(opened).toHaveLength(2);
    expect(cell(opened[0], 0)).toBe("Construction");
    expect(cell(opened[0], 1)).toBe("$12M");
    expect(cell(opened[0], 2)).toBe("$5.50M");
    expect(cell(opened[0], 3)).toBe("1st");
    expect(cell(opened[0], 4)).toBe("75%override");
    expect(cell(opened[1], 0)).toBe("Purchase");
    expect(cell(opened[1], 2)).toBe("$5M");
  });

  it("marks a rate the org defaulted from the type, and one a pledge overrode", () => {
    const el = render(data, hartwell);
    click(rowFor(el, "Accounts"));
    const opened = pledgeRows(el);
    expect(cell(opened[0], 4)).toBe("80%");
    expect(opened[0].children[4].getAttribute("title")).toContain("Collateral type default");
    click(rowFor(el, "Inventory"));
    const inv = pledgeRows(el).slice(2);
    expect(cell(inv[0], 4)).toBe("50%override");
  });

  it("toggles, and opens two assets at once on one grid", () => {
    const el = render(data, hartwell);
    const ar = rowFor(el, "Accounts");
    click(ar);
    expect(pledgeRows(el)).toHaveLength(2);
    click(ar);
    expect(pledgeRows(el)).toHaveLength(0);

    click(rowFor(el, "Warehouse"));
    click(rowFor(el, "Equipment"));
    expect(el.querySelectorAll('[data-x-expansion="collateral"]')).toHaveLength(2);
    expect(new Set(pledgeRows(el).map((r) => r.children.length))).toEqual(new Set([5]));
  });

  it("invents no figure: every pledged amount it renders is in the bundle", () => {
    const el = render(data, hartwell);
    for (const row of rows(el)) click(row);
    const pledged = (hartwell.exposure?.facilities ?? []).flatMap((f) =>
      (f.collateral ?? []).map((c) => c.amountPledged),
    );
    expect(pledgeRows(el)).toHaveLength(7);
    for (const row of pledgeRows(el)) {
      const shown = cell(row, 2);
      expect(
        pledged.some((p) => p != null && `$${(p / 1e6).toFixed(2).replace(/\.00$/, "")}M` === shown),
        `a pledged amount of ${shown} that no pledge carries`,
      ).toBe(true);
    }
  });
});

describe("an asset with no active pledge says so", () => {
  const data = live as unknown as C360Data;

  it("badges it Unpledged and explains on opening", () => {
    const el = render(data, {
      snapshot: { accountId: "001REL", name: "Released Co." },
      exposure: {
        facilities: [
          {
            loanId: "L1",
            name: "Released Co. - Term Loan - $1,000,000.00",
            committed: 1_000_000,
            collateral: [
              {
                collateralId: "COL-X",
                collateralName: "COL-000999",
                collateralType: "Real Estate-Office",
                collateralValue: 2_000_000,
                pledgedStatus: "Released",
              },
            ],
          },
        ],
      },
    });
    const row = rows(el)[0];
    expect(row.querySelector("[data-col-badge]")!.textContent).toBe("Unpledged");
    click(row);
    expect(pledgeRows(el)).toHaveLength(0);
    expect(el.textContent).toContain("Not pledged to any facility");
  });
});
