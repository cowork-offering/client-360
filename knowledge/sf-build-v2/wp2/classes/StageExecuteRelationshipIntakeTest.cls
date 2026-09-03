/**
 * StageExecuteRelationshipIntakeTest - the relationship-intake pair, end to end.
 *
 * Three assertions this file exists for, in order of how much they matter.
 *
 *   1. WHAT LANDS. A covenant with its relationship junction, an asset with its ownership junction
 *      and its opening valuation, all anchored on the borrower and read back out of the org rather
 *      than trusted from the insert result.
 *   2. WHAT DOES NOT LAND. No loan junction beside the covenant, no pledge beside the asset. That
 *      absence is the whole difference between this arm and the modification arm, so it is asserted
 *      directly rather than inferred from the fact that no code writes one.
 *   3. WHAT THE FENCE REFUSES. A compliance row and a loan junction, refused by calling the same
 *      guard entry point the tool calls. And the same loan junction still ACCEPTED under the plain
 *      object gate, which proves the per-tool fence subtracts and never changes what the
 *      modification arm may do.
 *
 * One fixture per class, not per method: every DML in this org flushes a change-data queueable, so
 * per-method anchors are how a suite meets the time limit rather than the assertion it came for.
 */
@IsTest
private class StageExecuteRelationshipIntakeTest {

    private static final String ACCOUNT_NAME = 'ZZ-RI-TEST Borrower';
    private static final String COVENANT_TYPE_NAME = 'ZZ-RI-TEST Debt Service Coverage';
    private static final String COLLATERAL_TYPE_NAME = 'ZZ-RI-TEST Equipment';

    @TestSetup
    static void makeFixture() {
        C360TestFixture.armCalloutMock();
        insert new Account(Name = ACCOUNT_NAME);
        insert new LLC_BI__Covenant_Type__c(Name = COVENANT_TYPE_NAME);
        // The org's Advance_Rate_should_not_be_null rule refuses a collateral created against a
        // type with no rate, and it surfaces on the ASSET insert rather than on the type.
        insert new LLC_BI__Collateral_Type__c(Name = COLLATERAL_TYPE_NAME, LLC_BI__Advance_Rate__c = 50);
    }

    private static Account borrower() {
        return [SELECT Id, Name FROM Account WHERE Name = :ACCOUNT_NAME LIMIT 1];
    }

    private static String key(String label) {
        return 'ZZ-RI-' + label + '-' + String.valueOf(Crypto.getRandomLong());
    }

    /** The tool's own refusal, so a failed assert names the cause instead of hiding it. */
    private static String why(StageRelationshipIntake.Response r) {
        return r.error == null ? '(no error reported)' : r.error.code + ' :: ' + r.error.message;
    }

    private static Map<String, Object> covenantEntry(String typeName) {
        return new Map<String, Object>{
            'covenantTypeName' => typeName,
            'operator' => '>=',
            'threshold' => 1.25,
            'frequency' => 'Quarterly',
            'effectiveDate' => '2026-09-01',
            'nextEvaluationDate' => '2026-12-31',
            'notes' => 'Set at closing per the credit agreement.'
        };
    }

    private static Map<String, Object> collateralEntry(String typeWord) {
        return new Map<String, Object>{
            'collateralType' => typeWord,
            'description' => 'CNC machining line, Kokomo plant',
            'value' => 2500000,
            'valuationBasis' => 'Orderly Liquidation Value',
            'valuationSource' => 'Appraisal',
            'valuationDate' => '2026-08-31',
            // ONE OBJECT, not four keys. This is the shape the contract words and the shape the
            // room sends; the flat spelling is a fallback and has a test of its own.
            'address' => new Map<String, Object>{
                'street' => '1400 Industrial Parkway',
                'city' => 'Kokomo',
                'state' => 'IN',
                'zip' => '46901'
            }
        };
    }

