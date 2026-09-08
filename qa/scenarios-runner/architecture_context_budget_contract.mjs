#!/usr/bin/env node
// ARCHITECTURE CONTRACT — TOKEN_BUDGET_EXHAUSTION_MUST_DEGRADE_CONTEXT_NOT_PRODUCT_AVAILABILITY
//
// Incident 2026-09-08 (qa/verification/incidents/INCIDENT_2026-09-08_TOKEN_PREFLIGHT_413.md, ledger #133):
// the v93 pack grew ~1,772 tokens over v92 and crossed serve()'s 12,000-token preflight on the founder's
// workspace, so an ordinary question in a BRAND-NEW channel returned
// {"error":"Token preflight hard stop","tokenEstimate":12340,"hardMax":12000} and no answer at all.
//
// The product contract this pins (founder, 2026-09-08; governance/OPERATING_TRUTH_MODEL.md §4.3-§4.4):
//   * a request either FITS the hard limit or OPTIONAL CONTEXT DEGRADES DETERMINISTICALLY;
//   * a valid founder turn never becomes a hard stop because optional context inflated the request;
//   * NOT INCLUDED IN THE PROMPT != DOES NOT EXIST — every trimmed collection still reports shown, the
//     exact total, and truncated=true, and any named entity is still resolved server-side;
//   * the MINIMUM SAFE CONTEXT (current command, identity/tenant scope, durable pending action, canonical
//     ids and execution/truth state) is never trimmed to fit a budget.
//
// The real trim block is sliced from index.ts and executed; nothing here re-implements it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// ---- the real block: from the budget constant to the return that closes buildContext ----
const START = '  const packBudget = Math.max(2000,';
const END = '  return { pack, errors:';
const s = src.indexOf(START); const e = src.indexOf(END, s);
check('the budget block exists in index.ts', s > 0 && e > s, 'incident 2026-09-08 must not regress');
if (s < 0 || e < 0) { console.log('\narchitecture_context_budget_contract: 0 passed, 1 failed'); process.exit(1); }
const block = stripTS(src.slice(s, e));
const run = new Function('command', 'pack', 'collections', 'Deno',
  block + '\n; return { pack, collections, trimmed: contextTrimmed, estimate: packTokens(), budget: packBudget, protectedKeys: MINIMUM_SAFE_CONTEXT };');
const DENO = { env: { get: () => undefined } };

