/**
 * ExecuteAnnualReview - MCP tool: execute_annual_review.
 *
 * Creates one LLC_BI__Review__c at status In Progress and stops. The plan's last step is a
 * handoff: the banker uses nCino's Submit for Approval and the org's own process mints Complete.
 *
 * Three refusals are enforced here rather than assumed (BUILD-BRIEF-V2 WP2 criterion 4):
 *   - LLC_BI__Status__c = 'Complete' is refused by the C360WriteGuard create allowlist.
 *   - cm_Review_Stage__c is refused as a forbidden field for any value.
 *   - RecordTypeId is refused: the Review After Save flow assigns it (probe 3).
 *
 * Status and Review_Type are both written explicitly and both are in the must-survive FLS set,
 * because probe 3 proved nothing defaults them and a stripped field would file a review in no
 * status at all.
 *
 * Org contract: A33.4.6. Write evidence: PROBE-LEDGER.md probe 3.
 */
global with sharing class ExecuteAnnualReview {

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
        @InvocableVariable(label='Review Id')
        global String reviewId;
        @InvocableVariable(label='Review Name')
        global String reviewName;
        @InvocableVariable(label='Record Name' description='The org-assigned name of the created record, for example R-100004. Uniform across all execute_* tools so the activity trail can stamp a real label instead of a generic one.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='Display name of the parent the record hangs off, here the borrower account.')
        global String anchorName;
        @InvocableVariable(label='Terminal State')
        global String terminalState;
        @InvocableVariable(label='Steps')
        global List<StepResult> steps;
        @InvocableVariable(label='Outcome')
        global String outcome;
        @InvocableVariable(label='Next Step' description='The handoff descriptor. Control passes to an org process this tool does not drive.')
        global String nextStep;
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
     * Executes a staged annual review.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_annual_review'
        description='Execute a plan staged by stage_annual_review, behind the single-use decision token. Creates one LLC_BI__Review__c at status In Progress with an explicit review type, never sets the record type, never writes Complete, and hands off to nCino Submit for Approval.'
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
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, 'write_review', false, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused the review write.', e.getMessage(), 'write_review', true, req.idempotencyKey);
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

        // Resume precondition (A33.3.3): re-read the anchor before writing. Selecting Name here
        // rather than COUNT() costs nothing and gives the activity trail its anchor label.
        List<Account> anchor = [SELECT Id, Name FROM Account WHERE Id = :accountId WITH USER_MODE LIMIT 1];
        if (anchor.isEmpty()) {
            C360Plan.markRefused(steps, 'The account no longer exists or is no longer visible. Re-stage the action.');
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException('The account this plan targets could not be re-read at execute time. Re-stage the action.');
        }

        Map<String, Object> writeFields = new Map<String, Object>{
            'LLC_BI__Account__c' => accountId,
            'LLC_BI__Product_Package__c' => C360Plan.asId(v.get('LLC_BI__Product_Package__c')),
            'LLC_BI__Status__c' => C360Plan.asString(v.get('LLC_BI__Status__c')),
            'LLC_BI__Review_Type__c' => C360Plan.asString(v.get('LLC_BI__Review_Type__c')),
            'LLC_BI__Is_Agentic_Review__c' => true,
            'LLC_BI__Narrative__c' => C360Plan.asString(v.get('LLC_BI__Narrative__c')),
            'cm_Relationship_Summary__c' => C360Plan.asString(v.get('cm_Relationship_Summary__c')),
            'cm_Strengths_Narrative__c' => C360Plan.asString(v.get('cm_Strengths_Narrative__c')),
            'cm_Weakness_Narrative__c' => C360Plan.asString(v.get('cm_Weakness_Narrative__c')),
            'cm_Recommendation_Narrative__c' => C360Plan.asString(v.get('cm_Recommendation_Narrative__c')),
            'cm_Collateral_Analysis_Narrative__c' => C360Plan.asString(v.get('cm_Collateral_Analysis_Narrative__c')),
            'cm_Financial_Analyst_Narrative__c' => C360Plan.asString(v.get('cm_Financial_Analyst_Narrative__c')),
            'cm_Guarantor_Narrative__c' => C360Plan.asString(v.get('cm_Guarantor_Narrative__c')),
            'cm_Risk_Rating_Comments__c' => C360Plan.asString(v.get('cm_Risk_Rating_Comments__c'))
        };
        C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_REVIEW, C360WriteGuard.OP_CREATE, writeFields);

        LLC_BI__Review__c record = new LLC_BI__Review__c(
            LLC_BI__Account__c = accountId,
            LLC_BI__Product_Package__c = (Id) writeFields.get('LLC_BI__Product_Package__c'),
            LLC_BI__Status__c = (String) writeFields.get('LLC_BI__Status__c'),
            LLC_BI__Review_Type__c = (String) writeFields.get('LLC_BI__Review_Type__c'),
            LLC_BI__Is_Agentic_Review__c = true,
            LLC_BI__Narrative__c = (String) writeFields.get('LLC_BI__Narrative__c'),
            cm_Relationship_Summary__c = (String) writeFields.get('cm_Relationship_Summary__c'),
            cm_Strengths_Narrative__c = (String) writeFields.get('cm_Strengths_Narrative__c'),
            cm_Weakness_Narrative__c = (String) writeFields.get('cm_Weakness_Narrative__c'),
            cm_Recommendation_Narrative__c = (String) writeFields.get('cm_Recommendation_Narrative__c'),
            cm_Collateral_Analysis_Narrative__c = (String) writeFields.get('cm_Collateral_Analysis_Narrative__c'),
            cm_Financial_Analyst_Narrative__c = (String) writeFields.get('cm_Financial_Analyst_Narrative__c'),
            cm_Guarantor_Narrative__c = (String) writeFields.get('cm_Guarantor_Narrative__c'),
            cm_Risk_Rating_Comments__c = (String) writeFields.get('cm_Risk_Rating_Comments__c')
        );

        LLC_BI__Review__c clean = (LLC_BI__Review__c) C360WriteGuard.stripAndVerify(
            record,
            new Set<String>{ 'LLC_BI__Account__c', 'LLC_BI__Status__c', 'LLC_BI__Review_Type__c' }
        );
        insert as user clean;
        C360Plan.setState(steps, 'write_review', C360Plan.STATE_VERIFIED, 'Review ' + clean.Id + ' inserted.');

        List<LLC_BI__Review__c> filed = [
            SELECT Id, Name, LLC_BI__Status__c, LLC_BI__Review_Type__c, RecordTypeId
            FROM LLC_BI__Review__c
            WHERE Id = :clean.Id
            WITH USER_MODE
            LIMIT 1
        ];

        String reviewName = null;
        if (filed.isEmpty()) {
            C360Plan.setState(steps, 'verify_review', C360Plan.STATE_FILED_UNVERIFIED, 'The insert returned success but the review could not be read back.');
            C360Plan.setState(steps, 'observe_after_save', C360Plan.STATE_FILED_UNVERIFIED, 'Record type assignment could not be observed.');
        } else {
            reviewName = filed[0].Name;
            LLC_BI__Review__c r = filed[0];
            if (r.LLC_BI__Status__c == null || r.LLC_BI__Review_Type__c == null) {
                C360Plan.setState(
                    steps,
                    'verify_review',
                    C360Plan.STATE_FAILED,
                    'The review filed with a null status or type. Probe 3 warned nothing defaults these, and something stripped them on write.'
                );
            } else {
                C360Plan.setState(
                    steps,
                    'verify_review',
                    C360Plan.STATE_VERIFIED,
                    'Review ' + reviewName + ' reads back at status ' + r.LLC_BI__Status__c + ', type ' + r.LLC_BI__Review_Type__c + '.'
                );
            }
            C360Plan.setState(
                steps,
                'observe_after_save',
                C360Plan.STATE_FILED_UNVERIFIED,
                r.RecordTypeId == null
                    ? 'The org did not assign a record type. We do not set one.'
                    : 'The org assigned record type ' + r.RecordTypeId + ' and populated the loan officer. Neither was set by this tool.'
            );
        }

        C360Plan.setState(
            steps,
            'handoff_approval',
            C360Plan.STATE_VERIFIED,
            'Control passes to nCino Submit for Approval. This tool advances nothing further.'
        );

        String terminal = C360Plan.terminalState(steps);
        C360ActionStaging.recordOutcome(stg, steps, terminal, clean.Id);

        ExecuteResult out = new ExecuteResult();
        out.stagingId = stg.Id;
        out.reviewId = clean.Id;
        out.reviewName = reviewName;
        out.recordName = reviewName;
        out.anchorName = anchor[0].Name;
        out.terminalState = terminal;
        out.replayed = false;
        out.steps = toWireSteps(steps);
        out.nextStep = 'Submit for Approval in nCino. The org\'s own process mints Complete; this tool never does.';
        // String.valueOf is load-bearing. Apex infers a ternary's type from its operands, so
        // (reviewName == null ? clean.Id : reviewName) resolves to Id and coerces the String
        // branch through Id.valueOf(), which throws on an autonumber name like R-100004.
        out.outcome = 'Review ' + (reviewName == null ? String.valueOf(clean.Id) : reviewName) +
            ' opened at In Progress with the drafted narrative attached. Nothing has been approved or completed.';
        return out;
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.stagingId = prior.Id;
        r.reviewId = prior.cm_Result_Record_Id__c;
        r.recordName = nameOf(prior.cm_Result_Record_Id__c);
        r.reviewName = r.recordName;
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.nextStep = 'Submit for Approval in nCino.';
        r.outcome = 'This idempotency key already produced review ' + prior.cm_Result_Record_Id__c + '. Nothing was written.';
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
        List<LLC_BI__Review__c> rows = [
            SELECT Id, Name FROM LLC_BI__Review__c WHERE Id = :recordId WITH USER_MODE LIMIT 1
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
