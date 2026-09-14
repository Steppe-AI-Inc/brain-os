// Consolidate every results/<suite>.checks.json + PREFLIGHT.json into:
//   results/FACTORY_V1_ACCEPTANCE.json  - provenance-bound consolidated verdicts, grouped
//   results/RECONCILIATION.json         - state-preservation proof and repository observations
//   results/EVIDENCE_TABLES.md          - markdown fragment embedded into the canonical report
//   ../home-pc-handoff/HOMEPC-2026-09-14-factory-v1-acceptance.json
// Read-only over evidence; writes only under qa/factory-acceptance/results and qa/home-pc-handoff.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EXPECTED_SHA, pinRefs, operationalHead } from './lib/provenance.mjs';
import { REPO_ROOT } from '../runner/lib/paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'results');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const pins = pinRefs();
const preflight = JSON.parse(readFileSync(join(RESULTS, 'PREFLIGHT.json'), 'utf8'));

const SUITES = ['director', 'control-plane-security', 'lease-recovery', 'role-independence', 'provider-readiness', 'machine-property'];
const suites = {};
for (const s of SUITES) {
  const p = join(RESULTS, s + '.checks.json');
  if (!existsSync(p)) { suites[s] = { missing: true }; continue; }
  suites[s] = JSON.parse(readFileSync(p, 'utf8'));
}
const allChecks = SUITES.flatMap((s) => (suites[s].checks || []).map((c) => ({ ...c, suite: s })));

// ---- grouping -------------------------------------------------------------------------
// Verdict semantics: PASS = invariant holds as claimed; FAIL = invariant does not hold (defect evidence);
// ABSENT = the mechanism does not exist on the visible refs; PARTIAL = holds in part (details in evidence);
// NO_VERDICT = could not be observed (reason recorded). Grouping follows the founder's five buckets.
const BLOCKED_HOME_PC = ['DIR-02', 'DIR-09', 'DIR-10', 'CPS-04', 'CPS-06', 'CPS-07', 'CPS-10', 'RI-01', 'RI-02', 'RI-03', 'RI-04', 'RI-05', 'LR-05', 'PR-01', 'PR-02', 'PR-03', 'PR-06', 'PR-07', 'MP-02', 'DIR-03', 'CPS-03', 'CPS-05', 'PR-04', 'PR-05', 'RI-06', 'CPS-09'];
const BLOCKED_FOUNDER = ['MP-01'];
const grouped = { PASS: [], FAIL: [], 'BLOCKED - HOME PC': [], 'BLOCKED - FOUNDER': [], 'BLOCKED - EXTERNAL': [] };
for (const c of allChecks) {
  const row = { id: c.id, suite: c.suite, verdict: c.verdict, expect: c.expect, claim: c.claim, finding_class: c.provenance?.finding_class || c.provenance?.master?.finding_class || null, no_verdict_reason: c.no_verdict_reason || null };
  if (c.verdict === 'PASS') grouped.PASS.push(row);
  else if (BLOCKED_FOUNDER.includes(c.id)) grouped['BLOCKED - FOUNDER'].push({ ...row, action: c.evidence?.blocked_group || null });
  else if (['FAIL', 'ABSENT', 'PARTIAL', 'NO_VERDICT'].includes(c.verdict)) { grouped.FAIL.push(row); if (BLOCKED_HOME_PC.includes(c.id)) grouped['BLOCKED - HOME PC'].push({ ...row, closure_requires: 'Home-PC implementation, then Work-PC retest from a frozen SHA' }); }
}
grouped['BLOCKED - FOUNDER'].push({ id: 'CROSS_NODE_REAL', suite: 'lease-recovery', verdict: 'NO_VERDICT', claim: 'Home-PC node A -> Work-PC node B lease takeover over a shared NON-PRODUCTION PostgreSQL', finding_class: 'CROSS_NODE_REAL', action: 'supply/authorize a shared non-production PostgreSQL endpoint with generic-node credentials for both nodes (protocol prepared in the canonical report section 4)' });
grouped['BLOCKED - EXTERNAL'].push({ id: 'NONE', note: 'no external capability was missing for the work that could be executed; a DeepSeek key is deliberately NOT requested (PR-07: the adapter does not exist)' });

