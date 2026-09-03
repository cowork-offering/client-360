/* =============================================================================
   COLLATERAL RECORDS, not pledges.

   The exposure read returns a PLEDGE per facility, so one piece of collateral
   securing four loans arrives as four rows. A banker revalues the COLLATERAL,
   once, not the pledge four times — the standing aggregate-by-identity rule
   applied to the one surface where it changes what gets written.
   ============================================================================= */

import type { BorrowerBundle, Collateral, Facility } from "./contract";
import { isActiveFacility } from "./worklist";

export interface CollateralRecord {
  /** What the banker should read: the friendly description when the org has
   *  one, else its autonumber name, else the type. Never invented. */
  displayName: string;
  collateralName?: string;
  /** The LLC_BI__Collateral__c id. The only valid anchor for a valuation. */
  collateralId?: string;
  collateralType?: string;
  currentValue: number | null;
  lendableValue: number | null;
  advanceRate: number | null;
  lienPosition?: string;
  /** Names of the facilities this piece secures. */
  securesFacilities: string[];
  /** How many pledge rows collapsed into this record. */
  pledgeRows: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One row per collateral record, with the facilities it secures.
 *
 * Grouped by `collateralId` where the assembler staged one. A pledge WITHOUT an
 * id cannot be revalued at all (the write anchors on that id), so it is still
 * listed — the banker should see the security — but it carries no id and the
 * ticket refuses to stage against it.
 */
export function collateralRecords(bundle: BorrowerBundle | null): CollateralRecord[] {
  const groups = new Map<string, CollateralRecord & { firstSeen: number }>();
  let seq = 0;

  const facilities: Facility[] = (bundle?.exposure?.facilities ?? []).filter(isActiveFacility);

  facilities.forEach((f) => {
    (f.collateral ?? []).forEach((c: Collateral) => {
      const key = c.collateralId ?? `unanchored-${c.collateralType ?? "collateral"}-${seq}`;
      const facilityName = f.name ?? f.loanId ?? "facility";
      const existing = groups.get(key);

      if (existing) {
        existing.pledgeRows += 1;
        if (!existing.securesFacilities.includes(facilityName)) existing.securesFacilities.push(facilityName);
        // Values are the collateral's own, so any row of the group carries them.
        existing.currentValue = existing.currentValue ?? num(c.collateralValue);
        existing.lendableValue = existing.lendableValue ?? num(c.currentLendableValue);
        existing.advanceRate = existing.advanceRate ?? num(c.advanceRate);
        // A description on any pledge row of the group names the record.
        if (c.collateralDescription) existing.displayName = c.collateralDescription;
        return;
      }

      seq += 1;
      groups.set(key, {
        displayName: c.collateralDescription ?? c.collateralName ?? c.collateralType ?? "Collateral",
        collateralName: c.collateralName,
        collateralId: c.collateralId,
        collateralType: c.collateralType,
        currentValue: num(c.collateralValue),
        lendableValue: num(c.currentLendableValue),
        advanceRate: num(c.advanceRate),
        lienPosition: c.lienPosition,
        securesFacilities: [facilityName],
        pledgeRows: 1,
        firstSeen: seq,
      });
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map(({ firstSeen: _f, ...row }) => row);
}

/** The records a valuation can actually be written against. */
export function valuableRecords(bundle: BorrowerBundle | null): CollateralRecord[] {
  return collateralRecords(bundle).filter((r) => Boolean(r.collateralId));
}

/** The one-line context under a record in the chooser. */
export function collateralDetail(r: CollateralRecord): string {
  const parts: string[] = [];
  if (r.currentValue !== null) parts.push(`carried at ${Math.round(r.currentValue).toLocaleString()}`);
  if (r.advanceRate !== null) parts.push(`${r.advanceRate} percent advance`);
  if (r.lienPosition) parts.push(`${r.lienPosition} lien`);
  const secures =
    r.securesFacilities.length === 1
      ? `secures ${r.securesFacilities[0]}`
      : `secures ${r.securesFacilities.length} facilities`;
  return [...parts, secures].join(" · ");
}
