# A33 (DRAFT): Action Panel + Staging Pipeline

**Status:** v3, **ANSWERED, PRE-BUILD**. All nine open questions were decided by Fabian on 2026-07-26 and
are folded into the body; A33.7 now records the decisions rather than asking for them. Ready to fold
into `app/SPEC.md` §12. Nothing here is built yet. Build sequencing lives in `BUILD-BRIEF-V2.md`.
**History:** v1 returned NEEDS REWORK from the Codex adversarial round (4 blockers, 7 major, 1 minor);
all twelve findings were accepted and addressed in v2. v3 adds the founder decisions.
**Date:** 2026-07-26. **Owner:** Fable (orchestrator).
**Amends:** SPEC §12 (A24 to A32). Extends A27 (action registry), A26 (provenance), A30 (activity and
next steps), A31 (product rule vs bank rule), A32 (live artifact on `window.claude.mcp`).

**Three source classes, never blended (v2 correction):**

| Class | Source | Citation rule |
|---|---|---|
| Org research (read-only) | `ACTIONS-DESIGN.md` | Citable only for facts that document contains. It states, truthfully for its own scope, "no org mutated" and "Zero DML". |
| Write evidence | `PROBE-LEDGER.md` | Every writability claim cites a probe row. Probes **postdate** ACTIONS-DESIGN and answer questions it left open. |
| Founder decisions | Named decision plus date | Not research findings. Marked as decisions in place. |

App-side facts come from `app/src/actions/registry.ts`, `app/src/channel/mcp.ts`,
`app/src/data/contract.ts` and `artifact/sample-data.json`.

**Discipline:** no object, field, validation rule or picklist value appears below unless it was read
from a describe, a SOQL result, a probe, or nCino documentation. Where nothing settled a fact, this
draft says PROBE PENDING or GAP. It does not guess.

---

## A33.0 What this amendment is, and the one rule it turns on

A27 gave the cockpit an action registry and routed every action through the channel as a prompt. A32
proved the connector layer and moved actions to `callTool`, with write-shaped actions held at
analysis-only until Apex write tools exist. A33 specifies those write tools and the surface that drives
them: a schema-driven **Action Panel**, a deterministic **suggestion engine**, a **staging gate** with a
step tracker, and the **org contract** each action must satisfy in the target org.

### A33.0.1 The boundary is DML TIMING, not tool naming (v2, root fix for findings 1, 3 and 5)

v1 drew the line at the tool prefix and then let several `stage_*` tools perform real DML. That put
writes in front of the token, and it made the tracker a receipt rather than a preview. The line moves:

> **`stage_*` performs ZERO domain-object DML. Ever.** It validates, computes, and returns an immutable
> **execution plan** (a plan hash plus `steps[]`) together with a staging record and a ledger entry.
> **Every org write, without exception**, including the Case insert, the valuation insert, the Review
> insert and the covenant compliance field updates, happens behind the token-gated execute step.

Two consequences, both load-bearing:

1. **The tracker genuinely previews.** The plan the banker reads at the confirm gate is the plan that
   later executes, because nothing has executed yet.
2. **`approve_*` is renamed `execute_*`.** The old name claimed something the tool does not do. Our tool
   never approves credit. It executes a plan a human confirmed. The token proves panel confirmation of
   a specific plan hash, and A33.5.4 says so in those words.

The staging record and the decision-ledger entry are the only things `stage_*` writes, and neither is a
domain object in the bank's credit model.

### A33.0.2 What A33 does not change

1. **The SR 11-7 fence holds.** Everything the agent produces is decision support. The confirm step is a
   staging summary, not a credit approval. Real approval remains nCino's credit-risk process.
2. **Availability predicates stay data-driven and honest** (A27.3). A33 adds panel schemas and tool
   contracts; it does not add a second, hidden availability layer.
3. **The registry stays the single source of truth** (A27.2). Panel schema, suggestion rules and tool
   contract all hang off the same action id.

---

## A33.1 ACTION PANEL

**A33.1.1 One modal, three entry points.** The Action Panel opens from a Client Actions row (A27.4),
from a next-step button in an activity detail popup (A30.4), or from a chat suggestion chip (A27.5). All
three open the **same** modal for a given action id with the same schema and the same prefill. Modal
chrome follows A31.1 (portal above the sticky nav, focus trap, Esc, focus return).

**A33.1.2 Schema-driven, never hand-built.** Each action declares a `panelSchema` alongside `apexAction`
in `registry.ts`. There is no per-action form component. The schema is a list of field descriptors:

```ts
interface PanelField {
  key: string;                    // maps to a named org field, or to a staging-only field
  label: string;                  // banker language, not API names
  type: "currency" | "date" | "picklist" | "text" | "longtext" | "boolean" | "readonly";
  value: unknown;                 // the prefilled value, or null
  prefill: {
    source: PrefillSource;        // see A33.1.3
    provenance?: ProvenanceKind;  // A26 union, UNCHANGED: NCINO | BOOM | AGENT | DERIVED | PENDING | GAP
    citation?: string;            // record id, message id, tool name, or the derivation formula
  };
  editable: boolean;
  editableReason?: string;        // why not, when false ("set once at creation", "formula field")
  required: boolean;
  options?: string[];             // picklist values read from the org, never invented
  target: { object: string; field: string } | { staging: true };
}
```

**A33.1.3 Prefill sources and provenance chips.** `PrefillSource` and `ProvenanceKind` are **two
different types with two different jobs**. The prefill source says where the panel got the value. The
provenance kind is the A26 display contract. **A26's union is not extended by this amendment**
(v2, finding 8).

| Prefill source | Provenance chip | Meaning |
|---|---|---|
| `NCINO_RECORD` | `NCINO` | Read from the source org through a Customer360 tool. Citation is the record id. |
| `CLIENT_REQUEST` | `DERIVED` | Parsed from an inbound client request. Citation is the source message id. The email is the fact; the parsed number is derived from it. |
| `BOOM_FIGURE` | `BOOM` | From `boom_get_ratios` or `boom_get_spread`. Citation is the tool name plus the source workbook. |
| `COMPUTED` | `DERIVED` | Client-side or Apex derivation. Citation is the formula. |
| `AGENT_NARRATIVE` | `AGENT` | Agent-drafted prose. Always editable. Stays `AGENT` after editing, see A33.1.7. |
| `BANKER` | **none rendered** | No source exists. The field renders empty, the banker types it, and **no provenance chip is shown**. There is no `BANKER` provenance kind and none is being added. |

`CLIENT_REQUEST` maps onto `DERIVED` exactly as INBOUND-REQUESTS-DESIGN specifies (ask = derived from
message, brief = AGENT, email = the citation).

**A33.1.4 The banker confirms, never transcribes.** Every field a source system can answer arrives
filled. A required field that renders empty when a source could have filled it is an assembly defect,
not banker work. `BANKER`-sourced fields are the only ones that require typing, and each must be
justified in the contract table (A33.4) by the absence of a source.

**A33.1.5 Required prefill example (Sterling revolver increase).** From the synthetic sample account
`001SAMPLE0000STRL` (A30.5 permits the synthetic request; the M365 wiring stays forbidden until the
intake exists). The request carries
`ask: { type: "facility_increase", from: 10000000, to: 13000000 }` with
`reference: { kind: "m365-message", id: "SAMPLE-AAMkADQ2YjM3STRLREVOLVER0001" }`.

Opening Loan Modification from that request's next-step button yields:

| Field | Value | Prefill source | Editable |
|---|---|---|---|
| Facility | Working Capital Revolver | `NCINO_RECORD` (Customer360Exposure) | no, selection is the action's anchor |
| Current commitment | $10.0M | `NCINO_RECORD` | no |
| Current outstanding | $9.7M | `NCINO_RECORD` | no |
| **Requested commitment** | **$13.0M** | **`CLIENT_REQUEST`, citation = the message id** | yes |
| Modification type | Commitment increase | `COMPUTED` (from `ask.type`) | yes |
| Effective date | (empty) | `BANKER`, no chip | yes |
| Rationale | Agent-drafted from the concluded headroom analysis | `AGENT_NARRATIVE` | yes |

The $13.0M does not get retyped. It arrives with the email behind it, and the chip says so.

**A33.1.6 Editability is a property of the org, not a UI preference.**
- Formula and rollup fields are **never rendered as inputs**. Named cases: `LLC_BI__hasRenewal__c`,
  `LLC_BI__Number_Of_Renewals__c`, `LLC_BI__Final_Risk_Grade__c`,
  `LLC_BI__Collateral__c.LLC_BI__Lendable_Value__c`, `HTML_Credit_Memo__c`.
- **Set-once** fields render read-only after creation with `editableReason: "set once at creation"`.
  Named cases: `LLC_BI__LoanRenewal__c.LLC_BI__ParentLoanId__c`,
  `LLC_BI__Covenant_Compliance2__c.LLC_BI__Covenant__c`,
  `LLC_BI__LLC_LoanDocument__c.LLC_BI__Loan__c`.
