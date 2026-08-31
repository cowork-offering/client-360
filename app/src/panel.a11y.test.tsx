// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { AppEntry, dispatchOpenSheet } from "./test/entry";
import sample from "../../artifact/sample-data.json";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/** Data with N agent-authored (server) messages already in the thread. */
function dataWithServerMessages(n: number): C360Data {
  const messages = Array.from({ length: n }, (_, i) => ({
    id: `srv-${i}`,
    role: i % 2 === 0 ? "user" : "agent",
    text: `server message ${i}`,
  }));
  return { ...(sample as unknown as C360Data), aiPanel: { threads: [{ id: "t1", messages }] } } as C360Data;
}

function mount(data: C360Data = sample as unknown as C360Data): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={data}>
        <AppShell />
        <AppEntry />
      </AppProvider>,
    );
  });
  return container;
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byLabel = (re: RegExp) => buttons().find((b) => re.test(b.getAttribute("aria-label") ?? ""));
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const tab = (shiftKey = false) =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true })));
const press = (key: string) => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

const panel = () => document.querySelector('[role="dialog"]')!;
/** Client Actions is account-only — open a relationship, then the sheet.
 *
 *  THE BUTTON IS RETIRED (founder call, 2026-08-31 night). The sheet's focus
 *  machinery is unchanged and still under test; it is entered through the app's
 *  own reducer, the same SET_PANEL the button dispatched. */
const openActions = () => {
  click([...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes("Piedmont Precision"))!);
  act(() => dispatchOpenSheet());
};
const focusables = () =>
  [...panel().querySelectorAll<HTMLElement>("button:not([disabled]),textarea:not([disabled])")];

describe("C5 — focus trap cannot be walked out of", () => {
  it("Shift+Tab from the panel root enters at the LAST focusable", () => {
    mount();
    openActions();
    // No autofocus target in the actions panel: focus starts on the root.
    expect(document.activeElement).toBe(panel());
    tab(true);
    expect(panel().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables()[focusables().length - 1]);
  });

  it("Tab from the panel root enters at the FIRST focusable", () => {
    mount();
    openActions();
    expect(document.activeElement).toBe(panel());
    tab();
    expect(document.activeElement).toBe(focusables()[0]);
  });

  it("Tab after focus escaped outside pulls focus back into the panel", () => {
    mount();
    openActions();
    // Simulate a pointer click landing outside the panel.
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    act(() => outside.focus());
    expect(panel().contains(document.activeElement)).toBe(false);

    tab();
    expect(panel().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables()[0]);
    outside.remove();
  });

  it("wraps at both ends of the ring", () => {
    mount();
    openActions();
    const ring = focusables();
    act(() => ring[ring.length - 1].focus());
    tab();
    expect(document.activeElement).toBe(ring[0]);
    tab(true);
    expect(document.activeElement).toBe(ring[ring.length - 1]);
  });
});

describe("C6 — closing returns focus to the trigger that opened the panel", () => {
  /* The Client Actions BUTTON is retired (founder call, 2026-08-31 night), so
     the contract is asserted on the surface that owns client actions now: a
     ticket opened from the arc hands focus back to the mark that fanned it. */
  it("a ticket opened from the arc returns focus to the FAB mark", () => {
    mount();
    click([...document.querySelectorAll('[role="button"]')].find((r) => r.textContent?.includes("Piedmont Precision"))!);
    const mark = byLabel(/Client actions/)!;
    click(mark);
    click(byLabel(/^Annual review$/)!);
    expect(document.querySelector('[role="dialog"][aria-label="Annual Review"]')).toBeTruthy();
    press("Escape");
    expect(document.activeElement).toBe(mark);
  });

  it("chat panel returns focus to the FAB", () => {
    mount();
    click(byLabel(/Open chat/)!);
    press("Escape");
    expect(document.activeElement).toBe(byLabel(/Open chat/)!);
  });
});

describe("C7 — unread watermark counts SERVER messages only", () => {
  const unreadBadge = () => byLabel(/Open chat, \d+ new/);

  it("badges server messages that arrived while the panel was closed", () => {
    mount(dataWithServerMessages(3));
    expect(unreadBadge()).toBeTruthy();
    expect(byLabel(/Open chat, 3 new/)).toBeTruthy();
  });

  it("clears the badge once the panel is opened", () => {
    mount(dataWithServerMessages(3));
    click(byLabel(/Open chat/)!);
    click(byLabel(/Close chat/)!);
    expect(unreadBadge()).toBeUndefined();
  });

  it("the 10 server + 1 local scenario does not swallow the next reply", () => {
    // Read 10 server messages -> watermark must be 10, NOT 11 (the local echo
    // is never counted). An 11th server message then reads as 1 unread.
    mount(dataWithServerMessages(10));
    click(byLabel(/Open chat/)!);
    click(byLabel(/Close chat/)!);
    expect(unreadBadge()).toBeUndefined();

    act(() => root!.unmount());
    // Full artifact replace: local echo is gone, server thread grew by one.
    container!.remove();
    mount(dataWithServerMessages(11));
    expect(byLabel(/Open chat, 1 new/)).toBeTruthy();
  });

  it("clamps the watermark down when the server prunes its history", () => {
    mount(dataWithServerMessages(10));
    click(byLabel(/Open chat/)!);
    click(byLabel(/Close chat/)!);

    act(() => root!.unmount());
    container!.remove();
    // Server pruned to 4 messages; watermark (10) must clamp to 4 so a 5th
    // message later still badges rather than being silently absorbed.
    mount(dataWithServerMessages(4));
    expect(unreadBadge()).toBeUndefined();

    act(() => root!.unmount());
    container!.remove();
    mount(dataWithServerMessages(5));
    expect(byLabel(/Open chat, 1 new/)).toBeTruthy();
  });
});
