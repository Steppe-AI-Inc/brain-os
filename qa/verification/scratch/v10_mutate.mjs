// verifier #10 mutation runner. NEVER writes index.ts: each mutant is written to
// qa/verification/scratch/mut/index.mutant.ts, and copies of the four window suites
// (derived from qa/scenarios-runner/*.mjs with ONLY the SRC line + _gate_extract import
// path changed — verified by diff-count) are executed against it via SEM_INDEX_SRC.
// A mutant is KILLED if at least one suite exits non-zero; SURVIVED otherwise.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ORIG_PATH = 'supabase/functions/sem-ai-command/index.ts';
const orig = readFileSync(ORIG_PATH);
const origSha = createHash('sha256').update(orig).digest('hex');
const origText = orig.toString('utf8');
mkdirSync('qa/verification/scratch/mut', { recursive: true });

const SUITES = ['structured_claim_verification', 'structured_claim_laundering_contract', 'lifecycle_evidence_and_output_persistence_contract', 'run8_defect_closure_contract'];
const SRC_LINE = "const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');";
const SRC_NEW = "const SRC = process.env.SEM_INDEX_SRC ? resolve(process.cwd(), process.env.SEM_INDEX_SRC) : resolve(here, '../../supabase/functions/sem-ai-command/index.ts');";
for (const s of SUITES) {
  const t = readFileSync('qa/scenarios-runner/' + s + '.mjs', 'utf8');
  const n1 = t.split(SRC_LINE).length - 1, n2 = t.split("from './_gate_extract.mjs'").length - 1;
  if (n1 !== 1 || n2 !== 1) throw new Error('suite copy derivation failed for ' + s + ' (' + n1 + ',' + n2 + ')');
  writeFileSync('qa/verification/scratch/mut/' + s + '.mjs', t.replace(SRC_LINE, SRC_NEW).replace("from './_gate_extract.mjs'", "from '../../../scenarios-runner/_gate_extract.mjs'"));
}

// sanity: unmutated source through the copies must be all-green
function runSuites(srcPath) {
  const res = {};
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, ['qa/verification/scratch/mut/' + s + '.mjs'], { encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: srcPath, DEPLOY_GATE: '1' } });
    const outp = (r.stdout || '') + (r.stderr || '');
    const fails = outp.split('\n').filter((l) => /^(FAIL|DRIFT)\b/.test(l) || /Error:/.test(l)).map((l) => l.slice(0, 140));
    res[s] = { exit: r.status, fails };
  }
  return res;
}
const EOL = origText.includes('\r\n') ? '\r\n' : '\n';
const IND = ' '.repeat(10);

