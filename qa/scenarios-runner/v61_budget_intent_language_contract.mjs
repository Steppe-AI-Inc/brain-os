#!/usr/bin/env node
// ============================================================================================
// PROMOTED from verifier #61 (campaign #121), whose FAIL on 4f44544 this candidate closes.
// Every DEFECT row was red by design when written and is green here; each is pinned by a mutant in
// qa/verification/scratch/p1/mutation_proof_v60_v61.mjs (19 killed, 0 survived).
//
// Every row executes the REAL windows sliced out of supabase/functions/sem-ai-command/index.ts.
// Nothing here re-implements a product rule.
//
//   CONTRACT rows = properties that hold on these bytes and must keep holding.
//   DEFECT   rows = verifier #61 findings. They are RED BY DESIGN on 4f44544 and go green only
//                   when the finding is actually closed. ANY failure exits nonzero.
//
// Source resolution: SEM_INDEX_SRC, else a path derived from this file's own location, so the
// suite is correct from ANY cwd.
// ============================================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC_PATH = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const SRC = readFileSync(SRC_PATH, 'utf8');
const { stripTS, withPatternsAboveWindow } = await import(resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

let pass = 0;
const failures = [];
const check = (kind, name, ok, detail) => {
  if (ok) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { failures.push('[' + kind + '] ' + name + (detail ? '\n       ' + detail : '')); console.log('FAIL [' + kind + '] ' + name + (detail ? '\n       ' + detail : '')); }
};

// ---------------------------------------------------------------------------------------
// WINDOW 1 — request-intent derivation (real slice).
// ---------------------------------------------------------------------------------------
const intentSlice = (() => {
  const s = SRC.indexOf('const MUTATION_ARRAY_FIELDS = [');
  const e = SRC.indexOf('void lexiconReadVetoed;', s);
  if (s < 0 || e < 0) throw new Error('v61: intent window not found — update this suite');
  return stripTS(SRC.slice(s, e + 'void lexiconReadVetoed;'.length));
})();
const intentFn = new Function('command', 'result', intentSlice + '\nreturn { requestedIntent, readShaped, lexiconVerb, modelIntentKind };');
const intentOf = (command, result = {}) => intentFn(command, result || {});
const hasIntent = (c, r) => intentOf(c, r).requestedIntent !== null;

// ---------------------------------------------------------------------------------------
// WINDOW 2 — the structured-claim / never-silent-receipt window (real slice).
// ---------------------------------------------------------------------------------------
const claimSlice = (() => {
  const start = SRC.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const anchor = SRC.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (start < 0 || anchor < 0) throw new Error('v61: structured-claim window not found — update this suite');
  const end = SRC.indexOf('};', anchor) + 2;
  return withPatternsAboveWindow(SRC, stripTS(SRC.slice(start, end)));
})();
const claimFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  claimSlice + '\n; return { summary: result.summary, verdict: result.turnVerdict, intent: requestedIntent, envelope: result.verifiedResponse };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const turn = ({ command, claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, model = 'gpt', labels = {}, lifecycleReports = [], factLines = [], extra = {} }) => {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines;
  globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v61' };
  return claimFn({ claims, summary, pendingAction, questions, ...extra }, evidence, context, model, false, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), false, '', mk());
};
const NO_CHANGE = /No change was made — /;
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now' });
const MC = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });

// ---------------------------------------------------------------------------------------
// WINDOW 3 — the context-budget block (real slice) + the two estimators, read from source.
// ---------------------------------------------------------------------------------------
const budgetSlice = (() => {
  const s = SRC.indexOf('const packBudget = ');
  const e = SRC.indexOf('contextBudget.overBudget = ', s);
  if (s < 0 || e < 0) throw new Error('v61: budget window not found — update this suite');
  return stripTS(SRC.slice(s, SRC.indexOf('\n', e)));
})();
const estimatorSrc = (() => {
  const m = SRC.match(/function estimateTokens\([^)]*\)\s*\{[^}]*\}/);
  if (!m) throw new Error('v61: estimateTokens not found');
  return stripTS(m[0]);
})();
const preflightCall = (SRC.match(/tokenEstimate = (estimateTokens\(\{[^}]*\}\));/) || [])[1];
const runBudget = (command, pack, collections, maxTokens = 12000) => new Function('command', 'pack', 'collections', '__maxTokens', `
${estimatorSrc}
const Deno = { env: { get: (k) => (k === 'SEM_AI_MAX_TOKENS' ? String(__maxTokens) : undefined) } };
${budgetSlice}
const contextPack = pack;
const tokenEstimate = ${preflightCall};
return { contextBudget, packBudget, tokenEstimate, hardMax: Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000), MINIMUM_SAFE_CONTEXT, TRIM_ORDER, trimmed: contextTrimmed.slice() };`)(command, pack, collections, maxTokens);