- Picklist options are read from the org, never hardcoded in the app. Reading a picklist is not proof of
  the value set on write: several fields in this org are `restricted = false` and carry live values
  absent from the picklist (Loan `Status` holds `Superseded`), so the panel offers the picklist values
  and the tool tolerates, but never mints, out-of-set values.

**A33.1.7 Edited agent narrative keeps its provenance and gains attribution** (v2, finding 8).
Editing an `AGENT_NARRATIVE` field does **not** change its `ProvenanceKind`. The text was drafted by the
agent and revised by a human, and the honest record of that is attribution, not a type change:

```ts
interface NarrativeAttribution {
  provenance: "AGENT";        // unchanged, always
  editedBy?: string;          // user id, present only if edited
  editedAt?: string;          // ISO timestamp
  editedFields?: string[];    // the field keys the banker changed
}
```

**Attribution is ledger-only** (founder decision, Fabian, 2026-07-26). It is carried in the staging
record and written to the decision ledger, and the panel shows the `AGENT` chip with an "edited by you"
marker. **Nothing is injected into the nCino field text.** The org field holds clean final prose exactly
as a banker would write it: no "[edited by]" annotation, no provenance preamble, no marker of any kind.
The audit answer lives in the ledger, which is where an examiner looks anyway, and the credit file stays
readable. This keeps A26's union closed, keeps the type serialisable, and preserves A26's rule that
agent-composed content is never presented as record-derived.

---

## A33.2 SUGGESTION ENGINE

**A33.2.1 Deterministic math first, language second.** A suggestion exists only when a deterministic
credit calculation over `C360_DATA` produces its trigger figure. The LLM phrases the suggestion. It
never originates one. A suggestion whose trigger figure cannot be computed from staged data is not
shown, and its absence is not narrated as an all-clear.

**A33.2.2 Suggestion record** (v2: gains `asOf`, `policyVersion` and `inputs`).

```ts
interface Suggestion {
  id: string;
  trigger: { figure: string; value: number; threshold: number; formula: string };
  inputs: Array<{ path: string; value: number | null; provenance: ProvenanceEntry }>;
  asOf: string;                   // the meta.generatedAt of the data this was computed from
  policyVersion: string;          // id of the bank-policy record set supplying the threshold
  rationale: string;              // AGENT phrasing over the deterministic figure
  source: ProvenanceEntry;        // provenance of the trigger figure, not of the phrasing
  defaultAction: { actionId: string; params: Record<string, unknown> };
  override: { allowed: true; reasonRequired: true };
}
```

**A33.2.3 Override with reason.** The banker may decline a suggestion or change its default action. Both
require a reason. The reason is not panel decoration: it lands as an activity entry (A31.3
`ACTION_TRIGGERED`, extended with `suggestionId` and `overrideReason`, session-local until the v2 audit
path persists it) and in the decision ledger record for the action.

**A33.2.4 The v2 suggestion set.**

**(a) Collateral coverage shortfall after a commitment increase.**
Trigger figure: pro-forma coverage = facility lendable value divided by the proposed commitment (or
proposed outstanding, per the bank policy setting). Inputs are `NCINO`:
`borrower.exposure.facilities[].totalLendableValue`, `.coverageRatio`, `.coverageShortfall`, all
org-computed. Computed gap = (coverage floor times proposed commitment) minus current lendable value,
rendered as a currency figure, not as an adjective. On the Sterling example: pledged AR and inventory
support $9.2M of lendable value against $9.7M outstanding (0.95x) before the increase is considered at
all. Default action: `collateral-valuation`, with additional security as the alternate path.
Split: the arithmetic is **product**. The coverage floor, and whether a modification requires a fresh
valuation at all, are **bank** (A31.5 parked modification-subsumes-valuation explicitly).

**(b) Pro-forma covenant cushion compression.**
Trigger figure: each active covenant's cushion recomputed against the proposed structure, compared to
its threshold. Inputs: `borrower.covenants.covenants[]` (`NCINO`) plus Boom figures for the pro-forma
recomputation (`BOOM`). Sterling carries DSC 1.38x against a 1.30x floor; Piedmont 1.42x against 1.25x.
Fires when the pro-forma cushion falls below the bank's cushion floor or turns negative. Default action:
`covenant-review`.
Split: the cushion arithmetic and the Pass to `Compliant` / Fail to `Exception` mapping are **product**.
The cushion floor, waiver authority, and any cure period are **bank**. nCino has no cure-period concept
at all (its "Grace Days" is a pre-due-date buffer, not a post-breach cure), so cure logic is 100% bank
rule with no product anchor.

**(c) Renewal covenant-junction carryover.**
Trigger: the action is a renewal or a modification and the parent facility has `LLC_BI__Loan_Covenant__c`
junction rows. nCino canon: renewals clone the **Loan Covenant junction, not the covenant**, and nCino's
own guidance states this "requires a business process to delete the covenants on the renewed or modified
loan". The panel surfaces "these covenants clone over, review them" with the list of junction rows that
will carry. It never auto-carries silently and never auto-deletes. The disposition of each carried
covenant is a bank decision recorded per row.
bankinggpt caveat that must be honoured in the UI: Piedmont's four covenants are all Account-level with
**zero** `LLC_BI__Loan_Covenant__c` rows, so the carryover list can legitimately be empty. An empty list
renders as "no loan-level covenants attached to this facility", never as blank space.
Split: the cloning behaviour is **product**. What happens to the carried covenants is **bank**.

**A33.2.5 Thresholds are configuration, not code.** Every threshold is named and read from a bank-policy
layer, identified by `policyVersion`. No threshold literal may appear in a component or in a suggestion
rule, mirroring A26.2's ban on hardcoded business literals. **A threshold with no configured value
disables its suggestion and reports the missing policy key. It never falls back to a default.**

**A33.2.5a The demo policy pack `demo-2026-07`** (founder decision, Fabian, 2026-07-26). Accepted with
the standing constraint: **realistic commercial credit, not implausible numbers.** A banker looking at
these should recognise them.

| Policy key | Value | Used by | Note |
|---|---|---|---|
| `collateral.coverageFloor` | **1.10x** | A33.2.4(a) | Lendable value against the proposed commitment. A 10 percent cushion over par is ordinary secured-lending practice, not a stress case. |
| `covenant.cushionAlertFloor` | **15 percent** | A33.2.4(b) | Alert when the pro-forma cushion to the covenant threshold falls below 15 percent. An alert, not a breach. |
| `modification.subsumesValuation` | **OFF** | A33.2.4(a) | Suggest-only. A modification never silently pulls a valuation into its plan; the banker accepts the suggestion or does not. This resolves the item A31.5 parked. |

`policyVersion` for this pack is the string **`demo-2026-07`**. It is stamped on every `Suggestion`
(A33.2.2) and re-checked at confirm (A33.2.7).

> **These are engagement configuration, not product constants.** Per A31.5, the math is the product and
> the thresholds are the bank's. A different bank replaces this pack wholesale, and nothing in the
> suggestion code changes when they do. No value in this table may be inlined anywhere in the app.

**A33.2.6 Input validity guards (v2, finding 10).** A trigger computes **only if** every input satisfies
all of:

1. present (the path exists on the staged bundle),
2. non-null,
3. finite (`Number.isFinite`, so `NaN` and both infinities are rejected),
4. every denominator strictly greater than zero,
5. the threshold resolved from the bank-policy layer at a known `policyVersion`.

Any failure produces **no suggestion** plus a **named gap**: which input, which path, which source
system. Never a substituted zero, never a coerced null, never a default threshold, never a silently
dropped suggestion. A zero lendable value and a missing lendable value are different facts and the panel
must not render them the same way.

**A33.2.7 Freshness binding and mandatory recomputation at confirm (v2, finding 10).** A suggestion is
bound to the data and policy it was computed from, through `asOf` and `policyVersion`. **At the confirm
gate the engine recomputes every suggestion that fed the plan.** If any of the following is true, the
**confirm blocks** and the panel re-renders with the new figures and an explicit notice naming what
moved:

- the recomputed trigger value differs from the displayed value,
- `policyVersion` has changed,
- the staged bundle was replaced since the suggestion was computed (`meta.generatedAt` moved).

The banker then confirms the new number or abandons. A plan is never executed against figures the
banker did not see.

**A33.2.8 Two-tier suggestions: the hardcoded set is the floor, not the ceiling.** Everything above
describes **Tier 1**, and Tier 1 is deliberately rigid: a fixed rule set, deterministic math,
configured thresholds, full input guards. That rigidity is the point. Tier 1 is what makes the
suggestion surface SR 11-7 defensible, because every suggestion it emits can be recomputed by a third
party from the same staged data and the same policy pack.

**Tier 2 is the agile tier: chat and the skills.** An agent may propose **any** suggestion through free
reasoning, including ones nobody enumerated. A banker asking "what would you do here" should get real
thinking, not a lookup against three hardcoded rules. Tier 2 is governed by exactly two rails:

1. **The grounding rail.** Every figure a Tier 2 suggestion cites must trace to staged data under the
   existing grounding contract. Agent reasoning may combine and interpret staged figures freely. It may
   not introduce a number that has no source.
2. **The registry rail.** Every action a Tier 2 suggestion proposes must resolve to a **registry action
   id**. It cannot invent an action. Resolving to an action id is what routes the proposal into the
   Action Panel, which means it inherits the same schema, the same availability predicate, the same
   confirm gate, the same plan hash and the same decision token as anything Tier 1 proposed.

What keeps Tier 2 from becoming a side door is **A33.6.1**: chat path and panel path must produce the
same outcome for the same ask. A Tier 2 suggestion that reaches an execution route the panel does not
also reach is, by that test, a defect. Tier 2 widens what can be *proposed*. It widens nothing about
what can be *written*.

---

## A33.3 GATE, STEP TRACKER, DEEP LINK

**A33.3.1 The confirm step is a staging summary, and the fence is per-action structure** (v2, finding 4).
The confirm copy states, in banker language, what will be written, to which object, and what automation
the write is expected to wake. It must not use the words "approve", "submit for credit approval", or any
phrasing implying a credit decision.

v1 generalised a Loan-specific permission fact into a whole-system claim. It is not one. Withholding
`LLC_BI__Exclude_Validation` fences **Loan stage movement and nothing else**: all 18 active Loan
validation rules end with `NOT($Permission.LLC_BI__Exclude_Validation)`, so `Loan_Validation_06` is a
genuine wall for Loan stage writes. It does nothing about Case creation, valuation insertion, risk
review write-back, or covenant workflow initiation. Those objects need their own fence, and the fence is
this allowlist.

**Per-action transition allowlist (binding).** Each tool declares the exact object states it may create
or transition. Anything not on this table is refused by the tool, not merely absent from the UI.

| Object | May CREATE with | May TRANSITION | Explicitly refused |
|---|---|---|---|
| `LLC_BI__Loan__c` (new facility) | `Stage = 'Qualification'`, `Status = 'Open'`, both loan-type flags false | **Exactly one hop: `Qualification` to `Proposal`**, in `execute_new_facility` phase 2, and **only after the Loan Detail verification step passes** (founder decision, 2026-07-26). No other transition exists in the tool. | Every other stage transition, in either direction. Any write to a post-approval stage (`Loan_Validation_06` is the Loan fence). The hop itself if Loan Detail is unverified. |
| `LLC_BI__Loan__c` (clone) | Created by nCino's credit action, not by us | none by us | Setting both loan-type flags. Setting `LLC_BI__hasRenewal__c` (formula). |
| `LLC_BI__LoanRenewal__c` | **Never created by us.** nCino's invocable owns the junction (founder decision, 2026-07-26). | **Never updated** | **Never deleted.** Deleting a chain row is permanent poison ("You can not create a renewal for this loan"). |
| `LLC_BI__Covenant_Compliance2__c` | **Never created.** Generation is managed automation. | `Pending` or `In Progress` to `Compliant` or `Exception` only. **HELD** until the approval-workflow entry criteria probe lands. | Any other status transition. Any write to the parent's `LLC_BI__Effective_Date__c`. |
| `LLC_BI__Collateral_Valuation__c` | Full field set, `Active` and `Primary` explicit | none | Updates and deletes. Sub-collateral creation. |
| `LLC_BI__Review__c` | `Status = 'In Progress'` **only**, plus narratives | **None.** No `Complete`. No `cm_Review_Stage__c` write of any value. | `cm_Review_Stage__c = 'Approval'` (impossible for anyone, RV01). `cm_Review_Stage__c = 'Complete'`. `Status = 'Complete'`. |
| `LLC_BI__Annual_Review__c` (risk rating) | `Status = 'In Review'` **only** | **None.** `Approved` and `Declined` belong to the org's `RiskRatingReviewDecisioned` path. | `LLC_BI__Final_Risk_Grade__c` (formula). Any decision status. |
| `Case` | `Status = 'New'` **only** | **None** | Any status transition. Case closure. |

**A33.3.2 Every write is a step. Not every step is a write** (v2, finding 12). The tracker plan comes
from the `steps[]` array returned by `stage_*`, so the plan the banker read is the plan that executes.
Steps are typed:

| Step type | Meaning |
|---|---|
| `write` | A DML call we make. Declares object and fields. |
| `verification` | A read that proves a prior write landed. Makes no change. |
| `wait` | A bounded hold for asynchronous org automation. Declares a wait budget. |
| `handoff` | Control passes to an org process we do not drive (Submit for Approval, the covenant approval chain). Terminal for our involvement. |
| `observed_side_effect` | Automation the org runs that we neither trigger nor control, surfaced so the banker is not surprised (Slack post, Booked email alert, auto-created opportunity). Never claimed as verified unless a verification step proves it. |

Each step declares `label`, `type`, `object` and `fields` (write steps), `automationWoken`,
`verification` (the query that proves it landed) and `waitBudgetMs` (wait steps).

**A33.3.3 Tracker state machine (v2, finding 9).**

Step states: `pending`, `running`, `waiting`, `filed_unverified`, `verified`, `failed`, `ambiguous`,
`skipped_not_attempted`.

| From | To | Condition |
|---|---|---|
| `pending` | `running` | The executor reached this step and all preconditions are `verified`. |
| `pending` | `skipped_not_attempted` | An earlier step ended `failed` or `ambiguous`. |
| `running` | `verified` | The verification query returned the expected record and state. |
| `running` | `waiting` | The write returned success and asynchronous org automation is outstanding. |
| `running` | `filed_unverified` | The write returned success but verification is impossible by design (the org swallows the failure, for example `PPCacheCreation` and `ProductPackageBaselineCaptureTrigger`, which write to `System.debug` and report nothing). |
| `running` | `failed` | A deterministic org error. |
| `running` | `ambiguous` | A transport code from the ambiguous set already classified in `channel/mcp.ts`: `server_unavailable`, `upstream_error`, `cancelled`. |
| `waiting` | `verified` | Polling verification succeeded within the budget. |
| `waiting` | `filed_unverified` | The wait budget was exhausted. **Never to `failed`**: a timeout is not evidence of failure. |
| `waiting` | `failed` | Polling returned a definite org error. |
| `ambiguous` | `verified` or `failed` | **Only** after a re-query on resume. There is no automatic transition out of `ambiguous`. |
| `failed` or `ambiguous` | `running` | Resume only, behind a fresh banker gesture, after the resume preconditions below. |

Rules that make the machine safe:

- **Bounded waits.** Every `wait` step declares `waitBudgetMs` and `pollIntervalMs`. Exhaustion moves it
  to `filed_unverified` with the reason shown, never to a silent pass.
- **No dependent auto-run on an unverified precondition.** A step whose precondition ended
  `filed_unverified` stays `pending` and requires a banker gesture. The panel says which unverified fact
  it is waiting on.
- **Resume preconditions (all required).** Re-query the target state before any resumed write; the plan
  hash must still match the staged plan; the idempotency key is reused unchanged. If org state moved
  since staging, the resume is **refused** and the action must be re-staged. Ambiguous outcomes are
  never auto-retried: a rejection is not proof the tool did not run.
- **Persistence.** Tracker state lives in the staging record server-side, keyed by `idempotencyKey`. The
  client's `sessionStorage` copy (A16) is a cache and never the authority, so a full artifact replace
  cannot lose or fabricate progress.
- **Action terminal state.** `success` = every step `verified` or a deliberate `handoff`.
  `partial` = at least one `verified` and at least one `failed`, `ambiguous`, `filed_unverified` or
  `skipped_not_attempted`. `failed` = the first write step failed with nothing verified.

**A33.3.4 Modification tracker, worked example.** All steps below are **execute-phase**. `stage_` produced
this list and wrote nothing. **The nCino invocable is the decided path** (founder decision, Fabian,
2026-07-26):

| # | Type | Step |
|---|---|---|
| 1 | `write` | Invoke the credit action on the product package (`CreditActionSoaXPkg`, package id plus the member facility and action). nCino performs the clone, sets the flags, and creates the `LLC_BI__LoanRenewal__c` junction row. |
| 2 | `verification` | Re-query for the modification loan and its junction row. Async revert is silent, so a synchronous OK proves nothing. |
| 3 | `write` | Apply the requested changes to the modification loan (amount, maturity, rate, term). |
| 4 | `write` | Attach the collateral valuation, when the A33.2.4(a) suggestion was accepted. |
| 5 | `observed_side_effect` | Any flow-driven email or memo status change the stage state can trigger. |
| 6 | `handoff` | Control passes to the org's approval process. Our tools do not advance the stage. |

> **Rejected alternative: hand-rolling the clone.** It would put us on a junction object with 0
> validation rules, 0 triggers and 0 flows, where nothing corrects a malformed row and a malformed row
> fails silently, and it would make the `*_Relatives_to_Clone` config surface, revision numbering and
> the Superseded cascade ours to own. Not taken.

