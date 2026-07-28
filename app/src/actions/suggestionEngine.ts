/* =============================================================================
   SUGGESTION ENGINE — TIER 1 (A33.2)

   Deterministic math first, language second. A suggestion exists ONLY when a
   deterministic credit calculation over C360_DATA produces its trigger figure.
   The LLM phrases suggestions; it never originates one (that is Tier 2, which
   rides the chat path and is governed by the grounding and registry rails).

   Tier 1 is deliberately rigid, and the rigidity is the point: every suggestion
   it emits can be recomputed by a third party from the same staged data and the
   same policy pack. That is what makes the surface SR 11-7 defensible.

   THE FIVE INPUT GUARDS (A33.2.6) are absolute. A trigger computes only if
   every input is present, non-null, finite, every denominator is strictly
   positive, and the threshold resolved from the policy layer. Any failure
   produces NO suggestion plus a NAMED GAP saying which input, which path, which
   source system. Never a substituted zero, never a coerced null, never a default
   threshold, never a silent drop. A zero lendable value and a MISSING lendable
   value are different facts and must not render the same way.
   ============================================================================= */

import type { BorrowerBundle, C360Data, Covenant, ProvenanceKind } from "../data/contract";
import { covenantCushion } from "../data/finance";
import { isActiveFacility } from "../data/worklist";
import { ACTIVE_POLICY_PACK, resolveThreshold, type PolicyKey, type PolicyPack } from "../policy/policyPack";

export interface SuggestionInput {
  path: string;
  value: number | null;
  provenance: ProvenanceKind;
}

export interface SuggestionTrigger {
  figure: string;
  value: number;
  threshold: number;
  formula: string;
}

export interface Suggestion {
  id: string;
  trigger: SuggestionTrigger;
  inputs: SuggestionInput[];
  /** meta.generatedAt of the data this was computed from (A33.2.7 binding). */
  asOf: string;
  /** Policy pack id supplying the threshold (A33.2.7 binding). */
  policyVersion: string;
  /** AGENT phrasing over the deterministic figure. */
  rationale: string;
  /** Provenance of the TRIGGER FIGURE, not of the phrasing. */
  source: ProvenanceKind;
  defaultAction: { actionId: string; params: Record<string, unknown> };
  override: { allowed: true; reasonRequired: true };
}

/** Why a rule produced nothing. Never rendered as an all-clear (A33.2.1). */
export interface NamedGap {
  ruleId: string;
  /** Which input failed. */
  input: string;
  /** Dotted path into C360_DATA, so the gap is actionable. */
  path: string;
  /** Which system owns it. */
  sourceSystem: string;
  reason: "missing" | "null" | "not_finite" | "denominator_not_positive" | "policy_key_missing";
  detail: string;
}

export interface EngineResult {
  suggestions: Suggestion[];
  gaps: NamedGap[];
}

/* ------------------------------------------------------------- guards 1-4 */

type GuardOk = { ok: true; value: number };
type GuardFail = { ok: false; gap: Omit<NamedGap, "ruleId"> };

/** Guards 1 to 3: present, non-null, finite. Distinguishes missing from null,
 *  because they are different facts (A33.2.6). */
function requireNumber(
  value: unknown,
  input: string,
  path: string,
  sourceSystem: string,
  present: boolean,
): GuardOk | GuardFail {
  if (!present) {
    return { ok: false, gap: { input, path, sourceSystem, reason: "missing", detail: `${path} is not present on the staged bundle` } };
  }
  if (value === null || value === undefined) {
    return { ok: false, gap: { input, path, sourceSystem, reason: "null", detail: `${path} is present but null` } };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, gap: { input, path, sourceSystem, reason: "not_finite", detail: `${path} is not a finite number` } };
  }
  return { ok: true, value };
}

/** Guard 4: denominators must be strictly greater than zero. */
function requirePositive(value: number, input: string, path: string, sourceSystem: string): GuardOk | GuardFail {
  if (!(value > 0)) {
    return {
      ok: false,
      gap: { input, path, sourceSystem, reason: "denominator_not_positive", detail: `${path} must be greater than zero to divide by it, got ${value}` },
    };
  }
  return { ok: true, value };
}

/** Guard 5: threshold resolved from the policy layer, never defaulted. */
function requireThreshold(key: PolicyKey, ruleId: string, pack: PolicyPack): { ok: true; value: number; policyVersion: string } | { ok: false; gap: NamedGap } {
  const t = resolveThreshold(key, pack);
  if (!t.resolved) {
    return {
      ok: false,
      gap: {
        ruleId,
        input: "policy threshold",
        path: key,
        sourceSystem: `bank policy pack ${t.policyVersion}`,
        reason: "policy_key_missing",
        detail: `policy key ${t.missingKey} is not configured in pack ${t.policyVersion}; the rule is disabled rather than defaulted`,
      },
    };
  }
  return { ok: true, value: t.value, policyVersion: t.policyVersion };
}

