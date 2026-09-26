#!/usr/bin/env node
// TRANSPORT COMPATIBILITY CONTRACT (WO-2; P-3; AC-9). Checks qa/implementation/auto-enrollment-v1/compat_matrix.json and computes each
// row's VERDICT - it is never written by hand:
//   * every OLD CALL cites a line of the 69df2f52 source that says what the row claims (read with `git show 69df2f52:<file>`);
//   * every regression cites certified assertions (file:line at 69df2f52) whose line carries that row label, and names a ported row of
//     compat_regressions.mjs;
//   * every NEW API ENDPOINT is a route in the Node API's FRONT_DOORS; every front door exists in the candidate migration;
//   * no table the migration creates holds lease, lock or completion state (P-2: only the 69df2f52 tables do);
//   * VERDICT = MIGRATED only when every regression of the row PASSED through the Node API AND through the front doors directly.
// usage: node qa/factory/v1/transport_compatibility_contract.mjs --api <results.json> --direct <results.json> [--write] [--evidence <f>]
//        (without the two result files it runs compat_regressions.mjs through both transports first)
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, BASELINE } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const MATRIX = join(ROOT, 'qa/implementation/auto-enrollment-v1/compat_matrix.json');
const MD = join(ROOT, 'qa/implementation/auto-enrollment-v1/COMPATIBILITY_MATRIX.md');
const m = JSON.parse(readFileSync(MATRIX, 'utf8'));
const problems = [];
const show = new Map();
const baselineLine = (path, n) => {
  if (!show.has(path)) show.set(path, execFileSync('git', ['-C', ROOT, 'show', BASELINE + ':' + path], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n'));
  return show.get(path)[n - 1];
};
const where = (file) => /^(acceptance|node_truth_acceptance|shared_control_plane_acceptance)\.mjs$/.test(file) ? 'qa/factory/' + file : 'scripts/factory-runner/' + file;

// the regression results, both transports
let results = {};
for (const t of ['api', 'direct']) {
  let file = arg('--' + t);
  if (!file) {
    file = join(mkdtempSync(join(tmpdir(), 'compat-')), t + '.json');
    const r = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', join(ROOT, 'qa/factory/v1/compat_regressions.mjs'), '--transport', t, '--json', file],
      { encoding: 'utf8', cwd: ROOT, timeout: 1200000 });
    if (r.status !== 0 && r.status !== 1) problems.push('compat_regressions --transport ' + t + ' did not run: ' + (r.stderr || '').slice(-300));
  }
  try { const j = JSON.parse(readFileSync(file, 'utf8')); if (j.migration_sha256 !== sha256(compose())) problems.push(t + ' results are for another migration (' + j.migration_sha256 + ')'); results[t] = new Map(j.results.map((x) => [x.id, x])); }
  catch (e) { problems.push('no ' + t + ' results: ' + e.message); results[t] = new Map(); }
}

const migration = compose();
const handler = readFileSync(join(ROOT, 'supabase/control-plane/edge/supabase/functions/_shared/node_api.ts'), 'utf8');
const routes = new Set([...handler.matchAll(/^\s*'((?:GET|POST) \/v1\/[a-z/-]+)': 'select factory\./gm)].map((x) => x[1]));

const rows = [];
for (const r of m.rows) {
  const p = [];
  const [ofile, oline] = r.old_call.cite.split(':');
  const ol = baselineLine(ofile, Number(oline));
  if (!ol || !ol.includes(r.old_call.expect)) p.push('OLD CALL ' + r.old_call.cite + ' does not read "' + r.old_call.expect + '" at 69df2f52');
  for (const e of r.new_api_endpoint.match(/(GET|POST) \/v1\/[a-z/-]+/g) || []) if (!routes.has(e)) p.push('endpoint ' + e + ' is not a Node API route');
  for (const f of r.new_server_primitive.front_door.match(/factory\.[a-z_]+/g) || []) if (!new RegExp('create function ' + f.replace('.', '\\.') + '\\(').test(migration)) p.push(f + ' is not in the migration');
  const regs = [];
  for (const id of r.regressions) {
    for (const c of id.matchAll(/([a-z_]+\.mjs):(\d+)(?: ([A-Z][A-Za-z0-9/-]*))?/g)) {
      const line = baselineLine(where(c[1]), Number(c[2]));
      if (!line) { p.push(id + ': ' + c[1] + ':' + c[2] + ' does not exist at 69df2f52'); continue; }
      if (c[3] && /acceptance\.mjs$/.test(c[1]) && !line.includes("check('" + c[3].split('/')[0])) p.push(id + ': line ' + c[1] + ':' + c[2] + ' is not certified row ' + c[3]);
    }
    const a = results.api.get(id), d = results.direct.get(id);
    regs.push({ id, api: a ? a.ok : null, direct: d ? d.ok : null });
    if (!a || !d) p.push('regression ' + id + ' has no result on ' + (!a ? 'api' : 'direct'));
  }
  const verdict = p.length === 0 && regs.length > 0 && regs.every((x) => x.api === true && x.direct === true) ? 'MIGRATED' : 'PENDING';
  rows.push({ ...r, regs, verdict, problems: p });
  problems.push(...p.map((x) => r.row + ': ' + x));
}
// the required rows are all there
for (const need of ['register', 'heartbeat', 'discover / claim', 'lease renewal', 'checkpoint', 'complete', 'surface-lock acquire', 'surface-lock release',
  'takeover / recovery', 'verification claim', 'certification']) if (!rows.some((r) => r.row === need)) problems.push('the required row "' + need + '" is missing');
// P-2: no new table holds lease, lock or completion state
const newTables = [...migration.matchAll(/create table factory\.([a-z_]+) \(([\s\S]*?)\n\);/g)];
for (const [, t, body] of newTables) if (/^\s+(lease_expires_at|lease_until|surface|finished_at|completed_at)\s/m.test(body)) problems.push('new table factory.' + t + ' holds lease / lock / completion state');

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const md = ['# Transport compatibility matrix (WO-2; contract P-3; AC-9) - implementer record, NOT canonical', '',
  '- Generated by `qa/factory/v1/transport_compatibility_contract.mjs` from `compat_matrix.json`; VERDICT is computed, never hand-written.',
  '- Baseline: `' + BASELINE + '`. Each OLD CALL is checked against that commit\'s source; each regression ports the certified assertion(s) it names',
  '  (file:line at 69df2f52) and runs through the Node API and through the SQL front doors directly (`qa/factory/v1/compat_regressions.mjs`).',
  '- Migration sha256: `' + sha256(migration) + '`.', '',
  '| ROW | OLD CALL | OLD DB PRIMITIVE | OLD TRANSACTION BOUNDARY | OLD AUTHORITY CHECK | OLD LEASE / FENCING RULE | NEW API ENDPOINT | NEW SERVER PRIMITIVE (tables written) | NEW AUTHORITY CHECK | REGRESSION TEST (api / direct) | VERDICT |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => '| ' + [r.row, '`' + r.old_call.cite + '`', r.old_db_primitive, r.old_transaction_boundary, r.old_authority_check, r.old_lease_fencing_rule,
    r.new_api_endpoint, '`' + r.new_server_primitive.front_door + '`: ' + r.new_server_primitive.writes.join('; '), r.new_authority_check,
    r.regs.map((x) => '`' + x.id + '` ' + (x.api ? 'PASS' : 'FAIL') + ' / ' + (x.direct ? 'PASS' : 'FAIL')).join('<br>'), '**' + r.verdict + '**'].map(esc).join(' | ') + ' |'),
  '', 'Rows MIGRATED: ' + rows.filter((r) => r.verdict === 'MIGRATED').length + ' of ' + rows.length + '.', ''].join('\n');
if (process.argv.includes('--write')) writeFileSync(MD, md);
let mdOk = true;
try { mdOk = readFileSync(MD, 'utf8').replace(/\r\n/g, '\n') === md; } catch { mdOk = false; }
if (!process.argv.includes('--write') && !mdOk) problems.push('COMPATIBILITY_MATRIX.md is not the generated matrix (run with --write)');

for (const r of rows) console.log((r.verdict === 'MIGRATED' ? 'OK   ' : 'FAIL ') + r.row.padEnd(24) + ' ' + r.verdict + '  (' + r.regs.length + ' ported regressions)' + (r.problems.length ? ' - ' + r.problems.join('; ') : ''));
for (const x of problems.filter((q) => !rows.some((r) => q.startsWith(r.row + ':')))) console.log('FAIL ' + x);
const ok = problems.length === 0 && rows.every((r) => r.verdict === 'MIGRATED');
console.log('\ntransport_compatibility_contract: ' + rows.filter((r) => r.verdict === 'MIGRATED').length + '/' + rows.length + ' rows MIGRATED' + (ok ? '' : '; problems: ' + problems.length));
const ev = arg('--evidence');
if (ev) writeFileSync(ev, ['qa/factory/v1/transport_compatibility_contract.mjs', 'migration sha256 ' + sha256(migration), ...rows.map((r) => r.row + ': ' + r.verdict), ...problems, ok ? 'PASS' : 'FAIL'].join('\n') + '\n');
process.exit(ok ? 0 : 1);
