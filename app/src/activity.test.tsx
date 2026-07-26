// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BorrowerBundle, C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { deriveWorklist } from "./data/worklist";
import { suggestActions } from "./actions/suggest";
import { collectNextSteps, resolveNextSteps } from "./actions/nextSteps";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sample from "../../artifact/sample-data.json";

const SRC = __dirname;
const readTokens = () => readFileSync(join(SRC, "styles", "tokens.css"), "utf8");
const readAllTsx = (dir: string): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...readAllTsx(full));
    else if (e.name.endsWith(".tsx")) out.push([e.name, readFileSync(full, "utf8")]);
  }
  return out;
};

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATA = sample as unknown as C360Data;
const STERLING = "001SAMPLE0000STRL";
const ANCHOR = "001bb00001DLtRMAA1";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  delete (window as unknown as { sendPrompt?: unknown }).sendPrompt;
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
const clickAsync = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const press = (key: string) => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const openRow = (name: string) =>
  [...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes(name))!;
const modal = () => document.querySelector('[aria-modal="true"]');

describe("A30.4 — CLIENT_REQUEST reason code", () => {
  const wl = deriveWorklist(DATA);

  it("fires for the account carrying a client request", () => {
    expect(wl.reasons[STERLING]).toContain("CLIENT_REQUEST");
  });

  it("does not fire for accounts without one", () => {
    expect(wl.reasons[ANCHOR] ?? []).not.toContain("CLIENT_REQUEST");
  });

  it("outranks every risk signal — Sterling leads the queue", () => {
    expect(wl.accountIds[0]).toBe(STERLING);
    expect(wl.reasons[STERLING][0]).toBe("CLIENT_REQUEST");
  });

  it("is presence-based: still fires when the clock is unusable", () => {
    const noClock = { ...DATA, meta: { ...DATA.meta, generatedAt: "not-a-date" }, worklist: undefined } as C360Data;
    expect(deriveWorklist(noClock).reasons[STERLING]).toEqual(["CLIENT_REQUEST"]);
  });

  it("merges onto a server entry that omits it, without dropping server reasons", () => {
    // The nCino-derived server worklist cannot see the M365 request channel.
    const wlServer = deriveWorklist(DATA);
    expect(wlServer.reasons[STERLING]).toContain("MATURITY_NEAR"); // server reason kept
    expect(wlServer.reasons[STERLING]).toContain("CLIENT_REQUEST"); // presence merged
    expect(wlServer.reasons[STERLING][0]).toBe("CLIENT_REQUEST"); // and ranked first
  });

  it("does not invent CLIENT_REQUEST for accounts without a request", () => {
    const wl = deriveWorklist(DATA);
    for (const id of Object.keys(wl.reasons)) {
      if (id === STERLING) continue;
      expect(wl.reasons[id]).not.toContain("CLIENT_REQUEST");
    }
  });

  it("renders the Request chip on the worklist", () => {
    mount();
    const row = openRow("Sterling Fabrication");
    expect(row.textContent).toContain("Request");
  });
});

describe("A30.1/A30.2 — Activity tab", () => {
  it("is the first tab and opens by default", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    const tabs = buttons().filter((b) => /^(Activity|Exposure & Collateral)$/.test(b.textContent ?? ""));
    expect(tabs[0].textContent).toBe("Activity");
    expect(container!.textContent).toContain("Activity · audit trail");
  });

  it("renders entries newest-first with relative timestamps", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    const text = container!.textContent ?? "";
    expect(text).toContain("Headroom analysis concluded");
    expect(text).toContain("Revolver increase request received");
    // Analysis (newer) precedes the request (older).
    expect(text.indexOf("Headroom analysis concluded")).toBeLessThan(text.indexOf("Revolver increase request received"));
    expect(text).toMatch(/\d+d ago|today|yesterday|mo ago/);
  });

  it("marks the client request visually distinct with a Client request chip", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    expect(container!.textContent).toContain("Client request");
  });

  it("renders the source reference as plain text, never a link (A29)", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    // No anchor tags anywhere in the timeline: webLink is absent in the data.
    expect(container!.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("shows an honest empty state for an account with no activity", () => {
    mount();
    click(openRow("Brightwater Foods"));
    expect(container!.textContent).toContain("No recorded activity in this view");
  });
});

