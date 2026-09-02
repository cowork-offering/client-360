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

## Situational awareness: the room reads the plan AND the book

Founder, same conversation: "it should read the room, whats proposed etc, and know how to act on it
in streamlined ways, and also knows what is on the relationship". This is what separates an agent
from a form, and it governs every rule above.

**Two pictures, held at once, before the room proposes or asks anything.**

1. **THE PLAN - what is already staged in this session.** The manifest is not a list the room
   writes and forgets; it is context it reads back.
   - Never propose what is already on the plan. Say it is already there.
   - A line that touches something already staged ACTS ON THAT ENTRY - it amends it - rather than
     putting a second, parallel entry beside it. Two entries moving the same commitment is a
     contradiction the banker has to reconcile by hand, which is exactly the work the room exists
     to remove.
   - The room can answer "what is on the plan" at any moment, and can drop or change an entry by
     name.
   - The next step is offered as a chip where the plan makes it obvious.
2. **THE BOOK - what the relationship already carries.** The reads are already in the room and in
   the envelope: covenants with their thresholds and frequencies, collateral with its pledges and
   lien positions, borrowers and guarantors with their roles, exposure, pricing.
   - A create that duplicates something the relationship already has is named as such, not staged
     blindly. The collateral lane already does this well and it is the model for the rest: it says
     the blanket lien is already on the Equipment facility and offers "add a second" rather than
     silently pledging twice.
   - Proposals are MIRRORED from the book first: this relationship already tests Debt Service
     Coverage quarterly, so that is the first chip, before any doctrine band.
   - Where the book makes an answer unnecessary, the room does not ask the question.

**Streamlined means fewer gestures, not fewer facts.** Awareness is spent on removing questions
the room can already answer, never on skipping a decision that is the banker's to make. The
threshold is still his. The scope is still his. What awareness removes is being asked about things
the room is already holding.

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

## Chips come from the org's own picklists (founder, 2026-09-02: "picklist values, fee types, it shows them up")

Today the chips come from a shell MIRROR of the org's deployed maps (nine fileable covenant types,
five roles, the collateral types, the exception statuses): accurate for this org, a copy all the
same, and Case.Type / Case.Origin were never read at all. Target: a read-only Apex tool
`Customer360Catalog` (org-arms batch) returns the live picklist values for every field the room
writes in ONE describe pass; the shell reads it once per view, caches it, and every create chip
set is drawn from it: fee type, exception status, collateral type, involvement role, case type and
origin, covenant type. Two rules on top:
- Covenant chips are ADDITIONALLY filtered by the deployed fileable map (the nine); the rest are
  named as present in the org but not fileable here, never offered as a chip that ends in a refusal.
- Involvement chips show the five legal roles; Grantor and Contractor are named as refused, not hidden.
Until the Catalog tool lands, the mirror stands and is marked as such in code.
