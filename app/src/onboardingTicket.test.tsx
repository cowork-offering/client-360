// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { OnboardingTicket } from "./components/OnboardingTicket";
import { ONBOARDING_ACTIONS } from "./actions/onboardingActions";
import { ONBOARDING_TOOLS_PENDING, ONBOARDING_TOOLS_PENDING_CODE } from "./actions/onboardingActions";
import {
  PENDING_DEPLOYMENT,
  SIMULATED_LABEL,
  attestationRefusals,
  buildOnboardingPlan,
  buildOnboardingSchema,
  legalNextStage,
  readinessChecklist,
} from "./actions/onboardingTicket";
import { assertNoRecordIds } from "./actions/stagedPlan";
import { onboardingCases, type OnboardingCase } from "./data/onboarding";
import { clearOverlays } from "./state/syncOverlay";
import { resetModalStack } from "./components/modalStack";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   THE ONBOARDING TICKET, WALKED.

   Same assertion set the credit actions get: the form is real, the plan preview
   is real, and the ceremony ends at the honest boundary. Plus the two rules that
   are onboarding's alone — Complete is never offered, and an attestation over an
   open blocking item is refused before any gate.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = sample as unknown as C360Data;
const byName = (n: string): OnboardingCase => {
  const k = onboardingCases(data).find((c) => c.name === n);
  if (!k) throw new Error(`no case ${n}`);
  return k;
};
const actionFor = (id: string) => {
  const a = ONBOARDING_ACTIONS.find((x) => x.id === id);
  if (!a) throw new Error(`no action ${id}`);
  return a;
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetModalStack();
  try {
    sessionStorage.clear();
    clearOverlays();
  } catch {
    /* jsdom without storage is fine */
  }
});

function mount(kase: OnboardingCase, actionId: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={data}>
        <OnboardingTicket action={actionFor(actionId)} kase={kase} onClose={() => undefined} />
      </AppProvider>,
    );
  });
}

const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const buttons = () => [...document.body.querySelectorAll("button")];
const buttonByText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));

/** Open a pill or the hero, then choose an option from the sheet by its label.
 *  The hero is opened by its id, because its button carries the prompt rather
 *  than the field label. */
function pick(fieldKey: string, fieldLabel: string, optionLabel: RegExp) {
  const opener =
    document.body.querySelector<HTMLButtonElement>(`#hero-${fieldKey}`) ??
    buttons().find((b) => b.textContent?.includes(fieldLabel));
  click(opener);
  const sheet = document.body.querySelector(`[role="dialog"][aria-label="${fieldLabel}"]`);
  if (!sheet) throw new Error(`no option sheet for ${fieldLabel}`);
  const option = [...sheet.querySelectorAll("button")].find((b) => optionLabel.test(b.textContent ?? ""));
  click(option);
}

function check(labelRe: RegExp) {
  const box = [...document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) =>
    labelRe.test(i.getAttribute("aria-label") ?? ""),
  );
  if (!box) throw new Error(`no checkbox for ${labelRe}`);
  act(() => {
    box.click();
  });
}

