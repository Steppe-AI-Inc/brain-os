// VERIFIER #17 / SCENARIO 2 + 5 — MY OWN mutation battery.
// Deliberately NOT qa/verification/proposed/v16_mutation_proof.mjs (the implementing
// session's harness). Mutates the REAL index.ts in place, runs the whole assertion-bearing
// battery against each mutant, and counts failures FROM OUTPUT TEXT. The pristine bytes are
// restored and the sha256 re-asserted after EVERY mutant, in a finally block.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const IDX = resolve('supabase/functions/sem-ai-command/index.ts');
const REQUIRED_SHA = 'e5ccf63b26b833f4cc5d9596e7417d7b5744bef6be919982740b1c4f165b6d69';
const PRISTINE = readFileSync(IDX);
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (sha(PRISTINE) !== REQUIRED_SHA) { console.error('SHA MISMATCH AT START: ' + sha(PRISTINE)); process.exit(2); }
const TEXT = PRISTINE.toString('utf8');
// Control: prove the utf8 round-trip is byte-identical before trusting any mutant result.
if (sha(Buffer.from(TEXT, 'utf8')) !== REQUIRED_SHA) { console.error('utf8 round-trip is LOSSY — aborting'); process.exit(2); }

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
    const threw = /Error:|THREW/.test(out) && code !== 0;
    if (failLines > 0 || sumFail > 0 || code !== 0 || threw) {
      failed.push(`${f}(exit=${code},failLines=${failLines},sumFail=${sumFail})`);
    }
  }
  return failed;
}

// ---- the mutants -------------------------------------------------------------------
// [id, area, description, from, to]
const MUTANTS = [
  // --- matcher: coverage ---
  ['M1', 'matcher', 'remove the single-match clean-selection check',
    'if (matches.length === 1 && !cleanSelection(matches[0])) return null;\r\n', ''],
  ['M2', 'matcher', 'remove the clean-selection check on the D106 specificity path',
    'if (!cleanSelection(longest[0])) return null;\r\n', ''],
  ['M3', 'matcher', 'remove the clean-selection check on the D102 raw tie-break path',
    'if (exact.length === 1) return cleanSelection(exact[0]) ? exact[0] : null;',
    'if (exact.length === 1) return exact[0];'],
  ['M4', 'matcher', 'remove the second-option guard inside cleanSelection',
    "if (matches.some((o) => o !== winner && residual.includes(forMatching(o.label)))) return false;\r\n", ''],
  // --- matcher: LIMITS ---
  ['M5', 'matcher', 'OVER-BROADEN the filler set with every negator (the D123 defect, re-armed)',
    "+ 'to for with of on in company companies person people employee employees task tasks goal goals project department record'",
    "+ 'to for with of on in company companies person people employee employees task tasks goal goals project department record '\n    + 'no not never none nothing without except but exclude cancel forget nope nah stop wrong rush problem else'"],
  ['M6', 'matcher', 'OVER-BROADEN: .every -> .some (one filler word is enough)',
    '.every((w) => SELECTION_FILLER.has(w));', '.some((w) => SELECTION_FILLER.has(w));'],
  ['M7', 'matcher', 'OVER-NARROW: empty the filler set (label must stand alone)',
    'const SELECTION_FILLER = new Set((', 'const SELECTION_FILLER = new Set([].length ? [] : []); const __unused = ((' ],
  // --- gate: coverage ---
  ['M8', 'gate', 'EMPTY the alias table (D124 re-armed for aliased types)',
    "employee: 'person', staff: 'person', user: 'person', member: 'person', contact: 'person',", ''],
  ['M9', 'gate', 'canonicalKnowsIt IGNORES lastKnownLabel',
    "&& (canonicalById.has(canonicalType + '|' + o.id) || lastKnownLabel(canonicalType, o.id) !== null);",
    "&& canonicalById.has(canonicalType + '|' + o.id);"],
  ['M10', 'gate', 'canonicalKnowsIt IGNORES canonicalById',
    "&& (canonicalById.has(canonicalType + '|' + o.id) || lastKnownLabel(canonicalType, o.id) !== null);",
    '&& lastKnownLabel(canonicalType, o.id) !== null;'],
  ['M11', 'gate', 'canonicalKnowsIt reverts to the D124 typedFallback string comparison',
    "const canonicalKnowsIt = !!derivedLabel\r\n                && typeof o.id === 'string' && o.id.length > 0\r\n                && (canonicalById.has(canonicalType + '|' + o.id) || lastKnownLabel(canonicalType, o.id) !== null);",
    "const typedFallback = TYPED_FALLBACK[typeof o.entityType === 'string' ? o.entityType : 'record'] || 'the record';\r\n              const canonicalKnowsIt = !!derivedLabel\r\n                && bare(derivedLabel) !== bare(typedFallback)\r\n                && !/^option \\d+$/.test(derivedLabel);"],
  // --- gate: LIMITS on the drop (D126) ---
  ['M12', 'drop', 'drop fires ONLY when EVERY option is unresolvable (the #16 D126 mutant)',
    'if (unresolvableOptionIndexes.length > 0) {',
    'if (unresolvableOptionIndexes.length > 0 && unresolvableOptionIndexes.length === paObj.options.length) {'],
  ['M13', 'drop', 'remove the D119 drop entirely',
    'paObj.options = paObj.options.filter((_: unknown, oi: number) => !unresolvableOptionIndexes.includes(oi));',
    'paObj.options = paObj.options;'],
  ['M14', 'drop', 'OVER-BROAD drop: any unresolvable option empties the whole list',
    'paObj.options = paObj.options.filter((_: unknown, oi: number) => !unresolvableOptionIndexes.includes(oi));',
    'paObj.options = [];'],
  // --- belt: coverage + LIMITS ---
  ['M15', 'belt', 'drop the "confirmed" lookbehind from the dash boundary',
    '(?<!\\bconfirmed\\s*)[–—]+', '[–—]+'],
  ['M16', 'belt', 'remove and/but/without from the splitter',
    '|\\s+(?:and|but|without)\\s+', ''],
  ['M17', 'belt', 'remove :()\\n from the splitter character class',
    '[.!?,\\x3b:()\\n]+', '[.!?,\\x3b]+'],
  ['M18', 'belt', 'revert the splitter to 52e830f exactly',
    "String(s).split(/[.!?,\\x3b:()\\n]+|(?<!\\bconfirmed\\s*)[–—]+|\\s+(?:and|but|without)\\s+/i)",
    'String(s).split(/[.!?,\\x3b]+/)'],
  ['M19', 'belt', 'remove the per-clause NEGATED_CLAUSE test',
    '.some((c) => !NEGATED_CLAUSE.test(c)\r\n            &&', '.some((c) =>'],
  ['M20', 'belt', 'OVER-BROADEN: split on every space (every word its own clause)',
    "String(s).split(/[.!?,\\x3b:()\\n]+|(?<!\\bconfirmed\\s*)[–—]+|\\s+(?:and|but|without)\\s+/i)",
    'String(s).split(/\\s+/)'],
];

