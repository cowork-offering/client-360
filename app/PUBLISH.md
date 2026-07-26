# Publishing the cockpit as a capability-declared Live Artifact

The bundle at `app/dist/cockpit.html` (promoted to `artifact/customer-360-template.html`, data injected
by `render/assemble-cockpit.mjs`) calls the viewer's claude.ai connectors through `window.claude.mcp`.
That only works if the artifact is published **with an `mcp` capability manifest**. This file is the
exact manifest to pass and the envelope notes behind it.

Written against runtime contract **0.1.15** (`window.claude.mcp` type definitions).

---

## 1. The capabilities manifest

Pass this as the `capabilities` input to the Artifact tool:

```json
{
  "mcp": {
    "servers": [
      {
        "server": "Customer 360",
        "tools": [
          "Customer360Portfolio",
          "Customer360Snapshot",
          "Customer360RelationshipGraph",
          "Customer360Exposure",
          "Customer360Covenants",
          "Customer360Opportunities",
          "Customer360StructuralSignals",
          "stage_collateral_valuation",
          "execute_collateral_valuation",
          "stage_service_request",
          "execute_service_request",
          "stage_annual_review",
          "execute_annual_review"
        ]
      },
      {
        "server": "IDB Gateway",
        "tools": [
          "boom-mcp-js___boom_get_ratios",
          "boom-mcp-js___boom_get_spread",
          "idb-bg-api-target-get-llm-response-staging___get_llm_response"
        ]
      },
      {
        "server": "Microsoft 365",
        "tools": ["outlook_email_search"]
      }
    ]
  }
}
```

### Manifest rules that bite

- `server` is the connector **display name**, never an id. Ids are per-viewer-account facts; a
  published page runs for many viewers.
- `tools` are the **upstream** tool names as `listTools()` returns them — not the normalized
  `mcp__…__<tool>` segment.
- **Colons are invalid in tool names** — a manifest containing one is rejected **422 at publish**.
  None of the names above contain a colon; keep it that way.
- The manifest is a **viewer-consented grant**, so keep it minimal. `Customer360SearchAccounts` is
  deliberately **not** declared: nothing in the page calls it, and the build confirms its name is
  tree-shaken out of the bundle. Declare a tool only when a call path exists. A page declaring capabilities
  **cannot be shared publicly** — this artifact is private-link only by construction.
- Omitting `capabilities` on a redeploy **carries the stored declaration forward** (and keeps the
  contract pin). Passing a non-empty object is a **full-set declaration**: anything stored but not
  restated is revoked. `{}` clears everything.
- Moving the runtime version is deliberate: pass `contract: "latest"` to upgrade or a specific
  version to pin/roll back. Never change it as a side effect of editing.

---

## 2. Observed vs inferred — read before publishing

The capability contract is explicit: never publish a page that calls a connector tool without having
observed one real request/response pair for it. Status of each tool in this manifest:

| Tool | Names confirmed via `listTools()` | Request/response envelope **observed live** |
|---|---|---|
| `Customer360Snapshot` | yes | **yes** (founder session 2026-07-25) |
| `Customer360Portfolio` | yes | **yes** |
| `boom-mcp-js___boom_get_ratios` | yes | **yes** |
| `…get_llm_response` | yes | **yes** |
| `outlook_email_search` | yes | **yes** |
| `Customer360RelationshipGraph` | yes | **no — pattern-inferred** |
| `Customer360Exposure` | yes | **no — pattern-inferred** |
| `Customer360Covenants` | yes | **no — pattern-inferred** |
| `Customer360Opportunities` | yes | **no — pattern-inferred** |
| `Customer360StructuralSignals` | yes | **no — pattern-inferred** |
| `boom-mcp-js___boom_get_spread` | yes | **no — pattern-inferred** |
| `stage_collateral_valuation` | yes | **yes** (WP2 live 2026-07-26, incl. a VALIDATION_FAILED domain failure) |
| `execute_collateral_valuation` | yes | **no — same envelope family, not yet exercised end to end** |
| `stage_service_request` | yes | **no — same envelope family** |
| `execute_service_request` | yes | **no — same envelope family** |
| `stage_annual_review` | yes | **no — same envelope family** |
| `execute_annual_review` | yes | **no — same envelope family** |

The remaining inferred tools are assumed to share the envelope of their observed siblings (the Salesforce
invocable envelope for the `Customer360*` family, the clean-JSON gateway payload for `boom_get_spread`).
That assumption is **reasonable but unverified**.

**State this at publish time, in the reply to the founder — not as a note inside the page.** The
unwrappers fail closed (a mismatched envelope reports a per-section failure rather than yielding
undefined figures), so a wrong guess degrades honestly instead of printing a wrong number. The first
live run should exercise a detail refresh and a spread refresh to convert these to observed.

