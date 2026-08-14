# Customer 360 — Program Plan & Next Steps (set 2026-06-29, Fabian, "for tomorrow")

The planning seed Fabian asked for: where we are, what we build next, what we have vs what we need.
Process directive throughout: **keep Clawdy and the team super close in the loop; verify everything triple.**

## Session 2026-07-01 — build + architecture Q&A, carried forward

**Shipped this session:** the actual Customer360 Salesforce-hosted MCP server — 7 Apex
`@InvocableMethod` tools (`Customer360Snapshot`, `RelationshipGraph`, `Exposure`, `Covenants`,
`Opportunities`, `StructuralSignals`, `SearchAccounts`) + the `McpServerDefinition`, deployed live
to `bankinggpt`, verified end-to-end against real Piedmont data (every figure matched
`SCHEMA-VERIFIED.md`/`VALIDATION-AND-DECISIONS.md` exactly). Read-only by design (v1 scope, per
this doc's own earlier decision). Source: `customer-360-mcp/sf-build-v2/` (supersedes the deleted
`sf-build/` — that version had an invented, non-working API shape; corrected after real research +
a Clawdy architecture consult). Full corrected schema/mechanism notes live in the header comments
of `Customer360.mcpServerDefinition-meta.xml` and each `.cls` file.

**PARKED — explore later (Fabian, 2026-07-01):** the Claude Code **plugin `mcpServers`
auto-bundling mechanism** — a plugin's `.claude-plugin/plugin.json` can declare an `mcpServers` key
so installing the plugin auto-starts its MCP connector(s), no separate manual `claude mcp add` step.
Confirmed real/documented; confirmed our OWN `credit-memo-reinvented` plugin does NOT currently use
it (its connectors are wired up some other way, outside the plugin manifest — mechanism not yet
traced). **This is Accenture engagement work, not a Connectry product experiment** — the "first
tester" is **Fabian and Noland, personally, on this engagement** (likely via the new
`customer-360-reinvented` plugin, built to use `mcpServers` properly from day one), **before Noland
adapts the same pattern into `credit-memo-reinvented`**. Not Connectry-branded, not started —
revisit when building the new plugin.

**Also surfaced, not yet decided:**
- **Plugin split**: build a new sibling plugin `customer-360-reinvented` (NOT folded into
  `credit-memo-reinvented`) — matches the existing project convention (`boom-mcp`/`afs-mcp`/
  `experience-mcp` are already separate repos) and Noland's own pattern of keeping his active
  memo-artifact work (`/opt/connectry/projects/credit-memo-artifact/`) outside the plugin too.
- **Widget not built yet.** `experience-mcp/widget/` only has `deal-summary.html` + `finalize.html`.
  A `customer-360.html` widget + a new `tools.js` entry (e.g. `customer_360_show_cockpit`) is the
  next real piece of work — same "blind-presenter" pattern, same `node scripts/build-widget.mjs`
  build step.
- **Identity constraint for that widget, confirmed via research (not assumption):** Salesforce
  Hosted MCP servers are per-user OAuth+PKCE ONLY — no server-to-server "on behalf of" / token
  exchange is documented. So experience-mcp can NEVER fetch Customer360 data server-side the way it
  fetches Boom (`boomFinancials.js`-style). The agent must call Customer360 directly (its own
  connector, authenticated as the user) and pass the result INTO the widget tool as an argument —
  same "agent-passed wins, no server fallback" shape already proven for the `financials` arg on
  `deal_show_summary`, just with no fallback leg for Customer360 specifically.
- **MCP "Prompts"** (`McpServerPromptDefinition`, sibling to the Tool definition we used) — verified
  real, confirmed unused anywhere in the org today (0 rows). Wraps an existing Salesforce Prompt
  Template (Prompt Builder / `GenAiPromptTemplate`) as a user-invocable MCP prompt. Possible future
  fit for a packaged "one-click Customer 360 read" starter — not explored beyond confirming it exists.