    private static StageRelationshipIntake.Request req(String k, List<Object> covenants, List<Object> collateral) {
        StageRelationshipIntake.Request r = new StageRelationshipIntake.Request();
        r.idempotencyKey = k;
        r.accountId = borrower().Id;
        r.rationale = 'Opening intake from the executed credit agreement.';
        r.covenantsJson = covenants == null ? null : JSON.serialize(covenants);
        r.collateralJson = collateral == null ? null : JSON.serialize(collateral);
        return r;
    }

    private static StageRelationshipIntake.Response stage(StageRelationshipIntake.Request r) {
        return StageRelationshipIntake.stage(new List<StageRelationshipIntake.Request>{ r })[0];
    }

    private static ExecuteRelationshipIntake.Response executeStaged(String k, StageRelationshipIntake.StageResult staged) {
        ExecuteRelationshipIntake.Request ex = new ExecuteRelationshipIntake.Request();
        ex.idempotencyKey = k;
        ex.stagingId = staged.planId;
        ex.planHash = staged.planHash;
        ex.decisionToken = staged.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        return ExecuteRelationshipIntake.run(new List<ExecuteRelationshipIntake.Request>{ ex })[0];
    }

    /** The same call under the older key, which the tool still answers to. */
    private static ExecuteRelationshipIntake.Response executeStagedByAlias(String k, StageRelationshipIntake.StageResult staged) {
        ExecuteRelationshipIntake.Request ex = new ExecuteRelationshipIntake.Request();
        ex.idempotencyKey = k;
        ex.planId = staged.planId;
        ex.planHash = staged.planHash;
        ex.decisionToken = staged.decisionToken;
        ex.approverUserId = UserInfo.getUserId();
        return ExecuteRelationshipIntake.run(new List<ExecuteRelationshipIntake.Request>{ ex })[0];
    }

    /* ------------------------------------------------------------------ the arm */

