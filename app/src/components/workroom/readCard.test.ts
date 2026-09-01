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

/* =============================================================================
   THE STRUCTURE CARD, NARROWED BY THE QUESTION (E7, drive 2026-09-01).

   "Any guarantors?" is a question about a ROLE, and a card that answers it with
   the borrowers as well has not answered it. Both `Guarantor` and `Limited
   Guarantor` are guarantors: a limited guaranty is a guaranty with a cap on it.
   ============================================================================= */

const HARTWELL = (live as unknown as C360Data).borrowers!["001bb00001I7FPNAA3"] as BorrowerBundle;

/** The same read with the borrowing structure the org actually holds folded in. */
const withGuarantors: BorrowerBundle = {
  ...HARTWELL,
  graph: {
    ...HARTWELL.graph,
    legalEntities: [
      ...(HARTWELL.graph?.legalEntities ?? []),
      { accountName: "Hartwell Industrial Holdings LLC", borrowerType: "Guarantor", loanId: "a4Zbb0000027MaYEAU" },
      { accountName: "Elena Hartwell", borrowerType: "Limited Guarantor", loanId: "a4Zbb0000027MaYEAU" },
    ],
  },
};

describe("a question about guarantors is answered with the guarantors", () => {
  const src = (bundle: BorrowerBundle): ReadSource => ({
    bundle,
    accountName: "Hartwell Precision Manufacturing LLC",
    productPackageId: null,
  });

  it("keeps the limited guarantor in the answer", () => {
    const card = buildReadCard("structure", src(withGuarantors), { role: "guarantor" })!;
    const rows = card.groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.label)).toEqual(["Hartwell Industrial Holdings LLC", "Elena Hartwell"]);
    expect(rows.map((r) => r.value)).toEqual(["Guarantor", "Limited Guarantor"]);
    expect(card.lede).toContain("guaranty rows");
    expect(card.lede).toContain("Limited guarantors are guarantors");
  });

  it("says so, and shows the whole structure, where the read carries no guaranty row", () => {
    // The pinned read carries six BORROWER rows and nothing else. An empty card
    // under a "Guarantors" heading is the frame of an answer with no answer in
    // it; this names the gap and shows what the read does carry.
    const card = buildReadCard("structure", src(HARTWELL), { role: "guarantor" })!;
    expect(card.lede).toContain("no guaranty rows");
    expect(card.groups.flatMap((g) => g.rows).length).toBeGreaterThan(0);
  });

  it("answers an unqualified structure question with every party, as it always has", () => {
    const card = buildReadCard("structure", src(withGuarantors))!;
    const rows = card.groups.flatMap((g) => g.rows);
    expect(rows.length).toBe((withGuarantors.graph?.legalEntities ?? []).length);
    expect(card.lede).toContain("parties are on this package today");
  });
});
