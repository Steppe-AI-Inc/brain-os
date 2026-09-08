// Acceptance check for the three prepared fixes (A2 + B + C): applied together, do they
// close the #74 DEFECT cases, keep every #74 CONTRACT case, and keep all 25 committed
// suites green? Mutates the real source, measures, restores, asserts sha.
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

const FIXES = [
  { name: 'FIX-A2 (D114 clause-position belt)',
    from: `          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;`,
    to: `          const FIRST_PERSON_MAIN_CLAUSE_COMPLETION = /(?<!\\b(?:the|a|an|all|any|some|those|these|our|your|my|their|both|each|every)\\s\\w{1,24}\\s)\\b(i|we)\\s+(?:\\w+ly\\s+|just\\s+|already\\s+|have\\s+|has\\s+|had\\s+){0,2}(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\\b/i;\r\n          if (FIRST_PERSON_MAIN_CLAUSE_COMPLETION.test(q)) return null;\r\n          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;` },
  { name: 'FIX-B (D112 negation-aware CONFIRMED_COMPLETION)',
    from: `        const CONFIRMED_COMPLETION = /^\\s*confirmed\\s*[—–-]\\s*.*\\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\\b/i;`,
    to: `        const CONFIRMED_COMPLETION = /^\\s*confirmed\\s*[—–-]\\s*(?![^]*\\b(?:not|never|no|nothing|none|without|pending|awaiting|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|hasn['’]?t|haven['’]?t|didn['’]?t|don['’]?t)\\b)[^]*?(?<!\\bthe )(?<!\\ba )(?<!\\ban )(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )(?<!\\d )\\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\\b/i;` },
  { name: 'FIX-C (D105 mis-binding-safe raw fallback)',
    from: `    const exact = options.filter((o) => usable(o) && o.label.trim().length > 0\r\n      && command.trim().toLowerCase().includes(o.label.trim().toLowerCase()));`,
    to: `    const exact = matches.filter((o) => o.label.trim().toLowerCase() === command.trim().toLowerCase());` },
];

let text = PT;
for (const f of FIXES) {
  if (text.split(f.from).length - 1 !== 1) throw new Error('anchor not unique for ' + f.name);
  text = text.replace(f.from, f.to);
}

try {
  fs.writeFileSync(TARGET, text);
  const r = spawnSync(process.execPath, ['qa/verification/proposed/v14_regression_additions.mjs'], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split(/\r?\n/).filter((l) => l.startsWith('FAIL '));
  console.log('===== v14_regression_additions WITH FIXES A2+B+C =====');
  console.log(out.split(/\r?\n/).filter((l) => l.includes('v14_regression_additions:')).join('\n'));
  console.log('remaining failures:');
  fails.forEach((l) => console.log('  ' + l.slice(0, 150)));
  console.log('\n===== COMMITTED BATTERY WITH FIXES =====');
  let bad = 0;
  for (const f of fs.readdirSync('qa/scenarios-runner').filter((x) => x.endsWith('.mjs')).sort()) {
    const rr = spawnSync(process.execPath, [path.join('qa/scenarios-runner', f)], { encoding: 'utf8', timeout: 300000 });
    const o = (rr.stdout || '') + (rr.stderr || '');
    const ff = o.split(/\r?\n/).filter((l) => /(^|\s)(FAIL|FAILED|✗|✘)(\s|:|$)/.test(l));
    if (rr.status !== 0 || ff.length) { bad++; console.log(`FAILING ${f} exit=${rr.status} n=${ff.length}`); ff.slice(0, 6).forEach((l) => console.log('  | ' + l.trim().slice(0, 140))); }
  }
  if (!bad) console.log('ALL 25 COMMITTED SUITES GREEN with A2+B+C');
} finally {
  fs.writeFileSync(TARGET, PT);
  console.log('\nRESTORED sha256 = ' + sha(TARGET) + (sha(TARGET) === REQUIRED ? '  MATCH' : '  *** MISMATCH ***'));
}
