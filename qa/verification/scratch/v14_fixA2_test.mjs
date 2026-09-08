// FIX-A2: the axis that actually separates D98 from D99 is CLAUSE POSITION, not lead
// position and not subject. In every legitimate D98 clarification the first-person
// completion sits inside a NOUN PHRASE ("the tasks we completed", "the ones I removed",
// "the company I archived") - a reduced relative clause. In every D99 assertion it is the
// MAIN predicate ("Did I mention I archived ACME", "..., I removed the old leads ok?").
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const TARGET = 'supabase/functions/sem-ai-command/index.ts';
const PRISTINE = 'qa/verification/scratch/v14_pristine_index.ts';
const REQUIRED = '10db58385071d8f07fcd96ed65929be6b15bbeda3d197f4dae92327acba70d2a';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const PT = fs.readFileSync(PRISTINE, 'utf8');
if (sha(TARGET) !== REQUIRED) throw new Error('target sha mismatch at start');

const FROM = `          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;`;
const TO = `          const FIRST_PERSON_MAIN_CLAUSE_COMPLETION = /(?<!\\b(?:the|a|an|all|any|some|those|these|our|your|my|their|both|each|every)\\s\\w{1,24}\\s)\\b(i|we)\\s+(?:\\w+ly\\s+|just\\s+|already\\s+|have\\s+|has\\s+|had\\s+){0,2}(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\\b/i;\r
          if (FIRST_PERSON_MAIN_CLAUSE_COMPLETION.test(q)) return null;\r
          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;`;

if (PT.split(FROM).length - 1 !== 1) throw new Error('anchor not unique');
try {
  fs.writeFileSync(TARGET, PT.replace(FROM, TO));
  for (const p of ['v14_reopen_curated.mjs', 'v14_question_axis.mjs']) {
    console.log('\n----- ' + p + ' (WITH FIX-A2) -----');
    const r = spawnSync(process.execPath, ['qa/verification/scratch/' + p], { encoding: 'utf8' });
    console.log((r.stdout || '') + (r.stderr || ''));
  }
  console.log('\n########## COMMITTED BATTERY WITH FIX-A2 ##########');
  const dir = 'qa/scenarios-runner';
  let bad = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) {
    const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 300000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const fails = out.split(/\r?\n/).filter((l) => /(^|\s)(FAIL|FAILED|✗|✘)(\s|:|$)/.test(l));
    if (r.status !== 0 || fails.length) { bad++; console.log(`FAILING ${f} exit=${r.status} n=${fails.length}`); fails.slice(0, 10).forEach((l) => console.log('   | ' + l.trim().slice(0, 150))); }
  }
  if (!bad) console.log('ALL 25 SUITES GREEN with FIX-A2');
} finally {
  fs.writeFileSync(TARGET, PT);
  console.log('\nRESTORED sha256 = ' + sha(TARGET) + (sha(TARGET) === REQUIRED ? '  MATCH' : '  *** MISMATCH ***'));
}
