/**
 * ExecuteCovenantReview - MCP tool: execute_covenant_review.
 *
 * Runs the package-scoped plan stage_covenant_review staged, behind the single-use decision token.
 * Updates N EXISTING LLC_BI__Covenant_Compliance2__c records. Creates none, ever.
 *
 * THE APPROVAL CHAIN IS MEASURED, NOT ASSERTED. The previous version of this class hard-coded
 * `approvalChainStarted = false` with the comment "Always false", on the ground that
 * `acnpex_covenantApprovalProcess` is create-triggered and this tool only updates. That reasoning
 * covers our DML and not the transaction: three vendor sources say that moving a compliance row into
 * a complete status is what makes nCino CREATE the next compliance record (kb:kAHHu000000XZRJOA4,
 * PDI-00023403, kb:kAHPY00000055lR4AQ), and that create is what raises the approval work item. So
 * this tool now records the covenant's existing compliance rows BEFORE the write and re-queries
 * AFTER it, and reports what it observed. The same discipline the collateral rollup already uses.
 *
 * One honest limit on that measurement, stated rather than buried: it can only see a row created
 * SYNCHRONOUSLY, inside this transaction. A successor row minted by asynchronous work would not be
 * visible here, and the per-item detail says so rather than claiming a clean negative.
 *
 * PER-ITEM ISOLATION. A covenant whose compliance row moved since staging is refused on its own and
 * does not discard its siblings, so the DML runs with allOrNone false under USER_MODE and each row's
 * result is reported against its own covenant.
 *
 * THE PENDING PRECONDITION IS RE-APPLIED HERE. Staging refused a non-Pending row; the row may have
 * moved between stage and execute, so C360Covenants.applyPrecondition runs again against the re-read
 * status. The staged plan carries the caller's allowNonPending opt-in, and nothing else can grant it.
 *
 * Org contract: A33.4.4. Allowlist: A33.3.1, status to Compliant, Waived or Exception only.
 */
