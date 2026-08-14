/**
 * StageExecuteAnnualReviewTest - the annual-review pair, end to end.
 *
 * The two assertions that matter most come straight out of PROBE-LEDGER probe 3: status and
 * review type must land non-null because nothing defaults them, and the record type must be the
 * org's assignment rather than ours.
 */
@IsTest
private class StageExecuteAnnualReviewTest {

    /** One fixture per class, not per method: the first live run died on the time limit
        because every method re-inserted anchors and woke the managed triggers again. */
    @TestSetup
    static void makeFixture() {
        C360TestFixture.account();
    }

    private static StageAnnualReview.Request req(Id accountId, String key) {
        StageAnnualReview.Request r = new StageAnnualReview.Request();
        r.idempotencyKey = key;
        r.accountId = accountId;
        r.rationale = 'Scheduled annual review of the relationship.';
        r.reviewType = 'Annual';
        r.narrative = 'The relationship performed in line with expectations through the period.';
        r.relationshipSummary = 'Long-standing operating relationship with full treasury wallet.';
        r.strengthsNarrative = 'Consistent cash conversion and a stable order book.';
        r.weaknessNarrative = 'Customer concentration remains above the portfolio median.';
        r.recommendationNarrative = 'Renew on existing terms subject to the covenant package holding.';
        r.riskRatingComments = 'No change proposed to the current grade.';
        return r;
    }

