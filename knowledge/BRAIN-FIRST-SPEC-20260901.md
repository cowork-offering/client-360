# Brain-first lane inversion - build spec (founder go 2026-09-01)

Founder verdict from the joint drive (see BRAIN-PROOF-RESULTS-20260901.md): "there is no agent in
the room - it feels step by step, not intuitive chat." Direction: invert the lanes so the brain
IS the room's conversationalist, for BOTH rooms (Facility workroom and Relationship room - his
quick test says the Relationship room feels equally mechanical).

## The inversion

TODAY: free text -> route gate -> question guard -> parser. Brain = questions-only, blind
envelope, one-shot tool-less completion. Machinery talks; agent is a fallback oracle.

TARGET: free text -> brain (fully grounded), with the parser as the brain's STAGING HANDS.
The doctrine stands: agent proposes, machinery validates, human approves. The brain never writes.

## Hard constraints (non-negotiable)

1. ENGINE FENCE: app/src/workroom/ is byte-untouchable. SHA-attest before and after.
2. No Apex, no org-write changes. C360WriteGuard.cls and transitionAllowlist.ts untouched
   (BOTH-GUARDS not in play; if you believe you need them, STOP and flag instead).
3. Safety invariants proven in the drive MUST survive:
   - nothing stages except through restateProposal's proven-phrasing discipline + parser + the
     human confirm ceremony;
   - malformed/oversized/unknown brain replies degrade to the neutral clarify, never render
     broken, never stage;
   - unproven shapes in a proposal are dropped OUT LOUD, never silently;
   - channel-none (no mcp capability) behaves exactly as today - snapshot-honest, no waits.
4. No em dashes in any UI copy. Banker language on the glass (bankerly filter stays).
5. NEVER git add -A. Commit trailers on non-trivial commits.

## The dispatch rule (both rooms)

For a free-text line when brainReachable():

1. READS LOCAL-FIRST: if readTopic() maps the line to a topic the bundle answers (covenants,
   borrowers/guarantors, collateral, fees, exposure), serve the LOCAL read card immediately -
   including while the route question is open (fixes F1: a read does not pick an engine and
   must not bind or be swallowed by the route gate).
2. FAST PATH: strip politeCommand as today; run the parser. Accept the parser's result WITHOUT
   the brain ONLY when it is provably clean: it staged at least one delta, the line is single-
   clause, AND no dollar-qualifier in the line contradicts the resolved member set (F4 check).
   This keeps the instant-card feel for proven phrasings.
3. EVERYTHING ELSE -> BRAIN: unparsed lines, partial reads, multi-clause lines, qualifier
   conflicts, and questions the bundle cannot answer. The brain's delta-proposal is restated
   through proven phrasings into the parser per clause; restate drops are said out loud. A
   clarify renders as conversation. A degrade falls back to today's parser reply so the
   experience is never worse than the status quo.
4. While the route question is open, a brain reply may also RESOLVE the route (the brain names
   modify/renew/create from intent) - but binding still happens through router.onBind, and an
   ambiguous intent still asks.

## The envelope (F2)

Extend BrainEnvelope (bump v) with, budget-capped:
- the bundle's read blocks: covenants (names, thresholds, last evaluation, status), involvements
  (borrowers, guarantors incl. corporate/person split, roles), collateral (assets, advance
  rates, lendable), fees, exposure/committed/drawn, pricing facts AS STORED (rate, spread;
  NEVER an index name - the org does not store one, and the prompt must say so);
- a digest of the conversation thread (last N exchanges, banker lines verbatim, agent lines
  summarized) so the brain holds context across turns - this is what makes it feel like chat;
- the staged plan as today.
Keep the serialized envelope under a sane cap (~8-12KB); prefer dropping thread history over
read blocks when trimming. The prompt preamble keeps the three-shape contract and adds the
grounding facts contract: answer READS from the envelope blocks; never invent a figure; the
index-name prohibition stated explicitly.

## Safety filters that land regardless (outside the fence)

- F4 QUALIFIER FILTER: post-parse in the shell layer: if the line carries a dollar amount
  qualifying a product reference and exactly one resolved member matches it, drop the sibling
  deltas before chips render, and say so ("read that as the $2.5M Line of Credit").
- F5 MAGNITUDE ADVISORY: a commitment change taking a facility beyond 2x the package's total
  committed (or below zero) raises an advisory challenge in the same pattern as the drawn-
  balance advisory: staged but challenged, banker language, offers the plausible correction.

## Relationship room

Same dispatch rule. Find where the Relationship room routes free text (it re-clothes the staged
flows in reviewFlows.ts; likely shares the Workroom shell); if the plumbing is shared, one fix
covers both - add room-specific tests anyway. Its refusal honesty (CREATE_GAPS,
OVERRIDE_NOT_FILEABLE) must be expressible through the brain lane too: the envelope carries the
route's fileable/not-fileable map so the brain refuses by name instead of inventing capability.

## Mechanical green (merge bar)

- All existing tests stay green (2262 at handoff) + new tests for: the dispatch rule (each
  branch), envelope enrichment + cap, local-first reads pre-route, qualifier filter, magnitude
  advisory, thread-digest inclusion, degrade paths, channel-none parity, relationship-room
  parity. relSession tests must close the room (module-global store).
- tsc clean, vite build green, probe suite + census against the ASSEMBLED artifact (assemble
  reads artifact/customer-360-template.html - run the release chain, never hand-cp), census
  glassRimViolationCount = 0.
- Engine fence SHA-attested in the merge commit message.
- Acceptance: knowledge/BRAIN-PROOF-SCRIPT-20260901.md rerun - P2, P5, P6, P7, P10, P11 flip;
  P9's extension half accounted; degrade budget holds.

## Out of scope

Auto-sync/dynamic book, Addendum 2 port, collateral/financials design round 2, any org arm from
backlog B. Do not touch design/dummy/* (parallel design session owns it).
