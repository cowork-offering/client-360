// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOverlays } from "./state/syncOverlay";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sample from "../../artifact/sample-data.json";

const SRC = __dirname;
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
    // The sync overlay persists to localStorage by design; one test's sync must
    // not restore itself into the next test's mount.
    clearOverlays();
  } catch {
    /* ignore */
  }
});

function mount(data: C360Data = sample as unknown as C360Data): HTMLDivElement {
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
const openRow = (name: string) =>
  [...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes(name))!;
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
    // SURFACE 4, rule 50: on a client the mark carries the action arc, so it
    // announces itself as "Client actions" rather than as the chat.
    expect(byLabel(/Client actions/)).toBeTruthy();
    click(byText(/Client Actions/)!);
    expect(byLabel(/Client actions/)).toBeUndefined(); // the mark stands down
    press("Escape");
    expect(byLabel(/Client actions/)).toBeTruthy(); // and returns
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

describe("CopyPromptDialog explainer variant (founder bug 2026-07-25)", () => {
  const NOT_STAGED_COPY = /not staged in this cockpit snapshot/;
  const NO_CHANNEL_COPY = /isn't connected to the agent/;

  it("staged account + no channel ⇒ the no-channel variant, NOT the unstaged one", () => {
    mount(); // no window.sendPrompt in this env
    click(openAnchor()); // Piedmont IS staged
    click(byText(/Client Actions/)!);
    // A non-panel action: wave 2 gave New Facility Request a ticket, so the
    // copy-prompt fallback is now demonstrated on one that still narrates.
    const btn = [...document.querySelector('[role="dialog"]')!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Draft Credit Memo"),
    )!;
    expect(btn.hasAttribute("disabled")).toBe(false); // staged ⇒ available
    click(btn);

    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      /Copy prompt/.test(d.textContent ?? ""),
    )!;
    expect(dialog.textContent).toMatch(NO_CHANNEL_COPY);
    expect(dialog.textContent).not.toMatch(NOT_STAGED_COPY);
  });

  it("an activity next step for a ticketed action opens the ticket, not a prompt", () => {
    // Wave 2 gave every staged next-step action a ticket, so this path no
    // longer reaches the copy-prompt fallback at all. The fallback itself stays
    // covered by the Client Actions case above; what matters here is that the
    // next step behaves like the other two entry points (A33.1.1).
    mount();
    click(openRow("Sterling Fabrication"));
    click(byText(/Headroom analysis concluded/)!);
    // Collateral Valuation: the other staged next step, and the one that is not
    // gated on a booked facility (Probe 9).
    const step = [...document.querySelector('[aria-modal="true"]')!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Collateral Valuation"),
    )!;
    click(step);
    expect(
      [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getAttribute("aria-label") === "Collateral Valuation"),
    ).toBe(true);
    expect([...document.querySelectorAll('[role="dialog"]')].some((d) => /Copy prompt/.test(d.textContent ?? ""))).toBe(false);
  });

  it("genuinely unstaged row ⇒ the unstaged variant", () => {
    // The shipped sample stages every account (correct behaviour), so drop one
    // bundle to reproduce a genuinely unstaged row.
    const base = sample as unknown as C360Data;
    const borrowers = { ...(base.borrowers ?? {}) };
    delete borrowers["001SAMPLE0000BRWT"];
    mount({ ...base, borrowers } as C360Data);

    const row = [...document.querySelectorAll('[role="button"]')].find((r) =>
      r.textContent?.includes("Brightwater Foods"),
    )!;
    expect(row.textContent).toContain("not staged"); // the row chip
    click(row);
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      /Copy prompt/.test(d.textContent ?? ""),
    )!;
    expect(dialog.textContent).toMatch(NOT_STAGED_COPY);
    expect(dialog.textContent).not.toMatch(NO_CHANNEL_COPY);
  });

  it("INVARIANT — only the worklist's unstaged path may use the unstaged variant", () => {
    // A staged account can never be told it is not staged. Enforced at the type
    // level (cause is required) and asserted here across every call site.
    const files = readAllTsx(join(SRC, "components"));
    const causes: string[] = [];
    for (const [name, src] of files) {
      for (const m of src.matchAll(/cause="([a-z-]+)"/g)) causes.push(`${name}:${m[1]}`);
    }
    expect(causes.sort()).toEqual([
      "ActionsPanel.tsx:no-channel",
      "ActivityDetailModal.tsx:no-channel",
      "Worklist.tsx:unstaged",
    ]);
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

  /* SURFACE 2 moved the row this used to name. DIRECTION-LOCKED rule 8 made the
     identity its own glass hero, so the stat strip is now `.anchors` inside that
     hero and the two triggers ride the NAME row above it — the anchor cascade is
     an nth-child sequence and a control inside it would eat a beat of it. The
     founder call this test exists for is unchanged and still asserted: ONE
     trigger, never in the header (that centre belongs to the nav capsule, rule
     11), on the hero's own row beside Sync. */
  it("founder feedback — Client Actions sits in the hero beside Sync, not the nav", () => {
    mount();
    click(openAnchor());
    const triggers = [...document.querySelectorAll("#c360-client-actions-trigger")];
    expect(triggers).toHaveLength(1);
    expect(triggers[0].closest("header")).toBeNull();
    expect(triggers[0].closest(".hero")).toBeTruthy();
    // Sync shares the trigger group. Without a channel it renders its offline
    // diagnostic in that same slot, so the group carries two children either way.
    expect(triggers[0].parentElement!.children).toHaveLength(2);
  });
});
