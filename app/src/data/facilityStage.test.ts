import { describe, expect, it } from "vitest";
import type { BorrowerBundle, Facility } from "./contract";
import { bookedFacilities, bookedFacilityAvailability, facilityLabel, facilityStagesStaged, unbookedFacilities } from "./facilityStage";
import { ACTIONS_BY_ID } from "../actions/registry";
import type { C360Data } from "./contract";

/* =============================================================================
   A credit action runs only against a BOOKED facility (Probe 9).

   Three outcomes that must stay three DIFFERENT facts: we cannot tell, we can
   tell and the answer is no, and yes. Collapsing the first two would let a
   missing field read as a refusal, or worse, as permission.
   ============================================================================= */

const bundleWith = (facilities: Facility[]): BorrowerBundle => ({
  snapshot: { accountId: "001X", name: "Testco" },
  exposure: { facilities },
});

const dataWith = (bundle: BorrowerBundle) =>
  ({
    meta: { anchorAccountId: "001X", generatedAt: "2026-07-02T09:15:00Z" },
    portfolio: { accounts: [{ accountId: "001X", name: "Testco", tce: 1 }] },
    borrowers: { "001X": bundle },
  }) as unknown as C360Data;

const BOOKED: Facility = { loanId: "L1", name: "Term Loan", stage: "Booked", status: "Active" };
const FINAL_REVIEW: Facility = { loanId: "L2", name: "Revolver", stage: "Final Review", status: "Active" };

describe("which facilities can carry a credit action", () => {
  it("accepts a booked, active facility", () => {
    expect(bookedFacilities(bundleWith([BOOKED, FINAL_REVIEW])).map((f) => f.loanId)).toEqual(["L1"]);
  });

  it("refuses a booked facility that is no longer live", () => {
    expect(bookedFacilities(bundleWith([{ ...BOOKED, status: "Paid Off" }]))).toEqual([]);
  });

  it("matches the stage case-insensitively, but nothing else", () => {
    expect(bookedFacilities(bundleWith([{ ...BOOKED, stage: "booked" }]))).toHaveLength(1);
    for (const stage of ["Qualification", "Proposal", "Final Review", "Book", "Booked-ish"]) {
      expect(bookedFacilities(bundleWith([{ ...BOOKED, stage }])), stage).toEqual([]);
    }
  });

  it("lists the others with the reason they cannot be used", () => {
    const out = unbookedFacilities(bundleWith([BOOKED, FINAL_REVIEW, { loanId: "L3", name: "Old", status: "Paid Off" }]));
    expect(out.map((x) => x.facility.loanId)).toEqual(["L2", "L3"]);
    expect(out[0].reason).toBe("at Final Review");
    expect(out[1].reason).toBe("Paid Off");
  });

  it("names a facility one way, for the selector and the payload alike", () => {
    expect(facilityLabel(BOOKED)).toBe("Term Loan");
    expect(facilityLabel({ loanId: "L9" })).toBe("L9");
  });
});

describe("the predicate FAILS CLOSED when the stage is not staged", () => {
  it("knows whether any stage was staged at all", () => {
    expect(facilityStagesStaged(bundleWith([BOOKED]))).toBe(true);
    expect(facilityStagesStaged(bundleWith([{ loanId: "L1", status: "Active" }]))).toBe(false);
    expect(facilityStagesStaged(bundleWith([{ loanId: "L1", stage: "   " }]))).toBe(false);
  });

  it("withholds the action, and says it cannot tell, rather than assuming", () => {
    const r = bookedFacilityAvailability(bundleWith([{ loanId: "L1", name: "Revolver", status: "Active" }]));
    expect(r.available).toBe(false);
    expect(r.reason).toContain("Facility stages are not staged in this view");
    // The one thing it must never say or imply.
    expect(r.reason).not.toContain("booked facility. This");
  });

  it("says something DIFFERENT when it can tell and the answer is no", () => {
    const r = bookedFacilityAvailability(bundleWith([FINAL_REVIEW]), "modifications");
    expect(r.available).toBe(false);
    expect(r.reason).toBe(
      "Requires a booked facility. This relationship's facilities are in Final Review; modifications apply to booked loans.",
    );
  });

  it("offers the action once a booked facility exists", () => {
    expect(bookedFacilityAvailability(bundleWith([BOOKED, FINAL_REVIEW]))).toEqual({ available: true });
  });

  it("says so plainly when there are no facilities at all", () => {
    expect(bookedFacilityAvailability(bundleWith([])).reason).toBe("No facilities are staged for this relationship");
  });
});

describe("the registry gates modification and renewal on it", () => {
  it("offers neither without a booked facility, with the real reason", () => {
    const data = dataWith(bundleWith([FINAL_REVIEW]));
    for (const id of ["loan-modification", "renewal"]) {
      const r = ACTIONS_BY_ID[id].availability(data, "001X");
      expect(r.available, id).toBe(false);
      expect(r.reason, id).toContain("Requires a booked facility");
    }
    // The action stays VISIBLE with its reason (A27.3), never silently dropped.
    expect(ACTIONS_BY_ID["loan-modification"].availability(data, "001X").reason).toContain("Final Review");
  });

  it("offers both once one facility is booked", () => {
    const data = dataWith(bundleWith([BOOKED, FINAL_REVIEW]));
    for (const id of ["loan-modification", "renewal"]) {
      expect(ACTIONS_BY_ID[id].availability(data, "001X").available, id).toBe(true);
    }
  });

  it("names the action in its own words: modifications, renewals", () => {
    const data = dataWith(bundleWith([FINAL_REVIEW]));
    expect(ACTIONS_BY_ID["loan-modification"].availability(data, "001X").reason).toContain("modifications apply");
    expect(ACTIONS_BY_ID.renewal.availability(data, "001X").reason).toContain("renewals apply");
  });
});
