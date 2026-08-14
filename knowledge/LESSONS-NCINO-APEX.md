# Lessons Learned: nCino + Apex + MCP on bankinggpt

**Purpose.** Every empirically earned lesson from the WP1/WP2 build wave (2026-07-25/26), written down
so wave 2 (modification, renewal, new facility, covenant review, risk rating) does not re-learn any of
it the hard way. Companion to `PROBE-LEDGER.md` (evidence) and `A33-DRAFT.md` (spec). Read this BEFORE
building any new tool.

**Standing prime directive: no interference.** Every deploy to bankinggpt must land as `Created`, never
`Changed`, unless the change to an existing component was explicitly founder-gated (so far exactly one
is planned: the additive `McpServerDefinition` tool rows). The deploy output is the receipt; keep it.

---

## 1. Platform truths that cost us time tonight

1. **Metadata API deploys grant FLS to NOBODY.** A new custom object deploys with object CRUD for the
   admin profile but ZERO FieldPermissions rows, System Administrator included. Under `WITH USER_MODE`
   every custom field is invisible and reads fail with `No such column`. RULE: every new object or
   field ships WITH its permission set in the same deploy, and the permission set is assigned to the
   tool-running identity AND the test-running identity before any test run.

2. **`No such column` does not mean the field does not exist.** It usually means FLS-invisible.
   The false-disproof trap: anonymous Apex compiles against the calling user's field visibility, so a
   "system mode" snippet also fails; REST describe is also FLS-filtered. GROUND TRUTH for field
   existence is the Tooling API (`SELECT ... FROM CustomField`). Order of diagnosis: Tooling API for
   existence, then FieldPermissions for visibility, then code.

3. **The org's describe endpoints strip permission facts** (`sobject-sf` MCP `getObjectSchema` showed
   0 createable fields to a sysadmin who then inserted successfully). Writability claims require an
   insert probe. Never conclude from a describe, in either direction.

4. **Autonumber Names are not Ids.** Review `R-100004`, Case `00101324` are Name values; casting them
   to `Id` throws `System.StringException: Invalid id`. Resolve records by returned Id, never by Name.

4b. **Names and ids must never share a field — the pattern struck twice in one night.** First the Apex
    ternary coerced a Case number through `Id.valueOf()`; then the panel sent `meta.user` (the display
    name "Fabian Goetzens") as `approverUserId`, and the running-identity precondition refused every
    live confirm for a whole session. RULES: id-typed fields carry validated 15/18-char ids only
    (resolve with a prefix-checked helper that fails closed); display names live in fields named as
    names; any contract with both carries both fields (`user` + `userId`).

4a. **Never mix `Id` and `String` branches in an Apex ternary.** Apex infers the ternary's type from
    its operands and coerces the `String` branch through `Id.valueOf()`, which throws on any non-Id
    string (found in two outcome-message builders: `(name == null ? record.Id : name)` blew up on
    `00101324`). Wrap the Id branch: `String.valueOf(record.Id)`. Sweep new classes for mixed-type
    ternaries before deploy.

5. **`McpServerDefinition` facts:**
   - Tools are EXPLICIT rows (`toolName` + `apiIdentifier` = `aa:apex-{ClassName}`, source
     `API_CATALOG`). No auto-discovery: a new invocable class does NOT appear as a tool.
   - The API catalog only knows a class AFTER it is deployed, so exposure is a strict two-step:
     deploy classes first, then deploy the server definition. A combined or premature definition
     deploy fails with `No "aa:apex-X" identifier found for source "API_CATALOG"`.
   - The metadata type is not retrievable at sourceApiVersion 64.0; use 67.0+.
   - snake_case toolName values parse fine.

6. **StandardValueSet changes are retrieve-append-deploy.** Deploying replaces the whole set, so always
   retrieve the current one first and append. Verify afterwards with `sf sobject describe` (picklist
   values), not with the deploy status alone.

## 2. Test-context traps

7. **Fixture DML wakes managed automation.** Every Case insert fires `FinServ.CaseTrigger` and
   `slackv2.caseTrigger`; every Review insert fires `Review After Save`. Per-method fixture inserts
   multiplied that until the whole run was killed on time ("Your request exceeded the time limit").
   RULES: `@TestSetup` once per class; minimal fixture DML; run per class (`--synchronous` where
   possible); never one giant run while managed triggers are in play.

8. **Test-context callouts are blocked**, so the Slack trigger cannot actually post during tests. But
   absence of a side effect in a test proves nothing about production behavior (the Slack watch probe
   remains open for that reason).