describe("A30.3 — detail popup", () => {
  function openSterlingRequest() {
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Revolver increase request received/)!);
  }

  it("opens with the ask, reference and linked verdict", () => {
    openSterlingRequest();
    const m = modal()!;
    expect(m).toBeTruthy();
    expect(m.textContent).toContain("The ask");
    // A31.2: this entry's steps live on the linked analysis, so no empty section.
    expect(m.textContent).not.toContain("Suggested next steps");
  });

  it("always ends in Suggested next steps resolved through the registry", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Headroom analysis concluded/)!);
    const m = modal()!;
    expect(m.textContent).toContain("Suggested next steps");
    expect(m.textContent).toContain("Collateral Valuation");
    expect(m.textContent).toContain("Loan Modification");
  });

  it("opens the ticket for a next-step action that has one (A33.1.1)", async () => {
    // Loan Modification became panel-backed in wave 2, so the next step now
    // opens its ticket instead of narrating a prompt. The entry point is the
    // same modal the Client Actions row and the chat chip open.
    const sendPrompt = vi.fn();
    (window as unknown as { sendPrompt: unknown }).sendPrompt = sendPrompt;
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Headroom analysis concluded/)!);
    const step = [...modal()!.querySelectorAll("button")].find((b) => b.textContent?.includes("Loan Modification"))!;
    await clickAsync(step);
    expect(
      [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getAttribute("aria-label") === "Loan Modification"),
    ).toBe(true);
    // A ticket is opened locally: nothing is narrated to the desk until the
    // banker confirms a plan.
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    openSterlingRequest();
    expect(modal()).toBeTruthy();
    press("Escape");
    expect(modal()).toBeNull();
  });

  it("traps Tab inside the popup", () => {
    openSterlingRequest();
    const m = modal()!;
    expect(document.activeElement).toBe(m);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(m.contains(document.activeElement)).toBe(true);
  });
});

describe("A31.1 — overlays escape the app tree and outrank the nav", () => {
  it("portals the activity modal to <body>, not inside the scrolling workspace", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Revolver increase request received/)!);
    const m = modal()!;
    // Portalled: the modal is NOT a descendant of the app container, so no
    // ancestor stacking context or overflow can clip it.
    expect(container!.contains(m)).toBe(false);
    expect(m.closest("body")).toBeTruthy();
  });

  it("stacks the modal above the nav via the shared z-scale", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Revolver increase request received/)!);
    const overlay = modal()!.parentElement as HTMLElement;
    expect(overlay.getAttribute("style") ?? "").toContain("--z-modal");
    // The token scale itself guarantees the ordering.
    const css = readTokens();
    const z = (name: string) => Number(css.match(new RegExp(`--z-${name}:\\s*(\\d+)`))![1]);
    expect(z("modal")).toBeGreaterThan(z("nav"));
    expect(z("modal")).toBeGreaterThan(z("panel"));
    expect(z("modal")).toBeGreaterThan(z("fab"));
    expect(z("nav")).toBeGreaterThan(z("verdict"));
  });

  it("uses no bare z-index classes anywhere in components", () => {
    // Guarantee the scale is the only source of stacking order.
    const files = readAllTsx(join(SRC, "components"));
    for (const [name, src] of files) {
      expect(src, `${name} must use the z-scale, not a bare z-class`).not.toMatch(/className="[^"]*\bz-\[?\d/);
    }
  });
});

describe("A31.2 — no empty sections in the detail modal", () => {
  it("omits Suggested next steps when the entry has none of its own", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    // The REQUEST entry's next steps live on the linked ANALYSIS entry.
    click(byText(/Revolver increase request received/)!);
    expect(modal()!.textContent).not.toContain("Suggested next steps");
  });

  it("still renders the section on the entry that owns the steps", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Headroom analysis concluded/)!);
    expect(modal()!.textContent).toContain("Suggested next steps");
  });

  it("renders no section header with empty content", () => {
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Revolver increase request received/)!);
    const sections = [...modal()!.querySelectorAll("section")];
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      const kicker = s.querySelector(".kicker")!.textContent ?? "";
      const rest = (s.textContent ?? "").replace(kicker, "").trim();
      expect(rest.length, `section "${kicker}" is empty`).toBeGreaterThan(0);
    }
  });
});

