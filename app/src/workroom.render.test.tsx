// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { clearComposed, createScriptedEngine, type WorkroomEngine } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { doorFor } from "./workroom/modes";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { BorrowerBundle, C360Data } from "./data/contract";
import type { WorkroomContext, WorkroomMode } from "./workroom/types";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE WORKROOM SHELL, HELD TO THE EIGHT LAWS.

   ONE component renders all three modes. These prove the shell that ships on
   day one: the entry scene stays under sixty words, the manifest starts empty,
   an arrival walks the package figures and a removal walks them back, the
   brand mark is TYPOGRAPHIC rather than a drawn chevron, and nothing in the
   room declares a scroll container.

   The storyline behind them is scripted and its engine is tested separately in
   workroom/engine.test.ts. What is tested here is the ROOM.
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
  // The composed manifest is held in MODULE scope so a close does not lose it,
  // which means it outlives a test the way it outlives a room. Every test here
  // opens on the same package: without this, one test's staged entry is the next
  // test's opening rail.
  clearComposed();
});

function contextFor(mode: WorkroomMode, packageId: string | null = "a5Fbb000000IHFJEA4"): WorkroomContext {
  return {
    mode,
    door: doorFor(mode, packageId),
    accountId: "001bb00001DLtRMAA1",
    accountName: "Hartwell Precision Manufacturing LLC",
    productPackageId: packageId,
    packageName: "Hartwell Industrial C&I Credit Package",
    approver: "fabian.goetzens@accenture.com.bankinggpt",
  };
}

function openWith(context: WorkroomContext, engine: WorkroomEngine) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Workroom context={context} engine={engine} onClose={() => {}} />);
  });
  return document.querySelector<HTMLElement>(".wk-room")!;
}

function open(mode: WorkroomMode, packageId?: string | null) {
  const context = contextFor(mode, packageId);
  // THE SHELL, ON A SHELL ENGINE. Which engine a mode gets is WorkroomHost's
  // decision; what is proved here is the ROOM, so the storyline engine is
  // handed in directly rather than resolved from an app provider.
  return openWith(context, createScriptedEngine(context));
}

/** Close the room the way the banker does. The next `open` builds a fresh mount
 *  the way reopening the workroom does. */
function shut() {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = (el: Element | undefined) =>
  act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
/** Let a promise chain and a zero-delay timer settle. */
const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

/** Say a line in the composer. React holds the input's value, so the setter has
 *  to go round it for the change event to carry. */
async function typeInto(room: HTMLElement, text: string) {
  const input = room.querySelector<HTMLInputElement>(".wk-txt")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  click(room.querySelector(".wk-send")!);
  await settle();
}

/**
 * VISIBLE WORDS (law 3).
 *
 * Text nodes, walked, with two exclusions and no others: `aria-hidden` subtrees
 * are decoration (the brand glyph, the ambient wash) and the manifest rail is
 * genuinely invisible at entry — it has zero width and zero opacity until the
 * conversation opens, which jsdom does not apply for us.
 */
function visibleWords(room: HTMLElement): string[] {
  const words: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      words.push(...(node.textContent ?? "").split(/\s+/).filter(Boolean));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.getAttribute("aria-hidden") === "true") return;
    if (node.classList.contains("wk-col-r")) return;
    node.childNodes.forEach(walk);
  };
  walk(room);
  return words;
}

