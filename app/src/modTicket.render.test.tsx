// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BorrowerBundle, C360Data } from "./data/contract";
import { AppProvider } from "./state/appState";
import { ConfirmGate } from "./components/ConfirmGate";
import { StepTracker } from "./components/StepTracker";
import { initTracker } from "./actions/tracker";
import {
  batchStagingGap,
  buildPanelSchema,
  EACH_SELECTED,
  impliedFacility,
  MODIFICATION_NEEDS_A_CHANGE,
  MODIFICATION_NO_MOVEMENT,
  PACKAGE_ANCHOR_TECHNICAL,
} from "./actions/schemas";
import { buildBriefing } from "./actions/briefing";
import type { PlanStep, StagedOutput } from "./actions/stagedPlan";
import type { ExecuteResult } from "./channel/writeTools";
import { bookedFacilities } from "./data/facilityStage";
import sample from "../../artifact/sample-data.json";
import multiEnvelopes from "./actions/observed-facilityIds-envelopes.json";
import derivedN2 from "./actions/derived-execute-modification-n2.json";

/* =============================================================================
   THE MODIFICATION TICKET IS PACKAGE-FIRST.

   The founder's reading of the old one was correct and blunt: it LOOKED like a
   single-loan form. One facility, one amount, one term, one rate. The wire had
   been package-anchored and multi-capable since 2026-07-27 and the ticket was
   still asking the 2026-06 question.

   What these prove:
     - the DEAL is the anchor and is stated first, with what it aggregates
     - the facilities are member selections inside it, 1..N, preselected from
       what the entry point implied and never locked to it
     - every requested change is labelled with the wire semantic it has, which
       is that ONE scalar reaches EVERY selected member
     - the org's at-least-one-change rule is met in the ticket, in its words
     - the plan and the filed result read correctly for N = 1 AND N = 2

   The N=2 EXECUTE fixture is DERIVED, not observed, and says so in its own
   `_derivation` block. The run happened; its response body was not archived.
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

/* ------------------------------------------------------------- the ticket */

const DEAL = "a5Fbb000000IHFJEA4";
const OTHER_DEAL = "a5Fbb000000ZZZZEA4";

const facility = (over: Record<string, unknown>) =>
  ({ stage: "Booked", status: "Active", productPackageId: DEAL, ...over }) as never;

const deal = (facilities: unknown[], requests?: unknown[]): BorrowerBundle =>
  ({
    snapshot: { accountId: "001X", name: "Testco", productPackageId: DEAL },
    exposure: {
      totalCommitted: 30_000_000,
      totalOutstanding: 18_000_000,
      facilities,
    },
    ...(requests ? { requests } : {}),
  }) as BorrowerBundle;

const BUNDLE = deal([
  facility({ loanId: "L1", name: "Working Capital Revolver", committed: 10_000_000, outstanding: 6_000_000, maturityDate: "2027-03-15" }),
  facility({ loanId: "L2", name: "Equipment Term Loan", committed: 12_000_000, outstanding: 8_000_000, maturityDate: "2029-01-31" }),
  facility({ loanId: "L3", name: "CapEx Facility", committed: 8_000_000, outstanding: 4_000_000, maturityDate: "2028-06-30" }),
]);

const schemaFor = (bundle: BorrowerBundle, packageId?: string) =>
  buildPanelSchema("loan-modification", { bundle, accountId: "001X", accountName: "Testco", packageId })!;

const fieldOf = (bundle: BorrowerBundle, key: string, packageId?: string) =>
  schemaFor(bundle, packageId).fields.find((f) => f.key === key)!;

