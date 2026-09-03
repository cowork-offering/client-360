/* Finance display + covenant-cushion logic, ported verbatim from the legacy
   template (customer-360-template.html). The cushion/direction heuristic is
   load-bearing derivation — unit-tested in finance.test.ts.

   Covenant STATUS interpretation does not live here. It lives in
   domain/covenantStatus.ts, which is the one classifier every surface reads. */

export function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(2) + "×";
}

export function fmtRate(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(2) + "%";
}

/* -------------------------------------------------------- covenant units
   A covenant's number means nothing without its unit, and the read carries NO
   unit hint — only `LLC_BI__Covenant_Type__r.Name`. Magnitude alone was the old
   rule and it is wrong for a whole class of covenant: an advance test at 80
   percent rendered "80.00×", which is not a smaller version of the truth, it is
   a different statement (validation audit 2026-07-27, finding 6).

   So the TYPE decides, by the same named-hint method `covenantDirection` has
   always used, and the hint lists are the covenant vocabulary rather than the
   six names one relationship happens to carry. Magnitude survives only as the
   last resort, where it answers the single question it can answer honestly: an
   amount is not a multiple. It cannot tell a percent from a multiple, so the
   ratio default stands exactly where it stood before. */

export type CovenantUnit = "ratio" | "percent" | "currency";

