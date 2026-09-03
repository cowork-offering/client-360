import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, Collateral } from "./contract";
import { NO_NEXT_DATE, NO_VALUATION, assetValuation, valuationLine, valuationsOf } from "./collateralValuation";
import live from "../../../artifact/live-data.json";

/* =============================================================================
   THE VALUATION CLOCK ON A COLLATERAL LINE ITEM.

   THE DATA IS `artifact/live-data.json`, the Hartwell relationship as the org
   was read. Nothing below is a written fixture where the bundle can answer:
   the four assets, their valuation dates, their bases and their next dates all
   come off the file.

   THE DAY IS PINNED, AND IT IS NOT THE SNAPSHOT'S. The bundle was assembled on
   2026-07-25 and a banker reads it on whatever today is, so every RELATIVE
   phrase is measured against the real clock and the tests pin one rather than
   racing it. The ABSOLUTE dates below are the org's own and never move.

   Four things are held. That the dates REACH the line for the assets the read
   carries them for. That a passed date reads as OVERDUE and never as a future
   phrase. That an asset the read carries no valuation for SAYS SO rather than
   going quiet or borrowing a neighbour's date. And that not one figure on the
   line is composed here.
   ============================================================================= */

const LIVE = live as unknown as C360Data;
const HARTWELL = "001bb00001I7FPNAA3";
const PIEDMONT = "001bb00001DLtRMAA1";

/** The day the banker is reading on. The snapshot's own instant (2026-07-25) is
 *  deliberately NOT this: measured against it, a date two months gone rendered
 *  as "in 6 days", which is the false sentence this suite exists to keep off
 *  the screen. */
const TODAY = Date.parse("2026-09-03T00:00:00Z");

const bundleOf = (id: string) => (LIVE.borrowers ?? {})[id] as BorrowerBundle;

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
    const v = assetValuation(named("COL-000762"), book(), TODAY);
    expect(v.name).toBe("CV-0000000007");
    expect(v.lastValued).toBe("Jun 30, 2026");
    expect(v.method).toBe("Balance Sheet, Receivables Aging");
    expect(v.nextDue).toBe("Jul 31, 2026");
    expect(v.nextDueDerived).toBe(false);
  });

  it("prints the whole line a collateral line item now reads", () => {
    expect(valuationLine(named("COL-000762"), book(), TODAY)).toBe(
      "Last valued Jun 30, 2026 at $12M · Balance Sheet, Receivables Aging · overdue since Jul 31, 2026",
    );
  });

  it("dates the equipment on its own annual cycle, not the receivables' monthly one", () => {
    const v = assetValuation(named("COL-000764"), book(), TODAY);
    expect(v.lastValued).toBe("Apr 30, 2026");
    expect(v.method).toBe("Orderly Liquidation Value, Appraisal");
    expect(v.nextDue).toBe("Apr 30, 2027");
    expect(v.overdue).toBe(false);
  });

  it("gives all four assets a date and a next date, so no line goes quiet", () => {
    for (const c of hartwell()) {
      const v = assetValuation(c, book(), TODAY);
      expect(v.lastValued, c.collateralName).not.toBeNull();
      expect(v.nextDue, c.collateralName).not.toBeNull();
    }
  });

  /* THE FIGURE IS THE ONE THE BUNDLE ALREADY HELD. No read on this cockpit
     stages `LLC_BI__Value__c` off the valuation, so the only money on the line
     is the asset's carried value, and a line may print no other. */
  it("invents no figure: the only money on the line is the asset's own carried value", () => {
    for (const c of hartwell()) {
      const line = valuationLine(c, book(), TODAY);
      const figures = line.match(/\$[\d.,]+[KMB]?/g) ?? [];
      expect(figures, c.collateralName).toHaveLength(1);
      expect(figures[0], c.collateralName).toBe(
        "$" + String(c.collateralValue! / 1e6).replace(/(\.\d)0$/, "$1") + "M",
      );
    }
  });
});

describe("a relative phrase is measured on the reader's own day, never the snapshot's", () => {
  const asset = () => named("COL-000762");
  const book = () => valuationsOf(bundleOf(HARTWELL));

  it("says overdue since the org's own date once the date has passed", () => {
    const v = assetValuation(asset(), book(), TODAY);
    expect(v.overdue).toBe(true);
    expect(valuationLine(asset(), book(), TODAY)).toContain("overdue since Jul 31, 2026");
  });

  it("never puts a future phrase on a date that has gone", () => {
    const line = valuationLine(asset(), book(), TODAY);
    expect(line).not.toMatch(/\bin \d+ days?\b/);
    expect(line).not.toContain("next due");
    // And never the day count, which only measures how long it has been wrong.
    expect(line).not.toMatch(/\bdays past\b/);
  });

  it("counts down in days while the date is still ahead", () => {
    // Five days out from the pinned day: the countdown is the reader's, not the
    // snapshot's, and the same asset read on a different day reads differently.
    const fiveOut = Date.parse("2026-07-26T00:00:00Z");
    expect(valuationLine(asset(), book(), fiveOut)).toContain("next due Jul 31, 2026, in 5 days");
    expect(assetValuation(asset(), book(), fiveOut).daysToDue).toBe(5);
  });

  it("says today on the day itself, and singular on the day before", () => {
    expect(valuationLine(asset(), book(), Date.parse("2026-07-31T00:00:00Z"))).toContain("next due Jul 31, 2026, today");
    expect(valuationLine(asset(), book(), Date.parse("2026-07-30T00:00:00Z"))).toContain("next due Jul 31, 2026, in 1 day");
  });

  it("leaves the absolute dates alone whatever day it is read on", () => {
    for (const now of [Date.parse("2026-01-01T00:00:00Z"), TODAY, Date.parse("2030-01-01T00:00:00Z")]) {
      const v = assetValuation(asset(), book(), now);
      expect(v.lastValued).toBe("Jun 30, 2026");
      expect(v.nextDue).toBe("Jul 31, 2026");
    }
  });

  it("defaults to the real clock when no day is pinned", () => {
    // The default is Date.now(). Nothing asserts a phrase off it: what is held
    // is that the call needs no clock from its caller and still answers.
    expect(assetValuation(asset(), book()).lastValued).toBe("Jun 30, 2026");
    expect(typeof assetValuation(asset(), book()).daysToDue).toBe("number");
  });
});

