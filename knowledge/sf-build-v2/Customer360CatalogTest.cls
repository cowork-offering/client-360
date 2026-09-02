/**
 * Customer360CatalogTest - every field the room writes resolves and returns real values.
 *
 * This test is deliberately about the ORG rather than about a fixture: the whole point of the tool
 * is that the chip sets stop being a copy, so a test that seeded its own picklists would prove
 * nothing. It asserts that each declared field resolves against the live describe and returns at
 * least one active value, and it pins the two facts a chip builder would otherwise get wrong: the
 * involvement roles are narrower than the org offers, and the two catalog entries return record
 * ids rather than names.
 */
@IsTest
private class Customer360CatalogTest {

    private static final String DUP_TYPE_NAME = 'ZZ-CATALOG-TEST Duplicated Covenant Type';

    /**
     * The two catalog entries read CUSTOM OBJECTS, and a test context sees no org data, so their
     * records have to be seeded here or the tool would look broken when it is merely isolated.
     *
     * ONLY RATED COLLATERAL TYPES CAN BE SEEDED. The org's own validation rule
     * LLC_BI__Collateral_Type__c.Advance_Rate_should_not_be_null, formula
     * ISNULL(LLC_BI__Advance_Rate__c), refuses a type with no advance rate outright, so a rateless
     * one cannot be created here at all. The acceptedValues filter is therefore exercised with
     * every seeded type passing it; a rateless type exists in this org only where the data predates
     * the rule, and the filter is what stops the room offering one as a chip.
     */
    @TestSetup
    static void seedTheCatalogObjects() {
        C360TestFixture.armCalloutMock();
        insert new List<LLC_BI__Collateral_Type__c>{
            new LLC_BI__Collateral_Type__c(Name = 'ZZ-CATALOG-TEST Equipment', LLC_BI__Advance_Rate__c = 80),
            new LLC_BI__Collateral_Type__c(Name = 'ZZ-CATALOG-TEST Real Estate', LLC_BI__Advance_Rate__c = 65)
        };
        insert new List<LLC_BI__Covenant_Type__c>{
            new LLC_BI__Covenant_Type__c(Name = DUP_TYPE_NAME),
            new LLC_BI__Covenant_Type__c(Name = DUP_TYPE_NAME),
            new LLC_BI__Covenant_Type__c(Name = 'ZZ-CATALOG-TEST Unique Covenant Type')
        };
    }

    private static Customer360Catalog.Response read() {
        return Customer360Catalog.getCatalog(
            new List<Customer360Catalog.Request>{ new Customer360Catalog.Request() }
        )[0];
    }

    private static Customer360Catalog.CatalogField field(Customer360Catalog.Response res, String obj, String fld) {
        for (Customer360Catalog.CatalogField cf : res.fields) {
            if (cf.objectName == obj && cf.fieldName == fld) {
                return cf;
            }
        }
        return null;
    }

    @IsTest
    static void everyDeclaredFieldResolvesAndCarriesAtLeastOneValue() {
        Test.startTest();
        Customer360Catalog.Response res = read();
        Test.stopTest();

        List<List<String>> expected = new List<List<String>>{
            new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Fee_Type__c' },
            new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Record_Type__c' },
            new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Calculation_Type__c' },
            new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Paid_By__c' },
            new List<String>{ 'LLC_BI__Policy_Exception__c', 'LLC_BI__Status__c' },
            new List<String>{ 'LLC_BI__Legal_Entities__c', 'LLC_BI__Borrower_Type__c' },
            new List<String>{ 'LLC_BI__Loan_Collateral2__c', 'LLC_BI__Lien_Position__c' },
            new List<String>{ 'Case', 'Type' },
            new List<String>{ 'Case', 'Origin' },
            new List<String>{ 'LLC_BI__Collateral__c', 'LLC_BI__Collateral_Type__c' },
            new List<String>{ 'LLC_BI__Covenant2__c', 'LLC_BI__Covenant_Type__c' }
        };
        for (List<String> pair : expected) {
            Customer360Catalog.CatalogField cf = field(res, pair[0], pair[1]);
            System.assertNotEquals(null, cf, pair[0] + '.' + pair[1] + ' is missing from the catalog');
            System.assert(cf.values != null && !cf.values.isEmpty(),
                pair[0] + '.' + pair[1] + ' resolved but returned no active value');
            for (Customer360Catalog.CatalogValue v : cf.values) {
                System.assert(String.isNotBlank(v.label), 'Every value carries a label a banker can read');
                System.assert(String.isNotBlank(v.value), 'And the value the write path wants');
            }
        }
        System.assertEquals(expected.size(), res.fields.size(),
            'The catalog returns exactly the declared fields, no more: ' + JSON.serialize(res.fields));
    }

    @IsTest
    static void thePolicyExceptionStatusesAreTheThreeTheWritePathDemands() {
        Test.startTest();
        Customer360Catalog.Response res = read();
        Test.stopTest();

        Set<String> statuses = new Set<String>();
        for (Customer360Catalog.CatalogValue v : field(res, 'LLC_BI__Policy_Exception__c', 'LLC_BI__Status__c').values) {
            statuses.add(v.value);
        }
        System.assert(statuses.contains('Waived') && statuses.contains('Mitigated') && statuses.contains('Unmitigated'),
            'All three outcomes are offered, because an exception the bank waived and one nothing mitigates are different facts: ' + statuses);
    }

