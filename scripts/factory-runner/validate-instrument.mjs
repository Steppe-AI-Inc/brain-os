#!/usr/bin/env node
// SYNTAX VALID != INSTRUMENT VALID.
//
// THE DEFECT THIS CLOSES, and it was mine. I edited a release manifest, ran `node --check`, reported
// "syntax ok", and moved on. The file parsed perfectly and threw
// `ReferenceError: EXPECTED_FAILING_ROWS is not defined` the moment it RAN — because a range edit had
// removed the declaration. `--check` validates SYNTAX. It does not resolve references, it does not load the
// module, and it certainly does not run it.
//
// A QA instrument that cannot run is worse than a missing one: the gate it belongs to reports "application
// failure" and a reader reaches for the product.
//
// SIX LEVELS, and each is a different claim:
//
//   1 PARSE            the text is grammatical                      (this is all `node --check` proves)
//   2 MODULE LOAD      every import resolves
//   3 SYMBOL RESOLUTION  every name it evaluates exists             <- the one that bit me
//   4 EXECUTION        it runs to completion and reports
//   5 NON-VACUOUS      it asserted a plausible number of rows
//   6 NEGATIVE CONTROL a deliberately broken input makes it FAIL
//
// Level 6 is the one that separates an instrument from a formality. A suite that passes on a broken input
// is not measuring the thing its name claims — which is the whole lesson of this campaign.
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const NL = String.fromCharCode(10);

function run(file, { cwd, env, timeout = 900000 } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [file],
      { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || ''), signal: e.signal };
  }
}

// The evidence contract for each instrument class lives beside this file, because it is a DECLARATION
// about what each kind of instrument must report, not part of the running of one. See level 5 below.
import { INSTRUMENT_CLASSES, deriveInstrumentClass } from './instrument-classes.mjs';

/**
 * Validate one executable QA instrument.
 *
 * `negativeControl` receives the instrument's TEXT and returns a broken variant. The instrument is expected
 * to FAIL on it — a run that still passes means the instrument does not depend on the thing that was broken,
 * which is the definition of a vacuous check.
 */
export function validateInstrument(file, {
  cwd = undefined, env = {}, minRows = 1, rowPattern = null, klass = null,
  negativeControl = null, expectNonZeroExit = false,
} = {}) {
  const results = [];
  const add = (level, name, ok, detail) => results.push({ level, name, ok, detail });

  if (!existsSync(file)) {
    add(1, 'the instrument exists', false, file);
    return { ok: false, results };
  }

  // 1. PARSE — and named as the weak claim it is, so nobody quotes it as evidence again.
  const syntax = (() => {
    try { execFileSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 60000 }); return null; }
    catch (e) { return String((e.stderr || e.message) || '').slice(0, 300); }
  })();
  add(1, 'PARSE: the text is grammatical (this alone is NOT evidence the instrument works)',
    syntax === null, syntax || '');

  // 2-4. MODULE LOAD, SYMBOL RESOLUTION and EXECUTION are all observed by actually running it. A
  // ReferenceError surfaces here and nowhere earlier.
  const real = run(file, { cwd, env });
  // AN INSTRUMENT MAY QUOTE AN ERROR IT DELIBERATELY CAUSED. The regression for this very file validates a
  // fixture that throws a ReferenceError on purpose and prints it, so scanning the output for the WORD was
  // subject-wider-than-invariant one more time. The question is whether THIS process died, and a process
  // that reached a clean exit did not — so the signature only counts alongside a non-zero exit.
  const errorSignature = /\b(ReferenceError|TypeError|SyntaxError|ERR_MODULE_NOT_FOUND)\b/.test(real.out);
  const threw = errorSignature && real.code !== 0;
  add(2, 'MODULE LOAD + SYMBOL RESOLUTION: it evaluates without a missing reference',
    !threw, threw ? real.out.split(NL).slice(0, 4).join(' | ') : '');
  add(4, 'EXECUTION: it ran to completion and reported',
    !threw && (real.code === 0 || expectNonZeroExit),
    'exit ' + real.code + (real.signal ? ' signal ' + real.signal : ''));

  // 5. NON-VACUOUS — a suite that asserts nothing exits 0 just as happily as one that asserts everything.
  //
  // THE CHECK MUST HAVE THE SAME SUBJECT AS THE INSTRUMENT. Level 5 originally carried ONE textual pattern,
  // `N pass`, and applied it to everything. A release manifest reports `assertion rows executed 4175`, so
  // level 5 parsed ZERO rows from a run that had just executed four thousand of them and called a healthy
  // instrument invalid. That is QA_CHECK_SUBJECT_WIDER_THAN_INVARIANT inside the file whose job is to name
  // the family — the sixth instance this week, and the first one inside the fix for it.
  //
  // So an instrument DECLARES its class, or the class is DERIVED from what its own output claims. Each class
  // states the evidence contract it must satisfy: what it has to report, and what would make that report
  // vacuous. The validator then measures the subject the instrument actually claims to measure.
  const cls = klass && INSTRUMENT_CLASSES[klass] ? klass : deriveInstrumentClass(real.out, rowPattern);
  const contract = INSTRUMENT_CLASSES[cls];
  const measured = contract.measure(real.out, rowPattern);
  add(5, 'NON-VACUOUS [' + cls + ']: ' + contract.claim + ' (at least ' + minRows + ')',
    measured.value !== null && measured.value >= minRows && measured.ok,
    measured.detail + (klass ? '' : ' — class DERIVED from the output, not declared'));

  // 6. NEGATIVE CONTROL — the level that separates an instrument from a formality.
  if (negativeControl) {
    const dir = mkdtempSync(join(tmpdir(), 'instr-'));
    try {
      const copy = join(dir, basename(file));
      writeFileSync(copy, negativeControl(readFileSync(file, 'utf8')));
      const broken = run(copy, { cwd, env });
      add(6, 'NEGATIVE CONTROL: a deliberately broken input makes it FAIL',
        broken.code !== 0 || /\bFAIL\b/.test(broken.out),
        'exit ' + broken.code + ' — an instrument that passes on a broken input is not measuring its subject');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  } else {
    add(6, 'NEGATIVE CONTROL: none supplied, so level 6 is UNPROVEN for this instrument', true,
      'a caller that supplies none is accepting that this instrument has not been shown to be able to fail');
  }

  return { ok: results.every((r) => r.ok), results, output: real.out, exitCode: real.code };
}

// CLI: validate one file and print the six levels.
if (process.argv[1] && process.argv[1].endsWith('validate-instrument.mjs')) {
  const target = process.argv[2];
  if (!target) { console.log('usage: validate-instrument.mjs <file> [--expect-nonzero]'); process.exit(2); }
  const v = validateInstrument(target, { expectNonZeroExit: process.argv.includes('--expect-nonzero') });
  for (const r of v.results) {
    console.log((r.ok ? 'OK   ' : 'FAIL ') + '[' + r.level + '] ' + r.name + (r.detail ? NL + '       ' + r.detail : ''));
  }
  console.log('');
  console.log(v.ok ? 'INSTRUMENT VALID' : 'INSTRUMENT NOT VALID');
  process.exit(v.ok ? 0 : 1);
}
