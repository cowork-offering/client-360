/* =============================================================================
   ORG-OBSERVED PICKLIST VALUES

   A33.1.6 is binding: picklist options are READ FROM THE ORG, never hardcoded.
   This module is the narrow, honest exception — a cache of values we have
   ACTUALLY OBSERVED, each carrying its citation, used to give the banker a
   starting set instead of an unusable disabled control.

   THE SETS BELOW ARE PARTIAL, AND THAT IS RECORDED, NOT PAPERED OVER.
   A33.4.5 records `LLC_BI__Source__c` as carrying 14 values and
   `LLC_BI__Type__c` 16. What we have observed is a handful of each, from the
   deployed tool's own field descriptions and its test fixture. The remainder
   has never been read, so it is not invented here.

   Consequences, all deliberate:
     - `complete: false` drives a combobox, not a closed select. The banker can
       enter a value we have not seen, because the org has values we have not
       seen.
     - The stage tool validates against the live picklist and returns the LEGAL
       LIST on mismatch. `parseLegalValues` lifts it out of the error and the
       panel re-renders with the authoritative set, which then supersedes this
       cache for that field.

   When someone reads the full picklists off the org, replace a set here and
   flip `complete: true`. Do not extend these by inference.
   ============================================================================= */

export interface ObservedPicklist {
  /** Values we have actually seen. Never inferred, never completed by guesswork. */
  values: string[];
  /** False when the org is known to hold more values than we have observed. */
  complete: boolean;
  /** Where these came from, rendered as the field's provenance citation. */
  citation: string;
}

const ACTIONS_API_2026_07_26 =
  "Actions API observation 2026-07-26: full legal list returned verbatim by the deployed stage tool's VALIDATION_FAILED response (bankinggpt)";

const LIVE_DESCRIBE_2026_07_26 = "live describe 2026-07-26 (sf sobject describe, active values)";

const CONTRACT_A33_5_7 = "A33.5.7 contract freeze, org picklist relayed 2026-07-26 (not yet re-verified against a live describe from this session)";

export const OBSERVED_PICKLISTS: Record<string, ObservedPicklist> = {
  // Wave 2. Relayed from the frozen contract rather than described here, so the
  // citation says exactly that: it is somebody else's describe, not ours.
  "LLC_BI__Covenant_Compliance2__c.LLC_BI__Status__c": {
    values: ["Compliant", "Exception"],
    complete: true,
    citation: CONTRACT_A33_5_7,
  },
  "LLC_BI__Loan__c.LLC_BI__Product__c": {
    values: ["Construction", "Equipment", "Line of Credit", "HELOC", "Purchase", "Deposit", "Term"],
    complete: true,
    citation: CONTRACT_A33_5_7,
  },
  // The org has already answered this one, so the panel must never block on it:
  // the tool creates a real LLC_BI__Review__c and the banker has to be able to
  // say which kind of review it is.
  "LLC_BI__Review__c.LLC_BI__Review_Type__c": {
    values: ["Annual", "AdHoc", "Problem Loan"],
    complete: true,
    citation: LIVE_DESCRIBE_2026_07_26,
  },
  // Read and rendered, never written by this tool: the review is created at
  // In Progress and the bank's own process owns every transition after that.
  "LLC_BI__Review__c.LLC_BI__Status__c": {
    values: ["In Progress", "Pending Approval", "Complete"],
    complete: true,
    citation: LIVE_DESCRIBE_2026_07_26,
  },
  "LLC_BI__Collateral_Valuation__c.LLC_BI__Type__c": {
    // The COMPLETE 16-value legal list, observed verbatim in the tool's own
    // VALIDATION_FAILED message (idempotencyKey observe-wp5-20260726-001).
    values: [
      "Actual Cash Value",
      "As Complete Value",
      "As Is Value",
      "As Stabilized Value",
      "Balance Sheet",
      "Book Value",
      "Cash Balance",
      "Contents Value",
      "Fair Market Value - Equipment / Transportation",
      "Fair Market Value - Real Estate",
      "Net Orderly Liquidation Value",
      "Orderly Liquidation Value",
      "Preliminary Value",
      "Purchase Price",
      "Replacement Cost Value",
      "Waived Value",
    ],
    complete: true,
    citation: ACTIONS_API_2026_07_26,
  },
  "LLC_BI__Collateral_Valuation__c.LLC_BI__Source__c": {
    // The COMPLETE 14-value legal list, observed verbatim in the tool's own
    // VALIDATION_FAILED message (idempotencyKey observe-wp5-20260726-003).
    values: [
      "Account Balance / Statement",
      "Appraisal",
      "Credit Officer",
      "Financial Statement",
      "Insurance Agent",
      "Internal Valuation",
      "Inventory Report",
      "Invoice / Bill of Sale",
      "Real Estate Abundance of Caution",
      "Real Estate Evaluation",
      "Real Estate Restricted Appraisal",
      "Receivables Aging",
      "Third Party Source",
      "Valuation Service Vendor",
    ],
    complete: true,
    citation: ACTIONS_API_2026_07_26,
  },
};

/** Options for a field, or undefined when we have observed none. */
export function observedOptions(objectApi: string, fieldApi: string): ObservedPicklist | undefined {
  return OBSERVED_PICKLISTS[`${objectApi}.${fieldApi}`];
}

/** Shape the panel schema consumes: `Object.Field` to values. */
export function observedPicklistMap(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(OBSERVED_PICKLISTS).map(([k, v]) => [k, v.values]));
}
