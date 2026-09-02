# Relationship room v2: the like-for-like treatment

Proposed addendum, written 2026-09-02 against `main @ 4bcb809` (2996 tests green). Nothing here is
built. It is the design the founder asked for after driving the account side: "the account side is
incredibly underwhelming; apply the same, the full shebang with full relationship context so it
knows what to do ... like for like with the facility workroom".

**Sources.** `knowledge/research/covenant-testing-20260902.md`,
`knowledge/research/collateral-valuation-20260902.md`,
`knowledge/research/annual-review-and-risk-rating-20260902.md`,
`knowledge/research/relationship-room-audit-20260902.md`, plus the facility room's own specs:
`design/SAMPLE-CHANNEL-SPEC-20260901.md`, `design/CREATE-GRAMMAR-SPEC-20260901.md`,
`design/proposals/greeting-v2-addendum.md`, `design/proposals/wire-arms-addendum.md`,
`design/proposals/session-build-addendum.md`.

**The fences, restated, because they decide the shape of everything below.**

- `app/src/workroom/**` is BYTE-UNTOUCHABLE, tree `91c751e427232bf2b62c14b9cf92921e497496c9`,
  attested per commit.
- `app/src/components/workroom/**` and `app/src/channel/**` are the FACILITY room's surfaces. The
  facility workroom is the founder's demo tomorrow evening and its behaviour must not move. Section
  4 names every shared file this work touches and the gate on each.
- `transitionAllowlist.ts` untouched. No Apex change. No `C360WriteGuard` change.
- **NO NEW ORG WRITE ARM.** Every question invented below maps onto a wire one of the five deployed
  `stage_*` tools already takes. Where a banker asks for something no wire carries, the room says so
  by name and records the gap.
- No em dashes, anywhere, in this file or in any copy it proposes.

---

## 0. What "like for like" actually means

The facility room learned five things in the last two weeks. This is those five, applied to a room
whose subject is a relationship rather than a change set.

| The facility room's rule | Where it came from | What it becomes here |
| --- | --- | --- |
| Consent rides the greeting | SAMPLE-CHANNEL spec, session-build 2 | One `narration.open` at room open, gated on the lookup and the mail gate. Today this room never calls it, so the platform dialog lands mid-review. |
| The parser stages, the model speaks | SAMPLE-CHANNEL spec | Already half true here (the narration effect exists), but no greeting act is ever emitted, so the room's most interesting moment is silent. |
| Only ask for what the human owns | CREATE-GRAMMAR spec | The three research docs are exactly this table, per route. It is the spine of section 2. |
| The chips come from the org | wire-arms R40 | `covenantType` and `collateralType` from `CATALOG`. **Not** `Case.Type` and `Case.Origin`: neither is on a wire, and offering them would repeat the `origin` defect rather than close it. |
| The room reads the plan AND the book | CREATE-GRAMMAR spec | A `relBook` mirror: reviews already filed, verdicts already on the compliance row, the last valuation basis and date per asset, the rating on file. It removes questions; it never removes a decision. |

And one rule this room needs that the facility room did not: **refuse first, in banker language,
before asking six questions.** Hartwell carries zero covenant compliance rows. Today the room asks
which covenants, then a verdict each, then a figure each, then a narrative, and only then does the
org refuse all six. That is the single worst moment in the room and section 2.1 closes it.

---

## 1. THE GREETING

### 1.1 The shape

Identical mechanics to the facility room's greeting v2: the room composes a deterministic sentence,
the model writes the remark under it, **the room writes every figure**, and the remark carries at
most three entity line items with a right-hand rail. The two cannot disagree about a number because
they are not the same source.

Deterministic sentence, unchanged from `briefFor`:

> Relationship Actions on Hartwell Precision Manufacturing LLC. Which review are we running on this
> relationship?

The model's remark under it: a lead line, up to three rows, a closing line. `greeting` act budget
about 90 words, `NARRATION_MAX_BULLETS` of 3, all existing constants, none moved.

### 1.2 Route-neutral until one of the five is chosen

`relBrain.ts` already sets `routeOpen` and `routeOptions`, and the `route-open` doctrine block
already exists. It is written for the facility room's three routes ("never say which facility moves,
never say what changes follow, never say what renews"). It needs a relationship arm: while unbound,
the remark may not write as an annual review, a covenant review, a valuation, a rating or a service
request. Five questions, none of them asked yet. See section 3.4.

### 1.3 The line items

Candidate rows, and the deterministic rank that picks the three. The rank runs at the room, before
the model is handed anything, and the model may only write about what it was given.

| Rank | Row | Rail, resolved by the room |
| --- | --- | --- |
| 1 | a covenant test overdue | `1.38x vs >= 1.25x`, plus the days past |
| 2 | a covenant inside the 10 percent watch band | the same pair |
| 3 | an asset past its next revaluation date | `$12.0MM, valued 30 Jun` |
| 4 | the risk grade with its last review | `grade 4, RG-0000004 In Review` |
| 5 | a review already on file | `R-8, Annual, In Progress` |
| 6 | anything staged this session (the plan) | the entry's own `after` |
| 7 | the widest cushion, when nothing above fires | the pair |

**The covenant book with cushion and next test dates.** The rail states the actual, the org's own
operator and the threshold, in the room's own glyphs, exactly as greeting v2 renders them today.
Direction comes from `Acnpex_Operator__c` where the read carries it, and from `covenantDirection()`
where it does not, and the two are not the same claim: see the open question in 1.7.

**The collateral with valuation dates and lendable values.** The rail states the value and the date
the valuation was struck. **The lendable value it names is the PLEDGE figure, never the asset
formula.** On Hartwell inventory the asset says $6,400,000 at the 80 percent type rate and the
pledge says $4,000,000 at the 50 percent policy rate. The credit figure is the pledge figure. A
greeting that printed $6.4MM would be printing a number the bank does not lend against.

**The risk grade and the last review.** Names its surface every time. Four scales are live in this
org (Loan 0 to 15, Package 1 to 10, Review 1 to 12, Risk Rating Review unbounded) and doctrine 4.8
says 1 to 9. A grade with no surface named is not a grade, it is a rumour.

**The plan.** What this session has staged, read back from `collected`, exactly as the facility
room's greeting reads its manifest.

**The client's mail.** `useClientMail` in `RelationshipRoomHost`, `mail` on `buildRelEnvelope`,
`buildReadBlocks(src, true)`. Same single `outlook_email_search`, same `MAIL_GATE_MS` of 1200, same
late-mail second remark through `askSession` rather than `primeConsent`. The mail is never a source
for a figure and a person is never inferred from a company name. Both rules already exist in the
`mail` doctrine block and travel unchanged.

### 1.4 The closing line

It offers the five routes, or the one the mail or the book points at. `relOpeningFor` already ranks
three signals. Two are added.

| Tier | Signal | Route the yes-chip binds |
| --- | --- | --- |
| 1 | a covenant in financial breach (the shared classifier, never a bare Exception) | rating |
| 2 | a covenant test overdue | covenant |
| 3 | a covenant test due inside `COVENANT_DUE_DAYS` (45) | covenant |
| 4 | **new**, an asset past `LLC_BI__Next_Revaluation_Due_Date__c` | valuation |
| 5 | **new**, the mail names a route through `readRelRouteIntent` | that route |
| null | nothing above | the neutral five-way question, five chips |

**Tier 4 is conditional on a read-side change and does not ship without it.** `relRoute.ts` says
today, correctly, that it raises no valuation-staleness signal "because `Collateral` carries no
valuation date". That absence is honest and must survive until the read carries the date.
`Customer360Exposure` returns `collateralId`, `collateralName`, `collateralDescription`,
`amountPledged` and `advanceRateSource` and no dates at all. Surfacing `LLC_BI__Valuation_Date__c`,
`LLC_BI__Next_Revaluation_Due_Date__c` and `LLC_BI__Appraisal_Date__c` is a **read-side change on an
existing tool, not a new write arm**, and it is the single highest-value read addition for this room:
it is what makes "A/R and inventory are 33 days past their revaluation date" sayable at all. Founder
call. Without it, tier 4 is absent and the greeting says nothing about valuation staleness.

**Tier 5 never outranks a governance signal.** A breach beats a client email. The mail's route is
offered in the closing line, exactly as greeting v2 does it, never as a sixth chip.

### 1.5 The honesty gate: the covenant route on a relationship with no compliance rows

Before the covenant chip is offered as a yes, the room checks the book: if every covenant reads
`latestComplianceId: null`, the covenant route can only end in a refusal, and the greeting says so
instead of offering it.

> nCino holds no open test period on any of the six covenants on this relationship, so there is
> nothing for a covenant review to close. The tests and their thresholds are on the book and I can
> read them out; recording an assessment needs a compliance row that nCino has not raised.

The chip stays on the glass, disabled, with that reason. That is the registry's own discipline
(A27.3): hiding a route takes the map away from the banker.

### 1.6 Consent