    /** The tool's own refusal, so a failed assert names the cause instead of hiding it. */
    private static String why(StageAnnualReview.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static ExecuteAnnualReview.Response executeStaged(String key, StageAnnualReview.StageResult staged) {
        ExecuteAnnualReview.Request ex = new ExecuteAnnualReview.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.stagingId;
        ex.planHash = staged.planHash;
        ex.decisionToken = staged.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        return ExecuteAnnualReview.run(new List<ExecuteAnnualReview.Request>{ ex })[0];
    }

    @IsTest
    static void happyPathCreatesReviewAtInProgressWithExplicitStatusAndType() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('ar-happy');

        Test.startTest();
        StageAnnualReview.Response staged = StageAnnualReview.stage(new List<StageAnnualReview.Request>{ req(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed: ' + (staged.error == null ? '' : staged.error.message));
        ExecuteAnnualReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));

        LLC_BI__Review__c r = [
            SELECT Id, LLC_BI__Account__c, LLC_BI__Status__c, LLC_BI__Review_Type__c,
                   LLC_BI__Is_Agentic_Review__c, LLC_BI__Narrative__c, cm_Review_Stage__c, cm_Approved_Date__c
            FROM LLC_BI__Review__c
            WHERE Id = :done.result.reviewId
        ];
        System.assertEquals(a.Id, r.LLC_BI__Account__c);
        System.assertEquals('In Progress', r.LLC_BI__Status__c, 'Probe 3: nothing defaults status, so the tool sets it explicitly');
        System.assertEquals('Annual', r.LLC_BI__Review_Type__c, 'Probe 3: nothing defaults review type either');
        System.assertEquals(true, r.LLC_BI__Is_Agentic_Review__c, 'The org is pre-wired for agent-authored reviews');
        // NEW ORG FACT (2026-07-26): cm_Review_Stage__c is defaultedOnCreate with picklist
        // default 'Qualification', so a new Review lands on the first rung of the local ladder
        // by field default. The org sets it, we never do. C360WriteGuard refuses the field for
        // every value, which C360WriteGuardTest proves directly. The guarantee worth asserting
        // here is therefore not "null" but "never a rung we are forbidden to reach".
        System.assertNotEquals('Approval', r.cm_Review_Stage__c, 'Review_Validation_01 makes Approval unreachable through the API for anyone');
        System.assertNotEquals('Complete', r.cm_Review_Stage__c, 'Complete is minted by the org\'s own process, never by this tool');
        System.assertEquals(null, r.cm_Approved_Date__c, 'Approval belongs to the org\'s own process');

        // The cockpit stamps the activity trail from these, so a null here is a generic label.
        String orgName = [SELECT Name FROM LLC_BI__Review__c WHERE Id = :done.result.reviewId].Name;
        System.assertEquals(orgName, done.result.recordName, 'recordName must carry the org-assigned review name');
        System.assertNotEquals(null, done.result.recordName, 'recordName must not be null on a successful execute');
        System.assertEquals(done.result.reviewName, done.result.recordName, 'recordName and the type-specific alias must agree');
        System.assertEquals(a.Name, done.result.anchorName, 'anchorName must carry the borrower account name');
    }

    @IsTest
    static void planEndsInAHandoffNotACompletion() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('ar-handoff');

        Test.startTest();
        StageAnnualReview.Response staged = StageAnnualReview.stage(new List<StageAnnualReview.Request>{ req(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteAnnualReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok);
        List<StageAnnualReview.PlanStep> steps = staged.result.steps;
        System.assertEquals(
            C360Plan.TYPE_HANDOFF,
            steps[steps.size() - 1].type,
            'A33.4.6(b): the plan\'s last step is a handoff to nCino Submit for Approval.'
        );
        System.assert(
            done.result.nextStep.contains('Submit for Approval'),
            'The terminal state names the handoff: ' + done.result.nextStep
        );
        System.assertNotEquals(
            'Complete',
            [SELECT LLC_BI__Status__c FROM LLC_BI__Review__c WHERE Id = :done.result.reviewId].LLC_BI__Status__c,
            'Our tools never mint Complete.'
        );
    }

    @IsTest
    static void missingReviewTypeIsRefused() {
        Account a = C360TestFixture.existingAccount();
        StageAnnualReview.Request r = req(a.Id, C360TestFixture.key('ar-notype'));
        r.reviewType = null;

        Test.startTest();
        StageAnnualReview.Response res = StageAnnualReview.stage(new List<StageAnnualReview.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'An omitted review type files a review of no type, so it is refused at stage');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
    }

    @IsTest
    static void unknownReviewTypeIsRefusedAgainstTheOrgPicklist() {
        Account a = C360TestFixture.existingAccount();
        StageAnnualReview.Request r = req(a.Id, C360TestFixture.key('ar-badtype'));
        r.reviewType = 'Quarterly';

        Test.startTest();
        StageAnnualReview.Response res = StageAnnualReview.stage(new List<StageAnnualReview.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A33.1.6: picklist options are read from the org, never invented');
        System.assert(res.error.message.contains('Annual'), 'The refusal should list what the org offers: ' + res.error.message);
    }

    @IsTest
    static void editedNarrativeAttributionIsLedgerOnly() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('ar-attrib');
        StageAnnualReview.Request r = req(a.Id, key);
        r.editedNarrativeFields = new List<String>{ 'cm_Recommendation_Narrative__c' };

        Test.startTest();
        StageAnnualReview.Response staged = StageAnnualReview.stage(new List<StageAnnualReview.Request>{ r })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteAnnualReview.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok);
        System.assert(
            staged.result.provenanceJson.contains('editedFields'),
            'A33.1.7: attribution is carried in the staging record and the ledger.'
        );

        LLC_BI__Review__c review = [
            SELECT cm_Recommendation_Narrative__c FROM LLC_BI__Review__c WHERE Id = :done.result.reviewId
        ];
        System.assertEquals(
            r.recommendationNarrative,
            review.cm_Recommendation_Narrative__c,
            'A33.1.7: nothing is injected into the nCino field text. The credit file holds clean final prose.'
        );
    }

    @IsTest
    static void executeReplayReportsThePriorReviewAndWritesNothing() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('ar-replay');

        Test.startTest();
        StageAnnualReview.Response staged = StageAnnualReview.stage(new List<StageAnnualReview.Request>{ req(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteAnnualReview.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'first execute should succeed: ' + (first.error == null ? '' : first.error.message));

        ExecuteAnnualReview.Response again = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, again.ok, 'A replay is a successful invocation, not a failure');
        System.assertEquals(true, again.result.replayed, 'The replay must declare itself');
        System.assertEquals(first.result.reviewId, again.result.reviewId, 'The replay reports the prior record');
        System.assertEquals(first.result.recordName, again.result.recordName, 'A replay stamps the same label the first run did');
        System.assertNotEquals(null, again.result.recordName, 'recordName must survive the replay path');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM LLC_BI__Review__c WHERE LLC_BI__Account__c = :a.Id],
            'Idempotency is ours to enforce: one key, one review, never two.'
        );
    }

    @IsTest
    static void executeWithoutATokenIsRefused() {
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('ar-notoken');

        Test.startTest();
        StageAnnualReview.Response staged = StageAnnualReview.stage(new List<StageAnnualReview.Request>{ req(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));

        ExecuteAnnualReview.Request ex = new ExecuteAnnualReview.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.result.stagingId;
        ex.planHash = staged.result.planHash;
        ex.decisionToken = null;
        ex.approverUserId = UserInfo.getUserId();
        ExecuteAnnualReview.Response res = ExecuteAnnualReview.run(new List<ExecuteAnnualReview.Request>{ ex })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'No execute_* runs without a decision token');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Review__c WHERE LLC_BI__Account__c = :a.Id], 'Nothing may be written on a refused execute');
    }
}
