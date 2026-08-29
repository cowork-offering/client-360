// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { C360Data } from "./data/contract";
import { AppProvider, useApp } from "./state/appState";
import { ConfirmGate, RESTAGE_LABEL } from "./components/ConfirmGate";
import { RECHECK_LINE, computeSuggestions, type Suggestion } from "./actions/suggestionEngine";
import type { StagedOutput } from "./actions/stagedPlan";
import type { DecisionToken } from "./actions/decisionToken";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   THE CONFIRM GATE IS NOT A DEAD END.

   Founder, live, 2026-08-26: staged a modification, ran a Sync, pressed
   Confirm, and was refused. The panel said the staged data had been replaced,
   named no changed figure, and offered nothing but Back. Two defects behind it:

     (a) the recheck blocked on the TIMESTAMP. A sync moves `asOf` whether or
         not it moves a number, so a plan whose every figure was re-proven
         identical was refused for being re-read.
     (b) when drift is real, there was no way forward. The plan carries the
         figures it was staged with, so confirming again recomputes the same
         divergence and refuses again, forever.

   What these prove: a timestamp-only recheck passes through and is STATED, a
   moved figure still blocks, and the block hands the banker a re-stage that
   produces a fresh plan they then confirm. Nothing auto-executes.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATA = sample as unknown as C360Data;
/** Hartwell: the relationship whose staged figures trigger both Tier 1 rules. */
const ACCOUNT = "001bb00001DLtRMAA1";
const ACTION = "loan-modification";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** The suggestions a ticket on this relationship would have DISPLAYED. */
function displayed(): Suggestion[] {
  const r = computeSuggestions({ data: DATA, bundle: DATA.borrowers![ACCOUNT], actionId: ACTION });
  expect(r.suggestions.length).toBeGreaterThan(0);
  return r.suggestions;
}

/** A staged plan over those suggestions. No steps: the allowlist and the
 *  record-id assertion are covered elsewhere, and this file is about the
 *  recheck alone. */
function planOver(suggestions: Suggestion[]): StagedOutput {
  return {
    stagingId: "a5Xbb0000000001",
    planHash: "hash-1",
    decisionToken: "tok-1",
    summary: "Files a credit action against the selected facility.",
    steps: [],
    warnings: [],
    suggestions,
  };
}

function Opener({ children }: { children: ReactNode }) {
  const { dispatch } = useApp();
  useEffect(() => dispatch({ type: "OPEN_ACCOUNT", accountId: ACCOUNT }), [dispatch]);
  return <>{children}</>;
}

function render(node: ReactNode, data: C360Data = DATA): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={data}>
        <Opener>{node}</Opener>
      </AppProvider>,
    );
  });
  return container;
}

const buttons = () => [...document.body.querySelectorAll("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("a newer read with unchanged figures does not block the confirm", () => {
  /** The plan was staged before the sync: same figures, older instant. */
  const staleStamp = (): Suggestion[] =>
    displayed().map((s) => ({ ...s, asOf: "2026-06-01T09:00:00Z", freshness: { ...s.freshness, asOf: "2026-06-01T09:00:00Z" } }));

  it("states the recheck rather than refusing it", () => {
    const el = render(
      <ConfirmGate
        plan={planOver(staleStamp())}
        actionId={ACTION}
        simulated
        onConfirmed={() => {}}
        onBack={() => {}}
      />,
    );
    const text = el.textContent ?? "";
    expect(text).toContain(RECHECK_LINE);
    expect(text).not.toContain("The figures moved");
    expect(byText(/^Confirm$/)?.hasAttribute("disabled")).toBe(false);
  });

  it("lets the confirmation through", () => {
    let confirmed: DecisionToken | null = null;
    render(
      <ConfirmGate
        plan={planOver(staleStamp())}
        actionId={ACTION}
        simulated
        onConfirmed={(t) => {
          confirmed = t;
        }}
        onBack={() => {}}
      />,
    );
    click(byText(/^Confirm$/)!);
    expect(confirmed).not.toBeNull();
    expect(document.body.textContent).not.toContain("The figures moved");
  });

  it("says nothing at all when the read did not move either", () => {
    const el = render(
      <ConfirmGate plan={planOver(displayed())} actionId={ACTION} simulated onConfirmed={() => {}} onBack={() => {}} />,
    );
    expect(el.textContent ?? "").not.toContain(RECHECK_LINE);
  });
});