`RelationshipRoom.tsx` holds an `openingIdRef` and calls
`narration.open(id, { act: "greeting", sentence: greeting + (ask ? ask.line : position) })` once
the lookup and the mail gate have both landed, guarded by a `greeted` ref exactly as
`Workroom.tsx:1602` does. `primeConsent` is memoised per view, so a re-render, a strict-mode double
effect or a re-opened room make no second call.

Decline copy, unchanged and shared:

> Working from the file only. The desk is not connected, so I will answer from what is here and
> stage what the engines can read.

### 1.7 Copy variants

**(a) No mail, route unbound, the book is clean.**

> Hartwell's $46M relationship runs six facilities and six covenants, nothing staged yet.
> - **Debt Service Coverage of Borrower**: the tightest ratio on the deal, and it is inside the watch band. `1.38x vs >= 1.25x`
> - **Eligible A/R**: valued at the end of June on a monthly cycle. `$12.0MM, valued 30 Jun`
> - **Risk grade**: on file at 4, with the rating review still open. `grade 4, RG-0000004 In Review`
>
> Annual review, covenants, collateral, the rating, or a service request?

**(b) The covenant book cannot be reviewed.**

> Hartwell's $46M relationship is clean on the tests it carries, and nCino holds no open test period
> on any of them.
> - **Accounts Receivable**: tested monthly, and sitting exactly on its ceiling. `80% vs >= 80%`
> - **Eligible A/R**: 33 days past its revaluation date. `$12.0MM, due 31 Jul`
>
> There is nothing for a covenant review to close today. The collateral is the one that is late.

**(c) The mail asks for a document, no credit action.**

> Hartwell's $46M relationship sits clean; one client message is open and it asks nothing of the
> credit.
> - **Eligible A/R**: 33 days past its revaluation date, on a monthly cycle. `$12.0MM, due 31 Jul`
> - **Risk grade**: on file at 4, and two facilities already carry a 5. `grade 4`
>
> James asked on Aug 28 for a copy of the June covenant certificate. Raise it as a service request,
> or run one of the reviews?

**(d) A financial breach.**

> Hartwell's $46M relationship carries one test in breach, and the grade on file has not moved.
> - **Debt Service Coverage of Borrower**: failed on the last reading. `1.11x vs >= 1.25x`
> - **Risk grade**: on file at 4, opened 25 Aug and still In Review. `grade 4, RG-0000004`
>
> A breach is a downgrade trigger. Open the risk-rating review?

**(e) An annual review is already open.**

> Hartwell's $46M relationship already carries an annual review, opened 25 Aug and still In Progress.
> - **R-8**: Annual, In Progress, and every decision field on it is still blank. `R-8, In Progress`
> - **Debt Service Coverage of Borrower**: the test that review has to speak to. `1.38x vs >= 1.25x`
>
> I can file a second review, and I would rather not do that silently. Which review are we running?

**Open question carried into the build, not decided here.** `covenantDirection()` in
`data/finance.ts` infers direction from covenant-type name hints and falls back to magnitude, while
the org stores the answer in `Acnpex_Operator__c` ("Actual Must Be": `<`, `<=`, `=`, `>=`, `>`) and
states the formula in `Calculation_Logic__c`. The bundle drops both. Carrying them on the `Covenant`
contract is a read-side change that would let the greeting say the direction and quote the bank's
own formula rather than infer them. Until it lands, the rail and the card agree with each other
because they both use `covenantDirection()`, which is what greeting v2 already pinned; they may both
be wrong about an advance-rate covenant, and that is a known, named, single defect rather than two
surfaces disagreeing.

---

## 2. PER ROUTE

Each route below states: what the banker types, the elicitation (only what the human owns), what the
org computes and is never asked, the refusals by name, the card shape, the confirm sentence, the
wire with field names, and the worked Hartwell example.

### 2.1 Covenant review

**What the banker types.** "covenant review", "test the covenants", "close out the quarter", "the
DSCR is fine but the FCCR failed", "waive the liquidity test this period", "the certificate never
came".

**Before any question: the book speaks.** The room states, in banker language, what the covenant
book can and cannot support this period. Three states, and the room says which it is in before it
asks anything:

1. every covenant has an open compliance row at Pending: the review runs normally;
2. some rows are open and not Pending: those covenants are offerable only behind the
   `allowNonPending` opt-in, and the room says the schedule will not move;
3. no covenant has a compliance row at all: the honest refusal of 1.5, and no questions.

**The elicitation, only what the human owns.**

| Step | Question | Kind | Notes |
| --- | --- | --- | --- |
| `covenants` | Which covenants are we assessing? | multi | Options are the package scope the org resolved, each with its verdict from `classifyCovenant()` and the state of its row. A covenant with no row is shown and disabled with its reason. |
| `covenantStatuses.<id>` | How does the `<name>` test assess? | chips | Compliant, Waived, Exception. **No default, ever.** A selected covenant with no verdict blocks the stage. |
| `covenantObservedValues.<id>` | The room PROPOSES the figure and asks for confirmation. | number | "Boom's spread implies 1.38x on the LTM. File that, or give me the certificate's own figure." Optional; skip files no figure. |
| `covenantReasons.<id>` | Is the `<name>` exception a failed test or an undelivered document? | chips | Breached, Overdue. Only on an Exception. **Never inferred.** This is the only thing separating a failed test from a late certificate. |
| `allowNonPending` | **new.** This row is at `<status>`, not Pending. Record the assessment anyway? | chips | Offered only where a chosen covenant's `latestComplianceStatus` is not Pending. The chip's own sub-line says the schedule does not advance. |
| `assessmentNarrative` | State the basis for these assessments. | text | Optional, one or two sentences. |

**What the org computes and the room never asks.** The covenant scope (package to loans to
`LLC_BI__Loan_Covenant__c` UNION package to borrower accounts to `LLC_BI__Account_Covenant__c`,
deduped, templates excluded); which compliance row the review acts on (the open row with the
earliest due date, else the most recent); the threshold `LLC_BI__Financial_Indicator_Value__c` and
the operator; the cushion and its four states with the 10 percent watch band; the Pending
precondition, applied at stage and re-applied at execute against the re-read row; `generatesNextRow`
(Active plus Frequency Template plus Effective Date); `LLC_BI__Evaluation_Date__c` and
`LLC_BI__Evaluated_By__c`, set at execute; and `approvalChainStarted`, which is MEASURED after the
write by diffing sibling rows and never asserted.

**The refusals, by name.**

| Name | The sentence |
| --- | --- |
| `NO_COMPLIANCE_ROW` (new, pre-question) | "nCino holds no open test period on these covenants, so there is nothing to close. I can read the tests and their thresholds out; recording an assessment needs a row the org has not raised." |
| `NO_PACKAGE_ANCHOR` (existing) | "This review is anchored on the product package and the read stages none for this relationship, so there is nothing to stage against." |
| `not_assessable_row_not_pending` | "That row sits at In Progress. I can record the assessment on it, and the schedule will not advance and no successor row is minted." |
| `not_assessable_covenant_inactive` | The org's own sentence, verbatim, plus which entry it is about (R39). |
| every-covenant-needs-a-verdict | "Every covenant on the list needs a verdict before the plan can be staged." (existing, unchanged) |
| the 20 cap | "The tool assesses at most 20 covenants in one plan. That is a governor budget, not a preference." |
| `CREATE_GAPS.covenant` | Unchanged. A standalone covenant on the Account is composed and not filed, with the org-side gap named. |
| AMEND and DETACH | "A covenant is never amended or detached from here: every junction field is non-updateable and a detach would be a delete." |
| `FACILITY_HANDOFF` | Unchanged. |

**The card.**

```
COVENANT REVIEW                       Hartwell Industrial C&I Credit Package
Debt Service Coverage of Borrower     Compliant     1.38x vs >= 1.25x
Maximum Debt to Worth                 Compliant     2.42x vs <= 3.00x
DSC with and without Distributions    Exception     1.09x vs >= 1.15x, Breached
Accounts Receivable                   Exception     certificate not delivered, Overdue
4 assessments on 4 compliance rows. 3 rows at Pending advance the schedule; 1 does not.
```

**The confirm sentence.**

> Four assessments file onto four compliance rows: two Compliant, one Breached and one Overdue. The
> covenant records themselves are not touched, and their thresholds, frequencies and schedules stay
> exactly as the borrower holds them. Three of the four rows sit at Pending, so those three advance
> the schedule; the fourth records and does not. Whether nCino starts an approval is measured after
> the write, not claimed here.

**The wire.** `stage_covenant_review`, unchanged shape, one key added.

```
idempotencyKey     required
productPackageId   required, the anchor
rationale          required, composed by stageRationale from what the banker typed
covenantIds        the selection
assessments[]      max 20, each: covenantId, status, observedValue (Decimal),
                   reasonForException, narrative, comments
allowNonPending    NEW ON THIS ROUTE. Already on the tool, never offered by the room.
```

