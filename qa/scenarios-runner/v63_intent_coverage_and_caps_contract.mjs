#!/usr/bin/env node
// VERIFIER #63 / campaign #123 — regression additions for candidate 24e454f
// (index.ts sha256 86620b369baa800178678af5d032c62fdce321eaa954d4ff957e3feec833769c).
//
// Two kinds of row:
//   CONTRACT — a property that HOLDS on these bytes and must keep holding.
//   DEFECT   — a V63 finding, written as the assertion that would hold once it is FIXED.
//              While the defect is open the row FAILS, and this file exits nonzero.
//
// Runnable with plain node from ANY cwd. Source under test: SEM_INDEX_SRC, else the repo copy
// resolved relative to this file. No network, no DB, no deploy. Nothing here re-implements a
// product rule: every behavioural row executes a window sliced out of index.ts itself.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS, withPatternsAboveWindow, withSourceHelpers } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const RAW = readFileSync(SRC_PATH, 'utf8');
const src = RAW.replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (kind, name, cond, detail) => {
  if (cond) { pass++; console.log(`OK   [${kind}] ${name}`); }
  else { failures.push({ kind, name, detail }); console.log(`FAIL [${kind}] ${name}`); }
};

// ═══════════════════════════════════════════════════════════ shared harness pieces
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const DENO = { env: { get: () => undefined } };
const fill = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// --- the REAL context-budget block
const bS = src.indexOf('  const packBudget = Math.max(2000,');
const bEnd = 'contextBudget.overBudget = contextBudget.estimatedTokens > packBudget;';
const bE = src.indexOf(bEnd, bS);
if (bS < 0 || bE < 0) throw new Error('v63: the context-budget block was not found — update this harness, never let it pass');
// The budget block calls module-level helpers (envPositiveInt) that live outside the window; the shared
// extractor hoists their REAL definitions from the source under test rather than re-implementing them.
const BUDGET_SRC = withSourceHelpers(src, stripTS(src.slice(bS, bE + bEnd.length)));
const runBudget = new Function('command', 'pack', 'collections', 'Deno',
  BUDGET_SRC + '\n; return { estimate: packTokens(), budget: packBudget, trimmed: contextTrimmed, contextBudget, provenanceIds, minimum: MINIMUM_SAFE_CONTEXT, trimOrder: TRIM_ORDER.map((t) => t[0]) };');

// --- the REAL request-intent derivation
const iS = src.indexOf('        const MUTATION_ARRAY_FIELDS = [');
const iE = src.indexOf('        void lexiconReadVetoed;', iS);
if (iS < 0 || iE < 0) throw new Error('v63: the request-intent block was not found — update this harness, never let it pass');
const deriveIntent = new Function('command', 'result', stripTS(src.slice(iS, iE)) + '\n; return requestedIntent;');
const intentOf = (command, result = {}) => deriveIntent(command, result);

// --- the REAL structured-claim window (the receipt)
function structuredWindow(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (start < 0 || anchor < 0) throw new Error('v63: the structured-claim window was not found — update this harness');
  return withPatternsAboveWindow(source, stripTS(source.slice(start, source.indexOf('};', anchor) + 2)));
}
const claimFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  structuredWindow(src) + '\n; return { summary: result.summary, verdict: result.turnVerdict };');
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const mk = (o) => new Map(Object.entries(o || {}));
const runTurn = ({ command, summary, claims = null, pendingAction = null, evidence = [] }) => {
  globalThis.command = command; globalThis.lifecycleReports = []; globalThis.factLines = [];
  globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v63' };
  return claimFn({ claims, summary, pendingAction }, evidence, { companies: [{ id: ACME, name: 'ACME', status: 'active' }] },
    'gpt', false, false, DENO, mk({ [ACME]: 'ACME' }), mk(), mk(), mk(), false, '', mk());
};
const NO_CHANGE = /No change was made — /;

