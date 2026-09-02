/**
 * Customer360RelationshipGraphTest - the involvement UNION, pinned.
 *
 * Finding N4 (2026-09-02): the tool read `LLC_BI__Legal_Entities__c WHERE LLC_BI__Account__c =
 * :anchor`, which answers "where is this account itself a party" and never "who is on this
 * account's deals". A guarantor row carries the GUARANTOR's account, so on the Hartwell book
 * fifteen of twenty-two rows were invisible: "any guarantors?" rendered an empty card, and a
 * duplicate-guarantor add had no book to dedupe against.
 *
 * The fixture is the smallest shape that proves the union: the anchor as Borrower, a second
 * account as Guarantor and a third as Limited Guarantor, all on ONE loan in the anchor's package.
 * Before the fix this read returns one row. After it, three, each with its own loanId and
 * borrowerType, and exactly three: the anchor's own row satisfies BOTH legs, so a fourth row would
 * be a dedupe failure.
 */
@IsTest
private class Customer360RelationshipGraphTest {

    private static final String ANCHOR = 'ZZ-GRAPH-TEST Borrower';
    private static final String GUARANTOR = 'ZZ-GRAPH-TEST Holdings';
    private static final String LIMITED = 'ZZ-GRAPH-TEST Individual';
    private static final String LOAN_KEY = 'ZZ-GRAPH-TEST-PARENT';

    /**
     * The callout shield goes FIRST: 24 org-local *CDC triggers enqueue an EventBridge callout on
     * every DML these fixtures perform, and a test context refuses an unmocked callout.
     */
    @TestSetup
    static void makeFixture() {
        C360TestFixture.armCalloutMock();

        List<Account> parties = new List<Account>{
            new Account(Name = ANCHOR),
            new Account(Name = GUARANTOR),
            new Account(Name = LIMITED)
        };
        insert parties;

        LLC_BI__Product_Package__c p = new LLC_BI__Product_Package__c(
            Name = 'ZZ-GRAPH-TEST Package',
            LLC_BI__Account__c = parties[0].Id
        );
        insert p;

        // Booked with a lookupKey: LV05 keys on the key being present, not on a loan number.
        LLC_BI__Loan__c loan = new LLC_BI__Loan__c(
            LLC_BI__Account__c = parties[0].Id,
            LLC_BI__Product_Package__c = p.Id,
            LLC_BI__Stage__c = 'Booked',
            LLC_BI__Status__c = 'Open',
            LLC_BI__lookupKey__c = LOAN_KEY,
            LLC_BI__Amount__c = 1000000,
            LLC_BI__Product_Line__c = 'Commercial',
            LLC_BI__Product_Type__c = 'Term Loan',
            LLC_BI__Product__c = 'Equipment',
            LLC_BI__isRenewal__c = false,
            LLC_BI__Is_Modification__c = false
        );
        insert loan;

        insert new List<LLC_BI__Legal_Entities__c>{
            new LLC_BI__Legal_Entities__c(
                LLC_BI__Account__c = parties[0].Id,
                LLC_BI__Loan__c = loan.Id,
                LLC_BI__Product_Package__c = p.Id,
                LLC_BI__Borrower_Type__c = 'Borrower',
                LLC_BI__Ownership__c = 100,
                LLC_BI__Order__c = 1
            ),
            new LLC_BI__Legal_Entities__c(
                LLC_BI__Account__c = parties[1].Id,
                LLC_BI__Loan__c = loan.Id,
                LLC_BI__Product_Package__c = p.Id,
                LLC_BI__Borrower_Type__c = 'Guarantor',
                LLC_BI__Guaranty_Amount__c = 'Unlimited',
                LLC_BI__Order__c = 2
            ),
            new LLC_BI__Legal_Entities__c(
                LLC_BI__Account__c = parties[2].Id,
                LLC_BI__Loan__c = loan.Id,
                LLC_BI__Product_Package__c = p.Id,
                LLC_BI__Borrower_Type__c = 'Limited Guarantor',
                LLC_BI__Guaranty_Amount__c = 'Limited',
                LLC_BI__Order__c = 3
            )
        };
    }

    private static Id anchorId() {
        return [SELECT Id FROM Account WHERE Name = :ANCHOR LIMIT 1].Id;
    }

    private static Id loanId() {
        return [SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__lookupKey__c = :LOAN_KEY LIMIT 1].Id;
    }

    private static Customer360RelationshipGraph.Response readGraph(Id accountId) {
        Customer360RelationshipGraph.Request req = new Customer360RelationshipGraph.Request();
        req.accountId = String.valueOf(accountId);
        return Customer360RelationshipGraph.getRelationshipGraph(
            new List<Customer360RelationshipGraph.Request>{ req }
        )[0];
    }

