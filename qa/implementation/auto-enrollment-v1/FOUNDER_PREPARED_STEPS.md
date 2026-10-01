# Factory V1 Auto-Enrollment — founder's prepared steps

**Status: PREPARED, NOT RUN.** Every step below is a founder action (CLAUDE.md §8; WO-1, WO-6, WO-7, WO-8, WO-10 boundaries). The
implementer ran none of them and holds no production credential. Nothing here is a trust root, a secret value or a production key.

The order matters. Steps 1–6 happen only **after** the Director's receipt says CERTIFIED for the exact candidate SHA
(`VERIFICATION_SPEC.md` §5). Step 7 (a live release) also needs **C-3**, the production release-signing key custody, which is
unresolved and founder-gated. Before C-3 the production trust set is empty, so no live-mode release exists and no production-channel
node can run anything (S-5).

## 0. What each step needs

| step | needs | touches |
|---|---|---|
| 1 migration | CERTIFIED receipt; the step file the verifier built (its sha256 in the receipt) | the live Factory plane (`npvhuoozkbexddnvkqsj`) |
| 1b observer SELECT on the new relations | step 1; the founder-provisioned observer role | grants on the live plane |
| 2 API logins | step 1 | two roles on the live plane |
| 3 Factory admins | step 1 | `factory.tenant_admins` |
| 4 Edge secrets | steps 2, 3 | the Factory project's function secret store |
| 5 deploy the two functions | step 4; `ALLOW_FUNCTIONS_DEPLOY=1?` asked once | Edge Functions on the Factory project |
| 6 release storage | step 5 | a public Storage bucket on the Factory project |
| 7 a live release | C-3; a CERTIFIED reproduced digest | the bucket, the Admin API `publish-release` |
| 8 Brain OS web | a PR into `master` | Brain OS production (Vercel) |
| 9 re-enroll the two nodes, retire `factory_runner` | steps 5–8 | the two existing PCs, the live plane |
| R `factory_runner` password rotation after step 1 | step 1 | one role on the live plane; `runner.env` on each legacy node |

Every SQL step below runs as the plane's applying login `postgres` (NOSUPERUSER, CREATEROLE), the login that provisioned the plane as
`69df2f52` and applies step 1. It never needs a superuser.

## 1. Apply the control-plane migration (WO-1 r3; AC-11)

- The founder composes nothing and wraps nothing. The step file comes from the **verifier**, who runs the Director instrument
  `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs` at the designated Director commit over the committed
  blobs of the candidate migration (every `.sql` file the candidate adds under `supabase/control-plane/` since `69df2f52`, `edge/`
  excluded, in byte order of path). The file holds `begin`, the migration unchanged, the Director's manifest check after the
  migration's last statement, and `commit`. It is an evidence file of the receipt, and the receipt records its sha256 (WO-1 r3,
  `VERIFICATION_SPEC.md` §3.3).
- Before applying it: the step file's sha256 equals the one in the CERTIFIED receipt, and a Director observation record shows that
  the live plane holds no deferrable constraint trigger and no deferrable exclusion constraint (`VERIFICATION_SPEC.md` §3.3).
