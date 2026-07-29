// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider, ZONE_NAME } from "./state/appState";
import { OnboardingList } from "./components/OnboardingList";
import { resetModalStack } from "./components/modalStack";
import { clearOverlays } from "./state/syncOverlay";
import { ONBOARDING_TOOLS_PENDING_CODE } from "./actions/onboardingActions";
import { PENDING_DEPLOYMENT } from "./actions/onboardingTicket";
import { assertNoRecordIds } from "./actions/stagedPlan";
import {
  CLAIMED_PROVENANCE,
  CREATE_PROSPECT_ACTION,
  OPENING_STAGE,
  PROSPECT_PLAN_STEPS,
  buildProspectPlan,
  emptyDraft,
  extractEntityName,
  extractProspect,
  observedCountries,
  observedIndustries,
  observedPartyRoles,
  ownershipReadout,
} from "./actions/prospectIntake";
import { SERVERS, TOOLS } from "./channel/mcp";
import live from "../../artifact/live-data.json";

/* =============================================================================
   HOW A RELATIONSHIP STARTS.

   The wizard is the first surface in this cockpit that CREATES rather than acts
   on something staged, so the tests carry the same burden the write path does:
   both origins reach the same plan, an extracted fact is marked as a claim
   wherever it lands, and the ceremony stops at the honest gate with nothing that
   looks like a minted token anywhere on the screen.

   The mail path is exercised against the real connector seam, mocked exactly as
   the sync sweep's tests mock it — same `window.claude.mcp` shape, same envelope.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATA = live as unknown as C360Data;

type W = { claude?: { mcp?: unknown } };
const w = window as unknown as W;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetModalStack();
  delete w.claude;
  vi.restoreAllMocks();
  try {
    sessionStorage.clear();
    clearOverlays();
  } catch {
    /* ignore */
  }
});

function mount(): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={DATA}>
        <OnboardingList />
      </AppProvider>,
    );
  });
  return container.textContent ?? "";
}

const text = () => document.body.textContent ?? "";

function click(el: Element | null | undefined) {
  act(() => el?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function byText(re: RegExp): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll("button")].find((b) => re.test(b.textContent ?? "")) as
    | HTMLButtonElement
    | undefined;
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string) {
  if (!el) throw new Error("no such input");
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const byPlaceholder = (p: string) =>
  document.body.querySelector<HTMLInputElement>(`input[placeholder="${p}"]`);
const byAria = (label: string) =>
  document.body.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);

function openWizard() {
  mount();
  click(byText(/New onboarding/));
}

/** Origin -> Entity -> Parties -> Intent -> Review, by the manual door. */
function walkToReview({ name = "Northgate Aerospace Ltd", country = "United Kingdom" } = {}) {
  click(byText(/Manual entry/));
  click(byText(/^Continue$/));
  typeInto(byPlaceholder("As it appears on the register"), name);
  typeInto(byPlaceholder("Jurisdiction of incorporation"), country);
  click(byText(/^Continue$/));
  click(byText(/^Continue$/)); // parties are optional at intake
  click(byText(/New customer/));
  click(byText(/^Continue$/));
}

/* ------------------------------------------------------------------ mocks */

const MESSAGE = {
  id: "AAMkAGI2",
  subject: "Financing enquiry — Northgate Aerospace Ltd",
  sender: "Priya Raman",
  summary: "We would like to apply for a new facility of about $6.5M for working capital.",
  receivedDateTime: "2026-07-24T08:12:00Z",
  webLink: "https://outlook.office.com/mail/AAMkAGI2",
};

function installMcp(handler: (server: string, tool: string, input: unknown) => unknown) {
  const callTool = vi.fn(async (server: string, tool: string, input: unknown) => handler(server, tool, input));
  w.claude = { mcp: { callTool, watchTool: vi.fn(), listTools: vi.fn(), invalidate: vi.fn() } };
  return callTool;
}

