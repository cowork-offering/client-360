// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workroom } from "./components/workroom/Workroom";
import { createScriptedEngine } from "./workroom/engine";
import { createModifyEngine } from "./workroom/modifyEngine";
import { doorFor } from "./workroom/modes";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { C360Data } from "./data/contract";
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

function open(mode: WorkroomMode, packageId?: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const context = contextFor(mode, packageId);
  act(() => {
    // THE SHELL, ON A SHELL ENGINE. Which engine a mode gets is WorkroomHost's
    // decision; what is proved here is the ROOM, so the storyline engine is
    // handed in directly rather than resolved from an app provider.
    root!.render(<Workroom context={context} engine={createScriptedEngine(context)} onClose={() => {}} />);
  });
  return document.querySelector<HTMLElement>(".wk-room")!;
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

  it("opens by name and leads on what the PACKAGE can carry", () => {
    const room = openWired();
    const headline = room.querySelector(".wk-headline")!.textContent ?? "";
    expect(headline).toContain("Hey Fabian.");
    // Founder law 1, applied to the conversation: the package total is the
    // story and the members are the mechanism.
    expect(headline).toContain("All 6 members are booked");
    expect(headline).toContain("$46M is open");
    expect(headline).toMatch(/Pick one\.$/);
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

    const input = room.querySelector<HTMLInputElement>(".wk-txt")!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "and raise the seasonal line too");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(room.querySelector(".wk-send")!);
    await settle();
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
