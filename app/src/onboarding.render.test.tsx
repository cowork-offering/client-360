// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider, ONBOARDING_TABS, ZONE_NAME } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { OnboardingWorkspace } from "./components/OnboardingWorkspace";
import { OnboardingList, ZoneToggle } from "./components/OnboardingList";
import { OnboardingTabContent } from "./components/tabs/onboarding";
import { onboardingCases, type OnboardingCase } from "./data/onboarding";
import {
  ONBOARDING_ACTIONS,
  ONBOARDING_TOOLS_PENDING,
  ONBOARDING_TOOLS_PENDING_CODE,
  onboardingAvailability,
} from "./actions/onboardingActions";
import { clearOverlays } from "./state/syncOverlay";
import { resetModalStack } from "./components/modalStack";
import live from "../../artifact/live-data.json";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   EVERY ONBOARDING CASE, EVERY TAB, IN EVERY STAGED FILE.

   The borrower matrix exists because a bundle in a shape no sample used blanked
   the profile. Onboarding gets the same treatment from day one: mount all three
   cases through all five tabs in both files and assert something rendered. A
   gap state is a pass. A blank screen is not.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    /* ignore */
  }
});

function mount(data: C360Data, node: React.ReactNode): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<AppProvider data={data}>{node}</AppProvider>);
  });
  return container.textContent ?? "";
}