/** Multiples and coverage tests: rendered ×. */
const RATIO_HINTS = [
  "coverage", "dsc", "dscr", "ratio", "leverage", "debt to worth", "debt-to-worth", "debt/worth",
  "times", "multiple", "turns",
];
/** Rate-shaped tests: an advance, a share, a limit expressed as a proportion. */
const PERCENT_HINTS = [
  "advance", "accounts receivable", "receivables", "inventory", "borrowing base", "loan to value",
  "loan-to-value", "ltv", "concentration", "percent", "percentage", "utilisation", "utilization",
  "margin", "rate",
];
/** Money tests: a floor, a cap or a budget stated in currency. */
const CURRENCY_HINTS = [
  "liquidity", "net worth", "tangible net worth", "working capital", "capital expenditure",
  "capital expenditures", "capex", "purchases", "expenditures", "ebitda", "revenue", "cash",
  "balance", "amount", "distributions", "spend",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary matched, deliberately: a substring test reads "rate" out of
 *  "corporate" and quietly relabels a covenant. */
function typeHints(type: string | undefined, list: string[]): boolean {
  const t = (type || "").toLowerCase();
  if (!t) return false;
  return list.some((h) => new RegExp(`\\b${escape(h)}\\b`).test(t));
}

/**
 * The unit a covenant's numbers are in, decided by its TYPE.
 *
 * Correct for every relationship or it is correct for none: the rules live here
 * and in the type vocabulary, never in a list of one borrower's covenant names.
 */
export function covenantUnit(type: string | undefined, value?: number | null): CovenantUnit {
  if (typeHints(type, RATIO_HINTS)) return "ratio";
  if (typeHints(type, PERCENT_HINTS)) return "percent";
  if (typeHints(type, CURRENCY_HINTS)) return "currency";
  return value != null && Number.isFinite(value) && Math.abs(value) >= 1000 ? "currency" : "ratio";
}

/** A percent, at the precision it actually carries: 80 is "80%", not "80.00%",
 *  and 79.5 keeps its half. Matches how advance rates read on Exposure. */
function fmtPercentLocal(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

/** A covenant value in ITS OWN unit. Pass the covenant type wherever one is
 *  known; without it the formatter falls back to magnitude, which is the same
 *  answer it has always given and is right only for money. */
export function fmtCovVal(n: number | null | undefined, type?: string): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  switch (covenantUnit(type, n)) {
    case "currency":
      return fmtMoneyLocal(n);
    case "percent":
      return fmtPercentLocal(n);
    default:
      return Number(n).toFixed(2) + "×";
  }
}

// Local money formatter matching the legacy template (kept here so finance.ts is
// self-contained for fmtCovVal; the app's canonical money fmt lives in format.ts).
function fmtMoneyLocal(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export type Tone = "green" | "amber" | "red" | "purple" | "neutral";

/** Status tone → CSS-var color pair (fg ink + bg tint). Mirrors the legacy S/T
 *  maps but references tokens so there are zero hardcoded colors. */
export const STATUS: Record<Tone, { fg: string; bg: string }> = {
  green: { fg: "var(--positive)", bg: "var(--positive-bg)" },
  amber: { fg: "var(--warning)", bg: "var(--warning-bg)" },
  red: { fg: "var(--critical)", bg: "var(--critical-bg)" },
  purple: { fg: "var(--accent)", bg: "var(--accent-wash)" },
  neutral: { fg: "var(--neutral-fg)", bg: "var(--neutral-bg)" },
};

/* The bank's own word for the direction, which outranks the family: "Minimum
   Accounts Receivable" is a floor whatever an A/R test usually is. Read first,
   so a named direction can never be overruled by a family hint. */
const SAID_CAP = ["maximum", " max", "not to exceed", "no more than", "limit", "cap on"];
const SAID_FLOOR = ["minimum", " min", "not less than", "no less than", "at least"];

const CAP_HINTS = [
  "leverage", "debt-to-worth", "debt to worth", "debt/worth", "capex", "fixed asset",
  "fixed-asset", "loan-to-value", "loan to value", "ltv", "concentration",
  // An advance rate and a borrowing-base percentage are CEILINGS: the org's own
  // `Acnpex_Operator__c` on the A/R covenant reads `<=`. The read does not carry
  // the operator, so the family has to (covenant research, 2026-09-02 §7).
  "accounts receivable", "receivables", "borrowing base", "advance rate",
];
const FLOOR_HINTS = [
  "coverage", "dsc", "dscr", "liquidity", "tangible net worth", "net worth",
  "current ratio", "working capital",
];

export function covenantDirection(
  type: string | undefined,
  actual: number | null | undefined,
  threshold: number | null | undefined,
): "cap" | "floor" {
  const t = (type || "").toLowerCase();
  for (const h of SAID_CAP) if (t.includes(h)) return "cap";
  for (const h of SAID_FLOOR) if (t.includes(h)) return "floor";
  for (const h of CAP_HINTS) if (t.includes(h)) return "cap";
  for (const h of FLOOR_HINTS) if (t.includes(h)) return "floor";
  if (actual != null && threshold != null) return actual >= threshold ? "floor" : "cap";
  return "floor";
}

export interface Cushion {
  cushion: number | null;
  dir: "cap" | "floor";
  pct: number;
  safe: boolean | null;
}

/** Distance into the safe zone (positive = compliant). Direction-aware. */
export function covenantCushion(
  type: string | undefined,
  actual: number | null | undefined,
  threshold: number | null | undefined,
): Cushion {
  const dir = covenantDirection(type, actual, threshold);
  if (actual == null || threshold == null) return { cushion: null, dir, pct: 0, safe: null };
  const cushion = dir === "cap" ? threshold - actual : actual - threshold;
  const denom = Math.abs(threshold) > 1e-9 ? Math.abs(threshold) : 1;
  const pct = Math.max(0, Math.min(100, Math.round((cushion / denom) * 100)));
  return { cushion, dir, pct, safe: cushion >= 0 };
}

export function fmtCovThreshold(
  type: string | undefined,
  actual: number | null | undefined,
  threshold: number | null | undefined,
): string {
  if (threshold == null) return "—";
  return (covenantDirection(type, actual, threshold) === "cap" ? "≤ " : "≥ ") + fmtCovVal(threshold, type);
}

export function gradeTone(grade: number | null): Tone {
  if (grade == null) return "neutral";
  if (grade <= 4) return "green";
  if (grade <= 6) return "amber";
  return "red";
}

/** SVG circle dash geometry for a coverage/renewal arc. */
export function arc(pct: number, r: number): { c: number; off: number } {
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return { c: +c.toFixed(2), off: +(c * (1 - p / 100)).toFixed(2) };
}
