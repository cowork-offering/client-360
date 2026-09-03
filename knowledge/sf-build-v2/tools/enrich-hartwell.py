# Fills the six booked Hartwell facilities so every facility card reads complete.
#
# WHAT WAS MISSING and why the room noticed. Every one of the six came back with a null
# interest rate, no amortisation, no first payment date and no loan purpose, so the
# facility card rendered four gap states on a booked loan. Two maturity dates were also
# wrong against the story: the $2.5M seasonal line read 2026-06-30, which is in the past,
# and the four term loans read four different dates.
#
# THE RULE APPLIED HERE is one maturity per product class per package: the two lines
# mature together on 2027-03-15, the four term loans on 2031-03-15. Stated and defended in
# knowledge/HARTWELL-DEMO-DOSSIER-20260903.md section 2.
#
#   read TOK INST <<< "$(~/.local/bin/bankinggpt-rest)"; export TOK INST
#   python3 knowledge/sf-build-v2/tools/enrich-hartwell.py
import json, os, urllib.request, urllib.parse

TOK, INST = os.environ['TOK'], os.environ['INST']
V = 'v62.0'
ACCT = '001bb00001I7FPNAA3'

def call(method, path, body=None):
    req = urllib.request.Request(INST + path, method=method,
        headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req) as r:
        d = r.read()
        return json.loads(d) if d else None

def q(soql):
    return call('GET', f'/services/data/{V}/query?q=' + urllib.parse.quote(soql))['records']

# loanId -> (rate, termMonths, amortMonths, firstPayment, maturity, purpose, paymentType)
LOANS = {
    'a4Zbb0000027MaYEAU': (6.58, 24,  24,  '2025-04-15', '2027-03-15', 'business_credit_line',                'Revolving Line Of Credit'),
    # Its projected close date is 2025-07-30 and the org refuses a first payment before it.
    'a4Zbb0000027MttEAE': (6.83, 24,  24,  '2025-07-30', '2027-03-15', 'business_credit_line',                'Revolving Line Of Credit'),
    'a4Zbb0000027MnREAU': (6.45, 60,  84,  '2026-04-20', '2031-03-15', 'equipment',                           'Installment'),
    'a4Zbb0000027Mp3EAE': (7.08, 60,  240, '2026-04-01', '2031-03-15', 'construction_owner_occupied',         'Construction Permanent'),
    'a4Zbb0000027MqfEAE': (6.20, 60,  180, '2026-04-10', '2031-03-15', 'real_estate_purchase_owner_occupied', 'Installment'),
    'a4Zbb0000027MsHEAU': (6.75, 60,  84,  '2026-04-18', '2031-03-15', 'equipment',                           'Installment'),
}

records = []
for lid, (rate, term, amort, first, mat, _purpose, ptype) in LOANS.items():
    records.append({
        'attributes': {'type': 'LLC_BI__Loan__c'},
        'Id': lid,
        'LLC_BI__Current_Interest_Rate__c': rate,
        'LLC_BI__Term_Months__c': term,
        'LLC_BI__Amortized_Term_Months__c': amort,
        'LLC_BI__First_Payment_Date__c': first,
        'LLC_BI__Maturity_Date__c': mat,
        'LLC_BI__Payment_Schedule__c': 'Monthly',
        'LLC_BI__Payment_Type__c': ptype,
        'Primary_Source_of_Repayment__c': 'Cash flow from Operations',
        'Secondary_Source_of_Repayment__c': 'Liquidation of Collateral',
    })
res = call('PATCH', f'/services/data/{V}/composite/sobjects', {'allOrNone': False, 'records': records})
for r in res:
    print(('ok  ' if r['success'] else 'FAIL'), r['id'], '' if r['success'] else json.dumps(r['errors'])[:300])

# The purpose lives on the Loan Detail child, one per loan, minted by nCino's own flow.
inL = "('" + "','".join(LOANS) + "')"
details = q(f"SELECT Id, LLC_BI__Loan__c FROM LLC_BI__Loan_Detail__c WHERE LLC_BI__Loan__c IN {inL}")
print(f'loan details found: {len(details)}')
drecs = [{'attributes': {'type': 'LLC_BI__Loan_Detail__c'}, 'Id': d['Id'],
          'LLC_BI__Primary_Loan_Purpose__c': LOANS[d['LLC_BI__Loan__c']][5]} for d in details]
if drecs:
    for r in call('PATCH', f'/services/data/{V}/composite/sobjects', {'allOrNone': False, 'records': drecs}):
        print(('ok  ' if r['success'] else 'FAIL'), r['id'], '' if r['success'] else json.dumps(r['errors'])[:300])

# The account carried $85M of annual revenue against a spread that tops out at $64.2M.
for r in call('PATCH', f'/services/data/{V}/composite/sobjects', {'allOrNone': False, 'records': [
        {'attributes': {'type': 'Account'}, 'Id': ACCT, 'AnnualRevenue': 64200000}]}):
    print(('ok  ' if r['success'] else 'FAIL'), r['id'], '' if r['success'] else json.dumps(r['errors'])[:300])

print('--- VERIFY ---')
for r in q(f"SELECT Id, Name, LLC_BI__Current_Interest_Rate__c, LLC_BI__Term_Months__c, LLC_BI__Amortized_Term_Months__c, LLC_BI__First_Payment_Date__c, LLC_BI__Maturity_Date__c FROM LLC_BI__Loan__c WHERE Id IN {inL} ORDER BY Name"):
    print(f"  {r['Id']} rate={r['LLC_BI__Current_Interest_Rate__c']} term={r['LLC_BI__Term_Months__c']} amort={r['LLC_BI__Amortized_Term_Months__c']} first={r['LLC_BI__First_Payment_Date__c']} mat={r['LLC_BI__Maturity_Date__c']}  {r['Name'][45:]}")
for r in q(f"SELECT Id, LLC_BI__Loan__c, LLC_BI__Primary_Loan_Purpose__c FROM LLC_BI__Loan_Detail__c WHERE LLC_BI__Loan__c IN {inL}"):
    print(f"  detail {r['Id']} {r['LLC_BI__Loan__c']} purpose={r['LLC_BI__Primary_Loan_Purpose__c']}")
print('  account revenue:', q(f"SELECT AnnualRevenue FROM Account WHERE Id='{ACCT}'")[0]['AnnualRevenue'])
