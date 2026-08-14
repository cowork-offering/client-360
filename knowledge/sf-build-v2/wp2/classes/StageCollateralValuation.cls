/**
 * StageCollateralValuation - MCP tool: stage_collateral_valuation.
 *
 * A33.0.1: this tool performs ZERO domain-object DML. It validates the request against the
 * A33.4.5 org contract, computes the execution plan, and returns a plan hash with a staging
 * handle and a decision token. The only row it writes is the staging record, which is not a
 * domain object in the bank's credit model.
 *
 * The plan carries the collateral-rollup verification step A33.4.5(d) requires. nCino binds the
 * collateral auto-update to the Add Valuation button and states it does not function via New, and
 * this org had zero prior valuation rows, so whether the parent moves is genuinely unsettled. The
 * plan re-queries the collateral and the terminal state reports "valuation filed, collateral value
 * unchanged" when it did not move. No coverage improvement is claimed on an unproven rollup.
 *
 * INPUT SHAPE AND THE required=true TRAP. This tool takes EITHER the flat single-item fields OR
 * items[], and neither may be flagged required=true on the invocable variable. `required=true` is
 * enforced by the REST Actions API BEFORE Apex runs, so leaving it on the flat fields made an
 * items-only call impossible: the platform refused it with REQUIRED_FIELD_MISSING and our Apex never
 * executed. Direct Apex test invocations do not enforce required-ness, so no unit test can catch
 * this: it is only observable on the wire. Requiredness is therefore enforced in Apex, where it can
 * also say WHICH item is wrong.
 *
 * Org contract: A33.4.5. Write evidence: PROBE-LEDGER.md probe 1 (CONFIRMED, 2026-07-25).
 */
