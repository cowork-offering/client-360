/**
 * Customer360ActionHistoryTest - the read tool's ordering, cap, name resolution, the executed-step
 * reconstruction the credit memo room depends on and, above all, the guarantee that no token
 * material can leave through it.
 *
 * The token assertion is written against the SERIALISED response rather than against the wire
 * fields, because the risk being tested is not "did we map the field" but "could the value reach a
 * caller through any serialisation path at all". A staging row is seeded with a recognisable token
 * digest and the test proves that string does not appear anywhere in the output.
 *
 * THE MODIFICATION FIXTURE IS BUILT THROUGH C360Plan, never as hand-written JSON. The read parses
 * exactly what stage_* wrote, so a fixture that spelled the plan out by hand would drift from the
 * producer the first time the plan shape moved and the test would keep passing against a shape
 * nothing writes. Building it with C360Plan.Step and C360Plan.serializePlan means the fixture is
 * wrong the moment the producer changes, which is the point.
 */
@IsTest
private class Customer360ActionHistoryTest {

    private static final String SENTINEL_TOKEN_HASH = 'ZZSENTINELTOKENHASHMUSTNEVERAPPEARINOUTPUT0000000000000000000000';
    private static final String SENTINEL_PLAN_HASH = 'ZZSENTINELPLANHASHMUSTNEVERAPPEARINOUTPUT00000000000000000000000';

    /** Every row the fixture seeds, so a count assertion says what it counted. */
    private static final Integer SEEDED_ROWS = 10;

    @TestSetup
    static void makeFixture() {
        // The org's 24 change-data triggers enqueue a callout-making queueable per record, and a
        // test context refuses the callout unless a mock is armed. Arm it FIRST, always.
        C360TestFixture.armCalloutMock();
        Account a = new Account(Name = 'ZZ-WP2-TEST Borrower');
        insert a;

        Case c = new Case(AccountId = a.Id, Subject = 'ZZ-HIST case', Status = 'New');
        insert c;

        LLC_BI__Review__c rev = new LLC_BI__Review__c(
            LLC_BI__Account__c = a.Id,
            LLC_BI__Status__c = 'In Progress',
            LLC_BI__Review_Type__c = 'Annual'
        );
        insert rev;

        // TWO PACKAGE VERSIONS AND THE CHAIN BETWEEN THEM. A modification stages against the
        // package the banker started from and produces a new one; the memo is written against the
        // version under review. The only link between them in this org is the loan renewal chain,
        // so the filter has to walk it and this is the graph it walks.
        List<LLC_BI__Product_Package__c> packages = new List<LLC_BI__Product_Package__c>{
            new LLC_BI__Product_Package__c(
                Name = 'ZZ-HIST Package v1', LLC_BI__Account__c = a.Id,
                LLC_BI__Stage__c = 'Pending', LLC_BI__Status__c = 'New'
            ),
            new LLC_BI__Product_Package__c(
                Name = 'ZZ-HIST Package v2', LLC_BI__Account__c = a.Id,
                LLC_BI__Stage__c = 'Pending', LLC_BI__Status__c = 'New'
            )
        };
        insert packages;

        List<LLC_BI__Loan__c> loans = new List<LLC_BI__Loan__c>{
            new LLC_BI__Loan__c(
                LLC_BI__Account__c = a.Id, LLC_BI__Product_Package__c = packages[0].Id,
                LLC_BI__Stage__c = 'Qualification', LLC_BI__Status__c = 'Open',
                LLC_BI__isRenewal__c = false, LLC_BI__Is_Modification__c = false,
                LLC_BI__Amount__c = 5000000
            ),
            new LLC_BI__Loan__c(
                LLC_BI__Account__c = a.Id, LLC_BI__Product_Package__c = packages[1].Id,
                LLC_BI__Stage__c = 'Qualification', LLC_BI__Status__c = 'Open',
                LLC_BI__isRenewal__c = false, LLC_BI__Is_Modification__c = true,
                LLC_BI__Amount__c = 6500000
            )
        };
        insert loans;

        insert new LLC_BI__LoanRenewal__c(
            LLC_BI__ParentLoanId__c = loans[0].Id,
            LLC_BI__RenewalLoanId__c = loans[1].Id,
            LLC_BI__PreviousVersionStage__c = 'Qualification',
            LLC_BI__PreviousVersionStatus__c = 'Open',
            LLC_BI__RevisionNumber__c = 1
        );

        LLC_BI__Loan__c parent = [SELECT Id, Name FROM LLC_BI__Loan__c WHERE Id = :loans[0].Id];
        LLC_BI__Loan__c clone = [SELECT Id, Name FROM LLC_BI__Loan__c WHERE Id = :loans[1].Id];

        String planJson = modificationPlan(parent, clone);
        String trackerJson = modificationTracker(parent, clone);

        // Three rows pointing at a Case, a Review and an id whose object this tool does not resolve
        // (the account itself), a staged-only row with no result at all, and three modification
        // rows: one recent, one older than the ninety-day line, and one whose plan overruns the
        // per-row step cap.
        List<cm_Action_Staging__c> rows = new List<cm_Action_Staging__c>{
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'create-service-request', cm_Idempotency_Key__c = 'ZZ-HIST-1',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(), cm_Approver_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Result_Record_Id__c = c.Id, cm_Executed_At__c = System.now()
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'annual-review', cm_Idempotency_Key__c = 'ZZ-HIST-2',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Result_Record_Id__c = rev.Id
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'unknown-shape', cm_Idempotency_Key__c = 'ZZ-HIST-3',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Result_Record_Id__c = a.Id
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'collateral-valuation', cm_Idempotency_Key__c = 'ZZ-HIST-4',
                cm_Status__c = 'Staged', cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Plan_JSON__c = planJson
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'loan-modification', cm_Idempotency_Key__c = 'ZZ-HIST-5',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(), cm_Approver_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Product_Package__c = packages[0].Id,
                cm_Result_Record_Id__c = clone.Id, cm_Executed_At__c = System.now(),
                cm_Plan_JSON__c = planJson, cm_Tracker_JSON__c = trackerJson
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'loan-modification', cm_Idempotency_Key__c = 'ZZ-HIST-6',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(), cm_Approver_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Product_Package__c = packages[0].Id,
                cm_Result_Record_Id__c = clone.Id,
                cm_Plan_JSON__c = planJson, cm_Tracker_JSON__c = trackerJson
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'bulk-plan', cm_Idempotency_Key__c = 'ZZ-HIST-7',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id,
                cm_Plan_JSON__c = bulkPlan(), cm_Tracker_JSON__c = bulkTracker()
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'loan-modification', cm_Idempotency_Key__c = 'ZZ-HIST-8',
                cm_Status__c = 'Partial', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(), cm_Approver_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Result_Record_Id__c = clone.Id,
                cm_Plan_JSON__c = armsPlan(parent)
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'unreadable-plan', cm_Idempotency_Key__c = 'ZZ-HIST-9',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id,
                cm_Plan_JSON__c = 'this is not JSON', cm_Tracker_JSON__c = 'and neither is this'
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'new-facility-request', cm_Idempotency_Key__c = 'ZZ-HIST-10',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id,
                cm_Plan_JSON__c = flatPlan(), cm_Tracker_JSON__c = flatTracker()
            )
        };
        insert rows;

