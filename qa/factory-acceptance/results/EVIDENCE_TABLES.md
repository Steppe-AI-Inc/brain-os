<!-- BEGIN GENERATED EVIDENCE (qa/factory-acceptance/consolidate.mjs, 2026-09-14T05:24:44Z) -->

| Totals | PASS 28 | FAIL 10 | ABSENT 5 | PARTIAL 10 | NO_VERDICT 2 | checks 55 |
|---|---|---|---|---|---|---|

### Suite `director`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| DIR-01 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | Importing scripts/factory-runner/{scheduler,supervisor,provider}.mjs runs no child process (safe to unit-test); invoking pollOnce() does rea |  |
| DIR-02 | **PARTIAL** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | FOUNDER_POKE_NOT_REQUIRED for the Factory: a continuously running Director/dispatcher exists (scheduled task, loop, cron, service) |  |
| DIR-03 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | SOURCE_GREP | The Factory runtime is computer-agnostic (no machine-specific path or identity in the runtime) |  |
| DIR-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | PGlite engine with the full pinned migration chain and seeded synthetic identities |  |
| DIR-04 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | create_factory_work_order refuses cross-company goal association (2026-08-29 incident regression) |  |
| DIR-05 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | create_factory_task derives company server-side and refuses mismatches |  |
| DIR-06 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | complete_work_order is idempotent, requires verified commits, refuses running/failed/unverified state |  |
| DIR-07 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | complete_agent_run is founder/admin-only, idempotent, propagates to the task |  |
| DIR-08 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | A blocked task does not halt unrelated ready tasks; a rejected dependency permanently blocks dependents; agent selection is capability-only | task-level only; WO-level "progress around BLOCKED - DB PUSH" exists as prose in brain-os-factory-director.md and is not enforced by code |
| DIR-09 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | Duplicate run prevention for Work-Order dispatch is structural (a second active run for the same canonical_work_order_id is impossible) | poll-and-dispatch.mjs dedupes with a non-atomic NOT EXISTS then INSERT (TOCTOU); the schema has no partial unique index on (canonical_work_order_id) where status in progress and no trigger refusing a second active run |
| DIR-10 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SHELL_REVIEW | The Factory runtime detaches from its launching session (survives an interactive Claude session ending) | only the isolated-verifier shell path detaches (nohup); supervisor.mjs pollOnce has no launcher; artifact-based completion detection exists only in watch-verifier-artifacts.sh |
| DIR-11 | **PASS** | PASS | SOURCE_FINDING_ONLY | NODE_TEST_RERUN | planResume / computeRetryAfter / safeWorktree / dispatch selection invariants hold as the Home PC pinned them |  |

### Suite `control-plane-security`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| CPS-01 | **PASS** | PASS | SOURCE_FINDING_ONLY | SOURCE_GREP | The factory accessor connects only through an explicit FACTORY_RUNNER_PG_URL |  |
| CPS-02 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | With FACTORY_RUNNER_PG_URL unset, read()/write()/transaction() refuse before any connection even when ambient credentials are present in the |  |
| CPS-03 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | PURE_FN | db.mjs rejects superuser/admin connections and role-escalation statements | username-string check only; no server-side role verification (current_user/rolsuper) exists in db.mjs |
| CPS-04 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | SOURCE_GREP | Generic Factory node has zero production-write authority: no runtime script reaches the DB through `supabase db query --linked` |  |
| CPS-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | PGlite engine ready with full chain; persona enforcement self-checked |  |
| CPS-05 | **PARTIAL** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_EXEC | claim_blocked_run_for_retry authority derives from role/capability rather than transport identity; least-privilege callers are denied for th | EXECUTE is revoked from every API role, so even the founder JWT cannot claim; only the postgres/supabase_admin transport identities can. Authority derives from the connection identity NAME (machine trust), not from a wor |
| CPS-06 | **PARTIAL** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_EXEC | A company manager cannot rewrite the Agent Run fields the supervisor consumes | PGlite emulation with session_user = qa_authenticator so guard_agent_run_retry_columns is exercised on its real inputs |
| CPS-07 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | The control-plane schema does not reference Brain OS business tables; business IDs are opaque references by value | canonical_work_orders.company_id is NOT NULL with ON DELETE CASCADE to companies |
| CPS-08 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | A caller with real access to company A cannot associate company B objects by supplying their ids |  |
| CPS-09 | **NO_VERDICT** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | No factory RPC is granted to anon; founder canonical path works | ENGINE_FIXTURE_INCOMPATIBLE: the suite seeds auth.users(instance_id), a column the pinned qa/dbtest bootstrap does not model |
| CPS-10 | **NO_VERDICT** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | FIRST EXECUTION EVER of the Home-PC claim-security suite (D1-D5) | SUITE_PRECONDITION_DEFECT: the suite compares pg_get_function_identity_arguments (which includes parameter names) with an unnamed signature string, so it aborts against the very migration it tests - on any PostgreSQL |
| CPS-11 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | complete_agent_run is founder/admin-only |  |
| CPS-12 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | No factory RPC grants EXECUTE to anon (independent replacement for the engine-incompatible Home-PC sweep) |  |

