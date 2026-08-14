/**
 * Customer360ExposureTest - the read's display contract.
 *
 * Two families of assertion live here. The older ones cover the additive stage/status/package
 * fields: the cockpit's availability predicate decides whether a modification or renewal can be
 * offered, and a credit action requires Booked AND Open, so without those fields on the read the
 * predicate has nothing to test and fails closed.
 *
 * The newer ones cover coverage CORRECTNESS, which is a display contract for every relationship,
 * not just the flagship one. They pin the three decisions the class header explains: outstanding
 * comes from Principal Balance, a facility's coverage divides its PLEDGED SHARE rather than the
 * whole collateral's lendable value, and relationship totals count a cross-pledged asset once.
 * Each of these had a live wrong answer before the fix, so each gets an assertion that fails if the
 * old behaviour comes back.
 */
@IsTest
private class Customer360ExposureTest {

    @TestSetup
    static void makeFixture() {
        Account a = C360Wave2Fixture.account();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.productPackage(a.Id);
        C360Wave2Fixture.loan(a.Id, p.Id);
    }

    // ---------------------------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------------------------

    private static Customer360Exposure.Response read(Id accountId) {
        Customer360Exposure.Request req = new Customer360Exposure.Request();
        req.accountId = accountId;
        return Customer360Exposure.getExposure(new List<Customer360Exposure.Request>{ req })[0];
    }

    private static Customer360Exposure.Facility facilityFor(Customer360Exposure.Response res, Id loanId) {
        for (Customer360Exposure.Facility f : res.facilities) {
            if (f.loanId == loanId) return f;
        }
        System.assert(false, 'The read did not return facility ' + loanId);
        return null;
    }

    /**
     * A pledge with its three hard-required parents satisfied. The aggregate carries no required
     * fields of its own but is set-once on the junction, so it has to exist first.
     */
    private static LLC_BI__Loan_Collateral2__c pledge(
        Id loanId, Id collateralId, Decimal collateralValue, Decimal amountPledged, Decimal currentLendable
    ) {
        LLC_BI__Loan_Collateral_Aggregate__c agg = new LLC_BI__Loan_Collateral_Aggregate__c();
        insert agg;
        LLC_BI__Loan_Collateral2__c p = new LLC_BI__Loan_Collateral2__c(
            LLC_BI__Loan__c = loanId,
            LLC_BI__Collateral__c = collateralId,
            LLC_BI__Loan_Collateral_Aggregate__c = agg.Id,
            LLC_BI__Collateral_Value__c = collateralValue,
            LLC_BI__Amount_Pledged__c = amountPledged,
            LLC_BI__Current_Lendable_Value__c = currentLendable,
            LLC_BI__Is_Excluded__c = false,
            LLC_BI__Abundance_of_Caution__c = false
        );
        insert p;
        return p;
    }

    private static void setBalance(Id loanId, Decimal principalBalance, Decimal amountOutstanding) {
        update new LLC_BI__Loan__c(
            Id = loanId,
            LLC_BI__Principal_Balance__c = principalBalance,
            LLC_BI__AmountOutstanding__c = amountOutstanding
        );
    }

    // ---------------------------------------------------------------------------------------
    // stage / status / package (pre-existing contract)
    // ---------------------------------------------------------------------------------------