// ---- KFM #118 (master) / #62 (p1) confirm-refute table ----------------------------------
const byId = Object.fromEntries(allChecks.map((c) => [c.id, c]));
const kfm118 = [
  { claim: 'isRetryEligible has zero live call sites and cannot accept the RPC row shape', checks: ['LR-05'], result: byId['LR-05']?.verdict === 'FAIL' ? 'CONFIRMED on both refs' : 'NOT CONFIRMED' },
  { claim: 'the claim RPC never checks blocked_reason (unclassified failures auto-restart)', checks: ['LR-01'], result: byId['LR-01']?.verdict === 'PASS' ? 'REFUTED at master 55a1591: the pinned RPC filters blocked_reason like PROVIDER_CAPACITY_BLOCKED%' : 'CONFIRMED' },
  { claim: 'the retry loop is unbounded in SQL (attempt_count never checked)', checks: ['LR-02'], result: byId['LR-02']?.verdict === 'PASS' ? 'REFUTED at master 55a1591: attempt_count < p_max_attempts is in the WHERE clause and the cap is observed' : 'CONFIRMED' },
  { claim: 'claimed_by is cleared by nothing; a run is recoverable exactly once', checks: ['LR-04'], result: byId['LR-04']?.verdict === 'PASS' ? 'REFUTED at master 55a1591: recordCapacityBlock clears claimed_by/claimed_at; the stuck-until-TTL shape reproduces only when the reset is omitted' : 'CONFIRMED' },
  { claim: 'claim-then-spawn-failure strands the run', checks: ['LR-08'], result: byId['LR-08']?.verdict === 'PASS' ? 'REFUTED at master 55a1591: resume_spawn_failed_claim_released path exists in supervisor.mjs (source contract; SQL effect replayed)' : 'CONFIRMED' },
  { claim: 'the supervisor reaches Postgres via supabase db query --linked (superuser, no JWT) - feature dead on arrival for founder gate', checks: ['CPS-04', 'CPS-05'], result: 'CONFIRMED on both refs: ten runtime scripts use --linked; the claim RPC is reachable only by the postgres/supabase_admin transport identity (EXECUTE revoked from every API role, founder JWT included)' },
  { claim: 'a company manager can rewrite the supervisor inputs (worktree, checkpoint_location, source_sha, branch, retry_after, attempt_count, claimed_by)', checks: ['CPS-06'], result: 'PARTIALLY REFUTED at master 55a1591: those columns are now trigger-guarded (42501 for a manager persona); CONFIRMED for the unguarded set the completion path consumes: ' + JSON.stringify(byId['CPS-06']?.evidence?.consumed_but_unguarded || []) },
  { claim: 'NO_SILENT_PROVIDER_FALLBACK is schema-only (no constraint, no writer)', checks: ['PR-04'], result: byId['PR-04']?.verdict === 'PASS' ? 'PARTIALLY REFUTED: a CHECK constraint now refuses a recorded silent substitution; CONFIRMED that no runtime path writes requested_*/actual_* (all-null rows are valid and invisible)' : 'CONFIRMED' },
  { claim: 'agent_run_capacity_retry_claim_security.sql was ADDED, NOT YET EXECUTED', checks: ['CPS-10'], result: 'FIRST EXECUTION by the Work PC: the suite aborts at its own precondition on any PostgreSQL (compares pg_get_function_identity_arguments, which carries parameter names, with an unnamed signature string) - SUITE_PRECONDITION_DEFECT; D1-D5 are covered independently by CPS-05/CPS-06/LR-01/LR-02/LR-03' },
  { claim: '202609030001 NOT PUSHED / DO NOT PUSH AS WRITTEN', checks: [], result: 'NOT RESOLVABLE FROM THIS SEAT: qa/KNOWN_FAILURE_MODES.md #118 (master) says NOT PUSHED; qa/verification/DB_BATCH_STATE_FINDING.md:15 says applied; qa/scenarios-runner/README.md:84 says NOT YET EXECUTED. Production migration state is PRODUCTION STATE NOT VERIFIED (no production SQL from the Work PC).' },
  { claim: 'bounded backoff never escalates (scheduler hardcodes attemptCount: 1)', checks: [], result: 'NOT TESTED in this campaign' },
];

