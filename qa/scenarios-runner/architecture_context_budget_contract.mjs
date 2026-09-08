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
const END = '  return { pack, provenanceIds, errors:';
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
  // The note's wording changed in campaign #122: it used to claim server-side resolution for ANY named
  // entity, which was true of four collections and false of fifteen (verifier #62, V62-D3). It now names
  // the six that have a targeted lookup and tells the model not to infer absence for the rest.
  check('archived entities stay canonically resolvable after trimming (server-side, not from the pack)',
    /async function resolveCompanyLifecycleTargets/.test(src) && /taskLifecycleById\.has\(id\)/.test(src)
    && r.pack.contextBudget.note.includes('re-read server-side across every status'),
    'lifecycle resolution must not depend on the trimmed window');
  check('the note does not overstate which collections are resolved server-side (V62-D3)',
    r.pack.contextBudget.note.includes('Companies, people, tasks, goals, projects and departments')
    && r.pack.contextBudget.note.includes('do not conclude that anything is absent from the database'),
    'a note that promises more than the code delivers invites exactly the confident wrong answer this contract prevents');
  // The server keeps id provenance for rows the trim removed, and keeps it OUT of the pack, where it would
  // spend the very budget it is meant to protect (verifier #62, V62-D1 and its correction).
  check('id provenance is captured before the trim and returned beside the pack, not inside it',
    /const provenanceIds: Record<string, string\[\]> = \{\};/.test(src)
    && /return \{ pack, provenanceIds, errors:/.test(src)
    && !/droppedIds/.test(src)
    && /for \(const id of \(contextProvenance\?\.\[name\] \|\| \[\]\)\) out\.add\(id\)/.test(src),
    'the executor must still recognise an id whose row the budget removed');
}

// ---- 5. source-level guarantees ----
check('the trim order can never name a protected key (asserted in source)', /TRIM_ORDER names a minimum-safe-context key/.test(src));
check('a trim that touched the minimum safe context throws instead of shipping', /refusing to build this turn/.test(src));
check('contextBudget is attached before the trim loop, not after it', src.indexOf('packRecord.contextBudget = contextBudget;') < src.indexOf('for (const [key, keep, keepNewest] of TRIM_ORDER)'));
// Verifier #60 (V60-D5): asserting "same estimator" by matching two DIFFERENT string literals is not an
// assertion at all — it passed while the loop measured {command, pack} and the preflight measured
// {command, contextPack}, a different object shape, for a measured gap of 19-145 tokens. Compare the
// argument shapes the two expressions actually build.
{
  const loopArgs = (src.match(/const packTokens = \(\) => Math\.ceil\(JSON\.stringify\((\{[^)]*\})\)\.length \/ 4\)/) || [])[1];
  const preflightArgs = (src.match(/tokenEstimate = estimateTokens\((\{[^)]*\})\)/) || [])[1];
  const shape = (s) => (s || '').replace(/\s+/g, '').replace(/:pack\b/, '').replace(/[{}]/g, '');
  check('the block measures the SAME object shape as the serve() preflight, not merely the same arithmetic',
    !!loopArgs && !!preflightArgs && shape(loopArgs) === shape(preflightArgs),
    'loop=' + loopArgs + ' preflight=' + preflightArgs);
  check('the preflight estimator itself is unchanged', /function estimateTokens\(x: unknown\)\{ return Math\.ceil\(JSON\.stringify\(x\)\.length \/ 4\); \}/.test(src));
}
// Verifier #61 V61-D2: the head-first merge protected the named-this-turn rows from a head-slicing trim,
// but not from the floor-0 pass, which empties companies/people/tasks/goals outright — and the turn still
// shipped, so the founder got an answer built on a pack in which the entity they had just named was absent.
// OPERATING_TRUTH_MODEL §4.4 lists "exact canonical entity and action state for the targets of this turn" as
// minimum safe context, so the resolved rows are carried in their own protected key. A mutation proof showed
// nothing asserted this: removing the key from the protected set left the whole battery green.
check('the rows resolved from THIS turn are carried in their own protected key (V61-D2)',
  src.includes('const namedTargets = {')
  && src.includes('const pack = { continuity, namedTargets,')
  && src.includes("'activeChannelId', 'namedTargets']"),
  'namedTargets must exist, be placed in the pack, and be named in MINIMUM_SAFE_CONTEXT');
check('namedTargets is never a trim candidate',
  !src.slice(src.indexOf('const TRIM_ORDER'), src.indexOf('const contextTrimmed')).includes("['namedTargets',"));
check('a history row cannot grow without bound (V61-D1)',
  /const HISTORY_FIELD_CAP = \d+;/.test(src) && src.includes('the full text is stored on the work order')
  // The cap has to be APPLIED, not merely defined: a mutation that left the constant in place and dropped
  // the two call sites survived the first version of this check.
  && src.includes('command: shorten(r.command), summary: shorten(summary)'),
  'one long accepted turn must not be able to hard-stop every later turn in the channel');
check('conversationHistory can reach zero in the final pass like any other tier-4 context (V61-D1b)',
  src.includes("key === 'conversationHistory' && floor > 0 ? Math.max(1, floor) : floor"));
check('a trim that cannot reach the budget is stated on the pack, not left to be inferred', /contextBudget\.overBudget = /.test(src) && /contextStillOverBudget/.test(src));
check('harder trim passes exist for a byte-heavy, row-light workspace (V60-D1)', /for \(const floor of \[2, 0\]\)/.test(src));
check('the rows named in this turn are merged at the head, where a head-slicing trim keeps them (V60-D2)',
  (src.match(/return \[\.\.\.extra, \.\.\.\((?:companies|people|goals|tasks)\.data \|\| \[\]\)\]/g) || []).length === 4,
  'all four targeted lookups must merge named rows first');
check('the budget keeps a deliberate margin below the hard limit', /Number\(Deno\.env\.get\('SEM_AI_MAX_TOKENS'\) \|\| 12000\) - 600/.test(src));
check('the prompt tells the model a trim never means the rest do not exist', /a trim never means the rest do not exist/.test(src));
check('execution evidence is never a trim candidate', !/\['(?:executionEvidence|claimExecutionEvidence)'/.test(src.slice(src.indexOf('const TRIM_ORDER'), src.indexOf('const contextTrimmed'))));

console.log(`\narchitecture_context_budget_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
