/* =============================================================================
   DELTA DETECTION (WP7 sync)

   What actually changed between the bundle the banker was reading and the one
   the sync just fetched. Only DISPLAY-MAPPED fields count: a figure the cockpit
   renders somewhere. An invisible change is not a delta, it is noise.

   Every id here is stable and DOM-addressable, so the sweep can hand the same
   ids to the pulse and the changed value lights up exactly where the banker is
   already looking.
   ============================================================================= */

import type { BorrowerBundle } from "./contract";

export interface DeltaField {
  /** Stable id, also the `data-delta` attribute the pulse targets. */
  id: string;
  /** Banker language, for the report line. */
  label: string;
  before: unknown;
  after: unknown;
}

/** One display figure, addressed by id. */
type Reader = (b: BorrowerBundle) => Array<{ id: string; label: string; value: unknown }>;

const one = (id: string, label: string, value: unknown) => (value === undefined ? [] : [{ id, label, value }]);

/**
 * The figures the account view renders and the sync can change. Facilities and
 * covenants are keyed by their own record id, never by array position: a
 * reordered list is not a change, and a changed row must not be attributed to
 * whichever record happens to sit in that slot afterwards.
 */
const READERS: Reader[] = [
  (b) => one("snapshot.totalCreditExposure", "total exposure", b.snapshot?.totalCreditExposure),
  (b) => one("snapshot.totalOutstanding", "drawn balance", b.snapshot?.totalOutstanding),
  (b) => one("snapshot.primaryRiskRating", "risk grade", b.snapshot?.primaryRiskRating),
  (b) => one("snapshot.packageStage", "package stage", b.snapshot?.packageStage),
  (b) => one("snapshot.annualRevenue", "annual revenue", b.snapshot?.annualRevenue),
  (b) => one("exposure.totalCommitted", "committed", b.exposure?.totalCommitted),
  (b) => one("exposure.totalOutstanding", "outstanding", b.exposure?.totalOutstanding),
  (b) => one("exposure.totalAvailable", "available", b.exposure?.totalAvailable),
  (b) =>
    (b.exposure?.facilities ?? []).flatMap((f) =>
      f.loanId
        ? [
            ...one(`facility.${f.loanId}.outstanding`, `${f.name ?? "facility"} drawn`, f.outstanding),
            ...one(`facility.${f.loanId}.committed`, `${f.name ?? "facility"} commitment`, f.committed),
            ...one(`facility.${f.loanId}.maturityDate`, `${f.name ?? "facility"} maturity`, f.maturityDate),
            ...one(`facility.${f.loanId}.coverageRatio`, `${f.name ?? "facility"} coverage`, f.coverageRatio),
          ]
        : [],
    ),
  (b) =>
    (b.covenants?.covenants ?? []).flatMap((c) =>
      c.covenantId
        ? [
            ...one(`covenant.${c.covenantId}.actualValue`, `${c.covenantType ?? "covenant"} actual`, c.actualValue),
            ...one(`covenant.${c.covenantId}.thresholdValue`, `${c.covenantType ?? "covenant"} threshold`, c.thresholdValue),
            ...one(`covenant.${c.covenantId}.lastEvaluationStatus`, `${c.covenantType ?? "covenant"} status`, c.lastEvaluationStatus),
          ]
        : [],
    ),
];

function displayFigures(b: BorrowerBundle | null): Map<string, { label: string; value: unknown }> {
  const out = new Map<string, { label: string; value: unknown }>();
  if (!b) return out;
  for (const read of READERS) for (const f of read(b)) out.set(f.id, { label: f.label, value: f.value });
  return out;
}

/**
 * Fields present in BOTH reads whose value moved. A field that only appears
 * after the sync is not reported as a change: it was not on screen before, so
 * there is nothing for the banker to have misread.
 */
export function diffBundles(before: BorrowerBundle | null, after: BorrowerBundle | null): DeltaField[] {
  const a = displayFigures(before);
  const b = displayFigures(after);
  const out: DeltaField[] = [];
  for (const [id, next] of b) {
    const prev = a.get(id);
    if (!prev || Object.is(prev.value, next.value)) continue;
    out.push({ id, label: next.label, before: prev.value, after: next.value });
  }
  return out;
}

/** The one line the banker reads when the scrim lifts. */
export function deltaReport(deltas: DeltaField[], newRequests: number): string {
  const parts: string[] = [];
  if (deltas.length) parts.push(`${deltas.length} ${deltas.length === 1 ? "figure" : "figures"} changed`);
  if (newRequests) parts.push(`${newRequests} new client ${newRequests === 1 ? "request" : "requests"}`);
  if (!parts.length) return "Everything current, nothing new.";
  return `${parts.join(", ")}.`;
}
