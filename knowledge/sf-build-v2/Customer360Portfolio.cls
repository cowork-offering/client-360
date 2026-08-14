/**
 * Customer360Portfolio — MCP tool: the whole L1 Portfolio Home in one call.
 *
 * Replaces the SearchAccounts + N×Snapshot loop: one invocation returns every
 * account that has ≥1 Product Package (rolled up), the book totals, and a
 * bounded book-wide early-warning signals block. The agent bakes this straight
 * into the L1 ribbon + account list + concentration + reviews/EWS cells.
 *
 * ROLLUP RULE (same as Customer360Snapshot): exposure is summed from the
 * PACKAGE-level TCE/TBE/TOE/Outstanding fields, NEVER from Loan amounts —
 * nCino's limit/sublimit structure double-counts a naive loan sum (verified on
 * Piedmont: 3 facilities sum to more than TCE). riskRating + stage per account
 * come from the highest-TCE package for that account, identical to the Snapshot
 * "primary" rule.
 *
 * GOVERNOR DISCIPLINE: ≤4 SOQL, all bounded, none in loops.
 *   Q1  Product Packages across the book (drives accounts[] + bookTotals)
 *   Q2  Active covenants across the book (drives covenantsDueSoon + breachedCount,
 *       both filtered in-Apex from one result set)
 *   Q3  Open loans with a maturity inside the window (drives maturitiesSoon)
 * The account-name lookups for the signal blocks piggyback on the Account
 * relationship fields already selected in Q2/Q3 — no extra query.
 *
 * SIGNALS ARE BOUNDED, not exhaustive: covenantsDueSoon / maturitiesSoon are
 * capped at 25 rows each and clipped to signalWindowDays (default 90). Covenant
 * "overdue" means Next_Evaluation_Date is in the past AND still active (nCino
 * hasn't re-evaluated) — these are INCLUDED and flagged overdue=true. Full
 * financial / behavioral / risk-migration EWS lives elsewhere in the fleet.
 *
 * All objects/fields verified live against the bankinggpt sandbox
 * (sf sobject describe, 2026-07-02). See the Customer360 mcpServerDefinition
 * header for the API Catalog / apiIdentifier provenance note.
 */
