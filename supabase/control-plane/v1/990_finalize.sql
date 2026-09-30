-- FACTORY CONTROL PLANE V1 - PART 990 (LAST): least privilege, then two checks that fail the whole migration closed.
--
-- WHO RUNS IT. The applying login revokes CREATE on schema factory from factory_owner (it owns the schema). Everything after that
-- runs AS factory_owner (SET ROLE): factory_owner owns every relation the revokes below name, and only an owner can revoke what
-- others hold on a relation. The migration's last statement is `reset role`.
--
-- THE REVOKES name their targets: the 19 tables this migration creates and the three identity sequences PostgreSQL creates for them,
-- written out. No catalog read chooses what is revoked. A table REVOKE ALL also takes back every column privilege on that table.
-- Functions get no revoke here: part 000 makes every function factory_owner creates start without PUBLIC EXECUTE, no part grants
-- EXECUTE to PUBLIC or factory_runner, and check (c) aborts the migration if a function in schema factory is executable by either.
--
-- THE TWO CHECKS, inside the migration's own transaction:
--   (c) every function in schema factory has an explicit ACL (a NULL ACL means PUBLIC EXECUTE) with no EXECUTE for PUBLIC or
--       factory_runner;
--   (d) no default-privilege entry in schema factory reaches factory_runner. The 69df2f52 entry belongs to the login that provisioned
--       the plane as 69df2f52, and part 000's revoke acts on the entry of the login that runs it, so an application by any other
--       login leaves that entry in place and stops here.
-- WHAT THEY READ, in pg_catalog: the pg_proc rows of schema factory (pronamespace, proacl, and the signature named in the error
-- text) and the pg_default_acl rows of schema factory (defaclnamespace, defaclacl); aclexplode of those ACLs; and the name lookups
-- 'factory'::regnamespace and 'factory_runner'::regrole. Each read can only make the migration abort. It reads no login's or object
-- owner's name or attributes, no role attribute and no role membership. How VERIFICATION_SPEC §3.4 r3 classes these reads is change
-- request CR-021, which the candidate does not rely on.
--
-- WHAT IS PROVED OUTSIDE THE MIGRATION instead of here (the verifier's §3.5 read-backs and AC-12 on every judging plane; the
-- developer rows named): PUBLIC and factory_runner hold nothing on the new tables or their columns (schema C3, C4, C9) or on the
-- identity sequences (C3s for factory_runner and the API roles, AL2 for PUBLIC); each API role executes exactly its own front
-- doors, each SECURITY DEFINER (C18, C19, C20); every function pins `search_path = pg_catalog, pg_temp` (C10; static R8); the
-- legacy guard's 69df2f52 column lists equal factory._baseline_columns() (C15; static R10), which is the referent's own list (static
-- R12); no statement, dynamic ones included, drops, renames or retypes a 69df2f52 column (static R11), and the catalog difference
-- removes no relation or column (manifest_rehearsal CD5); the two revokes name exactly the relations and identity sequences the
-- migration creates (static R5; schema AL6).
-- A failed check raises, and nothing of this migration commits.
--
-- ROLE ATTRIBUTES AND MEMBERSHIPS are not read here: they hold by construction (part 000 creates the three roles with every
-- privileged attribute off, and no statement of this migration grants a role membership; the static contract proves both), and
-- they are read back outside the migration (schema acceptance C1, C8, AL1; VERIFICATION_SPEC §3.5).

-- factory_owner creates nothing after this migration: no DDL from any API (S-10)
revoke create on schema factory from factory_owner;

set local role factory_owner;

-- PUBLIC and factory_runner keep nothing on the relations this migration created, whatever an earlier part granted them
revoke all on table
  factory.tenants, factory.tenant_admins, factory.computers, factory.authorization_envelopes, factory.agent_principals,
  factory.node_credentials, factory.computer_fingerprints, factory.pairing_codes, factory.enrollments,
  factory.enrollment_transitions, factory.pairing_attempts, factory.node_sessions, factory.node_assertion_jtis,
  factory.audit_events, factory.verification_policies, factory.verification_policy_versions, factory.certifications,
  factory.releases, factory.release_revocations from public, factory_runner;
revoke all on sequence
  factory.enrollment_transitions_transition_id_seq, factory.pairing_attempts_attempt_id_seq, factory.audit_events_event_id_seq
  from public, factory_runner;

do $finalize$
declare
  runner constant oid := 'factory_runner'::regrole;
  bad text;
begin
  -- (c) functions: an explicit ACL, with no EXECUTE for PUBLIC or factory_runner
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_catalog.pg_proc p
   where p.pronamespace = 'factory'::regnamespace
     and (p.proacl is null
          or exists (select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee in (runner, 0) and a.privilege_type = 'EXECUTE'));
  if bad is not null then raise exception 'factory v1 self-check: EXECUTE for PUBLIC / factory_runner on %', bad; end if;

  -- (d) no default privilege in schema factory reaches factory_runner
  if exists (select 1 from pg_catalog.pg_default_acl d
              where d.defaclnamespace = 'factory'::regnamespace
                and exists (select 1 from pg_catalog.aclexplode(d.defaclacl) a where a.grantee = runner)) then
    raise exception 'factory v1 self-check: a default privilege in schema factory still reaches factory_runner';
  end if;
end
$finalize$;
reset role;
