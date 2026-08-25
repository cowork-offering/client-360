import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { bundleAsOf, computeSuggestions, detectDrift, freshnessSentence, type Suggestion } from "./suggestionEngine";
import { DEMO_POLICY_PACK, resolveThreshold, resolveSwitch, type PolicyPack } from "../policy/policyPack";

const ASOF = "2026-07-26T09:00:00Z";
const ID = "001TEST";

function data(bundle: BorrowerBundle): C360Data {
  return {
    meta: { anchorAccountId: ID, generatedAt: ASOF },
    portfolio: { accounts: [{ accountId: ID, name: "Testco" }] },
    borrower: bundle,
    borrowers: { [ID]: bundle },
  } as unknown as C360Data;
}

/** Coverage 0.95x against a 1.10x floor -> the rule fires. */
function shortBundle(): BorrowerBundle {
  return {
    snapshot: { accountId: ID, name: "Testco" },
    exposure: {
      totalCommitted: 10_000_000,
      totalOutstanding: 9_700_000,
      facilities: [{ loanId: "L1", name: "Revolver", totalLendableValue: 9_200_000 }],
    },
    covenants: { covenants: [{ covenantType: "Debt Service Coverage Ratio", actualValue: 1.38, thresholdValue: 1.3 }] },
  };
}

const run = (b: BorrowerBundle, actionId = "collateral-valuation", pack?: PolicyPack, proposed?: number | null) =>
  computeSuggestions({ data: data(b), bundle: b, actionId, pack, proposedCommitment: proposed });

describe("policy pack (A33.2.5)", () => {
  it("resolves configured thresholds with their version", () => {
    const t = resolveThreshold("collateral.coverageFloor");
    expect(t.resolved).toBe(true);
    if (t.resolved) {
      expect(t.value).toBe(1.1);
      expect(t.policyVersion).toBe("demo-2026-07");
    }
  });

  it("carries the demo pack values from A33.2.5a", () => {
    expect(DEMO_POLICY_PACK.values["collateral.coverageFloor"]).toBe(1.1);
    expect(DEMO_POLICY_PACK.values["covenant.cushionAlertFloor"]).toBe(15);
    expect(DEMO_POLICY_PACK.values["modification.subsumesValuation"]).toBe(false);
    expect(DEMO_POLICY_PACK.version).toBe("demo-2026-07");
  });

  it("subsumesValuation is OFF, so a modification never auto-pulls a valuation", () => {
    expect(resolveSwitch("modification.subsumesValuation")).toBe(false);
  });

  it("a missing key does NOT default — it reports the key", () => {
    const empty: PolicyPack = { version: "empty-pack", label: "t", values: {} };
    const t = resolveThreshold("collateral.coverageFloor", empty);
    expect(t.resolved).toBe(false);
    if (!t.resolved) expect(t.missingKey).toBe("collateral.coverageFloor");
  });
});

