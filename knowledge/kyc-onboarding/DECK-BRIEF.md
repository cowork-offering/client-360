# Dreamforce Approach Deck — Creation Brief (for Claude Design)

**Purpose:** the complete, self-contained prompt for building the merged-pitch approach deck in
Fabian's claude.ai Design project ("Accenture Design System"). Paste the prompt block below into
that project. Content is final per the triple-gated plan (PLAN-OF-APPROACH.md) and Fabian's
adjudication calls of 2026-07-14.

**Prep step:** download the 4 screenshots from https://bot.connectry.io/preview/c360-screens/
and drag them into the Design project first (external image URLs don't render inside claude.ai
artifacts): `c360-cockpit-1.webp`, `c360-cockpit-2.webp`, `c360-cockpit-4.webp`, `c360-full.jpeg`.

**Open placeholders:** slide 4 solution name ("KYC & Onboarding accelerator") pending the partner
team's PPT; slide 12 contacts stay tokenized until a human fills them before distribution.

---

## The prompt (paste verbatim)

```
Build a slide deck in this project using the Accenture Design System here (follow
SKILL.md's deck recipe exactly: one HTML file, slides authored 1280x720, deck-stage
wrapper with the "fill" attribute, copy of "deck/Accenture Deck.html" as the working
base, tokens + _slide.css travel with the deck, safe margins --safe-x/--safe-top).

DECK: "Customer 360 x KYC & Onboarding — Dreamforce 2026 approach"
AUDIENCE: our global Salesforce practice lead (decision-maker) + the partner team
(working level). Internal Accenture. Sober, confident, data-forward. Sentence-case
headlines, no emoji, no exclamation points.

I uploaded 4 screenshots: c360-cockpit-1.webp, c360-cockpit-2.webp,
c360-cockpit-4.webp, c360-full.jpeg. Use them where marked.

12 SLIDES (archetype from slides/ in parentheses; adapt where content demands):

1. TITLE (01-title) — Eyebrow: DREAMFORCE 2026 · MERGED PROPOSAL. Headline:
   "Customer 360 x KYC & Onboarding: one governed spine for the AI-native bank."

2. EXECUTIVE SUMMARY (19-exec-summary) — Four statements:
   (a) Two pitches, one architecture: the relationship platform and the KYC/onboarding
   journey run on the same governed Salesforce MCP spine.
   (b) Commercial-first: we prove it on commercial banking (built today), wealth
   follows as the second vertical on the same spine.
   (c) Customer 360 evolves from knowing the relationship (live) to acting on it
   (governed writes) to starting it (KYC + onboarding).
   (d) Feasible in 10-14 weeks part-time; plan triple-reviewed (two independent
   architecture reviews + cross-vendor challenge), all gates passed.

3. CURRENT STATUS: CUSTOMER 360 (21-image-body, use c360-cockpit-1.webp large +
   c360-full.jpeg secondary) — "Built and running, verified against live deal data."
   Bullets: 8 read tools deployed as a Salesforce-hosted MCP server on an FSC+nCino
   org (snapshot, relationship graph, exposure, covenants, opportunities, structural
   signals, portfolio, search); relationship cockpit rendered from live org data;
   full credit-memo lifecycle beside it (draft -> human attestation -> writeback to
   nCino -> audit trail); decision ledger records the WHY of every call; 14
   executable underwriting skills covering the 10-step commercial framework.

4. CURRENT STATUS: KYC & ONBOARDING ACCELERATOR (34-reference-case) — [keep name as
   placeholder "KYC & Onboarding accelerator"]. Present generously and factually:
   advisor workspace (React/Next.js) with AI daily brief; conversational access to
   Salesforce FSC through hosted MCP including governed mutations; document
   evaluation pipeline; voice channel with avatar; five-layer reference architecture;
   modeled value case (onboarding compression 20d -> <24h, NIGO 25% -> <5%);
   KYC routing and account-opening journeys scoped as the first use cases.

5. MERGED TARGET ARCHITECTURE (44-block-architecture) — Five layers, top to bottom:
   ENGAGEMENT: Claude/Cowork clients · MCP-app widgets (cross-host: Claude AND
   ChatGPT) · web portal pattern · client intake (roadmap).
   AGENCY: orchestrator agent + skill library; reasons and routes, never defines
   workflow logic.
   WORK: deterministic tools — financial ratios, covenant grading, memo renderer,
   NEW: Customer 360 write tools.
   CONTEXT: spreading engine (Boom) · servicing (AFS) · decision ledger (Snowflake)
   · peer data.
   RECORD: Salesforce — nCino + FSC co-resident, ONE org, ONE auth boundary; AFS core.
   Side callout "One write layer, two front doors": bankers write through hosted MCP
   as themselves (per-user OAuth, native FLS/sharing/audit); the client-facing intake
   service writes through a scoped integration identity; both converge on one shared,
   audited Apex write layer.

6. THE NEW WRITE LAYER (41-capability-blueprint) — Two server definitions:
   Customer360 (8 reads, live) + Customer360Write (5 new tools): CreateProspect ·
   RecordKycResult · AttachDocument · AdvanceOnboardingStage · LogInteraction.
   Key facts: onboarding rides nCino's NATIVE onboarding object and stage lifecycle
   (no custom schema invention); every write idempotent + audited; write mechanism
   already proven in-org three ways. Governance chips: human gates enforced in code,
   not prompts · append-only audit · attestation fields not writable by agents.

7. THE ONBOARDING FLOW (31-process-flow) — Six steps: Intake -> KYC screen (demo:
   clearly labeled simulated provider) -> Evidence attached -> Stage advances
   (agent, audited) -> BANKER ATTESTS CLEARANCE (human gate, highlighted) ->
   Relationship opens. Caption: "The customer submits, the system screens, the
   banker attests. Nothing customer-facing ever writes a clearance."

8. HARMONIZATION APPROACH (40-chevron-stages) — Four chevrons:
   1 Align & verify (team alignment, schema verification, KYC data model) ·
   2 Build the write layer (shared Apex services, MCP wrappers, governance gates) ·
   3 Make it visible (seeded demo data, onboarding flow, monitoring queue,
   relationship brief) · 4 Extend (client intake service · wealth as second
   vertical · cross-host proof). Footnote: their portal pattern and value narrative
   carry over; re-verticalized commercial value case produced fresh.

9. TIMELINE (11-project-plan) — 10-14 weeks to Dreamforce, two part-time builders:
   Wk1 alignment + schema decisions · Wk2-4 write layer + MCP tools · Wk5-6 demo
   data + onboarding flow + monitoring queue · Wk6-8 status widget + cross-host
   proof + rehearsal · Wk8-12 stretch: client intake service; full rehearsals.
   Mark the CUT LINE after week 8: "minimum credible demo complete — everything
   right of this line is upside."

10. TRUST, STATED HONESTLY (37-guardrail) — Two columns.
    ENFORCED TODAY: per-user OAuth (agents act as the authenticated banker) ·
    platform sharing/FLS · full audit trail in Salesforce · deterministic middle
    layer (regulated figures computed, never narrated by the model) · human
    attestation gates enforced in Apex and at object level.
    ROADMAP: Einstein Trust Layer integration · Agentforce orchestration · AXL
    surfaces. Tagline: "We say 'built and running', and we can prove it live."

11. DECISIONS & ASKS (54-next-steps) — DECIDED: commercial-first, wealth second ·
    writes first-class on Customer 360 · human attestation via standard Salesforce
    UI · client intake as architecture diagram first, build as stretch.
    ASKS: run the merged demo in the FSC+nCino co-resident org · ownership split:
    MCP spine + write layer (our team) / portal UX + wealth vertical (partner team)
    · voice/avatar lives in the wealth half · agree the merged asset's name.

12. CLOSING (09-closing-contacts) — tokenized contacts only ([Contact Name],
    [first.last]@accenture.com), "Reinvented with Accenture" placement per the DS.

Every number above is real from our build docs — do not invent additional metrics;
if a slide feels thin, tighten the layout rather than padding content. Placeholder
tokens stay as-is. Show me slide 1 and slide 5 first for a design check before
completing the rest.
```
