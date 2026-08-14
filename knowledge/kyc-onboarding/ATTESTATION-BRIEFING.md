# ATTESTATION-BRIEFING — How a Human Registers Judgment

**Date:** 2026-07-28 · **Status:** Decision briefing. **No recommendation is given.** Adjudication (b) is explicitly reserved to Fabian.
**Question on the table:** by what mechanism does a named human accept responsibility for KYC clearance, such that the onboarding case may reach `Complete`?
**Companion:** `BUILD-SPEC-V1.md` (the binding build spec; §1.3.6 defines the service-layer interface every option must satisfy, §2.7 the mechanism-independent backstop).

---

## 1. Why this is a decision and not an implementation detail

Everything else in the onboarding build is a write with an audit row. This one is different in kind: it is the moment the system stops recording facts and a person accepts liability for a conclusion. Codex round-1 flagged it as the single unscoped deliverable in the plan (*"The human attestation path has no scoped deliverable. 'Banker attests clearance → Complete' is a demo beat with no mechanism"*), and Codex round-2 escalated it to *"blocking A0 decision with acceptance criteria, not an open option into A3."*

It is also the beat the merged Dreamforce demo turns on. Section 2 explains why: the other team has nothing here, and it is their open flank.

---

## 2. How Aethon's as-built architecture hands judgment to humans

All claims cite the extraction file they came from, in `kyc-onboarding/incoming/`. Where the files do not say, this section says NOT STATED rather than inferring.

### 2.1 The corpus is three different artefacts, and conflating them is the first error

| Artefact | Files | What it claims about itself |
|---|---|---|
| **A. As-built demo topology** | `extracted-aethon-asbuilt.txt` (= `aethon-wealth-advisor-reference-architecture.html`) | *"AETHON WEALTH ADVISOR DEMO — REFERENCE ARCHITECTURE / As-built system topology"* |
| **B. Target-state layered architecture** | `extracted-layered-target.txt` (= `reference-architecture-layered.html`); **variant:** `wealth-demo-reference-architecture.png` | *"SALESFORCE-CENTRIC REFERENCE ARCHITECTURE"*. **No build status claimed anywhere on it.** |
| **C. Public pitch microsite** | `extracted-site-{home,value,architecture,accelerator}.txt` + `website-capture/dom-*.html` | Marketing. Footer: *"Accenture × Salesforce × Anthropic · Strategic asset · 2026"* |

A and C are different codebases: A is *"React / Next.js"*, *"App Router"*, on *"Vercel / Lightsail"*; C is a Vite/React SPA whose DOM captures load a single `/assets/index-*.js` module with no Next.js markers (consistent with `WEBSITE-ANALYSIS.md`).

**Provenance, stated once so it is not blurred later: Aethon uses zero nCino objects.** `grep -ric "ncino|LLC_BI|Onboarding__c"` across all eleven files returns **zero hits**. Their data model is FSC-only — *"Person Accounts / Households / Financial Accounts / Holdings / Insurance Policies / Assets & Liabilities / Financial Goals"* (`extracted-aethon-asbuilt.txt` 59–67, `IN USE`) — reached through generic *"`sobject-reads` / `sobject-mutations` / `custom / invokeflows`"* (53–57). There is no onboarding container in their architecture at all. Our `LLC_BI__Onboarding__c` anchoring is a commercial-first design decision of ours, not a convergence with theirs (`BUILD-SPEC-V1.md` §0.4). This matters here because it means **the attestation mechanism we choose has no counterpart on their side to be compatible with** — we are not matching an existing pattern, we are setting one.

**B exists in two non-identical versions and the differences are the most useful forensic fact in the corpus.** The older PNG names things the current HTML export has dropped:

| Tile | PNG | Current `extracted-layered-target.txt` |
|---|---|---|
| Domain Agents | *"discovery · doc eval · **KYC**"* | *"discovery · doc eval · **rollover**"* |
| Deterministic Workflows | *"**account opening journey** · approvals · flows"* | *"flows · approvals · **apex**"* |
| Middle column, 3rd tile | *"**Agentforce Experience Layer (AXL)** — MCP Apps (HTML) · Block Kit (Slack) · Adaptive Cards"* | absent; replaced by *"Agentforce — topics · actions · Atlas"* |

**AXL, KYC-as-a-domain-agent, and account-opening-as-a-workflow appear only in the older PNG and were removed from the current diagram.** AXL is the one place in their entire corpus that gestures at a rendered interactive card — the natural home for an approve/reject control — and it is the thing they deleted.

### 2.2 As-built topology, with their own build badges

