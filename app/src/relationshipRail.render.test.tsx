// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BorrowerBundle, C360Data } from "./data/contract";
import type { ExecuteResult, ToolOutcome } from "./channel/writeTools";
import type { StagedOutput } from "./actions/stagedPlan";
import { RelationshipRoom, type RelRouter } from "./components/relationship/RelationshipRoom";
import { relContextFor, type RelFlowDeps } from "./components/relationship/reviewFlows";

/* =============================================================================
   THE RELATIONSHIP LANE ADOPTS THE RAIL.

   design/proposals/rail-scroll-addendum.md, section 4. The lane carried its own
   fold: past eight answers the OLDEST folded away behind "↑ n earlier in this
   review", which answered the overflow by removing the content. A covenant
   review over six covenants collects thirteen answers, so on the demo's own
   route five of every thirteen were one click away rather than one glance away.

   WHAT THIS PROVES IS THE FRAME. jsdom lays nothing out, so no real overflow can
   be measured here: this proves every answer is inside the ONE scrollable
   region, that the head stating the whole total is OUTSIDE it, and that the fold
   is gone. The measured proof (scrollHeight against clientHeight at 1280x800)
   lives in the headless drive.
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
});

const PACKAGE = "a5Fbb000000IHFJEA4";

/** SIX COVENANTS, all assessable. The shape Hartwell's package actually holds,
 *  and the reason thirteen answers is an ordinary covenant review rather than a
 *  stress case. */
const COVENANTS = Array.from({ length: 6 }, (_, i) => ({
  covenantId: `cov${i + 1}`,
  covenantType: ["Debt Service Coverage", "Fixed Charge Coverage", "Leverage", "Tangible Net Worth", "Current Ratio", "Capital Expenditure"][i],
  nextEvaluationDate: "2026-09-06",
  lastEvaluationStatus: "Compliant",
  latestComplianceStatus: "Pending",
  latestComplianceId: `ccp${i + 1}`,
  actualValue: 1.4 + i / 10,
}));

function ctxFor() {
  const bundle = {
    snapshot: { accountId: "001X", name: "Hartwell Precision Manufacturing LLC", productPackageId: PACKAGE, primaryRiskRating: "4" },
    exposure: { totalCommitted: 18_400_000, facilities: [{ loanId: "0Cb1", status: "Active", productPackageId: PACKAGE, committed: 10_000_000 }] },
    covenants: { covenants: COVENANTS },
  } as unknown as BorrowerBundle;
  const data = {
    meta: { generatedAt: "2026-08-31", userId: "005bb000001AAAAAAA" },
    portfolio: { accounts: [] },
    borrower: bundle,
    borrowers: { "001X": bundle },
  } as unknown as C360Data;
  return relContextFor({ data, bundle, accountId: "001X", accountName: "Hartwell Precision Manufacturing LLC" });
}

const deps: RelFlowDeps = {
  available: () => true,
  newKey: () => "key-1",
  stage: async () => ({ ok: true, result: {} as StagedOutput }) as ToolOutcome<StagedOutput>,
  execute: async () => ({ ok: true, result: {} as ExecuteResult }) as ToolOutcome<ExecuteResult>,
};

function open() {
  const router: RelRouter = {
    question: null,
    say: null,
    preselectCovenantId: null,
    neutral: () => ({ line: "", chips: [] }),
    onBind: () => {},
    onRestart: () => {},
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <RelationshipRoom ctx={ctxFor()} route="covenant" router={router} deps={deps} onClose={() => {}} />,
    );
  });
  return document.querySelector<HTMLElement>(".wk-room")!;
}

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

async function type(room: HTMLElement, text: string) {
  const input = room.querySelector<HTMLInputElement>(".wk-txt")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
}

/** Drives the covenant review until the lane holds `want` answers: all six
 *  covenants, then a verdict on each, then the observed figure on each. */
async function stage(room: HTMLElement, want: number) {
  await type(room, COVENANTS.map((c) => c.covenantType).join(", "));
  for (let guard = 0; guard < 40 && document.body.querySelectorAll(".wk-ent").length < want; guard++) {
    const ask = room.querySelector(".wk-step:not(.wk-gone) .wk-agent .wk-bub")?.textContent ?? "";
    await type(room, /assess\?/.test(ask) ? "Compliant" : "1.4");
  }
}

describe("the relationship lane is a bounded ledger", () => {
  it("keeps twelve answers inside ONE scrollable region, with the count pinned outside it", async () => {
    const room = open();
    await settle();
    await stage(room, 12);

    const rail = room.querySelector<HTMLElement>(".rail")!;
    const viewport = rail.querySelector<HTMLElement>(".rail-vp")!;
    const chips = room.querySelectorAll(".wk-ent");
    expect(chips).toHaveLength(12);
    for (const chip of chips) expect(viewport.contains(chip)).toBe(true);

    // THE HEAD IS PINNED. It states the whole review however far the chips have
    // travelled, so it cannot itself scroll out of sight.
    const head = rail.querySelector<HTMLElement>(".wk-man-h")!;
    expect(viewport.contains(head)).toBe(false);
    expect(head.querySelector(".wk-c")!.textContent).toBe("12 answers");
    expect(head.querySelector(".wk-kicker")!.textContent).toBe("This review");
    // And the head keeps its own classes, which is why the room's existing
    // `.wk-man-h` assertions survive adoption.
    expect(head.querySelector(".wk-dt")!.textContent).toBe("Scope");
  });

  it("has no fold left: every answer is on the rail, none is hidden behind a peek", async () => {
    const room = open();
    await settle();
    await stage(room, 12);
    expect(document.body.querySelector(".rl-fold")).toBeNull();
    expect(document.body.textContent).not.toContain("earlier in this review");
  });

  it("is a focusable region a keyboard can move, and names itself", async () => {
    const room = open();
    await settle();
    await stage(room, 12);
    const viewport = room.querySelector<HTMLElement>(".rail-vp")!;
    expect(viewport.getAttribute("role")).toBe("region");
    expect(viewport.getAttribute("tabindex")).toBe("0");
    expect(viewport.getAttribute("aria-label")).toBe("This review · 12 answers");
  });

  it("renders no rail at all while the lane is empty", async () => {
    const room = open();
    await settle();
    expect(room.querySelector(".rail")).toBeNull();
    expect(room.querySelector(".wk-empty")!.textContent).toContain("Answers land here");
  });
});
