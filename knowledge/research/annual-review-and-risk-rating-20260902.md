# Annual review and risk rating: banking practice, this org, and the room

Research for the RELATIONSHIP room, `annual` and `rating` routes (plus `service` for completeness). 2026-09-02. Sources:
standard middle-market C&I practice plus the citations at the foot; this org read live over REST on 2026-09-02 (bankinggpt);
deployed Apex in `knowledge/sf-build-v2/wp2/classes/`; doctrine `brain/WORKROOM-BRAIN.md` 4.8, 5.2 to 5.5.

## 1. What an annual review actually is

The bank's periodic re-underwriting of a relationship it already holds. Nothing is being sold. The question is narrow: on today's facts, would we still do this deal, at this size, price, structure and grade.

| Section | What it carries |
|---|---|
| Exposure position | Committed and outstanding by facility, borrowing structure, guarantors, maturities inside twelve months |
| Financial update | Latest annuals plus most recent interim; three-year trend on revenue, EBITDA, leverage, coverage, liquidity, working-capital swing. The direction, not the level |
| Covenant compliance | Each covenant with test date, actual, threshold, cushion; each delivery obligation with whether it arrived. Breach, overdue, waived and amended are four different findings (`covenant-testing-20260902.md`) |
| Collateral position | Values, the dates of the valuations behind them, advance rates, lendable value against exposure, appraisal staleness (`collateral-valuation-20260902.md`) |
| Relationship profitability | Loans, deposits, treasury and fee income against capital held |
| Risk rating affirmation | Grade on file, grade the analysis supports, and if they differ, why |
| Renewal decision | Continue as is, continue amended, exit, or move to watch. Named, with a next review date and type |
| Action items | Who does what by when: refreshed appraisal, missing certificate, guarantor financials, covenant reset |

**Who signs.** RM drafts, credit analysis supports, a credit officer with the lending authority approves; above that
limit, or on anything moving to criticised, loan committee. Doctrine 4.8 is the rule this room lives by: RM proposes,
committee decides. The room drafts, never approves.

**What changes.** The review moves through its stages to complete, the grade of record is affirmed or changed, the next
review date is set, exceptions and action items open. That record is `LLC_BI__Review__c`, and the last two of those are
fenced from our tools (section 5).

## 2. How a bank rates commercial risk

A pass band of grades 1 through 5 or 6 (9-point and 10-point scales are both common; doctrine 4.8 pins ours at 1 to 9), then the regulatory categories:

| Band | Meaning |
|---|---|
| Pass 1 to 5/6 | Acceptable. Sub-labelled Pass, Pass/Watch at the weak end |
| Special Mention | Potential weaknesses deserving close attention which, uncorrected, could weaken the credit position. Criticised, not classified |
| Substandard | Inadequately protected. Distinct possibility of some loss if deficiencies are not corrected |
| Doubtful | Substandard's weaknesses plus collection in full is highly questionable and improbable |
| Loss | Uncollectible, not warranted as a bookable asset |

Special Mention through Loss are the interagency definitions the OCC examines against, and the line between Pass/Watch and Special Mention is the one that costs money: it changes reserve, reporting and examiner attention.

**Dual rating.** The **borrower rating** (obligor, probability of default) measures ability and willingness to repay. The
**facility rating** (loss given default) measures recovery if it does not, driven by collateral, lien position, guaranty and
structure. One borrower, one PD; six facilities, six LGDs. The OCC mandates no system but expects both dimensions addressed.

**What drives a grade.** Quantitative: DSCR or FCCR, leverage (debt to tangible net worth, funded debt to EBITDA),
liquidity and quick ratio, revenue and margin trend, global cash flow where guarantors matter. Qualitative: industry and
cycle position, management depth and tenure, ownership and succession, reporting quality, concentration, collateral quality.

**Override, and the triggers that force a look.** An override of the computed grade is a governed event: written reason,
reason code, approval above the proposer. Regulators read override rates as a model-performance signal, which is why every
rating system refuses an override with no comment. Downgrade triggers: breach not cured or waived; two consecutive quarters
of coverage below the covenant; an unplanned revolver draw that does not clean up; a going-concern or qualified opinion;
loss of a top customer; payment past due beyond 30 days; a borrowing base that stops supporting the commitment; bankruptcy
or judgment against a guarantor. A rating change is never silent (doctrine 4.8).

## 3. This org: two objects, four scales

