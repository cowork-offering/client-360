# Collateral valuation: the banker's method, this org's objects, and the room's wire

Research for the RELATIONSHIP room, route `collateral-valuation`. Facility workroom untouched. Org
facts read live over REST on 2026-09-02 against the Hartwell package.

## 1. What a banker means by a collateral valuation

A valuation is a dated statement of what an asset is worth, struck on a named basis, from a named
source. It is not a credit decision and does not by itself change availability. The credit action is:
refresh the number, then let the coverage arithmetic hanging off it move.

**The five ways the number is produced.**

| Method | Used for | What it is |
|---|---|---|
| Appraisal | CRE, machinery and equipment | Licensed or certified appraiser, USPAP compliant. Required above the interagency CRE threshold of 500,000 dollars. |
| Evaluation | CRE at or below that threshold | A market value estimate that need not be USPAP compliant or by a licensed appraiser. |
| Broker opinion of value | CRE, quick reads between appraisals | Cheaper, weaker, never the basis of an advance on its own. |
| Internal valuation | A/R, deposits, marketable securities | The bank's own read off an aging, a statement or a screen price. |
| Field exam | Receivables and inventory on a revolver | The lender's examiner tests eligibility at the borrower's site, usually on the most recent month end, and sets ineligibles and reserves. Distinct from an inventory appraisal, which sets NOLV. |

**Basis matters more than the number.** Fair market value, orderly liquidation value and forced
liquidation value are three different numbers for one asset, in descending order, and M&E advance
rates are quoted against OLV. A figure without its basis is not a valuation, it is a rumour.

**Date, expiry, triggers.** Every valuation carries an as-of date and policy states how long it
stays good: monthly for A/R and inventory on a borrowing base, 12 to 24 months for M&E, 12 to 36 for
CRE. Refresh before expiry on renewal or increase, downgrade or watch listing, covenant breach,
material change in the asset or its market, a proposed release or substitution, an exam finding.

**The arithmetic downstream.**

```
lendable value = collateral value x advance rate      LTV = loan amount / collateral value
coverage ratio = total lendable value / outstandings
borrowing base = (eligible A/R x A/R rate) + (eligible inventory x inventory rate) - reserves
availability   = min(commitment, borrowing base) - outstandings
```

Lien position and insurance sit beside all of it: a 2nd lien values the same asset net of the
superior lien, and a lapsed policy is a finding whatever the asset appraises at.