async function search(term: string) {
  typeInto(byAria("Search your mailbox for the inquiry"), term);
  await act(async () => {
    byText(/^Search$/)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/* ================================================================== entry */

describe("the entry point", () => {
  it("sits in the KYC & ONBOARDING header and opens the wizard", () => {
    const t = mount();
    expect(t).toContain(ZONE_NAME.onboarding);
    const trigger = byText(/New onboarding/);
    expect(trigger, "New onboarding affordance").toBeTruthy();
    // Sober: the app's accent control, never a floating action button.
    expect(trigger!.className).toContain("c360-accent-btn");
    expect(document.body.querySelector(".c360-fab")).toBeNull();

    click(trigger);
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog, "wizard dialog").toBeTruthy();
    expect(dialog!.getAttribute("aria-label")).toBe("New onboarding");
    expect(text()).toContain("Origin");
  });
});

/* =========================================================== step walking */

describe("step navigation", () => {
  it("refuses to advance until the step has what it needs, and walks back", () => {
    openWizard();
    // Origin: nothing chosen yet.
    expect(byText(/^Continue$/)!.disabled).toBe(true);
    expect(text()).toContain("Choose where this case is coming from");

    click(byText(/Manual entry/));
    expect(byText(/^Continue$/)!.disabled).toBe(false);
    click(byText(/^Continue$/));

    // Entity: the legal name and the country are the two it cannot open without.
    expect(byText(/^Continue$/)!.disabled).toBe(true);
    expect(text()).toContain("the legal name and the country");
    typeInto(byPlaceholder("As it appears on the register"), "Northgate Aerospace Ltd");
    expect(text()).toContain("Still needed: the country");
    typeInto(byPlaceholder("Jurisdiction of incorporation"), "United Kingdom");
    expect(byText(/^Continue$/)!.disabled).toBe(false);

    // A completed step in the rail walks back, and the work survives it.
    click(byText(/^Continue$/));
    expect(text()).toContain("Owners and guarantors");
    click(byText(/^Entity$/));
    expect(byPlaceholder("As it appears on the register")!.value).toBe("Northgate Aerospace Ltd");
  });

  it("the manual path reaches the review with what was typed", () => {
    openWizard();
    walkToReview();
    const t = text();
    expect(t).toContain("Open onboarding for Northgate Aerospace Ltd");
    expect(t).toContain("New customer");
    expect(t).toContain("United Kingdom");
    expect(t).toContain("opened by the desk");
  });
});

/* ============================================================ the mail path */

describe("the M365 origin", () => {
  it("searches the real mailbox tool and lists what came back", async () => {
    const callTool = installMcp((_s, tool) => (tool === TOOLS.mailSearch ? { payload: { value: [MESSAGE] } } : {}));
    openWizard();
    click(byText(/From client email/));
    await search("Northgate");

    expect(callTool).toHaveBeenCalledWith(SERVERS.m365, TOOLS.mailSearch, { query: "Northgate" }, expect.anything());
    expect(document.body.querySelector('[data-mail-state="hits"]'), "hit list").toBeTruthy();
    expect(text()).toContain("Financing enquiry — Northgate Aerospace Ltd");
    expect(text()).toContain("Priya Raman");
  });

  it("selecting a hit prefills the entity step and marks every prefilled fact as a claim", async () => {
    installMcp((_s, tool) => (tool === TOOLS.mailSearch ? { payload: { value: [MESSAGE] } } : {}));
    openWizard();
    click(byText(/From client email/));
    await search("Northgate");
    click(document.body.querySelector('[data-mail-state="hits"] button'));

    expect(byPlaceholder("As it appears on the register")!.value).toBe("Northgate Aerospace Ltd");
    expect(byPlaceholder("LLC, GmbH, Corp…")!.value).toBe("Ltd");
    expect(byPlaceholder("Who you have been speaking to")!.value).toBe("Priya Raman");

    const marks = [...document.body.querySelectorAll('[data-claimed="true"]')];
    expect(marks.length).toBeGreaterThanOrEqual(3);
    expect(marks[0].getAttribute("title")).toContain(CLAIMED_PROVENANCE);
    expect(text()).toContain("Prefilled from email");
    expect(text()).toContain(CLAIMED_PROVENANCE);

    // The stated ask rides through to the review, still marked as a claim.
    typeInto(byPlaceholder("Jurisdiction of incorporation"), "United Kingdom");
    click(byText(/^Continue$/));
    click(byText(/^Continue$/));
    click(byText(/New customer/));
    click(byText(/^Continue$/));
    expect(text()).toContain("$6.5M");
    expect(text()).toContain("recorded as a claim");
  });

  it("degrades honestly when the connector is absent, refuses, or finds nothing", async () => {
    // No bridge at all: no call is attempted and the manual door is named.
    openWizard();
    click(byText(/From client email/));
    expect(document.body.querySelector('[data-mail-state="no-connector"]'), "no-connector state").toBeTruthy();
    expect(text()).toContain("Manual entry opens the same case");
    act(() => root?.unmount());

    // Authorisation lapsed: the platform's own fix copy, never a fabricated hit.
    installMcp(() => {
      throw { code: "needs_reauth", message: "token expired" };
    });
    openWizard();
    click(byText(/From client email/));
    await search("Northgate");
    expect(document.body.querySelector('[data-mail-state="failed"]'), "failed state").toBeTruthy();
    expect(text()).toContain("Reconnect Microsoft 365");
    expect(document.body.querySelector('[data-mail-state="hits"]')).toBeNull();
    act(() => root?.unmount());

    // An empty mailbox is an honest answer, not an error.
    installMcp(() => ({ payload: { value: [] } }));
    openWizard();
    click(byText(/From client email/));
    await search("Northgate");
    expect(document.body.querySelector('[data-mail-state="empty"]'), "empty state").toBeTruthy();
    expect(text()).toContain("honest empty result");
  });
});

/* -------------------------------------------------------------- ownership */

describe("the ownership readout", () => {
  it("sums what is stated, warns off 100, and never blocks", () => {
    openWizard();
    click(byText(/Manual entry/));
    click(byText(/^Continue$/));
    typeInto(byPlaceholder("As it appears on the register"), "Northgate Aerospace Ltd");
    typeInto(byPlaceholder("Jurisdiction of incorporation"), "United Kingdom");
    click(byText(/^Continue$/));

    expect(text()).toContain("No ownership percentages stated yet");
    click(byText(/Add a party/));
    typeInto(byAria("Party 1 name"), "Katrin Vogel");
    typeInto(byAria("Party 1 ownership percent"), "55");
    click(byText(/Add a party/));
    typeInto(byAria("Party 2 name"), "Anders Holm");
    typeInto(byAria("Party 2 ownership percent"), "30");

    const readout = document.body.querySelector("[data-ownership-sum]")!;
    expect(readout.getAttribute("data-ownership-sum")).toBe("85");
    expect(readout.textContent).toContain("15% unaccounted for");
    expect(readout.textContent).toContain("due-diligence job");
    // Warned, not blocked.
    expect(byText(/^Continue$/)!.disabled).toBe(false);
  });

  it("reads a whole entity as whole, and over 100 as its own problem", () => {
    expect(ownershipReadout([]).off).toBe(false);
    const whole = ownershipReadout([
      { id: "a", name: "A", role: "Owner", ownershipPercent: 60 },
      { id: "b", name: "B", role: "Owner", ownershipPercent: 40 },
    ]);
    expect(whole.off).toBe(false);
    expect(whole.line).toContain("100%");

    const over = ownershipReadout([{ id: "a", name: "A", role: "Owner", ownershipPercent: 120 }]);
    expect(over.off).toBe(true);
    expect(over.line).toContain("more than the whole entity");
  });
});

/* ------------------------------------------------------- the honest ending */

describe("review, plan preview, gate", () => {
  it("walks the full ceremony and stops where filing would be", () => {
    openWizard();
    walkToReview();
    click(byText(/Review the plan/));

    const t = text();
    // The plan, in the write engine's own step order.
    expect(t).toContain("Check the book for an existing Northgate Aerospace Ltd");
    expect(t).toContain("Create the prospect account");
    expect(t).toContain("Open New customer at Customer engagement");
    expect(t).toContain("Record that the desk opened this case");
    expect(t).toContain("Write the audit row");

    // A preview, said so before anything else on the screen.
    expect(t).toContain("Plan preview (prototype)");

    // The gate, at the exact point the CreateProspect stage call would fire.
    const gate = document.body.querySelector(`[data-gate="${ONBOARDING_TOOLS_PENDING_CODE}"]`);
    expect(gate, "gate card").toBeTruthy();
    expect(gate!.textContent).toContain("Not filed");
    expect(gate!.textContent).toContain(CREATE_PROSPECT_ACTION.note!);
    expect(gate!.textContent).toContain("KYC & ONBOARDING once Customer360Write ships");
    expect(gate!.textContent).not.toMatch(/\b(?:filed successfully|created|saved|submitted)\b/i);

    // No confirm gesture exists on this path at all.
    expect(byText(/Confirm and file/)).toBeUndefined();
    expect(byText(/^Confirm$/)).toBeUndefined();
  });

  it("mints nothing: every identity slot reads pending deployment", () => {
    openWizard();
    walkToReview();
    click(byText(/Review the plan/));

    const values = [...document.body.querySelectorAll("dd")].map((d) => d.textContent ?? "");
    const identity = values.filter((v) => v === PENDING_DEPLOYMENT);
    expect(identity.length).toBe(3); // staging id, plan hash, decision token
    expect(PENDING_DEPLOYMENT).toBe("pending deployment");

    const t = text();
    // Nothing that could pass for a real staging id, hash or token.
    expect(t).not.toMatch(/sim-staging/);
    expect(t).not.toMatch(/\bsim-[0-9a-f]{8}\b/);
    expect(t).not.toMatch(/\btok(?:en)?[_-][A-Za-z0-9]{6,}/);
  });

  it("the case is NOT added to the pipeline behind the wizard", () => {
    openWizard();
    walkToReview();
    click(byText(/Review the plan/));
    click(byText(/^Close$/));
    // The list is what it was: the wizard files nothing, so it adds nothing.
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(text()).not.toContain("Northgate Aerospace Ltd");
  });
});

/* --------------------------------------------------------------- the plan */

describe("the plan itself", () => {
  const draft = {
    ...emptyDraft(),
    origin: "email" as const,
    legalName: "Northgate Aerospace Ltd",
    country: "United Kingdom",
    caseType: "NewCustomer" as const,
    parties: [{ id: "a", name: "Katrin Vogel", role: "Owner", ownershipPercent: 55 }],
  };

  it("carries the write engine's step ids in order, and no record id", () => {
    const plan = buildProspectPlan(draft);
    expect(plan.steps.map((s) => s.id)).toEqual([...PROSPECT_PLAN_STEPS]);
    expect(plan.steps[0].type).toBe("verification");
    expect(assertNoRecordIds(plan)).toEqual([]);
    expect(plan.stagingId).toBe(PENDING_DEPLOYMENT);
    expect(plan.planHash).toBe(PENDING_DEPLOYMENT);
    expect(plan.decisionToken).toBeNull();
  });

  it("opens at the first stage and says every claim is a claim", () => {
    const plan = buildProspectPlan(draft);
    expect(OPENING_STAGE).toBe("CustomerEngagement");
    expect(plan.warnings.join(" ")).toContain("Customer engagement");
    expect(plan.warnings.join(" ")).toContain("CLAIMED");
    expect(plan.warnings.join(" ")).toContain("this plan creates none");
  });

  it("a desk-opened case records the desk, not a client submission", () => {
    const plan = buildProspectPlan({ ...draft, origin: "manual" });
    expect(plan.steps.find((s) => s.id === "link_intake_provenance")!.label).toContain("desk");
    expect(plan.warnings.join(" ")).not.toContain("CLAIMED");
  });
});

/* ------------------------------------------------------- reading a message */

describe("the deterministic reader", () => {
  it("takes a name only when the text wraps it in a legal form", () => {
    expect(extractEntityName("Financing enquiry — Northgate Aerospace Ltd")).toBe("Northgate Aerospace Ltd");
    expect(extractEntityName("Following Our Call Last Tuesday")).toBeUndefined();
  });

  it("reads the ask, the intent and the sender, and nothing else", () => {
    const x = extractProspect({
      id: "AAMkAGI2",
      subject: "Financing enquiry — Northgate Aerospace Ltd",
      preview: "We would like to apply for a new facility of about $6.5M.",
      from: "Priya Raman",
    });
    expect(x.legalName).toBe("Northgate Aerospace Ltd");
    expect(x.entityForm).toBe("Ltd");
    expect(x.contact).toBe("Priya Raman");
    expect(x.amount).toBe(6_500_000);
    expect(x.intent).toBe("new_facility");
    expect(x.filled).toEqual(["legalName", "entityForm", "contact", "amount", "intent"]);
    expect(x.citation).toContain("AAMkAGI2");
  });

  it("a message that says nothing fills nothing", () => {
    const x = extractProspect({ id: "1", subject: "Lunch?", preview: "Are you free Thursday?" });
    expect(x.filled).toEqual([]);
    expect(x.legalName).toBeUndefined();
    expect(x.amount).toBeNull();
  });
});

/* --------------------------------------------------------- the vocabulary */

describe("the suggestion vocabulary is observed, not authored", () => {
  it("reads industries, countries and party roles off the staged book", () => {
    const industries = observedIndustries(DATA);
    const countries = observedCountries(DATA);
    const roles = observedPartyRoles(DATA);
    for (const set of [industries, countries, roles]) {
      expect(set.length).toBeGreaterThan(0);
      expect(set).toEqual([...set].sort());
      expect(new Set(set).size).toBe(set.length);
    }
    // Every suggestion traces back to a value the staged file actually carries.
    const staged = JSON.stringify(DATA);
    for (const v of [...industries, ...countries, ...roles]) expect(staged).toContain(v);
  });
});
