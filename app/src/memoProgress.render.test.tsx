// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import live from "../../artifact/live-data.json";
import { MemoRoom, type MemoContext, type MemoDeps } from "./components/memo/MemoRoom";
import { memoGreeting, executedRead } from "./components/memo/memoGreeting";
import { createPaneBuffers, type BufferPane, type PaneRole } from "./components/memo/paneBuffer";
import { buildMemoDossier } from "./memo/dossier";
import { renderPlanFor } from "./memo/renderMemo";
import { NOT_WIRED_LINE } from "./memo/publish";
import type { ReviewFrame, ReviewFrameWindow } from "./memo/reviewBridge";
import type { BorrowerBundle, C360Data } from "./data/contract";

/* =============================================================================
   THE ROOM WHILE IT IS WORKING.

   FOUNDER, 2026-09-04: "when it drafts or steers, gentle loading with the >
   getting filled; right now it flickers and updates, not sexy. The chat becomes
   unresponsive during draft or steer; it should be more like a timeline, think
   of when a connector connects in Claude Cowork, elegant, always showing only
   the latest two interactions, and clear that it is working on something."

   FIVE CLAIMS, AND EACH ONE IS A THING THE BANKER CAN SEE.

     1. The work is one live exchange: a timeline of the manifest's sections,
        one row each, moving queued -> writing -> done as the desk answers.
     2. At most two live exchanges stand on the stage; the third settles the
        oldest into a compact row that is still one click from coming back.
     3. A line typed while the draft runs is queued ON the timeline and runs
        when the draft is over. The composer never closes for it.
     4. The pane never blanks: the next document is built in a hidden frame and
        crossfades in at the reader's own scroll offset, sign-offs first.
     5. The section being written is marked in the document the banker is
        reading, and only that one.

   THE NARRATOR IS GATED, which is the whole reason any of this is assertable:
   the suite holds each section open, looks at the timeline, and only then lets
   the desk answer. Nothing below reaches a connector.
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

const data = live as unknown as C360Data;
const HARTWELL = "001bb00001I7FPNAA3";
const PACKAGE = "a5Fbb000000IHFJEA4";
const bundle = data.borrowers![HARTWELL] as BorrowerBundle;

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/* --------------------------------------------------------- the gated desk */

interface Gate {
  /** Every call the room has made and not had answered yet. */
  open: Array<{ prompt: string; settle: (reply: string) => void; fail: () => void }>;
  prompts: string[];
  narrate: MemoDeps["narrate"];
}

function gate(): Gate {
  const g: Gate = {
    open: [],
    prompts: [],
    narrate: ({ prompt }) =>
      new Promise<string>((resolve, reject) => {
        g.prompts.push(prompt);
        g.open.push({
          prompt,
          settle: (reply) => resolve(reply),
          fail: () => reject(new Error("the desk did not answer")),
        });
      }),
  };
  return g;
}

/** Let the desk answer the call it is holding, and let React settle after it. */
async function answer(g: Gate, reply = "The recommendation is to approve the increase.") {
  const call = g.open.shift();
  expect(call).toBeTruthy();
  await act(async () => {
    call!.settle(reply);
    await tick();
  });
}

/** The desk declined this one. The memo keeps its own pending placeholder. */
async function decline(g: Gate) {
  const call = g.open.shift();
  expect(call).toBeTruthy();
  await act(async () => {
    call!.fail();
    await tick();
  });
}

const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/* ------------------------------------------------------------- the mount */

const ctxFor = (over: Partial<MemoContext> = {}): MemoContext => ({
  accountId: HARTWELL,
  accountName: "Hartwell Precision Manufacturing LLC",
  packageId: PACKAGE,
  packageName: "Hartwell C&I Credit Package",
  trigger: "modify",
  user: "Fabian Goetzens",
  generatedAt: "2026-09-04T09:12:00Z",
  source: null,
  ...over,
});

interface Mounted {
  room: HTMLElement;
  /** Open the memo the pane is showing as the frame it is being read in. */
  attach: () => ReviewFrame;
}

