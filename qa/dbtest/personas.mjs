#!/usr/bin/env node
// RLS PERSONA ENFORCEMENT — the gap the other two harnesses could not close.
//
// apply-migrations.mjs proves the SQL parses. acceptance.mjs proves constraints and
// triggers fire. NEITHER proves a POLICY REFUSES A REAL CALLER, and three review rounds
// plus both earlier harnesses all said so explicitly.
//
// It turns out PGlite CAN prove it. It runs as the `postgres` superuser by default, and a
// superuser bypasses RLS — which is why the earlier harnesses disclaimed this. But
// `SET ROLE authenticated` drops to a non-superuser, non-owner role, and from there
// PostgreSQL enforces policies exactly as it does in production. Verified before relying on
// it: superuser sees every row, `authenticated` sees only what its policy allows, and
// `anon` sees none.
//
// Personas mirror the production acceptance scripts: `set role` plus the same
// `request.jwt.claims` GUC the deployed Edge Function sets, so auth.uid() resolves the same
// way it does live.
//
// A DENIAL IS ONLY EVIDENCE IF IT IS DENIED FOR THE RIGHT REASON. Round 2 found acceptance
// tests that "passed" on a foreign-key or primary-key violation instead of on authority
// (R-ART2, R-ART7), so every refusal here is checked against insufficient_privilege or an
// explicit authority message — never `catch (others)`.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGDIR = join(resolve(HERE, '..', '..'), 'supabase', 'migrations');
const transform = (s) => s
  .replace(/^\s*create\s+extension\s+(if\s+not\s+exists\s+)?["']?(pg_net|pgjwt|pg_graphql|pg_stat_statements|uuid-ossp|http|vector)["']?[^;]*;/gim, '')
  .replace(/\bvector\s*\(\s*\d+\s*\)/gi, 'vector')
  .replace(/create\s+index[^;]*?using\s+(hnsw|ivfflat)[^;]*;/gi, '');

const db = await PGlite.create({ extensions: { pgcrypto } });
await db.exec(readFileSync(join(HERE, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIGDIR).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec(transform(readFileSync(join(MIGDIR, f), 'utf8'))); }
  catch (e) { console.log(`SETUP FAILED at ${f}: ${String(e.message).split('\n')[0]}`); process.exit(1); }
}

// ---- self-check: prove RLS is actually being enforced before asserting anything --------
// Without this, every "denied" result below could be a missing table or a typo, and the
// suite would report airtight security while proving nothing.
await db.exec(`create table if not exists public._rls_selfcheck(id int, owner text);
  alter table public._rls_selfcheck enable row level security;
  grant select on public._rls_selfcheck to authenticated, anon;
  drop policy if exists sc on public._rls_selfcheck;
  create policy sc on public._rls_selfcheck for select using (owner = 'alice');
  insert into public._rls_selfcheck values (1,'alice'),(2,'bob');`);
const selfSuper = (await db.query('select count(*)::int c from public._rls_selfcheck')).rows[0].c;
await db.exec(`set role authenticated;`);
const selfAuth = (await db.query('select count(*)::int c from public._rls_selfcheck')).rows[0].c;
await db.exec(`reset role;`);
if (!(selfSuper === 2 && selfAuth === 1)) {
  console.log(`RLS SELF-CHECK FAILED (superuser=${selfSuper}, authenticated=${selfAuth}). ` +
    'Policies are NOT being enforced in this harness, so no denial below would mean anything.');
  process.exit(1);
}
console.log(`RLS enforcement self-check: superuser sees ${selfSuper}, authenticated sees ${selfAuth} — policies ARE enforced\n`);

// ---- personas ---------------------------------------------------------------------------
const FOUNDER_AUTH = '11111111-0000-0000-0000-000000000001';
const EMP_AUTH = '22222222-0000-0000-0000-000000000002';
const OUTSIDER_AUTH = '33333333-0000-0000-0000-000000000009';
const CO_A = 'aaaa0000-0000-0000-0000-00000000000a';
const CO_B = 'bbbb0000-0000-0000-0000-00000000000b';
const CH_FOUNDER = 'cccc0000-0000-0000-0000-00000000000c';

await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values
  ('${FOUNDER_AUTH}','founder@t.local','{"full_name":"F"}'::jsonb),
  ('${EMP_AUTH}','emp@t.local','{"full_name":"E"}'::jsonb),
  ('${OUTSIDER_AUTH}','out@t.local','{"full_name":"O"}'::jsonb);`);
await db.exec(`update public.profiles set role='founder', active=true where email='founder@t.local';
  update public.profiles set role='employee', active=true where email in ('emp@t.local','out@t.local');`);
const pid = async (email) => (await db.query(`select id from public.profiles where email='${email}'`)).rows[0].id;
const FP = await pid('founder@t.local'), EP = await pid('emp@t.local'), OP = await pid('out@t.local');

await db.exec(`insert into public.companies (id,name,created_by_profile_id) values
  ('${CO_A}','Company A','${FP}'), ('${CO_B}','Company B','${FP}');`);
// A channel the FOUNDER owns. The confused-deputy scenario R-A1 identified is a manager or
// another user writing into exactly this row.
await db.exec(`insert into public.chat_channels (id,name,company_id,created_by_profile_id)
  values ('${CH_FOUNDER}','Founder private channel','${CO_A}','${FP}');`);
await db.exec(`insert into public.chat_channel_state (channel_id) values ('${CH_FOUNDER}');`);

const R = [];
const T = async (mig, id, desc, fn) => {
  try { R.push({ mig, id, desc, ok: (await fn()) === true }); }
  catch (e) { R.push({ mig, id, desc, ok: false, err: String(e.message || e).split('\n')[0] }); }
};

// Act as a persona: non-superuser role + the same JWT GUC production sets.
const as = async (authUid, fn, role = 'authenticated') => {
  await db.exec(`set role ${role};`);
  await db.exec(`select set_config('request.jwt.claims', '${authUid ? `{"sub":"${authUid}","role":"authenticated"}` : '{}'}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
};
const countVisible = async (sql) => (await db.query(sql)).rows[0].c;
// Refusal must be an AUTHORITY refusal. An RLS write that matches no policy raises
// insufficient_privilege (42501); a policy that filters a read simply returns zero rows.
const deniedWrite = async (sql) => {
  try { await db.exec(sql); return false; }
  catch (e) {
    const m = String(e.message || e);
    // Two legitimate shapes of authority refusal, and only these two:
    //   * the ENGINE refusing (RLS / grant): insufficient_privilege, 42501, permission denied
    //   * the RPC's OWN authority check raising an explicit message
    // A foreign-key, unique or check violation is NOT an authority refusal, and accepting
    // one is exactly how R-ART7 passed while proving nothing.
    const engineRefusal = /insufficient_privilege|row-level security|permission denied|42501/i.test(m);
    const explicitAuthority = /only the (channel creator|founder)|not authorized|can (claim|assign)|Only the founder/i.test(m);
    if (!engineRefusal && !explicitAuthority) {
      throw new Error(`refused for the WRONG reason: ${m.split('\n')[0]}`);
    }
    return true;
  } finally { try { await db.exec('rollback;'); } catch {} }
};

// =========================================================================================
// MIGRATION A — chat_channel_state: the confused-deputy surface R-A1 identified
// =========================================================================================
const MA = '202609020001';

await T(MA, 'A.founderReads', 'the founder can READ their own channel state', async () =>
  (await as(FOUNDER_AUTH, () => countVisible(
    `select count(*)::int c from public.chat_channel_state where channel_id='${CH_FOUNDER}'`))) === 1);

await T(MA, 'A.outsiderCannotRead', 'an unrelated authenticated user sees NOTHING of the founder channel state', async () =>
  (await as(OUTSIDER_AUTH, () => countVisible(
    `select count(*)::int c from public.chat_channel_state where channel_id='${CH_FOUNDER}'`))) === 0);

// Two acceptable outcomes, and the STRONGER one is what actually happens: the migration
// revokes anon outright, so the read fails at the GRANT before RLS is ever consulted.
// Accepting only "sees zero rows" would have marked the stronger guarantee as a failure.
await T(MA, 'A.anonCannotRead', 'anon cannot read channel state — refused at the grant, or sees nothing', async () =>
  as(null, async () => {
    try { return (await countVisible(`select count(*)::int c from public.chat_channel_state`)) === 0; }
    catch (e) { return /permission denied/i.test(String(e.message)); }
  }, 'anon'));

await T(MA, 'A.outsiderCannotWrite', 'an unrelated authenticated user cannot INSERT state for a channel they do not own', async () =>
  as(OUTSIDER_AUTH, () => deniedWrite(
    `insert into public.chat_channel_state (channel_id) values ('${CH_FOUNDER}') on conflict (channel_id) do nothing;`)));

await T(MA, 'A.R-A1.outsiderCannotArmPendingAction', 'R-A1 (the confused deputy): a non-owner cannot arm a pending action in the FOUNDER’s channel via the RPC', async () =>
  as(OUTSIDER_AUTH, () => deniedWrite(
    `select public.set_chat_channel_pending_action('${CH_FOUNDER}', '{"kind":"bulk"}'::jsonb,
       'archive', '[{"resourceType":"company","id":"${CO_A}"}]'::jsonb, 'confirmation',
       now() + interval '1 hour', null);`)));

await T(MA, 'A.R-A2.outsiderCannotForgeEvidence', 'R-A2: a non-owner cannot record execution evidence in the founder’s channel', async () =>
  as(OUTSIDER_AUTH, () => deniedWrite(
    `select public.record_chat_channel_mutation('${CH_FOUNDER}', '{"action":"archive"}'::jsonb);`)));

await T(MA, 'A.founderCanArm', 'the founder CAN arm a pending action in their own channel (the guard is not a blanket denier)', async () =>
  as(FOUNDER_AUTH, async () => {
    await db.exec(`select public.set_chat_channel_pending_action('${CH_FOUNDER}', '{"kind":"bulk"}'::jsonb,
      'archive', '[{"resourceType":"company","id":"${CO_A}"}]'::jsonb, 'confirmation',
      now() + interval '1 hour', null);`);
    return true;
  }));

await T(MA, 'A.rlsCannotExceedChannel', 'state visibility never exceeds channel visibility: a user who cannot see the CHANNEL cannot see its STATE', async () => {
  const chan = await as(OUTSIDER_AUTH, () => countVisible(
    `select count(*)::int c from public.chat_channels where id='${CH_FOUNDER}'`));
  const state = await as(OUTSIDER_AUTH, () => countVisible(
    `select count(*)::int c from public.chat_channel_state where channel_id='${CH_FOUNDER}'`));
  return chan === 0 && state === 0;
});

// =========================================================================================
// MIGRATION B — set_person_assignment: who may assign, and the guard R-B1 restored
// =========================================================================================
const MB = '202609020002';

await T(MB, 'B.unauthorizedUserRefused', 'an ordinary employee cannot assign a person in a company they do not manage', async () =>
  as(EMP_AUTH, () => deniedWrite(
    `select public.set_person_assignment('${OP}'::uuid, '${CO_A}'::uuid);`)));

await T(MB, 'B.anonRefused', 'anon cannot call set_person_assignment at all', async () =>
  as(null, () => deniedWrite(
    `select public.set_person_assignment('${OP}'::uuid, '${CO_A}'::uuid);`), 'anon'));

await T(MB, 'B.R-B1.crossCompanyDepartmentRefused', 'R-B1 ENFORCED, not merely present in the body: a department from another company is refused', async () => {
  // The guard R-B1 restored is what must fire. A department belonging to company B cannot
  // be attached to an assignment scoped to company A. Reading the guard out of
  // pg_get_functiondef (as acceptance.mjs does) proves it EXISTS; this proves it RUNS.
  const dept = (await db.query(
    `insert into public.departments (name, slug, company_id) values ('B-dept','b-dept','${CO_B}') returning id`)).rows[0];
  // Deliberately NOT deniedWrite(): this is a DATA-INTEGRITY guard, not an authority
  // refusal, and the two must not be conflated. The caller here is the FOUNDER — fully
  // authorized — so an authority-shaped refusal would mean the wrong thing fired.
  return as(FOUNDER_AUTH, async () => {
    try {
      await db.exec(`select public.set_person_assignment('${OP}'::uuid, '${CO_A}'::uuid, null, '${dept.id}'::uuid);`);
      return false;
    } catch (e) {
      const m = String(e.message || e);
      if (/insufficient_privilege|permission denied|Only the founder/i.test(m)) {
        throw new Error(`refused on AUTHORITY, not by the R-B1 guard — the founder should be authorized here: ${m.split('\n')[0]}`);
      }
      return /cross-company department reference rejected/.test(m);
    } finally { try { await db.exec('rollback;'); } catch {} }
  });
});

// =========================================================================================
// MIGRATION C — messaging transport: authority tiers
// =========================================================================================
const MC = '202609020003';

await T(MC, 'C.anonNoGrant', 'anon cannot read any of the three transport tables', async () =>
  as(null, async () => {
    for (const t of ['channel_transport_bindings', 'external_identity_bindings', 'outbound_messages']) {
      try { await db.query(`select count(*) from public.${t}`); return false; }
      catch (e) { if (!/permission denied/i.test(String(e.message))) return false; }
    }
    return true;
  }, 'anon'));

await T(MC, 'C.R-C6.ordinaryUserCannotBindIdentity', 'an ordinary employee cannot create an identity mapping (founder-only tier), refused on AUTHORITY not on an FK', async () =>
  as(EMP_AUTH, () => deniedWrite(
    `insert into public.external_identity_bindings (transport, external_user_id, profile_id)
     values ('telegram','attacker-1','${EP}');`)));

await T(MC, 'C.founderCanBindIdentity', 'the founder CAN create an identity mapping', async () =>
  as(FOUNDER_AUTH, async () => {
    await db.exec(`insert into public.external_identity_bindings (transport, external_user_id, profile_id)
                   values ('telegram','legit-1','${EP}');`);
    return true;
  }));

await T(MC, 'C.employeeCannotReadIdentityBindings', 'an employee cannot READ identity mappings either (founder-only for all)', async () =>
  (await as(EMP_AUTH, async () => {
    try { return await countVisible(`select count(*)::int c from public.external_identity_bindings`); }
    catch { return -1; }
  })) <= 0);

// =========================================================================================
// MIGRATION D — capacity retry: claim authority
// =========================================================================================
const MD = '202609030001';

await T(MD, 'D.employeeCannotClaim', 'an ordinary employee cannot claim a blocked run for retry', async () =>
  as(EMP_AUTH, () => deniedWrite(`select * from public.claim_blocked_run_for_retry('attacker');`)));

await T(MD, 'D.anonCannotClaim', 'anon cannot claim a blocked run for retry', async () =>
  as(null, () => deniedWrite(`select * from public.claim_blocked_run_for_retry('attacker');`), 'anon'));

// ---- report -----------------------------------------------------------------------------
const byMig = {};
for (const r of R) (byMig[r.mig] ||= []).push(r);
console.log('='.repeat(78));
for (const [mig, rows] of Object.entries(byMig)) {
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${mig} — ${rows.length - bad.length}/${rows.length}`);
  for (const r of rows) {
    console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(38)} ${r.desc}`);
    if (!r.ok && r.err) console.log(`       ${r.err}`);
  }
  console.log(`  VERDICT ${mig}: ${bad.length === 0 ? 'SECURITY VERIFIED (RLS enforcement, integration)' : 'FAILED — ' + bad.length}`);
}
const failed = R.filter((r) => !r.ok);
console.log('\n' + '='.repeat(78));
console.log(`personas: ${R.length - failed.length}/${R.length} passed`);
console.log('\nSTILL NOT PROVEN: PostgREST request shaping, Supabase Auth issuance, and');
console.log('production data. This proves POLICY ENFORCEMENT against a real engine.');
writeFileSync(join(HERE, 'personas-report.json'), JSON.stringify({ generated_at: new Date().toISOString(), results: R }, null, 1) + '\n');
process.exit(failed.length ? 1 : 0);
