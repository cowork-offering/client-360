/* UTC calendar-day arithmetic. All worklist time reasons compute against
   meta.generatedAt (SPEC §12 A10), never Date.now() — the artifact is a
   deterministic snapshot. Diffs are whole UTC days so date-only fields
   ("2026-06-30") and timestamped ones ("...T09:15:00Z") compare cleanly. */

function utcMidnight(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC days from `baseISO` to `targetISO` (positive = target is later).
 *  Returns null if either date is unparseable. */
export function dayDiff(targetISO: string | null | undefined, baseISO: string): number | null {
  if (!targetISO) return null;
  const t = utcMidnight(targetISO);
  const b = utcMidnight(baseISO);
  if (t === null || b === null) return null;
  return Math.round((t - b) / 86_400_000);
}
