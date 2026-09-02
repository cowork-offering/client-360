# The org arms: what the shell must send, and the P1 answer

Written by the org-arms agent, 2026-09-02, against the founder directives in
`knowledge/EVERYTHING-PLAN-FINDINGS-20260901.md` (the P-table, plus N4). Everything here is
implemented on branch `org-arms` and validated against `bankinggpt-at` by a CHECK-ONLY deploy.
Nothing has been deployed for real: the real deploy is the founder's go, given to the integrator.

Three things landed on the org side: the relationship-graph read fix (N4), the covenant and pledge
CARRY EXCLUSIONS (P2), and the associate-existing-covenant arm (P1). The shell needs the two JSON
shapes below, and the P1 answer decides one line of the room's covenant dedupe offer.

---

## P1, answered: NO, the deployed covenant path cannot attach an existing covenant

`covenantAddsJson` resolves a covenant TYPE, never a covenant. Its entries carry `typeName` or
`typeId`, and those resolve against `LLC_BI__Covenant_Type__c`, the org's 60-entry catalog. The
execute arm then ALWAYS inserts a fresh `LLC_BI__Covenant2__c` and attaches that. There is no code
path anywhere in the deployed pair that takes an existing `LLC_BI__Covenant2__c` id and writes only
a junction. Sending a Covenant2 id as `typeId` is refused ("No covenant type exists with id ...").

So the smallest arm was built: **`covenantAttachesJson`, a junction-only create.**

```json
[{"covenantId": "a3Xbb00000012ABCAY", "targetLoanId": "a4Zbb0000027MaYEAU"}]
```

- `covenantId` is REQUIRED and is an `LLC_BI__Covenant2__c` id, exactly as the covenants read
  returns it. A covenant to be CREATED still goes in `covenantAddsJson` with its type and threshold.
- `targetLoanId` may be omitted when exactly one facility is selected, like every other arm.
- The junction lands on the CLONE of the target on the new package version, never on the booked
  parent. Nothing is deleted, no covenant is inserted, no covenant field is written: the threshold,
  the frequency and the schedule stay exactly as the borrower holds them.
- The `LLC_BI__Account_Covenant__c` association is minted ONLY if the covenant does not already
  carry one. A relationship-level covenant has its own, and a second row would be a duplicate.

Three refusals the shell should expect, each by name:

| the banker's covenant | the refusal |
|---|---|
| already attached to that facility | "... is ALREADY associated to covenant COV-000662, and the carry brings that junction onto the clone by itself." The per-loan dedupe, enforced in the org. |
| belongs to another relationship | "... belongs to <account>, not to the borrower on this package. A covenant is not moved between relationships by a junction." |
| no such id | "No covenant exists with id ... Associate a covenant the read returned, or create a new one with covenantAddsJson." |

**What this means for the room's three-instrument offer (founder P1).** When the covenant is not on
the LOAN junction, all three instruments now exist on the org: create a new one on the loan
(`covenantAddsJson`), ASSOCIATE the existing one to the loan (`covenantAttachesJson`), or a
different one (`covenantAddsJson` with a different type or threshold). The room can offer all three
honestly. Dedupe stays per loan-covenant junction: "the relationship level already covers it" is
never the answer, and the org now refuses a duplicate junction by name if the room gets it wrong.

---

## P2: the two carry exclusions the shell must send

The founder's requirement was "we should have the ability to remove covenants from the open loan
when the modification happens", and the same for the AR pledge. On a modification nothing is
deleted on the booked loan. The new VERSION simply does not carry that junction. That is the same
mechanism the involvement remove has used since 2026-08-30, and it is why this is possible at all
while covenant DETACH and deletes stay fenced.

### covenantExclusionsJson

```json
[{"covenantId": "a3Xbb00000012ABCAY", "targetLoanId": "a4Zbb0000027MaYEAU"}]
```

or, when the room holds the junction rather than the covenant:

```json
[{"junctionId": "a3Ybb00000034DEFAX", "targetLoanId": "a4Zbb0000027MaYEAU"}]
```

- Exactly one of `covenantId` and `junctionId` per entry. `targetLoanId` may be omitted when
  exactly one facility is selected.
- The exact `LLC_BI__Loan_Covenant__c` row is resolved AT STAGE TIME against the target parent, so
  the banker confirms a named covenant rather than a description. This is the same discipline as
  the involvement remove's `sourceRowId`.