describe("the deal is the anchor, and it is the first thing the ticket states", () => {
  it("carries a package field, required, ahead of every member and every change", () => {
    const keys = schemaFor(BUNDLE).fields.map((f) => f.key);
    expect(keys[0]).toBe("package");
    expect(keys.indexOf("package")).toBeLessThan(keys.indexOf("facility"));
    expect(keys.indexOf("facility")).toBeLessThan(keys.indexOf("newCommitment"));
    const pkg = fieldOf(BUNDLE, "package");
    expect(pkg.required).toBe(true);
    expect(pkg.value).toBe(DEAL);
  });

  /* F1 (founder, 2026-08-25). The old headline was the members concatenated,
     which on a six-member package was three loan names each beginning with the
     borrower's own. The deal is named as what it is; the metadata line carries
     members, committed and drawn and NOTHING else; the record id moves behind
     the ticket's info toggle. */
  it("leads with the deal's NAME, not with a list of its members", () => {
    expect(fieldOf(BUNDLE, "package").optionLabels![0]).toBe("Testco credit package");
  });

  it("says what the deal AGGREGATES in one compact line, with no record id in it", () => {
    const detail = fieldOf(BUNDLE, "package").optionDetails![0];
    expect(detail).toBe("3 facilities · $30M committed · $18M drawn");
    expect(detail).not.toContain(DEAL);
  });

  it("tells two deals on one relationship apart by the products booked on each", () => {
    const twoDeals = deal([
      facility({ loanId: "L1", name: "Revolver", productType: "Revolving Line of Credit", committed: 10_000_000 }),
      facility({ loanId: "L9", name: "Other", productType: "Term Loan", committed: 5_000_000, productPackageId: OTHER_DEAL }),
    ]);
    const pkg = fieldOf(twoDeals, "package");
    expect(pkg.editable).toBe(true);
    expect(pkg.optionLabels).toEqual([
      "Testco credit package · Revolving Line of Credit",
      "Testco credit package · Term Loan",
    ]);
  });

  it("is not editable when the relationship stages one deal, and says why", () => {
    const pkg = fieldOf(BUNDLE, "package");
    expect(pkg.editable).toBe(false);
    expect(pkg.editableReason).toBe("the relationship stages one product package");
  });

  it("blocks staging outright when the relationship stages no package at all", () => {
    const bare = deal([facility({ loanId: "L1", name: "Revolver", committed: 1, productPackageId: undefined })]);
    bare.snapshot.productPackageId = undefined;
    const pkg = fieldOf(bare, "package");
    expect(pkg.gap?.blocksStaging).toBe(true);
    // F4 — the sentence a banker reads carries no wire field name. The wire
    // field name is still there, behind the toggle, for whoever has to fix it.
    expect(pkg.gap?.reason).toContain("stages no credit package");
    expect(pkg.gap?.reason).not.toContain("productPackageId");
    expect(pkg.gap?.technical).toBe(PACKAGE_ANCHOR_TECHNICAL);
    expect(pkg.gap?.technical).toContain("productPackageId");
  });

  it("states the deal, not a facility, in the ticket's subject", () => {
    const schema = schemaFor(BUNDLE);
    const briefing = buildBriefing("loan-modification", schema, BUNDLE, "Testco")!;
    expect(briefing.subject.title).toBe("Modification on Testco's deal");
    expect(briefing.subject.context).toContain("3 booked facilities can carry it");
    expect(briefing.subject.context).toContain("$30M committed");
    expect(briefing.subject.context).toContain("$18M drawn");
    expect(briefing.subject.context).toContain("One plan covers every facility you select");
  });
});

