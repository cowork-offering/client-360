# Wiring the org arms into the shell: the proposed addendum

Branch `wire-arms`, written 2026-09-02 against the three arms deployed on `bankinggpt-at` that
morning (jobs `0Afbb00000Dm769CAB`, Apex 12/12 with 119/119 tests, and `0Afbb00000Dm7MHCAZ`, the
`McpServerDefinition`, which took Customer 360 to 25 org-side tools).

The shapes are `design/proposals/org-arms-addendum.md` verbatim. The refusals are the org's own.
Nothing here changes a contract file; it is a proposal against the spec, and every rule below is
implemented on `wire-arms` and driven headlessly against the assembled build.

Rule numbers continue from `shell-fixes-addendum.md`, which ends at R34.

Where a rule was considered and NOT adopted, it says so and why.

**The engine is fenced.** `app/src/workroom/` is byte-untouchable on this branch
(`git rev-parse HEAD:app/src/workroom` = `91c751e427232bf2b62c14b9cf92921e497496c9`, attested in
every commit), which decides the shape of R35 before anything else does.

---

## R35. An arm the fenced engine does not know reaches the org through the engine's own `stage` dep

**New rule, structural. It is the reason the other five read the way they do.**

`wirePayload` inside `modifyEngine.ts` maps the seven wire lists the tool shipped with, and the
three new arms are not among them. The engine cannot be edited. So:

- an arm delta travels through the engine as a `fieldWire` carrying the sentinel field name
  `__c360OrgArm`, with the arm encoded in its value;
- `armStage`, injected as `deps.stage` at `WorkroomHost`, lifts those entries back OUT of
  `fieldChangesJson` and puts `covenantExclusionsJson`, `pledgeExclusionsJson` and
  `covenantAttachesJson` in their place;
- a payload carrying no arm comes back **byte-identical**, so every plan that has been filing since
  August files on exactly the wire it always did.

**It is fail-closed by construction, and it is worth naming what closes it.** The sentinel is not a
legal API name, and stripping it is the only way it can travel. Bypass `armStage` and
`StageLoanModification.cls` resolves the field against the live describe of `LLC_BI__Loan__c`, by
API name and by label, and throws before any write:

> No field named `"__c360OrgArm"` exists on the facility in this org, by API name or by label.

It is **not** `C360WriteGuard` that refuses it. The guard's field check is a NEGATIVE list, the
fields it refuses to write, so a name no object holds is not on it and the guard has nothing to say
about the sentinel at all. A wiring mistake is a refusal at stage time, never a wrong write on a
borrower's clone.

Because the delta carries a wire the engine recognises, everything downstream of `carriesWire`
keeps working without knowing what an arm is: the entry counts as fileable rather than as a
handoff, `wireTarget` anchors the plan's `facilityIds` on its facility, and a plan of nothing but
exclusions still stages.

**Not adopted:** giving the arm delta one of the seven existing wires. Every one of them emits a
real record write, and a covenant exclusion riding `covenantAddsJson` would mint a covenant and
report it as a removal.

**Not adopted:** a side registry keyed by delta id, read by the stage wrapper. It would be correct
until two rooms staged on one frame; the arm rides the delta because the delta is the only thing
that is definitely the same object on both sides.

---

## R36. On a MODIFICATION, "remove X from the facility" stages a carry exclusion. The book is asked first

**New rule. Closes P2's shell half, and it REPLACES R33's refusal.**

`remove the Minimum Liquidity covenant from the 15M line of credit` and
`remove the accounts receivable pledge from the 15M line of credit` were answered with a fence. On a
modification they are not fences: nothing is deleted on the booked loan, the new VERSION simply does
not carry that junction, and that is the same mechanism the borrowing structure has used since
2026-08-30.

**The book decides before the org does.** An exclusion is meaningless where the facility does not
carry the junction, and the org refuses one by name. So the room asks first, and answers with where
the thing actually is:

