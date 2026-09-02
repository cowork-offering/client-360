# Covenant testing: banking practice, this org, and the room

Research for the RELATIONSHIP room, covenant route. 2026-09-02. Sources: standard middle-market C&I practice plus the citations at
the foot; this org read live over REST 2026-09-02 (bankinggpt); the deployed Apex in `knowledge/sf-build-v2/wp2/classes/`;
doctrine `brain/WORKROOM-BRAIN.md` 2.4, 4.2 to 4.4, 5.3, 5.5.

## 1. How a bank tests a covenant

**Test date, frequency, measurement period.** All three come from the credit agreement, not from the day somebody opens the file.
C&I standard is coverage and leverage quarterly, a CapEx cap annually, a borrowing-base certificate monthly. Coverage and leverage
are measured on the trailing twelve months (sometimes rolling four quarters, sometimes annualised from a stub in year one);
balance-sheet tests (tangible net worth, liquidity, current ratio) are point in time on the test date.

**The compliance certificate** is the borrower's officer-signed calculation, delivered within a stated window: 45 days after a
quarter end, 90 to 120 after a fiscal year end, often 30 on a monthly borrowing base. It is the DELIVERY obligation and the ratio
is the FINANCIAL obligation. They fail separately and a bank tracks them separately.

**Actual against threshold, and cushion** (doctrine 4.3). On a maximum-direction covenant (lower is better, max leverage) cushion
is `(trigger - actual) / trigger`; on a minimum-direction covenant (higher is better, min DSCR) it is
`(actual - trigger) / trigger`. Getting the sign backwards is a named failure mode; check the direction before you speak.

Watch band 10 percent. At underwriting a covenant is set to leave 15 to 25 percent cushion against the borrower's own projections;
under 10 percent is too tight and above roughly 40 percent does not bind (5.3).

**Breach, overdue, waived, amended** are four different events. Breach: the test ran and failed. Overdue: the date passed and the
result was not delivered, a reporting failure. Waived: relief for a period, the covenant still exists. Amended: terms changed, so
apply the framework to the modified terms. A pricing grid and an acquisition basket are CONDITIONS, not covenants, and a
conditional covenant whose precondition is inactive reads `n/a`, never `compliant`.

**Cure, waiver, equity cure, reset.** A non-financial default usually carries a 5 to 30 day notice and cure window. A financial
covenant breach is generally not curable by performance; it is fixed by a waiver (one period, priced), an amendment resetting the
covenant for the remaining term, a paydown, or an equity cure where the sponsor injects cash treated as an EBITDA add-back for the
period. Equity cures are sponsor mechanics: deliverable about 10 business days after the certificate, capped in frequency
(commonly three times over the term, once in any four quarters), proceeds often required to pay down debt. A breach memo names
breach date, notice provisions, default rate step-up (commonly plus 200 bps), cross-default, action and escalation.

## 2. Which covenants come off which statements

Doctrine 6.3 rule of division: `Customer360Covenants` says what nCino ALREADY evaluated, Boom says what the financials say NOW, and
the room says which number came from where.

| Covenant | Formula | Statement lines it needs |
|---|---|---|
| DSCR | (LTM EBITDA - CapEx - Cash Taxes) / (LTM Interest + Scheduled Principal) | income statement plus debt schedule |
| FCCR | (LTM EBITDA - CapEx - Cash Taxes - Distributions) / (LTM Interest + Scheduled Principal + Rent) | income statement, distributions, lease expense |
| Total leverage | Total Funded Debt / LTM Adjusted EBITDA | balance-sheet debt plus the EBITDA build |
| Debt to tangible net worth | Total Liabilities / Tangible Net Worth | balance sheet only, point in time |
| Minimum liquidity | Cash + undrawn revolver availability | balance sheet plus the facility read |
| Borrowing base | (eligible A/R x rate) + (eligible inventory x rate) less reserves | the certificate, not the spread |

The artifact's Boom block carries `boom.ratios` (revenue, ebitda, ebitdaMargin, totalLeverage, interestCoverage) and
`boom.spread.lineItems` with `ltm` and `priorFy` per line (verified on `001SAMPLE0000BRWT`). It carries no DSCR and no FCCR, so
those two are a COMPOSITION from line items rather than a lookup, and the room must say so.

**A covenant review credit action** is the servicing action that closes an open test period: read the covenants in scope, take each
actual, compare to threshold, record the verdict and the observed figure on the compliance record, let the schedule roll. It is not
a credit decision. Where a test fails the review records the failure and raises the separate action (waiver, amendment, escalation).
It never approves anything.

## 3. This org, read live 2026-09-02

