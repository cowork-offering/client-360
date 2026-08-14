# Plan of Approach — Harmonized Dreamforce Build (Customer 360 × KYC/Onboarding)

**Date:** 2026-07-12 · **Owner:** Fabian · **Status:** Clawdy-reviewed **CONDITIONAL GO** (§8) + Codex cross-vendor review **SHIP after amendments** (3 rounds, §9) — pending merged-team alignment (WS-E) + Fabian's 3 adjudication calls (§9) before build start
**Inputs:** `WRITE-FEASIBILITY.md` + `CAPABILITY-MAPPING.md` (Opus assessments, both grounded in live org verification and read source), `WEBSITE-ANALYSIS.md`, `incoming/` reference assets.
**Standing decisions (Fabian):** commercial-first, wealth after · writes become FIRST-CLASS on the Customer360 hosted MCP · read-only v1 retired · client-facing intake = sleek upload/portal solution, exact shape open.

---

## 1. Verdict

**Feasible for Sept/Oct with two part-time builders, with a clean cut line.** The merge is a
re-skin-and-extend of proven engines, not a new build:

- Their solution's spine (governed MCP over Salesforce, chat orchestrator, 5-layer frame) is EXISTS-or-stronger on our side.
- All three of their use cases translate to commercial as ADAPT, not BUILD.
- Writes on the hosted MCP are proven three ways in-org; onboarding stage and KYC both have real object homes (`LLC_BI__Onboarding__c` VERIFIED with native stage lifecycle; local `KYC__c` shell extendable).
- The two genuine builds: the **write layer** (5 tools + governance) and the **demo surfaces** (triage queue render, brief packaging, onboarding/KYC status widget).
- The one hard constraint (settled, verified): the client-facing path can never ride the hosted MCP — separate intake service, integration user, same shared Apex write layer. **One write layer, two front doors.**

## 2. Target architecture (the harmonization)

Presented in THEIR five-layer vocabulary, because it maps 1:1 (`CAPABILITY-MAPPING §1.8`):

| Layer | Merged solution (commercial-first) |
|---|---|
| **Engagement** | Claude/Cowork host + MCP-Apps widgets (cross-host: Claude AND ChatGPT) · optional: their Next.js portal pattern re-pointed · client-facing intake widget/form (stretch) |
| **Agency** | Orchestrator agent + credit-memo/underwriting skills + decision ledger. Probabilistic intent, never workflow logic |
| **Work** | Deterministic MCP tools: Boom ratios, covenant grade, memo renderer, **NEW: Customer360 write tools** (CreateProspect, RecordKycResult, AttachDocument, AdvanceOnboardingStage, LogInteraction) |
| **Context** | Boom · AFS · Snowflake ledger · CapIQ/peers |
| **Record** | Salesforce (nCino + FSC co-resident, one org, one auth boundary) + AFS servicing |

