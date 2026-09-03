# A new facility inside a modification: the lines to type

Written 2026-09-03 against branch `mod-new-loan`, rebased on main after
`intake-apex` merged. The Apex is DEPLOYED on `bankinggpt-at`
(`0Afbb00000DnVftCAF`, 153 tests, 0 failures; the definition at 28 tools,
`0Afbb00000DnVw1CAF`) and the whole flow was run live on Hartwell twice and
reverted both times.

The founder's directive: *"Do we allow new loans to be created as part of the
modification and renewal? This should be fully possible."*

They are. A modification is anchored on the PRODUCT PACKAGE and produces the next
VERSION of it; a new facility on that version is what a bank does with new money,
and it is now one arm of the same plan rather than a separate credit action
against a package nobody is approving.

---

## What to open

Hartwell Precision Manufacturing, the MODIFY route, standing on the
**$15.0MM Line of Credit**.

---

## The lines, in order

**1. The new facility, in one sentence.**

```
add a new 3M equipment loan with a 60 month term for CNC line expansion
```

The room stays where it is. It does NOT restart in the origination room, which is
what it used to do and what threw the manifest away.

It then asks two questions, because nCino hides the rate and the payment stream
until the amount, the term, the amortised term and the first payment date are all
set. Both come with chips.

**2. The amortisation.** Press **Same as the term (60 months)**, or type:

```
add a new 3M equipment loan with a 60 month term for CNC line expansion amortised over 60 months
```

**3. The first payment date.** Press **1 October 2026**, or type:

```
add a new 3M equipment loan with a 60 month term for CNC line expansion amortised over 60 months first payment 2026-10-01
```

The card lands: **$3MM Equipment**, on *the new package version*, `60 month term,
for CNC line expansion`, marked as an ADD and counted as a new member on the
package.

**4. Put things ON the facility you just created.** Every one of these names it
rather than an id, because it does not have one yet:

```
add Elena Hartwell as limited guarantor on the new equipment loan
```
```
add a debt service coverage of borrower covenant of 1.30 on the new loan
```
```
pledge the fort wayne inventory to the new loan
```
```
add a 1% origination fee on the new equipment loan
```

Each one stages its own card under the **$3MM Equipment** on the manifest rail,
and each reaches the org as `targetLoanId: "new:1"`. On the covenant the room
does what it does for any test the book already carries at relationship level: it
offers the three instruments. Press **Create a new one on this facility**.

A REMOVAL is refused, by name, and that is correct on both sides:

```
remove the accounts receivable covenant from the new equipment loan
```
> ... is a facility this plan is CREATING, so there is no covenant on it to take
> off ... everything on it is an ADD.

**5. A change on the booked side, so the plan carries both shapes.**

```
increase the 15M line of credit to 20M
```

That opens the pricing gate on the $15M line, which is the gate it has always
opened. Press **Leave pricing for later** or answer it.

**6. Approve, then execute.** The manifest reads one net-new facility and one
commitment change. The confirm sentence says what is filed and what is not:
booking the version is still nCino's own Submit for Approval.

---

## What to verify in nCino

Open the **new** Product Package the run reports (it is named
`Hartwell Precision Manufacturing LLC - <M/D/YYYY> - PP`).

| what | where to look | what it should read |
|---|---|---|
| the version | the new package | seven facilities: six clones plus the new Equipment loan |
| the new facility | the Equipment loan named `... - Equipment - $3,000,000.00` | Stage **Qualification**, Status **Open** |
| the four scalars | that loan's detail | Product Equipment, Amount 3,000,000, Term 60 months |
| the pricing pair | the same page | Amortized Term Months 60, First Payment Date 1 Oct 2026 |
| it is a NEW loan | the same page | Is Modification **false**, and NO renewal/chain row on it |
| the borrowing structure | its Legal Entities related list | one row, Borrower, 100 percent |
| the booked side | the original $15M Line of Credit | Booked / Open, $15,000,000, unchanged |

