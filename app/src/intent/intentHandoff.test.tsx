// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "../data/contract";
import { AppProvider } from "../state/appState";
import { AppShell } from "../components/AppShell";
import { __setDbForTests } from "../channel/dbDoor";
import { createFakeDb } from "./fakeDb";
import { readIntentDoc, whisperLine } from "./contract";
import { __resetIntentsForTests, installIntentReadout, intentState, startIntentWatch } from "./store";
import { __resetFeedForTests, feedSnapshot, useRoomFeed } from "./feed";
import { openIntent } from "./open";
import { useFacilityRoom } from "../components/workroom/roomSession";
import { useRelationshipRoom } from "../components/relationship/relSession";
import sample from "../../../artifact/sample-data.json";

/* =============================================================================
   THE INTENT LANE, END TO END, AGAINST A STORE OF THE d.ts SHAPE.

   WHAT THIS PROVES, in the order the banker meets it: the whisper says the one
   sentence in the room's own language; Open navigates, opens the named room
   with the route BOUND and stages the lines; the feed says them ONE AT A TIME
   and STOPS on a room that is holding something; the store is stamped `opened`;
   and — the gate the facility demo rides on — with no store nothing on any
   surface changes at all.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Let the feed's own settle window and React's commits pass. The feed waits a
 *  beat after every line so the room has landed whatever the line produced
 *  before readiness is looked at again. */
const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
};

const PIEDMONT = "001bb00001DLtRMAA1";

const intentBody = (over: Record<string, unknown> = {}) => ({
  accountId: PIEDMONT,
  accountName: "Piedmont Precision Components, Inc.",
  room: "facility",
  route: "modify",
  lines: [
    "increase the 15M line of credit to 20M",
    "add a Debt Service Coverage of Borrower covenant >= 1.30 tested quarterly on the 8M equipment loan",
    "add a 1% origination fee to LOC",
  ],
  context: {
    summary: "James asked us to take the line to $20M and add a DSCR test.",
    source: { kind: "email", id: "AAMk-26", subject: "Line increase", from: "james@hartwell.com", received: "26 Jul 2026" },
  },
  createdAt: "2026-09-02T18:04:00.000Z",
  status: "pending",
  ...over,
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(node: React.ReactNode): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<AppProvider data={sample as unknown as C360Data}>{node}</AppProvider>);
  });
}

beforeEach(() => {
  __resetIntentsForTests();
  __resetFeedForTests();
  __setDbForTests(undefined);
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  __resetIntentsForTests();
  __resetFeedForTests();
  __setDbForTests(undefined);
  sessionStorage.clear();
  vi.useRealTimers();
});

/* ------------------------------------------------------------ the document */

describe("the intent document is DATA", () => {
  it("reads a well-formed intent", () => {
    const doc = readIntentDoc("01J8ZQ", intentBody())!;
    expect(doc.accountId).toBe(PIEDMONT);
    expect(doc.room).toBe("facility");
    expect(doc.route).toBe("modify");
    expect(doc.lines).toHaveLength(3);
    expect(doc.context.source.kind).toBe("email");
  });

  it("refuses a document that names no account, no room route, or no line", () => {
    expect(readIntentDoc("x", intentBody({ accountId: "not-an-id" }))).toBeNull();
    // A relationship route in a facility room is not a route this room binds.
    expect(readIntentDoc("x", intentBody({ route: "covenant" }))).toBeNull();
    expect(readIntentDoc("x", intentBody({ lines: [] }))).toBeNull();
    expect(readIntentDoc("x", intentBody({ lines: [42, null] }))).toBeNull();
    expect(readIntentDoc("x", "increase the line")).toBeNull();
  });

  it("clips rather than refuses a verbose writer, and never executes a field", () => {
    const doc = readIntentDoc("x", intentBody({ lines: ["a".repeat(900)], context: { summary: "b".repeat(2000), source: {} } }))!;
    expect(doc.lines[0].length).toBeLessThanOrEqual(404);
    expect(doc.context.summary.length).toBeLessThanOrEqual(604);
    // An unknown source kind falls back rather than travelling as itself.
    expect(doc.context.source.kind).toBe("chat");
  });

  it("says one sentence in the room's own language", () => {
    const doc = readIntentDoc("01J8ZQ", intentBody())!;
    const line = whisperLine(doc);
    expect(line).toContain("Piedmont Precision");
    expect(line).toContain("the mail of 26 Jul 2026");
    expect(line).toContain("Open the modification?");
  });
});

