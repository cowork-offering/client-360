// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed, createScriptedEngine } from "./workroom/engine";
import { doorFor } from "./workroom/modes";
import type { WorkroomContext } from "./workroom/types";

/* =============================================================================
   THE FILED FINALE (founder, 2026-09-03).

   "When the modification is done, can we gently and elegantly clean up the room,
   a cinematic kind of creation success with that card. Right now the room stays
   like nothing happened."

   WHAT IS UNDER TEST IS THE ROOM AFTER THE FILING, and nothing about the filing
   itself: the dossier's content, its link, its handoffs and the trail write are
   held by ncinoLinks and workroom.render, and they are unchanged. This holds the
   four claims the finale makes.

     1  everything that is not the card leaves the stage, and stays mounted
     2  the card is the only thing left, with its real rows, in a centred pane
     3  the rail says one line, and the record ids it drained are still readable
     4  the afterglow offers the card's own door, and the room stays alive

   JSDOM IS THE REDUCED-MOTION PATH. There is no matchMedia here, so
   `prefersReducedMotion` is true and the finale lands on `still` in the same
   commit as the filing - which is exactly the contract for a reader who asked
   for no animation, and is asserted as such rather than worked around.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const INSTANCE = "https://bankinggpt.lightning.force.com";
const ACCOUNT_ID = "001bb00001I7FPNAA3";
const PACKAGE_ID = "a5Fbb000000IHFJEA4";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let closed = 0;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  closed = 0;
  document.body.className = "";
  clearComposed();
});

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = (el: Element | undefined) => act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

/** Drive the scripted room all the way to the dossier, the way a banker does. */
async function fileAPlan() {
  const context: WorkroomContext = {
    mode: "modify",
    door: doorFor("modify", PACKAGE_ID),
    accountId: ACCOUNT_ID,
    accountName: "Hartwell Precision Manufacturing LLC",
    productPackageId: PACKAGE_ID,
    packageName: "Hartwell Industrial C&I Credit Package",
    approver: "fabian.goetzens@accenture.com.bankinggpt",
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <Workroom
        context={context}
        engine={createScriptedEngine(context)}
        instanceUrl={INSTANCE}
        onClose={() => {
          closed += 1;
        }}
      />,
    ),
  );
  const room = document.querySelector<HTMLElement>(".wk-room")!;
  click(byText(/liquidity covenant/));
  await settle();
  for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
    click(b);
    await settle();
  }
  for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
  await settle();
  /* WHAT THE ROOM IS HOLDING BEFORE THE FILING. The count is the evidence the
     finale is a change and not a coincidence: these are the items that have to
     leave. */
  const before = room.querySelectorAll("[data-ex-id]").length;
  click(room.querySelector<HTMLButtonElement>(".wk-propose")!);
  await settle();
  click(byText(/^Approve and file /));
  await settle();
  return { room, before };
}

/** Everything the reader can still meet in the thread. */
const onStage = (room: HTMLElement) => [...room.querySelectorAll("[data-ex-id]:not([data-finale])")];
const drained = (room: HTMLElement) => [...room.querySelectorAll('[data-ex-id][data-finale="gone"]')];

describe("the room exhales when the card lands", () => {
  it("takes every item that is not the filing's own output off the stage", async () => {
    const { room, before } = await fileAPlan();
    expect(before).toBeGreaterThan(3);

    /* THE COUNT. What is left on stage is the dossier and the drafted reply that
       landed beside it - the filing's own tail - and nothing else. */
    const left = onStage(room);
    expect(left).toHaveLength(2);
    expect(left.some((el) => el.querySelector(".wk-rescard"))).toBe(true);
    expect(left.some((el) => el.querySelector(".wk-reply"))).toBe(true);

    // And everything the room WAS holding went, rather than simply never having
    // been there: the two on stage are both new, appended by the filing itself.
    expect(drained(room).length).toBe(before);
    for (const gone of drained(room)) expect(gone.getAttribute("aria-hidden")).toBe("true");
  });

  it("drains the tiers with the exchanges, and keeps them all mounted", async () => {
    const { room } = await fileAPlan();
    // The greeting, the package and the facilities: tiers have their own
    // wrapper and the finale rides it rather than adding a second one.
    const tiers = [...room.querySelectorAll('[data-tier][data-finale="gone"]')];
    expect(tiers.length).toBeGreaterThan(0);
    /* NOTHING IS UNMOUNTED. The settle machinery's contract is that an absence
       test can tell "left the stage" from "never happened", and the finale does
       not get to break it: every drained node is still in the document. */
    for (const gone of drained(room)) expect(gone.isConnected).toBe(true);
  });
});

