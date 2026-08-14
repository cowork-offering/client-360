/**
 * Customer360Covenants — MCP tool: covenant compliance.
 *
 * Reads the MODERN covenant object only: LLC_BI__Covenant2__c.
 * LLC_BI__Covenant__c (legacy) is empty org-wide (0 records) — never queried.
 *
 * Covenant2 carries its own threshold (Financial_Indicator_Value__c), its own
 * actual reading (Last_Evaluation_Value__c), and status — unlike the legacy
 * object, no separate ratio lookup is needed to know compliance; this tool
 * surfaces what nCino already evaluated. The Boom MCP's ratio is still the
 * source for ratios that feed a NEW covenant test before nCino re-evaluates;
 * compose at the agent layer for forward-looking covenant analysis.
 *
 * Scoped to relationship-level covenants (LLC_BI__Account__c on Covenant2).
 * Loan-level covenant association goes through a separate junction object
 * (LLC_BI__Loan_Covenant__c) not read here — the verified demo data
 * (Piedmont's 4 covenants) is relationship-level, matching this scope.
 *
 * All fields verified live against the bankinggpt sandbox (sobject-sf MCP,
 * 2026-07-01).
 */
global with sharing class Customer360Covenants {

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
    }

    global class Covenant {
        @InvocableVariable(label='Covenant Id')
        global String covenantId;
        @InvocableVariable(label='Covenant Type')
        global String covenantType;
        @InvocableVariable(label='Threshold (Financial Indicator Value)')
        global Decimal thresholdValue;
        @InvocableVariable(label='Actual (Last Evaluation Value)')
        global Decimal actualValue;
        @InvocableVariable(label='Last Evaluation Status')
        global String lastEvaluationStatus;
        @InvocableVariable(label='Last Evaluation Date')
        global String lastEvaluationDate;
        @InvocableVariable(label='Next Evaluation Date')
        global String nextEvaluationDate;
        @InvocableVariable(label='Days Until Next Evaluation')
        global Decimal daysUntilNextEvaluation;
        @InvocableVariable(label='Frequency')
        global String frequency;
        @InvocableVariable(label='Breached')
        global Boolean breached;
        @InvocableVariable(label='Covenant Status')
        global String covenantStatus;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Covenants')
        global List<Covenant> covenants;
        @InvocableVariable(label='Note')
        global String note;
    }

    @InvocableMethod(
        label='Customer 360: Covenant Compliance'
        description='Active relationship-level covenants from the modern nCino covenant object: threshold, last-evaluated actual, status, and the next test date with days remaining.'
    )
    global static List<Response> getCovenants(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.covenants = new List<Covenant>();

            List<LLC_BI__Covenant2__c> rows = [
                SELECT Id, LLC_BI__Covenant_Type__r.Name, LLC_BI__Financial_Indicator_Value__c,
                       LLC_BI__Last_Evaluation_Value__c, LLC_BI__Last_Evaluation_Status__c,
                       LLC_BI__Last_Evaluation_Date__c, LLC_BI__Next_Evaluation_Date__c,
                       LLC_BI__Days_Until_Next_Evaluation__c, LLC_BI__Frequency__c,
                       LLC_BI__Breached__c, LLC_BI__Covenant_Status__c
                FROM LLC_BI__Covenant2__c
                WHERE LLC_BI__Account__c = :req.accountId
                  AND LLC_BI__Active__c = true
                WITH USER_MODE
                ORDER BY LLC_BI__Next_Evaluation_Date__c ASC NULLS LAST
            ];

            for (LLC_BI__Covenant2__c c : rows) {
                Covenant cv = new Covenant();
                cv.covenantId = c.Id;
                cv.covenantType = c.LLC_BI__Covenant_Type__r != null ? c.LLC_BI__Covenant_Type__r.Name : null;
                cv.thresholdValue = c.LLC_BI__Financial_Indicator_Value__c;
                cv.actualValue = c.LLC_BI__Last_Evaluation_Value__c;
                cv.lastEvaluationStatus = c.LLC_BI__Last_Evaluation_Status__c;
                cv.lastEvaluationDate = c.LLC_BI__Last_Evaluation_Date__c != null ? String.valueOf(c.LLC_BI__Last_Evaluation_Date__c) : null;
                cv.nextEvaluationDate = c.LLC_BI__Next_Evaluation_Date__c != null ? String.valueOf(c.LLC_BI__Next_Evaluation_Date__c) : null;
                cv.daysUntilNextEvaluation = c.LLC_BI__Days_Until_Next_Evaluation__c;
                cv.frequency = c.LLC_BI__Frequency__c;
                cv.breached = c.LLC_BI__Breached__c;
                cv.covenantStatus = c.LLC_BI__Covenant_Status__c;
                res.covenants.add(cv);
            }

            res.note = res.covenants.isEmpty()
                ? 'No active relationship-level covenants found for this account.'
                : 'Threshold x actual already evaluated by nCino as of Last Evaluation Date. For a live ratio ahead of the next scheduled test, compose with the Boom MCP ratio tools at the agent layer.';
            results.add(res);
        }

        return results;
    }
}
