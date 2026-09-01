# The modification drive, as the screen actually shows it (2026-09-01, build label plan-fixes)

Every line below was driven headlessly on the PUBLISHED build before being written here. Where the
room answers with CHIPS first, the chip to click is named. Where a line is blocked by a known
finding, it says SKIP and why, so a refusal is never mis-scored as a bug.

Two rules that govern the whole drive:

- **After you Confirm a card, look for a check.** A commitment change raises "COVERAGE THINS"
  (committed goes to $51M against $31.60M lendable, 0.62x from 0.69x) with chips
  [Acknowledge] [Show the math]. Click **Acknowledge** before typing the next line. Until you do,
  every line gets "One decision at a time" - that is the law working, not a fault.
- **Name a facility by FOCUS, not by a dollar figure, on fee / exception / party lines.** "the 15M
  line of credit" is read by the engine as a $15,000,000 AMOUNT on those lines (a fee of $15M).
  Click the facility chip (Line of Credit $15.0MM) to focus it, then say the change without a
  figure. Commitment lines are fine with the figure (the qualifier filter rescues those).

## Open the room
fab -> Facility Actions -> the first chips are the ROUTE: [Modify] [Renew] [New facility].
Click **Modify**. The package blends in, then the six facilities.

## PART 1 - the modification, in order

| # | Type | What you see | Then |
|---|---|---|---|
| 1 | `increase the 15M line of credit to 20M` | ONE card: Line of Credit ($15M) $15M -> $20M. "Read that as the $15M Line of Credit. The other facility that line could have named is left alone." | **Confirm**, then **Acknowledge** the COVERAGE THINS check |
| 2 | `give the 8M equipment loan a 84 month term` | ONE card: Equipment ($8M) term -> 84 months | Confirm (no check expected) |
| 3 | `move the construction loan maturity to 2029-06-30` | ONE card: Construction maturity Nov 1, 2026 -> Jun 30, 2029 | Confirm |
| 4 | `move the 2.5M line of credit rate to 7.25%` | ONE card: Line of Credit ($2.50M) rate -> 7.25% | Confirm |
| 5 | `add a Debt Service Coverage of Borrower covenant >= 1.30 tested quarterly on the 8M equipment loan` | The room says DSC of Borrower already runs at relationship level at 1.25 quarterly, and offers chips [Put a second one on the facility] [A different test] | Click **Put a second one on the facility** -> ONE card: Equipment ($8M) DSC of Borrower >= 1.3 -> Confirm |
| 6 | `remove the Minimum Liquidity covenant from the 15M line of credit` | NOT STAGED card: "Detach Minimum Liquidity ... is a covenant DETACH, and this room does not file one" | Nothing to confirm. **Check that step 5's covenant is still in the manifest** - that is the E1 fix. PASS = refusal + nothing lost |
| 7 | `pledge the Fort Wayne equipment on the 2.5M line of credit` | Chips: the four assets on the book + [A new asset]. Both the inventory and the equipment lien mention Fort Wayne, so it asks | Click the **Blanket lien on all production machinery and equipment** chip -> ONE card: ADD SECURITY Line of Credit ($2.50M) ... "no advance rate for you to set here" -> Confirm |
| 8 | `pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued at 6,500,000` | **REFUSED on this build**: "Creating an asset the bank has never lent against needs an advance rate recorded on the pledge, a credit decision out of the approved credit terms rather than something I will set" + chip [Pledge something the deal already carries] | **Your decision (N2)**: wave 2 proved the org resolves the advance rate itself, so the room's block is over-cautious. Observe the refusal, do not fight it, tell me whether to lift the block |
| 9 | `remove the accounts receivable pledge from the 15M line of credit` | NOT STAGED card, refusal by name (wording says "covenant DETACH" - wrong noun, logged as N1, cosmetic) | Nothing to confirm. PASS = refusal |
| 10 | `add Elena Hartwell as limited guarantor on the 8M equipment loan` | ONE card: ADD BORROWING STRUCTURE Equipment ($8M) Elena Hartwell -> Limited Guarantor. "The row is authored on the clone." | Confirm |
| 10b | `add Hartwell Industrial Holdings as guarantor on the construction loan` | **KNOWN FAIL, SKIP the confirm**: it stages a second Guarantor row and says "not on the facility today" (false). The room's read holds 6 of the org's 21 involvements because the graph tool queries by the anchor account only (N4, Apex). | Type it if you want to see it, then **Discard**. Not scored until N4 lands |
| 11 | `take Elena Hartwell off the 15M line of credit` | **SKIP** - same N4: Elena's Limited Guarantor row is not in the read, so the role cannot be stamped and the org refuses as it did this morning. | Skip until N4 lands |
| 12 | Click the **Line of Credit $15.0MM** facility chip to focus it, then `add a 1% origination fee` | ONE card: ADD FEE Line of Credit ($15M) Origination fee -> 1.00% of the committed amount | Confirm. (I verify org-side that it reprices off the MOVED $20M = $200,000) |
| 13 | Still focused, `log a policy exception for leverage above policy approved by credit committee` (no comma) | Chips: "Is that waived, mitigated, or standing unmitigated? The org defaults to Unmitigated, which reads as a decision, so I will not take that default" | Click **Mitigated** (or whichever you mean) -> ONE card -> Confirm |
| 14 | `what is on the plan` | "The manifest holds N: ..." - expect **9** filed items (1,2,3,4,5,7,10,12,13) plus the two refusals recorded as not-staged | Read it back against this table |
| 15 | Review -> the token mints -> **Execute** | Thinking pulse, then the write-back through the glass | **Tell me the moment it reports done or errors.** I SOQL-verify every wire on the new version, then revert Hartwell to baseline |

Governor fallback: if the execute trips an Apex limit, that is a result, not a failure. We record
the boundary and split into the wave-2 groupings.

## PART 2 - new facility, and PART 3 - renewal honesty
Unchanged from knowledge/EVERYTHING-PLAN-SCRIPT-20260901.md. Run after I confirm baseline is
restored from Part 1.

## What this drive proves and what it cannot
PROVES: four scalar families, covenant add with book-dedupe, both remove fences, pledge-existing
with asset disambiguation, involvement add with the role as the value, fee repricing off the moved
commitment, the policy-exception decision elicitation, the manifest, the token, the relay, the org.
CANNOT YET: the duplicate-guarantor trap, the carry-exclusion remove, the guarantors read card - all
three wait on the Apex read fix (N4). Create-then-pledge waits on your advance-rate call (N2).
