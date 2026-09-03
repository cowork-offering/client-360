# A new facility inside a modification and a renewal: the proposed addendum

Branch `mod-new-loan`, written 2026-09-03 against the classes deployed to
`bankinggpt-at` that morning (`0Afbb00000DnPfJCAV`, 9 components, 143 tests, 0
failures, no coverage warnings) and the `McpServerDefinition` re-published alone
(`0Afbb00000DnQQ5CAN`).

**The founder's directive:** *"Do we allow new loans to be created as part of the
modification and renewal? This should be fully possible."*

Rule numbers continue from `wire-arms-addendum.md`, which ends at R40.

Where a rule was considered and NOT adopted, it says so and why.

**The engine is fenced.** `app/src/workroom/` is byte-untouchable on this branch
(`git rev-parse HEAD:app/src/workroom` = `91c751e427232bf2b62c14b9cf92921e497496c9`).

---

## R41. New money belongs on the version being approved, and that is a fact about nCino rather than a preference

**New rule, structural. It is why the other four read the way they do.**

A modification is anchored on the PRODUCT PACKAGE. The credit action mints the
next VERSION of the package holding clones of every Booked/Open member; the
selected clones then take the requested changes and the rest carry unchanged.
That is the methodology the founder confirmed on 2026-08-30 and it has been the
shape of `stage_loan_modification` since.

A facility ADDED to that new version is ordinary practice, and the room could not
do it. `stage_new_facility` anchors on the CURRENT package and is a separate
credit action with its own approval; putting new money there means the banker
approves a version that does not contain it.

So `newFacilitiesJson` rides both stage tools:

```json
[{"label": "new:1", "product": "Equipment", "amount": 3000000, "termMonths": 60,
  "purpose": "CNC line expansion", "amortizedTermMonths": 60,
  "firstPaymentDate": "2026-10-01"}]
```

`label` is optional and defaults to `new:<position>`. Everything else is
validated at STAGE time: the product must resolve EXACTLY to a value the
Commercial Loan record type offers, the amount must be greater than zero, the
term must be greater than zero, and the purpose must be present.

**The product check is the one that earns its keep.** Record-type scoping is not
enforced by the API: all three Loan picklists are `restrictedPicklist false`, so
a payload writing `Term` onto a Commercial-record-type loan returns 204, stores
it, and then renders wrong in nCino. Nothing on the platform catches this. The
tool does, by name, with the legal list in the refusal.

**Not adopted:** letting the room call `stage_new_facility` alongside the
modification and stitching the two plans together. Two plans is two decision
tokens, two idempotency keys and two things that can half-succeed, over one thing
the banker confirmed once.

---

## R42. Three tools author a facility, so the shape lives in one class

**New rule. `C360NewFacilities.cls`.**

`stage_new_facility`, `execute_new_facility`, the modification's arm and the
renewal's narration all write or plan the same record. Four copies of the product
catalog, the create state, the loan field set and the borrower involvement would
drift, and the org would not catch it: nothing in the platform enforces
record-type product scoping, and a facility filed without an involvement row has
no borrowing structure at all rather than an error.

So `C360NewFacilities` holds all of it, for exactly the reason `C360Facilities`
holds the selection contract. `StageNewFacility` and `ExecuteNewFacility` were
moved onto it in the same commit, which is what makes the sharing real rather
than aspirational: the create route and the modification's arm now write the same
field set by construction.

The extraction removed covered lines from `ExecuteNewFacility` and took it to
74.6 percent, below the platform's 75. Three tests were added rather than backing
the extraction out, and the biggest of them reaches code no test had ever run:
the second half of invocation 2, where the purpose is written and the facility
hops to Proposal. The Loan Detail is created by an after-commit flow that does not
run in a test transaction, so every earlier resume test stopped at "still
waiting". The new one stands the child up and drives the resume to the end.

---

## R43. An arm can name a facility that has no id yet, and only the ADDS may

**New rule. The label, and the one place it becomes an id.**

