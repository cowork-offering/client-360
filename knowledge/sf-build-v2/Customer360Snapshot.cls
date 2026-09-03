/**
 * Customer360Snapshot — MCP tool: thin relationship anchor.
 *
 * Per architecture review, this tool stays THIN: Account fields + Package-level
 * rollups only. No Loan/Collateral/Covenant joins here (those live in their own
 * tools) — keeps this safe to compose with other tools in one agent turn without
 * SOQL-limit risk.
 *
 * Aggregates across every Product Package where this Account is the relationship,
 * the primary entity, or the household root — and rolls up via the PACKAGE-level
 * TCE/TBE/TOE/Outstanding fields, never by summing Loan amounts (nCino's
 * limit/sublimit structure double-counts a naive loan sum; verified on the
 * Piedmont demo account: 3 facilities sum to more than TCE because of that
 * structure).
 *
 * All objects/fields verified live against the bankinggpt sandbox
 * (sobject-sf MCP, 2026-07-01). See Customer360 mcpServerDefinition header for
 * the full provenance note.
 */
global with sharing class Customer360Snapshot {

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Name')
        global String name;
        @InvocableVariable(label='Industry')
        global String industry;
        @InvocableVariable(label='Annual Revenue')
        global Decimal annualRevenue;
        @InvocableVariable(label='NAICS Code')
        global String naicsCode;
        @InvocableVariable(label='Number of Product Packages')
        global Integer packageCount;
        @InvocableVariable(label='Total Credit Exposure (sum of Package TCE)')
        global Decimal totalCreditExposure;
        @InvocableVariable(label='Total Borrower Exposure (sum of Package TBE)')
        global Decimal totalBorrowerExposure;
        @InvocableVariable(label='Total Obligor Exposure (sum of Package TOE)')
        global Decimal totalObligorExposure;
        @InvocableVariable(label='Total Outstanding (sum of Package Outstanding)')
        global Decimal totalOutstanding;
        @InvocableVariable(label='Primary Risk Rating (highest-TCE package)')
        global String primaryRiskRating;
        @InvocableVariable(label='Primary Credit Stage (highest-TCE package)')
        global String primaryStage;
        @InvocableVariable(label='Note')
        global String note;
        @InvocableVariable(label='Next Review Date' description='LLC_BI__Next_Review_Date__c on the Account.')
        global String nextReviewDate;
        @InvocableVariable(label='Last Review Date' description='LLC_BI__Last_Review_Date__c on the Account.')
        global String lastReviewDate;
    }

    @InvocableMethod(
        label='Customer 360: Relationship Snapshot'
        description='Thin anchor for a customer/relationship: account profile + Package-level exposure rollups (TCE/TBE/TOE/Outstanding). No facility, collateral, or covenant detail — use the dedicated tools for those.'
    )
    global static List<Response> getSnapshot(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;

            List<Account> accts = [
                SELECT Id, Name, Industry, AnnualRevenue, NAICS_Code__c,
                       LLC_BI__Next_Review_Date__c, LLC_BI__Last_Review_Date__c
                FROM Account
                WHERE Id = :req.accountId
                WITH USER_MODE
                LIMIT 1
            ];
            if (accts.isEmpty()) {
                res.note = 'Account not found or not visible to the running user.';
                results.add(res);
                continue;
            }
            Account acct = accts[0];
            res.name = acct.Name;
            res.industry = acct.Industry;
            res.annualRevenue = acct.AnnualRevenue;
            res.naicsCode = acct.NAICS_Code__c;
            // The relationship's own review clock, so a Sync never wipes the
            // review card (founder, 2026-09-03: the card emptied on Sync
            // because the read did not carry these).
            res.nextReviewDate = acct.LLC_BI__Next_Review_Date__c == null ? null : String.valueOf(acct.LLC_BI__Next_Review_Date__c);
            res.lastReviewDate = acct.LLC_BI__Last_Review_Date__c == null ? null : String.valueOf(acct.LLC_BI__Last_Review_Date__c);

            List<LLC_BI__Product_Package__c> packages = [
                SELECT Id, LLC_BI__TCE__c, LLC_BI__TBE__c, LLC_BI__TOE__c, LLC_BI__Outstanding__c,
                       LLC_BI__Risk_Rating__c, cm_Credit_Stage__c
                FROM LLC_BI__Product_Package__c
                WHERE LLC_BI__Account__c = :req.accountId
                   OR LLC_BI__Primary_Entity__c = :req.accountId
                   OR cm_Household__c = :req.accountId
                WITH USER_MODE
            ];

            res.packageCount = packages.size();
            res.totalCreditExposure = 0;
            res.totalBorrowerExposure = 0;
            res.totalObligorExposure = 0;
            res.totalOutstanding = 0;

            LLC_BI__Product_Package__c primaryPkg = null;
            Decimal highestTce = -1;
            for (LLC_BI__Product_Package__c pkg : packages) {
                if (pkg.LLC_BI__TCE__c != null) res.totalCreditExposure += pkg.LLC_BI__TCE__c;
                if (pkg.LLC_BI__TBE__c != null) res.totalBorrowerExposure += pkg.LLC_BI__TBE__c;
                if (pkg.LLC_BI__TOE__c != null) res.totalObligorExposure += pkg.LLC_BI__TOE__c;
                if (pkg.LLC_BI__Outstanding__c != null) res.totalOutstanding += pkg.LLC_BI__Outstanding__c;
                Decimal tce = pkg.LLC_BI__TCE__c != null ? pkg.LLC_BI__TCE__c : 0;
                if (tce > highestTce) {
                    highestTce = tce;
                    primaryPkg = pkg;
                }
            }
            if (primaryPkg != null) {
                res.primaryRiskRating = primaryPkg.LLC_BI__Risk_Rating__c;
                res.primaryStage = primaryPkg.cm_Credit_Stage__c;
            }

            res.note = packages.isEmpty()
                ? 'No Product Packages found for this account (no deal relationship on file).'
                : 'Use get_relationship_graph, get_exposure, get_covenants for detail.';
            results.add(res);
        }

        return results;
    }
}