describe("the facilities are member selections inside that deal", () => {
  it("offers every booked member, with what a banker needs to choose between them", () => {
    const f = fieldOf(BUNDLE, "facility");
    expect(f.type).toBe("multiselect");
    expect(f.options).toEqual(["L1", "L2", "L3"]);
    // F1 — figures on the detail line, the STAGE as a chip beside the name,
    // and a maturity a banker reads rather than an ISO string.
    expect(f.optionDetails![0]).toBe("$10M committed · $6M drawn · matures Mar 15, 2027");
    expect(f.optionChips).toEqual(["Booked", "Booked", "Booked"]);
  });

  it("drops the borrower's name from every member row, since it is the headline", () => {
    // nCino names a loan <Borrower> - <Product> - <$Amount>. Six of those in a
    // list are six rows that differ only at the end.
    const ncinoNames = deal([
      facility({ loanId: "L1", name: "Testco - Line of Credit - $15,000,000.00", committed: 15_000_000 }),
      facility({ loanId: "L2", name: "Testco - Equipment - $8,000,000.00", committed: 8_000_000 }),
    ]);
    expect(fieldOf(ncinoNames, "facility").optionLabels).toEqual([
      "Line of Credit - $15,000,000.00",
      "Equipment - $8,000,000.00",
    ]);
  });

  it("leaves a name that only LOOKS like it starts with the borrower alone", () => {
    // "Sterling Working Capital Revolver" under "Sterling Fabrication Co.".
    // Half-stripping a name is worse than not stripping it.
    const near = deal([facility({ loanId: "L1", name: "Testcorp Working Capital Revolver", committed: 1 })]);
    expect(fieldOf(near, "facility").optionLabels).toEqual(["Testcorp Working Capital Revolver"]);
  });

  it("scopes the list to the CHOSEN deal and says where the others sit", () => {
    const twoDeals = deal([
      facility({ loanId: "L1", name: "Revolver", committed: 10_000_000 }),
      facility({ loanId: "L9", name: "Other Deal Term Loan", committed: 5_000_000, productPackageId: OTHER_DEAL }),
    ]);
    const f = fieldOf(twoDeals, "facility");
    expect(f.options).toEqual(["L1"]);
    expect(f.disabledOptions).toContainEqual({ value: "Other Deal Term Loan", reason: "booked on another deal" });
  });

  it("keeps an unbooked member VISIBLE, with the org's reason rather than hidden", () => {
    // The showcase facility sits at Proposal. A banker hunting for it must find
    // it here with its stage, not discover it is simply absent.
    const withShowcase = deal([
      facility({ loanId: "L1", name: "Revolver", committed: 10_000_000 }),
      facility({ loanId: "L4", name: "Showcase Facility", committed: 1_000_000, stage: "Proposal" }),
    ]);
    const f = fieldOf(withShowcase, "facility");
    expect(f.options).toEqual(["L1"]);
    expect(f.disabledOptions).toContainEqual({ value: "Showcase Facility", reason: "at Proposal" });
  });

  it("says which of the three things is wrong when nothing can be selected", () => {
    // None booked ON THIS DEAL is its own sentence: the availability rule would
    // report "available" here, because a booked facility does exist elsewhere.
    const elsewhere = deal([
      facility({ loanId: "L1", name: "Revolver", committed: 1, stage: "Proposal" }),
      facility({ loanId: "L9", name: "Other", committed: 1, productPackageId: OTHER_DEAL }),
    ]);
    const gap = fieldOf(elsewhere, "facility").gap!;
    expect(gap.blocksStaging).toBe(true);
    expect(gap.reason).toContain("No facility of this deal is booked");
    expect(gap.reason).toContain("modification");
  });
});

describe("the entry point preselects a member, and never locks it", () => {
  it("preselects the facility the client's request NAMES", () => {
    const asked = deal(BUNDLE.exposure!.facilities!, [
      { id: "REQ-1", ask: { type: "facility_increase", facilityName: "Working Capital Revolver", to: 14_000_000 } },
    ]);
    expect(fieldOf(asked, "facility").value).toEqual(["L1"]);
  });

  it("preselects the facility whose CURRENT commitment the request quotes", () => {
    // "from 8.0M to 11.0M" names the CapEx facility without naming it.
    const asked = deal(BUNDLE.exposure!.facilities!, [
      { id: "REQ-2", ask: { type: "facility_increase", from: 8_000_000, to: 11_000_000 } },
    ]);
    expect(fieldOf(asked, "facility").value).toEqual(["L3"]);
  });

  it("falls back to the largest member when the request implies nothing", () => {
    expect(fieldOf(BUNDLE, "facility").value).toEqual(["L2"]);
  });

  it("refuses to read an ambiguous quote as an implication", () => {
    // Two members at the same commitment: the figure implicates neither, so the
    // largest-member rule takes over rather than a coin toss.
    const twins = deal([
      facility({ loanId: "L1", name: "A", committed: 5_000_000 }),
      facility({ loanId: "L2", name: "B", committed: 5_000_000 }),
      facility({ loanId: "L3", name: "C", committed: 9_000_000 }),
    ]);
    const asked = deal(twins.exposure!.facilities!, [{ id: "REQ-3", ask: { from: 5_000_000, to: 7_000_000 } }]);
    expect(fieldOf(asked, "facility").value).toEqual(["L3"]);
  });

  it("preselects ONE, so the selection is a starting point rather than a lock", () => {
    const f = fieldOf(BUNDLE, "facility");
    expect(f.value).toHaveLength(1);
    expect(f.editable).toBe(true);
    // Every member stays choosable, the preselected one included.
    expect(f.options).toHaveLength(3);
  });

  it("implicates nothing when the deal offers nothing", () => {
    expect(impliedFacility(BUNDLE, [])).toBeNull();
    expect(impliedFacility(null, bookedFacilities(BUNDLE))).toBeTruthy();
  });
});