describe("A33.2.6 — the five input guards", () => {
  it("guard 1: a MISSING input produces a named gap, not a suggestion", () => {
    const b = shortBundle();
    delete b.exposure!.facilities![0].totalLendableValue;
    const r = run(b);
    expect(r.suggestions.find((s) => s.id === "coverage-shortfall")).toBeUndefined();
    const gap = r.gaps.find((g) => g.reason === "missing" && g.path.includes("totalLendableValue"))!;
    expect(gap).toBeTruthy();
    expect(gap.sourceSystem).toBe("Customer360Exposure");
  });

  it("guard 2: a NULL input is distinct from a missing one", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].totalLendableValue = null as unknown as number;
    const r = run(b);
    const gap = r.gaps.find((g) => g.path.includes("totalLendableValue"))!;
    expect(gap.reason).toBe("null");
  });

  it("a ZERO lendable value and a MISSING one produce different states", () => {
    const zero = shortBundle();
    zero.exposure!.facilities![0].totalLendableValue = 0;
    const zeroRun = run(zero);
    // Zero is a real figure: the rule computes and fires at 0.00x coverage.
    const s = zeroRun.suggestions.find((x) => x.id === "coverage-shortfall")!;
    expect(s.trigger.value).toBe(0);
    expect(zeroRun.gaps.some((g) => g.path.includes("totalLendableValue"))).toBe(false);

    const missing = shortBundle();
    delete missing.exposure!.facilities![0].totalLendableValue;
    const missingRun = run(missing);
    expect(missingRun.suggestions.some((x) => x.id === "coverage-shortfall")).toBe(false);
    expect(missingRun.gaps.some((g) => g.reason === "missing")).toBe(true);
  });

  it("guard 3: NaN and Infinity are rejected as not finite", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const b = shortBundle();
      b.exposure!.facilities![0].totalLendableValue = bad;
      const r = run(b);
      expect(r.gaps.find((g) => g.path.includes("totalLendableValue"))?.reason, String(bad)).toBe("not_finite");
      expect(r.suggestions.some((s) => s.id === "coverage-shortfall")).toBe(false);
    }
  });

  it("guard 4: a zero denominator is refused, never divided by", () => {
    const b = shortBundle();
    b.exposure!.totalCommitted = 0;
    const r = run(b);
    const gap = r.gaps.find((g) => g.reason === "denominator_not_positive")!;
    expect(gap).toBeTruthy();
    expect(r.suggestions.some((s) => s.id === "coverage-shortfall")).toBe(false);
  });

  it("guard 5: an unconfigured threshold disables the rule and names the key", () => {
    const empty: PolicyPack = { version: "empty-pack", label: "t", values: {} };
    const r = run(shortBundle(), "collateral-valuation", empty);
    expect(r.suggestions).toHaveLength(0);
    const gap = r.gaps.find((g) => g.reason === "policy_key_missing")!;
    expect(gap.path).toBe("collateral.coverageFloor");
    expect(gap.detail).toMatch(/not configured/);
    expect(gap.detail).toMatch(/rather than defaulted/);
  });

  it("never substitutes a zero or coerces a null into a figure", () => {
    const b = shortBundle();
    delete b.exposure!.facilities![0].totalLendableValue;
    const r = run(b);
    for (const s of r.suggestions) expect(s.trigger.value).not.toBeNaN();
    expect(r.gaps.length).toBeGreaterThan(0);
  });
});

describe("A33.2.4(a) — coverage shortfall", () => {
  it("fires below the floor and reports the gap as a currency figure", () => {
    const s = run(shortBundle()).suggestions.find((x) => x.id === "coverage-shortfall")!;
    expect(s.trigger.value).toBeCloseTo(0.92, 2);
    expect(s.trigger.threshold).toBe(1.1);
    expect(s.defaultAction.actionId).toBe("collateral-valuation");
    expect(s.rationale).toMatch(/dollars/); // a currency figure, not an adjective
    expect(s.source).toBe("NCINO");
  });

  it("does not fire when coverage clears the floor", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].totalLendableValue = 20_000_000;
    expect(run(b).suggestions.some((s) => s.id === "coverage-shortfall")).toBe(false);
  });

  it("measures against the PROPOSED commitment when one is on the table", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].totalLendableValue = 12_000_000; // clears 10M, not 13M
    expect(run(b).suggestions.some((s) => s.id === "coverage-shortfall")).toBe(false);
    const proposed = run(b, "loan-modification", undefined, 13_000_000);
    expect(proposed.suggestions.some((s) => s.id === "coverage-shortfall")).toBe(true);
  });

  it("ignores closed facilities when summing lendable value", () => {
    const b = shortBundle();
    b.exposure!.facilities = [
      { loanId: "L1", totalLendableValue: 9_200_000 },
      { loanId: "L2", status: "Paid Off", totalLendableValue: 50_000_000 },
    ];
    expect(run(b).suggestions.some((s) => s.id === "coverage-shortfall")).toBe(true);
  });

  it("stamps asOf and policyVersion for the confirm-gate recompute", () => {
    const s = run(shortBundle()).suggestions[0];
    expect(s.asOf).toBe(ASOF);
    expect(s.policyVersion).toBe("demo-2026-07");
    expect(s.inputs.length).toBeGreaterThan(0);
    expect(s.override).toEqual({ allowed: true, reasonRequired: true });
  });
});