// --- a realistic pack, built from the .limit() caps read out of index.ts
const CAPS = {};
for (const m of src.matchAll(/supabase\.from\('([a-z_]+)'\)\.select\((?:[\s\S]{0,400}?)\.limit\((\d+)\)/g)) {
  CAPS[m[1]] = Math.max(CAPS[m[1]] || 0, Number(m[2]));
}
const NAMED_CAP = Number((src.match(/const NAMED_LOOKUP_ROW_CAP = (\d+)/) || [])[1]);
const CO = (i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
function buildPack({ long = false, history = 8, command = 'archive ACME Holdings Group', archivedCompanies = 6 } = {}) {
  const nm = (b, i) => (long ? 'A deliberately long ' + b + ' name of the kind a real operating workspace produces, entry ' : b + ' ') + i;
  const pack = {
    continuity: { totalPriorTurns: history, historyWindowStart: 1, historyWindowEnd: history, historyIsComplete: history <= 8, compactionCheckpoint: null, channelStateVersion: 3 },
    namedTargets: {
      companies: fill(NAMED_CAP, (i) => ({ id: CO(900 + i), name: nm('Named company', i), status: i % 2 ? 'archived' : 'active' })),
      people: fill(NAMED_CAP, (i) => ({ id: 'p9' + i, full_name: nm('Named person', i), company_id: CO(1), active: true })),
      tasks: fill(NAMED_CAP, (i) => ({ id: 't9' + i, title: nm('Named task', i), status: 'queued' })),
      goals: fill(NAMED_CAP, (i) => ({ id: 'g9' + i, title: nm('Named goal', i), status: 'active' })),
      projects: fill(NAMED_CAP, (i) => ({ id: 'pr9' + i, title: nm('Named project', i), status: 'active' })),
      departments: fill(NAMED_CAP, (i) => ({ id: 'd9' + i, name: nm('Named department', i) })),
    },
    companies: fill(CAPS.companies ? 12 : 12, (i) => ({ id: CO(i), name: nm('Company', i), status: 'active', organization_type: 'legal_entity', strategic_priority: 5, risk_score: 1, effectivelyActive: true })),
    archivedCompanies: fill(archivedCompanies, (i) => ({ id: CO(500 + i), name: nm('Archived company', i), status: 'archived', organization_type: 'legal_entity', updated_at: '2026-09-01T00:00:00.000Z' })),
    projects: fill(CAPS.projects ?? 20, (i) => ({ id: 'pr' + i, company_id: CO(1), title: nm('Project', i), status: 'active', deadline: null, blockers: null, risk_score: 1 })),
    tasks: fill(CAPS.tasks ?? 15, (i) => ({ id: 't' + i, company_id: CO(1), project_id: null, title: nm('Task', i), status: 'queued', priority: 'medium', risk_level: 'low', approval_required: false, deadline: null, owner_type: 'human', owner_person_id: null, owner_agent_id: null })),
    memories: fill(8, (i) => ({ id: 'm' + i, company_id: CO(1), entity_type: 'company', entity_id: CO(1), fact: nm('Remembered fact', i), confidence: 0.8, sensitivity: 'internal' })),
    agents: fill(CAPS.agents ?? 20, (i) => ({ id: 'ag' + i, name: nm('Agent', i), role: 'engineer', skills: ['ts'], cost_limit_usd: 20 })),
    products: fill(CAPS.product_lines ?? 20, (i) => ({ id: 'pl' + i, company_id: CO(1), name: nm('Product line', i), currency: 'USD', unit_price: 1, service_fee_monthly: 1, active: true })),
    inventory: fill(CAPS.inventory_items ?? 20, (i) => ({ id: 'inv' + i, company_id: CO(1), product_line_id: 'pl0', sku: 'S' + i, quantity_on_hand: 1, reserved_quantity: 0, reorder_point: 1, location: nm('Warehouse', i) })),
    approvals: fill(CAPS.approvals ?? 20, (i) => ({ id: 'ap' + i, company_id: CO(1), title: nm('Approval', i), status: 'pending', risk_level: 'low', reason: 'r' })),
    people: fill(CAPS.people ?? 30, (i) => ({ id: 'p' + i, full_name: nm('Person', i), email: 'p@x.z', role_title: 'R', company_id: CO(1), active: true, effectivelyActive: true })),
    goals: fill(CAPS.goals ?? 20, (i) => ({ id: 'g' + i, company_id: CO(1), title: nm('Goal', i), status: 'active', kind: 'objective' })),
    companyRelationships: fill(CAPS.company_relationships ?? 20, (i) => ({ id: 'cr' + i, company_id: CO(1), related_company_id: CO(2), owner_profile_id: null, relationship_type: 'parent_of', ownership_pct: 100, state: 'current' })),
    personAssignments: fill(CAPS.person_assignments ?? 30, (i) => ({ id: 'pa' + i, person_id: 'p' + i, legal_employer_company_id: CO(1), operating_company_id: CO(1), manager_person_id: 'p0', job_title: nm('Job title', i), state: 'active' })),
    financialReports: fill(CAPS.financial_reports ?? 20, (i) => ({ id: 'fr' + i, company_id: CO(1), period: '2026-01', revenue: 1, expenses: 1, net_income: 0, cash_position: 1, health_status: 'ok', summary: nm('Financial summary', i) })),
    conversationHistory: fill(history, (i) => ({ turn: i + 1, command: nm('cmd', i), summary: nm('sum', i), verified: true, executedOperationCount: 1, rejectedClaimCount: 0 })),
    factoryWorkOrders: fill(10, (i) => ({ id: 'fw' + i, title: nm('Work order', i), status: 'queued' })),
    channels: fill(CAPS.chat_channels ?? 15, (i) => ({ id: 'ch' + i, name: nm('Channel', i), company_id: CO(1) })),
    activeChannelId: 'ch0',
    departments: fill(CAPS.departments ?? 30, (i) => ({ id: 'dp' + i, name: nm('Department', i), company_id: CO(1) })),
    leads: fill(CAPS.sales_leads ?? 30, (i) => ({ id: 'ld' + i, client_name: nm('Client', i), company_id: CO(1), stage: 'q', value_estimate: 1 })),
    documents: fill(CAPS.documents ?? 30, (i) => ({ id: 'dc' + i, title: nm('Document', i), company_id: CO(1), category: 'g' })),
    proposals: fill(CAPS.proposals ?? 20, (i) => ({ id: 'pp' + i, title: nm('Proposal', i), company_id: CO(1), status: 'draft' })),
    productSpecs: fill(CAPS.product_specs ?? 20, (i) => ({ id: 'ps' + i, title: nm('Spec', i), company_id: CO(1), status: 'draft' })),
    engineeringDrawings: fill(CAPS.engineering_drawings ?? 20, (i) => ({ id: 'ed' + i, title: nm('Drawing', i), company_id: CO(1) })),
    aiProviders: fill(CAPS.ai_providers ?? 10, (i) => ({ id: 'ai' + i, provider: 'a', model: 'm', label: 'L', is_active: false })),
    mcpConnectors: fill(CAPS.mcp_connectors ?? 10, (i) => ({ id: 'mc' + i, name: 'C', endpoint_url: 'u' })),
    archivedTasks: fill(15, (i) => ({ id: 'at' + i, company_id: CO(1), title: nm('Archived task', i) })),
    pendingAction: null, recentlyResolvedEntities: null, recentlyDeletedEntities: null,
    collections: null,
    counts: { tasksTotal: 60, approvalsTotal: 40, companiesTotal: 40, peopleTotal: 90, projectsTotal: 40, goalsTotal: 40, salesLeadsTotal: 60, inventoryItemsTotal: 40, channelsTotal: 30, departmentsTotal: 60, documentsTotal: 60 },
    currentTurn: { turn: history + 1, command },
  };
  // Envelopes exactly as index.ts builds them, INCLUDING the two literals that hardcode total: null.
  const collections = {};
  for (const k of Object.keys(pack)) {
    if (!Array.isArray(pack[k])) continue;
    if (k === 'memories') { collections[k] = { shown: pack[k].length, total: null, truncated: null, scope: 'top-8 semantic retrieval' }; continue; }
    if (k === 'factoryWorkOrders') { collections[k] = { shown: pack[k].length, total: null, truncated: null, scope: 'newest 10' }; continue; }
    const total = pack[k].length * 3 + 1;
    collections[k] = { shown: pack[k].length, total, truncated: total > pack[k].length };
  }
  pack.collections = collections;
  return { pack, collections, command };
}

// ═══════════════════════════════════════════════════════════ CONTRACT — the budget path
{
  const { pack, collections, command } = buildPack({ long: true, history: 120 });
  const r = runBudget(command, pack, collections, DENO);
  const serveSide = Math.ceil(JSON.stringify({ command, contextPack: pack }).length / 4);
  check('CONTRACT', 'V63-C1 the pack-loop estimator and the serve() preflight estimator measure the SAME serialized shape',
    /function estimateTokens\(x: unknown\)\{ return Math\.ceil\(JSON\.stringify\(x\)\.length \/ 4\); \}/.test(src)
    && /const packTokens = \(\) => Math\.ceil\(JSON\.stringify\(\{ command, contextPack: pack \}\)\.length \/ 4\)/.test(src)
    && /tokenEstimate = estimateTokens\(\{ command, contextPack \}\)/.test(src)
    && serveSide - r.estimate <= 1 && serveSide >= r.estimate,
    `block ${r.estimate}, serve ${serveSide} — the only admissible drift is the digits of estimatedTokens written into the field it measures`);
  check('CONTRACT', 'V63-C2 the shipped request is at or under the pack budget as serve() measures it',
    serveSide <= r.budget, `serve ${serveSide} > budget ${r.budget}`);
  const keys = Object.keys(pack).filter((k) => k !== 'contextBudget');
  const unclassified = keys.filter((k) => !r.minimum.includes(k) && !r.trimOrder.includes(k));
  check('CONTRACT', 'V63-C3 every pack key is either MINIMUM_SAFE_CONTEXT or in TRIM_ORDER — no key sits silently outside both',
    unclassified.length === 0, JSON.stringify(unclassified));
  check('CONTRACT', 'V63-C4 TRIM_ORDER and MINIMUM_SAFE_CONTEXT are disjoint and the pre-loop guard throws if they ever overlap',
    /if \(MINIMUM_SAFE_CONTEXT\.includes\(key\)\) throw new Error\('TRIM_ORDER names a minimum-safe-context key/.test(src)
    && r.trimOrder.every((k) => !r.minimum.includes(k)));
}
{
  // A fitting pack is untouched.
  const { pack, collections, command } = buildPack({ history: 1 });
  for (const k of Object.keys(pack)) if (Array.isArray(pack[k])) pack[k] = pack[k].slice(0, 1);
  const before = JSON.stringify(pack);
  const r = runBudget(command, pack, collections, DENO);
  check('CONTRACT', 'V63-C5 a pack that already fits is not trimmed and gains nothing but its own contextBudget field',
    r.trimmed.length === 0 && JSON.stringify(pack) === before.replace(/\}$/, ',"contextBudget":' + JSON.stringify(r.contextBudget) + '}'),
    'estimate ' + r.estimate + ' budget ' + r.budget + ' trims ' + r.trimmed.length);
}
{
  // The minimum safe context survives the hardest trim, byte for byte, and history keeps the NEWEST turns.
  const { pack, collections, command } = buildPack({ long: true, history: 200 });
  const snap = {};
  for (const k of ['currentTurn', 'continuity', 'counts', 'pendingAction', 'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId', 'namedTargets']) snap[k] = JSON.stringify(pack[k]);
  const newest = pack.conversationHistory[pack.conversationHistory.length - 1].turn;
  const idsBefore = {};
  for (const k of Object.keys(pack)) if (Array.isArray(pack[k])) idsBefore[k] = pack[k].map((x) => x && x.id).filter((x) => typeof x === 'string');
  const r = runBudget(command, pack, collections, DENO);
  check('CONTRACT', 'V63-C6 every MINIMUM_SAFE_CONTEXT member is byte-identical after the hardest trim',
    Object.keys(snap).every((k) => JSON.stringify(pack[k]) === snap[k]),
    JSON.stringify(Object.keys(snap).filter((k) => JSON.stringify(pack[k]) !== snap[k])));
  check('CONTRACT', 'V63-C7 conversationHistory trims the OLDEST turns and keeps the newest',
    pack.conversationHistory.length === 0 || pack.conversationHistory[pack.conversationHistory.length - 1].turn === newest);
  const lost = [];
  for (const k of Object.keys(idsBefore)) {
    const prov = new Set(r.provenanceIds[k] || []);
    for (const id of idsBefore[k]) if (!prov.has(id)) lost.push(k + ':' + id);
  }
  check('CONTRACT', 'V63-C8 id provenance is captured BEFORE the trim and covers every pre-trim row id (the V62-D1 closure)',
    lost.length === 0, lost.slice(0, 6).join(','));
  check('CONTRACT', 'V63-C9 provenance travels BESIDE the pack, never inside it (it must not spend the budget it protects)',
    !('provenanceIds' in pack) && !JSON.stringify(pack).includes('provenanceIds'));
}
{
  // Termination and the honest refusal.
  const { pack, collections } = buildPack({ long: true, history: 200 });
  const huge = 'z'.repeat(60000);
  pack.currentTurn.command = huge;
  const t0 = Date.now();
  const r = runBudget(huge, pack, collections, DENO);
  check('CONTRACT', 'V63-C10 the trim loop terminates even when the minimum alone cannot fit', Date.now() - t0 < 20000);
  check('CONTRACT', 'V63-C11 an irreducible pack states overBudget=true rather than pretending to fit', r.contextBudget.overBudget === true);
  check('CONTRACT', 'V63-C12 even at the hardest floor the current command and the named targets are intact',
    pack.currentTurn.command === huge && pack.namedTargets.companies.length === NAMED_CAP);
  check('CONTRACT', 'V63-C13 the whole-request refusal names WHICH limit it hit and states that nothing was changed',
    /limit: 'context pack'/.test(src) && /limit: 'model context window'/.test(src) && /limit: 'attached image size'/.test(src)
    && (src.match(/Nothing was changed\. This is a refusal to run the turn/g) || []).length === 3);
}

// ═══════════════════════════════════════════════════════════ CONTRACT — the receipt and the belt
{
  const r = runTurn({ command: 'archive the company ACME', summary: 'All set — ACME is now archived.' });
  check('CONTRACT', 'V63-C14 a plain imperative mutation with an empty ledger ends in the deterministic receipt',
    NO_CHANGE.test(r.summary) && r.verdict.receiptRendered === true && r.verdict.executedOperationCount === 0, JSON.stringify(r.summary));
  const read = 'You have 12 active companies and 6 archived ones.';
  const r2 = runTurn({ command: 'how many companies do I have?', summary: read });
  check('CONTRACT', 'V63-C15 a truthful READ answer survives verbatim (nothing is rewritten on text shape alone)',
    r2.summary === read, JSON.stringify(r2.summary));
  check('CONTRACT', 'V63-C16 the belt is never the sole reason a reply is rewritten (both arms require requestedIntent !== null)',
    (src.match(/&& requestedIntent !== null && readsAsCompletion\(/g) || []).length === 2);
}

// ═══════════════════════════════════════════════════════════ DEFECT rows
// ───────────────────────────────────── V63-D1
{
  const { pack, collections, command } = buildPack({ long: true, history: 120 });
  const before = {};
  for (const k of Object.keys(pack)) if (Array.isArray(pack[k])) before[k] = pack[k].length;
  runBudget(command, pack, collections, DENO);
  const silent = [];
  for (const k of Object.keys(before)) {
    if (pack[k].length >= before[k]) continue;
    const env = collections[k];
    if (!env || env.truncated !== true) silent.push(`${k} ${before[k]}->${pack[k].length} truncated=${JSON.stringify(env && env.truncated)} total=${JSON.stringify(env && env.total)}`);
  }
  check('DEFECT', 'V63-D1 every TRIMMED collection reports truncated=true and an exact total (OTM §4.4)',
    silent.length === 0,
    `${silent.length} collections cannot express their own trim: ${JSON.stringify(silent)}. `
    + 'memories and factoryWorkOrders hardcode total:null/truncated:null in the envelope literals '
    + '(index.ts collections{}), and `env.truncated = env.total === null ? null : ...` leaves truncated null '
    + 'after a trim. V62-D4 is NOT closed: the count:exact the closure note claims is absent on the primary '
    + 'paths (the match_memories RPC returns no count; the non-factory-intent canonical_work_orders query '
    + 'carries none) and is discarded by the literals in any case. Their `scope` strings ("top-8 semantic '
    + 'retrieval", "newest 10") also become FALSE statements about the pack after a trim.');
}
// ───────────────────────────────────── V63-D2
{
  const p0 = src.indexOf('function packIdSet(...names: string[]): Set<string> {');
  const packIdSetSrc = stripTS(src.slice(p0, src.indexOf('\n        }', p0) + '\n        }'.length));
  const a0 = src.indexOf('        const archivedCompanyIds = new Set(');
  const a1 = src.indexOf('        const contextPersonIds = packIdSet', a0);
  // stripTS does not handle a GENERIC arrow (`= <T extends {...}>(items: T[]): T[] =>`), which is the shape
  // dropArchivedCompanyTarget uses — i.e. no suite in the battery can execute this window at all.
  const archivedSrc = stripTS(src.slice(a0, a1).replace(/=\s*<[A-Za-z][\s\S]*?>\(/g, '= ('));
  const gate = new Function('contextPack', 'contextProvenance',
    packIdSetSrc + '\n' + archivedSrc + '\nreturn { trusted: packIdSet("companies","archivedCompanies"), archivedSeen: archivedCompanyIds, drop: dropArchivedCompanyTarget };');
  const ID = '00000000-0000-4000-8000-0000000000aa';
  const row = { id: ID, name: 'QA-VERIFY-ARCHIVED-CO', status: 'archived' };
  const namedTargets = { companies: [row], people: [], tasks: [], goals: [], projects: [], departments: [] };
  const prov = { companies: [ID], archivedCompanies: [ID] };
  const untrimmed = gate({ companies: [row], archivedCompanies: [row], namedTargets }, prov);
  const floored = gate({ companies: [], archivedCompanies: [], namedTargets }, prov);
  const survives = (g) => g.drop([{ companyId: ID, companyIndex: null }]).length === 1;
  check('CONTRACT', 'V63-C17 the archived-parent creation block DOES fire on an untrimmed pack (the row is not vacuous)',
    untrimmed.trusted.has(ID) && untrimmed.archivedSeen.has(ID) && !survives(untrimmed));
  check('DEFECT', 'V63-D2 the archived-parent creation block survives a trim (it must be built from provenance + namedTargets, like every other id gate)',
    floored.trusted.has(ID) === true && floored.archivedSeen.has(ID) === true && !survives(floored),
    'After the hard floor pass the id is still TRUSTED (contextCompanyIds = packIdSet(...) unions the pre-trim '
    + 'provenance and namedTargets) but is no longer KNOWN-ARCHIVED, because archivedCompanyIds (index.ts, '
    + '`new Set([...(contextPack?.companies||[]), ...(contextPack?.archivedCompanies||[])])`) reads the RAW '
    + 'TRIMMED arrays. dropArchivedCompanyTarget then lets a createProjects / createGoals / createLeads / '
    + 'createDocuments / createPersonAssignments through against an ARCHIVED company. The trust gate is '
    + 'trim-proof and the refusal gate is not — the asymmetry runs in the unsafe direction. Measured '
    + 'reachability on a turn that still ANSWERS (never refused): a pasted command of ~17,000 characters '
    + 'floors companies to 2 and ~18,000 floors archivedCompanies to 0.');
}
// ───────────────────────────────────── V63-D3  (P1)
{
  const FN = [
    ['archive ACME then tell me', 'EN compound: the imperative is in the FIRST clause and the last clause is read-shaped'],
    ['archive ACME and tell me when it is done', 'EN compound, the most ordinary founder phrasing'],
    ['restore Zenith then show me the list', 'EN compound, restore'],
    ['permanently delete the fixture company QA-TEST', 'EN: an adverb before the imperative defeats the head rule'],
    ['quickly archive ACME', 'EN adverb'],
    ['immediately restore Zenith', 'EN adverb'],
    ['urgently delete the lead Acme Corp', 'EN adverb'],
    ['invite dorj@example.com as engineer', 'EN: an email address is not a referring IMPERATIVE_OBJECT'],
    ['invite bat@acme.mn to the workspace', 'EN: same'],
    ['create a work order to rebuild the dashboard', 'EN: the object noun "work" matches STATEMENT_FINITE_VERB'],
    ['archive the end of year report', 'EN: the object noun "end" matches STATEMENT_FINITE_VERB'],
    ['delete the cost model', 'EN: the object noun "cost" matches STATEMENT_FINITE_VERB'],
    ['assign the work to Bat', 'EN: the object noun "work"'],
    ['ok go', 'EN: a confirmation shape outside CONFIRMATION_COMMAND'],
    ['ACME-г архивлана уу', 'MN polite imperative V-на уу = "please archive"'],
    ['Зенит-г сэргээнэ үү', 'MN polite imperative V-нэ үү = "please restore"'],
    ['ACME компанийг устгана уу', 'MN polite imperative = "please delete"'],
    ['Батыг томилно уу', 'MN polite imperative = "please appoint"'],
  ];
  const missed = FN.filter(([c]) => intentOf(c) === null);
  check('DEFECT', 'V63-D3 (P1) every ordinary mutation REQUEST derives request intent when the model emits nothing',
    missed.length === 0,
    `${missed.length}/${FN.length} carry NO intent, so OTM §3 rule 3 never fires and a fabricated success claim `
    + `ships verbatim with receiptRendered=false: ${JSON.stringify(missed.map((m) => m[0]))}. `
    + 'Root causes, measured through the real window: (a) the compound rows have alwaysInImperativePosition=true '
    + 'and lexiconImperative="archive" and are then VETOED because lastClauseIsRead — the mirror rescue '
    + 'lastClauseIsMutation exists but there is no firstClauseIsMutation; the SAME defect class was fixed for '
    + 'the company command-fallback tier by the v59 hardening (commandReadLeadEffective, index.ts) and was '
    + 'never carried into the request-intent tier the receipt rule depends on. (b) REQUEST_FRAME_PREFIX is a '
    + 'closed list with no adverb slot. (c) IMPERATIVE_OBJECT does not accept an email address. '
    + '(d) STATEMENT_FINITE_VERB matches the nouns work/end/cost. (e) CONFIRMATION_COMMAND has no "go" follower. '
    + '(f) MN_READ_SHAPE treats EVERY sentence-final уу/үү as a question particle, so the standard Mongolian '
    + 'polite imperative V-на/нэ + уу/үү is read as a question — the stem IS matched (alwaysCyrillicRaw is set) '
    + 'and then discarded; this was introduced by the V61-D6 repair. Discriminator available: a finite non-past '
    + '-на/-нэ/-но/-нө immediately before уу/үү is a polite imperative, while a participle (-сан/-сэн) or an '
    + 'infinitive (-х) before уу/үү is a genuine question. '
    + 'v92 measurement: of the 20 fabrications these carry, v92 PAST_COMPLETION_CLAIM_PATTERN corrects 1 — so '
    + '19/20 are v92 PARITY and 1/20 is a truth REGRESSION vs v92; under the contract bar all 20 are violations.');
  // The positive controls must keep working, or the row above would be trivially satisfiable by a blanket fix.
  const CTRL_INTENT = ['archive ACME', 'ACME-г архивла', 'please archive ACME', 'yes', 'archive ACME and let me know'];
  const CTRL_READ = ['how many companies are archived?', 'make a list of the archived companies', 'set out the plan for the migration', 'add up the revenue', 'ACME архивлагдсан уу?'];
  check('CONTRACT', 'V63-C18 the positive controls still derive intent (no fix may be a blanket "always mutation")',
    CTRL_INTENT.every((c) => intentOf(c) !== null), JSON.stringify(CTRL_INTENT.filter((c) => intentOf(c) === null)));
  check('CONTRACT', 'V63-C19 read-shaped commands still derive NO intent (no fix may rewrite truthful reads)',
    CTRL_READ.every((c) => intentOf(c) === null), JSON.stringify(CTRL_READ.filter((c) => intentOf(c) !== null)));
  // And the fabrication really does ship through the real receipt window.
  const shipped = FN.filter(([c]) => !NO_CHANGE.test(runTurn({ command: c, summary: 'Done — that has been archived.' }).summary));
  check('DEFECT', 'V63-D3b no mutation request reaches the founder with a fabricated completion and no receipt',
    shipped.length === 0, `${shipped.length}/${FN.length} ship the fabrication verbatim through the REAL structured-claim window`);
}
// Closed 2026-09-08 by establishing what the assertion actually covers, rather than by pretending it covers
// more. The verifier is right that it CANNOT fire for the trim loop: the pre-loop guard throws first if
// TRIM_ORDER names a protected key, and the loop writes no other key. It is not, however, a tautology — it
// is the only thing that catches a DIRECT mutation of a protected key from anywhere else in the block,
// which is the edit a future round is realistically going to make. That scope is now stated in the source,
// and reachability is DEMONSTRATED here rather than assumed: inject exactly that mutation into the real
// block and require it to throw. A guard whose reachability is argued rather than executed is how V61-D4
// came to be filed as vacuous in the first place.
{
  const MARK = 'if (JSON.stringify(BYTE_STABLE_CONTEXT.map((k) => packRecord[k] ?? null)) !== minimumSafeBefore';
  const guarded = BUDGET_SRC.replace(MARK,
    'packRecord.currentTurn = { turn: -1, command: "mutated directly, outside the trim loop" };\n  ' + MARK);
  const injected = guarded !== BUDGET_SRC;
  let threw = false;
  if (injected) {
    const f = new Function('command', 'pack', 'collections', 'Deno', guarded + '\n; return true;');
    const fx = buildPack({ history: 2 });
    try { f(fx.command, fx.pack, fx.collections, { env: { get: () => undefined } }); }
    catch (e) { threw = /refusing to build this turn/.test(String(e && e.message)); }
  }
  check('DEFECT', 'V63-D5 the MINIMUM_SAFE_CONTEXT guarantee is enforced by a REACHABLE assertion, not a tautology',
    injected && threw && /reachable — and is the only thing that would catch — a DIRECT mutation/.test(src),
    `injected=${injected} threw=${threw}. The assertion must actually fire when a protected key is mutated `
    + 'outside the trim loop, and the source must state plainly that this is the only case it covers.');
}
// ───────────────────────────────────── V63-D6 (env NaN)
{
  const { pack, collections, command } = buildPack({ history: 2 });
  for (const k of Object.keys(pack)) if (Array.isArray(pack[k])) pack[k] = pack[k].slice(0, 3);
  const before = pack.companies.length;
  const r = runBudget(command, pack, collections, { env: { get: (k) => (k === 'SEM_AI_MAX_TOKENS' ? 'twelve-thousand' : undefined) } });
  check('DEFECT', 'V63-D6 a MALFORMED size-cap env var falls back to the default instead of silently disabling the gate',
    !(Number.isNaN(r.budget) && pack.companies.length === 0 && r.contextBudget.overBudget === false),
    `packBudget=${r.budget}; companies ${before}->${pack.companies.length}; overBudget=${r.contextBudget.overBudget}. `
    + 'All three size caps use Number(Deno.env.get(X) || default), so a MALFORMED (not absent) value yields NaN. '
    + 'Every comparison against NaN is false: SEM_AI_MAX_TOKENS empties the entire optional pack on EVERY turn with '
    + 'overBudget:false and no error, and SEM_AI_IMAGE_BYTES_MAX / SEM_AI_MODEL_CONTEXT_TOKENS switch their gates '
    + 'OFF entirely. The incident record itself invites the founder to edit SEM_AI_MAX_TOKENS in production, so a '
    + 'typo there is a reachable production state that fails INVISIBLY. Fix: Number.isFinite(n) && n > 0 ? n : default.');
}
// ───────────────────────────────────── V63-D7 (an unnamed whole-request gate)
{
  // Path corrected on promotion: this file now lives IN scenarios-runner, so the inventory is a sibling.
  // The old relative path resolved to nothing and the check then read an EMPTY string — a test that fails
  // open is worse than one that fails, so a missing inventory now throws instead of silently passing.
  const inv = [resolve(HERE, 'request_gate_inventory_contract.mjs'),
    resolve(HERE, '../../scenarios-runner/request_gate_inventory_contract.mjs')].find((f) => existsSync(f));
  if (!inv) throw new Error('v63: the gate inventory was not found — update this check, never let it pass');
  const invSrc = readFileSync(inv, 'utf8');
  check('DEFECT', 'V63-D7 the EDGE RUNTIME REQUEST-BODY limit is named in the whole-request gate inventory',
    /request body|body size|payload size|Content-Length|req\.json\(\) (?:throw|fail)/i.test(invSrc),
    'The inventory lists 8 gates and names 2 UNMEASURED ones (wall-clock timeout, SSE init). It does not name the '
    + 'platform request-body limit, which IS a whole-request gate: an attached image is allowed up to 5 MB DECODED, '
    + 'i.e. ~6.7 MB of base64 inside the JSON body, and if req.json() rejects it the handler returns a bare 500 from '
    + 'the generic catch (index.ts serve(), `catch (e: any) { return json({ error: ... }, 500); }`) — not one of the '
    + 'three classified 413 refusals. OTM §4.4 requires every whole-request gate to be classified, and an UNMEASURED '
    + 'gate to be NAMED. This one is neither.');
}
// ───────────────────────────────────── V63-D8 (the pinned witness is not calibrated to the incident)
{
  // Path corrected on promotion: this file now lives IN scenarios-runner, so the inventory is a sibling.
  // The old relative path resolved to nothing and the check then read an EMPTY string — a test that fails
  // open is worse than one that fails, so a missing inventory now throws instead of silently passing.
  const inv = [resolve(HERE, 'request_gate_inventory_contract.mjs'),
    resolve(HERE, '../../scenarios-runner/request_gate_inventory_contract.mjs')].find((f) => existsSync(f));
  if (!inv) throw new Error('v63: the gate inventory was not found — update this check, never let it pass');
  const invSrc = readFileSync(inv, 'utf8');
  check('DEFECT', 'V63-D8 the pinned live-incident witness does not claim a calibration it does not have',
    !/Sized to reproduce the observed 12,340-token estimate/.test(invSrc),
    'The witness comment says it is "Sized to reproduce the observed 12,340-token estimate on this workspace"; the '
    + 'suite itself prints pre-fix 25,595 — 2.07x the number the incident record measured. Both halves of the '
    + 'witness DO hold (pre-fix 25,595 > 12,000 and post-fix 11,297 <= 11,400), so this is an evidence-integrity '
    + 'defect, not a capacity one: a witness twice the size of the incident cannot detect a PARTIAL reintroduction '
    + 'of the regression, and the stated calibration is what a reader would rely on. Either resize the fixture to '
    + 'the observed 12,340 or delete the claim.');
}

console.log(`\nv63_regression_additions: ${pass} passed, ${failures.length} failed `
  + `(CONTRACT failures: ${failures.filter((f) => f.kind === 'CONTRACT').length}, `
  + `DEFECT failures: ${failures.filter((f) => f.kind === 'DEFECT').length})`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - [${f.kind}] ${f.name}\n      ${f.detail || ''}`);
  process.exit(1);
}
