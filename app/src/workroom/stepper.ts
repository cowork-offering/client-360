/* =============================================================================
   THE STEP SPINE.

   Understand › Compose › Checks › Approve, and its two vocabulary variants. It
   is a progress spine under a conversation, never a form wizard: NOTHING in it
   is clickable, and every advance is DERIVED from something the banker said or
   confirmed. That is why this is a pure function of what has happened rather
   than a state machine anyone can drive from the outside.
   ============================================================================= */

export type StageState = "idle" | "on" | "done";

export interface StepperInputs {
  /** The banker opened the conversation. Understand is settled at that moment. */
  conversationOpen: boolean;
  /** Entries in the manifest rail. */
  landed: number;
  /** What Compose counts up to, from the mode's script. */
  composeTarget: number;
  /** Checks that have arrived in the thread. */
  checksArrived: number;
  /** Checks the banker has acknowledged. */
  checksAcked: number;
  /** The approval is the open move. */
  approvalOpen: boolean;
  /** The plan ran. */
  filed: boolean;
}

export interface StepperView {
  stages: [StageState, StageState, StageState, StageState];
  /** The count Compose carries, e.g. "2/4". Null once Compose is settled. */
  composeCount: string | null;
  /** How far the rail under the spine has travelled, 0-100. */
  railPercent: number;
}

export function stepperState(input: StepperInputs): StepperView {
  const understand: StageState = input.conversationOpen ? "done" : "on";

  const composeSettled = input.landed >= input.composeTarget;
  const compose: StageState = !input.conversationOpen ? "idle" : composeSettled ? "done" : "on";

  // A CHECK IS SETTLED WHEN EVERY ONE THAT ARRIVED HAS BEEN ACKNOWLEDGED. The
  // mock counted to two because its storyline trips exactly two; counting to
  // what actually arrived is the same rule without the storyline baked in.
  //
  // A composition that trips NOTHING settles when the approval opens: the step
  // is "no check was raised", not a step the room stalls on forever.
  let checks: StageState = "idle";
  if (input.checksArrived > 0) {
    checks = input.checksAcked >= input.checksArrived ? "done" : "on";
  } else if (input.approvalOpen) {
    checks = "done";
  }

  const approve: StageState = input.filed ? "done" : input.approvalOpen ? "on" : "idle";

  const stages: [StageState, StageState, StageState, StageState] = [understand, compose, checks, approve];
  const done = stages.filter((s) => s === "done").length;

  return {
    stages,
    composeCount: compose === "on" ? `${input.landed}/${input.composeTarget}` : null,
    railPercent: Math.round((done / stages.length) * 100),
  };
}
