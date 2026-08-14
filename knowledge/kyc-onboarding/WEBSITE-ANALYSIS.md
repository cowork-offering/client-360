# Aethon / Wealth Advisor Pitch Site — Full Analysis

**Source:** https://acn-sf-advisor-future.vercel.app/ (captured 2026-07-12, all 4 routes rendered headless; raw DOM in `incoming/website-capture/`)
**Context:** Dreamforce merged pitch (Customer 360 + Credit Memo × KYC/Onboarding team). This is the other team's public-facing sales asset. Companion to the 3 reference-architecture files in `incoming/`.

---

## What it is

A C-suite pitch **microsite**, not a product. Vite/React SPA, GSAP scrollytelling, Graphik (Salesforce brand font), tagline "Accenture × Salesforce × Anthropic · Strategic asset · 2026". Four routes, each targeting a named buyer persona:

| Route | Label | Persona chips | Job |
|---|---|---|---|
| `/` | Home | — | Narrative arc: advisors buried in workflow → day rebuilt by AI → $84T wealth transfer stakes |
| `/value` | Business Case | CFO · CEO · Head of Strategy | **$606M three-year profit uplift**, four value levers |
| `/architecture` | Under the Hood | CDO · CTO · Head of Technology | Five-layer stack, defense in depth, build-vs-buy |
| `/accelerator` | Get Started | Project sponsors · Implementation leads | 3 decisions, 3 first use cases, delivery credentials |

`See the demo ↗` = `#demo` placeholder; `Contact us` = `#contact` placeholder. No live demo link, no mailto. The Aethon advisor portal (see reference-architecture files) is presumably what `#demo` will point to.

## The claims (their numbers)

- **$606M** three-year profit uplift for a firm that acts (modelled "against a real book", 500 new HNW accounts/yr)
- **Onboarding compression:** 20 days → <24h for low-risk clients; NIGO 25%+ → <5%
- **Advisor productivity:** 30% of workday returned; +25% productivity on integrated platforms
- **Compliance:** $10M–$100M+ fine exposure reduced; platform-enforced, full audit trail
- **Contact-center deflection:** $16/call, 20–30% inbound volume reduction
- Delivery credentials: "reference architecture **in production**", "**40 core CSA processes mapped**" (FA/CSA/client personas), NeuraFlash + Accenture SFBG practice named

## The five-layer architecture (their frame)

```
Engagement  — Claude Desktop · MCP · Voice · Slack · Teams · Web · Mobile
Agency      — Claude models + Agentforce governance ("reasoning and governed action")
Work        — Salesforce FSC · Wealth data model · Trust Layer · OmniStudio
Context     — Data Cloud · Zero-Copy · MuleSoft
Record      — Core Banking · Custodians · Portfolio Management   (↑ writes back to Salesforce)
```

Guardrails story: Claude-side (content filtering, PII protection, topic denial, prompt-injection defence) + Einstein Trust Layer (PII masking, access controls, toxicity, audit trail). Plus a build-vs-buy table (custom build vs Salesforce+Anthropic) repeated on /value and /architecture.

## Where KYC & Onboarding actually live

**As first-use-case options in the accelerator, not as built product:**

- **Option 01 — Onboarding compression** (highest ROI): straight-through processing, *automated KYC routing*, parallel document workflows
- **Option 02 — Advisor meeting prep** (fastest adoption): AI-generated brief per meeting
- **Option 03 — Compliance queue triage** (CDO/compliance win): *automated KYC/AML screening*, proactive flags, audit trail in Salesforce

This matches the reference-architecture finding: KYC/onboarding is **aspirational** across all their assets. Nothing client-facing is built; the as-built Aethon portal is advisor-facing.

## Read-across to the merged Dreamforce pitch

**Convergences (good):**
1. **Their five-layer frame maps 1:1 onto our fleet** — Engagement=Experience MCP+widgets/Cowork; Agency=orchestrator agent+skills; Work=deterministic MCP tools (Boom ratios, covenant grade, renderer); Context=Boom/AFS/Snowflake/peers; Record=Salesforce(nCino)+AFS. We can present the merged architecture in THEIR vocabulary without changing anything we built. Cheap alignment win.
2. **"Headless Salesforce, no rip-and-replace, trust boundary stays in the platform"** is precisely our doctrine (hosted MCP, per-user OAuth, audited writes). One shared story.
3. Their value-lever mechanics port directly to commercial credit: memo cycle time compression, covenant-breach early warning, RM capacity. We can build the C&I mirror of their $606M model.

**Tensions / things to manage:**
1. **Marketing vs as-built divergence on governance.** Site says "Agentforce governance / Einstein Trust Layer"; the as-built runs Claude via Bedrock + hosted MCP, with Agentforce marked "Available", not in use. If a technical audience pulls that thread at Dreamforce it snaps. The merged architecture should state honestly which controls are platform-enforced today (FLS/sharing/audit via hosted MCP) vs roadmap (Trust Layer/Agentforce).
2. **"In production" claim** for what is a demo architecture. Same discipline we hold for Connectry (never claim live): recommend the merged deck says "built and running" not "in production".
3. **Vertical framing:** the entire site is wealth. Commercial banking appears nowhere. The merged pitch needs the umbrella one level up ("the AI-native bank on Salesforce", wealth + commercial as two proof points on one spine) or we're a bolt-on slide in their deck.
4. **"Client-facing" remains unresolved.** Nothing in this site or their as-built is customer-facing; the external-website claim from the pitch meeting is (so far) this marketing site plus an advisor portal. Our intake-service design is still the only concrete client-facing plan on the table.

## Open questions (for the PPT Fabian is waiting on / next sync)

1. What does `#demo` point to — the Aethon portal? Is there any client-facing surface in scope at all?
2. Is Regrello (in the PNG reference architecture) real in any build, or pure target-state?
3. Who owns the "40 CSA processes" library and is there a commercial-banking equivalent, or do we supply that (we do: the underwriting framework, 10 guided steps, is our analogue)?
4. Whose org does the merged demo run in — their FSC wealth org or bankinggpt (FSC+nCino co-resident)?