// [id, description, find (string or RegExp), replace, expectation]
const TERMS = ['!', ';', ':', '…', '。', '！', '？', '—'];
const MUTS = [
  ['M01', 'D68: drop the groundedOutcomeThisTurn arm of structuredProseDrift', 'const structuredProseDrift = unaccountedCompletionProse && (rawClaims !== null || groundedOutcomeThisTurn);', 'const structuredProseDrift = unaccountedCompletionProse && (rawClaims !== null);', 'KILL (D68)'],
  ['M02', 'D68: remove the honest non-empty floor', 'if (result.summary.length === 0) {', 'if (false) {', 'expect SURVIVE (no test renders an all-gated re-render)'],
  ...TERMS.map((c, i) => ['M03.' + (i + 1), 'D69: drop terminator ' + JSON.stringify(c), `ch === '${c}' || `, '', c === ';' ? 'KILL (D69)' : 'expect SURVIVE?']),
  ['M03.9', 'D69: drop the newline terminator', ` || ch === '\\n') { cut = k; break; }`, `) { cut = k; break; }`, 'KILL (D69b)'],
  ['M04', 'D70: remove the abbreviation/decimal guard (always cut at ".")', new RegExp('if \\(next !== undefined && /\\[a-z0-9\\]/\\.test\\(next\\)\\) continue;[^\\r\\n]*'), '', 'KILL (D70/D70b)'],
  ['M05', 'D70: widen the guard to any letter (skip uppercase continuations too)', '/[a-z0-9]/.test(next)', '/[a-zA-Z0-9]/.test(next)', 'KILL (D61 present tense)'],
  ['M06', 'D69c: remove the belt over the surviving question', 'if (PAST_COMPLETION_CLAIM_PATTERN.test(q)) return null;', '', 'KILL (D69c)'],
  ['M07', 'question channel: drop the "must contain ?" rule', "if (!t.includes('?')) return null; // the question channel carries questions", '', 'expect SURVIVE?'],
  ['M08', 'question channel: drop the future-promise refusal', 'if (FUTURE_PROMISE_IN_QUESTION.test(q)) return null;', '', 'KILL (D61 future promise)'],
  ['M09', 'D74: safeDisplayLabel drops the uuid scrub', 'if (UUID_IN_TEXT.test(label)) return null;', '', 'KILL (D74b)'],
  ['M10', 'D74: safeDisplayLabel drops the length bound', "if (label.length > 80) label = label.slice(0, 77) + '…';", '', 'expect SURVIVE?'],
  ['M11', 'D74: safeDisplayLabel drops the assertion collapse', 'if (PAST_COMPLETION_CLAIM_PATTERN.test(label)) return null;', '', 'KILL (D74)'],
  ['M12', 'D74: canonical-name arm bypasses safeDisplayLabel', 'const label = safeDisplayLabel(typeof canonical', 'const label = ((x) => x)(typeof canonical', 'expect SURVIVE? (canonical arm untested)'],
  ['M13', 'D74: empty/whitespace label not refused', 'if (label.length === 0) return null;', '', 'expect SURVIVE?'],
  ['M14', 'D73: flag site 1 (summary/question) never set', 'if (paObj.summary !== beforeSummary || paObj.question !== beforeQuestion) pendingActionGatingChanged = true;', '', 'expect SURVIVE (flag unobserved)'],
  ['M15', 'D73: flag site 2 (option label) never set', 'if (o.label !== beforeLabel) pendingActionGatingChanged = true;', '', 'expect SURVIVE (flag unobserved)'],
  ['M16', 'D73: flag site 3 (arrays) never set', 'if ((Array.isArray(result.questions) ? result.questions.length : 0) !== envelopeQuestions.length', 'if (false && (Array.isArray(result.questions) ? result.questions.length : 0) !== envelopeQuestions.length', 'expect SURVIVE (flag unobserved)'],
  ['M17', 'D73: flag removed from the persist condition', '|| claimsPastCompletionWithNoGrounding || pendingActionGatingChanged) {', '|| claimsPastCompletionWithNoGrounding) {', 'KILL (P8)'],
  ['M18', 'D72: fallback uses "option N" instead of the derived canonical reference', "? displayName(typeof o.entityType === 'string' ? o.entityType : 'record', o.id) : `option ${oi + 1}`", '? `option ${oi + 1}` : `option ${oi + 1}`', 'expect SURVIVE (D72 only asserts non-blank)'],
  ['M19', 'D72: fallback blanks the label again', "|| (typeof o.id === 'string' && o.id ? displayName(typeof o.entityType === 'string' ? o.entityType : 'record', o.id) : `option ${oi + 1}`);", "|| '';", 'KILL (D72)'],
  ['M20', 'D72: trailing-punctuation repair removed', "t = t.replace(/[.!?\\s]+$/, '').trim();", '', 'KILL (D72b)'],
  ['M21', 'D72: option-label truncation removed', "if (t.length > 80) t = t.slice(0, 77) + '…';", '', 'expect SURVIVE?'],
  ['M22', 'D72: post-repair assertion test removed in safeOptionLabel', new RegExp("(t = t\\.slice\\(0, 77\\) \\+ '…';)[^\\r\\n]*\\r?\\n\\s*if \\(PAST_COMPLETION_CLAIM_PATTERN\\.test\\(t\\)\\) return null;"), '$1', 'expect SURVIVE (redundant with safeProseFragment)'],
  // run8 guards re-checked (do not trust the prior session's mutation claims)
  ['M23', 'D58: evidence no longer arms the rewrite', 'const rewriteFromStructure = hasRejectedClaims || hasMutationShapedClaim || hasConfirmedMutationEvidenceInWindow || structuredProseDrift;', 'const rewriteFromStructure = hasRejectedClaims || hasMutationShapedClaim || structuredProseDrift;', 'KILL (D58a)'],
  ['M24', 'D58b3: drift arm dropped entirely', 'const rewriteFromStructure = hasRejectedClaims || hasMutationShapedClaim || hasConfirmedMutationEvidenceInWindow || structuredProseDrift;', 'const rewriteFromStructure = hasRejectedClaims || hasMutationShapedClaim || hasConfirmedMutationEvidenceInWindow;', 'KILL (D58b3/D68)'],
  ['M25', 'D59: re-add the pendingAction short-circuit to the legacy gate', '&& !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan' + EOL + IND + '&& LEGACY_PAST_COMPLETION.test(String(result.summary || \'\'));', '&& !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan && !result.pendingAction' + EOL + IND + '&& LEGACY_PAST_COMPLETION.test(String(result.summary || \'\'));', 'KILL (D59)'],
  ['M26', 'D60: in-place pendingAction summary gating removed', 'paObj.summary = safePendingSummary(paObj.summary);', '', 'KILL (D60)'],
  ['M27', 'D60: in-place pendingAction question gating removed', 'paObj.question = safeQuestionFragment(paObj.question);', '', 'KILL (D73 check)'],
  ['M28', 'D60: safePendingSummary completion-word refusal removed', 'if (COMPLETION_WORD.test(t)) return null;', '', 'KILL (D60)'],
  ['M29', 'D62: render the model expectedValue instead of the canonical actual', '`Actually, ${subject}’s ${predicate} is ${safeValueText(actual)} in the current records.`', '`Actually, ${subject}’s ${predicate} is not ${safeValueText(c.expectedValue)} in the current records.`', 'KILL (D62)'],
  ['M30', 'D62b: absent predicate is contradicted again', "if (!Object.prototype.hasOwnProperty.call(row, predicate)) return { verdict: 'unknown', reason: 'predicate not present in the canonical read' };", '', 'KILL (D62b)'],
  ['M31', 'D64: unclaimed lines dropped on fully-deterministic turns', '? [deterministicPrefix, ...unclaimedNotRestated, ...rejectedLines, ...envelopeQuestions, promptWithOptions]', '? [deterministicPrefix, ...rejectedLines, ...envelopeQuestions, promptWithOptions]', 'KILL (D64)'],
  ['M32', 'D65: id-less create claim fold removed', "if ((c.type === 'mutation_result' || c.type === 'assignment') && !c.resourceId && typeof c.action === 'string') {", 'if (false) {', 'KILL (D65)'],
  ['M33', 'D67: runtime labels ignored', "const created = runtimeLabels.get(resourceType + '|' + id);", 'const created = undefined;', 'KILL (D58a2/D74c)'],
  ['M34', 'D75/D63: evidence site commented out with a BLOCK comment', "if (r.reason === 'employment_ended') recordExecution('person', 'end_employment', id, true)", "/* if (r.reason === 'employment_ended') recordExecution('person', 'end_employment', id, true) */", 'KILL (Section S)'],
  ['M35', 'D75/D63: evidence site guard weakened (records on any reason)', "if (r.reason === 'employment_ended') recordExecution('person', 'end_employment', id, true)", "recordExecution('person', 'end_employment', id, true)", 'KILL (Section S guarded)'],
  ['M36', 'D75: evidence site neutralised via a trailing comment', "if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'archive', id, true)", "if (r.changed === true && r.postconditionPassed === true) ; // recordExecution('company', 'archive', id, true)", 'KILL (Section E + S)'],
  ['M37', 'D61: structural cut disabled (keep whole text)', "const q = t.slice(cut + 1).replace(/^[\\s*_>#•-]+/, '').trim();", "const q = t.replace(/^[\\s*_>#•-]+/, '').trim();", 'KILL (D61)'],
  ['M38', 'F5/D54: safeValueText uuid scrub removed', "if (UUID_IN_TEXT.test(s)) return 'the referenced record';", '', 'KILL (D54/X7)'],
];