/* ------------------------------------------------------------- the whisper */

describe("the whisper", () => {
  it("offers a pending intent on the landing, with Open and Later", () => {
    const db = createFakeDb({ "intents/01J8ZQ": intentBody() });
    __setDbForTests(db);
    act(() => {
      startIntentWatch();
    });
    mount(<AppShell />);
    const chip = document.querySelector("#intentWhisper")!;
    expect(chip, "the whisper mounts when an intent is pending").toBeTruthy();
    expect(chip.textContent).toContain("Open the modification?");
    expect(document.querySelector("[data-intent-open]")).toBeTruthy();
    expect(document.querySelector("[data-intent-later]")).toBeTruthy();
  });

  it("holds its tongue on a DIFFERENT relationship's account view", () => {
    const db = createFakeDb({ "intents/01J8ZQ": intentBody({ accountId: "001SAMPLE0000BRWT", accountName: "Brightwater Foods Group" }) });
    __setDbForTests(db);
    act(() => {
      startIntentWatch();
    });
    // Restore straight onto Piedmont: the intent names Brightwater.
    sessionStorage.setItem(
      `c360:ui:${(sample as unknown as C360Data).meta.anchorAccountId}`,
      JSON.stringify({
        v: 5,
        savedAt: Date.now(),
        ui: { view: "account", accountId: PIEDMONT, tab: "activity", panel: "none", draft: "", seenServerCount: 0 },
      }),
    );
    mount(<AppShell />);
    expect(document.querySelector("#intentWhisper")).toBeNull();
  });

  it("Later takes it off the offer for this session without touching the store", () => {
    const db = createFakeDb({ "intents/01J8ZQ": intentBody() });
    __setDbForTests(db);
    act(() => {
      startIntentWatch();
    });
    mount(<AppShell />);
    const later = document.querySelector<HTMLButtonElement>("[data-intent-later]")!;
    act(() => later.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.querySelector("#intentWhisper")).toBeNull();
    expect(db.docs.get("intents/01J8ZQ")!.status).toBe("pending");
  });
});

/* ---------------------------------------------------------------- the open */

describe("Open", () => {
  it("navigates, opens the facility room with the route BOUND, and stages the lines", async () => {
    const db = createFakeDb({ "intents/01J8ZQ": intentBody() });
    __setDbForTests(db);
    act(() => {
      startIntentWatch();
    });
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      (cb as FrameRequestCallback)(0);
      return 1;
    });
    mount(<AppShell />);
    const open = document.querySelector<HTMLButtonElement>("[data-intent-open]")!;
    await act(async () => {
      open.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    raf.mockRestore();

    const feed = feedSnapshot()!;
    expect(feed.room).toBe("facility");
    expect(feed.accountId).toBe(PIEDMONT);
    expect(feed.lines).toEqual(intentBody().lines);
    expect(feed.index, "nothing is said until a room is ready for it").toBe(0);
    // The store is stamped, and stamped ONCE.
    expect(db.docs.get("intents/01J8ZQ")!.status).toBe("opened");
    expect(typeof db.docs.get("intents/01J8ZQ")!.openedAt).toBe("string");
    expect(db.docs.get("intents/01J8ZQ")!.openedBy).toBe("Fabian Goetzens");
    // And it stops being on offer.
    expect(intentState().pending).toHaveLength(0);
    expect(intentState().consumed!.id).toBe("01J8ZQ");
  });

  it("binds the relationship room's route for a relationship intent", async () => {
    const doc = readIntentDoc("01J8ZR", intentBody({ room: "relationship", route: "covenant", lines: ["run the covenant review"] }))!;
    let seen: string | null = null;
    function Probe() {
      const session = useRelationshipRoom();
      seen = session ? `${session.accountId}:${session.route}` : null;
      return null;
    }
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      (cb as FrameRequestCallback)(0);
      return 1;
    });
    mount(<Probe />);
    await act(async () => {
      openIntent({ intent: doc, navigate: () => {} });
    });
    raf.mockRestore();
    expect(seen).toBe(`${PIEDMONT}:covenant`);
    expect(feedSnapshot()!.room).toBe("relationship");
  });

  it("binds the facility room's route rather than leaving the room asking", async () => {
    const doc = readIntentDoc("01J8ZS", intentBody({ route: "renew", lines: ["renew the revolver"] }))!;
    let bound: string | null = null;
    function Probe() {
      const session = useFacilityRoom();
      bound = session?.bound ?? null;
      return null;
    }
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      (cb as FrameRequestCallback)(0);
      return 1;
    });
    mount(<Probe />);
    await act(async () => {
      openIntent({ intent: doc, navigate: () => {} });
    });
    raf.mockRestore();
    expect(bound).toBe("renew");
  });
});