describe("the requested changes carry the wire semantic they actually have", () => {
  it("offers all four the tool accepts, the maturity date included", () => {
    const keys = schemaFor(BUNDLE).fields.map((f) => f.key);
    expect(keys).toContain("newCommitment");
    expect(keys).toContain("requestedMaturityDate");
    expect(keys).toContain("requestedTermMonths");
    expect(keys).toContain("requestedRate");
  });

  it("labels each one as reaching EVERY selected member", () => {
    for (const key of ["newCommitment", "requestedMaturityDate", "requestedTermMonths", "requestedRate"]) {
      expect(fieldOf(BUNDLE, key).help, key).toContain(EACH_SELECTED);
    }
    expect(EACH_SELECTED).toContain("Stage them separately if they need different terms");
  });

  it("requires none of them on its own, because the org's rule is about the plan", () => {
    for (const key of ["newCommitment", "requestedMaturityDate", "requestedTermMonths", "requestedRate"]) {
      expect(fieldOf(BUNDLE, key).required, key).toBe(false);
    }
    expect(MODIFICATION_NEEDS_A_CHANGE).toBe(
      "At least one requested change is required: amount, maturity date, rate or term.",
    );
  });

  it("prefills the amount from the client's ask when the client made one", () => {
    const asked = deal(BUNDLE.exposure!.facilities!, [{ id: "REQ-4", ask: { from: 10_000_000, to: 14_000_000 } }]);
    const prefilled = fieldOf(asked, "newCommitment");
    expect(prefilled.value).toBe(14_000_000);
    expect(prefilled.prefill.source).toBe("CLIENT_REQUEST");
  });

  /* F5 (founder, 2026-08-25). The previous wave left this field EMPTY where no
     client ask existed, because a prefill equal to the current figure satisfies
     the org's at-least-one-change rule while asking for nothing. The founder
     wants the from -> to reading, so the prefill is back and the hazard is
     caught by name instead of avoided. */
  it("otherwise opens on the CURRENT commitment of the member the ticket opened on", () => {
    const f = fieldOf(BUNDLE, "newCommitment");
    // L2 is the largest member and the one impliedFacility ticks.
    expect(f.value).toBe(12_000_000);
    expect(f.prefill.source).toBe("NCINO_RECORD");
    expect(f.prefill.citation).toBe("L2");
  });

  it("stays empty when the member the ticket opened on stages no commitment", () => {
    const noFigure = deal([facility({ loanId: "L1", name: "Revolver" })]);
    const f = fieldOf(noFigure, "newCommitment");
    expect(f.value).toBeNull();
    expect(f.prefill.source).toBe("BANKER");
  });

  it("refuses a plan whose only change is the amount it already carries", () => {
    const schema = schemaFor(BUNDLE);
    const onPrefill = { facility: ["L2"], newCommitment: 12_000_000 };
    expect(batchStagingGap("loan-modification", onPrefill, schema)).toBe(MODIFICATION_NO_MOVEMENT);
    // Moving it is a change.
    expect(batchStagingGap("loan-modification", { ...onPrefill, newCommitment: 15_000_000 }, schema)).toBeNull();
    // So is any OTHER requested change, whatever the amount does.
    expect(
      batchStagingGap("loan-modification", { ...onPrefill, requestedMaturityDate: "2029-06-30" }, schema),
    ).toBeNull();
  });

  it("says nothing about movement it cannot prove", () => {
    // One selected member carries no committed figure, so whether the amount
    // moves anything is unknown. Unknown is silence, never a refusal.
    const partial = deal([
      facility({ loanId: "L1", name: "Revolver", committed: 10_000_000 }),
      facility({ loanId: "L2", name: "Term" }),
    ]);
    const schema = schemaFor(partial);
    expect(
      batchStagingGap("loan-modification", { facility: ["L1", "L2"], newCommitment: 10_000_000 }, schema),
    ).toBeNull();
  });

  it("carries the committed figure per member so the ticket can read from -> to", () => {
    const f = fieldOf(BUNDLE, "facility");
    expect(f.optionAmounts).toEqual([10_000_000, 12_000_000, 8_000_000]);
  });
});

/* ------------------------------------------------- the plan and the result */

const stagedMulti = multiEnvelopes.package_anchored_modification_multi[0].outputValues.result;
const executedN2 = derivedN2.execute_loan_modification_n2.response[0].outputValues.result;