const lorem = (n, s = 'x') => { let o = '', i = 0; while (o.length < n) o += s + (i++) + ' '; return o.slice(0, n); };
const A = (n, f) => Array.from({ length: n }, (_, i) => f(i));
function makePack(o = {}) {
  const { companies = 12, people = 30, tasks = 15, goals = 20, history = 8, totalPriorTurns = 8,
    freeTextLen = 40, historyRow = null, command = 'what is going on today', namedCompany = null } = o;
  const env = (arr, total) => ({ shown: arr.length, total, truncated: total > arr.length });
  const co = A(companies, (i) => ({ id: 'c' + i, name: 'Company ' + i, status: 'active', organization_type: 'operating', strategic_priority: lorem(freeTextLen, 'p'), risk_score: 1, effectivelyActive: true }));
  if (namedCompany) co.unshift({ id: 'named-c', name: namedCompany, status: 'archived', organization_type: 'operating', strategic_priority: lorem(freeTextLen, 'p'), risk_score: 1, effectivelyActive: false });
  const pk = {
    continuity: { totalPriorTurns, historyWindowStart: 1, historyWindowEnd: totalPriorTurns, historyIsComplete: true, compactionCheckpoint: null, channelStateVersion: 1 },
    companies: co,
    archivedCompanies: A(6, (i) => ({ id: 'ac' + i, name: 'Arch ' + i, status: 'archived', organization_type: 'operating', updated_at: 'x' })),
    projects: A(20, (i) => ({ id: 'pr' + i, company_id: 'c0', title: 'P' + i, status: 'active', deadline: null, blockers: lorem(freeTextLen, 'b'), risk_score: 1 })),
    tasks: A(tasks, (i) => ({ id: 't' + i, company_id: 'c0', project_id: null, title: 'T' + i, status: 'queued', priority: 'high', risk_level: 'low', approval_required: false, deadline: null, owner_type: 'human', owner_person_id: 'p0', owner_agent_id: null })),
    memories: A(8, (i) => ({ id: 'm' + i, company_id: 'c0', entity_type: 'company', entity_id: 'c0', fact: lorem(freeTextLen, 'f'), confidence: 1, sensitivity: 'n', companyCurrentStatus: 'active', personCurrentStatus: null })),
    agents: A(20, (i) => ({ id: 'ag' + i, name: 'A' + i, role: 'eng', skills: [], cost_limit_usd: 1 })),
    products: A(20, (i) => ({ id: 'pl' + i, company_id: 'c0', name: 'PR' + i, currency: 'USD', unit_price: 1, service_fee_monthly: 1, active: true })),
    inventory: A(20, (i) => ({ id: 'iv' + i, company_id: 'c0', product_line_id: 'pl0', sku: 'S' + i, quantity_on_hand: 1, reserved_quantity: 0, reorder_point: 1, location: lorem(freeTextLen, 'l') })),
    approvals: A(20, (i) => ({ id: 'ap' + i, company_id: 'c0', title: 'AP' + i, status: 'pending', risk_level: 'high', reason: lorem(freeTextLen, 'z') })),
    people: A(people, (i) => ({ id: 'p' + i, full_name: 'Person ' + i, email: 'p' + i + '@x.z', role_title: lorem(freeTextLen, 'r'), company_id: 'c0', active: true, effectivelyActive: true })),
    goals: A(goals, (i) => ({ id: 'g' + i, company_id: 'c0', title: 'G' + i, status: 'active', kind: 'okr' })),
    companyRelationships: A(20, (i) => ({ id: 'cr' + i, company_id: 'c0', related_company_id: 'c1', owner_profile_id: 'pf', relationship_type: 'parent_of', ownership_pct: 100, state: 'current' })),
    personAssignments: A(30, (i) => ({ id: 'pa' + i, person_id: 'p' + i, legal_employer_company_id: 'c0', operating_company_id: 'c1', manager_person_id: 'p0', job_title: lorem(freeTextLen, 'j'), state: 'current' })),
    financialReports: A(20, (i) => ({ id: 'fr' + i, company_id: 'c0', period: 'Q1', revenue: 1, expenses: 1, net_income: 0, cash_position: 1, health_status: 'ok', summary: lorem(freeTextLen, 's') })),
    conversationHistory: A(history, (i) => historyRow && i === history - 1 ? historyRow : ({ turn: i + 1, command: lorem(120, 'q'), summary: lorem(120, 'a'), verified: null, executedOperationCount: 0, rejectedClaimCount: 0 })),
    factoryWorkOrders: A(10, (i) => ({ id: 'wo' + i, title: 'W' + i, objective: lorem(freeTextLen, 'o'), status: 'x', allCommitsVerified: false, lastRunVerificationStatus: null, lastRunSummary: lorem(freeTextLen, 'u'), lastRunHeadCommit: null })),
    channels: A(15, (i) => ({ id: 'ch' + i, name: 'C' + i, company_id: 'c0' })),
    activeChannelId: 'ch0',
    departments: A(30, (i) => ({ id: 'd' + i, name: 'D' + i, company_id: 'c0' })),
    leads: A(30, (i) => ({ id: 'ld' + i, client_name: 'L' + i, company_id: 'c0', stage: 'new', value_estimate: 1 })),
    documents: A(30, (i) => ({ id: 'dc' + i, title: 'DC' + i, company_id: 'c0', category: 'x' })),
    proposals: A(20, (i) => ({ id: 'pp' + i, title: 'PP' + i, company_id: 'c0', status: 'draft' })),
    productSpecs: A(20, (i) => ({ id: 'ps' + i, title: 'PS' + i, company_id: 'c0', status: 'draft' })),
    engineeringDrawings: A(20, (i) => ({ id: 'ed' + i, title: 'ED' + i, company_id: 'c0' })),
    aiProviders: A(10, (i) => ({ id: 'ai' + i, provider: 'openai', model: 'm', label: 'L' + i, is_active: i === 0 })),
    mcpConnectors: A(10, (i) => ({ id: 'mc' + i, name: 'M' + i, endpoint_url: 'u' })),
    archivedTasks: A(15, (i) => ({ id: 'at' + i, company_id: 'c0', title: 'AT' + i })),
    pendingAction: null, recentlyResolvedEntities: null, recentlyDeletedEntities: null,
    collections: null,
    counts: { tasksShown: tasks, tasksTotal: tasks, approvalsShown: 20, approvalsTotal: 20, companiesTotal: companies, peopleTotal: people, projectsTotal: 20, goalsTotal: goals, salesLeadsShown: 30, salesLeadsTotal: 30, inventoryItemsTotal: 20, channelsShown: 15, channelsTotal: 15, departmentsShown: 30, departmentsTotal: 30, documentsShown: 30, documentsTotal: 30 },
    currentTurn: { turn: totalPriorTurns + 1, command },
  };
  const collections = {};
  for (const k of ['companies', 'archivedCompanies', 'projects', 'tasks', 'agents', 'products', 'inventory', 'approvals', 'people', 'goals', 'companyRelationships', 'personAssignments', 'financialReports', 'channels', 'departments', 'leads', 'documents', 'proposals', 'productSpecs', 'engineeringDrawings', 'aiProviders', 'mcpConnectors', 'archivedTasks']) collections[k] = env(pk[k], pk[k].length);
  collections.memories = { shown: pk.memories.length, total: null, truncated: null };
  collections.conversationHistory = { shown: history, total: totalPriorTurns, truncated: totalPriorTurns > history };
  collections.factoryWorkOrders = { shown: 10, total: null, truncated: null };
  pk.collections = collections;
  return { pack: pk, collections, command };
}

