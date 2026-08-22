// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BorrowerBundle, C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { CovenantsTab } from "./components/tabs/CovenantsTab";
import { groupCovenants } from "./data/collateralRecords";
import live from "../../artifact/live-data.json";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   THE COVENANT SURFACE, FOR EVERY BORROWER IN BOTH FILES.

   Hartwell is the org's FIRST relationship with loan-attached covenants, and
   that path had never rendered: a six-column grid was fed three children under
   no header at all, so two of its six covenants sat under nothing (validation
   audit 2026-07-27, finding 2). The repair is structural — one row component,
   one header — and the test is structural with it, so a future edit cannot
   quietly give the facility section fewer columns again.

   Display correctness is a contract for ALL relationships, so the same
   assertions run for zero-covenant, relationship-only and mixed borrowers.
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
        <CovenantsTab bundle={bundle} />
      </AppProvider>,
    );
  });
  return container;
}

const headers = (el: HTMLElement) => [...el.querySelectorAll("[data-cov-header]")];
const rows = (el: HTMLElement) => [...el.querySelectorAll("[data-cov-row]")];
const statuses = (el: HTMLElement) => [...el.querySelectorAll("[data-cov-status]")];
const callout = (el: HTMLElement, kind: string) => el.querySelector(`[data-cov-callout="${kind}"]`);

describe("every covenant renders under a header, in every relationship", () => {
  it("has borrowers to check", () => {
    expect(everyBorrower.length).toBeGreaterThanOrEqual(5);
  });

  for (const [file, name, data, bundle] of everyBorrower) {
    const covs = bundle.covenants?.covenants ?? [];
    const groups = groupCovenants(covs);
    const sections = covs.length ? 1 + groups.byFacility.length : 0;

    it(`${name} (${file}): one header per section, and every covenant in a row`, () => {
      const el = render(data, bundle);
      expect(headers(el)).toHaveLength(sections);
      // Grouping renders a covenant once per facility it binds, so the row
      // count follows the grouping rather than the raw list.
      const expected = covs.length
        ? groups.account.length + groups.byFacility.reduce((n, f) => n + f.covenants.length, 0)
        : 0;
      expect(rows(el)).toHaveLength(expected);
    });

    it(`${name} (${file}): every row carries all seven columns`, () => {
      const el = render(data, bundle);
      for (const row of rows(el)) {
        // Seven columns, plus the optional effective-challenge strip that spans
        // the full width. Fewer than seven is the defect this test exists for.
        expect(row.children.length, `${name}: a row with ${row.children.length} columns`).toBeGreaterThanOrEqual(7);
      }
    });

    it(`${name} (${file}): every covenant states nCino's own verdict`, () => {
      const el = render(data, bundle);
      // One status chip per row, never a silent row: a covenant whose status the
      // cockpit cannot read still has to say so on screen.
      expect(statuses(el)).toHaveLength(rows(el).length);
      for (const chip of statuses(el)) {
        expect((chip.textContent ?? "").trim().length, `${name}: an empty status chip`).toBeGreaterThan(0);
        expect(chip.getAttribute("title"), `${name}: a status chip with no explanation`).toBeTruthy();
      }
    });

    it(`${name} (${file}): renders no covenant value as a bare number`, () => {
      const el = render(data, bundle);
      for (const row of rows(el)) {
        const actual = row.children[1].textContent ?? "";
        // Either the org has no figure ("—") or the figure carries its unit.
        expect(actual === "—" || /[×%$]/.test(actual), `${name}: unitless "${actual}"`).toBe(true);
      }
    });
  }
});

describe("a relationship with no covenants says so, rather than rendering nothing", () => {
  it("shows the empty state and no headers at all", () => {
    const [, , data] = everyBorrower[0];
    const el = render(data, { snapshot: { accountId: "001EMPTY", name: "No Covenants Co." }, covenants: { covenants: [] } });
    expect(headers(el)).toHaveLength(0);
    expect(rows(el)).toHaveLength(0);
    expect(el.textContent).toContain("No active covenants");
  });

  it("survives a bundle whose covenant read is absent entirely", () => {
    const [, , data] = everyBorrower[0];
    const el = render(data, { snapshot: { accountId: "001NONE", name: "Unread Co." } });
    expect(rows(el)).toHaveLength(0);
    expect(el.textContent).toContain("No active covenants");
  });
});