| the purpose | the facility's **Loan Detail** child | Primary Loan Purpose reads `business_expansion` |

**About the purpose.** It lives on `LLC_BI__Loan_Detail__c.LLC_BI__Primary_Loan_Purpose__c`
and nowhere else: the Loan carries no primary-purpose field of its own. nCino
creates that child from an after-commit flow about four seconds after the filing,
so nothing inside the filing transaction can set it, and
`complete_new_facility_detail` is the second hop that does. The room calls it for
you.

The field is a **RESTRICTED picklist**, 23 coded values. You still type your own
words: the room reads "CNC line expansion" onto `business_expansion` and SAYS so
on the card. A phrase that reads onto nothing is asked about with the org's own
values rather than sent up to be refused.

---

## The revert

`revert-hartwell` now also sweeps the **Loan Detail** rows on the clones and on
any net-new facility, which is the record the purpose lives on.

```bash
read TOK INST <<< "$(~/.local/bin/bankinggpt-rest)"
export TOK INST
export NEW_PKG=<the new package version id the run reported>
# and, where the run also created covenants, the ids it reported:
export NEW_COVENANTS=<covenant id>[,<covenant id>...]
python3 knowledge/sf-build-v2/tools/revert-hartwell.py
python3 knowledge/sf-build-v2/tools/revert-finish.py
```

`revert-hartwell` reads every loan on `NEW_PKG`, so the new facility is deleted
with the clones. `NEW_COVENANTS` is new on 2026-09-03: a covenant a run minted
lives on the ACCOUNT and used to survive a full revert.

The baseline afterwards is **1 package, 7 loans** on Hartwell (six booked plus
the Proposal-stage `Equipment - $3,000,000.00` that predates this work).

---

## What was actually run live, 2026-09-03 (run 1, the facility and the arms)

Staged and executed through the same invocable path the tool uses, then reverted.

| | |
|---|---|
| new package version | `a5Fbb000000J5OzEAK`, `Hartwell Precision Manufacturing LLC - 9/3/2026 - PP`, 6 members rolled |
| clone of the $15M line | `a4Zbb000002IAr2EAG`, chain row `RL-00000725` at revision 1 |
| **the new facility** | `a4Zbb000002IAsbEAG`, Equipment, 3,000,000, term 60, amortised 60, first payment 2026-10-01, Qualification/Open, Is_Modification false, **zero chain rows** |
| its borrower row | `a4Lbb000000PJgzEAG`, Borrower, 100 percent |
| the covenant keyed `new:1` | `a3Bbb000000TTmbEAG` (COV-000675), DSC >= 1.30, junction `a4Vbb000000qh0tEAA` **on the new facility** |
| terminal state | `success`, armState `relayed` |
| revert | 7 clones, 12 chain rows, the package and the covenant all deleted; baseline verified |

---

## Run 2, the purpose hop, 2026-09-03

| | |
|---|---|
| staging | `a8abb00001O1v9TAAR` |
| new package version | `a5Fbb000000J5yTEAS` |
| the new facility | `a4Zbb000002IBofEAG`, Equipment 3,000,000, term 60, amortised 60, first payment 2026-10-01 |
| its Loan Detail | `a4Wbb000001LaeDEAS` |
| hop 1 | `Purpose pending on 1: nCino has not created the Loan Detail yet, which is not a failure` |
| hop 2, eight seconds later | `Purpose written on 1 new facility` |
| hop 3 | `1 already carried it, so nothing was written for it` (no DML at all) |
| SOQL | `LLC_BI__Primary_Loan_Purpose__c` reads `business_expansion` on `a4Wbb000001LaeDEAS` |
| revert | 7 clones, 12 chain rows, 1 loan detail and the package deleted; baseline verified |

Every line in this file is driven end to end in
`app/src/newFacilityDrive.render.test.tsx`, which types the same sequence into the
room and asserts the payload the org receives.
