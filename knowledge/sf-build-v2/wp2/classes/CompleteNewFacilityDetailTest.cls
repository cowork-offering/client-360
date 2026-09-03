/**
 * CompleteNewFacilityDetailTest - the second hop for a net-new facility's purpose.
 *
 * WHAT THIS FILE HAS TO PROVE, and it is mostly about what the tool does NOT do:
 * it writes nothing when the plan filed no facility, nothing when the Loan Detail
 * has not appeared, and nothing on a second run. The one thing it does do is
 * write the purpose once and read it back.
 *
 * THE LOAN DETAIL IS STOOD UP BY THE FIXTURE, and that is honest rather than
 * convenient: nCino creates the record from an after-commit flow that does not
 * run in a test transaction at all, so there is no version of this test where the
 * org creates it. What is proved here is what our code does once it exists, and
 * the live run on Hartwell is what proves the org creates it.
 */
@IsTest
private class CompleteNewFacilityDetailTest {

    private static final String PARENT_KEY = 'ZZCNFD001';
    /** A LEGAL value. LLC_BI__Primary_Loan_Purpose__c is a RESTRICTED picklist in
     *  this org, so a banker's own words are not one and the tool refuses them. */
    private static final String PURPOSE = 'business_expansion';

    @TestSetup
    static void makeFixture() {
        C360TestFixture.armCalloutMock();

        Account a = new Account(Name = 'ZZ-CNFD Borrower');
        insert a;
        LLC_BI__Product_Package__c p = new LLC_BI__Product_Package__c(Name = 'ZZ-CNFD Package', LLC_BI__Account__c = a.Id);
        insert p;
        insert new LLC_BI__Loan__c(
            LLC_BI__Account__c = a.Id,
            LLC_BI__Product_Package__c = p.Id,
            LLC_BI__Stage__c = 'Booked',
            LLC_BI__Status__c = 'Open',
            LLC_BI__lookupKey__c = PARENT_KEY,
            LLC_BI__Amount__c = 1000000,
            LLC_BI__Product_Line__c = 'Commercial',
            LLC_BI__Product_Type__c = 'Term Loan',
            LLC_BI__Product__c = 'Equipment',
            LLC_BI__isRenewal__c = false,
            LLC_BI__Is_Modification__c = false
        );
    }

    private static Account borrower() {
        return [SELECT Id, Name FROM Account WHERE Name = 'ZZ-CNFD Borrower' LIMIT 1];
    }

    private static LLC_BI__Loan__c parent() {
        return [
            SELECT Id, Name, LLC_BI__Product_Package__c, LLC_BI__Account__c
            FROM LLC_BI__Loan__c
            WHERE LLC_BI__Account__c = :borrower().Id AND LLC_BI__lookupKey__c = :PARENT_KEY
            LIMIT 1
        ];
    }

    private static String key(String label) {
        return 'ZZ-CNFD-' + label + '-' + String.valueOf(Crypto.getRandomLong());
    }

    private static final String FACILITY_JSON =
        '[{"label":"new:1","product":"Equipment","amount":3000000,"termMonths":60,' +
        '"purpose":"' + PURPOSE + '","amortizedTermMonths":60,"firstPaymentDate":"2026-10-01"}]';

    /** A staged and executed modification, with the arm's writes performed inline. */
    private static StageLoanModification.StageResult stageIt(String k, String newFacilitiesJson) {
        StageLoanModification.Request r = new StageLoanModification.Request();
        r.idempotencyKey = k;
        r.productPackageId = parent().LLC_BI__Product_Package__c;
        r.loanId = parent().Id;
        r.rationale = 'Founder proof: a new facility inside a modification.';
        if (newFacilitiesJson == null) {
            r.requestedAmount = 1500000;
        } else {
            r.newFacilitiesJson = newFacilitiesJson;
        }
        StageLoanModification.Response res = StageLoanModification.stage(new List<StageLoanModification.Request>{ r })[0];
        System.assertEquals(true, res.ok, res.error == null ? '(no error)' : res.error.code + ' :: ' + res.error.message);
        return res.result;
    }

    private static ExecuteLoanModification.Response executeIt(String k, StageLoanModification.StageResult staged) {
        ExecuteLoanModification.Request e = new ExecuteLoanModification.Request();
        e.idempotencyKey = k;
        e.stagingId = staged.stagingId;
        e.planHash = staged.planHash;
        e.decisionToken = staged.decisionToken;
        e.approverUserId = UserInfo.getUserId();
        e.inlineExecution = true;
        return ExecuteLoanModification.run(new List<ExecuteLoanModification.Request>{ e })[0];
    }

