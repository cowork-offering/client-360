# The everything-plan fix batch: the proposed addendum

Proposed rules, written from what the eight findings in
`knowledge/EVERYTHING-PLAN-FINDINGS-20260901.md` actually had to decide. Nothing here changes a
contract file; it is a proposal against the spec, and every rule below is implemented on
`plan-fixes` and driven headlessly against the assembled build.

Where a rule was considered and NOT adopted, it says so and why.

---

## R20. A role is a fact about a NAME ON A FACILITY, never about a name

**New rule. Closes E8, the finding that refused the whole plan.**

The org holds involvement as rows, one per facility, so the same account can be Guarantor on one
member and Limited Guarantor on another. "Elena Hartwell is a guarantor" is therefore not a fact
this book carries, and any layer that treats it as one will eventually put the wrong role on the
wire. On the drive it did: `take Elena Hartwell off the 15M line of credit` staged a carry
exclusion with role `Guarantor`, the org found no Guarantor row for her on that facility, answered
"nothing to remove", and refused nine sound changes with it.

So on an involvement REMOVE the role is resolved from the involvements the room is already holding,
per facility, before the chip is drawn:

| what the book holds | what the room does |
|---|---|
| exactly one role | stamps it on the wire and SAYS it: "Elena Hartwell, Limited Guarantor on the $15M line." A role the banker did not type is a fact he is entitled to read before he signs, so it also goes on the chip's own "before". |
| several roles | asks which row comes off, with the roles as chips. Taking the wrong row off a guaranty is not a mistake to make quietly. |
| the name, but not on that facility | refuses, and names the facilities the party IS on. Nothing is staged. |
| the name nowhere in the read | stages, with the unverified role STRIPPED off the wire. |

**The fourth row is the one that needed thinking.** The org is the authority on who is on a
facility; this cockpit's graph read is not. A read that carries only borrower rows must not overrule
the bank's record by refusing a removal the org would have honoured. But it must not send a role
nothing corroborates either, and a remove needs no role at all: the org resolves the exact row at
stage time and refuses ambiguity. Stripping is therefore strictly safer than either alternative.

**Not adopted:** refusing every removal the book cannot corroborate. It would make the room's own
thin read the gate on a write the org is willing to accept.

---

## R21. A REMOVE is routed by what it names, and it un-stages nothing it was not told to

**New rule. Closes E1, the destructive one.**

`remove the Minimum Liquidity covenant from the 15M line of credit` was claimed by the manifest
address on the bare word "covenant", and it took the banker's own staged covenant off Equipment
($8M): a different covenant, on a different facility, un-staged in silence.

Three routes, decided in this order:

1. **The book wins where the line names something on it.** A covenant the catalog names, or a
   pledge named by its COL autonumber or by two distinctive words of its label beside a collateral
   noun, is a line about the BOOK, whatever happens to be on the manifest. It gets the fence
   refusal by name; nothing comes off the manifest.
2. **The manifest, where the line names a STAGED entry by TITLE and by TARGET.** Both. The target
   is the half E1 failed on, and requiring it is what makes the destructive case impossible. Two
   staged entries matching is an ambiguity, not a coin toss.
3. **The parser, otherwise.** A party removal lives there, because an involvement remove FILES as a
   carry exclusion and is not a manifest move at all.

**The fence refusal quotes the field catalog rather than restating it**, so a change behind the
fence changes the refusal too instead of leaving it stale. The banker-language half names the
constraint and the route that does exist: for a covenant, a compliance update to Compliant, Waived
or Exception, run as its own credit action; for a pledge, that no deployed tool carries a release
and the clone keeps the security the parent has.

---

## R22. "Take X off Y" is two different changes, and the object decides which

**New rule, rung zero. Closes E5 without touching the fenced engine.**

`parseModify.ts` puts `take off` in the collateral verb class (line 457) and in the party verb
class (line 477), and collateral wins the race. The engine is fenced, so the correction is a
deterministic rewrite in front of it: where the object of the phrase resolves to a PARTY on the
book, the line is restated with the verb the engine already stages a carry exclusion on. Where it
resolves to an ASSET it is left exactly as it is. Where it resolves to both, the room asks.

**The rewrite is silent.** Same party, same facility, same op; only the verb moves, and every
safety layer below it still runs. A banker does not need to be told that the room reworded his
sentence to itself.

---

## R23. The involvement surface is elicited like every other create

**New rule. Closes E4b, and it is phase 2 of the create grammar.**

Party by NAME resolved against the book (who is already on the deal comes first, because a guaranty
restructure usually moves somebody who is already here), role from the five legal ones, facility
scope. A complete line stages directly; an underspecified one elicits, one question at a time.

Four decisions inside it:

- **The composed sentence puts the facility FIRST and the role LAST.** The parser reads a record
  amendment's value as the tail after the phrase it matched, so a sentence ending on the role leaves
  no tail at all. That is what keeps a fragment off the chip. What the banker READS is then restated
  from the elicited slots: the party as the title, the role as the value.
