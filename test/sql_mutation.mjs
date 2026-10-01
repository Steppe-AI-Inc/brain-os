// MUTATION PROOF for the SQL acceptance suite: each mutant breaks one rule of sql/001 on purpose; the suite must go red for it.
// A mutant that cannot be applied, or that the suite does not notice, fails this proof.
//   RELAY_TEST_MODULES=<node_modules> node test/sql_mutation.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPlane, ROOT } from './plane.mjs';
import { runSuite, resetPlane } from './sql_acceptance.mjs';

const SQL = readFileSync(join(ROOT, 'sql/001_artifact_relay_v0.sql'), 'utf8').replace(/\r\n/g, '\n');

class NotApplied extends Error {}
/** replace the n-th (default: the only) occurrence of `find` */
const swap = (sql, find, repl, n = null) => {
  const parts = sql.split(find);
  if (n === null && parts.length !== 2) throw new NotApplied(`expected exactly one "${find.slice(0, 60)}", found ${parts.length - 1}`);
  if (n !== null && parts.length - 1 < n) throw new NotApplied(`no occurrence ${n} of "${find.slice(0, 60)}"`);
  const i = n === null ? 1 : n;
  return parts.slice(0, i).join(find) + repl + parts.slice(i).join(find);
};
const noPrivilegeCheck = (sql) => swap(sql, `if v is not null then raise exception 'artifact relay: unexpected privilege`, `if false then raise exception 'artifact relay: unexpected privilege`);
const noRlsCheck = (sql) => swap(sql, `and c.relkind = 'r' and not c.relrowsecurity)`, `and c.relkind = 'r' and false)`);
const RECIPIENT_ONLY = `if n.relay_role <> 'verifier' or a.recipient_node_id <> n.node_id then return factory_relay._refusal('not_the_recipient', 403); end if;`;

