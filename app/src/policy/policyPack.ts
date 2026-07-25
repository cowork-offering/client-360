/* =============================================================================
   BANK POLICY LAYER (A33.2.5 / A33.2.5a)

   Every threshold the suggestion engine uses lives HERE, as configuration, and
   nowhere else. A33.2.5 bans threshold literals in components and in the rules
   themselves, mirroring A26.2's ban on hardcoded business literals — enforced by
   a grep test, not by good intentions.

   A31.5 is the reason: the arithmetic is the PRODUCT, the thresholds are the
   BANK's. A different bank replaces this pack wholesale and no suggestion code
   changes. That is the whole point of the split.

   HARD RULE (A33.2.5): a threshold with no configured value DISABLES its
   suggestion and reports the missing key. It never falls back to a default.
   `resolveThreshold` returns a discriminated result so a caller physically
   cannot read a value that was not configured.
   ============================================================================= */

/** Keys the engine may ask for. A key absent from the active pack disables its
 *  rule; a key not in this union is a programming error, caught at compile time. */
export type PolicyKey =
  | "collateral.coverageFloor"
  | "covenant.cushionAlertFloor"
  | "modification.subsumesValuation";

export interface PolicyPack {
  /** Stamped onto every Suggestion and re-checked at confirm (A33.2.7). */
  version: string;
  label: string;
  values: Partial<Record<PolicyKey, number | boolean>>;
}

/**
 * The demo pack (founder decision, 2026-07-26). Standing constraint: realistic
 * commercial credit, not implausible numbers — a banker should recognise these.
 *
 *  - coverageFloor 1.10x: lendable value against the proposed commitment. A ten
 *    percent cushion over par is ordinary secured-lending practice.
 *  - cushionAlertFloor 15 percent: an ALERT when pro-forma cushion to the
 *    covenant threshold falls below it. Not a breach.
 *  - subsumesValuation OFF: a modification never silently pulls a valuation into
 *    its plan. Suggest-only. This resolves the item A31.5 parked.
 */
export const DEMO_POLICY_PACK: PolicyPack = {
  version: "demo-2026-07",
  label: "Demo engagement pack",
  values: {
    "collateral.coverageFloor": 1.1,
    "covenant.cushionAlertFloor": 15,
    "modification.subsumesValuation": false,
  },
};

/** The pack in force. Swapping banks means swapping this binding, nothing else. */
export const ACTIVE_POLICY_PACK: PolicyPack = DEMO_POLICY_PACK;

export type ThresholdResult =
  | { resolved: true; value: number; policyVersion: string; key: PolicyKey }
  | { resolved: false; key: PolicyKey; policyVersion: string; missingKey: string };

/** Guard 5 of A33.2.6. Never defaults, never coerces. */
export function resolveThreshold(key: PolicyKey, pack: PolicyPack = ACTIVE_POLICY_PACK): ThresholdResult {
  const raw = pack.values[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { resolved: false, key, policyVersion: pack.version, missingKey: key };
  }
  return { resolved: true, value: raw, policyVersion: pack.version, key };
}

/** Boolean policy switches (subsumesValuation). Absent reads as OFF, which is
 *  the safe direction: it suppresses automatic behaviour rather than enabling it. */
export function resolveSwitch(key: PolicyKey, pack: PolicyPack = ACTIVE_POLICY_PACK): boolean {
  return pack.values[key] === true;
}
