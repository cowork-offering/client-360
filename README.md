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

## TODOs / verify before demo

- **[VERIFY] Custom hosted-MCP server URL.** The `mcpServers.customer360.url` in `plugin.json` is a
  **best-candidate**, not yet confirmed against the live endpoint:
  `https://api.salesforce.com/platform/mcp/v1/sandbox/custom/Customer360`
  - Confirmed from Salesforce docs: the base is `https://api.salesforce.com/platform/mcp/v1/`, and
    **sandbox** orgs carry a `/sandbox/` path segment (this is the `bankinggpt` sandbox, so `/sandbox/`
    is correct). Standard servers resolve as `.../sandbox/platform/<server-name>` (e.g.
    `.../sandbox/platform/sobject-all`).
  - **Unconfirmed:** the path segment for a **custom** `McpServerDefinition`. The docs say only that
    "the URL for a custom server is unique to that configuration" and do not show the literal custom
    path. Candidate assumes a `custom/` namespace + the server DeveloperName (`Customer360`). Plausible
    alternatives: `.../sandbox/Customer360` (bare name, no `custom/`) or a lowercased/slugified name.
  - **How to resolve authoritatively:** in the `bankinggpt` org, Setup → Integrations → **Salesforce
    MCP Servers**, open the `Customer 360` custom server — the connection URL is shown there verbatim.
    Update `plugin.json` with the exact string. (Noland's existing `CreditMemoExperinece` custom server
    is the reference for the custom-server URL shape in this same org.)
- **[DEPENDENCY]** `artifact/customer-360-template.html` is built in parallel by another agent; the
  skill references it by relative path. Verify the template exposes a `<script id="c360-data">` slot and
  restores active tab + `aiPanel` state on load.