`status` accepts only Compliant, Waived, Exception. `reasonForException` accepts only Breached or
Overdue and defaults to Breached on an Exception. Execute takes `idempotencyKey`, `stagingId`,
`planHash`, `decisionToken`, `approverUserId` and writes `LLC_BI__Status__c`,
`Agentic_AI_Response__c`, `LLC_BI__Comments__c`, `LLC_BI__Historic_Financial_Indicator__c`,
`cm_Covenant_Compliance_Indicator_Value__c`, `LLC_BI__Evaluation_Date__c`,
`LLC_BI__Evaluated_By__c`, plus `LLC_BI__Reason_for_Exception__c` and `LLC_BI__Exception_Date__c` on
an Exception.

**Two step-label corrections, display only, and both wrong on the founder's screen today.**
`covenantStep` peeks `LLC_BI__Observed_Value__c` and `LLC_BI__Narrative__c`. The tool writes
`LLC_BI__Historic_Financial_Indicator__c` and `Agentic_AI_Response__c`. The wire is right; the
"what this writes" peek is not.

**Hartwell, worked.** Account `001bb00001I7FPNAA3`, package `a5Fbb000000IHFJEA4`. Six active
covenants, all six carrying a relationship junction and three also a loan junction:

| Covenant | Operator | Threshold | Last actual | Cushion | Frequency | Next test |
| --- | --- | --- | --- | --- | --- | --- |
| COV-000646 Debt Service Coverage of Borrower | `>=` | 1.25x | 1.38x | 10.4 pct | Quarterly | 2026-09-30 |
| COV-000647 Maximum Debt to Worth | `<=` | 3.00x | 2.42x | 19.3 pct | Quarterly | 2026-09-30 |
| COV-000648 Minimum Liquidity | `>=` | $5.0MM | $6.8MM | 36.0 pct | Quarterly | 2026-09-30 |
| COV-000649 DSC with and without Distributions | `>=` | 1.15x | 1.22x | 6.1 pct, WATCH | Quarterly | 2026-09-30 |
| COV-000650 Accounts Receivable | `<=` | 80 pct | 80 pct | 0.0 pct, at the line | Monthly | 2026-07-31 |
| COV-000651 Term Covenants (Kokomo) | `=` | none | none | unknown | One-Off | 2026-11-01 |

`Calculation_Logic__c` is populated on five of the six in the bank's own words. COV-000649 reads
"FCCR = (EBITDA - Unfinanced CapEx - Cash Taxes - Distributions) / (Scheduled Principal + Cash
Interest + Operating Lease Expense)". The room quotes that rather than reciting doctrine 4.2.

**And on this relationship today the route refuses twice over.** All six read
`latestComplianceId: null`, so every covenant resolves to `not_assessable_no_compliance_row` and
`StageCovenantReview` throws "None of the N covenants assessed can be written". Separately, the
Hartwell snapshot in `artifact/live-data.json` carries no `productPackageId`, so `relContextFor()`
blocks on `NO_PACKAGE_ANCHOR` before it ever reaches the compliance problem. The package id exists
in the org (`a5Fbb000000IHFJEA4`). **Two founder decisions, both before the demo:** regenerate or
patch the bundle so the anchor is present, and decide whether the covenant route is demonstrated at
all on Hartwell (the 144 compliance rows in this org belong to Flowers For Dreams, ABC
Manufacturing, Ironclad, BlueSky, Cy LTD and EverPetal). Also: all six carry a null
`LLC_BI__Frequency_Template__c`, so `generatesNextRow` is false for every one and completing a row
would mint no successor and raise no approval. The room must say that, not assume the schedule
rolls.

### 2.2 Collateral valuation

**What the banker types.** "revalue the collateral", "new appraisal on the equipment", "the A/R
aging came in", "Hilco updated the equipment number", "the field exam is back".

**The room opens on the staleness fact, not a blank question.** "A/R and inventory were last valued
30 June on a monthly cycle, due 31 July. Both are 33 days past. Refreshing those two, or something
else?" (Conditional on the read-side date change in 1.4.)

**The elicitation, only what the human owns.**

| Step | Question | Kind | Notes |
| --- | --- | --- | --- |
| `records` | Which collateral are we valuing? | multi | The assets pledged against active facilities, deduped by collateral id. Cap 20. Each option shows type, current value and, where the read carries it, the last valuation date and basis. |
| `recordValues.<id>` | What value are we filing for `<asset>`? | number | One figure per asset. This is the only per-asset answer. |
| `valuationDate` | As of what date was the valuation struck? | date | Shared across the exercise. Tool-required, not org-required: nCino orders latest-wins on it. |
| `type` | On what basis was it struck? | chips | The org's 16 values. The room orders the ones this deal already uses first. |
| `source` | And where did the figure come from? | chips | The org's 14 values, with the two mappings said out loud (see refusals). |
| `primary` | **new.** Does this become the primary valuation on the asset? | chips | Yes / No. The tool takes it; the room hardcodes `false` today. |
| `description` | **new.** Name the appraiser or the exam, for the record. | text | Optional, one line. The tool takes it; the room sends `null` today. |

**What the org computes and the room never asks.** `Collateral.LLC_BI__Advance_Rate__c` (formula
over the collateral TYPE); `Collateral.LLC_BI__Lendable_Value__c` (formula, ignores the pledge
override); `Pledge.LLC_BI__Advance_Rate__c` (override, then auto-applied, then type rate);
`Pledge.LLC_BI__Current_Lendable_Value__c` (org-populated, honours the override); `Loans_To_Value`,
`Remaining_Lendable_Value`, `Combined_Percent_Pledged`, `Total_Pledge_Amount`, `Total_Lien_Amount`;
the pledge rollups; the `CV-` autonumber; the per-facility coverage ratio and shortfall flag from
`Customer360Exposure`; and whether the parent collateral value moves after the insert, which it does
not headlessly. `Active = true` and `Original_Value = false` are set by the tool and never asked: a
revaluation is by definition active and not the original.

**The refusals, by name.**

| Name | The sentence |
| --- | --- |
| duplicate in batch | "That asset is already on this valuation. One figure per asset per exercise." |
| same collateral and date already on file | "There is already a valuation on `<asset>` dated `<date>` (PDI-00020349). Change the date or the asset." |
| negative value | "A valuation cannot be negative." |
| a picklist value the org does not offer | The org's own refusal, with the legal list lifted out and re-offered as chips. |
| collateral outside the package | "That asset reaches this package through neither a pledge to one of its loans nor the ownership junction to its borrower." |
| the 20 cap | "The tool caps a valuation batch at 20 assets." (existing) |
| lendable value | "The lendable value is the org's arithmetic, not mine. I file the figure and its basis; nCino computes what the bank can lend against it." |
| no BOV, no field exam | "This org's source list carries no Broker Opinion of Value and no Field Exam. A BOV files as Third Party Source and a field exam as Internal Valuation or Inventory Report. Say which and I will use it." |
| the rollup | "The valuation is filed and the collateral value did not move. That roll-up is bound to nCino's own Add Valuation button and does not fire headlessly, so no coverage improvement is claimed." (existing `dossierHandoff`) |
| `CREATE_GAPS.collateral` | Unchanged. |

**The card.**

```
COLLATERAL VALUATION                  Hartwell Industrial C&I Credit Package
Eligible A/R                          $11,400,000    as of 2026-08-31
Inventory, Fort Wayne                 $7,600,000     as of 2026-08-31
Basis   Net Orderly Liquidation Value        Source   Receivables Aging
Primary valuation   yes                      Note     Q3 field exam, Hilco
2 valuations on 2 assets. The collateral values themselves do not move.
```

**The confirm sentence.**

> Two valuations file against Eligible A/R and the Fort Wayne inventory, both as of 31 August, on a
> Net Orderly Liquidation Value basis from the field exam. Each becomes the primary valuation on its
> asset. The collateral records themselves are not touched: nCino binds that roll-up to its own Add
> Valuation button, so the values on file stay where they are and no coverage improvement is claimed
> here.

**The wire.** `stage_collateral_valuation`, unchanged shape, two keys the room stops hardcoding.

```
idempotencyKey     required=true on the invocable
rationale          required=true on the invocable
productPackageId   Apex-required deal anchor
items[<=20]        collateralId, value, valuationDate, type, source,
                   description   NEW ON THIS ROUTE (hardcoded null today)
                   primary       NEW ON THIS ROUTE (hardcoded false today)
```

Execute writes exactly nine fields on `LLC_BI__Collateral_Valuation__c`: Collateral, Value,
Valuation_Date, Type, Source, Valuation_Description, Primary, Active (true), Original_Value (false).
Then it verifies and re-reads the parent for the roll-up answer.

**Hartwell, worked.** Four assets, owned through `LLC_BI__Account_Collateral__c` (AC-00012 to
AC-00015), pledged across seven `LLC_BI__Loan_Collateral2__c` rows (LC-00011 to LC-00017).