- **The facility is named by the org's short name (`<Product> - <$Amount>`), not the full loan
  name.** The full name begins with the BORROWER's name, and the party reader resolves the first
  account name it finds in the line.
- **A covenant line is a covenant line, whatever role word its test name carries.** "Debt Service
  Coverage of Borrower" contains "Borrower". The covenant surface is therefore decided first, and
  the involvement surface stands down on any line naming a covenant or a pledge.
- **A name the book carries opens this surface even with no role word**, because that is the only
  thing in "add Elena Hartwell to the 8M equipment loan" that says what kind of change it is. A name
  the book does NOT carry never opens it on its own: there the line could be anything.

`Grantor` and `Contractor` are refused by name, with the reason (collateral and construction
semantics, not borrowing structure) and the five legal roles offered.

---

## R24. The book-level duplicate check covers involvements, and it compares the role per facility

**Extends the create grammar's dedupe. Closes E4a, the trap the pack documents.**

- Same party, same role, same facility: NAMED, never staged. The org holds involvement as rows, so
  the second one is a duplicate rather than a correction.
- Same party, DIFFERENT role on that facility: named as a ROLE CHANGE rather than an addition, with
  the honest route beside it. No tool here files a role change: the row comes off the clone as a
  carry exclusion and the new one goes on beside it, which is two changes.
- Either way the room offers taking the party off that facility, or a different facility.

**And the chip's "before" is only claimed where the read supports it.** "Not on the facility today"
is an assertion about the bank's record. Where this read carries no borrowing structure for the
facility at all, the chip says "not carried on this read" instead.

---

## R25. The committed-total sentence is about the entry that was just confirmed

**New rule. Closes E4c, and it is a figure-integrity rule rather than a copy one.**

The engines compose the confirm's closing sentence over the WHOLE manifest
(`modifyEngine.ts:1593`, `createEngine.ts:655`). A covenant, an involvement, a pledge, a fee or an
exception confirmed after a commitment change therefore inherits that change's arithmetic and reads
as though it had moved the money itself. The drive saw "That takes the package from $49M to $54M"
after a legal-entity add, twice.

The sentence is now composed in the shell from the room's own figures: what the package read at
before this entry landed, and what it reads at now. A non-monetary entry moves neither and says so.
The manifest-wide sentence on the FILED summary is untouched, because there the whole plan is what
is being described and there it is right.

**This is a shell-side guard over a fenced sentence, not the true fix.** The true fix is one line in
each engine: `packageMove` should take the delta being acknowledged and reckon from the manifest
without it. Both lines are named above for the founder's fence decision.

---

## R26. No em dash reaches the glass, whoever wrote the sentence

**Extends the house style rule to the desk.**

The split-offer sentence the drive caught, "The line names two changes—one I can file, one I
cannot", is not a string in this codebase. The desk wrote it. So the rule belongs on the
presentation filter every agent sentence already passes through (`bankerly`) rather than on a
string somewhere: a dash between words becomes a comma, and the cockpit's own "—" placeholder for a
figure a read does not carry is left alone, because it is a value rather than prose.

---

## R27. Free text wins on the collateral type, and the catalog is named when it does not

**Extends the collateral surface. Closes E3.**

The typed type is read against the catalog on EVERY line and before the net-new flag is known: a
banker who wrote "real estate" has answered the question whether or not the room had got round to
deciding the asset was new. Where the room does have to ask, the question names the kinds it can
resolve a word against rather than asking again in the same words.

---

## R28. An operator in front of a figure is the threshold

**New rule, found by driving the founder's own line 5. Not one of the eight.**

`add a Debt Service Coverage of Borrower covenant >= 1.30 on the 8M equipment loan`: with no
operator in the threshold reader's anchor list, the reader fell through to the single money token
in the line, filed **$8,000,000 as the threshold**, and took the facility's own figure out of the
scope reading with it, so the room asked which facility a fully-specified line meant.

An operator (`>=`, `<=`, `>`, `<`, and the typographic forms) in front of a figure is the strongest
threshold anchor there is: it is how the credit agreement writes it. A currency mark or a magnitude
word beside it still makes it money; a bare figure carries no unit, which is the book's own state.

---

## Two things this batch did NOT change, and why

**The net-new pledge asks for an advance rate.** `blockedReason` refuses to compose a create-then-
pledge without one, and the drive script expects that line to stage ("It must NOT ask for advance
rate or lendable, the org resolves those"). WORKROOM-BRAIN 2.6 says the collateral TYPE carries its
own advance rate and a pledge falls back to it when no override is given, so the room's refusal is
more cautious than the org requires. Changing it changes what the room is willing to file, which is
a founder decision rather than a fix, so it is reported rather than made.

**The fee reader takes the facility's own figure as a candidate amount.** `add a 1% origination fee
on the 15M line of credit` asks "is it 1% or $15,000,000.00?". The question is honest and answering
"1%" stages the percentage fee correctly, but the "$15,000,000.00" in it is the facility's size
read as a fee amount, and it is read inside the fenced engine. Reported, not worked around.
