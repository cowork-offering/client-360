import { packageRecords } from "../actions/schemas";
import type { BorrowerBundle, Facility } from "../data/contract";
import { BOOKED } from "../data/facilityStage";
import { fmtMoney } from "../data/format";
import { isActiveFacility } from "../data/worklist";

/* =============================================================================
   EVERY PRODUCT PACKAGE ON THE RELATIONSHIP, AS ONE LIST.

   Founder, 2026-09-02: "why does it know that we are talking about this package
   (there is only one but what happens on multiple ones)?"

   THE ANSWER IS THIS LIST, and it is DERIVED, never read. No connector tool
   returns product packages: `Customer360Exposure` returns FACILITIES, each
   carrying its own `productPackageId`, `stage`, `status`, `productType` and
   `committed`, and `Customer360Snapshot` names the relationship's own package
   where the org staged one. So the roster is the distinct package ids over the
   active facilities, with the snapshot's leading, and the stage/commitment
   figures are summed from the members. That derivation is identical for the
   BAKED book (`artifact/live-data.json`, whose bundles are exactly the shape the
   reads return) and for the DYNAMIC book (`book/aggregate.ts`, which builds the
   same bundle out of the eight live reads). One list, one shape, both books.

   IT IS NOT THE ENGINES' `packageChoices`. That list is ROUTE-SCOPED: it marks a
   package ineligible when no member of it is booked, because a modification only
   runs against a booked facility. This one is route-NEUTRAL, because the room now
   asks which package BEFORE it asks which route, and a package that cannot carry
   a modification can still carry a new facility. Eligibility stays where it
   belongs, on the route's own card.
   ============================================================================= */

/** One package on the relationship, with what it holds. */
export interface PackageEntry {
  id: string;
  /** The deal's headline, derived exactly as every ticket derives it. */
  name: string;
  /** The org's own stage words over the members. Null where none staged. */
  stage: string | null;
  /** Booked, In progress, Part booked, or Stage not staged. */
  status: string;
  /** Members whose stage is Booked and whose status is active. */
  booked: number;
  /** Active members that are not booked yet. */
  inProgress: number;
  /** The active facilities that name this package. */
  members: Facility[];
  /** The summed commitment over the members. */
  committed: number;
  /** "2 facilities · $18.0MM committed", for the ticket's compact line. */
  detail: string;
  /** The ask's own line item: stage, member count, total commitment. */
  line: string;
}

const isBooked = (f: Facility) => (f.stage ?? "").trim().toLowerCase() === BOOKED.toLowerCase();

/** Every product package this relationship stages, the snapshot's leading. */
export function packageRoster(bundle: BorrowerBundle | null | undefined): PackageEntry[] {
  const facilities = (bundle?.exposure?.facilities ?? []).filter(isActiveFacility);
  return packageRecords(bundle ?? null).map((record) => {
    const members = facilities.filter((f) => f.productPackageId === record.id);
    const committed = members.reduce((sum, f) => sum + (typeof f.committed === "number" ? f.committed : 0), 0);
    const booked = members.filter(isBooked).length;
    const inProgress = members.length - booked;
    const stages = [...new Set(members.map((f) => (f.stage ?? "").trim()).filter(Boolean))];
    const status = !stages.length
      ? "Stage not staged"
      : booked === members.length
        ? "Booked"
        : booked === 0
          ? "In progress"
          : "Part booked";
    const count = `${members.length} ${members.length === 1 ? "facility" : "facilities"}`;
    return {
      id: record.id,
      name: record.label,
      stage: stages.length ? stages.join(", ") : null,
      status,
      booked,
      inProgress,
      members,
      committed,
      detail: record.detail,
      // WHAT THE BANKER READS BEFORE PICKING. Stage first, because a package
      // still in review is a different kind of thing from a booked one, and the
      // commitment last, because that is the figure the eye lands on.
      line: [status, count, committed > 0 ? `${fmtMoney(committed)} committed` : null].filter(Boolean).join(" · "),
    };
  });
}

/** The facilities of ONE package, or all of them where nothing is anchored. */
export function facilitiesInPackage(facilities: Facility[], productPackageId: string | null): Facility[] {
  if (!productPackageId) return facilities;
  return facilities.filter((f) => f.productPackageId === productPackageId);
}

/**
 * DOES THIS ROOM HAVE TO ASK?
 *
 * More than one package on the relationship and none anchored. One package is
 * not a choice, so the room binds it silently and says on the glass that it did;
 * none is the create door, which is already honest.
 */
export function mustChoosePackage(
  bundle: BorrowerBundle | null | undefined,
  productPackageId: string | null,
): boolean {
  if (productPackageId) return false;
  return packageRoster(bundle).length > 1;
}
