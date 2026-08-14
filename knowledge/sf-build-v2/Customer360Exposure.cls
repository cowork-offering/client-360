/**
 * Customer360Exposure — MCP tool: facilities + collateral coverage.
 *
 * This tool OWNS the collateral query and the coverage-shortfall computation
 * (architecture review: avoids the structural-signals tool re-querying the
 * same Loan_Collateral2 rows — one owner per object, no duplicate reads).
 *
 * Collateral: LLC_BI__Loan_Collateral2__c is the MODERN pledge object —
 * LLC_BI__Loan_Collateral__c (legacy) is empty org-wide, never queried here.
 * Current_Lendable_Value__c is the org's own computed lendable figure
 * (value x advance rate, already on the record) — never re-derived by hand.
 * Pledges flagged Is_Excluded__c or Abundance_of_Caution__c do not secure /
 * are out of LTV and are excluded from the coverage math, per the verified
 * data model.
 *
 * All fields verified live against the bankinggpt sandbox (sobject-sf MCP,
 * 2026-07-01).
 */
global with sharing class Customer360Exposure {

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
    }

    global class CollateralPledge {
        @InvocableVariable(label='Loan Id')
        global String loanId;
        @InvocableVariable(label='Collateral Type')
        global String collateralType;
        @InvocableVariable(label='Collateral Value')
        global Decimal collateralValue;
        @InvocableVariable(label='Advance Rate')
        global Decimal advanceRate;
        @InvocableVariable(label='Current Lendable Value')
        global Decimal currentLendableValue;
        @InvocableVariable(label='Lien Position')
        global String lienPosition;
        @InvocableVariable(label='Pledged Status')
        global String pledgedStatus;
        @InvocableVariable(label='Is Primary')
        global Boolean isPrimary;
    }

    global class Facility {
        @InvocableVariable(label='Loan Id')
        global String loanId;
        @InvocableVariable(label='Name')
        global String name;
        @InvocableVariable(label='Product Type')
        global String productType;
        @InvocableVariable(label='Risk Grade')
        global String riskGrade;
        @InvocableVariable(label='Committed (Original Amount)')
        global Decimal committed;
        @InvocableVariable(label='Outstanding')
        global Decimal outstanding;
        @InvocableVariable(label='Available')
        global Decimal available;
        @InvocableVariable(label='Maturity Date')
        global String maturityDate;
        @InvocableVariable(label='Current Interest Rate')
        global Decimal interestRate;
        @InvocableVariable(label='Total Lendable Value (this facility\'s collateral)')
        global Decimal totalLendableValue;
        @InvocableVariable(label='Coverage Ratio (lendable / outstanding)')
        global Decimal coverageRatio;
        @InvocableVariable(label='Coverage Shortfall' description='True when total lendable value is below outstanding balance.')
        global Boolean coverageShortfall;
        @InvocableVariable(label='Collateral Pledges')
        global List<CollateralPledge> collateral;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Total Committed')
        global Decimal totalCommitted;
        @InvocableVariable(label='Total Outstanding')
        global Decimal totalOutstanding;
        @InvocableVariable(label='Total Available')
        global Decimal totalAvailable;
        @InvocableVariable(label='Facilities')
        global List<Facility> facilities;
        @InvocableVariable(label='Note')
        global String note;
    }

    @InvocableMethod(
        label='Customer 360: Exposure and Collateral'
        description='Active facilities (committed/outstanding/available) per loan, with collateral pledges and a computed coverage ratio + shortfall flag per facility. Uses the modern collateral object only (legacy is empty in this org).'
    )
    global static List<Response> getExposure(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.totalCommitted = 0;
            res.totalOutstanding = 0;
            res.totalAvailable = 0;
            res.facilities = new List<Facility>();

            List<LLC_BI__Loan__c> loans = [
                SELECT Id, Name, LLC_BI__Product_Type__c, LLC_BI__Risk_Grade__c,
                       LLC_BI__Amount__c, LLC_BI__AmountOutstanding__c, LLC_BI__Amount_Available__c,
                       LLC_BI__Maturity_Date__c, LLC_BI__Current_Interest_Rate__c, LLC_BI__Status__c
                FROM LLC_BI__Loan__c
                WHERE LLC_BI__Account__c = :req.accountId
                  AND LLC_BI__Status__c != 'Closed'
                WITH USER_MODE
                ORDER BY LLC_BI__Amount__c DESC NULLS LAST
            ];

            if (loans.isEmpty()) {
                res.note = 'No active facilities found for this account.';
                results.add(res);
                continue;
            }

            Set<Id> loanIds = new Set<Id>();
            for (LLC_BI__Loan__c ln : loans) loanIds.add(ln.Id);

            Map<Id, List<LLC_BI__Loan_Collateral2__c>> pledgesByLoan = new Map<Id, List<LLC_BI__Loan_Collateral2__c>>();
            List<LLC_BI__Loan_Collateral2__c> pledges = [
                SELECT Id, LLC_BI__Loan__c, LLC_BI__Collateral_Type__c, LLC_BI__Collateral_Value__c,
                       LLC_BI__Advance_Rate__c, LLC_BI__Current_Lendable_Value__c,
                       LLC_BI__Lien_Position__c, LLC_BI__Pledged_Status__c, LLC_BI__Is_Primary__c
                FROM LLC_BI__Loan_Collateral2__c
                WHERE LLC_BI__Loan__c IN :loanIds
                  AND LLC_BI__Is_Excluded__c = false
                  AND LLC_BI__Abundance_of_Caution__c = false
                WITH USER_MODE
            ];
            for (LLC_BI__Loan_Collateral2__c p : pledges) {
                if (!pledgesByLoan.containsKey(p.LLC_BI__Loan__c)) {
                    pledgesByLoan.put(p.LLC_BI__Loan__c, new List<LLC_BI__Loan_Collateral2__c>());
                }
                pledgesByLoan.get(p.LLC_BI__Loan__c).add(p);
            }

            for (LLC_BI__Loan__c ln : loans) {
                Facility f = new Facility();
                f.loanId = ln.Id;
                f.name = ln.Name;
                f.productType = ln.LLC_BI__Product_Type__c;
                f.riskGrade = ln.LLC_BI__Risk_Grade__c;
                f.committed = ln.LLC_BI__Amount__c != null ? ln.LLC_BI__Amount__c : 0;
                f.outstanding = ln.LLC_BI__AmountOutstanding__c != null ? ln.LLC_BI__AmountOutstanding__c : 0;
                f.available = ln.LLC_BI__Amount_Available__c != null ? ln.LLC_BI__Amount_Available__c : 0;
                f.maturityDate = ln.LLC_BI__Maturity_Date__c != null ? String.valueOf(ln.LLC_BI__Maturity_Date__c) : null;
                f.interestRate = ln.LLC_BI__Current_Interest_Rate__c;

                f.collateral = new List<CollateralPledge>();
                Decimal lendableTotal = 0;
                List<LLC_BI__Loan_Collateral2__c> loanPledges = pledgesByLoan.containsKey(ln.Id)
                    ? pledgesByLoan.get(ln.Id) : new List<LLC_BI__Loan_Collateral2__c>();
                for (LLC_BI__Loan_Collateral2__c p : loanPledges) {
                    CollateralPledge cp = new CollateralPledge();
                    cp.loanId = ln.Id;
                    cp.collateralType = p.LLC_BI__Collateral_Type__c;
                    cp.collateralValue = p.LLC_BI__Collateral_Value__c;
                    cp.advanceRate = p.LLC_BI__Advance_Rate__c;
                    cp.currentLendableValue = p.LLC_BI__Current_Lendable_Value__c;
                    cp.lienPosition = p.LLC_BI__Lien_Position__c;
                    cp.pledgedStatus = p.LLC_BI__Pledged_Status__c;
                    cp.isPrimary = p.LLC_BI__Is_Primary__c;
                    if (cp.currentLendableValue != null) lendableTotal += cp.currentLendableValue;
                    f.collateral.add(cp);
                }
                f.totalLendableValue = lendableTotal;
                f.coverageRatio = (f.outstanding > 0 && lendableTotal > 0)
                    ? (lendableTotal / f.outstanding).setScale(2) : null;
                f.coverageShortfall = (f.outstanding > 0) && (lendableTotal < f.outstanding);

                res.totalCommitted += f.committed;
                res.totalOutstanding += f.outstanding;
                res.totalAvailable += f.available;
                res.facilities.add(f);
            }

            res.note = 'Coverage uses Current_Lendable_Value (value x advance rate, org-computed); pledges flagged Excluded or Abundance-of-Caution are dropped from the math.';
            results.add(res);
        }

        return results;
    }
}