const baseline = runSuites(ORIG_PATH);
console.log('BASELINE via suite copies (unmutated):', JSON.stringify(Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, v.exit]))));
if (!Object.values(baseline).every((v) => v.exit === 0)) { console.log(JSON.stringify(baseline, null, 1)); throw new Error('baseline not green through the suite copies — abort'); }

const report = [];
for (const [id, desc, find, repl, expectation] of MUTS) {
  let count, mutated;
  if (find instanceof RegExp) {
    const g = new RegExp(find.source, find.flags.includes('g') ? find.flags : find.flags + 'g');
    count = (origText.match(g) || []).length;
    mutated = origText.replace(find, repl);
  } else {
    count = origText.split(find).length - 1;
    mutated = origText.replace(find, repl);
  }
  if (count !== 1) { report.push({ id, desc, result: 'INVALID MUTANT (find matched ' + count + 'x)', expectation }); console.log(`${id} INVALID (${count} matches) ${desc}`); continue; }
  if (mutated === origText) { report.push({ id, desc, result: 'INVALID MUTANT (no change)', expectation }); console.log(`${id} INVALID (no change) ${desc}`); continue; }
  const mpath = 'qa/verification/scratch/mut/index.mutant.ts';
  writeFileSync(mpath, mutated);
  const res = runSuites(mpath);
  const killers = Object.entries(res).filter(([, v]) => v.exit !== 0).map(([k, v]) => k + ': ' + (v.fails.slice(0, 3).join(' | ') || 'exit ' + v.exit));
  const verdict = killers.length ? 'KILLED' : 'SURVIVED';
  report.push({ id, desc, result: verdict, expectation, killed_by: killers });
  console.log(`${id} ${verdict.padEnd(8)} [${expectation}] ${desc}` + (killers.length ? '\n      ' + killers.join('\n      ') : ''));
}
const afterSha = createHash('sha256').update(readFileSync(ORIG_PATH)).digest('hex');
console.log('\nindex.ts sha256 before ' + origSha + '\nindex.ts sha256 after  ' + afterSha + '\nUNTOUCHED: ' + (origSha === afterSha));
writeFileSync('qa/verification/scratch/v10_mutation_report.json', JSON.stringify({ index_ts_sha256_before: origSha, index_ts_sha256_after: afterSha, untouched: origSha === afterSha, baseline_exits: Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, v.exit])), mutants: report }, null, 1));
console.log(`SUMMARY: ${report.filter((r) => r.result === 'KILLED').length} killed, ${report.filter((r) => r.result === 'SURVIVED').length} survived, ${report.filter((r) => r.result.startsWith('INVALID')).length} invalid of ${report.length}`);