const planOf = (result: typeof stagedMulti, facilities: typeof stagedMulti.facilities): StagedOutput => ({
  stagingId: result.stagingId,
  planHash: result.planHash,
  decisionToken: result.decisionToken,
  summary: result.summary,
  warnings: result.warnings,
  suggestions: [],
  steps: result.steps as PlanStep[],
  facilities,
  facilityCount: facilities.length,
  covenantCarryoverCount: result.covenantCarryoverCount,
  productPackageId: result.productPackageId,
  accountId: result.accountId,
  // The org's hold is the org's to state; these render it verbatim.
  executionHeld: result.executionHeld,
  heldReason: result.heldReason,
});

const outcomeN2: ExecuteResult = {
  stagingId: executedN2.stagingId,
  terminalState: executedN2.terminalState,
  outcome: executedN2.outcome,
  recordName: executedN2.recordName,
  productPackageId: executedN2.productPackageId,
  facilityCount: executedN2.facilityCount,
  // A JSON null is absent by the time `executeAction` has parsed it: the reader
  // coerces every string field through the same "absent unless a string" rule.
  // The fixture keeps the nulls because that is what it does not know.
  facilities: executedN2.facilities.map((f) => ({
    ...f,
    cloneLookupKey: f.cloneLookupKey ?? undefined,
    junctionId: f.junctionId ?? undefined,
  })),
  steps: executedN2.steps as ExecuteResult["steps"],
};

describe("the staged plan reads correctly for one member and for two", () => {
  const gate = (n: 1 | 2) => {
    const plan = planOf(stagedMulti, stagedMulti.facilities.slice(0, n));
    return render(
      <ConfirmGate plan={plan} actionId="loan-modification" simulated={false} onConfirmed={() => {}} onBack={() => {}} />,
    );
  };

  it("names each member and the steps that will report on it, at N = 2", () => {
    const text = gate(2).textContent ?? "";
    expect(text).toContain("2 facilities in this credit action");
    expect(text).toContain("Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00");
    expect(text).toContain("Hartwell Precision Manufacturing LLC - Construction - $12,000,000.00");
    expect(text).toContain("credit_action_0");
    expect(text).toContain("credit_action_1");
    expect(text).toContain("One plan, one confirmation and one decision token");
  });

  it("does not dress a single member up as a batch at N = 1", () => {
    const text = gate(1).textContent ?? "";
    // The summary already names it; a "1 facilities" header would be noise.
    expect(text).not.toContain("1 facilities in this credit action");
    expect(text).not.toContain("One plan, one confirmation and one decision token");
  });

  it("carries the org's own carryover arithmetic per member and in total", () => {
    const text = gate(2).textContent ?? "";
    expect(text).toContain("1 loan-level covenant carries over.");
    expect(text).toContain("2 loan-level covenants carry over to the new facilities.");
  });
});

describe("the filed result reads per member at N = 2", () => {
  const tracked = () => {
    const plan = planOf(stagedMulti, stagedMulti.facilities);
    return render(
      <StepTracker
        plan={plan}
        state={initTracker(plan.steps)}
        actionId="loan-modification"
        outcome={outcomeN2}
        snapshot={undefined}
        token={null}
      />,
    );
  };

  it("names both clones, both chain rows and what each apply step read back", () => {
    const text = tracked().textContent ?? "";
    expect(text).toContain("Filed, per facility");
    expect(text).toContain("Chain row RL-00000205");
    expect(text).toContain("Chain row RL-00000206");
    expect(text).toContain("records revision 1");
    // The applied change is the one this run actually made.
    expect(text).toContain("Maturity date reads back at 2027-09-30.");
  });

  it("says both parents read back unchanged, which is the whole safety claim", () => {
    const text = tracked().textContent ?? "";
    expect(text.match(/The parent facility reads back unchanged\./g)).toHaveLength(2);
  });

  it("walks every step of the eight-step plan, three per member", () => {
    const text = tracked().textContent ?? "";
    for (const step of stagedMulti.steps) expect(text).toContain(step.label);
  });

  it("is honest about the fixture: the N=2 response body was never archived", () => {
    // A test that reads a derived envelope has to say so, or the next reader
    // will cite it as observed wire behaviour. It is not.
    expect(derivedN2._derivation.status).toBe("DERIVED, NOT OBSERVED");
    expect(derivedN2._derivation.unverified.length).toBeGreaterThan(0);
  });
});