describe("A33.2.4(b) — cushion compression", () => {
  it("fires when the tightest cushion falls below the alert floor", () => {
    const b = shortBundle();
    // 1.32 vs 1.30 -> about 2 percent cushion, below the 15 percent floor.
    b.covenants = { covenants: [{ covenantType: "Debt Service Coverage Ratio", actualValue: 1.32, thresholdValue: 1.3 }] };
    const s = run(b, "covenant-review").suggestions.find((x) => x.id === "cushion-compression")!;
    expect(s).toBeTruthy();
    expect(s.trigger.threshold).toBe(15);
    expect(s.defaultAction.actionId).toBe("covenant-review");
    expect(s.rationale).toMatch(/alert, not a breach/);
  });

  it("does not fire on a comfortable cushion", () => {
    const b = shortBundle();
    b.covenants = { covenants: [{ covenantType: "DSC", actualValue: 2.0, thresholdValue: 1.25 }] };
    expect(run(b).suggestions.some((s) => s.id === "cushion-compression")).toBe(false);
  });

  it("describes a breach as a breach", () => {
    const b = shortBundle();
    b.covenants = { covenants: [{ covenantType: "DSC", actualValue: 1.0, thresholdValue: 1.25, breached: true }] };
    const s = run(b).suggestions.find((x) => x.id === "cushion-compression")!;
    expect(s.rationale).toMatch(/at or past its threshold/);
  });

  it("ignores a WAIVED covenant, even one past its threshold", () => {
    const b = shortBundle();
    // Not enforced this period, so its cushion must not raise a covenant review
    // (domain/covenantStatus.ts).
    b.covenants = { covenants: [{ covenantType: "DSC", actualValue: 1.0, thresholdValue: 1.25, lastEvaluationStatus: "Waived" }] };
    expect(run(b).suggestions.some((s) => s.id === "cushion-compression")).toBe(false);
  });

  it("still fires on an Exception whose measured value misses, and calls it a breach", () => {
    const b = shortBundle();
    b.covenants = {
      covenants: [{ covenantType: "DSC", actualValue: 1.0, thresholdValue: 1.25, lastEvaluationStatus: "Exception" }],
    };
    const s = run(b).suggestions.find((x) => x.id === "cushion-compression")!;
    expect(s.rationale).toMatch(/at or past its threshold/);
  });

  it("gaps a covenant with an unusable threshold instead of dividing by it", () => {
    const b = shortBundle();
    b.covenants = { covenants: [{ covenantType: "DSC", actualValue: 1.2, thresholdValue: 0 }] };
    const r = run(b);
    expect(r.gaps.some((g) => g.reason === "denominator_not_positive")).toBe(true);
  });
});

