import { describe, expect, it } from "vitest";
import { buildReadCard, readGap, type ReadSource } from "./readCard";
import type { BorrowerBundle, C360Data } from "../../data/contract";
import live from "../../../../artifact/live-data.json";
import sample from "../../../../artifact/sample-data.json";

/* =============================================================================
   THE READ CARDS, OVER EVERY STAGED RELATIONSHIP.

   Founder rule (2026-07-27): a surface that renders correctly for one
   relationship and wrongly for another is a failed round item. A read card is
   built from whatever the bundle holds, so it is proved against every borrower
   in every staged file rather than against Hartwell's six facilities.

   THE INVARIANT UNDER ALL OF IT: a card either has rows or it does not exist.
   An empty card is the frame of an answer with no answer in it, and `readGap`
   is what the room says instead.
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

const srcFor = (bundle: BorrowerBundle, name: string): ReadSource => ({
  bundle,
  accountName: name,
  productPackageId: null,
});

describe("a read card is never an empty frame", () => {
  it("has borrowers to check", () => {
    expect(everyBorrower.length).toBeGreaterThanOrEqual(5);
  });

  for (const [file, name, bundle] of everyBorrower) {
    for (const topic of ["structure", "covenants", "collateral", "facilities", "fees"] as const) {
      it(`${name} (${file}) · ${topic}: rows or nothing, never a frame`, () => {
        const card = buildReadCard(topic, srcFor(bundle, name));
        if (!card) {
          // The honest alternative has to say something, and it has to say it
          // in words a banker reads rather than in an empty card.
          expect(readGap(topic, name).length).toBeGreaterThan(20);
          return;
        }
        expect(card.groups.length).toBeGreaterThan(0);
        for (const g of card.groups) expect(g.rows.length).toBeGreaterThan(0);
        expect(card.lede.length).toBeGreaterThan(0);
        expect(card.followUp.length).toBeGreaterThan(0);
        // House style, everywhere in UI copy.
        expect(card.lede).not.toContain("—");
        expect(card.followUp).not.toContain("—");
      });
    }
  }
});

describe("the borrowers card the founder asked for", () => {
  const data = live as unknown as C360Data;
  const accountId = "001bb00001I7FPNAA3";
  const bundle = data.borrowers![accountId];
  const name = bundle.snapshot!.name!;

  it("answers from the involvements the bundle was already holding", () => {
    const card = buildReadCard("structure", srcFor(bundle, name))!;
    expect(card).toBeTruthy();
    const rows = card.groups.flatMap((g) => g.rows);
    expect(rows.length).toBeGreaterThan(0);
    // ROLE-GROUPED PER FACILITY: the heading names the facility, the row names
    // the party and the role it holds ON THAT FACILITY. A flat list of names
    // loses exactly the fact the question was asking about.
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.value.length).toBeGreaterThan(0);
    }
    expect(card.followUp).toMatch(/which facility/i);
  });

  it("answers the covenants question with thresholds and the org's own verdicts", () => {
    const card = buildReadCard("covenants", srcFor(bundle, name))!;
    expect(card).toBeTruthy();
    const rows = card.groups.flatMap((g) => g.rows);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.detail).toMatch(/threshold/);
      // The verdict is the org's own, read through the same classifier the
      // covenants tab renders - never a word this card made up.
      expect(row.value.length).toBeGreaterThan(0);
      expect(row.icon).toBe("covenant");
    }
    expect(card.followUp).toMatch(/threshold/i);
  });

  it("groups an account-level covenant apart from the ones attached to a facility", () => {
    const card = buildReadCard("covenants", srcFor(bundle, name))!;
    // An empty `attachedLoans` is a FACT (account level); absent is a read that
    // does not carry the field. Both land in the relationship-wide group rather
    // than being silently hung off a facility.
    const headings = card.groups.map((g) => g.heading);
    expect(headings).toContain("Across the relationship");
  });

  it("scopes to the package the room is anchored on", () => {
    const wide = buildReadCard("facilities", srcFor(bundle, name))!;
    const anchored = buildReadCard("facilities", {
      bundle,
      accountName: name,
      productPackageId: "no-such-package",
    });
    expect(wide.groups.flatMap((g) => g.rows).length).toBeGreaterThan(0);
    // Nothing belongs to a package that does not exist, so there is no card.
    expect(anchored).toBeNull();
  });
});

describe("fees are a gap in the read, and the room says so", () => {
  const data = live as unknown as C360Data;
  const bundle = data.borrowers!["001bb00001I7FPNAA3"];

  it("never lists fees, because no read tool carries them", () => {
    // "No fees" would be a claim nothing on this cockpit supports. The room
    // refuses to make it and offers the half of the answer it can honour.
    expect(buildReadCard("fees", srcFor(bundle, "Hartwell"))).toBeNull();
    const gap = readGap("fees", "Hartwell");
    expect(gap).toMatch(/cannot list them/i);
    expect(gap).toMatch(/percentage of the commitment|flat amount/i);
  });
});