**A33.3.5 Failure is located, preserved and resumable.** On failure the tracker stops at the failing
step and shows: which step, the org error verbatim plus our mapped banker copy, and the state of every
other step per A33.3.3. The action is resumable from the failed step. It is **never** silently retried.
Every write carries an `idempotencyKey`, stable across resume, enforced by us: nCino's failed background
Apex is known to produce duplicate modification loans carrying the same loan number, so idempotency
cannot be assumed from the platform.

**A33.3.6 Terminal state always offers the deep link.** All three action terminal states render
"Open in nCino", pointing at the **product package** record, because the package is the deal container
and the anchor for commercial credit actions:

```
${meta.instanceUrl}/lightning/r/LLC_BI__Product_Package__c/${productPackageId}/view
```

`instanceUrl` rides in the assembled data as `meta.instanceUrl` (contract addition; add to the A26
provenance map as `NCINO`, source: session org). It is never hardcoded and never reconstructed from an
org id or a guessed `my.salesforce.com` host. If it is absent, the link renders as a disabled chip with
the record id shown as selectable text.

**A33.3.7 Stage authority: the Loan stages are the stages that matter** (founder correction, Fabian,
2026-07-26). This **overrides** the framing v2 carried, which treated the package stage field as an open
choice between two candidates.

1. **The credit lifecycle is the nCino Loan stage ladder.** That is nCino canon and it is what a banker
   means by "where is this deal". Wherever the tracker, the confirm summary, the terminal state or the
   deep-link copy references a stage, it references the **Loan** stage.
2. **On the package, the authoritative field is the managed `LLC_BI__Stage__c`.** The local
   `cm_Credit_Stage__c` is **not** adopted as an authority, and no tool or component may read it as one.
   Package stage is **display-only**, rendered from `LLC_BI__Stage__c`.
3. **The Piedmont mismatch is a data-quality finding, not a modelling decision.** Piedmont's package
   holds `Credit Underwriting`, which is a Loan stage value and is not valid for the package's own
   picklist. That is bad data in the demo org. It is surfaced through the **existing DQ mechanism** as a
   finding on that record, and a DQ chip renders next to the package stage whenever `cm_Credit_Stage__c`
   disagrees with `LLC_BI__Stage__c` or the value is outside the field's picklist. We report it. We do
   not model around it, and we do not silently pick whichever field looks tidier.

---

## A33.4 ORG CONTRACT TABLES

One table per write-shaped action. Org facts are from ACTIONS-DESIGN; write evidence is from
`PROBE-LEDGER.md`; founder decisions are marked as such. Column (d) is the probe status.

**Reading note for v2:** where v1 said "`stage_` writes X", the write has moved to the execute phase per
A33.0.1. `stage_` computes and plans; it writes nothing to any object below.

### A33.4.1 Loan Modification (`loan-modification`)

Anchor: `LLC_BI__Product_Package__c`. Write objects: `LLC_BI__Loan__c` (the clone),
`LLC_BI__LoanRenewal__c` (the junction).

| | |
|---|---|
| **(a) Required and set-once** | `LLC_BI__Loan__c` has **zero** hard-required fields at API level; the real contract is the validation ladder below. `LLC_BI__LoanRenewal__c.LLC_BI__ParentLoanId__c`: createable, **not updateable, set once**. `LLC_BI__PreviousVersionStage__c` and `LLC_BI__PreviousVersionStatus__c`: free text, copied verbatim from the parent's current values. Chain anchoring is the text field `LLC_BI__RootLoanId__c`. **Never write:** `LLC_BI__hasRenewal__c` (formula), `LLC_BI__Number_Of_Renewals__c` (rollup). 56 fields on Loan are non-createable, so every insert is built from an explicit allowlist. |
| **(b) Active VRs mirrored client-side** | `Cannot_Check_More_Than_One_Loan_Type` (**no bypass**): the panel offers renewal or modification, never both. Our copy: "A facility can be renewed or modified, not both." `Loan_Validation_06` is the **Loan** fence: our copy: "Approval happens in nCino's credit process. This panel stages the change only." Ladder rules bite only on their exact stage hop: `LV11` amount, `LV12` Loan Detail `Primary_Loan_Purpose__c`, `LV13` Loan Detail `Application_Method__c`, `LV14` loan officer (Qualification to Proposal); `LV15` `Primary_Source_of_Repayment__c`, `LV16` `Term_Months__c`, `LV17` `Amortized_Term_Months__c`, `LV18` `CloseDate__c` (Proposal to Credit Underwriting); `LV10` requires `LLC_BI__Is_Review_Ready__c = false` in post-approval stages. Availability additionally scans the **hierarchy** for any `Is_Review_Ready__c = true`, which blocks the whole credit action and surfaces its error misleadingly on the LoanRenewal insert. |
| **(c) Automation the tracker must show** | A Loan insert wakes **3 triggers and 5 flows** (`LLC_BI.LoanTrigger` across all six contexts, `nCino.LoanTrigger`, `nCRED.loan_BeforeInsert`, `NDOC.loan_AfterUpdate`, plus the delete-context triggers), two of which mutate before save. `ACNPEX_ AccountOwnerAsLoanOfficer` (local, before save) **overwrites** `LLC_BI__Loan_Officer__c` from the account owner: an `observed_side_effect` step, so the tracker reports Loan Officer as org-assigned, not as our value. `nCino Commercial - Loan After Save` sends an email alert on the Booked stage and flips Under Review memos to Approved on the Processing stage: named in the confirm summary for any step that could reach those stages. `LLC_BI__LoanRenewal__c` has **0 VRs, 0 triggers, 0 flows**: nothing corrects a malformed row, so verification is by re-query only. |
| **(d) Probe status** | **PROBE PENDING** on `LLC_BI__Loan__c` (through the invocable) and `LLC_BI__LoanRenewal__c`. **Deliberately deferred to the build phase:** a loan clone wakes real nCino credit-action automation (8 automation entry points, async clone, junction creation, the Superseded cascade), so it is not a probe that can be run and cleanly reversed in a shared sandbox. It runs as the first build-phase step, in isolation, with the A33.3.3 verification steps in place before the first write. |

### A33.4.2 Renewal (`renewal`)

Same machinery as A33.4.1, package-anchored, with the flag flipped to `LLC_BI__isRenewal__c` and
`LLC_BI__Is_Modification__c = false`. Deltas only:

| | |
|---|---|
| **(a)** | `LLC_BI__Renewal_Number__c` must be set explicitly, or let the invocable set it. A blank number yields a loan named `_Rnull` and breaks core sync. `LLC_BI__Number_Of_Renewals__c` is a rollup and is never written. |
| **(b)** | Same ladder. Availability additionally reads `LLC_BI__Maturity_Date__c` (renewal is maturity-driven) and requires `LLC_BI__Is_Modification__c = false`. |
| **(c)** | A **new Opportunity is auto-created on every renewal**: an `observed_side_effect` step, not a surprise. Renewal is effectively irreversible, which the confirm summary states. Missing FLS edit on the flag fields causes **silent** mis-typing as an original loan with no exception, so the flag-field describes are re-run as the service identity before this tool ships. The covenant junction clones, feeding suggestion A33.2(c). |
| **(d)** | **PROBE PENDING**, deferred to the build phase for the same reason as A33.4.1. Only 3 loans org-wide carry `isRenewal = true`, and Piedmont has none, so this path has no local precedent to read either. |

### A33.4.3 New Facility Request (`new-facility-request`)

**Two-step, per founder decision (Fabian, 2026-07-25).** The action is staged, then executed in two
phases: phase 1 creates the Loan at Qualification; phase 2 performs the Qualification to Proposal hop in
a **later transaction**, after nCino's async flow has created the Loan Detail. **We never insert Loan
Detail ourselves.**

**v3: the action ships complete** (founder decision, Fabian, 2026-07-26). Phase 2 is switched on, under
an allowlisted-hops rule: `execute_new_facility` may perform **exactly** the `Qualification` to
`Proposal` transition and no other, and only after the Loan Detail verification step passes. There is no
phase-1-only variant.

