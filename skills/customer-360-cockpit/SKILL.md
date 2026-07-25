---
name: customer-360-cockpit
description: Open the Customer 360 relationship cockpit — a worklist-first commercial-credit control center. Fetches the book and the needs-action accounts from Salesforce (nCino + FSC) via the Customer360 MCP server plus Boom-spread financials, composes C360_DATA, and renders a prebuilt interactive Cowork artifact (needs-action queue, activity/audit trail, exposure, covenants, relationship graph, whitespace, structural signals) with a chat FAB and a Client Actions panel. Trigger on "customer 360", "open the cockpit", "pull up the relationship view", "what needs my attention", "relationship overview for <account>", or any account-level portfolio question.
---

# Customer 360 Cockpit (v3)

Render a **worklist-first** credit cockpit as a Cowork artifact. You fetch every figure from MCP tools
and compose `C360_DATA`; the assembler bakes that JSON into a **prebuilt React bundle**. The artifact
renders the JSON — it never fetches. Interactivity flows back through `window.sendPrompt(...)` → you
re-fetch → re-assemble → full artifact replace.

**Demo anchor:** Piedmont Precision Components, Inc. · Account `001bb00001DLtRMAA1` · org `bankinggpt`.

**You never write UI.** The artifact HTML is a compiled React app (`app/`, built to
`artifact/customer-360-template.html`). Your only job is data + one assembler command.

---

## STEP 0 — WAIT for the Customer360 server (before anything else)

MCP servers connect lazily; at session start `customer360` often shows "still connecting". You MUST:

1. Call **ToolSearch** with query `"Customer360Snapshot"` — ToolSearch WAITS for connecting servers.
2. If no match, wait and retry ToolSearch up to 3 more times (a Salesforce OAuth token refresh can
   take ~10–30s).
3. Only if the server is terminally failed/unauthenticated after retries: **STOP** and tell the user
   to authenticate (`/mcp` → customer360 → Authenticate) or check the README config. Do NOT proceed.

## HARD RULE — no fallback data sources (this overrides being helpful)

If the Customer360 MCP tools are NOT available (disconnected, still connecting, or shadowed by a
stale plugin-bundled duplicate), **STOP and tell the user to fix the connection** — an error message
IS the correct deliverable. Do NOT render from `ncino_deal_prep`, sObject SOQL, or any other source.

Reason: those paths sum loan amounts, which double-counts nCino limit/sublimit structures (Piedmont:
3 loans sum to $17.5M vs true package-level TCE $12.5M). **Package-level rollups exist ONLY in the
Customer360 tools.** A wrong committed-exposure figure in front of a banker is worse than an error.

---

## The MCP surfaces

**Customer360** — Salesforce-hosted, per-user OAuth, read-only. Tool names derive from the Apex class
(`aa:apex-{ClassName}`), so match by the **class-name suffix** — the host may namespace it
(`customer360__Customer360Snapshot`). Never hardcode a prefix.

| Tool | Returns |
|---|---|
| `Customer360Portfolio` | whole book in ONE call: `accounts[]`, `bookTotals`, `signals` |
| `Customer360SearchAccounts` | name-based lookup only (open-by-name) |
| `Customer360Snapshot` | per-account rollup (rating, stage, revenue, TCE/TBE/TOE, outstanding, packageCount) |
| `Customer360RelationshipGraph` | `connections[]`, `legalEntities[]`, `note` |
| `Customer360Exposure` | totals + `facilities[]` each with `collateral[]` |
| `Customer360Covenants` | `covenants[]`, `note` |
| `Customer360Opportunities` | `opportunities[]`, `note` |
| `Customer360StructuralSignals` | `modifications[]`, `modificationClusterFlag`, `renewals[]`, `maturityWatch[]`, `guarantorSignals[]`, `note` |

**Boom** — `boom_get_ratios` + `boom_get_spread` for the Financials tab.

**Every tool takes `List<Request>` and returns `List<Response>`.** For a single request read
`response[0]` — never treat the response as a bare object. This applies to `Customer360Portfolio` too.

---

## FETCH SEQUENCE (worklist-first)

### (a) One `Customer360Portfolio` call
Request (all optional): `industry`, `maxAccounts` (default 25, cap 100), `signalWindowDays` (default 90).
Returns `accounts[]` (sorted TCE desc, truncated to `maxAccounts`), `bookTotals`
(`totalCommitted`, `totalOutstanding`, `accountCount`, `utilizationPct`), and `signals`
(`covenantsDueSoon[]` cap 25, `breachedCount`, `maturitiesSoon[]` cap 25).

`bookTotals.accountCount` spans **ALL** packaged accounts, not the truncated list — never infer book
size from `accounts.length`.

