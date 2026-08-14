/**
 * StageHeldCreditActionsTest - the two stage-only credit actions.
 *
 * These tools plan and never execute. The point of this file is to prove the HELD state is a real,
 * inspectable output rather than a comment: every plan carries executionHeld true, a held reason
 * naming Loan_Validation_06, and a terminal handoff step. No execute class exists for either
 * action, which is the strongest guarantee available that nothing runs.
 *
 * It also carries the package-anchored selection contract, which both tools share through
 * C360Facilities: flat loanId XOR facilityIds, mixing refused, an explicitly empty list refused,
 * duplicates refused, a facility on another package refused, and N facilities producing ONE plan
 * with ONE hash and ONE token. The requiredness of the facility input is asserted here BECAUSE it
 * moved out of required=true and into Apex (lesson 16aa): required=true is applied by the Actions
 * API before Apex runs, so an either-or input cannot be expressed with it and no unit test can see
 * it. What a test CAN prove is that Apex refuses the empty request itself, which is what these
 * assertions are for.
 */
@IsTest
private class StageHeldCreditActionsTest {

    @TestSetup
    static void makeFixture() {
        Account a = C360Wave2Fixture.account();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.productPackage(a.Id);
        C360Wave2Fixture.loan(a.Id, p.Id);
    }

