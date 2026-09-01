# The create grammar: elicitation, amendment, steering - build spec (founder go 2026-09-01)

Founder, after driving the modification room on the `facility-not-product` build: "it behaves WAY
WAY better but still i would like to pull it up a nodge". Two asks, one theme.

**Ask 1 - elicitation.** An underspecified create stages a hollow thing. "add another covenant to
all of the loans" put up `New covenant  not on the facility today -> to all of the loans`. He wants
the room to gather what it needs: "what is it though", the type, the details, "anything more
sophisticated", and the same for collateral.

**Ask 2 - reactivity.** "i want to make sure that the agent is reactive and behaves like he knows
what to do": *oh actually i wanna change this* must reflect IN THE CARD; *lets modify a new loan*
must show the available loans; *add a new loan* must open that path.

Scope, founder call: EVERY create surface, and the same grammar in both rooms and on every route
(modify, renew, new facility, and the five relationship routes). The grammar lives in the shell,
never per route.

## The three defects that ride along (reproduced 2026-09-01 evening)

- **D1 the fragment value.** The leftover words became the covenant value: the chip and the manifest
  entry read `-> to all of the loans`. A create whose value did not resolve must never reach a chip.
- **D2 the dropped scope word.** He said ALL of the loans; it landed silently on the focused member
  and the ledger recorded only that. A scope word fans out or asks. It never narrows in silence.
- **D3 the contradicting narrative.** `add a DSCR covenant of 1.25x on the 15M line of credit`
  stages ONE chip and says "it lands on all of them: Line of Credit ($15M), Line of Credit
  ($2.50M)". The covenant lane never got the qualifier reading the commitment lane now has.

## Doctrine: only ask for what the human actually owns

The room must ask for what the BANK decides and never for what the ORG computes. Getting this
wrong in either direction is the failure: asking for a computed field is noise, inventing a
decided one is a fabrication.

| Surface | The human supplies | The org computes or fixes | Never invented |
|---|---|---|---|
| Covenant | test/family (org catalog), operator, threshold, frequency, scope (which facilities, or relationship level) | effective date is SET ONCE at creation and never updated; compliance schedule | the threshold. It comes from the approved credit agreement. The room may PROPOSE, labelled as a proposal: what this relationship already tests, or the bank-typical band (DSCR 1.20-1.25x, FCCR 1.15-1.25x, Debt/TNW max 3.00x, quarterly) |
| Collateral | which asset (pledge existing) or the asset's description, type and value (create then pledge), lien position | ADVANCE RATE AND LENDABLE VALUE, resolved in-transaction. Do NOT ask for them | a valuation |
| Fee | name/type, basis (percentage OR fixed), the percent or the amount, timing | on a percentage fee the org computes the money from the MOVED commitment in-transaction | an amount beside a percentage. The room already refuses this and must keep refusing it |
| Involvement | the party BY NAME, the role from the org's role list, add or remove | the junction | a party the read does not carry |
| Policy exception | the exception name/type and the reason | the transmission on the change stream | a policy the org does not deploy |

Covenant fences to respect and to SAY: an ADD is safe (no compliance row, no approval email), but
AMEND and DETACH are refused because junction fields are not updateable. Getting it right at
creation is the whole game, and that is exactly why a hollow covenant must never stage.

## The grammar

1. **Never stage a hollow create.** A create missing anything the human owns does not become a
   chip. It becomes the room asking, with what it can ground already offered.
2. **Offer before asking, and say where the answer comes from.** Ground proposals in this
   relationship first (it already tests Debt Service Coverage quarterly; it already pledges
   equipment at Fort Wayne), then the org catalog, then the doctrine band. Every proposal is
   labelled as one. The approved credit terms are the authority and the room says so.
3. **One question at a time**, in chips, in the room's own vocabulary. No forms. Free text always
   wins over the chips: a banker who types the whole answer skips the questions.
4. **The chips come from the org**, never from a hardcoded list: covenant families from the
   catalog and from what the book already carries, roles from the org's role list, assets from the
   collateral the relationship already holds.
5. **The card is amendable.** "actually make it 1.30x", "no, quarterly", "on the construction loan
   instead" updates THE OPEN CARD in place and says what changed. It never stages a second,
   contradicting chip. Amending the open card IS the one decision, so it does not violate
   one-decision-at-a-time; it is the same decision, corrected.
6. **Navigational intent is answered with the choice.** "let's modify a new loan" or "a different
   facility" shows the available facilities as chips. "add a new loan" opens the new-facility path.
   "renew instead" offers the route switch that already exists. The room never answers a
   navigational line with a capability lecture.
7. **Scope words are honoured.** "all the loans", "both lines", "every facility", "the two
   equipment loans" fan out to the resolved set, or ask when the set is ambiguous. A scope word is
   never dropped, and never narrowed to the focused member in silence (D2).
8. **Nothing is silently dropped.** What the room could not use, it says. This is the existing law
   and the elicitation must not become a way around it.
9. **Banker language throughout.** No schema words, no field names, no em dashes on the glass.

## Worked shape (the founder's own line)

```
> add another covenant to all of the loans

  Six facilities on this package. All six, or the two lines?
  [All six]  [The two lines]  [Pick one]

> all six

  To file one I need the test, the threshold and how often it is tested.
  This relationship already runs Debt Service Coverage quarterly and
  Minimum Liquidity. I can mirror one of those, or take new terms from
  the approved credit agreement. I will not set a threshold myself.
  [Mirror DSC 1.25x quarterly]  [Mirror Minimum Liquidity]  [New test]

> mirror DSC

  ADD COVENANT   all six facilities
  Debt Service Coverage of Borrower   >= 1.25x, tested quarterly
  Effective at booking, set once and never updated
  [Confirm]  [Change]  [Discard]

> actually make it 1.30

  Updated on the card: threshold now >= 1.30x.     <- the SAME card, not a second one
```

## Constraints

- `app/src/workroom/` BYTE-UNTOUCHABLE. SHA-attest per merge.
- No Apex, no `C360WriteGuard`, no `transitionAllowlist.ts`. This adds NO new write arm: everything
  elicited must map onto a wire the engines already file. Where a complete create still has no
  fileable path (the CREATE_GAPS: account-level covenant create, unpledged collateral asset,
  risk-grade override), the room says so by name AFTER gathering, and records it on the plan.
- Do not touch `design/dummy/*` or the contract files. This lands as a proposed addendum in
  `design/proposals/`.
- Every existing law holds: the empty lane, the entry choreography, brain-first dispatch, the
  qualifier filter, the magnitude advisory, the degrade path, channel-none parity.
- No `git add -A`. Commit trailers. No em dashes in UI copy or commit text.