describe("law 3 — the opening view is under sixty words", () => {
  for (const mode of ["modify", "renew", "create"] as WorkroomMode[]) {
    it(`holds in ${mode}`, () => {
      const words = visibleWords(open(mode));
      expect(words.length).toBeLessThan(60);
    });
  }

  it("holds on the account door of create, which opens on no package at all", () => {
    expect(visibleWords(open("create", null)).length).toBeLessThan(60);
  });

  it("opens by NAME, and the greeting fits inside the budget", () => {
    const room = open("modify");
    // The room was opened on "fabian.goetzens@accenture.com.bankinggpt", which
    // is an identity the assembler stamps rather than a name anyone types. The
    // greeting is a real read out of it or it is nothing.
    expect(room.querySelector(".wk-greet")!.textContent).toBe("Hey Fabian. ");
    expect(room.querySelector(".wk-headline")!.textContent).toMatch(/^Hey Fabian\. \S/);
    expect(visibleWords(room).length).toBeLessThan(60);
  });

  it("greets nobody rather than greeting a record id", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // The two things that are NOT a name: the org's own user id, and the
    // placeholder the context falls back to when there is no identity at all.
    for (const approver of ["005bb00000ftouDAAQ", "the signed-in banker"]) {
      const context = { ...contextFor("modify"), approver };
      act(() => {
        root!.render(<Workroom context={context} engine={createScriptedEngine(context)} onClose={() => {}} />);
      });
      expect(document.querySelector(".wk-greet")).toBeNull();
      expect(document.querySelector(".wk-headline")!.textContent).not.toMatch(/hey/i);
    }
  });

  it("says the position ONCE, and the conversation is already open under it", () => {
    const room = open("modify");
    expect(room.querySelectorAll(".wk-headline")).toHaveLength(1);
    // W3, decided 2026-08-27: ONE scene. The briefing, the suggestion and the
    // composer arrive together, and there is no button between the banker and
    // the room. Law 3 still holds — the count above proves it.
    expect(room.querySelector(".wk-composer")).toBeTruthy();
    expect(room.querySelector(".wk-sugg")).toBeTruthy();
    expect(buttons().some((b) => /Open the conversation/.test(b.textContent ?? ""))).toBe(false);
    // The spine measures PROGRESS and there is none yet, so it stays out of the
    // opening view rather than spending four of law 3's sixty words on it.
    expect(room.querySelector(".wk-stepper")).toBeNull();
  });
});

/**
 * THE ROOM THE FOUNDER IS ACTUALLY IN.
 *
 * Every law-3 test above runs the SHELL engine on a seven-member fixture, which
 * is the room's own storyline and not the room a banker opens. The wired room
 * derives its strip, its position sentence and its suggestion from a real
 * bundle, and its word count moves with what that bundle holds — so the budget
 * is measured there too, or it is only guarded where nobody is standing.
 */
describe("law 3 — the WIRED room, on the baked relationship", () => {
  const data = live as unknown as C360Data;
  /** Hartwell: six booked members on one package, no client request staged. */
  const accountId = "001bb00001I7FPNAA3";

  function openWired() {
    const bundle = data.borrowers![accountId];
    const context = workroomContextFor({
      mode: "modify",
      data,
      bundle,
      accountId,
      accountName: bundle.snapshot!.name!,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <Workroom
          context={context}
          engine={createModifyEngine({ context, data, bundle })}
          onClose={() => {}}
        />,
      );
    });
    return document.querySelector<HTMLElement>(".wk-room")!;
  }

  it("holds the sixty-word budget with the greeting in it", () => {
    expect(visibleWords(openWired()).length).toBeLessThan(60);
  });

  it("opens by name and leads on the deal's next move, not a headcount", () => {
    const room = openWired();
    const headline = room.querySelector(".wk-headline")!.textContent ?? "";
    expect(headline).toContain("Hey Fabian.");
    // Wave 2: the opener is proactive. Of Hartwell's six booked members, none
    // matures inside the coming quarter as of this snapshot's own clock
    // (`meta.generatedAt`), so the highest-priority thing this room can say is
    // the nearest covenant test due soon — the Accounts Receivable test on the
    // Line of Credit, six days out (`nextMove.ts`, tier 2). The old headcount
    // sentence ("All 6 members are booked...") is now the fallback, exercised
    // in modifyEngine.test.ts on a bundle with no next move to lead on.
    expect(headline).toContain("The Accounts Receivable covenant is due in 6 days.");
    expect(headline).toMatch(/Start the review\?$/);
  });

  it("offers every eligible member as something to click, not something to read", () => {
    const chips = [...openWired().querySelectorAll<HTMLButtonElement>(".wk-mchip")];
    expect(chips).toHaveLength(6);
    expect(chips.every((c) => !c.disabled)).toBe(true);
    // The chip says the PRODUCT. A record id on the face of a member chip is
    // what the founder's UAT read as hardcoded.
    expect(chips.map((c) => c.querySelector("b")!.textContent)).toEqual([
      "Line of Credit",
      "Construction",
      "Equipment",
      "Purchase",
      "Equipment",
      "Line of Credit",
    ]);
  });

  it("names the pill in banker grammar, with today's figure as context", () => {
    // NOT "Increase the Line of Credit - $15,000,000.00", which reads as
    // "increase BY fifteen million" — the exact ambiguity the live UAT hit.
    expect(openWired().querySelector(".wk-pill")!.textContent).toBe("Line of Credit · $15M committed");
  });
});

