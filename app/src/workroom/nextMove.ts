/* =============================================================================
   THE DEAL'S NEXT MOVE.

   The room used to open on an inventory sentence — how many members, how much
   is booked, what is open to work. True, and useless: it is the same sentence
   whether the package is quiet or a facility matures next month. This derives
   the ONE thing worth opening on instead, ranked by what a banker would want
   to know first:

     1. a booked facility maturing within the coming quarter — the renewal
        clock is the loudest fact this room can carry, and doing nothing about
        it is a decision by default;
     2. a covenant test due soon — the org's own schedule, not a guess;
     3. the package drawn hard against its commitment — no history is read for
        this, only the CURRENT committed/outstanding split, because there is no
        prior-period utilization anywhere in the contract and inventing a trend
        from one data point would be exactly the fabrication the channel-none
        doctrine forbids. This says what is true today, not a slope.

   Nothing here reaches Date.now(). `today` is `meta.generatedAt`, the same
   clock `deriveReasonsForBundle` (../data/worklist.ts) treats the artifact's
   own snapshot instant as — a deterministic read, testable and replayable.

   PURE AND TOTAL. No candidate in any tier ⇒ null, and the caller falls back
   to the existing package-inventory sentence. This function never writes that
   fallback itself: writing it twice is how the two drift.
   ============================================================================= */

import type { Covenant, Facility } from "../data/contract";
import { facilityProduct } from "../data/facilityStage";
import { fmtMoney } from "../data/format";
import { dayDiff } from "../data/time";
import { classifyCovenant } from "../domain/covenantStatus";

/** "The coming quarter" — a facility maturing at or inside this many days out.
 *  Matches the common banker shorthand ("inside 90 days") rather than a
 *  literal 91.25-day quarter; the difference is not one this room needs to
 *  split. A maturity already past (negative days) never qualifies — it
 *  matured, it is not upcoming. */
export const MATURITY_QUARTER_DAYS = 90;

/** "Due soon", for a covenant test. The SAME window `worklist.ts` uses for its
 *  COVENANT_DUE reason code, so "due soon" means one thing across the cockpit
 *  rather than two thresholds that happen to both be called that. */
export const COVENANT_DUE_DAYS = 45;

/** Utilization at or above this — computed only from the package's own
 *  committed and outstanding, never a trend — is worth a headroom
 *  conversation on its own. */
export const UTILIZATION_WORTH_ACTING_PCT = 85;

export type NextMoveKind = "maturity" | "covenant" | "utilization";

export interface NextMove {
  kind: NextMoveKind;
  /** The one sentence. Banker-grade: a fact, then a question. No exclamation
   *  points, no em dashes — house style (SOUL.md, feedback.md). */
  line: string;
}

export interface NextMoveInput {
  /** BOOKED facilities only. A maturity on a member still in Proposal is not a
   *  renewal this room can start, so it is not a move worth opening on. */
  facilities: Facility[];
  /** Covenants scoped to the package, exactly as `position()` already reads
   *  them — this derives no wider or narrower a set than the room's own. */
  covenants: Covenant[];
  /** The package's own committed and outstanding — the SAME totals the
   *  fallback sentence prints, never a second figure computed differently. */
  committed: number;
  outstanding: number;
  relationship: string;
}

function dayWord(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "in 1 day";
  return `in ${d} days`;
}

/** Tier 1 — the nearest qualifying maturity. Ties (same day) favor the larger
 *  commitment: between two facilities rolling the same week, the bigger one is
 *  the more consequential renewal to raise first. */
function maturityMove(facilities: Facility[], relationship: string, today: string): NextMove | null {
  const candidates = facilities
    .map((f) => ({ f, d: dayDiff(f.maturityDate, today) }))
    .filter((c): c is { f: Facility; d: number } => c.d !== null && c.d >= 0 && c.d <= MATURITY_QUARTER_DAYS);
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.d - b.d || (b.f.committed ?? 0) - (a.f.committed ?? 0));
  const { f, d } = candidates[0];
  const product = facilityProduct(f, relationship);
  const named = typeof f.committed === "number" ? `${fmtMoney(f.committed)} ${product}` : product;
  return { kind: "maturity", line: `The ${named} matures ${dayWord(d)}. Start the renewal?` };
}

/** Tier 2 — the nearest covenant test due soon. A financial breach or a waived
 *  test is excluded: those are different, already-surfaced situations (the
 *  worklist queue's own COVENANT_BREACH / exception handling), not "due soon".
 *  Overdue (negative days) is excluded too — this opener leads on what is
 *  coming, not what was missed. Ties favor the covenant type name,
 *  alphabetically, for a deterministic pick over no other signal to break on.
 *  The attached facility is deliberately left unnamed: the member chips above
 *  already carry it, and law 3's sixty-word budget on the opening view has no
 *  room to repeat a loan name inside this one sentence too. */
function covenantMove(covenants: Covenant[], today: string): NextMove | null {
  const candidates = covenants
    .map((c) => ({ c, d: dayDiff(c.nextEvaluationDate, today), verdict: classifyCovenant(c) }))
    .filter(
      (x): x is { c: Covenant; d: number; verdict: ReturnType<typeof classifyCovenant> } =>
        x.d !== null && x.d >= 0 && x.d <= COVENANT_DUE_DAYS && x.verdict.kind !== "breach" && x.verdict.kind !== "waived",
    );
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.d - b.d || (a.c.covenantType ?? "").localeCompare(b.c.covenantType ?? ""));
  const { c, d } = candidates[0];
  const type = (c.covenantType ?? "").trim();
  // "The covenant covenant is due..." is what a bare `|| "covenant"` fallback
  // reads when the type itself is missing — the fallback has to replace the
  // whole noun phrase, not just fill the blank in front of it.
  const subject = type ? `${type} covenant` : "covenant";
  return { kind: "covenant", line: `The ${subject} is due ${dayWord(d)}. Start the review?` };
}

/** Tier 3 — no history read, ever: this is `outstanding ÷ committed` on
 *  today's read alone. "Trend" language is deliberately absent from the
 *  sentence for the reason in the header comment. The dollar figures are left
 *  out too: the strip above already prints the committed total once (the same
 *  law-3 discipline the fallback sentence already follows), so this adds only
 *  the ONE fact the strip cannot show — how much of it is drawn. */
function utilizationMove(committed: number, outstanding: number): NextMove | null {
  if (!(committed > 0) || !(outstanding >= 0)) return null;
  const pct = Math.round((outstanding / committed) * 100);
  if (pct < UTILIZATION_WORTH_ACTING_PCT) return null;
  return {
    kind: "utilization",
    line: `The package is drawn to ${pct}% of commitment. Worth a headroom conversation?`,
  };
}

/**
 * THE ONE MOVE, if there is one. `today` is `meta.generatedAt` — an unusable
 * clock (empty, unparseable) yields null rather than a guess, the same fail-
 * closed rule `deriveWorklist`'s `clockOk` follows.
 */
export function deriveNextMove(input: NextMoveInput, today: string): NextMove | null {
  if (dayDiff(today, today) === null) return null;
  return (
    maturityMove(input.facilities, input.relationship, today) ??
    covenantMove(input.covenants, today) ??
    utilizationMove(input.committed, input.outstanding)
  );
}
