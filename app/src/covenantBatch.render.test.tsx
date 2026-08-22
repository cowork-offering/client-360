// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { ConfirmGate } from "./components/ConfirmGate";
import { StepTracker } from "./components/StepTracker";
import { initTracker } from "./actions/tracker";
import type { StagedOutput } from "./actions/stagedPlan";
import type { ExecuteResult } from "./channel/writeTools";
import sample from "../../artifact/sample-data.json";
import covenantEnvelopes from "./actions/observed-covenant-bulk-envelopes.json";

/* =============================================================================
   WHAT THE BANKER SEES for a package-scoped covenant batch.

   The wire tests prove the shapes survive the parse. These prove the two facts
   that would otherwise reach the banker only as silence:

     BEFORE confirming — the covenant the org will NOT write, with the org's own
     reason, and the four warnings verbatim.
     AFTER executing   — what each compliance row moved FROM and TO, and whether
     nCino minted the successor row that raises a covenant approval.

   Both are rendered from the archived envelopes, not from hand-written props.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<AppProvider data={sample as unknown as C360Data}>{node}</AppProvider>);
  });
  return container;
}

const staged = covenantEnvelopes.arm1_bulk_with_one_refusal.stageResponse[0].outputValues.result;
const executed = covenantEnvelopes.arm1_bulk_with_one_refusal.executeResponse[0].outputValues.result;

/** The parsed plan, in the shape `stageAction` produces from that response. */
const plan: StagedOutput = {
  stagingId: staged.stagingId,
  planHash: staged.planHash,
  decisionToken: staged.decisionToken,
  summary: staged.summary,
  warnings: staged.warnings,
  suggestions: [],
  steps: staged.steps.map((s) => ({
    id: s.id,
    type: s.type as "write" | "verification" | "observed_side_effect",
    label: s.label,
    objectName: s.objectName,
    fields: s.fields,
    automationWoken: s.automationWoken,
    state: s.state,
  })),
  covenants: staged.covenants.map((c) => ({
    covenantId: c.covenantId,
    covenantName: c.covenantName,
    covenantType: c.covenantType,
    attachment: c.attachment,
    covenantComplianceId: c.covenantComplianceId,
    currentComplianceStatus: c.currentComplianceStatus,
    assessedStatus: c.assessedStatus,
    state: c.state,
    reason: c.reason,
    generatesNextRow: c.generatesNextRow,
    writeStepId: c.writeStepId ?? undefined,
    statusStepId: c.statusStepId ?? undefined,
    verifyStepId: c.verifyStepId ?? undefined,
    generationStepId: c.generationStepId ?? undefined,
  })),
  scopeCount: staged.scopeCount,
  assessedCount: staged.assessedCount,
  refusedCount: staged.refusedCount,
  productPackageId: staged.productPackageId,
  accountId: staged.accountId,
};

const outcome: ExecuteResult = {
  stagingId: executed.stagingId,
  terminalState: executed.terminalState,
  outcome: executed.outcome,
  recordName: executed.recordName,
  anchorName: executed.anchorName,
  approvalChainStarted: executed.approvalChainStarted,
  items: executed.items.map((i) => ({
    covenantId: i.covenantId,
    covenantComplianceId: i.covenantComplianceId,
    written: i.written,
    status: i.status,
    sourceStatus: i.sourceStatus,
    recordName: i.recordName,
    anchorName: i.anchorName,
    outcome: i.outcome,
  })),
  steps: executed.steps.map((s) => ({ id: s.id, type: s.type, label: s.label, state: s.state, detail: s.detail })),
};

const gate = () =>
  render(
    <ConfirmGate
      plan={plan}
      actionId="covenant-review"
      simulated={false}
      idempotencyKey="ZZ-WS05COV-BULK-1"
      onConfirmed={() => {}}
      onBack={() => {}}
    />,
  );