describe("A33.2.4(c) — junction carryover", () => {
  /** A read that CARRIES the junction field and says there are none. */
  const stated = (): BorrowerBundle => {
    const b = shortBundle();
    b.exposure!.facilities![0].loanCovenants = [];
    return b;
  };

  it("only applies to renewal and modification", () => {
    expect(run(stated(), "annual-review").suggestions.some((s) => s.id === "junction-carryover")).toBe(false);
    expect(run(stated(), "renewal").suggestions.some((s) => s.id === "junction-carryover")).toBe(true);
  });

  it("an EMPTY junction list is a fact, stated explicitly, never blank space", () => {
    const s = run(stated(), "renewal").suggestions.find((x) => x.id === "junction-carryover")!;
    expect(s.trigger.value).toBe(0);
    expect(s.rationale).toMatch(/No loan-level covenants are attached/);
    expect(s.rationale).toMatch(/Account-level covenants are unaffected/);
  });

  it("lists the junctions that will clone when they exist", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].loanCovenants = [{ id: "lc1", covenantType: "DSCR" }, { id: "lc2", covenantType: "Liquidity" }];
    const s = run(b, "renewal").suggestions.find((x) => x.id === "junction-carryover")!;
    expect(s.trigger.value).toBe(2);
    expect(s.rationale).toMatch(/nothing is carried or deleted automatically/);
    // Named, not only counted: which covenant travels is the actionable half.
    expect(s.rationale).toContain("DSCR on Revolver");
  });

  /* Founder, live Hartwell test 2026-08-25. The rule consulted ONE of the two
     reads that carry this fact, and the one it consulted is the one the live
     read leaves null — so the card stated as a fact that no covenant attaches
     to a facility that plainly has one. */
  it("reads the covenant side of the junction too, not only the exposure side", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].loanId = "a4Zbb0000027MaYEAU";
    b.exposure!.facilities![0].name = "Testco - Line of Credit - $15,000,000.00";
    b.covenants = {
      covenants: [
        {
          covenantType: "Accounts Receivable",
          actualValue: 80,
          thresholdValue: 80,
          attachedLoans: [{ loanId: "a4Zbb0000027MaYEAU", loanName: "Testco - Line of Credit - $15,000,000.00" }],
        },
      ],
    };
    const s = run(b, "loan-modification").suggestions.find((x) => x.id === "junction-carryover")!;
    expect(s.trigger.value).toBe(1);
    expect(s.verdict).toBe("1 loan-level covenant attachment carries onto the new facility.");
    expect(s.rationale).toContain("Accounts Receivable on Line of Credit - $15,000,000.00");
  });

  it("counts a junction ONCE when both reads carry it", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].loanCovenants = [{ id: "lc1", covenantType: "Accounts Receivable" }];
    b.covenants = {
      covenants: [
        {
          covenantType: "Accounts Receivable",
          actualValue: 80,
          thresholdValue: 80,
          attachedLoans: [{ loanId: "L1", loanName: "Revolver" }],
        },
      ],
    };
    expect(run(b, "renewal").suggestions.find((x) => x.id === "junction-carryover")!.trigger.value).toBe(1);
  });

  it("ignores an attachment onto a facility this read does not stage", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].loanCovenants = [];
    b.covenants = {
      covenants: [
        {
          covenantType: "Accounts Receivable",
          actualValue: 80,
          thresholdValue: 80,
          attachedLoans: [{ loanId: "SOME-OTHER-LOAN", loanName: "Not on this relationship" }],
        },
      ],
    };
    expect(run(b, "renewal").suggestions.find((x) => x.id === "junction-carryover")!.trigger.value).toBe(0);
  });

  it("refuses to call an ABSENT junction list an empty one", () => {
    // Neither read carries the field. "Cannot tell" is not "none", and a
    // renewal briefed on "none" would silently carry a covenant it never named.
    const r = run(shortBundle(), "renewal");
    expect(r.suggestions.some((s) => s.id === "junction-carryover")).toBe(false);
    const gap = r.gaps.find((g) => g.ruleId === "junction-carryover")!;
    expect(gap.note).toContain("does not say which covenants are attached");
    expect(gap.note).toContain("Sync this relationship");
    expect(gap.detail).toContain("an absent junction list is not an empty one");
  });
});

describe("A33.2.7 — recompute at confirm blocks on drift", () => {
  const displayed = (): Suggestion[] => run(shortBundle()).suggestions;

  it("passes when nothing moved", () => {
    const was = displayed();
    expect(detectDrift(was, run(shortBundle()), ASOF)).toEqual([]);
  });

  it("blocks when the trigger value moved", () => {
    const was = displayed();
    const moved = shortBundle();
    moved.exposure!.facilities![0].totalLendableValue = 5_000_000;
    const drift = detectDrift(was, run(moved), ASOF);
    expect(drift.some((d) => d.kind === "value_moved")).toBe(true);
  });

  it("blocks when the policy version changed", () => {
    const was = displayed();
    const other: PolicyPack = { version: "other-pack", label: "x", values: { "collateral.coverageFloor": 1.1 } };
    const drift = detectDrift(was, run(shortBundle(), "collateral-valuation", other), ASOF);
    expect(drift.some((d) => d.kind === "policy_changed")).toBe(true);
  });

  it("blocks when the staged bundle was replaced", () => {
    const was = displayed();
    const drift = detectDrift(was, run(shortBundle()), "2026-07-27T09:00:00Z");
    expect(drift.some((d) => d.kind === "data_replaced")).toBe(true);
  });

  it("blocks when a suggestion vanished entirely", () => {
    const was = displayed();
    const fixed = shortBundle();
    fixed.exposure!.facilities![0].totalLendableValue = 50_000_000;
    const drift = detectDrift(was, run(fixed), ASOF);
    expect(drift.some((d) => d.kind === "suggestion_vanished")).toBe(true);
  });
});

