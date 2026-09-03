import { describe, expect, it } from "vitest";
import type { BorrowerBundle, Facility } from "./contract";
import { bookedFacilities, bookedFacilityAvailability, facilityLabel, facilityStagesStaged, unbookedFacilities } from "./facilityStage";
import { ACTIONS_BY_ID } from "../actions/registry";
import live from "../../../artifact/live-data.json";
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


/* =============================================================================
   THE REAL BUNDLES. The regression that greyed out the founder's buttons was
   exactly this, and nothing in the suite looked at live data — every fixture
   used the sample-era `Active`, so the org's own `Open` was never exercised.
   ============================================================================= */

describe("live data — the org's real facilities are live facilities", () => {
  const LIVE = live as unknown as C360Data;
  const HARTWELL = LIVE.borrowers?.["001bb00001I7FPNAA3"]!;
  const PIEDMONT = LIVE.borrowers?.["001bb00001DLtRMAA1"]!;

  it("every real facility carries status Open, which is what broke", () => {
    const statuses = new Set((HARTWELL.exposure?.facilities ?? []).map((f) => f.status));
    expect([...statuses]).toEqual(["Open"]);
  });

  it("counts Hartwell's eight Booked + Open facilities as bookable", () => {
    // The org grew a second package (2026-09-03): the original six C&I
    // facilities plus the two new Real Estate ones. The ninth facility, the
    // $3M equipment line, stays at Proposal and is not bookable.
    expect(bookedFacilities(HARTWELL)).toHaveLength(8);
  });

  it("OFFERS modification and renewal on Hartwell", () => {
    const data = {
      meta: { anchorAccountId: "001bb00001I7FPNAA3", generatedAt: "2026-07-26T00:00:00Z" },
      portfolio: { accounts: [{ accountId: "001bb00001I7FPNAA3", name: "Hartwell", tce: 1 }] },
      borrowers: { "001bb00001I7FPNAA3": HARTWELL },
    } as unknown as C360Data;
    for (const id of ["loan-modification", "renewal"]) {
      const r = ACTIONS_BY_ID[id].availability(data, "001bb00001I7FPNAA3");
      expect(r.available, `${id} must be offered on a relationship with six booked loans`).toBe(true);
    }
  });

  it("still WITHHOLDS them on Piedmont, whose facilities are at Final Review", () => {
    const data = {
      meta: { anchorAccountId: "001bb00001DLtRMAA1", generatedAt: "2026-07-26T00:00:00Z" },
      portfolio: { accounts: [{ accountId: "001bb00001DLtRMAA1", name: "Piedmont", tce: 1 }] },
      borrowers: { "001bb00001DLtRMAA1": PIEDMONT },
    } as unknown as C360Data;
    const r = ACTIONS_BY_ID["loan-modification"].availability(data, "001bb00001DLtRMAA1");
    expect(r.available).toBe(false);
    expect(r.reason).toContain("Final Review");
    // Open, but not booked: the status was never the thing standing in the way.
    expect(PIEDMONT.exposure?.facilities?.every((f) => f.status === "Open")).toBe(true);
  });
});

describe("the vocabulary, exactly", () => {
  const withStatus = (status: string | undefined) =>
    bundleWith([{ loanId: "L1", name: "F", stage: "Booked", ...(status === undefined ? {} : { status }) }]);

  it("treats the org's Open, the sample's Active and an absent status as live", () => {
    for (const status of ["Open", "open", " Open ", "Active", "active", undefined, ""]) {
      expect(bookedFacilities(withStatus(status)), String(status)).toHaveLength(1);
    }
  });

  it("keeps every other real state inactive", () => {
    for (const status of ["Paid Off", "Closed", "Withdrawn", "Hold", "Pre-Approval"]) {
      expect(bookedFacilities(withStatus(status)), status).toHaveLength(0);
    }
  });

  it("gives a Hold facility a reason that reads as its state", () => {
    const out = unbookedFacilities(bundleWith([{ loanId: "L1", name: "Revolver", stage: "Booked", status: "Hold" }]));
    expect(out).toHaveLength(1);
    // The org's own word, not a paraphrase of it.
    expect(out[0].reason).toBe("Hold");
  });

  it("still separates cannot-tell from none-are-booked after the fix", () => {
    expect(bookedFacilityAvailability(bundleWith([{ loanId: "L1", status: "Open" }])).reason).toContain("not staged in this view");
    expect(
      bookedFacilityAvailability(bundleWith([{ loanId: "L1", status: "Open", stage: "Final Review" }])).reason,
    ).toContain("Requires a booked facility");
    expect(bookedFacilityAvailability(bundleWith([{ loanId: "L1", status: "Open", stage: "Booked" }]))).toEqual({ available: true });
  });
});
