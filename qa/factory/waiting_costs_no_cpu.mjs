#!/usr/bin/env node
// WAITING_COSTS_NO_CPU — a process that is waiting must not be working.
//
// THE DEFECT. A verifier that has dispatched and is waiting for its report, or a director between ticks,
// is doing nothing. If it waits by spinning, it pegs a core for the entire wait: on this machine that is
// hours of a core for a run whose actual work is measured in seconds, it heats the box the campaign runs on,
// and it makes every OTHER measurement in this campaign slower and noisier — including the timing evidence
// the gates record.
//
// A spin-wait is invisible in every way the campaign normally looks at a process. It has a healthy pid, it
// holds its lease, its log is quiet, and it exits with the right code. The only thing that distinguishes it
// from a polite wait is CPU TIME, so CPU time is what this measures.
//
// THE INVARIANT: over any wait, CPU time consumed must be a small fraction of wall time. The threshold is
// generous (10%) because a polite wait still costs a timer, a wake-up and a syscall — the failure being
// caught here is 100%, not 3%.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, '../../scripts/factory-runner');

let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? NL + '       ' + detail : '')); }
};

// Run one child that waits for WAIT_MS the given way, and have it report its OWN cpu usage — the only
// portable way to ask, and the number the operating system actually charged it.
const WAIT_MS = 700;
function measure(body) {
  const src = [
    'const started = process.hrtime.bigint();',
    'const cpu0 = process.cpuUsage();',
    body,
    'const wallMs = Number(process.hrtime.bigint() - started) / 1e6;',
    'const c = process.cpuUsage(cpu0);',
    'console.log(JSON.stringify({ wallMs, cpuMs: (c.user + c.system) / 1000 }));',
  ].join(NL);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', src],
    { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(out.trim().split(NL).pop());
}

// THE POLITE WAIT — the shape the director actually uses between ticks.
const polite = measure('await new Promise((r) => setTimeout(r, ' + WAIT_MS + '));');
const politeRatio = polite.cpuMs / polite.wallMs;

// THE SPIN — the defect, reproduced. Same wall time, same exit code, same silence in the log.
const spin = measure([
  'const until = Date.now() + ' + WAIT_MS + ';',
  'while (Date.now() < until) { /* the defect: waiting by working */ }',
].join(NL));
const spinRatio = spin.cpuMs / spin.wallMs;

check('W1 a POLITE wait costs almost no CPU: ' + polite.cpuMs.toFixed(0) + ' ms of CPU over '
  + polite.wallMs.toFixed(0) + ' ms of wall time (' + (politeRatio * 100).toFixed(1) + '%)',
  polite.wallMs >= WAIT_MS * 0.8 && politeRatio < 0.10,
  'it must actually have waited AND stayed idle — a ratio under 10% with no wait proves nothing');

check('W2 NEGATIVE CONTROL: the spin-wait is caught — ' + spin.cpuMs.toFixed(0) + ' ms of CPU over '
  + spin.wallMs.toFixed(0) + ' ms of wall time (' + (spinRatio * 100).toFixed(1) + '%)',
  spinRatio > 0.50,
  'if this row is green the measurement can see the defect, and W1 means something');

check('W3 the two are separated by an order of magnitude, so the threshold is not a coin toss',
  spinRatio / Math.max(politeRatio, 0.0001) > 10,
  'polite ' + (politeRatio * 100).toFixed(1) + '% vs spin ' + (spinRatio * 100).toFixed(1) + '%');

// ── AND THE WAITS IN THIS REPOSITORY ARE THE POLITE KIND ─────────────────────────────────────────────
//
// A measurement of a fixture proves the RULE. This row asks whether the rule holds where it matters. A spin
// is a loop whose body does not yield — no await, no callback, just a clock being read until it moves.
const SPIN_SHAPES = [
  /while\s*\([^)]*Date\.now\(\)[^)]*\)\s*\{?\s*(?:\/[/*][^\n]*)?\s*\}/,
  /while\s*\(\s*true\s*\)\s*\{\s*\}/,
  /for\s*\(\s*;\s*;\s*\)\s*\{\s*\}/,
];
const offenders = [];
for (const f of readdirSync(RUNNER).filter((n) => n.endsWith('.mjs'))) {
  const text = readFileSync(join(RUNNER, f), 'utf8');
  const code = text.split(NL).filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join(NL);
  for (const re of SPIN_SHAPES) if (re.test(code)) offenders.push(f + ' :: ' + re.source.slice(0, 40));
}
check('W4 no factory-runner script waits by spinning — every wait in this repository yields',
  offenders.length === 0, offenders.join(' | '));

// COMMENTS_ARE_NOT_STATE, applied here: a file that only DISCUSSES spinning must not be an offender, or the
// scan would report a defect against the very prose warning about it.
const commentOnly = ['// while (Date.now() < until) { }  <- the defect this file exists to prevent',
  'await new Promise((r) => setTimeout(r, 1000));'].join(NL);
const commentStripped = commentOnly.split(NL).filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join(NL);
check('W5 the scan reads CODE, not prose: a spin shown inside a comment is not an offender',
  SPIN_SHAPES.some((re) => re.test(commentOnly)) && !SPIN_SHAPES.some((re) => re.test(commentStripped)),
  'the raw text matches a spin shape and the code does not — the same rule that made a rename probe'
  + ' report a CLOSED defect as forgiven');

console.log('');
console.log('waiting_costs_no_cpu: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('');
console.log('A waiting verifier must not peg a core. A spin-wait has a healthy pid, a held lease, a quiet');
console.log('log and the right exit code — CPU time is the only thing that tells it apart from a real wait.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
