"""Read-only audit of qa/FIXTURE_REGISTRY.json vs other qa artifacts. Worker W2, campaign C002.
Writes nothing except stdout. Run from the qa/ directory."""
import json, os, re, collections
from pathlib import Path

r = json.load(open('FIXTURE_REGISTRY.json', encoding='utf-8'))
fx = r['fixtures']
INV = 'CAPABILITY_INVENTORY.json'
BQ = 'BUG_QUEUE.json'

files = {}
for p in Path('.').rglob('*'):
    if not p.is_file():
        continue
    s = p.as_posix()
    if 'node_modules' in s or '/.git/' in s:
        continue
    if s == 'FIXTURE_REGISTRY.json' or s.startswith('runs/C002/W2'):
        continue
    if p.suffix not in ('.json', '.md', '.txt', '.ts', '.js', '.py', '.ps1', '.sh', '.yaml', '.yml', '.log'):
        continue
    try:
        files[s] = p.read_text(encoding='utf-8', errors='replace')
    except Exception:
        pass
print('files scanned:', len(files))


def refs(tok):
    out = collections.OrderedDict()
    for p, t in files.items():
        c = t.count(tok)
        if c:
            out[p] = c
    return out


print('\n=== FORWARD: per-fixture references (registry -> artifacts) ===')
forward = {}
for f in fx:
    toks = collections.OrderedDict()
    toks['fixture_id'] = f['fixture_id']
    for k in ('name', 'synthetic_display_name'):
        v = f.get(k)
        if v and v not in toks.values():
            toks[k] = v
    if f.get('canonical_id'):
        toks['canonical_id'] = f['canonical_id']
    print(f"\n## {f['fixture_id']}  lifecycle={f.get('lifecycle')} state={f.get('state')} canonical={f.get('canonical_id')}")
    forward[f['fixture_id']] = {}
    for k, v in toks.items():
        rr = refs(v)
        inv = rr.get(INV, 0)
        bq = rr.get(BQ, 0)
        others = {p: c for p, c in rr.items() if p not in (INV, BQ)}
        forward[f['fixture_id']][k] = {'value': v, 'inventory': inv, 'bug_queue': bq, 'other': others}
        print(f"  {k}={v!r}: INVENTORY={inv} BUG_QUEUE={bq} other_files={len(others)} {list(others.items())[:8]}")

print('\n=== REVERSE: fixture-looking tokens in INVENTORY / BUG_QUEUE not in registry ===')
known = set()
for f in fx:
    for k in ('fixture_id', 'name', 'synthetic_display_name', 'canonical_id'):
        if f.get(k):
            known.add(f[k])
pat = re.compile(r'\b(?:FX-[A-Z0-9-]+|LEGACY-[A-Za-z0-9-]+|QA-[A-Z0-9][A-Za-z0-9-]*|CFWO-[A-Za-z0-9 -]+|C00\d-W\d-[a-z]+-\d+)\b')
uuid = re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')
for src in (INV, BQ):
    t = files[src]
    toks = collections.Counter(pat.findall(t))
    print(f'\n-- {src}: fixture-like tokens --')
    for tok, c in sorted(toks.items()):
        flag = '' if tok in known else '  <-- NOT IN REGISTRY'
        print(f'  {tok!r} x{c}{flag}')
    us = collections.Counter(uuid.findall(t))
    print(f'-- {src}: uuids --')
    for u, c in sorted(us.items()):
        flag = '' if u in known else '  <-- NOT IN REGISTRY'
        print(f'  {u} x{c}{flag}')

print('\n=== STRUCTURE: where do INVENTORY and BUG_QUEUE store fixture refs? ===')
inv = json.load(open(INV, encoding='utf-8'))
bq = json.load(open(BQ, encoding='utf-8'))
print('INVENTORY top keys:', list(inv.keys()) if isinstance(inv, dict) else type(inv))
print('BUG_QUEUE top keys:', list(bq.keys()) if isinstance(bq, dict) else type(bq))


def keyscan(obj, path='', acc=None):
    if acc is None:
        acc = collections.Counter()
    if isinstance(obj, dict):
        for k, v in obj.items():
            if 'fixture' in k.lower():
                acc[path + '.' + k] += 1
            keyscan(v, path + '.' + k if not k.isdigit() else path, acc)
    elif isinstance(obj, list):
        for v in obj:
            keyscan(v, path + '[]', acc)
    return acc


print('INVENTORY fixture-ish keys:', dict(keyscan(inv)))
print('BUG_QUEUE fixture-ish keys:', dict(keyscan(bq)))

print('\n=== INTERNAL CONSISTENCY ===')
ls = set(r['lifecycle_states'])
ids = collections.Counter(f['fixture_id'] for f in fx)
print('duplicate fixture_ids:', [k for k, v in ids.items() if v > 1])
cids = collections.Counter(f['canonical_id'] for f in fx if f.get('canonical_id'))
print('duplicate canonical_ids:', [k for k, v in cids.items() if v > 1])
names = collections.Counter((f.get('name') or f.get('synthetic_display_name')) for f in fx)
print('duplicate names:', [k for k, v in names.items() if v > 1])
for f in fx:
    issues = []
    if f.get('lifecycle') not in ls:
        issues.append(f"lifecycle={f.get('lifecycle')!r} not in enum")
    if 'state' in f and f.get('state') != f.get('lifecycle'):
        issues.append(f"state={f.get('state')!r} != lifecycle={f.get('lifecycle')!r}")
    if f.get('name') and f.get('synthetic_display_name') and f['name'] != f['synthetic_display_name']:
        issues.append('name != synthetic_display_name')
    if f.get('canonical_id') is None and f.get('lifecycle') in ('REGISTERED', 'ACTIVE'):
        issues.append('canonical_id null while mutation-authorized lifecycle')
    if f.get('canonical_id') is None and f.get('state') == 'ACTIVE':
        issues.append('canonical_id null while state ACTIVE')
    if not f.get('owner_worker_id'):
        issues.append('no owner_worker_id')
    if not f.get('authorized_worker_ids'):
        issues.append('no authorized_worker_ids')
    if not f.get('scenario_id'):
        issues.append('no scenario_id')
    if issues:
        print(f"  {f['fixture_id']}: " + '; '.join(issues))

json.dump(forward, open('runs/C002/W2/EVIDENCE/forward_refs.json', 'w', encoding='utf-8'), indent=1)
