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
| 1 migration | CERTIFIED receipt; the Director's wrapper | the live Factory plane (`npvhuoozkbexddnvkqsj`) |
| 2 API logins | step 1 | two roles on the live plane |
| 3 Factory admins | step 1 | `factory.tenant_admins` |
| 4 Edge secrets | steps 2, 3 | the Factory project's function secret store |
| 5 deploy the two functions | step 4; `ALLOW_FUNCTIONS_DEPLOY=1?` asked once | Edge Functions on the Factory project |
| 6 release storage | step 5 | a public Storage bucket on the Factory project |
| 7 a live release | C-3; a CERTIFIED reproduced digest | the bucket, the Admin API `publish-release` |
| 8 Brain OS web | a PR into `master` | Brain OS production (Vercel) |
| 9 re-enroll the two nodes, retire `factory_runner` | steps 5–8 | the two existing PCs, the live plane |

## 1. Apply the control-plane migration (WO-1; AC-11)

- From a clean checkout of the CERTIFIED SHA, compose the migration body:

  ```
  node scripts/factory-control-plane/migration.mjs compose > factory_control_plane_v1.sql
  node scripts/factory-control-plane/migration.mjs sha256
  ```

  The printed sha256 must equal the one in the candidate report.
- The **Director** wraps that body with the Director-specified wrapper (WO-1 boundary). The wrapper recomputes the
  `BASELINE_69df2f52_EVIDENCE_MANIFEST.json` set hashes after the migration's last statement and before `COMMIT`, and aborts on any
  difference. The Director's receipt records the wrapped file's sha256.
- The founder applies **exactly that wrapped file** as the plane's admin login, through the authorized production-database path (the
  release broker, `scripts/release-broker/`). The migration opens no transaction of its own. The wrapper holds it in one transaction,
  so a failed self-check (`990_finalize.sql`) or a manifest difference rolls everything back.
- The migration refuses the Brain OS production project by name and creates only NOLOGIN roles: `factory_owner`, `factory_node_api`
  and `factory_admin_api`.

## 2. Give the two API roles a login (least privilege is already in the migration)

Generate each password on the founder's machine, and never print it into a log or a chat:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

```sql
alter role factory_node_api  with login password '<generated password 1>';
alter role factory_admin_api with login password '<generated password 2>';
```

Read back:
- `select rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname like 'factory_%'` shows
  login only on the two API roles.
- `has_table_privilege` is false for both roles on every `factory` table.

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

Set the values through the dashboard (Edge Functions → Secrets) or `npx supabase secrets set --project-ref npvhuoozkbexddnvkqsj
--env-file <a file outside the repository>`. Never put them on a command line.

| name | value |
|---|---|
| `FACTORY_NODE_DB_URL` | `postgresql://factory_node_api.npvhuoozkbexddnvkqsj:<password 1>@<the project's pooler host>:6543/postgres` (transaction pooler) |
| `FACTORY_ADMIN_DB_URL` | the same, with `factory_admin_api` and password 2 |
| `FACTORY_DB_CA_PEM` | the project's database server CA (Dashboard → Database → SSL configuration → download), the whole PEM. It is public, not a secret. Without it both functions answer 503 `misconfigured` (S-10: TLS verify-full) |
| `FACTORY_PAIRING_PEPPER` | base64 of 32 random bytes: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `FACTORY_PAIRING_PEPPER_VERSION` | `1` |
| `BRAIN_OS_URL` | `https://pvphxgrtdfrudejjhzjk.supabase.co` |
| `BRAIN_OS_ANON_KEY` | the Brain OS project's public anon key |

The URLs must name the pooler **host name**, never an IP address. `_shared/db.ts` refuses an IP literal, because the certificate's
name can only be checked against a name.

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

A 503 `misconfigured` names what is missing. A 503 `plane_unavailable` or `unavailable` means the database or TLS did not answer;
check `FACTORY_DB_CA_PEM` and the pooler host first.

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
