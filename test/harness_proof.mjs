// THE PROOFS' OWN HARNESS, PROVED: how a mutation proof judges a mutant (test/classify.mjs), and that every script the relay
// ships or tests with parses.
//   node test/harness_proof.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classify, judge, mutationProof, parses } from './classify.mjs';
import { reporter } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const t = reporter('artifact relay harness proof');
const shape = { rowId: 'E\\d+', summary: /^the proof: \d+\/\d+ OK/m };
const ok = (...ids) => ids.map((i) => `OK   ${i} a row`).join('\n') + '\n';
const run = (out, more = {}) => ({ out, err: '', status: 1, timedOut: false, ...more });

// ------------------------------------------------------------------------------------------------- the verdicts, one by one
{
  const v = (r) => classify({ ...r, ...shape });
  const cases = [
    ['a red row, and the run reaches its summary', run(ok('E01') + 'FAIL E02 a row\n\nthe proof: 1/2 OK; FAILED: E02\n'), 'KILLED', /^by E02$/],
    ['a red row, and the run then stops', run(ok('E01') + 'FAIL E02 a row\nFAIL the run crashed - TypeError: x\n'), 'KILLED', /^by E02 \(the run then stopped: TypeError: x\)$/],
    ['every row OK and a summary', run(ok('E01', 'E02') + '\nthe proof: 2/2 OK\n', { status: 0 }), 'SURVIVED', /every row stayed OK/],
    ['rows judged, then the proof\'s own last words', run(ok('E01', 'E02') + 'FAIL the run crashed - Error: the guard refused\n'), 'KILLED', /^by a hard stop after E02: Error: the guard refused$/],
    ['rows judged, then an error nothing caught', run(ok('E01'), { err: 'file:///x.mjs:3\n  boom\nTypeError: cannot read\n    at x\n' }), 'KILLED', /^by a hard stop after E01: TypeError: cannot read$/],
    ['a stop before any row was judged', run('FAIL the run crashed - SyntaxError: bad token\n'), 'BROKEN', /before any row was judged/],
    ['an error nothing caught, before any row', run('', { err: 'SyntaxError: Unexpected token\n' }), 'BROKEN', /before any row was judged/],
    ['no summary, no red row, no stop message', run(ok('E01')), 'AMBIGUOUS', /no summary, no red row and no stop message/],
    ['nothing at all', run(''), 'AMBIGUOUS', /no summary/],
    ['a run that did not end in time', run(ok('E01'), { timedOut: true }), 'AMBIGUOUS', /did not end in time/],
    ['a summary with no row before it', run('\nthe proof: 0/0 OK\n', { status: 0 }), 'AMBIGUOUS', /no row before it/],
    ['a row of another proof is not this proof\'s row', run('OK   S01 a row\nFAIL S02 a row\n'), 'AMBIGUOUS', /no summary/],
  ];
  const wrong = cases.filter(([, r, verdict, reason]) => { const got = v(r); return got.verdict !== verdict || !reason.test(got.reason); }).map(([what, r]) => what + ' -> ' + JSON.stringify(v(r)));
  t.row(`H01 a run means exactly one of KILLED, SURVIVED, BROKEN or AMBIGUOUS, and says why (${cases.length} kinds of run)`, wrong.length === 0, wrong.join(' | '));
}

// ------------------------------------------------------------------------------- a hard stop counts only when it happens again
{
  const stop = (msg) => run(ok('E01', 'E02') + 'FAIL the run crashed - ' + msg + '\n');
  const twice = (a, b) => { const runs = [a, b]; let n = 0; return judge(() => runs[Math.min(n++, 1)], shape); };
  const same = twice(stop('Error: the guard refused'), stop('Error: the guard refused'));
  const sameButForIds = twice(stop('Error: no file C:\\Temp\\relay-e2e-Ab12\\x for artifact 0b9f7f7e3c1a4c1e port 51234'), stop('Error: no file C:\\Temp\\relay-e2e-Zz98\\x for artifact 99aa77bb55cc33dd port 40001'));
  const thenPasses = twice(stop('Error: the guard refused'), run(ok('E01', 'E02') + '\nthe proof: 2/2 OK\n', { status: 0 }));
  const thenAnother = twice(stop('Error: the guard refused'), stop('Error: the address is in use'));
  const thenRed = twice(stop('Error: the guard refused'), run(ok('E01') + 'FAIL E02 a row\n\nthe proof: 1/2 OK\n'));
  let calls = 0;
  const byRow = judge(() => { calls++; return run(ok('E01') + 'FAIL E02 a row\n\nthe proof: 1/2 OK\n'); }, shape);
  t.row('H02 a hard stop is the mutant\'s doing only if a second run stops the same way: then it is KILLED, with the stop as its reason; a stop that does not repeat is AMBIGUOUS; a red row needs no second run',
    same.verdict === 'KILLED' && /the same stop on a second run/.test(same.reason) && /the guard refused/.test(same.reason) && sameButForIds.verdict === 'KILLED'
    && [thenPasses, thenAnother, thenRed].every((x) => x.verdict === 'AMBIGUOUS' && /did not repeat/.test(x.reason)) && byRow.verdict === 'KILLED' && calls === 1,
    [same, sameButForIds, thenPasses, thenAnother, thenRed].map((x) => x.verdict).join(' '));
}

