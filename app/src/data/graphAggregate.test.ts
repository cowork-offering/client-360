import { describe, expect, it } from "vitest";
import type { C360Data } from "./contract";
import { aggregateInvolvements, collapseConnections, connectionOwnership } from "./graphAggregate";
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

describe("Hartwell — one involvement repeated once per facility", () => {
  const raw = HARTWELL.graph?.legalEntities ?? [];
  const rows = aggregateInvolvements(raw);

  it("starts from 6 identical org rows", () => {
    expect(raw).toHaveLength(6);
    expect(new Set(raw.map((e) => e.accountName)).size).toBe(1);
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
