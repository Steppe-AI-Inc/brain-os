#!/usr/bin/env node
// VERIFIER #70 — INDEPENDENT re-measurement of the ENTIRE request-budget path.
// Fixtures are built from the REAL .limit() caps in index.ts, not reused from the candidate's suites.
// Invariant under test: A REQUEST FITS THE HARD LIMIT OR OPTIONAL CONTEXT DEGRADES DETERMINISTICALLY.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() { let d = HERE; for (let i = 0; i < 12; i++) { if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d; const up = dirname(d); if (up === d) break; d = up; } throw new Error('root'); }
const ROOT = repoRoot();
const { stripTS, withSourceHelpers } = await import('file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n');

// ---- slice the REAL budget block
const a = src.indexOf('  // ---- CONTEXT BUDGET (incident 2026-09-08');
const bMark = "throw new Error('context budget trimmed the minimum safe context — refusing to build this turn');";
const b = src.indexOf(bMark, a);
if (a < 0 || b < 0) throw new Error('budget block not found');
// carry a little past the throw so the post-loop bookkeeping is included
// The throw sits INSIDE an `if (...) { ... }`; slicing to the end of the throw LINE cut the block in
// half and produced a SyntaxError far from its cause. Carry to the closing brace of that if.
const closeIf = src.indexOf('\n  }', b);
if (closeIf < 0) throw new Error('minimum-safe-context guard block end not found');
const BUDGET = withSourceHelpers(src, stripTS(src.slice(a, closeIf + 4)));
const runBudget = new Function('command', 'pack', 'collections', 'Deno', BUDGET + '\n; return { tokens: packTokens(), budget: packBudget, trimmed: contextTrimmed, over: packTokens() > packBudget, pack, collections };');

// ---- the REAL preflight estimators, from the source under test
// estimateTokens is a ONE-LINE declaration in the source; taking it to the next "\n}" swallowed the
// following function. Sliced by its own line, from the source under test, never re-typed.
const etLine = src.split('\n').find((l) => l.startsWith('function estimateTokens('));
if (!etLine) throw new Error('estimateTokens not found in the source under test');
const estimateTokens = new Function(stripTS(etLine) + '\n; return estimateTokens;')();
const ERT = withSourceHelpers(src, 'SYSTEM_PROMPT_TOKENS; const __ert = (p) => estimateRequestTokens(p);');
const estimateRequestTokens = new Function(ERT + '\n; return __ert;')();

// ---- FIXTURES from the real caps in index.ts
const CAPS = { companies: 20, archivedCompanies: 20, people: 30, tasks: 30, goals: 20, projects: 20,
  memories: 20, approvals: 20, channels: 20, departments: 30, leads: 20, documents: 20, proposals: 15,
  productSpecs: 15, engineeringDrawings: 15, aiProviders: 10, mcpConnectors: 10, archivedTasks: 20,
  agents: 10, products: 30, inventory: 30, financialReports: 12, factoryWorkOrders: 12,
  companyRelationships: 50, personAssignments: 50 };
const NAME_SHORT = 'ACME Robotics';
const NAME_LONG = 'The Very Long Legal Entity Name Of A Holding Company Limited Liability Partnership (Mongolia) LLC — Ulaanbaatar Branch Number Seventeen';

function row(i, nameLen) {
  return { id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: nameLen === 'long' ? NAME_LONG + ' #' + i : NAME_SHORT + ' ' + i,
    title: nameLen === 'long' ? NAME_LONG + ' #' + i : NAME_SHORT + ' ' + i,
    status: 'active', created_at: '2026-09-01T00:00:00.000Z', company_id: '00000000-0000-4000-8000-000000000001',
    description: nameLen === 'long' ? NAME_LONG.repeat(2) : 'a short description' };
}
function turnRow(i, len) {
  return { turn: i, command: 'what is the status of the project ' + i,
    output: { summary: (len === 'long' ? NAME_LONG.repeat(3) : 'Three tasks are queued and one is blocked.') },
    created_at: '2026-09-01T00:00:00.000Z' };
}
function buildPack(o) {
  const p = {};
  const collections = {};
  for (const [k, cap] of Object.entries(CAPS)) {
    const n = o.empty ? 0 : Math.min(cap, o[k] ?? cap);
    p[k] = Array.from({ length: n }, (_, i) => row(i, o.names));
    collections[k] = { shown: n, total: o.total?.[k] ?? n, truncated: (o.total?.[k] ?? n) > n };
  }
  p.conversationHistory = Array.from({ length: o.history ?? 0 }, (_, i) => turnRow(i, o.names));
  collections.conversationHistory = { shown: p.conversationHistory.length, total: o.historyTotal ?? p.conversationHistory.length, truncated: (o.historyTotal ?? 0) > p.conversationHistory.length };
  p.continuity = { totalPriorTurns: o.historyTotal ?? (o.history ?? 0), windowComplete: false };
  p.counts = { tasksTotal: 999, companiesTotal: 999, peopleTotal: 999 };
  p.collections = collections;
  p.pendingAction = o.pendingAction ?? null;
  p.recentlyResolvedEntities = []; p.recentlyDeletedEntities = []; p.activeChannelId = 'ch-1';
  p.namedTargets = { companies: [row(1, o.names)], people: [], tasks: [], goals: [], projects: [], departments: [],
    collections: { companies: { shown: 1, total: 1, truncated: false } } };
  p.currentTurn = { turn: (o.historyTotal ?? 0) + 1, command: o.command };
  return { pack: p, collections, command: o.command };
}

