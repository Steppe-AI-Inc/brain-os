// VERIFIER #16 / SCENARIO 2 — INDEPENDENT MUTATION HARNESS, written from scratch.
// Explicitly NOT qa/verification/proposed/v15_mutation_proof.mjs (the implementing
// session's own harness). Running that harness would be self-certification by proxy.
//
// METHOD: mutate the REAL supabase/functions/sem-ai-command/index.ts, run the REAL
// committed suites, and require that a COMMITTED case FAILS. Restore byte-identically
// after every mutation and prove it with a sha256. Both COVERAGE (remove the guard) and
// LIMITS (over-broaden the guard) are mutated, because a guard that cannot be
// over-broadened without a test failing is the only kind that stays honest.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const EXPECT_SHA = '0c3616b4e82b53f18e0b597aa0fe935b4c0bed1dcae86fbc9d4c59b91812fc26';
const ORIGINAL = fs.readFileSync(SRC); // Buffer — byte-exact, CRLF preserved.
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

if (sha(ORIGINAL) !== EXPECT_SHA) {
  console.error('ABORT: index.ts sha256 mismatch BEFORE mutations:', sha(ORIGINAL));
  process.exit(2);
}
console.log('PRE-MUTATION  sha256 OK', sha(ORIGINAL));

function restore() {
  fs.writeFileSync(SRC, ORIGINAL);
  const s = sha(fs.readFileSync(SRC));
  if (s !== EXPECT_SHA) { console.error('FATAL: restore failed, sha=', s); process.exit(3); }
  return s;
}

function runSuite(p) {
  const r = spawnSync(process.execPath, ['qa/scenarios-runner/' + p], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = [...out.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/gi)];
  const m2 = [...out.matchAll(/(\d+)\/(\d+)\s+(?:passed|agree)/gi)];
  let failed = m.reduce((a, x) => a + (+x[2]), 0);
  if (m.length === 0 && m2.length > 0) failed = m2.reduce((a, x) => a + ((+x[2]) - (+x[1])), 0);
  const failLines = out.split(/\r?\n/).filter((l) => /^(FAIL|✗|\s*FAIL)/i.test(l.trim()));
  return { exit: r.status, out, failed, failLines: failLines.length, crashed: r.status !== 0 && failLines.length === 0 && failed === 0 };
}