function openRoom(deps: Partial<MemoDeps> = {}): Mounted {
  const executed = executedRead([], PACKAGE);
  const dossier = buildMemoDossier({
    bundle,
    changes: [],
    instanceUrl: data.meta?.instanceUrl ?? null,
    productPackageName: "Hartwell C&I Credit Package",
  });
  const greeting = memoGreeting({
    packageId: PACKAGE,
    trigger: "modify",
    executed,
    carried: null,
    carriedSplit: null,
    plan: renderPlanFor(dossier),
    hasStoredMemo: false,
  });

  const base: MemoDeps = {
    publish: async (d) => ({
      memoId: d.memoId,
      packageId: d.packageId,
      status: "not-wired" as const,
      lanes: [],
      reason: NOT_WIRED_LINE,
    }),
    save: async (d) => d,
    ...deps,
  };

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const paint = (extra: Partial<MemoDeps> = {}) => {
    act(() => {
      root!.render(
        <MemoRoom
          ctx={ctxFor()}
          dossier={dossier}
          changes={[]}
          greeting={greeting}
          latest={null}
          deps={{ ...base, ...extra }}
          onClose={() => {}}
        />,
      );
    });
  };
  paint();

  const attach = (): ReviewFrame => {
    const srcdoc = document.querySelector<HTMLIFrameElement>(".mm-doc")!.getAttribute("srcdoc")!;
    const doc = new DOMParser().parseFromString(srcdoc, "text/html");
    const win: ReviewFrameWindow = {};
    for (const script of [...doc.querySelectorAll("script")].slice(-2)) {
      new Function("window", "document", script.textContent ?? "")(win, doc);
    }
    const frame: ReviewFrame = { doc, win };
    paint({ frame });
    return frame;
  };

  return { room: document.querySelector<HTMLElement>(".mm-room")!, attach };
}

const click = async (el: Element | null) => {
  await act(async () => {
    (el as HTMLButtonElement).click();
    await tick();
  });
};

const draftChip = (room: HTMLElement) =>
  [...room.querySelectorAll<HTMLElement>(".mm-chip")].find((c) => text(c) === "Draft")!;

/** Type into the controlled composer the way React sees it. */
async function type(room: HTMLElement, value: string) {
  const input = room.querySelector<HTMLInputElement>(".wk-txt")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await tick();
  });
}

const rows = (room: HTMLElement) => [...room.querySelectorAll<HTMLElement>(".mm-tl-row")];
const states = (room: HTMLElement) => rows(room).map((r) => r.dataset.state);

/* ========================================================== THE TIMELINE */

