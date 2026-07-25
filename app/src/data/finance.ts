/* Finance display + covenant-cushion logic, ported verbatim from the legacy
   template (customer-360-template.html). The cushion/direction heuristic is
   load-bearing derivation — unit-tested in finance.test.ts. */

import type { Covenant } from "./contract";

export function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(2) + "×";
}

export function fmtRate(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(2) + "%";
}

/** Covenant value: money when large, ratio when small — inferred by magnitude. */
export function fmtCovVal(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return fmtMoneyLocal(n);
  return Number(n).toFixed(2) + "×";
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

const CAP_HINTS = [
  "leverage", "debt-to-worth", "debt to worth", "debt/worth", "capex", "fixed asset",
  "fixed-asset", "loan-to-value", "loan to value", "ltv", "concentration", "limit", "maximum", " max",
];
const FLOOR_HINTS = [
  "coverage", "dsc", "dscr", "liquidity", "tangible net worth", "net worth",
  "current ratio", "minimum", " min", "working capital",
];

export function covenantDirection(
  type: string | undefined,
  actual: number | null | undefined,
  threshold: number | null | undefined,
): "cap" | "floor" {
  const t = (type || "").toLowerCase();
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
  return (covenantDirection(type, actual, threshold) === "cap" ? "≤ " : "≥ ") + fmtCovVal(threshold);
}

export function covTone(cov: Covenant): Tone {
  if (cov.breached === true) return "red";
  const st = (cov.lastEvaluationStatus || cov.covenantStatus || "").toLowerCase();
  if (st.includes("breach") || st.includes("default") || st.includes("non-compliant") || st.includes("noncompliant"))
    return "red";
  if (st.includes("watch") || st.includes("warning") || st.includes("pending")) return "amber";
  return "green";
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
