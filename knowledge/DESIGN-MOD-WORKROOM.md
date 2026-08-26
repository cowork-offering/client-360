# The Modification Workroom (design spec, co-designed with Fabian 2026-08-26)

Deadline: functional for Sept 1 freeze. Mechanics exist (24 tools, staged plan/token/execute,
challenge engine, chat surface, gateway LLM tool); this is a front-end reshape.

## Thesis
A modification is not a form. It is a conversation that COMMITS. The banker talks the change into
shape in natural language; the system parses, validates, proposes; confirmed changes accumulate in
a live manifest; one approval executes everything as real nCino records. The chat is an operator.

## Scope of change (full bang, Fabian)
Terms (amount/rate/term/maturity) · covenant changes (add/tighten/waive) · collateral changes
(pledge/release/revalue) · policy exception with mitigants. All ride ONE clone, ONE staged plan,
ONE token. Package-anchored, members 1..N (doctrine).

## The surface
- LEFT: the conversation. Native language in; agent replies with structured DELTA CHIPS
  (LLM parse via gateway get_llm_response, then DETERMINISTIC validation against org fields,
  picklists, guards; invalid parses never become chips). One tap confirms a chip into the manifest
  ("propose, one-tap confirm"). Sleek loading/streaming feel.
- RIGHT: the CHANGE MANIFEST. Two columns of truth: WHAT WE HAVE (current facility/package state)
  -> WHAT THIS MODIFICATION CHANGES (confirmed deltas, landing with a visible "Covenant added"
  moment, Cowork-style). Each entry knows its org mapping and shows it on expand.
- TOP: the deal context strip (package name, members, the facility in question hero'd) + the
  AGENT'S POSITION: one recommended structure with cited reasoning, alternatives one click away
  (may recommend a NEW FACILITY instead of an increase when the analysis says so).
- Challenge cards inline (live-fresh figures), decision-oriented.

## Entry ("read the room")
Via the Modification action OR a client request. If an email exists: pinned verbatim, figures
highlighted, manifest pre-seeded from the interpreted ask, analysis pre-run (arrive-and-it's-done).
If no email exists the flow never mentions email.

## The ending
Approve -> token redeemed -> manifest flips to FILED per entry with real ids (clone, RL junctions,
covenant rows, pledge rows) verified by re-query -> drafted client reply appears as the closing
move (full loop). Stay in the workroom.

## Governance (unchanged, non-negotiable)
Chips = staged intent only (zero DML). One human approval = the single-use token moment. Execute
delegates to the proven org mechanics. Org warnings verbatim. Approver == running identity.
Decision-support framing (SR 26-2): the agent recommends, the banker decides.

## Build plan
1. Static clickable mock (real Hartwell figures, full storyline incl. pre-analyzed email entry,
   chip confirm moments, filed state, reply draft) -> own artifact -> Fabian co-designs by comments.
2. Wire Aug 27-31: chat parse (get_llm_response + validators), manifest state, plan composition
   (the staged plan already accepts everything), filed-state rendering. Freeze Sept 1.
Interim fixes shipping independently: drift guard compares figures not timestamps + offers
"refresh and re-stage"; every member count reads "N of M".