    /**
     * The whole of N4: the guarantors on the anchor's LOAN come back, not only the anchor's own
     * borrower row, and each carries the loan it sits on and the role it holds.
     */
    @IsTest
    static void guarantorsOnTheAnchorsLoanAreReturned() {
        Id loan = loanId();

        Test.startTest();
        Customer360RelationshipGraph.Response res = readGraph(anchorId());
        Test.stopTest();

        Map<String, Customer360RelationshipGraph.LegalEntityInvolvement> byName =
            new Map<String, Customer360RelationshipGraph.LegalEntityInvolvement>();
        for (Customer360RelationshipGraph.LegalEntityInvolvement li : res.legalEntities) {
            byName.put(li.accountName, li);
        }

        System.assertEquals(3, res.legalEntities.size(),
            'The union returns the borrower and BOTH guarantors on the anchor\'s loan, and returns each exactly once.');
        System.assert(byName.containsKey(ANCHOR), 'The anchor\'s own borrower row is still there.');
        System.assert(byName.containsKey(GUARANTOR), 'The guarantor on the anchor\'s loan was missing before N4.');
        System.assert(byName.containsKey(LIMITED), 'The limited guarantor on the anchor\'s loan was missing before N4.');

        System.assertEquals('Borrower', byName.get(ANCHOR).borrowerType, 'Role travels with the row.');
        System.assertEquals('Guarantor', byName.get(GUARANTOR).borrowerType, 'Role travels with the row.');
        System.assertEquals('Limited Guarantor', byName.get(LIMITED).borrowerType,
            'Limited Guarantor is its own role and must never be flattened to Guarantor.');

        System.assertEquals(loan, byName.get(ANCHOR).loanId, 'Every row names the facility it sits on.');
        System.assertEquals(loan, byName.get(GUARANTOR).loanId, 'Every row names the facility it sits on.');
        System.assertEquals(loan, byName.get(LIMITED).loanId, 'Every row names the facility it sits on.');
    }

    /**
     * The anchor's own row satisfies both legs of the union. It appears once, and it appears FIRST:
     * a borrowing-structure card leads with the borrower.
     */
    @IsTest
    static void theAnchorsOwnRowIsNotDuplicatedAndLeads() {
        Test.startTest();
        Customer360RelationshipGraph.Response res = readGraph(anchorId());
        Test.stopTest();

        Integer anchorRows = 0;
        for (Customer360RelationshipGraph.LegalEntityInvolvement li : res.legalEntities) {
            if (li.accountName == ANCHOR) {
                anchorRows++;
            }
        }
        System.assertEquals(1, anchorRows, 'Deduped by row id: a row matched by both legs is returned once.');
        System.assertEquals(ANCHOR, res.legalEntities[0].accountName, 'The anchor\'s own involvement leads the list.');
    }

    /**
     * Read from the GUARANTOR's side and the shape still holds: it is a party on somebody else's
     * facility, so leg one carries it even though the loan belongs to another relationship.
     */
    @IsTest
    static void aPartyOnAnotherRelationshipsFacilityStillReadsItsOwnRow() {
        Id guarantor = [SELECT Id FROM Account WHERE Name = :GUARANTOR LIMIT 1].Id;

        Test.startTest();
        Customer360RelationshipGraph.Response res = readGraph(guarantor);
        Test.stopTest();

        System.assertEquals(1, res.legalEntities.size(),
            'The guarantor holds one involvement and it is on the anchor\'s loan.');
        System.assertEquals('Guarantor', res.legalEntities[0].borrowerType, 'Its own role, read from its own side.');
        System.assertEquals(loanId(), res.legalEntities[0].loanId, 'And the facility it guarantees.');
    }

    /** An account with no graph and no involvement gets the empty note, not a fabricated one. */
    @IsTest
    static void anAccountWithNoInvolvementGetsTheEmptyNote() {
        C360TestFixture.armCalloutMock();
        Account stranger = new Account(Name = 'ZZ-GRAPH-TEST Stranger');
        insert stranger;

        Test.startTest();
        Customer360RelationshipGraph.Response res = readGraph(stranger.Id);
        Test.stopTest();

        System.assertEquals(0, res.legalEntities.size(), 'No involvement rows anywhere for this account.');
        System.assertEquals(0, res.connections.size(), 'And no connection edges.');
        System.assert(res.note.startsWith('No ownership or legal-entity involvement records found'),
            'The empty answer is stated, never dressed up.');
    }
}
