import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, Connection } from "./contract";
import { collapseConnections, connectionOwnership, isSpecificRole } from "./graphAggregate";
import { collateralRecords, groupCovenants } from "./collateralRecords";
import live from "../../../artifact/live-data.json";
import sample from "../../../artifact/sample-data.json";

/* =============================================================================
   EVERY BORROWER, EVERY SURFACE.

   Founder rule, 2026-07-27: a surface that renders correctly for one
   relationship and wrongly for another is a failed round item. So the
   aggregation invariants below are asserted for EVERY borrower in EVERY staged
   file, and the rules are derived from the rule itself rather than from
   Hartwell's four counterparties.
   ============================================================================= */

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", live as unknown as C360Data],
  ["sample-data.json", sample as unknown as C360Data],
];

const everyBorrower: Array<[string, string, BorrowerBundle]> = FILES.flatMap(([file, data]) =>
  Object.entries(data.borrowers ?? {}).map(
    ([id, b]) => [file, (b as BorrowerBundle).snapshot?.name ?? id, b as BorrowerBundle] as [string, string, BorrowerBundle],
  ),
);

describe("connection invariants hold for every borrower", () => {
  it("has borrowers to check", () => {
    expect(everyBorrower.length).toBeGreaterThanOrEqual(5);
  });

  for (const [file, name, bundle] of everyBorrower) {
    const raw = bundle.graph?.connections ?? [];
    const rows = collapseConnections(raw);

    it(`${name} (${file}): never grows the row count`, () => {
      expect(rows.length).toBeLessThanOrEqual(raw.length);
    });

    it(`${name} (${file}): one row per counterparty identity`, () => {
      const ids = rows.map((r) => r.counterpartyId ?? r.counterpartyName);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it(`${name} (${file}): never keeps a generic mirror when a specific role exists`, () => {
      for (const row of rows) {
        const pair = raw.filter((c) => (c.counterpartyId ?? c.counterpartyName) === (row.counterpartyId ?? row.counterpartyName));
        const hasSpecific = pair.some((c) => isSpecificRole(c.role));
        if (hasSpecific) expect(isSpecificRole(row.role), `${name}: kept "${row.role}"`).toBe(true);
      }
    });

    it(`${name} (${file}): carries the largest ownership either side knew`, () => {
      for (const row of rows) {
        const pair = raw.filter((c) => (c.counterpartyId ?? c.counterpartyName) === (row.counterpartyId ?? row.counterpartyName));
        const best = pair.reduce<number | null>((acc, c) => {
          const own = connectionOwnership(c);
          return own === null ? acc : acc === null ? own : Math.max(acc, own);
        }, null);
        expect(row.ownershipPercent).toBe(best);
      }
    });

    it(`${name} (${file}): renders every counterparty the org sent`, () => {
      const rawIds = new Set(raw.map((c) => c.counterpartyId ?? c.counterpartyName));
      expect(rows.length).toBe(rawIds.size);
    });
  }
});

describe("the perspective rule, derived rather than fitted", () => {
  const pair = (a: Partial<Connection>, b: Partial<Connection>): Connection[] =>
    [{ counterpartyId: "X", counterpartyName: "Counterparty", ...a }, { counterpartyId: "X", counterpartyName: "Counterparty", ...b }] as Connection[];

  it("keeps the specific role whichever side it arrives on", () => {
    expect(collapseConnections(pair({ role: "Parent" }, { role: "Child" }))[0].role).toBe("Parent");
    // Same pair, opposite order: the rule is about the ROLE, not the position.
    expect(collapseConnections(pair({ role: "Child" }, { role: "Parent" }))[0].role).toBe("Parent");
  });

  it("resolves a lone mirror row to one coherent line", () => {
    const rows = collapseConnections([{ counterpartyId: "X", counterpartyName: "Holdings", role: "Child" } as Connection]);
    expect(rows).toHaveLength(1);
    expect(rows[0].counterpartyName).toBe("Holdings");
    expect(rows[0].role).toBe("Child");
    expect(rows[0].ownershipPercent).toBeNull();
  });

  it("resolves a pair of generics to one line, deterministically", () => {
    const rows = collapseConnections(pair({ role: "Company" }, { role: "Company", ownershipPercent: 30 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("Company");
    // The percent still comes from whichever half knew it.
    expect(rows[0].ownershipPercent).toBe(30);
  });

  it("takes the LARGER percent when the halves disagree", () => {
    expect(collapseConnections(pair({ role: "Owner", totalOwnershipPercent: 0 }, { role: "Company", ownershipPercent: 60 }))[0].ownershipPercent).toBe(60);
    expect(collapseConnections(pair({ role: "Owner", ownershipPercent: 55 }, { role: "Company", ownershipPercent: 40 }))[0].ownershipPercent).toBe(55);
  });

  it("renders a counterparty with no ownership at all", () => {
    const rows = collapseConnections(pair({ role: "Affiliated Company" }, { role: "Affiliated Company" }));
    expect(rows[0].ownershipPercent).toBeNull();
    expect(rows[0].role).toBe("Affiliated Company");
  });

  it("treats a person account like any other counterparty", () => {
    const rows = collapseConnections(pair({ role: "Owner", indirectOwnershipPercent: 60 }, { role: "Company" }));
    expect(rows[0].role).toBe("Owner");
    expect(rows[0].ownershipPercent).toBe(60);
  });

  it("treats a blank role as generic, not as a role of its own", () => {
    expect(isSpecificRole("")).toBe(false);
    expect(isSpecificRole(undefined)).toBe(false);
    expect(collapseConnections(pair({ role: "" }, { role: "Guarantor" }))[0].role).toBe("Guarantor");
  });

  it("renders nothing, and throws nothing, without connections", () => {
    expect(collapseConnections(undefined)).toEqual([]);
    expect(collapseConnections([])).toEqual([]);
  });
});

describe("Hartwell renders the exact quadruple the founder specified", () => {
  const hartwell = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"]!;
  const rows = collapseConnections(hartwell.graph?.connections);

  it("is four lines, from the viewed account's perspective", () => {
    expect(rows.map((r) => [r.counterpartyName, r.role, r.ownershipPercent])).toEqual([
      ["Hartwell Industrial Holdings LLC", "Parent", 100],
      ["Hartwell Logistics LLC", "Affiliated Company", null],
      ["James Hartwell", "Owner", 60],
      ["Elena Hartwell", "Co-Owner", 40],
    ]);
  });

  it("shows Holdings as Parent and never also as Child", () => {
    const holdings = rows.filter((r) => r.counterpartyName === "Hartwell Industrial Holdings LLC");
    expect(holdings).toHaveLength(1);
    expect(holdings[0].role).toBe("Parent");
  });
});

describe("collateral records for every borrower", () => {
  for (const [file, name, bundle] of everyBorrower) {
    const records = collateralRecords(bundle);
    const pledges = (bundle.exposure?.facilities ?? []).flatMap((f) => f.collateral ?? []);

    it(`${name} (${file}): one row per record, never one per pledge`, () => {
      expect(records.length).toBeLessThanOrEqual(pledges.length);
      const ids = records.map((r) => r.collateralId).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it(`${name} (${file}): every record names itself and what it secures`, () => {
      for (const r of records) {
        expect(r.displayName, `${name}: a record with no readable name`).toBeTruthy();
        expect(r.securesFacilities.length).toBeGreaterThan(0);
      }
    });

    it(`${name} (${file}): renders collateral when the bundle has any`, () => {
      if (pledges.length > 0) expect(records.length).toBeGreaterThan(0);
    });
  }

  it("Hartwell shows its four records at the founder's figures", () => {
    const hartwell = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"]!;
    const rows = collateralRecords(hartwell);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.currentValue).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([8_000_000, 10_000_000, 12_000_000, 14_000_000]);
  });

  it("falls back through description, then name, then type", () => {
    const b: BorrowerBundle = {
      snapshot: { accountId: "001X" },
      exposure: {
        facilities: [
          {
            loanId: "L1",
            status: "Open",
            collateral: [
              { collateralId: "A", collateralDescription: "Main warehouse", collateralName: "COL-1", collateralType: "Real Estate" },
              { collateralId: "B", collateralName: "COL-2", collateralType: "Real Estate" },
              { collateralId: "C", collateralType: "Inventory" },
            ],
          },
        ],
      },
    };
    expect(collateralRecords(b).map((r) => r.displayName)).toEqual(["Main warehouse", "COL-2", "Inventory"]);
  });
});

describe("covenant grouping is tolerant of a read that cannot say", () => {
  for (const [file, name, bundle] of everyBorrower) {
    it(`${name} (${file}): renders one honest list while attachedLoans is absent`, () => {
      const groups = groupCovenants(bundle.covenants?.covenants);
      const all = bundle.covenants?.covenants ?? [];
      // No bundle carries the field yet, so nothing is grouped and nothing is lost.
      expect(groups.grouped).toBe(false);
      expect(groups.account).toHaveLength(all.length);
      expect(groups.byFacility).toEqual([]);
    });
  }

  it("groups once the read carries the field", () => {
    const groups = groupCovenants([
      { covenantId: "c1", covenantType: "DSCR", attachedLoans: [] },
      { covenantId: "c2", covenantType: "Leverage", attachedLoans: [{ loanId: "L1", loanName: "Line of Credit" }] },
      { covenantId: "c3", covenantType: "Fixed Charge", attachedLoans: [{ loanId: "L1", loanName: "Line of Credit" }] },
      { covenantId: "c4", covenantType: "Tangible Net Worth", attachedLoans: [{ loanId: "L2", loanName: "Construction" }] },
    ]);
    expect(groups.grouped).toBe(true);
    expect(groups.account.map((c) => c.covenantId)).toEqual(["c1"]);
    expect(groups.byFacility.map((f) => [f.loanName, f.covenants.length])).toEqual([
      ["Line of Credit", 2],
      ["Construction", 1],
    ]);
  });

  it("reads an EMPTY attachedLoans as account-level, which is a different fact", () => {
    const groups = groupCovenants([{ covenantId: "c1", covenantType: "DSCR", attachedLoans: [] }]);
    expect(groups.grouped).toBe(true);
    expect(groups.account).toHaveLength(1);
  });

  it("loses no covenant to grouping", () => {
    const rows = [
      { covenantId: "c1", attachedLoans: [] },
      { covenantId: "c2", attachedLoans: [{ loanId: "L1", loanName: "A" }] },
    ];
    const groups = groupCovenants(rows);
    const rendered = groups.account.length + groups.byFacility.reduce((n, f) => n + f.covenants.length, 0);
    expect(rendered).toBe(rows.length);
  });
});