describe("an asset the read carries no valuation for says so", () => {
  it("says it on a relationship whose bundle stages no valuation block at all", () => {
    const piedmont = assetsOf(PIEDMONT);
    expect(piedmont.length).toBeGreaterThan(0);
    // Absent is "no read looked", never "never valued", and never a borrowed date.
    expect(bundleOf(PIEDMONT).collateralValuations).toBeUndefined();
    for (const c of piedmont) {
      expect(valuationLine(c, valuationsOf(bundleOf(PIEDMONT)), TODAY)).toBe(`${NO_VALUATION} · ${NO_NEXT_DATE}`);
    }
  });

  it("says it on ONE asset inside a relationship whose others are valued", () => {
    const unvalued: Collateral = { collateralId: "a35NEW", collateralType: "UCC-Inventory", collateralValue: 2_000_000 };
    expect(valuationLine(unvalued, valuationsOf(bundleOf(HARTWELL)), TODAY)).toBe(`${NO_VALUATION} · ${NO_NEXT_DATE}`);
  });

  it("is never called overdue, because a date nobody carries cannot have passed", () => {
    const unvalued: Collateral = { collateralId: "a35NEW", collateralValue: 2_000_000 };
    const v = assetValuation(unvalued, valuationsOf(bundleOf(HARTWELL)), TODAY);
    expect(v.daysToDue).toBeNull();
    expect(v.overdue).toBe(false);
  });
});

describe("the next date is the org's own, or the cycle's, or named as absent", () => {
  const only = (row: Record<string, unknown>): BorrowerBundle =>
    ({ collateralValuations: [{ collateralId: "a35A", ...row }] }) as unknown as BorrowerBundle;
  const asset: Collateral = { collateralId: "a35A", collateralValue: 8_000_000 };

  it("derives the next date from the cycle where the org stores none, and says it derived it", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30", valuationFrequency: "Monthly" }));
    const v = assetValuation(asset, book, Date.parse("2026-07-26T00:00:00Z"));
    expect(v.nextDue).toBe("Jul 31, 2026");
    expect(v.nextDueDerived).toBe(true);
    expect(valuationLine(asset, book, Date.parse("2026-07-26T00:00:00Z"))).toContain(
      "next due Jul 31, 2026, on the cycle, in 5 days",
    );
  });

  it("keeps saying it derived the date when calling the asset overdue off it", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30", valuationFrequency: "Monthly" }));
    expect(valuationLine(asset, book, TODAY)).toContain("overdue since Jul 31, 2026, on the cycle");
  });

  it("says there is no next date rather than guessing a cycle from the asset", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30" }));
    expect(assetValuation(asset, book, TODAY).nextDue).toBeNull();
    expect(valuationLine(asset, book, TODAY)).toBe(`Last valued Jun 30, 2026 at $8M · ${NO_NEXT_DATE}`);
  });

  it("prints an unreadable date as the org wrote it, and gives up only the countdown", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30", nextRevaluationDue: "whenever" }));
    const line = valuationLine(asset, book, TODAY);
    expect(line).toContain("next due whenever");
    expect(line).not.toContain("null");
    expect(line).not.toContain("overdue");
  });

  it("says there is no next date for a cycle word the org does not use", () => {
    const book = valuationsOf(only({ valuationDate: "2026-06-30", valuationFrequency: "When convenient" }));
    expect(assetValuation(asset, book, TODAY).nextDue).toBeNull();
  });

  it("carries a month end onto a month end when it derives one", () => {
    // 28 Feb plus an annual cycle is 28 Feb; 28 Feb plus a monthly cycle is
    // 31 Mar, because the org strikes these on month ends and so does this.
    const monthly = valuationsOf(only({ valuationDate: "2026-02-28", valuationFrequency: "Monthly" }));
    expect(assetValuation(asset, monthly, TODAY).nextDue).toBe("Mar 31, 2026");
    const annually = valuationsOf(only({ valuationDate: "2026-02-28", valuationFrequency: "Annually" }));
    expect(assetValuation(asset, annually, TODAY).nextDue).toBe("Feb 28, 2027");
  });
});
