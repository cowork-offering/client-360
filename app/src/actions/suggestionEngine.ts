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
import { classifyCovenant } from "../domain/covenantStatus";
import { isActiveFacility } from "../data/worklist";
import { shortFacilityName } from "../data/facilityStage";
import { fmtInstant } from "../data/format";
import { ACTIVE_POLICY_PACK, resolveThreshold, type PolicyKey, type PolicyPack } from "../policy/policyPack";

export interface SuggestionInput {
  path: string;
  value: number | null;
  provenance: ProvenanceKind;
}

/**
 * WHICH READ THE CHECK RAN ON (founder finding F3, 2026-08-25).
 *
 * The engine used to stamp every suggestion with `data.meta.generatedAt`, the
 * instant the BAKED bundle was assembled. After a live Sync the ticket reads the
 * merged bundle while the card still claimed the baked date, so the banker was
 * told the check was a month old when it had just been recomputed on today's
 * figures. The freshness now travels with the data it describes.
 */
export interface DataFreshness {
  /** ISO instant of the read this rule consumed. */
  asOf: string;
  /** A sync in THIS session supplied the sections below. */
  live: boolean;
  /** Sections the rule read that the sync did not replace. On a live read these
   *  are the parts still coming from the prepared bundle, and the card says so. */
  bakedSections: string[];
}

/** Bundle sections named the way a banker names them. */
const SECTION_WORDS: Record<string, string> = {
  exposure: "facility and collateral",
  covenants: "covenant",
  snapshot: "relationship",
  boom: "financial spread",
  opportunities: "pipeline",
  signals: "structural signal",
  graph: "relationship graph",
};

const sectionWords = (keys: string[]): string =>
  keys.map((k) => SECTION_WORDS[k] ?? k).join(" and ");

/**
 * The freshness line, in banker language. One sentence, no paths, no tool names.
 *
 * Three cases and they are three different facts: recomputed on a live read,
 * recomputed on a live read whose sync did not cover every input, and never
 * synced at all.
 */
export function freshnessSentence(f: DataFreshness): string {
  const when = fmtInstant(f.asOf);
  if (!f.live) {
    return `Checked against the relationship as it was prepared on ${when}. Sync this relationship to recheck it on today's figures.`;
  }
  if (f.bakedSections.length) {
    return `Checked against the relationship as it was read from nCino on ${when}, except the ${sectionWords(f.bakedSections)} figures, which that sync did not refresh and are still the prepared bundle's.`;
  }
  return `Checked against the relationship as it was read from nCino on ${when}.`;
}

export interface SuggestionTrigger {
  figure: string;
  value: number;
  threshold: number;
  formula: string;
}

/** How hard the card should read. Deterministic, from the same arithmetic that
 *  produced the trigger — never a tone chosen by phrasing. */
export type Severity = "critical" | "warning" | "info";

export interface Suggestion {
  id: string;
  trigger: SuggestionTrigger;
  inputs: SuggestionInput[];
  /** meta.generatedAt of the data this was computed from (A33.2.7 binding). */
  asOf: string;
  /** Which read it ran on, and how much of that read was live (F3). */
  freshness: DataFreshness;
  /** Policy pack id supplying the threshold (A33.2.7 binding). */
  policyVersion: string;
  /** The same pack, named for a banker rather than for the ledger (F5). */
  policyLabel: string;
  /**
   * THE ASK, FIRST (founder finding F2, 2026-08-25).
   *
   * One sentence saying what the figures mean for the decision on the table.
   * The card leads with it and the detail sentence follows, because a banker
   * reading analysis with no verdict asked, correctly, "what should I do with
   * this information?".
   */
  verdict: string;
  severity: Severity;
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
  /**
   * BANKER LANGUAGE, and the only part of a gap that renders inline (F4).
   *
   * The founder read "borrower.covenants.covenants[].actualValue is present but
   * null · Customer360Covenants" on a live ticket. A contract path is not a
   * fact a banker can act on. `note` says what the missing figure MEANS; the
   * path, the system and the raw detail stay below, behind an info toggle.
   */
  note: string;
  /** Dotted path into C360_DATA, so the gap is actionable. TECHNICAL. */
  path: string;
  /** Which system owns it. TECHNICAL. */
  sourceSystem: string;
  reason: "missing" | "null" | "not_finite" | "denominator_not_positive" | "policy_key_missing";
  /** TECHNICAL. Never rendered inline. */
  detail: string;
}

export interface EngineResult {
  suggestions: Suggestion[];
  gaps: NamedGap[];
}

