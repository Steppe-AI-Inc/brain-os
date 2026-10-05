# Factory V1 migration: privilege model under the live applying login (implementer record, not canonical)

This record states what the candidate migration (`supabase/control-plane/v1/`) guarantees about roles and privileges when the plane's
applying login `postgres` applies it (NOSUPERUSER, CREATEROLE, a member of `pg_read_all_data`; `APPLYING_ROLE_OBSERVATION.json`), and
which developer row checks each guarantee. The rows are in `qa/factory/v1/schema_acceptance.mjs` (P0n, P1, P7, C3-C20, AL0-AL7,
RO1, RO2, OB1, FS1, FS2), `qa/factory/v1/manifest_rehearsal.mjs` (R1, CD1-CD4), `qa/factory/v1/applying_role_plane.mjs` (S1, W1-W6)
and `qa/scenarios-runner/factory_v1_static_contract.mjs` (R1-R11, X4, H1). The developer plane only approximates the live one (see Limits).

## Where the applying login's rights come from

| what the login must do | the mechanism | does a statement name or read the login? |
|---|---|---|
| create objects that `factory_owner` owns | part 000 sets `createrole_self_grant` to the constant `'set'` just before `create role factory_owner` and back to `''` just after. PostgreSQL 16+ then records two memberships of the creator in `factory_owner`: one with ADMIN OPTION but without INHERIT or SET, granted by the bootstrap superuser, and one with SET only, granted by the creator. The login can `set local role factory_owner` but never holds `factory_owner`'s privileges as its own | no. Setting a constant with SET LOCAL is not a hit (VERIFICATION_SPEC §3.4 "Not hits") |
| give the two API roles LOGIN (founder step 2) | the ADMIN OPTION PostgreSQL gives the creator of `factory_node_api` and `factory_admin_api` | no |
| point foreign keys of the `69df2f52` tables at new tables | `factory_owner` grants REFERENCES on those new tables to PUBLIC (parts 010 and 070) and takes it back at the end of the same part | no. The tables exist only inside this uncommitted transaction, so no other session can use the grant |
| attach the legacy guard to the `69df2f52` tables | their owner (the applying login) grants TRIGGER to `factory_owner`, the guard is attached as `factory_owner`, and TRIGGER is revoked again (part 080) | no |
| remove the `69df2f52` default-privilege grant to `factory_runner` | three `alter default privileges in schema factory revoke all on tables / sequences / functions from factory_runner` statements without FOR ROLE. PostgreSQL applies them to the entry of the login that runs them, and that is the entry the `69df2f52` provisioning wrote | no. The statements name only the grantee |
| start every new function without PUBLIC EXECUTE | `factory_owner`'s all-schemas default-privilege entry (`alter default privileges revoke execute on functions from public`, run as `factory_owner`). A schema-scoped entry cannot take back PostgreSQL's built-in default | no |
| run part 990's revokes and its checks (c) and (d) | part 990 runs them as `factory_owner`, which owns every relation it revokes on. A REVOKE by a role that neither owns a relation nor holds a grant option on it takes nothing back (PostgreSQL warns, it does not fail), so run as the applying login the revokes would leave in place anything an earlier part leaked. Mutant F1 keeps part 010's transient PUBLIC grant and runs part 990 as the applying login; read-backs C3 and C9 must see the grant. | no |

Outside function bodies, no statement refers to the applying login (`current_user`, `session_user`) or reads a login's or an object
owner's name or attributes (role catalogs, role attributes, owner columns, `acldefault`, settings): static row R1. The migration names
only fixed roles: the three it creates and `69df2f52`'s `factory_runner`. The three roles are created with every privileged attribute
off and no membership clause, and no statement grants or revokes a role membership (R2). The last statement is `reset role` (R4).

## Part 990: revokes by name, then two checks

Part 990 revokes everything PUBLIC and `factory_runner` might hold on the relations the migration created. It names them: the 19 tables
and the three identity sequences PostgreSQL creates for them (`<table>_<column>_seq`). No catalog read decides what is revoked, and a
table's REVOKE ALL also takes back every column privilege on it. Static row R5 compares both lists, and the grantees PUBLIC and
`factory_runner`, with every CREATE of a relation and every identity column in the migration (mutants RS, RSR, RSS, PXS). Schema row
AL6 compares them with every relation `factory_owner` owns after the migration (SC). No revoke runs on functions: part 000 makes them
start without PUBLIC EXECUTE, no part grants EXECUTE to PUBLIC or `factory_runner`, and check (c) aborts the migration otherwise
(mutants DP and FX).

