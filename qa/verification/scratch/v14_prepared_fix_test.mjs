// Verifier #14: does a COMBINED-AXIS belt (and a negation-aware CONFIRMED_COMPLETION,
// and a mis-binding-safe raw fallback) actually beat the candidate on every axis, without
// breaking a single committed case? Mutates the real source, measures, restores, asserts sha.
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

const FIXES = [
  // FIX-A (D114): keep BOTH axes. An interrogative lead is evidence of a question; a
  // first-person past-tense completion is evidence of an assertion. Neither subsumes the
  // other, so the belt drops on either.
  { from: `          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;`,
    to: `          const FIRST_PERSON_COMPLETION = /\\b(i|we)\\s+(?:just\\s+|already\\s+|successfully\\s+|quietly\\s+|finally\\s+|have\\s+|had\\s+)*(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\\b/i;\r\n          if (FIRST_PERSON_COMPLETION.test(q)) return null;\r\n          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;` },
  // FIX-B (D112): CONFIRMED_COMPLETION must not fire on a NEGATED or NOUN use. Require the
  // completion word to be the predicate of an affirmative clause: no negator between the
  // dash and the verb, and the verb not immediately preceded by a determiner (noun use).
  { from: `        const CONFIRMED_COMPLETION = /^\\s*confirmed\\s*[—–-]\\s*.*\\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\\b/i;`,
    to: `        const CONFIRMED_COMPLETION = /^\\s*confirmed\\s*[—–-]\\s*(?![^]*\\b(?:not|never|no|nothing|none|without|pending|awaiting|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|hasn['’]?t|haven['’]?t|didn['’]?t|don['’]?t)\\b)[^]*?(?<!\\bthe )(?<!\\ba )(?<!\\ban )(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )(?<!\\d )\\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\\b/i;` },
  // FIX-C (D105): the raw fallback may only DISAMBIGUATE the already-matching set, never
  // reach outside it, and it must require a whole-label match rather than containment of a
  // shorter unrelated option.
  { from: `    const exact = options.filter((o) => usable(o) && o.label.trim().length > 0\r\n      && command.trim().toLowerCase().includes(o.label.trim().toLowerCase()));`,
    to: `    const exact = matches.filter((o) => o.label.trim().toLowerCase() === command.trim().toLowerCase());` },
];

let text = PT;
for (const f of FIXES) {
  if (text.split(f.from).length - 1 !== 1) throw new Error('anchor not unique: ' + f.from.slice(0, 60));
  text = text.replace(f.from, f.to);
}

const probes = ['v14_reopen_curated.mjs', 'v14_question_axis.mjs', 'v14_negation_fp.mjs', 'v14_ab_matcher.mjs'];
try {
  fs.writeFileSync(TARGET, text);
  console.log('########## WITH PREPARED FIXES A+B+C APPLIED ##########');
  for (const p of probes) {
    console.log('\n----- ' + p + ' -----');
    const r = spawnSync(process.execPath, ['qa/verification/scratch/' + p], { encoding: 'utf8' });
    console.log((r.stdout || '') + (r.stderr || ''));
  }
  console.log('\n########## FULL COMMITTED BATTERY WITH FIXES ##########');
  const dir = 'qa/scenarios-runner';
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) {
    const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 300000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const fails = out.split(/\r?\n/).filter((l) => /(^|\s)(FAIL|FAILED|✗|✘)(\s|:|$)/.test(l));
    if (r.status !== 0 || fails.length) {
      console.log(`FAILING ${f} exit=${r.status} n=${fails.length}`);
      fails.slice(0, 8).forEach((l) => console.log('   | ' + l.trim().slice(0, 160)));
    }
  }
  console.log('(only failing suites listed above; silence = all green)');
} finally {
  fs.writeFileSync(TARGET, PT);
  const s = sha(TARGET);
  console.log('\nRESTORED index.ts sha256 = ' + s + (s === REQUIRED ? '  MATCH' : '  *** MISMATCH ***'));
  fs.writeFileSync('qa/verification/proposed/v14_prepared_fixes_candidate.ts.txt', text);
}
