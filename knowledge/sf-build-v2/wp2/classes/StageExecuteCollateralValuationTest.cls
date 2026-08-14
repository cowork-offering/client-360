/**
 * StageExecuteCollateralValuationTest - the collateral-valuation pair, end to end.
 *
 * The assertion this file exists for is the rollup honesty one. A33.4.5(d) leaves it unsettled
 * whether inserting a valuation moves LLC_BI__Collateral__c, so the tool re-reads the parent and
 * reports what it finds. Either answer is acceptable; claiming a coverage improvement that did
 * not happen is not.
 */
@IsTest
private class StageExecuteCollateralValuationTest {

    /** One fixture per class, not per method: the first live run died on the time limit
        because every method re-inserted anchors and woke the managed triggers again. */
    @TestSetup
    static void makeFixture() {
        C360TestFixture.collateral(1000000);
    }

    private static StageCollateralValuation.Request req(Id collateralId, String key) {
        StageCollateralValuation.Request r = new StageCollateralValuation.Request();
        r.idempotencyKey = key;
        r.rationale = 'Fresh third-party appraisal received on the pledged inventory.';
        r.collateralId = collateralId;
        r.value = 1250000;
        r.valuationDate = Date.today();
        r.type = 'Net Orderly Liquidation Value';
        r.source = 'Third Party Source';
        r.description = 'NOLV per the July field exam.';
        r.primary = true;
        return r;
    }

    /** The tool's own refusal, so a failed assert names the cause instead of hiding it. */
    private static String why(StageCollateralValuation.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message +
            (r.error.orgError == null ? '' : ' :: org said: ' + r.error.orgError);
    }

    private static ExecuteCollateralValuation.Response executeStaged(String key, StageCollateralValuation.StageResult staged) {
        ExecuteCollateralValuation.Request ex = new ExecuteCollateralValuation.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.stagingId;
        ex.planHash = staged.planHash;
        ex.decisionToken = staged.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        return ExecuteCollateralValuation.run(new List<ExecuteCollateralValuation.Request>{ ex })[0];
    }

    @IsTest
    static void happyPathFilesOneValuationWithExplicitBooleans() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        String key = C360TestFixture.key('cv-happy');

