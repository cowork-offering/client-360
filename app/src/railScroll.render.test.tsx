// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed, createScriptedEngine } from "./workroom/engine";
import { scriptFor } from "./workroom/scripts";
import { doorFor } from "./workroom/modes";
import type { WorkroomContext, WorkroomDelta } from "./workroom/types";

/* =============================================================================
   THE RAIL HOLDS FIFTEEN.

   FOUNDER, 2026-09-02: "when the committed cards get many (13 to 15 entries)
   the rail is CUT OFF". The room clips, the lane grew with its content, and
   past a dozen chips the newest change was simply below the room's edge.

   What these prove is the FRAME. jsdom lays nothing out, so a real overflow
   cannot be measured here: the room test proves every entry is inside the one
   scrollable region and that the head stating the whole total is OUTSIDE it,
   and the sheet test proves that region is bounded by the room and scrolls.
   The measured proof lives in the headless run (rail scrollHeight vs
   clientHeight at 1280x800), not in jsdom.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.body.className = "";
  clearComposed();
});

const CONTEXT: WorkroomContext = {
  mode: "modify",
  door: doorFor("modify", "a5Fbb000000IHFJEA4"),
  accountId: "001bb00001DLtRMAA1",
  accountName: "Hartwell Precision Manufacturing LLC",
  productPackageId: "a5Fbb000000IHFJEA4",
  packageName: "Hartwell Industrial C&I Credit Package",
  approver: "fabian.goetzens@accenture.com.bankinggpt",
};

/** FIFTEEN REAL CHIPS. The shapes are the script's own deltas, cloned onto
 *  distinct ids and members so the manifest counts them the way it counts a
 *  session that staged fifteen things. */
function fifteen(): WorkroomDelta[] {
  const script = scriptFor("modify", "package");
  const shapes = [script.deltas.amount, script.deltas.covenant, script.deltas.facility, script.deltas.pledge];
  return Array.from({ length: 15 }, (_, i) => {
    const shape = shapes[i % shapes.length];
    return { ...shape, id: `staged-${i}`, member: `HW10${String(i).padStart(2, "0")}` };
  });
}

/** The room the banker comes back to: fifteen chips already on the manifest,
 *  which is what `resume` hands a reopened room. */
function openWithFifteen() {
  const engine = createScriptedEngine(CONTEXT);
  const staged = fifteen();
  const resumed = { ...engine, resume: () => staged };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Workroom context={CONTEXT} engine={resumed} onClose={() => {}} />);
  });
  return document.querySelector<HTMLElement>(".wk-room")!;
}

describe("the manifest rail at fifteen entries", () => {
  it("keeps every chip inside one scrollable region, and the count line outside it", () => {
    const room = openWithFifteen();

    const rail = room.querySelector<HTMLElement>(".rail-vp")!;
    expect(rail).toBeTruthy();
    // Every entry is in the rail. Nothing is folded away to dodge the overflow.
    expect(room.querySelectorAll(".wk-col-r .wk-ent")).toHaveLength(15);
    expect(rail.querySelectorAll(".wk-ent")).toHaveLength(15);

    // THE COUNT LINE IS PINNED: it states the whole manifest and it is not in
    // the scroller, so it cannot travel off the top with the chips.
    const head = room.querySelector<HTMLElement>(".wk-col-r .wk-man-h")!;
    expect(head.textContent).toContain("15 changes");
    expect(rail.contains(head)).toBe(false);
  });

  it("is keyboard reachable, and the arrows move it", () => {
    const room = openWithFifteen();
    const rail = room.querySelector<HTMLElement>(".rail-vp")!;

    expect(rail.getAttribute("role")).toBe("region");
    expect(rail.tabIndex).toBe(0);
    expect(rail.getAttribute("aria-label")).toContain("15 changes");

    // jsdom lays nothing out, so the region is given the metrics a room at
    // fifteen chips has and the key handler is held to them.
    Object.defineProperty(rail, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(rail, "clientHeight", { value: 300, configurable: true });
    const press = (key: string) => act(() => rail.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

    press("ArrowDown");
    expect(rail.scrollTop).toBeGreaterThan(0);
    press("ArrowUp");
    expect(rail.scrollTop).toBe(0);
    press("End");
    expect(rail.scrollTop).toBe(600);
    press("Home");
    expect(rail.scrollTop).toBe(0);
  });

  it("fades the edge that is holding content back, and only that one", () => {
    const room = openWithFifteen();
    const rail = room.querySelector<HTMLElement>(".rail-vp")!;
    Object.defineProperty(rail, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(rail, "clientHeight", { value: 300, configurable: true });
    const scrolled = (top: number) => {
      rail.scrollTop = top;
      act(() => rail.dispatchEvent(new Event("scroll", { bubbles: false })));
    };

    scrolled(0);
    expect(rail.classList.contains("rail-up")).toBe(false);
    expect(rail.classList.contains("rail-down")).toBe(true);

    scrolled(300);
    expect(rail.classList.contains("rail-up")).toBe(true);
    expect(rail.classList.contains("rail-down")).toBe(true);

    scrolled(600);
    expect(rail.classList.contains("rail-up")).toBe(true);
    expect(rail.classList.contains("rail-down")).toBe(false);
  });
});

describe("the rail's sheet", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/rail.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("bounds the lane by the room and scrolls inside it", () => {
    // The cap is the ROOM's height, never the content's: the lane is absolute
    // at 74px from the room's top, so the ledger stops 22px short of the edge
    // and the composer and the Review & execute chip never move for it.
    expect(css).toContain(".wk-col-r:has(> .rail) {\n  max-height: calc(100% - 96px);\n}");
    const vp = css.slice(css.indexOf(".rail-vp {"));
    expect(vp).toContain("overflow-y: auto");
    expect(vp).toContain("overscroll-behavior: contain");
    expect(vp).toContain("-webkit-overflow-scrolling: touch");
    // No sideways jump the moment the stack grows past the cap.
    expect(vp).toContain("scrollbar-gutter: stable");
    // No hard cut at either edge.
    expect(vp).toContain("mask-image: linear-gradient(");
  });
});