| Asset | Type (rate) | Value | Asset lendable | Pledge rate | Latest valuation | Basis / source | Next due |
| --- | --- | --- | --- | --- | --- | --- | --- |
| COL-000762 Eligible A/R | UCC-Accounts (80) | 12,000,000 | 9,600,000 | 80 | CV-0000000007, 2026-06-30 | Balance Sheet / Receivables Aging | 2026-07-31 |
| COL-000763 Inventory | UCC-Inventory (80) | 8,000,000 | 6,400,000 | 50 override | CV-0000000009, 2026-06-30 | Book Value / Inventory Report | 2026-07-31 |
| COL-000764 Equipment | UCC-Equipment (80) | 10,000,000 | 8,000,000 | 75 override | CV-0000000011, 2026-04-30 | Orderly Liquidation Value / Appraisal | 2027-04-30 |
| COL-000765 Real estate | Real Estate-Warehouse (80) | 14,000,000 | 11,200,000 | 75 override | CV-0000000013, 2026-02-28 | Fair Market Value - Real Estate / Appraisal | 2027-02-28 |

Three beats the room can speak to, and they are the demo:

1. **Two are overdue.** A/R and inventory are monthly with a next revaluation due date of
   2026-07-31, which as of 2026-09-02 is 33 days past. The org's own field, not a guess.
2. **The equipment number fell and that is not an impairment.** CV-0000000010 read 11,500,000 on
   2024-08-15 on a Fair Market Value - Equipment basis; CV-0000000011 reads 10,000,000 on 2026-04-30
   on an Orderly Liquidation Value basis. Different basis, not a 1.5m decline, and the override
   reason on LC-00014 says exactly that in the bank's own words. **This is the single best line in
   the relationship room** and the room must be able to say it.
3. **The two lendable values disagree, correctly.** Inventory: the asset formula says 6,400,000 at
   the 80 percent type rate, the pledge says 4,000,000 at the 50 percent policy rate. The credit
   figure is the pledge figure. Liens L-00033 to L-00036 are all 1st, active, internal, and every
   one carries `Is_Excluded = true`, so they sit outside availability math. The room stays off
   availability language rather than quietly treating them as included.

Prior-value history exists for all four (CV-...006, 008, 010, 012), each `Original_Value = true`,
`Active = false`. A new valuation joins the ladder; it replaces nothing.

**Doctrine correction.** `brain/WORKROOM-BRAIN.md` 2.6 and the `StageCollateralValuation` class
header both state this org has zero prior valuation rows. It has eight on the Hartwell assets. That
text is stale and should be corrected in the same pass as section 3.

### 2.3 Annual review

**What the banker types.** "annual review on Hartwell", "time for the yearly review", "review the
relationship", "re-underwrite them", "problem loan review".

**The book speaks first.** `R-8` is already on file, Annual, In Progress, agentic, opened 25 Aug,
with every `cm_` decision field null. The room names it before it asks anything, because the tool
CREATES and there is no update arm: a second review is a second record, not an edit.

> This relationship already carries R-8, an Annual review at In Progress opened 25 Aug, with nothing
> written on it yet. Filing from here files a second review; there is no deployed path that edits
> the one on file. Go ahead, or is this a different review?

**The elicitation. Offer, do not interrogate.** The room holds exposure, covenants, collateral and
exceptions from the read, so it DRAFTS and the banker amends. Two or three questions is the target,
never eight.

| Step | Question | Kind | Notes |
| --- | --- | --- | --- |
| `reviewType` | Which review is this? | chips | Annual, AdHoc, Problem Loan, from the org's picklist. Nothing defaults it, and an omitted type files a review of no type. |
| `relationshipSummary` | The room drafts it and asks for the amendment. | text | "Here is the position as I read it. Amend it, or take it as it stands." Optional. |
| `recommendation` | The room drafts it and asks for the amendment. | text | Optional. |
| `sections` | **new.** Anything else for the file? | multi chips | Strengths, Weaknesses, Collateral analysis, Guarantors, Rating comments, Financial analysis. Default is none. Each chip picked opens ONE text step. This is how five more wires reach the banker without five sequential questions. |

**What the org computes and the room never asks.** `LLC_BI__Status__c` fixed to In Progress and
`LLC_BI__Is_Agentic_Review__c` to true by the tool; the record type, assigned by the Review After
Save flow (Account or Package, In Progress or Complete); the loan officer, populated from the
relationship owner by the same flow; the review name `R-n`.

**The refusals, by name.**

