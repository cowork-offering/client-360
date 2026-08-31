/**
 * C360WriteGuardTest - the A33.3.1 transition allowlist, tested by attempting each refusal.
 *
 * BUILD-BRIEF-V2 WP2 criterion 4 is explicit that this must be "tested by attempting each and
 * asserting refusal, not by never trying". Every method here calls the same entry point the
 * execute tools call, with the value the allowlist forbids.
 */
@IsTest
private class C360WriteGuardTest {

    @IsTest
    static void reviewCompleteIsRefused() {
        C360TestFixture.armCalloutMock();
        Boolean refused = false;
        try {
            C360WriteGuard.assertAllowed(
                C360WriteGuard.OBJ_REVIEW,
                C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Status__c' => 'Complete' }
            );
        } catch (C360WriteGuard.GuardException e) {
            refused = true;
            System.assert(e.getMessage().contains('In Progress'), 'The refusal should name the only permitted state: ' + e.getMessage());
        }
        System.assertEquals(true, refused, 'A33.4.6(b) deleted the Complete transition. It must be refused.');
    }

    @IsTest
    static void reviewPendingApprovalIsRefused() {
        C360TestFixture.armCalloutMock();
        Boolean refused = false;
        try {
            C360WriteGuard.assertAllowed(
                C360WriteGuard.OBJ_REVIEW,
                C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Status__c' => 'Pending Approval' }
            );
        } catch (C360WriteGuard.GuardException e) {
            refused = true;
        }
        System.assertEquals(true, refused, 'Only In Progress is on the allowlist. Pending Approval belongs to the org.');
    }

