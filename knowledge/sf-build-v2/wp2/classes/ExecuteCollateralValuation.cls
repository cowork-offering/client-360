/**
 * ExecuteCollateralValuation - MCP tool: execute_collateral_valuation.
 *
 * Runs the plan stage_collateral_valuation staged, behind the token gate. The token is evidence
 * that a named human saw a specific plan and pressed confirm (A33.5.4). It is not a credit
 * approval and this tool writes no state the bank's own process is supposed to mint.
 *
 * The rollup verification is the honest part of this action. A33.4.5(d) leaves it unsettled
 * whether inserting a valuation moves LLC_BI__Collateral__c, so the plan re-reads the collateral
 * and the result says which happened. A valuation that filed against a collateral that did not
 * move is reported as exactly that, never as a coverage improvement.
 *
 * Org contract: A33.4.5. Allowlist: A33.3.1 (create only, no updates, no deletes, no
 * sub-collateral). Write evidence: PROBE-LEDGER.md probe 1.
 */
global with sharing class ExecuteCollateralValuation {

    /** Raised for a domain-level failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    global class Request {
        @InvocableVariable(label='Idempotency Key' description='The same key the stage call used. Enforced by us: a replay reports the prior result and writes nothing.' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Staging Id' required=true)
        global String stagingId;
        @InvocableVariable(label='Plan Hash' description='Binds execution to the exact plan the banker confirmed. A mismatch is refused.' required=true)
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
        @InvocableVariable(label='State' description='pending, verified, filed_unverified, failed or skipped_not_attempted.')
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

    global class ItemResult {
        @InvocableVariable(label='Collateral Id')
        global String collateralId;
        @InvocableVariable(label='Valuation Id')
        global String valuationId;
        @InvocableVariable(label='Record Name' description='Org-assigned valuation name for this item, for example CV-0000000004.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='The parent collateral name for this item, for example COL-000758.')
        global String anchorName;
        @InvocableVariable(label='Collateral Value Moved')
        global Boolean collateralValueMoved;
        @InvocableVariable(label='Outcome' description='Per-item result in banker language, including the honest rollup answer.')
        global String outcome;
    }

    global class ExecuteResult {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Valuation Id')
        global String valuationId;
        @InvocableVariable(label='Record Name' description='The org-assigned name of the created record, for example CV-0000000002. Uniform across all execute_* tools so the activity trail can stamp a real label instead of a generic one.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='Display name of the parent the record hangs off, for example collateral COL-000758.')
        global String anchorName;
        @InvocableVariable(label='Terminal State' description='success, partial or failed.')
        global String terminalState;
        @InvocableVariable(label='Steps')
        global List<StepResult> steps;
        @InvocableVariable(label='Outcome' description='Banker-language result. States plainly when the collateral value did not move.')
        global String outcome;
        @InvocableVariable(label='Collateral Value Moved')
        global Boolean collateralValueMoved;
        @InvocableVariable(label='Items' description='One entry per valuation in the batch, each with its own id, name, anchor and rollup answer.')
        global List<ItemResult> items;
        @InvocableVariable(label='Item Count')
        global Integer itemCount;
        @InvocableVariable(label='Replayed' description='True when this idempotency key had already produced a record. Nothing was written.')
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
     * Executes a staged collateral valuation.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_collateral_valuation'
        description='Execute a plan staged by stage_collateral_valuation, behind the single-use decision token. Creates one LLC_BI__Collateral_Valuation__c record, verifies it landed, and re-reads the parent collateral to report honestly whether the value rolled up.'
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
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, 'write_valuation', false, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused the valuation write.', e.getMessage(), 'write_valuation', true, req.idempotencyKey);
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
        Integer itemCount = C360Plan.asDecimal(v.get('itemCount')) == null ? 1 : Integer.valueOf(C360Plan.asDecimal(v.get('itemCount')));

        // Resume precondition (A33.3.3): re-read every target before any write, so a resumed run
        // never writes against org state that moved since staging.
        Map<Id, LLC_BI__Collateral__c> before = new Map<Id, LLC_BI__Collateral__c>();
        List<Id> orderedCollateral = new List<Id>();
        for (Integer i = 0; i < itemCount; i++) {
            Id cid = C360Plan.asId(v.get('item' + i + '.LLC_BI__Collateral__c'));
            orderedCollateral.add(cid);
        }
        for (LLC_BI__Collateral__c c : [
            SELECT Id, Name, LLC_BI__Value__c, LLC_BI__Lendable_Value__c
            FROM LLC_BI__Collateral__c WHERE Id IN :orderedCollateral WITH USER_MODE
        ]) {
            before.put(c.Id, c);
        }
        for (Id cid : orderedCollateral) {
            if (!before.containsKey(cid)) {
                C360Plan.markRefused(steps, 'Collateral ' + cid + ' no longer exists or is no longer visible. Re-stage the action.');
                C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
                throw new ToolException('A collateral this plan targets could not be re-read at execute time. Re-stage the action.');
            }
        }

        // Build every valuation, guard each, then insert as one batch so a bulk file is one DML.
        List<LLC_BI__Collateral_Valuation__c> toInsert = new List<LLC_BI__Collateral_Valuation__c>();
        for (Integer i = 0; i < itemCount; i++) {
            String n = String.valueOf(i);
            Map<String, Object> writeFields = new Map<String, Object>{
                'LLC_BI__Collateral__c' => orderedCollateral[i],
                'LLC_BI__Value__c' => C360Plan.asDecimal(v.get('item' + n + '.LLC_BI__Value__c')),
                'LLC_BI__Primary__c' => C360Plan.asBool(v.get('item' + n + '.LLC_BI__Primary__c')),
                'LLC_BI__Active__c' => true,
                'LLC_BI__Original_Value__c' => false
            };
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_VALUATION, C360WriteGuard.OP_CREATE, writeFields);

            LLC_BI__Collateral_Valuation__c record = new LLC_BI__Collateral_Valuation__c(
                LLC_BI__Collateral__c = orderedCollateral[i],
                LLC_BI__Value__c = (Decimal) writeFields.get('LLC_BI__Value__c'),
                LLC_BI__Valuation_Date__c = C360Plan.asDate(v.get('item' + n + '.LLC_BI__Valuation_Date__c')),
                LLC_BI__Type__c = C360Plan.asString(v.get('item' + n + '.LLC_BI__Type__c')),
                LLC_BI__Source__c = C360Plan.asString(v.get('item' + n + '.LLC_BI__Source__c')),
                LLC_BI__Valuation_Description__c = C360Plan.asString(v.get('item' + n + '.LLC_BI__Valuation_Description__c')),
                LLC_BI__Primary__c = (Boolean) writeFields.get('LLC_BI__Primary__c'),
                LLC_BI__Active__c = true,
                LLC_BI__Original_Value__c = false
            );
            toInsert.add((LLC_BI__Collateral_Valuation__c) C360WriteGuard.stripAndVerify(
                record,
                new Set<String>{ 'LLC_BI__Collateral__c', 'LLC_BI__Value__c', 'LLC_BI__Active__c', 'LLC_BI__Primary__c', 'LLC_BI__Original_Value__c' }
            ));
        }
        insert as user toInsert;

        Set<Id> newIds = new Set<Id>();
        for (LLC_BI__Collateral_Valuation__c row : toInsert) {
            newIds.add(row.Id);
        }
        Map<Id, LLC_BI__Collateral_Valuation__c> filed = new Map<Id, LLC_BI__Collateral_Valuation__c>([
            SELECT Id, Name, LLC_BI__Value__c FROM LLC_BI__Collateral_Valuation__c WHERE Id IN :newIds WITH USER_MODE
        ]);
        Map<Id, LLC_BI__Collateral__c> after = new Map<Id, LLC_BI__Collateral__c>([
            SELECT Id, Name, LLC_BI__Value__c, LLC_BI__Lendable_Value__c
            FROM LLC_BI__Collateral__c WHERE Id IN :orderedCollateral WITH USER_MODE
        ]);

        List<ItemResult> results = new List<ItemResult>();
        Boolean anyMoved = false;
        for (Integer i = 0; i < itemCount; i++) {
            String n = String.valueOf(i);
            LLC_BI__Collateral_Valuation__c row = toInsert[i];
            Id cid = orderedCollateral[i];
            LLC_BI__Collateral__c coll = before.get(cid);

            C360Plan.setState(steps, 'write_valuation_' + n, C360Plan.STATE_VERIFIED, 'Valuation ' + row.Id + ' inserted.');

            LLC_BI__Collateral_Valuation__c back = filed.get(row.Id);
            C360Plan.setState(
                steps,
                'verify_valuation_' + n,
                back == null ? C360Plan.STATE_FILED_UNVERIFIED : C360Plan.STATE_VERIFIED,
                back == null
                    ? 'The insert returned success but the record could not be read back.'
                    : 'Valuation reads back at ' + String.valueOf(back.LLC_BI__Value__c) + '.'
            );

            Decimal valueAfter = after.containsKey(cid) ? after.get(cid).LLC_BI__Value__c : null;
            Boolean moved = valueAfter != coll.LLC_BI__Value__c;
            anyMoved = anyMoved || moved;
            C360Plan.setState(
                steps,
                'verify_rollup_' + n,
                C360Plan.STATE_VERIFIED,
                moved
                    ? 'Collateral value moved from ' + String.valueOf(coll.LLC_BI__Value__c) + ' to ' + String.valueOf(valueAfter) + '.'
                    : 'Collateral value unchanged at ' + String.valueOf(coll.LLC_BI__Value__c) + '. The rollup did not fire.'
            );

            ItemResult ir = new ItemResult();
            ir.collateralId = cid;
            ir.valuationId = row.Id;
            ir.recordName = back == null ? null : back.Name;
            ir.anchorName = coll.Name;
            ir.collateralValueMoved = moved;
            ir.outcome = moved
                ? 'Valuation filed against ' + coll.Name + ' and the collateral value moved to ' + String.valueOf(valueAfter) + '.'
                : 'Valuation filed against ' + coll.Name + ', collateral value unchanged. No coverage improvement is claimed.';
            results.add(ir);
        }

        String terminal = C360Plan.terminalState(steps);
        C360ActionStaging.recordOutcome(stg, steps, terminal, toInsert[0].Id);

        ExecuteResult r = new ExecuteResult();
        r.stagingId = stg.Id;
        r.valuationId = toInsert[0].Id;
        r.recordName = results[0].recordName;
        r.anchorName = results[0].anchorName;
        r.collateralValueMoved = anyMoved;
        r.items = results;
        r.itemCount = results.size();
        r.terminalState = terminal;
        r.replayed = false;
        r.steps = toWireSteps(steps);
        r.outcome = results.size() == 1
            ? results[0].outcome
            : String.valueOf(results.size()) + ' valuations filed. No collateral value moved: nCino binds that update to the Add Valuation button, so no coverage improvement is claimed for any of them.';
        if (results.size() > 1 && anyMoved) {
            r.outcome = String.valueOf(results.size()) + ' valuations filed. See each item for whether its collateral value moved.';
        }
        return r;
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.stagingId = prior.Id;
        r.valuationId = prior.cm_Result_Record_Id__c;
        r.recordName = nameOf(prior.cm_Result_Record_Id__c);
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.collateralValueMoved = null;
        r.outcome = 'This idempotency key already produced valuation ' + prior.cm_Result_Record_Id__c + '. Nothing was written.';
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
        List<LLC_BI__Collateral_Valuation__c> rows = [
            SELECT Id, Name FROM LLC_BI__Collateral_Valuation__c WHERE Id = :recordId WITH USER_MODE LIMIT 1
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
