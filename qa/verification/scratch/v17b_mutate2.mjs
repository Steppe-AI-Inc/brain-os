// VERIFIER #17 — second mutation round. Every mutant here PRESERVES the source literals the
// suites pin on, so a "catch" must be BEHAVIOURAL, not an extraction refusal. This is the
// D126 question asked properly: does run15 observe the DROP, or only its source text?
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const IDX = resolve('supabase/functions/sem-ai-command/index.ts');
const REQUIRED_SHA = 'e5ccf63b26b833f4cc5d9596e7417d7b5744bef6be919982740b1c4f165b6d69';
const PRISTINE = readFileSync(IDX);
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (sha(PRISTINE) !== REQUIRED_SHA) { console.error('SHA MISMATCH AT START'); process.exit(2); }
const TEXT = PRISTINE.toString('utf8');

const SUITES = readdirSync('qa/scenarios-runner').filter((f) => f.endsWith('.mjs')).sort()
  .filter((f) => !['_gate_extract.mjs', 'claim_segmentation_and_present_tense_fp.mjs',
    'd3_past_completion_gate_not_shortcircuited_by_pending_action.mjs', 'mixed_claim_grounding.mjs',
    'past_completion_gate_behavior.mjs', 'per_resource_grounding_contract.mjs'].includes(f));

function runBattery() {
  const failed = [];
  for (const f of SUITES) {
    let out = '', code = 0;
    try { out = execFileSync(process.execPath, [resolve('qa/scenarios-runner', f)], { encoding: 'utf8', timeout: 180000 }); }
    catch (e) { code = typeof e.status === 'number' ? e.status : -1; out = (e.stdout || '') + (e.stderr || ''); }
    const failLines = (out.match(/^FAIL\b/gm) || []).length;
    const m = out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail/i);
    const sumFail = m ? Number(m[2]) : 0;
    const refused = /refusing to report|missing from|no longer consults|not found|unbalanced/i.test(out);
    if (failLines > 0 || sumFail > 0 || code !== 0) {
      failed.push(`${f}[${refused && failLines === 0 && sumFail === 0 ? 'EXTRACTION-REFUSAL' : 'BEHAVIOURAL:' + Math.max(failLines, sumFail)}]`);
    }
  }
  return failed;
}

const MUTANTS = [
  ['M21', 'drop', 'OVER-BROAD drop, literal preserved: the filter predicate always drops',
    'paObj.options = paObj.options.filter((_: unknown, oi: number) => !unresolvableOptionIndexes.includes(oi));',
    'paObj.options = paObj.options.filter((_: unknown, oi: number) => !unresolvableOptionIndexes.includes(oi) && false);'],
  ['M22', 'drop', 'NO-OP drop, literal preserved: the filter predicate never drops',
    'paObj.options = paObj.options.filter((_: unknown, oi: number) => !unresolvableOptionIndexes.includes(oi));',
    'paObj.options = paObj.options.filter((_: unknown, oi: number) => !unresolvableOptionIndexes.includes(oi) || true);'],
  ['M23', 'drop', 'drop fires only for the FIRST unresolvable option (index 0)',
    'if (!canonicalKnowsIt) unresolvableOptionIndexes.push(oi);',
    'if (!canonicalKnowsIt && oi === 0) unresolvableOptionIndexes.push(oi);'],
  ['M24', 'numbering', 'D95 numbering removed (colliding fallbacks stay mutually unselectable)',
    'o.label = `${o.label.replace(/\\s*\\(option \\d+\\)$/, \'\')} (option ${oi + 1})`;',
    'o.label = o.label;'],
  ['M25', 'gate', 'alias table emptied ENTIRELY (all 19 keys), braces preserved',
    "employee: 'person', staff: 'person', user: 'person', member: 'person', contact: 'person',\r\n              organization: 'company', organisation: 'company', org: 'company', business: 'company',\r\n              client: 'company', customer: 'company', vendor: 'company', supplier: 'company', partner: 'company',\r\n              subsidiary: 'company', ticket: 'task', todo: 'task', objective: 'goal', okr: 'goal',",
    ''],
  ['M26', 'gate', 'alias applied to the READ but NOT to displayName (the two disagree again)',
    "? displayName(CANONICAL_TYPE_ALIAS[typeof o.entityType === 'string' ? o.entityType : ''] || (typeof o.entityType === 'string' ? o.entityType : 'record'), o.id)",
    "? displayName(typeof o.entityType === 'string' ? o.entityType : 'record', o.id)"],
  ['M27', 'matcher', 'filler set gains only the single word "no"',
    "'that this one the a an it its is go ahead do proceed",
    "'no that this one the a an it its is go ahead do proceed"],
  ['M28', 'belt', 'splitter also splits on "or" (a plausible next widening)',
    '|\\s+(?:and|but|without)\\s+', '|\\s+(?:and|but|without|or)\\s+'],
];

const report = [];
try {
  for (const [id, area, desc, from, to] of MUTANTS) {
    const n = TEXT.split(from).length - 1;
    if (n !== 1) { console.log(`${id} NOT APPLIED (${n} occurrences): ${desc}`); report.push({ id, applied: false, n, desc }); continue; }
    writeFileSync(IDX, Buffer.from(TEXT.replace(from, to), 'utf8'));
    const failed = runBattery();
    writeFileSync(IDX, PRISTINE);
    if (sha(readFileSync(IDX)) !== REQUIRED_SHA) { console.error('RESTORE FAILED after ' + id); process.exit(2); }
    const behavioural = failed.filter((f) => f.includes('BEHAVIOURAL'));
    report.push({ id, area, desc, applied: true, caughtBy: failed, behaviouralCatches: behavioural.length, survived: failed.length === 0 });
    console.log(`${id} ${area.padEnd(10)} ${failed.length ? (behavioural.length ? 'CAUGHT BEHAVIOURALLY by ' + behavioural.join(' ') : 'caught ONLY by extraction refusal: ' + failed.join(' ')) : '*** SURVIVED ***'}`);
    console.log(`     ${desc}`);
  }
} finally {
  writeFileSync(IDX, PRISTINE);
  const f = sha(readFileSync(IDX));
  console.log('\nindex.ts sha256 after restore: ' + f + (f === REQUIRED_SHA ? '  (MATCHES REQUIRED)' : '  *** MISMATCH ***'));
}
writeFileSync('qa/verification/scratch/v17b_mutation2_result.json', JSON.stringify(report, null, 1));
const a = report.filter((r) => r.applied);
console.log(`\nROUND 2: ${a.length} applied, ${a.filter((r) => r.survived).length} survived, `
  + `${a.filter((r) => !r.survived && r.behaviouralCatches === 0).length} caught ONLY by an extraction refusal`);
