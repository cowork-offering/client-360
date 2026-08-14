# Customer 360 / EWS — Surface Options Validation (2026-06-29)

Honest validation of which host surfaces can render the Truist-style Early Warning / borrower-health
cockpit as an **interactive, per-user-authorized ("authorized against the user", run-as-user), live**
dashboard from our native Salesforce MCP server. Year is 2026. Built on the known-good baseline (see
`VALIDATION-AND-DECISIONS.md`, `ARCHITECTURE-MCP-FLEET.md`): MCP is a Linux Foundation / AAIF standard;
Salesforce Hosted MCP Servers are GA (Apr 2026); Agentforce is a native MCP client with a Server
Registry; and our tool surface is the Apex `@InvocableMethod`-as-MCP-tool pattern behind an External
Client App (PKCE, `mcp_api` scope) running `WITH USER_MODE` for FLS + sharing.

## 1. Framing — one server, one data spine, many swappable surfaces

There is exactly **one thing to build and harden: the Customer 360 MCP server** (the run-as-user nCino +
FSC read spine that fans out to the Boom / AFS / Snowflake fleet and joins in code, per `NEXT-STEPS.md` Task A).
Everything a user *sees* is a render surface bolted onto that one server. The surface decides two things
only: (a) **where the widget renders** (chat iframe, native Lightning panel, your own web page) and (b)
**how the viewer's identity reaches the server** (Salesforce-native session, Entra on-behalf-of, host-brokered
OAuth, or direct SF OAuth). The data plane, the per-user authorization, and the FLS/sharing enforcement are
**identical across surfaces** because they all live in the one server. So surface choice is a *distribution*
decision, not an auth-feasibility one. The honest good news: **every viable surface below satisfies
run-as-user** without a service-account shortcut. The honest caution: "interactive + live" maturity varies,
and "share one link, everyone sees it live" is **not** how any of these work (each viewer authorizes their own
identity, which is exactly what a bank wants).

## 2. Options matrix

Legend: **GA** = generally available now · **Preview** = announced/rolling out, dates not pinned ·
**Build** = we build it, no host dependency. "Render fidelity" is versus the Truist FSC mock.