describe("engine hygiene", () => {
  it("reports an unstaged relationship as a named gap, never an all-clear", () => {
    const r = computeSuggestions({ data: data(shortBundle()), bundle: null, actionId: "annual-review" });
    expect(r.suggestions).toHaveLength(0);
    expect(r.gaps[0].detail).toMatch(/not staged/);
  });

  it("is deterministic — the same inputs give the same output", () => {
    const a = JSON.stringify(run(shortBundle()));
    const b = JSON.stringify(run(shortBundle()));
    expect(a).toBe(b);
  });
});

describe("the coverage rule on the new exposure contract", () => {
  /* `totalLendableValue` kept its name and changed its meaning: it now carries
     the facility's PLEDGED SHARE. Summing shares is correct by construction —
     a cross-pledged asset contributes once in total, not once per pledge — so
     the rule's arithmetic is unchanged. What IS new is that the share can be
     null, and that the org now says why. */

  it("reads totalPledgedValue, the unambiguous alias, in preference", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].totalPledgedValue = 5_000_000;
    b.exposure!.facilities![0].totalLendableValue = 9_200_000;
    const s = run(b).suggestions.find((x) => x.id === "coverage-shortfall")!;
    // 5.0MM / 10.0MM, the alias, not 9.2MM / 10.0MM.
    expect(s.trigger.value).toBe(0.5);
  });

  it("sums the SHARES across facilities, so a cross-pledged asset counts once", () => {
    const b = shortBundle();
    b.exposure!.facilities = [
      { loanId: "L1", name: "Revolver", totalPledgedValue: 8_000_000 },
      { loanId: "L2", name: "Term", totalPledgedValue: 1_600_000 },
    ];
    const s = run(b).suggestions.find((x) => x.id === "coverage-shortfall")!;
    expect(s.trigger.value).toBe(0.96);
    // The basis is named for what it IS. With no proposal on the table the
    // denominator is the committed exposure on file, and the card must not
    // call that pro-forma (founder finding F2, 2026-08-25).
    expect(s.trigger.formula).toBe("sum(active facility pledged share) / committed exposure");
    expect(s.trigger.figure).toBe("collateral coverage");
    const proposed = run(b, "collateral-valuation", undefined, 12_000_000).suggestions.find(
      (x) => x.id === "coverage-shortfall",
    )!;
    expect(proposed.trigger.formula).toBe("sum(active facility pledged share) / proposed commitment");
    expect(proposed.trigger.figure).toBe("pro-forma collateral coverage");
  });

  it("puts the org's OWN reason on the gap card when the share is null", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].totalLendableValue = null;
    b.exposure!.facilities![0].coverageNote =
      "No coverage ratio: all 3 collateral pledges on this facility are flagged Excluded or Abundance-of-Caution, which puts them out of the coverage math.";
    const gap = run(b).gaps.find((g) => g.path.includes("totalLendableValue"))!;
    expect(gap.reason).toBe("null");
    // Actionable: a banker can chase an Abundance-of-Caution flag. Nobody can
    // chase "present but null".
    expect(gap.detail).toContain("Abundance-of-Caution");
    expect(gap.detail).toContain("Revolver");
  });

  it("still says plainly 'present but null' when the org offers no reason", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].totalLendableValue = null;
    const gap = run(b).gaps.find((g) => g.path.includes("totalLendableValue"))!;
    expect(gap.detail).toContain("present but null");
    // No reason on file means no reason invented, and no facility named as if
    // one had been given.
    expect(gap.detail).not.toContain("Revolver");
  });
});

/* =============================================================================
   FOUNDER UAT, 2026-08-25 — F2 verdicts, F3 freshness, F4 banker language.

   Three findings, one engine. The panel could not lead with a verdict the
   engine never produced, could not quote the live read the engine never got
   told about, and could not keep a contract path off the screen while the only
   sentence a gap carried WAS a contract path.
   ============================================================================= */