describe("one shell, three modes", () => {
  it("changes the vocabulary and nothing structural", () => {
    const titles = (["modify", "renew", "create"] as WorkroomMode[]).map((m) => {
      const room = open(m);
      const title = room.querySelector(".wk-title")!.textContent;
      act(() => root?.unmount());
      container?.remove();
      return title;
    });
    expect(titles).toEqual(["Modification Workroom", "Renewal Workroom", "New Facility Workroom"]);
  });

  it("names the fourth step for what the mode actually does", async () => {
    for (const [mode, step] of [
      ["modify", "Approve"],
      ["renew", "Submit"],
      ["create", "File"],
    ] as [WorkroomMode, string][]) {
      const room = open(mode);
      // The spine measures progress, so it arrives with the first move rather
      // than sitting idle on the entry scene (law 3's word budget).
      click(room.querySelector(".wk-pill")!);
      await settle();
      const spine = [...room.querySelectorAll(".wk-stg")].map((s) => s.textContent);
      expect(spine.at(-1)).toContain(step);
      act(() => root?.unmount());
      container?.remove();
    }
  });

  it("pre-pins the package on the create door that has one, and does not invent one on the door that does not", () => {
    expect(open("create").querySelectorAll(".wk-mchip").length).toBeGreaterThan(0);
    act(() => root?.unmount());
    container?.remove();
    const blank = open("create", null);
    expect(blank.querySelectorAll(".wk-mchip")).toHaveLength(0);
    expect(blank.querySelector(".wk-agg")!.textContent).toContain("$0.0MM");
  });
});

describe("law 8 — the manifest starts empty and the arrival is the signature", () => {
  it("stages nothing until a confirm lands", () => {
    const room = open("modify");
    expect(room.querySelector(".wk-empty")).toBeTruthy();
    expect(room.querySelector(".wk-ent")).toBeNull();
    expect(room.querySelector(".wk-man-h")!.textContent).toContain("Nothing staged");
  });

  it("walks the package figures forward on a confirm and back on a removal", async () => {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();

    // Two proposed changes, nothing written, nothing in the rail yet.
    expect(room.querySelectorAll(".wk-chip")).toHaveLength(2);
    expect(room.querySelector(".wk-ent")).toBeNull();
    expect(room.querySelector(".wk-agg")!.textContent).toContain("$46.0MM");

    click(buttons().find((b) => b.textContent === "Confirm"));
    await settle();

    // The commitment change landed: one entry, and the strip is pro forma.
    expect(room.querySelectorAll(".wk-ent")).toHaveLength(1);
    const strip = room.querySelector(".wk-agg")!.textContent ?? "";
    expect(strip).toContain("$49.0MM");
    expect(strip).toContain("was $46.0MM");
    expect(room.querySelector(".wk-man-h")!.textContent).toContain("1 of 7 members");
    // The confirmed chip left a receipt, because the change itself moved right.
    expect(room.querySelector(".wk-receipt")!.textContent).toContain("in the manifest");

    click(room.querySelector(".wk-ent-x")!);
    await settle();

    expect(room.querySelectorAll(".wk-ent")).toHaveLength(0);
    expect(room.querySelector(".wk-agg")!.textContent).toContain("$46.0MM");
    expect(room.querySelector(".wk-agg")!.textContent).not.toContain("was $46.0MM");
    expect(room.querySelector(".wk-man-h")!.textContent).toContain("Nothing staged");
    // The receipt does not lie about where the change is.
    expect(room.querySelector(".wk-receipt")!.textContent).toContain("say it again to restage");
  });

  it("brings the check back into the conversation the moment the confirm trips it", async () => {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();
    click(buttons().find((b) => b.textContent === "Confirm"));
    await settle();

    const verdict = room.querySelector(".wk-vchip");
    expect(verdict?.textContent).toBe("No shortfall");
    // The check is a gate: the spine's Checks step is lit and not settled.
    expect([...room.querySelectorAll(".wk-stg")][2].className).toContain("wk-on");
    click(byText(/^Acknowledge$/));
    expect([...room.querySelectorAll(".wk-stg")][2].className).toContain("wk-done");
  });

  it("takes one decision at a time and says so rather than queueing a second", async () => {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();

    await typeInto(room, "and raise the seasonal line too");
    expect(room.textContent).toContain("One decision at a time");
  });
});

