# Cockpit v3 — React Rebuild Spec

Status: DRAFT for build (2026-07-23). Owner: Fable (orchestrator). Builders: Opus agent (app), Sonnet agent (data + assembler). Reviewer: Codex (cross-vendor, adversarial).

## 1. Goal

Replace `artifact/customer-360-template.html` (118KB hand-maintained vanilla HTML) with a proper React application, built to a **single self-contained HTML bundle** that the existing assembler injects data into. The dashboard becomes worklist-first ("needs action" queue, ~30 rows), fully interactive, with a first-class chat panel.

## 2. Hard constraints (violating any of these = BLOCK)

1. **Cowork artifact runtime.** Output is ONE self-contained `.html`: all JS/CSS inlined, no external requests at view time (strict-CSP-safe: no CDN, no fonts, no fetch/XHR/WebSocket at runtime), images as data URIs, rendered size well under 16 MiB. Target bundle ≤ 1.5 MiB.
2. **Deterministic render discipline.** The bundle is prebuilt and versioned in the repo. At render time the assembler ONLY injects JSON. No model-generated UI code, ever.
3. **Data-source-blind UI.** The app reads `window.C360_DATA` exclusively. It never knows about MCP, Salesforce, or Boom. All live fetching is the agent's job (skill layer).
4. **devpersonal wall.** This is Accenture/banking work. NO Connectry brand tokens, templates, or assets. Neutral, self-contained design system defined in this app only.
5. **Graceful degradation.** Every interactive feature must have a defined no-channel fallback (see §7). The artifact must be fully navigable with zero agent connectivity for all staged data.

## 3. Stack

- Vite + React 19 + TypeScript.
- Tailwind (compiled, purged, inlined). shadcn-style primitives only where needed (no full kit import).
- `vite-plugin-singlefile` (or equivalent config) → `dist/cockpit.html` with everything inlined.
- TanStack Table for the worklist grid (sort/filter/virtualization).
- Charts: prefer hand-rolled SVG components (small, deterministic); Recharts allowed only if bundle stays ≤ 1.5 MiB.
- State: React context + reducers. No router; tab state in a `view` reducer. No external state libs.
- Node 20+, `npm run build` must complete clean with zero warnings treated as acceptable, zero errors. `npm run typecheck` clean.

## 4. Repo layout

```
app/
  SPEC.md            (this file)
  package.json
  vite.config.ts
  index.html          (dev shell; loads sample data in dev mode)
  src/
    main.tsx
    data/contract.ts  (TypeScript types for C360_DATA — the single source of shape truth)
    data/worklist.ts  (reason-code derivation, pure functions, unit-testable)
    channel/adapter.ts (agent channel abstraction, §7)
    components/...    (Worklist, KpiBand, tabs, Chat, primitives)
    styles/tokens.css  (neutral design tokens, §8)
artifact/
  customer-360-template.html   → REPLACED by built bundle (assembler input)
  sample-data.json             → gains full `borrowers` map (Sonnet agent)
render/
  assemble-cockpit.mjs         → v2 (Sonnet agent, §9)
```

## 5. Data contract (`window.C360_DATA`)

Existing shape stays backward-compatible; additions marked NEW.

```ts
{
  meta: { anchorAccountId, generatedAt, orgLabel, ... },
  portfolio: { totals: {...}, ews: {...}, accounts: AccountRow[] },
  borrower: BorrowerBundle,            // anchor (kept for compat)
  borrowers: Record<Id, BorrowerBundle>, // NEW: REQUIRED — staged book/worklist
  worklist: {                          // NEW (optional; derived client-side if absent)
    accountIds: Id[],
    reasons: Record<Id, ReasonCode[]>  // e.g. COVENANT_DUE, COVENANT_BREACH, MATURITY_NEAR, MODIFICATION_CLUSTER, GUARANTOR_SIGNAL, RECENTLY_MODIFIED
  },
  aiPanel: { threads: [...] }
}
```

