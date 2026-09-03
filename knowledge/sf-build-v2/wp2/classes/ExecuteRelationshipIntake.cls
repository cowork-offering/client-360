/**
 * ExecuteRelationshipIntake - MCP tool: execute_relationship_intake.
 *
 * Runs the plan stage_relationship_intake staged, behind the token gate. The token is evidence
 * that a named human saw a specific plan and pressed confirm (A33.5.4). It is not a credit
 * approval, and nothing this tool writes is a credit decision: it files what the relationship
 * holds, on the relationship, and stops.
 *
 * FIVE INSERTS, IN THIS ORDER, AND THE ORDER IS THE MODEL'S. Covenants, then the relationship
 * junctions that anchor them on the borrower; assets, then the ownership junctions that anchor
 * THEM, then the opening valuations. `LLC_BI__Collateral__c` carries no account lookup of any kind
 * on this org, so an asset without its `LLC_BI__Account_Collateral__c` row belongs to nobody and
 * cannot be found from the relationship at all. One DML per object rather than one per record:
 * each insert on a change-data-captured object flushes one EventBridgeCallout queueable PER
 * RECORD, so what a plan has to budget is records, and what it can control is the number of DMLs.
 *
 * WHAT IS NOT WRITTEN, AND IS PROVEN NOT TO BE. No `LLC_BI__Loan_Covenant__c` beside a covenant
 * and no `LLC_BI__Loan_Collateral2__c` beside an asset: relationship intake reaches no facility.
 * Both are refused by the per-tool fence in C360WriteGuard rather than by the absence of a code
 * path, and both absences are VERIFIED by re-query after the writes land, so the plan reports a
 * fact instead of a promise. A compliance row is refused on every tool in this package and is
 * refused here too: creating one is what starts the bank's covenant approval chain.
 *
 * The verification is the re-read, never the insert result. Every id this tool returns was read
 * back out of the org after the transaction wrote it.
 *
 * Org contract: A33.4.5 for the valuation, the create-then-own block of ExecuteLoanModification
 * for the asset chain, research covenant-testing-20260902 section 3 for the two covenant levels.
 */
