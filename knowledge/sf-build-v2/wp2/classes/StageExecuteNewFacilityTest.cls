/**
 * StageExecuteNewFacilityTest - the new-facility pair.
 *
 * The assertions that matter are the ones probe 5 made necessary: product is required because the
 * org self-populates Construction from a blank, the org rewrites the name so nothing may echo a
 * submitted one, and the Loan Detail arrives on an async path that does not exist in a test
 * transaction, so the wait step must land in filed_unverified rather than failing the run.
 */
@IsTest
private class StageExecuteNewFacilityTest {

    @TestSetup
    static void makeFixture() {
        C360TestFixture.armCalloutMock();
        Account a = C360Wave2Fixture.account();
        C360Wave2Fixture.productPackage(a.Id);
    }

    private static String why(StageNewFacility.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static StageNewFacility.Request req(Id packageId, String key) {
        StageNewFacility.Request r = new StageNewFacility.Request();
        r.idempotencyKey = key;
        r.productPackageId = packageId;
        r.rationale = 'Client asked for a new working capital line.';
        r.product = 'Line of Credit';
        r.amount = 750000;
        r.primaryLoanPurpose = 'business_credit_line';
        r.termMonths = 36;
        return r;
    }

    @IsTest
    static void stageWritesNoDomainRow() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        Map<String, Integer> before = C360Wave2Fixture.domainRowCounts();

        Test.startTest();
        StageNewFacility.Response res =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, C360Wave2Fixture.key('nf-zero')) })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        Map<String, Integer> after = C360Wave2Fixture.domainRowCounts();
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'stage_new_facility wrote a row to ' + obj + '. A33.0.1 forbids it.');
        }
        System.assertEquals(false, JSON.serialize(res.result).contains('loanId'), 'A33.5.3: stage output carries no record id');
    }

    @IsTest
    static void productIsRequiredBecauseTheOrgSelfPopulatesIt() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        StageNewFacility.Request r = req(p.Id, C360Wave2Fixture.key('nf-noprod'));
        r.product = null;

        Test.startTest();
        StageNewFacility.Response res = StageNewFacility.stage(new List<StageNewFacility.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Probe 5: a blank product ships a facility mislabelled Construction');
        System.assert(res.error.message.contains('Construction'), 'The refusal should name the trap: ' + res.error.message);
    }

    @IsTest
    static void purposeAndAmountAreRequiredForTheStageHop() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();

        StageNewFacility.Request noPurpose = req(p.Id, C360Wave2Fixture.key('nf-nopurpose'));
        noPurpose.primaryLoanPurpose = null;
        StageNewFacility.Request noAmount = req(p.Id, C360Wave2Fixture.key('nf-noamount'));
        noAmount.amount = null;

        Test.startTest();
        List<StageNewFacility.Response> out =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ noPurpose, noAmount });
        Test.stopTest();

        System.assertEquals(false, out[0].ok, 'LV12 needs the purpose, and the org leaves it null on the Loan Detail');
        System.assertEquals(false, out[1].ok, 'LV11 needs the amount');
    }

    @IsTest
    static void planCarriesTheWaitStepWithABudget() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();

        Test.startTest();
        StageNewFacility.Response res =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, C360Wave2Fixture.key('nf-wait')) })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        Boolean sawWait = false;
        for (StageNewFacility.PlanStep s : res.result.steps) {
            if (s.type == C360Plan.TYPE_WAIT) {
                sawWait = true;
                System.assertNotEquals(null, s.waitBudgetMs, 'A wait step must declare its budget (A33.3.3)');
                System.assert(s.waitBudgetMs >= 10000 && s.waitBudgetMs <= 30000, 'Probe 5 backs a 10 to 30 second budget, got ' + s.waitBudgetMs);
            }
        }
        System.assertEquals(true, sawWait, 'The plan must carry the async Loan Detail wait step');
    }

    @IsTest
    static void executeCreatesTheFacilityAndReportsTheOrgAssignedName() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-happy');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));

        ExecuteNewFacility.Request ex = new ExecuteNewFacility.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.result.stagingId;
        ex.planHash = staged.result.planHash;
        ex.decisionToken = staged.result.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        ExecuteNewFacility.Response done = ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ ex })[0];
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.code + ' ' + done.error.message));

        LLC_BI__Loan__c filed = [
            SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c, LLC_BI__isRenewal__c, LLC_BI__Is_Modification__c, LLC_BI__Product__c
            FROM LLC_BI__Loan__c WHERE Id = :done.result.loanId
        ];
        System.assertEquals('Open', filed.LLC_BI__Status__c);
        System.assertEquals(false, filed.LLC_BI__isRenewal__c, 'Cannot_Check_More_Than_One_Loan_Type: a new facility is neither');
        System.assertEquals(false, filed.LLC_BI__Is_Modification__c);
        System.assertEquals(
            filed.Name,
            done.result.recordName,
            'The tool must report the name the ORG assigned, never one anybody submitted (probe 5, finding 1)'
        );
        System.assertEquals(p.Name, done.result.anchorName, 'anchorName carries the product package');
    }

    @IsTest
    static void invocationOneFilesAndReturnsWithoutWaiting() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-inv1');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        Integer cpuBefore = Limits.getCpuTime();
        ExecuteNewFacility.Response done = executeStaged(key, staged.result);
        Integer cpuSpent = Limits.getCpuTime() - cpuBefore;
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.code + ' ' + done.error.message));
        System.assertEquals(C360Plan.TERMINAL_PARTIAL, done.result.terminalState, 'Invocation 1 is honestly partial: the plan is not finished');
        System.assertEquals(true, done.result.resumable, 'Invocation 1 must hand back a resumable action');
        System.assertNotEquals(null, done.result.resumeDescriptor, 'The caller must be told what to do next');
        System.assertNotEquals(null, done.result.loanId, 'The facility id comes back on invocation 1');
        System.assertNotEquals(null, done.result.recordName, 'The org-assigned name comes back on invocation 1');

        // Wave 4: a 6 s spin cost 6,511 ms of the 10,000 ms ceiling. Nothing here may burn CPU.
        System.assert(
            cpuSpent < 5000,
            'execute_new_facility must not busy-wait. CPU spent in the invocation: ' + cpuSpent + ' ms.'
        );

        Map<String, String> stateById = new Map<String, String>();
        for (ExecuteNewFacility.StepResult st : done.result.steps) {
            stateById.put(st.id, st.state);
        }
        System.assertEquals(C360Plan.STATE_VERIFIED, stateById.get('write_loan'));
        System.assertEquals(C360Plan.STATE_WAITING, stateById.get('wait_loan_detail'), 'The wait step is waiting, not failed and not unverified');
        System.assertEquals(C360Plan.STATE_PENDING, stateById.get('write_loan_purpose'), 'Phase 2 stays pending until the action continues');
        System.assertEquals(C360Plan.STATE_PENDING, stateById.get('hop_to_proposal'));
        System.assertEquals('Qualification', [SELECT LLC_BI__Stage__c FROM LLC_BI__Loan__c WHERE Id = :done.result.loanId].LLC_BI__Stage__c);
    }

    @IsTest
    static void invocationTwoStaysWaitingWhenTheOrgHasNotCreatedTheChild() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-inv2');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        ExecuteNewFacility.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'invocation 1 should succeed');

        // The after-commit flow does not run in a test transaction, so the child is absent here.
        // That is exactly the still-waiting branch, and it must never read as a failure.
        ExecuteNewFacility.Response second = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, second.ok, 'A still-waiting resume is a successful invocation');
        System.assertEquals(true, second.result.resumable, 'It stays resumable');
        System.assertNotEquals(C360Plan.TERMINAL_FAILED, second.result.terminalState, 'An absent child is not evidence of failure');
        System.assertEquals(first.result.loanId, second.result.loanId, 'The resume continues the same facility');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c = :p.Id],
            'A resume never creates a second facility'
        );
        System.assertEquals('Qualification', [SELECT LLC_BI__Stage__c FROM LLC_BI__Loan__c WHERE Id = :second.result.loanId].LLC_BI__Stage__c,
            'No hop happens while the Loan Detail is still absent');
    }

    @IsTest
    static void invocationTwoNeedsNoNewTokenButRefusesAForeignApprover() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-inv2auth');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        ExecuteNewFacility.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'invocation 1 should succeed');

        // No token at all on the resume: the single-use token was consumed by invocation 1 and
        // covers the whole plan.
        ExecuteNewFacility.Request resume = new ExecuteNewFacility.Request();
        resume.idempotencyKey = key;
        resume.stagingId = staged.result.stagingId;
        resume.planHash = staged.result.planHash;
        resume.decisionToken = null;
        resume.approverUserId = UserInfo.getUserId();
        ExecuteNewFacility.Response ok = ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ resume })[0];

        ExecuteNewFacility.Response foreign;
        List<User> others = [SELECT Id FROM User WHERE Id != :UserInfo.getUserId() AND IsActive = true LIMIT 1];
        if (!others.isEmpty()) {
            ExecuteNewFacility.Request r = new ExecuteNewFacility.Request();
            r.idempotencyKey = key;
            r.stagingId = staged.result.stagingId;
            r.planHash = staged.result.planHash;
            r.decisionToken = null;
            r.approverUserId = others[0].Id;
            foreign = ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ r })[0];
        }
        Test.stopTest();

        System.assertEquals(true, ok.ok, 'The resume authenticates on stagingId, planHash, key and approver, not on a fresh token');
        if (foreign != null) {
            System.assertEquals(false, foreign.ok, 'A resume may not hand an authorized plan to a different human');
            System.assertEquals('VALIDATION_FAILED', foreign.error.code);
        }
    }

    @IsTest
    static void resumeAgainstAStalePlanHashIsRefused() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-inv2hash');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        ExecuteNewFacility.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok);

        ExecuteNewFacility.Request r = new ExecuteNewFacility.Request();
        r.idempotencyKey = key;
        r.stagingId = staged.result.stagingId;
        r.planHash = 'deadbeef' + staged.result.planHash.substring(8);
        r.decisionToken = null;
        r.approverUserId = UserInfo.getUserId();
        ExecuteNewFacility.Response res = ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A resume runs against the staged plan or not at all');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
    }

    @IsTest
    static void executeRefusesAMissingToken() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-notoken');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        ExecuteNewFacility.Request ex = new ExecuteNewFacility.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.result.stagingId;
        ex.planHash = staged.result.planHash;
        ex.decisionToken = null;
        ex.approverUserId = UserInfo.getUserId();
        ExecuteNewFacility.Response res = ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ ex })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'No execute_* runs without a decision token');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
    }

    private static ExecuteNewFacility.Response executeStaged(String key, StageNewFacility.StageResult staged) {
        ExecuteNewFacility.Request ex = new ExecuteNewFacility.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.stagingId;
        ex.planHash = staged.planHash;
        ex.decisionToken = staged.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        return ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ ex })[0];
    }

    @IsTest
    static void repeatedInvocationsNeverCreateASecondFacility() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-replay');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteNewFacility.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'first execute should succeed');
        ExecuteNewFacility.Response again = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, again.ok, 'A continuing invocation is a successful invocation');
        System.assertEquals(first.result.loanId, again.result.loanId, 'It continues the same facility');
        System.assertEquals(first.result.recordName, again.result.recordName, 'The org-assigned name is stable across invocations');
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c = :p.Id], 'One key, one facility, never two');
    }

    @IsTest
    static void executeRefusesAStalePlanHashAndAForeignApprover() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-refuse');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];

        ExecuteNewFacility.Request badHash = new ExecuteNewFacility.Request();
        badHash.idempotencyKey = key;
        badHash.stagingId = staged.result.stagingId;
        badHash.planHash = 'deadbeef' + staged.result.planHash.substring(8);
        badHash.decisionToken = staged.result.decisionToken;
        badHash.approverUserId = UserInfo.getUserId();
        ExecuteNewFacility.Response r1 = ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ badHash })[0];

        ExecuteNewFacility.Response r2;
        List<User> others = [SELECT Id FROM User WHERE Id != :UserInfo.getUserId() AND IsActive = true LIMIT 1];
        if (!others.isEmpty()) {
            ExecuteNewFacility.Request foreign = new ExecuteNewFacility.Request();
            foreign.idempotencyKey = key;
            foreign.stagingId = staged.result.stagingId;
            foreign.planHash = staged.result.planHash;
            foreign.decisionToken = staged.result.decisionToken;
            foreign.approverUserId = others[0].Id;
            r2 = ExecuteNewFacility.run(new List<ExecuteNewFacility.Request>{ foreign })[0];
        }
        Test.stopTest();

        System.assertEquals(false, r1.ok, 'A stale plan hash is refused');
        System.assertEquals('TOKEN_REFUSED', r1.error.code);
        if (r2 != null) {
            System.assertEquals(false, r2.ok, 'An approver who is not the running identity is refused');
            System.assertEquals('TOKEN_REFUSED', r2.error.code);
        }
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c = :p.Id], 'Nothing may be written on a refused execute');
    }

    @IsTest
    static void executeRefusesWhenTheAnchorMovedSinceStaging() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        String key = C360Wave2Fixture.key('nf-moved');

        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        delete p;

        Test.startTest();
        ExecuteNewFacility.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(false, done.ok, 'A33.3.3: re-query the anchor before any resumed write');
        System.assert(done.error.message.contains('Re-stage'), 'The refusal must say what to do: ' + done.error.message);
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Loan__c], 'Nothing may be written when the precondition fails');
    }

    @IsTest
    static void executeRefusesIncompleteRequests() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        List<ExecuteNewFacility.Request> bad = new List<ExecuteNewFacility.Request>();
        for (Integer i = 0; i < 3; i++) {
            ExecuteNewFacility.Request r = new ExecuteNewFacility.Request();
            r.idempotencyKey = i == 0 ? null : 'k';
            r.stagingId = i == 1 ? null : '000000000000000AAA';
            r.planHash = i == 2 ? null : 'h';
            r.decisionToken = 't';
            r.approverUserId = UserInfo.getUserId();
            bad.add(r);
        }
        List<ExecuteNewFacility.Response> out = ExecuteNewFacility.run(bad);
        Test.stopTest();

        for (Integer i = 0; i < 3; i++) {
            System.assertEquals(false, out[i].ok, 'Element ' + i + ' is missing a required input');
            System.assertEquals('VALIDATION_FAILED', out[i].error.code);
        }
    }

    @IsTest
    static void unknownProductIsRefusedAgainstTheOrgPicklist() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        StageNewFacility.Request r = req(p.Id, C360Wave2Fixture.key('nf-badprod'));
        r.product = 'Term';

        Test.startTest();
        StageNewFacility.Response res = StageNewFacility.stage(new List<StageNewFacility.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok,
            'LESSONS 15w: the Commercial Loan record type omits Term, the API would store it anyway, and it renders wrong in nCino');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assert(res.error.message.contains('Commercial Loan record type'), 'The refusal names the scope: ' + res.error.message);
        System.assert(res.error.message.contains('Line of Credit'), 'The refusal lists the RT-valid values: ' + res.error.message);
        System.assertEquals(false, res.error.message.contains(', Term'), 'Term must not appear in the offered list: ' + res.error.message);
    }

    @IsTest
    static void everyRtValidProductIsAccepted() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        for (String product : new List<String>{ 'Construction', 'Equipment', 'Line of Credit', 'HELOC', 'Purchase', 'Deposit' }) {
            StageNewFacility.Request r = req(p.Id, C360Wave2Fixture.key('nf-rt-' + product));
            r.product = product;
            StageNewFacility.Response res = StageNewFacility.stage(new List<StageNewFacility.Request>{ r })[0];
            System.assertEquals(true, res.ok, 'RT-valid product refused: ' + product + ' :: ' + why(res));
        }
    }

    @IsTest
    static void executeAddsTheBorrowerToTheBorrowingStructure() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        Account a = C360Wave2Fixture.existingAccount();
        String key = C360Wave2Fixture.key('nf-involve');

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteNewFacility.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.code + ' ' + done.error.message));
        System.assertNotEquals(null, done.result.involvementId, 'A facility insert creates no involvement row, so the tool must');

        LLC_BI__Legal_Entities__c inv = [
            SELECT Id, LLC_BI__Account__c, LLC_BI__Loan__c, LLC_BI__Product_Package__c,
                   LLC_BI__Borrower_Type__c, LLC_BI__Ownership__c, LLC_BI__Contingent_Amount__c
            FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c = :done.result.loanId
        ];
        System.assertEquals(a.Id, inv.LLC_BI__Account__c, 'The borrower is the relationship');
        System.assertEquals(done.result.loanId, inv.LLC_BI__Loan__c);
        System.assertEquals(p.Id, inv.LLC_BI__Product_Package__c, 'Every real involvement row carries the package, and so does ours');
        System.assertEquals('Borrower', inv.LLC_BI__Borrower_Type__c, 'The role IS the flag: there is no primary-borrower boolean');
        System.assertEquals(100, inv.LLC_BI__Ownership__c);
        System.assertEquals(null, inv.LLC_BI__Contingent_Amount__c,
            'Ownership and Contingent Amount are mutually exclusive on one row, so we set Ownership only');
    }

    @IsTest
    static void planCarriesTheBorrowingStructureStep() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();

        Test.startTest();
        StageNewFacility.Response res =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, C360Wave2Fixture.key('nf-plan-inv')) })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        Boolean sawInvolvement = false;
        for (StageNewFacility.PlanStep st : res.result.steps) {
            if (st.id == 'write_involvement') {
                sawInvolvement = true;
                System.assertEquals(C360Plan.TYPE_WRITE, st.type);
            }
        }
        System.assertEquals(true, sawInvolvement, 'The banker must see the borrowing-structure write before confirming');
    }

    @IsTest
    static void unknownPackageIsRefused() {
        C360TestFixture.armCalloutMock();
        StageNewFacility.Request r = req(C360Wave2Fixture.fakeId(LLC_BI__Product_Package__c.SObjectType), C360Wave2Fixture.key('nf-nopkg'));

        Test.startTest();
        StageNewFacility.Response res = StageNewFacility.stage(new List<StageNewFacility.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A package this tool cannot read is refused');
        System.assert(res.error.message.contains('not found'), 'The refusal should say so: ' + res.error.message);
    }

    private static StageNewFacility.Request reqNoPackage(Id accountId, String key) {
        StageNewFacility.Request r = new StageNewFacility.Request();
        r.idempotencyKey = key;
        r.accountId = accountId;
        r.rationale = 'New relationship, no credit package exists yet.';
        r.product = 'Line of Credit';
        r.amount = 400000;
        r.primaryLoanPurpose = 'business_credit_line';
        return r;
    }

    @IsTest
    static void planWithAPackageCarriesNoCreatePackageStep() {
        C360TestFixture.armCalloutMock();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();

        Test.startTest();
        StageNewFacility.Response res =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ req(p.Id, C360Wave2Fixture.key('nf-haspkg')) })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        System.assertEquals(false, res.result.createsPackage, 'An existing package is used as-is');
        System.assertEquals(null, res.result.plannedPackageName);
        for (StageNewFacility.PlanStep st : res.result.steps) {
            System.assertNotEquals('create_package', st.id, 'No package step when one was supplied');
        }
        System.assertEquals('write_loan', res.result.steps[0].id, 'The loan write leads the plan');
    }

    @IsTest
    static void planWithoutAPackageCreatesOneFirstNamedToTheOrgConvention() {
        C360TestFixture.armCalloutMock();
        Account a = C360Wave2Fixture.existingAccount();

        Test.startTest();
        StageNewFacility.Response res =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ reqNoPackage(a.Id, C360Wave2Fixture.key('nf-nopkg2')) })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        System.assertEquals(true, res.result.createsPackage, 'Package-first is the canonical nCino flow');
        System.assertEquals('create_package', res.result.steps[0].id, 'The package step comes BEFORE the loan step');
        System.assertEquals('write_loan', res.result.steps[1].id);

        String planned = res.result.plannedPackageName;
        System.assertNotEquals(null, planned, 'The planned package name must be visible before confirming');
        System.assert(planned.startsWith(a.Name), 'Convention is <Account> - <M/D/YYYY> - PP, got: ' + planned);
        System.assert(planned.endsWith(' - PP'), 'Convention is <Account> - <M/D/YYYY> - PP, got: ' + planned);
        System.assert(res.result.summary.contains('credit package'), 'The summary must say a package will be created: ' + res.result.summary);
    }

    @IsTest
    static void stageWithoutPackageOrAccountIsRefused() {
        C360TestFixture.armCalloutMock();
        StageNewFacility.Request r = reqNoPackage(null, C360Wave2Fixture.key('nf-neither'));
        r.accountId = null;

        Test.startTest();
        StageNewFacility.Response res = StageNewFacility.stage(new List<StageNewFacility.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Without a package there is nothing to derive the borrower from');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
    }

    @IsTest
    static void stageWithoutAPackageStillWritesNoDomainRow() {
        C360TestFixture.armCalloutMock();
        Account a = C360Wave2Fixture.existingAccount();
        Integer pkgBefore = [SELECT COUNT() FROM LLC_BI__Product_Package__c];
        Map<String, Integer> before = C360Wave2Fixture.domainRowCounts();

        Test.startTest();
        StageNewFacility.Response res =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ reqNoPackage(a.Id, C360Wave2Fixture.key('nf-pkgzero')) })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        System.assertEquals(pkgBefore, [SELECT COUNT() FROM LLC_BI__Product_Package__c], 'stage_* creates no package either. A33.0.1 is unconditional.');
        Map<String, Integer> after = C360Wave2Fixture.domainRowCounts();
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'stage wrote a row to ' + obj);
        }
    }

    @IsTest
    static void executeCreatesThePackageThenTheFacilityUnderIt() {
        C360TestFixture.armCalloutMock();
        Account a = C360Wave2Fixture.existingAccount();
        String key = C360Wave2Fixture.key('nf-pkgexec');
        Integer pkgBefore = [SELECT COUNT() FROM LLC_BI__Product_Package__c];

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ reqNoPackage(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteNewFacility.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.code + ' ' + done.error.message));
        System.assertEquals(true, done.result.packageCreated, 'This run created the package');
        System.assertNotEquals(null, done.result.productPackageId, 'The new package id comes back');
        System.assertEquals(pkgBefore + 1, [SELECT COUNT() FROM LLC_BI__Product_Package__c], 'Exactly one package created');

        LLC_BI__Product_Package__c pkg = [
            SELECT Id, Name, RecordTypeId, LLC_BI__Account__c FROM LLC_BI__Product_Package__c WHERE Id = :done.result.productPackageId
        ];
        System.assertEquals(a.Id, pkg.LLC_BI__Account__c, 'The package hangs off the borrower');
        System.assertEquals(null, pkg.RecordTypeId, 'Real packages in this org carry no record type, and neither does ours');
        System.assertEquals(staged.result.plannedPackageName, pkg.Name, 'The package carries the name the banker was shown at confirm');
        System.assertEquals(pkg.Name, done.result.anchorName);

        LLC_BI__Loan__c loan = [SELECT Id, LLC_BI__Product_Package__c FROM LLC_BI__Loan__c WHERE Id = :done.result.loanId];
        System.assertEquals(pkg.Id, loan.LLC_BI__Product_Package__c, 'The facility sits on the package this action created');
    }

    @IsTest
    static void idempotencyCoversThePackageAndFacilityPair() {
        C360TestFixture.armCalloutMock();
        Account a = C360Wave2Fixture.existingAccount();
        String key = C360Wave2Fixture.key('nf-pkgidem');
        Integer pkgBefore = [SELECT COUNT() FROM LLC_BI__Product_Package__c];

        Test.startTest();
        StageNewFacility.Response staged =
            StageNewFacility.stage(new List<StageNewFacility.Request>{ reqNoPackage(a.Id, key) })[0];
        ExecuteNewFacility.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'invocation 1 should succeed');
        ExecuteNewFacility.Response again = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, again.ok);
        System.assertEquals(first.result.loanId, again.result.loanId, 'Same facility');
        System.assertEquals(first.result.productPackageId, again.result.productPackageId, 'Same package');
        System.assertEquals(pkgBefore + 1, [SELECT COUNT() FROM LLC_BI__Product_Package__c], 'Never two packages');
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c = :first.result.productPackageId], 'Never two facilities');
    }
}