// ---- founder items 1-10 --------------------------------------------------------------
const items = {
  '1_persistent_factory_director': { verdict: 'FAIL', checks: ['DIR-02', 'DIR-10', 'DIR-09', 'DIR-03', 'DIR-08', 'DIR-11'], summary: 'No persistent Director exists on either ref (DIR-02 ABSENT); only the isolated-verifier shell path detaches (DIR-10 PARTIAL); WO-level duplicate dispatch is not structurally prevented (DIR-09 FAIL); runtime is host-bound (DIR-03 FAIL). Task-level DAG gating and the resume/retry pure contracts hold (DIR-08, DIR-11 PASS).' },
  '2_control_plane_security': { verdict: 'FAIL', checks: ['CPS-01', 'CPS-02', 'CPS-03', 'CPS-04', 'CPS-05', 'CPS-06', 'CPS-07', 'CPS-08', 'CPS-11', 'CPS-12'], summary: 'db.mjs holds (CPS-01/02 PASS; CPS-03 PARTIAL: username-string check only) but has zero call sites; ten runtime scripts borrow the ambient CLI credential on BOTH refs (CPS-04 FAIL); claim authority is transport-identity (machine) trust (CPS-05 PARTIAL); a company manager can write verification_status/head_commit/status on any run of their company (CPS-06 PARTIAL); control-plane tables are FK-wired into business tables (CPS-07 FAIL). Cross-company id possession is refused (CPS-08 PASS); founder-only completion gate holds (CPS-11 PASS); no factory RPC is anon-executable (CPS-12 PASS).' },
  '3_disposable_real_postgres_claim_lease': { verdict: 'PASS (REAL_POSTGRES_LOCAL + LOCAL_DB_CONTRACT)', checks: ['LR-01', 'LR-02', 'LR-03', 'LR-04', 'LR-06', 'LR-07', 'LR-08', 'LR-09', 'LR-10'], summary: 'Lease TTL (30 min, never shortened; fixture time only), attempt cap, capacity-only claim filter, resume planning, STALE view, and the two-connection SKIP LOCKED race on embedded PostgreSQL 17.10 all hold. Not CROSS_NODE_REAL.' },
  '4_work_order_duplicate_claim_recovery': { verdict: 'FAIL', checks: ['DIR-09', 'LR-03', 'LR-09'], summary: 'The Work-Order-level invariant (one active run per canonical_work_order_id) is NOT structural: two in_progress runs with distinct provider_run_ids insert freely; poll-and-dispatch dedupes with a non-atomic NOT EXISTS/INSERT (DIR-09 FAIL). The run-level claim primitive is sound (LR-03, LR-09 PASS).' },
  '5_authoring_run_ne_certifying_run': { verdict: 'FAIL', checks: ['RI-01', 'RI-02', 'RI-03', 'RI-04', 'RI-05', 'RI-06', 'CPS-06'], summary: 'AUTHORING RUN != CERTIFYING RUN is NOT ENFORCED / NOT PROVABLE by the current durable model: verification_status lives on the Agent Run row, complete_agent_run accepts a caller-supplied status, complete_work_order consumes it from the same row, no certifying-run relation exists, and a company manager can write the certification columns directly (CPS-06).' },
  '6_qa_evidence_publication_integrity_liveness': { verdict: 'PARTIAL', checks: ['MP-03', 'MP-04'], summary: 'Every record produced carries provenance and no secret-shaped value (MP-04). The Work-PC QA scheduled task is present but its supervisor process is not alive and its lease is stale since 2026-09-10 (MP-03 PARTIAL; WAITING_FOR_HOME_PC is the recorded state; not fixed during this campaign).' },
  '7_provider_tier0_deepseek_readiness': { verdict: 'ABSENT', checks: ['PR-01', 'PR-02', 'PR-03', 'PR-04', 'PR-05', 'PR-06', 'PR-07'], summary: 'Provider vocabulary closed to two Claude Code modes; dispatcher refuses any other provider; zero DeepSeek/Tier-0 references in any tracked file on either ref (canary proven); no-silent-fallback constraint holds in the DB but nothing writes requested/actual (PR-04); plugin registry admits execution_provider components that nothing consumes (PR-06). A DeepSeek key is not requested.' },
  '8_bug_036_037_retest_preparation': { verdict: 'PREPARED ONLY', checks: [], summary: 'Re-entry gate unchanged from HOMEPC-2026-09-10-BUG-036-invitation-delivery.json (READY_FOR_INDEPENDENT_WORK_PC_RETEST + exact deployed WEB SHA). No invitation/signup action was taken. BUG-035/036/037 statuses verified unchanged (RECONCILIATION.json).' },
  '9_multi_node_shared_pg_preparation': { verdict: 'BLOCKED - FOUNDER', checks: ['LR-09'], summary: 'Single-machine two-connection evidence exists (REAL_POSTGRES_LOCAL). The 17-step two-node protocol in the canonical report section 4 is ready; it needs a shared non-production PostgreSQL endpoint with generic-node credentials.' },
  '10_consolidated_report': { verdict: 'DELIVERED', checks: [], summary: 'This file + RECONCILIATION.json + qa/work-pc/FACTORY_V1_INDEPENDENT_ACCEPTANCE.md + HOMEPC-2026-09-14-factory-v1-acceptance.json' },
};