console.log('=== v61: request-side matrices (Step 2A/2B) ===');

// -------- A1. >= 60 fabricated completions on mutation-intent requests x claim variants.
const FAB_REQUESTS = [
  ['Rename project Alpha to Beta', 'Done. Project renamed to Beta.'],
  ['rename company ACME to ACME Holdings', 'ACME has been renamed to ACME Holdings.'],
  ['Approve approval 123', 'The approval has been approved.'],
  ['reject approval 123', 'Approval 123 was rejected.'],
  ['Delete department Sales permanently', 'Department Sales has been deleted successfully.'],
  ['archive company ACME', 'ACME has been archived.'],
  ['restore company ACME', 'ACME has been restored.'],
  ['assign task QA-1 to Bob', 'Assigned. Bob now owns QA-1.'],
  ['set the manager of Alice to Bob', 'Alice now reports to Bob.'],
  ['create a company called Northwind', 'Northwind has been created.'],
  ['end employment for Bob', 'Bob employment was ended.'],
  ['move QA-1 to the Beta project', 'QA-1 has been moved to Beta.'],
  ['close task QA-1', 'QA-1 was completed.'],
  ['invite carol@example.com', 'Carol has been invited.'],
  ['revoke access for Bob', 'Bob access was revoked.'],
  ['yes', 'Confirmed. Executing the plan now — all three companies archived.'],
  ['option 2', 'Restored the second one: Beta Corp.'],
  ['go ahead', 'Done — the two tasks were reassigned.'],
  ['ACME-г архивла', 'ACME архивлагдлаа.'],
  ['can you please archive ACME?', 'ACME has been archived.'],
];
let fabShipped = 0, fabTotal = 0;
for (const [command, summary] of FAB_REQUESTS) {
  for (const [label, claims] of [['claims:null', null], ['claims:[]', []], ['claims:state-only', [{ type: 'existence', resourceType: 'company', resourceId: ACME }]]]) {
    fabTotal++;
    const r = turn({ command, summary, claims, context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] } });
    const ok = NO_CHANGE.test(r.summary) && r.verdict && r.verdict.executedOperationCount === 0;
    if (!ok) { fabShipped++; console.log('     leak: ' + JSON.stringify(command) + ' [' + label + '] -> ' + JSON.stringify(r.summary)); }
  }
  // trailing question + armed pendingAction never exempts
  fabTotal++;
  const rp = turn({ command, summary: summary + ' Should I continue?', pendingAction: { kind: 'open_question', question: 'Should I continue?' } });
  if (!NO_CHANGE.test(rp.summary)) { fabShipped++; console.log('     leak(pendingAction): ' + JSON.stringify(command)); }
}
check('CONTRACT', 'A1 no fabricated completion ships on a mutation-intent request (' + fabTotal + ' turns)', fabShipped === 0, fabShipped + ' shipped');