- Cap: 10 exclusions per plan.

### pledgeExclusionsJson

```json
[{"pledgeId": "a3Zbb00000056GHIAW", "targetLoanId": "a4Zbb0000027MaYEAU"}]
```

or, when the room holds the asset rather than the pledge:

```json
[{"collateralId": "a35bb0000013xz3AAA", "targetLoanId": "a4Zbb0000027MaYEAU"}]
```

- Exactly one of `pledgeId` and `collateralId` per entry. `targetLoanId` as above. Cap: 10.
- The pledge object is `LLC_BI__Loan_Collateral2__c` (the Loan child relationship name lies).
- The ASSET and its `LLC_BI__Account_Collateral__c` ownership junction are relationship records and
  are never touched. What fails to travel is the per-facility pledge alone.

### The refusals, and the words the room should reuse

| case | the org's answer |
|---|---|
| the facility does not carry that covenant | "Covenant <id> is not attached to <facility>, so there is nothing for the new version to leave behind. ... A covenant that reads at relationship level has no loan junction at all, which is exactly this answer." |
| the facility does not carry that pledge | "Asset <id> is not pledged to <facility>, so there is nothing for the new version to leave behind." Collateral language, not covenant language: this is P4, and it stops being a fence refusal at all. |
| the value is not an id | "\"the minimum liquidity covenant\" is not a Salesforce id, so it cannot be a covenant id." |
| the same row named twice | "... is named twice in this plan's covenant exclusions. One junction, one exclusion." |
| the target is not a selected facility | "A covenant exclusion targets facility <id>, which is not one of the selected facilities." |

### What the plan says back, so the room can render it

Two steps per exclusion, in the plan the confirm gate hashes:

- `covenant_exclusion_{i}` / `covenant_exclusion_verify_{i}`
- `pledge_exclusion_{i}` / `pledge_exclusion_verify_{i}`

and, for an association, `covenant_associate_{i}` / `covenant_associate_verify_{i}`.

The exclusion step labels already carry the banker sentence the room should be saying:

> "Carry the covenants of <facility> WITHOUT COV-000662 (Minimum Liquidity): the booked facility
> keeps its junction, the clone starts without it, and the covenant record itself is not touched."

The stage summary gains a carry-exclusion clause and the warnings gain one that leads with
**"REMOVED MEANS NOT CARRIED, not deleted."** After execute, each exclusion step is VERIFIED only
when the clone reads zero and the parent row still reads one. A removal nobody can see is
indistinguishable from a removal that did not happen, so it is proven by re-query on both sides.

**The execute wire is unchanged for exclusions.** No new result list: an exclusion writes no record,
so there is no record to report, and the per-step state plus its verification string is the whole
answer. Associations DO ride the existing `covenants` result list, with the same `CovenantResult`
shape a net-new covenant uses (`covenantId`, `covenantName`, `typeName`, `threshold`, `operator`,
`cloneLoanId`, `verification`), because a banker reads one set of covenants on the new version
whoever authored each record. The outcome sentence counts them apart: "N net-new covenants attached
to the clone, M existing covenants associated by junction only."

---

## The guard, both halves

Neither exclusion needed a new create or delete state, and that is the design rather than a
shortcut. An exclusion makes the carry write FEWER rows; every row it does write still passes
`OP_CARRY` with the fields it always did. Writing fewer rows needs no permission.

So the guard diff is doctrine, not behaviour, and it moved in ONE commit across both halves per the
BOTH-GUARDS rule:

- `C360WriteGuard.cls`: the `OBJ_LOAN_COVENANT` OP_CREATE doctrine comment widened from "only a
  covenant this same transaction created" to "or one the BORROWER on this package already holds",
  and a new block beside `OP_CARRY` saying why a carry exclusion has no operation of its own and
  must never get one (an entry for "remove" would be a doorway to the delete this fence refuses).
- `app/src/actions/transitionAllowlist.ts`: the same two statements on the
  `LLC_BI__Loan_Covenant__c` and `LLC_BI__Loan_Collateral2__c` policies. No flag, no state, no
  refused field changed on either side.

---

## N4, for the record: the graph read now returns the whole borrowing structure

