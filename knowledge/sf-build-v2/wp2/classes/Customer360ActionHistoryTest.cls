/**
 * Customer360ActionHistoryTest - the read tool's ordering, cap, name resolution and, above all,
 * the guarantee that no token material can leave through it.
 *
 * The token assertion is written against the SERIALISED response rather than against the wire
 * fields, because the risk being tested is not "did we map the field" but "could the value reach a
 * caller through any serialisation path at all". A staging row is seeded with a recognisable token
 * digest and the test proves that string does not appear anywhere in the output.
 */
@IsTest
private class Customer360ActionHistoryTest {

    private static final String SENTINEL_TOKEN_HASH = 'ZZSENTINELTOKENHASHMUSTNEVERAPPEARINOUTPUT0000000000000000000000';
    private static final String SENTINEL_PLAN_HASH = 'ZZSENTINELPLANHASHMUSTNEVERAPPEARINOUTPUT00000000000000000000000';

    @TestSetup
    static void makeFixture() {
        // The org's 24 change-data triggers enqueue a callout-making queueable per record, and a
        // test context refuses the callout unless a mock is armed. Arm it FIRST, always.
        C360TestFixture.armCalloutMock();
        Account a = new Account(Name = 'ZZ-WP2-TEST Borrower');
        insert a;

        Case c = new Case(AccountId = a.Id, Subject = 'ZZ-HIST case', Status = 'New');
        insert c;

        LLC_BI__Review__c rev = new LLC_BI__Review__c(
            LLC_BI__Account__c = a.Id,
            LLC_BI__Status__c = 'In Progress',
            LLC_BI__Review_Type__c = 'Annual'
        );
        insert rev;

        // Three rows: one pointing at a Case, one at a Review, one at an id whose object this tool
        // does not resolve (the account itself), plus one staged-only row with no result at all.
        List<cm_Action_Staging__c> rows = new List<cm_Action_Staging__c>{
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'create-service-request', cm_Idempotency_Key__c = 'ZZ-HIST-1',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(), cm_Approver_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Result_Record_Id__c = c.Id, cm_Executed_At__c = System.now()
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'annual-review', cm_Idempotency_Key__c = 'ZZ-HIST-2',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Result_Record_Id__c = rev.Id
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'unknown-shape', cm_Idempotency_Key__c = 'ZZ-HIST-3',
                cm_Status__c = 'Completed', cm_Plan_Hash__c = SENTINEL_PLAN_HASH,
                cm_Decision_Token_Hash__c = SENTINEL_TOKEN_HASH,
                cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id, cm_Result_Record_Id__c = a.Id
            ),
            new cm_Action_Staging__c(
                cm_Action_Id__c = 'collateral-valuation', cm_Idempotency_Key__c = 'ZZ-HIST-4',
                cm_Status__c = 'Staged', cm_Actor_User__c = UserInfo.getUserId(),
                cm_Account__c = a.Id
            )
        };
        insert rows;

