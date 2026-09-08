// VERIFIER #16 / SCENARIO 2b — re-run the five mutations my first pass could not
// distinguish from harness artifacts. A mutation only counts as DETECTED when the
// mutant is (i) applied, (ii) still syntactically valid AND still extractable, and
// (iii) produces a real ASSERTION failure — not a SyntaxError and not a suite's own
// "refusing to report on a slice that is not the product" drift guard.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const EXPECT = '0c3616b4e82b53f18e0b597aa0fe935b4c0bed1dcae86fbc9d4c59b91812fc26';
const ORIGINAL = fs.readFileSync(SRC);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
if (sha(ORIGINAL) !== EXPECT) { console.error('ABORT pre-sha', sha(ORIGINAL)); process.exit(2); }

const MUTS = [
  { id: 'A4b-limit-drop-own-label-removal', kind: 'LIMIT',
    why: 'Do NOT strip the option\'s own label before the negator test (syntactically valid this time). The "real name containing a negator still binds" LIMIT must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(
      "&& NEGATED_MENTION.test(c.split(forMatching(o.label)).join(' '))))) return null;",
      '&& NEGATED_MENTION.test(c)))) return null;') },

  { id: 'B1b-coverage-negated-clause-over-broad', kind: 'COVERAGE',
    why: 'Widen NEGATED_CLAUSE with an extra alternative that fires on every realistic summary ("a|e|i|o|u"), keeping the /\\b(?:...)\\b/i shape the suites extract. Every fabrication case must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(
      "const NEGATED_CLAUSE = /\\b(?:not|never|no|",
      "const NEGATED_CLAUSE = /\\b(?:acme|confirmed|the|a|is|was|been|task|company|bob|smith|record|approval|not|never|no|") },

  { id: 'B2b-limit-negated-clause-matches-nothing', kind: 'LIMIT',
    why: 'Shrink NEGATED_CLAUSE to a token that never occurs, keeping the extractable shape. Truthful negatives are destroyed again (#4905) so a truthful-negative CONTRACT hold must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(
      "const NEGATED_CLAUSE = /\\b(?:not|never|no|",
      "const NEGATED_CLAUSE = /\\b(?:zzzzznevermatchzzzzz|") },

  { id: 'B4b-coverage-whole-summary-negation-returns', kind: 'COVERAGE',
    why: 'Make the negation test whole-summary again by not splitting (single clause), keeping every regex intact. This is the D117 defect; its cases must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(
      "String(s).split(/[.!?,\\x3b]+/).map((c) => c.trim())",
      'String(s).split(/[\\x00]+/).map((c) => c.trim())') },

  { id: 'C4b-coverage-canonicalKnowsIt-always-true', kind: 'COVERAGE',
    why: 'canonicalKnowsIt unconditionally true => nothing is ever dropped and no label is ever replaced by the typed fallback. D119/D120 cases must fail.',
    suites: ['run15_defect_closure_contract.mjs', 'run12_defect_closure_contract.mjs', 'run13_defect_closure_contract.mjs', 'run14_defect_closure_contract.mjs', 'run8_defect_closure_contract.mjs'],
    apply: (s) => s.replace(
      `              const canonicalKnowsIt = !!derivedLabel\r\n                && bare(derivedLabel) !== bare(typedFallback)\r\n                && !/^option \\d+$/.test(derivedLabel);`,
      '              const canonicalKnowsIt = true;') },

  { id: 'C5-coverage-drop-only-empty-list', kind: 'COVERAGE',
    why: 'A weaker drop: only drop when EVERY option is unresolvable (a plausible half-fix). Does any committed case observe the MIXED case?',
    suites: ['run15_defect_closure_contract.mjs', 'run14_defect_closure_contract.mjs', 'run8_defect_closure_contract.mjs', 'run12_defect_closure_contract.mjs', 'run13_defect_closure_contract.mjs'],
    apply: (s) => s.replace(
      '            if (unresolvableOptionIndexes.length > 0) {',
      '            if (unresolvableOptionIndexes.length > 0 && unresolvableOptionIndexes.length === paObj.options.length) {') },
];

