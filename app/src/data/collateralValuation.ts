import type { BorrowerBundle, Collateral, CollateralValuationRow } from "./contract";
import { fmtDate, fmtMoney } from "./format";
import { dayDiff } from "./time";

/* =============================================================================
   WHEN THE ASSET WAS LAST VALUED, AND WHEN IT IS DUE AGAIN.

   The collateral read printed the asset and its figure and said nothing about
   the clock, so a banker reading it could not tell a receivables aging struck
   last month from a warehouse appraisal struck two years ago. Those are the
   same row on the glass and a very different credit.

   THE VALUATION IS A SIDE READ AND EVERY CALLER SAYS SO. `Customer360Exposure`
   returns no valuation field, which `data/observed-exposure-envelopes.json`
   proves verbatim, so the rows come off `bundle.collateralValuations` and are
   looked up BY COLLATERAL ID. A bundle carrying no block reads as "No valuation
   on file" on every asset, which is the honest sentence: no read looked.

   THE FIGURE IS THE ONE ALREADY ON THE READ. `LLC_BI__Collateral_Valuation__c`
   carries its own `LLC_BI__Value__c` and no read on this cockpit stages it, so
   nothing here prints a valuation figure of its own. What it prints beside the
   date is the asset's CARRIED value, which is what nCino's own Add Valuation
   roll-up leaves behind once the primary valuation lands: the Hartwell
   equipment asset carries 10,000,000 and CV-0000000011 struck 10,000,000 on
   2026-04-30, where the row it superseded had read 11,500,000. The line says
   "last valued <date> at <carried value>" and never claims a second figure.

   THE NEXT DATE IS THE ORG'S OWN WHERE IT HAS ONE. `Next_Revaluation_Due_Date__c`
   leads. Where the read carries only a cycle, the date is DERIVED from the last
   valuation and SAID to be derived, because a due date a banker acts on has to
   carry whether the bank wrote it or this room worked it out. Where neither is
   carried the line says so; it never guesses a cycle from an asset type.

   NOTHING HERE REACHES A CLOCK. `asOf` is `meta.generatedAt` through the
   caller, exactly as every other time-based read in this cockpit.

   ORIGINAL_VALUE IS NOT ON THE READ AND IS NOT SIMULATED. Each Hartwell asset
   carries a ladder of valuations, the earliest flagged `Original_Value = true`
   and inactive. The read stages the LATEST row only, so this module speaks of
   one valuation per asset and says nothing about the ladder behind it.
   ============================================================================= */

/** What the line says where the read stages no valuation at all. */
export const NO_VALUATION = "No valuation on file";

/** What it says where no next date is carried and none can be derived. */
export const NO_NEXT_DATE = "no next date on file";

export interface AssetValuation {
  /** The org's own `CV-` autonumber, where the read staged one. */
  name: string | null;
  /** The last valuation date, as the glass prints dates. Null where none. */
  lastValued: string | null;
  /** The value CARRIED on the asset since that valuation, never a second
   *  figure. Null where the read carries no value. */
  value: string | null;
  /** The basis and the source, in the org's own picklist words. */
  method: string | null;
  /** The next revaluation date, as the glass prints dates, or null. */
  nextDue: string | null;
  /** TRUE where `nextDue` was worked out from the cycle rather than read. */
  nextDueDerived: boolean;
  /** Whole days from the snapshot's clock to the next date. Negative is past. */
  daysToDue: number | null;
  /** TRUE only where a next date is carried or derived AND it has passed. */
  overdue: boolean;
}

/** Months per cycle, for the org's own `LLC_BI__Valuation_Frequency__c` words.
 *  A word not in this map derives nothing: a cycle nobody stated is not a
 *  cycle, and an invented one would put a due date on the glass. */
const CYCLE_MONTHS: Array<[RegExp, number]> = [
  [/^monthly$/i, 1],
  [/^quarterly$/i, 3],
  [/^semi[-\s]?annual(ly)?$/i, 6],
  [/^annual(ly)?$/i, 12],
];

/** The last day-of-month arithmetic the org's own dates already follow: the
 *  Hartwell rows are struck on month ends and fall due on month ends. */
