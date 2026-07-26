import { afterEach, describe, expect, it } from "vitest";
import { isTopmost, modalDepth, pushModal, resetModalStack } from "./components/modalStack";

afterEach(() => resetModalStack());

describe("A31.1 — Escape belongs to the innermost layer", () => {
  it("makes the most recently opened layer the topmost one", () => {
    pushModal("sheet");
    expect(isTopmost("sheet")).toBe(true);
    pushModal("panel");
    // The Client Actions sheet opened first; the Action Panel is now on top, so
    // one Escape must not take both down.
    expect(isTopmost("sheet")).toBe(false);
    expect(isTopmost("panel")).toBe(true);
  });

  it("hands the layer back when the top one closes", () => {
    pushModal("sheet");
    const closePanel = pushModal("panel");
    closePanel();
    expect(isTopmost("sheet")).toBe(true);
    expect(modalDepth()).toBe(1);
  });

  it("removes the right layer when one closes out of order", () => {
    const closeSheet = pushModal("sheet");
    pushModal("panel");
    closeSheet();
    expect(isTopmost("panel")).toBe(true);
    expect(modalDepth()).toBe(1);
  });

  it("nobody is topmost when nothing is open", () => {
    expect(isTopmost("sheet")).toBe(false);
    expect(modalDepth()).toBe(0);
  });

  it("keeps duplicate ids independent, popping one instance at a time", () => {
    pushModal("x");
    const close = pushModal("x");
    close();
    expect(modalDepth()).toBe(1);
    expect(isTopmost("x")).toBe(true);
  });
});
