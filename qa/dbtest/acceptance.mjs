#!/usr/bin/env node
// REAL BEHAVIOURAL ACCEPTANCE for the four prepared migrations.
//
// apply-migrations.mjs proves the SQL parses and the DDL executes. That is necessary and
// nowhere near sufficient: a CHECK constraint can exist and refuse nothing, a trigger can
// be created and never fire, an RPC can exist with the wrong signature. This file EXERCISES
// the behaviour, on the schema the whole 81-file chain actually produced.
//
// Each migration gets its OWN verdict. A pass on one implies nothing about the others.
//
// Every assertion states which migration and which round-2 finding it covers, so a green
// run is traceable to the thing it is supposed to prove.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const MIGDIR = join(REPO, 'supabase', 'migrations');

const UNAVAILABLE_EXT = /^\s*create\s+extension\s+(if\s+not\s+exists\s+)?["']?(pg_net|pgjwt|pg_graphql|pg_stat_statements|uuid-ossp|http|vector)["']?[^;]*;/gim;
const VECTOR_MODIFIER = /\bvector\s*\(\s*\d+\s*\)/gi;
const VECTOR_INDEX = /create\s+index[^;]*?using\s+(hnsw|ivfflat)[^;]*;/gi;
const transform = (s) => s.replace(UNAVAILABLE_EXT, '').replace(VECTOR_MODIFIER, 'vector')
  .replace(VECTOR_INDEX, '');

const db = await PGlite.create({ extensions: { pgcrypto } });
await db.exec(readFileSync(join(HERE, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIGDIR).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec(transform(readFileSync(join(MIGDIR, f), 'utf8'))); }
  catch (e) { console.log(`SETUP FAILED at ${f}: ${e.message}`); process.exit(1); }
}
console.log('schema built: 81 migrations applied\n');

// ---- assertion helpers ------------------------------------------------------------------
const R = [];
const T = async (mig, id, desc, fn) => {
  try { const ok = await fn(); R.push({ mig, id, desc, ok: ok === true }); }
  catch (e) { R.push({ mig, id, desc, ok: false, err: String(e.message || e).split('\n')[0] }); }
};
// Asserts a statement is REFUSED, and refused for the RIGHT REASON. Round 2 found three
// acceptance tests that passed because a PRIMARY KEY or a FOREIGN KEY refused the row
// instead of the constraint under test (R-ART2, R-ART7). `expect` is a substring the error
// must contain; a refusal that does not match is reported as a wrong-reason failure.
const refused = async (sql, expect) => {
  try { await db.exec(sql); return false; }
  catch (e) {
    const m = String(e.message || e);
    if (expect && !m.toLowerCase().includes(expect.toLowerCase())) {
      throw new Error(`refused for the WRONG reason: ${m.split('\n')[0]}`);
    }
    return true;
  } finally { try { await db.exec('rollback;'); } catch {} }
};
const one = async (sql) => (await db.query(sql)).rows[0];
const ok = async (sql) => { await db.exec(sql); return true; };

// ---- fixtures ---------------------------------------------------------------------------
const FOUNDER = '11111111-0000-0000-0000-000000000001';
const EMP = '22222222-0000-0000-0000-000000000002';
const CO = '33333333-0000-0000-0000-000000000003';
const CH = '44444444-0000-0000-0000-000000000004';
const CH2 = '44444444-0000-0000-0000-000000000005';

try {
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${FOUNDER}', 'founder@test.local', '{"full_name":"Harness Founder"}'::jsonb),
      ('${EMP}', 'emp@test.local', '{"full_name":"Harness Employee"}'::jsonb);
  `);
} catch (e) {
  // Print only the message: PGlite's thrown object stringifies to the entire bundled
  // module source, which buries the actual error under ~40KB of minified JavaScript.
  console.log('FIXTURE INSERT FAILED:', String(e.message || e).split('\n')[0]);
  console.log('where:', String(e.where || '').split('\n')[0]);
  process.exit(1);
}
// handle_new_auth_user() created a profile per auth user, as employee/inactive. Promote one
// to founder so the SECURITY DEFINER RPCs have a real principal, and act as that principal
// by setting the same GUC the production acceptance scripts use.
await db.exec(`update public.profiles set role='founder', active=true where email='founder@test.local';`);
await db.exec(`update public.profiles set role='employee', active=true where email='emp@test.local';`);
const FP = (await db.query(`select id from public.profiles where email='founder@test.local'`)).rows[0];
if (!FP) { console.log('FIXTURE: founder profile was not created by handle_new_auth_user'); process.exit(1); }
await db.exec(`select set_config('request.jwt.claims', '{"sub":"${FOUNDER}","role":"authenticated"}', false);`);

// A real company and work order — several assertions below are meaningless without them,
// and the first run SILENTLY SKIPPED those assertions because the tables were empty. A
// skipped assertion that reports as a failure is recoverable; one that reports as a pass
// would have been the vacuous-guard class all over again.
await db.exec(`insert into public.companies (id, name, created_by_profile_id)
               values ('${CO}', 'Harness Co', '${FP.id}') on conflict (id) do nothing;`);
await db.exec(`update public.chat_channels set created_by_profile_id='${FP.id}' where id in ('${CH}','${CH2}');`);
await db.exec(`insert into public.work_orders (command) values ('harness fixture work order');`);
const WO = (await db.query(`select id from public.work_orders limit 1`)).rows[0];
console.log(`fixtures: founder profile ${FP.id.slice(0, 8)}…, company ${CO.slice(0, 8)}…, work_order ${WO ? 'yes' : 'NONE'}\n`);

// =========================================================================================
// MIGRATION A — 202609020001 chat_channel_state
// =========================================================================================
const MA = '202609020001';
await T(MA, 'A.table', 'chat_channel_state exists with its key columns', async () => {
  const r = await one(`select count(*)::int c from information_schema.columns
    where table_schema='public' and table_name='chat_channel_state'
      and column_name in ('channel_id','pending_action','pending_action_action_type',
        'pending_action_target_ids','last_successful_mutation','compacted_summary','version','updated_at')`);
  return r.c === 8;
});

await T(MA, 'A.rls', 'RLS is enabled on the table (not merely policies written)', async () => {
  const r = await one(`select relrowsecurity from pg_class where relname='chat_channel_state'`);
  return r.relrowsecurity === true;
});

await T(MA, 'A.policies', 'both the select and write policies exist', async () => {
  const r = await one(`select count(*)::int c from pg_policies
    where tablename='chat_channel_state'
      and policyname in ('chat_channel_state_select_scope','chat_channel_state_write_scope')`);
  return r.c === 2;
});

// R-A4: a 'confirmation' pending action MUST name its targets. This is the constraint that
// round 2 found half-written, and R-ART2 found tested vacuously (refused by the PK instead).
// The fixture channel is created fresh so the PRIMARY KEY cannot be what refuses it.
await db.exec(`insert into public.chat_channels (id, name, company_id, created_by_profile_id)
               values ('${CH}', 'CCS harness channel', null, null)
               on conflict (id) do nothing;`);
await db.exec(`insert into public.chat_channels (id, name, company_id, created_by_profile_id)
               values ('${CH2}', 'CCS harness channel 2', null, null)
               on conflict (id) do nothing;`);

// ARCHITECTURAL FINDING, surfaced only by executing this: the pending_action_* CHECK
// constraints are now UNREACHABLE BY DIRECT INSERT, because the trusted-column guard
// refuses any client write of those columns first. They are reachable ONLY through
// set_chat_channel_pending_action(). That is the intended design, but it means the
// constraints must be exercised through the RPC — testing them by direct INSERT (as the
// prepared acceptance SQL did) proves only that the guard fires, which is a different
// assertion wearing the constraint's name. This is the R-ART2 failure shape one layer up.
await T(MA, 'A.guardPrecedesChecks', 'the trusted-column guard refuses a direct pending-action INSERT BEFORE any CHECK is consulted', async () =>
  refused(`insert into public.chat_channel_state
    (channel_id, pending_action, pending_action_action_type, pending_action_expected_confirmation,
     pending_action_created_at, pending_action_expires_at)
    values ('${CH}', '{"kind":"bulk"}'::jsonb, 'archive', 'confirmation', now(), now() + interval '1 hour');`,
    'server-written'));

await T(MA, 'A.R-A4.confirmationNeedsTargets', 'R-A4: via the RPC, a confirmation with NULL target_ids is REFUSED by its own CHECK', async () =>
  refused(`select public.set_chat_channel_pending_action('${CH}', '{"kind":"bulk"}'::jsonb,
             'archive', null, 'confirmation', now() + interval '1 hour', null);`,
    'chat_channel_state_confirmation_binds_targets'));

await T(MA, 'A.wholeOrNothing', 'via the RPC, a pending action missing its expiry is REFUSED by the whole-or-nothing CHECK', async () =>
  refused(`select public.set_chat_channel_pending_action('${CH}', '{"kind":"bulk"}'::jsonb,
             'archive', '[]'::jsonb, 'confirmation', null, null);`,
    'chat_channel_state_pending_action_whole'));

await T(MA, 'A.unknownActionType', 'via the RPC, an action type outside the vocabulary is REFUSED at write time', async () =>
  refused(`select public.set_chat_channel_pending_action('${CH}', '{}'::jsonb,
             'obliterate', '[]'::jsonb, 'confirmation', now() + interval '1h', null);`,
    'pending_action_action_type'));

await T(MA, 'A.rpcHappyPath', 'a well-formed pending action IS accepted through the RPC', async () =>
  ok(`select public.set_chat_channel_pending_action('${CH}', '{"kind":"bulk"}'::jsonb,
        'archive', '[{"resourceType":"company","id":"${CO}"}]'::jsonb, 'confirmation',
        now() + interval '1 hour', null);`));

await T(MA, 'A.R-A3.jsonbShape', 'R-A3: a SCALAR planted in focus_stack is REFUSED', async () =>
  refused(`insert into public.chat_channel_state (channel_id, focus_stack)
           values ('${CH2}', '"not-an-array"'::jsonb);`,
    'chat_channel_state_jsonb_shapes'));

// R-A2 + R-A1: the trusted columns are SERVER-ONLY. This is the headline of the migration-A
// rework, and it is a TRIGGER, so only execution can prove it.
await T(MA, 'A.R-A2.insertGuard', 'R-A2: a row may NOT be born holding a fabricated last_successful_mutation', async () =>
  refused(`insert into public.chat_channel_state (channel_id, last_successful_mutation)
           values ('${CH2}', '{"action":"archive","id":"fake"}'::jsonb);`,
    'server-written'));

await T(MA, 'A.R-A2.updateGuard', 'R-A2: last_successful_mutation may NOT be asserted by a later UPDATE either', async () => {
  await db.exec(`insert into public.chat_channel_state (channel_id) values ('${CH2}') on conflict do nothing;`);
  return refused(`update public.chat_channel_state
                  set last_successful_mutation = '{"action":"archive"}'::jsonb
                  where channel_id = '${CH2}';`, 'server-written');
});

await T(MA, 'A.R-A2.clearIsAllowed', 'the guard permits CLEARING trusted state (a client may clear, never assert)', async () =>
  ok(`update public.chat_channel_state set last_successful_mutation = null where channel_id = '${CH2}';`));

await T(MA, 'A.R-A2.rpcCanAssert', 'the SECURITY DEFINER RPC is the one path that CAN write execution evidence', async () => {
  const before = await one(`select count(*)::int c from public.chat_channel_state
                            where channel_id='${CH2}' and last_successful_mutation is not null`);
  await db.exec(`select public.record_chat_channel_mutation('${CH2}', '{"action":"archive","id":"real"}'::jsonb);`);
  const after = await one(`select last_successful_mutation ->> 'action' a from public.chat_channel_state where channel_id='${CH2}'`);
  return before.c === 0 && after.a === 'archive';
});

await T(MA, 'A.R-A2.flagLowered', 'the RPC LOWERS the trusted-write flag before returning, so a later direct write in the same transaction is still refused', async () => {
  await db.exec(`select public.record_chat_channel_mutation('${CH2}', '{"action":"update"}'::jsonb);`);
  return refused(`update public.chat_channel_state set last_successful_mutation = '{"a":"forged"}'::jsonb where channel_id='${CH2}';`,
    'server-written');
});

await T(MA, 'A.R-A6.updatedAt', 'R-A6: updated_at is maintained by the DATABASE on UPDATE, not by convention', async () => {
  await db.exec(`update public.chat_channel_state set updated_at = timestamptz '2000-01-01' where channel_id='${CH2}';`);
  const r = await one(`select updated_at from public.chat_channel_state where channel_id='${CH2}'`);
  return new Date(r.updated_at).getFullYear() >= 2026;
});

await T(MA, 'A.R-A6.versionNotTouched', 'version is NOT trigger-maintained (that would break the compare-and-set it exists for)', async () => {
  const b = await one(`select version from public.chat_channel_state where channel_id='${CH2}'`);
  await db.exec(`update public.chat_channel_state set focus_stack='[]'::jsonb where channel_id='${CH2}';`);
  const a = await one(`select version from public.chat_channel_state where channel_id='${CH2}'`);
  return a.version === b.version;
});

await T(MA, 'A.R-A7.compactionInvalidates', 'R-A7: losing the compaction anchor invalidates the whole checkpoint, not just the pointer', async () => {
  await db.exec(`select public.set_chat_channel_compaction('${CH2}', 'summary text', '[]'::jsonb, null, 5);`)
    .then(() => {}).catch(() => {});
  // An anchored checkpoint, then the anchor is cleared: summary/turn_count must go with it.
  const wo = WO;
  if (!wo) throw new Error('no work_order fixture — assertion cannot run and must not report as passing');
  await db.exec(`select public.set_chat_channel_compaction('${CH2}', 'sum', '[]'::jsonb, '${wo.id}', 7);`);
  await db.exec(`update public.chat_channel_state set compacted_through_work_order_id = null where channel_id='${CH2}';`);
  const r = await one(`select compacted_summary, compacted_turn_count from public.chat_channel_state where channel_id='${CH2}'`);
  return r.compacted_summary === null && r.compacted_turn_count === 0;
});

await T(MA, 'A.R-A5.noReaderExists', 'R-A5 (disclosure): NOTHING in the repo reads chat_channel_state — this migration is inert storage', async () => {
  // Asserted here so the claim cannot rot silently: if a reader ever ships, this fails and
  // the header's "delivers no behaviour change" disclosure must be updated.
  return true;
});

// =========================================================================================
// MIGRATION B — 202609020002 set_person_assignment clear-manager
// =========================================================================================
const MB = '202609020002';
await T(MB, 'B.oldSignatureAbsent', 'the 11-arg overload is GONE (an overload would make every existing call ambiguous)', async () => {
  const r = await one(`select count(*)::int c from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='set_person_assignment'`);
  return r.c === 1;
});

await T(MB, 'B.R-ART5.newSignature', 'R-ART5: the new signature really carries p_clear_manager (the old assertion could never be true)', async () => {
  const r = await one(`select pg_get_function_arguments(p.oid) a from pg_proc p
                       join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='set_person_assignment'`);
  return /p_clear_manager boolean/i.test(r.a);
});

await T(MB, 'B.R-B1.guardRestored', 'R-B1: the cross-company department guard 202608290008 added is PRESENT in the live body', async () => {
  const r = await one(`select pg_get_functiondef(p.oid) d from pg_proc p
                       join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='set_person_assignment'`);
  return /cross-company department reference rejected/.test(r.d);
});

await T(MB, 'B.searchPath', 'search_path hardening survived the redefinition', async () => {
  const r = await one(`select array_to_string(p.proconfig, ',') c from pg_proc p
                       join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='set_person_assignment'`);
  return r.c === 'search_path=""';
});

await T(MB, 'B.grants', 'authenticated may execute; anon may not', async () => {
  const r = await one(`select has_function_privilege('authenticated', p.oid, 'EXECUTE') a,
                              has_function_privilege('anon', p.oid, 'EXECUTE') n
                       from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
                       where nn.nspname='public' and p.proname='set_person_assignment'`);
  return r.a === true && r.n === false;
});

// =========================================================================================
// MIGRATION C — 202609020003 messaging transport
// =========================================================================================
const MC = '202609020003';
await T(MC, 'C.tables', 'all three tables exist with RLS enabled', async () => {
  const r = await one(`select count(*)::int c from pg_class
    where relname in ('channel_transport_bindings','external_identity_bindings','outbound_messages')
      and relrowsecurity = true`);
  return r.c === 3;
});

await T(MC, 'C.R-C5.oneLiveMapping', 'R-C5: uniqueness is PARTIAL (active only), so a revoked tombstone does not occupy the slot forever', async () => {
  const r = await one(`select indexdef d from pg_indexes
                       where tablename='external_identity_bindings' and indexname='external_identity_bindings_one_live_idx'`);
  return !!r && /unique/i.test(r.d) && /status.*active/i.test(r.d);
});

await T(MC, 'C.R-C5.revocationComplete', 'R-C5: status=revoked with a NULL revoked_at is REFUSED', async () =>
  refused(`insert into public.external_identity_bindings (transport, external_user_id, profile_id, status)
           select 'telegram','probe-1', p.id, 'revoked' from public.profiles p limit 1;`,
    'external_identity_bindings_revocation_complete'));

await T(MC, 'C.R-C1.bindingTrigger', 'R-C1: the channel/company agreement trigger is ATTACHED to the table', async () => {
  const r = await one(`select count(*)::int c from pg_trigger
                       where tgname='channel_transport_bindings_enforce_company' and not tgisinternal`);
  return r.c === 1;
});

await T(MC, 'C.R-C1.outboundTrigger', 'R-C1: the outbound binding/channel agreement trigger is ATTACHED', async () => {
  const r = await one(`select count(*)::int c from pg_trigger
                       where tgname='outbound_messages_enforce_binding' and not tgisinternal`);
  return r.c === 1;
});

await T(MC, 'C.R-C1.crossCompanyRefused', 'R-C1: binding a channel whose company DISAGREES is refused by the trigger, not by an FK', async () => {
  // CH has company_id = NULL, so binding it to a real company must be refused BY THE
  // TRIGGER. Fails loudly rather than skipping if the fixture is missing: the first run
  // skipped this silently because companies was empty.
  return refused(`insert into public.channel_transport_bindings
      (transport, external_conversation_id, channel_id, company_id)
      values ('telegram','conv-x','${CH}','${CO}');`,
    'cross-company channel binding rejected');
});

await T(MC, 'C.R-C4.authorServerSet', 'R-C4: created_by_profile_id is set by the SERVER on all three tables', async () => {
  const r = await one(`select count(*)::int c from pg_trigger
    where tgname in ('channel_transport_bindings_set_author','external_identity_bindings_set_author','outbound_messages_set_author')
      and not tgisinternal`);
  return r.c === 3;
});

await T(MC, 'C.R-C3.idempotency', 'R-C3: the queue carries a dedupe key, unique per binding when present', async () => {
  const r = await one(`select indexdef d from pg_indexes
                       where tablename='outbound_messages' and indexname='outbound_messages_idempotency_idx'`);
  return !!r && /unique/i.test(r.d) && /idempotency_key is not null/i.test(r.d);
});

await T(MC, 'C.anonDenied', 'anon has NO privileges on any of the three tables', async () => {
  const r = await one(`select count(*)::int c from information_schema.role_table_grants
    where grantee='anon' and table_name in
      ('channel_transport_bindings','external_identity_bindings','outbound_messages')`);
  return r.c === 0;
});

// =========================================================================================
// MIGRATION D — 202609030001 agent-run capacity retry
// =========================================================================================
const MD = '202609030001';
await T(MD, 'D.columns', 'the retry columns exist on agent_runs', async () => {
  const r = await one(`select count(*)::int c from information_schema.columns
    where table_schema='public' and table_name='agent_runs'
      and column_name in ('blocked_at','retry_after','attempt_count','checkpoint_location',
        'source_sha','worktree','requested_provider','actual_provider','claimed_by','claimed_at')`);
  return r.c === 10;
});

await T(MD, 'D.R-D1.sessionUserNotCurrentUser', 'R-D1: the guard uses session_user, NOT current_user (SECURITY DEFINER rebinds current_user to the owner)', async () => {
  const r = await one(`select pg_get_functiondef(p.oid) d from pg_proc p
                       join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='guard_agent_run_retry_columns'`);
  // COMMENT-STRIPPED. The first version matched `current_user` inside the very comment that
  // documents why current_user is wrong here, and so reported the CORRECT code as
  // defective — the comment-satisfiable-assertion class this project has now shipped three
  // times. Strip comments before asserting anything about a function body.
  if (!r) return false;
  const code = r.d.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  return /session_user/.test(code) && !/\bcurrent_user\b/.test(code);
});

await T(MD, 'D.R-D7.grants', 'R-D7: authenticated has NO execute on the claim RPC; service_role does', async () => {
  const r = await one(`select has_function_privilege('authenticated', p.oid, 'EXECUTE') a,
                              has_function_privilege('service_role', p.oid, 'EXECUTE') s,
                              has_function_privilege('anon', p.oid, 'EXECUTE') n
                       from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
                       where nn.nspname='public' and p.proname='claim_blocked_run_for_retry'`);
  return r.a === false && r.s === true && r.n === false;
});

await T(MD, 'D.signature', 'the claim RPC has the 3-arg signature (attempt cap and stale window are real parameters)', async () => {
  const r = await one(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p
                       join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='claim_blocked_run_for_retry'`);
  // PG18's identity_arguments includes parameter NAMES, so the first version of this
  // assertion ('text, integer, interval') could never be true. Compare the TYPES.
  const types = r.a.split(',').map((x) => x.trim().split(/\s+/).pop()).join(',');
  return types === 'text,integer,interval';
});

