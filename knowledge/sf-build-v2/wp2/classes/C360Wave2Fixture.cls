/**
 * C360Wave2Fixture - shared fixtures for the wave-2 tool tests.
 *
 * One @TestSetup per class, minimal DML: a Loan insert wakes five managed namespaces and 21
 * validation rules and takes about six seconds in production (probe 5), so per-method fixtures are
 * how the first live run got killed on time.
 */
@IsTest
public class C360Wave2Fixture {

    private static Integer fakeCounter = 1;

    /** An account the wave-2 tools can anchor on. */
    public static Account account() {
        Account a = new Account(Name = 'ZZ-W2-TEST Borrower');
        insert a;
        return a;
    }

    /**
     * A product package. Probe 9 closed the A33.4.3(d) gap: neither named record type is available
     * to the running profile, only Master, and an insert with no RecordTypeId succeeds on it.
     */
    public static LLC_BI__Product_Package__c productPackage(Id accountId) {
        LLC_BI__Product_Package__c p = new LLC_BI__Product_Package__c(
            Name = 'ZZ-W2-TEST Package',
            LLC_BI__Account__c = accountId,
            LLC_BI__Stage__c = 'Pending',
            LLC_BI__Status__c = 'New'
        );
        insert p;
        return p;
    }

    /** A facility to plan a modification or renewal against. */
    public static LLC_BI__Loan__c loan(Id accountId, Id packageId) {
        LLC_BI__Loan__c l = new LLC_BI__Loan__c(
            LLC_BI__Account__c = accountId,
            LLC_BI__Product_Package__c = packageId,
            LLC_BI__Stage__c = 'Qualification',
            LLC_BI__Status__c = 'Open',
            LLC_BI__isRenewal__c = false,
            LLC_BI__Is_Modification__c = false,
            LLC_BI__Amount__c = 500000
        );
        insert l;
        return l;
    }

    public static Account existingAccount() {
        List<Account> rows = [SELECT Id, Name FROM Account WHERE Name = 'ZZ-W2-TEST Borrower' LIMIT 1];
        System.assertEquals(1, rows.size(), 'Fixture account missing: the @TestSetup block did not produce one.');
        return rows[0];
    }

    /**
     * Fixture lookups go through the RELATIONSHIP, never through Name. nCino rewrites names on
     * save (probe 5 proved it on Loan), so a Name-keyed fixture query is a trap: it returns zero
     * rows and every test that depends on it fails with "List has no rows for assignment".
     */
    public static LLC_BI__Product_Package__c existingPackage() {
        List<LLC_BI__Product_Package__c> rows = [
            SELECT Id, Name FROM LLC_BI__Product_Package__c WHERE LLC_BI__Account__c = :existingAccount().Id LIMIT 1
        ];
        System.assertEquals(1, rows.size(), 'Fixture package missing: the @TestSetup block did not produce one.');
        return rows[0];
    }

    public static LLC_BI__Loan__c existingLoan() {
        List<LLC_BI__Loan__c> rows = [
            SELECT Id, Name, LLC_BI__Stage__c FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c = :existingAccount().Id LIMIT 1
        ];
        System.assertEquals(1, rows.size(), 'Fixture loan missing: the @TestSetup block did not produce one.');
        return rows[0];
    }

    /** A unique idempotency key per call, so tests never collide on the unique index. */
    public static String key(String label) {
        return 'ZZ-W2-' + label + '-' + String.valueOf(Crypto.getRandomLong());
    }

    /**
     * A well-formed id for an object no test may write to.
     *
     * The covenant compliance suite uses this rather than inserting a record, because a create
     * fires acnpex_covenantApprovalProcess unconditionally at a real named approver. See the
     * ExecuteCovenantReview class header.
     */
    public static Id fakeId(Schema.SObjectType t) {
        String suffix = String.valueOf(fakeCounter++);
        return Id.valueOf(t.getDescribe().getKeyPrefix() + '0'.repeat(12 - suffix.length()) + suffix);
    }

    /** Row counts for every wave-2 domain write target, for the zero-DML proof. */
    public static Map<String, Integer> domainRowCounts() {
        return new Map<String, Integer>{
            'LLC_BI__Loan__c' => [SELECT COUNT() FROM LLC_BI__Loan__c],
            'LLC_BI__Annual_Review__c' => [SELECT COUNT() FROM LLC_BI__Annual_Review__c],
            'LLC_BI__Covenant_Compliance2__c' => [SELECT COUNT() FROM LLC_BI__Covenant_Compliance2__c]
        };
    }
}
