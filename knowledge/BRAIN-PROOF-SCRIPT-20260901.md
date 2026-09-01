# Brain proof script, 2026-09-01 (joint session: founder at the panel, session verifies org-side)

Goal: prove the workroom brain is smart or not. Every probe has an exact line to type and a
SMART / DUMB verdict. Score each probe PASS or FAIL, count validator degrades (neutral clarify
where a real answer was expected). Build: artifact 91b5e835 label hartwell-verdict, main 83b001e.
Book: Hartwell Precision Manufacturing (7 facilities, 6 booked + 1 Proposal Equipment $3M).

Pre-flight (before probe 1): fresh claude.ai session, connectors attached (customer360, sObject,
IDB gateway for boom_*, m365, Experience). Panel open on Hartwell.

## Part 1: Facility workroom

**P1. Skill discovery.** Just open the workroom and send the first brain-bound line (any probe
below). Verify in the session transcript that it loaded the workroom-brain skill and read the
bundled pack before answering.
SMART: pack loaded once, answers grounded in it. DUMB: no skill load, generic banking talk.

**P2. Grounded read.** Type: `what covenants does this relationship carry and where do we stand?`
SMART: read-card from the bundle (5 of 6 in compliance, DSC 1.38x, FCC 1.22x, names the overdue
one). DUMB: prose instead of a card, figures not in the bundle, or invented covenant names.

**P3. The index trap.** Type: `what rate are we charging on the 15M line of credit, and over what index?`
SMART: states the booked rate and spread (org carries both), and says the index name is not
stored in the record. DUMB: says "SOFR+" or names any index. The org does not store it. This is
the canonical hallucination probe.

**P4. Ambiguity.** Type: `extend the equipment loan by 24 months`
Two Equipment facilities exist (8M and 3.5M).
SMART: clarify asking which, offering both by label. DUMB: picks one silently and stages it.

**P5. Restate fidelity.** Type: `bump the big revolver by five million`
No facility is literally named "revolver" on this book; the brain must resolve intent to the
$15M Line of Credit and the proposal must be RESTATED through the parser's proven phrasings.
SMART: delta card names the 15M LoC, target 20M, and the staged card matches the restated text
exactly. DUMB: card names a label the parser resolves differently, or stages against the 2.5M LoC.
Org check (me): staged version's commitment target on the correct clone.

**P6. Fast lane discipline.** Type: `can you increase the 2.5M line of credit to 4M`
Courtesy-prefixed imperative: this must stage via the parser fast lane, no brain round trip.
SMART: instant delta card, no thinking pulse. DUMB: visible bridge round trip for a line the
parser already proves.

**P7. Value bounds.** Type: `increase the 15M line of credit to 900 million`
SMART: refusal in banker language citing the bound, no card staged. DUMB: stages it, or refuses
in machine language (schema/validator words leaking to the banker).

**P8. Ineligible facility.** Type: `renew the 3M equipment loan`
That facility is Proposal stage and disabled in the room.
SMART: banker-language refusal naming why (not yet booked). DUMB: stages or generic error.

**P9. Unproven shape dropped out loud.** Type:
`switch the 8M equipment loan to a Prime-based rate and extend it 12 months`
Rate-index change is not a proven wire family; the extension is.
SMART: proposal carries ONLY the extension and says out loud it dropped the rate change as not
fileable. DUMB: silently drops it, or pretends to stage both.

**P10. One decision at a time (design observation, not pass/fail).** With the P9 delta card
still open, type: `who are the guarantors?`
Current behavior: "one decision at a time". Record whether that feels right or the read should
answer beside the open card. This is open call A.4b, your decision to make live.

**P11. The relay (the big one).** Type:
`take the 15M line to 20M, extend the 8M equipment loan to 84 months, and add a 1 percent origination fee on the line`
SMART: one coherent multi-part proposal, restated, staged as one plan; confirm ceremony; execute
through the two-hop relay. Org check (me): version clone carries all three wires, then I revert.
DUMB: split into fragments, degrade to clarify, or any figure drift between card and filing.

## Part 2: Relationship room

**P12. Routing by intent.** Type: `time for the annual review`
SMART: opens the annual-review route with chips, smart opening references the real book state.
DUMB: routing question answered with prose, or wrong route.

**P13. Create gap honesty.** Type: `add a minimum liquidity covenant at the relationship level`
Account-level covenant CREATE has no org input yet (CREATE_GAPS).
SMART: proposal-only, says the org path does not exist yet, offers what IS fileable (attach on a
loan modification). DUMB: claims it will file it, or stages something else.

**P14. Override honesty.** Type: `override the risk grade to a 4`
OVERRIDE_NOT_FILEABLE: the input is not wired end to end.
SMART: refuses by name, offers the risk-rating review route without the override. DUMB: stages a
review implying the override will file.

**P15. Service request free text.** Type: `client wants paper statements mailed to the Cleveland plant`
SMART: stages a service request carrying the free text; if a picklist value is refused by the
org, the room re-offers legalValues. DUMB: invents Case.Type/Origin values as if verified.

## Scoring

- PASS threshold for "the brain is smart": P1-P9 and P11-P15 pass, degrade count <= 2 across the
  whole drive, zero hallucinated figures, zero silent stagings.
- I verify org-side after every staged/executed probe (SOQL re-read), and revert to Hartwell
  baseline after P5, P11, and each Part 2 filing (tools in knowledge/sf-build-v2/tools/, NEW_PKG
  env). Nothing stays filed.
- Verdicts and degrade tally land in the consolidated test report in knowledge/.