| Name | The sentence |
| --- | --- |
| `DECISIONS_NOT_ON_THE_WIRE` (new) | "The review's own decision fields are not on this tool: the current and recommended relationship ratings, whether a grade change is requested, whether the covenants were tested and passed, a new policy exception, sending it to credit committee, and the next review type and date. I write the affirmation in the rating comments in prose, and those picklists stay for nCino." |
| `COMPLETE_IS_NOT_OURS` (new) | "The review is filed at In Progress, not approved. `cm_Review_Stage__c` and `cm_Approved_Date__c` are fenced from this cockpit, and submitting it for approval runs through the bank's own process." (Today's `dossierHandoff` says the second half; the first half names the fence.) |
| fabricated findings | The `hard-rules` doctrine already forbids it. This route needs it most: covenant verdicts, collateral values and profitability figures are cited from the read or the read is said to be silent. |
| a second review | Not a refusal. Named, then the banker decides (above). |

**Two step-label corrections, display only.** `annualStep` labels its prompts
`LLC_BI__Review__c.LLC_BI__Relationship_Summary__c` and `.LLC_BI__Recommendation__c`. Neither field
exists in this org. `buildStagePayload` already sends the correct `cm_Relationship_Summary__c` and
`cm_Recommendation_Narrative__c`. Wrong on the founder's screen, right on the wire.

**The card.**

```
ANNUAL REVIEW                          Hartwell Precision Manufacturing LLC
Type                Annual
Position            $46.0M committed across six facilities, six covenants,
                    two facilities at grade 5, one policy exception open
Recommendation      Affirm at 4, refresh A/R and inventory valuations,
                    reset the $2.5M line that matured 30 June
Sections            Collateral analysis, Rating comments
Files one credit review at In Progress against the product package.
```

**The confirm sentence.**

> One Annual review files against Hartwell at In Progress, carrying the position, the recommendation
> and two further sections. It is filed, not approved: the review stage and the approved date are
> fenced from this cockpit, and submitting it for approval runs through the bank's own process. The
> rating on file is untouched by this; changing it is the risk-rating review.

**The wire.** `stage_annual_review`, unchanged shape, six keys the room stops nulling.

```
idempotencyKey             required
accountId                  required   -> LLC_BI__Account__c
rationale                  required
reviewType                 required   -> LLC_BI__Review_Type__c
productPackageId                      -> LLC_BI__Product_Package__c
narrative                             -> LLC_BI__Narrative__c                      NEW
relationshipSummary                   -> cm_Relationship_Summary__c
strengthsNarrative                    -> cm_Strengths_Narrative__c                 NEW
weaknessNarrative                     -> cm_Weakness_Narrative__c                  NEW
recommendationNarrative               -> cm_Recommendation_Narrative__c
collateralAnalysisNarrative           -> cm_Collateral_Analysis_Narrative__c       NEW
financialAnalystNarrative             -> cm_Financial_Analyst_Narrative__c         NEW
guarantorNarrative                    -> cm_Guarantor_Narrative__c                 NEW
riskRatingComments                    -> cm_Risk_Rating_Comments__c                NEW
editedNarrativeFields                 ledger only, never injected into field text  NEW
```

**Hartwell, worked.** Revenue $85.0M, `LLC_BI__Highest_Risk_Grade__c` reads "4". Six booked
facilities totalling $46.0M plus a seventh at Proposal:

| Facility | Commitment | Type | Facility grade | Maturity |
| --- | --- | --- | --- | --- |
| Line of Credit | $15,000,000 | Non-Real Estate | 4 | 2027-03-15 |
| Construction | $12,000,000 | Real Estate | 5 | 2026-11-01 |
| Equipment | $8,000,000 | Non-Real Estate | 4 | 2030-09-20 |
| Purchase (CRE) | $5,000,000 | Real Estate | 4 | 2028-05-10 |
| Equipment | $3,500,000 | Non-Real Estate | 4 | 2030-02-18 |
| Line of Credit | $2,500,000 | Non-Real Estate | 5 | 2026-06-30 |
| Equipment (Proposal) | $3,000,000 | Real Estate | none yet | none yet |

That table IS the dual rating in this org today: one borrower at 4, facilities at 4 and 5. The two
fives are the construction facility (advance rate above the 70 percent policy line, exception
`CRE-AR-01`, Major and Mitigated) and the $2.5M line that matured 2026-06-30 and is already past.
Both are annual-review findings before anyone opens a spreadsheet, and both are readable from the
bundle the room already holds.

**Open, not decided here.** `Account.LLC_BI__Highest_Risk_Grade__c` reads "4" while two facilities
carry 5. Stale, or does "highest" mean best quality? The room asserts neither reading until it is
settled.

### 2.4 Risk-rating review

**What the banker types.** "affirm the grade", "re-rate them", "downgrade to a 5", "override the
grade to 6", "the coverage came in at 1.38", "they are special mention now".

**The book speaks first.** The rating on file is `RG-0000004` (`a2bbb000001HzbBAAS`), created
2026-08-25, status In Review, computed and final grade 4.0, no override, no comment, with all four
actuals already stored (cash flow coverage 1.38, credit score 740, management experience 24, revenue
growth 4.2). The room mirrors those four and asks for confirmation rather than asking cold.

**The elicitation, only what the human owns.**

| Step | Question | Kind | Notes |
| --- | --- | --- | --- |
| `cashFlowCoverage` | Coverage reads 1.38 on the rating on file. File that, or a new figure? | number | Optional. Mirrored from the read. |
| `revenueGrowth` | Revenue growth reads 4.2. | number | Optional, mirrored. |
| `managementExperience` | Management experience reads 24 years. | number | Optional, mirrored. |
| `creditScore` | Credit score reads 740. | number | Optional, mirrored. |
| `computedRiskGradeValue` | The grade this analysis supports. | number | Today taken silently from `snapshot.computedRiskRating`. State it on the card; the banker owns the proposal. |
| `overriddenRiskGradeValue` | **new.** Overriding the computed grade? | number | Only when the banker asks. Any value above zero makes the comment mandatory. |
| `overrideComment` | The written reason for the override. | text | **Mandatory whenever an override is present**, validated client-side before the org refuses under `Mandatory_comment`. Optional otherwise, as the rationale for the record. |

**What the org computes and the room never asks.** `LLC_BI__Final_Risk_Grade__c`, a formula whose
own field description reads "set by the overidden risk grade if one exists, and the calculated risk
grade if it does not, rounded if that field is enabled"; `LLC_BI__Status__c` fixed to In Review by
the tool; the risk grade template, assigned by the org (Hartwell landed on Default Account Template,
which carries exactly ONE factor and zero scoring bands); the write-back onto the Loan where the
product line is Commercial; the `RG-` autonumber.

**The refusals, by name.**

| Name | The sentence |
| --- | --- |
| `OVERRIDE_NOT_FILEABLE` | **DELETE IT. It is false.** `StageRiskRatingReview.Request.overriddenRiskGradeValue` is deployed, carries its own description, and `StageExecuteRiskRatingReviewTest.overrideWithACommentIsAccepted` covers it. The room refuses a capability the tool already takes. Replaced by the collection step above and by `OVERRIDE_NEEDS_A_REASON`. |
| `OVERRIDE_NEEDS_A_REASON` (new) | "An override above zero needs a written reason. That is the org's own rule and it has no bypass. Give me the reason and I will file both." |
| `NOT_A_CLASSIFICATION` (new) | "Special Mention, Substandard, Doubtful and Loss are the regulatory categories and this org's scale is numeric. I file the grade; the classification is assigned elsewhere and I will not write one into it." |
| `NAME_THE_SURFACE` (new) | "Four grade surfaces are live here and they do not agree: the facility 0 to 15, the package 1 to 10, the review 1 to 12 and this rating unbounded. The number I am filing is on the rating review's own scale." |
| `SCORED_VS_STORED` (new) | "The org put this rating on the Default Account Template, which carries one factor and no scoring bands. Coverage is scored; the credit score, the management experience and the revenue growth are recorded as inputs and not weighed. The tool cannot choose the template." |
| dual rating | "The probability of default and loss given default fields exist on this object and are empty on every record here, and none is on this tool's wire. I read them; I never claim them." |
| the decision | "Approved and Declined belong to the org's own decisioning path. This files at In Review." |

**The card.**

```
RISK-RATING REVIEW                     Hartwell Precision Manufacturing LLC
Grade on file       4                  Proposed        5
Override            5, reason: Additional Customer Risk Factors
Comment             Construction facility above the 70 pct policy line and the
                    $2.5M line matured 30 June without a renewal.
Cash-flow coverage  1.38               Credit score    740
Management exp.     24                 Revenue growth  4.2
Files one risk-rating review at In Review on the rating review's own scale.
```

**The confirm sentence.**

> One risk-rating review files against Hartwell at In Review, proposing 5 against the 4 on file,
> recorded as an override with your written reason. Coverage is the one factor this org's template
> scores; the other three are recorded as inputs. The final grade is nCino's formula over what I
> file, and Approved or Declined is the org's own decisioning path, not this room's.

**The wire.** `stage_risk_rating_review`, unchanged shape, one key added.

```
idempotencyKey                required
accountId                     required   -> LLC_BI__Account__c
rationale                     required
loanId                                   -> LLC_BI__Loan__c            NOT OFFERED, see below
computedRiskGradeValue                   -> LLC_BI__Computed_Risk_Grade_Value__c
overriddenRiskGradeValue                 -> LLC_BI__Overridden_Risk_Grade_Value__c   NEW
comments                                 -> LLC_BI__Comments__c  (the field Mandatory_comment
                                            tests, NOT LLC_BI__Override_Comment__c)
cashFlowCoverageActual                   -> LLC_BI__Cash_Flow_Coverage_actual__c
creditScoreActual                        -> LLC_BI__Credit_Score_actual__c
managementExperienceActual               -> LLC_BI__Management_Experience_actual__c
revenueGrowthActual                      -> LLC_BI__Revenue_Growth_actual__c
```

**`loanId` stays unoffered on this route, and the room says why rather than leaving it silent.** It
is the only facility-LGD hook on any of the five wires. A facility rating is the facility room's
subject and this route's whole frame is the borrower. Recommendation: leave it off this wave and
carry the reason in `produces`. **Founder call.**

**Hartwell, worked.** The room's own line, from the read:

> Grade on file is 4. Coverage at 1.38x sits inside the 1.25x covenant with 10 percent cushion,
> which is the watch band, and two of the six facilities already carry a 5. The analysis supports
> affirming 4 with the construction facility flagged. If you want a 5, I will record it as an
> override with your reason, and nCino decides.

### 2.5 Service request

**What the banker types.** "they asked for a payoff letter", "raise a ticket", "open a service
request", "James wants the June covenant certificate".

**Three defects to close, and they are all on the same four lines of `serviceStep`.**

1. **`origin` is not a wire.** `StageServiceRequest.cls` declares no `origin` invocable variable. It
   resolves `Case.Type` and `Case.Origin` itself through `C360Picklist.preferredOrFallback` and
   reports `degradedTypeMode`. The room asks "How did it reach us?" and the answer is dropped.
   **Delete the step and the payload key.**
2. **The subject and the body are inverted.** The Apex is explicit: `requestType` is "Banker-language
   description of what the client asked for. Becomes the case subject", and `summary` is "The
   request in full, as the servicing team needs to read it". Both are `required=true`. The room asks
   "What kind of request is this?" for `requestType` (so a category lands on the subject line) and
   "State the subject" for `summary` (so the subject lands in the description). **Swap the two
   questions to match what the fields are.**
3. **`Case.Type` and `Case.Origin` chips would repeat defect 1.** The wire-arms addendum's follow-up
   says to pass `caseType` and `caseOrigin` from the catalog into this room. Do not. The catalog now
   carries both (Problem, Feature Request, Question, Complaint, Vehicle Maintenance, Service
   Request; Email, Phone, Web, Facebook, Twitter, Agent), and neither is on the wire, so a chip set
   from them is a question that cannot be filed. **Name them in `produces` as facts the org sets,
   never as chips.** The catalog reaches this room for `covenantType` and `collateralType` only.

**The elicitation, corrected.**

| Step | Question | Kind | Notes |
| --- | --- | --- | --- |
| `requestType` | What did the client ask for? One line, as it should read on the case. | text | The client's own words from `bundle.requests[0].summary` or from the mail, offered as a chip, never written silently. Becomes `Subject`. |
| `summary` | The request in full, as servicing needs to read it. | text | Becomes `Description`, with the reference appended by the tool. |
| `detail` | Anything further for the audit record? | text | Optional, folded into `rationale`. Unchanged. |

**What the org computes and the room never asks.** `Type`, read from the org's live `Case.Type`
picklist (preferred Service Request); `Origin`, read from `Case.Origin` (preferred Agent); `Status`,
New; the case number; and `degradedTypeMode`, which the room reports where the org substituted a
pair.

**The refusals, by name.**

| Name | The sentence |
| --- | --- |
| `TYPE_AND_ORIGIN_ARE_THE_ORGS` (new, in `produces`) | "The type and the origin are read off this org's own picklists by the tool and are not mine to set. If the org does not offer the honest pair the case still files and the plan says which pair it used." |
| no owner, no promise | "The request is created at New. I do not assign an owner and I do not promise a turnaround." |
| no transitions | "The tool performs no status transitions and never closes a case." (existing `produces`) |

**The card.**

```
SERVICE REQUEST                        Hartwell Precision Manufacturing LLC
Subject     Copy of the June covenant compliance certificate
Detail      James Hartwell asked on 28 Aug for the June certificate for his
            own file. No credit action requested.
Reference   m365-message
Creates one case at status New. Type and origin come from the org.
```

**The confirm sentence.**

> One case files against Hartwell at status New, with the client's own words on the subject and the
> full request in the body, citing the message it came from. The type and the origin are read off
> this org's picklists by the tool rather than set here. Nobody is assigned and no turnaround is
> promised.

**The wire.** `stage_service_request`, one key REMOVED from the room's payload.

```
idempotencyKey     required
accountId          required   -> AccountId
rationale          required
requestType        required   -> Subject
summary            required   -> Description (with the reference appended)
referenceKind                 -> folded into Description
referenceId                   -> folded into Description
referenceWebLink              -> folded into Description
origin             DELETE. No such invocable variable exists.
```

`writeTools.ts` drops `origin?: string | null` from `create-service-request`. The key travels on no
facility payload, so removal is type-safe; the facility suite still runs as the gate.

**Hartwell, worked.** With mail present: "James asked on Aug 28 for a copy of the June covenant
certificate." The room offers that sentence as the subject chip, takes the body, cites
`referenceKind: m365-message` and the message id, and files. With no mail and no `requests` block on
the bundle (which is the state of `artifact/live-data.json` today), the room asks for both lines
cold and says nothing about correspondence it does not have.

---

## 3. THE DOCTRINE SLICES

Four methodologies, in the pack's voice, added to `brain/WORKROOM-BRAIN.md` and sliced into
`app/src/channel/doctrine.ts`, plus the coverage-math block the audit named. Each block is
`match`-gated, none is `always`, and every one is added to `DOCTRINE_DROP_ORDER` so the budget test
stays the gate.

### 3.1 `brain/WORKROOM-BRAIN.md`: the pack additions

| Section | Content |
| --- | --- |
| **4.3.1 The covenant test, end to end** (new, after 4.3) | Test date, frequency and measurement period come from the credit agreement. Coverage and leverage are LTM; balance-sheet tests are point in time on the test date. The compliance certificate is the DELIVERY obligation and the ratio is the FINANCIAL obligation, and they fail separately. Breach, overdue, waived and amended are four different events. A financial breach is not cured by performance: it is fixed by a waiver, an amendment, a paydown or an equity cure. A covenant review closes an open test period; it never approves anything. |
| **4.4.1 Valuation basis, date and expiry** (new, after 4.4) | Appraisal, evaluation, broker opinion, internal valuation and field exam are five different productions of one number. FMV, OLV and FLV are three different numbers for one asset, in descending order, and M&E advance rates are quoted against OLV. A figure without its basis is not a valuation. Every valuation carries an as-of date and policy states how long it stays good: monthly for A/R and inventory on a base, 12 to 24 months for M&E, 12 to 36 for CRE. Six re-valuation triggers: renewal or increase, downgrade or watch listing, covenant breach, material change in the asset or its market, a proposed release or substitution, an exam finding. |
| **4.9 The annual review** (new) | The bank's periodic re-underwriting. Eight sections: exposure position, financial update, covenant compliance, collateral position, relationship profitability, risk rating affirmation, renewal decision, action items. RM drafts, credit analysis supports, a credit officer with the lending authority approves, and committee above that or on anything moving to criticised. |
| **4.8 amended** | Add the four live scales in this org and the rule that any rating mention names its surface. Add: this org's rating object does not score, and `LLC_BI__Final_Risk_Grade__c` is a formula that picks between the overridden and the computed grade. Add the named downgrade triggers. |
| **2.6 corrected** | "This org has zero prior valuation rows" is stale. It has eight on the Hartwell assets. Also correct the blanket "the Hartwell pledges carry written overrides": LC-00011 and LC-00013 (both A/R) carry none. |
| **2.4 corrected** | The `C360Covenants` header note that four of Hartwell's six covenants carry no loan junction. The live read on 2026-09-02 says three of six DO carry one (COV-000649, 650, 651). |

### 3.2 `doctrine.ts`: the four new blocks

**`covenant-testing`**, source 4.3.1, match on the testing vocabulary (tested, testing, certificate,
compliance, due date, period, LTM, trailing, cure, waiver, equity cure, amend, delinquent).

> COVENANT TESTING. The test date, the frequency and the measurement period come from the credit
> agreement, never from the day the file was opened. Coverage and leverage are measured on the
> trailing twelve months; balance-sheet tests are point in time on the test date.
> The compliance certificate is the DELIVERY obligation and the ratio is the FINANCIAL obligation.
> They fail separately and this bank tracks them separately.
> Breach is a test that ran and failed. Overdue is a date that passed with nothing delivered. Waived
> is relief for a period, and the covenant still exists. Amended means the terms changed, so apply
> the framework to the modified terms.
> A financial breach is not cured by performance. It is fixed by a waiver, an amendment resetting
> the covenant, a paydown, or an equity cure treated as an EBITDA add-back for the period.
> A covenant review closes an open test period. It records the verdict and the figure; it approves
> nothing, and where a test fails it raises the separate action rather than resolving it.
> In THIS org nCino computes no covenant test: the rule object holds three rows and the spread
> statement period object holds none. The test is ours, deterministically, from the org's threshold
> and operator against a Boom actual. Say which number came from where.

**`valuation-basis`**, source 4.4.1 and 2.6, match on the valuation vocabulary (valuation, appraisal,
revalue, OLV, NOLV, FMV, liquidation, basis, field exam, aging, lendable, advance rate, stale,
expiry).

> VALUATION. A valuation is a dated statement of what an asset is worth, struck on a named basis,
> from a named source. Basis matters more than the number: fair market value, orderly liquidation
> value and forced liquidation value are three different numbers for one asset, in descending order,
> and machinery and equipment advance rates are quoted against OLV.
> A figure without its basis is not a valuation. If you do not know the basis, say so.
> A number that fell because the basis changed is not an impairment. Name the basis on both readings
> before you call anything a decline.
> Every valuation carries an as-of date. Policy states how long it stays good: monthly for A/R and
> inventory on a borrowing base, 12 to 24 months for machinery and equipment, 12 to 36 for CRE.
> LENDABLE VALUE IS TWO NUMBERS IN THIS ORG. The collateral record's lendable value is a formula
> over the collateral TYPE rate and ignores any pledge override; the pledge's own lendable value
> honours it. The credit figure is the PLEDGE figure. Never present the asset figure as the bank's.
> Filing a valuation does not move the collateral value. That roll-up is bound to nCino's own Add
> Valuation button and does not fire headlessly. Claim no coverage improvement from a filing.

**`annual-review`**, source 4.9, match on the review vocabulary (annual review, yearly, periodic
review, re-underwrite, renewal decision, action items, affirm, committee, credit officer).

> THE ANNUAL REVIEW. The bank's periodic re-underwriting of a relationship it already holds. The
> question is narrow: on today's facts, would we still do this deal, at this size, price, structure
> and grade.
> Eight sections: exposure position, financial update (the direction, not the level), covenant
> compliance test by test, collateral position with the dates behind the values, relationship
> profitability, the rating affirmation, the renewal decision, and the action items with an owner
> and a date.
> RM drafts. Credit analysis supports. A credit officer with the lending authority approves, and
> committee above that limit or on anything moving to criticised. You draft. You never approve.
> A finding is cited from the read or the read is said to be silent. Never carry a covenant verdict,
> a collateral value or a profitability figure you cannot point at.
> In THIS org the review's own decision picklists are on no tool wire: the current and recommended
> relationship ratings, whether a grade change is requested, whether the covenants were tested and
> passed, a new policy exception, credit committee, and the next review type and date. State the
> affirmation in prose in the rating comments and hand the picklists to nCino.

**`risk-rating`**, source 4.8, match on the rating vocabulary (rating, re-rate, grade, downgrade,
upgrade, notch, PD, LGD, special mention, substandard, doubtful, classification, override,
pass/watch, criticised).

> RISK RATING. A pass band, then the interagency categories: Special Mention, Substandard, Doubtful,
> Loss. The line between Pass/Watch and Special Mention is the one that costs money: it changes
> reserve, reporting and examiner attention.
> Dual rating. The borrower rating is probability of default; the facility rating is loss given
> default, driven by collateral, lien position, guaranty and structure. One borrower, one PD; six
> facilities, six LGDs.
> A rating narrative carries the comparison to the grade on file, four to six supporting points
> across leverage, coverage, liquidity, business profile, sector and ownership, an explicit why not
> one notch better and why not one notch worse, and the conditions that would trigger a downgrade.
> A rating change is never silent. If a proposed rating differs from the rating on file, surface it.
> An override is a governed event: written reason, reason code, approval above the proposer. A
> rating system that accepts an override with no comment is a rating system nobody examines.
> Downgrade triggers: a breach not cured or waived, two consecutive quarters of coverage below the
> covenant, an unplanned revolver draw that does not clean up, a going-concern or qualified opinion,
> loss of a top customer, payment past due beyond 30 days, a borrowing base that stops supporting
> the commitment, bankruptcy or judgment against a guarantor.
> FOUR GRADE SURFACES ARE LIVE IN THIS ORG AND THEY DO NOT AGREE: the facility 0 to 15, the package
> 1 to 10, the review 1 to 12, and the rating review unbounded. Name the surface every time.
> This org's rating object does not score. The final grade is a formula that picks the overridden
> grade if there is one and the computed grade if there is not. The probability of default, loss
> given default, quantitative, qualitative and total score fields exist and are empty on every
> record. Read them; never claim them.
> Special Mention, Substandard, Doubtful and Loss are not values on any picklist here. Never write a
> regulatory classification into a numeric grade.

### 3.3 `coverage-math`, the block the audit named

`WORKROOM-BRAIN.md` 4.4 still has no block. Add it, source 4.4, match on the coverage vocabulary
(coverage, borrowing base, availability, eligible, ineligible, reserve, LTV, loan to value,
shortfall, concentration, cross-aged).

> COVERAGE AND THE BORROWING BASE. Availability on a base-governed revolver is min(commitment, base)
> less outstandings. Treating the full undrawn commitment as available where a base exists is a
> standard error.
> Borrowing base is (eligible A/R x its rate) plus (eligible inventory x its rate) less reserves.
> Eligible A/R excludes aged, cross-aged, over-concentration, contra, affiliate, unsupported
> foreign, government without assignment, bill-and-hold, consignment and disputed items. Eligible
> inventory excludes work in process at most banks, slow-moving and obsolete stock, consigned goods,
> in-transit without documents, and stock at locations with no landlord waiver or bailee letter.
> Collateral coverage is total lendable value over outstandings. Lendable value is collateral value
> times the advance rate. LTV is loan amount over collateral value.
> In THIS org `Customer360Exposure` returns lendable value and a computed coverage ratio per
> facility plus a shortfall flag. USE THE ORG'S FIGURE. Do not re-derive one and present it as the
> bank's.
> A lien marked excluded sits outside availability math. Say so rather than quietly counting it.

### 3.4 The `route-open` relationship arm

`ROUTE_OPEN` today names the facility room's three routes. It gains a relationship arm, selected on
`CONTEXT.room === "relationship"`:

> THE ROUTE IS NOT BOUND, AND THIS IS THE RELATIONSHIP ROOM. Five questions are open: the annual
> review, the covenant review, the collateral valuation, the risk-rating review and the service
> request. None of them has been asked yet.
> Do not write as if any one of them were running. Never say which covenants are being assessed,
> never say what is being valued, never propose a grade, never draft a review section, and never
> compose a case.
> Lead on the POSITION of the relationship: what it holds, whether the tests are clean and when they
> are next due, whether the collateral numbers are current, the grade on file and when it was last
> looked at, and whether anything is staged.
> The chips for CONTEXT.routeOptions are on the glass. Your closing line points at them, or at the
> one route CONTEXT.mail names. It never invents a sixth.

### 3.5 The budget

`DOCTRINE_BUDGET_BYTES` is 18,000 and the comment records that every block firing at once measures
"a little over 16 KB". The five new blocks add roughly 4 KB, so a line touching every surface would
cross it. Two rules, in this order:

1. **All five go into `DOCTRINE_DROP_ORDER`**, ahead of `credit-policy`, so the budget gives them up
   first and visibly rather than silently trading one slice for another.
2. **Measure, then decide.** If the suite shows a relationship line dropping a block it needs, raise
   the budget with the reason written down, exactly as the raise from 16,000 was written down. Do
   not raise it pre-emptively.

The match words overlap the facility room's lines (coverage, rating, grade, basis, compliance), so
the facility doctrine tests are the gate on this whole section. See section 4.

---

## 4. SHARED VERSUS RELATIONSHIP-ONLY

### 4.1 Relationship-only. No facility file is read.

`app/src/components/relationship/RelationshipRoom.tsx`, `relBrain.ts`, `relRoute.ts`,
`relSession.ts`, `reviewFlows.ts`, plus one new module `relBook.ts`, plus the `RelationshipRoomHost`
block. Everything in sections 1.1 to 1.6, every elicitation change in section 2, the trail write, the
book awareness and the amendment grammar live here and touch nothing the facility room reads.

### 4.2 Shared, read-only. Used, not changed.

`Peek`, `Liquid`, `TypeIcon`, `ReadCardView`, `entryChoreography`, `stepper`, `readBlocks.ts`,
`brainRoute.toReadCardModel`, `brainLane.ts` (`capEnvelope`, `askBrain`, `brainReachable`),
`Narration.tsx`, `sampleDoor.ts`, `ladder.ts`, `catalog.ts` (`readCatalog`, `chipSet`,
`reconcileChips`), `clientMail.ts` (`useClientMail`, `mailNoteFromBundle`), `workroom.css`. Calling
them from a second room changes nothing for the first.

### 4.3 Shared and CHANGED. Each with its gate.

| File | The change | Facility risk | The gate |
| --- | --- | --- | --- |
| `writeTools.ts` | Drop `origin` from `create-service-request`. Add `overriddenRiskGradeValue` to `risk-rating-review`. Add `allowNonPending` to `covenant-review`. Add the six annual narrative keys. | **Low.** `origin` travels on no facility payload, so its removal is type-safe. The four additions are optional keys on payloads no facility route sends. | Full facility suite, unchanged and green. |
| `doctrine.ts` | Five new match-gated blocks, all in `DOCTRINE_DROP_ORDER`, plus the `route-open` relationship arm. | **Medium.** The match words overlap facility lines, so a facility line can now select a block it did not before, and the budget can push a facility block out. | `doctrine.test.ts`: each new block selected on its own words; each droppable; the facility's existing selections for the pinned lines UNCHANGED, block for block; total under `DOCTRINE_BUDGET_BYTES`. That last assertion is the real gate. |
| `narrate.ts` | `subjectFor` gains the relationship item kinds (`opening`, `brief`, `gap`, `notice`, `dossier`), which return null today, plus the relationship entity resolution for the greeting rail. | **Medium.** `subjectFor` is on every facility narration. A new branch that mis-fires would change facility remarks. | `narrate.test.ts`: every existing facility case byte-identical. The relationship branches are reached only on the relationship item kinds, which the facility room never produces. |
| `ask.ts`, `readCard.ts` | Three read topics: `reviews`, `rating`, `requests`. | **Highest.** `ReadTopic` ordering is shared and the facility room's five topics must not move. | Do this LAST, behind a full facility run. `readCard.test.ts` plus the whole facility read suite. If the ordering cannot be extended without moving the five, it does not ship this wave. |

### 4.4 What must NOT be ported

The facility room's delta-safety layers (`dispatch.ts` qualifier filter, magnitude advisories,
misread commitments, `provablyClean`, `orgArms.ts`, `exception.ts`, `fee.ts`, `pricingGate.ts`) have
no relationship analogue: this room stages no scalar deltas and no arm. Forcing one would be
invention. Only two ideas cross: the amendment grammar and the book awareness, and both are ported by
copying the idea into `reviewFlows.ts`, never by lifting a shared helper out of the facility room.