| state | what the room does |
|---|---|
| the covenant IS on that facility's loan junction | stages the exclusion, carrying the `Covenant2` id the covenants read returned and the target loan id |
| it is on the book, attached elsewhere | "... is not attached to the ..., so there is nothing there for the new version to leave behind. This book carries it on ..." |
| it is on the book at relationship level | the same sentence, ending "... at the relationship level, with no loan junction on it at all, which is exactly why it is not on this facility" |
| the read carries no id for it | hands back to the fence. A covenant the wire cannot name is not one this room will claim to exclude |
| the line names no facility, and the room stands on none | asks which, with the facilities as chips. A carry exclusion is per facility and the others keep it |

The pledge half is the same with the collateral's nouns throughout (P4): the ASSET and its
`LLC_BI__Account_Collateral__c` ownership junction are relationship records and are never touched,
and what fails to travel is the per-facility pledge alone.

**Renew and new facility keep the honest handoff.** Those tools do not carry the arm. The fence copy
no longer says the arm is "being built on the org side" (it deployed) and instead names the route
that does carry it: "Run it as a modification and I will stage the exclusion." Understating what the
room can do is the same defect as overstating it.

**The word is EXCLUSION everywhere the banker reads it.** The chip's kind, its badge, its `after`,
its org-record map, the manifest rail, the plan read-back, the confirm sentence and the trail. The
only place "delete" appears is the sentence that says nothing is one.

**The confirm sentence is the arm's, not the engine's.** The engine closes every confirm with
"staged on the clone", which is true of an add and says nothing about a removal. The shell replaces
that opening clause and keeps the rest of the engine's reply verbatim, so the package figure and the
next move are still the engine's:

> Accounts Receivable will not carry onto the new version of $15.0MM Line of Credit. The booked loan
> keeps it, the covenant record itself is not touched, and the clone simply starts without that
> junction. The package total holds at $46M.

**Not adopted:** staging the exclusion without the book check and letting the org refuse. The org's
refusal is correct and unhelpful: it arrives after the banker signed the manifest, and it cannot say
where the covenant actually is, because it was not asked.

---

## R37. ASSOCIATE is a card, not a handoff. The two refusals the org would give are given here

**New rule. It supersedes R30 outright.**

R30 said an associate rides the plan as a handoff because the wire cannot carry it.
`covenantAttachesJson` carries it now, so the P1 chip stages a real card:

- it takes the covenant's own id off the book, and no type name at all. Routing it through
  `covenantAddsJson` would mint a second covenant of the same type and report it as an association,
  which is the one thing this room may never do;
- it never goes through the parser. There is no sentence to compose: the covenant exists, and what
  this authors is the junction;
- the card is titled `Associate a covenant`, its object is `LLC_BI__Loan_Covenant__c`, and its
  `before` is "on the book, with no junction to this facility";
- the confirm sentence is the one `shell-fixes-addendum.md` already composed: the record is not
  touched, and the threshold, the frequency and the schedule stay exactly as the borrower holds them.

Two refusals, by name, before anything is staged:

| the banker's covenant | what the room says |
|---|---|
| already on that facility | "... is already associated to the ..., and the carry brings that junction onto the clone by itself. There is nothing to author." |
| not this relationship's | "... is not a covenant this relationship holds, and a covenant is not moved between relationships by a junction." |

The second is a guard rather than a path the shell can walk today: the book is built per
relationship, so a covenant from elsewhere cannot reach the draft. It is written because the org
refuses it and a room that could only discover that at the confirm gate is a worse room.

**Renew and new facility keep the handoff**, and it names the route that carries the arm.

---

## R38. The plan has to NAME every arm it was sent, and it is checked before the token is spent

**New rule. Closes the write-back half.**

An exclusion writes no record. There is no id to report and nothing in the filed list can say that a
covenant was left off the clone, so the PLAN STEP is the only thing that says the org took it. The
org numbers each arm by its position among its own kind, in the order they travelled:

```
covenant_exclusion_{i}   / covenant_exclusion_verify_{i}
pledge_exclusion_{i}     / pledge_exclusion_verify_{i}
covenant_associate_{i}   / covenant_associate_verify_{i}
```

which is the order the manifest holds them, and the only correspondence there is.

So on staging, the room checks the plan carries a write step for every arm it sent, and says so
plainly where one is missing: a manifest entry that reached the tool and produced no step is one the
banker would sign for and never get.

