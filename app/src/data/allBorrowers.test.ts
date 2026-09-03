import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, Connection } from "./contract";
import { collapseConnections, connectionOwnership, isSpecificRole } from "./graphAggregate";
import { collateralRecords } from "./collateralRecords";
import { covenantAttachment } from "../domain/covenantAttachment";
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

  it("Hartwell shows its seven records at the founder's figures", () => {
    // The org grew a second package (2026-09-03): four original records plus
    // the new plant, the new metrology fleet, and the equipment behind the
    // Proposal-stage loan.
    const hartwell = (live as unknown as C360Data).borrowers?.["001bb00001I7FPNAA3"]!;
    const rows = collateralRecords(hartwell);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.currentValue).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      2_100_000, 4_000_000, 8_000_000, 8_400_000, 10_000_000, 12_000_000, 14_000_000,
    ]);
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

describe("covenant attachment is tolerant of a read that cannot say", () => {
  for (const [file, name, bundle] of everyBorrower) {
    it(`${name} (${file}): says account-only, names the loans, or says it cannot tell`, () => {
      const all = bundle.covenants?.covenants ?? [];
      for (const c of all) {
        const a = covenantAttachment(c, bundle.exposure?.facilities, bundle.snapshot?.name);
        // Three states, never two. Absent is not empty.
        if (!Array.isArray(c.attachedLoans)) {
          expect(a.kind, `${name}: an unread junction read as a fact`).toBe("unread");
          expect(a.badge).toBe("—");
        } else if (c.attachedLoans.length === 0) {
          expect(a.kind).toBe("account");
          expect(a.badge).toBe("Account only");
        } else {
          expect(a.kind).toBe("loans");
          expect(a.rows).toHaveLength(c.attachedLoans.length);
        }
        // A covenant with no loan rows always has a sentence instead of a blank.
        if (a.rows.length === 0) expect(a.emptyLine).toBeTruthy();
      }
    });
  }

  it("reads an EMPTY attachedLoans as account-level, which is a different fact", () => {
    const empty = covenantAttachment({ covenantId: "c1", covenantType: "DSCR", attachedLoans: [] }, []);
    const absent = covenantAttachment({ covenantId: "c2", covenantType: "DSCR" }, []);
    expect(empty.kind).toBe("account");
    expect(absent.kind).toBe("unread");
    expect(empty.emptyLine).not.toBe(absent.emptyLine);
  });

  it("names a junction whose facility the exposure read does not carry", () => {
    const a = covenantAttachment(
      { covenantId: "c1", attachedLoans: [{ loanId: "L9", loanName: "Testco - Term Loan - $1,000,000.00" }] },
      [],
      "Testco",
    );
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].unresolved).toBe(true);
    expect(a.rows[0].committed).toBeNull();
    expect(a.rows[0].facility).toBe("Term Loan - $1,000,000.00");
  });
});


describe("the refreshed reads, per relationship", () => {
  const bundleOf = (id: string) => (live as unknown as C360Data).borrowers?.[id]!;

  it("Hartwell carries 2 account-only covenants and 4 that name a loan", () => {
    // The org grew a second package (2026-09-03) and attached DSC (to the new
    // CRE loan) and the FCC covenant (to the Proposal-stage equipment loan),
    // on top of the two that already named a loan (AR, the term covenant).
    // Only Debt to Worth and Minimum Liquidity remain account-only.
    const b = bundleOf("001bb00001I7FPNAA3");
    const kinds = (b.covenants?.covenants ?? []).map(
      (c) => covenantAttachment(c, b.exposure?.facilities, b.snapshot?.name).kind,
    );
    expect(kinds.filter((k) => k === "account")).toHaveLength(2);
    expect(kinds.filter((k) => k === "loans")).toHaveLength(4);
  });

  it("Piedmont is entirely account-level, and says so rather than guessing", () => {
    const b = bundleOf("001bb00001DLtRMAA1");
    const kinds = (b.covenants?.covenants ?? []).map((c) => covenantAttachment(c, b.exposure?.facilities).kind);
    expect(kinds).toEqual(["account", "account", "account", "account"]);
  });

  it("collateral now reads as its description, not its autonumber", () => {
    for (const id of ["001bb00001I7FPNAA3", "001bb00001DLtRMAA1"]) {
      for (const r of collateralRecords(bundleOf(id))) {
        expect(r.displayName, `${id}: ${r.collateralId} still shows an autonumber`).not.toMatch(/^COL-\d+$/);
        expect(r.displayName.length).toBeGreaterThan(10);
      }
    }
  });

  it("Hartwell's covenants each carry an open Pending test period (seeded 2026-09-02)", () => {
    // The org holds a closed prior quarter and one open Pending row per covenant
    // since the founder asked for the covenant review to be testable; the read
    // carries the open row's id and status.
    const rows = bundleOf("001bb00001I7FPNAA3").covenants?.covenants ?? [];
    expect(rows).toHaveLength(6);
    expect(rows.every((c) => typeof c.latestComplianceId === "string" && c.latestComplianceId.startsWith("a3C"))).toBe(true);
    expect(rows.every((c) => c.latestComplianceStatus === "Pending")).toBe(true);
  });
});
