import { gradeTone, STATUS } from "../data/finance";

/* =============================================================================
   Risk grade presentation (SPEC §12 A28, revised by founder feedback 2026-07-25).

   THE PILL IS GONE, AND SO IS THE TICK SCALE. Founder calls (2026-07-25):
   (a) a standalone rating chip floating in the header read as an orphan;
   (b) the tick scale broke the strip's uniformity. The grade is now a PLAIN
   SINGLE-LINE stat cell, identical in shape to Committed/DSC/Leverage, and
   distinguished ONLY by status-toned value text plus a provenance tooltip.
   Do not reintroduce a box, pill, chart, or scale indicator.

   A28.2 still holds: risk rating is a CUSTOMER attribute; package STAGE is a
   different thing and renders as its own labelled chip beside the name.
   A28.3 still holds: only the NCINO-sourced grade is shown. PD / last-rated /
   migration stay GAP chips in the Covenants tab.
   ============================================================================= */

/** Status colour for a grade string, or null when unrated/unparseable. */
export function gradeColor(grade: string | null | undefined): string | null {
  const n = gradeNumber(grade);
  return n === null ? null : STATUS[gradeTone(n)].fg;
}

function gradeNumber(grade: string | null | undefined): number | null {
  if (grade == null) return null;
  const n = parseInt(grade, 10);
  return Number.isNaN(n) ? null : n;
}

