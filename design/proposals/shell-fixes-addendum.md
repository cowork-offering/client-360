# The founder directives, shell half: the proposed addendum

Proposed rules, written from what the four founder directives in
`knowledge/EVERYTHING-PLAN-FINDINGS-20260901.md` ("Founder product directives from the plan-fixes
drive", 2026-09-02) actually had to decide, plus N3 from the second drive. Nothing here changes a
contract file; it is a proposal against the spec, and every rule below is implemented on
`shell-fixes` and driven headlessly against the assembled build.

Rule numbers continue from `plan-fixes-addendum.md`, which ends at R28.

This is the SHELL half. P2 (covenant and pledge carry-exclusion on `stage_loan_modification`) and
N4 (`Customer360RelationshipGraph.cls`) are the org half and are not touched here.

Where a rule was considered and NOT adopted, it says so and why.

---

## R29. A covenant dedupe asks about the LOAN JUNCTION, never about the relationship

**New rule. Closes P1. It replaces the claim the room made before it.**

The room used to answer `add a DSC of Borrower covenant on the 8M equipment loan` with "it already
runs at the relationship level, so it already reaches every facility on the package. Nothing here
needs putting up twice." That is wrong in the model, not only in the wording.

`LLC_BI__Covenant2__c` is one object at two levels and there is no level flag: a covenant is
relationship-level or loan-level according to WHICH JUNCTION it carries (WORKROOM-BRAIN 2.4). A
covenant with an `LLC_BI__Account_Covenant__c` association and no `LLC_BI__Loan_Covenant__c` row is
NOT associated to the loan. The package VIEW is a union of the two paths; the association is not a
union of anything. Reading the view as the association is what produced a false refusal.

So the dedupe asks exactly one question, per facility: **is this test on THIS facility's
loan-covenant junction?** Three states, and they are three different answers.

| state | what the room does |
|---|---|
| the same test IS on this loan | the true duplicate. Named as one, nothing staged, and the two chips it always offered: put a second one on the facility, or a different test. |
| the same test is on the BOOK but NOT on this loan | not a duplicate. The room says the test is on the book, says where (attached to a named facility, or at the relationship level with no loan junction at all), says it is NOT associated to this facility, says why that follows, and offers THREE chips: create a new one here, associate the existing record here, a different test. It does not say "nothing needs putting up twice" over a change that does need putting up. |
| the test is not on the book at all | stages, and says nothing. |

**The three-chip state fires whatever the scope size.** A create fanned out to two facilities faces
the same decision at each of them, and a room that asked at one facility and stayed silent at two
would be behaving differently for a reason no banker could see. The chips pluralise; the decision
does not change.

**Not adopted:** keeping the relationship-level sentence as a note beside the chips. It is the
sentence that caused the wrong conclusion, and a room that still says "it already reaches every
facility" while offering to associate it to one is contradicting itself in the same breath.

---

## R30. ASSOCIATE is a create on the junction, and the room stages it as a handoff because the wire cannot carry it

**New rule. The second half of P1.**

Associating an existing `Covenant2` to a facility means inserting an `LLC_BI__Loan_Covenant__c`
junction row. That is a CREATE, not a delete, so it is inside the fence: the covenant detach fence
(WORKROOM-BRAIN 2.4, 2.11) refuses the removal of a junction, never the addition of one. The room
therefore does not refuse an associate.

What it cannot do is FILE one. `covenantAddsJson` (WORKROOM-BRAIN 1.4) carries `typeName` or
`typeId`, both of which name a covenant TYPE, and it carries no field that names an existing
covenant RECORD. Sending an associate down the deployed path would mint a second `Covenant2` of the
same type and report it as an association, which is the one thing this room may never do.

So an associate:

- takes the existing record's own id, threshold and schedule off the book. It is never asked to set
  either, because setting them would be the covenant AMEND the fence refuses outright;
- goes onto the plan as a handoff, `fileable: false`, carrying a reason that names the wire gap and
  the junction-only arm being built on the org side;
- writes nothing anywhere.

**Not adopted:** composing the associate as an ordinary covenant add and letting the org's own
dedupe sort it out. The org would create the second record. "The room stages what it says it
stages" is worth more than one saved gesture.

---

## R31. A net-new asset is CREATED and pledged. The rate is asked for, never refused

**New rule. Closes P3, and supersedes the "not changed, and why" note at the end of
`plan-fixes-addendum.md`.**

`pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued at
6,500,000` was refused with "that is a credit decision out of the approved credit terms rather than
something I will set", and offered "Pledge something the deal already carries" as the way out. The
fallback answers nothing: the deal's collateral carries onto the clone by itself, so pledging what
is already there is not a substitute for creating something new.

Creating an asset and pledging it is one of the things this room FILES (WORKROOM-BRAIN 2.11:
"collateral pledges including create-then-pledge"). So it does.

- **The description is the banker's.** It is the only readable identity `LLC_BI__Collateral__c`
  carries, so the room reads his own words off the line and asks for them where the line carried
  none. It never composes one.
- **The kind is read against the catalog before the question** (R27, already proved).
- **The rate is ASKED FOR, with the bank's own guideline band as labelled proposals**
  (WORKROOM-BRAIN 5.1), and the approved credit terms named as the authority. It is asked because
  the wire requires it: `advanceRate` rides `LLC_BI__Advance_Rate_Override__c`, the plain advance
  rate being a formula, and the org's `Advance_Rate_Override` rule demands a written reason beside
  it. Asking is not the same as setting, and a question with a band behind it is not a refusal.
- **Pledge-existing stays as its own action**, on the "which asset" question, where a banker who
  meant an asset the deal already carries picks one. It is no longer the fallback to a create.

**Not adopted:** filing the create with no rate and trusting the collateral-type default. The type
default is what an EXISTING asset falls back to; on an asset the org has never seen there is
nothing to fall back on before `Advance_Rate_should_not_be_null` fires on the insert.

---

## R32. The composed sentence carries what the WIRE needs. What the banker wrote is restated onto the entry

**New rule, general, found closing P3.**

The engine derives a collateral description by stripping the figure, the rate and the pledge clause
out of the line it is given, which mangles any noun phrase sitting between them: "Kokomo plant
expansion" composed into a full sentence came back as "New real estate asset worth at a %".

The room already composes sentences for the parser rather than wiring values directly, and it
already verifies what comes back. This adds the third half of that pattern: where the composed
sentence cannot carry a value faithfully, the shell composes what the wire NEEDS (kind, value,
rate, target) and restates the banker's own words onto the entry and onto the wire afterwards. It
is the same move `restateEntry` already makes for an involvement's party and role.

The rule generalises: **compose for the parser, verify what comes back, restate what the banker
owns.** No engine string changes and no value is invented.

---

## R33. A pledge refusal speaks collateral. A covenant refusal speaks covenants

**New rule. Closes P4 and N1.**

`remove the accounts receivable pledge from the 15M line of credit` was answered with the covenant
refusal: "a covenant DETACH ... every field on the loan-covenant junction is non-updateable". A
pledge is collateral. The banker's own reaction was "is this a collateral or a covenant?".

The cause is a genuine name collision on this book: the org's covenant catalog carries a test called
`Accounts Receivable` (a3Bbb000000S0bNEAS, 80, monthly) beside an asset described as accounts
receivable. Both resolved, and the covenant won on ordering alone.

**The noun the line uses decides.** A line carrying a collateral noun (pledge, collateral, security,
lien) and no covenant noun (covenant, test, ratio, threshold) is a collateral line, whatever a
covenant type happens to be called. The same book still reads `remove the accounts receivable
covenant from the 15M line of credit` as a covenant.

And the collateral refusal is written in the collateral's own words: a pledge is never DELETED on
the booked loan, the clone carries it onto the new version today, and what this needs is a pledge
CARRY EXCLUSION, the same mechanism the borrowing structure already uses. That arm is being built
on the org side (P2) and is not deployed, so the room says so rather than pretending. Once P2 lands
this is not a refusal at all.

The refusal is also titled with the asset rather than with the whole credit-agreement paragraph: a
collateral description runs to two hundred characters in this org, and the exclusions inside it are
the agreement's business, not the refusal's.

**Not adopted:** putting the asset ahead of the covenant unconditionally. It would fence a covenant
line on any book whose asset labels happen to carry the test's words, which is the mirror of the
bug.

---

## R34. A dollar qualifier that names one facility is a FOCUS, and it comes out of the line

**New rule. Closes N3.**

`add a 1% origination fee on the 15M line of credit` was read by the fenced money reader as a
$15,000,000 FEE. It asked "is the fee 1% or $15,000,000?", and then took the banker's NEXT line as
the answer to that open question and staged a fifteen million dollar fee. One phrase, two changes
wrong.

The qualifier only ever worked on COMMITMENT lines, where R-era post-parse filtering narrows the
members after the parse. It cannot work that way anywhere else: on a fee, an exception, a covenant,
a pledge or a party the figure is not selecting between deltas, it is being read as the VALUE, and
by the time a filter could run the damage is already in the wire.

So it is pre-empted. Where a figure in the line resolves to exactly ONE facility, the room sets its
FOCUS to that facility and takes the qualifier phrase out of the line before the engine sees it.
"on the 15M line of credit" then behaves exactly like clicking the facility chip, which is the
gesture it was always standing in for. **Nothing extra is said on the glass**: the card names the
facility, as it does after a click.

Four guards, and each closes a way this could be wrong:

1. **One clause.** A line naming two facilities in two clauses is the brain's, and stripping the
   first phrase would carry the second clause onto the wrong member.
2. **A surface that misreads the figure.** Fee, policy exception, covenant, collateral and party.
   Commitment lines are deliberately left alone: there the figure IS the value and the existing
   post-parse filter already handles them.
3. **A preposition in front and a facility noun behind.** `add a fee of $15,000,000` carries a
   figure that happens to match a facility and names no facility at all. It comes through whole.
4. **Exactly one member.** A figure matching two facilities names neither, and the engine's own
   behaviour stands.

**Not adopted:** applying it while a create is being gathered. The create grammar's own scope reader
already resolves the qualifier correctly and it owns the answer to its own question; stripping the
phrase out of an answer would leave the room holding nothing.

---

## What this batch did NOT change, and why

**P2, the carry-exclusion arms.** Removing a covenant or a pledge from the modification is a
CARRY EXCLUSION on the org side: `stage_loan_modification`, `C360WriteGuard` and
`transitionAllowlist.ts` together. The shell half of P2 is a refusal that names the right fence and
names the arm being built (R33), and it is deliberately not a staged exclusion: staging one before
the arm exists would put an entry on the plan that no tool can file.

**N4, the relationship graph read.** `Customer360RelationshipGraph.cls` returns only rows where the
anchor itself is the party. That is Apex on a read tool and is the org half.

**The `LLC_BI__Loan_Covenant__c`-only create for an existing covenant.** Named as the arm R30 hands
off to. Whether the deployed covenant path can be extended to carry an existing covenant id, or
whether it wants its own small arm, is the org agent's call.