    private static CompleteNewFacilityDetail.Response finish(String stagingId) {
        CompleteNewFacilityDetail.Request r = new CompleteNewFacilityDetail.Request();
        r.stagingId = stagingId;
        r.approverUserId = UserInfo.getUserId();
        return CompleteNewFacilityDetail.run(new List<CompleteNewFacilityDetail.Request>{ r })[0];
    }

    /** Does what the org was observed to do on a credit action, in one place. */
    private class CloneEngine implements ExecuteLoanModification.CreditActionEngine {
        public ExecuteLoanModification.EngineResult modify(Id packageId, List<Id> facilityIds) {
            List<LLC_BI__Loan__c> parents = [
                SELECT Id, LLC_BI__Account__c, LLC_BI__Amount__c, LLC_BI__lookupKey__c, LLC_BI__Product__c,
                       LLC_BI__Product_Line__c, LLC_BI__Product_Type__c, LLC_BI__Stage__c, LLC_BI__Status__c
                FROM LLC_BI__Loan__c WHERE Id IN :facilityIds
            ];
            LLC_BI__Product_Package__c version = new LLC_BI__Product_Package__c(
                Name = '- 9/3/2026 - PP', LLC_BI__Account__c = parents[0].LLC_BI__Account__c
            );
            insert version;
            List<LLC_BI__Loan__c> clones = new List<LLC_BI__Loan__c>();
            for (LLC_BI__Loan__c p : parents) {
                clones.add(new LLC_BI__Loan__c(
                    LLC_BI__Account__c = p.LLC_BI__Account__c,
                    LLC_BI__Product_Package__c = version.Id,
                    LLC_BI__Stage__c = 'Qualification',
                    LLC_BI__Status__c = 'Open',
                    LLC_BI__lookupKey__c = p.LLC_BI__lookupKey__c + '_M1',
                    LLC_BI__Amount__c = p.LLC_BI__Amount__c,
                    LLC_BI__Product__c = p.LLC_BI__Product__c,
                    LLC_BI__Product_Line__c = p.LLC_BI__Product_Line__c,
                    LLC_BI__Product_Type__c = p.LLC_BI__Product_Type__c,
                    LLC_BI__Is_Modification__c = true,
                    LLC_BI__isRenewal__c = false
                ));
            }
            insert clones;
            List<LLC_BI__LoanRenewal__c> chain = new List<LLC_BI__LoanRenewal__c>();
            for (Integer i = 0; i < parents.size(); i++) {
                chain.add(new LLC_BI__LoanRenewal__c(
                    LLC_BI__ParentLoanId__c = parents[i].Id,
                    LLC_BI__RenewalLoanId__c = clones[i].Id,
                    LLC_BI__RevisionNumber__c = 1,
                    LLC_BI__RevisionStatus__c = 'In Progress',
                    LLC_BI__PreviousVersionStage__c = parents[i].LLC_BI__Stage__c,
                    LLC_BI__PreviousVersionStatus__c = parents[i].LLC_BI__Status__c
                ));
            }
            insert chain;
            ExecuteLoanModification.EngineResult out = new ExecuteLoanModification.EngineResult();
            out.success = true;
            out.outputPackageId = version.Id;
            return out;
        }
    }

