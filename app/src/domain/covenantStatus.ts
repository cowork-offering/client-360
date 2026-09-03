/* =============================================================================
   COVENANT STATUS — ONE CLASSIFIER, EVERY SURFACE.

   WHY THIS EXISTS. Salesforce's `Exception` is mostly an ADMINISTRATIVE flag, not a
   financial one. The Servicing engine's exception batch forces `Exception` onto
   a compliance row the moment its Due Date passes, whether or not anything was
   measured — so in `bankinggpt` 101 of 140 compliance rows sit at `Exception`
   with no measured value at all (NCINO-PROCESS-ALIGNMENT-DRAFT, D15). Any
   surface that renders `Exception` as "breached" overstates credit
   deterioration on the majority of the book.

   The rule the whole cockpit now shares:

     A FINANCIAL BREACH is (a) `Reason for Exception = Breached` on the latest
     compliance row, or (b) the org's own `Breached` flag, or (c) a status that
     says non-compliant in the org's own words, or (d) a MEASURED value that
     misses its threshold, both numbers present.

     (a) arrived with WS0.5: `Customer360Covenants` now returns
     `reasonForException`, so where the org has answered the breach-versus-
     paperwork question this module READS the answer instead of inferring it
     from whether a value was measured.

     `Exception` on its own is none of those. It gets its own chip and says so.

   TWO THINGS THIS MODULE REFUSES TO DO. It never maps a status string it does
   not recognise onto a breach — an unmapped string renders VERBATIM, because
   `LLC_BI__Covenant_Status__c` is `restricted = false` and the org already
   holds values outside the documented picklist (`breached`, `overdue`,
   `<10% headroom`, `>10% headroom`, `Active`, `Pass`, `Fail`). And it never
   raises a breach on a `Waived` covenant: a waiver is a decision not to
   enforce, so it outranks the arithmetic.

   Display correctness is a contract for ALL relationships, so nothing here is
   keyed to a borrower, a covenant type, or a data file.
   ============================================================================= */

import type { Covenant } from "../data/contract";
import { covenantCushion, fmtCovThreshold, fmtCovVal, type Tone } from "../data/finance";

export type CovenantKind = "compliant" | "breach" | "exception" | "waived" | "pending" | "unknown";

/** How loudly the surface should render the verdict. `breach` is the only one
 *  that means credit deterioration. */
export type CovenantSeverity = "breach" | "watch" | "clear" | "neutral";

export interface CovenantVerdict {
  kind: CovenantKind;
  /** Chip text. Always either a mapped label or the org's own string, verbatim. */
  label: string;
  severity: CovenantSeverity;
  /** Tooltip / prose sentence. Says what the status means, never more. */
  explanation: string;
  /** TRUE only for a FINANCIAL breach. An administrative Exception is false. */
  financialBreach: boolean;
  /** TRUE when nCino recorded a measured value for the period. */
  measured: boolean;
}

/** The sentence an administrative Exception carries, verbatim, everywhere. */
export const ADMINISTRATIVE_EXCEPTION_NOTE =
  "Administrative exception recorded in Salesforce; not a measured breach";

