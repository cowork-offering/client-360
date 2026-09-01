# Create grammar phase 1 - recovery + drive findings, 2026-09-01 evening

The build agent (opus) was STOPPED before committing or self-reporting when the prior session
exited. Work recovered intact from the worktree, secured to branch create-grammar at be63010.
Driven headlessly against the assembled build (stubbed gateway door). NOT merged: two findings
block it. What landed is strong; the gaps are narrow.

## Mechanical state (all verified independently)
- 2421 tests green (+79 new), tsc clean, npm build clean.
- Engine fence app/src/workroom/ tree 91c751e427232bf2b62c14b9cf92921e497496c9 - identical to main.
- Guards untouched (transitionAllowlist.ts, no Apex).
- New modules: elicit.ts (1307 lines), steer.ts (102), + 3 test files (~1019 lines).
- NOT done by the agent: design/proposals addendum, commit, self-report.

## What works, and works well (the founder's actual ask)
- **Underspecified covenant ELICITS, never stages hollow.** "add another covenant to all of the
  loans" -> asks scope: "All 6 / The 2 Line of Credit facilities / The 2 Equipment facilities /
  [each]". D1 (fragment value) and D2 (dropped scope word) both fixed.
- **Grounds proposals in the BOOK with real thresholds.** "add a covenant on this facility" ->
  "This relationship already runs Debt Service Coverage of Borrower quarterly, Maximum Debt to
  Worth quarterly..." offered as chips carrying their actual values ("Debt Service Coverage of
  Borrower at 1.25", "Maximum Debt to Worth at 3", "Minimum Liquidity at 5,000,000").
- **Duplicate detection at relationship level.** Picking a covenant already on the book ->
  "already runs at the relationship level at 1.25, tested quarterly, so it already reaches every
  facility. Nothing here needs putting up twice. [Put a second one] [A different test]". This is
  the "knows what is on the relationship" requirement, working.
- **Catalog disambiguation.** "add a DSCR covenant of 1.25x..." -> "The bank's catalog carries two
  tests in that family... Debt Service Coverage of Borrower / with and without Distributions."
- **Steering.** "modify a different facility" -> surfaces the 6 facilities as choices. "add a new
  loan" -> opens the new-facility path (chrome switches to Structure + "Add another Line of Credit").
- **D3 fixed.** No narrative contradicting the chip.

## Findings that block the merge

**F-CG1 - a COMPLETE covenant line re-elicits instead of staging.** "add an interest coverage
covenant of 3.0x tested quarterly on this facility" - fully specified - did NOT stage a card; it
dropped into the elicitation gather and re-listed the book's covenants, never acknowledging the
typed test, threshold or frequency. This violates grammar spec rule 3 ("free text always wins... a
banker who types the whole answer skips the questions"). On main, an equivalent complete line
staged a card directly. Two sub-cases:
  - a test NOT in the org catalog (interest coverage) should be NAMED as not-in-catalog, not
    silently re-elicited;
  - a complete, in-catalog, non-duplicate line should stage (or one-tap confirm), not re-ask.

**F-CG2 - amendment-in-place unverified.** "actually make it 1.30x" could not be confirmed against
a staged covenant card, because every grounded proposal offered in the drive was a book duplicate
(caught by F-CG1's sibling logic) and the fresh paths ("Put a second one", "A different test") were
not followed to a staged card. Amendment may well work; it is simply UNPROVEN, and the spec makes
it a first-class requirement, so it must be demonstrated before merge.

## Not yet driven at all (phase-1 scope, unverified)
- Collateral elicitation end to end.
- Situational awareness rule "a line touching something already staged amends that entry" (the
  plan-level dedupe, distinct from the book-level dedupe which IS proven).
- Channel-none parity for the elicitation.
- Both findings on the RENEW and NEW-FACILITY routes and the relationship room.

## Recommended next step
Send back to a focused agent (or continue the stopped one) to: fix F-CG1 (complete line stages or
one-tap confirms; out-of-catalog test named honestly), demonstrate F-CG2 with a test, and drive
collateral + plan-level dedupe + channel-none. Then re-drive the whole founder line set and merge.
Do NOT merge be63010 as-is.