### Suite `lease-recovery`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| LR-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | PGlite engine with the retry migration applied |  |
| LR-01 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | A run blocked for a non-capacity reason (e.g. agent crash) is never claimed for automatic retry | REFUTES #118/claim-2 at master: the pinned RPC text filters blocked_reason |
| LR-02 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | The retry loop is bounded in SQL: attempt_count >= p_max_attempts is never claimed; a claim increments attempt_count | the JS predicate isRetryEligible remains dead code (LR-05); the SQL WHERE is the live gate |
| LR-03 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | Lease TTL: a second claimant is refused while a live claim exists and succeeds only after the real 30-minute stale threshold |  |
| LR-04 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | After a provider re-block the run can be recovered again (claimed_by is reset by the re-block path) | CONFIRMS #118/claim-3 |
| LR-05 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | PURE_FN | The JS safety predicate is wired into the live path | CONFIRMS #118/claim-1 on both refs |
| LR-06 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | Finished work is not repeated on resume when the source is unchanged; a changed source never inherits partial certification |  |
| LR-07 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | A dead worker is visible as STALE from heartbeat age alone; an in-progress run with a fresh heartbeat reads RUNNING | derived view only; no job transitions the row - a stale run is recovered only by the (unscheduled) supervisor or a human |
| LR-08 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | Supervisor restart / duplicate poll: a second sequential poll finds nothing to claim; spawn failure releases the claim | the release write itself is JS in pollOnce (not executed here: it shells to --linked); its SQL effect is replayed from the pinned source text |
| LR-09 | **PASS** | PASS | REAL_POSTGRES_LOCAL | REAL_PG_RACE | Two claimants racing for one blocked run never both win (SKIP LOCKED); the loser is not blocked; takeover happens only after the real 30-min |  |
| LR-10 | **PASS** | PASS | REAL_POSTGRES_LOCAL | NODE_TEST_RERUN | The Home PC concurrency harness (TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN) passes on real PostgreSQL | the pinned harness drops and recreates the schema on open (disposable, sentinel-gated) and applies the migration chain itself |

### Suite `role-independence`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| RI-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PURE_FN | Oracle accepts the sufficient example and rejects each single-condition violation (detector can fire) |  |
| RI-01 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | The durable model distinguishes and proves the run that authored head_commit from the run that certified it | THE CURRENT MODEL DOES NOT STRUCTURALLY DISTINGUISH OR PROVE AUTHORING RUN VERSUS CERTIFYING RUN: verification_status lives on the Agent Run row; complete_agent_run accepts a caller-supplied status; no certifying-run rel |
| RI-02 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | Work-Order completion requires a certifying run distinct from the authoring run, bound to the certified commit | complete_work_order binds commit to verification on the SAME agent_runs row and counts one self-certified row as sufficient; it cannot express or require a distinct certifying run. |
| RI-03 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | SOURCE_GREP | Factory authority derives from WORK ORDER + AGENT RUN + ROLE/CAPABILITY + PROVENANCE, never from the machine | claim/guard authority is granted by transport identity NAME (session_user); the runtime binds to one machine path; the worker registry is keyed by hostname. No run/role/provenance-derived authority exists for these opera |
| RI-04 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | A certification must carry exact candidate provenance; verification_status without a commit is refused | run-level certification with no commit is stored; only the Work-Order gate later notices the missing commit (verification_required_not_found / no verified commit). |
| RI-05 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | PURE_FN | An agent holding the authoring run for Work Order X cannot be dispatched as verifier for X |  |
| RI-06 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SOURCE_GREP | A requester-is-not-decider rule exists somewhere in the durable model (proof the platform can express separation of duties) | exists for salary_hr/finance approvals only; nothing equivalent exists for agent runs |

### Suite `provider-readiness`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| PR-01 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | The provider vocabulary admits a non-Claude provider (e.g. a Tier-0 / DeepSeek executor) |  |
| PR-02 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | Provider dispatch is abstracted behind an interface a second provider could implement |  |
| PR-03 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | A DeepSeek or Tier-0 provider integration, plan, or configuration exists somewhere in the tracked tree | product-side model providers (web/, supabase/functions) exist for the Brain OS product AI, not for Factory execution |
| PR-04 | **PASS** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_EXEC | A provider/model substitution on restart is recorded with a reason (never silent) AND the runtime populates requested/actual | the DB refuses a RECORDED silent substitution, but no runtime path records requested/actual at all, so an unrecorded substitution stays invisible (all-null rows are valid) |
| PR-05 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SOURCE_GREP | Provider failure classification is provider-neutral | sound for Claude Code (cross-checked by DIR-11 provider.regression.test); a second provider would need its own pattern set and there is no per-provider hook |
| PR-06 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SOURCE_GREP | An execution_provider plugin can be registered AND is consumed by the dispatcher |  |
| PR-07 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | The Factory can accept a Tier-0/DeepSeek executor today without code change |  |