        // Distinct creation times so "newest first" is a real assertion rather than a coin flip.
        // The three modification rows sit BELOW the original four so the ordering assertions those
        // tests make keep meaning what they meant, and ZZ-HIST-6 sits past the ninety-day line.
        Test.setCreatedDate(rows[0].Id, System.now().addDays(-1));
        Test.setCreatedDate(rows[1].Id, System.now().addDays(-2));
        Test.setCreatedDate(rows[2].Id, System.now().addDays(-3));
        Test.setCreatedDate(rows[3].Id, System.now().addDays(-4));
        Test.setCreatedDate(rows[4].Id, System.now().addDays(-5));
        Test.setCreatedDate(rows[5].Id, System.now().addDays(-120));
        Test.setCreatedDate(rows[6].Id, System.now().addDays(-121));
        Test.setCreatedDate(rows[7].Id, System.now().addDays(-6));
        Test.setCreatedDate(rows[8].Id, System.now().addDays(-7));
        Test.setCreatedDate(rows[9].Id, System.now().addDays(-8));
    }

    /* ------------------------------------------------------------------ the plan fixture */

    /**
     * The resolved values of a one-facility modification, in the shape StageLoanModification writes.
     *
     * The plan moves the commitment, so the two pricing prerequisites riding it are DERIVED: nCino
     * refuses a payment schedule without them and the plan carries them whether or not the banker
     * named them. The third field change and the covenant and the party are what was asked for.
     *
     * @param parentId The booked facility being modified.
     * @return The values map.
     */
    private static Map<String, Object> modificationValues(Id parentId) {
        return new Map<String, Object>{
            'productPackageId' => null,
            'actionType' => 'Modification',
            'facilityCount' => 1,
            'rollMemberIds' => String.valueOf(parentId),
            'rollMemberCount' => 1,
            'excludedMemberCount' => 0,
            'requestedAmount' => 6500000,
            'requestedMaturityDate' => null,
            'requestedRate' => null,
            'requestedTermMonths' => null,
            'facility0.loanId' => String.valueOf(parentId),
            'scalarChangeCount' => 0,
            'fieldChangeCount' => 3,
            'fieldChange0.field' => 'LLC_BI__Amortized_Term_Months__c',
            'fieldChange0.label' => 'Amortized Term (Months)',
            'fieldChange0.type' => 'DOUBLE',
            'fieldChange0.valueJson' => '240',
            'fieldChange0.targetLoanId' => String.valueOf(parentId),
            'fieldChange0.targetNewLabel' => null,
            'fieldChange1.field' => 'LLC_BI__First_Payment_Date__c',
            'fieldChange1.label' => 'First Payment Date',
            'fieldChange1.type' => 'DATE',
            'fieldChange1.valueJson' => '"2026-10-01"',
            'fieldChange1.targetLoanId' => String.valueOf(parentId),
            'fieldChange1.targetNewLabel' => null,
            'fieldChange2.field' => 'LLC_BI__Description__c',
            'fieldChange2.label' => 'Description',
            'fieldChange2.type' => 'STRING',
            'fieldChange2.valueJson' => '"Working capital line"',
            'fieldChange2.targetLoanId' => String.valueOf(parentId),
            'fieldChange2.targetNewLabel' => null,
            'covenantAddCount' => 1,
            'covenantAdd0.typeName' => 'Debt Service Coverage',
            'covenantAdd0.operator' => '>=',
            'covenantAdd0.threshold' => 1.25,
            'covenantAdd0.targetLoanId' => String.valueOf(parentId),
            'covenantAdd0.targetNewLabel' => null,
            'involvementChangeCount' => 1,
            'involvement0.op' => 'remove',
            'involvement0.role' => 'Guarantor',
            'involvement0.accountName' => 'ZZ-HIST Departing Guarantor',
            'involvement0.targetLoanId' => String.valueOf(parentId),
            'involvement0.targetNewLabel' => null,
            'covenantAttachCount' => 0,
            'covenantExclusionCount' => 0,
            'pledgeExclusionCount' => 0,
            'feeAddCount' => 0,
            'pledgeAddCount' => 0,
            'policyExceptionAddCount' => 0,
            'newFacilityCount' => 0
        };
    }

    /** The ordered steps of that plan, with the ids the producer uses. */
    private static List<C360Plan.Step> modificationSteps(String parentName) {
        return new List<C360Plan.Step>{
            new C360Plan.Step('roll_package', C360Plan.TYPE_WRITE, 'Create the next package version')
                .onObject('LLC_BI__Product_Package__c', new List<String>{ 'new package version created by nCino' }),
            new C360Plan.Step('credit_action_0', C360Plan.TYPE_WRITE, 'Roll ' + parentName + ' into the new package version')
                .onObject('LLC_BI__Loan__c', new List<String>{ 'clone created by nCino on the new package version' }),
            new C360Plan.Step('verify_clone_0', C360Plan.TYPE_VERIFICATION, 'Re-query for the new facility cloned from ' + parentName)
                .onObject('LLC_BI__LoanRenewal__c', new List<String>{ 'LLC_BI__ParentLoanId__c' })
                .provenBy('SELECT Id FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__ParentLoanId__c = :loanId'),
            new C360Plan.Step('apply_changes_0', C360Plan.TYPE_WRITE, 'Apply the requested changes to the new facility cloned from ' + parentName)
                .onObject('LLC_BI__Loan__c', new List<String>{
                    'LLC_BI__Amount__c', 'LLC_BI__Maturity_Date__c', 'LLC_BI__InterestRate__c', 'LLC_BI__Term_Months__c'
                }),
            new C360Plan.Step('verify_package', C360Plan.TYPE_VERIFICATION, 'Verify the new package version')
                .onObject('LLC_BI__Product_Package__c', new List<String>{ 'Id', 'Name' }),
            new C360Plan.Step('carry_junctions', C360Plan.TYPE_WRITE, 'Carry the junction graph onto the clone')
                .onObject('LLC_BI__Loan_Covenant__c', new List<String>{ 'replicas retargeted at the clones' }),
            new C360Plan.Step('covenant_create_0', C360Plan.TYPE_WRITE, 'Create Debt Service Coverage >= 1.25 on the borrower')
                .onObject('LLC_BI__Covenant2__c', new List<String>{ 'LLC_BI__Account__c' }),
            new C360Plan.Step('covenant_attach_0', C360Plan.TYPE_WRITE, 'Attach it to the clone')
                .onObject('LLC_BI__Loan_Covenant__c', new List<String>{ 'LLC_BI__Loan__c' }),
            new C360Plan.Step('covenant_verify_0', C360Plan.TYPE_VERIFICATION, 'Re-read the covenant and its junction')
                .onObject('LLC_BI__Covenant2__c', new List<String>{ 'Id' }),
            new C360Plan.Step('involvement_change_0', C360Plan.TYPE_WRITE, 'Leave the departing guarantor off the new version')
                .onObject('LLC_BI__Legal_Entities__c', new List<String>{ 'carry exclusion' }),
            new C360Plan.Step('involvement_verify_0', C360Plan.TYPE_VERIFICATION, 'Re-read the borrowing structure on the clone')
                .onObject('LLC_BI__Legal_Entities__c', new List<String>{ 'Id' }),
            new C360Plan.Step('field_change_0', C360Plan.TYPE_WRITE, 'Set Amortized Term (Months) to 240 on the clone')
                .onObject('LLC_BI__Loan__c', new List<String>{ 'LLC_BI__Amortized_Term_Months__c' }),
            new C360Plan.Step('field_change_1', C360Plan.TYPE_WRITE, 'Set First Payment Date to 2026-10-01 on the clone')
                .onObject('LLC_BI__Loan__c', new List<String>{ 'LLC_BI__First_Payment_Date__c' }),
            new C360Plan.Step('field_change_2', C360Plan.TYPE_WRITE, 'Set Description on the clone')
                .onObject('LLC_BI__Loan__c', new List<String>{ 'LLC_BI__Description__c' }),
            new C360Plan.Step('observe_side_effects', C360Plan.TYPE_OBSERVED, 'Stage-driven email alerts the org may run'),
            new C360Plan.Step('held_execution', C360Plan.TYPE_HANDOFF, 'HANDOFF: booking the modification is nCino\'s own approval run')
        };
    }

    private static String modificationPlan(LLC_BI__Loan__c parent, LLC_BI__Loan__c clone) {
        return C360Plan.serializePlan(
            'Plans the next VERSION of the package. ' + parent.Name + ' is the member being modified.',
            modificationSteps(parent.Name),
            new List<String>{ 'This plans a modification, NOT an approval.' },
            new Map<String, Object>(),
            modificationValues(parent.Id)
        );
    }

    /**
     * The same steps after execution, which is what the tracker is: the plan carrying its outcome.
     * The clone id rides the credit-action sentence exactly as ExecuteLoanModification writes it,
     * because lifting it back out of that sentence is what `orgRecordId` does.
     */
    private static String modificationTracker(LLC_BI__Loan__c parent, LLC_BI__Loan__c clone) {
        List<C360Plan.Step> steps = modificationSteps(parent.Name);
        for (C360Plan.Step s : steps) {
            s.state = C360Plan.STATE_VERIFIED;
        }
        C360Plan.setState(steps, 'credit_action_0', C360Plan.STATE_VERIFIED,
            'nCino created modification facility ' + clone.Id + ' from ' + parent.Name + '.');
        // UNRESOLVEDCHAINROW is exactly eighteen characters and is not an id. The lift has to skip
        // it on the checksum rather than hand a memo a record nobody can open.
        C360Plan.setState(steps, 'verify_clone_0', C360Plan.STATE_VERIFIED,
            'the clone reads back with Is_Modification true, UNRESOLVEDCHAINROW aside; the parent re-reads unchanged.');
        C360Plan.setState(steps, 'apply_changes_0', C360Plan.STATE_VERIFIED,
            'The commitment reads 6500000.00 on the new version.');
        C360Plan.setState(steps, 'field_change_0', C360Plan.STATE_VERIFIED,
            'Amortized Term (Months) reads back at 240 on the new version.');
        C360Plan.setState(steps, 'observe_side_effects', C360Plan.STATE_FILED_UNVERIFIED,
            'Org-side automation reports nothing back here.');
        return JSON.serialize(steps);
    }

    /** A plan longer than the per-row cap, to prove the cap trims rather than the row failing. */
    private static List<C360Plan.Step> bulkSteps() {
        List<C360Plan.Step> steps = new List<C360Plan.Step>();
        for (Integer i = 0; i < 70; i++) {
            steps.add(new C360Plan.Step('bulk_step_' + i, C360Plan.TYPE_WRITE, 'Bulk step ' + i));
        }
        return steps;
    }

    private static String bulkPlan() {
        return C360Plan.serializePlan(
            'Seventy steps, to prove the cap.', bulkSteps(), new List<String>(),
            new Map<String, Object>(), new Map<String, Object>()
        );
    }

    private static String bulkTracker() {
        List<C360Plan.Step> steps = bulkSteps();
        for (C360Plan.Step s : steps) {
            s.state = C360Plan.STATE_VERIFIED;
        }
        return JSON.serialize(steps);
    }

    /* -------------------------------------------------------------- every other arm */

    /**
     * A modification carrying one of every arm StageLoanModification can stage.
     *
     * The first fixture proves the shape a demo actually files. This one proves the read does not
     * quietly drop the arms nobody exercised on the day: a covenant association, both carry
     * exclusions, a fee, a collateral chain, a policy exception and a net-new facility that the
     * other arms address by LABEL because it has no id until execute time. It carries NO tracker,
     * which is the resumable state a run left mid-flight, so the read falls back to the plan and
     * every state reads pending.
     *
     * @param parent The booked facility the plan modifies.
     * @return The plan JSON.
     */
    private static String armsPlan(LLC_BI__Loan__c parent) {
        Map<String, Object> v = new Map<String, Object>{
            'productPackageId' => null,
            'actionType' => 'Modification',
            'facilityCount' => 1,
            'rollMemberIds' => String.valueOf(parent.Id),
            'rollMemberCount' => 1,
            'excludedMemberCount' => 0,
            'requestedAmount' => null,
            'requestedMaturityDate' => null,
            'requestedRate' => null,
            'requestedTermMonths' => null,
            'facility0.loanId' => String.valueOf(parent.Id),
            'scalarChangeCount' => 2,
            'scalarChange0.key' => 'requestedAmount',
            'scalarChange0.value' => 7250000,
            'scalarChange0.targetLoanId' => String.valueOf(parent.Id),
            'scalarChange1.key' => 'requestedTermMonths',
            'scalarChange1.value' => 84,
            'scalarChange1.targetLoanId' => String.valueOf(parent.Id),
            // The value rides UNENCODED here on purpose: a plan written before the field wave
            // stored it raw, and the read hands back what it found rather than nothing.
            'fieldChangeCount' => 1,
            'fieldChange0.field' => 'LLC_BI__Amortized_Term_Months__c',
            'fieldChange0.label' => 'Amortized Term (Months)',
            'fieldChange0.type' => 'DOUBLE',
            'fieldChange0.valueJson' => 'raw text, never encoded',
            'fieldChange0.targetLoanId' => null,
            'fieldChange0.targetNewLabel' => 'new:1',
            'covenantAddCount' => 1,
            'covenantAdd0.typeName' => 'Current Ratio',
            'covenantAdd0.operator' => '>=',
            'covenantAdd0.threshold' => 1.10,
            'covenantAdd0.targetLoanId' => null,
            'covenantAdd0.targetNewLabel' => 'new:1',
            'covenantAttachCount' => 1,
            'covenantAttach0.covenantName' => 'COV-000012',
            'covenantAttach0.typeName' => 'Minimum Tangible Net Worth',
            'covenantAttach0.targetLoanId' => String.valueOf(parent.Id),
            'covenantAttach0.targetNewLabel' => null,
            'involvementChangeCount' => 1,
            'involvement0.op' => 'add',
            'involvement0.role' => 'Co-Borrower',
            'involvement0.accountName' => 'ZZ-HIST Affiliate',
            'involvement0.targetLoanId' => String.valueOf(parent.Id),
            'involvement0.targetNewLabel' => null,
            'covenantExclusionCount' => 1,
            'covenantExclusion0.covenantName' => 'COV-000031',
            'covenantExclusion0.typeName' => 'Capital Expenditure Limit',
            'covenantExclusion0.threshold' => 500000,
            'covenantExclusion0.targetLoanId' => String.valueOf(parent.Id),
            // Both descriptive keys are null, so the rendering has nothing to say and says nothing.
            'pledgeExclusionCount' => 1,
            'pledgeExclusion0.assetLabel' => null,
            'pledgeExclusion0.amountPledged' => null,
            'pledgeExclusion0.targetLoanId' => String.valueOf(parent.Id),
            'feeAddCount' => 1,
            'feeAdd0.description' => 'Origination fee',
            'feeAdd0.feeType' => 'Origination',
            'feeAdd0.calculationType' => 'Percentage',
            'feeAdd0.percentage' => 0.5,
            'feeAdd0.amount' => null,
            'feeAdd0.targetLoanId' => String.valueOf(parent.Id),
            'feeAdd0.targetNewLabel' => null,
            'pledgeAddCount' => 1,
            'pledgeAdd0.isNew' => true,
            'pledgeAdd0.assetLabel' => 'Machine tools',
            'pledgeAdd0.collateralTypeName' => 'Equipment',
            'pledgeAdd0.amountPledged' => 900000,
            'pledgeAdd0.targetLoanId' => String.valueOf(parent.Id),
            'pledgeAdd0.targetNewLabel' => null,
            'policyExceptionAddCount' => 1,
            'policyException0.title' => 'Advance rate above policy',
            'policyException0.status' => 'Mitigated',
            'policyException0.targetLoanId' => String.valueOf(parent.Id),
            'newFacilityCount' => 1,
            'newFacility0.label' => 'new:1',
            'newFacility0.product' => 'Equipment',
            'newFacility0.amount' => 3000000,
            'newFacility0.termMonths' => 60
        };

        List<C360Plan.Step> steps = new List<C360Plan.Step>();
        for (String id : new List<String>{
            'roll_package', 'credit_action_0', 'verify_clone_0', 'apply_changes_0', 'verify_package',
            'carry_junctions', 'new_facility_0', 'new_facility_involve_0', 'new_facility_verify_0',
            'new_facility_purpose_0', 'covenant_create_0', 'covenant_attach_0', 'covenant_verify_0',
            'covenant_associate_0', 'covenant_associate_verify_0', 'involvement_change_0',
            'involvement_verify_0', 'covenant_exclusion_0', 'covenant_exclusion_verify_0',
            'pledge_exclusion_0', 'pledge_exclusion_verify_0', 'field_change_0', 'fee_add_0',
            'fee_verify_0', 'collateral_create_0', 'collateral_own_0', 'pledge_add_0',
            'pledge_verify_0', 'policy_exception_add_0', 'policy_exception_verify_0',
            'observe_side_effects', 'held_execution'
        }) {
            steps.add(new C360Plan.Step(id, C360Plan.TYPE_WRITE, 'Plan step ' + id));
        }

        return C360Plan.serializePlan(
            'One of every arm, on one package version.', steps,
            new List<String>(), new Map<String, Object>(), v
        );
    }

    /* --------------------------------------------------------------------- a flat plan */

    /**
     * The shape every action but a modification writes: a values map of the fields of the ONE
     * record the plan creates, with no per-step index anywhere.
     *
     * Both steps here declare LLC_BI__Stage__c, and the map holds one value for it. The create
     * wrote that value; the hop wrote a different one the map never held. This is the fixture for
     * the defect the first live call surfaced.
     */
    private static List<C360Plan.Step> flatSteps() {
        return new List<C360Plan.Step>{
            new C360Plan.Step('write_loan', C360Plan.TYPE_WRITE, 'Create the facility at Qualification')
                .onObject('LLC_BI__Loan__c', new List<String>{ 'LLC_BI__Stage__c' }),
            new C360Plan.Step('hop_to_proposal', C360Plan.TYPE_WRITE, 'Move the facility from Qualification to Proposal')
                .onObject('LLC_BI__Loan__c', new List<String>{ 'LLC_BI__Stage__c' })
        };
    }

    private static String flatPlan() {
        return C360Plan.serializePlan(
            'Creates one facility, then moves it on.', flatSteps(), new List<String>(),
            new Map<String, Object>(),
            new Map<String, Object>{ 'LLC_BI__Stage__c' => 'Qualification', 'LLC_BI__Amount__c' => 3000000 }
        );
    }

    private static String flatTracker() {
        List<C360Plan.Step> steps = flatSteps();
        for (C360Plan.Step step : steps) {
            step.state = C360Plan.STATE_VERIFIED;
        }
        C360Plan.setState(steps, 'hop_to_proposal', C360Plan.STATE_VERIFIED, 'Stage moved from Qualification to Proposal.');
        return JSON.serialize(steps);
    }

    /* --------------------------------------------------------------------------- helpers */

    private static Account acct() {
        return [SELECT Id, Name FROM Account WHERE Name = 'ZZ-WP2-TEST Borrower' LIMIT 1];
    }

    /**
     * The fixture loans, found through the modification flag rather than through a name.
     *
     * nCino rewrites the name of a loan AND of a product package on save, so a Name-keyed fixture
     * query returns zero rows and every test built on it dies on the assignment. This is the same
     * trap C360Wave2Fixture documents, and it caught this suite on its first live run.
     */
    private static LLC_BI__Loan__c parentLoan() {
        return [
            SELECT Id, Name, LLC_BI__Product_Package__c FROM LLC_BI__Loan__c
            WHERE LLC_BI__Is_Modification__c = false LIMIT 1
        ];
    }

    private static LLC_BI__Loan__c cloneLoan() {
        return [
            SELECT Id, Name, LLC_BI__Product_Package__c FROM LLC_BI__Loan__c
            WHERE LLC_BI__Is_Modification__c = true LIMIT 1
        ];
    }

    private static Customer360ActionHistory.Response run(Id accountId, Integer lim) {
        Customer360ActionHistory.Request req = new Customer360ActionHistory.Request();
        req.accountId = accountId;
        req.maxResults = lim;
        return Customer360ActionHistory.getHistory(new List<Customer360ActionHistory.Request>{ req })[0];
    }

    private static Customer360ActionHistory.Response run(Id accountId, Boolean includeSteps, String packageId) {
        Customer360ActionHistory.Request req = new Customer360ActionHistory.Request();
        req.accountId = accountId;
        req.includeSteps = includeSteps;
        req.productPackageId = packageId;
        return Customer360ActionHistory.getHistory(new List<Customer360ActionHistory.Request>{ req })[0];
    }

    private static Map<String, Customer360ActionHistory.ActionHistoryEntry> byKey(
        Customer360ActionHistory.Response res
    ) {
        Map<String, Customer360ActionHistory.ActionHistoryEntry> out =
            new Map<String, Customer360ActionHistory.ActionHistoryEntry>();
        Map<Id, cm_Action_Staging__c> keys = new Map<Id, cm_Action_Staging__c>([
            SELECT Id, cm_Idempotency_Key__c FROM cm_Action_Staging__c
        ]);
        for (Customer360ActionHistory.ActionHistoryEntry e : res.entries) {
            out.put(keys.get(Id.valueOf(e.stagingId)).cm_Idempotency_Key__c, e);
        }
        return out;
    }

    private static Customer360ActionHistory.ActionStep step(
        Customer360ActionHistory.ActionHistoryEntry e, String id
    ) {
        for (Customer360ActionHistory.ActionStep s : e.steps) {
            if (s.id == id) {
                return s;
            }
        }
        return null;
    }

    /* ---------------------------------------------------------------- the original guarantees */

    @IsTest
    static void tokenMaterialNeverReachesTheOutput() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        String serialized = JSON.serialize(res);
        System.assertEquals(
            false,
            serialized.contains(SENTINEL_TOKEN_HASH),
            'A decision-token digest reached the output of a read tool. cm_Decision_Token_Hash__c must never be selected.'
        );
        System.assertEquals(
            false,
            serialized.contains(SENTINEL_PLAN_HASH),
            'The plan hash itself reached the output. A read returns planHashPresent, never the hash.'
        );
        System.assertEquals(
            false,
            serialized.contains('cm_Decision_Token_Hash'),
            'The token field name must not appear in the output shape at all.'
        );
        System.assertEquals(SEEDED_ROWS, res.count, 'All seeded rows should come back');
    }

    @IsTest
    static void planHashIsReportedAsPresenceOnly() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Boolean sawPresent = false;
        Boolean sawAbsent = false;
        for (Customer360ActionHistory.ActionHistoryEntry e : res.entries) {
            if (e.planHashPresent) {
                sawPresent = true;
            } else {
                sawAbsent = true;
            }
        }
        System.assertEquals(true, sawPresent, 'The executed rows carry a plan hash');
        System.assertEquals(true, sawAbsent, 'The staged-only row carries none, and the difference must be visible');
    }

    @IsTest
    static void rowsComeBackNewestFirst() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        System.assertEquals(SEEDED_ROWS, res.count);
        System.assertEquals('create-service-request', res.entries[0].actionId, 'Newest row first');
        System.assertEquals('annual-review', res.entries[1].actionId);
        System.assertEquals('unknown-shape', res.entries[2].actionId);
        System.assertEquals('collateral-valuation', res.entries[3].actionId);
        System.assertEquals('unreadable-plan', res.entries[6].actionId, 'The rows inside ninety days come first');
        System.assertEquals('bulk-plan', res.entries[9].actionId, 'Oldest row last');
    }

    @IsTest
    static void resultsAreCappedByMaxResults() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, 2);
        Test.stopTest();

        System.assertEquals(2, res.count, 'The cap must be applied');
        System.assertEquals('create-service-request', res.entries[0].actionId, 'The cap keeps the newest, not an arbitrary two');
        System.assertEquals('annual-review', res.entries[1].actionId);
    }

    @IsTest
    static void nameResolvesPerKeyPrefixAndUnknownPrefixReturnsIdOnly() {
        C360TestFixture.armCalloutMock();
        Account a = acct();
        Case c = [SELECT Id, CaseNumber FROM Case WHERE AccountId = :a.Id LIMIT 1];
        LLC_BI__Review__c rev = [SELECT Id, Name FROM LLC_BI__Review__c WHERE LLC_BI__Account__c = :a.Id LIMIT 1];

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Map<String, Customer360ActionHistory.ActionHistoryEntry> byAction =
            new Map<String, Customer360ActionHistory.ActionHistoryEntry>();
        for (Customer360ActionHistory.ActionHistoryEntry e : res.entries) {
            byAction.put(e.actionId, e);
        }

        System.assertEquals(
            c.CaseNumber,
            byAction.get('create-service-request').resultRecordName,
            'Case resolves through CaseNumber, because Case has no Name field'
        );
        System.assertEquals(
            rev.Name,
            byAction.get('annual-review').resultRecordName,
            'Review resolves through its autonumber Name'
        );
        System.assertEquals(
            a.Id,
            byAction.get('unknown-shape').resultRecordId,
            'An unresolvable record still returns its id'
        );
        System.assertEquals(
            null,
            byAction.get('unknown-shape').resultRecordName,
            'A record type this tool does not label returns no name rather than a guess'
        );
        System.assertEquals(
            null,
            byAction.get('collateral-valuation').resultRecordName,
            'A staged-only row created nothing, so it has no name'
        );
    }

    @IsTest
    static void readToolWritesNothing() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Map<String, Integer> before = new Map<String, Integer>{
            'Case' => [SELECT COUNT() FROM Case],
            'LLC_BI__Review__c' => [SELECT COUNT() FROM LLC_BI__Review__c],
            'LLC_BI__Collateral_Valuation__c' => [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c],
            'LLC_BI__Loan__c' => [SELECT COUNT() FROM LLC_BI__Loan__c],
            'cm_Action_Staging__c' => [SELECT COUNT() FROM cm_Action_Staging__c]
        };

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, true, null);
        Test.stopTest();

        System.assertEquals(SEEDED_ROWS, res.count, 'The read should have returned rows');
        Map<String, Integer> after = new Map<String, Integer>{
            'Case' => [SELECT COUNT() FROM Case],
            'LLC_BI__Review__c' => [SELECT COUNT() FROM LLC_BI__Review__c],
            'LLC_BI__Collateral_Valuation__c' => [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c],
            'LLC_BI__Loan__c' => [SELECT COUNT() FROM LLC_BI__Loan__c],
            'cm_Action_Staging__c' => [SELECT COUNT() FROM cm_Action_Staging__c]
        };
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'The history tool wrote a row to ' + obj + '. It is read-only.');
        }
    }

    @IsTest
    static void missingAccountIdIsRefusedWithoutReading() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        Customer360ActionHistory.Response res = run(null, null);
        Test.stopTest();

        System.assertEquals(0, res.count, 'No history is read without an anchor');
        System.assert(res.note.contains('accountId is required'), 'The note must say why: ' + res.note);
    }

    @IsTest
    static void positionalEnvelopeReturnsOneElementPerInput() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Customer360ActionHistory.Request good = new Customer360ActionHistory.Request();
        good.accountId = a.Id;
        Customer360ActionHistory.Request blank = new Customer360ActionHistory.Request();
        blank.accountId = null;

        Test.startTest();
        List<Customer360ActionHistory.Response> out =
            Customer360ActionHistory.getHistory(new List<Customer360ActionHistory.Request>{ good, blank });
        Test.stopTest();

        System.assertEquals(2, out.size(), 'One element per input, positional');
        System.assertEquals(SEEDED_ROWS, out[0].count, 'Element 0 belongs to input 0');
        System.assertEquals(0, out[1].count, 'Element 1 belongs to input 1 and read nothing');
    }

    /* ------------------------------------------------------------- the executed changes */

    @IsTest
    static void completedRowCarriesItsExecutedSteps() {
        C360TestFixture.armCalloutMock();
        Account a = acct();
        LLC_BI__Loan__c parent = parentLoan();
        LLC_BI__Loan__c clone = cloneLoan();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry mod = byKey(res).get('ZZ-HIST-5');
        System.assertNotEquals(null, mod.steps, 'A Completed row must carry its steps');
        System.assertEquals(16, mod.stepCount, 'stepCount reports the whole plan');
        System.assertEquals(16, mod.steps.size(), 'A sixteen-step plan is under the cap and comes back whole');
        System.assert(
            mod.summary.contains('Plans the next VERSION of the package'),
            'The plan own summary is returned verbatim: ' + mod.summary
        );

        Customer360ActionHistory.ActionStep credit = step(mod, 'credit_action_0');
        System.assertEquals('write', credit.type, 'The step type comes off the plan');
        System.assertEquals('LLC_BI__Loan__c', credit.objectName);
        System.assertEquals('verified', credit.state, 'The state comes off the TRACKER, not the plan');
        System.assertEquals(parent.Id, credit.targetLoanId, 'The facility comes off the plan resolved values');
        System.assertEquals(parent.Name, credit.targetLabel, 'The facility is named from the org, not from the plan');
        System.assertEquals(clone.Id, credit.orgRecordId, 'The created clone is lifted out of the tracker sentence');
        System.assert(
            credit.verification.contains('nCino created modification facility'),
            'verification carries the tracker sentence, not the SOQL: ' + credit.verification
        );

        Customer360ActionHistory.ActionStep cloneVerify = step(mod, 'verify_clone_0');
        System.assertEquals(
            null,
            cloneVerify.orgRecordId,
            'A tracker sentence naming no record yields no id rather than an invented one'
        );

        Customer360ActionHistory.ActionStep rollPackage = step(mod, 'roll_package');
        System.assertEquals(null, rollPackage.targetLoanId, 'A plan-level step names no single facility');
    }

    @IsTest
    static void stepsCarryTheStagedValuesAndTellAddsFromRemovals() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry mod = byKey(res).get('ZZ-HIST-5');

        Customer360ActionHistory.ActionStep amount = step(mod, 'apply_changes_0');
        System.assertEquals('LLC_BI__Amount__c', amount.field, 'One broadcast scalar names its own field');
        System.assertEquals('6500000', amount.after, 'The staged commitment is the after');
        System.assertEquals(null, amount.before, 'The plan holds no prior commitment, so none is claimed');

        Customer360ActionHistory.ActionStep amortised = step(mod, 'field_change_0');
        System.assertEquals('LLC_BI__Amortized_Term_Months__c', amortised.field);
        System.assertEquals('240', amortised.after, 'A field-wave value is JSON-encoded on the plan and decoded here');

        Customer360ActionHistory.ActionStep firstPayment = step(mod, 'field_change_1');
        System.assertEquals('2026-10-01', firstPayment.after, 'A date decodes to its own text, not to a quoted string');

        Customer360ActionHistory.ActionStep covenant = step(mod, 'covenant_create_0');
        System.assertEquals('Debt Service Coverage >= 1.25', covenant.after, 'A net-new covenant is an after');
        System.assertEquals(null, covenant.before);

        // The pair that carries the whole doctrine: on a modification nothing is deleted, so a
        // removal is a before with no after and the memo can say so without inventing a delete.
        Customer360ActionHistory.ActionStep departing = step(mod, 'involvement_change_0');
        System.assertEquals('Guarantor ZZ-HIST Departing Guarantor', departing.before, 'A carry exclusion is a before');
        System.assertEquals(null, departing.after, 'Nothing replaces it, because nothing is deleted');
    }

    @IsTest
    static void stagedRowCarriesNoSteps() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, true, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry staged = byKey(res).get('ZZ-HIST-4');
        System.assertEquals('Staged', staged.status);
        System.assertEquals(
            null,
            staged.steps,
            'A staged row executed nothing. Its plan holds an intention, and a memo quoting it would report a decision nobody took.'
        );
        System.assertEquals(null, staged.stepCount, 'Nothing was read, so nothing is counted');
        System.assertEquals(null, staged.summary, 'The plan was not read at all, even though the row carries one');
    }

    @IsTest
    static void oldRowsNeedIncludeStepsAndRecentOnesDoNot() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response light = run(a.Id, null);
        Customer360ActionHistory.Response full = run(a.Id, true, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry recentLight = byKey(light).get('ZZ-HIST-5');
        Customer360ActionHistory.ActionHistoryEntry oldLight = byKey(light).get('ZZ-HIST-6');
        System.assertNotEquals(null, recentLight.steps, 'A row from the last ninety days carries steps unasked');
        System.assertEquals(
            null,
            oldLight.steps,
            'A row past the ninety-day line stays out of the cockpit trail read unless it is asked for'
        );
        System.assert(
            light.note.contains('includeSteps'),
            'The note must say how to get the older rows: ' + light.note
        );

        Customer360ActionHistory.ActionHistoryEntry oldFull = byKey(full).get('ZZ-HIST-6');
        System.assertNotEquals(null, oldFull.steps, 'includeSteps reaches back past ninety days');
        System.assertEquals(16, oldFull.steps.size(), 'And it returns the whole plan, not a summary of it');
    }

    @IsTest
    static void stepsAreCappedPerRow() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, true, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry longPlan = byKey(res).get('ZZ-HIST-7');
        System.assertEquals(70, longPlan.stepCount, 'stepCount reports the plan as it stands');
        System.assertEquals(60, longPlan.steps.size(), 'The cap trims the list rather than failing the row');
        System.assertEquals('bulk_step_0', longPlan.steps[0].id, 'The cap keeps the plan from the start, in order');
        System.assertEquals('bulk_step_59', longPlan.steps[59].id, 'And stops at sixty');
    }

    @IsTest
    static void changeCountsSplitRequestedFromDerived() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Map<String, Customer360ActionHistory.ActionHistoryEntry> rows = byKey(res);
        Customer360ActionHistory.ActionHistoryEntry mod = rows.get('ZZ-HIST-5');

        System.assertNotEquals(null, mod.changeCounts, 'A modification plan carries change counts');
        System.assertEquals(
            2,
            mod.changeCounts.derived,
            'The amortised term and the first payment date ride a plan that moves the commitment, so nCino asked for them, not the banker'
        );
        System.assertEquals(
            4,
            mod.changeCounts.requested,
            'Three field changes plus a covenant plus a party plus the commitment is six, less the two derived'
        );

        System.assertEquals(
            null,
            rows.get('ZZ-HIST-7').changeCounts,
            'A plan whose shape carries no change counts returns none. Zero would claim it changed nothing.'
        );
    }

    /* ------------------------------------------------------------------- the package filter */

    @IsTest
    static void packageFilterFollowsTheVersionChain() {
        C360TestFixture.armCalloutMock();
        Account a = acct();
        Id current = parentLoan().LLC_BI__Product_Package__c;
        Id version = cloneLoan().LLC_BI__Product_Package__c;

        Test.startTest();
        Customer360ActionHistory.Response fromCurrent = run(a.Id, true, current);
        Customer360ActionHistory.Response fromVersion = run(a.Id, true, version);
        Test.stopTest();

        System.assertEquals(2, fromCurrent.count, 'Only the two rows staged against this deal');
        System.assertEquals(
            2,
            fromVersion.count,
            'The memo is written against the VERSION, and the rows were staged against the package it came from. ' +
            'The chain has to be walked or the memo room reads an empty trail.'
        );
        System.assertEquals(
            new Set<String>{ 'ZZ-HIST-5', 'ZZ-HIST-6' },
            byKey(fromVersion).keySet(),
            'Both ends of the chain return the same trail'
        );
        System.assert(
            fromVersion.note.contains('2 versions'),
            'The note states how wide the walk went: ' + fromVersion.note
        );
    }

    @IsTest
    static void packageFilterExcludesTheRestOfTheRelationship() {
        C360TestFixture.armCalloutMock();
        Account a = acct();
        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, true, parentLoan().LLC_BI__Product_Package__c);
        Test.stopTest();

        for (Customer360ActionHistory.ActionHistoryEntry e : res.entries) {
            System.assertEquals(
                'loan-modification',
                e.actionId,
                'The four relationship-level rows carry no package and must not ride a deal filter'
            );
        }
    }

    @IsTest
    static void everyArmOfAModificationIsDescribed() {
        C360TestFixture.armCalloutMock();
        Account a = acct();
        LLC_BI__Loan__c parent = parentLoan();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry arms = byKey(res).get('ZZ-HIST-8');
        System.assertEquals('Partial', arms.status, 'A partial run is history too, and a memo has to state it');
        System.assertEquals(32, arms.steps.size(), 'Every arm contributes its steps');
        System.assertEquals(
            'pending',
            step(arms, 'roll_package').state,
            'With no tracker the read falls back to the plan, where nothing has run yet'
        );

        // Two scalars on one facility cannot be named by a single field, so the pair is rendered.
        Customer360ActionHistory.ActionStep apply = step(arms, 'apply_changes_0');
        System.assertEquals(null, apply.field, 'Two fields cannot be reported as one');
        System.assertEquals('LLC_BI__Amount__c 7250000; LLC_BI__Term_Months__c 84', apply.after);

        // An arm aimed at a facility that does not exist yet travels by label.
        Customer360ActionHistory.ActionStep newCovenant = step(arms, 'covenant_create_0');
        System.assertEquals(null, newCovenant.targetLoanId, 'A net-new facility has no id at plan time');
        System.assertEquals('new:1', newCovenant.targetLabel, 'So the arm names it by the label the plan gave it');
        System.assertEquals('Current Ratio >= 1.10', newCovenant.after);

        System.assertEquals('new:1', step(arms, 'new_facility_0').targetLabel);
        System.assertEquals('Equipment 3000000 60', step(arms, 'new_facility_verify_0').after);
        System.assertEquals('COV-000012 Minimum Tangible Net Worth', step(arms, 'covenant_associate_0').after);
        System.assertEquals('Co-Borrower ZZ-HIST Affiliate', step(arms, 'involvement_change_0').after,
            'An involvement ADD is an after, where a remove is a before');
        System.assertEquals('COV-000031 Capital Expenditure Limit 500000',
            step(arms, 'covenant_exclusion_verify_0').before);
        System.assertEquals(null, step(arms, 'pledge_exclusion_0').before,
            'An arm the plan describes with nothing says nothing rather than an empty string');
        System.assertEquals('Origination fee Origination Percentage 0.5', step(arms, 'fee_add_0').after);
        System.assertEquals('Machine tools Equipment 900000', step(arms, 'collateral_create_0').after);
        System.assertEquals('Advance rate above policy Mitigated', step(arms, 'policy_exception_add_0').after);
        System.assertEquals(parent.Id, step(arms, 'pledge_add_0').targetLoanId);

        Customer360ActionHistory.ActionStep raw = step(arms, 'field_change_0');
        System.assertEquals('raw text, never encoded', raw.after,
            'A value the plan did not encode is handed back as it was found');

        System.assertEquals(1, arms.changeCounts.derived,
            'The amortised term rides a plan whose scalars move the commitment and the term');
        System.assertEquals(11, arms.changeCounts.requested, 'Twelve staged changes, less the one derived');
    }

    @IsTest
    static void aFlatPlanClaimsNoFieldValues() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry flat = byKey(res).get('ZZ-HIST-10');
        System.assertEquals(2, flat.steps.size(), 'A flat plan still returns its steps');
        System.assert(
            flat.steps[1].verification.contains('Stage moved from Qualification to Proposal'),
            'And its verification, which is where the story lives on a flat plan'
        );

        // THE REGRESSION. The values map holds LLC_BI__Stage__c = Qualification because that is
        // what the CREATE wrote. Matching the hop step against it reported the facility as moving
        // TO Qualification, which is the value it moved away from. Caught live 2026-09-04.
        for (Customer360ActionHistory.ActionStep step : flat.steps) {
            System.assertEquals(null, step.field, 'A flat plan keys nothing per step, so no step may name a field');
            System.assertEquals(null, step.after, 'And none may claim a value the map holds for a different step');
        }
    }

    @IsTest
    static void anUnreadablePlanCostsItsRowAndNothingElse() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Customer360ActionHistory.ActionHistoryEntry broken = byKey(res).get('ZZ-HIST-9');
        System.assertEquals('Completed', broken.status, 'The row itself still answers');
        System.assertEquals(null, broken.steps, 'Neither the plan nor the tracker could be parsed');
        System.assertEquals(null, broken.summary);
        System.assertEquals(null, broken.changeCounts);
        System.assertEquals(SEEDED_ROWS, res.count, 'And the rest of the relationship is unaffected');
        System.assertNotEquals(null, byKey(res).get('ZZ-HIST-5').steps, 'Including the row beside it');
    }

    @IsTest
    static void malformedPackageIdIsRefusedWithoutReading() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, true, 'not-a-record-id');
        Test.stopTest();

        System.assertEquals(0, res.count, 'A filter nobody can honour reads nothing rather than everything');
        System.assert(res.note.contains('is not a record id'), 'The note must say why: ' + res.note);
    }
}
