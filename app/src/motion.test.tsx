// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { prefersReducedMotion } from "./data/motion";
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
});

function mount(node: React.ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<AppProvider data={sample as unknown as C360Data}>{node}</AppProvider>);
  });
  return container;
}

describe("motion guards (A25.4)", () => {
  it("treats a matchMedia-less environment as reduced motion", () => {
    expect(typeof window.matchMedia).not.toBe("function");
    expect(prefersReducedMotion()).toBe(true);
  });

  it("count-up resolves to the FINAL figure, never a partial tween", () => {
    // Book totalCommitted is $81M in the sample — animation must not gate it.
    const text = mount(<AppShell />).textContent ?? "";
    expect(text).toContain("$81M");
    expect(text).toContain("$59.05M"); // drawn balance
    expect(text).toContain("72.9%"); // utilization
  });
});

