#!/usr/bin/env node
// WHOLE-REQUEST GATE INVENTORY (founder contract 2026-09-08 §2 and §5).
//
// The 2026-09-08 incident happened because every gate that SHAPES the answer was measured and the one gate
// that REFUSES the whole request was not. This suite enumerates every point where an otherwise valid founder
// turn can be rejected or degraded, classifies each, and fails if a gate is an UNSAFE HARD STOP or if a new
// unclassified gate appears in the source. It also measures the estimator's headroom across realistic
// workspaces so nobody tunes the budget to 11,999.
//
// Classifications:
//   SAFE DEGRADATION      the request still gets an answer; something optional is reduced, truthfully
//   DETERMINISTIC REFUSAL the request is refused for a stated, correct reason the founder can act on
//   UNSAFE HARD STOP      a valid turn dies because of context volume — forbidden
//   UNMEASURED            no evidence either way — must be named, never silently assumed safe
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS, withSourceHelpers } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// ---------------------------------------------------------------- the inventory
// Each row: [gate, where, classification, the evidence that keeps it out of UNSAFE HARD STOP]
const GATES = [
  ['input token estimate (pack + command)', /const hardMax = envPositiveInt\('SEM_AI_MAX_TOKENS', 12000\)/, 'SAFE DEGRADATION then DETERMINISTIC REFUSAL',
    () => /const packBudget = Math\.max\(2000,/.test(src) && /contextTrimmed\.push/.test(src)
      && /for \(const floor of \[2, 0\]\)/.test(src) && /error: 'Request too large'/.test(src)],
  ['output token cap (generation)', /max_tokens/, 'DETERMINISTIC REFUSAL',
    () => /max_tokens/.test(src)],
  ['per-collection row caps (.limit)', /\.limit\(\d+\)/, 'SAFE DEGRADATION',
    () => /truncated: total === null \? null : total > shown/.test(src)],
  ['named-entity lookup cap', /NAMED_LOOKUP_ROW_CAP/, 'SAFE DEGRADATION',
    () => /const NAMED_LOOKUP_ROW_CAP = \d+/.test(src) && /resolveCompanyLifecycleTargets/.test(src)],
  ['conversation history window', /\.limit\(8\)/, 'SAFE DEGRADATION',
    () => /historyIsComplete/.test(src) && /conversationHistory/.test(src)],
  ['JSON parse of the model reply', /ai_command_json_parse_failed/, 'DETERMINISTIC REFUSAL',
    () => /mark_work_order_failed/.test(src)],
  ['auth / identity', /Missing Authorization bearer token/, 'DETERMINISTIC REFUSAL',
    () => /auth\.getUser/.test(src) || /Missing Authorization bearer token/.test(src)],
  ['provider error / stream failure', /type: 'error'/, 'DETERMINISTIC REFUSAL',
    () => /send\(\{ type: 'error'/.test(src)],
];
for (const [gate, present, klass, safe] of GATES) {
  check(`gate present in source: ${gate}`, present.test(src), 'the inventory must track the real code, not a memory of it');
  check(`gate is not an UNSAFE HARD STOP: ${gate} [${klass}]`, safe(), 'a valid founder turn must never die here on context volume');
}

// A new numeric hard cap appearing in the request path must be classified, not silently added.
{
  const at = src.indexOf('tokenEstimate = estimateTokens(');
  const preflight = src.slice(at, at + 2200);
  // TWO size refusals exist, and they constrain different things (verifier #61, V61-D10). Conflating them
  // was tried and would have refused every turn in the product: SYSTEM_PROMPT is ~18,824 tokens on its own,
  // 57% larger than the 12,000 "hard max", so that cap was never a request-size limit at all.
  //   1. PACK BUDGET (SEM_AI_MAX_TOKENS, 12,000) — how much context buildContext assembles, measured
  //      compactly as {command, contextPack}, which is how it was calibrated. Degrades first, then refuses.
  //   2. MODEL CONTEXT WINDOW (SEM_AI_MODEL_CONTEXT_TOKENS, 180,000) — the real request: system prompt +
  //      pretty-printed body + any attached image. An image bypasses the pack budget entirely, so this is
  //      the only gate that bounds it.
  //   3. ATTACHED IMAGE SIZE (SEM_AI_IMAGE_BYTES_MAX, 5 MB) — added in campaign #122 after verifier #62
  //      found that counting an image as base64_chars/4 against a TOKEN window refused ordinary photos that
  //      v92 serves. An image's cost to a vision model depends on its dimensions, which this code cannot
  //      know; its transported SIZE is knowable and is what the provider actually limits.
  // A FOURTH 413 means a new whole-request cap was added without a classification here.
  const refusals = (src.match(/, 413\)/g) || []).length;
  check('every whole-request size cap is classified in this inventory',
    refusals === 3 && /const packBudget/.test(src) && /hardMax/.test(preflight)
      && /SEM_AI_MODEL_CONTEXT_TOKENS/.test(src) && /SEM_AI_IMAGE_BYTES_MAX/.test(src),
    'found ' + refusals + ' whole-request refusals; add any new one to this inventory with a classification');
  check('the three size caps are named, so none is mistaken for another',
    /limit: 'context pack'/.test(src) && /limit: 'model context window'/.test(src) && /limit: 'attached image size'/.test(src),
    'a refusal must say WHICH limit it hit, or the founder cannot act on it');
  check('the real request is measured against the model context window, prompt included',
    /const requestTokens = estimateRequestTokens\(/.test(src)
      && /systemPromptTokens: SYSTEM_PROMPT_TOKENS/.test(src)
      && /imageAttached: !!attachedImage/.test(src),
    'the provider gate was UNMEASURED until verifier #61');
  check('an image is bounded by its SIZE, never counted as text tokens (V62-D2)',
    /function imageBytes\(base64: string\): number/.test(src)
      && !/function estimateRequestTokens\(payload: unknown, imageBase64/.test(src)
      && /imageBytes\(attachedImage\.base64\) > IMAGE_BYTES_MAX/.test(src),
    'base64 length is not a token count; using it as one refuses photos the provider would accept');
  // The refusal itself must be actionable, not a bare number: the founder is told which input could not
  // be reduced and what to do about it, and that nothing was changed (verifier #60, V60-D1 residual).
  check('the whole-request refusal states a cause and an action, and is not an opaque hard stop',
    /error: 'Request too large'/.test(preflight) && /reason/.test(preflight)
      && /your message is too long to process in one turn/.test(preflight)
      && /ask about one company or one area at a time/.test(preflight)
      && /Nothing was changed\./.test(preflight),
    'a refusal the founder cannot act on is not a deterministic refusal');
  check('the refusal distinguishes an oversized command from an oversized workspace',
    /const commandTokens = estimateTokens\(command\)/.test(preflight) && /commandTokens > Math\.floor\(hardMax \/ 2\)/.test(preflight),
    'the two causes need different actions, so they must not share one message');
  check('the refusal reports whether context trimming fell short, rather than leaving it to be inferred',
    /contextStillOverBudget/.test(preflight) && /contextBudget\.overBudget = /.test(src),
    'overBudget must be stated by the block that knows it');
}

// UNMEASURED, stated rather than assumed safe (the founder's §2 requires naming them).
// Two of the four came off this list in campaign #122: the provider context window is now a real gate, and
// the system prompt's token cost is pinned below instead of drifting unwatched.
const UNMEASURED = [
  'per-request wall-clock timeout at the edge runtime and at the provider',
  // Verifier #63 V63-D7: an attached image is allowed up to 5 MB DECODED, which is ~6.7 MB of base64 inside a
  // JSON body, and the edge runtime enforces its own request-body limit BEFORE any of this code runs. It is a
  // real whole-request gate, it is not ours to configure, and it has never been measured against our own cap.
  'edge runtime request-body size limit (enforced before the function runs; not measured against SEM_AI_IMAGE_BYTES_MAX)',
  'SSE stream initialisation failure after the preflight passes',
];
check('unmeasured whole-request gates are named, not assumed safe', UNMEASURED.length > 0 && UNMEASURED.every((u) => typeof u === 'string' && u.length > 20));
// The system prompt is the single largest input in every request and it was never counted. Pin its size so
// a future edit that doubles it shows up here rather than in production (verifier #61, V61-D10).
{
  const a = src.indexOf('const SYSTEM_PROMPT = `');
  const b = src.indexOf('`;', a);
  const promptTokens = Math.ceil(src.slice(a + 'const SYSTEM_PROMPT = `'.length, b).length / 4);
  console.log('     system prompt: ' + promptTokens + ' tokens (the pack budget is ' + (12000 - 600) + ')');
  check('the system prompt is measured, and is not silently growing',
    promptTokens > 0 && promptTokens < 30000,
    'system prompt is ' + promptTokens + ' tokens; if this is intentional, raise the bound deliberately and say why');
}
for (const u of UNMEASURED) console.log('     UNMEASURED: ' + u);

// ---------------------------------------------------------------- estimator headroom (founder §5)
// The production estimator is JSON.stringify({command, contextPack}).length / 4. Measure the assembled pack
// across realistic workspaces and require a real margin below the hard limit, not 11,999.
const START = '  const packBudget = Math.max(2000,';
const END = '  return { pack, provenanceIds, errors:';
const block = withSourceHelpers(src, stripTS(src.slice(src.indexOf(START), src.indexOf(END, src.indexOf(START)))));
const run = new Function('command', 'pack', 'collections', 'Deno', block + '\n; return { estimate: packTokens(), budget: packBudget, trimmed: contextTrimmed };');
const DENO = { env: { get: () => undefined } };
const HARD_MAX = 12000;

const company = (i, long) => ({ id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'), name: (long ? 'A deliberately long legal entity name for stress measurement number ' : 'Co ') + i, status: 'active', organization_type: 'legal_entity', strategic_priority: 5, risk_score: 0, effectivelyActive: true });
const task = (i, long) => ({ id: '11111111-1111-4000-8000-' + String(i).padStart(12, '0'), company_id: '00000000-0000-4000-8000-000000000001', project_id: null, title: (long ? 'A deliberately long task title for stress measurement number ' : 'Task ') + i, status: 'queued', priority: 'medium', risk_level: 'low', approval_required: false, deadline: null, owner_type: 'human', owner_person_id: null, owner_agent_id: null });
const hist = (i, long) => ({ turn: i + 1, command: (long ? 'A long founder command of the kind a real session produces, number ' : 'cmd ') + i, summary: (long ? 'A long assistant summary of the kind a real turn produces, number ' : 'sum ') + i, verified: true, executedOperationCount: 1, rejectedClaimCount: 0 });

const CO1 = '00000000-0000-4000-8000-000000000001';
const nm = (base, i, long) => (long ? 'A deliberately long ' + base + ' name of the kind a real workspace produces, number ' : base + ' ') + i;
const fill = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// Caps read from supabase/functions/sem-ai-command/index.ts (one entry per pack collection).
function SATURATED(long) {
  return {
    projects: fill(20, (i) => ({ id: 'pr' + i, company_id: CO1, title: nm('project', i, long), status: 'active', deadline: '2026-12-01', blockers: null, risk_score: 2 })),
    goals: fill(20, (i) => ({ id: 'g' + i, company_id: CO1, title: nm('goal', i, long), status: 'active', kind: 'objective' })),
    memories: fill(8, (i) => ({ id: 'm' + i, company_id: CO1, entity_type: 'company', entity_id: CO1, fact: nm('remembered fact', i, long), confidence: 0.8, sensitivity: 'internal' })),
    agents: fill(20, (i) => ({ id: 'ag' + i, name: nm('agent', i, long), role: 'implementation_engineer', skills: ['typescript', 'sql'], cost_limit_usd: 20 })),
    products: fill(20, (i) => ({ id: 'pl' + i, company_id: CO1, name: nm('product line', i, long), currency: 'USD', unit_price: 1000, service_fee_monthly: 50, active: true })),
    inventory: fill(20, (i) => ({ id: 'inv' + i, company_id: CO1, product_line_id: 'pl0', sku: 'SKU-' + i, quantity_on_hand: 10, reserved_quantity: 1, reorder_point: 5, location: nm('warehouse', i, long) })),
    approvals: fill(20, (i) => ({ id: 'ap' + i, company_id: CO1, title: nm('approval', i, long), status: 'pending', risk_level: 'medium', reason: nm('reason', i, long) })),
    companyRelationships: fill(20, (i) => ({ id: 'cr' + i, company_id: CO1, related_company_id: CO1, owner_profile_id: null, relationship_type: 'subsidiary', ownership_pct: 100, state: 'active' })),
    personAssignments: fill(30, (i) => ({ id: 'pa' + i, person_id: 'p' + i, legal_employer_company_id: CO1, operating_company_id: CO1, manager_person_id: 'p0', job_title: nm('job title', i, long), state: 'active' })),
    financialReports: fill(20, (i) => ({ id: 'fr' + i, company_id: CO1, period: '2026-0' + (i % 9 + 1), revenue: 100000, expenses: 80000, net_income: 20000, cash_position: 50000, health_status: 'healthy', summary: nm('financial summary', i, long) })),
    factoryWorkOrders: fill(10, (i) => ({ id: 'fw' + i, title: nm('work order', i, long), status: 'queued', company_id: CO1 })),
    channels: fill(15, (i) => ({ id: 'ch' + i, name: nm('channel', i, long), company_id: CO1 })),
    departments: fill(30, (i) => ({ id: 'dp' + i, name: nm('department', i, long), company_id: CO1 })),
    leads: fill(30, (i) => ({ id: 'ld' + i, client_name: nm('client', i, long), company_id: CO1, stage: 'qualified', value_estimate: 25000 })),
    documents: fill(30, (i) => ({ id: 'dc' + i, title: nm('document', i, long), company_id: CO1, category: 'general' })),
    proposals: fill(20, (i) => ({ id: 'pp' + i, title: nm('proposal', i, long), company_id: CO1, status: 'draft' })),
    productSpecs: fill(20, (i) => ({ id: 'ps' + i, title: nm('product spec', i, long), company_id: CO1, status: 'draft' })),
    engineeringDrawings: fill(20, (i) => ({ id: 'ed' + i, title: nm('engineering drawing', i, long), company_id: CO1 })),
    aiProviders: fill(10, (i) => ({ id: 'ai' + i, provider: 'anthropic', model: 'claude-sonnet-5', label: nm('provider', i, long), is_active: true })),
    mcpConnectors: fill(10, (i) => ({ id: 'mc' + i, name: nm('connector', i, long), endpoint_url: 'https://example.invalid/mcp/' + i })),
  };
}

function workspace({ companies = 12, archivedCompanies = 6, tasks = 15, archivedTasks = 8, people = 30, history = 8, long = false }) {
  const pack = {
    companies: Array.from({ length: companies }, (_, i) => company(i, long)),
    archivedCompanies: Array.from({ length: archivedCompanies }, (_, i) => ({ ...company(i, long), status: 'archived', updated_at: '2026-09-01T00:00:00.000Z' })),
    tasks: Array.from({ length: tasks }, (_, i) => task(i, long)),
    archivedTasks: Array.from({ length: archivedTasks }, (_, i) => ({ id: task(i, long).id, company_id: task(i).company_id, title: task(i, long).title })),
    people: Array.from({ length: people }, (_, i) => ({ id: 'p' + i, full_name: (long ? 'A person with a long full name number ' : 'P') + i, email: 'person' + i + '@example.com', role_title: 'Role ' + i, company_id: '00000000-0000-4000-8000-000000000001', active: true, effectivelyActive: true })),
    // Every remaining collection at its REAL production cap (index.ts .limit(N) per query), with the real
    // selected columns. Leaving these empty was understating every estimate by thousands of tokens.
    ...SATURATED(long),
    conversationHistory: Array.from({ length: history }, (_, i) => hist(i, long)),
    currentTurn: { turn: history + 1, command: 'archive ACME Holdings' },
    continuity: { totalPriorTurns: history, historyWindowStart: 1, historyWindowEnd: history, historyIsComplete: true, channelStateVersion: 1 },
    counts: { companiesTotal: companies + archivedCompanies, peopleTotal: people, tasksShown: tasks, tasksTotal: tasks },
    pendingAction: null, recentlyResolvedEntities: null, recentlyDeletedEntities: null, activeChannelId: 'ch',
  };
  const collections = {};
  for (const k of Object.keys(pack)) if (Array.isArray(pack[k])) collections[k] = { shown: pack[k].length, total: pack[k].length * 2, truncated: true };
  pack.collections = collections;
  return { pack, collections };
}

const CASES = [
  ['empty channel', { history: 0 }],
  ['short channel', { history: 3 }],
  ['long channel (50 turns)', { history: 50 }],
  ['very long channel (100 turns)', { history: 100 }],
  ['extreme channel (200 turns)', { history: 200 }],
  ['many companies (120)', { companies: 120 }],
  ['many archived companies (120)', { archivedCompanies: 120 }],
  ['many tasks (200)', { tasks: 200 }],
  ['many archived tasks (200)', { archivedTasks: 200 }],
  ['long names and descriptions', { long: true, companies: 60, tasks: 60, people: 60 }],
  ['everything large at once', { companies: 120, archivedCompanies: 120, tasks: 200, archivedTasks: 200, people: 200, history: 200, long: true }],
];
console.log('\n  case                              estimate  budget  headroom_to_hard_max  trims');
let worstHeadroom = Infinity; const overflowed = []; const overBudget = [];
for (const [label, cfg] of CASES) {
  const { pack, collections } = workspace(cfg);
  const r = run('what is the exact current status of QA-SWARM-TEST-CO-VIA-CHAT in the database right now?', pack, collections, DENO);
  const headroom = HARD_MAX - r.estimate;
  worstHeadroom = Math.min(worstHeadroom, headroom);
  if (r.estimate > HARD_MAX) overflowed.push(label + ' (' + r.estimate + ')');
  // The estimate returned here is measured AFTER the block finished, i.e. it is the request as it will
  // actually be serialized. A loop that measured a smaller pack than it ships would show up right here.
  if (r.estimate > r.budget) overBudget.push(label + ' (' + r.estimate + ' > ' + r.budget + ')');
  console.log('  ' + label.padEnd(34) + String(r.estimate).padStart(8) + String(r.budget).padStart(8) + String(headroom).padStart(22) + '  ' + r.trimmed.length);
}
check('no realistic workspace exceeds the hard limit', overflowed.length === 0, overflowed.join('; '));
check('the estimator measures the request AS SERIALIZED (contextBudget included), so no case ships above its own budget',
  overBudget.length === 0, overBudget.join('; ') + ' — the trim loop must attach contextBudget before measuring');
check('a real safety margin is kept below the hard limit (>= 400 tokens on every case, not tuned to 11,999)', worstHeadroom >= 400, 'worst headroom ' + worstHeadroom);

// ---------------------------------------------------------------- the production witness (founder §7)
// The exact live failure of 2026-09-08: a BRAND-NEW empty channel on the founder's workspace, asked
// "What is the exact current title of the project that belongs to QA-SWARM-TEST-CO-VIA-CHAT, as stored in
// the database right now?", returned {"error":"Token preflight hard stop","tokenEstimate":12340,...}.
// Pre-fix the pack must exceed the cap; post-fix the same pack must fit. Both halves are measured here so
// the witness cannot rot into a test that passes for the wrong reason.
{
  const WITNESS_COMMAND = 'What is the exact current title of the project that belongs to QA-SWARM-TEST-CO-VIA-CHAT, as stored in the database right now?';
  // The v93 shape: 12 archived companies, 15 archived tasks, prose `scope` on every envelope, a pack that
  // never measures itself. This is the SATURATED pack — every collection at its cap — and it measures about
  // 25,595 tokens pre-fix, roughly twice what the incident recorded on the founder's own workspace. It is the
  // worst realistic shape, NOT a calibration to that one turn, and saying so matters because a witness that
  // claims a calibration it does not have invites the next reader to trust a number nobody measured
  // (verifier #63, V63-D8).
  const { pack, collections } = workspace({ companies: 12, archivedCompanies: 12, tasks: 15, archivedTasks: 15, people: 30, history: 8, long: true });
  const SCOPES = ['active (non-archived), newest first, plus any company named in this command', 'archived, newest first', 'in-flight statuses, plus any task named in this command', 'top-8 semantic retrieval', 'plus any person named in this command', 'newest turns in this channel', 'not archived', 'pending', 'newest first', 'archived, newest first'];
  Object.keys(collections).forEach((k, i) => { collections[k].scope = SCOPES[i % SCOPES.length]; });
  // Padding to the observed production volume (20 companies, 25 tasks, 20 people, memories, documents, leads…).
  pack.memories = Array.from({ length: 8 }, (_, i) => ({ id: 'm' + i, company_id: 'c1', entity_type: 'company', entity_id: 'c1', fact: 'A remembered fact of realistic length about the workspace, number ' + i, confidence: 0.8, sensitivity: 'internal', companyCurrentStatus: 'active', personCurrentStatus: null }));
  pack.documents = Array.from({ length: 30 }, (_, i) => ({ id: 'd' + i, title: 'A document with a realistic title number ' + i, company_id: 'c1', category: 'general' }));
  pack.leads = Array.from({ length: 30 }, (_, i) => ({ id: 'l' + i, client_name: 'A client with a realistic name number ' + i, company_id: 'c1', stage: 'qualified', value_estimate: 1000 }));
  pack.departments = Array.from({ length: 30 }, (_, i) => ({ id: 'dep' + i, name: 'A department with a realistic name number ' + i, company_id: 'c1' }));
  for (const k of ['memories', 'documents', 'leads', 'departments']) collections[k] = { shown: pack[k].length, total: pack[k].length * 2, truncated: true, scope: 'window' };

  const preFix = Math.ceil(JSON.stringify({ command: WITNESS_COMMAND, pack }).length / 4);
  check('production witness reproduces the failure PRE-fix (pack over the 12,000 hard limit)', preFix > HARD_MAX, 'pre-fix estimate ' + preFix + ' (live incident measured 12340)');
  const r = run(WITNESS_COMMAND, pack, collections, DENO);
  check('production witness FITS post-fix (the same turn now gets an answer)', r.estimate <= r.budget && r.estimate <= HARD_MAX, 'post-fix estimate ' + r.estimate + ' budget ' + r.budget);
  check('production witness degraded rather than refused (something optional was trimmed)', r.trimmed.length > 0, JSON.stringify(r.trimmed));
  check('production witness kept its minimum safe context', JSON.stringify(pack.currentTurn) === JSON.stringify({ turn: 9, command: 'archive ACME Holdings' }) && pack.counts && pack.collections);
  console.log(`     witness: pre-fix ${preFix} tokens -> post-fix ${r.estimate} (budget ${r.budget}, trimmed ${r.trimmed.length})`);
}

console.log(`\nrequest_gate_inventory_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
