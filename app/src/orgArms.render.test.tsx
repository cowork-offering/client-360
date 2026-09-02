// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { createRenewEngine } from "./workroom/renewEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { BrainEnvelope, BrainReply } from "./channel/brainLane";
import type { C360Data } from "./data/contract";
import type { WorkroomMode } from "./workroom/types";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE ORG ARMS, IN THE ROOM.

   The founder's own drive lines, against the book the artifact ships with.

   ONE THING THE BOOK DECIDES FOR US. Hartwell's Minimum Liquidity covenant
   carries NO loan junction on this read (`attachedLoans: []`), so drive line 6
   is the honest refusal rather than the exclusion: there is nothing on that
   facility for the new version to leave behind, and the room says where the
   covenant actually is. The covenant that IS on the $15M line of credit is the
   catalog entry called `Accounts Receivable`, which is also the name of an asset
   pledged to the same facility — the N1/P4 collision — so the two lines below
   are the same words with one noun changed, and they reach different arms.

   NOTHING HERE NEEDS A BRIDGE. The last describe drives the same lines with a
   desk attached and proves the desk is never asked: channel-none parity is a
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

function open(args: { brain?: (e: BrainEnvelope) => Promise<BrainReply>; mode?: WorkroomMode } = {}) {
  const bundle = data.borrowers![accountId];
  const mode = args.mode ?? "modify";
  const context = workroomContextFor({ mode, data, bundle, accountId, accountName: bundle.snapshot!.name! });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Workroom
        context={context}
        engine={
          mode === "renew" ? createRenewEngine({ context, data, bundle }) : createModifyEngine({ context, data, bundle })
        }
        reads={{ bundle, accountName: bundle.snapshot!.name!, productPackageId: context.productPackageId }}
        brain={args.brain}
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
  for (let i = 0; i < 6; i += 1) await settle();
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = async (el: Element | undefined) => {
  act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  for (let i = 0; i < 6; i += 1) await settle();
};
const chips = (room: HTMLElement) => [...room.querySelectorAll(".wk-chip")];
const said = (room: HTMLElement) => [...room.querySelectorAll(".wk-msg")].map((m) => m.textContent ?? "").join(" ");
const rail = (room: HTMLElement) => [...room.querySelectorAll(".wk-ent")].map((e) => e.textContent ?? "").join(" ");

const NEVER: BrainReply = { type: "clarify", text: "the desk should never have been asked this" };

describe("a covenant carry exclusion on a modification (P2)", () => {
  it("stages the exclusion for a covenant the facility actually carries", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(1);
    const chip = chips(room)[0].textContent ?? "";
    expect(chip).toContain("Accounts Receivable");
    expect(chip).toContain("not carried onto the new version");
    expect(said(room)).toContain("will not carry onto the new version");
    expect(said(room)).toContain("the booked loan keeps it");
    expect(said(room)).toContain("Nothing is deleted");
  });

  it("does not answer it with the covenant DETACH fence any more", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    expect(said(room)).not.toContain("covenant DETACH");
    expect(said(room)).not.toContain("this room does not file one");
  });

  it("puts it on the manifest as an exclusion, and the confirm says the booked loan is untouched", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));

    expect(rail(room)).toContain("Accounts Receivable");
    expect(rail(room)).toContain("not carried onto the new version");
    expect(said(room)).toContain("The booked loan keeps it");
    expect(said(room)).toContain("the covenant record itself is not touched");
    expect(said(room)).not.toContain("staged on the clone");
  });

  it("reads the plan back as an exclusion, never as a delete", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");
    await click(byText(/^Confirm$/));
    await typeInto(room, "what is on the plan");

    expect(said(room)).toMatch(/The manifest holds 1: Accounts Receivable on [^,]+, on the booked facility[^,]*, and carried onto the clone today to not carried onto the new version/);
  });

  it("REFUSES a covenant the facility does not carry, and says where it is (drive line 6)", async () => {
    const room = open();
    await settle();
    await typeInto(room, "remove the Minimum Liquidity covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(0);
    expect(said(room)).toContain("Minimum Liquidity is not attached to the");
    expect(said(room)).toContain("relationship level, with no loan junction on it at all");
    expect(said(room)).toContain("nothing has come off the manifest");
  });

  it("leaves the banker's own staged entries alone when a removal refuses (E1 holds)", async () => {
    const room = open();
    await settle();
    await typeInto(room, "increase the 15M line of credit to 20M");
    await click(byText(/^Confirm$/));
    await typeInto(room, "remove the Minimum Liquidity covenant from the 15M line of credit");

    expect(rail(room)).toContain("Commitment");
  });

  it("keeps the honest fence on a renewal: that tool does not take the arm", async () => {
    const room = open({ mode: "renew" });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(1);
    expect(chips(room)[0].textContent).toContain("Detach Accounts Receivable");
  });
});

describe("channel-none parity", () => {
  it("stages the same exclusion with a desk attached, and never asks it", async () => {
    const asked: BrainEnvelope[] = [];
    const room = open({
      brain: async (e) => {
        asked.push(e);
        return NEVER;
      },
    });
    await settle();
    await typeInto(room, "remove the accounts receivable covenant from the 15M line of credit");

    expect(chips(room)).toHaveLength(1);
    expect(said(room)).toContain("will not carry onto the new version");
    expect(asked.filter((e) => e.line.startsWith("remove the accounts receivable"))).toHaveLength(0);
  });
});