- `src/data/contract.ts` is the authoritative type definition. Assembler v2 validates against the same rules (duplicated as plain checks in the .mjs, kept in sync manually — note the sync duty in both files).
- If `worklist` is absent, `data/worklist.ts` derives reason codes from staged bundles (covenant status/next-test dates, facility maturities, modification/guarantor signals in the structural block). Server-side (Apex) reason codes will land later and take precedence when present.

## 6. Views

1. **Home = Worklist.** KPI band on top (book totals, EWS counts from `portfolio`). Below: the needs-action queue (TanStack Table): account, reason chips, rating, TCE, next covenant test, maturity, last modified. Instant client-side sort/filter/text search. Row click → account workspace. Cap display at staged worklist; "search whole book" affordance triggers channel request (§7) for unstaged accounts.
2. **Account workspace.** Tabs, ported 1:1 in content from the current template: Exposure & Collateral, Covenants (incl. effective-challenge chips: corroborated / diverges / breach-risk), Relationship Graph, Opportunities/Whitespace, Structural Signals, Financials (Boom). Back-to-worklist breadcrumb. Cmd+K palette to jump to any staged account.
3. **Chat drawer (right).** Persistent across views. Context header shows current account + tab. Thread history from `aiPanel.threads` + session-local additions. Send → channel adapter. Suggested prompts per tab. Streaming/typing indicator states.

Design direction (locked with Fabian): **trading-desk sobriety** — dense, dark-first, KPI band top, worklist spine, sober banking voice, zero decorative gradients. Home-view mock goes to Fabian for sign-off BEFORE tab porting completes (design intent gate); build tabs behind it but be ready to restyle cheaply (tokens only).

## 7. Channel adapter (`src/channel/adapter.ts`)

The ONLY place that touches the host runtime. Interface:

```ts
interface AgentChannel {
  kind: 'sendPrompt' | 'callTool' | 'none';
  request(prompt: string, context: ChannelContext): Promise<void>; // fire-and-forget; agent replies via full artifact replace
  available(): boolean;
}
```

- Detection order at mount: `window.sendPrompt` fn → callTool relay (probe the documented global; treat as EXPERIMENTAL, wrap in try) → `none`.
- `none` mode: chat input disabled with an inline explanation; unstaged-account requests show "open this account via the agent" hint instead of a dead spinner.
- IMPORTANT: the live mechanics are marked "retest live" in our notes (July runtime changes). The adapter isolates that risk to one file. Do NOT scatter `window.sendPrompt` calls anywhere else.
- Agent replies arrive as a full artifact replace with updated `C360_DATA` (and `aiPanel.threads` extended). To survive replaces, persist ephemeral UI state (active account, tab, draft input) into `sessionStorage` keyed by `meta.anchorAccountId`, restore on mount, degrade silently if storage unavailable.

## 8. Design tokens (`styles/tokens.css`)

Self-contained, neutral, dark-first with light fallback. Semantic tokens (`--surface`, `--surface-raised`, `--ink`, `--ink-muted`, `--accent`, `--positive`, `--warning`, `--critical`, `--chip-*` per reason code). Status colors must pass WCAG AA on their surfaces. System font stack (no webfonts). All components consume tokens; zero hardcoded colors (mirrors our LWC rule).

## 9. Assembler v2 (`render/assemble-cockpit.mjs`)

- Input: built bundle (`artifact/customer-360-template.html`, which IS the React bundle post-replacement) + `--data <json>`.
- Injection: replace the marker `<script id="c360-data">/*__C360_DATA__*/</script>` with the JSON assignment. Marker must exist in the bundle; assembler errors if absent.
- **Fail-closed staging:** every account in `worklist.accountIds` (or, if absent, every account in `portfolio.accounts`) MUST have a bundle in `borrowers`. Missing coverage → exit 1 listing missing ids. `--allow-partial` downgrades to warning for deliberate single-account renders.
- JSON is embedded via `JSON.stringify` with `<`/`>`/` / ` escaping (XSS/parse safety inside a script tag).
- Keep `validate-c360.mjs` working against the same data shape (it reads `borrowers` already).

