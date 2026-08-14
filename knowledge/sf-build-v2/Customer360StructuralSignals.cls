/**
 * Customer360StructuralSignals — MCP tool: nCino-native structural EWS signals.
 *
 * SCOPE IS DELIBERATELY NARROW (architecture review + EARLY-WARNING.md): this
 * tool supplies ONLY the structural signal class that is native to nCino/FSC
 * and not already covered elsewhere in the fleet:
 *   - Modification clustering (a pattern of mods is the tell, not one mod)
 *   - Renewal / maturity proximity
 *   - Guarantor distress (the guarantor's OWN account risk signals)
 *
 * Explicitly OUT of scope here (these already exist elsewhere — duplicating
 * them would be wrong, not just redundant):
 *   - Covenant breach / thin headroom -> deal_covenant_grade (experience-mcp)
 *     and Customer360Covenants in this server
 *   - Financial deterioration (margin, leverage, DSCR) -> Boom MCP
 *   - Behavioral/servicing (utilization, delinquency) -> AFS MCP
 *   - Risk migration (rating, PD) -> Snowflake
 *   - Collateral shortfall -> Customer360Exposure in this server (owns that
 *     query so Loan_Collateral2 is read exactly once across the tool set)
 *
 * All fields verified live against the bankinggpt sandbox (sobject-sf MCP,
 * 2026-07-01).
 */