### Suite `machine-property`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| MP-00 | **PARTIAL** | PARTIAL | MACHINE_PROPERTY | MACHINE_PROBE | The CLIs the Home-PC authority test probes exist on this machine | gh and vercel CLIs are absent here; routes that probe them return early in the Home-PC test and are recorded, not counted as proof |
| MP-01 | **PASS** | PASS | MACHINE_PROPERTY | NODE_TEST_RERUN | This machine holds no ambient production-write credential (7 route assertions) | ROUTE_5* probe gh, which is absent here: the test returns early - recorded, not counted as proof |
| MP-02 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | NODE_TEST_RERUN | factory-runner scripts carry no ambient production DB authority |  |
| MP-03 | **PARTIAL** | PARTIAL | MACHINE_PROPERTY | MACHINE_PROBE | The Work-PC QA evidence infrastructure is live and its canonical files are only written by the single writer | scheduled task present but no live supervisor process; lease stale; task Last Result recorded. WAITING_FOR_HOME_PC is the recorded state and is not "fixed" during this campaign |
| MP-04 | **PASS** | PASS | MACHINE_PROPERTY | MACHINE_PROBE | Every check record produced so far carries provenance and no secret-shaped value |  |

### KFM #118 (master) / #62 (p1) - confirm / refute

| Claim in the Home-PC review | Checks | Work-PC result |
|---|---|---|
| isRetryEligible has zero live call sites and cannot accept the RPC row shape | LR-05 | CONFIRMED on both refs |
| the claim RPC never checks blocked_reason (unclassified failures auto-restart) | LR-01 | REFUTED at master 55a1591: the pinned RPC filters blocked_reason like PROVIDER_CAPACITY_BLOCKED% |
| the retry loop is unbounded in SQL (attempt_count never checked) | LR-02 | REFUTED at master 55a1591: attempt_count < p_max_attempts is in the WHERE clause and the cap is observed |
| claimed_by is cleared by nothing; a run is recoverable exactly once | LR-04 | REFUTED at master 55a1591: recordCapacityBlock clears claimed_by/claimed_at; the stuck-until-TTL shape reproduces only when the reset is omitted |
| claim-then-spawn-failure strands the run | LR-08 | REFUTED at master 55a1591: resume_spawn_failed_claim_released path exists in supervisor.mjs (source contract; SQL effect replayed) |
| the supervisor reaches Postgres via supabase db query --linked (superuser, no JWT) - feature dead on arrival for founder gate | CPS-04, CPS-05 | CONFIRMED on both refs: ten runtime scripts use --linked; the claim RPC is reachable only by the postgres/supabase_admin transport identity (EXECUTE revoked from every API role, founder JWT included) |
| a company manager can rewrite the supervisor inputs (worktree, checkpoint_location, source_sha, branch, retry_after, attempt_count, claimed_by) | CPS-06 | PARTIALLY REFUTED at master 55a1591: those columns are now trigger-guarded (42501 for a manager persona); CONFIRMED for the unguarded set the completion path consumes: ["status","execution_provider","provider_run_id","agent_definition_path","agent_definition_hash","summary","head_commit","verification_status"] |
| NO_SILENT_PROVIDER_FALLBACK is schema-only (no constraint, no writer) | PR-04 | PARTIALLY REFUTED: a CHECK constraint now refuses a recorded silent substitution; CONFIRMED that no runtime path writes requested_*/actual_* (all-null rows are valid and invisible) |
| agent_run_capacity_retry_claim_security.sql was ADDED, NOT YET EXECUTED | CPS-10 | FIRST EXECUTION by the Work PC: the suite aborts at its own precondition on any PostgreSQL (compares pg_get_function_identity_arguments, which carries parameter names, with an unnamed signature string) - SUITE_PRECONDITION_DEFECT; D1-D5 are covered independently by CPS-05/CPS-06/LR-01/LR-02/LR-03 |
| 202609030001 NOT PUSHED / DO NOT PUSH AS WRITTEN | - | NOT RESOLVABLE FROM THIS SEAT: qa/KNOWN_FAILURE_MODES.md #118 (master) says NOT PUSHED; qa/verification/DB_BATCH_STATE_FINDING.md:15 says applied; qa/scenarios-runner/README.md:84 says NOT YET EXECUTED. Production migration state is PRODUCTION STATE NOT VERIFIED (no production SQL from the Work PC). |
| bounded backoff never escalates (scheduler hardcodes attemptCount: 1) | - | NOT TESTED in this campaign |

<!-- END GENERATED EVIDENCE -->
