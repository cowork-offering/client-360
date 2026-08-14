# Customer 360 v2 Build Brief: Action Panel + Staging Pipeline

**Status:** READY TO BUILD. **Date:** 2026-07-26. **Owner:** Fable (orchestrator).
**Specification:** `A33-DRAFT.md` v3 (ANSWERED, PRE-BUILD). All nine open questions decided.
**Evidence:** `PROBE-LEDGER.md`. **Org facts:** `ACTIONS-DESIGN.md`. **Target org:** bankinggpt
(`00DDz000001qeO2MAI`).

This brief sequences the work. It does not restate the contracts: every package points at the A33
section that governs it, and a disagreement between this brief and A33 is resolved in A33's favour.

**Scope note.** Three actions ship in this wave, the three with CONFIRMED write probes:
**collateral-valuation**, **create-service-request**, **annual-review**. Loan-shaped actions
(modification, renewal, new-facility) and covenant-review are specified in A33 but gated behind probes
in WP3. Nothing in the panel framework is built for three actions only; the framework is generic and the
registry decides what appears.

---

## Dependency graph

```
WP1 (Case picklist config)  ──┐
                              ├──> WP2 (Apex stage_/execute_ pairs) ──> WP5 (registry panelSchema) ──> WP6 (chat wiring)
WP3 (build-phase probes) ─────┘                                    ┌──/
                                                                   │
WP4 (panel framework, React) ──────────────────────────────────────┘
```

**Parallelises:**

- **WP1, WP3 and WP4 all start immediately and run in parallel.** WP4 is the long pole and touches no
  org state; WP1 is a small config change; WP3 is org work with no code dependency.
- **WP2 needs WP1** only for the service-request tool's non-degraded path (the tool ships in degraded
  mode regardless, per A33.4.8, so this is a soft dependency, not a blocker).
- **WP2 and WP4 are independent of each other** and should run concurrently: WP2 is Apex on the MCP
  server, WP4 is React in the artifact. Their contract is A33.5, already written, which is precisely
  why they can be built in parallel rather than sequentially.
- **WP5 joins them.** It cannot complete until both WP2 (tools exist) and WP4 (framework exists) land.
- **WP6 is last** and depends on WP5.
- **WP3's covenant probe gates nothing in this wave** (covenant-review is not a shipping action here),
  but it must land before any covenant tool is written, so it runs early to avoid becoming the blocker
  for the next wave.

---

## WP1: Case picklist configuration deploy

**Depends on:** nothing. **Parallel:** yes, immediately. **Size:** small. **Surface:** bankinggpt config.

Deploy two picklist values, per the founder decision recorded in A33.4.8:

| Object | Field | New value |
|---|---|---|
| `Case` | `Type` | `Service Request` |
| `Case` | `Origin` | `Agent` |

No record type is added (A33.7 Q4). No validation rules, no page-layout redesign, no other field
changes. This is deliberately the smallest possible change that makes the data honest.

**Acceptance criteria**

1. Both values exist and are active in bankinggpt, verified by a describe **and** by a successful test
   insert using them (per A33.4.10 rule 2: describes do not prove writability).
2. The test insert is recorded as a probe row in `PROBE-LEDGER.md` and its record is deleted with
   deletion **verified**, against a throwaway or clearly-marked test account, not Piedmont.
3. `execute_service_request` (WP2) reads the values from the org rather than carrying them as literals,
   and its degraded-mode branch becomes unreachable in this org while remaining in the code for orgs
   that have not deployed the values.
4. The confirm summary no longer declares a type mismatch when running against bankinggpt.

---

## WP2: Apex `stage_` / `execute_` pairs for the three CONFIRMED objects

**Depends on:** WP1 (soft, service-request only). **Parallel:** yes, with WP3 and WP4.
**Size:** large. **Surface:** Customer 360 MCP server, Apex.

Build six tools, per the contracts in **A33.5**:

| Object | Tools | Spec |
|---|---|---|
| `LLC_BI__Collateral_Valuation__c` | `stage_collateral_valuation`, `execute_collateral_valuation` | A33.4.5, A33.5.7 |
| `Case` | `stage_service_request`, `execute_service_request` | A33.4.8, A33.5.7 |
| `LLC_BI__Review__c` | `stage_annual_review`, `execute_annual_review` | A33.4.6, A33.5.7 |

Plus the shared infrastructure every tool depends on:

- **Staging store.** Persists the plan, the `planHash`, per-field provenance and `NarrativeAttribution`,
  the `Suggestion` records that fed the plan, and the live tracker state per A33.3.3. Keyed by
  `idempotencyKey`. **This store is the authority on tracker state**; the client is a cache.
- **Decision token minting and validation** (A33.5.4). Single use, bound to `stagingId` + `planHash` +
  banker user id. Minted only by a panel confirm gesture. Not mintable by a model.
- **Idempotency enforcement** (A33.3.5). Ours, not nCino's: the platform is known to produce duplicate
  modification loans on failed background Apex.
- **Positional invocable envelope** (A33.5.1). `{content:[...]}`, element `i` for input `i`, with the
  typed `ToolOutput<T>` inside `outputValues` discriminated by `ok`. Transport failure uses
  `isSuccess` / `errors`; domain failure is `isSuccess: true` with `outputValues.ok === false`.
- **Ledger writes** (A33.5.8) with `actorStamp()` attribution.

**Acceptance criteria**

1. **`stage_*` performs zero domain-object DML.** Proven, not asserted: a test that runs every `stage_*`
   against a live sandbox and then queries the target objects for any new or modified record. Zero rows.
   This is the single most important test in the package (A33.0.1).
2. `stage_*` output contains **no record id**, because no record was created.
3. `execute_*` refuses: a missing token, a used token, a token bound to a different `planHash`, and a
   `planHash` that no longer matches the staged plan. Four separate negative tests.
4. **Transition allowlist enforced server-side** (A33.3.1). `execute_annual_review` refuses
   `Status = 'Complete'` and refuses any `cm_Review_Stage__c` write. `execute_service_request` refuses
   any status transition. Tested by attempting each and asserting refusal, not by never trying.
5. `execute_annual_review` sets `LLC_BI__Status__c` and `LLC_BI__Review_Type__c` **explicitly** (probe
   3 proved nothing defaults them) and never sets `RecordTypeId`.
6. `execute_collateral_valuation` sets `Active` and `Primary` explicitly, and its plan carries the
   collateral-rollup `verification` step whose failure surfaces as "valuation filed, collateral value
   unchanged" rather than a claimed coverage improvement.
7. Envelope conformance: `unwrapInvocable` / `unwrapInvocableOne` in `app/src/channel/mcp.ts` parse
   every tool response unmodified. If the client unwrappers need changing, the tool is wrong.
8. Resume works: kill a run mid-plan, resume it, and assert the re-query precondition ran and no write
   was duplicated.
9. Deslop pass and ApexDoc on all public methods, `WITH SECURITY_ENFORCED` or `stripInaccessible`
   present, per the standing Salesforce rules.

---

## WP3: Build-phase probes

**Depends on:** nothing. **Parallel:** yes, immediately. **Size:** medium. **Surface:** bankinggpt, org
reads and controlled writes. Every result lands in `PROBE-LEDGER.md`.

**Run in this order.** The first four are low-risk and independent of each other; the fifth is the
dangerous one and runs last, alone.