global with sharing class ExecuteCovenantReview {

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

    /** One covenant assessment in the batch, with its own outcome. */
    global class ItemResult {
        @InvocableVariable(label='Covenant Id')
        global String covenantId;
        @InvocableVariable(label='Covenant Compliance Id')
        global String covenantComplianceId;
        @InvocableVariable(label='Record Name' description='The org-assigned compliance record name.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='The covenant this compliance row belongs to, by name rather than by id.')
        global String anchorName;
        @InvocableVariable(label='Source Status' description='The row status before the write. Only Pending advances the schedule.')
        global String sourceStatus;
        @InvocableVariable(label='Status' description='The status the row reads back at.')
        global String status;
        @InvocableVariable(label='Written')
        global Boolean written;
        @InvocableVariable(label='Next Compliance Row Created' description='Whether nCino minted a successor compliance row on this covenant inside this transaction. Null when it could not be observed.')
        global Boolean nextComplianceRowCreated;
        @InvocableVariable(label='Next Compliance Row Id')
        global String nextComplianceRowId;
        @InvocableVariable(label='Outcome')
        global String outcome;
    }

    global class ExecuteResult {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Covenant Compliance Id' description='The first written row. Mirrors items[0] so a single-covenant caller reads a scalar.')
        global String covenantComplianceId;
        @InvocableVariable(label='Record Name')
        global String recordName;
        @InvocableVariable(label='Anchor Name')
        global String anchorName;
        @InvocableVariable(label='Status')
        global String status;
        @InvocableVariable(label='Approval Chain Started' description='MEASURED, not asserted: true when a successor compliance row was observed on any covenant in this batch, because that create is what raises the bank approval work item. Only synchronous creation is observable here.')
        global Boolean approvalChainStarted;
        @InvocableVariable(label='Terminal State')
        global String terminalState;
        @InvocableVariable(label='Steps')
        global List<StepResult> steps;
        @InvocableVariable(label='Outcome')
        global String outcome;
        @InvocableVariable(label='Items' description='One entry per covenant in the batch, each with its own source status, outcome and generation answer.')
        global List<ItemResult> items;
        @InvocableVariable(label='Item Count')
        global Integer itemCount;
        @InvocableVariable(label='Written Count')
        global Integer writtenCount;
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
     * Executes a staged package-scoped covenant review.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_covenant_review'
        description='Execute a plan staged by stage_covenant_review, behind the single-use decision token. Updates N existing covenant compliance records with their assessments and moves each status to Compliant, Waived or Exception. Creates nothing, re-applies the Pending precondition per covenant against re-read org state, and measures whether nCino minted a successor compliance row rather than asserting it did not.'
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
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, 'write_status_0', false, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused the covenant compliance update.', e.getMessage(), 'write_status_0', true, req.idempotencyKey);
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
        Integer itemCount = C360Plan.asDecimal(v.get('itemCount')) == null ? 0 : Integer.valueOf(C360Plan.asDecimal(v.get('itemCount')));
        Boolean allowNonPending = C360Plan.asBool(v.get('allowNonPending'));
        if (itemCount == 0) {
            throw new ToolException('The staged plan carries no covenant assessment. Re-stage the action.');
        }

        List<Id> targetIds = new List<Id>();
        List<Id> covenantIds = new List<Id>();
        for (Integer i = 0; i < itemCount; i++) {
            targetIds.add(C360Plan.asId(v.get('item' + i + '.targetId')));
            covenantIds.add(C360Plan.asId(v.get('item' + i + '.covenantId')));
        }

        // Resume precondition (A33.3.3): re-read every target before any resumed write.
        Map<Id, LLC_BI__Covenant_Compliance2__c> before = readCompliance(targetIds);
        Map<Id, String> covenantNames = readCovenantNames(covenantIds);
        Map<Id, Set<Id>> rowsBefore = readSiblingRows(covenantIds);

        List<ItemResult> results = new List<ItemResult>();
        List<LLC_BI__Covenant_Compliance2__c> toUpdate = new List<LLC_BI__Covenant_Compliance2__c>();
        List<Integer> updateIndex = new List<Integer>();

        for (Integer i = 0; i < itemCount; i++) {
            String n = String.valueOf(i);
            Id targetId = targetIds[i];
            Id covenantId = covenantIds[i];
            String status = C360Plan.asString(v.get('item' + n + '.LLC_BI__Status__c'));
            String stagedSource = C360Plan.asString(v.get('item' + n + '.sourceStatus'));

            ItemResult ir = new ItemResult();
            ir.covenantId = covenantId;
            ir.covenantComplianceId = targetId;
            ir.anchorName = covenantNames.get(covenantId);
            ir.status = status;
            ir.written = false;
            results.add(ir);

            LLC_BI__Covenant_Compliance2__c row = before.get(targetId);
            if (row == null) {
                skipItem(steps, n, 'The compliance record no longer exists or is no longer visible. Re-stage this covenant.');
                ir.outcome = 'Not written: the compliance record on ' + label(ir.anchorName, covenantId) + ' could not be re-read at execute time.';
                continue;
            }
            ir.recordName = row.Name;
            ir.sourceStatus = row.LLC_BI__Status__c;

            // The precondition that can change between stage and execute is the ROW status, so that
            // is what is re-read. The covenant's own Active flag was checked at stage time and is
            // asserted here rather than re-queried: a covenant deactivated in the interval would
            // still leave the row write correct, and the extra query buys nothing.
            C360Covenants.Resolved live = new C360Covenants.Resolved();
            live.covenantId = covenantId;
            live.covenantName = ir.anchorName;
            live.active = true;
            live.complianceId = row.Id;
            live.complianceStatus = row.LLC_BI__Status__c;
            if (!C360Covenants.applyPrecondition(live, allowNonPending)) {
                skipItem(steps, n, live.reason);
                ir.outcome = 'Not written: ' + live.reason;
                continue;
            }
            C360Plan.setState(steps, 'find_compliance_' + n, C360Plan.STATE_VERIFIED,
                row.LLC_BI__Status__c == stagedSource
                    ? 'Compliance row re-read at ' + String.valueOf(row.LLC_BI__Status__c) + ', unchanged since staging.'
                    : 'Compliance row re-read at ' + String.valueOf(row.LLC_BI__Status__c) + ', which differs from the staged ' + String.valueOf(stagedSource) + '.');

            Decimal observed = C360Plan.asDecimal(v.get('item' + n + '.LLC_BI__Historic_Financial_Indicator__c'));
            String reason = C360Plan.asString(v.get('item' + n + '.LLC_BI__Reason_for_Exception__c'));

            Map<String, Object> writeFields = new Map<String, Object>{
                'LLC_BI__Status__c' => status,
                'Agentic_AI_Response__c' => C360Plan.asString(v.get('item' + n + '.Agentic_AI_Response__c')),
                'LLC_BI__Comments__c' => C360Plan.asString(v.get('item' + n + '.LLC_BI__Comments__c')),
                'LLC_BI__Historic_Financial_Indicator__c' => observed
            };
            if (String.isNotBlank(reason)) {
                writeFields.put('LLC_BI__Reason_for_Exception__c', reason);
            }
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT_COMPLIANCE, C360WriteGuard.OP_UPDATE, writeFields);

            LLC_BI__Covenant_Compliance2__c pending = new LLC_BI__Covenant_Compliance2__c(
                Id = targetId,
                LLC_BI__Status__c = status,
                Agentic_AI_Response__c = (String) writeFields.get('Agentic_AI_Response__c'),
                LLC_BI__Comments__c = (String) writeFields.get('LLC_BI__Comments__c'),
                LLC_BI__Historic_Financial_Indicator__c = observed,
                cm_Covenant_Compliance_Indicator_Value__c = observed == null ? null : String.valueOf(observed),
                LLC_BI__Evaluation_Date__c = Date.today(),
                LLC_BI__Evaluated_By__c = UserInfo.getUserId()
            );
            if (String.isNotBlank(reason)) {
                pending.LLC_BI__Reason_for_Exception__c = reason;
                pending.LLC_BI__Exception_Date__c = Date.today();
            }
            toUpdate.add(pending);
            updateIndex.add(i);
        }

        if (toUpdate.isEmpty()) {
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException(
                'No covenant in this plan could be written at execute time. Every target either moved since staging or is no longer Pending. Re-stage the action.'
            );
        }

        // allOrNone false: one covenant the org refuses must not discard the rest of the batch.
        List<Database.SaveResult> saves = Database.update(toUpdate, false, AccessLevel.USER_MODE);
        for (Integer k = 0; k < saves.size(); k++) {
            Integer i = updateIndex[k];
            String n = String.valueOf(i);
            ItemResult ir = results[i];
            if (saves[k].isSuccess()) {
                ir.written = true;
                C360Plan.setState(steps, 'write_assessment_' + n, C360Plan.STATE_VERIFIED, 'Assessment narrative and observed value written.');
                C360Plan.setState(steps, 'write_status_' + n, C360Plan.STATE_VERIFIED, 'Status set to ' + ir.status + ' from ' + String.valueOf(ir.sourceStatus) + '.');
            } else {
                C360Plan.setState(steps, 'write_assessment_' + n, C360Plan.STATE_FAILED, orgErrors(saves[k]));
                C360Plan.setState(steps, 'write_status_' + n, C360Plan.STATE_SKIPPED, 'Not attempted: the assessment write was refused.');
                C360Plan.setState(steps, 'verify_' + n, C360Plan.STATE_SKIPPED, 'Not attempted: the assessment write was refused.');
                C360Plan.setState(steps, 'observe_generation_' + n, C360Plan.STATE_SKIPPED, 'Not attempted: nothing was written.');
                ir.outcome = 'Not written: the org refused the update on ' + label(ir.anchorName, covenantIds[i]) + '. ' + orgErrors(saves[k]);
            }
        }

        Map<Id, LLC_BI__Covenant_Compliance2__c> after = readCompliance(targetIds);
        Map<Id, Set<Id>> rowsAfter = readSiblingRows(covenantIds);
        Boolean anyGenerated = false;
        Integer written = 0;

        for (Integer k = 0; k < updateIndex.size(); k++) {
            Integer i = updateIndex[k];
            String n = String.valueOf(i);
            ItemResult ir = results[i];
            if (ir.written != true) {
                continue;
            }
            written++;

            LLC_BI__Covenant_Compliance2__c back = after.get(targetIds[i]);
            if (back == null) {
                C360Plan.setState(steps, 'verify_' + n, C360Plan.STATE_FILED_UNVERIFIED, 'The update returned success but the record could not be read back.');
            } else {
                ir.status = back.LLC_BI__Status__c;
                ir.recordName = back.Name;
                C360Plan.setState(steps, 'verify_' + n, C360Plan.STATE_VERIFIED,
                    'Compliance record reads back at ' + String.valueOf(back.LLC_BI__Status__c) +
                    (back.LLC_BI__Historic_Financial_Indicator__c == null
                        ? ', with no observed value recorded.'
                        : ', observed value ' + String.valueOf(back.LLC_BI__Historic_Financial_Indicator__c) + '.'));
            }

            Id covenantId = covenantIds[i];
            Set<Id> now = rowsAfter.containsKey(covenantId) ? rowsAfter.get(covenantId) : new Set<Id>();
            Set<Id> was = rowsBefore.containsKey(covenantId) ? rowsBefore.get(covenantId) : new Set<Id>();
            Set<Id> minted = new Set<Id>(now);
            minted.removeAll(was);
            ir.nextComplianceRowCreated = !minted.isEmpty();
            anyGenerated = anyGenerated || !minted.isEmpty();
            if (!minted.isEmpty()) {
                ir.nextComplianceRowId = new List<Id>(minted)[0];
                C360Plan.setState(steps, 'observe_generation_' + n, C360Plan.STATE_VERIFIED,
                    'nCino created compliance record ' + ir.nextComplianceRowId + ' on this covenant in the same transaction. That create is what raises the bank\'s covenant approval work item.');
                ir.outcome = 'Assessment recorded as ' + String.valueOf(ir.status) + ' on ' + label(ir.anchorName, covenantId) +
                    '. nCino minted the next compliance record, ' + ir.nextComplianceRowId + ', which raises the bank\'s covenant approval.';
            } else {
                C360Plan.setState(steps, 'observe_generation_' + n, C360Plan.STATE_VERIFIED,
                    'No successor compliance record appeared on this covenant inside this transaction. A row created asynchronously would not be visible here.');
                ir.outcome = 'Assessment recorded as ' + String.valueOf(ir.status) + ' on ' + label(ir.anchorName, covenantId) +
                    '. No successor compliance record was observed in this transaction' +
                    (ir.sourceStatus == C360Covenants.SOURCE_PENDING ? '.' : ', and the schedule did not advance because the row was not Pending.');
            }
        }

        String terminal = C360Plan.terminalState(steps);
        Id firstWritten = null;
        for (ItemResult ir : results) {
            if (ir.written == true) {
                firstWritten = ir.covenantComplianceId;
                break;
            }
        }
        C360ActionStaging.recordOutcome(stg, steps, terminal, firstWritten);

        ExecuteResult r = new ExecuteResult();
        r.stagingId = stg.Id;
        r.items = results;
        r.itemCount = results.size();
        r.writtenCount = written;
        r.approvalChainStarted = anyGenerated;
        r.terminalState = terminal;
        r.replayed = false;
        r.steps = toWireSteps(steps);
        for (ItemResult ir : results) {
            if (ir.written == true) {
                r.covenantComplianceId = ir.covenantComplianceId;
                r.recordName = ir.recordName;
                r.anchorName = ir.anchorName;
                r.status = ir.status;
                break;
            }
        }
        r.outcome = results.size() == 1
            ? results[0].outcome
            : String.valueOf(written) + ' of ' + results.size() + ' covenant assessments recorded. ' +
              (anyGenerated
                  ? 'nCino minted at least one successor compliance record, which raises the bank\'s covenant approval. See each item.'
                  : 'No successor compliance record was observed in this transaction. See each item for its own result.');
        return r;
    }

    /** Marks every step of one item as not attempted, with the reason on the first. */
    private static void skipItem(List<C360Plan.Step> steps, String n, String detail) {
        C360Plan.setState(steps, 'find_compliance_' + n, C360Plan.STATE_FAILED, detail);
        C360Plan.setState(steps, 'write_assessment_' + n, C360Plan.STATE_SKIPPED, 'Not attempted: the precondition on this covenant did not hold.');
        C360Plan.setState(steps, 'write_status_' + n, C360Plan.STATE_SKIPPED, 'Not attempted: the precondition on this covenant did not hold.');
        C360Plan.setState(steps, 'verify_' + n, C360Plan.STATE_SKIPPED, 'Not attempted: nothing was written.');
        C360Plan.setState(steps, 'observe_generation_' + n, C360Plan.STATE_SKIPPED, 'Not attempted: nothing was written.');
    }

    private static Map<Id, LLC_BI__Covenant_Compliance2__c> readCompliance(List<Id> ids) {
        return new Map<Id, LLC_BI__Covenant_Compliance2__c>([
            SELECT Id, Name, LLC_BI__Status__c, LLC_BI__Covenant__c, LLC_BI__Historic_Financial_Indicator__c,
                   LLC_BI__Reason_for_Exception__c, Agentic_AI_Response__c
            FROM LLC_BI__Covenant_Compliance2__c
            WHERE Id IN :ids
            WITH USER_MODE
        ]);
    }

    private static Map<Id, String> readCovenantNames(List<Id> ids) {
        Map<Id, String> out = new Map<Id, String>();
        for (LLC_BI__Covenant2__c c : [SELECT Id, Name FROM LLC_BI__Covenant2__c WHERE Id IN :ids WITH USER_MODE]) {
            out.put(c.Id, c.Name);
        }
        return out;
    }

    /** Every compliance row id per covenant, so a successor minted by the platform is detectable. */
    private static Map<Id, Set<Id>> readSiblingRows(List<Id> covenantIds) {
        Map<Id, Set<Id>> out = new Map<Id, Set<Id>>();
        for (LLC_BI__Covenant_Compliance2__c cc : [
            SELECT Id, LLC_BI__Covenant__c FROM LLC_BI__Covenant_Compliance2__c
            WHERE LLC_BI__Covenant__c IN :covenantIds WITH USER_MODE
        ]) {
            if (!out.containsKey(cc.LLC_BI__Covenant__c)) {
                out.put(cc.LLC_BI__Covenant__c, new Set<Id>());
            }
            out.get(cc.LLC_BI__Covenant__c).add(cc.Id);
        }
        return out;
    }

    private static String label(String name, Id fallback) {
        return String.isBlank(name) ? String.valueOf(fallback) : name;
    }

    private static String orgErrors(Database.SaveResult sr) {
        List<String> parts = new List<String>();
        for (Database.Error e : sr.getErrors()) {
            parts.add(e.getStatusCode() + ': ' + e.getMessage());
        }
        return String.join(parts, ' | ');
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.stagingId = prior.Id;
        r.covenantComplianceId = prior.cm_Result_Record_Id__c;
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.approvalChainStarted = null;
        r.items = new List<ItemResult>();
        r.outcome = 'This idempotency key already assessed compliance record ' + prior.cm_Result_Record_Id__c +
            ' and its siblings in the same plan. Nothing was written, and whether a successor row was minted is the first run\'s answer, not this one\'s.';
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
