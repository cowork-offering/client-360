# Client 360 plugin: runbook

## 1. What this plugin is
The Customer 360 relationship cockpit for commercial bankers: a worklist-first React cockpit
rendered as a Cowork artifact, driven by the org-hosted Customer 360 Salesforce MCP server
(24 tools: 9 reads plus 7 governed stage/execute write pairs and one stage-only renewal) and,
optionally, Microsoft 365 (client email intake) and the IDB Gateway (Boom financials).
The agent fetches data through connectors, the assembler bakes it into the bundled template, the
artifact renders. The agent and the guided skills are the natural-chat front door over the same
tools.

## 2. Prerequisites (environment, not plugin)
Register these connectors for the user BEFORE invoking the skill:
1. Customer 360 (Salesforce MCP): the `Customer360` McpServerDefinition in the target org,
   per-user OAuth. The running user needs the `C360 Action Staging Access` permission set, a
   UserRole (nCino credit actions refuse users without one), and the nCino credit-action
   permissions of a lender. Any new demo identity needs all three checked before it drives a write.
2. Microsoft 365 (optional): mail search for client-request intake. Skipped silently if absent.
3. IDB Gateway (optional): Boom spreads. Honest gap states if absent.

## 3. Install
Add the `cowork-offering/cowork-plugins` marketplace, install `client-360`. The plugin lives in
the `client-360/` folder of `cowork-offering/customer-360`; the template and data in `assets/`
are kept byte-identical to the repo's `artifact/` publish staging by `scripts/sync-plugin-assets.mjs`.

## 4. Invoke

### The agent
`agents/customer-360.md` is the orchestrator. It carries the command routing table (banker phrase to
exactly one behavior), the write discipline (stage, present the plan verbatim, the human confirms,
execute behind the decision token, verify by re-query) and the fences.

### The skills
| Skill | Covers | Trigger phrases |
|---|---|---|
| `customer-360-cockpit` | fetch, compose `C360_DATA`, assemble, publish the artifact. Read and render only | "open the Customer 360", "pull up the relationship view for &lt;account&gt;", "what needs my attention" |
| `client-request-to-action` | a client ask becomes a package-anchored `stage_loan_modification`, then an execution. The Dreamforce email-to-action beat | "the client wants the line at 20M", "increase the revolver", a forwarded client email |
| `covenant-review` | package-scoped bulk `stage_covenant_review`: N assessments, one plan, one token. Pending rule and the `allowNonPending` opt-in | "review the covenants", "run the covenant review", "record the quarterly results" |
| `collateral-valuation` | package-anchored `stage_collateral_valuation`: `items[]` capped at 20, `valuationDate` required | "value the collateral", "the appraisal came in", "the field exam is back" |
| `relationship-actions` | service request, annual review, risk rating review, new facility (two execute invocations), renewal (stage only) | "raise a service request", "run the annual review", "review the risk rating", "structure a new facility", "start the renewal" |

### Out of scope and not wired, routed honestly
- **KYC and onboarding are OUT OF SCOPE** (founder decision, 2026-08-27). Customer 360 covers the
  booked book only. No KYC skill ships and none is planned; the agent says so and offers the live
  credit surfaces instead. Never render a KYC cleared state: no source exists.
- **Policy assessment is WS2** (IDB gateway, decision ledger and policy pack, gate G2). The agent
  names it and offers the live alternatives rather than citing a policy it has not read.
- **Credit memo and spreading are a call-out** to the credit-memo plugin, never rebuilt here.

## 5. Release
Bump `.claude-plugin/plugin.json` version, run `node scripts/sync-plugin-assets.mjs` at repo
root, run the two test suites below, bump the marketplace entry version and description to match.

```
node --test client-360/render/contract-checks.test.mjs
node --test client-360/render/tool-names.test.mjs
```

`tool-names.test.mjs` diffs every Customer 360 tool name mentioned in the agent and skill prose
against the `Customer360` McpServerDefinition manifest, so prose can never name a tool the org does
not ship. Run it directly for a readable report:

```
node client-360/render/tool-names.mjs
```

Both require the repo checkout: the manifest lives at
`knowledge/sf-build-v2/wp2/mcpServerDefinitions/Customer360.mcpServerDefinition-meta.xml`, outside
the shipped plugin folder.
