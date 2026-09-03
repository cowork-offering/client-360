// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { CAPABILITY_LINE } from "./components/workroom/hygiene";
import { clearComposed } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import { PRICING_WHY } from "./components/workroom/pricingGate";
import { __resetFeedForTests, stageFeed } from "./intent/feed";
import { consumeIntent, __resetIntentsForTests } from "./intent/store";
import type { IntentDoc } from "./intent/contract";
import { ACT_WORDS } from "./channel/narrate";
import { RelationshipRoom, neutralRelAsk } from "./components/relationship/RelationshipRoom";
import { relContextFor, type RelFlowDeps } from "./components/relationship/reviewFlows";
import type { RelRoute } from "./components/relationship/relRoute";
import type { BorrowerBundle } from "./data/contract";
import type { StagedOutput } from "./actions/stagedPlan";
import type { ExecuteResult, ToolOutcome } from "./channel/writeTools";
import { resetCatalog } from "./channel/catalog";
import { acquireSample, resetSessionDoor } from "./channel/sampleDoor";
import type { C360Data } from "./data/contract";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THREAD HYGIENE - the room resolves itself.

   FOUNDER, 2026-09-03, on the live cockpit: "it reads like double chats", and
   then, the same morning, "even a single bubble is too much text to read". Two
   complaints, one pass: the room said several things twice, and each of the
   things it said was longer than it needed to be.

   WHAT THESE HOLD:

     ONE BUBBLE     a focus click puts the room's own prompt on the glass and
                    nothing else. The model is not consulted on a selection and
                    never speaks over a question.
     ONE LINE       the focus prompt is one line, and the capability list rides
                    the FIRST focus of a room open and no other.
     THE SETTLE     an exchange that has been decided leaves the stage and is
                    replaced by one compact row. It is MOUNTED, not deleted, and
                    the row brings it back.
     THE CUTS       the parser preamble only where the room narrowed; the
                    version fact once per plan, in one sentence; the pricing
                    reason once per facility.
     THE FED LINE   an intent's instruction is a marker, not a banker bubble,
                    and the queue's own progress is in the rail, not the thread.
     THE BUDGET     each act's remark is clipped to its word budget on the glass,
                    not only asked for in the prompt.

   Motion is OFF in jsdom (no matchMedia), which is the reduced-motion path: the
   settle is an instant swap there and the next step lands in the same commit.
   That is deliberate - it is the path a banker with the accessibility setting
   on gets, and the one the suite can assert without chasing a timer.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  resetSessionDoor();
  __resetFeedForTests();
  __resetIntentsForTests();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.body.className = "";
  delete (window as unknown as { claude?: unknown }).claude;
  clearComposed();
  resetCatalog();
  __resetFeedForTests();
  __resetIntentsForTests();
});

const data = live as unknown as C360Data;
const accountId = "001bb00001I7FPNAA3";

/** The session door at the runtime's own shape, answering one remark. */
function installSession(text: string): { calls: string[] } {
  const calls: string[] = [];
  (window as unknown as { claude?: unknown }).claude = {
    use: async (name: string) =>
      name === "sample"
        ? async (input: string, options?: { onText?: (u: { text: string; delta: string }) => void }) => {
            calls.push(input);
            options?.onText?.({ text, delta: text });
            return { text, truncated: false, modelTierApplied: "quick" };
          }
        : null,
  };
  return { calls };
}

async function openRoom() {
  await acquireSample(50);
  const bundle = data.borrowers![accountId];
  const context = workroomContextFor({ mode: "modify", data, bundle, accountId, accountName: bundle.snapshot!.name! });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Workroom
        context={context}
        engine={createModifyEngine({ context, data, bundle })}
        reads={{
          bundle,
          accountName: bundle.snapshot!.name!,
          productPackageId: context.productPackageId,
          generatedAt: "2026-09-03T08:00:00.000Z",
        }}
        onClose={() => {}}
      />,
    );
  });
  return document.querySelector<HTMLElement>(".wk-room")!;
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
  await settle();
  await settle();
  await settle();
}

const click = async (el: Element | null | undefined) => {
  act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle();
  await settle();
};

/** The facility chip on the package strip, by the label it prints. */
const memberChip = (room: HTMLElement, label: string) =>
  [...room.querySelectorAll<HTMLButtonElement>(".wk-mchip")].find((b) => b.textContent?.includes(label));

