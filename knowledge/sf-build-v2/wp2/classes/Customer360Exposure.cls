/**
 * Customer360Exposure — MCP tool: facilities + collateral coverage.
 *
 * This tool OWNS the collateral query and the coverage computation (architecture review: avoids the
 * structural-signals tool re-querying the same Loan_Collateral2 rows — one owner per object, no
 * duplicate reads).
 *
 * ---------------------------------------------------------------------------------------------
 * THE THREE READS THIS CLASS PINS, AND WHY (all evidenced against bankinggpt, 2026-07-28)
 * ---------------------------------------------------------------------------------------------
 *
 * 1. OUTSTANDING = LLC_BI__Principal_Balance__c.
 *    LLC_BI__AmountOutstanding__c is populated on 1 of 542 loans org-wide, and on that single loan
 *    it reads 0 while Principal_Balance reads 124,887 — so preferring it would report a drawn
 *    facility as undrawn. Principal_Balance is populated on 203 loans, and summing it across
 *    Hartwell's six facilities reproduces the org's own package rollup to the dollar
 *    (31,030,000 outstanding / 14,970,000 unused). nCino's own booked-loan LTV formula uses
 *    Principal Balance too (help article kAHHu000000Xb1JOAS). AmountOutstanding is kept only as a
 *    belt for the case Principal_Balance is null and AmountOutstanding is not; that combination
 *    occurs on 0 loans today, so the fallback is documented insurance, not observed behaviour.
 *    LLC_BI__Amount_Available__c is deliberately NOT read: it is a formula over AmountOutstanding
 *    and is therefore blank wherever the balance actually lives. Available is computed here.
 *
 * 2. THE FACILITY'S COVERAGE USES THE PLEDGED SHARE, NOT THE WHOLE COLLATERAL.
 *    LLC_BI__Current_Lendable_Value__c on a pledge carries the value of the ENTIRE collateral at
 *    that pledge's advance rate, not the slice allocated to this facility. Three of Hartwell's four
 *    assets are pledged to two facilities each, so summing it per facility double-counts:
 *    59.2MM claimed against 31.6MM of real lendable value. The facility's own share is
 *    LLC_BI__Amount_Pledged__c, and across Hartwell those shares sum to exactly the unique
 *    lendable total. An overstated coverage ratio on a credit surface is worse than a blank one,
 *    so coverage divides the pledged share, and the per-pledge display keeps the collateral's own
 *    identity (value, advance rate, whole lendable value) alongside amountPledged.
 *    When Amount_Pledged is null on a pledge we count in, the share is UNKNOWN: coverage returns
 *    null with a stated reason, never a guess. There is no org convention that null means "the
 *    whole asset" — exactly 1 of 15 pledges org-wide is null, and on that row
 *    Original_Lendable_Value (34,000) and Current_Lendable_Value (80,788.50) disagree, so nothing
 *    in the data licenses an inference either way.
 *
 * 3. ONE ADVANCE RATE, ONE SOURCE: the pledge's LLC_BI__Advance_Rate__c.
 *    That field is nCino's own formula and it already resolves the precedence
 *    Advance_Rate_Override -> Auto_Applied_Advance_Rate -> the collateral type's default rate.
 *    The COLLATERAL record carries a different formula (the collateral type's rate only), which in
 *    this org reads 80% on assets whose pledges are overridden to 50% and 75%. Any surface mixing
 *    the two shows two different lendable values for one asset, so this class reads the pledge side
 *    and only the pledge side, and reports which arm of the formula won in advanceRateSource.
 *    Verified: collateralValue x that advance rate reproduces currentLendableValue exactly on 14 of
 *    the org's 15 pledges (the 15th has a zero-valued collateral and a null lendable value).
 *
 * Relationship totals DEDUPE by collateral id. A cross-pledged asset contributes its lendable value
 * once; where two pledges of one asset disagree on that value the LOWER figure is taken, because a
 * credit surface may understate coverage and may never overstate it.
 *
 * Collateral: LLC_BI__Loan_Collateral2__c is the MODERN pledge object — LLC_BI__Loan_Collateral__c
 * (legacy) is empty org-wide, never queried here. Pledges flagged Is_Excluded__c or
 * Abundance_of_Caution__c do not secure / are out of LTV and are dropped from both the math and the
 * displayed pledge list; the facility says so in coverageNote instead of showing an unexplained blank.
 */