`Customer360RelationshipGraph` queried `LLC_BI__Legal_Entities__c WHERE LLC_BI__Account__c =
:anchor`, which answers "where is this account itself a party". A guarantor row carries the
GUARANTOR's account, so Hartwell read 7 borrower rows and hid 15 of 22. The read is now the union
of the anchor-as-party leg and every row hanging off a loan or a package of the anchor account,
deduped by row id, borrower rows first.

The wrapper shape did not change: `loanId`, `packageId`, `borrowerType`, `accountName`,
`ownershipPercent`, `guarantyAmountType`, `contingentAmount`, `relationshipType`, exactly as
before. The shell needs no change to read it, but the room's involvement dedupe and its
"any guarantors?" card will start seeing rows they never saw.

The read tool is deployed separately from the modification pair and is a READ: no guard, no write
arm. It needs a live-data refresh after the founder's deploy before the room's local book agrees
with the org.

---

## Customer360Catalog: the chips come from the org, not from a mirror

Founder, 2026-09-02: "picklist values, fee types, it shows them up." The room's create chips came
from a shell MIRROR of the org's deployed maps. Accurate for this org on the day it was written, a
copy all the same, and Case.Type and Case.Origin had never been read off this org at all. A mirror
drifts silently and the first anyone hears of the drift is a refusal at the confirm gate.

`Customer360Catalog` is a READ tool in the same shape and doctrine as the other `Customer360*`
reads: one `@InvocableMethod`, `WITH USER_MODE` on both its queries, an `isAccessible()` check on
every field, no DML anywhere, no guard involvement. **The normal call carries no input at all** and
returns every chip set in one pass. The shell reads it once per view and caches it.

One optional input exists, `objectNames`:

```json
{"objectNames": ["LLC_BI__Fee__c"]}
```

Omit it and you get everything. It is there because the two catalog entries are 43 and 71 RECORDS
and a fee elicitation has no use for either. (Apex also refuses an `@InvocableMethod` whose request
class carries no `@InvocableVariable` at all, which is how the shape got settled.)

### The response shape

```json
{
  "fields": [
    {
      "objectName": "LLC_BI__Fee__c",
      "fieldName": "LLC_BI__Fee_Type__c",
      "source": "picklist",
      "values": [{"label": "Loan Origination", "value": "Loan Origination"}],
      "acceptedValues": [],
      "note": "This picklist is residential and TRID..."
    }
  ],
  "note": "Every list here is the ORG's, read live..."
}
```

- `source` is `picklist` (the field's own active values) or `catalog` (records of the object a
  LOOKUP points at, because two of these fields are lookups and have no picklist at all).
- `values` is what the ORG offers. Active values only.
- `acceptedValues` is the subset the WRITE PATH accepts, and it is only populated where that is
  NARROWER than what the org offers. Empty means the write path accepts everything in `values`.
- `note` carries the org fact a chip builder would otherwise get wrong.

### The eleven entries, and what the org actually holds today (read 2026-09-02)