| | |
|---|---|
| **(a) Required and set-once** | Zero hard-required fields at API level. Phase 1 sets `LLC_BI__Stage__c = 'Qualification'`, `LLC_BI__Status__c = 'Open'`, `LLC_BI__isRenewal__c = false`, `LLC_BI__Is_Modification__c = false`. `RecordTypeId` = `Commercial_Loan_Record_Type` (`012bb000000NfLpAAK`) or cloned from a sibling loan on the package. `LLC_BI__Account__c` comes from the package. `Name` is a writable text field, not an autonumber. Insert from an explicit allowlist; never `SELECT FIELDS(ALL)`. |
| **(b) Active VRs mirrored client-side** | `LV11` (amount) and `LV14` (loan officer) gate the hop and are collected in the panel at stage time. `LV12` and `LV13` dereference `LLC_BI__Loan_Detail__r`, which does not exist in the insert transaction: the panel collects `Primary_Loan_Purpose` and `Application_Method` at stage time and phase 2 writes them to the child **once nCino has created it**. `LV06` fences the post-approval stages. |
| **(c) Automation the tracker must show** | A `wait` step, "waiting for nCino to create the Loan Detail", with an explicit `waitBudgetMs`. On exhaustion it becomes `filed_unverified`, not `failed`, and phase 2 does not auto-run (A33.3.3). It never creates the child. `ACNPEX_ AccountOwnerAsLoanOfficer` overwrites the loan officer (`observed_side_effect`). `PPCacheCreation` and `ProductPackageBaselineCaptureTrigger` fire on package writes with **no bypass** and **swallow their failures to `System.debug`**, so their steps can only ever reach `filed_unverified` by design. `ProductPackageBaselineCaptureTrigger` enqueues `LoanMomentumBaselineCaptureQueueable`, which already walks the LoanRenewal junction: read it before building any second traversal. |
| **(d) Probe status** | **PROBE PENDING** on `LLC_BI__Loan__c` insert, and separately on the deferred hop. **GAP:** the package record type `Deal_Proposal` is inactive (only `Treasury_Maintenance` is active), so creating a **new** package is not covered by this contract. This action inserts under an existing package only. |

### A33.4.4 Covenant Review (`covenant-review`)

Write object: `LLC_BI__Covenant_Compliance2__c` (existing records only, never created).

| | |
|---|---|
| **(a) Required and set-once** | One hard-required field: `LLC_BI__Covenant__c`, createable and **not updateable**, so it is set once at creation and rendered read-only here. Execute phase 1 writes `Agentic_AI_Response__c`, `LLC_BI__Comments__c`, `cm_Covenant_Compliance_Indicator_Value__c`. Execute phase 2 writes `LLC_BI__Status__c` to `Compliant` or `Exception`, plus (on Exception) `LLC_BI__Reason_for_Exception__c = 'Breached'` and `LLC_BI__Exception_Date__c`, plus `LLC_BI__Evaluation_Date__c` and `LLC_BI__Evaluated_By__c`. Status value set: `Compliant, Exception, In Progress, Pending, Waived`. **Both phases are token-gated** (A33.0.1). |
| **(b) Active VRs mirrored client-side** | **Zero** validation rules on the compliance object. On the parent `LLC_BI__Covenant2__c`: `Template_Covenants_Cannot_Be_Active` (no bypass), a template covenant cannot be active. The parent's status field is `LLC_BI__Covenant_Status__c` (not `LLC_BI__Status__c`) and its value set is mixed-vocabulary, so the panel reads it, labels it as the parent's status, and never writes it. |
| **(c) Automation the tracker must show** | **`acnpex_covenantApprovalProcess` is an `ApprovalWorkflow` firing after save.** Its **entry criteria are UNPROVEN** (see (d)). Until they are proven, A33 treats **every** write to this object, including the narrative-only fields of phase 1, as potentially chain-starting: both phases carry an `observed_side_effect` step reading "may start the bank's covenant approval chain", the confirm summary says so **before** the banker confirms, and neither phase is agent-callable. Three triggers fire (`LLC_BI`, `nCino`, `nCRED.covenantCompliance_BeforeUpdate`). `ACNPEX_Covenant Mgmt Calculation Logic Update` on the parent carries **no bypass token and always fires**. **Never write** `LLC_BI__Effective_Date__c` on the parent: it corrupts the whole compliance schedule (PDI-00023403, unresolved). **Never create** compliance records: generation is managed automation. |
| **(d) Probe status** | **PROBE PENDING (update).** 140 rows exist, so a target is available. **PROBE PENDING (approval-workflow entry criteria):** which field change starts `acnpex_covenantApprovalProcess` is unknown, and this is a **gating** probe. Until it lands, the status transition in the A33.3.1 allowlist stays **HELD** and no covenant tool ships. |

### A33.4.5 Collateral Valuation (`collateral-valuation`)

Write object: `LLC_BI__Collateral_Valuation__c`.

| | |
|---|---|
| **(a) Required and set-once** | One hard-required field: `LLC_BI__Collateral__c` (set-once in practice). Writable field set, all createable and updateable: `LLC_BI__Source__c` (14 values including `Appraisal`, `Internal Valuation`, `Third Party Source`, `Real Estate Restricted Appraisal`), `LLC_BI__Type__c` (16 values including `Fair Market Value - Real Estate`, `Net Orderly Liquidation Value`, `As Is Value`), `LLC_BI__Valuation_Date__c`, `LLC_BI__Value__c`, `LLC_BI__Primary__c`, `LLC_BI__Valuation_Description__c`. The three booleans (`Active`, `Original_Value`, `Primary`) default to **false**, so a revaluation sets `Active` and `Primary` explicitly and `Original_Value = false`. Zero formula fields, zero rollups. **Never write** `LLC_BI__Collateral__c.LLC_BI__Lendable_Value__c` (formula on the parent): the value goes on the valuation child. |
| **(b) Active VRs mirrored client-side** | **Zero** on the valuation object (probe-confirmed: no validation wall was hit). On the pledge junction `LLC_BI__Loan_Collateral2__c`, two active rules with **no permission bypass**: `Pledge_More_Than_Lendable_Value` (data-level escape is `LLC_BI__Authorize__c = true` in the same write, which the panel surfaces as an explicit banker checkbox with a reason and **never auto-sets**), and `Advance_Rate_Override` (requires `LLC_BI__Override_Reason__c`, so the panel makes it required whenever an advance-rate override is present). |
| **(c) Automation the tracker must show** | `LLC_BI.CollateralValuationTrigger`, **before insert only**. Zero flows, zero validation rules. Sub-collateral creation fires the parent's validation rules even when nothing changed, and the documented workaround is a UI edit-then-revert with **no headless equivalent**, so the panel does not offer sub-collateral creation in v2 (also refused by the A33.3.1 allowlist). |
| **(d) Probe status** | **CONFIRMED (write).** `PROBE-LEDGER.md` Probe 1: insert with `LLC_BI__Collateral__c` and `LLC_BI__Value__c` only, `CV-0000000000` against `COL-000758` (`a34bb00000398KnAAI`), verified, deleted, 2026-07-25. **PROBE PENDING (rollup):** whether the insert auto-updates `LLC_BI__Collateral__c` is unsettled. nCino binds the auto-update to the **Add Valuation** button and states the automation does not function via the New button, and this org had 0 prior rows. The plan therefore carries a **`verification` step** re-querying the collateral record. If the value did not roll up, the terminal state reads "valuation filed, collateral value unchanged" and no coverage improvement is claimed. |

### A33.4.6 Annual Review (`annual-review`)

Write object: `LLC_BI__Review__c` (distinct from `LLC_BI__Annual_Review__c`, see A33.4.7).

| | |
|---|---|
| **(a) Required and set-once** | Zero hard-required fields; only `Name` is non-createable (autonumber); zero formula or rollup fields. **Probe-confirmed** (`PROBE-LEDGER.md` Probe 3): an insert supplying **only** `LLC_BI__Account__c` succeeded, the org auto-assigned the record type `Account Review In Progress` and auto-named the record `R-3`, and **`LLC_BI__Status__c` and `LLC_BI__Review_Type__c` both came back NULL because nothing defaults them**. The execute step therefore sets both **explicitly** and the panel marks both required: `LLC_BI__Status__c = 'In Progress'`, `LLC_BI__Review_Type__c` from `Annual, AdHoc, Problem Loan`. Also sets `LLC_BI__Is_Agentic_Review__c = true` (the org is pre-wired for agent-authored reviews) plus the narrative fields: `LLC_BI__Narrative__c`, `cm_Relationship_Summary__c`, `cm_Strengths_Narrative__c`, `cm_Weakness_Narrative__c`, `cm_Recommendation_Narrative__c`, `cm_Collateral_Analysis_Narrative__c`, `cm_Financial_Analyst_Narrative__c`, `cm_Guarantor_Narrative__c`, `cm_Risk_Rating_Comments__c`. **Never set** `RecordTypeId` (the after-save flow assigns it). |
| **(b) Terminal transition removed (v2, finding 2)** | v1 let the approve tool write `Status = 'Complete'` with `cm_Approved_Date__c`. **That is deleted.** A decision token proves the banker confirmed a plan; it is not a credit approval, and `Complete` is a post-approval state. Our tools **create the Review at `In Progress` and stop.** The plan's last step is a `handoff`: the narrative is staged, the banker uses nCino's **Submit for Approval**, and **the org's own process mints `Complete`**. The mirrored rules are now warnings, not paths we take: `Review_Validation_01` (no bypass for anyone) makes `cm_Review_Stage__c = 'Approval'` unreachable through the API, and `Review_Validation_02` would require `cm_Approved_Date__c` in the same write as a `Complete` transition, with its only escape being `$User.No_Validation__c`, held by **zero active users**. We write neither field. The local ladder `cm_Review_Stage__c` (`Qualification, Underwriting, Final Review, Approval, Complete`) is **read and labelled, never written**. |
| **(c) Automation the tracker must show** | `Review After Save` sets the record type on create and populates the loan officer from the relationship owner (`observed_side_effect`, probe-confirmed). Prefer the documented `Create Credit Review` flow action over raw DML so nCino writes the `LLC_BI__Review_Account__c` snapshots. Entities added to the borrowing structure **after** review creation get no snapshot row and become invisible, which the confirm summary states. **Do not retry or refresh after creating a credit action**: it can create two records, which is why resume is gated on re-query (A33.3.3). Package rollups recalculate based on the **running user's** record access, so the service identity's sharing must be verified or the rollups will be wrong. |
| **(d) Probe status** | **CONFIRMED (insert)**, `PROBE-LEDGER.md` Probe 3, `a5nbb00000kZKe7AAG`, 2026-07-26, with the explicit-status caveat above. The `Complete` transition is no longer ours to probe: it belongs to the org's process. |
| **Verified discrepancy** | `LLC_BI__reviewStatus__c` **does not exist on `LLC_BI__Review__c`** in this org (`INVALID_FIELD` on query). In ACTIONS-DESIGN that field is documented on `LLC_BI__LLC_LoanDocument__c`, the Document Manager placeholder object. Any reading that attaches it to Review is wrong and it is deliberately absent from this table. The Review status field is `LLC_BI__Status__c` in `In Progress, Pending Approval, Complete`. |

