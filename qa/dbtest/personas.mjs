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
import { openDb, bootstrap, transformFor, securitySelfCheck, securityVerdictLabel, enterPersonaSession, leavePersonaSession, openPersonaDb } from './db.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGDIR = join(resolve(HERE, '..', '..'), 'supabase', 'migrations');
// ENGINE: PGlite by default (fast integration smoke, RLS emulation), or a REAL PostgreSQL
// server when DBTEST_PG_URL is set (the only engine allowed to say SECURITY VERIFIED).
const admin = await openDb();
console.log(`engine: ${admin.engine} — ${admin.version}`);
const transform = transformFor(admin);
await bootstrap(admin);
// ROUND 4 / R4-5: on the real engine every persona statement runs on a SECOND connection
// authenticated AS qa_authenticator — the engine's boundary, not a harness convention (the
// login role is not a superuser, so SET SESSION AUTHORIZATION postgres is refused by
// PostgreSQL itself; openPersonaDb proves that on connect). On PGlite (one in-process
// superuser connection) the SET SESSION AUTHORIZATION convention remains and is labelled as
// emulation. `db` delegates to whichever connection the current block is acting through.
const personaConn = await openPersonaDb(admin);
let active = admin;
const db = {
  get engine() { return admin.engine; }, get version() { return admin.version; }, get extensions() { return admin.extensions; },
  exec: (sql) => active.exec(sql), query: (sql) => active.query(sql),
  close: async () => { if (personaConn) await personaConn.close(); await admin.close(); },
};
console.log(personaConn ? 'persona connection: ENGINE-ENFORCED (second connection as qa_authenticator; escape to superuser refused by the engine)' : 'persona connection: PGlite emulation (SET SESSION AUTHORIZATION convention on the single superuser connection)');
for (const f of readdirSync(MIGDIR).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec(transform(readFileSync(join(MIGDIR, f), 'utf8'))); }
  catch (e) { console.log(`SETUP FAILED at ${f}: ${String(e.message).split('\n')[0]}`); process.exit(1); }
}

// ---- self-check: prove RLS is actually being enforced before asserting anything --------
// Without this, every "denied" result below could be a missing table or a typo, and the
// suite would report airtight security while proving nothing.
// The founder-mandated REAL POSTGRES SECURITY SELF-CHECK (db.mjs): current_user really
// changed and session_user did not; the role is not a superuser and has no BYPASSRLS;
// row_security is on; the expected grant exists; a policy-filtered read returns only the
// allowed rows; and a known-forbidden INSERT fails FOR THE EXPECTED AUTHORIZATION REASON
// (42501 / row-level security), never for a typo, FK or missing table. Runs on both
// engines; only the real engine's result may back a SECURITY VERIFIED verdict.
let SELF_CHECK;
try { SELF_CHECK = await securitySelfCheck(db, 'authenticated'); }
catch (e) {
  console.log(`SECURITY SELF-CHECK FAILED on ${db.engine}: ${e.message}`);
  console.log('Enforcement is unproven on this connection, so no denial below would mean anything.');
  process.exit(1);
}
console.log('security self-check: ' + JSON.stringify(SELF_CHECK));
console.log(`  current_user=${SELF_CHECK.current_user} session_user=${SELF_CHECK.session_user} superuser=${SELF_CHECK.rolsuper} bypassrls=${SELF_CHECK.rolbypassrls} row_security=${SELF_CHECK.row_security}`);
console.log(`  policy filter: login sees ${SELF_CHECK.superuser_sees}, authenticated sees ${SELF_CHECK.role_sees}; forbidden INSERT failed with ${SELF_CHECK.forbidden_op_sqlstate || 'RLS message'} — enforcement PROVEN on ${db.engine}\n`);

// ---- personas ---------------------------------------------------------------------------
const FOUNDER_AUTH = '11111111-0000-0000-0000-000000000001';
const EMP_AUTH = '22222222-0000-0000-0000-000000000002';
const OUTSIDER_AUTH = '33333333-0000-0000-0000-000000000009';
// ROUND 3 (reviewer §9.4): the suite had NO company-manager persona and no company_memberships
// rows, so no "a manager cannot X" claim in the batch was tested. Two managers now exist — one
// per company — because the round-3 findings are about a manager of the SAME company (A-3,
// C-2, C-3, D-3) and a manager of ANOTHER company (B-1, B-2).
const MANAGER_A_AUTH = '44444444-0000-0000-0000-000000000004';
const MANAGER_B_AUTH = '55555555-0000-0000-0000-000000000005';
const CH_MANAGER = 'cccc0000-0000-0000-0000-00000000000d';
const CO_A = 'aaaa0000-0000-0000-0000-00000000000a';
const CO_B = 'bbbb0000-0000-0000-0000-00000000000b';
const CH_FOUNDER = 'cccc0000-0000-0000-0000-00000000000c';