    /** The facility the arm authored: the one on the new version with no chain row. */
    private static LLC_BI__Loan__c authored(Id newPkgId) {
        Set<Id> cloned = new Set<Id>();
        for (LLC_BI__LoanRenewal__c j : [SELECT LLC_BI__RenewalLoanId__c FROM LLC_BI__LoanRenewal__c]) {
            cloned.add(j.LLC_BI__RenewalLoanId__c);
        }
        for (LLC_BI__Loan__c l : [
            SELECT Id, Name, LLC_BI__Loan_Detail__c FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c = :newPkgId
        ]) {
            if (!cloned.contains(l.Id)) {
                return l;
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------------------------

    @IsTest
    static void aPlanWithNoNewFacilityWRITESNOTHINGANDSAYSSO() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new CloneEngine();
        String k = key('none');
        StageLoanModification.StageResult staged = stageIt(k, null);
        ExecuteLoanModification.Response done = executeIt(k, staged);
        System.assertEquals(true, done.ok, done.error == null ? '' : done.error.message);

        Test.startTest();
        // THE DELTA, not the absolute: staging and executing above have already
        // spent DML, and what is being proved is that THIS call spends none.
        Integer dmlBefore = Limits.getDmlStatements();
        Integer queriesBefore = Limits.getQueries();
        CompleteNewFacilityDetail.Response res = finish(staged.stagingId);
        Integer dmlAfter = Limits.getDmlStatements();
        Integer queriesAfter = Limits.getQueries();
        Test.stopTest();

        System.assertEquals(true, res.ok, res.error == null ? '' : res.error.message);
        System.assertEquals(0, res.result.writtenCount);
        System.assertEquals(0, res.result.pendingCount);
        System.assertEquals(false, res.result.resumable);
        System.assertEquals(0, res.result.facilities.size(), 'No facility on the plan, no facility in the answer');
        System.assert(res.result.outcome.contains('no net-new facility'), res.result.outcome);
        System.assertEquals(dmlBefore, dmlAfter, 'The ordinary modification must cost this tool no write at all');
        System.assertEquals(1, queriesAfter - queriesBefore,
            'And one read: the staging record, which is the only thing it needs to know there is nothing to do');
    }

    @IsTest
    static void aLoanDetailThatHasNotAppearedIsREPORTEDRatherThanWaitedFor() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new CloneEngine();
        String k = key('pending');
        StageLoanModification.StageResult staged = stageIt(k, FACILITY_JSON);
        ExecuteLoanModification.Response done = executeIt(k, staged);
        System.assertEquals(true, done.ok, done.error == null ? '' : done.error.message);

        Test.startTest();
        CompleteNewFacilityDetail.Response res = finish(staged.stagingId);
        Test.stopTest();

        System.assertEquals(true, res.ok, res.error == null ? '' : res.error.message);
        System.assertEquals(1, res.result.facilities.size());
        System.assertEquals('pending_detail', res.result.facilities[0].state,
            'The org creates the Loan Detail after the filing transaction, so it is not there yet');
        System.assertEquals(0, res.result.writtenCount, 'And nothing is written for it');
        System.assertEquals(1, res.result.pendingCount);
        System.assertEquals(true, res.result.resumable, 'Calling again once the child is there finishes it');
        System.assert(res.result.outcome.contains('Purpose pending'), res.result.outcome);
        System.assert(res.result.facilities[0].verification.contains('not a failure'), res.result.facilities[0].verification);
    }

    @IsTest
    static void theSecondHopWritesThePurposeOnceAndReadsItBack() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new CloneEngine();
        String k = key('write');
        StageLoanModification.StageResult staged = stageIt(k, FACILITY_JSON);
        ExecuteLoanModification.Response done = executeIt(k, staged);
        System.assertEquals(true, done.ok, done.error == null ? '' : done.error.message);

        Id newPkgId = (Id) done.result.outputPackageId;
        LLC_BI__Loan__c made = authored(newPkgId);
        System.assertNotEquals(null, made, 'The arm filed the facility');

        // Stand the child up the way the org does moments after the filing.
        LLC_BI__Loan_Detail__c detail = new LLC_BI__Loan_Detail__c(LLC_BI__Loan__c = made.Id);
        insert detail;
        update new LLC_BI__Loan__c(Id = made.Id, LLC_BI__Loan_Detail__c = detail.Id);

        CompleteNewFacilityDetail.Response res = finish(staged.stagingId);
        System.assertEquals(true, res.ok, res.error == null ? '' : res.error.message);
        System.assertEquals(1, res.result.writtenCount);
        System.assertEquals(0, res.result.pendingCount);
        System.assertEquals(false, res.result.resumable, 'Nothing is left to come back for');
        System.assertEquals('written', res.result.facilities[0].state);
        System.assertEquals(made.Id, (Id) res.result.facilities[0].loanId, 'It found the facility by the plan, not by the caller');
        System.assertEquals(detail.Id, (Id) res.result.facilities[0].loanDetailId);
        System.assert(res.result.outcome.contains('Purpose written on 1'), res.result.outcome);
        System.assertEquals(
            PURPOSE,
            [SELECT LLC_BI__Primary_Loan_Purpose__c FROM LLC_BI__Loan_Detail__c WHERE Id = :detail.Id].LLC_BI__Primary_Loan_Purpose__c,
            'The purpose is on the Loan Detail, which is the only object in this org that holds one'
        );

        // AND A SECOND CALL WRITES NOTHING. Idempotence here is a read rather than
        // a fence: the value already reads back correct, so there is no DML at all.
        Integer dmlBefore = Limits.getDmlStatements();
        CompleteNewFacilityDetail.Response again = finish(staged.stagingId);
        System.assertEquals(dmlBefore, Limits.getDmlStatements(), 'A replay performs no DML');
        System.assertEquals(0, again.result.writtenCount);
        System.assertEquals('already_set', again.result.facilities[0].state);
        System.assert(again.result.outcome.contains('already carried'), again.result.outcome);
    }