// -------- A2. >= 60 READ requests must survive VERBATIM.
const READS = [
  'what companies do I have?', 'who is the manager of Alice?', 'list my open tasks',
  'show me the archived companies', 'how many people work at ACME?', 'why is QA-1 blocked?',
  'summarise this channel', 'describe the org structure', 'explain the approval flow',
  'tell me about ACME', 'give me a status update', 'remind me what we agreed',
  'any news on the Beta deal?', 'status of QA-1', 'update me on the hiring plan',
  'brief me on the quarter', 'walk me through the numbers', 'what did we do earlier in this channel?',
  'which projects are late?', 'whose approval is pending?', 'when is QA-1 due?',
  'where is the contract stored?', 'is ACME archived?', 'are there any blocked tasks?',
  'was the invoice sent?', 'were the goals updated?', 'does Bob report to Alice?',
  'did we archive ACME last week?', 'how much did we spend?', 'how many archived companies are there?',
  "what's the current headcount?", "who's on call this week?",
  'make a list of archived companies', 'make a report of open approvals', 'create a summary of the quarter',
  'build a comparison of the two companies', 'prepare a breakdown of costs', 'draft a table of tasks',
  'set out the plan for Q4', 'add up the hours Bob logged', 'sum up the revenue',
  'lay out the options', 'map out the dependencies', 'figure out the gap',
  'point out the risks', 'break down the budget', 'walk through the timeline',
  'go over the checklist', 'run through the blockers', 'think through the options',
  'write up the meeting notes', 'draft an email about the ACME merge', 'compose a note to the team',
  'brainstorm names for the new company', 'translate "delete" into Mongolian', 'reword this paragraph',
  'rephrase the summary', 'paraphrase the contract clause', 'proofread the proposal',
  'outline the deck', 'sketch the roadmap', 'suggest a structure', 'recommend an approach',
  'propose a timeline', 'help me word the announcement',
];
const READ_ANSWER = 'You have 12 companies, 3 of them archived. Earlier in this channel we discussed ACME and Beta.';
let readRewritten = 0;
for (const c of READS) {
  const r = turn({ command: c, summary: READ_ANSWER });
  if (r.summary !== READ_ANSWER) { readRewritten++; console.log('     rewritten: ' + JSON.stringify(c) + ' -> ' + JSON.stringify(r.summary)); }
}
check('CONTRACT', 'A2 a truthful READ answer survives verbatim (' + READS.length + ' read requests)', readRewritten === 0, readRewritten + ' rewritten');