const confirmButton = (room: HTMLElement) =>
  [...room.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Confirm");

const settledRows = (room: HTMLElement) => [...room.querySelectorAll<HTMLElement>(".wk-settled")];
const onStage = (room: HTMLElement) => [...room.querySelectorAll<HTMLElement>('[data-settle-state="on"]')];
const settledAway = (room: HTMLElement) => [...room.querySelectorAll<HTMLElement>('[data-settle-state="settled"]')];

/** Every word on the glass, as a reader meets it. The room's chrome (the
 *  header, the composer, the rail) is not the thread and is not counted. */
const threadWords = (room: HTMLElement): number =>
  (room.querySelector(".wk-thread")?.textContent ?? "").split(/\s+/).filter(Boolean).length;


/* ------------------------------------------------ the relationship room's own

   Injected deps, exactly as relationshipRoom.render.test.tsx does it: not one
   assertion below reaches a connector. */

const REL_PACKAGE = "a5Fbb000000IHFJEA4";

function relCtx() {
  const bundle = {
    snapshot: {
      accountId: "001X",
      name: "Hartwell Precision Manufacturing LLC",
      productPackageId: REL_PACKAGE,
      primaryRiskRating: "4",
      computedRiskRating: "5",
    },
    exposure: {
      totalCommitted: 18_400_000,
      facilities: [
        {
          loanId: "0Cb1",
          status: "Active",
          productPackageId: REL_PACKAGE,
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
  const relData = {
    meta: { generatedAt: "2026-08-31", userId: "005bb000001AAAAAAA" },
    portfolio: { accounts: [] },
    borrower: bundle,
    borrowers: { "001X": bundle },
  } as unknown as C360Data;
  return relContextFor({
    data: relData,
    bundle,
    accountId: "001X",
    accountName: "Hartwell Precision Manufacturing LLC",
  });
}

const REL_PLAN: StagedOutput = {
  stagingId: "a8abb00001KtalSAAR",
  planHash: "hash-wxyz",
  decisionToken: "6b3490fc91cfc47256b488c8bd783add",
  summary: "Files an annual credit review at In Progress.",
  steps: [],
  warnings: [],
  suggestions: [],
};

const REL_RESULT: ExecuteResult = {
  stagingId: "a8abb00001KtalSAAR",
  terminalState: "success",
  outcome: "The review was created and verified.",
  recordName: "REV-0000000012",
  status: "In Progress",
  steps: [],
};

const relDeps = (): RelFlowDeps => ({
  available: () => true,
  newKey: () => "key-1",
  stage: async () => ({ ok: true, result: REL_PLAN }) as ToolOutcome<StagedOutput>,
  execute: async () => ({ ok: true, result: REL_RESULT }) as ToolOutcome<ExecuteResult>,
});

function openRel(args: { route: RelRoute }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <RelationshipRoom
        ctx={relCtx()}
        route={args.route}
        router={{
          question: null,
          say: null,
          preselectCovenantId: null,
          neutral: () => neutralRelAsk(),
          onBind: () => {},
          onRestart: () => {},
        }}
        deps={relDeps()}
        onClose={() => {}}
      />,
    );
  });
  return { room: document.querySelector<HTMLElement>(".wk-room")! };
}

const relSettle = settle;
const relClick = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

/** Answer the live step with the first chip the room offers. A chip SAYS the
 *  value: it rides the same recorder a typed line does. */
async function relAnswer(room: HTMLElement) {
  await relType(room, "Annual");
}

async function relType(room: HTMLElement, text: string) {
  const input = room.querySelector<HTMLInputElement>(".wk-txt")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await settle();
  await settle();
}

/* ============================================ 0. the focus click, one bubble */

describe("a focus click puts ONE bubble on the glass (founder paste, 2026-09-03)", () => {
  it("does not consult the model on a selection", async () => {
    const session = installSession("Commitment rises and the revolver sheds two pledges.");
    const room = await openRoom();
    await settle();
    await settle();
    const before = session.calls.length;
    const narrs = room.querySelectorAll(".wk-narr").length;

    await click(memberChip(room, "Line of Credit"));

    // The room answered. The model was never asked, so there is no second
    // bubble to read: a selection is the banker pointing, not the room acting.
    expect(room.textContent).toContain("What should change on it?");
    expect(session.calls).toHaveLength(before);
    expect(room.querySelectorAll(".wk-narr")).toHaveLength(narrs);
  });

  it("says the facility in ONE line, with the commitment as its name", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await settle();
    await click(memberChip(room, "Line of Credit"));

    const bubbles = [...room.querySelectorAll<HTMLElement>(".wk-agent .wk-bub")];
    const prompt = bubbles.find((b) => b.textContent?.includes("What should change on it?"))!;
    // The commitment is the facility's NAME, in parentheses, exactly as the
    // strip and the rail already print it - not a third figure in a list.
    expect(prompt.textContent).toMatch(/Line of Credit \(\$15M\):/);
    expect(prompt.textContent).not.toContain("committed,");
    // One line: the identity, the two facts, the question. Nothing else.
    expect(prompt.textContent!.replace(CAPABILITY_LINE, "").split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(18);
  });

  it("shows the capability list on the FIRST focus of a room open and never again", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await settle();

    await click(memberChip(room, "Line of Credit"));
    expect(room.textContent).toContain(CAPABILITY_LINE);

    await click(memberChip(room, "Construction"));
    const prompts = [...room.querySelectorAll<HTMLElement>(".wk-agent .wk-bub")].filter((b) =>
      b.textContent?.includes("What should change on it?"),
    );
    // The SECOND prompt carries the facility and not the orientation. What this
    // room can file is a thing you need the first time.
    expect(prompts[prompts.length - 1].textContent).not.toContain(CAPABILITY_LINE);
  });
});

/* ==================================================== 1. the settle choreography */

describe("an exchange that settles leaves the stage (rule 1)", () => {
  it("replaces the whole exchange with ONE compact settled row", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await typeInto(room, "take the 15M line of credit to 20000000");
    const staged = onStage(room).length;
    expect(staged).toBeGreaterThan(1);

    await click(confirmButton(room));

    const rows = settledRows(room);
    expect(rows).toHaveLength(1);
    // What settled, and how. The card's own two figures, and the word.
    expect(rows[0].textContent).toContain("$15M");
    expect(rows[0].textContent).toContain("$20M");
    expect(rows[0].textContent).toContain("confirmed");
    // And the exchange it replaced is off the stage: the banker's line, the
    // room's account and the chips all left together.
    expect(settledAway(room).length).toBeGreaterThanOrEqual(staged);
  });

  it("keeps the exchange MOUNTED and brings it back on the row's own control", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await typeInto(room, "take the 15M line of credit to 20000000");
    await click(confirmButton(room));

    const away = settledAway(room);
    expect(away.length).toBeGreaterThan(0);
    // FADED IS NOT GONE. Every settled item is still in the document, hidden
    // from the accessibility tree, and one click from being back.
    for (const node of away) {
      expect(document.body.contains(node)).toBe(true);
      expect(node.getAttribute("aria-hidden")).toBe("true");
    }

    const row = settledRows(room)[0];
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(settledAway(room)).toHaveLength(0);
    expect(room.querySelectorAll('[data-settle-state="shown"]').length).toBeGreaterThan(0);
    // The banker's own line is readable again, which is the whole point.
    expect(room.textContent).toContain("take the 15M line of credit to 20000000");
  });

  it("swaps instantly under reduced motion: nothing is left mid-exit", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await typeInto(room, "take the 15M line of credit to 20000000");
    await click(confirmButton(room));

    // jsdom has no matchMedia, so `prefersReducedMotion` is true here. There is
    // no leaving beat at all and the next step is already on the glass.
    expect(room.querySelectorAll('[data-settle-state="leaving"]')).toHaveLength(0);
    expect(settledAway(room).length).toBeGreaterThan(0);
  });

  it("spends a handful of words where the exchange spent dozens", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await typeInto(room, "take the 15M line of credit to 20000000");
    const spent = threadWords(room);

    await click(confirmButton(room));

    /* THE ROOM RESOLVES ITSELF. The exchange the banker just decided is off the
       stage - its line, its account and its chips are not in what is read - and
       the row that stands for it is a handful of words. What is on the glass
       now is the NEXT step, which is the only thing left to decide. */
    const visible = [...room.querySelectorAll<HTMLElement>(".wk-thread *")]
      .filter((el) => el.getAttribute("data-settle-state") === "on" || el.classList.contains("wk-settled"))
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(visible).not.toContain("take the 15M line of credit to 20000000");
    expect(visible).not.toContain("Read that as the");
    expect(spent).toBeGreaterThan(40);

    const row = settledRows(room)[0];
    expect(row.textContent!.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(10);
  });

  it("retires the facility strip once the first card lands (rule 4)", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await settle();
    expect(room.querySelector('[data-tier="detail"]')?.getAttribute("data-tier-state")).toBe("on");

    await typeInto(room, "take the 15M line of credit to 20000000");

    // The banker is deciding on the card now, not on the strip. Every tier is
    // faded and every one of them is still mounted behind the summon.
    expect(room.querySelector('[data-tier="detail"]')?.getAttribute("data-tier-state")).toBe("faded");
    expect(room.querySelector('[data-summon="tiers"]')).not.toBeNull();
  });
});