const report = [];
console.log('suites run per mutant: ' + SUITES.length + '\n');
try {
  for (const [id, area, desc, from, to] of MUTANTS) {
    const occurrences = TEXT.split(from).length - 1;
    if (occurrences !== 1) {
      report.push({ id, area, desc, applied: false, reason: `pattern occurs ${occurrences} times — mutant not applied` });
      console.log(`${id} ${area.padEnd(8)} NOT APPLIED (${occurrences} occurrences): ${desc}`);
      continue;
    }
    writeFileSync(IDX, Buffer.from(TEXT.replace(from, to), 'utf8'));
    const failed = runBattery();
    writeFileSync(IDX, PRISTINE);
    const after = sha(readFileSync(IDX));
    if (after !== REQUIRED_SHA) { console.error('RESTORE FAILED after ' + id + ': ' + after); process.exit(2); }
    report.push({ id, area, desc, applied: true, caughtBy: failed, survived: failed.length === 0 });
    console.log(`${id} ${area.padEnd(8)} ${failed.length ? 'CAUGHT by ' + failed.length + ': ' + failed.join(' ') : '*** SURVIVED — NO SUITE OBSERVES THIS ***'}`);
    console.log(`     ${desc}`);
  }
} finally {
  writeFileSync(IDX, PRISTINE);
  const final = sha(readFileSync(IDX));
  console.log('\nindex.ts sha256 after restore: ' + final + (final === REQUIRED_SHA ? '  (MATCHES REQUIRED)' : '  *** MISMATCH ***'));
}
writeFileSync('qa/verification/scratch/v17b_mutation_result.json', JSON.stringify(report, null, 1));
const applied = report.filter((r) => r.applied);
const survived = applied.filter((r) => r.survived);
console.log(`\nMUTANTS: ${applied.length} applied, ${applied.length - survived.length} caught, ${survived.length} SURVIVED`);
for (const s of survived) console.log('  SURVIVOR ' + s.id + ' [' + s.area + '] ' + s.desc);
for (const s of report.filter((r) => !r.applied)) console.log('  NOT APPLIED ' + s.id + ': ' + s.reason);
