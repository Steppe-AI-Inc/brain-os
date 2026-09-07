# Founder action runbook — P1 `PRODUCTION_WRITE_AUTHORITY_NOT_TECHNICALLY_ENFORCED`

Nine actions only the founder may execute. **None of these has been run.** Each is prepared as an
exact, copy-pasteable change with the check that proves it landed. Order matters: **§1 before §2** or
the protected environment is decorative (an identity that can administer environments can remove its
own reviewers).

Auto mode covered everything else; it is done and listed at the end so you can see what these
actions are switching on.

---

## Before you start — two 30-second reads (no change)

| Check | Where | Why |
|---|---|---|
| `treyopenspot`'s role on team `steppe-ai` | Vercel → Team Settings → Members | Decides whether the Vercel session on the laptops can deploy/change prod env. Probes could not determine this without mutating. Record the answer in `qa/verification/INCIDENT_2026-09-04_SERVICE_ROLE_FALSE_EXPOSURE.md`. |
| Repo visibility decision | GitHub → `Steppe-AI-Inc/brain-os` → Settings | The repo is **public**. Required reviewers + branch protection are free only because of that. If you make it private, protected environments need Team ($4/user/mo) — decide *before* §2. |

---

## §1 — GitHub identity & secret separation *(founder items 4, 5, 6)*

**Goal:** the identity that runs agent sessions cannot administer the approval boundary or read the
production secret. Today the laptop token has `admin:true` + `workflow` scope, `master` is
unprotected, and `SUPABASE_ACCESS_TOKEN` is a **repository-level** secret readable by any workflow on
any branch.

### 1.1 Create a machine token *(item 4)*
GitHub → Settings → Developer settings → Fine-grained tokens → **Generate**
- Resource owner: `Steppe-AI-Inc`; repository access: **only** `brain-os`
- Permissions: **Contents: Read & write · Pull requests: Read & write · Metadata: Read**
- **Do NOT grant:** Administration, Workflows, Secrets, Environments, Actions
- Expiry: 90 days (put the renewal in your calendar)

On **each** dev machine (Main PC, Work PC):
```
gh auth logout
gh auth login --with-token   # paste the machine token
gh api -i user | grep -i x-oauth-scopes        # fine-grained tokens show no classic scopes
gh api repos/Steppe-AI-Inc/brain-os --jq .permissions.admin   # must print: false
```
**Proof:** `ROUTE_5_github_identity_cannot_administer_the_boundary` passes.
Keep your **own** admin identity in the browser only.

### 1.2 Protect `master` *(item 5)*
Settings → Rules → Rulesets → **New branch ruleset**: target `master`
- ☑ Restrict deletions ☑ Block force pushes ☑ Require a pull request before merging (0 approvals is fine for now)
- ☑ Require status checks to pass → add **`authority-boundary / controls`** and **`migration-validation`**
- Bypass list: **empty** (not even you — use the PR path)

**Proof:** `gh api repos/Steppe-AI-Inc/brain-os/rulesets --jq '.[].name'` shows it; a direct `git push origin master` from a laptop is refused.

### 1.3 Create the protected environment *(item 5)*
Settings → Environments → **New environment**: name **`production-db`** (not `Production` — the seven Vercel-created ones have `protection_rules: []`)
- ☑ Required reviewers → **your GitHub user**
- ☑ Prevent self-review
- Deployment branches: **Selected branches → `master` only**
- Environment secrets (added in 1.4): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
- Environment variable: `PRODUCTION_PROJECT_REF=pvphxgrtdfrudejjhzjk`

**Proof:** `gh api repos/Steppe-AI-Inc/brain-os/environments/production-db --jq .protection_rules` is non-empty and names you.

### 1.4 Move the production secret *(item 6)*
1. In Supabase Dashboard → Account → Access Tokens: **generate a new token** named `github-production-db-broker`.
2. Add it as an **environment secret** on `production-db` (1.3) as `SUPABASE_ACCESS_TOKEN`; add `SUPABASE_DB_PASSWORD` the same way.
3. **Delete** the repository-level secret: Settings → Secrets and variables → Actions → `SUPABASE_ACCESS_TOKEN` → Remove.
4. **Revoke** the old token in the Supabase dashboard (the one that was repo-level).

**Proof:** `ROUTE_5b_no_repo_level_production_secret` passes; `gh api repos/Steppe-AI-Inc/brain-os/actions/secrets --jq '.secrets[].name'` is empty.

---

## §2 — Remove production authority from dev machines *(item 3)*

On **each** machine, after §1 (so the broker has its own credential first):
```
npx supabase logout
cmdkey /list | findstr /i "Supabase"      # must print nothing
```
Then in Supabase Dashboard → Account → Access Tokens: **revoke** the token(s) the laptops were using
(local logout does not invalidate a token that has been usable for weeks).

Unlink the worktrees (no credential in this, but it removes the *target*):
```
del supabase\.temp\project-ref   # in every worktree that has one — 37 carry .temp/
```
**Proof:** `ROUTE_1_no_ambient_supabase_cli_authority` and `ROUTE_1b_no_supabase_credential_in_the_os_store` pass on **both** machines. Until they pass on the Work PC too, the invariant does not hold.