        Test.startTest();
        StageCollateralValuation.Response staged =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ req(coll.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed: ' + (staged.error == null ? '' : staged.error.message));
        ExecuteCollateralValuation.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));

        LLC_BI__Collateral_Valuation__c v = [
            SELECT Id, LLC_BI__Collateral__c, LLC_BI__Value__c, LLC_BI__Active__c,
                   LLC_BI__Primary__c, LLC_BI__Original_Value__c, LLC_BI__Type__c, LLC_BI__Source__c
            FROM LLC_BI__Collateral_Valuation__c
            WHERE Id = :done.result.valuationId
        ];
        System.assertEquals(coll.Id, v.LLC_BI__Collateral__c);
        System.assertEquals(1250000, v.LLC_BI__Value__c);
        System.assertEquals(true, v.LLC_BI__Active__c, 'A33.4.5(a): the booleans default to false, so a revaluation sets Active explicitly');
        System.assertEquals(true, v.LLC_BI__Primary__c, 'Primary was requested and must be set explicitly');
        System.assertEquals(false, v.LLC_BI__Original_Value__c, 'A revaluation is not the original value');
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c WHERE LLC_BI__Collateral__c = :coll.Id]);

        // The cockpit stamps the activity trail from these, so a null here is a generic label.
        String orgName = [SELECT Name FROM LLC_BI__Collateral_Valuation__c WHERE Id = :done.result.valuationId].Name;
        System.assertEquals(orgName, done.result.recordName, 'recordName must carry the org-assigned valuation name');
        System.assertNotEquals(null, done.result.recordName, 'recordName must not be null on a successful execute');
        System.assertEquals(
            [SELECT Name FROM LLC_BI__Collateral__c WHERE Id = :coll.Id].Name,
            done.result.anchorName,
            'anchorName must carry the parent collateral name'
        );
    }

    @IsTest
    static void rollupOutcomeIsReportedHonestlyEitherWay() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        String key = C360TestFixture.key('cv-rollup');

        Test.startTest();
        StageCollateralValuation.Response staged =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ req(coll.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteCollateralValuation.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok);
        System.assertNotEquals(null, done.result.collateralValueMoved, 'The tool must answer the rollup question, not skip it');

        Decimal after = [SELECT LLC_BI__Value__c FROM LLC_BI__Collateral__c WHERE Id = :coll.Id].LLC_BI__Value__c;
        Boolean actuallyMoved = after != 1000000;
        System.assertEquals(actuallyMoved, done.result.collateralValueMoved, 'The reported answer must match the org');

        if (!actuallyMoved) {
            System.assert(
                done.result.outcome.contains('collateral value unchanged'),
                'A33.4.5(d): when the rollup does not fire, the terminal state says so and claims no coverage improvement. Got: ' + done.result.outcome
            );
        }
    }

    @IsTest
    static void unknownPicklistValueIsRefusedAgainstTheOrg() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        StageCollateralValuation.Request r = req(coll.Id, C360TestFixture.key('cv-badpick'));
        r.type = 'Vibes Based Estimate';

        Test.startTest();
        StageCollateralValuation.Response res =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'A33.1.6: picklist options are read from the org, never invented');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
        System.assert(res.error.message.contains('LLC_BI__Type__c'), 'The refusal should name the field: ' + res.error.message);
    }

    @IsTest
    static void negativeValueIsRefused() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        StageCollateralValuation.Request r = req(coll.Id, C360TestFixture.key('cv-negative'));
        r.value = -1;

        Test.startTest();
        StageCollateralValuation.Response res =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok);
        System.assert(res.error.message.contains('negative'), 'The refusal should say why: ' + res.error.message);
    }

    @IsTest
    static void missingCollateralIsRefused() {
        StageCollateralValuation.Request r = req(null, C360TestFixture.key('cv-nocoll'));
        r.collateralId = null;

        Test.startTest();
        StageCollateralValuation.Response res =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'collateralId is the one hard-required field on the object');
        System.assertEquals('VALIDATION_FAILED', res.error.code);
    }

    @IsTest
    static void resumeReQueriesTheTargetBeforeWriting() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        String key = C360TestFixture.key('cv-resume');

        StageCollateralValuation.Response staged =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ req(coll.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));

        // Org state moves between staging and execution: the plan's target is gone.
        delete coll;

        Test.startTest();
        ExecuteCollateralValuation.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(false, done.ok, 'A33.3.3: re-query the target state before any resumed write');
        System.assert(
            done.error.message.contains('Re-stage'),
            'A resume against moved org state is refused and the action must be re-staged. Got: ' + done.error.message
        );
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c], 'Nothing may be written when the precondition fails');
    }

    @IsTest
    static void executeReplayReportsThePriorValuationAndWritesNothing() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        String key = C360TestFixture.key('cv-replay');

        Test.startTest();
        StageCollateralValuation.Response staged =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ req(coll.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteCollateralValuation.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'first execute should succeed: ' + (first.error == null ? '' : first.error.message));

        ExecuteCollateralValuation.Response again = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, again.ok, 'A replay is a successful invocation, not a failure');
        System.assertEquals(true, again.result.replayed, 'The replay must declare itself');
        System.assertEquals(first.result.valuationId, again.result.valuationId, 'The replay reports the prior record');
        System.assertEquals(first.result.recordName, again.result.recordName, 'A replay stamps the same label the first run did');
        System.assertNotEquals(null, again.result.recordName, 'recordName must survive the replay path');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c WHERE LLC_BI__Collateral__c = :coll.Id],
            'One key, one valuation, never two.'
        );
    }

    @IsTest
    static void executeWithoutATokenIsRefused() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        String key = C360TestFixture.key('cv-notoken');

        Test.startTest();
        StageCollateralValuation.Response staged =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ req(coll.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));

        ExecuteCollateralValuation.Request ex = new ExecuteCollateralValuation.Request();
        ex.idempotencyKey = key;
        ex.stagingId = staged.result.stagingId;
        ex.planHash = staged.result.planHash;
        ex.decisionToken = null;
        ex.approverUserId = UserInfo.getUserId();
        ExecuteCollateralValuation.Response res = ExecuteCollateralValuation.run(new List<ExecuteCollateralValuation.Request>{ ex })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'No execute_* runs without a decision token');
        System.assertEquals('TOKEN_REFUSED', res.error.code);
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c], 'Nothing may be written on a refused execute');
    }

    private static LLC_BI__Collateral__c secondCollateral(Decimal value) {
        LLC_BI__Collateral_Type__c ct = new LLC_BI__Collateral_Type__c(Name = 'ZZ-BULK Type', LLC_BI__Advance_Rate__c = 60);
        insert ct;
        LLC_BI__Collateral__c c = new LLC_BI__Collateral__c(LLC_BI__Collateral_Type__c = ct.Id, LLC_BI__Value__c = value);
        insert c;
        return c;
    }

    private static StageCollateralValuation.ValuationItem item(Id collateralId, Decimal value) {
        StageCollateralValuation.ValuationItem i = new StageCollateralValuation.ValuationItem();
        i.collateralId = collateralId;
        i.value = value;
        i.valuationDate = Date.today();
        i.type = 'Net Orderly Liquidation Value';
        i.source = 'Third Party Source';
        i.primary = true;
        return i;
    }

    @IsTest
    static void singleItemFlatRequestStillWorksUnchanged() {
        LLC_BI__Collateral__c coll = C360TestFixture.existingCollateral();
        String key = C360TestFixture.key('cv-backcompat');

        Test.startTest();
        StageCollateralValuation.Response staged =
            StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ req(coll.Id, key) })[0];
        System.assertEquals(true, staged.ok, 'The old flat shape must keep working: ' + why(staged));
        ExecuteCollateralValuation.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));
        System.assertEquals(1, staged.result.itemCount, 'A flat request is one item');
        System.assertEquals(1, done.result.itemCount);
        System.assertEquals(done.result.items[0].valuationId, done.result.valuationId, 'The scalar fields still mirror item 0');
        System.assertEquals(done.result.items[0].recordName, done.result.recordName);
        System.assertEquals(1, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c WHERE LLC_BI__Collateral__c = :coll.Id]);
    }

    @IsTest
    static void bulkFilesEveryItemWithItsOwnNameAnchorAndRollupAnswer() {
        LLC_BI__Collateral__c a = C360TestFixture.existingCollateral();
        LLC_BI__Collateral__c b = secondCollateral(400000);
        String key = C360TestFixture.key('cv-bulk');

        StageCollateralValuation.Request r = new StageCollateralValuation.Request();
        r.idempotencyKey = key;
        r.rationale = 'Field exam refreshed both pledged assets.';
        r.items = new List<StageCollateralValuation.ValuationItem>{ item(a.Id, 1250000), item(b.Id, 500000) };

        Test.startTest();
        StageCollateralValuation.Response staged = StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        System.assertEquals(true, staged.ok, 'stage should succeed: ' + why(staged));
        ExecuteCollateralValuation.Response done = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));
        System.assertEquals(2, staged.result.itemCount, 'Both items planned');
        System.assertEquals(6, staged.result.steps.size(), 'Three steps per item across two items: write, verify, rollup');
        System.assertEquals(2, done.result.itemCount, 'Both items filed');

        Map<Id, ExecuteCollateralValuation.ItemResult> byCollateral = new Map<Id, ExecuteCollateralValuation.ItemResult>();
        for (ExecuteCollateralValuation.ItemResult ir : done.result.items) {
            byCollateral.put(ir.collateralId, ir);
            System.assertNotEquals(null, ir.valuationId, 'Every item gets its own valuation id');
            System.assertNotEquals(null, ir.recordName, 'Every item reports its own org-assigned name');
            System.assertNotEquals(null, ir.anchorName, 'Every item reports its own parent collateral');
            System.assertNotEquals(null, ir.collateralValueMoved, 'Every item answers the rollup question');
        }
        System.assertEquals(true, byCollateral.containsKey(a.Id));
        System.assertEquals(true, byCollateral.containsKey(b.Id));
        System.assertNotEquals(byCollateral.get(a.Id).valuationId, byCollateral.get(b.Id).valuationId, 'Distinct records');
        System.assertEquals(2, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c], 'Exactly two valuations, one per item');
    }

    @IsTest
    static void bulkStageStillWritesNoDomainRow() {
        LLC_BI__Collateral__c a = C360TestFixture.existingCollateral();
        LLC_BI__Collateral__c b = secondCollateral(400000);

        StageCollateralValuation.Request r = new StageCollateralValuation.Request();
        r.idempotencyKey = C360TestFixture.key('cv-bulkzero');
        r.rationale = 'Rationale.';
        r.items = new List<StageCollateralValuation.ValuationItem>{ item(a.Id, 1), item(b.Id, 2) };

        Test.startTest();
        StageCollateralValuation.Response res = StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(true, res.ok, why(res));
        System.assertEquals(0, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c], 'A33.0.1 is unconditional: bulk stage writes nothing either');
    }

    @IsTest
    static void oneIdempotencyKeyCoversTheWholeBatch() {
        LLC_BI__Collateral__c a = C360TestFixture.existingCollateral();
        LLC_BI__Collateral__c b = secondCollateral(400000);
        String key = C360TestFixture.key('cv-bulkidem');

        StageCollateralValuation.Request r = new StageCollateralValuation.Request();
        r.idempotencyKey = key;
        r.rationale = 'Rationale.';
        r.items = new List<StageCollateralValuation.ValuationItem>{ item(a.Id, 111), item(b.Id, 222) };

        Test.startTest();
        StageCollateralValuation.Response staged = StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        ExecuteCollateralValuation.Response first = executeStaged(key, staged.result);
        System.assertEquals(true, first.ok, 'first execute should succeed');
        ExecuteCollateralValuation.Response again = executeStaged(key, staged.result);
        Test.stopTest();

        System.assertEquals(true, again.ok, 'A replay is a successful invocation');
        System.assertEquals(true, again.result.replayed);
        System.assertEquals(2, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c], 'The batch is idempotent as a whole: never four rows');
    }

    @IsTest
    static void aDuplicateCollateralInOneBatchIsRefused() {
        LLC_BI__Collateral__c a = C360TestFixture.existingCollateral();

        StageCollateralValuation.Request r = new StageCollateralValuation.Request();
        r.idempotencyKey = C360TestFixture.key('cv-dupe');
        r.rationale = 'Rationale.';
        r.items = new List<StageCollateralValuation.ValuationItem>{ item(a.Id, 100), item(a.Id, 200) };

        Test.startTest();
        StageCollateralValuation.Response res = StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Two valuations of one collateral in a batch would race for Primary');
        System.assert(res.error.message.contains('more than once'), 'The refusal should say why: ' + res.error.message);
    }

    @IsTest
    static void mixingTheFlatShapeAndItemsIsRefused() {
        LLC_BI__Collateral__c a = C360TestFixture.existingCollateral();
        StageCollateralValuation.Request r = req(a.Id, C360TestFixture.key('cv-mixed'));
        r.items = new List<StageCollateralValuation.ValuationItem>{ item(a.Id, 100) };

        Test.startTest();
        StageCollateralValuation.Response res = StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok, 'Two shapes in one request is two intentions and we should not guess');
        System.assert(res.error.message.contains('not both'), 'The refusal should say why: ' + res.error.message);
    }

    @IsTest
    static void aBadItemNamesItsPositionInTheBatch() {
        LLC_BI__Collateral__c a = C360TestFixture.existingCollateral();
        LLC_BI__Collateral__c b = secondCollateral(400000);

        StageCollateralValuation.ValuationItem bad = item(b.Id, -5);
        StageCollateralValuation.Request r = new StageCollateralValuation.Request();
        r.idempotencyKey = C360TestFixture.key('cv-baditem');
        r.rationale = 'Rationale.';
        r.items = new List<StageCollateralValuation.ValuationItem>{ item(a.Id, 100), bad };

        Test.startTest();
        StageCollateralValuation.Response res = StageCollateralValuation.stage(new List<StageCollateralValuation.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(false, res.ok);
        System.assert(res.error.message.contains('item 2 of 2'),
            'A batch refusal must name WHICH item is wrong or the banker cannot fix it: ' + res.error.message);
    }
}
