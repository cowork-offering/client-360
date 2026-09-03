import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, Collateral } from "./contract";
import { NO_NEXT_DATE, NO_VALUATION, assetValuation, valuationLine, valuationsOf } from "./collateralValuation";
import live from "../../../artifact/live-data.json";

/* =============================================================================
   THE VALUATION CLOCK ON A COLLATERAL LINE ITEM.

   THE DATA IS `artifact/live-data.json`, the Hartwell relationship as the org
   was read. Nothing below is a written fixture where the bundle can answer:
   the four assets, their valuation dates, their bases and their next dates all
   come off the file, and the snapshot's own clock (2026-07-25) is what every
   day count is measured against.

   Three things are held. That the dates REACH the line for the assets the read
   carries them for. That an asset the read carries no valuation for SAYS SO
   rather than going quiet or borrowing a neighbour's date. And that not one
   figure on the line is composed here: the only money it prints is the asset's
   own carried value, which the bundle already held.
   ============================================================================= */

const LIVE = live as unknown as C360Data;
const HARTWELL = "001bb00001I7FPNAA3";
const PIEDMONT = "001bb00001DLtRMAA1";

const bundleOf = (id: string) => (LIVE.borrowers ?? {})[id] as BorrowerBundle;
const AS_OF = LIVE.meta?.generatedAt ?? "";

/** Every distinct pledged asset on a relationship, by collateral id. */
function assetsOf(id: string): Collateral[] {
  const out = new Map<string, Collateral>();
  for (const f of bundleOf(id)?.exposure?.facilities ?? []) {
    for (const c of f.collateral ?? []) if (c.collateralId && !out.has(c.collateralId)) out.set(c.collateralId, c);
  }
  return [...out.values()];
}

const hartwell = () => assetsOf(HARTWELL);
const named = (name: string) => hartwell().find((c) => c.collateralName === name)!;

describe("the read carries the dates for Hartwell's assets", () => {
  const book = () => valuationsOf(bundleOf(HARTWELL));

  it("carries one valuation per distinct asset, not one per pledge row", () => {
    // Seven pledge rows, four assets. A cross-pledged asset is valued once.
    expect(book().size).toBe(4);
    expect(hartwell()).toHaveLength(4);
  });

  it("dates the receivables off the org's own row, with its basis and its source", () => {
    const v = assetValuation(named("COL-000762"), AS_OF, book());
    expect(v.name).toBe("CV-0000000007");
    expect(v.lastValued).toBe("Jun 30, 2026");
    expect(v.method).toBe("Balance Sheet, Receivables Aging");
    expect(v.nextDue).toBe("Jul 31, 2026");
    expect(v.nextDueDerived).toBe(false);
  });

  it("prints the whole line a collateral line item now reads", () => {
    expect(valuationLine(named("COL-000762"), AS_OF, book())).toBe(
      "Last valued Jun 30, 2026 at $12M · Balance Sheet, Receivables Aging · next due Jul 31, 2026, in 6 days",
    );
  });

  it("dates the equipment on its own annual cycle, not the receivables' monthly one", () => {
    const v = assetValuation(named("COL-000764"), AS_OF, book());
    expect(v.lastValued).toBe("Apr 30, 2026");
    expect(v.method).toBe("Orderly Liquidation Value, Appraisal");
    expect(v.nextDue).toBe("Apr 30, 2027");
    expect(v.overdue).toBe(false);
  });

  it("gives all four assets a date and a next date, so no line goes quiet", () => {
    for (const c of hartwell()) {
      const v = assetValuation(c, AS_OF, book());
      expect(v.lastValued, c.collateralName).not.toBeNull();
      expect(v.nextDue, c.collateralName).not.toBeNull();
    }
  });

  /* THE FIGURE IS THE ONE THE BUNDLE ALREADY HELD. No read on this cockpit
     stages `LLC_BI__Value__c` off the valuation, so the only money on the line
     is the asset's carried value, and a line may print no other. */
  it("invents no figure: the only money on the line is the asset's own carried value", () => {
    for (const c of hartwell()) {
      const line = valuationLine(c, AS_OF, book());
      const figures = line.match(/\$[\d.,]+[KMB]?/g) ?? [];
      expect(figures, c.collateralName).toHaveLength(1);
      expect(figures[0], c.collateralName).toBe(
        "$" + String(c.collateralValue! / 1e6).replace(/(\.\d)0$/, "$1") + "M",
      );
    }
  });
});