describe("F2 — every finding leads with a verdict, toned by what the arithmetic found", () => {
  it("gives the coverage shortfall a verdict, an ask-shaped one, at alert severity", () => {
    const s = run(shortBundle()).suggestions.find((x) => x.id === "coverage-shortfall")!;
    expect(s.verdict).toBe("Collateral coverage is 0.92x, below the 1.10x floor.");
    expect(s.severity).toBe("warning");
    // The verdict is a SENTENCE about the decision, not a repeat of the figure
    // name, and it comes before the detail rather than instead of it.
    expect(s.rationale).not.toBe(s.verdict);
  });

  it("says 'would fall below' only when a proposal is actually on the table", () => {
    const s = run(shortBundle(), "collateral-valuation", undefined, 12_000_000).suggestions.find(
      (x) => x.id === "coverage-shortfall",
    )!;
    expect(s.verdict).toBe("Coverage would fall below the 1.10x floor.");
  });

  it("raises a breached covenant to critical and an alert to warning", () => {
    const tight = shortBundle();
    tight.covenants = { covenants: [{ covenantType: "Debt Service Coverage Ratio", actualValue: 1.31, thresholdValue: 1.3 }] };
    const alert = run(tight).suggestions.find((x) => x.id === "cushion-compression")!;
    expect(alert.severity).toBe("warning");
    expect(alert.verdict).toContain("below the 15 percent alert floor");

    const broken = shortBundle();
    broken.covenants = { covenants: [{ covenantType: "Debt Service Coverage Ratio", actualValue: 1.1, thresholdValue: 1.3 }] };
    const breach = run(broken).suggestions.find((x) => x.id === "cushion-compression")!;
    expect(breach.severity).toBe("critical");
    expect(breach.verdict).toBe("Debt Service Coverage Ratio is at or past its threshold.");
  });

  it("keeps the junction carryover as information, because nothing about it is wrong", () => {
    const b = shortBundle();
    b.exposure!.facilities![0].loanCovenants = [];
    const s = run(b, "loan-modification").suggestions.find((x) => x.id === "junction-carryover")!;
    expect(s.severity).toBe("info");
    expect(s.verdict).toBe("No loan-level covenants carry onto the new facility.");
  });

  it("names the policy pack for a banker and keeps its id for the ledger", () => {
    const s = run(shortBundle()).suggestions[0];
    expect(s.policyVersion).toBe("demo-2026-07");
    expect(s.policyLabel).toBe("Demo policy pack (WS2 policy layer pending)");
  });
});

describe("F3 — the check quotes the read it actually ran on", () => {
  const SYNCED = Date.parse("2026-08-25T10:30:00Z");

  it("falls back to the baked bundle's own clock when nothing has been synced", () => {
    const s = run(shortBundle()).suggestions[0];
    expect(s.freshness.live).toBe(false);
    expect(s.freshness.asOf).toBe(ASOF);
    expect(s.asOf).toBe(ASOF);
    expect(freshnessSentence(s.freshness)).toContain("as it was prepared on");
    expect(freshnessSentence(s.freshness)).toContain("Sync this relationship");
  });

  it("quotes the SYNC's own instant once a live read has replaced the bundle", () => {
    const b = shortBundle();
    const r = computeSuggestions({
      data: data(b),
      bundle: b,
      actionId: "collateral-valuation",
      liveStoredAt: SYNCED,
      liveSections: ["exposure", "covenants"],
    });
    const s = r.suggestions.find((x) => x.id === "coverage-shortfall")!;
    expect(s.freshness.live).toBe(true);
    expect(s.freshness.asOf).toBe("2026-08-25T10:30:00.000Z");
    expect(s.freshness.bakedSections).toEqual([]);
    expect(freshnessSentence(s.freshness)).toBe(
      "Checked against the relationship as it was read from nCino on Aug 25, 2026, 10:30 UTC.",
    );
  });

  it("says in banker language which figures that sync did NOT refresh", () => {
    const b = shortBundle();
    const r = computeSuggestions({
      data: data(b),
      bundle: b,
      actionId: "collateral-valuation",
      liveStoredAt: SYNCED,
      // A sync that carried exposure but not covenants: the cushion rule is
      // live in its clock and baked in its inputs, and must say so.
      liveSections: ["exposure"],
    });
    const cushion = r.suggestions.find((x) => x.id === "cushion-compression");
    const coverage = r.suggestions.find((x) => x.id === "coverage-shortfall")!;
    expect(coverage.freshness.bakedSections).toEqual([]);
    if (cushion) {
      expect(cushion.freshness.bakedSections).toEqual(["covenants"]);
      const line = freshnessSentence(cushion.freshness);
      expect(line).toContain("except the covenant figures");
      expect(line).not.toContain("covenants");
    }
  });

  it("bundleAsOf gives the panel one instant, on the same rule", () => {
    const b = shortBundle();
    expect(bundleAsOf({ data: data(b), liveStoredAt: null })).toBe(ASOF);
    expect(bundleAsOf({ data: data(b), liveStoredAt: SYNCED })).toBe("2026-08-25T10:30:00.000Z");
  });

  it("does not report drift when the plan is rechecked against the SAME live read", () => {
    const b = shortBundle();
    const ctx = { data: data(b), bundle: b, actionId: "collateral-valuation", liveStoredAt: SYNCED, liveSections: ["exposure", "covenants"] };
    const first = computeSuggestions(ctx);
    const again = computeSuggestions(ctx);
    expect(detectDrift(first.suggestions, again, bundleAsOf(ctx))).toEqual([]);
  });
});

