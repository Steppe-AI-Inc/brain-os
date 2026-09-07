#!/usr/bin/env node
// MUTATION PROOF for the DB round-5 closures (independent review round 4: R4-1, R4-2, R4-3,
// R4-4, R4-9). Observers: qa/dbtest/personas.mjs (behavioural, PGlite) AND
// qa/scenarios-runner/agent_run_guard_covers_claim_returns.mjs (structural — the guard list
// pinned to the claim's return list). Each mutation re-creates a reviewer finding in the
// REAL file and asserts a named test FAILS. Restored from pristine bytes with a sha check.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const FILES = {
  C: join(REPO, 'supabase', 'migrations', '202609020003_messaging_transport_foundation.sql'),
  D: join(REPO, 'supabase', 'migrations', '202609030001_agent_run_capacity_retry.sql'),
};
const PERSONAS = join(REPO, 'qa', 'dbtest', 'personas.mjs');
const COVERS = join(REPO, 'qa', 'scenarios-runner', 'agent_run_guard_covers_claim_returns.mjs');
const pristine = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(p)]));
const sha = (b) => createHash('sha256').update(b).digest('hex');

const MUTATIONS = [
  { file: 'D', name: 'R4-1 COVERAGE: canonical_work_order_id leaves the guard (a column the claim RETURNS)',
    find: /\s*or new\.canonical_work_order_id is distinct from old\.canonical_work_order_id/, replace: '',
    expect: ['D.R4-1.managerCannotRewrite.canonical_work_order_id', 'every column the claim RETURNS'] },
  { file: 'D', name: 'R4-1 COVERAGE: task_id leaves the guard',
    find: /\s*or new\.task_id is distinct from old\.task_id/, replace: '',
    expect: ['D.R4-1.managerCannotRewrite.task_id', 'every column the claim RETURNS'] },
  { file: 'D', name: 'R4-1 COVERAGE: agent_id leaves the guard',
    find: /\s*or new\.agent_id is distinct from old\.agent_id/, replace: '',
    expect: ['D.R4-1.managerCannotRewrite.agent_id', 'every column the claim RETURNS'] },
  { file: 'D', name: 'R4-2 COVERAGE: the liveness columns leave the guard',
    find: /\s*or new\.last_event is distinct from old\.last_event\r?\n\s*or new\.last_heartbeat_at is distinct from old\.last_heartbeat_at/, replace: '',
    expect: ['D.R4-1.managerCannotRewrite.last_event', 'D.R4-1.managerCannotRewrite.last_heartbeat_at', 'every column the claim RETURNS'] },
  { file: 'D', name: 'R4-1 STRUCTURAL: the claim starts RETURNING a column the guard does not name (the next omission)',
    find: /select ar\.id, ar\.canonical_work_order_id, ar\.task_id, ar\.agent_id,/, replace: 'select ar.id, ar.canonical_work_order_id, ar.task_id, ar.agent_id, ar.company_id,',
    expect: ['every column the claim RETURNS'] },
  { file: 'D', name: 'R4-9 COVERAGE: the guard raises P0001 again instead of 42501',
    find: /may modify Agent Run retry\/checkpoint state'\r?\n\s*using errcode = '42501';/, replace: "may modify Agent Run retry/checkpoint state';",
    expect: ['the guard raises an AUTHORITY refusal'] },
  { file: 'C', name: 'R4-3 COVERAGE: the ownership condition is dropped (only the repoint-of-enabled shape remains)',
    find: /if \(tg_op = 'INSERT' or new\.channel_id is distinct from old\.channel_id\)\r?\n\s*and not public\.is_founder_or_admin\(\) then/,
    replace: "if tg_op = 'UPDATE' and old.enabled and new.channel_id is distinct from old.channel_id and not public.is_founder_or_admin() then",
    expect: ['C.R4-3.managerCannotPlantBindingOnFounderChannel', 'C.R4-3.managerCannotTwoStepRepoint'] },
  { file: 'C', name: 'R4-3 LIMIT: the founder/admin exemption is removed from the ownership condition (the founder can no longer bind other people\'s channels)',
    find: /if \(tg_op = 'INSERT' or new\.channel_id is distinct from old\.channel_id\)\r?\n\s*and not public\.is_founder_or_admin\(\) then/,
    replace: "if (tg_op = 'INSERT' or new.channel_id is distinct from old.channel_id) then",
    expect: ['C.R4-3.founderCanBindAnyChannel'] },
  { file: 'C', name: 'R4-3 LIMIT: ownership is checked against the OLD channel instead of the new one (a manager could still move a binding they own onto a channel they do not)',
    find: /from public\.chat_channels c where c\.id = new\.channel_id;\r?\n\s*if v_channel_owner is null or v_channel_owner is distinct from public\.current_profile_id\(\) then/,
    replace: "from public.chat_channels c where c.id = coalesce(old.channel_id, new.channel_id);\n    if v_channel_owner is null or v_channel_owner is distinct from public.current_profile_id() then",
    expect: ['C.R4-3.managerCannotTwoStepRepoint'] },
];

const run = (file, cwd) => {
  try { return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd }); }
  catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n  FAIL SUITE:EXIT\n'; }
};
const observe = () => {
  const p = run(PERSONAS, join(REPO, 'qa', 'dbtest'));
  const c = run(COVERS, REPO);
  const ids = p.split(/\r?\n/).filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim().split(/\s+/)[1]);
  const covers = c.split(/\r?\n/).filter((l) => /^FAIL /.test(l)).map((l) => l.replace(/^FAIL /, '').split(' — ')[0]);
  return ids.concat(covers);
};

let unproven = 0;
try {
  const base = observe();
  if (base.length) { console.log('BASELINE NOT CLEAN: ' + base.join(' | ')); process.exit(1); }
  console.log('baseline: personas + guard-covers suite green on unmutated source\n');
  for (const m of MUTATIONS) {
    const text = pristine[m.file].toString('utf8');
    const hits = (text.match(new RegExp(m.find.source, m.find.flags + 'g')) || []).length;
    if (hits !== 1) { console.log(`UNPROVEN      ${m.name}\n              stale anchor: matched ${hits}x`); unproven++; continue; }
    writeFileSync(FILES[m.file], text.replace(m.find, () => m.replace), 'utf8');
    const got = observe();
    writeFileSync(FILES[m.file], pristine[m.file]);
    const caught = m.expect.filter((id) => got.some((g) => g.startsWith(id)));
    if (caught.length === 0) { console.log(`UNPROVEN      ${m.name}\n              expected ${m.expect.join(' / ')} to FAIL; got: ${got.slice(0, 5).join(' | ') || '(green)'}`); unproven++; }
    else console.log(`PROVEN        ${m.name}\n              caught by: ${caught.join(', ')}${got.length > caught.length ? ` (+${got.length - caught.length} collateral)` : ''}`);
  }
} finally {
  for (const [k, p] of Object.entries(FILES)) {
    writeFileSync(p, pristine[k]);
    if (sha(readFileSync(p)) !== sha(pristine[k])) { console.log(`*** NOT RESTORED: ${p}`); process.exit(2); }
  }
  console.log('\nall files restored byte-identically');
}
console.log(`migration_round5_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