/* =============================================================================
   THE CONVERSATION LOOP.

   Reproduced headless on 2026-08-27, before any of this existed: the banker
   confirmed a chip, the entry landed in the rail, the chip collapsed to a
   receipt — and the room said NOTHING. No acknowledgement, no check, no next
   move, and no approval either, because the approve bar waited on the engine's
   suggestions running out. The manifest filled and the room went quiet, which a
   banker reads as broken rather than as finished.

   Every test below is that failure, held closed.
   ============================================================================= */

describe("no move the banker makes is answered with silence", () => {
  /** The storyline's first beat, confirmed. Two chips arrive; this settles one. */
  async function confirmFirstChip() {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();
    const before = room.querySelectorAll(".wk-msg").length;
    click(buttons().find((b) => b.textContent === "Confirm"));
    await settle();
    return { room, before };
  }

  it("SPEAKS when a chip lands, naming what it did", async () => {
    const { room, before } = await confirmFirstChip();
    // The entry is in the rail AND the room said so. The rail moving on its own
    // is the bug: a manifest that grows in silence reads as nothing happening.
    expect(room.querySelectorAll(".wk-ent")).toHaveLength(1);
    expect(room.querySelectorAll(".wk-msg").length).toBeGreaterThan(before);
    const bubbles = [...room.querySelectorAll(".wk-agent .wk-bub")].map((n) => n.textContent ?? "");
    expect(bubbles.some((t) => /in the manifest/.test(t))).toBe(true);
    // And it ends on the next move rather than trailing off.
    expect(bubbles.some((t) => /Anything else on this facility, or shall I stage it\?/.test(t))).toBe(true);
  });

  it("advances the stepper visibly on the same confirm", async () => {
    const { room } = await confirmFirstChip();
    expect(room.querySelector(".wk-stepper")).toBeTruthy();
    expect([...room.querySelectorAll(".wk-stg")][1].textContent).toContain("1/");
    // The beat's second chip is still open, so the room holds the next move back
    // and SAYS why rather than offering two decisions at once (law 2).
    expect(room.querySelector(".wk-pill")).toBeNull();
    expect(room.querySelector(".wk-gatehint")!.textContent).toMatch(/Acknowledge the checks|Settle the open cards/);
  });

  it("opens the approval on a staged manifest, NOT on the suggestions running out", async () => {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();
    for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
      click(b);
      await settle();
    }
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
    await settle();

    // Two entries staged, nothing waiting on the banker — so the approval is the
    // open move, even though the engine still has moves left to suggest.
    expect(room.querySelectorAll(".wk-ent").length).toBeGreaterThan(0);
    expect(room.querySelector(".wk-pill")).toBeTruthy();
    expect(byText(/^Approve and file /)).toBeTruthy();
    // Both are legitimate next moves, so the room offers both rather than
    // choosing for the banker.
    expect(room.querySelector(".wk-next")!.hasAttribute("disabled")).toBe(false);
  });

  it("answers a discard, because declining a change is a decision too", async () => {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();
    const before = room.querySelectorAll(".wk-msg").length;
    click(buttons().find((b) => b.textContent === "Discard"));
    await settle();
    expect(room.querySelectorAll(".wk-msg").length).toBeGreaterThan(before);
    expect(room.textContent).toContain("the package has not moved");
    expect(room.querySelector(".wk-ent")).toBeNull();
  });

  it("answers a refusal being understood, and leaves the reason on screen", async () => {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();
    for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
      click(b);
      await settle();
    }
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
    click(byText(/construction loan too/));
    await settle();
    const reason = room.querySelector(".wk-refuse .wk-quote")!.textContent;
    click(byText(/^Understood$/));
    await settle();
    expect(room.textContent).toContain("stays off the manifest");
    // Settled, not vanished: the refusal's reason IS the answer, so taking the
    // chip off the screen would take the answer with it.
    expect(room.querySelector(".wk-refuse .wk-quote")!.textContent).toBe(reason);
  });
});

