// verifier #11 attempt 2 — MUTATION BATTERY part 2: the mutants whose anchors failed in
// part 1 because the working-tree file is CRLF (multi-line anchors need \r\n) or because
// the indentation guess was wrong. Same always-restore + sha-assert discipline.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const BASELINE_SHA = '66fa821d7893248236e3d1626fa321c7ca9872957c0d50520b8067eec13ddded';
const original = readFileSync(SRC);
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (sha(original) !== BASELINE_SHA) { console.log('ABORT baseline sha ' + sha(original)); process.exit(2); }
const text = original.toString('utf8');
const N = '\r\n';

const MUTANTS = [
  ['M05 label completion refusal disabled',
    'safeOptionLabel never inspects completion vocabulary (D78 / D72)',
    'if (COMPLETION_WORD.test(t)) {' + N + '            const NAME_CONNECTOR',
    'if (false) {' + N + '            const NAME_CONNECTOR',
    ['run10_defect_closure_contract', 'run8_defect_closure_contract', 'structured_claim_verification']],
  ['M08 quoted-name rendering removed (erase instead)',
    'safeDisplayLabel collapses assertion-shaped names instead of quoting them (D79)',
    'if (PAST_COMPLETION_CLAIM_PATTERN.test(label) && /(\\band\\b|,|;)/i.test(label)) return null;' + N + '            return `“${label}”`;',
    'return null;',
    ['run10_defect_closure_contract', 'run8_defect_closure_contract', 'structured_claim_verification']],
  ['M08b quoted-name rendering unquoted',
    'assertion-shaped name renders BARE (no quotes) — does anything notice the framing?',
    'return `“${label}”`;',
    'return label;',
    ['run10_defect_closure_contract', 'run8_defect_closure_contract', 'structured_claim_verification', 'structured_claim_laundering_contract', 'lifecycle_evidence_and_output_persistence_contract']],
  ['M10 D81 structural arm removed',
    'drift arm keys on bare unaccounted prose again (floors truthful history)',
    'const structuredProseDrift = unaccountedCompletionProse' + N + '          && (rawClaims !== null || deterministicPrefix.length > 0 || claimExecutionEvidence.length > 0);',
    'const structuredProseDrift = unaccountedCompletionProse;',
    ['run10_defect_closure_contract']],
  ['M11 D81 arm always off',
    'structured prose drift never fires',
    'const structuredProseDrift = unaccountedCompletionProse' + N + '          && (rawClaims !== null || deterministicPrefix.length > 0 || claimExecutionEvidence.length > 0);',
    'const structuredProseDrift = false;',
    ['run10_defect_closure_contract', 'structured_claim_verification', 'structured_claim_laundering_contract']],
  ['M15 EXECUTION_IN_PROGRESS dropped from the legacy (ungrounded) arm',
    'progressive fabrication vocabulary removed from legacyProseFallback (E-multi)',
    "&& (LEGACY_PAST_COMPLETION.test(String(result.summary || '')) || EXECUTION_IN_PROGRESS.test(String(result.summary || '')));" + N + N + '        // run7/D52',
    "&& (LEGACY_PAST_COMPLETION.test(String(result.summary || '')));" + N + N + '        // run7/D52',
    ['run10_defect_closure_contract']],
  ['M15b EXECUTION_IN_PROGRESS dropped from the structured arm',
    'progressive vocabulary removed from unaccountedCompletionProse',
    "const unaccountedCompletionProse = !hasSupportedMutationClaim" + N + "          && (LEGACY_PAST_COMPLETION.test(String(result.summary || '')) || EXECUTION_IN_PROGRESS.test(String(result.summary || '')));",
    "const unaccountedCompletionProse = !hasSupportedMutationClaim" + N + "          && (LEGACY_PAST_COMPLETION.test(String(result.summary || '')));",
    ['run10_defect_closure_contract']],
  ['M16 command-first regression',
    'reintroduce a bare top-level `command` key as the FIRST pack key',
    '  const pack = { continuity,',
    '  const pack = { command, continuity,',
    ['current_turn_and_continuity_contract']],
  ['M16b continuity key removed from the pack head',
    'pack no longer leads with continuity',
    '  const pack = { continuity,',
    '  const pack = { companiesFirst: 1, continuity,',
    ['current_turn_and_continuity_contract']],
];

const results = [];
function runSuites(suites) {
  const out = {};
  for (const s of suites) {
    const r = spawnSync(process.execPath, ['qa/scenarios-runner/' + s + '.mjs'],
      { encoding: 'utf8', env: { ...process.env, DEPLOY_GATE: '1' }, maxBuffer: 64 * 1024 * 1024 });
    const txt = (r.stdout || '') + (r.stderr || '');
    out[s] = { exit: r.status, fails: (txt.match(/^FAIL /gm) || []).length,
      failLines: (txt.match(/^FAIL .*$/gm) || []).slice(0, 5) };
  }
  return out;
}

try {
  for (const [id, desc, find, replace, suites] of MUTANTS) {
    const rec = { id, desc };
    results.push(rec);
    if (!text.includes(find)) { rec.error = 'ANCHOR NOT FOUND'; console.log('ERROR    ' + id + ' anchor not found'); continue; }
    rec.anchorOccurrences = text.split(find).length - 1;
    writeFileSync(SRC, text.replace(find, replace), 'utf8');
    rec.suites = runSuites(suites);
    writeFileSync(SRC, original);
    const nowSha = sha(readFileSync(SRC));
    rec.restoreShaOk = nowSha === BASELINE_SHA;
    if (!rec.restoreShaOk) { console.log('FATAL restore mismatch after ' + id); break; }
    rec.killed = Object.values(rec.suites).some((s) => s.exit !== 0);
    console.log((rec.killed ? 'KILLED   ' : 'SURVIVED ') + id + '  — ' + desc);
    for (const [s, v] of Object.entries(rec.suites)) {
      console.log('           ' + s + ' exit=' + v.exit + ' FAILlines=' + v.fails);
      for (const l of v.failLines) console.log('             > ' + l.slice(0, 145));
    }
  }
} finally {
  writeFileSync(SRC, original);
  const f = sha(readFileSync(SRC));
  console.log('\nFINAL RESTORE sha256 ' + f + '  MATCH=' + (f === BASELINE_SHA));
  writeFileSync('qa/verification/scratch/v11a_mutation_report2.json',
    JSON.stringify({ baseline_sha: BASELINE_SHA, final_sha: f, ran_at: new Date().toISOString(), results }, null, 1));
  console.log('SURVIVORS: ' + (results.filter((r) => r.killed === false).map((r) => r.id).join(' | ') || 'none'));
  console.log('ERRORS: ' + (results.filter((r) => r.error).map((r) => r.id).join(' | ') || 'none'));
}
