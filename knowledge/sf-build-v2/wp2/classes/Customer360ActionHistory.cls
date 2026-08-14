/**
 * Customer360ActionHistory - MCP tool: the durable audit trail for Action Panel activity.
 *
 * Read-only. Zero DML. This tool answers "what has the cockpit done on this relationship, and did
 * it land", from the staging store that A33.3.3 makes the authority on tracker state. The client's
 * sessionStorage copy is a cache and dies with the session; this survives it.
 *
 * TWO THINGS THIS TOOL DELIBERATELY DOES NOT RETURN:
 *   1. `cm_Decision_Token_Hash__c` is never selected. Not redacted, not blanked, not selected at
 *      all, so no token material can reach a caller even through an unexpected serialisation path.
 *   2. The plan hash itself is never emitted. A33.5.3 makes the hash the binding between a
 *      confirmed plan and its execution; a reader needs to know one EXISTS, not what it is, so
 *      this returns `planHashPresent` as a boolean.
 *
 * SHARING, STATED PLAINLY. cm_Action_Staging__c is Private with the acting banker as owner, and
 * this class is `with sharing` running WITH USER_MODE. A banker therefore sees their own actions
 * and not a colleague's. That is correct for a cockpit surface and INSUFFICIENT for supervisory
 * review or examiner export, which need a sharing rule or View All on the object. The note on the
 * response says so rather than letting an empty list read as "nothing happened".
 *
 * Pattern follows the existing Customer360* read tools exactly: global with sharing, one
 * @InvocableMethod, positional List<Response>, global inner wire types, WITH USER_MODE, API 67.
 */
