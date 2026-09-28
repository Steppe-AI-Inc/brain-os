# Director r3 reconciliation (implementer; not canonical)

| | |
|---|---|
| Designated Director commit for the next candidate | `c7a845b61a3b0b419e8c9dfeff397547fdc75b03` (r3, 2026-09-28), merged into this branch as `b94830b` |
| Previous candidate | `412ac14e76f88fbd5e310d3e97dbf5acab2c1498`: **REJECTED** (public ledger line, receipt sha256 `f94861a7…1b57`). It is not reused, amended or rebased. The next candidate is a new signed SHA |
| Reconciliation method | a `git merge --no-ff` of `c7a845b6` into `factory/auto-enrollment-v1-implementation`, with no history rewrite. The Director commits `5709a6a4` (r2) and `c7a845b6` (r3) stay intact as ancestors. The implementation history `8f9833ce..1d74193` (candidate 1 and its evidence) is unchanged, with nothing amended, rebased, squashed, cherry-picked or force-pushed. The merge commit `b94830b` is signed with the implementer key `SHA256:9zUY…QTek`. After it, the canonical documents (`CLAUDE.md`, `FEATURE_COMPLETENESS_CONTRACT.md`, `docs/architecture/features`, `docs/architecture/adr`, `qa/work-orders`, `qa/verification/auto-enrollment-v1`, `governance`) are byte-identical to `c7a845b6` |
| Director signatures | `8f9833ce`, `5709a6a4` and `c7a845b6` each `git verify-commit` Good for the Director key `SHA256:JuFaA95213JN0+3f/RAlUOAOK7G42IukX/qQiWeIALE`. The key was taken from the ledger, in-band; the founder's out-of-band record of this fingerprint is the confirmation |
| Verifier findings | private (founder text II.14). **Not in this file.** Each fix waits for its exact private finding |
| WO revisions | WO-1 r3 · WO-2 r2 · WO-3 r1 · WO-4 r1 · WO-5 r2 · WO-6 r2 · WO-7 r1 · WO-8 r2 · WO-9 r2 · WO-10 r3 |

This file maps what r3 changed against the rejected implementation. It records the implementer's own reading of what must
change; it decides nothing, and every row is re-checked against the private findings before implementation.

## What r3 changes that touches implementation

