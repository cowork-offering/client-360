# The modification drive, second publish (2026-09-02, removes + duplicates fix + greeting-v2)

Supersedes knowledge/MODIFICATION-DRIVE-SCRIPT-20260901.md. Every line here is what the SECOND
PUBLISH of 2026-09-02 is built to do; where a line was a refusal yesterday and stages today, it
says so. Drive it in a FRESH claude.ai session with Customer 360, IDB Gateway and Microsoft 365
attached; allow the consent dialog on the greeting. Reload the page between full runs (a second
room open in the same page replays the first greeting; known, not fixed for the demo).

Two rules that still govern the drive:

- **After you Confirm a commitment change, click Acknowledge** on the COVERAGE THINS check before
  the next line. Until you do, every line gets "One decision at a time".
- **Fee, exception and party lines: focus the facility by its chip**, then say the change without a
  dollar figure. Commitment lines are fine with the figure.

## PART 0 - the greeting (greeting-v2)

| # | Type | Expect |
|---|---|---|
| 0a | fab -> Facility Actions | One lead line, then LINE ITEMS (covenants with threshold and actual, the guarantors, the plan), one closing line offering Modify / Renew / New facility. No modification talk before you choose. If your mailbox mail (Jul 26, "Increase of Line of Credit", 15Mio to 20Mio) comes back inside about a second it is in the greeting and the close points at the modification; if later, it lands as a second remark under the greeting |
| 0b | `who guarantees the construction loan` | Holdings (Guarantor), James Hartwell (Guarantor), Elena Hartwell (Limited Guarantor), each ONCE |
| 0c | `which covenant has the least cushion, and why` | Line items, not a paragraph; reasoned from actuals against thresholds |
| 0d | Reload, Facility Actions, click **Renew** first | The bound room never speaks in modification terms |

## PART 1 - the modification, in order (click **Modify** first)

| # | Type | What you see | Then |
|---|---|---|---|
| 1 | `increase the 15M line of credit to 20M` | ONE card: Line of Credit ($15M) $15M -> $20M, remark under it | **Confirm**, then **Acknowledge** COVERAGE THINS |
| 2 | `give the 8M equipment loan a 84 month term` | ONE card: Equipment ($8M) term -> 84 months | Confirm |
| 3 | `move the construction loan maturity to 2029-06-30` | ONE card: Construction maturity -> Jun 30, 2029 | Confirm |
| 4 | `move the 2.5M line of credit rate to 7.25%` | ONE card: Line of Credit ($2.50M) rate -> 7.25% | Confirm |
| 5 | `add a Debt Service Coverage of Borrower covenant >= 1.30 tested quarterly on the 8M equipment loan` | THREE chips: [Create a second one on the facility] [Associate the existing test to this facility] [A different test]. The existing DSC of Borrower is relationship-level with no junction to this loan | Click **Associate the existing test** -> ONE card ASSOCIATE (junction only, threshold and schedule stay) -> Confirm. (Or Create -> a new 1.30 covenant on the facility) |
| 6 | `remove the Accounts Receivable covenant from the 15M line of credit` | NEW TODAY: ONE card COVENANT CARRY EXCLUSION: Accounts Receivable will not carry onto the new version of the $15M line; the booked loan keeps it; nothing is deleted | Confirm. **Check that step 5's entry is still on the manifest** |
| 6b | `remove the Minimum Liquidity covenant from the 15M line of credit` | REFUSAL BY DESIGN: Minimum Liquidity sits at relationship level on Hartwell with no loan junction, so there is nothing on this facility to leave behind; the room says where it lives | Nothing to confirm. PASS = refusal that names the level |
| 7 | `pledge the Fort Wayne equipment on the 2.5M line of credit` | Chips: the assets on the book + [A new asset] | Click **Blanket lien on all production machinery and equipment** -> ONE card ADD SECURITY -> Confirm |
| 8 | `pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued at 6,500,000` | NEW SINCE YESTERDAY: the room asks the advance rate with chips (75% / 80% band, labelled as the bank's guideline), then the lien position, then stages ONE card CREATE AND PLEDGE | Pick a rate, pick 1st lien -> Confirm. (I verify the org resolved lendable value itself) |
| 9 | `remove the accounts receivable pledge from the 15M line of credit` | NEW TODAY: ONE card PLEDGE CARRY EXCLUSION: "All present and future accounts receivable" will not carry onto the new version; the booked loan keeps the pledge; the asset is not touched. Collateral language, never "covenant" | Confirm |
| 10 | `add Elena Hartwell as limited guarantor on the 8M equipment loan` | ONE card ADD BORROWING STRUCTURE Equipment ($8M) Elena Hartwell -> Limited Guarantor | Confirm |
| 10b | `add Hartwell Industrial Holdings as guarantor on the construction loan` | NEW TODAY: the room says Holdings is ALREADY Guarantor on Construction and offers a role change instead of staging a duplicate | Do not confirm anything; **Discard** if a card appears |
| 11 | `take Elena Hartwell off the 15M line of credit` | NEW TODAY: ONE card INVOLVEMENT CARRY EXCLUSION with the role stamped from the book: Elena Hartwell, Limited Guarantor, will not carry onto the new version of the $15M line | Confirm |
| 12 | Click the **Line of Credit $15.0MM** chip to focus, then `add a 1% origination fee` | ONE card ADD FEE Origination fee -> 1.00% of the committed amount | Confirm (I verify it reprices off the MOVED $20M = $200,000) |
| 13 | Still focused, `log a policy exception for leverage above policy approved by credit committee` | Chips: waived / mitigated / unmitigated | Click **Mitigated** -> ONE card -> Confirm |
| 14 | `what is on the plan` | The manifest read back: expect **13** entries (1,2,3,4,5,6,7,8,9,10,11,12,13); exclusions named as exclusions, the associate as an association | Read it against this table |
| 15 | Review -> the token mints -> **Execute** | The org's plan comes back with a step per entry, including covenant_exclusion / pledge_exclusion / covenant_associate steps; the write-back rolls through the glass; the activity trail names the arms only where the org verified them | **Tell me the moment it reports done or errors.** I SOQL-verify every wire on the new version, then revert Hartwell to baseline |

If the org's plan comes back WITHOUT a step for one of the exclusions, the room says so and the
Approve button stays disabled. That is the gate working; tell me which entry it named.

## PART 2 - new facility, PART 3 - renewal honesty
Unchanged from knowledge/EVERYTHING-PLAN-SCRIPT-20260901.md. Run after I confirm baseline is
restored from Part 1.

## Known and accepted for tomorrow
- Relationship tab says the borrower is on 7 facilities; the room says 6 booked. The graph read
  carries the unbooked $3M Proposal Equipment loan. One-line answer if asked.
- The mail's route offer is the closing line, not a clickable chip; the route chips are already
  on the glass.
- Hartwell is the only one of the five bundled borrowers with a client mail in the mailbox.
- Multi-package relationships and the relationship room's greeting are after the demo.
