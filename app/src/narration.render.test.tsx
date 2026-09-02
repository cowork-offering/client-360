// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { BrainEnvelope, BrainReply } from "./channel/brainLane";
import { READ_DOORS } from "./channel/brainTools";
import { acquireSample, resetSessionDoor } from "./channel/sampleDoor";
import type { C360Data } from "./data/contract";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE PARSER STAGES, THE MODEL SPEAKS — in the room.

   THE CARD IS THE FACT AND THE SENTENCE IS THE JUDGMENT. What these hold is
   that the remark lands UNDER the room's own components and never instead of
   them, that a remark failing leaves the deterministic sentence exactly where
   it was, that no markdown character reaches the glass, and that a room with no
   session door renders precisely what it rendered before any of this existed.

   THE FOUR CHANNELS, each still rendering through the room's own components:
   a read-card through the read card, a delta-proposal through the parser's own
   chips, a clarify as an agent bubble with option chips, and the remark as an
   agent bubble beside whichever of them just landed.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  resetSessionDoor();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.body.className = "";
  delete (window as unknown as { claude?: unknown }).claude;
  clearComposed();
});

const data = live as unknown as C360Data;
const accountId = "001bb00001I7FPNAA3";

/** The session door, stubbed at the runtime's own shape. `text` is what the
 *  model writes; a rejection is any of the ways the door can fail. */
function installSession(answer: () => Promise<string>): { calls: string[] } {
  const calls: string[] = [];
  (window as unknown as { claude?: unknown }).claude = {
    use: async (name: string) =>
      name === "sample"
        ? async (input: string, options?: { onText?: (u: { text: string; delta: string }) => void }) => {
            calls.push(input);
            const text = await answer();
            options?.onText?.({ text, delta: text });
            return { text, truncated: false, modelTierApplied: "quick" };
          }
        : null,
  };
  return { calls };
}

/** main.tsx acquires the door before first render; the suite does the same. */
async function openRoom(brain?: (e: BrainEnvelope) => Promise<BrainReply>) {
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
        reads={{ bundle, accountName: bundle.snapshot!.name!, productPackageId: context.productPackageId }}
        brain={brain}
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

const reply = (r: BrainReply) => vi.fn(async (_e: BrainEnvelope) => r);

const READ_CARD: BrainReply = {
  type: "read-card",
  topic: "involvements",
  title: "Borrowing structure on the Hartwell package",
  rows: [{ icon: "borrower", label: "Hartwell Precision Manufacturing LLC", value: "Borrower", sub: "all 6 facilities" }],
  followUp: "Who should be added, and on which facility?",
};

const CLARIFY: BrainReply = {
  type: "clarify",
  text: "Which line do you mean? The relationship carries two.",
  options: [
    { label: "Revolving line, $15.0MM", say: "the revolving line of credit" },
    { label: "Seasonal line, $2.5MM", say: "the seasonal line of credit" },
  ],
};

const DELTA: BrainReply = {
  type: "delta-proposal",
  action: "loan-modification",
  rationale: "Client requested a seasonal working capital increase ahead of Q4 build.",
  changes: { scalarChangesJson: [{ key: "requestedAmount", value: 20_000_000, targetLoanId: "a4Zbb0000027MaYEAU" }] },
};

describe("the remark lands under the card, in the room's own bubble", () => {
  it("streams a sentence under the block the room just staged", async () => {
    installSession(async () => "Coverage thins to **0.62x**: the pledged pool does not grow with the line.");
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "take the line of credit to 20000000");

    const remark = room.querySelector(".wk-narr");
    expect(remark).not.toBeNull();
    expect(remark!.textContent).toContain("Coverage thins to");
    // Light structure, parsed into the room's OWN elements. Never a marker.
    expect(remark!.querySelector("b")?.textContent).toBe("0.62x");
    expect(remark!.textContent).not.toMatch(/\*/);
    // It is an agent bubble, not a second panel: one voice, one typography.
    expect(remark!.classList.contains("wk-agent")).toBe(true);
    expect(remark!.querySelector(".wk-bub")).not.toBeNull();
  });

  it("renders a bullet list as list items, never as hyphens in a paragraph", async () => {
    installSession(async () => "Three tests move:\n- DSC at 1.25x\n- Minimum liquidity at $2.0MM");
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "take the line of credit to 20000000");

    const list = room.querySelector(".wk-narr-list");
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll("li")).toHaveLength(2);
    expect(list!.textContent).not.toMatch(/^-/);
  });

  it("NEVER stages anything, whatever the remark says", async () => {
    // A remark that reads like an instruction is still prose. The plan is what
    // the deterministic layer put on it and nothing else.
    installSession(async () => "I have raised the equipment loan to $9M and added a DSC covenant at 1.40x.");
    const room = await openRoom(reply(CLARIFY));
    await settle();
    const before = room.querySelectorAll(".wk-chip").length;
    await typeInto(room, "what covenants do we carry");
    expect(room.querySelectorAll(".wk-chip").length).toBe(before);
  });
});