/* ------------------------------------------------- rule (a) coverage floor */

const NCINO_EXPOSURE = "Customer360Exposure";

/**
 * A33.2.4(a) — collateral coverage shortfall against the proposed commitment.
 *
 * Product: the arithmetic. Bank: the coverage floor, and whether a modification
 * requires a fresh valuation at all (subsumesValuation, parked by A31.5 and
 * resolved OFF in the demo pack — suggest-only, never auto-pulled into a plan).
 */
function ruleCoverageShortfall(
  bundle: BorrowerBundle,
  asOf: string,
  proposedCommitment: number | null,
  pack: PolicyPack,
): EngineResult {
  const RULE = "coverage-shortfall";
  const gaps: NamedGap[] = [];

  const th = requireThreshold("collateral.coverageFloor", RULE, pack);
  if (!th.ok) return { suggestions: [], gaps: [th.gap] };

  const facs = (bundle.exposure?.facilities ?? []).filter(isActiveFacility);
  if (!facs.length) {
    return {
      suggestions: [],
      gaps: [{ ruleId: RULE, input: "active facilities", path: "borrower.exposure.facilities[]", sourceSystem: NCINO_EXPOSURE, reason: "missing", detail: "no active facility to measure coverage against" }],
    };
  }

  // The facility PLEDGED SHARE, org-computed. Summing these is correct by
  // construction — a share is this facility's slice of the collateral, so a
  // cross-pledged asset contributes once in total rather than once per pledge.
  // A MISSING share is still not a zero, and the org now usually says why.
  let lendable = 0;
  for (const f of facs) {
    const present = Object.hasOwn(f, "totalPledgedValue") || Object.hasOwn(f, "totalLendableValue");
    const raw = f.totalPledgedValue ?? f.totalLendableValue;
    const g = requireNumber(raw, "pledged share", "borrower.exposure.facilities[].totalLendableValue", NCINO_EXPOSURE, present);
    if (!g.ok) {
      // The gap card carries the ORG'S OWN reason where the read supplies one.
      // "all 3 pledges are Abundance-of-Caution" is actionable; "present but
      // null" sends a banker to look for a defect that is not there.
      const detail = f.coverageNote
        ? `${g.gap.detail} — ${f.name ?? "the facility"}: ${f.coverageNote}`
        : g.gap.detail;
      gaps.push({ ruleId: RULE, ...g.gap, detail });
      return { suggestions: [], gaps };
    }
    lendable += g.value;
  }

  // Denominator: the proposed commitment when one is on the table, else current.
  const basisRaw = proposedCommitment ?? bundle.exposure?.totalCommitted;
  const basisPresent = proposedCommitment !== null || Object.hasOwn(bundle.exposure ?? {}, "totalCommitted");
  const basisG = requireNumber(basisRaw, "commitment basis", "borrower.exposure.totalCommitted", NCINO_EXPOSURE, basisPresent);
  if (!basisG.ok) {
    gaps.push({ ruleId: RULE, ...basisG.gap });
    return { suggestions: [], gaps };
  }
  const posG = requirePositive(basisG.value, "commitment basis", "borrower.exposure.totalCommitted", NCINO_EXPOSURE);
  if (!posG.ok) {
    gaps.push({ ruleId: RULE, ...posG.gap });
    return { suggestions: [], gaps };
  }

  const coverage = lendable / posG.value;
  if (coverage >= th.value) return { suggestions: [], gaps };

  // The gap is a CURRENCY figure, never an adjective (A33.2.4(a)).
  const shortfall = th.value * posG.value - lendable;

  return {
    gaps,
    suggestions: [
      {
        id: RULE,
        trigger: {
          figure: "pro-forma collateral coverage",
          value: coverage,
          threshold: th.value,
          formula: "sum(active facility pledged share) / proposed commitment",
        },
        inputs: [
          { path: "borrower.exposure.facilities[].totalLendableValue", value: lendable, provenance: "NCINO" },
          { path: "borrower.exposure.totalCommitted", value: posG.value, provenance: "NCINO" },
        ],
        asOf,
        policyVersion: th.policyVersion,
        rationale: `Lendable collateral covers ${coverage.toFixed(2)}x of the proposed commitment, below the ${th.value.toFixed(2)}x floor. Additional security of about ${Math.round(shortfall).toLocaleString("en-US")} dollars, or a fresh valuation, would close the gap.`,
        source: "NCINO",
        defaultAction: { actionId: "collateral-valuation", params: { shortfall, coverage, floor: th.value } },
        override: { allowed: true, reasonRequired: true },
      },
    ],
  };
}

