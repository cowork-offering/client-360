# Modification Workroom — wiring gap analysis (2026-08-27)

W1 (`knowledge/uat-findings-20260827.md`) redefines the Modify engine as an **ordered plan composer**:
step 1 the credit-action clone, steps 2..n the mutations that land on that clone, never one bulk shot.
The founder deepened that on the same day into the model this document is written against:

1. **Roll-over baseline.** A modification does not start from nothing. nCino clones the facility and the
   clone **carries the parent's record graph** — loan covenants, collateral pledges, borrowing structure,
   fees, pricing streams. Everything is KEPT unless an amendment says otherwise.
2. **Delta semantics.** Every manifest entry is a delta against that baseline: keep (implicit), change,
   **add**, **remove**. Destructive deltas are first class and are marked as such everywhere they appear.
3. **Association-aware first.** Before a create is proposed, the room checks what is already associated
   with the facility. A match makes the proposal *amend-or-add-a-second*, and duplicate prevention is a
   validation in `parseIntent` and `stagePlan`, not a UI nicety.
4. **Connected creation, never orphans.** A created record enters the plan **with its junction chain**,
   as explicit ordered steps, each verified by re-query before the next runs. A create without its
   junctions must be impossible to stage.

This document maps that scope against **what the deployed org tools can actually file today**, and states
for every gap (a) the Apex extension that would close it — design only, nothing deployed — and (b) what
v1 does meanwhile.

## Provenance of everything below

**Live describes were restored on 2026-08-27** and pulled from `bankinggpt` minutes before this pass:
`LLC_BI__Loan__c` (333 fields), `LLC_BI__Product_Package__c` (102), `LLC_BI__Fee__c` (89),
`LLC_BI__Fee_Loan_Aggregate__c` (57), `LLC_BI__Legal_Entities__c` (61), `LLC_BI__Covenant2__c` (65),
`LLC_BI__LoanRenewal__c` (28), `LLC_BI__Pricing_Stream__c` (24), `LLC_BI__Pricing_Rate_Component__c` (45),
`LLC_BI__Pricing_Payment_Component__c` (46), `LLC_BI__Loan_Covenant__c` (13),
`LLC_BI__Loan_Collateral2__c` (54), `LLC_BI__Policy_Exception__c` (24). Read-only SOQL sampled the
Hartwell package itself.

The field catalog (`app/src/workroom/fieldCatalog.ts`) tags every entry
`live-verified | observed | schema-known | to-verify-live`. **A name that is not `live-verified` or
`observed` never travels to the org**: only the four `wireKey` fields are ever sent, and all four are
live-verified. A wrong candidate is therefore a wrong sentence, never a wrong write.

### What the live describes CORRECTED

| Was | Is | Why it matters |
|---|---|---|
| `loan.paymentType`, `loan.accrualMethod` were candidates with no API name | `LLC_BI__Payment_Type__c` and **`LLC_BI__Interest_Accrual_Method__c`** (not `Accrual_Method`) | The guessed name was wrong. This is the `Interest_Rate` lesson repeating, caught by a describe instead of by an execution. |
| Involvement roles: 4 | **7** — Borrower, Guarantor, Limited Guarantor, **Co-Borrower**, Related Entity, **Grantor**, **Contractor** | The guard pins a create to `Borrower`; six real roles were unreachable AND unlisted. |
| `LLC_BI__Ownership__c` = "ownership percentage" | Labelled **"Contingent Percentage"** on this org | Name and label disagree. An extension must say which it means. |
| Loan stage: 4 values | **11** | "Booked" is the far end of a long ladder, not the next step. |
| Package risk rating assumed same scale as facility | Package **1–10**, facility **0–11** | Two different scales on one deal. |
| Fees: field names unknown | `LLC_BI__Amount__c`, `LLC_BI__Fee_Type__c`, `LLC_BI__Calculation_Type__c`, `LLC_BI__Percentage__c`, and **`LLC_BI__Loan__c` is NOT updateable** | A fee row is bound to its loan at insert, so a roll-over must RE-CREATE fees on the clone, never re-point them. |
| Fee types assumed commercial | The picklist is a **closing-cost set** (Appraisal, Attorney, Credit Report, taxes) | **A C&I arrangement or commitment fee has nowhere to file on this org even once a tool exists.** |
| Advance rate writable on a pledge | `LLC_BI__Advance_Rate__c` is **read-only**; `LLC_BI__Advance_Rate_Override__c` is the writable one | Would have been a silent no-op. |
| Covenant detach assumed to be an update | **Every field on `LLC_BI__Loan_Covenant__c` is non-updateable** — including `Active` | Detaching a covenant is a DELETE. Different risk class entirely. |
| Pledge release assumed to be a delete | `Active`, `Pledged_Status`, `End_Date` are all **writable** | A release is an update. This gap needs a tool, not a deletion policy. |

