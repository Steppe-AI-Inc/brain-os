// HOW A MUTATION PROOF JUDGES ONE MUTANT. Shared by the five mutation proofs, so that they judge alike.
//
// A mutant is run against an acceptance proof. What that run leaves behind means exactly one of:
//   KILLED     a row went red; or the mutant stopped the run hard AFTER rows had been judged, and stops it the same way again
//   SURVIVED   the run reached its summary with every row OK
//   BROKEN     the mutated code does not parse, or stopped before any row was judged: that is not a judgement
//   AMBIGUOUS  it cannot be told: the run did not end in time, left neither a summary nor a red row nor a stop message, or
//              stopped hard once and not the same way twice
// Only KILLED counts. Every other verdict fails the proof by name, with its reason, and the proof goes on to the next mutant:
// no mutant, and no failure of the runner itself, ends a proof before every mutant has its verdict.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * out, err   what the acceptance printed          status     its exit status          timedOut   the runner stopped it
 * rowId      the source of a RegExp for the ids of that proof's rows        summary    a RegExp for its summary line
 */
export function classify({ out = '', err = '', status = null, timedOut = false, rowId, summary }) {
  const ok = [...out.matchAll(new RegExp('^OK   (' + rowId + ')(?= |$)', 'gm'))].map((m) => m[1]);
  const red = [...out.matchAll(new RegExp('^FAIL (' + rowId + ')(?= |$)', 'gm'))].map((m) => m[1]);
  const summed = summary.test(out);
  // a hard stop: the proof's own last words, or an error nothing caught
  const stop = /^FAIL the (?:run|suite) crashed - (.*)$/m.exec(out)?.[1] ?? /^((?:[A-Za-z]*Error|AssertionError)(?: \[[A-Z_]+\])?: .*)$/m.exec(err)?.[1] ?? null;
  if (timedOut) return { verdict: 'AMBIGUOUS', reason: 'the run did not end in time' };
  if (red.length) return { verdict: 'KILLED', reason: 'by ' + red.join(' ') + (summed ? '' : ' (the run then stopped' + (stop ? ': ' + stop.slice(0, 120) : '') + ')') };
  if (summed) return ok.length ? { verdict: 'SURVIVED', reason: 'every row stayed OK' } : { verdict: 'AMBIGUOUS', reason: 'a summary line with no row before it' };
  if (stop && ok.length) return { verdict: 'KILLED', hardStop: true, stop, reason: 'by a hard stop after ' + ok.at(-1) + ': ' + stop.slice(0, 200) };
  if (stop) return { verdict: 'BROKEN', reason: 'it stopped before any row was judged: ' + stop.slice(0, 200) };
  return { verdict: 'AMBIGUOUS', reason: 'the run left no summary, no red row and no stop message (exit ' + status + ')' };
}

/** what a stop message says, without what changes from run to run (ids, numbers, paths) */
const steady = (s) => String(s).replace(/[A-Za-z]:\\[^\s'"]+|\/[^\s'"]*\/[^\s'"]+/g, '<path>').replace(/[0-9a-f]{8,}/gi, '#').replace(/\d+/g, '#');

/**
 * Runs a mutant and returns its verdict. A hard stop is the mutant's doing only if it happens again, the same way: `run` is
 * called a second time, and a stop that does not repeat is AMBIGUOUS, never KILLED.
 */
export function judge(run, shape) {
  const first = classify({ ...run(), ...shape });
  if (!first.hardStop) return first;
  const second = classify({ ...run(), ...shape });
  if (second.hardStop && steady(second.stop) === steady(first.stop)) return { verdict: 'KILLED', reason: first.reason + ' (the same stop on a second run)' };
  return { verdict: 'AMBIGUOUS', reason: 'a hard stop that a second run did not repeat: first ' + first.reason + '; then ' + second.verdict + ' ' + second.reason };
}

/** null when the file parses and loads; otherwise the first line that says why not */
export function parses(file) {
  const r = file.endsWith('.ts')
    ? spawnSync(process.execPath, ['--input-type=module', '-e', 'await import(process.argv[1])', pathToFileURL(file).href], { encoding: 'utf8', timeout: 120000 })
    : spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 120000 });
  if (r.status === 0) return null;
  return ((r.stderr ?? '').split('\n').find((l) => /Error/.test(l)) ?? 'it does not load (exit ' + r.status + ')').trim();
}

/** replaces each `find` by its `replace`; null when a `find` is not there exactly once */
export function applySwaps(text, swaps) {
  for (let i = 0; i < swaps.length; i += 2) {
    if (text.split(swaps[i]).length !== 2) return { text: null, missing: swaps[i] };
    text = text.replace(swaps[i], () => swaps[i + 1]);
  }
  return { text, missing: null };
}

/**
 * The whole of a mutation proof that runs an acceptance proof in a process of its own.
 *   name       the proof's name in its summary line          only       ids given on the command line (all when empty)
 *   mutants    [[id, what, ...], ...]                        mutate     (mutant) => { verdict, reason } | { file, env }
 *   describe   (mutant) => [id, what], where a proof keeps them elsewhere in its tuples
 *   accept     (env) => { out, err, status, timedOut }       shape      { rowId, summary } of the acceptance proof
 * `mutate` either returns a verdict (NOT APPLIED) or the mutated file to check and the environment that points the acceptance
 * at it. Returns the exit code.
 */
export function mutationProof({ name, only, mutants, mutate, accept, shape, describe = ([id, what]) => [id, what] }) {
  const tally = { KILLED: 0, SURVIVED: 0, BROKEN: 0, AMBIGUOUS: 0, 'NOT APPLIED': 0 };
  let control;
  try { control = classify({ ...accept({}), ...shape }); } catch (e) { control = { verdict: 'AMBIGUOUS', reason: 'the runner itself failed: ' + e.message }; }
  const controlOk = control.verdict === 'SURVIVED';
  console.log((controlOk ? 'OK   ' : 'FAIL ') + 'control: the unmutated code passes' + (controlOk ? '' : ' - ' + control.verdict + ' ' + control.reason));
  let judged = 0;
  for (const mutant of mutants) {
    const [id, what] = describe(mutant);
    if (only.length && !only.includes(id)) continue;
    judged++;
    let v;
    try {
      const m = mutate(mutant);
      if (m.verdict) v = m;
      else {
        const why = parses(m.file);
        v = why ? { verdict: 'BROKEN', reason: 'the mutated code does not parse: ' + why.slice(0, 160) } : judge(() => accept(m.env), shape);
      }
    } catch (e) {
      v = { verdict: 'AMBIGUOUS', reason: 'the runner itself failed on this mutant: ' + (e?.message ?? e) };
    }
    tally[v.verdict]++;
    console.log(v.verdict === 'KILLED' ? `OK   ${id} killed - ${what} - ${v.reason}` : `FAIL ${id} ${v.verdict} - ${what} - ${v.reason}`);
  }
  const bad = judged - tally.KILLED + (controlOk ? 0 : 1);
  console.log(`\n${name}: ${tally.KILLED}/${judged} killed` + (bad ? `; NOT KILLED: survived ${tally.SURVIVED}, broken ${tally.BROKEN}, ambiguous ${tally.AMBIGUOUS}, not applied ${tally['NOT APPLIED']}` + (controlOk ? '' : ', and the control did not pass') : ''));
  return bad ? 1 : 0;
}

/** runs `node <script> <args>` and hands back what classify() needs */
export function runNode(script, args, env, timeout) {
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  return { out: r.stdout ?? '', err: r.stderr ?? '', status: r.status, timedOut: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM' };
}
