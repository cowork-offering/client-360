# The AI-Native Commercial Bank on Salesforce
## KYC & Onboarding on the Customer 360 Spine — Executive HLSI
### 12 slides · paste-ready for Claude design · 2026-07-29

> DESIGN NOTES FOR THE RENDERER: 12 slides, one message per slide, slide title is the claim.
> Sober banking palette, generous whitespace, no icon walls, no badge/pill soup; status facts
> render as tables with colored status text. Diagrams over bullets where marked. Numbers are
> real and verified; do not invent additional figures.

---

## Slide 1 — Title

**One Spine, One Lifecycle: from First Contact to Funded Facility**

KYC & Onboarding, harmonized into the Customer 360 platform
Commercial banking on Salesforce (FSC + nCino), governed by AI with humans on the gate

Footer: Accenture × Salesforce × Anthropic · Working prototype, live org, real writes · 2026

---

## Slide 2 — Where we stand today: this is built, not planned

**A working relationship cockpit with governed writes into the live org.**

| Capability | Status today |
|---|---|
| Relationship cockpit (exposure, covenants, collateral, signals, ownership) | Live, banker-facing |
| Cross-source reads from Salesforce/nCino | 9 purpose-built tools, deployed |
| Governed client actions (modifications, renewals, valuations, reviews, new facilities) | 10+ write tools, deployed, human-confirmed |
| Multi-facility deal actions in nCino's own deal grammar (package-anchored) | Live this week |
| True collateral coverage math (pledged share, no double counting) | Live this week |
| Email to action: client request becomes a prefilled, human-confirmed ticket | Live |
| Conversational access: every tool usable from plain chat | Live |

Proof discipline: 1,200 automated UI tests, 170 platform tests, every write observed on the wire before release.

Speaker note: nothing on this slide is roadmap. This is the platform KYC & Onboarding lands on.

---

## Slide 3 — The insight: onboarding is the birth of the same relationship

**Today we manage the life of a relationship. Now we add its birth.**

[DIAGRAM: one horizontal lifecycle arrow]
Prospect intake → KYB/KYC due diligence → Validation → Human attestation → **Booked** → Customer 360 (exposure, covenants, servicing, credit actions)

- Left of "Booked": the new build (KYC & Onboarding)
- Right of "Booked": the platform that already exists
- Same banker workspace, same governance, same audit spine
- The moment onboarding completes, the prospect simply appears in the banker's book. No handoff, no second system.

---

## Slide 4 — What the banker sees: one workspace, two zones

**The cockpit gains an "In onboarding" zone next to "My book."**

- L1: the banker's home shows the existing book AND the onboarding pipeline (stage, blockers, screening status)
- L2: opening any name lands in the same shell; the tabs adapt to lifecycle stage
  - Onboarding case: Process · Parties · Documents · Screening · Attestation
  - Booked relationship: Exposure · Covenants · Signals · Actions (unchanged)
- After booking, the relationship keeps a permanent onboarding history tab: who attested, what was screened, when
- Prototype of this experience is live in the cockpit today (three sample cases across the lifecycle)

---

## Slide 5 — Full capability map of the new build

**Six capabilities, one governed flow.**

| Capability | What it does |
|---|---|
| Client intake (external) | Prospect submits details and documents through a controlled portal; identity recorded as claimed, never trusted |
| Prospect creation | Governed create of the account + onboarding case, race-safe, duplicate-safe |
| KYB / parties resolution | Ownership structure with typed roles (owner, guarantor), beneficial ownership visible |
| Documents | Identity documents on the FSC-native object, verification state, verified-by and when |
| Screening | Sanctions, adverse media, high-risk-country checks through real tools; anything without a live provider is honestly labeled Simulated |
| Attestation & completion | A human attests KYC clearance; only then can the case complete and book. Enforced in the platform, not in the UI |

---

## Slide 6 — Architecture: five layers, one org

**Everything runs in one Salesforce org with one auth boundary.**

[DIAGRAM: five stacked layers]
- **Engagement** — Banker cockpit + plain chat (Claude), client intake portal
- **Agency** — Orchestrator agent + underwriting/onboarding skills; intent only, never workflow logic
- **Work** — Deterministic MCP tools: 24 live Customer 360 tools + 5 new onboarding write tools
- **Context** — Spreading engine, servicing, decision ledger, screening gateway
- **Record** — Salesforce: FSC and nCino co-resident, plus the built-in KYC application

