#!/usr/bin/env node
// MUTATION PROOF for the DB round-7 closures (independent review round 6: R6-0, R6-1).
// Observer: qa/dbtest/personas.mjs (behavioural, PGlite). Each mutation re-creates a reviewer
// finding in migration C and asserts a named test FAILS. Restored from pristine bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const C = join(REPO, 'supabase', 'migrations', '202609020003_messaging_transport_foundation.sql');
const PERSONAS = join(REPO, 'qa', 'dbtest', 'personas.mjs');
const pristine = readFileSync(C);
const sha = (b) => createHash('sha256').update(b).digest('hex');

const MUTATIONS = [
  { name: 'R6-0 COVERAGE: the enabled-repoint founder gate is removed (a manager repoints a founder-enabled binding onto their own channel)',
    find: /\s*if tg_op = 'UPDATE' and old\.enabled and new\.channel_id is distinct from old\.channel_id\r?\n\s*and not public\.is_founder_or_admin\(\) then\r?\n\s*raise exception 'channel_transport_bindings: repointing an ENABLED[\s\S]*?end if;/,
    replace: '', expect: ['C.R6-0.managerCannotRepointEnabledOntoOwnChannel'] },
  { name: 'R6-0 LIMIT: the founder/admin exemption is dropped, so the founder can no longer repoint an enabled binding',
    find: /if tg_op = 'UPDATE' and old\.enabled and new\.channel_id is distinct from old\.channel_id\r?\n\s*and not public\.is_founder_or_admin\(\) then\r?\n\s*raise exception 'channel_transport_bindings: repointing an ENABLED/,
    replace: "if tg_op = 'UPDATE' and old.enabled and new.channel_id is distinct from old.channel_id then\n    raise exception 'channel_transport_bindings: repointing an ENABLED",
    expect: ['C.R6-0.founderCanRepointEnabled'] },
  { name: 'R6-1 COVERAGE (disable): the not-your-binding disable gate is removed (a manager disables a founder binding)',
    find: /\s*if tg_op = 'UPDATE' and old\.enabled and not new\.enabled\r?\n\s*and old\.created_by_profile_id is distinct from public\.current_profile_id\(\)[\s\S]*?end if;/,
    replace: '', expect: ['C.R6-1.managerCannotDisableFoundersBinding'] },
  { name: 'R6-1 COVERAGE (delete): the DELETE gate reverts to enabled-only, so a manager deletes a founder DISABLED binding',
    find: /if \(old\.enabled or old\.created_by_profile_id is distinct from public\.current_profile_id\(\)\)\r?\n\s*and not public\.is_founder_or_admin\(\) then/,
    replace: 'if old.enabled and not public.is_founder_or_admin() then',
    expect: ['C.R6-1.managerCannotDeleteFoundersDisabledBinding'] },
];

const run = () => {
  try { return execFileSync(process.execPath, [PERSONAS], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: join(REPO, 'qa', 'dbtest') }); }
  catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n  FAIL SUITE:EXIT\n'; }
};
const failed = (out) => out.split(/\r?\n/).filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim().split(/\s+/)[1]);

let unproven = 0;
try {
  const base = failed(run());
  if (base.length) { console.log('BASELINE NOT CLEAN: ' + base.join(', ')); process.exit(1); }
  console.log('baseline: personas green on unmutated source\n');
  const text = pristine.toString('utf8');
  for (const m of MUTATIONS) {
    const hits = (text.match(new RegExp(m.find.source, m.find.flags + 'g')) || []).length;
    if (hits !== 1) { console.log(`UNPROVEN      ${m.name}\n              stale anchor: matched ${hits}x`); unproven++; continue; }
    writeFileSync(C, text.replace(m.find, () => m.replace), 'utf8');
    const got = failed(run());
    writeFileSync(C, pristine);
    const caught = m.expect.filter((id) => got.some((g) => g.startsWith(id)));
    if (caught.length === 0) { console.log(`UNPROVEN      ${m.name}\n              expected ${m.expect.join('/')} to FAIL; got: ${got.slice(0, 5).join(' | ') || '(green)'}`); unproven++; }
    else console.log(`PROVEN        ${m.name}\n              caught by: ${caught.join(', ')}`);
  }
} finally {
  writeFileSync(C, pristine);
  if (sha(readFileSync(C)) !== sha(pristine)) { console.log('*** NOT RESTORED'); process.exit(2); }
  console.log('\nmigration C restored byte-identically');
}
console.log(`migration_round7_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