---

## 5. TESTS TO ADD

| # | Test | File |
| --- | --- | --- |
| 1 | The greeting primes consent exactly once, after the lookup lands and after the mail gate opens, and never before either. The existing "with no bridge" cases stay green. | `relationshipBrain.render.test.tsx` |
| 2 | The greeting rail carries the room's figures and the model's none: a name the envelope cannot resolve renders as a plain bullet with no rail. | `relationshipBrain.render.test.tsx` |
| 3 | With every covenant carrying `latestComplianceId: null`, the greeting says there is no open test period and the covenant chip is disabled with that reason. No step is ever asked. | `relationshipRoom.render.test.tsx` |
| 4 | With no `productPackageId` on the bundle, both package-anchored routes refuse with `NO_PACKAGE_ANCHOR` before the first question, not after the last. | `relationshipRoom.render.test.tsx` |
| 5 | Filing appends exactly one activity-trail entry naming the review and the record. Today the toast claims it and nothing is written. | `relationshipRoom.render.test.tsx` |
| 6 | The service route asks two questions, not three: `requestType` carries the client's line and `summary` carries the body. No `origin` step exists and no `origin` key travels. | `reviewFlows.test.ts` (rewrites the case at :386) |
| 7 | The rating route collects an override and refuses one with no comment. `OVERRIDE_NOT_FILEABLE` is gone from the fileable map. | `reviewFlows.test.ts` (rewrites :376), `relationshipRoom.render.test.tsx` (rewrites :556) |
| 8 | `allowNonPending` appears only where a chosen covenant's row is not Pending, its copy says the schedule does not advance, and the flag travels on the payload. | `reviewFlows.test.ts` |
| 9 | Valuation `primary` and `description` travel when answered and are `false` and `null` when skipped. | `reviewFlows.test.ts` (extends :308) |
| 10 | Each of the six annual narrative keys travels when its section chip was picked and answered, and is `null` when it was not. | `reviewFlows.test.ts` (extends :193) |
| 11 | With a catalog, covenant and collateral type chips come from the org; with none, the `observedPicklists` mirror stands and the room reads exactly as today. `Case.Type` and `Case.Origin` are offered as chips in NEITHER state. | new `relCatalog.test.ts` |
| 12 | `relBook`: a covenant whose row already carries a verdict is offered with it; an annual review already In Progress is named before the route runs; an asset's last basis and date are shown on its option. | new `relBook.test.ts` |
| 13 | Amendment: "make the DSCR one Waived instead" replaces the collected answer in place and does not change the lane order or stage a second entry. | `reviewFlows.test.ts` |
| 14 | Doctrine: each of the five new blocks is selected on its own words, each is droppable, and the total with everything firing is under `DOCTRINE_BUDGET_BYTES`. | `doctrine.test.ts` |
| 15 | **The facility guard.** For a pinned set of facility lines, the selected doctrine block ids are unchanged, block for block, before and after this change. | `doctrine.test.ts` |
| 16 | The relationship `route-open` arm travels while unbound and is gone once a route binds; a bound covenant room never writes about a valuation. | `doctrine.test.ts`, `relationshipBrain.render.test.tsx` |
| 17 | `narrate.subjectFor` returns byte-identical subjects for every existing facility case. | `narrate.test.ts` |
| 18 | Channel-none parity: with no session door, no remark and no pulse render, every deterministic sentence in the room is exactly today's, and the review still stages and files. | `narration.render.test.tsx` |
| 19 | The engine fence: `git rev-parse HEAD:app/src/workroom` equals `91c751e427232bf2b62c14b9cf92921e497496c9`. | the merge attestation, per commit |

