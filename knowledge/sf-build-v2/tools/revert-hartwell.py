import json, os, sys, urllib.request, urllib.parse

TOK, INST = os.environ['TOK'], os.environ['INST']
V = 'v62.0'
ANCHOR_PKG = 'a5Fbb000000IHFJEA4'
NEW_PKG = os.environ.get('NEW_PKG', 'a5Fbb000000J0CPEA0')
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

def ids(soql):
    return [r['Id'] for r in q(soql)]

def delete(idlist, label):
    n = 0
    for i in range(0, len(idlist), 200):
        chunk = idlist[i:i+200]
        res = call('DELETE', f'/services/data/{V}/composite/sobjects?ids=' + ','.join(chunk) + '&allOrNone=false')
        for r in res:
            if r['success']: n += 1
            else: print(f'  FAIL {label} {r["id"]}: {json.dumps(r["errors"])[:200]}')
    print(f'deleted {n}/{len(idlist)} {label}')
    return n

clones = ids(f"SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c='{NEW_PKG}'")
print('clones:', len(clones), clones)
if not clones: sys.exit('no clones found - abort')
inC = "('" + "','".join(clones) + "')"

# 1. pledges first (deleting them mints aggregates - sweep later)
delete(ids(f"SELECT Id FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c IN {inC}"), 'pledges')
# 2. junctions + fees + streams on clones
delete(ids(f"SELECT Id FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c IN {inC}"), 'covenant junctions')
delete(ids(f"SELECT Id FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c IN {inC}"), 'involvements')
delete(ids(f"SELECT Id FROM LLC_BI__Fee__c WHERE LLC_BI__Loan__c IN {inC}"), 'fees')
delete(ids(f"SELECT Id FROM LLC_BI__Pricing_Stream__c WHERE LLC_BI__Loan__c IN {inC}"), 'streams')
# 3. aggregate orphan sweep - LOOP (no loan back-ref on the object)
for pass_n in range(1, 8):
    all_aggs = set(ids("SELECT Id FROM LLC_BI__Loan_Collateral_Aggregate__c"))
    referenced = set(r['LLC_BI__Loan_Collateral_Aggregate__c'] for r in q("SELECT LLC_BI__Loan_Collateral_Aggregate__c FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan_Collateral_Aggregate__c != null"))
    orphans = sorted(all_aggs - referenced)
    if not orphans:
        print(f'aggregate sweep pass {pass_n}: clean'); break
    print(f'aggregate sweep pass {pass_n}: {len(orphans)} orphans')
    delete(orphans, 'aggregates')
# 3a. THE LOAN DETAIL ROWS ON THE CLONES AND ON ANY NET-NEW FACILITY.
# nCino creates one per loan from its own after-commit flow, and it is the record
# complete_new_facility_detail writes the primary loan purpose onto. It carries a
# loan lookup, so it is swept with the loans rather than left behind as an orphan.
delete(ids(f"SELECT Id FROM LLC_BI__Loan_Detail__c WHERE LLC_BI__Loan__c IN {inC}"), 'loan details')

# 3b. NET-NEW COVENANTS, opt-in. The junction sweep above takes the covenant OFF the clone; the
# LLC_BI__Covenant2__c record itself lives on the ACCOUNT and survives every step here, which is
# correct for a covenant the relationship already held and wrong for one a drive minted. Pass the
# ids the run reported and they go, with their LLC_BI__Account_Covenant__c rows. Default is
# unchanged: with the variable unset nothing on the account is touched.
new_covs = [c.strip() for c in os.environ.get('NEW_COVENANTS', '').split(',') if c.strip()]
if new_covs:
    inCov = "('" + "','".join(new_covs) + "')"
    delete(ids(f"SELECT Id FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Covenant2__c IN {inCov}"), 'net-new covenant junctions')
    delete(ids(f"SELECT Id FROM LLC_BI__Account_Covenant__c WHERE LLC_BI__Covenant2__c IN {inCov}"), 'net-new account covenants')
    delete(new_covs, 'net-new covenants')

# 4-7: run revert-finish.py next (chain rows, clones, package, verify) - SOQL refuses OR beside a semi-join, finish splits it
print('graph cleared - now run revert-finish.py with the same NEW_PKG')
