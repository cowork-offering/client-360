# The session build: what the integrator must pass, and how to read the gate

Branch `session-build`. Written 2026-09-02, against the artifact runtime contract 0.2.31
(`sample.d.ts`, `claude.d.ts`, `mcp.d.ts`) and `design/SAMPLE-CHANNEL-SPEC-20260901.md`.

**Nothing here has been published.** This file is the publish instruction, not a record of one.

---

## 1. The capabilities declaration

The artifact today declares `mcp` only: Customer 360 (23 tools), IDB Gateway (3), Microsoft 365 (1).
Adding the session door means declaring `sample` **beside** that manifest, because a non-empty
`capabilities` object is a **FULL-SET declaration**: anything stored but not restated is revoked. So
the mcp manifest below is not optional context. It is part of the same input, restated in full, or
the cockpit loses every connector it has.

Pass exactly this as the `capabilities` input:

```json
{
  "sample": {},
  "mcp": {
    "servers": [
      {
        "server": "Customer 360",
        "tools": [
          "Customer360Snapshot",
          "Customer360RelationshipGraph",
          "Customer360Exposure",
          "Customer360Covenants",
          "Customer360Opportunities",
          "Customer360StructuralSignals",
          "Customer360Portfolio",
          "stage_collateral_valuation",
          "execute_collateral_valuation",
          "stage_service_request",
          "execute_service_request",
          "stage_annual_review",
          "execute_annual_review",
          "Customer360ActionHistory",
          "stage_new_facility",
          "execute_new_facility",
          "stage_risk_rating_review",
          "execute_risk_rating_review",
          "stage_covenant_review",
          "execute_covenant_review",
          "stage_loan_modification",
          "execute_loan_modification",
          "stage_renewal"
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

### Where each name comes from

- **Customer 360, 23 tools.** Copied verbatim from `knowledge/artifact-capabilities-manifest.json`,
  which is itself generated from the org's own
  `knowledge/sf-build-v2/wp2/mcpServerDefinitions/Customer360.mcpServerDefinition-meta.xml`. The org
  manifest carries 24; `Customer360SearchAccounts` is deliberately excluded because no call path
  reaches it and the build tree-shakes the name out of the bundle. **This build does not change
  that.** It stays excluded. (If the dynamic-book backlog item ever lands, that is the one name to
  add, and it is a separate decision.)
- **IDB Gateway, 3 tools.** `app/src/channel/mcp.ts` `TOOLS.boomRatios`, `TOOLS.boomSpread`,
  `TOOLS.llm`. `boom_get_ratios` is now reached from two places: `cockpitTools.refreshBoom` as
  before, and the rung-3 `currentBoomRatios` page function. `TOOLS.llm` stays because the gateway
  completion door is still the fallback rung under the session door.
- **Microsoft 365, 1 tool.** `TOOLS.mailSearch`, the mail intake sweep. Untouched by this build.
- **`sample`.** No configuration. `{}` is the whole declaration.

**No new mcp tool is added by this build.** Both rung-3 page functions call doors the cockpit
already declares (`boom-mcp-js___boom_get_ratios` and `Customer360RelationshipGraph`), which is a
deliberate constraint: a call-out that needed a new grant would be a new write surface to argue
about, and `app/src/channel/brainTools.ts` `READ_DOORS` is an allow-list that admits neither a
`stage_*` nor an `execute_*` name.

### The two rules that bite at publish

1. A colon in a tool name is rejected 422. None of these carry one.
2. Tool names are the **upstream** names `listTools()` returns, never the normalized
   `mcp__…__<tool>` segment.

---

## 2. Consent

`sample` asks the viewer, once per view, to allow this artifact to use their Claude. The call waits
while they decide. That dialog is therefore an event with a place in the choreography, not an
implementation detail.

### The rule

**Consent rides the greeting.** The first session call of a view is the room's opening line, made
once when the banker opens the workroom, on a prompt that is stable across loads and therefore
cached. The dialog appears framed by the greeting the banker just asked for by opening the room.
Never mid-plan. Never between a card and its sentence.

- `primeConsent` (`app/src/channel/sampleDoor.ts`) is the only call that can be first. It is
  **memoised per view**: a re-render, a React strict-mode double effect, a re-opened room or a
  second call with a different prompt all return the same promise and make no second call.
- It fires only from an explicit banker action (opening the room). Never from a timer, never from a
  loop, never at module load.
- It runs on the `quick` tier with `cache: true`. The greeting is stable per view, so the contract's
  own advice applies.
- Its reply is a NARRATE call, so the model may add one line of what it noticed on the book (an
  overdue covenant, a maturity inside 90 days) under the greeting the room composed
  deterministically. If it adds nothing, the greeting stands alone.
- **What it notices now includes the CLIENT'S MAIL (2026-09-02).** The room reads the mailbox once
  on open and the greeting waits at most `MAIL_GATE_MS` (1200ms) for it, which is zero added
  latency on the animated path and at most one beat under reduced motion. Mail that misses the gate
  arrives as a SECOND remark under the greeting, through `askSession` and not `primeConsent`: the
  greeting is never recomposed and there is never a second consent dialog.

### The decline path

A decline is permanent for the view: every later call rejects `not_granted`, so the door stops
asking. The room says one sentence, once, in the place the remark would have been:

> Working from the file only. The desk is not connected, so I will answer from what is here and
> stage what the engines can read.

It is **not an error state**. No red, no retry prompt, no banner. Every later call is silent, and
the room runs today's behaviour exactly: deterministic sentences, local reads, the gateway rung
underneath for a fuzzy line, and the neutral clarify where nothing answers.

The same handling covers `sampling_disabled`, `not_declared`, `capability_disabled` and
`capability_removed`. A `rate_limited` or an `upstream_error` is **not** a decline: the door stays
open and the next line may well be answered.

### Booth note

Open the room before the audience gathers, so the view is already consented. **A page reload is a
new view and a new consent.** If the panel is reloaded between rehearsal and the run, the first
line of the run will carry the dialog. Open the room once after any reload.

### Tests

- `app/src/channel/sampleDoor.test.ts`, "the consent moment rides the greeting, once per view":
  one call however many times it is primed; the greeting is cached and on the quick tier; a decline
  resolves null rather than throwing into the opening; nothing is primed until the room asks.
- `app/src/narration.render.test.tsx`, "a remark that fails leaves the room exactly as it was":
  the decline sentence appears exactly once across two banker lines, and carries no em dash.
- `app/src/narration.render.test.tsx`, "channel-none renders exactly today's sentences": with no
  session door, no remark and no pulse render, and the deterministic card is on the plan.

---

## 3. The latency gate, and how to read it

The founder's decision was **switch to sample, but prove latency first**. The instrumentation is
`app/src/channel/sampleMetrics.ts`. It is a measuring tape: per view, in the page, nothing sent
anywhere, no build flag.

### Reading it

In the panel's console, after a drive:

```js
c360SampleGate()    // the summary: bands, the consent call, rung 3, the over-call rate
c360SampleCalls()   // every call, oldest first, with its timings and tool calls
```

`installSampleGateReadout()` runs from `app/src/main.tsx` before first render, so both are available
from the moment the cockpit loads.

### What the summary carries

| Field | What it answers |
|---|---|
| `bands["reply:quick"]` | rung 2 quick: first-token and full-answer, median and worst |
| `bands["reply:default"]` | rung 2 default: the same, for judgment lines |
| `bands["narrate:quick"]` | how long a remark takes to appear under a card |
| `bands["greeting:quick"]` | the opening remark, measured after the consent call |
| `consentCall` | **the first call of the view, held out of every band.** Its first-token time carries the consent dialog, which is a once-per-view cost and would make the quick tier look broken if it were pooled |
| `rung3` | end to end for a real "check the latest ratios" line |
| `toolCalls` / `overCallRate` | how often the model reached for a tool when the envelope already held the fact. **This is the number that decides whether the tool discipline holds.** |
| `failures` | a count per error code, so a rate limit is not read as slowness |

### How an over-call is judged

Each page function declares `heldAlready()`: `currentBoomRatios` is an over-call when the envelope
already carried pricing or covenant actuals; `liveInvolvements` is one when the envelope already
carried the involvements block. The judgement is made in the page, at the moment the model calls,
against the envelope that call travelled with.

### The gate itself

Per the spec: if rung 2 `quick` lands a card in a couple of seconds and rung 3 stays rare, the booth
story holds. If `quick` is slow or the over-call rate is high, **do not ship sample for the booth**:
keep the gateway for rung 2 and reconsider rung 3 afterwards. The numbers decide. The fallback is
already wired and needs no code change, only a decision.

Suggested run, on the booth network profile, in one view:

1. Open the room. Record `consentCall`.
2. Ten quick lines (instructions and plain reads). Record `bands["reply:quick"]` and
   `bands["narrate:quick"]`.
3. Ten judgment lines (why, which, should, compare, cushion). Record `bands["reply:default"]`.
4. Two rung-3 lines ("what is the current DSCR on the latest Boom spread"). Record `rung3`.
5. Read `overCallRate` at the end of the whole drive, not per step.

---

## 4. What this build did not do

- **It did not publish.** No `capabilities` input has been passed. The declaration above is untested
  against the publish endpoint.
- **It did not measure.** `claude.use("sample")` is null outside a real viewer, so every test runs
  against a stub of the documented shape. Every latency number in section 3 is a field the harness
  fills in, not a figure this build produced.
- **It did not add a third tool.** The covenant-type catalog the spec names as a candidate is not
  exposed: nothing in the booth arc needs it, and every extra tool widens the over-call surface.
- **It did not touch the write path.** No new arm, no guard change, `app/src/workroom/` byte
  untouched (tree `91c751e427232bf2b62c14b9cf92921e497496c9`).
