# Client 360 plugin: runbook

## 1. What this plugin is
The Customer 360 relationship cockpit for commercial bankers: a worklist-first React cockpit
rendered as a Cowork artifact, driven by the org-hosted Customer 360 Salesforce MCP server
(23 tools: 9 reads plus governed stage/execute write pairs) and, optionally, Microsoft 365
(client email intake) and the IDB Gateway (Boom financials, KYC tools). The agent fetches data
through connectors, the assembler bakes it into the bundled template, the artifact renders.

## 2. Prerequisites (environment, not plugin)
Register these connectors for the user BEFORE invoking the skill:
1. Customer 360 (Salesforce MCP): the `Customer360` McpServerDefinition in the target org,
   per-user OAuth. The running user needs the `C360 Action Staging Access` permission set, a
   UserRole (nCino credit actions refuse users without one), and the nCino credit-action
   permissions of a lender.
2. Microsoft 365 (optional): mail search for client-request intake. Skipped silently if absent.
3. IDB Gateway (optional): Boom spreads and KYC tools. Honest gap states if absent.

## 3. Install
Add the `cowork-offering/cowork-plugins` marketplace, install `client-360`. The plugin lives in
the `client-360/` folder of `cowork-offering/customer-360`; the template and data in `assets/`
are kept byte-identical to the repo's `artifact/` publish staging by `scripts/sync-plugin-assets.mjs`.

## 4. Invoke
"Open the Customer 360", "pull up the relationship view for <account>", "what needs my
attention". The skill in `skills/customer-360-cockpit/SKILL.md` carries the methodology.

## 5. Release
Bump `.claude-plugin/plugin.json` version, run `node scripts/sync-plugin-assets.mjs` at repo
root, run `node --test client-360/render/contract-checks.test.mjs`, bump the marketplace entry version.