### (b) Determine the worklist scope
The worklist is the **needs-action queue**: accounts carrying covenant tests due or breached,
maturities in window, modification clustering, or guarantor signals. Build the id set from
`signals.covenantsDueSoon[].accountId` ∪ `signals.maturitiesSoon[].accountId` ∪ any account you have
reason to believe carries structural signals.

- **Cap at ~30 accounts.** Beyond that the queue stops being a queue.
- **If the book is smaller than the cap, stage everything** — full staging is always better.
- Always include the anchor account.

### (c) Stage details for ALL worklist accounts — BATCHED
The six detail tools each accept an **inputs array**: `inputs: [{ accountId }, { accountId }, …]`.

**Six calls total. Never a per-account loop.** One batched call each to `Customer360Snapshot`,
`Customer360RelationshipGraph`, `Customer360Exposure`, `Customer360Covenants`,
`Customer360Opportunities`, `Customer360StructuralSignals` (pass `maturityWindowDays: 270`).

Responses come back positionally — zip each response array back to the accountId you sent at that index.

### (d) Boom
`boom_get_ratios` + `boom_get_spread` for the anchor, and for worklist accounts where the file exists
and the call is cheap. If either fails or no file exists, set that bundle's `boom` to `null` — **never
fabricate**. The Financials tab renders an honest gap state.

### (e) Compose `C360_DATA`
Shape source of truth: **`app/src/data/contract.ts`**. Read it if unsure — it is authoritative and
carries the provenance map.

---

## The C360_DATA contract

```jsonc
{
  "meta": {
    "anchorAccountId": "001…",        // REQUIRED
    "generatedAt": "2026-07-25T14:03:00Z", // REQUIRED — current UTC ISO instant, must parse
    "user": "Fabian Goetzens",
    "orgAlias": "bankinggpt"
  },
  "portfolio": {                      // VERBATIM from Customer360Portfolio response[0]
    "accounts":   [ /* … */ ],
    "bookTotals": { /* … */ },
    "signals":    { /* … */ }
  },
  "borrowers": {                      // REQUIRED — one bundle per worklist account, INCLUDING the anchor
    "<accountId>": {
      "snapshot": {}, "graph": {}, "exposure": {}, "covenants": {},
      "opportunities": {}, "signals": {},          // raw tool responses, VERBATIM
      "boom": { "ratios": {}, "spread": {} },      // or null
      "verdict": "…",                              // agent-composed, live figures only
      "anchors": [ { "label": "…", "value": "…", "sub": "…", "dir": null } ],
      "activity": [ /* only from REAL sources — see below */ ],
      "requests": [ /* only from REAL sources — see below */ ]
    }
  },
  "worklist": {                       // optional — omit and let the client derive
    "accountIds": [ "…" ],
    "reasons": { "<accountId>": [ "COVENANT_DUE" ] }
  },
  "aiPanel": { "threads": [] }
}
```

### Rules that will fail the build if broken

- **`meta.generatedAt` is REQUIRED** and must be a valid ISO-8601 instant. It is the deterministic
  clock for every time-based worklist reason. Use the **current** UTC instant at compose time.
- **`borrowers` must be a plain object** with an own entry for `meta.anchorAccountId`, and each
  bundle's `snapshot.accountId` must equal its own map key.
- **Do NOT hand-write top-level `borrower`.** The assembler derives it from
  `borrowers[meta.anchorAccountId]`; anything you supply is overwritten.
- **Do NOT hand-write `covenantChallenge`, `dataQuality`, or `meta.validation`.** The assembler
  computes them deterministically (see Validation stage).
- **`worklist.reasons` codes are restricted to:** `COVENANT_BREACH`, `COVENANT_DUE`, `MATURITY_NEAR`,
  `MODIFICATION_CLUSTER`, `GUARANTOR_SIGNAL`, `RECENTLY_MODIFIED`. Any other value exits 1.
  **If unsure of the reasons, omit `worklist` entirely** — the client derives them from the staged
  bundles, which is the safer default.
- **Client requests are derived, not declared.** Do not put a client-request code in
  `worklist.reasons`; stage `requests[]` / a `REQUEST_RECEIVED` activity entry and the client raises
  the chip itself, ranked above every risk signal.

### `activity[]` and `requests[]` — real sources only

`activity[]` is the account's audit trail (first tab). Entry shape:
`{ id, ts, kind, title, summary?, reference?, detail? }` with `kind` ∈ `REQUEST_RECEIVED`,
`ANALYSIS_CONCLUDED`, `COVENANT_EVALUATED`, `FACILITY_MODIFIED`, `RENDER_AUDIT`.

- Emit entries **only** where a real record backs them (a covenant evaluation date, a recorded
  modification, a genuine inbound request). **Never synthesise history** to fill the timeline — the
  empty state ("No recorded activity in this view") is the correct output for an account with none.