    @IsTest
    static void aFreeTextPurposeIsRefusedAtStageTimeWithTheOrgsOwnList() {
        C360TestFixture.armCalloutMock();
        StageLoanModification.Request r = new StageLoanModification.Request();
        r.idempotencyKey = key('freetext');
        r.productPackageId = parent().LLC_BI__Product_Package__c;
        r.loanId = parent().Id;
        r.rationale = 'A purpose in the banker\'s own words.';
        r.newFacilitiesJson =
            '[{"product":"Equipment","amount":3000000,"termMonths":60,"purpose":"CNC line expansion"}]';

        Test.startTest();
        StageLoanModification.Response res = StageLoanModification.stage(new List<StageLoanModification.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A RESTRICTED picklist refuses anything outside its own list');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assert(res.error.message.contains('RESTRICTED picklist'), res.error.message);
        System.assert(res.error.message.contains('business_expansion'), 'The refusal names what IS available: ' + res.error.message);
        System.assertEquals(0, [SELECT COUNT() FROM cm_Action_Staging__c], 'A refused plan stages nothing');
    }

    @IsTest
    static void anotherToolsPlanAndAForeignApproverAreBothRefused() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new CloneEngine();
        String k = key('gates');
        StageLoanModification.StageResult staged = stageIt(k, FACILITY_JSON);

        Test.startTest();
        // Before execution there is no facility to finish, and the tool says so
        // rather than guessing at one.
        CompleteNewFacilityDetail.Response early = finish(staged.stagingId);
        System.assertEquals(false, early.ok);
        System.assert(early.error.message.contains('has not produced a facility yet'), early.error.message);

        CompleteNewFacilityDetail.Request foreign = new CompleteNewFacilityDetail.Request();
        foreign.stagingId = staged.stagingId;
        foreign.approverUserId = C360Wave2Fixture.fakeId(User.SObjectType);
        CompleteNewFacilityDetail.Response wrong =
            CompleteNewFacilityDetail.run(new List<CompleteNewFacilityDetail.Request>{ foreign })[0];
        System.assertEquals(false, wrong.ok);
        System.assert(wrong.error.message.contains('does not match the running identity'), wrong.error.message);

        CompleteNewFacilityDetail.Request nowhere = new CompleteNewFacilityDetail.Request();
        nowhere.stagingId = C360Wave2Fixture.fakeId(cm_Action_Staging__c.SObjectType);
        nowhere.approverUserId = UserInfo.getUserId();
        CompleteNewFacilityDetail.Response missing =
            CompleteNewFacilityDetail.run(new List<CompleteNewFacilityDetail.Request>{ nowhere })[0];
        System.assertEquals(false, missing.ok);
        System.assert(missing.error.message.contains('No staging record found'), missing.error.message);
        Test.stopTest();
    }

    @IsTest
    static void theGuardFencesEveryFieldOnTheLoanDetailButTheOne() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        // The one field this package writes.
        C360WriteGuard.assertAllowed(
            C360WriteGuard.OBJ_LOAN_DETAIL,
            C360WriteGuard.OP_UPDATE,
            new Map<String, Object>{ 'LLC_BI__Primary_Loan_Purpose__c' => PURPOSE }
        );