## 10. QA gates (before declaring done)

1. `npm run build` + `npm run typecheck` clean; bundle size printed and ≤ 1.5 MiB.
2. Assembler run against `sample-data.json` (with the new full borrowers map) produces a rendered HTML; open-in-browser smoke via the box preview URL.
3. Worklist derivation unit tests (`data/worklist.ts`) pass (vitest, minimal set: each reason code fires on a crafted bundle, none fires on a clean one).
4. Zero-channel mode manually verified: rendered file opened with no host globals shows full staged navigation + disabled chat with explanation.
5. Deslop pass on all new code.
6. Codex round 2 review of the built code; findings verified, CONFIRMED ones fixed.

## 11. Out of scope (this slice)

- Apex worklist params / server-side reason codes (next slice; client-side derivation is the interim).
- Write actions (v2 gated writes) — but component architecture must not preclude action buttons later.
- KYC/onboarding surface.

## 12. v1.1 AMENDMENTS (post Codex round 1, verified — BINDING, override earlier sections on conflict)

A1. **Canonical portfolio fields are `portfolio.bookTotals` and `portfolio.signals`** (verified against sample-data.json). There are NO `totals`/`ews` fields. KPI band and derivations read the canonical names. No aliases, no normalization layer.
A2. **Build output path is explicit.** `npm run build` → `dist/cockpit.html` (configured, not renamed by hand). A separate `npm run release:artifact` copies it to `artifact/customer-360-template.html` and asserts the data marker occurs EXACTLY once. The assembler also asserts marker count == 1.
A3. **Inert data slot.** The marker becomes `<script id="c360-data" type="application/json">/*__C360_DATA__*/</script>`. A small static bootstrap in the app parses it into `window.C360_DATA` at startup. Assembler injects escaped JSON text (escape `</`, U+2028/U+2029). (Note: inline execution empirically works in this runtime — the legacy artifact proves it — this is robustness, not a CSP requirement.)
A4. **Assembled-size gate.** Assembler measures final output bytes; fail > 8 MiB (conservative vs the ~16 MiB host cap), reporting code bytes vs data bytes separately. The 1.5 MiB gate applies to the pre-data bundle.
A5. **Validation stage is mandatory in assembler v2.** v1 calls `validateC360(data)` before injection (assemble-cockpit.mjs:70) — v2 MUST keep that stage and extend it across all staged bundles; add a regression fixture asserting covenant-challenge + data-quality output is present in the injected data.
A6. **Structural fail-closed.** `borrowers` must be a plain non-array object; membership via `Object.hasOwn`; an own entry for `meta.anchorAccountId` is ALWAYS required; empty `worklist.accountIds` does NOT bypass coverage (empty/absent worklist ⇒ full `portfolio.accounts` coverage required); every referenced bundle must at minimum carry `snapshot.accountId` matching its key.
A7. **One executable rule-set.** Coverage/shape checks live in `render/contract-checks.mjs`, imported by the assembler AND unit-tested. `contract.ts` mirrors it for types with an explicit sync note in both files (pragmatic scope; no codegen).
A8. **Referential integrity by construction.** The assembler DERIVES top-level `borrower` from `borrowers[meta.anchorAccountId]` (input `borrower` ignored if both present; error if they diverge structurally). Worklist ids must be a subset of `borrowers` keys.
A9-EXCEPTION (adjudicated 2026-07-25): **CLIENT_REQUEST merges additively onto server reasons** — the server worklist is nCino-derived and has no visibility into the M365 request channel, so its silence on CLIENT_REQUEST is absence of knowledge, not a judgement. Scope: additive only, never removes/reorders server reasons, only this presence-derived code; becomes a no-op once Apex emits CLIENT_REQUEST itself.

