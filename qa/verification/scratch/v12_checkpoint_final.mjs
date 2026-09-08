import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(readFileSync(p, 'utf8'));

j.project_ref = 'pvphxgrtdfrudejjhzjk';
j.scenarios['4_production_read_only'] = {
  status: 'PASS',
  evidence: '`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` (read-only). sem-ai-command: status ACTIVE, version 92, ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475, updated_at 1788239725518 — byte-for-byte the fingerprint verifiers #10 and #11 recorded. All six functions ACTIVE and unchanged. ZERO writes performed: no deploy, no db push, no db query, no migration.',
  defects_found: [], regressions_added: [],
};
j.scenarios['5_bookkeeping_honesty'] = {
  status: 'PASS_WITH_DEFECT',
  evidence: 'VERIFIED TRUE: (a) run11 exit-guard hardening is real — `if (fail > 0) process.exit(1)` with no kind-based carve-out; (b) run11_defect_closure_contract is 46/46 and the 18 #11 DEFECT rows (D86 x5, D87 x7, D88 x6) all reproduce as fixed; (c) the equivalent-mutant disclosure is honest and its classification is CONFIRMED, with the correction recorded in mutation_survivor_classification; (d) D89 is genuinely closed at BRANCH level — `git log master -- supabase/migrations/` shows all four prepared migrations on master (202609020001 @3527244, 202609020002 @5d84042, 202609020003 @15f46a9, 202609030001 @2e3445c). DEFECT D96: SESSION_CHECKPOINT.md line 20 pins the master worktree at 12191e8 and lines 22-27 claim all four live there, but 202609030001_agent_run_capacity_retry.sql is ABSENT at 12191e8 (verified by git cat-file -e); it landed with 2e3445c, two commits later. Lines 18 and 31 are also stale (still name #10 / 65ade7c). Additional bookkeeping finding: the #71 promotion pasted its own "# PROPOSED entry for qa/KNOWN_FAILURE_MODES.md" preamble verbatim into the canonical ledger at line 6710.',
  defects_found: ['D96'], regressions_added: [],
};
j.defects_found.push({
  id: 'D96', severity: 'P3',
  title: 'The D89 correction is right about the branch and wrong about the worktree commit',
  evidence: 'SESSION_CHECKPOINT.md:20 pins master@C:/Users/Dell/dev/brain-os-bug006 at 12191e8; :22-27 claim all four prepared migrations live there; :28 instructs dispatching any DB verifier against that worktree. git cat-file -e confirms 202609020001/2/3 exist at 12191e8 but 202609030001_agent_run_capacity_retry.sql does NOT (added by 2e3445c, later). A verifier following line 28 without pulling finds three of four. Lines 18 and 31 are stale (#10 / 65ade7c).',
  regression_vs_prior_sha: false, status: 'FLAGGED, not fixed',
});
j.defects_found.push({
  id: 'D97', severity: 'P3',
  title: 'The #71 ledger promotion pasted its own PROPOSED-file preamble into the canonical ledger',
  evidence: 'qa/KNOWN_FAILURE_MODES.md:6710 now begins "# PROPOSED entry for qa/KNOWN_FAILURE_MODES.md — verifier #11, campaign #71" followed by "(Placed under qa/verification/proposed/ because this campaign\'s write authority is qa/verification/** only … Append verbatim after entry #70.)" — an instruction-to-self, inside the permanent ledger, asserting that the entry is proposed and lives elsewhere.',
  regression_vs_prior_sha: false, status: 'FLAGGED, not fixed',
});