    @IsTest
    static void reviewStageWriteIsRefusedForAnyValue() {
        C360TestFixture.armCalloutMock();
        for (String value : new List<String>{ 'Qualification', 'Approval', 'Complete' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(
                    C360WriteGuard.OBJ_REVIEW,
                    C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'LLC_BI__Status__c' => 'In Progress', 'cm_Review_Stage__c' => value }
                );
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
                System.assert(e.getMessage().contains('cm_Review_Stage__c'), 'The refusal should name the field: ' + e.getMessage());
            }
            System.assertEquals(true, refused, 'cm_Review_Stage__c is read and labelled, never written. Value tried: ' + value);
        }
    }

    @IsTest
    static void reviewRecordTypeIsRefused() {
        C360TestFixture.armCalloutMock();
        Boolean refused = false;
        try {
            C360WriteGuard.assertAllowed(
                C360WriteGuard.OBJ_REVIEW,
                C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Status__c' => 'In Progress', 'RecordTypeId' => '012000000000000AAA' }
            );
        } catch (C360WriteGuard.GuardException e) {
            refused = true;
        }
        System.assertEquals(true, refused, 'Probe 3: the Review After Save flow assigns the record type. We never set it.');
    }

    @IsTest
    static void caseStatusOtherThanNewIsRefused() {
        C360TestFixture.armCalloutMock();
        for (String value : new List<String>{ 'Closed', 'Escalated', 'In Progress' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(
                    C360WriteGuard.OBJ_CASE,
                    C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'Status' => value }
                );
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Case may be created at New only. Value tried: ' + value);
        }
    }

    @IsTest
    static void caseUpdateAndDeleteAreRefused() {
        C360TestFixture.armCalloutMock();
        for (String op : new List<String>{ C360WriteGuard.OP_UPDATE, C360WriteGuard.OP_DELETE }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_CASE, op, new Map<String, Object>{ 'Status' => 'New' });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
                System.assert(e.getMessage().contains(op), 'The refusal should name the operation: ' + e.getMessage());
            }
            System.assertEquals(true, refused, 'Case takes no status transition and no closure from this tool. Operation: ' + op);
        }
    }

    @IsTest
    static void valuationUpdateAndDeleteAreRefused() {
        C360TestFixture.armCalloutMock();
        for (String op : new List<String>{ C360WriteGuard.OP_UPDATE, C360WriteGuard.OP_DELETE }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_VALUATION, op, new Map<String, Object>());
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'A33.3.1 refuses updates and deletes on the valuation object. Operation: ' + op);
        }
    }

    @IsTest
    static void valuationLendableValueIsRefused() {
        C360TestFixture.armCalloutMock();
        Boolean refused = false;
        try {
            C360WriteGuard.assertAllowed(
                C360WriteGuard.OBJ_VALUATION,
                C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Lendable_Value__c' => 100 }
            );
        } catch (C360WriteGuard.GuardException e) {
            refused = true;
        }
        System.assertEquals(true, refused, 'Lendable value is a formula on the parent. The value goes on the valuation child.');
    }

    @IsTest
    static void objectOutsideTheAllowlistIsRefused() {
        C360TestFixture.armCalloutMock();
        Boolean refused = false;
        try {
            C360WriteGuard.assertAllowed('LLC_BI__LoanRenewal__c', C360WriteGuard.OP_CREATE, new Map<String, Object>());
        } catch (C360WriteGuard.GuardException e) {
            refused = true;
            System.assert(e.getMessage().contains('no transition allowlist'), 'The refusal should say why: ' + e.getMessage());
        }
        System.assertEquals(
            true,
            refused,
            'The chain junction is on no allowlist. Nothing in any wave may write to it.'
        );
    }

    @IsTest
    static void permittedCreatesPass() {
        C360TestFixture.armCalloutMock();
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_CASE, C360WriteGuard.OP_CREATE, new Map<String, Object>{ 'Status' => 'New' });
        C360WriteGuard.assertAllowed(
            C360WriteGuard.OBJ_REVIEW,
            C360WriteGuard.OP_CREATE,
            new Map<String, Object>{ 'LLC_BI__Status__c' => 'In Progress' }
        );
        C360WriteGuard.assertAllowed(
            C360WriteGuard.OBJ_VALUATION,
            C360WriteGuard.OP_CREATE,
            new Map<String, Object>{ 'LLC_BI__Value__c' => 100 }
        );
    }

    @IsTest
    static void loanCreateStateIsFencedToQualificationOpen() {
        C360TestFixture.armCalloutMock();
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN, C360WriteGuard.OP_CREATE, new Map<String, Object>{
            'LLC_BI__Stage__c' => 'Qualification', 'LLC_BI__Status__c' => 'Open',
            'LLC_BI__isRenewal__c' => false, 'LLC_BI__Is_Modification__c' => false
        });
        for (String stage : new List<String>{ 'Proposal', 'Booked', 'Credit Underwriting' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN, C360WriteGuard.OP_CREATE, new Map<String, Object>{
                    'LLC_BI__Stage__c' => stage, 'LLC_BI__Status__c' => 'Open',
                    'LLC_BI__isRenewal__c' => false, 'LLC_BI__Is_Modification__c' => false
                });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'A facility may only be created at Qualification. Tried: ' + stage);
        }
    }

    @IsTest
    static void loanMayHopOnlyToProposal() {
        C360TestFixture.armCalloutMock();
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN, C360WriteGuard.OP_UPDATE, new Map<String, Object>{ 'LLC_BI__Stage__c' => 'Proposal' });
        for (String stage : new List<String>{ 'Booked', 'Credit Underwriting', 'Qualification' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN, C360WriteGuard.OP_UPDATE, new Map<String, Object>{ 'LLC_BI__Stage__c' => stage });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Exactly one hop is allowlisted. Tried: ' + stage);
        }
    }

    @IsTest
    static void loanFormulaAndAbsentFieldsAreRefused() {
        C360TestFixture.armCalloutMock();
        for (String f : new List<String>{ 'LLC_BI__hasRenewal__c', 'LLC_BI__Number_Of_Renewals__c', 'LLC_BI__RootLoanId__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN, C360WriteGuard.OP_CREATE, new Map<String, Object>{
                    'LLC_BI__Stage__c' => 'Qualification', 'LLC_BI__Status__c' => 'Open',
                    'LLC_BI__isRenewal__c' => false, 'LLC_BI__Is_Modification__c' => false, f => 'x'
                });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Formula, rollup and non-existent fields are refused. Tried: ' + f);
        }
    }

    @IsTest
    static void riskRatingCreateStateIsFencedToInReview() {
        C360TestFixture.armCalloutMock();
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_RISK_RATING, C360WriteGuard.OP_CREATE, new Map<String, Object>{ 'LLC_BI__Status__c' => 'In Review' });
        for (String status : new List<String>{ 'Not Approved', 'Approved', 'Declined' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_RISK_RATING, C360WriteGuard.OP_CREATE, new Map<String, Object>{ 'LLC_BI__Status__c' => status });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Probe 4: the default reads as a decision, so only In Review is allowed. Tried: ' + status);
        }
    }

    @IsTest
    static void riskRatingRejectsFieldsTheObjectDoesNotHave() {
        C360TestFixture.armCalloutMock();
        for (String f : new List<String>{ 'RecordTypeId', 'OwnerId', 'LLC_BI__Final_Risk_Grade__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_RISK_RATING, C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'LLC_BI__Status__c' => 'In Review', f => 'x' });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Probe 4 proved this object has no RecordTypeId and no OwnerId. Tried: ' + f);
        }
    }

    @IsTest
    static void covenantComplianceIsUpdateOnlyAndNeverCreated() {
        C360TestFixture.armCalloutMock();
        Boolean refusedCreate = false;
        try {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_CREATE, new Map<String, Object>());
        } catch (C360WriteGuard.GuardException e) {
            refusedCreate = true;
            System.assert(e.getMessage().contains('approval chain'), 'The refusal should name the reason: ' + e.getMessage());
        }
        System.assertEquals(true, refusedCreate, 'Probe 8: a create is what fires the bank approval chain. It is refused outright.');

        // nCino's three complete statuses, all three on the allowlist. Waived joined them in the
        // bulk-review wave: it is one of the default Record Create Trigger Statuses and a real
        // outcome of a covenant review, and an allowlist that could not express it pushed the
        // banker out of the tool with the decision unrecorded.
        for (String status : new List<String>{ 'Compliant', 'Waived', 'Exception' }) {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_UPDATE, new Map<String, Object>{ 'LLC_BI__Status__c' => status });
        }

        for (String status : new List<String>{ 'Pending', 'In Progress', 'Non-Compliant' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_UPDATE, new Map<String, Object>{ 'LLC_BI__Status__c' => status });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused,
                'Pending and In Progress are where a row starts, never where a review leaves it, and this org\'s compliance status picklist ' +
                'carries no Non-Compliant value at all. Tried: ' + status);
        }
    }

    @IsTest
    static void theExceptionReasonIsFencedToTheOrgsTwoValues() {
        C360TestFixture.armCalloutMock();
        for (String reason : new List<String>{ 'Breached', 'Overdue' }) {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_UPDATE,
                new Map<String, Object>{ 'LLC_BI__Status__c' => 'Exception', 'LLC_BI__Reason_for_Exception__c' => reason });
        }
        Boolean refused = false;
        try {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_UPDATE,
                new Map<String, Object>{ 'LLC_BI__Status__c' => 'Exception', 'LLC_BI__Reason_for_Exception__c' => 'Vibes' });
        } catch (C360WriteGuard.GuardException e) {
            refused = true;
        }
        System.assertEquals(true, refused,
            'Reason for Exception is the field that separates a failed test from an undelivered document. It takes the org\'s two values and nothing else.');
    }

    @IsTest
    static void covenantSetOnceAndScheduleFieldsAreRefused() {
        C360TestFixture.armCalloutMock();
        for (String f : new List<String>{ 'LLC_BI__Covenant__c', 'LLC_BI__Effective_Date__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_UPDATE,
                    new Map<String, Object>{ 'LLC_BI__Status__c' => 'Compliant', f => 'x' });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Set-once and schedule-corrupting fields are refused. Tried: ' + f);
        }
    }

    @IsTest
    static void deleteIsRefusedEverywhere() {
        C360TestFixture.armCalloutMock();
        for (String obj : new List<String>{ C360WriteGuard.OBJ_CASE, C360WriteGuard.OBJ_LOAN, C360WriteGuard.OBJ_RISK_RATING, C360WriteGuard.OBJ_COVENANT_COMPLIANCE }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(obj, C360WriteGuard.OP_DELETE, new Map<String, Object>());
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'No tool deletes anything. Tried: ' + obj);
        }
    }

    @IsTest
    static void packageMayBeCreatedWithNameAndAccountOnly() {
        C360TestFixture.armCalloutMock();
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PRODUCT_PACKAGE, C360WriteGuard.OP_CREATE,
            new Map<String, Object>{ 'Name' => 'ACME - 7/26/2026 - PP', 'LLC_BI__Account__c' => '001000000000000AAA' });

        for (String f : new List<String>{ 'RecordTypeId', 'LLC_BI__Stage__c', 'LLC_BI__Status__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PRODUCT_PACKAGE, C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'Name' => 'x', f => 'y' });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused,
                'Real packages in this org carry no record type, and stage/status belong to the org\'s package automation. Tried: ' + f);
        }
    }

    @IsTest
    static void packageTakesTheNameRepairButNoFencedFieldAndNoDelete() {
        C360TestFixture.armCalloutMock();

        // The one permitted update: the versioning Name repair (2026-08-30). The engine names the
        // new package version itself and can leave the account prefix blank; the caller repairs it
        // to the org convention, and that repair must pass the gate.
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PRODUCT_PACKAGE, C360WriteGuard.OP_UPDATE,
            new Map<String, Object>{ 'Name' => 'ACME - 8/30/2026 - PP' });

        for (String f : new List<String>{ 'RecordTypeId', 'LLC_BI__Stage__c', 'LLC_BI__Status__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PRODUCT_PACKAGE, C360WriteGuard.OP_UPDATE,
                    new Map<String, Object>{ f => 'y' });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused,
                'Record type, stage and status stay the org\'s own, on update as on create. Tried: ' + f);
        }

        Boolean deleteRefused = false;
        try {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PRODUCT_PACKAGE, C360WriteGuard.OP_DELETE, new Map<String, Object>());
        } catch (C360WriteGuard.GuardException e) {
            deleteRefused = true;
        }
        System.assertEquals(true, deleteRefused, 'No tool of ours ever deletes a package.');
    }

    @IsTest
    static void covenantIsBornPendingAndActiveOrNotAtAll() {
        C360TestFixture.armCalloutMock();

        // The net-new covenant doorway (2026-08-30): Pending and Active are the only birth state.
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT, C360WriteGuard.OP_CREATE,
            new Map<String, Object>{
                'LLC_BI__Covenant_Status__c' => 'Pending', 'LLC_BI__Active__c' => 'true',
                'LLC_BI__Financial_Indicator_Value__c' => 3.5
            });

        Boolean statusRefused = false;
        try {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT, C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Covenant_Status__c' => 'Compliant', 'LLC_BI__Active__c' => 'true' });
        } catch (C360WriteGuard.GuardException e) {
            statusRefused = true;
        }
        System.assertEquals(true, statusRefused, 'A covenant born Compliant would be authored compliance history');

        for (String f : new List<String>{ 'LLC_BI__Breached__c', 'LLC_BI__Last_Evaluation_Value__c', 'LLC_BI__Is_Template__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT, C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'LLC_BI__Covenant_Status__c' => 'Pending', 'LLC_BI__Active__c' => 'true', f => 'x' });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Evaluation outcomes belong to the org\'s review cycle. Tried: ' + f);
        }

        // The attach doorway: two lookups, no state fence, and never an update or delete.
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN_COVENANT, C360WriteGuard.OP_CREATE,
            new Map<String, Object>{ 'LLC_BI__Loan__c' => 'a', 'LLC_BI__Covenant2__c' => 'b' });
        for (String op : new List<String>{ C360WriteGuard.OP_UPDATE, C360WriteGuard.OP_DELETE }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN_COVENANT, op, new Map<String, Object>());
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Every field on this junction is non-updateable in the org. Operation: ' + op);
        }
    }

    @IsTest
    static void involvementRolesAreTheBorrowingStructureSetAndNothingElse() {
        C360TestFixture.armCalloutMock();
        // The borrowing-structure amendment arm (2026-08-30): the full role set files. Every one of
        // these is a role Hartwell's own involvement rows carry live.
        for (String role : new List<String>{ 'Borrower', 'Co-Borrower', 'Guarantor', 'Limited Guarantor', 'Related Entity' }) {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_INVOLVEMENT, C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Borrower_Type__c' => role, 'LLC_BI__Ownership__c' => 100 });
        }

        for (String role : new List<String>{ 'Grantor', 'Contractor', 'Trustee' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_INVOLVEMENT, C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'LLC_BI__Borrower_Type__c' => role });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'Grantor and Contractor are collateral and construction semantics, not borrowing structure. Tried: ' + role);
        }
    }

    @IsTest
    static void involvementFormulaFieldsAndContingentAmountAreRefused() {
        C360TestFixture.armCalloutMock();
        for (String f : new List<String>{ 'LLC_BI__Is_Borrower__c', 'LLC_BI__Is_Guarantor__c',
                                          'LLC_BI__Is_CoBorrower__c', 'LLC_BI__Contingent_Amount__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_INVOLVEMENT, C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'LLC_BI__Borrower_Type__c' => 'Borrower', f => 1 });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused,
                'Is_* are formulas derived from Borrower_Type, and Contingent Amount is XOR with Ownership. Tried: ' + f);
        }
    }

    @IsTest
    static void aFeeIsBornActiveAndNeverCarriesARecordTypeIdOrADerivedBasis() {
        C360TestFixture.armCalloutMock();

        // The net-new fee doorway (2026-08-31). Both calculation shapes pass the gate: the
        // percentage/flat rules are the STAGE's business, and this fence is about state and fields.
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_FEE, C360WriteGuard.OP_CREATE,
            new Map<String, Object>{
                'LLC_BI__Loan__c' => 'a', 'LLC_BI__Status__c' => 'Active',
                'LLC_BI__Fee_Type__c' => 'Loan Origination', 'LLC_BI__Calculation_Type__c' => 'Percentage',
                'LLC_BI__Basis_Source__c' => 'LLC_BI__Amount__c', 'LLC_BI__Percentage__c' => 1
            });
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_FEE, C360WriteGuard.OP_CREATE,
            new Map<String, Object>{
                'LLC_BI__Loan__c' => 'a', 'LLC_BI__Status__c' => 'Active',
                'LLC_BI__Fee_Type__c' => 'Attorney', 'LLC_BI__Calculation_Type__c' => 'Flat Amount',
                'LLC_BI__Amount__c' => 5000
            });

        Boolean statusRefused = false;
        try {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_FEE, C360WriteGuard.OP_CREATE,
                new Map<String, Object>{ 'LLC_BI__Loan__c' => 'a', 'LLC_BI__Status__c' => 'Inactive' });
        } catch (C360WriteGuard.GuardException e) {
            statusRefused = true;
        }
        System.assertEquals(true, statusRefused, 'An inactive fee is a fee nobody charges, which is not what adding one means');

        // RecordTypeId is refused by the ORG (INVALID_CROSS_REFERENCE_KEY: no Fee record type is on
        // the integration user's profile), Name is an autonumber, and Basis Amount is what nCino's
        // FeeTrigger derives from the loan's commitment.
        for (String f : new List<String>{ 'RecordTypeId', 'Name', 'LLC_BI__Basis_Amount__c' }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_FEE, C360WriteGuard.OP_CREATE,
                    new Map<String, Object>{ 'LLC_BI__Loan__c' => 'a', 'LLC_BI__Status__c' => 'Active', f => 'x' });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'The org assigns it, or derives it, or refuses it outright. Tried: ' + f);
        }

        // A fee is created and never touched again: amending one that already exists is a different
        // arm, and the guard is what makes that a refusal rather than a convention.
        for (String op : new List<String>{ C360WriteGuard.OP_UPDATE, C360WriteGuard.OP_DELETE }) {
            Boolean refused = false;
            try {
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_FEE, op,
                    new Map<String, Object>{ 'LLC_BI__Amount__c' => 1 });
            } catch (C360WriteGuard.GuardException e) {
                refused = true;
            }
            System.assertEquals(true, refused, 'This wave adds fees and stops. Operation: ' + op);
        }
    }
}