From `extracted-aethon-asbuilt.txt`:

- **Browser:** *"React 19 Advisor Portal"*, *"App Router"*, *"Voice Tab"*, *"livekit-client SDK"*.
- **Real-time:** LiveKit Cloud, *"WebRTC Room"*, *"Python voice agent"*, *"livekit-agents 1.5"*, *"ElevenLabs TTS · Simli Avatar"*.
- **Application tier (Next.js):** `/api/chat`, `actions.ts`, `salesforce-mcp-client.ts`, `/api/voice-session`, `/api/voice-actions`, `/api/analysis/book`, `/api/documents/evaluate`.
- **AI:** *"Claude Opus 4.6 — Chat + cross-domain analysis"*, *"Claude Sonnet 4.6 — Doc evaluation + voice"*, on AWS Bedrock.
- **Salesforce FSC:** *"System of Record · Backbone"*, *"Hosted MCP servers expose a governed slice of the org."*

Their own badges:

| Block | Badge |
|---|---|
| Hosted MCP Servers (`sobject-reads`, `sobject-mutations`, `custom / invokeflows`) | **IN USE** |
| FSC Data Model | **IN USE** |
| Automation & Logic (Flows, **Approval Processes**, Apex Services, Platform Events) | **IN USE** |
| **Agentforce & Intelligence** (Agentforce Agents, Atlas, **Einstein Trust Layer**, Data Cloud 360) | **Available** |
| Trust & Compliance (Sharing & FLS, Shield, Audit Trail, Compliant Data Sharing) | **IN USE** |

### 2.3 Human-in-the-loop inventory — the complete set is seven

An exhaustive keyword sweep across all eleven evidence files (`attest`, `sign-off`, `e-sign`, `consent`, `human-in-the-loop`, `four-eyes`, `maker-checker`, `dual control`, `approval`, `approve`, `escalate`, `exception`, `supervis`, `oversight`, `authoriz`, `confirm`, `submit`, `judgment`) returns seven hits. That is the entire attestation surface of their evidence base.

| # | What it is | Where | Classification |
|---|---|---|---|
| **1** | *"Approval Processes"* — a bare chip under `Automation & Logic`, badged `IN USE`, beside "Flows", "Apex Services", "Platform Events" | `extracted-aethon-asbuilt.txt` | **BUILT, but only as a platform feature declared on.** No object, no approver, no step, no agent behaviour when one is pending. No corresponding API route or UI surface anywhere else in the topology. |
| **2** | *"Human-in-the-Loop / approvals · exceptions"* — a tile inside **"Agentforce Operations — Regrello"**, badged `IN-PLATFORM ORCHESTRATION` | `extracted-layered-target.txt` (and PNG) | **CAPABILITY CLAIM about a third-party product, on a target diagram.** Their only explicit HITL concept, and it lives in a vendor box. **Regrello appears zero times in the as-built topology.** `WEBSITE-ANALYSIS.md` already flagged this as unresolved: *"Is Regrello … real in any build, or pure target-state?"* |
| **3** | *"Deterministic Workflows — flows · approvals · apex"* (PNG: *"account opening journey · approvals · flows"*) | `extracted-layered-target.txt` | **CAPABILITY CLAIM.** "approvals" as a one-word chip on a target-state tile. |
| **4** | *"e-Sign / Docs"* — one of six chips under *"Back-Office & Third-Party Systems — Off-platform systems of execution — reached via Regrello"* | `extracted-layered-target.txt` | **CAPABILITY CLAIM, explicitly outside the platform.** The closest thing to a client attestation instrument in their architecture, and they place it outside Salesforce, outside the trust boundary, behind Regrello, with no vendor named. No e-sign anywhere in the as-built. |
| **5** | *"Captures intent, reasons, summarizes & evaluates — then delegates. **Never defines workflow logic.**"* + *"⟶ intent crosses into deterministic, audited execution inside Salesforce ⟵"* | `extracted-layered-target.txt` | **DESIGN PRINCIPLE, not a mechanism.** Their strongest governance sentence, and it is a negative claim — it says where authority is *not*. |
| **6** | *"Agency — Reasoning and governed action, never ungoverned"*; layer content *"Claude models + Agentforce governance"* | `extracted-site-architecture.txt` | **MARKETING.** Adjective, no mechanism. Directly contradicted by §2.4. |
| **7** | *"Every onboarding is a backlog of documents, **approvals**, and re-keying — work that's slow, fragmented, and pulls your advisors away from the clients they're trying to keep."* | `extracted-site-home.txt` | **MARKETING — and rhetorically the opposite of an attestation story.** On the public site, human approval is friction to be eliminated. |