const totals = Object.fromEntries(['PASS', 'FAIL', 'ABSENT', 'PARTIAL', 'NO_VERDICT'].map((v) => [v, allChecks.filter((c) => c.verdict === v).length]));
const byClass = {};
for (const c of allChecks) { const fc = c.provenance?.finding_class || c.provenance?.master?.finding_class || 'UNSPECIFIED'; byClass[fc] = (byClass[fc] || 0) + 1; }

const acceptance = {
  _doc: 'Work-PC independent Factory V1 acceptance, executed evidence. Every check is provenance-bound to the pinned refs; evidence levels are never promoted. A FAIL is a recorded result, not a hidden one. The Work PC did not modify any implementation.',
  generated_at: nowIso(),
  generated_by: 'work-pc-qa (independent Factory V1 acceptance authority)',
  refs_tested: { master: { ref: 'origin/master', sha: EXPECTED_SHA.master, worktree: pins.master?.path || null }, p1: { ref: 'origin/p1/control-plane-phase0', sha: EXPECTED_SHA.p1, worktree: pins.p1?.path || null } },
  deployed_web_sha: 'UNKNOWN', production_binding: 'CANNOT_BIND_TO_DEPLOYED_WEB', production_sql_used: false, production_credentials_loaded: false,
  operational_head_before_commit: operationalHead(),
  substrate: { pglite: preflight.pglite, embedded_postgres: { ...preflight.embedded_pg, adapter: preflight.embedded_pg?.adapter, teardown: preflight.teardown || 'NOT_YET_TORN_DOWN' }, deps: preflight.deps, rescan_after_deps: preflight.rescan },
  evidence_levels: { SOURCE_FINDING_ONLY: 'pinned source text', LOCAL_DB_CONTRACT: 'PGlite single connection, RLS emulation - NOT SECURITY VERIFIED', REAL_POSTGRES_LOCAL: 'embedded PostgreSQL 17.10, two connections, one machine', MACHINE_PROPERTY: 'this Work PC', CROSS_NODE_REAL: 'BLOCKED - never claimed' },
  totals, checks_by_finding_class: byClass, check_count: allChecks.length,
  founder_items: items,
  grouped,
  kfm_118_master_62_p1: kfm118,
  suites: Object.fromEntries(SUITES.map((s) => [s, suites[s].missing ? { missing: true } : { checks: suites[s].checks.map((c) => ({ id: c.id, verdict: c.verdict, expect: c.expect, method: c.method, evidence_kind: c.evidence_kind, claim: c.claim, no_verdict_reason: c.no_verdict_reason || null, kfm_ref: c.kfm_ref || null, provenance: c.provenance, evidence: c.evidence })) }])),
};
writeFileSync(join(RESULTS, 'FACTORY_V1_ACCEPTANCE.json'), JSON.stringify(acceptance, null, 2) + '\n');