        // Distinct creation times so "newest first" is a real assertion rather than a coin flip.
        Test.setCreatedDate(rows[0].Id, System.now().addDays(-1));
        Test.setCreatedDate(rows[1].Id, System.now().addDays(-2));
        Test.setCreatedDate(rows[2].Id, System.now().addDays(-3));
        Test.setCreatedDate(rows[3].Id, System.now().addDays(-4));
    }

    private static Account acct() {
        return [SELECT Id, Name FROM Account WHERE Name = 'ZZ-WP2-TEST Borrower' LIMIT 1];
    }

    private static Customer360ActionHistory.Response run(Id accountId, Integer lim) {
        Customer360ActionHistory.Request req = new Customer360ActionHistory.Request();
        req.accountId = accountId;
        req.maxResults = lim;
        return Customer360ActionHistory.getHistory(new List<Customer360ActionHistory.Request>{ req })[0];
    }

    @IsTest
    static void tokenMaterialNeverReachesTheOutput() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        String serialized = JSON.serialize(res);
        System.assertEquals(
            false,
            serialized.contains(SENTINEL_TOKEN_HASH),
            'A decision-token digest reached the output of a read tool. cm_Decision_Token_Hash__c must never be selected.'
        );
        System.assertEquals(
            false,
            serialized.contains(SENTINEL_PLAN_HASH),
            'The plan hash itself reached the output. A read returns planHashPresent, never the hash.'
        );
        System.assertEquals(
            false,
            serialized.contains('cm_Decision_Token_Hash'),
            'The token field name must not appear in the output shape at all.'
        );
        System.assertEquals(4, res.count, 'All four seeded rows should come back');
    }

    @IsTest
    static void planHashIsReportedAsPresenceOnly() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Boolean sawPresent = false;
        Boolean sawAbsent = false;
        for (Customer360ActionHistory.ActionHistoryEntry e : res.entries) {
            if (e.planHashPresent) {
                sawPresent = true;
            } else {
                sawAbsent = true;
            }
        }
        System.assertEquals(true, sawPresent, 'The three executed rows carry a plan hash');
        System.assertEquals(true, sawAbsent, 'The staged-only row carries none, and the difference must be visible');
    }

    @IsTest
    static void rowsComeBackNewestFirst() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        System.assertEquals(4, res.count);
        System.assertEquals('create-service-request', res.entries[0].actionId, 'Newest row first');
        System.assertEquals('annual-review', res.entries[1].actionId);
        System.assertEquals('unknown-shape', res.entries[2].actionId);
        System.assertEquals('collateral-valuation', res.entries[3].actionId, 'Oldest row last');
    }

    @IsTest
    static void resultsAreCappedByMaxResults() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, 2);
        Test.stopTest();

        System.assertEquals(2, res.count, 'The cap must be applied');
        System.assertEquals('create-service-request', res.entries[0].actionId, 'The cap keeps the newest, not an arbitrary two');
        System.assertEquals('annual-review', res.entries[1].actionId);
    }

    @IsTest
    static void nameResolvesPerKeyPrefixAndUnknownPrefixReturnsIdOnly() {
        C360TestFixture.armCalloutMock();
        Account a = acct();
        Case c = [SELECT Id, CaseNumber FROM Case WHERE AccountId = :a.Id LIMIT 1];
        LLC_BI__Review__c rev = [SELECT Id, Name FROM LLC_BI__Review__c WHERE LLC_BI__Account__c = :a.Id LIMIT 1];

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        Map<String, Customer360ActionHistory.ActionHistoryEntry> byAction =
            new Map<String, Customer360ActionHistory.ActionHistoryEntry>();
        for (Customer360ActionHistory.ActionHistoryEntry e : res.entries) {
            byAction.put(e.actionId, e);
        }

        System.assertEquals(
            c.CaseNumber,
            byAction.get('create-service-request').resultRecordName,
            'Case resolves through CaseNumber, because Case has no Name field'
        );
        System.assertEquals(
            rev.Name,
            byAction.get('annual-review').resultRecordName,
            'Review resolves through its autonumber Name'
        );
        System.assertEquals(
            a.Id,
            byAction.get('unknown-shape').resultRecordId,
            'An unresolvable record still returns its id'
        );
        System.assertEquals(
            null,
            byAction.get('unknown-shape').resultRecordName,
            'A record type this tool does not label returns no name rather than a guess'
        );
        System.assertEquals(
            null,
            byAction.get('collateral-valuation').resultRecordName,
            'A staged-only row created nothing, so it has no name'
        );
    }

    @IsTest
    static void readToolWritesNothing() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Map<String, Integer> before = new Map<String, Integer>{
            'Case' => [SELECT COUNT() FROM Case],
            'LLC_BI__Review__c' => [SELECT COUNT() FROM LLC_BI__Review__c],
            'LLC_BI__Collateral_Valuation__c' => [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c],
            'cm_Action_Staging__c' => [SELECT COUNT() FROM cm_Action_Staging__c]
        };

        Test.startTest();
        Customer360ActionHistory.Response res = run(a.Id, null);
        Test.stopTest();

        System.assertEquals(4, res.count, 'The read should have returned rows');
        Map<String, Integer> after = new Map<String, Integer>{
            'Case' => [SELECT COUNT() FROM Case],
            'LLC_BI__Review__c' => [SELECT COUNT() FROM LLC_BI__Review__c],
            'LLC_BI__Collateral_Valuation__c' => [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c],
            'cm_Action_Staging__c' => [SELECT COUNT() FROM cm_Action_Staging__c]
        };
        for (String obj : before.keySet()) {
            System.assertEquals(before.get(obj), after.get(obj), 'The history tool wrote a row to ' + obj + '. It is read-only.');
        }
    }

    @IsTest
    static void missingAccountIdIsRefusedWithoutReading() {
        C360TestFixture.armCalloutMock();
        Test.startTest();
        Customer360ActionHistory.Response res = run(null, null);
        Test.stopTest();

        System.assertEquals(0, res.count, 'No history is read without an anchor');
        System.assert(res.note.contains('accountId is required'), 'The note must say why: ' + res.note);
    }

    @IsTest
    static void positionalEnvelopeReturnsOneElementPerInput() {
        C360TestFixture.armCalloutMock();
        Account a = acct();

        Customer360ActionHistory.Request good = new Customer360ActionHistory.Request();
        good.accountId = a.Id;
        Customer360ActionHistory.Request blank = new Customer360ActionHistory.Request();
        blank.accountId = null;

        Test.startTest();
        List<Customer360ActionHistory.Response> out =
            Customer360ActionHistory.getHistory(new List<Customer360ActionHistory.Request>{ good, blank });
        Test.stopTest();

        System.assertEquals(2, out.size(), 'One element per input, positional');
        System.assertEquals(4, out[0].count, 'Element 0 belongs to input 0');
        System.assertEquals(0, out[1].count, 'Element 1 belongs to input 1 and read nothing');
    }
}
