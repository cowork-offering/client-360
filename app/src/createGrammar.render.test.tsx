// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom, type WorkroomRouter } from "./components/workroom/Workroom";
import { clearComposed } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { BrainEnvelope, BrainReply } from "./channel/brainLane";
import type { C360Data } from "./data/contract";
import type { WorkroomMode } from "./workroom/types";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE CREATE GRAMMAR, IN THE ROOM.

   THE THREE DEFECTS, and then the grammar that makes them structurally
   impossible rather than caught:

     D1  a create whose value did not resolve reached a chip, reading
         `New covenant / not on the facility today / to all of the loans`;
     D2  a scope word landed silently on the focused member;
     D3  one chip was staged under a sentence saying it landed on all of them.

   AND THE TWO ASKS BEHIND THEM. An underspecified create is GATHERED FOR, one
   question at a time, grounded in what the relationship already carries; the
   open card is AMENDABLE in place; and a navigational line is answered with the
   choice rather than with a capability lecture.

   NOTHING HERE NEEDS A BRIDGE. The whole grammar is deterministic, so the last
   describe drives the same lines with a desk attached and proves the desk is
   never consulted and the answers do not move: channel-none parity is a
   contract, not a fallback.
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

const data = live as unknown as C360Data;
const accountId = "001bb00001I7FPNAA3";

interface Opened {
  room: HTMLElement;
  bound: Array<{ route: WorkroomMode; say?: string }>;
}

function open(args: { brain?: (e: BrainEnvelope) => Promise<BrainReply>; router?: boolean } = {}): Opened {
  const bundle = data.borrowers![accountId];
  const context = workroomContextFor({ mode: "modify", data, bundle, accountId, accountName: bundle.snapshot!.name! });
  const bound: Opened["bound"] = [];
  const router: WorkroomRouter | undefined = args.router
    ? {
        question: null,
        say: null,
        onBind: (route, opts) => bound.push({ route, say: opts?.say }),
        onRestart: (route, say) => bound.push({ route, say }),
      }
    : undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Workroom
        context={context}
        engine={createModifyEngine({ context, data, bundle })}
        router={router}
        reads={{ bundle, accountName: bundle.snapshot!.name!, productPackageId: context.productPackageId }}
        brain={args.brain}
        onClose={() => {}}
      />,
    );
  });
  return { room: document.querySelector<HTMLElement>(".wk-room")!, bound };
}

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

async function typeInto(room: HTMLElement, text: string) {
  const input = room.querySelector<HTMLInputElement>(".wk-txt")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => room.querySelector(".wk-send")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  for (let i = 0; i < 6; i += 1) await settle();
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = async (el: Element | undefined) => {
  act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  for (let i = 0; i < 6; i += 1) await settle();
};
const chips = (room: HTMLElement) => [...room.querySelectorAll(".wk-chip")];
/** Everything the agent has said, in one string. */
const said = (room: HTMLElement) => [...room.querySelectorAll(".wk-msg")].map((m) => m.textContent ?? "").join(" ");

const NEVER: BrainReply = { type: "clarify", text: "the desk should never have been asked this" };

/* ============================================================ D1 and the ask */

describe("a create whose value did not resolve never reaches a chip", () => {
  it("D1: the founder's own line gathers instead of staging the leftover words", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add another covenant to all of the loans");

    // NOT A CHIP. The defect staged `New covenant -> to all of the loans`.
    expect(chips(room)).toHaveLength(0);
    // THE SCOPE WORD IS ANSWERED FIRST, because it is the thing in doubt.
    expect(said(room)).toContain("Six facilities on this package");
    expect(byText(/^All 6$/)).toBeTruthy();
    expect(byText(/The 2 Line of Credit facilities/)).toBeTruthy();
  });

  it("offers what the relationship already tests, and says it will not set a threshold", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add another covenant to all of the loans");
    await click(byText(/^All 6$/));

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("This relationship already runs Debt Service Coverage of Borrower quarterly");
    expect(said(room)).toContain("I will not set a threshold myself");
    // GROUNDED IN THE BOOK, not in a hardcoded list.
    expect(byText(/Debt Service Coverage of Borrower at 1\.25/)).toBeTruthy();
    expect(byText(/Minimum Liquidity at 5,000,000/)).toBeTruthy();
  });

  it("asks which test when the bank's catalog carries the family twice", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a DSCR covenant of 1.25x on the 15M line of credit");

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("two tests in that family");
    expect(byText(/^Debt Service Coverage of Borrower$/)).toBeTruthy();
    expect(byText(/^Debt Service Coverage with and without Distributions$/)).toBeTruthy();
  });

  it("refuses by name when a gathered create does not resolve against the catalog", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a DSCR covenant of 1.25x on the 15M line of credit");
    await click(byText(/^Debt Service Coverage with and without Distributions$/));
    // It is on the book at the relationship level, so the room offers the second.
    await click(byText(/Put a second one on the facility/));

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("Debt Service Coverage of Borrower");
    expect(said(room)).toContain("I am not putting it up");
  });
});