A covenant, a party, a pledge, a fee or a field change staged onto a facility this
same plan is CREATING cannot name it by id: the id is minted at execute time. So
the plan names it `new:<n>` in `targetLoanId`, and the arm resolves the label to
the loan it just created.

Every arm asks one function:

```apex
private static Id armTarget(ArmPlan job, Map<String, Object> v, String prefix)
```

rather than reading `job.cloneByParent` directly, which is what keeps one question
from being answered eight different ways. The stage side mirrors it with
`armLabel()`, which refuses a label nobody staged and names the labels that exist.

**A CARRY EXCLUSION MAY NOT TAKE ONE.** A covenant exclusion, a pledge exclusion
and a borrowing-structure REMOVE are all the same act: the new version does not
carry a junction the parent holds. A facility this plan is creating carries
nothing, so an exclusion aimed at one has no referent at all. The remove is
refused by name; the two exclusion arms never accept a label because
`exclusionTarget` is id-only and stays that way.

**A FIELD CHANGE AIMED AT A NEW FACILITY RIDES ITS INSERT.** The field wave for
the clones runs as an update against loans that already exist. On a new facility
the record is being written for the first time, so the same coerced value goes on
the same DML: one insert instead of an insert and an update, and on the arm hop
the query budget that saves is nCino's rather than ours.

**Not adopted:** a synthetic id minted client-side and rewritten at execute time.
It would be a second identifier for one record, and the first thing to go wrong
with one is that half the code reads the wrong one.

---

## R44. The purpose is a handoff, and the plan says so in the banker's own words

**New rule, and it is a limit rather than a feature.**

`LLC_BI__Primary_Loan_Purpose__c` does not exist on the Loan. It lives on the Loan
Detail, which nCino creates from an AFTER-COMMIT flow in a transaction of its own
(PROBE-LEDGER wave 3, probe 5), and wave 4 proved a spin-wait for it burns the CPU
ceiling and can never succeed.

So the arm reads once. Where the Loan Detail is already there the purpose is
written and proven. Where it is not, `new_facility_purpose_{i}` lands VERIFIED as
a HANDOFF carrying the sentence:

> nCino creates the Loan Detail for this facility in its own transaction moments
> after the filing, so it cannot be seen from here. The primary loan purpose "CNC
> line expansion" is on this plan and is the one thing on it a person still sets
> in nCino.

A handoff is the honest type for a statement about what somebody else still has to
do, and it is what `held_execution` already is. It keeps a run that filed
everything it could from reporting itself `partial` over a record that does not
exist yet.

**Verified on the live run.** The new facility came back carrying Loan Detail
`a4Wbb000001LZYTEA4` with `LLC_BI__Primary_Loan_Purpose__c` null and
`purposeWritten` false. The tool claimed nothing it had not done.

**Not adopted, and worth writing down as the next move:** filing the facilities in
the ENGINE hop so the ARM hop, which is a genuinely separate transaction seconds
later, could write the purpose onto a Loan Detail that had appeared by then. It
would work. It also puts two inserts back into the leg the 2026-08-31 governor fix
exists to keep writes out of, on a package where nCino's own automation already
spends 46 of its 100-query budget. The trade is worth revisiting once there is a
measured run to hang it on, not before.

---

## R45. The room stays where it is, and the pricing gate covers the new facility too

**New rule. `app/src/components/workroom/newFacilityArm.ts`.**

"add a new 3M equipment loan with a 60 month term for CNC line expansion" used to
match `readSteer`'s origination branch and RESTART the room in the create route.
That threw away the manifest the banker had been building, and it was wrong about
nCino as well. The reader now runs IN FRONT of the steer and the line stages a
card.

**The elicitation holds no state.** Each question's chips type back the whole
sentence with one more answer in it, so the room re-reads the line from scratch
and reaches the same place. That is `pricingGate.ts`'s own rule and it is why a
half-built facility can never drift out of step with what the banker typed.