const MUTANTS = [
  ['M01', 'the wrapper stays executable by anon and authenticated (the install\'s own check must stop it)',
    (s) => swap(s, 'revoke all on function public.factory_relay_rpc(jsonb) from anon, authenticated;\n', '')],
  ['M02', 'the wrapper stays executable by anon and authenticated, and the install does not check',
    (s) => noPrivilegeCheck(swap(s, 'revoke all on function public.factory_relay_rpc(jsonb) from anon, authenticated;\n', ''))],
  ['M03', 'the internal functions stay executable by PUBLIC',
    (s) => noPrivilegeCheck(swap(s, 'revoke all on all functions in schema factory_relay from public;\n', ''))],
  ['M04', 'the sender names the recipient',
    (s) => swap(s, `select x.node_id into v_recipient from factory_relay.nodes x where x.relay_role = 'verifier' and x.active;`,
      `select coalesce(v_payload->>'recipient', x.node_id) into v_recipient from factory_relay.nodes x where x.relay_role = 'verifier' and x.active;`)],
  ['M05', 'any registered node downloads', (s) => swap(s, RECIPIENT_ONLY, '', 1)],
  ['M06', 'any registered node writes a receipt', (s) => swap(s, RECIPIENT_ONLY, '', 2)],
  ['M07', 'VERIFIED without DELIVERED',
    (s) => swap(s, `if not ((v_from = 'UPLOADED' and v_state = 'DELIVERED')`, `if not ((v_from = 'UPLOADED' and v_state in ('DELIVERED', 'VERIFIED'))`)],
  ['M08', 'a replayed request is accepted', (s) => swap(s, `return factory_relay._refusal('replayed_request', 409);`, 'null;')],
  ['M09', 'a public bucket is accepted', (s) => swap(s, `  if v_public is distinct from false then return 'bucket_not_private'; end if;\n`, '')],
  ['M10', 'a storage policy is ignored',
    (s) => swap(s, `  if exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = 'storage.objects'::regclass) then return 'storage_policy_present'; end if;\n`, '')],
  ['M11', 'receipts can be updated and deleted',
    (s) => swap(s, `create trigger receipts_immutable before update or delete on factory_relay.receipts\n  for each row execute function factory_relay._immutable();\n`, '')],
  ['M12', 'an artifact\'s binding can be rewritten',
    (s) => swap(s, `create trigger artifacts_binding_fixed before update on factory_relay.artifacts\n  for each row execute function factory_relay._artifact_binding_fixed();\n`, '')],
  ['M13', 'no time window on a request', (s) => swap(s, '> 300000 then', '> 3000000000 then')],
  ['M14', 'another node learns that an artifact exists',
    (s) => swap(s, 'if not found or (a.sender_node_id <> n.node_id and a.recipient_node_id <> n.node_id) then', 'if not found then')],
  ['M15', 'UPLOADED after the first file', (s) => swap(s, `if v_left = 0 and a.delivery_state = 'CREATED' then`, `if a.delivery_state = 'CREATED' then`)],
  ['M16', 'a preserved artifact expires',
    (s) => swap(s, 'where x.expires_at <= pg_catalog.now() and not x.preserved_as_evidence and x.purged_at is null', 'where x.expires_at <= pg_catalog.now() and x.purged_at is null')],
  ['M17', 'an unexpired artifact can be recorded as purged',
    (s) => swap(s, 'if found and a.purged_at is null and a.expires_at <= pg_catalog.now() and not a.preserved_as_evidence then', 'if found and a.purged_at is null and not a.preserved_as_evidence then')],
  ['M18', 'a node the Factory does not know can be registered',
    (s) => swap(s, `    if v_node is null then raise exception 'artifact relay: % is not a node of this Factory plane', p_node_id; end if;\n`, '')],
  ['M19', 'the key the function authenticated with is not compared with the registered one',
    (s) => swap(s, 'where x.node_id = v_node and x.public_key = v_key and x.active;', 'where x.node_id = v_node and x.active;')],
  ['M20', 'a revoked node is still accepted',
    (s) => swap(s, 'where x.node_id = v_node and x.public_key = v_key and x.active;', 'where x.node_id = v_node and x.public_key = v_key order by x.active limit 1;')],
  ['M21', 'nothing expires', (s) => swap(s, 'v_purge := factory_relay._expire_due();', `v_purge := '[]'::jsonb;`)],
  ['M22', 'the verifier creates artifacts', (s) => swap(s, `    if n.relay_role <> 'sender' then return factory_relay._refusal('not_the_sender', 403); end if;\n`, '')],
  ['M23', 'any registered node uploads',
    (s) => swap(s, `if n.relay_role <> 'sender' or a.sender_node_id <> n.node_id then return factory_relay._refusal('not_the_sender', 403); end if;`, '')],
  ['M24', 'a stored object can be stored again', (s) => swap(s, `        if f.stored_at is not null then return factory_relay._refusal('already_stored', 409); end if;\n`, '')],
  ['M25', 'an upload can be finished twice', (s) => swap(s, `  if rq.finished_at is not null then return factory_relay._refusal('already_finished', 409); end if;\n`, '')],
  ['M26', 'the inbox shows an artifact that is not uploaded',
    (s) => swap(s, `where x.recipient_node_id = n.node_id and x.delivery_state in ('UPLOADED', 'DELIVERED', 'VERIFIED')`,
      `where x.recipient_node_id = n.node_id and x.delivery_state in ('CREATED', 'UPLOADED', 'DELIVERED', 'VERIFIED')`)],
  ['M27', 'a half-uploaded artifact can be downloaded',
    (s) => swap(s, `if a.delivery_state not in ('UPLOADED', 'DELIVERED', 'VERIFIED') or a.purged_at is not null`,
      `if a.delivery_state not in ('CREATED', 'UPLOADED', 'DELIVERED', 'VERIFIED') or a.purged_at is not null`)],
  ['M28', 'row level security is off on receipts (the install\'s own check must stop it)',
    (s) => swap(s, 'alter table factory_relay.receipts       enable row level security;\n', '')],
  ['M29', 'row level security is off on receipts, and the install does not check',
    (s) => noRlsCheck(swap(s, 'alter table factory_relay.receipts       enable row level security;\n', ''))],
  ['M30', 'service_role reads the relay\'s tables',
    (s) => noPrivilegeCheck(swap(s, 'grant execute on function factory_relay.rpc(jsonb) to service_role;\n',
      'grant execute on function factory_relay.rpc(jsonb) to service_role;\ngrant select on all tables in schema factory_relay to service_role;\n'))],
  ['M31', 'two active senders', (s) => swap(s, 'create unique index nodes_one_active_per_role on factory_relay.nodes (relay_role) where active;\n', '')],
  ['M32', 'a deactivated registration is reactivated', (s) => swap(s, 'if old.active is false and new.active then', 'if false then')],
  ['M33', 'a registration can be rewritten',
    (s) => swap(s, `create trigger nodes_identity_fixed before update or delete on factory_relay.nodes\n  for each row execute function factory_relay._node_identity_fixed();\n`, '')],
  ['M34', 'a declared file can be rewritten',
    (s) => swap(s, `create trigger artifact_files_declaration_fixed before update on factory_relay.artifact_files\n  for each row execute function factory_relay._file_declaration_fixed();\n`, '')],
  ['M35', 'an upload into an artifact that is already UPLOADED',
    (s) => swap(s, `        if a.delivery_state <> 'CREATED' then return factory_relay._refusal('not_uploadable', 409, a.delivery_state); end if;\n`, '')],
  ['M36', 'the bucket is not checked at all',
    (s) => { const x = `  if v_bucket is not null then return factory_relay._refusal(v_bucket, 503); end if;\n`; if (s.split(x).length !== 3) throw new NotApplied('expected the bucket refusal twice'); return s.split(x).join(''); }],
  ['M37', 'a conflicting declaration is accepted as the same artifact', (s) => swap(s, `return factory_relay._refusal('conflicting_artifact', 409);`, 'null;')],
  ['M38', 'a refused archive can never be sent again', (s) => swap(s, `\n  where delivery_state not in ('REFUSED', 'EXPIRED');`, ';')],
  ['M39', 'a receipt is not chained to the one before it', (s) => swap(s, `concat_ws('|', v_prev, p_artifact::text`, `concat_ws('|', pg_catalog.repeat('0', 64), p_artifact::text`)],
  ['M40', 'a receipt does not keep the signed request',
    (s) => swap(s, 'case when p_body is not null and pg_catalog.length(p_body) <= 8192 then p_body end', 'null::text')],
  ['M41', 'a file under any name is accepted', (s) => swap(s, `when 'signature' then v_name || '.sha256.sig' end)`, `when 'signature' then v_file->>'name' end)`)],
  ['M42', 'retention is not bounded', (s) => swap(s, `if v_days not between 1 and 30 then`, `if v_days not between 0 and 99 then`)],
  ['M50', 'a retention that is there but empty skips the refusal',
    (s) => swap(s, `if (v_payload->>'retention_days') is null or (v_payload->>'retention_days') !~ '^[0-9]{1,2}$' then`, `if (v_payload->>'retention_days') !~ '^[0-9]{1,2}$' then`)],
  ['M52', 'the install runs under the search_path of the login that applies it',
    (s) => swap(s, `set local search_path = pg_catalog, pg_temp;\n`, '')],
  ['M53', 'no relay function pins its search_path (the install\'s own check must stop it)',
    (s) => { if (s.split('set search_path = pg_catalog, pg_temp\n').length < 15) throw new NotApplied('the pinned clause was not found on every function'); return s.split('set search_path = pg_catalog, pg_temp\n').join('\n'); }],
  ['M54', 'no relay function pins its search_path, and the install does not check',
    (s) => { if (s.split('set search_path = pg_catalog, pg_temp\n').length < 15) throw new NotApplied('the pinned clause was not found on every function');
      return swap(s.split('set search_path = pg_catalog, pg_temp\n').join('\n'), `and not coalesce(pr.proconfig, '{}'::text[]) @> array['search_path=pg_catalog, pg_temp']) then`, 'and false) then'); }],
  ['M51', 'a file may be larger than the limit', (s) => swap(s, `if (v_file->>'size')::integer not between 1 and 1048576 then return factory_relay._refusal('bad_request', 400, 'files'); end if;`, '')],
  ['M43', 'one node holds both roles', (s) => swap(s, 'create unique index nodes_one_active_per_node on factory_relay.nodes (node_id) where active;\n', '')],
  ['M44', 'a purged artifact can be preserved', (s) => swap(s, 'set preserved_as_evidence = p_keep where artifact_id = p_artifact and purged_at is null;', 'set preserved_as_evidence = p_keep where artifact_id = p_artifact;')],
  ['M45', 'the install does not check that it can see the bucket table',
    (s) => swap(s, `or not pg_catalog.has_table_privilege(current_user, 'storage.buckets', 'select') then`, 'then')],
  ['M46', 'row level security switched off on storage.objects is ignored',
    (s) => swap(s, `  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'storage.objects'::regclass) then return 'storage_rls_off'; end if;\n`, '')],
  ['M47', 'a missing bucket is not told apart', (s) => swap(s, `  if not found then return 'bucket_missing'; end if;\n`, '')],
  ['M48', 'a later request releases an earlier nonce',
    (s) => swap(s, `delete from factory_relay.requests q where q.at < pg_catalog.now() - interval '1 day' and`, `delete from factory_relay.requests q where q.request_id <> rq.request_id and`)],
  ['M49', 'the bucket is checked before the node, so a caller that is not a registered node learns the state of the relay',
    (s) => swap(s, `  if p->>'fn' = 'begin' then return factory_relay._begin(p); end if;`,
      `  v_bucket := factory_relay._bucket_state();\n  if v_bucket is not null and p->>'fn' = 'begin' then return factory_relay._refusal(v_bucket, 503); end if;\n  if p->>'fn' = 'begin' then return factory_relay._begin(p); end if;`)],
  ['M55', 'a refused request of a revoked node is still recorded',
    (s) => swap(swap(s, `  select * into n from factory_relay.nodes x where x.node_id = v_node and x.public_key = v_key and x.active;
  if not found then return factory_relay._refusal('not_authenticated', 401); end if;`, `  select * into n from factory_relay.nodes x where x.node_id = v_node and x.public_key = v_key;
  if not found then return factory_relay._refusal('not_authenticated', 401); end if;`),
      `  delete from factory_relay.requests q where q.at <`, `  if not n.active then return factory_relay._refusal('not_authenticated', 401); end if;\n  delete from factory_relay.requests q where q.at <`)],
];