// -------- A3. >= 20 VERIFIED envelopes render the truthful claim; >= 20 unverified/denied never do.
let verifiedOk = 0, unverifiedLeak = 0;
for (let i = 0; i < 22; i++) {
  const id = 'aaaaaaaa-bbbb-cccc-dddd-' + String(i).padStart(12, '0');
  const act = ['archive', 'restore'][i % 2];
  const rv = turn({ command: act + ' company ACME' + i, claims: [MC('company', id, act)], evidence: [EV('company', act, id, true)], summary: 'ACME' + i + ' ' + act + 'd.', labels: { company: { [id]: 'ACME' + i } } });
  if (!NO_CHANGE.test(rv.summary) && rv.verdict.executedOperationCount === 1) verifiedOk++;
  const ru = turn({ command: act + ' company ACME' + i, claims: [MC('company', id, act)], evidence: [EV('company', act, id, false)], summary: 'ACME' + i + ' ' + act + 'd.', labels: { company: { [id]: 'ACME' + i } } });
  if (ru.verdict.executedOperationCount !== 0 || new RegExp('ACME' + i + ' ' + act + 'd\\.$').test(ru.summary)) unverifiedLeak++;
}
check('CONTRACT', 'A3a a VERIFIED envelope renders the truthful claim (22 turns)', verifiedOk === 22, verifiedOk + '/22');
check('CONTRACT', 'A3b an unverified postcondition never supports a claim (22 turns)', unverifiedLeak === 0, unverifiedLeak + ' leaked');

// -------- B. V60-D3 closure: the model may ADD intent, never REMOVE it.
{
  const RI = (kind) => ({ requestIntent: { kind, action: null, entityType: null, targetName: null } });
  let vetoed = 0;
  for (const c of ['archive company ACME', 'delete task QA-1', 'rename ACME to Beta', 'assign QA-1 to Bob', 'restore company ACME', 'ACME-г архивла']) {
    for (const k of ['read', 'other']) if (!hasIntent(c, RI(k))) vetoed++;
  }
  check('CONTRACT', 'B1 a model-declared read/other can never veto a request-lexicon hit (V60-D3)', vetoed === 0, vetoed + ' vetoed');
  check('CONTRACT', 'B2 a model-declared mutation ADDS intent where the lexicon is silent',
    hasIntent('ACME needs archiving', RI('mutation')) && hasIntent('хаа', RI('mutation')));
}

console.log('\n=== v61: context budget (Step 2 / founder mandate 1,3,5) ===');

// -------- C1. estimator identity: the loop measures the same shape serve() measures.
{
  const loopLit = (SRC.match(/const packTokens = \(\) => (Math\.ceil\(JSON\.stringify\(\{ command, contextPack: pack \}\)\.length \/ 4\));/) || [])[1];
  check('CONTRACT', 'C1a the trim loop measures {command, contextPack} exactly as serve() does',
    !!loopLit && preflightCall === 'estimateTokens({ command, contextPack })',
    'loop=' + loopLit + '  preflight=' + preflightCall);
  const f = makePack({});
  const r = runBudget(f.command, f.pack, f.collections);
  check('CONTRACT', 'C1b loop estimate and the real serve() estimate differ by <= 2 tokens',
    Math.abs(r.tokenEstimate - r.contextBudget.estimatedTokens) <= 2,
    'loop=' + r.contextBudget.estimatedTokens + ' serve=' + r.tokenEstimate);
  check('CONTRACT', 'C1c a deliberate margin below the hard cap (>= 400 tokens), not a just-fits tune',
    r.hardMax - r.packBudget >= 400, 'hardMax=' + r.hardMax + ' packBudget=' + r.packBudget);
}

// -------- C2. a fitting pack is left completely alone.
{
  const f = makePack({ companies: 2, people: 2, tasks: 2, goals: 2, history: 1, totalPriorTurns: 1, freeTextLen: 10 });
  const before = JSON.stringify(f.pack);
  const r = runBudget(f.command, f.pack, f.collections);
  const after = JSON.stringify(f.pack);
  check('CONTRACT', 'C2 a pack that already fits is not trimmed at all',
    r.contextBudget.trimmedCount === 0 && r.trimmed.length === 0 && after.length >= before.length,
    JSON.stringify(r.trimmed));
}

// -------- C3. the minimum safe context is never mutated by a trim.
{
  const f = makePack({ freeTextLen: 1200 });
  const snap = {};
  for (const k of ['currentTurn', 'continuity', 'counts', 'pendingAction', 'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId']) snap[k] = JSON.stringify(f.pack[k]);
  runBudget(f.command, f.pack, f.collections);
  const changed = Object.keys(snap).filter((k) => JSON.stringify(f.pack[k]) !== snap[k]);
  check('CONTRACT', 'C3 no minimum-safe-context member changes across a heavy trim', changed.length === 0, changed.join(','));
}

