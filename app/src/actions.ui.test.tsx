// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import sample from "../../artifact/sample-data.json";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
      <AppProvider data={sample as unknown as C360Data}>
        <AppShell />
      </AppProvider>,
    );
  });
  return container;
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byLabel = (re: RegExp) => buttons().find((b) => re.test(b.getAttribute("aria-label") ?? ""));
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
/** For handlers that await the channel before setting state. */
const clickAsync = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const openAnchor = () =>
  [...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes("Piedmont Precision"))!;
const press = (key: string) => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

describe("chat FAB (A27.1)", () => {
  it("renders the FAB and no persistent drawer", () => {
    const el = mount();
    expect(byLabel(/Open chat/)).toBeTruthy();
    // The retired drawer rendered its disabled-chat copy inline on every view.
    expect(el.textContent).not.toContain("Chat unavailable in this view");
  });

  it("opens the chat panel on click and closes it again", () => {
    mount();
    click(byLabel(/Open chat/)!);
    expect(document.body.textContent).toContain("Ask the desk");
    click(byLabel(/Close chat/)!);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("closes the panel on Escape (keyboard access)", () => {
    mount();
    click(byLabel(/Open chat/)!);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    press("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows suggestion chips, capped at three", () => {
    mount();
    click(byLabel(/Open chat/)!);
    const panel = document.querySelector('[role="dialog"]')!;
    const chips = [...panel.querySelectorAll("button")].filter((b) => b.hasAttribute("title"));
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it("keeps the thread across panel close/open (state survives)", async () => {
    const sendPrompt = vi.fn();
    (window as unknown as { sendPrompt: unknown }).sendPrompt = sendPrompt;
    mount();
    click(byLabel(/Open chat/)!);
    const chip = [...document.querySelector('[role="dialog"]')!.querySelectorAll("button")].find((b) =>
      b.hasAttribute("title"),
    )!;
    await clickAsync(chip);
    expect(sendPrompt).toHaveBeenCalledTimes(1);
    const sent = String(sendPrompt.mock.calls[0][0]);

    click(byLabel(/Close chat/)!);
    click(byLabel(/Open chat/)!);
    // The echoed user message is still in the thread after a close/open cycle.
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(sent.split(" [")[0]);
  });
});

describe("Client Actions panel (A27.4)", () => {
  it("opens from the account's quiet trigger", () => {
    mount();
    click(openAnchor());
    click(byText(/Client Actions/)!);
    const panel = document.querySelector('[role="dialog"]')!;
    expect(panel.textContent).toContain("Client Actions");
    expect(panel.textContent).toContain("Draft Credit Memo");
    expect(panel.textContent).toContain("Generate Spreading");
  });

  it("groups actions by the four categories", () => {
    mount();
    click(openAnchor());
    click(byText(/Client Actions/)!);
    const text = document.querySelector('[role="dialog"]')!.textContent ?? "";
    for (const c of ["Analyze", "Originate", "Service", "Risk"]) expect(text).toContain(c);
  });

  it("lists all ten actions on an account", () => {
    mount();
    click(openAnchor());
    click(byText(/Client Actions/)!);
    const panel = document.querySelector('[role="dialog"]')!;
    const rows = [...panel.querySelectorAll("button")].filter((b) => b.className.includes("c360-action-row"));
    expect(rows).toHaveLength(10);
  });

  it("founder feedback — has NO trigger on home at all", () => {
    mount();
    expect(document.getElementById("c360-client-actions-trigger")).toBeNull();
    expect(byText(/Client Actions/)).toBeUndefined();
  });

  it("founder feedback — force-closes when navigating back to home", () => {
    mount();
    click(openAnchor());
    click(byText(/Client Actions/)!);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    click(byText(/^← Worklist$|Worklist/)!);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.getElementById("c360-client-actions-trigger")).toBeNull();
  });

  it("founder feedback — hides the chat FAB while the actions panel is open", () => {
    mount();
    click(openAnchor());
    expect(byLabel(/Open chat/)).toBeTruthy();
    click(byText(/Client Actions/)!);
    expect(byLabel(/Open chat/)).toBeUndefined(); // FAB stands down
    press("Escape");
    expect(byLabel(/Open chat/)).toBeTruthy(); // and returns
  });

  it("sends the action prompt through the channel when a relationship is open", async () => {
    const sendPrompt = vi.fn();
    (window as unknown as { sendPrompt: unknown }).sendPrompt = sendPrompt;
    mount();
    click(openAnchor());
    click(byText(/Client Actions/)!);

    const memo = [...document.querySelector('[role="dialog"]')!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Draft Credit Memo"),
    )!;
    expect(memo.hasAttribute("disabled")).toBe(false);
    await clickAsync(memo);

    expect(sendPrompt).toHaveBeenCalledTimes(1);
    expect(String(sendPrompt.mock.calls[0][0])).toContain(
      "Draft the credit memo for Piedmont Precision Components, Inc. (001bb00001DLtRMAA1)",
    );
    // Panel stays open with feedback.
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Sent to desk");
  });

  it("closes on Escape", () => {
    mount();
    click(openAnchor());
    click(byText(/Client Actions/)!);
    press("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("verdict bar (A27.4 / A28)", () => {
  it("no longer carries the two action buttons", () => {
    mount();
    const row = [...document.querySelectorAll('[role="button"]')].find((r) =>
      r.textContent?.includes("Piedmont Precision"),
    )!;
    click(row);
    const header = container!.textContent ?? "";
    expect(header).toContain("Piedmont Precision");
    // Buttons moved into the registry/actions panel; the panel is closed here.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(byText(/^Generate Spreads$/)).toBeUndefined();
  });

  it("A28 — rating is a plain single-line stat cell (no pill, no tick scale)", () => {
    mount();
    click(openAnchor());
    const text = container!.textContent ?? "";
    expect(text).toContain("Rating");
    expect(text).toContain("Committed");
    // Founder feedback: the tick scale is gone — uniform single-line cells.
    expect(container!.querySelector('[aria-label*="scale"]')).toBeNull();
    const cell = container!.querySelector('[title="nCino risk rating"]')!;
    expect(cell).toBeTruthy();
    expect(cell.textContent).toContain("Grade 5");
    // Stage is a labelled package chip, never stacked inside the rating cell.
    expect(text).toContain("Package");
    expect(cell.textContent).not.toContain("Credit Decisioning");
  });

  it("founder feedback — Client Actions sits on the stat-strip row, not the nav", () => {
    mount();
    click(openAnchor());
    const triggers = [...document.querySelectorAll("#c360-client-actions-trigger")];
    expect(triggers).toHaveLength(1);
    expect(triggers[0].closest("header")).toBeNull();
    // Sibling of the stat cells: shares the strip row container.
    const cell = container!.querySelector('[title="nCino risk rating"]')!;
    expect(triggers[0].parentElement).toBe(cell.parentElement);
  });
});
