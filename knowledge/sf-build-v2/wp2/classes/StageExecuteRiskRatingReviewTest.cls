/**
 * StageExecuteRiskRatingReviewTest - the risk-rating pair.
 *
 * The assertion this file exists for is probe 4's trap: LLC_BI__Status__c defaults to
 * 'Not Approved', so an omitted status does not land as an absent value, it lands as a DECISION.
 * The tool must set 'In Review' explicitly and the guard must refuse anything else.
 */
@IsTest
private class StageExecuteRiskRatingReviewTest {

    @TestSetup
    static void makeFixture() {
        C360Wave2Fixture.account();
    }

    private static String why(StageRiskRatingReview.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static StageRiskRatingReview.Request req(Id accountId, String key) {
        StageRiskRatingReview.Request r = new StageRiskRatingReview.Request();
        r.idempotencyKey = key;
        r.accountId = accountId;
        r.rationale = 'Annual re-grade of the relationship.';
        r.computedRiskGradeValue = 5;
        r.cashFlowCoverageActual = 1.42;
        r.creditScoreActual = 680;
        r.managementExperienceActual = 12;
        r.revenueGrowthActual = 0.08;
        return r;
    }

    private static ExecuteRiskRatingReview.Response executeStaged(String key, StageRiskRatingReview.StageResult staged) {
        ExecuteRiskRatingReview.Request ex = new ExecuteRiskRatingReview.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.stagingId;
        ex.planHash = staged.planHash;
        ex.decisionToken = staged.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        return ExecuteRiskRatingReview.run(new List<ExecuteRiskRatingReview.Request>{ ex })[0];
    }

    @IsTest
    static void stageWritesNoDomainRow() {
        Account a = C360Wave2Fixture.existingAccount();
        Map<String, Integer> before = C360Wave2Fixture.domainRowCounts();

        Test.startTest();
        StageRiskRatingReview.Response res =
            StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ req(a.Id, C360Wave2Fixture.key('rr-zero')) })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        Map<String, Integer> after = C360Wave2Fixture.domainRowCounts();
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'stage_risk_rating_review wrote a row to ' + obj + '. A33.0.1 forbids it.');
        }
    }

    @IsTest
    static void executeSetsInReviewExplicitlyRatherThanLettingItDefaultToADecision() {
        Account a = C360Wave2Fixture.existingAccount();
        String key = C360Wave2Fixture.key('rr-happy');

        Test.startTest();
        StageRiskRatingReview.Response staged =
            StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ req(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteRiskRatingReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.code + ' ' + done.error.message));

        LLC_BI__Annual_Review__c filed = [
            SELECT Id, Name, LLC_BI__Status__c, LLC_BI__Computed_Risk_Grade_Value__c, LLC_BI__Account__c
            FROM LLC_BI__Annual_Review__c WHERE Id = :done.result.riskRatingReviewId
        ];
        System.assertEquals(
            'In Review',
            filed.LLC_BI__Status__c,
            'Probe 4: the field defaults to Not Approved, which reads as a decision. It must be set explicitly.'
        );
        System.assertNotEquals('Not Approved', filed.LLC_BI__Status__c, 'A default status here is a decision nobody made');
        System.assertEquals(a.Id, filed.LLC_BI__Account__c);
        System.assertEquals(filed.Name, done.result.recordName, 'recordName carries the RG autonumber');
        System.assertEquals(a.Name, done.result.anchorName);
    }

    @IsTest
    static void overrideWithoutACommentIsRefusedBeforeTheOrgRefusesIt() {
        Account a = C360Wave2Fixture.existingAccount();
        StageRiskRatingReview.Request r = req(a.Id, C360Wave2Fixture.key('rr-override'));
        r.overriddenRiskGradeValue = 7;
        r.comments = null;

        Test.startTest();
        StageRiskRatingReview.Response res = StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Mandatory_comment has no bypass and applies to the agent exactly as to a banker');
        System.assert(res.error.message.contains('comments'), 'The refusal should name the field: ' + res.error.message);
    }

    @IsTest
    static void overrideWithACommentIsAccepted() {
        Account a = C360Wave2Fixture.existingAccount();
        String key = C360Wave2Fixture.key('rr-ovok');
        StageRiskRatingReview.Request r = req(a.Id, key);
        r.overriddenRiskGradeValue = 7;
        r.comments = 'Downgraded for customer concentration above the portfolio median.';

        Test.startTest();
        StageRiskRatingReview.Response staged = StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ r })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteRiskRatingReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed');
        LLC_BI__Annual_Review__c filed = [
            SELECT LLC_BI__Comments__c, LLC_BI__Overridden_Risk_Grade_Value__c
            FROM LLC_BI__Annual_Review__c WHERE Id = :done.result.riskRatingReviewId
        ];
        System.assertEquals(
            r.comments,
            filed.LLC_BI__Comments__c,
            'The comment goes to the field the rule FORMULA tests, not the one the describe names as the error field'
        );
        System.assertEquals(7, filed.LLC_BI__Overridden_Risk_Grade_Value__c);
    }

    @IsTest
    static void missingAccountIsRefused() {
        StageRiskRatingReview.Request r = req(null, C360Wave2Fixture.key('rr-noacct'));
        r.accountId = null;

        Test.startTest();
        StageRiskRatingReview.Response res = StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'accountId is the object\'s one hard-required field');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
    }

    @IsTest
    static void executeReplayWritesNothingASecondTime() {
        Account a = C360Wave2Fixture.existingAccount();
        String key = C360Wave2Fixture.key('rr-replay');

        Test.startTest();
        StageRiskRatingReview.Response staged =
            StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ req(a.Id, key) })[0];
        ExecuteRiskRatingReview.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'first execute should succeed');
        ExecuteRiskRatingReview.Response again = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, again.ok, 'A replay is a successful invocation');
        System.assertEquals(true, again.result.replayed);
        System.assertEquals(first.result.riskRatingReviewId, again.result.riskRatingReviewId);
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Annual_Review__c WHERE LLC_BI__Account__c = :a.Id], 'One key, one review');
    }

    @IsTest
    static void executeRefusesMissingUsedAndMismatchedTokens() {
        Account a = C360Wave2Fixture.existingAccount();
        String key = C360Wave2Fixture.key('rr-tokens');

        Test.startTest();
        StageRiskRatingReview.Response staged =
            StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ req(a.Id, key) })[0];

        ExecuteRiskRatingReview.Request noToken = new ExecuteRiskRatingReview.Request();
        noToken.idempotencyKey = key;
        noToken.stagingId = staged.result.stagingId;
        noToken.planHash = staged.result.planHash;
        noToken.decisionToken = null;
        noToken.approverUserId = UserInfo.getUserId();
        ExecuteRiskRatingReview.Response r1 = ExecuteRiskRatingReview.run(new List<ExecuteRiskRatingReview.Request>{ noToken })[0];

        ExecuteRiskRatingReview.Request badHash = new ExecuteRiskRatingReview.Request();
        badHash.idempotencyKey = key;
        badHash.stagingId = staged.result.stagingId;
        badHash.planHash = 'deadbeef' + staged.result.planHash.substring(8);
        badHash.decisionToken = staged.result.decisionToken;
        badHash.approverUserId = UserInfo.getUserId();
        ExecuteRiskRatingReview.Response r2 = ExecuteRiskRatingReview.run(new List<ExecuteRiskRatingReview.Request>{ badHash })[0];
        Test.stopTest();

        System.assertEquals(false, r1.ok, 'A missing token is refused');
        System.assertEquals('TOKEN_REFUSED', r1.error.code);
        System.assertEquals(false, r2.ok, 'A stale plan hash is refused');
        System.assertEquals('TOKEN_REFUSED', r2.error.code);
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Annual_Review__c WHERE LLC_BI__Account__c = :a.Id], 'Nothing may be written on a refused execute');
    }

    @IsTest
    static void executeRefusesIncompleteRequests() {
        Test.startTest();
        List<ExecuteRiskRatingReview.Request> bad = new List<ExecuteRiskRatingReview.Request>();
        for (Integer i = 0; i < 3; i++) {
            ExecuteRiskRatingReview.Request r = new ExecuteRiskRatingReview.Request();
            r.idempotencyKey = i == 0 ? null : 'k';
            r.stagingId = i == 1 ? null : '000000000000000AAA';
            r.planHash = i == 2 ? null : 'h';
            r.decisionToken = 't';
            r.approverUserId = UserInfo.getUserId();
            bad.add(r);
        }
        List<ExecuteRiskRatingReview.Response> out = ExecuteRiskRatingReview.run(bad);
        Test.stopTest();

        for (Integer i = 0; i < 3; i++) {
            System.assertEquals(false, out[i].ok, 'Element ' + i + ' is missing a required input');
            System.assertEquals('VALIDATION_FAILED', out[i].error.code);
        }
    }

    @IsTest
    static void unknownLoanIsRefused() {
        Account a = C360Wave2Fixture.existingAccount();
        StageRiskRatingReview.Request r = req(a.Id, C360Wave2Fixture.key('rr-badloan'));
        r.loanId = C360Wave2Fixture.fakeId(LLC_BI__Loan__c.SObjectType);

        Test.startTest();
        StageRiskRatingReview.Response res = StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A loan this tool cannot read is refused rather than silently dropped');
        System.assert(res.error.message.contains('not found'), 'The refusal should say so: ' + res.error.message);
    }

    @IsTest
    static void missingRationaleIsRefused() {
        Account a = C360Wave2Fixture.existingAccount();
        StageRiskRatingReview.Request r = req(a.Id, C360Wave2Fixture.key('rr-norat'));
        r.rationale = null;

        Test.startTest();
        StageRiskRatingReview.Response res = StageRiskRatingReview.stage(new List<StageRiskRatingReview.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'rationale feeds the audit ledger and is required');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
    }
}