Do not embed any observed response values in the published page as sample data — they are the
viewer's real data.

---

## 3. Observed envelopes

### 3.1 `Customer 360` family — Salesforce invocable envelope

`result.payload` is:

```jsonc
{ "content": [
  { "actionName": "…", "isSuccess": true, "errors": null,
    "outputValues": { /* the actual data */ }, "sortOrder": 0, "version": 1 }
] }
```

- **One element per request in the `inputs` array, POSITIONAL** — element *i* belongs to input *i*.
- Read `content[i].outputValues`.
- `isSuccess: false` or a non-null `errors` is a **per-element** failure and must not contaminate its
  siblings.
- Input shape: `{ inputs: [{ accountId }, …] }`.

Implemented in `src/channel/mcp.ts` → `unwrapInvocable(payload, expectedCount)`, which also detects
short envelopes so a truncated response can never silently misalign accounts.

### 3.2 `IDB Gateway` boom tools — clean JSON

`result.payload` carries `_source` / `_provenance`, `company`, `raw{…}`, `ratios[…]` — already the
shape the cockpit's `boom` field expects. No unwrapping beyond reading `payload`.

### 3.3 `…get_llm_response` — body is a JSON **string**

`result.payload` is `{ statusCode, headers, body: "<JSON STRING>" }`. `JSON.parse(body)`, then read:

- `.response` — markdown **text**, rendered as **plain text** (A13: never HTML/Markdown),
- `.model`, `.cost_usd` — surfaced as a subtle footer under the answer.

Input: `{ prompt: string }`. The cockpit **grounds** every prompt (`src/data/grounding.ts`): a context
block of the staged figures for the account/tab in view (capped at 2,000 chars), the question, and an
instruction to cite only those figures and to say so plainly when unsupported. The tool has no access
to cockpit data, so an ungrounded prompt would be answered from general knowledge — unacceptable for a
credit figure.

### 3.4 `outlook_email_search`

Input `{ query: string }`. Returns a list; `[]` is an honest "no matches" and renders as
"No client requests found in your mailbox for this relationship." Entity resolution is conservative —
a message attaches to an account only when the account name clearly appears.

---

## 4. What the page does with the capability

| Surface | Call | Mode |
|---|---|---|
| Home KPI band | `Customer360Portfolio` | **`watchTool`**, `staleTime: 30s`, `refetchInterval: 60s` |
| Chat | `get_llm_response` with a grounded prompt | `callTool`, read |
| "Sync" (account header) | `Customer360Portfolio` + the six `Customer360*` detail tools + `outlook_email_search` | `callTool`, read, `staleTime: 15s` (mail 60s), one user gesture |
| Generate Spreading action | `boom_get_ratios` + `boom_get_spread` | `callTool`, read, `staleTime: 30s` |
| Other registry actions | `get_llm_response`, framed as **preparation** | `callTool`, read |
| Action Panel "Review the plan" | `stage_<action>` | `callTool`, **uncached, no retry**, user gesture |
| Confirm gate "Confirm and file" | `execute_<action>` | `callTool`, **uncached, never auto-retried** |

### The sync sweep (WP7)

One button in the account header replaced the separate "Refresh from org" and "Check my inbox"
controls. It is a single user gesture firing **up to 8 read calls**: the portfolio read, the six
detail tools, and one mailbox search. The button is disabled for the duration, so a sweep cannot
overlap itself. There is **no auto-sync and no polling** on this surface.

Each console line is bound to its own call and cannot tick before that call has returned; the
display pacing is a floor, never a substitute for the work. A failed read leaves its section on the
previous value and says so on its line, and the workspace is never blanked. When Microsoft 365 is
not part of the view the mailbox line is removed silently, per the A29 opportunistic-skip rule.

### The compile sequence (WP7)

"Review the plan" runs a four-line build sequence, and each line wraps a real operation: gathering the
prefills, recomputing the suggestions and checking for drift, the `stage_*` call in flight, and
validating the plan that came back against the transition allowlist. A line cannot tick before its own
operation has returned; the ~450ms pacing floor can delay a fast line and can never advance a slow one.

A failure **stops the sequence on its own line** and renders the typed error (plus the org error string)
there — the sequence is the error surface. A domain refusal (`VALIDATION_FAILED`, `PRECONDITION`,
`NOT_STAGEABLE`, `blocked_by_policy`, `bad_request`) offers no retry, because re-sending the identical
request would be refused identically. A transport or transient failure offers one user-gesture retry.
Lines below the failure stay dim: they never ran.

The execution reveal on the tracker is **presentation only**. The executor has already returned every
step's final state and the eight-state machine still owns every transition; the reveal only paces how
those settled states are shown. No row ever displays a state the executor did not return, and the
"Filed" stamp appears only on a `success` terminal state.