    @IsTest
    static void exposureReturnsFacilityStageAndStatus() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Customer360Exposure.Facility f = facilityFor(res, loan.Id);
        System.assertEquals('Qualification', f.stage, 'The read must report the nCino Loan stage');
        System.assertEquals('Open', f.status, 'The read must report the Loan status alongside it');
    }

    @IsTest
    static void stageAndStatusAreEnoughToDecideCreditActionAvailability() {
        Account a = C360Wave2Fixture.existingAccount();

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        for (Customer360Exposure.Facility f : res.facilities) {
            // This is the predicate the cockpit runs. It must be answerable from the read alone.
            Boolean creditActionable = f.stage == 'Booked' && f.status == 'Open';
            System.assertEquals(
                false,
                creditActionable,
                'A Qualification facility is not credit-actionable, and the read now says so without a second query'
            );
        }
    }

    @IsTest
    static void exposureReturnsEachFacilitysOwnPackage() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Product_Package__c p = C360Wave2Fixture.existingPackage();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        System.assertEquals(p.Id, facilityFor(res, loan.Id).productPackageId,
            'A modification or renewal anchors on the SELECTED facility\'s package, not the relationship snapshot');
        for (Customer360Exposure.Facility f : res.facilities) {
            // Without this field the cockpit fails closed and both credit actions go dark, so it
            // must be present on every facility the read returns, not just the one under test.
            System.assertNotEquals(null, f.productPackageId,
                'Every facility must carry its own package id or the client refuses to stage');
        }
    }

    @IsTest
    static void pledgeRowsCarryTheCollateralIdAndName() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c coll = C360TestFixture.collateral(250000);
        coll.LLC_BI__Description__c = 'Eligible Accounts Receivable';
        update coll;

        pledge(loan.Id, coll.Id, 250000, 100000, 125000);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        String orgName = [SELECT Name FROM LLC_BI__Collateral__c WHERE Id = :coll.Id].Name;
        Boolean sawPledge = false;
        for (Customer360Exposure.CollateralPledge p : facilityFor(res, loan.Id).collateral) {
            sawPledge = true;
            System.assertEquals(coll.Id, p.collateralId,
                'The valuation ticket anchors on the COLLATERAL record, not the pledge junction');
            System.assertEquals(orgName, p.collateralName, 'The banker needs the org-assigned name to tell pledges apart');
            System.assertEquals('Eligible Accounts Receivable', p.collateralDescription,
                'The UI shows what the collateral IS, not just COL-000762');
        }
        System.assertEquals(true, sawPledge, 'The pledge should surface on the facility');
    }

    // ---------------------------------------------------------------------------------------
    // outstanding: Principal Balance, with AmountOutstanding as a belt
    // ---------------------------------------------------------------------------------------

    @IsTest
    static void outstandingReadsPrincipalBalanceNotAmountOutstanding() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        // The shape of every real booked loan in this org: a balance, and a null legacy field.
        setBalance(loan.Id, 300000, null);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Customer360Exposure.Facility f = facilityFor(res, loan.Id);
        System.assertEquals(300000, f.outstanding,
            'Outstanding must come from Principal Balance. Reading AmountOutstanding reports every drawn facility as undrawn.');
        System.assertEquals(200000, f.available,
            'Available is committed minus outstanding, computed here because the org formula depends on the null field');
        System.assertEquals(300000, res.totalOutstanding, 'The relationship total is the sum of the facility balances');
        System.assertEquals(200000, res.totalAvailable, 'The relationship availability follows the same computation');
    }

    @IsTest
    static void amountOutstandingIsTheBeltOnlyWhenPrincipalBalanceIsAbsent() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        setBalance(loan.Id, null, 120000);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        System.assertEquals(120000, facilityFor(res, loan.Id).outstanding,
            'With no Principal Balance the legacy field is the documented fallback');
    }

    @IsTest
    static void principalBalanceWinsWhenBothFieldsArePopulated() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        // The org's one populated AmountOutstanding reads 0 against a real balance, so precedence matters.
        setBalance(loan.Id, 300000, 0);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        System.assertEquals(300000, facilityFor(res, loan.Id).outstanding,
            'Principal Balance outranks AmountOutstanding, or the org\'s one populated legacy row zeroes a real balance');
    }

    @IsTest
    static void availableIsFlooredAtZeroWhenTheBalanceExceedsTheCommitment() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        setBalance(loan.Id, 750000, null);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        System.assertEquals(0, facilityFor(res, loan.Id).available,
            'An over-drawn facility has no availability; a negative number would read as a credit line');
    }

    // ---------------------------------------------------------------------------------------
    // facility coverage: the pledged share, never the whole collateral
    // ---------------------------------------------------------------------------------------

    @IsTest
    static void facilityCoverageDividesThePledgedShareNotTheWholeCollateral() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c coll = C360TestFixture.collateral(1000000);
        setBalance(loan.Id, 400000, null);
        // The org stores the WHOLE asset's lendable value on the pledge; only 200k of it is this
        // facility's share. Dividing the whole value would claim 1.25x against a real 0.50x.
        pledge(loan.Id, coll.Id, 1000000, 200000, 500000);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Customer360Exposure.Facility f = facilityFor(res, loan.Id);
        System.assertEquals(200000, f.totalLendableValue, 'The facility total is the pledged share');
        System.assertEquals(200000, f.totalPledgedValue, 'totalPledgedValue is the unambiguous name for the same figure');
        System.assertEquals(0.50, f.coverageRatio,
            'Coverage is pledged share over outstanding. The whole-collateral figure would have said 1.25x.');
        System.assertEquals(true, f.coverageShortfall, 'A 200k share against a 400k balance is a shortfall');
        System.assertEquals(null, f.coverageNote, 'A ratio that computed normally carries no explanation');

        Customer360Exposure.CollateralPledge p = f.collateral[0];
        System.assertEquals(500000, p.currentLendableValue,
            'The pledge display keeps the collateral\'s own identity, so the banker still sees the whole asset');
        System.assertEquals(200000, p.amountPledged, 'And the share, so the two numbers are never confused');
    }

    @IsTest
    static void aPledgeWithNoRecordedShareBlanksTheRatioRatherThanGuessing() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c coll = C360TestFixture.collateral(1000000);
        setBalance(loan.Id, 400000, null);
        pledge(loan.Id, coll.Id, 1000000, null, 500000);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Customer360Exposure.Facility f = facilityFor(res, loan.Id);
        System.assertEquals(null, f.coverageRatio,
            'Nothing in the org data says a null pledged amount means the whole asset, so the ratio is withheld');
        System.assertEquals(null, f.totalLendableValue, 'An unknown share is not a zero share');
        System.assertEquals(null, f.totalPledgedValue, 'Both names report the same unknown');
        System.assertEquals(false, f.coverageShortfall, 'An unknown basis cannot prove a shortfall either');
        System.assert(f.coverageNote != null && f.coverageNote.contains('no pledged amount'),
            'The gap must be explained on screen, not left blank. Note was: ' + f.coverageNote);
    }

    @IsTest
    static void excludedAndAbundanceOfCautionPledgesAreDroppedAndTheFacilitySaysSo() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c excluded = C360TestFixture.collateral(1000000);
        LLC_BI__Collateral__c caution = C360TestFixture.collateral(2000000);
        setBalance(loan.Id, 400000, null);

        // Piedmont is the org's live case for this: 3 of its 5 pledges are flagged Excluded.
        // The flags go on a FRESH sObject: the inserted one still carries
        // LLC_BI__Loan_Collateral_Aggregate__c, which is set-once and not updateable, and an update
        // carrying it fails the whole DML with "fields being inaccessible".
        LLC_BI__Loan_Collateral2__c p1 = pledge(loan.Id, excluded.Id, 1000000, 400000, 500000);
        LLC_BI__Loan_Collateral2__c p2 = pledge(loan.Id, caution.Id, 2000000, 900000, 1000000);
        update new List<LLC_BI__Loan_Collateral2__c>{
            new LLC_BI__Loan_Collateral2__c(Id = p1.Id, LLC_BI__Is_Excluded__c = true),
            new LLC_BI__Loan_Collateral2__c(Id = p2.Id, LLC_BI__Abundance_of_Caution__c = true)
        };

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Customer360Exposure.Facility f = facilityFor(res, loan.Id);
        System.assertEquals(0, f.collateral.size(),
            'Excluded and Abundance-of-Caution pledges do not secure the facility and must not be displayed as if they did');
        System.assertEquals(0, f.totalLendableValue, 'Nothing counts towards the facility total');
        System.assertEquals(null, f.coverageRatio, 'With no counted collateral there is no ratio to show');
        System.assertEquals(true, f.coverageShortfall, 'A drawn facility with no eligible collateral IS short');
        System.assert(f.coverageNote != null && f.coverageNote.contains('Excluded'),
            'The banker must be told the pledges were dropped rather than shown an empty table. Note was: ' + f.coverageNote);
        System.assertEquals(0, res.uniqueCollateralCount, 'Dropped pledges contribute nothing to the relationship pool');
        System.assertEquals(null, res.coverageRatio, 'And therefore no relationship ratio either');
    }

    @IsTest
    static void aRatioComputedOverAPartlyExcludedPledgeSetStillSaysWhatWasDropped() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c counted = C360TestFixture.collateral(1000000);
        LLC_BI__Collateral__c dropped = C360TestFixture.collateral(4000000);
        setBalance(loan.Id, 400000, null);

        pledge(loan.Id, counted.Id, 1000000, 500000, 500000);
        LLC_BI__Loan_Collateral2__c out = pledge(loan.Id, dropped.Id, 4000000, 1900000, 2000000);
        update new LLC_BI__Loan_Collateral2__c(Id = out.Id, LLC_BI__Is_Excluded__c = true);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Customer360Exposure.Facility f = facilityFor(res, loan.Id);
        System.assertEquals(1.25, f.coverageRatio,
            'The ratio counts only the eligible pledge: 500k of share against a 400k balance');
        System.assertEquals(500000, f.totalLendableValue, 'The excluded pledge contributes nothing to the total');
        // Narrowing the basis without saying so is how a surface lies while showing a real number.
        System.assert(f.coverageNote != null && f.coverageNote.contains('Excluded'),
            'A ratio computed over a narrowed basis must say the basis was narrowed. Note was: ' + f.coverageNote);
        System.assertEquals(1, res.uniqueCollateralCount, 'Only the eligible collateral joins the relationship pool');
        System.assertEquals(500000, res.totalUniqueCollateralLendableValue, 'And the excluded asset is not in it');
    }

    // ---------------------------------------------------------------------------------------
    // relationship rollup: dedupe by collateral
    // ---------------------------------------------------------------------------------------

    @IsTest
    static void relationshipTotalsCountACrossPledgedCollateralOnceNotOncePerFacility() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Product_Package__c pkg = C360Wave2Fixture.existingPackage();
        LLC_BI__Loan__c first = C360Wave2Fixture.existingLoan();
        LLC_BI__Loan__c second = C360Wave2Fixture.loan(a.Id, pkg.Id);
        LLC_BI__Collateral__c shared = C360TestFixture.collateral(1000000);

        setBalance(first.Id, 400000, null);
        setBalance(second.Id, 200000, null);
        // Three of Hartwell's four assets are pledged to two facilities each, and the pledge repeats
        // the whole asset's lendable value on both rows. Summing them claimed 59.2MM of a 31.6MM pool.
        pledge(first.Id, shared.Id, 1000000, 300000, 500000);
        pledge(second.Id, shared.Id, 1000000, 200000, 500000);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        System.assertEquals(1, res.uniqueCollateralCount, 'One collateral record, however many facilities it secures');
        System.assertEquals(500000, res.totalUniqueCollateralLendableValue,
            'The asset contributes its lendable value once. Summing the pledges would have said 1,000,000.');
        System.assertEquals(600000, res.totalOutstanding, 'Both balances count towards the relationship');
        System.assertEquals(0.83, res.coverageRatio, 'Relationship coverage is unique lendable over total outstanding');
        System.assertEquals(true, res.coverageShortfall, '500k of collateral behind 600k of debt is a shortfall');

        System.assertEquals(300000, facilityFor(res, first.Id).totalLendableValue, 'Each facility still shows its own share');
        System.assertEquals(200000, facilityFor(res, second.Id).totalLendableValue, 'And the shares partition the asset');
    }

    @IsTest
    static void relationshipCoverageIsWithheldWhenAPledgeRecordsNoLendableValue() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c coll = C360TestFixture.collateral(1000000);
        setBalance(loan.Id, 400000, null);
        pledge(loan.Id, coll.Id, 1000000, 100000, null);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        System.assertEquals(null, res.coverageRatio,
            'An incomplete collateral pool would understate the relationship ratio, so it is withheld rather than shown');
        System.assertEquals(false, res.coverageShortfall, 'And an incomplete pool cannot prove a shortfall');
        System.assert(res.note != null && res.note.contains('withheld'),
            'The response says why, per the honesty-over-completeness rule. Note was: ' + res.note);
        System.assertEquals(0.25, facilityFor(res, loan.Id).coverageRatio,
            'The facility ratio still computes: its basis is the pledged share, which is present');
    }

    // ---------------------------------------------------------------------------------------
    // one advance rate, one source
    // ---------------------------------------------------------------------------------------

    @IsTest
    static void advanceRateSourceNamesWhichArmOfTheFormulaProducedTheRate() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c plain = C360TestFixture.collateral(1000000);
        LLC_BI__Collateral__c overridden = C360TestFixture.collateral(1000000);

        LLC_BI__Collateral__c autoApplied = C360TestFixture.collateral(1000000);

        pledge(loan.Id, plain.Id, 1000000, 100000, 500000);
        LLC_BI__Loan_Collateral2__c p3 = pledge(loan.Id, autoApplied.Id, 1000000, 100000, 600000);
        update new LLC_BI__Loan_Collateral2__c(Id = p3.Id, LLC_BI__Auto_Applied_Advance_Rate__c = 60);
        LLC_BI__Loan_Collateral2__c p2 = pledge(loan.Id, overridden.Id, 1000000, 100000, 400000);
        // The org refuses an override without a reason (VR Advance_Rate_Override). The update goes
        // on a fresh sObject because the set-once aggregate lookup is not updateable.
        update new LLC_BI__Loan_Collateral2__c(
            Id = p2.Id,
            LLC_BI__Advance_Rate_Override__c = 40,
            LLC_BI__Override_Reason__c = 'ZZ-W2-TEST override'
        );

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Map<Id, String> sourceByCollateral = new Map<Id, String>();
        Map<Id, Decimal> rateByCollateral = new Map<Id, Decimal>();
        for (Customer360Exposure.CollateralPledge p : facilityFor(res, loan.Id).collateral) {
            sourceByCollateral.put(p.collateralId, p.advanceRateSource);
            rateByCollateral.put(p.collateralId, p.advanceRate);
        }

        System.assertEquals('Collateral type default', sourceByCollateral.get(plain.Id),
            'With no override the rate comes from the collateral type');
        System.assertEquals('Pledge override', sourceByCollateral.get(overridden.Id),
            'With an override the pledge wins, exactly as nCino\'s own formula resolves it');
        System.assertEquals('Auto-applied rate', sourceByCollateral.get(autoApplied.Id),
            'With no override but an auto-applied rate, the middle arm of the formula wins');
        System.assertEquals(50, rateByCollateral.get(plain.Id), 'The fixture collateral type advances at 50%');
        System.assertEquals(40, rateByCollateral.get(overridden.Id),
            'And the read reports the overridden rate, never the collateral-level one it disagrees with');
        System.assertEquals(60, rateByCollateral.get(autoApplied.Id), 'And the auto-applied rate where that is what nCino resolved');
    }

    @IsTest
    static void aZeroPledgedAmountIsReportedAsNoRatioRatherThanAZeroRatio() {
        Account a = C360Wave2Fixture.existingAccount();
        LLC_BI__Loan__c loan = C360Wave2Fixture.existingLoan();
        LLC_BI__Collateral__c coll = C360TestFixture.collateral(1000000);
        setBalance(loan.Id, 400000, null);
        pledge(loan.Id, coll.Id, 1000000, 0, 500000);

        Test.startTest();
        Customer360Exposure.Response res = read(a.Id);
        Test.stopTest();

        Customer360Exposure.Facility f = facilityFor(res, loan.Id);
        System.assertEquals(0, f.totalLendableValue, 'A recorded zero share IS zero, unlike an absent one');
        System.assertEquals(null, f.coverageRatio, 'A 0.00x ratio would read as a measurement rather than an empty pledge');
        System.assertEquals(true, f.coverageShortfall, 'Nothing secures a drawn facility whose pledge carries no amount');
        System.assert(f.coverageNote != null && f.coverageNote.contains('zero pledged amount'),
            'The banker is told the pledge exists but carries no amount. Note was: ' + f.coverageNote);
    }

    @IsTest
    static void anAccountWithNoFacilitiesSaysSoWithoutFabricatingTotals() {
        Account empty = new Account(Name = 'ZZ-W2-TEST No Facilities');
        insert empty;

        Test.startTest();
        Customer360Exposure.Response res = read(empty.Id);
        Test.stopTest();

        System.assertEquals(0, res.facilities.size(), 'There is nothing to show');
        System.assertEquals(0, res.totalOutstanding, 'And nothing to total');
        System.assertEquals(null, res.coverageRatio, 'No facilities means no coverage ratio, not a zero one');
        System.assertEquals('No active facilities found for this account.', res.note, 'The read says so plainly');
    }
}
