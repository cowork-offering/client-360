---
name: customer-360-cockpit
description: Open the Customer 360 relationship cockpit for a commercial borrower — the live, account-level relationship view. Fetches the customer/obligor group from Salesforce (nCino + FSC) via the Customer360 MCP server plus Boom-spread financials, then renders an interactive Cowork artifact (ownership graph, exposure & collateral, covenants, whitespace, structural early-warning signals) with an "Explain this" AI panel. Trigger on "customer 360", "open the cockpit", "pull up the relationship view", "relationship overview for <account>", or any account-level portfolio question.
---

# Customer 360 Cockpit

Render a live relationship-level credit cockpit as a **Cowork artifact**. The agent fetches every
figure from MCP tools and bakes it into `window.C360_DATA`; the artifact renders that JSON — it never
fetches. Interactivity flows back through `window.sendPrompt(...)` → agent re-fetches → `update_artifact`.

**Demo anchor:** Piedmont Precision Components, Inc. · Account `001bb00001DLtRMAA1` · org `bankinggpt`.

## STEP 0 — WAIT for the Customer360 server (before anything else)

MCP servers connect lazily; at session start `customer360` often shows "still connecting". You MUST:
1. Call ToolSearch with query "Customer360Snapshot" — ToolSearch WAITS for connecting servers.
2. If no match, wait and retry ToolSearch up to 3 more times (it blocks on connecting servers; a
   Salesforce OAuth token refresh can take ~10-30s).
3. Only if the server is terminally failed/unauthenticated after retries: STOP and tell the user to
   authenticate (`/mcp` → customer360 → Authenticate) or check the README config. Do NOT proceed.

## HARD RULE — no fallback data sources (this overrides being helpful)

If the Customer360 MCP tools are NOT available in the session (server disconnected, still
connecting, or shadowed by a stale plugin-bundled duplicate named `plugin:customer-360-reinvented:customer360`),
**STOP and tell the user to fix the connection** — an error message IS the correct deliverable here (README: user-scope `~/.claude.json` entry with
oauth.clientId; plugin >= v0.1.3 has no bundled server). Do NOT render the cockpit from
`ncino_deal_prep`, sObject SOQL, or any other source. Reason: those paths sum loan amounts, which
double-counts nCino limit/sublimit structures (Piedmont: 3 loans sum to $17.5M vs true package-level
TCE $12.5M). Package-level rollups exist ONLY in the Customer360 tools. A wrong committed-exposure
figure in front of a banker is worse than an error message.

## The two MCP surfaces

