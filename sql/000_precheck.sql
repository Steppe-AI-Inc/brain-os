-- ARTIFACT RELAY V0 - pre-check. READ-ONLY: it changes nothing. Run it as the database owner login (postgres) before sql/001.
-- It is ONE statement, so that an editor which shows only the last result shows all of it:
--   first the checks, each of which must read 'ok';
--   then one line per Factory node, so that the two node ids to register can be read from the Factory's own table.

select x.line, x.result
from (
  select 1 as part, c.n, c.check_name as line, case when c.ok then 'ok' else 'NOT OK - ' || c.why end as result
  from (values
    (1, 'the login is the database owner login, not a superuser',
        current_user = 'postgres' and not (select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user),
        'run this as postgres (the SQL editor does)'),
    (2, 'the relay is not installed yet',
        pg_catalog.to_regnamespace('factory_relay') is null and pg_catalog.to_regprocedure('public.factory_relay_rpc(jsonb)') is null,
        'schema factory_relay or public.factory_relay_rpc exists already'),
    (3, 'the API roles exist',
        pg_catalog.to_regrole('service_role') is not null and pg_catalog.to_regrole('anon') is not null and pg_catalog.to_regrole('authenticated') is not null,
        'service_role, anon or authenticated is missing'),
    (4, 'the login can create a schema, and a function in public',
        pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'create') and pg_catalog.has_schema_privilege(current_user, 'public', 'create'),
        'no CREATE on the database or on schema public'),
    (5, 'the login can read the bucket table',
        pg_catalog.to_regclass('storage.buckets') is not null and pg_catalog.has_table_privilege(current_user, 'storage.buckets', 'select'),
        'storage.buckets is missing or not readable by this login'),
    (6, 'the login can add a bucket',
        pg_catalog.to_regclass('storage.buckets') is not null and pg_catalog.has_table_privilege(current_user, 'storage.buckets', 'insert'),
        'no INSERT on storage.buckets: make the bucket in the dashboard instead of sql/002'),
    (7, 'row level security guards storage.objects',
        coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('storage.objects')), false),
        'row level security is off on storage.objects'),
    (8, 'no policy opens storage.objects',
        not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = pg_catalog.to_regclass('storage.objects')),
        'storage.objects has a policy: the relay refuses to run while one exists')
  ) as c(n, check_name, ok, why)
  union all
  select 2, pg_catalog.row_number() over (order by pg_catalog.to_jsonb(n) ->> 'last_heartbeat_at' desc nulls last, n.node_id),
         'factory node ' || n.node_id,
         'security_role=' || coalesce(pg_catalog.to_jsonb(n) ->> 'security_role', '-') || ', platform=' || coalesce(pg_catalog.to_jsonb(n) ->> 'platform', '-')
           || ', last heartbeat ' || coalesce(pg_catalog.to_jsonb(n) ->> 'last_heartbeat_at', '-')
  from factory.nodes n
) x
order by x.part, x.n;