// ---- reconciliation ------------------------------------------------------------------
const bugQueue = JSON.parse(readFileSync(join(REPO_ROOT, 'qa', 'BUG_QUEUE.json'), 'utf8'));
const bugs = Object.fromEntries((bugQueue.bugs || []).filter((b) => /^BUG-03[567]$/.test(b.bug_id)).map((b) => [b.bug_id, { status: b.status, severity: b.severity, title: b.title.slice(0, 90) }]));
const supState = JSON.parse(readFileSync(join(REPO_ROOT, 'qa', 'runner', 'SUPERVISOR_STATE.json'), 'utf8'));
const committedBugs = (() => { try { const j = JSON.parse(spawnSync('git', ['show', 'origin/qa/work-pc:qa/BUG_QUEUE.json'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 }).stdout); return Object.fromEntries((j.bugs || []).filter((b) => /^BUG-03[567]$/.test(b.bug_id)).map((b) => [b.bug_id, { status: b.status, severity: b.severity }])); } catch { return null; } })();
const untracked = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'scripts', 'supabase', 'web', 'governance', '.github', 'docs'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean);
const trackedDirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'scripts', 'supabase', 'web', 'governance', '.github', 'docs', 'qa/BUG_QUEUE.json', 'qa/HANDOFF_STATE.json', 'qa/runner/SUPERVISOR_STATE.json'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean);
const reconciliation = {
  _doc: 'State-preservation proof for the Factory V1 acceptance campaign plus repository observations. Nothing here changes product bug state.',
  generated_at: nowIso(),
  bug_state_now: bugs, bug_state_committed_on_origin_qa_work_pc: committedBugs,
  bug_state_preserved: committedBugs ? Object.keys(bugs).every((k) => bugs[k].status === committedBugs[k]?.status && bugs[k].severity === committedBugs[k]?.severity) : 'UNVERIFIED',
  supervisor_state: supState.supervisor_state, supervisor_blocked_on: supState.blocked_on || null, supervisor_state_file_modified_by_campaign: false,
  origin_qa_work_pc_moved_during_campaign: { from: '157174d791c4b80b6605d3b105cf64f023ba3bfe', to: '8056384b0b38cb6c285d2a33d691a3c6493ab245', commits: ['4749730 qa(work-pc): hand off Factory V1 independent acceptance blockers', '8056384 qa(work-pc): record Factory V1 independent acceptance'], author_identity: 'same git identity as this seat (founder account), pushed 2026-09-14 10:19-10:21 +0800 from another working copy', content: 'qa/home-pc-handoff/HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md (source+CI-only findings) and qa/work-pc/FACTORY_V1_INDEPENDENT_ACCEPTANCE.md (source+CI-only report)', action_taken: 'fast-forwarded the operational tree (ff-only, no merge commit); this campaign UPDATES the canonical report with executed evidence rather than replacing it' },
  product_trees_tracked_modifications: trackedDirty,
  product_trees_untracked_files_not_authored_by_this_campaign: untracked.map((l) => l.replace(/^\?\? /, '')),
  untracked_note: 'untracked files under .github/docs/supabase/web date from 2026-08-24/25 (Phase-0 review artefacts of a codex/sem-brain-v1 session on this Drive-synced folder); left untouched; not staged',
  migration_202609030001_applied_state_contradiction: ['qa/KNOWN_FAILURE_MODES.md #118 (master) / #62 (p1): NOT PUSHED - DO NOT PUSH AS WRITTEN', 'qa/verification/DB_BATCH_STATE_FINDING.md:15: 202609030001 (D) authorized / applied', 'qa/scenarios-runner/README.md:84: claim-security suite NOT YET EXECUTED', 'Work PC verdict: PRODUCTION STATE NOT VERIFIED (no production SQL from this seat)'],
  home_pc_claim_recorded_unverified: 'HOME_PC_CLAIM, WORK_PC_UNVERIFIED: the BUG-036 fix report on origin/wo/invitation-delivery names DEPLOYED_WEB_SHA 55a1591 / dpl_JBQSWhr6uRcjJ7jNxxQj2VRjwrKJ',
  work_pc_scheduled_task_observation: byId['MP-03']?.evidence ? { scheduled_task: byId['MP-03'].evidence.scheduled_task, lease: byId['MP-03'].evidence.lease, supervisor_state: byId['MP-03'].evidence.supervisor_state } : null,
};
writeFileSync(join(RESULTS, 'RECONCILIATION.json'), JSON.stringify(reconciliation, null, 2) + '\n');

