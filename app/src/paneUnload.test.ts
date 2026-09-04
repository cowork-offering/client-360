import { describe, expect, it } from "vitest";
import { createPaneBuffers, type BufferPane, type PaneRole } from "./components/memo/paneBuffer";

/* =============================================================================
   TWO FRAMES, ONE DOCUMENT: AND ONLY ONE DOCUMENT RESIDENT.

   FOUNDER, 2026-09-04: the room "gets delayed" while it drafts.

   THE PANE NEEDS TWO FRAMES to swap without blanking, and that is settled. What
   it does not need is two MEMOS resident: a credit memo is a long document with
   its own stylesheet, its own layout and its own compositor layers, and a
   seven-section draft was keeping the last one alive behind the current one for
   the whole of the draft.

   SO THE LOSER IS EMPTIED, AND THE ORDER IS THE CLAIM. The unload happens after
   the arriving frame is on the glass, never during the dissolve: a frame
   emptied mid-fade is exactly the white flash the buffer exists to remove.
   ============================================================================= */

interface Fake extends BufferPane {
  html: string;
  roleNow: PaneRole;
  unloaded: number;
  load: () => void;
}

function fakePane(name: string, log: string[]): Fake {
  let cb: (() => void) | null = null;
  const pane: Fake = {
    html: "",
    roleNow: "hidden",
    unloaded: 0,
    write: (html) => {
      pane.html = html;
      log.push(`${name}:write`);
    },
    onLoad: (fn) => {
      cb = fn;
      return () => {
        cb = null;
      };
    },
    scrollTop: () => 0,
    scrollTo: () => {},
    role: (role) => {
      pane.roleNow = role;
      log.push(`${name}:${role}`);
    },
    unload: () => {
      pane.html = "";
      pane.unloaded += 1;
      log.push(`${name}:unload`);
    },
    load: () => cb?.(),
  };
  return pane;
}

describe("the frame that lost is emptied", () => {
  it("drops the outgoing document only after the new one is on the glass", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    const timers: Array<() => void> = [];
    const buf = createPaneBuffers({
      panes: [a, b],
      fadeMs: 240,
      timer: { set: (fn) => timers.push(fn), clear: () => {} },
    });

    buf.present("<html>one</html>");
    a.load();
    expect(a.html).toBe("<html>one</html>");

    buf.present("<html>two</html>");
    b.load();

    /* MID-DISSOLVE: both documents are still there. Emptying the outgoing one
       here is the flash. */
    expect(a.html).toBe("<html>one</html>");
    expect(a.unloaded).toBe(0);
    expect(b.roleNow).toBe("arriving");

    timers.pop()!(); // the dissolve ends

    expect(b.roleNow).toBe("visible");
    expect(a.roleNow).toBe("hidden");
    expect(a.unloaded).toBe(1);
    expect(a.html).toBe("");
    // The order, stated: the arriving frame is on the glass BEFORE anything is
    // dropped behind it.
    expect(log.slice(-3)).toEqual(["a:hidden", "b:visible", "a:unload"]);
  });

  it("empties in the same commit where there is no dissolve", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    const buf = createPaneBuffers({ panes: [a, b], reduced: true, timer: { set: () => 0, clear: () => {} } });

    buf.present("<html>one</html>");
    a.load();
    buf.present("<html>two</html>");
    b.load();

    expect(b.roleNow).toBe("visible");
    expect(a.unloaded).toBe(1);
    expect(a.html).toBe("");
  });

  it("never empties the frame the reader is looking at", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    const timers: Array<() => void> = [];
    const buf = createPaneBuffers({
      panes: [a, b],
      fadeMs: 240,
      timer: { set: (fn) => timers.push(fn), clear: () => {} },
    });

    buf.present("<html>one</html>");
    a.load();
    buf.present("<html>two</html>");
    b.load();
    timers.pop()!();

    expect(b.html).toBe("<html>two</html>");
    expect(b.unloaded).toBe(0);
    expect(buf.shown()).toBe("<html>two</html>");
  });

  /* THE PANE SAYS WHEN IT IS READY FOR MORE. The memo room reads this before it
     spends a frame rebuilding the document: a live preview that regenerates
     faster than the browser can parse is a queue, not a preview. */
  it("reports that a document is still being parsed", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    const timers: Array<() => void> = [];
    const buf = createPaneBuffers({
      panes: [a, b],
      fadeMs: 240,
      timer: { set: (fn) => timers.push(fn), clear: () => {} },
    });

    expect(buf.pending()).toBe(false);
    // THE FIRST DOCUMENT COUNTS, and it is the longest parse of the session.
    buf.present("<html>one</html>");
    expect(buf.pending()).toBe(true);
    a.load();
    expect(buf.pending()).toBe(false);

    buf.present("<html>two</html>");
    expect(buf.pending()).toBe(true);
    // A second present while one is in flight supersedes it; still one parse.
    buf.present("<html>three</html>");
    expect(buf.pending()).toBe(true);
    b.load();
    expect(buf.pending()).toBe(false);
    timers.pop()?.();
    expect(buf.shown()).toBe("<html>three</html>");
  });

  /* A PANE THAT CANNOT UNLOAD KEEPS ITS DOCUMENT. The capability is optional so
     the suite's other fakes, and any future pane that is not an iframe, are
     unchanged by this. */
  it("works against a pane with no unload at all", () => {
    const log: string[] = [];
    const a = fakePane("a", log);
    const b = fakePane("b", log);
    delete (a as Partial<Fake>).unload;
    const timers: Array<() => void> = [];
    const buf = createPaneBuffers({
      panes: [a, b],
      fadeMs: 240,
      timer: { set: (fn) => timers.push(fn), clear: () => {} },
    });

    buf.present("<html>one</html>");
    a.load();
    buf.present("<html>two</html>");
    b.load();
    expect(() => timers.pop()!()).not.toThrow();
    expect(b.roleNow).toBe("visible");
  });
});
