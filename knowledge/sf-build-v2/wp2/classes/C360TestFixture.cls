/**
 * C360TestFixture - shared fixture builders for the WP2 tool tests.
 *
 * The three write targets sit on different anchors: Case and Review hang off the Account,
 * Collateral Valuation hangs off a Collateral whose only hard-required field is a lookup to a
 * Collateral Type config record. Building that chain once here keeps each test about the tool
 * it is testing rather than about nCino's data model.
 */
@IsTest
public class C360TestFixture {

    /** An account the tools can anchor on. */
    public static Account account() {
        Account a = new Account(Name = 'ZZ-WP2-TEST Borrower');
        insert a;
        return a;
    }

    /**
     * A collateral record with its required type lookup satisfied.
     *
     * NEW ORG FACT, found by the first live test run (2026-07-26): the active validation rule
     * LLC_BI__Collateral_Type__c.Advance_Rate_should_not_be_null, formula
     * ISNULL(LLC_BI__Advance_Rate__c), refuses any Collateral Type without an advance rate.
     * The write probes never saw it because they reused the existing COL-000758 rather than
     * creating the chain. Our tools never create Collateral or Collateral Type, so this
     * constrains fixtures only, not the shipping contract.
     *
     * @param value The starting collateral value, so a rollup test can tell whether it moved.
     */
    public static LLC_BI__Collateral__c collateral(Decimal value) {
        LLC_BI__Collateral_Type__c ct = new LLC_BI__Collateral_Type__c(
            Name = 'ZZ-WP2-TEST Type',
            LLC_BI__Advance_Rate__c = 50
        );
        insert ct;

        LLC_BI__Collateral__c c = new LLC_BI__Collateral__c(
            LLC_BI__Collateral_Type__c = ct.Id,
            LLC_BI__Value__c = value
        );
        insert c;
        return c;
    }

    /** The account created by a class @TestSetup block. */
    public static Account existingAccount() {
        return [SELECT Id, Name FROM Account WHERE Name = 'ZZ-WP2-TEST Borrower' LIMIT 1];
    }

    /** The collateral created by a class @TestSetup block. */
    public static LLC_BI__Collateral__c existingCollateral() {
        return [SELECT Id, LLC_BI__Value__c FROM LLC_BI__Collateral__c WHERE LLC_BI__Collateral_Type__r.Name = 'ZZ-WP2-TEST Type' LIMIT 1];
    }

    /** A unique idempotency key per call, so tests never collide on the unique index. */
    public static String key(String label) {
        return 'ZZ-WP2-' + label + '-' + String.valueOf(Crypto.getRandomLong());
    }

    /**
     * SHARED-SANDBOX SHIELD (2026-08-20). On 2026-08-03 a set of 24 org-local *CDC triggers
     * (EventBridgeCallout queueable, AWS change-stream, not ours) went live on every object these
     * fixtures insert. Each test DML now flushes a queueable that makes an HTTP callout, which a
     * test context refuses unless a mock is armed. Arm this mock FIRST in every @TestSetup and
     * every test method that performs DML. The mock answers ANY request with 200 — it exists to
     * make the foreign callout legal, never to assert on it.
     */
    public class NoopCalloutMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setStatusCode(200);
            r.setBody('{}');
            return r;
        }
    }

    /** Arm the shared-sandbox callout shield. Call first in @TestSetup and each DML-performing test. */
    public static void armCalloutMock() {
        Test.setMock(HttpCalloutMock.class, new NoopCalloutMock());
    }

    /** Row counts for the three domain write targets, for the zero-DML proof. */
    public static Map<String, Integer> domainRowCounts() {
        return new Map<String, Integer>{
            'Case' => [SELECT COUNT() FROM Case],
            'LLC_BI__Collateral_Valuation__c' => [SELECT COUNT() FROM LLC_BI__Collateral_Valuation__c],
            'LLC_BI__Review__c' => [SELECT COUNT() FROM LLC_BI__Review__c]
        };
    }
}