- **Salesforce Multi-Framework (React-hosted apps, UIBundle)** — confirmed separate/parallel to MCP,
  not a dependency either way (own prior verified runbook: `salesforce-multiframework-verified.md`,
  already proven in this same `bankinggpt` org). One real future convergence point: Salesforce's own
  roadmap lists **"MCP UI" as a planned future Multi-Framework framework option** alongside React —
  if shipped, a widget could theoretically run natively in Salesforce AND render in Claude from one
  build. Roadmap only, not live — watch, don't build against it yet.

## Where we are (done, live)
- **Functional HLSI v6** — `hlsi/customer-360-hlsi.src.html`, 30-page A4-landscape fixed-page cards.
  Live: https://bot.connectry.io/customer-360 (+ `/customer-360-hlsi.pdf`, `/fleet-diagram.svg`).
  Covers: the customer/obligor-group + household construct (nCino Connection graph + FSC), three
  co-existing surfaces on one Product Package + Account spine, the 6-stage blueprint, the cockpit,
  personas & **81 use cases** (57 + 14 servicing-lifecycle + 10 Early Warning), the
  Components+effort build map, the Components×Personas heatmap, the **MCP fleet topology diagram**,
  the **Early Warning** chapter (taxonomy + escalation ladder + severity + config seams), learn/govern,
  Stage-0 gates, status.
- **Doctrine docs** (the build contract): `ARCHITECTURE-MCP-FLEET.md` (+ DIAGRAM_SPEC),
  `EARLY-WARNING.md`, `CUSTOMER-AND-HOUSEHOLD-MODEL.md`, `USE-CASE-CATALOG.md` (81),
  `CAPABILITY-MAP.md`, `EXPERIENCE-SPEC.md`, `VALIDATION-AND-DECISIONS.md`, `SCHEMA-VERIFIED.md`,
  `DATA-MODEL-AND-ROLES.md`, `MAINTENANCE-AND-MONITORING.md`, `PERSONAS.md`, `ROLE-REQUIREMENTS.md`.

## Tomorrow — Task A: deepen the diagram to show how the MCP servers ACTUALLY communicate
Fabian: "showcase more, also in the diagram how the MCP servers are actually communicating with each
other ... we have similar approach with the credit memo and spreading ... showcase this in detail."
This is REAL and grounded in shipped code — it is not aspirational.

**The proven pattern (the credit memo / spreading fleet, on this box):**
- An aggregation MCP is itself a CLIENT to the system MCPs. `experience-mcp/src/boomFinancials.js`
  does `fetch(BOOM_MCP, { jsonrpc:"2.0", method:"tools/call", params:{ name, arguments } })` over
  **streamable-HTTP**, parses the SSE `data:` frames, and composes the result **server-side**. The
  number is computed in the Boom MCP, retrieved by the Experience MCP, and **never passes through the
  LLM** — the SR 11-7 "agents reason, tools compute" seam, in literal code.
- Sequence to draw in detail (a sequence/flow panel, not just boxes):
  1. Client (Claude/Agentforce) calls an Experience/C360 tool (`tools/call`).
  2. Experience MCP fetches the SF spine run-as-user, and **fans out as a client** to Boom / AFS /
     Snowflake via JSON-RPC `tools/call` (parallel, 8s timeout, graceful-null).
  3. Experience MCP **joins + computes in code** on the Product Package + Account keys.
  4. Returns a small, already-computed result to the client; the LLM only ranks + narrates.
  5. Optional write-back: `ncino_publish_credit_memo` / `ncino_sync_memo_sections` → nCino nFORMS,
     gated (`EXPERIENCE_ALLOW_WRITES`), run-as the right identity, audited to the Snowflake ledger.
