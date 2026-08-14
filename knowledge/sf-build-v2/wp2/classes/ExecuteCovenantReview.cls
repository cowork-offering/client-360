/**
 * ExecuteCovenantReview - MCP tool: execute_covenant_review.
 *
 * Updates an EXISTING LLC_BI__Covenant_Compliance2__c record. Never creates one.
 *
 * WHY UPDATE-ONLY IS THE SAFETY PROPERTY, NOT A LIMITATION (PROBE-LEDGER wave 3, probe 8).
 * acnpex_covenantApprovalProcess is a flow-based ApprovalWorkflow with recordTriggerType Create
 * and filters []. It fires on create, unconditionally, and never on any update. Because A33 forbids
 * creating compliance records and this tool only updates them, the tool cannot start the bank's
 * approval chain by construction. A33.4.4(c)'s blanket "every write may start the chain" warning
 * was written when the entry criteria were unproven; it is now narrowed to the truth, and this
 * tool's confirm summary says plainly that it starts no approval.
 *
 * ============================ TESTABILITY SEAM, AND WHY ============================
 * `readCompliance` and `applyUpdate` are @TestVisible seams. Tests inject a record and capture the
 * intended write instead of touching the object. This exists for one reason, and it is a safety
 * reason rather than a convenience one:
 *
 *   To test this tool against a real record, a fixture would have to CREATE a compliance record.
 *   A create fires the approval workflow unconditionally, and probe 8 read that flow's metadata:
 *   orchestratedStages -> Stage_1 -> step RM_s_Approval, actionType stepApproval, assignee a named
 *   human. That address resolves to ACTIVE users in this org. Test DML rolls back, but whether a
 *   flow-based approval orchestration's notification survives the rollback cannot be proven without
 *   firing it once at a real person, which is precisely what probe 8 refused to do and what the
 *   prime directive forbids.
 *
 * So the suite never creates a compliance record. The live update path is therefore PROBE PENDING
 * and is cleared by a founder-gated first invocation against a real record, not by this test class.
 * ==================================================================================
 *
 * Org contract: A33.4.4. Allowlist: A33.3.1, status to Compliant or Exception only.
 */
