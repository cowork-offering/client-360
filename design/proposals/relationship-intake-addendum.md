# Relationship intake: the contract as built, the fence, and the deploy recipe

Written by the Apex builder on branch `intake-apex`, 2026-09-03, against the fixed contract both
builders build to. Everything here is implemented and was validated against `bankinggpt-at` by a
CHECK-ONLY deploy before any real deploy. The integrator deploys; this branch does not.

**The facility workroom is fenced.** `app/src/workroom/` is byte-untouchable on this branch
(`git rev-parse HEAD:app/src/workroom` = `91c751e427232bf2b62c14b9cf92921e497496c9`), and the only
file this branch touches under `app/` is `app/src/actions/transitionAllowlist.ts`, which moves in
the same commit as `C360WriteGuard.cls` under the both-guards rule.

---

## 1. Why the arm exists at all

The modification arm creates covenants and assets on the CLONE of a facility, attaches the covenant
with a `LLC_BI__Loan_Covenant__c` row and the asset with a `LLC_BI__Loan_Collateral2__c` pledge.
Everything it can do is anchored on a deal.

A bank holds facts about a RELATIONSHIP that reach no facility. A relationship covenant carries no
loan junction at all: the package view of covenants is the union of the loan junction and the
relationship junction `LLC_BI__Account_Covenant__c`, deduped by covenant id
(`knowledge/research/covenant-testing-20260902.md` section 3, and Hartwell holds three such
covenants today). An asset the borrower owns and has not pledged is the same shape: legitimate,
normal before close, and unreachable from any facility tool.

So intake is intake. It files what the relationship holds, on the relationship, and stops. It does
not lend, pledge, price, or open a credit action.

---

## 2. The contract as built

Two invocable classes in `knowledge/sf-build-v2/wp2/classes/`, mirroring the staging discipline of
`StageCovenantReview` / `ExecuteCovenantReview` and `StageCollateralValuation`: a `C360Plan` with
steps, a plan hash, a single-use decision token, verification steps, and ZERO domain DML at stage.

### `stage_relationship_intake` (`StageRelationshipIntake.cls`)

| Key | Type | Notes |
|---|---|---|
| `idempotencyKey` | string, `required=true` | must match at execute |
| `accountId` | string, `required=true` | the relationship. Everything is anchored here and nowhere else |
| `rationale` | string | enforced in Apex, not on the invocable, so the refusal can say what it is for |
| `covenantsJson` | string, JSON array, max 10 | see below |
| `collateralJson` | string, JSON array, max 10 | see below |

`covenantsJson` entry: `covenantTypeName` (exact `LLC_BI__Covenant_Type__c` Name), `operator`
(one of `<` `<=` `=` `>=` `>`), `threshold` (number), `frequency` (`LLC_BI__Frequency__c` value),
`effectiveDate?` (YYYY-MM-DD, defaults to today), `nextEvaluationDate?`, `notes?`.

