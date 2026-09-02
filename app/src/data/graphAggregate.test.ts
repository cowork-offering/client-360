import { describe, expect, it } from "vitest";
import type { C360Data, LegalEntity } from "./contract";
import {
  aggregateGuarantorSignals,
  aggregateInvolvements,
  collapseConnections,
  connectionOwnership,
  relationshipRoster,
} from "./graphAggregate";
import live from "../../../artifact/live-data.json";

/* =============================================================================
   Fixtures are the REAL payloads, not hand-shaped approximations.

   STANDING RULE: a real org read WILL carry bidirectional and per-child
   duplication. Every list surface aggregates by identity; none renders raw row
   multiplicity. These tests are that rule, checked against the org's own rows.
   ============================================================================= */

const DATA = live as unknown as C360Data;
const HARTWELL = DATA.borrowers?.["001bb00001I7FPNAA3"]!;
const PIEDMONT = DATA.borrowers?.["001bb00001DLtRMAA1"]!;

describe("Hartwell — the org stores every connection twice", () => {
  const raw = HARTWELL.graph?.connections ?? [];
  const rows = collapseConnections(raw);

  it("starts from 8 real org rows", () => {
    expect(raw).toHaveLength(8);
  });

  it("collapses to 4 relationships, one per counterparty", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.counterpartyName)).toEqual([
      "Hartwell Industrial Holdings LLC",
      "Hartwell Logistics LLC",
      "James Hartwell",
      "Elena Hartwell",
    ]);
    // Every one of them was a mirrored pair.
    expect(rows.map((r) => r.mirroredRows)).toEqual([2, 2, 2, 2]);
  });

  it("keeps the NAMED role over the mirror's generic one", () => {
    // Parent/Child is one holding-company edge; Owner/Company is one person.
    expect(rows[0].role).toBe("Parent");
    expect(rows[2].role).toBe("Owner");
    expect(rows[3].role).toBe("Co-Owner");
    for (const r of rows) expect(["Child", "Company"]).not.toContain(r.role);
  });

  it("carries the ownership percent from whichever side recorded it", () => {
    expect(rows[0].ownershipPercent).toBe(100); // direct, on the Parent row
    expect(rows[2].ownershipPercent).toBe(60); // indirect, on the Owner row
    expect(rows[3].ownershipPercent).toBe(40);
    expect(rows[1].ownershipPercent).toBeNull(); // an affiliate with no percent
  });

  it("breaks a tie deterministically, on original order", () => {
    // Both Hartwell Logistics rows say "Affiliated Company" with no percent, so
    // neither is more informative and the first one wins, every time.
    const twice = collapseConnections(raw);
    expect(twice.map((r) => `${r.counterpartyName}:${r.role}`)).toEqual(rows.map((r) => `${r.counterpartyName}:${r.role}`));
    expect(rows[1].role).toBe("Affiliated Company");
  });

  it("renders no counterparty twice", () => {
    const names = rows.map((r) => r.counterpartyName);
    expect(new Set(names).size).toBe(names.length);
  });
});

/* -----------------------------------------------------------------------------
   ONE INVOLVEMENT REPEATED ONCE PER FACILITY.

   The shape these three cases were written against: six identical Borrower rows
   and nothing else. The org read moved on (2026-09-02: 22 rows, five parties,
   four roles), so the SHAPE is proved on a fixture built to be that shape and
   the real book is proved right underneath it.
   -------------------------------------------------------------------------- */

const SIX_IDENTICAL: LegalEntity[] = [
  "a4Zbb0000027MaYEAU",
  "a4Zbb0000027MnREAU",
  "a4Zbb0000027Mp3EAE",
  "a4Zbb0000027MqfEAE",
  "a4Zbb0000027MsHEAU",
  "a4Zbb0000027MttEAE",
].map((loanId) => ({
  accountName: "Hartwell Precision Manufacturing LLC",
  borrowerType: "Borrower",
  ownershipPercent: 100,
  loanId,
}));

