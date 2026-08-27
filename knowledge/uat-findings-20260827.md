# Workroom preview UAT findings — Fabian, 2026-08-27 (artifact 91b5e835, 10 comment threads)

## W1 — ENGINE DESIGN (feeds the Aug 28 wiring directly) [thread dd391648]
Verbatim intent: never work outside the Product Package; ORDER OF EXECUTION must be defined —
mod (clone) FIRST, then covenants / collateral additions land on the clone; you cannot create
everything at once in bulk. Must support add/REMOVE borrowers (legal entities) on the modification.
A modification can change: covenants, collateral pledges, borrowing structure (loan level), policy
exceptions, loan detail fields, package fields. Loan/package FIELDS MUST BE INDEXED so natural-
language amendments map to the correct real fields (cf. the LLC_BI__InterestRate__c lesson).
→ Real ModifyEngine = ordered plan composer: step 1 credit-action clone, steps 2..n mutations on
outputLoanId/clone junctions, sequenced; field catalog for loan+package amendment mapping;
entity-involvement add/remove steps.

## W2 — Chat holds manifest state + amendments [0c4fbb7c]
The chat must speak about what is staged and accept amendments conversationally (not only the
rail's ×). Deepens remove-and-re-say: staged items are addressable in conversation.

## W3 — Suggestions at entry; merge composer with entry point? [d3a10e95]
DECIDED (Fabian, 2026-08-27): MERGE. One scene — the personal briefing with suggestion chips IS
the entry, input right there, no "Open the conversation" button. Chat is protagonist from second one.

## W4 — Package strip shows PROP $3.0MM as if confirmed [2f5089a8]
It is Hartwell's real Proposal facility (showcase), but pre-work display reads as done work.
Pending/proposal members need a visually distinct "not yet work" treatment.

## W5 — Entry scene: personal quiet briefing [2f5089a8]
"hey Fabian… this has happened on the relationship, warnings etc" — subtle chips, clean; currently
both empty AND cluttered. Polish wave, but the DATA (relationship events/warnings) comes from
reads wired in the wiring wave (StructuralSignals / ActionHistory).

## W6 — OVERALL RULE [115f0000]
Subtle, elegant VISUALS over text. Everywhere. Current copy too technical. Polish-wave law.

## W7 — Point fixes (polish) [207fe68e, 336a4afc, 7c10237c, 1a4b73af]
- Font color wrong on flagged button (thread anchor recorded in artifact comments).
- Two spots read "vibecoded" (flagged elements).
- More interactivity in flagged sections.
- 1a4b73af: pre-commit state display, likely static-mock artifact; re-check after wiring.
- Rail folding at 4 entries: DECIDED right treatment (Fabian, 2026-08-27). Keep fold + peek.

## Acceptance bar [67fb52ec — replied in thread]
65% today → Apple-grade, uncluttered, cinematic typographic ">" loading, zero vibecoded feel.
21st.dev = reference catalog only; hand-choreograph on our tokens.
