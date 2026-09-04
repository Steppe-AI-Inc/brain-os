// VERIFIER #18 / SCENARIO 1 — the FULL battery, enumerated from the FILESYSTEM (not from
// any list the implementing session supplied). Every *.mjs under qa/scenarios-runner is
// executed. Per suite: process exit code AND the failure count parsed from OUTPUT TEXT
// (the campaign rule: classify from output text, never from an exit code). Suites that
// print no OK/FAIL lines and make no assertion are flagged as STUBS.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const DIR = resolve('qa/scenarios-runner');
const mjs = readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();
const sql = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const other = readdirSync(DIR).filter((f) => !f.endsWith('.mjs') && !f.endsWith('.sql')).sort();

let totalOK = 0, totalFAIL = 0, suitesWithFailures = 0, stubs = 0, assertionBearing = 0;
const rows = [];
for (const f of mjs) {
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [resolve(DIR, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : 99;
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  const okLines = (out.match(/^OK\b/gm) || []).length;
  const failLines = (out.match(/^FAIL\b/gm) || []).length;
  // summary lines like "N passed, M failed" / "N pass, M fail"
  const m = out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/i);
  const sumPass = m ? Number(m[1]) : null, sumFail = m ? Number(m[2]) : null;
  // Classification, deliberately NOT "no OK/FAIL lines => stub": several suites assert in
  // their own output format ("ALL REGRESSIONS PASSED", "10/10 agree with the fixed
  // contract"). Only a self-labelled SUPERSEDED one-liner, or the shared library, is a
  // non-asserting file. Getting this wrong is how a battery count drifts.
  const isLibrary = f === '_gate_extract.mjs';
  const otherFormatAssertion = /ALL REGRESSIONS PASSED/.test(out) || /\d+\/\d+ agree/.test(out);
  const isStub = !isLibrary && okLines + failLines === 0 && !m && !otherFormatAssertion;
  if (isLibrary) { /* neither */ } else if (isStub) stubs++; else assertionBearing++;
  const textFailures = Math.max(failLines, sumFail === null ? 0 : sumFail);
  totalOK += Math.max(okLines, sumPass === null ? 0 : sumPass);
  totalFAIL += textFailures;
  if (textFailures > 0) suitesWithFailures++;
  rows.push({ f, code, okLines, failLines, sumPass, sumFail, isStub, textFailures, tail: out.trim().split('\n').slice(-2).join(' | ').slice(0, 160) });
}

console.log('=== SCENARIO 1 : FULL BATTERY (filesystem-enumerated) ===');
console.log(`.mjs suites: ${mjs.length}   .sql suites: ${sql.length} (NOT RUN — npx supabase db query is permission-gated in this process)   other files: ${other.length} (${other.join(', ')})\n`);
console.log('suite'.padEnd(58) + 'exit'.padStart(5) + 'OK'.padStart(6) + 'FAILtext'.padStart(10) + '  stub');
for (const r of rows) {
  console.log(r.f.padEnd(58) + String(r.code).padStart(5) + String(Math.max(r.okLines, r.sumPass || 0)).padStart(6)
    + String(r.textFailures).padStart(10) + (r.isStub ? '   STUB' : ''));
}
console.log(`\nBATTERY TOTAL (from OUTPUT TEXT): ${totalOK} assertions passed, ${totalFAIL} failed across ${mjs.length} suites`);
console.log(`classification: 1 library (_gate_extract.mjs) + ${stubs} self-labelled SUPERSEDED stubs + ${assertionBearing} assertion-bearing = ${mjs.length} .mjs files`);
console.log(`suites with >=1 text failure: ${suitesWithFailures}`);
console.log(`suites with nonzero exit: ${rows.filter((r) => r.code !== 0).length}`);
for (const r of rows) if (r.code !== 0 || r.textFailures > 0 || r.isStub) console.log(`  ! ${r.f} exit=${r.code} textFail=${r.textFailures} stub=${r.isStub} :: ${r.tail}`);
console.log('\nNOTE: the *.sql suites were NOT run. They require a live production database and');
console.log('`npx supabase db query --linked` is permission-gated in this process. Listed for the record:');
for (const s of sql) console.log('  (not run) ' + s);
