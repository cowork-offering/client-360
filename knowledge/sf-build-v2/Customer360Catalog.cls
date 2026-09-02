/**
 * Customer360Catalog - MCP tool: the org's own value lists for every field the room writes.
 *
 * Founder, 2026-09-02: "picklist values, fee types, it shows them up". The room's create chips came
 * from a SHELL MIRROR of these lists: accurate for this org on the day it was written, a copy all
 * the same, and Case.Type and Case.Origin had never been read off this org at all. A mirror drifts
 * silently, and the first anyone hears of the drift is a refusal at the confirm gate.
 *
 * So this is one READ, in one pass, returning what the org actually holds. The shell reads it once
 * per view and caches it; every create chip set is drawn from it.
 *
 * TWO KINDS OF LIST, and the difference is not cosmetic. Most of these fields are picklists and
 * their values come off the field's own describe. Two are LOOKUPS: the collateral type on
 * LLC_BI__Collateral__c and the covenant type on LLC_BI__Covenant2__c both point at a config OBJECT
 * (43 and 71 records here), so their values are records, their `value` is a record Id, and their
 * names are NOT unique. `source` says which kind each entry is, and the id is what the write path
 * wants for a duplicated name anyway.
 *
 * ACCEPTED IS NARROWER THAN ACTIVE on two fields, and saying so is the point of `acceptedValues`:
 * the involvement roles Grantor and Contractor exist on the org and are refused by the write path
 * (collateral and construction semantics, not borrowing structure), and a collateral type whose own
 * advance rate is null is refused before the org's Advance_Rate_should_not_be_null rule can fire.
 * The room shows the legal ones and NAMES the refused ones rather than hiding them.
 *
 * READ ONLY. No DML anywhere in this class, no guard involvement, WITH USER_MODE on both queries
 * and an accessibility check on every field: a banker sees the values a banker may see.
 */