9. **Fixtures must satisfy validation rules the probes never saw.** Probes reuse existing records;
   fixtures build the whole chain from scratch and hit creation-time VRs. Discovered tonight:
   `LLC_BI__Collateral_Type__c` has active VR `Advance_Rate_should_not_be_null` ("Please enter an
   advance rate for the collateral type") and the error surfaces on the COLLATERAL insert, not on the
   type record. Fixture fix: `LLC_BI__Advance_Rate__c = 50` on the type.

10. **Assertion messages must carry the tool's own error.** A bare `Assert(stage should succeed)` made
    finding 2 undiagnosable; asserts now print error code + message + verbatim org error. Keep that
    pattern in every new test class.

## 3. nCino object facts (verified, org = bankinggpt)

11. **Review (`LLC_BI__Review__c`):** insert with only the account lookup succeeds; record type is
    auto-assigned by `Review After Save` (NEVER set `RecordTypeId`); `LLC_BI__Status__c` and
    `LLC_BI__Review_Type__c` do NOT default and must be set explicitly. The field
    `LLC_BI__reviewStatus__c` does NOT exist on Review (it belongs to `LLC_BI__LLC_LoanDocument__c`).

12. **Collateral Valuation:** two fields suffice (`LLC_BI__Collateral__c` + `LLC_BI__Value__c`);
    booleans default false so a revaluation sets `Active`/`Primary` explicitly; whether the insert
    rolls up onto the Collateral is UNPROVEN (nCino binds the auto-update to the Add Valuation button);
    the tracker must verify the rollup by re-query and report honestly.

13. **Case:** zero validation rules; `Service Request` (Type) and `Agent` (Origin) are live picklist
    values as of 2026-07-26; the Slack trigger's outbound behavior on insert is unproven.

14. **Loan/LoanRenewal (wave 2 relevant):** `LLC_BI__LoanRenewal__c` has 0 VRs, 0 triggers, 0 flows —
    nothing corrects a malformed row and failures are silent. `LLC_BI__ParentLoanId__c` is set-once.
    nCino async credit-action failure reverts silently with records in the Recycle Bin
    (PDI-00017266) and failed background Apex is known to produce duplicate modification loans, so
    idempotency is OURS and verification re-queries are mandatory. `ACNPEX_ AccountOwnerAsLoanOfficer`
    overwrites `LLC_BI__Loan_Officer__c` before save: report loan officer as org-assigned.
    `PPCacheCreation` and `ProductPackageBaselineCaptureTrigger` swallow failures to `System.debug`:
    mark their steps "org-side, unverifiable".

15. **Stage authority (founder decision):** Loan stages are the lifecycle that matters; the package
    field is the managed `LLC_BI__Stage__c`; `cm_Credit_Stage__c` is never an authority and a mismatch
    is a data-quality finding.

## 3b. nCino object facts added by the WP3 probe campaign (2026-07-26, PROBE-LEDGER wave 3)

Every item below is probe-backed. Ledger rows: Probes 4 to 9.

15a. **The org REWRITES the Loan `Name`, and self-populates `LLC_BI__Product__c`.** A before-save flow
     rebuilds `Name` as `<Account> - <Product> - <Amount>`; a before-save trigger sets `Product` to
     `Construction` when you leave it blank. We submitted `ZZ-PROBE-20260726 Facility` and the org
     stored `ZZ-PROBE-20260726 DO NOT USE - Construction - $0`. RULE: never echo back the name you
     submitted. Report the org-assigned name, the way `execute_collateral_valuation` reports
     `recordName`. And collect Product at stage time or ship loans mislabelled `Construction`.

15b. **The Loan Detail is created by an ASYNC-PATH FLOW, in about 4 seconds, not by Apex.** Separate
     transaction, elements `Loan_Detail_Exists` → `Create_Loan_Detail` →
     `Update_Loan_with_New_Loan_Details_Record`. **No `AsyncApexJob` row is produced**, so anything that
     polls `AsyncApexJob` to detect completion will wait forever. Poll the Loan's
     `LLC_BI__Loan_Detail__c` lookup instead. A `waitBudgetMs` of 10 to 30 s is evidence-backed for a
     single-record insert. Of the two fields LV12/LV13 gate, the org pre-fills
     `LLC_BI__Application_Method__c` (`Online`) and leaves `LLC_BI__Primary_Loan_Purpose__c` null, so
     only the purpose must be collected.

15c. **A Loan insert passes 21 validation rules and wakes five namespaces.** `LLC_BI`, `nFORCE`,
     `nCino`, `NDOC`, `nCRED`, with 42 `VALIDATION_PASS` and zero failures at Qualification/Open from a
     six-field payload. The insert transaction ran 6.4 s and produced a 562 KB log. Budget for that:
     it is not a cheap write.

15d. **`LLC_BI__RootLoanId__c` DOES NOT EXIST on `LLC_BI__Loan__c` in this org**, and
     `LLC_BI__ChildLoanId__c` does not exist on `LLC_BI__LoanRenewal__c`. A33.4.1(a) names
     `RootLoanId` as the chain anchor; that is wrong for bankinggpt. Re-source any chain-walking design
     before writing it.

15e. **`LLC_BI__Annual_Review__c` has no `RecordTypeId` and no `OwnerId`**, and is a cascade-delete child
     of Account. `LLC_BI__Status__c` **defaults to `Not Approved`** (proven by insert). That is worse
     than Review's null: an omitted status reads as a *decision*. Always set `In Review` explicitly.

15f. **The collateral rollup does not exist headlessly, and there is no flag that turns it on.** A
     valuation insert leaves `LLC_BI__Collateral__c.LLC_BI__Value__c` untouched, and setting
     `LLC_BI__Collateral_Type__c.LLC_BI__Auto_Update_Collateral_Value__c = true` changes nothing (both
     arms probed; all 43 collateral types in the org have it `false` anyway). nCino binds the update to
     the **Add Valuation** button. `LLC_BI__Lendable_Value__c` is a formula on the collateral's own
     value and is equally unmoved. Never claim coverage improvement from a filed valuation.

15g. **`slackv2` posts are gated on `slackv2__Subscription__c`, and the gate is queryable.** The trigger
     runs on every Case insert (25 managed-package entries) but our probe produced `0` callouts, `0`
     future calls, `0` queueable jobs, `0` email invocations and no follow-on transaction, because both
     of its `Subscription__c` decision queries returned zero rows. The org holds exactly five
     subscriptions, one `Assigned to Me` per standard object; the Case one belongs to user
     `005bb00000I8VXJAA3`. **A Case created for or assigned to that user WILL attempt a post.** Run the
     subscription query pre-flight and make the warning conditional instead of permanent. This does not
     cover Slack-side subscriptions outside Apex (CDC, platform events), which stay unproven.

15h. **`acnpex_covenantApprovalProcess` fires on CREATE ONLY, with zero entry filters.** It is a
     flow-based `ApprovalWorkflow` (`301bb00000T6YxZAAV`), the only one in the org:
     `triggerType RecordAfterSave`, `recordTriggerType Create`, `filters []`, `exitRules []`. **It never
     fires on an update** — not on status, not on narrative fields. Since A33 forbids creating
     compliance records, **our tools cannot start the bank's chain by construction**. Two corollaries:
     zero filters means **no `Exclude_Flow` bypass is consulted**, so on a create nothing stops it; and
     the classic `CCAP100 Covenant Compliance Approval` process is `Obsolete`, so `ProcessInstance` is
     the **wrong object** to verify this chain against.

15i. **A "valid facility" for a credit action is Booked + Open + non-null `LLC_BI__lookupKey__c`.**
     Every parent loan on every `LLC_BI__LoanRenewal__c` row in the org matches that shape. Anything
     else returns `The request contains invalid facilities`, at any pre-approval stage, for both
     `Renewal` and `Modification`.

15j. **`Loan_Validation_06` makes `Booked` unreachable by API, with no bypass.** Verbatim: *"You Cannot
     Manually Change the Loan to a Post Approval Stage. The Loan Must be Approved by pressing the
     'Submit for Approval' Button at the top of the page. - LV06"*, alongside *"A Loan Number is
     Required Prior to Changing the Loan Stage to 'Booked' - LV05"*. Combined with 15i this makes the
     loan-clone probe **unrunnable on throwaway data**: reaching Booked means running a real approval
     process with real approvers. **Modification and renewal are phase-limited: `stage_*` shippable,
     `execute_*` HELD.**

15k. **The Qualification → Proposal hop works headlessly.** Set
     `LLC_BI__Primary_Loan_Purpose__c` on the Loan Detail, then PATCH the Loan stage; LV11/LV12/LV13/LV14
     are satisfied by amount, that purpose, the org-defaulted `Application_Method` and the org-assigned
     loan officer. A33.4.3 phase 2 is evidence-backed.

15l. **A Product Package CAN be created; the `Deal_Proposal` gap is a labelling problem.**
     `Deal_Proposal` is `IsActive false` and `Treasury_Maintenance` is `IsActive true`, but **neither is
     `available` to the running profile** — only `Master` is. An insert with no `RecordTypeId` succeeds
     on `Master`. A33.4.3(d)'s stated blocker is not a write blocker.

15m. **⚠️ `acnpex_CreditActionRequestSample` is a landmine: it ignores its inputs and runs a real
     `Renewal` against hardcoded ids** (`contextId = 'a5Fbb0000001C9kEAE'`, loan `a4Zbb000000xykvEAA`,
     `isAsync = true`). Never invoke it to inspect a request shape. Read the class instead.

15n. **`acnpex_CreditActionRequest` swallows the credit action's real failure reason.** Its unguarded
     tail query (`newLoan = [... limit 1]`) assumes a clone exists, so every no-output failure surfaces
     as `System.QueryException: List has no rows for assignment to SObject` while `failureReasons` is
     discarded. Call `performAction()` directly and read the result object, or bankers get a platform
     stack trace instead of the bank's own refusal. Note also that **no `LLC_BI__*CreditAction*`
     invocable is exposed in the Actions API at all** — the only route is this local wrapper.

15p. **An after-commit async flow can NEVER be awaited inside the transaction that triggered it, and
     Apex has no sleep, so a "bounded wait" in a synchronous invocable is an anti-pattern.** Wave 4
     proved both halves on the Loan Detail: a 6 s in-transaction spin left the lookup `null`, the same
     loan showed the child populated after commit, and the spin itself burned 6,511 ms of the
     10,000 ms synchronous CPU limit. A 30,000 ms declared budget is 3x the entire ceiling, so the
     platform fault fires before the tool's own `filed_unverified` fallback can ever be reached.
     RULE: never spin-wait in Apex. A tool that depends on an after-commit side effect must **return**
     with the record id and a `filed_unverified` wait step, and let the caller re-invoke behind the
     idempotency fence. Measure before blaming the payload: the loan insert itself cost only 681 ms CPU,
     so the insert was never the problem.

15r. **The two-invocation resume is the correct shape for any after-commit dependency, and it is
     live-proven.** Invocation 1 writes, commits and returns `partial` + `resumable`; invocation 2 does
     ONE re-read and either completes or stays `waiting`. Measured on the redeployed
     `execute_new_facility`: 6 s then 4 s, zero CPU exposure, all six steps `verified`, one resume
     sufficed after a 12 s gap. The token is consumed exactly once, by invocation 1. **Never make an
     absent async child a failure** — `waiting` and `resumable` are the honest states.

15s. **`required=true` on an `@InvocableVariable` is enforced by the Actions API BEFORE Apex runs, so a
     "pass null on resume" contract cannot be expressed.** `"decisionToken": null` and omitting the key
     both return `REQUIRED_FIELD_MISSING: Missing required input parameter: decisionToken`, even though
     the Apex resume path never reads the field. Any optional-on-resume parameter must either be
     declared `required=false` or be given a non-blank placeholder by the caller. Check this whenever a
     tool has more than one call shape: the Apex contract and the wire contract can disagree silently
     until a live call proves it.

15t. **Some success paths are unreachable in test context and can only be proven by probe.** The
     `execute_new_facility` invocation-2 success path depends on an after-commit flow that test context
     never runs, so unit tests can only cover the still-waiting branch. Green tests will not catch a
     regression there. Record such paths as probe-verified in the ledger and re-run the live check after
     any refactor. Coverage is not the same as evidence.

15y. **Product Packages in this org carry NO record type, and follow a wizard naming convention.**
     Live SOQL 2026-07-26: the 12 most recent packages all have `RecordTypeId` null, including ones
     nCino's own wizard created, and 516 of 518 are named `<Account Name> - <M/D/YYYY> - PP`. Create
     packages that way and agent-created packages are indistinguishable from wizard-created ones in a
     list view. **A33.4.3(d)'s `Deal_Proposal`-inactive concern is moot**: probe 9 already showed only
     `Master` is available to the running profile and an insert with no `RecordTypeId` succeeds.
     Package creation wakes `PPCacheCreation` and `ProductPackageBaselineCaptureTrigger`, both of which
     swallow failures to `System.debug`, so those steps are org-side unverifiable by construction.

15z. **Refuse at stage what the org can never execute.** `stage_loan_modification` and `stage_renewal`
     now refuse a facility that is not `Booked` + `Open`, in banker copy naming the rule and the
     facility's actual stage. Staging a plan the credit action would reject is dishonest staging.
     Consequence to accept rather than engineer around: the successful plan shape becomes untestable,
     because `Booked` is unreachable through the API (LV05/LV06, no bypass). Do not contrive a fake
     booked loan to recover the coverage; that tests the mock, not the org.

15q. **A platform LimitException rolls the whole invocable back cleanly, and a well-built fence
     survives it.** When `execute_new_facility` died on CPU, no Loan was created and the staging row
     stayed `Staged` with the token unconsumed and the plan resumable. Verify this property deliberately
     after any fault: an uncaught fault that leaves a half-consumed token is a far worse defect than the
     fault itself.

15u. **Borrowing structure lives on `LLC_BI__Legal_Entities__c` (label "Entity Involvement"), and a Loan
     insert does NOT create one.** One hard-required field (`LLC_BI__Account__c`, cascade-delete from
     the account); both `LLC_BI__Loan__c` and `LLC_BI__Product_Package__c` are populated on every real
     row. The role field is **`LLC_BI__Borrower_Type__c`**: `Borrower, Guarantor, Limited Guarantor,
     Co-Borrower, Related Entity, Grantor, Contractor`. **There is no primary-borrower boolean** — the
     role is the flag, and `Is_Borrower__c` / `Is_Guarantor__c` / `Is_CoBorrower__c` / `Is_Grantor__c` /
     `Is_Related_Entity__c` are **formulas** derived from it: never write them. Proven with a control
     (the Loan Detail appeared, involvement rows did not): **any tool that creates a facility must also
     create the borrower row, or the facility has no borrowing structure at all.**

15v. **`LLC_BI__Ownership__c` and `LLC_BI__Contingent_Amount__c` are mutually exclusive on one
     involvement row.** VR `Contingent_Amount_and_Contingent_Percent` fires whenever both exceed zero;
     its only escape tests for `Household` in the role, and **no active role value contains
     `Household`**, so the rule is unconditional in practice. Every real row in the org sets Ownership
     (usually 100) and leaves Contingent Amount null. Also: `Ownership_Less_Than_0` tests
     `LLC_BI__Ownership__c` but its message says "Contingent Percentage" — **mirror the formula's field,
     never the message's noun** (same defect class as `Mandatory_comment` on Risk Rating Review).

15w. **RECORD-TYPE PICKLIST SCOPING IS NOT ENFORCED BY THE API, and the global describe lies about what
     is offerable.** On `LLC_BI__Loan__c`, the Commercial Loan record type omits `Term` from Product,
     `Complete` from Stage, and all four `Pre-*` values from Status — yet a PATCH writing
     `Product = 'Term'` onto a Commercial-RT loan returned 204 and stored it (all three picklists are
     `restrictedPicklist: false`). **We already shipped this bug**: the wave-4b `stage_new_facility`
     probe passed `Term` and created a loan carrying a value its own record type does not offer. RULES:
     read offerable values from
     `/services/data/v67.0/ui-api/object-info/{obj}/picklist-values/{recordTypeId}/{field}`, never from
     the describe; and validate the value server-side, because nothing on the platform will.

15x. **Check `dependentPicklist` before assuming a picklist chain exists.** (Independently confirmed
     by the wave-2.1 build round, which reached the same conclusion from the tool side and whose
     duplicate entry was merged into this one.) The Product
     Line/Type/Product fields *look* like a hierarchy and are three independent, unrestricted picklists
     with no controller. bankinggpt has exactly three dependent picklists, all on Loan
     (`Lead_Specifics` ← `LeadSource`, `Lost_To` ← `Status`, `Structure_Hierarchy` ← `Structure`), and
     **none is on any write list our tools use**. Decode `validFor` (base64 bitmap, bit index = the
     controller's value position, MSB first per byte) rather than guessing. Package, Entity Involvement
     and Collateral Valuation have none at all.

15y. **A `PRIORVALUE`-based validation rule does NOT fire on insert, so "post-approval stages are
     unreachable" is only true of UPDATES.** `Loan_Validation_06` (and `Review_Validation_01/02`) test
     `ISPICKVAL(PRIORVALUE(Stage),...)`, which is blank on an insert. A loan can therefore be **created**
     directly at `Booked` with no bypass, as long as `LLC_BI__lookupKey__c` is supplied to satisfy LV05.
     Six facilities were migrated this way with the `Exclude_Validation` fence untouched. This does NOT
     weaken the wave-3 finding that LV06 blocks a *stage hop* to Booked, which is what the credit-action
     path needs: **insert-at-Booked and transition-to-Booked are different questions with different
     answers.** Always test the insert path separately.

15z. **Never trust a subagent's static reading of a validation rule over an empirical test.** The
     loan-children research agent read LV05/LV06 and concluded they "will block a migration that sets
     Stage = Booked directly." They do not. Acting on that would have meant granting
     `Exclude_Validation` on a shared sandbox for no reason. Agent output is a hypothesis; the org is the
     authority.

15aa. **Record-type ASSIGNMENT and RESTRICTED picklists are hard walls; unrestricted picklists are not.**
     Refines 15w. Writing a `RecordTypeId` the running profile is not assigned fails with
     `INVALID_CROSS_REFERENCE_KEY`; writing a restricted picklist value outside the record type fails
     with `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST`; writing an **unrestricted** picklist value outside
     the record type **silently succeeds**. Check `restrictedPicklist` and the profile's record-type
     assignments before planning any migration payload.

15ab. **Model a commercial family group with `LLC_BI__Connection__c`, never a Household.** In bankinggpt
     the FSC household machinery is installed and structurally complete but unused: all 5 households are
     test artifacts with zero rollups, 0 of 208 Connections use household roles, and `Account.ParentId`
     is null on all 762 accounts. Insert only the detail-bearing connection direction and let
     `LLC_BI.ConnectionTrigger` create the mirror; populate `LLC_BI__UID__c` = `FromId+ToId+RoleId`.

15ac. **`LLC_BI__Loan_Collateral2__c` requires THREE parents.** `Collateral`, `Loan`, **and**
     `LLC_BI__Loan_Collateral_Aggregate__c`, which must be created first (no required fields, one per
     loan by org convention). Keep `Amount_Pledged <= Current_Lendable_Value` and
     `Pledge_More_Than_Lendable_Value` never fires, so `LLC_BI__Authorize__c` never has to be set. Any
     advance rate other than the collateral type's default needs `Advance_Rate_Override__c` **plus** a
     written `Override_Reason__c`.

15ad. **Migration field-length traps in the nCino model:** `LLC_BI__Collateral__c.LLC_BI__Description__c`
     is 255 (use `LLC_BI__Collateral_Legal_Description__c`, 32k, for the real narrative);
     `LLC_BI__Policy_Exception__c.LLC_BI__Mitigation_Reason_1..3__c` are 100 each;
     `LLC_BI__Legal_Entities__c` has **no** `Description` field at all (the narrative field is
     `LLC_BI__Notes__c`, and `Migration_ID__c` / `Integration_Source__c` exist for provenance).

15ae. **Build permanent data through an idempotent registry, not a straight script.** Every insert keyed
     into a local `registry.json` and skipped if the key already existed. Six payload errors were hit
     during the Hartwell migration (derived field, formula field, restricted picklist, unavailable
     record type, two length overflows) and each rerun resumed cleanly with **zero duplicate records**.
     For permanent data a partial failure must never force a choice between duplicates and manual
     cleanup.

15o. **Deploy-free instrumentation pattern.** When a probe needs trigger-level evidence, create your own
     `DebugLevel` and `TraceFlag` on the probe actor, pull the log with `sf apex get log`, then delete
     both and verify. Never reuse or edit an existing one. The high-value greps: `ENTERING_MANAGED_PKG`
     for the namespace census, `VALIDATION_RULE` for the rule inventory, `FLOW_ELEMENT_BEGIN` for flow
     identity (element names are far more legible than flow ids, which resolve poorly), and the
     `LIMIT_USAGE_FOR_NS` block for the callout/future/queueable/email counts that settle whether
     anything left the org.

## 3c. Campaign doctrine: what "do not touch the existing build" protects

**Standing rule, founder-approved 2026-07-26. Do not re-litigate this per round.**

The no-touch prime directive protects the org's **pre-existing build**: nCino, managed packages,
other teams' config, and standing data. It does **not** freeze the components this campaign created.

- **Never touched:** anything that existed before this campaign. Probes run on throwaway data.
- **May evolve ADDITIVELY, with a quoted receipt:** our own components. That is the four-class
  engine (`C360Plan`, `C360WriteGuard`, `C360ActionStaging`, `C360Picklist`), `cm_Action_Staging__c`,
  our tool classes, and the `Customer360` server definition's tool rows.
- **The receipt is the control.** A `Changed` receipt on one of our components is fine when the diff
  is additive and quoted. A `Changed` receipt on anything else is a STOP.

Worked example: wave 2 extended `C360WriteGuard` with three new object rows (109 added lines, no
existing row altered, no branch removed) and the server definition from 15 to 23 tool rows. Both
deployed as `Changed (our component, additive, approved)`.

Corollary that follows from the same logic: extending the allowlist in `C360WriteGuard` is
MANDATORY, not optional. Rule 18 forbids inlining a fence in a tool class, so a new write target
always means a `Changed` receipt on the guard. Plan for it rather than treating it as a blocker.

## 4. Apex patterns locked in (follow them in wave 2)

16. **One `@InvocableMethod` per class** — it is the MCP exposure contract, not a style choice.
    `global with sharing`, positional `List<Response> run(List<Request>)`, all wire-visible types as
    global inner classes, wire types NOT shared across classes (duplication accepted: it is the only
    serialization shape proven in this org). API version 67.0.

16aa. **`@InvocableVariable(required=true)` is enforced by the REST Actions API BEFORE your Apex runs,
     and NO Apex unit test can see it.** Direct invocation from a test calls the method with whatever
     you construct; the platform's required-field check only exists on the wire. Consequence: a tool
     that grows an ALTERNATIVE input shape must drop `required=true` from every field the new shape
     supersedes, and enforce requiredness in Apex instead.

     Shipped defect, 2026-07-27: `stage_collateral_valuation` gained `items[]` for bulk while its flat
     `collateralId`/`value` kept `required=true`. An items-only call was refused by the platform with
     `REQUIRED_FIELD_MISSING: Missing required input parameter: collateralId` and our Apex never
     executed. The suite was 141/141 green throughout, because it structurally cannot reach that layer.

     RULES: (1) any either-or input pair is `required=false` on both sides, validated in Apex, which
     can also name WHICH item of a batch is wrong; (2) the nested Apex-defined type gets the same
     treatment, since enforcement on nested required flags is unproven and Apex validation is strictly
     better; (3) **observe the envelope on the wire after any input-shape change** — a green suite is
     not evidence about the invocable contract. Audit with:
     `grep -oP "@InvocableVariable\(label='\K[^']+(?=[^)]*required=true)" *.cls`

     **Audit caveat (2026-07-27).** That grep cannot tell an ATTRIBUTE from the same characters inside
     a `description=` string literal, so a field documented as "not flagged required=true" reports as
     required. It fired a false positive on `stage_loan_modification` and `stage_renewal`, whose
     descriptions were then reworded to "not flagged required on the invocable".
     **`StageCollateralValuation` still carries the tripping prose on `collateralId` and `value`** and
     will keep reporting as a false hit until someone rewords it. Confirm every hit by reading the
     line before acting on it.

16a. **NEVER mix `Id` and `String` in a ternary.** Apex infers the expression type from the operands,
    so `(name == null ? record.Id : name)` resolves to `Id` and coerces the String branch through
    `Id.valueOf()`, which throws `System.StringException: Invalid id: CV-0000000004` at runtime on a
    perfectly good record. It costs a full test round every time. Always `String.valueOf(record.Id)`.
    This bug shipped once, was fixed, and **recurred in all three wave-2 execute classes**, so it is
    a rule now rather than an anecdote.

16c. **Some coverage is legitimately unreachable, and padding it is worse than reporting it.**
    `ExecuteNewFacility` sits at 77.1% because its phase-2 success path cannot run in a test
    transaction: nCino creates the Loan Detail through an async-path FLOW in a separate transaction
    (probe 5), which does not fire inside a test, so the poller always takes the timeout branch and
    the purpose-write plus stage-hop lines never execute. The timeout branch IS tested and asserts
    the correct behaviour (`filed_unverified`, dependent steps `skipped_not_attempted`, facility left
    at Qualification). Clearing the rest needs a live run, not a cleverer test. Document the gap and
    leave it; do not contrive a fake to colour it in.

16b. **Fixture lookups go through the RELATIONSHIP, never through `Name`.** nCino rewrites names on
    save (probe 5 proved it on Loan), so a Name-keyed fixture query silently returns zero rows and
    every dependent test dies with "List has no rows for assignment to SObject".

17. **Security stack on every write path:** `WITH USER_MODE` on queries, `insert as user`,
    `Security.stripInaccessible` PLUS a must-survive assertion on fields whose silent stripping would
    corrupt semantics (a stripped `LLC_BI__Status__c` files a Review in no status — probe 3's trap).

18. **The A33 fence mechanics:** stage_* = zero domain DML, plan + hash + staging record only, no
    record id in stage output. execute_* = token-gated (single-use, hash-stored, bound to
    stagingId + planHash + user, approver must BE the running identity), idempotency key enforced on
    both sides, transition allowlist enforced in `C360WriteGuard` (extend the allowlist there, never
    inline in a tool). Reuse the four-class engine (`C360Plan`, `C360WriteGuard`, `C360ActionStaging`,
    `C360Picklist`); a new action is two thin tool classes + one test class.

19. **Bypass fence:** `Exclude_Flow`/`Exclude_Trigger` per action per the A33.5.5 matrix (modification
    and renewal WITH, new facility WITHOUT — its design depends on the async Loan Detail flow),
    `Exclude_Validation` NEVER. VRs carrying no `$Permission` apply to the agent exactly as to bankers;
    that is correct, do not fight it.

20. **Re-run write-contract describes as the service identity before shipping** — createable/updateable
    are FLS-scoped, and missing FLS on the renewal/modification flag fields mis-types loans silently.

## 5. Probe discipline (unchanged, now with teeth)

21. Every write object gets an insert (or update) probe before its tool is built; evidence goes to
    PROBE-LEDGER.md with verbatim request, returned ids, verification query + result, and deletion
    verification by re-query. Loan-shaped probes run against throwaway `ZZ-PROBE-<date>` accounts,
    never Piedmont or any demo-visible account, cleanup verified by query.

22. **Wave 2 blocking probes, in order:** covenant approval-chain entry criteria (which field write
    starts `acnpex_covenantApprovalProcess` — every covenant tool is HELD until this lands),
    `LLC_BI__Annual_Review__c` insert, collateral rollup behavior, Slack watch on Case insert, and
    LAST, isolated: the loan clone through the nCino invocable.
    **STATUS after the WP3 campaign, 2026-07-26:** covenant entry criteria **CONFIRMED** (Create-only,
    zero filters, settled from Flow metadata with no writes); `LLC_BI__Annual_Review__c` insert
    **CONFIRMED**; collateral rollup **CONFIRMED negative**; Slack watch **CONFIRMED** (trigger runs,
    emits nothing, gated on a queryable subscription); loan clone **HELD**, blocked by LV06. Also
    confirmed en route: `LLC_BI__Loan__c` insert, Product Package creation, and the
    Qualification → Proposal hop. See `PROBE-LEDGER.md` wave 3.

23. **HELD is a result, and it is the discipline working.** Two of the six WP3 probes were held. Both
    holds are load-bearing: the covenant write arm because the only throwaway route fires an approval
    step at a named human, the loan clone because LV06 puts the required stage out of API reach. A probe
    that stops at the prime directive and records the exact blocking fact has produced more usable
    engineering truth than one that improvises around it. Record the reason verbatim, then stop.

24. **Settle it from metadata before you settle it with a write.** The covenant question had been the
    single gating unknown for every covenant tool, and it was answered in one Tooling API read of the
    flow's `start` element. Order of attack for any "what starts X" question: read the automation's
    definition first, use a write only for what the definition cannot tell you (defaults, overwrites,
    async timing, rollups). Writes are for behaviour, not for configuration.

25. **`select` is a reserved identifier in Apex, and the compiler blames the wrong line for it.**
    A shared helper `C360Facilities.select(String, List<Id>, String)` produced twelve cascading errors
    on the DECLARATION line: `Unexpected token '<'`, `Identifier name is reserved: List`,
    `Method does not exist or incorrect signature: void isNotBlank(String) from the type List<Id>`.
    None of them names `select`. The parser gives up on the method signature, then misattributes every
    downstream expression. Same trap applies to any SOQL keyword used as a method or variable name.
    Corollary found in the same round: a local variable that shares its name with a private method in
    the same class (`String ref = ref(i, n)`) shadows the method. Rename the local, not the method.
    RULE: when a fresh class explodes with a dozen parse errors all pointing at one line, read that
    line for a reserved word before reading anything else.

26. **An either-or input pair needs the flat shape to survive the platform's empty-list ambiguity.**
    When `stage_loan_modification` and `stage_renewal` grew `facilityIds` alongside the flat `loanId`,
    the obvious rule ("an explicitly supplied but empty `facilityIds` is refused") is only safe when
    the flat shape is absent. It is not settled whether the Actions API delivers an omitted List as
    `null` or as an empty List, and by lesson 16aa no Apex test can settle it. If the platform hands
    Apex an empty list for an omitted key, a rule that refuses `loanId` + `[]` breaks EVERY
    back-compat call on the wire while the suite stays green. So: refuse the empty list only when no
    flat value was supplied, and let flat + empty take the flat path. The refusal the spec wants is
    preserved for the case that matters; the back-compat shape never depends on an unobserved
    platform behaviour. Generalise: when adding an alternative shape, make the OLD shape's success
    independent of any assumption about how the platform serialises the new one.

27. **A package-anchored tool must actually check package membership, and the check has to be
    Id-to-Id.** The pre-`facilityIds` `stage_loan_modification` took `productPackageId` and `loanId`
    and never verified the loan was on that package, so a caller could stage a plan anchored on a
    package the facility has nothing to do with, and the deep link would point at the wrong deal.
    The fix is one comparison, but it must be `Id != Id`: comparing the loan's 18-char
    `LLC_BI__Product_Package__c` against the caller's raw String refuses every 15-char id. Parse the
    anchor through `Id.valueOf` plus a `getSObjectType()` check first (lesson 4b, fail closed), then
    compare typed values. Verified live: the Hartwell LoC refused against a foreign package id and
    named where it actually belongs.

## 6. Platform/cockpit side (for completeness)

23. The claude.ai artifact-connector bridge has a per-page-session trust budget burning on call volume
    AND payload shape; prompts from a page to an LLM tool must be short banker prose (600-char cap,
    sanitizer); the block wording blames "organisation policy" but is platform metering; quarantine is
    per-connector and account-wide for pages; recovery = fresh page grant or time. Demo doctrine:
    under 10 asks per beat, reload between segments.

24. Capability pages: no polling (staleness-based refresh only), callTool on user gesture only, one
    observed request/response pair per tool before publish.

## 7. Collateral coverage correctness (2026-07-28, Apex lane)

28. **The pledge's `LLC_BI__Current_Lendable_Value__c` is the WHOLE collateral's lendable value, not
    the facility's slice — so it must never be summed across facilities.** It is a plain currency
    field (not a formula) and it equals `Collateral_Value x the pledge's advance rate` on 14 of the
    org's 15 pledges. Three of Hartwell's four assets are pledged to two facilities each, so the
    old `Σ per-pledge Current_Lendable_Value` claimed 59.2MM of a 31.6MM pool. The facility's own
    share is **`LLC_BI__Amount_Pledged__c`**, and `LLC_BI__Unique_Id__c` on the pledge
    (`<aggregateId> - <collateralId>`) confirms the pledge is a per-collateral allocation row.
    RULE: facility-level math divides Amount_Pledged; relationship-level math dedupes by
    `LLC_BI__Collateral__c` and counts each asset's lendable value once. Never mix the two.

29. **`LLC_BI__Loan_Collateral2__c.LLC_BI__Advance_Rate__c` is the single source of truth for the
    advance rate, and it is a formula that already resolves the precedence.** Verbatim:
    `IF(NOT(ISBLANK(Advance_Rate_Override__c) || ...==0), Advance_Rate_Override__c,
    IF(NOT(ISBLANK(Auto_Applied_Advance_Rate__c) || ...==0), Auto_Applied_Advance_Rate__c,
    Collateral__r.Collateral_Type__r.Advance_Rate__c))`. The COLLATERAL record carries a different
    formula (the type's rate only), which reads 80% in this org on assets whose pledges are
    overridden to 50% and 75%. A surface reading the collateral side shows a different lendable
    value for the same asset than one reading the pledge side. Read the pledge side, always, and
    report which arm won so the number is auditable.

30. **`LLC_BI__AmountOutstanding__c` is dead in bankinggpt and `LLC_BI__Principal_Balance__c` is the
    live balance.** 1 of 542 loans has AmountOutstanding, and on that one it reads 0 against a real
    124,887 Principal Balance. 203 loans have Principal Balance. 0 loans have Principal Balance null
    AND AmountOutstanding non-null, so the fallback is insurance that has never fired. Two
    independent org-side confirmations: summing Principal Balance across Hartwell reproduces the
    package rollup exactly (31,030,000 / 14,970,000 unused), and nCino's own `LLC_BI__Current_LTV__c`
    formula divides `Principal_Balance + Total_Superior_Lien_Amount` for booked non-LoC facilities.
    Corollary: `LLC_BI__Amount_Available__c` is a formula over AmountOutstanding and is therefore
    blank wherever the balance actually lives — compute availability, never read it.

31. **A missing basis is not a zero basis. Return null with a reason.** Exactly 1 of 15 pledges
    org-wide has a null `Amount_Pledged`, and that row's `Original_Lendable_Value` (34,000) and
    `Current_Lendable_Value` (80,788.50) disagree, so nothing in the data licenses the inference
    "null means the whole asset". The read returns `coverageRatio = null` plus a `coverageNote`
    naming which pledges lack a share. Same treatment where all pledges are Excluded: the facility
    says "all N pledges are flagged Excluded or Abundance-of-Caution", rather than showing an empty
    collateral table with no explanation. That means filtering the excluded pledges in APEX, not in
    the SOQL WHERE clause — a filtered-away row cannot be counted or explained.

32. **Re-updating an sObject returned by `insert` fails on any set-once field it carries.**
    `LLC_BI__Loan_Collateral2__c.LLC_BI__Loan_Collateral_Aggregate__c` is `updateable: false`, so
    `p = pledge(...); p.LLC_BI__Is_Excluded__c = true; update p;` dies with
    `System.DmlException: Operation failed due to fields being inaccessible on Sobject
    LLC_BI__Loan_Collateral2__c` — an error that names the object but not the offending field, and
    points at the DML line, not the field assignment. Cost two test failures on the first validate.
    RULE: update through a FRESH sObject carrying only `Id` plus the fields you are changing.

33. **Linking `LLC_BI__Loan__c.LLC_BI__Loan_Collateral_Aggregate__c` is inert at staging time, and
    `LLC_BI__Is_Secured__c` does NOT follow from it.** Six Hartwell loans linked per nCino KB
    `kAHHu000000XabhOAC`; `Total_Collateral_Value__c`, `Current_Total_Lendable_Value__c` and
    `Current_LTV__c` populated instantly (they are formulas through the lookup), but `Is_Secured__c`
    stayed `false` on all six because it is a **plain writable boolean, not a formula** — the
    standing docs had this wrong. `stage_renewal` on the same facility returned a byte-identical
    response before and after (same `planHash`), and no pledge, collateral or aggregate record was
    written. The KB `kAHHu000000XadDOAS` DUPLICATE_VALUE risk is an EXECUTION-time risk only.
    Two live data points on it: 2 of the org's 43 renewals have a parent loan carrying an aggregate,
    both succeeded, and one of the two cloned the pointer onto its child — producing exactly the
    shared-aggregate shape KI `kAHPY0000005A1x4AE` warns about. The org's own
    `Fields_To_Not_Clone_Renewal` field set (org-local, unmanaged, 15 fields) already excludes
    `LLC_BI__Fee_Loan_Aggregate__c` but NOT `LLC_BI__Loan_Collateral_Aggregate__c`. Do not change
    that field set: it is pre-existing org config. Re-probe when `execute_renewal` unblocks.

---

*Maintained by the orchestrator. Add to this file in the same build wave a lesson is learned; a lesson
that lives only in a session transcript does not exist.*
