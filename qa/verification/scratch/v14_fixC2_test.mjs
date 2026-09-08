// FIX-C2 — the concurrent session's specificity rule, plus the residual-mention guard my
// adversarial probe showed it needs. "Longest wins" never picks an unmentioned option, but
// it happily picks the longest of SEVERAL mentioned ones — including one the reply
// explicitly excludes ("archive acme, leave acme holdings alone" -> Acme Holdings).
// Requiring that no OTHER option label survives removal of the winner turns those back into
// dead ends without losing anything the specificity rule gained.
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
    const specificity = (o) => forMatching(o.label).length;\r
    const maxLen = Math.max(...matches.map(specificity));\r
    const longest = matches.filter((o) => specificity(o) === maxLen);\r
    const noOtherOptionRemainsMentioned = (win) => {\r
      const rest = normalizedCommand.split(forMatching(win.label)).join(' ');\r
      return !matches.some((o) => o !== win && rest.includes(forMatching(o.label)));\r
    };\r
    if (longest.length === 1) return noOtherOptionRemainsMentioned(longest[0]) ? longest[0] : null;\r
    const rawCommand = command.replace(/\\s+/g, ' ').trim().toLowerCase();\r
    const exact = longest.filter((o) => o.label.trim().length > 0\r
      && rawCommand.includes(o.label.replace(/\\s+/g, ' ').trim().toLowerCase()));\r
    if (exact.length === 1) return exact[0];\r
  }\r
  return null;`;
if (PT.split(FROM).length - 1 !== 1) throw new Error('anchor not unique');

const probe = `
import { build, ACME, ID2, ID3 } from './v14_lib.mjs';
const { matchFn } = build();
const O = (l, id) => ({ label: l, id, entityType: 'company', actionType: 'archive' });
const T = [
  ['names BOTH entities', 'move the tasks from acme to acme holdings', [O('Acme', ACME), O('Acme Holdings', ID2)], null],
  ['reply EXCLUDES the longest', 'archive acme, leave acme holdings alone', [O('Acme', ACME), O('Acme Holdings', ID2)], null],
  ['names two distinct options', 'alpha co and beta co', [O('Alpha Co', ACME), O('Beta Co', ID2)], null],
  ['two identical labels', 'acme', [O('Acme', ACME), O('Acme', ID2)], null],
  ['D106 bakery', 'smiths bakery', [O('Smith', ACME), O("Smith's Bakery", ID2)], ID2],
  ['D106 exact typed', "smith's bakery", [O('Smith', ACME), O("Smith's Bakery", ID2)], ID2],
  ['D106 fund', 'founders fund', [O('Fund', ACME), O("Founders' Fund", ID2)], ID2],
  ['D106 three-way', 'obrien logistics', [O('OBrien', ACME), O("O'Brien Logistics", ID2), O('Zeta', ID3)], ID2],
  ['D102 plain typed', 'founders fund', [O('Founders Fund', ACME), O("Founders' Fund", ID2)], ACME],
  ['D102 apostrophe typed', "founders' fund", [O('Founders Fund', ACME), O("Founders' Fund", ID2)], ID2],
  ['short name alone', 'smith', [O('Smith', ACME), O("Smith's Bakery", ID2)], ACME],
  ['plain containment', 'acme holdings', [O('Acme', ACME), O('Acme Holdings', ID2)], ID2],
  ['unambiguous control', 'acme holdings', [O('Acme Holdings', ACME), O('Beta Co', ID2)], ACME],
];
let bad = 0;
for (const [tag, cmd, opts, want] of T) {
  const r = matchFn(cmd, opts); const got = r ? r.id : null;
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'BAD  ') + tag.padEnd(26) + ' -> ' + (r ? JSON.stringify(r.label) : 'null'));
}
console.log(bad === 0 ? 'ALL 13 ADVERSARIAL CASES CORRECT' : bad + ' WRONG');
`;

try {
  fs.writeFileSync(TARGET, PT.replace(FROM, TO));
  fs.writeFileSync('qa/verification/scratch/_v14_c2.mjs', probe);
  const p = spawnSync(process.execPath, ['qa/verification/scratch/_v14_c2.mjs'], { encoding: 'utf8' });
  console.log('===== FIX-C2 adversarial matrix =====');
  console.log((p.stdout || '') + (p.stderr || ''));
  let bad = 0;
  for (const f of fs.readdirSync('qa/scenarios-runner').filter((x) => x.endsWith('.mjs')).sort()) {
    const rr = spawnSync(process.execPath, [path.join('qa/scenarios-runner', f)], { encoding: 'utf8', timeout: 300000 });
    const o = (rr.stdout || '') + (rr.stderr || '');
    const ff = o.split(/\r?\n/).filter((l) => /(^|\s)(FAIL|FAILED|✗|✘)(\s|:|$)/.test(l));
    if (rr.status !== 0 || ff.length) { bad++; console.log(`FAILING ${f} exit=${rr.status} n=${ff.length}`); ff.slice(0, 6).forEach((l) => console.log('  | ' + l.trim().slice(0, 140))); }
  }
  console.log(bad ? bad + ' committed suites failing' : 'all 25 committed suites green with FIX-C2');
} finally {
  fs.writeFileSync(TARGET, PT);
  try { fs.unlinkSync('qa/verification/scratch/_v14_c2.mjs'); } catch {}
  console.log('\nRESTORED sha256 = ' + sha(TARGET) + (sha(TARGET) === REQUIRED ? '  MATCH' : '  *** MISMATCH ***'));
}