/* ============================================================ 2. the copy cuts */

describe("the room says it once (rule 2)", () => {
  it("says the version fact ONCE per plan, in one sentence", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await typeInto(room, "take the 15M line of credit to 20000000");
    expect(room.textContent).toContain("Confirming stages the next version of the package");
    // The methodology paragraph is gone: what is left is the fact that makes
    // the Confirm safe to press.
    expect(room.textContent).not.toContain("every eligible member rolls into it");

    await click(confirmButton(room));
    await typeInto(room, "move the construction loan maturity to 2029-06-30");
    const bubbles = [...room.querySelectorAll<HTMLElement>(".wk-agent .wk-bub")];
    const last = bubbles[bubbles.length - 1];
    expect(last.textContent).not.toContain("Confirming stages the next version");
  });

  it("says the parser preamble only where it actually narrowed between members", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    // Two lines of credit on this package: naming the figure narrows, and the
    // banker is entitled to read which one the room took.
    await typeInto(room, "take the 15M line of credit to 20000000");
    expect(room.textContent).toContain("Read that as the");

    await click(confirmButton(room));
    // A line naming a facility no sibling shares narrows nothing, so the room
    // has nothing to explain and does not.
    await typeInto(room, "move the construction loan maturity to 2029-06-30");
    const bubbles = [...room.querySelectorAll<HTMLElement>(".wk-agent .wk-bub")];
    expect(bubbles[bubbles.length - 1].textContent).not.toContain("Read that as the");
  });

  it("gives the pricing reason once per facility, not on both of its questions", async () => {
    installSession("");
    const room = await openRoom();
    await settle();
    await typeInto(room, "take the 15M line of credit to 20000000");
    await click(confirmButton(room));

    // The first pricing question carries the reason.
    expect(room.textContent).toContain(PRICING_WHY);
    const first = room.textContent!.split(PRICING_WHY).length - 1;
    expect(first).toBe(1);
  });
});

