/**
 * C360ActionStagingTest - the token gate and the idempotency fence.
 *
 * BUILD-BRIEF-V2 WP2 criterion 3 asks for four separate negative tests: a missing token, a used
 * token, a token bound to a different planHash, and a planHash that no longer matches the staged
 * plan. Each has its own method here, run through the real execute tool rather than against the
 * staging class in isolation, because the tool is the surface that has to refuse.
 */
@IsTest
private class C360ActionStagingTest {

    /** One fixture per class, not per method: the first live run died on the time limit
        because every method re-inserted anchors and woke the managed triggers again. */
    @TestSetup
    static void makeFixture() {
        C360TestFixture.account();
    }

    private static StageServiceRequest.StageResult stageOne(Id accountId, String key) {
        StageServiceRequest.Request req = new StageServiceRequest.Request();
        req.idempotencyKey = key;
        req.accountId = accountId;
        req.rationale = 'Rationale.';
        req.requestType = 'Address change';
        req.summary = 'Client asked to update the registered address.';
        StageServiceRequest.Response res = StageServiceRequest.stage(new List<StageServiceRequest.Request>{ req })[0];
        System.assertEquals(true, res.ok, 'stage should succeed, got ' + why(res));
        return res.result;
    }

    /** The tool's own refusal, so a failed assert names the cause instead of hiding it. */
    private static String why(StageServiceRequest.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static ExecuteServiceRequest.Response executeWith(String key, String stagingId, String planHash, String token, Id approver) {
        ExecuteServiceRequest.Request req = new ExecuteServiceRequest.Request();
        req.idempotencyKey = key;
        req.stagingId = stagingId;
        req.planHash = planHash;
        req.decisionToken = token;
        req.approverUserId = approver;
        return ExecuteServiceRequest.run(new List<ExecuteServiceRequest.Request>{ req })[0];
    }

    @IsTest
    static void missingTokenIsRefused() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('notoken');
        StageServiceRequest.StageResult staged = stageOne(a.Id, key);

        Test.startTest();
        ExecuteServiceRequest.Response res = executeWith(key, staged.stagingId, staged.planHash, null, UserInfo.getUserId());
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A missing decision token must be refused');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assertEquals(0, [SELECT COUNT() FROM Case WHERE AccountId = :a.Id], 'Nothing may be written on a refused execute');
    }

    @IsTest
    static void usedTokenIsRefused() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('usedtoken');
        StageServiceRequest.StageResult staged = stageOne(a.Id, key);

        Test.startTest();
        ExecuteServiceRequest.Response first = executeWith(key, staged.stagingId, staged.planHash, staged.decisionToken, UserInfo.getUserId());
        System.assertEquals(true, first.ok, 'The first execute should succeed: ' + (first.error == null ? '' : first.error.message));

        // A second attempt on the same key replays rather than writing again, so the single-use
        // property is asserted directly against the consumed staging record too.
        cm_Action_Staging__c stg = [SELECT cm_Token_Consumed_At__c FROM cm_Action_Staging__c WHERE Id = :staged.stagingId];
        System.assertNotEquals(null, stg.cm_Token_Consumed_At__c, 'The token must be marked consumed');

        Boolean refused = false;
        try {
            C360ActionStaging.claimForExecute(staged.stagingId, staged.planHash, staged.decisionToken, UserInfo.getUserId());
        } catch (C360ActionStaging.StagingException e) {
            refused = true;
            System.assert(e.getMessage().contains('single use'), 'The refusal should name single use: ' + e.getMessage());
        }
        Test.stopTest();

