# nCino process alignment — covenant review and collateral valuation

**Status:** DRAFT. Research output, 2026-08-20. Not a build spec.
**Question asked:** how does nCino *intend* covenant review and collateral review/valuation to work, and
where does our Apex tool suite match, diverge, or ignore fields that carry process meaning?
**Scope:** `StageCovenantReview` / `ExecuteCovenantReview` / `StageCollateralValuation` /
`ExecuteCollateralValuation` on org `bankinggpt`.

## Citation key

| Marker | Meaning |
|---|---|
| `mapId:XXXX` | nCino technical documentation (Paligo), fetched via Admin Digital Partner MCP on 2026-08-20 |
| `kb:XXXX` | nCino Help Documentation article id |
| `PDI-000xxxxx` | nCino Known Issue (product defect) |
| `repo:<path>` | file in this repository |
| `org:` | a SOQL / describe / Tooling result already recorded in this repo's evidence files |
| **UNVERIFIED** | asserted nowhere I could reach; do not build on it without a probe |

Primary documents read in full for this draft:

| Title | Id |
|---|---|
| How to Use Covenant Management and Servicing | `mapId:JcmtOww8Pe03jJQFdMSeHA` |
| How to Use Automated Covenant Testing | `mapId:FE_EonXfEU5WbW_VcgN7kw` |
| Summary of nCino's Covenant Automation and Best Practice Configurations | `kb:kAHHu000000XZRJOA4` |
| Covenant Management: Covenant Compliance | `kb:kAHHu000000XZQjOAO` |
| Gold Standard: Covenants | `kb:kAHHu000000XZTaOAO` |
| How to Use Collateral Management | `mapId:AxjTjH5MIQKVIp_wnaek5g` |
| How to Configure Collateral Valuation | `mapId:2opWW8UJI0Rg_v6i6wVYoQ` |
| How To Use Collateral Advance Rates Administration | `mapId:pkyVk2ipvqJgYnho~Uyqxg` |
| How to Use Credit Actions on Product Package | `mapId:oCOdPaJSYrwRfbKN2zNqFg` |
| How to Use Continuous Credit Monitoring | `mapId:0H3vHA9pIXO~2sKdstf39w` |
| How to Use Problem Loan Management | `mapId:2yHDRtma4G434TZPPeiZxg` |

Additional help articles and known issues surfaced by a dedicated PDI sweep (36 articles read; the
decision-grade ones are cited inline in §5):

| Title | Id |
|---|---|
| Managed Covenant Compliance Fields | `kb:kAHHu000000XZOTOA4` |
| Document Manager Exception Status Advances Covenant Compliance | `kb:kAHPY00000055lR4AQ` |
| Covenant Compliance Auto-Evaluation Behavior | `kb:kAHHu000000XZPZOA4` |
| Why Didn't a Covenant Compliance Record Evaluate? | `kb:kAHHu000000Xb8JOAS` |
| How to Implement Credit Action Bypass for Custom Code | `kb:kAHPY0000003PjR4AU` |
| Relationship Credit Actions Error: Attempt to de-reference a null object (the preflight checklist) | `kb:kAHHu000000XaHjOAK` |
| Next Covenant Compliance record displays incorrect dates when user modifies Covenant Effective Date | **`PDI-00023403` — OPEN** |
| Covenant Due Date does not recalculate … for One-Time frequency templates | **`PDI-00022207` — OPEN** |
| Covenants activate when Is Covenant is set to False on PSC records | **`PDI-00023938` — OPEN** |

Schema from `resolve_schema` / `find_references`, namespace `LLC_BI`, catalogue release **2026_07**.

---

## 1. Covenant review as nCino intends it

### 1.0 There are TWO covenant engines in the package, and they do not share cadence fields

This is the finding that reorganises everything else. `kb:kAHHu000000XZRJOA4` describes two distinct
automation stacks under the same objects:

| | **Classic Covenant Management** | **Covenant Servicing** (current, and what the modern UI drives) |
|---|---|---|
| Cadence driver on the covenant | `Frequency` picklist + `Compliance Days Prior` + `Next Evaluation Date` | `Frequency Template` (lookup to `LLC_BI__Date_Template__c`) + `Effective Date` + `Grace Days` → `Due Date` |
| What creates a compliance row | Scheduled Apex `LLC_BI.CovenantComplianceBatchUpdater`, **when `Days Until Next Evaluation` equals `Compliance Days Prior`** (`kb:kAHHu000000XZRJOA4`) | A **managed trigger**, when the covenant is Active + has a Frequency Template + has an Effective Date. After the first row, "*new Compliances will create when the previous Compliance is moved to a status outlined in the Record Create Trigger Statuses system property*" |
| What marks a row Exception | `CovenantComplianceExceptionBatchUpdater`, when the covenant's Next Evaluation Date is today or past and the row is not Compliant/Waived/Exception | `CovenantComplianceExceptionBatchUpdater`, when the **compliance row's Due Date** is past and the row is not in a "complete" status |
| Covenant write-back | Managed flow `nCino PDE - Record Trigger: Covenant Compliance After Save - V.1.0.0` | Managed flow `…After Save - V.2.0.0` |

Both stacks are documented as live options. The `2025_06` "Covenant Management and Servicing" user guide
(`mapId:JcmtOww8Pe03jJQFdMSeHA`) documents only the Servicing model and states the migration explicitly:

> "**Update Reporting**: Covenant Servicing creates covenant compliance records immediately. The system no
> longer creates compliance records within 30 days of the date specified in Next Evaluation Date. nCino
> recommends that you update your reports to filter covenant compliances by 30 days to the new field,
> Due Date."

**Consequence for us.** `Frequency` / `Next Evaluation Date` / `Compliance Days Prior` are *Classic* cadence
fields. `Frequency Template` / `Effective Date` / `Grace Days` / `Due Date` are *Servicing* cadence fields.
Hartwell's covenants carry the Classic set and leave `LLC_BI__Frequency_Template__c` null on all six
(`repo:knowledge/NCINO-FUNCTIONAL-VALIDATION.md` §1.3), which is exactly why they have never generated a
compliance row. Any tool that reasons about "when is this covenant next due" must state which engine it is
reading, because in `bankinggpt` the two disagree: Hartwell's `LLC_BI__Next_Evaluation_Date__c` says
2026-09-30 while its Servicing chain has never started.

### 1.1 The intended lifecycle (Covenant Servicing)

```
Covenant Type (config) ─┐
                        ├─> Covenant Mgmt (LLC_BI__Covenant2__c)
Frequency Template ─────┘        │  Active + Frequency Template + Effective Date
   (LLC_BI__Date_Template__c)    │
                                 ▼  managed trigger
                    Covenant Compliance (LLC_BI__Covenant_Compliance2__c)
                          created in the "Pending" status named by the
                          "Covenant Compliance Record Pending Status" system property
                                 │
                    ┌────────────┼─────────────────────────┐
                    │            │                         │
             human updates   ACT (Spreads)            Due Date passes
             Status manually  writes Automated       CovenantComplianceException
                              Testing Status          BatchUpdater forces Exception
                    │            │                         │
                    └────────────┴─────────────────────────┘
                                 ▼
                    Status ∈ {Compliant, Waived, Exception}   ("complete")
                                 │
              ┌──────────────────┼──────────────────────────────┐
              ▼                  ▼                              ▼
   managed flow writes    managed trigger advances       managed trigger CREATES
   Last Evaluation        Effective Date (+ frequency)   the NEXT compliance row
   Status / Date / Value  and recomputes Due Date              │
                                                               ▼
                                                    (in bankinggpt: fires
                                                    acnpex_covenantApprovalProcess)
```

The load-bearing sentence, verbatim from `kb:kAHHu000000XZRJOA4` (Covenant Servicing section):

> "It is important to note that these records are initially created by a Managed Trigger when a Covenant Mgmt
> record is Active, has a Frequency Template populated, and has an Effective Date populated. **After initial
> creation, Compliance records are then created when the previous Compliance is moved to a status outlined in
> the Record Create Trigger Statuses system property.**"

and

> "**Effective Date**: (Managed Trigger): When the most recent compliance record's status is updated, the
> Effective Date on the Covenant is updated by its current date and associated Frequency Template's frequency."

> "**Due Date**: (Managed Trigger): Is calculated based on the Effective Date plus Grace Days. **Cannot be
> edited directly**, recommended approach is to adjust the Due Date on the Covenant Compliance record."

**Read that as a process statement: in nCino's model, writing a terminal status onto a compliance row is not
a report. It is the act that closes one period and opens the next.** That is the single most important
divergence from how our tools describe themselves (§3).

### 1.2 WHEN evaluations happen — the cadence fields, cited

| Field (covenant) | Engine | What the doc says drives cadence | Citation |
|---|---|---|---|
| `Frequency Template` | Servicing | "This template determines how frequently (such as annually) the loan requires each covenant type (such as a tax return)." Manually populated by the user on creation. | `mapId:JcmtOww8Pe03jJQFdMSeHA`; `kb:kAHHu000000XZRJOA4` |
| `Effective Date` | Servicing | "the date the covenant is effective or the statement date of the requested form. **The date you select determines the Frequency Template options list.**" Machine-advanced on each status change. "If you change the Effective Date on a Covenant Mgmt record: for frequency-based templates, the system adjusts the Effective Date used in generation of all future covenant compliances." | `mapId:JcmtOww8Pe03jJQFdMSeHA` |
| `Grace Days` | Servicing | "The system uses the effective date plus the grace days to determine the due date of the covenant." Populated from the Covenant Type if the FI configures it there. | `mapId:JcmtOww8Pe03jJQFdMSeHA` |
| `Due Date` | Servicing | Effective Date + Grace Days. Editable with permission, to *extend* a covenant. Compliance rows are now filtered on Due Date, not Next Evaluation Date. | `mapId:JcmtOww8Pe03jJQFdMSeHA` |
| `Frequency` (picklist) | Classic | "Manually populated by user on creation of Covenant Mgmt record." Drives how far `Next Evaluation Date` moves. | `kb:kAHHu000000XZRJOA4` |
| `Compliance Days Prior` | Classic | "**Field Dependency Setting on the Covenant Mgmt Object**: automatically populated upon creation according to the field dependency settings. For example, annually evaluated Covenant records are usually set to display 30 for compliance days prior." | `kb:kAHHu000000XZRJOA4` |
| `Next Evaluation Date` | Classic | "**COMPLIANCE RECORD CREATION: (CovenantComplianceBatchUpdater) when 'Days Until Next Evaluation' = 'Compliance Days Prior' the Compliance record is generated.**" Advanced by the managed flow on each compliance status change. | `kb:kAHHu000000XZRJOA4`; `kb:kAHHu000000Xb5uOAC` |
| `Days Until Next Evaluation` / `Days Past Next Evaluation` | Classic | Formula fields. "A proper Covenant should show 0 or NULL in [Days Past Next Evaluation]." | `kb:kAHHu000000XZRJOA4` |
| `Active` | both | Controlled by the `BookedLoanSetCovenantsActive` custom setting plus Product State Config records, keyed on loan stage/status. "A covenant activates after the loan updates to a booked status." Covenants created from a Relationship auto-activate; covenants created from a Loan do not. | `mapId:JcmtOww8Pe03jJQFdMSeHA`; `kb:kAHHu000000XZTaOAO` |
| `Required` | both | NOT a cadence field. "the financial institution requires the covenant from the relationship for audit purposes" — in practice the flag that says "this covenant goes into the legal business loan agreement". | `mapId:JcmtOww8Pe03jJQFdMSeHA`; `kb:kAHHu000000XZTaOAO` |

**Documented cadence exceptions.** Two frequency-template types behave differently and both matter for a
bulk review (`mapId:JcmtOww8Pe03jJQFdMSeHA`, Default Frequency Template Options):

- **Ad Hoc** — "The system generates one compliance record, and the covenant record remains Active. Users can
  create additional compliance records as needed."
- **One-Time** — "The system generates one compliance record; however, the covenant record is Inactive when
  the compliance has a completed status. **Users cannot create additional compliance records.**"

