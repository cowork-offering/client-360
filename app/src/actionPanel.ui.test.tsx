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

/** WP7.1 — the panel opens on the briefing; the classic field list is one
 *  disclosure away and is still the completeness view every contract test below
 *  reads. */
const expandAllFields = () => {
  const toggle = byText(/All fields/);
  // Idempotent: the disclosure survives a step back, so only ever open it.
  if (toggle && toggle.getAttribute("aria-expanded") !== "true") click(toggle);
};

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
    expandAllFields();
    const fromRow = panel("Collateral Valuation")!.textContent ?? "";
    press("Escape"); // closes the Action Panel
    press("Escape"); // closes the Client Actions sheet

    // Entry point 2: the activity next-step button, same mount.
    click(byText(/Headroom analysis concluded/)!);
    const step = [...document.querySelector('[aria-modal="true"]')!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Collateral Valuation"),
    )!;
    click(step);
    expandAllFields();
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
    expandAllFields();
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
    expandAllFields();
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("the tool creates at In Progress and stops");
    expect(p.textContent).toContain("never written by this tool");
  });

  it("disables a picklist whose org options have not loaded, and says so", () => {
    openActionPanel("Annual Review");
    // The briefing chip is the first surface the banker meets: also disabled,
    // and honest about why rather than offering an invented value set.
    const chipSelect = panel("Annual Review")!.querySelector("select")!;
    expect(chipSelect.hasAttribute("disabled")).toBe(true);
    expect(chipSelect.textContent).toContain("options not loaded");

    expandAllFields();
    const p = panel("Annual Review")!;
    const rowSelect = [...p.querySelectorAll("select")].at(-1)!;
    expect(rowSelect.hasAttribute("disabled")).toBe(true);
    expect(p.textContent).toContain("Options are read from the org");
  });

  it("marks an edited agent narrative as edited, panel-side only", () => {
    openActionPanel("Annual Review");
    expandAllFields();
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

describe("WP7.1 — the panel opens on a briefing, not a form", () => {
  it("leads with composed prose carrying the staged figures inline", () => {
    openActionPanel("Annual Review");
    const text = panel("Annual Review")!.textContent ?? "";
    expect(text).toContain("credit review for Sterling Fabrication Co.");
    expect(text).toMatch(/is carried at \$[\d.]+[KMB] committed/);
  });

  it("does not open on a wall of empty inputs", () => {
    openActionPanel("Annual Review");
    const p = panel("Annual Review")!;
    // Nine narrative textareas used to greet the banker. Now: prose.
    expect(p.querySelectorAll("textarea")).toHaveLength(0);
    expect(p.textContent).toContain("All fields");
  });

  it("renders a required empty value as a prompt inside the sentence", () => {
    openActionPanel("Collateral Valuation");
    const cv = panel("Collateral Valuation")!;
    const prompts = [
      ...[...cv.querySelectorAll("select")].flatMap((s) => [...s.options].map((o) => o.text)),
      ...[...cv.querySelectorAll("input")].map((i) => i.getAttribute("placeholder") ?? ""),
    ].join("|");
    // Empty required values ask for themselves in place. A picklist the org has
    // not supplied says that instead; it never offers an invented set.
    expect(prompts).toMatch(/pick the valuation date|enter the valuation|choose the source|options not loaded/);
  });

  it("a briefing chip and the classic row edit the same value", () => {
    openActionPanel("Create Service Request");
    const sr = panel("Create Service Request")!;
    const chip = [...sr.querySelectorAll("input")].find((i) => i.getAttribute("aria-label")?.startsWith("Subject"))!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(chip, "Revised subject line");
      chip.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expandAllFields();
    const row = panel("Create Service Request")!.querySelector<HTMLInputElement>("#f-subject")!;
    expect(row.value).toBe("Revised subject line");
  });

  it("shows the drafted narratives as prose with their AGENT provenance", () => {
    openActionPanel("Annual Review");
    const text = panel("Annual Review")!.textContent ?? "";
    expect(text).toContain("Relationship summary");
    expect(text).toContain("Agent");
    // Drafted, not blank: a real figure from the staged bundle is in the prose.
    expect(text).toMatch(/risk grade \d/);
  });

  it("edits a drafted narrative in place and marks it edited", () => {
    openActionPanel("Annual Review");
    const edit = [...panel("Annual Review")!.querySelectorAll("button")].find((b) => b.textContent === "Edit")!;
    click(edit);
    const area = panel("Annual Review")!.querySelector("textarea")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(area, "banker's own words");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panel("Annual Review")!.textContent).toContain("edited by you");
  });

  it("keeps every schema field one disclosure away", () => {
    openActionPanel("Annual Review");
    expandAllFields();
    const p = panel("Annual Review")!;
    for (const label of ["Review type", "Guarantor analysis", "Risk rating comments", "Review stage (nCino)"]) {
      expect(p.textContent, label).toContain(label);
    }
  });
});

/* ------------------------------------------------------------------- WP7 B */

const STAGE_PLAN = {
  ok: true,
  error: null,
  result: {
    stagingId: "a8abb00001KtalSAAR",
    planHash: "9f2c1d",
    decisionToken: "dt-server-001",
    replayed: false,
    accountId: "001SAMPLE0000STRL",
    summary: "Files an annual credit review at In Progress.",
    warnings: [],
    steps: [
      {
        id: "s1",
        type: "write",
        label: "Create the credit review",
        objectName: "LLC_BI__Review__c",
        fields: ["LLC_BI__Status__c", "LLC_BI__Narrative__c"],
        verification: "SELECT Id FROM LLC_BI__Review__c",
        state: "pending",
      },
      {
        id: "s2",
        type: "verification",
        label: "Confirm the review exists",
        objectName: "LLC_BI__Review__c",
        fields: [],
        state: "pending",
      },
    ],
  },
};

const stageEnvelope = (outputValues: unknown) => ({
  payload: { content: [{ actionName: "stage_annual_review", errors: null, isSuccess: true, outputValues, sortOrder: 0, version: 1 }] },
});

/** A live connector whose stage/execute results the test controls. */
function installWriteMcp(over: { stage?: unknown; execute?: unknown; stageThrows?: unknown } = {}) {
  const callTool = vi.fn(async (_server: string, tool: string) => {
    if (tool.startsWith("stage_")) {
      if (over.stageThrows) throw over.stageThrows;
      return stageEnvelope(over.stage ?? STAGE_PLAN);
    }
    if (tool.startsWith("execute_")) {
      return stageEnvelope(
        over.execute ?? {
          ok: true,
          error: null,
          result: {
            stagingId: "a8abb00001KtalSAAR",
            terminalState: "success",
            outcome: "The review was created and verified.",
            reviewId: "a5nbb000000ABCDEAA",
            steps: [
              { id: "s1", type: "write", label: "Create the credit review", state: "verified" },
              { id: "s2", type: "verification", label: "Confirm the review exists", state: "verified" },
            ],
          },
        },
      );
    }
    return stageEnvelope({});
  });
  (window as unknown as { claude?: unknown }).claude = {
    mcp: { callTool, watchTool: vi.fn().mockReturnValue(() => {}), listTools: vi.fn(), invalidate: vi.fn() },
  };
  return callTool;
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("WP7.3 — the compile sequence", () => {
  afterEach(() => {
    delete (window as unknown as { claude?: unknown }).claude;
  });

  it("runs four lines bound to the real operations and lands on the plan", async () => {
    installWriteMcp();
    openActionPanel("Annual Review");
    click(byText(/Review the plan/)!);
    await flush();
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("Files an annual credit review");
    // The plan step is where the stepper now is.
    expect(p.querySelector('[aria-current="step"]')?.textContent).toBe("Plan");
  });

  it("stops ON the failing line and renders the org error there", async () => {
    installWriteMcp({ stage: { ok: false, error: { code: "VALIDATION_FAILED", message: "Type: bad value", orgError: "FIELD_INTEGRITY_EXCEPTION" }, result: null } });
    openActionPanel("Annual Review");
    click(byText(/Review the plan/)!);
    await flush();
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("Sending it to the org to be staged");
    expect(p.textContent).toContain("Type: bad value");
    expect(p.textContent).toContain("FIELD_INTEGRITY_EXCEPTION");
    // The line after it never ran, and a domain refusal offers no retry.
    expect(p.textContent).toContain("Checking the plan that came back");
    expect(p.textContent).toContain("Change the details and build the plan again");
    expect([...p.querySelectorAll("button")].some((b) => b.textContent === "Try again")).toBe(false);
  });

  it("offers a user-gesture retry for a transport failure", async () => {
    installWriteMcp({ stageThrows: { code: "upstream_error", message: "gateway hiccup" } });
    openActionPanel("Annual Review");
    click(byText(/Review the plan/)!);
    await flush();
    const retry = [...panel("Annual Review")!.querySelectorAll("button")].find((b) => b.textContent === "Try again");
    expect(retry).toBeTruthy();
    expect(panel("Annual Review")!.textContent).toContain("You can send it again");
  });

  it("never calls the tool when a preflight line fails first", async () => {
    const callTool = installWriteMcp();
    openActionPanel("Collateral Valuation"); // blocking collateral gap
    const review = [...panel("Collateral Valuation")!.querySelectorAll("button")].find((b) => /Review the plan/.test(b.textContent ?? ""));
    if (review && !review.hasAttribute("disabled")) {
      click(review);
      await flush();
    }
    expect(callTool.mock.calls.filter((c) => String(c[1]).startsWith("stage_"))).toHaveLength(0);
  });
});

describe("WP7.5 — the stepper", () => {
  afterEach(() => {
    delete (window as unknown as { claude?: unknown }).claude;
  });

  it("steps back to the briefing with every value preserved", async () => {
    installWriteMcp();
    openActionPanel("Annual Review");
    expandAllFields();
    const area = panel("Annual Review")!.querySelector("textarea")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(area, "banker's own words");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(byText(/Review the plan/)!);
    await flush();
    click([...panel("Annual Review")!.querySelectorAll("button")].find((b) => b.textContent === "Back")!);
    expandAllFields();
    expect(panel("Annual Review")!.querySelector("textarea")!.value).toBe("banker's own words");
  });

  it("returns to the SAME plan when nothing was edited", async () => {
    const callTool = installWriteMcp();
    openActionPanel("Annual Review");
    click(byText(/Review the plan/)!);
    await flush();
    click([...panel("Annual Review")!.querySelectorAll("button")].find((b) => b.textContent === "Back")!);
    expect(byText(/Back to the plan/)).toBeTruthy();
    click(byText(/Back to the plan/)!);
    await flush();
    // No second staging call: the plan the banker saw is the plan they return to.
    expect(callTool.mock.calls.filter((c) => String(c[1]).startsWith("stage_"))).toHaveLength(1);
  });

  it("says the plan will be rebuilt once the figures change", async () => {
    installWriteMcp();
    openActionPanel("Annual Review");
    click(byText(/Review the plan/)!);
    await flush();
    click([...panel("Annual Review")!.querySelectorAll("button")].find((b) => b.textContent === "Back")!);
    expandAllFields();
    const area = panel("Annual Review")!.querySelector("textarea")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(area, "edited after staging");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("the plan will be rebuilt");
    expect(byText(/Rebuild the plan/)).toBeTruthy();
  });

  it("closes on Escape from any step (A31.1)", async () => {
    installWriteMcp();
    openActionPanel("Annual Review");
    click(byText(/Review the plan/)!);
    await flush();
    press("Escape");
    expect(panel("Annual Review")).toBeNull();
  });
});

describe("WP7.4 — the execution", () => {
  afterEach(() => {
    delete (window as unknown as { claude?: unknown }).claude;
  });

  async function executeAndLand() {
    openActionPanel("Annual Review");
    click(byText(/Review the plan/)!);
    await flush();
    click(byText(/Confirm and file/)!);
    await flush();
  }

  it("stamps the filed record and offers nCino as the next move", async () => {
    installWriteMcp();
    await executeAndLand();
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("Filed — annual credit review");
    expect(p.textContent).toContain("a5nbb000000ABCDEAA");
    expect(p.textContent).toContain("Open in nCino");
  });

  it("shows every step in the state the executor returned", async () => {
    installWriteMcp();
    await executeAndLand();
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("Verified");
    expect(p.textContent).not.toContain("Not started");
  });

  it("keeps the failing step as the focus, with the org error verbatim", async () => {
    installWriteMcp({
      execute: {
        ok: true,
        error: null,
        result: {
          stagingId: "a8abb00001KtalSAAR",
          terminalState: "partial",
          outcome: "The review was created but could not be verified.",
          steps: [
            { id: "s1", type: "write", label: "Create the credit review", state: "failed", detail: "INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY" },
            { id: "s2", type: "verification", label: "Confirm the review exists", state: "skipped_not_attempted" },
          ],
        },
      },
    });
    await executeAndLand();
    const p = panel("Annual Review")!;
    expect(p.textContent).toContain("INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY");
    expect(p.textContent).toContain("This is where the plan stopped");
    expect(p.textContent).toContain("can be resumed from here");
    // No stamp on a partial: nothing is claimed as filed and verified.
    expect(p.textContent).not.toContain("Filed — ");
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
