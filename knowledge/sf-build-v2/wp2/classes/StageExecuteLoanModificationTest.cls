/**
 * StageExecuteLoanModificationTest - the loan-modification pair, end to end.
 *
 * TWO THINGS THIS FILE IS FOR.
 *
 * 1. The fixture is a REAL Booked facility, not an injected one. StageHeldCreditActionsTest could not
 *    have one, because the wave that wrote it believed Booked was unreachable through the API. It is
 *    not: Loan_Validation_06 keys on PRIORVALUE, which is blank on an insert, so a facility filed AT
 *    Booked with a lookupKey satisfies LV05 and never trips LV06 (DEMO-RELATIONSHIP section 1, proved
 *    on a throwaway loan before any permanent insert). So the selection contract, the token gate and
 *    the verification all run against a facility the org itself accepts.
 *
 * 2. The credit-action engine is stubbed, and it is stubbed HONESTLY. The bean clones loans and writes
 *    chain rows inside a managed package; a unit test cannot stand that up, and pretending otherwise
 *    would test the mock. The stub does exactly what the org was OBSERVED to do on 2026-08-20 (clone
 *    at Qualification, Is_Modification true, lookupKey suffixed _M1, revision 0 self-referential
 *    anchor plus a revision 1 row pointing at the clone), so everything downstream of the engine is
 *    exercised for real: the chain mapping, the anchor-row exclusion, the re-query verification, the
 *    parent comparison, the apply-to-clone write and the idempotency fence.
 *    theRealCreditActionEngineEitherRunsOrSaysWhyItDidNot runs with NO stub, so the truth about the
 *    real bean in a test context is recorded rather than assumed.
 *
 * Every method arms the shared-sandbox callout mock first: 24 org-local CDC triggers enqueue an
 * EventBridge callout on every DML these fixtures perform, and a test context refuses an unmocked one.
 */
@IsTest
private class StageExecuteLoanModificationTest {

    private static final String PARENT_KEY = 'ZZMODTEST1';

    @TestSetup
    static void makeFixture() {
        C360TestFixture.armCalloutMock();
        Account a = new Account(Name = 'ZZ-MOD-TEST Borrower');
        insert a;

        LLC_BI__Product_Package__c p = new LLC_BI__Product_Package__c(
            Name = 'ZZ-MOD-TEST Package',
            LLC_BI__Account__c = a.Id
        );
        insert p;

        // Filed AT Booked with a core key. This is the shape proved against the org on 2026-08-20.
        insert new LLC_BI__Loan__c(
            LLC_BI__Account__c = a.Id,
            LLC_BI__Product_Package__c = p.Id,
            LLC_BI__Stage__c = 'Booked',
            LLC_BI__Status__c = 'Open',
            LLC_BI__lookupKey__c = PARENT_KEY,
            LLC_BI__Amount__c = 1000000,
            LLC_BI__Principal_Balance__c = 500000,
            LLC_BI__Product_Line__c = 'Commercial',
            LLC_BI__Product_Type__c = 'Term Loan',
            LLC_BI__Product__c = 'Equipment',
            LLC_BI__isRenewal__c = false,
            LLC_BI__Is_Modification__c = false
        );
    }

    // -------------------------------------------------------------------------------------------
    // Fixture readers and request builders.
    // -------------------------------------------------------------------------------------------

    private static Account borrower() {
        return [SELECT Id, Name FROM Account WHERE Name = 'ZZ-MOD-TEST Borrower' LIMIT 1];
    }

    private static LLC_BI__Product_Package__c pkg() {
        return [SELECT Id, Name FROM LLC_BI__Product_Package__c WHERE LLC_BI__Account__c = :borrower().Id LIMIT 1];
    }

    /** The parent, found through the relationship: the org rewrites loan names on save. */
    private static LLC_BI__Loan__c parent() {
        return [
            SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c, LLC_BI__Amount__c, LLC_BI__lookupKey__c
            FROM LLC_BI__Loan__c
            WHERE LLC_BI__Account__c = :borrower().Id AND LLC_BI__lookupKey__c = :PARENT_KEY
            LIMIT 1
        ];
    }