**Where the org sent a step label, the room renders THAT.** The exclusion labels already carry the
banker sentence ("Carry the covenants of <facility> WITHOUT COV-000662 ..."), and paraphrasing the
bank's own account of its own write is how a room starts drifting from what actually ran. The
composed sentences exist only for a label that did not arrive, so a step never reads as a raw id.

**The flow card names what the arms do**, on the card the approval is taken on: "1 covenant left off
the new version, 1 pledge left off the new version, 1 existing covenant associated by junction.
Nothing is deleted: the booked facilities keep everything they hold today." The association and the
net-new are counted apart, because they are not the same act.

**The trail carries the same sentence**, composed by the room from its own manifest, because the
execution result has no record id to hang one on.

---

## R39. An org refusal is the org's sentence, plus the entry it is about and the state of the rest

**New rule, general, found closing R38.**

`stage_*` writes nothing, so a refusal costs the round trip and nothing else. The org's sentence
stands verbatim, because paraphrasing one has already cost a live session, and the room adds only the two
things the org cannot know: WHICH manifest entry it is about, and that the rest of the plan is
exactly where the banker left it.

> Covenant a3Bbb000000S0bNEAS is not attached to Line of Credit, so there is nothing for the new
> version to leave behind. **That is Accounts Receivable on $15.0MM Line of Credit. Take it off the
> manifest and the plan goes up without it; the other 2 entries are exactly where you left them.
> Staging writes nothing, so nothing has been filed and nothing has come off the manifest.**

Where nothing on the manifest matches the org's words, the org's sentence is returned alone rather
than attached to a guess.

---

## R40. The create chips come from the org. The mirror is the fallback, and it is named as one only where the difference matters

**New rule. Closes the founder's "picklist values, fee types, it shows them up".**

`Customer360Catalog` is read ONCE PER VIEW, with no input at all, cached on the promise so two
callers on one frame share a round trip. Each chip set takes the org's live list where the read
carries one and the shell's own where it does not.

| surface | what it draws now |
|---|---|
| involvement role | the five in `acceptedValues`, with **Grantor and Contractor named as refused** rather than hidden |
| collateral type | the types whose own advance rate is not null, ordered so the kinds this deal already pledges come first, capped at eight with the org's full count said |
| lien position | the org's own `1st / 2nd / 3rd / Other` |
| covenant type | filtered to the **nine** this room's parser settles from a name, with the rest named as present in the org and not fileable here |
| policy exception status | composed behind the fence, so it is CHECKED rather than built (see below) |
| fee type | exposed, deliberately not curated (see below) |

**`acceptedValues` EMPTY means the write path takes everything, never nothing.** Four of the eleven
entries carry an empty one, and reading it as an empty allowlist would silently offer no chips at
all on those four.

**The two catalog entries carry record ids beside their names.** Collateral type and covenant type
are LOOKUPS whose names are not unique in this org, so the reader keeps both. The room's chips still
carry the NAME, because both wires take one: `covenantAddsJson` takes a `typeName` and
`pledgeAddsJson.newCollateral` takes a `collateralType`, and the ORG resolves each against its own
live catalog and refuses an ambiguous one with the candidate ids. Sending an id would need a wire
that accepts one, and only `covenantAttachesJson` does. The id is held so that the day a wire takes
one, the room already has it.

**A fenced chip set is checked, not built.** The exception statuses come out of `parseModify.ts`,
which cannot be edited, so the room holds them against the org's own: a value the org gained is
ADDED silently, a value the write path refuses comes OFF and is SAID, and a chip set carrying a
label the field does not hold is left completely alone. Adding silently and dropping out loud is the
asymmetry that matters: only the drop is a chip that would have ended in a refusal.

**Channel-none is parity, not a degraded mode.** With no catalog the mirror stands and the sentence a
banker reads does not move. The mirror names the same five roles and the same two refusals, so
nothing on the glass says "the org was unreachable" where the answer is the same either way.

### The fee type, and the founder's call

The org's `LLC_BI__Fee__c.LLC_BI__Fee_Type__c` holds **37 active values, all residential and TRID**.
Loan Origination, Attorney and Appraisal are the only three that read as commercial at all;
everything a C&I banker means files as "Other" plus a description. There is no C&I entry to offer.

The list is exposed through the catalog reader and **the room's behaviour is unchanged**: an
origination fee still resolves to Loan Origination, and a fee the room cannot settle still travels as
"Other" with the banker's own words in the description, where `Name` is an autonumber.