describe("the working exchange", () => {
  it("is a timeline of the sections, moving one row at a time", async () => {
    const g = gate();
    const { room } = openRoom({ narrate: g.narrate });
    await click(draftChip(room));

    /* THE WHOLE SHAPE OF THE WORK IS ON THE GLASS FROM THE FIRST FRAME. Every
       section the render plan switched on has a row, in the order the memo
       will print them, and the first of them is already being written. */
    const all = rows(room);
    expect(all.length).toBeGreaterThan(3);
    expect(states(room)[0]).toBe("writing");
    expect(states(room).slice(1).every((s) => s === "queued")).toBe(true);

    // The lead line names the package and counts the work (founder's own line).
    expect(text(room.querySelector(".mm-work-lead"))).toBe(
      `Drafting the memo for Hartwell C&I Credit Package: 0 of ${all.length} sections`,
    );
    // The row being written carries the rooms' own breathing mark, filling.
    expect(all[0].querySelector(".liquidmark")).toBeTruthy();
    expect(all[0].querySelector(".mm-tl-fill")).toBeTruthy();
    expect(all[1].querySelector(".liquidmark")).toBeNull();

    await answer(g);

    // ONE ROW MOVES. The first is done and carries the seconds it took; the
    // second has taken the mark over; nothing else changed.
    expect(states(room)[0]).toBe("done");
    expect(states(room)[1]).toBe("writing");
    expect(text(rows(room)[0].querySelector(".mm-tl-s"))).toMatch(/^\d+(\.\d)? s$/);
    expect(rows(room)[1].querySelector(".liquidmark")).toBeTruthy();
    expect(text(room.querySelector(".mm-work-lead"))).toContain(`1 of ${all.length} sections`);

    /* AND THE LINE ABOVE THE PANE READS THE SAME STATE. One fact, two places,
       never two counts (requirement 5). */
    expect(text(room.querySelector(".mm-prog"))).toBe(`Drafting: 1 of ${all.length} sections`);
  });

  it("says pending on a section the desk did not answer, and never a check", async () => {
    const g = gate();
    const { room } = openRoom({ narrate: g.narrate });
    await click(draftChip(room));
    await decline(g);

    expect(states(room)[0]).toBe("missed");
    expect(text(rows(room)[0].querySelector(".mm-tl-s"))).toBe("pending");
  });

  it("settles into the rooms' compact row when the draft is done, and stays summonable", async () => {
    const g = gate();
    const { room } = openRoom({ narrate: g.narrate });
    await click(draftChip(room));
    const total = rows(room).length;
    while (g.open.length) await answer(g);

    /* THE WORK LEAVES THE STAGE UNDER ONE RECEIPT, in the settle choreography
       every other exchange in every other room uses. */
    const row = [...room.querySelectorAll<HTMLElement>(".wk-settled")].find((r) => text(r).includes("Drafted"))!;
    expect(row).toBeTruthy();
    expect(text(row)).toMatch(new RegExp(`^Drafted ${total} sections in \\d+(\\.\\d)? s·written`));

    // The exchange itself is off the stage and still mounted.
    const timeline = room.querySelector<HTMLElement>(".mm-work")!.closest(".wk-ex") as HTMLElement;
    expect(timeline.dataset.settleState).toBe("settled");

    // And one click brings the whole thing back.
    await click(row);
    expect(timeline.dataset.settleState).toBe("shown");
    expect(row.getAttribute("aria-expanded")).toBe("true");

    // The room says one sentence about what to do next, in its own bubble.
    expect(text(room.querySelector(".wk-thread"))).toContain("The memo is drafted.");
  });
});

/* ========================================================= THE STAGE CAP */

describe("the stage cap", () => {
  it("keeps two live exchanges and settles the oldest of three", async () => {
    const { room } = openRoom();
    const settled = () => [...room.querySelectorAll<HTMLElement>(".wk-settled")];

    // The greeting is the first exchange and it is alone on the stage.
    expect(settled()).toHaveLength(0);
    const lead = text(room.querySelector(".wk-thread .wk-bub"));

    // Two more exchanges: a line that names no section is still an exchange.
    await type(room, "make it better");
    expect(settled()).toHaveLength(0);
    await type(room, "polish it please");

    /* THE THIRD ARRIVES AND THE OLDEST GOES. Mounted, one row, summonable,
       never spliced out, because an absence contract has to be able to tell
       "settled away" from "never happened". */
    expect(settled()).toHaveLength(1);
    expect(text(settled()[0])).toContain(lead.slice(0, 24));
    expect(room.querySelectorAll('.wk-ex[data-settle-state="settled"]').length).toBeGreaterThan(0);
    expect(room.querySelectorAll('.wk-thread > .wk-ex[data-settle-state="on"]').length).toBeGreaterThan(0);
  });

  it("collapses the greeting to one line the moment a draft starts", async () => {
    const g = gate();
    const { room } = openRoom({ narrate: g.narrate });
    const lead = text(room.querySelector(".wk-thread .wk-bub"));
    await click(draftChip(room));

    const row = room.querySelector<HTMLElement>(".wk-settled")!;
    expect(text(row)).toContain(lead.slice(0, 24));
    expect(text(row)).toContain("read");
  });
});

/* ====================================================== THE LIVE COMPOSER */