describe("F4 — a gap says what it MEANS, and keeps the path behind it", () => {
  it("turns the null covenant value into a sentence a banker can act on", () => {
    const b = shortBundle();
    b.covenants = {
      covenants: [
        { covenantType: "Term Covenants", actualValue: null as unknown as number, thresholdValue: null as unknown as number },
        { covenantType: "Debt Service Coverage Ratio", actualValue: 1.38, thresholdValue: 1.3 },
      ],
    };
    const gap = run(b).gaps.find((g) => g.path.includes("actualValue"))!;
    expect(gap.note).toBe("The last test of Term Covenants carries no measured value, so its cushion could not be computed.");
    // The technical half is still there, and it is still exact.
    expect(gap.detail).toContain("present but null");
    expect(gap.path).toBe("borrower.covenants.covenants[].actualValue");
    expect(gap.sourceSystem).toBe("Customer360Covenants");
  });

  it("carries a banker sentence on EVERY gap the engine can emit", () => {
    const cases: BorrowerBundle[] = [];
    const noFacilities = shortBundle();
    noFacilities.exposure = { totalCommitted: 1, facilities: [] };
    cases.push(noFacilities);

    const noCovenants = shortBundle();
    noCovenants.covenants = { covenants: [] };
    cases.push(noCovenants);

    const nullShare = shortBundle();
    nullShare.exposure!.facilities![0].totalLendableValue = null;
    cases.push(nullShare);

    const zeroBasis = shortBundle();
    zeroBasis.exposure!.totalCommitted = 0;
    cases.push(zeroBasis);

    const noThreshold = shortBundle();
    noThreshold.covenants = { covenants: [{ covenantType: "Minimum Liquidity", actualValue: 4, thresholdValue: null as unknown as number }] };
    cases.push(noThreshold);

    const zeroThreshold = shortBundle();
    zeroThreshold.covenants = { covenants: [{ covenantType: "Minimum Liquidity", actualValue: 4, thresholdValue: 0 }] };
    cases.push(zeroThreshold);

    const gaps = cases.flatMap((b) => run(b).gaps);
    // Plus the two the engine reaches only through its own edges.
    gaps.push(...computeSuggestions({ data: data(shortBundle()), bundle: null, actionId: "collateral-valuation" }).gaps);
    gaps.push(
      ...run(shortBundle(), "collateral-valuation", { version: "empty-pack", label: "Empty pack", values: {} }).gaps,
    );

    expect(gaps.length).toBeGreaterThan(6);
    for (const g of gaps) {
      expect(g.note.length).toBeGreaterThan(20);
      // NO CONTRACT PATH, NO TOOL NAME, NO WIRE FIELD in the rendered sentence.
      expect(g.note).not.toMatch(/borrower\.|\[\]|Customer360|productPackageId|null\b/);
    }
  });
});
