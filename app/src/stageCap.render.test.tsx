// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { REVEAL_MS, STAGE_CAP, useStageGate } from "./components/workroom/stage";

/* =============================================================================
   THE STAGE CAP.

   Founder, 2026-09-03: at most TWO live exchanges on stage at any time. Nothing
   new enters while two are live; what does not fit queues and releases as the
   stage clears.

   WHAT THESE HOLD:

     THE CAP      a third moment does not land while two are waiting on the
                  banker. It is not dropped: it is held.
     IN ORDER     the queue releases first in, first out. A room that reordered
                  what it was about to ask would be worse than one that dumped.
     ONE AT A TIME the stage clearing by two does not land two in one frame.
                  The beat between them is what makes an arrival a sequence.
     THE CAP IS   under reduced motion the BEAT is zero and the cap still holds:
     CONTENT      a reader who asked for no animation did not ask for three
                  questions at once.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** A stand-in room: `live` is what is waiting on the banker, `landed` is what
 *  the gate has let through. Nothing here is a workroom; the gate is shared by
 *  both rooms and this is the shape both of them hand it. */
function harness(reduced: boolean) {
  const api: {
    enqueue: (label: string) => void;
    settleOne: () => void;
    landed: string[];
    live: number;
  } = { enqueue: () => {}, settleOne: () => {}, landed: [], live: 0 };

  function Room() {
    const [landed, setLanded] = useState<string[]>([]);
    const [settled, setSettled] = useState(0);
    const live = Math.max(0, landed.length - settled);
    const gate = useStageGate({ live, reduced });
    api.enqueue = (label) => gate.enqueue(() => setLanded((prev) => [...prev, label]));
    api.settleOne = () => setSettled((n) => n + 1);
    api.landed = landed;
    api.live = live;
    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Room />));
  return api;
}

describe("the stage never holds more than two live exchanges", () => {
  it("holds the third back, and releases it when one settles", () => {
    const room = harness(true);

    act(() => room.enqueue("a"));
    act(() => room.enqueue("b"));
    act(() => room.enqueue("c"));

    // TWO ON STAGE. The third is not lost, it is waiting.
    expect(room.landed).toEqual(["a", "b"]);
    expect(room.live).toBe(STAGE_CAP);

    act(() => room.settleOne());
    expect(room.landed).toEqual(["a", "b", "c"]);
  });

  it("drains in order, one at a time, as the stage clears", () => {
    const room = harness(true);
    act(() => room.enqueue("a"));
    act(() => room.enqueue("b"));
    act(() => room.enqueue("c"));
    act(() => room.enqueue("d"));
    expect(room.landed).toEqual(["a", "b"]);

    act(() => room.settleOne());
    expect(room.landed).toEqual(["a", "b", "c"]);
    act(() => room.settleOne());
    expect(room.landed).toEqual(["a", "b", "c", "d"]);
  });

  it("does not land two in one frame when the stage clears by two", () => {
    const room = harness(false);
    act(() => room.enqueue("a"));
    act(() => room.enqueue("b"));
    act(() => room.enqueue("c"));
    act(() => room.enqueue("d"));
    expect(room.landed).toEqual(["a", "b"]);

    // Both settle at once. ONE arrives; the other waits its beat.
    act(() => {
      room.settleOne();
      room.settleOne();
    });
    expect(room.landed).toEqual(["a", "b", "c"]);
  });

  it("keeps the cap under reduced motion, where the beat is zero", () => {
    const room = harness(true);
    for (const label of ["a", "b", "c", "d"]) act(() => room.enqueue(label));
    expect(room.landed).toHaveLength(STAGE_CAP);
  });

  it("names a beat inside the founder's own cadence", () => {
    expect(REVEAL_MS).toBeGreaterThanOrEqual(250);
    expect(REVEAL_MS).toBeLessThanOrEqual(400);
  });
});
