// verifier #11 attempt 2 — prove the PROPOSED suite is NOT decorative: re-apply the 7
// mutants that survived the whole committed battery and confirm
// qa/verification/proposed/v11_regression_additions.mjs now exits NON-ZERO for each.
// Same always-restore + sha-assert discipline.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const BASE = '66fa821d7893248236e3d1626fa321c7ca9872957c0d50520b8067eec13ddded';
const original = readFileSync(SRC);
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (sha(original) !== BASE) { console.log('ABORT baseline ' + sha(original)); process.exit(2); }
const text = original.toString('utf8');
const N = '\r\n';
const SUITE = 'qa/verification/proposed/v11_regression_additions.mjs';
const COMMITTED = 'qa/scenarios-runner/current_turn_and_continuity_contract.mjs';
const COMMITTED10 = 'qa/scenarios-runner/run10_defect_closure_contract.mjs';

const MUTANTS = [
  ['M04 ellipsis terminator removed', "|| ch === '…' || ch === '。'", "|| ch === '。'", COMMITTED10],
  ['M19 historyWindowStart off-by-one',
    '  const historyWindowStart = totalPriorTurns - (conversationRowsChronological || []).length + 1;',
    '  const historyWindowStart = totalPriorTurns - (conversationRowsChronological || []).length;', COMMITTED],
  ['M21 historyIsComplete inverted',
    '    historyIsComplete: totalPriorTurns <= (conversationRowsChronological || []).length,',
    '    historyIsComplete: totalPriorTurns >= (conversationRowsChronological || []).length,', COMMITTED],
  ['M26 source-work-order check removed',
    '    && durableChannelState.pending_action_source_work_order_id', '    && true', COMMITTED],
  ['M30 buildContext call site renamed',
    'const ctx = await buildContext(', 'const ctx = await buildContextRenamed(', COMMITTED],
  ['M11 structuredProseDrift forced false',
    'const structuredProseDrift = unaccountedCompletionProse' + N + '          && (rawClaims !== null || deterministicPrefix.length > 0 || claimExecutionEvidence.length > 0);',
    'const structuredProseDrift = false;', COMMITTED10],
  ['M15b EXECUTION_IN_PROGRESS removed from the structured arm',
    'const unaccountedCompletionProse = !hasSupportedMutationClaim' + N + "          && (LEGACY_PAST_COMPLETION.test(String(result.summary || '')) || EXECUTION_IN_PROGRESS.test(String(result.summary || '')));",
    'const unaccountedCompletionProse = !hasSupportedMutationClaim' + N + "          && (LEGACY_PAST_COMPLETION.test(String(result.summary || '')));", COMMITTED10],
];

const run1 = (f) => {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', env: { ...process.env, DEPLOY_GATE: '1' }, maxBuffer: 6e7 });
  const t = (r.stdout || '') + (r.stderr || '');
  return { exit: r.status, contractFails: (t.match(/^FAIL .*\[CONTRACT\].*$/gm) || []).slice(0, 4) };
};

const out = [];
try {
  for (const [id, find, repl, committed] of MUTANTS) {
    if (!text.includes(find)) { console.log('ANCHOR MISS ' + id); continue; }
    writeFileSync(SRC, text.replace(find, repl), 'utf8');
    const proposed = run1(SUITE);
    const commit = run1(committed);
    writeFileSync(SRC, original);
    if (sha(readFileSync(SRC)) !== BASE) { console.log('FATAL restore ' + id); break; }
    const killed = proposed.exit !== 0;
    out.push({ id, proposedExit: proposed.exit, committedExit: commit.exit, killed, evidence: proposed.contractFails });
    console.log((killed ? 'NOW KILLED   ' : 'STILL SURVIVES ') + id
      + '  [proposed exit=' + proposed.exit + ', committed ' + committed.split('/').pop() + ' exit=' + commit.exit + ']');
    for (const l of proposed.contractFails) console.log('      > ' + l.slice(0, 150));
  }
} finally {
  writeFileSync(SRC, original);
  const f = sha(readFileSync(SRC));
  console.log('\nFINAL RESTORE sha256 ' + f + ' MATCH=' + (f === BASE));
  writeFileSync('qa/verification/scratch/v11a_mutation_report3_new_suite.json',
    JSON.stringify({ baseline_sha: BASE, final_sha: f, ran_at: new Date().toISOString(), results: out }, null, 1));
  console.log('killed by the PROPOSED suite: ' + out.filter((o) => o.killed).length + '/' + out.length);
  console.log('still green on the COMMITTED suite (proving the gap was real): '
    + out.filter((o) => o.committedExit === 0).length + '/' + out.length);
}
