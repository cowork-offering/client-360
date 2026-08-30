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
 * 3. Since 2026-08-30 the class has TWO legs, and this file exercises both. The inline leg is what
 *    every test above the relay section drives, and it is unchanged: those requests set
 *    inlineExecution explicitly, exactly as the relayed inner call does. The relay leg is what the
 *    MCP dispatcher actually reaches, and it is tested against a scripted HttpCalloutMock, because
 *    the thing worth proving here is not that HTTP works: it is that the outer leg refuses a bad
 *    token before it costs a round trip, WRITES NOTHING on the way out, hands the inner answer back
 *    unedited, and leaves the banker's single-use confirmation intact whenever the hop fails.
 *
 * Every method arms the shared-sandbox callout mock first: 24 org-local CDC triggers enqueue an
 * EventBridge callout on every DML these fixtures perform, and a test context refuses an unmocked one.
 */
@IsTest
private class StageExecuteLoanModificationTest {

    private static final String PARENT_KEY = 'ZZMODTEST1';
    private static final String RELAY_URL = 'https://bot.connectry.io/c360-relay/relay';
    private static final String RELAY_SECRET = 'ZZ-TEST-SECRET-NOT-A-REAL-ONE';
    private static final String PATH_SELF = 'self';
    private static final String PATH_BOX = 'box';