Their only use of the word *judgment* is `extracted-site-home.txt`: *"Same-day onboarding. Process work handled invisibly. **The judgment your clients pay for** — back where it belongs, with them."* That is *advisory* judgment returned to the client relationship, not a control-point judgment inside a workflow.

### 2.4 What is NOT STATED, exhaustively

Across all eleven files, none of the following appears in any form: *attest* / *attestation*; *sign-off*; *four-eyes*, *maker-checker*, *dual control*, *segregation of duties*; *consent*; *authorized signatory*; *materiality threshold*; *confidence threshold*; *escalation policy* (the word "exceptions" appears once, undefined); *reviewer*, *approver*, *supervisor*, *checker* as roles; any named regulatory attestation regime (no SR 11-7, no FINRA 3110/3120, no CIP/CDD certification); any UI affordance for approving; any record or object where an approval is persisted; any statement of what happens when a human **rejects**; any statement of whether an agent action is blocked pending approval or proceeds optimistically.

**There is no described mechanism anywhere by which a human being registers a judgment inside their AI-driven workflow.**

The one piece of non-textual evidence: `website-capture/dom-home.html` contains `<video src="/videos/compliance.mp4" poster="/screens/review-queue.png" ...>`. A filename is evidence they built a screen they call a review queue. It is not evidence of what that screen does. **UNVERIFIED.** The Compliance tab's body copy did not render in our capture (only the active Research tab did) — **NOT STATED**.

### 2.5 Governance: real vs marketing

**Real.** Sharing & FLS, Shield Encryption, Audit Trail, Compliant Data Sharing, all `IN USE`. Hosted MCP as the write path with *"a governed slice of the org"*. Approval Processes, Flows, Apex, Platform Events present in the org. This is a **record-layer** posture: permissions, encryption, a log. It governs *what an identity may write*. It is not an attestation mechanism, and nothing in the corpus claims a human is interposed before a mutation.

**Marketing, contradicted by their own as-built file.** The load-bearing public claim is the Einstein Trust Layer:

> `extracted-site-architecture.txt`: *"Claude applies four guardrails before any action reaches Salesforce. **The Einstein Trust Layer enforces controls at the platform level.** Every layer governed. Nothing left to individual behavior."*
> Repeated as a build-vs-buy differentiator on `/value` and `/architecture`: *"Einstein Trust Layer — pre-built and battle-tested."*
> `extracted-site-home.txt`: *"Financial Services Cloud · Data 360 · Agentforce · **Trust layer built in**"*.

Against their own diagram: `extracted-aethon-asbuilt.txt` badges *"Agentforce & Intelligence"* — containing Agentforce Agents, Atlas, **Einstein Trust Layer**, Data Cloud 360 — as **"Available"**. That is their own word, and it is the **only** block in the as-built topology not badged `IN USE`.

Same defect for Agentforce: the site's entire *Agency* layer is *"Claude models + Agentforce governance"*, while the as-built runs Claude on Bedrock through hosted MCP and Agentforce is "Available", absent from the wired-connections legend. `WEBSITE-ANALYSIS.md` already caught this and put it plainly: *"If a technical audience pulls that thread at Dreamforce it snaps."*

**Overclaim on maturity.** `extracted-site-accelerator.txt`: *"The reference architecture **is in production**"*, *"This isn't a proposal. **It's already built.**"*, *"with a full audit trail in Salesforce for every agent action."* The artefact describing what is actually built calls itself a **DEMO** in its own title and labels its legend *"Actively wired in the demo."*

**The summary that matters for this decision.** Their governance story is **log-and-permission, not attest-and-approve**. They can prove an action happened and that the actor was entitled to take it. They have published nothing showing a named human accepted responsibility for it at a specific moment. The one architectural element that would carry that — "Human-in-the-Loop: approvals · exceptions" — is two words, attributed to a third-party product, on the diagram that makes no build claim, and absent from the diagram that does. Meanwhile the public site markets human approvals as friction.

### 2.6 Their portal, and why it does not help them here

The as-built portal's complete server surface is: `/api/chat`, `actions.ts`, `salesforce-mcp-client.ts`, `/api/voice-session`, `/api/voice-actions`, `/api/analysis/book`, `/api/documents/evaluate`.

**There is no approve, confirm, submit, sign, or attest endpoint in that list.** The nearest is `/api/documents/evaluate`, which pairs with *"Claude Sonnet 4.6 — Doc evaluation"* — the model *assessing* a document, not a human *accepting* one. The write path is `salesforce-mcp-client.ts` → hosted MCP `sobject-mutations`; whether any human step gates that call is **NOT STATED**.