**FOUNDER DECISION, open.** Three ways to go, and the room does none of them until he says:

1. **Leave it.** The three commercial-reading values plus Other is what the org has, and the chips
   would be a list of thirty-four things a banker will never pick.
2. **Curate a C&I subset in the shell** (Loan Origination, Attorney, Appraisal, Other) and name the
   rest as present in the org. Honest, and it is a shell opinion about a bank's picklist.
3. **Add C&I values to the org's picklist.** The right fix and the one nobody can do from here.

---

## What this batch did NOT change, and why

**The relationship room's chips.** Founder direction, mid-build 2026-09-02: the FACILITY workroom
comes first and the relationship room adapts later. `Case.Type` and `Case.Origin` were read off this
org for the first time by the catalog tool (Problem, Feature Request, Question, Complaint, Vehicle
Maintenance, Service Request; Email, Phone, Web, Facebook, Twitter, Agent) and the service-request
steps in `reviewFlows.ts` still take free text and let the tool validate. **Follow-up:** pass the
catalog into `RelContext` and offer both as chips, exactly as R40 does for the facility room. The
reader is already there and takes `caseType` and `caseOrigin`.

**The brain lane's proposal shapes.** `brainLane.ts` validates the seven wire keys a delta-proposal
may carry. The three arms are not among them, so the desk cannot propose an exclusion and the fast
lane is the only way to one. That is deliberate for now: a model proposing a removal is a different
review than a model proposing an add, and it should be decided rather than inherited.

**The `Customer360Catalog` name in the client's tool list.** See §Manifest below. Until the
definition's tool list reaches the client's schema cache, `readCatalog` returns null and every chip
set is on its mirror.

---

## The manifest, for the integrator

The artifact's `mcp` declaration must gain `"Customer360Catalog"` on the Customer 360 server at the
next publish. **A non-empty `capabilities` object is a FULL-SET declaration**: anything stored and
not restated is revoked, so this list is not optional context.

The Customer 360 list goes from **23 to 24 client tools** (the org now publishes 25; the client has
never declared `Customer360SearchAccounts`, and this batch does not change that). Extending the list
in `session-build-addendum.md` §1, the Customer 360 block becomes exactly:

```json
{
  "server": "Customer 360",
  "tools": [
    "Customer360Snapshot",
    "Customer360RelationshipGraph",
    "Customer360Exposure",
    "Customer360Covenants",
    "Customer360Opportunities",
    "Customer360StructuralSignals",
    "Customer360Portfolio",
    "Customer360Catalog",
    "stage_collateral_valuation",
    "execute_collateral_valuation",
    "stage_service_request",
    "execute_service_request",
    "stage_annual_review",
    "execute_annual_review",
    "Customer360ActionHistory",
    "stage_new_facility",
    "execute_new_facility",
    "stage_risk_rating_review",
    "execute_risk_rating_review",
    "stage_covenant_review",
    "execute_covenant_review",
    "stage_loan_modification",
    "execute_loan_modification",
    "stage_renewal"
  ]
}
```

The IDB Gateway and Microsoft 365 blocks in `session-build-addendum.md` §1 are unchanged and must be
restated with it, along with `"sample": {}`.

**The client's tool-schema cache needs a fresh session** after the definition deploys before the name
resolves at all. Until it does the room reads null and stays on its mirrors, which is the state every
test and the headless drive also cover.

---

## The drive

Headless, against the assembled build on port 8906, with `window.claude.mcp` stubbed before the
page's own scripts: the gateway answers a contract-valid clarify, `Customer360Catalog` answers the
shape above with real values, and every `stage_*` and `execute_*` throws. Three tools were called in
the whole run: the mail search, the catalog and the gateway. No org call was attempted.

One thing the BOOK decided rather than the code: Hartwell's **Minimum Liquidity carries no loan
junction** on this read (`attachedLoans: []`), so drive line 6 is the honest refusal rather than the
exclusion, and it names where the covenant actually is. The covenant that IS on the $15M line of
credit is the catalog entry called `Accounts Receivable`, which is also the description of an asset
pledged to the same facility. The two drive lines are therefore the same words with one noun changed,
and they reach different arms. That is the N1/P4 collision, closed twice over.

