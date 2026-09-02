# The sample channel: the latency ladder - build spec (founder direction 2026-09-01)

STATUS: planned, SEPARATE worktree AFTER the create-grammar phase 1 merges. Do NOT start until
phase 1 is on main (both touch app/src/channel/brainLane.ts). This spec is the contract.

## Why this exists

The recorded decision (handoff line 93) is that the workroom brain runs on the USER's session
Claude - their identity, their connectors, zero infra - not the IDB Gateway (that is Boom's door).
The code drifted to the gateway's Bedrock endpoint. The correct door is the artifact runtime's
`sample` capability: ask Claude on the viewer's own account, with a tool loop
(`options.tools` = page functions Claude may call). That tool loop is what lets the room answer
"can you check the latest ratios" - the room already holds Customer 360, Boom (via gateway) and
M365 connectors.

## The founder's constraint, which governs the whole design

"The brain should know when to make a call-out and when to leverage what is on store, otherwise
the latency is horrendous."

`sample` latency, from the runtime contract: `quick` tier ~1-2s per round; `default`/`complex`
5-60s to first text, up to 2 minutes for a long structured prompt; a call that USES TOOLS is
several rounds back to back, commonly 30-90s. A tool call-out is not a lookup, it is another whole
round. So the design must push work DOWN the ladder and reserve the model, and above all reserve
tool call-outs, for where nothing cheaper can answer.

## THE LATENCY LADDER (the core architecture)

Every banker line is answered at the CHEAPEST rung that can answer it. The router decides the rung
BEFORE the model is ever reached.

| Rung | What answers | Latency | Examples |
|---|---|---|---|
| 0 - deterministic parse | the parser fast lane, provably-clean phrasings | instant, no model | "increase the construction loan to 14M" |
| 1 - local read | the bundle already in the room answers the read | instant, no model | "what covenants do we carry", "who are the guarantors" |
| 2 - model, envelope-only | model reasons over what the envelope ALREADY carries; ZERO tools | one round (1-2s quick, 5-60s default) | "bump the big revolver by five million", "which covenant has the least cushion" |
| 3 - model + tool call-out | the fact is genuinely NOT loaded; model calls a page function | several rounds, 30-90s+ | "what is the CURRENT DSCR on the latest Boom spread", "is there a newer valuation than what I see" |

Rungs 0 and 1 already exist and handle the large majority of demo lines. The `sample` switch only
changes rung 2 (transport moves from gateway to sample) and ADDS rung 3 (the tool loop). The win is
that rung 3 is RARE by construction.

## The rule that keeps rung 3 rare

1. **The envelope is the model's working memory. Answer from it by default.** The prompt states,
   explicitly and near the top: you already hold this relationship's covenants with thresholds and
   frequencies, its collateral with advance rates and lendable, its borrowers and roles, its
   exposure, its pricing, the staged plan and the last six turns. Answer from these. Do NOT call a
   tool for anything already here.
2. **Name what a tool is FOR, and what it is NOT for.** Each exposed tool's description says exactly
   when to reach for it and tells the model the cheaper source it should prefer. A Boom-ratios tool
   reads "current market ratios; use ONLY if the banker asks for figures more recent than the
   pricing already in your context - otherwise answer from that pricing." A covenant-catalog tool
   reads "the org's full list of covenant TYPES available to create; use ONLY when proposing a
   covenant whose type is not among the families this relationship already carries."
3. **Bias against tool use, because models over-call.** The prompt says a tool call costs the banker
   30 to 90 seconds and is justified only when the answer is not in context and the banker asked for
   something current or something the book does not carry. When in doubt, answer from the envelope
   and say what it is based on.
4. **Expose FEW tools, each narrow.** A short tool list the model can reason about, not the whole
   connector surface. Candidates, each a READ: current Boom ratios (via the gateway),
   the covenant-type catalog, and a scoped LIVE SALESFORCE read (Customer 360 read tools, or a
   narrow soqlQuery) for a fact the snapshot does not carry or that may have moved. Start with the
   two cheapest and add the Salesforce read only on evidence a line needs it.

### Live Salesforce, the honest boundary

A rung-3 call-out CAN hit Salesforce live - the room already holds the Customer 360 and sObject
connectors, on the VIEWER's own credentials, so a live read sees exactly what the banker can see.
Two lines govern it:

- **The snapshot already IS Salesforce.** The envelope's reads were built from a Customer 360 read
  moments ago, so almost every org fact is already loaded at rung 2 for free. A live re-check earns
  its 30-90s ONLY for a fact the snapshot does not carry, or one that could have changed since it
  was taken (a just-booked facility, a fresh compliance row, a valuation dated after the snapshot).
  "Check Salesforce" is not a reflex; it is for the delta between the snapshot and now. If a fact is
  always needed, it belongs IN the envelope (rung 2), never as a call-out.
- **READS only. The write fence is absolute.** A live Salesforce call-out may READ. It may never
  WRITE. Every mutation stays on the governed path - propose, restate through proven phrasings,
  human confirm, single-use token, execute - and the brain never touches that path through a tool.
  This is the SR 11-7 fence and the whole reason a banker trusts the room: the model can look, only
  the human can commit. A read tool that could mutate is not exposed.

(Distinct from this: loading an ARBITRARY org account into the cockpit - the "dynamic book" via
Customer360SearchAccounts - is a live-Salesforce read too, but it is a separate feature that
hydrates a new relationship, not a brain call-out inside an open room. Backlog item, pairs with
this but not part of this switch.)
5. **`quick` tier for restatement, `default` only where judgment is needed.** A fuzzy line that just
   needs resolving into a proven phrasing is a `quick` call. A genuine credit-judgment question
   ("which covenant has the least cushion, and why") earns `default`. The router picks the tier.
6. **Warm the wait honestly.** Thinking pulse from send to first token; a Stop on anything that uses
   tools. The banker never stares at a frozen card.

## What we must MEASURE before committing (the gate)

The founder decided: switch to sample, but PROVE LATENCY FIRST. In a real panel, on the booth
network profile:
- rung 2 `quick` first-token time and full-answer time, ten lines, median and worst;
- rung 2 `default` same;
- rung 3 end-to-end for a real "check the latest ratios" line;
- the consent prompt cost on the first call of a view (it blocks the first answer);
- how often the model calls a tool when it should NOT have (the over-call rate) - this is the
  number that decides whether the discipline above actually holds.

If rung 2 `quick` lands a card in a couple of seconds and rung 3 is rare, the booth story holds:
most lines instant (rungs 0-1), the occasional fuzzy line a short pause, and "let me check that"
an honest 30-60s with a visible reason. If `quick` is slow or the over-call rate is high, we do NOT
ship sample for the booth - we keep the gateway for rungs 2 and reconsider rung 3 after. The
numbers decide, not the aspiration.

## Constraints

- Engine fence untouched; this is the channel and the router, both outside app/src/workroom/.
- No new write arm. Tools exposed to the model are READ-ONLY call-outs; the write path is unchanged
  (propose, restate through proven phrasings, human confirm, token, execute).
- Degrade parity: no sample (declined consent, null capability, rate limit, timeout) falls back to
  today's behavior - the deterministic lanes and local reads still answer, and a fuzzy line gets the
  neutral clarify. The room must be fully usable with the model entirely absent.
- THE DOCTRINE IS INLINED INTO THE PROMPT IN THIS BUILD. Founder decision 2026-09-01 late: no
  standalone Bedrock-grounding step; it was briefed to phase 1 but slipped when that agent was
  killed and the recovery brief carried bugs only, so it is NOT done. It lands here, with the
  transport switch, as one build. It is required for BOTH doors: `sample` has no page-controlled
  system prompt and does not auto-load the plugin skill either, so grounding never depends on a
  skill load. Inline the relevant slices of brain/WORKROOM-BRAIN.md: covenant families and bands
  (4.2), the org fences (2.11), the involvement roles (2.5), the never-invent-an-index rule, the
  three output shapes, and the "answer from the envelope, tools are the exception" ladder rule.
  Budget it inside the envelope cap; doctrine is dropped after thread history and never before
  the read blocks.
- Bedrock survives ONLY as the rung-2 fallback if the session door fails the latency gate. No
  further investment in it beyond carrying the same inlined doctrine.
- No em dashes in UI copy. Commit trailers. No git add -A.

## THE PARSER STAGES, THE MODEL SPEAKS (founder feedback 2026-09-02, first-class rule)

Founder, after driving the plan-fixes build: "it does not read the room or the relationship, it
does not know the relationship inside out, it feels VERY scripted, it does not think, it pops up
with answers." He is right, and the ladder above is the reason: rungs 0 and 1 answer with NO
model, and the deterministic layer composes the sentence as well as the card. Instant, and canned.

The rule for this build: the deterministic layer keeps staging the CARD instantly (rung 0 and 1
unchanged, nothing gets slower), but the SENTENCE around the card is written by the model, on the
quick tier, streaming in a second or two after the card lands, with the FULL book, the plan and
the doctrine in view. The model narrates what the room did and what it saw: "that test already runs
at relationship level, tested quarterly, but it is not on the Equipment loan; I can associate it or
create a new one." The card is the fact; the sentence is the judgment.

Mechanics: the room stages as today, then hands the model a NARRATE envelope (the line, the card
it staged or the refusal it made, the reads, the plan, the doctrine slices) and streams the reply
under the card via onText, thinking pulse until first token. The reply is prose, not a shape: it
can never stage, amend, or un-stage anything, so the validator has nothing to refuse and the write
fence is untouched. A degrade (null, rate limit, timeout) leaves the deterministic sentence in
place: nothing is worse than today. Reads work the same way: the card is local and instant, the
model adds the one line of judgment the bundle cannot.

Where the deterministic sentence is already exact and short (a confirm, a "one decision at a
time"), the model is NOT consulted: narration is for anything a banker would expect a colleague to
comment on, not for chrome. The over-call rate on narration is measured with the rest.

## CONSENT RIDES THE GREETING (founder question 2026-09-02: "can we bake that into the chat?")

The platform shows a one-time per-view consent dialog on the first `sample` call, because the
viewer's own Claude usage is being spent. It cannot be suppressed or pre-approved by the page. It
CAN be placed. The room places it at the one natural moment: the workroom's opening line is the
first session call, made once at room open (an explicit banker action), with a prompt that is
stable across loads, so the dialog appears framed by the greeting and never mid-plan, never
between a card and its sentence. One call at open, memoized per view; every later call silent;
never from a timer or a loop.

Decline: one sentence, banker language, once per view: "Working from the file only. The desk is
not connected, so I will answer from what is here and stage what the engines can read." Then
today's behavior exactly. Not an error state.

Booth: open the room before the audience gathers; a reload is a new view and a new consent.

## THE MODEL RENDERS INTO THE ROOM'S OWN COMPONENTS (founder, 2026-09-02: "not only hard text")

Four channels, all drawn by the room, never by the model:
1. A read -> the room's READ CARD (groups, rows: icon, label, value, sub). The model composes
   the content; ReadCardView draws it. A list IS a read card.
2. A proposal -> real staged CARDS and CHIPS through restate + parser. The model never draws a
   card; it proposes, the engine stages, the room draws.
3. A question back -> the agent bubble WITH clickable OPTION CHIPS the model composed.
4. Narration -> the sentence under a card, prose by design so it can never stage, with LIGHT
   STRUCTURE allowed: a short bullet list or a bold figure, rendered in the room's typography
   (the existing agent-sentence styles, a list style if one is missing), never raw markdown
   characters on the glass. Cap narration at a few lines; it is a colleague's remark, not a memo.
The model cannot invent a component. Its vocabulary is the room's: cards, chips, lists,
advisories. A new shape is a design-round addition, never model-authored HTML. This is the census
and brand discipline holding while the model gets to be smart.

**The entity line item (2026-09-02) is a design-round addition to channel four, not a widening of
it by prompt.** A hyphen bullet that opens on a bold name followed by a colon renders as a ROW:
the name, the clause, and the entity's own figure in a right-hand rail. Its vocabulary is the READ
CARD's own row (`.wk-read-r` / `.wk-read-l` / `.wk-read-v` and the two tone rules), minus the type
icon, because three 20px glyphs inside an agent bubble read as a second card. The model may not
author it as HTML and it carries no control: no chip, no button, ever. **The value column comes
from the ENVELOPE and never from the model's text** - the model writes the name and the sentence,
the room resolves the figure out of the same envelope instance the model was handed, and a name
the envelope cannot resolve renders as an ordinary bullet with no rail and no placeholder.
