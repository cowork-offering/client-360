/**
 * StageCovenantReview - MCP tool: stage_covenant_review.
 *
 * A33.0.1: ZERO domain DML. The compliance record is updated only by execute_covenant_review.
 *
 * UPDATE-ONLY, AND THAT IS THE WHOLE SAFETY ARGUMENT (PROBE-LEDGER wave 3, probe 8).
 * acnpex_covenantApprovalProcess is a flow-based ApprovalWorkflow, the only one in the org, with
 * triggerType RecordAfterSave, recordTriggerType Create, filters [] and exitRules []. It fires on
 * CREATE ONLY, unconditionally, and never on any update: not on status, not on the narrative
 * fields. Since A33 forbids creating compliance records and this tool only ever updates them,
 * OUR TOOLS CANNOT START THE BANK'S APPROVAL CHAIN BY CONSTRUCTION.
 *
 * That REPLACES the blanket precaution A33.4.4(c) carried. The earlier warning treated every
 * write, including narrative-only fields, as potentially chain-starting because the entry criteria
 * were unproven. They are proven now. Leaving that warning on the update path would be inaccurate,
 * so it is gone. Two facts survive it: zero entry filters means no Exclude_Flow bypass is consulted
 * on a create, and the classic CCAP100 process is Obsolete, so ProcessInstance is the wrong object
 * to verify this chain against.
 *
 * The bank still starts approvals, by creating new compliance records through its own managed
 * automation. This tool reports an assessment on a record that already exists.
 *
 * Org contract: A33.4.4.
 */