global with sharing class Customer360ActionHistory {

    private static final Integer DEFAULT_LIMIT = 50;
    private static final Integer MAX_LIMIT = 200;

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
        @InvocableVariable(label='Max Results' description='Default 50, max 200. Newest first.')
        global Integer maxResults;
    }

    global class ActionHistoryEntry {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Action Id' description='Registry action id, for example collateral-valuation.')
        global String actionId;
        @InvocableVariable(label='Status' description='Staged, Executing, Completed, Partial or Failed.')
        global String status;
        @InvocableVariable(label='Plan Hash Present' description='True when a plan hash was recorded. The hash itself is never returned by a read tool.')
        global Boolean planHashPresent;
        @InvocableVariable(label='Actor User Id' description='Who staged the action.')
        global String actorUserId;
        @InvocableVariable(label='Approver User Id' description='The named human bound to the decision token. Confirmation of a plan, never a credit approval.')
        global String approverUserId;
        @InvocableVariable(label='Executed At')
        global String executedAt;
        @InvocableVariable(label='Created Date')
        global String createdDate;
        @InvocableVariable(label='Result Record Id' description='The domain record the action created. Empty on a staged-only row, because stage_* creates nothing.')
        global String resultRecordId;
        @InvocableVariable(label='Result Record Name' description='Org-assigned name of the created record. Null when the record type is not one this tool resolves, or when the record is no longer visible.')
        global String resultRecordName;
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Product Package Id')
        global String productPackageId;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Count')
        global Integer count;
        @InvocableVariable(label='Entries')
        global List<ActionHistoryEntry> entries;
        @InvocableVariable(label='Note')
        global String note;
    }

    /**
     * Returns the durable action history for a relationship, newest first.
     *
     * @param requests One request per relationship. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='Customer 360: Action History'
        description='Durable audit trail of Action Panel activity for a relationship: which actions were staged, which executed, by whom, and what record each produced. Read-only. Never returns decision-token material and never returns the plan hash itself.'
    )
    global static List<Response> getHistory(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.entries = new List<ActionHistoryEntry>();

            if (String.isBlank(req.accountId)) {
                res.count = 0;
                res.note = 'accountId is required. No history was read.';
                results.add(res);
                continue;
            }

            Integer lim = req.maxResults == null ? DEFAULT_LIMIT : Math.min(Math.max(req.maxResults, 1), MAX_LIMIT);

            // cm_Decision_Token_Hash__c is absent from this field list on purpose. See the class comment.
            List<cm_Action_Staging__c> rows = [
                SELECT Id, cm_Action_Id__c, cm_Status__c, cm_Plan_Hash__c, cm_Actor_User__c,
                       cm_Approver_User__c, cm_Executed_At__c, CreatedDate, cm_Result_Record_Id__c,
                       cm_Account__c, cm_Product_Package__c
                FROM cm_Action_Staging__c
                WHERE cm_Account__c = :req.accountId
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT :lim
            ];

            Map<String, String> namesById = resolveNames(rows);

            for (cm_Action_Staging__c r : rows) {
                ActionHistoryEntry e = new ActionHistoryEntry();
                e.stagingId = r.Id;
                e.actionId = r.cm_Action_Id__c;
                e.status = r.cm_Status__c;
                e.planHashPresent = String.isNotBlank(r.cm_Plan_Hash__c);
                e.actorUserId = r.cm_Actor_User__c;
                e.approverUserId = r.cm_Approver_User__c;
                e.executedAt = r.cm_Executed_At__c == null ? null : String.valueOf(r.cm_Executed_At__c);
                e.createdDate = String.valueOf(r.CreatedDate);
                e.resultRecordId = r.cm_Result_Record_Id__c;
                e.resultRecordName = namesById.get(r.cm_Result_Record_Id__c);
                e.accountId = r.cm_Account__c;
                e.productPackageId = r.cm_Product_Package__c;
                res.entries.add(e);
            }

            res.count = res.entries.size();
            res.note = res.entries.isEmpty()
                ? 'No action history visible for this relationship. This object is Private and this tool runs as you, so actions taken by a colleague are not shown. Supervisory review needs a sharing rule or View All on the staging object.'
                : 'Newest first. Plan hashes are reported as present or absent, never returned. Decision-token material is never read by this tool.';
            results.add(res);
        }

        return results;
    }

    /**
     * Resolves the org-assigned names of the created records, one query per object type rather
     * than one per row.
     *
     * Key prefixes are read from the describe rather than hardcoded, so the mapping cannot drift
     * from the org. A record whose prefix is not one of the three shipping write targets resolves
     * to no name and the caller still gets its id, which is the honest answer for a record type
     * this tool does not know how to label.
     *
     * @param rows The staging rows being returned.
     * @return Record id to org-assigned name, for the ids this tool could resolve.
     */
    private static Map<String, String> resolveNames(List<cm_Action_Staging__c> rows) {
        Map<String, String> namesById = new Map<String, String>();

        Set<String> ids = new Set<String>();
        for (cm_Action_Staging__c r : rows) {
            if (String.isNotBlank(r.cm_Result_Record_Id__c)) {
                ids.add(r.cm_Result_Record_Id__c);
            }
        }
        if (ids.isEmpty()) {
            return namesById;
        }

        // Case carries no Name field; its label is CaseNumber. The other two are autonumber Names.
        Map<String, String> nameFieldByObject = new Map<String, String>{
            'LLC_BI__Collateral_Valuation__c' => 'Name',
            'Case' => 'CaseNumber',
            'LLC_BI__Review__c' => 'Name'
        };

        for (String objectApiName : nameFieldByObject.keySet()) {
            Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName);
            if (t == null) {
                continue;
            }
            String prefix = t.getDescribe().getKeyPrefix();
            if (String.isBlank(prefix)) {
                continue;
            }

            Set<Id> forThisObject = new Set<Id>();
            for (String rid : ids) {
                if (rid.length() >= 3 && rid.substring(0, 3) == prefix) {
                    try {
                        forThisObject.add(Id.valueOf(rid));
                    } catch (System.StringException e) {
                        // A stored value that is not a well-formed id resolves to no name rather
                        // than failing the whole read.
                        continue;
                    }
                }
            }
            if (forThisObject.isEmpty()) {
                continue;
            }

            String nameField = nameFieldByObject.get(objectApiName);
            String soql = 'SELECT Id, ' + nameField + ' FROM ' + objectApiName + ' WHERE Id IN :forThisObject WITH USER_MODE';
            for (SObject s : Database.query(soql)) {
                namesById.put(String.valueOf(s.get('Id')), String.valueOf(s.get(nameField)));
            }
        }

        return namesById;
    }
}
