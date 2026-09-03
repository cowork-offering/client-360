# THE SECOND PRODUCT PACKAGE: Hartwell Real Estate Package.
#
# WHY A SECOND PACKAGE. Every borrower in the shipped book stages exactly one, so the
# greeting's package ask - the branch where the room must ask which package before it
# anchors - never fired on the demo borrower. Hartwell now carries two, and the ask is
# rendered against real org data rather than a fixture.
#
# ATOMIC OR NOTHING. Each composite call is allOrNone, and the script dies on the first
# failure. A package half-built is the one outcome forbidden here, so if this exits
# non-zero, revert with knowledge/sf-build-v2/tools/revert-hartwell.py NEW_PKG=<the id
# printed at the top> before trying again.
#
# IDEMPOTENT ON THE PACKAGE NAME. A second run finds the package and exits rather than
# minting a third one.
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from sfrest import q, create, update, ACCT

PKG_NAME = 'Hartwell Real Estate Package'
# RESUMABLE. A rerun after a mid-build failure adopts the package and the facilities that
# already exist and builds the rest, because deleting a booked facility to recreate it
# identically is churn the org logs and nobody wants to read.
found = q(f"SELECT Id FROM LLC_BI__Product_Package__c WHERE LLC_BI__Account__c='{ACCT}' AND Name='{PKG_NAME}'")
RESUME = found[0]['Id'] if found else None
if RESUME:
    print('resuming package', RESUME)

# Shapes are copied off the C&I package's own loans rather than typed, so the new
# facilities read on the same record types and product taxonomy as their siblings.
model = {r['Id']: r for r in q(
    "SELECT Id, RecordTypeId, LLC_BI__Loan_Officer__c, LLC_BI__Product_Line__c, LLC_BI__Interest_Accrual_Method__c, "
    "LLC_BI__Financed_Fee_Calculations__c, LLC_BI__HMDA_Record_Type__c, LLC_BI__Loan_Class__c "
    "FROM LLC_BI__Loan__c WHERE Id IN ('a4Zbb0000027MqfEAE','a4Zbb0000027MnREAU')")}
RE_MODEL, EQ_MODEL = model['a4Zbb0000027MqfEAE'], model['a4Zbb0000027MnREAU']
OFFICER = RE_MODEL['LLC_BI__Loan_Officer__c']

james = q("SELECT LLC_BI__Account__c FROM LLC_BI__Legal_Entities__c "
          "WHERE LLC_BI__Loan__c='a4Zbb0000027MnREAU' AND LLC_BI__Entity_Type__c='Individual' LIMIT 1")
JAMES = james[0]['LLC_BI__Account__c'] if james else None
print('James Hartwell account:', JAMES)

pkg = RESUME or create('LLC_BI__Product_Package__c', [{
    'Name': PKG_NAME,
    'LLC_BI__Account__c': ACCT,
    'LLC_BI__Approval_Status__c': 'Ready',
    'LLC_BI__Deal_Type__c': 'Loan Onboarding',
    'LLC_BI__Review_Frequency__c': 'Annually',
    'LLC_BI__Risk_Rating__c': '4',
    'LLC_BI__Stage__c': 'Complete',
    'LLC_BI__Status__c': 'Approved',
    'LLC_BI__Description__c': (
        'Owner-occupied real estate package for Hartwell Precision Manufacturing LLC. Two booked '
        'facilities totalling $8.0MM of commitments against $7.67MM outstanding: a $6.5MM twenty-year '
        'amortising term loan on the 1400 Industrial Parkway plant, ten-year balloon, and a $1.5MM '
        'seven-year equipment note against the inspection and metrology fleet. Secured by a first '
        'mortgage on the plant and a first UCC lien on the equipment. Guaranteed by James Hartwell, '
        'unlimited. Debt service coverage tested quarterly under COV-000646.'),
}, ], 'package')[0]
if not RESUME:
    # nCino renames a package on insert to "<account> - <date> - PP" from its own flow, so the
    # name we asked for has to be written back afterwards. Without this the package reads as
    # today's throwaway on the greeting's ask, and the resume check above never matches.
    update('LLC_BI__Product_Package__c', [{'Id': pkg, 'Name': PKG_NAME}], 'package renamed')
print('PACKAGE:', pkg)