/* ==================================================================== D2 */

describe("a scope word is honoured, and never narrowed to the focused member", () => {
  it("D2: asks about the scope even with a member on the table", async () => {
    const { room } = open();
    await settle();
    // Stand on a member first, the way a banker does.
    await click(byText(/Line of Credit\$15\.0MM/));
    await typeInto(room, "add another covenant to all of the loans");

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("Six facilities on this package");
  });

  it("fans a settled scope word out to every member it named", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add another covenant to all of the loans");
    await click(byText(/The 2 Line of Credit facilities/));
    await click(byText(/Maximum Debt to Worth at 3/));
    await click(byText(/Put a second one on the facility/));

    // Both lines of credit, and nothing else.
    expect(chips(room)).toHaveLength(2);
    expect(said(room)).toContain("$15.0MM Line of Credit and $2.5MM Line of Credit");
  });
});

/* ==================================================================== D3 */

describe("the sentence over the chips says what the chips say", () => {
  it("D3: a narrowed line never claims it landed on all of them", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "take the 2.5M line of credit to $4,000,000");

    expect(chips(room)).toHaveLength(1);
    const words = said(room);
    expect(words).toContain("Read that as the $2.50M Line of Credit");
    // The engine's own fan-out announcement is gone, and so is the member it no
    // longer reaches.
    expect(words).not.toContain("it lands on all of them");
    expect(words).not.toContain("Line of Credit ($15M)");
    expect(words).toContain("1 of these go on the clone");
  });
});

/* ================================================= covenant, end to end */

describe("a covenant is gathered, grounded, and put up", () => {
  it("reads the book for the schedule rather than asking a question it can answer", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a maximum debt to worth covenant of 3x on the purchase facility");

    // The relationship runs this test quarterly everywhere it carries it, so
    // "how often" is not asked. It IS said, with where it came from.
    expect(said(room)).not.toContain("How often is the");
    expect(said(room)).toContain("already runs at the relationship level");
  });

  it("names the duplicate rather than staging it blindly, and stages the second when asked", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    expect(chips(room)).toHaveLength(0);

    await click(byText(/Put a second one on the facility/));
    expect(chips(room)).toHaveLength(1);
    expect(room.textContent).toContain("Maximum Debt to Worth <= 3x");
    expect(said(room)).toContain("tested quarterly as this relationship already tests it");
    expect(said(room)).toContain("set once when it is created and never updated");
  });

  it("does not propose again what this session already put on the plan", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    await click(byText(/Put a second one on the facility/));
    await click(byText(/^Confirm$/));

    await typeInto(room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    expect(said(room)).toContain("already on this plan");
  });
});

/* =============================================== collateral, end to end */

describe("a pledge is gathered without ever asking what the org works out", () => {
  it("pledges the deal's own asset, and never asks for an advance rate", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "pledge the accounts receivable to the purchase facility");

    expect(chips(room)).toHaveLength(1);
    const words = said(room);
    expect(words).toContain("no advance rate for you to set here");
    expect(words).not.toMatch(/what advance rate/i);
    expect(words).not.toMatch(/lendable/i);
  });

  it("names the lien position as something no write carries, and puts it on the entry", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "pledge the accounts receivable to the purchase facility");

    expect(said(room)).toContain("lien position");
    await click(byText(/^Confirm$/));
    // The gap travels with the entry, so it reaches the plan rather than
    // scrolling away with the sentence that announced it.
    expect(room.textContent).toContain("No deployed write carries a lien position");
  });

  it("names an asset the facility already carries rather than pledging it twice", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "pledge the accounts receivable to the 15M line of credit");

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("already pledged to $15.0MM Line of Credit");
    expect(byText(/^Add a second$/)).toBeTruthy();
  });

  it("names the net-new asset gap instead of asking for a rate it will not set", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "pledge a new forklift fleet worth $2,000,000 to the purchase facility");

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("credit decision");
    expect(said(room)).toContain("advance rate");
  });
});