Sources: [OCC 2018-10](https://occ.treas.gov/news-issuances/bulletins/2018/bulletin-2018-10.html) (CRE appraisal threshold) · [ABF Journal](https://www.abfjournal.com/examining-the-eligibility-of-inventory-as-collateral-in-asset-based-lending-agreements/) (inventory eligibility) · [Rosenberg and Fecci](https://www.rosenbergandfecci.com/post/what-is-the-purpose-of-a-lenders-field-examination1) (field exams)

## 2. This org, verified

**The chain.** `LLC_BI__Collateral__c` (the asset, no account lookup) to
`LLC_BI__Account_Collateral__c` (ownership, the only borrower link) to `LLC_BI__Loan_Collateral2__c`
(the pledge) to `LLC_BI__Lien__c` (perfection). The valuation hangs off the ASSET, not the pledge.

**`LLC_BI__Collateral_Valuation__c`, createable fields.** Only `LLC_BI__Collateral__c` is required
by the org. Then `LLC_BI__Value__c`, `LLC_BI__Valuation_Date__c`, `LLC_BI__Valuation_Description__c`,
`LLC_BI__Comments__c`, `LLC_BI__Valuation_Details__c`, `LLC_BI__Raw_Valuation_Details__c`,
`LLC_BI__Collateral_Type_SubType__c`, `LLC_BI__lookupKey__c`, plus three non-nillable booleans that
default false: `Active`, `Primary`, `Original_Value`. `Name` is autonumber (`CV-00000000nn`).

`LLC_BI__Type__c`, 16 active: Actual Cash Value, As Complete Value, As Is Value, As Stabilized
Value, Balance Sheet, Book Value, Cash Balance, Contents Value, Fair Market Value - Real Estate,
Fair Market Value - Equipment / Transportation, Net Orderly Liquidation Value, Orderly Liquidation
Value, Preliminary Value, Purchase Price, Replacement Cost Value, Waived Value.
`LLC_BI__Source__c`, 14 active: Account Balance / Statement, Appraisal, Credit Officer, Financial
Statement, Insurance Agent, Internal Valuation, Inventory Report, Invoice / Bill of Sale, Real Estate
Abundance of Caution, Receivables Aging, Real Estate Evaluation, Real Estate Restricted Appraisal,
Third Party Source, Valuation Service Vendor.

No "Broker Opinion of Value" and no "Field Exam" source exists here. A BOV files as Third Party Source, a field exam as Internal Valuation or Inventory Report. Say so, do not pick silently.

**Advance rate and lendable value, the two-level truth.**

```
Collateral.Advance_Rate__c   = Collateral_Type__r.Advance_Rate__c                     (formula)
Collateral.Lendable_Value__c = IF(Is_Leased_Asset, Value, ROUND(Value x type rate, 2)) (formula)
Pledge.Advance_Rate__c       = Override ?? Auto_Applied ?? type rate                   (formula)
Pledge.Current_Lendable_Value__c                                   (org-populated, not a formula)
```

So the ASSET's lendable value uses the collateral-type rate and ignores the pledge override, while
the PLEDGE's honours it. On Hartwell the two disagree by design, and the asset figure is never the
credit figure. Setting `LLC_BI__Advance_Rate_Override__c` fires the org's `Advance_Rate_Override`
rule, which demands `LLC_BI__Override_Reason__c` beside it.

Other asset-side derivations: `Loans_To_Value`, `Remaining_Lendable_Value`,
`Combined_Percent_Pledged`, `Total_Pledge_Amount`, `Total_Lien_Amount`. Staleness fields exist and
are currently unread by the room: `LLC_BI__Appraisal_Date__c`, `LLC_BI__Assessment_Method__c`,
`LLC_BI__Valuation_Frequency__c`, `LLC_BI__Next_Revaluation_Due_Date__c`,
`LLC_BI__Insurance_Expiration_Date__c`.

## 3. Human owns, org computes, never invented

| The human owns | The org computes | Never invented, never written |
|---|---|---|
| Which assets are being valued | `LLC_BI__Lendable_Value__c` on the asset (formula over type rate) | `LLC_BI__Lendable_Value__c`, fenced by `C360WriteGuard` on both the valuation and the collateral |
| The figure, per asset | `LLC_BI__Advance_Rate__c` on asset and pledge (formulas) | `LLC_BI__Advance_Rate__c`, `Name`, `RecordTypeId` on collateral |
| The as-of date the value was struck | `Current_Lendable_Value`, `Total_Pledged_Rollup_*` on the pledge | `LLC_BI__Authorize__c`, the banker's over-pledge escape |
| The basis (`LLC_BI__Type__c`) | `Loans_To_Value`, `Remaining_Lendable_Value`, `Combined_Percent_Pledged` | Any pledge, lien or advance-rate change: this route creates valuations only |
| The source (`LLC_BI__Source__c`) | Coverage ratio and shortfall, from `Customer360Exposure` | A coverage improvement claimed off an unproven rollup |
| Whether this becomes the Primary valuation | `Name`, the `CV-` autonumber | An asset outside the named product package |
| The rationale for the audit ledger | Whether the parent collateral value moves (it does not, headless) | A second valuation on an asset for a date already on file |

`Active = true` and `Original_Value = false` are set by the tool, not asked: a revaluation is by
definition active and not the original.

## 4. The exact wire

`stage_collateral_valuation` (StageCollateralValuation.cls), then `execute_collateral_valuation` behind the single-use decision token. Stage writes zero domain rows.

```json
{
  "idempotencyKey": "<stable across resume>",
  "rationale":      "<why this valuation is being filed, feeds the ledger>",
  "productPackageId": "a5Fbb000000IHFJEA4",
  "items": [
    { "collateralId": "a35bb0000013y2HAAQ", "value": 9250000, "valuationDate": "2026-08-31",
      "type": "Net Orderly Liquidation Value", "source": "Appraisal", "primary": true,
      "description": "Hilco desktop update, August 2026" }
  ]
}
```

The same fields flat on the request are the single-item shape. Supplying both is refused: two shapes
is two intentions. Only `idempotencyKey` and `rationale` carry `required=true` on the invocable, so
the rest is enforced in Apex where the refusal can name the item and the reason.

**Stage-time refusals, all in banker language.** Missing rationale or `productPackageId`; no item;
more than 20 items (a governor budget: 24 CDC triggers enqueue one queueable per record against a
ceiling of 50); missing `collateralId`, `value` or `valuationDate`; a negative value; the same
collateral twice in one batch; a picklist value the org does not offer; a collateral not visible;
a collateral reaching the package through neither a pledge to one of its loans nor the ownership
junction to its borrower; an existing valuation on the same collateral and date.

**Execute writes exactly nine fields** on `LLC_BI__Collateral_Valuation__c`: Collateral, Value,
Valuation_Date, Type, Source, Valuation_Description, Primary, Active (true), Original_Value (false).
It then re-reads the parent and reports honestly. Wave 3 probe 6 settled it on both arms: filing a
valuation does NOT move `LLC_BI__Collateral__c.LLC_BI__Value__c`. nCino binds that rollup to the
Add Valuation button and it does not fire headlessly. The room says "valuation filed, collateral
value unchanged" and claims no coverage improvement.

## 5. Hartwell, worked

Package `a5Fbb000000IHFJEA4`, Hartwell Industrial C&I Credit Package, Complete / Approved. All four
assets are owned through `LLC_BI__Account_Collateral__c` (AC-00012 to AC-00015) and pledged across
seven `LLC_BI__Loan_Collateral2__c` rows (LC-00011 to LC-00017), every one 1st position,
`Is_Excluded = false`, `Pledged_Status = Inactive`.

| Asset | Type (rate) | Value | Asset lendable | Pledge rate | Latest valuation | Basis / source | Freq, next due |
|---|---|---|---|---|---|---|---|
| COL-000762 Eligible A/R | UCC-Accounts (80) | 12,000,000 | 9,600,000 | 80 | CV-0000000007, 2026-06-30 | Balance Sheet / Receivables Aging | Monthly, 2026-07-31 |
| COL-000763 Inventory | UCC-Inventory (80) | 8,000,000 | 6,400,000 | 50 override | CV-0000000009, 2026-06-30 | Book Value / Inventory Report | Monthly, 2026-07-31 |
| COL-000764 Equipment | UCC-Equipment (80) | 10,000,000 | 8,000,000 | 75 override | CV-0000000011, 2026-04-30 | Orderly Liquidation Value / Appraisal | Annually, 2027-04-30 |
| COL-000765 Real estate | Real Estate-Warehouse (80) | 14,000,000 | 11,200,000 | 75 override | CV-0000000013, 2026-02-28 | Fair Market Value - Real Estate / Appraisal | Annually, 2027-02-28 |

Three beats a banker will recognise and the room should be able to speak to.

1. **Two are overdue.** A/R and inventory are monthly with a next re-valuation due date of
   2026-07-31, which as of 2026-09-02 is 33 days past. That is the org's own field, not a guess, and
   it is the natural opening for the route.
2. **The equipment number fell and that is not a decline.** CV-0000000010 read 11,500,000 on
   2024-08-15 on a Fair Market Value - Equipment basis; CV-0000000011 reads 10,000,000 on 2026-04-30
   on an Orderly Liquidation Value basis. Different basis, not a 1.5m impairment. The override reason
   on LC-00014 says exactly that, in the bank's own words.
3. **The two lendable values disagree, correctly.** Inventory: the asset formula says 6,400,000 at
   the 80 percent type rate, the pledge says 4,000,000 at the 50 percent policy rate, and the credit
   figure is the pledge figure. Liens L-00033 to L-00036 are all 1st, active, internal to First
   Midwest, expiring 2029-03-15, and every one carries `Is_Excluded = true`, so they sit outside
   availability math. Do not quietly treat them as included.

Prior-value history is on file for all four (CV-...006, 008, 010, 012), each `Original_Value = true`,
`Active = false`. A new valuation joins that ladder rather than replacing anything.

## 6. What the room should ask, and in what order

`valuationStep` in `reviewFlows.ts` asks which assets, then a figure per asset, then one shared
date, basis and source. That order is right and asks only what the human owns. Three additions, all
on the existing wire:

1. Open with the staleness fact, not a blank question: "A/R and inventory were last valued 30 June,
   monthly cycle, due 31 July." Both figures are readable today.
2. Offer `primary`. The tool takes it, the room hardcodes `primary: false`, and whether a refresh
   becomes the primary valuation is a banker's call.
3. Offer `description`. The tool takes it, the room sends `null`. One line naming the appraiser or
   the field exam is what makes the row readable a year later.

Neither needs a new org write arm: both are already inputs on `stage_collateral_valuation`.

## 7. Open questions

1. `Customer360Exposure` returns `collateralId`, `collateralName`, `collateralDescription`,
   `amountPledged` and `advanceRateSource`, but no valuation date, `Next_Revaluation_Due_Date__c` or
   `Appraisal_Date__c`. Adding them is a read-side change on an existing tool. In scope this wave?
2. `WORKROOM-BRAIN.md` 2.6 and the Stage class header both say this org had zero prior valuation
   rows. It now has eight on the Hartwell assets. That doctrine text is stale.
3. `C360WriteGuard` fences `LLC_BI__Lendable_Value__c` on `OBJ_VALUATION`, but the field does not
   exist on that object here. Harmless, worth a comment so the next reader stops looking.
4. Confirm the source mapping (BOV to Third Party Source, field exam to Internal Valuation or
   Inventory Report) before the demo, or the room picks one silently.
5. All seven Hartwell pledges read `Pledged_Status = Inactive` while the package is Complete /
   Approved. Fixture drift or intended? It changes how the room talks about coverage.
6. `Is_Excluded = true` on all four liens constrains availability language. Should the room name
   that, or stay off availability entirely?
