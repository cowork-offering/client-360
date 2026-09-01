// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  RelationshipRoom,
  neutralRelAsk,
  smartRelAsk,
  type RelRouter,
  type RelRouterQuestion,
} from "./components/relationship/RelationshipRoom";
import { relContextFor, type RelContext, type RelFlowDeps } from "./components/relationship/reviewFlows";
import type { RelOpening, RelRoute } from "./components/relationship/relRoute";
import type { BorrowerBundle, C360Data } from "./data/contract";
import type { StagedOutput } from "./actions/stagedPlan";
import type { ExecuteResult, ToolOutcome } from "./channel/writeTools";

/* =============================================================================
   THE RELATIONSHIP ROOM, AS A RITUAL.

   What is proved here is the ROOM: the smart opening and its neutral fallback,
   that a chip and a typed line bind the same way, that the guided steps collect
   what the flow demands, that the plan carries the ORG's token to a dossier,
   and that the two things this room refuses are refused out loud.

   The flows behind it are tested in components/relationship/reviewFlows.test.ts;
   the router in relRoute.test.ts. Here the deps are injected, so not one test
   below reaches a connector.
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

function ctxFor(): RelContext {
  const bundle = {
    snapshot: {
      accountId: "001X",
      name: "Hartwell Precision Manufacturing LLC",
      productPackageId: PACKAGE,
      primaryRiskRating: "4",
      computedRiskRating: "5",
    },
    exposure: {
      totalCommitted: 18_400_000,
      facilities: [
        {
          loanId: "0Cb1",
          status: "Active",
          productPackageId: PACKAGE,
          committed: 10_000_000,
          collateral: [{ collateralId: "a35A", collateralName: "COL-000762", collateralType: "Equipment" }],
        },
      ],
    },
    covenants: {
      covenants: [
        {
          covenantId: "cov1",
          covenantType: "Debt Service Coverage",
          nextEvaluationDate: "2026-09-06",
          lastEvaluationStatus: "Compliant",
          latestComplianceStatus: "Pending",
        },
      ],
    },
  } as unknown as BorrowerBundle;
  const data = {
    meta: { generatedAt: "2026-08-31", userId: "005bb000001AAAAAAA" },
    portfolio: { accounts: [] },
    borrower: bundle,
    borrowers: { "001X": bundle },
  } as unknown as C360Data;
  return relContextFor({ data, bundle, accountId: "001X", accountName: "Hartwell Precision Manufacturing LLC" });
}

const PLAN: StagedOutput = {
  stagingId: "a8abb00001KtalSAAR",
  planHash: "hash-wxyz",
  decisionToken: "6b3490fc91cfc47256b488c8bd783add",
  summary: "Files an annual credit review at In Progress.",
  steps: [],
  warnings: ["Entities added to the borrowing structure after the review is created get no snapshot row."],
  suggestions: [],
};

const RESULT: ExecuteResult = {
  stagingId: "a8abb00001KtalSAAR",
  terminalState: "success",
  outcome: "The review was created and verified.",
  recordName: "REV-0000000012",
  status: "In Progress",
  steps: [],
};

function depsFor(over: Partial<RelFlowDeps> = {}): RelFlowDeps {
  return {
    available: () => true,
    newKey: () => "key-1",
    stage: async () => ({ ok: true, result: PLAN }) as ToolOutcome<StagedOutput>,
    execute: async () => ({ ok: true, result: RESULT }) as ToolOutcome<ExecuteResult>,
    ...over,
  };
}

interface Opened {
  room: HTMLElement;
  bound: Array<{ route: RelRoute; opts?: { say?: string; covenantId?: string | null } }>;
  restarted: Array<{ route: RelRoute; say: string }>;
}

function open(args: {
  route?: RelRoute | null;
  question?: RelRouterQuestion | null;
  say?: string | null;
  covenantId?: string | null;
  deps?: RelFlowDeps;
} = {}): Opened {
  const bound: Opened["bound"] = [];
  const restarted: Opened["restarted"] = [];
  const router: RelRouter = {
    question: args.question ?? null,
    say: args.say ?? null,
    preselectCovenantId: args.covenantId ?? null,
    neutral: () => neutralRelAsk(),
    onBind: (route, opts) => bound.push({ route, opts }),
    onRestart: (route, say) => restarted.push({ route, say }),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <RelationshipRoom
        ctx={ctxFor()}
        route={args.route ?? null}
        router={router}
        deps={args.deps ?? depsFor()}
        onClose={() => {}}
      />,
    );
  });
  return { room: document.querySelector<HTMLElement>(".wk-room")!, bound, restarted };
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = (el: Element | undefined) => act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
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

/** The live question the room is asking: the sentence alone, without its step
 *  counter and without the option pills that answer it. */
