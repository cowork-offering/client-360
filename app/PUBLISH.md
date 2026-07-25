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
          "Customer360StructuralSignals"
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

The six inferred tools are assumed to share the envelope of their observed siblings (the Salesforce
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
| "Refresh from org" (Activity tab) | the six `Customer360*` detail tools | `callTool`, read, `staleTime: 15s` |
| Generate Spreading action | `boom_get_ratios` + `boom_get_spread` | `callTool`, read, `staleTime: 30s` |
| Other registry actions | `get_llm_response`, framed as **preparation** | `callTool`, read |
| "Check my inbox" | `outlook_email_search` | `callTool`, read, `staleTime: 60s` |

**No writes.** The write-shaped actions (modification, renewal, new facility, service request) produce
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