// ---- fixtures ----
const row = (i) => ({ id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'), name: 'Row ' + i + ' with a realistically long entity name', title: 'Row ' + i + ' with a realistically long title', status: 'active', company_id: '11111111-1111-1111-1111-111111111111', fact: 'A remembered fact of ordinary length about this workspace.' });
const many = (n) => Array.from({ length: n }, (_, i) => row(i));
const OPTIONAL = ['memories', 'archivedTasks', 'archivedCompanies', 'financialReports', 'inventory', 'products', 'proposals', 'productSpecs', 'engineeringDrawings', 'documents', 'leads', 'departments', 'companyRelationships', 'personAssignments', 'factoryWorkOrders', 'channels', 'agents'];
const CORE = ['companies', 'people', 'tasks', 'projects', 'goals'];
const PENDING = { kind: 'disambiguation', question: 'Which company?', actionType: 'archive_company', options: [{ id: 'aaaa', label: 'ACME', entityType: 'company' }] };
function fixture(size = 40) {
  const pack = {}; const collections = {};
  for (const k of [...OPTIONAL, ...CORE, 'conversationHistory']) {
    pack[k] = many(size);
    collections[k] = { shown: size, total: size * 3, truncated: true };
  }
  // The minimum safe context, present exactly as buildContext places it.
  pack.collections = collections;
  pack.currentTurn = { turn: 42, command: 'archive ACME Holdings' };
  pack.continuity = { totalPriorTurns: 41, historyWindowStart: 34, historyWindowEnd: 41, historyIsComplete: false, channelStateVersion: 7 };
  pack.counts = { companiesTotal: 120, peopleTotal: 120, tasksShown: 8, tasksTotal: 120 };
  pack.pendingAction = PENDING;
  pack.recentlyResolvedEntities = { companies: [{ id: 'aaaa', name: 'ACME' }] };
  pack.recentlyDeletedEntities = null;
  pack.activeChannelId = 'ch-1';
  return { pack, collections };
}
const snapshot = (pack, keys) => JSON.stringify(keys.map((k) => pack[k] ?? null));

// ---- 1. over budget -> fits, deterministically ----
{
  const { pack, collections } = fixture(40);
  const before = Math.ceil(JSON.stringify({ command: 'how many documents are there?', pack }).length / 4);
  const r = run('how many documents are there?', pack, collections, DENO);
  check('an oversized pack is brought under budget (no hard stop)', before > r.budget && r.estimate <= r.budget, `before=${before} after=${r.estimate} budget=${r.budget}`);
  check('the final estimate includes contextBudget itself (the estimator measures what is actually sent)',
    r.estimate <= r.budget && r.pack.contextBudget.estimatedTokens >= JSON.stringify({ command: 'how many documents are there?', pack: r.pack }).length / 4 - 2,
    'estimate ' + r.estimate + ' budget ' + r.budget);
  check('the trim is recorded on the pack', Array.isArray(r.trimmed) && r.trimmed.length > 0 && /->/.test(r.trimmed[0]), JSON.stringify(r.trimmed.slice(0, 3)));
  check('contextBudget reports estimate, budget, trims and the protected set', r.pack.contextBudget && typeof r.pack.contextBudget.estimatedTokens === 'number' && Array.isArray(r.pack.contextBudget.trimmed) && Array.isArray(r.pack.contextBudget.protected));
  check('the trim is deterministic (same input, same result)', (() => { const f2 = fixture(40); const r2 = run('how many documents are there?', f2.pack, f2.collections, DENO); return JSON.stringify(r2.trimmed) === JSON.stringify(r.trimmed) && r2.estimate === r.estimate; })());

  // truthfulness of every envelope
  const lies = [];
  for (const k of Object.keys(collections)) {
    const env = collections[k]; const arr = r.pack[k];
    if (!Array.isArray(arr)) continue;
    if (env.shown !== arr.length) lies.push(`${k}: shown ${env.shown} != items ${arr.length}`);
    if (env.total !== 120) lies.push(`${k}: exact total was rewritten to ${env.total}`);
    if (env.total > env.shown && env.truncated !== true) lies.push(`${k}: truncated=${env.truncated} while ${env.shown} of ${env.total} are shown`);
  }
  check('every trimmed collection keeps the exact total and truncated=true (NOT IN PROMPT != DOES NOT EXIST)', lies.length === 0, lies.slice(0, 5).join('; '));

  // ordering: optional before core
  const trimmedKeys = r.trimmed.map((t) => t.split(' ')[0]);
  const coreTrimmed = trimmedKeys.filter((k) => CORE.includes(k));
  const optionalTrimmed = trimmedKeys.filter((k) => OPTIONAL.includes(k));
  check('optional collections are trimmed before core state', optionalTrimmed.length > 0 && coreTrimmed.every((k) => trimmedKeys.indexOf(k) > trimmedKeys.indexOf(optionalTrimmed[optionalTrimmed.length - 1])), JSON.stringify(trimmedKeys));
  check('core collections keep a usable floor', CORE.every((k) => r.pack[k].length >= 8), CORE.map((k) => k + '=' + r.pack[k].length).join(' '));

  // MINIMUM SAFE CONTEXT survives untouched
  const protectedKeys = r.protectedKeys;
  check('the protected set names the minimum safe context', ['currentTurn', 'continuity', 'counts', 'collections', 'pendingAction'].every((k) => protectedKeys.includes(k)), JSON.stringify(protectedKeys));
  check('currentTurn is never trimmed', JSON.stringify(r.pack.currentTurn) === JSON.stringify({ turn: 42, command: 'archive ACME Holdings' }));
  check('the durable pending action is never trimmed', JSON.stringify(r.pack.pendingAction) === JSON.stringify(PENDING));
  check('tenant / continuity / counts state is never trimmed', r.pack.continuity.channelStateVersion === 7 && r.pack.counts.companiesTotal === 120 && r.pack.activeChannelId === 'ch-1');
  check('canonical ids resolved this turn are never trimmed', JSON.stringify(r.pack.recentlyResolvedEntities) === JSON.stringify({ companies: [{ id: 'aaaa', name: 'ACME' }] }));
  check('no minimum-safe-context key appears in the trim list', r.trimmed.every((t) => !protectedKeys.includes(t.split(' ')[0])), JSON.stringify(r.trimmed));
}

// ---- 2. a fitting pack is untouched (semantically identical) ----
{
  const { pack, collections } = fixture(2);
  const beforeJson = JSON.stringify(pack);
  const r = run('hello', pack, collections, DENO);
  const after = { ...r.pack }; delete after.contextBudget;
  check('a pack under budget is not trimmed at all and stays semantically identical', r.trimmed.length === 0 && JSON.stringify(after) === beforeJson.replace(/,"contextBudget":\{[^}]*\}/, ''), 'trimmed=' + JSON.stringify(r.trimmed));
}

// ---- 3. history trims OLDEST first and keeps the newest turns ----
{
  const { pack, collections } = fixture(40);
  pack.conversationHistory = Array.from({ length: 60 }, (_, i) => ({ turn: i + 1, command: 'command number ' + i + ' of ordinary length', summary: 'summary number ' + i + ' of ordinary length' }));
  collections.conversationHistory = { shown: 60, total: 200, truncated: true };
  const r = run('what did we just do?', pack, collections, DENO);
  const hist = r.pack.conversationHistory;
  check('trimmed history keeps the NEWEST turns (oldest dropped first)', hist[hist.length - 1].turn === 60 && hist.every((h, i) => i === 0 || h.turn > hist[i - 1].turn), JSON.stringify(hist.map((h) => h.turn)));
  check('history keeps its exact total after trimming', collections.conversationHistory.total === 200 && collections.conversationHistory.shown === hist.length);
}

// ---- 4. an entity named in the command is still resolvable after a trim (no false non-existence) ----
{
  const { pack, collections } = fixture(40);
  const r = run('restore QA-SWARM-TEST-CO-VIA-CHAT', pack, collections, DENO);
  check('archived entities stay canonically resolvable after trimming (server-side, not from the pack)',
    /async function resolveCompanyLifecycleTargets/.test(src) && /taskLifecycleById\.has\(id\)/.test(src) && r.pack.contextBudget.note.includes('resolved server-side'),
    'lifecycle resolution must not depend on the trimmed window');
}

// ---- 5. source-level guarantees ----
check('the trim order can never name a protected key (asserted in source)', /TRIM_ORDER names a minimum-safe-context key/.test(src));
check('a trim that touched the minimum safe context throws instead of shipping', /refusing to build this turn/.test(src));
check('contextBudget is attached before the trim loop, not after it', src.indexOf('packRecord.contextBudget = contextBudget;') < src.indexOf('for (const [key, keep, keepNewest] of TRIM_ORDER)'));
check('the block uses the same estimator as the serve() preflight', /JSON\.stringify\(\{ command, pack \}\)\.length \/ 4/.test(src) && /estimateTokens\(\{ command, contextPack \}\)/.test(src));
check('the budget keeps a deliberate margin below the hard limit', /Number\(Deno\.env\.get\('SEM_AI_MAX_TOKENS'\) \|\| 12000\) - 600/.test(src));
check('the prompt tells the model a trim never means the rest do not exist', /a trim never means the rest do not exist/.test(src));
check('execution evidence is never a trim candidate', !/\['(?:executionEvidence|claimExecutionEvidence)'/.test(src.slice(src.indexOf('const TRIM_ORDER'), src.indexOf('const contextTrimmed'))));

console.log(`\narchitecture_context_budget_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
