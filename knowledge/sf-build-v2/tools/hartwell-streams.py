# Rate and payment components on every booked Hartwell facility.
#
# THE PATTERN is Flowers For Dreams: one Pricing Stream per loan carrying both flags
# (Is_Rate_Stream, Is_Payment_Stream), one Pricing Rate Component (Interest_Rate_Type
# Fixed, Term_Unit Unit_Months, Frequency_Monthly) and one Pricing Payment Component
# (Frequency_Monthly, Includes_Interest, and Includes_Principal on anything that
# amortises). Both components carry cm_Loan__c as well as the stream lookup, which is
# how the org's own seeded rows read.
#
# THE TWO LINES ALREADY HAD STREAMS and are corrected here rather than rebuilt: the
# revolving line's rate component still said 7.6 percent against a loan that now reads
# 6.58, and the seasonal line's stream still ended 2026-06-30, the maturity that was
# retired for being in the past.
#
# IDEMPOTENT. A loan that already has a stream keeps it; components are matched on the
# stream and updated in place. Re-running changes nothing.
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from sfrest import q, create, update, ACCT

# loanId -> (label, rate, termMonths, amortMonths, effective, maturity, amortises, balance)
BOOKED = {
    'a4Zbb0000027MaYEAU': ('Revolving Line $15M',  6.58, 24,  24,  '2025-03-15', '2027-03-15', False, 9200000),
    'a4Zbb0000027MttEAE': ('Seasonal Line $2.5M',  6.83, 24,  24,  '2025-06-30', '2027-03-15', False, 1150000),
    'a4Zbb0000027MnREAU': ('Equipment Term $8M',   6.45, 60,  84,  '2026-03-20', '2031-03-15', True,  8000000),
    'a4Zbb0000027Mp3EAE': ('Construction $12M',    7.08, 60,  240, '2026-03-01', '2031-03-15', True,  12000000),
    'a4Zbb0000027MqfEAE': ('Purchase $5M',         6.20, 60,  180, '2026-03-10', '2031-03-15', True,  5000000),
    'a4Zbb0000027MsHEAU': ('Equipment Term $3.5M', 6.75, 60,  84,  '2026-03-18', '2031-03-15', True,  3500000),
}

def payment(principal, annual_rate, n_months):
    """Level monthly payment. Interest only where nothing amortises."""
    r = annual_rate / 100 / 12
    return round(principal * r / (1 - (1 + r) ** -n_months), 2)

existing = {s['LLC_BI__Loan__c']: s for s in
            q(f"SELECT Id, LLC_BI__Loan__c FROM LLC_BI__Pricing_Stream__c "
              f"WHERE LLC_BI__Loan__c IN (SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}')")}
print(f'streams already present: {len(existing)}')

new_for = [lid for lid in BOOKED if lid not in existing]
if new_for:
    ids = create('LLC_BI__Pricing_Stream__c', [{
        'Name': f'Hartwell Precision - {BOOKED[l][0]} - Pricing Stream',
        'LLC_BI__Loan__c': l,
        'LLC_BI__Context_Id__c': l,
        'LLC_BI__Period_Type__c': 'Fixed',
        'LLC_BI__Term_Unit__c': 'Unit_Monthly',
        'LLC_BI__Version__c': '2.0',
        'LLC_BI__Effective_Date__c': BOOKED[l][4],
        'LLC_BI__End_Date__c': BOOKED[l][5],
        'LLC_BI__Is_Payment_Stream__c': True,
        'LLC_BI__Is_Rate_Stream__c': True,
        'LLC_BI__Sequence__c': 1,
        'LLC_BI__Term_Length__c': BOOKED[l][2],
    } for l in new_for], 'streams')
    for l, i in zip(new_for, ids):
        existing[l] = {'Id': i, 'LLC_BI__Loan__c': l}

# The two that predate this build carry the retired term and the retired rate.
update('LLC_BI__Pricing_Stream__c', [{
    'Id': existing[l]['Id'],
    'LLC_BI__Effective_Date__c': BOOKED[l][4],
    'LLC_BI__End_Date__c': BOOKED[l][5],
    'LLC_BI__Term_Length__c': BOOKED[l][2],
} for l in BOOKED], 'streams realigned')