    @IsTest
    static void happyPathFilesTheCovenantTheAssetAndTheirRelationshipAnchors() {
        C360TestFixture.armCalloutMock();
        Account a = borrower();
        String k = key('happy');

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            k,
            new List<Object>{ covenantEntry(COVENANT_TYPE_NAME) },
            new List<Object>{ collateralEntry(COLLATERAL_TYPE_NAME) }
        ));
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteRelationshipIntake.Response done = executeStaged(k, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));
        System.assertEquals(C360Plan.TERMINAL_SUCCESS, done.result.terminalState, done.result.outcome);
        System.assertEquals(1, done.result.covenantCount);
        System.assertEquals(1, done.result.collateralCount);

        // The covenant, born Pending and Active on the relationship.
        LLC_BI__Covenant2__c cov = [
            SELECT Id, Name, LLC_BI__Account__c, LLC_BI__Covenant_Type__c, LLC_BI__Financial_Indicator_Value__c,
                   Acnpex_Threshold_Value__c, Acnpex_Operator__c, Financial_Indicator_Operator__c,
                   LLC_BI__Frequency__c, LLC_BI__Effective_Date__c, LLC_BI__Next_Evaluation_Date__c,
                   LLC_BI__Covenant_Status__c, LLC_BI__Active__c
            FROM LLC_BI__Covenant2__c WHERE Id = :done.result.covenants[0].covenantId
        ];
        System.assertEquals(a.Id, cov.LLC_BI__Account__c, 'the covenant is anchored on the relationship');
        // Numeric asserts use `==` rather than assertEquals: Decimal equality across scales is
        // exact on the operator and scale-sensitive on the method.
        System.assert(cov.LLC_BI__Financial_Indicator_Value__c == 1.25, String.valueOf(cov.LLC_BI__Financial_Indicator_Value__c));
        System.assert(cov.Acnpex_Threshold_Value__c == 1.25, 'the org mirrors the threshold onto both fields');
        System.assertEquals('>=', cov.Acnpex_Operator__c);
        System.assertEquals('Greater Tan or Equal To', cov.Financial_Indicator_Operator__c,
            'the org\'s own typo IS the active picklist value and must be written as-is');
        System.assertEquals('Quarterly', cov.LLC_BI__Frequency__c);
        System.assertEquals(Date.newInstance(2026, 9, 1), cov.LLC_BI__Effective_Date__c);
        System.assertEquals(Date.newInstance(2026, 12, 31), cov.LLC_BI__Next_Evaluation_Date__c);
        System.assertEquals('Pending', cov.LLC_BI__Covenant_Status__c, 'a net-new covenant is not yet evaluated');
        System.assertEquals(true, cov.LLC_BI__Active__c);

        // Its RELATIONSHIP junction, and no loan junction.
        System.assertEquals(1, [
            SELECT COUNT() FROM LLC_BI__Account_Covenant__c
            WHERE LLC_BI__Covenant2__c = :cov.Id AND LLC_BI__Account__c = :a.Id
        ], 'the covenant must carry exactly one relationship junction');
        System.assertEquals(0, [
            SELECT COUNT() FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Covenant2__c = :cov.Id
        ], 'relationship intake reaches no facility: no loan junction may exist');
        System.assertNotEquals(null, done.result.covenants[0].relationshipJunctionId);

        // The asset, its ownership junction, and no pledge.
        LLC_BI__Collateral__c asset = [
            SELECT Id, Name, LLC_BI__Collateral_Type__c, LLC_BI__Value__c, LLC_BI__Description__c,
                   LLC_BI__Street_Address__c, LLC_BI__City__c, LLC_BI__State__c, LLC_BI__Zip_Code__c
            FROM LLC_BI__Collateral__c WHERE Id = :done.result.collateral[0].collateralId
        ];
        System.assert(asset.LLC_BI__Value__c == 2500000, String.valueOf(asset.LLC_BI__Value__c));
        System.assertEquals('CNC machining line, Kokomo plant', asset.LLC_BI__Description__c);
        // THE ADDRESS CAME NESTED and reached the org. All four parts, because an address that
        // arrives as three quarters of itself is a defect nobody sees until a banker reads it.
        System.assertEquals('1400 Industrial Parkway', asset.LLC_BI__Street_Address__c,
            'the nested address object must reach the asset');
        System.assertEquals('Kokomo', asset.LLC_BI__City__c);
        System.assertEquals('IN', asset.LLC_BI__State__c);
        System.assertEquals('46901', asset.LLC_BI__Zip_Code__c);
        System.assertEquals(1, [
            SELECT COUNT() FROM LLC_BI__Account_Collateral__c
            WHERE LLC_BI__Collateral__c = :asset.Id AND LLC_BI__Account__c = :a.Id
        ], 'the asset must carry exactly one ownership junction: it has no account lookup of its own');
        System.assertEquals(0, [
            SELECT COUNT() FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Collateral__c = :asset.Id
        ], 'relationship intake pledges nothing');

        // The opening valuation.
        LLC_BI__Collateral_Valuation__c cv = [
            SELECT Id, Name, LLC_BI__Collateral__c, LLC_BI__Value__c, LLC_BI__Type__c, LLC_BI__Source__c,
                   LLC_BI__Valuation_Date__c, LLC_BI__Active__c, LLC_BI__Primary__c, LLC_BI__Original_Value__c
            FROM LLC_BI__Collateral_Valuation__c WHERE Id = :done.result.collateral[0].valuationId
        ];
        System.assertEquals(asset.Id, cv.LLC_BI__Collateral__c);
        System.assert(cv.LLC_BI__Value__c == 2500000, String.valueOf(cv.LLC_BI__Value__c));
        System.assertEquals('Orderly Liquidation Value', cv.LLC_BI__Type__c);
        System.assertEquals('Appraisal', cv.LLC_BI__Source__c);
        System.assertEquals(Date.newInstance(2026, 8, 31), cv.LLC_BI__Valuation_Date__c);
        System.assertEquals(true, cv.LLC_BI__Active__c);
        System.assertEquals(true, cv.LLC_BI__Original_Value__c,
            'the first valuation of an asset created in this transaction IS its original value');

        // The activity trail stamps these, so a null here is a generic label.
        System.assertEquals(cov.Name, done.result.recordName, 'recordName carries the org-assigned name');
        System.assertEquals(a.Name, done.result.anchorName);
        System.assert(done.result.outcome.contains('Nothing reached a facility'), done.result.outcome);
    }

    @IsTest
    static void collateralWithoutBasisSourceOrDateFilesNoValuation() {
        C360TestFixture.armCalloutMock();
        String k = key('novaluation');
        Map<String, Object> bare = new Map<String, Object>{
            'collateralType' => COLLATERAL_TYPE_NAME,
            'description' => 'Titling paperwork pending, value per the schedule',
            'value' => 100000
        };

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(k, null, new List<Object>{ bare }));
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        System.assertEquals(false, staged.result.collateral[0].filesValuation);
        ExecuteRelationshipIntake.Response done = executeStaged(k, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));
        System.assertEquals(null, done.result.collateral[0].valuationId, 'no basis, source or date means no valuation row');
        System.assertEquals(0, [
            SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c
            WHERE LLC_BI__Collateral__c = :done.result.collateral[0].collateralId
        ]);
    }

    @IsTest
    static void aFlatAddressIsStillReadWhereNoAddressObjectIsSupplied() {
        C360TestFixture.armCalloutMock();
        String k = key('flataddress');
        // The four keys at the top level of the entry, which is what a caller that has not read
        // the contract closely will send. It means the same thing, so it is read rather than lost.
        Map<String, Object> flat = new Map<String, Object>{
            'collateralType' => COLLATERAL_TYPE_NAME,
            'description' => 'Warehouse, Fort Wayne',
            'value' => 900000,
            'street' => '1400 Industrial Parkway',
            'city' => 'Fort Wayne',
            'state' => 'IN',
            'zip' => '46802'
        };

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(k, null, new List<Object>{ flat }));
        System.assertEquals(true, staged.ok, 'stage should succeed, got ' + why(staged));
        ExecuteRelationshipIntake.Response done = executeStaged(k, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'execute should succeed: ' + (done.error == null ? '' : done.error.message));
        LLC_BI__Collateral__c asset = [
            SELECT Id, LLC_BI__Street_Address__c, LLC_BI__City__c, LLC_BI__State__c, LLC_BI__Zip_Code__c
            FROM LLC_BI__Collateral__c WHERE Id = :done.result.collateral[0].collateralId
        ];
        System.assertEquals('1400 Industrial Parkway', asset.LLC_BI__Street_Address__c);
        System.assertEquals('Fort Wayne', asset.LLC_BI__City__c);
        System.assertEquals('IN', asset.LLC_BI__State__c);
        System.assertEquals('46802', asset.LLC_BI__Zip_Code__c);
    }

    @IsTest
    static void executeAnswersToStagingIdAndStillToThePlanIdAlias() {
        C360TestFixture.armCalloutMock();
        String k = key('alias');

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(k, new List<Object>{ covenantEntry(COVENANT_TYPE_NAME) }, null));
        System.assertEquals(true, staged.ok, why(staged));

        // NEITHER KEY, and the refusal names the one the caller should send.
        ExecuteRelationshipIntake.Request bare = new ExecuteRelationshipIntake.Request();
        bare.idempotencyKey = key('nohandle');
        bare.planHash = staged.result.planHash;
        bare.decisionToken = staged.result.decisionToken;
        bare.approverUserId = UserInfo.getUserId();
        ExecuteRelationshipIntake.Response refused =
            ExecuteRelationshipIntake.run(new List<ExecuteRelationshipIntake.Request>{ bare })[0];
        System.assertEquals(false, refused.ok, 'a request carrying no handle at all cannot execute');
        System.assert(refused.error.message.contains('stagingId is required'), refused.error.message);
        System.assert(refused.error.message.contains('planId'), 'the refusal names the alias too: ' + refused.error.message);

        // THE ALIAS STILL WORKS. The pair shipped naming the handle planId and the room is not
        // the only caller; a rename that breaks the old key is a rename that breaks a live client.
        ExecuteRelationshipIntake.Response done = executeStagedByAlias(k, staged.result);
        Test.stopTest();

        System.assertEquals(true, done.ok, 'planId must still be accepted: ' + (done.error == null ? '' : done.error.message));
        System.assertEquals(staged.result.planId, done.result.stagingId,
            'the result answers under stagingId, as every other execute tool does');
        System.assertEquals(staged.result.planId, done.result.planId, 'and under the alias, unchanged');
    }

    /* ------------------------------------------------------------- the refusals */

    @IsTest
    static void unknownCovenantTypeIsRefusedByIndexAndTheRestStillPlans() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            key('badcovtype'),
            new List<Object>{ covenantEntry('Vibes Coverage Ratio'), covenantEntry(COVENANT_TYPE_NAME) },
            null
        ));
        Test.stopTest();

        System.assertEquals(true, staged.ok, 'one bad entry must not discard the plan, got ' + why(staged));
        System.assertEquals(1, staged.result.covenantCount, 'the good covenant is still planned');
        System.assertEquals(1, staged.result.refusedCount);
        System.assertEquals(0, staged.result.refusals[0].index, 'refusals carry the index of the entry that failed');
        System.assertEquals('covenant', staged.result.refusals[0].kind);
        System.assert(
            staged.result.refusals[0].reason.contains('Vibes Coverage Ratio') &&
                staged.result.refusals[0].reason.contains('catalog'),
            'the refusal names the type and the org\'s catalog: ' + staged.result.refusals[0].reason
        );
    }

    @IsTest
    static void unknownCollateralTypeIsRefusedAgainstTheOrgCatalog() {
        C360TestFixture.armCalloutMock();
        Map<String, Object> bad = collateralEntry('Unobtainium');

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(key('badcoltype'), null, new List<Object>{ bad }));
        Test.stopTest();

        System.assertEquals(false, staged.ok, 'nothing survives, so the plan is refused outright');
        System.assertEquals('VALIDATION_FAILED', staged.error.code);
        System.assert(staged.error.message.contains('Unobtainium'), staged.error.message);
    }

    @IsTest
    static void nonPositiveValueIsRefused() {
        C360TestFixture.armCalloutMock();
        Map<String, Object> zero = collateralEntry(COLLATERAL_TYPE_NAME);
        zero.put('value', 0);

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            key('zerovalue'),
            new List<Object>{ covenantEntry(COVENANT_TYPE_NAME) },
            new List<Object>{ zero }
        ));
        Test.stopTest();

        System.assertEquals(true, staged.ok, why(staged));
        System.assertEquals(0, staged.result.collateralCount);
        System.assertEquals(1, staged.result.refusedCount);
        System.assertEquals('collateral', staged.result.refusals[0].kind);
        System.assert(
            staged.result.refusals[0].reason.contains('greater than zero'),
            staged.result.refusals[0].reason
        );
    }

    @IsTest
    static void aStateTheOrgDoesNotHoldIsRefusedFromTheNestedAddress() {
        C360TestFixture.armCalloutMock();
        Map<String, Object> bad = collateralEntry(COLLATERAL_TYPE_NAME);
        // The nested object is validated exactly as the flat keys were: the picklist is the org's
        // and the entry is refused by index rather than filed with a state the org cannot store.
        bad.put('address', new Map<String, Object>{
            'street' => '1400 Industrial Parkway',
            'city' => 'Kokomo',
            'state' => 'ZZ',
            'zip' => '46901'
        });

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            key('badstate'),
            new List<Object>{ covenantEntry(COVENANT_TYPE_NAME) },
            new List<Object>{ bad }
        ));
        Test.stopTest();

        System.assertEquals(true, staged.ok, 'the covenant still plans, got ' + why(staged));
        System.assertEquals(0, staged.result.collateralCount, 'the asset is not filed with a state the org refuses');
        System.assertEquals(1, staged.result.refusedCount);
        System.assertEquals('collateral', staged.result.refusals[0].kind);
        System.assertEquals(0, staged.result.refusals[0].index);
        System.assert(
            staged.result.refusals[0].reason.contains('ZZ') &&
                staged.result.refusals[0].reason.contains('LLC_BI__State__c'),
            'the refusal names the value and the org\'s picklist: ' + staged.result.refusals[0].reason
        );
    }

    @IsTest
    static void anAddressThatIsNotAnObjectIsRefusedRatherThanIgnored() {
        C360TestFixture.armCalloutMock();
        Map<String, Object> bad = collateralEntry(COLLATERAL_TYPE_NAME);
        bad.put('address', '1400 Industrial Parkway, Fort Wayne, IN 46802');

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            key('addrstring'),
            new List<Object>{ covenantEntry(COVENANT_TYPE_NAME) },
            new List<Object>{ bad }
        ));
        Test.stopTest();

        System.assertEquals(true, staged.ok, why(staged));
        System.assertEquals(0, staged.result.collateralCount);
        System.assertEquals(1, staged.result.refusedCount);
        System.assert(
            staged.result.refusals[0].reason.contains('address must be a JSON object'),
            staged.result.refusals[0].reason
        );
    }

    @IsTest
    static void unreadableDateIsRefusedAndNamesTheField() {
        C360TestFixture.armCalloutMock();
        Map<String, Object> bad = covenantEntry(COVENANT_TYPE_NAME);
        bad.put('effectiveDate', '31/12/2026');

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            key('baddate'),
            new List<Object>{ bad, covenantEntry(COVENANT_TYPE_NAME) },
            null
        ));
        Test.stopTest();

        System.assertEquals(true, staged.ok, why(staged));
        System.assertEquals(1, staged.result.refusedCount);
        System.assert(
            staged.result.refusals[0].reason.contains('effectiveDate') &&
                staged.result.refusals[0].reason.contains('YYYY-MM-DD'),
            staged.result.refusals[0].reason
        );
    }

    @IsTest
    static void pastTheCapEachExtraEntryIsRefusedWithTheBudgetReason() {
        C360TestFixture.armCalloutMock();
        List<Object> many = new List<Object>();
        for (Integer i = 0; i < StageRelationshipIntake.MAX_PER_LIST + 2; i++) {
            many.add(covenantEntry(COVENANT_TYPE_NAME));
        }

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(key('cap'), many, null));
        Test.stopTest();

        System.assertEquals(true, staged.ok, why(staged));
        System.assertEquals(StageRelationshipIntake.MAX_PER_LIST, staged.result.covenantCount);
        System.assertEquals(2, staged.result.refusedCount);
        System.assertEquals(StageRelationshipIntake.MAX_PER_LIST, staged.result.refusals[0].index);
        System.assert(staged.result.refusals[0].reason.contains('the cap is 10'), staged.result.refusals[0].reason);
    }

    @IsTest
    static void anIntakeWithNothingLeftIsRefusedRatherThanStaged() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            key('allrefused'),
            new List<Object>{ covenantEntry('No Such Covenant Type') },
            null
        ));
        Test.stopTest();

        System.assertEquals(false, staged.ok, 'a plan that promises no write is not a plan');
        System.assertEquals('VALIDATION_FAILED', staged.error.code);
        System.assert(staged.error.message.contains('None of the'), staged.error.message);
    }

    @IsTest
    static void stageWritesNoDomainRow() {
        C360TestFixture.armCalloutMock();
        Integer covenantsBefore = [SELECT COUNT() FROM LLC_BI__Covenant2__c];
        Integer assetsBefore = [SELECT COUNT() FROM LLC_BI__Collateral__c];
        Integer valuationsBefore = [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c];

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(
            key('zerodml'),
            new List<Object>{ covenantEntry(COVENANT_TYPE_NAME) },
            new List<Object>{ collateralEntry(COLLATERAL_TYPE_NAME) }
        ));
        Test.stopTest();

        System.assertEquals(true, staged.ok, why(staged));
        System.assertNotEquals(null, staged.result.decisionToken, 'stage mints the single-use token');
        System.assertEquals(covenantsBefore, [SELECT COUNT() FROM LLC_BI__Covenant2__c], 'A33.0.1: stage writes no domain row');
        System.assertEquals(assetsBefore, [SELECT COUNT() FROM LLC_BI__Collateral__c], 'A33.0.1: stage writes no domain row');
        System.assertEquals(valuationsBefore, [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c], 'A33.0.1: stage writes no domain row');
    }

    @IsTest
    static void aSecondExecuteOnTheSameKeyWritesNothing() {
        C360TestFixture.armCalloutMock();
        String k = key('replay');

        Test.startTest();
        StageRelationshipIntake.Response staged = stage(req(k, new List<Object>{ covenantEntry(COVENANT_TYPE_NAME) }, null));
        System.assertEquals(true, staged.ok, why(staged));
        ExecuteRelationshipIntake.Response first = executeStaged(k, staged.result);
        System.assertEquals(true, first.ok, first.error == null ? '' : first.error.message);
        Integer afterFirst = [SELECT COUNT() FROM LLC_BI__Covenant2__c];
        ExecuteRelationshipIntake.Response second = executeStaged(k, staged.result);
        Test.stopTest();

        System.assertEquals(true, second.ok, second.error == null ? '' : second.error.message);
        System.assertEquals(true, second.result.replayed, 'the second call reports the prior run');
        System.assertEquals(afterFirst, [SELECT COUNT() FROM LLC_BI__Covenant2__c], 'a replay writes nothing');
    }

    /* ----------------------------------------------------------------- the fence */

    @IsTest
    static void theToolFenceRefusesAComplianceRowAndALoanJunction() {
        Map<String, Object> compliance = new Map<String, Object>{
            'LLC_BI__Covenant__c' => null,
            'LLC_BI__Status__c' => 'Compliant'
        };
        try {
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_COVENANT_COMPLIANCE,
                C360WriteGuard.OP_CREATE, compliance
            );
            System.assert(false, 'a compliance row must be refused: creating one starts the bank\'s covenant approval chain');
        } catch (C360WriteGuard.GuardException e) {
            System.assert(e.getMessage().contains('LLC_BI__Covenant_Compliance2__c'), e.getMessage());
        }

        Map<String, Object> loanJunction = new Map<String, Object>{
            'LLC_BI__Loan__c' => null,
            'LLC_BI__Covenant2__c' => null
        };
        try {
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_LOAN_COVENANT,
                C360WriteGuard.OP_CREATE, loanJunction
            );
            System.assert(false, 'a loan junction must be refused: relationship intake reaches no facility');
        } catch (C360WriteGuard.GuardException e) {
            System.assert(e.getMessage().contains('LLC_BI__Loan_Covenant__c'), e.getMessage());
        }

        Map<String, Object> pledge = new Map<String, Object>{
            'LLC_BI__Loan__c' => null,
            'LLC_BI__Collateral__c' => null,
            'LLC_BI__Pledged_Status__c' => 'Active',
            'LLC_BI__Active__c' => 'true'
        };
        try {
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_PLEDGE,
                C360WriteGuard.OP_CREATE, pledge
            );
            System.assert(false, 'a pledge must be refused: relationship intake pledges nothing');
        } catch (C360WriteGuard.GuardException e) {
            System.assert(e.getMessage().contains('LLC_BI__Loan_Collateral2__c'), e.getMessage());
        }

        // AND THE SUBTRACTION PROOF. The same loan junction still passes the plain object gate, so
        // the modification arm, which authors one legitimately, is untouched by this addition.
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN_COVENANT, C360WriteGuard.OP_CREATE, loanJunction);
    }

    @IsTest
    static void anUndeclaredToolIsRefusedOutright() {
        try {
            C360WriteGuard.assertAllowedForTool(
                'no-such-tool', C360WriteGuard.OBJ_COVENANT, C360WriteGuard.OP_CREATE, new Map<String, Object>()
            );
            System.assert(false, 'a tool with no declared fence may not write anything');
        } catch (C360WriteGuard.GuardException e) {
            System.assert(e.getMessage().contains('no-such-tool'), e.getMessage());
        }
    }
}