Two independent routes into Salesforce mutations exist: typed chat and **voice** (`/api/voice-actions`, distinct from `/api/voice-session`, over LiveKit WebRTC with ElevenLabs TTS and a Simli avatar). Nothing in the corpus describes a confirmation step on the voice path. **Voice is the hardest surface on which to evidence an attestation** — no signature, no rendered artefact, no persisted click. Whether voice actions can mutate at all is **NOT STATED**; the existence of a separate `/api/voice-actions` route implies it.

It is also an **Advisor** portal. Nothing in the corpus is customer-facing (`WEBSITE-ANALYSIS.md`: *"Nothing in this site or their as-built is customer-facing"*). The microsite is not a portal either: `#demo` and `#contact` are dead anchors on every route, no form, no input element, no mailto. Nobody submits anything anywhere in this corpus.

### 2.7 Their numbers, for the credential swap

From `extracted-site-value.txt`: headline *"$84 trillion is changing hands… The three-year profit opportunity for a firm that acts is **$606M**"*, *"Each lever is modelled independently and measured against a real book."* Four levers: Onboarding compression (**20d → <24h**, NIGO **25%+ → <5%**, at **500 new HNW accounts/yr**); Advisor productivity (**30%** of workday returned, **+25%** productivity); Compliance (**$10M–$100M+** fine exposure); Contact-centre deflection (**$16**/call, **20–30%** volume reduction). Credentials: *"**40 core CSA processes mapped**"*, *"Reference architecture in production"*, NeuraFlash + Accenture SFBG named.

Two things worth pocketing. First, the home page calls $606M *"**Illustrative** three-year profit uplift"* while `/value` states it flat and claims it was *"measured against a real book"* — their own hedge is on the record. Second, *"$10M–$100M+ fine exposure"* is a sector statistic (*"typical regulatory fine exposure for large firms"*) rendered on the accelerator page as an achieved outcome (*"$10M–$100M+ fine exposure reduced"*) with no quantum of reduction stated. No source, benchmark, or citation is given for any figure in the corpus.

---

## 3. How our fence works today, and what the org already gives us

### 3.1 The C360 human-confirm fence, as built

From `sf-build-v2/wp2/classes/`, deployed and 142-test-green in `bankinggpt`:

- **`stage_*` does zero domain DML.** It computes a plan (`C360Plan`: typed steps, each declaring the object, field set, the automation it expects to wake, and the query that will prove it landed), hashes it (`planHash`), writes a `cm_Action_Staging__c` row, and returns a **single-use `decisionToken`**. No record id is returned at stage time.
- **`execute_*` claims the token.** `C360ActionStaging.claimForExecute(stagingId, planHash, decisionToken, approverUserId)`. The token is single-use and hash-stored; it is bound to the staging row, the plan hash, and a user. The ApexDoc on `approverUserId` reads: *"The named human bound to the token. **Must be the running identity.**"*
- **The allowlist is the wall.** `C360WriteGuard.assertAllowed(object, operation, values)` refuses any object it does not know, any delete unconditionally, any forbidden field, and any value outside the permitted transition set. Its class doc: *"Every write in this package passes through assertAllowed(), including the ones that are refused, so a refusal is provable by calling the same entry point the tool calls rather than by the absence of a code path."*
- **Idempotency both sides.** `idempotencyKey` on stage and execute; `findCompleted()` returns a prior successful run rather than repeating it.

**What this fence actually attests.** It proves that *a specific human, running as themselves, confirmed a specific plan whose contents were hashed before they saw it, once.* That is genuinely strong — stronger than anything in §2 — and it is live-proven: the org holds `CV-0000000002`, described in the handoff as *"first banker-originated write ever"*.

**What it does not do.** It attests **the act**, not **the conclusion**. It records "this person authorised this write". It does not record "this person accepts that this client is who they claim to be, on this basis". For a credit action that distinction is academic. For KYC clearance it is the whole thing — the regulator's question is not "who pressed the button" but "who formed the judgment, and on what".

That gap is exactly what this decision has to close.

### 3.2 The Complete gate, as specified

`BUILD-SPEC-V1.md` §1.3.4 and §2.7: `C360WriteGuard`'s update-transition map for `LLC_BI__Onboarding__c` omits `Complete` from the permitted values of **both** `LLC_BI__Stage__c` and `LLC_BI__Status__c`, so every caller of the shared service layer is refused. A backstop trigger on the object itself refuses `Complete` unless an attested `KYC__c` exists. And `KYC__c.KYC_Status__c = 'Verified'` is refused by the same map, so clearance and completion are two locks, not one.