describe("the composer during a draft", () => {
  it("stays open, and a line typed into it joins the timeline as the next thing", async () => {
    const g = gate();
    const { room } = openRoom({ narrate: g.narrate });
    await click(draftChip(room));

    // NEVER DISABLED WHILE THE ROOM WORKS (founder, 2026-09-04).
    expect(room.querySelector<HTMLInputElement>(".wk-txt")!.disabled).toBe(false);
    expect(room.querySelector<HTMLInputElement>(".wk-txt")!.placeholder).toContain("when this finishes");

    await type(room, "tighten the covenant paragraph");

    const queued = rows(room).filter((r) => r.dataset.kind === "steer");
    expect(queued).toHaveLength(1);
    expect(queued[0].dataset.state).toBe("queued");
    expect(text(queued[0])).toContain("after the draft: tighten the covenant paragraph");
    // It is not a bubble and it did not open an exchange of its own.
    expect(text(room.querySelector(".wk-thread"))).not.toContain("Rewriting Covenant");
  });

  it("runs the queued line once the draft is over, and no sooner", async () => {
    const g = gate();
    const { room } = openRoom({ narrate: g.narrate });
    await click(draftChip(room));
    const sections = rows(room).filter((r) => r.dataset.kind === "section").length;
    await type(room, "tighten the covenant paragraph");

    // Every section of the draft, and not one call more.
    for (let i = 0; i < sections; i++) await answer(g);

    /* THE STEER IS THE CALL AFTER THE LAST SECTION, never one in the middle of
       them: the draft was not interrupted and the line was not swallowed. */
    expect(g.prompts).toHaveLength(sections + 1);
    expect(g.prompts[sections]).toContain("The banker asked for this specifically: tighten the covenant paragraph");
    expect(g.open).toHaveLength(1);

    // And it is its own working exchange, with one row in it.
    const live = room.querySelector<HTMLElement>('.wk-ex[data-settle-state="on"] .mm-work[data-work="steer"]')!;
    expect(live).toBeTruthy();
    expect(live.querySelectorAll(".mm-tl-row")).toHaveLength(1);
    expect(text(live.querySelector(".mm-work-lead"))).toContain("Rewriting");

    await answer(g);
    const row = [...room.querySelectorAll<HTMLElement>(".wk-settled")].find((r) => text(r).startsWith("Rewrote"))!;
    expect(row).toBeTruthy();
  });

  it("ignores a second Draft while one is running, and says nothing about it", async () => {
    const g = gate();
    const { room } = openRoom({ narrate: g.narrate });
    await click(draftChip(room));
    const said = text(room.querySelector(".wk-thread"));
    const calls = g.prompts.length;

    await click(draftChip(room));

    expect(g.prompts).toHaveLength(calls);
    expect(rows(room).filter((r) => r.dataset.state === "writing")).toHaveLength(1);
    expect(text(room.querySelector(".wk-thread"))).toBe(said);
  });
});

/* ==================================================== THE DOUBLE BUFFER */

/** A frame, as `paneBuffer.ts` sees one, with the load in the test's hand. */
function fakePane(name: string, log: string[]) {
  let loaded: (() => void) | null = null;
  const pane: BufferPane & { html: string | null; top: number; roleNow: PaneRole; load: () => void } = {
    html: null,
    top: 0,
    roleNow: "hidden",
    write: (html) => {
      pane.html = html;
      log.push(`${name}:write`);
    },
    onLoad: (cb) => {
      loaded = cb;
      return () => {
        loaded = null;
      };
    },
    scrollTop: () => pane.top,
    scrollTo: (top) => {
      pane.top = top;
      log.push(`${name}:scroll=${top}`);
    },
    role: (role) => {
      pane.roleNow = role;
      log.push(`${name}:${role}`);
    },
    load: () => loaded?.(),
  };
  return pane;
}