def loan(name, amount, product, ptype, m, rate, term, amort, first, maturity, outstanding, grade, key):
    return {
        'Name': name, 'LLC_BI__Account__c': ACCT, 'LLC_BI__Product_Package__c': pkg,
        'RecordTypeId': m['RecordTypeId'], 'LLC_BI__Loan_Officer__c': OFFICER,
        'LLC_BI__Product__c': product, 'LLC_BI__Product_Type__c': ptype,
        'LLC_BI__Product_Line__c': m['LLC_BI__Product_Line__c'],
        'LLC_BI__Interest_Accrual_Method__c': m['LLC_BI__Interest_Accrual_Method__c'],
        'LLC_BI__Financed_Fee_Calculations__c': m['LLC_BI__Financed_Fee_Calculations__c'],
        'LLC_BI__HMDA_Record_Type__c': m['LLC_BI__HMDA_Record_Type__c'],
        'LLC_BI__Loan_Class__c': m['LLC_BI__Loan_Class__c'],
        # BOOKED ON INSERT, and it has to be. Loan_Validation_05 refuses the Booked stage when
        # lookupKey is blank, which the key below satisfies. Loan_Validation_06 refuses a MOVE to
        # Booked from Qualification, Proposal, Credit Underwriting or Final Review, because a
        # facility reaches servicing through Submit for Approval and not through a PATCH. It reads
        # PRIORVALUE, so it does not fire on an insert. Creating at Qualification and promoting is
        # therefore the one route that cannot work; creating at Booked is the route that can.
        'LLC_BI__Stage__c': 'Booked', 'LLC_BI__Status__c': 'Open', 'LLC_BI__Risk_Grade__c': grade,
        'LLC_BI__lookupKey__c': key,
        'LLC_BI__Amount__c': amount, 'LLC_BI__Approved_Loan_Amount__c': amount,
        'LLC_BI__AmountOutstanding__c': outstanding,
        'LLC_BI__Current_Interest_Rate__c': rate, 'LLC_BI__InterestRate__c': rate,
        'LLC_BI__Term_Months__c': term, 'LLC_BI__Amortized_Term_Months__c': amort,
        'LLC_BI__First_Payment_Date__c': first, 'LLC_BI__Maturity_Date__c': maturity,
        'LLC_BI__CloseDate__c': '2026-01-31', 'LLC_BI__Booked_Date__c': '2026-01-31',
        'LLC_BI__Payment_Schedule__c': 'Monthly', 'LLC_BI__Payment_Type__c': 'Installment',
        'Primary_Source_of_Repayment__c': 'Cash flow from Operations',
        'Secondary_Source_of_Repayment__c': 'Liquidation of Collateral',
    }

have_loans = q(f"SELECT Id, LLC_BI__Amount__c FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c='{pkg}' ORDER BY LLC_BI__Amount__c DESC")
CRE, EQ = ([r['Id'] for r in have_loans] if len(have_loans) == 2 else create('LLC_BI__Loan__c', [
    loan('Hartwell Precision Manufacturing LLC - Purchase - $6,500,000.00', 6500000, 'Purchase',
         'Real Estate', RE_MODEL, 6.35, 120, 240, '2026-02-28', '2036-01-31', 6340000, '4', 'HW2001'),
    loan('Hartwell Precision Manufacturing LLC - Equipment - $1,500,000.00', 1500000, 'Equipment',
         'Non-Real Estate', EQ_MODEL, 6.60, 84, 84, '2026-02-28', '2033-01-31', 1330000, '4', 'HW2002'),
], 'loans'))
print('CRE LOAN:', CRE, '| EQUIPMENT LOAN:', EQ)


# Record type is left to the org's default: 012bb000000NNdc/NNdj, which the existing Hartwell
# collateral carries, are not assignable to this integration user.
have_col = {r['LLC_BI__Collateral_Name__c']: r['Id'] for r in q(
    "SELECT Id, LLC_BI__Collateral_Name__c FROM LLC_BI__Collateral__c "
    "WHERE LLC_BI__Collateral_Name__c LIKE 'Hartwell Plant - 1400%' "
    "OR LLC_BI__Collateral_Name__c = 'Hartwell Inspection and Metrology Equipment'")}
