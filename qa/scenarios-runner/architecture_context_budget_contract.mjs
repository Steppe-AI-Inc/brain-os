#!/usr/bin/env node
// ARCHITECTURE CONTRACT — the context pack degrades, it never 413s.
// Incident 2026-09-08 (qa/verification/incidents/INCIDENT_2026-09-08_TOKEN_PREFLIGHT_413.md): the v93
// pack grew ~1,772 tokens over v92 and crossed serve()'s 12,000-token preflight cap on the founder's
// workspace, so an ordinary question in a BRAND-NEW channel returned
// {"error":"Token preflight hard stop","tokenEstimate":12340,"hardMax":12000} and no answer at all.
//
// The rule this pins (governance/OPERATING_TRUTH_MODEL.md §4.3 + CLAUDE.md §5 "production fails visibly
// and safely"): a pack over budget TRIMS optional collections first, core ones last, and every trim is
// written back into that collection's envelope so the model still sees the real total and truncated=true.
// A trim must never make the pack claim completeness it does not have.
//
// The trim block is executed for real, sliced from index.ts through the repo's detyper.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// ---- the real block ----
const START = '  const packBudget = Math.max(2000,';
const END = '  packRecord.contextBudget = { estimatedTokens: packTokens(), budget: packBudget, trimmed: contextTrimmed };';
const s = src.indexOf(START); const e = src.indexOf(END, s);
check('the budget block exists in index.ts', s > 0 && e > s, 'incident 2026-09-08 must not regress');
if (s < 0 || e < 0) { console.log('\narchitecture_context_budget_contract: 0 passed, 1 failed'); process.exit(1); }
const block = stripTS(src.slice(s, e + END.length));
const run = new Function('command', 'pack', 'collections', 'Deno', block + '\n; return { pack, collections, trimmed: contextTrimmed, estimate: packTokens(), budget: packBudget };');
const DENO = { env: { get: () => undefined } };

// ---- a workspace that does not fit ----
const row = (i) => ({ id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'), name: 'Row ' + i + ' with a realistically long entity name', title: 'Row ' + i + ' with a realistically long title', status: 'active', company_id: '11111111-1111-1111-1111-111111111111', fact: 'A remembered fact of ordinary length about this workspace.' });
const many = (n) => Array.from({ length: n }, (_, i) => row(i));
const OPTIONAL = ['memories', 'archivedTasks', 'archivedCompanies', 'financialReports', 'inventory', 'products', 'proposals', 'productSpecs', 'engineeringDrawings', 'documents', 'leads', 'departments', 'companyRelationships', 'personAssignments', 'factoryWorkOrders', 'channels', 'agents'];
const CORE = ['companies', 'people', 'tasks', 'projects', 'goals'];
function fixture(sizePerCollection = 40) {
  const pack = {}; const collections = {};
  for (const k of [...OPTIONAL, ...CORE, 'conversationHistory']) {
    pack[k] = many(sizePerCollection);
    collections[k] = { shown: sizePerCollection, total: sizePerCollection * 3, truncated: true };
  }
  pack.collections = collections;
  return { pack, collections };
}

// 1. Over budget -> it fits afterwards, and something was trimmed.
{
  const { pack, collections } = fixture(40);
  const before = Math.ceil(JSON.stringify({ command: 'how many documents are there?', pack }).length / 4);
  const r = run('how many documents are there?', pack, collections, DENO);
  check('an oversized pack is brought under budget', before > r.budget && r.estimate <= r.budget, `before=${before} after=${r.estimate} budget=${r.budget}`);
  check('the trim is recorded on the pack', Array.isArray(r.trimmed) && r.trimmed.length > 0 && /->/.test(r.trimmed[0]), JSON.stringify(r.trimmed.slice(0, 3)));
  check('contextBudget is exposed to the model', r.pack.contextBudget && typeof r.pack.contextBudget.estimatedTokens === 'number' && Array.isArray(r.pack.contextBudget.trimmed));
  // 2. Every trimmed collection stays TRUTHFUL: shown matches the array, total untouched, truncated true.
  const lies = [];
  for (const k of Object.keys(collections)) {
    const env = collections[k]; const arr = r.pack[k];
    if (!Array.isArray(arr)) continue;
    if (env.shown !== arr.length) lies.push(`${k}: shown ${env.shown} != items ${arr.length}`);
    if (env.total !== 120) lies.push(`${k}: total was rewritten to ${env.total}`);
    if (env.total > env.shown && env.truncated !== true) lies.push(`${k}: truncated is ${env.truncated} while ${env.shown} of ${env.total} are shown`);
  }
  check('every trimmed collection reports shown/total/truncated truthfully', lies.length === 0, lies.slice(0, 5).join('; '));
  // 3. Optional collections are sacrificed before core ones.
  const trimmedKeys = r.trimmed.map((t) => t.split(' ')[0]);
  const coreTrimmed = trimmedKeys.filter((k) => CORE.includes(k));
  const optionalTrimmed = trimmedKeys.filter((k) => OPTIONAL.includes(k));
  check('optional collections are trimmed before core ones', optionalTrimmed.length > 0 && coreTrimmed.every((k) => trimmedKeys.indexOf(k) > trimmedKeys.indexOf(optionalTrimmed[optionalTrimmed.length - 1])), JSON.stringify(trimmedKeys));
  check('core collections keep a usable floor', CORE.every((k) => r.pack[k].length >= 8), CORE.map((k) => k + '=' + r.pack[k].length).join(' '));
}

// 4. A pack that already fits is left completely alone.
{
  const { pack, collections } = fixture(2);
  const beforeJson = JSON.stringify(pack);
  const r = run('hello', pack, collections, DENO);
  check('a pack under budget is not trimmed at all', r.trimmed.length === 0 && JSON.stringify({ ...r.pack, contextBudget: undefined }) === JSON.stringify({ ...JSON.parse(beforeJson), contextBudget: undefined }));
}

// 5. History keeps the NEWEST turns when trimmed (the previous turn must survive).
{
  const { pack, collections } = fixture(40);
  pack.conversationHistory = Array.from({ length: 40 }, (_, i) => ({ turn: i + 1, command: 'command number ' + i + ' of ordinary length', summary: 'summary number ' + i + ' of ordinary length' }));
  const r = run('what did we just do?', pack, collections, DENO);
  const hist = r.pack.conversationHistory;
  check('trimmed history keeps the newest turns', hist.length === 40 || hist[hist.length - 1].turn === 40, JSON.stringify(hist.map((h) => h.turn).slice(0, 6)));
}

// 6. The estimator matches the one the preflight uses, and the budget leaves headroom under the cap.
check('the block uses the same estimator as the serve() preflight', /JSON\.stringify\(\{ command, pack \}\)\.length \/ 4/.test(src) && /estimateTokens\(\{ command, contextPack \}\)/.test(src));
check('the budget leaves headroom below SEM_AI_MAX_TOKENS', /Number\(Deno\.env\.get\('SEM_AI_MAX_TOKENS'\) \|\| 12000\) - 600/.test(src));
check('the prompt explains a trimmed collection is still truncated, not absent', /a trim never means the rest do not exist/.test(src));

console.log(`\narchitecture_context_budget_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