    private static String key(String label) {
        return 'ZZ-MOD-' + label + '-' + String.valueOf(Crypto.getRandomLong());
    }

    private static StageLoanModification.Request stageReq(String k) {
        StageLoanModification.Request r = new StageLoanModification.Request();
        r.idempotencyKey = k;
        r.productPackageId = pkg().Id;
        r.loanId = parent().Id;
        r.rationale = 'Client asked to increase the equipment facility.';
        r.requestedAmount = 1500000;
        return r;
    }

    private static StageLoanModification.Response stage(StageLoanModification.Request r) {
        return StageLoanModification.stage(new List<StageLoanModification.Request>{ r })[0];
    }

    private static String whyStage(StageLoanModification.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message;
    }

    private static String whyExec(ExecuteLoanModification.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static ExecuteLoanModification.Request execReq(String k, StageLoanModification.StageResult staged) {
        ExecuteLoanModification.Request e = new ExecuteLoanModification.Request();
        e.idempotencyKey = k;
        e.stagingId = staged.stagingId;
        e.planHash = staged.planHash;
        e.decisionToken = staged.decisionToken;
        e.approverUserId = UserInfo.getUserId();
        return e;
    }

    private static ExecuteLoanModification.Response execute(ExecuteLoanModification.Request e) {
        return ExecuteLoanModification.run(new List<ExecuteLoanModification.Request>{ e })[0];
    }

    // -------------------------------------------------------------------------------------------
    // The engine stubs.
    // -------------------------------------------------------------------------------------------

    /**
     * Does what the org was observed to do, and nothing more. It deliberately writes the revision 0
     * self-referential anchor row as well, because a naive chain read would report the parent as its
     * own modification and this suite has to prove ours does not.
     */
    private class ObservedCloneEngine implements ExecuteLoanModification.CreditActionEngine {
        public ExecuteLoanModification.EngineResult modify(Id packageId, List<Id> facilityIds) {
            List<LLC_BI__Loan__c> parents = [
                SELECT Id, LLC_BI__Account__c, LLC_BI__Product_Package__c, LLC_BI__Amount__c,
                       LLC_BI__lookupKey__c, LLC_BI__Product__c, LLC_BI__Product_Line__c, LLC_BI__Product_Type__c,
                       LLC_BI__Stage__c, LLC_BI__Status__c
                FROM LLC_BI__Loan__c
                WHERE Id IN :facilityIds
            ];

            List<LLC_BI__Loan__c> clones = new List<LLC_BI__Loan__c>();
            for (LLC_BI__Loan__c p : parents) {
                clones.add(new LLC_BI__Loan__c(
                    LLC_BI__Account__c = p.LLC_BI__Account__c,
                    LLC_BI__Product_Package__c = p.LLC_BI__Product_Package__c,
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
                // ORG FACT, found by the first live run of this suite: LLC_BI__LoanRenewal__c refuses an
                // insert without PreviousVersionStage AND PreviousVersionStatus. The object carries no
                // validation rules, so this is universally-required field configuration, and any code
                // that writes a chain row by hand has to carry both.
                chain.add(new LLC_BI__LoanRenewal__c(
                    LLC_BI__ParentLoanId__c = parents[i].Id,
                    LLC_BI__RenewalLoanId__c = parents[i].Id,
                    LLC_BI__RevisionNumber__c = 0,
                    LLC_BI__RevisionStatus__c = 'Available',
                    LLC_BI__PreviousVersionStage__c = parents[i].LLC_BI__Stage__c,
                    LLC_BI__PreviousVersionStatus__c = parents[i].LLC_BI__Status__c
                ));
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
            out.outputPackageId = packageId;
            return out;
        }
    }

    /** The org saying no, in the shape the engine says it in. */
    private class RefusingEngine implements ExecuteLoanModification.CreditActionEngine {
        public ExecuteLoanModification.EngineResult modify(Id packageId, List<Id> facilityIds) {
            ExecuteLoanModification.EngineResult out = new ExecuteLoanModification.EngineResult();
            out.success = false;
            out.failureReasons.add('The request contains invalid facilities');
            return out;
        }
    }

    private static Integer cloneCount() {
        return [SELECT COUNT() FROM LLC_BI__Loan__c WHERE LLC_BI__Is_Modification__c = true AND LLC_BI__Account__c = :borrower().Id];
    }

    // -------------------------------------------------------------------------------------------
    // The pair, end to end.
    // -------------------------------------------------------------------------------------------

    // WHY EXECUTE SITS OUTSIDE THE Test.startTest/stopTest WINDOW IN THE WRITING TESTS.
    // LoanCDC enqueues an EventBridgeCallout queueable on every Loan insert and update. Async jobs
    // queued inside the window are flushed by Test.stopTest() INSIDE this transaction, which still
    // holds uncommitted DML, and the platform then refuses the callout with "You have uncommitted work
    // pending" before the armed mock is ever consulted. Observed on the first live run of this suite,
    // 2026-08-22. Jobs enqueued after stopTest have no flush point and never execute, so the write
    // path runs there. The mock stays armed regardless: it is the shield, not the fix.


    @IsTest
    static void happyPathClonesVerifiesAndAppliesToTheCloneOnly() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        LLC_BI__Loan__c before = parent();
        String k = key('happy');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, 'A booked facility stages: ' + whyStage(staged));
        System.assertEquals(false, staged.result.executionHeld, 'Execution is no longer held for a modification');
        System.assertEquals(null, staged.result.heldReason, 'Nothing is held, so nothing explains a hold');

        ExecuteLoanModification.Response done = execute(execReq(k, staged.result));

        System.assertEquals(true, done.ok, 'execute should succeed: ' + whyExec(done));
        System.assertEquals(C360Plan.TERMINAL_SUCCESS, done.result.terminalState, 'Every step verified: ' + JSON.serialize(done.result.steps));
        System.assertEquals(1, done.result.facilityCount);
        System.assertNotEquals(null, done.result.cloneLoanId, 'The clone id is the whole point of the call');
        System.assertNotEquals(null, done.result.recordName, 'recordName carries the org-assigned label for the activity trail');

        // The clone, read back from the org rather than from the response.
        LLC_BI__Loan__c clone = [
            SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Is_Modification__c, LLC_BI__Product_Package__c,
                   LLC_BI__Amount__c, LLC_BI__lookupKey__c
            FROM LLC_BI__Loan__c WHERE Id = :done.result.cloneLoanId
        ];
        System.assertEquals(true, clone.LLC_BI__Is_Modification__c, 'A modification clone carries the flag or it is an original loan');
        System.assertEquals(pkg().Id, clone.LLC_BI__Product_Package__c, 'The clone stays on the deal anchor');
        System.assertEquals('Qualification', clone.LLC_BI__Stage__c, 'This tool never moves the clone stage');
        System.assertEquals(1500000, clone.LLC_BI__Amount__c, 'The staged change lands on the CLONE');

        // The parent, untouched.
        LLC_BI__Loan__c after = parent();
        System.assertEquals(before.LLC_BI__Stage__c, after.LLC_BI__Stage__c, 'The parent stage never moves');
        System.assertEquals(before.LLC_BI__Status__c, after.LLC_BI__Status__c, 'The parent status never moves');
        System.assertEquals(before.LLC_BI__Amount__c, after.LLC_BI__Amount__c, 'The requested amount goes to the clone, never the parent');
        System.assertEquals(true, done.result.facilities[0].parentUnchanged, 'And the tool must say so itself');

        // The chain row, and the anchor-row trap.
        LLC_BI__LoanRenewal__c junction = [
            SELECT Id, Name, LLC_BI__ParentLoanId__c, LLC_BI__RenewalLoanId__c, LLC_BI__RevisionNumber__c
            FROM LLC_BI__LoanRenewal__c WHERE Id = :done.result.facilities[0].junctionId
        ];
        System.assertEquals(before.Id, junction.LLC_BI__ParentLoanId__c);
        System.assertEquals(clone.Id, junction.LLC_BI__RenewalLoanId__c, 'The revision 0 anchor points at itself and must never be reported as the modification');
        System.assertEquals(1, junction.LLC_BI__RevisionNumber__c);
        System.assertEquals(junction.Name, done.result.facilities[0].junctionName);

        System.assert(done.result.facilities[0].verification.contains('Is_Modification'),
            'The verification string says what was re-read: ' + done.result.facilities[0].verification);
        System.assert(done.result.bookingHandoff.contains('Submit for Approval'),
            'The banker is told booking is still nCino\'s run: ' + done.result.bookingHandoff);

        Boolean sawHandoffVerified = false;
        for (ExecuteLoanModification.StepResult s : done.result.steps) {
            if (s.id == 'held_execution') {
                sawHandoffVerified = s.state == C360Plan.STATE_VERIFIED && s.detail.contains('Submit for Approval');
            }
        }
        System.assertEquals(true, sawHandoffVerified, 'The handoff step is settled and names what the human still has to do');
    }

    @IsTest
    static void replayReportsThePriorCloneAndWritesNothing() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('replay');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        ExecuteLoanModification.Response first = execute(execReq(k, staged.result));
        System.assertEquals(true, first.ok, 'first execute should succeed: ' + whyExec(first));
        ExecuteLoanModification.Response again = execute(execReq(k, staged.result));

        System.assertEquals(true, again.ok, 'A replay is a successful invocation, not a failure');
        System.assertEquals(true, again.result.replayed, 'The replay must declare itself');
        System.assertEquals(first.result.cloneLoanId, again.result.cloneLoanId, 'The replay reports the prior clone');
        System.assertEquals(first.result.recordName, again.result.recordName, 'A replay stamps the same label the first run did');
        System.assertEquals(1, cloneCount(),
            'One key, one modification. The platform is known to produce duplicates on failed background Apex, so this fence is ours.');
    }

    @IsTest
    static void executeWithoutATokenIsRefused() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('notoken');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        System.assertEquals(true, staged.ok, whyStage(staged));
        ExecuteLoanModification.Request e = execReq(k, staged.result);
        e.decisionToken = null;
        ExecuteLoanModification.Response res = execute(e);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'No execute_* runs without a decision token');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assertEquals(0, cloneCount(), 'Nothing may be written on a refused execute');
    }

    @IsTest
    static void aConsumedTokenIsRefusedOnASecondPlan() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('used');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        ExecuteLoanModification.Response first = execute(execReq(k, staged.result));
        System.assertEquals(true, first.ok, 'first execute should succeed: ' + whyExec(first));

        // A fresh idempotency key gets past the replay fence, so this reaches the token check itself.
        ExecuteLoanModification.Response res = execute(execReq(key('used-again'), staged.result));

        System.assertEquals(false, res.ok, 'Tokens are single use');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assert(res.error.message.contains('already been used'), res.error.message);
        System.assertEquals(1, cloneCount(), 'A refused replay writes no second modification');
    }

    @IsTest
    static void aMismatchedPlanHashIsRefused() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('hash');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        System.assertEquals(true, staged.ok, whyStage(staged));
        ExecuteLoanModification.Request e = execReq(k, staged.result);
        e.planHash = 'not-the-hash-the-banker-confirmed';
        ExecuteLoanModification.Response res = execute(e);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A plan is never executed against figures the banker did not see');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assert(res.error.message.contains('planHash'), res.error.message);
        System.assertEquals(0, cloneCount());
    }

    @IsTest
    static void aDifferentApproverIsRefused() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('approver');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        System.assertEquals(true, staged.ok, whyStage(staged));
        ExecuteLoanModification.Request e = execReq(k, staged.result);
        e.approverUserId = C360Wave2Fixture.fakeId(User.SObjectType);
        ExecuteLoanModification.Response res = execute(e);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'The token binds a named human, and this server runs as-user');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assert(res.error.message.contains('running identity'), res.error.message);
        System.assertEquals(0, cloneCount());
    }

    @IsTest
    static void anotherToolsPlanIsRefusedBeforeTheTokenIsBurned() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('wrongaction');

        StageLoanModification.Response staged = stage(stageReq(k));
        System.assertEquals(true, staged.ok, whyStage(staged));
        // Rewrite the action id under the plan, exactly as a caller pointing execute_loan_modification
        // at somebody else's staging row would look from here.
        cm_Action_Staging__c row = [SELECT Id, cm_Action_Id__c FROM cm_Action_Staging__c WHERE Id = :staged.result.stagingId];
        row.cm_Action_Id__c = 'annual-review';
        update row;

        Test.startTest();
        ExecuteLoanModification.Response res = execute(execReq(k, staged.result));
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Each execute tool runs its own action or none');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assert(res.error.message.contains('annual-review'), 'The refusal names the plan it actually found: ' + res.error.message);
        System.assertEquals(
            null,
            [SELECT cm_Token_Consumed_At__c FROM cm_Action_Staging__c WHERE Id = :staged.result.stagingId].cm_Token_Consumed_At__c,
            'A wrong-tool call must not burn the banker\'s single-use confirmation'
        );
        System.assertEquals(0, cloneCount());
    }

    @IsTest
    static void stagingWritesNoDomainRow() {
        C360TestFixture.armCalloutMock();
        Integer loansBefore = [SELECT COUNT() FROM LLC_BI__Loan__c];
        Integer junctionsBefore = [SELECT COUNT() FROM LLC_BI__LoanRenewal__c];

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(key('zerodml')));
        Test.stopTest();

        System.assertEquals(true, staged.ok, whyStage(staged));
        System.assertEquals(loansBefore, [SELECT COUNT() FROM LLC_BI__Loan__c], 'A33.0.1: stage writes no domain row');
        System.assertEquals(junctionsBefore, [SELECT COUNT() FROM LLC_BI__LoanRenewal__c], 'And no chain row either');
        System.assertEquals(1, [SELECT COUNT() FROM cm_Action_Staging__c], 'The staging record is the only thing staging writes');
    }

    @IsTest
    static void anEngineRefusalIsReportedAsAnOrgRejection() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new RefusingEngine();
        String k = key('refused');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        System.assertEquals(true, staged.ok, whyStage(staged));
        ExecuteLoanModification.Response res = execute(execReq(k, staged.result));
        Test.stopTest();

        System.assertEquals(false, res.ok, 'The engine said no, so the tool says no');
        System.assertEquals('ORG_REJECTED_WRITE', res.error.code, 'An org refusal is reported as the org\'s, not as our validation');
        System.assert(res.error.orgError.contains('invalid facilities'), 'The org\'s own words reach the banker: ' + res.error.orgError);
        System.assertEquals(true, res.error.resumable, 'A refused credit action can be retried after the cause is fixed');
        System.assertEquals(0, cloneCount(), 'Nothing is written when the engine refuses');
        System.assertEquals(
            'Failed',
            [SELECT cm_Status__c FROM cm_Action_Staging__c WHERE Id = :staged.result.stagingId].cm_Status__c,
            'The staging record is the authority on what happened, including when it failed'
        );
    }

    /**
     * The one test that runs the REAL bean. It cannot assert success, because a managed-package
     * credit action inside a test context is not something this suite controls, and a green assertion
     * either way would be a lie. It asserts the tool answers coherently on both branches, and prints
     * which branch the org took so the answer is recorded rather than guessed at.
     */
    @IsTest
    static void theRealCreditActionEngineEitherRunsOrSaysWhyItDidNot() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = null;
        String k = key('realbean');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        ExecuteLoanModification.Response res = execute(execReq(k, staged.result));

        if (res.ok == true) {
            System.debug(LoggingLevel.ERROR, 'REAL BEAN RAN IN TEST CONTEXT: clone ' + res.result.cloneLoanId);
            System.assertNotEquals(null, res.result.cloneLoanId, 'A successful real run must produce a verifiable clone');
            System.assertNotEquals(null, res.result.facilities[0].junctionId, 'And a chain row to prove the lineage');
        } else {
            System.debug(LoggingLevel.ERROR, 'REAL BEAN SKIPPED IN TEST CONTEXT: ' + whyExec(res));
            System.assertEquals('ORG_REJECTED_WRITE', res.error.code,
                'A bean that will not run in a test context is an ORG refusal, reported with the org\'s own words, not a fault: ' + whyExec(res));
            System.assertNotEquals(null, res.error.orgError, 'The refusal must carry what the engine actually said');
            System.assertEquals(0, cloneCount(), 'A refused run writes nothing');
        }
    }
}