| # | Probe | Question it settles | Risk |
|---|---|---|---|
| 3.1 | `acnpex_covenantApprovalProcess` **entry criteria** | Which field change starts the bank's approval chain. **Gating for the entire covenant tool** (A33.4.4(d)). | Low read, but the test write may start a real chain: use a throwaway compliance record and be ready to withdraw the approval. |
| 3.2 | `LLC_BI__Annual_Review__c` (Risk Rating Review) insert | The write contract for the risk-rating action. | Low |
| 3.3 | Collateral rollup after a valuation insert | Whether the insert updates `LLC_BI__Collateral__c`, unsettled by probe 1 (A33.4.5(d)). | Low |
| 3.4 | Slack watch on `Case` insert | Whether `slackv2.caseTrigger` actually posts. Probe 2 observed nothing, which is absence of observation, not proof. | Low, but requires someone watching the Slack channel during the insert. |
| 3.5 | **Loan clone and `LLC_BI__LoanRenewal__c`** | The credit-action write path for modification and renewal. | **High. Runs last, in isolation, against a THROWAWAY account only** (A33.4.10 rule 1a and the standing rule in the ledger). Never Piedmont, never any demo-visible account. |

**Acceptance criteria**

1. Every probe recorded in `PROBE-LEDGER.md` with actor, date, **verbatim request**, **verbatim
   returned payload**, verification query and result, and deletion confirmation. The ledger's own
   outstanding item 2 (paraphrased evidence) does not recur.
2. Probe 3.5 creates its own disposable account and package, and **cleanup is verified by query**, with
   every created id checked. Anything that cannot be removed is recorded as such.
3. The two undeleted probe records from the first round (`Case 500bb00000qor81AAA`,
   `Review a5nbb00000kZKe7AAG`) are deleted or deliberately retained, and the ledger is updated either
   way. This closes the ledger's outstanding item 1.
4. Write-contract describes are re-run as the **service identity**, not System Administrator
   (A33.4.10 rule 5). Any field where the two disagree is flagged before WP2 ships.
5. Each probe result updates the relevant A33.4 table's column (d) from PROBE PENDING to CONFIRMED with
   a ledger citation, or records what still blocks it.

---

## WP4: Panel framework (React)

**Depends on:** nothing. **Parallel:** yes, immediately. **Size:** large, the long pole.
**Surface:** `app/src/`, the artifact bundle.

Generic framework, not three bespoke forms. Components:

1. **`panelSchema` renderer** (A33.1.2). Field descriptors to inputs. Formula and rollup fields never
   render as inputs; set-once fields render read-only with their reason; picklist options come from the
   org.
2. **Prefill and provenance chips** (A33.1.3). Six prefill sources onto the **unchanged** A26
   provenance union. `BANKER` renders no chip. `NarrativeAttribution` for edited agent prose, kept as
   `AGENT` with an "edited by you" marker, **ledger-only, nothing injected into field text** (A33.1.7).
3. **Suggestion engine, Tier 1** (A33.2). Deterministic math, the `demo-2026-07` policy pack loaded as
   configuration (A33.2.5a), the five input guards (A33.2.6), `asOf` and `policyVersion` stamping, and
   the mandatory recompute-at-confirm that **blocks** on divergence (A33.2.7).
4. **Confirm gate** (A33.3.1). Staging summary copy, the per-action transition allowlist rendered as
   what-will-happen, warnings surfaced before the gesture, and the decision-token mint on confirm.
5. **Tracker state machine** (A33.3.3). Eight states, the transition table, bounded waits, no dependent
   auto-run on an unverified precondition, resume preconditions, action-level terminal derivation.
6. **Deep link** (A33.3.6) to the product package from `meta.instanceUrl`, disabled chip when absent.
   Stage references key off **Loan** stage per A33.3.7; package stage is display-only from
   `LLC_BI__Stage__c` with a DQ chip when `cm_Credit_Stage__c` disagrees.

**Acceptance criteria**

1. Unit tests: each of the five input guards rejects its case; a `null` lendable value and a zero
   lendable value produce **different** rendered states; a missing policy key disables its suggestion
   and names the key rather than defaulting.
2. Recompute-at-confirm test: mutate the staged figure between panel open and confirm, assert the
   confirm blocks and the panel re-renders with the new number.
