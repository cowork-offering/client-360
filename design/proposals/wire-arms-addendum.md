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

**It is fail-closed by construction.** The sentinel is not a legal API name, and stripping it is
the only way it can travel. Bypass `armStage` and the org resolves field names against its own live
describe and refuses an unknown one with the legal list, rather than writing anything. A wiring
mistake is a refusal, never a wrong write on a borrower's clone.

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