A9. **Server reason-code precedence is per-account:** an own `worklist.reasons[id]` entry replaces derivation for that id; absent entry ⇒ derive; explicit `[]` ⇒ reviewed/no reasons (row may still appear if in accountIds).
A10. **Deterministic clock + thresholds.** All time-based reasons compute against `meta.generatedAt` (UTC, ISO parse) — never `Date.now()`. Thresholds (inclusive): COVENANT_DUE ≤ 45d, MATURITY_NEAR ≤ 270d, RECENTLY_MODIFIED ≤ 30d, MODIFICATION_CLUSTER ≥ 3 modifications in 180d. Unit tests cover boundary days.
A11. **Worklist column mapping table** (exact paths; missing source renders an honest "—", never a fabricated value): account = `portfolio.accounts[].name`; rating = `.riskRating`; TCE = `.tce`; next covenant test = earliest `nextEvaluationDate` across active covenants in the bundle; maturity = earliest active facility maturity in the bundle; last modified = NOT AVAILABLE in current data → render "—" until Apex provides it.
A12. **aiPanel schema:** `{ threads: [{ id, title, messages: [{ id, role: 'user'|'agent', text, ts, context?: {accountId, tab} }] }] }`. Merge on message `id`; locally echoed user messages carry a client-generated id so a replacement containing the same id dedupes.
A13. **Chat renders plain text only** (pre-wrap). No HTML, no raw-HTML Markdown, no dangerouslySetInnerHTML anywhere in the app.
A14. **Channel contract:** `window.sendPrompt(text: string)` as a DIRECT child global (empirically proven by the legacy artifact). Adapter re-detects at every `request()` call, not only at mount. callTool relay remains EXPERIMENTAL behind try/catch; unknown shape ⇒ treat as unavailable.
A15. **Chat lifecycle:** states are `idle → sending → handedOff | error` only. No fake streaming UI. Send button disabled while sending; each request carries a client-generated request id in its context string.
A16. **Storage is best-effort.** Versioned `uiState` blob (version, activeAccountId, activeTab, draft, ts) in sessionStorage; on restore: validate account is staged and tab is a known enum, else fall back to anchor/default; expire after 24h; all storage ops in try/catch.
A17. **Unstaged rows in `none`-channel mode:** visibly marked (muted + "not staged" chip), click opens an explainer (copy-prompt fallback like the legacy template), NEVER an empty workspace. Test the `--allow-partial` + no-channel combination explicitly.
A18. **Single-file hardening:** no `public/` dir, sourcemaps off, CSS splitting off, no dynamic imports; QA asserts exactly ONE file in dist and greps the bundle for external `src=`/`href=`/`url(` references (data: URIs excluded).
A19. **Dev-only sample data:** loaded strictly behind `import.meta.env.DEV`; QA asserts the sample filename and `fetch(`/`XMLHttpRequest` do not appear in the built bundle (the bootstrap's JSON parse is the only data path).
A20. **No interpolated Tailwind classes.** Reason chips and status colors come from a complete static enum→class/token map.
A21. **No virtualization.** ~30 worklist rows render plainly; drop `@tanstack/react-virtual` from the plan (TanStack Table does not bundle it anyway).
A22. **Pinned toolchain.** Exact versions in package.json + committed lockfile; engines field (Node ≥ 20.19); `npm ci` in QA.
A24 (FOUNDER DECISION 2026-07-23). **Light theme, like-for-like with the legacy artifact.** The dark "trading-desk" direction is DROPPED. Cockpit v3 carries the legacy/Accenture-reference look: light surfaces (radial `#FBFAFE → #F4F3F8` background), frosted sticky nav (`rgba(244,243,248,.72)` + backdrop blur), the legacy accent variable, and the **Accenture nav chrome restored verbatim**: inline Accenture wordmark SVG (port `accentureLogo()` from the legacy template) + divider + "Commercial Credit 360" title + user name/date/initials block right-aligned. The ">" watermark accent on cards is ported with the tabs. §8's "dark-first" wording is superseded; tokens stay semantic, values go light. devpersonal wall clarification: it bans CONNECTRY assets only — Accenture engagement branding BELONGS in this artifact.

A25 (FOUNDER FEEDBACK 2026-07-24, polish round). Keep the light design; raise polish + reactivity: (1) fix Accenture wordmark spacing top-left — the ">" accent sits too close to the wordmark; match the official logo's spacing. (2) The customer-profile ">" watermark uses a WRONG rounded chevron — replace with the sharp Accenture ">" glyph (same path as the nav logo accent), and give the profile header a SUBTLE cinematic ambient background behind it (slow CSS-only gradient drift, respects prefers-reduced-motion, no external assets). (3) Strict grid alignment: all cards share edges/gutters, no one-sided overhangs. (4) Micro-interaction/reactivity pass everywhere (animated KPI count-up, staggered row entrance, smooth tab cross-fade, hover elevation, animated dials). (5) RESTORE the legacy action buttons — "Draft Credit Memo" and "Generate Spreads" — in the account verdict bar, wired through the channel adapter (sendPrompt when live, CopyPromptDialog fallback), overriding §11's omission; the buttons TRIGGER the agent, they do not write.

A26 (FOUNDER MANDATE 2026-07-24). **Every displayed data point must be live-updatable from the integrations — no decorative fields.** Enforcement: (1) `contract.ts` carries a PROVENANCE map — every `C360_DATA` field annotated with its source system + tool (nCino/Salesforce via Customer360 Apex tools; Boom via boom_get_spread/ratios; Snowflake for rating/PD when it lands (AFS as a later servicing-behavior source); NAMING RULE: the rating/PD platform is called "Snowflake" — NEVER "IRIS" (Truist-internal name, banned in all bank-agnostic work); DERIVED for client-computed values with their formula; GAP for fields with no source yet, which must render "—"). (2) No component may render a business figure that does not come from `C360_DATA` or a pure derivation of it — zero hardcoded business literals in components (QA grep + review). (3) The skill's fetch sequence must populate every non-GAP field from its declared source at render time; a field whose fetch fails renders the honest-gap state, never a stale/invented value. Codex round 2 reviews against this lens explicitly.

A27 (FOUNDER DIRECTION 2026-07-25). **Action surface: chat FAB + Client Actions control center.**
1. **Chat becomes a floating action button (FAB)**, bottom-right, page-agnostic (present and stateful on home AND every tab; thread survives view switches). Polished accent FAB (subtle glow/scale on hover, badge when the agent replied), expands into the chat panel; the persistent right drawer is retired. Canvas gets the full width back.
2. **Action Registry** (`src/actions/registry.ts`) — single source of truth for every client action: `{ id, label, category, description (1-2 sentences of banker language), icon, availability: (data, accountId) => { available: boolean, reason?: string }, promptTemplate, apexAction?: { tool, params } }`. The `apexAction` field is the PLANNED SEAM for nCino/Salesforce Apex invocables via the MCP server (v2 gated writes, stage→approve) — declared now, wired later; until wired, every action routes through the channel adapter as a well-formed agent prompt.
3. **Availability is data-driven and honest (the nCino lifecycle rule):** predicates read ONLY C360_DATA — e.g. Loan Modification/Renewal require ≥1 booked ACTIVE facility; Spreading requires Boom financials present; Covenant Review requires covenants; Collateral Valuation requires pledged collateral; Credit Memo requires an active package. Unavailable actions are VISIBLE but disabled with the explicit reason ("No booked loans on this relationship") — control-center honesty, mirroring how nCino gates lifecycle actions. Never hide, never enable what the data can't support.
4. **Client Actions panel:** a subtle "Client Actions" button in the header opens a right side panel (same styling family as chat): actions grouped by category (Analyze / Originate / Service / Risk), each row = icon + name + description + state; clicking an available action routes its promptTemplate through the channel adapter (copy-prompt fallback standalone). The verdict-bar buttons are REPLACED by this (Draft Credit Memo + Generate Spreads move into the registry as the first two actions).
5. **Chat action suggestions:** context-aware chips above the chat input, computed from the registry (available actions for the current account/view) plus data signals (covenant breach ⇒ suggest Covenant Review; maturity near ⇒ suggest Renewal). Click = sends the action prompt. This is client-side intelligence now; agent-driven suggestions ride the same chip UI once the channel is live.
6. v1 action set: Generate Spreading, Draft Credit Memo, Loan Modification, Renewal, Covenant Review, Collateral Valuation, Annual Review, Risk Rating Review, New Facility Request, Create Service Request. All A26 provenance/honesty rules apply to availability reasons.

A28 (FOUNDER FEEDBACK 2026-07-25). **Rating element redesign + rating/stage separation.** The Rating/Grade block in the account header looks dated and misplaces the data model: risk rating is a CUSTOMER-relationship attribute (Snowflake-owned later); stage is a PRODUCT-PACKAGE lifecycle attribute. They must not read as one stacked unit. (1) Redesign the rating as a first-class, modern element integrated into the profile header line: refined badge/pill in the header's type system, subtle grade-scale context (e.g. minimal 1-10 position indicator), status-toned, aligned to the header grid, provenance-honest (rating value only; PD/migration stay GAP chips until Snowflake lands). (2) MOVE stage out from under the rating: it lives with package context (verdict bar / exposure area as a small lifecycle chip labeled as the package's stage), or is omitted from the header if no clean home exists. Rating sits with the customer identity; stage sits with the deal.

