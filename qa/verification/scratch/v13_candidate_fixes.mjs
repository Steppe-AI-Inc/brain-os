// verifier #13 candidate-fix validation. Each fix is applied to the REAL index.ts,
// measured against the committed battery AND this campaign's attack corpora, then the
// file is restored and sha256-verified byte-identical. No fix is left applied.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const BASE = '021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(INDEX) !== BASE) { console.log('BASELINE MISMATCH'); process.exit(2); }
const ORIG = readFileSync(INDEX, 'utf8');

const battery = () => {
  const r = spawnSync(process.execPath, ['qa/verification/scratch/v13_run_battery.mjs'],
    { encoding: 'utf8', env: { ...process.env, V13_ALLOW_MUTATED: '1', V13_QUIET: '1' }, maxBuffer: 64e6 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { green: /ALL EXIT ZERO: true/.test(out), line: (out.match(/TOTAL OK=\d+ FAIL=\d+/) || [''])[0],
    failing: out.split('\n').filter((l) => /FAIL=[1-9]/.test(l)).map((l) => l.trim().split(/\s+/)[1]) };
};
const ab = () => JSON.parse(spawnSync(process.execPath, ['qa/verification/scratch/v13_ab.mjs'], { encoding: 'utf8', maxBuffer: 32e6 }).stdout);
const probeLabels = () => {
  const code = `
import * as P from './qa/verification/scratch/v13_probe.mjs';
const A=['Restored Three Companies','Closed Five Deals','Restored Full Access','Completed Final Migration','Restored Backup Yesterday','Completed Migration','Closed Deals Today','Restored Bob Smith','Completed Bob Smith Onboarding'];
const R=['Closed Loop Systems','Completed Works Ltd','Restored Timber Co'];
const accepted=A.filter(l=>P.label(l,'ACME Holdings')===l);
const realKept=R.filter(l=>P.label(l,l)===l);
const realSelectable=R.filter(l=>P.match(l.toLowerCase(),[{label:P.label(l,l),id:P.ACME,entityType:'company'}])!==null);
// D102/D103 seam
const r1=P.labels([{label:'Closed Loop Systems',id:P.ACME,entityType:'company'},{label:'Deleted The Project',id:P.ID2,entityType:'company'}],{companies:[{id:P.ACME,name:'Closed Loop Systems'},{id:P.ID2,name:'Closed Loop Systems'}]});
const o1=[{label:r1[0],id:P.ACME,entityType:'company'},{label:r1[1],id:P.ID2,entityType:'company'}];
const seam=P.match('closed loop systems',o1);
const r2=P.labels([{label:'the company',id:P.ACME,entityType:'company'},{label:'the company',id:P.ID2,entityType:'company'},{label:'the company (option 1)',id:'22222222-2222-2222-2222-222222222222',entityType:'company'}]);
console.log(JSON.stringify({assertion_labels_accepted:accepted,real_names_kept:realKept,real_names_selectable:realSelectable,seam_rendered:r1,seam_match:seam?seam.id:null,triple:r2,triple_unique:new Set(r2).size===r2.length}));
`;
  writeFileSync('qa/verification/scratch/v13/_probe_labels.mjs', code);
  const r = spawnSync(process.execPath, ['qa/verification/scratch/v13/_probe_labels.mjs'], { encoding: 'utf8', maxBuffer: 32e6 });
  try { return JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { return { error: (r.stdout || '') + (r.stderr || '') }; }
};

const measure = (tag) => {
  const b = battery(), a = ab(), l = probeLabels();
  console.log(`\n--- ${tag} ---`);
  console.log('battery: ' + (b.green ? 'GREEN' : 'RED  ') + ' ' + b.line + (b.failing.length ? ' failing=' + b.failing.join(',') : ''));
  console.log('leaks=' + a.assertion_leaks + ' dropped=' + a.legit_dropped + ' truncated=' + a.legit_truncated);
  console.log('assertion labels accepted=' + (l.assertion_labels_accepted || []).length + ' real names kept=' + (l.real_names_kept || []).length
    + ' real selectable=' + (l.real_names_selectable || []).length);
  console.log('seam rendered=' + JSON.stringify(l.seam_rendered) + ' match=' + l.seam_match);
  console.log('triple=' + JSON.stringify(l.triple) + ' unique=' + l.triple_unique);
  return { tag, battery: b, ab: a, labels: l };
};

const REPORT = [];
REPORT.push(measure('BASELINE ace9b6a (unmodified)'));

// ===================== FIX-1 + FIX-2 (D102 + D103a) =====================
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
  if (!ORIG.includes(find)) { console.log('\nFIX-1/2 ANCHOR NOT FOUND'); }
  else { writeFileSync(INDEX, ORIG.replace(find, repl)); REPORT.push(measure('FIX-1+2 (D102 seam key + D103a stable unique index)')); writeFileSync(INDEX, ORIG); }
  console.log('restore identical: ' + (sha(INDEX) === BASE));
}

// ===================== FIX-3 (D98 + D99) =====================
{
  const find = `          if (FIRST_PERSON_COMPLETION.test(q)) return null;`;
  const repl = `          if (FIRST_PERSON_COMPLETION.test(q)) return null;
          const INTERROGATIVE_LEAD = /^(please\\s+)?(who|whom|whose|which|what|when|where|why|how|do|does|did|is|are|was|were|am|can|could|should|shall|will|would|may|might|have|has|had|if|would you|shall i)\\b/i;
          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;`;
  if (!ORIG.includes(find)) { console.log('\nFIX-3 ANCHOR NOT FOUND'); }
  else { writeFileSync(INDEX, ORIG.replace(find, repl)); REPORT.push(measure('FIX-3 (D98/D99 interrogative-lead belt)')); writeFileSync(INDEX, ORIG); }
  console.log('restore identical: ' + (sha(INDEX) === BASE));
}

// ===================== FIX-4 (D100) =====================
{
  const find = `              o.label = safeOptionLabel(o.label)
                || (typeof o.id === 'string' && o.id ? displayName(typeof o.entityType === 'string' ? o.entityType : 'record', o.id) : \`option \${oi + 1}\`);`;
  const repl = `              const derived = (typeof o.id === 'string' && o.id ? displayName(typeof o.entityType === 'string' ? o.entityType : 'record', o.id) : \`option \${oi + 1}\`);
              const safe = safeOptionLabel(o.label);
              const bare = (s) => String(s).replace(/[“”‘’"']/g, '').trim().toLowerCase();
              o.label = (safe && (!COMPLETION_WORD.test(safe) || bare(safe) === bare(derived))) ? safe : derived;`;
  if (!ORIG.includes(find.replace(/\n/g, '\r\n'))) { console.log('\nFIX-4 ANCHOR NOT FOUND'); }
  else {
    writeFileSync(INDEX, ORIG.replace(find.replace(/\n/g, '\r\n'), repl.replace(/\n/g, '\r\n')));
    REPORT.push(measure('FIX-4 (D100 completion label must match the canonical name)'));
    writeFileSync(INDEX, ORIG);
  }
  console.log('restore identical: ' + (sha(INDEX) === BASE));
}

writeFileSync('qa/verification/scratch/v13/v13_candidate_fix_report.json', JSON.stringify(REPORT, null, 1));
console.log('\nFINAL index.ts sha256 ' + sha(INDEX) + ' identical=' + (sha(INDEX) === BASE));
