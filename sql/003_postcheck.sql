-- ARTIFACT RELAY V0 - post-check. READ-ONLY: it changes nothing. Run it as the database owner login (postgres) after the install,
-- the bucket and the registration. It is ONE statement, so that an editor which shows only the last result shows all of it:
--   first the checks, each of which must read 'ok'; then one line per registered node.

select x.line, x.result
from (
  select 1 as part, c.n, c.check_name as line, case when c.ok then 'ok' else 'NOT OK - ' || c.why end as result
  from (values
    (1, 'the relay''s five tables exist, each with row level security on and no policy',
        (select pg_catalog.count(*) from pg_catalog.pg_class c where c.relnamespace = pg_catalog.to_regnamespace('factory_relay') and c.relkind = 'r' and c.relrowsecurity) = 5
        and not exists (select 1 from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid where c.relnamespace = pg_catalog.to_regnamespace('factory_relay')),
        'the tables are not as installed'),
    (2, 'no role but the owner holds a privilege on a relay table',
        not exists (select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(c.relacl) g
                     where c.relnamespace = pg_catalog.to_regnamespace('factory_relay') and g.grantee <> c.relowner),
        'a relay table is granted to another role'),
    (3, 'service_role can execute the entry function and its wrapper, and no other relay function',
        pg_catalog.has_function_privilege('service_role', 'public.factory_relay_rpc(jsonb)', 'execute')
        and pg_catalog.has_function_privilege('service_role', 'factory_relay.rpc(jsonb)', 'execute')
        and not exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = pg_catalog.to_regnamespace('factory_relay') and p.proname <> 'rpc'
                         and pg_catalog.has_function_privilege('service_role', p.oid, 'execute')),
        'service_role''s privileges are not as installed'),
    (4, 'anon, authenticated and factory_runner can execute nothing of the relay',
        not exists (select 1 from pg_catalog.pg_proc p cross join (values ('anon'), ('authenticated'), ('factory_runner')) r(name)
                     where (p.pronamespace = pg_catalog.to_regnamespace('factory_relay') or p.oid = pg_catalog.to_regprocedure('public.factory_relay_rpc(jsonb)'))
                       and pg_catalog.to_regrole(r.name) is not null and pg_catalog.has_function_privilege(r.name, p.oid, 'execute')),
        'an API role or factory_runner can execute a relay function'),
    (5, 'every relay function pins its search_path',
        not exists (select 1 from pg_catalog.pg_proc p
                     where (p.pronamespace = pg_catalog.to_regnamespace('factory_relay') or p.oid = pg_catalog.to_regprocedure('public.factory_relay_rpc(jsonb)'))
                       and not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=pg_catalog, pg_temp']),
        'a relay function runs under its caller''s search_path'),
    (6, 'the bucket is in place and private, and nothing opens storage.objects',
        factory_relay._bucket_state() is null,
        coalesce(factory_relay._bucket_state(), '')),
    (7, 'exactly one sender and one verifier are registered',
        (select pg_catalog.count(*) from factory_relay.nodes where active and relay_role = 'sender') = 1
        and (select pg_catalog.count(*) from factory_relay.nodes where active and relay_role = 'verifier') = 1,
        'register the sender and the verifier (sql/010)')
  ) as c(n, check_name, ok, why)
  union all
  select 2, pg_catalog.row_number() over (order by n.registered_at, n.node_id),
         'registered ' || n.relay_role || ' ' || n.node_id,
         'key ' || n.public_key || ', ' || case when n.active then 'active' else 'deactivated' end || ', ' || n.label
  from factory_relay.nodes n
) x
order by x.part, x.n;