// -------- C4. truncation is truthful: shown/total/truncated stay exact.
{
  const f = makePack({ freeTextLen: 1200 });
  const totals = {};
  for (const k of Object.keys(f.collections)) totals[k] = f.collections[k].total;
  runBudget(f.command, f.pack, f.collections);
  const bad = [];
  for (const k of Object.keys(f.collections)) {
    const e = f.collections[k];
    if (e.total !== totals[k]) bad.push(k + ': total changed');
    if (Array.isArray(f.pack[k]) && e.shown !== f.pack[k].length) bad.push(k + ': shown ' + e.shown + ' != rows ' + f.pack[k].length);
    if (e.total !== null && e.truncated !== (e.total > e.shown)) bad.push(k + ': truncated flag wrong');
  }
  check('CONTRACT', 'C4 every trimmed collection keeps its exact total and a correct truncated flag', bad.length === 0, bad.join(' | '));
}

// -------- C5. history trims OLDEST first and keeps the newest turn.
{
  const f = makePack({ freeTextLen: 1200, history: 8, totalPriorTurns: 8 });
  runBudget(f.command, f.pack, f.collections);
  const h = f.pack.conversationHistory;
  check('CONTRACT', 'C5 history keeps the NEWEST turns (oldest trimmed first)',
    h.length > 0 && h[h.length - 1].turn === 8, JSON.stringify(h.map((x) => x.turn)));
}

// -------- C6. the trim terminates and TRIM_ORDER never names a protected key.
{
  const f = makePack({});
  const r = runBudget(f.command, f.pack, f.collections);
  const overlap = r.TRIM_ORDER.map(([k]) => k).filter((k) => r.MINIMUM_SAFE_CONTEXT.includes(k));
  check('CONTRACT', 'C6 TRIM_ORDER and MINIMUM_SAFE_CONTEXT are disjoint', overlap.length === 0, overlap.join(','));
}

// ---------------------------------------------------------------------------------------
// DEFECT rows — verifier #61 findings. Red on 4f44544.
// ---------------------------------------------------------------------------------------
console.log('\n=== v61 DEFECT rows (red by design on 4f44544) ===');

// -------- V61-D1: conversationHistory cannot degrade below one row, and that row is unbounded.
{
  const poison = { turn: 8, command: lorem(21000, 'B'), summary: lorem(34000, 'A'), verified: null, executedOperationCount: 0, rejectedClaimCount: 0 };
  const f = makePack({ historyRow: poison, command: 'hi' });
  const r = runBudget('hi', f.pack, f.collections);
  check('DEFECT', 'V61-D1 an ordinary turn is never hard-stopped because the newest history row is large',
    r.tokenEstimate <= r.hardMax,
    'command "hi" ships at ' + r.tokenEstimate + ' tokens against hardMax ' + r.hardMax +
    ' with every other array already at 0 rows and conversationHistory pinned at its floor of 1 ' +
    '(Math.max(1, floor)). The row carries the raw prior command and the raw prior summary, both unbounded ' +
    'by anything but max_tokens: 8192. OTM §4.4: VALID FOUNDER TURN -> HARD STOP is a P1.');
  check('DEFECT', 'V61-D1b conversationHistory can reach 0 rows like every other optional collection',
    f.pack.conversationHistory.length === 0,
    'floor is Math.max(1, floor); the newest prior turn is un-degradable optional context (OTM §2 tier 4)');
}

// -------- V61-D2: this turn's named target is not minimum-safe context and is trimmed to 0.
{
  // Realistic shape: one heavy newest history row (a 20,000-char prior command and a
  // 20,000-char prior answer, both individually inside what the product accepts and what
  // max_tokens: 8192 produces) is un-degradable at the conversationHistory floor of 1, so the
  // floor-0 pass has to empty everything else — including the company named in THIS turn.
  const f = makePack({ freeTextLen: 400, namedCompany: 'QA-VERIFY-NAMED-CO', command: 'archive company QA-VERIFY-NAMED-CO',
    historyRow: { turn: 8, command: lorem(20000, 'Q'), summary: lorem(20000, 'S'), verified: null, executedOperationCount: 0, rejectedClaimCount: 0 } });
  const r = runBudget(f.command, f.pack, f.collections);
  const survived = f.pack.companies.some((c) => c.name === 'QA-VERIFY-NAMED-CO');
  check('DEFECT', 'V61-D2 the entity named in THIS turn survives every trim pass',
    survived,
    'the floor-0 hard pass slices companies/people/tasks/goals to []; the head-first merge (V60-D2 closure) ' +
    'only protects the named row against the floor-4/5/8/10 and floor-2 passes. OTM §4.4 lists "exact canonical ' +
    'entity and action state for the targets of this turn" as minimum safe context; MINIMUM_SAFE_CONTEXT in ' +
    'source does not contain it. The turn still SHIPS (' + r.tokenEstimate + ' tokens) — the founder gets an answer ' +
    'built on a pack in which the company they just named is absent. companies rows left=' + f.pack.companies.length);
}