def sync(obj, label, build):
    have = {r['LLC_BI__Pricing_Stream__c']: r['Id'] for r in
            q(f"SELECT Id, LLC_BI__Pricing_Stream__c FROM {obj} WHERE LLC_BI__Pricing_Stream__c IN "
              "('" + "','".join(existing[l]['Id'] for l in BOOKED) + "')")}
    mk, up = [], []
    for l in BOOKED:
        sid = existing[l]['Id']
        row = build(l, sid)
        (up if sid in have else mk).append(dict(row, Id=have[sid]) if sid in have else row)
    if mk: create(obj, mk, label)
    if up: update(obj, up, label)

sync('LLC_BI__Pricing_Rate_Component__c', 'rate components', lambda l, sid: {
    'Name': f'Hartwell Precision - {BOOKED[l][0]} - PricingRateComponent',
    'LLC_BI__Pricing_Stream__c': sid,
    'cm_Loan__c': l,
    'LLC_BI__Interest_Rate_Type__c': 'Fixed',
    'LLC_BI__Term_Unit__c': 'Unit_Months',
    'LLC_BI__Frequency__c': 'Frequency_Monthly',
    'LLC_BI__Applied_Loan_Percentage__c': 100,
    'LLC_BI__Is_Fixed__c': True,
    'LLC_BI__Rate__c': BOOKED[l][1],
    'LLC_BI__Effective_Date__c': BOOKED[l][4],
    'LLC_BI__End_Date__c': BOOKED[l][5],
    'LLC_BI__Sequence__c': 1,
    'LLC_BI__Term_Length__c': BOOKED[l][2],
})

sync('LLC_BI__Pricing_Payment_Component__c', 'payment components', lambda l, sid: {
    'Name': f'Hartwell Precision - {BOOKED[l][0]} - PricingPaymentComponent',
    'LLC_BI__Pricing_Stream__c': sid,
    'LLC_BI__Rate_Stream__c': sid,
    'cm_Loan__c': l,
    'LLC_BI__Frequency__c': 'Frequency_Monthly',
    'LLC_BI__Interest_Frequency__c': 'Frequency_Annually',
    'LLC_BI__Interest_Payment_Frequency__c': 'Frequency_Monthly',
    'LLC_BI__Principal_Payment_Frequency__c': 'Frequency_Monthly' if BOOKED[l][6] else None,
    'LLC_BI__Term_Unit__c': 'Unit_Months',
    'LLC_BI__Includes_Interest__c': True,
    'LLC_BI__Includes_Principal__c': BOOKED[l][6],
    'LLC_BI__Amount__c': (payment(BOOKED[l][7], BOOKED[l][1], BOOKED[l][3]) if BOOKED[l][6]
                          else round(BOOKED[l][7] * BOOKED[l][1] / 100 / 12, 2)),
    'LLC_BI__Effective_Date__c': BOOKED[l][4],
    'LLC_BI__End_Date__c': BOOKED[l][5],
    'LLC_BI__Sequence__c': 1,
    'LLC_BI__Term_Length__c': BOOKED[l][2],
})

print('--- VERIFY ---')
for r in q("SELECT LLC_BI__Pricing_Stream__r.LLC_BI__Loan__c, LLC_BI__Rate__c, LLC_BI__End_Date__c "
           "FROM LLC_BI__Pricing_Rate_Component__c WHERE cm_Loan__c IN ('" + "','".join(BOOKED) + "')"):
    print('  rate   ', r['LLC_BI__Pricing_Stream__r']['LLC_BI__Loan__c'], r['LLC_BI__Rate__c'], r['LLC_BI__End_Date__c'])
for r in q("SELECT cm_Loan__c, LLC_BI__Amount__c, LLC_BI__Includes_Principal__c "
           "FROM LLC_BI__Pricing_Payment_Component__c WHERE cm_Loan__c IN ('" + "','".join(BOOKED) + "')"):
    print('  payment', r['cm_Loan__c'], r['LLC_BI__Amount__c'], 'P+I' if r['LLC_BI__Includes_Principal__c'] else 'I only')