function addMonths(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const base = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(base.getTime())) return null;
  const lastOfMonth = base.getUTCDate() === new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate();
  const target = new Date(Date.UTC(Number(y), Number(mo) - 1 + months, 1));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = lastOfMonth ? daysInTarget : Math.min(Number(d), daysInTarget);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The next date the org stores, else the one its cycle implies, else null. */
function nextDueISO(row: CollateralValuationRow): { iso: string; derived: boolean } | null {
  const stored = row.nextRevaluationDue?.trim();
  if (stored) return { iso: stored, derived: false };
  const last = row.valuationDate?.trim();
  const cycle = row.valuationFrequency?.trim();
  if (!last || !cycle) return null;
  const months = CYCLE_MONTHS.find(([re]) => re.test(cycle))?.[1];
  if (!months) return null;
  const iso = addMonths(last, months);
  return iso ? { iso, derived: true } : null;
}

/** The basis and the source, joined only where the org holds them. */
function methodOf(row: CollateralValuationRow): string | null {
  const parts = [row.valuationType?.trim(), row.valuationSource?.trim()].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : null;
}

/** The latest valuation per collateral id, as the bundle carries them.
 *  An empty map is the common case and is not a failure: it means this bundle
 *  staged no valuation read, and every line off it says exactly that. */
export type ValuationBook = Map<string, CollateralValuationRow>;

export function valuationsOf(bundle: BorrowerBundle | null | undefined): ValuationBook {
  const out: ValuationBook = new Map();
  for (const row of bundle?.collateralValuations ?? []) {
    if (row.collateralId) out.set(row.collateralId, row);
  }
  return out;
}

/**
 * THE VALUATION CLOCK ON ONE ASSET, read and never derived into a new fact.
 *
 * `asOf` is the snapshot's own instant. Absent, every day count is null and the
 * line still prints the dates: a missing clock costs the staleness, not the read.
 */
export function assetValuation(c: Collateral, asOf: string | null | undefined, book: ValuationBook): AssetValuation {
  const row = c.collateralId ? book.get(c.collateralId) : undefined;
  const last = row?.valuationDate?.trim() || null;
  const next = row ? nextDueISO(row) : null;
  const days = next && asOf ? dayDiff(next.iso, asOf) : null;
  return {
    name: row?.valuationName?.trim() || null,
    lastValued: last ? fmtDate(last) : null,
    value: last && typeof c.collateralValue === "number" ? fmtMoney(c.collateralValue) : null,
    method: last && row ? methodOf(row) : null,
    nextDue: next ? fmtDate(next.iso) : null,
    nextDueDerived: next?.derived ?? false,
    daysToDue: days,
    overdue: days !== null && days < 0,
  };
}

function dueWord(v: AssetValuation): string {
  if (!v.nextDue) return NO_NEXT_DATE;
  const cycle = v.nextDueDerived ? ", on the cycle" : "";
  if (v.daysToDue === null) return `next due ${v.nextDue}${cycle}`;
  if (v.daysToDue < 0) {
    const past = -v.daysToDue;
    return `next due ${v.nextDue}${cycle}, ${past === 1 ? "1 day past" : `${past} days past`}`;
  }
  if (v.daysToDue === 0) return `next due ${v.nextDue}${cycle}, today`;
  return `next due ${v.nextDue}${cycle}, ${v.daysToDue === 1 ? "in 1 day" : `in ${v.daysToDue} days`}`;
}

/**
 * THE ONE LINE A COLLATERAL LINE ITEM CARRIES ABOUT ITS OWN CLOCK.
 *
 * Always a sentence fragment the caller joins with the rest of its detail, and
 * always both halves: when it was last valued and when it is due again. An
 * asset the read stages no valuation for says so rather than going quiet, which
 * is the difference between "never valued here" and "the read did not look".
 */
export function valuationLine(c: Collateral, asOf: string | null | undefined, book: ValuationBook): string {
  const v = assetValuation(c, asOf, book);
  if (!v.lastValued) return `${NO_VALUATION} · ${dueWord(v)}`;
  const struck = v.value ? `Last valued ${v.lastValued} at ${v.value}` : `Last valued ${v.lastValued}`;
  return [struck, v.method, dueWord(v)].filter(Boolean).join(" · ");
}
