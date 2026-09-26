#!/usr/bin/env node
// FACTORY CONTROL PLANE V1 - STATIC CONTRACT (WO-7 / WO-8 / WO-10; VERIFICATION_SPEC §3 step 4). Developer verification of the source
// facts the verifier's static gates read; it never stands in for them.
//   E  edge placement: the two functions live under supabase/control-plane/edge/supabase/functions (the Supabase CLI project there),
//      never under supabase/functions (whose master-push workflow deploys to Brain OS production); config.toml sets verify_jwt = false
//      for both (a node session is no Supabase JWT and a Brain OS token is signed by another project: the gateway would refuse every
//      call); the production workflow's path filter cannot match them
//   O  one engine: every Node API route and every Admin API op names exactly ONE SQL front door (factory.node_* / factory.admin_*),
//      and the Edge sources hold no other SQL (no insert / update / delete / DDL, no table name)
//   S  the route / operation inventory equals S-7 exactly
//   P  no plane-conditioned behaviour (S-10): no factory.plane_identity, current_database(), inet_server_addr() / _port(), setting read,
//      in the candidate SQL or Edge sources; the production-ref refusal is the one exception
//   G  WHOLE-REQUEST GATES (CLAUDE.md §6): every refusal an Edge handler can return for a whole request is classified here, and a new
//      unclassified one fails this contract; the platform limits are named UNMEASURED
//   X  secret hygiene in the Edge and web Factory sources: the pepper is read only from the secret store; no service-role key; no
//      database URL literal; the web forwards only the user's own token, and only through lib/factory/admin-client.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EDGE = join(ROOT, 'supabase', 'control-plane', 'edge', 'supabase');
const FN = join(EDGE, 'functions');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name + (detail ? ' - ' + detail : '')); } };

