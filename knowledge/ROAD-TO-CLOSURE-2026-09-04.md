# Customer 360 — Road to Closure (target: Sept 4, 2026)

Scoped with Fabian 2026-08-20. Non-negotiables, in his words: **both surfaces spotless, literally NO
ROOM for errors** (career-shaping); full credit-memo-pattern policy layer; full KYC stage/approve
loop; **C360 is the flagship**. Sept 4 = meaningful and demoable; Sept 5-15 = finetuning only.
Booth: SPIN, Sept 15-16.

## The two seats

| Seat | Who | Owns |
|---|---|---|
| **Archy** (org seat) | Fabian's Archy sessions | nCino org writes + verification, cockpit + both surfaces, publish pipeline, KYC cockpit wiring |
| **Banksy** (data seat) | **Jon Taylor** (jon@claudeeshannon.com, gh jon883) + Fabian's Banksy sessions | IDB gateway integration, decision ledger + audit trail, Snowflake decision, policy pack |

Lane rationale (evidence, 2026-08-20): Jon built `cowork-offering/fnma-mcp` (16-API MCP server +
dashboard widgets), co-owned the Snowflake data-domains/ontology task (done Aug 8), and drove the
credit-memo AgentCore-memory/gateway decisions. He is a gateway+data native. Confirm lane with Jon
at kickoff; this doc assumes it.

Seat rules: sf CLI auth to `bankinggpt` stays Archy-only. If Jon needs org access it is a
deliberate, named new auth, never improvised. Cross-seat memory = Banksy brain
(`/opt/brain/knowledge/projects/customer-360/` + ontology + brain-write events). Every material
decision gets a brain-write `decision` event AND lands in this repo's knowledge tree.

## Workstreams and dates

### WS0 — Re-establish truth (Aug 20-22) · Archy · GATE G0
The §4 verification campaign in HANDOVER-2026-08-20 (steps 0-5; step 6 = Fabian's browser).
Evidence table or it didn't happen. Nothing below builds on unverified ground.
**G0 pass = org intact, suite green, reads live, mod + bulk staging observed.**

### WS1 — KYC full stage/approve loop (Aug 22-27) · Archy · GATE G1
The cockpit KYC & Onboarding zone goes from display to workable. The IDB gateway staging tools
already exist as connector tools (get_customer360, stage/approve address + name change, sanctions,
adverse media, service requests, change audit). Work: wire the zone to live calls on BOTH surfaces,
same governed stage→approve pattern as the nCino side, observed envelopes before any pinned shape
(the law). Honest empties where the staging env is thin.
**G1 pass = a KYC change staged and approved live from the cockpit, both surfaces, envelope archived.**

### WS2 — Gateway + policy layer (Aug 21-29) · Jon/Banksy · GATE G2
Bake C360 into the IDB gateway the credit-memo way:
1. **Decision ledger + audit trail** — record_decision / recall_decisions / log_audit_event
   equivalents keyed on the relationship (Hartwell), so a session opens WARM ("last cycle the team
   held grade 4 because…"). Store: Jon decides Snowflake vs the gateway's own store — his call to
   make by Aug 25, criteria: demo-reliable > architecturally pure.
2. **Policy pack** — credit policy + KYC policy documents the agent reasons against when analysing.
   This is the substrate for Fabian's vision: agents that think and analyse based on policies.
   Format: markdown policy docs served through the gateway (or bundled), each with citable section
   ids so analysis can quote chapter and verse.
3. **Policy-aware analysis moment** — one flagship demo beat: "assess Hartwell against policy" →
   agent pulls covenants + exposure + KYC state, reasons against the policy pack, cites sections,
   flags the 7bps FCCR cushion. SR 26-2 framing (decision-support, human decides).
**G2 pass = ledger round-trips (record → recall), policy analysis produces a cited assessment.**

### WS3 — Cowork natural chat (Aug 27 - Sept 1) · Archy, Jon reviews · GATE G3
Plugin v0.5.0: skill prose rewritten to the real 24 tools, command routing for natural chat
("show me Hartwell", "stage the increase to 20M", "run the KYC checks", "assess against policy"),
assemble-cockpit refreshed, marketplace bump. The plugin is the natural-chat front door; the
cockpit renders the same bundle.
**G3 pass = a cold Cowork session with the plugin installed handles the demo conversation end-to-end.**

### WS4 — Artifact parity (continuous, freeze Sept 1) · Archy
Every cockpit change ships to both artifact URLs same-day via the one pipeline
(assemble-artifact.mjs, QA gate, byte-verify). No divergence between surfaces, ever.

### WS5 — Perfection pass (Sept 1-4) · both seats · GATE G4
- **Sept 1: feature freeze.** After this, only fixes.
- Codex adversarial review of the full delta (wire payloads, guards, prose).
- Fabian click-through on BOTH surfaces, every action.
- The printed beat rehearsed ×3 with stopwatch: email arrives → sync → CLIENT REQUEST →
  suggestion → prefilled package-anchored ticket → staged plan → approve. Timings recorded.
- Evidence pack: every gate's receipts in one doc.
**G4 pass (Sept 4) = both surfaces demo the full arc without a single error. Then finetuning only.**

## Backlog (explicitly NOT before Sept 4)
- **Agentforce integration** (Fabian, 2026-08-20: explore as backlog item).
- Mod/renewal EXECUTE unblock (design decision; LV06 wall is by design).
- Covenant execute first live run (founder-gated, fires real email).
- Renewal clone re-probe (⚠️ required before execute_renewal is EVER considered).
- Voice (belongs to Demo 1).

## Execution flow (how two seats stay coherent)
1. This doc is the plan of record. Changes to it = commit + push + Banksy brain sync.
2. Daily: each seat ends its working session with a brain-write `context` event on its box
   (Banksy events reach `/opt/brain`; Archy events reach the Connectry brain) + repo knowledge
   update when material.
3. Gates are named G0-G4; a gate claim requires receipts in `knowledge/EVIDENCE-SEPT4.md`
   (created at G0).
4. Blockers surface to Fabian same-day, never sat on.
5. Jon kickoff: Fabian intros; Jon reads STATUS.md → HANDOVER-2026-08-20 → this doc →
   DREAMFORCE-SPIN-CONTEXT.md, then confirms or renegotiates the WS2 lane.

## Risks, named
- **Shared sandbox drift** (bankinggpt): mitigated by G0 now + re-smoke at freeze.
- **Both-surfaces scope**: mitigated by WS4 single-pipeline parity, not double builds.
- **IDB staging env stability**: unknown uptime; WS1/WS2 archive envelopes so baked fallback data
  stays honest if staging wobbles on demo day.
- **Booth network**: live org + M365 + gateway calls need connectivity; rehearsal must include a
  fallback story (baked bundle) — decide at G4 whether fallback is armed.
- **Jon ramp time**: the knowledge tree is the mitigation; it is complete and indexed on Banksy.
