// VERIFIER #57 — Steps 2D / 2F / 2G / 2B-static: collection envelopes, receipt==ledger extras, postcondition sites, intent-derivation purity.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';
import { src, ROOT, run, CTX } from './v57_lib.mjs';
const rows = []; const check = (name, ok, detail) => { rows.push({ name, ok, detail: ok ? undefined : detail }); console.log((ok ? 'OK   ' : 'FAIL ') + name + (ok ? '' : '\n       ' + detail)); };
const notes = [];

// ---- 2D: the REAL envelope helper executed
{
  const envSlice = stripTS(src.slice(src.indexOf('const envelope = (res'), src.indexOf('const collections = {')));
  const envelope = new Function(envSlice + '\n; return envelope;')();
  const e1 = envelope({ data: [1, 2, 3], count: 40 });
  check('2D envelope: shown from rows, total from count, truncated = total > shown', e1.shown === 3 && e1.total === 40 && e1.truncated === true, JSON.stringify(e1));
  const e2 = envelope({ data: [1, 2, 3], count: 3 });
  check('2D envelope: not truncated when total == shown', e2.truncated === false, JSON.stringify(e2));
  const e3 = envelope({ data: [1, 2, 3], count: null });
  check('2D envelope: missing count -> total null, truncated null (never array length)', e3.total === null && e3.truncated === null, JSON.stringify(e3));
  const e4 = envelope({ data: [1, 2, 3], count: undefined });
  check('2D envelope: undefined count -> total null', e4.total === null, JSON.stringify(e4));
  const e5 = envelope({ data: [1, 2], count: 7 }, 9, 'plus named');
  check('2D envelope: shownOverride + scope carried', e5.shown === 9 && e5.total === 7 && e5.truncated === false && e5.scope === 'plus named', JSON.stringify(e5));
  const e6 = envelope(null);
  check('2D envelope: null result -> shown 0, total null', e6.shown === 0 && e6.total === null, JSON.stringify(e6));
  // pack arrays vs collections keys, dynamically
  const packLine = src.slice(src.indexOf('\n  const pack = {'), src.indexOf('};', src.indexOf('\n  const pack = {')) + 2);
  const collText = src.slice(src.indexOf('\n  const collections = {'), src.indexOf('\n  };', src.indexOf('\n  const collections = {')));
  const arrayKeys = [...packLine.matchAll(/(\w+):\s*(?:pack\w+|merged\w+|\w+\.data\s*\|\|\s*\[\]|conversationHistory|factoryWorkOrders)(?=[,\s}])/g)].map((m) => m[1]);
  const missing = arrayKeys.filter((k) => !new RegExp('(^|[\\s{,])' + k + ':\\s*(envelope\\(|\\{)').test(collText));
  check('2D every array in the pack has a collections envelope (' + arrayKeys.length + ' arrays)', missing.length === 0 && arrayKeys.length >= 20, 'missing: ' + missing.join(','));
  const capped = [...src.slice(src.indexOf('] = await Promise.all(['), src.indexOf('conversationCountQuery,\n  ]);')).matchAll(/supabase\.from\('(\w+)'\)\.select\(([^)]*)\)[^\n]*\.limit\(\d+\)/g)];
  const noCount = capped.filter((m) => !/count: 'exact'/.test(m[2])).map((m) => m[1]);
  check('2D every capped query carries count exact (' + capped.length + ' capped)', noCount.length === 0 && capped.length >= 20, 'no count: ' + noCount.join(','));
  check('2D companies split active/archived, both newest first', /from\('companies'\)[^\n]*\.neq\('status', 'archived'\)\.order\('updated_at', \{ ascending: false \}\)\.limit\(12\)/.test(src) && /from\('companies'\)[^\n]*\.eq\('status', 'archived'\)\.order\('updated_at', \{ ascending: false \}\)\.limit\(12\)/.test(src));
  // legacy counts fallback to array length (OTM §4.3 literal violation when the count query errors)
  const countsText = src.slice(src.indexOf('  const counts = {'), src.indexOf('  };', src.indexOf('  const counts = {')));
  const fallbacks = (countsText.match(/\?\? \([a-zA-Z]+\.data\|\|\[\]\)\.length/g) || []).length;
  notes.push({ id: '2D-counts-array-length-fallback', fallbacks, promptUsesCounts: /context\.counts/.test(src), promptUsesCollections: /context\.collections\.<name>\.total/.test(src) });
  console.log(`NOTE 2D legacy context.counts: ${fallbacks} totals fall back to array length when the count query returns null (prompt still references context.counts: ${/context\.counts/.test(src)})`);
}

