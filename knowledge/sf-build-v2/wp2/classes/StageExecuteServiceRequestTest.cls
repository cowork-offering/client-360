/**
 * StageExecuteServiceRequestTest - the create-service-request pair, end to end.
 *
 * Covers the happy path, the validation refusals, the positional envelope, and the WP1 outcome:
 * bankinggpt now offers Type = 'Service Request' and Origin = 'Agent', so the degraded branch is
 * unreachable here and the confirm summary declares no mismatch.
 */
@IsTest
private class StageExecuteServiceRequestTest {

    /** One fixture per class, not per method: the first live run died on the time limit
        because every method re-inserted anchors and woke the managed triggers again. */
    @TestSetup
    static void makeFixture() {
        C360TestFixture.armCalloutMock();
        C360TestFixture.account();
    }

    /** The tool's own refusal, so a failed assert names the cause instead of hiding it. */
    private static String why(StageServiceRequest.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static StageServiceRequest.Request req(Id accountId, String key) {
        StageServiceRequest.Request r = new StageServiceRequest.Request();
        r.idempotencyKey = key;
        r.accountId = accountId;
        r.rationale = 'Client emailed asking to change the wire template.';
        r.requestType = 'Wire template change';
        r.summary = 'Client asked to update the standing wire instructions on the operating account.';
        r.referenceKind = 'm365-message';
        r.referenceId = 'SAMPLE-AAMkADQ2YjM3STRLREVOLVER0001';
        r.referenceWebLink = 'https://example.invalid/message/1';
        return r;
    }

    @IsTest
    static void happyPathCreatesOneCaseAtNew() {
        C360TestFixture.armCalloutMock();
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('sr-happy');

        Test.startTest();
        StageServiceRequest.Response staged = StageServiceRequest.stage(new List<StageServiceRequest.Request>{ req(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));

        ExecuteServiceRequest.Request ex = new ExecuteServiceRequest.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.result.stagingId;
        ex.planHash = staged.result.planHash;
        ex.decisionToken = staged.result.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        ExecuteServiceRequest.Response done = ExecuteServiceRequest.run(new List<ExecuteServiceRequest.Request>{ ex })[0];
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));
        System.assertEquals(C360Plan.TERMINAL_SUCCESS, done.result.terminalState);

        Case c = [SELECT Id, CaseNumber, AccountId, Status, Type, Origin, Subject, Description FROM Case WHERE Id = :done.result.caseId];
        System.assertEquals(a.Id, c.AccountId);
        System.assertEquals('New', c.Status, 'A33.3.1: Case is created at New only');
        System.assertEquals('Wire template change', c.Subject);
        System.assertEquals(c.CaseNumber, done.result.recordName, 'recordName must carry the org-assigned case number');
        System.assertNotEquals(null, done.result.recordName, 'recordName must not be null on a successful execute');
        System.assertEquals(a.Name, done.result.anchorName, 'anchorName must carry the borrower account name');
        System.assert(
            c.Description.contains('SAMPLE-AAMkADQ2YjM3STRLREVOLVER0001'),
            'A33.4.8(a): the source reference must be written. Case has no field for it, so it rides in the description.'
        );
    }

    @IsTest
    static void bankinggptOffersTheHonestTypeAndOrigin() {
        C360TestFixture.armCalloutMock();
        Account a = C360TestFixture.existingAccount();

        Test.startTest();
        StageServiceRequest.Response staged =
            StageServiceRequest.stage(new List<StageServiceRequest.Request>{ req(a.Id, C360TestFixture.key('sr-type')) })[0];
        Test.stopTest();

        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        System.assertEquals(
            false,
            staged.result.degradedTypeMode,
            'WP1 deployed Service Request and Agent to this org, so the degraded branch is unreachable here.'
        );
        for (String w : staged.result.warnings) {
            System.assertEquals(false, w.contains('Declared type mismatch'), 'No mismatch should be declared once WP1 has landed');
        }
    }

    @IsTest
    static void slackSideEffectIsNeverClaimedAsVerified() {
        C360TestFixture.armCalloutMock();
        Account a = C360TestFixture.existingAccount();
        String key = C360TestFixture.key('sr-slack');

        Test.startTest();
        StageServiceRequest.Response staged = StageServiceRequest.stage(new List<StageServiceRequest.Request>{ req(a.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteServiceRequest.Request ex = new ExecuteServiceRequest.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.result.stagingId;
        ex.planHash = staged.result.planHash;
        ex.decisionToken = staged.result.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        ExecuteServiceRequest.Response done = ExecuteServiceRequest.run(new List<ExecuteServiceRequest.Request>{ ex })[0];
        Test.stopTest();

        System.assertEquals(true, done.ok);
        for (ExecuteServiceRequest.StepResult s : done.result.steps) {
            if (s.id == 'observe_slack') {
                System.assertNotEquals(
                    C360Plan.STATE_VERIFIED,
                    s.state,
                    'A33.3.2: an observed side effect is never claimed as verified unless a verification step proves it.'
                );
                return;
            }
        }
        System.assert(false, 'The plan must carry the Slack observed_side_effect step');
    }

    @IsTest
    static void missingAccountIsARefusalNotAFault() {
        C360TestFixture.armCalloutMock();
        StageServiceRequest.Request r = req(null, C360TestFixture.key('sr-noacct'));
        r.accountId = null;

        Test.startTest();
        StageServiceRequest.Response res = StageServiceRequest.stage(new List<StageServiceRequest.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A33.5.1: a domain failure is a successful invocation carrying ok = false');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assertEquals(null, res.result, 'A refused stage carries no result');
    }

    @IsTest
    static void oneFailureDoesNotContaminateItsSiblings() {
        C360TestFixture.armCalloutMock();
        Account a = C360TestFixture.existingAccount();
        StageServiceRequest.Request good = req(a.Id, C360TestFixture.key('sr-good'));
        StageServiceRequest.Request bad = req(a.Id, C360TestFixture.key('sr-bad'));
        bad.summary = null;

        Test.startTest();
        List<StageServiceRequest.Response> out =
            StageServiceRequest.stage(new List<StageServiceRequest.Request>{ good, bad });
        Test.stopTest();

        System.assertEquals(2, out.size(), 'A33.5.1: one element per input, positional');
        System.assertEquals(true, out[0].ok, 'Element 0 belongs to input 0 and should succeed');
        System.assertEquals(false, out[1].ok, 'Element 1 belongs to input 1 and should fail');
    }
}
