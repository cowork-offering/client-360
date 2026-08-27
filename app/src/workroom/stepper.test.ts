import { describe, expect, it } from "vitest";
import { stepperState, type StepperInputs } from "./stepper";

/* =============================================================================
   THE SPINE IS DERIVED, NEVER DRIVEN.

   Nothing in the step spine is clickable, so every one of these advances comes
   from something the banker said or confirmed. That is exactly what a pure
   function of the room's own facts can be held to.
   ============================================================================= */

const AT_ENTRY: StepperInputs = {
  conversationOpen: false,
  landed: 0,
  composeTarget: 4,
  checksArrived: 0,
  checksAcked: 0,
  approvalOpen: false,
  filed: false,
};

const at = (over: Partial<StepperInputs>) => stepperState({ ...AT_ENTRY, ...over });

describe("the step spine", () => {
  it("opens on Understand alone, with nothing else lit", () => {
    const s = at({});
    expect(s.stages).toEqual(["on", "idle", "idle", "idle"]);
    expect(s.composeCount).toBeNull();
    expect(s.railPercent).toBe(0);
  });

  it("settles Understand and lights Compose when the conversation opens", () => {
    const s = at({ conversationOpen: true });
    expect(s.stages).toEqual(["done", "on", "idle", "idle"]);
    expect(s.composeCount).toBe("0/4");
    expect(s.railPercent).toBe(25);
  });

  it("ticks the Compose count per confirmed change", () => {
    expect(at({ conversationOpen: true, landed: 2 }).composeCount).toBe("2/4");
    expect(at({ conversationOpen: true, landed: 3 }).composeCount).toBe("3/4");
  });

  it("settles Compose at the mode's own target and drops the count", () => {
    const s = at({ conversationOpen: true, landed: 4 });
    expect(s.stages[1]).toBe("done");
    expect(s.composeCount).toBeNull();
  });

  it("re-opens Compose when a removal takes the rail back under the target", () => {
    const s = at({ conversationOpen: true, landed: 3, checksArrived: 2, checksAcked: 2 });
    expect(s.stages[1]).toBe("on");
    expect(s.composeCount).toBe("3/4");
  });

  it("lights Checks the moment one arrives and settles it when every one is acknowledged", () => {
    expect(at({ conversationOpen: true, landed: 1, checksArrived: 1 }).stages[2]).toBe("on");
    expect(at({ conversationOpen: true, landed: 2, checksArrived: 2, checksAcked: 1 }).stages[2]).toBe("on");
    expect(at({ conversationOpen: true, landed: 2, checksArrived: 2, checksAcked: 2 }).stages[2]).toBe("done");
  });

  it("does not stall on Checks when the composition tripped none", () => {
    // A mode whose confirms raise nothing still has to reach its approval.
    const s = at({ conversationOpen: true, landed: 3, composeTarget: 3, approvalOpen: true });
    expect(s.stages[2]).toBe("done");
    expect(s.stages[3]).toBe("on");
  });

  it("settles Compose once the manifest is ready to approve, short of the target", () => {
    // The target is what the room EXPECTS to compose, never a quota. A banker
    // who staged the one change they came in for and can file it is done
    // composing; a spine reading "Compose 1/3" beside a live Approve told them
    // they were two moves short of something already on the table.
    const s = at({ conversationOpen: true, landed: 1, composeTarget: 3, approvalOpen: true });
    expect(s.stages[1]).toBe("done");
    expect(s.composeCount).toBeNull();
    expect(s.stages[3]).toBe("on");
  });

  it("keeps Compose open while the manifest is still empty", () => {
    // Nothing staged is nothing to approve, so an empty rail never settles the
    // step by claiming an approval that cannot be open.
    const s = at({ conversationOpen: true, landed: 0, composeTarget: 3, approvalOpen: true });
    expect(s.stages[1]).toBe("on");
    expect(s.composeCount).toBe("0/3");
  });

  it("carries the rail to full only when the plan has run", () => {
    const open = at({ conversationOpen: true, landed: 4, checksArrived: 2, checksAcked: 2, approvalOpen: true });
    expect(open.railPercent).toBe(75);
    const filed = at({ conversationOpen: true, landed: 4, checksArrived: 2, checksAcked: 2, filed: true });
    expect(filed.stages[3]).toBe("done");
    expect(filed.railPercent).toBe(100);
  });
});