const norm = (s: unknown): string => (typeof s === "string" ? s.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const has = (s: string, words: readonly string[]): boolean => words.some((w) => s.includes(w));

/* Word lists, tested in the order below. `non-compliant` contains `compliant`,
   so breach words are always tested before compliant words. */
const BREACH_WORDS = ["breach", "default", "non-compliant", "noncompliant", "non compliant", "out of compliance", "fail"] as const;
const WAIVED_WORDS = ["waiv"] as const;
const EXCEPTION_WORDS = ["exception", "overdue", "past due"] as const;
const COMPLIANT_WORDS = ["compliant", "in compliance", "pass", "satisfied"] as const;
const PENDING_WORDS = ["pending", "in progress", "awaiting"] as const;
/** The org's own warning vocabulary. Not a kind we map, but it earns amber. */
const WATCH_WORDS = ["watch", "warning", "at risk"] as const;

/**
 * Does the MEASURED value miss its threshold?
 *
 * `null` when it cannot be answered — a missing actual or a missing threshold
 * is a gap, and a gap is never a breach. Direction (a floor test vs a cap test)
 * comes from `covenantCushion`, so both operator directions are covered by the
 * one rule the rest of the cockpit already uses.
 */
export function thresholdViolation(cov: Covenant): boolean | null {
  const a = num(cov.actualValue);
  const t = num(cov.thresholdValue);
  if (a === null || t === null) return null;
  return covenantCushion(cov.covenantType, a, t).safe === false;
}

function measurementSentence(cov: Covenant): string {
  return `Measured ${fmtCovVal(cov.actualValue, cov.covenantType)} against ${fmtCovThreshold(
    cov.covenantType,
    cov.actualValue,
    cov.thresholdValue,
  )}.`;
}

function administrativeNote(raw: string): string {
  return /overdue|past due/i.test(raw)
    ? "Test overdue in Salesforce; not a measured breach"
    : ADMINISTRATIVE_EXCEPTION_NOTE;
}

/** `LLC_BI__Reason_for_Exception__c`, the org's two-valued answer (see the
 *  header). Anything else it may hold is ignored rather than mapped, on the
 *  same rule the status strings follow. */
function complianceReason(cov: Covenant): "breached" | "overdue" | null {
  const r = norm(cov.reasonForException).toLowerCase();
  return r === "breached" ? "breached" : r === "overdue" ? "overdue" : null;
}

/** Classify one covenant. Pure, total, and safe on a completely empty read. */
export function classifyCovenant(cov: Covenant): CovenantVerdict {
  const raw = norm(cov.lastEvaluationStatus) || norm(cov.covenantStatus);
  const s = raw.toLowerCase();
  const measured = num(cov.actualValue) !== null;
  const violates = thresholdViolation(cov) === true;
  const reason = complianceReason(cov);

  const build = (
    kind: CovenantKind,
    label: string,
    severity: CovenantSeverity,
    explanation: string,
    financialBreach: boolean,
  ): CovenantVerdict => ({ kind, label, severity, explanation, financialBreach, measured });

  const breach = (label: string, explanation: string): CovenantVerdict =>
    build("breach", label, "breach", violates ? `${explanation} ${measurementSentence(cov)}` : explanation, true);

  /* A waiver is a decision not to enforce. It outranks both the flag and the
     arithmetic, and it is never rendered as a breach. */
  if (raw && has(s, WAIVED_WORDS)) {
    return build(
      "waived",
      raw,
      "neutral",
      `Waived in Salesforce; the test is not being enforced for this period.${violates ? ` ${measurementSentence(cov)}` : ""}`,
      false,
    );
  }

  /* The org saying so, in its own field or its own words. The reason ranks WITH
     the flag, not under it: the exception batch can fake neither. */
  if (reason === "breached") {
    return breach(
      raw || "Breached",
      "The compliance row records Reason for Exception as Breached, which is Salesforce's own answer that the test failed.",
    );
  }
  if (cov.breached === true) return breach(raw || "Breached", "Salesforce's Breached flag is set on this covenant.");
  if (raw && has(s, BREACH_WORDS)) return breach(raw, `Salesforce records this covenant as ${raw}.`);

  /* Exception and its administrative siblings. THE POINT OF THIS MODULE. */
  if (raw && has(s, EXCEPTION_WORDS)) {
    if (violates) return breach(`${raw}, threshold not met`, `${raw} recorded in Salesforce, and the measured value misses the test.`);
    // `Overdue` is the org saying outright that this is a paperwork miss.
    if (reason === "overdue") {
      return build(
        "exception",
        raw,
        "watch",
        "The compliance row records Reason for Exception as Overdue: the document or evaluation is outstanding, not a measured breach.",
        false,
      );
    }
    return build("exception", raw, "watch", `${administrativeNote(raw)}.`, false);
  }

  if (raw && has(s, COMPLIANT_WORDS)) {
    if (violates) return breach(`${raw}, threshold not met`, `Salesforce records ${raw}, but the measured value misses the test.`);
    return build("compliant", raw, "clear", `Salesforce records this covenant as ${raw}.`, false);
  }

  if (raw && has(s, PENDING_WORDS)) {
    if (violates) return breach(`${raw}, threshold not met`, `The test is outstanding in Salesforce, and the measured value misses the test.`);
    return build("pending", raw, "watch", `The test is outstanding in Salesforce, recorded as ${raw}.`, false);
  }

  /* No status recorded. The numbers are all there is. */
  if (!raw) {
    if (violates) return breach("Threshold not met", "Salesforce records no evaluation status for this covenant.");
    return build("unknown", "No status", "neutral", "Salesforce records no evaluation status for this covenant.", false);
  }

  /* A string outside everything above. It renders as the org wrote it. The only
     thing that can still make it a breach is a measured value that misses. */
  if (violates) return breach(`${raw}, threshold not met`, `Salesforce records the status "${raw}", and the measured value misses the test.`);
  return build(
    "unknown",
    raw,
    has(s, WATCH_WORDS) ? "watch" : "neutral",
    `Salesforce records the status "${raw}", which this cockpit does not map to a compliance outcome.`,
    false,
  );
}

export function severityTone(severity: CovenantSeverity): Tone {
  return severity === "breach" ? "red" : severity === "watch" ? "amber" : severity === "clear" ? "green" : "neutral";
}

/** The covenants that are a FINANCIAL breach. Never includes an administrative
 *  Exception, and never includes a waived test. */
export function financialBreaches(covs: readonly Covenant[]): Covenant[] {
  return covs.filter((c) => classifyCovenant(c).financialBreach);
}

/** The covenants at an administrative Exception: nCino recorded the exception,
 *  and nothing measured against the threshold contradicts it. These need a
 *  document or an evaluation, not a credit decision. */
export function administrativeExceptions(covs: readonly Covenant[]): Covenant[] {
  return covs.filter((c) => classifyCovenant(c).kind === "exception");
}