        System.assertEquals(true, refused, 'A consumed token must be refused on a second claim');
        System.assertEquals(1, [SELECT COUNT() FROM Case WHERE AccountId = :a.Id], 'Exactly one case, never two');
    }

    @IsTest
    static void tokenBoundToADifferentPlanHashIsRefused() {
        Account a = C360TestFixture.existingAccount();
        String keyOne = C360TestFixture.key('planA');
        String keyTwo = C360TestFixture.key('planB');
        StageServiceRequest.StageResult planA = stageOne(a.Id, keyOne);

        StageServiceRequest.Request other = new StageServiceRequest.Request();
        other.idempotencyKey = keyTwo;
        other.accountId = a.Id;
        other.rationale = 'Rationale.';
        other.requestType = 'A different ask entirely';
        other.summary = 'Client asked for something else.';
        StageServiceRequest.StageResult planB =
            StageServiceRequest.stage(new List<StageServiceRequest.Request>{ other })[0].result;

        System.assertNotEquals(planA.planHash, planB.planHash, 'Two different plans must hash differently');

        Test.startTest();
        // Plan B's token against plan A's staging record and hash.
        ExecuteServiceRequest.Response res = executeWith(keyOne, planA.stagingId, planA.planHash, planB.decisionToken, UserInfo.getUserId());
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A token minted for another plan must be refused');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assertEquals(0, [SELECT COUNT() FROM Case WHERE AccountId = :a.Id], 'Nothing may be written on a refused execute');
    }

    @IsTest
    static void staleplanHashIsRefused() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('stalehash');
        StageServiceRequest.StageResult staged = stageOne(a.Id, key);

        Test.startTest();
        ExecuteServiceRequest.Response res = executeWith(
            key, staged.stagingId, 'deadbeef' + staged.planHash.substring(8), staged.decisionToken, UserInfo.getUserId()
        );
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A planHash that does not match the staged plan must be refused');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assert(res.error.message.contains('planHash'), 'The refusal should name the plan hash: ' + res.error.message);
        System.assertEquals(0, [SELECT COUNT() FROM Case WHERE AccountId = :a.Id], 'Nothing may be written on a refused execute');
    }

    @IsTest
    static void approverMustBeTheRunningIdentity() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('approver');
        StageServiceRequest.StageResult staged = stageOne(a.Id, key);

        List<User> others = [SELECT Id FROM User WHERE Id != :UserInfo.getUserId() AND IsActive = true LIMIT 1];
        if (others.isEmpty()) {
            return;
        }

        Test.startTest();
        ExecuteServiceRequest.Response res = executeWith(key, staged.stagingId, staged.planHash, staged.decisionToken, others[0].Id);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'An approver who is not the running identity must be refused');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
    }

    @IsTest
    static void repeatedStageOnOneKeyReturnsOnePlanAndOneToken() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('stagereplay');

        Test.startTest();
        StageServiceRequest.StageResult first = stageOne(a.Id, key);
        StageServiceRequest.StageResult second = stageOne(a.Id, key);
        Test.stopTest();

        System.assertEquals(first.stagingId, second.stagingId, 'One idempotency key means one staging record');
        System.assertEquals(false, first.replayed, 'The first stage is not a replay');
        System.assertEquals(true, second.replayed, 'The second stage is a replay');
        System.assertEquals(
            null,
            second.decisionToken,
            'A replay never re-mints: a second single-use token for a confirmed plan is exactly what A33.5.4 forbids.'
        );
        System.assertEquals(1, [SELECT COUNT() FROM cm_Action_Staging__c WHERE cm_Idempotency_Key__c = :key]);
    }

    @IsTest
    static void executeReplayReportsThePriorRecordAndWritesNothing() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('execreplay');
        StageServiceRequest.StageResult staged = stageOne(a.Id, key);

        Test.startTest();
        ExecuteServiceRequest.Response first = executeWith(key, staged.stagingId, staged.planHash, staged.decisionToken, UserInfo.getUserId());
        System.assertEquals(true, first.ok, 'The first execute should succeed: ' + (first.error == null ? '' : first.error.message));

        ExecuteServiceRequest.Response replayed = executeWith(key, staged.stagingId, staged.planHash, staged.decisionToken, UserInfo.getUserId());
        Test.stopTest();

        System.assertEquals(true, replayed.ok, 'A replay is a successful invocation, not a failure');
        System.assertEquals(true, replayed.result.replayed, 'The replay must declare itself');
        System.assertEquals(first.result.caseId, replayed.result.caseId, 'The replay reports the prior record');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Case WHERE AccountId = :a.Id],
            'Idempotency is ours to enforce: the platform is known to duplicate on failed background Apex.'
        );
    }
}