const only = process.argv.slice(2).filter((a) => /^M\d+$/.test(a));
const plane = await startPlane({ bucket: 'none' });
const tally = { KILLED: 0, SURVIVED: 0, BROKEN: 0, AMBIGUOUS: 0, 'NOT APPLIED': 0 };
let controlOk = false, judged = 0;
/** a mutated install that the database cannot even read is not a judgement */
const UNREADABLE = /^(42601|42P01|42703|42883|42704|42804|42P02) /;
const verdictOf = (rows) => {
  const red = rows.filter((r) => !r.ok);
  if (red.length === 0) return rows.length ? { verdict: 'SURVIVED', reason: 'every row stayed OK' } : { verdict: 'AMBIGUOUS', reason: 'the suite judged no row' };
  if (red.some((r) => r.id === 'S01') && UNREADABLE.test(red.find((r) => r.id === 'S01').detail)) return { verdict: 'BROKEN', reason: 'the mutated install is not SQL the database can read: ' + red.find((r) => r.id === 'S01').detail.slice(0, 160) };
  const by = [...new Set(red.map((r) => r.id))];
  return { verdict: 'KILLED', reason: 'by ' + by.slice(0, 4).join(' ') + (by.length > 4 ? ' +' + (by.length - 4) : '') };
};
try {
  try {
    const control = await runSuite(plane, { install: SQL });
    const red = control.filter((r) => !r.ok);
    controlOk = control.length > 0 && red.length === 0;
    console.log((controlOk ? 'OK   ' : 'FAIL ') + 'control: the unmutated install is ' + (control.length - red.length) + '/' + control.length + (red.length ? ' - ' + red.map((r) => r.id).join(' ') : ''));
  } catch (e) { console.log('FAIL control: the suite itself stopped - ' + e.message); }
  for (const [id, what, edit] of MUTANTS) {
    if (only.length && !only.includes(id)) continue;
    judged++;
    let v;
    try {
      let mutated = null;
      try { mutated = edit(SQL); } catch (e) { if (!(e instanceof NotApplied)) throw e; v = { verdict: 'NOT APPLIED', reason: e.message }; }
      if (mutated !== null) {
        try { v = verdictOf(await runSuite(plane, { install: mutated })); }
        catch (e) { v = { verdict: 'AMBIGUOUS', reason: 'the suite itself stopped, with no row to judge by: ' + e.message }; }
      }
    } catch (e) { v = { verdict: 'AMBIGUOUS', reason: 'the runner itself failed on this mutant: ' + (e?.message ?? e) }; }
    try { await plane.owner.query('rollback'); } catch { /* no transaction */ }
    try { await resetPlane(plane); } catch (e) { console.log('FAIL the plane could not be reset after ' + id + ' - ' + e.message); controlOk = false; }
    tally[v.verdict]++;
    console.log(v.verdict === 'KILLED' ? `OK   ${id} killed - ${what} - ${v.reason}` : `FAIL ${id} ${v.verdict} - ${what} - ${v.reason}`);
  }
} finally { await plane.stop(); }
const bad = judged - tally.KILLED + (controlOk ? 0 : 1);
console.log(`\nartifact relay sql mutation proof: ${tally.KILLED}/${judged} killed` + (bad ? `; NOT KILLED: survived ${tally.SURVIVED}, broken ${tally.BROKEN}, ambiguous ${tally.AMBIGUOUS}, not applied ${tally['NOT APPLIED']}` + (controlOk ? '' : ', and the control did not pass') : ''));
process.exit(bad ? 1 : 0);