global with sharing class StageCollateralValuation {

    /** Raised for a domain-level validation failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    /**
     * One valuation in a batch. The flat fields on Request remain the single-item path and are
     * folded into a one-element list, so every existing caller keeps working unchanged.
     */
    global class ValuationItem {
        @InvocableVariable(label='Collateral Id' description='Required in practice, enforced in Apex. Not flagged required=true: see the class header on Actions-API enforcement.')
        global String collateralId;
        @InvocableVariable(label='Value' description='Required in practice, enforced in Apex.')
        global Decimal value;
        @InvocableVariable(label='Valuation Date')
        global Date valuationDate;
        @InvocableVariable(label='Type')
        global String type;
        @InvocableVariable(label='Source')
        global String source;
        @InvocableVariable(label='Description')
        global String description;
        @InvocableVariable(label='Primary')
        global Boolean primary;
    }

    global class Request {
        @InvocableVariable(label='Idempotency Key' description='Client-generated, stable across resume. Enforced by us, never assumed from the platform.' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Rationale' description='Why this valuation is being filed. Feeds the audit ledger.' required=true)
        global String rationale;
        @InvocableVariable(label='Collateral Id' description='Single-item path. Supply this and value, OR items, never both. Not flagged required=true because items supersedes it; requiredness is enforced in Apex.')
        global String collateralId;
        @InvocableVariable(label='Value' description='Single-item path. The valuation amount.')
        global Decimal value;
        @InvocableVariable(label='Valuation Date')
        global Date valuationDate;
        @InvocableVariable(label='Type' description='LLC_BI__Type__c picklist value, read from the org. For example Fair Market Value - Real Estate, Net Orderly Liquidation Value, As Is Value.')
        global String type;
        @InvocableVariable(label='Source' description='LLC_BI__Source__c picklist value, read from the org. For example Appraisal, Internal Valuation, Third Party Source.')
        global String source;
        @InvocableVariable(label='Description')
        global String description;
        @InvocableVariable(label='Primary' description='Set explicitly. The three booleans on this object default to false, so a revaluation states its intent.')
        global Boolean primary;
        @InvocableVariable(label='Items' description='Bulk path: value several collaterals in one plan, one staging row, one token. Leave empty and the flat fields above are used as a single item.')
        global List<ValuationItem> items;
    }

    global class PlanStep {
        @InvocableVariable(label='Step Id')
        global String id;
        @InvocableVariable(label='Type' description='write, verification, wait, handoff or observed_side_effect.')
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

    global class PlannedItem {
        @InvocableVariable(label='Collateral Id')
        global String collateralId;
        @InvocableVariable(label='Collateral Name')
        global String collateralName;
        @InvocableVariable(label='Value')
        global Decimal value;
        @InvocableVariable(label='Write Step Id')
        global String writeStepId;
        @InvocableVariable(label='Verify Step Id')
        global String verifyStepId;
        @InvocableVariable(label='Rollup Step Id')
        global String rollupStepId;
    }

    global class StageResult {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Plan Hash')
        global String planHash;
        @InvocableVariable(label='Decision Token' description='Single use, bound to this staging id, plan hash and user. Null on an idempotent replay: the caller already holds it.')
        global String decisionToken;
        @InvocableVariable(label='Summary' description='What will be written, in banker language. Drives the confirm gate copy.')
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
        @InvocableVariable(label='Items' description='One entry per valuation in the batch, with the plan step ids that belong to it.')
        global List<PlannedItem> items;
        @InvocableVariable(label='Item Count')
        global Integer itemCount;
        @InvocableVariable(label='Replayed')
        global Boolean replayed;
    }

    global class Response {
        @InvocableVariable(label='OK' description='Discriminates the typed result. Domain failure is a successful invocation carrying ok = false.')
        global Boolean ok;
        @InvocableVariable(label='Result')
        global StageResult result;
        @InvocableVariable(label='Error')
        global ToolError error;
    }

    /**
     * Stages a collateral valuation. Writes no domain record.
     *
     * @param requests One request per staged action. Element i of the response belongs to input i.
     * @return One response per request. A domain failure carries ok = false and does not
     *         contaminate its siblings.
     */
    @InvocableMethod(
        label='stage_collateral_valuation'
        description='Validate a collateral valuation against the org contract and return an immutable execution plan with a plan hash and a single-use decision token. Writes NO domain record: the valuation itself is created only by execute_collateral_valuation behind the token gate.'
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
        if (String.isBlank(req.rationale)) {
            throw new ToolException('rationale is required. It feeds the audit ledger.');
        }

        List<ValuationItem> items = normalise(req);
        if (items.isEmpty()) {
            throw new ToolException('At least one valuation is required: supply items, or the single collateralId and value.');
        }

        Set<String> seen = new Set<String>();
        Set<Id> collateralIds = new Set<Id>();
        for (Integer i = 0; i < items.size(); i++) {
            ValuationItem it = items[i];
            String itemRef = ' (item ' + (i + 1) + ' of ' + items.size() + ')';
            if (String.isBlank(it.collateralId)) {
                throw new ToolException('collateralId is required' + itemRef + '. It is the one hard-required field on the valuation object.');
            }
            if (it.value == null) {
                throw new ToolException('value is required' + itemRef + '.');
            }
            if (it.value < 0) {
                throw new ToolException('value must not be negative' + itemRef + '. A zero valuation and a missing valuation are different facts.');
            }
            if (seen.contains(it.collateralId)) {
                throw new ToolException(
                    'collateral ' + it.collateralId + ' appears more than once' + itemRef +
                    '. Two valuations of the same collateral in one batch would race each other for Primary.'
                );
            }
            seen.add(it.collateralId);
            assertPicklist('LLC_BI__Type__c', it.type, itemRef);
            assertPicklist('LLC_BI__Source__c', it.source, itemRef);
            collateralIds.add(it.collateralId);
        }

        Map<Id, LLC_BI__Collateral__c> collateralById = new Map<Id, LLC_BI__Collateral__c>([
            SELECT Id, Name, LLC_BI__Value__c, LLC_BI__Lendable_Value__c
            FROM LLC_BI__Collateral__c
            WHERE Id IN :collateralIds
            WITH USER_MODE
        ]);
        for (ValuationItem it : items) {
            if (!collateralById.containsKey(it.collateralId)) {
                throw new ToolException('Collateral ' + it.collateralId + ' was not found, or is not visible to you.');
            }
        }

        // Anchors come through the pledge junction; the valuation object has no account or package
        // field. On a batch the anchor is whichever pledged facility we can see first: it is
        // deep-link only, and a batch may legitimately span facilities.
        Id accountId = null;
        Id packageId = null;
        for (LLC_BI__Loan_Collateral2__c pledge : [
            SELECT LLC_BI__Loan__r.LLC_BI__Account__c, LLC_BI__Loan__r.LLC_BI__Product_Package__c
            FROM LLC_BI__Loan_Collateral2__c
            WHERE LLC_BI__Collateral__c IN :collateralIds
              AND LLC_BI__Active__c = true
            WITH USER_MODE
            ORDER BY LLC_BI__Is_Primary__c DESC NULLS LAST
            LIMIT 1
        ]) {
            accountId = pledge.LLC_BI__Loan__r.LLC_BI__Account__c;
            packageId = pledge.LLC_BI__Loan__r.LLC_BI__Product_Package__c;
        }

        Map<String, Object> resolved = new Map<String, Object>{ 'itemCount' => items.size() };
        List<C360Plan.Step> steps = new List<C360Plan.Step>();
        List<PlannedItem> planned = new List<PlannedItem>();

        for (Integer i = 0; i < items.size(); i++) {
            ValuationItem it = items[i];
            LLC_BI__Collateral__c coll = collateralById.get(it.collateralId);
            Boolean isPrimary = it.primary == true;
            String n = String.valueOf(i);

            // Per-item values are namespaced into the plan so execute replays each one exactly.
            resolved.put('item' + n + '.LLC_BI__Collateral__c', it.collateralId);
            resolved.put('item' + n + '.LLC_BI__Value__c', it.value);
            resolved.put('item' + n + '.LLC_BI__Valuation_Date__c', it.valuationDate);
            resolved.put('item' + n + '.LLC_BI__Type__c', it.type);
            resolved.put('item' + n + '.LLC_BI__Source__c', it.source);
            resolved.put('item' + n + '.LLC_BI__Valuation_Description__c', it.description);
            resolved.put('item' + n + '.LLC_BI__Primary__c', isPrimary);

            steps.add(
                new C360Plan.Step('write_valuation_' + n, C360Plan.TYPE_WRITE, 'File the valuation against ' + coll.Name)
                    .onObject(C360WriteGuard.OBJ_VALUATION, new List<String>{
                        'LLC_BI__Collateral__c', 'LLC_BI__Value__c', 'LLC_BI__Valuation_Date__c', 'LLC_BI__Type__c',
                        'LLC_BI__Source__c', 'LLC_BI__Valuation_Description__c', 'LLC_BI__Primary__c',
                        'LLC_BI__Active__c', 'LLC_BI__Original_Value__c'
                    })
                    .wakes(new List<String>{ 'LLC_BI.CollateralValuationTrigger (before insert only)' })
                    .provenBy('SELECT Id, Name, LLC_BI__Value__c FROM LLC_BI__Collateral_Valuation__c WHERE Id = :newId')
            );
            steps.add(
                new C360Plan.Step('verify_valuation_' + n, C360Plan.TYPE_VERIFICATION, 'Confirm the valuation for ' + coll.Name + ' landed')
                    .onObject(C360WriteGuard.OBJ_VALUATION, new List<String>{ 'LLC_BI__Value__c' })
                    .provenBy('SELECT Id, LLC_BI__Value__c FROM LLC_BI__Collateral_Valuation__c WHERE Id = :newId')
            );
            steps.add(
                new C360Plan.Step('verify_rollup_' + n, C360Plan.TYPE_VERIFICATION, 'Re-read ' + coll.Name + ' to see whether the value rolled up')
                    .onObject('LLC_BI__Collateral__c', new List<String>{ 'LLC_BI__Value__c', 'LLC_BI__Lendable_Value__c' })
                    .provenBy('SELECT Id, LLC_BI__Value__c, LLC_BI__Lendable_Value__c FROM LLC_BI__Collateral__c WHERE Id = :collateralId')
            );

            PlannedItem pi = new PlannedItem();
            pi.collateralId = it.collateralId;
            pi.collateralName = coll.Name;
            pi.value = it.value;
            pi.writeStepId = 'write_valuation_' + n;
            pi.verifyStepId = 'verify_valuation_' + n;
            pi.rollupStepId = 'verify_rollup_' + n;
            planned.add(pi);
        }

        List<String> warnings = new List<String>{
            'nCino binds the collateral auto-update to the Add Valuation button and it does not fire headlessly. Wave 3 probe 6 settled this on both arms: filing a valuation does NOT move the collateral value. Each item reports its own rollup answer and none of them claims a coverage improvement.',
            'Sub-collateral creation is not offered: it fires the parent validation rules even when nothing changed, and the documented workaround has no headless equivalent.'
        };
        if (items.size() > 1) {
            warnings.add(
                'This is one batch of ' + items.size() + ' valuations under a single confirmation. Each is written and verified separately, ' +
                'so a failure on one is reported against that collateral and does not silently discard the others.'
            );
        }

        Map<String, Object> provenance = new Map<String, Object>{
            'LLC_BI__Collateral__c' => new Map<String, String>{ 'prefill' => 'NCINO_RECORD', 'provenance' => 'NCINO', 'citation' => 'Selected collateral records.' },
            'LLC_BI__Value__c' => new Map<String, String>{ 'prefill' => 'BANKER', 'provenance' => null, 'citation' => null },
            'LLC_BI__Active__c' => new Map<String, String>{ 'prefill' => 'COMPUTED', 'provenance' => 'DERIVED', 'citation' => 'A33.4.5(a): the three booleans default to false, so a revaluation sets Active and Primary explicitly.' }
        };

        String summary = items.size() == 1
            ? 'Files a new valuation of ' + String.valueOf(items[0].value) + ' against collateral ' +
              collateralById.get(items[0].collateralId).Name + '. Creates one valuation record, marked Active' +
              (items[0].primary == true ? ' and Primary' : '') + ' and not the original value. No status is changed anywhere and no credit decision is made or implied.'
            : 'Files ' + items.size() + ' new valuations in one batch, each marked Active and not the original value. ' +
              'Every item is written and verified on its own, and each reports whether its collateral value moved. ' +
              'No status is changed anywhere and no credit decision is made or implied.';

        String planJson = C360Plan.serializePlan(summary, steps, warnings, provenance, resolved);
        String planHash = C360Plan.hash('collateral-valuation', steps, resolved);

        C360ActionStaging.Staged staged = C360ActionStaging.stagePlan(
            'collateral-valuation', req.idempotencyKey, accountId, packageId, planJson, planHash
        );

        StageResult r = new StageResult();
        r.stagingId = staged.stagingId;
        r.planHash = staged.planHash;
        r.decisionToken = staged.decisionToken;
        r.replayed = staged.replayed;
        r.summary = summary;
        r.warnings = warnings;
        r.provenanceJson = JSON.serialize(provenance);
        r.accountId = accountId;
        r.productPackageId = packageId;
        r.items = planned;
        r.itemCount = planned.size();
        r.steps = toWireSteps(steps);
        return r;
    }

    /**
     * Folds the single-item flat fields into a one-element list so the old shape keeps working.
     * Supplying both is refused rather than silently merged: a caller who does that has two
     * different intentions and we should not guess which one wins.
     */
    private static List<ValuationItem> normalise(Request req) {
        Boolean hasFlat = String.isNotBlank(req.collateralId) || req.value != null;
        Boolean hasItems = req.items != null && !req.items.isEmpty();

        if (hasFlat && hasItems) {
            throw new ToolException(
                'Supply either the single collateralId and value, or items, but not both. Two shapes in one request is two intentions.'
            );
        }
        if (!hasFlat && !hasItems) {
            throw new ToolException(
                'No valuation supplied. Provide items[], or the single collateralId and value. ' +
                'These are not flagged required on the invocable because either shape is valid, so the check lives here.'
            );
        }
        if (hasItems) {
            return req.items;
        }

        ValuationItem one = new ValuationItem();
        one.collateralId = req.collateralId;
        one.value = req.value;
        one.valuationDate = req.valuationDate;
        one.type = req.type;
        one.source = req.source;
        one.description = req.description;
        one.primary = req.primary;
        return new List<ValuationItem>{ one };
    }

    private static void assertPicklist(String fieldApiName, String value, String itemRef) {
        if (String.isBlank(value)) {
            return;
        }
        Set<String> allowed = C360Picklist.activeValues(C360WriteGuard.OBJ_VALUATION, fieldApiName);
        if (!allowed.contains(value)) {
            List<String> sorted = new List<String>(allowed);
            sorted.sort();
            throw new ToolException(
                fieldApiName + ' value \'' + value + '\' is not offered by this org' + itemRef + '. Available: ' + String.join(sorted, ', ') + '.'
            );
        }
    }

    /** Maps the internal plan steps onto the wire shape. */
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
