// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BorrowerBundle, C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { CovenantsTab } from "./components/tabs/CovenantsTab";
import live from "../../artifact/live-data.json";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   THE COVENANT SURFACE, FOR EVERY BORROWER IN BOTH FILES.

   REBUILT 2026-09-03 on the founder's read of #pane-covenants: "just list out
   the account covenants, and then click on the covenant and you see to which
   loans the covenant is associated ... a clear row for each loan with
   information, keep it elegant, all in one row, all aligned."

   So the structural contract changed with it. The pane is ONE list, a covenant
   appears EXACTLY ONCE however many loans it binds, and the loans are the
   covenant's own detail behind a click. The old shape repeated a covenant under
   every facility group, which is what these tests used to lock in.

   What survives unchanged: every covenant states Salesforce's own verdict, no figure
   is rendered without its unit, and an administrative Exception is never a
   breach. Display correctness is a contract for ALL relationships, so the
   per-borrower assertions run over both data files.
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

const COLUMNS = 7;
const headers = (el: HTMLElement) => [...el.querySelectorAll('[data-x-head="covenant"]')];
const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-x-row="covenant"]')];
const statuses = (el: HTMLElement) => [...el.querySelectorAll("[data-cov-status]")];
const loanRows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-x-sub="covenant"]')];
const callout = (el: HTMLElement, kind: string) => el.querySelector(`[data-cov-callout="${kind}"]`);
const cell = (row: HTMLElement, i: number) => (row.children[i].textContent ?? "").trim();
const rowFor = (el: HTMLElement, type: string) => rows(el).find((r) => cell(r, 0).includes(type))!;
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("one list, one row per covenant, in every relationship", () => {
  it("has borrowers to check", () => {
    expect(everyBorrower.length).toBeGreaterThanOrEqual(5);
  });

  for (const [file, name, data, bundle] of everyBorrower) {
    const covs = bundle.covenants?.covenants ?? [];

    it(`${name} (${file}): one header, and every covenant exactly once`, () => {
      const el = render(data, bundle);
      expect(headers(el)).toHaveLength(covs.length ? 1 : 0);
      expect(rows(el)).toHaveLength(covs.length);
    });

    it(`${name} (${file}): every row carries all seven columns`, () => {
      const el = render(data, bundle);
      expect(headers(el)[0]?.children.length ?? COLUMNS).toBe(COLUMNS);
      for (const row of rows(el)) {
        expect(row.children.length, `${name}: a row with ${row.children.length} columns`).toBe(COLUMNS);
      }
    });

    it(`${name} (${file}): every covenant states Salesforce's own verdict`, () => {
      const el = render(data, bundle);
      // One status chip per row, never a silent row: a covenant whose status the
      // cockpit cannot read still has to say so on screen.
      expect(statuses(el)).toHaveLength(rows(el).length);
      for (const chip of statuses(el)) {
        expect((chip.textContent ?? "").trim().length, `${name}: an empty status chip`).toBeGreaterThan(0);
        expect(chip.getAttribute("title"), `${name}: a status chip with no explanation`).toBeTruthy();
      }
    });

    it(`${name} (${file}): renders no covenant test as a bare number`, () => {
      const el = render(data, bundle);
      for (const row of rows(el)) {
        const test = cell(row, 2);
        // Either the org has no threshold ("—") or the test carries its
        // operator and its unit.
        expect(test === "—" || /^[≥≤].*[×%$]/.test(test), `${name}: unitless "${test}"`).toBe(true);
      }
    });

    it(`${name} (${file}): every row is focusable and toggles on Enter`, () => {
      const el = render(data, bundle);
      for (const row of rows(el)) {
        // The row is a button: focus and Enter come from the platform, so the
        // contract to hold is that it IS one and that it says whether it is open.
        expect(row.tagName).toBe("BUTTON");
        expect(row.getAttribute("aria-expanded")).toBe("false");
      }
    });
  }
});