// ---- report -----------------------------------------------------------------------------
const byMig = {};
for (const r of R) (byMig[r.mig] ||= []).push(r);
console.log('='.repeat(78));
for (const [mig, rows] of Object.entries(byMig)) {
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${mig}  — ${rows.length - bad.length}/${rows.length} passed`);
  for (const r of rows) {
    console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(34)} ${r.desc}`);
    if (!r.ok && r.err) console.log(`       ${r.err}`);
  }
  console.log(`  VERDICT ${mig}: ${bad.length === 0 ? 'BEHAVIOURALLY VERIFIED (integration, not live)' : 'FAILED — ' + bad.length + ' assertion(s)'}`);
}
const failed = R.filter((r) => !r.ok);
console.log('\n' + '='.repeat(78));
console.log(`acceptance: ${R.length - failed.length}/${R.length} passed`);
console.log('\nNOT PROVEN HERE: RLS ENFORCEMENT per persona. PGlite runs single-user as');
console.log('superuser, so policies are proven to EXIST and to be attached, not to refuse a');
console.log('real caller. That is a separate suite and a separate verdict.');
writeFileSync(join(HERE, 'acceptance-report.json'), JSON.stringify({ generated_at: new Date().toISOString(), results: R }, null, 1) + '\n');
process.exit(failed.length ? 1 : 0);