**The drive found a live defect and it is fixed on this branch.** `remove the leverage covenant from
the 2.5M line of credit` un-staged the banker's own entry: the book resolved nothing, and then the
bare word "covenant" matched the KIND of a staged covenant exclusion while "line of credit" matched
its target. That is E1, reached through the category word instead of the title, and the new exclusion
kinds made it easy to hit. The manifest address now matches on the entry's TITLE alone.

---

## The review pass, 2026-09-02

Two independent reviewers drove the branch after the drive above. Everything below is fixed on it.

**E1, a third time: the target side of the manifest address was PROSE.** The title side was fixed to
match on the title alone, and the TARGET side was left matching the words of `${e.target} ${e.after}`.
Every carry exclusion's `after` is the sentence "not carried onto the new version", so the word "the"
satisfied the target side of the address on its own; a truncated asset title carries "the" inside it,
so it satisfied the title side too. Three lines reproduced it, each un-staging an entry on a facility
it did not name:

| the line | what it did | what it does |
|---|---|---|
| `remove the accounts receivable covenant from the 2.5M line of credit` | un-staged the $15M exclusion | refuses, and says the covenant is on the $15.0MM Line of Credit |
| `remove the accounts receivable pledge from the 2.5M line of credit` | un-staged the $15M exclusion | refuses in collateral words, naming where it IS pledged |
| `remove the equipment pledge from the 8M equipment loan` | un-staged a pledge on the $15M line, on "the" | reaches the book |

`after` is off the address entirely, the tokeniser drops a closed list of stopwords, and where the
line NAMES a facility the entry has to be on it, by the member id the delta was staged against.
`readRemove` therefore takes the members now: which facility a line names is the room's own scope
reader's answer, not a word match on a label.

**The missing-arm-step sentence became a GATE.** R38 checked the plan for a step per arm and said so,
while `setFlow` had already stored the staging with its decision token, so approve stayed live and a
banker who read the line and pressed the ink button anyway would execute a plan not containing their
exclusion. The staging is stored with the arms it is missing NAMED; while that list is not empty the
approval is closed, `execute` refuses on the same list, and the card says why and offers Discard.

**The trail counts the org's STEPS, not the manifest.** `result.filed` is built inside the fenced
engine from the deltas that carry a wire, so an arm was reported as filed whether or not the org ever
planned it, and the trail asserted "1 covenant left off the new version" about a plan with no such
step. `armTrailSummary` composes the trail sentence from the returned plan's own steps: a step that
is present is counted, one that is absent is named as unplanned, one the org marked failed is named
as unproved. `armSummary` still composes the sentence IN FRONT of the approval, where the manifest is
the right thing to count: there it says what the plan is being sent to do.

**The confirm leaked half the engine's opening clause on a long pledge.** `armConfirmSentence` drops
the engine's opening clause by splitting the reply on its sentence boundaries, and `assetPhrase`
truncated a long asset title with `"..."`, which IS a sentence boundary. Three of Hartwell's four
collateral descriptions truncate (COL-000763 at 129 characters, COL-000765 at 152, COL-000764 at
196), so a banker read "... and nothing is deleted anywhere. on Purchase: pledged to the booked
facility, and carried onto the clone today ... staged on the clone." The mark is one ellipsis
character now, in both copies of `assetPhrase`, and the boundary itself refuses a doubled full stop.

**R39 keys on the RECORD ID.** The org's refusals name the record ("Covenant a3Bbb000000S0bNEAS is
not attached to Line of Credit, ..."), never the covenant type, so matching the manifest on `d.title`
found the entry only where the type happened to appear in the sentence too, and never on a pledge.
The match is the arm's own `recordId`, on its first fifteen characters so a 15-character read and an
18-character refusal are the same record.

**A pledge is settled by one distinctive word among the pledges of the facility named.** `remove the
inventory pledge from the 15M line of credit` resolved nothing and fell through to the pre-arm
handoff card, whose copy ("no deployed write reaches it yet") lives behind the fence and is no longer
true, while `remove the fort wayne inventory pledge from the 15M line of credit` staged a real
exclusion. Both name the same row. One word settles it wherever it is unique among that facility's
own pledges; a tie asks, with that facility's pledges as the chips; a facility that carries pledges
never falls through to the handoff. Across the whole book, where no facility is named, the two-word
bar stands.