describe("one involvement repeated once per facility", () => {
  const rows = aggregateInvolvements(SIX_IDENTICAL);

  it("starts from 6 identical org rows", () => {
    expect(SIX_IDENTICAL).toHaveLength(6);
    expect(new Set(SIX_IDENTICAL.map((e) => e.accountName)).size).toBe(1);
  });

  it("aggregates to ONE row carrying the facility count", () => {
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountName: "Hartwell Precision Manufacturing LLC",
      borrowerType: "Borrower",
      ownershipPercent: 100,
      facilityCount: 6,
    });
  });

  it("keeps the loans it was recorded against, for the expanded view", () => {
    expect(rows[0].loanIds).toHaveLength(6);
    expect(new Set(rows[0].loanIds).size).toBe(6);
  });

  it("counts DISTINCT loans, so a row the read carries twice is still one facility", () => {
    const doubled = aggregateInvolvements([...SIX_IDENTICAL, SIX_IDENTICAL[0]]);
    expect(doubled).toHaveLength(1);
    expect(doubled[0].facilityCount).toBe(6);
  });
});

describe("Hartwell — 22 org rows, five parties, four roles", () => {
  const raw = HARTWELL.graph?.legalEntities ?? [];
  const rows = aggregateInvolvements(raw);

  it("starts from the whole book the org actually holds", () => {
    expect(raw).toHaveLength(22);
    expect(new Set(raw.map((e) => e.accountName)).size).toBe(5);
  });

  it("aggregates to one row per party per role, with the facility count", () => {
    expect(rows.map((r) => [r.accountName, r.borrowerType, r.facilityCount])).toEqual([
      ["Hartwell Precision Manufacturing LLC", "Borrower", 7],
      ["Hartwell Industrial Holdings LLC", "Guarantor", 6],
      ["James Hartwell", "Guarantor", 6],
      ["Elena Hartwell", "Limited Guarantor", 2],
      ["Hartwell Logistics LLC", "Related Entity", 1],
    ]);
  });

  it("keeps the guaranty type and the loans behind every row", () => {
    const elena = rows.find((r) => r.accountName === "Elena Hartwell")!;
    expect(elena.guarantyAmountType).toBe("Limited");
    expect(new Set(elena.loanIds)).toEqual(new Set(["a4Zbb0000027Mp3EAE", "a4Zbb0000027MaYEAU"]));
    expect(rows.find((r) => r.accountName === "James Hartwell")!.guarantyAmountType).toBe("Unlimited");
  });

  it("renders no party in the same role twice", () => {
    const keys = rows.map((r) => `${r.accountName}|${r.borrowerType}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the roster joins the two graph reads, one line per party", () => {
  const roster = relationshipRoster(HARTWELL.graph?.connections, HARTWELL.graph?.legalEntities);

  it("names every party the relationship carries, exactly once", () => {
    expect(roster.map((p) => p.name)).toEqual([
      "Hartwell Industrial Holdings LLC",
      "Hartwell Logistics LLC",
      "James Hartwell",
      "Elena Hartwell",
      "Hartwell Precision Manufacturing LLC",
    ]);
    expect(new Set(roster.map((p) => p.name)).size).toBe(roster.length);
  });

  it("puts the parent's ownership edge and its guaranty on ONE party", () => {
    // The defect the 22-row read exposed: the same name rendered three times on
    // the graph tab, once per read that happened to carry it.
    const holdings = roster[0];
    expect(holdings.connection).toMatchObject({ role: "Parent", ownershipPercent: 100 });
    expect(holdings.involvements.map((e) => [e.borrowerType, e.facilityCount])).toEqual([["Guarantor", 6]]);
  });

  it("keeps a party only one read carries", () => {
    // The borrower is on no connection row, and Hartwell Logistics is on both.
    expect(roster[4].connection).toBeUndefined();
    expect(roster[4].involvements.map((e) => e.borrowerType)).toEqual(["Borrower"]);
    expect(roster[1].connection?.role).toBe("Affiliated Company");
    expect(roster[1].involvements.map((e) => e.borrowerType)).toEqual(["Related Entity"]);
  });

  it("survives absent graph data", () => {
    expect(relationshipRoster(undefined, undefined)).toEqual([]);
  });
});

describe("Piedmont — unduplicated data passes through unchanged", () => {
  it("keeps its single connection exactly as it is", () => {
    const rows = collapseConnections(PIEDMONT.graph?.connections);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ counterpartyName: "Margaret Holloway", role: "Owner", ownershipPercent: 100, mirroredRows: 1 });
  });

  it("keeps both distinct involvements, and counts neither up", () => {
    const rows = aggregateInvolvements(PIEDMONT.graph?.legalEntities);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.borrowerType)).toEqual(["Borrower", "Guarantor"]);
    for (const r of rows) expect(r.facilityCount).toBe(1);
    // The guarantor's own detail survives aggregation.
    expect(rows[1]).toMatchObject({ relationshipType: "Personal Guaranty", guarantyAmountType: "Unlimited", ownershipPercent: 100 });
  });
});

describe("the edges", () => {
  it("survives absent graph data", () => {
    expect(collapseConnections(undefined)).toEqual([]);
    expect(aggregateInvolvements(undefined)).toEqual([]);
  });

  it("groups by id, so two counterparties sharing a name stay separate", () => {
    const rows = collapseConnections([
      { counterpartyId: "A", counterpartyName: "Hartwell LLC", role: "Owner", ownershipPercent: 60 },
      { counterpartyId: "B", counterpartyName: "Hartwell LLC", role: "Owner", ownershipPercent: 40 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("falls back to the name when no id is staged", () => {
    const rows = collapseConnections([
      { counterpartyName: "Someone", role: "Parent", ownershipPercent: 100 },
      { counterpartyName: "Someone", role: "Child" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("Parent");
  });

  it("reads a rollup of 0 as no ownership, not as zero percent owned", () => {
    expect(connectionOwnership({ totalOwnershipPercent: 0 })).toBeNull();
    expect(connectionOwnership({ totalOwnershipPercent: 55 })).toBe(55);
  });

  it("separates the same entity in two different roles", () => {
    const rows = aggregateInvolvements([
      { accountName: "X", borrowerType: "Borrower", loanId: "L1" },
      { accountName: "X", borrowerType: "Guarantor", loanId: "L1" },
      { accountName: "X", borrowerType: "Borrower", loanId: "L2" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].facilityCount).toBe(2);
    expect(rows[1].facilityCount).toBe(1);
  });
});


describe("Hartwell — a guarantor signal repeated once per facility", () => {
  const raw = (HARTWELL.signals?.guarantorSignals ?? []) as Array<Record<string, unknown>>;
  const rows = aggregateGuarantorSignals(raw);

  it("starts from 14 real org rows for 3 guarantors", () => {
    expect(raw).toHaveLength(14);
    expect(new Set(raw.map((g) => g.guarantorName)).size).toBe(3);
  });

  it("aggregates to one row per guarantor, with the facility count", () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.guarantorName, r.facilityCount])).toEqual([
      ["James Hartwell", 6],
      ["Hartwell Industrial Holdings LLC", 6],
      ["Elena Hartwell", 2],
    ]);
  });

  it("keeps the grade recorded on any row of the group", () => {
    expect(rows.find((r) => r.guarantorName === "Hartwell Industrial Holdings LLC")!.highestRiskGrade).toBe("4");
  });

  it("groups by account id, so two guarantors sharing a name stay separate", () => {
    const out = aggregateGuarantorSignals([
      { guarantorAccountId: "A", guarantorName: "J. Hartwell", highestRiskGrade: "4" },
      { guarantorAccountId: "B", guarantorName: "J. Hartwell", highestRiskGrade: "6" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("survives absent signals", () => {
    expect(aggregateGuarantorSignals(undefined)).toEqual([]);
  });
});
