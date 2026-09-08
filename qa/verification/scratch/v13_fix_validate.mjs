// Apply FIX-1+2 and FIX-3b TOGETHER, run the committed battery AND the proposed run13
// cases, then restore and sha-verify.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const BASE = '021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(INDEX) !== BASE) { console.log('BASELINE MISMATCH'); process.exit(2); }
const ORIG = readFileSync(INDEX, 'utf8');
const crlf = (s) => s.replace(/\n/g, '\r\n');

const F12find = crlf(`            const labelCounts = new Map();
            for (const o of paObj.options) {
              if (o && typeof o.label === 'string') labelCounts.set(o.label, (labelCounts.get(o.label) || 0) + 1);
            }
            let collisionSeq = 0;
            for (const o of paObj.options) {
              if (o && typeof o.label === 'string' && labelCounts.get(o.label) > 1) {
                collisionSeq++;
                o.label = \`\${o.label} (option \${collisionSeq})\`;
                pendingActionGatingChanged = true;
              }
            }`);
const F12repl = crlf(`            const labelKey = (s) => s.replace(/[“”‘’"']/g, '').replace(/\\s+/g, ' ').trim().toLowerCase()
              .replace(/\\s*\\(option \\d+\\)$/, '');
            const labelCounts = new Map();
            for (const o of paObj.options) {
              if (o && typeof o.label === 'string') labelCounts.set(labelKey(o.label), (labelCounts.get(labelKey(o.label)) || 0) + 1);
            }
            for (let oi = 0; oi < paObj.options.length; oi++) {
              const o = paObj.options[oi];
              if (o && typeof o.label === 'string' && labelCounts.get(labelKey(o.label)) > 1) {
                o.label = \`\${o.label.replace(/\\s*\\(option \\d+\\)$/, '')} (option \${oi + 1})\`;
                pendingActionGatingChanged = true;
              }
            }`);
const F3find = crlf(`          const FIRST_PERSON_COMPLETION = /\\b(i|we)\\s+(?:just\\s+|already\\s+)?(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\\b/i;
          if (FIRST_PERSON_COMPLETION.test(q)) return null;`);
const F3repl = crlf(`          const INTERROGATIVE_LEAD = /^(please\\s+)?(who|whom|whose|which|what|when|where|why|how|do|does|did|is|are|was|were|am|can|could|should|shall|will|would|may|might|have|has|had|if)\\b/i;
          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;`);

if (!ORIG.includes(F12find) || !ORIG.includes(F3find)) { console.log('ANCHOR MISSING f12=' + ORIG.includes(F12find) + ' f3=' + ORIG.includes(F3find)); process.exit(3); }
writeFileSync(INDEX, ORIG.replace(F12find, F12repl).replace(F3find, F3repl));

const bat = spawnSync(process.execPath, ['qa/verification/scratch/v13_run_battery.mjs'],
  { encoding: 'utf8', env: { ...process.env, V13_ALLOW_MUTATED: '1', V13_QUIET: '1' }, maxBuffer: 64e6 });
const bo = (bat.stdout || '') + (bat.stderr || '');
const prop = spawnSync(process.execPath, ['qa/verification/proposed/v13_regression_additions.mjs'], { encoding: 'utf8', maxBuffer: 32e6 });
const po = (prop.stdout || '') + (prop.stderr || '');
const ab = spawnSync(process.execPath, ['qa/verification/scratch/v13_ab.mjs'], { encoding: 'utf8', maxBuffer: 32e6 }).stdout;
writeFileSync(INDEX, ORIG);

console.log('battery: ' + (bo.match(/TOTAL OK=\d+ FAIL=\d+/) || [''])[0] + '  ALL_EXIT_ZERO=' + /ALL EXIT ZERO: true/.test(bo));
console.log('proposed run13 cases: ' + (po.match(/v13_regression_additions:.*/) || [''])[0]);
console.log('still failing: ' + po.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.split(/\s+/)[1]).join(', '));
const a = JSON.parse(ab);
console.log('A/B with fixes: leaks=' + a.assertion_leaks + ' dropped=' + a.legit_dropped + ' truncated=' + a.legit_truncated);
console.log('restore identical: ' + (sha(INDEX) === BASE));