describe("a remark that fails leaves the room exactly as it was", () => {
  it("keeps the deterministic sentence when the door rejects", async () => {
    installSession(() => Promise.reject({ code: "upstream_error", message: "down" }));
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "take the line of credit to 20000000");

    expect(room.querySelector(".wk-narr")).toBeNull();
    // The card the parser staged is still there. Nothing is worse than today.
    expect(room.querySelectorAll(".wk-chip").length).toBeGreaterThan(0);
  });

  it("says the decline sentence once, in banker language, and never again", async () => {
    installSession(() => Promise.reject({ code: "not_granted", message: "declined" }));
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "take the line of credit to 20000000");
    await typeInto(room, "take the equipment loan to 9000000");

    const said = [...room.querySelectorAll(".wk-narr")].map((n) => n.textContent ?? "");
    const declines = said.filter((t) => t.includes("Working from the file only"));
    expect(declines).toHaveLength(1);
    expect(declines[0]).not.toMatch(/[—–]/);
  });

  it("renders nothing at all where the reply is blank", async () => {
    installSession(async () => "   ");
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "take the line of credit to 20000000");
    expect(room.querySelector(".wk-narr")).toBeNull();
  });
});

describe("channel-none renders exactly today's sentences", () => {
  it("shows no remark and no pulse with no session door and no brain", async () => {
    const room = await openRoom(undefined);
    await settle();
    await typeInto(room, "take the line of credit to 20000000");

    expect(room.querySelector(".wk-narr")).toBeNull();
    expect(room.querySelector(".wk-narr-wait")).toBeNull();
    // And the deterministic room is untouched: the card is on the plan.
    expect(room.querySelectorAll(".wk-chip").length).toBeGreaterThan(0);
  });

  it("shows no remark where a brain exists but the session door does not", async () => {
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "take the line of credit to 20000000");
    expect(room.querySelector(".wk-narr")).toBeNull();
  });
});

describe("the model's four channels each render through the room's own components", () => {
  it("a read-card reply renders as the room's read card, never as raw text", async () => {
    installSession(async () => "Four of the six sit at relationship level.");
    const room = await openRoom(reply(READ_CARD));
    await settle();
    await typeInto(room, "what is the relationship manager's phone number");

    const card = room.querySelector(".wk-readcard, [data-topic]");
    expect(card).not.toBeNull();
    expect(room.textContent).toContain("Hartwell Precision Manufacturing LLC");
    // The card's title is a heading in the card, not a JSON blob in a bubble.
    expect(room.textContent).not.toContain('"type":"read-card"');
  });

  it("a clarify reply renders as an agent bubble with option chips", async () => {
    installSession(async () => "Both are open; the seasonal line is the smaller of the two.");
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "raise the line");

    const opts = [...room.querySelectorAll(".wk-opt")].map((b) => b.textContent);
    expect(opts).toEqual(expect.arrayContaining(["Revolving line, $15.0MM", "Seasonal line, $2.5MM"]));
    expect(room.textContent).not.toContain('"type":"clarify"');
  });

  it("a delta-proposal renders as the parser's own chips, never as a tool call", async () => {
    installSession(async () => "That takes the line to $20.0MM.");
    const room = await openRoom(reply(DELTA));
    await settle();
    await typeInto(room, "the client wants a bit more room on the revolver");

    // It re-entered the deterministic parser: the chip is the parser's chip.
    expect(room.querySelectorAll(".wk-chip").length).toBeGreaterThan(0);
    expect(room.textContent).toContain("Reading that as");
    expect(room.textContent).not.toContain("delta-proposal");
  });

  it("the remark itself renders as prose in an agent bubble and nothing else", async () => {
    installSession(async () => "Coverage thins on the pledged pool.");
    const room = await openRoom(reply(READ_CARD));
    await settle();
    await typeInto(room, "what is the relationship manager's phone number");

    const remark = room.querySelector(".wk-narr");
    expect(remark).not.toBeNull();
    expect(remark!.querySelector(".wk-opt")).toBeNull();
    expect(remark!.querySelector("button")).toBeNull();
  });
});

describe("the write fence, from the room's side", () => {
  it("offers the model no door that is not a read", () => {
    for (const door of READ_DOORS) {
      expect(door).not.toMatch(/^(stage|execute)_/);
    }
  });

  it("makes no connector call at all to narrate", async () => {
    const callTool = vi.fn(async () => ({ payload: {} }));
    installSession(async () => "Coverage thins on the pledged pool.");
    (window as unknown as { claude?: { use: unknown; mcp?: unknown } }).claude!.mcp = { callTool };
    const room = await openRoom(reply(CLARIFY));
    await settle();
    await typeInto(room, "take the line of credit to 20000000");

    expect(room.querySelector(".wk-narr")).not.toBeNull();
    expect(callTool).not.toHaveBeenCalled();
  });
});
