#!/usr/bin/env node
// MUTATION PROOF for the DB round-4 closures (independent review round 3: A-1, A-3, B-1,
// B-2, C-2, C-3, D-1, D-2, D-3), observed by qa/dbtest/personas.mjs — the BEHAVIOURAL suite,
// run on PGlite with every persona under session_user = qa_authenticator.
//
// Each mutation re-creates one reviewer finding in the REAL file (migration or harness) and
// asserts the named persona test FAILS. Files are restored from pristine byte copies in a
// finally, with a sha check. A stale anchor is UNPROVEN, never silently skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const MIG = (f) => join(REPO, 'supabase', 'migrations', f);
const FILES = {
  A: MIG('202609020001_chat_channel_state_durable_conversation.sql'),
  B: MIG('202609020002_set_person_assignment_clear_manager.sql'),
  C: MIG('202609020003_messaging_transport_foundation.sql'),
  D: MIG('202609030001_agent_run_capacity_retry.sql'),
  P: join(REPO, 'qa', 'dbtest', 'personas.mjs'),
};
const SUITE = FILES.P;
const pristine = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(p)]));
const sha = (b) => createHash('sha256').update(b).digest('hex');

const MUTATIONS = [
  { file: 'A', name: 'A-1 COVERAGE: the UPDATE guard trusts the flag ALONE again (any client can set_config it)',
    find: /= 'on'\r?\n\s*and current_user in \('postgres', 'supabase_admin'\);/, replace: "= 'on';",
    expect: ['A.R3-A1.clientCannotForgeViaFlag'] },
  { file: 'A', name: 'A-1 LIMIT: the guard becomes SECURITY DEFINER (current_user is then ALWAYS the owner — the R-D1 shape)',
    find: /security invoker           -- deliberately NOT definer/, replace: 'security definer -- MUTATED',
    expect: ['A.R3-A1.clientCannotForgeViaFlag'] },
  { file: 'A', name: 'A-3 COVERAGE: the write policy re-admits the company-manager tier',
    find: /and c\.created_by_profile_id = public\.current_profile_id\(\)\r?\n(\s*)\)\r?\n(\s*)\) with check/,
    replace: "and (c.created_by_profile_id = public.current_profile_id() or (c.company_id is not null and public.is_company_manager(c.company_id)))\n$1)\n$2) with check",
    // Either A-3 case catches it (a manager who can DELETE the row first leaves nothing to plant into).
    expect: ['A.R3-A3.managerCannotPlantFocusStack', 'A.R3-A3.managerCannotDeleteFounderState'] },
  { file: 'B', name: 'B-2 COVERAGE: the cross-company employment guard is removed',
    find: /\s*if not \(public\.is_founder_or_admin\(\)\r?\n\s*or v_current_company is null[\s\S]*?cross-company employment change rejected\)'[\s\S]*?end if;/,
    replace: '',
    expect: ['B.R3-B2.crossCompanyManagerCannotEndEmployment'] },
  { file: 'B', name: 'B-1 COVERAGE: the manager_person_id company guard is removed',
    find: /\s*if p_manager_person_id is not null and not exists \([\s\S]*?cross-company manager reference rejected\)'[\s\S]*?end if;/,
    replace: '',
    expect: ['B.R3-B1.crossCompanyManagerPersonRefused'] },
  { file: 'C', name: 'C-2 COVERAGE: the enable gate is written but never attached (the decorative-guard class)',
    // Renaming alone would leave it attached; the mutation moves it to an event that never fires here.
    find: /create trigger channel_transport_bindings_enable_gate\r?\n\s*before insert or update on public\.channel_transport_bindings/,
    replace: 'create trigger channel_transport_bindings_enable_gate\n  before delete on public.channel_transport_bindings',
    expect: ['C.R3-C2.managerCannotEnableBinding', 'C.R3-C3.managerCannotRepointEnabledBinding'] },
  // ROUND 5: the enabled-only repoint branch was REPLACED by the ownership branch (R4-3); the
  // mutation now removes that branch, which reopens C-3 and R4-3 together.
  { file: 'C', name: 'C-3 / R4-3 COVERAGE: the channel-ownership branch of the enable gate is removed',
    find: /\s*if \(tg_op = 'INSERT' or new\.channel_id is distinct from old\.channel_id\)\r?\n\s*and not public\.is_founder_or_admin\(\) then[\s\S]*?end if;\r?\n\s*end if;/, replace: '',
    expect: ['C.R3-C3.managerCannotRepointEnabledBinding', 'C.R4-3.managerCannotPlantBindingOnFounderChannel', 'C.R4-3.managerCannotTwoStepRepoint'] },
  { file: 'D', name: 'D-3 COVERAGE: execution_mode leaves the guard column list',
    // The comment lines above the guard entry end in a newline; the replacement must start on its own line.
    find: /\s*or new\.execution_mode is distinct from old\.execution_mode(?=\r?\n)/, replace: '',
    expect: ['D.R3-D3.managerCannotRewriteExecutionMode'] },
  { file: 'D', name: 'D-2 COVERAGE: the dead service_role grant comes back',
    find: /revoke execute on function public\.claim_blocked_run_for_retry\(text, integer, interval\) from anon, public, authenticated, service_role;/,
    replace: "revoke execute on function public.claim_blocked_run_for_retry(text, integer, interval) from anon, public, authenticated;\ngrant execute on function public.claim_blocked_run_for_retry(text, integer, interval) to service_role;",
    expect: ['D.R3-D2.serviceRoleHasNoGrant'] },
  { file: 'P', name: 'D-1 HARNESS COVERAGE: personas run under the superuser login again (session_user = postgres) — the guard then refuses nobody',
    // ROUND 5: as() gained the real-engine branch first; the PGlite branch is what runs here.
    find: /  const login = await enterPersonaSession\(db\);\r?\n  try \{\r?\n    await db\.exec\(`set role \$\{role\};`\);/,
    replace: "  const login = (await db.query('select session_user su')).rows[0].su;\n  try {\n    await db.exec(`set role ${role};`);",
    expect: ['D.R3-D1.managerCannotRewriteRetryColumns'] },
];

