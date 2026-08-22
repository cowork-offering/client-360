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

const LIVE_DESCRIBE_2026_08_22 = "live org read 2026-08-22 (WS0.5 items 2+3), recorded in C360Covenants and its refusal messages";

/**
 * The three statuses `stage_covenant_review` will WRITE a compliance row to.
 *
 * NOT AN ORG VALUE SET, which is why it is a constant here rather than an entry
 * in the cache below. The org's own picklist on
 * `LLC_BI__Covenant_Compliance2__c.LLC_BI__Status__c` holds five values —
 * Compliant, Exception, In Progress, Pending and Waived (read live 2026-08-22)
 * — and `Pending` and `In Progress` are states a row ARRIVES in, not states a
 * review may move it to. The tool refuses them by name. Offering a value the
 * tool will refuse is worse than offering three, so the assessment control is
 * built from the TOOL's contract (`C360Covenants.TERMINAL_STATUSES`, read from
 * the deployed source) rather than from the org describe.
 *
 * `Waived` is one of the three. It is its own outcome — a decision not to
 * enforce — and never a synonym for compliant or for breached.
 */
export const COVENANT_ASSESSMENT_STATUSES = ["Compliant", "Waived", "Exception"];

export const OBSERVED_PICKLISTS: Record<string, ObservedPicklist> = {
  // The field that separates a failed test from an undelivered document. Two
  // values, and the tool refuses anything else.
  "LLC_BI__Covenant_Compliance2__c.LLC_BI__Reason_for_Exception__c": {
    values: ["Breached", "Overdue"],
    complete: true,
    citation: LIVE_DESCRIBE_2026_08_22,
  },
  // RECORD-TYPE SCOPED. The field's full value set is seven, but the Apex
  // validates against the COMMERCIAL record type's list, which excludes `Term`.
  // Offering a value the tool will refuse is worse than offering six.
  "LLC_BI__Loan__c.LLC_BI__Product__c": {
    values: ["Construction", "Equipment", "Line of Credit", "HELOC", "Purchase", "Deposit"],
    complete: true,
    citation: "record-type-scoped values, PROBE-LEDGER wave 5 + live RT describe 2026-07-26",
  },
  // The org has already answered this one, so the panel must never block on it:
  // the tool creates a real LLC_BI__Review__c and the banker has to be able to
  // say which kind of review it is.
  "LLC_BI__Review__c.LLC_BI__Review_Type__c": {
    values: ["Annual", "AdHoc", "Problem Loan"],
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
