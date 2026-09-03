import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../../data/contract";
import { buildReadBlocks } from "../workroom/readBlocks";
import { buildReadCard, type ReadSource } from "../workroom/readCard";
import { nextStep, relContextFor, type RelContext } from "./reviewFlows";
import live from "../../../../artifact/live-data.json";

/* =============================================================================
   THE VALUATION CLOCK, ON THE TWO SURFACES A BANKER ACTUALLY READS IT.

   `data/collateralValuation.test.ts` holds the reader. This holds the MOUNTS:
   the plain collateral read, the collateral valuation route's opening read, and
   the envelope a desk answers off. All three print through one builder, so the
   thing being defended is that no surface can date an asset differently from
   the surface beside it.

   THE DATA IS `artifact/live-data.json`, the Hartwell relationship as the org
   was read, on the snapshot's own clock.
   ============================================================================= */

const LIVE = live as unknown as C360Data;
const HARTWELL = "001bb00001I7FPNAA3";
const PIEDMONT = "001bb00001DLtRMAA1";
const PACKAGE = "a5Fbb000000IHFJEA4";

const bundleOf = (id: string) => (LIVE.borrowers ?? {})[id] as BorrowerBundle;

function readsFor(id: string, productPackageId: string | null): ReadSource {
  return {
    bundle: bundleOf(id),
    accountName: bundleOf(id).snapshot?.name ?? "",
    productPackageId,
    generatedAt: LIVE.meta?.generatedAt,
  };
}

function ctxFor(id: string): RelContext {
  return relContextFor({
    data: LIVE,
    bundle: bundleOf(id),
    accountId: id,
    accountName: bundleOf(id).snapshot?.name ?? "",
  });
}

/** Every detail line the collateral card renders, across its groups. */
function collateralDetails(id: string, productPackageId: string | null): string[] {
  const card = buildReadCard("collateral", readsFor(id, productPackageId));
  return (card?.groups ?? []).flatMap((g) => g.rows.map((r) => r.detail ?? ""));
}

describe("the plain collateral read carries the dates", () => {
  it("dates every pledge row, beside the advance rate it always carried", () => {
    const details = collateralDetails(HARTWELL, PACKAGE);
    expect(details.length).toBeGreaterThan(0);
    for (const d of details) expect(d).toMatch(/Last valued .+ · next due |No valuation on file/);
  });

  it("reads the receivables line the way a banker would say it", () => {
    const details = collateralDetails(HARTWELL, PACKAGE);
    const ar = details.find((d) => d.startsWith("UCC-Accounts"))!;
    expect(ar).toBe(
      "UCC-Accounts · 80% advance · lien 1st · Active · Last valued Jun 30, 2026 at $12M · Balance Sheet, Receivables Aging · next due Jul 31, 2026, in 6 days",
    );
  });

  it("says so on a relationship whose bundle stages no valuation read", () => {
    for (const d of collateralDetails(PIEDMONT, null)) {
      expect(d).toContain("No valuation on file · no next date on file");
    }
  });
});

describe("the collateral valuation route opens on the clock", () => {
  const options = () => nextStep("valuation", ctxFor(HARTWELL), {})!.options ?? [];

  it("asks which assets first, and the chooser is where the staleness is flagged", () => {
    const step = nextStep("valuation", ctxFor(HARTWELL), {})!;
    expect(step.key).toBe("records");
    expect(step.ask).toBe("Which collateral are we valuing?");
    expect(options()).toHaveLength(4);
  });

  it("carries the date, the basis and the next date on every option the banker picks from", () => {
    for (const o of options()) {
      expect(o.detail, o.label).toMatch(/Last valued /);
      expect(o.detail, o.label).toMatch(/next due /);
    }
  });

  it("keeps the pledge lendable value beside the clock, never the asset's own formula", () => {
    // Inventory: the pledge reads $4M at the 50 percent policy rate, the asset
    // formula would read $6.4M at the 80 percent type rate. The credit figure
    // is the pledge figure, and the valuation clock does not displace it.
    const inventory = options().find((o) => o.detail?.startsWith("UCC-Inventory"))!;
    expect(inventory.detail).toContain("$4M lendable");
    expect(inventory.detail).toContain("Last valued Jun 30, 2026 at $8M · Book Value, Inventory Report");
    expect(inventory.detail).toContain("next due Jul 31, 2026, in 6 days");
  });
});

describe("the envelope a desk answers off carries the same line", () => {
  it("puts one valuation line on every collateral row it packs", () => {
    const blocks = buildReadBlocks(readsFor(HARTWELL, PACKAGE))!;
    expect(blocks.collateral?.length).toBeGreaterThan(0);
    for (const row of blocks.collateral ?? []) expect(row.valuation).toBeTruthy();
  });

  it("cannot disagree with the card, because both print through one builder", () => {
    const blocks = buildReadBlocks(readsFor(HARTWELL, PACKAGE))!;
    const details = collateralDetails(HARTWELL, PACKAGE);
    for (const row of blocks.collateral ?? []) {
      expect(details.some((d) => d.endsWith(row.valuation!))).toBe(true);
    }
  });
});