// ---- 2F: receipt == ledger, own cases through the real company loop lines
{
  const reasonText = new Function('return ' + src.match(/const reasonText: Record<string, string> = (\{[\s\S]*?\});/)[1])();
  for (const [reason, want] of [['archived', 'archived'], ['restored', 'restored'], ['already_archived', 'was already archived'], ['already_active', 'was already active'], ['not_found', 'could not be found'], ['denied', 'you do not have permission to archive/restore this company']]) check(`2F company reason ${reason} -> "${want}"`, reasonText[reason] === want);
  check('2F an unknown backend reason is echoed verbatim, never mapped to success', !('foreign_org' in reasonText) && /reasonText\[String\(r\.reason\)\] \|\| String\(r\.reason\)/.test(src));
  const REPORT_SLICE = stripTS(src.slice(src.indexOf('const reassignmentEntries = createPersonAssignmentsFiltered.filter((a) => a.personId !== null);'), src.indexOf("            }).join(' ')\n          : null;") + "            }).join(' ')\n          : null;".length));
  const render = new Function('createPersonAssignmentsFiltered', 'createdPersonAssignments', 'personNameById', 'companyNameById', 'contextPack', REPORT_SLICE + '\n; return personAssignmentReport;');
  const P = 'pppppppp-1111-1111-1111-111111111111', M1 = 'mmmmmmmm-1111-1111-1111-111111111111', M2 = 'mmmmmmmm-2222-2222-2222-222222222222', C1 = 'cccccccc-1111-1111-1111-111111111111', C2 = 'cccccccc-2222-2222-2222-222222222222';
  const names = new Map([[P, 'Alice'], [M1, 'Bob'], [M2, 'Carol']]); const companies = new Map([[C1, 'Acme'], [C2, 'Beta Corp']]);
  const current = { person_id: P, legal_employer_company_id: C1, operating_company_id: C1, manager_person_id: M1, state: 'current' };
  const r1 = render([{ personId: P, legalEmployerCompanyId: C1, operatingCompanyId: C1, managerPersonId: null }], [{ id: 'x' }], names, companies, { personAssignments: [current] });
  check('2F clearing the manager (null) renders as a manager change, not a company move', !/reassigned to/.test(r1 || ''), String(r1));
  notes.push({ id: '2F-clear-manager-receipt', r1 });
  const r2 = render([{ personId: P, legalEmployerCompanyId: C2, operatingCompanyId: C1, managerPersonId: M1 }], [{ id: 'x' }], names, companies, { personAssignments: [current] });
  check('2F legal employer changes, operating stays: receipt names both and no manager line', /Legal employer: Beta Corp\. Operating company: Acme\./.test(r2 || '') && !/manager set to/.test(r2 || ''), String(r2));
  const r3 = render([{ personId: P, legalEmployerCompanyId: C1, operatingCompanyId: C1, managerPersonId: M2 }, { personId: P, legalEmployerCompanyId: C2, operatingCompanyId: C2, managerPersonId: M2 }], [{ id: 'x' }, { id: 'y' }], names, companies, { personAssignments: [current] });
  check('2F two entries, both succeeded: two receipts', (r3 || '').split('**Alice').length - 1 >= 2, String(r3));
}