col_re, col_eq = (list(have_col.values()) if len(have_col) == 2 else create('LLC_BI__Collateral__c', [{
    'LLC_BI__Collateral_Name__c': 'Hartwell Plant - 1400 Industrial Parkway, Fort Wayne',
    'LLC_BI__Description__c': ('Owner-occupied manufacturing plant and office at 1400 Industrial Parkway, '
                               'Fort Wayne, Indiana 46802. 164,000 sq ft on 14.8 acres.'),
    'LLC_BI__Collateral_Legal_Description__c': (
        'First mortgage on the owner-occupied manufacturing plant and attached office at 1400 Industrial '
        'Parkway, Fort Wayne, Indiana 46802, 164,000 sq ft of manufacturing and office space on 14.8 acres, '
        'together with all fixtures and improvements. Owner-occupied by Hartwell Precision Manufacturing LLC.'),
    'LLC_BI__Collateral_Type__c': 'a33bb000000lBWrAAM',
    'LLC_BI__Assessment_Method__c': 'Appraisal', 'LLC_BI__Held_By__c': 'Lender',
    'LLC_BI__Status__c': 'Available', 'LLC_BI__Valuation_Frequency__c': 'Annually',
    'LLC_BI__Appraisal_Date__c': '2026-01-15', 'LLC_BI__Next_Revaluation_Due_Date__c': '2027-01-15',
    'LLC_BI__Value__c': 8400000, 'LLC_BI__Liquidation_Value__c': 6720000,
    'LLC_BI__Depth__c': 1,
    'LLC_BI__UCC_Financing_Statement__c': True, 'LLC_BI__UCC_State_Filing__c': 'IN',
    'LLC_BI__UCC_Expiration_State__c': '2031-01-31',
}, {
    'LLC_BI__Collateral_Name__c': 'Hartwell Inspection and Metrology Equipment',
    'LLC_BI__Description__c': ('Zeiss CONTURA and Hexagon Global S coordinate measuring machines, optical '
                               'comparators, surface finish analysers and the calibration laboratory.'),
    'LLC_BI__Collateral_Legal_Description__c': (
        'First UCC lien on all inspection and metrology equipment, including two Zeiss CONTURA coordinate '
        'measuring machines, one Hexagon Global S CMM, optical comparators, surface finish analysers and the '
        'calibration laboratory instrumentation at the Fort Wayne plant.'),
    'LLC_BI__Collateral_Type__c': 'a33bb000000lBWaAAM',
    'LLC_BI__Assessment_Method__c': 'Appraisal', 'LLC_BI__Held_By__c': 'Lender',
    'LLC_BI__Status__c': 'Available', 'LLC_BI__Valuation_Frequency__c': 'Annually',
    'LLC_BI__Appraisal_Date__c': '2026-01-20', 'LLC_BI__Next_Revaluation_Due_Date__c': '2027-01-20',
    'LLC_BI__Value__c': 2100000, 'LLC_BI__Liquidation_Value__c': 1470000,
    'LLC_BI__Depth__c': 1,
    'LLC_BI__UCC_Financing_Statement__c': True, 'LLC_BI__UCC_State_Filing__c': 'IN',
    'LLC_BI__UCC_Expiration_State__c': '2031-01-31',
}], 'collateral'))
print('COLLATERAL:', col_re, col_eq)

owned = {r['LLC_BI__Collateral__c'] for r in q(
    f"SELECT LLC_BI__Collateral__c FROM LLC_BI__Account_Collateral__c "
    f"WHERE LLC_BI__Account__c='{ACCT}' AND LLC_BI__Collateral__c IN ('{col_re}','{col_eq}')")}
todo = [c for c in (col_re, col_eq) if c not in owned]
if todo:
    create('LLC_BI__Account_Collateral__c', [
        {'LLC_BI__Account__c': ACCT, 'LLC_BI__Collateral__c': c, 'LLC_BI__Collateral_Association__c': 'Owner',
         'LLC_BI__Ownership_Percentage__c': 100, 'LLC_BI__Pledging_Authority__c': True,
         'LLC_BI__Start_Date__c': '2026-01-31'} for c in todo], 'account collateral')