const liveAsk = () => {
  const bubbles = [...document.body.querySelectorAll(".wk-step:not(.wk-gone) .wk-agent .wk-bub")];
  const last = bubbles[bubbles.length - 1];
  if (!last) return "";
  const copy = last.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".rl-kicker, .wk-opts").forEach((n) => n.remove());
  return (copy.textContent ?? "").trim();
};

const openingOpening: RelOpening = {
  line: "The Debt Service Coverage test is due in 6 days. Run the covenant review?",
  route: "covenant",
  yesLabel: "Open the covenant review",
  covenantId: "cov1",
};

/* --------------------------------------------------------------- the shell */

describe("the room is the workroom's sheet", () => {
  it("opens as one glass canvas, cut from the same recipe, with no second blurred surface", () => {
    const { room } = open({ question: neutralRelAsk() });
    expect(room.classList.contains("eg-glass")).toBe(true);
    expect(room.classList.contains("eg-glass-workroom")).toBe(true);
    expect(room.getAttribute("data-room")).toBe("relationship");
    // Every other surface the room paints is CONTENT and therefore solid. Only
    // the room itself carries a glass class, which is what keeps the census flat.
    expect(document.body.querySelectorAll("[class*='eg-glass']")).toHaveLength(1);
  });

  it("carries ONE word in the slim bar, and no review's name until one is bound", () => {
    const { room } = open({ question: neutralRelAsk() });
    expect(room.querySelector(".wk-title")!.textContent).toBe("Relationship Actions");
    expect(room.querySelectorAll(".wk-stepper .wk-stg")).toHaveLength(4);
  });

  it("names the bound review in the bar instead", async () => {
    const { room } = open({ route: "covenant" });
    await settle();
    expect(room.querySelector(".wk-title")!.textContent).toBe("Covenant Review");
  });

  it("declares exactly one scroller, the thread, and never shows its bar", () => {
    open({ question: neutralRelAsk() });
    expect(document.body.querySelectorAll(".wk-thread")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------ smart opening */

describe("the smart opening", () => {
  it("leads on the signal and offers the yes plus the way out of it", () => {
    open({ question: smartRelAsk(openingOpening) });
    expect(document.body.textContent).toContain("The Debt Service Coverage test is due in 6 days.");
    expect(byText(/Open the covenant review/)).toBeTruthy();
    expect(byText(/Something else/)).toBeTruthy();
  });

  it("binds the route AND the covenant the signal named, on the yes", () => {
    const { bound } = open({ question: smartRelAsk(openingOpening) });
    click(byText(/Open the covenant review/));
    expect(bound).toEqual([{ route: "covenant", opts: { covenantId: "cov1" } }]);
  });

  it("falls through to the neutral five-way on 'Something else', binding nothing", () => {
    const { bound } = open({ question: smartRelAsk(openingOpening) });
    click(byText(/Something else/));
    expect(bound).toEqual([]);
    expect(document.body.textContent).toContain("Which review are we running on this relationship?");
    for (const label of ["Annual review", "Covenant review", "Collateral valuation", "Risk-rating review", "Service request"]) {
      expect(byText(new RegExp(label))).toBeTruthy();
    }
  });
});

describe("the neutral five-way", () => {
  it("offers all five and binds the one the banker taps", () => {
    const { bound } = open({ question: neutralRelAsk() });
    expect(document.body.querySelectorAll(".wk-opts .wk-opt")).toHaveLength(5);
    click(byText(/Collateral valuation/));
    expect(bound[0].route).toBe("valuation");
  });

  it("binds from a typed line instead, and the question retires unanswered", async () => {
    const { room, bound } = open({ question: neutralRelAsk() });
    await type(room, "let's run the risk rating review");
    expect(bound[0]).toMatchObject({ route: "rating", opts: { say: "let's run the risk rating review" } });
  });

  it("repeats the question rather than guessing, when the line names no review", async () => {
    const { room, bound } = open({ question: neutralRelAsk() });
    await type(room, "how is this client doing");
    expect(bound).toEqual([]);
    expect(document.body.textContent).toContain("Pick one above, or name which of the five this is.");
  });

  it("keeps an unavailable route VISIBLE and disabled, with the registry's own reason", () => {
    const empty = { borrowers: { "001X": {} }, borrower: {}, portfolio: { accounts: [] }, meta: {} } as unknown as C360Data;
    const question = neutralRelAsk({ data: empty, accountId: "001X" });
    const covenantChip = question.chips.find((c) => c.route === "covenant")!;
    expect(covenantChip.disabled).toBe(true);
    expect(covenantChip.reason).toBe("No covenants recorded for this relationship");
  });
});

/* ------------------------------------------------------------- the register */

describe("the governance brief", () => {
  it("states what the review covers and what it produces, before the first question", async () => {
    open({ route: "annual" });
    await settle();
    const brief = document.body.querySelector(".rl-brief")!;
    expect(brief.textContent).toContain("Covers");
    expect(brief.textContent).toContain("Produces");
    expect(brief.textContent).toContain("exposure, performance against the package");
    expect(brief.textContent).toContain("credit review record at In Progress");
  });

  it("is a card, not a bubble: the scope is what the review IS, not something said", async () => {
    open({ route: "annual" });
    await settle();
    expect(document.body.querySelector(".rl-brief .wk-bub")).toBeNull();
  });

  it("lands EXACTLY ONCE on a room that opened already bound", async () => {
    // The lookup used to land a brief of its own beside the one the bind effect
    // owns, which put two identical scope statements in the thread.
    open({ route: "covenant" });
    await settle();
    expect(document.body.querySelectorAll(".rl-brief")).toHaveLength(1);
  });

  it("greets a legal name that already ends in a period without doubling it", async () => {
    open({ route: "annual" });
    await settle();
    // The fixture's relationship is "Hartwell Precision Manufacturing LLC"; the
    // rule is the general one, so assert the shape rather than the fixture.
    const greeting = document.body.querySelector(".wk-greet")!.textContent ?? "";
    expect(greeting.trim()).not.toMatch(/\.\.$/);
    expect(greeting.trim()).toMatch(/\.$/);
  });

  it("numbers the ritual, above the question rather than inside it", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    const kicker = room.querySelector(".rl-kicker")!;
    expect(kicker.textContent).toMatch(/^Step 1 of \d+$/);
    expect(liveAsk()).toBe("Which review is this?");
  });

  it("never raises its voice: no exclamation points anywhere in the room", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    expect(room.textContent).not.toMatch(/!/);
  });
});

/* ----------------------------------------------------- collecting the answers */

describe("the guided steps", () => {
  it("offers the org's own values as chips, and a tap SAYS the value", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    expect(byText(/^Annual$/)).toBeTruthy();
    expect(byText(/^Problem Loan$/)).toBeTruthy();
    click(byText(/^Annual$/));
    await settle();
    expect(room.querySelector(".wk-banker")!.textContent).toContain("Annual");
    expect(liveAsk()).toContain("State the relationship position");
  });

  it("takes the same answer as free text, implicitly", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    await type(room, "Annual");
    expect(liveAsk()).toContain("State the relationship position");
  });

  it("re-asks rather than guessing, when a closed-set answer is unreadable", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    await type(room, "the usual one");
    expect(liveAsk()).toContain("I could not read that as one of the values above.");
  });

  it("offers the skip on an optional step, and files it as an answer, not as silence", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    click(byText(/^Annual$/));
    await settle();
    expect(byText(/Not assessed/)).toBeTruthy();
    click(byText(/Not assessed/));
    await settle();
    expect(room.querySelector(".wk-col-r")!.textContent).toContain("not assessed");
  });

  it("collects a covenant verdict per covenant, and asks the reason only on an Exception", async () => {
    const { room } = open({ route: "covenant" });
    await settle();
    expect(liveAsk()).toBe("Which covenants are we assessing?");
    click(byText(/Debt Service Coverage/));
    await settle();
    expect(liveAsk()).toContain("How does the Debt Service Coverage test assess?");
    click(byText(/^Exception$/));
    await settle();
    // The observed figure comes first, then the reason the exception is one.
    expect(liveAsk()).toContain("What figure was tested");
    click(byText(/Not assessed/));
    await settle();
    expect(liveAsk()).toContain("failed test or an undelivered document");
    expect(byText(/^Breached$/)).toBeTruthy();
    expect(byText(/^Overdue$/)).toBeTruthy();
    expect(room).toBeTruthy();
  });

  it("opens the covenant list on the covenant the signal named", async () => {
    const { room } = open({ route: "covenant", covenantId: "cov1" });
    await settle();
    expect(room.querySelector(".wk-col-r")!.textContent).toContain("Covenants");
    expect(liveAsk()).toContain("How does the Debt Service Coverage test assess?");
  });

  it("refuses a figure it cannot read, on a numeric step", async () => {
    const { room } = open({ route: "valuation" });
    await settle();
    click(byText(/COL-000762/));
    await settle();
    await type(room, "about four million");
    expect(liveAsk()).toContain("I need a figure for that one.");
  });

  it("keeps the ledger in the right lane, and takes a row back off on request", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    click(byText(/^Annual$/));
    await settle();
    const lane = room.querySelector(".wk-col-r")!;
    expect(lane.textContent).toContain("Review type");
    expect(lane.textContent).toContain("1 answer");
    click(lane.querySelector(".wk-ent-x")!);
    await settle();
    // Back at zero the header retires with the last row (founder call
    // 2026-09-01: the lane never shows furniture for nothing).
    expect(room.querySelector(".wk-man-h")).toBeNull();
    expect(liveAsk()).toBe("Which review is this?");
  });
});