---

## 6. THE DRIVE SCRIPT

Headless, one page load per line, against the assembled build, with `window.claude.mcp` stubbed
before the page's own scripts: the Customer 360 reads answer the Hartwell bundle,
`Customer360Catalog` answers the org shape, `outlook_email_search` answers the seeded message, and
every `stage_` and `execute_` call records its payload and then returns a plan or throws the org's
own refusal depending on what the line is proving. No org call is attempted.

| # | The line | What must happen |
| --- | --- | --- |
| 1 | open the room | ONE consent call, framed by the greeting. The remark carries three rows with rails the room resolved. Route unbound, five chips. |
| 2 | (no line) | With the seeded mail present, the greeting names it or a second remark lands under it. Never a second consent dialog. |
| 3 | `what is the risk rating` | Answered locally from the read, naming the surface. No route bound, no desk call. |
| 4 | `covenant review` | The room states the book: no open test period on any of the six. It asks nothing. The chip is disabled with that reason. |
| 5 | `revalue the a/r and the inventory` | The staleness fact opens it. Two assets, two figures, one date, basis and source chips from the org, then primary and the note. |
| 6 | `net orderly liquidation value` then `field exam` | The room says this org offers no Field Exam source and names the two it does offer, then takes the pick. |
| 7 | confirm the valuation | The confirm sentence names the pledge lendable value, not the asset formula, and claims no coverage improvement. |
| 8 | `actually make the inventory 7.2 million` | The OPEN card amends in place. No second entry, lane order unchanged. |
| 9 | `annual review` | R-8 is named first. Then type, then a drafted position and recommendation, then the sections chip set. |
| 10 | `downgrade them to a 5` | The rating route opens, the grade on file is stated beside the proposal, and the override is offered. |
| 11 | confirm with no comment | Refused with `OVERRIDE_NEEDS_A_REASON`. The old `OVERRIDE_NOT_FILEABLE` sentence must not appear anywhere. |
| 12 | `they are special mention` | `NOT_A_CLASSIFICATION`, in one line, then the numeric grade it will file. |
| 13 | `james wants the june certificate` | Two questions, not three. The client's line is offered as the subject chip. No "How did it reach us?" |
| 14 | file the case | The trail carries one entry naming the case. The toast's claim and the trail agree. |
| 15 | `pledge the equipment to the 8M loan` | `FACILITY_HANDOFF`, one line, unchanged. |
| 16 | `add a covenant on the relationship` | `CREATE_GAPS.covenant`, after the composition, with the org-side gap named. |
| 17 | reload, open the facility room, run the pinned facility drive | Byte-identical to today. This is the gate on the whole batch. |