describe("a relationship with no covenants says so, rather than rendering nothing", () => {
  it("shows the empty state and no rows at all", () => {
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

/* =============================================================================
   HARTWELL — the relationship the founder was reading.

   Six covenants, four on the account alone and two carrying a loan junction.
   Every figure below is the bundle's own; nothing here is a round number
   someone typed.
   ============================================================================= */
describe("Hartwell: the account's six covenants, and the loans behind two of them", () => {
  const data = live as unknown as C360Data;
  const hartwell = data.borrowers!["001bb00001I7FPNAA3"] as BorrowerBundle;

  it("lists six covenants once each, under one header", () => {
    const el = render(data, hartwell);
    expect(headers(el)).toHaveLength(1);
    expect(rows(el)).toHaveLength(6);
    expect(el.textContent).toContain("Account covenants");
  });

  it("states each covenant's test with its operator and its unit", () => {
    const el = render(data, hartwell);
    expect(cell(rowFor(el, "Debt Service Coverage of Borrower"), 2)).toBe("≥ 1.25×");
    expect(cell(rowFor(el, "Maximum Debt to Worth"), 2)).toBe("≤ 3.00×");
    expect(cell(rowFor(el, "Minimum Liquidity"), 2)).toBe("≥ $5M");
    expect(cell(rowFor(el, "Accounts Receivable"), 2)).toBe("≤ 80%");
    // A milestone with no threshold states nothing rather than a zero.
    expect(cell(rowFor(el, "Term Covenants"), 2)).toBe("—");
  });

  it("carries the frequency, the status and the next due date off the bundle", () => {
    const el = render(data, hartwell);
    const ar = rowFor(el, "Accounts Receivable");
    expect(cell(ar, 3)).toBe("Monthly");
    expect(cell(ar, 5)).toBe("Jul 31, 2026");
    const dsc = rowFor(el, "Debt Service Coverage of Borrower");
    expect(cell(dsc, 3)).toBe("Quarterly");
    expect(cell(dsc, 5)).toBe("Sep 30, 2026");
    // The verdict on the last completed test, and the OPEN period beside it.
    // The bundle records Compliant as of Jun 30 with a Pending compliance row.
    expect(cell(dsc, 4)).toBe("Compliant· Pending");
    expect(dsc.querySelector("[data-cov-period]")?.textContent).toBe("· Pending");
  });

  it("badges each covenant with how many loans it is associated to", () => {
    const el = render(data, hartwell);
    const badge = (type: string) => rowFor(el, type).querySelector("[data-cov-badge]")!;
    expect(badge("Accounts Receivable").textContent).toBe("1 loan");
    expect(badge("Term Covenants").textContent).toBe("1 loan");
    expect(badge("Minimum Liquidity").textContent).toBe("Account only");
    expect(badge("Minimum Liquidity").getAttribute("data-cov-attachment")).toBe("account");
  });

  it("opens the AR covenant onto the $15M line, with that facility's figures", () => {
    const el = render(data, hartwell);
    const ar = rowFor(el, "Accounts Receivable");
    expect(loanRows(el)).toHaveLength(0);
    click(ar);
    expect(ar.getAttribute("aria-expanded")).toBe("true");

    const opened = loanRows(el);
    expect(opened).toHaveLength(1);
    expect(cell(opened[0], 0)).toBe("Line of Credit");
    expect(cell(opened[0], 1)).toBe("$15M");
    expect(cell(opened[0], 2)).toBe("$9.20M");
    expect(cell(opened[0], 3)).toBe("Mar 15, 2027");
    // Compliance is held on the covenant, so the latest test is the covenant's.
    expect(cell(opened[0], 4)).toBe("80% vs ≤ 80%");
  });

  it("opens the milestone covenant onto the Construction facility", () => {
    const el = render(data, hartwell);
    click(rowFor(el, "Term Covenants"));
    const opened = loanRows(el);
    expect(opened).toHaveLength(1);
    expect(cell(opened[0], 0)).toBe("Construction");
    expect(cell(opened[0], 1)).toBe("$12M");
    expect(cell(opened[0], 2)).toBe("$7.35M");
    // Aligned onto the C&I term-loan maturity 2026-09-03; it read Nov 1, 2026.
    expect(cell(opened[0], 3)).toBe("Mar 15, 2031");
    // No measured value: the test says so rather than inventing one.
    expect(cell(opened[0], 4)).toBe("—");
  });

  it("says so when a covenant sits on the account only, and still shows its test", () => {
    // The org grew a second package (2026-09-03) and attached Debt Service
    // Coverage of Borrower to the new CRE loan, so it is no longer the
    // account-only example; Maximum Debt to Worth still carries no
    // attachedLoans. The same refresh re-dated every covenant's last test
    // except Accounts Receivable's, from Jun 30 to Jul 15, 2026.
    const el = render(data, hartwell);
    click(rowFor(el, "Maximum Debt to Worth"));
    expect(loanRows(el)).toHaveLength(0);
    const text = el.textContent ?? "";
    expect(text).toContain("Not associated to any facility");
    expect(text).toContain("2.42× vs ≤ 3.00×");
    expect(text).toContain("as Salesforce evaluated on Jul 15, 2026");
  });

  it("toggles: a second click closes what the first opened", () => {
    const el = render(data, hartwell);
    const ar = rowFor(el, "Accounts Receivable");
    click(ar);
    expect(loanRows(el)).toHaveLength(1);
    click(ar);
    expect(loanRows(el)).toHaveLength(0);
    expect(ar.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens two covenants at once, and lines both blocks up on one grid", () => {
    const el = render(data, hartwell);
    click(rowFor(el, "Accounts Receivable"));
    click(rowFor(el, "Term Covenants"));
    expect(el.querySelectorAll('[data-x-expansion="covenant"]')).toHaveLength(2);
    const widths = new Set(loanRows(el).map((r) => r.children.length));
    expect(widths).toEqual(new Set([5]));
  });

  it("invents no figure: every money cell it renders is in the bundle", () => {
    const el = render(data, hartwell);
    click(rowFor(el, "Accounts Receivable"));
    click(rowFor(el, "Term Covenants"));
    const facilities = hartwell.exposure?.facilities ?? [];
    for (const row of loanRows(el)) {
      const committed = cell(row, 1);
      expect(
        facilities.some((f) => `$${(f.committed! / 1e6).toFixed(2).replace(/\.00$/, "")}M` === committed),
        `a commitment of ${committed} that no facility carries`,
      ).toBe(true);
    }
  });
});

/* =============================================================================
   AN UNREAD JUNCTION IS NOT AN EMPTY ONE.

   `attachedLoans` absent means the read does not carry the junction; empty means
   the read carries it and says account only. Merging the two would have the
   cockpit assert "no facilities" about data it never received.
   ============================================================================= */
describe("a read that does not carry the loan junction says exactly that", () => {
  const [, , data] = everyBorrower[0];

  it("badges it as unknown, and explains on opening", () => {
    const el = render(data, {
      snapshot: { accountId: "001UNREAD", name: "Unread Junction Co." },
      covenants: { covenants: [{ covenantId: "c1", covenantType: "Minimum Liquidity", thresholdValue: 1_000_000 }] },
    });
    const badge = el.querySelector("[data-cov-badge]")!;
    expect(badge.textContent).toBe("—");
    expect(badge.getAttribute("data-cov-attachment")).toBe("unread");
    click(rows(el)[0]);
    expect(el.textContent).toContain("does not carry the loan junction");
  });

  it("names a junction whose facility the exposure read does not carry", () => {
    const el = render(data, {
      snapshot: { accountId: "001ORPHAN", name: "Orphan Co." },
      exposure: { facilities: [] },
      covenants: {
        covenants: [
          {
            covenantId: "c1",
            covenantType: "Minimum Liquidity",
            thresholdValue: 1_000_000,
            attachedLoans: [{ loanId: "L-404", loanName: "Orphan Co. - Term Loan - $2,000,000.00" }],
          },
        ],
      },
    });
    click(rows(el)[0]);
    const opened = loanRows(el);
    expect(opened).toHaveLength(1);
    expect(cell(opened[0], 0)).toBe("Term Loan - $2,000,000.00");
    expect(cell(opened[0], 1)).toBe("—");
    expect(cell(opened[0], 2)).toBe("—");
  });
});

/* =============================================================================
   EXCEPTION IS NOT A BREACH.

   In Salesforce the exception batch forces `Exception` onto a compliance row the
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