### A33.4.7 Risk Rating Review (`risk-rating-review`)

Write object: **`LLC_BI__Annual_Review__c`**, whose label is "Risk Rating Review". This is a different
object from `LLC_BI__Review__c`. No object in this org contains "Rating" in its API name.

| | |
|---|---|
| **(a) Required and set-once** | One hard-required field: `LLC_BI__Account__c`. `LLC_BI__Loan__c` is nillable: this object hangs off the **account**, not the loan. The execute step sets `LLC_BI__Status__c = 'In Review'` explicitly, because the field defaults to `Not Approved` and an omitted status lands there rather than null (value set: `Not Approved, Approved, Declined, In Review`). **Never write** `LLC_BI__Final_Risk_Grade__c` (formula). Write the inputs: `LLC_BI__Computed_Risk_Grade_Value__c`, `LLC_BI__Overridden_Risk_Grade_Value__c`, `LLC_BI__Override__c`, and the `*_actual__c` / `*_RG__c` score pairs. **Naming trap:** `LLC_BI__Cash_Flow_Coverage_actual__c` is the writable input; the bare `LLC_BI__Cash_Flow_Coverage__c` is the read-only formula. Per the A33.3.1 allowlist we create at `In Review` and make **no** decision transition: `Approved` and `Declined` belong to the org's `RiskRatingReviewDecisioned` system-property path. |
| **(b) Active VRs mirrored client-side** | `Mandatory_comment` (**no bypass**): any `LLC_BI__Overridden_Risk_Grade_Value__c > 0` requires `LLC_BI__Comments__c` non-empty. The panel makes the override reason required and writes it to `LLC_BI__Comments__c`. Note the describe reported the rule's error field as `LLC_BI__Override_Comment__c` while the formula tests `LLC_BI__Comments__c`: **use the formula's field**. |
| **(c) Automation the tracker must show** | Flow `Risk Rating (Annual) Review After Save` **writes back onto the Loan** (gated on `Exclude_Flow` and Product Line = Commercial): an `observed_side_effect` step. A risk rating review launched from a Loan can hang indefinitely with **no error** when the account violates a validation rule: a synchronous caller gets no failure signal, so a `wait` step with a declared budget plus a `verification` step is mandatory, and budget exhaustion lands in `filed_unverified` rather than a false green. `Account.LLC_BI__Highest_Risk_Grade__c` has **max length 2**: writing a label like "2 - High Quality" throws `STRING_TOO_LONG`. |
| **(d) Probe status** | **CONFIRMED**, PROBE-LEDGER wave 3 probe 4, `a2bbb000001Dk1FAAS`. |
| **Loan scope: settled, and the answer is NO** | `loanIds` is **not** added to this action. Wave 7: `LLC_BI__Annual_Review__c` holds 1 row org-wide and **0 rows link a loan**; the `LLC_BI__Loan__c` lookup is nillable and unused in practice. There is no org precedent to mirror, so adding loan scope here would be inventing a pattern the bank does not use. Do not re-litigate without new evidence. Loan scope belongs on `LLC_BI__Review__c`, where nCino's own `LLC_BI__CreateCreditReviewInvoker` populates `LLC_BI__Review_Loan__c` natively. |

**Scale labelling (A28 and A26).** Three rating surfaces with three shapes: the review scale is 1 to 12;
`LLC_BI__Risk_Rating__c` on `LLC_BI__Product_Package__c` is 1 to 10; on Loan the field is
`LLC_BI__Risk_Grade__c` and `LLC_BI__Risk_Rating__c` does not exist there at all. Every panel field
naming a rating states which surface and which scale it is on. The rating and PD platform is called
**Snowflake**.

### A33.4.8 Create Service Request (`create-service-request`)

Write object: `Case`. **Config decision taken (Fabian, 2026-07-25):** add the picklist value
`Service Request` to `Type` and `Agent` to `Origin` on bankinggpt, so the data is honest rather than
reusing `Question`.

| | |
|---|---|
| **(a) Required and set-once** | Zero hard-required fields; three non-createable fields; the least constrained write target in scope. The execute step sets `AccountId`, `Type`, `Origin`, `Status = 'New'` (also the default), subject and description, plus the source reference `{ kind: 'm365-message', id, webLink }` and provenance. `Priority` defaults to `Medium`. Per the A33.3.1 allowlist: create at `New` only, no status transitions, no closure. |
| **(b) Active VRs mirrored client-side** | **Zero validation rules on Case**, probe-confirmed. The binding constraint is configuration, not code. **Degraded mode is DECIDED and acceptable** (founder decision, Fabian, 2026-07-26): until the two picklist values are deployed the tool runs with `Type = 'Question'` and `Origin = 'Web'` (the probe-proven combination) and **declares the mismatch in the confirm summary**, so it is visible to the banker rather than hidden. It never claims the case is typed as a service request when it is not. Once the values are deployed the tool switches to `Service Request` / `Agent` and degraded mode is removed. **Picklist values only:** no Service Request record type is added (founder decision, same date), so the two complaint-oriented record types stay untouched and the semantic rides on `Type` and `Origin`. |
| **(c) Automation the tracker must show** | `FinServ.CaseTrigger` (before insert, before update) and `slackv2.caseTrigger` (after insert, after update, before delete). The Slack trigger is the largest in scope and may **post to Slack** on insert. **No automation side effect was observed during the probe, which is absence of observation, not proof of absence:** nothing in that probe watched Slack. It stays an `observed_side_effect` step and stays in the confirm summary until a probe explicitly watches for it. |
| **(d) Probe status** | **CONFIRMED.** `PROBE-LEDGER.md` Probe 2: `Case 500bb00000qor81AAA` against Piedmont `001bb00001DLtRMAA1` with `AccountId`, `Subject`, `Type = 'Question'`, `Origin = 'Web'`. No validation walls. 2026-07-25. Deletion of the probe record is **not confirmed**, tracked in the ledger's outstanding items. The `Service Request` / `Agent` values remain a **config prerequisite**, not a code blocker, and are work package 1 in `BUILD-BRIEF-V2.md`. |

### A33.4.9 Actions with no contract in this amendment

| Action | Status |
|---|---|
| `draft-credit-memo` | **Out of scope by ownership boundary** (Fabian, 2026-07-25). The credit memo solution is Noland's, delivered through the Credit Memo MCP server. This action wires to that server's tools as an integration seam and gets **no** `stage_` / `execute_` Apex pair of ours. Our standing duty on any memo the cockpit surfaces: verify the rendered document against the source record, because PDF generation keys on a hash of loan record id plus template content and collisions silently substitute another borrower's data (PDI-00023618, no workaround). |
| `generate-spreading` | **GAP.** The `Spread*` write contract was never enumerated: required fields, the Statement Record to Period to Type parent chain, and locked-period semantics are all unknown. No tool may be built for this action from present research. A follow-up describe pass on `LLC_BI__Spread_Statement_Record__c`, `LLC_BI__Spread_Statement_Period__c`, `LLC_BI__Spread_Statement_Record_Value__c` and `LLC_BI__Spread_Statement_Type__c` is a prerequisite. It remains a read-backed action today (`boom_get_spread` / `boom_get_ratios`). |

### A33.4.10 Standing rules on writability and probes

1. **Every write object gets a controlled insert probe before its tool is built.** The probe inserts a
   minimal record, verifies it, and deletes it, recorded in `PROBE-LEDGER.md` with actor, date, request
   fields, returned id, verification and deletion confirmation. The one permitted variation: where the
   insert wakes irreversible or cascading product automation (the loan clone and its junction), the
   probe is **deferred into the build phase** and run in isolation as that build's first step. Deferral
   must be stated with its reason in the table, as A33.4.1(d) and A33.4.2(d) do. It is never silently
   skipped.