/* ================================================== the amendment in place */

describe("the open card is amended, never contradicted", () => {
  it("takes \"actually make it 1.30x\" onto the same card and says what changed", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    await click(byText(/Put a second one on the facility/));
    expect(chips(room)).toHaveLength(1);

    await typeInto(room, "actually make it 2.75x");

    // ONE card, still. Not a second, contradicting one.
    expect(chips(room)).toHaveLength(1);
    expect(room.textContent).toContain("Maximum Debt to Worth <= 2.75x");
    expect(room.textContent).not.toContain("Maximum Debt to Worth <= 3x");
    expect(said(room)).toContain("Updated on the card: the threshold is now 2.75x");
    // And it is NOT answered with the one-decision refusal.
    expect(said(room)).not.toContain("One decision at a time");
  });

  it("moves the open card to another facility when the banker says so", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    await click(byText(/Put a second one on the facility/));

    await typeInto(room, "on the construction loan instead");

    expect(chips(room)).toHaveLength(1);
    expect(said(room)).toContain("Updated on the card: it lands on Construction");
  });

  it("still refuses a genuinely new instruction over an open card", async () => {
    const { room } = open();
    await settle();
    await typeInto(room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    await click(byText(/Put a second one on the facility/));

    await typeInto(room, "take the 2.5M line of credit to $4,000,000");
    expect(said(room)).toContain("One decision at a time");
    expect(chips(room)).toHaveLength(1);
  });
});

/* ================================================= navigational steering */

describe("a navigational line is answered with the choice", () => {
  it("shows the facilities for \"let's modify a new loan\"", async () => {
    const { room, bound } = open({ router: true });
    await settle();
    await typeInto(room, "let's modify a new loan");

    expect(said(room)).toContain("6 facilities on this package. Which one?");
    expect(byText(/^\$8\.0MM Equipment$/)).toBeTruthy();
    // And it did NOT restart the room in the origination path.
    expect(bound).toHaveLength(0);
  });

  it("stands the room on the facility the banker picks", async () => {
    const { room } = open({ router: true });
    await settle();
    await typeInto(room, "let's modify a new loan");
    await click(byText(/^\$8\.0MM Equipment$/));

    expect(said(room)).toContain("Equipment");
    expect(said(room)).toContain("What should change on it?");
  });

  it("opens the new-facility path for \"add a new loan\"", async () => {
    const { room, bound } = open({ router: true });
    await settle();
    await typeInto(room, "add a new loan");
    expect(bound.map((b) => b.route)).toEqual(["create"]);
  });

  it("offers the route switch that already exists for \"renew instead\"", async () => {
    const { room, bound } = open({ router: true });
    await settle();
    await typeInto(room, "let's renew instead");
    expect(bound.map((b) => b.route)).toEqual(["renew"]);
  });
});

/* ==================================================== channel-none parity */

describe("channel-none parity: the grammar is the same room either way", () => {
  it("never troubles the desk for a create it can gather itself", async () => {
    const brain = vi.fn(async (_e: BrainEnvelope) => NEVER);
    const { room } = open({ brain });
    await settle();
    await typeInto(room, "add another covenant to all of the loans");
    await click(byText(/^All 6$/));
    expect(brain).not.toHaveBeenCalled();
    expect(said(room)).toContain("This relationship already runs");
  });

  it("never troubles the desk for a pledge, an amendment or a steer", async () => {
    const brain = vi.fn(async (_e: BrainEnvelope) => NEVER);
    const { room } = open({ brain });
    await settle();
    await typeInto(room, "pledge the accounts receivable to the purchase facility");
    await typeInto(room, "actually 2nd lien position");
    await typeInto(room, "a different facility");
    expect(brain).not.toHaveBeenCalled();
  });

  it("gathers exactly the same way with a desk attached as without one", async () => {
    const wired = open({ brain: vi.fn(async (_e: BrainEnvelope) => NEVER) });
    await settle();
    await typeInto(wired.room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    const withDesk = said(wired.room);

    act(() => root?.unmount());
    container?.remove();
    clearComposed();

    const dry = open();
    await settle();
    await typeInto(dry.room, "add a maximum debt to worth covenant of 3x on the purchase facility");
    expect(said(dry.room)).toBe(withDesk);
  });
});