global with sharing class Customer360Portfolio {

    global class Request {
        @InvocableVariable(label='Industry (exact picklist value)' description='Optional exact Industry filter on the account. Omit for the whole book.')
        global String industry;
        @InvocableVariable(label='Max Accounts' description='Max account rows returned (sorted by TCE desc). Default 25, capped at 100.')
        global Integer maxAccounts;
        @InvocableVariable(label='Signal Window (days)' description='Window for covenant tests due and maturities. Default 90.')
        global Integer signalWindowDays;
    }

    global class PortfolioAccount {
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
        @InvocableVariable(label='Total Credit Exposure (sum of Package TCE)')
        global Decimal tce;
        @InvocableVariable(label='Total Borrower Exposure (sum of Package TBE)')
        global Decimal tbe;
        @InvocableVariable(label='Total Obligor Exposure (sum of Package TOE)')
        global Decimal toe;
        @InvocableVariable(label='Outstanding (sum of Package Outstanding)')
        global Decimal outstanding;
        @InvocableVariable(label='Risk Rating (highest-TCE package)')
        global String riskRating;
        @InvocableVariable(label='Credit Stage (highest-TCE package)')
        global String stage;
        @InvocableVariable(label='Number of Product Packages')
        global Integer packageCount;
    }

    global class BookTotals {
        @InvocableVariable(label='Total Committed (sum of account TCE)')
        global Decimal totalCommitted;
        @InvocableVariable(label='Total Outstanding')
        global Decimal totalOutstanding;
        @InvocableVariable(label='Account Count')
        global Integer accountCount;
        @InvocableVariable(label='Utilization % (outstanding / committed)')
        global Decimal utilizationPct;
    }

    global class CovenantDue {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Account Name')
        global String accountName;
        @InvocableVariable(label='Covenant Type')
        global String covenantType;
        @InvocableVariable(label='Next Evaluation Date')
        global String nextEvaluationDate;
        @InvocableVariable(label='Days Until Next Evaluation')
        global Integer daysUntilNextEvaluation;
        @InvocableVariable(label='Overdue' description='True when the next evaluation date is already in the past (still active — not yet re-evaluated).')
        global Boolean overdue;
    }

    global class MaturityDue {
        @InvocableVariable(label='Loan Id')
        global String loanId;
        @InvocableVariable(label='Loan Name')
        global String loanName;
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Account Name')
        global String accountName;
        @InvocableVariable(label='Maturity Date')
        global String maturityDate;
        @InvocableVariable(label='Days Until Maturity')
        global Integer daysUntilMaturity;
    }

    global class Signals {
        @InvocableVariable(label='Covenants Due Soon (capped 25)')
        global List<CovenantDue> covenantsDueSoon;
        @InvocableVariable(label='Breached Count (active + breached across book)')
        global Integer breachedCount;
        @InvocableVariable(label='Maturities Soon (capped 25)')
        global List<MaturityDue> maturitiesSoon;
    }

    global class Response {
        @InvocableVariable(label='Accounts')
        global List<PortfolioAccount> accounts;
        @InvocableVariable(label='Book Totals')
        global BookTotals bookTotals;
        @InvocableVariable(label='Signals')
        global Signals signals;
        @InvocableVariable(label='Note')
        global String note;
    }

    private static final Integer SIGNAL_CAP = 25;

    @InvocableMethod(
        label='Customer 360: Portfolio Home'
        description='The whole L1 portfolio in one call: every account with a Product Package (package-level TCE/TBE/TOE/Outstanding rollups, primary risk rating + stage), book totals with utilization, and a bounded book-wide early-warning block (covenant tests due, breached count, maturities) inside the signal window. Replaces the SearchAccounts + per-account Snapshot loop.'
    )
    global static List<Response> run(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Integer cap = req.maxAccounts != null ? Math.min(req.maxAccounts, 100) : 25;
            Integer windowDays = req.signalWindowDays != null ? req.signalWindowDays : 90;
            Boolean filterIndustry = String.isNotBlank(req.industry);

            Response res = new Response();

            // -- Q1: Product Packages across the book, keyed to the primary Account --
            List<LLC_BI__Product_Package__c> pkgs;
            if (filterIndustry) {
                pkgs = [
                    SELECT LLC_BI__Account__c, LLC_BI__Account__r.Name, LLC_BI__Account__r.Industry,
                           LLC_BI__Account__r.NAICS_Code__c, LLC_BI__Account__r.AnnualRevenue,
                           LLC_BI__TCE__c, LLC_BI__TBE__c, LLC_BI__TOE__c, LLC_BI__Outstanding__c,
                           LLC_BI__Risk_Rating__c, cm_Credit_Stage__c
                    FROM LLC_BI__Product_Package__c
                    WHERE LLC_BI__Account__c != null
                      AND LLC_BI__Account__r.Industry = :req.industry
                    WITH USER_MODE
                ];
            } else {
                pkgs = [
                    SELECT LLC_BI__Account__c, LLC_BI__Account__r.Name, LLC_BI__Account__r.Industry,
                           LLC_BI__Account__r.NAICS_Code__c, LLC_BI__Account__r.AnnualRevenue,
                           LLC_BI__TCE__c, LLC_BI__TBE__c, LLC_BI__TOE__c, LLC_BI__Outstanding__c,
                           LLC_BI__Risk_Rating__c, cm_Credit_Stage__c
                    FROM LLC_BI__Product_Package__c
                    WHERE LLC_BI__Account__c != null
                    WITH USER_MODE
                ];
            }

            // Roll up in an Apex map keyed by account.
            Map<Id, PortfolioAccount> byAccount = new Map<Id, PortfolioAccount>();
            Map<Id, Decimal> highestTceByAccount = new Map<Id, Decimal>();
            for (LLC_BI__Product_Package__c pkg : pkgs) {
                Id acctId = pkg.LLC_BI__Account__c;
                PortfolioAccount pa = byAccount.get(acctId);
                if (pa == null) {
                    pa = new PortfolioAccount();
                    pa.accountId = acctId;
                    if (pkg.LLC_BI__Account__r != null) {
                        pa.name = pkg.LLC_BI__Account__r.Name;
                        pa.industry = pkg.LLC_BI__Account__r.Industry;
                        pa.naicsCode = pkg.LLC_BI__Account__r.NAICS_Code__c;
                        pa.annualRevenue = pkg.LLC_BI__Account__r.AnnualRevenue;
                    }
                    pa.tce = 0;
                    pa.tbe = 0;
                    pa.toe = 0;
                    pa.outstanding = 0;
                    pa.packageCount = 0;
                    byAccount.put(acctId, pa);
                    highestTceByAccount.put(acctId, -1);
                }
                if (pkg.LLC_BI__TCE__c != null) pa.tce += pkg.LLC_BI__TCE__c;
                if (pkg.LLC_BI__TBE__c != null) pa.tbe += pkg.LLC_BI__TBE__c;
                if (pkg.LLC_BI__TOE__c != null) pa.toe += pkg.LLC_BI__TOE__c;
                if (pkg.LLC_BI__Outstanding__c != null) pa.outstanding += pkg.LLC_BI__Outstanding__c;
                pa.packageCount += 1;

                Decimal pkgTce = pkg.LLC_BI__TCE__c != null ? pkg.LLC_BI__TCE__c : 0;
                if (pkgTce > highestTceByAccount.get(acctId)) {
                    highestTceByAccount.put(acctId, pkgTce);
                    pa.riskRating = pkg.LLC_BI__Risk_Rating__c;
                    pa.stage = pkg.cm_Credit_Stage__c;
                }
            }

            // Book totals span EVERY account with a package (before the display truncation).
            BookTotals bt = new BookTotals();
            bt.totalCommitted = 0;
            bt.totalOutstanding = 0;
            bt.accountCount = byAccount.size();
            for (PortfolioAccount pa : byAccount.values()) {
                bt.totalCommitted += pa.tce;
                bt.totalOutstanding += pa.outstanding;
            }
            bt.utilizationPct = (bt.totalCommitted != null && bt.totalCommitted > 0)
                ? (bt.totalOutstanding / bt.totalCommitted * 100).setScale(1)
                : null;
            res.bookTotals = bt;

            // Sort by TCE desc, truncate to the cap.
            List<PortfolioAccount> sorted = byAccount.values();
            sorted.sort(new ByTceDesc());
            res.accounts = new List<PortfolioAccount>();
            for (Integer i = 0; i < sorted.size() && i < cap; i++) {
                res.accounts.add(sorted[i]);
            }

            // -- Signals: bounded book-wide early-warning --
            Signals sig = new Signals();
            sig.covenantsDueSoon = new List<CovenantDue>();
            sig.maturitiesSoon = new List<MaturityDue>();
            sig.breachedCount = 0;

            Date today = Date.today();
            Date windowEnd = today.addDays(windowDays);

            // -- Q2: Active covenants across the book (breachedCount + covenantsDueSoon) --
            List<LLC_BI__Covenant2__c> covs = [
                SELECT LLC_BI__Account__c, LLC_BI__Account__r.Name, LLC_BI__Covenant_Type__r.Name,
                       LLC_BI__Next_Evaluation_Date__c, LLC_BI__Breached__c
                FROM LLC_BI__Covenant2__c
                WHERE LLC_BI__Active__c = true
                WITH USER_MODE
                ORDER BY LLC_BI__Next_Evaluation_Date__c ASC NULLS LAST
            ];
            for (LLC_BI__Covenant2__c c : covs) {
                if (c.LLC_BI__Breached__c == true) sig.breachedCount += 1;

                Date nextEval = c.LLC_BI__Next_Evaluation_Date__c;
                if (nextEval == null || nextEval > windowEnd) continue;
                if (sig.covenantsDueSoon.size() >= SIGNAL_CAP) continue;

                CovenantDue cd = new CovenantDue();
                cd.accountId = c.LLC_BI__Account__c;
                cd.accountName = c.LLC_BI__Account__r != null ? c.LLC_BI__Account__r.Name : null;
                cd.covenantType = c.LLC_BI__Covenant_Type__r != null ? c.LLC_BI__Covenant_Type__r.Name : null;
                cd.nextEvaluationDate = String.valueOf(nextEval);
                cd.daysUntilNextEvaluation = today.daysBetween(nextEval);
                cd.overdue = nextEval < today;
                sig.covenantsDueSoon.add(cd);
            }

            // -- Q3: Open loans maturing inside the window --
            List<LLC_BI__Loan__c> loans = [
                SELECT Id, Name, LLC_BI__Account__c, LLC_BI__Account__r.Name, LLC_BI__Maturity_Date__c
                FROM LLC_BI__Loan__c
                WHERE LLC_BI__Status__c != 'Closed'
                  AND LLC_BI__Maturity_Date__c != null
                  AND LLC_BI__Maturity_Date__c <= :windowEnd
                  AND LLC_BI__Maturity_Date__c >= :today
                WITH USER_MODE
                ORDER BY LLC_BI__Maturity_Date__c ASC
                LIMIT 25
            ];
            for (LLC_BI__Loan__c ln : loans) {
                MaturityDue md = new MaturityDue();
                md.loanId = ln.Id;
                md.loanName = ln.Name;
                md.accountId = ln.LLC_BI__Account__c;
                md.accountName = ln.LLC_BI__Account__r != null ? ln.LLC_BI__Account__r.Name : null;
                md.maturityDate = String.valueOf(ln.LLC_BI__Maturity_Date__c);
                md.daysUntilMaturity = today.daysBetween(ln.LLC_BI__Maturity_Date__c);
                sig.maturitiesSoon.add(md);
            }

            res.signals = sig;

            res.note = res.accounts.isEmpty()
                ? 'No accounts with a Product Package match this filter.'
                : 'Rollups are package-level (Σ TCE/TBE/TOE/Outstanding — never a loan sum); risk rating + stage are from each account\'s highest-TCE package. Book totals span all ' + bt.accountCount + ' packaged accounts; the account list is truncated to the highest-TCE ' + res.accounts.size() + '. Signals are bounded by a ' + windowDays + '-day window and capped at ' + SIGNAL_CAP + ' rows each; overdue covenants (past due, still active) are included and flagged. Financial / behavioral / risk-migration EWS lives elsewhere in the fleet.';

            results.add(res);
        }

        return results;
    }

    private class ByTceDesc implements Comparator<PortfolioAccount> {
        public Integer compare(PortfolioAccount a, PortfolioAccount b) {
            Decimal at = a.tce != null ? a.tce : 0;
            Decimal bt = b.tce != null ? b.tce : 0;
            if (at < bt) return 1;
            if (at > bt) return -1;
            return 0;
        }
    }
}