---

## §3 — Supabase roles the broker and factory need *(item 9 — DDL, so founder-only)*

Run once in the Supabase SQL editor (production). This is DDL and is the chicken-and-egg the plan
disclosed: the least-privilege boundary cannot bootstrap itself.

```sql
-- Read-only role for live verification (live_preflight_abd.mjs --pre/--post).
create role brain_os_readonly login password '<generate>' nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema public, supabase_migrations to brain_os_readonly;
grant select on all tables in schema public, supabase_migrations to brain_os_readonly;
alter default privileges in schema public grant select on tables to brain_os_readonly;
alter role brain_os_readonly set default_transaction_read_only = on;

-- Least-privilege role for factory workers (scripts/factory-runner/db.mjs). DML on the factory
-- tables only; no DDL, no supabase_migrations, no finance.
create role factory_runner login password '<generate>' nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema public to factory_runner;
grant select, insert, update on public.tasks, public.agent_runs, public.agents, public.worker_heartbeats,
  public.founder_notifications, public.plugin_sources, public.plugin_components,
  public.agent_plugin_attachments to factory_runner;
```
Store `LIVE_READONLY_PG_URL` (session pooler URL for `brain_os_readonly`) as an environment secret on
a **`production-readonly`** environment (no reviewers needed — it cannot write; `openReadOnlyDb()`
proves that with a DDL probe expecting SQLSTATE 25006 before handing over the connection).
`FACTORY_RUNNER_PG_URL` goes wherever the factory runs — never on a machine that also runs agent
sessions with the old CLI login.

**Proof:** `qa/scenarios-runner/factory_runner_least_privilege.sql` (to be written against the live role) and the `LIVE:` case in `qa/dbtest/readonly_connection.regression.test.mjs`.

---

## §4 — The production DB *(item 7 — nothing until §1–§3 are done)*

**Do not** apply, repair, roll back or alter anything by hand. The first brokered operation is the
**reconciliation** of C (`202609020003`) and `202609040001`, and it needs your decision first:

| Option | What it means | How |
|---|---|---|
| **Keep** | Accept that C and 040001 are live; authorize them retroactively | New manifest `AUTH-2026-09-RECONCILE-001` with `execution_model: ALL_PENDING`, approved = `[]`, and a `reconciliation` block acknowledging both as already applied. Broker records it; no SQL runs. |
| **Reverse** | Write forward migrations that undo C and 040001 | New migrations + manifest; the broker applies them like any release. C is the messaging transport foundation the master plan defers past Phase 11 — reversing is consistent with the plan. |

Either way the **first** run of `live_preflight_abd.mjs --post` through `brain_os_readonly` tells
us whether A/B/D/C/040001's objects actually exist or whether `db push` recorded them and no-op'd.
That measurement comes before the decision.

---

## §5 — Edge Function *(item 8)*

Waits on the #48 loop closing with a fresh PASS. When it does, the deploy goes through the same
protected environment (`ALLOW_FUNCTIONS_DEPLOY=1?` is the only question you will get), and
`scripts/factory-runner/verify-deployed-bytes.sh` runs in CI afterwards.

---

## §6 — Service-role key *(items 1, 2 — NOT REQUIRED)*

Per the corrected finding: the key is **Secret/Hidden** in Vercel, `env pull` writes `[REDACTED]`,
and no live value has been found on disk. Rotation is **optional hygiene**, not remediation. Nothing
here to do unless new evidence appears (see the incident record for the three triggers).

---

## What auto mode already did (so you can see what the actions above switch on)

| Control | Where | State |
|---|---|---|
| Broker decision core, 31 refusals incl. the incident, `ACTUAL_PENDING_SET == AUTHORIZED_PENDING_SET` | `scripts/release-broker/plan.mjs` + tests + layered-defence proof | green, all 7 new guards proven |
| Release workflow (thin shell around the core; production secret only in the approved job) | `.github/workflows/production-db-release.yml` | written; inert until §1.3 exists |
| A/B/D manifest with real LF hashes | `governance/authorizations/AUTH-2026-09-ABD-001.yaml` | broker refuses it today (`EXCLUDED_ALREADY_APPLIED`) — correct |
| Destructive harness needs positive proof of disposability | `qa/dbtest/disposability.mjs` + 12 adversarial tests, 5 guards mutation-proven | green |
| Read-only live connection, proven by 25006 probe | `qa/dbtest/db.mjs::openReadOnlyDb` + regression | green (LIVE case skipped until §3) |
| Factory accessor: DML only, no `--linked`, no fallback | `scripts/factory-runner/db.mjs` + tests | green; **10 scripts still on the old path** (inventory test red on purpose) |
| Machine-authority test | `qa/scenarios-runner/production_write_authority.regression.test.mjs` | **5 assertions red on this machine** — they go green as §1–§2 land |
| Secret evidence four-state rule | `qa/lib/secret_evidence.mjs` + tests | green |
| CI: all of the above, no credentials | `.github/workflows/authority-boundary.yml` | written |