So a One-Time covenant (Hartwell's Kokomo completion covenant is modelled `One-Off`) is a *terminating*
covenant: assessing it Compliant is the act that deactivates it. That is not reversible through the tool.

### 1.3 WHO acts

| Actor | What they do | Citation |
|---|---|---|
| Managed batch / trigger | Creates the compliance row, forces Exception on an overdue row, advances Effective/Next Evaluation Date, writes `Last Evaluation Status/Date/Value` back onto the covenant. | `kb:kAHHu000000XZRJOA4` |
| The responsible user (RM / portfolio admin) | Receives the notification the compliance row triggers ("A notification is configured via an email or task to notify the user responsible 90/60/30 days out"). Collects the document. **Sets the Status.** "Evaluation Date: Manually populated." | `kb:kAHHu000000XZQjOAO`; `kb:kAHHu000000XZRJOA4` |
| ACT (Automated Covenant Testing) | Runs from a **locked Spreads period**, from the UI magic wand only. Associates compliance rows to the period, writes `Automated Testing Status` = Pass/Fail. Under "full automation" it also sets Status; otherwise the human sets Status from the ACT result. | `mapId:FE_EonXfEU5WbW_VcgN7kw` |
| An approver (optional) | "There is an option to configure a Submit for Approval action on the Covenant Compliance records… **This approval can be waived and a covenant could register as Compliant based solely on the status change.**" In `bankinggpt` this is `acnpex_covenantApprovalProcess`, hard-assigned to a named human. | `kb:kAHHu000000XZTaOAO`; `org:` Tooling flow metadata |

**ACT's own eligibility rule is the closest thing nCino publishes to an availability predicate for a review:**

> "Tests covenants with compliances in the **In Progress** and **Pending** statuses. Excludes covenants if the
> compliance status is **Waived, Exception, or Compliant**." (`mapId:FE_EonXfEU5WbW_VcgN7kw`)

### 1.4 What a compliance assessment contains

Per `mapId:FE_EonXfEU5WbW_VcgN7kw` ("View Automated Covenant Testing Results") and
`mapId:JcmtOww8Pe03jJQFdMSeHA` ("Covenant Compliance Fields"), a complete assessment is:

| Element | Field | Note |
|---|---|---|
| The period tested | `Effective Date` (populated at creation), `Due Date`, `Original Due Date` | Original Due Date "preserves the original due date of the compliance record" when it has been extended |
| The evidence | `Associated Spread Statement Period` | ACT writes it. 0 of 140 rows in `bankinggpt` carry one |
| The rule applied | `Evaluated Rule` (the Performance Rule) | 0 of 140 rows in `bankinggpt` carry one |
| The measured figure | **`Historic Financial Indicator Value`** — "The Financial Indicator Value of the associated Covenant when the Covenant Compliance record was set to compliant" | This is the field the covenant's `Last Evaluation Value` is sourced from. 0 of 140 rows in `bankinggpt` carry one |
| The machine verdict | `Automated Testing Status` ∈ Pass / Fail / **Incomplete** | "The classic automatic testing method can produce a value of Incomplete if the Spreads period item evaluated for the Performance Rule has a null value, or if no Spreads period is attached" |
| The human verdict | `Status` | Pass→`Compliant`, Fail→`Exception` per the ACT mapping table |
| When it was judged | `Evaluation Date` | "Manually populated" |
| Why it failed | `Exception Date`, `Reason for Exception` | Exception Date is machine-set by the batch job *or* "can be populated manually" |
| Free text | `Comments` | |

**The single sentence that most constrains us:** "**Ensure the Status field is not blank. A blank status
field could cause the automation to error.**" (`mapId:JcmtOww8Pe03jJQFdMSeHA`). 6 of the 140 rows in
`bankinggpt` have a blank status (`repo:knowledge/NCINO-FUNCTIONAL-VALIDATION.md` §1.4).

### 1.5 Breaches, waivers, cures

| Concept | Does nCino model it? | How |
|---|---|---|
| **Breach** | Yes | Compliance `Status = Exception`. Covenant-level `Breached` flag exists on `LLC_BI__Covenant2__c`. `Reason for Exception` distinguishes `Breached` from `Overdue` in this org — i.e. a *failed test* from a *missing document*. That distinction is org data, not a documented nCino picklist. |
| **Overdue / missing document** | Yes, implicitly | The Exception batch updater forces `Exception` when the Due Date passes regardless of whether anything was tested. **A large fraction of "breaches" in nCino are administrative, not financial** — in `bankinggpt`, 101 of 140 rows sit at Exception with no measured value at all. Any tool that renders `Exception` as "covenant breached" will overstate credit deterioration. |
| **Waiver** | Yes, as a **status** | `Waived` is one of the three default "complete" statuses in the `Covenant Compliance Record Create Trigger Statuses` system property. Gold Standard: "This approval can be waived and a covenant could register as Compliant based solely on the status change." **nCino models the waiver as a state, not as a document, an authority, an expiry, or a scope.** |
| **Extension / forbearance on the deadline** | Yes, and nCino recommends a specific shape | "**Extend With Proposed Extension Date** … After you submit your proposed extension date to your FI, it appears in the Proposed Extension Date field. If your FI approves the extension, the new date appears in Due Date and Original Due date retains the covenant's original due date. **Note: nCino recommends this process.**" There is also a direct Due Date edit for users with the permission. |
| **Cure period** | **NO.** | nCino has no cure-period field or concept. `Grace Days` is a *pre-due-date* buffer: Effective Date + Grace Days = Due Date. It is not a post-breach cure window. Confirmed by reading every covenant field description in `mapId:JcmtOww8Pe03jJQFdMSeHA` and `kb:kAHHu000000XZRJOA4`; already recorded at `repo:knowledge/ACTIONS-DESIGN.md` §7 item 11. **Any cure logic is 100% bank rule with no product anchor.** |
| **Proposed changes at renewal** | Yes | `Proposed Effective Date` / `Proposed Frequency Template` on the covenant. "Proposed fields provide support during origination and credit actions on loans, such as underwriting, renewals, modifications, and reviews." Null on all Hartwell and Piedmont covenants. |

### 1.6 Covenants and credit actions — what nCino says happens on renewal

`kb:kAHHu000000XZTaOAO`, verbatim:

> "When the existing loan is modified or renewed, the set of covenants on the original loan copy over to the
> new instance of that loan. **In most cases, this requires a business process to delete the covenants on the
> renewed or modified loan.**"
>
> "When copying a Covenant record, it's important to note that **the covenant itself is not copied**, but
> instead, the Loan Covenant object that acts as the covenant link to the loan."

And on packages:

> "For loans that are included in a product package, the Covenant Management feature operates in the same
> manner as if the loan were not included in a product package. **The product package shows an aggregated
> list of the covenants included in the loans within the package. The user still needs to manage the
> covenants at the individual loan or Relationship level using Covenant Management.**"

That last sentence is the direct answer to "should a package-scoped bulk covenant review exist?" — nCino's
answer is that the package is a **read aggregation**; the unit of management is the covenant. See §3.5.

### 1.7 Field-by-field interpretation — covenant and compliance

Schema from `resolve_schema`, namespace `LLC_BI`, catalogue release **2026_07**. **The catalogue does not
expose a formula/roll-up/calculated flag**, so writability of anything marked *(derived?)* must be confirmed
with a live describe before any tool writes it.

#### `LLC_BI__Covenant2__c` — "Covenant Mgmt" (32 fields; process-bearing subset)

| API name | Type | Picklist values (verbatim) | What it means for process | We use it? |
|---|---|---|---|---|
| `LLC_BI__Covenant_Status__c` | Picklist | `Pending`, `In Progress`, `Compliant`, `Waived`, `Exception` | Covenant-level lifecycle state, distinct from the per-period compliance status. **In `bankinggpt` the live data holds far more than these five** — `breached, overdue, <10% headroom, >10% headroom, Active, Pass, Fail` — because the field is `restricted = false` (`repo:knowledge/ACTIONS-DESIGN.md` §5.4). Never treat as a closed set on read. | read only |
| `LLC_BI__Active__c` | Checkbox | — | Gate for evaluation. Auto-set on booking via `BookedLoanSetCovenantsActive` + Product State Config. **Any review sweep must filter on it.** | **no — gap** |
| `LLC_BI__Is_Template__c` | Checkbox | — | Template records live in the same table as live covenants. Not filtering inflates every count and due-date sweep. Org VR `Template_Covenants_Cannot_Be_Active` forbids Template + Active together. | **no — gap** |
| `LLC_BI__Required__c` | Checkbox | — | "the FI requires the covenant from the relationship for audit purposes" — in practice, the flag that says this covenant goes into the legal loan agreement. Not a cadence field. | no |
| `LLC_BI__Breached__c` | Checkbox | — | Substantive breach flag, **independent of `Covenant_Status__c`**. | no |
| `LLC_BI__Overdue__c` | Checkbox | — | Timeliness breach (document not delivered). **`Breached` and `Overdue` are two different failure modes that a single "non-compliant" rendering conflates.** | no |
| `LLC_BI__Frequency__c` | Picklist | `Monthly`, `Every 2 Months`, `Quarterly`, `Semi-Annually`, `Annually` | Classic-engine cadence. **Hartwell's `COV-000651` carries `One-Off`, which is not in the 2026_07 value set** — org-added or written through an unrestricted field. | read only |
| `LLC_BI__Frequency_Months__c` | Number *(derived?)* | — | Numeric cadence for date arithmetic. | no |
| `LLC_BI__Frequency_Template__c` | Lookup → **`LLC_BI__Date_Template__c`** | — | Servicing-engine cadence. **Its presence is what makes compliance generation live** — and therefore what makes D2 fire. Null on all 6 Hartwell and all 4 Piedmont covenants; 16 of 639 org-wide. | **no — this is the single field a covenant tool most needs to read** |
| `LLC_BI__Proposed_Frequency_Template__c` | Lookup → `LLC_BI__Date_Template__c` | — | Staged cadence change for a renewal/modification, coexisting with the live one. | no |
| `LLC_BI__Compliance_Days_Prior__c` | **Picklist** | `7`, `14`, `30` | Lead time: the Classic batch generates the compliance row when `Days Until Next Evaluation` **equals** this. **It is a picklist of strings, not a number** — do not do arithmetic on it without casting. | no |
| `LLC_BI__Grace_Days__c` | Number | — | Effective Date + Grace Days = Due Date. A **pre**-due-date buffer, not a cure period. Defaults from `Covenant_Type__c.LLC_BI__Grace_Days__c`. | no |
| `LLC_BI__Effective_Date__c` | Date | — | Schedule anchor. Machine-advanced on each status change. **Writing it is PDI-00023403 (open) and PDI-00016556.** | **never write — correctly held** |
| `LLC_BI__Proposed_Effective_Date__c` | Date | — | Staged future effective date; nCino documents it as origination/credit-action support. | no |
| `LLC_BI__Due_Date__c` | Date | — | Effective + Grace. "**Cannot be edited directly**, recommended approach is to adjust the Due Date on the Covenant Compliance record." | no |
| `LLC_BI__Next_Evaluation_Date__c` | Date | — | Classic-engine "what's coming due". Advanced only on a `Pending` → `Compliant`/`Waived`/`Exception` transition (`kb:kAHHu000000XZOTOA4`). | read only |
| `LLC_BI__Last_Evaluation_Date__c` | Date | — | Staleness signal; written by the managed flow from the compliance row's LastModifiedDate. | read only |
| `LLC_BI__Days_Until_Next_Evaluation__c` / `_Days_Past_Next_Evaluation__c` | Number *(formula?)* | — | Countdown / aging. The Classic generator keys off the first. "A proper Covenant should show 0 or NULL in [Days Past]." | no |
| `LLC_BI__Last_Evaluation_Status__c` | **Text**, not picklist | — | Last outcome carried onto the covenant. **Free text — string-matching it against the `Covenant_Status__c` picklist will silently fail.** | read only |
| `LLC_BI__Last_Evaluation_Value__c` | Number | — | Sourced by managed flow from the compliance row's **`Historic Financial Indicator Value`**. This is why writing only `cm_Covenant_Compliance_Indicator_Value__c` leaves it null forever (§3.2). | read only |
| `LLC_BI__Financial_Indicator_Value__c` | Number | — | The current tracked indicator; pairs with `Covenant_Type__c.LLC_BI__Is_Financial_Indicator__c`. | read only |
| `LLC_BI__Document_Source__c` | Picklist | `Tax Return`, `CPA Audit`, `CPA Review`, `CPA Compiled`, `Comp. Prep`, `Projected`, `PFS`, `Other` | Required provenance of the evidence, and ACT's matching key against the Spreads period's source. **A covenant satisfied on `Projected` figures is materially weaker than one satisfied on `CPA Audit` — status alone hides that.** | **no — gap** |
| `LLC_BI__Related_Covenant__c` | Lookup (self) | — | Parent covenant. Financial-indicator covenants hang off a Financial Statement Requirement parent and **inherit its Effective Date and Frequency Template**. Flattening the tree misrepresents the structure. | no |
| `LLC_BI__Linked_Spread_Statement_Record__c` / `_Total__c` | Lookup | — | Binds the covenant to the spread line it tests. **0 of 639 covenants in `bankinggpt` carry one** — the documented Spread → Performance Rule → FI Value chain has never been exercised in this org. | no |
| `LLC_BI__Account__c` | Lookup → `Account` | — | The relationship anchor. Matches our `accountId` requirement. | yes |
| `LLC_BI__Covenant_Type__c` | Lookup | — | Carries Category, Grace Days, allowed Document Sources, requirement template. | no |

#### `LLC_BI__Covenant_Compliance2__c` — "Covenant Compliance" (22 fields; process-bearing subset)

| API name | Type | Picklist values (verbatim) | What it means for process | We write / read? |
|---|---|---|---|---|
| `LLC_BI__Status__c` | Picklist | `Compliant`, `Exception`, `In Progress`, `Pending`, `Waived` | The per-period outcome, and **the transition that drives the entire cadence**. Only a `Pending` → `Compliant`/`Waived`/`Exception` move fires the covenant write-back (`kb:kAHHu000000XZOTOA4`). Live distribution in `bankinggpt`: Exception 101 · Pending 31 · Compliant 2 · null 6. | **WRITE** (`Compliant`/`Exception` only) |
| `LLC_BI__Automated_Testing_Status__c` | Picklist | `Pass`, `Fail`, `Incomplete` | The machine verdict, **separate from the human `Status`**. `Fail` + `Waived` is a legitimate and meaningful pair. `Incomplete` means the test could not run, which is not a failure. | **no — gap (§3.2)** |
| `LLC_BI__Reason_for_Exception__c` | Picklist | `Overdue`, `Breached` | The only two values. **This is the field that separates an administrative miss from a real breach** — and it is what makes 101 of 140 org rows readable at all. | **WRITE** (`Breached` only) |
| `LLC_BI__Associated_Statement_Period_Status__c` | Picklist | `None`, `Associated`, `Unassociated` | Data-readiness gate: whether financials are attached to this period. `None`/`Unassociated` means the test was never evaluable — **reporting that as a pass is a falsehood**. | **no — gap** |
| `LLC_BI__Historic_Financial_Indicator__c` | Number | — | The as-tested value frozen at this period; the source of the covenant's `Last Evaluation Value` and the only per-period trend series. | **no — we write `cm_…` instead (§3.2)** |
| `LLC_BI__Evaluated_Rule__c` | Lookup → `LLC_BI__Covenant_Rule__c` | — | **Which performance-rule version was actually applied.** Without it a historical result cannot be reproduced or defended. 0 of 140 rows in `bankinggpt`. | no |
| `LLC_BI__Associated_Spread_Statement_Period__c` | Lookup → `LLC_BI__Spread_Statement_Period__c` | — | The financials backing the test. 0 of 140 rows in `bankinggpt`. | no |
| `LLC_BI__Earliest_Period_Association_Date__c` / `_Last_Period_Association_Date__c` | Date | — | ACT computes these from the Frequency Template's *Spreads Period Association Range* and they define **which statement periods may legally satisfy this test**. Ignoring them permits satisfying a test with out-of-window financials. | no |
| `LLC_BI__Evaluation_Date__c` | Date | — | When the test was performed. "Manually populated." | **WRITE** (`Date.today()`) |
| `LLC_BI__Evaluated_By__c` | Lookup → `User` | — | Who tested. **Distinct from Approved By — this pair is the segregation-of-duties evidence.** | **WRITE** (`UserInfo.getUserId()`) |
| `LLC_BI__Approved_By__c` / `LLC_BI__Approval_Date__c` | Lookup → `User` / Date | — | Who approved the result or waiver, and when. 5 of 140 rows carry an approver. | no |
| `LLC_BI__Due_Date__c` | Date | — | The current, possibly-extended deadline. The Servicing engine's Exception batch keys off this. nCino's recommended edit point for extending a covenant. | **no — gap** |
| `LLC_BI__Original_Due_Date__c` | Date | — | Pre-extension deadline. **The delta against `Due_Date__c` is the only audit evidence that a deadline was moved.** | no |
| `LLC_BI__Proposed_Extension_Date__c` | Date | — | Extension requested but not granted — a state that is neither compliant nor breached. nCino's recommended extension workflow lives here. | **no — the whole extension path is absent from our tools** |
| `LLC_BI__Exception_Date__c` | Date | — | Starts the exception aging clock. Machine-set by the batch, or "can be populated manually". | **WRITE** (on Exception) |
| `LLC_BI__Effective_Date__c` | Date | — | Start of this compliance period, set at creation. Editing it on the *compliance* row affects only that row: "When you change an Effective Date on a compliance record, the system updates only that compliance. The change does not affect compliance generation." | no |
| `LLC_BI__Period_Key__c` | Text | — | Period identity. Determines which period a row belongs to; behaviour-gating despite being text. | no |
| `LLC_BI__Covenant__c` | **Master-detail** → `LLC_BI__Covenant2__c` | — | The one hard-required field; createable, **not updateable** — set once, never rewritten. Compliance rows cascade-delete with the covenant. | read only (correct) |
| `LLC_BI__Comments__c` | LongText | — | Free text. | **WRITE** |
| `Agentic_AI_Response__c` | TextArea (**org-local**, no namespace) | — | Pre-existing bank field shaped for exactly our output. | **WRITE** |
| `cm_Covenant_Compliance_Indicator_Value__c` | (org-local) | — | Where we put the observed value. **Not the packaged field nCino reads.** | **WRITE** |

#### `LLC_BI__Covenant_Type__c` — the policy layer above the covenant

| API name | Type | Picklist values (verbatim) | Why it matters |
|---|---|---|---|
| `LLC_BI__Category__c` | Picklist | `Financial Statement Requirements`, `Financial Indicators`, `Default Covenant`, `Term Covenants` | **The four-way taxonomy.** Document-delivery obligations, measured ratios, default triggers and term conditions are four different review processes. A tool that treats every covenant as a ratio test mishandles three of the four. Auto-evaluation behaviour also branches on Category (`kb:kAHHu000000XZPZOA4`). |
| `LLC_BI__Is_Financial_Indicator__c` | Checkbox | — | Whether `Financial_Indicator_Value__c` is meaningful at all. |
| `LLC_BI__Financial_Statement__c` | Checkbox | — | Whether satisfaction requires a delivered statement. |
| `LLC_BI__Grace_Days__c` | Number | — | The policy-level default inherited by covenants of this type. |
| `LLC_BI__Document_Sources__c` | **Multiselect** | `Tax Return`, `CPA Audit`, `CPA Review`, `CPA Compiled`, `Comp. Prep`, `Projected`, `PFS`, `Other` | The **allowed set**. Comparing it against the covenant's single chosen `Document_Source__c` is a real compliance check that no tool of ours performs. |
| `LLC_BI__Requirement_Template__c` | Lookup → `LLC_BI__Requirement__c` | — | How a covenant type spawns a document obligation. **Its absence is what raises `CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY` on activation when DocMan sync is on** (D17). |
| `LLC_BI__Version_Identity__c` / `LLC_BI__Instance_Identity__c` | Text | — | The type definition is **versioned**. Evaluating a 2024 covenant against today's type definition is an anachronism. |

#### The covenant graph is wider than two junctions

`find_references` on `LLC_BI__Covenant2__c` returns **eight** children, not two:

| Child | Relationship | Why it matters |
|---|---|---|
| `LLC_BI__Covenant_Compliance2__c` | master-detail | the per-period evaluation |
| `LLC_BI__Covenant_Rule__c` | master-detail | the **performance rules** — operator + FI value + end date |
| `LLC_BI__Account_Covenant__c` | master-detail | relationship attachment |
| `LLC_BI__Loan_Covenant__c` | master-detail | loan attachment |
| `LLC_BI__Covenant_Product__c` | master-detail | product-level attachment |
| **`LLC_BI__Pricing_Covenant__c`** | master-detail | **covenants can drive pricing grids — a breach can carry an immediate margin consequence, not only a reporting one.** Nothing in our design accounts for this. |
| **`LLC_BI__Policy_Exception__c`** | lookup (`LLC_BI__Covenant_Mgmt__c`) | **policy exceptions are tracked as first-class records linked to covenants**, not only as a compliance status. A breach that is accepted may belong here rather than in a `Waived` status. |
| `LLC_BI__Covenant2__c` | self-lookup | parent/child covenant hierarchy |

**Consequence for a bulk review:** a traversal that walks only `LLC_BI__Loan_Covenant__c` misses
relationship-level, product-level and pricing-level covenants. In `bankinggpt` that is not a corner case —
4 of Hartwell's 6 covenants are relationship-level with no loan junction at all.

---

## 2. Collateral review / valuation as nCino intends it

### 2.1 The valuation lifecycle

`mapId:2opWW8UJI0Rg_v6i6wVYoQ`, verbatim:

> "The Collateral Valuation object maintains a historical record of all valuations for each piece of collateral
> throughout its lifecycle. Users can designate which valuation record the system should use for lendable
> value and available lendable value calculations."
>
> "When a user creates a collateral management record, the system automatically generates an associated
> collateral valuation record containing the value from the Value field. **The system marks this initial
> record as the original valuation by selecting the Original Valuation Record checkbox.**"

So the intended shape is:

```
Collateral Mgmt created ──> system creates valuation #1, Original Valuation Record = true
                            (gated on the "Create Original Valuation" system property)
                                          │
              value changes over time     ▼
                            user clicks ADD VALUATION on the related list
                                          │
                            new valuation row: Source, Type, Valuation Date,
                            Collateral Value, Primary, Description
                                          │
                       ┌──────────────────┴───────────────────┐
                       │ Auto-Update Collateral Value = true  │
                       │ on the COLLATERAL TYPE               │
                       └──────────────────┬───────────────────┘
                                          ▼
                            Field Map records copy fields onto the collateral:
                            Valuation Type → Assessment Method
                            Valuation Date → Assessment Date
                            Collateral Value → Value
                                          │
                                          ▼
                            Lendable Value = Value × Advance Rate  (formula)
                            ALV = Lendable Value − Σ current pledge amounts
```

**The three documented preconditions for the auto-update, verbatim** (`mapId:2opWW8UJI0Rg_v6i6wVYoQ`):

> "You must replace the New button with the **Add Valuation** button on the Collateral Valuation related list
> to trigger the automation to update the collateral management record. **The automation does not function if
> you use the New button.**"

> "**Auto-Update Collateral Value**: Select this checkbox to enable automation for that collateral type. Users
> must populate these fields on the valuation record for the auto-update to work: **Collateral Value,
> Valuation Date, Primary Valuation Source OR Primary checkbox when the user has the Collateral Management -
> Edit Primary Valuation permission assigned.**"

> "**Primary Valuation Sources**: Select every acceptable primary valuation source applicable to this
> collateral type. When a user creates a valuation record to update the associated collateral management
> record and they select one of the sources you designated as a primary source, **the system selects the
> Primary checkbox for them**."

And the "latest wins" rule, from `mapId:AxjTjH5MIQKVIp_wnaek5g`:

> "**Valuation Date**: Select the date of the valuation. **The system uses this field to determine the latest
> valuation record.** If you make any further updates to collateral valuation records where you have valuation
> update automation configured, the system uses this date to check to see which collateral valuation record is
> most recent and updates the Value field on the collateral mgmt record."

The field mapping is itself configurable — it lives in **Field Map** records with
`Source Feature = "Collateral Valuation Auto Update"`, `Originating Obj = LLC_BI__Collateral_Valuation__c`,
`Target Obj = LLC_BI__Collateral__c`. So the three-row default map is a default, not a contract.

### 2.2 Advance rates, lendable value, and the pledge

`mapId:AxjTjH5MIQKVIp_wnaek5g`, Key Terms, verbatim:

- **Advance Rate**: "The maximum percentage of collateral value a lender extends for a loan. nCino sets the
  advance rate per collateral type, and you can override it per pledge record."
- **Lendable Value**: "The result when nCino multiplies the collateral value by the advance rate — for
  example, $100,000 x 80% = $80,000. **Lendable Value does not factor in lien amounts.**"
- **Available Lendable Value (ALV)**: "The Lendable Value minus the sum of current pledge amounts. ALV
  represents the equity that remains available to secure additional loans. nCino factors in lien amounts when
  pledges have converted to liens."
- **LTV**: "loan amount or principal balance divided by the total value of all pledged collateral."
- **Collateral Coverage**: "A percentage that shows how much of a single piece of collateral's value nCino
  allocates across all loans to which you pledge it."

Advance-rate precedence, from `mapId:pkyVk2ipvqJgYnho~Uyqxg` and the pledge formula recorded at
`repo:knowledge/LESSONS-NCINO-APEX.md` §7 item 29:

```
pledge Advance_Rate_Override__c
  ↳ else Auto_Applied_Advance_Rate__c  (Matrix Manager; matrix by collateral type × product line × geography)
      ↳ else Collateral__r.Collateral_Type__r.Advance_Rate__c   (the type default)
```

> "**The advance rate value must be a numeric percentage (for example, 80, not 0.80). If no row matches the
> collateral being pledged, the system uses the default advance rate on the Collateral Type record instead.**"
> (`mapId:pkyVk2ipvqJgYnho~Uyqxg`)

Pledging rules that a valuation tool has to respect on the read side (`mapId:AxjTjH5MIQKVIp_wnaek5g`):

- "Amount Pledged defaults to the lesser of the Available Lendable Value (ALV) or the loan amount."
- "**Do not pledge both parent and child collateral records to the same loan, because the system then counts
  the collateral value twice.**"
- "**Authorize Pledge Amount**: Select the checkbox **only** if you pledged more than the current lendable
  value."
- "**Abundance of Caution**: … the system sets the pledge amount to $0 and excludes this collateral from
  loan-to-value, total collateral value, and total amount pledged calculations. **A loan with only Abundance
  of Caution pledges remains classified as unsecured.**"

### 2.3 Collateral status, and what nCino explicitly does NOT automate

> "The collateral status specifies the collateral pledged status as either Pending (incomplete or collateral
> not yet available to pledge), Available, or Released (lien released). **Note: There is no automation around
> these statuses. You must manually update them.**" (`mapId:AxjTjH5MIQKVIp_wnaek5g`)