// --------------------------------------------------- a whole proof: no mutant and no failure of the runner ends it early
{
  const tmp = mkdtempSync(join(tmpdir(), 'relay-harness-'));
  const lines = [];
  const log = console.log;
  let code = null, accepted = [];
  try {
    const good = join(tmp, 'good.mjs'), bad = join(tmp, 'bad.mjs');
    writeFileSync(good, 'export const x = 1;\n'); writeFileSync(bad, 'export const x = ;\n');
    console.log = (l) => lines.push(String(l));
    code = mutationProof({
      name: 'a proof', only: [],
      mutants: [['T1', 'a rule removed'], ['T2', 'a rule the proof does not hold'], ['T3', 'a mutant that does not parse'], ['T4', 'a mutant that cannot be applied'], ['T5', 'a mutant the runner trips over'],
        ['T6', 'a mutant that stops the run hard, twice the same way'], ['T7', 'a mutant after all of those']],
      mutate: ([id]) => (id === 'T4' ? { verdict: 'NOT APPLIED', reason: 'expected exactly one "x"' } : { file: id === 'T3' ? bad : good, env: { ID: id } }),
      accept: (env) => {
        accepted.push(env.ID ?? 'control');
        if (env.ID === 'T5') throw new Error('the acceptance could not be started');
        if (env.ID === 'T1' || env.ID === 'T7') return run(ok('E01') + 'FAIL E02 a row\n\nthe proof: 1/2 OK\n');
        if (env.ID === 'T6') return run(ok('E01') + 'FAIL the run crashed - Error: the guard refused\n');
        return run(ok('E01', 'E02') + '\nthe proof: 2/2 OK\n', { status: 0 });
      },
      shape,
    });
  } finally { console.log = log; rmSync(tmp, { recursive: true, force: true }); }
  const text = lines.join('\n');
  t.row('H03 a proof gives every mutant its verdict and reason by id, goes on after a mutant that is broken, cannot be applied, or trips the runner, and fails by name when anything but KILLED is among them',
    code === 1 && /^OK   control: the unmutated code passes$/m.test(text) && /^OK   T1 killed - a rule removed - by E02$/m.test(text) && /^FAIL T2 SURVIVED - /m.test(text)
    && /^FAIL T3 BROKEN - a mutant that does not parse - the mutated code does not parse: /m.test(text) && /^FAIL T4 NOT APPLIED - /m.test(text)
    && /^FAIL T5 AMBIGUOUS - a mutant the runner trips over - the runner itself failed on this mutant: the acceptance could not be started$/m.test(text)
    && /^OK   T6 killed - .* - by a hard stop after E01: Error: the guard refused \(the same stop on a second run\)$/m.test(text) && /^OK   T7 killed - /m.test(text)
    && /^a proof: 3\/7 killed; NOT KILLED: survived 1, broken 1, ambiguous 1, not applied 1$/m.test(text) && accepted.join() === 'control,T1,T2,T5,T6,T6,T7', text.split('\n').at(-1) + ' | ' + accepted.join());
  const lines2 = [];
  let code2 = null;
  try {
    console.log = (l) => lines2.push(String(l));
    code2 = mutationProof({ name: 'a proof', only: [], mutants: [['T1', 'a rule removed']], mutate: () => ({ file: fileURLToPath(import.meta.url), env: { ID: 'T1' } }),
      accept: (env) => (env.ID ? run(ok('E01') + 'FAIL E02 a row\n\nthe proof: 1/2 OK\n') : run(ok('E01') + 'FAIL E02 a row\n\nthe proof: 1/2 OK\n')), shape });
  } finally { console.log = log; }
  t.row('H04 a proof whose control does not pass fails, whatever its mutants do', code2 === 1 && /^FAIL control: /m.test(lines2.join('\n')) && /and the control did not pass$/m.test(lines2.join('\n')), lines2.join(' | '));
}