function click(el: Element | null | undefined) {
  act(() => el?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

/** Open a narrative card by its label and type into its textarea. The ticket
 *  keeps drafted prose collapsed exactly as the credit actions do. */
function typeRationale(label: string, text = "Reviewed the evidence on file and recorded the basis.") {
  const card = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (card) click(card);
  const area = [...document.body.querySelectorAll("textarea")].find((t) => t.getAttribute("aria-label") === label);
  if (!area) throw new Error(`no textarea for ${label}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(area, text);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function buttonByText(re: RegExp): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll("button")].find((b) => re.test(b.textContent ?? "")) as
    | HTMLButtonElement
    | undefined;
}

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", live as unknown as C360Data],
  ["sample-data.json", sample as unknown as C360Data],
];

describe("L1 — the pipeline zone", () => {
  for (const [file, data] of FILES) {
    it(`${file}: lists every onboarding case with stage, days and screening`, () => {
      const text = mount(data, <OnboardingList />);
      for (const c of onboardingCases(data)) expect(text, c.name).toContain(c.name);
      expect(text).toContain(ZONE_NAME.onboarding);
      expect(text).not.toContain("In onboarding");
      expect(text).toContain("Validation");
      expect(text).toContain("Due diligence");
      expect(text).toContain("Customer engagement");
      // Screening status renders as a table value, not a chip wall.
      expect(text).toContain("Hit");
      expect(text).toContain("Not run");
    });
  }

  it("the zone toggle carries a live count on both zones", () => {
    const text = mount(live as unknown as C360Data, <ZoneToggle bookCount={5} />);
    expect(text).toContain(ZONE_NAME.book);
    expect(text).toContain(ZONE_NAME.onboarding);
    expect(text).toContain("3");
    // The count reads as a quantity of something, not a bare number.
    expect(text).toContain("relationships");
    expect(text).toContain("cases");
  });

  it("the zone names are set caps, and the old names are gone everywhere", () => {
    const text = mount(live as unknown as C360Data, <AppShell />);
    expect(ZONE_NAME.book).toBe("CLIENT OVERVIEW");
    expect(ZONE_NAME.onboarding).toBe("KYC & ONBOARDING");
    expect(text).not.toContain("My book");
    expect(text).not.toContain("In onboarding");

    // The name carries the tracked-caps treatment, not a shouted body size.
    const labels = [...document.body.querySelectorAll(".zone-name")];
    expect(labels.length).toBeGreaterThanOrEqual(2);

    // The secondary count line stays sentence case.
    const radio = document.body.querySelector('[role="radio"]')!;
    expect(radio.textContent).toContain("5 relationships");
    expect(radio.textContent).not.toContain("RELATIONSHIPS");
    // Announced as words, never spelled out letter by letter.
    expect(radio.getAttribute("aria-label")).toBe("Client overview, 5 relationships");
  });

  it("the zone switcher is a radiogroup with a roving tab stop", () => {
    mount(live as unknown as C360Data, <ZoneToggle bookCount={5} />);
    const group = document.body.querySelector('[role="radiogroup"]');
    expect(group, "radiogroup").toBeTruthy();
    expect(group!.getAttribute("aria-label")).toBe("Portfolio zone");

    const radios = [...group!.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.length).toBe(2);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    // Exactly one tab stop for the whole group.
    expect(radios.filter((r) => r.tabIndex === 0).length).toBe(1);

    // The thumb is decorative and never announced.
    const thumb = group!.querySelector(".c360-zone-thumb");
    expect(thumb, "sliding thumb").toBeTruthy();
    expect(thumb!.getAttribute("aria-hidden")).toBe("true");
  });

  it("an arrow key moves the zone selection", () => {
    mount(live as unknown as C360Data, <AppShell />);
    expect(document.body.textContent).toContain("Needs action");
    const group = document.body.querySelector('[role="radiogroup"]')!;
    act(() => {
      group.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.body.textContent).toContain("Caldwell Systems LLC");
    expect(document.body.querySelector('[role="radio"][aria-checked="true"]')!.textContent).toContain(
      ZONE_NAME.onboarding,
    );
  });

  it("the incoming zone mounts under the transition class", () => {
    mount(live as unknown as C360Data, <AppShell />);
    const zone = () => document.body.querySelector(".c360-zone-in");
    expect(zone(), "zone wrapper").toBeTruthy();
    const before = zone();
    click(buttonByText(/KYC & ONBOARDING/));
    // A NEW element, which is what replays the entrance and the row stagger.
    expect(zone()).not.toBe(before);
    expect(zone()!.textContent).toContain("Caldwell Systems LLC");
  });

  it("switching zones swaps the worklist for the pipeline and back", () => {
    mount(live as unknown as C360Data, <AppShell />);
    expect(document.body.textContent).toContain("Needs action");

    click(buttonByText(/KYC & ONBOARDING/));
    expect(document.body.textContent).toContain("Caldwell Systems LLC");
    expect(document.body.textContent).not.toContain("Needs action");

    click(buttonByText(/CLIENT OVERVIEW/));
    expect(document.body.textContent).toContain("Needs action");
  });

  it("opening a pipeline row mounts the onboarding shell, not the booked one", () => {
    mount(live as unknown as C360Data, <AppShell />);
    click(buttonByText(/KYC & ONBOARDING/));
    const row = [...document.body.querySelectorAll('[role="button"]')].find((el) =>
      /Atlas Packaging Corp/.test(el.textContent ?? ""),
    );
    click(row);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Atlas Packaging Corp");
    // The lifecycle tab set, not the booked one.
    for (const t of ONBOARDING_TABS) expect(text, t.label).toContain(t.label);
    expect(text).not.toContain("Exposure & Collateral");
  });
});

describe("L2 — every case renders every tab", () => {
  for (const [file, data] of FILES) {
    for (const kase of onboardingCases(data)) {
      for (const tab of ONBOARDING_TABS) {
        it(`${kase.name} (${file}) — ${tab.label} renders`, () => {
          const text = mount(data, <OnboardingTabContent tab={tab.id} kase={kase} />);
          expect(text.length, "blank tab").toBeGreaterThan(80);
          expect(text).toContain("Onboarding · ");
          // Every tab says, once, that this is sample data.
          expect(text).toContain("Sample onboarding case");
        });
      }

      it(`${kase.name} (${file}) — the shell renders its header facts`, () => {
        const text = mount(data, <OnboardingWorkspace kase={kase} />);
        expect(text).toContain(kase.name);
        expect(text).toContain("Days in stage");
        expect(text).toContain("Onboarding Actions");
      });
    }
  }
});

describe("the surfaces say what the data says", () => {
  const data = live as unknown as C360Data;
  const byName = (n: string) => onboardingCases(data).find((c) => c.name === n)!;

  it("Caldwell's Process tab shows the intake provenance and the target deal", () => {
    const text = mount(data, <OnboardingTabContent tab="process" kase={byName("Caldwell Systems LLC")} />);
    expect(text).toContain("Arrived through client intake");
    expect(text).toContain("INTAKE-2026-07-23-0184");
    expect(text).toContain("Claimed identity");
    expect(text).toContain("$4.0M working capital line");
    expect(text).toContain("Screening not yet run");
  });

  it("Caldwell's Screening tab shows an absence, never a clearance", () => {
    const text = mount(data, <OnboardingTabContent tab="screening" kase={byName("Caldwell Systems LLC")} />);
    expect(text).toContain("No screening run");
    expect(text).toContain("That is an absence, not a clearance");
  });

  it("Meridian's Screening tab labels every row simulated and links the hit to its blocker", () => {
    const kase = byName("Meridian Tooling GmbH");
    const text = mount(data, <OnboardingTabContent tab="screening" kase={kase} />);
    const badges = document.body.querySelectorAll("span[title^='Not a screening provider']");
    expect(badges.length).toBe((kase.screenings ?? []).length);
    expect(text).toContain("Simulated (demo)");
    expect(text).toContain("Finding, as returned");
    expect(text).toContain("Drives blocking item");
    expect(text).toContain("Adverse-media hit on the proposed guarantor");
  });

  it("Meridian's Documents tab separates a verified document from a pending one", () => {
    const text = mount(data, <OnboardingTabContent tab="documents" kase={byName("Meridian Tooling GmbH")} />);
    expect(text).toContain("Verified");
    expect(text).toContain("Pending verification");
    expect(text).toContain("no verifier recorded");
    expect(text).toContain("Fabian Goetzens");
  });

  it("Meridian's Parties tab shows typed roles, percentages and confirmation state", () => {
    const text = mount(data, <OnboardingTabContent tab="parties" kase={byName("Meridian Tooling GmbH")} />);
    expect(text).toContain("Katrin Vogel");
    expect(text).toContain("Owner");
    expect(text).toContain("Business");
    expect(text).toContain("55.0%");
    expect(text).toContain("Guarantor");
    expect(text).toContain("Confirmed");
    expect(text).toContain("Unconfirmed");
  });

  it("Caldwell's Parties tab holds a claimed party apart from seeded edges", () => {
    const text = mount(data, <OnboardingTabContent tab="parties" kase={byName("Caldwell Systems LLC")} />);
    expect(text).toContain("Claimed, unconfirmed");
    expect(text).toContain("No ownership edges seeded");
  });
});

describe("the attestation gate", () => {
  const data = live as unknown as C360Data;
  const byName = (n: string) => onboardingCases(data).find((c) => c.name === n)!;

  it("Atlas reads ready, awaiting attestation — and cannot complete", () => {
    const text = mount(data, <OnboardingTabContent tab="attestation" kase={byName("Atlas Packaging Corp")} />);
    expect(text).toContain("Ready, awaiting attestation");
    expect(text).toContain("Case can complete:");
    expect(text).toContain("No");
    expect(text).toContain("Client attestation received");
  });

  it("Meridian reads not attested, with its open items named", () => {
    const text = mount(data, <OnboardingTabContent tab="attestation" kase={byName("Meridian Tooling GmbH")} />);
    expect(text).toContain("Not attested");
    expect(text).toContain("Adverse-media hit on the proposed guarantor");
  });

  it("a present clearance renders WHO attested and when", () => {
    const attested: OnboardingCase = {
      ...byName("Atlas Packaging Corp"),
      clearance: {
        present: true,
        clearedBy: "Noland Smith",
        clearedOn: "2026-07-20T10:00:00Z",
        basis: "Reviewed every document and screening result on the case.",
        clientAttestationReceived: true,
        clientAttestationOn: "2026-07-14T09:05:00Z",
      },
    };
    const text = mount(data, <OnboardingTabContent tab="attestation" kase={attested} />);
    expect(text).toContain("Attested");
    expect(text).toContain("Noland Smith");
    expect(text).toContain("Reviewed every document and screening result");
    expect(buttonByText(/Attest KYC clearance/)?.disabled).toBe(true);
  });

  it("pressing Attest opens the ticket and walks to the honest gate, never a success", () => {
    mount(data, <OnboardingTabContent tab="attestation" kase={byName("Atlas Packaging Corp")} />);
    click(buttonByText(/Attest KYC clearance/));
    // The entry point opens the TICKET now, not the flat card.
    expect(document.body.querySelector(`[data-gate="${ONBOARDING_TOOLS_PENDING_CODE}"]`)).toBeNull();
    typeRationale("What you are attesting, and on what basis");
    click(buttonByText(/^Review the plan$/));
    const gate = document.body.querySelector(`[data-gate="${ONBOARDING_TOOLS_PENDING_CODE}"]`);
    expect(gate, "gate card").toBeTruthy();
    const text = gate!.textContent ?? "";
    expect(text).toContain(ONBOARDING_TOOLS_PENDING);
    expect(text).toContain("Not filed");
    expect(text).toContain("KYC_Clearance__c");
    expect(text).toContain("never by an agent");
    // Nothing in the gate may read as a completed write.
    expect(text).not.toMatch(/\b(?:filed successfully|recorded|saved|submitted)\b/i);
  });
});

describe("the write seam is visible and closed", () => {
  const data = live as unknown as C360Data;

  /** Reach a case's actions the way the product now does it: open the case from
   *  the pipeline, then its header trigger — the SAME two gestures the booked
   *  side takes to Client Actions. */
  function openCaseActions(name: string) {
    mount(data, <AppShell />);
    click(buttonByText(/KYC & ONBOARDING/));
    click([...document.body.querySelectorAll('[role="button"]')].find((el) => el.textContent?.includes(name)));
    click(buttonByText(/Onboarding Actions/));
    return document.body.querySelector('[role="dialog"]')!;
  }

  it("the case's actions live in the floating panel, in the panel's row grammar", () => {
    const panel = openCaseActions("Caldwell Systems LLC");
    expect(panel, "actions panel").toBeTruthy();
    const text = panel.textContent ?? "";
    expect(text).toContain("Onboarding Actions");
    for (const c of ["Process", "Diligence", "Clearance"]) expect(text, c).toContain(c);
    expect(text).toContain("Advance stage");
    expect(text).toContain("Record screening result");
    expect(text).toContain("Attach identity document");
    expect(text).toContain("Attest KYC clearance");

    // The one row grammar, not a bespoke list: the same class the booked rows use.
    const rows = [...panel.querySelectorAll("button")].filter((b) => b.className.includes("c360-action-row"));
    expect(rows).toHaveLength(4);
    // No credit action bleeds into a relationship that has no exposure.
    expect(text).not.toContain("Draft Credit Memo");
    expect(text).not.toContain("Generate Spreading");
  });

  it("a row opens the onboarding ticket and walks to the honest gate", () => {
    const panel = openCaseActions("Caldwell Systems LLC");
    const rows = [...panel.querySelectorAll("button")].filter((b) => b.className.includes("c360-action-row"));
    click(rows[0]);
    const ticket = [...document.body.querySelectorAll('[role="dialog"]')].find(
      (d) => d.getAttribute("aria-label") === "Advance stage",
    );
    expect(ticket, "onboarding ticket").toBeTruthy();
    click(buttonByText(/^Review the plan$/));
    const gate = document.body.querySelector(`[data-gate="${ONBOARDING_TOOLS_PENDING_CODE}"]`);
    expect(gate, "gate card").toBeTruthy();
    expect(gate!.textContent).toContain(ONBOARDING_TOOLS_PENDING);
  });

  it("an attested case disables its attestation row with the reason, never hides it", () => {
    const panel = openCaseActions("Caldwell Systems LLC");
    const attest = [...panel.querySelectorAll("button")].find((b) => b.textContent?.includes("Attest KYC clearance"))!;
    expect(attest.hasAttribute("disabled")).toBe(false);

    const attested: OnboardingCase = {
      ...onboardingCases(data).find((c) => c.name === "Caldwell Systems LLC")!,
      clearance: {
        present: true,
        clearedBy: "Noland Smith",
        clearedOn: "2026-07-24T10:00:00Z",
        basis: "Reviewed every document on the case.",
        clientAttestationReceived: true,
        clientAttestationOn: "2026-07-20T09:00:00Z",
      },
    };
    expect(onboardingAvailability(ONBOARDING_ACTIONS.find((a) => a.id === "attest-clearance")!, attested)).toEqual({
      available: false,
      reason: "Already attested on this case.",
    });
  });

  it("the bespoke header dropdown is gone — no inline card, no Run buttons", () => {
    const kase = onboardingCases(data)[0];
    mount(data, <OnboardingWorkspace kase={kase} />);
    click(buttonByText(/Onboarding Actions/));
    const text = document.body.textContent ?? "";
    // The workspace alone renders no action list: the panel is a shell sibling.
    expect(text).not.toContain("Every action below is the real write this case needs");
    expect([...document.body.querySelectorAll("button")].filter((b) => b.textContent === "Run")).toHaveLength(0);
    expect(text).not.toContain("Advance stage");
  });

  it("the tab's contextual entry point still opens the attestation ticket", () => {
    mount(data, <OnboardingTabContent tab="attestation" kase={onboardingCases(data)[0]} />);
    click(buttonByText(/Attest KYC clearance/));
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
  });
});