describe("the card ascends alone", () => {
  it("is the star of a centred pane, with the rows the filing actually wrote", async () => {
    const { room } = await fileAPlan();
    const card = room.querySelector(".wk-rescard")!;
    expect(card).toBeTruthy();
    /* ONE ROW PER CHANGE THAT ACTUALLY FILED, off the real manifest. Read
       against the rail's own cards rather than against a hard number, so the
       claim is "the card still says what filed" and not "the drive stages two". */
    expect(card.querySelectorAll(".rc-r")).toHaveLength(room.querySelectorAll(".wk-ent").length);
    expect(card.querySelector(".rc-f")!.textContent!.length).toBeGreaterThan(0);
    // The pane centres what is left, and the card's own wrapper is the star.
    expect(room.querySelector(".wk-thread")!.getAttribute("data-finale")).toBe("still");
    expect(card.closest("[data-finale-card]")).toBeTruthy();
  });

  it("lands instantly under reduced motion: no drain beat, no sweep, no offset", async () => {
    const { room } = await fileAPlan();
    /* NOTHING IS MID-EXIT. The finale skipped the middle beat entirely, so no
       node ever carried the sinking state and the card waits for nothing. */
    expect(room.querySelector('[data-finale="exhale"]')).toBeNull();
    const star = room.querySelector<HTMLElement>("[data-finale-card]")!;
    expect(star.style.getPropertyValue("--wk-fin-hold")).toBe("0ms");
    // The paced reveal starts where it always did rather than after a drain.
    const header = room.querySelector<HTMLElement>(".wk-rescard .rc-h")!;
    expect(header.style.animationDelay).toBe("140ms");
  });
});

describe("the rail is filed too", () => {
  it("says one quiet line and takes its staged cards off the stage", async () => {
    const { room } = await fileAPlan();
    const line = room.querySelector('[data-rail="filed"]')!;
    expect(line.textContent).toContain("Filed · 2 changes");

    const cards = [...room.querySelectorAll(".wk-ent")];
    expect(cards.length).toBe(2);
    for (const card of cards) expect(card.getAttribute("data-finale")).toBe("gone");

    /* AND THE PROOF SURVIVES THE DRAIN. Each card carries the org record id that
       verifies its write; the room being finished with them does not make them
       untrue, so they go off stage and stay readable. */
    const ids = [...room.querySelectorAll(".wk-filedbar .wk-id")].map((n) => n.textContent);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id!.length).toBeGreaterThan(0);
  });
});

describe("the quiet afterglow", () => {
  it("offers the card's own door and closes the room on the second", async () => {
    const { room } = await fileAPlan();
    const after = room.querySelector(".wk-afterglow")!;
    expect(after.textContent).toContain("The change set is closed");

    const link = after.querySelector<HTMLAnchorElement>("a[data-deeplink='workroom-finale']")!;
    /* ONE RECORD, ONE HREF. The door is read off the dossier the room is
       holding, so it can never point somewhere the card's own header does not. */
    const header = room.querySelector<HTMLAnchorElement>("a[data-deeplink='workroom-package']")!;
    expect(link.getAttribute("href")).toBe(header.getAttribute("href"));
    expect(link.getAttribute("rel")).toContain("noopener");

    click([...after.querySelectorAll("button")].find((b) => /Close the room/.test(b.textContent ?? "")));
    expect(closed).toBe(1);
  });

  it("leaves the composer honestly alive rather than announcing the end twice", async () => {
    const { room } = await fileAPlan();
    const composer = room.querySelector<HTMLInputElement>(".wk-txt")!;
    expect(composer.placeholder).toBe("Anything else on this relationship?");
    expect(room.textContent).not.toContain("The workroom holds");
  });
});
