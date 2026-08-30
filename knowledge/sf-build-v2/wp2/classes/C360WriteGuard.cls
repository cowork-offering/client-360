/**
 * C360WriteGuard - the A33.3.1 per-action transition allowlist, enforced in Apex.
 *
 * A33.3.1 is explicit that this is the primary fence for Case, Collateral Valuation and
 * Review: withholding LLC_BI__Exclude_Validation fences Loan stage movement and nothing
 * else, so those three objects need their own wall. "Anything not on this table is refused
 * by the tool, not merely absent from the UI."
 *
 * Every write in this package passes through assertAllowed(), including the ones that are
 * refused, so a refusal is provable by calling the same entry point the tool calls rather
 * than by the absence of a code path.
 *
 * The allowlist is hardcoded deliberately. It is a control, not a business threshold: A26.2
 * bans hardcoded business literals, and a state fence is not one. Bank thresholds live in the
 * policy pack (A33.2.5a) and never appear here.
 */
public with sharing class C360WriteGuard {

    /** Raised when a tool attempts a write the allowlist does not permit. */
    public class GuardException extends Exception {}

    public static final String OBJ_CASE = 'Case';
    public static final String OBJ_VALUATION = 'LLC_BI__Collateral_Valuation__c';
    public static final String OBJ_REVIEW = 'LLC_BI__Review__c';
    // Wave 2 additions. Every state below is probe-backed in PROBE-LEDGER wave 3.
    public static final String OBJ_LOAN = 'LLC_BI__Loan__c';
    public static final String OBJ_RISK_RATING = 'LLC_BI__Annual_Review__c';
    public static final String OBJ_COVENANT_COMPLIANCE = 'LLC_BI__Covenant_Compliance2__c';
    public static final String OBJ_PRODUCT_PACKAGE = 'LLC_BI__Product_Package__c';
    public static final String OBJ_INVOLVEMENT = 'LLC_BI__Legal_Entities__c';

    public static final String OP_CREATE = 'create';
    public static final String OP_UPDATE = 'update';
    public static final String OP_DELETE = 'delete';
    /**
     * The versioning carry (2026-08-30). nCino's credit-action engine copies NO junction rows in
     * this org: the related-lists copy configuration only ever fed the retired classic wizard's
     * checklist (verified live: all eight defaults on, engine run, zero rows landed, no copy job
     * enqueued). Package methodology requires every member's junction graph to carry onto the new
     * version, so the execute tool composes the carry itself. OP_CARRY exists so that composition
     * passes THIS gate like every other write, under its own doctrine: it may only REPLICATE rows
     * that already exist on a version parent, onto a clone the same transaction created, with the
     * anchor lookups retargeted and nothing else authored.
     */
    public static final String OP_CARRY = 'carry';

    public static final String OBJ_LOAN_COVENANT = 'LLC_BI__Loan_Covenant__c';
    public static final String OBJ_PLEDGE = 'LLC_BI__Loan_Collateral2__c';
    public static final String OBJ_PLEDGE_AGGREGATE = 'LLC_BI__Loan_Collateral_Aggregate__c';

    /** The junction graph OP_CARRY may replicate, and nothing else. */
    private static final Set<String> CARRY_OBJECTS = new Set<String>{
        OBJ_LOAN_COVENANT, OBJ_PLEDGE, OBJ_PLEDGE_AGGREGATE, OBJ_INVOLVEMENT
    };

    /**
     * Fields OP_CARRY must never write even as copies: the mutually-exclusive contingent amount
     * (15v), the formula flags, and every rollup the org derives itself.
     */
    private static final Map<String, Set<String>> CARRY_FORBIDDEN = new Map<String, Set<String>>{
        OBJ_LOAN_COVENANT => new Set<String>(),
        OBJ_PLEDGE => new Set<String>{
            'LLC_BI__Advance_Rate__c', 'LLC_BI__Current_Lendable_Value__c', 'LLC_BI__Collateral_Value__c',
            'LLC_BI__Total_Pledged_Rollup_Value__c', 'LLC_BI__Total_Pledged_Rollup_Lendable_Value__c'
        },
        OBJ_PLEDGE_AGGREGATE => new Set<String>(),
        OBJ_INVOLVEMENT => new Set<String>{
            'LLC_BI__Is_Borrower__c', 'LLC_BI__Is_Guarantor__c', 'LLC_BI__Is_CoBorrower__c',
            'LLC_BI__Is_Grantor__c', 'LLC_BI__Is_Related_Entity__c', 'LLC_BI__Contingent_Amount__c'
        }
    };

    /**
     * The only states each object may be CREATED with (A33.3.1). A field present here must
     * carry exactly the listed value; an empty map means the object has no state fence on
     * create, only the forbidden-field list below.
     */
    private static final Map<String, Map<String, String>> CREATE_STATES = new Map<String, Map<String, String>>{
        OBJ_CASE => new Map<String, String>{ 'Status' => 'New' },
        OBJ_REVIEW => new Map<String, String>{ 'LLC_BI__Status__c' => 'In Progress' },
        OBJ_VALUATION => new Map<String, String>(),
        // Probe 5: a six-field payload at Qualification/Open passed 21 validation rules.
        OBJ_LOAN => new Map<String, String>{
            'LLC_BI__Stage__c' => 'Qualification',
            'LLC_BI__Status__c' => 'Open',
            'LLC_BI__isRenewal__c' => 'false',
            'LLC_BI__Is_Modification__c' => 'false'
        },
        // Probe 4: status defaults to 'Not Approved', which reads as a DECISION rather than as an
        // absent value. Worse than Review's null, so the create state is mandatory here.
        OBJ_RISK_RATING => new Map<String, String>{ 'LLC_BI__Status__c' => 'In Review' },
        // Package creation is name and account only. Live SOQL over this org: all 12 most recent
        // packages carry a NULL RecordTypeId, including the ones nCino's own wizard created, and
        // 516 of 518 follow the "<Account> - <M/D/YYYY> - PP" convention. We match the org rather
        // than inventing a shape, and we set no stage or status: PPCacheCreation and
        // ProductPackageBaselineCaptureTrigger own what happens next and swallow their own failures.
        OBJ_PRODUCT_PACKAGE => new Map<String, String>(),
        // Borrowing structure. This wave creates the Borrower row only; the fuller role set arrives
        // with the borrowing-structure UI. The role IS the flag on this object: there is no
        // primary-borrower boolean, and the Is_* fields are formulas derived from Borrower_Type.
        OBJ_INVOLVEMENT => new Map<String, String>{ 'LLC_BI__Borrower_Type__c' => 'Borrower' }
    };

    /**
     * Objects this wave may UPDATE, and the only field transitions permitted on each.
     * Key is object, then field, then the set of values that field may be moved TO.
     *
     * Probe 8 settled the covenant question from Flow metadata with zero writes:
     * acnpex_covenantApprovalProcess is recordTriggerType Create with filters [], so it fires on
     * CREATE ONLY and never on any update. An update-only tool therefore cannot start the bank's
     * approval chain by construction. That is why compliance records are update-only here and are
     * absent from CREATE_STATES entirely.
     */
    private static final Map<String, Map<String, Set<String>>> UPDATE_TRANSITIONS =
        new Map<String, Map<String, Set<String>>>{
            // The complete-status set is nCino's, read from the org: LLC_BI__Status__c offers
            // Compliant, Exception, In Progress, Pending and Waived, and `Waived` is one of the
            // three default Record Create Trigger Statuses. Waiving is a real outcome of a covenant
            // review, and an allowlist that could not express it forced the banker out of the tool
            // with the decision unrecorded. `Pending` and `In Progress` stay off: they are where a
            // row starts, never where a review leaves it. This org's compliance status picklist
            // carries no separate non-compliant value; a failed test is Exception plus a Reason for
            // Exception of Breached, which is why that field is fenced here too.
            OBJ_COVENANT_COMPLIANCE => new Map<String, Set<String>>{
                'LLC_BI__Status__c' => new Set<String>{ 'Compliant', 'Waived', 'Exception' },
                'LLC_BI__Reason_for_Exception__c' => new Set<String>{ 'Breached', 'Overdue' }
            },
            // A33.3.1 / A33.7 Q6: exactly one hop, and only after Loan Detail verification.
            // Probe 9 finding 2 proved this hop headlessly; Booked stays unreachable (LV06).
            OBJ_LOAN => new Map<String, Set<String>>{
                'LLC_BI__Stage__c' => new Set<String>{ 'Proposal' }
            },
            // Package versioning repair (2026-08-30). The credit-action engine names the new package
            // version itself and was observed to produce a blank account prefix ("- 8/30/2026 - PP",
            // shape probe, rolled back). The one package update this wave performs is the Name repair
            // to the org's own "<Account> - <M/D/YYYY> - PP" convention (516 of 518 packages follow
            // it). RecordTypeId, Stage and Status remain forbidden below; Name is free text, so no
            // state fence applies.
            OBJ_PRODUCT_PACKAGE => new Map<String, Set<String>>()
        };

    /**
     * Fields no tool of ours may write, whatever the value. Review record type is assigned by
     * the Review After Save flow (probe 3, PROBE-LEDGER); cm_Review_Stage__c is read and
     * labelled, never written, and its 'Approval' value is unreachable for anyone (RV01);
     * cm_Approved_Date__c belongs to the org's own approval path.
     */
    private static final Map<String, Set<String>> FORBIDDEN_FIELDS = new Map<String, Set<String>>{
        OBJ_REVIEW => new Set<String>{ 'RecordTypeId', 'cm_Review_Stage__c', 'cm_Approved_Date__c' },
        OBJ_VALUATION => new Set<String>{ 'LLC_BI__Lendable_Value__c' },
        OBJ_CASE => new Set<String>(),
        // Formula and rollup fields, plus the chain anchor A33.4.1 names that DOES NOT EXIST in
        // this org (probe 5 spec correction: LLC_BI__RootLoanId__c returns INVALID_FIELD).
        OBJ_LOAN => new Set<String>{
            'LLC_BI__hasRenewal__c', 'LLC_BI__Number_Of_Renewals__c', 'LLC_BI__RootLoanId__c'
        },
        // Probe 4: this object has NO RecordTypeId and NO OwnerId field at all, so an attempt to
        // set either fails at the platform. Final_Risk_Grade is a formula.
        OBJ_RISK_RATING => new Set<String>{
            'LLC_BI__Final_Risk_Grade__c', 'RecordTypeId', 'OwnerId'
        },
        // Set-once at creation, and creation is not ours. Writing the parent's effective date
        // corrupts the whole compliance schedule (PDI-00023403, unresolved).
        OBJ_COVENANT_COMPLIANCE => new Set<String>{
            'LLC_BI__Covenant__c', 'LLC_BI__Effective_Date__c'
        },
        // No record type: real packages in this org have none, and A33.4.3(d)'s Deal_Proposal
        // concern was moot (probe 9: only Master is available to the running profile anyway).
        // No stage or status either: those belong to the org's own package automation.
        OBJ_PRODUCT_PACKAGE => new Set<String>{
            'RecordTypeId', 'LLC_BI__Stage__c', 'LLC_BI__Status__c'
        },
        // The Is_* fields are FORMULAS derived from Borrower_Type (LESSONS 15u): writing one is
        // impossible and asking for it is a design error worth naming. Contingent Amount is
        // forbidden because it is mutually exclusive with Ownership on a single row and the VR's
        // only escape tests for a Household role value that does not exist in this org (15v).
        OBJ_INVOLVEMENT => new Set<String>{
            'LLC_BI__Is_Borrower__c', 'LLC_BI__Is_Guarantor__c', 'LLC_BI__Is_CoBorrower__c',
            'LLC_BI__Is_Grantor__c', 'LLC_BI__Is_Related_Entity__c', 'LLC_BI__Contingent_Amount__c'
        }
    };

    /**
     * Objects this wave may create and nothing else. All three shipping actions create and
     * stop: Case takes no status transition and no closure, the valuation object takes no
     * updates or deletes at all (sub-collateral creation is refused outright), and Review
     * hands off to nCino's Submit for Approval rather than reaching Complete.
     */
    private static final Set<String> CREATE_ONLY = new Set<String>{ OBJ_CASE, OBJ_VALUATION, OBJ_REVIEW, OBJ_INVOLVEMENT };

    /** Every object the fence knows about, in either direction. */
    private static final Set<String> KNOWN_OBJECTS = new Set<String>{
        OBJ_CASE, OBJ_VALUATION, OBJ_REVIEW, OBJ_LOAN, OBJ_RISK_RATING, OBJ_COVENANT_COMPLIANCE,
        OBJ_PRODUCT_PACKAGE, OBJ_INVOLVEMENT
    };

    /**
     * The single gate every domain write in this package passes through (A33.5.8 doctrine).
     *
     * @param objectApiName The target object API name.
     * @param operation One of OP_CREATE, OP_UPDATE, OP_DELETE.
     * @param values The field values the tool intends to write, keyed by field API name.
     *        Ignored for update and delete, which are refused outright for this wave.
     * @throws GuardException when the object is unknown to the allowlist, when the operation
     *         is not permitted, when a forbidden field is present, or when a state field
     *         carries a value the allowlist does not permit.
     */
    public static void assertAllowed(String objectApiName, String operation, Map<String, Object> values) {
        // The carry has its own object table: junction objects are deliberately NOT in
        // KNOWN_OBJECTS, because no create/update/delete arm may ever reach them.
        if (operation == OP_CARRY) {
            assertCarryAllowed(objectApiName, values);
            return;
        }

        if (!KNOWN_OBJECTS.contains(objectApiName)) {
            throw new GuardException(
                'Refused: no transition allowlist exists for ' + objectApiName +
                '. A33.3.1 refuses anything not on the table.'
            );
        }

        if (operation == OP_DELETE) {
            throw new GuardException('Refused: this tool never deletes ' + objectApiName + ' (A33.3.1).');
        }

        if (operation == OP_UPDATE) {
            assertUpdateAllowed(objectApiName, values);
            return;
        }

        if (!CREATE_STATES.containsKey(objectApiName)) {
            throw new GuardException(
                'Refused: ' + objectApiName + ' is never created by this tool (A33.3.1). ' +
                'Generation is the bank\'s managed automation, and on this object a create is what ' +
                'starts the approval chain.'
            );
        }

        assertObjectWritable(objectApiName);

        Set<String> forbidden = FORBIDDEN_FIELDS.get(objectApiName);
        for (String f : values.keySet()) {
            if (forbidden.contains(f)) {
                throw new GuardException('Refused: ' + objectApiName + '.' + f + ' is never written by this tool (A33.3.1).');
            }
        }

        Map<String, String> required = CREATE_STATES.get(objectApiName);
        for (String stateField : required.keySet()) {
            Object supplied = values.get(stateField);
            String allowed = required.get(stateField);
            if (supplied == null || String.valueOf(supplied) != allowed) {
                throw new GuardException(
                    'Refused: ' + objectApiName + ' may be created only with ' + stateField + ' = \'' + allowed +
                    '\' (A33.3.1). Supplied: ' + String.valueOf(supplied) + '.'
                );
            }
        }
    }

    /**
     * Enforces the update side of the allowlist: only the named fields, only to the named values,
     * and never a forbidden field.
     *
     * @param objectApiName The target object API name.
     * @param values The field values the tool intends to write.
     * @throws GuardException when the object takes no update, or a field or value is not permitted.
     */
    private static void assertUpdateAllowed(String objectApiName, Map<String, Object> values) {
        Map<String, Set<String>> allowed = UPDATE_TRANSITIONS.get(objectApiName);
        if (allowed == null) {
            throw new GuardException(
                'Refused: ' + objectApiName + ' takes no update from this tool (A33.3.1). ' +
                'The bank\'s own process owns every state after creation.'
            );
        }

        Set<String> forbidden = FORBIDDEN_FIELDS.get(objectApiName);
        for (String f : values.keySet()) {
            if (forbidden != null && forbidden.contains(f)) {
                throw new GuardException('Refused: ' + objectApiName + '.' + f + ' is never written by this tool (A33.3.1).');
            }
            if (allowed.containsKey(f)) {
                String supplied = String.valueOf(values.get(f));
                if (!allowed.get(f).contains(supplied)) {
                    List<String> ok = new List<String>(allowed.get(f));
                    ok.sort();
                    throw new GuardException(
                        'Refused: ' + objectApiName + '.' + f + ' may only move to ' + String.join(ok, ' or ') +
                        ' (A33.3.1). Supplied: ' + supplied + '.'
                    );
                }
            }
        }
    }

    /**
     * Enforces the carry side of the allowlist: only the junction graph, and never a field the
     * org derives or forbids. The caller owns the scoping doctrine (replicas of version-parent
     * rows onto same-transaction clones); this gate owns the object and field fences.
     *
     * @param objectApiName The junction object being replicated.
     * @param values The field values of ONE replica row, keyed by field API name.
     * @throws GuardException when the object is not carryable or a forbidden field is present.
     */
    private static void assertCarryAllowed(String objectApiName, Map<String, Object> values) {
        if (!CARRY_OBJECTS.contains(objectApiName)) {
            throw new GuardException(
                'Refused: ' + objectApiName + ' is not part of the junction graph the versioning carry may replicate.'
            );
        }
        Set<String> forbidden = CARRY_FORBIDDEN.get(objectApiName);
        for (String f : values.keySet()) {
            if (forbidden.contains(f)) {
                throw new GuardException(
                    'Refused: ' + objectApiName + '.' + f + ' is never written by the carry, even as a copy: ' +
                    'the org derives or forbids it.'
                );
            }
        }
    }

    /**
     * Confirms the running identity can actually create the object before a plan promises it
     * will. A refusal here is a permissions answer, not a validation-rule answer, and the two
     * read very differently to a banker.
     *
     * @param objectApiName The target object API name.
     * @throws GuardException when the object is not createable by the running identity.
     */
    private static void assertObjectWritable(String objectApiName) {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName);
        if (t == null || !t.getDescribe().isCreateable()) {
            throw new GuardException(
                'Refused: the running identity cannot create ' + objectApiName +
                '. Grant object create permission before running this tool.'
            );
        }
    }

    /**
     * Applies FLS on create and then proves the fields that must survive actually did.
     *
     * stripInaccessible silently drops fields the running identity cannot create. On Review
     * that is not a cosmetic loss: probe 3 proved nothing defaults Status or Review_Type, so a
     * stripped Status would file a Review in no status at all. PROBE-LEDGER outstanding item 3
     * names FLS drift between System Administrator and the service identity as a live risk,
     * which is why this fails loudly rather than writing whatever survived.
     *
     * @param record The record about to be inserted.
     * @param mustSurvive Field API names whose loss invalidates the write.
     * @return The security-decorated record, safe to insert.
     * @throws GuardException when a required field was stripped by FLS.
     */
    public static SObject stripAndVerify(SObject record, Set<String> mustSurvive) {
        SObjectAccessDecision decision = Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ record });
        SObject clean = decision.getRecords()[0];

        Map<String, Set<String>> removed = decision.getRemovedFields();
        for (String obj : removed.keySet()) {
            for (String f : removed.get(obj)) {
                if (mustSurvive.contains(f)) {
                    throw new GuardException(
                        'Refused: field-level security stripped ' + obj + '.' + f + ', which this action must set explicitly. ' +
                        'Grant the service identity edit access on that field before running this tool.'
                    );
                }
            }
        }
        return clean;
    }
}