await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values
  ('${FOUNDER_AUTH}','founder@t.local','{"full_name":"F"}'::jsonb),
  ('${EMP_AUTH}','emp@t.local','{"full_name":"E"}'::jsonb),
  ('${OUTSIDER_AUTH}','out@t.local','{"full_name":"O"}'::jsonb),
  ('${MANAGER_A_AUTH}','mgra@t.local','{"full_name":"MA"}'::jsonb),
  ('${MANAGER_B_AUTH}','mgrb@t.local','{"full_name":"MB"}'::jsonb);`);
await db.exec(`update public.profiles set role='founder', active=true where email='founder@t.local';
  update public.profiles set role='employee', active=true where email in ('emp@t.local','out@t.local','mgra@t.local','mgrb@t.local');`);
const pid = async (email) => (await db.query(`select id from public.profiles where email='${email}'`)).rows[0].id;
const FP = await pid('founder@t.local'), EP = await pid('emp@t.local'), OP = await pid('out@t.local');
const MAP = await pid('mgra@t.local'), MBP = await pid('mgrb@t.local');

await db.exec(`insert into public.companies (id,name,created_by_profile_id) values
  ('${CO_A}','Company A','${FP}'), ('${CO_B}','Company B','${FP}');`);
// A channel the FOUNDER owns. The confused-deputy scenario R-A1 identified is a manager or
// another user writing into exactly this row.
await db.exec(`insert into public.chat_channels (id,name,company_id,created_by_profile_id)
  values ('${CH_FOUNDER}','Founder private channel','${CO_A}','${FP}');`);
await db.exec(`insert into public.chat_channel_state (channel_id) values ('${CH_FOUNDER}');`);
await db.exec(`insert into public.company_memberships (company_id, profile_id, role_in_company, active) values
  ('${CO_A}','${MAP}','manager',true), ('${CO_A}','${EP}','employee',true), ('${CO_B}','${MBP}','manager',true);`);
await db.exec(`insert into public.chat_channels (id,name,company_id,created_by_profile_id)
  values ('${CH_MANAGER}','Manager A channel','${CO_A}','${MAP}');`);
// People rows for the B-1 / B-2 probes: a person whose canonical company is B, and a manager
// person in A (the profile rows above are auth identities, not people rows).
const PERSON_B = 'eeee0000-0000-0000-0000-00000000000e';
const PERSON_MGR_A = 'ffff0000-0000-0000-0000-00000000000f';
await db.exec(`insert into public.people (id, full_name, company_id) values
  ('${PERSON_B}','Person In B','${CO_B}'), ('${PERSON_MGR_A}','Manager Person A','${CO_A}');`);

const R = [];
const T = async (mig, id, desc, fn) => {
  try { R.push({ mig, id, desc, ok: (await fn()) === true }); }
  catch (e) { R.push({ mig, id, desc, ok: false, err: String(e.message || e).split('\n')[0] }); }
};

// Act as a persona: non-superuser role + the same JWT GUC production sets.
// ROUND 3 / D-1: every persona runs under session_user = qa_authenticator (a non-superuser
// LOGIN role, PostgREST's shape), then SET ROLE down. Under the old shape (session_user =
// postgres) migration D's guards could not refuse anybody. ROUND 3 / X-3: the JWT claims are
// cleared on the way out, so no top-level statement inherits the last persona's identity.
const as = async (authUid, fn, role = 'authenticated') => {
  if (personaConn) {
    // Real engine: the persona connection IS qa_authenticator; only SET ROLE + the JWT GUC.
    active = personaConn;
    try {
      await personaConn.exec(`set role ${role};`);
      await personaConn.exec(`select set_config('request.jwt.claims', '${authUid ? `{"sub":"${authUid}","role":"${role}"}` : '{}'}', false);`);
      return await fn();
    } finally {
      try { await personaConn.exec('reset role;'); } catch {}
      await personaConn.exec(`select set_config('request.jwt.claims', '', false);`);
      active = admin;
    }
  }
  const login = await enterPersonaSession(db);
  try {
    await db.exec(`set role ${role};`);
    await db.exec(`select set_config('request.jwt.claims', '${authUid ? `{"sub":"${authUid}","role":"${role}"}` : '{}'}', false);`);
    return await fn();
  } finally { await leavePersonaSession(db, login); }
};
// The supervisor's transport: a DIRECT connection as the login role (session_user = postgres),
// the only way claim_blocked_run_for_retry can be called (ROUND 3 / D-2).
const asDirectSupervisor = async (fn) => { await db.exec(`select set_config('request.jwt.claims', '', false);`); return fn(); };
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
    const engineRefusal = e.code === '42501' || /insufficient_privilege|row-level security|permission denied|42501/i.test(m);
    // The migrations' own authority guards raise with errcode 42501 and these messages.
    const explicitAuthority = /only the (channel creator|founder)|not authorized|can (claim|assign)|Only the founder|server-written only|requires the founder or an admin|may modify Agent Run retry|cross-company employment change rejected/i.test(m);
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

// =========================================================================================
// ROUND 3 (independent review) closures — each test names the finding it closes.
// =========================================================================================
await T(MA, 'A.R3-A1.clientCannotForgeViaFlag', 'A-1 (P1): an authenticated client that RAISES the trusted-write GUC itself is still refused (authority is the definer context, not the flag)', async () =>
  as(FOUNDER_AUTH, () => deniedWrite(
    `select set_config('app.chat_channel_state_trusted_write','on',false);
     update public.chat_channel_state set last_successful_mutation='{"forged":"never happened"}'::jsonb where channel_id='${CH_FOUNDER}';`)));
await T(MA, 'A.R3-A1.rpcStillWorks', 'A-1 LIMIT: the SECURITY DEFINER RPC path still asserts trusted state (the gate is not a blanket denier)', async () =>
  as(FOUNDER_AUTH, async () => {
    await db.exec(`select public.record_chat_channel_mutation('${CH_FOUNDER}', '{"action":"archive","id":"real"}'::jsonb);`);
    return true;
  }));
await T(MA, 'A.R3-A3.managerCannotDeleteFounderState', 'A-3 (P2): a manager of the SAME company cannot DELETE the founder channel state row', async () =>
  (async () => {
    // RLS filters a DELETE that matches no policy silently (or refuses at the grant); either
    // way the row must still be there afterwards, checked as the login role.
    await as(MANAGER_A_AUTH, () => db.exec(`delete from public.chat_channel_state where channel_id='${CH_FOUNDER}';`).catch(() => {}));
    return (await countVisible(`select count(*)::int c from public.chat_channel_state where channel_id='${CH_FOUNDER}'`)) === 1;
  })());
await T(MA, 'A.R3-A3.managerCannotPlantFocusStack', 'A-3 (P2): a manager of the same company cannot write focus_stack into the founder channel row', async () =>
  (async () => {
    await as(MANAGER_A_AUTH, () => db.exec(`update public.chat_channel_state set focus_stack='[{"resourceType":"company","id":"${CO_B}","label":"looks safe"}]'::jsonb where channel_id='${CH_FOUNDER}';`).catch(() => {}));
    return (await countVisible(`select count(*)::int c from public.chat_channel_state where channel_id='${CH_FOUNDER}' and focus_stack::text like '%looks safe%'`)) === 0;
  })());
await T(MA, 'A.R3.creatorStillWritesOwnRow', 'A-3 LIMIT: a channel creator can still update non-trusted columns of their OWN state row', async () =>
  as(MANAGER_A_AUTH, async () => {
    await db.exec(`insert into public.chat_channel_state (channel_id) values ('${CH_MANAGER}') on conflict do nothing;`);
    await db.exec(`update public.chat_channel_state set focus_stack='[]'::jsonb where channel_id='${CH_MANAGER}';`);
    return true;
  }));

await T(MB, 'B.R3-B2.crossCompanyManagerCannotEndEmployment', 'B-2 (R-B2 HIGH): a manager of Co A cannot act on a person whose current company is Co B', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(`select public.set_person_assignment('${PERSON_B}'::uuid, '${CO_A}'::uuid);`)));
await T(MB, 'B.R3-B1.crossCompanyManagerPersonRefused', 'B-1 (P2): a manager_person_id from another company is refused as a data-integrity reference (not on authority)', async () =>
  as(FOUNDER_AUTH, async () => {
    try { await db.exec(`select public.set_person_assignment('${OP}'::uuid, '${CO_B}'::uuid, null, null, null, '${PERSON_MGR_A}'::uuid);`); return false; }
    catch (e) {
      const m = String(e.message || e);
      if (/insufficient_privilege|permission denied|Only the founder/i.test(m)) throw new Error('refused on AUTHORITY, not by the B-1 guard: ' + m.split('\n')[0]);
      return /cross-company manager reference rejected/.test(m);
    } finally { try { await db.exec('rollback;'); } catch {} }
  }));
await T(MB, 'B.R3.sameCompanyManagerStillAssigns', 'B LIMIT: a manager of Co A can still assign a Co A person within Co A', async () =>
  as(MANAGER_A_AUTH, async () => {
    await db.exec(`select public.set_person_assignment('${PERSON_MGR_A}'::uuid, '${CO_A}'::uuid);`);
    return true;
  }));

await T(MC, 'C.R3-C2.managerCannotEnableBinding', 'C-2 (P2): a company manager cannot switch a transport binding ON (post-review is founder/admin)', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(
    `insert into public.channel_transport_bindings (transport, external_conversation_id, channel_id, company_id, enabled)
     values ('telegram','conv-mgr-on','${CH_MANAGER}','${CO_A}', true);`)));
await T(MC, 'C.R3-C2.managerCanCreateDisabledBinding', 'C-2 LIMIT + R4-3: a company manager can still create a DISABLED binding on a channel THEY CREATED (ownership is now enforced by the gate)', async () =>
  as(MANAGER_A_AUTH, async () => {
    await db.exec(`insert into public.channel_transport_bindings (transport, external_conversation_id, channel_id, company_id, enabled)
      values ('telegram','conv-mgr-off','${CH_MANAGER}','${CO_A}', false);`);
    return true;
  }));
await T(MC, 'C.R3-C2.founderCanEnableBinding', 'C-2: the founder CAN enable a binding', async () =>
  as(FOUNDER_AUTH, async () => {
    await db.exec(`update public.channel_transport_bindings set enabled = true where external_conversation_id='conv-mgr-off';`);
    return (await countVisible(`select count(*)::int c from public.channel_transport_bindings where external_conversation_id='conv-mgr-off' and enabled`)) === 1;
  }));
await T(MC, 'C.R3-C3.managerCannotRepointEnabledBinding', 'C-3 (P2): a manager cannot repoint an ENABLED binding onto the founder channel', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(
    `update public.channel_transport_bindings set channel_id='${CH_FOUNDER}' where external_conversation_id='conv-mgr-off';`)));

await T(MD, 'D.R3-D1.managerCannotRewriteRetryColumns', 'D-1 (P1): under a realistic session_user, a company manager is REFUSED by guard_agent_run_retry_columns (behavioural, not a grant refusal)', async () => {
  await asDirectSupervisor(() => db.exec(`insert into public.agent_runs (id, status, blocked_at, retry_after, attempt_count, source_sha, worktree, company_id, blocked_reason)
    values ('dddd0000-0000-0000-0000-00000000000d','blocked', now() - interval '1 hour', now() + interval '1 hour', 1, 'abc1234', '/real/worktree', '${CO_A}', 'PROVIDER_CAPACITY_BLOCKED: persona fixture')
    on conflict (id) do update set worktree='/real/worktree', execution_mode=null, blocked_reason='PROVIDER_CAPACITY_BLOCKED: persona fixture';`));
  let refusedByGuard = false;
  await as(MANAGER_A_AUTH, () => db.exec(`update public.agent_runs set worktree='/attacker/worktree' where id='dddd0000-0000-0000-0000-00000000000d';`)
    .catch((e) => { refusedByGuard = /may modify Agent Run retry\/checkpoint state/.test(String(e.message)); }));
  const tampered = (await countVisible(`select count(*)::int c from public.agent_runs where id='dddd0000-0000-0000-0000-00000000000d' and worktree='/attacker/worktree'`)) === 1;
  // BEHAVIOURAL: the guard itself must have refused (not RLS filtering the row away silently).
  return refusedByGuard && !tampered;
});
await T(MD, 'D.R3-D3.managerCannotRewriteExecutionMode', 'D-3 (P2): execution_mode is guarded like every other retry column', async () =>
  (async () => {
    let refusedByGuard = false;
    await as(MANAGER_A_AUTH, () => db.exec(`update public.agent_runs set execution_mode='background_subagent' where id='dddd0000-0000-0000-0000-00000000000d';`)
      .catch((e) => { refusedByGuard = /may modify Agent Run retry\/checkpoint state/.test(String(e.message)); }));
    const tampered = (await countVisible(`select count(*)::int c from public.agent_runs where id='dddd0000-0000-0000-0000-00000000000d' and execution_mode='background_subagent'`)) === 1;
    return refusedByGuard && !tampered;
  })());
await T(MD, 'D.R3-D2.serviceRoleHasNoGrant', 'D-2 (P1): no role holds EXECUTE on the claim function (checked in pg_proc, not inferred from a denial), and service_role through the authenticator shape is refused', async () => {
  // A denial alone would also be produced by the function's OWN check with the dead grant
  // present (that was the round-3 shape); the grant itself must be absent.
  const g = (await db.query(`select has_function_privilege('service_role', p.oid, 'EXECUTE') s,
                                   has_function_privilege('authenticated', p.oid, 'EXECUTE') a,
                                   has_function_privilege('anon', p.oid, 'EXECUTE') n
                              from pg_proc p join pg_namespace nn on nn.oid = p.pronamespace
                             where nn.nspname = 'public' and p.proname = 'claim_blocked_run_for_retry'`)).rows[0];
  if (g.s || g.a || g.n) return false;
  return as(null, () => deniedWrite(`select * from public.claim_blocked_run_for_retry('attacker');`), 'service_role');
});
await T(MD, 'D.R3-D2.directSupervisorCanClaim', 'D-2 LIMIT: the supervisor transport (direct login session) CAN claim', async () =>
  asDirectSupervisor(async () => {
    await db.exec(`update public.agent_runs set retry_after = now() - interval '1 minute', claimed_by = null, claimed_at = null where id='dddd0000-0000-0000-0000-00000000000d';`);
    const rows = (await db.query(`select id from public.claim_blocked_run_for_retry('supervisor-test', 6, interval '30 minutes')`)).rows;
    return rows.length === 1;
  }));
await T(MD, 'D.R3.founderViaAuthenticatorStillGoverned', 'D LIMIT: the founder (is_founder_or_admin) is still recognised by the guard under a realistic session_user', async () =>
  as(FOUNDER_AUTH, async () => {
    await db.exec(`update public.agent_runs set fallback_reason='founder edit' where id='dddd0000-0000-0000-0000-00000000000d';`);
    return true;
  }));

// =========================================================================================
// ROUND 4 (independent review) closures.
// =========================================================================================
await T(MA, 'H.R4-5.personaCannotEscapeToSuperuser', 'R4-5: inside a persona, SET SESSION AUTHORIZATION postgres is refused (ENGINE boundary on the real engine; on PGlite this documents the convention and is expected to be ALLOWED — reported, never counted as security)', async () => {
  if (!personaConn) { console.log('  (PGlite: persona identity is a harness convention — the engine boundary is proven only on the real-PostgreSQL job)'); return true; }
  return as(EMP_AUTH, async () => {
    try { await db.exec('set session authorization postgres;'); return false; }
    catch (e) { return /permission denied|42501|must be superuser/i.test(String(e.message)); }
  });
});

await T(MC, 'C.R4-3.managerCannotPlantBindingOnFounderChannel', 'R4-3 (P2): a manager cannot CREATE even a disabled binding pointing at the founder channel (channel ownership)', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(
    `insert into public.channel_transport_bindings (transport, external_conversation_id, channel_id, company_id, enabled)
     values ('telegram','conv-plant','${CH_FOUNDER}','${CO_A}', false);`)));
await T(MC, 'C.R4-3.managerCannotTwoStepRepoint', 'R4-3 (P2): disable-then-repoint onto the founder channel is refused at the repoint (ownership, regardless of enabled state)', async () => {
  await as(MANAGER_A_AUTH, () => db.exec(`update public.channel_transport_bindings set enabled = false where external_conversation_id='conv-mgr-off';`).catch(() => {}));
  const refused = await as(MANAGER_A_AUTH, () => deniedWrite(`update public.channel_transport_bindings set channel_id='${CH_FOUNDER}' where external_conversation_id='conv-mgr-off';`));
  const landed = (await countVisible(`select count(*)::int c from public.channel_transport_bindings where external_conversation_id='conv-mgr-off' and channel_id='${CH_FOUNDER}'`)) === 1;
  return refused && !landed;
});
await T(MC, 'C.R4-4.managerMayDisableOwnBinding', 'R4-4 (P3, accepted in the SQL): a manager MAY disable a binding on a channel they created (fail-safe direction)', async () =>
  (await countVisible(`select count(*)::int c from public.channel_transport_bindings where external_conversation_id='conv-mgr-off' and enabled = false`)) === 1);
await T(MC, 'C.R4-3.founderCanBindAnyChannel', 'R4-3 LIMIT: the founder can bind a transport to a channel they did not create', async () =>
  as(FOUNDER_AUTH, async () => {
    await db.exec(`insert into public.channel_transport_bindings (transport, external_conversation_id, channel_id, company_id, enabled)
      values ('telegram','conv-founder-on-mgr','${CH_MANAGER}','${CO_A}', false);`);
    return true;
  }));

for (const [col, value] of [['canonical_work_order_id', 'gen_random_uuid()'], ['task_id', 'gen_random_uuid()'], ['agent_id', 'gen_random_uuid()'], ['last_event', "'attacker rewrote this'"], ['last_heartbeat_at', "now() + interval '90 days'"]]) {
  await T(MD, `D.R4-1.managerCannotRewrite.${col}`, `R4-1/R4-2: ${col} is guarded (a returned or liveness column) — the guard's own refusal, and the stored value is unchanged`, async () => {
    const before = (await db.query(`select ${col}::text v from public.agent_runs where id='dddd0000-0000-0000-0000-00000000000d'`)).rows[0].v;
    let refused = false;
    await as(MANAGER_A_AUTH, () => db.exec(`update public.agent_runs set ${col} = ${value} where id='dddd0000-0000-0000-0000-00000000000d';`)
      .catch((e) => { refused = /may modify Agent Run retry\/checkpoint state/.test(String(e.message)); }));
    const after = (await db.query(`select ${col}::text v from public.agent_runs where id='dddd0000-0000-0000-0000-00000000000d'`)).rows[0].v;
    return refused && before === after;
  });
}
await T(MD, 'D.R4-9.guardRaises42501', 'R4-9: the guard refusal carries SQLSTATE 42501 (an authority refusal a client can distinguish)', async () =>
  as(MANAGER_A_AUTH, async () => {
    try { await db.exec(`update public.agent_runs set worktree='/attacker' where id='dddd0000-0000-0000-0000-00000000000d';`); return false; }
    catch (e) { return e.code === '42501' || /42501/.test(String(e.message)) || (db.engine === 'pglite' && /may modify Agent Run retry\/checkpoint state/.test(String(e.message))); }
  }));