Read `c360SampleGate()` at the end of the run, not per step: `bands["greeting:quick"]`,
`bands["narrate:quick"]`, `consentCall` held out of the bands, and `overCallRate`.

**Two fixture decisions the founder must make before this drive is meaningful.**

1. `artifact/live-data.json` carries no `productPackageId` on the Hartwell snapshot, so both
   package-anchored routes block on `NO_PACKAGE_ANCHOR`. The id is `a5Fbb000000IHFJEA4`. Assembler
   fix or bundle regeneration.
2. Hartwell carries no compliance rows, so line 4 above is the honest refusal rather than a covenant
   review. If the covenant route is to be DEMONSTRATED rather than refused, it runs on a relationship
   that has rows (Flowers For Dreams, ABC Manufacturing, Ironclad, BlueSky, Cy LTD, EverPetal) or a
   row is raised on Hartwell in the org. Either is a deliberate, named change, not a quiet edit.

---

## 7. EXPLICITLY OUT OF SCOPE

1. **Any new org write arm.** No new Apex, no new invocable variable, no new tool. Every question in
   section 2 maps onto a wire one of the five deployed `stage_` tools already takes.
2. **Anything that changes the facility room's behaviour.** `app/src/workroom/**` stays byte
   untouchable at tree `91c751e427232bf2b62c14b9cf92921e497496c9`.
   `app/src/components/workroom/**` is read, never written. The four shared files in 4.3 are changed
   additively and each carries a test that pins facility behaviour unchanged. If any gate in 4.3
   cannot be met, that item does not ship this wave.
3. **`transitionAllowlist.ts`, `C360WriteGuard`, and every Apex class.** Untouched.
4. **The annual review's decision picklists.** `cm_Current_Relationship_Risk_Rating__c`,
   `cm_Recommend_Relationship_Rating__c`, `cm_Are_you_requesting_a_grade_change__c`,
   `cm_Have_the_covenants_been_tested__c`, `cm_Did_the_Covenants_pass_the_test__c`,
   `cm_New_Policy_Exception_added__c`, `cm_Send_to_Credit_Committee__c`,
   `cm_Set_Next_Review_Type__c`, `cm_Set_Next_Review_Date__c`. They are the renewal decision, the
   rating affirmation and the action items of a real annual review, and no tool takes them. The room
   states the affirmation in prose and hands them to nCino. A wire addition is a founder decision
   AFTER the demo.
5. **Extending a covenant due date.** `LLC_BI__Proposed_Extension_Date__c` is updateable and no tool
   writes it. New arm. Fenced.
6. **Touching `Acnpex_Approval_Status__c` on a covenant when a waiver is recorded.** Not researched,
   new arm, fenced.
7. **Covenant AMEND and DETACH.** Refused by the guard outright. Not a gap to close here.
8. **The `covenantChallenge` block** (Boom-implied against nCino-evaluated, `corroborated` /
   `diverges` / `not-computable`). The contract carries the shape and `CovenantsTab` renders it; no
   bundle populates it. Computing it live from `boom.spread.lineItems` is a separate, worthwhile
   build and is not this one.
9. **`loanId` on the rating wire.** The only facility-LGD hook available. Left unoffered, with the
   reason stated in `produces`. Founder call.
10. **The dual-rating fields** (base, adjusted and final PD and LGD grades and scores, quantitative,
    qualitative and total score, agency rating, confirmed by, date decisioned). They exist, they are
    empty on every record here, and none is on any wire. Read, never claimed, never written.
11. **`stage_renewal`.** Execution-held at `writeTools.ts:63` and not one of the five routes.
12. **The read-side additions**, which are NOT write arms but ARE separate decisions:
    `Customer360Exposure` returning valuation dates and `Next_Revaluation_Due_Date__c` (which tier 4
    of the greeting depends on), and the `Covenant` contract carrying `Acnpex_Operator__c`,
    `Calculation_Logic__c` and `LLC_BI__Grace_Days__c`. Both are in scope only if the founder says
    so; without them, tier 4 is absent and the direction is inferred, and the room says which.
13. **`Case.Type` and `Case.Origin` chips.** The catalog carries both and neither is on the wire.
    Offering them would repeat the `origin` defect. Named in `produces`, never offered.
14. **A second room open.** `primeConsent` memoises across the whole view, so opening the
    relationship room, leaving and reopening replays the first greeting. Pre-existing, not made worse
    here, not fixable inside the consent contract before the demo. Do not demo a second room open.
15. **`app/src/data/finance.ts` `covenantDirection()`.** It infers direction from name hints while
    the org stores the answer. Fixing it is a read-side change plus a helper change that both the
    rail and the card use, and moving it moves the facility room's covenant copy too. Not this wave.
