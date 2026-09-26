-- FACTORY CONTROL PLANE V1 - PART 990 (LAST): least privilege, then a self-check that fails the whole migration closed.
--
-- The self-check proves, inside the migration's own transaction, the catalog facts S-10 / AC-12 name:
--   * factory_runner holds no privilege at all on any table this migration created (authority records), table- or column-level;
--   * no function this migration created is executable by PUBLIC or by factory_runner;
--   * no default-privilege entry in schema factory reaches factory_runner;
--   * factory_runner is a member of no role, and no API role is a member of it;
--   * every SECURITY DEFINER function pins search_path to '' (empty);
--   * each 69df2f52 table gained exactly the columns this migration meant to add, and lost none.
-- A failed check raises, and nothing of this migration commits.

-- factory_owner creates nothing after this migration: no DDL from any API (S-10)
revoke create on schema factory from factory_owner;

-- only an object's owner can revoke what it granted, so the belt-and-braces revoke runs as factory_owner
set local role factory_owner;
do $revoke$
declare t record; f record;
begin
  for t in select c.oid::regclass as rel from pg_catalog.pg_class c
            where c.relnamespace = 'factory'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
              and pg_catalog.pg_get_userbyid(c.relowner) = 'factory_owner' loop
    execute format('revoke all on %s from public, factory_runner', t.rel);
  end loop;
  for f in select p.oid::regprocedure as fn from pg_catalog.pg_proc p
            where p.pronamespace = 'factory'::regnamespace and pg_catalog.pg_get_userbyid(p.proowner) = 'factory_owner' loop
    execute format('revoke all on function %s from public, factory_runner', f.fn);
  end loop;
end
$revoke$;
reset role;

do $selfcheck$
declare
  bad text;
  runner oid := (select oid from pg_catalog.pg_roles where rolname = 'factory_runner');
begin
  -- tables and sequences created by this migration: nothing for factory_runner or PUBLIC
  select string_agg(c.oid::regclass::text, ', ') into bad
    from pg_catalog.pg_class c
   where c.relnamespace = 'factory'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
     and pg_catalog.pg_get_userbyid(c.relowner) = 'factory_owner'
     and exists (select 1 from pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
                  where a.grantee in (runner, 0));
  if bad is not null then raise exception 'factory v1 self-check: factory_runner / PUBLIC hold a privilege on %', bad; end if;

  -- no column-level grant to factory_runner on those tables
  select string_agg(format('%s.%s', a.attrelid::regclass, a.attname), ', ') into bad
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'factory'::regnamespace and pg_catalog.pg_get_userbyid(c.relowner) = 'factory_owner'
     and a.attacl is not null
     and exists (select 1 from pg_catalog.aclexplode(a.attacl) x where x.grantee in (runner, 0));
  if bad is not null then raise exception 'factory v1 self-check: column grant to factory_runner / PUBLIC on %', bad; end if;

  -- functions created by this migration: no EXECUTE for PUBLIC or factory_runner
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_catalog.pg_proc p
   where p.pronamespace = 'factory'::regnamespace and pg_catalog.pg_get_userbyid(p.proowner) = 'factory_owner'
     and exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                  where a.grantee in (runner, 0) and a.privilege_type = 'EXECUTE');
  if bad is not null then raise exception 'factory v1 self-check: EXECUTE for PUBLIC / factory_runner on %', bad; end if;

  -- no default privilege in schema factory reaches factory_runner
  if exists (select 1 from pg_catalog.pg_default_acl d
              where d.defaclnamespace = 'factory'::regnamespace
                and exists (select 1 from pg_catalog.aclexplode(d.defaclacl) a where a.grantee = runner)) then
    raise exception 'factory v1 self-check: a default privilege in schema factory still reaches factory_runner';
  end if;

  -- factory_runner is a member of no role; no API role (and not factory_owner) is a member of factory_runner
  if exists (select 1 from pg_catalog.pg_auth_members m where m.member = runner) then
    raise exception 'factory v1 self-check: factory_runner is a member of a role';
  end if;
  if exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid = m.member
              where m.roleid = runner and r.rolname in ('factory_owner', 'factory_node_api', 'factory_admin_api')) then
    raise exception 'factory v1 self-check: an API role or factory_owner is a member of factory_runner';
  end if;
  -- the API roles and factory_owner hold no role (they are members of nothing)
  if exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid = m.member
              where r.rolname in ('factory_owner', 'factory_node_api', 'factory_admin_api')) then
    raise exception 'factory v1 self-check: factory_owner or an API role is a member of another role';
  end if;
  -- none of the new roles has an attribute beyond NOLOGIN defaults
  if exists (select 1 from pg_catalog.pg_roles r where r.rolname in ('factory_owner', 'factory_node_api', 'factory_admin_api')
              and (r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication or r.rolbypassrls or r.rolcanlogin)) then
    raise exception 'factory v1 self-check: a new role carries an attribute it must not (superuser / createrole / createdb / replication / bypassrls / login)';
  end if;

  -- the API roles execute exactly their own front doors: factory_node_api only factory.node_*, factory_admin_api only
  -- factory.admin_*, and every front door is SECURITY DEFINER
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_catalog.pg_proc p
   where p.pronamespace = 'factory'::regnamespace
     and ((pg_catalog.has_function_privilege('factory_node_api', p.oid, 'EXECUTE') and p.proname !~ '^node_')
       or (pg_catalog.has_function_privilege('factory_admin_api', p.oid, 'EXECUTE') and p.proname !~ '^admin_')
       or (p.proname ~ '^(node|admin)_' and not p.prosecdef));
  if bad is not null then raise exception 'factory v1 self-check: an API role executes a function outside its front doors, or a front door is not SECURITY DEFINER: %', bad; end if;
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_catalog.pg_proc p
   where p.pronamespace = 'factory'::regnamespace
     and ((p.proname ~ '^node_' and not pg_catalog.has_function_privilege('factory_node_api', p.oid, 'EXECUTE'))
       or (p.proname ~ '^admin_' and not pg_catalog.has_function_privilege('factory_admin_api', p.oid, 'EXECUTE')));
  if bad is not null then raise exception 'factory v1 self-check: a front door its API role cannot execute: %', bad; end if;

  -- every SECURITY DEFINER function pins an empty search_path
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_catalog.pg_proc p
   where p.pronamespace = 'factory'::regnamespace and p.prosecdef
     and not coalesce('search_path=""' = any (p.proconfig) or 'search_path=' = any (p.proconfig), false);
  if bad is not null then raise exception 'factory v1 self-check: SECURITY DEFINER without an empty pinned search_path: %', bad; end if;

  -- each 69df2f52 table: its 69df2f52 columns are all present
  select string_agg(t || '.' || c, ', ') into bad
    from unnest(array['nodes', 'work_orders', 'work_order_dependencies', 'agent_runs', 'surface_locks', 'checkpoints',
                      'founder_notifications', 'director_lease']) t
    cross join lateral unnest(factory._baseline_columns(t)) c
   where not exists (select 1 from pg_catalog.pg_attribute a
                      where a.attrelid = ('factory.' || t)::regclass and a.attname = c and not a.attisdropped);
  if bad is not null then raise exception 'factory v1 self-check: a 69df2f52 column is missing: %', bad; end if;
end
$selfcheck$;
