import { describe, expect, it } from "vitest";
import {
  catalogField,
  catalogSummary,
  FIELD_CATALOG,
  FILEABLE_FIELDS,
  isFileable,
  matchCatalog,
} from "./fieldCatalog";

/* =============================================================================
   THE INDEX, HELD TO ITS OWN RULES.

   W1 asked for the loan and package fields to be INDEXED so a natural-language
   amendment maps to the correct real field. What is proved here is the property
   that makes an index trustworthy rather than merely present: a name that can
   reach the org is a name somebody observed, a name nobody observed can never
   reach the org, and the longest phrase wins the match.
   ============================================================================= */

describe("the modification field catalog", () => {
  it("ships an entry for every W1 amendment category, fees and parties included", () => {
    const categories = new Set(FIELD_CATALOG.map((f) => f.category));
    for (const required of ["loan-terms", "package", "covenant", "collateral", "party", "pricing", "fee", "exception"]) {
      expect(categories.has(required as never)).toBe(true);
    }
  });

  it("files EXACTLY the four changes stage_loan_modification carries, and no others", () => {
    expect(FILEABLE_FIELDS.map((f) => f.id).sort()).toEqual([
      "loan.amount",
      "loan.interestRate",
      "loan.maturityDate",
      "loan.termMonths",
    ]);
    expect(FILEABLE_FIELDS.map((f) => f.wireKey).sort()).toEqual([
      "requestedAmount",
      "requestedMaturityDate",
      "requestedRate",
      "requestedTermMonths",
    ]);
  });

  it("carries the InterestRate lesson, so the parse can never re-learn it", () => {
    // LLC_BI__Interest_Rate__c DOES NOT EXIST on Loan in this org, and a whole
    // wave shipped a plan declaring it because nothing dereferences a field name
    // in a plan until something executes.
    expect(catalogField("loan.interestRate")!.apiName).toBe("LLC_BI__InterestRate__c");
    const names = FIELD_CATALOG.map((f) => f.apiName);
    expect(names).not.toContain("LLC_BI__Interest_Rate__c");
  });

  it("only ever sends a name somebody observed", () => {
    // THE RULE THAT MAKES to-verify-live SAFE. A candidate name may be spoken
    // about; it may never travel to the org.
    for (const field of FILEABLE_FIELDS) {
      // The four that file are the four a live describe confirmed by name.
      expect(field.source).toBe("live-verified");
      expect(field.apiName).toBeTruthy();
    }
    for (const field of FIELD_CATALOG.filter((f) => f.source === "to-verify-live")) {
      expect(isFileable(field)).toBe(false);
    }
  });

  it("says why, and what would close it, for everything it cannot file", () => {
    for (const field of FIELD_CATALOG.filter((f) => !isFileable(f))) {
      expect(field.gap, field.id).toBeTruthy();
      expect(field.closes, field.id).toBeTruthy();
    }
  });

  it("matches the LONGEST phrase, so a fee is never read as a commitment", () => {
    expect(matchCatalog("waive the commitment fee")[0].field.id).toBe("fee.row");
    expect(matchCatalog("what is the current rate")[0].field.id).toBe("loan.currentInterestRate");
    expect(matchCatalog("push the maturity date out")[0].field.id).toBe("loan.maturityDate");
  });

  it("matches on word boundaries, so a rate does not hide inside a word", () => {
    expect(matchCatalog("the corporate structure")).toHaveLength(0);
    expect(matchCatalog("we need to determine this")).toHaveLength(0);
  });

  it("reads several amendments out of one line, in the order they were said", () => {
    const hits = matchCatalog("raise the commitment and move the maturity date");
    expect(hits.map((h) => h.field.id)).toEqual(["loan.amount", "loan.maturityDate"]);
  });

  it("reports what it covers, so the room can state its own limits", () => {
    const summary = catalogSummary();
    expect(summary.total).toBe(FIELD_CATALOG.length);
    expect(summary.fileable).toBe(4);
    expect(summary.bySource.reduce((n, s) => n + s.total, 0)).toBe(summary.total);
  });
});