// ------------------------------------------------------------------------------------------------------ every script parses
{
  const walk = (rel) => readdirSync(join(ROOT, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(rel + '/' + e.name) : [rel + '/' + e.name]));
  const scripts = ['relay', 'test', 'tools'].flatMap(walk).filter((f) => /\.(mjs|cjs)$/.test(f)).sort();
  const broken = scripts.map((f) => [f, parses(join(ROOT, f))]).filter(([, why]) => why);
  t.row(`H10 every script of the relay, its installer and its proofs parses (${scripts.length} files)`, scripts.length >= 20 && scripts.includes('relay/install.mjs') && scripts.includes('relay/relay.mjs') && broken.length === 0, broken.map(([f, why]) => f + ': ' + why).join(' | '));
  t.row('H11 a file that does not parse is seen as such', parses(join(ROOT, 'README.md')) !== null && parses(fileURLToPath(import.meta.url)) === null, String(parses(join(ROOT, 'README.md'))).slice(0, 60));

  const fn = 'supabase/functions/factory-artifact-relay/';
  const tmp = mkdtempSync(join(tmpdir(), 'relay-parse-'));
  let loaded = '';
  try {
    const { renderRegistry } = await import(pathToFileURL(join(ROOT, 'relay', 'install.mjs')).href);
    const nodes = [{ node_id: 'node-aaaa-work', relay_role: 'sender', public_key: 'A'.repeat(43) }, { node_id: 'node-bbbb-home', relay_role: 'verifier', public_key: 'B'.repeat(43) }];
    writeFileSync(join(tmp, 'registry.ts'), renderRegistry(nodes));
    const generated = await import(pathToFileURL(join(tmp, 'registry.ts')).href);
    const committed = await import(pathToFileURL(join(ROOT, fn + 'registry.ts')).href);
    const refuses = [[{ ...nodes[0], node_id: 'a"b' }, nodes[1]], [{ ...nodes[0], public_key: 'short' }, nodes[1]], [{ ...nodes[0], relay_role: 'admin' }, nodes[1]], [nodes[0], { ...nodes[1], relay_role: 'sender' }], [nodes[0], { ...nodes[1], node_id: nodes[0].node_id }]]
      .every((bad) => { try { renderRegistry(bad); return false; } catch { return true; } });
    loaded = `${parses(join(ROOT, fn + 'relay.ts'))} ${parses(join(ROOT, fn + 'registry.ts'))} ${generated.REGISTRY.length} ${committed.REGISTRY.length} ${refuses}`;
    t.row('H12 the function\'s code loads; the registry the installer writes for two registrations is code that loads and holds exactly those two; the committed registry holds none; a registration that is not well formed is never written into code',
      parses(join(ROOT, fn + 'relay.ts')) === null && parses(join(ROOT, fn + 'registry.ts')) === null && JSON.stringify(generated.REGISTRY) === JSON.stringify(nodes) && committed.REGISTRY.length === 0
      && renderRegistry(nodes) === renderRegistry(nodes) && refuses, loaded);
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  if (process.platform === 'win32') {
    const script = join(ROOT, 'relay', 'install.ps1').replace(/'/g, "''");
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `$e = $null; $a = [System.Management.Automation.Language.Parser]::ParseFile('${script}', [ref]$null, [ref]$e); 'errors=' + @($e).Count; 'params=' + (($a.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath }) -join ',')`], { encoding: 'utf8', timeout: 120000 });
    const out = (r.stdout ?? '').replace(/\r/g, '');
    t.row('H13 relay/install.ps1 parses with no error, and takes exactly the five options the installer knows',
      /^errors=0$/m.test(out) && /^params=Plan,Uninstall,WithoutDirectorRecord,LeaveBucket,VerifierRegistration$/m.test(out), out.trim().replace(/\n/g, ' ') + (r.stderr ?? '').slice(0, 120));
  } else {
    console.log('NOT RUN: H13 (relay/install.ps1 is parsed on Windows)');
  }

  const sql = readdirSync(join(ROOT, 'sql')).filter((f) => f.endsWith('.sql')).sort();
  const users = ['test/sql_acceptance.mjs', 'test/e2e.mjs', 'test/boundary_proof.mjs', 'relay/install.mjs'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  const unused = sql.filter((f) => !users.includes('sql/' + f));
  t.row(`H14 every SQL file is run by a proof, directly or through the installer (${sql.length} files)`, sql.length === 9 && unused.length === 0, unused.join(' '));
}

process.exit(t.done());
