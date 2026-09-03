// verifier #12 mutation battery, part 2 — CRLF-safe anchors (part 1 skipped three
// mutants because its anchors carried an LF newline and the working tree is CRLF).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const REQUIRED = '1db385790f42286497540187c7c18e5661d59742eec67dc61cc978e8c8b369ec';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const ORIG = readFileSync(INDEX, 'utf8');
if (sha(INDEX) !== REQUIRED) { console.log('BASELINE MISMATCH'); process.exit(2); }

const MUTANTS = [
  { id: 'M1.D86.positionRule', why: 'D86: a completion participle after the first word must be refused',
    find: 'if (completionIdx > 0) return null;', repl: 'if (false && completionIdx > 0) return null;' },
  { id: 'M2.D86.leadingParticiple', why: 'D86: leading participle + ALL-CAPS named object must be refused',
    find: 'if (completionIdx === 0 && words.slice(1).some', repl: 'if (false && completionIdx === 0 && words.slice(1).some' },
  { id: 'M5.D88.completionInQuestionBelt', why: 'D88: a surviving question still asserting a completion must be dropped',
    find: 'if (COMPLETION_WORD.test(q)) return null;', repl: 'if (false && COMPLETION_WORD.test(q)) return null;' },
  { id: 'M10.D88.pastCompletionBelt', why: 'run9 belt: a completion phrased AS the question must be dropped',
    find: 'if (PAST_COMPLETION_CLAIM_PATTERN.test(q)) return null;', repl: 'if (false && PAST_COMPLETION_CLAIM_PATTERN.test(q)) return null;' },
  { id: 'M11.D86.titleCaseGate', why: 'the Title-Case name-shape discriminator itself must be load-bearing',
    find: 'if (!titleCasedName) return null;', repl: 'if (false && !titleCasedName) return null;' },
];

function runBattery() {
  const r = spawnSync(process.execPath, ['qa/verification/scratch/v12_battery_exec.mjs'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DEPLOY_GATE: '1' } });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { error: true }; }
}

const report = [];
for (const m of MUTANTS) {
  const n = ORIG.split(m.find).length - 1;
  if (n !== 1) { console.log(`SKIP ${m.id}: anchor occurs ${n}x`); report.push({ ...m, status: 'NOT_APPLIED' }); continue; }
  writeFileSync(INDEX, ORIG.replace(m.find, m.repl));
  const res = runBattery();
  writeFileSync(INDEX, ORIG);
  if (sha(INDEX) !== REQUIRED) { console.log('RESTORE FAILED — ABORT'); process.exit(3); }
  const killed = res.error || !res.all_exit_zero;
  const killers = res.error ? ['<runner error>'] : res.results.filter((r) => r.exit !== 0).map((r) => r.suite);
  report.push({ id: m.id, why: m.why, status: killed ? 'KILLED' : 'SURVIVED', killed_by: killers, restore_sha_ok: true });
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${m.id.padEnd(30)} ${killed ? 'by: ' + killers.join(', ') : '<-- battery stayed green>'}`);
}
console.log('\nfinal index.ts sha256 ' + sha(INDEX) + '  identical=' + (sha(INDEX) === REQUIRED));
writeFileSync('qa/verification/scratch/v12_mutation_report2.json', JSON.stringify({
  base_commit: 'f4763ef', ran_at: new Date().toISOString(),
  survived: report.filter((r) => r.status === 'SURVIVED').map((r) => r.id), report }, null, 1));
