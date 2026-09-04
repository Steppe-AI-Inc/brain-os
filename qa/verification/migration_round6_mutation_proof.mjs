#!/usr/bin/env node
// MUTATION PROOF for the DB round-6 closures (independent review round 5: R5-1, R5-2, R5-3,
// R5-4). Observer: qa/dbtest/personas.mjs (behavioural, PGlite) plus
// qa/scenarios-runner/agent_run_guard_covers_claim_returns.mjs for the R5-4 structural half.
// Each mutation re-creates a reviewer finding in the REAL file and asserts a named test
// FAILS. Restored from pristine bytes with a sha check; a stale anchor is UNPROVEN.
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
  CH: join(REPO, 'supabase', 'migrations', '202609040001_chat_channels_creator_immutable.sql'),
};
const PERSONAS = join(REPO, 'qa', 'dbtest', 'personas.mjs');
const COVERS = join(REPO, 'qa', 'scenarios-runner', 'agent_run_guard_covers_claim_returns.mjs');
const pristine = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(p)]));
const sha = (b) => createHash('sha256').update(b).digest('hex');

const MUTATIONS = [
  { file: 'CH', name: 'R5-1 COVERAGE: the created_by_profile_id immutability guard never fires (a manager can take channel ownership)',
    find: /if new\.created_by_profile_id is distinct from old\.created_by_profile_id\r?\n\s*and not public\.is_founder_or_admin\(\) then/,
    replace: 'if false then', expect: ['C.R5-1.managerCannotTakeChannelOwnership'] },
  { file: 'CH', name: 'R5-1 COVERAGE: the immutability trigger is attached to an event that never fires here',
    find: /before update on public\.chat_channels/, replace: 'before delete on public.chat_channels',
    expect: ['C.R5-1.managerCannotTakeChannelOwnership'] },
  { file: 'CH', name: 'R5-1 LIMIT: the founder/admin exemption is dropped, so the founder can no longer reassign a creator',
    find: /if new\.created_by_profile_id is distinct from old\.created_by_profile_id\r?\n\s*and not public\.is_founder_or_admin\(\) then/,
    replace: 'if new.created_by_profile_id is distinct from old.created_by_profile_id then',
    expect: ['C.R5-1.founderCanReassignCreator'] },
  { file: 'C', name: 'R5-2 COVERAGE: the enabled external-identity guard is removed (redirect an enabled binding)',
    find: /\s*if tg_op = 'UPDATE' and old\.enabled and not public\.is_founder_or_admin\(\)\r?\n\s*and \(new\.external_conversation_id is distinct from old\.external_conversation_id[\s\S]*?end if;/,
    replace: '', expect: ['C.R5-2.managerCannotRewriteEnabledExternalId', 'C.R5-2.managerCannotRewriteEnabledTransport'] },
  { file: 'C', name: 'R5-2 LIMIT: the guard drops the transport half (only external_conversation_id watched)',
    find: /new\.external_conversation_id is distinct from old\.external_conversation_id\r?\n\s*or new\.transport is distinct from old\.transport\) then/,
    replace: 'new.external_conversation_id is distinct from old.external_conversation_id) then',
    expect: ['C.R5-2.managerCannotRewriteEnabledTransport'] },
  { file: 'C', name: 'R5-3 COVERAGE: the DELETE gate function no longer refuses (delete an enabled binding)',
    find: /if old\.enabled and not public\.is_founder_or_admin\(\) then\r?\n\s*raise exception 'channel_transport_bindings: deleting an ENABLED/,
    replace: "if false then\n    raise exception 'channel_transport_bindings: deleting an ENABLED",
    expect: ['C.R5-3.managerCannotDeleteEnabledBinding'] },
  { file: 'C', name: 'R5-3 COVERAGE: the DELETE gate trigger is not attached',
    find: /create trigger channel_transport_bindings_delete_gate\r?\n\s*before delete on public\.channel_transport_bindings/,
    replace: 'create trigger channel_transport_bindings_delete_gate\n  after insert on public.channel_transport_bindings',
    expect: ['C.R5-3.managerCannotDeleteEnabledBinding'] },
  { file: 'C', name: 'R5-3 LIMIT: the DELETE gate over-broadens to ALL deletes (a manager can no longer delete their own disabled binding)',
    find: /if old\.enabled and not public\.is_founder_or_admin\(\) then/,
    replace: 'if not public.is_founder_or_admin() then',
    expect: ['C.R5-3.managerCanDeleteOwnDisabledBinding'] },
  { file: 'D', name: 'R5-4 COVERAGE: id leaves the retry-column guard (a manager can re-key a run)',
    find: /\s*or new\.id is distinct from old\.id then/, replace: '\n     then',
    expect: ['D.R5-4.managerCannotRekeyRun', 'every column the claim RETURNS'] },
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
    else console.log(`PROVEN        ${m.name}\n              caught by: ${caught.join(', ')}`);
  }
} finally {
  for (const [k, p] of Object.entries(FILES)) {
    writeFileSync(p, pristine[k]);
    if (sha(readFileSync(p)) !== sha(pristine[k])) { console.log(`*** NOT RESTORED: ${p}`); process.exit(2); }
  }
  console.log('\nall files restored byte-identically');
}
console.log(`migration_round6_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
