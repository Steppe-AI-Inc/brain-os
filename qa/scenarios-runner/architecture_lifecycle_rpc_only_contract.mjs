#!/usr/bin/env node
// ARCHITECTURE CONTRACT — one product operation per lifecycle transition
// (governance/CANONICAL_WORK_CONTRACT.md §2-§3).
//
//   * no raw status UPDATE into or out of 'archived' under web/lib/data (the DB trigger would
//     reject it, but a wrapper that tried would be a duplicated operation);
//   * every archive/restore/end-employment wrapper goes through callLifecycleRpc — no per-entity
//     reimplementation of the RPC result reading (DUPLICATED_OPERATION defect class);
//   * callLifecycleRpc admits success only on changed && postconditionPassed and renders
//     already_* as a truthful no-op;
//   * the Edge executor calls the same RPCs and resolves company targets server-side across
//     every status, never by context-window membership (BUG-014).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// 1. No raw archived-status writes under web/lib/data.
const dataDir = resolve(ROOT, 'web/lib/data');
const raw = [];
for (const name of readdirSync(dataDir)) {
  const p = join(dataDir, name);
  if (statSync(p).isDirectory() || !/\.ts$/.test(name)) continue;
  const t = readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  if (/\.update\(\{[^}]*status:\s*["']archived["']/.test(t)) raw.push(name);
}
check('no raw status UPDATE into archived under web/lib/data', raw.length === 0, raw.join(', '));

// 2. Every lifecycle wrapper goes through callLifecycleRpc.
const WRAPPERS = [
  ['web/lib/data/companies.ts', ['archive_company', 'restore_company']],
  ['web/lib/data/tasks.ts', ['archive_task', 'restore_task']],
  ['web/lib/data/goals.ts', ['archive_goal', 'restore_goal']],
  ['web/lib/data/people.ts', ['end_person_employment', 'restore_person_employment']],
];
for (const [file, rpcs] of WRAPPERS) {
  const t = read(file);
  check(file + ' imports callLifecycleRpc', /from "@\/lib\/contracts\/lifecycle"/.test(t));
  for (const rpc of rpcs) {
    check(`${file}: ${rpc} is called only through callLifecycleRpc`, new RegExp("callLifecycleRpc\\(supabase, \\{ rpc: \"" + rpc + "\"").test(t) && !new RegExp("supabase\\.rpc\\(\"" + rpc + "\"").test(t));
  }
  check(file + ' has no hand-rolled lifecycle result reading', !/data as \{ changed: boolean; authorized: boolean; reason: string \} \| null/.test(t));
}

// 3. callLifecycleRpc semantics (executed against a stub client).
const lc = read('web/lib/contracts/lifecycle.ts');
// Targeted pre-strips for the shapes stripTS does not cover (a `=>` inside a type annotation,
// the multi-line type blocks), then the shared detyper.
const pre = lc
  .replace(/^import .*$/gm, '')
  .replace(/^export type \w+ = \{[^\n]*\};$/gm, '')
  .replace(/^export type \w+ = \{[\s\S]*?^\};$/gm, '')
  .replace(/^export type .*$/gm, '')
  .replace(/const REASON_TEXT: Record<string, \(entity: string\) => string> =/, 'const REASON_TEXT =')
  .replace(/export async function callLifecycleRpc\([^)]*\)[^{]*\{/, 'async function callLifecycleRpc(supabase, call) {')
  .replace(/\) as LifecycleResult \| null;/, ');')
  .replace(/const envelope: ExecutionResultEnvelope = \{/, 'const envelope = {')
  .replace(/^export /gm, '');
const js = stripTS(pre);
if (!/async function callLifecycleRpc\(supabase, call\)/.test(js)) throw new Error('harness: callLifecycleRpc not extracted — fix the pre-strip, do not let this pass');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const callLifecycleRpc = await new AsyncFunction(js + '\n; return callLifecycleRpc;')();
if (typeof callLifecycleRpc !== 'function') throw new Error('harness: callLifecycleRpc did not evaluate to a function');
const ID = '11111111-1111-1111-1111-111111111111';
const stub = (r, error = null) => ({ rpc: async () => ({ data: r, error }) });
const CALL = { rpc: 'archive_company', idParam: 'p_company_id', id: ID, entityType: 'company', action: 'archive' };
const ok = await callLifecycleRpc(stub({ operation: 'archive_company', changed: true, authorized: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }), CALL);
check('verified outcome: executed + postcondition_verified, no user message', ok.envelope.executed === true && ok.envelope.postcondition_verified === true && ok.userMessage === null && ok.envelope.rows_affected === 1);
const unconfirmed = await callLifecycleRpc(stub({ changed: true, authorized: true, postconditionPassed: false, reason: 'archived' }), CALL);
check('changed but unconfirmed: executed, NOT verified, told to treat as unchanged', unconfirmed.envelope.executed === true && unconfirmed.envelope.postcondition_verified === false && /did not confirm/.test(unconfirmed.userMessage));
const already = await callLifecycleRpc(stub({ changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }), CALL);
check('already_* is a truthful no-op: not executed, not verified, no error message', already.envelope.executed === false && already.envelope.postcondition_verified === false && already.userMessage === null && already.envelope.error === 'already_archived');
const denied = await callLifecycleRpc(stub({ changed: false, authorized: false, postconditionPassed: false, reason: 'denied' }), CALL);
check('denied: not executed, permission message', denied.envelope.executed === false && /permission/.test(denied.userMessage));
const bad = await callLifecycleRpc(stub(null), { ...CALL, id: 'not-a-uuid' });
check('invalid id never reaches the RPC', bad.envelope.executed === false && bad.envelope.error === 'invalid_id');

// 4. The Edge executor: same RPCs, server-side resolution, no context-window gate.
// The Edge source honours SEM_INDEX_SRC so mutation proofs can point this contract at a scratch copy.
const edge = readFileSync(process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8').replace(/
/g, '
');
check('edge calls archive_company / restore_company', /supabase\.rpc\('archive_company'/.test(edge) && /supabase\.rpc\('restore_company'/.test(edge));
check('edge resolves lifecycle targets server-side across statuses', /async function resolveCompanyLifecycleTargets\(/.test(edge) && /from\('companies'\)\.select\('id,name,status'\)\.in\('id', ids\)/.test(edge) && /\.ilike\('name'/.test(edge));
check('edge no longer gates archive/restore on context membership (BUG-014)', !/restoreCompanyIds = \[\.\.\.new Set\(requestedRestoreIds\.filter\(\(id\): id is string => typeof id === 'string' && contextCompanyIds\.has\(id\)\)\)\]/.test(edge) && !/archiveCompanyIds = \[\.\.\.new Set\(requestedArchiveIds\.filter\(\(id\): id is string => typeof id === 'string' && contextCompanyIds\.has\(id\)\)\)\]/.test(edge));
check('edge: zero hits and several hits both leave a line (never silent)', /no company by that name/.test(edge) && /more than one company matches/.test(edge));
// Verifier #58 V58-D2: task and goal lifecycle ids resolve server-side too — never by the pack window.
check('edge: task lifecycle ids are re-read from tasks, never filtered by the context window', /taskLifecycleById\.has\(id\)/.test(edge) && !/restoreTaskIds = \[\.\.\.new Set\(requestedRestoreTaskIds\.filter\(\(id\): id is string => typeof id === 'string' && contextArchivedTaskIds\.has\(id\)\)\)\]/.test(edge) && !/archiveTaskIds = \[\.\.\.new Set\(requestedArchiveTaskIds\.filter\(\(id\): id is string => typeof id === 'string' && contextTaskIds\.has\(id\)\)\)\]/.test(edge));
check('edge: goal lifecycle ids are re-read from goals, never filtered by the context window', /goalLifecycleById\.has\(id\)/.test(edge) && !/(?:archive|restore)GoalIds = \[\.\.\.new Set\(requested(?:Archive|Restore)GoalIds\.filter\(\(id\): id is string => typeof id === 'string' && contextGoalIds\.has\(id\)\)\)\]/.test(edge));
check('edge: archivedTasks is placed in the pack (the prompt resolves task restores from it)', /archivedTasks:archivedTasks\.data\|\|\[\]/.test(edge));
check('edge: unresolved task / goal ids leave a truthful line', /could not be found \(searched the active and archived tasks you can access/.test(edge) && /could not be found \(searched the active and archived goals you can access/.test(edge));
check('prompt no longer equates window absence with deletion', !/that is real signal it does not currently exist/.test(edge) && /absence from a context window is NEVER/.test(edge));

console.log(`\narchitecture_lifecycle_rpc_only_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