describe("a moved figure blocks, and the block has a way out", () => {
  /** The staged plan quotes a coverage the current read no longer produces. */
  const movedValue = (): Suggestion[] =>
    displayed().map((s) => ({ ...s, trigger: { ...s.trigger, value: s.trigger.value + 0.05 } }));

  it("refuses the confirm and names the figure", () => {
    let confirmed = false;
    render(
      <ConfirmGate
        plan={planOver(movedValue())}
        actionId={ACTION}
        simulated
        onRestage={() => {}}
        onConfirmed={() => {
          confirmed = true;
        }}
        onBack={() => {}}
      />,
    );
    click(byText(/^Confirm$/)!);
    expect(confirmed).toBe(false);
    expect(document.body.textContent).toContain("The figures moved");
  });

  it("offers the re-stage, and offering it is not running it", () => {
    let restaged = 0;
    let confirmed = false;
    render(
      <ConfirmGate
        plan={planOver(movedValue())}
        actionId={ACTION}
        simulated
        onRestage={() => {
          restaged += 1;
        }}
        onConfirmed={() => {
          confirmed = true;
        }}
        onBack={() => {}}
      />,
    );
    expect(byText(new RegExp(RESTAGE_LABEL))).toBeUndefined();
    click(byText(/^Confirm$/)!);

    const restage = byText(new RegExp(RESTAGE_LABEL))!;
    expect(restage).toBeTruthy();
    // The stale plan cannot be confirmed past: one way forward, not two.
    expect(byText(/Confirm the new figures/)?.hasAttribute("disabled")).toBe(true);

    click(restage);
    expect(restaged).toBe(1);
    // A re-stage stages. It does not decide.
    expect(confirmed).toBe(false);
  });

  it("confirms the plan the re-stage brings back", () => {
    // What ActionPanel does on `onRestage`: run the same staging call on the
    // current data and replace the plan. The gate re-renders on the fresh one.
    let confirmed = false;
    const fresh = (
      <ConfirmGate
        plan={planOver(displayed())}
        actionId={ACTION}
        simulated
        onRestage={() => {}}
        onConfirmed={() => {
          confirmed = true;
        }}
        onBack={() => {}}
      />
    );
    render(fresh);
    click(byText(/^Confirm$/)!);
    expect(confirmed).toBe(true);
    expect(document.body.textContent).not.toContain("The figures moved");
  });

  it("keeps blocking without a re-stage affordance, rather than pretending", () => {
    // Surfaces that cannot re-stage (the batch previews) keep the old copy and
    // the old gesture. Nothing there silently gained a way out.
    render(
      <ConfirmGate plan={planOver(movedValue())} actionId={ACTION} simulated onConfirmed={() => {}} onBack={() => {}} />,
    );
    click(byText(/^Confirm$/)!);
    expect(document.body.textContent).toContain("Review the new figures and confirm again");
    expect(byText(new RegExp(RESTAGE_LABEL))).toBeUndefined();
  });
});

describe("the member count states the deal's size, never only the selection", () => {
  /** Hartwell stages three active facilities and names no package on them, so
   *  the deal IS the relationship's three. */
  const withFacilities = (n: number): StagedOutput => ({
    ...planOver(displayed()),
    facilities: Array.from({ length: n }, (_, i) => ({
      facilityId: `a1X${i + 1}`,
      facilityName: `Facility ${i + 1}`,
    })),
  });

  it("reads N of M, so a two-member plan cannot be read as a two-member deal", () => {
    const el = render(
      <ConfirmGate plan={withFacilities(2)} actionId={ACTION} simulated onConfirmed={() => {}} onBack={() => {}} />,
    );
    const text = el.textContent ?? "";
    expect(text).toContain("2 of 3 facilities in this credit action");
    expect(text).not.toContain("2 facilities in this credit action");
  });

  it("counts the DEAL's members when the read places them on packages", () => {
    // Two of Hartwell's three sit on the plan's package. The third is another
    // deal's and is not part of what this action could have covered.
    const split = structuredClone(DATA) as C360Data;
    const facs = split.borrowers![ACCOUNT].exposure!.facilities!;
    facs[0].productPackageId = "PKG-A";
    facs[1].productPackageId = "PKG-A";
    facs[2].productPackageId = "PKG-B";
    const el = render(
      <ConfirmGate
        plan={{ ...withFacilities(2), productPackageId: "PKG-A" }}
        actionId={ACTION}
        simulated
        onConfirmed={() => {}}
        onBack={() => {}}
      />,
      split,
    );
    expect(el.textContent ?? "").toContain("2 of 2 facilities in this credit action");
  });

  it("falls back to the plain count when the read cannot place the deal", () => {
    // A plan anchored on a package this read does not stage: the denominator is
    // not known, and inventing one would be worse than omitting it.
    const split = structuredClone(DATA) as C360Data;
    for (const f of split.borrowers![ACCOUNT].exposure!.facilities!) f.productPackageId = "PKG-A";
    const el = render(
      <ConfirmGate
        plan={{ ...withFacilities(2), productPackageId: "PKG-NOT-STAGED" }}
        actionId={ACTION}
        simulated
        onConfirmed={() => {}}
        onBack={() => {}}
      />,
      split,
    );
    expect(el.textContent ?? "").toContain("2 facilities in this credit action");
  });
});