Re-counted live on 2026-08-27: `LLC_BI__Fee__c` = **0 rows**, `LLC_BI__Fee_Loan_Aggregate__c` = **0 rows**
org-wide. The August "clean negative" still holds.

---

## The one architectural finding that shapes every gap

`execute_loan_modification` produces the clone. **The clone id does not exist until execute runs**
(`cloneLoanId` in the observed response; the org's own bean returns no id, so the tool finds the clone
through the `LLC_BI__LoanRenewal__c` chain — EVIDENCE-SEPT4 org fact 4).

So a second stage/execute pair **cannot be staged against the clone**: at stage time there is nothing to
name. Every "mutation on the clone" therefore has to run **inside the same execute run**, after the credit
action and the clone re-query, as further ordered steps of the SAME plan under the SAME single-use token.
That is the shape of every Apex extension below: **extend the modification pair with an ordered
`mutations[]` block**, never a fleet of new sibling tools.

W1's "you cannot create everything at once in bulk" is exactly this: order is a property of one plan.

---

## The gap table

| # | Scope item | Fileable today? | The tool, or the wall | Apex extension that would close it (DESIGN ONLY — not deployed) | What v1 does |
|---|---|---|---|---|---|
| 1 | Loan **amount** on the clone | **YES** | `stage_loan_modification.requestedAmount` → `LLC_BI__Amount__c`. Observed end to end (clone `a4Zbb000002Br6HEAS`, amount read back 1,500,000). | — | Files. |
| 2 | Loan **maturity date** | **YES** | `requestedMaturityDate` → `LLC_BI__Maturity_Date__c`. | — | Files. |
| 3 | Loan **interest rate** | **YES** | `requestedRate` → **`LLC_BI__InterestRate__c`**. The describe confirms `LLC_BI__Interest_Rate__c` is not among the 333 fields. | — | Files. |
| 4 | Loan **term (months)** | **YES** | `requestedTermMonths` → `LLC_BI__Term_Months__c`. | — | Files. |
| 5 | **Any other loan field** (product, purpose, payment type, accrual method, amortisation term, payment schedule, risk grade, status) | **NO** | The tool takes exactly four scalars. `C360WriteGuard.UPDATE_TRANSITIONS[LLC_BI__Loan__c]` permits one transition only (`Stage: Qualification → Proposal`). | `fieldChanges: [{field, value}]` on the Request; a per-field clone allowlist in `C360WriteGuard`, picklist-validated through `C360Picklist`; applied in the existing `apply_changes_*` step and re-queried. | Manifest + **honest handoff**. |
| 6 | **Package field** (risk rating, name, stage, status) | **NO** | `LLC_BI__Product_Package__c` is `CREATE_ONLY` in the guard. The fields are writable at field level — the tool surface is missing, not the permission. | `mutations[].packageFields`, plus an `UPDATE_TRANSITIONS` entry per field. Stage and status stay forbidden: they belong to the org's package automation. | Manifest + handoff. |
| 7 | **Covenant ADD** | **NO** | `LLC_BI__Covenant2__c` is not in `C360WriteGuard.KNOWN_OBJECTS`. `stage_covenant_review` only **updates** a compliance row. | `mutations[].covenants[]` — **the full chain** (below). Must not mint a compliance row: `acnpex_covenantApprovalProcess` fires on compliance CREATE and sends an unrecallable approval email. | Manifest + handoff, with the chain shown as ordered steps. |
| 8 | **Covenant CHANGE** (threshold, operator, frequency) | **NO** | Same wall. Note the org carries **two** threshold fields: `LLC_BI__Financial_Indicator_Value__c` (what the read tool uses) and `Acnpex_Threshold_Value__c` (the Accenture overlay). | Same block, update arm, with an explicit decision on which threshold an amendment moves. `LLC_BI__Effective_Date__c` stays forbidden (PDI-00023403). | Manifest + handoff. |
| 9 | **Covenant DETACH** (drop it from the facility) | **NO** | **Every field on `LLC_BI__Loan_Covenant__c` is non-updateable** — Covenant2, Loan, even `Active`. Detaching means DELETING the junction, and the guard refuses `OP_DELETE` on everything. | A detach arm scoped to junctions on a clone the same run created, never on a booked parent. Founder-gated like every delete. | Manifest + handoff, marked **remove**. |
| 10 | **Covenant assessment** (compliance status) | Yes, but **NOT from this room** | `execute_covenant_review` exists and is founder-gated: filing a status can mint the next compliance row and fire an unrecallable approval email. | — | The room **refuses** and names it as a separate action. |
| 11 | **Collateral pledge ADD** | **NO** | `LLC_BI__Loan_Collateral2__c` is not on the allowlist. `stage_collateral_valuation` writes a valuation on an existing collateral — a different fact. | `mutations[].pledges[]` — **the full chain** (below). `LLC_BI__Advance_Rate__c` and the rollup totals are formulas and must be forbidden; the override is the writable one. | Manifest + handoff. |
| 12 | **Collateral pledge RELEASE** | **NO** | Same missing tool — but a release here is an **update**: `Active`, `Pledged_Status` and `End_Date` are all writable. | A release arm on the same block: Active false, Pledged Status Inactive, End Date set, on the clone's own junction. Lower risk than #9 because nothing is deleted. | Manifest + handoff, marked **remove**. |
| 13 | **Collateral valuation** | Yes, but **NOT from this room** | `stage/execute_collateral_valuation`, package-anchored, `items[]` only. | — | Named as a separate action. |
| 14 | **Borrower / legal entity ADD** | **NO** (machinery half exists) | `LLC_BI__Legal_Entities__c` IS on the guard — create-only, role pinned to `Borrower`, and reachable **only inside `execute_new_facility`**, bound to the loan that call creates. | `mutations[].parties[]` creating involvement against the **clone**; widen the guard's create state to the org's real **seven** roles; keep the `Is_*__c` formulas and Contingent Amount forbidden. Set `LLC_BI__Product_Package__c` — every real row in this org carries it and the org's own flow does not. | Manifest + handoff. Suggestions come from the **household** first. |
| 15 | **Borrower / legal entity REMOVE** | **NO** | The guard refuses `OP_DELETE` unconditionally; involvement is create-only, and the `Is_*__c` flags are formulas, so there is no soft-delete field. | The highest-risk extension: a delete allowlist scoped to rows on a clone the same run created, or a deactivation convention. The describe offers `LLC_BI__Guarantee_End_Date__c` and the `Exclude_From_*` flags as candidates — neither is a removal. Founder-gated. | Manifest + handoff, marked **remove**. |
| 16 | **Fees** (founder directive) | **NO**, and the org holds none | No tool writes a fee. `LLC_BI__Fee__c` and `LLC_BI__Fee_Loan_Aggregate__c` are both 0 rows (re-counted live 2026-08-27). | `mutations[].fees[]` — **the full chain** (below). `LLC_BI__Loan__c` on a fee is NOT updateable, so a roll-over re-creates rather than re-points. **Also needs a picklist decision**: the fee-type set here is closing costs, with no commercial arrangement or commitment fee value. | Manifest + handoff, and the handoff says the org holds no fee records rather than implying a missing permission. |
| 17 | **Pricing** (streams, rate and payment components) | **NO**, and **no read covers it either** | `LLC_BI__Pricing_Stream__c` + its two component children are on no allowlist, and none of the six detail reads fetches them. The room can name the concept but cannot show today's value. | **Two pieces.** A READ: extend `Customer360Exposure` with the facility's streams and components so the roll-over baseline can be shown. A WRITE: `mutations[].pricing[]` cloning the parent's streams onto the clone and applying the amendment, with `All_In_Rate` and `Calculated_Monthly_Interest_Rate` forbidden (formulas). | Manifest + handoff. The baseline peek says plainly that fees and pricing are **not in this read**. |
| 18 | **Policy exception** | **NO** | `LLC_BI__Policy_Exception__c` is unknown to the guard and has no tool. Hartwell carries one today, read-only. | `mutations[].exceptions[]`. The describe settles the anchors: `LLC_BI__Loan__c`, `LLC_BI__Covenant_Mgmt__c` (→ Covenant2), `LLC_BI__Relationship__c`. Status is Waived / Mitigated / Unmitigated. | Manifest + handoff. |
| 19 | **Booking** the modification | **NEVER** | The clone lands at `Qualification`. Booking is nCino's Submit for Approval with real approvers; `Loan_Validation_06` refuses a manual move. | None. Correct behaviour, not a gap. | The org's own `bookingHandoff` sentence, verbatim. |

