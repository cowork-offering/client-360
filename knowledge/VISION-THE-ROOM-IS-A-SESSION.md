# The room is a Claude session (founder vision, 2026-09-02)

Founder, verbatim: "It just needs to act like a normal Claude session, but with skills and
knowledge based on the relationship, the chat, and the nCino data structure, so it knows which
doors, fields and information need to be entered."

That is the whole product. Everything below is that sentence unpacked into what the banker sees,
what the room holds, and what stays deterministic and why. This is the north star for every build
from here; the specs (SAMPLE-CHANNEL, CREATE-GRAMMAR, BRAIN-FIRST) are its mechanics.

---

## How it looks at the end

You open a relationship. The room already knows it. Not a summary: the book. Every facility with
its commitment, draw, rate, spread, maturity and stage. Every covenant, with its threshold, last
actual, frequency, next test, and WHICH LEVEL it sits at (relationship, or attached to which
loans). Every collateral asset, its pledges, advance rates, lendable values and lien positions.
Every party on every loan with their role: borrower, co-borrower, guarantor, limited guarantor,
related entity. Pricing as the org stores it. Compliance history. What happened last time and why
(the decision ledger). What is already staged on the plan. The last six turns of this
conversation.

You talk to it the way you would talk to a colleague who has the file open.

- **A fact** answers instantly, from the book: "who guarantees the construction loan" gives you
  Holdings and Elena with their roles, not a heading with no rows.
- **A judgment** gets a considered answer: "which covenant has the least cushion" is reasoned
  from the actuals against the thresholds, and it says what it is based on.
- **An instruction it can file** becomes a card, instantly, and then the room tells you in its
  own words what it did and what it noticed: "that takes the line to $20M; coverage thins to
  0.62x because the pledged pool does not grow with it."
- **An instruction that needs more** gets the ONE question it actually needs, with the answer
  grounded in the book: "this relationship already tests Debt Service Coverage quarterly at
  1.25x at relationship level, but it is not on the Equipment loan; mirror it there, associate
  the existing one, or a different test?" It never invents a threshold. It never asks for a
  figure the org computes itself.
- **A correction** lands on the open card: "actually 1.30" updates the card; "on the
  construction loan instead" moves it. Never a second contradicting card.
- **Something fenced** is refused by name, with the route that exists: "detaching a covenant
  deletes the junction and nothing here deletes; on this modification the new version simply
  does not carry it - shall I exclude it from the clone?"
- **Something already on the plan or already on the book** is named, not duplicated: "Holdings
  is already Guarantor on Construction; did you mean a role change?"
- **Something the book does not hold** is looked up, and it says so: "the snapshot is from this
  morning; the org shows a valuation dated yesterday at $6.2M."
- **A navigational line** is answered with the choice: "a different facility" shows the six.
  "add a new loan" opens that path, and inside a modification it adds the loan to the version.

It sounds like it is thinking because it is. The card is instant and deterministic; the sentence
under it is written by the model, streaming, with the whole book in view.

And then you confirm, it executes through the governed relay with a single-use token, the org
verifies, the write-back rolls through the glass, and the activity trail shows what was written.
It never writes on its own. That fence is the product, not a limitation of it.

## What the room holds (the "skills and knowledge")

1. **The relationship** - the complete Customer 360 read, live-refreshable, including every party
   on every loan (the graph read returns the union of the anchor's own rows and every row on its
   loans).
2. **The conversation** - the thread, the plan, what was proposed, what was refused and why.
3. **The nCino data structure, as this org runs it** - the doctrine pack (brain/WORKROOM-BRAIN.md):
   version and clone semantics, what carries, the two covenant levels and their junctions, the
   collateral chain, the fee shapes the org accepts, involvement roles, pricing streams, the
   staging discipline, and above all WHAT FILES AND WHAT IS FENCED.
4. **The doors** - which tool files what, and what each takes:
   - `stage_loan_modification`: the four scalars, covenant add, covenant/pledge carry-exclusion,
     pledge add (existing and create-then-pledge), fee add, policy exception, involvement add and
     carry-exclusion remove; and a new facility on the same version.
   - `stage_new_facility`: product, amount, term, purpose on the package anchor; two-step execute.
   - `stage_renewal`: maturity date and repricing, everything else carries; stage-only by design.
   - the five relationship routes: annual review, covenant review, collateral valuation,
     risk-rating review, service request.
   - the read doors: Customer 360, Boom ratios and spread via the gateway, M365 mail.
5. **The fields** - for each door, what the human decides (a threshold, a role, an exception
   status, a lien position) versus what the org computes (advance rate, lendable, the money on a
   percentage fee, the compliance schedule) versus what is set once and never touched (a
   covenant's effective date). So "add a covenant" gathers exactly the human's part and nothing
   else.
6. **Bank policy** - First Midwest's demo credit policy and the proven-standard rule: the room
   proposes bank-typical bands only as proposals, and names the approved credit agreement as the
   authority.

## Capabilities, by surface

**Facility workroom** (modify / renew / new facility): everything in the doors list, with
elicitation, amendment, steering, plan-and-book awareness, and the new-loan-inside-a-modification
orchestration (one plan, one confirm, the version first then the loan onto it).

**Relationship room** (five routes): the same grammar; honest handoff where a route's tool cannot
file a create; the risk-rating override wired end to end.

**Reads**: any fact in the book, instantly; any judgment over it, reasoned; any fact outside it,
looked up on request with the source named.

**The book itself**: opened by name for any org client ("open Brightwater"), refreshed live while
the panel is connected, honest as a snapshot when it is not.

**Governance**: proposal, restate through proven phrasings, human confirm, single-use token,
execute, verify by re-query, revert tooling, audit trail, decision ledger. SR 11-7 shape end to end.

## What stays deterministic, and why

- **The write path.** Nothing stages or executes on a model's say-so. The model proposes; the
  engines restate it into wires they already file; the human confirms; the token executes. This is
  why a banker can trust the room and why a regulator can read it.
- **The instant card.** Proven phrasings and book facts land in under a second with no model in
  the loop. The model narrates them; it does not gate them.
- **The guards.** C360WriteGuard and its client mirror decide what the org will ever be asked to
  write. The model cannot widen them.
- **The fences.** Deletes, booking, package stage, pricing-stream doorway: refused by name, always.

Everything else - the reading, the reasoning, the asking, the noticing, the narrating - is the
model's. That is the inversion: today the model is the parser's assistant; at the end the parser
is the model's hands.

## The booth arc (Sept 15-17), in the banker's words

1. "Open Hartwell." The room knows the deal.
2. "Who guarantees what?" Every party, every role, instantly.
3. "The client wants the line at $20M and the equipment term to seven years, and I want a DSC
   test on the equipment loan." Three cards, one question about which DSC, coverage advisory,
   the room explains what it noticed.
4. "Actually 1.30." The card moves.
5. "Take Minimum Liquidity off the line for this version." Excluded from the clone, booked loan
   untouched, the room says so.
6. "Add a new $4M equipment loan to this package as well." Onto the same plan.
7. "What's on the plan?" Read back.
8. Confirm. Token. Execute. The org tab shows the new version. The activity trail shows the write.
9. "Is there a newer valuation on the Kokomo plant?" The room checks the org live and says what it
   found.

Nine lines, one relationship, one conversation, zero forms.
