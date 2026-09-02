# Demo runbook, Sept 3 evening

One page, read it on your phone before you go up. Relationship: Hartwell (six booked facilities,
$46.0MM committed, 22 party rows). Org: bankinggpt-at (accenture-d8--bankinggpt.sandbox.my.salesforce.com).

## SETUP

- Fresh claude.ai session, not a continued one. Attach all three connectors: Customer 360, IDB
  Gateway, Microsoft 365. If any is missing the room still opens, it just knows less.
- Artifact: https://claude.ai/code/artifact/91b5e835-5536-4f23-950e-4cde7941cf7f, label
  third-publish. Open it and let it load fully before touching anything.
- A one-time consent dialog appears ON the loading page itself. Allow it. It will not ask again
  this session.
- Open Hartwell, then click Facility Actions. That is the room you drive the whole arc from.
- To run the arc again from a clean start, RELOAD THE PAGE first. Opening a second room in the
  same page replays the FIRST greeting, not a fresh one.

## THE ARC

**1. Open Hartwell, click Facility Actions.**
The room opens already knowing the deal: $46M across six facilities, a short line-item read of
the covenant book, nothing staged. If the client's one mailbox message (Jul 26, asking to take
the line of credit from $15M to $20M) landed in time, the greeting names it; if it is a beat slow,
it shows up as a short second remark right under the greeting. Either way, just talk to the room
naturally. Say nothing while it lands, that streaming sentence under the card IS the moment.

**2. "Who guarantees the construction loan?"**
Instant, no thinking pause: Hartwell Industrial Holdings and James Hartwell as guarantors, Elena
Hartwell as limited guarantor, each once.

**3. The client's ask, as three separate lines (say each on its own, that is what is proven):**
- "increase the 15M line of credit to 20M", one card, $15M to $20M. Confirm, then Acknowledge
  the coverage-thins note. Two more small asks follow before it will price the loan: amortisation
  term (pick 240 or 300) and first payment date. The date chips shown are computed off the book's
  July date and will be wrong, so ignore them: tap "Another date" and type **1 October 2026**.
- "give the 8M equipment loan a 84 month term", one card. It may ask the first payment date
  again even though the term is already on file; answer the same way.
- "add a Debt Service Coverage of Borrower covenant >= 1.30 tested quarterly on the 8M equipment
  loan", three chips appear. Pick **Associate the existing test** (this relationship already
  runs that test elsewhere; this attaches it here rather than minting a duplicate). Confirm.

**4. Two more lines worth showing, because the chips come from the org itself:**
- "pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued at
  6,500,000": the room asks which Real Estate type with the org's own names as chips. Pick
  **Real Estate-Construction**, then the advance rate, then 1st lien. Confirm.
- Click the **$15.0MM Line of Credit** chip, then "log a policy exception for leverage above
  policy approved by credit committee": it asks the facility, then waived / mitigated /
  unmitigated. Pick **Mitigated**. Confirm.
A misread line: Discard the card, click the facility chip, say the short version.

**5. "remove the Minimum Liquidity covenant from the 15M line of credit."**
On this book Minimum Liquidity carries no loan-level attachment at all, it lives at the
relationship level. Expect an honest ANSWER naming that, not a card. That is correct, not a bug.
To show a real exclusion card, use Accounts Receivable instead on the same line.

**6. A new facility on the package.** Only AFTER the execute in step 8, and after a reload: open
Facility Actions again and choose **New facility** (a route is final per plan, so it cannot be
mixed into the open modification). The org's new-facility tool takes product, amount, purpose
and term, no pricing fields, and the room says so rather than pretending otherwise.

**7. "what is on the plan"**
A clean list, grouped by facility, not a paragraph. Read it against what you typed.

**8. Review, get the token, Execute.** Say out loud what is about to happen. The org tab shows
the new package version; the activity trail shows the write.

**9. "is there a newer valuation on the Kokomo plant?"**
Honest and instant: no tool covers that, and the room says so rather than pretending to check.

## THE ESCAPE HATCHES

- **Model slow:** the card is always instant, only the narration under it streams. If nothing
  lands after ~10 seconds with no card at all, restate the line naming the facility by name, or
  use the facility chip below and repeat the short version.
- **Line lands on the wrong facility, or is misread:** click that facility's own chip (for
  example "$15.0MM Line of Credit") to focus the room on it, then say the short instruction
  without repeating the facility name.
- **Org refuses at Execute:** read its sentence out loud, it names exactly what it refused and
  confirms the rest of the plan is untouched. Discard just that entry and re-approve, or discard
  the whole plan and start that piece again.
- **Anything looks stuck or wrong:** reload the page and reopen Hartwell, Facility Actions. That
  is always safe, it is a fresh room every time.

## THE TWO ANSWERS

- **"Relationship tab says 7 facilities, the room says 6."** The tab counts an unbooked $3M
  equipment proposal still at Proposal stage. The room only counts the six booked facilities.
  Both numbers are right, they are counting different things.
- **"Why can't I set the rate on a new facility?"** The org's own new-facility tool only accepts
  product, amount, purpose and term, it has no pricing fields at all. That is the org, not a room
  limitation. Pricing lands afterward through a modification.

## DO NOT

- Do not open the relationship room's review routes tonight. Stay in Facility Actions.
- Do not open a second room without reloading first. It replays the first greeting.
- Do not type the Minimum Liquidity removal expecting a card. On this book it is an honest
  answer, not a card (arc line 5).
- Do not demo multiple product packages. Hartwell has exactly one; multi-package behaviour is a
  written proposal, not built.
