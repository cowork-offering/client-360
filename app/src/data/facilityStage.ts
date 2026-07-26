/* =============================================================================
   BOOKED FACILITIES (wave 2.1 correction)

   nCino accepts a credit action only against a BOOKED facility. Probe 9 read
   every real renewal chain in the org and found the same shape every time:
   parent loan `Stage = Booked`, `Status = Open`, non-null core lookup key.
   Anything else is refused with "The request contains invalid facilities", at
   any pre-approval stage, for both Renewal and Modification.

   So modification and renewal are offered only where a booked facility exists,
   and the reason is stated where it does not.

   FAIL CLOSED. `stage` is an additive output on the Customer360Exposure read and
   may not be flowing yet. A bundle whose facilities carry NO stage at all is
   "not staged in this view", which is not the same as "not booked" and must
   never be read as "probably fine": the action is withheld either way, but the
   banker is told which of the two it is.
   ============================================================================= */

import type { BorrowerBundle, Facility } from "./contract";
import { isActiveFacility } from "./worklist";

export const BOOKED = "Booked";

/** Whether ANY staged facility carries a stage value at all. */
export function facilityStagesStaged(bundle: BorrowerBundle | null): boolean {
  return (bundle?.exposure?.facilities ?? []).some((f) => typeof f.stage === "string" && f.stage.trim() !== "");
}

const isBooked = (f: Facility) => (f.stage ?? "").trim().toLowerCase() === BOOKED.toLowerCase();

/**
 * Facilities a credit action may run against: booked, and still live.
 *
 * `status` is checked through the existing active-facility rule rather than
 * against nCino's own `Open`, because the staged vocabulary is the cockpit's
 * (`Active` / `Paid Off`), not the org's. Conflating the two would be a guess
 * about a field whose values have not been observed here.
 */
export function bookedFacilities(bundle: BorrowerBundle | null): Facility[] {
  return (bundle?.exposure?.facilities ?? []).filter((f) => isBooked(f) && isActiveFacility(f));
}

/** Facilities that exist but cannot carry a credit action, with the reason. */
export function unbookedFacilities(bundle: BorrowerBundle | null): Array<{ facility: Facility; reason: string }> {
  return (bundle?.exposure?.facilities ?? [])
    .filter((f) => !(isBooked(f) && isActiveFacility(f)))
    .map((f) => ({
      facility: f,
      reason: !isActiveFacility(f)
        ? (f.status ?? "not active")
        : f.stage
          ? `at ${f.stage}`
          : "stage not staged in this view",
    }));
}

/** One facility, named the way the ticket and the payload both name it. Single
 *  definition so the selector's label and the id it resolves to cannot drift. */
export function facilityLabel(f: Facility): string {
  return f.name ?? f.loanId ?? "Facility";
}

export interface BookedAvailability {
  available: boolean;
  reason?: string;
}

/**
 * Whether a modification or renewal may be offered at all.
 *
 * Three outcomes, and they are three different facts:
 *   - stages not staged  -> withheld, because we cannot tell
 *   - staged, none booked -> withheld, and we can say exactly why
 *   - at least one booked -> offered
 */
export function bookedFacilityAvailability(bundle: BorrowerBundle | null, actionNoun = "modifications"): BookedAvailability {
  const facilities = bundle?.exposure?.facilities ?? [];
  if (!facilities.length) return { available: false, reason: "No facilities are staged for this relationship" };

  if (!facilityStagesStaged(bundle)) {
    return { available: false, reason: "Facility stages are not staged in this view, so a booked facility cannot be confirmed" };
  }

  if (bookedFacilities(bundle).length) return { available: true };

  const stages = [...new Set(facilities.map((f) => f.stage).filter(Boolean))] as string[];
  const where = stages.length ? `This relationship's facilities are in ${stages.join(", ")}` : "None of this relationship's facilities are booked";
  return { available: false, reason: `Requires a booked facility. ${where}; ${actionNoun} apply to booked loans.` };
}
