# The modification drive, third publish (2026-09-02 evening, drive-fixes in)

Supersedes MODIFICATION-DRIVE-SCRIPT-20260902.md. Same room, same rules (Acknowledge after a
commitment change; focus fee, exception and party lines by the facility chip; reload between full
runs). What changed since the founder's 11-change execute is marked NEW.

Before driving: I revert Hartwell to baseline (the new package version a5Fbb000000J4BBEA0 goes).

## PART 0 - the greeting (unchanged)
0a fab -> Facility Actions: lead line, line items, closing line with the three routes; the July 26
   mail in the greeting or as a second remark.
0b `who guarantees the construction loan`  0c `which covenant has the least cushion, and why`
0d Reload, Facility Actions, click Renew first: no modification talk.

## PART 1 - click Modify, then in order

| # | Type | Expect | Then |
|---|---|---|---|
| 1 | `increase the 15M line of credit to 20M` | ONE card $15M -> $20M | Confirm, **Acknowledge** COVERAGE THINS, then **NEW**: the room asks the amortisation term (chips 240 / 300 / Another figure / Leave pricing for later) and then the first payment date (chips are computed from the book's date, so type **1 October 2026** under "Another date"). Both land as rows on the same facility. "nCino needs the amount, the term, the amortised term and the first payment date before it will price this loan." |
| 2 | `give the 8M equipment loan a 84 month term` | ONE card | Confirm; the pricing ask appears only where the book lacks the fields (Equipment already carries 84 amortised; it will still ask the first payment date) |
| 3 | `move the construction loan maturity to 2029-06-30` | ONE card | Confirm |
| 4 | `move the 2.5M line of credit rate to 7.25%` | ONE card | Confirm |
| 5 | `add a Debt Service Coverage of Borrower covenant >= 1.30 tested quarterly on the 8M equipment loan` | three chips | **Associate the existing test** -> Confirm |
| 6 | `remove the Accounts Receivable covenant from the 15M line of credit` | carry-exclusion card | Confirm |
| 7 | `pledge the Fort Wayne equipment on the 2.5M line of credit` | asset chips | **Blanket lien on all production machinery and equipment** -> Confirm |
| 8 | `pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued at 6,500,000` | **NEW**: asks which Real Estate type with the org's eleven names as chips | click **Real Estate-Construction**, pick the rate (75 or 80), 1st lien -> ONE card CREATE AND PLEDGE -> Confirm. (If the org still refuses at execute, the refusal's list becomes chips; pick again.) |
| 9 | `remove the accounts receivable pledge from the 15M line of credit` | pledge carry exclusion | Confirm |
| 10 | `add Elena Hartwell as limited guarantor on the 8M equipment loan` | ONE card | Confirm |
| 10b | `add Hartwell Industrial Holdings as guarantor on the construction loan` | already Guarantor there; role change offered | Discard anything staged |
| 11 | `take Elena Hartwell off the 15M line of credit` | involvement carry exclusion, Limited Guarantor stamped | Confirm |
| 12 | Click **Line of Credit $15.0MM** chip, then `add a 1% origination fee` | ONE card 1.00% | Confirm |
| 13 | `log a policy exception for leverage above policy approved by credit committee` | **NEW**: asks which facility (chips), then waived / mitigated / unmitigated; the name is "Leverage above policy", the committee note travels as the mitigant | **$15.0MM Line of Credit** -> **Mitigated** -> Confirm |
| 14 | `what is on the plan` | **NEW**: rows grouped by facility, not a paragraph; 13 entries plus the two pricing rows on the $15M line (and the first payment date on Equipment if you answered it) | read it against this table |
| 15 | Review -> token -> **Execute** | a step per entry; approve stays closed if the org's plan misses one | tell me the moment it reports done or errors |

Amendments to try once, anywhere: `remove the Kokomo plant expansion pledge from the construction
loan` (un-stages YOUR entry, never the booked first mortgage); typing line 8 twice (one entry).

## Still true tomorrow
- A new facility cannot carry the pricing fields (the org tool takes product, amount, purpose and
  term only); the room says so on the plan instead of pretending.
- Figures in a remark that are not on the card are shown without emphasis and marked "figure not on
  the card". Figures written in words are not caught.
- Relationship tab says 7 facilities (the unbooked $3M proposal), the room says 6 booked.