The names are the trap. **`LLC_BI__Review__c`**, label **Review**, is the ANNUAL REVIEW; its record types (Account /
Package Review In Progress / Complete) are assigned by the Review After Save flow. **`LLC_BI__Annual_Review__c`**, label
**Risk Rating Review**, is the RATING; nothing here carries "Rating" in an API name, and it auto-numbers `RG-nnnnnnn`.
`LLC_BI__Loan_Risk_Review__c` and `LLC_BI__Relationship_Risk_Review__c` exist and hold ZERO records.

| Surface | Field | Type and range |
|---|---|---|
| Loan (facility) | `LLC_BI__Risk_Grade__c` | picklist 0 to 15 |
| Product Package | `LLC_BI__Risk_Rating__c` | picklist 1 to 10 |
| Review (annual) | `cm_Current_Relationship_Risk_Rating__c`, `cm_Recommend_Relationship_Rating__c` | picklist 1 to 12 |
| Risk Rating Review | `LLC_BI__Computed_/Overridden_/Final_Risk_Grade_Value__c` | unbounded number |
| Account | `LLC_BI__Highest_Risk_Grade__c` (text), `LLC_BI__Risk_Rating_Review_Grade__c` (number), `_Status__c`, `_Date_Decisioned__c` | write-back surface, all null on Hartwell |

Four live scales, none the same. Any panel naming a rating must say which surface it means.
**`LLC_BI__Final_Risk_Grade__c` is a formula.** The org's own field description: "set by the overidden risk grade if one
exists, and the calculated risk grade if it does not. It will be rounded if that field is enabled." The org does not score
here; it picks between the two numbers the tool wrote.

**The dual-rating fields exist and are empty.** `LLC_BI__Base_/Adjusted_/Final_Probability_of_Default_Grade__c` and
`_Score__c`, `Base_/Final_Loss_Given_Default_Grade__c` and `_Score__c`, `Quantitative_Score__c`, `Qualitative_Score__c`,
`Total_Score__c`: none is on any tool wire, none is populated on any record here. Read them, never claim them.

**The status defaults are the counter-intuitive part.** On Review, `LLC_BI__Status__c` and `LLC_BI__Review_Type__c`
default to NULL, so an omitted type files a review of no type. On Risk Rating Review, `LLC_BI__Status__c` defaults to
`Not Approved`, which reads as a decision nobody made. Both tools set status explicitly and `C360WriteGuard` allows one
create state each: `In Progress` for Review, `In Review` for the rating.

## 4. The tool wires, exactly as deployed

Nothing here is proposed. These are the `@InvocableVariable` names on the deployed Request classes. **`stage_annual_review`** (`StageAnnualReview.cls`) writes `LLC_BI__Review__c`:

| Wire input | nCino field |
|---|---|
| `idempotencyKey`, `rationale` (both required) | staging and ledger only |
| `accountId` (required) | `LLC_BI__Account__c` |
| `reviewType` (required: Annual, AdHoc, Problem Loan) | `LLC_BI__Review_Type__c` |
| `productPackageId` | `LLC_BI__Product_Package__c` |
| `narrative` | `LLC_BI__Narrative__c` |
| `relationshipSummary`, `strengthsNarrative`, `weaknessNarrative`, `recommendationNarrative`, `collateralAnalysisNarrative`, `financialAnalystNarrative`, `guarantorNarrative`, `riskRatingComments` | `cm_Relationship_Summary__c`, `cm_Strengths_Narrative__c`, `cm_Weakness_Narrative__c`, `cm_Recommendation_Narrative__c`, `cm_Collateral_Analysis_Narrative__c`, `cm_Financial_Analyst_Narrative__c`, `cm_Guarantor_Narrative__c`, `cm_Risk_Rating_Comments__c` |
| `editedNarrativeFields` | ledger only, never injected into the field text |

Fixed by the tool: `LLC_BI__Status__c = 'In Progress'`, `LLC_BI__Is_Agentic_Review__c = true`. Guard-forbidden:
`RecordTypeId`, `cm_Review_Stage__c`, `cm_Approved_Date__c`.
**`stage_risk_rating_review`** (`StageRiskRatingReview.cls`) writes `LLC_BI__Annual_Review__c`:

| Wire input | nCino field | Note |
|---|---|---|
| `idempotencyKey`, `rationale` | staging and ledger | required |
| `accountId` | `LLC_BI__Account__c` | required, the object's one nillable-false field |
| `loanId` | `LLC_BI__Loan__c` | optional, the facility-rating hook |
| `computedRiskGradeValue` | `LLC_BI__Computed_Risk_Grade_Value__c` | |
| `overriddenRiskGradeValue` | `LLC_BI__Overridden_Risk_Grade_Value__c` | above zero makes the comment mandatory |
| `comments` | `LLC_BI__Comments__c` | the field the `Mandatory_comment` rule's formula tests |
| `cashFlowCoverageActual` | `LLC_BI__Cash_Flow_Coverage_actual__c` | the bare `_Coverage__c` is a read-only weighted formula |
| `creditScoreActual` | `LLC_BI__Credit_Score_actual__c` | |
| `managementExperienceActual` | `LLC_BI__Management_Experience_actual__c` | |
| `revenueGrowthActual` | `LLC_BI__Revenue_Growth_actual__c` | percent field |

Fixed: `LLC_BI__Status__c = 'In Review'`. Guard-forbidden: `LLC_BI__Final_Risk_Grade__c` (formula), `RecordTypeId` and
`OwnerId` (neither exists on this object). **`stage_service_request`** (`StageServiceRequest.cls`) writes `Case`:
`accountId` to `AccountId`, `requestType` to `Subject`, `summary` plus `referenceKind` / `referenceId` /
`referenceWebLink` to `Description`; `Type`, `Origin` and `Status` come from the org's live picklists (`Service Request`,
`Agent`, `New`), never literals.

## 5. What the human owns, what the org computes, never invented

| Route | The human supplies | The org computes or fixes | Never invented |
|---|---|---|---|
| Annual review | review type (org picklist), the narrative sections in the banker's own words, the recommendation | status In Progress, the record type (Review After Save), the loan officer from the relationship owner, the review name | covenant verdicts, collateral values, profitability figures. Cite the read, or say the read is silent |
| Risk rating | the four factor actuals, the proposed grade, the override and its written reason | `Final_Risk_Grade` (overridden if present, else computed, rounded), the risk grade template, the loan write-back | a PD, an LGD, a quantitative or qualitative score (all empty here), or a regulatory classification the bank has not assigned |
| Service request | what the client asked for, in full | `Type`, `Origin`, `Status`, the case number | a turnaround promise or an owner |

Two fences to say out loud rather than route around. **The annual review's decision fields are on no wire**:
`cm_Current_Relationship_Risk_Rating__c`, `cm_Recommend_Relationship_Rating__c`, `cm_Are_you_requesting_a_grade_change__c`,
`cm_Have_the_covenants_been_tested__c`, `cm_Did_the_Covenants_pass_the_test__c`, `cm_New_Policy_Exception_added__c`,
`cm_Send_to_Credit_Committee__c`, `cm_Set_Next_Review_Type__c`, `cm_Set_Next_Review_Date__c`. They exist on the object; no
tool takes them, so the room states the affirmation in prose (`cm_Risk_Rating_Comments__c`) and hands the picklists to nCino.
**And Complete is never ours**: `cm_Review_Stage__c` and `cm_Approved_Date__c` are guard-forbidden, `Approved` and `Declined` belong to the org's `RiskRatingReviewDecisioned` path, and the plan ends in a handoff to Submit for Approval.

## 6. The room: what a banker types, what to ask

Openers: "annual review on Hartwell", "time for the yearly review", "review the relationship", "affirm the grade", "downgrade them to a 5", "override the grade to 6", "they asked for a payoff letter".

**Annual.** Ask the review type from the org picklist. Then offer, do not interrogate: the room already holds exposure,
covenants, collateral and exceptions from the read, so it drafts the relationship summary and the recommendation and lets
the banker amend them. Two or three questions maximum, free text always beating the chips.

**Rating.** Four factors, each optional and skippable, then the proposed grade, then the override and its reason. State
the grade on file beside the proposed grade every time. When the banker names Special Mention or Substandard, say plainly
that this org's scale is numeric and the classification is a label assigned elsewhere.

**Two live defects in `reviewFlows.ts`, both fixable inside the existing wires.** `annualStep` labels its prompts
`LLC_BI__Review__c.LLC_BI__Relationship_Summary__c` and `.LLC_BI__Recommendation__c`; neither field exists here, and the
real ones (`cm_Relationship_Summary__c`, `cm_Recommendation_Narrative__c`) are already what `buildStagePayload` sends.
Display only, but wrong on screen. And `OVERRIDE_NOT_FILEABLE` says the override input's wire name has never been observed
so the room will not guess one. It is not a guess: `StageRiskRatingReview.Request.overriddenRiskGradeValue` is deployed and
`StageExecuteRiskRatingReviewTest.overrideWithACommentIsAccepted` covers it. The room refuses a capability the tool already
takes; collecting it adds no org write arm.