global with sharing class ExecuteCovenantReview {

    /** Raised for a domain-level failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    /** Seam: when set, reads return this record instead of querying the object. See class header. */
    @TestVisible
    private static LLC_BI__Covenant_Compliance2__c seamRecord;

    /** Seam: the write the tool would have made, captured for assertion instead of executed. */
    @TestVisible
    private static LLC_BI__Covenant_Compliance2__c seamCapturedWrite;

    global class Request {
        @InvocableVariable(label='Idempotency Key' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Staging Id' required=true)
        global String stagingId;
        @InvocableVariable(label='Plan Hash' required=true)
        global String planHash;
        @InvocableVariable(label='Decision Token' required=true)
        global String decisionToken;
        @InvocableVariable(label='Approver User Id' required=true)
        global String approverUserId;
    }

    global class StepResult {
        @InvocableVariable(label='Step Id')
        global String id;
        @InvocableVariable(label='Type')
        global String type;
        @InvocableVariable(label='Label')
        global String label;
        @InvocableVariable(label='State')
        global String state;
        @InvocableVariable(label='Detail')
        global String detail;
    }

    global class ToolError {
        @InvocableVariable(label='Code')
        global String code;
        @InvocableVariable(label='Message')
        global String message;
        @InvocableVariable(label='Org Error')
        global String orgError;
        @InvocableVariable(label='Step')
        global String step;
        @InvocableVariable(label='Resumable')
        global Boolean resumable;
        @InvocableVariable(label='Idempotency Key')
        global String idempotencyKey;
    }

    global class ExecuteResult {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Covenant Compliance Id')
        global String covenantComplianceId;
        @InvocableVariable(label='Record Name')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='The covenant this compliance row belongs to.')
        global String anchorName;
        @InvocableVariable(label='Status')
        global String status;
        @InvocableVariable(label='Approval Chain Started' description='Always false. The chain fires on create only, and this tool never creates.')
        global Boolean approvalChainStarted;
        @InvocableVariable(label='Terminal State')
        global String terminalState;
        @InvocableVariable(label='Steps')
        global List<StepResult> steps;
        @InvocableVariable(label='Outcome')
        global String outcome;
        @InvocableVariable(label='Replayed')
        global Boolean replayed;
    }

    global class Response {
        @InvocableVariable(label='OK')
        global Boolean ok;
        @InvocableVariable(label='Result')
        global ExecuteResult result;
        @InvocableVariable(label='Error')
        global ToolError error;
    }

    /**
     * Executes a staged covenant assessment.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_covenant_review'
        description='Execute a plan staged by stage_covenant_review, behind the single-use decision token. Updates an existing covenant compliance record with the assessment and moves its status to Compliant or Exception. Creates nothing, and therefore starts no approval chain.'
    )
    global static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response res = new Response();
            try {
                res.result = execute(req);
                res.ok = true;
            } catch (ToolException e) {
                res.ok = false;
                res.error = err('VALIDATION_FAILED', e.getMessage(), null, null, false, req.idempotencyKey);
            } catch (C360ActionStaging.StagingException e) {
                res.ok = false;
                res.error = err('TOKEN_REFUSED', e.getMessage(), null, null, false, req.idempotencyKey);
            } catch (C360WriteGuard.GuardException e) {
                res.ok = false;
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, 'write_status', false, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused the covenant compliance update.', e.getMessage(), 'write_status', true, req.idempotencyKey);
            } catch (QueryException e) {
                res.ok = false;
                res.error = err('READ_FAILED', 'A record this plan depends on could not be read.', e.getMessage(), null, true, req.idempotencyKey);
            }
            out.add(res);
        }
        return out;
    }

    private static ExecuteResult execute(Request req) {
        if (String.isBlank(req.idempotencyKey)) {
            throw new ToolException('idempotencyKey is required and must match the key used at stage time.');
        }
        if (String.isBlank(req.stagingId)) {
            throw new ToolException('stagingId is required.');
        }
        if (String.isBlank(req.planHash)) {
            throw new ToolException('planHash is required.');
        }

        cm_Action_Staging__c prior = C360ActionStaging.findCompleted(req.idempotencyKey);
        if (prior != null) {
            return replay(prior);
        }

        cm_Action_Staging__c stg = C360ActionStaging.claimForExecute(
            req.stagingId, req.planHash, req.decisionToken, C360Plan.asId(req.approverUserId)
        );

        List<C360Plan.Step> steps = C360Plan.deserializeSteps(stg.cm_Plan_JSON__c);
        Map<String, Object> v = C360Plan.deserializeValues(stg.cm_Plan_JSON__c);
        String targetId = C360Plan.asString(v.get('targetId'));

        // Resume precondition (A33.3.3): re-read the target before any resumed write.
        List<LLC_BI__Covenant_Compliance2__c> targets = readCompliance(targetId);
        if (targets.isEmpty()) {
            C360Plan.markRefused(steps, 'The compliance record no longer exists or is no longer visible. Re-stage the action.');
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException('The compliance record this plan targets could not be re-read at execute time. Re-stage the action.');
        }

        String status = C360Plan.asString(v.get('LLC_BI__Status__c'));
        Boolean isException = status == 'Exception';

        Map<String, Object> writeFields = new Map<String, Object>{
            'LLC_BI__Status__c' => status,
            'Agentic_AI_Response__c' => C360Plan.asString(v.get('Agentic_AI_Response__c')),
            'LLC_BI__Comments__c' => C360Plan.asString(v.get('LLC_BI__Comments__c')),
            'cm_Covenant_Compliance_Indicator_Value__c' => C360Plan.asString(v.get('cm_Covenant_Compliance_Indicator_Value__c'))
        };
        if (isException) {
            writeFields.put('LLC_BI__Reason_for_Exception__c', 'Breached');
        }
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_UPDATE, writeFields);

        LLC_BI__Covenant_Compliance2__c pending = new LLC_BI__Covenant_Compliance2__c(
            Id = targets[0].Id,
            Agentic_AI_Response__c = (String) writeFields.get('Agentic_AI_Response__c'),
            LLC_BI__Comments__c = (String) writeFields.get('LLC_BI__Comments__c'),
            cm_Covenant_Compliance_Indicator_Value__c = (String) writeFields.get('cm_Covenant_Compliance_Indicator_Value__c'),
            LLC_BI__Status__c = status,
            LLC_BI__Evaluation_Date__c = Date.today(),
            LLC_BI__Evaluated_By__c = UserInfo.getUserId()
        );
        if (isException) {
            pending.LLC_BI__Reason_for_Exception__c = 'Breached';
            pending.LLC_BI__Exception_Date__c = Date.today();
        }

        applyUpdate(pending);
        C360Plan.setState(steps, 'write_assessment', C360Plan.STATE_VERIFIED, 'Assessment narrative and observed value written.');
        C360Plan.setState(steps, 'write_status', C360Plan.STATE_VERIFIED, 'Status set to ' + status + '.');

        List<LLC_BI__Covenant_Compliance2__c> after = readCompliance(targetId);
        ExecuteResult out = new ExecuteResult();
        out.stagingId = stg.Id;
        out.covenantComplianceId = targets[0].Id;
        out.approvalChainStarted = false;
        out.replayed = false;

        if (after.isEmpty()) {
            C360Plan.setState(steps, 'verify_assessment', C360Plan.STATE_FILED_UNVERIFIED, 'The update returned success but the record could not be read back.');
        } else {
            out.recordName = after[0].Name;
            out.status = seamRecord == null ? after[0].LLC_BI__Status__c : status;
            out.anchorName = after[0].LLC_BI__Covenant__c == null ? null : String.valueOf(after[0].LLC_BI__Covenant__c);
            C360Plan.setState(steps, 'verify_assessment', C360Plan.STATE_VERIFIED, 'Compliance record reads back at ' + out.status + '.');
        }

        String terminal = C360Plan.terminalState(steps);
        C360ActionStaging.recordOutcome(stg, steps, terminal, targets[0].Id);
        out.terminalState = terminal;
        out.steps = toWireSteps(steps);
        out.outcome = 'Covenant assessment recorded as ' + status + ' on ' + (out.recordName == null ? String.valueOf(targets[0].Id) : out.recordName) +
            '. No approval chain was started: that chain fires only when a compliance record is created, and this tool creates none.';
        return out;
    }

    /**
     * Reads a compliance record. Seam: returns the injected record in a test rather than touching
     * the object, because creating one to test against would fire the approval workflow at a real
     * person. See the class header for the full reasoning.
     *
     * Public rather than private because stage_covenant_review validates its target through the
     * same seam: if the stage tool queried the object directly, the suite could not test it either.
     *
     * @param recordId The compliance record id.
     * @return A single-element list, or empty when not found.
     */
    public static List<LLC_BI__Covenant_Compliance2__c> readCompliance(String recordId) {
        if (seamRecord != null) {
            return String.isNotBlank(recordId) && recordId == String.valueOf(seamRecord.Id)
                ? new List<LLC_BI__Covenant_Compliance2__c>{ seamRecord }
                : new List<LLC_BI__Covenant_Compliance2__c>();
        }
        return [
            SELECT Id, Name, LLC_BI__Status__c, LLC_BI__Covenant__c, Agentic_AI_Response__c
            FROM LLC_BI__Covenant_Compliance2__c
            WHERE Id = :recordId
            WITH USER_MODE
            LIMIT 1
        ];
    }

    /**
     * Applies the update. Seam: captures the intended write in a test instead of executing it.
     *
     * @param record The compliance record carrying only the fields this tool may write.
     */
    @TestVisible
    private static void applyUpdate(LLC_BI__Covenant_Compliance2__c record) {
        if (seamRecord != null) {
            seamCapturedWrite = record;
            return;
        }
        LLC_BI__Covenant_Compliance2__c clean = (LLC_BI__Covenant_Compliance2__c) Security.stripInaccessible(
            AccessType.UPDATABLE, new List<LLC_BI__Covenant_Compliance2__c>{ record }
        ).getRecords()[0];
        update as user clean;
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.stagingId = prior.Id;
        r.covenantComplianceId = prior.cm_Result_Record_Id__c;
        r.approvalChainStarted = false;
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.outcome = 'This idempotency key already assessed compliance record ' + prior.cm_Result_Record_Id__c + '. Nothing was written.';
        r.steps = prior.cm_Tracker_JSON__c == null
            ? new List<StepResult>()
            : toWireSteps((List<C360Plan.Step>) JSON.deserialize(prior.cm_Tracker_JSON__c, List<C360Plan.Step>.class));
        return r;
    }

    private static List<StepResult> toWireSteps(List<C360Plan.Step> steps) {
        List<StepResult> out = new List<StepResult>();
        for (C360Plan.Step s : steps) {
            StepResult r = new StepResult();
            r.id = s.id;
            r.type = s.type;
            r.label = s.label;
            r.state = s.state;
            r.detail = s.detail;
            out.add(r);
        }
        return out;
    }

    private static ToolError err(String code, String message, String orgError, String step, Boolean resumable, String idempotencyKey) {
        ToolError e = new ToolError();
        e.code = code;
        e.message = message;
        e.orgError = orgError;
        e.step = step;
        e.resumable = resumable;
        e.idempotencyKey = idempotencyKey;
        return e;
    }
}