### 2.4 Revaluation triggers — the fields exist, the automation and the guidance do not

**Correction to a claim I made earlier in this draft and to `repo:knowledge/ACTIONS-DESIGN.md` §5.5.**
nCino **does** ship a revaluation-cadence field pair on `LLC_BI__Collateral__c`:

| API name | Type | Values (verbatim) |
|---|---|---|
| `LLC_BI__Valuation_Frequency__c` | Picklist | `Daily`, `Weekly`, `Monthly`, `Quarterly`, `Semi-Annually`, `Annually`, `Biennial` |
| `LLC_BI__Next_Revaluation_Due_Date__c` | Date | — |

Neither appears in any user or configuration article I read. The gap is therefore narrower and sharper than
"nCino has no revaluation concept":

| Thing looked for | Found? | Detail |
|---|---|---|
| A revaluation-cadence **field** | **YES** | `Valuation_Frequency__c` + `Next_Revaluation_Due_Date__c` (schema, release 2026_07). Note the value set is **wider than the covenant frequency set** — it adds `Daily`, `Weekly`, `Biennial` and drops `Every 2 Months`. **Do not share one frequency enum across the two domains.** |
| Documented **automation** that advances `Next_Revaluation_Due_Date__c` | **NO** | No article names either field. There is no documented generator analogous to `CovenantComplianceBatchUpdater`. **UNVERIFIED** whether anything writes it at all, or whether it is a purely manual field. |
| Documented **guidance** on *when* to revalue | **NO** | The user guide says only "If the value of a piece of collateral changes, you can create a new collateral valuation record". The values that go in `Valuation_Frequency__c` are entirely a bank decision. |
| An appraisal-ordering workflow | **NO** | The words "appraisal"/"appraiser" appear nowhere in nCino's Service Management documentation (`repo:knowledge/ACTIONS-DESIGN.md` §7 item 13). `Appraisal` exists as a *Valuation Source* value and `Outside Appraisal` / `Limited Appraisal` as *Assessment Method* values — labels, not a process. |
| Independence / USPAP / appraisal-review controls | **NO** | Nothing. |
| A borrowing-base object or feature | **NO** | `borrowing base` returns only Continuous Credit Monitoring and Banking Advisor articles, and the known-issues sweep found **zero** borrowing-base defects (all hits were about *borrowers*). The nearest structure is **Collateral Groups**, whose supported scenarios include "**borrowing-based lease lending**" and cross-collateralization (`mapId:AxjTjH5MIQKVIp_wnaek5g` FAQ) — a grouping mechanism, not an eligible-base formula. No ineligibles, no dilution, no advance formula. |

**A revaluation has a cost attached.** `find_references` on `LLC_BI__Collateral_Valuation__c` returns exactly
one child: **`LLC_BI__Fee__c`**. Appraisal and valuation fees are tracked against the valuation record, so
any automated "just revalue it" logic has a billable consequence. Nothing in our tools surfaces that.

**In `bankinggpt`, the borrowing base is modelled as a covenant** — Hartwell's `cov_bbc` (`COV-000650`,
covenant type "Accounts Receivable", 80% AR / 50% inventory, Monthly)
(`repo:knowledge/DEMO-RELATIONSHIP.md`). That is a reasonable modelling choice, and it is *ours*, not nCino's.

### 2.5 What nCino says happens to collateral on a credit action

`mapId:AxjTjH5MIQKVIp_wnaek5g`, FAQ, verbatim:

> "**What happens to collateral pledges when a loan is renewed or modified?** When you renew or modify a loan
> using Credit Actions, the system automatically clones active pledge records to the new loan. Before the
> renewed loan is booked, the cloned pledge status shows as Pending. Once the renewed loan is booked, the
> system marks the original pledge as Inactive and the new pledge as Active. If the credit action is declined
> or withdrawn, the system sets the cloned pledge to Inactive, and the original pledge remains Active."

Note what is *not* said: nothing about the Loan Collateral Aggregate. That gap is where
`kb:kAHHu000000XadDOAS` lives — see the DANGER REGISTER.

### 2.6 Field-by-field interpretation — valuation, collateral, pledge

#### `LLC_BI__Collateral_Valuation__c` — the object we write (14 fields, all listed)

| API name | Label | Type | Picklist values (verbatim) | Process meaning | We write it? |
|---|---|---|---|---|---|
| `LLC_BI__Collateral__c` | Collateral | **Master-detail** | — | The only structural requirement. Valuations cascade-delete with the collateral. | **yes**, required in Apex |
| `LLC_BI__Value__c` | Collateral Value | Currency | — | The valued amount. Named in the config doc as a required input for the auto-update. | **yes**, required in Apex |
| `LLC_BI__Type__c` | Valuation Type | Picklist | `Actual Cash Value`, `As Complete Value`, `As Is Value`, `As Stabilized Value`, `Balance Sheet`, `Book Value`, `Cash Balance`, `Contents Value`, `Fair Market Value - Real Estate`, `Fair Market Value - Equipment / Transportation`, `Net Orderly Liquidation Value`, `Orderly Liquidation Value`, `Preliminary Value`, `Purchase Price`, `Replacement Cost Value`, `Waived Value` | **The valuation basis.** These are not comparable to one another — trending raw `Value__c` across mixed types is meaningless, and `As Complete` vs `Orderly Liquidation` is a category difference, not a rounding one. Note `Preliminary Value` and `Waived Value` are explicitly non-final bases. Maps to the collateral's `Assessment Method`. | optional, validated against the org |
| `LLC_BI__Source__c` | Valuation Source | Picklist | `Account Balance / Statement`, `Appraisal`, `Credit Officer`, `Financial Statement`, `Insurance Agent`, `Internal Valuation`, `Inventory Report`, `Invoice / Bill of Sale`, `Real Estate Abundance of Caution`, `Receivables Aging`, `Real Estate Evaluation`, `Real Estate Restricted Appraisal`, `Third Party Source`, `Valuation Service Vendor` | **Provenance and independence.** `Credit Officer` / `Internal Valuation` are self-assessed; `Appraisal` / `Valuation Service Vendor` are independent. Regulatory defensibility turns on this. nCino checks it against the Collateral Type's `Primary Valuation Sources` and auto-ticks Primary on a match. | optional, validated against the org — **but never checked against the type's primary-source list** |
| `LLC_BI__Valuation_Date__c` | Valuation Date | Date | — | **"The system uses this field to determine the latest valuation record."** Named as a required input for the auto-update. Drives staleness against `Collateral.Next_Revaluation_Due_Date__c`. | **optional in our tool — this is the divergence in §3.3** |
| `LLC_BI__Primary__c` | Primary | Checkbox | — | Which valuation governs. Multiple valuations coexist; only the primary should flow to the collateral value. | **yes**, from the caller's boolean |
| `LLC_BI__Active__c` | Active | Checkbox | — | Whether the valuation is still in force. Superseded valuations remain on the record but inactive. Defaults **false**. | **yes**, hard-coded `true` |
| `LLC_BI__Original_Value__c` | **Original Valuation Record** | **Checkbox** | — | **Not a currency amount despite the API name.** Marks the system-generated first valuation created with the collateral. It is the drift baseline. Setting it on a revaluation corrupts the audit trail. | **yes**, hard-coded `false` — correct |
| `LLC_BI__Collateral_Type_SubType__c` | Collateral Type-SubType | Text | — | Type/subtype snapshot, so a historical valuation keeps its original type context. | no |
| `LLC_BI__Valuation_Description__c`, `_Details__c`, `_Raw_Valuation_Details__c`, `LLC_BI__Comments__c`, `LLC_BI__lookupKey__c` | — | Text | — | Descriptive. | description only |

#### `LLC_BI__Collateral__c` — "Collateral Mgmt" (179 fields; the process-bearing subset that matters here)

| API name | Type | Picklist values (verbatim) | Process meaning | We use it? |
|---|---|---|---|---|
| `LLC_BI__Collateral_Type__c` | Lookup, **required** | — | The only required field on the object. Carries the advance rate, `Auto-Update Collateral Value`, `Primary Valuation Sources`, and the valuation field set. | **no — gap** |
| `LLC_BI__Status__c` | Picklist | `Pending`, `Available`, `Released` | Lifecycle. `Released` is terminal. **No automation — humans maintain it.** Valuing a Released asset is meaningless. | **no — gap** |
| `LLC_BI__Value__c` | Currency | — | The headline value. Written only by the auto-update, never by us. | read |
| `LLC_BI__Advance_Rate__c` | Percent *(formula in this org)* | — | Resolves to `Collateral_Type__r.Advance_Rate__c` only — **reads 80% on Hartwell assets whose pledges are overridden to 50% and 75%.** Never mix with the pledge-side rate. | no |
| `LLC_BI__Lendable_Value__c` | Currency *(formula)* | — | Value × the collateral-side advance rate. Same mixing hazard. | read |
| `LLC_BI__Liquidation_Value__c` | Currency | — | Downside/recovery value — the number that matters in a workout, not FMV. | no |
| `LLC_BI__Loans_To_Value__c` | Percent | — | **API name says LTV; the label says "Collateral Coverage". These are reciprocals.** Highest-risk field on the object for silent misinterpretation — verify direction against live data before ever surfacing it. | no |
| `LLC_BI__Remaining_Lendable_Value__c` | Currency | — | **Labelled "Proposed Available Lendable Value".** The API name invites reading it as a booked figure. | no |
| `LLC_BI__Booked_Available_Lendable_Value__c` | Currency | — | Unencumbered lendable value on **booked** facilities. The booked counterpart of the above. | no |
| `LLC_BI__Combined_Percent_Pledged__c` | Percent | — | Over-pledge detection across all facilities. Invisible from any single pledge row. | no |
| `LLC_BI__Total_Collateral_Rollup_Value__c` / `_Lendable_Value__c` / `LLC_BI__Collateral_Rollup_Count__c` | Currency / Number | — | Hierarchy rollups. **Null on Hartwell and Piedmont alike** — written by an nCino batch that has never run in this org. Double-counts if you also sum children. | no |
| **`LLC_BI__Valuation_Frequency__c`** | Picklist | `Daily`, `Weekly`, `Monthly`, `Quarterly`, `Semi-Annually`, `Annually`, `Biennial` | **The revaluation cadence field nobody documents.** See §2.4. | **no — gap** |
| **`LLC_BI__Next_Revaluation_Due_Date__c`** | Date | — | **The deadline that makes a valuation stale — the natural driver of a valuation work queue.** No documented automation writes it. | **no — gap** |
| `LLC_BI__Appraisal_Date__c` | Date | — | **Labelled "Assessment Date".** The target of the documented `Valuation Date → Assessment Date` field map. Staleness anchor. | no |
| `LLC_BI__Assessment_Method__c` | Picklist | `Estimate`, `Purchase Price`, `Limited Appraisal`, `Outside Appraisal`, `J.D. Power`, `Tax Card`, `Other` | Rigour of the valuation, and the target of the `Valuation Type → Assessment Method` field map. `Estimate` vs `Outside Appraisal` is a regulatory-defensibility difference, not a cosmetic one. | no |
| `LLC_BI__isFutureContext__c` | Checkbox | — | **The booked-vs-proposed discriminator.** Not filtering it mixes hypothetical scenario collateral into actual coverage. | **no — gap** |
| `LLC_BI__Is_Copy__c` | Checkbox | — | Scenario duplicates share the table. Aggregates double-count without this filter. | **no — gap** |
| `LLC_BI__UCC_Expiration_State__c` / `_County__c` | Date | — | **Two independent lien-perfection lapse clocks.** Letting either pass forfeits secured status regardless of collateral value. Hartwell's liens carry a 2029-03-15 UCC expiry. | no |
| `LLC_BI__Debt_Secured__c` | Picklist | `Guarantor's debt`, `Only this debt for the applicant`, `This debt and all associated debts for the applicant with this organization`, `This debt and any future debts for the applicant with this organization` | Scope of the security interest — determines whether this asset may be counted against other facilities. | no |
| `LLC_BI__Secures_Future_Advances__c` | Checkbox | — | Cross-collateralisation to future debt; materially changes headroom. | no |
| `LLC_BI__Insurance_Expiration_Date__c` | Date | — | Lapsed insurance is a condition breach and impairs recovery value. | no |
| `LLC_BI__Spousal_Consent__c`, `LLC_BI__Has_Authority__c` | Checkbox | — | Enforceability gates. Collateral that cannot be enforced has no recovery value whatever it is worth. | no |
| `LLC_BI__Purchase_Money__c` | Checkbox | — | PMSI status overrides normal first-to-file lien priority. | no |
| `LLC_BI__Certificated__c` / `LLC_BI__Book_Entry__c` | Checkbox | — | Determine the perfection method for securities (possession vs control agreement). | no |
| `LLC_BI__Parent_Collateral__c` / `LLC_BI__Highest__c` | Lookup (self) | — | Hierarchy. Max depth 5; performance degrades beyond that. "Do not pledge both parent and child collateral records to the same loan, because the system then counts the collateral value twice." | no |
| `LLC_BI__Legacy_Collateral__c` | Lookup → `LLC_BI__Loan_Collateral__c` (**old** object) | — | v1→v2 migration bridge. Signals possible dual representation of the same asset. | no |

#### `LLC_BI__Loan_Collateral2__c` — "Collateral Pledged" (42 fields; the pledge-side truth)

Two master-details (`Collateral__c`, `Loan_Collateral_Aggregate__c`) plus a required `Loan__c` lookup.
**An aggregate layer sits between pledges and the loan — coverage is computed at the aggregate, not by
naively summing pledges.**