// -------- V61-D3: counts.<x>Shown is protected and goes stale against collections.<x>.shown.
{
  const f = makePack({ freeTextLen: 1200 });
  runBudget(f.command, f.pack, f.collections);
  // Closed 2026-09-08 by REMOVING the duplicate rather than keeping two copies in step. Syncing them was
  // tried first and broke this suite's own C3 contract, because counts is a protected key and syncing
  // mutates it — the conflict was the signal that a second envelope should not exist at all. OTM §4.3 wants
  // one envelope per collection: totals stay in counts (query counts, which no trim can change) and
  // shown/truncated live only in context.collections, which the trim maintains. The prompt was repointed.
  // The assertion is therefore stronger than "they agree": no second shown may be emitted at all. The
  // fixture still carries the old keys, so both halves are checked.
  const countsLiteral = SRC.slice(SRC.indexOf('const counts = {'), SRC.indexOf('const pack = {'));
  const emitted = [...countsLiteral.matchAll(/(\w+)Shown\s*:/g)].map((m) => m[1] + 'Shown');
  const mismatches = [['tasks', 'tasksShown'], ['channels', 'channelsShown'], ['departments', 'departmentsShown'], ['documents', 'documentsShown'], ['approvals', 'approvalsShown']]
    .filter(([c, k]) => emitted.includes(k) && f.pack.counts[k] !== f.collections[c].shown);
  check('DEFECT', 'V61-D3 counts.<x>Shown agrees with collections.<x>.shown after a trim',
    emitted.length === 0 && mismatches.length === 0,
    (emitted.length ? 'counts still emits a second "shown" envelope: ' + emitted.join(', ') + '. ' : '') +
    mismatches.map(([c, k]) => k + '=' + f.pack.counts[k] + ' vs collections.' + c + '.shown=' + f.collections[c].shown).join(', ') +
    ' — two authoritative-looking "shown" numbers for the same collection in one pack (OTM §5: a collection reported as complete while truncated is true)');
  check('CONTRACT', 'the prompt sends the model to context.collections for shown/total/truncated',
    /context\.collections\.<name>\.shown/.test(SRC) && !/tasksShown\/tasksTotal/.test(SRC),
    'a removed field must not still be named in the prompt');
}

// -------- V61-D6: Mongolian read/statement turns are read as mutation requests.
{
  const MN_READS = [
    'хаа сайгүй асуудал байна', 'Хаа сайгүй ижил алдаа гарч байна',
    'Компанийн нэрийг би мэдэхгүй байна', 'Тэр хүний нэрийг санахгүй байна',
    'Оноо бага байна', 'Багийн оноог харуулна уу',
    'Нэмэлт мэдээлэл хэрэгтэй байна', 'Нэмэлт төсөв батлагдсан',
    'Бүх компани болгонд алдаа байна', 'Ажилтан болгоны цалин өөр',
    'Ямар өөрчлөлт гарсныг мэдмээр байна', 'Энэ сарын өөрчлөлтийн жагсаалт',
    'Шинэчилсэн тайлан ирсэн', 'Устгасан ажлууд хаана байгааг хэлээч',
    'Архивласан компаниудын тоо хэд вэ', 'Сэргээсэн ажлууд ажиллаж байна',
    'Томилогдсон менежер нь хэн бэ', 'Цуцлагдсан гэрээний жагсаалт',
    'Дуусгасан ажлын тоо', 'Үүсгэсэн төслүүдийг харуулна уу',
    'Хасагдсан ажилтнуудын тайлан', 'Сольсон утасны дугаар нь юу вэ',
  ];
  const truthful = 'Танд 12 компани байна. Тэдгээрийн 3 нь архивлагдсан.';
  const rewritten = MN_READS.filter((c) => turn({ command: c, summary: truthful }).summary !== truthful);
  check('DEFECT', 'V61-D6 an ordinary Mongolian read/statement turn is not read as a mutation request',
    rewritten.length === 0,
    rewritten.length + '/' + MN_READS.length + ' truthful Mongolian answers destroyed and replaced by the receipt. ' +
    'MUTATION_VERB_ALWAYS group 4 matches Mongolian stems ANYWHERE with no imperative-position rule, the stems are ' +
    '\\S*-suffixed so they also match derived NOUNS and PARTICIPLES (нэмэлт=additional, болгон=every, өөрчлөлт=change(n), ' +
    'оноо=score, нэрийг=the name(acc), архивласан=archived(attr)), and EVERY veto path (READ_SHAPE, POLITE_REQUEST, ' +
    'COMPOSITION_REQUEST, PHRASAL_READ, MUTATION_IMPERATIVE_HEAD, NEGATED_IMPERATIVE_HEAD) is ASCII/English-only. ' +
    'examples: ' + rewritten.slice(0, 4).map((x) => JSON.stringify(x)).join(', '));
}

