# Customer 360 MCP — Write-Capability Feasibility Assessment (2026-07-12)

**Author:** research pass (SSH session, native tools + live `sobject-sf` describe against `bankinggpt`).
**Scope:** Can the Customer360 Salesforce-hosted MCP server carry FIRST-CLASS write tools for KYC +
client onboarding, used by banker-side agents directly AND by a future client-facing intake service?
**Verdict:** **Feasible, and lower-risk than expected** — because the org already ships purpose-built
nCino objects for onboarding (`LLC_BI__Onboarding__c`) and relationship-grade compliance
(`LLC_BI__Relationship_Compliance__c`), the write mechanism is already proven twice in-org
(CreditMemoExperinece + the Aethon FSC demo), and the fleet already has a battle-tested gated/audited
write discipline to copy. The two real constraints are: (1) the client-facing intake path CANNOT use
the hosted MCP (no server-to-server identity — must be a separate service), and (2) demo data does not
exist and must be seeded.

Every schema claim below is marked **VERIFIED** (confirmed by live describe/SOQL this session,
`fabian.goetzens@accenture.com.bankinggpt`, System Administrator, API v64.0) or **UNVERIFIED**
(needs a live check before a field name is written into Apex). This project has been burned by invented
schema before (HANDOVER-2026-07-01.md §2) — the rule holds: no field name ships unverified.

---

## 0. What is already true (the foundation the writes build on)

- **The read server is live and correct.** 8 Apex `@InvocableMethod` tools + one `McpServerDefinition`
  deployed to `bankinggpt` (`sf-build-v2/`, mirrored to
  `/opt/connectry/projects/commercial-credit-reinvented/bankinggpt-sfdx/force-app/main/default/`).
  The `McpServerDefinition` XML lists 8 `<tools>` blocks (Snapshot, RelationshipGraph, Exposure,
  Covenants, Opportunities, StructuralSignals, SearchAccounts, **Portfolio** — the last is present in
  the deployed XML and `.cls` set though the handover prose says "7"; VERIFIED by file listing).