A29 (PLANNED, NOT BUILT — 2026-07-25). **Inbound client requests (M365 channel).** Future: client emails ("increase my loan 200K→1M") arrive as first-class requests on the relationship — new ReasonCode CLIENT_REQUEST in the worklist, a Request card in the workspace (ask + email reference + agent-prepped brief with verdict/headroom/recommended path), actions pre-parameterized from the request. Contract seam reserved: optional `requests[]` per account (see knowledge/projects/company-brain/customer-360-mcp/INBOUND-REQUESTS-DESIGN.md in the brain). Depends on M365/Graph intake + v2 `stage_service_request` write. Nothing in the app may fabricate or mock this surface until the intake exists.

A30 (FOUNDER DIRECTION 2026-07-25). **Activity tab — first tab on every account: audit trail + concluded analysis + client requests.**
1. **Position:** FIRST tab in the account workspace, before Exposure. It is the account's narrative spine: what happened, what the analysis concluded, what to do next.
2. **Content = typed activity timeline** from `activity[]` in the contract (new optional per-account array): `{ id, ts, kind, title, summary, reference?, detail? }`. Kinds v1: REQUEST_RECEIVED (client-driven request, carries the A29 request reference — email id/webLink when the M365 intake exists), ANALYSIS_CONCLUDED (the C360 verdict for this account, AGENT provenance), COVENANT_EVALUATED, FACILITY_MODIFIED, RENDER/AUDIT events. Every entry provenance-typed: record-derived events = NCINO/DERIVED; verdict/brief = AGENT. Missing activity ⇒ honest empty state, never invented history.
3. **Detail popup ("the sexy popup"):** clicking an entry opens a refined modal (FloatingPanel family: focus-trapped, Esc, focus-return) holding the full content — for a request: the ask, source reference, the prepped analysis (verdict, headroom, risks); for an analysis: the full verdict + reasoning; ALWAYS ending in **Suggested next steps**.
4. **Next steps are SHARED STATE, not popup copy:** `detail.nextSteps[]` entries reference registry action ids (`{ actionId, note }`). The SAME data feeds (a) the popup's next-step buttons (which trigger the registry action, availability-gated as always), (b) the chat suggestion chips, (c) the Actions panel highlighting. One source, three consumers — the chat "knows" the next steps because they are data, not prose.
5. **A29 clarification:** the UI may render `requests[]`/`activity[]` NOW from the contract; what remains forbidden is fake M365 WIRING. Sample data may carry one clearly-synthetic client request on an invented sample account (the "increase 200K→1M" scenario) exactly as it carries synthetic covenants — the live intake later populates the same fields for real.