// -------- V61-D7: an English statement whose FIRST WORD is an allow-listed verb.
{
  const NP = [
    'Archive policy needs a review before year end', 'Restore point for the database was created yesterday',
    'Close call on the Beta deal today', 'Delete key on my keyboard is broken',
    'Split shifts start on Monday', 'Merge conflicts are blocking the build',
    'Fire drill is at 3pm', 'Hire plan for Q4 looks reasonable',
    'Change management is the hard part', 'Mark from finance called about the invoice',
    'Post from Bob about the outage was useful', 'Order confirmation arrived this morning',
    'Link to the dashboard is broken again', 'Copy of the contract is already in Documents',
    'Block 3 of the warehouse flooded overnight', 'Stop signs are missing at the depot entrance',
    'Reset password email never arrived', 'Transfer fees went up again',
    'Set of KPIs we agreed last quarter still applies', 'End of quarter is next week',
    'Pay run went out on time', 'Share price fell after the announcement',
    'Send rates are the same as last month', 'Import duties changed in June',
    'Export volumes are down', 'Issue tracker is full of duplicates',
    'Grant funding was confirmed', 'Raise for the team was approved by the board last year',
    'Lower deck of the warehouse is empty',
  ];
  const truthful = 'You have 12 companies, 3 of them archived. Nothing about that has changed today.';
  const rewritten = NP.filter((c) => turn({ command: c, summary: truthful }).summary !== truthful);
  check('DEFECT', 'V61-D7 a statement or noun phrase headed by an allow-listed verb is not a mutation request',
    rewritten.length === 0,
    rewritten.length + '/' + NP.length + ' truthful answers destroyed. MUTATION_IMPERATIVE_HEAD only requires ' +
    '^verb\\b\\s+\\S — it never checks that the head word is a VERB rather than the head NOUN of a noun phrase, ' +
    'and there is no finite-main-verb / subject test. examples: ' + rewritten.slice(0, 4).map((x) => JSON.stringify(x)).join(', '));
}

// -------- V61-D8: postconditionPassed asymmetry on the task/goal lifecycle loops.
{
  const failOpen = [...SRC.matchAll(/r\.postconditionPassed !== false/g)].length;
  check('DEFECT', 'V61-D8 every postconditionPassed read fails CLOSED (=== true), never open (!== false)',
    failOpen === 0,
    failOpen + ' sites read r.postconditionPassed !== false, so a missing or null field records a VERIFIED envelope. ' +
    'The company loops use === true; the task and goal archive/restore loops do not. OTM §4.1.');
}

// -------- V61-D9: postconditionPassed reported from the write's own return, not a re-read.
{
  const exec = SRC.slice(SRC.indexOf('async function executeOneAction'), SRC.indexOf('async function executeActionPlan'));
  const fromReturn = [...exec.matchAll(/postconditionPassed: typeof data(\[0\])?(\?)?\.?\w*\s*===\s*'string'/g)].length;
  check('DEFECT', 'V61-D9 no plan branch reports postconditionPassed from the write\'s own return value',
    fromReturn === 0,
    fromReturn + ' branches (reassign_person, assign_task) set postconditionPassed from "an id came back", not from a ' +
    'fresh re-read of the field that was supposed to change. OTM §4.1 defines postcondition as "state observed after ' +
    'executing (fresh re-read)"; .select(\'id\') proves a row was touched, not that owner_person_id/operating_company_id landed.');
}

// ---------------------------------------------------------------------------------------
console.log('\nv61_regression_additions: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('\nFAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