| object.field | source | what came back |
|---|---|---|
| `LLC_BI__Fee__c.LLC_BI__Fee_Type__c` | picklist | **37 active values**, all residential and TRID: Appraisal, Attorney, City Property Taxes, Condo Association Dues, Condo Association Special Assessment, Coop Association Dues, Coop Association Special Assessment, Cost to Cure, County Property Taxes, Credit Report, DMV, Flood Insurance, Government Recording, Ground Rent, Homeowners Association Dues, Homeowners Association Special Assessment, Homeowners Insurance, Leasehold Payment, Loan Origination, Settlement/Close, State Tax Stamps, Survey, Title Insurance, Title Search, Wind and Hail, Other, Down Payment, Earnest Money/Deposit, Funds For Borrower, Lender Credit, Seller Credit, Other Credit, Adjustment, Adjustments for Items Paid by Seller In Advance - Other, Adjustments for Items Unpaid by Seller - Other, Assessments, Stock. **A C&I fee has no value in this list.** Loan Origination and Attorney and Appraisal are the only three that read as commercial at all; everything else a banker means is "Other" plus a description. |
| `LLC_BI__Fee__c.LLC_BI__Record_Type__c` | picklist | Fees, Costs, Adjustments. The independent picklist, never `RecordTypeId`. |
| `LLC_BI__Fee__c.LLC_BI__Calculation_Type__c` | picklist | Flat Amount, Percentage. |
| `LLC_BI__Fee__c.LLC_BI__Paid_By__c` | picklist | Bank Paid, Financed from Proceeds, Paid Outside Closing, Paid by Seller, Waived. |
| `LLC_BI__Policy_Exception__c.LLC_BI__Status__c` | picklist | **Waived, Mitigated, Unmitigated.** All three are real outcomes. The org DEFAULTS a new row to Unmitigated, which reads as a decision nobody made, so the write path demands the status. |
| `LLC_BI__Legal_Entities__c.LLC_BI__Borrower_Type__c` | picklist | 7 offered: Borrower, Guarantor, Limited Guarantor, Co-Borrower, Related Entity, Grantor, Contractor. `acceptedValues` = the **five**; Grantor and Contractor are returned so the room can NAME them as refused rather than hide them. |
| `LLC_BI__Loan_Collateral2__c.LLC_BI__Lien_Position__c` | picklist | 1st, 2nd, 3rd, Other. |
| `Case.Type` | picklist | **First read off this org (backlog B.10):** Problem, Feature Request, Question, Complaint, Vehicle Maintenance, Service Request. Note the org's stock values are untouched. "Service Request" is the only one a banker would pick. |
| `Case.Origin` | picklist | **First read off this org:** Email, Phone, Web, Facebook, Twitter, Agent. |
| `LLC_BI__Collateral__c.LLC_BI__Collateral_Type__c` | catalog | **43 records.** Values are record ids. `acceptedValues` holds only the types carrying their own advance rate: a type whose rate is null is refused before the org's `Advance_Rate_should_not_be_null` rule can fire on the insert. |
| `LLC_BI__Covenant2__c.LLC_BI__Covenant_Type__c` | catalog | **71 records** (the pack said 60; the catalog has grown). Values are record ids, and the note carries the count of names carried by more than one record. |

`LLC_BI__Policy_Exception__c.LLC_BI__Type__c` is deliberately NOT in the list: it is a TEXT field,
not a picklist, and every one of this org's 81 rows carries "Policy". There is nothing to read.

### Two rules on top of the raw lists

1. **Covenant chips are ADDITIONALLY filtered by the deployed fileable map (the nine)**, and the
   rest are named as present in the org but not fileable here, never offered as a chip that ends in
   a refusal. The nine live in `app/src/workroom/parseModify.ts`'s `COVENANT_TYPE_MAP`: Leverage,
   Minimum Liquidity, Debt Service Coverage of Borrower, Maximum Debt to Worth, Minimum Current
   Ratio, Net Worth, EBITDA, Debt to Equity, Net Profit. That filter is the SHELL's, and the tool
   says so rather than pretending otherwise: the ORG accepts all 71 by `typeId` through
   `covenantAddsJson`, and the nine are the names the room's own parser can settle uniquely. A
   covenant type outside the nine is reachable by id whenever the room holds one.
2. **Involvement chips show the five legal roles**; Grantor and Contractor are named as refused,
   not hidden. `acceptedValues` on that entry is exactly those five.

### Why two of these are catalogs and why it matters

The collateral type and the covenant type are LOOKUPS to config objects, not picklists. Their
`value` is a record Id and **their names are not unique in this org**. A chip built on a name alone
will eventually be refused as ambiguous, with the candidate ids in the refusal. Build covenant and
collateral chips on `value` (the id) with `label` for display, and send `typeId` and
`collateralType` accordingly.

### Reaching the tool

**Deploy the classes and the definition as TWO deploys, in that order.** A check-only that carried
the Apex AND the McpServerDefinition in one package validated all 13 components cleanly and then
never started its Apex tests, three times in a row (the same package minus the definition ran its
113 tests in about thirteen minutes). The definition itself validates fine on its own. So: deploy
the Apex with the tests first, then the definition, rather than losing an hour to a run that looks
hung.

The tool is registered in `knowledge/sf-build-v2/wp2/mcpServerDefinitions/Customer360.mcpServerDefinition-meta.xml`
as a 25th `<tools>` block. That file was verified byte-equal to what the org currently holds (its
24 tools, retrieved live 2026-09-02) before the block was added, so deploying it adds one tool and
removes none. **Deploying it changes the connector's tool list**, so the client's tool-schema cache
needs a fresh session before the tool appears. The root copy at
`knowledge/sf-build-v2/Customer360.mcpServerDefinition-meta.xml` is STALE (8 tools, read-side only)
and was deliberately left alone.