`prefers-reduced-motion` collapses the pacing floor to zero and disables every sweep, slide, reveal and
pulse animation outright, rather than running them at 0.001s.

### `meta.userId` is REQUIRED to file anything (live defect, 2026-07-26)

`execute_*` checks four preconditions in order: staging row by `stagingId` → `planHash` equality →
**`approverUserId` equals the running identity** → decision-token hash, single use. The panel was
sending `meta.user`, which is the DISPLAY NAME. Every confirm therefore failed the third check before
the token was ever redeemed: org forensics showed all staging rows at `Status=Staged` with
`cm_Token_Consumed_At__c` NULL, and the banker saw only the platform's generic "ran the tool but
reported a failure".

The assembler MUST stage `meta.userId` as the Salesforce user id (`005…`) of the connector identity.
The panel now refuses anything that is not shaped like a user id and **fails closed with a named
reason** rather than sending a value the org will reject. `meta.user` is still accepted if the
assembler happens to stage the id there; a name in either field is refused.

The execute payload is pinned by test to exactly five fields, taken from the stage result verbatim:
`idempotencyKey` (the STAGE key, reused), `stagingId`, `planHash`, `decisionToken` (the SERVER token —
the client-minted record is bookkeeping and never reaches the wire), `approverUserId`. Nothing about a
staged plan is persisted, so no republish can resurrect a stale `stagingId` against a newer `planHash`.

### Write tools (WP5)

`stage_*` performs **zero domain-object DML** — it validates, computes and returns an immutable plan
(`stagingId`, `planHash`, `decisionToken`, `steps[]`, `warnings[]`). Verified live: after a staging call
the target object still held zero rows. Every org write happens behind `execute_*`, which requires the
server-minted single-use `decisionToken` bound to that exact `planHash`.

Client discipline for these two:
- **User gesture only.** Staging is the "Review the plan" button; executing is the confirm gesture.
- **Never cached, never auto-retried.** An ambiguous transport outcome is not proof the tool did not
  run, so a write is re-issued only behind a fresh gesture (A33.3.3 resume preconditions).
- **`idempotencyKey` is ours**, stable across the stage/execute pair and across resume. The platform is
  known to duplicate on failed background Apex, so idempotency is never assumed from nCino.
- **Domain failure is not transport failure.** `isSuccess:true` with `outputValues.ok === false` is a
  successful invocation reporting a rejected value; it renders the org's own message, and when the tool
  returns the legal picklist set the panel adopts it.
- `provenanceJson` arrives as a **string** and is parsed defensively.

**The other actions still perform no writes.** The remaining write-shaped actions (modification, renewal, new facility, service request) produce
a grounded analysis plus an explicit statement of what a credit officer would need to approve, and are
instructed never to imply a record was created. Their `apexAction` seam names the future callTool
target and stays unwired until v2 gated writes exist.

Freshness indicators are driven from `result.cache.storedAt`, never `Date.now()`.

The KPI band is the only DISPLAY-arm surface: `watchTool` replays cache, refreshes when stale and
delivers every newer result. Its poll sits at 60s — comfortably above the platform's ~30s floor, since
a credit book does not move second to second and a tighter loop only burns the viewer's budget. A
transient failure keeps the last good figures with a staleness note; only an authz denial retracts
them.

---

## 5. Degraded states

`window.claude.mcp === undefined` (standalone preview, older runtime) ⇒ the cockpit renders exactly as
it does today: all staged data navigable, chat disabled with the "Connection details" probe, actions
falling back to the copy-prompt dialog. **The copy-prompt dialog exists only for that case** — it is
never shown when the capability is live.

Every failure branches on the error **code**, never on message text, and each affected section shows
the one action that fixes it:

- `needs_reauth` → "Reconnect {server} in claude.ai Settings → Connectors."
- `server_not_connected` → "Add {server} in claude.ai Settings → Connectors."
- `selection_required` → choose one connector when prompted.
- `not_in_manifest` / `blocked_by_policy` / `approval_required` / `tool_error` / `rate_limited` /
  `bad_request` — each its own copy.
- `not_granted` / `capability_disabled` / `capability_removed` → the no-MCP experience.

Retries: **only** when the platform stamps `retryable: true`, at most **once**, honoring
`retryAfterMs` — and **reads only**. `server_unavailable` / `upstream_error` / `cancelled` are
outcome-ambiguous for writes, so a write is never auto-retried.

---

## 6. Publish checklist

1. `npm run build` in `app/` → `dist/cockpit.html`, then `npm run release:artifact`.
2. Assemble with data: `node render/assemble-cockpit.mjs --data <data.json> --out <out.html>`.
3. Publish the assembled file **by path** with `capabilities` from §1.
4. State in the reply which tools are pattern-inferred (§2) — not inside the page.
5. Keep `favicon` and `title` stable across redeploys.