1a. **Loan-clone probes run against a THROWAWAY account** (founder decision, Fabian, 2026-07-26). They
   run in bankinggpt, but **never against Piedmont and never against any demo-visible account**. The
   probe creates its own disposable account and package, exercises the clone there, and is cleaned up
   with **verified** deletion recorded in `PROBE-LEDGER.md`. Rationale: a credit action is not cleanly
   reversible, and a half-built clone or an orphaned junction row sitting on the flagship demo
   relationship would be visible in the next demo and effectively unfixable. No exceptions, including
   "just one quick test".
2. **Writability claims cite a probe row, never a describe read.** The `sobject` MCP `getObjectSchema`
   **strips permission facts**: it reported **0 createable fields** on
   `LLC_BI__Collateral_Valuation__c` for a System Administrator who then inserted into that object
   successfully. A describe reporting a field as non-createable is not evidence a write will fail, and
   one reporting it as createable is not evidence it will succeed.
3. **Probe evidence lives in `PROBE-LEDGER.md`, not in this spec.** Current state, in summary: three
   objects CONFIRMED (`LLC_BI__Collateral_Valuation__c`, `Case`, `LLC_BI__Review__c`); seven questions
   still PROBE PENDING, of which the `acnpex_covenantApprovalProcess` entry criteria are **gating** for
   the covenant tool and the loan-shaped probes are deliberately deferred to the build phase. See the
   ledger for per-probe evidence and its own outstanding items.
4. **Traceability wording (v2 correction).** ACTIONS-DESIGN states, truthfully for its own read-only
   scope, "no org mutated" and "Zero DML". **The probes postdate that document** and answer questions it
   explicitly left open (its §7 blocking unknown 1). Nothing in this spec may cite ACTIONS-DESIGN for a
   write outcome, or the ledger for an org-structure fact.
5. **Re-run every write-contract describe as the actual service identity** before shipping. All three
   probes ran as System Administrator, and `createable` / `updateable` are FLS-scoped to the running
   user. Missing FLS edit on the renewal and modification flags in particular causes **silent**
   mis-typing with no exception raised.
6. **The rules scan is point-in-time.** Validation rules can be added after we ship. The mitigation is a
   re-runnable, diffable bank-rules scan with drift surfaced as an alert, not a code change.

---

## A33.5 TOOL CONTRACTS

**A33.5.1 One wire envelope, no exceptions** (v2, finding 6). Apex `@InvocableMethod` tools on the
Customer 360 server, named `stage_<action>` and `execute_<action>`. The **only** transport is the
Salesforce invocable envelope the read tools already return:

```
{ content: [ { actionName, isSuccess, errors, outputValues, sortOrder, version } ] }
```

One element per input, **positional**: element `i` belongs to input `i`. The client unwraps with the
existing `unwrapInvocable` / `unwrapInvocableOne` in `app/src/channel/mcp.ts`. `isSuccess: false` or
non-null `errors` is a per-element transport-level failure and must not contaminate its siblings.

**The typed result lives INSIDE `outputValues`, discriminated by `ok`.** There is no competing top-level
shape; v1's parallel `{ ok: false, ... }` envelope is deleted.

```ts
type ToolOutput<T> =
  | { ok: true;  result: T }
  | { ok: false; error: ToolError };
// outputValues IS a ToolOutput<T>. Transport failure => isSuccess:false / errors.
// Domain failure  => isSuccess:true, outputValues.ok === false.
```

A domain failure (a validation rule bounced us, a precondition moved) is a **successful invocation
carrying `ok: false`**. Only transport and Apex-level faults use `isSuccess` and `errors`. That
distinction is what makes the two layers independently testable.

**A33.5.2 Common input envelope.**

| Field | Meaning |
|---|---|
| `idempotencyKey` | Client-generated, stable across resume. Enforced by us, never assumed from nCino. |
| `productPackageId` | The deal anchor. Written for package-anchored actions, and used for the A33.3.6 deep link in all of them. |
| `accountId` | The borrower relationship. |
| `rationale` | Feeds the audit ledger and, where applicable, the memo. |
| `payload` | The typed, action-specific field set from the panel schema. |
| `stagingId` + `planHash` | `execute_*` only. Binds the execution to the exact plan the banker confirmed. |
| `decisionToken` | `execute_*` only. See A33.5.4. |
| `approverUserId` | `execute_*` only. **Required on every `execute_*` without exception** (v2, finding 7). |

**A33.5.3 Staged output is a plan, and only a plan.**

| Field | Notes |
|---|---|
| `stagingId` | The handle `execute_*` takes. |
| `planHash` | Hash over the ordered `steps[]` plus the resolved field values. Immutable. `execute_*` refuses a mismatch. |
| `summary` | What will be written, in banker language. Drives the confirm gate copy. |
| `steps[]` | `{ id, type, label, object, fields[], automationWoken[], verification, waitBudgetMs? }` per A33.3.2. |
| `warnings[]` | Side effects the banker must see before confirming (possible Slack post, Booked email alert, approval chain start, auto-created opportunity). |
| `suggestions[]` | The `Suggestion` records that fed the plan, with `asOf` and `policyVersion`, so the confirm gate can recompute per A33.2.7. |
| `provenance` | Per-field prefill provenance plus any `NarrativeAttribution`, so the ledger records what was machine-supplied, what the banker typed, and what agent prose a human revised. |

**No `stage_*` output contains a record id, because `stage_*` created no record.**

**A33.5.4 The decision token proves confirmation of a plan, not credit approval.** `decisionToken` is
minted by the panel's confirm gesture, is single use, and is bound to the `stagingId`, the `planHash`,
and the banker's user id. **The model cannot mint it.** No `execute_*` runs without it, and none runs
against a `planHash` other than the one the token carries.

Stated plainly so nobody reads more into it than it holds: the token is evidence that a named human saw
a specific plan and pressed confirm. It is **not** a credit approval, it does not stand in for one, and
no tool may write a state that the bank's own process is supposed to mint (A33.3.1).

**A33.5.5 Bypass fence, scoped honestly** (v2, finding 4).

- `LLC_BI__Exclude_Flow` and `LLC_BI__Exclude_Trigger` are **permissible for orchestration**, granted
  **per action**, never blanket. Suppressing side-effect automation (the Booked-stage email alert, the
  silent memo approval) is desirable; suppressing legitimate back-fill is not.

**The per-action matrix is binding** (founder decision, Fabian, 2026-07-26). This is the whole set. An
action not on this table runs without the bypass.

| Action | `Exclude_Flow` | Why |
|---|---|---|
| `loan-modification` | **WITH** | Suppresses the Booked-stage email alert and the silent memo flip to Approved during a credit action that touches loan stage state. |
| `renewal` | **WITH** | Same automation surface as modification. |
| `new-facility-request` | **WITHOUT** | Its two-phase design **depends** on the async Loan Detail creation flow. Suppressing it would break the action, not protect it. |
| `covenant-review` | WITHOUT | |
| `collateral-valuation` | WITHOUT | |
| `annual-review` | WITHOUT | The `Review After Save` flow assigns the record type and the loan officer for us. We want it. |
| `risk-rating-review` | WITHOUT | |
| `create-service-request` | WITHOUT | |

- `LLC_BI__Exclude_Validation` is **NEVER granted.** Scope of what that buys, stated precisely: all 18
  active **Loan** validation rules end with `NOT($Permission.LLC_BI__Exclude_Validation)`, so
  withholding it makes our tools structurally incapable of writing a post-approval **Loan stage**. It
  does **nothing** for Case, Collateral Valuation, Review, Risk Rating Review or Covenant Compliance.
  Those objects are fenced by the A33.3.1 transition allowlist, which is the primary control.
- Separately and usefully: every covenant, collateral, review and entity-involvement rule in this org
  references no `$Permission` at all, so those bank rules apply to the agent exactly as to a banker. We
  do not fight that. An agent that could bypass a bank's credit-policy rules would be an SR 11-7
  problem, not a feature.
- The only supported credit-action bypass hook,
  `nFORCE.ExecutionContext.containsContext('CREDIT_ACTION')`, is **Apex-only**: validation rules and
  flows cannot read it.

**A33.5.6 Error shape (inside `outputValues`).**

```ts
interface ToolError {
  code: string;          // branches as describeFailure() in channel/mcp.ts already branches
  message: string;       // our mapped banker copy
  orgError?: string;     // the org's text, verbatim
  step?: string;         // which plan step, for execute_*
  resumable: boolean;
  idempotencyKey: string;
}
```

One error doctrine, shared with the connector layer. Ambiguous codes are never auto-retried (A33.3.3).

**A33.5.7 Per-tool request schemas** (v2, finding 7). Legend: **R** required, **D** derived (from the
named source), **O** optional, **n/a** not applicable. Every `execute_*` additionally requires
`stagingId`, `planHash`, `decisionToken` and `approverUserId`; those four columns are omitted because
the answer is R for every execute row and n/a for every stage row.