Two checks then run as `factory_owner`, inside the migration's transaction. Each can only abort the migration:

- (c) every function in schema `factory` has an explicit ACL, without EXECUTE for PUBLIC or `factory_runner`;
- (d) no default-privilege entry in schema `factory` reaches `factory_runner` (mutant LD; see Limits for who can apply the migration).

What they read, and nothing else: in `pg_catalog`, the `pg_proc` rows of schema `factory` (namespace, ACL, and the signature named in
(c)'s error text) and the `pg_default_acl` rows of schema `factory` (namespace, ACL); `aclexplode` of those two ACLs; and the name
lookups `'factory'::regnamespace` and `'factory_runner'::regrole`. No role attribute, membership, owner or setting is read. How
VERIFICATION_SPEC §3.4 r3 classes these reads was change request CR-021. The Director's CR-disposition record (2026-09-30) approved
Alternative 1: "an in-migration catalog check over objects and grants the same transaction created is classed same-on-every-plane",
with each hit's construction named in the verifier's receipt. The static contract's row P3p holds the inventory's class to that record.

Part 000 carries no precondition block. Its statements name what they need, and the migration is one transaction. On a database
without the `69df2f52` objects, the first statement that refers to one the database lacks aborts it (schema row P0n: 3F000 at the schema grant
when schema `factory` is missing, 42P01 at the table grant when the `69df2f52` tables are). A second application aborts at `create
role factory_owner`, because roles belong to the cluster (P7: 42710). Nothing commits in either case. Whether a plane equals the
`69df2f52` referent is decided before the step and outside the migration: by the fidelity check (VERIFICATION_SPEC §3.3), AC-10's
comparison with the pre-candidate catalog, and the checks the Director's step makes for AC-11.

The facts the migration no longer re-checks inside its own transaction are read back after it, on every judging plane, by the
verifier (§3.5, AC-12), and by these developer rows:

- PUBLIC and `factory_runner` hold nothing on the new tables or on their columns: C3, C4, C9 (mutant PX); nor on the three identity
  sequences: C3s for `factory_runner` and the two API roles (SQR), AL2 for PUBLIC;
- each API role executes exactly its own front doors, one function per name, each SECURITY DEFINER: C18, C19, C20 (S7N, S7A);
- every function pins `search_path` to exactly `pg_catalog, pg_temp`: C10 and static R8 (SPS);
- the legacy guard's column lists equal `factory._baseline_columns()`: C15 and static R10 (GB, GB2, GBS, GB2S); and that reference
  list is the `69df2f52` referent's own: static R12 compares it, table by table and in order, with the columns `69df2f52`'s
  control-plane SQL gives each table, and as a set with the Director's r3 snapshot of the live plane before the candidate (GBB drops
  one column from both copies alike, which R10 and C15 cannot see);
- no statement drops, renames or retypes a `69df2f52` column: static R11, which also reads dynamic statements (the literals EXECUTE
  or format() would run, a placeholder target included) (BCT, BCR, BCD, BCX, BCY); and the catalog difference removes no relation
  or column, so a retype that keeps every value still shows: manifest_rehearsal CD5.

Role attributes and memberships are never read inside the migration: under §3.4 r3, reading an owner's attributes or memberships in a
migration statement fits no class. They hold by construction (R2), and checks that run after the migration has committed read
them: schema rows C1 (attributes), C8 (`factory_runner`'s memberships as at `69df2f52`; no API role is a member of it), AL1 (every
membership the migration adds) and AL7 (the API roles own nothing, are members of no role, and hold only USAGE on schema `factory`
and EXECUTE on functions there beyond what PUBLIC has), and the verifier's §3.5 read-backs.

## The catalog difference (S-11 / AC-10)

`predicted_catalog_difference.json` is the implementer's prediction of the difference (after minus before), in the Director
snapshot tool's format, for the sections the privilege model decides. `manifest_rehearsal.mjs` reads the developer plane with
`tools/live_catalog_snapshot.mjs`, as a reader login the bootstrap superuser creates, before and after the step, and compares
(rows CD1-CD4). The grants that parts 010, 070 and 080 give and take back inside the transaction leave nothing in it.

Role memberships added (four; none removed):

| granted role | member | ADMIN | INHERIT | SET | grantor |
|---|---|---|---|---|---|
| `factory_owner` | `postgres` | yes | no | no | `supabase_admin` (bootstrap superuser) |
| `factory_owner` | `postgres` | no | no | yes | `postgres` |
| `factory_node_api` | `postgres` | yes | no | no | `supabase_admin` |
| `factory_admin_api` | `postgres` | yes | no | no | `supabase_admin` |