3. Tracker state-machine tests: every transition in the A33.3.3 table, plus the negative cases (no
   automatic exit from `ambiguous`; wait-budget exhaustion lands in `filed_unverified`, never `failed`;
   a dependent step does not auto-run on a `filed_unverified` precondition).
4. Zero business literals in components (A26.2 grep), including every policy-pack value.
5. `meta.instanceUrl` added to the contract and to the A26 provenance map as `NCINO`.
6. The existing artifact gates still pass: `npm run build` and `npm run typecheck` clean, bundle within
   budget, single file, no external references, zero-channel mode navigable.
7. Modal renders above the sticky nav (A31.1), focus-trapped, Esc, focus return.

---

## WP5: Registry `panelSchema` entries for the three shipping actions

**Depends on:** WP2 and WP4 both landed. **Parallel:** no, it is the join.
**Size:** small to medium. **Surface:** `app/src/actions/registry.ts`.

Add `panelSchema` to `collateral-valuation`, `create-service-request` and `annual-review`, and wire
their `apexAction` seams to the real `stage_` / `execute_` tools. Every field maps to a named org field
from the A33.4 contract table, or is explicitly staging-only.

**Acceptance criteria**

1. Every schema field maps to a field named in its A33.4 table, or is marked `{ staging: true }`. No
   field exists that the contract table does not know about.
2. Every `BANKER`-sourced field is justified by the absence of a source (A33.1.4). Reviewed field by
   field, because a lazy `BANKER` source is how "the banker confirms, never transcribes" quietly dies.
3. Availability predicates unchanged from A27.3: they read only `C360_DATA`, and unavailable actions
   stay visible and disabled with a banker-readable reason.
4. End-to-end on a sandbox: open panel, prefilled fields with correct chips, confirm, tracker runs,
   record created, deep link opens the package. One run per action.
5. The three loan-shaped actions and covenant-review remain analysis-only, with no `panelSchema`, until
   their probes land. They must not half-ship.

---

## WP6: Grounding and chat wiring for suggestion chips

**Depends on:** WP5. **Parallel:** no. **Size:** medium. **Surface:** chat path, skills.

Wire the **Tier 2** surface per A33.2.8: chat and skills may propose any suggestion, held by the two
rails (every cited figure traces to staged data; every proposed action resolves to a registry action
id, routing it into the same panel and the same token gate). Chat suggestion chips (A27.5) feed from
both tiers through one chip UI.

**Acceptance criteria**

1. **The A33.6.1 acceptance test passes:** the same ask through the chat path and the panel path
   produces the same outcome. This is the test that keeps Tier 2 from being a side door, so it is
   written as an actual test, not a review note.
2. A Tier 2 proposal that does not resolve to a registry action id is refused and says why.
3. A Tier 2 suggestion citing a figure with no staged source is refused by the grounding contract.
4. **No `execute_*` is reachable from the chat path without the panel** (A33.6.2). Negative test: a
   "just do it" instruction opens the panel at the confirm gate and writes nothing.
5. Chips render identically whether the suggestion came from Tier 1 or Tier 2. The banker does not need
   to know which engine proposed it; the rails are the same either way.

---

## What is deliberately NOT in this wave

| Item | Why |
|---|---|
| `loan-modification`, `renewal`, `new-facility-request` | WP3.5 probe outstanding. Specified fully in A33; ship next wave. |
| `covenant-review` | WP3.1 probe is gating (A33.4.4(d)). No covenant tool is written until the approval-chain entry criteria are known. |
| `draft-credit-memo` | Ownership boundary. Noland's Credit Memo MCP server, integration seam only (A33.4.9). |
| `generate-spreading` | GAP. The `Spread*` write contract was never enumerated (A33.4.9). Stays read-backed. |
| New subagents | One orchestrator in v2 (A33.6.3). Roadmap note only. |