- The founder applies **exactly that file**, as `postgres`, in one session, through the authorized production-database path:
  `psql -X -v ON_ERROR_STOP=1 -f <the step file>` (the password entered at psql's prompt, never in a URL or on a command line), or
  the file as one simple-Query message. Never `supabase db query --file`: it does not keep one transaction across a file
  (`qa/KNOWN_FAILURE_MODES.md` #32). The step is one transaction, so a failed in-migration check (`990_finalize.sql` checks (c) and
  (d)), a manifest difference or any other error rolls everything back.
- The migration creates three NOLOGIN roles, `factory_owner`, `factory_node_api` and `factory_admin_api`, with every privileged
  attribute off. PostgreSQL gives `postgres`, their creator, ADMIN on each of them (never their privileges), and the migration's
  constant `createrole_self_grant = 'set'` adds SET (never INHERIT) on `factory_owner` only. Steps 1b, 2 and 3 rely on exactly
  these memberships. Step R relies on an older one: the ADMIN option on `factory_runner` that `postgres` has held since it created
  that role in the `69df2f52` provisioning.

## 1b. Let the observer read the new relations (contract: the Director's live observer login; AC-10)

After step 1, once the founder has provisioned the SELECT-only observer role (a recorded founder change). The migration's relations
are owned by `factory_owner`, so only `factory_owner` can grant on them: `postgres` holds no grant option on them and does not inherit
`factory_owner`'s privileges. The list is explicit because `on all tables in schema factory` run as `factory_owner` fails on
`factory.plane_identity`, on which `factory_owner` holds nothing. As `postgres`, in one session, with `<observer role>` replaced by
the observer role's name:

```sql
begin;
set local role factory_owner;
grant select on
  factory.tenants, factory.tenant_admins, factory.computers, factory.authorization_envelopes, factory.agent_principals,
  factory.node_credentials, factory.computer_fingerprints, factory.pairing_codes, factory.enrollments,
  factory.enrollment_transitions, factory.pairing_attempts, factory.node_sessions, factory.node_assertion_jtis,
  factory.audit_events, factory.verification_policies, factory.verification_policy_versions, factory.certifications,
  factory.releases, factory.release_revocations,
  factory.enrollment_transitions_transition_id_seq, factory.pairing_attempts_attempt_id_seq, factory.audit_events_event_id_seq
  to <observer role>;
commit;
```

Read back, as `postgres`: this returns no row (every `factory` relation, the `69df2f52` ones and the new ones, is readable by the
observer):

```sql
select c.oid::regclass from pg_catalog.pg_class c
 where c.relnamespace = 'factory'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
   and not pg_catalog.has_table_privilege('<observer role>', c.oid, 'SELECT');
```

`storage.buckets` is part of the founder's observer provisioning (its first read is the bucket referent, AC-10); this step does not
read or probe the platform schemas.

## 2. Give the two API roles a login (least privilege is already in the migration)

As `postgres`, which administers both roles through the ADMIN grant PostgreSQL gave it at step 1, in psql:

```sql
alter role factory_node_api  with login;
alter role factory_admin_api with login;
```

```psql
\password factory_node_api
\password factory_admin_api
```

Enter a new random password (at least 32 characters, from the founder's password manager) at each prompt. psql computes the SCRAM
verifier locally, so the password never appears in a statement, a server log, a shell history or a command line (S-12). Each password
goes only into the matching Edge secret (step 4).

Read back, as `postgres`: the first returns both roles with `rolcanlogin` true; the second returns no row.

```sql
select rolname, rolcanlogin from pg_catalog.pg_roles where rolname in ('factory_node_api', 'factory_admin_api');
```

```sql
select c.oid::regclass, r.role from pg_catalog.pg_class c, unnest(array['factory_node_api', 'factory_admin_api']) r(role)
 where c.relnamespace = 'factory'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
   and pg_catalog.has_table_privilege(r.role, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');
```

## 3. Record the Factory admins (S-8; CR-001, CR-003 ratified)

The authority guard accepts writes only from `factory_owner`:

```sql
begin;
set local role factory_owner;
insert into factory.tenant_admins (tenant_id, auth_user_id, tier)
  select tenant_id, '<the founder''s Brain OS auth user id>'::uuid, 'founder' from factory.tenants where is_operator;
-- one row per holding admin who administers the Factory:
-- insert into factory.tenant_admins (tenant_id, auth_user_id, tier)
--   select tenant_id, '<auth user id>'::uuid, 'admin' from factory.tenants where is_operator;
commit;
```

Also bind S-16(a) to the Home computer. This is **not** a SQL step. It is the one permitted campaign write (S-14): tick "Bind milestone
restriction S-16(a)" when that computer is added through **Add computer**.

## 4. Set the Edge secrets on the Factory project `npvhuoozkbexddnvkqsj`

No secret value is ever displayed, placed on a command line, or left in a file (S-12). S-6 keeps the pepper in the Edge Function
secret store and nowhere else. Two ways in, one per kind of value:

1. **Typed or pasted into the dashboard** (Edge Functions → Secrets), one field per name. The two database passwords come from the
   founder's password manager (step 2) and are pasted into their URL there, never into a terminal:

   | name | value |
   |---|---|
   | `FACTORY_NODE_DB_URL` | `postgresql://factory_node_api.npvhuoozkbexddnvkqsj:<password 1>@<the project's pooler host>:6543/postgres` (transaction pooler) |
   | `FACTORY_ADMIN_DB_URL` | the same, with `factory_admin_api` and password 2 |
   | `FACTORY_DB_CA_PEM` | the project's database server CA (Dashboard → Database → SSL configuration → download), the whole PEM. It is public, not a secret. Without it both functions answer 503 `misconfigured` (S-10: TLS verify-full) |
   | `BRAIN_OS_URL` | `https://pvphxgrtdfrudejjhzjk.supabase.co` |
   | `BRAIN_OS_ANON_KEY` | the Brain OS project's public anon key |

   The URLs must name the pooler **host name**, never an IP address. `_shared/db.ts` refuses an IP literal, because the
   certificate's name can only be checked against a name.

   Each URL is written in exactly the form shown, on one line: user, password, host, port and database, and nothing else. No
   query string, no spaces, no quotes around it. `_shared/db.ts` reads the URL once and gives the driver only the five parts it
   read; any other form is refused, and both functions then answer 503 `misconfigured` with the reason. If a password has a
   character other than letters, digits, `-`, `.`, `_` and `~`, write that character as its percent-escape (`@` is `%40`, `/` is
   `%2F`, `:` is `%3A`, `%` is `%25`, `#` is `%23`, `?` is `%3F`).

2. **Generated straight into an owner-only file**, read by the secret-store command, then shredded: `FACTORY_PAIRING_PEPPER` (32
   random bytes, base64). The pepper's version is not a secret and is not set here: it is a constant of the function source
   (`PEPPER_VERSION` in `_shared/pairing.ts`), the same for both functions. Pick a directory that does not exist yet, outside every
   repository and every synced (OneDrive) folder: a fresh one under `%LOCALAPPDATA%\Temp`. From the repository root at the CERTIFIED
   SHA, run the three commands in order, with that same directory in each:

   ```
   node qa/implementation/auto-enrollment-v1/tools/founder_secrets.mjs pepper --dir <new directory>
   npx supabase secrets set --project-ref npvhuoozkbexddnvkqsj --env-file <new directory>\pepper.env
   node qa/implementation/auto-enrollment-v1/tools/founder_secrets.mjs shred --dir <new directory>
   ```

   The first creates the directory, locks it to the founder's Windows user (read back), writes the file, and prints only its path.
   It refuses a directory that exists, a path with a component whose name starts with `OneDrive`, and a path below a directory that
   holds a `.git` entry (a git working tree). It decides this from the path given and the files under it; it reads no environment
   variable, and it runs `icacls` and `whoami` from `C:\Windows\System32` only. A folder synchronized by another tool, or a
   redirected Desktop or Documents folder whose path shows no `OneDrive` component, is not recognized, which is why the directory
   must be a fresh one under `%LOCALAPPDATA%\Temp`. The second reads the file and prints no value. The third overwrites the file with zeros, deletes it and the directory, and reads back `absent`: do not
   skip it. Overwriting is best effort on an SSD or on NTFS; what matters is that the file exists only for these three commands.
   The pepper is never displayed, so nothing about it reaches a terminal, a transcript or a shared screen.

Read back: `npx supabase secrets list --project-ref npvhuoozkbexddnvkqsj` lists the six names (it shows digests, never the
values).

## 5. Deploy the two functions (after independent verification of the exact SHA; `ALLOW_FUNCTIONS_DEPLOY=1?` asked once)

From the repository root at the CERTIFIED SHA:

```
npx supabase functions deploy factory-node-api  --project-ref npvhuoozkbexddnvkqsj --workdir supabase/control-plane/edge --no-verify-jwt
npx supabase functions deploy factory-admin-api --project-ref npvhuoozkbexddnvkqsj --workdir supabase/control-plane/edge --no-verify-jwt
```

`supabase/control-plane/edge/supabase/config.toml` also sets `verify_jwt = false` for both functions. The functions authenticate
every request themselves. A node's session is not a Supabase JWT, and a Brain OS token is signed by the other project, so the
gateway's JWT check would refuse every call. The Brain OS workflow (`supabase-functions.yml`, `master` push, project
`pvphxgrtdfrudejjhzjk`) deploys only the root `supabase/functions/` and cannot reach these (`factory_v1_static_contract` E2, E5).

**Post-deploy live acceptance (mandatory; CLAUDE.md §6).** These measure the whole-request gates, which no harness can:

1. `curl -s https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-node-api/v1/time` returns 200 `{"ok":true,
   "server_time":...}`. This proves the platform path, the gateway pass-through, the Ed25519 self-test, TLS verify-full to the pooler
   and the node front door.
2. `POST .../factory-admin-api/v1/admin/list-computers` with a founder session returns 200 with a `computers` envelope. With an
   employee session it returns 403 `not_authorized`. With no token it returns 401.
3. `POST .../factory-node-api/v1/node/heartbeat` with no session returns 401 `session_invalid`.
4. Record the outcome of each against the deployed function version (`npx supabase functions list --project-ref npvhuoozkbexddnvkqsj`).

A 503 `misconfigured` names what is missing from the database configuration (the URL or `FACTORY_DB_CA_PEM`). A 503
`plane_unavailable` or `unavailable` means the database or TLS did not answer; check `FACTORY_DB_CA_PEM` and the pooler host first.
The Admin API does not test `BRAIN_OS_URL` or `BRAIN_OS_ANON_KEY` for a value: with either unset, every call is refused by the
token check, as 401 `not_authenticated` or 503 `unavailable`, so check both when a founder session is refused.

## 6. Release storage (CR-004 Option A)

- Create a **public** Storage bucket `factory-releases` on the Factory project.
- A release lives at `factory-releases/production/<version>/BrainFactorySetup.exe` beside
  `.../BrainFactorySetup.manifest.json`.
- The production-channel runtime has this address compiled in
  (`https://npvhuoozkbexddnvkqsj.supabase.co/storage/v1/object/public/factory-releases/production`). Setup finds its signed manifest
  there, so the one human download on a new PC is `BrainFactorySetup.exe`. The Computers page serves both links and can measure the
  file as served ("Check the served file").

## 7. A live release (needs C-3)

1. After C-3, the Director issues the WO-6 revision with the founder's public keys. The implementer's next candidate adds exactly
   those bytes to `scripts/factory-runner/enrolled/trust/production.json`, and that candidate is verified and CERTIFIED.
2. The verifier rebuilds the production channel from the CERTIFIED SHA
   (`node scripts/factory-build/build-sea.mjs --channel production`, then `verify-build.mjs`), and the receipt records the digest.
3. The founder signs the manifest whose digest equals that receipt's reproduced digest, using the C-3 key:

   ```
   node scripts/factory-build/release-manifest.mjs make --artifact <exe> --channel production --version <v> --source-sha <sha> --receipt-sha256 <receipt sha256> --out manifest.json
   node scripts/factory-build/release-manifest.mjs signing-input --manifest manifest.json
   # sign that input with the C-3 key (outside this repository)
   node scripts/factory-build/release-manifest.mjs attach-signature --manifest manifest.json --key-id <id> --signature <b64url>
   ```

4. Optionally Authenticode-sign the exe. The digest does not change (S-5).
5. Upload the exe and its manifest (step 6). Then publish through the Admin API, which is founder-only (tier founder and live role
   founder): Brain OS → Factory → Computers, or `POST /v1/admin/publish-release` with the manifest's fields.

## 8. Brain OS web

The Computers page (`web/app/(app)/software-factory/computers`) and the retirement of `/software-factory/workers` reach production
only through a pull request into the protected `master`. The web needs no new environment variable in production: its defaults are
the Factory project's public function URL and release storage. A preview pointed at a disposable plane may set
`FACTORY_ADMIN_API_URL` and `FACTORY_RELEASES_URL`, and only a Supabase project over HTTPS or a loopback address is accepted. Brain
OS production gets no schema change (S-9).

## 9. Afterwards

- Re-enroll the two existing PCs through Add computer, one at a time, with the live legacy node stopped by the founder first. Legacy
  adoption keeps their node ids.
- When both run enrolled, the founder retires the shared `factory_runner` credential.
- The third PC's zero-touch acceptance follows `ZERO_TOUCH_ACCEPTANCE_SCRIPT.md` (not run; it needs steps 1–8 and C-3).

## R. Rotate the `factory_runner` password after step 1

This step does what `qa/work-orders/FACTORY_CONTROL_PLANE_SETUP.md:114` says about rotation: change the role's password, update
the variable on each node, restart. It changes the password and nothing else.

As `postgres` (which administers `factory_runner` through the ADMIN option PostgreSQL gave it when it created the role during the
`69df2f52` provisioning), in psql:

```psql
\password factory_runner
```

Enter a new random password of letters and digits only (so the URL needs no escaping), at least 32 characters, from the founder's
password manager. psql computes the SCRAM verifier locally: the password never appears in a statement, a server log, a shell history
or a command line. Then, on each legacy node, replace the password in `FACTORY_RUNNER_PG_URL` in `~/.brain-factory/runner.env` with an
editor (never a command line), and restart the node (`install-autostart.ps1 -Start`). A node still holding the old password stops
claiming and its leases expire, so another node resumes its work.

Read back, as `postgres`: each returns no row. The first: `factory_runner` holds no privilege on any authority record. The second:
no default-privilege entry in schema `factory` reaches `factory_runner`.

```sql
select t from unnest(array['factory.tenants', 'factory.tenant_admins', 'factory.computers', 'factory.authorization_envelopes',
  'factory.agent_principals', 'factory.node_credentials', 'factory.computer_fingerprints', 'factory.pairing_codes',
  'factory.enrollments', 'factory.enrollment_transitions', 'factory.pairing_attempts', 'factory.node_sessions',
  'factory.node_assertion_jtis', 'factory.audit_events', 'factory.verification_policies', 'factory.verification_policy_versions',
  'factory.certifications', 'factory.releases', 'factory.release_revocations']) t
 where pg_catalog.has_table_privilege('factory_runner', t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');
```

```sql
select d.defaclobjtype, a.privilege_type from pg_catalog.pg_default_acl d, pg_catalog.aclexplode(d.defaclacl) a
 where d.defaclnamespace = 'factory'::regnamespace and a.grantee = 'factory_runner'::regrole;
```

Two Director runbook rows (`qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md:68` and `:175`) rotate this password by re-running
`provision-control-plane.mjs`. Do not follow them on a plane that has step 1: use step R. The Director decided which runbook applies
after step 1 in CR-006 (APPROVED): step R, and the provisioner is never re-run on such a plane. The implementer's measurement went to
the Director privately, through the founder (ledger rule 3).
The second read-back above lists any default privilege reaching `factory_runner`, and it must list none.
