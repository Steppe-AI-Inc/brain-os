// VERIFIER #41 — run EVERY .mjs suite under qa/scenarios-runner from the filesystem.
// Verdict is read from OUTPUT TEXT ("N passed, M failed"), never from an exit code, and
// the exit code is reported SEPARATELY so a disagreement is visible.
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const DIR = path.join(REPO, 'qa/scenarios-runner');
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();

const rows = [];
let totPass = 0, totFail = 0, asserting = 0, nonAsserting = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', cwd: REPO, timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+passed,\s*(\d+)\s+failed/)
    || out.match(/(\d+)\s+pass,\s*(\d+)\s+fail\b/)
    || out.match(/(\d+)\/(\d+)\s+passed/) && (() => { const x = out.match(/(\d+)\/(\d+)\s+passed/); return [x[0], x[1], String(+x[2] - +x[1])]; })()
    || out.match(/(\d+)\/(\d+)\s+(?:match|agree|contract checks passed)/) && (() => { const x = out.match(/(\d+)\/(\d+)\s+(?:match|agree|contract checks passed)/); return [x[0], x[1], String(+x[2] - +x[1])]; })()
    || (/ALL REGRESSIONS PASSED/.test(out) ? [null, String((out.match(/^PASS\b/gm) || []).length), '0'] : null);
  const okCount = (out.match(/^ok\b|^OK\b|^ok\s|^PASS\b/gm) || []).length;
  const p = m ? +m[1] : null, fl = m ? +m[2] : null;
  const superseded = /SUPERSEDED|superseded/.test(out);
  if (m) { totPass += p; totFail += fl; if (p + fl > 0) asserting++; else nonAsserting.push(f + ' (0 assertions)'); }
  else nonAsserting.push(f + ' (no "N passed, M failed" line)');
  rows.push({ file: f, passed: p, failed: fl, exit: r.status, superseded, okLines: okCount, tail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 200) });
}
for (const r of rows) {
  console.log(`${String(r.passed).padStart(4)}/${String(r.failed).padStart(3)}  exit=${String(r.exit).padEnd(4)} ${r.superseded ? 'SUPERSEDED ' : '           '}${r.file}`);
  if (r.passed === null || r.failed === null || r.failed > 0) console.log(`        TAIL: ${r.tail}`);
}
console.log(`\nSUITES: ${files.length} files, ${asserting} produced a pass/fail line with >0 assertions`);
console.log(`TOTAL:  ${totPass} passed, ${totFail} failed`);
console.log(`NON-ASSERTING / UNPARSED (${nonAsserting.length}):`);
for (const n of nonAsserting) console.log('   - ' + n);
const exitDisagree = rows.filter((r) => (r.failed !== null) && ((r.failed > 0 && r.exit === 0) || (r.failed === 0 && r.exit !== 0)));
console.log(`EXIT-CODE vs TEXT DISAGREEMENTS (${exitDisagree.length}):`);
for (const r of exitDisagree) console.log(`   - ${r.file}: text=${r.passed}/${r.failed} exit=${r.exit}`);
writeFileSync(path.join(HERE, 'battery.json'), JSON.stringify(rows, null, 1));