**Write architecture:** shared Apex service classes own dedup/idempotency/`WITH USER_MODE` DML/audit
emission. Two front doors call them: (1) hosted-MCP `@InvocableMethod` wrappers, per-user OAuth, banker
writes as themselves; (2) intake service (Node, sibling of experience-mcp), integration user + Client
Credentials + private Apex REST, for the client-facing path. Audit = Salesforce-native `Audit_Event__c`
written atomically in the same transaction (Apex can't reach Snowflake cleanly); Node paths mirror to the
Snowflake ledger.

**Governance line (SR 11-7 consistent):** agent executes plain audited writes (create prospect, record
screening result, attach doc, intermediate stage advances); humans gate KYC **clearance** attestation and
the final `Complete` transition. Customer submits → system screens → banker attests.

## 3. Workstreams

### WS-A — Write capability (the core build) — owner: build pair
Phases per `WRITE-FEASIBILITY §5`:
- **A0 (wk 1): decisions + schema.** Clawdy consult; KYC result object model (extend local `KYC__c` + risk factors to `LLC_BI__Relationship_Compliance__c`); create `Audit_Event__c`; verify/seed `LLC_BI__Connection_Role__c` typed roles; pin API version. Exit: zero UNVERIFIED field names in build set.
- **A1 (wk 2–3): shared Apex write layer** + Custom-Metadata write gate + permission set + unit tests (Zero-Error/QA gate).
- **A2 (wk 3–4): hosted-MCP wrappers** + `McpServerDefinition` update, dry-run deploy, live invocation evidence.
- **A3 (wk 5–6): seed data + demo flow** — prospect → KYC screen → evidence → stage advances → human attests → Complete.

### WS-B — Demo surfaces — owner: build pair (interleaved)
> **WS-B formally absorbs the open C360 backlog from HANDOVER-2026-07-01 §5** (the `customer-360.html` widget, standing up `customer-360-reinvented` properly incl. the parked plugin-`mcpServers` auto-bundling, and the never-re-verified end-to-end live run). C360 was not finished pre-merge; the merge gives that backlog its deadline and forcing function. B1–B4 below ARE those items, Dreamforce-shaped — nothing is built twice.
- **B1 [MUST, M]: monitoring/triage queue render** (Work Queue/Tickler, `EXPERIENCE-SPEC §5.1`) — serves BOTH their compliance-triage translation and the daily-brief beat. Highest-leverage single build.
- **B2 [MUST, M]: relationship brief as opening beat** — package the cockpit header verdict as the demo's first screen against live Piedmont.
- **B3 [MUST, S]: end-to-end live rehearsal** on `bankinggpt` (fetch → cockpit → memo → writeback → audit) — confirm current state, capture evidence.
- **B4 [SHOULD, M]: onboarding/KYC status widget** (makes WS-A writes visible; reuse experience-mcp widget pattern).
- **B5 [SHOULD, S]: cross-host proof** — same widget in Claude + ChatGPT hosts, recorded. The sharpest differentiator vs their bespoke portal.

### WS-C — Narrative assets — owner: Fabian (content, not code)
- **C1 [MUST]:** commercial value model replacing wealth numbers (memo cycle time, RM/analyst capacity, covenant-breach early warning; drop/reframe call deflection). **Model or label illustrative — never invent** (`CAPABILITY-MAPPING §5`).
- **C2 [MUST]:** merged 5-layer architecture slide in their vocabulary + the umbrella slide ("the AI-native bank on Salesforce"; commercial + wealth = two proof points, one spine). Prevents bolt-on framing.
- **C3 [SHOULD]:** governance-honesty slide (platform-enforced today vs roadmap: Trust Layer/Agentforce/AXL). Say "built and running", never "in production".
- **C4:** credential swap — "40 CSA processes mapped" ↔ our executable 10-step underwriting framework (14 skills, 9 personas × 71 use cases). Lead with built-and-executable.

### WS-D — Client-facing intake (STRETCH; wk 8–12, only if A+B land with margin)
Separate Node intake service (integration user, Client Credentials, private Apex REST → shared write
layer) + thin intake widget (borrower entity + doc upload → fires the flow). **Cut-line behavior:** demo
banker-side and DIAGRAM the intake path. The story survives without the build; it doesn't survive a
broken live demo.

### WS-E — Joint-team alignment — owner: Fabian (political track)
- Ownership split: MCP spine + data model + write layer = ours; portal UX + wealth half + voice theater = theirs.
- Org decision: merged demo runs in `bankinggpt` (FSC+nCino co-resident) — their FSC-only org can't host commercial.
- Voice/avatar: excluded from the commercial spine (THEATER, off-thesis, L effort); rides in the wealth half if they want it.
- Claims discipline agreed jointly (their Agentforce/Trust-Layer marketing vs as-built divergence is theirs to reconcile; the merged deck states real-vs-roadmap).
- Fold in the PPT when Fabian gets access; re-check this plan against it.

## 4. Timeline (≈10–14 wks to Sept/Oct)

| Weeks | WS-A | WS-B | WS-C |
|---|---|---|---|
| 1 | **WS-E alignment (pre-condition)**, then A0 decisions+schema (read-only checks may run before WS-E) | B3 rehearsal (state check) | C2 umbrella+5-layer draft |
| 2–3 | A1 write layer | — | C1 value model |
| 3–4 | A2 MCP wrappers | B2 brief packaging | C3/C4 |
| 5–6 | A3 seed+flow | B1 triage queue | deck integration |
| 6–8 | — | B4 status widget, B5 cross-host proof | rehearsal script |
| 8–12 | WS-D stretch | polish + full rehearsals | freeze |

**Minimum credible demo (cut line):** A0–A3 + B1–B3 + C1–C2. Everything else is upside.

## 5. Demo narrative (commercial-first, the arc on stage)

1. **Open:** RM's morning triage queue (B1) — covenant cushions thinning, KYC refresh due, maturity wall. "The advisor's day, rebuilt" — for commercial.
2. **Relationship brief** (B2): one-breath Piedmont verdict; drill to ownership graph (the real KYC signal), Boom spread, covenant grades.
3. **Onboarding beat** (WS-A): new prospect walks in — agent creates the Onboarding Case, records the KYC screen, attaches evidence, advances stage; **banker attests clearance** (the human gate, visibly). Client-side intake shown live (WS-D) or as diagram.
4. **Credit memo** (existing): draft → attest → write back to nCino → audit ledger. The deterministic wall: ratios computed, never narrated.
5. **Close:** cross-host proof (B5) + umbrella slide — one spine, any surface, wealth as the second vertical (their half).

## 6. Top risks (merged, ranked)

1. Client-facing identity is a separate build — scope it as WS-D or diagram it; never imply the hosted MCP serves prospects.
2. Demo data doesn't exist (Onboarding=0, KYC=0 rows) — seed script is an explicit deliverable (A3).
3. KYC object model decision blocks Tool 3 — decide in A0, in the Clawdy consult.
4. Two-team design-by-committee — WS-E ownership split early; commercial-first is already agreed with Fabian's lead.
5. Claims integrity ("in production", invented numbers, faked KYC clearance) — C1/C3 discipline; KYC shown as honest-absence where data is absent, seeded where the story needs it.
6. Part-time capacity — the cut line exists for a reason; protect A0–A3/B1–B3 before anything shiny.

## 7. Immediate next actions

1. ~~Clawdy consult~~ **DONE 2026-07-12: CONDITIONAL GO.** All five architecture calls confirmed (tool set/cut, human-gate classification, KYC__c dual-write, audit two-ledger design, two front doors). Amendments in §8.
2. Fabian: WS-E conversation with the other team — **now a PRE-CONDITION, not a parallel track** (Clawdy): confirm the PPT/their committed narrative doesn't conflict with commercial-first BEFORE A0 build hours are spent. A0 *schema verification* (read-only checks) may proceed; A0 *schema creation* waits for WS-E.
3. Fold the PPT in when access lands; re-check this plan against it.

## 8. Clawdy amendments (2026-07-12 consult — binding for the build)

1. **[A0] Task polymorphic target check:** verify `Task.WhatId` accepts `LLC_BI__Onboarding__c` before wiring LogInteraction; not all custom objects are Task-targetable.
2. **[A1] Human gate enforced in Apex, not prompt:** `Customer360AdvanceOnboardingStage` MUST reject `newStage = Complete` at the method boundary with a structured error. The gate lives in code.
3. **[A0/A1] `Cleared_By__c` is non-writable by the tool:** the KYC clearance attestation field is excluded from the `RecordKycResult` DML payload BY DESIGN (not a parameter), so no agent call can ever set it. Human attestation writes it through a separate human-gated path.
4. **[A0] Shared correlation ID across ledgers:** Onboarding Case Id (minimum) embedded in BOTH `Audit_Event__c` and the Snowflake decision ledger so what-happened and why-decided join for an auditor. Two-ledger design confirmed as complementary (mutation ledger vs decision ledger), atomic Apex audit judged superior to a Snowflake callout.
5. **[WS-D day one] External actor stamping on the intake path:** integration-user writes must stamp the prospect's external identity (email/externalRef/submissionId) into `Audit_Event__c.External_Actor__c` — never let the trail read "system created this" with no provenance.
6. **[Sequencing] WS-E before A0 build** (see §7.2).
7. **[B5] ChatGPT 5K tool-schema cap:** adding 5 write tools grows the McpServerDefinition payload; validate schema size against the ChatGPT cap BEFORE the cross-host rehearsal, not on stage.
8. **[A3] Seed data re-rated S→M and made an explicit deliverable:** credible named prospects, realistic KYC hits, believable ratios — Dreamforce-audience quality, not fixture rows.

## 9. Codex cross-vendor review (2026-07-12, gpt-5.6-sol, round 1: BLOCK w/ 43 findings — triaged, confirmed items below are BINDING build constraints)

### Confirmed HIGH — new holes Clawdy missed
1. **[A1] The Complete gate must cover `LLC_BI__Status__c` too.** Tool 5 updates Stage "and/or" Status; rejecting only `newStage=Complete` still lets `Status__c=Complete` slip the human gate. Gate BOTH fields in the shared service layer.
2. **[A1] Gate lives in the SHARED service layer, not the MCP wrapper.** The intake path's Apex-REST front door calls the same services; a wrapper-level check is bypassable by design. All governance checks (Complete gate, Cleared_By__c protection) sit in the service classes.
3. **[A1] Rejected-write audit paradox.** An `Audit_Event__c` row written in the same transaction rolls back when the write is rejected — prohibited attempts vanish from the trail. Fix: publish rejection events as **Platform Events** (`EventBus.publish` survives rollback) or log rejections via an immediate separate path; successful writes keep the atomic same-transaction row.
4. **[A0/A1] `Cleared_By__c` payload-omission is necessary but NOT sufficient.** Any FLS-permitted user/API surface can still set it. Add: FLS restriction (field not writable by the write permission set) + a validation rule/trigger that only a human-gated path (and `UserInfo.getUserId()` self-stamping, never a caller-chosen user) can satisfy.
5. **[A1] `Audit_Event__c` needs a deliberate privilege model.** If callers hold Create on it they can fabricate audit rows; if they don't, USER_MODE audit DML fails. Fix: audit DML runs system-mode inside the service layer; no direct user CRUD on the object; block Update/Delete (append-only) via perms + trigger.
6. **[A3] The human attestation path has no scoped deliverable.** "Banker attests clearance → Complete" is a demo beat with no mechanism. Scope it explicitly (see adjudication point b).

### Confirmed engineering spec constraints (fold into A1/A2 build spec)
- Bulkify every `@InvocableMethod` honestly (no per-request SOQL in loops; the read classes' 2-queries-per-request pattern must not be copied into writes) even though demo calls are single-request.
- Per-request error contract: one bad request returns a structured per-item error, never throws the whole batch into rollback.
- Explicit unit-of-work per tool: define which multi-object failures roll back together (savepoints); no orphaned Accounts/unlinked ContentDocuments.
- CreateProspect: add a **unique external-id custom field** (platform-enforced) instead of relying on query-then-insert (race-safe); never dedup on Account.Name alone; handle active duplicate-rules (`DuplicateRuleHeader`) explicitly.
- RecordKycResult: idempotency = append-only dated rows keyed by (party, screeningType, providerRef); pick ONE behavior, spec it. Results seeded/simulated for the demo must be labeled `Screening_Provider__c='Simulated (demo)'` — never present as a real provider return.
- AttachDocument: store `Doc_Hash__c` on the record (a hash you can't query is not an idempotency key); note sync-Apex heap ceiling for base64 payloads (small demo docs fine; document the limit).
- Stage advance: compare-and-set (reject stale `oldStage`) to prevent stale-agent overwrites.
- Tool return payloads (names, doc titles, descriptions) are untrusted data entering a model that now holds write tools — fence/label free-text fields in tool responses per fleet doctrine.
- Write permission set must explicitly include ContentVersion/ContentDocumentLink/Task perms ("standard objects" still need FLS/CRUD under USER_MODE).
- [A0 verification] Confirm per-tool authorization granularity on ONE McpServerDefinition (Apex class access per tool via permission set) — if reads+writes can't be gated independently, split into a second `Customer360Write` server definition.
- [A2, moved earlier from B5] Budget the 13-tool schema against the ChatGPT 5K cap at DESIGN time, not rehearsal.
- [B3/A3] Demo reset script + frozen-data fallback (recorded run) as explicit deliverables; rehearsals must not accumulate state drift.
- [WS-D] Intake endpoint ships with basic abuse controls even as a demo (shared-secret/captcha + rate limit + upload validation) — an unauthenticated form writing to Salesforce under an integration user is not acceptable even in sandbox.

### Triaged as FALSE-POSITIVE / already-settled (recorded for the evidence base)
- "Raw stage PATCH bypasses nCino governed flow" — acknowledged trade-off, documented per-stage (WRITE-FEASIBILITY §1 Tool 5); not relitigated.
- "Apex-tool mechanism exclusivity contradiction" — wording nit; `sobject-mutations`/`invokeflows` exist as alternatives, we chose custom Apex tools deliberately (control, idempotency, audit).
- "Two-ledger join impossible for hosted writes" — misread but exposes ambiguous wording: the join is mutation-ledger (`Audit_Event__c`) ↔ decision-ledger (Snowflake `record_decision`, written by the agent via experience-mcp), both keyed by Onboarding Case Id. Wording clarified here; design stands.
- "Seeded KYC hits contradict honest-absence" — no contradiction: honest-absence governs REAL unseeded accounts; the demo runs on labeled, seeded sandbox data. Discipline restated: never fabricate clearance on real data; always label simulated screening.

### Round 2 additions (all adopted as binding constraints)
- **[A0/A1] Belt-and-braces object-level gate:** a validation rule/trigger ON `LLC_BI__Onboarding__c` itself blocks Stage OR Status = `Complete` unless the related KYC record carries a human attestation (`Cleared_By__c` populated) — closes every other write surface (other APIs, automations, direct edits) AND enforces the clearance-before-completion invariant in one control. The service-layer gate remains; this is the backstop.
- **[A1] Platform-Event rejection audit spec'd fully:** Publish-Immediately semantics, `SaveResult` checked, durable subscriber (trigger writes the rejection into `Audit_Event__c` async), shared invocation/request ID + deterministic timestamp so rejection events and atomic success rows sequence correctly.
- **[A1] System-mode elevation scoped:** ONLY audit insertion + rejection-event publication run elevated; all business-object SOQL/DML stays USER_MODE. The service layer must not become a privilege-escalation seam.
- **[A1] Bulk-safe partial success:** `Database.insert(..., allOrNone=false)` per-item results, NOT per-request savepoints (savepoint-per-item blows governor limits on modest batches). Savepoints only around a single request's multi-object unit-of-work.
- **[A0] KYC idempotency platform-enforced:** unique composite external-ID field (hash of party|screeningType|providerRef) so concurrent retries cannot append duplicates.
- **[A2/B4] Simulated-data label propagates:** every tool response, widget render, and audit payload carries the `Simulated (demo)` marker — not just the source record.
- **[WS-D] `External_Actor__c` → semantics of CLAIMED identity:** intake auth proves the intake app, not the submitter; store as claimed-identity fields, label accordingly, unless independently verified.
- **[A2] Untrusted-data fence applies SERVER-WIDE:** all 13 tools' free-text return fields (account names, doc titles, task text) are fenced/labeled — the read tools' returns are model input for an agent that now holds write tools.
- **[A0] Attestation mechanism = blocking A0 decision** with acceptance criteria, not an open option into A3.
- **[ARCHITECTURE — adopted] Two server definitions by DEFAULT:** `Customer360` (8 reads) + `Customer360Write` (5 writes) as separate McpServerDefinitions — smaller blast radius, cleaner permissioning, per-host schema budgeting, read-only clients unaffected by write deploys. Collapse to one only if A0 proves per-tool gating + schema budget + no tool-selection confusion. (Note: the ChatGPT 5K cap is an AGGREGATE connected-tools budget per host, not per-server — measure accordingly.)

### Adjudication points for Fabian (Codex vs plan, human tie-break)
- **(a) UpsertParty in v1 or trim the narrative.** Demo beat 3 promises ownership resolution while UpsertParty is phase-2. Either promote UpsertParty to v1 (+M effort, requires role-catalog seeding) or pre-seed the ownership edges and have the agent read/confirm rather than write them.
- **(b) Attestation mechanism.** Cheapest credible: banker flips clearance in the standard Salesforce UI on the seeded record (zero build, visibly human) vs a small human-gated Flow/quick-action (nicer beat, +S/M effort).
- **(c) Intake scope.** Codex's abuse-control findings raise WS-D's floor; keep it stretch-with-controls, or cut to diagram-only.