describe("A31.3 — ACTION_TRIGGERED session activity", () => {
  function fireActionFromPanel() {
    const sendPrompt = vi.fn();
    (window as unknown as { sendPrompt: unknown }).sendPrompt = sendPrompt;
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Client Actions/)!);
    // Use a NON-panel action: panel-backed actions open the Action Panel
    // instead of firing, and nothing is triggered until the confirm gesture.
    // Wave 2 gave five more actions tickets, so this is now Draft Credit Memo.
    const btn = [...document.querySelector('[role="dialog"]')!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Draft Credit Memo"),
    )!;
    return { sendPrompt, btn };
  }

  it("appends an entry to the account timeline when an action is triggered", async () => {
    const { btn } = fireActionFromPanel();
    await clickAsync(btn);
    press("Escape");
    const text = container!.textContent ?? "";
    expect(text).toContain("Draft Credit Memo");
    expect(text).toContain("Sent to the desk");
    expect(text).toContain("You · just now");
  });

  it("styles user entries distinctly from client and system entries", async () => {
    const { btn } = fireActionFromPanel();
    await clickAsync(btn);
    press("Escape");
    expect(container!.querySelector(".c360-activity-user")).toBeTruthy();
  });

  it("survives a view switch (lives in app state)", async () => {
    const { btn } = fireActionFromPanel();
    await clickAsync(btn);
    press("Escape");
    // Navigate away and back.
    click(byText(/Worklist/)!);
    click(openRow("Sterling Fabrication"));
    expect(container!.textContent).toContain("You · just now");
  });

  it("does NOT fire CLIENT_REQUEST — a user action is not a client request", () => {
    const bundle: BorrowerBundle = {
      snapshot: { accountId: "001X", name: "X" },
      activity: [
        { id: "a1", ts: "2026-07-01T00:00:00Z", kind: "ACTION_TRIGGERED", title: "Draft Credit Memo", actor: "You" },
      ],
    };
    const data = {
      meta: { anchorAccountId: "001X", generatedAt: "2026-07-02T09:15:00Z" },
      portfolio: { accounts: [{ accountId: "001X", name: "X", tce: 1 }] },
      borrower: bundle,
      borrowers: { "001X": bundle },
    } as unknown as C360Data;
    expect(deriveWorklist(data).reasons["001X"] ?? []).not.toContain("CLIENT_REQUEST");
  });
});

describe("A30.4 — next steps are shared state", () => {
  const bundle = (DATA.borrowers ?? {})[STERLING] as BorrowerBundle;

  it("collects next steps newest-entry-first", () => {
    const steps = collectNextSteps(bundle);
    expect(steps.map((s) => s.actionId)).toEqual(["collateral-valuation", "loan-modification"]);
  });

  it("drops unknown action ids instead of rendering dead buttons", () => {
    const resolved = resolveNextSteps(
      [{ actionId: "not-a-real-action" }, { actionId: "loan-modification" }],
      DATA,
      STERLING,
      "Sterling Fabrication Co.",
    );
    expect(resolved.map((r) => r.action.id)).toEqual(["loan-modification"]);
  });

  it("returns availability so unavailable steps can render disabled with a reason", () => {
    const resolved = resolveNextSteps([{ actionId: "loan-modification" }], DATA, STERLING, "Sterling Fabrication Co.");
    expect(resolved[0].availability).toHaveProperty("available");
  });

  it("the SAME next steps feed the chat suggestions, ranked first", () => {
    const wl = deriveWorklist(DATA);
    const chips = suggestActions(DATA, wl, STERLING, "Sterling Fabrication Co.");
    // Sterling's analysis recommends collateral valuation then modification —
    // those outrank anything derived from raw signals.
    expect(chips[0].id).toBe("collateral-valuation");
    expect(chips.map((c) => c.id)).toContain("loan-modification");
  });

  it("chat suggests the modification from the analysis nextSteps", () => {
    const wl = deriveWorklist(DATA);
    const chips = suggestActions(DATA, wl, STERLING, "Sterling Fabrication Co.");
    const mod = chips.find((c) => c.id === "loan-modification")!;
    expect(mod).toBeTruthy();
    expect(mod.prompt).toContain("Sterling Fabrication Co.");
  });

  it("still caps at three and stays availability-gated", () => {
    const wl = deriveWorklist(DATA);
    const chips = suggestActions(DATA, wl, STERLING, "Sterling Fabrication Co.");
    expect(chips.length).toBeLessThanOrEqual(3);
    const bad = suggestActions(DATA, wl, "001UNSTAGED", "Ghost Co.");
    expect(bad).toEqual([]);
  });
});