**Customer360** — Salesforce-hosted MCP, per-user OAuth (auto-connected by this plugin's `mcpServers`).
8 read-only tools. **Client-side tool names are derived from the `apiIdentifier` `aa:apex-{ClassName}`**,
so each tool surfaces as its Apex class name (the host may namespace it, e.g. `customer360__Customer360Snapshot`
or `Customer360Snapshot` — match by the class-name suffix, don't hardcode a prefix):

1. `Customer360Portfolio` — **the whole L1 Portfolio Home in one call** (accounts[], bookTotals, signals). Use this for the portfolio view; see below.
2. `Customer360SearchAccounts` — name-based account lookup only (open-by-name)
3. `Customer360Snapshot` — per-account rollup (rating, stage, revenue, TCE/TBE/TOE, outstanding, packageCount)
4. `Customer360RelationshipGraph` — connections[], legalEntities[], note
5. `Customer360Exposure` — totals + facilities[] each with collateral[]
6. `Customer360Covenants` — covenants[], note
7. `Customer360Opportunities` — opportunities[], note
8. `Customer360StructuralSignals` — modifications[], modificationClusterFlag, renewals[], maturityWatch[], guarantorSignals[], note

### `Customer360Portfolio` response shape
One call serves the entire L1 home (replaces the SearchAccounts + N×Snapshot loop). Request (all
optional): `industry` (exact picklist), `maxAccounts` (default 25, cap 100), `signalWindowDays`
(default 90). `response[0]` returns:
- `accounts[]` — one row per account with ≥1 Product Package, **already sorted tce desc, truncated to
  maxAccounts**: `{ accountId, name, industry, naicsCode, annualRevenue, tce, tbe, toe, outstanding, riskRating, stage, packageCount }`. Same package-level rollup + highest-TCE-package primary rule as Snapshot.
- `bookTotals` — `{ totalCommitted (Σtce), totalOutstanding, accountCount, utilizationPct (setScale 1, null when Σtce=0) }`. **`accountCount` spans ALL packaged accounts, not just the truncated list.**
- `signals` — bounded book-wide EWS:
  - `covenantsDueSoon[]` (cap 25) — `{ accountId, accountName, covenantType, nextEvaluationDate, daysUntilNextEvaluation, overdue }`, soonest-first, within `signalWindowDays`.
  - `breachedCount` — active + breached covenants across the whole book.
  - `maturitiesSoon[]` (cap 25) — `{ loanId, loanName, accountId, accountName, maturityDate, daysUntilMaturity }`, open loans maturing inside the window.
- `note` — provenance/empty-state caption.

**Boom** — `boom_get_ratios` + `boom_get_spread` for the Financials tab.

## Fetch sequence (MAPPING.md §4)

1. **L1 Portfolio Home: one `Customer360Portfolio` call** → `accounts[]` + `bookTotals` + `signals`.
   That single call replaces the old SearchAccounts + per-account Snapshot loop and also feeds the
   reviews-due / EWS ribbon cells (`signals.covenantsDueSoon`, `breachedCount`, `maturitiesSoon`).
   Use `Customer360SearchAccounts` **only** for name-based lookup ("open Customer 360 for <name>");
   use `Customer360Snapshot` for the per-anchor detail rollup below.
3. Anchor account, all six: `Snapshot` + `RelationshipGraph` + `Exposure` + `Covenants` + `Opportunities` + `StructuralSignals` (pass `maturityWindowDays: 270`).
4. Boom: `boom_get_ratios` + `boom_get_spread` for the borrower. If either fails, set `borrower.boom = null` — do not fabricate.
5. Compose `verdict` + `anchors` from live figures only → bake `C360_DATA` → render artifact.
6. On `sendPrompt` events: re-fetch only what changed → `update_artifact` (full replace).

## The C360_DATA contract (MAPPING.md §1)

```js
window.C360_DATA = {
  meta: { user, dateISO, generatedAt, orgAlias: "bankinggpt", anchorAccountId },
  portfolio: {   // from Customer360Portfolio response[0] — accounts[] + bookTotals + signals, verbatim
    accounts: [{ accountId, name, industry, naicsCode, annualRevenue,
                 tce, tbe, toe, outstanding, riskRating, stage, packageCount }],
    bookTotals: { totalCommitted, totalOutstanding, accountCount, utilizationPct },
    signals: { covenantsDueSoon: [...], breachedCount, maturitiesSoon: [...] } },
  borrower: {
    snapshot, graph, exposure, covenants, opportunities, signals,   // raw tool responses, VERBATIM
    boom: { ratios, spread } | null,
    verdict,   // agent-composed banker's sentence, live figures only
    anchors,   // [{ label, value, sub, dir }] agent-composed from live figures only
    aiPanel: { componentId, thread: [{ q, a }] } | null   // §4b, see below
  }
}
```

- Embed tool responses **verbatim** — field names unchanged, no re-shaping of figures. The artifact
  reads what the server returned. Portfolio ribbon totals now come **server-side** in
  `portfolio.bookTotals` (from `Customer360Portfolio`); book concentration is still computed
  client-side from `accounts[]`. Never hand-author either.
- The agent composes **only** `verdict`, `anchors`, and any agent-composed watch banners — always from
  live figures, citing nothing invented.

## Render as a Cowork artifact

1. Read the template at `artifact/customer-360-template.html` (relative to plugin root; built in parallel).
2. Inject the `C360_DATA` JSON into the `<script id="c360-data">` slot (replace its contents wholesale).
3. `create_artifact` with the resulting HTML.
4. **Do NOT open a Chrome tab.** Do NOT call any other widget/HTML builder. The artifact is the deliverable.
5. Updates are **full-replace** only — re-inject the whole `C360_DATA` and `update_artifact`.

## sendPrompt interaction loop

Artifact buttons/rows fire `window.sendPrompt(...)`. Handle each payload, then re-render via `update_artifact`.

**Payloads to handle:**

- **Account switch** — `"Open Customer 360 for <name> (<accountId>)"` (portfolio row click / L1 home).
  → Full re-fetch of that account (steps 3–4), rebuild `C360_DATA`, `update_artifact`.
- **`"Draft the credit memo for <name> (<accountId>)"`** (verdict-bar button) → hand off to the credit-memo flow.
- **`"Generate the financial spread for <name>"`** (verdict-bar button) → the Boom spread flow.
- **"Explain this" AI panel** (MAPPING.md §4b) — payload is a JSON string:
  ```
  { type: "explain", component: "<id>", question: "<text>" }
  ```
  `component` ∈ `{ overview, relationships, exposure, deposits, pnl, financials, risk, kyc, opps, verdict }`.
  On receipt:
  1. Answer grounded **ONLY** in the already-fetched live data. You MAY re-call Customer360/Boom
     tools for depth — never invent.
  2. Keep it tight: **2–5 sentences, banker's voice**, cite the live figure + its source tool/object.
  3. Re-render with `C360_DATA.aiPanel = { componentId: component, thread: [...prior thread, { q: question, a: answer }] }`
     so the panel reopens with the full Q&A thread.

**State-preservation rule:** every `update_artifact` render MUST carry forward `aiPanel` state and the
active tab (and scroll/open-panel state the artifact persists) — a re-render must never lose the user's
place. When the trigger is an "explain" answer, only `aiPanel` changes; keep all borrower/portfolio data intact.

## Hard rules (MAPPING.md §5)

- **No invented figures, ever.** A number renders only if it traces to a tool-response field.
- **Gap ≠ blank.** Every gap renders its provenance: "not in source system" / "not wired v1 — lives in X".
- Each tool's `note` field renders as a **small provenance caption** in its section.
- **Never render BHI, PD, or a KYC "Cleared to bank" pill** — no source. Replace with the risk-rating
  badge (grade + stage) / gap chips / "Screening not on file in source org".
- Where the org's truth IS the story, show the **real zero with provenance** — Piedmont: "$0 — no deposit
  relationship on file" (0 Deposit records), never an invented wallet size.
- Keep the Accenture theme (#6B1CC4, layout, DCLogic engine) — that is the reference design. No Connectry branding.

## The 8-tool gotchas

- **Batch shape:** tools take `List<Request>` and return `List<Response>` (one InvocableMethod, list in/out).
  For a single request, read **`response[0]`** — don't treat the response as a bare object. This applies
  to `Customer360Portfolio` too: the whole portfolio is `response[0]`, not the top-level array.
- **`Customer360Portfolio` caps + truncation:** `accounts[]` is capped by `maxAccounts` (default 25, hard
  cap 100) and **`signals.covenantsDueSoon` / `signals.maturitiesSoon` are each capped at 25 rows** and
  clipped to `signalWindowDays` (default 90). `bookTotals.accountCount` is the TRUE packaged-account count
  (spans all rows before truncation) — don't infer the book size from `accounts.length` when it's capped.
- **`overdue` semantics:** a `covenantsDueSoon` row with `overdue:true` is **past due but still active**
  (nCino hasn't re-evaluated) — `daysUntilNextEvaluation` is negative. Render these as escalated/red, not
  as "upcoming". Rows with `overdue:false` are genuinely upcoming within the window.
- **`utilizationPct` can be `null`** (when Σtce=0) — render "—", never 0.
- **Dates are ISO strings** (`YYYY-MM-DD`). Format client-side.
- **`coverageRatio` can be `null`** (≠ 0). Null → render "—", never 0 or a computed guess.
- **Package-level rollups never sum loan amounts** — TCE/TBE/TOE/Outstanding come from the snapshot
  rollup fields; don't add up facility amounts to reproduce them.
- **Modern objects:** relationship/exposure/covenant data is on the **`Covenant2` / `Loan_Collateral2`**
  generation of nCino objects — use those field shapes, not the legacy ones.
- **`Customer360SearchAccounts` has no `note` field** — don't render a provenance caption for it.
- **`Customer360StructuralSignals`** defaults `maturityWindowDays` to **270**; the renewal-clock arc uses
  this window (`arc = 1 − daysUntilMaturity / window`).