    @TestSetup
    static void makeFixture() {
        C360TestFixture.armCalloutMock();

        // The relay leg reads this out of the application cache. It is set up here rather than in
        // each method so the relay tests perform NO DML of their own: a callout in a transaction
        // that has already written is refused by the platform, and that rule is the whole reason
        // the outer leg is read-only.
        cm_Relay_Config__c cfg = cm_Relay_Config__c.getOrgDefaults();
        cfg.cm_Relay_URL__c = RELAY_URL;
        cfg.cm_Shared_Secret__c = RELAY_SECRET;
        insert cfg;

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
        // Through the parent loan, not by name or LIMIT 1 over the account: the org rewrites package
        // names on save just as it rewrites loan names, and the versioning stub mints a SECOND
        // package for this borrower, so an unordered LIMIT 1 would nondeterministically hand back
        // the wrong one. The parent loan's package field is the one anchor the org never rewrites.
        LLC_BI__Loan__c p = [
            SELECT LLC_BI__Product_Package__c FROM LLC_BI__Loan__c
            WHERE LLC_BI__Account__c = :borrower().Id AND LLC_BI__lookupKey__c = :PARENT_KEY
            LIMIT 1
        ];
        return [SELECT Id, Name FROM LLC_BI__Product_Package__c WHERE Id = :p.LLC_BI__Product_Package__c];
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

    /** An inline request: the shape the relay's inner leg sends, and what every engine test drives. */
    private static ExecuteLoanModification.Request execReq(String k, StageLoanModification.StageResult staged) {
        ExecuteLoanModification.Request e = relayReq(k, staged);
        e.inlineExecution = true;
        return e;
    }

    /** The shape the MCP dispatcher sends: no inlineExecution, so the call is relayed. */
    private static ExecuteLoanModification.Request relayReq(String k, StageLoanModification.StageResult staged) {
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

            // Package versioning, as observed live 2026-08-30 (shape probe, rolled back): the engine
            // mints a NEW package and clones every facility it was handed onto it. It names the
            // version itself with a blank account prefix, which the stub reproduces so this suite
            // proves the caller's Name repair.
            LLC_BI__Product_Package__c version = new LLC_BI__Product_Package__c(
                Name = '- 8/30/2026 - PP',
                LLC_BI__Account__c = parents[0].LLC_BI__Account__c
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
            out.outputPackageId = version.Id;
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
        System.assertNotEquals(pkg().Id, clone.LLC_BI__Product_Package__c, 'Package methodology: the clone sits on the NEW version, never the source package');
        System.assertEquals(done.result.outputPackageId, String.valueOf(clone.LLC_BI__Product_Package__c), 'And the tool names that new version as its output package');
        System.assertEquals('Qualification', clone.LLC_BI__Stage__c, 'This tool never moves the clone stage');
        System.assertEquals(1500000, clone.LLC_BI__Amount__c, 'The staged change lands on the CLONE');

        // The versioning contract, read back from the org: the new package exists, carries every
        // rolled member, and its engine-blank name was repaired to the org convention.
        LLC_BI__Product_Package__c versionPkg = [
            SELECT Id, Name FROM LLC_BI__Product_Package__c WHERE Id = :done.result.outputPackageId
        ];
        System.assertEquals('ZZ-MOD-TEST Borrower - 8/30/2026 - PP', versionPkg.Name,
            'The blank account prefix is repaired to the org\'s "<Account> - <date> - PP" convention');
        System.assertEquals(versionPkg.Name, done.result.newPackageName, 'And the result reports the repaired name');
        System.assertEquals(1, done.result.membersRolled, 'The fixture package holds one eligible member, so one rolls');

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

        Boolean sawRollVerified = false;
        Boolean sawPackageVerified = false;
        for (ExecuteLoanModification.StepResult s : done.result.steps) {
            if (s.id == 'roll_package') {
                sawRollVerified = s.state == C360Plan.STATE_VERIFIED;
            }
            if (s.id == 'verify_package') {
                sawPackageVerified = s.state == C360Plan.STATE_VERIFIED && s.detail.contains('1 of 1');
            }
        }
        System.assertEquals(true, sawRollVerified, 'The package roll is its own verified step: ' + JSON.serialize(done.result.steps));
        System.assertEquals(true, sawPackageVerified, 'And the new version is proven to carry every rolled member: ' + JSON.serialize(done.result.steps));
    }

    @IsTest
    static void membershipThatMovesBetweenStageAndExecuteRefusesTheRun() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('drift');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        // A colleague books another facility onto the package after the banker confirmed the plan.
        // The confirmed roll is no longer the package, so the run must refuse rather than version a
        // shape nobody signed off.
        insert new LLC_BI__Loan__c(
            LLC_BI__Account__c = borrower().Id,
            LLC_BI__Product_Package__c = pkg().Id,
            LLC_BI__Stage__c = 'Booked',
            LLC_BI__Status__c = 'Open',
            LLC_BI__lookupKey__c = 'ZZMODDRIFT1',
            LLC_BI__Amount__c = 250000,
            LLC_BI__Product_Line__c = 'Commercial',
            LLC_BI__Product_Type__c = 'Term Loan',
            LLC_BI__Product__c = 'Equipment',
            LLC_BI__isRenewal__c = false,
            LLC_BI__Is_Modification__c = false
        );

        ExecuteLoanModification.Response done = execute(execReq(k, staged.result));

        System.assertEquals(false, done.ok, 'A moved membership refuses the run');
        System.assert(done.error.message.contains('membership moved'),
            'And says exactly why: ' + done.error.message);
        System.assertEquals(0, cloneCount(), 'Nothing was written');
    }

    @IsTest
    static void theJunctionGraphCarriesOntoTheCloneAndTheParentKeepsItsOwn() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        LLC_BI__Loan__c before = parent();
        String k = key('carry');

        LLC_BI__Covenant2__c cov = new LLC_BI__Covenant2__c(LLC_BI__Account__c = borrower().Id);
        insert cov;
        insert new LLC_BI__Loan_Covenant__c(LLC_BI__Loan__c = before.Id, LLC_BI__Covenant2__c = cov.Id);
        Account guarantor = new Account(Name = 'ZZ-MOD-TEST Guarantor');
        insert guarantor;
        insert new LLC_BI__Legal_Entities__c(
            LLC_BI__Loan__c = before.Id,
            LLC_BI__Product_Package__c = pkg().Id,
            LLC_BI__Account__c = guarantor.Id,
            LLC_BI__Borrower_Type__c = 'Guarantor',
            LLC_BI__Ownership__c = 50
        );
        // The org's collateral VR demands an advance rate on the type before a collateral may exist.
        LLC_BI__Collateral_Type__c colType = new LLC_BI__Collateral_Type__c(
            Name = 'ZZ-MOD-TEST Equipment',
            LLC_BI__Advance_Rate__c = 80
        );
        insert colType;
        LLC_BI__Collateral__c collateral = new LLC_BI__Collateral__c(
            LLC_BI__Collateral_Type__c = colType.Id,
            LLC_BI__Description__c = 'ZZ-MOD-TEST equipment'
        );
        insert collateral;
        LLC_BI__Loan_Collateral_Aggregate__c parentAgg = new LLC_BI__Loan_Collateral_Aggregate__c(Name = 'ZZ-MOD-TEST Aggregate');
        insert parentAgg;
        insert new LLC_BI__Loan_Collateral2__c(
            LLC_BI__Loan__c = before.Id,
            LLC_BI__Collateral__c = collateral.Id,
            LLC_BI__Loan_Collateral_Aggregate__c = parentAgg.Id,
            LLC_BI__Lien_Position__c = '1st',
            LLC_BI__Is_Primary__c = true,
            LLC_BI__Amount_Pledged__c = 750000
        );

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        ExecuteLoanModification.Response done = execute(execReq(k, staged.result));
        System.assertEquals(true, done.ok, whyExec(done));
        System.assertEquals(C360Plan.TERMINAL_SUCCESS, done.result.terminalState, JSON.serialize(done.result.steps));

        Id cloneId = (Id) done.result.cloneLoanId;
        List<LLC_BI__Loan_Covenant__c> covOnClone = [
            SELECT LLC_BI__Covenant2__c FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c = :cloneId
        ];
        System.assertEquals(1, covOnClone.size(), 'The covenant junction carries onto the clone');
        System.assertEquals(cov.Id, covOnClone[0].LLC_BI__Covenant2__c, 'It points at the SAME covenant, never a copy of the covenant itself');

        List<LLC_BI__Legal_Entities__c> invOnClone = [
            SELECT LLC_BI__Account__c, LLC_BI__Borrower_Type__c, LLC_BI__Ownership__c, LLC_BI__Product_Package__c
            FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c = :cloneId
        ];
        System.assertEquals(1, invOnClone.size(), 'The involvement carries onto the clone');
        System.assertEquals('Guarantor', invOnClone[0].LLC_BI__Borrower_Type__c, 'With its role COPIED, which the create arm alone could never author');
        System.assertEquals(50, invOnClone[0].LLC_BI__Ownership__c);
        System.assertEquals(done.result.outputPackageId, String.valueOf(invOnClone[0].LLC_BI__Product_Package__c),
            'And re-anchored on the NEW package version');

        List<LLC_BI__Loan_Collateral2__c> pledgeOnClone = [
            SELECT LLC_BI__Collateral__c, LLC_BI__Loan_Collateral_Aggregate__c, LLC_BI__Lien_Position__c,
                   LLC_BI__Is_Primary__c, LLC_BI__Amount_Pledged__c
            FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c = :cloneId
        ];
        System.assertEquals(1, pledgeOnClone.size(), 'The collateral pledge carries onto the clone');
        System.assertEquals(collateral.Id, pledgeOnClone[0].LLC_BI__Collateral__c, 'It pledges the SAME collateral');
        System.assertNotEquals(parentAgg.Id, pledgeOnClone[0].LLC_BI__Loan_Collateral_Aggregate__c,
            'On a FRESH aggregate shell: reusing the parent aggregate would cross the versions in the rollups');
        System.assertEquals('1st', pledgeOnClone[0].LLC_BI__Lien_Position__c);
        System.assertEquals(750000, pledgeOnClone[0].LLC_BI__Amount_Pledged__c);

        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c = :before.Id],
            'The parent keeps its own junction');
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c = :before.Id],
            'And its own involvement');
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c = :before.Id],
            'And its own pledge on its own aggregate');

        Boolean sawCarry = false;
        for (ExecuteLoanModification.StepResult s : done.result.steps) {
            if (s.id == 'carry_junctions') {
                sawCarry = s.state == C360Plan.STATE_VERIFIED && s.detail.contains('1 of 1 covenant junctions');
            }
        }
        System.assertEquals(true, sawCarry, 'The carry is its own verified, counted step: ' + JSON.serialize(done.result.steps));
    }

    @IsTest
    static void aNetNewCovenantIsCreatedPendingAndAttachedToTheCloneOnly() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        LLC_BI__Loan__c before = parent();
        String k = key('newcov');

        insert new LLC_BI__Covenant_Type__c(Name = 'ZZ-MOD-TEST Leverage');

        StageLoanModification.Request r = stageReq(k);
        r.covenantAddsJson = '[{"typeName":"ZZ-MOD-TEST Leverage","threshold":3.5,"operator":"<=","frequency":"Quarterly"}]';

        Test.startTest();
        StageLoanModification.Response staged = stage(r);
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));
        System.assert(staged.result.summary.contains('net-new covenant'),
            'The banker confirms a plan that NAMES the covenant it will create: ' + staged.result.summary);

        ExecuteLoanModification.Response done = execute(execReq(k, staged.result));
        System.assertEquals(true, done.ok, whyExec(done));
        System.assertEquals(C360Plan.TERMINAL_SUCCESS, done.result.terminalState, JSON.serialize(done.result.steps));
        System.assertEquals(1, done.result.covenants.size(), 'One covenant add, one covenant result');

        ExecuteLoanModification.CovenantResult cr = done.result.covenants[0];
        System.assertNotEquals(null, cr.covenantId, 'The covenant id is the receipt');
        LLC_BI__Covenant2__c cov = [
            SELECT Id, LLC_BI__Account__c, LLC_BI__Covenant_Status__c, LLC_BI__Active__c,
                   LLC_BI__Financial_Indicator_Value__c, Acnpex_Threshold_Value__c,
                   Financial_Indicator_Operator__c, Acnpex_Operator__c, LLC_BI__Frequency__c
            FROM LLC_BI__Covenant2__c WHERE Id = :cr.covenantId
        ];
        System.assertEquals('Pending', cov.LLC_BI__Covenant_Status__c, 'Born Pending: not yet evaluated is the only honest birth state');
        System.assertEquals(true, cov.LLC_BI__Active__c);
        System.assertEquals(3.5, cov.LLC_BI__Financial_Indicator_Value__c);
        System.assertEquals(3.5, cov.Acnpex_Threshold_Value__c, 'Both threshold fields mirror, the way every covenant in this org carries them');
        System.assertEquals('Less Than or Equal To', cov.Financial_Indicator_Operator__c);
        System.assertEquals('<=', cov.Acnpex_Operator__c);
        System.assertEquals(borrower().Id, cov.LLC_BI__Account__c, 'The covenant lives on the borrower account');

        Id cloneId = (Id) done.result.cloneLoanId;
        System.assertEquals(cloneId, (Id) cr.cloneLoanId, 'The result names the clone it attached to');
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c = :cloneId AND LLC_BI__Covenant2__c = :cr.covenantId],
            'The junction sits on the CLONE');
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c = :before.Id],
            'And NEVER on the booked parent');
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Covenant_Compliance2__c WHERE LLC_BI__Covenant__c = :cr.covenantId],
            'No compliance row was minted, so no approval chain started (the probe finding, held as a permanent assertion)');

        Boolean createOk = false;
        Boolean attachOk = false;
        Boolean verifyOk = false;
        for (ExecuteLoanModification.StepResult s : done.result.steps) {
            if (s.id == 'covenant_create_0') { createOk = s.state == C360Plan.STATE_VERIFIED; }
            if (s.id == 'covenant_attach_0') { attachOk = s.state == C360Plan.STATE_VERIFIED; }
            if (s.id == 'covenant_verify_0') { verifyOk = s.state == C360Plan.STATE_VERIFIED; }
        }
        System.assertEquals(true, createOk && attachOk && verifyOk,
            'Create, attach and verify are each their own settled step: ' + JSON.serialize(done.result.steps));
    }

    @IsTest
    static void aCovenantAddWithAnUnknownTypeIsRefusedAtStageTime() {
        C360TestFixture.armCalloutMock();
        StageLoanModification.Request r = stageReq(key('badcov'));
        r.covenantAddsJson = '[{"typeName":"No Such Covenant Type","threshold":2,"operator":">="}]';

        Test.startTest();
        StageLoanModification.Response res = stage(r);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A type the catalog does not carry cannot be staged');
        System.assert(res.error.message.contains('No covenant type named'),
            'And the refusal names the catalog rule: ' + res.error.message);
        System.assertEquals(0, [SELECT COUNT() FROM cm_Action_Staging__c WHERE cm_Action_Id__c = 'loan-modification' AND cm_Idempotency_Key__c LIKE 'ZZ-MOD-badcov%'],
            'Nothing was staged');
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
    // -------------------------------------------------------------------------------------------
    // The relay leg, and its two doors.
    //
    // Page.getContent() cannot be called from a test method at all, so the session mint is reached
    // through the same kind of seam the credit-action engine uses. What is tested here is the
    // DOOR ORDER and the safety rules around it, which is the part that can be got wrong quietly.
    // -------------------------------------------------------------------------------------------

    private static final String SELF_URL =
        URL.getOrgDomainUrl().toExternalForm() + '/services/data/v61.0/actions/custom/apex/ExecuteLoanModification';
    private static final String FAKE_SID = '00DDz000001qeO2!AQEAQFAKEsessionFORtestsONLY';

    /** A session mint that works. */
    private class GoodSession implements ExecuteLoanModification.SessionSource {
        public String sessionId() {
            return FAKE_SID;
        }
    }

    /** A session mint that does not, which is the whole reason a second door exists. */
    private class DeadSession implements ExecuteLoanModification.SessionSource {
        public String sessionId() {
            throw new CalloutException('getContent is not supported in this context');
        }
    }

    /**
     * Scripts both doors independently and records what each was sent.
     *
     * It answers anything that is NEITHER door the way C360TestFixture.NoopCalloutMock does, because
     * only one mock can be armed at a time and the CDC shield still has to hold underneath.
     */
    private class DoorMock implements HttpCalloutMock {
        Integer selfStatus = 200;
        String selfBody;
        Boolean selfThrows = false;
        Integer boxStatus = 200;
        String boxBody;
        Boolean boxThrows = false;
        HttpRequest sawSelf;
        HttpRequest sawBox;

        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            if (req.getEndpoint() == SELF_URL) {
                sawSelf = req;
                if (selfThrows) {
                    throw new CalloutException('Read timed out');
                }
                r.setStatusCode(selfStatus);
                r.setBody(selfBody);
                return r;
            }
            if (req.getEndpoint() == RELAY_URL) {
                sawBox = req;
                if (boxThrows) {
                    throw new CalloutException('Unable to tunnel through proxy');
                }
                r.setStatusCode(boxStatus);
                r.setBody(boxBody);
                return r;
            }
            r.setStatusCode(200);
            r.setBody('{}');
            return r;
        }
    }

    /** What the REST Actions API puts around an invocable's own answer. */
    private static String envelope(Object outputValues, Boolean isSuccess, Object errors) {
        return JSON.serialize(new List<Object>{
            new Map<String, Object>{
                'actionName' => 'ExecuteLoanModification',
                'errors' => errors,
                'isSuccess' => isSuccess,
                'outputValues' => outputValues
            }
        });
    }

    /** A plausible inner success: enough of the real shape to prove the passthrough is faithful. */
    private static ExecuteLoanModification.Response innerSuccess(Id parentId) {
        ExecuteLoanModification.FacilityResult f = new ExecuteLoanModification.FacilityResult();
        f.facilityId = parentId;
        f.facilityName = 'LP-INNER-PARENT';
        f.cloneLoanId = C360Wave2Fixture.fakeId(LLC_BI__Loan__c.SObjectType);
        f.cloneName = 'LP-INNER-CLONE';
        f.cloneStage = 'Qualification';
        f.junctionId = C360Wave2Fixture.fakeId(LLC_BI__LoanRenewal__c.SObjectType);
        f.junctionName = 'RL-00000999';
        f.revisionNumber = 1;
        f.parentUnchanged = true;
        f.verification = 'the clone reads back with Is_Modification true';

        ExecuteLoanModification.StepResult s = new ExecuteLoanModification.StepResult();
        s.id = 'credit_action_0';
        s.type = 'write';
        s.label = 'Run the credit action';
        s.state = C360Plan.STATE_VERIFIED;
        s.detail = 'nCino created the modification facility.';

        ExecuteLoanModification.ExecuteResult r = new ExecuteLoanModification.ExecuteResult();
        r.cloneLoanId = f.cloneLoanId;
        r.recordName = f.cloneName;
        r.anchorName = f.facilityName;
        r.terminalState = C360Plan.TERMINAL_SUCCESS;
        r.facilities = new List<ExecuteLoanModification.FacilityResult>{ f };
        r.facilityCount = 1;
        r.steps = new List<ExecuteLoanModification.StepResult>{ s };
        r.replayed = false;
        r.outcome = 'Modification LP-INNER-CLONE created from LP-INNER-PARENT.';

        ExecuteLoanModification.Response answer = new ExecuteLoanModification.Response();
        answer.ok = true;
        answer.result = r;
        return answer;
    }

    /** Arms both seams and returns the mock, so each test says only what it is actually varying. */
    private static DoorMock doors(ExecuteLoanModification.SessionSource sess, Id parentId) {
        ExecuteLoanModification.sessionOverride = sess;
        DoorMock m = new DoorMock();
        m.selfBody = envelope(innerSuccess(parentId), true, null);
        m.boxBody = envelope(innerSuccess(parentId), true, null);
        Test.setMock(HttpCalloutMock.class, m);
        return m;
    }

    private static Datetime consumedAt(Id stagingId) {
        return [SELECT cm_Token_Consumed_At__c FROM cm_Action_Staging__c WHERE Id = :stagingId].cm_Token_Consumed_At__c;
    }

    @IsTest
    static void theSelfDoorCarriesTheSessionAndTheBoxIsNeverTouched() {
        C360TestFixture.armCalloutMock();
        String k = key('selfok');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        DoorMock m = doors(new GoodSession(), parent().Id);
        Integer dmlBefore = Limits.getDmlStatements();
        ExecuteLoanModification.Response done = execute(relayReq(k, staged.result));
        Integer dmlAfter = Limits.getDmlStatements();

        // The org called itself, with the session the page minted.
        System.assertNotEquals(null, m.sawSelf, 'A call without inlineExecution tries the org itself first');
        System.assertEquals('Bearer ' + FAKE_SID, m.sawSelf.getHeader('Authorization'),
            'The Visualforce session IS the credential: hosted MCP runs on a JWT that UserInfo.getSessionId cannot use');
        System.assertEquals(null, m.sawBox, 'The external relay is a fallback, not a first choice');
        System.assertEquals(PATH_SELF, done.result.relayPath, 'And the answer says which door carried it');

        // The inner leg is told to execute inline, which is also what stops it relaying again.
        Map<String, Object> sent = (Map<String, Object>) JSON.deserializeUntyped(m.sawSelf.getBody());
        Map<String, Object> input = (Map<String, Object>) ((List<Object>) sent.get('inputs'))[0];
        System.assertEquals(true, input.get('inlineExecution'), 'The recursion guard IS the inline flag on the inner call');
        System.assertEquals(staged.result.decisionToken, input.get('decisionToken'), 'The inner leg needs the token to burn it');
        System.assertEquals(k, input.get('idempotencyKey'));

        // The outer leg wrote nothing. Apex forbids DML before a callout, and a hop that never lands
        // has to be retryable.
        System.assertEquals(dmlBefore, dmlAfter, 'The relay leg performs no DML at all');
        System.assertEquals(null, consumedAt(staged.result.stagingId),
            'The OUTER leg never burns the token: the inner one does, inside the transaction that works');
        System.assertEquals(0, cloneCount(), 'And it certainly writes no facility');

        // The answer is the inner leg's answer.
        System.assertEquals(true, done.ok, 'The inner leg succeeded, so this call succeeded');
        System.assertEquals(C360Plan.TERMINAL_SUCCESS, done.result.terminalState);
        System.assertEquals(1, done.result.facilityCount);
        System.assertEquals('LP-INNER-CLONE', done.result.facilities[0].cloneName, 'Nested results survive the round trip intact');
        System.assertEquals(1, done.result.facilities[0].revisionNumber, 'Including the chain revision the banker is shown');
        System.assertEquals('credit_action_0', done.result.steps[0].id, 'And the tracker steps, which the panel renders');
    }

    @IsTest
    static void aSessionTheOrgRefusesFallsThroughToTheBoxRelay() {
        C360TestFixture.armCalloutMock();
        String k = key('self401');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        DoorMock m = doors(new GoodSession(), parent().Id);
        m.selfStatus = 401;
        m.selfBody = '[{"message":"Session expired or invalid","errorCode":"INVALID_SESSION_ID"}]';
        ExecuteLoanModification.Response done = execute(relayReq(k, staged.result));

        System.assertNotEquals(null, m.sawSelf, 'The self door is still tried first');
        System.assertNotEquals(null, m.sawBox, 'A 401 proves nothing ran, so the next door is safe to try');
        System.assertEquals(RELAY_SECRET, m.sawBox.getHeader('x-c360-relay-secret'),
            'The relay refuses anything unsigned, so an unsigned hop is a broken hop');
        System.assertEquals(true, done.ok, whyExec(done));
        System.assertEquals(PATH_BOX, done.result.relayPath, 'The answer names the door that actually carried it');
        System.assertEquals(null, consumedAt(staged.result.stagingId), 'And the outer leg still burned nothing');
    }

    @IsTest
    static void aSessionThatCannotBeMintedFallsThroughToTheBoxRelay() {
        C360TestFixture.armCalloutMock();
        String k = key('nosession');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        DoorMock m = doors(new DeadSession(), parent().Id);
        ExecuteLoanModification.Response done = execute(relayReq(k, staged.result));

        System.assertEquals(null, m.sawSelf, 'With no session there is nothing to send, so nothing is sent');
        System.assertNotEquals(null, m.sawBox, 'Which is exactly the case the box relay exists for');
        System.assertEquals(true, done.ok, whyExec(done));
        System.assertEquals(PATH_BOX, done.result.relayPath);
    }

    @IsTest
    static void aDoorThatAnswersNon200IsReportedRatherThanRetriedThroughTheOther() {
        C360TestFixture.armCalloutMock();
        String k = key('self500');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        DoorMock m = doors(new GoodSession(), parent().Id);
        m.selfStatus = 500;
        m.selfBody = '[{"message":"An unexpected error occurred","errorCode":"UNKNOWN_EXCEPTION"}]';
        ExecuteLoanModification.Response res = execute(relayReq(k, staged.result));

        System.assertEquals(null, m.sawBox,
            'A 500 landed on something that COULD have executed. Trying the other door would be a second run, not a retry');
        System.assertEquals(false, res.ok);
        System.assertEquals('ORG_UNAVAILABLE', res.error.code, 'The path failed. The org rejected nothing and neither did we');
        System.assertEquals(true, res.error.resumable, 'The token fence makes a retry safe even here');
        System.assert(res.error.orgError.contains('500'), 'The refusal carries what the door actually said: ' + res.error.orgError);
        System.assertEquals(null, consumedAt(staged.result.stagingId));
        System.assertEquals(0, cloneCount());
    }

    @IsTest
    static void bothDoorsDownLeavesTheTokenGoodForARetryAndSaysWhyEach() {
        C360TestFixture.armCalloutMock();
        String k = key('alldown');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        DoorMock m = doors(new GoodSession(), parent().Id);
        m.selfThrows = true;
        m.boxThrows = true;
        ExecuteLoanModification.Response res = execute(relayReq(k, staged.result));

        System.assertEquals(false, res.ok);
        System.assertEquals('ORG_UNAVAILABLE', res.error.code);
        System.assertEquals(true, res.error.resumable);
        System.assert(res.error.message.contains('has not been used'),
            'The banker is told plainly the confirmation still stands: ' + res.error.message);
        System.assert(res.error.orgError.contains('self:') && res.error.orgError.contains('box:'),
            'Both doors report why they did not carry it: ' + res.error.orgError);
        System.assertEquals(null, consumedAt(staged.result.stagingId), 'And the confirmation does still stand');
        System.assertEquals(0, cloneCount());
    }

    @IsTest
    static void anOrgRefusalOnTheInnerLegIsReportedAsTheOrgs() {
        C360TestFixture.armCalloutMock();
        String k = key('relayfault');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        DoorMock m = doors(new GoodSession(), parent().Id);
        m.selfBody = envelope(null, false, JSON.serialize(new List<Object>{
            new Map<String, Object>{ 'statusCode' => 'INVALID_TYPE', 'message' => 'sObject type LLC_BI__Loan__c is not supported' }
        }));
        ExecuteLoanModification.Response res = execute(relayReq(k, staged.result));

        System.assertEquals(false, res.ok, 'A 200 carrying isSuccess false is still a refusal');
        System.assertEquals('ORG_REJECTED_WRITE', res.error.code, 'The org said no, so it is reported as the org\'s');
        System.assert(res.error.orgError.contains('INVALID_TYPE'), 'With the org\'s own words: ' + res.error.orgError);
        System.assertEquals(null, m.sawBox, 'An answer is an answer: the other door is not a second opinion');
    }

    @IsTest
    static void theRelayLegRefusesABadTokenBeforeItCostsARoundTrip() {
        C360TestFixture.armCalloutMock();
        String k = key('relaybadtoken');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        DoorMock m = doors(new GoodSession(), parent().Id);
        ExecuteLoanModification.Request e = relayReq(k, staged.result);
        e.decisionToken = 'not-the-token-the-banker-was-given';
        ExecuteLoanModification.Response res = execute(e);

        System.assertEquals(false, res.ok);
        System.assertEquals('TOKEN_REFUSED', res.error.code, 'The token gate is enforced on the OUTER leg too, not only inside');
        System.assertEquals(null, m.sawSelf, 'A refused call must never reach a door');
        System.assertEquals(null, m.sawBox);
        System.assertEquals(null, consumedAt(staged.result.stagingId));
    }

    @IsTest
    static void aRelayedReplayReportsThePriorRunWithoutHopping() {
        C360TestFixture.armCalloutMock();
        ExecuteLoanModification.engineOverride = new ObservedCloneEngine();
        String k = key('relayreplay');

        Test.startTest();
        StageLoanModification.Response staged = stage(stageReq(k));
        Test.stopTest();
        System.assertEquals(true, staged.ok, whyStage(staged));

        ExecuteLoanModification.Response first = execute(execReq(k, staged.result));
        System.assertEquals(true, first.ok, 'first execute should succeed: ' + whyExec(first));
        System.assertEquals(null, first.result.relayPath, 'An inline run went through no door at all');

        DoorMock m = doors(new GoodSession(), parent().Id);
        ExecuteLoanModification.Response again = execute(relayReq(k, staged.result));

        System.assertEquals(true, again.ok, 'A replay is a successful invocation on either leg');
        System.assertEquals(true, again.result.replayed);
        System.assertEquals(first.result.cloneLoanId, again.result.cloneLoanId, 'It reports the prior clone');
        System.assertEquals(null, m.sawSelf, 'And answers it locally: a known key is not worth a round trip');
        System.assertEquals(null, m.sawBox);
        System.assertEquals(1, cloneCount(), 'One key, one modification, whichever leg asked');
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