/* ------------------------------------------- rule (b) cushion compression */

const NCINO_COVENANTS = "Customer360Covenants";

/** A33.2.4(b) — pro-forma covenant cushion compression. */
function ruleCushionCompression(bundle: BorrowerBundle, asOf: string, pack: PolicyPack): EngineResult {
  const RULE = "cushion-compression";
  const gaps: NamedGap[] = [];

  const th = requireThreshold("covenant.cushionAlertFloor", RULE, pack);
  if (!th.ok) return { suggestions: [], gaps: [th.gap] };

  const covs = bundle.covenants?.covenants ?? [];
  if (!covs.length) {
    return {
      suggestions: [],
      gaps: [{ ruleId: RULE, input: "covenants", path: "borrower.covenants.covenants[]", sourceSystem: NCINO_COVENANTS, reason: "missing", detail: "no covenants staged for this relationship" }],
    };
  }

  let tightest: { cov: Covenant; pct: number } | null = null;
  for (const c of covs) {
    const actualPresent = Object.hasOwn(c, "actualValue");
    const thresholdPresent = Object.hasOwn(c, "thresholdValue");
    const a = requireNumber(c.actualValue, "covenant actual", "borrower.covenants.covenants[].actualValue", NCINO_COVENANTS, actualPresent);
    if (!a.ok) {
      gaps.push({ ruleId: RULE, ...a.gap });
      continue;
    }
    const t = requireNumber(c.thresholdValue, "covenant threshold", "borrower.covenants.covenants[].thresholdValue", NCINO_COVENANTS, thresholdPresent);
    if (!t.ok) {
      gaps.push({ ruleId: RULE, ...t.gap });
      continue;
    }
    // The cushion percentage divides by the threshold, so guard 4 applies.
    const denom = requirePositive(Math.abs(t.value), "covenant threshold", "borrower.covenants.covenants[].thresholdValue", NCINO_COVENANTS);
    if (!denom.ok) {
      gaps.push({ ruleId: RULE, ...denom.gap });
      continue;
    }
    const cu = covenantCushion(c.covenantType, a.value, t.value);
    const pct = cu.safe === false ? -1 : cu.pct;
    if (!tightest || pct < tightest.pct) tightest = { cov: c, pct };
  }

  if (!tightest || tightest.pct >= th.value) return { suggestions: [], gaps };

  const c = tightest.cov;
  const breached = tightest.pct < 0;
  return {
    gaps,
    suggestions: [
      {
        id: RULE,
        trigger: {
          figure: `${c.covenantType ?? "covenant"} cushion`,
          value: tightest.pct,
          threshold: th.value,
          formula: "cushion / abs(threshold) as a percentage",
        },
        inputs: [
          { path: "borrower.covenants.covenants[].actualValue", value: c.actualValue ?? null, provenance: "NCINO" },
          { path: "borrower.covenants.covenants[].thresholdValue", value: c.thresholdValue ?? null, provenance: "NCINO" },
        ],
        asOf,
        policyVersion: th.policyVersion,
        rationale: breached
          ? `${c.covenantType ?? "A covenant"} is at or past its threshold. A covenant review should record the position before anything else moves.`
          : `${c.covenantType ?? "A covenant"} has about ${tightest.pct} percent cushion, below the ${th.value} percent alert floor. This is an alert, not a breach.`,
        source: "NCINO",
        defaultAction: { actionId: "covenant-review", params: { covenantType: c.covenantType, cushionPct: tightest.pct } },
        override: { allowed: true, reasonRequired: true },
      },
    ],
  };
}

/* --------------------------------------- rule (c) covenant junction carry */

/**
 * A33.2.4(c) — renewal covenant-junction carryover.
 *
 * nCino canon: renewals clone the Loan Covenant JUNCTION, not the covenant, and
 * nCino's own guidance says this "requires a business process to delete the
 * covenants on the renewed or modified loan". We surface the list. We never
 * auto-carry and never auto-delete.
 *
 * bankinggpt caveat honoured here: Piedmont's four covenants are all
 * Account-level with ZERO junction rows, so an empty list is legitimate and
 * renders as "no loan-level covenants attached", never as blank space.
 */
