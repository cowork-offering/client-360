# BUILD-SPEC-V1 — KYC + Onboarding on the Customer 360 Spine

**Date:** 2026-07-28 · **Status:** BINDING build spec, Phase 0 reconciliation output · **Org:** `bankinggpt` (`00DDz000001qeO2MAI`, `fabian.goetzens@accenture.com.bankinggpt`, instance API v67.0)
**Supersedes for build purposes:** `kyc-onboarding/PLAN-OF-APPROACH.md` §3 workstream sizing and `kyc-onboarding/WRITE-FEASIBILITY.md` §1 tool specs, where this document marks a delta. All governance constraints in PLAN-OF-APPROACH §8 (Clawdy, 8 items) and §9 (Codex, 3 rounds) remain binding and are traced to implementation sites in §1.4.
**Mode of production:** read-and-spec only. Zero DML, zero deploys, zero cockpit changes were performed. Every org claim below cites the describe/query that produced it. Every behaviour that can only be settled by a write is listed as a pre-build probe in §7.1, never asserted.

**Founder directive governing this spec (2026-07-27, binding):** ships with Dreamforce framing but must be FULLY FUNCTIONING. Every flow real end to end, real writes through real governance gates, no mocked beats, no hardcoded happy paths. Simulation tolerated ONLY where the sandbox physically lacks a third-party provider, and then through the real tool path with honest `Simulated` labelling.

**Founder adjudications folded in:** (a) ownership edges pre-seeded, agent READS/CONFIRMS during onboarding; `UpsertParty` stays phase-2. (b) Attestation mechanism NOT decided here — see `ATTESTATION-BRIEFING.md`. (c) Client-facing intake IS in scope, built with abuse controls and claimed-identity stamping.

---

## 0. Executive delta — what changed since the plan was written

The plan was written 2026-07-12. Two things happened after it that re-base it.

**0.1 The write engine now exists.** `sf-build-v2/wp2/classes/` holds a deployed, 142-test-green write engine (`C360Plan`, `C360WriteGuard`, `C360ActionStaging`, `C360Picklist`, `C360Facilities` plus eight `Stage*`/six `Execute*` pairs). The plan's WS-A "shared Apex write layer" is therefore not a from-scratch build. It is an extension of an existing engine whose fence contract is already live-proven. Confirmed deployed in-org: 23 `Customer360`/`Stage*`/`Execute*` invocable actions in the Apex action catalog, all at API v67.0 (`GET /services/data/v67.0/actions/custom/apex`, and `SELECT Name,ApiVersion FROM ApexClass` via Tooling).

**0.2 `KYC__c` is not a shell. It is a 206-field, record-typed, trigger-bearing KYC application already built in this org.** WRITE-FEASIBILITY §1 Tool 3 describes it as *"Bare shell: `Name` + `Account__c` (REQ →Account) only"* and prescribes adding seven fields. That description is an artifact of field-level security, not of the object.

- `sf sobject describe -s KYC__c` as our identity returns **8 fields**.
- `SELECT QualifiedApiName,DataType,Label,Length FROM EntityParticle WHERE EntityDefinition.QualifiedApiName='KYC__c'` (Tooling, FLS-independent) returns **206 fields**.
- `SELECT Parent.Name, COUNT(Id) FROM FieldPermissions WHERE SobjectType='KYC__c' GROUP BY Parent.Name` returns exactly three holders: `sfdc_slack` (194), `BloomSystemAdmin` (193), `Bloom_Relationship_Manager` (193).
- `SELECT PermissionSet.Name FROM PermissionSetAssignment WHERE AssigneeId IN (SELECT Id FROM User WHERE Username='fabian.goetzens@accenture.com.bankinggpt')` returns exactly two: `C360_Action_Staging_Access`, `X00ex00000018ozT_128_09_43_34_1`. We hold none of the Bloom sets.

This is LESSONS-NCINO-APEX lesson 2 firing in advance: *"`No such column` does not mean the field does not exist… ground truth for field existence is the Tooling API, not anonymous Apex and not REST describe — both are FLS-filtered."* The plan's Tool 3 schema design was built on an FLS-filtered describe and must be discarded.

**What `KYC__c` actually carries** (metadata retrieved via `sf project retrieve start -m CustomObject:KYC__c`, 1.18 MB object file):

| Field | Type | Restricted | Values |
|---|---|---|---|
| `Account__c` | **MasterDetail** | — | → Account. Set-once (`updateable: false`), no `OwnerId`, OWD `ControlledByParent` |
| `KYC_Status__c` | Picklist | **true** | `Pending`, `Verified`, `Failed` |
| `Stage__c` | Picklist | **true** | `Id Verification`, `Wealth Sources`, `Services`, `Summary`, **`Confirmation/Attestation`**, `Entity Information`, `Documentation`, `Due Diligence`, `Beneficiary Owners` |
| `ClientAttestation__c` | Checkbox | — | — |
| `Type_Of_Request__c` | Picklist | **true** | `New Client`, `KYC Update` |
| `Client_Status__c` | Picklist | **true** | `Center of Influence`, `Client`, `Prospect` |
| `Beneficial_Ownership_Info_Obtained__c` | Picklist | **true** | `Yes`, `No` |
| `Politically_Exposed_Person_Political__c` | Picklist | **true** | `Yes`, `No` |
| `Created_from_Mobile__c` | Checkbox | — | — |
| `Products__c` | MultiselectPicklist | true | 16 values |

Record types (from describe, visible even under FLS): `Entity` (`012Hp000002JdV0IAK`), `Individual` (`012Hp000002JdV1IAK`), `Master`.
Active local trigger: `ACN_FXT_KYC` on `KYC__c` **after insert**, API v47, calling `ACN_FXT_KYCTriggerHandler.createFinancialAccount`. Body read via Tooling; the handler is a no-op today (its only side-effecting line, `ACN_FXT_LinkCustomerAccount.createAccount`, is commented out) but it is gated on `kyc.Created_from_Mobile__c` and swallows exceptions to `System.debug`. **It reads `Created_from_Mobile__c` and `Products__c` off `Trigger.new` without querying them** — meaning any insert path that does not populate the trigger's field set is at the mercy of what the platform hands the trigger. Treat as live automation, probe it, do not assume no-op.

Three consequences that change the build:

1. **The org already ships a KYC attestation vocabulary.** A `Confirmation/Attestation` stage and a `ClientAttestation__c` flag exist. That is a *client* attestation, not a banker clearance, and the distinction is load-bearing — see `ATTESTATION-BRIEFING.md` §3.3(a).
2. **`KYC_Status__c` is `restricted: true`.** Off-list writes fail loudly (`INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST`, lesson 15aa) rather than corrupting silently. This is the opposite of the Onboarding picklists — see §2.1.
3. **`KYC__c` is the wrong grain for a screening result** — see §2.3 and decision D-2.

**0.3 The ChatGPT schema budget is already blown, before adding anything.** Measured, not estimated — see §5.3. The current 23-tool `Customer360` server definition costs **47,512 bytes** of tool-list payload. This is the single most consequential finding in this document and it invalidates the plan's framing of the budget as a question about adding five tools.

**0.4 Provenance correction — the onboarding container is OUR design decision, not theirs.**

This must be stated correctly everywhere the spec or the deck references the other team's architecture, because getting it backwards would be both a factual error and a strategic one.

**Aethon uses zero nCino objects.** Verified: `grep -ric "ncino|LLC_BI|Onboarding__c"` across all eleven files in `kyc-onboarding/incoming/` (the four `extracted-site-*.txt`, `extracted-aethon-asbuilt.txt`, `extracted-layered-target.txt`, both reference-architecture `.html` exports, and the four `website-capture/dom-*.html`) returns **zero hits**. Their org is FSC-only wealth. Their data model, verbatim from `extracted-aethon-asbuilt.txt` lines 59–67, badged `IN USE`:

> FSC Data Model / IN USE / Person Accounts / Households / Financial Accounts / Holdings / Insurance Policies / Assets & Liabilities / Financial Goals

Their write path, verbatim from the same file lines 53–57:

> Hosted MCP Servers / IN USE / `sobject-reads` / `sobject-mutations` / `custom / invokeflows`

Those are **generic sObject tools over FSC standard and managed objects**. There is no onboarding container in their architecture at all — no nCino, and no custom onboarding object either. The only place onboarding appears as a *workflow* is the older PNG variant's "account opening journey" tile on a target-state diagram that makes no build claim (`ATTESTATION-BRIEFING.md` §2.1).

**Therefore:** anchoring the onboarding case on `LLC_BI__Onboarding__c` — with its native `KybAndKycOnly` type, its `LLC_BI__Product_Package__c` lookup, and its four-value stage lifecycle — is **our commercial-first design decision**, made because `bankinggpt` has nCino co-resident and because a commercial borrower onboarding genuinely needs a product-package anchor. It is not inherited from their side, it is not a convergence, and it must never be described as one.

**What this means for the narrative.** The honest framing is: *they built generic sObject writes over the FSC wealth model; we built a governed, typed write engine and anchored it on the industry object that fits the vertical.* That is a stronger claim than convergence, and it is true. It also sets up the swap story below — because if the container is our choice, it has to be swappable, or the wealth-second half of the umbrella has nowhere to run. That is what §2.10 exists for.

---

## 1. Delta reconciliation

### 1.1 Workstream-level

