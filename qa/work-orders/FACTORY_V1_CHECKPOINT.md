# FACTORY V1 — DURABLE CHECKPOINT (for a fresh Claude Code session)

## 0. RESUME HERE — 2026-09-24, packaging fix under independent verification (NOTHING PUSHED since `ee2fce2b`)

- **Published remote** `factory/computer-agnostic-control-plane` = `ee2fce2b` (the founder found it cannot `npm ci`: no lock, `pg`
  undeclared). **Do not hand the Work PC any SHA until the steps below finish and the remote is re-verified from a fresh clone.**
- **Local branch**, not pushed: `git log --oneline ee2fce2b..HEAD` (lock + pg + deps.mjs, eol=lf, regression + mutation proof,
  then the fixes for verification wf_0bc2563b-650 in `050d5543`, `0f1e1e9d`, `0f90a9f0`, `a5cba4de`, `ca341633`, `bf7fef32`).
  Backup of the unpushed commits: `C:\Users\Dell\dev\backups\factory-cp-2026-09-24-*.bundle`.
- **Verification wf_0bc2563b-650** (against `1c3bce0f`) found: [high] deps.mjs checked only the manifest (pg-protocol missing read
  as ready -> crash loop); [high, critic] a missing CA passed -Preflight -> crash loop; [medium] node.mjs start/status raw errors;
  F4 read ALIVE from another registration; harness teardown orphaned PostgreSQL io workers (npm ci EPERM); -ReplaceOtherCheckout
  stopped the wrong checkout; [low] -Stop/-Uninstall from any clone; `#` in path; BOM; F9 on Node 20/22; F2 on Node 20.0-20.5; K3
  createRequire blind spot; npx @latest; bootstrap next step; icacls success printed on failure; -Verify ignored env/CA. **All
  fixed**, each with a regression row (K7, F2, F4, F5, F6, F9, F10, lock-unchanged in F1/F8) and a mutant where plantable. Refuters
  independently reproduced the [high] closure defect and the F4 defect at `1c3bce0f` (both fixed).
- **Proofs so far**: package regression 16/16 on full fresh clones of `0f90a9f0`; fresh mutation proof 18/18 at `a5cba4de` (F-ORIG
  `ee2fce2b` red on 13 rows); static mutation 12/12; this checkout reinstalled by `npm ci --strict-allow-scripts` (deps --dev: 138
  locked packages OK); the live task re-registered with the full identity and `-Verify` OK.
- **Next, in order**: (1) full regression on `bf7fef32`+ (adds F10); (2) second independent verification workflow on HEAD, fix what it
  confirms; (3) composer `factory_v1_acceptance.mjs` with the live URL loaded from runner.env; (4) push with exactly
  `git -C C:/Users/Dell/dev/brain-os-factory-cp push -u origin factory/computer-agnostic-control-plane`; (5) fresh
  `git -c http.sslBackend=schannel clone` of the remote branch: lock present, `pg` declared, `--static --root` green; only then report
  the new remote SHA; (6) ledger 217 via `scratchpad/record_217.mjs` in the candidate repo, bundles, memory.
- **Live state 2026-09-24 ~14:00 local**: plane `npvhuoozkbexddnvkqsj` healthy; Home node `node-4d4a74dd` ALIVE on the new code (task
  re-registered, principal/trigger DESKTOP-MDPE6FS\Dell, restarts 0); local plane serving on 54329.

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