- `detail.nextSteps[]` is `{ actionId, note? }` where `actionId` **must** match an id in
  `app/src/actions/registry.ts` (`generate-spreading`, `draft-credit-memo`, `loan-modification`,
  `renewal`, `covenant-review`, `collateral-valuation`, `annual-review`, `risk-rating-review`,
  `new-facility-request`, `create-service-request`). Unknown ids are silently dropped.
- `reference.webLink` must be **omitted** unless a real link exists — the UI renders the id as plain
  text and must never show a fabricated link.

### Composition rules
- Embed tool responses **verbatim** — field names unchanged, figures un-reshaped.
- You compose **only** `verdict`, `anchors`, `activity[].detail` narrative fields, and chat replies —
  always from live figures, citing nothing invented.

---

## ASSEMBLER INVOCATION

```
node <pluginRoot>/render/assemble-cockpit.mjs --data /tmp/c360-data.json --out /tmp/customer-360.html
```

Resolve `<pluginRoot>` as the directory containing `.claude-plugin/` (also holds `app/`, `artifact/`,
`render/`, `skills/`). `--template` defaults to `artifact/customer-360-template.html` — do not pass it.

1. **Write the composed object to a temp JSON file** with the Write tool. Write ONLY the `C360_DATA`
   object — no `window.C360_DATA =` wrapper, no `<script>` tag.
2. **Run the command above.** Pass no other flags in a normal run.
3. On success it prints one line: bytes written (code + data split), anchor, and accounts staged.

### What the assembler enforces (all fail-closed, exit 1)

- **Staging coverage.** Every account required by the worklist (or by `portfolio.accounts` when
  `worklist` is absent) must have a bundle in `borrowers`. Missing coverage exits 1 and **names the
  missing ids** — go back and fetch them. **Do not reach for `--allow-partial` in normal runs**; it
  exists only for a deliberate single-account render and produces a degraded artifact.
- **`meta.generatedAt`** present and a valid ISO instant.
- **Structural integrity** — `borrowers` shape, anchor entry, key/`snapshot.accountId` match, worklist
  ids a subset of `borrowers`, no duplicate/malformed ids.
- **Validation stage runs automatically** and is mandatory (below).
- **Byte budget** — output is measured **before writing** and fails over 8 MiB (conservative vs the
  ~16 MiB host cap). An oversized artifact never touches disk. Write is atomic.
- **Data marker** — the injection point inside the prebuilt bundle is asserted to occur exactly once.
  You never touch it; the assembler owns injection end to end.

There is a validation-skip flag reserved for test fixtures; it is hard-restricted to `/tmp` outputs
and **must never be used for anything a banker will see**.

**On exit 1: read the error.** Every failure names exactly what is missing or malformed. Fix the data
and re-run — never work around the check.

### Validation stage (SR 11-7 effective challenge)

Runs on the composed data **before injection**, across **every** bundle. Deterministic and LLM-free —
the model never touches these numbers. It adds:

- **`covenantChallenge[]`** (per bundle) — each nCino covenant recomputed from that borrower's Boom
  spread over the latest period, beside the nCino actual. `status`: **corroborated** (within 15% and
  same compliance side), **diverges** (>15% off or opposite side → also sets `breachRiskFlag`), or
  **not-computable**.
- **`dataQuality[]`** (top-level) + `meta.validation` — deterministic integrity findings across the
  staged book, sorted critical → warn → info.

**Standard vs contractual definitions — load-bearing caveat.** The Boom-implied value uses *standard*
ratio definitions; the bank's *contractual* definitions are nCino-owned and can differ (add-backs,
rolling averages, pro-forma adjustments). A `diverges` result is a **review flag for effective
challenge, never a breach determination.** Never present divergence as a covenant breach.

---

## RENDER

Publish the assembled file with the artifact tool **BY FILE PATH** (`create_artifact`). Do not paste
HTML inline. Do NOT open a Chrome tab or call any other widget/HTML builder.

**Updates are full-replace only:** rebuild the whole `C360_DATA`, re-run the assembler to a fresh
`--out`, and `update_artifact` by file path. Never edit rendered HTML or inject JSON by hand.

The artifact detects `window.sendPrompt` **per request**, so a channel that appears after first paint
still works. Where no channel exists (hosted artifact pages), it degrades honestly: all staged data
stays navigable, and actions open a copy-prompt dialog instead of a dead spinner. Never assume the
live loop exists; never leave an interaction silent.

---

## HANDLING INBOUND sendPrompt REQUESTS

Every prompt the artifact sends ends with a context frame:

```
<the ask> [account: Sterling Fabrication Co. · id: 001… · tab: Covenants · requestId: req-abc123]
```