In each row the new role is the granted role and the applying login is the member; the API roles themselves are members of no role.
Default privileges: the applying login's four `factory_runner` entries in schema `factory` (SELECT, INSERT, UPDATE, DELETE on tables)
are removed, and one entry is added: `factory_owner`'s all-schemas entry for functions, with EXECUTE for `factory_owner` only. Roles:
+3. Schema ACL: +3 (USAGE on schema `factory` for the three new roles). Table and function ACLs follow the rules in the JSON file.

## Founder steps run by the applying login

`FOUNDER_PREPARED_STEPS.md` steps 1b (observer SELECT on the new relations, granted through `set local role factory_owner`), 2 (LOGIN
and `\password` for the API roles), 3 (tenant admins, through `set local role factory_owner`) and R (`\password factory_runner`) are
run from the document, as the applying login, by schema rows OB1, FS2, FS1 and RO1. Steps 1b, 2 and 3 rely on the memberships step 1
gives the applying login; step R relies on the ADMIN OPTION on `factory_runner` that the login has held since it created that role
in the `69df2f52` provisioning. What their read-backs read (static row R6 fails if any code span of the document reads a login's or
an owner's attributes, a membership, a setting or a platform schema, or reads `pg_roles` other than by the API roles' names):

- steps 1b and R: privilege checks (`has_table_privilege`) and, in step R, the grantees of schema `factory`'s default-privilege
  entries;
- step 2: `rolcanlogin` of the two API roles, looked up by their fixed names. They are neither the applying login nor an object
  owner, and the value is only displayed.

Whether the observer role's name, which the founder substitutes into step 1b, needs a §3.4 class was change request CR-023; the
Director approved it as own-plane addressing (a founder-provided configuration name used the same way wherever the step runs).
Step 3's INSERT fires two guards of part 080 that read `session_user` (the tenant-admins guard, through `factory._via_api`) and
`current_user` (the authority guard); in the step those are the applying login and `factory_owner`. Whether §3.4 counts such a
trigger's reads as reads of the founder step was change request CR-026. The Director approved it on the same basis as CR-022 (b): both
reads are the S-10 authority mechanism and have the same outcome on every plane. Schema E10b (mutant TAG) proves the tenant-admins guard
refuses an API-login write.

Step R does what `qa/work-orders/FACTORY_CONTROL_PLANE_SETUP.md:114` says about rotation. Two Director runbook rows instead say to
rotate by re-running the `69df2f52` provisioner. Change request CR-006 asked the Director to decide which runbook applies after V1;
the implementer's measurement went to the Director privately, through the founder (ledger rule 3). The Director approved the requested
change: on a plane that has the V1 migration, the plane's applying login rotates the password with psql's `\password factory_runner`,
`runner.env` is then updated on each legacy node and the node restarted, and the `69df2f52` provisioner is never re-run. Step R's second read-back lists any
default privilege reaching `factory_runner`, and it must list none.

## The release signer (the successor; WO-6 revision 5)

The signer is not part of the migration. `scripts/factory-control-plane/release_signer.sql` is applied once, before it, by the same
applying login, which therefore owns schema `factory_signer`, its one table and its functions (`release_signer_acceptance` RS1, RS8).
The file creates no role. The migration adds exactly one privilege to it:

| what | the statement | does it name or read the login? |
|---|---|---|
| the engine role may ask for a signature | part 000: `grant execute on function factory_signer.sign_release(text, text, text, text) to factory_owner` | no. It names the function. On a plane without a signer, or with one another login created, it fails and nothing of the migration commits |

- `factory_owner` is the role the SECURITY DEFINER front doors run as. The only front door that calls `sign_release` is
  `factory.admin_authorize_update` (part 220): founder-only, after a fresh password entry.
- Neither API login holds EXECUTE on a signer function other than `public_key()`, which PUBLIC may execute (RS7, RS8). Part 290 gives
  the Admin API login EXECUTE on the front door, as on every other admin front door, and on nothing of the signer.
- The catalog difference of the step stays as predicted: `predicted_catalog_difference.json` is unchanged since candidate #3, and
  `manifest_rehearsal` CD3 holds every added function privilege to `factory_owner` or to a front door's one API role.