Differentiator: the wealth reference architecture runs FSC only. This org runs FSC **and** nCino, so onboarding flows into a real booked credit facility. No one else on the program can show that.

---

## Slide 7 — Governance: humans hold the gate, the platform enforces it

**SR 11-7 discipline, extended from credit decisions to client onboarding.**

- Every agent write is typed, audited, and idempotent; heavy actions run stage → human confirm → execute with a single-use decision token
- Two transitions are impossible for any agent, on any surface: marking KYC "Verified" and completing an onboarding case. Both require a human, enforced in Apex code with a platform-level backstop
- Rejected attempts are audited too (they survive transaction rollback by design)
- Two ledgers, one correlation key: what happened (audit events in Salesforce) and why it was decided (decision ledger), joined per onboarding case
- The same fence whether the request comes from the cockpit, from chat, or from any API

---

## Slide 8 — Two front doors, one write layer

**The banker and the client never share a door.**

[DIAGRAM: two arrows into one shared service layer]
- Banker door: hosted MCP, per-user login, the banker writes as themselves
- Client door: separate intake service, dedicated integration identity, abuse controls (authentication, rate limiting, upload validation)
- Both doors call the same governed Apex services; neither can bypass the gates
- Every intake write stamps the claimed external identity into the audit trail. The trail never says "the system did it"

---

## Slide 9 — Build small, reuse big

**The org already contains most of what this needs. We connect it.**

| Already in the org | Being added (net-new) |
|---|---|
| Full KYC application (200+ fields, Entity/Individual, attestation stage) | 3 small objects (screening result, clearance, audit event) |
| nCino onboarding case with native stages incl. "KYB and KYC only" | 1 platform event (rejection audit) |
| FSC identity-document object with verified-by built in | 4 fields (KYC link, attestation, hashes) |
| FSC relationship objects with typed ownership roles | 5 write tools + 1 intake endpoint |
| The entire Customer 360 write engine (plans, tokens, guards, audit) | The cockpit onboarding experience |

Key fact: the KYC application and the onboarding object exist today but have never been connected, by anyone. This build joins them into one lifecycle. Design is container-agnostic, so the wealth variant runs the identical build in an FSC-only org.

---

## Slide 10 — What you can see today: the prototype

**Live in the cockpit now: the full onboarding experience on sample data.**

Three cases, three moments in the lifecycle:
1. **Caldwell Systems** — arrived through client intake minutes ago; provenance visible (who claimed to submit, when)
2. **Meridian Tooling GmbH** — mid due-diligence: ownership resolved, one document pending, one adverse-media hit (labeled Simulated) blocking progress
3. **Atlas Packaging** — everything green; the single blocker is the human attestation. Complete is not clickable. That is the point.

Honesty rule of the prototype: nothing fakes a write. Actions that are not yet deployed say so, in banker language. When the write tools ship, the same buttons light up.

[SCREENSHOT SLOTS: L1 two zones · Atlas attestation tab]

---

## Slide 11 — Plan to full function

**From prototype to fully functioning, no demo shortcuts.**

| Phase | Delivers | Gate |
|---|---|---|
| 0 · done | Verified build spec against the live org; attestation decision briefing | Founder review |
| Probes | 9 pre-build checks (access, triggers, budgets), read-only | All green |
| 1 | Objects + shared service layer on the existing write engine | Platform tests |
| 2 | The 5 write tools, chat-ready, wire-observed | Live envelope observation |
| 3 | Client intake service with controls | Security checks |
| 4 | Cockpit onboarding experience wired to the org | Full UI suite |
| 5 | Named seed prospects at showcase quality + reset script | Cross-vendor adversarial review |

Standing quality bar: every release passes 1,200+ UI tests, platform suite, and independent wire observation before it ships. Simulation is allowed only where the sandbox has no third-party provider, and is always labeled.

---

## Slide 12 — Decisions and asks

**Three items close the design; everything else is execution.**

1. **Attestation mechanism** — how the human clearance moment is captured (options briefed: Salesforce-native approval vs in-cockpit attested confirmation vs combination). This is a differentiator: the wealth reference has no built human-in-the-loop anywhere
2. **Chat tool budget** — tool schemas already exceed one host's connected-tools budget; mitigation options are costed (matters for cross-host chat parity, not for the Claude surface)
3. **Merged-team alignment** — confirm the one-org demo (this org shows both the wealth data model and commercial credit live)

Closing line: the platform already writes to the systems of record with humans on the gate. Onboarding makes it the whole lifecycle: **from first hello to funded facility, one governed spine.**