describe("law 7 — the mark is typographic", () => {
  it("draws the lockup as a wordmark plus a kerned glyph, not an SVG", () => {
    const room = open("modify");
    const lockup = room.querySelector(".c360-lockup")!;
    expect(lockup.querySelector("svg")).toBeNull();
    expect(lockup.querySelector(".c360-lockup-word")!.textContent).toBe("accenture");
    const mark = lockup.querySelector<HTMLElement>(".c360-lockup-mark")!;
    expect(mark.textContent).toBe(">");
    // Tight-kerned onto the wordmark: negative, and scaled to the size.
    expect(Number.parseFloat(mark.style.marginLeft)).toBeLessThan(0);
  });

  it("carries the load, step and arrival motif on the same glyph", async () => {
    const room = open("modify");
    click(room.querySelector(".wk-pill")!);
    await settle();
    for (const glyph of room.querySelectorAll(".c360-glyph")) {
      expect(glyph.textContent).toBe(">");
      expect(glyph.querySelector("svg")).toBeNull();
    }
    // The step spine is glyph-led in every stage.
    expect(room.querySelectorAll(".wk-stg .c360-glyph")).toHaveLength(4);
  });
});

describe("law 5 — nothing in the room scrolls", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/workroom.css"), "utf8");

  it("declares no scroll container outside the narrow branch", () => {
    // The one `overflow-y: auto` in the file is the <=1180px branch, which is a
    // single continuous page BY DESIGN and is not held to law 5.
    // Comments explain the rule; only DECLARATIONS can break it.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const narrow = rules.slice(rules.indexOf("@media (max-width: 1180px)"));
    const scrollers = [...rules.matchAll(/overflow(?:-[xy])?:\s*(auto|scroll)/g)];
    expect(scrollers).toHaveLength(1);
    expect(narrow).toContain("overflow-y: auto");
  });

  it("opens every disclosure as a peek that floats over the room", async () => {
    const room = open("modify");
    click(byText(/^Why$/));
    await settle();
    const peek = document.querySelector(".wk-peek-card");
    expect(peek).toBeTruthy();
    // The peek is OUTSIDE the room's own box, so it cannot grow a pane.
    expect(room.contains(peek!)).toBe(false);
    expect(peek!.textContent).toContain("the agent recommends, the banker decides");
  });

  it("locks the page behind the room while it is open", () => {
    open("modify");
    expect(document.body.classList.contains("wk-open")).toBe(true);
  });
});

describe("the closing beat", () => {
  it("files every entry with the org id that proves it, and drafts the reply", async () => {
    const room = open("modify");

    // The whole storyline: two beats of changes, a refusal, then the rest.
    click(byText(/liquidity covenant/));
    await settle();
    for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
      click(b);
      await settle();
    }
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
    click(byText(/construction loan too/));
    await settle();
    click(byText(/^Understood$/));
    click(byText(/pledge the Mazak/));
    await settle();
    for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
      click(b);
      await settle();
    }
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);

    expect(room.querySelectorAll(".wk-ent")).toHaveLength(4);
    const approve = byText(/^Approve and file 4 changes$/);
    expect(approve).toBeTruthy();
    click(approve);
    await settle();

    const filed = [...room.querySelectorAll(".wk-filedbar .wk-id")].map((n) => n.textContent);
    expect(filed).toHaveLength(4);
    expect(filed).toContain("a4Zbb0000027NpMEAU");
    expect(room.querySelector(".wk-tokline")!.textContent).toContain("single use");
    expect(room.textContent).toContain("Hartwell Industrial, operating line increase and equipment facility");
  });

  it("RENEW says booking runs through the bank's own approval process", async () => {
    const room = open("renew");
    click(byText(/Renew at \$2.5MM/));
    await settle();
    for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
      click(b);
      await settle();
    }
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
    click(byText(/construction facility while we are here/));
    await settle();
    click(byText(/^Understood$/));
    click(byText(/Carry the pledge and the covenant/));
    await settle();
    for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
      click(b);
      await settle();
    }
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);

    click(byText(/^Approve and submit 4 terms$/));
    await settle();
    expect(room.querySelector(".wk-handoff")!.textContent).toContain("Submit for Approval");
    expect(room.querySelector(".wk-handoff")!.textContent).toContain("does not book the facility");
    expect(room.querySelector(".wk-filedbar .wk-st")!.textContent).toBe("Submitted");
  });
});

