# Inbound Client Requests — Design Note (brainstorm, 2026-07-25)

Status: DESIGN ONLY. M365 not connected; nothing built. Captures Fabian's direction so the seams
land in the right places now.

## The scenario

Client ABC emails their RM: "I want to increase my loan from 200K to 1M." Today that lives in
Outlook, disconnected from the book. Target: it surfaces in the cockpit as an **incoming request on
the relationship**, with the email as the referenced source, and the MCP fleet has ALREADY prepped
the analysis before the banker opens it: current verdict, headroom, recommended path (Modification
vs New Facility vs "secure further collateral first"), and what's missing.

## Where it lives in the UI (decided direction)

- NOT a separate portfolio concept. The worklist IS the attention queue, and an inbound client
  request is a needs-action signal like any other: new reason code **CLIENT_REQUEST**, highest
  severity tier. Client ABC's row appears/rises in the worklist with a "Client request" chip.
- The account workspace gains a **Request card**: the ask (200K → 1M), received-when, channel,
  a link/reference to the source email, the agent's prepped brief, and the relevant actions
  pre-filtered and pre-parameterized (Modification with from/to amounts already staged).
- Optional later: a thin "Inbox" triage view for requests that could NOT be entity-resolved to an
  account (unknown sender). Unmatched requests never silently disappear.

## The pipeline (MCP-server side, mirrors our existing doctrines)

1. **Capture (intake spine).** M365/Graph inbound mail → the intake service. Same architecture
   decision as the KYC portal (07-12): intake is just another client of the gated write tools —
   no separate proxy world. LLM parses intent (request type, amounts, urgency); entity resolution
   maps sender → Account (contact email/domain). The EMAIL is the source of truth; parsed values
   carry provenance "derived from message <id>", never free-standing facts.
2. **Persist as a first-class object.** `stage_service_request` (v2 gated write) with
   channel=email, reference = Graph message id + webLink. Note the IDB Gateway has this exact
   shape already (capture_channel_interaction + create_service_request) — fleet-consistent.
3. **Pre-analysis ("prepped for you").** On capture, the agent runs the standard READ fleet scoped
   to that account (Portfolio/Snapshot/Exposure/Covenants + Boom ratios + covenant grade) and
   composes a **request brief**: current verdict, quantitative headroom for the ask (coverage,
   leverage vs policy, collateral position at the new amount), recommended path, and gaps
   (stale financials? insufficient collateral ⇒ "secure further" branch). SR 11-7 fence: the brief
   is decision SUPPORT (provenance AGENT); the banker decides; nothing auto-executes.
4. **Surface.** Cockpit payload gains the request; worklist reason fires; Request card renders;
   chat suggestion chip: "Review the increase request from <client>".

## Contract seams (cheap to reserve now)

- ReasonCode += CLIENT_REQUEST (registry/worklist are data-extensible by design).
- C360_DATA optional `requests[]` per account:
  `{ id, channel: 'email', receivedAt, summary, ask: { type, from, to },
     reference: { kind: 'm365-message', id, webLink }, brief?: <AGENT-provenance>, status }`
- Action registry: actions accept optional request context (pre-parameterization).
- Provenance kinds already support this: ask = DERIVED (from message), brief = AGENT, email = the
  citation. No new kinds needed.

## Sequencing

Third act, after: (1) read cockpit [shipped], (2) actions + v2 gated writes [next slices].
Depends on: M365/Graph connection (webhook or polling), entity-resolution quality bar, and the
service-request write tool from the v2 build. KYC/onboarding intake and this share ONE spine.