A31 (FOUNDER FEEDBACK + PRODUCT PRINCIPLES 2026-07-25).
1. **Modal stacking fix:** activity popups must render ABOVE the sticky nav (portal to root, z-index above the nav's 60; no clipping under any header). Regression test or explicit z-token so this never recurs.
2. **Next steps render ONLY when present.** A30.3's "always ends in next steps" is amended: the section renders only if resolved nextSteps exist. A REQUEST_RECEIVED entry without its own nextSteps shows no empty section (the analysis entry carries them).
3. **User-driven actions are activity too.** New activity kind ACTION_TRIGGERED: when the banker triggers a registry action (Draft Credit Memo, Generate Spreads, ...), a session-local activity entry appears in the timeline, VISUALLY DISTINCT from client/system entries (user-toned marker, "You · just now" attribution, e.g. neutral/violet left rule vs the accent client-request rule). Session-local until the v2 write/audit path persists them (then log_audit_event-backed); never fabricated as historical.
4. **Client Actions trigger:** one step MORE prominent than the ghost state — subtle accent (purple) treatment: accent-tinted text/border or soft accent wash, still quiet, has to look genuinely good. Between the old bordered button and the current ghost.
5. **PRODUCT PRINCIPLE (standing, applies to everything from now on):** the action/workflow layer is BANK-AGNOSTIC BY DESIGN. Each bank has its own rules (e.g. whether a modification subsumes collateral valuation, approval chains, action taxonomies). Therefore: action definitions, availability predicates, and workflow composition rules must trend toward CONFIGURATION (a bank-policy layer), not hardcoded logic. Concrete future decision explicitly parked: modification-subsumes-valuation is a bank rule, not a product rule. This accelerator is becoming a product — every design decision should ask "is this the product's rule or the bank's rule?"

A32 (ARCHITECTURE FINAL — live-proven 4/4 by founder click-test, 2026-07-25). **The cockpit is a capability-declared Live Artifact on `window.claude.mcp`.** Confirmed on the founder's account: runtime serves the capability; connectors resolve as "Customer 360" (plain Apex-class tool names), "IDB Gateway", "Microsoft 365"; all invocations silent (main chat untouched); envelopes observed and canonical (Salesforce invocable wrapper with positional `outputValues`; gateway body-string wrapper for `get_llm_response` with `{prompt}` input; `outlook_email_search` `{query}` with honest `[]`). Chat = grounded `get_llm_response` prompts (plain-text render, A13 holds). Actions = direct `callTool` where tools exist; write-shaped actions stay analysis-only until the v2 Apex tools land, then map to `callTool` targets. Mailbox intake runs viewer-side at view time. Copy-prompt dialog survives ONLY as the no-capability fallback. `sendPrompt` paths are dead. The MCP-App widget route is ARCHIVED as fallback (dossier). Error handling follows the platform contract's code-branching doctrine; freshness UI from `result.cache.storedAt`, never `Date.now()`.

A23. **Sandbox harness in QA:** render the assembled file inside a sandboxed iframe via `srcdoc` WITHOUT `allow-same-origin` (Playwright) and assert: app mounts, worklist renders, no external network requests, storage denial does not crash. The FINAL gate remains a live Cowork publish/replace test with Fabian (moved INTO scope as the last step).
