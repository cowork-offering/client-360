# Customer 360 MCP — Session Handover (2026-06-28, Fabian)

## Objective
Build a NEW **Customer 360 MCP** for the Accenture Commercial Credit Brain — the **relationship-level
twin** of the deal-level credit memo. Part of the extended brain Fabian + Noland are shaping; a
different MCP server that complements the existing fleet. We are in the **design/brainstorm** phase
(no code yet). Immediate blocker (live FSC schema access) is now CLEARED.

## What it is
- **Deal 360** (exists) = `deal_show_summary` + credit memo, one nCino Product Package.
- **Customer 360** (new) = zoom OUT to the whole customer: entities, all facilities, deposits, risk,
  whitespace. Owner = relationship manager / portfolio manager. Surface = a live **Relationship
  Cockpit** widget in Claude.

## DECISIONS LOCKED THIS SESSION
1. **Host = Salesforce-native custom-hosted MCP** (Apex / Flow / Named Query), NOT our Vercel fleet
   pattern. Fabian's call.
2. **FSC + nCino are CO-RESIDENT in ONE Salesforce org → ONE MCP.** Doctrine cuts by auth boundary,
   not schema. nCino = `LLC_BI__*` managed package; FSC = standard/`FinServ__*` objects; both reachable
   under one org identity. The new SF MCP reads BOTH = the relationship SPINE.
3. **Cross-source (Boom / AFS / Snowflake — all OUTSIDE Salesforce) joins stay at our existing
   `experience-mcp` tier** (governance, brand, decision ledger). The FSC↔nCino join is single-system →
   lives in the new server. Verified the aggregation mechanism in code:
   `experience-mcp/src/boomFinancials.js` does `fetch(BOOM_MCP)` server-side ("the number never passes
   through the LLM"). So the cockpit CONCLUDES from the whole fleet — complements Noland's stack,
   replaces nothing.
4. **Roles = view config + permission layer, NOT separate servers** (doctrine: don't cut by role).
   Cockpit is role-aware with two drill levels: book view → single-customer 360. Personas: RM,
   portfolio manager, credit officer (scalable to more). Maps to Salesforce custom-hosted MCP's
   "assemble a focused tool set per persona".
5. **Widget rendering** (research #2 resolved): Salesforce custom-hosted MCP servers serve TOOLS/DATA
   ONLY, not UI. UI layer = **AXL (Agentforce Experience Layer)**, which DOES render in Claude
   ("build once, render everywhere"). RECOMMENDATION: cockpit served by **our experience-mcp** as a
   `ui://` MCP-App today (exact brand + already fetches the external sources server-side); **AXL = the
   native-rendering roadmap track + demo artifact**.
6. **Brand**: reuse `BANK` config + `brand-tokens.css` + classification banner (Accenture violet
   `#a100ff`), matching the credit memo / reinvented styling.

## Cockpit sections (the live dashboard)
relationship header (total exposure + profitability) · entity & ownership graph · exposure across all
nCino facilities · deposits / treasury share-of-wallet (FSC) · Boom financial snapshot · risk &
covenants · whitespace / next-best-action · alerts / EWS. Cross-links to the credit memo (zoom out /
drill in). On the functional blueprint it lights Prospecting + Sales ("the single customer view") and
feeds Servicing & Monitoring.

## Tool surface (object-anchored, to VERIFY live next session)
| Section | Tool | Objects |
|---|---|---|
| Header | `customer_360(accountId|householdId)` | Account, Household, LLC_BI__Account__c |
| Entity graph | `relationship_entities` | AccountAccountRelation / FinServ__*, ReciprocalRole |
| Exposure | `relationship_exposure` | LLC_BI__Loan__c, LLC_BI__Product_Package__c, TCE/TBE/TOE rollups |
| Deposits / wallet | `deposits_and_treasury` | FinancialAccount, FinServ__FinancialAccount__c |
| Risk & covenants | `relationship_risk` | LLC_BI__Risk_Rating__c (+ Snowflake grade grafted at experience-mcp) |
| Whitespace / NBA | `relationship_opportunities` | Opportunity, FSC product holdings |

## ACCESS STATE (the big unblock)
- **`sobject-sf` MCP connector = ✔ CONNECTED** (box-local, user scope, Fabian's own External Client
  App). This is the raw Salesforce sObject reader against the **bankinggpt sandbox** — gives live
  `describe` / SOQL on FSC + nCino objects.
- It is registered at user scope on archy. **Its tools only load at SESSION START** — that's why we
  need a fresh session to use them.
- Other connectors: Boom / AFS / Experience-nCino = ✔ Connected (curated fleet).
- The hard-won SF-hosted-MCP auth runbook is saved in the brain (tag `sf-mcp-auth`). Key gotchas:
  server requires **JWT-format access tokens** (enable "Issue JWT-based access tokens" on the ECA) +
  scope **`mcp_api`** (NOT included in `full`); over SSH the loopback needs `ssh -L 7524:localhost:7524`
  and ECA callback `http://localhost:7524/callback`.

## IMMEDIATE NEXT STEPS (new session)
1. Verify `sobject-sf` tools are loaded (ToolSearch "salesforce sobject describe query").
2. Live-`describe` the FSC + nCino objects above → capture real field API names.
3. Anchor the tool surface to verified fields; note which fields are FSC-standard vs `FinServ__*` vs
   `LLC_BI__*`.
4. Write the proper `customer-360-mcp` concept doc (style of `credit-memo-reinvented/docs/architecture/`).

## OPEN QUESTIONS
- Confirm with Noland: when he said "the MCP server" he connected, did he mean our Experience/nCino
  (Vercel, service-account) — assume yes.
- AXL vs experience-mcp-served cockpit — leaning experience-mcp-served; revisit when widget design starts.
- Does the Salesforce-native custom-hosted MCP (Apex/Flow) actually serve `ui://`? (No — confirmed
  tools-only; widget lives elsewhere.)

## KEY PATHS / SOURCES
- Existing fleet: `/opt/connectry/projects/commercial-credit-reinvented/` (6 repos; doctrine in
  `credit-memo-reinvented/docs/architecture/decomposition-doctrine.md`).
- Functional blueprint: `/opt/connectry/brain/preview-site/truist-brain/index.html?view=functional`
  (Phase-1 built stage = Credit Analysis = Boom + Credit Memo).
- Demo deal: Piedmont, bankinggpt sandbox, Account `001bb00001DLtRMAA1`,
  `https://bankinggpt.lightning.force.com`.
- Research #1 (SF MCP hosting, 4 paths, Claude-compatible, AXL) + #2 (widget layer) — brain tags
  `mcp-salesforce`, `customer-360-mcp`, `sf-mcp-auth`.