/* =============================================================================
   THE ROOM EXPLAINS ITSELF, AND ADVISES BEFORE IT STAGES.

   Founder verdict 2026-08-29: the room "feels almost more like guided template
   still, no explanation" — "it can explain also concise in the flow what and why
   it is needed."

   The copy is proved in `workroom/explain.test.ts` and the rules in
   `workroom/modifyEngine.test.ts`. What is proved HERE is the reading: advice
   looks like advice and not like a verdict, it never becomes a gate, and taking
   it replaces the change it was about rather than piling a second one on top.
   ============================================================================= */

describe("tier-1 advice, in the room", () => {
  const ADVICE_PACKAGE = "a5Fbb000000ADVICE";

  /** A read built for the rules rather than borrowed from the baked
   *  relationship, so what the advice says is a property of the room and not of
   *  whatever Hartwell happens to hold this week. One booked member, drawn
   *  $9.2MM, with the client's own $20MM ask on the file. */
  function adviceBundle(over: Partial<BorrowerBundle["exposure"]> = {}) {
    return {
      snapshot: {
        accountId: "001bb00001DLtRMAA1",
        name: "Hartwell Precision Manufacturing LLC",
        productPackageId: ADVICE_PACKAGE,
      },
      exposure: {
        totalCommitted: 15_000_000,
        totalOutstanding: 9_200_000,
        facilities: [
          {
            loanId: "a4Zbb000000ADVICE",
            name: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00",
            productType: "Line of Credit",
            productPackageId: ADVICE_PACKAGE,
            stage: "Booked",
            status: "Active",
            committed: 15_000_000,
            outstanding: 9_200_000,
          },
        ],
        ...over,
      },
      requests: [{ id: "r1", ask: { type: "facility_increase", from: 15_000_000, to: 20_000_000 } }],
    } as unknown as BorrowerBundle;
  }

  function openAdvice() {
    const context = contextFor("modify", ADVICE_PACKAGE);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <Workroom
          context={context}
          engine={createModifyEngine({ context, data: live as unknown as C360Data, bundle: adviceBundle() })}
          onClose={() => {}}
        />,
      );
    });
    return document.querySelector<HTMLElement>(".wk-room")!;
  }

  /** Say a line the way a banker does: pick the member off the strip, then talk
   *  about it. The strip IS the way in, so the room already knows which one. */
  async function askForEightMillion(room: HTMLElement) {
    click(room.querySelector(".wk-mchip")!);
    await settle();
    await typeInto(room, "take it to $8,000,000");
  }

  it("says the thing a credit officer would say across the desk, on this read's own figures", async () => {
    const room = openAdvice();
    await askForEightMillion(room);
    const advice = room.querySelector(".wk-advice")!;
    expect(advice.textContent).toContain("$9.20M is already drawn on the Line of Credit");
    expect(advice.textContent).toContain("a limit of $8M does not work as stated");
    expect(advice.getAttribute("data-rule")).toBe("commitment-below-outstanding");
  });

  it("is ADVICE, not a verdict: no verdict chip, no acknowledgement, no gate", async () => {
    const room = openAdvice();
    await askForEightMillion(room);
    // A check carries a coloured verdict chip and an Acknowledge button because
    // it IS a gate. This carries neither, and it sits above a live Confirm.
    expect(room.querySelector(".wk-advice .wk-vchip")).toBeNull();
    expect(byText(/^Acknowledge$/)).toBeUndefined();
    expect(room.querySelector(".wk-advice")!.contains(byText(/^Confirm$/)!)).toBe(false);
    expect(buttons().find((b) => b.textContent === "Confirm")!.disabled).toBe(false);
  });

  it("lets the banker proceed anyway, which is what never blocking means", async () => {
    const room = openAdvice();
    await askForEightMillion(room);
    click(buttons().find((b) => b.textContent === "Confirm"));
    await settle();
    // Staged, and the approval is open — with the advice never acknowledged.
    expect(room.querySelectorAll(".wk-ent")).toHaveLength(1);
    expect(byText(/^Approve and file 1 change$/)).toBeTruthy();
  });

  it("stops being advice once the decision is made", async () => {
    const room = openAdvice();
    await askForEightMillion(room);
    expect(room.querySelector(".wk-advice")).toBeTruthy();
    click(buttons().find((b) => b.textContent === "Confirm"));
    await settle();
    expect(room.querySelector(".wk-advice")).toBeNull();
    expect(room.querySelector(".wk-receipt")).toBeTruthy();
  });

  it("REPLACES the change when the resolution is taken, rather than stacking a second one", async () => {
    const room = openAdvice();
    await askForEightMillion(room);
    click(room.querySelector(".wk-advice-b")!);
    await settle();

    // The proposal the advice was about is gone — settled by the same gesture,
    // so law 2 holds and there is still exactly one decision on the table.
    const chips = [...room.querySelectorAll(".wk-chip")];
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("$20M");
    expect(chips[0].textContent).not.toContain("$8M");
    // And the room did not answer it with "one decision at a time".
    expect(room.textContent).not.toContain("One decision at a time");
    // The banker's own line is in the thread, in the words they clicked.
    expect(room.textContent).toContain("Make it $20M, the client's own ask");
  });

  it("holds the sixty-word budget: nothing here reaches the opening view", () => {
    expect(visibleWords(openAdvice()).length).toBeLessThan(60);
    expect(document.querySelector(".wk-advice")).toBeNull();
  });
});