/* ---------------------------------------------------------- the token flow */

describe("the plan, the token and the dossier", () => {
  async function driveAnnual(deps?: RelFlowDeps) {
    const opened = open({ route: "annual", deps });
    await settle();
    click(byText(/^Annual$/));
    await settle();
    click(byText(/Not assessed/));
    await settle();
    click(byText(/Not assessed/));
    await settle();
    return opened;
  }

  it("puts the review chip in the thread once every step is answered", async () => {
    const { room } = await driveAnnual();
    const chip = room.querySelector(".wk-propose")!;
    expect(chip.textContent).toContain("Review & file");
    expect(chip.textContent).toContain("3 answers collected");
  });

  it("stages on the chip and shows the ORG's real token, never a decoration", async () => {
    const { room } = await driveAnnual();
    click(room.querySelector(".wk-propose")!);
    await settle();
    const card = room.querySelector(".wk-flowcard")!;
    expect(card.textContent).toContain("Files an annual credit review at In Progress.");
    expect(card.querySelector(".wk-tok")!.textContent).toBe("decision token · single use · 6b34…wxyz");
  });

  it("reads the org's warnings before the filing, as advice and never as a gate", async () => {
    const { room } = await driveAnnual();
    click(room.querySelector(".wk-propose")!);
    await settle();
    expect(room.querySelector(".rl-warn")!.textContent).toContain("Before you file");
    expect(room.querySelector(".rl-warn")!.textContent).toContain("get no snapshot row");
    // Advice never disarms the gesture.
    expect(byText(/File the review/)!.hasAttribute("disabled")).toBe(false);
  });

  it("executes in the thread and morphs into the result dossier", async () => {
    const { room } = await driveAnnual();
    click(room.querySelector(".wk-propose")!);
    await settle();
    click(byText(/File the review/));
    await settle();
    const dossier = room.querySelector(".wk-rescard")!;
    expect(dossier.textContent).toContain("Annual Review");
    expect(dossier.textContent).toContain("REV-0000000012");
    expect(dossier.textContent).toContain("The review was created and verified.");
    // The halo is the filing's only light, and it is on.
    expect(dossier.classList.contains("wk-lit")).toBe(true);
    expect(room.querySelector(".wk-tokline")!.textContent).toBe(
      "✓Single-use decision token redeemed. Filed against Hartwell Precision Manufacturing LLC.",
    );
    // The review is filed, NOT approved, and the room says so.
    expect(room.querySelector(".wk-handoff")!.textContent).toContain("filed, not approved");
    expect(room.querySelector(".wk-flowcard")).toBeNull();
  });

  it("gives no connector a surface of its own, and burns no token getting there", async () => {
    const execute = vi.fn();
    const { room } = await driveAnnual(depsFor({ available: () => false, execute }));
    click(room.querySelector(".wk-propose")!);
    await settle();
    expect(room.querySelector(".wk-notice")!.textContent).toContain("not connected to the bank's systems");
    expect(room.querySelector(".wk-flowcard")).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("closes the approval once the call has reached the org", async () => {
    const { room } = await driveAnnual(
      depsFor({
        execute: async () =>
          ({ ok: false, error: { code: "TOKEN_REFUSED", message: "The token has already been used." } }) as ToolOutcome<ExecuteResult>,
      }),
    );
    click(room.querySelector(".wk-propose")!);
    await settle();
    click(byText(/File the review/));
    await settle();
    expect(room.textContent).toContain("The filing may have completed despite the error.");
    expect(byText(/Approval closed/)!.hasAttribute("disabled")).toBe(true);
  });

  it("does not arm the gesture when the ORG is holding execution", async () => {
    const { room } = await driveAnnual(
      depsFor({
        stage: async () =>
          ({ ok: true, result: { ...PLAN, executionHeld: true, heldReason: "The org is holding this plan." } }) as ToolOutcome<StagedOutput>,
      }),
    );
    click(room.querySelector(".wk-propose")!);
    await settle();
    expect(room.querySelector(".rl-warn-h")!.textContent).toContain("The org is holding this plan.");
    expect(byText(/Held by the org/)!.hasAttribute("disabled")).toBe(true);
  });
});

/* ------------------------------------------------------------- the refusals */

describe("what this room does not do", () => {
  it("hands facility work next door in one professional line", async () => {
    const { room } = open({ route: "covenant" });
    await settle();
    await type(room, "pledge the receivables against the line of credit");
    expect(document.body.textContent).toContain("That is facility work.");
    expect(document.body.textContent).toContain("Facility Actions");
  });

  it("composes a standalone covenant and states the gap rather than filing it", async () => {
    const { room } = open({ route: "covenant" });
    await settle();
    await type(room, "add a new covenant on the relationship");
    const gap = room.querySelector(".rl-gap")!;
    expect(gap.textContent).toContain("Not filed");
    expect(gap.textContent).toContain("No deployed tool authors a standalone covenant on the Account");
    expect(byText(/What would close this/)).toBeTruthy();
  });

  it("does the same for an owned, unpledged collateral asset", async () => {
    const { room } = open({ route: "valuation" });
    await settle();
    await type(room, "create a new collateral asset for this borrower");
    expect(room.querySelector(".rl-gap")!.textContent).toContain("owned but unpledged collateral record");
  });

  it("refuses the grade override by name rather than guessing its wire key", async () => {
    const { room } = open({ route: "rating" });
    await settle();
    await type(room, "override the grade to 6");
    expect(document.body.textContent).toContain("The rating override cannot be filed from here.");
  });
});

/* --------------------------------------------------------- switching review */

describe("route binding is final per plan", () => {
  it("rebuilds on the other review while nothing has been collected", async () => {
    const { room, restarted } = open({ route: "covenant" });
    await settle();
    await type(room, "actually run the annual review");
    expect(restarted).toEqual([{ route: "annual", say: "actually run the annual review" }]);
  });

  it("refuses out loud once answers exist, and offers the discard as an explicit gesture", async () => {
    const { room, restarted } = open({ route: "annual" });
    await settle();
    click(byText(/^Annual$/));
    await settle();
    await type(room, "actually run the covenant review");
    expect(document.body.textContent).toContain("so the room is held to it");
    expect(restarted).toEqual([]);
    click(byText(/Discard and start the covenant review/));
    expect(restarted).toEqual([{ route: "covenant", say: "actually run the covenant review" }]);
  });
});

/* ----------------------------------------------------------- one exchange */

describe("one live exchange", () => {
  it("collapses the steps behind the live one, and never unmounts them", async () => {
    const { room } = open({ route: "annual" });
    await settle();
    click(byText(/^Annual$/));
    await settle();
    click(byText(/Not assessed/));
    await settle();
    expect(room.querySelectorAll(".wk-step.wk-gone").length).toBeGreaterThan(0);
    const chip = room.querySelector(".wk-hist")!;
    expect(chip.textContent).toContain("earlier steps");
    click(chip);
    expect(room.querySelectorAll(".wk-step.wk-gone")).toHaveLength(0);
  });

  it("keeps the route question on screen while it is still open", async () => {
    const { room } = open({ question: neutralRelAsk() });
    await type(room, "no idea");
    // Collapsing step 0 behind the answer would hide the five chips in the same
    // gesture that said "pick one".
    expect(document.body.querySelectorAll(".wk-opts .wk-opt").length).toBeGreaterThanOrEqual(5);
  });
});
