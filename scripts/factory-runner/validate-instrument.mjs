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
import { join, basename, dirname, resolve } from 'node:path';

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
  negativeControl = null, negativeControlDir = 'tmp', expectNonZeroExit = false,
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
  // RAN TO COMPLETION IS DERIVED FROM THE REPORT, NOT FROM THE EXIT CODE.
  //
  // This level read `real.code === 0 || expectNonZeroExit`, and against every RED-BY-DESIGN suite in the
  // battery it said INSTRUMENT NOT VALID: successor_open_defects, v90_open_defects, v89_open_defects and
  // model_intent_is_not_authority all exit non-zero BECAUSE THEY CARRY A REGISTERED OPEN ROW, which is the
  // state the whole campaign depends on them holding. So `INSTRUMENT VALID` was unobtainable for exactly the
  // instruments that matter, unless the caller remembered a flag — and that flag is a footgun in both
  // directions: forget it and a healthy instrument is called invalid; pass it and a CRASH greens this level.
  //
  // The question is whether the process REACHED ITS END, and that is observable without being told. A suite
  // that ran to completion printed its report; one that died mid-way printed part of it and no summary.
  // Level 5 below already derives the instrument's class from its output and measures it, so the same
  // evidence answers this one: a non-zero exit WITH a complete report is RED, and a non-zero exit WITHOUT
  // one is a crash. `expectNonZeroExit` is still honoured when a caller declares it; nothing depends on it.
  //
  // Same family as the two defects this file's own comments already record. A check whose subject ("it ran
  // to completion") is wider than its invariant (the exit code) reports the wrong thing about a healthy
  // instrument, and the cost here was that the validator could not validate an open-defect suite at all.
  const completionClass = klass && INSTRUMENT_CLASSES[klass] ? klass : deriveInstrumentClass(real.out, rowPattern);
  const completion = INSTRUMENT_CLASSES[completionClass].measure(real.out, rowPattern);
  const reachedTheEnd = completion.value !== null && completion.value > 0;
  const ranToEnd = !threw && (real.code === 0 || expectNonZeroExit || reachedTheEnd);
  add(4, 'EXECUTION: it ran to completion and reported', ranToEnd,
    // THE DETAIL IS THE FAILURE'S REASON, not a line printed either way. The first version of this message
    // said "no complete report was produced, so this is a CRASH" on the PASSING row too, which is the
    // smallest version of the same mistake the rest of this file is about: text that states something the
    // measurement did not find.
    ranToEnd ? '' : 'exit ' + real.code + (real.signal ? ' signal ' + real.signal : '')
      + ' and no complete report was produced, so this is a CRASH and not a registered red'
      + (completion.detail ? ' — ' + completion.detail : ''));

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
  //
  // WHERE THE COPY RUNS IS PART OF THE CONTROL. An instrument that resolves its repository from
  // `import.meta.url` — the release manifest does — throws "repo root not found" when it is copied to a
  // temp directory. It exits non-zero, level 6 goes green, and the control proved nothing except that a
  // file outside its repository cannot run. `negativeControlDir` puts the copy beside the original, where
  // the only thing different about it is the break that was introduced.
  if (negativeControl) {
    const beside = negativeControlDir === 'beside';
    const dir = beside ? dirname(resolve(file)) : mkdtempSync(join(tmpdir(), 'instr-'));
    const copy = beside
      ? join(dir, basename(file).replace(/\.mjs$/, '') + '.negative-control.mjs')
      : join(dir, basename(file));
    try {
      writeFileSync(copy, negativeControl(readFileSync(file, 'utf8')));
      const broken = run(copy, { cwd, env });
      add(6, 'NEGATIVE CONTROL: a deliberately broken input makes it FAIL',
        broken.code !== 0 || /\bFAIL\b/.test(broken.out),
        'exit ' + broken.code + ' — an instrument that passes on a broken input is not measuring its subject'
        + (beside ? '' : ' (run in a temp directory: check the break is why it failed, not the move)'));
      results.negativeControlOutput = broken.out;
    } finally {
      if (beside) rmSync(copy, { force: true });
      else rmSync(dir, { recursive: true, force: true });
    }
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