**All of that holds whichever option below is chosen.** The options differ only in *how the human's acceptance is captured and evidenced* — not in whether the gate exists.

### 3.3 What the org already ships — this changes the option space

Three findings from the live describes in `BUILD-SPEC-V1.md` §0.2 and §2.8 materially affect this decision, and none of them were known when the plan framed the choice as "flip a field in the UI vs build a Flow".

**(a) `KYC__c` already has an attestation vocabulary.** `KYC__c.Stage__c` is a restricted picklist whose nine values include **`Confirmation/Attestation`**, and the object carries a **`ClientAttestation__c`** checkbox. This is a *client* attestation — the customer confirming their own declarations — built by the pre-existing Accenture "Bloom" KYC application, whose `Created_from_Mobile__c` flag implies a client-facing intake origin.

**This is a distinction the briefing must not blur: client attestation ≠ banker clearance.** The customer attesting "this is true of me" and the bank's officer attesting "we accept this client" are different acts by different parties with different liability. The org models the first and not the second. Any option chosen below must be visibly the second, and should probably *require* the first as a precondition — which is a small, cheap credibility win available to every option.

**(b) FSC ships a native verification pair.** `FinServ__IdentificationDocument__c` carries **`FinServ__VerifiedBy__c`** (Lookup → User) and **`FinServ__VerifiedOn__c`** (DateTime). The platform's own vocabulary for "a named human verified this, at this time" already exists at *document* grain. It does not exist at *case* grain, which is why `BUILD-SPEC-V1.md` §2.3 D-3 creates `Cleared_By__c` / `Cleared_On__c` / `Clearance_Basis__c` on a **new `KYC_Clearance__c` object of ours** — founder-adjudicated 2026-07-28: **zero schema changes to `KYC__c`**, the join runs through our `KYC_Record__c` lookup on the onboarding container, and Account is the correlation anchor. But it means whichever option wins is extending an existing platform pattern rather than inventing one.

**(c) There is a real governed onboarding UI in the org.** Ten managed LWC bundles in the `nCino` namespace (`customerOnboarding`, `onboardingQuestionnaire`, `onboardingCaseSidePanel`, `onboardingEntityStructure`, `onboardingJourneySelector`, `onboardingRelationshipSelector`, `onboardingServices`, `onboardingAddEntityModal`, `customerOnboardingCancelModal`, `onboardingCaseSidePanelCard`) plus **30 `<actionOverrides>`** on `LLC_BI__Onboarding__c`. `LLC_BI__Onboarding__c` and `KYC__c` both expose `ApprovalSubmission`, `ApprovalWorkItem`, and `ProcessInstance` child relationships, so Salesforce Approval Processes are targetable on both. **And the org has zero validation rules and zero Apex triggers on `LLC_BI__Onboarding__c`** — a clean slate for whatever we add.

---

## 4. Four options

Each is assessed on build cost, demo credibility, governance strength, and how it renders in **both** surfaces: the Salesforce UI and our cockpit artifact. All four satisfy the §1.3.6 interface (sole writer of `Verified`/`Cleared_By__c`, self-stamped from `UserInfo.getUserId()`, unreachable from the integration user, emits an audit event).

---

### Option 1 — Standard Salesforce UI field edit on the seeded record

The banker opens the onboarding case (or a `KYC_Clearance__c` record) in Salesforce and sets a clearance checkbox, which a `before update` trigger self-stamps into `Cleared_By__c` / `Cleared_On__c` on `KYC_Clearance__c`.

**Note the D-10 constraint:** the banker cannot attest by editing `KYC__c` itself, because we make no schema change there and never write it. Option 1 therefore edits *our* record, not the Bloom record — which slightly weakens its "it's just the standard UI" appeal, since the record page is one we would have to lay out.

| | |
|---|---|
| **Build cost** | **XS.** One small trigger, one permission set (`C360_Onboarding_Attest`), FLS configuration. The fields are being created anyway. |
| **Demo credibility** | **Low-to-medium.** It is visibly a human in a real system, which is the point Codex was making when it called this "cheapest credible". But on stage it is a person editing a picklist on a record page — it reads as data entry, not as a decision. It also breaks the demo's surface: you leave the cockpit, go to Salesforce, come back. |
| **Governance strength** | **Medium-high, and better than it looks.** The trigger self-stamps, so the actor cannot be spoofed. Native `KYC__History` field-history tracking is already enabled on the object, so the change is independently logged by the platform, outside our code. But there is **no captured basis** — no record of *what* the banker relied on — and no structural distinction between a considered judgment and a mis-click. |
| **Salesforce UI** | Native. Nothing to build. |
| **Cockpit** | `AttestationTab` renders the current state read-only plus a deep link out to the record. The cockpit becomes a spectator at the decisive moment. |
| **Chat parity** | Poor. A chat-only banker cannot attest at all; they can only be told to go elsewhere. This conflicts with the founder's chat-parity addendum, though arguably "you must leave chat to attest" is itself a defensible control. |

