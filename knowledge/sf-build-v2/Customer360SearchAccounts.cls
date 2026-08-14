/**
 * Customer360SearchAccounts — MCP tool: find an account to anchor on.
 *
 * Risk rating is NOT a search filter here — it lives on Product Package
 * (LLC_BI__Risk_Rating__c, picklist) and Loan (LLC_BI__Risk_Grade__c), not on
 * Account, so an account-level risk-grade filter would be misleading. Search
 * by name/industry only; pull risk via Customer360Snapshot once you have an
 * accountId.
 */
global with sharing class Customer360SearchAccounts {

    global class Request {
        @InvocableVariable(label='Name (partial match)')
        global String name;
        @InvocableVariable(label='Industry (exact picklist value)')
        global String industry;
        @InvocableVariable(label='Max Results' description='Default 25, max 100.')
        global Integer maxResults;
    }

    global class AccountSummary {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Name')
        global String name;
        @InvocableVariable(label='Industry')
        global String industry;
        @InvocableVariable(label='NAICS Code')
        global String naicsCode;
        @InvocableVariable(label='Annual Revenue')
        global Decimal annualRevenue;
    }

    global class Response {
        @InvocableVariable(label='Result Count')
        global Integer count;
        @InvocableVariable(label='Results')
        global List<AccountSummary> results;
    }

    @InvocableMethod(
        label='Customer 360: Search Accounts'
        description='Search the book by partial name match and/or exact Industry picklist value. Returns accountId, name, industry, NAICS, and revenue. Use the returned accountId with the other Customer 360 tools.'
    )
    global static List<Response> search(List<Request> requests) {
        List<Response> outputs = new List<Response>();

        for (Request req : requests) {
            Integer lim = req.maxResults != null ? Math.min(req.maxResults, 100) : 25;

            String soql = 'SELECT Id, Name, Industry, NAICS_Code__c, AnnualRevenue ' +
                          'FROM Account WHERE Id != null ';
            if (String.isNotBlank(req.name)) {
                soql += 'AND Name LIKE \'%' + String.escapeSingleQuotes(req.name) + '%\' ';
            }
            if (String.isNotBlank(req.industry)) {
                soql += 'AND Industry = \'' + String.escapeSingleQuotes(req.industry) + '\' ';
            }
            soql += 'WITH USER_MODE ORDER BY Name ASC LIMIT ' + lim;

            List<Account> accts = Database.query(soql);

            Response res = new Response();
            res.count = accts.size();
            res.results = new List<AccountSummary>();
            for (Account a : accts) {
                AccountSummary s = new AccountSummary();
                s.accountId = a.Id;
                s.name = a.Name;
                s.industry = a.Industry;
                s.naicsCode = a.NAICS_Code__c;
                s.annualRevenue = a.AnnualRevenue;
                res.results.add(s);
            }
            outputs.add(res);
        }

        return outputs;
    }
}