### Scoreboard

- **Fileable from the room today: 4 of 19** — the four loan scalars on the clone, which is the whole of
  `stage_loan_modification`'s change surface.
- **Adjacent tools that exist but belong to their own credit action: 2** (#10, #13).
- **Needs Apex: 12** (#5–#9, #11, #12, #14–#18) — all wanting the SAME shape: an ordered `mutations[]`
  block on the existing modification pair, applied after the clone re-query, inside one plan and one token.
- **Needs a READ as well as a write: 1** (#17, pricing).
- **Correctly impossible: 1** (#19).

---

## Connected creation: the chains each category must write

Every create is a chain, in order, each link verified by re-query before the next runs. These are carried
on the catalog itself (`CatalogField.chain`), so a create cannot be composed without them, and they are
what the Apex extension has to implement transactionally.

**Covenant**
1. `LLC_BI__Covenant2__c` via `LLC_BI__Account__c` — the modern object; legacy `LLC_BI__Covenant__c` is
   empty org-wide and is never written.
2. `LLC_BI__Loan_Covenant__c` via `LLC_BI__Covenant2__c` + `LLC_BI__Loan__c` — attach to the clone. Every
   field is non-updateable, so the attachment is set at insert and can never be edited afterwards.

**Collateral**
1. `LLC_BI__Collateral__c` via `LLC_BI__Account__c` — create the asset, or resolve one the borrower owns.
2. `LLC_BI__Account_Collateral__c` — ownership and pledging authority.
3. `LLC_BI__Loan_Collateral2__c` via `LLC_BI__Collateral__c` + `LLC_BI__Loan__c` — the pledge.
   **Master-detail through `LLC_BI__Loan_Collateral_Aggregate__c`**, which is non-updateable on the pledge
   and therefore set at insert: the aggregate has to exist first. This is the known defect area for a
   clone, so the step is verified by re-query and never a casual insert.

**Borrowing structure**
1. `LLC_BI__Legal_Entities__c` via `LLC_BI__Account__c` + `LLC_BI__Loan__c`, with
   `LLC_BI__Product_Package__c` set.

**Fee**
1. `LLC_BI__Fee_Loan_Aggregate__c` via `LLC_BI__Loan__c` — resolve or create; without it the loan's
   `LLC_BI__Total_Fee_Income__c` never moves.
2. `LLC_BI__Fee__c` via `LLC_BI__Loan__c` + the aggregate.

**Pricing**
1. `LLC_BI__Pricing_Stream__c` via `LLC_BI__Loan__c`.
2. `LLC_BI__Pricing_Rate_Component__c` via the stream.
3. `LLC_BI__Pricing_Payment_Component__c` via the stream.

**Policy exception**
1. `LLC_BI__Policy_Exception__c` via `LLC_BI__Loan__c` + `LLC_BI__Relationship__c`, with
   `LLC_BI__Covenant_Mgmt__c` where it arises from a covenant.

---

## What "honest handoff" means in v1, precisely

An out-of-scope amendment is **never silently dropped and never fake-filed**. It:

1. is parsed and named, with the real object and field where the catalog knows them;
2. lands in the manifest as an entry marked **not fileable**, with its operation (change / add / remove)
   on its face — a removal is marked on the entry's edge and strikes through what it takes away;
3. is **excluded from the wire payload** — `stage_loan_modification` receives only the four scalars;
4. appears in the plan **with its junction chain as ordered steps**, so the banker sees what filing it
   would actually take;
5. reappears on the filed scene as a handoff list: what was asked, why no tool files it, and what would.

The plan summary and the approve label therefore count **fileable** entries. A manifest of five entries
where one files is "1 filed, 4 handed off", never "5 filed".

---

## Deploy status

**Nothing in this document has been deployed.** Live describes and read-only SOQL were run; no DML, no
Apex change, no metadata deploy. Every extension above is a design, and the founder gate for the deploy
wave is separate from the wiring wave.