        // And the ones it never does.
        for (String field : new List<String>{
            'LLC_BI__Loan__c', 'RecordTypeId', 'OwnerId', 'LLC_BI__Application_Method__c',
            'LLC_BI__Additional_Loan_Purposes__c'
        }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(
                    C360WriteGuard.OBJ_LOAN_DETAIL, C360WriteGuard.OP_UPDATE, new Map<String, Object>{ field => 'x' }
                );
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, field + ' must be refused: nCino owns it, not this package');
        }

        // A CREATE is never ours: the org's own after-commit flow makes the row.
        Boolean createRefused = false;
        try {
            C360WriteGuard.assertAllowed(
                C360WriteGuard.OBJ_LOAN_DETAIL, C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Primary_Loan_Purpose__c' => PURPOSE }
            );
        } catch (C360WriteGuard.GuardException e) {
            createRefused = true;
        }
        System.assertEquals(true, createRefused, 'nCino creates the Loan Detail; this package never does');
        Test.stopTest();
    }

    @IsTest
    static void aFacilityThatIsNoLongerOnTheVersionIsNAMEDRatherThanGuessedAt() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new CloneEngine();
        String k = key('gone');
        StageLoanModification.StageResult staged = stageIt(k, FACILITY_JSON);
        ExecuteLoanModification.Response done = executeIt(k, staged);
        System.assertEquals(true, done.ok, done.error == null ? '' : done.error.message);

        LLC_BI__Loan__c made = authored((Id) done.result.outputPackageId);
        System.assertNotEquals(null, made, 'The arm filed the facility');
        delete [SELECT Id FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c = :made.Id];
        delete made;

        Test.startTest();
        CompleteNewFacilityDetail.Response res = finish(staged.stagingId);
        Test.stopTest();

        System.assertEquals(true, res.ok, res.error == null ? '' : res.error.message);
        System.assertEquals('not_found', res.result.facilities[0].state);
        System.assertEquals(0, res.result.writtenCount, 'Nothing is written for a facility nobody can find');
        System.assert(res.result.facilities[0].verification.contains('No facility on the new package version matches'),
            res.result.facilities[0].verification);
        System.assert(res.result.outcome.contains('could not be matched'), res.result.outcome);
    }

    @IsTest
    static void aPurposeTheOrgStoppedOfferingIsREFUSEDBeforeTheWrite() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        Boolean refused = false;
        try {
            C360NewFacilities.assertPurpose('not_a_value_this_org_offers', 'new:1');
        } catch (C360NewFacilities.NewFacilityException e) {
            refused = true;
            System.assert(e.getMessage().contains('RESTRICTED picklist'), e.getMessage());
        }
        System.assertEquals(true, refused, 'The org refuses it, so the tool refuses it first and names the list');
        // And a blank one is its own refusal, in the words the create route uses.
        Boolean blank = false;
        try {
            C360NewFacilities.assertPurpose('  ', 'new:1');
        } catch (C360NewFacilities.NewFacilityException e) {
            blank = true;
            System.assert(e.getMessage().contains('needs a primary loan purpose'), e.getMessage());
        }
        System.assertEquals(true, blank);
        C360NewFacilities.assertPurpose(PURPOSE, 'new:1');
        Test.stopTest();
    }

    @IsTest
    static void ANOTHERTOOLSPLANISREFUSEDBYNAME() {
        C360TestFixture.armCalloutMock();
        cm_Action_Staging__c row = new cm_Action_Staging__c(
            cm_Action_Id__c = 'renewal',
            cm_Idempotency_Key__c = key('foreign'),
            cm_Status__c = 'Completed',
            cm_Plan_Hash__c = 'h',
            cm_Plan_JSON__c = '{"summary":"x","steps":[],"warnings":[],"provenance":{},"values":{}}',
            cm_Result_Record_Id__c = parent().Id,
            cm_Approver_User__c = UserInfo.getUserId()
        );
        insert row;

        Test.startTest();
        CompleteNewFacilityDetail.Response res = finish(row.Id);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Each tool finishes its own action or none');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assert(res.error.message.contains('holds a renewal plan'), res.error.message);
    }

    @IsTest
    static void aBlankStagingIdAndAMissingApproverAreBothRefused() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        CompleteNewFacilityDetail.Request blank = new CompleteNewFacilityDetail.Request();
        blank.approverUserId = UserInfo.getUserId();
        CompleteNewFacilityDetail.Response noStaging =
            CompleteNewFacilityDetail.run(new List<CompleteNewFacilityDetail.Request>{ blank })[0];
        System.assertEquals(false, noStaging.ok);
        System.assert(noStaging.error.message.contains('stagingId is required'), noStaging.error.message);

        CompleteNewFacilityDetail.Request noApprover = new CompleteNewFacilityDetail.Request();
        noApprover.stagingId = C360Wave2Fixture.fakeId(cm_Action_Staging__c.SObjectType);
        CompleteNewFacilityDetail.Response missing =
            CompleteNewFacilityDetail.run(new List<CompleteNewFacilityDetail.Request>{ noApprover })[0];
        System.assertEquals(false, missing.ok);
        System.assert(missing.error.message.contains('approverUserId is required'), missing.error.message);
        Test.stopTest();
    }
}
