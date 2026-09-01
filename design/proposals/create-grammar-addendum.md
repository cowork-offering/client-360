# Create grammar, phase 1: the proposed addendum

Proposed rules, on top of `design/CREATE-GRAMMAR-SPEC-20260901.md`. Written from what phase 1
actually had to decide to close F-CG1 and F-CG2 and to drive the rest of phase-1 scope. Nothing
here changes the contract files; it is a proposal against the spec, in the spec's own numbering
where it extends a rule and as a new rule where it does not.

Everything below is implemented on `create-grammar` and driven headlessly against the assembled
build. Where a rule was considered and NOT adopted, it says so and why.

---

## R4a. The catalog is a thing the room can name, not only a thing it discovers

**Extends rule 4 ("the chips come from the org").**

The room holds the org's own fileable covenant catalog as a shell-side mirror of the deployed
write's type map: Leverage, Minimum Liquidity, Debt Service Coverage of Borrower, Maximum Debt to
Worth, Minimum Current Ratio, Net Worth, EBITDA, Debt to Equity, Net Profit. Nine names, because
the bank's catalog carries sixty types and several of them duplicate a name, and the deployed
write settles only the vocabulary that lands on a uniquely-named entry.

It is held so the room can say **"the catalog does not carry that"** BEFORE it composes a
sentence, rather than gathering three more answers and reading the refusal back afterwards.

Three consequences, and they are the whole of F-CG1:

1. **A test in the catalog is an answer even when this relationship does not run it.** A complete
   in-catalog line stages. Free text wins over the chips, and a banker who typed the test, the
   threshold, the schedule and the facility has answered every question the room had.
2. **A test the catalog does not carry is NAMED in banker language and the catalog is offered.**
   "The bank's catalog does not carry an interest coverage test, so there is nothing for me to
   file it against. It carries Minimum Liquidity, Debt Service Coverage of Borrower, ... I am
   holding 3x and the quarterly schedule and will carry them onto whichever of those you name."
   The catalog chips are ordered with what the relationship already runs first (rule 2), and they
   carry the test NAME only, so the figures the banker typed survive the tap.
3. **The book still beats the catalog.** "DSCR" names a family this relationship runs twice, and
   answering it out of the catalog would file one test as another. The book's own two names are
   the question, and that disambiguation is unchanged.

**The mirror is only honest while it matches.** Every one of the nine names is driven through the
real deterministic parser in `elicit.test.ts`, so a change behind the fence breaks a test rather
than a demo.

**Not adopted:** pre-empting the refusal for a BOOK test the deployed write cannot settle (the
"Accounts Receivable" and "with and without Distributions" cases). Those still gather fully and
then refuse by name at verification. Moving that refusal earlier would be honest too, and it would
change proven behaviour for no gain the founder would see; it is left where it is.

## R3a. A correction carries no unit, and does not need one

**Extends rule 5 ("the card is amendable").**

The founder's own line is "actually make it 1.30". No "x", no currency mark, no operator word. The
verb is the anchor: a card is open, the figure on it is the thing being corrected, and the unit
already on the card is the unit it keeps. "make it", "make that", "set it to" and "set that at"
join the operator words that anchor a bare figure.

A bare figure with NO word in front of it is still not a threshold. "add a leverage covenant 3.5"
asks for the threshold, as it did before.

## R5a. The plan is amended, not doubled

**Extends the "Situational awareness" plan rules.**

The spec says a line touching something already staged acts on that entry. Phase 1 makes that
concrete and narrow:

A line amends a STAGED entry when all of these hold, and stages a new one otherwise.

- it lands on exactly ONE member,
- that member already carries a staged entry for the same test (covenant) or the same asset
  (collateral),
- something the banker owns has actually changed: the threshold, the schedule, or the lien.

The entry moves in the manifest position it already holds, the settled chip in the thread moves
with it, and the room says what changed: "That is already on the plan here, so I have moved the
entry rather than putting a second one beside it: the threshold is now 2.75x."

Three things deliberately do NOT amend:

- an identical line. Nothing changed, so the awareness answer stands: "already on this plan".
- an explicit "a second one". The banker said second and is taken at his word.
- an entry still OPEN on a chip. That is the card's own amendment (rule 5) and it already works.

**Book-level duplication is a different fact and keeps its own answer.** The book is the bank's
record and this room does not edit it: a create the relationship already carries is named and
offered ("Put a second one", "A different test"), never moved.

## R10. The grammar is the shell's, the wire is the route's

**New rule.**

The elicitation is the same on every route, because it is the shell's. What differs is what the
route's own tool can file, and the room says so BY NAME after gathering:

- the modification files covenants and pledges. Nothing to say.
- the renewal files a new maturity and a repricing, and nothing else moves onto the clone.
- the new facility files the product, the amount, the term and the purpose against the package
  anchor, and nothing else.

On the two routes that cannot file it, the create is gathered exactly as it is on a modification,
and then:

1. the room says the route's own limit, by the route's own name, in one sentence;
2. the create goes on the plan as a HANDOFF entry: not fileable, no wire, the reason riding the
   entry so it reaches the submitted summary rather than scrolling away with the sentence that
   announced it;
3. nothing is composed for the route's engine, because there is no wire worth composing for.

An amendment on such a route corrects the handoff, on the same terms.

**This adds no write arm.** A handoff entry is the shape both engines already publish for anything
they cannot carry, and both staged plans already fold it into their warnings.

## R11. The relationship room names the gap instead of gathering

**New rule, and it is a difference the spec should record rather than a gap to close.**

The five relationship routes file NO create at all: no deployed tool authors a standalone covenant
on the Account, and none authors an owned but unpledged collateral asset. There is nothing to
gather FOR. So that room does what it already did, which is the right answer: it names the gap the
moment the line lands, states the org-side gap under it, and stages nothing.

Gathering four answers there before saying that none of them can be written would be more
questions for a worse answer. The rule is: **gather where an answer changes what gets filed; name
the gap immediately where no answer can.**

## R12. What the room never asks, restated as a test

**Extends the doctrine table.**

Collateral, end to end, asks exactly three things: which asset, its kind and value where it is
net-new, and the lien position. It never asks the advance rate and never asks the lendable value,
on any route. Where the deal already holds the asset at a lien position, it does not ask for that
either: it says where the answer came from ("at 1st position, as the deal already holds it").

The room says once, as the reason it is not asking: "What the bank will lend against it is worked
out when the change is filed, so there is no advance rate for you to set here."

---

## Channel-none is a contract, and it is now measured

Every rule above is deterministic. The headless drive ran with a live stand-in desk attached and
the desk was asked NOTHING across the whole founder line set: the elicitation, the catalog gap,
the three amendments, the plan amendment, the collateral gather, the steer and both route
handoffs. The same drive proves the door is reachable, because a genuine desk question does reach
it, and a fuzzy instruction reaches it twice (the rewrite pre-pass, then the envelope).

## Still open after phase 1

- A picker fed by the LIVE `LLC_BI__Covenant_Type__c` catalog would replace the nine-name mirror
  and close the duplicate-name cases the deployed write refuses. That is an org-side change and it
  is out of phase 1.
- The lien position still has no wire on any route. It rides the plan on every route, and the room
  says so every time.
- Phase 2 surfaces (fee, involvement, policy exception) are described by the machine but not
  declared: adding one is a `SurfaceSpec` beside the two that exist, and nothing else in the
  machine changes.