---

### Option 2 — Human-gated Screen Flow / quick action on the Onboarding record

A Screen Flow launched from a quick action on `LLC_BI__Onboarding__c` presents the screening evidence, requires an explicit basis statement and a confirmation checkbox, then calls the attestation Apex.

| | |
|---|---|
| **Build cost** | **S/M.** One Screen Flow, one quick action, the invocable attestation method (needed anyway), plus flow test coverage. Codex's "+S/M effort" estimate stands. |
| **Demo credibility** | **High.** A purpose-built moment that *looks* like a control: the evidence is on screen, the human types why, then confirms. It reads as a decision because it is shaped like one. |
| **Governance strength** | **High.** Captures the **basis**, which Option 1 cannot. The flow can enforce preconditions declaratively — all screening rows terminal, no open `Hit`, `ClientAttestation__c` true — before the confirm is enabled. Apex still self-stamps the actor, so the flow is a UI over a fenced service, not the fence itself. |
| **Salesforce UI** | Excellent — this is its native home, and the org already has 30 action overrides on the object so a quick action is idiomatic here. |
| **Cockpit** | Weak by itself. The flow cannot be embedded in the artifact. Same context-switch problem as Option 1, dressed better. |
| **Chat parity** | Poor, same as Option 1. |
| **Risk** | The flow is a *second* implementation of the precondition logic that already lives in Apex. Two copies of a control drift. Mitigate by having the flow call an Apex `canAttest()` check rather than re-implementing conditions declaratively — otherwise this option quietly violates Codex round-1 #2 ("gate lives in the shared service layer"). |

---

### Option 3 — Native Salesforce Approval Process on the Onboarding Case

Submit the case for approval; a named approver (or queue) approves or rejects; final approval fires the attestation.

| | |
|---|---|
| **Build cost** | **M.** Approval process definition, entry criteria, approver assignment, final-approval action calling the Apex, plus a submit affordance. |
| **Demo credibility** | **Medium-high**, with a caveat. It is unmistakably a bank control and it uses the exact platform feature Aethon's diagram name-drops as "IN USE" without ever showing — so it directly answers their strongest unevidenced claim. **Verified targetable:** both `LLC_BI__Onboarding__c` and `KYC__c` expose `ApprovalSubmission`, `ApprovalWorkItem`, and `ProcessInstance` child relationships. The caveat is pacing: an approval process introduces a wait, an inbox, and a second actor, which is hard to stage in a live demo without either two people or an obviously fake single-person loop. |
| **Governance strength** | **Highest.** Segregation of duties becomes structural — submitter and approver are enforced as different users by the platform, not by our code. `ProcessInstanceHistory` is an independent, platform-owned audit trail we do not write and cannot forge. This is the only option that gives four-eyes for free. |
| **Salesforce UI** | Native and excellent. |
| **Cockpit** | Medium. The artifact can *submit* for approval (a tool call), show pending state, and show the outcome. It cannot host the approval itself. That is arguably correct — the approval genuinely happens elsewhere, by someone else. |
| **Chat parity** | **Good, and better than Options 1–2.** Chat can submit; chat can query state; chat cannot approve. That is an honest, explicable split. |
| **Risk — the serious one** | **Approval processes send email to real humans.** LESSONS-NCINO-APEX documents exactly this class of accident in this org: the covenant approval flow fires *"an unrecallable approval email at a real human, robert.mcclaren@outlook.com"*, which is why `execute_covenant_review` is deployed but deliberately excluded from the artifact manifest. Any approval process here must route to a controlled test user or a queue containing only us, verified before first use. Treat as a hard pre-flight. |

---

### Option 4 — In-cockpit attested confirmation, reusing the A33 decision-token fence

The `AttestationTab` renders the full evidence set. The banker types a basis statement and confirms. This calls `stage_attest_kyc_clearance` → the plan states exactly what will be written and what it means → `execute_attest_kyc_clearance` with the single-use token, `approverUserId` = the running identity, and the basis text as a required non-empty input.

