"""The three REST calls every Hartwell build tool makes, and nothing else.

The token comes from the environment and never touches a log line, an argv or a
file: `read TOK INST <<< "$(~/.local/bin/bankinggpt-rest)"; export TOK INST`.
"""
import json, os, urllib.request, urllib.parse

V = 'v62.0'
ACCT = '001bb00001I7FPNAA3'

def _tok():
    return os.environ['TOK'], os.environ['INST']

def call(method, path, body=None):
    tok, inst = _tok()
    req = urllib.request.Request(inst + path, method=method,
        headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'},
        data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(req) as r:
            d = r.read()
            return json.loads(d) if d else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path.split("?")[0]} -> {e.code}\n{e.read().decode()[:800]}')

def q(soql):
    return call('GET', f'/services/data/{V}/query?q=' + urllib.parse.quote(soql))['records']

def describe(obj):
    return call('GET', f'/services/data/{V}/sobjects/{obj}/describe')

def create(obj, records, label=None):
    """Composite create. Returns the new ids in order, and dies loudly on any failure,
    because a half-written package is the one outcome this build may not produce."""
    out = []
    for i in range(0, len(records), 200):
        chunk = [dict(r, attributes={'type': obj}) for r in records[i:i + 200]]
        res = call('POST', f'/services/data/{V}/composite/sobjects',
                   {'allOrNone': True, 'records': chunk})
        for r in res:
            if not r['success']:
                raise SystemExit(f'CREATE {obj} FAILED: {json.dumps(r["errors"])[:600]}')
            out.append(r['id'])
    print(f'  created {len(out)} {label or obj}')
    return out

def update(obj, records, label=None):
    for i in range(0, len(records), 200):
        chunk = [dict(r, attributes={'type': obj}) for r in records[i:i + 200]]
        res = call('PATCH', f'/services/data/{V}/composite/sobjects',
                   {'allOrNone': True, 'records': chunk})
        for r in res:
            if not r['success']:
                raise SystemExit(f'UPDATE {obj} FAILED: {json.dumps(r["errors"])[:600]}')
    print(f'  updated {len(records)} {label or obj}')