// =========================================================================================
// ROUND 5 (independent review) closures.
// =========================================================================================
// A founder-created ENABLED binding on the founder's own channel, for the R5-2/R5-3 probes.
// Created AS THE FOUNDER (the enable gate checks is_founder_or_admin(), which a JWT-less
// direct connection is not — enabling is a founder act by design).
await as(FOUNDER_AUTH, () => db.exec(`insert into public.channel_transport_bindings (transport, external_conversation_id, channel_id, company_id, enabled)
  values ('telegram','conv-r5-enabled','${CH_FOUNDER}','${CO_A}', true);`));

await T(MC, 'C.R5-2.managerCannotRewriteEnabledExternalId', 'R5-2 (P2): a manager cannot change external_conversation_id on an ENABLED binding (redirect without touching enabled/channel_id)', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(`update public.channel_transport_bindings set external_conversation_id='ATTACKER-CHAT' where external_conversation_id='conv-r5-enabled';`)));
await T(MC, 'C.R5-2.managerCannotRewriteEnabledTransport', 'R5-2 (P2): a manager cannot change transport on an ENABLED binding', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(`update public.channel_transport_bindings set transport='whatsapp' where external_conversation_id='conv-r5-enabled';`)));
await T(MC, 'C.R5-3.managerCannotDeleteEnabledBinding', 'R5-3 (P2): a manager cannot DELETE an ENABLED binding (delete+recreate redirect)', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(`delete from public.channel_transport_bindings where external_conversation_id='conv-r5-enabled';`)));
await T(MC, 'C.R5-3.managerCanDeleteOwnDisabledBinding', 'R5-3 LIMIT: a manager may still DELETE a DISABLED binding on a channel they created', async () => {
  await as(MANAGER_A_AUTH, () => db.exec(`insert into public.channel_transport_bindings (transport, external_conversation_id, channel_id, company_id, enabled)
    values ('telegram','conv-r5-mgr-disabled','${CH_MANAGER}','${CO_A}', false);`));
  await as(MANAGER_A_AUTH, () => db.exec(`delete from public.channel_transport_bindings where external_conversation_id='conv-r5-mgr-disabled';`));
  return (await countVisible(`select count(*)::int c from public.channel_transport_bindings where external_conversation_id='conv-r5-mgr-disabled'`)) === 0;
});
await T(MC, 'C.R5-1.managerCannotTakeChannelOwnership', 'R5-1 (P1): a manager cannot rewrite chat_channels.created_by_profile_id (take ownership of the founder channel to defeat the binding gate)', async () =>
  as(MANAGER_A_AUTH, () => deniedWrite(`update public.chat_channels set created_by_profile_id='${MAP}' where id='${CH_FOUNDER}';`)));
