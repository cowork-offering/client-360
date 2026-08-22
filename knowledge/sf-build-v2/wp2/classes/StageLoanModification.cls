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
        if (req.requestedAmount == null && req.requestedMaturityDate == null && req.requestedRate == null && req.requestedTermMonths == null) {
            throw new ToolException('At least one requested change is required: amount, maturity date, rate or term.');
        }
        if (req.requestedAmount != null && req.requestedAmount <= 0) {
            throw new ToolException('requestedAmount must be greater than zero.');
        }

        Id packageId = C360Facilities.packageId(req.productPackageId);
        List<Id> selected = C360Facilities.resolve(req.loanId, req.facilityIds, 'modification');
        List<LLC_BI__Loan__c> facilities =
            C360Facilities.validate(readFacilities(selected), selected, packageId, 'Modifications');
        Map<Id, Integer> carryoverByFacility = C360Facilities.covenantCarryover(selected);

        Integer n = facilities.size();
        Integer carryover = 0;
        Map<String, Object> resolved = new Map<String, Object>{
            'productPackageId' => packageId,
            'actionType' => 'Modification',
            'facilityCount' => n,
            'requestedAmount' => req.requestedAmount,
            'requestedMaturityDate' => req.requestedMaturityDate,
            'requestedRate' => req.requestedRate,
            'requestedTermMonths' => req.requestedTermMonths
        };

        List<C360Plan.Step> steps = new List<C360Plan.Step>();
        List<PlannedFacility> planned = new List<PlannedFacility>();
        List<String> facilityNames = new List<String>();

        for (Integer i = 0; i < n; i++) {
            LLC_BI__Loan__c loan = facilities[i];
            String s = String.valueOf(i);
            Integer own = carryoverByFacility.containsKey(loan.Id) ? carryoverByFacility.get(loan.Id) : 0;
            carryover += own;
            facilityNames.add(loan.Name);
            resolved.put('facility' + s + '.loanId', String.valueOf(loan.Id));

            steps.add(
                new C360Plan.Step('credit_action_' + s, C360Plan.TYPE_WRITE, 'Invoke the modification credit action on the package for ' + loan.Name)
                    .onObject('LLC_BI__Loan__c', new List<String>{ 'clone created by nCino' })
                    .wakes(new List<String>{
                        'nCino clones the facility, sets the loan-type flag and creates the LLC_BI__LoanRenewal__c junction row'
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
            'This plans a modification, NOT an approval. Executing it produces a clone facility at Qualification; BOOKING that clone requires nCino\'s Submit for Approval button, which Loan_Validation_06 enforces with no permission bypass.',
            'The junction object has no validation rules, no triggers and no flows, so a malformed row would fail silently. Execution therefore verifies the clone and its chain row by re-query and claims nothing the org will not read back.',
            'The platform is known to produce duplicate modification loans on failed background Apex, so idempotency is enforced by this tool rather than assumed.',
            carryover == 0
                ? 'No loan-level covenants are attached to ' + (n == 1 ? 'this facility' : 'these facilities') + ', so nothing would carry over.'
                : String.valueOf(carryover) + ' loan-level covenant junction rows would clone onto the new ' + (n == 1 ? 'facility' : 'facilities') +
                  '. nCino clones the junction, not the covenant, and its own guidance says a business process must decide what happens to each one.'
        };
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
            (n == 1
                ? 'Plans a modification of ' + facilityNames[0] + ' on the package.'
                : 'Plans a modification of ' + n + ' facilities on the package: ' + String.join(facilityNames, ', ') + '.') +
            ' nCino will clone ' + (n == 1 ? 'the facility' : 'each facility') + ', create the chain junction row and apply the requested changes to the clone. ' +
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