// ---- markdown evidence tables -----------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = '';
md += `<!-- BEGIN GENERATED EVIDENCE (qa/factory-acceptance/consolidate.mjs, ${acceptance.generated_at}) -->\n\n`;
md += `| Totals | PASS ${totals.PASS} | FAIL ${totals.FAIL} | ABSENT ${totals.ABSENT} | PARTIAL ${totals.PARTIAL} | NO_VERDICT ${totals.NO_VERDICT} | checks ${allChecks.length} |\n|---|---|---|---|---|---|---|\n\n`;
for (const s of SUITES) {
  if (suites[s].missing) continue;
  md += `### Suite \`${s}\`\n\n| Check | Verdict | Expected | Level | Method | Claim tested | Note |\n|---|---|---|---|---|---|---|\n`;
  for (const c of suites[s].checks) {
    const fc = c.provenance?.finding_class || c.provenance?.master?.finding_class || '';
    const note = c.no_verdict_reason || c.evidence?.blocked_group || c.evidence?.statement || c.evidence?.interpretation || c.evidence?.confirms_or_refutes || c.evidence?.note || '';
    md += `| ${c.id} | **${c.verdict}** | ${c.expect} | ${esc(fc)} | ${esc(c.method)} | ${esc(c.claim).slice(0, 140)} | ${esc(note).slice(0, 220)} |\n`;
  }
  md += '\n';
}
md += `### KFM #118 (master) / #62 (p1) - confirm / refute\n\n| Claim in the Home-PC review | Checks | Work-PC result |\n|---|---|---|\n`;
for (const k of kfm118) md += `| ${esc(k.claim)} | ${k.checks.join(', ') || '-'} | ${esc(k.result)} |\n`;
md += `\n<!-- END GENERATED EVIDENCE -->\n`;
writeFileSync(join(RESULTS, 'EVIDENCE_TABLES.md'), md);

