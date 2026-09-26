#!/usr/bin/env node
// THE CERTIFIED acceptance_mutation_proof.mjs (at its 69df2f52 bytes), RUN BY LABEL IN BOUNDED CHUNKS (one heavy job at a time, each short).
// The unchanged proof refuses to run whole: at 69df2f52 ITSELF the anchors of N37x (two_machine_real.mjs) and N19 (node.mjs) are absent
// from the files they mutate - a baseline finding, reported. Every other mutant runs, by its label, exactly as the proof defines it.
//   node qa/implementation/auto-enrollment-v1/tools/run_acceptance_mutation_chunks.mjs <out dir> <chunk number> <chunk size>
//   node ... --list      the labels, in the proof's order
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PROOF = 'qa/factory/acceptance_mutation_proof.mjs';
const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
const STALE_AT_BASELINE = ['N37x', 'N19'];
const src = readFileSync(join(ROOT, PROOF), 'utf8');
const labels = [];
const mutantLines = src.split('\n').filter((l) => /^\s*\{ id: '[A-Za-z0-9]+', suite: [A-Z]+,/.test(l));
for (const l of mutantLines) {
  const id = /\{ id: '([A-Za-z0-9]+)'/.exec(l)[1];
  const label = (/ label: '([A-Za-z0-9]+)'/.exec(l) || [])[1];
  const key = label || id;                      // the proof picks a mutant by (label || id)
  if (!labels.includes(key)) labels.push(key);
}
const mutantCount = mutantLines.length;
const runnable = labels.filter((l) => !STALE_AT_BASELINE.includes(l));
if (process.argv.includes('--list')) { console.log(mutantCount + ' mutants, ' + labels.length + ' pick keys, ' + runnable.length + ' runnable: ' + runnable.join(' ')); process.exit(0); }
const [outArg, nArg, sizeArg] = process.argv.slice(2);
const OUT = resolve(outArg); mkdirSync(OUT, { recursive: true });
const n = Number(nArg), size = Number(sizeArg);
const pick = runnable.slice((n - 1) * size, n * size);
if (!pick.length) { console.log('chunk ' + n + ' is empty (' + runnable.length + ' runnable labels)'); process.exit(0); }
const head = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const same = spawnSync('git', ['-C', ROOT, 'diff', '--quiet', BASELINE, head, '--', PROOF], { encoding: 'utf8' }).status === 0;
const t0 = Date.now();
const r = spawnSync(process.execPath, [PROOF, ...pick], { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60000, maxBuffer: 1 << 28, windowsHide: true,
  env: { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: '' } });
const out = (r.stdout || '') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '');
const secs = Math.round((Date.now() - t0) / 1000);
const last = (out.match(/acceptance_mutation_proof: \d+ of \d+ mutants killed[^\n]*/) || ['(no summary line)'])[0];
const name = 'acceptance_mutation_proof chunk ' + n + ' (' + pick.join(' ') + ')';
writeFileSync(join(OUT, 'acceptance_mutation_proof.chunk-' + String(n).padStart(2, '0') + '.txt'), ['suite ' + name, 'command node ' + PROOF + ' ' + pick.join(' '), 'cwd ' + ROOT, 'commit ' + head,
  'suite file identical to ' + BASELINE + ': ' + (same ? 'yes' : 'NO'), 'environment disposable (local): FACTORY_RUNNER_PG_URL and FACTORY_RUNNER_ENV_FILE emptied',
  'started ' + new Date(t0).toISOString(), 'seconds ' + secs, 'exit ' + r.status + (r.error ? ' error ' + r.error.code : ''), 'summary ' + last, '', out].join('\n'));
console.log(name.slice(0, 120) + '  exit ' + r.status + '  ' + secs + 's  ' + last);
for (const l of out.split('\n').filter((x) => /^SURVIVED /.test(x))) console.log('  ' + l.slice(0, 200));
process.exit(r.status === 0 ? 0 : 1);