1. **Parse the frame** — account name, accountId, active tab, requestId.
2. **Do the work** — re-fetch what changed (Customer360/Boom), answer, or run the action flow.
3. **Re-assemble and replace** — rebuild `C360_DATA` with updated data *and* the extended thread.

### Chat thread schema

```jsonc
"aiPanel": {
  "threads": [{
    "id": "t1",
    "title": "Covenant questions",
    "messages": [
      { "id": "req-abc123", "role": "user",  "text": "Explain the cushion", "ts": "…",
        "context": { "accountId": "001…", "tab": "Covenants" } },
      { "id": "reply-abc123", "role": "agent", "text": "…", "ts": "…" }
    ]
  }]
}
```

- `role` is **`user` | `agent`** (never "assistant").
- **Echo the incoming `requestId` back as the user message's `id`.** The client shows the user's
  message locally the moment they send it and de-duplicates by id on the next replace — a different
  id renders the message twice.
- Text is **plain text only**. It is never parsed as HTML or Markdown.
- Carry the whole thread forward on every replace; a re-render must never lose the conversation.

**State preservation:** the artifact persists the active account, tab, panel and draft itself, so a
full replace keeps the user's place. Your job is only to carry `aiPanel.threads` forward intact.

---

## ACTIONS

Prompts arriving from the Client Actions panel, activity next-step buttons, or chat suggestion chips
are well-formed instructions naming the account and id:

| Prompt | Route to |
|---|---|
| `Draft the credit memo for <name> (<id>).` | the credit-memo agent flow |
| `Pull up the Boom spreads for <name> (<id>).` | `boom_get_spread` + `boom_get_ratios` |
| `Run a covenant review for <name> (<id>) — …` | `Customer360Covenants` + the Boom challenge read |
| `Re-value the pledged collateral for <name> (<id>) …` | `Customer360Exposure` collateral analysis |
| `Start a loan modification for <name> (<id>) — …` | modification prep / analysis |
| `Begin the renewal workflow for <name> (<id>) — …` | renewal prep / analysis |
| `Run the annual credit review for <name> (<id>).` | full review across the staged bundle |
| `Review the risk rating for <name> (<id>) …` | rating rationale from live figures |
| `Structure a new facility request for <name> (<id>).` | structuring analysis |
| `Create a service request for <name> (<id>).` | servicing prep |

**Until v2 gated writes exist, every action is analysis and preparation only.** Never claim a record
was created, a memo was filed, a modification was staged, or anything was written to nCino. Produce
the analysis, say plainly what the banker would need to approve, and stop. Claiming a write that did
not happen is the single worst failure mode in this skill.

---

## STALE-INSTRUCTION GUARDS

- **Never hand-author or model-generate the artifact HTML.** It is a compiled React bundle. Emitting
  a document token-by-token is the slow path bankers feel as "the artifact takes ages to load".
- **Never inject the JSON yourself.** The assembler owns the data slot and asserts it exactly once.
- **Never rebuild the app** as part of a render run. `artifact/customer-360-template.html` is
  committed and current; `npm run build` in `app/` is a development step, not a render step.
- **Never per-account loops** for the six detail tools — batch the inputs array (six calls total).
- **Never invent figures.** A number renders only if it traces to a tool-response field.
- **Gap ≠ blank.** Missing data renders its provenance ("not in source system" / "not wired v1 —
  lives in X"). Each tool's `note` renders as a small provenance caption.
- **Never render PD, a composite health index, or a KYC "cleared" pill** — no source exists.
- Where the org's truth IS the story, show the **real zero with provenance** — Piedmont: "$0 — no
  deposit relationship on file" (0 Deposit records), never an invented wallet size.
- Keep the Accenture engagement theme. No Connectry branding anywhere.

---

## Gotchas

- **`overdue` semantics** — a `covenantsDueSoon` row with `overdue: true` is **past due but still
  active** (`daysUntilNextEvaluation` negative). Render escalated, not "upcoming".
- **`utilizationPct` can be `null`** (Σtce = 0) → "—", never 0.
- **`coverageRatio` can be `null`** (≠ 0) → "—", never 0 or a computed guess.
- **Package-level rollups never sum loan amounts** — TCE/TBE/TOE/Outstanding come from rollup fields.
- **Modern objects** — use the `Covenant2` / `Loan_Collateral2` generation field shapes.
- **`Customer360SearchAccounts` has no `note` field** — no provenance caption for it.
- **`Customer360StructuralSignals`** defaults `maturityWindowDays` to **270**; the renewal clock uses
  that window.
- **Dates are ISO strings** (`YYYY-MM-DD`). All formatting is client-side.
- **A closed facility is not booked exposure** — the client treats a facility as active only when
  `status` is absent or "Active"; closed/paid-off facilities are excluded from maturity signals and
  from coverage math. Pass `status` through verbatim when the org carries it.