## 7. Worked example: Hartwell Precision Manufacturing LLC

Account `001bb00001I7FPNAA3`, Manufacturing, revenue $85.0M, `LLC_BI__Highest_Risk_Grade__c` = "4". Package `a5Fbb000000IHFJEA4`. Six booked facilities, $46.0M committed, plus a seventh at Proposal:

| Facility | Commitment | Type | Facility grade | Maturity |
|---|---|---|---|---|
| Line of Credit | $15,000,000 | Non-Real Estate | 4 | 2027-03-15 |
| Construction | $12,000,000 | Real Estate | 5 | 2026-11-01 |
| Equipment | $8,000,000 | Non-Real Estate | 4 | 2030-09-20 |
| Purchase (CRE) | $5,000,000 | Real Estate | 4 | 2028-05-10 |
| Equipment | $3,500,000 | Non-Real Estate | 4 | 2030-02-18 |
| Line of Credit | $2,500,000 | Non-Real Estate | 5 | 2026-06-30 |
| Equipment (Proposal) | $3,000,000 | Real Estate | none yet | none yet |

That table IS the dual rating in this org today: one borrower at 4, facilities at 4 and 5. The two fives are the construction
facility (advance rate above the 70 percent policy line, exception `CRE-AR-01`) and the $2.5M line maturing 2026-06-30, already
past. Both are annual-review findings before anyone opens a spreadsheet.

**The rating on file** is `RG-0000004` (`a2bbb000001HzbBAAS`), created 2026-08-25, status `In Review`,
`Computed_Risk_Grade_Value` 4.0, `Final_Risk_Grade` 4.0, no override, no comment. Inputs: cash flow coverage 1.38, credit
score 740, management experience 24, revenue growth 4.2. Template `Default Account Template`, which carries exactly ONE
factor (Cash Flow Coverage) with zero factor-value bands configured, so the other three actuals are stored and not scored.
Say "recorded as inputs", never "the model weighed them". **The annual review on file** is `R-8` (`a5nbb00000mLYhNAAW`),
created 2026-08-25, Annual, `In Progress`, record type `Package Review In Progress` (flow-assigned, not ours),
`LLC_BI__Is_Agentic_Review__c` = true, every `cm_` decision field null.

**A worked line.** "Grade on file is 4. Coverage at 1.38x sits inside the 1.25x covenant with 10 percent cushion, which
is the watch band, and two facilities already carry a 5. The analysis supports affirming 4 with the construction facility
flagged. If you want a 5, I will record it as an override with your reason, and nCino decides."

## 8. Open questions

1. The annual review's decision picklists have no wire. Wire addition later, or prose plus permanent handoff?
2. `Account.LLC_BI__Highest_Risk_Grade__c` reads "4" while two facilities carry 5. Stale, or does "highest" mean best quality? Assert neither until settled.
3. `StageRiskRatingReview` warns that field has a two-character maximum; the live describe reports `string(255)`. Harmless (never written) but the comment is wrong.
4. The Default Account Template has one factor and no bands. Should the room name the template it is scoring against, given the org assigns it and the tool cannot?
5. `loanId` on the rating wire is unused by the room. Does a facility-level rating belong on this route, or only in the facility workroom?
6. Doctrine 4.8 says 1 to 9. The org offers 1 to 12 on the Review and 0 to 15 on the Loan. Which scale does the room speak?

Sources: [OCC, Rating Credit Risk](https://www.occ.treas.gov/publications-and-resources/publications/comptrollers-handbook/files/rating-credit-risk/pub-ch-rating-credit-risk.pdf) · [Interagency Proposal on the Classification of Commercial Credit Exposures](https://www.federalregister.gov/documents/2005/03/28/05-5982/interagency-proposal-on-the-classification-of-commercial-credit-exposures) · [NCUA Examiner's Guide, Credit Risk Rating Systems](https://publishedguides.ncua.gov/examiner/content/examinersguide/loans/commercial&mbl/CreditRiskRatingSystems.htm) · [Abrigo, single vs dual rating systems](https://www.abrigo.com/blog/evaluating-single-vs-dual-rating-systems/)