**Un-staging a carry exclusion no longer closes in term-change copy.** "Say it again to put it back,
with the figure you want" is a commitment change's sentence and an exclusion has no figure. It says
the new version carries it again, exactly as the booked facility holds it.

**A covenant the relationship does not carry is answered from the book.** `remove the leverage
covenant from the 15M line of credit` fell through to the brain lane. Hartwell holds no Leverage
covenant at all, and the room is holding the covenants read, so it says so and names what the
facility does carry.

**The associate handoff's join.** "...rides the modification alone: The renewal files..." spliced a
capitalised sentence after a colon, because `ROUTE_FILES` opens a sentence wherever it is used. It is
a full stop.

**`Customer360Catalog` no longer caches a failure for the life of the view.** The promise was the
cache whatever it resolved to, and `resetCatalog` is never called by the room, so a room mounted
before the connector registered its tools stayed on the mirror with no retry. The promise is still
the cache while it is in flight, so two callers on one frame share the round trip; it is dropped the
moment it resolves to null, and the next read asks again.

### The targeted drive of the fixes

Headless, against the assembled build on port 8913, one page load per line, with `window.claude.mcp`
stubbed before the page's own scripts. `Customer360Catalog` answers the org shape, `outlook_email_search`
answers `[]`, and `stage_loan_modification` records the payload and then either throws the org's own
refusal or returns a plan, depending on what the line is proving.

**The room makes TWO gateway calls on a fuzzy line and they are different questions**, so the stub
answers them apart: a prompt opening `Rewrite this banker instruction ...` is the ENGINE's restate
pre-pass and takes a sentence back (`NONE`, so the stub never authors a delta), and anything else is
the brain ENVELOPE and takes contract-valid JSON. On this build the envelope answers a fuzzy line
before the parser is reached, so the restate door was never opened in the run: the last line below
records that rather than claiming a pass for it.

| # | the line | what the room did |
|---|---|---|
| 1 | `remove the accounts receivable covenant from the 2.5M line of credit` | REFUSED and named where it lives ("This book carries it on $15.0MM Line of Credit"). Manifest unchanged. |
| 2 | `remove the accounts receivable pledge from the 2.5M line of credit` | Manifest unchanged. That line DOES carry COL-000762, so it staged an exclusion there rather than touching the $15M entry. |
| 3 | `remove the equipment pledge from the 8M equipment loan` | Manifest unchanged. Staged the exclusion on the $8.0MM Equipment, which carries COL-000764. |
| 4 | `remove the real estate pledge from the 5M purchase loan`, confirmed | One clean sentence: "... nothing is deleted anywhere. The package total holds at $46M." No fragment of the engine's opening clause. |
| 5 | `remove the inventory pledge from the 15M line of credit` | Staged the COL-000763 exclusion. No handoff card. |
| 6 | `remove the leverage covenant from the 15M line of credit` | Answered from the book, naming what the facility carries and what sits at relationship level. Two tools called in the whole run, neither of them the gateway. |
| 7 | the same removal twice | "... is out of the manifest. The new version carries it again, exactly as the booked facility holds it today. Say it again to leave it off." No figure copy. |
| 8 | the org's refusal, by record id | The org's sentence verbatim, then "That is Accounts Receivable on $15.0MM Line of Credit." The payload carried `covenantExclusionsJson` and no sentinel. |
| 9 | a plan with no `covenant_exclusion_0` | Approve DISABLED and labelled "Approval closed", the card said why, the quiet button read "Discard the plan", and pressing the ink button filed nothing. |
| 10 | a fuzzy line, for the stub itself | One gateway door opened, the envelope. The restate pre-pass is not reached on this route. |

### Notes

**`modifyEngine.ts` contains one NUL byte, near line 1693.** It is inside the fence and pre-existing,
so it is not touched here, and it is recorded because it changes how the file must be searched:
`grep` treats the file as binary and prints "Binary file ... matches" instead of the matching lines
unless it is given `-a`. Anyone grepping the engine and getting nothing back should reach for `grep
-a` before concluding the string is not there.
