# Customer 360 Reinvented

An Accenture accelerator (bankinggpt engagement). A relationship-level commercial-credit **cockpit**
for C&I bankers: open the Customer 360 for a borrower and get a live, account-level relationship view —
ownership graph, exposure & collateral, covenants, whitespace, and structural early-warning signals —
rendered as an interactive Cowork artifact with an "Explain this" AI panel.

Demo anchor: **Piedmont Precision Components, Inc.** · Account `001bb00001DLtRMAA1` · org `bankinggpt`.

## Architecture

Two-plane design. The data plane is Salesforce-native; the UI plane is a Cowork artifact.

- **Data plane — `Customer360` Salesforce-hosted MCP server.** 7 read-only Apex `@InvocableMethod`
  tools (`Customer360Snapshot`, `RelationshipGraph`, `Exposure`, `Covenants`, `Opportunities`,
  `StructuralSignals`, `SearchAccounts`), deployed live to the `bankinggpt` sandbox. Runs on
  Salesforce's own infra (per-user OAuth + PKCE) — no server of ours to stand up. Plus the **Boom**
  MCP (`boom_get_ratios` / `boom_get_spread`) for the Financials tab.
- **UI plane — Cowork artifact.** The agent fetches all data, bakes it into `window.C360_DATA`, and
  renders `artifact/customer-360-template.html`. The artifact never fetches. Interactivity flows back
  via `window.sendPrompt(...)` → agent re-fetches → `update_artifact` (full replace).
- **experience-mcp is deliberately bypassed.** Salesforce hosted MCP is per-user OAuth only — there is
  no server-to-server "on behalf of" path — so a widget-hosting MCP could never fetch Customer360 data
  server-side. The agent calls Customer360 directly (as the user) and injects the result into the
  artifact. Simpler, and the identity story is honest.

The skill (`skills/customer-360-cockpit/SKILL.md`) teaches the agent the fetch sequence, the
`C360_DATA` contract, the artifact render loop, the `sendPrompt` payloads (including the "Explain this"
AI panel), and the per-tool gotchas.

## Install — MCP auto-connect

`.claude-plugin/plugin.json` declares an `mcpServers` entry, so installing this plugin **auto-connects**
the `Customer360` MCP server — no separate `claude mcp add` step. Auth is per-user OAuth+PKCE, handled
by the client at first use; no secrets live in the plugin. The server is declared as a remote HTTP MCP
server (`type: "http"`).

## Install — proven path (Claude Code CLI)

The claude.ai / Cowork connector broker currently fails on Salesforce hosted MCP servers
("authorized, but returned an error"): the broker sends a GET pre-flight, Salesforce answers a
spec-compliant 405, the broker treats it as fatal (known: anthropics claude-ai-mcp issues
#171/#184/#198/#246/#251 — fix in flight). Salesforce also does not support dynamic client
registration, so the client must present a pre-registered OAuth app.

Working setup today:

1. Install the plugin (skill + artifact template):
   `/plugin marketplace add weareconnectry/customer-360-reinvented` then
   `/plugin install customer-360-reinvented@customer-360`
2. Add the server to `~/.claude.json` under `mcpServers`, with YOUR org's External Client App
   consumer key (PKCE on; whitelist `http://localhost:7524/callback` in the app):

```json
"customer360": {
  "type": "http",
  "url": "https://api.salesforce.com/platform/mcp/v1/sandbox/custom/Customer360",
  "oauth": {
    "clientId": "<YOUR_EXTERNAL_CLIENT_APP_CONSUMER_KEY>",
    "callbackPort": 7524
  }
}
```

3. `/mcp` → `customer360` → Authenticate → Salesforce sandbox login → Allow.

## Server URL — verified

`https://api.salesforce.com/platform/mcp/v1/sandbox/custom/Customer360`

Confirmed 2026-07-02 two ways: read verbatim from Setup → Integrations → Salesforce MCP Servers →
Customer 360, and the endpoint's RFC 9728 protected-resource metadata resolves live
(`https://api.salesforce.com/.well-known/oauth-protected-resource/platform/mcp/v1/sandbox/custom/Customer360`
→ `scopes_supported: ["mcp_api", "refresh_token"]`). Custom hosted-MCP URL pattern is
`.../{sandbox/}custom/<DeveloperName>`.

## TODOs / verify before demo
- **[E2E]** First live run: install plugin → OAuth connect (existing External Client App keys, PKCE) →
  invoke the 8 tools over MCP → render the artifact. Everything upstream is verified; this transport
  handshake is the last untested hop.