global with sharing class Customer360StructuralSignals {

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
        @InvocableVariable(label='Maturity Watch Window (days)' description='Flag facilities maturing within this many days. Default 270 if not set.')
        global Integer maturityWindowDays;
    }

    global class ModificationSignal {
        @InvocableVariable(label='Loan Id')
        global String loanId;
        @InvocableVariable(label='Mod Type')
        global String modType;
        @InvocableVariable(label='Modification Type')
        global String modificationType;
        @InvocableVariable(label='Status')
        global String status;
        @InvocableVariable(label='Effective Date')
        global String effectiveDate;
        @InvocableVariable(label='New Amount')
        global Decimal newAmount;
        @InvocableVariable(label='New Rate')
        global Decimal newRate;
    }

    global class RenewalSignal {
        @InvocableVariable(label='Renewal Id')
        global String renewalId;
        @InvocableVariable(label='Parent Loan Id')
        global String parentLoanId;
        @InvocableVariable(label='Revision Number')
        global Decimal revisionNumber;
        @InvocableVariable(label='Revision Status')
        global String revisionStatus;
        @InvocableVariable(label='Has Active Renewal Loan')
        global Boolean hasActiveRenewalLoan;
    }

    global class MaturityWatch {
        @InvocableVariable(label='Loan Id')
        global String loanId;
        @InvocableVariable(label='Name')
        global String name;
        @InvocableVariable(label='Maturity Date')
        global String maturityDate;
        @InvocableVariable(label='Days Until Maturity')
        global Integer daysUntilMaturity;
    }

    global class GuarantorDistress {
        @InvocableVariable(label='Guarantor Account Id')
        global String guarantorAccountId;
        @InvocableVariable(label='Guarantor Name')
        global String guarantorName;
        @InvocableVariable(label='Guarantor Risk Status')
        global String riskStatus;
        @InvocableVariable(label='Guarantor Highest Risk Grade')
        global String highestRiskGrade;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Modifications')
        global List<ModificationSignal> modifications;
        @InvocableVariable(label='Modification Cluster Flag' description='True when 2 or more modifications are on file — a pattern, not a single accommodation.')
        global Boolean modificationClusterFlag;
        @InvocableVariable(label='Renewals')
        global List<RenewalSignal> renewals;
        @InvocableVariable(label='Maturity Watch' description='Facilities maturing within the watch window.')
        global List<MaturityWatch> maturityWatch;
        @InvocableVariable(label='Guarantor Distress Signals')
        global List<GuarantorDistress> guarantorSignals;
        @InvocableVariable(label='Note')
        global String note;
    }

    @InvocableMethod(
        label='Customer 360: Structural EWS Signals'
        description='nCino-native structural early-warning signals only: modification clustering, renewal/maturity proximity, and guarantor distress. Covenant, financial, behavioral, and risk-migration signals live in other fleet tools (deal_covenant_grade, Boom, AFS, Snowflake) — not duplicated here.'
    )
    global static List<Response> getStructuralSignals(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.modifications = new List<ModificationSignal>();
            res.renewals = new List<RenewalSignal>();
            res.maturityWatch = new List<MaturityWatch>();
            res.guarantorSignals = new List<GuarantorDistress>();
            Integer windowDays = req.maturityWindowDays != null ? req.maturityWindowDays : 270;

            List<LLC_BI__Loan__c> loans = [
                SELECT Id, Name, LLC_BI__Maturity_Date__c, LLC_BI__Product_Package__c
                FROM LLC_BI__Loan__c
                WHERE LLC_BI__Account__c = :req.accountId
                  AND LLC_BI__Status__c != 'Closed'
                WITH USER_MODE
            ];
            if (loans.isEmpty()) {
                res.note = 'No active facilities found for this account.';
                results.add(res);
                continue;
            }
            Set<Id> loanIds = new Set<Id>();
            Set<Id> packageIds = new Set<Id>();
            for (LLC_BI__Loan__c ln : loans) {
                loanIds.add(ln.Id);
                if (ln.LLC_BI__Product_Package__c != null) packageIds.add(ln.LLC_BI__Product_Package__c);

                Date maturity = ln.LLC_BI__Maturity_Date__c;
                if (maturity != null) {
                    Integer daysOut = Date.today().daysBetween(maturity);
                    if (daysOut >= 0 && daysOut <= windowDays) {
                        MaturityWatch mw = new MaturityWatch();
                        mw.loanId = ln.Id;
                        mw.name = ln.Name;
                        mw.maturityDate = String.valueOf(maturity);
                        mw.daysUntilMaturity = daysOut;
                        res.maturityWatch.add(mw);
                    }
                }
            }

            List<LLC_BI__Loan_Modification__c> mods = [
                SELECT Id, LLC_BI__Loan__c, LLC_BI__Mod_Type__c, LLC_BI__Modification_Type__c,
                       LLC_BI__Status__c, LLC_BI__Effective_Date__c, LLC_BI__New_Amount__c, LLC_BI__New_Rate__c
                FROM LLC_BI__Loan_Modification__c
                WHERE LLC_BI__Loan__c IN :loanIds
                WITH USER_MODE
                ORDER BY LLC_BI__Effective_Date__c DESC NULLS LAST
            ];
            for (LLC_BI__Loan_Modification__c m : mods) {
                ModificationSignal ms = new ModificationSignal();
                ms.loanId = m.LLC_BI__Loan__c;
                ms.modType = m.LLC_BI__Mod_Type__c;
                ms.modificationType = m.LLC_BI__Modification_Type__c;
                ms.status = m.LLC_BI__Status__c;
                ms.effectiveDate = m.LLC_BI__Effective_Date__c != null ? String.valueOf(m.LLC_BI__Effective_Date__c) : null;
                ms.newAmount = m.LLC_BI__New_Amount__c;
                ms.newRate = m.LLC_BI__New_Rate__c;
                res.modifications.add(ms);
            }
            res.modificationClusterFlag = res.modifications.size() >= 2;

            List<LLC_BI__LoanRenewal__c> renewalRows = [
                SELECT Id, LLC_BI__ParentLoanId__c, LLC_BI__RevisionNumber__c,
                       LLC_BI__RevisionStatus__c, LLC_BI__HasActiveRenewalLoan__c
                FROM LLC_BI__LoanRenewal__c
                WHERE LLC_BI__ParentLoanId__c IN :loanIds
                   OR LLC_BI__Original_Product_Package__c IN :packageIds
                WITH USER_MODE
            ];
            for (LLC_BI__LoanRenewal__c r : renewalRows) {
                RenewalSignal rs = new RenewalSignal();
                rs.renewalId = r.Id;
                rs.parentLoanId = r.LLC_BI__ParentLoanId__c;
                rs.revisionNumber = r.LLC_BI__RevisionNumber__c;
                rs.revisionStatus = r.LLC_BI__RevisionStatus__c;
                rs.hasActiveRenewalLoan = r.LLC_BI__HasActiveRenewalLoan__c;
                res.renewals.add(rs);
            }

            List<LLC_BI__Legal_Entities__c> guarantorLinks = [
                SELECT LLC_BI__Account__c, LLC_BI__Account__r.Name,
                       LLC_BI__Account__r.Risk_Status__c, LLC_BI__Account__r.LLC_BI__Highest_Risk_Grade__c
                FROM LLC_BI__Legal_Entities__c
                WHERE LLC_BI__Loan__c IN :loanIds
                  AND LLC_BI__Borrower_Type__c IN ('Guarantor', 'Limited Guarantor')
                WITH USER_MODE
            ];
            for (LLC_BI__Legal_Entities__c g : guarantorLinks) {
                if (g.LLC_BI__Account__c == null) continue;
                GuarantorDistress gd = new GuarantorDistress();
                gd.guarantorAccountId = g.LLC_BI__Account__c;
                gd.guarantorName = g.LLC_BI__Account__r != null ? g.LLC_BI__Account__r.Name : null;
                gd.riskStatus = g.LLC_BI__Account__r != null ? g.LLC_BI__Account__r.Risk_Status__c : null;
                gd.highestRiskGrade = g.LLC_BI__Account__r != null ? g.LLC_BI__Account__r.LLC_BI__Highest_Risk_Grade__c : null;
                res.guarantorSignals.add(gd);
            }

            res.note = 'Covenant / financial / behavioral / risk-migration signals are not in this tool — pull deal_covenant_grade, Boom, AFS, and Snowflake separately and compose at the agent layer.';
            results.add(res);
        }

        return results;
    }
}