- **The write MECHANISM is proven three ways** (see §2): the deployed read classes are ordinary
  `global with sharing` Apex with `@InvocableMethod` (add DML → it's a write tool); Noland's
  `CreditMemoExperinece` hosted MCP already exists in-org; and the **Aethon as-built**
  (`extracted-aethon-asbuilt.txt`) marks `sobject-mutations` and `custom / invokeflows` as **IN USE**
  against FSC with Sharing/FLS + Audit Trail also IN USE — a live proof that hosted-MCP mutations work.
- **The fleet already has a gated/audited write pattern** in `experience-mcp` (a Node/Vercel MCP, NOT
  the hosted one): `assertWritesAllowed()` behind `EXPERIENCE_ALLOW_WRITES`, `actorStamp()` attribution,
  `recordAudit()` self-logging, and a Snowflake `DECISION_LEDGER` / `AUDIT_EVENTS` decision ledger
  (`src/ncino.js`, `src/sfClient.js`, `src/memory.js`, `src/snowflakeStore.js`). This is the discipline
  the new tools must inherit — but note the transport difference in §2/§3.

---

## 1. Write tool set — assessed, refined, extended

Candidate set assessed, plus additions. For each: target object/fields (VERIFIED/UNVERIFIED),
idempotency key, sharing/FLS posture, audit shape, effort (S/M/L).

### Schema ground truth established THIS session (the load-bearing discoveries)

| Object | Status | What it is | Fields that matter |
|---|---|---|---|
| **`LLC_BI__Onboarding__c`** ("Onboarding Case") | **VERIFIED, 0 rows** | nCino's native onboarding container. THIS is where onboarding stage lives — not a new custom object, not the Product Package. | `LLC_BI__Stage__c` picklist **{CustomerEngagement, DueDiligence, Validation, Complete}**; `LLC_BI__Status__c` {Open, InProgress, Complete, Cancelled, Declined}; `LLC_BI__Type__c` REQ **{NewCustomer, NewProduct, KybAndKycOnly, RiskAssessmentOnly, AmendMandate, SmallBusiness}**; `LLC_BI__Account__c` REQ (→Account); `LLC_BI__Product_Package__c`, `LLC_BI__Product_Line__c`, `LLC_BI__Parent_Onboarding_Case__c` lookups; `LLC_BI__Started_DateTime__c`, `LLC_BI__Complete_DateTime__c`, `LLC_BI__Closure_Reason__c`, `LLC_BI__lookupKey__c` |
| **`LLC_BI__Relationship_Compliance__c`** | **VERIFIED** (row count UNVERIFIED) | Account-grain CDD/KYB risk-factor record. Real KYC signal carrier. | `LLC_BI__Account__c` REQ; `LLC_BI__Senior_Foreign_Political_Figure__c` {No,Yes} (**PEP**); `..._Assoc__c` (PEP associate); `LLC_BI__Lives_In_Foreign_Country__c`; `LLC_BI__KYB_Eligibility_Status__c` {Eligible, Ineligible}; `LLC_BI__Membership_Eligibility_Status__c`; `LLC_BI__lookupKey__c` |
| **`LLC_BI__Entity_Compliance__c`** | **VERIFIED** | HMDA / Dodd-Frank 1071 demographic collection, keyed to `LLC_BI__Entity__c` REQ. **Regulatory demographic data, NOT AML/sanctions screening.** Do not use for KYC screening result. | (100+ HMDA/1071 fields; not the right home) |
| **`KYC__c`** | **VERIFIED, 0 rows** | LOCAL custom object (no managed namespace). Bare shell: `Name` + `Account__c` (REQ →Account) only. Field **History tracking is enabled** (`KYC__History` child). No result/status/screening fields exist yet. | Extendable — it is local, so the team can add fields freely |
| **`Compliance_Check__c`** | **VERIFIED, 1 row** | LOCAL custom object. `Approval_Status__c` {Approved, Rejected}, `Reason_for_decision__c` (textarea 32k), keyed to `Financial_Account__c` (→FinServ__FinancialAccount__c). Retail/financial-account grain — wrong grain for commercial obligor KYC. | Not the commercial fit |
| **`LLC_BI__Application__c`** ("Application") | **VERIFIED** exists (fields UNVERIFIED) | nCino application object — possible alternative onboarding anchor. Not described this session. | UNVERIFIED |
| **`Interaction` / `InteractionSummary`** (FSC) | **VERIFIED** exist | Standard FSC engagement objects for LogInteraction. | UNVERIFIED field-level |
| `Account`, `Task`, `ContentVersion`, `ContentDocumentLink`, `Opportunity` | Standard | Universal SObjects, always writeable. | Standard |

> **Namespace note (2GP / managed package):** `LLC_BI__*` objects are nCino MANAGED-package objects.
> You can INSERT/UPDATE their records freely and you can add *custom fields* to them (the fields land in
> YOUR local namespace, e.g. `Screening_Result__c` on `LLC_BI__Onboarding__c`). You CANNOT modify nCino's
> own fields, validation rules, or flows. `KYC__c`/`Compliance_Check__c` are LOCAL objects — fully yours.
> None of this requires you to build or ship a 2GP package: the Customer360 tools are org-local Apex
> classes deployed by metadata, exactly like the read tools. **No packaging effort.** (VERIFIED: read
> tools already deployed this way.)

---

### Tool 1 — `Customer360CreateProspect` (Account + Onboarding Case + initial party)

- **Targets:** INSERT `Account` (RecordType `Business` or `Individual`/PersonAccount — VERIFIED record
  types exist per SCHEMA-VERIFIED.md §"Household is a record type"); INSERT `LLC_BI__Onboarding__c`
  (`LLC_BI__Account__c`, `LLC_BI__Type__c`='NewCustomer' or 'KybAndKycOnly', `LLC_BI__Stage__c`
  ='CustomerEngagement', `LLC_BI__Status__c`='Open', `LLC_BI__Started_DateTime__c`=now) — **all
  VERIFIED**; optionally seed the first `LLC_BI__Connection__c` owner edge (VERIFIED fields, see the read
  class `Customer360RelationshipGraph.cls`).
- **Idempotency:** dedup on `Account.Name` + a caller-supplied `externalRef` written to
  `LLC_BI__Onboarding__c.LLC_BI__lookupKey__c` (VERIFIED field, purpose-built as a lookup key). Query
  lookupKey first; upsert semantics. Return existing ids if matched. Also run against the org's
  standard `DuplicateRecordItem` duplicate rules if present (UNVERIFIED whether active).
- **Sharing/FLS:** `with sharing` + `WITH USER_MODE` on the pre-insert dedup query; DML runs as the
  authenticated user (banker) so ownership + FLS are native. Client-facing path uses a scoped
  integration user (§2).
- **Audit shape:** `{ eventType:'prospect_created', objectType:'LLC_BI__Onboarding__c', recordId, accountId, actorName, actorId, occurredAt, source:'banker'|'intake' }`.
- **Effort: M.** Two-object insert + dedup + record-type resolution. The onboarding object already
  exists so no schema build.

### Tool 2 — `Customer360UpsertParty` (owners / guarantors into the Connection graph)

- **Targets:** UPSERT `LLC_BI__Connection__c` (`LLC_BI__Connected_From__c`, `LLC_BI__Connected_To__c`,
  `LLC_BI__Connection_Role__c` →`LLC_BI__Connection_Role__c` catalog, `LLC_BI__Ownership_Percent__c`,
  `LLC_BI__Is_Active__c`) — **VERIFIED** (these are exactly the fields the read class already selects).
  Optionally UPSERT `LLC_BI__Legal_Entities__c` for borrower/guarantor role on a facility (VERIFIED
  fields from the read class: `LLC_BI__Borrower_Type__c`, `LLC_BI__Guaranty_Amount__c`, etc.). May need
  to INSERT a party `Account` (PersonAccount) first if the owner isn't yet a record.
- **Trap (VERIFIED):** the `LLC_BI__Connection_Role__c` is a 35-role catalog object, but ALL 208 live
  edges use the generic role "Connection" (CUSTOMER-AND-HOUSEHOLD-MODEL.md §A). Writing "Beneficial
  Owner"/"Guarantor" roles requires resolving the role record Id by name first — **UNVERIFIED that those
  specific role rows exist**; verify/seed the role catalog before writing typed roles.
- **Idempotency:** natural key = (from, to, role). Query-then-insert-or-update; never blind-insert (the
  graph double-edges easily).
- **Sharing/FLS:** as user. **Beneficial-ownership writes are KYC-sensitive** — this is the object the
  read side already treats AS the KYC beneficial-ownership answer.
- **Audit shape:** `{ eventType:'party_upserted', role, ownershipPercent, counterpartyId, ... }`.
- **Effort: M.** Graph writes + role resolution + PersonAccount creation branch.

### Tool 3 — `Customer360RecordKycResult` (screening outcome + evidence reference)

This is the tool with the most schema ambiguity. `KYC__c` is empty AND has no result fields; the org has
NO purpose-built AML-screening-outcome object. Three viable homes, ranked:

1. **RECOMMENDED — extend the local `KYC__c` shell.** It is a local custom object (VERIFIED), already
   named for the job, already has an `Account__c` lookup and field-history tracking. Add local custom
   fields (all **UNVERIFIED — to be created**): `Screening_Type__c` {OFAC, PEP, AdverseMedia, KYB, CDD},
   `Result__c` {Clear, PotentialMatch, Hit, Pending}, `Screened_On__c` (datetime), `Screening_Provider__c`,
   `Evidence_ContentDocumentId__c` (or attach via ContentDocumentLink — see Tool 4), `Party__c`
   (→Account, for per-party screening), `Cleared_By__c` (→User, the human attestation). Effort to add
   fields: **S** (metadata deploy, no packaging).
2. **Risk factors → `LLC_BI__Relationship_Compliance__c`** (VERIFIED fields). Genuinely useful and real:
   write the PEP flag (`LLC_BI__Senior_Foreign_Political_Figure__c`), KYB eligibility
   (`LLC_BI__KYB_Eligibility_Status__c`), foreign-country exposure. This is CDD *risk-attribute*
   capture, complementary to the screening *outcome* in (1). Use BOTH: the outcome record in `KYC__c`,
   the structured risk factors in `Relationship_Compliance`.
3. Avoid `Compliance_Check__c` (wrong grain — financial-account, retail) and `Entity_Compliance__c`
   (HMDA demographic, wrong purpose). Both VERIFIED as poor fits.
- **Idempotency:** natural key = (accountId or partyId, screeningType, screening batch/date). Re-running
  a screen updates the latest row or appends a new dated row (append is more audit-honest — screening is
  point-in-time).
- **Sharing/FLS:** as user. **Governance line (see §3): RECORDING a screening result is bookkeeping (plain
  audited write). CLEARANCE attestation — a human saying "I accept this KYC and let the relationship
  proceed" — stays a human gate.** The tool records `Result__c`; a human sets/attests the clearance.
- **Audit shape:** `{ eventType:'kyc_result_recorded', screeningType, result, evidenceRef, partyId, ... }`.
- **Effort: M** (S for the field additions + M for the two-object write + evidence linking).

### Tool 4 — `Customer360AttachDocument` (ContentVersion + ContentDocumentLink)

- **Targets:** INSERT `ContentVersion` (Title, PathOnClient, VersionData base64), then INSERT
  `ContentDocumentLink` (ContentDocumentId, LinkedEntityId = the Onboarding Case / KYC / Account,
  ShareType='V', Visibility). **This exact 3-step pattern is already implemented and live-validated** in
  `experience-mcp/src/ncino.js` `docmanSave()` (ContentVersion insert without FirstPublishLocationId,
  then link) — copy it. Standard objects, always writeable (VERIFIED via `KYC__c` describe showing
  `ContentDocumentLink`/`AttachedContentDocument` child relationships).
- **Idempotency:** ContentVersion is inherently versioned; dedup on Title + LinkedEntityId + a
  caller `docHash` to avoid double-upload on retry.
- **Sharing/FLS:** as user; ShareType/Visibility control downstream sharing.
- **Audit shape:** `{ eventType:'document_attached', contentDocumentId, linkedEntityId, docType, bytes }`.
- **Effort: S.** Pattern already proven in-fleet.

### Tool 5 — `Customer360AdvanceOnboardingStage`

- **Targets:** UPDATE `LLC_BI__Onboarding__c.LLC_BI__Stage__c`
  (CustomerEngagement→DueDiligence→Validation→Complete) and/or `LLC_BI__Status__c`; set
  `LLC_BI__Complete_DateTime__c` when moving to Complete. **All VERIFIED.** This is the single biggest
  find: onboarding stage has a real, native home with a real picklist — no new object, no faking it on
  the Product Package.
- **Trap (carried from `experience-mcp/src/ncino.js` `advanceStage()` comment, VERIFIED-in-analogue):** a
  raw `LLC_BI__Stage__c` PATCH SKIPS nCino's governed "Mark Stage as Complete" flow. Fine for a visual
  demo; flag loudly if a governed transition (which may fire nCino validation/automation) is required.
  For Dreamforce, raw PATCH is the pragmatic choice — mirror the credit-memo demo's decision.
- **Idempotency:** setting a stage is naturally idempotent (PATCH to the same value is a no-op). Guard
  against illegal backwards transitions in Apex (optional).
- **Sharing/FLS:** as user.
- **Audit shape:** `{ eventType:'onboarding_stage_advance', onboardingId, oldStage, newStage, ... }` —
  same shape as the credit-memo `stage_advance` audit event (memory.js).
- **Effort: S.**

### Additions found natural

### Tool 6 — `Customer360LogInteraction` (recommended)

- **Targets:** cleanest = INSERT `Task` (standard: `WhatId` → Account/Onboarding, `Subject`, `Description`,
  `ActivityDate`, `Status`, `OwnerId`) — universal, zero schema risk, and the read DATA-MAPPING already
  counts open Tasks for the "Open Tasks" KPI (DATA-MAPPING.md §1). Richer alternative = FSC `Interaction`
  / `InteractionSummary` (VERIFIED exist; fields UNVERIFIED). **Recommend Task for v1** (no unknowns),
  Interaction as a later enrichment.
- **Idempotency:** dedup on (WhatId, Subject, ActivityDate) or a caller ref.
- **Effort: S** (Task) / M (Interaction).

### Tool 7 — `Customer360CreateOpportunity` (optional, whitespace → pipeline)

- **Targets:** INSERT standard `Opportunity` (`AccountId`, `Name`, `StageName`, `Amount`, `CloseDate`,
  `LLC_BI__Product_Package__c`) — VERIFIED fields from the read class `Customer360Opportunities`.
- **Governance:** plain audited write (a pipeline opportunity is not a credit decision).
- **Effort: S.** Include only if the demo narrative needs "agent books the next-best-action" — otherwise
  defer; it widens scope without deepening the KYC/onboarding story.

**Recommended v1 write set for the demo:** Tools 1, 3, 4, 5 (CreateProspect, RecordKycResult,
AttachDocument, AdvanceOnboardingStage) + Tool 6 as Task. That is the end-to-end intake→screen→
evidence→advance story. Tools 2 and 7 are phase-2.

---

## 2. Mechanism — how writes work through a Salesforce-hosted MCP server

- **Shape (VERIFIED from deployed source + the McpServerDefinition header comments):** one Apex class per
  tool, one `global @InvocableMethod`, standard `List<Request>→List<Response>`, auto-published to the API
  Catalog, referenced from `McpServerDefinition` by `<tools><toolName>…<apiDefinition><apiIdentifier>
  aa:apex-{ClassName}</apiIdentifier><apiSource>API_CATALOG</apiSource><operation>{ClassName}
  </operation></apiDefinition></tools>`. `<tools>` is a REPEATED top-level element (one block per tool);
  `<toolName>` is REQUIRED (its absence fails deploy with a server-side NPE). A write tool is just a read
  class with DML added. **No new mechanism to invent.**
- **`@InvocableMethod` + DML vs `invokeflows`:** for these writes, **prefer Apex DML** (full control over
  dedup/idempotency, `WITH USER_MODE`, `Database.insert(records, AccessLevel.USER_MODE)`, partial-success
  handling, audit emission in the same transaction). Use nCino's own Flows/`invokeflows` ONLY if a
  governed transition must fire nCino automation (e.g. the "Mark Stage as Complete" flow) — the Aethon
  as-built confirms `invokeflows` is IN USE and works, so it is available if needed, but it trades control
  for coupling to nCino's process. Default: Apex DML; escalate to flow only where a governed side effect
  is mandatory.
- **What the Aethon as-built proves (`extracted-aethon-asbuilt.txt`):** a real production-shaped demo runs
  a React/Next.js portal against Salesforce **Hosted MCP** with `sobject-reads`, **`sobject-mutations`**,
  and **`custom / invokeflows` all marked IN USE**, over the FSC data model, with **Sharing & FLS, Shield
  Encryption, Audit Trail, Compliant Data Sharing all IN USE**. This is direct evidence that (a) hosted-MCP
  mutations are a supported, real pattern, and (b) the platform's native Sharing/FLS/Audit ride underneath
  them. Our writes inherit the same guarantees.
- **Identity — per-user OAuth+PKCE (VERIFIED, HANDOVER §3):** hosted MCP is per-user OAuth+PKCE only; there
  is **no documented server-to-server / on-behalf-of / token-exchange** flow. Consequences:
  - **Banker-side path: ideal.** Writes execute AS the authenticated banker → `CreatedById`/`OwnerId` are
    the real human, native FLS/sharing/audit apply, attribution is free and truthful. No `actorStamp`
    hack needed (unlike the credit-memo path, which runs as a service account and stamps the human into a
    comment — `experience-mcp/src/sfClient.js` VERIFIED).
  - **Client-facing intake path: CANNOT use the hosted MCP.** A prospect has no Salesforce user and there
    is no on-behalf-of flow. **This is a hard constraint — treat as settled.** The intake service must be
    a SEPARATE component (a Next.js/Node service, sibling to `experience-mcp`) that authenticates as a
    dedicated, least-privilege **integration user** via **OAuth 2.0 Client Credentials** (the exact
    pattern already in `sfClient.js`, VERIFIED) and calls **standard Salesforce REST** (or its own private
    Apex REST endpoints) — NOT the hosted MCP. It writes the same objects (Onboarding Case, KYC, Account)
    through the same governed Apex, but under a scoped service identity with its own audit stamp and its
    own connected app. The banker-side hosted-MCP tools and the intake service converge on one shared Apex
    write layer; only the front door and identity differ.

**Design implication:** put the write LOGIC (dedup, idempotency, audit emission) in Apex service classes
that BOTH the hosted-MCP `@InvocableMethod` tools and the intake service's Apex-REST endpoints call. Write
once, expose twice. This is the "one shared write layer, two front doors" architecture.

---

## 3. Governance — extending the fleet's gated-write discipline

The fleet's existing discipline (VERIFIED in `experience-mcp`):
`assertWritesAllowed()` behind `EXPERIENCE_ALLOW_WRITES` → `actorStamp()` attribution → `recordAudit()`
self-log → Snowflake `DECISION_LEDGER` (the WHY) + `AUDIT_EVENTS` (the WHAT), keyed to a spine id
(`memory.js`, `snowflakeStore.js`). Extend it as follows:

- **Write gate switch:** add a `CUSTOMER360_ALLOW_WRITES`-equivalent. For the HOSTED MCP this cannot be a
  Node env var — it must be an Apex-visible gate: a **Custom Metadata / Custom Setting flag** checked at
  the top of every write `@InvocableMethod`, plus a **permission set** that gates who can invoke the write
  tools at all (mirrors the read side's "admin god-mode behind a permission" decision in
  VALIDATION-AND-DECISIONS.md §1). Reads stay open; writes require the flag + the perm.
- **Human gate vs plain audited write — the classification (per the task's own steer):**
  - **HUMAN GATE (attestation required, agent proposes / human commits):** KYC **CLEARANCE** — the decision
    to accept screening and let the relationship proceed. Also: final onboarding transition to `Complete`
    (opening the relationship). These are the "human commits" line the whole fleet already draws
    (DATA-MAPPING.md: "the cockpit concludes and routes; a human commits").
  - **PLAIN AUDITED WRITE (agent may execute, fully logged):** creating a prospect/Onboarding Case;
    RECORDING a KYC screening *result* (Clear/Hit/Pending is bookkeeping of what the screening provider
    returned — not a human judgment); attaching a document; advancing DueDiligence/Validation intermediate
    stages; logging an interaction; upserting a known owner/guarantor party. **None of these are credit
    decisions** — the whole point of keeping them out of the credit-memo plugin.
- **Audit spine:** the credit-memo ledger is keyed to Product Package id. Onboarding is keyed to the
  **Onboarding Case id** (and Account id) — extend the `AUDIT_EVENTS` schema with an
  `ONBOARDING_ID` / `OBJECT_TYPE` column, or (simpler for the hosted path) emit audit rows to a
  **Salesforce-native audit object** written in the same DML transaction (an `Audit_Event__c` local
  custom object) so the audit is atomic with the write and needs no cross-system Snowflake hop from Apex.
  Recommendation: **Salesforce-native `Audit_Event__c` for the hosted-MCP writes** (atomic, no external
  dependency from Apex), optionally mirrored to Snowflake by the intake service for the client-facing path.
  This is a divergence from the credit-memo Snowflake ledger justified by the transport (Apex can't cleanly
  reach Snowflake; the Node services can).
- **SR 11-7 fence (inherited):** none of these writes compute a regulated figure. KYC results are recorded
  facts from an external screening source, not model outputs. Keep the fence: the agent records and routes,
  it never *decides* clearance or a grade.
- **Clawdy consult (per CLAUDE.md):** this is an architectural direction that locks in for months AND
  touches compliance — auto-invoke a Clawdy review of the write-tool set + the human-gate classification
  before build, as the read side did (HANDOVER §2 records a Clawdy architecture review on the 7/8-tool
  split).

---

## 4. Risks + unknowns — ranked

1. **[HIGH] Client-facing intake identity is a separate build, not a tool.** The hosted MCP structurally
   cannot serve unauthenticated prospects (VERIFIED, §2). If the pitch implied "the same MCP serves both,"
   that is wrong — the intake path is a distinct service (integration user + Client Credentials + standard
   REST/private Apex REST). Scope and staff it as its own component. Mitigation: shared Apex write layer so
   the *logic* is built once.
2. **[HIGH] Demo data does not exist.** `LLC_BI__Onboarding__c` = 0 rows (VERIFIED); `KYC__c` = 0 rows
   (VERIFIED); Piedmont has no deposits/treasury/onboarding. A KYC/onboarding demo needs SEEDED data: at
   least one prospect Account, one Onboarding Case walked through stages, KYC result rows, sample evidence
   docs, and typed Connection roles. Build a seed script (Apex or `sf data`) as an explicit deliverable.
3. **[HIGH] `Customer360RecordKycResult` has no ready-made home.** `KYC__c` needs custom fields added
   (UNVERIFIED — to be created); `Relationship_Compliance` carries risk factors but not a screening
   *outcome*. Decide the object model and add fields early (it blocks Tool 3). Low technical effort (local
   object, no packaging) but a real design decision — get it into the Clawdy review.
4. **[MEDIUM] Typed Connection roles unverified.** All 208 live edges use generic role "Connection"
   (VERIFIED). Writing "Beneficial Owner"/"Guarantor" needs the role-catalog rows to exist — **UNVERIFIED**.
   Verify/seed `LLC_BI__Connection_Role__c` before Tool 2 writes typed roles.
5. **[MEDIUM] Governed nCino transitions bypassed by raw PATCH.** Advancing `LLC_BI__Stage__c` by direct
   update skips nCino's stage-completion flow (VERIFIED-in-analogue from the credit-memo path). Acceptable
   for a visual demo; a production build may need `invokeflows` into nCino's governed transition. Decide
   per stage; document the choice.
6. **[MEDIUM] Sandbox OWD is permissive — "run as user" is NOT a security boundary here.** VERIFIED
   (VALIDATION-AND-DECISIONS.md live results): internal sharing is ReadWrite/Public for most objects, so
   run-as-user writes do not enforce least privilege in THIS org. Fine for the demo; do NOT claim the write
   tools enforce least privilege until tested against a Private OWD. The `permission set` gate is the real
   control in this org, not sharing.
7. **[LOW] Interaction between writes and the existing 8 read tools.** Reads are `with sharing` +
   `WITH USER_MODE`, stateless, thin. The main interaction: after a write, a read in the SAME agent turn
   may not see the change if the agent caches — not a code risk (separate transactions), just prompt/UX
   discipline. Also: writes that create records (Onboarding Case, prospect Account) will make the read
   tools' rollups shift — desirable, but seed carefully so the Piedmont demo numbers don't drift
   (Snapshot sums Package TCE; an onboarding-only prospect has no package → reads return cleanly empty,
   VERIFIED by the read class's empty-note handling).
8. **[LOW] 2GP / managed package: effectively a non-issue.** Tools deploy as org-local metadata (VERIFIED
   — that's how the read tools shipped). Adding fields to local `KYC__c` and INSERT/UPDATE of managed
   `LLC_BI__*` records need no package. Only caveat: cannot alter nCino's own managed fields/rules.
9. **[LOW] API version drift.** Read classes and `experience-mcp` pin different API versions (v60/v64/v67
   seen across files). Pick one for the write classes; verify field availability at that version.

---

## 5. Effort + sequence — two people, evenings/weekends, → Dreamforce Sept/Oct 2026

Assumptions (FLAGGED): ~10–14 calendar weeks of runway to a Sept/Oct demo; two builders at ~8–12
productive hrs/week each; Fabian + Noland, banker-side hosted-MCP is the demo hero, client-facing intake
is a stretch goal. Effort in ideal-person-days (S≈0.5–1d, M≈2–3d, L≈4–6d).

**Phase 0 — Decisions + schema (week 1). ~M.**
- Clawdy consult on write-tool set + human-gate classification (auto-invoke per CLAUDE.md).
- Decide the KYC result object model; add local custom fields to `KYC__c` (S). Verify `Connection_Role__c`
  catalog rows (S). Create local `Audit_Event__c` object (S). Pin API version.
- Deliverable: schema deployed, all field names VERIFIED (no more UNVERIFIED in the build set).

**Phase 1 — Shared Apex write layer + audit (weeks 2–3). ~L.**
- Apex service classes (dedup, idempotency, `WITH USER_MODE` DML, `Audit_Event__c` emission) for:
  CreateProspect, RecordKycResult, AttachDocument, AdvanceOnboardingStage, LogInteraction(Task).
- Write-gate: Custom Metadata flag + permission set. Unit tests (the Zero-Error Loop / QA gate applies —
  run tests + code analyzer, verify in scratch/sandbox UI).

**Phase 2 — Hosted-MCP tool wrappers (weeks 3–4). ~M.**
- One `@InvocableMethod` class per tool wrapping the service layer; add `<tools>` blocks to the
  `McpServerDefinition`; deploy (dry-run first). Copy the `docmanSave` ContentVersion pattern for
  AttachDocument. Live-invoke each via anonymous Apex + via the connector, evidence captured.

**Phase 3 — Seed data + banker-side demo narrative (weeks 5–6). ~M.**
- Seed script: prospect Account, Onboarding Case, KYC result rows, evidence docs, typed Connection roles.
- Wire the demo flow: agent creates prospect → records KYC screen → attaches evidence → advances stage →
  human attests clearance → onboarding Complete. This is the show.

**Phase 4 — Widget / visible surface (weeks 6–8). ~M–L.**
- Reuse the `experience-mcp` widget pattern (`customer-360.html` was already the queued next step,
  HANDOVER §5). Agent-fetches-then-passes-data-into-widget (the VERIFIED identity constraint — no
  server-side Customer360 fetch). An onboarding/KYC status widget makes the writes visible.

**Phase 5 (STRETCH) — Client-facing intake service (weeks 8–12). ~L+.**
- Separate Node service, integration user + Client Credentials, private Apex REST calling the SAME shared
  write layer, its own audit. Only if Phases 0–4 land with margin. If time is tight, DEMO the banker-side
  path and DESCRIBE the intake path (architecture diagram) rather than build it.

**Contingency / cut line:** the minimum credible Dreamforce demo is Phases 0–4 banker-side
(CreateProspect + RecordKycResult + AttachDocument + AdvanceOnboardingStage + one widget). Everything
else is upside. The single biggest de-risker already banked: **onboarding stage and KYC both have real
object homes in the org** — no speculative schema, no packaging, mechanism proven three times over.

---

## Appendix — provenance

- Live describe/SOQL this session against `bankinggpt` (System Administrator, API v64.0): `KYC__c`,
  `Compliance_Check__c`, `LLC_BI__Onboarding__c`, `LLC_BI__Entity_Compliance__c`,
  `LLC_BI__Relationship_Compliance__c` field lists + `LLC_BI__Onboarding__c` count (0) + the
  Onboard/KYC/Compliance/Interaction/Application EntityDefinition sweep (128 hits).
- Deployed source: `/opt/connectry/brain/knowledge/projects/company-brain/customer-360-mcp/sf-build-v2/`
  (8 `.cls` + `Customer360.mcpServerDefinition-meta.xml`, read in full).
- Fleet write patterns: `/opt/connectry/projects/commercial-credit-reinvented/experience-mcp/src/`
  {`ncino.js`, `sfClient.js`, `memory.js`, `snowflakeStore.js`} (read in full).
- Project docs: `HANDOVER-2026-07-01.md`, `SCHEMA-VERIFIED.md`, `VALIDATION-AND-DECISIONS.md`,
  `CUSTOMER-AND-HOUSEHOLD-MODEL.md`, `DATA-MAPPING.md`, `kyc-onboarding/incoming/extracted-aethon-asbuilt.txt`.