function extractable() {
  // My OWN extractor must still parse the mutant; if it throws, the mutant is malformed
  // and any suite failure is a harness artifact, not a detection.
  const r = spawnSync(process.execPath, ['-e',
    "import('./qa/verification/scratch/v16_extract.mjs').then(m=>{m.extractAll();console.log('EXTRACT_OK')}).catch(e=>{console.log('EXTRACT_FAIL '+e.message);process.exit(9)})"],
    { encoding: 'utf8' });
  return { ok: r.status === 0, msg: ((r.stdout || '') + (r.stderr || '')).trim().split('\n')[0] };
}

function runSuite(p) {
  const r = spawnSync(process.execPath, ['qa/scenarios-runner/' + p], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const syntaxError = /SyntaxError/.test(out);
  const driftGuard = /refusing to report on a slice that is not the product|did not survive extraction/.test(out);
  const m = [...out.matchAll(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/gi)];
  const failed = m.reduce((a, x) => a + (+x[2]), 0);
  const failLines = out.split(/\r?\n/).filter((l) => /^\s*(FAIL|✗)/i.test(l)).length;
  return { exit: r.status, failed, failLines, syntaxError, driftGuard,
    assertionFailure: (failed > 0 || failLines > 0) && !syntaxError,
    tail: out.split(/\r?\n/).filter((l) => l.trim()).slice(-2).join(' | ') };
}

const out = [];
for (const mut of MUTS) {
  const s = ORIGINAL.toString('utf8');
  const mutated = mut.apply(s);
  const applied = mutated !== s;
  let ex = null, per = [];
  if (applied) {
    fs.writeFileSync(SRC, Buffer.from(mutated, 'utf8'));
    ex = extractable();
    for (const su of mut.suites) per.push({ suite: su, ...runSuite(su) });
  }
  fs.writeFileSync(SRC, ORIGINAL);
  const rsha = sha(fs.readFileSync(SRC));
  if (rsha !== EXPECT) { console.error('FATAL restore', rsha); process.exit(3); }
  const realDetect = applied && ex && ex.ok && per.some((p) => p.assertionFailure);
  const onlyDrift = applied && per.some((p) => p.driftGuard) && !per.some((p) => p.assertionFailure);
  out.push({ id: mut.id, kind: mut.kind, applied, extractable: ex, per, realDetect, onlyDrift, rsha });
  console.log(`\n### ${mut.id} [${mut.kind}]`);
  console.log(`    ${mut.why}`);
  console.log(`    applied=${applied}  extractor=${ex ? ex.msg : 'n/a'}`);
  for (const p of per) console.log(`    ${p.suite}: exit=${p.exit} failed=${p.failed} failLines=${p.failLines} syntaxErr=${p.syntaxError} driftGuard=${p.driftGuard} -> ${p.assertionFailure ? 'ASSERTION FAILURE' : 'no assertion failure'}`);
  console.log(`    VERDICT: ${realDetect ? 'DETECTED by a real assertion' : onlyDrift ? 'detected ONLY by an extraction drift guard (weak)' : '*** SURVIVED — VACUOUS ***'}`);
  console.log(`    restored sha256 = ${rsha}`);
}
const finalSha = sha(fs.readFileSync(SRC));
console.log(`\nFINAL sha256 = ${finalSha} ${finalSha === EXPECT ? 'MATCH' : '*** MISMATCH ***'}`);
console.log(`SURVIVED (vacuous): ${out.filter((o) => o.applied && !o.realDetect && !o.onlyDrift).map((o) => o.id).join(', ') || 'none'}`);
console.log(`DRIFT-GUARD-ONLY : ${out.filter((o) => o.onlyDrift).map((o) => o.id).join(', ') || 'none'}`);
console.log(`NOT APPLIED      : ${out.filter((o) => !o.applied).map((o) => o.id).join(', ') || 'none'}`);
fs.writeFileSync('qa/verification/scratch/v16_mutation2_result.json', JSON.stringify({ finalSha, out }, null, 2));
