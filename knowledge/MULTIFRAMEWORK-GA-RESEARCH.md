# Salesforce Multi-Framework GA — Research + EWS Deployment Strategy (2026-08-13)

Context: Truist EWS prototype (Noland's artifact, `brain/incoming/noland-ews-drop/truist-ews-artifact.html`,
published https://claude.ai/code/artifact/66ef7e95-c5ee-4a4e-a105-0a3c9abff0b1). Question: deploy the EWS
dashboard into Truist's Salesforce as a React component + surface it in coworking platforms via the new
multi-framework support. Research by research-agent from primary Salesforce sources, 2026-08-13.

## Verified facts (primary sources)

- **Salesforce Multi-Framework GA 2026-07-16** (beta at TDX 2026-04-15). React only today (Angular next).
  Runs on "Headless 360" platform. Summer '26+, **Hyperforce orgs only**, English-default org, editions
  Enterprise/Performance/Unlimited/Developer/Partner Dev. Namespaced orgs unsupported.
- **Deployment:** `UIBundle` metadata (+ `CustomApplication` for internal apps → App Launcher tile +
  SF mobile app; or `Experience` for external via Experience Cloud site, NOT Experience Builder editable).
  Vite build, standard `sf project deploy`, ≤2,500 files/bundle. Each app on its own origin:
  `https://<org>--<ns>.<instance>.my.salesforce.app/app/c__<bundle>`.
- **NOT possible today:** record pages, App Builder drag-drop, utility bar (that's "Micro-Frontends",
  developer preview / roadmap). **Packaging unsupported** → no managed package, no AppExchange path yet.
- **Data:** `@salesforce/platform-sdk/data` (`createDataSDK()`): GraphQL `query()`/`mutate()` preferred;
  Apex ONLY via `dataSdk.fetch()` → `/services/apexrest/...` (allowlisted SF endpoints only). No `@wire`,
  no LDS, no lightning base components; styling manual (SLDS classes / design-system-react / own system).
- **Security:** explicitly "managed externally; developers must implement custom security best practices"
  — opposite of LWC/LWS automatic model. LWS applicability: not documented (likely N/A, own origin) —
  UNVERIFIED. Browser fetch to third-party APIs (e.g. api.anthropic.com): CSP behavior UNVERIFIED — test
  in scratch org; CORS on provider side also needed.
- **Headless/portability:** UIBundle is NOT portable off Salesforce; roadmap arrow is the reverse
  (external React INTO Lightning via Micro-Frontends). No official connection between Multi-Framework /
  Headless 360 and MCP Apps / Claude Cowork / ChatGPT Work. What IS embeddable outside Salesforce:
  Agentforce Conversation Client on Lightning Out 2.0 (agent chat widget, not full apps).
- **Salesforce's own React-vs-LWC guidance:** React = share components across SF and non-SF surfaces +
  React ecosystem; LWC = @wire/LDS, base components, App Builder, automatic security.

Sources: developer.salesforce.com blogs 2026/04 + 2026/07 (multi-framework beta/GA) and
docs/platform/multiframework/guide/* (overview, setup, integrate, lwc-diff, styling, acc, data-sdk).

## Strategy verdict (agreed direction, 2026-08-13, pre-build)

- **Salesforce half: GOOD FIT.** The EWS prototype is a standalone full-screen cockpit launched from FSC
  home ("Launch EWS →") — exactly what Multi-Framework GA supports. Plan: React UIBundle +
  CustomApplication for the cockpit; small ordinary LWC for the FSC-home banner/launch card. Record-page
  embedding is the one gap (LWC rebuild or wait for Micro-Frontends if Truist requires it).
- **Coworking half: RIGHT GOAL, WRONG VEHICLE.** Multi-Framework gives zero portability to Claude
  Cowork/ChatGPT. Correct vehicle = the June SURFACES-VALIDATION.md architecture: **one React component
  core, two shells** — (A) UIBundle shell + Data SDK adapter inside Salesforce; (B) MCP App widget shell
  (strict MCP Apps subset) fed by the Customer 360 MCP server (per-user OAuth, WITH USER_MODE).
- **AI Copilot:** never call api.anthropic.com from the browser in production — server-side gateway
  (Apex REST + Named Credential, or Truist's approved model gateway / Agentforce). In coworking hosts the
  host agent IS the copilot; the dashboard is its widget.

## Load-bearing unknowns → ask Truist / Salesforce before committing

1. Truist org: Hyperforce? English-default? Eligible edition? Non-namespaced? (any "no" kills MF)
2. Truist AppSec stance on a Salesforce-hosted-but-developer-secured React app (no LWS guarantees).
3. Placement requirement: is "standalone app from App Launcher/FSC-home banner" acceptable, or do they
   require record-page embedding?
4. Empirical scratch-org spike: UIBundle deploy + GraphQL pull + external-fetch CSP behavior (1 day).

## Phasing (agreed, nothing built yet)

Phase 0 qualify (unknowns + spike) → Phase 1 Salesforce (component lib + UIBundle shell + LWC banner +
GraphQL data layer + server-side copilot gateway) → Phase 2 coworking (MCP App widget shell over same
component lib + Customer 360 MCP server). Deferred: AppExchange packaging (blocked by platform),
record-page embedding (Micro-Frontends preview).