j.global_integrity_assertions = {
  note: 'This campaign is source/executable-logic level on an Edge Function; no DB or UI mutation was performed, so the entity-graph rows are N/A rather than PASS.',
  'orphan canonical references': 'N/A — no DB access exercised',
  'active child -> invalid/nonexistent parent': 'N/A — no DB access exercised',
  'duplicate relationships': 'N/A — no DB access exercised',
  'AI false execution claims': 'FAIL-ADJACENT — 17 assertion labels (D91) and 15 progressive shapes (D94) still reach founder-facing text uncorrected; no NEW false-claim path introduced by f4763ef',
  'UI <-> DB contradictions': 'BLOCKED — no browser tooling in this session',
  'AI <-> DB contradictions': 'BLOCKED — no live AI chat turn was run',
  'index.ts byte integrity': 'PASS — sha256 1db38579…b369ec asserted at start, after all 11 mutations, after the candidate-fix validation, and after the final battery',
};
j.coverage_gaps_explicit = [
  'BLOCKED: no browser/UI tooling available in this session — live UI truth is not verified, only asserted absent (web/ has zero pendingAction references, grep-verified).',
  'BLOCKED: no live AI chat turn executed against the deployed function — all AI-behaviour findings are from the REAL gate slice executed out of index.ts, not from a live model round-trip.',
  'BLOCKED: no database access exercised — RLS, lifecycle and relationship truth are outside this campaign.',
  'Production remains v92, which is older than both fdb4564 and f4763ef; every A/B in this campaign is f4763ef vs fdb4564, not vs deployed v92.',
];
j.scenarios['1_sha_and_full_battery'].evidence += ' RE-CONFIRMED at end of campaign: battery re-run on the restored tree, 22/22 exit 0, TOTAL OK=491 FAIL=0, sha unchanged.';
j.remaining_scenarios = [];
j.verdict = 'DO NOT DEPLOY — f4763ef / index.ts sha256 1db385790f42286497540187c7c18e5661d59742eec67dc61cc978e8c8b369ec';
j.verdict_basis = 'The battery (22 suites, 491 checks) and 11 independent source mutations were executed on this exact SHA and the five run11 fixes are all real and load-bearing. The gate is nevertheless CLOSED because the closure introduced NEW defects that #11 did not have to weigh: D92 (P1) silently destroys 12 of 20 realistic clarification questions on ordinary and correction turns and nulls pendingAction.question while the action stays armed — the run10/D84 shape the same closure cites as "worse than what it prevented" — and D93 (P2) makes real company names carrying a non-leading completion word unselectable in disambiguation, the run9/D72 dead-end class via a new route. Both are A/B-proven regressions against fdb4564, the SHA #11 certified, so f4763ef is NOT strictly better than its predecessor on the shapes measured — the exact standard #11 used to open the previous gate. D92 has a prepared, validated, single-hunk fix (battery stays 22/22 green; drops 12/22 -> 0/22; leaks 0/10 -> 0/10) that needs no DB push.';
j.verdict_conditions = [
  'Land qa/verification/proposed/v12_d92_fix.patch.md (D92, P1) — validated, single hunk, no DB push.',
  'Decide D93: either exempt a refused label from quoting for selection purposes, or make matchDisambiguationOption strip quote characters before comparing.',
  'Promote qa/verification/proposed/v12_regression_additions.mjs (46 defect rows, 22 contract rows, 0 contract failures) into qa/scenarios-runner/ with its exit guard intact.',
  'Append only the "## #72" section of qa/verification/proposed/v12_known_failure_modes_entry_72.md to the ledger, and remove the stray #71 PROPOSED preamble at qa/KNOWN_FAILURE_MODES.md:6710 (D97).',
  'Correct SESSION_CHECKPOINT.md lines 18-31 (D96): the master worktree at 12191e8 has three of the four prepared migrations, not four.',
];
j.pending_db_pushes = [];
j.synthetic_entities_created_by_this_campaign = [];
j.cleanup = 'No QA-VERIFY-* synthetic data was created: this campaign performed zero database and zero UI mutations. All source mutation was in-place-and-restored with sha256 proof; the only working-tree changes are under qa/verification/**.';
j.last_checkpoint_at = new Date().toISOString();
writeFileSync(p, JSON.stringify(j, null, 1));
console.log('final checkpoint written; verdict = ' + j.verdict);