const DENO = { env: { get: () => undefined } };
const CASES = [
  ['empty channel', { empty: true, history: 0, command: 'archive company ACME' }],
  ['short channel', { history: 5, command: 'archive company ACME' }],
  ['long channel (50 turns)', { history: 50, historyTotal: 50, command: 'archive company ACME' }],
  ['long channel (100 turns)', { history: 100, historyTotal: 100, command: 'archive company ACME' }],
  ['long channel (200 turns)', { history: 200, historyTotal: 200, command: 'archive company ACME' }],
  ['many companies (cap)', { companies: 20, total: { companies: 4000 }, history: 5, command: 'archive company ACME' }],
  ['many archived companies', { archivedCompanies: 20, total: { archivedCompanies: 4000 }, history: 5, command: 'restore company ACME' }],
  ['many tasks', { tasks: 30, total: { tasks: 9000 }, history: 5, command: 'archive task QA-1' }],
  ['many archived tasks', { archivedTasks: 20, total: { archivedTasks: 9000 }, history: 5, command: 'restore task QA-1' }],
  ['LONG NAMES everywhere', { names: 'long', history: 20, historyTotal: 20, command: 'archive company ' + NAME_LONG }],
  ['LONG NAMES + 200-turn history', { names: 'long', history: 200, historyTotal: 200, command: 'archive company ' + NAME_LONG }],
  ['every collection at its cap + 200 turns + long names + pendingAction', { names: 'long', history: 200, historyTotal: 200,
    pendingAction: { actionType: 'archive_company', options: [{ id: 'x', label: NAME_LONG }] }, command: 'yes' }],
];

console.log('case'.padEnd(58) + 'packTok  budget  trims  preflight(hardMax 12000)  requestTok(cap 180000)  headroom');
let anyHardStop = 0, anyOverBudget = 0;
for (const [name, o] of CASES) {
  const fx = buildPack({ ...o, command: o.command });
  const r = runBudget(fx.command, fx.pack, fx.collections, DENO);
  const pre = estimateTokens({ command: fx.command, contextPack: r.pack });
  const req = estimateRequestTokens({ profile: { id: 'p', role: 'founder' }, command: fx.command, contextPack: r.pack });
  const hardStop = pre > 12000;
  if (hardStop) anyHardStop++;
  if (r.over) anyOverBudget++;
  console.log(name.padEnd(58) + String(r.tokens).padStart(7) + String(r.budget).padStart(8)
    + String(r.trimmed.length).padStart(7) + (hardStop ? '   *** HARD STOP ***     ' : '   fits (' + pre + ')').padEnd(26)
    + String(req).padStart(10) + '   ' + (12000 - pre) + ' pack / ' + (180000 - req) + ' model');
}
// ESTIMATOR IDENTITY: the pack-budget measurer and the preflight measurer must be the same shape.
{
  const fx = buildPack({ history: 20, historyTotal: 20, command: 'archive company ACME' });
  const r = runBudget(fx.command, fx.pack, fx.collections, DENO);
  const pre = estimateTokens({ command: fx.command, contextPack: r.pack });
  console.log(`\nESTIMATOR IDENTITY: packTokens()=${r.tokens}  preflight estimateTokens()=${pre}  IDENTICAL=${r.tokens === pre}`);
  console.log(`ESTIMATOR vs ACTUAL SERIALIZED REQUEST: estimateRequestTokens uses JSON.stringify(x, null, 2) + SYSTEM_PROMPT_TOKENS`);
}
// TRUNCATION NEVER BECOMES NON-EXISTENCE, and namedTargets survives every trim.
{
  const fx = buildPack({ names: 'long', history: 200, historyTotal: 200, total: { companies: 4000 }, command: 'archive company ' + NAME_LONG });
  const r = runBudget(fx.command, fx.pack, fx.collections, DENO);
  const nt = r.pack.namedTargets;
  const emptied = Object.entries(r.collections).filter(([, e]) => e.shown === 0);
  const lying = emptied.filter(([, e]) => e.truncated !== true && (e.total === null || e.total > 0));
  console.log(`\nTRIMS: ${r.trimmed.length}. Emptied collections: ${emptied.length}. Emptied-but-not-marked-truncated: ${lying.length} ${lying.length ? JSON.stringify(lying) : '(none — truncation never becomes non-existence)'}`);
  console.log(`namedTargets survived: companies=${nt.companies.length} (the entity named THIS TURN)`);
  console.log(`currentTurn survived: ${JSON.stringify(r.pack.currentTurn).slice(0, 60)}…`);
  console.log(`pendingAction key present: ${'pendingAction' in r.pack}`);
  const hist = r.pack.conversationHistory;
  console.log(`conversationHistory: ${hist.length} rows kept; newest-first-preserved=${hist.length === 0 || hist[hist.length - 1].turn === 199}`);
}
console.log(`\nHARD STOPS across ${CASES.length} realistic shapes: ${anyHardStop}. Packs still over budget after all three passes: ${anyOverBudget}.`);
