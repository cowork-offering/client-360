/**
 * StageLoanModification - MCP tool: stage_loan_modification.
 *
 * EXECUTION IS AVAILABLE. execute_loan_modification runs this plan behind the single-use decision
 * token. That was not true for one wave, and the change is a probe finding rather than a change of
 * mind (EVIDENCE-SEPT4.md "Mod-execute probe", 2026-08-20, and the WS0.5 probe in the same file).
 *
 * WHAT THE HOLD ACTUALLY WAS. A credit action acts only on a "valid facility": probe 9 read every
 * LLC_BI__LoanRenewal__c chain in the org and found every parent at Stage = Booked, Status = Open,
 * with a non-null core lookupKey. Anything else returns "The request contains invalid facilities".
 * The hold assumed a Booked parent was unreachable, because Loan_Validation_06 refuses a manual move
 * to a post-approval stage with no permission bypass. LV06 keys on PRIORVALUE, which is blank on an
 * INSERT, so a facility filed AT Booked with a lookupKey never trips it, and the credit action then
 * ran live end to end on throwaway data. The valid-facility rule still stands and is still enforced
 * here; what was wrong was the belief that no facility could ever satisfy it.
 *
 * WHAT IS STILL HELD, AND ALWAYS WILL BE. Execution produces a modification CLONE at Qualification.
 * BOOKING that clone is nCino's own process: Submit for Approval, real approvers, LV06 unchanged.
 * This tool plans a modification, not an approval, and the warnings say so before the banker confirms.
 *
 * PACKAGE-ANCHORED, MULTI-FACILITY (ACTIONS-DESIGN 5.1 anchor correction, Fabian, 2026-07-25). The
 * anchor is the PRODUCT PACKAGE: nCino's CreditActionSoaXPkg takes the package id plus a list of
 * (booked facility, action) pairs, so a facility is a member selection within the package rather
 * than the anchor. This tool takes `facilityIds` as that package-anchored shape and keeps the flat
 * `loanId` as the single-facility back-compat shape. Exactly one shape per call. One call produces
 * ONE plan, ONE plan hash and ONE decision token, carrying N per-facility typed steps. The selection
 * contract itself lives in C360Facilities, shared with stage_renewal so the two cannot drift.
 *
 * INPUT SHAPE AND THE required=true TRAP (lesson 16aa). `required=true` on an @InvocableVariable is
 * enforced by the REST Actions API BEFORE Apex runs, and NO Apex unit test can see it, because a
 * direct test invocation constructs the Request itself. A tool that grows an alternative input shape
 * must therefore drop required=true from every field the new shape supersedes, or the platform
 * refuses the new shape and our Apex never executes. `loanId` is no longer flagged required;
 * requiredness is enforced in Apex, where it can also say WHICH facility is wrong. `idempotencyKey`,
 * `productPackageId` and `rationale` keep required=true: both shapes need all three.
 *
 * Org contract: A33.4.1. Two corrections carried from probe 5: LLC_BI__RootLoanId__c DOES NOT EXIST
 * on Loan in this org, so nothing here walks a chain through it; and the org rewrites the loan name,
 * so no name is echoed anywhere in this plan.
 */