| Plan workstream | Verdict | Evidence / what changes |
|---|---|---|
| **WS-A0** decisions + schema | **ADAPT** | Schema verification largely DONE by this document (§2). `Audit_Event__c` creation stands. `KYC__c` extension shrinks to 6 fields, not 7 net-new, and moves to a new sibling object (D-2). Task-polymorphism check (Clawdy #1) is **CLOSED — verified** (§2.4). |
| **WS-A1** shared Apex write layer | **ADAPT, not BUILD** | `C360WriteGuard` + `C360ActionStaging` + `C360Plan` are the shared service layer Codex round-1 #2 demands. Net-new: guard rows for 5 objects, the audit emitter, the Complete gate, the attestation entry point. |
| **WS-A2** hosted-MCP wrappers | **ADAPT** | Pattern is `Stage*`/`Execute*`; two-step deploy discipline (lesson 5) applies. Server-definition split is now forced by §5.3, not optional. |
| **WS-A3** seed data + demo flow | **BUILD** | Unchanged, re-rated M per Clawdy #8. Ownership edges pre-seeded per adjudication (a). §8. |
| **WS-B1** triage queue render | **ADAPT** | `components/Worklist.tsx` exists with sortable rows + search (`buildWorklistRows`, `data/worklistRows`). Adding an "In onboarding" zone is an extension, not a build. §6. |
| **WS-B4** onboarding/KYC status widget | **ADAPT** | Absorbed into §6 as the lifecycle-keyed tab set. Not a separate widget per the founder scope addendum. |
| **WS-D** client-facing intake | **BUILD** | In scope per adjudication (c). §4. |
| **Attestation mechanism** | **DECISION PENDING** | Not chosen here. `ATTESTATION-BRIEFING.md`. The service-layer interface it must satisfy is specified in §1.3.6 regardless of which mechanism wins. |

### 1.2 The engine, as built — what it already gives us

Read from `sf-build-v2/wp2/classes/`. Every claim cites the file.

| Capability | Where | Contract |
|---|---|---|
| Per-object transition allowlist | `C360WriteGuard.cls` | `assertAllowed(objectApiName, operation, values)`. `CREATE_STATES` pins the only states an object may be created with; `UPDATE_TRANSITIONS` pins field→permitted-target-values; `FORBIDDEN_FIELDS` pins fields no tool may ever write; `OP_DELETE` throws unconditionally. Class doc: *"Every write in this package passes through assertAllowed(), including the ones that are refused, so a refusal is provable by calling the same entry point the tool calls."* |
| FLS must-survive assertion | `C360WriteGuard.stripAndVerify(record, mustSurvive)` | Throws `GuardException` when a required field was stripped by FLS. Lesson 17's trap, already solved. |
| Object-writability precheck | `C360WriteGuard.assertObjectWritable` | Refuses when the running identity cannot create the object. |
| Plan / hash / typed steps | `C360Plan.cls` | Step types `write`/`verification`/`wait`/`handoff`/`observed_side_effect`; step states `pending`/`waiting`/`filed_unverified`/`verified`/`failed`/`skipped_not_attempted`; terminal states `success`/`partial`/`failed`. `hash()`, `serializePlan()`, `terminalState()`, `markRefused()`. |
| Single-use token, idempotency, replay | `C360ActionStaging.cls` | `stagePlan(...)` returns `Staged{stagingId, planHash, decisionToken, replayed}`; `claimForExecute(stagingId, planHash, decisionToken, approverUserId)` — *"The named human bound to the token. Must be the running identity."*; `findCompleted(idempotencyKey)`; `recordOutcome(...)`. Storage object `cm_Action_Staging__c`, permission set `C360_Action_Staging_Access` (confirmed in-org). |
| Org-read picklists | `C360Picklist.cls` | `activeValues()`, `preferredOrFallback()`. Class doc is explicit about its limit: *"It is not a claim that an absent value would be rejected on write."* |

**What the engine does NOT yet have, and we must build:**

- No audit object and no audit emitter. `Audit_Event__c` does not exist in this org (`SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName LIKE '%Audit%'` returns 37 rows, none of them ours; the only custom audit surfaces are nCino's managed `nFORCE__Audit_Log__c` and `nFORCE__Audit_Event__e`).
- No rejection-audit path. `GuardException` today throws and the transaction rolls back — Codex round-1 #3's paradox is live and unmitigated in the current engine.
- No system-mode seam. Codex round-2 requires audit insert + rejection publish to run elevated while all business DML stays `USER_MODE`.
- No attestation concept anywhere.
- **No container abstraction.** The engine's `C360WriteGuard` names concrete objects as compile-time constants (`OBJ_LOAN`, `OBJ_CASE`, …). The credit tools are legitimately nCino-specific, so that is correct for them. The onboarding tools are not, and need the adapter in §2.10 — which is additive: the existing constants and their allowlist rows are untouched.

### 1.3 Per-tool recommendation: `stage_`/`execute_` pair vs plain audited write

The plan (§2 governance line) says *"agent executes plain audited writes… humans gate KYC clearance attestation and the final `Complete` transition."* The engine offers a second, stronger primitive the plan predates. The question is which tool gets which.

**Governing principle adopted here:** the `stage_`/`execute_` fence is for writes where *a human should look at a plan before it happens*. A hard service-layer refusal is for writes that *must never happen from this surface at all*. These are different controls and the demo is stronger when it uses both rather than confirming five times in a row. Codex round-1 #2 is satisfied either way, because both controls live in the shared service layer.

#### 1.3.1 `CreateProspect` → **`stage_`/`execute_` PAIR**

**Rationale.** (a) Multi-object unit of work: `Account` insert + `LLC_BI__Onboarding__c` insert + optional `KYC__c` insert. Codex confirmed-spec requires an explicit unit-of-work with savepoints for exactly this shape, and `C360Plan`'s typed steps + per-step verification is the mechanism already built for it. (b) It creates a **permanent Account in a shared sandbox** — highest residue risk of the five, and lesson 9 warns that fixture-shaped chains hit creation-time validation rules that probes never see, with the error surfacing on the wrong object. A plan that names each step makes that legible. (c) Idempotency is platform-enforced for free: **`LLC_BI__Onboarding__c.LLC_BI__lookupKey__c` is `unique: true, externalId: true, idLookup: true`** (verified in describe) — this satisfies Codex confirmed-spec *"add a unique external-id custom field (platform-enforced) instead of relying on query-then-insert (race-safe)"* **with zero new fields**. (d) It is the natural conversational confirm: "open a file on this entity?" is a question a banker should answer.

**Cost:** two invocations. **Delta vs plan:** the plan classified this as a plain audited write. This spec upgrades it.

#### 1.3.2 `RecordKycResult` → **PLAIN AUDITED WRITE, with a value-level refusal**

**Rationale.** WRITE-FEASIBILITY is right on the principle: *"RECORDING a screening result is bookkeeping (plain audited write). CLEARANCE attestation… stays a human gate."* Recording an external fact is not the agent's judgment, and gating it would make the agent unable to do the one thing it is for.

**But the line must be drawn inside the tool, not around it.** `KYC__c.KYC_Status__c` is `restricted: true` with values `Pending`, `Verified`, `Failed`. `Verified` reads as a decision. Therefore:

- The tool may write `Pending` and `Failed` freely (both are honest recordings of an incomplete or adverse screen).
- **`KYC_Status__c = 'Verified'` is refused unconditionally by `C360WriteGuard`**, using the existing `UPDATE_TRANSITIONS` value-allowlist mechanism, exactly as `OBJ_COVENANT_COMPLIANCE` today permits only `{Compliant, Exception}`. No new mechanism needed.
- `Verified` can only be set by the attestation entry point (§1.3.6).

This is the same shape as the Complete gate and it means the *KYC clearance* gate is enforced by field value in the shared service layer, satisfying Codex round-1 #1 and #2 by construction.

**Screening results are append-only.** See D-2 (§2.3): results land on a new `KYC_Screening__c`, not on `KYC__c`, keyed by a unique composite external ID per Codex round-2.

#### 1.3.3 `AttachDocument` → **PLAIN AUDITED WRITE**

**Rationale.** Additive, no state transition, no decision content. WRITE-FEASIBILITY rates it S and notes the 3-step pattern is live-validated in `experience-mcp/src/ncino.js` `docmanSave()`. Verified in-org that both parents accept the link: `ContentDocumentLink | LinkedEntityId` appears in the child-relationship list of **both** `LLC_BI__Onboarding__c` and `KYC__c` describes.

**Binding caveats:** lesson 32 applies exactly — the `ContentVersion` insert → read `ContentDocumentId` → insert `ContentDocumentLink` sequence must build a **fresh sObject** for the link, never re-update the inserted `ContentVersion`. And `LLC_BI` ships an active `ContentVersionTrigger` (`SELECT Name,TableEnumOrId,NamespacePrefix FROM ApexTrigger`), so a ContentVersion insert wakes managed code — probe it (§7.1 P-4).

#### 1.3.4 `AdvanceOnboardingStage` → **PLAIN AUDITED WRITE, with a hard Complete refusal**

**Rationale.** Intermediate hops (`CustomerEngagement`→`DueDiligence`→`Validation`) are bookkeeping of work that has already been done elsewhere. Confirming each one is demo-hostile and adds no control. The control that matters is the terminal one, and it should be a **refusal**, not a confirm — a confirm dialog can be clicked through by the same agent-driven session, a refusal cannot.

**Implementation, satisfying Codex round-1 #1 + #2 exactly:**

The guard's transition map for the container permits the intermediate values and omits the terminal one, on **both** fields:

```
UPDATE_TRANSITIONS[container.objectApiName()] = {
    container.field('stage')  => container.value('intermediateStageValues'),
    container.field('status') => container.value('openStatusValues')
                              ∪ container.value('abandonedStatusValues')
}
// terminal values absent BY CONSTRUCTION — never enumerated, so never re-addable by accident
```

Because `assertAllowed` refuses any value not in the set, **both** `Stage = Complete` and `Status = Complete` are refused, from every caller of the service layer — the MCP wrapper, the intake Apex REST, and any future front door. Codex round-1 #1 is a direct consequence of the existing mechanism.

**Built from the adapter's value map, not hardcoded** (§2.10.1). An earlier draft of this spec used a literal map naming `'DueDiligence'`, `'Validation'`, `'Complete'` directly; that version would silently stop gating on a container swap, because the terminal value would no longer be the string `'Complete'`. Deriving the permitted set from `intermediateStageValues` means the terminal value is never enumerated anywhere and the gate holds for any container. AC-C4 tests exactly this with a stub whose terminal value is `'ZZ_TERMINAL'`.

**Compare-and-set** (Codex confirmed-spec, anti-stale-agent): the tool takes `expectedCurrentStage` and refuses when the record's live stage differs. Not `required=true` on the wire (lesson 16aa) — enforced in Apex.

**Delta vs plan:** the plan and WRITE-FEASIBILITY both discuss "raw PATCH skips nCino's governed Mark Stage as Complete flow" as an accepted trade-off. **New evidence sharpens this:** the org ships nCino's native onboarding UI as ten managed LWC bundles (`SELECT DeveloperName,NamespacePrefix FROM LightningComponentBundle` → `customerOnboarding`, `onboardingQuestionnaire`, `onboardingCaseSidePanel`, `onboardingEntityStructure`, `onboardingJourneySelector`, `onboardingRelationshipSelector`, `onboardingServices`, `onboardingAddEntityModal`, `customerOnboardingCancelModal`, `onboardingCaseSidePanelCard` — all namespace `nCino`, API v54–56), plus **30 `<actionOverrides>` on the object**. There is a real governed UI here. Since we never write `Complete`, we never contend with its terminal transition, which materially reduces the raw-PATCH exposure the plan flagged. Intermediate hops still bypass whatever the managed UI does — probe P-2 (§7.1) settles what that is.

#### 1.3.5 `LogInteraction` → **PLAIN AUDITED WRITE (Task), gated on a pre-flight probe**

**Verified:** `Task | WhatId | Tasks` is present in the `LLC_BI__Onboarding__c` child-relationship list, and `Task | WhatId` likewise on `KYC__c`. **Clawdy amendment #1 is CLOSED: `Task.WhatId` accepts `LLC_BI__Onboarding__c`.** This was WRITE-FEASIBILITY's most load-bearing unverified assumption.

**But `Task` is the most dangerous of the five objects, not the safest.** Three active triggers on `Task` (`SELECT Name,TableEnumOrId,NamespacePrefix FROM ApexTrigger WHERE TableEnumOrId='Task'`): `FinServ.TaskTrigger`, `LLC_BI.TaskTrigger`, `slackv2.task`. And `SELECT Id,Name FROM slackv2__Subscription__c` returns **5 subscriptions** (S-00000…S-00004). Lesson 15g: *"A Case created for or assigned to that user WILL attempt a post."* The same mechanism applies to Task. Probe P-5 (§7.1) is a hard gate on this tool — it must run with a trace flag and the `LIMIT_USAGE_FOR_NS` block inspected for callout/email counts before the tool is exposed.

`Task` OWD is `ControlledByParent` (verified via `EntityDefinition.InternalSharingModel`), so Task visibility follows the Onboarding record — no separate sharing design needed.

#### 1.3.6 `AttestKycClearance` → **NEW TOOL, human-gated, mechanism TBD**

Codex round-1 #6: *"The human attestation path has no scoped deliverable."* This spec scopes the **interface**; `ATTESTATION-BRIEFING.md` decides the mechanism.

Whatever mechanism wins, the service layer must expose exactly one entry point that:

1. Is the **only** code path permitted to write `KYC_Clearance__c.Cleared_By__c` / `Cleared_On__c` / `Clearance_Basis__c` (§2.3 D-3).
2. Self-stamps `Cleared_By__c = UserInfo.getUserId()`. **Never a caller-supplied user id** (Codex round-1 #4 verbatim: *"never a caller-chosen user"*). This also removes lesson 4b's name-vs-id trap by construction: there is no id parameter to get wrong.
3. Is unreachable from the intake service's integration user (permission-set scoped, §5.2).
4. Emits an `Audit_Event__c` row of type `kyc_clearance_attested` carrying the correlation id.
5. Resolves the case **through the adapter** (§2.10) — it takes a logical onboarding-case id and never a typed `LLC_BI__Onboarding__c`, so the attestation path is container-agnostic per AC-C4.
6. Reads `KYC__c.ClientAttestation__c` as a precondition and mirrors it to `KYC_Clearance__c.Client_Attested__c`. **Read-only** — we never write the pre-existing object.

The MCP-exposed `attest_kyc_clearance` tool is a thin wrapper on it, present so the *chat surface can request* attestation. Per the founder scope addendum §2, the gate holds identically regardless of calling surface: chat may request, and the Apex either accepts (because the running identity is a human banker with the attestation permission) or refuses with a banker-language message.

#### 1.3.7 Summary table

| Tool | MCP tool name(s) | Shape | Human control | Guard mechanism |
|---|---|---|---|---|
| CreateProspect | `stage_create_prospect` / `execute_create_prospect` | **Pair** | Plan confirm + token | `CREATE_STATES` on Account/Onboarding; `lookupKey` uniqueness |
| RecordKycResult | `record_kyc_result` | Single | none (bookkeeping) | `KYC_Status__c='Verified'` **refused** |
| AttachDocument | `attach_document` | Single | none | `FORBIDDEN_FIELDS`; doc-hash idempotency |
| AdvanceOnboardingStage | `advance_onboarding_stage` | Single | none for intermediate | `Stage`/`Status` = `Complete` **refused**; compare-and-set |
| LogInteraction | `log_interaction` | Single | none | `CREATE_STATES` on Task; Slack probe gate |
| AttestKycClearance | `attest_kyc_clearance` | Single | **the gate** | Sole writer of `KYC_Clearance__c.Cleared_By__c`; self-stamped; container-agnostic |

Six MCP tools, seven tool rows (CreateProspect is a pair).

### 1.4 Constraint traceability — where each binding constraint is satisfied

| Constraint | Source | Already satisfied by | Net-new code needed |
|---|---|---|---|
| Task polymorphic target check | Clawdy 1 | — | **NONE — verified closed** (§2.4) |
| Human gate in Apex not prompt | Clawdy 2 | `C360WriteGuard.assertAllowed` | Guard rows (§1.3.4) |
| `Cleared_By__c` non-writable by tool | Clawdy 3 | `FORBIDDEN_FIELDS` map | `KYC_Clearance__c` fields + guard row + FLS + trigger backstop (§2.3 D-3, §2.7) |
| Shared correlation ID across ledgers | Clawdy 4 | — | `Audit_Event__c.Correlation_Id__c` (§2.5) |
| External actor stamping on intake | Clawdy 5 | — | `Audit_Event__c.External_Actor__c` + claimed-identity fields (§4.4) |
| WS-E before A0 build | Clawdy 6 | — | process, not code |
| ChatGPT 5K cap validated at design time | Clawdy 7 / Codex | — | **§5.3 — measured, and it fails** |
| Seed data as explicit deliverable | Clawdy 8 | — | §8 |
| Gate Stage **AND** Status | Codex R1 #1 | `UPDATE_TRANSITIONS` value sets | one map literal (§1.3.4) |
| Gate in SHARED service layer | Codex R1 #2 | `C360WriteGuard` is already shared | ensure intake Apex REST calls it (§4.3) |
| Rejection audit surviving rollback | Codex R1 #3 | — | **`Audit_Event__e` platform event + subscriber trigger (§2.6)** |
| `Cleared_By__c` FLS + validation backstop | Codex R1 #4 | — | §2.3 + §2.7 |
| `Audit_Event__c` privilege model | Codex R1 #5 | — | system-mode emitter, append-only trigger (§2.5) |
| Attestation scoped deliverable | Codex R1 #6 | — | §1.3.6 interface + briefing |
| Honest bulkification | Codex spec | engine precedent | per-tool |
| Per-request structured error contract | Codex spec | `C360Plan.markRefused` | per-tool |
| Explicit unit of work / savepoints | Codex spec | `C360Plan` typed steps | CreateProspect only |
| Unique external-id idempotency (prospect) | Codex spec | **`LLC_BI__lookupKey__c` unique+externalId — EXISTS** | none |
| Unique composite external-id (KYC) | Codex R2 | — | `KYC_Screening__c.Screening_Key__c` (§2.3) |
| Doc hash stored on record | Codex spec | — | `Doc_Hash__c` (§2.3) |
| Compare-and-set on stage advance | Codex spec | — | §1.3.4 |
| Simulated label propagates everywhere | Codex R2 | — | §3.4 |
| Untrusted-data fence server-wide | Codex R2 | — | §5.4 |
| Two server definitions by default | Codex R2 | — | §5.1 — **and it is not sufficient**, §5.3 |
| Bulk-safe partial success (`allOrNone=false`) | Codex R2 | — | per-tool |
| System-mode scoped to audit only | Codex R2 | — | §2.5 |
| Belt-and-braces VR on Onboarding | Codex R2 | — | §2.7 — **zero existing VRs, clean slate** |
| Platform-Event rejection audit spec'd fully | Codex R2 | — | §2.6 |
| Intake abuse controls | Codex spec | — | §4.4 |
| Claimed-identity semantics | Codex R2 | — | §4.4 |
| **Container-agnostic service layer** | **Founder 2026-07-28** | — | **§2.10, AC-C1…C4** |
| **Zero schema changes to `KYC__c`** | **Founder 2026-07-28** | — | **§2.3 D-3** |

---

## 2. Object model — verified state and exact build list

### 2.1 `LLC_BI__Onboarding__c` — VERIFIED, 24 fields, 0 rows

`sf sobject describe -s LLC_BI__Onboarding__c` + `SELECT COUNT() FROM LLC_BI__Onboarding__c` → **0**.

| Property | Value | Source |
|---|---|---|
| Label | Onboarding Case | describe |
| createable / updateable / deletable | true / true / true | describe |
| **Record types** | **Master only** — no custom record types | describe `recordTypeInfos` |
| OWD internal / external | `ReadWrite` / `Private` | `EntityDefinition` |
| **Validation rules** | **ZERO** | `SELECT Id,ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName='LLC_BI__Onboarding__c'` → 0 rows |
| Apex triggers | **NONE** | `SELECT Name FROM ApexTrigger WHERE TableEnumOrId='LLC_BI__Onboarding__c'` → 0 rows |
| Action overrides | 30 | retrieved object metadata |

Write-relevant fields:

| Field | Type | Nillable | Default | Restricted | Values |
|---|---|---|---|---|---|
| `LLC_BI__Account__c` | reference→Account | **false** | — | — | — |
| `LLC_BI__Type__c` | picklist | **false** | none | **false** | `NewCustomer`, `NewProduct`, `KybAndKycOnly`, `RiskAssessmentOnly`, `AmendMandate`, `SmallBusiness` |
| `LLC_BI__Stage__c` | picklist | true | **`CustomerEngagement`** | **false** | `CustomerEngagement`, `DueDiligence`, `Validation`, `Complete` |
| `LLC_BI__Status__c` | picklist | **false** | **`Open`** | **false** | `Open`, `InProgress`, `Complete`, `Cancelled`, `Declined` |
| `LLC_BI__lookupKey__c` | string(255) | true | — | — | **`unique: true`, `externalId: true`, `idLookup: true`** |
| `LLC_BI__Started_DateTime__c` | datetime | true | — | — | — |
| `LLC_BI__Complete_DateTime__c` | datetime | true | — | — | — |
| `LLC_BI__Closure_Reason__c` | textarea(32768) | true | — | — | — |
| `LLC_BI__Parent_Onboarding_Case__c` | reference→self | true | — | — | — |
| `Name` | string(80) | false | — | — | **autoNumber: true** |

**Three findings that bind the build:**

1. **All three business picklists are `restrictedPicklist: false`.** Lesson 15w/15aa: the platform will silently store an off-list value. `C360Picklist.activeValues()` must be called and the value validated server-side for every write. Its own class doc warns it answers "does the org offer this value", not "would the org reject it" — so the tool must refuse, not merely check.
2. **`LLC_BI__Status__c` defaults to `Open` and is not nillable.** This is the *benign* version of lesson 15e — an omitted status reads as "open", not as a decision. Still set it explicitly (the engine's `CREATE_STATES` makes that mandatory anyway).
3. **`Name` is an autoNumber.** Lesson 4: never cast it to `Id`; lesson 15a: re-query after insert and report the org-assigned name, never echo the payload.

**Net-new fields on this object: NONE.** `lookupKey` supplies the platform-enforced external-id idempotency Codex demanded, saving a field and a deploy.

### 2.2 `KYC__c` — VERIFIED, 206 fields, 0 rows

`SELECT COUNT() FROM KYC__c` → **0**. Full inventory in §0.2. Additional verified properties:

- `Account__c` is **MasterDetail** (object metadata `<type>MasterDetail</type>`), hence `createable: true, updateable: false` (set-once, reparent disabled), **no `OwnerId` field**, OWD `ControlledByParent`.
- Child relationships include `Task`, `ContentDocumentLink`, `ContentVersion`, `ApprovalSubmission`, `ApprovalWorkItem`, `ProcessInstance`, `KYC__History` (field history tracking on).
- FLS held only by `BloomSystemAdmin`, `Bloom_Relationship_Manager`, `sfdc_slack`.

### 2.3 Fields and objects to CREATE

**D-1 — `Audit_Event__c` (new local object).** Does not exist. Codex round-1 #5 requires a deliberate privilege model.

| Field | Type | Notes |
|---|---|---|
| `Event_Type__c` | Picklist, restricted | `prospect_created`, `kyc_result_recorded`, `document_attached`, `onboarding_stage_advance`, `interaction_logged`, `kyc_clearance_attested`, `write_rejected` |
| `Correlation_Id__c` | Text(64), **externalId, non-unique** | Clawdy #4. Same value in the Snowflake decision ledger. |
| `Onboarding_Id__c` | Text(18) | The join key Clawdy #4 names as the minimum |
| `Account_Id__c` | Text(18) | |
| `Object_Type__c` | Text(80) | |
| `Record_Id__c` | Text(18) | |
| `Actor_Id__c` | Text(18) | `UserInfo.getUserId()`, always self-stamped |
| `Actor_Name__c` | Text(255) | Display name. Separate field from the id — lesson 4b. |
| `External_Actor__c` | Text(255) | Clawdy #5. **Claimed** identity only (§4.4). |
| `External_Actor_Verified__c` | Checkbox, default false | Codex R2 claimed-identity semantics |
| `Source__c` | Picklist, restricted | `banker`, `intake`, `system` |
| `Occurred_At__c` | DateTime | Deterministic, set in Apex not by the platform (Codex R2 sequencing) |
| `Outcome__c` | Picklist, restricted | `success`, `rejected` |
| `Rejection_Reason__c` | LongTextArea(32768) | Verbatim `GuardException` message |
| `Simulated__c` | Checkbox, default false | Codex R2 label propagation |
| `Payload__c` | LongTextArea(32768) | Fenced JSON, §5.4 |

Privilege model (Codex round-1 #5): **no permission set grants Create/Read/Update/Delete on `Audit_Event__c` to any tool-running identity.** All inserts run system-mode inside the service layer. An append-only `before update`/`before delete` trigger throws unconditionally.

**D-2 — `KYC_Screening__c` (new local object). DECISION, differs from the plan.**

WRITE-FEASIBILITY Option 1 was "extend the local `KYC__c` shell". That shell does not exist; `KYC__c` is a 206-field, master-detail, record-typed client-intake questionnaire owned by an existing Accenture build ("Bloom"). Appending a `KYC__c` row per screening run would (a) pollute a pre-existing data model, violating founder doctrine #5 *"Never touch pre-existing org build"*, (b) fire `ACN_FXT_KYC` on every screening, and (c) force one master-detail parent when screening is per-*party*, not per-*account*.

Screening is point-in-time, append-only, and per (party × type × run). It needs its own home.

| Field | Type | Notes |
|---|---|---|
| `Onboarding__c` | Lookup→`LLC_BI__Onboarding__c` | the case |
| `KYC__c` | Lookup→`KYC__c` | the case-level KYC record, nullable |
| `Party__c` | Lookup→Account | the screened party (may differ from the borrower) |
| `Screening_Type__c` | Picklist, **restricted** | `Sanctions`, `PEP`, `AdverseMedia`, `KYB`, `CDD`, `AddressRisk` |
| `Result__c` | Picklist, **restricted** | `Clear`, `PotentialMatch`, `Hit`, `Pending`, `Error` |
| `Screened_On__c` | DateTime | |
| `Screening_Provider__c` | Text(255) | verbatim from the gateway response |
| `Provider_Ref__c` | Text(255) | the provider's own reference |
| `Screening_Key__c` | Text(255), **unique, externalId** | **Codex R2**: SHA-256 of `partyId\|screeningType\|providerRef`. Platform-enforced idempotency; concurrent retries cannot append duplicates. |
| `Simulated__c` | Checkbox, default false | |
| `Match_Count__c` | Number | |
| `Findings__c` | LongTextArea(32768) | fenced, §5.4 |
| `Correlation_Id__c` | Text(64), externalId | joins to `Audit_Event__c` |

**D-3 — the KYC join. ZERO schema changes to `KYC__c`.** (Founder-adjudicated, 2026-07-28. Supersedes the earlier draft of this section, which added six fields to `KYC__c`.)

`KYC__c` is a pre-existing Accenture build with 206 fields, 3 record types, an active trigger, and its own permission-set family. Founder doctrine #5 says never touch pre-existing org build, and a 206-field object owned by someone else is exactly what that rule is for. **We add nothing to it and change nothing on it.**

The join runs the other way: **our custom field on the onboarding case points at the KYC record.**

| Field | On | Type | Notes |
|---|---|---|---|
| `KYC_Record__c` | `LLC_BI__Onboarding__c` | Lookup→`KYC__c` | **Our** field on the managed object. The KYC-link in the adapter field map (§2.10). Nullable — a container in an org with no `KYC__c` leaves it unmapped. |

**Clearance state does not live on `KYC__c` either.** It cannot — that would be a schema change. And it should not live on the onboarding container, because clearance must survive a container swap (§2.10). It lives on our own object:

**`KYC_Clearance__c` (new local object).** One row per onboarding case. This is the record the attestation writes and the gate reads.

| Field | Type | Notes |
|---|---|---|
| `Account__c` | Lookup→Account | **The natural correlation anchor** (founder adjudication). Present in every container variant, because every container has an account. |
| `Onboarding_Case_Id__c` | Text(18), **unique** | Untyped on purpose — a typed lookup would bind this object to one container and defeat §2.10. Uniqueness gives one clearance per case, platform-enforced. |
| `KYC_Record_Id__c` | Text(18) | The `KYC__c` id reached through `KYC_Record__c`. Untyped for the same reason. Nullable. |
| `Cleared_By__c` | Lookup→User | **Clawdy #3 / Codex R1 #4.** Not a tool parameter; in `FORBIDDEN_FIELDS`; FLS-denied on `C360_Onboarding_Write`; backstopped (§2.7). Self-stamped from `UserInfo.getUserId()`. |
| `Cleared_On__c` | DateTime | same protections |
| `Clearance_Basis__c` | LongTextArea(32768) | what the human said they relied on |
| `Client_Attested__c` | Checkbox | mirrors `KYC__c.ClientAttestation__c` **read-only at attestation time**, so the precondition is evidenced without writing to their object |
| `Screening_Summary__c` | LongTextArea(32768) | rolled up from `KYC_Screening__c`, fenced (§5.4) |
| `Correlation_Id__c` | Text(64), externalId | joins to `Audit_Event__c` |
| `Simulated__c` | Checkbox, default false | |

**The gate's read path, end to end:** onboarding case → `KYC_Record__c` (identifies *which* KYC record, per the founder's "the attestation gate reads through it") → `KYC_Clearance__c` matched on `Onboarding_Case_Id__c`, with `Account__c` as the correlation anchor and the fallback match when the container carries no KYC link at all. `KYC_Status__c = 'Verified'` on `KYC__c` remains guard-refused (§1.3.2) so the pre-existing object is never written by us in any path.

**Consequence for §1.3.2:** because we never write `KYC__c`, `record_kyc_result` writes only `KYC_Screening__c`. The `KYC_Status__c` refusal is now belt-and-braces rather than the primary control — it exists so that a future caller who *does* hold Bloom FLS still cannot set `Verified` through our service layer.

**Deliberately NOT created anywhere:** `Screening_Type__c`, `Result__c`, `Screened_On__c`, `Screening_Provider__c`, `Evidence_ContentDocumentId__c`, `Party__c` on `KYC__c` — WRITE-FEASIBILITY proposed all six there; they live on `KYC_Screening__c` (D-2).

**D-4 — document idempotency.** `Doc_Hash__c`, Text(64), **unique, externalId**, on `FinServ__IdentificationDocument__c` per §2.8.1. Codex confirmed-spec: *"a hash you can't query is not an idempotency key."* The separate `Onboarding_Document__c` junction is **cancelled** (§2.8.5); revisit only if P-4 shows non-identity documents need one.

**D-5 — `External_Actor__c` as an object: NOT created.** The plan's risk list names it ambiguously. It is a *field* on `Audit_Event__c` (Clawdy #5 wording: *"stamp the prospect's external identity … into `Audit_Event__c.External_Actor__c`"*). Confirmed no such object exists in-org.

### 2.4 Clawdy amendment #1 — CLOSED

*"[A0] Task polymorphic target check: verify `Task.WhatId` accepts `LLC_BI__Onboarding__c` before wiring LogInteraction; not all custom objects are Task-targetable."*

**VERIFIED TRUE.** The `LLC_BI__Onboarding__c` describe's `childRelationships` array contains `Task | WhatId | Tasks`, plus `Event | WhatId | Events`, `OpenActivity | WhatId`, `ActivityHistory | WhatId`, `TaskRelation | RelationId`. `KYC__c` likewise carries `Task | WhatId`. Activities are enabled on both.

### 2.5 Audit emitter design

A single `C360Audit` service class, `without sharing`, with a `private` constructor and one entry point per outcome:

- `emitSuccess(...)` — called inside the same transaction as the business DML, so the audit row is atomic with the write (the plan's design, confirmed superior to a Snowflake callout).
- `emitRejection(...)` — publishes to `Audit_Event__e` (§2.6), never inserts directly, because the insert would roll back with the refused write.

**System-mode scope (Codex round-2, verbatim: *"ONLY audit insertion + rejection-event publication run elevated; all business-object SOQL/DML stays USER_MODE. The service layer must not become a privilege-escalation seam."*):** `C360Audit` is the only `without sharing` class in the package. It performs exactly two DML operations — `insert Audit_Event__c` and `EventBus.publish` — and takes no SObject from the caller other than primitives it re-assembles itself. It never queries or writes a business object. This is stated as an ApexDoc invariant and enforced by a test that asserts the class's only DML targets.

### 2.6 Rejection audit — Platform Event, spec'd fully

Codex round-1 #3 (the paradox) and round-2 (the full spec).

**`Audit_Event__e`** — new platform event, publish behaviour **Publish Immediately** (survives rollback; `Publish After Commit` would not). Fields mirror the `Audit_Event__c` subset needed to reconstruct a rejection: `Correlation_Id__c`, `Invocation_Id__c`, `Event_Type__c`, `Object_Type__c`, `Actor_Id__c`, `Source__c`, `Outcome__c`, `Rejection_Reason__c`, `Occurred_At__c`, `Payload__c`.

Binding implementation notes, all from Codex round-2:

- `EventBus.publish` returns `List<Database.SaveResult>`. **The `SaveResult` is checked**; a failed publish is itself logged (to `System.debug` at minimum, since there is nowhere else left to go) and never silently dropped.
- A **durable subscriber trigger** on `Audit_Event__e` writes each event into `Audit_Event__c` asynchronously, system-mode.
- **Shared invocation/request ID + deterministic timestamp.** Every service-layer call mints an `Invocation_Id__c` (UUID) at entry and stamps `Occurred_At__c` from a single `DateTime.now()` captured once. Rejection events (async) and atomic success rows (sync) therefore sequence correctly on replay despite arriving out of order.
- **Precedent that this pattern works in this org:** nCino ships `nFORCE__Audit_Event__e` (a platform event with `nFORCE__Context__c`, `nFORCE__Description__c` (32768), `nFORCE__Type__c`, `nFORCE__User__c`, `nFORCE__Log_DateTime__c`, `nFORCE__IP_Address__c`) paired with a durable `nFORCE__Audit_Log__c` object. We **do not write into nCino's log**: `nFORCE__Audit_Log__c.nFORCE__Description__c` is only 255 chars (vs the event's 32768), the object is `updateable: true, deletable: true` (not append-only), and writing a managed audit surface violates founder doctrine #5. We build our own with the same topology. Cite this as evidence the design is idiomatic here, not as a component we consume.

### 2.7 The belt-and-braces validation rule (Codex round-2)

*"a validation rule/trigger ON `LLC_BI__Onboarding__c` itself blocks Stage OR Status = `Complete` unless the related KYC record carries a human attestation (`Cleared_By__c` populated)."*

**Clean slate confirmed: `LLC_BI__Onboarding__c` has ZERO validation rules and ZERO Apex triggers today** (queries in §2.1). Nothing to conflict with, nothing to regress.

Constraint: clearance lives on `KYC_Clearance__c`, deliberately joined by untyped `Onboarding_Case_Id__c` rather than a typed lookup (§2.3 D-3, §2.10.2), so **no declarative formula can traverse to it**. A validation rule cannot see it at all. That settles the option space rather than opening it:

- **Option A (VR + helper field):** add `Attested__c` (checkbox) on the onboarding container, maintained by the attestation path. VR fires when a terminal value is set and `Attested__c` is false. Cheap and visible in Setup. **Two weaknesses:** the helper is itself writable so it needs its own FLS lock, and a VR must hardcode the terminal picklist value — which breaks AC-C4 on a container swap.
- **Option B (before-update trigger):** a local `OnboardingCompletionGuard` trigger reads the active container's value map, detects a transition to the terminal stage or status, queries `KYC_Clearance__c` on `Onboarding_Case_Id__c`, and throws via `addError` when no `Cleared_By__c` is populated. No writable intermediate, and the terminal value comes from the adapter so it survives a swap.

**Recommendation: Option B**, now on two grounds rather than one. It closes the loop without a second field to protect, it literally satisfies *"closes every other write surface (other APIs, automations, direct edits)"*, and — new with §2.10 — it is the **only** form that can read the terminal value from the container instead of hardcoding `'Complete'`. A validation rule cannot call Apex, so Option A is not merely weaker here, it is incompatible with the container-agnostic requirement.

Flags: this is our first trigger on an nCino managed object in this org, so it needs its own probe (P-6) and a bypass-free design (lesson 19: `Exclude_Validation` NEVER). And per §2.10.3 limit 3, **the trigger is the one artifact that does not swap for free** — each container variant ships its own, from one template, asserted by the same AC-C4 stub test.

**Note for the attestation decision:** this backstop applies **regardless of which attestation mechanism is chosen**. It is the one control that is mechanism-independent. Stated again in `ATTESTATION-BRIEFING.md` §5.

### 2.8 FSC-native objects — evaluation and binding preference

**Binding design rule (founder, 2026-07-28):** prefer FSC-native objects over custom wherever they fit the KYC/onboarding domain. Custom objects and fields only where FSC + nCino have no home.

The full FSC managed package is present in `bankinggpt` (95 `FinServ__` objects). This section evaluates each candidate against a live describe and states fit and gaps honestly. Where FSC wins, the §2.3 build list shrinks; where it does not, the reason is stated rather than asserted.

**Verified row counts** (`SELECT COUNT()`, run in this lane, matching the orchestrator's independent observation exactly):

| Object | Rows |
|---|---|
| `FinServ__FinancialAccount__c` | **50** |
| `FinServ__FinancialHolding__c` | **9** |
| `FinServ__AccountAccountRelation__c` | **8** |
| `FinServ__IdentificationDocument__c` | **0** |
| `FinServ__LifeEvent__c` | **0** |
| `FinServ__Alert__c` | **0** |
| `KYC__c` | **0** |
| `LLC_BI__Onboarding__c` | **0** |

#### 2.8.1 `FinServ__IdentificationDocument__c` → **ADOPT. Strong fit. Replaces custom identity-document fields.**

Describe (`sf sobject describe -s FinServ__IdentificationDocument__c`): createable/updateable/deletable, Master record type only, 0 rows.

| Field | Type | Restricted | Notes |
|---|---|---|---|
| `FinServ__Account__c` | reference→Account | — | the party |
| `FinServ__DocumentType__c` | picklist | **true** | `Passport`, `License`, `Visa`, `Green Card`, `Other` |
| `FinServ__DocumentNumber__c` | string(200) | — | |
| `FinServ__IssueDate__c` / `FinServ__ExpirationDate__c` | date | — | expiry drives KYC-refresh clocks for free |
| `FinServ__IssuingCountry__c` | picklist | **true** | full ISO country list (~250 values) |
| **`FinServ__VerifiedBy__c`** | reference→**User** | — | **an FSC-native attestation actor field** |
| **`FinServ__VerifiedOn__c`** | datetime | — | **an FSC-native attestation timestamp** |
| `FinServ__SourceSystemId__c` | string(100) | — | `externalId: true`, **`unique: false`** |

**Why this is the right home.** It is the exact object FSC ships for KYC identity evidence. `DocumentType` and `IssuingCountry` are **restricted** picklists, so off-list writes fail loudly (lesson 15aa) — better than anything we would build. The country list is a real jurisdiction vocabulary, which is directly consumable by `assert_kyc_risk_address_change_for_high_risk_countries` (§3.1) instead of us inventing a country enum. Expiry dates give the KYC-refresh tickler its data source at zero cost.

**And it carries a verification pair (`VerifiedBy` / `VerifiedOn`) that is structurally identical to the `Cleared_By__c` / `Cleared_On__c` on `KYC_Clearance__c` (§2.3 D-3).** This matters for the attestation decision — see `ATTESTATION-BRIEFING.md` §3.3(b). It is *document* verification, not *case* clearance, so it does not remove the need for case-level clearance fields, but it establishes that the org's own vocabulary already models "a named human verified this, at this time".

**Gaps, and how they are closed:**

| Gap | Resolution |
|---|---|
| No lookup to `LLC_BI__Onboarding__c` | Add one custom field `Onboarding__c` (Lookup). **One custom field on a managed object** — smaller footprint than a whole custom object. |
| `FinServ__SourceSystemId__c` is `unique: false` | Cannot serve as the platform-enforced idempotency key Codex R2 requires. Add `Doc_Hash__c` (Text 64, **unique**, externalId). |
| No `Simulated__c` | Add. |
| No record types | Not needed; `DocumentType` carries the distinction. |
| Adding fields to a managed object | Permitted (namespace-prefixed custom fields on managed objects are standard), but it is a `Changed`-shaped footprint on someone else's object. Flagged as **D-8**. |

**Consequence:** `Onboarding_Document__c` (D-4) is **CANCELLED**. Identity documents live on `FinServ__IdentificationDocument__c` + 3 custom fields. Non-identity documents (financials, entity formation docs, org charts) attach via `ContentVersion`/`ContentDocumentLink` directly to the Onboarding record with the hash stored on the identity-document row when one exists, and on a lightweight `Onboarding_Document__c` only if P-4 shows we need a junction for non-identity docs. **Decide after P-4, not before.**

#### 2.8.2 `FinServ__Alert__c` → **ADOPT, but for the FLAG, not the RESULT. Partial fit.**

Describe: createable/updateable/deletable, Master record type only, 0 rows.

| Field | Type | Restricted | Notes |
|---|---|---|---|
| `FinServ__Message__c` | string(255) | — | **required** (`nillable: false`) |
| `FinServ__MessageDescription__c` | string(255) | — | |
| `FinServ__Severity__c` | picklist | **false** | `Error`, `Warning`, `Info` — **unrestricted, lesson 15w applies** |
| `FinServ__Priority__c` | picklist | **true** | `Low`, `Medium`, `High` |
| `FinServ__Active__c` | boolean | — | **required**; the dismissal lifecycle |
| `FinServ__Account__c` | reference→Account | — | |
| `FinServ__FinancialAccount__c`, `FinServ__Claim__c`, `FinServ__Insurance_Policy__c` | references | — | wealth/insurance anchors, unused by us |
| `FinServ__SourceSystemId__c` | string(100) | — | externalId, **`unique: false`** |

**Why it does not fit as the screening result record.** Four structural mismatches, each independently disqualifying:

1. **It is a notification, not a record of fact.** `FinServ__Active__c` is a required boolean whose whole purpose is dismissal. A screening result is immutable point-in-time evidence; an alert is a thing a banker makes go away. Storing a sanctions hit somewhere dismissible is a compliance defect, not a design preference.
2. **No screening semantics.** No screening type, no result enum, no provider, no screened-on datetime (only `CreatedDate`, which is not the same thing — a result recorded today may describe a screen run yesterday), no party lookup distinct from the account.
3. **No idempotency key.** `SourceSystemId` is `unique: false`, so Codex round-2's *"unique composite external-ID field … so concurrent retries cannot append duplicates"* cannot be satisfied here.
4. **255-character findings ceiling.** Adverse-media findings do not fit in 255 characters, and `FinServ__Severity__c` being unrestricted means an off-list severity stores silently.

**Where it does fit, and we use it.** `FinServ__Alert__c` is exactly the right object for the *surfacing artifact* — the thing that appears in a banker's alert list and drives the triage queue. Design:

- `KYC_Screening__c` (D-2) holds the immutable evidence row: type, result, provider, screened-on, findings, unique key, simulated flag.
- On `Result__c IN ('Hit','PotentialMatch')`, the service layer **also** creates a `FinServ__Alert__c`: `FinServ__Message__c` = a one-line banker summary, `FinServ__Severity__c` = `Error` for `Hit` / `Warning` for `PotentialMatch` (validated against `C360Picklist` because it is unrestricted), `FinServ__Priority__c` = `High`/`Medium`, `FinServ__Active__c = true`, `FinServ__Account__c` = the party.
- Dismissing the alert closes the *notification*; the evidence row is untouched and un-dismissible. That separation is the point.
- This gives WS-B1's triage queue (`EXPERIENCE-SPEC §5.1`) an FSC-native feed rather than a bespoke one.

**Verdict: `KYC_Screening__c` (D-2) stands, and `FinServ__Alert__c` is adopted alongside it.** Two objects, two jobs, honestly separated.

#### 2.8.3 `FinServ__AccountAccountRelation__c` → **ADOPT as the ownership-edge source. This overrides a documented prior decision — flagged as D-9.**

Describe: `FinServ__Account__c` → Account, `FinServ__RelatedAccount__c` → Account, `FinServ__Role__c` → `FinServ__ReciprocalRole__c` (**required**), `FinServ__InverseRelationship__c` → self, `FinServ__AssociationType__c` picklist `{Group, Member, Peer}`, `FinServ__Active__c`, `FinServ__StartDate__c`/`FinServ__EndDate__c`, **`FinServ__ExternalId__c` string, `unique: true`, `externalId: true`**, `FinServ__SourceSystemId__c` (externalId, non-unique). 8 rows.

**The addendum asked me to confirm our relationship-graph read already consumes it. It does not, and the exclusion is deliberate and documented.** From the deployed `Customer360RelationshipGraph` class body (read via Tooling `SELECT Body FROM ApexClass`), verbatim ApexDoc:

> *"Primary source: `LLC_BI__Connection__c` (the populated ownership/relationship graph, 208 edges org-wide; **`FinServ__AccountAccountRelation__c` is sparse, 8 edges, and is NOT queried here — it is FSC enrichment, out of scope for this tool** per the verified data model)."*

Its SOQL `FROM` clauses are `LLC_BI__Connection__c` and `LLC_BI__Legal_Entities__c` only.

**Two facts now argue for reversing that, and one argues against.**

*For:* the FSC role catalog is real. `SELECT Name, FinServ__InverseRole__c FROM FinServ__ReciprocalRole__c` returns **17 rows** with genuine beneficial-ownership vocabulary and proper inverses: `Owner ↔ Business`, `Director ↔ Business`, `Business Owners ↔ Business`, `Household Member ↔ Household`, `Parent ↔ Child`, `Client ↔ Advisor`. Contrast the nCino side, where WRITE-FEASIBILITY records that **all 208 `LLC_BI__Connection__c` edges use the single generic role `"Connection"`**, and it is UNVERIFIED that typed rows like "Beneficial Owner" exist in the 35-role `LLC_BI__Connection_Role__c` catalog at all. For a KYC beneficial-ownership beat, FSC has the vocabulary and nCino does not. Second, `FinServ__ExternalId__c` is `unique: true` — a platform-enforced idempotency key for pre-seeding, which `LLC_BI__Connection__c` does not offer.

*Against:* the 208 existing edges are on the nCino side and carry the live commercial relationships including all of Hartwell. Switching the read would lose them.

**Recommended resolution — a union, not a switch.** `Customer360RelationshipGraph` gains a second source and returns edges tagged by provenance (`source: 'ncino' | 'fsc'`). Existing 208 edges keep rendering exactly as today (no regression to the credit surfaces, per founder doctrine #2 "display correctness is a contract for ALL relationships"). New **pre-seeded onboarding ownership edges are written as `FinServ__AccountAccountRelation__c`** with typed roles from the catalog, per adjudication (a) — pre-seeded, agent reads and confirms, never writes.

**Cost:** this is a `Changed` receipt on a shipped, tested read tool that 5 baked borrowers and the whole credit surface depend on. It requires the per-borrower QA matrix to pass on both data files. **Not a free change — D-9.**

**Note:** `FinServ__Role__c` is `nillable: false`, so every seeded edge must resolve a `FinServ__ReciprocalRole__c` id by name first. That resolution is a seed-script step with a fail-closed lookup (lesson 4b), and the 17-row catalog must be re-checked at seed time in case it differs from what I observed.

#### 2.8.4 `FinServ__LifeEvent__c` → **AVAILABLE, NOT USED**

0 rows. It models personal life events (marriage, birth, retirement) for wealth advisory. There is no commercial-onboarding beat it genuinely fits, and CAPABILITY-MAPPING §2.1 already made the equivalent call for the brief: *"'recent life events' has no commercial-data analogue and should be replaced by 'recent credit events'"*. Recorded as available so nobody re-derives this. Using it to stage a commercial beat would be theatre.

#### 2.8.5 Net effect on the build list

| Originally proposed (§2.3) | After FSC evaluation |
|---|---|
| `Audit_Event__c` + `Audit_Event__e` | **STANDS** — no FSC or nCino home meets the append-only + system-mode + rejection-survives-rollback requirement. nCino's `nFORCE__Audit_Log__c` is updateable, deletable, and 255-char capped (§2.6). |
| `KYC_Screening__c` | **STANDS** (§2.8.2), now paired with `FinServ__Alert__c` for surfacing |
| `Onboarding_Document__c` | **CANCELLED** — replaced by `FinServ__IdentificationDocument__c` + 3 fields. Revisit only if P-4 proves non-identity docs need a junction. |
| 6 fields on `KYC__c` | **CANCELLED** (founder, §2.3 D-3) — **zero schema changes to `KYC__c`**. Clearance moves to `KYC_Clearance__c`; the join becomes our `KYC_Record__c` field on the onboarding container. |
| `Doc_Hash__c` | **MOVES** to `FinServ__IdentificationDocument__c` |
| Ownership edges | **MOVES** to `FinServ__AccountAccountRelation__c` (D-9) |

Custom surface is now: **3 new objects** (`Audit_Event__c`, `KYC_Screening__c`, `KYC_Clearance__c`), **1 platform event**, **1 field on `LLC_BI__Onboarding__c`** (`KYC_Record__c`), **3 fields on `FinServ__IdentificationDocument__c`**, and **zero fields on `KYC__c`**.

The net trade is one extra object for zero footprint on the 206-field pre-existing build — and, not incidentally, a clearance record that survives a container swap (§2.10.2).

### 2.9 The one-org story — FSC and nCino co-resident

`bankinggpt` holds the full FSC managed package **and** nCino, in one org, behind one auth boundary. This is the structural reason the merged demo runs here and their FSC-only org cannot host it (PLAN-OF-APPROACH §3 WS-E). Their side is FSC-only and uses zero nCino objects (§0.4, verified) — so the co-residency is ours to offer, not a shared starting point. And because the wealth half would have to run in an FSC-only org, the container adapter (§2.10) is what makes "one spine, two verticals" survive contact with their org rather than only ours. It is also the umbrella slide's proof, not just its claim: the wealth data model and commercial credit are literally the same org, the same sharing model, the same hosted MCP, the same audit trail.

**What is already in the org and can appear in the demo read-only, with zero modification:**

| Data | Rows | Demo use |
|---|---|---|
| `FinServ__FinancialAccount__c` | **50** | Deposit/treasury/wealth relationship depth beside commercial exposure. Answers "what else does this client have with us" — a wallet-share beat the credit tools alone cannot reach. |
| `FinServ__FinancialHolding__c` | **9** | Investment holdings. Wealth-side proof point on the same spine. |
| `FinServ__AccountAccountRelation__c` | **8** | Existing FSC relationship edges, rendered alongside the 208 nCino edges once §2.8.3 lands. |
| `LLC_BI__*` commercial book | Hartwell (91 records), Piedmont, 3 samples | Unchanged. |

**Hard constraint, restated: nothing pre-existing is mutated.** Founder doctrine #5, non-negotiable. Specifically:

- The 50 `FinancialAccount`, 9 `FinancialHolding`, and 8 `AccountAccountRelation` rows are **read-only in every phase of this build**. No tool writes them, no seed script touches them, no reset script deletes them. `C360WriteGuard` gets **no** create or update row for `FinServ__FinancialAccount__c` or `FinServ__FinancialHolding__c`, so an attempt is refused by the same fence as any other unknown object (`assertAllowed` throws on unknown objects by default — verified in `C360WriteGuard.cls`).
- All demo data is **net-new records only**, created under the seed registry (§8.4) and removable by id.
- The reset script's guard already refuses to act on any id absent from the registry, which makes this structural rather than a matter of care.

**What this buys the narrative.** The demo can open on a commercial borrower, drill to its ownership graph (KYC signal), show its deposit and investment relationships from FSC in the same shell without a system boundary, run the onboarding of a new prospect through nCino's `LLC_BI__Onboarding__c`, record screening on FSC-native `IdentificationDocument` and `Alert`, and write the audit to one ledger. One spine, one auth boundary, two verticals — demonstrated rather than diagrammed. That is the umbrella slide (WS-C2) with evidence behind it.

**Honesty line:** the 50/9/8 rows are sandbox demo data that pre-dates us. They are real records in a real org, not fabricated, and they may be shown. They are not evidence of a production deployment, and nothing in the deck should imply otherwise (WEBSITE-ANALYSIS tension #2: say "built and running", never "in production").

### 2.10 Container-agnostic onboarding adapter — BINDING

**Founder decision, 2026-07-28.** Commercial-first anchors the onboarding case on `LLC_BI__Onboarding__c` (§0.4: our choice, not inherited). But the shared Apex service layer must be **container-agnostic**, so the wealth-second variant runs in an FSC-only org against a swapped local container with **zero service-layer and zero tool-contract changes**.

This is not speculative portability. It is the load-bearing mechanism under the umbrella slide: "one spine, two verticals" is a claim about the *service layer*, and it is only true if the service layer does not know what object it is writing. Aethon's org is FSC-only (§0.4) — if the merged story ever runs a wealth onboarding, it runs there, and there is no `LLC_BI__Onboarding__c` in that org.

#### 2.10.1 Shape

Three layers, strictly ordered:

```
 tool wrappers  (7 invocable classes)        ← no container knowledge
       │
 governance    C360WriteGuard, C360Audit,     ← ABOVE the adapter (AC-4)
               completion gate, attestation
       │
 adapter       C360OnboardingContainer         ← the ONLY container knowledge
               (interface) + one impl per container
       │
 org           LLC_BI__Onboarding__c  |  Wealth_Onboarding__c  |  …
```

**The interface** (logical names on the left are fixed forever; API names are configuration):

```apex
public interface C360OnboardingContainer {
    String  objectApiName();
    Map<String,String> fieldMap();        // logical -> API name
    Map<String,Object> valueMap();        // logical -> org vocabulary
    SObject newInstance();
}
```

**The field map — the seven bindings required by AC-2:**

| Logical name | `bankinggpt` (nCino impl) | Required? |
|---|---|---|
| `stage` | `LLC_BI__Stage__c` | yes |
| `status` | `LLC_BI__Status__c` | yes |
| `type` | `LLC_BI__Type__c` | yes |
| `account` | `LLC_BI__Account__c` | yes |
| `packageLookup` | `LLC_BI__Product_Package__c` | **no** — nullable; a container without a package concept leaves it unmapped |
| `externalKey` | `LLC_BI__lookupKey__c` | yes, and **must be unique + externalId** |
| `kycLink` | `KYC_Record__c` (our field, §2.3 D-3) | **no** — nullable |

Plus two optional bindings the nCino container supplies and a minimal container need not: `startedAt` → `LLC_BI__Started_DateTime__c`, `completedAt` → `LLC_BI__Complete_DateTime__c`.

**The value map — the subtlety that makes the gate portable.** `Complete` is nCino's word. A wealth container might say `Closed` or `Onboarded`. The gate must refuse *the terminal value*, not the literal string `'Complete'`, or it silently stops working on swap. So the container also declares its vocabulary:

| Logical | nCino impl |
|---|---|
| `terminalStageValue` | `Complete` |
| `terminalStatusValue` | `Complete` |
| `intermediateStageValues` | `{DueDiligence, Validation}` |
| `openStatusValues` | `{Open, InProgress}` |
| `abandonedStatusValues` | `{Cancelled, Declined}` |
| `initialStageValue` | `CustomerEngagement` |
| `initialStatusValue` | `Open` |
| `kycOnlyTypeValue` | `KybAndKycOnly` |

`C360WriteGuard`'s `UPDATE_TRANSITIONS` for the container is then **built at runtime from the value map**, not hardcoded: permitted stage values = `intermediateStageValues`, permitted status values = `openStatusValues ∪ abandonedStatusValues`. The terminal values are absent by construction rather than by a literal omission someone could reinstate by accident. This is a strict improvement on the §1.3.4 map literal and supersedes it.

**Selection.** A Custom Metadata Type `C360_Onboarding_Container__mdt` names the active implementing class for the org. One row, one active container. Swapping is a metadata change plus one class, never a code edit to a service or a tool.

#### 2.10.2 Acceptance criteria

- **AC-C1.** No service class and no tool wrapper references `LLC_BI__Onboarding__c` — as a type, a literal, or in SOQL — except the single implementing class `C360NcinoOnboardingContainer`. Enforced by a test that greps the deployed source of every class in the package for the string and asserts exactly one hit. Also applies to the field API names: `LLC_BI__Stage__c` and friends appear only in the impl.
- **AC-C2.** The field map covers all seven bindings above, and a container that omits a required one fails fast at class initialisation with a named error, not at write time.
- **AC-C3.** §2.10.3 names the minimal wealth container concretely — fields and types — so the swap claim is demonstrable rather than asserted.
- **AC-C4.** The governance gates sit **above** the adapter: `C360WriteGuard`, the completion refusal, the attestation check, and `C360Audit` all operate on logical names and never on API names. A test asserts the completion gate refuses using a **stub container** whose terminal value is the string `'ZZ_TERMINAL'` — proving the refusal is driven by the value map and not by the literal `'Complete'`.

Two consequences worth stating because they are easy to get wrong:

- **`KYC_Clearance__c` is deliberately not container-bound** (§2.3 D-3): `Onboarding_Case_Id__c` and `KYC_Record_Id__c` are `Text(18)`, not typed lookups. A typed lookup to `LLC_BI__Onboarding__c` would put container knowledge inside the governance layer and break AC-C4. The cost is losing referential integrity on those two fields; the mitigation is that `Onboarding_Case_Id__c` is unique and the service layer resolves it through the adapter, never by raw id.
- **`Audit_Event__c.Onboarding_Id__c` is already `Text(18)`** for the same reason. That was accidental in the first draft and is now deliberate.

#### 2.10.3 What the wealth-variant container minimally needs (AC-C3)

A local custom object in an FSC-only org — call it `Wealth_Onboarding__c` — carrying exactly this, and nothing more:

| Field | Type | Maps to | Notes |
|---|---|---|---|
| `Name` | AutoNumber | — | matches the nCino container's shape |
| `Account__c` | Lookup→Account, **required** | `account` | In FSC this is the Person Account or the Household account. This is the only genuinely mandatory binding. |
| `Stage__c` | Picklist, **restricted** | `stage` | Must carry a terminal value + ≥2 intermediates. Restricted is a requirement, not a preference — an unrestricted picklist reintroduces lesson 15w's silent off-list write, which the nCino container suffers from and has to guard around. |
| `Status__c` | Picklist, **restricted** | `status` | Must carry a terminal value + ≥1 open value |
| `Type__c` | Picklist, **restricted** | `type` | The journey type. Needs a KYC-only analogue of `KybAndKycOnly`. |
| `External_Key__c` | Text(255), **unique, externalId** | `externalKey` | **The one thing nCino gives us free and a custom container must supply deliberately.** Without it, Codex's race-safe idempotency requirement is unmet and `CreateProspect` degrades to query-then-insert. |
| `Portfolio__c` | Lookup→`FinServ__FinancialAccount__c` | `packageLookup` | **Optional.** The FSC analogue of the product package. Omit and leave unmapped if the wealth journey has no product anchor. |
| `KYC_Record__c` | Lookup | `kycLink` | **Optional.** An FSC-only org has no `KYC__c`; if that org has its own KYC container this points at it, otherwise leave unmapped and `KYC_Clearance__c` keys on `Account__c` alone. |
| `Started_At__c` / `Completed_At__c` | DateTime | `startedAt` / `completedAt` | Optional |

Plus one Apex class implementing `C360OnboardingContainer` (roughly 60 lines, almost all of it two map literals) and one `C360_Onboarding_Container__mdt` row.

**That is the entire swap.** No service class changes, no tool wrapper changes, no change to the seven MCP tool contracts, no change to the cockpit's tool calls. What *does* change and must be re-run: the permission sets (new object), the seed script (new object API name), and the full QA suite against the new container.

**Honest limits of the claim.** Three things do not swap for free, and the deck must not imply they do:

1. **Screening and clearance objects are ours and travel unchanged** — that is the point — but they must be deployed to the target org.
2. **`FinServ__IdentificationDocument__c` and `FinServ__Alert__c` are FSC objects**, so they travel to an FSC-only org *better* than to a hypothetical nCino-only one. Convenient here, but it means the document/alert layer has an FSC dependency the container abstraction does not cover.
3. **The completion backstop trigger (§2.7) is per-container** — a trigger is written against a concrete object. Each container variant ships its own trigger, built from the same template and asserted by the same AC-C4 stub test. This is the one place the swap costs real code beyond the adapter, and it is unavoidable: Apex triggers cannot be polymorphic.

---

## 3. Screening layer — IDB Gateway mapping

**Method note and honesty caveat.** I could not call the IDB Gateway MCP tools (they are not reachable from this lane, and this is a read-and-spec task). The mapping below is derived from tool names, the plan's context, and the C360 patterns. **Every row is marked with its confidence.** Nothing here is asserted as verified behaviour. Probe P-7 (§7.1) is: the orchestrator calls each tool once, read-shaped, and archives the verbatim response envelope — exactly the wire-observation discipline that caught the `required=true` defect (HANDOFF §8, *"Wire observation is law"*).

### 3.1 Tool-by-tool mapping

| Gateway tool | Maps to | Real or simulated | Confidence |
|---|---|---|---|
| `check_sanctions_name` | `record_kyc_result` with `Screening_Type__c='Sanctions'` | **Real tool call.** Whether the gateway itself proxies a real sanctions vendor or returns staged data is **UNVERIFIED** — the endpoint is named `...-staging`. Label driven by the response (§3.3). | Medium — name is unambiguous, response shape unknown |
| `check_adverse_media` | `record_kyc_result`, `Screening_Type__c='AdverseMedia'` | Same | Medium |
| `assert_kyc_risk_address_change_for_high_risk_countries` | `record_kyc_result`, `Screening_Type__c='AddressRisk'` | **Real.** The name reads as a deterministic assertion over country lists, not a vendor lookup — most likely to be genuinely real. | Medium-low — "assert" semantics inferred |
| `doc_extract_r` | Feeds `attach_document`: extract → attach → record extraction as `Findings__c` | **Real.** Document extraction needs no third-party identity vendor. | Medium |
| `get_customer360` | **Read only.** The gateway's own customer view; a cross-check against our `Customer360Snapshot`, not a write input. | Real | High — read tools are low-risk |
| `stage_address_change` / `approve_stage_address_change` | **Do not wire in v1.** The gateway has its own stage/approve fence. Wiring our fence over theirs creates two competing confirm protocols. Note the naming collision with our `stage_`/`execute_` and keep them apart. | n/a | High |
| `stage_name_change` / `approve_name_change` | Same — v1 excluded | n/a | High |
| `create_risk_alert` | On `Result__c = 'Hit'`, the agent may raise a gateway risk alert. **Recommend v1: do NOT auto-raise.** Raising an alert in a counterparty system is an externally-visible side effect with no undo. Log the intent, let the banker fire it. | Real, but gated | Medium |
| `create_service_request` | Overlaps our existing `stage_service_request`/`execute_service_request`. Prefer ours (it is fenced, audited, and in-org). | n/a | High |
| `capture_channel_interaction` | Overlaps `log_interaction`. **Both, deliberately:** ours writes the Salesforce Task (system of record), theirs records the channel event in the gateway. Same `Correlation_Id__c` in both. | Real | Medium |

### 3.2 Where labelled simulation is unavoidable

Per the founder directive, simulation is tolerated only where the sandbox physically lacks a third-party provider. On the evidence available:

- **No screening call needs to be faked at the tool level.** Every screen goes through the real gateway tool. The tool call is real; only the *provenance of the answer* may be staged.
- **What may be simulated is the gateway's upstream vendor.** That is not ours to fake or to fix, and it is honest to say so.
- **Seeded demo screening rows** (§8) are simulated by construction and are labelled at the record, the tool response, the widget, and the audit payload (Codex round-2, §3.4).

### 3.3 The labelling rule

`Simulated__c` is **not** a build-time constant. It is set per row from the response:

```
simulated = response.provider is blank
         OR response.provider matches /(stub|mock|sample|test|staging-fixture)/i
         OR the row was created by the seed script
```

`Screening_Provider__c` carries the gateway's verbatim provider string, or the literal `'Simulated (demo)'` when the row is seeded — Codex confirmed-spec wording, adopted exactly.

**Honest-absence rule (from CAPABILITY-MAPPING §2.2, and it stands):** for a real, unseeded account with no screening rows, the surface says "KYC unverified, blocks decisioning" and the Complete gate refuses. It never renders an empty screening panel as a clear one. The plan's apparent tension between "seed KYC rows" and "lead with honest absence" resolves cleanly: **seeded demo accounts show labelled simulated results; every other account shows honest absence.** Both behaviours ship.

### 3.4 Simulated-label propagation (Codex round-2)

The marker appears in four places for every simulated row, and a test asserts all four:

1. `KYC_Screening__c.Simulated__c = true` and `Screening_Provider__c = 'Simulated (demo)'`
2. The tool response object carries `simulated: true` and a prose field `note: "Simulated (demo) screening result — not a live provider return."`
3. The cockpit Screening tab renders a persistent badge, not a tooltip.
4. `Audit_Event__c.Simulated__c = true`.

---

## 4. Client-facing intake service — in scope, with controls

Adjudication (c): **in scope, built WITH abuse controls.** WRITE-FEASIBILITY's hard constraint stands and is not relitigated: *"the client-facing path can never ride the hosted MCP — separate intake service, integration user, same shared Apex write layer. One write layer, two front doors."* The hosted MCP is per-user OAuth+PKCE only; a prospect has no Salesforce user.

**Contradiction resolved.** CAPABILITY-MAPPING §3.4 proposes a cheaper alternative — *"a thin intake form … rendered as a single MCP-App widget, not a portal, Effort: M"*. **That design is rejected.** It routes through the *agent's* per-user OAuth, so it is a banker-facing form wearing an intake costume; it does not solve the prospect-has-no-user problem the constraint is about. WRITE-FEASIBILITY's separate-service design is the one built.

### 4.1 Topology

```
prospect browser
   → intake web app (static, no Salesforce credentials in the client)
   → intake service (Node, sibling of experience-mcp)
       · OAuth 2.0 Client Credentials → dedicated integration user
       · calls PRIVATE Apex REST
   → Apex REST endpoints
       → THE SAME C360 service classes the MCP wrappers call
       → C360WriteGuard.assertAllowed(...)  ← identical fence
       → C360Audit.emit*(...)  with Source__c='intake'
```

### 4.2 Endpoints

All under `/services/apexrest/c360/intake/v1`. All `@RestResource`, `global with sharing`, `@HttpPost` only.

| Endpoint | Purpose | Request | Response |
|---|---|---|---|
| `POST /session` | Start a submission, mint a short-lived submission token | `{sharedSecret, captchaToken, claimedEmail}` | `{submissionId, submissionToken, expiresAt}` (15 min TTL) |
| `POST /prospect` | Create the prospect + onboarding case | `{submissionId, submissionToken, legalName, entityType, jurisdiction, claimedEmail, claimedName, externalRef}` | `{onboardingId, onboardingName, accountId, status}` — org-assigned values, re-queried, never echoed (lesson 15a) |
| `POST /document` | Upload one document | multipart: `{submissionId, submissionToken, docType, file}` | `{documentId, docHash, accepted}` |
| `POST /party` | Declare a beneficial owner (**recorded as claimed, never written to the ownership graph**) | `{submissionId, submissionToken, partyName, claimedOwnershipPercent, role}` | `{partyRecordId, status:'claimed_pending_confirmation'}` |
| `GET /status/{submissionId}` | Prospect-visible status | header `submissionToken` | `{stage, outstandingItems[], lastUpdated}` — **stage vocabulary is prospect-facing prose, never the raw picklist** |

**Deliberately absent:** no endpoint can advance a stage, record a screening result, set `KYC_Status__c`, or reach the attestation path. The integration user's permission set (§5.2) makes this structural, not merely a routing choice.

### 4.3 The fence is the same fence

Codex round-1 #2 is satisfied because the Apex REST class contains **no governance logic of its own**. It parses, validates shape, resolves the submission token, and calls the identical service methods. A test asserts that `Stage='Complete'` submitted through the intake endpoint produces the same `GuardException` message as through the MCP wrapper.

### 4.4 Abuse controls (Codex confirmed-spec: *"an unauthenticated form writing to Salesforce under an integration user is not acceptable even in sandbox"*)

| Control | Design |
|---|---|
| **Shared secret** | Per-deployment secret in the Node service env, never in the browser. The browser talks only to the Node service. |
| **CAPTCHA** | Required on `/session`. Token verified server-side in Node before any Salesforce call. |
| **Rate limit** | Two tiers: per-IP (10 sessions/hour) in Node; per-`Correlation_Id__c` (1 prospect create per submission) enforced in Apex via the `LLC_BI__lookupKey__c` unique constraint — a platform refusal, not a counter. |
| **Submission token** | 15-min TTL, single submission scope, bound to the `submissionId`. Every write endpoint requires it. |
| **Upload validation** | Allowlist MIME types (`pdf`, `png`, `jpeg`, `docx`); max 10 MB per file, 5 files per submission; magic-byte check, not extension; filename sanitised before it becomes `ContentVersion.Title`. Base64 heap ceiling documented per Codex confirmed-spec (small demo docs fine; the limit is stated, not discovered on stage). |
| **No enumeration** | `GET /status` returns 404-equivalent for any mismatch between `submissionId` and token. No distinguishable "not found" vs "not yours". |
| **Kill switch** | Custom Metadata flag `C360_Intake_Enabled__mdt` checked at the top of every intake Apex REST method. Turning it off refuses the whole front door without a deploy. |

### 4.5 Claimed-identity stamping (Clawdy #5 + Codex round-2)

Codex round-2, verbatim: *"intake auth proves the intake app, not the submitter; store as claimed-identity fields, label accordingly, unless independently verified."*

Every intake-originated write stamps:
- `Audit_Event__c.Source__c = 'intake'`
- `Audit_Event__c.External_Actor__c = "claimed:" + claimedEmail + "|submission:" + submissionId`
- `Audit_Event__c.External_Actor_Verified__c = false` (there is no verification step in v1; the flag exists so a later one can set it true)
- `Audit_Event__c.Actor_Id__c` = the integration user's id — the *acting* identity, honestly distinct from the *claimed* one.

The trail therefore never reads "system created this". It reads "the intake application, acting for someone who claimed to be X, unverified". The cockpit renders it that way too (§6.4).

**Beneficial-ownership claims from the intake path are never written to `LLC_BI__Connection__c`.** Per adjudication (a), ownership edges are pre-seeded and the agent reads and confirms them. A prospect's claimed owner is stored as a claim and surfaced to the banker for confirmation. `UpsertParty` stays phase-2.

---

## 5. Server definitions, permission sets, and the schema budget

### 5.1 Two server definitions (Codex round-2, adopted)

Current in-org state (`SELECT Id,DeveloperName,MasterLabel FROM McpServerDefinition`, Tooling):

| DeveloperName | Id |
|---|---|
| `Customer360` | `1g1bb000000AOfNAAW` |
| `CreditMemoExperinece` | `1g1bb000000AOXJAA4` |
| `AFArcTestServer` | `1g1bb000000AOU5AAO` |
| `Test123` | `1g1bb000000AOVhAAO` |

The deployed `Customer360.mcpServerDefinition` (retrieved) carries **23 `<tools>` blocks**: 9 reads (`Customer360Snapshot`, `RelationshipGraph`, `Exposure`, `Covenants`, `Opportunities`, `StructuralSignals`, `SearchAccounts`, `Portfolio`, `ActionHistory`) + 8 `stage_*` + 6 `execute_*`.

**Target layout (three definitions, not two):**

| Definition | Tools | Rationale |
|---|---|---|
| `Customer360` | 9 reads | unchanged; read-only clients unaffected by write deploys |
| `Customer360Write` | 14 existing credit-action tools | unchanged |
| **`Customer360Onboarding`** | 7 new tool rows (§1.3.7) | **Delta vs Codex's two-definition recommendation.** Justified in §5.3: the budget is already blown, so a third split is the only way to keep any single connected set inside a plausible cap, and onboarding is a distinct persona surface anyway. |

Deploy discipline (lesson 5, non-negotiable): **classes first, definition second, as two separate deploys.** A combined deploy fails with `No "aa:apex-X" identifier found for source "API_CATALOG"`. Metadata type requires sourceApiVersion 67.0+.

### 5.2 Permission sets

| Permission set | Grants | Assigned to |
|---|---|---|
| `C360_Onboarding_Read` | Apex class access to read tools; FLS read on Onboarding/KYC/screening fields | bankers |
| `C360_Onboarding_Write` | Apex class access to `stage_*`/`execute_*`/`record_*`/`attach_*`/`advance_*`/`log_*`; **CRUD+FLS on the active container object, `KYC_Screening__c`, `FinServ__IdentificationDocument__c`, `FinServ__Alert__c`, `Task`, `ContentVersion`, `ContentDocumentLink`** (Codex confirmed-spec: *"standard objects still need FLS/CRUD under USER_MODE"*); **read-only on `KYC_Clearance__c`, explicitly DENYING FLS write on `Cleared_By__c`, `Cleared_On__c`, `Clearance_Basis__c`**; **no write on `KYC__c` at any field** (D-10); no access to `Audit_Event__c` at all | bankers |
| `C360_Onboarding_Attest` | Apex class access to `AttestKycClearance` only; FLS write on the three `KYC_Clearance__c` clearance fields | **named humans only**; never the integration user |
| `C360_Intake_Integration` | Apex class access to the intake `@RestResource` classes only; CRUD on Account/Onboarding/ContentVersion/ContentDocumentLink; **no** Task, **no** `KYC__c` write, **no** attestation class | the intake integration user, and nobody else |
| `C360_Action_Staging_Access` | existing, in-org | unchanged |

**Lesson 1 is a hard gate on all of these:** *"every new object or field ships WITH its permission set in the same deploy, and the permission set is assigned to the tool-running identity AND the test-running identity before any test run."* Metadata API grants FLS to nobody by default — this is precisely why `KYC__c`'s 206 fields are invisible to us today.

**Also required and easy to miss:** to read the existing `KYC__c` fields at all, the tool identity needs FLS on them. The three holders are Bloom permission sets. **Do not assign `BloomSystemAdmin`** — it is a pre-existing production-shaped set and assigning it widens our blast radius. Build `C360_Onboarding_Read` with an explicit, minimal field list.

### 5.3 The ChatGPT aggregate schema budget — MEASURED, and it fails

Clawdy #7 and Codex both required this be settled at design time. It is now settled, and the answer is worse than either anticipated.

**Method.** For each of the 23 deployed C360 actions I fetched `GET /services/data/v67.0/actions/custom/apex/{ActionName}` and measured, per tool, `len(name) + len(description) + len(minified JSON of the inputs array)` — the three components a host serialises into its tool list. Output schemas are excluded (hosts generally do not send them upfront); if a host does send them, every number below rises.

| Group | Tools | Bytes |
|---|---|---|
| Reads | 9 | **7,546** |
| `execute_*` | 6 | **11,025** |
| `stage_*` | 8 | **28,941** |
| **Total, as deployed today** | **23** | **47,512** |

Most expensive individual tools: `StageAnnualReview` 5,263 · `StageRiskRatingReview` 4,071 · `StageCollateralValuation` 4,033 · `StageLoanModification` 3,492 · `StageNewFacility` 3,177. Cheapest: `Customer360Opportunities` 483. Mean 2,065.

**Against a 5K budget:**

- If the cap is 5,000 **characters**: we are at **9.5×** today.
- If the cap is 5,000 **tokens** (~3.5 chars/token for JSON): ≈13,575 tokens today, **2.7×**.
- **The unit is UNVERIFIED.** I could not find a citation for it in the source documents; the plan states "5K" without a unit. This must be pinned before anyone commits to a mitigation.

**Adding the onboarding set** (estimated by analogy to same-shaped deployed tools, marked as estimate):

| New tool | Est. bytes | Basis |
|---|---|---|
| `stage_create_prospect` | ~3,000 | ≈ `StageServiceRequest` (8 inputs, 2,975) |
| `execute_create_prospect` | ~1,800 | ≈ `ExecuteServiceRequest` (1,809) |
| `record_kyc_result` | ~2,200 | ~9 inputs |
| `attach_document` | ~1,800 | ~6 inputs + base64 |
| `advance_onboarding_stage` | ~1,700 | ~6 inputs |
| `log_interaction` | ~1,600 | ~6 inputs |
| `attest_kyc_clearance` | ~1,400 | ~4 inputs |
| **Subtotal** | **~13,500** | |

**Projected total: ~61,000 bytes across 30 tools.**

**Conclusion: splitting into two (or three) server definitions does not solve this.** Codex round-2 flagged the reason itself: *"the ChatGPT 5K cap is an AGGREGATE connected-tools budget per host, not per-server."* If a user connects reads + writes + onboarding, they pay 61,000 regardless of how many definitions it arrived in. **The split buys permissioning and blast radius, not budget.**

**And this is now a chat-UX constraint, not just a platform limit** (founder scope addendum §2): bare claude.ai chat surfaces every connected tool at once. Thirty tools averaging 2 KB of schema is a tool-selection problem before it is a byte problem — the model must choose correctly among 8 `stage_*` variants with near-identical input shapes.

**Three mitigations, with honest costs:**

| Option | Mechanism | Saving | Cost |
|---|---|---|---|
| **A. Persona-scoped connection sets** | Onboarding users connect `Customer360` + `Customer360Onboarding` (~21 KB, 16 tools). Credit users connect `Customer360` + `Customer360Write` (~47 KB, 23 tools). Nobody connects all three by default. | Caps any one session at ~21 KB | Does not fix the credit set, which is already 47 KB. Palliative. |
| **B. Description diet + input pruning** | Descriptions total 5,951 bytes across 23 tools; input schemas total 41,561. The win is in inputs: `StageAnnualReview` has **15** `@InvocableVariable`s. Audit for inputs the cockpit never sends and drop them. | Estimated 15–25% (~8–12 KB) | Real work, low risk, no contract change for retained fields. **Do this regardless.** |
| **C. Facade tools** | Collapse the 8 `stage_*` into one `stage_credit_action(actionType, accountId, payloadJson)` (~600 bytes) and 6 `execute_*` into one `execute_credit_action`. | ~38 KB → ~1.2 KB. Total would drop to ~10 KB. | **High.** Loses the typed wire contract; `payloadJson` is opaque to the model, so chat-surface usability may get *worse*, not better; requires re-observing every envelope (lesson 16aa); and re-litigates a shipped, 142-test-green design. |

**Recommendation:** **B now, A as the default posture, C only if the unit turns out to be characters.** And pin the unit first — the entire decision hinges on it, and nobody has verified it.

**This is escalated as a founder decision (D-6), not settled here.** It is the one finding in this document that could change the shape of the existing, working build.

### 5.4 Untrusted-data fence, server-wide (Codex round-2)

*"all tools' free-text return fields (account names, doc titles, task text) are fenced/labeled — the read tools' returns are model input for an agent that now holds write tools."*

A single `C360Fence.wrap(String label, String value)` helper applied at the response-assembly boundary of **all 30 tools**, not just the new ones. Fields fenced: `Account.Name`, `ContentVersion.Title`, `Task.Subject`/`Description`, `KYC_Screening__c.Findings__c`, `LLC_BI__Closure_Reason__c`, gateway `provider` strings, and every intake-supplied string. Output shape follows the brain's own convention (`<untrusted source="...">…</untrusted>`), so the calling agent's constitutional rule applies to it unchanged. A test asserts no free-text field reaches a response unfenced.

---

## 6. Cockpit onboarding surface — lifecycle-aware extension of the existing shell

**Founder scope addendum §1, binding.** Not a separate artifact, not a portal fork.

### 6.1 What exists today (all cited from `app/src/`)

- `state/appState.tsx` — `ViewState { view: "home" | "account"; accountId: string | null; tab: AccountTab; ... }`, a reducer with `OPEN_ACCOUNT` / `SET_TAB` actions, plus `ACCOUNT_TABS`.
- `components/AppShell.tsx` — branches on `state.view === "home"` vs `"account"`.
- `components/Worklist.tsx` — the L1 book view; TanStack table with `SortingState`, a `SearchInput`, rows from `buildWorklistRows` (`data/worklistRows`), `openRow(r)` dispatching into the account view.
- `components/AccountWorkspace.tsx` — the L2 shell: a KPI/anchor strip, a tab rail mapping `ACCOUNT_TABS`, and `<TabContent tab={state.tab} bundle={bundle} />`.
- `components/tabs/index.tsx` — a static `TABS: Record<AccountTab, Component>` registry of 7 tabs: `activity`, `exposure`, `covenants`, `graph`, `opportunities`, `signals`, `financials`.
- `chatParity.test.tsx` — chat-surface parity is already an existing tested concern.

### 6.2 L1 — two zones in one worklist

`ViewState` gains `zone: "book" | "onboarding"`, defaulting to `"book"`, persisted via the existing `state/persist.ts`.

- A top-level segmented toggle in `TopBar.tsx`: **My book** · **In onboarding**, each with a live count.
- `buildWorklistRows` gains a sibling `buildOnboardingRows` producing: prospect name, `LLC_BI__Type__c`, stage, days-in-stage, screening status (worst `Result__c` across the case), documents received/outstanding, attestation state, and a blocking-item chip.
- **Global search spans both zones regardless of the active toggle.** The existing `SearchInput` filters a union; a result from the inactive zone renders with a zone badge and switching is implicit on open. This is the addendum's "global search across both".

### 6.3 L2 — one borrower shell, lifecycle-keyed tab set

`components/tabs/index.tsx` changes from a static record to a lifecycle-keyed selection. This is a small, contained change to an existing seam.

```
type Lifecycle = "onboarding" | "booked";

const ONBOARDING_TABS = ["process", "parties", "documents", "screening", "attestation"];
const BOOKED_TABS     = ["activity", "exposure", "covenants", "graph",
                         "opportunities", "signals", "financials"];

lifecycle(bundle) =
    bundle.onboarding && bundle.onboarding.stage !== "Complete" ? "onboarding" : "booked";
```

**The decision is derived from data, never stored in UI state.** The shell reads the bundle; the bundle carries the onboarding case or does not. This makes the zone migration automatic: when `Stage` becomes `Complete` (only ever via the attestation path), the next sync flips the account from `onboarding` to `booked`, it leaves the "In onboarding" zone, and the classic tab set mounts. **Nothing else changes** — same shell, same header, same chat, same actions panel.

Five new tab components under `components/tabs/`:

| Tab | Content | Data source |
|---|---|---|
| `ProcessTab` | Stage lifecycle tracker (reuse `StepTracker.tsx`), days-in-stage, blocking items, the Complete gate rendered as a visibly locked step with its reason | onboarding read tool |
| `PartiesTab` | Pre-seeded ownership edges with a **Confirm** affordance per edge (adjudication (a)), each showing its typed FSC role and provenance tag (`ncino` / `fsc`, §2.8.3) + intake-claimed parties in a separate, clearly-labelled "Claimed, unconfirmed" group | `Customer360RelationshipGraph` (unioned) + claimed-party rows |
| `DocumentsTab` | Identity documents (type, number masked, issuing country, expiry, verified-by/on) plus other attachments; hash, source (`banker` / `intake`), simulated badge | `FinServ__IdentificationDocument__c` + `ContentDocumentLink` |
| `ScreeningTab` | Per party × type: result, provider, screened-on, **persistent Simulated badge** (§3.4), findings fenced and rendered as quoted evidence; open `FinServ__Alert__c` rows shown as the dismissible surfacing layer, visibly separate from the immutable evidence | `KYC_Screening__c` + `FinServ__Alert__c` |
| `AttestationTab` | Current clearance state, who/when/basis if attested, the client-attestation precondition, and the attestation affordance itself — **shape depends on decision (b)**; see `ATTESTATION-BRIEFING.md` §4 for how each option renders here | `KYC_Clearance__c` + read-only `KYC__c.ClientAttestation__c` |

### 6.4 Routing, state, and deep links

| Concern | Design |
|---|---|
| Tab-set mount | `lifecycle(bundle)` derived per render. No stored lifecycle flag anywhere. |
| Invalid tab for lifecycle | Deep link to `#/account/{id}/exposure` on an onboarding account → redirect to the lifecycle's first tab (`process`) with a one-line explainer chip, never a blank tab. Symmetrically for `#/…/screening` on a booked account, which shows the historical screening record read-only. |
| Zone transition | Automatic and data-driven (§6.3). The record visibly moves; no manual re-filing. |
| Deep-link stability | `DeepLink.tsx` already exists. Account ids remain the key; the tab segment becomes lifecycle-validated. An onboarding-era link to a now-booked account still resolves to the account, with the historical tab if it exists. |
| Persistence | `zone` persists per addendum; `tab` continues to persist per account as today. Staging tokens and plans are **never** persisted (existing, tested invariant — HANDOFF §6). |

### 6.5 Data flow — one new read tool

**Recommendation: one new read tool, `Customer360Onboarding`, not an extension of `Customer360Snapshot`.**

Rationale: (a) `Snapshot` is on the fast sync tier and fires every sweep; onboarding data is slow-moving and belongs on the 5-minute tier alongside graph and covenants. (b) Extending Snapshot grows a tool that every booked account pays for, to carry data only onboarding accounts have. (c) Schema budget (§5.3) — a focused tool is cheaper than widening a hot one. (d) It lives in the `Customer360Onboarding` definition, so read-only credit clients never load it.

Returns: the onboarding case, its stage/status/dates, screening rows, document rows, claimed parties, and clearance state — in one call, matching the cockpit's existing bundle-per-account pattern.

### 6.6 Disambiguation, stated explicitly (addendum requirement)

**The client-facing intake portal is a fully separate surface.** Different actor (a prospect, not a banker). Different identity (integration user via Client Credentials, not per-user OAuth). Different transport (private Apex REST, not the hosted MCP). It is never the artifact and never rides the hosted MCP. The banker artifact gets the unified entry described in §6.2–6.4; the prospect gets the intake app described in §4. **Two front doors is architecture, not UI.** The only thing they share is the Apex service layer, which is the entire point.

---

## 7. Chat-pattern parity — binding on every new tool

**Founder scope addendum §2, binding.** Every KYC/onboarding tool is dual-surface from day one: usable from the artifact AND from bare claude.ai chat, exactly as the C360 tools are today.

### 7.1 Requirements

| Requirement | Implementation |
|---|---|
| **Chat-ergonomic names** | snake_case, verb-first, unambiguous without context: `record_kyc_result` not `Customer360RecordKycResult`. Lesson 5 confirms `toolName` is free-form and decoupled from the Apex class name in the `apiIdentifier` (`aa:apex-{ClassName}`) — so the class can stay `Customer360RecordKycResult` while the tool reads naturally. **Maintain the pair deliberately; they are not the same string.** |
| **Prose-readable responses** | Every response carries a `summary` string in banker English alongside the structured fields. A banker in chat with no widget must be able to read the answer aloud. Precedent: the existing `recordName` reporting pattern in `execute_collateral_valuation`. |
| **Refusal messages in banker language** | Every `GuardException` message names (a) what was refused, (b) the record's actual current state, (c) what would have to be true instead — never an Apex identifier or a rule name alone. Existing engine messages already follow this (`'Refused: this tool never deletes ' + objectApiName`); extend, do not regress. The Complete refusal is the one users will hit most and must read as policy, not as a bug. |
| **Stage-plan-token-execute as the conversational confirm** | For `create_prospect`, the plan is the confirm. `stage_create_prospect` returns typed steps + `planHash` + `decisionToken`; the model narrates the plan in prose; the banker says yes; `execute_create_prospect` runs. **No widget required.** `approverUserId` must be an id, never a display name (lesson 4b — this defect ate a whole session once). |
| **Gates hold identically across surfaces** | Because every gate is in the Apex service layer (§1.3), not in the wrapper and not in the panel. Chat may *request* completion or clearance; the Apex refuses unless a human attested through a legitimate path. Nothing about the calling surface changes the answer. |
| **Schema budget is a chat-UX constraint** | Folded into §5.3. Thirty tools at once is a tool-selection problem for the model before it is a byte problem for the host. |

### 7.2 Acceptance criteria

- **AC-P1.** Every one of the 7 new tool rows is exercised end to end from bare claude.ai chat, with no artifact open, and the transcript archived.
- **AC-P2.** A chat-only attempt to set `Stage='Complete'` is refused, and the refusal text is readable by a banker with no Salesforce knowledge. Same for `Status='Complete'` and for `KYC_Status__c='Verified'`.
- **AC-P3.** A chat-only prospect creation completes via stage → prose confirm → execute, with the token never displayed to the user as something they must copy.
- **AC-P4.** Every response's `summary` field is asserted non-empty by test.
- **AC-P5.** `chatParity.test.tsx` is extended to cover the onboarding tools' response shapes.
- **AC-P6.** The measured tool-list byte count for the connected set an onboarding banker uses is recorded in the QA gate output, not estimated.

---

## 8. Phase plan, dependencies, and QA gates

### 8.1 Pre-build probes — the hard gate

Lesson 21: *"Every write object gets an insert (or update) probe before its tool is built."* None of these five objects has a probe in `PROBE-LEDGER.md`. All probes run on `ZZ-PROBE-<date>` throwaway accounts, never on Hartwell or Piedmont, with residue-zero verified by re-query (and for Content, Recycle Bin emptiness verified, not just primary-query absence).

| ID | Probe | Settles | Blocks |
|---|---|---|---|
| **P-1** | Insert `LLC_BI__Onboarding__c` minimal payload, trace-flagged | Org rewrites on insert (15a); defaults; which namespaces wake; whether an async child appears (15b); whether anything leaves the org | CreateProspect |
| **P-2** | Update `LLC_BI__Stage__c` `CustomerEngagement`→`DueDiligence` | What the 30 action overrides / managed onboarding LWCs do on a raw PATCH; whether any automation fires | AdvanceOnboardingStage |
| **P-3** | Insert `KYC__c` under `ZZ-PROBE` account | `ACN_FXT_KYC` behaviour with `Created_from_Mobile__c` false and true; master-detail insert cost; required-field surprises among the 206 | RecordKycResult, Attest |
| **P-4** | `ContentVersion` + `ContentDocumentLink` to an Onboarding record | `LLC_BI.ContentVersionTrigger` behaviour; the lesson-32 re-update trap in practice; `ShareType`/`Visibility` under `insert as user` | AttachDocument |
| **P-5** | Insert `Task` with `WhatId` = Onboarding | **Whether `slackv2.task` posts to a real Slack channel** (5 subscriptions live); `FinServ`/`LLC_BI` trigger behaviour; `LIMIT_USAGE_FOR_NS` callout/email counts | **LogInteraction — hard gate** |
| **P-6** | Deploy the completion-guard trigger to a scratch org first | Whether a local trigger on a managed object is safe here | The §2.7 backstop |
| **P-7** | One read-shaped call to each IDB Gateway screening tool, envelope archived verbatim | Real response shapes; whether the gateway proxies a real vendor; the `simulated` determination in §3.3 | Screening layer |
| **P-8** | Insert `FinServ__IdentificationDocument__c` + `FinServ__Alert__c` on a `ZZ-PROBE` account | Whether FSC managed triggers/flows wake on insert; whether `Alert` insert notifies anyone; whether custom fields on a managed object deploy cleanly (D-8) | AttachDocument, screening surfacing |
| **P-9** | Insert one `FinServ__AccountAccountRelation__c` with a resolved `FinServ__Role__c`, then delete | Whether FSC auto-creates the `FinServ__InverseRelationship__c` mirror row (it may — that changes seed counts and the graph read's dedupe); role-id resolution by name | Ownership pre-seed, D-9 |

Probe method: lesson 15o's deploy-free instrumentation — own `DebugLevel` + `TraceFlag` on the probe actor, pull with `sf apex get log`, grep `ENTERING_MANAGED_PKG`, `VALIDATION_RULE`, `FLOW_ELEMENT_BEGIN`, `LIMIT_USAGE_FOR_NS`; delete both and verify. Never reuse or edit an existing one.

**Lesson 23 applies: HELD is a result.** If P-5 shows a real Slack post, `log_interaction` is HELD and the reason recorded verbatim — not worked around.

### 8.2 Phases

| Phase | Content | Depends on | Exit gate |
|---|---|---|---|
| **O-0** Decisions | D-1…D-6 signed off; attestation mechanism chosen from the briefing; schema-budget unit pinned; WS-E alignment | — | Zero open decisions; zero UNVERIFIED field names in the build set |
| **O-1** Probes | P-1…P-7, all logged to `PROBE-LEDGER.md` with verbatim request, ids, verification query, deletion re-query | O-0 | Residue-zero proven; any HELD recorded |
| **O-2** Schema | `Audit_Event__c`, `Audit_Event__e`, `KYC_Screening__c`, `KYC_Clearance__c`, `KYC_Record__c` on the container, 3 fields on `FinServ__IdentificationDocument__c`, 5 permission sets — **object + permission set in the SAME deploy** (lesson 1). **Zero changes to `KYC__c`.** | O-1 | Permission sets assigned to tool AND test identity; a `WITH USER_MODE` read of every new field succeeds; a diff proves `KYC__c` metadata is byte-identical to pre-build |
| **O-3** Service layer | **Adapter interface + nCino impl + `C360_Onboarding_Container__mdt` FIRST**, then guard rows built from the value map, `C360Audit`, rejection platform event + subscriber, completion-guard trigger, attestation entry point | O-2 | Org suite green; refusal paths asserted by calling `assertAllowed` directly; **AC-C1…C4 green, incl. the `ZZ_TERMINAL` stub-container test** |
| **O-4** Tools | 7 invocable classes (one `@InvocableMethod` per class, lesson 16), API v67.0 | O-3 | Suite green; **every envelope observed live on the wire by the orchestrator** before the definition deploy |
| **O-5** Exposure | `Customer360Onboarding` definition — **separate deploy, after O-4** (lesson 5) | O-4 | Tools callable; measured schema bytes recorded |
| **O-6** Intake | Node service + Apex REST + abuse controls | O-3 (not O-5 — intake does not need MCP) | Same-fence test green; rate limit and captcha proven; kill switch proven |
| **O-7** Cockpit | Zone toggle, lifecycle tab set, 5 new tabs, `Customer360Onboarding` read wiring | O-5 | Cockpit suite green; per-borrower matrix; contrast; clean-room `npm ci` |
| **O-8** Seed + reset | §8.3 | O-2 | Reset script runs twice with zero duplicates |
| **O-9** Rehearsal | End-to-end on `bankinggpt`, both surfaces, chat-only pass | all | AC-P1…P6 |

### 8.3 QA gates — campaign discipline, every phase

Matching the standard the credit campaign held (HANDOFF §3, §10):

1. **Org suite** — full Apex run, per class, `--synchronous` where possible (lesson 7: managed triggers on `Task`/`KYC__c` will time out a single giant run). Report pass/fail counts and per-class coverage. Coverage gaps that are legitimately unreachable are **documented, not padded** (lesson 16c).
2. **Cockpit suite** — `npm run typecheck`, `npx vitest run`, contrast check, clean-room `npm ci`. Verify the numbers; do not trust the builder agent's prose (HANDOFF §3).
3. **Wire-envelope observation by the orchestrator, for every new tool** — non-negotiable. A green suite is structurally incapable of detecting the `required=true` class of defect (lesson 16aa). Every envelope archived alongside `observed-envelopes-facilityIds.json`.
4. **Refusal evidence** — for each gate, a live captured refusal envelope, not just a unit test. Precedent exists: the credit campaign archived a live-captured refusal.
5. **Residue check** — after every rehearsal, re-query for probe/test records and confirm zero.
6. **Deploy receipts** — quoted verbatim. `Created` for everything new; the only legitimate `Changed` receipts are `C360WriteGuard` (allowlist rows) and the `Customer360` definition if tools move between definitions. Both are pre-authorised by campaign doctrine.

### 8.4 Seed data spec

Clawdy #8: credible named prospects, realistic hits, believable ratios — Dreamforce-audience quality, not fixture rows.

**Built through an idempotent registry, not a straight script** (lesson 15ae): every insert keyed into `onboarding-registry.json` and skipped if the key exists, so a partial failure never forces a choice between duplicates and manual cleanup.

**Naming discipline** (lesson 15y-i): match the org's own conventions so seeded records are indistinguishable from wizard-created ones in a list view.

**Four prospects, staged across the lifecycle:**

| Prospect | Type | Stage | Screening | Story |
|---|---|---|---|---|
| **Calder Ridge Cold Storage LLC** | `NewCustomer` | `Validation` | Sanctions Clear, PEP Clear, AdverseMedia Clear, KYB Clear | The clean path. Ready to attest — the demo's attestation beat runs here. |
| **Meridian Foundry Group Inc** | `NewCustomer` | `DueDiligence` | Sanctions **PotentialMatch** (1 match, name-similarity on a director), AdverseMedia Clear | The interesting one. A potential match that a human resolves. Shows the gate holding and the agent *not* deciding. |
| **Brightwater Logistics Holdings** | `KybAndKycOnly` | `CustomerEngagement` | Sanctions Pending, docs outstanding | The honest-absence case. Complete is refused; the surface says so plainly. |
| **Ostrand Marine Services Ltd** | `NewCustomer` | `DueDiligence` | AdverseMedia **Hit** | The adverse case. Shows a refusal that is correct, and a case that does not proceed. |

**Ratios that read as real:** 4 prospects, 1 clean, 1 potential match, 1 pending, 1 adverse — roughly 25% requiring human resolution, which is a believable commercial-onboarding rate. Documents: 3–6 per prospect, 1–2 outstanding on two of them. Days-in-stage: 2, 9, 1, 14 — a spread, not uniform.

**Every seeded screening row is labelled** `Screening_Provider__c = 'Simulated (demo)'`, `Simulated__c = true`, and propagates per §3.4.

**Ownership edges pre-seeded** per adjudication (a): 2–3 edges per prospect, which the agent **reads and asks the banker to confirm** in the Parties tab. No `UpsertParty`, no agent-written edges.

Written as **`FinServ__AccountAccountRelation__c`** per §2.8.3, not `LLC_BI__Connection__c`, because FSC has the vocabulary and nCino does not: the `FinServ__ReciprocalRole__c` catalog holds 17 rows with typed, inverse-paired roles (`Owner ↔ Business`, `Director ↔ Business`, `Business Owners ↔ Business`), whereas all 208 existing `LLC_BI__Connection__c` edges carry the single generic role `"Connection"` and typed nCino role rows are UNVERIFIED. Idempotency is platform-enforced via `FinServ__ExternalId__c` (`unique: true`).

Two seed-script obligations: resolve `FinServ__Role__c` by name through a fail-closed lookup (it is `nillable: false`), and handle whatever P-9 shows about auto-created inverse mirror rows — if FSC creates the reciprocal edge itself, the registry must key on the pair, not the row, or the reset script will orphan half of each relationship.

**FSC seeded rows are net-new only.** The 8 pre-existing `FinServ__AccountAccountRelation__c` rows are read-only (§2.9) and are never touched by the seed or reset scripts.

**Demo reset script — an explicit deliverable** (Codex confirmed-spec: *"Demo reset script + frozen-data fallback (recorded run) as explicit deliverables; rehearsals must not accumulate state drift"*):

- Deletes only registry-keyed records, by id, never by query pattern.
- Resets stages/statuses/screening rows to the table above.
- Verifies by re-query and prints a diff.
- Idempotent: running it twice is a no-op the second time.
- Never touches Hartwell, Piedmont, or any pre-existing record. A guard refuses to run if any target id is absent from the registry.
- Paired with a **frozen-data fallback**: a recorded run of the full demo, so a live failure on stage has an exit.

---

## 9. Open decisions for the founder

| ID | Decision | Recommendation | Why it needs a human |
|---|---|---|---|
| **D-1** | Create `Audit_Event__c` + `Audit_Event__e` rather than use `nFORCE__Audit_Log__c` | Build our own | Touching a managed audit surface is a doctrine-#5 question |
| **D-2** | Screening results on a new `KYC_Screening__c`, not on `KYC__c` | New object | Departs from WRITE-FEASIBILITY; touches an existing Accenture build |
| **D-3** | `CreateProspect` upgraded to a `stage_`/`execute_` pair | Yes | Adds a confirm the plan did not have |
| **D-4** | Completion backstop as a trigger (Option B) rather than a VR | Option B | First local trigger on a managed nCino object |
| **D-5** | Attestation mechanism | **No recommendation** — see `ATTESTATION-BRIEFING.md` | Explicitly reserved by the founder |
| **D-6** | **Schema budget: pin the unit, then choose A/B/C (§5.3)** | B + A; C only if the unit is characters | Could change the shape of the shipped credit build |
| **D-7** | `LogInteraction` ships only if probe P-5 shows no real Slack post | HELD until proven | External side effect at a real human |
| **D-8** | Add 3 custom fields to managed `FinServ__IdentificationDocument__c` (§2.8.1) | Yes — far smaller footprint than a custom object | Custom fields on a managed object |
| **D-9** | Extend `Customer360RelationshipGraph` to union FSC edges (§2.8.3) | Union, not switch | `Changed` receipt on a shipped read tool every credit surface depends on; overrides a documented prior decision |
| **D-10** | **SETTLED by founder 2026-07-28:** zero schema changes to `KYC__c`; join via our `KYC_Record__c` on the container; clearance on `KYC_Clearance__c` (§2.3 D-3) | n/a — adjudicated | recorded for traceability |
| **D-11** | **SETTLED by founder 2026-07-28:** container-agnostic adapter, AC-C1…C4 (§2.10) | n/a — adjudicated | recorded; note the per-container trigger cost (§2.10.3 limit 3) |

---

## 10. What remains UNVERIFIED

Stated plainly so nobody mistakes absence of evidence for evidence.

- **All write behaviour.** No DML was performed. Insert defaults, org-side field rewrites, async children, managed-trigger side effects, and validation-rule behaviour on `LLC_BI__Onboarding__c`, `KYC__c`, `Task`, `ContentVersion` are all UNVERIFIED. Probes P-1…P-6 exist precisely because this document refuses to guess.
- **The ChatGPT cap's unit** (characters vs tokens) — no citation found in any source document.
- **What a host actually serialises** into a tool list. §5.3 measures the Actions API describe, which is the input the MCP layer transforms. The true wire payload may differ; the measurement method is stated so it can be corrected.
- **IDB Gateway response shapes and whether the gateway proxies real vendors.** All of §3 is mapped from names and context. P-7 settles it.
- **`LLC_BI__Connection_Role__c` typed role rows** — the 35-role catalog exists (per `CUSTOMER-AND-HOUSEHOLD-MODEL.md §A`) but the existence of "Beneficial Owner" / "Guarantor" rows is unverified.
- **`ACN_FXT_KYC` runtime behaviour.** The body was read; its handler's only side-effecting line is commented out. Whether it is genuinely inert under all field combinations is UNVERIFIED (P-3).
- **PersonAccount enablement** in `bankinggpt` — assumed by WRITE-FEASIBILITY, never verified, and not verified here.
- **What the 30 `<actionOverrides>` and the ten managed onboarding LWCs actually do** on a raw stage PATCH (P-2).