| API name | Type | Picklist values (verbatim) | Process meaning | We use it? |
|---|---|---|---|---|
| `LLC_BI__Pledged_Status__c` | Picklist | `Active`, `Inactive`, `Pending`, **`Credit Actioned`** | Pledge lifecycle. **`Credit Actioned` is a fourth state a three-state model silently drops.** Renewal clones land at `Pending`, flip to `Active` on booking, and the original flips to `Inactive`. | no (we filter on `LLC_BI__Active__c`) |
| `LLC_BI__Active__c` | Checkbox | — | Second activity gate alongside the status. Both must be respected. | **yes** (anchor query) |
| `LLC_BI__Is_Primary__c` | Checkbox | — | Principal collateral for the facility. | **yes** (anchor ordering) |
| `LLC_BI__Abundance_of_Caution__c` | Checkbox | — | **AOC collateral is documentation-only: pledge amount forced to $0 and excluded from LTV, total collateral value and total pledged. A loan with only AOC pledges remains unsecured.** Counting it overstates security. | **no — gap in the anchor query** |
| `LLC_BI__Is_Excluded__c` | Checkbox | — | Direct "do not count" flag, independent of active status. 3 of Piedmont's 5 pledges carry it. | **no — gap in the anchor query** |
| `LLC_BI__Advance_Rate__c` | Percent *(formula)* | — | **The single source of truth for the effective rate.** The formula already resolves override → auto-applied → type default. Read this side, always. | no |
| `LLC_BI__Advance_Rate_Override__c` + `LLC_BI__Override_Reason__c` | Percent + LongText | — | **Presence of an override value means a policy exception was exercised, and the reason is its audit evidence.** Org VR `Advance_Rate_Override` requires the reason whenever the override is set. | no |
| `LLC_BI__Auto_Applied_Advance_Rate__c`, `LLC_BI__Matrix_ID__c`, `LLC_BI__Matrix_Version__c` | Percent / Text | — | Which advance-rate matrix and **which version** produced the rate. Historical decisions are irreproducible without the version. | no |
| `LLC_BI__Amount_Pledged__c` | Currency | — | **The facility's actual slice.** Relationship-level math dedupes by collateral; facility-level math divides this. Never sum `Current_Lendable_Value` across facilities. | read |
| `LLC_BI__Current_Lendable_Value__c` | Currency | — | **The WHOLE collateral's lendable value, not the facility's slice.** Summing it across facilities claimed 59.2MM of a 31.6MM pool on Hartwell. | read (with the correct math) |
| `LLC_BI__Original_Lendable_Value__c` | Currency | — | **The deterioration baseline.** Current value in isolation shows no trend; the delta is the single most useful number in a collateral review — and we compute nothing from it. | **no — gap** |
| `LLC_BI__Authorize__c` | Checkbox | — | Approval gate: set only when the pledge exceeds current lendable value. Org VR `Pledge_More_Than_Lendable_Value` enforces it. | no |
| `LLC_BI__Lien_Position__c` | Picklist | `1st`, `2nd`, `3rd`, `Other` | Priority of the claim. Everything about recovery economics follows from it. | read |
| `LLC_BI__First_/Second_/Third_Lien_Position_Value__c` | Currency | — | The full waterfall, not just a position label. | no |
| `LLC_BI__Total_Prior_Lien_Amount__c` vs `LLC_BI__Total_Superior_Lien_Amount__c` | Currency | — | **Two distinct encumbrance measures** — prior *debt* vs superior *claims* (tax, mechanics' liens). Treating them as synonyms understates what ranks ahead of the bank. nCino's own booked LTV formula uses the superior figure. | no |
| `LLC_BI__End_Date__c` | Date | — | **A pledge can expire while both the collateral and the loan remain active.** | no |
| `LLC_BI__Is_Booked_Pledge_Rollup_Eligible__c`, `LLC_BI__Is_Collateral_Value_Rollup_Eligible__c` (**labelled "Is Proposed Pledge Rollup Eligible"**), `LLC_BI__Is_Collateral_Count_Rollup_Eligible__c` | Checkbox ×3 | — | **nCino's own inclusion rules for booked, proposed and count aggregates.** Recomputing totals without honouring them produces figures that disagree with the platform's. | **no — gap in `Customer360Exposure`** |
| `LLC_BI__Loan_Collateral_Aggregate__c` | Master-detail | — | `updateable: false` — set once. Re-updating an sObject returned by `insert` dies on it (D21). | read |

---

## 3. Comparison against our Apex

### 3.1 `StageCovenantReview`

`repo:knowledge/sf-build-v2/wp2/classes/StageCovenantReview.cls`

| | |
|---|---|
| **Matches nCino** | Refuses to create compliance rows — correct, generation is managed automation (`kb:kAHHu000000XZRJOA4`). Requires `accountId` and states "Covenants attach to the relationship, not to the product package" — matches `kb:kAHHu000000XZTaOAO` exactly. Warns that the parent covenant's Effective Date is never touched — matches the machine-advanced-Effective-Date model. Zero domain DML at stage time. |
| **Diverges — result vocabulary** | `RESULTS = {'Compliant','Exception'}`. nCino's complete-status set is **`Compliant, Waived, Exception`** (the `Covenant Compliance Record Create Trigger Statuses` system property default, `kb:kAHHu000000XZRJOA4`), and `Waived` is a first-class outcome of a covenant review. **We cannot express a waiver.** A banker who waives must leave the tool, and the audit ledger will not carry the decision. |
| **Diverges — no availability predicate, and it costs twice** | The tool validates only that the compliance record *exists and is visible*. It does not check the compliance `Status`, and it does not read the parent covenant at all (`ExecuteCovenantReview.readCompliance` selects `Id, Name, Status, Covenant__c, Agentic_AI_Response__c`). Two distinct consequences: **(a)** nCino's own engine refuses to re-test a row already at Waived/Exception/Compliant (`mapId:FE_EonXfEU5WbW_VcgN7kw`); we will happily re-transition one, which is a second entry into a "complete" status and therefore a second chance to trigger generation. **(b)** `kb:kAHHu000000XZOTOA4`, verbatim: "*Automation will push the Next Evaluation Date on the associated Covenant Management record when the Status is changed from **"Pending"** to "Compliant", "Waived" or "Exception" — using any other status will prevent the automation from firing.*" So writing `Compliant` onto a row sitting at **`In Progress`** silently does **not** advance the covenant. The write appears to succeed, the schedule does not move, and nothing in our output says so. `repo:knowledge/ACTIONS-DESIGN.md` §5.4 already specifies the predicate — *compliance exists, status ∈ {Pending, In Progress}, parent covenant Active = true* — and the shipped class does not implement it. The predicate should tighten further: **status must be `Pending` for the transition to be fully effective**, and an `In Progress` row should be flagged, not silently written. |
| **Diverges — the safety argument is data-dependent, not structural** | The class header asserts "OUR TOOLS CANNOT START THE BANK'S APPROVAL CHAIN BY CONSTRUCTION", on the ground that `acnpex_covenantApprovalProcess` is create-triggered and we only update. That is true of *our* DML. It is not true of the transaction. Three independent nCino sources say that moving a compliance row into a complete status is what makes the platform **create the next compliance row** — and that create fires the approval flow, which has zero entry filters: `kb:kAHHu000000XZRJOA4` ("new Compliances will create when the previous Compliance is moved to a status outlined in the Record Create Trigger Statuses system property"); **PDI-00023403**, which describes the sequence in the vendor's own words ("*marks the current Pending Covenant Compliance as Compliant, **the system generates the next Covenant Compliance record***"); and `kb:kAHPY00000055lR4AQ` ("*The system treats Exception as a complete, terminal status. **As a result, the system creates the next Covenant Compliance record** and advances the covenant*"). See DANGER REGISTER **D2**. |
| **Ignores fields that carry process meaning** | `LLC_BI__Historic_Financial_Indicator__c` (we write the local `cm_Covenant_Compliance_Indicator_Value__c` instead — see 3.2), `LLC_BI__Automated_Testing_Status__c`, `LLC_BI__Evaluated_Rule__c`, `LLC_BI__Associated_Spread_Statement_Period__c`, `LLC_BI__Due_Date__c` / `Original_Due_Date` / `Proposed_Extension_Date` (the entire extension path), `LLC_BI__Approved_By__c` / `cm_Approver__c`. |
| **Warning text to correct** | Warning 1 ("does not start the bank's covenant approval chain") is not safe to state unconditionally — qualify it with "for covenants with no Frequency Template". Warning 4 ("Recording an exception marks the covenant as breached … That is a reporting state, not a waiver") is *good* and should stay, but should add: an `Exception` in nCino is frequently **administrative** (Due Date passed, nothing tested), so writing Exception to mean "financial breach" collides with the org's existing 101 administrative exceptions. |

### 3.2 `ExecuteCovenantReview`

`repo:knowledge/sf-build-v2/wp2/classes/ExecuteCovenantReview.cls`

| | |
|---|---|
| **Matches nCino** | Writes `LLC_BI__Evaluation_Date__c` — sanctioned, "Evaluation Date: Manually populated" (`kb:kAHHu000000XZRJOA4`). Writes `LLC_BI__Exception_Date__c` on Exception — sanctioned, "It can be populated manually". Pass→Compliant / Fail→Exception matches the ACT mapping table verbatim (`mapId:FE_EonXfEU5WbW_VcgN7kw`). Re-reads the target before the resumed write; `stripInaccessible` + `update as user`. Reports the org-assigned `Name` rather than echoing input. |
| **Diverges — the observed value lands in a local field** | We write `cm_Covenant_Compliance_Indicator_Value__c`. nCino sources the covenant's `Last Evaluation Value` from **`LLC_BI__Historic_Financial_Indicator__c`** ("The system updates this field with the Historic Financial Indicator Value from the most recently tested covenant compliance", `mapId:JcmtOww8Pe03jJQFdMSeHA`). Consequence: **the number we measured is invisible to every packaged nCino surface** — the Covenant Details flyout, the covenant's Last Evaluation Value, the CCM Covenants tab, and every standard covenant report. Cheap fix: write both fields, or write the packaged one and mirror to `cm_` for the cockpit. |
| **Diverges — no `Automated_Testing_Status__c`** | We are, functionally, an alternative to ACT: a machine evaluates a rule against a figure and produces a verdict. nCino has a field for exactly that verdict and we leave it null. Filling it (`Pass`/`Fail`) would make our assessment legible to nCino's own "full automation" path and to Field History Tracking, which nCino documents as the audit trail for repeated tests. |
| **Diverges — `approvalChainStarted` is hard-coded `false`** | `out.approvalChainStarted = false;` with the comment "Always false." Given D2, this is an assertion the code cannot verify. It should be *computed*: re-query `LLC_BI__Covenant_Compliance2__c WHERE LLC_BI__Covenant__c = :parentId AND CreatedDate > :txStart` after the update and report honestly whether a new row appeared. Same discipline already applied, correctly, to the collateral rollup. |
| **Ignores** | The parent covenant entirely. `anchorName` is set to `String.valueOf(after[0].LLC_BI__Covenant__c)` — an **Id**, not a name, so the banker-facing outcome string can render a raw 18-character key. |
| **Live-run status** | PROBE PENDING. `repo:knowledge/BASELINE-2026-08-20.md` marks execute as founder-gated. Note the gate's stated reason ("fires unrecallable approval email") is about *creation*; the actual blocker for Hartwell is simpler and harder — **Hartwell has zero compliance rows, so the tool has no target at all** (`repo:knowledge/DEMO-RELATIONSHIP.md` §4). |

### 3.3 `StageCollateralValuation`

`repo:knowledge/sf-build-v2/wp2/classes/StageCollateralValuation.cls`

| | |
|---|---|
| **nCino explicitly endorses this approach** | `PDI-00011782` ("nCino only automatically creates Valuation records in USD currency"), workaround verbatim: "**Use custom code to create the valuation record instead of the managed package solution.**" The vendor's own remediation for a packaged limitation is to do exactly what our tool does. |
| **Matches nCino** | Writes a child valuation row and never the collateral's `Value` — correct; `LLC_BI__Lendable_Value__c` is a formula. Validates `Type` and `Source` against the org's live active picklist values (`C360Picklist.activeValues`) — matches nCino's own behaviour of erroring on a source not applicable to the collateral type. Refuses duplicate collateral inside one batch, explicitly because "Two valuations of the same collateral in one batch would race each other for Primary" — a real nCino semantic, correctly identified. Declines sub-collateral creation (PDI-00021908). The `items[]` bulk shape with per-item write/verify/rollup steps is the right structure. |
| **Diverges — `valuationDate` is optional** | nCino names Valuation Date as (a) a **required input for the auto-update to work at all**, and (b) the field "the system uses … to determine the latest valuation record" (`mapId:2opWW8UJI0Rg_v6i6wVYoQ`, `mapId:AxjTjH5MIQKVIp_wnaek5g`). Our `ValuationItem.valuationDate` is unvalidated and inserts null. A null-dated valuation is unorderable in nCino's own latest-wins logic. **Make it required, defaulting to today.** This is also the one uncontrolled variable in Probe 6 (`repo:knowledge/PROBE-LEDGER.md` — the verification query does not report a valuation date on either arm). **Caveat when doing this:** `PDI-00020349` — "*When a user attempts to create two collateral valuations for the same collateral record using the same Valuation Date, the system displays an error: 'System.ListException Duplicate id in list'*" (affected 2025_04, resolved 2025_10). A blanket default-to-today makes same-date collisions the normal case on any org below 2025_10, and it interacts badly with a re-staged plan on the same day. Prefer an explicit caller-supplied date, and refuse a same-collateral-same-date duplicate at stage time the way the tool already refuses duplicate collateral within a batch. |
| **Diverges — `Primary` is taken on trust** | nCino's integrity rule is that Primary follows from the **Collateral Type's `Primary Valuation Sources` list**, and a source not applicable to that type raises an error the user must dismiss deliberately. We never read `LLC_BI__Collateral_Type__c.LLC_BI__Primary_Valuation_Sources__c` and set Primary purely from the caller's boolean. We can therefore file a "Primary" valuation from a source the bank has not designated primary for that collateral type. |
| **Diverges — no demotion of the previous Primary** | We guard against two Primary items inside one batch but do nothing about the existing Primary row on the same collateral. Whether nCino unticks the prior Primary on Add Valuation is **UNVERIFIED** — not stated in either the use or configure article. Hartwell already has 8 valuations, "earliest flagged `Original_Value`, latest flagged `Active` + `Primary`" (`repo:knowledge/DEMO-RELATIONSHIP.md`), so a new Primary filed by our tool produces **two Primary rows on the same collateral** and nothing in our code or in the docs says which wins. |
| **Diverges — no collateral-status precondition** | `LLC_BI__Collateral__c.LLC_BI__Status__c` ∈ Pending / Available / **Released**. Valuing a Released asset is meaningless, and nCino explicitly does not automate the status, so it is a human-maintained fact we can and should read. |
| **Ignores** | `LLC_BI__Collateral_Type__c` (and therefore `Auto_Update_Collateral_Value`, `Primary_Valuation_Sources`, `Valuation_Field_Set`, the type's default advance rate); `LLC_BI__Original_Value__c` on *existing* rows (we set ours to false correctly, but never check that an original exists); the ownership records (`Ownership Percentage`, `Primary Owner`) that are nCino's real relationship anchor for collateral; `LLC_BI__Assessment_Date__c` / `Assessment_Method__c` on the collateral, which are the *targets* of the documented field map. |
| **Warning text to sharpen** | Warning 1 attributes the non-rollup to the Add Valuation button alone. The configure article names **three** conditions — the button, `Auto-Update Collateral Value` on the type, and populated Collateral Value + Valuation Date + Primary/primary-source. Probe 6 controlled for the second (both arms, and all 43 org types are `false` anyway) but **not for the third**. The claim "no headless equivalent" is still the right conclusion to ship, but the honest form is: *three preconditions are documented; we probed two; the third (Valuation Date) was not controlled.* |

### 3.4 `ExecuteCollateralValuation`

`repo:knowledge/sf-build-v2/wp2/classes/ExecuteCollateralValuation.cls`

| | |
|---|---|
| **Matches nCino** | Sets `LLC_BI__Active__c = true` and `LLC_BI__Original_Value__c = false` explicitly — exactly right: the Original Valuation Record checkbox is reserved by nCino for the system-generated first valuation at collateral creation, and setting it on a revaluation would corrupt the audit trail. Re-reads every target before writing. **Re-reads the parent collateral after the insert and reports honestly whether the value moved** — this is the single best-designed thing in the suite and it is now doc-confirmed as permanently correct. One DML for N rows. |
| **Diverges — no batch cap** | `items[]` is unbounded. See DANGER REGISTER D8: with 24 org-local `*CDC` triggers each enqueueing an `EventBridgeCallout` queueable **per record**, an N-item batch enqueues N queueables in one synchronous transaction against a hard platform limit of 50. An items[] call of 51+ raises `Too many queueable jobs added to the queue` and the whole insert rolls back. **This is a live, un-capped exposure on a deployed tool.** |
| **Diverges — `terminalState` can read `success` on a partial truth** | The verify step reports `filed_unverified` per item, but the batch-level `r.outcome` for the multi-item no-move case is a fixed sentence asserting "No collateral value moved: nCino binds that update to the Add Valuation button" — it asserts the *reason* rather than reporting the *observation*. Keep the observation, drop the causal claim from the per-run string (it belongs in the plan warning, where it already is). |
| **Ignores** | `LLC_BI__Valuation_Date__c` is written from the plan but never validated (§3.3). No write to, or read of, the pledge side — so a revaluation that would change `Available Lendable Value` for other facilities sharing the asset produces no signal. Three of Hartwell's four assets are pledged to two facilities each (`repo:knowledge/LESSONS-NCINO-APEX.md` §7 item 28), so this is not hypothetical. |

### 3.5 How the planned package-scoped bulk covenant review should be shaped

**Does nCino evaluate covenant-by-covenant, on a cadence, with individual compliance rows?** Yes,
unambiguously. One compliance row per covenant per period; the row is the unit of assessment; the status
transition on that row is the unit of action. The Product Package is a **read-only aggregation** of the
covenants on its loans and "the user still needs to manage the covenants at the individual loan or
Relationship level" (`kb:kAHHu000000XZTaOAO`).

**Therefore a package-scoped "bulk covenant review" is N compliance assessments under one governed plan, and
must not be modelled as a single package-level verdict.** Concretely:

**Resolution (read side).** Package → loans (`LLC_BI__Loan__c.LLC_BI__Product_Package__c`) →
`LLC_BI__Loan_Covenant__c` → covenants; UNION the relationship-level covenants reached through
`LLC_BI__Account_Covenant__c` for the package's borrower(s). **Dedupe by covenant Id** — nCino's stated best
practice is one covenant linked to many loans ("The ability to link multiple loans to a single Covenant
record is a best practice that saves time and eliminates duplicate covenant entries"), so a naive
loan-by-loan fan-out double-counts. Note the org shape: Hartwell has 6 covenants and only 2 loan junctions,
so 4 of 6 are relationship-level only and would be *missed* by a loans-only traversal.

**Eligibility, per covenant.** Adopt ACT's published rule verbatim as the predicate:

- covenant `Active = true`
- an open compliance row exists with `Status ∈ {Pending, In Progress}` — pick the one with the earliest
  `Due Date`
- exclude rows already at `Compliant`, `Waived`, `Exception`

**Covenants with no open compliance row are reported, not skipped and not fixed.** The honest per-item state
is `not_assessable`, reason: *"no compliance row exists; nCino generates them only for an Active covenant
with a Frequency Template and an Effective Date, and this covenant has no Frequency Template."* Creating one
is forbidden (D1). This is the state **all six Hartwell covenants are in today**, which means a bulk covenant
review on Hartwell currently returns six honest refusals and zero writes — and that is the correct behaviour,
not a failure.

**Plan shape.** One `cm_Action_Staging__c` row, one plan hash, one single-use decision token — the shape
`StageCollateralValuation` already proves. Three steps per covenant, namespaced `item<n>.`:
`write_assessment_<n>` → `write_status_<n>` → `verify_<n>`, plus **one new step type per item**:
`observe_generation_<n>`, which re-queries for a newly created compliance row on the same covenant after the
status write and reports whether the cadence advanced and whether an approval was raised. Do not assert
`approvalChainStarted = false`; measure it.

**Per-item isolation.** Item 3 failing must not discard 1, 2, 4 — the pattern already implemented for
valuations.

**Hard cap, with three independent reasons to stack them:**

| Constraint | Number | Source |
|---|---|---|
| Queueable jobs per synchronous transaction | **50** (platform) — and the org's `*CDC` triggers enqueue one per record on 24 objects | `repo:knowledge/EVIDENCE-SEPT4.md`; Salesforce governor limits |
| Covenants per loan | 49 | `kb:kAHHu000000XZSSOA4` via `repo:knowledge/ACTIONS-DESIGN.md` §5.4 |
| Loans per credit action from the Credit Actions page | 250 | `mapId:oCOdPaJSYrwRfbKN2zNqFg` |

**Recommend a cap of 20 compliance rows per execute transaction**, with an explicit, resumable continuation
rather than a silent truncation. 20 leaves headroom for the 3 triggers on the compliance object, the ACNPEX
calculation flow on the parent, and any managed-trigger generation of the *next* row (which is itself a
second insert into a CDC-triggered object, doubling the enqueue count per item in the worst case).

**Confirmation copy.** The confirm gate must name (a) how many covenants will be assessed, (b) how many are
being refused and why, (c) that a status write may advance the schedule and mint the next compliance row, and
(d) for any One-Time / One-Off covenant, that a Compliant verdict **deactivates the covenant permanently**.

---

## 4. Where policy is still needed — the judgment gaps nCino does not fill

**Verdict: a bank policy pack is still required, and it is not a thin one.** nCino supplies a schedule
engine, a state machine, an audit trail and aggregation surfaces. It does not supply a single threshold,
cadence rule for collateral, escalation criterion, or definition of materiality. The list below is what a
policy pack must carry; every row is a gap I could not close from nCino documentation.

### 4.1 Covenant

| Gap | Why nCino cannot answer it |
|---|---|
| **Cure periods** | nCino has no cure concept at all. Grace Days is a pre-due-date buffer (`Effective Date + Grace Days = Due Date`), documented as such. There is no field for "days to cure after breach", no state between Exception and resolution. |
| **Waiver authority and waiver scope** | `Waived` is a status. Nothing records who may waive, at what exposure, for how many consecutive periods, with what compensating control, or when a waiver expires. Gold Standard is explicit that "a covenant could register as Compliant based solely on the status change". |
| **Materiality: financial breach vs administrative overdue** | The Exception batch updater forces `Exception` when a Due Date passes regardless of whether anything was measured. `Reason for Exception` distinguishing `Breached` from `Overdue` is **org-local data in `bankinggpt`**, not a documented nCino picklist. The rule that says which one triggers what is entirely bank. |
| **Escalation and watch-list triggers** | CCM supplies EWS bands (No Action 0–0.1, Early Warning 0.1–1, Action Needed 1–2) and the deterioration transitions that fire an asynchronous Agentic Review. It does **not** supply the thresholds: the Agentic Review approval routing is explicitly "**FI-defined thresholds**" on Total Exposure and Risk Rating. |
| **Consecutive-breach / trend rules** | No object models a breach streak. `Historic Financial Indicator Value` is a single value on a single row; trend analysis exists only in CCM's dashboards, not as a policy gate. |
| **Compliance Days Prior defaults** | "automatically populated upon creation according to the **field dependency settings** on the Covenant Mgmt Object. For example, annually evaluated Covenant records are usually set to display 30." The example is illustrative; the mapping is FI configuration. |
| **Which covenant types are Required (go into the legal agreement)** | Gold Standard describes the `Required` checkbox as an instruction to the loan closer, notes its OOTB automation contradicts common practice, and reports that many admins replace it with a custom field. Pure policy. |
| **Whether a breach forces a downgrade / PLM entry** | Problem Loan Management is a container. Its impairment and non-accrual sections are "configurable questionnaire[s]" and the fields are "necessary to determine the specific impairment of the loan in question **to the policy and procedures of your financial institution**". |

### 4.2 Collateral

| Gap | Why nCino cannot answer it |
|---|---|
| **Revaluation cadence and triggers** | The **fields** exist (`LLC_BI__Valuation_Frequency__c`, `LLC_BI__Next_Revaluation_Due_Date__c`) but **no article documents them and no documented automation writes them** (§2.4). nCino supplies two empty boxes. Which assets get `Quarterly` vs `Annually`, what events force an off-cycle revaluation (covenant breach, risk-rating downgrade, modification, a market event), and who pays the `LLC_BI__Fee__c` are all bank rules. |
| **Appraisal ordering, independence, and review** | Absent from nCino entirely. `Appraisal` is a Valuation Source picklist value and nothing more. |
| **Which valuation types and sources are acceptable per collateral type** | `Primary Valuation Sources` is a per-Collateral-Type configuration field the bank populates. nCino ships the mechanism and no content. In `bankinggpt` it is unpopulated on all 43 types. |
| **Advance rates** | Matrix Manager supplies the lookup structure (collateral type × product line × geography → rate) and zero rates. All 43 types in `bankinggpt` default to 80%, which is a configuration default, not a policy. |
| **LTV limits, over/under-collateralisation thresholds** | CCM's Collateral tab shows "an indicator shows whether utilization is **above the configured threshold**". Configured, not supplied. |
| **Haircuts by asset class, eligibility, ineligibles, dilution** | Not modelled. The advance rate is a single percentage per pledge; there is no eligible-base computation. |
| **Borrowing base** | No nCino feature (§2.4). Collateral Groups is the nearest structure and it is a grouping mechanism, not a formula. |
| **When a modification or renewal *requires* a fresh valuation** | nCino clones pledges on a credit action and says nothing about valuation currency. Entirely bank. |

### 4.3 What the policy pack therefore has to be

Roughly: **nCino answers "when is it due, what state is it in, and who owns it". The policy pack must answer
"what does the number mean, is it material, who may forgive it, and what happens next."** Concretely it needs
to carry, per covenant type and per collateral type: thresholds and operators; the breach-vs-overdue
distinction; cure windows; waiver authority by exposure band; consecutive-breach escalation; revaluation
frequency and its triggers; acceptable valuation sources; advance rates and haircuts; and the LTV / coverage
limits that turn a ratio into an action. None of these has a home in the packaged data model, which means
they live either in bank-local config objects or in our own policy layer — and that decision is itself
unmade.

---

## 5. DANGER REGISTER

Severity: **CRITICAL** = can cause unrecallable external effect or silent data corruption ·
**HIGH** = can fail a live run or produce a false claim to a banker · **MEDIUM** = correctness or hygiene.

| # | Danger | Severity | Threatens | Evidence | Status / mitigation |
|---|---|---|---|---|---|
| **D1** | **Creating a `LLC_BI__Covenant_Compliance2__c` row fires `acnpex_covenantApprovalProcess` unconditionally** — flow-based ApprovalWorkflow, `recordTriggerType: Create`, `filters: []`, `filterFormula: null`, `conditions: []`, stage `entryConditions: null`, step `entryConditions: []` — raising a `stepApproval` work item hard-assigned to the named human `robert.mcclaren@outlook.com`. Unrecallable. Zero filters also means **no `Exclude_Flow` bypass is consulted**. | CRITICAL | any covenant tool that creates | Tooling `SELECT Metadata FROM Flow WHERE Id='301bb00000T6YxZAAV'`; `repo:knowledge/NCINO-FUNCTIONAL-VALIDATION.md` §1.5; `repo:knowledge/PROBE-LEDGER.md` probe 8 | **Held by construction** — A33 forbids creating compliance rows. Keep it that way. |
| **D2** | **Our UPDATE can cause that CREATE indirectly.** Three vendor sources say the same thing. `kb:kAHHu000000XZRJOA4`: "After initial creation, Compliance records are then created **when the previous Compliance is moved to a status outlined in the Record Create Trigger Statuses system property**" (default `Compliant, Waived, Exception`). **PDI-00023403**, verbatim: "When a user modifies the Effective Date on a Covenant Mgmt record and **marks the current Pending Covenant Compliance as Compliant, the system generates the next Covenant Compliance record**…". `kb:kAHPY00000055lR4AQ`: "**The system treats Exception as a complete, terminal status. As a result, the system creates the next Covenant Compliance record** and advances the covenant." `execute_covenant_review` writes exactly `Compliant` or `Exception`. On a covenant with a Frequency Template, our update → managed trigger creates the next row → **D1 fires**. The class headers' claim that the tools "cannot start the bank's approval chain **by construction**" holds only for covenants **without** a Frequency Template. | **CRITICAL** | `ExecuteCovenantReview`, and any bulk version of it | `kb:kAHHu000000XZRJOA4`; `PDI-00023403` (`a2BPY00000ieDEw2AM`, **In Review, unresolved**); `kb:kAHPY00000055lR4AQ`; org: 140/140 compliance rows belong to the 16 templated covenants, 0 belong to the 623 untemplated ones (`repo:knowledge/NCINO-FUNCTIONAL-VALIDATION.md` §1.3) | **OPEN — highest-priority correction in this document.** Latent today only because Hartwell and Piedmont covenants have no Frequency Template. Actions: (a) re-word both class headers; (b) add a stage-time refusal or explicit warning when `LLC_BI__Frequency_Template__c != null`; (c) replace the hard-coded `approvalChainStarted = false` with a post-write re-query for a newly created sibling row; (d) probe on a throwaway templated covenant before this tool is ever pointed at a properly configured org. |
| **D2b** | **A third party can create the compliance row behind us.** `kb:kAHPY00000055lR4AQ`: a Document Manager placeholder moving to `Exception` syncs to the Smart Checklist requirement, which syncs to the Covenant Compliance record, which the system treats as terminal — creating the next row and firing D1. **Nothing we do is involved.** | HIGH | the assumption that we control when the chain fires | `kb:kAHPY00000055lR4AQ` | Relevant if the org enables Covenant Compliance → DocMan placeholder sync (`mapId:rnVvIpqSsPd0bxwutAlOlg`). Verify whether it is on in `bankinggpt` before asserting anything about who can start the chain. |
| **D2c** | **Only `Pending` → terminal advances the covenant.** `kb:kAHHu000000XZOTOA4`: "Automation will push the Next Evaluation Date … when the Status is changed from **'Pending'** to 'Compliant', 'Waived' or 'Exception' — **using any other status will prevent the automation from firing**." Writing `Compliant` onto an `In Progress` row succeeds at the DML level and silently fails to advance the schedule. Related: `PDI-00019014` — a custom status containing the word "Pending" makes the Exception batch update Evaluation Date but **not** Status; `PDI-00017973` — custom statuses get force-overwritten to Exception. | HIGH | `ExecuteCovenantReview` — produces a write that looks successful and is inert | `kb:kAHHu000000XZOTOA4`; `PDI-00019014` (resolved 2025_05); `PDI-00017973` (resolved 2025_02) | **OPEN.** Add the source status to the plan and to the outcome string. Never write a status outside `Pending / Compliant / Waived / Exception`. |
| **D3** | **PDI-00023403 — writing `LLC_BI__Effective_Date__c` on the parent covenant corrupts the compliance schedule.** Full mechanism, verbatim and now confirmed **still open** (Status *In Review*, affected 2026_04, **Resolved In Release blank** as of 2026-08-20): "*When a user modifies the Effective Date on a Covenant Mgmt record and marks the current Pending Covenant Compliance as Compliant, the system generates the next Covenant Compliance record with incorrect dates. The next compliance record uses the covenant's updated Effective Date directly instead of the Frequency Template increment. Additionally, the Effective Date and Due Date on the Covenant Mgmt record do not advance by the frequency increment and remain unchanged.*" Note this is **the same transaction shape as D2** — an Effective-Date write plus a status transition — so the two dangers compound. | CRITICAL | any covenant tool | `PDI-00023403` (`a2BPY00000ieDEw2AM`, **unresolved**); `kb:kAHHu000000XZRJOA4`; `mapId:JcmtOww8Pe03jJQFdMSeHA` | **Held** — no tool writes it. `repo:knowledge/DEMO-RELATIONSHIP.md` correctly notes setting it *once at creation* is normal; the prohibition is on updates. Keep the warning in `StageCovenantReview`. **Design rule to add: never write covenant Effective Date in the same transaction as a compliance status transition.** |
| **D3b** | **The Effective-Date surface is a repeat offender, and two neighbours are also open.** `PDI-00016556` (resolved 2024_10): changing Effective Date on an active covenant then satisfying the outstanding compliance means "*the next covenant compliance record is not automatically generated*"; recovery is deactivate-then-reactivate the covenant. `PDI-00022207` (**affected 2025_11, unresolved**): for **One-Time** frequency templates, updating Effective Date or Grace Days does **not** recalculate Due Date — it must be written manually. `PDI-00016393` (resolved 2024_04): adding a Frequency Template to a covenant that already has a Pending compliance "*updates the covenant record's effective date with the compliance's effective date but does not recalculate the due date*" — i.e. **writing a Frequency Template silently mutates the parent's Effective Date.** | HIGH | any tool that writes Frequency Template, Grace Days or Effective Date; Hartwell's `One-Off` covenant specifically | `PDI-00016556`, `PDI-00022207`, `PDI-00016393` | Reinforces R10's "DO NOT add Frequency Templates to Hartwell" (D16). If anyone ever does, expect the parent Effective Date to move underneath them. |
| **D4** | **Failed background Apex on a credit action produces duplicate modification loans carrying the same loan number.** | HIGH | `stage_/execute_loan_modification`, `stage_renewal` | `kb:kAHHu000000XaJVOA0` via `repo:knowledge/ACTIONS-DESIGN.md` §6.1 | Mitigated by our own idempotency key (`C360ActionStaging.findCompleted`), never by nCino. Verify by re-query after any async action. |
| **D5** | **Renewal clone + Loan Collateral Aggregate.** `Renewal_Fields_To_clone` must include the aggregate field or renewal throws `DUPLICATE_VALUE` on `LLC_BI__Unique_Id__c`; conversely, cloning the aggregate *pointer* onto the child produces the shared-aggregate shape that makes LTV wrong for every loan sharing it. The org's `Fields_To_Not_Clone_Renewal` field set excludes `LLC_BI__Fee_Loan_Aggregate__c` but **not** `LLC_BI__Loan_Collateral_Aggregate__c`. 2 of the org's 43 renewals had a parent carrying an aggregate; both succeeded and **one cloned the pointer**. | HIGH | `stage_renewal` / any future `execute_renewal`; indirectly every collateral read | `kb:kAHHu000000XadDOAS`; `kb:kAHPY0000005A1x4AE`; `repo:knowledge/LESSONS-NCINO-APEX.md` §7 item 33 | **Execution-time risk only** — proven inert at staging time. Re-probe before `execute_renewal` ever unblocks. Do not modify the org's field set. |
| **D6** | **Restricted picklists are enforced against the record type; unrestricted ones are not.** `Acnpex_Statement_Frequency__c` refused `Quarterly` with `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST` because the Financial Ratio record type offers only `Annual` / `Not Annual`. Conversely `LLC_BI__Status__c` on compliance is `restricted = false` and the *data* contains values outside the picklist (Loan `Status` holds `Superseded`, which is not in its picklist). | HIGH | every stage tool that validates a picklist; every read that assumes picklist = closed set | `repo:knowledge/DEMO-RELATIONSHIP.md` §5; `repo:knowledge/ACTIONS-DESIGN.md` §3 rows 7-8 | `C360Picklist.activeValues` validates against the field, not the record type. For a restricted field on a record-typed object this can pass validation and still be refused at DML. Read record-type-scoped values where the field is restricted. |
| **D7** | **Credit actions require the running user to hold a `UserRole`.** The engine refuses with *"User has not been assigned a role."* Fixed for `005bb00000ftouDAAQ` by assigning `Commercial Banking Manager` (`00Ebb000001BAptEAG`), which must be KEPT. | HIGH | `execute_loan_modification`, `execute_renewal`, any credit-action path | `repo:knowledge/EVIDENCE-SEPT4.md`, mod-execute probe 2026-08-20 | Standing precondition. Any new integration user needs a role before its first credit action. |
| **D8** | **24 org-local `*CDC` triggers enqueue one `EventBridgeCallout` Queueable PER RECORD across every object we touch.** Governor math: the platform allows **50** `System.enqueueJob` calls per synchronous transaction. A single-record write is safe; an N-record write is not. **`execute_collateral_valuation` accepts an unbounded `items[]` and inserts them in one DML** — 51+ items raises `Too many queueable jobs added to the queue` and rolls the whole insert back. Each queueable is `AllowsCallouts` → AWS API Gateway, so N items also means N outbound callouts against a third party. | **HIGH** | `ExecuteCollateralValuation` (live, uncapped) · any bulk covenant review · `execute_new_facility` (package + loan + 21 entity-involvement rows for a Hartwell-shaped structure) | `repo:knowledge/EVIDENCE-SEPT4.md`: 24 `*CDC` triggers created 2026-08-03 by Asmita Karve; `EventBridgeCallout` Queueable + AllowsCallouts created 2026-07-30; 116/138 tests failed until `C360TestFixture.NoopCalloutMock` was armed. **Independently corroborated by nCino:** `PDI-00018033` — Product Package approval-process propagation fails with "**Too many queueable jobs**" when the Due Date Calculation system property is enabled, i.e. the platform's own async work already contends for this budget on the objects we write | **OPEN.** Assess per execute path: (1) `execute_collateral_valuation` — **cap `items[]`, recommend 20**; (2) bulk covenant review — cap 20, and remember a status write may trigger a *second* insert (the next compliance row) on another CDC object, so budget 2 enqueues per item; (3) `execute_new_facility` — count the entity-involvement rows before insert; a 21-row borrowing structure plus package plus loan is 23 enqueues, under the limit but with less headroom than it looks. Also note this breaks **every** Apex test suite in the shared org, not just ours — worth telling the program team. |
| **D9** | **The collateral rollup does not fire headlessly and there is no configuration flag that substitutes.** A valuation insert leaves `LLC_BI__Collateral__c.LLC_BI__Value__c` untouched; `LLC_BI__Auto_Update_Collateral_Value__c = true` on the type changes nothing (both arms probed). nCino binds the update to the **Add Valuation** button. | HIGH (as a truth-telling constraint) | `ExecuteCollateralValuation` | `repo:knowledge/PROBE-LEDGER.md` probe 6 (CONFIRMED negative); `mapId:2opWW8UJI0Rg_v6i6wVYoQ` | **Correctly handled** — the `verify_rollup` step and "valuation filed, collateral value unchanged" wording are permanent, not a hedge. Never claim coverage improvement. Residual: the third documented precondition (Valuation Date populated) was **not controlled** in probe 6 — **UNVERIFIED**. |
| **D10** | **Sub-collateral creation fires the parent's validation rules even when nothing changed, and the documented workaround is a UI edit-then-revert with no headless equivalent.** | MEDIUM | any future sub-collateral path | `PDI-00021908` (`a2BPY00000WnkaL2AR`) via `repo:knowledge/ACTIONS-DESIGN.md` §5.5 | **Held** — `StageCollateralValuation` declines sub-collateral explicitly. Keep the refusal. |
| **D11** | **Pledging one collateral to 4+ loans at once errors inside `LLC_BI.LoanCollateral2Trigger`; pledging where a loan lacks a Loan Collateral Aggregate returns a generic "An error has occurred."** | MEDIUM | any future pledge-writing tool | `PDI-00013313`, `PDI-00016167` via `repo:knowledge/ACTIONS-DESIGN.md` §6.2 | Aggregates must exist first; cap concurrent pledges. |
| **D12** | **Async credit-action failure can revert everything silently — records land in the Recycle Bin with no error.** And the automatic rollback does **not** run without the "Credit Actions Delete" permission set, leaving a half-built loan behind. The two known issues contradict each other and no article reconciles them. PDI-00018042 verbatim: without the perm set, "*automatic rollback is not performed and the new loan does not have the related record (e.g. **`LLC_BI__Loan_Collateral2__c`**) linked to the loan*" — **its own repro uses our collateral object in `Async_Relatives_to_Clone`.** Corroborated by `kb:kAHHu000000Xae7OAC`: a previously No-Actioned loan's placeholder record is deleted on renewal/modification, so the running user needs Delete on `LLC_BI__Loan__c`. | HIGH | `execute_loan_modification`, `execute_renewal`; and the collateral state they leave behind | `PDI-00017266` (`a2BHu000003Zf0AMAS`), `PDI-00018042` (`a2BPY000001R0bF2AS`, resolved 2025_01), `kb:kAHHu000000Xae7OAC` | Never trust the synchronous response; re-query for record existence. Assert the *Credit Actions Delete* perm set as a running-user precondition **before** starting, alongside the UserRole check in D7. Test both postures. |
| **D13** | **`acnpex_CreditActionRequest` swallows the real failure reason** (unguarded tail `[… limit 1]` assumes a clone exists), so every no-output failure surfaces as `System.QueryException: List has no rows…` while `failureReasons` is discarded. And **`acnpex_CreditActionRequestSample` is a landmine: it ignores its inputs and runs a real Renewal against hard-coded ids.** | HIGH | any credit-action execute path | `repo:knowledge/LESSONS-NCINO-APEX.md` 15m, 15n | Call `performAction()` and read the result object. Never invoke the Sample class to inspect a shape. |
| **D14** | **A blank compliance `Status` "could cause the automation to error"** (nCino's own words). 6 of 140 rows in `bankinggpt` are blank. | MEDIUM | `ExecuteCovenantReview` reading or writing such a row | `mapId:JcmtOww8Pe03jJQFdMSeHA` | Our write always sets a status, which improves the row. But a *stage* against a blank-status row should say so, because the row may already be mid-error. |
| **D15** | **`Exception` in nCino is frequently administrative, not financial.** The Exception batch updater forces it purely on an elapsed Due Date. 101 of 140 rows in `bankinggpt` are `Exception` with `Historic Financial Indicator = null`, `Evaluated Rule = null`, `Associated Spread Period = null`. | MEDIUM (correctness of every covenant read) | `Customer360Covenants`, the cockpit, any narrative we generate | `kb:kAHHu000000XZRJOA4`; `repo:knowledge/NCINO-FUNCTIONAL-VALIDATION.md` §1.4 | Never render `Exception` as "breached" without checking `Reason for Exception` and whether any value was measured. |
| **D16** | **Generating compliance for Hartwell would immediately manufacture a wall of Exceptions.** Hartwell's covenants carry 2024 effective dates; adding a Frequency Template would make the batch backfill and, per the org's own pattern, mark the flagship relationship non-compliant. And it buys nothing: 0 of 140 rows in this org carry an actual value. | HIGH (demo integrity) | any "fix the data" impulse before a demo | `repo:knowledge/NCINO-FUNCTIONAL-VALIDATION.md` R10 | **Recommendation stands: DO NOT.** |
| **D17** | **Covenant activation error: `CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY` on Save when Active is selected** — raised when no requirement template is associated with the covenant type and the optional Covenant Compliance → Document Manager Placeholder synchronisation is configured. | MEDIUM | any tool that flips a covenant Active | `mapId:JcmtOww8Pe03jJQFdMSeHA`, "Error Handling" | No tool of ours writes `Active` today. If one ever does, pre-check the covenant type's requirement template. |
| **D18** | **ACT has no Apex entry point.** Automated Covenant Testing runs only from the Spreads magic wand, on a **locked** period, and the doc warns "Do not navigate away from the page when you run ACT." Retest "does not associate new or additional covenants". ACT does not support CRE bundles. | MEDIUM | any design that assumes we can trigger nCino's own testing | `mapId:FE_EonXfEU5WbW_VcgN7kw` | We are a *replacement* for ACT in this org (0 spread linkages exist), not a trigger for it. Say so in the tool description. |
| **D19** | **`RevisionStatus` is free text and the data contains both `Superceded` (3) and `Superseded` (1); Loan `Status` contains `Superseded`, absent from its picklist.** Piedmont uses the correct spelling, so **testing against Piedmont alone will not surface this**. | MEDIUM | every chain-walk and state filter | `repo:knowledge/ACTIONS-DESIGN.md` §6.2 | Handle both spellings; never treat a picklist as a closed set on read. |
| **D20** | **Credit-action scale limits:** >250 loans is refused outright from the Credit Actions page; >~10 hierarchical loans per credit action can raise SOQL 101 with some takedowns getting **no** snapshot; a `LLC_BI__Is_Review_Ready__c = true` anywhere in the hierarchy blocks the whole action and the error surfaces misleadingly on the LoanRenewal insert. | MEDIUM | any bulk credit action | `mapId:oCOdPaJSYrwRfbKN2zNqFg`; `PDI-00020856`; `kb:kAHPY0000004Oer4AE` | Cap batch size; scan the whole hierarchy in the availability predicate. |
| **D21** | **Re-updating an sObject returned by `insert` fails on any set-once field it carries**, with an error that names the object but not the field (`LLC_BI__Loan_Collateral2__c.LLC_BI__Loan_Collateral_Aggregate__c` is `updateable: false`). | MEDIUM | any execute path that inserts then patches | `repo:knowledge/LESSONS-NCINO-APEX.md` §7 item 32 | Always update through a FRESH sObject carrying only `Id` plus changed fields. `ExecuteCollateralValuation` currently reuses `toInsert[i]` only for reads — safe today, fragile by pattern. |
| **D22** | **Two Primary valuations on one collateral.** Hartwell already carries a Primary row per collateral; our tool files another with `Primary = true` and never demotes the incumbent. Neither nCino article states whether Add Valuation unticks the prior Primary. | MEDIUM | `ExecuteCollateralValuation` | `repo:knowledge/DEMO-RELATIONSHIP.md`; `mapId:2opWW8UJI0Rg_v6i6wVYoQ` (silent) | **UNVERIFIED.** Either probe it on throwaway collateral, or make `primary` default to false and require the caller to opt in with a stated reason. |
| **D23** | **`ProductPackageBaselineCaptureTrigger`** (org-local, after insert on Product Package) enqueues `LoanMomentumBaselineCaptureQueueable`, which walks LoanRenewal to pair proposed↔existing loans and "captures baseline values for all shared collaterals, asset collaterals, and covenants." **The enqueue is wrapped in try/catch and failure is swallowed to `System.debug`.** It runs async, so baselines are not readable in the same transaction and a broken capture looks like success. | MEDIUM | `execute_new_facility` (creates packages); any second collateral/covenant traversal we might build | `repo:knowledge/ACTIONS-DESIGN.md` §2.3 | Read `LoanMomentumBaselineCaptureQueueable` before building a second traversal. Also counts toward the D8 enqueue budget. |

| **D24** | **Two collateral valuations on the same collateral with the same Valuation Date raise `System.ListException: Duplicate id in list`.** | HIGH | `ExecuteCollateralValuation`, and specifically the "default valuationDate to today" fix proposed in §3.3 | `PDI-00020349` (`a2BPY00000KRtmV2AT`), affected 2025_04, **resolved 2025_10** | `bankinggpt` is on a 2026 release so this is likely fixed there, but it is a live hazard on any customer org below 2025_10. Refuse same-collateral-same-date at stage time regardless — it is also a data-quality rule, not only a defect workaround. |
| **D25** | **A validation rule on Collateral Valuation can reject the record with no error surfaced** — "the error message does not appear in the user interface, though the record is not saved". Silent failure on first save. | HIGH | `ExecuteCollateralValuation` | `PDI-00020506` (`a2BPY00000LsRvC2AV`), affected 2025_01, resolved 2025_10 | **Already mitigated by design** — the tool re-reads the inserted row and reports `filed_unverified` when it cannot. This is the concrete reason that verification step must never be optimised away. |
| **D26** | **The valuation → collateral field map silently ignores formula fields and standard Salesforce fields.** Only plain custom fields map. | MEDIUM | any future attempt to make the rollup work | `PDI-00016876` (`a2BHu000003ZXXUMA4`), resolved 2025_02 | Compounds D9: even in an org where Add Valuation is wired correctly, a bank's customised field map can fail silently on the wrong field type. |
| **D27** | **The Collateral Valuation surface fails in several config-dependent ways that look like our bug**: the valuation section does not render when the Collateral Type's `Screen` lookup is blank (`kb:kAHHu000000XaR9OAK`); the Add Valuation screen loads forever when the Screen Section / field set is missing (`kb:kAHHu000000XaYqOAK`); `Cannot read properties of undefined (reading 'attributes')` when the Collateral Type is **inactive — including expired via its Expire Date** (`kb:kAHHu000000XaIrOAK`); and a Field Map with Originating/Target objects swapped produces `Invalid Field LLC_BI__Appraisal_Date__c for LLC_BI__Collateral_Valuation__c` (`kb:kAHPY0000001Swj4AE`). | MEDIUM | triage, not our code | those four articles | When a banker reports "valuation doesn't work", check the Collateral Type's Screen lookup, field set and Expire Date **before** looking at our tool. |
| **D28** | **Never leave `LLC_BI__Amount_Pledged__c` or a Lien `LLC_BI__Amount__c` null.** Booking a loan in a renewal chain with either null throws `LLC_BI.LoanTrigger: execution of BeforeUpdate caused by: System.NullPointerException: Argument cannot be null.` | HIGH | any future pledge- or lien-writing tool; `execute_new_facility` if it ever pledges | `PDI-00016807` (`a2BHu000003ZW3AMAW`), resolved 2024_05_02 | Write `0`, never null. Note 1 of 15 org pledges already has a null `Amount_Pledged` (`repo:knowledge/LESSONS-NCINO-APEX.md` §7 item 31). |
| **D29** | **`Stages_Renewal_Allowed` — the 2026_01 upgrade seeded a `CFG_ConfigValue` (Category `Credit Action`) whose "default configuration only allows credit actions on loans in the Closed Funded stage with an Open status."** This contradicts our standing "valid facility = Booked + Open + non-null lookupKey" rule. | HIGH | `stage_renewal`, `stage_loan_modification` availability predicates | `PDI-00022264` (`a2BPY00000auq0o2AA`), affected 2026_01, resolved 2026_03 | **Read the config value, do not hard-code the stage set.** The org received the nCino managed upgrade on 2026-08-14; re-verify `Stages_Renewal_Allowed` in `bankinggpt` before trusting `repo:knowledge/LESSONS-NCINO-APEX.md` 15i. |
| **D30** | **Product Package credit actions destroy an in-progress parent modification when a credit action is taken on a child loan.** "the system deletes and rebuilds the in-progress parent modification instead of preserving it… **Workaround: None.**" | HIGH | any package-scoped credit action; **a record Id our tool is already holding can be deleted underneath it** | `PDI-00023565` (`a2BPY00000jopob2AA`), affected 2026_03, resolved 2026_03_05 | Re-query by identity, never cache a clone Id across an async boundary. Check the org's package version against 2026_03_05. |
| **D31** | **A new Product Package created during a Credit Action leaves the `Relationship` lookup empty**, and transitioning a child from No Action to an Action forces a new-package selection instead of attaching the parent's existing package ("No workaround is available at this time"). | MEDIUM | `execute_new_facility`, any transactional-package path | `PDI-00022545` (`a2BPY00000cjLf72AE`, resolved 2026_03_01); `PDI-00024000` (`a2BPY00000lsCkH2AU`, affected 2026_03, resolved 2026_08) | Set the Relationship explicitly on any package we create; never rely on the credit action to populate it. |
| **D32** | **`kAHHu000000XafiOAC` warns in nCino's own words: "Using a button outside of the nCino UI to perform Credit Actions may also result in this error"** (`List has no rows for assignment to SObject`, caused by a missing Screen on the Credit Action Route). This is the closest thing the vendor publishes to a statement about headless credit actions. | HIGH | every credit-action execute path | `kb:kAHHu000000XafiOAC` | Pre-flight the Credit Action Route's Screen Section (`sObject Type = LLC_BI__Product_Package__c`, `Section Resource = ConfiguredSObjectScreenResource`, field set `LLC_BI__Credit_Actions_New_Package_Details`) before invoking headlessly. |
| **D33** | **`kAHPY0000003PjR4AU` is the spec, not a support article.** nCino's own statement that "the loan triggers and flows will be executed **multiple times** during a single Credit Action operation", that the only supported detection hook is `nFORCE.ExecutionContext.containsContext('CREDIT_ACTION')`, and — critically — that "**the above method cannot be used to bypass flows (specifically before-save flows)**". It also prescribes the sanctioned pattern: an `isCreditActionContext__c` checkbox set in a before-insert trigger, a `Credit_Action_Bypass__c` hierarchy custom setting, and a `PostCreditActionHandler` implementing `nForce.IPipelineComponent` whose `process()` reads `contextData.get('facilities')`, `cloneLoanId`, `hasActionCreatedALoanClone`. | HIGH | every credit-action path | `kb:kAHPY0000003PjR4AU` | Read in full before writing any credit-action tool. `hasActionCreatedALoanClone` is the honest post-action verification signal we currently approximate with a re-query. |
| **D34** | **Credit-action clone scale limits are config-bound and mutually contradictory.** `Apex CPU Time Limit Exceeded` from collateral volume in `RELATIVES_TO_CLONE` (`kb:kAHHu000000XaIDOA0`); "Cannot have more than 10 chunks in a single operation" from too many objects in the same config (`kb:kAHHu000000XadfOAC`); `Too Many SOQL queries: 101` fixed via `complex_deal_support` / `perform-async-actions` (`kb:kAHHu000000XahMOAS`) — **but `PDI-00015248` says setting `perform-async-actions` to "Enhanced" breaks credit actions outright and the value must be `10`.** | HIGH | every credit-action path | those four | Read the org's actual `CFG_ConfigValue` rows before assuming any of these are safe. Do not change them. |
| **D35** | **Inactive loan covenants clone during credit actions regardless of the `copy.inactive.covenants = false` setting. "No workaround is available."** | MEDIUM | post-renewal covenant state | `PDI-00013044` (`a2B3n000008SXqXEAW`), resolved 2025_06 | Compounds the Gold Standard's "this requires a business process to delete the covenants on the renewed or modified loan". Post-credit-action covenant state is a **bank** decision to surface, never to inherit silently. |
| **D36** | **Covenants activate even when `Is Covenant = False` on the Product State Configuration record**, if `BookedLoanSetCovenantsActive = True`. | MEDIUM | any booking that should not have activated covenants — unwanted activation means unwanted compliance generation, which chains to D1 | `PDI-00023938` (`a2BPY00000lRFEP2A4`), affected **2026_06_01, unresolved** | Live defect on a recent release. Relevant the moment anyone books a loan in this org. |
| **D37** | **The Exception batch updater creates compliance records incorrectly when rows sit in a non-terminal status.** Vendor workaround text is itself the trap: "*Ensure compliance records are residing in a 'Compliant', 'Waived', or 'Exception' status. A status such as 'In Progress' or 'Pending' will cause the apex job to still create these unnecessary compliance records.*" | MEDIUM | leaving rows non-terminal; interacts with D2c | `PDI-00017147` (`a2BHu000003ZeViMAK`), resolved 2024_08 | Another reason the availability predicate must know the source status. |
| **D38** | **Auto-evaluation behaviour branches on a custom setting and on the covenant Category.** With `automate-covenant-testing` **ON**, Financial Indicator and Financial Statement Requirement covenants stay `Pending` (only `Associated_Spread_Statement_Status__c` / `Automated_Testing_Status__c` move); with it **OFF**, *all* categories evaluate to `Exception`. | MEDIUM | any prediction of what the org will do to a row after we write it | `kb:kAHHu000000XZPZOA4` | Read the setting and the covenant's Category before asserting what happens next. |
| **D39** | **Collateral record-type and picklist preconditions on the running user.** Cloning collateral during a credit action fails with `Record Type ID: this ID value isn't valid for the user` unless all Collateral Mgmt record types are assigned (`kb:kAHHu000000XaMYOA0`); and `Pending`/`Available`/`Released` must be selected values on **every** Collateral Mgmt record type or adding collateral raises `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST` (`kb:kAHHu000000XaovOAC`). | MEDIUM | credit actions that clone collateral | those two | Already observed in this org: `repo:knowledge/DEMO-RELATIONSHIP.md` §5 records the identical refusal, which is why Hartwell's four collateral records sit on `Master` while Piedmont's sit on `UCC`. |

### 5.1 Items I could not verify

| Claim | Why unverified |
|---|---|
| Whether Add Valuation unticks the previously-Primary valuation row | Not stated in `mapId:2opWW8UJI0Rg_v6i6wVYoQ` or `mapId:AxjTjH5MIQKVIp_wnaek5g`. No org precedent (the object had 0 rows before our build). |
| Whether the rollup would fire with `Valuation Date` populated | Probe 6 did not control for it; the arms' verification query does not report a valuation date. The docs name it as a required input for the auto-update. |
| Whether the mechanism behind the Add Valuation button is Apex (which our DML would hit) or LWC controller logic (which it would not) | nCino never says. Probe 6 settles the *outcome* negatively, which is what matters, but not the mechanism — so "there might be an invocable we have not found" cannot be excluded. |
| Whether `cm_Action_Staging__c` is one of the 24 `*CDC`-triggered objects | Not recorded. If it is, every `stage_*` call also enqueues a queueable, and the D8 budget shrinks by one per staged plan. |
| Whether the managed compliance-generation trigger is active in `bankinggpt` (Covenant Servicing vs Classic) | Inferred from the perfect correlation between templated covenants and existing compliance rows, not directly observed. D2's severity depends on it. |
| Whether **anything** writes `LLC_BI__Next_Revaluation_Due_Date__c` / `LLC_BI__Valuation_Frequency__c` | The fields exist in the 2026_07 schema. No article mentions either. No generator is documented. |
| Whether Covenant Compliance → Document Manager placeholder sync is enabled in `bankinggpt` | D2b depends on it. Not checked. |
| Whether `Stages_Renewal_Allowed` was seeded in `bankinggpt` by the 2026-08-14 managed upgrade | D29. Would invalidate the standing "Booked + Open" predicate if it was. |
| Which fields are formulas or roll-ups | **The schema catalogue exposes no calculated flag.** Every "derived?" marking in §1.7 and §2.6 is an inference from name and type. Confirm with a live describe before writing to any of them — the `Days_Until_/Past_*`, `Total_*_Rollup_*` and `*_Lendable_Value__c` fields are the highest-risk. |
| Whether master-detail fields are genuinely optional | The catalogue reports every field as `Required: no` except `Collateral.Collateral_Type__c` and `Loan_Collateral2.Loan__c`, including master-details. That is a catalogue convention, not org behaviour. |
| Any defect or article about creating compliance rows via **Apex/API** rather than the UI or the packaged batch | The known-issues sweep found none; every covenant-compliance defect describes the UI or the batch path. **UNVERIFIED** whether direct DML is subject to the same behaviours. |
| Any nCino defect on **borrowing base** | Zero relevant results across the known-issues sweep. Not verified either way. |

---

## 6. What I would do next, in order

1. **Correct the two covenant class headers.** The "cannot start the chain by construction" claim is
   currently stronger than the evidence supports (D2). This is a documentation fix, not a code change, and
   it is the cheapest high-value action in this document.
2. **Replace `approvalChainStarted = false` with a measurement.** The suite already does exactly this well
   for the collateral rollup; apply the same discipline.
3. **Implement the availability predicate** in `StageCovenantReview`: parent covenant `Active`, not
   `Is_Template`, compliance status `Pending` (warn on `In Progress`, refuse on terminal), and read
   `LLC_BI__Frequency_Template__c` to decide whether D2 applies (D2c).
4. **Cap `items[]` on `stage_collateral_valuation`** and make `valuationDate` required (D8, §3.3). These are
   small, and one of them closes a live uncapped exposure on a deployed tool.
5. **Write `LLC_BI__Historic_Financial_Indicator__c`** alongside the `cm_` field, so the observed value
   reaches the covenant's `Last Evaluation Value` and every packaged surface (§3.2).
6. **Re-verify `Stages_Renewal_Allowed`** in `bankinggpt` after the 2026-08-14 upgrade (D29), before
   trusting the standing Booked+Open predicate.
7. **Decide where the policy pack lives** (§4.3). Every remaining gap in this document routes back to that
   one unmade decision.