- **Grounding files (read first):**
  - `/opt/connectry/projects/commercial-credit-reinvented/experience-mcp/src/boomFinancials.js`
    (the literal MCP-to-MCP `tools/call`), `.../src/tools.js`, `.../src/covenant.js` (Boom ratio ×
    nCino threshold join), `.../src/ncino.js`, `.../src/sfClient.js`, `.../src/snowflakeStore.js`,
    `.../src/memory.js`, `.../app/api/[transport]/route.js` (transport).
  - `/opt/connectry/projects/commercial-credit-reinvented/credit-memo-reinvented/docs/MCP-FLEET.md`,
    `docs/architecture/plugin-mcp-contract.md`, `docs/architecture/ncino-sync-and-realtime.md`,
    `mcp-servers/CONNECTORS.md`, `docs/architecture/README.md`.
- **Deliverable:** upgrade the fleet diagram (and/or add a second "how a tool call resolves" sequence
  diagram) to show the JSON-RPC `tools/call` edges, streamable-HTTP/SSE transport, the parallel fan-out,
  the in-code join, and the write-back path — labeled with the real tool names. Keep shipped solid /
  future dashed, keep the SR 11-7 wall.

## Tomorrow — Task B: a complementary TECHNICAL HLSI (the technical twin of the functional one)
A second HLSI, same house style, that complements the functional document and goes deep on the build.
Polish it more than the functional one. Candidate scope (confirm with Fabian/Clawdy):
- The 4-tier fleet model (hub plugin = reasoning/methodology; system MCPs = Boom/AFS = tools/data;
  experience/aggregation MCP = cross-source compose + nCino write + governance; the new SF-native
  Customer 360 MCP = run-as-user nCino+FSC reads). "Plugin holds reasoning; connectors hold tools/data."
- Transport + hosting: Next.js + mcp-handler, dual transport (stdio + streamable-HTTP), Vercel deploy,
  public connector URLs; the inter-MCP `tools/call` mechanics from Task A.
- Identity + security: run-as-user OAuth (External Client App, PKCE, `mcp_api`+`refresh_token`,
  `WITH USER_MODE` FLS/sharing) for reads vs client-credentials integration user for the gated write
  path; admin god-mode seam; the SR 11-7 deterministic-compute wall; `/security-review` discipline
  (threat-model-first; remote-host untrusted MCPs in org infra — see brain learning 2026-06-26).
- Data + governance: the Product Package + Account spine, the Boom→Snowflake→nCino lineage, the Snowflake
  decision ledger + audit trail, the covenant-grade join, the nCino nFORMS publish path (HTML-native,
  nCino-safe HTML discipline).
- Bank-agnostic: managed-package namespace + per-tenant config map (groupingKey, covenant/collateral
  legacy-vs-modern generation, thresholds).
- The Early Warning technical wiring (deterministic triggers, the config seams from `EARLY-WARNING.md`).

## Tomorrow — Task C: plan next steps (what we have vs what we need)
Run a structured gap analysis once A+B are drafted: inventory what exists (functional + technical HLSI,
doctrine docs, the proven credit-memo fleet, the verified nCino+FSC schema, the Customer 360 MCP design)
vs what is still needed (the actual Customer 360 MCP build, live Snowflake/Snowflake + CapIQ/IBIS wiring,
the EWS bank-specific thresholds/SLAs/scorecard — incoming, security review, deployment, demo data).
Produce the "what we have / what we need / sequencing" view for Fabian + the team.

## Incoming from Fabian (tomorrow)
- **Early Warning detail**: bank-specific trigger thresholds, escalation SLAs, EWS scorecard weights.
  Seams are already marked in `EARLY-WARNING.md` (the `<!-- TOMORROW -->` markers) and the HLSI EWS
  chapter — they drop in by config, not rework.

## Process (non-negotiable, Fabian)
- **Clawdy + team in the loop**: consult Clawdy on the architecture before finalizing the technical
  HLSI and the deepened diagram (architecture decision → auto-invoke per CLAUDE.md). Keep the team close.
- **Triple-verify everything**: render + read every page; measure every fixed page; ground every
  technical claim in the real code/docs (no aspirational architecture); cross-check the inter-MCP
  mechanics against `boomFinancials.js` + the architecture docs.