// ---- 2G: every recordExecution(..., true) literal site, with its gate, listed for the report
{
  const lines = src.split('\n'); const sites = [];
  lines.forEach((line, i) => { if (/recordExecution\(/.test(line) && !/const recordExecution/.test(line) && !/^\s*\/\//.test(line) && /,\s*true\s*[,)]/.test(line)) sites.push({ line: i + 1, code: line.trim().slice(0, 150), gate: lines.slice(Math.max(0, i - 4), i).map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).slice(-2).join(' ⏎ ').slice(0, 220) }); });
  notes.push({ id: '2G-literal-true-sites', count: sites.length, sites });
  console.log(`2G literal-true recordExecution sites: ${sites.length}`);
  for (const s of sites) console.log(`   :${s.line} ${s.code}\n        gate: ${s.gate}`);
  check('2G recordExecution writes postcondition_verified: postconditionPassed', /postcondition_verified: postconditionPassed/.test(src));
  check('2G create family (RPC) re-read under RLS before recording', /verifyRowsExist\('tasks', createdTasks\.map\(idOf\)\)/.test(src) && /const ok = typeof id === 'string' && seen\.has\(id\);/.test(src));
  check('2G deleted tasks: postcondition is the row being GONE', /const gone = typeof id === 'string' && !deletedTasksStillPresent\.has\(id\)/.test(src));
  check('2G task/goal loops: evidence only on changed===true (RPC always returns postconditionPassed)', /r\.changed === true && r\.postconditionPassed !== false\) recordExecution\('task', 'archive'/.test(src));
  check('2G company loops: evidence only on changed===true && postconditionPassed===true', /r\.changed === true && r\.postconditionPassed === true\) recordExecution\('company', 'archive'/.test(src) && /r\.changed === true && r\.postconditionPassed === true\) recordExecution\('company', 'restore'/.test(src));
  // dynamic: a postconditionPassed=false envelope can never support a claim (already in receipt matrix) — plus executedVerifiedCount counts only passed
  const o = run({ command: 'archive ACME', claims: null, summary: 'x', evidence: [{ resourceType: 'company', action: 'archive', id: CTX.companies[0].id, postconditionPassed: false, executed: true, error: 'postcondition_not_confirmed' }, { resourceType: 'company', action: 'archive', id: CTX.companies[0].id, postconditionPassed: false, executed: false, error: 'denied' }] });
  check('2G executedOperationCount counts only postcondition-passed envelopes', o.verdict.executedOperationCount === 0 && o.verdict.attemptedOperationCount === 2 && /No change was made/.test(o.summary), JSON.stringify(o.verdict) + ' ' + o.summary);
}

// ---- 2B static: intent derivation reads only request-side inputs
{
  const derivation = src.slice(src.indexOf('const MUTATION_ARRAY_FIELDS'), src.indexOf('const executedVerifiedCount'));
  const forbidden = ['result.summary', 'readsAsCompletion', 'pendingAction', 'claimExecutionEvidence', 'lifecycleReports', 'factLines', 'deterministicPrefix', 'verifiedClaims', 'rejectedClaims', 'PAST_COMPLETION', 'COMPLETION_WORD', 'contextPack'];
  const hits = forbidden.filter((f) => derivation.includes(f));
  check('2B intent derivation references no response-side or belt input', hits.length === 0, 'found: ' + hits.join(','));
  const reads = [...derivation.matchAll(/resultRecord(?:\.(\w+)|\[(\w+)\])/g)].map((m) => m[1] || m[2]);
  check('2B the only model fields read are requestIntent, the action arrays and activateAiProviderId', reads.every((r) => ['requestIntent', 'f', 'activateAiProviderId'].includes(r)), JSON.stringify([...new Set(reads)]));
  check('2B the final intent is the request-side derivation alone (belt never decides)', /const requestedIntent: MutationIntent \| null = requestedIntentPrimary;/.test(src));
  // dynamic purity: same command, wildly different replies -> identical intent
  for (const c of ['archive ACME', 'what is ACME?', 'draft a memo on fire safety', 'yes', 'ACME-г архивла']) {
    const a = run({ command: c, summary: 'ACME archived.' }).intent, b = run({ command: c, summary: 'Nothing happened. Shall I?', pendingAction: { kind: 'open_question', question: 'Shall I?' } }).intent, d = run({ command: c, summary: 'ACME will be archived tomorrow.', evidence: [] }).intent, e = run({ command: c, summary: 'Archiving ACME now.', claims: [] }).intent;
    check('2B intent depends on the request only: ' + JSON.stringify(c), [b, d, e].every((x) => JSON.stringify(x) === JSON.stringify(a)), JSON.stringify([a, b, d, e]));
  }
}
let pass = 0; const fails = []; for (const r of rows) { if (r.ok) pass++; else fails.push(r); }
console.log(`\nv57_misc: ${pass} passed, ${fails.length} failed`);
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/misc.json'), JSON.stringify({ pass, fails, notes }, null, 1));
process.exit(fails.length ? 1 : 0);
