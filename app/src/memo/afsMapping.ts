/* =============================================================================
   THE AFS MAPPING SEAM (phase D, 2026-09-04).

   AFS is keyed by bank / obligor / obligation. It has never heard of a
   Salesforce account id, and the AFS tools all DEFAULT their key to the sample
   loan, which is a real obligation belonging to a real borrower (the port plan
   records which one). Calling them without a key therefore does not return
   "nothing": it returns ANOTHER BORROWER'S SERVICING, correctly formatted,
   under the name of the borrower on screen. That is the worst failure mode this
   room has, so it is closed at the seam rather than at the call site.

   THE RULE. A servicing read or a servicing workpackage happens only with a
   mapping that came off the relationship. No mapping means the module renders
   an honest gap, and no AFS tool is called at all.
   ============================================================================= */

import type { AfsCoordinates } from "../data/contract";

/** What the servicing module says when it has no key. The banker is told what
 *  is missing and why, not shown an empty panel. */
export const AFS_GAP =
  "No AFS servicing key is recorded for this relationship, so servicing is not shown. " +
  "The bank/obligor/obligation mapping travels with the relationship; without it the " +
  "servicing tools would answer for a different borrower.";

const key = (v: unknown): string | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * The servicing key for this relationship, or undefined.
 *
 * A PARTIAL MAPPING IS NOT A MAPPING. Two of the three parts identify no
 * obligation, and passing them would let the tool default the third back to the
 * sample loan, which is precisely the substitution this exists to prevent.
 */
export function afsMapping(bundle: { snapshot?: { afs?: Partial<AfsCoordinates> } } | null | undefined): AfsCoordinates | undefined {
  const raw = bundle?.snapshot?.afs;
  if (!raw) return undefined;
  const bank = key(raw.bank);
  const obligor = key(raw.obligor);
  const obligation = key(raw.obligation);
  if (!bank || !obligor || !obligation) return undefined;
  const officer = key(raw.officer);
  const assignmentUnit = key(raw.assignmentUnit);
  return { bank, obligor, obligation, ...(officer ? { officer } : {}), ...(assignmentUnit ? { assignmentUnit } : {}) };
}