| Tool | `idempotencyKey` | `productPackageId` | `accountId` | `rationale` | Action-specific payload |
|---|---|---|---|---|---|
| `stage_loan_modification` | R | **R** (the anchor) | D from package | R | `loanId`, `requestedChanges { amount?, maturityDate?, rate?, term? }` |
| `execute_loan_modification` | R (same key) | R | D | D from staging | none beyond the plan |
| `stage_renewal` | R | **R** | D from package | R | `loanId`, `newMaturityDate`, optional repricing |
| `execute_renewal` | R | R | D | D | none beyond the plan |
| `stage_new_facility` | R | **R** | D from package | R | `product` (from `Construction, Equipment, Line of Credit, HELOC, Purchase, Deposit, Term`), `amount`, `termMonths`, `purpose`, `applicationMethod` |
| `execute_new_facility` (phase 1) | R | R | D | D | none beyond the plan |
| `execute_new_facility` (phase 2) | R (same key) | R | D | D | `loanId` from phase 1. Performs the single allowlisted hop, `Qualification` to `Proposal`, after Loan Detail verification. |
| `stage_covenant_review` | R | D from account, deep link only (Product Package is **not** a covenant attachment point) | **R** | R | `covenantComplianceId`, `assessment { result, observedValue, periodEnd, narrative }` |
| `execute_covenant_review` (phase 1, narrative) | R | D | R | D | none beyond the plan. **HELD** pending the entry-criteria probe. |
| `execute_covenant_review` (phase 2, status) | R (same key) | D | R | D | none beyond the plan. **HELD** pending the entry-criteria probe. |
| `stage_collateral_valuation` | R | D via `LLC_BI__Loan_Collateral2__c` (`LLC_BI__Collateral__c` has no Account field), deep link only | D via the pledge junction | R | `collateralId`, `value`, `valuationDate`, `type`, `source`, `description`, `primary` |
| `execute_collateral_valuation` | R | D | D | D | none beyond the plan |
| `stage_annual_review` | R | O (package-scoped review) | **R** | R | `reviewType` from `Annual, AdHoc, Problem Loan` (**required**, nothing defaults it), narrative bundle |
| `execute_annual_review` | R | O | R | D | none beyond the plan. Creates at `In Progress`, then `handoff`. Never `Complete`. |
| `stage_risk_rating_review` | R | D, deep link only (a risk rating review **cannot** be initiated from a Product Package) | **R** (the object's hard-required field) | R | factor scores; `overrideValue` plus a **required** `comment` when overriding |
| `execute_risk_rating_review` | R | D | R | D | none beyond the plan. Creates at `In Review` only. |
| `stage_service_request` | R | D, deep link only | **R** | R | `requestType`, `summary`, `reference { kind, id, webLink }` |
| `execute_service_request` | R | D | R | D | none beyond the plan |

**Service request execute story** (v2, finding 7): the Case insert is a **single synchronous write step
with no async automation of ours**, so `execute_service_request` runs immediately after confirm rather
than deferring. It is still token-gated exactly like every other execute, still returns a typed plan
result, and still carries the possible-Slack-post `observed_side_effect` step. "Immediate" describes
latency, not exemption.

**A33.5.8 Doctrine carried forward.** All writes sit behind `assertWritesAllowed()`. Every action writes
an audit record to the Snowflake decision ledger (`DECISION_LEDGER` / `AUDIT_EVENTS`) with
`actorStamp()` attribution, including suggestion overrides and their reasons (A33.2.3), the
per-field provenance and narrative attribution (A33.5.3), and the final tracker state of every step.

---

## A33.6 SKILLS MAP

Five skills. Each maps its **chat path** and its **panel path** onto the **same tools** and the **same**
suggestion rules. One orchestrator.

| Skill | Chat path | Panel path | Shared tools | Shared suggestion rules |
|---|---|---|---|---|
| `loan-modification` | "increase the revolver to $13M", "restructure the term loan" | Client Actions row, or a next-step button on a request or analysis activity entry | `stage_loan_modification`, `execute_loan_modification`, and `stage_collateral_valuation` when A33.2(a) is accepted | coverage shortfall, covenant cushion compression |
| `client-request-intake` | "what did the client ask for", "brief me on the request" | Request card and its pre-parameterized actions (A29, A30) | read fleet for the brief, `stage_service_request` | none of its own; it supplies the `CLIENT_REQUEST` prefill the other skills consume |
| `collateral-and-security` | "re-value the AR and inventory", "what is the coverage gap" | Collateral Valuation action | `stage_collateral_valuation`, `execute_collateral_valuation` | coverage shortfall (owns the gap figure) |
| `renewal` | "renew the facility closest to maturity" | Renewal action | `stage_renewal`, `execute_renewal` | covenant junction carryover, covenant cushion compression |
| `book-triage` | "what needs my attention" | The worklist home. **Opens no panel.** | read-only; no `stage_` or `execute_` tools | none; it emits next-step action ids that hand off to the four skills above |

**A33.6.1 One definition, two paths.** A skill never carries its own copy of a threshold, an availability
predicate, or an action definition. All three come from the registry plus the bank-policy layer. **If the
chat path and the panel path can produce different outcomes for the same ask, that is a defect**, and it
is the acceptance test for this section.

**A33.6.2 No `execute_*` from the chat path without the panel.** The chat path may stage. It may not
execute, because the decision token is minted by the panel's confirm gesture and is bound to a plan hash
the banker saw rendered. A chat request to "just do it" opens the panel at the confirm gate. This is the
same fence as A33.5.4, stated where a skill author will look for it.

**A33.6.3 No new subagents in v2 (roadmap note only).** One orchestrator drives all five skills.
Recorded for later: if orchestrator context becomes the bottleneck, the split candidate is the
write-execution loop (the tracker driver), not the domain skills, because the domain skills share state
and the execution loop does not.

---


## A33.7 Decisions (all nine answered, Fabian, 2026-07-26)

v2 asked nine questions. All nine are answered and folded into the body above; this section is the
record, not an ask. Where a decision overrode the draft's own framing, that is called out.

| # | Question | Decision | Folded into |
|---|---|---|---|
| 1 | Bank-policy threshold values | **Demo policy pack `demo-2026-07` accepted**, under the constraint "realistic commercial credit, not implausible numbers": coverage floor **1.10x**, covenant cushion alert floor **15 percent**, `modification.subsumesValuation` **OFF** (suggest-only). Engagement config, not product constants. | A33.2.5a |
| 2 | Which Product Package stage field is authoritative | **CORRECTION to the draft's framing.** The stages that matter are the **Loan** stages (nCino canon). The package field stays the managed **`LLC_BI__Stage__c`**; `cm_Credit_Stage__c` is **not** adopted as an authority. The Piedmont mismatch becomes a **data-quality finding** on the existing DQ mechanism, with a DQ chip when the two disagree. | A33.3.7 |
| 3 | Invocable or hand-rolled clone | **nCino invocable.** Hand-rolling recorded as a rejected alternative (zero-guardrail junction, silent failures). | A33.3.4, A33.3.1 allowlist |
| 4 | Service Request record type | **Picklist values only.** No new record type. | A33.4.8(b), open item removed from (d) |
| 5 | `Exclude_Flow` per-action matrix | **Confirmed as drafted:** modification and renewal **with**; `new_facility` **without** (it depends on the async Loan Detail flow); all others without. Now a binding table. | A33.5.5 |
| 6 | May `execute_*` write a Loan stage | **Allowlisted hops only:** exactly `Qualification` to `Proposal`, in `execute_new_facility` phase 2, after Loan Detail verification. **New Facility ships complete**; the phase-1-only branch is removed. | A33.3.1 allowlist, A33.4.3, A33.5.7 |
| 7 | Probe org, and the undeleted probe records | **Loan-clone probes run in bankinggpt against a THROWAWAY account** created for the probe, never Piedmont or any demo-visible account, with verified cleanup recorded in the ledger. | A33.4.10 rule 1a, `PROBE-LEDGER.md` |
| 8 | Banker edits of agent narrative | **Ledger-only.** `editedBy` / `editedAt` / `editedFields` live in the staging record and the decision ledger. **nCino fields hold clean final prose** with no in-field markers. | A33.1.7 |
| 9 | Service Request degraded mode | **Acceptable, decided.** Ships with `Type = 'Question'` / `Origin = 'Web'` and the mismatch declared in the confirm summary until the picklist values deploy. | A33.4.8(b) |

**Also settled in the same conversation:** the suggestion surface is **two-tier** (A33.2.8). Tier 1 is
this document's deterministic engine, rigid by design and SR 11-7 defensible. Tier 2 is the agent and
skill tier, free to propose anything, held by two rails: every cited figure traces to staged data, and
every proposed action resolves to a registry action id, which routes it through the same panel, the same
checks and the same token gate. The hardcoded set is the floor, not the ceiling.

**Nothing in A33 is open.** Build sequencing, work packages and acceptance criteria are in
`BUILD-BRIEF-V2.md`. What remains before code are probes and one config deploy, both tracked there and
in `PROBE-LEDGER.md`, not decisions.