- On a judging plane the suites apply a stand-in for the platform's secret store (`qa/factory/v1/vault_standin.sql`, with the
  platform's grants to `service_role`) and then the signer file, before the migration.

## The claim lock

`factory._claim` asks for the plane-wide claim lock with `pg_try_advisory_xact_lock`, up to 150 times, 0.1 s apart. If it never gets
the lock it returns the named refusal `claim_lock_busy`. It catches no error (static row R3). The frozen `acceptance.mjs:544 N`
behaviour holds: `compat_regressions.mjs` shows the claim giving up within the bound, by name.

## Limits (stated)

- The developer plane is embedded PostgreSQL 18. It lacks the Supabase image's platform roles and schemas, its `supautils` hooks and
  its event triggers; the judging plane and the live plane run PostgreSQL 17 on that image. The creator memberships the migration
  depends on are PostgreSQL behaviour. The live `factory_runner` membership row (ADMIN, no INHERIT, no SET, granted by the bootstrap
  superuser after `postgres` created the role) shows the image follows that path. If a hook ran CREATE ROLE as a superuser instead,
  `set local role factory_owner` would be refused and the step would abort: a failure, never a silent success.
- The migration needs PostgreSQL 16 or later (`createrole_self_grant`); on an older server it aborts.
- Who can apply the migration. Documented PostgreSQL behaviour: CREATE ROLE run by a superuser grants its creator no membership, so
  a superuser applier adds no `pg_auth_members` row; and ALTER DEFAULT PRIVILEGES without FOR ROLE changes only the entry of the
  login that runs it. So only the login that provisioned the plane as `69df2f52`, whose entry holds the default grant to
  `factory_runner`, removes that grant. Any other login, a superuser included, leaves it in place, part 990's check (d) aborts the
  migration, and nothing commits: the failure is closed, never a silent success. Developer measurement, re-taken for this
  tree (a scratch run on the applying-role plane as its bootstrap superuser, everything rolled back; not a suite): parts 000-290
  added no `pg_auth_members` row, and part 990 stopped at check (d) with P0001.
  The live applying login is the provisioning login and is no superuser.
- Part 990 names the identity sequences as PostgreSQL names them by default. If a relation with one of those names already existed in
  schema `factory`, PostgreSQL would name the new sequence differently. Part 990's revoke would then act on the existing
  relation, and schema row AL6 would report the new sequence as not covered. The fidelity check (§3.3) makes the live plane equal to
  the `69df2f52` referent, which has no such relation.
- Under heavy contention the claim's try-lock loop does not wait in a queue behind a blocked waiter. An enrolled claim can then stop
  trying after roughly 15 seconds and answer `claim_lock_busy`; the node claims again on its next cycle.

## What the next candidate report must carry for this area

- Each finding's status: F-1, L7-28, L1-F9, L6-7, L6-9 and R3-SCAN-B fixed with developer rows and mutants; L7-18 refuted, with step
  1 rewritten to the r3 step anyway (R7); L1-F11 and L6-5 met by the rows above; L1-F6: step R works (RO1, RO2), and CR-006
  (APPROVED) superseded the Director runbook rows that re-ran the provisioner (measurement sent privately);
  R3-SCAN-A met for the applying login and object owners (R1, R2, R6); the class of the remaining fail-closed catalog reads (part
  990's checks (c) and (d)) rests on the Director's CR-021 ruling (Alternative 1), that of the engine test in the two guards of part
  080 on CR-022 (b), and founder step 3's trigger reads on CR-026 (all three APPROVED in the Director's CR-disposition record). The ids
  of the rows the migration seeds are proposed as not a hit (the r3 hit item for literals needs a record that is not on both planes;
  the migration inserts these rows, under the same ids, wherever it runs).
- That the static contract passes every row at the candidate, P3p included: each class that rests on a ruling is held to the
  Director's CR-disposition record (decided by the Director, APPROVED, the quoted class in the decision, the CR's recorded sha256).
- The four membership rows above, citing `predicted_catalog_difference.json` and this record.
- For L6-9: step 1b grants SELECT on the 19 new tables and their three identity sequences and reads back every `factory` relation.
  It does not grant or probe `storage.buckets`. The contract leaves that to the founder's observer provisioning, and a
  platform-schema probe in a founder step would itself be a §3.4 hit.
- That the migration no longer creates `factory._is_engine` (nothing in the product called it): the engine tests are the two
  guards' (C16, L9, L9b), and schema L2 calls `factory._via_api` for its direct-call refusal.
- The run counts measured at the candidate SHA, not counts copied from an earlier report.
