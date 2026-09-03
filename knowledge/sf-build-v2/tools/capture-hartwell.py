# Re-reads Hartwell through the SAME invocable path the connector uses and writes the
# result to a JSON file, so the bundle is refreshed from the org rather than hand-edited.
#
# The reads are the Customer360* @InvocableMethod classes, reached at
# POST /services/data/<v>/actions/custom/apex/<ClassName> with {"inputs":[{"accountId":...}]}.
# The response's outputValues ARE the wrapper shape the Salesforce-hosted MCP emits, which
# is exactly the shape artifact/live-data.json stores, so nothing is reshaped on the way in.
#
#   python3 knowledge/sf-build-v2/tools/capture-hartwell.py [outFile]
import json, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from sfrest import call, ACCT

V = 'v62.0'
READS = {
    'snapshot': 'Customer360Snapshot',
    'exposure': 'Customer360Exposure',
    'covenants': 'Customer360Covenants',
    'graph': 'Customer360RelationshipGraph',
    'opportunities': 'Customer360Opportunities',
    'signals': 'Customer360StructuralSignals',
    'catalog': 'Customer360Catalog',
    'activity': 'Customer360ActionHistory',
}

out = {}
for key, cls in READS.items():
    try:
        res = call('POST', f'/services/data/{V}/actions/custom/apex/{cls}',
                   {'inputs': [{'accountId': ACCT}]})
    except SystemExit as e:
        print(f'  {key:14s} UNREACHABLE  {str(e)[:120]}')
        continue
    row = res[0]
    if not row.get('isSuccess'):
        print(f'  {key:14s} FAILED  {json.dumps(row.get("errors"))[:200]}')
        continue
    out[key] = row['outputValues']
    n = len(json.dumps(out[key]))
    print(f'  {key:14s} ok  {n} bytes')

path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/hartwell-reads.json'
with open(path, 'w') as f:
    json.dump(out, f, indent=2)
print('wrote', path)