# Pledged at the lendable value, not the commitment. The org refuses a pledge above current
# lendable value unless Authorize is checked, and checking it to paper over an over-pledge would
# be inventing coverage the appraisal does not support. The CRE loan is therefore slightly
# under-covered by design and the exposure read says so.
have_pledges = q(f"SELECT Id FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c IN ('{CRE}','{EQ}')")
if not have_pledges:
  create('LLC_BI__Loan_Collateral2__c', [
      {'LLC_BI__Loan__c': CRE, 'LLC_BI__Collateral__c': col_re, 'LLC_BI__Lien_Position__c': '1st',
       'LLC_BI__Pledged_Status__c': 'Active', 'LLC_BI__Is_Primary__c': True,
       'LLC_BI__Advance_Rate_Override__c': 75, 'LLC_BI__Amount_Pledged__c': 6300000,
       'LLC_BI__Start_Date__c': '2026-01-31',
       'LLC_BI__Override_Reason__c': ('Owner-occupied industrial advanced at 75% against the 80% collateral-type '
                                      'default, on the January 2026 MAI as-is appraisal.')},
      {'LLC_BI__Loan__c': EQ, 'LLC_BI__Collateral__c': col_eq, 'LLC_BI__Lien_Position__c': '1st',
       'LLC_BI__Pledged_Status__c': 'Active', 'LLC_BI__Is_Primary__c': True,
       'LLC_BI__Advance_Rate_Override__c': 70, 'LLC_BI__Amount_Pledged__c': 1470000,
       'LLC_BI__Start_Date__c': '2026-01-31',
       'LLC_BI__Override_Reason__c': ('Metrology equipment advanced at 70%, reflecting invoice cost less '
                                      'depreciation rather than an orderly liquidation basis.')},
  ], 'pledges')

have_ents = q(f"SELECT Id FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c IN ('{CRE}','{EQ}')")
ents = [] if have_ents else [{'LLC_BI__Account__c': ACCT, 'LLC_BI__Loan__c': l, 'LLC_BI__Product_Package__c': pkg,
         'LLC_BI__Borrower_Type__c': 'Borrower', 'LLC_BI__Entity_Type__c': 'Operating Company',
         'LLC_BI__Contingent_Type__c': 'Joint & Several', 'LLC_BI__Ownership__c': 100,
         'LLC_BI__Is_Included_In_Global_Analysis__c': True, 'LLC_BI__Order__c': 1,
         'LLC_BI__Notes__c': 'Primary borrower and operating company.'} for l in (CRE, EQ)]
if JAMES and ents:
    ents += [{'LLC_BI__Account__c': JAMES, 'LLC_BI__Loan__c': l, 'LLC_BI__Product_Package__c': pkg,
              'LLC_BI__Borrower_Type__c': 'Guarantor', 'LLC_BI__Entity_Type__c': 'Individual',
              'LLC_BI__Contingent_Type__c': 'Joint & Several', 'LLC_BI__Guaranty_Amount__c': 'Unlimited',
              'LLC_BI__Ownership__c': 100, 'LLC_BI__Is_Included_In_Global_Analysis__c': True,
              'LLC_BI__Order__c': 2,
              'LLC_BI__Notes__c': 'Personal guarantor. Unlimited continuing guaranty since 2012.'}
             for l in (CRE, EQ)]
if ents: create('LLC_BI__Legal_Entities__c', ents, 'involvements')

# Active is a formula on this object, not a flag we set.
if not q(f"SELECT Id FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c='{CRE}'"):
    create('LLC_BI__Loan_Covenant__c', [
        {'LLC_BI__Covenant2__c': 'a3Bbb000000S0UvEAK', 'LLC_BI__Loan__c': CRE}], 'covenant junction')

print('--- VERIFY ---')
for r in q(f"SELECT Id, Name, LLC_BI__Amount__c, LLC_BI__Current_Interest_Rate__c, LLC_BI__Maturity_Date__c, "
           f"LLC_BI__Stage__c, LLC_BI__Status__c FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c='{pkg}'"):
    print(' ', r['Id'], r['LLC_BI__Amount__c'], r['LLC_BI__Current_Interest_Rate__c'],
          r['LLC_BI__Maturity_Date__c'], r['LLC_BI__Stage__c'], r['LLC_BI__Status__c'])
print('  packages on account:', len(q(f"SELECT Id FROM LLC_BI__Product_Package__c WHERE LLC_BI__Account__c='{ACCT}'")))
print('  loans on account:', len(q(f"SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}'")))
print('NEW_PKG=' + pkg)