global with sharing class Customer360Exposure {

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
    }

    global class CollateralPledge {
        @InvocableVariable(label='Loan Id')
        global String loanId;
        @InvocableVariable(label='Collateral Id' description='The collateral record itself, not the pledge junction. stage_collateral_valuation anchors on this id, and the client fails closed without it.')
        global String collateralId;
        @InvocableVariable(label='Collateral Name' description='The org-assigned collateral name, for example COL-000758, so the banker can tell two pledges apart before choosing one.')
        global String collateralName;
        @InvocableVariable(label='Collateral Description' description='What the collateral actually is, so the UI can show "Eligible Accounts Receivable" rather than COL-000762. Null when the record carries no description.')
        global String collateralDescription;
        @InvocableVariable(label='Collateral Type')
        global String collateralType;
        @InvocableVariable(label='Collateral Value')
        global Decimal collateralValue;
        @InvocableVariable(label='Advance Rate')
        global Decimal advanceRate;
        @InvocableVariable(label='Current Lendable Value' description='The WHOLE collateral\'s lendable value at this pledge\'s advance rate, which is what the org stores. It repeats on every pledge of a cross-pledged asset, so it must never be summed across facilities. Use amountPledged for this facility\'s share.')
        global Decimal currentLendableValue;
        @InvocableVariable(label='Amount Pledged' description='This facility\'s share of the collateral, and the figure the facility coverage math divides. Null when the org never recorded a share, in which case coverage is reported as not computable rather than guessed.')
        global Decimal amountPledged;
        @InvocableVariable(label='Advance Rate Source' description='Which arm of nCino\'s advance-rate formula produced the rate shown: a pledge-level override, an auto-applied rate, or the collateral type default. Makes the one-source rule auditable on screen.')
        global String advanceRateSource;
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
        @InvocableVariable(label='Product Package Id' description='The package THIS facility belongs to. A modification or renewal must anchor on the selected facility\'s own package: anchoring on the relationship snapshot instead would let a facility from another package stage against the wrong deal.')
        global String productPackageId;
        @InvocableVariable(label='Stage' description='The nCino Loan stage. The cockpit availability predicate needs this: a credit action only accepts a Booked facility, so without the stage the predicate fails closed.')
        global String stage;
        @InvocableVariable(label='Status' description='The nCino Loan status, read alongside the stage because a credit action requires Booked AND Open.')
        global String status;
        @InvocableVariable(label='Risk Grade')
        global String riskGrade;
        @InvocableVariable(label='Committed (Original Amount)')
        global Decimal committed;
        @InvocableVariable(label='Outstanding (Principal Balance)')
        global Decimal outstanding;
        @InvocableVariable(label='Available')
        global Decimal available;
        @InvocableVariable(label='Maturity Date')
        global String maturityDate;
        @InvocableVariable(label='Current Interest Rate')
        global Decimal interestRate;
        @InvocableVariable(label='Total Lendable Value (this facility\'s PLEDGED SHARE)' description='The lendable value actually allocated to this facility: the sum of Amount Pledged across the pledges that count. Null when a pledge on this facility records no share, so the figure is unknown rather than zero.')
        global Decimal totalLendableValue;
        @InvocableVariable(label='Total Pledged Value' description='Unambiguous name for the same figure as totalLendableValue: this facility\'s pledged share, never the whole collateral. Present so a client can bind to a name that cannot be mistaken for a gross collateral total.')
        global Decimal totalPledgedValue;
        @InvocableVariable(label='Coverage Ratio (pledged share / outstanding)')
        global Decimal coverageRatio;
        @InvocableVariable(label='Coverage Shortfall' description='True when the pledged share securing this facility is below its outstanding balance.')
        global Boolean coverageShortfall;
        @InvocableVariable(label='Coverage Note' description='Anything the numbers alone do not say, in banker prose: why there is no ratio (nothing pledged, every pledge excluded, no balance, an unrecorded pledged share), or that some pledges were dropped from a ratio that did compute. Null when the ratio computed and nothing was dropped.')
        global String coverageNote;
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
        @InvocableVariable(label='Total Unique Collateral Lendable Value' description='Lendable value of the DISTINCT collateral behind this relationship, counted once per collateral record. Summing the facilities instead would repeat every cross-pledged asset.')
        global Decimal totalUniqueCollateralLendableValue;
        @InvocableVariable(label='Unique Collateral Count')
        global Integer uniqueCollateralCount;
        @InvocableVariable(label='Coverage Ratio (unique collateral lendable / total outstanding)')
        global Decimal coverageRatio;
        @InvocableVariable(label='Coverage Shortfall' description='True when the distinct collateral behind the relationship is worth less than the total outstanding balance.')
        global Boolean coverageShortfall;
        @InvocableVariable(label='Facilities')
        global List<Facility> facilities;
        @InvocableVariable(label='Note')
        global String note;
    }

    private static final String BASE_NOTE =
        'Outstanding reads LLC_BI__Principal_Balance__c, the balance field this org populates '
        + '(LLC_BI__AmountOutstanding__c is a fallback only). Available = committed - outstanding, floored at zero. '
        + 'Facility coverage divides the facility\'s PLEDGED SHARE (LLC_BI__Amount_Pledged__c), never the whole '
        + 'collateral\'s lendable value, which every pledge of a cross-pledged asset repeats. Relationship coverage '
        + 'divides the lendable value of the DISTINCT collateral, deduped by collateral id. Advance rate comes from '
        + 'one source, the pledge\'s LLC_BI__Advance_Rate__c (override, then auto-applied, then collateral type). '
        + 'Pledges flagged Excluded or Abundance-of-Caution are dropped from the math.';

    /**
     * Returns every non-closed facility on the account with its collateral pledges, a per-facility
     * coverage ratio computed from the pledged share, and a relationship-level coverage ratio
     * computed from the distinct collateral behind the whole relationship.
     *
     * @param requests One Request per account to read. Bulk-safe in shape; the cockpit sends one.
     * @return One Response per Request, positionally aligned, never null.
     */
    @InvocableMethod(
        label='Customer 360: Exposure and Collateral'
        description='Active facilities (committed/outstanding/available) per loan, with collateral pledges, a per-facility coverage ratio computed from the pledged share, and a relationship coverage ratio computed from the distinct collateral. Uses the modern collateral object only (legacy is empty in this org).'
    )
    global static List<Response> getExposure(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.totalCommitted = 0;
            res.totalOutstanding = 0;
            res.totalAvailable = 0;
            res.totalUniqueCollateralLendableValue = 0;
            res.uniqueCollateralCount = 0;
            res.coverageShortfall = false;
            res.facilities = new List<Facility>();

            List<LLC_BI__Loan__c> loans = [
                SELECT Id, Name, LLC_BI__Product_Type__c, LLC_BI__Risk_Grade__c, LLC_BI__Stage__c,
                       LLC_BI__Product_Package__c,
                       LLC_BI__Amount__c, LLC_BI__Principal_Balance__c, LLC_BI__AmountOutstanding__c,
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

            // Excluded and Abundance-of-Caution pledges are filtered in Apex rather than in SOQL so
            // the facility can say how many were dropped instead of rendering an unexplained blank.
            Map<Id, List<LLC_BI__Loan_Collateral2__c>> pledgesByLoan = new Map<Id, List<LLC_BI__Loan_Collateral2__c>>();
            Map<Id, Integer> droppedByLoan = new Map<Id, Integer>();
            for (LLC_BI__Loan_Collateral2__c p : [
                SELECT Id, LLC_BI__Loan__c, LLC_BI__Collateral__c, LLC_BI__Collateral__r.Name,
                       LLC_BI__Collateral__r.LLC_BI__Description__c,
                       LLC_BI__Collateral_Type__c, LLC_BI__Collateral_Value__c,
                       LLC_BI__Advance_Rate__c, LLC_BI__Advance_Rate_Override__c,
                       LLC_BI__Auto_Applied_Advance_Rate__c,
                       LLC_BI__Current_Lendable_Value__c, LLC_BI__Amount_Pledged__c,
                       LLC_BI__Lien_Position__c, LLC_BI__Pledged_Status__c, LLC_BI__Is_Primary__c,
                       LLC_BI__Is_Excluded__c, LLC_BI__Abundance_of_Caution__c
                FROM LLC_BI__Loan_Collateral2__c
                WHERE LLC_BI__Loan__c IN :loanIds
                WITH USER_MODE
            ]) {
                if (p.LLC_BI__Is_Excluded__c || p.LLC_BI__Abundance_of_Caution__c) {
                    Integer prior = droppedByLoan.containsKey(p.LLC_BI__Loan__c) ? droppedByLoan.get(p.LLC_BI__Loan__c) : 0;
                    droppedByLoan.put(p.LLC_BI__Loan__c, prior + 1);
                    continue;
                }
                if (!pledgesByLoan.containsKey(p.LLC_BI__Loan__c)) {
                    pledgesByLoan.put(p.LLC_BI__Loan__c, new List<LLC_BI__Loan_Collateral2__c>());
                }
                pledgesByLoan.get(p.LLC_BI__Loan__c).add(p);
            }

            // Relationship rollup: one entry per DISTINCT collateral, holding the lowest lendable
            // value any counted pledge claims for it.
            Map<Id, Decimal> lendableByCollateral = new Map<Id, Decimal>();
            Boolean collateralPoolIncomplete = false;

            for (LLC_BI__Loan__c ln : loans) {
                Facility f = new Facility();
                f.loanId = ln.Id;
                f.name = ln.Name;
                f.productType = ln.LLC_BI__Product_Type__c;
                f.productPackageId = ln.LLC_BI__Product_Package__c;
                f.stage = ln.LLC_BI__Stage__c;
                f.status = ln.LLC_BI__Status__c;
                f.riskGrade = ln.LLC_BI__Risk_Grade__c;
                f.committed = ln.LLC_BI__Amount__c != null ? ln.LLC_BI__Amount__c : 0;
                f.outstanding = balanceOf(ln);
                f.available = f.committed - f.outstanding;
                if (f.available < 0) f.available = 0;
                f.maturityDate = ln.LLC_BI__Maturity_Date__c != null ? String.valueOf(ln.LLC_BI__Maturity_Date__c) : null;
                f.interestRate = ln.LLC_BI__Current_Interest_Rate__c;

                f.collateral = new List<CollateralPledge>();
                Decimal pledgedShare = 0;
                Integer shareUnknown = 0;
                List<LLC_BI__Loan_Collateral2__c> loanPledges = pledgesByLoan.containsKey(ln.Id)
                    ? pledgesByLoan.get(ln.Id) : new List<LLC_BI__Loan_Collateral2__c>();

                for (LLC_BI__Loan_Collateral2__c p : loanPledges) {
                    CollateralPledge cp = new CollateralPledge();
                    cp.loanId = ln.Id;
                    cp.collateralId = p.LLC_BI__Collateral__c;
                    cp.collateralName = p.LLC_BI__Collateral__r != null ? p.LLC_BI__Collateral__r.Name : null;
                    cp.collateralDescription = p.LLC_BI__Collateral__r != null ? p.LLC_BI__Collateral__r.LLC_BI__Description__c : null;
                    cp.collateralType = p.LLC_BI__Collateral_Type__c;
                    cp.collateralValue = p.LLC_BI__Collateral_Value__c;
                    cp.advanceRate = p.LLC_BI__Advance_Rate__c;
                    cp.advanceRateSource = advanceRateSourceOf(p);
                    cp.currentLendableValue = p.LLC_BI__Current_Lendable_Value__c;
                    cp.amountPledged = p.LLC_BI__Amount_Pledged__c;
                    cp.lienPosition = p.LLC_BI__Lien_Position__c;
                    cp.pledgedStatus = p.LLC_BI__Pledged_Status__c;
                    cp.isPrimary = p.LLC_BI__Is_Primary__c;
                    f.collateral.add(cp);

                    if (p.LLC_BI__Amount_Pledged__c != null) {
                        pledgedShare += p.LLC_BI__Amount_Pledged__c;
                    } else {
                        shareUnknown++;
                    }

                    if (p.LLC_BI__Current_Lendable_Value__c == null) {
                        collateralPoolIncomplete = true;
                    } else if (!lendableByCollateral.containsKey(p.LLC_BI__Collateral__c)
                               || p.LLC_BI__Current_Lendable_Value__c < lendableByCollateral.get(p.LLC_BI__Collateral__c)) {
                        lendableByCollateral.put(p.LLC_BI__Collateral__c, p.LLC_BI__Current_Lendable_Value__c);
                    }
                }

                if (shareUnknown > 0) {
                    // Part of the basis is missing, so a total would understate rather than inform.
                    f.totalLendableValue = null;
                    f.totalPledgedValue = null;
                    f.coverageRatio = null;
                    f.coverageShortfall = false;
                    f.coverageNote = 'Not computable: ' + shareUnknown + ' of ' + loanPledges.size()
                        + ' pledges on this facility record no pledged amount, so the share of collateral securing it is unknown.';
                } else {
                    f.totalLendableValue = pledgedShare;
                    f.totalPledgedValue = pledgedShare;
                    f.coverageRatio = (f.outstanding > 0 && pledgedShare > 0)
                        ? pledgedShare.divide(f.outstanding, 2, System.RoundingMode.HALF_UP) : null;
                    f.coverageShortfall = (f.outstanding > 0) && (pledgedShare < f.outstanding);
                    f.coverageNote = coverageNoteFor(
                        f.outstanding,
                        pledgedShare,
                        loanPledges.size(),
                        droppedByLoan.containsKey(ln.Id) ? droppedByLoan.get(ln.Id) : 0
                    );
                }

                res.totalCommitted += f.committed;
                res.totalOutstanding += f.outstanding;
                res.totalAvailable += f.available;
                res.facilities.add(f);
            }

            Decimal uniqueLendable = 0;
            for (Decimal v : lendableByCollateral.values()) uniqueLendable += v;
            res.totalUniqueCollateralLendableValue = uniqueLendable;
            res.uniqueCollateralCount = lendableByCollateral.size();
            res.coverageRatio = (!collateralPoolIncomplete && res.totalOutstanding > 0 && uniqueLendable > 0)
                ? uniqueLendable.divide(res.totalOutstanding, 2, System.RoundingMode.HALF_UP) : null;
            res.coverageShortfall = !collateralPoolIncomplete
                && res.totalOutstanding > 0 && uniqueLendable < res.totalOutstanding;

            res.note = BASE_NOTE;
            if (collateralPoolIncomplete) {
                res.note += ' Relationship coverage is withheld: at least one counted pledge records no lendable value, '
                    + 'so the collateral pool is incomplete and any ratio would be understated.';
            }
            results.add(res);
        }

        return results;
    }

    /**
     * The facility's drawn balance. Principal Balance is the field this org populates; the legacy
     * AmountOutstanding is consulted only when Principal Balance is absent and it is not.
     */
    private static Decimal balanceOf(LLC_BI__Loan__c ln) {
        if (ln.LLC_BI__Principal_Balance__c != null) return ln.LLC_BI__Principal_Balance__c;
        if (ln.LLC_BI__AmountOutstanding__c != null) return ln.LLC_BI__AmountOutstanding__c;
        return 0;
    }

    /**
     * Names the arm of nCino's advance-rate formula that produced the pledge's rate, mirroring
     * LLC_BI__Advance_Rate__c exactly: the override wins, then the auto-applied rate, then the
     * collateral type's default. Zero counts as absent in that formula, so it does here too.
     */
    private static String advanceRateSourceOf(LLC_BI__Loan_Collateral2__c p) {
        if (p.LLC_BI__Advance_Rate_Override__c != null && p.LLC_BI__Advance_Rate_Override__c != 0) {
            return 'Pledge override';
        }
        if (p.LLC_BI__Auto_Applied_Advance_Rate__c != null && p.LLC_BI__Auto_Applied_Advance_Rate__c != 0) {
            return 'Auto-applied rate';
        }
        return 'Collateral type default';
    }

    /**
     * What the numbers alone do not say, in banker prose. Null only when the ratio computed AND
     * every pledge on the facility counted towards it. A ratio computed over a partly-excluded
     * pledge set still gets a note: silently narrowing the basis is the dishonest case.
     */
    private static String coverageNoteFor(Decimal outstanding, Decimal pledgedShare, Integer counted, Integer dropped) {
        String excludedClause = dropped == 1
            ? '1 further collateral pledge on this facility is flagged Excluded or Abundance-of-Caution and is out of the coverage math.'
            : dropped + ' further collateral pledges on this facility are flagged Excluded or Abundance-of-Caution and are out of the coverage math.';

        if (counted == 0) {
            return dropped > 0
                ? 'No coverage ratio: all ' + dropped + ' collateral pledges on this facility are flagged Excluded or '
                  + 'Abundance-of-Caution, which puts them out of the coverage math.'
                : 'No coverage ratio: no collateral is pledged to this facility.';
        }
        if (outstanding <= 0) {
            return 'No coverage ratio: this facility carries no outstanding balance to cover.'
                + (dropped > 0 ? ' ' + excludedClause : '');
        }
        if (pledgedShare <= 0) {
            return 'No coverage ratio: the pledges on this facility record a zero pledged amount.'
                + (dropped > 0 ? ' ' + excludedClause : '');
        }
        return dropped > 0 ? excludedClause : null;
    }
}
