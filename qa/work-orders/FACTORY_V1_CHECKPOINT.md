# FACTORY V1 — DURABLE CHECKPOINT (for a fresh Claude Code session)

## 0. RESUME HERE — 2026-09-24, packaging fix under independent verification (NOTHING PUSHED since `ee2fce2b`)

- **Published remote** `factory/computer-agnostic-control-plane` = `ee2fce2b` (the founder found it cannot `npm ci`: no lock, `pg`
  undeclared). **Do not hand the Work PC any SHA until the steps below finish and the remote is re-verified from a fresh clone.**
- **Local branch**, ahead of the remote and not pushed: `aa8db28b` lock + pg + deps.mjs + refusals · `37c68fe2` `*.sh eol=lf` ·
  `73b2ccfd` regression --root/--skip + mutation proof · `1c3bce0f` acorn parse · `3a647e33` disk-safe proofs · `050d5543`
  verification fixes part 1 (deps.mjs walks the whole locked closure; node.mjs start/status refuse by name; BOM + caMissing in
  runner-env; supervisor refuses a missing CA; local_pg stops PostgreSQL with `pg_ctl stop -m fast -w`, no orphans).
- **Verification workflow `wf_0bc2563b-650`** (four probes against `1c3bce0f`) reported DEFECTS_FOUND. Fixed in `050d5543`: the
  closure check [high], the start/status refusals, BOM, caMissing (supervisor side), local_pg teardown + entry-script test.
  **Still open, in this order:**
  1. `install-autostart.ps1`: -ReplaceOtherCheckout must stop the OTHER checkout's supervisor (its path + pid file), refuse
     (exit 4) if it stays alive; -Stop/-Uninstall refuse (exit 3) on another checkout's task; build module URLs with
     `pathToFileURL` (a `#` in the path broke -Preflight); -Preflight FAILs on `caMissing`.
  2. `bootstrap-node.sh`: print the supervisor command with `--env-file` as the next step; refuse on `caMissing`; note that
     npm < 11 ignores `allowScripts` (the locked script set is fully approved, so nothing extra runs).
  3. `verify-deployed-bytes.sh`: `npx --yes supabase@latest` -> `supabase@2.117.0` (the version used 2026-09-08).
  4. Regression: F2 real `import()` (not `import.meta.resolve`, absent on Node 20.0-20.5); F4 on a FRESH state dir, ALIVE only with
     role verifier, heartbeat after supervisor start, restarts 0; F5 removes `pg-protocol` (transitive) and `pg`, and checks
     `node.mjs start`/`status` refuse (exit 5); F9 judges rc and parses `# pass`/`ℹ pass`; K3 tracks `createRequire` aliases and
     fails non-constant loads other than relative / `pathToFileURL(...)`; new K7: every `npx --yes` pins an exact version.
  5. Mutation proof: add F-DIE (worker exits on start, F4 must go red) and a transitive-closure mutant; rerun static + `--fresh`.
  6. This checkout's node_modules are hand-installed (`@vercel/node` 12.0.3 vs lock 14.0.0; `deps.mjs --dev` now says so):
     `install-autostart.ps1 -Stop`; `node qa/factory/shared_local_pg.mjs stop`; confirm no postgres.exe under node_modules;
     `npm ci --strict-allow-scripts`; `deps.mjs --dev` ok; restart the local plane detached; `-Start`; `node.mjs status` ALIVE.
  7. Suites: package regression (full fresh clones), mutation proof `--fresh`, then the composer `factory_v1_acceptance.mjs`
     with the live URL loaded from runner.env.
  8. Re-run an independent verification workflow on the new HEAD; fix what it confirms.
  9. Push with exactly `git -C C:/Users/Dell/dev/brain-os-factory-cp push -u origin factory/computer-agnostic-control-plane`;
     fresh `git -c http.sslBackend=schannel clone` of the remote branch: lock present, `pg` declared, `--static --root` green;
     only then report the new remote SHA. Ledger 217: `scratchpad/record_217.mjs` (candidate repo), then bundles + memory.
- **Live state at 2026-09-24 ~13:10 local**: plane `npvhuoozkbexddnvkqsj` healthy; Home node `node-4d4a74dd` ALIVE, TLS on,
  supervisor restarts 0 (it still runs the code loaded 2026-09-23; it picks up new code on its next restart). The local plane
  (postmaster pid 14200) is running. Two orphaned io_workers from earlier harness runs were found and ended by pid.
- Disk C: about 5 GB free. Delete the workflow scratch `…/scratchpad/verify/` once its results are read.

**Written 2026-09-22 end of night shift. Read this first; everything below is reconstructible from disk, git and the plane
without the founder.** The rule of this file: state what is TRUE and where it is measured, never what was intended.

## 1. Where things are