**`LLC_BI__Covenant2__c`** (label "Covenant Mgmt") is the covenant. Legacy `LLC_BI__Covenant__c` holds 0 records org wide and is
never queried.

- Threshold `LLC_BI__Financial_Indicator_Value__c`, duplicated on `Acnpex_Threshold_Value__c`.
- DIRECTION IS STORED: `Acnpex_Operator__c` ("Actual Must Be": `<`, `<=`, `=`, `>=`, `>`) and `Financial_Indicator_Operator__c`
  (Equals, Greater Than, Less Than, `Greater Tan or Equal To` [the org's own typo], Less Than or Equal To). Family
  `Acnpex_Category__c` (Financial Statement, Financial Ratio, Information). Formula in prose: `Calculation_Logic__c`.
- Schedule: `LLC_BI__Frequency__c` (Annually, Semi-Annually, Quarterly, Every 2 Months, Monthly, One-Off, Custom),
  `LLC_BI__Frequency_Template__c` (lookup to `LLC_BI__Date_Template__c`, 8 rows), `LLC_BI__Effective_Date__c`,
  `LLC_BI__Next_Evaluation_Date__c`, `LLC_BI__Grace_Days__c`, `LLC_BI__Compliance_Days_Prior__c` (7, 14, 30).
- Last evaluation value, status and date plus the `Breached__c` / `Overdue__c` flags: all six FORBIDDEN to us.
- No level flag. `LLC_BI__Loan_Covenant__c` is the loan junction, `LLC_BI__Account_Covenant__c` (label "Relationship Covenant") the
  relationship junction. The package view is the UNION of the two, deduped by covenant id.

**`LLC_BI__Covenant_Compliance2__c`** is the test result, one row per period, 144 rows org wide. Status picklist `Compliant,
Exception, In Progress, Pending, Waived`; `LLC_BI__Reason_for_Exception__c` is `Breached, Overdue`. Fields the review touches or
reads: `LLC_BI__Due_Date__c`, `LLC_BI__Original_Due_Date__c`, `LLC_BI__Proposed_Extension_Date__c`, `LLC_BI__Evaluation_Date__c`,
`LLC_BI__Evaluated_By__c`, `LLC_BI__Exception_Date__c`, `LLC_BI__Historic_Financial_Indicator__c` (the observed figure),
`cm_Covenant_Compliance_Indicator_Value__c` (text mirror), `Agentic_AI_Response__c` (our narrative), `LLC_BI__Evaluated_Rule__c`,
`LLC_BI__Automated_Testing_Status__c` (Pass, Fail, Incomplete) and `LLC_BI__Associated_Spread_Statement_Period__c`.

**The automated-testing path is NOT wired here:** `LLC_BI__Covenant_Rule__c` holds 3 rows (covenant, operator limited to `>=` /
`<=`, threshold, end date) and `LLC_BI__Spread_Statement_Period__c` holds 0, so nCino computes nothing in this org and whatever
computes a test has to be us, deterministically, from Boom actuals against the org's threshold and operator.

**Live status distribution (144 rows):** Exception reason Overdue 85, Exception no reason 20, Pending 31, Compliant 2, no status 6.
Only the 31 Pending rows are assessable without the `allowNonPending` opt-in. Doctrine 4.3 holds: `Exception` alone is
administrative, never a breach, and `LLC_BI__Reason_for_Exception__c` is the only separator.

## 4. The tool wire

`stage_covenant_review` (`StageCovenantReview.cls`), package-anchored bulk:

| Key | Type | Notes |
|---|---|---|
| `idempotencyKey` | string, required | must match at execute |
| `productPackageId` | string, required | the anchor; scope is loan junction UNION account junction, deduped |
| `rationale` | string, required | audit ledger |
| `covenantIds` | Id list, optional | member selection; omit and the whole package is surveyed |
| `assessments[]` | required, max 20 | `covenantId`, `status`, `observedValue` (Decimal), `reasonForException`, `narrative`, `comments` |
| `allowNonPending` | boolean, default false | records onto a non-Pending row knowing the schedule will not move |

`status` accepts only `Compliant`, `Waived`, `Exception`; `reasonForException` only `Breached` or `Overdue`, defaulted to `Breached`
on an Exception. The cap of 20 is a queueable budget, not style: 24 CDC triggers enqueue per record against a ceiling of 50. Per
covenant back (`covenants[]`): `covenantId`, `covenantName`, `covenantType`, `attachment` (loan / relationship / both),
`covenantComplianceId`, `currentComplianceStatus`, `assessedStatus`, `state`, `reason`, `generatesNextRow`, four step ids. `state`
is `planned`, `not_assessed`, `not_assessable_no_compliance_row`, `not_assessable_row_not_pending` or
`not_assessable_covenant_inactive`.

`execute_covenant_review` takes `idempotencyKey`, `stagingId`, `planHash`, `decisionToken`, `approverUserId`. It re-reads every row,
re-applies the Pending precondition, updates with `allOrNone false`, then MEASURES whether a successor compliance row appeared and
reports `approvalChainStarted` from that observation rather than asserting it. It writes `LLC_BI__Status__c`,
`Agentic_AI_Response__c`, `LLC_BI__Comments__c`, `LLC_BI__Historic_Financial_Indicator__c`,
`cm_Covenant_Compliance_Indicator_Value__c`, `LLC_BI__Evaluation_Date__c` (today), `LLC_BI__Evaluated_By__c` (running user), and on
an Exception also `LLC_BI__Reason_for_Exception__c` and `LLC_BI__Exception_Date__c`.

**What `C360WriteGuard` forbids.** Compliance rows are UPDATE only and absent from `CREATE_STATES`: a compliance CREATE fires
`acnpex_covenantApprovalProcess` (recordTriggerType Create, zero entry filters, named human assignee). Status may move only to
Compliant, Waived, Exception. Forbidden fields: `LLC_BI__Covenant__c` and `LLC_BI__Effective_Date__c` on the compliance row
(writing the effective date corrupts the schedule, vendor defect PDI-00023403); `Breached__c`, `Overdue__c`, `Is_Template__c` and
all three `Last_Evaluation_*` on the covenant. Covenant AMEND and DETACH are refused outright.

## 5. What the human owns, what the org computes, never invented

| Item | The human supplies | The org or tool computes | Never invented |
|---|---|---|---|
| Which covenants | the selection, from the scope the org resolved | scope (loan UNION relationship), the compliance row per covenant | a covenant out of scope; the tool refuses it by id |
| The verdict | Compliant, Waived or Exception | nothing; a selected covenant without a verdict blocks the stage | a verdict. Never default a covenant to Compliant |
| Breached vs Overdue | the answer, when the verdict is Exception | the plan defaults to Breached if blank | the distinction. Ask; never infer from whether a figure exists |
| The observed figure | confirmation | the test: threshold and operator from the covenant, actual from Boom, cushion from the two | the actual. If Boom cannot produce it, skip and say so |
| The narrative | the basis, one or two sentences | nothing | a basis. Optional means optional |
| Evaluation date, evaluator | nothing | `Date.today()` and `UserInfo.getUserId()` at execute | never asked, never shown as a question |
| Whether the schedule advances | nothing | the Pending precondition, re-applied against the re-read row | never asserted. Say "the schedule will not move" on a non-Pending row |
| Whether an approval fires | nothing | measured after the write by diffing sibling rows | never claimed. An async successor is not observable |

## 6. How the room computes a test

Deterministic, at the room, before the model narrates. Org data only. (1) Direction from the ORG, not from the covenant name:
`Acnpex_Operator__c` gives `>=` / `<=` directly, while `covenantDirection()` in `data/finance.ts` guesses from name hints and falls
back to magnitude. (2) Threshold from `LLC_BI__Financial_Indicator_Value__c`. (3) Actual: prefer a Boom figure composed from
`boom.spread.lineItems` per section 2, labelled "Boom-implied"; fall back to `LLC_BI__Last_Evaluation_Value__c` labelled "as nCino
last evaluated"; never blend them into one unattributed number. (4) Cushion by direction, watch band 10 percent, four states pass /
watch / breach / unknown, a missing actual or threshold being `unknown`. (5) Render through `classifyCovenant()` so the Exception
rule is not re-implemented anywhere.

The contract already carries the shape for step 3: `CovenantChallenge` with `status` of `corroborated` / `diverges` /
`not-computable`, `boomImplied` (value, formula, inputs, period), `threshold`, `nCinoActual`, `breachRiskFlag`, rendered by
`CovenantsTab` as an "Effective challenge" sub-row. No bundle in the repo populates it today. The model narrates the result; it
never produces the number.

## 7. Worked example: Hartwell Precision Manufacturing LLC

Account `001bb00001I7FPNAA3`. Package `a5Fbb000000IHFJEA4` ("Hartwell Industrial C&I Credit Package"). Six active covenants, all six
with a relationship junction, three also with a loan one.

| Covenant | Type | Operator | Threshold | Last actual | Cushion | Frequency | Next test | Loan junction |
|---|---|---|---|---|---|---|---|---|
| COV-000646 | Debt Service Coverage of Borrower | `>=` | 1.25x | 1.38x | 10.4 pct | Quarterly | 2026-09-30 | none |
| COV-000647 | Maximum Debt to Worth | `<=` | 3.00x | 2.42x | 19.3 pct | Quarterly | 2026-09-30 | none |
| COV-000648 | Minimum Liquidity | `>=` | $5.0MM | $6.8MM | 36.0 pct | Quarterly | 2026-09-30 | none |
| COV-000649 | DSC with and without Distributions (FCCR) | `>=` | 1.15x | 1.22x | 6.1 pct, WATCH | Quarterly | 2026-09-30 | Equipment $3MM |
| COV-000650 | Accounts Receivable (borrowing base) | `<=` | 80 pct | 80 pct | 0.0 pct, at the line | Monthly | 2026-07-31 | Line of Credit $15MM |
| COV-000651 | Term Covenants (Kokomo completion) | `=` | none | none | unknown | One-Off | 2026-11-01 | Construction $12MM |

`Calculation_Logic__c` is populated on five of the six in the bank's own words. COV-000649 reads: "FCCR = (EBITDA - Unfinanced
CapEx - Cash Taxes - Distributions) / (Scheduled Principal + Cash Interest + Operating Lease Expense)". That is the org's answer
to "how is this tested" and the room should quote it rather than reciting doctrine 4.2.

**Two facts stop the covenant route on this relationship today.** First, Hartwell has ZERO compliance rows: the COUNT over
`LLC_BI__Covenant_Compliance2__c WHERE LLC_BI__Covenant__r.LLC_BI__Account__r.Name LIKE 'Hartwell%'` returns 0 and the shipped
bundle agrees (`latestComplianceId: null` on all six), so every covenant resolves to `not_assessable_no_compliance_row` and the
stage throws "None of the N covenants assessed can be written". The 144 rows belong to Flowers For Dreams (38), ABC Manufacturing
(34), Ironclad (31), BlueSky (24), Cy LTD (10), EverPetal (7). Second, the bundle carries no `productPackageId`: `relContextFor()`
reads `bundle.snapshot.productPackageId` and the Hartwell snapshot has no such key, so the route blocks on `NO_PACKAGE_ANCHOR`
before it reaches the compliance problem.

Third: `LLC_BI__Frequency_Template__c` is NULL on all six, so `generatesNextRow` is false for every one and completing a row would
mint no successor and raise no covenant approval.

## 8. Findings and open questions

1. On a relationship with no compliance rows, should the room say so up front ("nCino holds no open test period on these
   covenants; there is nothing to close") rather than refusing per covenant after six questions? Refusing first is honest.
2. `productPackageId` is missing from the Hartwell snapshot in `artifact/live-data.json`. Assembler fix or regeneration.
3. The room's step `target` labels name fields the tool does not write: `LLC_BI__Observed_Value__c` (actual:
   `LLC_BI__Historic_Financial_Indicator__c`) and `LLC_BI__Narrative__c` (actual: `Agentic_AI_Response__c`) in `reviewFlows.ts`
   `covenantStep`. The wire is right; the "what this writes" peek is not.
4. The operator is org data and the bundle drops it. Carrying `Acnpex_Operator__c`, `Calculation_Logic__c` and
   `LLC_BI__Grace_Days__c` on the covenant contract lets the room state direction and formula rather than infer them.
5. `C360Covenants` header says 4 of Hartwell's 6 covenants carry no loan junction; the live read says 3 of 6 do carry one
   (COV-000649, 650, 651). Data moved, or the note was off by one. Not researched at all: extending a due date
   (`LLC_BI__Proposed_Extension_Date__c` is updateable, no tool writes it), and whether a waiver should also touch
   `Acnpex_Approval_Status__c` on the covenant. Both would be new arms.

Sources: [Equity Cure Rights In Middle-Market Deals, BHFS](https://www.bhfs.com/Templates/media/files/insights/Equity%20Cure%20Rights%20In%20Middle-Market%20Deals%20-%20A%20Primer.pdf) ·
[Deemed or doomed, Osborne Clarke](https://www.osborneclarke.com/insights/deemed-doomed-pitfalls-negotiating-deemed-cure-provisions) ·
[Financial Covenants in Private Credit, Sidley](https://www.sidley.com/en/insights/newsupdates/2026/03/financial-covenants-in-private-credit-transactions) ·
nCino KB kAHHu000000XZOTOA4, kAHHu000000XZRJOA4, kAHHu000000XZTaOAO, kAHPY00000055lR4AQ and PDI-00023403, quoted in the Apex.