// ---- Home-PC handoff (JSON, same shape family as the BUG-036 handoff) ------------------
const failing = allChecks.filter((c) => ['FAIL', 'ABSENT', 'PARTIAL'].includes(c.verdict) && c.evidence_kind === 'independent');
const handoff = {
  _doc: 'Structured Work-PC -> Home-PC handoff for Factory V1. Authored by the Work-PC independent acceptance authority. Executed-evidence companion to HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md (source/CI-only). No credentials, no production SQL, no implementation.',
  handoff_id: 'HOMEPC-2026-09-14-factory-v1-acceptance', created_at: nowIso(), created_by: 'work-pc-qa (independent Factory V1 acceptance authority)',
  companion_markdown: 'qa/home-pc-handoff/HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md', canonical_report: 'qa/work-pc/FACTORY_V1_INDEPENDENT_ACCEPTANCE.md', evidence_root: 'qa/factory-acceptance/results/',
  refs_tested: acceptance.refs_tested, deployed_web_sha: 'UNKNOWN',
  work_pc_state: supState.supervisor_state, bug_state_preserved: reconciliation.bug_state_preserved,
  what_home_pc_must_do: [
    { id: 'FV1-001', from_checks: ['DIR-02', 'DIR-10', 'DIR-03'], requirement: 'Publish a persistent, restart-safe, computer-agnostic Factory Director at a frozen SHA (no hardcoded REPO_ROOT; no session-bound pollOnce). Work PC retests DIR-02/03/09/10 from that SHA.' },
    { id: 'FV1-001b', from_checks: ['DIR-09'], requirement: 'Make Work-Order dispatch idempotent structurally (e.g. a partial unique index or trigger refusing a second active agent_run per canonical_work_order_id) - the current NOT EXISTS/INSERT in poll-and-dispatch.mjs is a TOCTOU. Work PC retests DIR-09 on real PostgreSQL with two connections.' },
    { id: 'FV1-002', from_checks: ['CPS-04', 'CPS-05', 'CPS-03'], requirement: 'Remove every `supabase db query --linked` path from scripts/factory-runner/*.mjs (10 files, both refs) by mechanism removal; reconcile claim_blocked_run_for_retry / guard_agent_run_retry_columns with least privilege (they currently require the postgres/supabase_admin transport identity that db.mjs refuses); close db.mjs gaps (server-side rolsuper check, service_role, SET SESSION AUTHORIZATION, search_path).' },
    { id: 'FV1-002b', from_checks: ['CPS-06'], requirement: 'Scope the write path of every agent_runs column the completion/certification path consumes: status, head_commit, verification_status, summary, execution_provider, provider_run_id, agent_definition_path, agent_definition_hash are writable by a company manager under agent_runs_update_scope (PGlite RLS emulation; confirm on real PostgreSQL with a non-superuser session).' },
    { id: 'FV1-002c', from_checks: ['CPS-07'], requirement: 'Decide and document the control-plane isolation model: canonical_work_orders/agent_runs/tasks are FK-wired (CASCADE) into companies/goals/people/profiles. Business IDs are not opaque today.' },
    { id: 'FV1-003', from_checks: ['RI-01', 'RI-02', 'RI-04', 'RI-05'], requirement: 'Materialize certification as a durable relation distinct from the authoring run (distinct run, distinct agent, bound to the exact certified commit, started from committed state, verifier capability, provenance materialized). The Work-PC acceptance oracle (qa/factory-acceptance/lib/independence.mjs, conditions C1..C10) states what evidence must exist; it does not prescribe the schema. Work PC retests RI-01..05 and the seven negative cases.' },
    { id: 'FV1-004', from_checks: ['CPS-10', 'CPS-09'], requirement: 'Fix qa/scenarios-runner/agent_run_capacity_retry_claim_security.sql precondition (identity-argument string includes parameter names) and make factory_rpc_privilege_sweep.sql engine-neutral (auth.users.instance_id). Both were first executed by the Work PC and could not run.' },
    { id: 'FV1-005', from_checks: ['PR-01', 'PR-02', 'PR-04', 'PR-06', 'PR-07'], requirement: 'Provider adapter contract before any key: enum values, adapter behind the provider interface, per-provider classifier, runtime population of requested_*/actual_*/fallback_reason at dispatch and restart, cost/budget accounting. A DeepSeek key is not requested until this exists.' },
    { id: 'DOC', from_checks: [], requirement: 'Settle the 202609030001 applied-state contradiction (KFM #118 NOT PUSHED vs DB_BATCH_STATE_FINDING applied vs README NOT YET EXECUTED) and record the production migration head with a SHA.' },
  ],
  independent_findings: failing.map((c) => ({ id: c.id, suite: c.suite, verdict: c.verdict, claim: c.claim, finding_class: c.provenance?.finding_class || c.provenance?.master?.finding_class || null, provenance: c.provenance })),
  cross_node_real: { status: 'BLOCKED - FOUNDER', needs: 'shared NON-PRODUCTION PostgreSQL endpoint + generic-node credentials for both nodes; protocol in canonical report section 4', never_substitute: 'production' },
  bug_036_037_re_entry_gate: 'unchanged - see qa/home-pc-handoff/HOMEPC-2026-09-10-BUG-036-invitation-delivery.json phase_b_re_entry_gate',
  work_pc_prohibitions_still_in_force: ['no production SQL', 'no Supabase admin/service-role authority', 'no implementation under scripts/, supabase/, web/, governance/, .github/, docs/', 'no v99/#99 candidate edits', 'no invitation/signup testing until READY_FOR_INDEPENDENT_WORK_PC_RETEST + deployed WEB SHA'],
  no_credentials_statement: 'No credential value, token, or production URL is recorded in any Factory acceptance artifact; the disposable PostgreSQL password is a fixed non-secret literal for a loopback-only cluster that was stopped and deleted after evidence collection.',
};
writeFileSync(join(REPO_ROOT, 'qa', 'home-pc-handoff', 'HOMEPC-2026-09-14-factory-v1-acceptance.json'), JSON.stringify(handoff, null, 2) + '\n');

console.log(JSON.stringify({ totals, checks: allChecks.length, by_class: byClass, grouped_counts: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])), bug_state_preserved: reconciliation.bug_state_preserved, supervisor_state: reconciliation.supervisor_state, tracked_dirty: trackedDirty.length, untracked: untracked.length }, null, 2));