global with sharing class Customer360Catalog {

    global class Request {
        @InvocableVariable(label='Object Names' description='Optional. Restrict the answer to these objects (LLC_BI__Fee__c, LLC_BI__Policy_Exception__c, LLC_BI__Legal_Entities__c, LLC_BI__Loan_Collateral2__c, Case, LLC_BI__Collateral__c, LLC_BI__Covenant2__c). OMIT IT AND YOU GET EVERYTHING, which is the normal call: the shell reads the whole catalog once per view and caches it. It exists because the two catalog entries are 43 and 71 RECORDS, and a fee elicitation has no use for either.')
        global List<String> objectNames;
    }

    global class CatalogValue {
        @InvocableVariable(label='Label' description='What a banker reads. For a catalog entry this is the record Name, which is NOT unique.')
        global String label;
        @InvocableVariable(label='Value' description='What the write path wants: the picklist API value, or the record Id for a catalog entry.')
        global String value;
    }

    global class CatalogField {
        @InvocableVariable(label='Object')
        global String objectName;
        @InvocableVariable(label='Field')
        global String fieldName;
        @InvocableVariable(label='Source' description='picklist = the field\'s own active values. catalog = records of the object this lookup points at, because the field is a lookup and has no picklist.')
        global String source;
        @InvocableVariable(label='Values' description='Every value the ORG offers, active only.')
        global List<CatalogValue> values;
        @InvocableVariable(label='Accepted Values' description='The subset the WRITE PATH accepts, where it is narrower than what the org offers. Empty means the write path accepts everything in values.')
        global List<String> acceptedValues;
        @InvocableVariable(label='Note' description='What a chip builder has to know about this list that the values do not say themselves.')
        global String note;
    }

    global class Response {
        @InvocableVariable(label='Fields')
        global List<CatalogField> fields;
        @InvocableVariable(label='Note')
        global String note;
    }

    /** The five roles a borrowing-structure change may carry. Grantor and Contractor are refused. */
    private static final List<String> INVOLVEMENT_ROLES_ACCEPTED = new List<String>{
        'Borrower', 'Co-Borrower', 'Guarantor', 'Limited Guarantor', 'Related Entity'
    };

    /** The picklist fields, in the order a chip builder wants them. */
    private static final List<List<String>> PICKLIST_FIELDS = new List<List<String>>{
        new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Fee_Type__c' },
        new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Record_Type__c' },
        new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Calculation_Type__c' },
        new List<String>{ 'LLC_BI__Fee__c', 'LLC_BI__Paid_By__c' },
        new List<String>{ 'LLC_BI__Policy_Exception__c', 'LLC_BI__Status__c' },
        new List<String>{ 'LLC_BI__Legal_Entities__c', 'LLC_BI__Borrower_Type__c' },
        new List<String>{ 'LLC_BI__Loan_Collateral2__c', 'LLC_BI__Lien_Position__c' },
        new List<String>{ 'Case', 'Type' },
        new List<String>{ 'Case', 'Origin' }
    };

    private static final Map<String, String> FIELD_NOTES = new Map<String, String>{
        'LLC_BI__Fee__c.LLC_BI__Fee_Type__c' =>
            'This picklist is residential and TRID. A C&I fee has no value in it, which is why the fee arm sends "Other" plus a description: Name on a fee is an autonumber, so the description is the only readable label there is.',
        'LLC_BI__Fee__c.LLC_BI__Record_Type__c' =>
            'The independent picklist, NOT RecordTypeId. Three Fee record types exist in this org and none is assigned to the integration user\'s profile, so setting RecordTypeId returns INVALID_CROSS_REFERENCE_KEY.',
        'LLC_BI__Fee__c.LLC_BI__Calculation_Type__c' =>
            'A Percentage fee carries a percentage and a basis source and NO amount: the org\'s FeeTrigger derives the money from the clone\'s commitment. A Flat Amount fee carries an amount and no percentage.',
        'LLC_BI__Policy_Exception__c.LLC_BI__Status__c' =>
            'All three are real outcomes of logging an exception. The org DEFAULTS a new row to Unmitigated, which reads as a decision nobody made, so the write path demands the status rather than accepting the default. LLC_BI__Type__c beside it is a TEXT field and not a picklist: every one of this org\'s rows carries "Policy".',
        'LLC_BI__Legal_Entities__c.LLC_BI__Borrower_Type__c' =>
            'Grantor and Contractor exist on the object and are REFUSED by the write path: they are collateral and construction semantics, not borrowing structure. Name them as refused rather than hiding them.',
        'Case.Type' =>
            'Never read off this org before today. The service request arm takes free text and re-offers the org\'s legal values on refusal, so nothing here is enforced by the arm itself.',
        'Case.Origin' =>
            'Never read off this org before today. Same as Case.Type: free text on the arm, this list is what the ORG will accept.'
    };

    @InvocableMethod(
        label='Customer 360: Value Catalog'
        description='The ORG\'s own value lists for every field the workroom writes, in one pass: fee type, fee record type, calculation type and paid-by, policy exception status, involvement role, lien position, Case type and origin, plus the collateral type and covenant type CATALOGS (those two are lookups to config objects, so their values are record ids and their names are not unique). Use it to build create chips from the org rather than from a mirror. Read only.'
    )
    global static List<Response> getCatalog(List<Request> requests) {
        List<Response> results = new List<Response>();
        List<Request> asked = requests == null || requests.isEmpty()
            ? new List<Request>{ new Request() }
            : requests;

        // ONE describe pass for every object this call can answer about, rather than one per field.
        Set<String> allObjects = new Set<String>();
        for (List<String> pair : PICKLIST_FIELDS) {
            allObjects.add(pair[0]);
        }
        List<Schema.DescribeSObjectResult> described =
            Schema.describeSObjects(new List<String>(allObjects));
        Map<String, Schema.DescribeSObjectResult> byObject = new Map<String, Schema.DescribeSObjectResult>();
        for (Schema.DescribeSObjectResult d : described) {
            byObject.put(d.getName(), d);
        }

        // The two catalog reads are hoisted out of the loop: they are the same answer for every
        // request in a bulk call, and a Flow sending 200 rows would otherwise pay 400 queries for it.
        CatalogField collateralCatalog = null;
        CatalogField covenantCatalog = null;

        for (Request req : asked) {
            Set<String> wanted = new Set<String>();
            if (req.objectNames != null) {
                for (String o : req.objectNames) {
                    if (String.isNotBlank(o)) {
                        wanted.add(o.trim());
                    }
                }
            }
            List<CatalogField> fields = new List<CatalogField>();
            for (List<String> pair : PICKLIST_FIELDS) {
                if (!wanted.isEmpty() && !wanted.contains(pair[0])) {
                    continue;
                }
                CatalogField cf = picklistField(byObject, pair[0], pair[1]);
                if (cf != null) {
                    fields.add(cf);
                }
            }
            if (wanted.isEmpty() || wanted.contains('LLC_BI__Collateral__c')) {
                if (collateralCatalog == null) {
                    collateralCatalog = collateralTypes();
                }
                fields.add(collateralCatalog);
            }
            if (wanted.isEmpty() || wanted.contains('LLC_BI__Covenant2__c')) {
                if (covenantCatalog == null) {
                    covenantCatalog = covenantTypes();
                }
                fields.add(covenantCatalog);
            }

            Response res = new Response();
            res.fields = fields;
            res.note =
                'Every list here is the ORG\'s, read live. `source` says whether an entry came off a field describe or off a ' +
                'config object: a catalog value is a RECORD ID, and catalog names are not unique in this org, so a chip built ' +
                'on a name alone will eventually be refused as ambiguous. Where acceptedValues is non-empty it is NARROWER ' +
                'than values, and the difference is what the write path refuses.';
            results.add(res);
        }
        return results;
    }

    /** One picklist field, active values only, skipped entirely where the user cannot read it. */
    private static CatalogField picklistField(
        Map<String, Schema.DescribeSObjectResult> byObject, String objectName, String fieldName
    ) {
        Schema.DescribeSObjectResult d = byObject.get(objectName);
        if (d == null) {
            return null;
        }
        Schema.SObjectField token = d.fields.getMap().get(fieldName);
        if (token == null) {
            return null;
        }
        Schema.DescribeFieldResult f = token.getDescribe();
        if (!f.isAccessible()) {
            return null;
        }
        CatalogField cf = new CatalogField();
        cf.objectName = objectName;
        cf.fieldName = fieldName;
        cf.source = 'picklist';
        cf.values = new List<CatalogValue>();
        cf.acceptedValues = new List<String>();
        cf.note = FIELD_NOTES.get(objectName + '.' + fieldName);
        for (Schema.PicklistEntry p : f.getPicklistValues()) {
            if (!p.isActive()) {
                continue;
            }
            CatalogValue v = new CatalogValue();
            v.label = p.getLabel();
            v.value = p.getValue();
            cf.values.add(v);
        }
        if (objectName == 'LLC_BI__Legal_Entities__c' && fieldName == 'LLC_BI__Borrower_Type__c') {
            cf.acceptedValues = new List<String>(INVOLVEMENT_ROLES_ACCEPTED);
        }
        return cf;
    }

    /**
     * The collateral-type catalog. A lookup, not a picklist, so these are records.
     *
     * A type whose OWN advance rate is null is refused by the write path before the org's
     * Advance_Rate_should_not_be_null rule can fire on the insert, so it is in `values` and NOT in
     * `acceptedValues`: the room can say the type exists and cannot be used, which is a better
     * answer than an absent chip.
     */
    private static CatalogField collateralTypes() {
        CatalogField cf = new CatalogField();
        cf.objectName = 'LLC_BI__Collateral__c';
        cf.fieldName = 'LLC_BI__Collateral_Type__c';
        cf.source = 'catalog';
        cf.values = new List<CatalogValue>();
        cf.acceptedValues = new List<String>();
        for (LLC_BI__Collateral_Type__c t : [
            SELECT Id, Name, LLC_BI__Advance_Rate__c
            FROM LLC_BI__Collateral_Type__c
            WITH USER_MODE
            ORDER BY Name ASC
        ]) {
            CatalogValue v = new CatalogValue();
            v.label = t.Name;
            v.value = String.valueOf(t.Id);
            cf.values.add(v);
            if (t.LLC_BI__Advance_Rate__c != null) {
                cf.acceptedValues.add(String.valueOf(t.Id));
            }
        }
        cf.note =
            'A LOOKUP to LLC_BI__Collateral_Type__c, so each value is a record Id. acceptedValues holds the types that ' +
            'carry their own advance rate; a type whose advance rate is null is refused before the org\'s ' +
            'Advance_Rate_should_not_be_null rule fires on the insert. The type\'s own rate is also what a pledge falls ' +
            'back to when no override is given.';
        return cf;
    }

    /**
     * The covenant-type catalog, and the reason ids matter here more than anywhere else: this org
     * carries DUPLICATE type names, so an ambiguous name is refused by the write path with the
     * candidate ids. A chip built on a name is a chip that sometimes ends in a refusal.
     */
    private static CatalogField covenantTypes() {
        CatalogField cf = new CatalogField();
        cf.objectName = 'LLC_BI__Covenant2__c';
        cf.fieldName = 'LLC_BI__Covenant_Type__c';
        cf.source = 'catalog';
        cf.values = new List<CatalogValue>();
        cf.acceptedValues = new List<String>();
        Map<String, Integer> byName = new Map<String, Integer>();
        for (LLC_BI__Covenant_Type__c t : [
            SELECT Id, Name FROM LLC_BI__Covenant_Type__c WITH USER_MODE ORDER BY Name ASC
        ]) {
            CatalogValue v = new CatalogValue();
            v.label = t.Name;
            v.value = String.valueOf(t.Id);
            cf.values.add(v);
            byName.put(t.Name, (byName.containsKey(t.Name) ? byName.get(t.Name) : 0) + 1);
        }
        Integer duplicated = 0;
        for (String name : byName.keySet()) {
            if (byName.get(name) > 1) {
                duplicated++;
            }
        }
        cf.note =
            'A LOOKUP to LLC_BI__Covenant_Type__c, so each value is a record Id. ' + duplicated +
            ' of these names are carried by more than one record, and the write path refuses an ambiguous NAME with the ' +
            'candidate ids: send typeId. Every type here is fileable by id through covenantAddsJson. acceptedValues is ' +
            'empty because the org accepts them all; the room\'s own chip filter is narrower than the org and is the ' +
            'shell\'s decision, not this tool\'s.';
        return cf;
    }
}