    @IsTest
    static void theInvolvementRolesSayWhichFiveTheWritePathAccepts() {
        Test.startTest();
        Customer360Catalog.Response res = read();
        Test.stopTest();

        Customer360Catalog.CatalogField roles = field(res, 'LLC_BI__Legal_Entities__c', 'LLC_BI__Borrower_Type__c');
        Set<String> offered = new Set<String>();
        for (Customer360Catalog.CatalogValue v : roles.values) {
            offered.add(v.value);
        }
        Set<String> accepted = new Set<String>(roles.acceptedValues);

        System.assertEquals(5, accepted.size(), 'Five roles are legal on a borrowing-structure change: ' + accepted);
        System.assert(accepted.contains('Limited Guarantor'),
            'Limited Guarantor is its own role and must never be flattened to Guarantor');
        System.assert(offered.contains('Grantor'),
            'Grantor is returned, because the room NAMES it as refused rather than hiding it');
        System.assertEquals(false, accepted.contains('Grantor'),
            'And it is not accepted: collateral semantics, not borrowing structure');
        System.assertEquals(false, accepted.contains('Contractor'),
            'Nor Contractor: construction semantics');
    }

    @IsTest
    static void theTwoLookupCatalogsReturnRecordIdsAndSayWhyItMatters() {
        Test.startTest();
        Customer360Catalog.Response res = read();
        Test.stopTest();

        Customer360Catalog.CatalogField colTypes = field(res, 'LLC_BI__Collateral__c', 'LLC_BI__Collateral_Type__c');
        Customer360Catalog.CatalogField covTypes = field(res, 'LLC_BI__Covenant2__c', 'LLC_BI__Covenant_Type__c');

        System.assertEquals('catalog', colTypes.source, 'A lookup is not a picklist and the shape says so');
        System.assertEquals('catalog', covTypes.source, 'Same for the covenant type');
        System.assertEquals(Id.valueOf(colTypes.values[0].value), colTypes.values[0].value,
            'A catalog value is a record Id, which is what the write path wants for a duplicated name');
        System.assertEquals(Id.valueOf(covTypes.values[0].value), covTypes.values[0].value,
            'Same for the covenant type catalog');
        System.assert(covTypes.note.contains('typeId'),
            'And the note tells a chip builder to send the id: ' + covTypes.note);
        System.assert(covTypes.note.contains('1 of these names'),
            'The note COUNTS the duplicated names, because a chip built on one of them ends in an ambiguity refusal: ' + covTypes.note);

        // Every seeded collateral type carries its own advance rate, because the org's
        // Advance_Rate_should_not_be_null rule refuses one that does not, so all of them are
        // accepted here. The filter is what keeps a rateless legacy type out of the chip set.
        Id rated = [SELECT Id FROM LLC_BI__Collateral_Type__c WHERE Name = 'ZZ-CATALOG-TEST Equipment' LIMIT 1].Id;
        Set<String> accepted = new Set<String>(colTypes.acceptedValues);
        System.assert(accepted.contains(String.valueOf(rated)), 'A type carrying its own rate is accepted');
        System.assertEquals(colTypes.values.size(), accepted.size(),
            'And every type this fixture could create carries one, so none is filtered out');
        System.assert(colTypes.note.contains('Advance_Rate_should_not_be_null'),
            'The note names the org rule the filter exists for: ' + colTypes.note);
    }

    /** An empty request list still answers: the normal call carries no input at all. */
    @IsTest
    static void anEmptyRequestListStillAnswers() {
        Test.startTest();
        List<Customer360Catalog.Response> res =
            Customer360Catalog.getCatalog(new List<Customer360Catalog.Request>());
        Test.stopTest();

        System.assertEquals(1, res.size(), 'One answer, because there is one answer to give');
        System.assert(!res[0].fields.isEmpty(), 'And it carries the catalog');
    }

    /**
     * Scoping to one object answers about that object alone. It exists because the two catalog
     * entries are 43 and 71 RECORDS and a fee elicitation has no use for either.
     */
    @IsTest
    static void scopingToOneObjectLeavesTheCatalogsBehind() {
        Customer360Catalog.Request req = new Customer360Catalog.Request();
        req.objectNames = new List<String>{ 'LLC_BI__Fee__c' };

        Test.startTest();
        Customer360Catalog.Response res =
            Customer360Catalog.getCatalog(new List<Customer360Catalog.Request>{ req })[0];
        Test.stopTest();

        System.assertEquals(4, res.fields.size(), 'The four fee fields and nothing else: ' + JSON.serialize(res.fields));
        for (Customer360Catalog.CatalogField cf : res.fields) {
            System.assertEquals('LLC_BI__Fee__c', cf.objectName, 'Only the object that was asked for');
        }
        System.assertEquals(null, field(res, 'LLC_BI__Covenant2__c', 'LLC_BI__Covenant_Type__c'),
            'The 71-record covenant catalog is not paid for by a call that did not ask for it');
    }
}