| what | where |
|---|---|
| Factory control-plane repo (this) | `C:\Users\Dell\dev\brain-os-factory-cp`, branch `factory/computer-agnostic-control-plane` |
| deploy candidate repo (frozen Edge candidate `db9781c8`, ledger `qa/KNOWN_FAILURE_MODES.md`, `qa/verification/CHECKPOINT.md`) | `C:\Users\Dell\dev\brain-os-wo-resolver`, branch `wo/clarification-resolver` |
| invitation branch (BUG-035/036/037 work, gates, BUG-036 inspection) | `C:\Users\Dell\dev\brain-os-invite`, branch `wo/invitation-delivery` |
| control repo (verifier records, milestone 7 logs) | `C:\Users\Dell\dev\brain-os`, branch `p1/execution-truth-governance` |
| bundles (restore-tested) | `C:\Users\Dell\dev\backups\*-plane-live.bundle` and later stamps |
| the founder's rulings | `brain-os/qa/verification/FOUNDER_RULING_2026-09-17_FINITE_EDGE_TERMINATION.md`; the 2026-09-22 order is quoted in ledger 215/216 |

## 2. The control plane (LIVE)

- Dedicated Supabase project **`npvhuoozkbexddnvkqsj`** (created exclusively for the Factory; NOT the Brain OS product), reached
  through the Session Pooler `aws-0-ap-northeast-1.pooler.supabase.com:5432` as `factory_runner.<ref>`, PostgreSQL 17.6,
  TLS 1.3 **verify-full** against the pinned Supabase Root 2021 CA. `factory.plane_identity = npvhuoozkbexddnvkqsj`.
- Credential: `C:\Users\Dell\.brain-factory\runner.env` (one line, `FACTORY_RUNNER_PG_URL=…`; ACL: this user only) and the CA
  `C:\Users\Dell\.brain-factory\supabase-root-2021-ca.crt`. **Never print, copy into arguments, or commit the URL.**
  `FACTORY_RUNNER_PG_URL` is NOT in the user environment; every tool loads it from the file (`--env-file`, or
  `export $(grep '^FACTORY_RUNNER_PG_URL=' ~/.brain-factory/runner.env | tr -d '\r' | xargs)` in a shell).
- Provisioned by `scripts/factory-runner/provision-control-plane.mjs --allow-dedicated-supabase npvhuoozkbexddnvkqsj
  --write-env …` (re-run rotates the password; the accessor refuses the production project by name everywhere).
- Brain OS production: **untouched**. No Edge verifier round since #105 (campaign CLOSED under the ruling).

## 3. The Home node (this PC)

- Identity `node-4d4a74dd-4035-4d34-9cac-d2d1a8050d37` (`.factory/node-id`), role **generic**, hostname `DESKTOP-MDPE6FS`.
- Runs under the Windows Scheduled Task **BrainOS Factory Node** → `scripts/factory-runner/node-supervisor.mjs` →
  `node.mjs start`. Logon-triggered (a boot trigger needs one elevated run of the installer; Windows refuses AtStartup to a
  standard user). Logs: `C:\Users\Dell\.brain-factory\logs\node-<date>.log`. State: `.factory/node-status.json`.
- Commands (PowerShell, from the repo): `install-autostart.ps1 -Status | -Start | -Stop | -Verify | -Uninstall`;
  `node scripts/factory-runner/node.mjs status` → ALIVE / STALE / NOT REGISTERED / UNREACHABLE (read-only).
- If `status` says STALE after a reboot and the task did not start: `install-autostart.ps1 -Start`.
- The local embedded plane (`qa/factory/shared_local_pg.mjs start`, loopback 54329) is only for the 18-row local suite; it is
  not running after a reboot and must be started detached before `shared_control_plane_acceptance.mjs`.

## 4. What is PROVED (exact suites; run them, do not trust this table)

| suite | count | engine |
|---|---|---|
| `qa/factory/acceptance.mjs` | 48/48 | disposable PostgreSQL 18 |
| `qa/factory/health_check.mjs` | 10/10 | disposable |
| `qa/factory/founder_poke_not_required.mjs` | 12/12 | disposable |
| `scripts/factory-runner/db.regression.test.mjs` | 7 tests | pure |
| `qa/factory/shared_control_plane_acceptance.mjs` | 18/18 | local embedded plane, real processes |
| `qa/factory/tls_plane_acceptance.mjs` | 7/7 | disposable TLS server on the LAN address |
| `qa/factory/dedicated_supabase_provisioning.mjs` | 11/11 | disposable TLS server dressed as Supabase |
| `qa/factory/http_provider_acceptance.mjs` | 9/9 | stub provider + disposable plane |
| `qa/factory/reboot_recovery_acceptance.mjs` | 9/9 | disposable plane + the live scheduled task |
| `qa/factory/shared_plane_live_acceptance.mjs` | 11/11 | **the LIVE plane**, from this machine |
| `qa/factory/two_machine_real.mjs run` | every row green, verdict SAME MACHINE | **the LIVE plane**, two supervised nodes on this machine |
| `qa/factory/package_bootstrap_regression.mjs` | 15/15 | FRESH clones of HEAD installed from the committed lock (runtime-only and full), a disposable plane |
| `qa/factory/package_bootstrap_mutation_proof.mjs --fresh` | control green, every mutant killed incl. the published defect `ee2fce2b` | clones with one planted defect each |
| `qa/factory/factory_v1_acceptance.mjs` (composer) | HOLD: 0 failed, only founder/Work-PC rows open | all of the above + plane rows |

