// INDEPENDENT verification of the CONCURRENT session's proposed D105 matcher fix
// (qa/verification/proposed/v14_d105_matcher_fix.patch.md), which appeared in the working
// tree during this campaign. Its own validation is not evidence. Applied to the REAL source,
// measured against my probes AND the full battery, restored with a sha assertion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const TARGET = 'supabase/functions/sem-ai-command/index.ts';
const PRISTINE = 'qa/verification/scratch/v14_pristine_index.ts';
const REQUIRED = '10db58385071d8f07fcd96ed65929be6b15bbeda3d197f4dae92327acba70d2a';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const PT = fs.readFileSync(PRISTINE, 'utf8');
if (sha(TARGET) !== REQUIRED) throw new Error('sha mismatch at start');

const FROM = `  if (matches.length > 1) {\r
    const exact = options.filter((o) => usable(o) && o.label.trim().length > 0\r
      && command.trim().toLowerCase().includes(o.label.trim().toLowerCase()));\r
    if (exact.length === 1) return exact[0];\r
  }\r
  return null;`;
const TO = `  if (matches.length > 1) {\r
    const specificity = (o: PendingActionOption) => forMatching(o.label).length;\r
    const maxLen = Math.max(...matches.map(specificity));\r
    const longest = matches.filter((o) => specificity(o) === maxLen);\r
    if (longest.length === 1) return longest[0];\r
    const rawCommand = command.replace(/\\s+/g, ' ').trim().toLowerCase();\r
    const exact = longest.filter((o) => o.label.trim().length > 0\r
      && rawCommand.includes(o.label.replace(/\\s+/g, ' ').trim().toLowerCase()));\r
    if (exact.length === 1) return exact[0];\r
  }\r
  return null;`;
if (PT.split(FROM).length - 1 !== 1) throw new Error('anchor not unique — the patch does not apply cleanly to f1722f2');

try {
  fs.writeFileSync(TARGET, PT.replace(FROM, TO));
  console.log('===== my matcher A/B, WITH the concurrent session\'s fix =====');
  const r = spawnSync(process.execPath, ['qa/verification/scratch/v14_ab_matcher.mjs'], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(out.slice(out.indexOf('f1722f2 (CANDIDATE)')));

  console.log('===== ADVERSARIAL: can "longest wins" still mis-bind or guess? =====');
  const probe = `
import { build, ACME, ID2, ID3 } from './v14_lib.mjs';
const { matchFn } = build();
const O = (l, id) => ({ label: l, id, entityType: 'company', actionType: 'archive' });
const T = [
  ['multi-name sentence names BOTH entities', 'move the tasks from acme to acme holdings', [O('Acme', ACME), O('Acme Holdings', ID2)], 'AMBIGUOUS -> should be null'],
  ['reply names the SHORT one explicitly', 'smith', [O('Smith', ACME), O("Smith's Bakery", ID2)], 'should be Smith'],
  ['reply names the LONG one', 'smiths bakery', [O('Smith', ACME), O("Smith's Bakery", ID2)], "should be Smith's Bakery"],
  ['two identical labels', 'acme', [O('Acme', ACME), O('Acme', ID2)], 'should be null'],
  ['D102 apostrophe pair, plain typed', 'founders fund', [O('Founders Fund', ACME), O("Founders' Fund", ID2)], 'should be Founders Fund'],
  ['D102 apostrophe pair, apostrophe typed', "founders' fund", [O('Founders Fund', ACME), O("Founders' Fund", ID2)], "should be Founders' Fund"],
  ['longest is NOT what was named', 'archive acme, leave acme holdings alone', [O('Acme', ACME), O('Acme Holdings', ID2)], 'AMBIGUOUS -> should be null'],
  ['three-way apostrophe', 'obrien logistics', [O('OBrien', ACME), O("O'Brien Logistics", ID2), O('Zeta', ID3)], "should be O'Brien Logistics"],
  ['equal-length distinct labels both contained', 'alpha co and beta co', [O('Alpha Co', ACME), O('Beta Co', ID2)], 'AMBIGUOUS -> should be null'],
];
for (const [tag, cmd, opts, want] of T) {
  const r = matchFn(cmd, opts);
  console.log((r ? ('-> ' + JSON.stringify(r.label)).padEnd(28) : '-> null'.padEnd(28)) + ' | ' + want.padEnd(32) + ' | ' + tag);
}
`;
  fs.writeFileSync('qa/verification/scratch/_v14_tmp_probe.mjs', probe);
  const p2 = spawnSync(process.execPath, ['qa/verification/scratch/_v14_tmp_probe.mjs'], { encoding: 'utf8' });
  console.log((p2.stdout || '') + (p2.stderr || ''));

  console.log('===== COMMITTED BATTERY + v14 additions, with the concurrent fix =====');
  let bad = 0;
  for (const f of fs.readdirSync('qa/scenarios-runner').filter((x) => x.endsWith('.mjs')).sort()) {
    const rr = spawnSync(process.execPath, [path.join('qa/scenarios-runner', f)], { encoding: 'utf8', timeout: 300000 });
    const o = (rr.stdout || '') + (rr.stderr || '');
    const ff = o.split(/\r?\n/).filter((l) => /(^|\s)(FAIL|FAILED|✗|✘)(\s|:|$)/.test(l));
    if (rr.status !== 0 || ff.length) { bad++; console.log(`FAILING ${f} exit=${rr.status} n=${ff.length}`); ff.slice(0, 6).forEach((l) => console.log('  | ' + l.trim().slice(0, 150))); }
  }
  if (!bad) console.log('all 25 committed suites green');
  const v14 = spawnSync(process.execPath, ['qa/verification/proposed/v14_regression_additions.mjs'], { encoding: 'utf8' });
  const vo = (v14.stdout || '') + (v14.stderr || '');
  console.log(vo.split(/\r?\n/).filter((l) => l.includes('v14_regression_additions:')).join('\n'));
  console.log('D106 cases:');
  vo.split(/\r?\n/).filter((l) => l.includes('D106.')).forEach((l) => console.log('  ' + l.slice(0, 130)));
} finally {
  fs.writeFileSync(TARGET, PT);
  try { fs.unlinkSync('qa/verification/scratch/_v14_tmp_probe.mjs'); } catch {}
  console.log('\nRESTORED sha256 = ' + sha(TARGET) + (sha(TARGET) === REQUIRED ? '  MATCH' : '  *** MISMATCH ***'));
}
