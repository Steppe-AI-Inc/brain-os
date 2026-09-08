// verifier #12 mutation battery (campaign #72, base f4763ef).
// For each mutant: apply an exact string replacement to a REAL source file, run the whole
// committed battery, restore, and assert the restore is byte-identical by sha256.
// A mutant that SURVIVES (battery still all-green) is a guard that does not observe the
// property it claims to protect.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const EXTRACT = 'qa/scenarios-runner/_gate_extract.mjs';
const CONT = 'qa/scenarios-runner/current_turn_and_continuity_contract.mjs';
const REQUIRED_INDEX_SHA = '1db385790f42286497540187c7c18e5661d59742eec67dc61cc978e8c8b369ec';

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const ORIG = {};
for (const f of [INDEX, EXTRACT, CONT]) ORIG[f] = { text: readFileSync(f, 'utf8'), sha: sha(f) };
if (ORIG[INDEX].sha !== REQUIRED_INDEX_SHA) { console.log('BASELINE MISMATCH'); process.exit(2); }
console.log('baseline index.ts ' + ORIG[INDEX].sha);

// ---- mutants ------------------------------------------------------------------------
// edits: [file, find, replace][]
const MUTANTS = [
  { id: 'M1.D86.positionRule', why: 'D86: completion participle after the first word must be refused',
    edits: [[INDEX, '            if (completionIdx > 0) return null;\n', '']] },
  { id: 'M2.D86.leadingParticiple', why: 'D86: leading participle + named ALL-CAPS object must be refused',
    edits: [[INDEX, "            if (completionIdx === 0 && words.slice(1).some((w) => /^[\\p{Lu}0-9]{2,}$/u.test(w))) return null;\n", '']] },
  { id: 'M3.D87.sharedVocabulary', why: 'D87: arm 3 must use the SHARED progress verb list, not a short subset',
    edits: [[INDEX, "          '|(?:now|currently) (?:' + PROGRESS_VERBS + ')'",
                    "          '|(?:now|currently) (?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting)'"]] },
  { id: 'M4.D88.commaClauseReduction', why: 'D88: comma-joined assertion must be reduced to its last clause',
    edits: [[INDEX, "          if (q.includes(',')) {", "          if (false && q.includes(',')) {"]] },
  { id: 'M5.D88.completionInQuestionBelt', why: 'D88: a surviving question still carrying completion vocabulary must be dropped',
    edits: [[INDEX, '          if (COMPLETION_WORD.test(q)) return null;\n', '']] },
  { id: 'M6.orderingAnchorMoved', why: 'ordering guard must FAIL CLOSED when the buildContext anchor moves',
    edits: [[INDEX, 'const ctx = await buildContext(', 'const ctx = await buildContextRenamed(']] },
  { id: 'M7.callbackArrowStrip', why: 'shared callback-arrow strip must keep the continuity window EXECUTABLE',
    edits: [[EXTRACT, "  s = s.replace(\n    /\\(([A-Za-z_$][\\w$]*\\s*:\\s*[^),]+(?:,\\s*[A-Za-z_$][\\w$]*\\s*:\\s*[^),]+)*)\\)\\s*=>/g,\n    (_m, params) => '(' + params.split(',').map((p) => p.split(':')[0].trim()).join(', ') + ') =>');\n", '']] },
  { id: 'M8.anchorExistenceGuard', why: 'the implementing session classified THIS as an equivalent mutant — confirm or refute',
    edits: [[CONT, '      iCtx >= 0 && iPending >= 0 && iCtx < iPending,', '      iCtx < iPending,']] },
  { id: 'M9.M6plusM8.combined', why: 'anchor moved AND existence guard removed — the exact fail-open the guard exists for',
    edits: [[INDEX, 'const ctx = await buildContext(', 'const ctx = await buildContextRenamed('],
            [CONT, '      iCtx >= 0 && iPending >= 0 && iCtx < iPending,', '      iCtx < iPending,'],
            [CONT, '__NEVER__', '__NEVER__']] },
];

function runBattery() {
  const r = spawnSync(process.execPath, ['qa/verification/scratch/v12_battery_exec.mjs'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DEPLOY_GATE: '1' },
  });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); }
  catch { return { error: true, out: (r.stdout || '') + (r.stderr || '') }; }
}

const report = [];
for (const m of MUTANTS) {
  // apply
  let applied = true;
  const touched = new Set();
  for (const [file, find, repl] of m.edits) {
    if (find === '__NEVER__') continue;
    const cur = readFileSync(file, 'utf8');
    const n = cur.split(find).length - 1;
    if (n !== 1) { console.log(`SKIP ${m.id}: anchor occurs ${n}x in ${file}`); applied = false; break; }
    writeFileSync(file, cur.replace(find, repl));
    touched.add(file);
  }
  let res = null;
  if (applied) res = runBattery();
  // restore + verify byte-identical
  for (const f of touched) writeFileSync(f, ORIG[f].text);
  const restoreOk = [...touched].every((f) => sha(f) === ORIG[f].sha);
  if (!restoreOk) { console.log('RESTORE FAILED for ' + m.id + ' — ABORTING'); process.exit(3); }
  if (!applied) { report.push({ ...m, status: 'NOT_APPLIED' }); continue; }
  const killed = res.error || !res.all_exit_zero;
  const killers = res.error ? ['<runner error>'] : res.results.filter((r) => r.exit !== 0).map((r) => r.suite);
  report.push({ id: m.id, why: m.why, status: killed ? 'KILLED' : 'SURVIVED', killed_by: killers, restore_sha_ok: true });
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${m.id.padEnd(30)} ${killed ? 'by: ' + killers.join(', ') : '<-- battery stayed green>'}`);
}

console.log('\nfinal index.ts sha256 ' + sha(INDEX) + '  identical=' + (sha(INDEX) === REQUIRED_INDEX_SHA));
writeFileSync('qa/verification/scratch/v12_mutation_report.json', JSON.stringify({
  base_commit: 'f4763ef', index_sha: REQUIRED_INDEX_SHA, ran_at: new Date().toISOString(),
  survived: report.filter((r) => r.status === 'SURVIVED').map((r) => r.id), report,
}, null, 1));