// ---------------------------------------------------------------- E: placement
const NODE_FN = join(FN, 'factory-node-api', 'index.ts');
const ADMIN_FN = join(FN, 'factory-admin-api', 'index.ts');
check('E1 both functions live in the control-plane Supabase project (supabase/control-plane/edge/supabase/functions)', existsSync(NODE_FN) && existsSync(ADMIN_FN));
const rootFns = existsSync(join(ROOT, 'supabase', 'functions')) ? readdirSync(join(ROOT, 'supabase', 'functions')) : [];
check('E2 no factory function under supabase/functions (the Brain OS production deploy directory)', !rootFns.some((n) => /^factory/i.test(n)), rootFns.filter((n) => /^factory/i.test(n)).join(','));
{
  const toml = existsSync(join(EDGE, 'config.toml')) ? read(join(EDGE, 'config.toml')) : '';
  const section = (name) => { const m = new RegExp('\\[functions\\.' + name + '\\]\\n([^\\[]*)').exec(toml); return m ? m[1] : null; };
  check('E3 config.toml: verify_jwt = false for factory-node-api and factory-admin-api (the gateway must pass node sessions and Brain OS tokens to the handlers, which authenticate them)',
    /verify_jwt\s*=\s*false/.test(section('factory-node-api') || '') && /verify_jwt\s*=\s*false/.test(section('factory-admin-api') || ''), toml.slice(0, 300));
  check('E4 config.toml configures no production project (its settings, comments aside)', !/pvphxgrtdfrudejjhzjk/.test(toml.replace(/#.*$/gm, '')));
}
{
  const wf = existsSync(join(ROOT, '.github', 'workflows', 'supabase-functions.yml')) ? read(join(ROOT, '.github', 'workflows', 'supabase-functions.yml')) : '';
  const filters = [...wf.matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1]);
  const globToRe = (g) => new RegExp('^' + g.split('**').map((x) => x.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*') + '$');
  const ours = ['supabase/control-plane/edge/supabase/functions/factory-node-api/index.ts', 'supabase/control-plane/edge/supabase/functions/_shared/node_api.ts'];
  const hit = ours.filter((p) => filters.some((f) => globToRe(f).test(p)));
  check('E5 the Brain OS production functions workflow cannot fire on, or deploy, the Factory functions (its path filters ' + JSON.stringify(filters) + '; it deploys the root project only)',
    filters.length > 0 && hit.length === 0 && /functions deploy --project-ref pvphxgrtdfrudejjhzjk/.test(wf) && !/--workdir/.test(wf), hit.join(','));
}

// ---------------------------------------------------------------- O / S: one engine; the route inventory
const nodeApi = read(join(FN, '_shared', 'node_api.ts'));
const adminApi = read(join(FN, '_shared', 'admin_api.ts'));
const doorsBlock = /export const FRONT_DOORS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(nodeApi);
const doors = doorsBlock ? [...doorsBlock[1].matchAll(/'((?:GET|POST) \/v1\/[a-z/-]+)':\s*'([^']*)'/g)].map((m) => ({ route: m[1], sql: m[2] })) : [];
const S7 = ['GET /v1/time', 'POST /v1/session', 'POST /v1/enroll/start', 'POST /v1/enroll/complete',
  ...['register', 'heartbeat', 'claim', 'renew', 'checkpoint', 'complete', 'release', 'verification-claim', 'certify', 'credential-rotate', 'report-state'].map((o) => 'POST /v1/node/' + o)];
check('S1 the Node API route inventory equals S-7 exactly (' + doors.length + ' routes)', JSON.stringify(doors.map((d) => d.route).sort()) === JSON.stringify([...S7].sort()),
  'extra ' + doors.map((d) => d.route).filter((r) => !S7.includes(r)).join(',') + ' missing ' + S7.filter((r) => !doors.some((d) => d.route === r)).join(','));
const oneDoor = (sql) => { const calls = [...sql.matchAll(/factory\.([a-z_]+)\(/g)].map((m) => m[1]); return calls.length === 1 && /^select factory\.(node|admin)_[a-z_]+\(/.test(sql) ? calls[0] : null; };
const badDoors = doors.filter((d) => !oneDoor(d.sql) || !/^node_/.test(oneDoor(d.sql)));
check('O1 every Node API route is one SELECT of one node front door (factory.node_*)', doors.length > 0 && badDoors.length === 0, badDoors.map((d) => d.route).join(','));
const opsBlock = /export const ADMIN_OPS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(adminApi);
const ops = opsBlock ? [...opsBlock[1].matchAll(/'([a-z-]+)':\s*\{\s*fn:\s*'([a-z_]+)'/g)].map((m) => ({ op: m[1], fn: m[2] })) : [];
check('O2 every Admin API op names exactly one admin front door (factory.admin_*), and the handler calls it through one statement', ops.length >= 20 && ops.every((o) => /^admin_[a-z_]+$/.test(o.fn))
  && /deps\.sql\('select factory\.' \+ op\.fn \+ '\(\$1::uuid, \$2, \$3::text::jsonb\) as r'/.test(adminApi) && (adminApi.match(/deps\.sql\(/g) || []).length === 1, ops.length + ' ops');
{
  const edgeFiles = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.ts$/.test(e.name)) edgeFiles.push(p); } };
  walk(FN);
  // code only: block comments and // comments removed (a header may explain which table a front door checks)
  const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const dml = edgeFiles.filter((f) => /\b(insert\s+into|update\s+factory\.|delete\s+from|create\s+(table|function)|alter\s+table|drop\s+)/i.test(code(f)));
  const tables = edgeFiles.filter((f) => /factory\.(computers|node_credentials|pairing_codes|work_orders|agent_runs|nodes|tenants|tenant_admins|releases)\b/.test(code(f)));
  check('O3 the Edge sources hold no DML / DDL and name no factory table: lifecycle decisions live only in the SQL front doors (' + edgeFiles.length + ' files)', dml.length === 0 && tables.length === 0,
    dml.concat(tables).map((f) => f.slice(ROOT.length + 1)).join(','));
}

// ---------------------------------------------------------------- P: plane-conditioned behaviour
{
  const files = [];
  const walk = (d, re) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, re); else if (re.test(e.name)) files.push(p); } };
  walk(join(ROOT, 'supabase', 'control-plane', 'v1'), /\.sql$/); walk(FN, /\.ts$/);
  const hits = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      const code = f.endsWith('.sql') ? line.replace(/--.*$/, '') : line.replace(/\/\/.*$/, '');
      if (/plane_identity|current_database\s*\(|inet_server_(addr|port)\s*\(|current_setting\s*\(|set_config\s*\(|pg_settings/i.test(code)) hits.push(f.slice(ROOT.length + 1) + ':' + (i + 1));
    });
  }
  check('P1 no plane-conditioned behaviour in the candidate SQL or Edge sources (' + files.length + ' files): no plane_identity, current_database(), inet_server_*(), setting read', hits.length === 0, hits.join(', '));
  const refs = files.filter((f) => /pvphxgrtdfrudejjhzjk/.test(read(f))).map((f) => f.slice(ROOT.length + 1)).sort();
  const dbTs = join(FN, '_shared', 'db.ts');
  check('P2 the production ref appears only as the refusal in _shared/db.ts, and both entry points connect only through it',
    refs.length === 1 && refs[0] === dbTs.slice(ROOT.length + 1) && /url\.toLowerCase\(\)\.includes\(PRODUCTION_REF\)/.test(read(dbTs))
      && [NODE_FN, ADMIN_FN].every((f) => /dbRefusal\(dbUrl, caPem\)/.test(read(f)) && /postgres\(dbUrl, dbOptions\(caPem\)\)/.test(read(f))), refs.join(','));
}

// ---------------------------------------------------------------- G: whole-request gates
// [refusal name, where, classification, what keeps it correct]
const GATES = [
  ['no_such_route', 'both', 'DETERMINISTIC REFUSAL', 'a path outside S-7 (after the platform prefix, route.ts) is 404 by name'],
  ['crypto_unavailable', 'node', 'DETERMINISTIC REFUSAL (fail closed)', 'the RFC 8032 Ed25519 self-test failed at cold start: the API serves nothing rather than verify badly'],
  ['body_too_large', 'both', 'DETERMINISTIC REFUSAL', '64 KiB body cap: every S-7 body is far smaller'],
  ['bad_request', 'both', 'DETERMINISTIC REFUSAL', 'not JSON, not an object, an unknown field, a malformed value - named'],
  ['identity_from_body_refused', 'node', 'DETERMINISTIC REFUSAL', 'a body naming node / tenant / role / envelope (S-4)'],
  ['not_authenticated', 'both', 'DETERMINISTIC REFUSAL', 'no / invalid session or Brain OS token'],
  ['session_invalid', 'node', 'DETERMINISTIC REFUSAL', 'no, an unknown or an expired node session: the runtime opens a new one with its key and retries'],
  ['bad_assertion', 'node', 'DETERMINISTIC REFUSAL', 'a session assertion that is not {v, aud, iat, exp, jti, pk}'],
  ['bad_signature', 'node', 'DETERMINISTIC REFUSAL', 'a session assertion whose Ed25519 signature does not verify'],
  ['bad_proof', 'node', 'DETERMINISTIC REFUSAL', 'enrollment or rotation without proof of possession of the key'],
  ['plane_unavailable', 'node', 'DETERMINISTIC REFUSAL (outcome unknown)', 'the plane did not answer: every node operation is idempotent and safe to retry'],
  ['pepper_unavailable', 'both', 'DETERMINISTIC REFUSAL', 'FACTORY_PAIRING_PEPPER unset: pairing is refused, nothing else is affected'],
  ['server_refused', 'both', 'DETERMINISTIC REFUSAL', 'the plane raised a SQLSTATE: nothing changed (the transaction rolled back)'],
  ['unavailable', 'both', 'DETERMINISTIC REFUSAL (outcome unknown)', 'the plane or Brain OS did not answer: the caller reloads / retries idempotently'],
  ['server_error', 'admin', 'DETERMINISTIC REFUSAL', 'a front door returned nothing'],
  ['misconfigured', 'both', 'DETERMINISTIC REFUSAL', 'the database URL or its CA is unset, or the URL names production (_shared/db.ts): 503 on every request until the founder sets them'],
];
const UNMEASURED = [
  'Edge platform wall-clock and CPU limits per request (measured only at the founder deploy)',
  'the peer address the Edge runtime reports (per-IP pairing limit; if it is the gateway, the limit degrades to plane-wide - stricter, never looser)',
  'whether the platform strips the /<function> path prefix (route.ts accepts both shapes)',
  'postgres.js over the Supabase pooler in transaction mode (prepare: false) under concurrent load',
  'TLS verify-full from the Edge runtime to the pooler host with the CA the founder downloads (proved locally under Deno by edge_db_tls_acceptance; the live host and certificate only at deploy - GET /v1/time is the first live check)',
];
{
  const src = [nodeApi, adminApi, read(join(FN, '_shared', 'enroll.ts')), read(NODE_FN), read(ADMIN_FN)].join('\n');
  const found = new Set([...src.matchAll(/refuse\(\s*\d{3}\s*,\s*'([a-z_]+)'/g), ...src.matchAll(/refused:\s*'([a-z_]+)'/g)].map((m) => m[1]));
  const classified = new Set(GATES.map((g) => g[0]));
  const unclassified = [...found].filter((n) => !classified.has(n));
  const stale = [...classified].filter((n) => !found.has(n));
  check('G1 every whole-request refusal in the Edge sources is classified (' + found.size + ' found): none is an UNSAFE HARD STOP', unclassified.length === 0, 'unclassified: ' + unclassified.join(','));
  check('G2 every classified gate is still in the source (the inventory tracks the code, not a memory of it)', stale.length === 0, 'stale: ' + stale.join(','));
  check('G3 the platform limits are named UNMEASURED, never assumed safe (' + UNMEASURED.length + ')', UNMEASURED.length >= 4);
  for (const g of GATES) console.log('     gate ' + g[0].padEnd(28) + g[1].padEnd(6) + g[2] + ' - ' + g[3]);
  for (const u of UNMEASURED) console.log('     UNMEASURED ' + u);
}

// ---------------------------------------------------------------- X: secrets
{
  const edgeSrc = [nodeApi, adminApi, read(join(FN, '_shared', 'pairing.ts')), read(join(FN, '_shared', 'enroll.ts')), read(NODE_FN), read(ADMIN_FN)].join('\n');
  check('X1 the pairing pepper is read only from the secret store (Deno.env) in the entry points, never from a literal',
    /Deno\.env\.get\('FACTORY_PAIRING_PEPPER'\)/.test(read(NODE_FN)) && /Deno\.env\.get\('FACTORY_PAIRING_PEPPER'\)/.test(read(ADMIN_FN)) && !/FACTORY_PAIRING_PEPPER\s*[:=]\s*['"][A-Za-z0-9+/=]{16,}/.test(edgeSrc));
  const webFiles = ['web/lib/factory/admin-client.ts', 'web/lib/factory/config.ts', 'web/lib/data/factory-computers.ts'].map((p) => join(ROOT, p));
  const webSrc = webFiles.map(read).join('\n');
  check('X2 no service-role key, database URL or pepper in the Edge or web Factory sources', !/service_role|SERVICE_ROLE|postgres(ql)?:\/\/|FACTORY_PAIRING_PEPPER/.test(webSrc) && !/service_role|postgres(ql)?:\/\/[^'"\s]*@/.test(edgeSrc));
  const client = read(webFiles[0]);
  check('X3 the web forwards only the user\'s own token, after supabase.auth.getUser(), and only from lib/factory/admin-client.ts',
    /auth\.getUser\(\)/.test(client) && client.indexOf('auth.getUser()') < client.indexOf('authorization: `Bearer ${token}`') && /sessionData\.session\?\.access_token/.test(client)
      && !/fetch\(/.test(read(webFiles[2]).replace(/await fetch\(url, \{ cache: "no-store", signal: AbortSignal\.timeout\(120000\) \}\)/, '')));
}

console.log('\nfactory_v1_static_contract: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