describe("the double-buffered pane", () => {
  it("never replaces the visible document until the hidden one has loaded", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    const ready: string[] = [];
    const timers: Array<() => void> = [];
    const buf = createPaneBuffers({
      panes: [a, b],
      fadeMs: 240,
      timer: { set: (fn) => timers.push(fn), clear: () => {} },
      onReady: (_p, i) => {
        ready.push(`ready:${i}`);
        log.push(`ready:${i}`);
      },
    });

    buf.present("<html>one</html>");
    a.load();
    expect(a.html).toBe("<html>one</html>");
    expect(a.roleNow).toBe("visible");
    expect(ready).toEqual(["ready:0"]);

    // The reader is halfway down the covenant table.
    a.top = 640;

    buf.present("<html>two</html>");
    /* THE SECOND DOCUMENT IS BUILT WHERE NOBODY IS LOOKING. Until it loads the
       visible frame still holds the FIRST one: nothing was blanked. */
    expect(b.html).toBe("<html>two</html>");
    expect(a.html).toBe("<html>one</html>");
    expect(a.roleNow).toBe("visible");
    expect(b.roleNow).toBe("hidden");
    expect(buf.visible()).toBe(0);

    b.load();

    /* THE ORDER IS THE WHOLE POINT: scroll copied, then the room's own business
       with the document (rebinding the review bridge, replaying the sign-offs),
       and only then is it on the glass. */
    expect(log.slice(-4)).toEqual(["b:write", "b:scroll=640", "ready:1", "b:arriving"]);
    expect(ready).toEqual(["ready:0", "ready:1"]);
    expect(b.top).toBe(640);
    expect(buf.visible()).toBe(1);
    // Both are on the glass for the length of the dissolve; neither is blank.
    expect(a.roleNow).toBe("visible");
    expect(b.roleNow).toBe("arriving");

    timers.pop()!();
    expect(a.roleNow).toBe("hidden");
    expect(b.roleNow).toBe("visible");
  });

  it("supersedes a document nobody will ever see rather than queueing a swap", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    const buf = createPaneBuffers({ panes: [a, b], reduced: true });

    buf.present("<html>one</html>");
    a.load();
    buf.present("<html>two</html>");
    buf.present("<html>three</html>");
    expect(b.html).toBe("<html>three</html>");

    b.load();
    expect(buf.shown()).toBe("<html>three</html>");
    expect(buf.visible()).toBe(1);
    // Reduced motion is a swap and not a dissolve: nothing is ever `arriving`.
    expect(log.filter((l) => l.endsWith(":arriving"))).toHaveLength(0);
  });

  it("says the same document twice without touching the glass", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    const buf = createPaneBuffers({ panes: [a, b], reduced: true });
    buf.present("<html>one</html>");
    a.load();
    const at = log.length;
    buf.present("<html>one</html>");
    expect(log.length).toBe(at);
    expect(b.html).toBeNull();
  });
});

/* =================================================== THE WRITING MARKER */

describe("the writing marker in the document", () => {
  it("marks the section being written, and only that one", async () => {
    const g = gate();
    const { room, attach } = openRoom({ narrate: g.narrate });
    const frame = attach();
    const marked = () => [...frame.doc.querySelectorAll<HTMLElement>("section.mm-writing")].map((s) => s.dataset.mod);

    expect(marked()).toEqual([]);

    await click(draftChip(room));
    const first = rows(room)[0].dataset.row!;
    expect(marked()).toEqual([first]);

    /* AND THE READER SEES WHERE THE WORDS WILL LAND, beside the section's own
       title, in the document rather than only in the chat. */
    const tag = frame.doc.querySelector(`section[data-mod="${first}"] .section-header .mm-writing-tag`);
    expect(text(tag)).toBe("writing");

    await answer(g);
    const second = rows(room)[1].dataset.row!;
    expect(marked()).toEqual([second]);
    expect(frame.doc.querySelectorAll(".mm-writing-tag")).toHaveLength(1);

    while (g.open.length) await answer(g);
    // The work is over, so nothing in the memo is being written any more.
    expect(marked()).toEqual([]);
    expect(frame.doc.querySelectorAll(".mm-writing-tag")).toHaveLength(0);
  });
});
