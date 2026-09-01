# The everything plan: the super-complex facility drive (2026-09-01)

Founder drives at the panel, session verifies org-side by SOQL after each execute, then reverts to
the Hartwell baseline (1 package, 7 loans; tools in knowledge/sf-build-v2/tools/, NEW_PKG env;
collateral runs also delete created Collateral + Account_Collateral by COL number). Nothing stays
filed. This is the never-attempted headline regression proof.

Build: the CURRENT pinned artifact (label facility-not-product, main). The create-grammar build is
NOT merged yet, so give COMPLETE lines for covenants and collateral (type, threshold, frequency,
facility). Once create-grammar lands the sloppy versions work too - that is a second drive.

## What this org files vs fences (so a refusal is scored right)

FILES on a modification: the four scalars (amount, maturity date, rate, term months); covenant ADD
(net-new Covenant2 + association + loan junction); collateral pledge ADD (pledge-existing and
create-then-pledge; the org resolves advance rate + lendable itself); fee ADD (a percentage reads
the MOVED commitment in-transaction); policy exception ADD; involvement ADD and carry-exclusion
REMOVE (five legal roles; Grantor and Contractor refused).

FENCED by design: covenant amend and DETACH; deletes on all objects (so collateral unpledge);
booking (the bank's own Submit for Approval, never bypassed). A fence is not a gap: the room must
NAME the constraint and the route that exists. Scoring: honest refusal = PASS.

Renewal: STAGE ONLY. No execute tool exists (LV06/Booked wall + the clone collateral-aggregate
DUPLICATE_VALUE risk, both by design). Files maturity date + repricing to the stage; everything
else rolls forward on the clone as a handoff.

New facility: stage_new_facility (product, amount, term months, primary purpose + the package
anchor) then a TWO-step execute (invocation 1, ~9s settle, invocation 2). Creates a real loan and
hops it Qualification -> Proposal. Envelopes observed live 2026-08-24.

ROUTE LOCK: once anything is staged the room is locked to that route. Modification, new facility
and renewal are THREE rooms, three tokens. Do not try to put them in one plan.

---

## PART 1 - THE EVERYTHING MODIFICATION (one plan, one token, one execute)

Open Hartwell -> fab -> Facility Actions -> Modify. Type each line, confirm each card as it
appears. Call out the step number to the session as you go.

### Multi-touch scalars (four facilities, four different fields)
1. `increase the 15M line of credit to 20M`
   expect: ONE chip, Line of Credit ($15M) $15M -> $20M. No sibling. No advisory (increase).
2. `give the 8M equipment loan a 84 month term`
   expect: ONE chip on Equipment ($8M), term -> 84 months. (Proven phrasing: "give the X a N month term".)
3. `move the construction loan maturity to 2029-06-30`
   expect: ONE chip, Construction maturity -> 2029-06-30.
4. `move the 2.5M line of credit rate to 7.25%`
   expect: ONE chip on Line of Credit ($2.50M), rate -> 7.25% (absolute rate; never an index).

### Covenants: one ADD (files), one REMOVE (fence probe)
5. `add a Debt Service Coverage of Borrower covenant >= 1.30 on the 8M equipment loan`
   expect: ONE chip, ADD COVENANT on Equipment ($8M), DSC of Borrower >= 1.30. Complete line, so it
   stages (on this build). If it asks "which DSC variant", pick Debt Service Coverage of Borrower.
6. `remove the Minimum Liquidity covenant from the 15M line of credit`
   expect: HONEST REFUSAL naming the fence (covenant detach is refused; junction fields are not
   updateable) and the route that exists. Nothing staged. Score: refusal = PASS; a staged
   "remove" or a silent drop = FAIL.

### Collateral: pledge-existing (files), create-then-pledge (files), remove (fence probe)
7. `pledge the Fort Wayne equipment on the 2.5M line of credit`
   expect: ONE chip, pledge of the EXISTING blanket equipment lien onto Line of Credit ($2.50M).
   The room may note it is already on Equipment ($8M) and offer "add a second" - take the second.
8. `pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued at 6,500,000`
   expect: ONE chip, create-then-pledge on Construction. It must NOT ask for advance rate or
   lendable (the org resolves those). Record the COL number the room shows, if any, for the revert.
9. `remove the accounts receivable pledge from the 15M line of credit`
   expect: HONEST REFUSAL (deletes are fenced) naming the constraint. Nothing staged. PASS = refusal.

### Borrowing structure: one ADD, one REMOVE (both file)
10. `add Hartwell Industrial Holdings as guarantor on the construction loan`
    expect: ONE chip, involvement ADD, role Guarantor, on Construction. If Holdings is already a
    guarantor there the room should SAY so (a second row for the same name is the documented trap)
    - then choose a facility where it is not.
11. `take Elena Hartwell off the 2.5M line of credit`
    expect: ONE chip, carry-exclusion REMOVE on Line of Credit ($2.50M). If she is not involved on
    that facility the room says "not on the deal" - honest, pick one where she is.

### Fee and policy exception (both file)
12. `add a 1% origination fee on the 15M line of credit`
    expect: ONE chip, ADD FEE on Line of Credit ($15M), 1% (percentage basis; no dollar figure
    beside it - the org computes the money from the MOVED $20M commitment = $200,000. That is the
    wave-2 realism fact and I verify it org-side.)
13. `log a policy exception on the 15M line of credit: leverage above policy, approved by credit committee`
    expect: ONE chip, policy exception with that name. The supplied Name must survive to the org.

### The ceremony
14. Read the manifest back: `what is on the plan` - expect all ELEVEN filed items listed (13 lines
    minus the two fence refusals), grouped, with figures.
15. Review -> the token mints -> Execute. Thinking pulse, then the write-back through the glass.
16. Tell me the moment it reports done (or a governor / error). I run SOQL on the new version:
    clone commitment $20M, term 84 on Equipment, Construction maturity, the 2.5M rate, the new
    Covenant2 + junction, both pledges (and the created Collateral + Account_Collateral), the
    Holdings guarantor row, Elena's carry-exclusion, the $200,000 fee, the named exception. Then I
    revert everything to baseline and confirm 1 package / 7 loans / 0 debris.

GOVERNOR FALLBACK: the everything plan has never been attempted in one execute. If it trips an Apex
governor (CPU/SOQL) the org error comes back through the room. That is a RESULT, not a failure:
we record the boundary, split into the wave-2 groupings (scalars+fees / collateral / involvements+
exception) and run them as two or three tokens.

---

## PART 2 - NEW FACILITY (a second room, a second token)

After Part 1 is reverted (say so; I confirm baseline first). Close the room. fab -> Facility Actions
-> New facility (or type `add a new loan`).

17. `a new equipment term loan for 4,000,000 over 60 months, purpose equipment purchase`
    expect: the four scalars staged - product Equipment, amount $4M, term 60, purpose - anchored on
    the Hartwell package. If it asks one at a time on this build, answer each.
18. Review -> token -> Execute. This is a TWO-step write with a ~9 second settle between
    invocations; "still waiting" is the room being honest, not a failure. Do not resend.
19. Tell me when it reports the loan created. I verify: a NEW LLC_BI__Loan__c on package
    a5Fbb000000IHFJEA4 (8 loans), stage Proposal, $4M, 60 months. Then I delete it and confirm 7.

---

## PART 3 - RENEWAL (stage only, by design: an honesty probe)

New room. fab -> Facility Actions -> Renew.

20. `renew the construction loan to 2030-06-30 and reprice it to 7.5%`
    expect: the two things stage_renewal accepts staged (maturity date + repricing). Everything else
    rolls forward on the clone.
21. `also add a Maximum Debt to Worth covenant <= 3.5 on it`
    expect: gathered, then an HONEST HANDOFF: a renewal files only maturity and repricing, so the
    covenant goes on the plan for you to carry out. Not staged as a filed write, not dropped.
22. Look for Execute. expect: there is NO execute for renewal - the room says booking / execution
    is held and hands off. Nothing reaches the org. I confirm zero org change.

---

## Scoring

PASS = every filed item lands on the org exactly as the chip said (verified by SOQL, not the
room's own report); every fence probe refuses honestly by name; the fee reprices off the moved
commitment; the new facility creates one loan and one loan only; the renewal stages and stops.
Zero unwanted org writes. Baseline restored after each part.

Anything that stages a fenced action, drops a line in silence, lands on a sibling facility, or
invents a figure is a finding, and goes in the report with the exact line that caused it.
