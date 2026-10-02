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
//      unclassified one fails this contract; so is every 429 / 503 refusal of the SQL front doors; the platform limits are named
//      UNMEASURED. The peer address is read only from what the runtime reports (peer.ts), never a forwarding header; the Edge handlers
//      turn no error into an answer about the request (their only catches are the caller's-input parses and one request boundary)
//   PA every refusal of the two enrollment front doors is preceded, on its path, by its pairing_attempts row (S-6 "every attempt is
//      audited"); the enrollment walk is written by one AFTER trigger and every state update names its actor; the enrollment front doors
//      take the plane's one lock order (computer, code, enrollment), then the S-6 keys, then read the clock
//   X  secret hygiene in the Edge and web Factory sources: the pepper is read only from the secret store; no service-role key; no
//      database URL literal; the web forwards only the user's own token, and only through lib/factory/admin-client.ts
//   M  the candidate migration (WO-1 r3): no 69df2f52 control-plane file changed; the Director instrument, run from the designated
//      Director commit as an external tool, builds the live-migration step from it; the r3 instrument-integrity constructs are absent
//   R  the migration's privilege model (S-10; VERIFICATION_SPEC §3.4 r3), read from the SQL split into statements, DO blocks and
//      function bodies: outside function bodies nothing refers to the applying login or reads a login's or an object owner's name or
//      attributes; the roles exist by construction; no exception handler swallows a plane-configuration-dependent error; SET ROLE is
//      closed in the file that opens it; part 990's revokes by name cover exactly the relations and identity sequences the
//      migration creates; the legacy guard's 69df2f52 column lists equal part 000's reference list, and no statement drops, renames
//      or retypes a 69df2f52 column; the founder's prepared steps read no owner or applying-login attribute and step 1 is the r3 step; every
//      function pins `search_path = pg_catalog, pg_temp` and the identity tests compare with pg_catalog.name constants, in exactly
//      that shape
//   X4 migration.mjs apply accepts no database URL as an argument, and stops at the production ref and the live Factory ref before
//      it opens a connection; X4b it judges that on what pg's own parser reads from the URL, not only on its text (the class of
//      C2-S1), refuses a URL that leaves the host, user or database to the environment, and connects with what it judged
//   H1 the v1 suites send migration text to a database only through applyAsApplyingLogin, which refuses a superuser login
//   A  admin authority (S-8, S-9; B-4): each Admin API front door calls factory._admin before its first factory table access; the
//      envelope amendment takes its founder-only decision after its tenant-filtered row lock, on the envelope read under it; the Edge
//      puts a pairing code in a receipt only when the SQL answer proves that code was recorded, and the web renders one only from such
//      a receipt; the op, route and body-field tables are read by own property only; the per-tenant serialization lock is FOR NO
//      KEY UPDATE, and the publish and the key revoke both take it
//   C  the installer's inputs (S-12, S-5; B-3, B-5, L6-3, L6-8): committed code and documents put a pairing code in no argument list,
//      and the three spawning harnesses refuse to; a refusal never shows an argument; the founder's prepared steps never display or
//      inline a generated secret and shred the one file they create, and the founder's tool reads no environment value; the argv
//      guard reads a code exactly as pairing.ts does, spellings included; a web test never reaches the live plane; every release
//      verification names the revocations it checks against
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
  // any factory.<name> that is not a function call names a relation: whatever table it is (not a fixed list of table names)
  const tables = edgeFiles.flatMap((f) => [...code(f).matchAll(/\bfactory\.([a-z_][a-z_0-9]*)\b(?!\s*\()/g)].map((m) => f.slice(ROOT.length + 1) + ': factory.' + m[1]));
  const calls = edgeFiles.flatMap((f) => [...code(f).matchAll(/\bfactory\.([a-z_][a-z_0-9]*)\s*\(/g)].map((m) => m[1])).filter((n) => !/^node_[a-z_]+$/.test(n));
  check('O3 the Edge sources hold no DML / DDL, name no factory relation (any factory.<name> that is not a call) and call no factory function but the node_* front doors (the Admin API\'s one call site builds its admin_* name from ADMIN_OPS): lifecycle decisions live only in the SQL front doors (' + edgeFiles.length + ' files)',
    dml.length === 0 && tables.length === 0 && calls.length === 0, JSON.stringify({ dml: dml.map((f) => f.slice(ROOT.length + 1)), tables, calls }));
  // O4 ONE SQL STATEMENT PER REQUEST, from the source: each API has exactly one SQL execution site, reached at most once per request
  const edgeCode = (p) => code(join(FN, p));
  const nodeC = edgeCode('_shared/node_api.ts'), adminC = edgeCode('_shared/admin_api.ts'), enrollC = edgeCode('_shared/enroll.ts');
  const count = (t, re) => (t.match(re) || []).length;
  const fnBody = (t, header) => { const i = t.indexOf(header); if (i < 0) return ''; let d = 0, j = t.indexOf('{', i); const s = j; for (; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}') { d--; if (!d) break; } } return t.slice(s, j + 1); };
  // a call site inside a loop or a fan-out (for / while / do, .map / .forEach / .reduce / .flatMap / .filter / .some / .every, Promise.all)
  const inLoop = (t, re) => [...t.matchAll(re)].some((m) => {
    const stack = []; for (let k = 0; k < m.index; k++) { if (t[k] === '{' || t[k] === '(') stack.push(k); else if ((t[k] === '}' || t[k] === ')') && stack.length) stack.pop(); }
    return stack.some((k) => /(\bfor\b|\bwhile\b|\bdo\b|\.(map|forEach|reduce|flatMap|filter|some|every|find)\s*|Promise\.(all|allSettled|race|any)\s*)\s*(\([^)]*\)\s*(=>)?\s*)?$/.test(t.slice(Math.max(0, k - 60), k + 1).replace(/[{(]$/, '')));
  });
  const edgeAllC = edgeFiles.map(code).join('\n');
  const shapes = {
    nodeOneSqlCall: count(nodeC, /\bdeps\.sql\(/g) === 1 && /deps\.sql\(/.test(fnBody(nodeC, 'async function frontDoor(')),
    adminOneSqlCall: count(adminC, /\bdeps\.sql\(/g) === 1 && /deps\.sql\(/.test(fnBody(adminC, 'export function createAdminApi(')),
    noOtherSqlCall: edgeFiles.every((f) => { const t = code(f); return f.endsWith(join('_shared', 'node_api.ts')) || f.endsWith(join('_shared', 'admin_api.ts')) || !/\bdeps\.sql\(/.test(t); }),
    entryPointsOneUnsafe: [NODE_FN, ADMIN_FN].every((f) => { const t = code(f); return count(t, /\bdb\.unsafe\(/g) === 1 && count(t, /\bpostgres\(/g) === 1; }),
    noOtherDriverApi: !/\bsql`|\.begin\(|\.file\(|\.reserve\(|\.listen\(|\.notify\(|\.subscribe\(|\bdb\.(query|begin|file|reserve)\b|\.unsafe\(/.test(edgeAllC.replace(/\bdb\.unsafe\(text, params( as never\[\])?\)/g, '')),
    noSqlInLoop: !inLoop(nodeC, /\bdeps\.sql\(|\bfrontDoor\(/g) && !inLoop(adminC, /\bdeps\.sql\(/g) && !inLoop(enrollC, /\bfrontDoor\(/g),
    // every frontDoor call is returned, or its response returned after at most a JSON re-shape: one per request path
    frontDoorSites: count(fnBody(nodeC, 'export function createNodeApi('), /\bfrontDoor\(/g) === 4 && count(enrollC, /\bfrontDoor\(/g) === 2
      && [...fnBody(nodeC, 'export function createNodeApi(').matchAll(/^.*\bfrontDoor\(.*$/gm)].every((l) => /^\s*(if \([^)]*\) )?return await frontDoor\(|^\s*const res = await frontDoor\(/.test(l[0])),
  };
  check('O4 one SQL statement per request, from the source: deps.sql is called at exactly one site per API (node_api.ts frontDoor; admin_api.ts createAdminApi), each entry point runs db.unsafe and postgres() once, no other postgres.js API (sql`...`, begin, file, reserve, listen, notify, subscribe) is used, no SQL call or front-door call sits in a loop or fan-out, and the four node routes\' and two enrollment routes\' frontDoor calls are each returned',
    Object.values(shapes).every(Boolean), JSON.stringify(shapes));
  // S2 THE ROUTE IS DECIDED ONLY BY THE TABLES: the request URL is read in exactly one place per API (to compute the route); the Node API
  // answers only an own entry of FRONT_DOORS and the Admin API only an own entry of ADMIN_OPS; the entry points read no URL at all
  const urlUses = (t) => [...t.matchAll(/\breq\.url\b|\.pathname\b|\burl\.(href|search|hash|host|hostname|origin|searchParams)\b/g)].map((m) => m[0]);
  const routeShape = {
    nodeUrlOnce: count(nodeC, /new URL\(req\.url\)/g) === 1 && JSON.stringify(urlUses(nodeC)) === JSON.stringify(['req.url', '.pathname', '.pathname'])
      && /const route = req\.method \+ ' ' \+ routePath\(url\.pathname, deps\.basePath\);\s*if \(!Object\.hasOwn\(FRONT_DOORS, route\)\) return refuse\(404,/.test(nodeC),
    adminUrlOnce: count(adminC, /new URL\(req\.url\)/g) === 1 && JSON.stringify(urlUses(adminC)) === JSON.stringify(['req.url', '.pathname', '.pathname'])
      && /const m = \/\^\\\/v1\\\/admin\\\/\(\[a-z-\]\{3,40\}\)\$\/\.exec\(routePath\(url\.pathname, deps\.basePath\)\);/.test(adminC),
    entryPointsNoUrl: [NODE_FN, ADMIN_FN].every((f) => urlUses(code(f)).length === 0 && !/new URL\(/.test(code(f))),
    routeTsPure: /export function routePath\(pathname: string, basePath = ''\): string \{\s*return basePath && pathname\.startsWith\(basePath \+ '\/'\) \? pathname\.slice\(basePath\.length\) : pathname;\s*\}/.test(edgeCode('_shared/route.ts')),
  };
  check('S2 the Edge decides a route only through its table: node_api.ts reads the request URL once, to compute the route, and answers only an own entry of FRONT_DOORS (404 otherwise); admin_api.ts reads it once and answers only an own entry of ADMIN_OPS; the entry points read no URL; route.ts strips only the function\'s own prefix',
    Object.values(routeShape).every(Boolean), JSON.stringify(routeShape));
}

// ---------------------------------------------------------------- P: plane-conditioned behaviour (S-10; VERIFICATION_SPEC §3.4 r3)
// The developer approximation of the verifier's scan (factory_v1_plane_scan.mjs): the hit list and its contexts, the classes, the
// derived values, the platform-schema and secret-setting inventories, over S-10's scope - the candidate migration (the files M1 hands
// the Director instrument), every Edge source, and the founder's prepared steps. The PLATFORM list and the SECRETISH pattern are read
// from the Director catalog tool at the designated Director commit (never copied into this tree). The class of each hit is the
// implementer's PROPOSAL (factory_v1_plane_scan_inventory.mjs); the verifier classes every hit itself.
const DIRECTOR_COMMIT = process.env.FACTORY_DESIGNATED_DIRECTOR || 'c7a845b61a3b0b419e8c9dfeff397547fdc75b03';
// THE DIRECTOR'S CR-DISPOSITION RECORD (2026-09-30): the designated Director commit that records the decision on each change request
// the implementer filed (CR-006..CR-026). It is NOT a product-semantic revision: the candidate's contract stays DIRECTOR_COMMIT (r3), and
// the Director's documents in this tree stay byte-identical to it. P3p reads the ledger at this commit; H2 accepts citations of it.
const CR_DISPOSITION_COMMIT = 'a0bb79856a7a82ea8277c7bbf3a23ad6cc0631a0';
const BASE_COMMIT = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
const gitOut = (...a) => { const r = spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }); return r.status === 0 ? r.stdout : null; };
const byteOrder = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
/** the candidate migration (contract §1; WO-1 r3): every .sql added under supabase/control-plane/ since 69df2f52 (edge/ excluded), untracked included */
const candidateMigration = () => [...new Set([...(gitOut('diff', '--name-only', '--diff-filter=A', BASE_COMMIT, '--', 'supabase/control-plane/') || '').trim().split('\n'),
  ...(gitOut('ls-files', '--others', '--exclude-standard', '--', 'supabase/control-plane/') || '').trim().split('\n')])]
  .filter((p) => p && p.endsWith('.sql') && !p.startsWith('supabase/control-plane/edge/')).sort(byteOrder);
{
  const scan = await import('./factory_v1_plane_scan.mjs');
  const { INVENTORY, PLATFORM_WRITES, SECRET_SETTINGS, UNTRACED } = await import('./factory_v1_plane_scan_inventory.mjs');
  // P0 the scanner's own self-test: every construct of the r3 hit list found in a synthetic case, and the negative controls clean
  const self = scan.selfTest();
  const selfBad = self.filter((x) => !x.ok);
  check('P0 the plane scan\'s self-test (' + self.length + ' synthetic cases: each §3.4 r3 hit construct this approximation implements, in its context - current_catalog / current_database, server address and version, settings, transaction ids, sequences, statistics, catalog and platform reads, a fixed-date comparison, the applying login and owner reads, swallowed plane-dependent exceptions, dynamic SQL, identifying constants, a value derived and stored, a branch on the database name, the server, a transaction id or a statistic HARD whatever an inventory proposes, Edge environment branches, the request host and private addresses - and the negative controls: a function SET clause, SET LOCAL of a timeout, comment text, session_user in a SECURITY DEFINER body, the superuser refusal, current_database() naming the database of a GRANT. NOT implemented, stated in the scanner\'s LIMITS: a row count no stated rule makes; the founder steps\' shell commands and tools; a role or schema name literal)',
    self.length >= 75 && selfBad.length === 0, selfBad.map((x) => x.name + (x.detail ? ' (' + x.detail + ')' : '')).join(' | '));
  // the Director catalog tool's lists
  const tool = gitOut('show', DIRECTOR_COMMIT + ':qa/verification/auto-enrollment-v1/tools/live_catalog_snapshot.mjs') || '';
  const platM = /const PLATFORM = \[([\s\S]*?)\];/.exec(tool), secM = /const SECRETISH = \/(.*?)\/([a-z]*);/.exec(tool);
  const PLATFORM = platM ? [...platM[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
  const SECRETISH = secM ? new RegExp(secM[1], secM[2]) : null;
  // THE SCOPE: the candidate migration, every Edge .ts (tracked or not), and the founder's prepared steps
  const mig = candidateMigration();
  const EDGE_DIR = 'supabase/control-plane/edge/supabase/functions/';
  const edgeTs = [...new Set([...(gitOut('ls-files', '--', EDGE_DIR) || '').trim().split('\n'), ...(gitOut('ls-files', '--others', '--exclude-standard', '--', EDGE_DIR) || '').trim().split('\n')])]
    .filter((p) => p && p.endsWith('.ts') && existsSync(join(ROOT, p))).sort(byteOrder);
  const STEPS = 'qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md';
  const steps = scan.founderStepSql(read(join(ROOT, STEPS)));
  const changed = [...new Set([...(gitOut('diff', '--name-only', '--diff-filter=AM', BASE_COMMIT, '--', 'supabase/control-plane/') || '').trim().split('\n'),
    ...(gitOut('ls-files', '--others', '--exclude-standard', '--', 'supabase/control-plane/') || '').trim().split('\n')])].filter((p) => /\.(sql|ts)$/.test(p || ''));
  const inScope = new Set([...mig, ...edgeTs]);
  const outOfScope = changed.filter((p) => !inScope.has(p));
  check('P1 the scan covers S-10\'s scope: the candidate migration (' + mig.length + ' files, the list M1 hands the Director instrument), every Edge source (' + edgeTs.length + ' .ts files), and the founder\'s prepared steps\' SQL (' + steps.length + ' SQL blocks and statement spans; their shell commands and the founder tools are outside this scan, as its LIMITS state); every .sql and .ts added or changed under supabase/control-plane/ since 69df2f52 is in it; the Director tool\'s PLATFORM list and SECRETISH pattern are read at ' + DIRECTOR_COMMIT.slice(0, 8),
    mig.length >= 20 && edgeTs.length >= 9 && steps.length >= 8 && outOfScope.length === 0 && PLATFORM.includes('pg_catalog') && PLATFORM.includes('auth') && PLATFORM.length >= 15 && SECRETISH !== null,
    JSON.stringify({ outOfScope, platform: PLATFORM.length, secretish: String(SECRETISH) }));
  const sqlRes = scan.scanSql([...mig.map((p) => ({ path: p, text: read(join(ROOT, p)), kind: 'migration' })),
    ...steps.map((s) => ({ path: STEPS, text: s.text, kind: 'step', lineOffset: s.line - 1 }))], { platform: PLATFORM, secretish: SECRETISH || /key|secret|password|token|jwt/i });
  const edgeRes = scan.scanEdge(edgeTs.map((p) => ({ path: p, text: read(join(ROOT, p)) })));
  const hits = [...sqlRes.hits, ...edgeRes.hits];
  // a not-a-hit proposal is checked against the key values the migration's own top-level INSERTs write (insertedKeys)
  const seeded = scan.insertedKeys(mig.map((p) => ({ path: p, text: read(join(ROOT, p)) })));
  const cls = scan.classify(hits, INVENTORY, { seeded });
  // UNTRACED: what the approximation cannot follow, listed by hand; every anchor must still be in the source
  const untraced = (UNTRACED || []).map((e) => {
    const missing = [], lines = [];
    for (const [file, re, role] of e.anchors) {
      const text = existsSync(join(ROOT, file)) ? read(join(ROOT, file)) : '';
      const ms = [...text.matchAll(new RegExp(re, 'gm'))];
      if (!ms.length) missing.push(file.replace(/^.*\//, '') + ' /' + re.slice(0, 48) + '/');
      else if (role === 'hit' && file === e.file) for (const m of ms) lines.push(text.slice(0, m.index).split('\n').length);
    }
    return { entry: e, missing, lines: [...new Set(lines)].sort((a, b) => a - b) };
  });
  const untracedBad = untraced.filter((u) => u.missing.length || !u.lines.length || !(u.entry.pending || scan.CLASSES.includes(u.entry.cls)));

  const fmt = (h) => h.file.replace(/^.*\//, '') + ':' + h.line + ' ' + h.construct + (h.value ? '(' + h.value + ')' : '') + (h.fn ? ' in ' + h.fn : '') + ' [' + h.ctx + ']' + (h.hard ? ' - ' + h.hard : '');
  check('P2 no hit that fits no class (§3.4 r3): no applying-login or owner name / attribute / membership read in a migration statement, DO block, SECURITY DEFINER body or founder step; no session_user in a migration statement or founder step; no plane_identity; no current time against a fixed date, time of day or weekday; no branch on the database name, the server\'s address or version, a transaction id or a statistic (current_database() as a GRANT\'s database aside); no swallowed plane-dependent exception; no request host, forwarded header or loopback / private address in the Edge (' + hits.length + ' hits scanned)',
    cls.hard.length === 0, cls.hard.map(fmt).join(' | '));
  const nonPendingBranch = cls.branchBad.filter((b) => !b.entry.pending);
  check('P3 every other hit is classified by the implementer\'s proposal with an r3 class and its exact count (' + cls.matched.length + ' groups); a hit a branch depends on - directly or through a value derived from it - is proposed only a class that permits a branch (production-ref, same on every plane, the call\'s input), or as not a hit (a UUID literal naming a record this migration creates with that id on every plane, the r3 hit item quoted); no entry is stale; a not-a-hit literal is the primary-key value of a row a top-level INSERT of the migration writes (' + seeded.size + ' such keys); every UNTRACED entry (' + untraced.length + ': reads and branches the approximation cannot follow, listed by hand) still finds each of its anchors in the source (the verifier classes every hit itself)',
    cls.unmatched.length === 0 && cls.miscount.length === 0 && cls.badClass.length === 0 && cls.stale.length === 0 && nonPendingBranch.length === 0 && untracedBad.length === 0,
    JSON.stringify({ unmatched: cls.unmatched.map(fmt), miscount: cls.miscount.map((m) => m.entry.file.replace(/^.*\//, '') + ' ' + m.entry.construct + ' ' + (m.entry.fn || '') + ': listed ' + m.entry.count + ', found ' + m.found + ' at ' + m.lines.join(',')),
      badClass: cls.badClass.map((e) => e.construct + ' ' + e.cls), stale: cls.stale.map((e) => e.file.replace(/^.*\//, '') + ' ' + e.construct + ' ' + (e.fn || '')), branch: nonPendingBranch.map((b) => b.entry.construct + ' ' + b.entry.cls + ' at ' + b.lines.join(',')),
      untraced: untracedBad.map((u) => u.entry.file.replace(/^.*\//, '') + ' ' + u.entry.construct + ': ' + (u.missing.length ? 'anchor gone ' + u.missing.join(', ') : u.lines.length ? 'no class and no pending change request' : 'no hit line')) }));
  // P3p the classes that rest on a change request: an entry still marked pending fails (under the r3 text as ratified its hit may fit
  // no class until the Director decides), and an entry that rests on a Director ruling is held to the Director's CR-disposition record at
  // CR_DISPOSITION_COMMIT - a descendant of the designated r3 commit; the ruling decided by the DIRECTOR and APPROVED; the entry's
  // quote verbatim in the decision's text; and the sha256 the Director recorded for the change request equal to the CR file at HEAD
  // (the decision was made on exactly the text this candidate carries)
  const pendingBy = new Map();
  for (const p of cls.pending) pendingBy.set(p.entry.pending.split(' ')[0], (pendingBy.get(p.entry.pending.split(' ')[0]) || []).concat(p.entry.file.replace(/^.*\//, '') + ':' + p.lines.join(',') + ' ' + p.entry.construct + (p.entry.value ? '(' + p.entry.value + ')' : '')));
  const untracedPending = untraced.filter((u) => u.entry.pending);
  for (const u of untracedPending) pendingBy.set(u.entry.pending.split(' ')[0], (pendingBy.get(u.entry.pending.split(' ')[0]) || []).concat(u.entry.file.replace(/^.*\//, '') + ':' + u.lines.join(',') + ' ' + u.entry.construct + ' [untraced]'));
  const ruled = [...cls.matched.filter((m) => m.entry.ruling).map((m) => ({ entry: m.entry, n: m.hits.length })), ...untraced.filter((u) => u.entry.ruling).map((u) => ({ entry: u.entry, n: u.lines.length }))];
  let ledger = null; try { ledger = JSON.parse(gitOut('show', CR_DISPOSITION_COMMIT + ':qa/work-orders/AUTO_ENROLLMENT_V1_LEDGER.json') || 'null'); } catch { ledger = null; }
  const descends = gitOut('merge-base', '--is-ancestor', DIRECTOR_COMMIT, CR_DISPOSITION_COMMIT) !== null;
  const records = ledger && Array.isArray(ledger.change_requests) ? ledger.change_requests : [];
  const blobSha = (p) => { const r = spawnSync('git', ['-C', ROOT, 'cat-file', 'blob', 'HEAD:' + p], { maxBuffer: 1 << 26 }); return r.status === 0 ? createHash('sha256').update(r.stdout).digest('hex') : null; };
  const rulingBad = [], byCr = new Map();
  for (const r of ruled) {
    const { cr, quote } = r.entry.ruling || {};
    const rec = records.find((x) => x && x.id === cr);
    const why = !cr || !quote ? 'no cr or quote' : !rec ? 'no record of ' + cr + ' at ' + CR_DISPOSITION_COMMIT.slice(0, 8)
      : rec.decided_by !== 'DIRECTOR' ? cr + ' not decided by the DIRECTOR' : !/^APPROVED\b/.test(String(rec.decision)) ? cr + ' not APPROVED'
      : !String(rec.decision).includes(quote) ? cr + ' decision does not contain the quote "' + quote.slice(0, 60) + '"'
      : !new RegExp('^qa/implementation/auto-enrollment-v1/change-requests/' + cr + '-[a-z0-9-]+\\.md$').test(String(rec.path)) ? cr + ' recorded at an unexpected path ' + rec.path
      : blobSha(rec.path) !== rec.sha256 ? cr + ' sha256 at HEAD differs from the recorded ' + String(rec.sha256).slice(0, 16) : null;
    if (why) rulingBad.push(r.entry.file.replace(/^.*\//, '') + ' ' + r.entry.construct + ': ' + why);
    if (cr) { const c = byCr.get(cr) || { groups: 0, hits: 0 }; c.groups++; c.hits += r.n; byCr.set(cr, c); }
  }
  const ruledTxt = [...byCr.entries()].sort().map(([cr, c]) => cr + ' ' + c.groups + ' groups / ' + c.hits + ' hits').join(', ');
  check('P3p no proposed class rests on an undecided change request (' + (cls.pending.length + untracedPending.length) + ' groups pending); every class that rests on a Director ruling (' + ruled.length + ' groups: ' + ruledTxt + ') is held to the Director\'s CR-disposition record ' + CR_DISPOSITION_COMMIT.slice(0, 8) + ' (a descendant of r3 ' + DIRECTOR_COMMIT.slice(0, 8) + '): decided by the DIRECTOR, APPROVED, the quoted class in the decision, and the recorded sha256 of the change request equal to its file at HEAD',
    cls.pending.length === 0 && untracedPending.length === 0 && ledger !== null && descends && rulingBad.length === 0,
    [...[...pendingBy.entries()].map(([cr, l]) => 'PENDING ' + cr + ': ' + l.join('; ')), ...(ledger ? [] : ['the Director ledger at ' + CR_DISPOSITION_COMMIT + ' cannot be read here (fetch the Director branch)']), ...(descends ? [] : ['the CR-disposition record does not descend from r3 ' + DIRECTOR_COMMIT]), ...rulingBad].join(' || '));
  for (const [cr, l] of pendingBy) console.log('     PENDING ' + cr + ' - ' + l.length + ' groups: ' + l.join('; '));
  // P4 the production ref: only as the refusal in _shared/db.ts, judged on the URL's text AND on the target read from it; both entry
  // points connect only through it and hand the driver that target, never the URL (C2-S1). Each entry point names its URL three times -
  // where the environment gives it, and as the argument of dbRefusal and of dbOptions - and constructs the driver once; _shared/db.ts
  // reads the URL with its own form only (no URL parser), and its options carry the five parts it read
  const scanned = [...mig, ...edgeTs];
  const refs = scanned.filter((p) => /pvphxgrtdfrudejjhzjk/.test(read(join(ROOT, p)))).sort();
  const dbTs = join(FN, '_shared', 'db.ts');
  const tsCode = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const entryUse = [NODE_FN, ADMIN_FN].map((f) => ({ refusal: /const refusal = dbRefusal\(dbUrl, caPem\);/.test(read(f)), driver: /const db = refused \? null : postgres\(dbOptions\(dbUrl, caPem\)\);/.test(read(f)),
    url: (tsCode(f).match(/\bdbUrl\b/g) || []).length, drivers: (tsCode(f).match(/\bpostgres\(/g) || []).length }));
  check('P4 the production ref appears only as the refusal in _shared/db.ts - judged on the URL\'s text and on the target read from it (the host, user, database and password the driver is given) - and both entry points connect only through it, handing the driver that target and never the URL; _shared/db.ts reads the URL with no URL parser',
    refs.length === 1 && refs[0] === 'supabase/control-plane/edge/supabase/functions/_shared/db.ts' && /url\.toLowerCase\(\)\.includes\(PRODUCTION_REF\)/.test(read(dbTs))
      && /const effective = \[host, user, database, password\]\.join\('\\n'\);\s+if \(effective\.toLowerCase\(\)\.includes\(PRODUCTION_REF\)\) return no\(PRODUCTION\);/.test(read(dbTs))
      && /return \{ host, port, user, password, database, prepare: false,/.test(read(dbTs)) && !/\bnew URL\b|\bURL\.(canParse|parse)\b|decodeURI/.test(tsCode(dbTs))
      && entryUse.every((e) => e.refusal && e.driver && e.url === 3 && e.drivers === 1)
      && edgeRes.hits.filter((h) => h.construct === 'production_ref_refusal').length === 2, refs.join(',') + ' ' + JSON.stringify(entryUse));
  // P5 / P6 the two inventories (§3.4 r3): each listed statement must serve a contract rule; none is expected
  const pk = (x) => x.file + '|' + x.text;
  const platUnlisted = sqlRes.platformWrites.filter((w) => !PLATFORM_WRITES.some((e) => pk(e) === pk(w) && e.rule));
  check('P5 the platform-schema inventory: no statement of the candidate migration or the founder steps creates, alters, drops, grants on, comments on or writes to an object of a platform schema (' + PLATFORM.length + ' schemas of the Director tool, pg_catalog included, unqualified catalog relations too), unless listed with the contract rule it serves (' + PLATFORM_WRITES.length + ' listed)',
    platUnlisted.length === 0 && PLATFORM_WRITES.every((e) => sqlRes.platformWrites.some((w) => pk(w) === pk(e))), platUnlisted.map((w) => w.file.replace(/^.*\//, '') + ':' + w.line + ' ' + w.text).join(' | '));
  const secUnlisted = sqlRes.secretSettings.filter((w) => !SECRET_SETTINGS.some((e) => e.file === w.file && e.name === w.name && e.rule));
  check('P6 the secret-setting inventory: no statement sets or resets a setting whose name matches the Director tool\'s SECRETISH (' + String(SECRETISH) + '), unless listed with the contract rule it serves (' + SECRET_SETTINGS.length + ' listed)',
    secUnlisted.length === 0, secUnlisted.map((w) => w.file.replace(/^.*\//, '') + ':' + w.line + ' ' + w.name).join(' | '));
  // P7 exception handlers: each PL/pgSQL handler is listed, and one that can absorb a plane-configuration-dependent error re-raises it
  const swallow = sqlRes.handlers.filter((h) => h.plane.length && !h.reraises);
  check('P7 no PL/pgSQL exception handler (' + sqlRes.handlers.length + ' in scope) catches a plane-configuration-dependent condition (insufficient privilege, an undefined object, an unsupported feature, a limit, a cancelled query, an unavailable lock, OTHERS) without re-raising; the Edge catch sites (' + edgeRes.catches.length + ') are the ones G6 lists',
    swallow.length === 0 && edgeRes.catches.length === 7, swallow.map((h) => h.file.replace(/^.*\//, '') + ':' + h.line + ' when ' + h.plane.join(' or ')).join(' | '));
  // P8 an identity column is carried only while no statement compares it with a fixed value
  const idBad = sqlRes.identityCols.filter((c) => c.comparedWithConstant);
  check('P8 every identity column the migration defines (' + sqlRes.identityCols.map((c) => c.column).join(', ') + ') is a row id only: no statement compares it with a fixed value',
    sqlRes.identityCols.length >= 3 && idBad.length === 0, idBad.map((c) => c.column + ': ' + c.comparedWithConstant.join(',')).join(' | '));
}

// ---------------------------------------------------------------- G: whole-request gates
// [refusal name, where, classification, what keeps it correct]
const GATES = [
  ['no_such_route', 'both', 'DETERMINISTIC REFUSAL', 'a path outside S-7 (after the platform prefix, route.ts) is 404 by name'],
  ['crypto_unavailable', 'node', 'DETERMINISTIC REFUSAL (fail closed)', 'the RFC 8032 Ed25519 self-test failed at cold start: the API serves nothing rather than verify badly'],
  ['body_too_large', 'both', 'DETERMINISTIC REFUSAL', '64 KiB body cap: every S-7 body is far smaller'],
  ['bad_request', 'both', 'DETERMINISTIC REFUSAL', 'not JSON, not an object, an unknown field, a malformed value - named'],
  ['identity_from_body_refused', 'node', 'DETERMINISTIC REFUSAL', 'a body naming node / tenant / role / envelope (S-4)'],
  ['not_authenticated', 'both', 'DETERMINISTIC REFUSAL', 'no / invalid session or Brain OS token (on the Admin API also how BRAIN_OS_URL / BRAIN_OS_ANON_KEY unset surfaces: UNNAMED_CONDITIONS, G7)'],
  ['session_invalid', 'node', 'DETERMINISTIC REFUSAL', 'no, an unknown or an expired node session: the runtime opens a new one with its key and retries'],
  ['bad_assertion', 'node', 'DETERMINISTIC REFUSAL', 'a session assertion that is not {v, aud, iat, exp, jti, pk}'],
  ['bad_signature', 'node', 'DETERMINISTIC REFUSAL', 'a session assertion whose Ed25519 signature does not verify'],
  ['bad_proof', 'node', 'DETERMINISTIC REFUSAL', 'enrollment or rotation without proof of possession of the key'],
  ['plane_unavailable', 'node', 'DETERMINISTIC REFUSAL (outcome unknown)', 'the plane did not answer: every node operation is idempotent and safe to retry'],
  ['pepper_unavailable', 'both', 'PLATFORM CONDITION (fail closed, named)', 'FACTORY_PAIRING_PEPPER unset: pairing is refused by name; nothing else is affected. On the Node API each such request is one recorded pairing attempt, named before the caps are applied (enrollment_acceptance PU1); under S-6 the r3 literal reading stands (CR-016, RECORDED; analysis sent privately)'],
  ['peer_unavailable', 'node', 'PLATFORM CONDITION (fail closed, named)', 'the runtime reported no usable peer address (no info, a transport without a hostname, a value that is not an IP address; peer.ts): enroll/start and enroll/complete are refused 503 by name and still recorded (peer_ip null); every other route is served. What the hosted runtime reports is measured only on a deployed function (UNMEASURED below); its consequence under S-6 is a Director decision (CR-015 / CR-016; analysis sent privately)'],
  ['rate_limited_ip', 'node', 'S-6 ABUSE LIMIT (SQL, 429)', '20 attempts per peer address per rolling hour, serialized per peer (part 150 _pairing_serialize), every recorded attempt of the address counted. The cap keys on the peer address the hosted runtime hands the handler (CR-015, RECORDED: the r3 reading stands; analysis sent privately)'],
  ['rate_limited_tenant', 'node', 'S-6 ABUSE LIMIT (SQL, 429)', '60 attempts per tenant per rolling hour, serialized per tenant (part 150). The recorded requests that count toward this cap are those the r3 literal text counts (CR-016, RECORDED; analysis sent privately)'],
  ['signer_unavailable', 'admin', 'PLATFORM CONDITION (fail closed, named)', 'the plane has no usable release signer - no public half, no stored seed, or a stored seed that is not the one the public half belongs to (scripts/factory-control-plane/release_signer.sql sign_release answers NULL): authorize-update is refused 503 by name and nothing is signed or published; every other action is served (update_authorization_acceptance UA9; release_signer_acceptance RS9)'],
  ['claim_lock_busy', 'node', 'DETERMINISTIC REFUSAL (SQL, 503, retry)', 'the plane-wide claim lock stayed busy for its fixed bound of 150 tries 0.1 s apart (part 120): nothing claimed this time; the runtime retries'],
  ['server_refused', 'both', 'DETERMINISTIC REFUSAL; LOAD-DEPENDENT for 55P03 / 57014 (retryable)', 'the PostgreSQL server raised a SQLSTATE (db.ts serverSqlState: only a server error, never a transport error\'s code): the transaction rolled back, nothing changed; the Node API states the SQLSTATE in the answer (sqlstate), and the enrolled worker fails a run only on class 22, a data exception the same input meets on every attempt (worker.mjs terminalFailure; runtime_units HF1 / HF2). Most are deterministic. A lock wait longer than a front door\'s lock_timeout (15 s: SQLSTATE 55P03) or a cancelled statement (57014) depends on load and is retryable; on the enrollment routes it rolls back with its attempt row, so that request is not recorded (load behaviour: UNMEASURED below)'],
  ['unavailable', 'both', 'DETERMINISTIC REFUSAL (outcome unknown)', 'the plane or Brain OS did not answer: the caller reloads / retries idempotently (with BRAIN_OS_URL unset, a token issued by the bare path /auth/v1 ends here: G7)'],
  ['server_error', 'admin', 'DETERMINISTIC REFUSAL', 'a front door returned nothing'],
  ['misconfigured', 'both', 'DETERMINISTIC REFUSAL', 'the database URL or its CA is unset, the URL is not the one form _shared/db.ts reads (postgresql://USER:PASS@HOST:PORT/DATABASE, a DNS host name), or the URL or the target read from it names production: 503 on every request until the founder sets them (edge_db_tls T5, T7-T9)'],
];
// whole-request conditions with no refusal name of their own: [condition, where, classification, how it surfaces and what proves it]
const UNNAMED_CONDITIONS = [
  ['BRAIN_OS_URL / BRAIN_OS_ANON_KEY unset', 'admin', 'PLATFORM CONDITION (fail closed, not named)', 'the Admin API entry point hands both values to the token check and tests neither (G11; CR-021 records the change from 503 misconfigured). No caller passes the check and no front door runs. It surfaces as 401 not_authenticated - a Brain OS token, whose issuer cannot match an empty URL, or Brain OS refusing a check sent without its key - or as 503 unavailable, for a token issued by the bare path /auth/v1, whose check request to the relative address fails. Measured under Deno 2.5.6 (edge_peer EP6-EP8, with the control EP8) and under Node (edge_boundary EB8); after deploy the founder\'s steps (section 5) name the misleading 401'],
];
const UNMEASURED = [
  'Edge platform wall-clock and CPU limits per request (measured only at the founder deploy)',
  'the peer address the HOSTED Edge runtime reports behind the platform gateway (the per-IP pairing key). Measured locally only under Deno 2.5.6 Deno.serve on a direct TCP connection (qa/factory/v1/edge_peer_acceptance.mjs): the client address. Outcomes: no usable address - peer_unavailable (named, tested); each client\'s own address - the per-address clause works as S-6 intends (CR-016 is a separate question); one shared address - a Director decision before certification (CR-015; analysis sent privately). Measured on the hosted runtime only by a founder-authorized deploy',
  'whether the platform strips the /<function> path prefix (route.ts accepts both shapes)',
  'the Node API under a sustained burst of pairing requests on the hosted runtime (S-3: other computers keep working): not measured; analysis sent to the Director privately (CR-016)',
  'the transaction isolation level the S-6 serialization assumes: the PostgreSQL default, which neither the Edge nor the migration changes and the candidate does not read; the live plane\'s configured default is the founder\'s (analysis sent privately)',
  'postgres.js over the Supabase pooler in transaction mode (prepare: false) under concurrent load',
  'TLS verify-full from the Edge runtime to the pooler host with the CA the founder downloads (proved locally under Deno by edge_db_tls_acceptance; the live host and certificate only at deploy - GET /v1/time is the first live check)',
];
{
  const src = [nodeApi, adminApi, read(join(FN, '_shared', 'enroll.ts')), read(NODE_FN), read(ADMIN_FN)].join('\n');
  // the Edge refusals, and the SQL front doors' whole-request refusals (429 / 503)
  const V1DIR = join(ROOT, 'supabase', 'control-plane', 'v1');
  const v1sql = readdirSync(V1DIR).filter((f) => /\.sql$/.test(f)).map((f) => read(join(V1DIR, f)).replace(/--[^\n]*/g, '')).join('\n');
  const sqlGates = new Set([...v1sql.matchAll(/_refusal\(\s*'([a-z_]+)'\s*,\s*(429|503)\b/g)].map((m) => m[1]));
  if (/_refusal\(\s*limited\s*,\s*429/.test(v1sql)) { sqlGates.add('rate_limited_ip'); sqlGates.add('rate_limited_tenant'); }
  const found = new Set([...src.matchAll(/(?:refuse|why)\(\s*\d{3}\s*,\s*'([a-z_]+)'/g), ...src.matchAll(/refused:\s*'([a-z_]+)'/g), ...sqlGates].map((m) => (typeof m === 'string' ? m : m[1])));
  const classified = new Set(GATES.map((g) => g[0]));
  const unclassified = [...found].filter((n) => !classified.has(n));
  const stale = [...classified].filter((n) => !found.has(n));
  check('G4 every 429 / 503 refusal of the SQL front doors is classified (' + [...sqlGates].sort().join(', ') + ')',
    sqlGates.size >= 4 && [...sqlGates].every((n) => classified.has(n)), [...sqlGates].filter((n) => !classified.has(n)).join(','));
  check('G1 every whole-request refusal in the Edge sources is classified (' + found.size + ' found): none is an UNSAFE HARD STOP', unclassified.length === 0, 'unclassified: ' + unclassified.join(','));
  check('G2 every classified gate is still in the source (the inventory tracks the code, not a memory of it)', stale.length === 0, 'stale: ' + stale.join(','));
  check('G3 the platform limits are named UNMEASURED, never assumed safe (' + UNMEASURED.length + ')', UNMEASURED.length >= 4);
  // G7 the unnamed conditions: BRAIN_OS_URL and BRAIN_OS_ANON_KEY are read once each by the Admin API entry point and used only to build
  // the token check's dependency - the entry point has no branch on them, so the condition surfaces only through the token check
  const adminEntry = read(ADMIN_FN).replace(/\/\/[^\n]*/g, '');
  const brainUse = { url: (adminEntry.match(/\bbrainOsUrl\b/g) || []).length, key: (adminEntry.match(/\banonKey\b/g) || []).length,
    reads: (adminEntry.match(/Deno\.env\.get\('BRAIN_OS_(URL|ANON_KEY)'\)/g) || []).length, dep: /brainOs: \{ url: brainOsUrl, anonKey \},/.test(adminEntry) };
  check('G7 every whole-request condition without a refusal name of its own is classified and says how it surfaces (' + UNNAMED_CONDITIONS.length + '): BRAIN_OS_URL / BRAIN_OS_ANON_KEY unset is a PLATFORM CONDITION that fails closed through the token check (401 not_authenticated or 503 unavailable; edge_peer EP6-EP8 under Deno, edge_boundary EB8); the Admin API entry point reads each value once and only hands it to that check',
    UNNAMED_CONDITIONS.some((c) => c[0] === 'BRAIN_OS_URL / BRAIN_OS_ANON_KEY unset') && brainUse.url === 2 && brainUse.key === 2 && brainUse.reads === 2 && brainUse.dep, JSON.stringify(brainUse));
  for (const c of UNNAMED_CONDITIONS) console.log('     condition ' + c[0].padEnd(40) + c[1].padEnd(6) + c[2] + ' - ' + c[3]);
  for (const g of GATES) console.log('     gate ' + g[0].padEnd(28) + g[1].padEnd(6) + g[2] + ' - ' + g[3]);
  for (const u of UNMEASURED) console.log('     UNMEASURED ' + u);
}
{
  // G5 THE PEER (S-6): no Edge source reads a forwarding header; the Node API entry point hands every request to withPeer, and peerOf
  // reads only the runtime's info.remoteAddr.hostname (no header, no comparison with an address range)
  const peerSrc = read(join(FN, '_shared', 'peer.ts'));
  const edgeAll = [nodeApi, adminApi, peerSrc, read(join(FN, '_shared', 'enroll.ts')), read(join(FN, '_shared', 'pairing.ts')), read(join(FN, '_shared', 'db.ts')),
    read(join(FN, '_shared', 'route.ts')), read(NODE_FN), read(ADMIN_FN)].join('\n').replace(/\/\/[^\n]*/g, '');
  const headerReads = [...edgeAll.matchAll(/x-forwarded-for|x-real-ip|\bforwarded\b|cf-connecting-ip|true-client-ip|x-client-ip|fly-client-ip|x-envoy-external-address/gi)].map((m) => m[0]);
  const peerCode = peerSrc.replace(/\/\/[^\n]*/g, '');
  check('G5 the per-IP key is the peer the runtime reports, never a header: no Edge source reads a forwarding header; factory-node-api/index.ts serves withPeer(handler); peerOf reads only info.remoteAddr.hostname and compares it with no address range',
    headerReads.length === 0 && /const serveNode = withPeer\(handler\);/.test(read(NODE_FN)) && /return serveNode\(req, info\);/.test(read(NODE_FN))
      && !/info\.remoteAddr|remoteAddr as Deno/.test(read(NODE_FN).replace(/\/\/[^\n]*/g, ''))
      && /\.remoteAddr/.test(peerCode) && /\.hostname/.test(peerCode) && !/headers|127\.|10\.|192\.168|172\.|localhost|::1|fc00|fe80/i.test(peerCode),
    'header reads: ' + headerReads.join(','));
  // G6 NO ERROR BECOMES AN ANSWER ABOUT THE REQUEST (VERIFICATION_SPEC §3.4 r3, the Edge handlers): every catch in the Edge sources is one of
  // the listed caller's-input parses, or the ONE request boundary of each API, which answers only as an error (500 server_refused / 503)
  const catchSites = [];
  for (const [name, text] of [['node_api.ts', nodeApi], ['admin_api.ts', adminApi], ['enroll.ts', read(join(FN, '_shared', 'enroll.ts'))], ['peer.ts', peerSrc],
    ['pairing.ts', read(join(FN, '_shared', 'pairing.ts'))], ['db.ts', read(join(FN, '_shared', 'db.ts'))], ['route.ts', read(join(FN, '_shared', 'route.ts'))],
    ['factory-node-api/index.ts', read(NODE_FN)], ['factory-admin-api/index.ts', read(ADMIN_FN)]]) {
    text.split('\n').forEach((line, i) => { const code = line.replace(/\/\/.*$/, ''); if (/\bcatch\b/.test(code)) catchSites.push({ f: name, line: i + 1, code: code.trim() }); });
  }
  const ALLOWED_CATCH = [
    ['node_api.ts', /atob\(s\.replace\([^)]*\)[\s\S]*\} catch \{ return null; \}/, 'b64u.dec: the caller\'s base64url value'],
    ['node_api.ts', /try \{ parsed = JSON\.parse\(dec\.decode\(raw\)\); \} catch \{ return \{ body: \{\}, problem: why\(400, 'bad_request', 'the body is not JSON'\) \}; \}/, 'the caller\'s JSON body'],
    ['node_api.ts', /try \{ p = payloadBytes \? JSON\.parse\(dec\.decode\(payloadBytes\)\) : null; \} catch \{ p = null; \}/, 'the caller\'s assertion payload'],
    ['node_api.ts', /^\} catch \(e\) \{$/, 'THE REQUEST BOUNDARY (500 server_refused / 503 plane_unavailable)'],
    ['admin_api.ts', /catch \(e\) \{ if \(e instanceof SyntaxError\) return false; throw e; \}/, 'the caller\'s token payload (SyntaxError only; everything else re-thrown)'],
    ['admin_api.ts', /try \{ body = JSON\.parse\(new TextDecoder\(\)\.decode\(raw\)\); \} catch \{ return refuse\(400, 'bad_request', 'the body is not JSON'\); \}/, 'the caller\'s JSON body'],
    ['admin_api.ts', /^\} catch \(e\) \{$/, 'THE REQUEST BOUNDARY (500 server_refused / 503 unavailable)'],
  ];
  const unlisted = catchSites.filter((c) => !ALLOWED_CATCH.some(([f, re]) => f === c.f && re.test(c.code)));
  const boundaries = ['node_api.ts', 'admin_api.ts'].map((f) => {
    const text = f === 'node_api.ts' ? nodeApi : adminApi;
    const at = text.lastIndexOf('} catch (e) {');
    const tail = at < 0 ? '' : text.slice(at, text.indexOf('\n    }', at));
    const answers = [...tail.matchAll(/return refuse\((\d{3}),/g)].map((m) => Number(m[1]));
    return at > 0 && text.indexOf('} catch (e) {') === at && answers.length === 2 && answers.every((s) => s >= 500) && !/\.catch\(/.test(text);
  });
  check('G6 no error becomes an answer about the request: the Edge sources\' only catches are the caller\'s-input parses and one request boundary per API, which answers every error as an error (5xx only); no .catch(() => ...) fallback (' + catchSites.length + ' catch sites)',
    unlisted.length === 0 && boundaries.every(Boolean), JSON.stringify({ unlisted: unlisted.map((c) => c.f + ':' + c.line + ' ' + c.code.slice(0, 90)), boundaries }));
}

// ---------------------------------------------------------------- PA: pairing audit, the enrollment walk, the lock order (S-6, AC-8, AC-1, contract §9)
{
  const src150 = read(join(ROOT, 'supabase', 'control-plane', 'v1', '150_enrollment.sql'));
  const fnBody = (name) => { const m = new RegExp('create function factory\\.' + name + '\\([\\s\\S]*?\\n  as \\$\\$([\\s\\S]*?)\\n  end \\$\\$;').exec(src150); return m ? m[1] : ''; };
  // PA1 on every path of the two front doors, a returned refusal follows its attempt row: walking back from each return, over the
  // statements of its own block and of the blocks enclosing it (a completed sibling block, or another branch, is not on the path)
  const pathAudited = (body) => {
    const lines = body.split('\n').map((l) => l.replace(/--.*$/, '').trim());
    const bad = [];
    lines.forEach((l, i) => {
      if (!/^return (factory\._refusal\(|shown;)/.test(l)) return;
      // depth > 0: inside a completed sibling block (skipped); an 'if' at depth 0 opens the block that encloses the return (its
      // statements above are on the path); an 'elsif' / 'else' at depth 0 ends the branch (the branches above it are skipped)
      let depth = 0, ok = false;
      for (let j = i - 1; j >= 0; j--) {
        const x = lines[j];
        if (/^end if;/.test(x)) { depth++; continue; }
        if (/^if\b/.test(x)) { if (depth > 0) depth--; continue; }
        if (depth > 0) continue;
        if (/^(elsif\b|else$)/.test(x)) { let d = 0; for (j--; j >= 0; j--) { if (/^end if;/.test(lines[j])) d++; else if (/^if\b/.test(lines[j])) { if (d === 0) break; d--; } } continue; }
        if (/^begin$/.test(x)) break;
        if (/perform factory\._attempt\(/.test(x)) { ok = true; break; }
      }
      if (!ok) bad.push((i + 1) + ': ' + l.slice(0, 60));
    });
    return bad;
  };
  const startBad = pathAudited(fnBody('node_enroll_start')), completeBad = pathAudited(fnBody('node_enroll_complete'));
  const returns = (fnBody('node_enroll_start') + fnBody('node_enroll_complete')).split('\n').filter((l) => /^\s*return (factory\._refusal\(|shown;)/.test(l)).length;
  check('PA1 every refusal node_enroll_start and node_enroll_complete return (' + returns + ') follows, on its path, its pairing_attempts row (S-6 "every attempt is audited")',
    returns >= 20 && startBad.length === 0 && completeBad.length === 0, JSON.stringify({ start: startBad, complete: completeBad }));
  // PA2 the enrollment walk is structural: one AFTER row trigger on factory.enrollments writes enrollment_transitions; no other SQL
  // inserts into it; every UPDATE that sets an enrollment's state names its actor
  const V1DIR = join(ROOT, 'supabase', 'control-plane', 'v1');
  const all = readdirSync(V1DIR).filter((f) => /\.sql$/.test(f)).map((f) => ({ f, t: read(join(V1DIR, f)).replace(/--[^\n]*/g, '') }));
  const inserts = all.flatMap(({ f, t }) => [...t.matchAll(/insert into factory\.enrollment_transitions/g)].map(() => f));
  const updates = all.flatMap(({ f, t }) => [...t.matchAll(/update factory\.enrollments\s+set\s+([\s\S]*?)\bwhere\b/g)].map((m) => ({ f, set: m[1].replace(/\s+/g, ' ') })));
  const stateUpdates = updates.filter((u) => /(^|[ ,])state\s*=/.test(u.set));
  const noActor = stateUpdates.filter((u) => !/state_actor\s*=/.test(u.set));
  const src080 = read(join(V1DIR, '080_guards.sql'));
  check('PA2 the enrollment walk is structural: factory_v1_d_transition_log (AFTER INSERT OR UPDATE OF state, FOR EACH ROW) is the only writer of enrollment_transitions, and every UPDATE setting an enrollment\'s state (' + stateUpdates.length + ') names its actor',
    /create trigger factory_v1_d_transition_log after insert or update of state on factory\.enrollments\s+for each row execute function factory\._enrollment_transition_log\(\);/.test(src080)
      && inserts.length === 2 && inserts.every((f) => f === '080_guards.sql') && stateUpdates.length >= 2 && noActor.length === 0,
    JSON.stringify({ inserts, noActor }));
  // PA3 THE ONE LOCK ORDER: complete locks the computer, then the code, then the enrollment, then serializes the S-6 keys, then reads the
  // clock; start locks the live code, then serializes; the admin computer lock is FOR NO KEY UPDATE; a node call's fingerprint record
  // never writes the computers row, and node_register locks the computer before its session and credential
  const cBody = fnBody('node_enroll_complete'), sBody = fnBody('node_enroll_start');
  const at = (b, re) => { const m = re.exec(b); return m ? m.index : -1; };
  const cx = at(cBody, /from factory\.computers x where x\.computer_id = e0\.computer_id for no key update/), cc = at(cBody, /from factory\.pairing_codes x where x\.code_id = e0\.code_id for no key update/),
    ce = at(cBody, /from factory\.enrollments x where x\.enrollment_id = e0\.enrollment_id for update/), ck = at(cBody, /perform factory\._pairing_serialize\(/),
    ct = at(cBody, /consume_at := pg_catalog\.clock_timestamp\(\);/);
  const sc = at(sBody, /state in \('PAIRING_CODE_ISSUED', 'PAIRING_STARTED'\) for no key update/), sk = at(sBody, /perform factory\._pairing_serialize\(/),
    st = at(sBody, /start_at := pg_catalog\.clock_timestamp\(\);/);
  const src200 = read(join(V1DIR, '200_admin_common.sql')), src120 = read(join(V1DIR, '120_node_lifecycle.sql')).replace(/\r\n/g, '\n');
  const recFp = (/create function factory\._record_fingerprint[\s\S]*?end \$\$;/.exec(src120) || [''])[0].replace(/--[^\n]*/g, '');
  const reg = (/create function factory\.node_register[\s\S]*?end \$\$;/.exec(src120) || [''])[0].replace(/--[^\n]*/g, '');
  // the enrollment read that names the computer is unlocked (a lock there would take the enrollment before the computer)
  const e0Unlocked = /select x\.\* into e0 from factory\.enrollments x where x\.enrollment_id = p_enrollment;/.test(cBody) && !/into e0[^;]*for (no key )?update/.test(cBody);
  const orderOk = e0Unlocked && cx > 0 && cc > cx && ce > cc && ck > ce && ct > ck && sc > 0 && sk > sc && st > sk;
  const noExpiryAtStart = !/expires_at\s*<=\s*now\(\)/.test(cBody + sBody);
  check('PA3 the one lock order: enroll/complete takes the computer, the code, the enrollment (FOR NO KEY UPDATE / FOR UPDATE), then the S-6 keys, then reads the clock it judges expiry by (no expiry compared with now()); enroll/start takes the live code, then the keys, then the clock; the admin computer lock is FOR NO KEY UPDATE; the fingerprint record writes no computers row; node_register locks the computer before its session',
    orderOk && noExpiryAtStart && /for no key update;/.test((/create function factory\._admin_computer[\s\S]*?end \$\$;/.exec(src200) || [''])[0])
      && !/for update;/.test((/create function factory\._admin_computer[\s\S]*?end \$\$;/.exec(src200) || [''])[0])
      && !/update factory\.computers/.test(recFp) && reg.indexOf('for no key update') > 0 && reg.indexOf('for no key update') < reg.indexOf('_node_session('),
    JSON.stringify({ cx, cc, ce, ck, ct, sc, sk, st, noExpiryAtStart }));
}

// ---------------------------------------------------------------- X: secrets
{
  const edgeSrc = [nodeApi, adminApi, read(join(FN, '_shared', 'pairing.ts')), read(join(FN, '_shared', 'enroll.ts')), read(NODE_FN), read(ADMIN_FN)].join('\n');
  check('X1 the pairing pepper is read only from the secret store (Deno.env) in the entry points, never from a literal',
    /Deno\.env\.get\('FACTORY_PAIRING_PEPPER'\)/.test(read(NODE_FN)) && /Deno\.env\.get\('FACTORY_PAIRING_PEPPER'\)/.test(read(ADMIN_FN)) && !/FACTORY_PAIRING_PEPPER\s*[:=]\s*['"][A-Za-z0-9+/=]{16,}/.test(edgeSrc));
  // X1v the pepper's version is one compile-time constant both APIs share, so a code is issued (Admin API) and verified (Node API)
  // under the same version on every plane; no entry point reads a version from its configuration (S-6 names no rotation)
  const pairingSrc = read(join(FN, '_shared', 'pairing.ts'));
  const versionUse = [NODE_FN, ADMIN_FN].map((f) => { const s = read(f).replace(/^\s*\/\/[^\n]*$/gm, '');
    return /import \{[^}]*\bPEPPER_VERSION\b[^}]*\} from '\.\.\/_shared\/pairing\.ts';/.test(s) && /\{ key, version: PEPPER_VERSION \}/.test(s) && !/PEPPER_VERSION'|pepperVersion/.test(s); });
  check('X1v the pairing pepper\'s version is one constant, PEPPER_VERSION in _shared/pairing.ts, that both entry points import and hand their handler with the key; no Edge source reads a pepper version from the environment',
    /^export const PEPPER_VERSION = [1-9][0-9]*;$/m.test(pairingSrc) && versionUse.every(Boolean) && !/FACTORY_PAIRING_PEPPER_VERSION/.test(edgeSrc.replace(/^\s*\/\/[^\n]*$/gm, '')),
    JSON.stringify({ constant: (/^export const PEPPER_VERSION = .*$/m.exec(pairingSrc) || [null])[0], entryPoints: versionUse }));
  const webFiles = ['web/lib/factory/admin-client.ts', 'web/lib/factory/config.ts', 'web/lib/data/factory-computers.ts'].map((p) => join(ROOT, p));
  const webSrc = webFiles.map(read).join('\n');
  check('X2 no service-role key, database URL or pepper in the Edge or web Factory sources', !/service_role|SERVICE_ROLE|postgres(ql)?:\/\/|FACTORY_PAIRING_PEPPER/.test(webSrc) && !/service_role|postgres(ql)?:\/\/[^'"\s]*@/.test(edgeSrc));
  const client = read(webFiles[0]);
  check('X3 the web forwards only the user\'s own token, after supabase.auth.getUser(), and only from lib/factory/admin-client.ts',
    /auth\.getUser\(\)/.test(client) && client.indexOf('auth.getUser()') < client.indexOf('authorization: `Bearer ${token}`') && /sessionData\.session\?\.access_token/.test(client)
      && !/fetch\(/.test(read(webFiles[2]).replace(/await fetch\(url, \{ cache: "no-store", signal: AbortSignal\.timeout\(120000\) \}\)/, '')));
}

// ---------------------------------------------------------------- M: the candidate migration (WO-1 r3, contract §1)
{
  // The designated Director commit; FACTORY_DESIGNATED_DIRECTOR overrides it. The instrument runs as an external tool, exported from
  // that commit into a temporary directory at run time; it is never imported or copied into this tree (WO-1 r3).
  const DIRECTOR = process.env.FACTORY_DESIGNATED_DIRECTOR || 'c7a845b61a3b0b419e8c9dfeff397547fdc75b03';
  const BASE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
  const git = (...a) => { const r = spawnSync('git', ['-C', ROOT, ...a], { encoding: 'buffer', maxBuffer: 1 << 28 }); return r.status === 0 ? r.stdout : null; };
  const changed = (git('diff', '--name-only', '--diff-filter=MDR', BASE, '--', 'supabase/control-plane/') || Buffer.from('?')).toString('utf8').trim();
  check('M0 no 69df2f52 control-plane file is changed, deleted or renamed (contract §1)', changed === '', changed);
  const added = (git('diff', '--name-only', '--diff-filter=A', BASE, '--', 'supabase/control-plane/') || Buffer.from('')).toString('utf8').trim().split('\n')
    .filter((p) => p.endsWith('.sql') && !p.startsWith('supabase/control-plane/edge/'));
  const untracked = (git('ls-files', '--others', '--exclude-standard', '--', 'supabase/control-plane/') || Buffer.from('')).toString('utf8').trim().split('\n')
    .filter((p) => p.endsWith('.sql') && !p.startsWith('supabase/control-plane/edge/'));
  const mig = [...new Set([...added, ...untracked])].filter(Boolean).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const tmp = mkdtempSync(join(tmpdir(), 'factory-step-'));
  try {
    const tools = join(tmp, 'director', 'tools'); mkdirSync(tools, { recursive: true });
    const listing = git('ls-tree', '-r', '--name-only', DIRECTOR, 'qa/verification/auto-enrollment-v1/tools/');
    if (!listing) throw new Error('the designated Director commit ' + DIRECTOR + ' is not in this repository (git fetch origin factory/auto-enrollment-v1-director)');
    for (const p of listing.toString('utf8').trim().split('\n')) writeFileSync(join(tools, p.split('/').pop()), git('show', DIRECTOR + ':' + p));
    for (const f of ['BASELINE_69df2f52_EVIDENCE_MANIFEST.json', 'BASELINE_69df2f52_EVIDENCE_ROWS.json'])
      writeFileSync(join(tmp, 'director', f), git('show', DIRECTOR + ':qa/verification/auto-enrollment-v1/' + f));
    const out = join(tmp, 'step.sql');
    const r = spawnSync(process.execPath, [join(tools, 'build_live_migration_step.mjs'), out, ...mig.map((p) => join(ROOT, p))], { cwd: tools, encoding: 'utf8' });
    check('M1 the Director instrument (' + DIRECTOR.slice(0, 8) + ') builds the live-migration step from the candidate migration (' + mig.length + ' files, byte order of path): no transaction control, no backslash outside a dollar-quoted body, no psql variable, no COPY',
      r.status === 0 && existsSync(out), (r.stdout + r.stderr).trim().split('\n').pop());
  } catch (e) { check('M1 the Director instrument builds the live-migration step', false, e.message); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const sql = mig.map((p) => read(join(ROOT, p)).replace(/--[^\n]*/g, '')).join('\n');
  // (a qualified or quoted target type, and an unqualified catalog relation, are the same construct)
  const integrity = [/create\s+event\s+trigger/i, /alter\s+event\s+trigger/i, /create\s+(or\s+replace\s+)?cast\s*\([^)]*\bas\s+("?pg_catalog"?\s*\.\s*)?"?jsonb?"?\s*\)/i, /allow_system_table_mods/i,
    /(insert\s+into|update|delete\s+from|truncate(\s+table)?|merge\s+into|alter\s+table|drop\s+table|comment\s+on\s+table)\s+(only\s+)?("?pg_catalog"?\s*\.\s*)?"?pg_[a-z_]+\b/i].filter((re) => re.test(sql)).map(String);
  check('M2 instrument integrity (S-10): no event trigger, no cast to json / jsonb (qualified or quoted), no allow_system_table_mods, no write or ALTER of a pg_catalog relation (qualified or not)', integrity.length === 0, integrity.join(', '));
  // M1n the instrument refuses each construct §3.10 names for "the tool refuses to build the step", appended to the real migration as
  // its last file, and accepts a backslash inside a dollar-quoted body (the positive control): the step is built from THIS migration
  {
    const tmp = mkdtempSync(join(tmpdir(), 'factory-step-n-'));
    const outcomes = {};
    try {
      const tools = join(tmp, 'director', 'tools'); mkdirSync(tools, { recursive: true });
      const listing = git('ls-tree', '-r', '--name-only', DIRECTOR, 'qa/verification/auto-enrollment-v1/tools/');
      for (const p of listing.toString('utf8').trim().split('\n')) writeFileSync(join(tools, p.split('/').pop()), git('show', DIRECTOR + ':' + p));
      for (const f of ['BASELINE_69df2f52_EVIDENCE_MANIFEST.json', 'BASELINE_69df2f52_EVIDENCE_ROWS.json']) writeFileSync(join(tmp, 'director', f), git('show', DIRECTOR + ':qa/verification/auto-enrollment-v1/' + f));
      const copies = mig.map((p) => { const to = join(tmp, 'm', ...p.split('/')); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, readFileSync(join(ROOT, p))); return to; });
      const BS = String.fromCharCode(92);
      const PLANTS = { begin: 'begin;', commit: 'commit;', rollback: 'rollback;', savepoint: 'savepoint qa;', backslash_in_literal: "select 'a" + BS + "b';",
        psql_variable: 'select :qa_var;', meta_command: BS + 'set qa 1', copy: 'copy factory.nodes to stdout;', dollar_backslash: 'select $r$a' + BS + 'b$r$;' };
      let k = 0;
      for (const [name, text] of Object.entries(PLANTS)) {
        const planted = join(tmp, 'm', 'supabase', 'control-plane', 'v1', '999_zz_planted.sql');
        writeFileSync(planted, text + '\n');
        const out = join(tmp, 'step-' + (k++) + '.sql');
        const r = spawnSync(process.execPath, [join(tools, 'build_live_migration_step.mjs'), out, ...copies, planted], { cwd: tools, encoding: 'utf8' });
        outcomes[name] = r.status === 0 && existsSync(out) ? 'built' : r.status === 2 && /refused/.test(r.stdout) && !existsSync(out) ? 'refused' : 'exit ' + r.status + ' ' + (r.stdout + r.stderr).trim().split('\n').pop();
      }
    } catch (e) { outcomes.error = e.message; }
    finally { rmSync(tmp, { recursive: true, force: true }); }
    const want = { begin: 'refused', commit: 'refused', rollback: 'refused', savepoint: 'refused', backslash_in_literal: 'refused', psql_variable: 'refused', meta_command: 'refused', copy: 'refused', dollar_backslash: 'built' };
    check('M1n the Director instrument, handed the candidate migration plus one planted last file, refuses a BEGIN, COMMIT, ROLLBACK, SAVEPOINT, a backslash in a single-quoted literal, a psql variable, a psql meta-command and a COPY, and builds the step when the planted backslash is inside a dollar-quoted body',
      JSON.stringify(outcomes) === JSON.stringify(want), JSON.stringify(outcomes));
  }
  // M3 NO MIGRATION-EXECUTED WRITE OF A COMPUTER RECORD OR THE S-16(a) BINDING (contract §1 "What a candidate migration writes";
  // VERIFICATION_SPEC §3.5): no migration statement (top level or DO block), and no function it calls or trigger a table it writes
  // fires, transitively, inserts, updates, deletes, merges, truncates, copies or drops factory.computers or writes s16a_bound_*; no
  // ALTER TABLE drops, renames or retypes factory.computers' columns or the binding's; no dynamic statement (EXECUTE / format()) writes
  // or alters a table through a placeholder while its literals name computers or the binding; a trigger attached through format()
  // on factory.%I is followed for every table the migration writes; no column default writes the binding.
  // Limits (a developer approximation): identifiers assembled other than as a literal next to the statement are not traced.
  {
    const scan = await import('./factory_v1_plane_scan.mjs');
    const units = mig.flatMap((p) => scan.sqlUnits(read(join(ROOT, p)), 'migration').map((u) => ({ ...u, file: p })));
    const WRITE = new RegExp([
      /\b(insert\s+into|update|delete\s+from|merge\s+into|truncate(\s+table)?|copy|drop\s+table(\s+if\s+exists)?)\s+(only\s+)?factory\.computers\b/.source,
      /\bupdate\s+factory\.[a-z_]+\s+(as\s+\w+\s+)?set\b[^;]*\bs16a_bound_(at|by)\b/.source,
      /\binsert\s+into\s+factory\.[a-z_]+\s*\([^)]*\bs16a_bound_(at|by)\b/.source,
      // ALTER TABLE of factory.computers that drops a column, renames the table or a column, or changes a column's type
      /\balter\s+table\s+(if\s+exists\s+)?(only\s+)?factory\.computers\b[^;]*?\b(drop\s+column|rename\b|alter\s+(column\s+)?"?[a-z_0-9]+"?\s+(set\s+data\s+)?type)\b/.source,
      // the binding's columns dropped, renamed or retyped on any table
      /\b(drop\s+column\s+(if\s+exists\s+)?|rename\s+column\s+)"?s16a_bound_(at|by)\b|\balter\s+(column\s+)?"?s16a_bound_(at|by)"?\s+(set\s+data\s+)?type\b/.source,
    ].join('|'), 'i');
    // a dynamic statement whose table is a placeholder, in a unit whose literals name computers or the binding
    const DYN_WRITE = /\b(insert\s+into|update|delete\s+from|merge\s+into|truncate(\s+table)?|copy|drop\s+table|alter\s+table)\s+(if\s+exists\s+)?(only\s+)?([a-z_]+\.)?%[IsL]/i;
    const namesTarget = (u) => u.literals.some((l) => /^\s*(factory\.)?computers\s*$|^\s*s16a_bound_(at|by)\s*$/i.test(l.text));
    const dynWrite = (u) => u.literals.some((l) => l.dynamic && DYN_WRITE.test(l.text)) && namesTarget(u);
    const bodies = new Map(units.filter((u) => u.fn).map((u) => [u.fn.toLowerCase(), u]));
    const migUnits = units.filter((u) => u.ctx === 'migration' || u.ctx === 'do');
    const litText = (u) => u.literals.filter((l) => l.dynamic).map((l) => l.text).join('\n');
    const direct = migUnits.filter((u) => WRITE.test(u.view) || WRITE.test(litText(u)) || dynWrite(u));
    // what the migration's statements reach: the functions they call, and the trigger functions of the tables they write
    const written = new Set(migUnits.flatMap((u) => [...(u.view + '\n' + litText(u)).matchAll(/\b(?:insert\s+into|update|delete\s+from|merge\s+into)\s+(?:only\s+)?(factory\.[a-z_]+)/gi)].map((m) => m[1].toLowerCase())));
    // (a trigger attached through format() on factory.%I may be on any table: '*', followed whenever the migration writes a factory table)
    const triggers = migUnits.flatMap((u) => [...(u.view + '\n' + litText(u)).matchAll(/\bon\s+(factory\.(?:[a-z_]+|%[IsL]))[\s\S]*?\bexecute\s+(?:function|procedure)\s+(factory\.[a-z_0-9]+)\s*\(/gi)]
      .map((m) => ({ table: m[1].includes('%') ? '*' : m[1].toLowerCase(), fn: m[2].toLowerCase() })));
    const firedOn = (table) => triggers.filter((x) => x.table === table || x.table === '*');
    // (a function named by CREATE / ALTER / COMMENT ON / GRANT / REVOKE / CREATE TRIGGER is defined or granted, not called)
    const callers = migUnits.filter((u) => u.ctx === 'do' || !/^(create|alter|comment|grant|revoke|drop)\b/i.test(u.stmt));
    const queue = [...callers.flatMap((u) => [...u.view.matchAll(/\b(factory\.[a-z_0-9]+)\s*\(/gi)].map((m) => m[1].toLowerCase())), ...[...written].flatMap((tb) => firedOn(tb)).map((t) => t.fn)];
    const seen = new Set(); const reached = [];
    while (queue.length) { const n = queue.pop(); if (seen.has(n) || !bodies.has(n)) continue; seen.add(n); const b = bodies.get(n); reached.push(b);
      for (const m of b.view.matchAll(/\b(factory\.[a-z_0-9]+)\s*\(/gi)) queue.push(m[1].toLowerCase());
      for (const m of b.view.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+(factory\.[a-z_]+)/gi)) for (const t of firedOn(m[1].toLowerCase())) queue.push(t.fn); }
    const viaCalls = reached.filter((b) => WRITE.test(b.view) || WRITE.test(litText(b)) || dynWrite(b));
    const defaults = units.filter((u) => /\bs16a_bound_(at|by)\b[^,;]*\bdefault\b|\balter\s+column\s+s16a_bound_(at|by)\s+set\s+default\b/i.test(u.view));
    check('M3 no migration statement, and no function it calls or trigger it fires (transitively, triggers attached through format() included; ' + reached.length + ' functions reached), writes, truncates, copies or drops factory.computers, drops / renames / retypes its columns, or writes, drops, renames or retypes the S-16(a) binding (s16a_bound_at / by), directly or through a dynamic statement naming them; no column default writes the binding',
      direct.length === 0 && viaCalls.length === 0 && defaults.length === 0 && units.length > 100 && triggers.some((x) => x.table === '*'),
      JSON.stringify({ direct: direct.map((u) => u.file + ' ' + u.stmt.slice(0, 60)), viaCalls: viaCalls.map((b) => b.fn), defaults: defaults.map((u) => u.file + ' ' + u.stmt.slice(0, 60)) }));
  }
}

// ---------------------------------------------------------------- a small JavaScript reader (row H1)
// jsView(text) -> { code, raw }, both as long as text: `raw` has comments blanked; `code` also blanks the contents of string, template
// and regular-expression literals (a template's ${...} stays code). A `/` starts a regular expression where an operand is expected.
function jsView(text) {
  const code = text.split(''), raw = text.split('');
  const blank = (arr, a, b) => { for (let k = a; k < b; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  const tpl = [];
  const prevSig = (k) => { let j = k - 1; while (j >= 0 && /\s/.test(code[j])) j--; return j < 0 ? '' : code[j]; };
  const prevWord = (k) => { let j = k - 1; while (j >= 0 && /\s/.test(code[j])) j--; const e = j + 1; while (j >= 0 && /[\w$]/.test(code[j])) j--; return code.slice(j + 1, e).join(''); };
  const scanTemplate = (j) => {
    const from = j;
    while (j < text.length) {
      if (text[j] === '\\') { j += 2; continue; }
      if (text[j] === '`') { blank(code, from, j); return j + 1; }
      if (text[j] === '$' && text[j + 1] === '{') { blank(code, from, j); tpl.push(0); return j + 2; }
      j++;
    }
    blank(code, from, j); return j;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (tpl.length && c === '}' && tpl[tpl.length - 1] === 0) { tpl.pop(); i = scanTemplate(i + 1); continue; }
    if (tpl.length && c === '{') { tpl[tpl.length - 1]++; i++; continue; }
    if (tpl.length && c === '}') { tpl[tpl.length - 1]--; i++; continue; }
    if (c === '/' && n === '/') { const e = text.indexOf('\n', i); const j = e < 0 ? text.length : e; blank(code, i, j); blank(raw, i, j); i = j; continue; }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); const j = e < 0 ? text.length : e + 2; blank(code, i, j); blank(raw, i, j); i = j; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1; blank(code, i + 1, j); i = j + 1; continue; }
    if (c === '`') { i = scanTemplate(i + 1); continue; }
    if (c === '/' && (/^[(,=:[!&|?{};+\-*%<>~^]?$/.test(prevSig(i)) || /^(return|typeof|case|of|in)$/.test(prevWord(i)))) {
      let j = i + 1, cls = false;
      while (j < text.length && text[j] !== '\n') { if (text[j] === '\\') { j += 2; continue; } if (text[j] === '[') cls = true; else if (text[j] === ']') cls = false; else if (text[j] === '/' && !cls) break; j++; }
      blank(code, i + 1, j); i = j + 1; continue;
    }
    i++;
  }
  return { code: code.join(''), raw: raw.join('') };
}
// the index just past the bracket that closes the one at `open` (code view)
function matchClose(code, open) {
  let d = 0;
  for (let k = open; k < code.length; k++) {
    const c = code[k];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { d--; if (d === 0) return k + 1; }
  }
  return code.length;
}
// [start, end) of every call whose name matches `re` (the match ends at its opening parenthesis); end is just past the closing one
function callSpans(code, re) { return [...code.matchAll(re)].map((m) => [m.index, matchClose(code, m.index + m[0].length - 1)]); }
// where the expression that starts at `from` ends: a `;`, or a closing bracket, at depth 0, or a line break after which the
// expression cannot continue (the next line does not start with an operator and this one does not end with one)
function stmtEnd(code, from) {
  let d = 0;
  for (let k = from; k < code.length; k++) {
    const c = code[k];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) return k; d--; }
    else if (d === 0 && c === ';') return k;
    else if (d === 0 && c === '\n' && !/^\s*[.?:+\-*/|&,)\]]/.test(code.slice(k + 1, k + 200)) && !/[=+\-*/|&,(?:[{]\s*$/.test(code.slice(Math.max(from, k - 200), k))) return k;
  }
  return code.length;
}

// ---------------------------------------------------------------- R: the migration's privilege model (S-10; VERIFICATION_SPEC §3.4 r3)
// A small SQL reader: comments, single-quoted literals, quoted identifiers and dollar-quoted bodies are recognized; a dollar body right
// after `do` is a DO block (a migration statement, read as code); one after `as` inside CREATE FUNCTION / PROCEDURE is a function body
// (read separately); any other is a literal. Statements split at `;` outside all of them.
function lexSql(text) {
  const segs = []; let i = 0, code = '';
  const flush = () => { if (code) { segs.push({ k: 'code', t: code }); code = ''; } };
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '-' && n === '-') { const e = text.indexOf('\n', i); const j = e < 0 ? text.length : e; flush(); segs.push({ k: 'comment', t: text.slice(i, j) }); i = j; continue; }
    if (c === '/' && n === '*') { let d = 1, j = i + 2; while (j < text.length && d) { if (text.startsWith('/*', j)) { d++; j += 2; } else if (text.startsWith('*/', j)) { d--; j += 2; } else j++; } flush(); segs.push({ k: 'comment', t: text.slice(i, j) }); i = j; continue; }
    if (c === "'") { let j = i + 1; for (;;) { const q = text.indexOf("'", j); if (q < 0) { j = text.length; break; } if (text[q + 1] === "'") { j = q + 2; continue; } j = q + 1; break; } flush(); segs.push({ k: 'literal', t: text.slice(i, j) }); i = j; continue; }
    if (c === '"') { let j = i + 1; for (;;) { const q = text.indexOf('"', j); if (q < 0) { j = text.length; break; } if (text[q + 1] === '"') { j = q + 2; continue; } j = q + 1; break; } code += text.slice(i, j); i = j; continue; }
    if (c === '$' && !/[A-Za-z0-9_$]/.test(text[i - 1] || ' ')) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
      if (m) { const tag = m[0]; const e = text.indexOf(tag, i + tag.length); const j = e < 0 ? text.length : e + tag.length; flush(); segs.push({ k: 'dollar', t: text.slice(i + tag.length, j - tag.length), tag }); i = j; continue; }
    }
    if (c === ';') { code += ';'; flush(); segs.push({ k: 'end' }); i++; continue; }
    code += c; i++;
  }
  flush();
  // statements, each with its code (literals blanked), its DO bodies and its function body
  const stmts = []; let cur = { code: '', dos: [], fn: null, raw: '' };
  for (const s of segs) {
    if (s.k === 'end') { stmts.push(cur); cur = { code: '', dos: [], fn: null, raw: '' }; continue; }
    if (s.k === 'comment') continue;
    if (s.k === 'literal') { cur.code += " '' "; cur.raw += s.t; continue; }
    if (s.k === 'dollar') {
      const before = cur.code.replace(/\s+$/, '');
      if (/\bdo$/i.test(before)) { cur.dos.push(s.t); cur.code += ' $do$ '; }
      else if (/\bas$/i.test(before) && /^\s*create\s+(or\s+replace\s+)?(function|procedure)\b/i.test(cur.code)) { cur.fn = s.t; cur.code += ' $body$ '; }
      else cur.code += " '' ";
      cur.raw += s.t; continue;
    }
    cur.code += s.t; cur.raw += s.t;
  }
  if (cur.code.trim()) stmts.push(cur);
  return stmts.filter((s) => s.code.trim());
}
// the code of a DO body or a function body, with its own comments and literals blanked (nested dollar bodies read as code)
const bodyCode = (body) => lexSql(body + ';').map((s) => s.code + ' ' + s.dos.map(bodyCode).join(' ')).join('\n');
{
  const V1 = join(ROOT, 'supabase', 'control-plane', 'v1');
  const files = readdirSync(V1).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const parsed = files.map((f) => ({ f, stmts: lexSql(read(join(V1, f))) }));
  // (a) outside function bodies (top-level statements and DO blocks): no reference to the applying login, and no read of a login's or
  // an owner's name or attributes
  const MIG_FORBIDDEN = [/\b(current_user|session_user|current_role|user)\b/i, /\bpg_(auth_members|authid|roles|user|shadow|group|db_role_setting|settings)\b/i,
    /\brol(super|createrole|createdb|replication|bypassrls|canlogin|inherit|config|connlimit|password|validuntil)\b/i, /\bpg_has_role\s*\(/i,
    /\bpg_get_userbyid\s*\(/i, /\b(relowner|proowner|nspowner|typowner|defaclrole|datdba|lanowner|oprowner|collowner|conowner|evtowner|srvowner|extowner)\b/i,
    /\bacldefault\s*\(/i, /\bcurrent_setting\s*\(/i, /\bset_config\s*\(/i, /(^|;)\s*show\s+\w/i];
  const migHits = [];
  // (b) inside function bodies: session_user / current_user / role catalogs only where the r3 classes name them
  const ALLOWED_IN_BODY = {
    _via_api: { re: /\bsession_user\b/i, cls: 'the call\'s input: the calling API role (session_user inside the SECURITY DEFINER front doors that call it)' },
    _refuse_superuser: { re: /\b(session_user|pg_roles|rolsuper)\b/i, cls: 'the call\'s input: the refusal of a superuser caller' },
    _authority_guard: { re: /\bcurrent_user\b/i, cls: 'the engine test of an INVOKER trigger function (the writer); never an applying-login or owner read in a migration statement' },
    _legacy_guard: { re: /\bcurrent_user\b/i, cls: 'the engine test of an INVOKER trigger function (the writer); never an applying-login or owner read in a migration statement' },
  };
  const BODY_WATCH = /\b(current_user|session_user|current_role|pg_auth_members|pg_authid|pg_roles|pg_has_role|pg_get_userbyid|relowner|proowner|defaclrole|acldefault|rolsuper|rolbypassrls|rolreplication|rolcreaterole|rolcanlogin)\b/gi;
  const bodyHits = [], allowedSeen = new Set();
  for (const { f, stmts } of parsed) {
    for (const s of stmts) {
      const mig = s.code.replace(/\$body\$/g, '') + '\n' + s.dos.map(bodyCode).join('\n');
      for (const re of MIG_FORBIDDEN) { const m = re.exec(mig); if (m) migHits.push(f + ': `' + m[0].trim() + '` in `' + s.code.trim().replace(/\s+/g, ' ').slice(0, 70) + '`'); }
      if (s.fn !== null) {
        const name = ((/create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+factory\.([a-z_0-9]+)/i.exec(s.code) || [])[1]) || '?';
        const secdef = /\bsecurity\s+definer\b/i.test(s.code);
        const code = bodyCode(s.fn);
        for (const m of code.matchAll(BODY_WATCH)) {
          const a = ALLOWED_IN_BODY[name];
          if (!secdef && a && a.re.test(m[0])) { allowedSeen.add(name + ' (' + m[0] + '): ' + a.cls); continue; }
          bodyHits.push(f + ': ' + name + (secdef ? ' (SECURITY DEFINER)' : '') + ' reads `' + m[0] + '`');
        }
      }
    }
  }
  check('R1 no top-level statement or DO block refers to the applying login (current_user, session_user) or reads a login\'s or an object owner\'s name or attributes (role catalogs and attributes, owner columns, acldefault, settings); in function bodies only the classified call\'s-input and engine-test constructs',
    migHits.length === 0 && bodyHits.length === 0, [...migHits, ...bodyHits].join(' | '));
  for (const a of [...allowedSeen].sort()) console.log('     classified ' + a);

  // R2 the roles exist by construction: three CREATE ROLE, every privileged attribute off, no membership clause; createrole_self_grant
  // only as the two constants around factory_owner; no role-membership GRANT / REVOKE, no ALTER / DROP ROLE, no CREATE USER / GROUP
  const all = parsed.flatMap(({ f, stmts }) => stmts.map((s) => ({ f, c: s.code.trim().replace(/\s+/g, ' '), dos: s.dos })));
  const ATTR = 'nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
  const creates = all.filter((s) => /^create\s+role\b/i.test(s.c));
  const wantRoles = ['factory_owner', 'factory_node_api', 'factory_admin_api'];
  const roleOk = creates.length === 3 && creates.every((s, k) => s.c.toLowerCase() === ('create role ' + wantRoles[k] + ' ' + ATTR + ';'));
  // createrole_self_grant: exactly two statements, the ones right before and right after `create role factory_owner`; their constants
  // are read from the source (the reader blanks literals)
  const i0 = all.findIndex((s) => /^create\s+role\s+factory_owner\b/i.test(s.c));
  const selfAt = all.map((s, k) => (/createrole_self_grant/i.test(s.c + ' ' + s.dos.join(' ')) ? k : -1)).filter((k) => k >= 0);
  const selfOk = i0 > 0 && selfAt.length === 2 && selfAt[0] === i0 - 1 && selfAt[1] === i0 + 1 && all.every((s) => /^set local createrole_self_grant = '' ;$/i.test(s.c) || !/createrole_self_grant/i.test(s.c));
  const src000 = read(join(V1, '000_preconditions_roles.sql')).replace(/--[^\n]*/g, '');
  const selfRe = /set local createrole_self_grant = 'set';\s*create role factory_owner [^;]*;\s*set local createrole_self_grant = '';\s*create role factory_node_api/i;
  const selfCount = selfAt.length;
  const membership = all.filter((s) => /^(grant|revoke)\s/i.test(s.c) && !/\bon\s/i.test(s.c));
  const doMembership = all.filter((s) => s.dos.some((d) => /\b(grant|revoke)\s+[a-z_"]+\s+(to|from)\s/i.test(bodyCode(d)) && !/\bgrant\s+[^;]*\bon\s/i.test(bodyCode(d))));
  const roleDdl = all.filter((s) => /^(alter|drop)\s+role\b|^create\s+(user|group)\b|^alter\s+(user|group)\b/i.test(s.c));
  check('R2 the roles exist by construction: exactly three CREATE ROLE statements with every privileged attribute off and no membership clause; createrole_self_grant only as the constants \'set\' (right before factory_owner) and \'\' (right after); no role-membership GRANT or REVOKE, no ALTER / DROP ROLE, no CREATE USER / GROUP',
    roleOk && selfOk && selfRe.test(src000) && selfCount === 2 && membership.length === 0 && doMembership.length === 0 && roleDdl.length === 0,
    JSON.stringify({ creates: creates.map((s) => s.c), selfGrant: selfCount, membership: membership.map((s) => s.f + ': ' + s.c.slice(0, 80)), roleDdl: roleDdl.map((s) => s.c.slice(0, 60)) }));

  // R3 exception handlers: only data conditions, or a handler that begins by re-raising (§3.4: insufficient privilege, an undefined
  // object, an unsupported feature, a configuration or program limit, a cancelled query, an unavailable lock, WHEN OTHERS never swallowed)
  const DATA_OK = /^(unique_violation|check_violation|foreign_key_violation|not_null_violation|exclusion_violation|integrity_constraint_violation|restrict_violation|invalid_text_representation|numeric_value_out_of_range|data_exception|division_by_zero|invalid_datetime_format|datetime_field_overflow|string_data_right_truncation|invalid_parameter_value|null_value_not_allowed|no_data_found|too_many_rows|sqlstate\s+'2[23][0-9a-z]{3}')$/i;
  const handlerBad = [];
  const bodiesOf = (s) => [...s.dos, ...(s.fn !== null ? [s.fn] : [])];
  for (const { f, stmts } of parsed) for (const s of stmts) for (const b of bodiesOf(s)) {
    // the body's code with comments and literals blanked; an EXCEPTION clause is `exception when ...` (never `raise exception`)
    const code = bodyCode(b);
    for (const m of code.matchAll(/\bexception\s+(when\b[\s\S]*?)\bend\b/gi)) {
      for (const w of m[1].matchAll(/\bwhen\s+([\s\S]*?)\s+then\b\s*([^;]*;)?/gi)) {
        const conds = w[1].split(/\s+or\s+/i).map((x) => x.trim());
        const reraise = /^\s*raise\s*;/i.test(w[2] || '');
        const bad = conds.filter((x) => !DATA_OK.test(x));
        if (bad.length && !reraise) handlerBad.push(f + ': when ' + w[1].replace(/\s+/g, ' ') + ' then ' + (w[2] || '').trim().slice(0, 40));
      }
    }
  }
  check('R3 every exception handler of the migration handles data conditions only, or re-raises: none absorbs insufficient privilege, an undefined object, an unsupported feature, a limit, a cancelled query, an unavailable lock or OTHERS',
    handlerBad.length === 0, handlerBad.join(' | '));

  // R4 SET ROLE hygiene: only `set local role factory_owner` / `reset role`, each file closes what it opens, and the migration's last
  // statement is `reset role`
  const roleBad = [];
  for (const { f, stmts } of parsed) {
    let state = 'login';
    for (const s of stmts) {
      const c = s.code.trim().replace(/\s+/g, ' ').toLowerCase();
      if (/^set (local )?role\b/.test(c) || /^(set|reset) session authorization\b/.test(c) || /^set session role\b/.test(c)) {
        if (c !== 'set local role factory_owner;') roleBad.push(f + ': ' + c);
        else if (state === 'owner') roleBad.push(f + ': set role twice'); else state = 'owner';
      } else if (c === 'reset role;') state = 'login';
    }
    if (state !== 'login') roleBad.push(f + ': ends as factory_owner');
  }
  const lastStmt = parsed[parsed.length - 1].stmts.slice(-1)[0].code.trim().toLowerCase();
  check('R4 SET ROLE occurs only as `set local role factory_owner`, and each file that uses it resets it (`reset role`) before it ends; no SESSION AUTHORIZATION; the migration ends with `reset role`',
    roleBad.length === 0 && lastStmt === 'reset role;', roleBad.join(' | ') + (lastStmt === 'reset role;' ? '' : ' last: ' + lastStmt));

  // R5 part 990 names its relations: its table revoke and part 080's authority list each equal every relation the migration creates;
  // its sequence revoke equals the identity sequence of every identity column the migration declares (PostgreSQL names it
  // <table>_<column>_seq); nothing is created by dynamic SQL
  const created = all.filter((s) => /^create\s+(unlogged\s+)?(table|view|materialized\s+view|sequence|foreign\s+table)\s+(if\s+not\s+exists\s+)?factory\./i.test(s.c))
    .map((s) => 'factory.' + /factory\.([a-z_0-9]+)/i.exec(s.c)[1]).sort();
  const identitySeqs = all.filter((s) => /^create\s+table\s+factory\./i.test(s.c)).flatMap((s) => {
    const t = /^create\s+table\s+factory\.([a-z_0-9]+)/i.exec(s.c)[1];
    return [...s.c.matchAll(/(?:\(|,)\s*([a-z_][a-z_0-9]*)\s+[a-z_ ]+?\s+generated\s+(?:always|by\s+default)\s+as\s+identity\b/gi)].map((m) => 'factory.' + t + '_' + m[1] + '_seq');
  }).sort();
  const dynamic = all.filter((s) => s.dos.some((d) => /create\s+(unlogged\s+)?(table|view|materialized|sequence|foreign)/i.test(d))).map((s) => s.f);
  const stmts990 = all.filter((s) => s.f === '990_finalize.sql').map((s) => s.c);
  const revokeList = (kind) => {
    const st = stmts990.filter((c) => new RegExp('^revoke all on ' + kind + ' ', 'i').test(c));
    const m = st.length === 1 ? new RegExp('^revoke all on ' + kind + ' (.*) from public, factory_runner;$', 'i').exec(st[0]) : null;
    return m ? m[1].split(',').map((x) => x.trim()).sort() : ['(' + st.length + ' statements of that form)'];
  };
  const revTables = revokeList('table'), revSeqs = revokeList('sequence');
  const src080 = read(join(V1, '080_guards.sql'));
  const attach = ((((/-- 1\. every authority record[\s\S]*?foreach t in array array\[([\s\S]*?)\] loop/.exec(src080) || [])[1]) || '').match(/'[a-z_0-9]+'/g) || []).map((x) => 'factory.' + x.slice(1, -1)).sort();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('R5 part 990 names its relations: its table revoke (from PUBLIC and factory_runner) and part 080\'s authority list each equal every relation the migration creates (CREATE TABLE / VIEW / SEQUENCE / FOREIGN TABLE in v1); its sequence revoke equals the identity sequence of every identity column; no relation is created by dynamic SQL',
    created.length === 19 && same(revTables, created) && same(attach, created)
      && identitySeqs.length === 3 && same(revSeqs, identitySeqs) && dynamic.length === 0,
    JSON.stringify({ created: created.length, revokedTables: revTables.length, attach: attach.length,
      notRevoked: created.filter((x) => !revTables.includes(x)), notAttached: created.filter((x) => !attach.includes(x)),
      extra: [...new Set([...revTables, ...attach])].filter((x) => !created.includes(x)), identitySeqs, revSeqs, dynamic }));

  // R6 the founder's prepared steps (S-10 scope: "a founder step"): no applying-login or owner name / attribute, no membership, no
  // setting, no platform-schema probe, in any code span; pg_roles only by the API roles' fixed names
  const stepsMd = read(join(ROOT, 'qa', 'implementation', 'auto-enrollment-v1', 'FOUNDER_PREPARED_STEPS.md'));
  // every fenced block, and every inline code span that is a statement (a name mentioned in prose is not a read)
  const spans = [...stepsMd.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]).concat([...stepsMd.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1]).filter((s) => /^\s*(select|with|insert|update|delete|alter|grant|revoke|create|drop|set|reset|show|do|begin|call|\\)/i.test(s)));
  const STEP_FORBIDDEN = [/\b(current_user|session_user|current_role)\b/i, /\bpg_(auth_members|authid|shadow|db_role_setting|settings)\b/i,
    /\brol(super|createrole|createdb|replication|bypassrls|inherit|config)\b/i, /\bpg_has_role\s*\(/i, /\bpg_get_userbyid\s*\(/i,
    /\b(relowner|proowner|nspowner|typowner|defaclrole|datdba)\b/i, /\bacldefault\s*\(/i, /\bcurrent_setting\s*\(/i, /\bshow\s+[a-z_]+\s*;/i,
    /\b(storage|auth|vault|cron|net|supabase_functions)\.[a-z_]+/i, /like\s+'factory_%'/i];
  const stepHits = [];
  for (const sp of spans) {
    for (const re of STEP_FORBIDDEN) { const m = re.exec(sp); if (m) stepHits.push('`' + m[0] + '` in `' + sp.replace(/\s+/g, ' ').slice(0, 70) + '`'); }
    if (/\bpg_roles\b/i.test(sp) && !/pg_roles\s+where\s+rolname\s+in\s+\('factory_node_api',\s*'factory_admin_api'\)/i.test(sp)) stepHits.push('pg_roles read other than by the API roles\' names: `' + sp.replace(/\s+/g, ' ').slice(0, 70) + '`');
  }
  check('R6 the founder\'s prepared steps read no applying-login or object-owner name or attribute, no membership, no setting and no platform schema (every code span of FOUNDER_PREPARED_STEPS.md)',
    stepHits.length === 0, stepHits.join(' | '));
  // R8 every function the migration creates pins exactly `search_path = pg_catalog, pg_temp`: pg_catalog first, the session's
  // temporary schema listed last
  const fnStmts = parsed.flatMap(({ f, stmts }) => stmts.filter((s) => s.fn !== null).map((s) => ({ f, s,
    name: ((/create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+factory\.([a-z_0-9]+)/i.exec(s.code) || [])[1]) || '?' })));
  const spBad = fnStmts.filter(({ s }) => {
    const paths = [...s.code.replace(/\s+/g, ' ').matchAll(/\bset search_path\s*(?:=|to)\s*(.*?)\s*(?=\bset\b|\bas \$body\$|$)/gi)].map((m) => m[1]);
    return paths.length !== 1 || paths[0] !== 'pg_catalog, pg_temp';
  }).map(({ f, name }) => f + ': ' + name);
  check('R8 every function of the migration (' + fnStmts.length + ') pins exactly `set search_path = pg_catalog, pg_temp` (pg_catalog first, the session\'s temporary schema last)',
    fnStmts.length >= 100 && spBad.length === 0, spBad.join(' | '));
  // R9 the identity functions appear in function bodies ONLY in three exact shapes, none of which names a type the calling session
  // could create: `current_user = | <> <constant>::pg_catalog.name` (the engine tests), `session_user in (<constant>::pg_catalog.name,
  // <constant>::pg_catalog.name)` (the API-caller test) and `rolname = session_user` (name against name: the superuser refusal). Any
  // other use - a ::cast, CAST(... AS ...), concatenation, format(), a comparison with an untyped or text constant - fails. And each
  // engine / API-caller test (_authority_guard, _legacy_guard, _via_api) takes its typed shape.
  const IDENTITY_SHAPES = [/\bcurrent_user (=|<>) ''::pg_catalog\.name(?![\w.:])/gi,
    /\bsession_user in \(''::pg_catalog\.name, ''::pg_catalog\.name\)(?![\w.:])/gi, /\brolname = session_user(?![\w.:])(?! ?::)/gi];
  const normIdentity = (code) => code.replace(/\s+/g, ' ').replace(/\s*::\s*/g, '::').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,\s*/g, ', ');
  const strayBad = [], typedMissing = [];
  for (const { f, s, name } of fnStmts) {
    const code = normIdentity(bodyCode(s.fn));
    const rest = IDENTITY_SHAPES.reduce((t, re) => t.replace(re, ' '), code);
    for (const m of rest.matchAll(/\b(current_user|session_user|current_role|user)\b(?!_)[^;]{0,30}/gi)) strayBad.push(f + ': ' + name + ' `' + m[0].trim() + '`');
    if (['_authority_guard', '_legacy_guard', '_via_api'].includes(name) && !IDENTITY_SHAPES.slice(0, 2).some((re) => new RegExp(re.source, 'i').test(code))) typedMissing.push(f + ': ' + name);
  }
  check('R9 current_user / session_user appear in function bodies only as a comparison with pg_catalog.name constants (or name against name in the superuser refusal): no cast, CAST, concatenation or format(); the engine and API-caller tests (_authority_guard, _legacy_guard, _via_api) take the typed shape',
    strayBad.length === 0 && typedMissing.length === 0, JSON.stringify({ other_uses: strayBad, untyped: typedMissing }));

  // R10 the legacy guard's own 69df2f52 column lists (part 080: `base := case tg_table_name when '<table>' then array[...] ...`, a guard
  // the legacy role fires calls no function) equal part 000's reference list factory._baseline_columns(), table by table and in
  // order. An arm is read in exactly one shape - `when '<table>' then array[...]` followed directly by the next `when` or by `end` -
  // so an arm extended past its array compares as missing. (Read back from the plane's definitions by schema acceptance C15.)
  const BASE8 = ['nodes', 'work_orders', 'work_order_dependencies', 'agent_runs', 'surface_locks', 'checkpoints', 'founder_notifications', 'director_lease'];
  const fnBody = (name) => { const s = fnStmts.find((x) => x.name === name); return s ? bodyCode(s.s.fn).replace(/\s+/g, ' ') : ''; };
  // bodyCode blanks literals, so the quoted names are read from the raw body with its comments removed
  const rawBody = (name) => { const s = fnStmts.find((x) => x.name === name); return s ? s.s.fn.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ') : ''; };
  const arm = (body, tname) => { const m = new RegExp("when '" + tname + "' then array\\[([^\\]]*)\\] (when|end)[^a-z_]").exec(body); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; };
  const refBody = rawBody('_baseline_columns'), guardBody = rawBody('_legacy_guard');
  const listDiff = BASE8.filter((tn) => { const a = arm(refBody, tn), b = arm(guardBody, tn); return !a || !b || !same(a, b); });
  check('R10 the legacy guard\'s 69df2f52 column lists equal part 000\'s factory._baseline_columns(), for each of the eight 69df2f52 tables, in order (each arm in exactly one shape; an arm extended past its array fails)',
    refBody.length > 0 && guardBody.length > 0 && fnBody('_legacy_guard').length > 0 && listDiff.length === 0, 'differ or not found: ' + listDiff.join(', '));

  // R12 part 000's factory._baseline_columns() is the REFERENT's column list, not only the guard's copy of it: for each of the eight
  // tables it equals, in order, the columns 69df2f52's own control-plane SQL gives the table (its CREATE TABLE, then its ALTER TABLE
  // ... ADD / DROP / RENAME COLUMN, files 001-003 in order, read with git at 69df2f52), and, as a set, the columns of that table in
  // the Director's r3 snapshot of the live plane before the candidate (LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json at the
  // designated Director commit). R10 and schema C15 hold the guard's copy to this list; this row holds the list itself, so one change
  // made the same way to both copies is still seen.
  const referentCols = new Map(BASE8.map((t) => [t, []]));
  const baseFiles = (gitOut('ls-tree', '--name-only', BASE_COMMIT, 'supabase/control-plane/') || '').trim().split('\n').filter((f) => /\/\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  for (const bf of baseFiles) {
    for (const st of lexSql((gitOut('show', BASE_COMMIT + ':' + bf) || '').replace(/\r\n/g, '\n'))) {
      const c = st.code.replace(/\s+/g, ' ').trim();
      const ct = /^create table (?:if not exists )?factory\.([a-z_0-9]+) \((.*)\)\s*;?$/i.exec(c);
      const at = /^alter table (?:if exists )?(?:only )?factory\.([a-z_0-9]+) (.*?);?$/i.exec(c);
      const items = (body) => { const out = []; let d = 0, from = 0; for (let i = 0; i < body.length; i++) { if (body[i] === '(') d++; else if (body[i] === ')') d--; else if (body[i] === ',' && d === 0) { out.push(body.slice(from, i).trim()); from = i + 1; } } out.push(body.slice(from).trim()); return out; };
      if (ct && referentCols.has(ct[1].toLowerCase())) {
        const cols = referentCols.get(ct[1].toLowerCase());
        for (const it of items(ct[2])) if (!/^(constraint|primary|unique|check|foreign|exclude|like)\b/i.test(it)) { const n = (/^"?([a-z_0-9]+)"?\s/i.exec(it + ' ') || [])[1]; if (n) cols.push(n.toLowerCase()); }
      } else if (at && referentCols.has(at[1].toLowerCase())) {
        const cols = referentCols.get(at[1].toLowerCase());
        for (const it of items(at[2])) {
          const add = /^add (?:column )?(?:if not exists )?"?([a-z_0-9]+)"?\s/i.exec(it + ' ');
          const drop = /^drop (?:column )?(?:if exists )?"?([a-z_0-9]+)"?/i.exec(it);
          const ren = /^rename (?:column )?"?([a-z_0-9]+)"? to "?([a-z_0-9]+)"?/i.exec(it);
          if (add && !/^(constraint|primary|unique|check|foreign|exclude)$/i.test(add[1])) { if (!cols.includes(add[1].toLowerCase())) cols.push(add[1].toLowerCase()); }
          else if (drop && !/^(constraint|default|not|identity|expression)$/i.test(drop[1])) { const k = cols.indexOf(drop[1].toLowerCase()); if (k >= 0) cols.splice(k, 1); }
          else if (ren) { const k = cols.indexOf(ren[1].toLowerCase()); if (k >= 0) cols[k] = ren[2].toLowerCase(); }
        }
      }
    }
  }
  const snapText = gitOut('show', DIRECTOR_COMMIT + ':qa/verification/auto-enrollment-v1/LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json');
  const snapCols = new Map(BASE8.map((t) => [t, []]));
  if (snapText) for (const col of JSON.parse(snapText).columns || []) { const m = /^factory\.([a-z_0-9]+)\.([a-z_0-9]+):/.exec(col); if (m && snapCols.has(m[1])) snapCols.get(m[1]).push(m[2]); }
  const refDiff = BASE8.filter((tn) => { const a = arm(refBody, tn) || []; const src = referentCols.get(tn), live = snapCols.get(tn);
    return !a.length || !same(a, src) || !same([...a].sort(), [...live].sort()); });
  check('R12 part 000\'s factory._baseline_columns() is the 69df2f52 referent\'s column list: for each of the eight tables it equals, in order, the columns 69df2f52\'s control-plane SQL gives the table (' + baseFiles.length + ' files read at ' + BASE_COMMIT.slice(0, 8) + '), and, as a set, that table\'s columns in the Director\'s r3 pre-candidate snapshot of the live plane (' + [...snapCols.values()].reduce((n, x) => n + x.length, 0) + ' columns)',
    baseFiles.length === 3 && snapText !== null && refDiff.length === 0,
    'differ: ' + refDiff.map((tn) => tn + ' (baseline ' + (arm(refBody, tn) || []).length + ', 69df2f52 source ' + referentCols.get(tn).length + ', live snapshot ' + snapCols.get(tn).length + ')').join(', '));

  // R11 no statement of the migration drops, renames or changes the type of a 69df2f52 column, or drops or renames a 69df2f52 table
  // (the migration only adds columns, constraints and triggers to them): ALTER TABLE on one of the eight, in a top-level statement or a
  // DO body, carries no DROP COLUMN, RENAME, ALTER COLUMN ... TYPE / SET DATA TYPE; no DROP TABLE names one
  const baseRe = '(?:factory\\.)?(?:' + BASE8.join('|') + ')\\b';
  const alterBad = [];
  for (const s of all) {
    for (const text of [s.c, ...s.dos.map((d) => bodyCode(d).replace(/\s+/g, ' '))]) {
      for (const m of text.matchAll(new RegExp('\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?' + baseRe + '([^;]*)', 'gi'))) {
        if (/\bdrop\s+(column\b|(?!constraint\b|trigger\b|default\b|not\b|identity\b|expression\b)[a-z_"])|\brename\b|\balter\s+(column\s+)?[a-z_"]+\s+(set\s+data\s+)?type\b/i.test(m[1])) alterBad.push(s.f + ': ' + m[0].slice(0, 90));
      }
      for (const m of text.matchAll(new RegExp('\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?[^;]*?' + baseRe, 'gi'))) alterBad.push(s.f + ': ' + m[0].slice(0, 90));
    }
  }
  // ... and no DYNAMIC statement does it: every string literal of every unit of the migration (top-level statements, DO bodies,
  // function bodies; the text EXECUTE or format() would run, including literals joined by || or assembled in a variable) is read as
  // SQL. An ALTER TABLE whose target is one of the eight, a format() placeholder (%I, %s, %L) or left open for concatenation, and
  // that drops, renames or retypes, is refused; so is a DROP TABLE naming one of the eight or a placeholder. (A placeholder is
  // refused whatever the argument: the migration has no dynamic DDL of that kind at all.)
  const scanLib = await import('./factory_v1_plane_scan.mjs');
  const dynBad = [];
  const TARGET = '(?:(?:factory\\.)?(?:' + BASE8.join('|') + ')\\b|(?:factory\\.)?%[IsL]|(?:factory\\.)?\\s*$|(?:factory\\.)?\\s*(?=\\u0000))';
  const DYN_ALTER = new RegExp('\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?' + TARGET + '[^;]{0,240}?\\b(?:drop\\s+(?:column\\b|(?!constraint\\b|trigger\\b|default\\b|not\\b|identity\\b|expression\\b)[a-z_"%])|rename\\b|alter\\s+(?:column\\s+)?[a-z_"%]+\\s+(?:set\\s+data\\s+)?type\\b)', 'i');
  const DYN_DROP = new RegExp('\\bdrop\\s+table\\s+[^;]{0,120}?(?:\\b(?:' + BASE8.join('|') + ')\\b|%[IsL])', 'i');
  for (const f of files) {
    for (const u of scanLib.sqlUnits(read(join(V1, f)), 'migration')) {
      // the unit's literals joined in order (a statement assembled from several literals reads as one text)
      const joined = u.literals.map((l) => l.text).join('\u0000');
      if (DYN_ALTER.test(joined) || DYN_DROP.test(joined)) dynBad.push(f + ': ' + (u.fn || u.ctx) + ' "' + ((DYN_ALTER.exec(joined) || DYN_DROP.exec(joined))[0]).replace(/\u0000/g, ' || ').replace(/\s+/g, ' ').slice(0, 90) + '"');
    }
  }
  check('R11 no statement drops, renames or retypes a 69df2f52 column, or drops a 69df2f52 table: not in a top-level statement or a DO body of any part, and not as a dynamic statement (a string literal of any statement, DO body or function body that EXECUTE / format() would run, a placeholder target included)',
    alterBad.length === 0 && dynBad.length === 0, [...alterBad, ...dynBad].join(' | '));

  const step1 = (/^## 1\. [\s\S]*?(?=^## )/m.exec(stepsMd) || [''])[0];
  check('R7 founder step 1 is the r3 step: the step file comes from the verifier\'s run of build_live_migration_step.mjs, and the founder runs that file unchanged in one session; no composing by migration.mjs, no Director wrapper, no claim that the migration refuses a project',
    /build_live_migration_step\.mjs/.test(step1) && /exactly that file/.test(step1) && /ON_ERROR_STOP=1/.test(step1)
      && !/migration\.mjs\s+compose|Director-specified wrapper|wraps that body|refuses the Brain OS production project/i.test(step1), step1.slice(0, 120));
}

// ---------------------------------------------------------------- X4 / H1: the developer migration tool; how the suites apply it
{
  const tool = join(ROOT, 'scripts', 'factory-control-plane', 'migration.mjs');
  const env = { ...process.env }; delete env.FACTORY_DISPOSABLE_ADMIN_URL;
  const SENT = 'SENTINEL' + Math.random().toString(36).slice(2, 10);
  const a1 = spawnSync(process.execPath, [tool, 'apply', '--admin', 'postgresql://u:' + SENT + '@127.0.0.1:1/x'], { encoding: 'utf8', env, timeout: 30000 });
  const o1 = (a1.stdout || '') + (a1.stderr || '');
  // both refs, each in a URL that points at a closed loopback port: a tool that tried to connect would only ever meet ECONNREFUSED
  const refRuns = ['npvhuoozkbexddnvkqsj', 'pvphxgrtdfrudejjhzjk'].map((ref) => {
    const r = spawnSync(process.execPath, [tool, 'apply'], { encoding: 'utf8', env: { ...env, FACTORY_DISPOSABLE_ADMIN_URL: 'postgresql://postgres.' + ref + ':x@127.0.0.1:1/postgres' }, timeout: 30000 });
    const o = (r.stdout || '') + (r.stderr || '');
    return { ref, status: r.status, refused: /REFUSING - the URL names/.test(o), connected: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect/i.test(o.replace(/REFUSING[^\n]*/, '')) };
  });
  check('X4 migration.mjs apply rejects a database URL given as an argument (a usage error that does not print the value), and stops at the Brain OS production ref and at the live Factory ref without opening a connection',
    a1.status === 2 && !o1.includes(SENT) && refRuns.every((r) => r.status === 1 && r.refused && !r.connected), JSON.stringify({ argv: a1.status, echoed: o1.includes(SENT), refs: refRuns }));
  // X4b (the class of C2-S1): the tool's refusal is judged on what pg's own parser reads from the URL, not only on its text. Each
  // form below reaches a refused project through that parser - a tab or a line break it drops from inside a name, an escape, a query
  // setting that names the target - without spelling the project ref in the text; the control is that parser's reading of the same URL
  {
    const { pathToFileURL } = await import('node:url');
    const { refusedRef, driverReading, REFUSED_REFS } = await import(pathToFileURL(tool).href);
    const cut = (s, x) => s.slice(0, 9) + x + s.slice(9);
    const esc = (s, i) => s.slice(0, i) + '%' + s.charCodeAt(i).toString(16) + s.slice(i + 1);
    const pooler = 'pooler.example.net';
    const forms = REFUSED_REFS.flatMap((ref) => [
      ['a tab inside the host', 'postgresql://u:p@db.' + cut(ref, '\t') + '.supabase.co:5432/postgres'],
      ['a line feed inside the host', 'postgresql://u:p@db.' + cut(ref, '\n') + '.supabase.co:5432/postgres'],
      ['a carriage return and line feed inside the user', 'postgresql://postgres.' + cut(ref, '\r\n') + ':p@' + pooler + ':6543/postgres'],
      ['a tab inside ?host=', 'postgresql://u:p@' + pooler + ':6543/postgres?host=db.' + cut(ref, '\t') + '.supabase.co'],
      ['a tab inside ?options=reference', 'postgresql://u:p@' + pooler + ':6543/postgres?options=reference%3D' + cut(ref, '\t')],
      ['a tab inside ?user=', 'postgresql://u:p@' + pooler + ':6543/postgres?user=postgres.' + cut(ref, '\t')],
      ['an escaped letter in the user', 'postgresql://postgres.' + esc(ref, 17) + ':p@' + pooler + ':6543/postgres'],
      ['an escaped letter in ?options=reference', 'postgresql://u:p@' + pooler + ':6543/postgres?options=reference%3D' + esc(ref, 3)],
    ].map(([what, url]) => ({ ref, what, refusal: refusedRef(url), spelled: url.toLowerCase().includes(ref), read: JSON.stringify(driverReading(url) || {}).toLowerCase().includes(ref) })));
    const open = forms.filter((x) => !/^REFUSING/.test(x.refusal || ''));
    const reach = forms.filter((x) => x.read && !x.spelled);
    const env = [['no user', 'postgresql://db.example.net:5432/postgres'], ['no host', 'postgresql:///postgres'], ['no database', 'postgresql://u:p@db.example.net:5432'], ['an empty URL', '']]
      .map(([what, url]) => ({ what, refusal: refusedRef(url) }));
    const plain = refusedRef('postgresql://app:pw@127.0.0.1:5432/postgres');
    const toolSrc = read(tool);
    check('X4b the developer migration tool judges its target on what pg\'s own parser reads (the class of C2-S1): ' + forms.length + ' URLs that reach the Brain OS production project or the live Factory plane without spelling the ref in their text - a tab or a line break inside the host, the user, ?host=, ?options= or ?user=, an escaped letter - are all refused (the control: that parser reads ' + reach.length + ' of them as the refused project); a URL that names no user, no host or no database, and an empty one, are refused (the driver would take the missing part from its environment); a plain disposable URL is not; and apply connects with the configuration that was judged, never with the text',
      forms.length === 16 && open.length === 0 && reach.length >= 12 && env.every((x) => /^REFUSING/.test(x.refusal || '')) && plain === null
        && /new pg\.Client\(driverReading\(adminUrl\)\)/.test(toolSrc) && !/connectionString:\s*adminUrl/.test(toolSrc),
      JSON.stringify({ notRefused: open.map((x) => x.ref.slice(0, 6) + ' ' + x.what), reach: reach.length, env: env.filter((x) => !/^REFUSING/.test(x.refusal || '')).map((x) => x.what), plain }));
  }
  const V1S = join(ROOT, 'qa', 'factory', 'v1');
  const suites = readdirSync(V1S).filter((f) => f.endsWith('.mjs'));
  const superApply = suites.filter((f) => { const t = read(join(V1S, f)); return /^import\s*\{[^}]*\bapply\b[^}]*\}\s*from\s*'[^']*migration\.mjs'/m.test(t) || /\bapply\(\s*[a-zA-Z_.]*superUrl/.test(t); });
  const arp = read(join(V1S, 'applying_role_plane.mjs'));
  const planeSrc = read(join(V1S, 'plane.mjs'));
  // Migration text sent some other way: a call whose name ends in `query` (pg's .query, the suites' tryQuery) whose arguments hold
  // migration text. Migration text is what compose() / parts() of migration.mjs or readMigration() / buildStep() of
  // applying_role_plane.mjs return, anything read through MIGRATION_DIR or a path literal naming supabase/control-plane/v1, and every
  // variable assigned from an expression holding such a value (destructuring and for-of included, and the parameter of a callback
  // given to a method of such a value); a sha256(...) digest of it is not. The one exempt call is the body of applyAsApplyingLogin.
  // Names are followed within one file: a value handed to a helper function and queried there under a parameter name is not traced.
  const sends = [];
  for (const f of suites) {
    const src = read(join(V1S, f));
    const view = jsView(src);
    let code = view.code, raw = view.raw;
    const blankSpan = (a, b) => { const cut = (t) => t.slice(0, a) + t.slice(a, b).replace(/[^\n]/g, ' ') + t.slice(b); code = cut(code); raw = cut(raw); };
    if (f === 'applying_role_plane.mjs') {
      const at = code.search(/\bexport async function applyAsApplyingLogin\s*\(/);
      const open = at < 0 ? -1 : code.indexOf('{', matchClose(code, code.indexOf('(', at)));
      if (open > 0) blankSpan(open, matchClose(code, open));
    }
    for (const [a, b] of callSpans(code, /\bsha256\s*\(/g)) blankSpan(a, b);
    const names = new Set(f === 'applying_role_plane.mjs' ? ['readMigration', 'buildStep'] : []);
    for (const m of raw.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']*)'/g)) {
      if (!/(migration|applying_role_plane)\.mjs$/.test(m[2])) continue;
      for (const part of m[1].split(',')) {
        const [a, b] = part.trim().split(/\s+as\s+/);
        if (['compose', 'parts', 'readMigration', 'buildStep', 'MIGRATION_DIR'].includes(a)) names.add((b || a).trim());
      }
    }
    // Two kinds of value are followed, each by name within the scope of its binding (the enclosing block of a declaration or an
    // assignment; the loop of a for-of; the callback of a callback parameter). A PATH names a supabase/control-plane/v1 file or
    // directory (a path literal, MIGRATION_DIR, or a binding holding one); TEXT is migration text: a source's result, a file read
    // (readFileSync / readFile) of a PATH, or a binding holding one. A reference through a property that is no text (a built step's
    // ok / sha256 / out, a file's path / sha256) and an object key are not references.
    const CALL = names.size ? new RegExp('\\b(' + [...names].filter((n) => n !== 'MIGRATION_DIR').join('|') + ')\\s*\\(') : null;
    const PATH = /control-plane\/v1\b|'control-plane'\s*,\s*'v1'|\bMIGRATION_DIR\b/;
    const KEYWORDS = new Set(['const', 'let', 'var', 'of', 'in', 'if', 'for', 'await', 'async', 'function', 'return', 'new', 'typeof']);
    const paths = [], texts = [];
    const ends = new Map();
    const blockEnd = (i) => ends.has(i) ? ends.get(i) : ends.set(i, blockEndAt(i)).get(i);
    const blockEndAt = (i) => { let d = 0; for (let k = i - 1; k >= 0; k--) { const c = code[k]; if (c === '}' || c === ')' || c === ']') d++; else if (c === '{' || c === '(' || c === '[') { if (d === 0) return c === '{' ? matchClose(code, k) : code.length; d--; } } return code.length; };
    const refers = (a, b, list) => list.some(({ n, from, to }) => {
      const x = Math.max(a, from), y = Math.min(b, to);
      return x < y && new RegExp('(^|[^.\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])(?!\\s*:)(?!\\s*\\.\\s*(ok|sha256|stepSha256|out|path|mode|length|includes|startsWith|endsWith|indexOf|search)\\b)').test(code.slice(x, y));
    });
    const pathIn = (a, b) => PATH.test(raw.slice(a, b)) || refers(a, b, paths);
    const textIn = (a, b) => (CALL && CALL.test(code.slice(a, b))) || refers(a, b, texts)
      || callSpans(code.slice(a, b), /\b(readFileSync|readFile)\s*\(/g).some(([x, y]) => pathIn(a + x, a + y));
    // a declaration whose value is a function declares no value of either kind: its body is read where it is called
    const isFunction = (a) => /^\s*(async\s+)?(function\b|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(code.slice(a, a + 300));
    const seen = new Set();
    const mark = (ids, a, b, from, to) => {
      const list = textIn(a, b) ? texts : pathIn(a, b) ? paths : null;
      if (list) for (const n of ids) { const k = (list === texts ? 'T' : 'P') + n + '@' + from; if (!KEYWORDS.has(n) && !seen.has(k)) { seen.add(k); list.push({ n, from, to }); } }
    };
    const idsOf = (t) => t.match(/[A-Za-z_$][\w$]*/g) || [];
    for (let round = 0; round < 20; round++) {
      const size = seen.size;
      for (const m of code.matchAll(/\b(?:const|let|var)\s+([^=;]+?)\s*=(?![=>])/g)) {
        const from = m.index + m[0].length;
        if (!isFunction(from)) mark(idsOf(m[1]), from, stmtEnd(code, from), m.index, blockEnd(m.index));
      }
      for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*(?:\+=|=(?![=>]))/g)) {
        const from = m.index + m[0].length;
        if (!KEYWORDS.has(m[2]) && !isFunction(from)) mark([m[2]], from, stmtEnd(code, from), m.index, blockEnd(m.index));
      }
      for (const m of code.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([^;]+?)\s+of\s+/g)) {
        const from = m.index + m[0].length, head = matchClose(code, code.indexOf('(', m.index));
        const bodyAt = head + (code.slice(head).match(/^\s*/)[0].length);
        mark(idsOf(m[1]), from, head - 1, m.index, code[bodyAt] === '{' ? matchClose(code, bodyAt) : stmtEnd(code, bodyAt));
      }
      // the parameters of a callback given to a method of such a value (`r.map((x) => ...)`, the receiver ending at `.map`)
      for (const m of code.matchAll(/\.\s*(?:map|forEach|flatMap|filter|reduce|some|every|find)\s*\(\s*(?:async\s*)?(?:function\s*)?\(?([^()=]*?)\)?\s*(?:=>|\{)/g)) {
        let s = m.index, d = 0;
        while (s > 0) { const c = code[s - 1]; if (c === ')' || c === ']' || c === '}') d++; else if (c === '(' || c === '[' || c === '{') { if (d === 0) break; d--; } else if (d === 0 && !/[\w$.\s]/.test(c)) break; s--; }
        mark(idsOf(m[1]), s, m.index, m.index, matchClose(code, code.indexOf('(', m.index)));
      }
      if (seen.size === size) break;
    }
    for (const [a, b] of callSpans(code, /(?:\.\s*query|\b[A-Za-z_$][\w$]*Query|\bquery)\s*\(/g)) {
      if (textIn(code.indexOf('(', a) + 1, b - 1)) sends.push(f + ':' + src.slice(0, a).split('\n').length + ' ' + raw.slice(a, Math.min(b, a + 90)).replace(/\s+/g, ' '));
    }
  }
  check('H1 the v1 suites send migration text to a database only through applyAsApplyingLogin, which refuses a superuser login and which plane.mjs uses: no suite imports migration.mjs\'s apply or hands it a superuser URL, and no other query call takes migration text (compose(), readMigration(), buildStep(), a supabase/control-plane/v1 file, or a variable holding one)',
    superApply.length === 0 && sends.length === 0 && /if \(!me \|\| me\.rolsuper\) throw new Error\('REFUSING to apply the migration as a superuser login/.test(arp) && /applyAsApplyingLogin\(plane\)/.test(planeSrc),
    JSON.stringify({ importsApply: superApply, sends }));
}

// ---------------------------------------------------------------- A: admin authority (S-8, S-9, S-12, S-7; B-4, L2-F3, L2-F5)
{
  const V1 = join(ROOT, 'supabase', 'control-plane', 'v1');
  const fronts = [];
  for (const f of ['200_admin_common.sql', '210_admin_computers.sql', '220_admin_releases_policies_work.sql']) {
    for (const s of lexSql(read(join(V1, f)))) {
      const name = (/^\s*create\s+(?:or\s+replace\s+)?function\s+factory\.([a-z_0-9]+)/i.exec(s.code) || [])[1];
      if (s.fn !== null && name && /^admin_/.test(name)) {
        fronts.push({ f, name, code: bodyCode(s.fn).replace(/\s+/g, ' '), raw: s.fn.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ') });
      }
    }
  }
  const opFns = ops.map((o) => o.fn).sort();
  // A1: before its factory._admin( call a front door reads no factory table (a table read is `from|join factory.<name>`; the pure
  // input parser factory._envelope_input is a function, `factory._...`)
  const early = fronts.filter((b) => { const i = b.code.indexOf('factory._admin('); return i < 0 || /\b(from|join)\s+factory\.[a-z]/i.test(b.code.slice(0, i)); });
  check('A1 every Admin API front door (' + fronts.length + ', exactly the ADMIN_OPS functions) authorizes the caller (factory._admin) before it reads any factory table',
    fronts.length === opFns.length && JSON.stringify(fronts.map((b) => b.name).sort()) === JSON.stringify(opFns) && early.length === 0,
    JSON.stringify({ fronts: fronts.length, ops: opFns.length, early: early.map((b) => b.name) }));
  // A2: the amendment's founder-only decision (B-4): _admin with a constant false flag; then the tenant-filtered row LOCK; then the
  // envelope in force read under it; then the decision on that envelope, failing closed
  const am = fronts.find((b) => b.name === 'admin_amend_envelope');
  const c = am ? am.code : '', raw = am ? am.raw : '';
  const iA = c.indexOf('factory._admin('), iL = c.indexOf('factory._admin_computer('), iE = c.indexOf('from factory.authorization_envelopes'), iF = c.indexOf('factory._founder_only(');
  const shape = {
    order: iA >= 0 && iA < iL && iL < iE && iE < iF,
    envelopeReadsBeforeDecision: (c.slice(0, iF).match(/from factory\.authorization_envelopes/g) || []).length === 1,
    adminFlagFalse: /factory\._admin\(p_actor, p_live_role, p_body, 'amend_envelope', false\)/.test(raw),
    lockedTenantRow: /factory\._admin_computer\(a\.ctx, factory\._uuid\(p_body, 'computer_id'\), true\)/.test(raw),
    readUnderLock: /select x\.\* into cur from factory\.authorization_envelopes x where x\.computer_id = m\.computer_id and x\.version = m\.current_envelope_version/.test(raw),
    decisionFailsClosed: /if 'release_broker' = any \(e\.roles\) and \('release_broker' = any \(cur\.authorized_roles\)\) is not true then refused := factory\._founder_only\(a\.ctx, 'amend_envelope', m\.computer_id\)/.test(raw),
  };
  check('A2 admin_amend_envelope decides founder-only AFTER the lock: factory._admin with a constant false flag, then factory._admin_computer(..., true) (the tenant-filtered row lock), then the envelope in force read under it, then factory._founder_only on that envelope (fails closed)',
    Object.values(shape).every(Boolean), JSON.stringify(shape));
  // A3: the Computers page renders the pairing-code panel from a receipt that is not "already", and from no other place
  const sharedTsx = read(join(ROOT, 'web', 'app', '(app)', 'software-factory', 'computers', 'shared.tsx'));
  const panelUses = sharedTsx.match(/<PairingCodePanel\b/g) || [];
  check('A3 the Computers page has exactly one PairingCodePanel use, and it is guarded by !result.already (an "already" receipt never renders a code)',
    /\{!result\.already && typeof result\.pairing_code === "string" && <PairingCodePanel code=\{result\.pairing_code\}/.test(sharedTsx) && panelUses.length === 1, panelUses.length + ' uses');
  // A4: the Admin API hands back its drawn code only if the SQL answer names that code's id, expiry and locator (so the plane holds
  // it); the op, route and body-field tables are read by own property only (never through Object.prototype)
  const edge = {
    storedGuard: /const stored = code !== null && r\.already !== true && typeof r\.code_id === 'string' && \/\^\[0-9a-f-\]\{36\}\$\/\.test\(r\.code_id\) && typeof r\.expires_at === 'string' && r\.locator === code\.locator;/.test(adminApi),
    oneCodeReturn: (adminApi.match(/pairing_code:/g) || []).length === 1 && /return json\(200, code && stored \? \{ \.\.\.r, pairing_code: code\.display \} : r\);/.test(adminApi),
    opOwn: /Object\.hasOwn\(ADMIN_OPS, m\[1\]\) \? ADMIN_OPS\[m\[1\]\] : undefined/.test(adminApi) && (adminApi.match(/ADMIN_OPS\[/g) || []).length === 1,
    routeOwn: /if \(!Object\.hasOwn\(FRONT_DOORS, route\)\) return refuse\(404/.test(nodeApi) && !/\bin FRONT_DOORS\b/.test(nodeApi),
    bodyOwn: /Object\.hasOwn\(BODIES, route\) \? BODIES\[route\] : \{\}/.test(nodeApi) && (nodeApi.match(/BODIES\[/g) || []).length === 1
      && /const t = Object\.hasOwn\(schema, k\) \? schema\[k\] : undefined;/.test(nodeApi) && (nodeApi.match(/schema\[k\]/g) || []).length === 1,
  };
  check('A4 the Admin API adds the drawn pairing code to a receipt only if the answer is not "already" and carries that code\'s code_id, expiry and locator; ADMIN_OPS, FRONT_DOORS and the body schemas are looked up by own property only',
    Object.values(edge).every(Boolean), JSON.stringify(edge));
  // A5: the per-tenant serialization lock is FOR NO KEY UPDATE and nothing stronger. FOR UPDATE would conflict with the FOR KEY SHARE
  // lock that every foreign-key insert naming the tenant takes (audit rows, runs, checkpoints, releases, computers), so an open
  // publish or S-16(a) binding would stall all of the tenant's node and admin writes. The publish and the key revoke both take it.
  const common = read(join(V1, '200_admin_common.sql'));
  const ltBody = ((/create function factory\._lock_tenant\(p_tenant uuid\) returns void[\s\S]*?end \$\$;/.exec(common) || [''])[0]).replace(/--[^\n]*/g, '');
  const rel = read(join(V1, '220_admin_releases_policies_work.sql'));
  const relFn = (name) => ((new RegExp('create function factory\\.' + name + '\\([\\s\\S]*?end \\$\\$;').exec(rel) || [''])[0]).replace(/--[^\n]*/g, '');
  const lockShape = {
    noKeyUpdate: /perform 1 from factory\.tenants t where t\.tenant_id = p_tenant for no key update;/.test(ltBody),
    oneRowLock: (ltBody.match(/\bfor\s+(?:no\s+key\s+update|update|share|key\s+share)\b/gi) || []).length === 1,
    publishTakesIt: /perform factory\._lock_tenant\(\(a\.ctx\)\.tenant_id\);/.test(relFn('admin_publish_release')),
    revokeKeyTakesItFirst: (() => { const b = relFn('admin_revoke_key'); const i = b.indexOf('factory._lock_tenant('); return i > 0 && i < b.indexOf('from factory.releases') && i < b.indexOf('from factory.release_revocations'); })(),
  };
  check('A5 factory._lock_tenant takes FOR NO KEY UPDATE on the tenant row (never FOR UPDATE, so foreign-key inserts of the tenant never wait on it); admin_publish_release takes it, and admin_revoke_key takes it before it reads releases or revocations',
    Object.values(lockShape).every(Boolean), JSON.stringify(lockShape));
}

// ---------------------------------------------------------------- C: the installer's inputs (S-12, S-5; B-3, B-5, L6-3, L6-8)
{
  const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '';
  const TEXT = /\.(mjs|cjs|js|ts|tsx|md|ps1|sh|txt|json|yaml|yml|toml)$/i;
  const tracked = git('ls-files', 'scripts', 'qa/factory', 'qa/implementation/auto-enrollment-v1', 'qa/scenarios-runner', 'docs', 'web/app/(app)/software-factory')
    .split('\n').filter(Boolean).filter((f) => TEXT.test(f) && !/(^|\/)evidence\//.test(f) && existsSync(join(ROOT, f)));
  // C1: '--code' only where the product refuses it and where a test proves that refusal with a canary (or plants the defect)
  const CANARY_FILES = ['qa/factory/v1/installer_input_acceptance.mjs', 'qa/factory/v1/release_acceptance.mjs', 'qa/factory/sea_package_regression.mjs',
    'qa/factory/v1/canary.mjs', 'qa/scenarios-runner/factory_v1_static_contract.mjs', 'qa/factory/v1/v1_mutation_proof.mjs', 'qa/factory/sea_package_mutation_proof.mjs'];
  // a mutation proof's planted defect is a definition that the proof never runs itself; that exemption belongs to the two proofs alone
  const MUTATION_FILES = ['qa/factory/v1/v1_mutation_proof.mjs', 'qa/factory/sea_package_mutation_proof.mjs'];
  const planted = (f, l) => MUTATION_FILES.includes(f) && /\(planted\)/.test(l);
  const hits = [];
  for (const f of tracked) {
    const lines = read(join(ROOT, f)).split('\n');
    lines.forEach((l, i) => {
      if (/--code\b/.test(l) && f !== 'qa/scenarios-runner/factory_v1_static_contract.mjs') { // (this scanner's own patterns aside)
        const ok = (f === 'scripts/factory-runner/sea/argv-guard.mjs') || planted(f, l)
          || (CANARY_FILES.includes(f) && (/^\s*\/\//.test(l) || /\bcanary\b|\bCAN\.|\bC\.(display|lower|nodash|spelled|code)\b|assertNoCodeInArgv|\/\^--code|--code\\b|--code is not an option|refus/i.test(l)));
        if (!ok) hits.push(f + ':' + (i + 1));
      }
      // an argument array (a `[...]` on a spawning line) holding a pairing_code; a code given as standard input ({ stdin: ... }) is not argv
      if (!planted(f, l) && /\b(run|spawn\w*|execFile\w*)\(.*\[[^\]]*\bpairing_code\b[^\]]*\]/.test(l)) hits.push(f + ':' + (i + 1) + ' (a spawn with a pairing code in its arguments)');
    });
  }
  const mainSrc = read(join(ROOT, 'scripts', 'factory-runner', 'sea', 'main.mjs'));
  const setupSrc = read(join(ROOT, 'scripts', 'factory-runner', 'enrolled', 'setup.mjs'));
  const harnessGuard = ['release_acceptance.mjs', 'runtime_acceptance.mjs'].every((f) => /const run = \([^)]*\) => new Promise\(\(resolve\) => \{\n\s*assertNoCodeInArgv\(args/.test(read(join(ROOT, 'qa', 'factory', 'v1', f))))
    && /const run = \(cmd, args, \{ canary = false, \.\.\.opts \} = \{\}\) => \{\n\s*assertNoCodeInArgv\(args, \{ canary \}\);/.test(read(join(ROOT, 'qa', 'factory', 'sea_package_regression.mjs')));
  check('C1 committed code puts no pairing code in an argument list: "--code" occurs only in the argv guard, in canary rows and in a mutation proof\'s planted text (' + tracked.length + ' tracked files); no spawn line passes a pairing_code; main.mjs maps no --code option and setup reads none; the release, runtime and SEA-package harnesses check every argument list before they spawn',
    hits.length === 0 && !/'--code'\s*:/.test(mainSrc) && !/\bo\.code\b/.test(setupSrc) && /refuseArgv\(argv\)/.test(mainSrc) && harnessGuard, JSON.stringify({ hits, harnessGuard }));
  // C2: a refusal never shows an argument; the usage lists no code and no confirmation option
  const usage = mainSrc.split('\n').slice(0, 16).join('\n');
  const writes = mainSrc.split('\n').filter((l) => /(stderr|stdout)\.write\(|new UsageRefusal\(/.test(l));
  const echo = writes.filter((l) => /\bprintable\(|argv\[|String\(cmd\)|\+\s*cmd\b|\bcmd\s*\+/.test(l));
  const manifestEcho = setupSrc.split('\n').filter((l) => /say\(/.test(l) && /\+\s*o\.manifest\b|\bo\.manifest\s*\+/.test(l));
  check('C2 a refusal of the command line never shows an argument: main.mjs has no printable(), and no write or UsageRefusal carries the command or an argv element; setup never prints the path named by --manifest; the usage lists neither --code nor --yes',
    echo.length === 0 && !/printable\(/.test(mainSrc) && manifestEcho.length === 0 && !/--code|--yes/.test(usage) && writes.length >= 5, JSON.stringify({ echo, manifestEcho }));
  // C3: the founder's prepared steps never display or inline a generated secret, and shred the file they create
  const steps = read(join(ROOT, 'qa', 'implementation', 'auto-enrollment-v1', 'FOUNDER_PREPARED_STEPS.md'));
  const stepBad = [];
  steps.split('\n').forEach((l, i) => {
    if (/randomBytes\s*\(|console\.log|Write-(Host|Output)|\becho\b|\bprint\(/.test(l)) stepBad.push((i + 1) + ': prints or generates a value in the open');
    if (/password\s+'(?!SCRAM-SHA-256\$)/i.test(l)) stepBad.push((i + 1) + ': a cleartext password literal');
  });
  const s4 = (/^## 4\. [\s\S]*?(?=^## )/m.exec(steps) || [''])[0];
  const made = [...s4.matchAll(/founder_secrets\.mjs pepper --dir (<[^>]+>)/g)].map((m) => m[1]);
  const shredded = [...s4.matchAll(/founder_secrets\.mjs shred --dir (<[^>]+>)/g)].map((m) => m[1]);
  const envFiles = [...s4.matchAll(/--env-file\s+(<[^>]+>\S*|\S+)/g)].map((m) => m[1]);
  // the tool step 4 runs is part of the founder step (VERIFICATION_SPEC §3.4 scans founder steps for environment reads): its code
  // (comments removed) reads no environment value, runs Windows tools only from the fixed System32 path, never resolves a temp or
  // home folder, and uses secure-store only for its pure DACL parsers (whose other functions read SystemRoot)
  const toolCode = read(join(ROOT, 'qa', 'implementation', 'auto-enrollment-v1', 'tools', 'founder_secrets.mjs')).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const toolFacts = {
    noEnv: !/process\.env|Deno\.env|getenv|\benv\s*=|\{\s*env\b|[(,]\s*env\s*[,)}]/i.test(toolCode),
    noTempOrHome: !/tmpdir|homedir|LOCALAPPDATA|USERPROFILE|APPDATA/i.test(toolCode),
    fixedSystem32: /export const SYSTEM32 = 'C:\\\\Windows\\\\System32';/.test(toolCode) && (toolCode.match(/spawnSync\(/g) || []).length === 1 && /spawnSync\(exe, args,/.test(toolCode)
      && [...toolCode.matchAll(/\btool\((\w+),/g)].every((m) => ['ICACLS', 'WHOAMI', 'exe'].includes(m[1])),
    noGitProgram: !/['"]git['"]/.test(toolCode),
    pureStoreOnly: [...toolCode.matchAll(/\bss\.(\w+)/g)].every((m) => ['parseDacl', 'isLockedDirDacl', 'isOwnerOnlyDacl'].includes(m[1])),
  };
  check('C3 the founder\'s prepared steps never generate a secret in the open, print one, or inline a cleartext password; step 4 generates the pepper into a file with founder_secrets.mjs, the secret store reads only that file, and the same directory is shredded after; that tool reads no environment value, runs icacls and whoami only from C:\\Windows\\System32, and no git program',
    stepBad.length === 0 && made.length === 1 && shredded.length === 1 && made[0] === shredded[0] && s4.indexOf('pepper --dir') < s4.indexOf('--env-file') && s4.indexOf('--env-file') < s4.indexOf('shred --dir')
      && envFiles.length === 1 && envFiles[0].startsWith(made[0]) && Object.values(toolFacts).every(Boolean), JSON.stringify({ stepBad, made, shredded, envFiles, toolFacts }));
  // C4: the argv guard recognizes exactly the pairing code form of _shared/pairing.ts (constants and behaviour)
  const pairingTs = read(join(FN, '_shared', 'pairing.ts'));
  const guardSrc = read(join(ROOT, 'scripts', 'factory-runner', 'sea', 'argv-guard.mjs'));
  const constOf = (src, n) => ((new RegExp('export const ' + n + ' = ([^;]+);').exec(src)) || [])[1];
  const sameConsts = ['ALPHABET', 'LOCATOR_CHARS', 'SECRET_CHARS'].every((n) => constOf(pairingTs, n) && constOf(pairingTs, n) === constOf(guardSrc, n))
    && /sum = \(sum \+ \(i \+ 1\) \* ALPHABET\.indexOf\(\w+\[i\]\)\) % 32/.test(pairingTs) && /sum = \(sum \+ \(i \+ 1\) \* ALPHABET\.indexOf\(\w+\[i\]\)\) % 32/.test(guardSrc);
  let behaviour = 'not run';
  try {
    const { pathToFileURL } = await import('node:url');
    const { randomBytes } = await import('node:crypto');
    const p = await import(pathToFileURL(join(FN, '_shared', 'pairing.ts')).href);
    const g = await import(pathToFileURL(join(ROOT, 'scripts', 'factory-runner', 'sea', 'argv-guard.mjs')).href);
    // the O / I / L readings: 0 written as O or o, 1 as I, i, L or l, in turn; no dashes, so only that reading can make a code
    const spell = (s) => { let k = 0; return s.replace(/[01]/g, (d) => (d === '0' ? 'Oo' : 'IiLl')[k++ % (d === '0' ? 2 : 4)]); };
    let bad = 0;
    let spelledChecked = 0;
    for (let i = 0; i < 500; i++) {
      const c = p.generateCode((n) => new Uint8Array(randomBytes(n)));
      if (!g.looksLikePairingCode(c.display) || !g.looksLikePairingCode(c.code.toLowerCase()) || g.refuseArgv(['setup', c.display]) === null) bad++;
      const s = [...randomBytes(18)].map((b) => p.ALPHABET[b & 31]).join('');
      if (g.looksLikePairingCode(s) !== (p.normalizeCode(s) !== null)) bad++;
      // an issued code spelled with O / I / L and grouped by spaces: pairing.ts accepts it, so the guard must refuse it; in its
      // displayed grouping it is refused inside a longer argument too
      const sp = spell(c.code);
      if (sp !== c.code) {
        spelledChecked++;
        const spaced = sp.match(/.{1,6}/g).join(' ');
        if (p.normalizeCode(sp) === null || !g.looksLikePairingCode(sp) || !g.looksLikePairingCode(spaced) || g.refuseArgv(['setup', sp]) === null
          || g.refuseArgv(['setup', '--home', 'C:\\x\\' + sp.match(/.{1,4}/g).join('-') + '\\y']) === null) bad++;
      }
      // an ungrouped 18-character run inside a path is not a code to the guard (a profile folder of that shape must not stop the
      // supervisor's own `worker --home <path>`), even when its check character is right
      if (g.refuseArgv(['worker', '--home', 'C:\\Users\\' + c.code + '\\AppData\\Local\\BrainFactory']) !== null) bad++;
      // a random body with the right check character, spelled, and the same with a wrong one: the guard answers as pairing.ts does
      const body = s.slice(0, 17); const valid = body + g.pairingCheckChar(body);
      const wrong = body + p.ALPHABET[(p.ALPHABET.indexOf(g.pairingCheckChar(body)) + 1) % 32];
      for (const x of [spell(valid), spell(wrong)]) if (g.looksLikePairingCode(x) !== (p.normalizeCode(x) !== null)) bad++;
    }
    behaviour = spelledChecked > 100 ? bad : 'only ' + spelledChecked + ' spelled codes checked';
  } catch (e) { behaviour = 'error: ' + e.message; }
  check('C4 the argv guard (sea/argv-guard.mjs) reads a pairing code exactly as _shared/pairing.ts does: the same alphabet, locator and secret lengths and check-character weights; the same answer on 500 issued codes, 500 random strings, and the O / I / L spellings of both (no dashes, and in space-separated groups); a spelled code in its displayed grouping inside a path is refused, an ungrouped one inside a path is not',
    sameConsts && behaviour === 0, JSON.stringify({ sameConsts, behaviour }));
  // C5 (L6-8): a web test runs against a loopback harness, never the live plane
  const V1Q = join(ROOT, 'qa', 'factory', 'v1');
  const webTests = readdirSync(V1Q).filter((f) => f.endsWith('.mjs') && /['"]next['"]|node_modules', 'next'/.test(read(join(V1Q, f))));
  const webBad = webTests.filter((f) => { const t = read(join(V1Q, f)); return !/FACTORY_ADMIN_API_URL: admin\.baseUrl/.test(t) || !/FACTORY_RELEASES_URL: releasesUrl/.test(t) || /npvhuoozkbexddnvkqsj/.test(t); });
  check('C5 every web test (' + webTests.join(', ') + ') points FACTORY_ADMIN_API_URL and FACTORY_RELEASES_URL at its own loopback harness and never names the live Factory project',
    webTests.length >= 1 && webBad.length === 0, JSON.stringify({ webTests, webBad }));
  // C6: a release is verified against the revocations named at the call - never an omitted list read as "nothing revoked"
  const rel = read(join(ROOT, 'scripts', 'factory-runner', 'enrolled', 'release.mjs'));
  const verifyCalls = [];
  for (const f of tracked.filter((x) => x.startsWith('scripts/') && x.endsWith('.mjs'))) {
    for (const m of read(join(ROOT, f)).matchAll(/verifyRelease\(\{([^}]*)\}\)/g)) verifyCalls.push({ f, named: /\brevocations\b/.test(m[1]) });
  }
  // C7 (L4-F4, the page half): the pairing-code panel lists the steps each channel's artifact needs - the dev build carries no endpoint,
  // so its step names `setup --api <address>` and the code at the prompt; the production step stays "run it and enter the code". The
  // command starts with .\ so that it runs as shown in PowerShell (which does not run a program from the current folder by its bare
  // name) as well as in cmd.exe
  const panel = read(join(ROOT, 'web', 'app', '(app)', 'software-factory', 'computers', 'shared.tsx'));
  const step2 = (/<li>\s*\{downloads && downloads\.channel !== "production" \? \([\s\S]*?\)\}\s*<\/li>/.exec(panel) || [''])[0];
  const pageShape = {
    devBranch: /font-mono text-xs">\.\\BrainFactorySetup\.exe setup --api \{downloads\.nodeApi \?\?/.test(step2) && /never on the command line/.test(step2),
    prodBranch: /t\("fc\.code\.step2", "Run BrainFactorySetup\.exe and enter the code\./.test(step2),
    manifestBeside: /t\("fc\.code\.manifestBeside"/.test(panel),
    noCodeInCommand: !/--code/.test(panel),
  };
  check('C7 the Computers page lists the steps each channel\'s artifact needs: on the dev channel `.\\BrainFactorySetup.exe setup --api <address>` (runnable as shown in PowerShell and cmd.exe) and the code at the prompt (never on the command line), the manifest beside it; on the production channel "run it and enter the code"',
    Object.values(pageShape).every(Boolean), JSON.stringify(pageShape));
  check('C6 verifyRelease has no default revocations (an omitted list throws) and every call in scripts/ (' + verifyCalls.length + ') names the revocations it checks against',
    /export function verifyRelease\(\{ manifest, artifact = null, trust = EMBEDDED_TRUST, revocations \}\)/.test(rel) && /if \(!revocations \|\| typeof revocations !== 'object'\) throw new TypeError/.test(rel)
      && verifyCalls.length >= 5 && verifyCalls.every((c) => c.named), JSON.stringify(verifyCalls.filter((c) => !c.named)));
}

// ---------------------------------------------------------------- S15 / RT: suite isolation and the enrolled runtime's structure
{
  // S15 (S-15; WO-10): every node spawn of the four evidence tools runs under isolatedSuiteEnv() - FACTORY_RUNNER_ENV_FILE naming an
  // ABSENT absolute path, never the default ~/.brain-factory/runner.env - and each tool proves the resolution
  // first and records it; no tool or v1 suite empties or deletes the variable, except the Director-instrument harness
  // (manifest_rehearsal.mjs, whose instrument refuses any value), the unit whose sensitivity witness plants the empty value
  // (isolation_env_unit.mjs), and a mutation proof's planted text
  const ISO_TOOLS = ['qa/implementation/auto-enrollment-v1/tools/run_reference_suites.mjs', 'qa/implementation/auto-enrollment-v1/tools/run_acceptance_mutation_chunks.mjs',
    'qa/implementation/auto-enrollment-v1/tools/final_pass.mjs', 'qa/factory/v1/v1_mutation_proof.mjs'];
  const isoBad = [];
  for (const f of ISO_TOOLS) {
    const lines = read(join(ROOT, f)).split('\n');
    const t = lines.join('\n');
    if (!/const ISO = isolatedSuiteEnv\(\);/.test(t) || !/isolationProof\(ISO/.test(t) || !/isolationHeader\(ISO/.test(t)) isoBad.push(f + ': no isolatedSuiteEnv / isolationProof / isolationHeader');
    lines.forEach((l, i) => {
      if (/\bspawn(Sync)?\((process\.execPath|s\.cmd)\b/.test(l) && !/env: (ISO\.env\b|\{ \.\.\.ISO\.env\b)/.test(l + '\n' + (lines[i + 1] || ''))) isoBad.push(f + ':' + (i + 1) + ' spawns without the isolated environment');
    });
  }
  const isoFiles = [...readdirSync(join(ROOT, 'qa', 'factory', 'v1')).filter((f) => f.endsWith('.mjs')).map((f) => 'qa/factory/v1/' + f),
    ...readdirSync(join(ROOT, 'qa', 'implementation', 'auto-enrollment-v1', 'tools')).filter((f) => f.endsWith('.mjs')).map((f) => 'qa/implementation/auto-enrollment-v1/tools/' + f)];
  const ISO_ALLOWED = { 'qa/factory/v1/manifest_rehearsal.mjs': /delete env\[k\]/, 'qa/factory/v1/isolation_env_unit.mjs': /witness/ };
  for (const f of isoFiles) {
    read(join(ROOT, f)).split('\n').forEach((l, i) => {
      if (!/FACTORY_RUNNER_ENV_FILE/.test(l) || /^\s*\/\//.test(l)) return;
      const emptied = /FACTORY_RUNNER_ENV_FILE['"]?\s*[:=]\s*(''|""|``)/.test(l) || /delete\s+[\w.]*\[?['"]?FACTORY_RUNNER_ENV_FILE/.test(l) || /'FACTORY_RUNNER_ENV_FILE'\]\.includes\(k\)\) delete/.test(l);
      if (!emptied) return;
      if (f === 'qa/factory/v1/v1_mutation_proof.mjs' && /\(planted\)/.test(l)) return;
      if (ISO_ALLOWED[f] && ISO_ALLOWED[f].test(l)) return;
      isoBad.push(f + ':' + (i + 1) + ' empties or deletes FACTORY_RUNNER_ENV_FILE');
    });
  }
  const isoSrc = read(join(ROOT, 'qa', 'factory', 'v1', 'isolation.mjs'));
  check('S15 every node spawn of run_reference_suites, run_acceptance_mutation_chunks, final_pass and v1_mutation_proof runs under isolatedSuiteEnv() (FACTORY_RUNNER_ENV_FILE an absent absolute path, proved and recorded first); no tool or v1 suite empties or deletes the variable (the Director-instrument harness, the unit\'s witness and planted text aside)',
    isoBad.length === 0 && /FACTORY_RUNNER_ENV_FILE: envFile/.test(isoSrc) && /!existsSync\(iso\.envFile\)/.test(isoSrc), JSON.stringify(isoBad));

  // RT (WO-4, P-2, S-5, AC-6(e); L4-F3, L5-F1, L5-F2, L5-F6, L4-F8): the runtime's identity is a pipe, never a pid; the worker caches no
  // role and names the reserved type in its one claim; the lease guard reads no wall clock; revocations are written only by union
  const E = (f) => read(join(ROOT, 'scripts', 'factory-runner', 'enrolled', f));
  const enrolledFiles = readdirSync(join(ROOT, 'scripts', 'factory-runner', 'enrolled')).filter((f) => f.endsWith('.mjs'));
  const pidProbe = enrolledFiles.filter((f) => /process\.kill\([^)]*,\s*0\)/.test(E(f)) || /readJson\(p\.lock\)[^;\n]*\.pid/.test(E(f)));
  // no process is ended by a pid: a pid in a pipe's "whois" answer is only what the holder says about itself
  const pidKill = enrolledFiles.filter((f) => /process\.kill\(/.test(E(f)));
  const sup = E('supervisor.mjs'), wk = E('worker.mjs');
  check('RT1 no enrolled-runtime decision rests on a process id: no signal-0 probe, no lock-record pid read, and no process ended by a pid (process.kill appears in no enrolled-runtime file); the supervisor holds its pipe (acquireSupervisor) and asks a stray worker to stop (retireStrayWorker) before it spawns one; the worker holds the worker pipe before any call',
    pidProbe.length === 0 && pidKill.length === 0 && /await acquireSupervisor\(home,/.test(sup) && sup.indexOf('retireStrayWorker(home, log)') > 0 && sup.indexOf('retireStrayWorker(home, log)') < sup.indexOf('spawn(cmd.exe')
      && /await holdPipe\(home, 'worker',/.test(wk) && wk.indexOf("holdPipe(home, 'worker'") < wk.indexOf('api.session()'), JSON.stringify({ pidProbe, pidKill }));
  const workBody = (/export async function workClaimed[\s\S]*$/.exec(wk) || [''])[0];
  check('RT2 the worker caches no envelope role and makes one claim naming CLAIM_TYPES (the reserved \'verification\' included); it never calls the verification-claim door; the lease guard of a claimed run reads no wall clock (Date.now)',
    !/envelope\.roles|roles\.includes\(/.test(wk) && /export const CLAIM_TYPES = Object\.freeze\(\[\.\.\.AUTHORING_TYPES, 'verification'\]\)/.test(wk)
      && /api\.op\('claim', \{ work_types: \[\.\.\.CLAIM_TYPES\]/.test(wk) && !/'verification-claim'/.test(wk) && workBody.length > 0 && !/Date\.now\(\)/.test(workBody));
  // (revocations.mjs itself writes the union it computed, never a delivered list)
  const revWriters = enrolledFiles.filter((f) => f !== 'revocations.mjs' && /writeJson\(p\.revocations\b/.test(E(f)));
  const unionWrites = E('revocations.mjs').match(/writeJson\(p\.revocations\b[^;]*;/g) || [];
  const unionOnly = unionWrites.length === 1 && /want\.key_ids/.test(unionWrites[0]) && /want\.releases/.test(unionWrites[0]);
  check('RT3 the local revocation list is written only through mergeRevocations (a union; revocations.mjs) - no writer overwrites state\\revocations.json',
    revWriters.length === 0 && unionOnly && /mergeRevocations\(home, reg\.revocations\)/.test(wk) && /mergeRevocations\(home, hb\.revocations\)/.test(wk) && /mergeRevocations\(p\.home, hb\.revocations\)/.test(E('upgrade.mjs')),
    JSON.stringify({ revWriters }));
}

// ---------------------------------------------------------------- H2: every commit the candidate's own files cite is in its history
// A citation of a commit that is not an ancestor of HEAD (a local branch, a discarded revision) cannot be followed by anyone who
// receives only this branch. Read: every file added or changed since PUBLISHED, the last commit of this branch already on the remote
// (the working tree, untracked candidate files included; the Director's own documents excluded - they are byte-identical to the
// designated Director commit and not the candidate's). Files that PUBLISHED already carries unchanged are published history and stay
// as they are.
// A citation is a 7-40 character hex token, standing alone, that this repository resolves to a commit object; a token that names no
// object here (or an ambiguous one) cannot be judged by this row.
{
  // (baf4e4b5 is the Candidate #2 notice commit, this branch's head on the remote when Candidate #3 was built)
  const PUBLISHED = process.env.FACTORY_PUBLISHED_BASE || 'baf4e4b53e9b3deb03fc0d4e540bdd23ae0d034c';
  const DIRECTOR_OWNED = /^(CLAUDE\.md$|governance\/|qa\/work-orders\/|qa\/verification\/auto-enrollment-v1\/|docs\/architecture\/(features|adr)\/|docs\/architecture\/FEATURE_COMPLETENESS_CONTRACT\.md$)/;
  const paths = [...new Set([...(gitOut('diff', '--name-only', '--diff-filter=AM', PUBLISHED) || '').trim().split('\n'),
    ...(gitOut('ls-files', '--others', '--exclude-standard', '--', 'qa', 'supabase', 'scripts', 'web', 'docs') || '').trim().split('\n')])]
    .filter((q) => q && !DIRECTOR_OWNED.test(q) && /\.(md|mjs|cjs|js|ts|tsx|sql|json|txt|yml|yaml|ps1|toml)$/.test(q) && existsSync(join(ROOT, q)));
  const cited = new Map();
  for (const q of paths) {
    const t = read(join(ROOT, q)); if (t.length > 4000000) continue;
    for (const m of t.matchAll(/(?<![0-9A-Za-z_-])([0-9a-f]{7,40})(?![0-9A-Za-z_-])/g)) { if (!/[a-f]/.test(m[1]) || !/[0-9]/.test(m[1])) continue; cited.set(m[1], (cited.get(m[1]) || new Set()).add(q)); }
  }
  const toks = [...cited.keys()];
  const bc = spawnSync('git', ['-C', ROOT, 'cat-file', '--batch-check=%(objectname) %(objecttype)'], { input: toks.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 28 });
  const kinds = (bc.stdout || '').trim().split('\n');
  // a citation resolves when it is in HEAD's history, or in the Director's published history up to the designated CR-disposition record
  // (the Director branch, which every verifier of this candidate reads)
  // ONE more commit resolves: the commit at which CR-001..CR-004 were filed, on the first contract branch
  // (factory/auto-enrollment-v1-contract, still on the remote). A candidate notice names every change request it relies on by path,
  // commit and sha256 (VERIFICATION_SPEC §2), and a historical change request stays at the path and commit where it was filed and
  // decided (CLAUDE.md §8); those four files are in no later tree. Reading them needs that branch as well
  const HISTORICAL_CR_COMMIT = '33f14d6e55a41ee1a2a5acf463a000e3fe2975b9';
  const history = new Set([...(gitOut('rev-list', 'HEAD') || '').trim().split('\n'), ...(gitOut('rev-list', CR_DISPOSITION_COMMIT) || '').trim().split('\n'), HISTORICAL_CR_COMMIT].filter(Boolean));
  let commits = 0; const dangling = [];
  toks.forEach((k, i) => { const [sha, type] = (kinds[i] || '').split(' '); if (type !== 'commit') return; commits++; if (!history.has(sha)) dangling.push(k + ' in ' + [...cited.get(k)].sort().join(', ')); });
  check('H2 every commit the candidate\'s own files cite is in HEAD\'s history or in the Director\'s published history up to the CR-disposition record ' + CR_DISPOSITION_COMMIT.slice(0, 8) + ', so each citation resolves for anyone who receives this branch and the Director branch; the one exception is ' + HISTORICAL_CR_COMMIT.slice(0, 8) + ', where CR-001..CR-004 were filed on the first contract branch (' + commits + ' commit citations in ' + paths.length + ' files added or changed since ' + PUBLISHED.slice(0, 7) + ', the last published commit; the Director\'s documents aside)',
    gitOut('merge-base', '--is-ancestor', PUBLISHED, 'HEAD') !== null && bc.status === 0 && kinds.length === toks.length && history.size > 100 && dangling.length === 0, dangling.join(' | '));
}

// ---------------------------------------------------------------- V: the developer mutation proof's coverage of the Director's §3.10 table
{
  // (L7-21) every guard of the Director's step-10 table mapped to a developer mutant at an accepted layer, or to a stated reason (a
  // clean-VM rehearsal, the Director instrument, the verifier's own procedure); every mutant plants on this tree
  const r = spawnSync(process.execPath, [join(ROOT, 'qa', 'factory', 'v1', 'v1_mutation_proof.mjs'), '--coverage', '--plan'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const covLine = (out.match(/^v1_mutation_proof --coverage: .*$/m) || [''])[0];
  const planLine = (out.match(/^v1_mutation_proof: plan only - .*$/m) || [''])[0];
  check('V1 the developer mutation proof covers the Director\'s §3.10 table: ' + (covLine.replace(/^v1_mutation_proof --coverage: /, '') || 'no coverage line') + '; ' + (planLine.replace(/^v1_mutation_proof: plan only - /, '') || 'no plan line'),
    r.status === 0 && /every guard mapped/.test(covLine) && /mutants plant; nothing was run/.test(planLine) && !/VACUOUS/.test(out),
    out.split('\n').filter((l) => /^COV|VACUOUS/.test(l)).slice(0, 8).join(' | '));
}

console.log('\nfactory_v1_static_contract: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
