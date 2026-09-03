import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const BASE = '021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(INDEX) !== BASE) { console.log('BASELINE MISMATCH'); process.exit(2); }
const ORIG = readFileSync(INDEX, 'utf8');
const battery = () => { const r = spawnSync(process.execPath, ['qa/verification/scratch/v13_run_battery.mjs'],
  { encoding: 'utf8', env: { ...process.env, V13_ALLOW_MUTATED: '1', V13_QUIET: '1' }, maxBuffer: 64e6 });
  const o = (r.stdout || '') + (r.stderr || '');
  return { green: /ALL EXIT ZERO: true/.test(o), line: (o.match(/TOTAL OK=\d+ FAIL=\d+/) || [''])[0],
    failing: o.split('\n').filter((l) => /FAIL=[1-9]/.test(l)).map((l) => l.trim().split(/\s+/)[1]) }; };
const ab = () => JSON.parse(spawnSync(process.execPath, ['qa/verification/scratch/v13_ab.mjs'], { encoding: 'utf8', maxBuffer: 32e6 }).stdout);
const lab = () => { const r = spawnSync(process.execPath, ['qa/verification/scratch/v13_labelprobe.mjs'], { encoding: 'utf8', maxBuffer: 32e6 });
  try { return JSON.parse(r.stdout); } catch { return { err: (r.stdout || '') + (r.stderr || '') }; } };
const measure = (tag) => { const b = battery(), a = ab(), l = lab();
  console.log(`\n--- ${tag} ---`);
  console.log('battery ' + (b.green ? 'GREEN' : 'RED') + ' ' + b.line + (b.failing.length ? ' failing=' + b.failing.join(',') : ''));
  console.log('leaks=' + a.assertion_leaks + ' dropped=' + a.legit_dropped + ' truncated=' + a.legit_truncated);
  console.log('assertion labels accepted=' + (l.assertion_labels_accepted || []).length + '/9  real names kept=' + (l.real_names_kept || []).length + '/3 selectable=' + (l.real_names_selectable || []).length + '/3');
  console.log('seam=' + JSON.stringify(l.seam_rendered) + ' match=' + l.seam_match);
  console.log('triple=' + JSON.stringify(l.triple) + ' unique=' + l.triple_unique + '  apostrophe_match=' + l.apostrophe_pair_match);
  return { tag, b, a, l }; };
const R = [measure('BASELINE ace9b6a')];

// FIX-1+2 (D102 + D103a)
{
  const find = `            const labelCounts = new Map();
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
            }`.replace(/\n/g, '\r\n');
  const repl = `            const labelKey = (s) => s.replace(/[“”‘’"']/g, '').replace(/\\s+/g, ' ').trim().toLowerCase()
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
            }`.replace(/\n/g, '\r\n');
  if (!ORIG.includes(find)) console.log('FIX-1/2 anchor missing');
  else { writeFileSync(INDEX, ORIG.replace(find, repl)); R.push(measure('FIX-1+2 D102 seam key + D103a stable index')); writeFileSync(INDEX, ORIG); }
  console.log('restore ok=' + (sha(INDEX) === BASE));
}
// FIX-3b: REPLACE the first-person belt with an interrogative-lead belt
{
  const find = `          const FIRST_PERSON_COMPLETION = /\\b(i|we)\\s+(?:just\\s+|already\\s+)?(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\\b/i;
          if (FIRST_PERSON_COMPLETION.test(q)) return null;`.replace(/\n/g, '\r\n');
  const repl = `          const INTERROGATIVE_LEAD = /^(please\\s+)?(who|whom|whose|which|what|when|where|why|how|do|does|did|is|are|was|were|am|can|could|should|shall|will|would|may|might|have|has|had|if)\\b/i;
          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;`.replace(/\n/g, '\r\n');
  if (!ORIG.includes(find)) console.log('FIX-3b anchor missing');
  else { writeFileSync(INDEX, ORIG.replace(find, repl)); R.push(measure('FIX-3b D98+D99 interrogative-lead belt REPLACES first-person belt')); writeFileSync(INDEX, ORIG); }
  console.log('restore ok=' + (sha(INDEX) === BASE));
}
writeFileSync('qa/verification/scratch/v13/v13_candidate_fix_report2.json', JSON.stringify(R, null, 1));
console.log('\nFINAL sha ' + sha(INDEX) + ' identical=' + (sha(INDEX) === BASE));