| | |
|---|---|
| **Build cost** | **M.** Two invocable classes on the existing engine (the engine is the reason this is M and not L), plus the tab UI. Reuses `C360Plan`, `C360ActionStaging`, `C360WriteGuard` unchanged. |
| **Demo credibility** | **Highest.** It happens in the surface the demo lives in, at the moment the narrative needs it, with the evidence visible beside the decision. No context switch, no email, no second actor to stage. It is also the only option that visibly uses the same fence as the credit-memo attestation, which makes the "one spine, one governance model" claim self-evidently true rather than asserted. |
| **Governance strength** | **High, with one honest weakness.** Strengths: single-use token, plan hashed before the human sees it, approver must be the running identity (spoofing is refused at the service layer), basis captured, audit atomic. Weakness: **submitter and approver are the same person.** There is no segregation of duties. The banker who ran the screening attests to it. For a demo and for many real first-line KYC processes this is correct — first-line attestation is a real control — but it is not four-eyes, and it should never be described as such. |
| **Salesforce UI** | **Nothing.** A banker working in Salesforce cannot attest. This is the mirror-image weakness of Options 1–2, and it is worse in one respect: it makes our artifact load-bearing for a compliance control. If the artifact is down, clearance cannot happen. |
| **Chat parity** | **Best.** The stage/confirm/execute protocol *is* the conversational pattern (`BUILD-SPEC-V1.md` §7). A chat-only banker gets the plan in prose, says yes, and attests — with the gate holding identically because it is enforced in Apex. Fully satisfies the founder's chat-parity addendum. |

---

### 4.5 Comparison

| | 1. UI field edit | 2. Screen Flow | 3. Approval Process | 4. Cockpit + token |
|---|---|---|---|---|
| Build cost | XS | S/M | M | M |
| Demo credibility | Low-med | High | Med-high | **Highest** |
| Governance strength | Medium-high | High | **Highest** | High |
| Captures basis | ✗ | ✓ | ✓ | ✓ |
| Segregation of duties | ✗ | ✗ | **✓ (platform-enforced)** | ✗ |
| Independent (non-ours) audit | ✓ field history | ✓ field history | **✓ ProcessInstanceHistory** | ✓ field history |
| Works in Salesforce UI | ✓ | ✓ | ✓ | ✗ |
| Works in cockpit | ✗ | ✗ | partial (submit/observe) | ✓ |
| Works in bare chat | ✗ | ✗ | partial (submit/observe) | **✓** |
| Sends email to a human | ✗ | ✗ | **✓ — hard pre-flight risk** | ✗ |
| Reuses the existing fence | ✗ | partial | ✗ | **✓** |
| Answers Aethon's open flank | weakly | yes | **most directly** | yes, differently |

**The axis the table exposes:** Options 1–3 are strong in Salesforce and weak in our surfaces; Option 4 is the reverse. Options 1, 2 and 4 are all single-actor; only Option 3 gives segregation of duties. No single option is strong on every dimension, which is why this is a judgment call and not an optimisation.

**Two combinations worth noting, without recommending either.** Options are not mutually exclusive: the attestation Apex is one entry point, and any number of surfaces can call it. **1 + 4** would give a Salesforce path and a cockpit path over one service, at roughly the cost of 4 plus a trigger. **3 + 4** would give first-line attestation in the cockpit and second-line approval in the platform, which is the shape a real bank actually uses — and also the largest build. Whether the demo needs two-line governance or would be muddied by it is a narrative judgment, not a technical one.

---

## 5. Constraints that apply regardless of the choice

These are not tie-breakers. They bind whichever option is selected, and any option that cannot satisfy them is disqualified.