Candidate-repo suites (invitation branch): ten invitation suites 116 green / DS-D1 red by design; `gate_202609110001.mjs` 6/6;
`gate_invitation_deploy.mjs` 6/6; `bug036_auth_inspection.mjs --selftest` 7/7.

## 5. Defects found and closed by these proofs (ledger 211–217 in the candidate repo)

2026-09-24 (ledger 217, found by the founder on the published branch): no package-lock.json and `pg` undeclared, so a fresh clone
could not `npm ci`; a supervised node on such a clone crash-looped on ERR_MODULE_NOT_FOUND; the bootstrap redirected into a
`.factory/` that a fresh clone does not have; shell scripts checked out CRLF; the regression's first import scan was a regex that read
a package name out of a string literal (caught by its own mutation proof's control).


lease expiry left the work order `claimed`; a run could verify itself; a plane restart rotated the credential; orphaned
postgres workers; the real node never requested a model; a declined work order starved the node; a verifier node demoted
to generic on every start; the provisioner applied one schema file of three; the accessor accepted plaintext across a
network; the pg driver's TLS modes are not libpq's; a WIN1252 harness database; the shared acceptance contaminated by its
own leftovers and tripped by its own admission control; an idle node indistinguishable from a dead one; nothing restarted a
node after a reboot; a heavy-job limit that was a count, not a lock; twelve worktrees created for acceptance runs.

## 6. THE GATES (the only things that stop the Director)

**A — Work PC.** On the Work PC, from a FRESH clone of this branch at a commit that contains `package-lock.json` (the
2026-09-24 packaging fix; before it a fresh clone could not `npm ci` - ledger 217):
0. `git clone --branch factory/computer-agnostic-control-plane https://github.com/Steppe-AI-Inc/brain-os.git brain-os-factory-cp`,
   `git rev-parse HEAD` equal to the SHA the founder handed over, then `npm ci` (installs exactly the committed lock; the node itself
   needs only `pg`, the acceptance harnesses need the dev packages too). `node scripts/factory-runner/deps.mjs` must print
   "runtime dependencies installed at their locked versions";
1. copy `runner.env` and `supabase-root-2021-ca.crt` into `%USERPROFILE%\.brain-factory\` there. Nothing is edited: every
   reader goes through `scripts/factory-runner/runner-env.mjs`, which resolves the CA path recorded on this PC to the copy beside
   the env file on that PC (proved against the live plane with a foreign path);
2. `powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Preflight` (checks only; exit 0 needed),
   then `... -Role verifier -Start`, then `-Status`. The install refuses by name if dependencies are missing, and the supervisor exits
   5 naming `npm ci` rather than crash-looping;
3. back on the Home PC: `node qa/factory/two_machine_real.mjs nodes` (both ALIVE, two hostnames), then
   `node qa/factory/two_machine_real.mjs run` → expect **TWO MACHINES**; then `node qa/factory/factory_v1_acceptance.mjs`
   (with the env loaded) → the real-failover, scheduling and verification rows turn OK. A third machine (laptop) bootstrapped
   the same way satisfies the three-machine row.

**B — founder credential.** `DEEPSEEK_API_KEY` on the serving node (the HTTP path is built and proved on a stub);
`SUPABASE_ACCESS_TOKEN` for one run of `qa/verification/bug036_auth_inspection.mjs` on the invitation branch.

**C — founder authorization.** Moving `supabase/drafts/202609110001_invitation_delivery_state.sql` into `supabase/migrations/`
(gate 6/6 satisfied); the production web deploy of `wo/invitation-delivery` at `a593f82b` (gate 6/6 satisfied); optionally the
elevated run of the installer for a boot-time trigger.

## 7. Standing rules that still bind

No Edge verifier round unless a NEW reproducible P0/P1 execution-authority defect (ruling §2). Never touch Brain OS
production, Auth, SMTP, secrets, rulesets, or `master`. Do not move the Factory V1 finish line. Independent evidence outranks
implementer confidence. Certification cites only materialized artifacts. Keys are never stored on the plane.