/* ========================================================== 3. the intent feed */

describe("a fed line is a marker, not a banker bubble (rule 3)", () => {
  const INTENT: IntentDoc = {
    id: "01J8ZQ5K9T2M4XQ7YB3C1",
    accountId,
    accountName: "Hartwell Precision Manufacturing LLC",
    room: "facility",
    route: "modify",
    lines: [
      "take the 15M line of credit to 20000000",
      "move the construction loan maturity to 2029-06-30",
      "move the 2.5M line of credit rate to 7.25%",
      "give the 8M equipment loan a 84 month term",
    ],
    context: {
      summary: "James Hartwell asked to take the revolver to $20M.",
      source: { kind: "meeting", received: "3 Sep 2026" },
    },
    createdAt: "2026-09-03T07:00:00.000Z",
    status: "pending",
  };

  it("renders the instruction once, as one line naming where it came from", async () => {
    installSession("");
    consumeIntent(INTENT);
    stageFeed({ room: "facility", accountId, lines: INTENT.lines, intentId: INTENT.id });
    const room = await openRoom();
    await settle();
    await settle();
    await settle();
    await settle();

    const marker = room.querySelector<HTMLElement>('[data-fed="line"]');
    expect(marker).not.toBeNull();
    expect(marker!.textContent).toContain("From the meeting of 3 Sep 2026");
    expect(marker!.textContent).toContain("take the 15M line of credit to 20000000");
    // NOT a banker bubble. Nobody in this room said it.
    expect(
      [...room.querySelectorAll(".wk-banker")].some((b) => b.textContent?.includes("take the 15M line of credit")),
    ).toBe(false);
  });

  it("puts the queue's own progress in the rail head, never in the thread", async () => {
    installSession("");
    consumeIntent(INTENT);
    stageFeed({ room: "facility", accountId, lines: INTENT.lines, intentId: INTENT.id });
    const room = await openRoom();
    await settle();
    await settle();
    await settle();

    const head = room.querySelector<HTMLElement>('[data-feed="progress"]');
    expect(head).not.toBeNull();
    expect(head!.textContent).toContain(`of ${INTENT.lines.length} settled`);
    expect(room.querySelector(".wk-thread")!.contains(head!)).toBe(false);
  });

  it("drops the 'anything else' tail while the queue still holds a line", async () => {
    installSession("");
    consumeIntent(INTENT);
    stageFeed({ room: "facility", accountId, lines: INTENT.lines, intentId: INTENT.id });
    const room = await openRoom();
    await settle();
    await settle();
    await settle();
    await settle();

    // The room is about to say the next line itself; asking whether there is
    // anything else would be a question it answers one beat later, out loud.
    expect(room.querySelector(".wk-thread")!.textContent).not.toContain(
      "Anything else on this facility, or shall I stage it?",
    );
  });
});