`collateralJson` entry: `collateralType` (resolved against the org's own catalog exactly as the
modification arm resolves it: exact name first, then containment), `description`, `value` (greater
than zero), `valuationBasis?` (`LLC_BI__Type__c`), `valuationSource?` (`LLC_BI__Source__c`),
`valuationDate?`, `street?`, `city?`, `state?` (two-letter, from the org's own picklist), `zip?`,
`ownerAccountId?` (defaults to `accountId`).

Returns: `ok`, `planId`, `planHash`, `decisionToken`, `summary`, `steps[]`, `warnings[]`,
`provenanceJson`, `accountId`, `accountName`, `covenants[]`, `collateral[]`, `refusals[]`,
`covenantCount`, `collateralCount`, `refusedCount`, `replayed`.

Step ids, exactly as the contract names them: `covenant_create_{i}` / `covenant_verify_{i}` and
`collateral_create_{j}` / `collateral_verify_{j}`, `i` and `j` counting the PLANNED entries, not
the supplied ones.

### `execute_relationship_intake` (`ExecuteRelationshipIntake.cls`)

Takes `idempotencyKey`, `planId`, `planHash`, `decisionToken`, `approverUserId`, all
`required=true`. No JSON is re-supplied: the values ride with the plan, as they do on every other
execute tool, so what is written is what the banker saw hashed at the confirm gate.

Five inserts, one DML per object, in this order:

1. `LLC_BI__Covenant2__c` on the account, born `Covenant_Status = Pending` and `Active = true`,
   with the threshold mirrored onto `LLC_BI__Financial_Indicator_Value__c` and
   `Acnpex_Threshold_Value__c`, and the operator mirrored onto `Acnpex_Operator__c` (the symbol)
   and `Financial_Indicator_Operator__c` (the words, including the org's own
   `Greater Tan or Equal To` typo, which is the ACTIVE picklist value).
2. `LLC_BI__Account_Covenant__c`, two lookups, the relationship anchor. **No loan junction.**
3. `LLC_BI__Collateral__c` with type, value, description and the optional address.
4. `LLC_BI__Account_Collateral__c` at 100 percent, primary owner. **No pledge.** The asset has no
   account lookup of any kind on this org, so this junction is the only link there is.
5. `LLC_BI__Collateral_Valuation__c`, only where a basis, a source or a date was supplied.

Then a re-query per object proves what landed, counts each junction, and proves the ABSENCE of the
loan junction and the pledge. Returns created ids per step in `covenants[]` and `collateral[]`,
plus the settled `steps[]`.

**`Original_Value = true` on the opening valuation**, which is the one place in the package it is
true. `execute_collateral_valuation` writes `false` because a revaluation is by definition not the
original; this asset was created in the same transaction and has never been valued, so its first
valuation IS its original value, which is exactly how the eight history rows on Hartwell's assets
carry the flag. `Active` and `Primary` are true for the same reason: it is the only valuation the
asset has.

---

## 3. The two-row create step, stated rather than hidden

The contract fixes four step ids per record, so a create step here covers the record AND the
junction that anchors it, plus the optional valuation on the collateral side. They are not separate
steps because they are not separately confirmable: an asset without its ownership junction belongs
to nobody and cannot be found from the relationship at all.

What keeps this honest rather than a hidden write: the create step's LABEL names the junction, the
verify step's `verification` carries the junction query, the verify step's settled `detail` reports
the junction by COUNT, and the per-item result carries the junction's id. Nothing is claimed that
was not read back. If a later wave wants one step per row, the step ids change and both builders
move together.

---

## 4. Refusal wording

Refusals are **per entry, by index**, and never discard the plan. An intake list is a banker reading
off a term sheet, and one covenant type spelled the way the credit agreement spells it rather than
the way this org's catalog spells it must not discard the other nine. Each refusal carries `index`
(zero-based, in the list it came from), `kind` (`covenant` or `collateral`), `label` (echoed back)
and `reason`.

| Cause | Reason, as the tool says it |
|---|---|
| Unknown covenant type | `No covenant type named "X" exists in this org's catalog. The name must match the catalog exactly.` |
| Ambiguous covenant type | `This org carries N covenant types named "X". Nothing is filed for it, because picking one would be picking for the bank.` |
| Missing type / threshold / operator / frequency | names the field and, for the picklists, lists what the org offers |
| Unknown collateral type | `"X" is not a collateral type this org holds. The org offers: ...` (the org's own list) |
| Collateral type with no advance rate | names the org's `Advance_Rate_should_not_be_null` rule and says the error would otherwise surface on the ASSET insert |
| `value <= 0` | `value must be greater than zero. An asset filed at zero states a fact about the collateral that nobody established.` |
| Bad date | `<field> 'X' is not a date the org can read. Use YYYY-MM-DD.` |
| Past the cap | `<field> carries N entries; the cap is 10 per plan, and this <noun> is past it.` plus the queueable budget, plus `Stage the rest as a second plan.` |
| Unknown picklist value | names the field, the value, and the org's active values |

Two failures are request-level rather than per entry, and both return `ok:false`: a missing
`rationale` or `accountId`, unreadable JSON, an invisible account; and the case where nothing
survives, which says `None of the N entries supplied can be written ... a plan that promises no
write is not a plan.`

**The cap of ten per list is a governor budget, not a policy threshold.** A full plan writes up to
five rows per entry across five objects, every insert on a change-data-captured object enqueues one
`EventBridgeCallout` queueable PER RECORD, and the platform allows 50 queued jobs per synchronous
transaction. Ten and ten is the budget.

---

## 5. What the guard allows, and the both-guards commit

`C360WriteGuard.cls` and `app/src/actions/transitionAllowlist.ts` move in ONE commit. Two changes,
both additive.

### a. Per-tool object fences (`assertAllowedForTool`)

The existing table fences OBJECTS. That was enough while every arm that could reach an object was
the same arm, and it stopped being enough here, because this tool's identity is what it must NOT
touch. `LLC_BI__Loan_Covenant__c` and `LLC_BI__Loan_Collateral2__c` are both legitimate creates on
the object table, because the modification arm authors them, so the object fence alone would let
intake attach relationship rows to a facility and never say a word.

So a tool may declare a NARROWER set, and the fence is **by subtraction only**: a tool key can take
objects away and can never add one, because everything that passes `assertAllowedForTool` then
passes `assertAllowed` with the same create states and the same forbidden fields. Every existing
caller still calls `assertAllowed` and gets identical behaviour.

```
'relationship-intake' => { LLC_BI__Covenant2__c, LLC_BI__Account_Covenant__c,
                           LLC_BI__Collateral__c, LLC_BI__Account_Collateral__c,
                           LLC_BI__Collateral_Valuation__c }
```

Refused for this tool, by the same entry point the tool calls: `LLC_BI__Covenant_Compliance2__c`
(creating one starts the bank's covenant approval chain and is refused on every tool in this
package), `LLC_BI__Loan_Covenant__c`, `LLC_BI__Loan_Collateral2__c`, and everything else. An
undeclared tool key is refused outright.

The alternative was a code path that simply never inserts a loan junction. That is not a control: it
is an absence, it cannot be tested by calling the same entry point the tool calls, and the whole
reason this class exists is that "the tool does not do that" is a weaker sentence than "the tool is
refused if it tries". `StageExecuteRelationshipIntakeTest` asserts all three refusals AND asserts
that the same loan junction still passes the plain object gate, which is the proof the addition
subtracts and leaves the modification arm untouched.

### b. `LLC_BI__Account_Covenant__c` was missing from the client mirror

The Apex guard has carried it since 2026-08-31, when the founder corrected the modification arm to
mint the account association nCino's own UI mints beside every covenant. The mirror never learned
it, so the first plan whose steps name the object would have been refused at the confirm gate by our
own belt-and-braces: the same failure the file's own wave-2 comment describes, one object later.
The policy mirrors the Apex side exactly: create only, two required lookups, no refused fields.

The mirror also gains `TOOL_OBJECT_FENCE` and an optional `toolId` on `validateStep` / `validatePlan`.
Omitting the tool id leaves every existing caller on exactly the behaviour it had; the shell passes
`"relationship-intake"` when it validates an intake plan.

One line of `validatePlan` had to change with it, and it would have been a live bug otherwise.
`steps.flatMap(validateStep)` hands the callback `(element, index, array)`, so the moment
`validateStep` took a second parameter, the INDEX would have arrived as the tool id and every step
after the first would have been refused as an undeclared tool. It is now an explicit arrow, and
`app/src/actions/toolFence.test.ts` asserts exactly that case.

`app/src/actions/toolFence.test.ts` is new (8 tests, in a file of its own so it cannot collide with
the shell branch). It holds the mirror to the same sentences the Apex fence says: the five objects
pass for `relationship-intake`, the loan junction and the pledge are refused for it, both are still
allowed with no tool id so the modification arm is untouched, an undeclared tool is refused, and
the relationship covenant junction is no longer reported as off the allowlist.

**Forbidden fields are unchanged and still apply.** `LLC_BI__Lendable_Value__c` is never written on
either the valuation or the collateral: it is the org's own formula over the collateral type's
advance rate, and this tool READS it back and reports it as the org's answer. `Name`, `RecordTypeId`
and `LLC_BI__Advance_Rate__c` on the collateral, and the six evaluation fields on the covenant
(`Breached`, `Overdue`, `Is_Template`, all three `Last_Evaluation_*`), stay refused.

---

## 6. The MCP surface

`knowledge/sf-build-v2/wp2/mcpServerDefinitions/Customer360.mcpServerDefinition-meta.xml` gains
`stage_relationship_intake` and `execute_relationship_intake`, taking Customer 360 to **27 tools**.
The definition carries no per-tool description: descriptions live on the `@InvocableMethod`, and both
are written in the voice of the others.

**Deploy the definition SEPARATELY from the Apex, never in the same package.** The `apiIdentifier`
values (`aa:apex-StageRelationshipIntake`, `aa:apex-ExecuteRelationshipIntake`) resolve against the
API catalog, which only holds an entry once the class is deployed.

---

## 7. The deploy recipe

Assemble a metadata-format directory of the new and changed classes plus their tests. From the
worktree root:

```bash
D=/tmp/intake-md
rm -rf "$D" && mkdir -p "$D/classes"
for c in StageRelationshipIntake ExecuteRelationshipIntake \
         StageExecuteRelationshipIntakeTest C360WriteGuard; do
  cp knowledge/sf-build-v2/wp2/classes/$c.cls \
     knowledge/sf-build-v2/wp2/classes/$c.cls-meta.xml "$D/classes/"
done
cat > "$D/package.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>StageRelationshipIntake</members>
        <members>ExecuteRelationshipIntake</members>
        <members>StageExecuteRelationshipIntakeTest</members>
        <members>C360WriteGuard</members>
        <name>ApexClass</name>
    </types>
    <version>67.0</version>
</Package>
XML
```

Then the check-only run, which is what this branch was validated with:

```bash
sf project deploy start --metadata-dir "$D" -o bankinggpt-at --dry-run \
  --test-level RunSpecifiedTests \
  --tests StageExecuteRelationshipIntakeTest \
  --tests StageExecuteLoanModificationTest \
  --tests C360WriteGuardTest \
  --tests StageExecuteCovenantReviewTest \
  --tests StageExecuteCollateralValuationTest \
  --wait 45
```

Drop `--dry-run` for the real deploy. The `McpServerDefinition` goes in its own second job:

```bash
sf project deploy start \
  --source-dir knowledge/sf-build-v2/wp2/mcpServerDefinitions \
  -o bankinggpt-at
```

`C360TestFixture` and `C360Wave2Fixture` are already deployed and are not in the package. The four
sibling test classes named in `--tests` are already in the org; they are re-run because
`C360WriteGuard` changed and they are what proves it did not change behaviour.

**Validation result, 2026-09-03**, on the exact bytes this branch commits:

```
Deploy ID       0Afbb00000DnKxNCAV
Target org      bankinggpt-at (fabian.goetzens@accenture.com.bankinggpt)
checkOnly       true
Status          Succeeded
Components      4 / 4   errors 0
Tests           135 / 135   errors 0   (118.4s)
Code coverage warnings 0

  OK   C360WriteGuard                     changed
  OK   StageRelationshipIntake            created
  OK   ExecuteRelationshipIntake          created
  OK   StageExecuteRelationshipIntakeTest created

  PASS 12  StageExecuteRelationshipIntakeTest
  PASS 58  StageExecuteLoanModificationTest
  PASS 27  C360WriteGuardTest
  PASS 20  StageExecuteCollateralValuationTest
  PASS 18  StageExecuteCovenantReviewTest
```

The four sibling suites are the regression proof for the guard change: 123 tests that were passing
before it and are passing after it.

On the shell side, `tsc --noEmit` is clean and the app suite is 3173 of 3173 across 109 files, 8 of
them new in `toolFence.test.ts`.

---

## 8. What is not built, deliberately

- **No attach arm.** Nothing here associates an intake covenant to a facility or pledges an intake
  asset. Both are refused by the fence rather than merely absent. Attaching is a separate action
  with its own confirmation, and the instruments already exist on the modification arm
  (`covenantAttachesJson`, `pledgeAddsJson`).
- **No compliance row.** Refused on every tool in this package. A create is what fires
  `acnpex_covenantApprovalProcess`, which has zero entry filters and a named human assignee.
- **No update, no delete, on anything.** Intake creates and stops.
- **No `LLC_BI__Frequency_Template__c`.** Without it `generatesNextRow` is false and a completed
  compliance row mints no successor. That is the org's schedule config, it is a lookup to an
  eight-row `LLC_BI__Date_Template__c` catalog, and picking one for the bank is a founder call.
