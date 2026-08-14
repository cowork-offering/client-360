/**
 * StageExecuteCovenantReviewTest - the covenant pair, through the testability seam.
 *
 * THIS SUITE NEVER CREATES A COVENANT COMPLIANCE RECORD, AND THAT IS DELIBERATE.
 * acnpex_covenantApprovalProcess fires on CREATE only, unconditionally, with zero entry filters
 * (probe 8). Its stage 1 step is a stepApproval assigned to a named human whose address resolves to
 * active users in this org. Test DML rolls back, but whether that orchestration's notification
 * survives the rollback cannot be established without firing it once at a real person. Probe 8
 * refused to do that and the refusal stands, so the suite injects a record through the seam instead.
 *
 * Consequence, recorded honestly: the LIVE update path is PROBE PENDING. It is cleared by a
 * founder-gated first invocation against a real compliance record, not by this file.
 */
@IsTest
private class StageExecuteCovenantReviewTest {

    @TestSetup
    static void makeFixture() {
        C360Wave2Fixture.account();
    }

    private static String why(StageCovenantReview.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    /** Injects a compliance record the suite may reason about without writing one. */
    private static Id installSeam(String status) {
        Id fake = C360Wave2Fixture.fakeId(LLC_BI__Covenant_Compliance2__c.SObjectType);
        ExecuteCovenantReview.seamRecord = new LLC_BI__Covenant_Compliance2__c(
            Id = fake,
            LLC_BI__Status__c = status
        );
        ExecuteCovenantReview.seamCapturedWrite = null;
        return fake;
    }

    private static StageCovenantReview.Request req(Id accountId, Id complianceId, String key, String result) {
        StageCovenantReview.Request r = new StageCovenantReview.Request();
        r.idempotencyKey = key;
        r.accountId = accountId;
        r.rationale = 'Quarterly covenant test.';
        r.covenantComplianceId = complianceId;
        r.result = result;
        r.observedValue = '1.42';
        r.narrative = 'DSC of 1.42x against a 1.30x floor. Cushion holds.';
        r.comments = 'Tested against the Q2 spread.';
        return r;
    }

    private static ExecuteCovenantReview.Response executeStaged(String key, StageCovenantReview.StageResult staged) {
        ExecuteCovenantReview.Request ex = new ExecuteCovenantReview.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.stagingId;
        ex.planHash = staged.planHash;
        ex.decisionToken = staged.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        return ExecuteCovenantReview.run(new List<ExecuteCovenantReview.Request>{ ex })[0];
    }

    @IsTest
    static void stageWritesNoDomainRow() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');
        Map<String, Integer> before = C360Wave2Fixture.domainRowCounts();

        Test.startTest();
        StageCovenantReview.Response res = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, C360Wave2Fixture.key('cov-zero'), 'Compliant') })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        Map<String, Integer> after = C360Wave2Fixture.domainRowCounts();
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'stage_covenant_review wrote a row to ' + obj + '. A33.0.1 forbids it.');
        }
    }

    @IsTest
    static void executeUpdatesStatusAndStartsNoApprovalChain() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');
        String key = C360Wave2Fixture.key('cov-happy');

        Test.startTest();
        StageCovenantReview.Response staged = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, key, 'Compliant') })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteCovenantReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.code + ' ' + done.error.message));
        System.assertEquals('Compliant', done.result.status);
        System.assertEquals(
            false,
            done.result.approvalChainStarted,
            'Probe 8: the chain fires on create only. An update-only tool cannot start it by construction.'
        );

        LLC_BI__Covenant_Compliance2__c captured = ExecuteCovenantReview.seamCapturedWrite;
        System.assertNotEquals(null, captured, 'The tool must have attempted a write');
        System.assertEquals('Compliant', captured.LLC_BI__Status__c);
        System.assertEquals(target, captured.Id, 'The write must target the staged record');
        System.assertNotEquals(null, captured.LLC_BI__Evaluation_Date__c, 'An assessment stamps its evaluation date');
        System.assertEquals(UserInfo.getUserId(), captured.LLC_BI__Evaluated_By__c);
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Covenant_Compliance2__c WHERE Id = :target], 'The suite created no compliance record');
    }

    @IsTest
    static void exceptionStampsBreachedAndAnExceptionDate() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('In Progress');
        String key = C360Wave2Fixture.key('cov-exception');

        Test.startTest();
        StageCovenantReview.Response staged = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, key, 'Exception') })[0];
        ExecuteCovenantReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed');
        LLC_BI__Covenant_Compliance2__c captured = ExecuteCovenantReview.seamCapturedWrite;
        System.assertEquals('Exception', captured.LLC_BI__Status__c);
        System.assertEquals('Breached', captured.LLC_BI__Reason_for_Exception__c);
        System.assertNotEquals(null, captured.LLC_BI__Exception_Date__c);
    }

    @IsTest
    static void neitherToolEverWritesTheSetOnceCovenantLookup() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');
        String key = C360Wave2Fixture.key('cov-setonce');

        Test.startTest();
        StageCovenantReview.Response staged = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, key, 'Compliant') })[0];
        ExecuteCovenantReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok);
        System.assertEquals(
            null,
            ExecuteCovenantReview.seamCapturedWrite.LLC_BI__Covenant__c,
            'The covenant lookup is set once at creation and is never rewritten on update'
        );
    }

    @IsTest
    static void aStatusOutsideTheAllowlistIsRefused() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');

        Test.startTest();
        StageCovenantReview.Response res = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, C360Wave2Fixture.key('cov-waived'), 'Waived') })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Waived is a real picklist value but is not on the transition allowlist');
        System.assert(res.error.message.contains('Compliant'), 'The refusal should name what is allowed: ' + res.error.message);
    }

    @IsTest
    static void anUnknownComplianceRecordIsRefused() {
        Account a = C360Wave2Fixture.existingAccount();
        installSeam('Pending');
        Id other = C360Wave2Fixture.fakeId(LLC_BI__Covenant_Compliance2__c.SObjectType);

        Test.startTest();
        StageCovenantReview.Response res = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, other, C360Wave2Fixture.key('cov-unknown'), 'Compliant') })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A compliance record this tool cannot read is refused rather than created');
        System.assert(res.error.message.contains('not found'), 'The refusal should say so: ' + res.error.message);
    }

    @IsTest
    static void executeReplayReportsThePriorAssessmentAndWritesNothing() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');
        String key = C360Wave2Fixture.key('cov-replay');

        Test.startTest();
        StageCovenantReview.Response staged = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, key, 'Compliant') })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteCovenantReview.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'first execute should succeed');

        ExecuteCovenantReview.seamCapturedWrite = null;
        ExecuteCovenantReview.Response again = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, again.ok, 'A replay is a successful invocation, not a failure');
        System.assertEquals(true, again.result.replayed, 'The replay must declare itself');
        System.assertEquals(first.result.covenantComplianceId, again.result.covenantComplianceId);
        System.assertEquals(false, again.result.approvalChainStarted);
        System.assertEquals(null, ExecuteCovenantReview.seamCapturedWrite, 'A replay writes nothing at all');
    }

    @IsTest
    static void executeRefusesMissingUsedAndMismatchedTokens() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');
        String key = C360Wave2Fixture.key('cov-tokens');

        Test.startTest();
        StageCovenantReview.Response staged = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, key, 'Compliant') })[0];

        ExecuteCovenantReview.Request noToken = new ExecuteCovenantReview.Request();
        noToken.idempotencyKey = key;
        noToken.stagingId = staged.result.stagingId;
        noToken.planHash = staged.result.planHash;
        noToken.decisionToken = null;
        noToken.approverUserId = UserInfo.getUserId();
        ExecuteCovenantReview.Response a1 = ExecuteCovenantReview.run(new List<ExecuteCovenantReview.Request>{ noToken })[0];

        ExecuteCovenantReview.Request badHash = new ExecuteCovenantReview.Request();
        badHash.idempotencyKey = key;
        badHash.stagingId = staged.result.stagingId;
        badHash.planHash = 'deadbeef' + staged.result.planHash.substring(8);
        badHash.decisionToken = staged.result.decisionToken;
        badHash.approverUserId = UserInfo.getUserId();
        ExecuteCovenantReview.Response a2 = ExecuteCovenantReview.run(new List<ExecuteCovenantReview.Request>{ badHash })[0];
        Test.stopTest();

        System.assertEquals(false, a1.ok, 'A missing token is refused');
        System.assertEquals('TOKEN_REFUSED', a1.error.code);
        System.assertEquals(false, a2.ok, 'A stale plan hash is refused');
        System.assertEquals('TOKEN_REFUSED', a2.error.code);
        System.assertEquals(null, ExecuteCovenantReview.seamCapturedWrite, 'Nothing may be written on a refused execute');
    }

    @IsTest
    static void executeRefusesWhenTheTargetMovedSinceStaging() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');
        String key = C360Wave2Fixture.key('cov-moved');

        Test.startTest();
        StageCovenantReview.Response staged = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ req(a.Id, target, key, 'Compliant') })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));

        // The compliance record is no longer readable: org state moved between stage and execute.
        installSeam('Pending');
        ExecuteCovenantReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(false, done.ok, 'A33.3.3: re-query the target before any resumed write');
        System.assert(done.error.message.contains('Re-stage'), 'The refusal must say what to do: ' + done.error.message);
        System.assertEquals(null, ExecuteCovenantReview.seamCapturedWrite, 'Nothing may be written when the precondition fails');
    }

    @IsTest
    static void executeRefusesIncompleteRequests() {
        Test.startTest();
        List<ExecuteCovenantReview.Request> bad = new List<ExecuteCovenantReview.Request>();
        for (Integer i = 0; i < 3; i++) {
            ExecuteCovenantReview.Request r = new ExecuteCovenantReview.Request();
            r.idempotencyKey = i == 0 ? null : 'k';
            r.stagingId = i == 1 ? null : '000000000000000AAA';
            r.planHash = i == 2 ? null : 'h';
            r.decisionToken = 't';
            r.approverUserId = UserInfo.getUserId();
            bad.add(r);
        }
        List<ExecuteCovenantReview.Response> out = ExecuteCovenantReview.run(bad);
        Test.stopTest();

        for (Integer i = 0; i < 3; i++) {
            System.assertEquals(false, out[i].ok, 'Element ' + i + ' is missing a required input and must be refused');
            System.assertEquals('VALIDATION_FAILED', out[i].error.code);
        }
    }

    @IsTest
    static void stageRefusesIncompleteRequests() {
        Account a = C360Wave2Fixture.existingAccount();
        Id target = installSeam('Pending');

        StageCovenantReview.Request noAccount = req(null, target, C360Wave2Fixture.key('cov-b1'), 'Compliant');
        noAccount.accountId = null;
        StageCovenantReview.Request noRationale = req(a.Id, target, C360Wave2Fixture.key('cov-b2'), 'Compliant');
        noRationale.rationale = null;
        StageCovenantReview.Request noTarget = req(a.Id, target, C360Wave2Fixture.key('cov-b3'), 'Compliant');
        noTarget.covenantComplianceId = null;

        Test.startTest();
        List<StageCovenantReview.Response> out = StageCovenantReview.stage(
            new List<StageCovenantReview.Request>{ noAccount, noRationale, noTarget });
        Test.stopTest();

        for (Integer i = 0; i < 3; i++) {
            System.assertEquals(false, out[i].ok, 'Element ' + i + ' is missing a required input');
            System.assertEquals('VALIDATION_FAILED', out[i].error.code);
        }
    }
}
