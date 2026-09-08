#!/usr/bin/env node
// THE MODEL MAY ONLY ACT ON IDS IT WAS GIVEN, AND LIFECYCLE TRANSITIONS GO THROUGH THE RPC.
//
// WHY THIS SUITE EXISTS. The clean extended vacuity sweep on the frozen candidate left three structural
// survivors after the provenance ones were closed, and each is a straight revert of a guard that decides
// whether a WRITE happens:
//
//   STRUCT deleteTaskIds no longer checked against context        -> survived every suite
//   STRUCT updateCompanies no longer checked against context      -> survived every suite
//   STRUCT the raw company lifecycle-edit block is bypassed       -> survived every suite
//
// All three could have been deleted with the battery green. The first two let a model-emitted id that was
// never in the context pack reach a delete or an update — the hallucinated-id class. The third lets a raw
// status edit into or out of 'archived' bypass archive_company()/restore_company(), which is the single
// path the DB trigger and the audit receipt both depend on.
//
// These are WRITE-AUTHORITY properties, so each is pinned with its negative half: a guard that blocks
// everything is as broken as one that blocks nothing, and only the pair distinguishes them.
//
// The expressions are sliced from the real source; nothing here re-implements product logic.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
};

const detype = (t) => t
  .replace(/\((\w+)\): \w+ is string =>/g, '($1) =>')
  .replace(/\((\w+)\): \w+ is Record<string, unknown> =>/g, '($1) =>')
  .replace(/\(c as any\)/g, 'c').replace(/\((\w+): any\)/g, '($1)')
  .replace(/ as string\b/g, '').replace(/: Record<string, unknown>/g, '');

/** One `const <name> = ...;` statement, bracket-balanced — never the first line only. */
function stmt(name) {
  const at = src.indexOf('const ' + name + ' = ');
  if (at < 0) throw new Error(name + ' not found in source — update this suite, do not let it pass');
  let d = 0;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return detype(src.slice(at, i + 1));
  }
  throw new Error(name + ': unterminated');
}

const IN_CONTEXT = 'aaaaaaaa-1111-4000-8000-000000000000';
const HALLUCINATED = 'cccccccc-3333-4000-8000-000000000000';

// EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE: a suite that sliced nothing has not passed.
const delSrc = stmt('deleteTaskIds');
// updateCompaniesReq is a multi-line chain; only its filter decides authority, so slice to the .map.
const updRaw = stmt('updateCompaniesReq');
const updFilter = updRaw.slice(0, updRaw.indexOf('.map('));
const lifeSrc = stmt('statusChangeIsLifecycleTransition');
check('the three windows were sliced from source and are non-trivial',
  delSrc.includes('contextTaskIds') && updFilter.includes('contextCompanyIds') && lifeSrc.includes('archived'),
  'deleteTaskIds=' + delSrc.length + ' updateCompaniesReq=' + updFilter.length + ' lifecycle=' + lifeSrc.length);

// ---- 1. deleteTaskIds is scoped to the context pack -------------------------------------------------
{
  const run = (requested, ctx) => new Function('requestedDeleteIds', 'contextTaskIds',
    delSrc + '\nreturn deleteTaskIds;')(requested, new Set(ctx));
  check('deleteTaskIds: an id the model invented is NOT deleted',
    !run([HALLUCINATED], [IN_CONTEXT]).includes(HALLUCINATED),
    'a task id that was never in the context pack must never reach a delete');
  check('deleteTaskIds: an id that WAS in the pack is still deleted',
    run([IN_CONTEXT], [IN_CONTEXT]).includes(IN_CONTEXT),
    'the negative half — a filter that drops everything blocks the product, it does not secure it');
  check('deleteTaskIds: a non-string id is dropped',
    run([null, 42, {}], [IN_CONTEXT]).length === 0);
}

// ---- 2. updateCompanies is scoped to the context pack -----------------------------------------------
{
  const run = (requested, ctx) => new Function('requestedCompanyUpdates', 'contextCompanyIds',
    updFilter + ';\nreturn updateCompaniesReq;')(requested, new Set(ctx));
  check('updateCompanies: a company the model invented is NOT updated',
    run([{ id: HALLUCINATED, name: 'X' }], [IN_CONTEXT]).length === 0,
    'a company id that was never in the context pack must never reach an update');
  check('updateCompanies: a company that WAS in the pack is still updated',
    run([{ id: IN_CONTEXT, name: 'X' }], [IN_CONTEXT]).length === 1,
    'the negative half');
  check('updateCompanies: a malformed entry is dropped',
    run([null, 'nope', { name: 'no id' }], [IN_CONTEXT]).length === 0);
}

// ---- 3. a raw status edit into/out of 'archived' is routed to the lifecycle RPC ----------------------
{
  const run = (c, currentStatus) => new Function('c', 'currentStatus',
    lifeSrc + '\nreturn !!statusChangeIsLifecycleTransition;')(c, currentStatus);
  check('lifecycle: setting status to archived is a lifecycle transition, not a raw update',
    run({ status: 'archived' }, 'active'),
    'a raw UPDATE would bypass archive_company(), the DB trigger and the audit receipt');
  check('lifecycle: moving OUT of archived is a lifecycle transition too',
    run({ status: 'active' }, 'archived'),
    'restore is symmetric; only the RPC produces a truthful receipt');
  check('lifecycle: an ordinary edit that does not touch archived is NOT diverted',
    !run({ status: 'active' }, 'active'),
    'the negative half — diverting every edit would break normal updates');
  check('lifecycle: an edit with no status change at all is NOT diverted',
    !run({ name: 'renamed' }, 'active'));
}

console.log(`\ncontext_scoped_mutation_gates_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