/* ----------------------------------------------------------------- the feed

   THE ROOM'S OWN GATE, STOOD IN FOR. `useRoomFeed` takes the room's honest
   answer to "am I holding anything"; this harness is that answer, driven by
   hand, so the queue discipline is asserted without a 4,000-line room around
   it. The rooms themselves pass the same boolean, derived from their gates. */

/** A room, modelled: it says what it is given, and a line that STAGES leaves it
 *  holding a decision until the banker settles it. That is the only thing the
 *  feed reads about a room, and it is the thing both real rooms compute from
 *  their own gates. */
let releaseRoom: (() => void) | null = null;

function FeedHarness({ said, holds }: { said: string[]; holds: string[] }) {
  const [ready, setReady] = useState(true);
  releaseRoom = () => setReady(true);
  const state = useRoomFeed({
    room: "facility",
    accountId: PIEDMONT,
    ready,
    say: async (line) => {
      said.push(line);
      if (holds.includes(line)) setReady(false);
    },
  });
  return <div data-feed={`${state.index}/${state.total}`} />;
}

describe("the feed", () => {
  it("says the lines in order, one at a time, and STOPS on a line the room holds", async () => {
    const doc = readIntentDoc("01J8ZQ", intentBody())!;
    const said: string[] = [];
    // Line 1 stages a card and line 2 raises chips: both leave the room
    // holding. Line 3 asks a question the banker answers in their own time.
    const holds = [doc.lines[0], doc.lines[1]];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(<FeedHarness said={said} holds={holds} />);
    });

    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      (cb as FrameRequestCallback)(0);
      return 1;
    });
    await act(async () => {
      openIntent({ intent: doc, navigate: () => {} });
    });
    raf.mockRestore();

    // The first line goes through, and stops the queue where it stands.
    await settle();
    await settle();
    expect(said, "a held room is never talked over").toEqual([doc.lines[0]]);
    expect(container!.querySelector("[data-feed]")!.getAttribute("data-feed")).toBe("1/3");

    // The banker confirms the card. The NEXT line, and only the next line.
    await act(async () => releaseRoom!());
    await settle();
    await settle();
    expect(said).toEqual([doc.lines[0], doc.lines[1]]);

    // They pick a chip. The last line lands.
    await act(async () => releaseRoom!());
    await settle();
    expect(said).toEqual(doc.lines);
    expect(container!.querySelector("[data-feed]")!.getAttribute("data-feed")).toBe("3/3");

    // A spent feed says nothing more, forever.
    await settle();
    await settle();
    expect(said).toHaveLength(3);
  });
});

/* --------------------------------------------------------- the no-db world */

describe("with no store", () => {
  it("subscribes to nothing, offers nothing, and renders the cockpit unchanged", () => {
    __setDbForTests(undefined);
    const off = startIntentWatch();
    off();
    expect(intentState().pending).toHaveLength(0);
    expect(intentState().watching).toBe(false);
    mount(<AppShell />);
    expect(document.querySelector("#intentWhisper"), "no store, no whisper").toBeNull();
    // The landing is exactly the landing.
    expect(document.body.textContent).toContain("Needs action");
    expect(document.body.textContent).toContain("Piedmont Precision");
    expect(feedSnapshot()).toBeNull();
  });

  it("the console readout says so rather than throwing", () => {
    installIntentReadout();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = (window as unknown as { c360Intent: () => ReturnType<typeof intentState> }).c360Intent();
    expect(out.pending).toHaveLength(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes("no store on this view"))).toBe(true);
    log.mockRestore();
  });
});