1. **Codex round-2 belt-and-braces validation.** A rule or trigger **on `LLC_BI__Onboarding__c` itself** blocks `Stage` OR `Status` = `Complete` unless the related KYC record carries a human attestation. It closes every other write surface — other APIs, automations, direct Setup edits — that no service-layer gate can reach. `BUILD-SPEC-V1.md` §2.7 specifies it and recommends the trigger form over the validation-rule form (a VR needs a writable helper field, which is itself another thing to protect). **The org has zero existing validation rules and zero triggers on this object**, so there is nothing to conflict with.
2. **Codex round-1 #4 — payload omission is necessary but not sufficient.** `KYC_Clearance__c.Cleared_By__c` must be (a) absent from every tool's DML payload by design, (b) in `C360WriteGuard.FORBIDDEN_FIELDS`, (c) FLS-denied on `C360_Onboarding_Write` (which holds `KYC_Clearance__c` read-only), and (d) backstopped by (1). All four, not a subset.
3. **Self-stamping only.** `Cleared_By__c = UserInfo.getUserId()`, never a caller-supplied id. This is Codex's *"never a caller-chosen user"* verbatim, and it also eliminates lesson 4b's name-vs-id trap by construction — the session that was lost to `meta.user` being a display name rather than an id cannot recur if there is no id parameter.
4. **Unreachable from the intake integration user.** The `C360_Onboarding_Attest` permission set is never assigned to it. A prospect's own submission can never clear itself, whatever the front door.
5. **Two locks, not one.** Clearance (`KYC_Clearance__c.Cleared_By__c` populated) and completion (the container's terminal stage/status) are separately gated. Clearance and completion are different acts.

5b. **The mechanism must be container-agnostic** (`BUILD-SPEC-V1.md` §2.10, AC-C4). The attestation entry point takes a logical onboarding-case id, never a typed `LLC_BI__Onboarding__c`, and the completion gate refuses *the terminal value from the container's value map*, never the literal `'Complete'`. **This disqualifies a pure validation-rule backstop** (a VR must hardcode the picklist value and cannot call Apex), which is why §2.7 recommends the trigger form. Any option below that would push governance logic into declarative metadata bound to one object fails this test.
6. **Client attestation is a precondition, not a substitute.** If `ClientAttestation__c` is used, it gates the banker's attestation; it never satisfies it. §3.3(a).
7. **Auditability.** The attestation emits `Audit_Event__c` with `Event_Type__c = 'kyc_clearance_attested'`, the correlation id, the self-stamped actor, and the basis text. Refused attestation attempts publish through the platform-event path so they survive rollback (`BUILD-SPEC-V1.md` §2.6).
8. **Claims discipline.** Whatever is built is described as what it is. Options 1, 2 and 4 are **first-line attestation** and must never be called four-eyes, dual control, or segregation of duties. Only Option 3 earns those words. This is the same discipline we are holding Aethon to in §2.5, and it would be worth nothing if we did not hold it ourselves.

---

## 6. Acceptance criteria for the chosen mechanism

Codex round-2 required acceptance criteria, not an open option. Whichever is chosen must demonstrate all of these before the build is called done:

- **AC-A1.** A live captured refusal: an attempt to set `Stage='Complete'` with no attestation present, from the MCP surface, with the verbatim error envelope archived.
- **AC-A2.** The same refusal from the intake Apex REST front door, proving the gate is in the shared layer and not the wrapper.
- **AC-A3.** The same refusal from bare claude.ai chat, in banker-readable language.
- **AC-A4.** A direct Setup/API edit attempt to `Stage='Complete'` refused by the object-level backstop (§5.1), proving surfaces we do not control are covered.
- **AC-A5.** An attempt to write `Cleared_By__c` through the ordinary write tools refused, and the field confirmed FLS-denied on `C360_Onboarding_Write`.
- **AC-A6.** A successful attestation producing: the field values, the self-stamped actor matching the running identity, the captured basis, the `Audit_Event__c` row, and the `KYC__History` platform-owned entry.
- **AC-A7.** A rejected/withdrawn attestation leaving the case demonstrably not-Complete, with the refusal in the audit trail (surviving rollback).
- **AC-A8.** For Option 3 only: proof that no approval email reached any real external human, verified before first live use, per the `robert.mcclaren@outlook.com` precedent.

---

## 7. What is unverified in this briefing

- **Aethon's actual implementation.** Everything in §2 is drawn from four text extractions, two diagram exports, four DOM captures, and one PNG. We have not seen their code, their org, or their portal running. Where the files are silent this briefing says NOT STATED; that is a statement about the evidence, not a claim that the thing does not exist. They may well have built an approval mechanism they simply never documented in these artefacts.
- **`/screens/review-queue.png`** — a poster filename. We did not capture the video or the Compliance tab's body copy.
- **Whether Regrello exists in any build.** Unresolved here and in `WEBSITE-ANALYSIS.md`.
- **Whether their voice path can mutate.** Implied by a distinct `/api/voice-actions` route; not stated.
- **Approval-process email routing in `bankinggpt`.** Not tested. AC-A8 exists because of that.
- **`ACN_FXT_KYC` behaviour on insert.** The trigger body was read and its only side-effecting call is commented out, but runtime behaviour under all field combinations is unverified (probe P-3).
- **Whether `ClientAttestation__c` is wired to anything today.** The field exists; `KYC__c` has 0 rows, so no live usage can be inspected.
