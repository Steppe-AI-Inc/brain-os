// VERIFIER #55 — mutation tests on MY corpus. Each mutant reverts ONE shipped fix in the extracted belt
// body (never the file). For each: fabrications that RE-OPEN (caught by baseline, shipped by mutant),
// truthful rows newly destroyed, and NO-OP detection (mutant text identical to baseline = the mutation
// did not apply, which is itself a failure of the proof).
import rows from './corpus.mjs';
import { buildBelt, buildV92, buildCandFuture } from './belt.mjs';
const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const v92 = buildV92('qa/verification/scratch/v92/v92.lf.ts');
const cf = buildCandFuture(CAND);

const MUTANTS = {
  'revert nameInternal': (b) => b.replace('const nameInternal = (', 'const nameInternal = false && ('),
  'revert titleHead': (b) => b.replace('const titleHead = /^(?:Pending|Awaiting)$/', 'const titleHead = false && /^(?:Pending|Awaiting)$/'),
  'revert titleHeadAfterPrep': (b) => b.replace('const titleHeadAfterPrep = /', 'const titleHeadAfterPrep = false && /'),
  'revert ppInternal': (b) => b.replace('const ppInternal = /', 'const ppInternal = false && /'),
  'revert relInternal': (b) => b.replace('const relInternal = /', 'const relInternal = false && /'),
  'revert newSubject': (b) => b.replace('const newSubject = !', 'const newSubject = false && !'),
  'revert quotedHead': (b) => b.replace('const quotedHead = /', 'const quotedHead = false && /'),
  'revert adjective': (b) => b.replace('const adjective = /', 'const adjective = false && /'),
  'revert fewQuant': (b) => b.replace('const fewQuant = /', 'const fewQuant = false && /'),
  'revert detName': (b) => b.replace('const detName = /', 'const detName = false && /'),
  'revert idiom strip (both)': (b) => b.split('no problem|no worries|not to worry').join('zzqq|zzqq|zzqq'),
  'revert R-AUXGAP arm': (b) => b.replace(", 'gi'), '$1 ')", () => ", 'gi'), '$&')"),
  'revert namePrefixHit (cap 16->0)': (b) => b.replace('for (let __k = 0; __k < 16; __k++)', 'for (let __k = 0; __k < 0; __k++)'),
  'revert V45-N2 early return': (b) => b.replace('if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c) && !EXECUTION_IN_PROGRESS.test(c)) return false;', ''),
  'revert order rule (n > p)': (b) => b.replace('if (n > p) return false;', ''),
  'revert conditioned-offer stand-down (belt side)': (b) => b.replace("!/\\b(?:once|if|after|unless|when|provided|assuming|as soon as|subject to|pending|before|until|only with|but first|first)\\b[^.]{0,40}?\\byou(?:r|rs)?\\b|", "!/(?!x)x|"),
  'revert modal-hedge blanking': (b) => b.replace('(?:have been|has been|had been)\\s+[a-z]+/gi, \' \')', () => '(?:have been|has been|had been)\\s+[a-z]+/gi, \'$&\')'),
  'add ppInternal fab probe (no mutation)': (b) => b + '\n',
  'revert first-person entity-signal object check': (b) => b.replace('__f[1] === undefined || knownEntityNames.has(String(__f[1])', '__f[1] === undefined || false && knownEntityNames.has(String(__f[1])'),
};
const base0 = buildBelt(CAND), baseP = new Map();
const beltP = (names, mutate) => buildBelt(CAND, { names, mutate });
function verdicts(mutate) {
  const out = [];
  const b0 = buildBelt(CAND, { mutate });
  const cache = new Map();
  for (const r of rows) {
    const k = r.pack.join('|');
    if (!cache.has(k)) cache.set(k, beltP(r.pack, mutate));
    const bp = cache.get(k);
    out.push([r, b0.readsAsCompletion(r.text), bp.readsAsCompletion(r.text)]);
  }
  return out;
}
const baseline = verdicts((s) => s);
const baseBody = base0.body;
console.log('corpus', rows.length);
console.log('mutant'.padEnd(50), 'applied', 'FAB re-open(empty/pack)', 'TRUTH newly destroyed(empty/pack)', 'TRUTH newly preserved(empty/pack)');
for (const [name, mut] of Object.entries(MUTANTS)) {
  const applied = mut(baseBody) !== baseBody;
  let vs;
  try { vs = verdicts(mut); } catch (e) { console.log(name.padEnd(50), 'BUILD ERROR', e.message.slice(0, 80)); continue; }
  let fabOpen0 = 0, fabOpenP = 0, truthLost0 = 0, truthLostP = 0, truthKept0 = 0, truthKeptP = 0;
  const examples = []; const kept = [];
  for (let i = 0; i < rows.length; i++) {
    const [r, m0, mP] = vs[i]; const [, b0, bP] = baseline[i];
    if (r.label === 'F') { if (b0 && !m0) { fabOpen0++; if (examples.length < 3) examples.push(r.text); } if (bP && !mP) fabOpenP++; }
    else { if (!b0 && m0) truthLost0++; if (!bP && mP) truthLostP++; if (b0 && !m0) { truthKept0++; kept.push('[empty] ' + r.text); } if (bP && !mP) { truthKeptP++; kept.push('[pack] ' + r.text); } }
  }
  console.log(name.padEnd(50), (applied ? 'yes' : 'NO-OP').padEnd(7), (fabOpen0 + '/' + fabOpenP).padEnd(23), (truthLost0 + '/' + truthLostP).padEnd(33), truthKept0 + '/' + truthKeptP, examples.length ? ' e.g. ' + JSON.stringify(examples[0]) : '');
  for (const k of kept) console.log('      truth this fix DESTROYS (parity or not, listed):', k);
}