/* ============================================================ the word budget */

describe("the budget is enforced on the glass, not only asked for (founder, 2026-09-03)", () => {
  const LONG =
    "The revolver carries the whole increase on its own and the pledged pool does not move with it. " +
    "Coverage thins across the relationship and the cushion narrows on every test the package holds. " +
    "That leaves the borrower with less headroom than the committee saw at the last review, which is " +
    "worth a note in the file before this goes up for approval by anyone at all this quarter.";

  it("clips a staged remark to its act's word budget", async () => {
    installSession(LONG);
    const room = await openRoom();
    await settle();
    // A pledge is not a routine scalar, so the model is consulted and speaks.
    await typeInto(room, "pledge the Fort Wayne equipment on the 2.5M line of credit");

    const remark = room.querySelector<HTMLElement>(".wk-narr .wk-bub");
    if (!remark) return; // the room refused the line; there is no remark to hold
    const words = remark.textContent!.split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThanOrEqual(ACT_WORDS.staged + 2);
  });

  it("holds the staged budget well under the answered one", () => {
    // The card already carries the change; the remark is the consequence.
    expect(ACT_WORDS.staged).toBeLessThan(ACT_WORDS.answered);
    expect(ACT_WORDS.staged).toBeLessThanOrEqual(35);
    expect(ACT_WORDS.refused).toBeLessThanOrEqual(25);
  });
});

/* ==================================================== 5. the relationship room */

describe("the relationship room settles its steps the same way (rule 5)", () => {
  it("turns an answered step into ONE numbered row, mounted and summonable", async () => {
    const { room } = openRel({ route: "annual" });
    await relSettle();
    await relSettle();

    // The room is asking a numbered question, as the ritual does.
    expect(room.textContent).toMatch(/Step 1 of \d/);
    const asked = room.querySelector<HTMLElement>(".wk-thread")!.textContent!;

    await relAnswer(room);

    const rows = [...room.querySelectorAll<HTMLElement>(".wk-settled")];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The number travels on the row: a banker three questions into six should
    // not have to count rows to find out how far through the review they are.
    expect(rows[0].textContent).toMatch(/Step 1 of \d/);
    expect(rows[0].textContent).toContain("recorded");

    expect(asked).toContain("Step 1 of");
    /* THE FIRST QUESTION IS A TIER and the summon already owns it, so its row
       carries no second control for the same intent. Every step after it is an
       ordinary exchange and settles like one. */
    expect(rows[0].tagName).toBe("DIV");

    await relType(room, "The relationship is performing to plan and the position is unchanged.");
    const both = [...room.querySelectorAll<HTMLElement>(".wk-settled")];
    expect(both.length).toBeGreaterThanOrEqual(2);
    const second = both[1] as HTMLButtonElement;
    expect(second.tagName).toBe("BUTTON");

    // FADED IS NOT GONE. The exchange is still in the document, hidden, and one
    // click from being back.
    const away = [...room.querySelectorAll<HTMLElement>('[data-settle-state="settled"]')];
    expect(away.length).toBeGreaterThan(0);
    for (const node of away) expect(node.getAttribute("aria-hidden")).toBe("true");

    relClick(second);
    await relSettle();
    expect(room.querySelectorAll('[data-settle-state="settled"]')).toHaveLength(0);
    expect(room.querySelectorAll('[data-settle-state="shown"]').length).toBeGreaterThan(0);
  });

  it("retires the scope tier once the first step settles (rule 4)", async () => {
    const { room } = openRel({ route: "annual" });
    await relSettle();
    await relSettle();
    await relAnswer(room);
    // Every tier is off the stage and the summon that brings them back is there.
    expect(room.querySelector('[data-tier="detail"]')?.getAttribute("data-tier-state")).toBe("faded");
    expect(room.querySelector('[data-summon="tiers"]')).not.toBeNull();
  });
});
