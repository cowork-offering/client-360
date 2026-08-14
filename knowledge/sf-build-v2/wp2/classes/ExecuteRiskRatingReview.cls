/**
 * ExecuteRiskRatingReview - MCP tool: execute_risk_rating_review.
 *
 * Creates one LLC_BI__Annual_Review__c at status In Review and stops. Approved and Declined belong
 * to the org's RiskRatingReviewDecisioned path (A33.3.1) and are refused by C360WriteGuard.
 *
 * Three refusals are enforced rather than assumed:
 *   - LLC_BI__Final_Risk_Grade__c is a formula and is on the forbidden-field list.
 *   - RecordTypeId and OwnerId DO NOT EXIST on this object (probe 4). They are on the forbidden
 *     list too, so a tool that tries reads a clear refusal instead of a platform error.
 *   - Any create state other than 'In Review' is refused, because the field defaults to
 *     'Not Approved' and an omitted status would read as a decision nobody made.
 *
 * LLC_BI__Status__c is in the must-survive FLS set for exactly that reason: a stripped status does
 * not land as null here, it lands as a decision.
 *
 * Org contract: A33.4.7. Write evidence: PROBE-LEDGER wave 3, probe 4.
 */
global with sharing class ExecuteRiskRatingReview {

    /** Raised for a domain-level failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

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
        @InvocableVariable(label='Risk Rating Review Id')
        global String riskRatingReviewId;
        @InvocableVariable(label='Record Name' description='The org-assigned autonumber, for example RG-0000001.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='The borrower account this review hangs off.')
        global String anchorName;
        @InvocableVariable(label='Status')
        global String status;
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
     * Executes a staged risk rating review.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_risk_rating_review'
        description='Execute a plan staged by stage_risk_rating_review, behind the single-use decision token. Creates one LLC_BI__Annual_Review__c at status In Review with the scoring inputs, never writes the final grade formula, and records no decision.'
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
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, 'write_risk_rating', false, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused the risk rating review write.', e.getMessage(), 'write_risk_rating', true, req.idempotencyKey);
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
        Id accountId = C360Plan.asId(v.get('LLC_BI__Account__c'));

        // Resume precondition (A33.3.3): re-read the anchor before writing.
        List<Account> anchor = [SELECT Id, Name FROM Account WHERE Id = :accountId WITH USER_MODE LIMIT 1];
        if (anchor.isEmpty()) {
            C360Plan.markRefused(steps, 'The account no longer exists or is no longer visible. Re-stage the action.');
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException('The account this plan targets could not be re-read at execute time. Re-stage the action.');
        }

        Map<String, Object> writeFields = new Map<String, Object>{
            'LLC_BI__Account__c' => accountId,
            'LLC_BI__Loan__c' => C360Plan.asId(v.get('LLC_BI__Loan__c')),
            'LLC_BI__Status__c' => C360Plan.asString(v.get('LLC_BI__Status__c')),
            'LLC_BI__Computed_Risk_Grade_Value__c' => C360Plan.asDecimal(v.get('LLC_BI__Computed_Risk_Grade_Value__c')),
            'LLC_BI__Overridden_Risk_Grade_Value__c' => C360Plan.asDecimal(v.get('LLC_BI__Overridden_Risk_Grade_Value__c')),
            'LLC_BI__Comments__c' => C360Plan.asString(v.get('LLC_BI__Comments__c')),
            'LLC_BI__Cash_Flow_Coverage_actual__c' => C360Plan.asDecimal(v.get('LLC_BI__Cash_Flow_Coverage_actual__c')),
            'LLC_BI__Credit_Score_actual__c' => C360Plan.asDecimal(v.get('LLC_BI__Credit_Score_actual__c')),
            'LLC_BI__Management_Experience_actual__c' => C360Plan.asDecimal(v.get('LLC_BI__Management_Experience_actual__c')),
            'LLC_BI__Revenue_Growth_actual__c' => C360Plan.asDecimal(v.get('LLC_BI__Revenue_Growth_actual__c'))
        };
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_RISK_RATING, C360WriteGuard.OP_CREATE, writeFields);

        LLC_BI__Annual_Review__c record = new LLC_BI__Annual_Review__c(
            LLC_BI__Account__c = accountId,
            LLC_BI__Loan__c = (Id) writeFields.get('LLC_BI__Loan__c'),
            LLC_BI__Status__c = (String) writeFields.get('LLC_BI__Status__c'),
            LLC_BI__Computed_Risk_Grade_Value__c = (Decimal) writeFields.get('LLC_BI__Computed_Risk_Grade_Value__c'),
            LLC_BI__Overridden_Risk_Grade_Value__c = (Decimal) writeFields.get('LLC_BI__Overridden_Risk_Grade_Value__c'),
            LLC_BI__Comments__c = (String) writeFields.get('LLC_BI__Comments__c'),
            LLC_BI__Cash_Flow_Coverage_actual__c = (Decimal) writeFields.get('LLC_BI__Cash_Flow_Coverage_actual__c'),
            LLC_BI__Credit_Score_actual__c = (Decimal) writeFields.get('LLC_BI__Credit_Score_actual__c'),
            LLC_BI__Management_Experience_actual__c = (Decimal) writeFields.get('LLC_BI__Management_Experience_actual__c'),
            LLC_BI__Revenue_Growth_actual__c = (Decimal) writeFields.get('LLC_BI__Revenue_Growth_actual__c')
        );

        LLC_BI__Annual_Review__c clean = (LLC_BI__Annual_Review__c) C360WriteGuard.stripAndVerify(
            record,
            new Set<String>{ 'LLC_BI__Account__c', 'LLC_BI__Status__c' }
        );
        insert as user clean;
        C360Plan.setState(steps, 'write_risk_rating', C360Plan.STATE_VERIFIED, 'Risk rating review ' + clean.Id + ' created.');

        List<LLC_BI__Annual_Review__c> filed = [
            SELECT Id, Name, LLC_BI__Status__c, LLC_BI__Final_Risk_Grade__c
            FROM LLC_BI__Annual_Review__c
            WHERE Id = :clean.Id
            WITH USER_MODE
            LIMIT 1
        ];

        ExecuteResult out = new ExecuteResult();
        out.stagingId = stg.Id;
        out.riskRatingReviewId = clean.Id;
        out.anchorName = anchor[0].Name;
        out.replayed = false;

        if (filed.isEmpty()) {
            C360Plan.setState(steps, 'verify_risk_rating', C360Plan.STATE_FILED_UNVERIFIED, 'The insert returned success but the review could not be read back.');
        } else {
            out.recordName = filed[0].Name;
            out.status = filed[0].LLC_BI__Status__c;
            if (filed[0].LLC_BI__Status__c != 'In Review') {
                C360Plan.setState(
                    steps,
                    'verify_risk_rating',
                    C360Plan.STATE_FAILED,
                    'The review filed at status ' + filed[0].LLC_BI__Status__c + ' rather than In Review. Probe 4 warned the default reads as a decision.'
                );
            } else {
                C360Plan.setState(
                    steps,
                    'verify_risk_rating',
                    C360Plan.STATE_VERIFIED,
                    'Review ' + filed[0].Name + ' reads back at In Review, computed grade ' + String.valueOf(filed[0].LLC_BI__Final_Risk_Grade__c) + '.'
                );
            }
        }

        C360Plan.setState(
            steps,
            'observe_loan_writeback',
            C360Plan.STATE_FILED_UNVERIFIED,
            'Risk Rating (Annual) Review After Save may write the grade back onto the loan. That is org automation and is not verified here.'
        );

        String terminal = C360Plan.terminalState(steps);
        C360ActionStaging.recordOutcome(stg, steps, terminal, clean.Id);
        out.terminalState = terminal;
        out.steps = toWireSteps(steps);
        out.outcome = 'Risk rating review ' + (out.recordName == null ? String.valueOf(clean.Id) : out.recordName) +
            ' opened at In Review with the scoring inputs attached. The org computes the final grade. No decision was recorded.';
        return out;
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.stagingId = prior.Id;
        r.riskRatingReviewId = prior.cm_Result_Record_Id__c;
        r.recordName = nameOf(prior.cm_Result_Record_Id__c);
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.outcome = 'This idempotency key already produced risk rating review ' + prior.cm_Result_Record_Id__c + '. Nothing was written.';
        r.steps = prior.cm_Tracker_JSON__c == null
            ? new List<StepResult>()
            : toWireSteps((List<C360Plan.Step>) JSON.deserialize(prior.cm_Tracker_JSON__c, List<C360Plan.Step>.class));
        return r;
    }

    /** The org-assigned autonumber of an already-created review, so a replay stamps the same label. */
    private static String nameOf(String recordId) {
        if (String.isBlank(recordId)) {
            return null;
        }
        List<LLC_BI__Annual_Review__c> rows = [
            SELECT Id, Name FROM LLC_BI__Annual_Review__c WHERE Id = :recordId WITH USER_MODE LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0].Name;
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