**The pricing gate is part of the grammar.** nCino hides the rate and the payment
stream until the amount, the term, the amortised term and the first payment date
are all set. A commitment change is asked for the last two; a facility this room
CREATES is asked on the same terms, because a new loan nobody can price is the
same defect arriving from the other direction.

**The wire anchors on a real member.** `wirePayload` builds `facilityIds` from
every delta's `fieldWire.facilityId`, so a label there would put "new:1" into the
payload's facility list and the org would refuse the whole plan. The arm carries
the label; the wire carries a booked member. And an arm aimed at a label ALWAYS
sends `targetLoanId`, even on a single-facility plan: the "one facility needs no
target" shortcut means the SELECTED facility and never a created one, and omitting
it there would land the covenant on the clone instead of on the new loan.

**A renewal gets both halves of the honest sentence.** `stage_renewal` takes the
same arm and validates it against the org's own catalog, so the plan NAMES the
facility; what it does not do is file it, because execution of a renewal is held.
The room says exactly that and names the modification as the route that files one.

**Not adopted:** staging the card on the renew route as well. The renewal payload
carries no arms and `armStage` is wired only on the modify engine, so it would
have been a card that reached no wire, which is the failure mode R35 exists to
prevent.

---

## The guards

**Neither moved, and neither needed to.**

`C360WriteGuard.OBJ_LOAN` already admits a create at `Stage = Qualification`,
`Status = Open`, `isRenewal = false`, `Is_Modification = false`, which is exactly
the shape a net-new facility is written with, and its forbidden list holds only
`hasRenewal`, `Number_Of_Renewals` and `RootLoanId`. The two pricing fields are on
neither deny-list. `app/src/actions/transitionAllowlist.ts` mirrors the same
policy and passes the new step unchanged.

The BOTH-GUARDS RULE is satisfied trivially rather than by omission: the tests
prove the create passes the guard, and the guard is the one that was already
there.

---

## What this batch did NOT change, and why

**The covenant and borrowing-structure lanes in the room.** `readNewFacilityTarget`
turns "on the new equipment loan" into `new:1` and is unit-tested; it is not yet
called from the covenant and involvement lanes, which resolve scope through the
create grammar's own member reader. Wiring it means teaching `readScope` about a
member that is not on the package yet, which is a change to the scope contract
rather than an addition beside it, and it belongs in its own pass.

On the ORG the path is proven: the live run staged
`covenantAddsJson: [{..., "targetLoanId": "new:1"}]` and the covenant came back
junctioned to the loan the run had just created.

**Policy exceptions and the four scalars.** Neither takes a label. A scalar on a
new facility is its own amount and term, which the facility already carries, and a
policy exception on one was not asked for.

**`stage_new_facility` as a route.** Unchanged. A banker who wants a facility on
the CURRENT package still has the tool that does that, and it is still the right
one when there is no version being approved.

---

## The org proof, 2026-09-03

Staged and executed through the invocable path the tool uses, on Hartwell, then
reverted.

| | |
|---|---|
| new package version | `a5Fbb000000J5OzEAK`, 6 members rolled |
| clone of the $15M line | `a4Zbb000002IAr2EAG`, chain row `RL-00000725`, revision 1 |
| **the new facility** | `a4Zbb000002IAsbEAG`, Equipment 3,000,000, term 60, amortised 60, first payment 2026-10-01, Qualification/Open, `Is_Modification` false, ZERO chain rows |
| its borrower row | `a4Lbb000000PJgzEAG`, Borrower, 100 percent |
| the covenant keyed `new:1` | `a3Bbb000000TTmbEAG` (COV-000675), junction `a4Vbb000000qh0tEAA` on the new facility |
| the booked side | the $15M line reads Booked / Open / $15,000,000, untouched |
| terminal state | `success`, armState `relayed` |
| revert | 7 clones, 12 chain rows, the package and the covenant deleted; baseline verified at 1 package and 7 loans |

The drive lines a founder types are in `knowledge/MOD-NEW-LOAN-DRIVE-20260903.md`.