const run = () => {
  try { return execFileSync(process.execPath, [SUITE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: join(REPO, 'qa', 'dbtest') }); }
  catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n  FAIL SUITE:EXIT\n'; }
};
const failed = (out) => out.split(/\r?\n/).filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim().split(/\s+/)[1]);

let unproven = 0;
try {
  const base = failed(run());
  if (base.length) { console.log('BASELINE NOT CLEAN — personas fail on unmutated source: ' + base.join(', ')); process.exit(1); }
  console.log('baseline: personas green on unmutated source\n');
  for (const m of MUTATIONS) {
    const text = pristine[m.file].toString('utf8');
    const hits = (text.match(new RegExp(m.find.source, m.find.flags + 'g')) || []).length;
    if (hits !== 1) { console.log(`UNPROVEN      ${m.name}\n              stale anchor: matched ${hits}x`); unproven++; continue; }
    writeFileSync(FILES[m.file], text.replace(m.find, m.replace), 'utf8');
    const got = failed(run());
    writeFileSync(FILES[m.file], pristine[m.file]);
    const caught = m.expect.filter((id) => got.includes(id));
    if (caught.length === 0) { console.log(`UNPROVEN      ${m.name}\n              expected ${m.expect.join('/')} to FAIL; got: ${got.slice(0, 5).join(', ') || '(green)'}`); unproven++; }
    else console.log(`PROVEN        ${m.name}\n              caught by: ${caught.join(', ')}${got.length > caught.length ? ` (+${got.length - caught.length} collateral)` : ''}`);
  }
} finally {
  for (const [k, p] of Object.entries(FILES)) {
    writeFileSync(p, pristine[k]);
    if (sha(readFileSync(p)) !== sha(pristine[k])) { console.log(`*** NOT RESTORED: ${p}`); process.exit(2); }
  }
  console.log('\nall files restored byte-identically');
}
console.log(`migration_round4_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