| Surface | Interactive dashboard | Per-user "as-user" auth | Live refresh | Where it renders | Build effort | Sec-review burden | Demo-ready now |
|---|---|---|---|---|---|---|---|
| **Claude chat / desktop (MCP App widget)** | Yes — sandboxed iframe widget; inline + fullscreen; KPI tiles, tables, gauges, drill | Yes — OAuth 2.1 + PKCE, user-scoped token → our SF ECA; `WITH USER_MODE`. Enterprise-managed auth (Okta, Jun 2026) removes per-viewer consent friction | Yes — widget `callServerTool` re-calls our tool and repaints (true live, not a snapshot) | In Claude conversation (web + desktop) | Med — build widget to strict MCP Apps subset | Our MCP server review + connector approval | **Yes** (we self-host the `ui://` widget; SF first-party Claude integration is still "coming soon") |
| **Claude Cowork (Live Artifact)** | Yes — persistent HTML dashboard in a sidebar | Yes — same connectors, same per-user OAuth | **On-open only** — artifact→`sendPrompt`→agent→MCP loop pulls fresh data when a human opens it. No background/push, no overnight monitor | Cowork sidebar (Claude Desktop, paid plans) | Med — reuse the same widget/data | Same connector + server review | Yes for "my morning EWS" view; **not** an always-on alerter |
| **M365 / Copilot (MCP App widget)** | Yes — HTML/React in sandboxed iframe; inline (required) + side-by-side ("Cowork canvas" analog) | Yes — Entra ID OAuth 2.1 / SSO, **on-behalf-of** exchange Entra→Salesforce; 401→consent per viewer. Requires us to bridge Entra→SF token | Yes — same MCP Apps spec, bidirectional bridge | In Copilot Chat (Teams / M365) | Med — same widget, **plus** Entra→SF token bridge | MS tenant approval + our server review + the bridge | GA Apr 7 2026; widget richness still maturing. Strongest "where bankers already are" |
| **Agentforce in FSC (Custom Lightning Type / LWC)** | Yes — **native LWC** in the Agentforce panel, real SLDS/FSC styling, nested objects, drill, action buttons | Yes — **native run-as-user**; the identity *is* the SF session; CRUD/FLS/sharing automatic; no cross-IdP bridge | Yes — tool re-call inside the agent; native session | Inside FSC (Lightning Experience / Enhanced Chat) | Med — CLT-backed LWC (we own the LWC) | **Lowest** — standard AppExchange Apex/LWC; native identity | CLT-in-Lightning shipping; **Agentforce Experience Layer** (project to Claude/Copilot/ChatGPT) is **Preview** (TDX 2026, GA not pinned) |
| **ChatGPT Apps (Apps SDK / MCP)** | Yes — sandboxed iframe widget; lists, forms, dashboards | Yes — OAuth 2.1 auth-code + PKCE → our SF ECA; `WITH USER_MODE` | Yes — same MCP Apps bridge | In ChatGPT conversation | Med — same strict-subset widget | OpenAI app submission + server review | Yes (Business/Enterprise/Edu beta); consumer-anchored audience, weaker "where bankers are" |
| **Hosted web dashboard (Next.js, per-user SF OAuth)** | **Highest** — we own the entire UI; pixel-match the FSC mock | Yes — per-user SF OAuth 2.0 auth-code + PKCE, **same ECA**; all SOQL/Apex run as that user | Yes — SSR / streaming / on-demand; no host loop | Standalone URL **or** embedded in FSC via **Lightning Out 2.0** (GA Winter '26) or Canvas | **High** — full frontend to build + maintain | Our own app review (OAuth, token storage, OWASP); AppExchange only if Canvas/LO-packaged | Yes — but it is "another tab", not inside a chat host (pair with MCP for the agentic UX) |
| **Native LWC on an FSC page** | Yes — but SLDS/LWC-bound, no agent narration | Yes — **native session**, no OAuth dance at all | Yes — standard LWC/Apex refresh | An FSC record/app/home page | **Low–Med** | **Lowest** — standard AppExchange review | Yes — fastest path to a banker-visible EWS dashboard; loses the "lives in an AI host" angle |

**Dead end (do not propose):** Claude **Code** artifacts are static with no external network — they cannot
reach the MCP server, so no live dashboard there.

## 3. Key insight — the server is the constant; the auth is shared

The Customer 360 MCP server is the invariant. Six of the seven surfaces above (everything except the pure
native LWC) are fed by the **same per-user OAuth design we already decided**: External Client App, PKCE,
`mcp_api` + `refresh_token` scopes, `WITH USER_MODE` for FLS/sharing, plus the gated admin god-mode for
internal/demo (`VALIDATION-AND-DECISIONS.md` §1). That one auth model underwrites Claude chat, Cowork,
ChatGPT, and the hosted web dashboard directly (host- or app-brokered SF OAuth). Agentforce-in-FSC and the
native LWC get run-as-user **for free** from the Salesforce session itself (no bridge). M365/Copilot is the
one surface that needs an extra piece: an **Entra→Salesforce on-behalf-of token exchange**, because the
host identity is Entra, not Salesforce. So:

- Build and harden the data plane **once**: token validation on every call (treat every bearer as
  untrusted), scope enforcement, `WITH USER_MODE` on every Apex/SOQL path, audit logging. This is the
  shared attack surface across all agent hosts — review it once.
- The widget itself should be built to the **strict MCP Apps subset** (our `/mcp-app-ux` "build to the
  strict bar" learning). One `ui://` widget is then portable across Claude, ChatGPT, and Copilot.
- Surfaces become a menu we light up in sequence, not parallel rebuilds.

One sharp edge to verify before any borrower-PII pilot (flagged honestly): on **custom/Team** connectors,
confirm the OAuth token is stored and issued **per user**, not shared per org. Salesforce Directory
connectors are user-scoped, but custom-connector token isolation must be verified by us — a shared token
would mean every user sees every book. Design the ECA for per-user auth required and confirm isolation in
test.

## 4. Recommendation — primary now, production later

**Primary demo surface now: Claude chat / desktop MCP App widget**, with **Agentforce-in-FSC (CLT/LWC) as
the native twin**.

- *Why Claude MCP App now:* it is the cleanest match to the Truist mock that we can stand up **today**
  without waiting on any first-party shipment. We self-host the `ui://` widget; fullscreen FSC-styled
  cockpit; drill and refresh via `callServerTool`; per-user OAuth straight into our existing ECA design;
  and it is our home turf (Connectry brain + connector stack). Honest caveat: Salesforce's *first-party*
  Claude interactive integration is "coming soon", so we frame this as **our** native SF MCP server
  feeding a Claude widget, not as a shipped Salesforce↔Claude feature.
- *Why Agentforce-in-FSC alongside:* it is the only surface that renders a **real** FSC/SLDS LWC with
  **native** run-as-user and the **lowest** security-review burden. For a banking audience it is the most
  credible "this is inside Salesforce, authorized by the platform" story. CLT-in-Lightning is shipping.

**Production / scale surface later: the dual-surface play** — one hosted **Next.js dashboard** (highest
fidelity, embeddable into FSC via **Lightning Out 2.0**, GA Winter '26) sharing the **same per-user-OAuth,
`WITH USER_MODE` data layer** that the MCP server already exposes to agents. Build the data/query layer
once; expose it twice (web for humans, MCP for agents). Then light up **M365/Copilot** where bank risk
officers already live (Entra SSO; budget the Entra→SF bridge), and **ChatGPT Apps** as a fast follow.

**GA honesty:**
- **GA today:** Salesforce Hosted MCP Servers; MCP App widgets in Claude chat and M365 Copilot; ChatGPT
  Apps (Business/Enterprise beta); Claude enterprise-managed auth (Okta); CLT/LWC rendering in the
  Agentforce panel.
- **Preview / rolling out:** Agentforce Experience Layer (one component projected to Claude/Copilot/ChatGPT)
  — TDX 2026 announced, GA not pinned; Lightning Out 2.0 — GA Winter '26.
- **Aspirational / not GA:** Salesforce *first-party* native interactive in Claude ("coming soon"); any
  "publish one live link, every viewer inherits access" model (does not and should not exist — each viewer
  authorizes their own identity).
- **Server-side reality:** overnight Early Warning detection is a **Salesforce-side Apex/Queueable job**
  (per `EARLY-WARNING.md`) that the dashboard then *reads*. No chat surface (Cowork included) does
  background monitoring; they render fresh-on-view. Do not promise always-on alerting from a render surface.

**Sources where it matters:** Salesforce Hosted MCP Servers GA + External Client App (developer.salesforce.com,
Apr/May 2026); MCP Apps spec (modelcontextprotocol.io, Jan 26 2026) + Claude interactive connectors
(support.claude.com, Mar 25 2026); Claude Cowork Live Artifacts (Apr 20 2026) + enterprise-managed auth /
Okta (Jun 18 2026); MCP Apps in M365 Copilot (devblogs.microsoft.com, Apr 7 2026) + Entra on-behalf-of
(learn.microsoft.com); Agentforce Custom Lightning Types + Experience Layer (developer.salesforce.com /
TDX 2026); OpenAI Apps SDK auth (developers.openai.com); Lightning Out 2.0 Winter '26 (salesforceben.com).
Open issues to track on shared-token isolation: anthropics/claude-code #46207, #44980.
