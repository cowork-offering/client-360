/**
 * Customer360Opportunities — MCP tool: whitespace / next-best-action candidates.
 *
 * Standard Opportunity object — lowest-risk read in the tool set, fields are
 * platform-standard and need no provenance note beyond WITH USER_MODE.
 */
global with sharing class Customer360Opportunities {

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
    }

    global class OpportunityItem {
        @InvocableVariable(label='Opportunity Id')
        global String opportunityId;
        @InvocableVariable(label='Name')
        global String name;
        @InvocableVariable(label='Stage')
        global String stage;
        @InvocableVariable(label='Amount')
        global Decimal amount;
        @InvocableVariable(label='Close Date')
        global String closeDate;
        @InvocableVariable(label='Type')
        global String type;
        @InvocableVariable(label='Probability')
        global Decimal probability;
        @InvocableVariable(label='Owner Name')
        global String ownerName;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Open Opportunities')
        global List<OpportunityItem> opportunities;
        @InvocableVariable(label='Note')
        global String note;
    }

    @InvocableMethod(
        label='Customer 360: Opportunities / Whitespace'
        description='Open CRM opportunities linked to the account, ordered by amount descending. The next-best-action candidate list.'
    )
    global static List<Response> getOpportunities(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.opportunities = new List<OpportunityItem>();

            List<Opportunity> opps = [
                SELECT Id, Name, StageName, Amount, CloseDate, Type, Probability, Owner.Name
                FROM Opportunity
                WHERE AccountId = :req.accountId
                  AND IsClosed = false
                WITH USER_MODE
                ORDER BY Amount DESC NULLS LAST
                LIMIT 25
            ];

            for (Opportunity o : opps) {
                OpportunityItem oi = new OpportunityItem();
                oi.opportunityId = o.Id;
                oi.name = o.Name;
                oi.stage = o.StageName;
                oi.amount = o.Amount;
                oi.closeDate = o.CloseDate != null ? String.valueOf(o.CloseDate) : null;
                oi.type = o.Type;
                oi.probability = o.Probability;
                oi.ownerName = o.Owner != null ? o.Owner.Name : null;
                res.opportunities.add(oi);
            }

            res.note = res.opportunities.isEmpty() ? 'No open opportunities for this account.' : null;
            results.add(res);
        }

        return results;
    }
}
