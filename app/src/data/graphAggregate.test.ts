import { describe, expect, it } from "vitest";
import type { C360Data, LegalEntity } from "./contract";
import {
  aggregateGuarantorSignals,
  aggregateInvolvements,
  collapseConnections,
  connectionOwnership,
  edgeDirection,
  partyGraph,
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
   and nothing else. The org read moved on (2026-09-03: 26 rows, five parties,
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

describe("Hartwell: 26 org rows, five parties, four roles", () => {
  const raw = HARTWELL.graph?.legalEntities ?? [];
  const rows = aggregateInvolvements(raw);

  it("starts from the whole book the org actually holds", () => {
    expect(raw).toHaveLength(26);
    expect(new Set(raw.map((e) => e.accountName)).size).toBe(5);
  });

  it("aggregates to one row per party per role, with the facility count", () => {
    expect(rows.map((r) => [r.accountName, r.borrowerType, r.facilityCount])).toEqual([
      ["Hartwell Precision Manufacturing LLC", "Borrower", 9],
      ["Hartwell Industrial Holdings LLC", "Guarantor", 6],
      ["James Hartwell", "Guarantor", 8],
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

  it("starts from 16 real org rows for 3 guarantors", () => {
    expect(raw).toHaveLength(16);
    expect(new Set(raw.map((g) => g.guarantorName)).size).toBe(3);
  });

  it("aggregates to one row per guarantor, with the facility count", () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.guarantorName, r.facilityCount])).toEqual([
      ["James Hartwell", 8],
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


/* =============================================================================
   THE STAR: EVERY PARTY EDGE TERMINATES ON THE BORROWER ACCOUNT.

   Founder, 2026-09-03, anchored on the graph pane: "line from James Hartwell is
   not going to the borrower." He had two edges to no borrower — one from a
   guarantor the tree never drew, one from a path an objectBoundingBox gradient
   would not paint. These are the data half of that answer.
   ============================================================================= */

const HARTWELL_BORROWER = "Hartwell Precision Manufacturing LLC";

describe("Hartwell — one edge per party, every one of them onto the borrower", () => {
  const g = partyGraph(HARTWELL.graph?.connections, HARTWELL.graph?.legalEntities, HARTWELL_BORROWER);

  it("targets the borrower account, and never itself", () => {
    expect(g.borrowerName).toBe(HARTWELL_BORROWER);
    expect(g.edges.map((e) => e.name)).not.toContain(HARTWELL_BORROWER);
    // The borrower's own seven-facility involvement is the node's label, not an
    // eighth edge looping back on itself.
    expect(g.borrowerLabel).toBe("Borrower · 9 facilities");
  });

  it("draws James Hartwell onto the borrower as an unlimited guarantor", () => {
    const james = g.edges.find((e) => e.name === "James Hartwell")!;
    expect(james).toBeDefined();
    expect(james.roles).toEqual(["Owner", "Guarantor"]);
    expect(james.label).toBe("Owner · Guarantor · Unlimited · 8 facilities");
    expect(james.ownershipPercent).toBe(60);
    expect(james.direction).toBe("toBorrower");
  });

  it("gives EVERY legal entity on the bundle an edge to the borrower", () => {
    const named = new Set(
      (HARTWELL.graph?.legalEntities ?? []).map((e) => (e.accountName ?? "").trim()).filter(Boolean),
    );
    // Five names on 26 rows: the borrower is the target node, the other four
    // are edges. Not one of them may end up drawn nowhere.
    expect(named.size).toBe(5);
    for (const n of named) {
      if (n === HARTWELL_BORROWER) continue;
      expect(g.edges.filter((e) => e.name === n)).toHaveLength(1);
    }
  });

  it("keeps the guarantor with no equity, which the tree used to drop", () => {
    // Hartwell Logistics carries no ownership percent on either mirror half.
    const logistics = g.edges.find((e) => e.name === "Hartwell Logistics LLC")!;
    expect(logistics.ownershipPercent).toBeNull();
    expect(logistics.label).toBe("Affiliated Company · Related Entity");
  });

  it("carries the guaranty type, the coverage and the equity on the label", () => {
    expect(g.edges.map((e) => [e.name, e.label, e.ownershipPercent])).toEqual([
      ["Hartwell Industrial Holdings LLC", "Parent · Guarantor · Unlimited · 6 facilities", 100],
      ["Hartwell Logistics LLC", "Affiliated Company · Related Entity", null],
      ["James Hartwell", "Owner · Guarantor · Unlimited · 8 facilities", 60],
      ["Elena Hartwell", "Co-Owner · Limited Guarantor · Limited · 2 facilities", 40],
    ]);
  });

  it("never draws the same party, or the same role, twice", () => {
    expect(new Set(g.edges.map((e) => e.name)).size).toBe(g.edges.length);
    for (const e of g.edges) {
      const lower = e.roles.map((r) => r.toLowerCase());
      expect(new Set(lower).size, `${e.name}: ${e.roles.join("/")}`).toBe(e.roles.length);
    }
    // And the pair the founder would see on the glass is unique too.
    const pairs = g.edges.flatMap((e) => e.roles.map((r) => `${e.name}|${r}`));
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe("the arrow runs the way the equity does", () => {
  it("points at the borrower when the counterparty holds the stake", () => {
    for (const r of ["Parent", "Owner", "Co-Owner", "Shareholder", "Managing Member", "Key Principal"]) {
      expect(edgeDirection([r]), r).toBe("toBorrower");
    }
  });

  it("points back at the party when the borrower holds the stake", () => {
    expect(edgeDirection(["Child"])).toBe("fromBorrower");
    expect(edgeDirection(["Subsidiary"])).toBe("fromBorrower");
  });

  it("reads the ownership side of a mirrored pair, not the generic half", () => {
    // A subsidiary described from both ends: "Parent" is what the far side
    // calls this account, and it is the half that carries the percent.
    const sub = partyGraph(
      [
        { counterpartyId: "S", counterpartyName: "Hartwell Tooling LLC", role: "Child", direction: "outbound", totalOwnershipPercent: 0 },
        { counterpartyId: "S", counterpartyName: "Hartwell Tooling LLC", role: "Subsidiary", direction: "inbound", ownershipPercent: 80 },
      ],
      undefined,
      HARTWELL_BORROWER,
    );
    expect(sub.edges).toHaveLength(1);
    expect(sub.edges[0]).toMatchObject({ ownershipPercent: 80, direction: "fromBorrower" });
  });

  it("lands a party with no equity word on the borrower all the same", () => {
    expect(edgeDirection(["Affiliated Company", "Related Entity"])).toBe("toBorrower");
    expect(edgeDirection([])).toBe("toBorrower");
  });
});

describe("the rest of the book gets the same star", () => {
  it("gives Piedmont's one party an edge carrying both its roles", () => {
    const g = partyGraph(PIEDMONT.graph?.connections, PIEDMONT.graph?.legalEntities, "Piedmont Precision Components, Inc.");
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({
      name: "Margaret Holloway",
      label: "Owner · Personal Guaranty · Unlimited",
      ownershipPercent: 100,
      direction: "toBorrower",
    });
    expect(g.borrowerLabel).toBe("Primary Borrower");
  });

  it("draws a guarantor no connection row names, with the cap on the label", () => {
    const BW = DATA.borrowers?.["001SAMPLE0000BRWT"]!;
    const g = partyGraph(BW.graph?.connections, BW.graph?.legalEntities, "Brightwater Foods Group");
    const ferris = g.edges.find((e) => e.name === "Daniel Ferris")!;
    // No ownership edge anywhere in the read, so before the star he had no line.
    expect(ferris.ownershipPercent).toBeNull();
    expect(ferris.label).toBe("Personal Guaranty · Limited · $10M");
  });

  it("survives absent graph data", () => {
    expect(partyGraph(undefined, undefined, "Anyone")).toEqual({
      borrowerName: "Anyone",
      borrowerLabel: "",
      edges: [],
    });
  });
});
