# Brain proof results, 2026-09-01 (joint drive, founder at the panel)

Script: knowledge/BRAIN-PROOF-SCRIPT-20260901.md. Build: artifact 91b5e835 label
hartwell-verdict, main 83b001e. Org: bankinggpt-at, Hartwell baseline verified clean before and
after the drive (1 package, 7 loans; no filings reached the org - nothing to revert).

## Verdict, one line

The brain is not dumb - it is unreachable. The deterministic machinery is safe and honest but
literal; every line that needed intelligence was routed AWAY from the component built to supply
it, and when the brain was reached it was fed an empty envelope over a tool-less wire.

## Probe results

| # | Probe | Result |
|---|---|---|
| P1 | Skill discovery | Not separately observed (panel session loaded; no evidence either way) |
| P2 | Covenant read | FAIL-honest: brain reported "data not carried" while the bundle holds it |
| P3 | Rate + index read | Degrade #1: malformed brain reply, validator served neutral clarify |
| P4 | Ambiguous equipment | Skipped at the panel |
| P5 | "bump the big revolver by five million" | FAIL: parser-only, "big" ignored, delta form unread, brain never consulted. Honest miss, nothing staged |
| P6 | Polite command, "the 2.5M line of credit to 4M" | Fast lane PASS; resolution FAIL: staged on BOTH LoCs incl. 15M->4M reduction. Drawn-balance advisory correctly fired on the unsound card |
| P7 | 900M bound probe | FAIL: staged without any objection; no magnitude concept exists (unsoundFieldChange = misparse shapes only) |
| P8 | Renew Proposal-stage loan | Route lock fired first (correct, honest escape offered). Eligibility refusal itself unobserved |
| P9 | Prime-based rate + 12mo extension | Rate half PASS (best answer of the drive: spread-vs-absolute doctrine, fileable path offered). Extension half unaccounted - card presence unconfirmed |
| P10 | Guarantors (card open) | FAIL-honest: brain blind again (guarantors ARE in the bundle involvements). Gate observation moot (P9 ended in refusal, no open card - correct per thread-collapse fix) |
| P11 | Three-part relay line | HARD FAIL: one misparsed card staged (1% INTEREST RATE on Equipment $8M), commitment change and extension silently dropped. Card discarded at the panel, org untouched |

Degrade tally: 1 (P3). Hallucinated figures: 0. Silent stagings that reached the org: 0.
Safety record: perfect. Smartness record: P9's rate doctrine, alone.

## Findings

- **F1** Pre-route gate swallows read questions: the modify/renew/new opening intercepts every
  line; isQuestion/read-card path exists only behind the route bind. (Workroom.tsx say(),
  route-open branch.)
- **F2** The brain envelope is blind: BrainEnvelope carries line + facility labels + staged plan
  only. No covenants, involvements, collateral, pricing. The wire is a one-shot gateway
  completion with NO tool doors, while the code comment assumes "the brain reads the live org
  through its own tools." Proven empirically 3x (P2, P3, P10).
- **F3** Instructions never route to the brain: the lane split is questions->brain,
  instructions->parser, unconditionally. The brain's delta-proposal shape and the restate
  machinery (restateProposal, proven-phrasing discipline) exist but are unreachable from any
  imperative line.
- **F4** Dollar-qualifier ignored in member resolution: "the 2.5M line of credit" and "the 15M
  line of credit" both landed on ALL facilities of the product type. Struck twice (P6, P7).
  Resolution lives in the fenced engine; any fix must be pre/post-parse outside the fence.
- **F5** No magnitude bound: $900M staged on a $49MM package with no advisory. unsoundFieldChange
  covers misparse shapes only, and only fieldWire deltas.
- **F6 (provisional)** Multi-clause instruction lines collapse: P11's three clauses produced one
  wrong delta with two silent drops. The engine's own multi-change path ("That is N changes")
  did not engage on this phrasing.

## The fix (founder call 2026-09-01: fix now, retest after)

All outside the byte-untouchable engine fence (app/src/workroom/ untouched). No new write arms,
so C360WriteGuard/transitionAllowlist untouched (BOTH-GUARDS not in play).

1. **Reads local-first** (F1+F2 read half): known read topics (covenants, borrowers/guarantors,
   collateral, fees, exposure) answered from the bundle ALWAYS - pre-route too - brain only for
   topics the bundle cannot answer.
2. **Envelope enrichment** (F2): ship the bundle's read blocks in the envelope so brain answers
   are grounded when the brain IS the right responder.
3. **Parser-miss fallback** (F3): an instruction the parser cannot fully read routes to the
   brain; a returned delta-proposal is restated through proven phrasings into the parser (the
   restate discipline already exists); a clarify/degrade falls back to today's behavior. Nothing
   gets worse when the channel is absent.
4. **Clause pre-split** (F6): split multi-clause instruction lines outside the fence, feed
   clauses individually, route unreadable clauses to the brain, and SAY what was dropped.
5. **Qualifier filter** (F4): post-parse, outside the fence: where the line carries a dollar
   qualifier matching exactly one resolved member, drop the siblings before chips render.
6. **Magnitude advisory** (F5): client-side advisory tier (same pattern as drawn-balance) for
   commitment changes beyond a multiple of package commitment.

Acceptance: rerun BRAIN-PROOF-SCRIPT-20260901.md end to end; P2, P5, P6, P7, P10, P11 must flip.