describe("the WIRED room says why, at the beats that carry a decision", () => {
  const data = live as unknown as C360Data;
  const accountId = "001bb00001I7FPNAA3";

  function openWired() {
    const bundle = data.borrowers![accountId];
    const context = workroomContextFor({ mode: "modify", data, bundle, accountId, accountName: bundle.snapshot!.name! });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <Workroom context={context} engine={createModifyEngine({ context, data, bundle })} onClose={() => {}} />,
      );
    });
    return document.querySelector<HTMLElement>(".wk-room")!;
  }

  it("puts the reason under the check's own figures, quietly", async () => {
    const room = openWired();
    click(room.querySelector(".wk-mchip")!);
    await settle();
    await typeInto(room, "take it to $20,000,000");
    click(buttons().find((b) => b.textContent === "Confirm"));
    await settle();

    const why = room.querySelector(".wk-vwhy")!;
    expect(why.textContent).toContain("does not grow with the commitment");
    // It is the reason BEHIND the verdict, so it sits under the figures rather
    // than competing with them.
    expect(room.querySelector(".wk-vtxt")!.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("leads a refusal with the way through it, and keeps the org's own words as the quote", async () => {
    const room = openWired();
    await typeInto(room, "waive the covenant on the Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00");
    const refusal = room.querySelector(".wk-refuse")!;
    expect(refusal.querySelector(".wk-refuse-why")!.textContent).toContain("Open the covenant review");
    expect(refusal.querySelector(".wk-quote")!.textContent).toMatch(/founder-gated/);
    // The banker's reading comes FIRST; the org's account is the quote below it.
    const why = refusal.querySelector(".wk-refuse-why")!;
    const quote = refusal.querySelector(".wk-quote")!;
    expect(why.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/* =============================================================================
   THREE DEFECTS OFF A LIVE CLICK-THROUGH.

   Each one is a place where the room dropped, refused or garbled something the
   banker had already decided. None of them is in the engine: they are all in
   what the shell does with what the engine hands back.
   ============================================================================= */

/** The storyline's first beat, staged: a pill, its chips confirmed. Leaves the
 *  room with the checks that confirm trips still open. */
async function stageTheFirstBeat() {
  click(byText(/liquidity covenant/));
  await settle();
  for (const b of buttons().filter((x) => x.textContent === "Confirm")) {
    click(b);
    await settle();
  }
}

describe("closing the room does not drop the composed manifest", () => {
  it("picks the manifest up again, and says that it did", async () => {
    const room = open("modify");
    await stageTheFirstBeat();
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
    await settle();
    const staged = room.querySelectorAll(".wk-ent").length;
    expect(staged).toBeGreaterThan(0);

    shut();
    const reopened = open("modify");
    await settle();

    // The rail is where the banker left it, and the room says so rather than
    // presenting it as though it had always been there. (Law 3 is about an
    // OPENING view; a room picking work back up is not one.)
    expect(reopened.querySelectorAll(".wk-ent").length).toBe(staged);
    expect(reopened.textContent).toContain(`Picking up where you left off: ${staged} changes on the manifest.`);
  });

  it("starts clean on a different package, because the anchor is the boundary", async () => {
    open("modify");
    await stageTheFirstBeat();
    shut();

    const elsewhere = open("modify", "a5Fbb000000IHXXEA4");
    await settle();
    expect(elsewhere.querySelector(".wk-ent")).toBeNull();
    expect(elsewhere.textContent).not.toContain("Picking up where you left off");
  });
});

describe("a typed acknowledgment settles the check it is about", () => {
  it("settles the open checks exactly as the button does, and opens the approval", async () => {
    const room = open("modify");
    await stageTheFirstBeat();
    expect(buttons().some((b) => b.textContent === "Acknowledge")).toBe(true);

    await typeInto(room, "acknowledged, proceed");

    // Settled, and the room did not answer a decision with "one decision at a
    // time" — which is what it used to do to the banker who typed it.
    expect(buttons().some((b) => b.textContent === "Acknowledge")).toBe(false);
    expect(room.textContent).not.toContain("One decision at a time");
    const agentBubbles = [...room.querySelectorAll(".wk-agent .wk-bub")].map((n) => n.textContent ?? "");
    expect(agentBubbles.some((t) => /(That check is|Those \d+ checks are) acknowledged\./.test(t))).toBe(true);
    expect(byText(/^Approve and file /)).toBeTruthy();
  });

  it("NEVER settles a confirm or a discard from a sentence", async () => {
    const room = open("modify");
    click(byText(/liquidity covenant/));
    await settle();

    await typeInto(room, "acknowledged");

    // What goes on the manifest is chosen by a gesture on the chip and never by
    // a word in a sentence, so the room holds the line it always held.
    expect(room.textContent).toContain("One decision at a time");
    expect(buttons().some((b) => b.textContent === "Confirm")).toBe(true);
  });
});

describe("a failed execute is a sentence, and it closes the approval", () => {
  /** The transport rejects with a plain failure OBJECT, not an Error. This is
   *  the shape that put "[object Object]" in the thread as the room's whole
   *  answer to an execute the org had in fact completed. */
  function roomThatFailsOnExecute() {
    const context = contextFor("modify");
    const scripted = createScriptedEngine(context);
    const engine: WorkroomEngine = {
      ...scripted,
      execute: async () => {
        throw { code: "TOKEN_REFUSED", server: "customer360" };
      },
    };
    return openWith(context, engine);
  }

  it("says what came back, and never says [object Object]", async () => {
    const room = roomThatFailsOnExecute();
    await stageTheFirstBeat();
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
    await settle();

    click(byText(/^Approve and file /));
    await settle();

    expect(room.textContent).not.toContain("[object Object]");
    expect(room.textContent).toContain("TOKEN_REFUSED");
  });

  it("does not re-arm a button whose retry would bounce on a burnt token", async () => {
    const room = roomThatFailsOnExecute();
    await stageTheFirstBeat();
    for (const b of buttons().filter((x) => x.textContent === "Acknowledge")) click(b);
    await settle();

    click(byText(/^Approve and file /));
    await settle();

    expect(room.textContent).toContain("may have completed despite the error");
    const approve = room.querySelector<HTMLButtonElement>(".wk-approve")!;
    expect(approve.disabled).toBe(true);
    expect(approve.textContent).toBe("Approval closed");
  });
});
