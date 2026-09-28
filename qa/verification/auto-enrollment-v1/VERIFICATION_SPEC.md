# Verification specification — Factory Node Management + Zero-Touch Auto Enrollment (V1)

How a distinct authorized verifier certifies or rejects a milestone candidate, and how QA records are written.

- **Part of:** the canonical contract (`docs/architecture/features/factory-node-management-auto-enrollment.md`).
- **Single writer:** the DIRECTOR capability.
- **Governance:**
  - `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`;
  - founder text II.3, II.6, II.8;
  - `CLAUDE.md` §3, §6 and §7.

## 1. Two layers, and the principals of each

There are two different "certifications", and the rules of one never stand in for the other.

**Product layer** (what the candidate builds). A Factory certification run in the product is governed by S-13 and S-16:
- enrolled identities, envelopes and verifier authority;
- the authoring set;
- the certification front door.

This is what AC-3, AC-9 and AC-14 test inside the candidate.

**Governance layer** (this milestone's candidates; this document):

| role | who | identity |
|---|---|---|
| **Author** | the implementer sessions on the implementing machine (placement: DESKTOP-8P5HVAO) | the **implementer signing key**: an SSH commit-signing key generated on the implementing machine, with the public key registered in the ledger JSON as `implementer_signing_key` by a Director entry. Every commit in the §3.1 range must verify against it, or against another key confirmed as §3.1 states and recorded in the ledger JSON as `additional_implementer_keys` (never replacing it), or a founder-ordered key awaiting confirmation, in which case only the CERTIFIED entry waits (§3.1) |
| **Verifier** | the verifier session on a different physical machine from every author (placement: DESKTOP-MDPE6FS; S-16b) | the session id plus the machine, as attested by the Director. Its authority is a **Director-issued verifier assignment**, recorded in the ledger for that candidate before the run |
| **Director** | the single writer of the ledger, the acceptance state and the receipts' commits | the **Director signing key** (`director_signing_key` in the ledger JSON) |

**Keys are authenticated outside the branch.**
- The verifier obtains the Director's public key from the Director directly (its out-of-band record), never only from the branch. It
  verifies the designated Director commit's signature before reading any criterion from it.
- The implementer key is confirmed by the founder before the Director records it: CR-005's key by founder ruling (II.13); another
  implementer key by a founder decision that names its fingerprint (§3.1). For this milestone the key published in CR-005 is
  recorded as `implementer_signing_key`, CONFIRMED by founder ruling on 2026-09-26; the allowed-signers file is built as §3.1 states.

- The legacy nodes' "cannot certify release candidates" and S-13's "current envelope" clause apply to the product layer. They do not
  apply to governance receipts.
- **Criteria source.** The verifier reads every criterion from the Director branch at the **Director commit the ledger designates for
  that candidate**. By default that is the latest published Director commit when the candidate notice arrives; a local-only Director commit is never
  designated. It never reads a criterion from the
  candidate tree. If the candidate notice names a different Director commit, the Director either re-designates or REJECTS.

## 2. Trigger

The IMPLEMENTER publishes a **candidate notice** on `factory/auto-enrollment-v1-implementation`. It contains:
- READY FOR INDEPENDENT QA;
- the frozen SHA;
- the Director commit it was built against;
- the WO ids it claims;
- the login roles its handlers connect as (the API logins, §3.3);
- every change request it relies on: path, commit and sha256 (ADR, change-request path rule);
- its own test output. That output is information only and never counts toward a verdict (`CLAUDE.md` §3).

The notice, like every public implementer record, follows ledger rule 3 ("Public implementer records", founder text II.16).

## 3. Procedure, one pass per candidate

There are no exploratory rounds. A failure is a finding, and the verdict is REJECTED. **Every candidate row and every rehearsal runs on
every candidate** (AC-5..AC-12, AC-14..AC-16; R-1..R-4), whichever WO ids it claims. A missing subject is a finding, never a skip.
AC-10's Edge clause is the one exception: every receipt records it PENDING, and the Director resolves it before the CERTIFIED
entry (§3.11).

1. **Checkouts, hashes and authorship.**
   - Make a fresh scratch clone at exactly the candidate SHA, plus the Director branch at the designated commit. Record both
     `git rev-parse` values.
   - Recompute the ledger's document-set and WO hashes against the designated commit.
   - Check that the candidate tree's copies of every canonical document, the WO texts and the ledger files are **byte-identical** to
     the designated commit's. Different copies make the candidate REJECTED.
   - **Authorship check:** every commit in `<designated Director commit>..<candidate SHA>` must verify (`git verify-commit`, with an
     allowed-signers file built from the ledger's `implementer_signing_key`, every `additional_implementer_keys` entry, and a founder-ordered
     key awaiting confirmation; the receipt records each commit's verifying fingerprint). An unsigned, foreign-signed or Director- / verifier-signed
     product commit is a finding (S-16a, S-13).
   - From the §4 authoring-set field: no Home-computer run is in the authoring set of a work order whose commits change a path outside
     the Director-document paths (S-16). The receipt records that a signature proves the signing key, not the authoring machine.
   - S-16's key-custody rule covers the product code that the range's commits carry. The byte-identical copies above, and S-16's
     two cases of copied Director-recorded bytes (fixed names and values; after C-3, the WO-6 trust-set bytes checked below), are
     Director inputs, never a finding under it.
   - The receipt records the fingerprint of every key in the allowed-signers file and, per commit, the verifying fingerprint. Each
     key is `implementer_signing_key`, an `additional_implementer_keys` entry, or the founder-ordered key that a change request
     publishes, where the designated commit's event log records the founder order and the Director's decision accepting that change
     request, with a matching sha256. `implementer_signing_key` is not regenerated or
     replaced (founder text II.13). The one exception is another implementer
     key that exists by founder order, recorded as a founder decision in the event log: receipts then proceed with it, and only
     the CERTIFIED entry waits (not a gate under II.11) until it is confirmed: a founder decision names its fingerprint, a
     change request in the implementer namespace publishes the same key, Director checks verify the commits against it, and a
     Director entry records it in the ledger as `additional_implementer_keys`, never replacing `implementer_signing_key`. When the
     order itself names the fingerprint, it is the confirmation and nothing further is asked; otherwise the one later founder
     decision naming it is the confirmation (a one-time founder action, ledger rule 4, not a gate). The II.13 confirmation of the
     CR-005 key is never re-run.
   - **Change requests** (founder ruling II.12; ADR). A change request is a file under the implementer namespace
     `qa/implementation/auto-enrollment-v1/change-requests/` on the implementation branch; one filed anywhere else is not received
     (recorded, not a finding). Every change request the notice names or the candidate implements has a Director decision with a
     matching sha256 in the designated commit's ledger. Implementing against an undecided or rejected change request is REJECTED
     (AC-12(d)); a pending submission the candidate does not rely on is recorded, not a finding. Historical CR-001..CR-004 stay
     at `qa/work-orders/change-requests/` (founder text II.12), outside the namespace rule; one the notice names or the candidate
     implements matches the sha256 of its entry in the ledger's ratification register. Any other proposal filed outside the
     implementer namespace is never decided, so implementing against it is implementing against an undecided change request.
   - **Migration files:** a change in the range to a file under `supabase/control-plane/` that exists at `69df2f52`, or to a file a
     founder-applied step embedded, is a finding (contract §1, "The candidate migration").
   - After C-3, the candidate's trust-set source equals the bytes recorded in the Director's WO-6 revision.
2. **Isolation (S-15).**
   - Verification runs on:
     - disposable PostgreSQL: `qa/factory/local_pg.mjs` for the certified reference suites, and a **judging plane** (step 3, "The
       judging plane") for every plane that judges the candidate;
     - local function runtimes;
     - a **disposable Brain OS auth stack** for AC-7, R-1 and R-2: a local Supabase started by the CLI with `supabase/migrations/`
       applied at `55a15917` (including `profiles_update_self_or_admin` as in production), and the AC-7 personas seeded, including a
       self-updated `profiles.role`. The Admin API derives the role through the same calls it makes in production; a stubbed role
       check never counts;
     - a disposable clean Windows environment for R-1.
   - It writes nothing to the live legacy checkout, the live task, `runner.env`, the live plane, production, `master` or the acceptance
     machine.
   - **Candidate code runs apart from the Director's secrets.** Every candidate build, suite and tool, and every dependency install
     script, runs as a separate standard OS account that cannot read the Director signing key, `runner.env`, the Director's records
     or the verifier session's environment; its environment is an allowlist (no session token, key-log file or askpass hook); the verifier fixes the allowlist (variable names) and the protected-location list (the verifier's secret locations, as directories) before the account's first run, never from the candidate tree, and the receipt records both with the isolation proof. Every credential created later (each cluster's credentials, the Edge token, the observer credential) is written only under a listed location, and the denied reads (below) are proved before each candidate's first run, again after each cluster's credentials are issued, and again after any other such credential is written, before candidate code next runs; the receipt records each proof. The
     account belongs to no administrative, remote-access or container-engine group. The protected locations hold the founder-provided
     Edge token and the observer credential once they exist. Before each candidate's first run the account's home, temporary and
     working directories are emptied and its scheduled tasks and processes removed, so no state from an earlier run survives. A
     container runtime that executes candidate code is started by that account, or with only the scratch clone and the working
     directory mounted. The verifier then proves the isolation (the account's group memberships and privileges, none beyond a
     standard user's; a denied read of each protected location, and a denied open of each credential file in it by its full path; the environment holding only the allowlist; each container runtime's
     mounts) and records the proof as receipt evidence. The judging planes' logins are protected as §3.3 ("Plane logins") states. Verifier scripts pin their working directory outside every live checkout and write only absolute paths.
   - The Director may **read** the live plane for AC-10 and AC-11.
3. **Baseline (AC-11).**
   - Check the branch refs, the legacy nodes' plane records and the checkout rule.
   - Load `BASELINE_69df2f52_EVIDENCE_ROWS.json` unchanged into a judging plane provisioned as `69df2f52` (below; the verifier adds no
     row and fills no column), apply every founder-applied step in event-log order (at the sha256 its certifying receipt records), run
     the live-migration step below on it, and re-hash with `tools/baseline_manifest.mjs`, run with
     `FACTORY_TARGET=disposable`, `FACTORY_RUNNER_PG_URL` naming that plane's non-superuser `factory_runner` login (user, password,
     port and database; `db.mjs` refuses a superuser), no other credential variable, no `FACTORY_RUNNER_ENV_FILE` or `PG*` variable and
     no redirected home directory (the tools refuse them), and `FACTORY_BASELINE_CHECKOUT` a fresh `69df2f52` clone after `npm ci`
     (never the candidate tree, never the live legacy checkout). The tools refuse a ROOT unless `db.mjs`, `runner-env.mjs`,
     `url-judge.mjs` and `package-lock.json` have the sha256 of their `69df2f52` blobs, every installed package on `pg`'s dependency
     path has its `69df2f52` lockfile version, and no `node_modules` under `scripts/` shadows them; a disposable read also needs
     ROOT's HEAD to be `69df2f52` and ROOT not to be the live legacy checkout. Installed package files are not hashed (a recorded
     limit), so the clone and its `npm ci` are the verifier's own. The set hashes it prints must equal the manifest's, and the receipt
     records the tool's observed identity: the disposable plane's, with ROOT's HEAD `69df2f52`.
   - **The live-migration step** (AC-11; WO-1 founder boundary). The verifier builds it with `tools/build_live_migration_step.mjs` at
     the designated Director commit, from the candidate migration: the committed blobs (`git show <candidate sha>:<path>`, never a
     working-tree copy) of the candidate migration (contract §1): every `.sql` file the candidate adds under `supabase/control-plane/`,
     recursively, excluding `supabase/control-plane/edge/`, since `69df2f52`, or since the last founder-applied step once one
     exists, given by repository-relative path in byte order of path (the tool refuses any other order, and a duplicate). The implementer never supplies or edits the step. A
     refusal to build it is an AC-11 finding. Each embedded migration's printed sha256 equals its committed blob's. The tool's header
     states why its check means that the manifest hashes are unchanged.
   - **The judging plane.** Every disposable plane that judges the candidate (this step's copies, the planes of §3.5, AC-10's
     catalog difference and the rehearsals R-2..R-4) is a local Supabase database started by the Supabase CLI (the database only,
     separate from step 2's auth stack; a CLI project of the verifier's own, initialized in a scratch directory with no migrations
     and no seed, never the candidate tree; the receipt records the CLI version and the database image digest), on PostgreSQL of the referent's major version (17; its `observed.server_version`; the minor version is the image's and is not compared, a recorded limit). Only that image carries the
     platform's roles, schemas, extensions and event triggers. The **referent** is `LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json`
     until the first founder-applied step; after one, it is the latest live catalog read that AC-10 found as expected, committed as a
     Director observation record (an observer-login read is taken from its local-only full-read file, checked against the
     published `full_read_sha256`; AC-10).
     - **Alignment.** First, the plane's bootstrap superuser (`supabase_admin`) makes the plane equal to
       `LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json` in the roles and their attributes, the role memberships with their admin,
       inherit and set options and grantor, the database ACL, the schema ACLs, the default privileges, the extensions and the event
       triggers. It leaves alone what the `69df2f52` provisioning and the founder-applied steps create (the event log lists each applied
       step's embedded files): the applying login makes those below, by provisioning and by replaying the steps. An object they change
       is aligned to its pre-candidate state first and then changed by the replay.
       It sets every role's settings, and the server's `createrole_self_grant`, to the values `APPLYING_ROLE_OBSERVATION.json`
       records (a read-only Director record made by `tools/applying_role_observation.mjs`: the live `postgres` and every role's
       settings; both records hold a setting whose name suggests a secret by name only). Each role's settings become exactly the recorded ones (added,
       changed or reset); a secret-named setting is set by name with a value of the verifier's choosing, never a live value. The
       plane's database is created with the referent's encoding, collation, ctype, locale provider, locale and ICU rules (its
       `database` section); a plane whose `database` section differs cannot be aligned and judges nothing. The collation library's version is
       the image's and is not compared: a recorded limit. Once the founder-applied steps are in place it creates
       the reader (§3.5); otherwise it serves only the read-backs.
     - **Plane logins.** Each judging plane is its own verifier cluster (its own CLI project). Here **candidate code** is any
       candidate process: a build, an install script, a suite, a tool, a handler or the node runtime; **the step** is the
       live-migration step (above), which the verifier runs as the applying login and which is not candidate code. The cluster
       is started, and every login in it except the candidate's API logins is given a fresh credential that only the verifier
       holds (never the CLI default), within one evidence phase (below) and before candidate code first reaches it. The
       verifier writes those credentials only under a protected location (§3.2).
       - **The candidate's API logins** are the login roles the candidate notice lists as its handlers' logins (§2), each
         created by the candidate migration or by a founder-applied step; the receipt records the list. The Director's event-log entry for a founder-applied
         step names, with its embedded files, the API logins its certifying receipt lists. None is `postgres`, `supabase_admin`,
         `authenticator`, `factory_runner`, the reader, a platform role, a predefined `pg_*` role, or a role present on the
         referent other than an API login a founder-applied step created. Each is an API role under S-10, and a §3.5 read-back
         of its attributes and of its `pg_auth_members` rows, followed transitively with the admin, inherit and set options,
         shows that the login and every role it reaches are NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOREPLICATION and
         NOBYPASSRLS, own no object, and hold no privilege beyond what PUBLIC holds other than USAGE on the front doors' schema
         and EXECUTE on its own front doors. Every role it reaches is NOLOGIN, was created by the candidate migration or a
         founder-applied step, and is neither a predefined `pg_*` role nor a platform role. A listed role that fails this is a
         finding and is handled as a non-API login, and so is a login the migration creates that the notice does not list. The
         verifier sets the API logins' credentials after the after-step refused-connection proof and its comparisons, and the local
         function runtimes receive only those.
       - **After the step** the bootstrap superuser compares each role's LOGIN attribute, credential and validity with its
         state before the step (a role the step created had none), and records as a finding each change to a pre-existing role
         and each credential or validity the step gives a role it creates (API-role credentials are a founder boundary;
         AC-10). The verifier then gives each changed role other than an API login a fresh verifier-held credential (NOLOGIN
         if it could not log in before the step), and gives `factory_runner`, the reader and every other login created after
         the credentials were issued, except the API logins, verifier-held credentials. Only then does it take the
         refused-connection proof. The receipt records the comparison.
       - **Refused connections.** Right after the cluster's credentials are issued, and again after the step (above), the
         verifier shows a refused connection for every login other than the API logins. It tries the CLI default credential,
         every credential the isolated account can read, and every credential in the environment or mounts of each container or
         VM that executes candidate code, from the isolated account and from inside each such container and VM (one started
         later is probed before candidate code runs in it), over the address it uses. The receipt records each such container's
         and VM's environment variable names, never values, and the plane's host-based authentication rules, showing that no
         trust or peer rule matches a source candidate code can use. Immediately before and immediately after each proof after
         the step, and once after each cluster's last candidate process ends, the bootstrap superuser also compares each
         role's LOGIN attribute, credential and validity with their state when the verifier last set credentials (a role
         created since had none); the receipt records each comparison. A difference is a finding, since besides the verifier
         only the step and candidate code write the plane (S-10: no DDL from any API). A connection not refused is a finding
         (REJECTED) when any comparison shows that the step or candidate code changed or created that login. Any other
         connection not refused, in any proof, is a verifier setup failure and never a candidate defect: that cluster judges
         nothing, the pass continues on a new cluster, and the receipt keeps the voided cluster's records.
       - **Probes that act as `factory_runner`.** The verifier's own probes for the cases that WO-1's legacy-refusal tests and
         AC-9's legacy side list, and for AC-12(g), run as the verifier, from its own `69df2f52` clone outside the isolated
         account, with the verifier-held credential. The candidate's own tests for these cases run in the isolated account and
         never receive that credential; the verifier's probes judge the rows.
       - **Step 2's auth stack** follows the plane-logins rule above, except that its own service containers (none of which
         executes candidate code) run during its start phase, and except its anon key and service key, which the candidate's
         handlers receive as in production (never a database login and never the token-signing secret). The receipt records
         which keys were handed over. The AC-7 persona rows (profiles, roles, `tenant_admins` seeds), each with its `xmin`, are
         hashed once after seeding, before any candidate process runs, and again before and after every run that hands
         candidate code the service key (AC-7, R-1, R-2), with no candidate process alive while they are hashed. Every hash
         must equal the seed hash; a difference is an AC-7 finding.
       - **Evidence phases.** Each cluster's start through the issuing of its credentials, alignment, the fidelity check, every
         step run, the re-hash, the catalog-trust reads, the §3.5 read-backs and row checks, and AC-10's before and after reads
         run while the isolated account has no process and no scheduled task, no container other than the plane's own database
         container runs, and no VM executes candidate code; the verifier starts none during the phase and proves this
         immediately before and after it (receipt evidence). Every after-step evidence read above (the re-hash, the
         catalog-trust reads, the §3.5 read-backs and row checks, AC-10's after read) is taken before the API-login credentials
         are issued and before candidate code first reaches that plane; the login comparisons around a refused-connection proof
         are taken whenever that proof is ("Refused connections"). In-database schedulers and outbound calls (for example
         the platform's `cron` and `net` schemas) are covered by the §3.4 platform-schema inventory.
     - **The applying login** is the plane's `postgres`, so aligned: NOSUPERUSER, with the live role's attributes, memberships and
       settings. It provisions the plane as `69df2f52`, loads the baseline rows, and applies every founder-applied step and the
       candidate step, so owners, grants and default privileges come out as they do live. Provisioning as `69df2f52` runs, as this
       login, the statements of the `69df2f52` provisioner's dedicated-Supabase mode (`scripts/factory-runner/provision-control-plane.mjs
       --allow-dedicated-supabase`, read from step 3's `FACTORY_BASELINE_CHECKOUT`), which is how the live plane was provisioned. That
       mode's project-ref and TLS checks, which a local plane cannot meet, are not run, and its identity row names the disposable
       plane.
     - **Fidelity check.** Before the candidate step, and before anything is seeded, `tools/live_catalog_snapshot.mjs` reads the plane
       as the reader (§3.5). Every hashed section equals the referent's, the `database` section (encoding, collation, ctype, locale
       provider, locale and ICU rules) and every role's setting values included, with these exceptions only:
       - rows that name the reader;
       - `storage_buckets`, which AC-10 compares from the observer read;
       - rows the event log records as a founder-approved live change that a disposable plane does not carry (for example the
         observer role and its grants);
       - the value of a setting whose name suggests a secret, which the Director records by name only: compared by setting name.
         A setting's name "suggests a secret" when it contains key, secret, password, token or jwt, case-insensitively (the
         instruments' test); this definition is the one §3.4 and AC-10 use.
         Reading any setting is a §3.4 hit.

       A plane that differs anywhere else judges nothing. The run stops before any verdict; the Director records the differing rows
       in a Director observation record and surfaces it to the founder; the candidate stays CANDIDATE until a plane passes. The
       receipt records the referent's and the plane's `snapshot_sha256` and the result per section.
     - Server configuration outside the catalog (for example the platform's role-management hooks) and the rows inside the platform
       schemas are the image's and are not compared: recorded limits. The §3.4 scan covers code that reads them.
     - The local function runtimes reach the judging plane the way the candidate's handlers reach the live plane: a direct database
       connection as the candidate's API login. A handler that goes through another path (the platform's REST gateway) uses roles
       whose settings the fidelity check already compares.
   - The step sets `client_encoding` to UTF8 and `standard_conforming_strings` to on, and its check requires both: psql from any
     console and node-postgres store the same bytes, and the code the step runs reads literals the same way. A backslash is admitted
     only inside a dollar-quoted body, whose extent no setting changes: one simple-Query message is parsed whole before its first
     SET runs, so a single-quoted literal holding a backslash would be read according to the session's setting on arrival. A
     regular-expression constant is therefore written dollar-quoted (for example `$r$...$r$`); the instrument refuses a backslash
     anywhere else (Director r3).
   - Each run of the step below is on a fresh copy loaded as above, as the applying login, in one session, the way the founder
     applies it: one simple-Query message, or `psql -X -v ON_ERROR_STOP=1 -f`; never `supabase db query --file`
     (`qa/KNOWN_FAILURE_MODES.md` #32).
     - **Unaltered:** the step commits (the relations the migration creates exist afterwards), and the re-hash above equals the
       manifest.
     - **One evidence field altered first** (one field of one manifest row, changed before the step): the step aborts with an
       `AC-11 baseline check` exception, and the plane's catalog `snapshot_sha256` (`tools/live_catalog_snapshot.mjs`) is the same
       before and after.
     - **Mutated migration:** the step aborts when built from the candidate migration plus one statement that changes one evidence
       field; plus a deferred constraint trigger, queued by the added statements, that changes one evidence field (it would fire at
       commit); or plus a deferrable constraint trigger that changes nothing (the check refuses code that could run after it).
     - **Catalog trust:** across the unaltered run, the `pg_proc`, `pg_operator` and `pg_type` rows in schema `pg_catalog`, and every
       `pg_cast` row, are identical before and after (the check trusts them).
   - The step file is a receipt evidence file (§4), and the founder applies exactly it. Before the founder applies it, a Director
     observation record shows that the live plane holds no deferrable constraint trigger and no deferrable exclusion constraint,
     either of which makes the step abort there.
4. **Static gates:**
   - `node --check`;
   - Edge `deno check`;
   - for web changes: `tsc`, `eslint`, `next build`;
   - a PowerShell parse;
   - a secret scan;
   - the **instrument-integrity check** (S-10): any `CREATE EVENT TRIGGER`, any `CREATE CAST` to `json` or `jsonb`, any setting of
     `allow_system_table_mods`, and any write to a `pg_catalog` relation in the candidate diff is a finding;
   - the **static one-engine check**: every Edge handler authenticates and calls exactly one SQL front door;
   - the **plane-conditioned-behaviour scan** (S-10). It covers every SQL object and migration statement the candidate adds or changes,
     its Edge handlers and its prepared founder steps, which is S-10's scope.
     - **Hits.** Every reference to a value that can tell the live plane from a disposable one, or live operation from the
       verifier's run, is a hit. The scan searches at least for:
       - `factory.plane_identity`, `current_database()` / `current_catalog`, `inet_server_addr()` / `inet_server_port()`,
         `inet_client_addr()` / `inet_client_port()`, `version()`, `pg_postmaster_start_time()`;
       - a setting read with `current_setting()`, `SHOW`, `pg_settings` or `SET ... FROM CURRENT`, and an environment value that an
         Edge handler or a founder step reads;
       - `txid_current()` / `pg_current_xact_id()` and sequence values;
       - a catalog or server statistic (`pg_stat_*`, `reltuples`), and a row count that no stated rule (below) makes;
       - a literal naming a record or object that exists on the live plane or on a disposable one, but not on both (an id, name, host
         or project ref);
       - the current time compared with a fixed date, time of day or weekday;
       - a value derived from a hit, including one stored and read back. It is classed like the hit it comes from;
       - a read of any row, and any privilege probe, in a schema the catalog tool reads only by name and ACL (its platform list);
       - an exception handler that can catch an error whose occurrence depends on plane configuration (insufficient privilege, an
         undefined object, an unsupported feature, a configuration or program limit, a cancelled query, an unavailable lock, or
         WHEN OTHERS) and does not re-raise it.
     - **Not hits.**
       - Fixing a setting to a constant is not a read: a function's SET clause, such as the pinned `search_path` S-10 requires on
         every SECURITY DEFINER front door, and a SET or SET LOCAL, such as a statement, lock, idle-transaction or transaction timeout.
       - The Factory's own rows, read by a stated rule, are the plane's work, not its identity. A stated rule is a rule of the contract
         or the founder text, or a `69df2f52` rule, read from its source, that the compatibility matrix ports: for example the queue
         and its order, the eligibility gates and ranking inputs, liveness from server time, and the claim's limits. Any other read
         of those rows that can tell the planes apart is a hit.
     - **Classes.** The verifier gives each hit exactly one class. A candidate's own annotation never classifies a hit.
       - **decides** (a REJECTED finding): a branch, predicate, guard or refusal depends on it, or it chooses which record or object
         is read or written, and no class below fits.
       - **production-ref refusal**: refusing to act on the production project `pvphxgrtdfrudejjhzjk`, and nothing more. It is the
         one exception, because it behaves the same on the live plane and on every disposable plane: none of them is production.
       - **same on every plane**: a read of a setting whose value is identical on every plane by construction, such as one the same
         function or transaction pins. The receipt names the construction.
       - **the call's input**: the authenticated caller (a JWT's subject and role), the calling API role, the refusal of a superuser
         caller, the peer address the Edge platform reports (S-6) and the request's parameters, each used by one rule whatever its
         value. Inside a SECURITY DEFINER front door (S-10 requires every front door to be one) `current_user` is the owner, so the
         calling API role is read only from `session_user`. **The applying login's or an object owner's
         name or attributes** (`current_user` inside a SECURITY DEFINER body, `rolsuper`, `rolbypassrls`, `rolreplication`,
         memberships, settings), read in a migration statement, a founder step or a SECURITY DEFINER body at call time, and
         `session_user` read in a migration statement or a founder step (where it is the applying login), mark the verifier's run
         and fit no class. The
         request's host and a token's issuer or project ref name the plane and are not the call's input. A comparison with a value that
         marks a plane or the verifier's run (a host, a loopback or private address, a release channel) fits no class.
       - **own-plane addressing**: the plane's own address and keys, used the same way on every plane: the endpoint, project ref and
         credentials an Edge handler or a founder step uses to connect; the database a GRANT or REVOKE names through
         `current_database()`; the issuer and key a caller's token is verified against; the S-6 pepper as the HMAC key. Only the
         connection or the verification's outcome depends on it; no branch tests the value itself.
       - **carried**: only stored, returned or logged. A timeout or setting whose value comes from a hit is classed **decides**. A
         sequence value used only as a row id (stored, joined, compared with another id, or used to order rows) is carried. No branch
         compares it with a fixed value.
     - **Receipt.** Every hit is listed with its file, line, the construct it references (a function, setting or variable name, never
       a value, a secret or a URL) and its class (§4). An unclassified hit is a finding.
   - the **platform-schema inventory**: every SQL statement in the candidate diff that creates, alters, drops, grants on or writes to
     an object or row in a schema the catalog tool reads only by name and ACL (`auth`, `storage`, `vault`, `cron`, `net`,
     `supabase_functions`, `extensions` and the rest of its platform list), each with the contract rule it serves. The catalog
     comparison cannot see these changes (AC-10), so one that serves no contract rule is a finding;
   - the **secret-setting inventory**: every candidate statement that sets or resets a setting whose name suggests a secret (§3.3), each
     with the contract rule it serves. The catalog records such a setting by name only, so a value change is not observed live;
     one that serves no contract rule is a finding;
   - the **route / operation inventory**, which must equal S-7.
5. **Schema and privileges on the disposable plane.**
   - Every plane that judges AC-5..AC-12 and AC-14..AC-16 is a judging plane (step 3): provisioned as `69df2f52` as step 3 states,
     loaded with `BASELINE_69df2f52_EVIDENCE_ROWS.json` unchanged, then, in event-log order, every founder-applied step at the sha256
     its certifying receipt records, then, after the fidelity check, exactly the step the verifier builds from the candidate migration
     (the same bytes and sha256 as step 3), all as the applying login, with the `69df2f52` default-privilege grant to `factory_runner`
     in place. The receipt records each step's sha256. The certified reference suites (§3.7) are the exception: they create their own
     databases as their `69df2f52` bytes do (some under the clone's own `.factory` directory), and prove legacy non-regression only.
   - Read back:
     - role attributes and grants;
     - SECURITY DEFINER `search_path`;
     - `has_table_privilege('factory_runner', t, 'INSERT,UPDATE,DELETE') = false` for every authority table (S-10);
     - `has_function_privilege('factory_runner', f, 'EXECUTE') = false`, and no EXECUTE for PUBLIC, on every front door;
     - `pg_default_acl` for schema `factory`, with no default grant to `factory_runner` on the new tables;
     - `pg_auth_members` rows involving `factory_runner` equal those at `69df2f52`, and no API role is a member of `factory_runner`;
     - each API login's attributes, owned objects, privileges and `pg_auth_members` rows, followed transitively with the admin,
       inherit and set options, and the same for every role it reaches (§3.3, "The candidate's API logins");
     - no column-level grant to `factory_runner` on an authority table (`has_column_privilege` and `pg_attribute.attacl`);
     - **the rows the migration writes** (contract §1, "What a candidate migration writes"). They are read before and after the
       migration, on this plane and on the §3.3 copy, as each plane's superuser, so that no row-level security policy hides a row:
       - every table the migration creates, in any schema, holds only the seeded policy rows (below) and the one operator tenant
         row, which holds no user id and refers to no computer, principal, credential or envelope;
       - no computer, agent principal, credential, envelope, pairing code, enrollment attempt, `tenant_admins`, release, release
         revocation or certification row exists, and no S-16(a) binding;
       - no pre-existing table outside the system catalogs gains or loses a row, and every pre-existing row keeps the value of every
         column it had (row hashes over those columns, before and after). In a column the migration adds, a pre-existing row holds a
         value that refers to no computer, principal, credential or envelope;
       - any other row the migration writes is a finding. Before the first live migration this is the whole dynamic check: no
         computer table exists before the migration, so no record can be seeded, and that is not a missing subject;
     - **no migration writes an S-16(a) binding or plants an identity** (S-13, S-14), read from the SQL and the catalog:
       - from the catalog after the migration, the verifier names the table that holds computer records and the column or table
         that holds the binding. No statement the migration executes, including a `DO` block and every function, procedure or
         trigger it calls or fires, inserts, updates, deletes, merges, truncates or copies rows of them, drops them, or changes a
         value already in them. Creating them, adding a column, and defining grants, indexes, policies, triggers or functions are
         not such writes. No column default writes an S-16(a) binding;
       - no object the migration defines (a view, function, default, trigger or policy) holds a constant that identifies a Brain OS
         user, a computer record, an agent principal, a credential, a signing key or an envelope;
     - **after the first live migration** (the founder has applied a certified migration to the live plane, recorded in the ledger
       event log), the verifier also uses a second judging plane for each later candidate. It provisions the plane as `69df2f52`,
       loads `BASELINE_69df2f52_EVIDENCE_ROWS.json` unchanged, and applies every prepared live-migration step the founder has applied
       (at the sha256 its certifying receipt records), and the plane passes the fidelity check (step 3). It then seeds a bound computer
       record through that schema's Add Computer front door,
       as a Factory admin it provisions on that plane, and then applies the candidate's prepared live-migration step. The row check
       above holds on that plane, except that the rows seeded before the step exist. They are pre-existing rows, so the bound record,
       its binding and every row its Add Computer wrote keep every value they had;
     - the catalog difference for AC-10: before and after the migration, `tools/live_catalog_snapshot.mjs` runs with
       `FACTORY_TARGET=disposable` and step 3's `FACTORY_BASELINE_CHECKOUT`, as a non-superuser login that the plane's
       bootstrap superuser creates for reading once the founder-applied steps are in place (the reader), under a name that appears
       nowhere in the candidate diff or the referent. Before the before-read the reader is granted
       USAGE on schema `factory` and SELECT on the `factory` relations that exist then, and nothing else (no default privileges).
       Nothing is granted to or revoked from it afterwards, so the relations the migration adds are listed as unreadable. The
       difference (after minus before) excludes nothing, and an entry in it that names the reader is a finding. The receipt records
       the reader's name, both `snapshot_sha256` values and the difference;
     - the seeded policy rows, which must equal contract §1 exactly.
6. **Candidate rows and rehearsals.**
   - AC-5..AC-12, AC-14..AC-16.
   - AC-9, run through the Node API **and** by calling the front doors directly. The verifier checks every OLD column of the
     compatibility matrix against the `69df2f52` source itself.
   - R-1..R-4 as in the matrix header.
7. **Certified reference suites.**
   - **The set is exact.** Each file below runs at its `69df2f52` bytes in the candidate checkout, unless a Director-ratified successor
     replaces it:
     - `qa/factory/`: `acceptance.mjs`, `acceptance_mutation_proof.mjs`, `campaign_boundary_is_crossed.mjs`,
       `dbtest_on_disposable_pg.mjs`, `dedicated_supabase_provisioning.mjs`, `denominator_cannot_shrink_silently.mjs`,
       `founder_poke_not_required.mjs`, `health_check.mjs`, `http_provider_acceptance.mjs`, `instrument_validity.regression.test.mjs`,
       `model_catalog_must_not_advertise_untested_models.mjs`, `no_silent_model_fallback.mjs`, `node_truth_acceptance.mjs`,
       `package_bootstrap_regression.mjs`, `package_bootstrap_mutation_proof.mjs`, `shared_control_plane_acceptance.mjs`,
       `tls_plane_acceptance.mjs`, `waiting_costs_no_cpu.mjs`, the disposable-plane rows of `reboot_recovery_acceptance.mjs`, and
       `factory_v1_acceptance.mjs --local-only`;
     - `scripts/factory-runner/`: every `*.test.mjs` and `*.mutation.mjs`.
   - **Modules, not suites:** `local_pg.mjs`, `shared_local_pg.mjs`, `shared_pg_worker.mjs`.
   - **Excluded by S-15** (they read or drive live state): `shared_plane_live_acceptance.mjs`, `two_machine_real.mjs`,
     `two_machine_failover.mjs`, `two_machine_scheduling.mjs`, the live-task rows of `reboot_recovery_acceptance.mjs`, and the plane rows
     of `factory_v1_acceptance.mjs`. Their semantics are proved by AC-9 and R-3.
   - **Where the reboot suites run.** `reboot_recovery_acceptance.mjs` and `factory_v1_acceptance.mjs --local-only` run only in a
     separate disposable Windows VM (never R-1's instance, which is fresh), where no `BrainOS Factory Node` task exists, and never on a
     machine that holds the live task. They are judged row by row, whatever the exit code: R9a is recorded NOT RUN (S-15), and the
     suites pass when R1-R8 and every non-GATE row other than `reboot` are OK.
   - **Environment-dependent:** RS-C6 (it reads the closed Edge worktree) is registered. Any other suite that cannot run is recorded as
     NOT RUN with its reason, and blocks CERTIFIED unless the Director registers it in the ledger event log before the run.
   - **What they prove:** the baseline semantics of the shared modules (legacy non-regression). A suite that exercises only the frozen
     raw-SQL path is never evidence for P-2 on the Node API. AC-9 proves the new runtime: each compatibility-matrix regression cites
     the certified-suite assertion or assertions it ports (file:line at `69df2f52`), and runs through the Node API against the
     candidate's front doors.
8. **Reproducible build** (S-5). The verifier builds `BrainFactorySetup.exe` and the runtime from the candidate SHA and records:
   - the production-channel artifact's digest (the PE Authenticode image hash, S-5), and separately the dev-channel digest;
   - every embedded trust-set entry as (key id, sha256 of the public key), with the channel and trust mode.

   Each channel's digest must equal that channel's digest in the candidate's release manifest. A non-reproducible build, or one with an
   unpinned input (base Node executable, tool version, network fetch), is a finding.
9. **One bounded adversarial invariant audit** over S-1..S-16 and P-1..P-10. Each finding is reproduced before it counts. It answers the
   two governance tests, both expected **NO**:
   - Can the implementer define or alter the contract it is judged against?
   - Can hostname or resource fitness create authority?
10. **Mutation checks.** Reverting one guard makes a named row fail:

    | guard reverted | row that fails |
    |---|---|
    | revocation re-check inside the transaction | R-4 / AC-4 |
    | release-signature check; pinned trust set (a manifest-named key accepted); dev-key refusal in a production-channel build; trust mode or key taken from runtime input; anti-downgrade | AC-5 |
    | checkpoint fence inside the front door | AC-9 |
    | envelope self-change; tenant / identity / agent taken from the body | AC-6 |
    | each eligibility gate, removed singly; envelope-sourced gate 6 replaced by self-report; the preference-deferral bound | AC-15 |
    | independence reduced to run-only; the authoring set reduced to the completing run; the policy floor in the front door | AC-14 |
    | the stricter-only policy guard; the legacy-privilege revocation and guard; the legacy guard on new-model and enrolled rows; a role granted to `factory_runner`, or an API role that is a member of it | AC-12 |
    | rotate or re-pair issues a new principal; certification not bound to its work order and exact provenance | AC-14 |
    | the watchdog or autostart removed; a retry that issues a new code or credential; setup that requires elevation | AC-1 (R-1) |
    | a migration statement that changes one manifest evidence field, directly or through a deferred constraint trigger; a deferrable constraint trigger, a deferrable exclusion constraint or a holdable cursor left by the migration | AC-11 (the step aborts on the copy) |
    | a transaction-control statement, a backslash outside a dollar-quoted body, a psql variable reference or a COPY added to the migration | AC-11 (the tool refuses to build the step) |
    | a guard, front door or handler conditioned on plane identity, on a setting whose value differs between planes, or on the current time compared with a fixed date | AC-9 (the static scan) |
    | a column-level grant to `factory_runner` on an authority table | AC-12 (and the §3.5 read-back) |
    | a migration file left out of the step; a change to a `69df2f52` control-plane file or to a file a founder-applied step embedded | AC-11, AC-12 (§3.1) |
    | a migration that ends with SET ROLE and a row-security policy whose function writes an evidence field | AC-11 (the step aborts on the copy) |
    | a migration statement or SECURITY DEFINER body conditioned on the applying role's superuser status or memberships | AC-9 (the static scan), AC-12 |
    | a lapsed enrolled lock that the legacy pick treats as free | AC-9 |
    | trust material or configuration read from the certificate table | AC-5 |
    | the legacy guard failing the frozen claim when an enrolled lease has lapsed | AC-9 |
    | pairing HMAC / atomic consume / per-locator cap | AC-8 |
    | numeric priority | AC-15 |
    | an unbound registration reporting a bound record's fingerprint accepted; the binding dropped on archive; the Home-computer restriction keyed to the bound record alone | AC-12, AC-15 |
    | the pairing secret generated deterministically | AC-8 |
    | legacy EXECUTE on a front door; the reserved-capability guard; principal minting by a node | AC-12, AC-14 |
    | a candidate migration that seeds a computer, agent principal or credential, or writes an S-16(a) binding | AC-12 |
    | the S-7 route and operation list; the `tenant_admins` condition; the tier `founder` check; the live-role-founder check on founder-only actions | AC-7 |

11. **Verdict:**
    - **CERTIFIED** only if every candidate row, every rehearsal, every reference suite, the authorship check and the reproducible build
      pass with evidence.
    - Otherwise **REJECTED**, with every finding: its reproduction, the violated row, and its class (`incident-to-regression`).
      A finding is a Director input: it carries no product code or patch for the implementer to apply (S-16).
    - AC-10's Edge clause is recorded **PENDING** in every receipt, and a PENDING Edge clause does not block a CERTIFIED verdict. The
      Director resolves it by a Director observation record before the CERTIFIED ledger entry (AC-10; §5). If it resolves as a finding,
      that observation record names each candidate the finding concerns and, like a receipt, is committed on the local-only ref and
      goes privately to the implementer and to the founder (§4). For each such candidate whose receipt is CERTIFIED the verifier
      writes a superseding receipt with verdict REJECTED that cites the record by sha256. The public event log carries no
      candidate's finding: it records the REJECTED transition, citing the candidate's line as replaced (the superseding receipt's
      sha256), the superseded receipt's sha256 and the observation record's sha256.

## 4. Receipts (append-only, content-addressed, Director-committed and signed)

- **Path:** `qa/verification/auto-enrollment-v1/<candidate-sha>/receipt-<n>.json`, plus `evidence/`.
  - No secret and no URL goes in either.
  - Text is pinned LF; evidence is pinned binary.
- **Fields:**
  - candidate SHA; the designated Director commit; the document-set hashes; WO ids;
  - the **authoring set**: commits with their verified signer, plus any Factory authoring runs and their nodes, each node with the
    machine fingerprints its computer record has reported and whether it is a Home-computer record (S-16);
  - the certifying session and machine (different from every author's; S-16b), and the Director-issued verifier assignment;
  - the reproduced digests (production and dev channel) and every trust-set entry as (key id, public-key sha256), with the channel
    and trust mode;
  - UTC timestamps; the environment;
  - per row: command, persona, input, expected, actual, PASS / FAIL (AC-10's Edge clause is recorded PENDING, and its Director
    observation record is cited in the CERTIFIED entry instead; §3.11);
  - every hit of the §3.4 plane-conditioned-behaviour scan: its file, line, the construct it references (never a value, a secret or
    a URL) and its class;
  - for the live-plane parts of AC-10 and AC-11, the Director observation records, cited by the sha256 of each Director-committed
    record;
  - the live-migration step (§3.3): its sha256, and each embedded migration file's sha256;
  - the candidate's API logins (§3.3);
  - findings; the verdict; the sha256 of every evidence file.
- **Who writes and commits them.** Receipts are written by the verifier session. Only the Director commits them, **signed with the
  Director signing key**, and records the receipt's sha256 in the ledger in the same commit. By founder ruling (2026-09-27 UTC;
  founder text II.14; the repository is public) that commit is on a local-only ref and the findings go to the implementer
  privately. The public ledger's next published Director commit records one line per candidate (its SHA, the receipt's verdict
  and the receipt's sha256, never findings), which a superseding receipt replaces. A line is not a state transition (ledger
  rule 6), and a local-only Director commit is never a designated commit.
- **Tamper evidence.** Receipts are never edited; a correction supersedes.
  - The Director keeps an out-of-band record of every Director-branch commit it made, outside the repository.
  - At every ledger write it verifies the signature of each Director-branch commit after `69df2f52` and checks the history against
    that record.
  - A Director-branch commit after `69df2f52` that is unsigned or not signed with the Director signing key is a tamper finding
    (AC-12). `69df2f52` and its ancestors are baseline history and are not checked.
  - Signing never relies on a checkout's persistent git configuration: the Director signs each commit explicitly with the Director
    signing key and verifies it (`git verify-commit` against its out-of-band key record) before pushing.
  - Branch protection is recommended to the founder.

## 5. Ledger writes (single writer: the DIRECTOR capability, signed commits)

| transition | valid only if |
|---|---|
| → BINDING (issue or revise) | issued by the DIRECTOR: the WO file, frozen by sha256, with its coverage recorded. Nothing the IMPLEMENTER writes creates or changes a binding WO |
| → IN PROGRESS, → CANDIDATE | reported by the IMPLEMENTER; the Director records the notice and designates the Director commit |
| → CERTIFIED | it cites a Director-committed receipt with verdict CERTIFIED, in which: every commit in the §3.1 range verifies against the confirmed implementer key (`implementer_signing_key`, or another key confirmed as §3.1 states and recorded in `additional_implementer_keys`); the certifier is on a different machine from every member of the authoring set (S-16b) and holds the Director-issued verifier assignment; the hashes match; and every row the WO covers has evidence at that SHA. It also cites the Director observation record that resolves AC-10's Edge clause: the candidate's Edge reading equals the committed Edge record, except founder-approved changes in the event log, and no AC-10 timing-rule finding concerns the candidate |
| → REJECTED | it cites a receipt with verdict REJECTED |
| a resubmitted candidate | after a REJECTED or `VERIFICATION_FAILED` verdict, a new candidate is a **new SHA with different content**. Re-verifying the same SHA takes an explicit Director order |
| change-request decision | recorded by the DIRECTOR, with the reason and any WO or document revision |
| any acceptance state (incl. `PRODUCTION ACCEPTED`) | set only by the DIRECTOR, on independent acceptance receipts (C-5); never by the candidate's author |

## 6. Final acceptance (AC-1..AC-4, then AC-13)

- **Prerequisites:**
  - C-3 is decided;
  - the release under acceptance is the verifier-reproduced artifact of a CERTIFIED candidate, signed with the founder-provisioned key
    (S-5);
  - the founder-provisioned SELECT-only observer role exists (`FACTORY_OBSERVER_ENV`), and its first read is recorded as the
    storage-bucket referent (AC-10); the `runner.env` interim never serves final acceptance;
  - the founder boundaries are done: the live Factory migration (exactly the live-migration step in that candidate's receipt, AC-11),
    the live Edge deploy, production secrets and `tenant_admins` seeding, the production Brain OS deploy by PR, and re-enrollment of
    the existing machines (their `runner.env` and legacy task removed; S-2).
- **Where:** on the clean acceptance machine, touched for the first time here.
- **The live observer login.** Every Director read of the live plane uses a founder-provisioned SELECT-only observer role
  (`FACTORY_OBSERVER_ENV`), never an enrolled machine's credential. Until that role exists, candidate-stage live reads use the
  documented `runner.env` interim (`FACTORY_DIRECTOR_INTERIM_RUNNER_ENV=1`), read-only. The tools then read only
  `~/.brain-factory/runner.env` in the account's own profile directory, and refuse `FACTORY_RUNNER_ENV_FILE`, every `PG*` variable
  and a redirected home directory, so no other file or variable supplies the connection. Final acceptance waits for the role.
- **What the Director checks, read-only:**
  - the live policy rows, which must equal contract §1;
  - the installed artifact's digest (the PE Authenticode image hash, S-5), **computed on each machine itself** with a Director
    instrument committed under `tools/` before final acceptance and run by the built-in PowerShell (nothing installed), which must
    equal the receipt's reproduced production-channel digest. On the acceptance machine it runs only after AC-1's enrollment and
    absence evidence is recorded, from a pasted command or removable media; it prints the digest, writes no file, installs or
    schedules nothing, and is never part of enrollment;
  - the Home machine's fingerprint (contract §1's sha256 of its MachineGuid), **computed on the Home machine itself** with a Director
    instrument committed under `tools/` before final acceptance and run by the built-in PowerShell: exactly one non-archived computer
    record has reported it, and that record carries the S-16(a) binding, admin-set and audited at its Add Computer. Which record is
    the Home machine's is never taken from an admin's assertion or a hostname. Any other record carrying the binding is listed; it
    only adds restriction (S-14);
  - that every final-acceptance observation record shows `current_user` = the observer role;
  - AC-5(f), repeated on the acceptance machine: a dev-key-signed artifact is offered locally to the installed runtime, and nothing is
    written to the plane.
- **How it is observed:** by the Director as receipts, from server rows, the Computers page and the on-machine digest and fingerprint
  reads above. A server-reported digest or fingerprint never substitutes for the on-machine read, and nothing is taken from the
  installer's report.
- **AC-13:** the Director records Factory V1 cumulatively (P-8).
- **Release states:** follow `CLAUDE.md` §7. The Director records `PRODUCTION ACCEPTED` only on independent acceptance receipts.