describe("the confirm gate shows the batch BEFORE the banker confirms", () => {
  it("names every covenant in the plan, planned and refused alike", () => {
    const text = gate().textContent ?? "";
    expect(text).toContain("2 covenants in this plan");
    expect(text).toContain("2 in the package");
    expect(text).toContain("COV-000652");
    expect(text).toContain("COV-000653");
  });

  it("shows the assessed status on the one it will write and 'not written' on the other", () => {
    const text = gate().textContent ?? "";
    expect(text).toContain("Compliant");
    expect(text).toContain("not written");
    // The refused covenant's own assessed status is NOT shown as an outcome: it
    // would read as a verdict the org accepted.
    expect(text).toContain("compliance row at In Progress");
  });

  it("renders the org's refusal reason VERBATIM, not a paraphrase", () => {
    expect(gate().textContent).toContain(
      "The compliance row is at In Progress, not Pending. Only a Pending row advances the schedule when it moves to a complete status, so a write here would succeed and change nothing. Set allowNonPending to record the assessment on the row anyway, knowing the schedule will not move.",
    );
  });

  it("renders all four approval-trap warnings verbatim, under a heading that reads as a caution", () => {
    const text = gate().textContent ?? "";
    expect(text).toContain("Before you confirm");
    for (const w of staged.warnings) expect(text).toContain(w);
    // The one the whole classifier exists for.
    expect(text).toContain("Exception in nCino is not a synonym for a breach");
  });

  it("states the arithmetic of the batch, so a partial write is never a surprise", () => {
    expect(gate().textContent).toContain("1 of 2 assessed covenants will be written");
  });

  it("offers the gesture: the covenant review is no longer held client-side", () => {
    const c = gate();
    expect(c.textContent).not.toContain("Staged, not filed");
    const confirm = [...c.querySelectorAll("button")].find((b) => /Confirm and file/.test(b.textContent ?? ""));
    expect(confirm).toBeTruthy();
    expect(confirm!.hasAttribute("disabled")).toBe(false);
  });

  it("still lets the ORG hold the plan, whatever the client map says", () => {
    const held = render(
      <ConfirmGate
        plan={{ ...plan, executionHeld: true, heldReason: "The org says no." }}
        actionId="covenant-review"
        simulated={false}
        onConfirmed={() => {}}
        onBack={() => {}}
      />,
    );
    expect(held.textContent).toContain("Staged, not filed");
    expect(held.textContent).toContain("The org says no.");
    const button = [...held.querySelectorAll("button")].find((b) => /Filing is on hold/.test(b.textContent ?? ""));
    expect(button!.hasAttribute("disabled")).toBe(true);
  });
});

describe("the tracker shows what each compliance row did", () => {
  const tracked = () =>
    render(
      <StepTracker
        plan={plan}
        state={initTracker(plan.steps)}
        actionId="covenant-review"
        outcome={outcome}
        snapshot={undefined}
        token={null}
      />,
    );

  it("reports the status transition per covenant, from the org's read-back", () => {
    const text = tracked().textContent ?? "";
    expect(text).toContain("Recorded, per covenant");
    expect(text).toContain("COV-000652");
    expect(text).toContain("Pending to Compliant");
    expect(text).toContain("COMP-0489");
  });

  it("carries the org's own sentence for the item, verbatim", () => {
    expect(tracked().textContent).toContain(
      "Assessment recorded as Compliant on COV-000652. No successor compliance record was observed in this transaction.",
    );
  });

  it("says a covenant approval was NOT raised, and says why that is a measurement", () => {
    const text = tracked().textContent ?? "";
    expect(text).toContain("no covenant approval was raised by it");
    expect(text).toContain("A record created asynchronously would not be visible from here");
  });

  it("says NOTHING about the approval chain on a replay, which measured nothing", () => {
    const replayed = render(
      <StepTracker
        plan={plan}
        state={initTracker(plan.steps)}
        actionId="covenant-review"
        outcome={{ ...outcome, replayed: true, approvalChainStarted: null, items: [] }}
        snapshot={undefined}
        token={null}
      />,
    );
    const text = replayed.textContent ?? "";
    expect(text).not.toContain("covenant approval");
    expect(text).toContain("nothing was written again");
  });
});