global with sharing class StageCovenantReview {

    /** Raised for a domain-level validation failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    private static final Set<String> RESULTS = new Set<String>{ 'Compliant', 'Exception' };

    global class Request {
        @InvocableVariable(label='Idempotency Key' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Account Id' description='The borrower relationship. Product Package is not a covenant attachment point.' required=true)
        global String accountId;
        @InvocableVariable(label='Rationale' required=true)
        global String rationale;
        @InvocableVariable(label='Covenant Compliance Id' description='An EXISTING compliance record. This tool never creates one: creation is managed automation and is what starts the bank\'s approval chain.' required=true)
        global String covenantComplianceId;
        @InvocableVariable(label='Result' description='Compliant or Exception. Nothing else is on the transition allowlist.' required=true)
        global String result;
        @InvocableVariable(label='Observed Value' description='The tested figure, written to the indicator value field.')
        global String observedValue;
        @InvocableVariable(label='Narrative' description='The assessment, written to the agent response field.')
        global String narrative;
        @InvocableVariable(label='Comments')
        global String comments;
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
     * Stages a covenant assessment. Writes nothing.
     *
     * @param requests One request per staged action. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='stage_covenant_review'
        description='Validate a covenant assessment against the org contract and return an immutable execution plan with a plan hash and a single-use decision token. Writes nothing. Updates only an existing compliance record; never creates one, and therefore cannot start the bank approval chain.'
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
        if (String.isBlank(req.accountId)) {
            throw new ToolException('accountId is required. Covenants attach to the relationship, not to the product package.');
        }
        if (String.isBlank(req.rationale)) {
            throw new ToolException('rationale is required. It feeds the audit ledger.');
        }
        if (String.isBlank(req.covenantComplianceId)) {
            throw new ToolException('covenantComplianceId is required. This tool updates an existing compliance record and never creates one.');
        }
        if (String.isBlank(req.result) || !RESULTS.contains(req.result)) {
            throw new ToolException('result must be Compliant or Exception. Nothing else is on the transition allowlist (A33.3.1).');
        }

        List<Account> accounts = [SELECT Id, Name FROM Account WHERE Id = :req.accountId WITH USER_MODE LIMIT 1];
        if (accounts.isEmpty()) {
            throw new ToolException('Account ' + req.accountId + ' was not found, or is not visible to you.');
        }

        List<LLC_BI__Covenant_Compliance2__c> targets = ExecuteCovenantReview.readCompliance(req.covenantComplianceId);
        if (targets.isEmpty()) {
            throw new ToolException('Covenant compliance record ' + req.covenantComplianceId + ' was not found, or is not visible to you.');
        }

        Boolean isException = req.result == 'Exception';
        Map<String, Object> resolved = new Map<String, Object>{
            'targetId' => req.covenantComplianceId,
            'LLC_BI__Status__c' => req.result,
            'Agentic_AI_Response__c' => req.narrative,
            'LLC_BI__Comments__c' => req.comments,
            'cm_Covenant_Compliance_Indicator_Value__c' => req.observedValue,
            'LLC_BI__Reason_for_Exception__c' => isException ? 'Breached' : null
        };

        List<C360Plan.Step> steps = new List<C360Plan.Step>();
        steps.add(
            new C360Plan.Step('write_assessment', C360Plan.TYPE_WRITE, 'Record the assessment narrative and observed value')
                .onObject(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, new List<String>{
                    'Agentic_AI_Response__c', 'LLC_BI__Comments__c', 'cm_Covenant_Compliance_Indicator_Value__c'
                })
                .wakes(new List<String>{
                    'Three triggers on update (LLC_BI, nCino, nCRED.covenantCompliance_BeforeUpdate)',
                    'ACNPEX_Covenant Mgmt Calculation Logic Update on the parent, which carries no bypass'
                })
                .provenBy('SELECT Id, Agentic_AI_Response__c FROM LLC_BI__Covenant_Compliance2__c WHERE Id = :targetId')
        );
        steps.add(
            new C360Plan.Step('write_status', C360Plan.TYPE_WRITE, 'Move the compliance status to ' + req.result)
                .onObject(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, isException
                    ? new List<String>{ 'LLC_BI__Status__c', 'LLC_BI__Reason_for_Exception__c', 'LLC_BI__Exception_Date__c', 'LLC_BI__Evaluation_Date__c', 'LLC_BI__Evaluated_By__c' }
                    : new List<String>{ 'LLC_BI__Status__c', 'LLC_BI__Evaluation_Date__c', 'LLC_BI__Evaluated_By__c' })
                .provenBy('SELECT Id, LLC_BI__Status__c FROM LLC_BI__Covenant_Compliance2__c WHERE Id = :targetId')
        );
        steps.add(
            new C360Plan.Step('verify_assessment', C360Plan.TYPE_VERIFICATION, 'Confirm the compliance record reads back at ' + req.result)
                .onObject(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, new List<String>{ 'LLC_BI__Status__c' })
                .provenBy('SELECT Id, LLC_BI__Status__c, Agentic_AI_Response__c FROM LLC_BI__Covenant_Compliance2__c WHERE Id = :targetId')
        );

        List<String> warnings = new List<String>{
            'This action updates an existing compliance record. It does not start the bank\'s covenant approval chain: that chain fires only when a compliance record is CREATED, which this tool never does.',
            'The covenant this record belongs to is set once at creation and is never rewritten here.',
            'The parent covenant\'s effective date is never touched. Writing it corrupts the whole compliance schedule.'
        };
        if (isException) {
            warnings.add('Recording an exception marks the covenant as breached and stamps an exception date. That is a reporting state, not a waiver and not a decision on the credit.');
        }

        Map<String, Object> provenance = new Map<String, Object>{
            'targetId' => new Map<String, String>{ 'prefill' => 'NCINO_RECORD', 'provenance' => 'NCINO', 'citation' => req.covenantComplianceId },
            'LLC_BI__Status__c' => new Map<String, String>{ 'prefill' => 'BANKER', 'provenance' => null, 'citation' => null },
            'Agentic_AI_Response__c' => new Map<String, String>{ 'prefill' => 'AGENT_NARRATIVE', 'provenance' => 'AGENT', 'citation' => 'Agent-drafted assessment.' }
        };

        String summary =
            'Records a covenant assessment of ' + req.result + ' on an existing compliance record for ' + accounts[0].Name +
            '. Updates the narrative, the observed value and the status. Creates nothing, so the bank\'s approval chain is not started, ' +
            'and no credit decision is made or implied.';

        String planJson = C360Plan.serializePlan(summary, steps, warnings, provenance, resolved);
        String planHash = C360Plan.hash('covenant-review', steps, resolved);

        C360ActionStaging.Staged staged = C360ActionStaging.stagePlan(
            'covenant-review', req.idempotencyKey, req.accountId, null, planJson, planHash
        );

        StageResult r = new StageResult();
        r.stagingId = staged.stagingId;
        r.planHash = staged.planHash;
        r.decisionToken = staged.decisionToken;
        r.replayed = staged.replayed;
        r.summary = summary;
        r.warnings = warnings;
        r.provenanceJson = JSON.serialize(provenance);
        r.accountId = req.accountId;
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