describe("an asset the read carries no valuation for says so", () => {
  it("says it on a relationship whose bundle stages no valuation block at all", () => {
    const piedmont = assetsOf(PIEDMONT);
    expect(piedmont.length).toBeGreaterThan(0);
    // Absent is "no read looked", never "never valued", and never a borrowed date.
    expect(bundleOf(PIEDMONT).collateralValuations).toBeUndefined();
    for (const c of piedmont) {
      expect(valuationLine(c, AS_OF, valuationsOf(bundleOf(PIEDMONT)))).toBe(`${NO_VALUATION} · ${NO_NEXT_DATE}`);
    }
  });

  it("says it on ONE asset inside a relationship whose others are valued", () => {
    const unvalued: Collateral = { collateralId: "a35NEW", collateralType: "UCC-Inventory", collateralValue: 2_000_000 };
    expect(valuationLine(unvalued, AS_OF, valuationsOf(bundleOf(HARTWELL)))).toBe(`${NO_VALUATION} · ${NO_NEXT_DATE}`);
  });
});

describe("the next date is the org's own, or the cycle's, or named as absent", () => {
  const only = (row: Record<string, unknown>): BorrowerBundle =>
    ({ collateralValuations: [{ collateralId: "a35A", ...row }] }) as unknown as BorrowerBundle;
  const asset: Collateral = { collateralId: "a35A", collateralValue: 8_000_000 };

  it("derives the next date from the cycle where the org stores none, and says it derived it", () => {
    const v = assetValuation(asset, "2026-07-25", valuationsOf(only({ valuationDate: "2026-06-30", valuationFrequency: "Monthly" })));
    expect(v.nextDue).toBe("Jul 31, 2026");
    expect(v.nextDueDerived).toBe(true);
    expect(valuationLine(asset, "2026-07-25", valuationsOf(only({ valuationDate: "2026-06-30", valuationFrequency: "Monthly" })))).toContain(
      "next due Jul 31, 2026, on the cycle, in 6 days",
    );
  });

  it("says there is no next date rather than guessing a cycle from the asset", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30" }));
    expect(assetValuation(asset, "2026-07-25", book).nextDue).toBeNull();
    expect(valuationLine(asset, "2026-07-25", book)).toBe(`Last valued Jun 30, 2026 at $8M · ${NO_NEXT_DATE}`);
  });

  it("says there is no next date for a cycle word the org does not use", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30", valuationFrequency: "When convenient" }));
    expect(assetValuation(asset, "2026-07-25", book).nextDue).toBeNull();
  });

  it("counts a passed date as past, in days, off the snapshot's clock and no other", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30", nextRevaluationDue: "2026-07-31" }));
    expect(assetValuation(asset, "2026-09-02", book).overdue).toBe(true);
    expect(valuationLine(asset, "2026-09-02", book)).toContain("next due Jul 31, 2026, 33 days past");
  });

  it("keeps the dates and drops only the staleness where the caller has no clock", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30", nextRevaluationDue: "2026-07-31" }));
    const v = assetValuation(asset, null, book);
    expect(v.lastValued).toBe("Jun 30, 2026");
    expect(v.daysToDue).toBeNull();
    expect(v.overdue).toBe(false);
    expect(valuationLine(asset, null, book)).toContain("next due Jul 31, 2026");
  });
});