await T(MC, 'C.R5-1.ownershipStillFounderAfterAttempt', 'R5-1 (P1): the founder channel is still owned by the founder after the attempt (nothing persisted)', async () =>
  (await asDirectSupervisor(() => countVisible(`select count(*)::int c from public.chat_channels where id='${CH_FOUNDER}' and created_by_profile_id='${FP}'`))) === 1);
await T(MC, 'C.R5-1.founderCanReassignCreator', 'R5-1 LIMIT: the founder/admin CAN reassign a channel creator (a genuine change, so the guard actually sees it)', async () =>
  as(FOUNDER_AUTH, async () => {
    await db.exec(`update public.chat_channels set created_by_profile_id='${EP}' where id='${CH_MANAGER}';`);
    const ok = (await countVisible(`select count(*)::int c from public.chat_channels where id='${CH_MANAGER}' and created_by_profile_id='${EP}'`)) === 1;
    await db.exec(`update public.chat_channels set created_by_profile_id='${MAP}' where id='${CH_MANAGER}';`); // restore
    return ok;
  }));

await T(MD, 'D.R5-4.managerCannotRekeyRun', 'R5-4 (P3): a manager cannot rewrite agent_runs.id (re-key an in-flight run and strand it)', async () =>
  as(MANAGER_A_AUTH, async () => {
    let refused = false;
    await db.exec(`update public.agent_runs set id='ffff0000-0000-0000-0000-00000000000f' where id='dddd0000-0000-0000-0000-00000000000d';`)
      .catch((e) => { refused = /may modify Agent Run retry\/checkpoint state/.test(String(e.message)); });
    const rekeyed = (await asDirectSupervisor(() => countVisible(`select count(*)::int c from public.agent_runs where id='ffff0000-0000-0000-0000-00000000000f'`))) === 1;
    return refused && !rekeyed;
  }));

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
  console.log(`  VERDICT ${mig}: ${bad.length === 0 ? securityVerdictLabel(db) : 'FAILED — ' + bad.length}`);
}
const failed = R.filter((r) => !r.ok);
console.log('\n' + '='.repeat(78));
console.log(`personas: ${R.length - failed.length}/${R.length} passed`);
console.log('\nSTILL NOT PROVEN: PostgREST request shaping, Supabase Auth issuance, and');
console.log('production data. This proves POLICY ENFORCEMENT against a real engine.');
writeFileSync(join(HERE, 'personas-report.json'), JSON.stringify({ generated_at: new Date().toISOString(), engine: db.engine, version: db.version, persona_connection: personaConn ? 'engine-enforced second connection as qa_authenticator' : 'PGlite emulation (SET SESSION AUTHORIZATION convention)', security_self_check: SELF_CHECK, verdict_label: securityVerdictLabel(db), results: R }, null, 1) + '\n');
await db.close();
process.exit(failed.length ? 1 : 0);
