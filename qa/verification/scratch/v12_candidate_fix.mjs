// verifier #12: validate a CANDIDATE fix for D92 (the run11/D88 blanket
// completion-in-question belt drops legitimate clarification questions wholesale).
// The file is edited temporarily, the whole battery + the attack corpus are run, then the
// file is restored and sha256-verified byte-identical. Nothing is committed to index.ts.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const REQUIRED = '1db385790f42286497540187c7c18e5661d59742eec67dc61cc978e8c8b369ec';
const sha = () => createHash('sha256').update(readFileSync(INDEX)).digest('hex');
const ORIG = readFileSync(INDEX, 'utf8');
if (sha() !== REQUIRED) { console.log('BASELINE MISMATCH'); process.exit(2); }

const FIND = '          if (COMPLETION_WORD.test(q)) return null;';
// Narrow the belt from "mentions completion vocabulary" to "ASSERTS a completion".
// A completion participle is only an assertion when a SUBJECT precedes it. A question
// that merely REFERS to an archived/deleted/assigned thing ("Which archived company did
// you mean?", "Who should the task be assigned to?") is a clarification, not a claim.
const REPL = [
  '          const COMPLETION_ASSERTION_IN_QUESTION = new RegExp(',
  "            '\\\\b(?:i|we|it|they|this|that|the\\\\s+\\\\w+)\\\\s+(?:just\\\\s+|already\\\\s+|now\\\\s+|successfully\\\\s+)?(?:'",
  "            + 'archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned'",
  "            + '|approved|rejected|removed|completed|ended|moved|added|granted|confirmed|renamed'",
  "            + '|declined|closed|cleared|sent) '",
  "            + '|^(?:archived|deleted|updated|created|restored|assigned|reassigned|approved|rejected'",
  "            + '|removed|completed|ended|moved|added|granted|confirmed|renamed|declined|cleared|sent)\\\\b', 'i');",
  '          if (COMPLETION_ASSERTION_IN_QUESTION.test(q)) return null;',
].join('\r\n');

if (ORIG.split(FIND).length - 1 !== 1) { console.log('anchor not unique'); process.exit(2); }
writeFileSync(INDEX, ORIG.replace(FIND, REPL));

const bat = spawnSync(process.execPath, ['qa/verification/scratch/v12_battery_exec.mjs'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DEPLOY_GATE: '1' } });
let res; try { res = JSON.parse(bat.stdout.trim().split('\n').pop()); } catch { res = { error: true, raw: bat.stdout + bat.stderr }; }

const probe = spawnSync(process.execPath, ['qa/verification/scratch/v12_corpus.mjs'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

writeFileSync(INDEX, ORIG);
if (sha() !== REQUIRED) { console.log('RESTORE FAILED — ABORT'); process.exit(3); }

console.log('BATTERY under candidate fix: all_exit_zero=' + (res.error ? 'RUNNER ERROR' : res.all_exit_zero));
if (!res.error && !res.all_exit_zero) console.log('  failing suites: ' + res.results.filter((r) => r.exit !== 0).map((r) => r.suite).join(', '));
console.log(probe.stdout + probe.stderr);
console.log('restored sha256 ' + sha() + '  identical=' + (sha() === REQUIRED));