// Each mutation: { id, kind, apply(src)->src', suites[], why }
const MUTATIONS = [
  // ---------------- A. D116 NEGATED_MENTION — COVERAGE ----------------
  { id: 'A1-coverage-remove-negation-deadend', kind: 'COVERAGE',
    why: 'Delete the D116 dead-end entirely. If no committed case fails, D116 is vacuous.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(
      /  if \(matches\.some\(\(o\) => clauses\.some\(\(c\) => c\.includes\(forMatching\(o\.label\)\)\r?\n    && NEGATED_MENTION\.test\(c\.split\(forMatching\(o\.label\)\)\.join\(' '\)\)\)\)\) return null;/,
      "  // MUTANT A1: dead-end removed") },

  { id: 'A2-limit-negation-matches-everything', kind: 'LIMIT',
    why: 'Over-broaden NEGATED_MENTION to match any character. The D116 LIMIT holds (plain name still binds) must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(/const NEGATED_MENTION = \/[^\n]*\/i;/, 'const NEGATED_MENTION = /[\\s\\S]/i;') },

  { id: 'A3-limit-drop-clause-split', kind: 'LIMIT',
    why: 'Test the WHOLE command instead of the clause. The clause-scope LIMIT hold must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(/const clauses = normalizedCommand\.split\(\/\[,\.;!\?\]\+\/\);/, 'const clauses = [normalizedCommand];') },

  { id: 'A4-limit-drop-own-label-removal', kind: 'LIMIT',
    why: 'Do NOT strip the option\'s own label before the negator test. A real name containing "no" must then disarm itself; the LIMIT hold must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(/&& NEGATED_MENTION\.test\(c\.split\(forMatching\(o\.label\)\)\.join\(' '\)\)\)\)\) return null;/, "&& NEGATED_MENTION.test(c))))) return null;") },

  // ---------------- B. D117/D118 clause-scoped negation ----------------
  { id: 'B1-coverage-negated-clause-matches-everything', kind: 'COVERAGE',
    why: 'NEGATED_CLAUSE matches every clause => nothing ever reads as a completion. Every fabrication case must fail.',
    suites: ['run15_defect_closure_contract.mjs', 'structured_claim_laundering_contract.mjs'],
    apply: (s) => s.replace(/const NEGATED_CLAUSE = \/[^\n]*\/i;/, 'const NEGATED_CLAUSE = /[\\s\\S]/i;') },

  { id: 'B2-limit-negated-clause-matches-nothing', kind: 'LIMIT',
    why: 'NEGATED_CLAUSE matches nothing => truthful negatives are destroyed again (#4905). A truthful-negative hold must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(/const NEGATED_CLAUSE = \/[^\n]*\/i;/, 'const NEGATED_CLAUSE = /$^/i;') },

  { id: 'B3-coverage-drop-clause-split-in-readsAsCompletion', kind: 'COVERAGE',
    why: 'Do not split into clauses => whole-summary negation returns (the D117 defect). The D117 cases must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(/String\(s\)\.split\(\/\[\.!\?,\\x3b\]\+\/\)\.map\(\(c\) => c\.trim\(\)\)/, 'String(s).split(/\\u0000/).map((c) => c.trim())') },

  { id: 'B4-coverage-restore-whole-summary-lookahead', kind: 'COVERAGE',
    why: 'Reinstate D112\'s whole-summary lookahead inside CONFIRMED_COMPLETION AND drop the per-clause negation. This is literally the d724d8c behaviour; the D117/D118 cases must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s
      .replace(/const CONFIRMED_COMPLETION = \/\^\\s\*confirmed\\s\*\[/, "const CONFIRMED_COMPLETION = /^\\s*confirmed\\s*[—–-]\\s*(?![^]*\\b(?:not|never|no|nothing|none|without|pending|awaiting)\\b)[^]*?(?<!\\bthe )(?<!\\ba )\\b(archived|deleted|updated|created|restored|assigned|approved|removed|completed|renamed)\\b/i; const UNUSED_CONFIRMED = /^\\s*confirmed\\s*[")
      .replace(/String\(s\)\.split\(\/\[\.!\?,\\x3b\]\+\/\)\.map\(\(c\) => c\.trim\(\)\)\.some\(\(c\) => !NEGATED_CLAUSE\.test\(c\)/, 'String(s).split(/\\u0000/).map((c) => c.trim()).some((c) => true') },

  // ---------------- C/D. D119 option drop ----------------
  { id: 'C1-coverage-remove-the-drop', kind: 'COVERAGE',
    why: 'Never drop unresolvable options. The D119/D120 cases must fail.',
    suites: ['run15_defect_closure_contract.mjs', 'run8_defect_closure_contract.mjs', 'run14_defect_closure_contract.mjs'],
    apply: (s) => s.replace(/            if \(unresolvableOptionIndexes\.length > 0\) \{/, '            if (false) {') },

  { id: 'C2-limit-drop-is-over-broad', kind: 'LIMIT',
    why: 'Drop EVERY option, resolvable or not. Suites pinning that in-context options survive must fail.',
    suites: ['run15_defect_closure_contract.mjs', 'run12_defect_closure_contract.mjs', 'run13_defect_closure_contract.mjs', 'lifecycle_evidence_and_output_persistence_contract.mjs'],
    apply: (s) => s.replace(/              if \(!canonicalKnowsIt\) unresolvableOptionIndexes\.push\(oi\);/, '              unresolvableOptionIndexes.push(oi);') },

  { id: 'C3-coverage-restore-lexical-fallback', kind: 'COVERAGE',
    why: 'Restore the D113 lexical fallback (a benign uncorroborated label survives). The D119 cases must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s
      .replace(/              o\.label = agrees \? safeLabel : derivedLabel;/, '              o.label = agrees ? safeLabel : ((canonicalKnowsIt || !safeLabel || COMPLETION_WORD.test(safeLabel)) ? derivedLabel : safeLabel);')
      .replace(/            if \(unresolvableOptionIndexes\.length > 0\) \{/, '            if (false) {') },

  { id: 'C4-coverage-canonicalKnowsIt-always-true', kind: 'COVERAGE',
    why: 'Make canonicalKnowsIt unconditionally true => nothing is ever dropped and no label is ever replaced by a typed fallback. D119/D120 cases must fail.',
    suites: ['run15_defect_closure_contract.mjs'],
    apply: (s) => s.replace(/              const canonicalKnowsIt = !!derivedLabel\r?\n                && bare\(derivedLabel\) !== bare\(typedFallback\)\r?\n                && !\/\^option \\d\+\$\/\.test\(derivedLabel\);/, '              const canonicalKnowsIt = true;') },

  // ---------------- F. D122 resolveClarificationField ----------------
  { id: 'F1-coverage-destructive-default', kind: 'COVERAGE',
    why: 'Reinstate the issue-5 P1 (absent actionType coerced to archive). issue5 must fail IF it truly executes the real function.',
    suites: ['issue5_confirmation_action_type_binding.mjs', 'sem_ai_command_source_invariants_drift_guard.mjs'],
    apply: (s) => s.replace(/  if \(!entityType \|\| !actionType\) return undefined;\r?\n  return CLARIFICATION_ENTITY_ACTION_FIELD\[entityType\]\?\.\[actionType\];/, "  if (!entityType) return undefined;\r\n  return CLARIFICATION_ENTITY_ACTION_FIELD[entityType]?.[actionType || 'archive'];") },

  { id: 'F2-coverage-map-entry-removed', kind: 'COVERAGE',
    why: 'Remove company.archive from the map. issue5 must fail if it executes the real function+map.',
    suites: ['issue5_confirmation_action_type_binding.mjs'],
    apply: (s) => s.replace(/  company: \{ archive: 'archiveCompanyIds', restore: 'restoreCompanyIds' \},/, "  company: { restore: 'restoreCompanyIds' },") },
];

const results = [];
for (const mut of MUTATIONS) {
  const src = ORIGINAL.toString('utf8');
  const mutated = mut.apply(src);
  if (mutated === src) {
    results.push({ ...mut, applied: false, verdict: 'MUTATION-DID-NOT-APPLY (harness bug or source drift)' });
    console.log(`\n### ${mut.id} [${mut.kind}]  !! MUTATION DID NOT APPLY`);
    continue;
  }
  fs.writeFileSync(SRC, Buffer.from(mutated, 'utf8'));
  const per = [];
  for (const s of mut.suites) per.push({ suite: s, ...runSuite(s) });
  const restoredSha = restore();
  const detected = per.some((p) => p.failed > 0 || p.failLines > 0 || p.exit !== 0);
  results.push({ id: mut.id, kind: mut.kind, why: mut.why, applied: true, detected,
    per: per.map((p) => ({ suite: p.suite, exit: p.exit, failed: p.failed, failLines: p.failLines, crashed: p.crashed })),
    restoredSha });
  console.log(`\n### ${mut.id} [${mut.kind}]  => ${detected ? 'DETECTED (guard is real)' : '*** SURVIVED — VACUOUS GUARD ***'}`);
  console.log(`    ${mut.why}`);
  for (const p of per) console.log(`    ${p.suite}: exit=${p.exit} parsedFailed=${p.failed} failLines=${p.failLines}${p.crashed ? ' (CRASH not assertion)' : ''}`);
  console.log(`    restored sha256 = ${restoredSha}`);
}

const finalSha = sha(fs.readFileSync(SRC));
console.log(`\nFINAL index.ts sha256 = ${finalSha}  ${finalSha === EXPECT_SHA ? 'MATCH' : '*** MISMATCH — RUN INVALID ***'}`);
const survived = results.filter((r) => r.applied && !r.detected);
const notApplied = results.filter((r) => !r.applied);
console.log(`\nMUTATION SUMMARY: ${results.length} mutations, ${survived.length} SURVIVED (vacuous), ${notApplied.length} did not apply`);
for (const s of survived) console.log(`  SURVIVED: ${s.id} — ${s.why}`);
for (const s of notApplied) console.log(`  NOT APPLIED: ${s.id}`);
fs.writeFileSync('qa/verification/scratch/v16_mutation_result.json', JSON.stringify({ finalSha, results }, null, 2));