| r3 text | Where the rejected implementation stands | Work |
|---|---|---|
| **WO-1 r3 / contract §1 "The candidate migration":** every `.sql` file added under `supabase/control-plane/` (excluding `edge/`) since `69df2f52`, in byte order of path. The Director instrument `build_live_migration_step.mjs` builds the step, and a refusal fails AC-11 | 21 files `v1/000..990`, no `69df2f52` file changed. **The instrument refuses them:** `060_releases.sql:14` has a regular expression with a backslash in a single-quoted literal (a CHECK constraint, outside any dollar-quoted body). The other backslashes are inside function bodies | Write the constant dollar-quoted. Gate: `qa/factory/v1/applying_role_plane.mjs` row M1 runs the instrument, exported from the Director commit (never copied) |
| **VERIFICATION_SPEC §3.3 judging plane:** the applying login is Supabase's `postgres`, NOSUPERUSER, aligned to `APPLYING_ROLE_OBSERVATION.json` | Earlier suites applied the migration as a superuser, so they could not show how it behaves under this login. The applying-role plane (developer approximation, below) now applies it as `postgres`. Its result is kept with the private findings, not here | Gate: `applying_role_plane.mjs` row S1 must pass on the next candidate |
| **S-10 / §3.4 plane-conditioned scan, r3 classes:** reading the applying login's name, attributes or memberships, or `session_user`, in a migration statement "fits no class" (a finding). An exception handler that swallows a lock-not-available error, without re-raising, is a hit | Migration statements name the applying login: `000:50` (`grant factory_owner to current_user`) and `010:40,60`, `070:15,156` (`… to/from session_user`). `990` reads `pg_auth_members` and role attributes and branches on them. `120:225` catches `lock_not_available` without re-raising. `100:52` reads `session_user` + `rolsuper` in a front door (r3's class "the refusal of a superuser caller") | Redesign so no migration statement names or reads the applying login. Re-raise, or move the lock-timeout mapping out of SQL. Keep `100:52` |
| **S-12 / WO-2 r2:** session tokens stored at most as a hash; no bearer value in any column the observer can read | Sessions are stored as sha256 (plan); to be re-verified against a full dump | Confirm with a dump-scan row |
| **S-14 / WO-8 r2 / AC-12(e):** the S-16(a) binding is never released. Archive keeps it. An unbound registration reporting a bound record's fingerprint is refused by name (retry included) → `REGISTRATION_FAILED`. Correction only in S-14's order | Binding add-only; unbind and rebind refused. **Not yet:** refusal of an unbound re-registration by fingerprint; binding retained on archive (to verify) | Implement plus rows |
| **S-16 / WO-5 r2 / AC-15:** a Home-computer record is the bound record, archived or not, or any record that has reported a fingerprint such a record has reported | Restriction keyed to the bound record only | Extend gate S-16(a) to fingerprint-linked records, plus rows (AC-15 includes an unbound record enrolled before the bound one) |
| **Contract §1 machine fingerprint:** the lowercase hex sha256 of the UTF-8 bytes of the MachineGuid string, exactly as stored | To verify in the runtime | Pin with a unit row |
| **Contract §1 derived computer state** from per-principal states (ALIVE if any principal is ALIVE, …; each principal's own state shown) / AC-2 R-2 | Derived from credentials | Implement the r3 order plus page column |
| **WO-9 r2 / AC-14(p):** fingerprint equality between any certifier-reported and any author-reported fingerprint during the candidate refuses | Equal-fingerprint refusal exists; "any reported during the candidate" to verify | Rows (p) |
| **WO-6 r2 / S-8:** founder-only = tier `founder` **and** live role founder, for publish, supersede, revoke and granting `release_broker` | Implemented (CR-003). r3 adds "supersede" explicitly | Confirm supersede is covered |
| **Contract §1 / S-10 `director_lease`:** a legacy write leaves new-model dispatcher state unchanged. New-model dispatch never waits on the legacy lease. AC-9 legacy-director sequence | To verify | AC-9 row: hold, lapse, release |
| **Contract §1 "What a candidate migration writes":** only the policy rows plus one operator tenant row. No constant identifying a user, computer, principal, credential, key or envelope in any object | Seeds policies and tenant; to re-check the tenant row's columns and every object's constants | Row-check suite |
| **§3.4 instrument integrity:** no event trigger, no cast to json/jsonb, no `allow_system_table_mods`, no `pg_catalog` write | None found by grep | Static gate |
| **§3.4 platform-schema and secret-setting inventories** | No statement touches `auth`, `storage`, `vault`, `cron`, `net` or `extensions` (grep). Settings: none read | Static gate |
| **Candidate notice (§2):** now lists the API login roles its handlers connect as, and every change request relied on (path, commit, sha256) | Not in the previous notice | Add to the next notice |
| **WO-10 r3 / S-16 key custody:** no candidate commit carries product code drafted in a Home-machine session. Commits signed by the CR-005 key | All commits G with `SHA256:9zUY…QTek`; product code drafted on this machine only | Unchanged |

## Regression infrastructure added (developer; never evidence for a verdict)

- `qa/factory/v1/applying_role_plane.mjs`: embedded PostgreSQL with bootstrap superuser `supabase_admin` and `postgres` aligned to
  `APPLYING_ROLE_OBSERVATION.json`.
  - Rows:
    - M0: no `69df2f52` file changed;
    - M1: the Director instrument builds the step;
    - P0–P3: alignment, provisioning as `69df2f52` as `postgres`, the baseline rows loaded unchanged;
    - S1: the step applied as `postgres` in one simple-Query message.
  - Limits:
    - PostgreSQL 18 here, 17 live;
    - the platform schemas, roles and event triggers are not reproduced, so this is not the verifier's judging plane.