describe("Hartwell — the mixed case that exposed the defect", () => {
  const data = live as unknown as C360Data;
  const hartwell = data.borrowers!["001bb00001I7FPNAA3"] as BorrowerBundle;

  it("renders three headed sections: the relationship, then each facility", () => {
    const el = render(data, hartwell);
    // Four relationship-level covenants, plus one facility group each for the
    // Line of Credit and the Construction facility.
    expect(headers(el)).toHaveLength(3);
    expect(rows(el)).toHaveLength(6);
    expect(el.textContent).toContain("Facility covenants · ");
    expect(el.textContent).toContain("Line of Credit");
    expect(el.textContent).toContain("Construction");
  });

  it("gives the facility rows the same columns as the relationship rows", () => {
    const el = render(data, hartwell);
    const columnCounts = new Set(rows(el).map((r) => r.children.length));
    // The facility section used to render three children into a six-column
    // grid. One count means the two sections are the same table.
    expect(columnCounts.size).toBe(1);
  });

  it("renders the Accounts Receivable advance test as a PERCENT, not a multiple", () => {
    const el = render(data, hartwell);
    const ar = rows(el).find((r) => (r.children[0].textContent ?? "").includes("Accounts Receivable"))!;
    expect(ar.children[1].textContent).toBe("80%");
    expect(ar.children[2].textContent).toContain("80%");
    expect(el.textContent).not.toContain("80.00×");
  });

  it("renders Minimum Liquidity as money, and the coverage tests as multiples", () => {
    const el = render(data, hartwell);
    const cell = (type: string) =>
      rows(el).find((r) => (r.children[0].textContent ?? "").includes(type))!.children[1].textContent;
    expect(cell("Minimum Liquidity")).toBe("$6.80M");
    expect(cell("Debt Service Coverage of Borrower")).toBe("1.38×");
    expect(cell("Maximum Debt to Worth")).toBe("2.42×");
  });

  it("renders the milestone covenant with no figure as absent, not as zero", () => {
    const el = render(data, hartwell);
    const term = rows(el).find((r) => (r.children[0].textContent ?? "").includes("Term Covenants"))!;
    expect(term.children[1].textContent).toBe("—");
    expect(term.children[2].textContent).toBe("—");
  });
});

/* =============================================================================
   EXCEPTION IS NOT A BREACH.

   In nCino the exception batch forces `Exception` onto a compliance row the
   moment its Due Date passes, measured or not: 101 of 140 rows in this org sit
   there with no value at all. Rendering that as "breached" overstates credit
   deterioration on most of the book, so the surface has to keep the two apart
   for EVERY relationship, not just the ones the demo happens to open on.
   ============================================================================= */
describe("an administrative Exception renders as an Exception, not a breach", () => {
  const [, , data] = everyBorrower[0];
  const withCovenants = (covenants: BorrowerBundle["covenants"]): BorrowerBundle => ({
    snapshot: { accountId: "001EXC", name: "Exception Co." },
    covenants,
  });

  it("chips it as Exception and explains what that means", () => {
    const el = render(
      data,
      withCovenants({ covenants: [{ covenantId: "c1", covenantType: "Term Covenants", lastEvaluationStatus: "Exception" }] }),
    );
    const chip = statuses(el)[0];
    expect(chip.textContent).toBe("Exception");
    expect(chip.getAttribute("data-cov-status-kind")).toBe("exception");
    expect(chip.getAttribute("title")).toContain("not a measured breach");
  });

  it("raises the exception callout and NOT the breach callout", () => {
    const el = render(
      data,
      withCovenants({ covenants: [{ covenantId: "c1", covenantType: "Term Covenants", lastEvaluationStatus: "Exception" }] }),
    );
    expect(callout(el, "exception")).toBeTruthy();
    expect(callout(el, "breach")).toBeNull();
    expect(el.textContent).toContain("no measured breach");
    expect(el.textContent).not.toContain("at or past threshold");
  });

  it("DOES call it a breach once a measured value misses the threshold", () => {
    const el = render(
      data,
      withCovenants({
        covenants: [
          {
            covenantId: "c1",
            covenantType: "Debt Service Coverage Ratio",
            actualValue: 1.1,
            thresholdValue: 1.25,
            lastEvaluationStatus: "Exception",
          },
        ],
      }),
    );
    expect(statuses(el)[0].textContent).toBe("Exception, threshold not met");
    expect(callout(el, "breach")).toBeTruthy();
    expect(callout(el, "exception")).toBeNull();
  });

  it("keeps a Waived covenant neutral, and off both callouts", () => {
    const el = render(
      data,
      withCovenants({
        covenants: [
          {
            covenantId: "c1",
            covenantType: "Debt Service Coverage Ratio",
            actualValue: 1.1,
            thresholdValue: 1.25,
            lastEvaluationStatus: "Waived",
          },
        ],
      }),
    );
    expect(statuses(el)[0].textContent).toBe("Waived");
    expect(callout(el, "breach")).toBeNull();
    expect(callout(el, "exception")).toBeNull();
  });

  it("renders an unmapped status verbatim rather than guessing at it", () => {
    const el = render(
      data,
      withCovenants({ covenants: [{ covenantId: "c1", covenantType: "Reporting", covenantStatus: ">10% headroom" }] }),
    );
    expect(statuses(el)[0].textContent).toBe(">10% headroom");
    expect(callout(el, "breach")).toBeNull();
  });
});
