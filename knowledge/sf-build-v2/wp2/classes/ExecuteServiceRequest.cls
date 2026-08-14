/**
 * ExecuteServiceRequest - MCP tool: execute_service_request.
 *
 * The Case insert is a single synchronous write with no asynchronous automation of ours, so this
 * runs immediately after confirm rather than deferring (A33.5.7). "Immediate" describes latency,
 * not exemption: it is token-gated exactly like every other execute, returns a typed plan result,
 * and carries the possible-Slack-post observed_side_effect step, which is never claimed as
 * verified because nothing here can watch Slack.
 *
 * Allowlist (A33.3.1): Case may be created at Status = 'New' only. No status transitions. No
 * closure. Attempting either is refused by C360WriteGuard, not merely absent from the UI.
 *
 * Org contract: A33.4.8. Write evidence: PROBE-LEDGER.md probe 2.
 */
global with sharing class ExecuteServiceRequest {

    /** Raised for a domain-level failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    global class Request {
        @InvocableVariable(label='Idempotency Key' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Staging Id' required=true)
        global String stagingId;
        @InvocableVariable(label='Plan Hash' required=true)
        global String planHash;
        @InvocableVariable(label='Decision Token' description='Single use. Proves a named human confirmed this plan. Not a credit approval.' required=true)
        global String decisionToken;
        @InvocableVariable(label='Approver User Id' description='Required on every execute without exception. Must be the running identity.' required=true)
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
        @InvocableVariable(label='Case Id')
        global String caseId;
        @InvocableVariable(label='Case Number')
        global String caseNumber;
        @InvocableVariable(label='Record Name' description='The org-assigned name of the created record. On Case that is the CaseNumber. Uniform across all execute_* tools so the activity trail can stamp a real label instead of a generic one.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='Display name of the parent the record hangs off, here the borrower account.')
        global String anchorName;
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
     * Executes a staged service request.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_service_request'
        description='Execute a plan staged by stage_service_request, behind the single-use decision token. Creates one Case at status New. Takes no status transition and closes nothing.'
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
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, 'write_case', false, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused the case write.', e.getMessage(), 'write_case', true, req.idempotencyKey);
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
        Id accountId = C360Plan.asId(v.get('AccountId'));

        // Resume precondition (A33.3.3): re-read the anchor before writing. Selecting Name here
        // rather than COUNT() costs nothing and gives the activity trail its anchor label.
        List<Account> anchor = [SELECT Id, Name FROM Account WHERE Id = :accountId WITH USER_MODE LIMIT 1];
        if (anchor.isEmpty()) {
            C360Plan.markRefused(steps, 'The account no longer exists or is no longer visible. Re-stage the action.');
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException('The account this plan targets could not be re-read at execute time. Re-stage the action.');
        }

        Map<String, Object> writeFields = new Map<String, Object>{
            'AccountId' => accountId,
            'Type' => C360Plan.asString(v.get('Type')),
            'Origin' => C360Plan.asString(v.get('Origin')),
            'Status' => C360Plan.asString(v.get('Status')),
            'Subject' => C360Plan.asString(v.get('Subject')),
            'Description' => C360Plan.asString(v.get('Description'))
        };
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_CASE, C360WriteGuard.OP_CREATE, writeFields);

        Case record = new Case(
            AccountId = accountId,
            Type = (String) writeFields.get('Type'),
            Origin = (String) writeFields.get('Origin'),
            Status = (String) writeFields.get('Status'),
            Subject = (String) writeFields.get('Subject'),
            Description = (String) writeFields.get('Description')
        );

        Case clean = (Case) C360WriteGuard.stripAndVerify(record, new Set<String>{ 'AccountId', 'Status', 'Type', 'Origin', 'Subject' });
        insert as user clean;
        C360Plan.setState(steps, 'write_case', C360Plan.STATE_VERIFIED, 'Case ' + clean.Id + ' inserted.');

        List<Case> filed = [SELECT Id, CaseNumber, Status, Type, Origin FROM Case WHERE Id = :clean.Id WITH USER_MODE LIMIT 1];
        String caseNumber = null;
        if (filed.isEmpty()) {
            C360Plan.setState(steps, 'verify_case', C360Plan.STATE_FILED_UNVERIFIED, 'The insert returned success but the case could not be read back.');
        } else {
            caseNumber = filed[0].CaseNumber;
            C360Plan.setState(
                steps,
                'verify_case',
                C360Plan.STATE_VERIFIED,
                'Case ' + caseNumber + ' reads back at status ' + filed[0].Status + ', type ' + filed[0].Type + ', origin ' + filed[0].Origin + '.'
            );
        }

        // Never verified: nothing in this transaction can observe a Slack post (A33.4.8(c)).
        C360Plan.setState(
            steps,
            'observe_slack',
            C360Plan.STATE_FILED_UNVERIFIED,
            'slackv2.caseTrigger fired as part of the insert. Whether it posted to Slack is not observable from here and is not claimed.'
        );

        String terminal = C360Plan.terminalState(steps);
        C360ActionStaging.recordOutcome(stg, steps, terminal, clean.Id);

        ExecuteResult r = new ExecuteResult();
        r.stagingId = stg.Id;
        r.caseId = clean.Id;
        r.caseNumber = caseNumber;
        r.recordName = caseNumber;
        r.anchorName = anchor[0].Name;
        r.terminalState = terminal;
        r.replayed = false;
        r.steps = toWireSteps(steps);
        // String.valueOf is load-bearing. Apex infers a ternary's type from its operands, so
        // (caseNumber == null ? clean.Id : caseNumber) resolves to Id and coerces the String
        // branch through Id.valueOf(), which throws on a case number like 00101324.
        r.outcome = 'Service request raised as case ' + (caseNumber == null ? String.valueOf(clean.Id) : caseNumber) +
            ' at status New. It has not been routed, transitioned or closed by this tool.';
        return r;
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.stagingId = prior.Id;
        r.caseId = prior.cm_Result_Record_Id__c;
        r.recordName = nameOf(prior.cm_Result_Record_Id__c);
        r.caseNumber = r.recordName;
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.outcome = 'This idempotency key already produced case ' + prior.cm_Result_Record_Id__c + '. Nothing was written.';
        r.steps = prior.cm_Tracker_JSON__c == null
            ? new List<StepResult>()
            : toWireSteps((List<C360Plan.Step>) JSON.deserialize(prior.cm_Tracker_JSON__c, List<C360Plan.Step>.class));
        return r;
    }

    /**
     * The org-assigned name of an already-created record, so a replay stamps the same label the
     * first run did. Without it the activity trail would go generic exactly on the replay path.
     */
    private static String nameOf(String recordId) {
        if (String.isBlank(recordId)) {
            return null;
        }
        List<Case> rows = [SELECT Id, CaseNumber FROM Case WHERE Id = :recordId WITH USER_MODE LIMIT 1];
        return rows.isEmpty() ? null : rows[0].CaseNumber;
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