    private static String whyMod(StageLoanModification.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static String whyRen(StageRenewal.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static StageLoanModification.Request modReq(String key) {
        LLC_BI__Loan__c l = C360Wave2Fixture.existingLoan();
        StageLoanModification.Request r = new StageLoanModification.Request();
        r.idempotencyKey = key;
        r.productPackageId = C360Wave2Fixture.existingPackage().Id;
        r.loanId = l.Id;
        r.rationale = 'Client asked to increase the revolver.';
        r.requestedAmount = 13000000;
        return r;
    }

    private static StageRenewal.Request renReq(String key) {
        LLC_BI__Loan__c l = C360Wave2Fixture.existingLoan();
        StageRenewal.Request r = new StageRenewal.Request();
        r.idempotencyKey = key;
        r.productPackageId = C360Wave2Fixture.existingPackage().Id;
        r.loanId = l.Id;
        r.rationale = 'Facility approaching maturity.';
        r.newMaturityDate = Date.today().addYears(1);
        return r;
    }

    private static StageLoanModification.Response stageMod(StageLoanModification.Request r) {
        return StageLoanModification.stage(new List<StageLoanModification.Request>{ r })[0];
    }

    private static StageRenewal.Response stageRen(StageRenewal.Request r) {
        return StageRenewal.stage(new List<StageRenewal.Request>{ r })[0];
    }

    @IsTest
    static void modificationRefusesANonBookedFacilityWithBankerCopy() {
        LLC_BI__Loan__c l = C360Wave2Fixture.existingLoan();

        Test.startTest();
        StageLoanModification.Response res = stageMod(modReq(C360Wave2Fixture.key('mod-notbooked')));
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Staging a plan the org can never execute is dishonest staging');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assert(res.error.message.startsWith('Modifications apply to booked facilities.'),
            'The banker copy must name the rule: ' + res.error.message);
        System.assert(res.error.message.contains(l.Name), 'The copy must name the facility: ' + res.error.message);
        System.assert(res.error.message.contains('Qualification'), 'The copy must name the stage it is actually in: ' + res.error.message);
    }

    @IsTest
    static void renewalRefusesANonBookedFacilityWithBankerCopy() {
        LLC_BI__Loan__c l = C360Wave2Fixture.existingLoan();

        Test.startTest();
        StageRenewal.Response res = stageRen(renReq(C360Wave2Fixture.key('ren-notbooked')));
        Test.stopTest();

        System.assertEquals(false, res.ok);
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assert(res.error.message.startsWith('Renewals apply to booked facilities.'),
            'The banker copy must name the rule: ' + res.error.message);
        System.assert(res.error.message.contains(l.Name));
    }

    @IsTest
    static void aRefusedPlanWritesNothingAndStagesNothing() {
        Map<String, Integer> before = C360Wave2Fixture.domainRowCounts();
        Integer junctionsBefore = [SELECT COUNT() FROM LLC_BI__LoanRenewal__c];
        Integer stagingBefore = [SELECT COUNT() FROM cm_Action_Staging__c];

        Test.startTest();
        StageLoanModification.Response m = stageMod(modReq(C360Wave2Fixture.key('mod-zero')));
        StageRenewal.Response r = stageRen(renReq(C360Wave2Fixture.key('ren-zero')));
        Test.stopTest();

        System.assertEquals(false, m.ok);
        System.assertEquals(false, r.ok);
        Map<String, Integer> after = C360Wave2Fixture.domainRowCounts();
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'A refused stage wrote a row to ' + obj);
        }
        System.assertEquals(junctionsBefore, [SELECT COUNT() FROM LLC_BI__LoanRenewal__c]);
        System.assertEquals(stagingBefore, [SELECT COUNT() FROM cm_Action_Staging__c],
            'A refused stage does not even leave a staging row behind');
    }

    // NOTE ON WHAT IS NOT TESTED HERE, AND WHY.
    // A REAL booked facility is unreachable from a unit test. Staging requires Booked + Open, and
    // Booked is unreachable through the API: LV05 and LV06 refuse it with no permission bypass, and
    // the only route is nCino's Submit for Approval with real approvers. So the plan-shape
    // assertions below run against facilities injected through the tools' test seam, and the wire
    // path still refuses every real unbooked facility. Contriving a fake booked loan IN THE ORG to
    // colour in coverage would test our mock, not the org.

    @IsTest
    static void modificationNeedsAtLeastOneRequestedChange() {
        StageLoanModification.Request r = modReq(C360Wave2Fixture.key('mod-nochange'));
        r.requestedAmount = null;

        Test.startTest();
        StageLoanModification.Response res = stageMod(r);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A modification with nothing to modify is refused');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
    }

    @IsTest
    static void renewalNeedsAMaturityDate() {
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-nodate'));
        r.newMaturityDate = null;

        Test.startTest();
        StageRenewal.Response res = stageRen(r);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A renewal is maturity-driven');
        System.assert(res.error.message.contains('maturity'), 'The refusal should say why: ' + res.error.message);
    }

    @IsTest
    static void noExecuteClassExistsForEitherAction() {
        // The strongest available guarantee that these actions cannot run: the Apex classes that
        // would run them are not in the org at all.
        Set<String> deployed = new Set<String>();
        for (ApexClass c : [SELECT Name FROM ApexClass WHERE Name IN ('ExecuteLoanModification', 'ExecuteRenewal')]) {
            deployed.add(c.Name);
        }
        System.assertEquals(0, deployed.size(), 'No execute class ships for a held credit action. Found: ' + deployed);
    }

    /**
     * Injects booked facilities on the fixture package through the stage tools' testability seam.
     *
     * Booked is unreachable through the API (LV05/LV06, no bypass, only nCino's Submit for Approval
     * with real approvers), so a fixture cannot produce a stageable facility and the plan-building
     * body was untestable. Same precedent as ExecuteCovenantReview's seam: inject what the org will
     * not let a test create, and leave the wire path refusing real unbooked facilities.
     *
     * The FIRST injected facility is the real fixture loan, so the flat single-facility path stages
     * against a genuine record id. Any further ones carry synthetic ids, which never reach SOQL:
     * the seam answers the read.
     *
     * @param count How many booked facilities to inject.
     * @return Their ids, in order.
     */
    private static List<Id> installBookedFacilities(Integer count) {
        Id accountId = C360Wave2Fixture.existingAccount().Id;
        Id packageId = C360Wave2Fixture.existingPackage().Id;
        List<LLC_BI__Loan__c> booked = new List<LLC_BI__Loan__c>();
        List<Id> ids = new List<Id>();

        for (Integer i = 0; i < count; i++) {
            Id fid = i == 0 ? C360Wave2Fixture.existingLoan().Id : C360Wave2Fixture.fakeId(LLC_BI__Loan__c.SObjectType);
            booked.add(new LLC_BI__Loan__c(
                Id = fid,
                Name = 'ZZ-W2-TEST Facility ' + (i + 1),
                LLC_BI__Stage__c = 'Booked',
                LLC_BI__Status__c = 'Open',
                LLC_BI__lookupKey__c = 'LP99' + i,
                LLC_BI__Account__c = accountId,
                LLC_BI__Product_Package__c = packageId,
                LLC_BI__Amount__c = 500000,
                LLC_BI__Is_Modification__c = false,
                LLC_BI__isRenewal__c = false
            ));
            ids.add(fid);
        }

        StageLoanModification.seamFacilities = booked;
        StageRenewal.seamFacilities = booked;
        return ids;
    }

    @IsTest
    static void modificationPlanOnABookedFacilityIsHeldAndSaysWhy() {
        installBookedFacilities(1);

        Test.startTest();
        StageLoanModification.Response res = stageMod(modReq(C360Wave2Fixture.key('mod-booked')));
        Test.stopTest();

        System.assertEquals(true, res.ok, 'A booked facility stages, got ' + whyMod(res));
        System.assertEquals(true, res.result.executionHeld, 'Execution is held in this wave');
        System.assert(res.result.heldReason.contains('Booked'), 'The held reason names the blocking state: ' + res.result.heldReason);
        System.assert(res.result.heldReason.contains('Loan_Validation_06'), 'And the rule with no bypass: ' + res.result.heldReason);
        System.assertEquals(C360Plan.TYPE_HANDOFF, res.result.steps[res.result.steps.size() - 1].type,
            'The plan ends in a handoff descriptor, not a write');
        System.assertNotEquals(null, res.result.covenantCarryoverCount,
            'An empty carryover list is a real answer and must be reported as zero');
    }

    @IsTest
    static void renewalPlanOnABookedFacilitySurfacesTheOpportunitySideEffect() {
        installBookedFacilities(1);

        Test.startTest();
        StageRenewal.Response res = stageRen(renReq(C360Wave2Fixture.key('ren-booked')));
        Test.stopTest();

        System.assertEquals(true, res.ok, 'A booked facility stages, got ' + whyRen(res));
        System.assertEquals(true, res.result.executionHeld);
        Boolean sawOpportunity = false;
        for (String w : res.result.warnings) {
            if (w.contains('Opportunity')) { sawOpportunity = true; }
        }
        System.assertEquals(true, sawOpportunity, 'A renewal auto-creates an Opportunity and the banker must be told before confirming');
    }

    @IsTest
    static void bookedPlansStillWriteNoDomainRow() {
        List<Id> ids = installBookedFacilities(3);
        Map<String, Integer> before = C360Wave2Fixture.domainRowCounts();
        Integer junctionsBefore = [SELECT COUNT() FROM LLC_BI__LoanRenewal__c];

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-bzero'));
        m.loanId = null;
        m.facilityIds = ids;
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-bzero'));
        r.loanId = null;
        r.facilityIds = ids;

        Test.startTest();
        StageLoanModification.Response mr = stageMod(m);
        StageRenewal.Response rr = stageRen(r);
        Test.stopTest();

        System.assertEquals(true, mr.ok, whyMod(mr));
        System.assertEquals(true, rr.ok, whyRen(rr));
        Map<String, Integer> after = C360Wave2Fixture.domainRowCounts();
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'A stage tool wrote a row to ' + obj);
        }
        System.assertEquals(junctionsBefore, [SELECT COUNT() FROM LLC_BI__LoanRenewal__c], 'No chain junction row from a stage tool');
    }

    // ---------------------------------------------------------------------------------------
    // Package-anchored selection: one shape per call, N facilities, one plan.
    // ---------------------------------------------------------------------------------------

    @IsTest
    static void bothToolsRefuseTheTwoInputShapesTogether() {
        List<Id> ids = installBookedFacilities(2);

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-mixed'));
        m.facilityIds = ids;
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-mixed'));
        r.facilityIds = ids;

        Test.startTest();
        StageLoanModification.Response mr = stageMod(m);
        StageRenewal.Response rr = stageRen(r);
        Test.stopTest();

        System.assertEquals(false, mr.ok, 'loanId and facilityIds together is two intentions, not a merge');
        System.assertEquals('VALIDATION_FAILED', mr.error.code);
        System.assert(mr.error.message.startsWith('Supply either the single loanId or facilityIds, but not both.'),
            'The refusal must say which two shapes collided: ' + mr.error.message);
        System.assertEquals(false, rr.ok);
        System.assert(rr.error.message.contains('not both'), rr.error.message);
        System.assertEquals(0, [SELECT COUNT() FROM cm_Action_Staging__c], 'A refused selection stages nothing');
    }

    @IsTest
    static void bothToolsRefuseAnEmptyFacilityList() {
        installBookedFacilities(1);

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-empty'));
        m.loanId = null;
        m.facilityIds = new List<Id>();
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-empty'));
        r.loanId = null;
        r.facilityIds = new List<Id>();

        Test.startTest();
        StageLoanModification.Response mr = stageMod(m);
        StageRenewal.Response rr = stageRen(r);
        Test.stopTest();

        System.assertEquals(false, mr.ok, 'An empty selection is refused, never read as "all facilities"');
        System.assert(mr.error.message.startsWith('facilityIds is empty.'), mr.error.message);
        System.assert(mr.error.message.contains('modification'), 'The copy names the action: ' + mr.error.message);
        System.assertEquals(false, rr.ok);
        System.assert(rr.error.message.startsWith('facilityIds is empty.'), rr.error.message);
        System.assert(rr.error.message.contains('renewal'), 'The copy names the action: ' + rr.error.message);
    }

    @IsTest
    static void bothToolsRefuseARequestWithNoFacilityAtAll() {
        // This is the assertion that replaces required=true on loanId (lesson 16aa). The platform
        // can no longer enforce it, because either shape is valid, so Apex must.
        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-nofacility'));
        m.loanId = null;
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-nofacility'));
        r.loanId = null;

        Test.startTest();
        StageLoanModification.Response mr = stageMod(m);
        StageRenewal.Response rr = stageRen(r);
        Test.stopTest();

        System.assertEquals(false, mr.ok, 'A credit action needs a facility, and nothing else enforces it now');
        System.assertEquals('VALIDATION_FAILED', mr.error.code);
        System.assert(mr.error.message.startsWith('No facility supplied.'), mr.error.message);
        System.assertEquals(false, rr.ok);
        System.assert(rr.error.message.startsWith('No facility supplied.'), rr.error.message);
    }

    @IsTest
    static void bothToolsRefuseADuplicateFacility() {
        List<Id> ids = installBookedFacilities(2);
        List<Id> withDupe = new List<Id>{ ids[0], ids[1], ids[0] };

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-dupe'));
        m.loanId = null;
        m.facilityIds = withDupe;
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-dupe'));
        r.loanId = null;
        r.facilityIds = withDupe;

        Test.startTest();
        StageLoanModification.Response mr = stageMod(m);
        StageRenewal.Response rr = stageRen(r);
        Test.stopTest();

        System.assertEquals(false, mr.ok, 'Two credit actions on one facility in one plan is refused');
        System.assert(mr.error.message.contains('is named more than once'), mr.error.message);
        System.assert(mr.error.message.contains('(facility 3 of 3)'),
            'The refusal must locate the duplicate: ' + mr.error.message);
        System.assertEquals(false, rr.ok);
        System.assert(rr.error.message.contains('is named more than once'), rr.error.message);
    }

    @IsTest
    static void bothToolsRefuseAFacilityFromAnotherPackage() {
        List<Id> ids = installBookedFacilities(2);
        Id foreignPackage = C360Wave2Fixture.fakeId(LLC_BI__Product_Package__c.SObjectType);
        // Both tools were handed the same injected list, so this moves the facility for both.
        StageLoanModification.seamFacilities[1].LLC_BI__Product_Package__c = foreignPackage;

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-otherpkg'));
        m.loanId = null;
        m.facilityIds = ids;
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-otherpkg'));
        r.loanId = null;
        r.facilityIds = ids;

        Test.startTest();
        StageLoanModification.Response mr = stageMod(m);
        StageRenewal.Response rr = stageRen(r);
        Test.stopTest();

        System.assertEquals(false, mr.ok, 'The package is the anchor, so a non-member facility is refused');
        System.assertEquals('VALIDATION_FAILED', mr.error.code);
        System.assert(mr.error.message.contains('is not on product package'), mr.error.message);
        System.assert(mr.error.message.contains('(facility 2 of 2)'),
            'The refusal must locate the offending facility: ' + mr.error.message);
        System.assert(mr.error.message.contains(String.valueOf(foreignPackage)),
            'And say where it actually belongs: ' + mr.error.message);
        System.assertEquals(false, rr.ok);
        System.assert(rr.error.message.contains('is not on product package'), rr.error.message);
        System.assertEquals(0, [SELECT COUNT() FROM cm_Action_Staging__c], 'A refused selection stages nothing');
    }

    @IsTest
    static void bothToolsRefuseAFacilityTheyCannotSee() {
        installBookedFacilities(1);
        List<Id> unknown = new List<Id>{ C360Wave2Fixture.fakeId(LLC_BI__Loan__c.SObjectType) };

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-unknown'));
        m.loanId = null;
        m.facilityIds = unknown;
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-unknown'));
        r.loanId = null;
        r.facilityIds = unknown;

        Test.startTest();
        StageLoanModification.Response mr = stageMod(m);
        StageRenewal.Response rr = stageRen(r);
        Test.stopTest();

        System.assertEquals(false, mr.ok);
        System.assert(mr.error.message.contains('was not found, or is not visible to you'), mr.error.message);
        System.assertEquals(false, rr.ok);
        System.assert(rr.error.message.contains('was not found, or is not visible to you'), rr.error.message);
    }

    @IsTest
    static void bothToolsRefuseAnIdThatIsNotAFacilityOrNotAPackage() {
        installBookedFacilities(1);

        StageLoanModification.Request wrongFacility = modReq(C360Wave2Fixture.key('mod-wrongtype'));
        wrongFacility.loanId = null;
        wrongFacility.facilityIds = new List<Id>{ C360Wave2Fixture.existingAccount().Id };

        StageRenewal.Request wrongAnchor = renReq(C360Wave2Fixture.key('ren-wronganchor'));
        wrongAnchor.productPackageId = C360Wave2Fixture.existingAccount().Id;

        Test.startTest();
        StageLoanModification.Response fr = stageMod(wrongFacility);
        StageRenewal.Response ar = stageRen(wrongAnchor);
        Test.stopTest();

        System.assertEquals(false, fr.ok, 'An id of the wrong object never reaches SOQL');
        System.assert(fr.error.message.contains('is not a facility id'), fr.error.message);
        System.assertEquals(false, ar.ok, 'The anchor must be a product package');
        System.assert(ar.error.message.contains('is not a product package id'), ar.error.message);
    }

    @IsTest
    static void modificationStagesThreeFacilitiesAsOnePlanWithOneToken() {
        List<Id> ids = installBookedFacilities(3);
        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-three'));
        m.loanId = null;
        m.facilityIds = ids;

        Test.startTest();
        StageLoanModification.Response res = stageMod(m);
        Test.stopTest();

        System.assertEquals(true, res.ok, whyMod(res));
        System.assertEquals(3, res.result.facilityCount, 'Every selected facility is planned');
        System.assertEquals(3, res.result.facilities.size());
        System.assertEquals(1, [SELECT COUNT() FROM cm_Action_Staging__c], 'One call is one staging row');
        System.assertNotEquals(null, res.result.decisionToken, 'One batch, one single-use token');
        System.assertNotEquals(null, res.result.planHash);
        System.assertEquals(true, res.result.executionHeld);
        System.assertEquals(String.valueOf(C360Wave2Fixture.existingPackage().Id), res.result.productPackageId,
            'The plan is anchored on the package it was given');

        // Three per-facility steps each, then the shared observed and handoff descriptors.
        System.assertEquals(3 * 3 + 2, res.result.steps.size(), 'Per-facility typed steps, not one shared write');
        System.assertEquals(C360Plan.TYPE_HANDOFF, res.result.steps[res.result.steps.size() - 1].type);
        for (Integer i = 0; i < 3; i++) {
            StageLoanModification.PlannedFacility pf = res.result.facilities[i];
            System.assertEquals(String.valueOf(ids[i]), pf.facilityId, 'Facility order is the caller order');
            System.assertEquals('credit_action_' + i, pf.creditActionStepId);
            System.assertEquals('verify_clone_' + i, pf.verifyStepId);
            System.assertEquals('apply_changes_' + i, pf.applyStepId);
            System.assertNotEquals(null, pf.covenantCarryoverCount, 'Zero carryover is a real answer');
            System.assertNotEquals(null, pf.facilityName, 'The banker sees which facility each step belongs to');
        }

        Boolean sawBatchWarning = false;
        for (String w : res.result.warnings) {
            if (w.contains('one plan over 3 facilities')) { sawBatchWarning = true; }
        }
        System.assertEquals(true, sawBatchWarning,
            'The banker is told this is one confirmation over several facilities: ' + res.result.warnings);
    }

    @IsTest
    static void renewalStagesThreeFacilitiesAsOnePlanWithOneToken() {
        List<Id> ids = installBookedFacilities(3);
        StageRenewal.Request r = renReq(C360Wave2Fixture.key('ren-three'));
        r.loanId = null;
        r.facilityIds = ids;

        Test.startTest();
        StageRenewal.Response res = stageRen(r);
        Test.stopTest();

        System.assertEquals(true, res.ok, whyRen(res));
        System.assertEquals(3, res.result.facilityCount);
        System.assertEquals(1, [SELECT COUNT() FROM cm_Action_Staging__c], 'One call is one staging row');
        System.assertNotEquals(null, res.result.decisionToken);
        System.assertEquals(3 * 3 + 2, res.result.steps.size());
        System.assertEquals(C360Plan.TYPE_HANDOFF, res.result.steps[res.result.steps.size() - 1].type);

        Boolean sawThreeOpportunities = false;
        for (String w : res.result.warnings) {
            if (w.contains('would produce 3 of them')) { sawThreeOpportunities = true; }
        }
        System.assertEquals(true, sawThreeOpportunities,
            'Three renewals auto-create three Opportunities, and the banker is told the count: ' + res.result.warnings);
    }

    @IsTest
    static void theFlatLoanIdStillStagesASingleFacilityPlan() {
        installBookedFacilities(1);

        Test.startTest();
        StageLoanModification.Response mr = stageMod(modReq(C360Wave2Fixture.key('mod-compat')));
        StageRenewal.Response rr = stageRen(renReq(C360Wave2Fixture.key('ren-compat')));
        Test.stopTest();

        System.assertEquals(true, mr.ok, 'The pre-facilityIds shape still works unchanged: ' + whyMod(mr));
        System.assertEquals(1, mr.result.facilityCount);
        System.assertEquals(String.valueOf(C360Wave2Fixture.existingLoan().Id), mr.result.facilities[0].facilityId);
        System.assertEquals(1 * 3 + 2, mr.result.steps.size());
        System.assertEquals(true, rr.ok, whyRen(rr));
        System.assertEquals(1, rr.result.facilityCount);
        System.assertEquals(2, [SELECT COUNT() FROM cm_Action_Staging__c], 'One staging row per call, on either shape');
    }

    @IsTest
    static void idInputsFailClosedRatherThanReachingSoql() {
        installBookedFacilities(1);

        StageLoanModification.Request badAnchor = modReq(C360Wave2Fixture.key('mod-badanchor'));
        badAnchor.productPackageId = 'not-an-id';

        StageLoanModification.Request badLoan = modReq(C360Wave2Fixture.key('mod-badloan'));
        badLoan.loanId = 'not-an-id';

        StageRenewal.Request wrongObjectLoan = renReq(C360Wave2Fixture.key('ren-wrongobjectloan'));
        wrongObjectLoan.loanId = C360Wave2Fixture.existingAccount().Id;

        Test.startTest();
        StageLoanModification.Response ar = stageMod(badAnchor);
        StageLoanModification.Response lr = stageMod(badLoan);
        StageRenewal.Response wr = stageRen(wrongObjectLoan);
        Test.stopTest();

        System.assertEquals(false, ar.ok);
        System.assert(ar.error.message.contains('is not a record id'), ar.error.message);
        System.assertEquals(false, lr.ok);
        System.assert(lr.error.message.startsWith('loanId not-an-id is not a record id'), lr.error.message);
        System.assertEquals(false, wr.ok);
        System.assert(wr.error.message.endsWith('is not a facility id.'), wr.error.message);
    }

    @IsTest
    static void facilityIdsRefusesAnEmptyEntryInTheList() {
        List<Id> ids = installBookedFacilities(2);
        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-nullentry'));
        m.loanId = null;
        m.facilityIds = new List<Id>{ ids[0], null };

        Test.startTest();
        StageLoanModification.Response res = stageMod(m);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A hole in the selection is refused, not skipped');
        System.assert(res.error.message.contains('carries an empty entry (facility 2 of 2)'), res.error.message);
    }

    @IsTest
    static void aFacilityOnNoPackageAtAllSaysSo() {
        List<Id> ids = installBookedFacilities(1);
        StageLoanModification.seamFacilities[0].LLC_BI__Product_Package__c = null;

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-nopkg'));
        m.loanId = null;
        m.facilityIds = ids;

        Test.startTest();
        StageLoanModification.Response res = stageMod(m);
        Test.stopTest();

        System.assertEquals(false, res.ok);
        System.assert(res.error.message.contains('This facility is on no package at all.'),
            'An absent package is a different fact from a different package: ' + res.error.message);
    }

    @IsTest
    static void aFacilityFlaggedBothWaysIsRefusedBeforeTheOrgRefusesIt() {
        List<Id> ids = installBookedFacilities(1);
        StageLoanModification.seamFacilities[0].LLC_BI__Is_Modification__c = true;
        StageLoanModification.seamFacilities[0].LLC_BI__isRenewal__c = true;

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-bothflags'));
        m.loanId = null;
        m.facilityIds = ids;

        Test.startTest();
        StageLoanModification.Response res = stageMod(m);
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Cannot_Check_More_Than_One_Loan_Type has no bypass');
        System.assert(res.error.message.contains('A facility can be renewed or modified, not both.'), res.error.message);
    }

    @IsTest
    static void aMissingCoreKeyIsSurfacedRatherThanRefused() {
        // The third leg of nCino's valid-facility rule. A booked facility with no core lookup key is
        // a core-sync data issue, not a banker error, so it warns and still stages.
        List<Id> ids = installBookedFacilities(2);
        StageLoanModification.seamFacilities[1].LLC_BI__lookupKey__c = null;

        StageLoanModification.Request m = modReq(C360Wave2Fixture.key('mod-nokey'));
        m.loanId = null;
        m.facilityIds = ids;

        Test.startTest();
        StageLoanModification.Response res = stageMod(m);
        Test.stopTest();

        System.assertEquals(true, res.ok, 'A missing core key does not refuse the plan: ' + whyMod(res));
        Boolean sawKeyWarning = false;
        for (String w : res.result.warnings) {
            if (w.contains('no core lookup key')) { sawKeyWarning = true; }
        }
        System.assertEquals(true, sawKeyWarning, 'The banker is told which facility is missing it: ' + res.result.warnings);
    }

    // NOTE ON THE ONE REMAINING UNCOVERED BRANCH IN C360Facilities.
    // covenantCarryover's aggregate loop body only runs when a selected facility actually carries
    // LLC_BI__Loan_Covenant__c rows. Building that fixture means inserting a covenant chain purely
    // to colour in two lines, which is the padding lesson 16c warns about, and Loan-shaped fixture
    // DML is what killed the first live suite run on time (lesson 7). The zero-carryover answer IS
    // asserted above, and the non-zero path is exercised by the org's real relationships.
}