/* ------------------------------------------------------------- guards 1-4 */

/** A guard reports the TECHNICAL half of a gap. The banker-facing `note` is the
 *  rule's to write, because only the rule knows what the missing figure meant
 *  for the check it was running (F4). */
type TechnicalGap = Omit<NamedGap, "ruleId" | "note">;
type GuardOk = { ok: true; value: number };
type GuardFail = { ok: false; gap: TechnicalGap };

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
        note: `The policy pack in force sets no limit for this check, so it was switched off rather than run against a made-up one.`,
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
  freshness: DataFreshness,
  proposedCommitment: number | null,
  pack: PolicyPack,
): EngineResult {
  const RULE = "coverage-shortfall";
  const asOf = freshness.asOf;
  const gaps: NamedGap[] = [];

  const th = requireThreshold("collateral.coverageFloor", RULE, pack);
  if (!th.ok) return { suggestions: [], gaps: [th.gap] };

  const facs = (bundle.exposure?.facilities ?? []).filter(isActiveFacility);
  if (!facs.length) {
    return {
      suggestions: [],
      gaps: [
        {
          ruleId: RULE,
          input: "active facilities",
          note: "This relationship carries no active facility, so there is no commitment to measure collateral coverage against.",
          path: "borrower.exposure.facilities[]",
          sourceSystem: NCINO_EXPOSURE,
          reason: "missing",
          detail: "no active facility to measure coverage against",
        },
      ],
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
      const who = f.name ?? "one facility";
      const detail = f.coverageNote ? `${g.gap.detail}. ${who}: ${f.coverageNote}` : g.gap.detail;
      const note = f.coverageNote
        ? `${who} carries no lendable collateral figure: ${f.coverageNote}. Coverage could not be computed for this relationship.`
        : `${who} carries no lendable collateral figure, so coverage could not be computed for this relationship.`;
      gaps.push({ ruleId: RULE, ...g.gap, note, detail });
      return { suggestions: [], gaps };
    }
    lendable += g.value;
  }

  // Denominator: the proposed commitment when one is on the table, else current.
  const basisRaw = proposedCommitment ?? bundle.exposure?.totalCommitted;
  const basisPresent = proposedCommitment !== null || Object.hasOwn(bundle.exposure ?? {}, "totalCommitted");
  const basisG = requireNumber(basisRaw, "commitment basis", "borrower.exposure.totalCommitted", NCINO_EXPOSURE, basisPresent);
  if (!basisG.ok) {
    gaps.push({
      ruleId: RULE,
      ...basisG.gap,
      note: "No committed amount is on file for this relationship, so there is nothing to measure collateral coverage against.",
    });
    return { suggestions: [], gaps };
  }
  const posG = requirePositive(basisG.value, "commitment basis", "borrower.exposure.totalCommitted", NCINO_EXPOSURE);
  if (!posG.ok) {
    gaps.push({
      ruleId: RULE,
      ...posG.gap,
      note: "The committed amount on file is zero, so a coverage ratio cannot be computed from it.",
    });
    return { suggestions: [], gaps };
  }

  const coverage = lendable / posG.value;
  if (coverage >= th.value) return { suggestions: [], gaps };

  // The gap is a CURRENCY figure, never an adjective (A33.2.4(a)).
  const shortfall = th.value * posG.value - lendable;

  // Present tense when the basis is what the relationship already carries,
  // conditional when a proposal is on the table. The two are different claims
  // and the card must not make the stronger one on the weaker basis.
  const onProposal = proposedCommitment !== null;
  const basisPhrase = onProposal ? "the proposed commitment" : "the committed exposure on file";

  return {
    gaps,
    suggestions: [
      {
        id: RULE,
        trigger: {
          figure: onProposal ? "pro-forma collateral coverage" : "collateral coverage",
          value: coverage,
          threshold: th.value,
          formula: `sum(active facility pledged share) / ${onProposal ? "proposed commitment" : "committed exposure"}`,
        },
        inputs: [
          { path: "borrower.exposure.facilities[].totalLendableValue", value: lendable, provenance: "NCINO" },
          { path: "borrower.exposure.totalCommitted", value: posG.value, provenance: "NCINO" },
        ],
        asOf,
        freshness,
        policyVersion: th.policyVersion,
        policyLabel: pack.label,
        verdict: onProposal
          ? `Coverage would fall below the ${th.value.toFixed(2)}x floor.`
          : `Collateral coverage is ${coverage.toFixed(2)}x, below the ${th.value.toFixed(2)}x floor.`,
        severity: "warning",
        rationale: `Lendable collateral covers ${coverage.toFixed(2)}x of ${basisPhrase}, below the ${th.value.toFixed(2)}x floor. Additional security of about ${Math.round(shortfall).toLocaleString("en-US")} dollars, or a fresh valuation, would close the gap.`,
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
function ruleCushionCompression(bundle: BorrowerBundle, freshness: DataFreshness, pack: PolicyPack): EngineResult {
  const RULE = "cushion-compression";
  const asOf = freshness.asOf;
  const gaps: NamedGap[] = [];

  const th = requireThreshold("covenant.cushionAlertFloor", RULE, pack);
  if (!th.ok) return { suggestions: [], gaps: [th.gap] };

  const covs = bundle.covenants?.covenants ?? [];
  if (!covs.length) {
    return {
      suggestions: [],
      gaps: [
        {
          ruleId: RULE,
          input: "covenants",
          note: "No covenants are on file for this relationship, so there is no cushion to measure.",
          path: "borrower.covenants.covenants[]",
          sourceSystem: NCINO_COVENANTS,
          reason: "missing",
          detail: "no covenants staged for this relationship",
        },
      ],
    };
  }

  let tightest: { cov: Covenant; pct: number } | null = null;
  for (const c of covs) {
    // A waived test is not being enforced this period, so its cushion must not
    // raise a covenant review (domain/covenantStatus.ts).
    if (classifyCovenant(c).kind === "waived") continue;
    const actualPresent = Object.hasOwn(c, "actualValue");
    const thresholdPresent = Object.hasOwn(c, "thresholdValue");
    // NAMED IN BANKER LANGUAGE. A gap on a covenant is about THAT covenant, so
    // it says which one: an unnamed "a covenant has no value" sends a banker
    // through the whole schedule looking for it.
    const named = c.covenantType ?? "One covenant";
    const a = requireNumber(c.actualValue, "covenant actual", "borrower.covenants.covenants[].actualValue", NCINO_COVENANTS, actualPresent);
    if (!a.ok) {
      gaps.push({
        ruleId: RULE,
        ...a.gap,
        note: `The last test of ${named} carries no measured value, so its cushion could not be computed.`,
      });
      continue;
    }
    const t = requireNumber(c.thresholdValue, "covenant threshold", "borrower.covenants.covenants[].thresholdValue", NCINO_COVENANTS, thresholdPresent);
    if (!t.ok) {
      gaps.push({
        ruleId: RULE,
        ...t.gap,
        note: `${named} has no threshold on file, so there is nothing to measure its cushion against.`,
      });
      continue;
    }
    // The cushion percentage divides by the threshold, so guard 4 applies.
    const denom = requirePositive(Math.abs(t.value), "covenant threshold", "borrower.covenants.covenants[].thresholdValue", NCINO_COVENANTS);
    if (!denom.ok) {
      gaps.push({
        ruleId: RULE,
        ...denom.gap,
        note: `${named} carries a threshold of zero, so a cushion percentage cannot be computed from it.`,
      });
      continue;
    }
    const cu = covenantCushion(c.covenantType, a.value, t.value);
    const pct = cu.safe === false ? -1 : cu.pct;
    if (!tightest || pct < tightest.pct) tightest = { cov: c, pct };
  }

  if (!tightest || tightest.pct >= th.value) return { suggestions: [], gaps };

  const c = tightest.cov;
  // "Breach" is the classifier's word, never the arithmetic's alone.
  const breached = classifyCovenant(c).financialBreach;
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
        freshness,
        policyVersion: th.policyVersion,
        policyLabel: pack.label,
        verdict: breached
          ? `${c.covenantType ?? "A covenant"} is at or past its threshold.`
          : `${c.covenantType ?? "A covenant"} has ${tightest.pct} percent cushion, below the ${th.value} percent alert floor.`,
        severity: breached ? "critical" : "warning",
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
 *
 * TWO READS CARRY THE SAME JUNCTION, and this rule used to consult only one of
 * them (founder finding, live Hartwell test 2026-08-25). `Customer360Exposure`
 * supplies `facilities[].loanCovenants[]`, which the live read does NOT carry —
 * it is null on every Hartwell facility. `Customer360Covenants` supplies the
 * same fact from the other side, as `covenants[].attachedLoans[]`, and on
 * Hartwell it names the Accounts Receivable covenant on the 15.0M revolver.
 * Reading one source alone made the card state, as a fact, that no loan-level
 * covenant attaches to a facility that plainly has one.
 *
 * So: the union of both, deduplicated, and ABSENT is no longer read as EMPTY.
 * A relationship where neither read carries the field produces a NAMED GAP —
 * "cannot tell" — rather than an all-clear the data does not support.
 */
/** The junctions named, so a banker knows WHICH covenant is about to travel
 *  rather than only how many. Capped: a list is a sentence, not the schedule. */
function junctionSentence(junctions: Array<{ facility?: string; covenant?: string }>): string {
  const named = junctions.map((j) => (j.covenant && j.facility ? `${j.covenant} on ${j.facility}` : (j.covenant ?? j.facility ?? "an unnamed covenant")));
  if (named.length <= 3) return named.join("; ");
  return `${named.slice(0, 3).join("; ")} and ${named.length - 3} more`;
}

function ruleJunctionCarryover(bundle: BorrowerBundle, freshness: DataFreshness, actionId: string, pack: PolicyPack): EngineResult {
  const RULE = "junction-carryover";
  const asOf = freshness.asOf;
  if (actionId !== "renewal" && actionId !== "loan-modification") return { suggestions: [], gaps: [] };

  const facilities = (bundle.exposure?.facilities ?? []).filter(isActiveFacility);
  const covenants = bundle.covenants?.covenants ?? [];
  const live = new Set(facilities.map((f) => f.loanId).filter(Boolean));
  // Named for a reader, not for the record: every nCino loan name repeats the
  // relationship's, and the relationship is the screen the card sits on.
  const relationship = bundle.snapshot?.name;
  const short = (n: string | undefined) => shortFacilityName(n, relationship) || undefined;

  // Does EITHER read actually carry the field? An absent array is not an empty
  // one, and the difference is the whole finding.
  const exposureCarries = facilities.some((f) => Array.isArray(f.loanCovenants));
  const covenantsCarry = covenants.some((c) => Array.isArray(c.attachedLoans));

  const seen = new Set<string>();
  const junctions: Array<{ facility?: string; covenant?: string }> = [];
  const add = (facility: string | undefined, covenant: string | undefined) => {
    const key = `${facility ?? ""}|${covenant ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    junctions.push({ facility, covenant });
  };

  for (const f of facilities) {
    for (const lc of f.loanCovenants ?? []) add(short(f.name), lc.covenantType ?? lc.name);
  }
  for (const c of covenants) {
    for (const a of c.attachedLoans ?? []) {
      // Only facilities THIS ticket's exposure stages. A junction onto a loan
      // the read never staged cannot be placed on the deal and is not claimed.
      if (!a.loanId || !live.has(a.loanId)) continue;
      add(short(facilities.find((f) => f.loanId === a.loanId)?.name ?? a.loanName), c.covenantType);
    }
  }

  if (!exposureCarries && !covenantsCarry) {
    return {
      suggestions: [],
      gaps: [
        {
          ruleId: RULE,
          input: "loan covenant attachments",
          note: "This read does not say which covenants are attached to the individual facilities, so whether any carries onto the new loan could not be established. Sync this relationship, then check the covenant schedule before the clone is booked.",
          path: "borrower.exposure.facilities[].loanCovenants[] / borrower.covenants.covenants[].attachedLoans[]",
          sourceSystem: `${NCINO_EXPOSURE} / ${NCINO_COVENANTS}`,
          reason: "missing",
          detail:
            "neither loanCovenants[] nor attachedLoans[] is present on this read; an absent junction list is not an empty one and is not reported as none",
        },
      ],
    };
  }

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
        freshness,
        policyVersion: pack.version,
        policyLabel: pack.label,
        verdict: junctions.length
          ? `${junctions.length} loan-level covenant ${junctions.length === 1 ? "attachment carries" : "attachments carry"} onto the new facility.`
          : "No loan-level covenants carry onto the new facility.",
        // A FACT, not a finding. Toning it as a warning would put a decision in
        // front of a banker where there is nothing wrong to decide about.
        severity: "info",
        rationale: junctions.length
          ? `${junctions.length} loan-level covenant ${junctions.length === 1 ? "junction clones" : "junctions clone"} onto the new facility: ${junctionSentence(junctions)}. Review each one; nothing is carried or deleted automatically.`
          : "No loan-level covenants are attached to any facility on this relationship, so nothing clones onto the new loan. Account-level covenants are unaffected.",
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
  /**
   * WHEN THE BUNDLE PASSED IN WAS READ (F3).
   *
   * The caller owns this because only the caller knows whether the bundle it
   * handed over is the baked one or the live-merged one. Absent falls back to
   * `data.meta.generatedAt`, which is correct for a caller that did no merging.
   */
  liveStoredAt?: number | null;
  /** Bundle sections a sync in this session replaced. */
  liveSections?: string[];
}

/** Which bundle sections each rule actually reads. Drives the honest "this part
 *  is still the prepared bundle's" line on a partially-synced read. */
const RULE_SECTIONS: Record<string, string[]> = {
  "coverage-shortfall": ["exposure"],
  "cushion-compression": ["covenants"],
  "junction-carryover": ["exposure"],
};

function freshnessFor(ruleId: string, ctx: EngineContext): DataFreshness {
  const baked = ctx.data.meta?.generatedAt ?? "";
  const live = typeof ctx.liveStoredAt === "number" && Number.isFinite(ctx.liveStoredAt);
  if (!live) return { asOf: baked, live: false, bakedSections: [] };
  const synced = new Set(ctx.liveSections ?? []);
  return {
    asOf: new Date(ctx.liveStoredAt as number).toISOString(),
    live: true,
    bakedSections: (RULE_SECTIONS[ruleId] ?? []).filter((s) => !synced.has(s)),
  };
}

/** Run every Tier 1 rule for an action. Deterministic and side-effect free, so
 *  the confirm gate can recompute it and compare (A33.2.7). */
export function computeSuggestions(ctx: EngineContext): EngineResult {
  const pack = ctx.pack ?? ACTIVE_POLICY_PACK;
  if (!ctx.bundle) {
    return {
      suggestions: [],
      gaps: [
        {
          ruleId: "all",
          input: "staged bundle",
          note: "This relationship is not staged in this view, so no pre-decision check could be run on it.",
          path: "borrowers[accountId]",
          sourceSystem: "assembler",
          reason: "missing",
          detail: "the relationship is not staged in this view",
        },
      ],
    };
  }

  const results = [
    ruleCoverageShortfall(ctx.bundle, freshnessFor("coverage-shortfall", ctx), ctx.proposedCommitment ?? null, pack),
    ruleCushionCompression(ctx.bundle, freshnessFor("cushion-compression", ctx), pack),
    ruleJunctionCarryover(ctx.bundle, freshnessFor("junction-carryover", ctx), ctx.actionId, pack),
  ];

  return {
    suggestions: results.flatMap((r) => r.suggestions),
    gaps: results.flatMap((r) => r.gaps),
  };
}

/** The instant the whole panel should quote for a read, for callers that need
 *  one figure rather than a per-rule one. Same rule as `freshnessFor`. */
export function bundleAsOf(ctx: Pick<EngineContext, "data" | "liveStoredAt">): string {
  return typeof ctx.liveStoredAt === "number" && Number.isFinite(ctx.liveStoredAt)
    ? new Date(ctx.liveStoredAt).toISOString()
    : (ctx.data.meta?.generatedAt ?? "");
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
 * divergence.
 *
 * Reporting is not the same as blocking. `blockingDrift` decides that, and a
 * bare timestamp change is deliberately not in it: see below.
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

/**
 * The reasons that actually stop a confirm.
 *
 * A `data_replaced` on its own means the read carries a NEWER TIMESTAMP than
 * the one the plan was staged against. It does not mean a figure moved: every
 * value the plan quoted is checked by `value_moved`, every finding by
 * `suggestion_vanished`, and the pack by `policy_changed`. When none of those
 * fire, the recomputation has proven the plan still describes the same numbers,
 * and blocking on the clock alone leaves the banker with a panel that names no
 * changed figure and offers no way forward. The founder hit exactly that on
 * 2026-08-26: staged a ticket, ran a Sync, and was refused although nothing
 * material had moved.
 *
 * So the timestamp is reported (the caller renders it as an informational line)
 * and never blocks. Everything else blocks, unchanged.
 */
export function blockingDrift(drift: DriftReason[]): DriftReason[] {
  return drift.filter((d) => d.kind !== "data_replaced");
}

/** True when the recompute found a newer read and nothing else: the figures
 *  were re-checked against it and came back the same. */
export function isRecheckOnly(drift: DriftReason[]): boolean {
  return drift.length > 0 && blockingDrift(drift).length === 0;
}

/** The informational line for that case. Not a warning: nothing is wrong. */
export const RECHECK_LINE =
  "The figures were re-checked against the synced data and are unchanged, so this plan still describes what would be filed.";
