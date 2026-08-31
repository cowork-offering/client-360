import json, os, urllib.request, urllib.parse
TOK, INST = os.environ['TOK'], os.environ['INST']
V='v62.0'; NEW_PKG=os.environ.get('NEW_PKG','a5Fbb000000J0CPEA0'); ACCT='001bb00001I7FPNAA3'
def call(m,p,b=None):
    req=urllib.request.Request(INST+p,method=m,headers={'Authorization':'Bearer '+TOK,'Content-Type':'application/json'},data=json.dumps(b).encode() if b else None)
    with urllib.request.urlopen(req) as r:
        d=r.read(); return json.loads(d) if d else None
def q(s): return call('GET',f'/services/data/{V}/query?q='+urllib.parse.quote(s))['records']
def ids(s): return [r['Id'] for r in q(s)]
def delete(idl,label):
    n=0
    for i in range(0,len(idl),200):
        for r in call('DELETE',f'/services/data/{V}/composite/sobjects?ids='+','.join(idl[i:i+200])+'&allOrNone=false'):
            if r['success']: n+=1
            else: print(f'  FAIL {label} {r["id"]}: {json.dumps(r["errors"])[:200]}')
    print(f'deleted {n}/{len(idl)} {label}')

clones = ids(f"SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c='{NEW_PKG}'")
inC = "('" + "','".join(clones) + "')" if clones else None
chain = set()
if clones: chain |= set(ids(f"SELECT Id FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__RenewalLoanId__c IN {inC}"))
chain |= set(ids(f"SELECT Id FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__ParentLoanId__c IN (SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}')"))
delete(sorted(chain),'chain rows')
if clones: delete(clones,'clones')
delete([NEW_PKG],'package')
print('--- BASELINE VERIFY ---')
print('packages:', len(q(f"SELECT Id FROM LLC_BI__Product_Package__c WHERE LLC_BI__Account__c='{ACCT}'")))
print('loans:', len(q(f"SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}'")))
print('chain rows:', len(q(f"SELECT Id FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__ParentLoanId__c IN (SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}')")))
print('fees org-wide:', [r['Id'] for r in q("SELECT Id FROM LLC_BI__Fee__c")])
print('LoC amount:', q("SELECT LLC_BI__Amount__c FROM LLC_BI__Loan__c WHERE Id='a4Zbb0000027MaYEAU'")[0]['LLC_BI__Amount__c'])
print('graph on parents: pledges', len(q(f"SELECT Id FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c IN (SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}')")),
      '| cov junctions', len(q(f"SELECT Id FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c IN (SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}')")),
      '| involvements', len(q(f"SELECT Id FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c IN (SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}')")),
      '| streams', len(q(f"SELECT Id FROM LLC_BI__Pricing_Stream__c WHERE LLC_BI__Loan__c IN (SELECT Id FROM LLC_BI__Loan__c WHERE LLC_BI__Account__c='{ACCT}')")))
