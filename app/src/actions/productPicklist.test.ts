import { describe, expect, it } from "vitest";
import type { BorrowerBundle } from "../data/contract";
import { OBSERVED_PICKLISTS, observedPicklistMap } from "./observedPicklists";
import { buildPanelSchema } from "./schemas";

/* =============================================================================
   THE NEW FACILITY PRODUCT CHOICE (founder-reported empty state, 2026-07-26)

   The whole chain, pinned end to end: the cache key, the schema's `optionsFrom`,
   and the options the panel actually receives. Any one of the three drifting
   from the other two puts the banker back in front of an empty sheet, and the
   ticket cannot be staged without a product because the org files a blank one
   as `Construction`.
   ============================================================================= */

const KEY = "LLC_BI__Loan__c.LLC_BI__Product__c";
const PRODUCTS = ["Construction", "Equipment", "Line of Credit", "HELOC", "Purchase", "Deposit", "Term"];

const bundle: BorrowerBundle = {
  snapshot: { accountId: "001X", name: "Testco", productPackageId: "a5Fbb000000HA1NEAW" },
};

describe("the product choice is wired from the cache to the panel", () => {
  it("caches the seven active values the org describes", () => {
    expect(OBSERVED_PICKLISTS[KEY].values).toEqual(PRODUCTS);
    expect(OBSERVED_PICKLISTS[KEY].complete).toBe(true);
  });

  it("cites a live describe, not a relay", () => {
    expect(OBSERVED_PICKLISTS[KEY].citation).toContain("live describe 2026-07-26");
    expect(OBSERVED_PICKLISTS[KEY].citation).not.toContain("relayed");
  });

  it("exposes the cache under exactly the key the schema asks for", () => {
    const schema = buildPanelSchema("new-facility-request", { bundle, accountId: "001X", accountName: "Testco" })!;
    const product = schema.fields.find((f) => f.key === "productType")!;
    const asked = `${product.optionsFrom!.object}.${product.optionsFrom!.field}`;
    expect(asked).toBe(KEY);
    expect(observedPicklistMap()[asked]).toEqual(PRODUCTS);
  });

  it("hands the panel a populated option set, never the empty state", () => {
    const schema = buildPanelSchema("new-facility-request", {
      bundle,
      accountId: "001X",
      accountName: "Testco",
      orgPicklists: observedPicklistMap(),
    })!;
    const product = schema.fields.find((f) => f.key === "productType")!;
    expect(product.options).toEqual(PRODUCTS);
    expect(product.options?.length).toBeGreaterThan(0);
  });

  it("keeps the cache minimal: no entry no schema field asks for", () => {
    const referenced = new Set<string>();
    for (const actionId of [
      "collateral-valuation",
      "create-service-request",
      "annual-review",
      "new-facility-request",
      "risk-rating-review",
      "covenant-review",
      "loan-modification",
      "renewal",
    ]) {
      const schema = buildPanelSchema(actionId, { bundle, accountId: "001X", accountName: "Testco" });
      for (const f of schema?.fields ?? []) {
        if (f.optionsFrom) referenced.add(`${f.optionsFrom.object}.${f.optionsFrom.field}`);
      }
    }
    for (const key of Object.keys(OBSERVED_PICKLISTS)) {
      expect(referenced.has(key), `${key} is cached but no schema field asks for it`).toBe(true);
    }
  });
});
