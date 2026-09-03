# A new facility inside a modification: the lines to type

Written 2026-09-03 against branch `mod-new-loan`. The Apex is DEPLOYED on
`bankinggpt-at` (`0Afbb00000DnPfJCAV`, 143 tests, 0 failures) and the whole flow
was run once live on Hartwell and reverted.

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

**4. A change on the booked side, so the plan carries both shapes.**

```
increase the 15M line of credit to 20M
```

**5. Approve, then execute.** The manifest reads one net-new facility and one
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

The **primary loan purpose** is deliberately NOT set. It lives on the Loan
Detail, which nCino creates in its own transaction moments after the filing, so
nothing inside the filing transaction can see it. The plan step
`new_facility_purpose_0` says so in those words and names the purpose, and it is
the one thing on the version a person still sets by hand.

---

## The revert

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

## What was actually run live, 2026-09-03

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

## One thing the ROOM does not do yet

On the org, an arm can name the new facility before it has an id: the covenant
above was staged as `targetLoanId: "new:1"` and the org resolved it to the loan it
had just created. In the ROOM, the reader that turns "on the new equipment loan"
into `new:1` is written and unit-tested (`newFacilityArm.test.ts`), and it is not
yet wired into the covenant and borrowing-structure lanes.

So today, in the room: stage the new facility, and put covenants and parties on
the BOOKED facilities by name. The label path is proven on the org and is the next
shell wire, not a question about whether the org supports it.
