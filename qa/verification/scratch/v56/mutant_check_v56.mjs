// VERIFIER #56 — do the CONTRACT rows of v56_regression_additions.mjs kill the mutants that survived
// the committed battery (m10, m12, m13), and does company_ref_no_bare_name_join.mjs kill a FAITHFUL
// m6 (a bare `companies(name)` join, not the canonical `companies(name, status)` literal)?
// Applies each mutant in place, runs the suite, restores byte-identically, asserts sha before/after.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const IDX = resolve('supabase/functions/sem-ai-command/index.ts');
const PEOPLE = resolve('web/lib/data/people.ts');
const REQUIRED_SHA = '4f5c85a920b77aa4d7ed9d04b19b16c00f0a78623eb937319f983e140994c01e';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const ORIG = { [IDX]: readFileSync(IDX), [PEOPLE]: readFileSync(PEOPLE) };
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch BEFORE: ' + sha(IDX));
const origSha = Object.fromEntries(Object.entries(ORIG).map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')]));
function mustReplace(text, from, to, label) { const i = text.indexOf(from); if (i === -1) throw new Error('anchor not found for ' + label); return text.slice(0, i) + to + text.slice(i + from.length); }
const SUITE = resolve('qa/verification/proposed/v56_regression_additions.mjs');
const JOIN_GUARD = resolve('qa/scenarios-runner/company_ref_no_bare_name_join.mjs');
function contractFailures(out) { const m = out.match(/CONTRACT failures: (\d+)/); return m ? +m[1] : null; }
function restoreAll() { for (const [p, buf] of Object.entries(ORIG)) writeFileSync(p, buf); for (const [p, h] of Object.entries(origSha)) if (sha(p) !== h) throw new Error('RESTORE FAILED ' + p); }
process.on('exit', () => { try { restoreAll(); } catch (e) { console.error(String(e)); } });

// baseline: CONTRACT failures on the unmutated candidate must be 0
const base = spawnSync(process.execPath, [SUITE], { encoding: 'utf8', timeout: 240000 });
const baseOut = (base.stdout || '') + (base.stderr || '');
const baseCF = contractFailures(baseOut);
console.log('baseline (unmutated): exit ' + base.status + ', ' + (baseOut.match(/v56_regression_additions: .*/) || [''])[0]);
if (baseCF !== 0) throw new Error('baseline CONTRACT failures must be 0, got ' + baseCF);

const MUTANTS = [
  { id: 'm10_receipt_skips_attempted', file: IDX, apply: (t) => mustReplace(t, 'if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0', 'if (requestedIntent !== null && claimExecutionEvidence.length === 0 && lifecycleReports.length === 0', 'm10') },
  { id: 'm12_silent_nonexistent_id', file: IDX, apply: (t) => mustReplace(t, "for (const id of ids) if (!resolved.has(id)) lifecycleUnresolvedLines.push(", "for (const id of ids) if (false) lifecycleUnresolvedLines.push(", 'm12') },
  { id: 'm13_no_status_preference', file: IDX, apply: (t) => mustReplace(t, 'const pick = preferred.length > 0 ? preferred : rows;', 'const pick = rows;', 'm13') },
  { id: 'm1_delete_receipt_block', file: IDX, apply: (t) => mustReplace(t, 'if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt && !hasMutationShapedClaim && !hasRejectedClaims) {', 'if (false) {', 'm1') },
  { id: 'm2b_restore_pendingAction_skip_receipt', file: IDX, apply: (t) => mustReplace(t, 'if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt', 'if (requestedIntent !== null && !result.pendingAction && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt', 'm2b') },
];
const results = {};
for (const m of MUTANTS) {
  const before = readFileSync(m.file).toString('utf8');
  const mutated = m.apply(before);
  if (mutated === before) throw new Error('no effect: ' + m.id);
  writeFileSync(m.file, mutated);
  const r = spawnSync(process.execPath, [SUITE], { encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  restoreAll();
  const cf = contractFailures(out);
  results[m.id] = { contractFailures: cf, killed: cf !== null && cf > 0, newFails: out.split('\n').filter((l) => /^FAIL\s+\[CONTRACT\]/.test(l)).slice(0, 4) };
  console.log((results[m.id].killed ? 'KILLED   ' : 'SURVIVED ') + m.id + '  CONTRACT failures=' + cf + (results[m.id].newFails.length ? '\n   ' + results[m.id].newFails.join('\n   ') : ''));
}
// faithful m6: a bare companies(name) join in a real web data file
{
  const before = readFileSync(PEOPLE).toString('utf8');
  const mutated = before + "\nexport async function __v56_probe(supabase: any) { return supabase.from('people').select('id, companies(name)'); }\n";
  writeFileSync(PEOPLE, mutated);
  const r = spawnSync(process.execPath, [JOIN_GUARD], { encoding: 'utf8', timeout: 240000 });
  restoreAll();
  const out = (r.stdout || '') + (r.stderr || '');
  results.m6b_bare_companies_name_join = { exit: r.status, killed: r.status !== 0, tail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
  console.log((r.status !== 0 ? 'KILLED   ' : 'SURVIVED ') + 'm6b_bare_companies_name_join (faithful) exit=' + r.status + '  ' + results.m6b_bare_companies_name_join.tail);
}
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch AFTER');
writeFileSync(resolve('qa/verification/scratch/v56/mutant_check_v56.json'), JSON.stringify(results, null, 1));
console.log('\nFINAL index.ts sha256 ' + sha(IDX));