function typeInto(label: string, text: string) {
  const card = buttons().find((b) => b.textContent?.includes(label));
  if (card) click(card);
  const el = [...document.body.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea,input")].find(
    (t) => t.getAttribute("aria-label") === label || t.getAttribute("id") === `hero-${label}`,
  );
  if (!el) throw new Error(`no input for ${label}`);
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const rationale = (label: string) => typeInto(label, "Recorded the basis in my own words for the file.");
const reviewPlan = () => click(buttonByText(/^Review the plan$/));
const gateCard = () => document.body.querySelector(`[data-gate="${ONBOARDING_TOOLS_PENDING_CODE}"]`);

/** The ceremony's own proof: the plan preview is on screen and the boundary sits
 *  exactly where filing would. */
function expectPlanThenGate() {
  const text = document.body.textContent ?? "";
  expect(text, "plan preview banner").toContain("Plan preview (prototype)");
  expect(text, "the plan section").toContain("The plan");
  expect(gateCard(), "the honest gate at filing").toBeTruthy();
  expect(gateCard()!.textContent).toContain(ONBOARDING_TOOLS_PENDING);
  // No confirm gesture exists on this path.
  expect(buttonByText(/Confirm/)).toBeUndefined();
  // Nothing invents an org identity.
  expect(text).toContain(PENDING_DEPLOYMENT);
  // Nothing that looks like a minted staging id, plan hash or decision token.
  expect(text).not.toMatch(/\bsim-[0-9a-f]{8}\b/);
  expect(text).not.toMatch(/\b(?:tok|dt|stg)[-_][A-Za-z0-9]{6,}\b/);
  expect(text).not.toMatch(/\b[0-9a-f]{16,}\b/);
}

/* ------------------------------------------------------------ the lifecycle */

describe("the lifecycle rule is visible and enforced", () => {
  it("never offers Complete as a next stage, whatever the case", () => {
    for (const kase of onboardingCases(data)) {
      const next = legalNextStage(kase);
      expect(next).not.toBe("Complete");
      const schema = buildOnboardingSchema("advance-stage", kase)!;
      const stage = schema.fields.find((f) => f.key === "nextStage")!;
      expect(stage.options ?? []).not.toContain("Complete");
      expect(stage.help).toContain("Complete is not offered here");
    }
  });

  it("refuses the ticket outright for a case whose only next stage is Complete", () => {
    const atlas = byName("Atlas Packaging Corp"); // Validation
    expect(legalNextStage(atlas)).toBeNull();
    const schema = buildOnboardingSchema("advance-stage", atlas)!;
    const stage = schema.fields.find((f) => f.key === "nextStage")!;
    expect(stage.gap?.blocksStaging).toBe(true);
    expect(stage.gap!.reason).toContain("named human attests KYC clearance");
  });

  it("walks the advance-stage ticket from the form to the gate", () => {
    mount(byName("Meridian Tooling GmbH"), "advance-stage"); // DueDiligence -> Validation
    expect(document.body.textContent).toContain("Advance Meridian Tooling GmbH to Validation");
    pick("nextStage", "Next stage", /Validation/);
    rationale("Why this case moves on");
    reviewPlan();
    expectPlanThenGate();
    expect(document.body.textContent).toContain("Set the stage to Validation");
  });
});

/* ------------------------------------------------------------- the screening */

describe("the screening ticket", () => {
  it("locks the result and provider to the simulated label", () => {
    const schema = buildOnboardingSchema("record-screening", byName("Atlas Packaging Corp"))!;
    for (const key of ["result", "provider"]) {
      const f = schema.fields.find((x) => x.key === key)!;
      expect(f.value).toBe(SIMULATED_LABEL);
      expect(f.editable).toBe(false);
      expect(f.type).toBe("readonly");
    }
  });

  it("offers exactly the three screening types and no others", () => {
    const schema = buildOnboardingSchema("record-screening", byName("Atlas Packaging Corp"))!;
    expect(schema.fields.find((f) => f.key === "screeningType")!.options).toEqual([
      "Sanctions",
      "AdverseMedia",
      "HighRiskCountry",
    ]);
  });

  it("walks a party selection through to the gate", () => {
    mount(byName("Atlas Packaging Corp"), "record-screening");
    check(/Marcus Rendell/);
    pick("screeningType", "Screening type", /Sanctions/);
    rationale("Why this screening is being run");
    reviewPlan();
    expectPlanThenGate();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Marcus Rendell");
    expect(text).toContain(SIMULATED_LABEL);
  });
});

/* -------------------------------------------------------------- the document */

describe("the document ticket", () => {
  it("reads its picklists from the case rather than inventing them", () => {
    const schema = buildOnboardingSchema("attach-document", byName("Meridian Tooling GmbH"))!;
    expect(schema.fields.find((f) => f.key === "documentType")!.options).toEqual(["Other", "Passport"]);
    expect(schema.fields.find((f) => f.key === "issuingCountry")!.options).toEqual(["Germany"]);
    expect(schema.intro).toContain("Verification is a separate");
  });

  it("walks to the gate and says verification is a separate act", () => {
    mount(byName("Meridian Tooling GmbH"), "attach-document");
    pick("documentType", "Document type", /Passport/);
    pick("party", "Party it belongs to", /Katrin Vogel/);
    pick("issuingCountry", "Issuing country", /Germany/);
    typeInto("Document number (masked)", "•••••• 4471");
    rationale("Why this document is being filed");
    reviewPlan();
    expectPlanThenGate();
    expect(document.body.textContent).toContain("does not set VerifiedBy");
  });
});

/* ------------------------------------------------------------ the attestation */

describe("the attestation ticket", () => {
  it("refuses a case with open blocking items, listing them, before any gate", () => {
    const meridian = byName("Meridian Tooling GmbH");
    expect(attestationRefusals(meridian).some((r) => /Adverse-media/i.test(r))).toBe(true);

    mount(meridian, "attest-clearance");
    const refusal = document.body.querySelector('[data-attestation-refused="true"]');
    expect(refusal, "the refusal block").toBeTruthy();
    expect(refusal!.textContent).toContain("Adverse-media hit on the proposed guarantor");
    expect(refusal!.textContent).toContain("Holding company ownership not walked through");
    // The refusal comes BEFORE the gate, and the gate never renders.
    expect(gateCard()).toBeNull();
    expect(buttonByText(/^Review the plan$/)!.disabled).toBe(true);
  });

  it("shows a green readiness checklist for Atlas and proceeds to the plan preview", () => {
    const atlas = byName("Atlas Packaging Corp");
    expect(readinessChecklist(atlas).every((i) => i.ok)).toBe(true);
    expect(attestationRefusals(atlas)).toEqual([]);

    mount(atlas, "attest-clearance");
    expect(document.body.querySelectorAll('[data-readiness="blocked"]').length).toBe(0);
    expect(document.body.querySelectorAll('[data-readiness="ok"]').length).toBe(4);
    expect(document.body.textContent).toContain("Attesting asserts three things in your own name");

    rationale("What you are attesting, and on what basis");
    reviewPlan();
    expectPlanThenGate();
    const text = document.body.textContent ?? "";
    expect(text).toContain("recorded under your own identity");
    expect(text).toContain("never by an agent");
  });

  it("names the blocked lines rather than summarising them away", () => {
    const items = readinessChecklist(byName("Meridian Tooling GmbH"));
    const blocked = items.filter((i) => !i.ok).map((i) => i.label);
    expect(blocked).toContain("Screening reviewed");
    expect(blocked).toContain("Documents verified");
    expect(blocked).toContain("Ownership resolved");
    expect(blocked).toContain("No open blocking items");
  });
});

/* ------------------------------------------------------------------ honesty */

describe("nothing on this path invents an org fact", () => {
  it("builds every plan with pending-deployment identity and no token", () => {
    for (const kase of onboardingCases(data)) {
      for (const id of ["advance-stage", "record-screening", "attach-document", "attest-clearance"]) {
        const plan = buildOnboardingPlan(id, kase, {})!;
        expect(plan.stagingId).toBe(PENDING_DEPLOYMENT);
        expect(plan.planHash).toBe(PENDING_DEPLOYMENT);
        expect(plan.decisionToken).toBeNull();
        expect(JSON.stringify(plan)).not.toMatch(/\bsim-[0-9a-f]{8}\b/);
        expect(assertNoRecordIds(plan)).toEqual([]);
        // Step ids follow the write-engine's naming, not invented labels.
        expect(plan.steps[0].id).toBe("verify_case");
        expect(plan.steps.map((s) => s.id)).toContain("audit_event");
        expect(plan.steps.map((s) => s.id)).toContain("notify");
      }
    }
  });
});
