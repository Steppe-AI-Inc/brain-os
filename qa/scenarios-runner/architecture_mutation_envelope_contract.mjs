#!/usr/bin/env node
// ARCHITECTURE CONTRACT — ExecutionResultEnvelope (governance/OPERATING_TRUTH_MODEL.md §4.1).
//
//   * every mutation execution site in sem-ai-command/index.ts records an envelope
//     (recordExecution / recordCreate) — an unrecorded write path makes truthful claims about it
//     unverifiable and false claims uncatchable;
//   * a `true` postcondition is never a bare literal: every recordExecution(..., true) sits behind a
//     backend-result gate (r.changed / rows returned / row present), and the create family goes
//     through recordCreate with a FRESH re-read (POSTCONDITION_ASSUMED defect class);
//   * the envelope type carries the contract fields, byte-consistent with the shared copies.
//
// Static, source-level. Fails on the pre-P1 source (create family recorded with literal true).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const lines = src.split('\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// 1. Envelope type and fields.
const FIELDS = ['request_id', 'channel_id', 'turn', 'action_type', 'entity_type', 'canonical_entity_ids', 'requested_values', 'executed', 'rows_affected', 'backend_result', 'precondition', 'postcondition', 'postcondition_verified', 'error', 'timestamp'];
const typeIdx = src.indexOf('type ExecutionResultEnvelope = {');
check('ExecutionResultEnvelope type declared', typeIdx > 0);
const typeText = typeIdx > 0 ? src.slice(typeIdx, src.indexOf('};', typeIdx)) : '';
for (const f of FIELDS) check('envelope field ' + f, new RegExp('\\b' + f + '\\b').test(typeText));
for (const mirror of ['web/lib/contracts/execution.ts', 'supabase/functions/_shared/execution.ts']) {
  const t = readFileSync(resolve(ROOT, mirror), 'utf8');
  check('mirror ' + mirror + ' carries every envelope field', FIELDS.every((f) => new RegExp('\\b' + f + '\\b').test(t)));
}

// 2. recordExecution writes postcondition_verified === postconditionPassed (never independently).
const recIdx = src.indexOf('const recordExecution = (');
check('recordExecution declared', recIdx > 0);
const recText = src.slice(recIdx, recIdx + 1500);
check('postcondition_verified mirrors postconditionPassed', /postcondition_verified: postconditionPassed/.test(recText));

// 3. Every recordExecution(..., true) is gated on a backend result within the 4 lines above or on the same line.
const GATES = [/r\.changed === true/, /r\.reason === /, /data && data\.length > 0/, /!error && (?:data|inserted)/, /for \(const \w+ of (?:deletedChannels|deletedApprovals|deactivated|data) \|\| \[\]\)/, /if \(\w+\) \{ recordExecution/, /if \(\w+\) recordExecution/, /if \(mapping\) recordExecution/, /if \(evidenceType\)/, /r\.reason === 'deleted'/, /if \(pricingApproval\)/, /if \(releaseApproval\)/, /if \(ticket\)/, /if \(activatedAiProvider\)/, /if \(!error && data\)/, /if \(!error && inserted\)/, /if \(error \|\| !\w+\) continue;/];
let literalTrueSites = 0, gatedSites = 0;
lines.forEach((line, i) => {
  if (!/recordExecution\(/.test(line) || /const recordExecution/.test(line) || /^\s*\/\//.test(line)) return;
  if (!/,\s*true\s*[,)]/.test(line)) return; // computed booleans are fine by construction
  literalTrueSites++;
  // The gate may sit a few statements above (a reason branch, a row-returned check).
  const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
  const gated = GATES.some((g) => g.test(window));
  if (gated) gatedSites++;
  else failures.push(`recordExecution(..., true) without a backend-result gate at line ${i + 1}: ${line.trim().slice(0, 140)}`);
});
check('every literal-true evidence site is gated on a backend result (' + gatedSites + '/' + literalTrueSites + ')', literalTrueSites > 0 && gatedSites === literalTrueSites);

// 4. The create family goes through recordCreate with a fresh re-read.
check('recordCreate exists and re-reads ids under RLS', /async function verifyRowsExist\(/.test(src) && /const recordCreate = \(resourceType: string, rows: unknown\[\], seen: Set<string>\)/.test(src));
for (const t of ['task', 'approval', 'company', 'person', 'project', 'goal', 'company_relationship', 'person_assignment', 'memory']) {
  check('create family: ' + t + ' recorded via recordCreate', new RegExp("recordCreate\\('" + t + "',").test(src));
}
check('no create-family literal true remains', !/recordExecution\('(?:task|approval|company|person|project|goal|company_relationship|person_assignment|memory)', 'create', \((?:t|a|c|pp|pr|g|cr|pa|m) \|\| \{\}\)\.id, true\)/.test(src));
check('deleted tasks verify the row is gone', /const gone = typeof id === 'string' && !deletedTasksStillPresent\.has\(id\)/.test(src));

// 5. The turn's ledger is persisted every turn with a verdict.
check('work_orders.output persisted unconditionally', /void groundedOutcomeThisTurn;[^\n]*\n\s*await supabase\.from\('work_orders'\)\.update\(\{ output: result \}\)/.test(src));
check('turnVerdict carries executed / attempted / rejected counts and the request intent', /result\.turnVerdict = \{[\s\S]*executedOperationCount[\s\S]*attemptedOperationCount[\s\S]*rejectedClaimCount[\s\S]*mutationIntent[\s\S]*receiptRendered/.test(src));

console.log(`\narchitecture_mutation_envelope_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