global with sharing class ExecuteRelationshipIntake {

    /** Raised for a domain-level failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    global class Request {
        @InvocableVariable(label='Idempotency Key' description='The same key the stage call used. Enforced by us: a replay reports the prior result and writes nothing.' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Plan Id' description='The handle stage_relationship_intake returned.' required=true)
        global String planId;
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
        @InvocableVariable(label='Detail' description='What actually happened, including the ids created by this step.')
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

    global class CovenantResult {
        @InvocableVariable(label='Covenant Id')
        global String covenantId;
        @InvocableVariable(label='Covenant Name' description='The org-assigned name, for example COV-000646.')
        global String covenantName;
        @InvocableVariable(label='Covenant Type Name')
        global String covenantTypeName;
        @InvocableVariable(label='Relationship Junction Id' description='The LLC_BI__Account_Covenant__c row anchoring this covenant on the borrower.')
        global String relationshipJunctionId;
        @InvocableVariable(label='Create Step Id')
        global String createStepId;
        @InvocableVariable(label='Verify Step Id')
        global String verifyStepId;
        @InvocableVariable(label='Outcome')
        global String outcome;
    }

    global class CollateralResult {
        @InvocableVariable(label='Collateral Id')
        global String collateralId;
        @InvocableVariable(label='Collateral Name' description='The org-assigned autonumber, for example COL-000762.')
        global String collateralName;
        @InvocableVariable(label='Description')
        global String description;
        @InvocableVariable(label='Ownership Junction Id' description='The LLC_BI__Account_Collateral__c row tying this asset to its owner.')
        global String ownershipJunctionId;
        @InvocableVariable(label='Valuation Id' description='Null when no basis, source or date was supplied and the plan therefore filed no valuation.')
        global String valuationId;
        @InvocableVariable(label='Valuation Name')
        global String valuationName;
        @InvocableVariable(label='Lendable Value' description='The org\'s own figure, computed from the collateral type\'s advance rate. Read back, never written.')
        global Decimal lendableValue;
        @InvocableVariable(label='Create Step Id')
        global String createStepId;
        @InvocableVariable(label='Verify Step Id')
        global String verifyStepId;
        @InvocableVariable(label='Outcome')
        global String outcome;
    }

    global class ExecuteResult {
        @InvocableVariable(label='Plan Id')
        global String planId;
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Record Name' description='The org-assigned name of the first record created, for example COV-000652. Uniform across all execute_* tools so the activity trail can stamp a real label instead of a generic one.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='Display name of the relationship every record hangs off.')
        global String anchorName;
        @InvocableVariable(label='Terminal State' description='success, partial or failed.')
        global String terminalState;
        @InvocableVariable(label='Steps')
        global List<StepResult> steps;
        @InvocableVariable(label='Covenants' description='One entry per covenant filed, with its id, its relationship junction and its step ids.')
        global List<CovenantResult> covenants;
        @InvocableVariable(label='Collateral' description='One entry per asset filed, with its id, its ownership junction, its valuation and its step ids.')
        global List<CollateralResult> collateral;
        @InvocableVariable(label='Covenant Count')
        global Integer covenantCount;
        @InvocableVariable(label='Collateral Count')
        global Integer collateralCount;
        @InvocableVariable(label='Outcome' description='Banker-language result. States plainly that nothing reached a facility.')
        global String outcome;
        @InvocableVariable(label='Replayed' description='True when this idempotency key had already produced records. Nothing was written.')
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
     * Executes a staged relationship intake.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_relationship_intake'
        description='Execute a plan staged by stage_relationship_intake, behind the single-use decision token. Creates the covenants on the borrower with their relationship junctions, the assets with their ownership junctions and any opening valuations, then proves every row by re-query, including proving that NO loan junction and NO pledge were written. Files no compliance row, opens no credit action and touches no facility.'
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
                res.error = err('VALIDATION_FAILED', e.getMessage(), null, false, req.idempotencyKey);
            } catch (C360ActionStaging.StagingException e) {
                res.ok = false;
                res.error = err('TOKEN_REFUSED', e.getMessage(), null, false, req.idempotencyKey);
            } catch (C360WriteGuard.GuardException e) {
                res.ok = false;
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, false, req.idempotencyKey);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused one of the intake writes, and the whole plan was rolled back.', e.getMessage(), true, req.idempotencyKey);
            } catch (QueryException e) {
                res.ok = false;
                res.error = err('READ_FAILED', 'A record this plan depends on could not be read.', e.getMessage(), true, req.idempotencyKey);
            }
            out.add(res);
        }
        return out;
    }

    private static ExecuteResult execute(Request req) {
        if (String.isBlank(req.idempotencyKey)) {
            throw new ToolException('idempotencyKey is required and must match the key used at stage time.');
        }
        if (String.isBlank(req.planId)) {
            throw new ToolException('planId is required. It is the handle stage_relationship_intake returned.');
        }
        if (String.isBlank(req.planHash)) {
            throw new ToolException('planHash is required.');
        }

        cm_Action_Staging__c prior = C360ActionStaging.findCompleted(req.idempotencyKey);
        if (prior != null) {
            return replay(prior);
        }

        cm_Action_Staging__c stg = C360ActionStaging.claimForExecute(
            req.planId, req.planHash, req.decisionToken, C360Plan.asId(req.approverUserId)
        );

        List<C360Plan.Step> steps = C360Plan.deserializeSteps(stg.cm_Plan_JSON__c);
        Map<String, Object> v = C360Plan.deserializeValues(stg.cm_Plan_JSON__c);
        Integer covenantCount = countOf(v.get('covenantCount'));
        Integer collateralCount = countOf(v.get('collateralCount'));
        Id accountId = C360Plan.asId(v.get('accountId'));

        // Resume precondition (A33.3.3): re-read the anchor before any write, so a resumed run
        // never files against a relationship that moved since staging.
        List<Account> anchors = [SELECT Id, Name FROM Account WHERE Id = :accountId WITH USER_MODE LIMIT 1];
        if (anchors.isEmpty()) {
            C360Plan.markRefused(steps, 'Account ' + accountId + ' no longer exists or is no longer visible. Re-stage the action.');
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException('The relationship this plan targets could not be re-read at execute time. Nothing was written. Re-stage the action.');
        }
        Account borrower = anchors[0];

        List<CovenantResult> covenants = writeCovenants(v, covenantCount, accountId);
        List<CollateralResult> collateral = writeCollateral(v, collateralCount, accountId);

        verifyCovenants(steps, covenants);
        verifyCollateral(steps, collateral);

        String terminal = C360Plan.terminalState(steps);
        String firstId = covenants.isEmpty()
            ? (collateral.isEmpty() ? null : collateral[0].collateralId)
            : covenants[0].covenantId;
        C360ActionStaging.recordOutcome(stg, steps, terminal, firstId);

        ExecuteResult r = new ExecuteResult();
        r.planId = stg.Id;
        r.accountId = accountId;
        r.anchorName = borrower.Name;
        r.recordName = covenants.isEmpty()
            ? (collateral.isEmpty() ? null : collateral[0].collateralName)
            : covenants[0].covenantName;
        r.terminalState = terminal;
        r.steps = toWireSteps(steps);
        r.covenants = covenants;
        r.collateral = collateral;
        r.covenantCount = covenants.size();
        r.collateralCount = collateral.size();
        r.replayed = false;
        r.outcome = outcomeLine(borrower, covenants, collateral);
        return r;
    }

    /* ------------------------------------------------------------------ covenants */

    /**
     * Files the covenants and their relationship junctions: two DMLs for the whole list.
     *
     * The birth state is not a choice made here. A net-new covenant is Pending (not yet evaluated)
     * and Active, and C360WriteGuard refuses any other pair on create, because a covenant born in
     * a decided status is compliance history nobody produced.
     */
    private static List<CovenantResult> writeCovenants(
        Map<String, Object> v,
        Integer covenantCount,
        Id accountId
    ) {
        List<CovenantResult> results = new List<CovenantResult>();
        if (covenantCount == 0) {
            return results;
        }

        List<LLC_BI__Covenant2__c> rows = new List<LLC_BI__Covenant2__c>();
        for (Integer i = 0; i < covenantCount; i++) {
            String n = String.valueOf(i);
            CovenantResult cr = new CovenantResult();
            cr.covenantTypeName = C360Plan.asString(v.get('cov' + n + '.typeName'));
            cr.createStepId = 'covenant_create_' + n;
            cr.verifyStepId = 'covenant_verify_' + n;
            results.add(cr);

            String symbol = C360Plan.asString(v.get('cov' + n + '.operator'));
            Decimal threshold = C360Plan.asDecimal(v.get('cov' + n + '.threshold'));
            Map<String, Object> fields = new Map<String, Object>{
                'LLC_BI__Account__c' => accountId,
                'LLC_BI__Covenant_Type__c' => C360Plan.asId(v.get('cov' + n + '.typeId')),
                'LLC_BI__Financial_Indicator_Value__c' => threshold,
                'Acnpex_Threshold_Value__c' => threshold,
                'Acnpex_Operator__c' => symbol,
                'Financial_Indicator_Operator__c' => StageRelationshipIntake.FI_OPERATOR.get(symbol),
                'LLC_BI__Frequency__c' => C360Plan.asString(v.get('cov' + n + '.frequency')),
                'LLC_BI__Effective_Date__c' => C360Plan.asDate(v.get('cov' + n + '.effectiveDate')),
                'LLC_BI__Next_Evaluation_Date__c' => C360Plan.asDate(v.get('cov' + n + '.nextEvaluationDate')),
                'LLC_BI__Notes__c' => C360Plan.asString(v.get('cov' + n + '.notes')),
                'LLC_BI__Covenant_Status__c' => 'Pending',
                'LLC_BI__Active__c' => 'true'
            };
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_COVENANT, C360WriteGuard.OP_CREATE, fields
            );

            LLC_BI__Covenant2__c record = new LLC_BI__Covenant2__c(
                LLC_BI__Account__c = accountId,
                LLC_BI__Covenant_Type__c = (Id) fields.get('LLC_BI__Covenant_Type__c'),
                LLC_BI__Financial_Indicator_Value__c = threshold,
                Acnpex_Threshold_Value__c = threshold,
                Acnpex_Operator__c = symbol,
                Financial_Indicator_Operator__c = StageRelationshipIntake.FI_OPERATOR.get(symbol),
                LLC_BI__Frequency__c = (String) fields.get('LLC_BI__Frequency__c'),
                LLC_BI__Effective_Date__c = (Date) fields.get('LLC_BI__Effective_Date__c'),
                LLC_BI__Next_Evaluation_Date__c = (Date) fields.get('LLC_BI__Next_Evaluation_Date__c'),
                LLC_BI__Notes__c = (String) fields.get('LLC_BI__Notes__c'),
                LLC_BI__Covenant_Status__c = 'Pending',
                LLC_BI__Active__c = true
            );
            rows.add((LLC_BI__Covenant2__c) C360WriteGuard.stripAndVerify(
                record,
                new Set<String>{
                    'LLC_BI__Account__c', 'LLC_BI__Covenant_Type__c', 'LLC_BI__Financial_Indicator_Value__c',
                    'Acnpex_Operator__c', 'LLC_BI__Covenant_Status__c', 'LLC_BI__Active__c'
                }
            ));
        }
        insert as user rows;

        List<LLC_BI__Account_Covenant__c> junctions = new List<LLC_BI__Account_Covenant__c>();
        for (LLC_BI__Covenant2__c row : rows) {
            Map<String, Object> fields = new Map<String, Object>{
                'LLC_BI__Covenant2__c' => row.Id,
                'LLC_BI__Account__c' => accountId
            };
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_ACCOUNT_COVENANT, C360WriteGuard.OP_CREATE, fields
            );
            junctions.add((LLC_BI__Account_Covenant__c) C360WriteGuard.stripAndVerify(
                new LLC_BI__Account_Covenant__c(LLC_BI__Covenant2__c = row.Id, LLC_BI__Account__c = accountId),
                new Set<String>{ 'LLC_BI__Covenant2__c', 'LLC_BI__Account__c' }
            ));
        }
        insert as user junctions;

        for (Integer i = 0; i < results.size(); i++) {
            results[i].covenantId = rows[i].Id;
            results[i].relationshipJunctionId = junctions[i].Id;
        }
        return results;
    }

    /**
     * Proves every covenant landed, carries exactly one relationship junction, and carries NO loan
     * junction. The last one is the assertion this arm exists for: relationship intake reaches no
     * facility, and an absence is only a fact once it has been read.
     */
    private static void verifyCovenants(List<C360Plan.Step> steps, List<CovenantResult> results) {
        if (results.isEmpty()) {
            return;
        }
        Set<Id> ids = new Set<Id>();
        for (CovenantResult cr : results) {
            ids.add(cr.covenantId);
        }
        Map<Id, LLC_BI__Covenant2__c> back = new Map<Id, LLC_BI__Covenant2__c>([
            SELECT Id, Name, LLC_BI__Financial_Indicator_Value__c, LLC_BI__Covenant_Status__c, LLC_BI__Active__c
            FROM LLC_BI__Covenant2__c WHERE Id IN :ids WITH USER_MODE
        ]);
        Map<Id, Integer> anchored = new Map<Id, Integer>();
        for (LLC_BI__Account_Covenant__c j : [
            SELECT LLC_BI__Covenant2__c FROM LLC_BI__Account_Covenant__c WHERE LLC_BI__Covenant2__c IN :ids WITH USER_MODE
        ]) {
            Integer seen = anchored.containsKey(j.LLC_BI__Covenant2__c) ? anchored.get(j.LLC_BI__Covenant2__c) : 0;
            anchored.put(j.LLC_BI__Covenant2__c, seen + 1);
        }
        Set<Id> onALoan = new Set<Id>();
        for (LLC_BI__Loan_Covenant__c j : [
            SELECT LLC_BI__Covenant2__c FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Covenant2__c IN :ids WITH USER_MODE
        ]) {
            onALoan.add(j.LLC_BI__Covenant2__c);
        }

        for (CovenantResult cr : results) {
            LLC_BI__Covenant2__c row = back.get(cr.covenantId);
            Integer junctionCount = anchored.containsKey(cr.covenantId) ? anchored.get(cr.covenantId) : 0;
            Boolean unattached = !onALoan.contains(cr.covenantId);
            cr.covenantName = row == null ? null : row.Name;

            C360Plan.setState(steps, cr.createStepId, C360Plan.STATE_VERIFIED,
                'Covenant ' + cr.covenantId + ' created, relationship junction ' + cr.relationshipJunctionId + ' created.');

            if (row == null) {
                cr.outcome = 'The covenant was inserted but could not be read back.';
                C360Plan.setState(steps, cr.verifyStepId, C360Plan.STATE_FILED_UNVERIFIED, cr.outcome);
                continue;
            }
            Boolean proven = junctionCount == 1 && unattached;
            cr.outcome = cr.covenantTypeName + ' filed as ' + row.Name + ' at ' +
                String.valueOf(row.LLC_BI__Financial_Indicator_Value__c) + ', status ' + row.LLC_BI__Covenant_Status__c +
                ', with ' + junctionCount + ' relationship junction and ' + (unattached ? 'no' : 'an unexpected') +
                ' loan junction. It is on the relationship, not on any facility.';
            C360Plan.setState(
                steps,
                cr.verifyStepId,
                proven ? C360Plan.STATE_VERIFIED : C360Plan.STATE_FILED_UNVERIFIED,
                cr.outcome
            );
        }
    }

    /* ----------------------------------------------------------------- collateral */

    /**
     * Files the assets, their ownership junctions, and any opening valuations: three DMLs for the
     * whole list, and the valuation DML is skipped entirely when no entry asked for one.
     */
    private static List<CollateralResult> writeCollateral(
        Map<String, Object> v,
        Integer collateralCount,
        Id accountId
    ) {
        List<CollateralResult> results = new List<CollateralResult>();
        if (collateralCount == 0) {
            return results;
        }

        List<LLC_BI__Collateral__c> assets = new List<LLC_BI__Collateral__c>();
        List<Id> ownerOf = new List<Id>();
        for (Integer i = 0; i < collateralCount; i++) {
            String n = String.valueOf(i);
            CollateralResult cr = new CollateralResult();
            cr.description = C360Plan.asString(v.get('col' + n + '.description'));
            cr.createStepId = 'collateral_create_' + n;
            cr.verifyStepId = 'collateral_verify_' + n;
            results.add(cr);

            Id owner = C360Plan.asId(v.get('col' + n + '.ownerAccountId'));
            ownerOf.add(owner == null ? accountId : owner);

            Map<String, Object> fields = new Map<String, Object>{
                'LLC_BI__Collateral_Type__c' => C360Plan.asId(v.get('col' + n + '.typeId')),
                'LLC_BI__Value__c' => C360Plan.asDecimal(v.get('col' + n + '.value')),
                'LLC_BI__Description__c' => cr.description,
                'LLC_BI__Street_Address__c' => C360Plan.asString(v.get('col' + n + '.street')),
                'LLC_BI__City__c' => C360Plan.asString(v.get('col' + n + '.city')),
                'LLC_BI__State__c' => C360Plan.asString(v.get('col' + n + '.state')),
                'LLC_BI__Zip_Code__c' => C360Plan.asString(v.get('col' + n + '.zip'))
            };
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_COLLATERAL, C360WriteGuard.OP_CREATE, fields
            );

            assets.add((LLC_BI__Collateral__c) C360WriteGuard.stripAndVerify(
                new LLC_BI__Collateral__c(
                    LLC_BI__Collateral_Type__c = (Id) fields.get('LLC_BI__Collateral_Type__c'),
                    LLC_BI__Value__c = (Decimal) fields.get('LLC_BI__Value__c'),
                    LLC_BI__Description__c = cr.description,
                    LLC_BI__Street_Address__c = (String) fields.get('LLC_BI__Street_Address__c'),
                    LLC_BI__City__c = (String) fields.get('LLC_BI__City__c'),
                    LLC_BI__State__c = (String) fields.get('LLC_BI__State__c'),
                    LLC_BI__Zip_Code__c = (String) fields.get('LLC_BI__Zip_Code__c')
                ),
                new Set<String>{ 'LLC_BI__Collateral_Type__c', 'LLC_BI__Value__c', 'LLC_BI__Description__c' }
            ));
        }
        insert as user assets;

        List<LLC_BI__Account_Collateral__c> ownerships = new List<LLC_BI__Account_Collateral__c>();
        for (Integer i = 0; i < assets.size(); i++) {
            Map<String, Object> fields = new Map<String, Object>{
                'LLC_BI__Account__c' => ownerOf[i],
                'LLC_BI__Collateral__c' => assets[i].Id,
                'LLC_BI__Ownership_Percentage__c' => 100,
                'LLC_BI__Primary_Owner__c' => true
            };
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_ACCOUNT_COLLATERAL, C360WriteGuard.OP_CREATE, fields
            );
            ownerships.add((LLC_BI__Account_Collateral__c) C360WriteGuard.stripAndVerify(
                new LLC_BI__Account_Collateral__c(
                    LLC_BI__Account__c = ownerOf[i],
                    LLC_BI__Collateral__c = assets[i].Id,
                    LLC_BI__Ownership_Percentage__c = 100,
                    LLC_BI__Primary_Owner__c = true
                ),
                new Set<String>{ 'LLC_BI__Account__c', 'LLC_BI__Collateral__c' }
            ));
        }
        insert as user ownerships;

        List<LLC_BI__Collateral_Valuation__c> valuations = new List<LLC_BI__Collateral_Valuation__c>();
        List<Integer> valuationOf = new List<Integer>();
        for (Integer i = 0; i < collateralCount; i++) {
            String n = String.valueOf(i);
            if (v.get('col' + n + '.filesValuation') != true) {
                continue;
            }
            // ORIGINAL VALUE IS TRUE HERE, and this is the one place in the package where it is.
            // execute_collateral_valuation writes false because a REVALUATION is by definition not
            // the original; this asset was created three lines ago and has never been valued, so
            // its first valuation IS the original value, which is exactly how the eight history
            // rows on Hartwell's assets carry the flag. Primary is true for the same reason: it is
            // the only valuation the asset has.
            Decimal value = C360Plan.asDecimal(v.get('col' + n + '.value'));
            Map<String, Object> fields = new Map<String, Object>{
                'LLC_BI__Collateral__c' => assets[i].Id,
                'LLC_BI__Value__c' => value,
                'LLC_BI__Valuation_Date__c' => C360Plan.asDate(v.get('col' + n + '.valuationDate')),
                'LLC_BI__Type__c' => C360Plan.asString(v.get('col' + n + '.valuationBasis')),
                'LLC_BI__Source__c' => C360Plan.asString(v.get('col' + n + '.valuationSource')),
                'LLC_BI__Valuation_Description__c' => C360Plan.asString(v.get('col' + n + '.description')),
                'LLC_BI__Active__c' => true,
                'LLC_BI__Primary__c' => true,
                'LLC_BI__Original_Value__c' => true
            };
            C360WriteGuard.assertAllowedForTool(
                StageRelationshipIntake.ACTION_ID, C360WriteGuard.OBJ_VALUATION, C360WriteGuard.OP_CREATE, fields
            );
            valuations.add((LLC_BI__Collateral_Valuation__c) C360WriteGuard.stripAndVerify(
                new LLC_BI__Collateral_Valuation__c(
                    LLC_BI__Collateral__c = assets[i].Id,
                    LLC_BI__Value__c = value,
                    LLC_BI__Valuation_Date__c = (Date) fields.get('LLC_BI__Valuation_Date__c'),
                    LLC_BI__Type__c = (String) fields.get('LLC_BI__Type__c'),
                    LLC_BI__Source__c = (String) fields.get('LLC_BI__Source__c'),
                    LLC_BI__Valuation_Description__c = (String) fields.get('LLC_BI__Valuation_Description__c'),
                    LLC_BI__Active__c = true,
                    LLC_BI__Primary__c = true,
                    LLC_BI__Original_Value__c = true
                ),
                new Set<String>{ 'LLC_BI__Collateral__c', 'LLC_BI__Value__c', 'LLC_BI__Active__c', 'LLC_BI__Primary__c', 'LLC_BI__Original_Value__c' }
            ));
            valuationOf.add(i);
        }
        if (!valuations.isEmpty()) {
            insert as user valuations;
        }

        for (Integer i = 0; i < results.size(); i++) {
            results[i].collateralId = assets[i].Id;
            results[i].ownershipJunctionId = ownerships[i].Id;
        }
        for (Integer k = 0; k < valuations.size(); k++) {
            results[valuationOf[k]].valuationId = valuations[k].Id;
        }
        return results;
    }

    /**
     * Proves every asset landed, carries exactly one ownership junction, carries its valuation
     * where one was asked for, and carries NO pledge. The lendable value is READ rather than
     * compared: it is a formula over the collateral type's advance rate, so it is the org's answer
     * and it is reported as the org's.
     */
    private static void verifyCollateral(List<C360Plan.Step> steps, List<CollateralResult> results) {
        if (results.isEmpty()) {
            return;
        }
        Set<Id> ids = new Set<Id>();
        Set<Id> valuationIds = new Set<Id>();
        for (CollateralResult cr : results) {
            ids.add(cr.collateralId);
            if (cr.valuationId != null) {
                valuationIds.add(cr.valuationId);
            }
        }
        Map<Id, LLC_BI__Collateral__c> back = new Map<Id, LLC_BI__Collateral__c>([
            SELECT Id, Name, LLC_BI__Value__c, LLC_BI__Lendable_Value__c
            FROM LLC_BI__Collateral__c WHERE Id IN :ids WITH USER_MODE
        ]);
        Map<Id, Integer> owned = new Map<Id, Integer>();
        for (LLC_BI__Account_Collateral__c j : [
            SELECT LLC_BI__Collateral__c FROM LLC_BI__Account_Collateral__c WHERE LLC_BI__Collateral__c IN :ids WITH USER_MODE
        ]) {
            Integer seen = owned.containsKey(j.LLC_BI__Collateral__c) ? owned.get(j.LLC_BI__Collateral__c) : 0;
            owned.put(j.LLC_BI__Collateral__c, seen + 1);
        }
        Set<Id> pledged = new Set<Id>();
        for (LLC_BI__Loan_Collateral2__c p : [
            SELECT LLC_BI__Collateral__c FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Collateral__c IN :ids WITH USER_MODE
        ]) {
            pledged.add(p.LLC_BI__Collateral__c);
        }
        Map<Id, LLC_BI__Collateral_Valuation__c> filed = valuationIds.isEmpty()
            ? new Map<Id, LLC_BI__Collateral_Valuation__c>()
            : new Map<Id, LLC_BI__Collateral_Valuation__c>([
                SELECT Id, Name, LLC_BI__Value__c FROM LLC_BI__Collateral_Valuation__c WHERE Id IN :valuationIds WITH USER_MODE
            ]);

        for (CollateralResult cr : results) {
            LLC_BI__Collateral__c row = back.get(cr.collateralId);
            Integer ownershipCount = owned.containsKey(cr.collateralId) ? owned.get(cr.collateralId) : 0;
            Boolean unpledged = !pledged.contains(cr.collateralId);
            cr.collateralName = row == null ? null : row.Name;
            cr.lendableValue = row == null ? null : row.LLC_BI__Lendable_Value__c;
            LLC_BI__Collateral_Valuation__c valuation = cr.valuationId == null ? null : filed.get(cr.valuationId);
            cr.valuationName = valuation == null ? null : valuation.Name;

            C360Plan.setState(steps, cr.createStepId, C360Plan.STATE_VERIFIED,
                'Asset ' + cr.collateralId + ' created, ownership junction ' + cr.ownershipJunctionId + ' created' +
                (cr.valuationId == null ? '.' : ', valuation ' + cr.valuationId + ' created.'));

            if (row == null) {
                cr.outcome = 'The asset was inserted but could not be read back.';
                C360Plan.setState(steps, cr.verifyStepId, C360Plan.STATE_FILED_UNVERIFIED, cr.outcome);
                continue;
            }
            Boolean valuationProven = cr.valuationId == null || valuation != null;
            Boolean proven = ownershipCount == 1 && unpledged && valuationProven;
            cr.outcome = '"' + cr.description + '" filed as ' + row.Name + ' at ' + String.valueOf(row.LLC_BI__Value__c) +
                ', lendable value ' + String.valueOf(row.LLC_BI__Lendable_Value__c) + ' as the org computes it, with ' +
                ownershipCount + ' ownership junction and ' + (unpledged ? 'no' : 'an unexpected') + ' pledge' +
                (cr.valuationId == null
                    ? '. It is on the relationship, not pledged to any facility.'
                    : ', and valuation ' + (cr.valuationName == null ? cr.valuationId : cr.valuationName) +
                      ' on file. It is on the relationship, not pledged to any facility.');
            C360Plan.setState(
                steps,
                cr.verifyStepId,
                proven ? C360Plan.STATE_VERIFIED : C360Plan.STATE_FILED_UNVERIFIED,
                cr.outcome
            );
        }
    }

    /* -------------------------------------------------------------------- helpers */

    private static String outcomeLine(Account borrower, List<CovenantResult> covenants, List<CollateralResult> collateral) {
        List<String> parts = new List<String>();
        if (!covenants.isEmpty()) {
            parts.add(String.valueOf(covenants.size()) + (covenants.size() == 1 ? ' covenant' : ' covenants') +
                ' filed on the relationship, each with its relationship junction and no loan junction');
        }
        if (!collateral.isEmpty()) {
            Integer valued = 0;
            for (CollateralResult cr : collateral) {
                if (cr.valuationId != null) {
                    valued++;
                }
            }
            parts.add(String.valueOf(collateral.size()) + (collateral.size() == 1 ? ' asset' : ' assets') +
                ' filed, each owned by ' + borrower.Name + ' and pledged to nothing' +
                (valued == 0 ? '' : ', ' + String.valueOf(valued) + ' with an opening valuation'));
        }
        return String.join(parts, '; ') + '. Nothing reached a facility, so no coverage, availability or credit figure changed.';
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.planId = prior.Id;
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.covenants = new List<CovenantResult>();
        r.collateral = new List<CollateralResult>();
        r.covenantCount = 0;
        r.collateralCount = 0;
        r.outcome = 'This idempotency key already filed record ' + prior.cm_Result_Record_Id__c + ' on this relationship. Nothing was written.';
        r.steps = prior.cm_Tracker_JSON__c == null
            ? new List<StepResult>()
            : toWireSteps((List<C360Plan.Step>) JSON.deserialize(prior.cm_Tracker_JSON__c, List<C360Plan.Step>.class));
        return r;
    }

    private static Integer countOf(Object v) {
        return v == null ? 0 : Integer.valueOf(C360Plan.asDecimal(v));
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

    /**
     * `step` stays null on every path here, and that is deliberate rather than an omission. This
     * tool writes each object in ONE bulk DML, so a refusal or an org rejection belongs to the
     * whole plan and not to a numbered step; naming one would point the banker at a row that may
     * not be the row that failed. The field is on the wire because every execute_* carries the
     * same error shape.
     */
    private static ToolError err(String code, String message, String orgError, Boolean resumable, String idempotencyKey) {
        ToolError e = new ToolError();
        e.code = code;
        e.message = message;
        e.orgError = orgError;
        e.resumable = resumable;
        e.idempotencyKey = idempotencyKey;
        return e;
    }
}
