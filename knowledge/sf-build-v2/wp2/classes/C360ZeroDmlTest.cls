/**
 * C360ZeroDmlTest - the single most important test in this package (BUILD-BRIEF-V2 WP2
 * criterion 1).
 *
 * A33.0.1 draws the boundary at DML TIMING, not at tool naming: stage_* performs ZERO
 * domain-object DML, ever. This test proves it rather than asserting it. It counts every row on
 * the three write targets, runs all three stage_* tools, and counts again. Zero new rows.
 *
 * It also checks criterion 2: no stage_* output carries a record id, because no record was
 * created.
 */
@IsTest
private class C360ZeroDmlTest {

    /** One fixture per class, not per method: the first live run died on the time limit
        because every method re-inserted anchors and woke the managed triggers again. */
    @TestSetup
    static void makeFixture() {
        C360TestFixture.account();
        C360TestFixture.collateral(1000000);
    }

    @IsTest
    static void stageToolsWriteNoDomainRow() {
        Account acct = C360TestFixture.existingAccount();
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();

        Map<String, Integer> before = C360TestFixture.domainRowCounts();

        Test.startTest();

        StageCollateralValuation.Request cv = new StageCollateralValuation.Request();
        cv.idempotencyKey = C360TestFixture.key('zerodml-cv');
        cv.rationale = 'Annual revaluation of pledged inventory.';
        cv.collateralId = coll.Id;
        cv.value = 1250000;
        cv.primary = true;
        List<StageCollateralValuation.Response> cvOut =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ cv });

        StageServiceRequest.Request sr = new StageServiceRequest.Request();
        sr.idempotencyKey = C360TestFixture.key('zerodml-sr');
        sr.accountId = acct.Id;
        sr.rationale = 'Client asked for a wire template change.';
        sr.requestType = 'Wire template change';
        sr.summary = 'Client requested an update to the standing wire template.';
        List<StageServiceRequest.Response> srOut =
            StageServiceRequest.stage(new List<StageServiceRequest.Request>{ sr });

        StageAnnualReview.Request ar = new StageAnnualReview.Request();
        ar.idempotencyKey = C360TestFixture.key('zerodml-ar');
        ar.accountId = acct.Id;
        ar.rationale = 'Scheduled annual review.';
        ar.reviewType = 'Annual';
        ar.narrative = 'Relationship performing in line with expectations.';
        List<StageAnnualReview.Response> arOut =
            StageAnnualReview.stage(new List<StageAnnualReview.Request>{ ar });

        Test.stopTest();

        System.assertEquals(true, cvOut[0].ok, 'stage_collateral_valuation should succeed: ' + describe(cvOut[0].error));
        System.assertEquals(true, srOut[0].ok, 'stage_service_request should succeed: ' + describe(srOut[0].error));
        System.assertEquals(true, arOut[0].ok, 'stage_annual_review should succeed: ' + describe(arOut[0].error));

        Map<String, Integer> after = C360TestFixture.domainRowCounts();
        for (String obj : before.keySet()) {
            System.assertEquals(
                before.get(obj),
                after.get(obj),
                'stage_* wrote a row to ' + obj + '. A33.0.1: stage_* performs ZERO domain-object DML, ever.'
            );
        }
    }

    @IsTest
    static void stageOutputCarriesNoRecordId() {
        Account acct = C360TestFixture.existingAccount();

        StageServiceRequest.Request sr = new StageServiceRequest.Request();
        sr.idempotencyKey = C360TestFixture.key('norecid');
        sr.accountId = acct.Id;
        sr.rationale = 'Rationale.';
        sr.requestType = 'Statement copy';
        sr.summary = 'Client asked for a duplicate statement.';

        Test.startTest();
        StageServiceRequest.Response res = StageServiceRequest.stage(new List<StageServiceRequest.Request>{ sr })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + (res.error == null ? '(none)' : res.error.code + ' :: ' + res.error.message));
        String serialized = JSON.serialize(res.result);
        System.assertEquals(
            false,
            serialized.contains('caseId'),
            'A33.5.3: no stage_* output contains a record id, because stage_* created no record.'
        );
        System.assertNotEquals(null, res.result.stagingId, 'A staging handle is expected');
        System.assertNotEquals(null, res.result.planHash, 'A plan hash is expected');
        System.assertNotEquals(null, res.result.decisionToken, 'A freshly minted token is expected');
    }

    @IsTest
    static void plannedStepsAreTypedAndOrdered() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();

        StageCollateralValuation.Request cv = new StageCollateralValuation.Request();
        cv.idempotencyKey = C360TestFixture.key('steps');
        cv.rationale = 'Rationale.';
        cv.collateralId = coll.Id;
        cv.value = 600000;

        Test.startTest();
        StageCollateralValuation.Response res =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ cv })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, 'stage should succeed, got ' + (res.error == null ? '(none)' : res.error.code + ' :: ' + res.error.message));
        System.assertEquals(3, res.result.steps.size(), 'The valuation plan is write, verify, verify rollup');
        System.assertEquals(C360Plan.TYPE_WRITE, res.result.steps[0].type);
        System.assertEquals(C360Plan.TYPE_VERIFICATION, res.result.steps[1].type);
        // Step ids are namespaced per item now that the action takes a batch: item 0 is the
        // single-item back-compat path, so its rollup step is verify_rollup_0.
        System.assertEquals('verify_rollup_0', res.result.steps[2].id, 'A33.4.5(d) requires the collateral rollup verification step');
        for (StageCollateralValuation.PlanStep s : res.result.steps) {
            System.assertEquals(C360Plan.STATE_PENDING, s.state, 'Every staged step starts pending: nothing has run');
        }
    }

    private static String describe(StageCollateralValuation.ToolError e) {
        return e == null ? '(no error)' : e.code + ': ' + e.message;
    }

    private static String describe(StageServiceRequest.ToolError e) {
        return e == null ? '(no error)' : e.code + ': ' + e.message;
    }

    private static String describe(StageAnnualReview.ToolError e) {
        return e == null ? '(no error)' : e.code + ': ' + e.message;
    }
}