global with sharing class StageLoanModification {

    /** Raised for a domain-level validation failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    global class Request {
        @InvocableVariable(label='Idempotency Key' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Product Package Id' description='The deal anchor. Every selected facility must be a member of it.' required=true)
        global String productPackageId;
        @InvocableVariable(label='Loan Id' description='Single-facility path. Supply this OR facilityIds, never both. Not flagged required on the invocable because facilityIds supersedes it; requiredness is enforced in Apex.')
        global String loanId;
        @InvocableVariable(label='Facility Ids' description='Package-anchored path: the member facilities of this package to modify, in one plan under one decision token. Omit it and the single loanId above is used.')
        global List<Id> facilityIds;
        @InvocableVariable(label='Rationale' required=true)
        global String rationale;
        @InvocableVariable(label='Requested Amount')
        global Decimal requestedAmount;
        @InvocableVariable(label='Requested Maturity Date')
        global Date requestedMaturityDate;
        @InvocableVariable(label='Requested Rate')
        global Decimal requestedRate;
        @InvocableVariable(label='Requested Term Months')
        global Decimal requestedTermMonths;
        @InvocableVariable(label='Covenant Adds JSON' description='Optional. JSON list of net-new covenants to create and attach: [{"typeName" or "typeId", "threshold", "operator" (< <= = >= >), "frequency"?, "effectiveDate"? (YYYY-MM-DD), "targetLoanId"?}]. Each is created Pending/Active on the borrower account and attached to the CLONE of the targeted facility on the new package version, never to the booked parent. targetLoanId may be omitted when exactly one facility is selected.')
        global String covenantAddsJson;
        @InvocableVariable(label='Involvement Changes JSON' description='Optional. JSON list of borrowing-structure amendments: [{"op" (add|remove), "role" (Borrower|Co-Borrower|Guarantor|Limited Guarantor|Related Entity), "accountId" or "accountName", "ownership"?, "targetLoanId"?}]. An ADD authors the involvement on the CLONE of the targeted facility on the new package version. A REMOVE is a carry exclusion: the parent keeps its row and the clone starts without it — nothing is ever deleted. targetLoanId may be omitted when exactly one facility is selected.')
        global String involvementChangesJson;
        @InvocableVariable(label='Field Changes JSON' description='Optional. THE FIELD WAVE: JSON list of loan-field amendments applied to the CLONE: [{"field" (API name or exact field label), "value", "targetLoanId"?}]. The field must be updateable and non-formula per the org\'s own describe, outside the doctrine deny-list (stage, status, the four scalar keys, anchoring lookups). Values are coerced by the field\'s own type; a picklist value is validated against the org\'s active values and a refusal carries the legal list. targetLoanId may be omitted when exactly one facility is selected.')
        global String fieldChangesJson;
    }

    /** One parsed field-wave amendment, resolved against the org's own describe. */
    public class FieldChange {
        public String fieldName;
        public String fieldLabel;
        public String fieldType;
        /** The coerced value, re-serialized for the plan. */
        public String valueJson;
        public Id targetLoanId;
    }

    /** One parsed borrowing-structure amendment, resolved against the org. */
    public class InvolvementChange {
        public String op;
        public String role;
        public Id accountId;
        public String accountName;
        public Decimal ownership;
        public Id targetLoanId;
        /** The involvement row a REMOVE excludes from the carry, resolved at stage time. */
        public Id sourceRowId;
    }

    /** One parsed net-new covenant, resolved against the org's own type catalog. */
    public class CovenantAdd {
        public Id typeId;
        public String typeName;
        public Decimal threshold;
        public String operator;
        public String frequency;
        public Date effectiveDate;
        public Id targetLoanId;
    }

    global class PlanStep {
        @InvocableVariable(label='Step Id')
        global String id;
        @InvocableVariable(label='Type')
        global String type;
        @InvocableVariable(label='Label')
        global String label;
        @InvocableVariable(label='Object')
        global String objectName;
        @InvocableVariable(label='Fields')
        global List<String> fields;
        @InvocableVariable(label='Automation Woken')
        global List<String> automationWoken;
        @InvocableVariable(label='Verification')
        global String verification;
        @InvocableVariable(label='State')
        global String state;
    }

    global class ToolError {
        @InvocableVariable(label='Code')
        global String code;
        @InvocableVariable(label='Message')
        global String message;
        @InvocableVariable(label='Org Error')
        global String orgError;
        @InvocableVariable(label='Resumable')
        global Boolean resumable;
        @InvocableVariable(label='Idempotency Key')
        global String idempotencyKey;
    }

    /** One selected facility, with the plan step ids that belong to it. */
    global class PlannedFacility {
        @InvocableVariable(label='Facility Id')
        global String facilityId;
        @InvocableVariable(label='Facility Name' description='The org-assigned name. The org rewrites loan names on save, so this is read back, never echoed.')
        global String facilityName;
        @InvocableVariable(label='Credit Action Step Id')
        global String creditActionStepId;
        @InvocableVariable(label='Verify Step Id')
        global String verifyStepId;
        @InvocableVariable(label='Apply Changes Step Id')
        global String applyStepId;
        @InvocableVariable(label='Covenant Carryover Count' description='Loan Covenant junction rows on this facility that would clone onto its modification.')
        global Integer covenantCarryoverCount;
    }

    global class StageResult {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Plan Hash')
        global String planHash;
        @InvocableVariable(label='Decision Token')
        global String decisionToken;
        @InvocableVariable(label='Summary')
        global String summary;
        @InvocableVariable(label='Steps')
        global List<PlanStep> steps;
        @InvocableVariable(label='Warnings')
        global List<String> warnings;
        @InvocableVariable(label='Provenance JSON')
        global String provenanceJson;
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Product Package Id')
        global String productPackageId;
        @InvocableVariable(label='Execution Held' description='False since execute_loan_modification shipped. Kept on the contract so a caller written against the held wave still reads a defined answer.')
        global Boolean executionHeld;
        @InvocableVariable(label='Held Reason' description='Null while execution is available. Booking the resulting clone is a separate nCino step and is carried in the warnings, not here.')
        global String heldReason;
        @InvocableVariable(label='Covenant Carryover Count' description='Loan Covenant junction rows that would clone, totalled across every selected facility. An empty list is a real answer, not blank space.')
        global Integer covenantCarryoverCount;
        @InvocableVariable(label='Facilities' description='One entry per selected facility, with the plan step ids that belong to it.')
        global List<PlannedFacility> facilities;
        @InvocableVariable(label='Facility Count')
        global Integer facilityCount;
        @InvocableVariable(label='Replayed')
        global Boolean replayed;
    }

    global class Response {
        @InvocableVariable(label='OK')
        global Boolean ok;
        @InvocableVariable(label='Result')
        global StageResult result;
        @InvocableVariable(label='Error')
        global ToolError error;
    }

    /**
     * Stages a loan modification. Writes no domain record; execution is a separate, token-gated call.
     *
     * @param requests One request per staged action. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='stage_loan_modification'
        description='Validate a package-anchored facility modification and return an immutable execution plan with a plan hash. Takes either the single loanId or facilityIds, the member facilities of the package, never both. Writes nothing: execute_loan_modification runs the plan behind the single-use decision token. Executing produces a modification clone at Qualification; booking that clone still requires nCino\'s human Submit for Approval.'
    )
    global static List<Response> stage(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response res = new Response();
            try {
                res.result = build(req);
                res.ok = true;
            } catch (ToolException e) {
                res.ok = false;
                res.error = err('VALIDATION_FAILED', e.getMessage(), null, req.idempotencyKey);
            } catch (C360Facilities.SelectionException e) {
                res.ok = false;
                res.error = err('VALIDATION_FAILED', e.getMessage(), null, req.idempotencyKey);
            } catch (C360ActionStaging.StagingException e) {
                res.ok = false;
                res.error = err('STAGING_REFUSED', e.getMessage(), null, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('STAGING_WRITE_FAILED', 'The staging record could not be written.', e.getMessage(), req.idempotencyKey);
            } catch (QueryException e) {
                res.ok = false;
                res.error = err('READ_FAILED', 'A record this plan depends on could not be read.', e.getMessage(), req.idempotencyKey);
            }
            out.add(res);
        }
        return out;
    }


    private static StageResult build(Request req) {
        if (String.isBlank(req.productPackageId)) {
            throw new ToolException('productPackageId is required. It is the deal anchor.');
        }
        if (String.isBlank(req.rationale)) {
            throw new ToolException('rationale is required. It feeds the audit ledger.');
        }
        if (req.requestedAmount == null && req.requestedMaturityDate == null && req.requestedRate == null &&
            req.requestedTermMonths == null && String.isBlank(req.covenantAddsJson) && String.isBlank(req.involvementChangesJson) &&
            String.isBlank(req.fieldChangesJson)) {
            throw new ToolException('At least one requested change is required: amount, maturity date, rate, term, a covenant add, a borrowing-structure change, or a field change.');
        }
        if (req.requestedAmount != null && req.requestedAmount <= 0) {
            throw new ToolException('requestedAmount must be greater than zero.');
        }

        Id packageId = C360Facilities.packageId(req.productPackageId);
        List<Id> selected = C360Facilities.resolve(req.loanId, req.facilityIds, 'modification');
        List<LLC_BI__Loan__c> facilities =
            C360Facilities.validate(readFacilities(selected), selected, packageId, 'Modifications');
        Map<Id, Integer> carryoverByFacility = C360Facilities.covenantCarryover(selected);

        // nCino package methodology (founder correction, 2026-08-30): a modification never versions
        // a loan alone. The credit action rolls the WHOLE package: every eligible member is cloned
        // into the next package version, the selected ones then take the requested changes, the rest
        // carry unchanged. Eligibility mirrors nCino's own wizard rule, observed live on this org:
        // Booked and Open roll; anything else (a Proposal-stage member, a closed loan) stays on the
        // current version and is NAMED in the plan rather than silently skipped.
        List<String> rollIds = new List<String>();
        List<String> rollNames = new List<String>();
        List<String> excludedNames = new List<String>();
        for (LLC_BI__Loan__c m : readPackageMembers(packageId)) {
            if (m.LLC_BI__Stage__c == 'Booked' && m.LLC_BI__Status__c == 'Open') {
                rollIds.add(String.valueOf(m.Id));
                rollNames.add(m.Name);
            } else {
                excludedNames.add(m.Name + ' (' + m.LLC_BI__Stage__c + ')');
            }
        }

        List<String> covenantWarnings = new List<String>();
        List<CovenantAdd> covenantAdds = parseCovenantAdds(req, facilities, covenantWarnings);
        List<InvolvementChange> involvementChanges = parseInvolvementChanges(req, facilities, covenantWarnings);
        List<FieldChange> fieldChanges = parseFieldChanges(req, facilities);

        Integer n = facilities.size();
        Integer carryover = 0;
        Map<String, Object> resolved = new Map<String, Object>{
            'productPackageId' => packageId,
            'actionType' => 'Modification',
            'facilityCount' => n,
            'rollMemberIds' => String.join(rollIds, ','),
            'rollMemberCount' => rollIds.size(),
            'excludedMemberCount' => excludedNames.size(),
            'requestedAmount' => req.requestedAmount,
            'requestedMaturityDate' => req.requestedMaturityDate,
            'requestedRate' => req.requestedRate,
            'requestedTermMonths' => req.requestedTermMonths
        };

        List<C360Plan.Step> steps = new List<C360Plan.Step>();
        List<PlannedFacility> planned = new List<PlannedFacility>();
        List<String> facilityNames = new List<String>();

        steps.add(
            new C360Plan.Step('roll_package', C360Plan.TYPE_WRITE,
                'Create the next package version: one credit action rolls all ' + String.valueOf(rollIds.size()) +
                ' eligible members into a new package' +
                (excludedNames.isEmpty() ? '' : ', leaving ' + String.join(excludedNames, ', ') + ' on the current version'))
                .onObject('LLC_BI__Product_Package__c', new List<String>{ 'new package version created by nCino' })
                .wakes(new List<String>{
                    'nCino clones every rolled member and writes its LLC_BI__LoanRenewal__c chain row synchronously; ' +
                    'the junction graph does NOT copy itself (verified live 2026-08-30) and is carried by the ' +
                    'carry_junctions step of this same plan'
                })
                .provenBy('SELECT COUNT() FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c = :outputPackageId')
        );

        for (Integer i = 0; i < n; i++) {
            LLC_BI__Loan__c loan = facilities[i];
            String s = String.valueOf(i);
            Integer own = carryoverByFacility.containsKey(loan.Id) ? carryoverByFacility.get(loan.Id) : 0;
            carryover += own;
            facilityNames.add(loan.Name);
            resolved.put('facility' + s + '.loanId', String.valueOf(loan.Id));

            steps.add(
                new C360Plan.Step('credit_action_' + s, C360Plan.TYPE_WRITE, 'Roll ' + loan.Name + ' into the new package version (its clone is the one this plan modifies)')
                    .onObject('LLC_BI__Loan__c', new List<String>{ 'clone created by nCino on the new package version' })
                    .wakes(new List<String>{
                        'nCino clones the facility onto the new package, sets the loan-type flag and creates the LLC_BI__LoanRenewal__c junction row'
                    })
                    .provenBy('SELECT Id, LLC_BI__ParentLoanId__c FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__ParentLoanId__c = :loanId')
            );
            steps.add(
                new C360Plan.Step('verify_clone_' + s, C360Plan.TYPE_VERIFICATION, 'Re-query for the new facility cloned from ' + loan.Name + ' and its junction row')
                    .onObject('LLC_BI__LoanRenewal__c', new List<String>{ 'LLC_BI__ParentLoanId__c' })
                    .provenBy('SELECT Id, LLC_BI__ParentLoanId__c FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__ParentLoanId__c = :loanId')
            );
            steps.add(
                new C360Plan.Step('apply_changes_' + s, C360Plan.TYPE_WRITE, 'Apply the requested changes to the new facility cloned from ' + loan.Name)
                    .onObject('LLC_BI__Loan__c', new List<String>{ 'LLC_BI__Amount__c', 'LLC_BI__Maturity_Date__c', 'LLC_BI__InterestRate__c', 'LLC_BI__Term_Months__c' })
                    .provenBy('SELECT Id, LLC_BI__Amount__c, LLC_BI__Maturity_Date__c FROM LLC_BI__Loan__c WHERE Id = :cloneId')
            );

            PlannedFacility pf = new PlannedFacility();
            pf.facilityId = loan.Id;
            pf.facilityName = loan.Name;
            pf.creditActionStepId = 'credit_action_' + s;
            pf.verifyStepId = 'verify_clone_' + s;
            pf.applyStepId = 'apply_changes_' + s;
            pf.covenantCarryoverCount = own;
            planned.add(pf);
        }

        steps.add(
            new C360Plan.Step('verify_package', C360Plan.TYPE_VERIFICATION,
                'Verify the new package version: it exists, it is not the current package, and every rolled member reads back as a clone on it')
                .onObject('LLC_BI__Product_Package__c', new List<String>{ 'Id', 'Name' })
                .provenBy('SELECT Id, Name FROM LLC_BI__Product_Package__c WHERE Id = :outputPackageId')
        );

        // The carry counts, read now so the banker confirms a NUMBERED promise. nCino's engine
        // copies no junction rows in this org (verified live 2026-08-30), so the execute tool
        // replicates each member's graph itself and proves the counts by re-query.
        Integer pledgeCount = [SELECT COUNT() FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c IN :rollIds WITH USER_MODE];
        Integer involvementCount = [SELECT COUNT() FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c IN :rollIds WITH USER_MODE];
        Integer covenantJunctionCount = [SELECT COUNT() FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c IN :rollIds WITH USER_MODE];
        steps.add(
            new C360Plan.Step('carry_junctions', C360Plan.TYPE_WRITE,
                'Carry each rolled member\'s junction graph onto its clone: ' + covenantJunctionCount +
                ' covenant junction' + (covenantJunctionCount == 1 ? '' : 's') + ', ' + pledgeCount +
                ' collateral pledge' + (pledgeCount == 1 ? '' : 's') + ', ' + involvementCount +
                ' borrowing involvement' + (involvementCount == 1 ? '' : 's'))
                .onObject('LLC_BI__Loan_Covenant__c', new List<String>{ 'replicas retargeted at the clones, verified by count' })
                .provenBy('SELECT COUNT() FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c IN :cloneIds')
        );

        // Net-new covenants: created on the borrower account, attached to the CLONE of the targeted
        // member on the new version. SAFE by live probe (2026-08-30): a Covenant2 insert plus its
        // junction mints no compliance row, starts no approval and sends no email; the unrecallable
        // acnpex approval fires on COMPLIANCE create only, which this plan never performs.
        Map<Id, LLC_BI__Loan__c> facilityById = new Map<Id, LLC_BI__Loan__c>(facilities);
        for (Integer i = 0; i < covenantAdds.size(); i++) {
            CovenantAdd a = covenantAdds[i];
            String s = String.valueOf(i);
            resolved.put('covenantAdd' + s + '.typeId', String.valueOf(a.typeId));
            resolved.put('covenantAdd' + s + '.typeName', a.typeName);
            resolved.put('covenantAdd' + s + '.threshold', a.threshold);
            resolved.put('covenantAdd' + s + '.operator', a.operator);
            resolved.put('covenantAdd' + s + '.frequency', a.frequency);
            resolved.put('covenantAdd' + s + '.effectiveDate', a.effectiveDate);
            resolved.put('covenantAdd' + s + '.targetLoanId', String.valueOf(a.targetLoanId));
            String targetName = facilityById.get(a.targetLoanId).Name;
            steps.add(
                new C360Plan.Step('covenant_create_' + s, C360Plan.TYPE_WRITE,
                    'Create net-new covenant on the borrower: ' + a.typeName + ' ' + a.operator + ' ' +
                    String.valueOf(a.threshold) + ', tested ' + a.frequency + ', effective ' + String.valueOf(a.effectiveDate) +
                    ', born Pending and Active')
                    .onObject('LLC_BI__Covenant2__c', new List<String>{
                        'LLC_BI__Covenant_Type__c', 'LLC_BI__Financial_Indicator_Value__c', 'Financial_Indicator_Operator__c',
                        'LLC_BI__Frequency__c', 'LLC_BI__Effective_Date__c'
                    })
                    .provenBy('SELECT Id, LLC_BI__Financial_Indicator_Value__c FROM LLC_BI__Covenant2__c WHERE Id = :createdId')
            );
            steps.add(
                new C360Plan.Step('covenant_attach_' + s, C360Plan.TYPE_WRITE,
                    'Attach it to the clone of ' + targetName + ' on the new package version (never to the booked parent), and associate it to the borrower account the way nCino\'s own UI does')
                    .onObject('LLC_BI__Loan_Covenant__c', new List<String>{ 'LLC_BI__Loan__c', 'LLC_BI__Covenant2__c', 'LLC_BI__Account_Covenant__c: LLC_BI__Account__c + LLC_BI__Covenant2__c' })
                    .provenBy('SELECT Id FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c = :cloneId AND LLC_BI__Covenant2__c = :createdId')
            );
            steps.add(
                new C360Plan.Step('covenant_verify_' + s, C360Plan.TYPE_VERIFICATION,
                    'Re-read the covenant and its junction on the clone of ' + targetName)
                    .onObject('LLC_BI__Covenant2__c', new List<String>{ 'Id', 'LLC_BI__Financial_Indicator_Value__c' })
                    .provenBy('SELECT Id FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c = :cloneId AND LLC_BI__Covenant2__c = :createdId')
            );
        }
        resolved.put('covenantAddCount', covenantAdds.size());

        // Borrowing-structure amendments. An ADD is authored on the clone; a REMOVE is a carry
        // exclusion — the roll-over diff made literal: everything not named is KEPT, and what is
        // named as removed simply never reaches the new version. Nothing is deleted anywhere.
        for (Integer i = 0; i < involvementChanges.size(); i++) {
            InvolvementChange ic = involvementChanges[i];
            String s2 = String.valueOf(i);
            resolved.put('involvement' + s2 + '.op', ic.op);
            resolved.put('involvement' + s2 + '.role', ic.role);
            resolved.put('involvement' + s2 + '.accountId', String.valueOf(ic.accountId));
            resolved.put('involvement' + s2 + '.accountName', ic.accountName);
            resolved.put('involvement' + s2 + '.ownership', ic.ownership);
            resolved.put('involvement' + s2 + '.targetLoanId', String.valueOf(ic.targetLoanId));
            resolved.put('involvement' + s2 + '.sourceRowId', ic.sourceRowId == null ? null : String.valueOf(ic.sourceRowId));
            String targetName2 = facilityById.get(ic.targetLoanId).Name;
            if (ic.op == 'add') {
                steps.add(
                    new C360Plan.Step('involvement_change_' + s2, C360Plan.TYPE_WRITE,
                        'Add ' + ic.accountName + ' as ' + ic.role + ' on the clone of ' + targetName2 +
                        (ic.ownership == null ? '' : ' at ' + String.valueOf(ic.ownership) + '% ownership'))
                        .onObject('LLC_BI__Legal_Entities__c', new List<String>{
                            'LLC_BI__Account__c', 'LLC_BI__Borrower_Type__c', 'LLC_BI__Ownership__c'
                        })
                        .provenBy('SELECT Id FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c = :cloneId AND LLC_BI__Account__c = :accountId')
                );
            } else {
                steps.add(
                    new C360Plan.Step('involvement_change_' + s2, C360Plan.TYPE_WRITE,
                        'Carry the structure of ' + targetName2 + ' WITHOUT ' + ic.accountName + ' (' + ic.role +
                        '): the booked facility keeps its row, the clone starts without it, nothing is deleted')
                        .onObject('LLC_BI__Legal_Entities__c', new List<String>{ 'carry exclusion — the replica is simply not written' })
                        .provenBy('SELECT COUNT() FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c = :cloneId AND LLC_BI__Account__c = :accountId')
                );
            }
            steps.add(
                new C360Plan.Step('involvement_verify_' + s2, C360Plan.TYPE_VERIFICATION,
                    ic.op == 'add'
                        ? 'Re-read the involvement on the clone of ' + targetName2
                        : 'Prove the clone of ' + targetName2 + ' carries no row for ' + ic.accountName + ' and the parent still does')
                    .onObject('LLC_BI__Legal_Entities__c', new List<String>{ 'Id' })
                    .provenBy('re-query on the clone and the parent')
            );
        }
        resolved.put('involvementChangeCount', involvementChanges.size());

        // The field wave: any field the org's own describe says is writable, outside the deny-list,
        // applied to the clone with the same discipline as the four scalars. The banker's sentence
        // was resolved to an API name and a typed value HERE, at stage time, so the confirm gate
        // hashes exactly what will be written.
        for (Integer i = 0; i < fieldChanges.size(); i++) {
            FieldChange fc = fieldChanges[i];
            String s3 = String.valueOf(i);
            resolved.put('fieldChange' + s3 + '.field', fc.fieldName);
            resolved.put('fieldChange' + s3 + '.label', fc.fieldLabel);
            resolved.put('fieldChange' + s3 + '.type', fc.fieldType);
            resolved.put('fieldChange' + s3 + '.valueJson', fc.valueJson);
            resolved.put('fieldChange' + s3 + '.targetLoanId', String.valueOf(fc.targetLoanId));
            String targetName3 = facilityById.get(fc.targetLoanId).Name;
            steps.add(
                new C360Plan.Step('field_change_' + s3, C360Plan.TYPE_WRITE,
                    'Set ' + fc.fieldLabel + ' (' + fc.fieldName + ') to ' + displayValue(fc) + ' on the clone of ' + targetName3)
                    .onObject('LLC_BI__Loan__c', new List<String>{ fc.fieldName })
                    .provenBy('SELECT ' + fc.fieldName + ' FROM LLC_BI__Loan__c WHERE Id = :cloneId')
            );
        }
        resolved.put('fieldChangeCount', fieldChanges.size());
        steps.add(
            new C360Plan.Step('observe_side_effects', C360Plan.TYPE_OBSERVED, 'Stage-driven email alerts and memo status changes the org may run')
                .wakes(new List<String>{ 'nCino Commercial - Loan After Save' })
        );
        // The step id is unchanged on purpose: the confirm gate, the tracker and the persisted plans
        // from the held wave all address this step by id. What it hands off is now the BOOKING of the
        // modification, not the modification itself.
        steps.add(
            new C360Plan.Step('held_execution', C360Plan.TYPE_HANDOFF, 'HANDOFF: booking the modification is nCino\'s own approval run')
                .wakes(new List<String>{ 'nCino Submit for Approval, driven by a human' })
        );

        List<String> warnings = new List<String>{
            'Execution is available. ' + (n == 1 ? 'This facility is' : 'These facilities are') +
                ' booked and open, which is what a credit action requires, so execute_loan_modification will run this plan behind the decision token.' +
                C360Facilities.lookupKeyWarning(facilities),
            'nCino package methodology: a modification versions the whole package, never a loan alone. Executing this plan creates a ' +
                'NEW package version holding clones of all ' + String.valueOf(rollIds.size()) + ' eligible members (' +
                String.join(rollNames, ', ') + '); the current package and every original loan stay exactly as they are.',
            'nCino\'s engine copies NO junction rows in this org (verified live 2026-08-30: every related-lists copy default ' +
                'flipped on, engine run, zero rows landed). The execute tool therefore carries each member\'s covenant junctions, ' +
                'collateral pledges and borrowing involvements onto its clone itself, and proves the counts by re-query.',
            'This plans a modification, NOT an approval. Executing it produces a clone facility at Qualification; BOOKING that clone requires nCino\'s Submit for Approval button, which Loan_Validation_06 enforces with no permission bypass.',
            'The junction object has no validation rules, no triggers and no flows, so a malformed row would fail silently. Execution therefore verifies the clone and its chain row by re-query and claims nothing the org will not read back.',
            'The platform is known to produce duplicate modification loans on failed background Apex, so idempotency is enforced by this tool rather than assumed.',
            carryover == 0
                ? 'No loan-level covenants are attached to ' + (n == 1 ? 'this facility' : 'these facilities') + ', so nothing would carry over.'
                : String.valueOf(carryover) + ' loan-level covenant junction rows carry onto the new ' + (n == 1 ? 'facility' : 'facilities') +
                  '. The carry replicates the junction, not the covenant, and nCino\'s own guidance says a business process must decide what happens to each one.'
        };
        warnings.addAll(covenantWarnings);
        if (!involvementChanges.isEmpty()) {
            warnings.add(
                'Borrowing-structure removes are CARRY EXCLUSIONS, never deletes: the booked facility keeps its involvement ' +
                'rows untouched, and the named row simply does not travel to the new version. The structure binds when the ' +
                'bank\'s own approval books that version.'
            );
        }
        if (!covenantAdds.isEmpty()) {
            warnings.add(
                'Net-new covenants are created Pending and Active on the borrower account and attached to the CLONE only. ' +
                'No compliance row is minted and no approval starts (probed live 2026-08-30): the org\'s own covenant review ' +
                'cycle owns the schedule from here, and booking the new version is what makes the covenant bind.'
            );
        }
        if (n > 1) {
            warnings.add(
                'This is one plan over ' + n + ' facilities on the same package, under a single confirmation and a single decision token. ' +
                'Each facility carries its own credit action, verification and apply step, so a failure on one is reported against that facility ' +
                'and does not silently discard the others.'
            );
            warnings.add(
                'The requested changes apply to every selected facility. Stage them separately if they need different terms.'
            );
        }

        Map<String, Object> provenance = new Map<String, Object>{
            'facilityIds' => new Map<String, String>{ 'prefill' => 'NCINO_RECORD', 'provenance' => 'NCINO', 'citation' => String.join(selected, ', ') },
            'productPackageId' => new Map<String, String>{ 'prefill' => 'NCINO_RECORD', 'provenance' => 'NCINO', 'citation' => String.valueOf(packageId) }
        };

        String bookingHandoff =
            'Executing this plan creates the modification at Qualification and stops there. Booking it is nCino\'s own run: ' +
            'Submit for Approval with real approvers, which Loan_Validation_06 enforces with no permission bypass.';

        String summary =
            'Plans the next VERSION of the package, nCino package methodology: one credit action rolls all ' +
            String.valueOf(rollIds.size()) + ' eligible members into a new package with their junction graphs. ' +
            (n == 1
                ? facilityNames[0] + ' is the member being modified'
                : String.valueOf(n) + ' members are being modified: ' + String.join(facilityNames, ', ')) +
            '; the rest carry unchanged' +
            (excludedNames.isEmpty() ? '. ' : ', and ' + String.join(excludedNames, ', ') + ' stays on the current version because it is not Booked/Open. ') +
            'The requested changes are applied to the ' + (n == 1 ? 'clone' : 'clones') + ' only; every original loan and the current package stay untouched. ' +
            (covenantAdds.isEmpty() ? '' : String.valueOf(covenantAdds.size()) + ' net-new covenant' +
                (covenantAdds.size() == 1 ? ' is' : 's are') + ' created on the borrower and attached to the ' +
                (covenantAdds.size() == 1 ? 'clone' : 'clones') + ', born Pending and Active. ') +
            (involvementChanges.isEmpty() ? '' : String.valueOf(involvementChanges.size()) + ' borrowing-structure ' +
                (involvementChanges.size() == 1 ? 'change lands' : 'changes land') + ' on the new version: adds are authored on the ' +
                'clone, removes are carry exclusions — the booked facilities keep every row they have today. ') +
            (fieldChanges.isEmpty() ? '' : String.valueOf(fieldChanges.size()) + ' field ' +
                (fieldChanges.size() == 1 ? 'change is' : 'changes are') + ' applied to the clone, each resolved against the ' +
                'org\'s own describe and named with its value in the plan. ') +
            'NOTHING IS WRITTEN BY THIS CALL: staging computes and holds the plan, and execute_loan_modification runs it behind the decision token. ' +
            bookingHandoff;

        String planJson = C360Plan.serializePlan(summary, steps, warnings, provenance, resolved);
        String planHash = C360Plan.hash('loan-modification', steps, resolved);

        C360ActionStaging.Staged staged = C360ActionStaging.stagePlan(
            'loan-modification', req.idempotencyKey, facilities[0].LLC_BI__Account__c, packageId, planJson, planHash
        );

        StageResult r = new StageResult();
        r.stagingId = staged.stagingId;
        r.planHash = staged.planHash;
        r.decisionToken = staged.decisionToken;
        r.replayed = staged.replayed;
        r.summary = summary;
        r.warnings = warnings;
        r.provenanceJson = JSON.serialize(provenance);
        r.accountId = facilities[0].LLC_BI__Account__c;
        r.productPackageId = packageId;
        r.executionHeld = false;
        r.heldReason = null;
        r.covenantCarryoverCount = carryover;
        r.facilities = planned;
        r.facilityCount = n;
        r.steps = toWireSteps(steps);
        return r;
    }

    private static List<PlanStep> toWireSteps(List<C360Plan.Step> steps) {
        List<PlanStep> out = new List<PlanStep>();
        for (C360Plan.Step s : steps) {
            PlanStep p = new PlanStep();
            p.id = s.id;
            p.type = s.type;
            p.label = s.label;
            p.objectName = s.objectName;
            p.fields = s.fields;
            p.automationWoken = s.automationWoken;
            p.verification = s.verification;
            p.state = s.state;
            out.add(p);
        }
        return out;
    }


    /**
     * Seam: the facility read, injectable for tests only.
     *
     * Staging requires Booked + Open facilities, and Booked is unreachable through the API (LV05 and
     * LV06, no permission bypass, only nCino's Submit for Approval with real approvers). A fixture
     * therefore cannot produce a stageable facility, which left the entire plan-building body
     * untested. This seam supplies them so the plan shape is asserted, exactly as
     * ExecuteCovenantReview does for a record it must not create. The wire path is unchanged: a real
     * unbooked facility still reaches the same refusal.
     */
    @TestVisible
    private static List<LLC_BI__Loan__c> seamFacilities;

    @TestVisible
    private static List<LLC_BI__Loan__c> readFacilities(List<Id> facilityIds) {
        if (seamFacilities != null) {
            return C360Facilities.fromSeam(seamFacilities, facilityIds);
        }
        return [
            SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c, LLC_BI__lookupKey__c,
                   LLC_BI__Account__c, LLC_BI__Account__r.Name, LLC_BI__Product_Package__c,
                   LLC_BI__Amount__c, LLC_BI__Maturity_Date__c, LLC_BI__Is_Modification__c, LLC_BI__isRenewal__c
            FROM LLC_BI__Loan__c
            WHERE Id IN :facilityIds
            WITH USER_MODE
        ];
    }

    /**
     * Parses and RESOLVES the net-new covenant adds. Everything a banker could get wrong is
     * settled here, at stage time, against the org's own catalog: the type must exist (by id, or
     * by exact name — an ambiguous name is refused with the candidate ids, because this org
     * carries duplicate type names), the operator must be one the org's picklists express, and
     * the target must be one of the selected facilities. An equivalent covenant already attached
     * to the target is NAMED as a warning before the banker confirms. Nothing is created here.
     */
    private static List<CovenantAdd> parseCovenantAdds(Request req, List<LLC_BI__Loan__c> facilities, List<String> warnings) {
        List<CovenantAdd> out = new List<CovenantAdd>();
        if (String.isBlank(req.covenantAddsJson)) {
            return out;
        }
        List<Object> raw;
        try {
            raw = (List<Object>) JSON.deserializeUntyped(req.covenantAddsJson);
        } catch (Exception e) {
            throw new ToolException('covenantAddsJson could not be read as a JSON list: ' + e.getMessage());
        }
        Set<String> validOps = new Set<String>{ '<', '<=', '=', '>=', '>' };
        Map<Id, LLC_BI__Loan__c> byId = new Map<Id, LLC_BI__Loan__c>(facilities);
        for (Object o : raw) {
            Map<String, Object> m = (Map<String, Object>) o;
            CovenantAdd a = new CovenantAdd();
            a.typeId = C360Plan.asId(m.get('typeId'));
            a.typeName = m.get('typeName') == null ? null : String.valueOf(m.get('typeName')).trim();
            a.threshold = C360Plan.asDecimal(m.get('threshold'));
            a.operator = m.get('operator') == null ? null : String.valueOf(m.get('operator')).trim();
            a.frequency = m.get('frequency') == null ? 'Quarterly' : String.valueOf(m.get('frequency')).trim();
            a.effectiveDate = m.get('effectiveDate') == null ? Date.today() : Date.valueOf(String.valueOf(m.get('effectiveDate')));
            a.targetLoanId = C360Plan.asId(m.get('targetLoanId'));
            if (a.threshold == null) {
                throw new ToolException('A covenant add needs a threshold. The threshold IS the covenant; without one there is nothing for a review cycle to test.');
            }
            if (a.operator == null || !validOps.contains(a.operator)) {
                throw new ToolException('A covenant add needs an operator, one of < <= = >= >. Supplied: ' + a.operator + '.');
            }
            if (a.targetLoanId == null) {
                if (facilities.size() != 1) {
                    throw new ToolException('targetLoanId is required on each covenant add when more than one facility is selected.');
                }
                a.targetLoanId = facilities[0].Id;
            }
            if (!byId.containsKey(a.targetLoanId)) {
                throw new ToolException(
                    'A covenant add targets facility ' + a.targetLoanId + ', which is not one of the selected facilities. ' +
                    'The covenant attaches to the CLONE of a facility this plan modifies.'
                );
            }
            resolveCovenantType(a);
            out.add(a);
        }
        // The connectedness check, on the PARENTS: the clones do not exist yet, and what the banker
        // needs to hear is what the facility carries today.
        Set<Id> targetIds = new Set<Id>();
        for (CovenantAdd a : out) {
            targetIds.add(a.targetLoanId);
        }
        for (LLC_BI__Loan_Covenant__c j : [
            SELECT LLC_BI__Loan__c, LLC_BI__Covenant2__r.LLC_BI__Covenant_Type__c,
                   LLC_BI__Covenant2__r.LLC_BI__Covenant_Type__r.Name,
                   LLC_BI__Covenant2__r.LLC_BI__Financial_Indicator_Value__c
            FROM LLC_BI__Loan_Covenant__c
            WHERE LLC_BI__Loan__c IN :targetIds
            WITH USER_MODE
        ]) {
            for (CovenantAdd a : out) {
                if (a.targetLoanId == j.LLC_BI__Loan__c && a.typeId == j.LLC_BI__Covenant2__r.LLC_BI__Covenant_Type__c) {
                    warnings.add(
                        byId.get(a.targetLoanId).Name + ' ALREADY carries a ' + a.typeName + ' covenant at ' +
                        String.valueOf(j.LLC_BI__Covenant2__r.LLC_BI__Financial_Indicator_Value__c) +
                        ', and the carry will bring it onto the clone. This plan files a SECOND one at ' + a.operator + ' ' +
                        String.valueOf(a.threshold) + ' only because the banker confirms it knowingly; amending the existing covenant may be the better instrument.'
                    );
                }
            }
        }
        return out;
    }

    /**
     * THE FIELD-WAVE DENY LIST. Everything else the describe says is writable and non-formula on
     * the Loan may file onto the clone. Four kinds of field stay out, each for a named reason:
     * the four scalars (they have their own request keys and drift baselines), stage and status
     * (the guard owns the one legal hop), the anchoring lookups (a re-anchored clone is a corrupted
     * version), and the versioning flags the engine itself owns.
     */
    private static final Set<String> FIELD_WAVE_DENY = new Set<String>{
        'llc_bi__amount__c', 'llc_bi__maturity_date__c', 'llc_bi__interestrate__c', 'llc_bi__term_months__c',
        'llc_bi__stage__c', 'llc_bi__status__c',
        'llc_bi__account__c', 'llc_bi__product_package__c', 'llc_bi__parentloan__c',
        'llc_bi__originalparentloan__c', 'llc_bi__highest__c', 'llc_bi__lookupkey__c',
        'llc_bi__isrenewal__c', 'llc_bi__is_modification__c', 'llc_bi__is_no_action_placeholder__c',
        'llc_bi__is_original_inactive_loan__c', 'ownerid', 'recordtypeid', 'currencyisocode'
    };

    /**
     * Parses and RESOLVES the field wave against the org's OWN describe: the field must exist on
     * Loan (by API name or exact label, case-insensitive), be updateable and non-formula, and sit
     * outside the deny-list. The value is coerced by the field's own type, and a picklist value is
     * validated against the org's active values — a refusal carries the legal list, so the caller
     * can correct itself with the org's vocabulary rather than guessing again.
     */
    private static List<FieldChange> parseFieldChanges(Request req, List<LLC_BI__Loan__c> facilities) {
        List<FieldChange> out = new List<FieldChange>();
        if (String.isBlank(req.fieldChangesJson)) {
            return out;
        }
        List<Object> raw;
        try {
            raw = (List<Object>) JSON.deserializeUntyped(req.fieldChangesJson);
        } catch (Exception e) {
            throw new ToolException('fieldChangesJson could not be read as a JSON list: ' + e.getMessage());
        }
        Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.LLC_BI__Loan__c.fields.getMap();
        // Labels resolve too: the banker's word for a field is its label, not its API name.
        Map<String, String> byLabel = new Map<String, String>();
        for (String key : fieldMap.keySet()) {
            Schema.DescribeFieldResult dfr = fieldMap.get(key).getDescribe();
            byLabel.put(dfr.getLabel().toLowerCase(), dfr.getName());
        }
        Map<Id, LLC_BI__Loan__c> byId = new Map<Id, LLC_BI__Loan__c>(facilities);
        for (Object o : raw) {
            Map<String, Object> m = (Map<String, Object>) o;
            String rawField = m.get('field') == null ? null : String.valueOf(m.get('field')).trim();
            if (String.isBlank(rawField)) {
                throw new ToolException('Each field change names its field: the API name or the exact field label.');
            }
            String apiName = fieldMap.containsKey(rawField.toLowerCase())
                ? fieldMap.get(rawField.toLowerCase()).getDescribe().getName()
                : byLabel.get(rawField.toLowerCase());
            if (apiName == null) {
                throw new ToolException('No field named "' + rawField + '" exists on the facility in this org, by API name or by label.');
            }
            if (FIELD_WAVE_DENY.contains(apiName.toLowerCase())) {
                throw new ToolException(
                    apiName + ' is outside the field wave: the four scalars ride their own request keys, and stage, ' +
                    'status, anchors and versioning flags belong to the org and the engine.'
                );
            }
            Schema.DescribeFieldResult dfr = fieldMap.get(apiName.toLowerCase()).getDescribe();
            if (!dfr.isUpdateable() || dfr.isCalculated() || dfr.isAutoNumber()) {
                throw new ToolException(apiName + ' is not writable in this org (formula, rollup or system-owned). The describe is the authority.');
            }
            FieldChange fc = new FieldChange();
            fc.fieldName = apiName;
            fc.fieldLabel = dfr.getLabel();
            fc.targetLoanId = C360Plan.asId(m.get('targetLoanId'));
            if (fc.targetLoanId == null) {
                if (facilities.size() != 1) {
                    throw new ToolException('targetLoanId is required on each field change when more than one facility is selected.');
                }
                fc.targetLoanId = facilities[0].Id;
            }
            if (!byId.containsKey(fc.targetLoanId)) {
                throw new ToolException('A field change targets facility ' + fc.targetLoanId + ', which is not one of the selected facilities.');
            }
            coerceFieldValue(fc, dfr, m.get('value'));
            out.add(fc);
        }
        return out;
    }

    /** Coerces the supplied value into the field's own type and validates picklists. */
    private static void coerceFieldValue(FieldChange fc, Schema.DescribeFieldResult dfr, Object supplied) {
        if (supplied == null) {
            throw new ToolException(fc.fieldName + ' needs a value. Clearing a field is not a change this wave files.');
        }
        Schema.DisplayType t = dfr.getType();
        fc.fieldType = String.valueOf(t);
        String sv = String.valueOf(supplied).trim();
        if (t == Schema.DisplayType.CURRENCY || t == Schema.DisplayType.DOUBLE || t == Schema.DisplayType.PERCENT || t == Schema.DisplayType.INTEGER) {
            Decimal d;
            try { d = Decimal.valueOf(sv.replace(',', '')); } catch (Exception e) {
                throw new ToolException(fc.fieldName + ' is a number (' + fc.fieldType + '); "' + sv + '" is not one.');
            }
            fc.valueJson = JSON.serialize(d);
        } else if (t == Schema.DisplayType.DATE) {
            try { fc.valueJson = JSON.serialize(Date.valueOf(sv)); } catch (Exception e) {
                throw new ToolException(fc.fieldName + ' is a date; supply YYYY-MM-DD. Got "' + sv + '".');
            }
        } else if (t == Schema.DisplayType.BOOLEAN) {
            if (sv.toLowerCase() != 'true' && sv.toLowerCase() != 'false') {
                throw new ToolException(fc.fieldName + ' is a checkbox; supply true or false. Got "' + sv + '".');
            }
            fc.valueJson = sv.toLowerCase();
        } else if (t == Schema.DisplayType.PICKLIST || t == Schema.DisplayType.MULTIPICKLIST) {
            List<String> legal = new List<String>();
            String matched;
            for (Schema.PicklistEntry pe : dfr.getPicklistValues()) {
                if (!pe.isActive()) { continue; }
                legal.add(pe.getValue());
                if (pe.getValue().toLowerCase() == sv.toLowerCase() || pe.getLabel().toLowerCase() == sv.toLowerCase()) {
                    matched = pe.getValue();
                }
            }
            if (matched == null) {
                throw new ToolException(
                    '"' + sv + '" is not a legal value for ' + fc.fieldName + '. The org offers: ' + String.join(legal, ', ') + '.'
                );
            }
            fc.valueJson = JSON.serialize(matched);
        } else if (t == Schema.DisplayType.STRING || t == Schema.DisplayType.TEXTAREA || t == Schema.DisplayType.URL || t == Schema.DisplayType.EMAIL || t == Schema.DisplayType.PHONE) {
            fc.valueJson = JSON.serialize(sv);
        } else if (t == Schema.DisplayType.REFERENCE) {
            throw new ToolException(fc.fieldName + ' is a lookup. Re-anchoring records is not a field change; use the arm that owns that relationship.');
        } else {
            throw new ToolException(fc.fieldName + ' is a ' + fc.fieldType + ' field, which this wave does not coerce yet.');
        }
    }

    /** The staged value as the banker should read it in the plan step. */
    private static String displayValue(FieldChange fc) {
        Object v = JSON.deserializeUntyped(fc.valueJson);
        return String.valueOf(v);
    }

    /** The borrowing-structure roles the amendment arm may file. Grantor and Contractor stay out:
     *  collateral and construction semantics, not borrowing structure. */
    private static final Set<String> INVOLVEMENT_ROLES = new Set<String>{
        'Borrower', 'Co-Borrower', 'Guarantor', 'Limited Guarantor', 'Related Entity'
    };

    /**
     * Parses and RESOLVES the borrowing-structure amendments. An ADD resolves its account against
     * the org (by id, or by exact name — ambiguity refused with the candidate ids) and warns when
     * that account is already involved on the target. A REMOVE resolves the EXACT involvement row
     * it excludes from the carry, at stage time, so the banker confirms a named row rather than a
     * description — and an account involved under two roles is refused until the role settles it.
     */
    private static List<InvolvementChange> parseInvolvementChanges(Request req, List<LLC_BI__Loan__c> facilities, List<String> warnings) {
        List<InvolvementChange> out = new List<InvolvementChange>();
        if (String.isBlank(req.involvementChangesJson)) {
            return out;
        }
        List<Object> raw;
        try {
            raw = (List<Object>) JSON.deserializeUntyped(req.involvementChangesJson);
        } catch (Exception e) {
            throw new ToolException('involvementChangesJson could not be read as a JSON list: ' + e.getMessage());
        }
        Map<Id, LLC_BI__Loan__c> byId = new Map<Id, LLC_BI__Loan__c>(facilities);
        for (Object o : raw) {
            Map<String, Object> m = (Map<String, Object>) o;
            InvolvementChange ic = new InvolvementChange();
            ic.op = m.get('op') == null ? null : String.valueOf(m.get('op')).trim().toLowerCase();
            ic.role = m.get('role') == null ? null : String.valueOf(m.get('role')).trim();
            ic.accountId = C360Plan.asId(m.get('accountId'));
            ic.accountName = m.get('accountName') == null ? null : String.valueOf(m.get('accountName')).trim();
            ic.ownership = C360Plan.asDecimal(m.get('ownership'));
            ic.targetLoanId = C360Plan.asId(m.get('targetLoanId'));
            if (ic.op != 'add' && ic.op != 'remove') {
                throw new ToolException('Each borrowing-structure change carries op "add" or "remove". Supplied: ' + ic.op + '.');
            }
            if (ic.targetLoanId == null) {
                if (facilities.size() != 1) {
                    throw new ToolException('targetLoanId is required on each borrowing-structure change when more than one facility is selected.');
                }
                ic.targetLoanId = facilities[0].Id;
            }
            if (!byId.containsKey(ic.targetLoanId)) {
                throw new ToolException(
                    'A borrowing-structure change targets facility ' + ic.targetLoanId + ', which is not one of the selected facilities.'
                );
            }
            if (ic.op == 'add') {
                if (String.isBlank(ic.role) || !INVOLVEMENT_ROLES.contains(ic.role)) {
                    List<String> ok = new List<String>(INVOLVEMENT_ROLES);
                    ok.sort();
                    throw new ToolException('An involvement ADD names its role, one of: ' + String.join(ok, ', ') + '. Supplied: ' + ic.role + '.');
                }
                resolveAccount(ic);
                for (LLC_BI__Legal_Entities__c e : [
                    SELECT Id, LLC_BI__Borrower_Type__c FROM LLC_BI__Legal_Entities__c
                    WHERE LLC_BI__Loan__c = :ic.targetLoanId AND LLC_BI__Account__c = :ic.accountId
                    WITH USER_MODE
                ]) {
                    warnings.add(
                        ic.accountName + ' is ALREADY involved on ' + byId.get(ic.targetLoanId).Name + ' as ' +
                        e.LLC_BI__Borrower_Type__c + ', and the carry will bring that row onto the clone. This plan adds a ' +
                        ic.role + ' row BESIDE it only because the banker confirms it knowingly.'
                    );
                }
            } else {
                resolveRemoval(ic, byId.get(ic.targetLoanId).Name);
            }
            out.add(ic);
        }
        return out;
    }

    /** Resolves an ADD's account by id or exact name; ambiguity and absence are both refused. */
    private static void resolveAccount(InvolvementChange ic) {
        if (ic.accountId != null) {
            List<Account> a = [SELECT Id, Name FROM Account WHERE Id = :ic.accountId WITH USER_MODE LIMIT 1];
            if (a.isEmpty()) {
                throw new ToolException('No account exists with id ' + ic.accountId + '.');
            }
            ic.accountName = a[0].Name;
            return;
        }
        if (String.isBlank(ic.accountName)) {
            throw new ToolException('Each involvement ADD names its entity: accountId or accountName.');
        }
        List<Account> matches = [SELECT Id, Name FROM Account WHERE Name = :ic.accountName WITH USER_MODE LIMIT 5];
        if (matches.isEmpty()) {
            throw new ToolException(
                'No account named "' + ic.accountName + '" exists in this org. The name must match exactly; ' +
                'create the account first if the entity is genuinely new to the bank.'
            );
        }
        if (matches.size() > 1) {
            List<String> ids = new List<String>();
            for (Account a : matches) {
                ids.add(String.valueOf(a.Id));
            }
            throw new ToolException(
                'This org carries ' + matches.size() + ' accounts named "' + ic.accountName +
                '". Supply accountId to settle which one: ' + String.join(ids, ', ') + '.'
            );
        }
        ic.accountId = matches[0].Id;
        ic.accountName = matches[0].Name;
    }

    /** Resolves the EXACT involvement row a REMOVE excludes, on the target parent. */
    private static void resolveRemoval(InvolvementChange ic, String targetName) {
        List<LLC_BI__Legal_Entities__c> rows;
        if (ic.accountId != null) {
            rows = [
                SELECT Id, LLC_BI__Account__c, LLC_BI__Account__r.Name, LLC_BI__Borrower_Type__c, LLC_BI__Ownership__c
                FROM LLC_BI__Legal_Entities__c
                WHERE LLC_BI__Loan__c = :ic.targetLoanId AND LLC_BI__Account__c = :ic.accountId
                WITH USER_MODE
            ];
        } else if (String.isNotBlank(ic.accountName)) {
            rows = [
                SELECT Id, LLC_BI__Account__c, LLC_BI__Account__r.Name, LLC_BI__Borrower_Type__c, LLC_BI__Ownership__c
                FROM LLC_BI__Legal_Entities__c
                WHERE LLC_BI__Loan__c = :ic.targetLoanId AND LLC_BI__Account__r.Name = :ic.accountName
                WITH USER_MODE
            ];
        } else {
            throw new ToolException('Each involvement REMOVE names its entity: accountId or accountName.');
        }
        if (String.isNotBlank(ic.role)) {
            List<LLC_BI__Legal_Entities__c> narrowed = new List<LLC_BI__Legal_Entities__c>();
            for (LLC_BI__Legal_Entities__c r : rows) {
                if (r.LLC_BI__Borrower_Type__c == ic.role) {
                    narrowed.add(r);
                }
            }
            rows = narrowed;
        }
        if (rows.isEmpty()) {
            throw new ToolException(
                (ic.accountName != null ? ic.accountName : String.valueOf(ic.accountId)) +
                (String.isBlank(ic.role) ? '' : ' (' + ic.role + ')') +
                ' is not involved on ' + targetName + ', so there is nothing to remove. The structure the clone starts from is the parent\'s own.'
            );
        }
        if (rows.size() > 1) {
            List<String> roles = new List<String>();
            for (LLC_BI__Legal_Entities__c r : rows) {
                roles.add(r.LLC_BI__Borrower_Type__c);
            }
            throw new ToolException(
                rows[0].LLC_BI__Account__r.Name + ' is involved on ' + targetName + ' under ' + rows.size() +
                ' roles (' + String.join(roles, ', ') + '). Name the role so exactly one row is excluded.'
            );
        }
        ic.sourceRowId = rows[0].Id;
        ic.accountId = rows[0].LLC_BI__Account__c;
        ic.accountName = rows[0].LLC_BI__Account__r.Name;
        ic.role = rows[0].LLC_BI__Borrower_Type__c;
        ic.ownership = rows[0].LLC_BI__Ownership__c;
    }

    /** Resolves the covenant type by id or exact name against the org's own catalog. */
    private static void resolveCovenantType(CovenantAdd a) {
        if (a.typeId != null) {
            List<LLC_BI__Covenant_Type__c> t = [
                SELECT Id, Name FROM LLC_BI__Covenant_Type__c WHERE Id = :a.typeId WITH USER_MODE LIMIT 1
            ];
            if (t.isEmpty()) {
                throw new ToolException('No covenant type exists with id ' + a.typeId + '.');
            }
            a.typeName = t[0].Name;
            return;
        }
        if (String.isBlank(a.typeName)) {
            throw new ToolException('Each covenant add names its type: typeName or typeId.');
        }
        List<LLC_BI__Covenant_Type__c> matches = [
            SELECT Id, Name FROM LLC_BI__Covenant_Type__c WHERE Name = :a.typeName WITH USER_MODE
        ];
        if (matches.isEmpty()) {
            throw new ToolException(
                'No covenant type named "' + a.typeName + '" exists in this org\'s catalog. The name must match the catalog exactly.'
            );
        }
        if (matches.size() > 1) {
            List<String> ids = new List<String>();
            for (LLC_BI__Covenant_Type__c t : matches) {
                ids.add(String.valueOf(t.Id));
            }
            throw new ToolException(
                'This org carries ' + matches.size() + ' covenant types named "' + a.typeName +
                '". Supply typeId to settle which one: ' + String.join(ids, ', ') + '.'
            );
        }
        a.typeId = matches[0].Id;
        a.typeName = matches[0].Name;
    }

    /**
     * Every member of the package, for the roll computation. Honors the same seam as
     * readFacilities so the plan-shape tests see a consistent package: in the seam world the
     * injected facilities ARE the package membership.
     */
    private static List<LLC_BI__Loan__c> readPackageMembers(Id packageId) {
        if (seamFacilities != null) {
            return seamFacilities;
        }
        return [
            SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c
            FROM LLC_BI__Loan__c
            WHERE LLC_BI__Product_Package__c = :packageId
            WITH USER_MODE
            ORDER BY LLC_BI__Amount__c DESC
        ];
    }

    private static ToolError err(String code, String message, String orgError, String idempotencyKey) {
        ToolError e = new ToolError();
        e.code = code;
        e.message = message;
        e.orgError = orgError;
        e.resumable = false;
        e.idempotencyKey = idempotencyKey;
        return e;
    }
}