function ruleJunctionCarryover(bundle: BorrowerBundle, asOf: string, actionId: string, pack: PolicyPack): EngineResult {
  const RULE = "junction-carryover";
  if (actionId !== "renewal" && actionId !== "loan-modification") return { suggestions: [], gaps: [] };

  const junctions = (bundle.exposure?.facilities ?? [])
    .filter(isActiveFacility)
    .flatMap((f) => (f.loanCovenants ?? []).map((lc) => ({ facility: f.name, covenant: lc.covenantType ?? lc.name })));

  // No junction rows is a FACT, not a gap. It renders as an explicit statement.
  return {
    gaps: [],
    suggestions: [
      {
        id: RULE,
        trigger: {
          figure: "loan covenant junction rows carried by the clone",
          value: junctions.length,
          threshold: 0,
          formula: "count of LLC_BI__Loan_Covenant__c rows on the parent facility",
        },
        inputs: [{ path: "borrower.exposure.facilities[].loanCovenants[]", value: junctions.length, provenance: "NCINO" }],
        asOf,
        policyVersion: pack.version,
        rationale: junctions.length
          ? `${junctions.length} loan-level covenant ${junctions.length === 1 ? "junction clones" : "junctions clone"} onto the new facility. Review each one; nothing is carried or deleted automatically.`
          : "No loan-level covenants are attached to this facility, so nothing clones onto the new loan. Account-level covenants are unaffected.",
        source: "NCINO",
        defaultAction: { actionId: "covenant-review", params: { junctions } },
        override: { allowed: true, reasonRequired: true },
      },
    ],
  };
}

/* ------------------------------------------------------------- public API */

export interface EngineContext {
  data: C360Data;
  bundle: BorrowerBundle | null;
  actionId: string;
  /** A commitment on the table (from a client request or a panel edit). */
  proposedCommitment?: number | null;
  pack?: PolicyPack;
}

/** Run every Tier 1 rule for an action. Deterministic and side-effect free, so
 *  the confirm gate can recompute it and compare (A33.2.7). */
export function computeSuggestions(ctx: EngineContext): EngineResult {
  const pack = ctx.pack ?? ACTIVE_POLICY_PACK;
  const asOf = ctx.data.meta?.generatedAt ?? "";
  if (!ctx.bundle) {
    return {
      suggestions: [],
      gaps: [{ ruleId: "all", input: "staged bundle", path: "borrowers[accountId]", sourceSystem: "assembler", reason: "missing", detail: "the relationship is not staged in this view" }],
    };
  }

  const results = [
    ruleCoverageShortfall(ctx.bundle, asOf, ctx.proposedCommitment ?? null, pack),
    ruleCushionCompression(ctx.bundle, asOf, pack),
    ruleJunctionCarryover(ctx.bundle, asOf, ctx.actionId, pack),
  ];

  return {
    suggestions: results.flatMap((r) => r.suggestions),
    gaps: results.flatMap((r) => r.gaps),
  };
}

/* --------------------------------------------------- A33.2.7 drift check */

export type DriftReason =
  | { kind: "value_moved"; suggestionId: string; was: number; now: number; figure: string }
  | { kind: "policy_changed"; was: string; now: string }
  | { kind: "data_replaced"; was: string; now: string }
  | { kind: "suggestion_vanished"; suggestionId: string };

/**
 * Mandatory recomputation at the confirm gate (A33.2.7). A plan is NEVER
 * executed against figures the banker did not see, so this compares the
 * suggestions that fed the plan against a fresh computation and reports every
 * divergence. A non-empty result BLOCKS the confirm; the caller re-renders with
 * the new figures and an explicit notice naming what moved.
 */
export function detectDrift(displayed: Suggestion[], fresh: EngineResult, currentGeneratedAt: string): DriftReason[] {
  const out: DriftReason[] = [];
  const byId = new Map(fresh.suggestions.map((s) => [s.id, s]));

  for (const was of displayed) {
    const now = byId.get(was.id);
    if (!now) {
      out.push({ kind: "suggestion_vanished", suggestionId: was.id });
      continue;
    }
    if (now.trigger.value !== was.trigger.value) {
      out.push({ kind: "value_moved", suggestionId: was.id, was: was.trigger.value, now: now.trigger.value, figure: was.trigger.figure });
    }
    if (now.policyVersion !== was.policyVersion) {
      out.push({ kind: "policy_changed", was: was.policyVersion, now: now.policyVersion });
    }
    if (was.asOf !== currentGeneratedAt) {
      out.push({ kind: "data_replaced", was: was.asOf, now: currentGeneratedAt });
    }
  }
  // De-duplicate the page-level reasons, which repeat once per suggestion.
  const seen = new Set<string>();
  return out.filter((d) => {
    const k = d.kind === "value_moved" || d.kind === "suggestion_vanished" ? `${d.kind}:${d.suggestionId}` : d.kind;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
