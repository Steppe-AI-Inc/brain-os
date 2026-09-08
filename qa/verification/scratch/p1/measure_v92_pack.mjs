// Does the CURRENTLY DEPLOYED build breach its own token preflight on a fully populated workspace?
//
// Production runs v92 source (function v94, sha256 795c20c8...). That source has NO budget-aware assembly:
// it estimates {command, contextPack} and returns 413 above SEM_AI_MAX_TOKENS (12,000). The pack literal at
// deployed index.ts places 24 collections, each capped by its own .limit(N). This script builds that exact
// pack shape saturated at those caps and reports the estimate, using the deployed estimator verbatim.
//
// This is a production-safety measurement, not a candidate test: if it exceeds 12,000, the founder's
// workspace can hit a hard stop on the build running right now, and incident #133 was never v93-specific.
const CO1 = '00000000-0000-4000-8000-000000000001';
const estimateTokens = (x) => Math.ceil(JSON.stringify(x).length / 4);
const nm = (base, i, long) => (long ? 'A deliberately long ' + base + ' name of the kind a real workspace produces, number ' : base + ' ') + i;
const fill = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// Caps and selected columns read from the DEPLOYED source, one entry per pack collection.
function v92Pack(long, history) {
  const conversationHistory = fill(history, (i) => ({ command: nm('founder command', i, long), summary: nm('assistant summary', i, long) }));
  return {
    command: 'What is the exact current title of the project that belongs to QA-SWARM-TEST-CO-VIA-CHAT, as stored in the database right now?',
    companies: fill(12, (i) => ({ id: 'c' + i, name: nm('company', i, long), status: 'active', organization_type: 'legal_entity', strategic_priority: 5, risk_score: 0, effectivelyActive: true })),
    projects: fill(20, (i) => ({ id: 'pr' + i, company_id: CO1, title: nm('project', i, long), status: 'active', deadline: '2026-12-01', blockers: null, risk_score: 2 })),
    tasks: fill(15, (i) => ({ id: 't' + i, company_id: CO1, project_id: 'pr0', title: nm('task', i, long), status: 'queued', priority: 'medium', risk_level: 'low', approval_required: false, deadline: null, owner_type: 'human', owner_person_id: null, owner_agent_id: null })),
    memories: fill(8, (i) => ({ id: 'm' + i, company_id: CO1, entity_type: 'company', entity_id: CO1, fact: nm('remembered fact', i, long), confidence: 0.8, sensitivity: 'internal', companyCurrentStatus: 'active', personCurrentStatus: null })),
    agents: fill(20, (i) => ({ id: 'ag' + i, name: nm('agent', i, long), role: 'implementation_engineer', skills: ['typescript', 'sql'], cost_limit_usd: 20 })),
    products: fill(20, (i) => ({ id: 'pl' + i, company_id: CO1, name: nm('product line', i, long), currency: 'USD', unit_price: 1000, service_fee_monthly: 50, active: true })),
    inventory: fill(20, (i) => ({ id: 'inv' + i, company_id: CO1, product_line_id: 'pl0', sku: 'SKU-' + i, quantity_on_hand: 10, reserved_quantity: 1, reorder_point: 5, location: nm('warehouse', i, long) })),
    approvals: fill(20, (i) => ({ id: 'ap' + i, company_id: CO1, title: nm('approval', i, long), status: 'pending', risk_level: 'medium', reason: nm('reason', i, long) })),
    people: fill(30, (i) => ({ id: 'p' + i, full_name: nm('person', i, long), email: 'person' + i + '@example.com', role_title: nm('role', i, long), company_id: CO1, active: true, effectivelyActive: true })),
    goals: fill(20, (i) => ({ id: 'g' + i, company_id: CO1, title: nm('goal', i, long), status: 'active', kind: 'objective' })),
    companyRelationships: fill(20, (i) => ({ id: 'cr' + i, company_id: CO1, related_company_id: CO1, owner_profile_id: null, relationship_type: 'subsidiary', ownership_pct: 100, state: 'active' })),
    personAssignments: fill(30, (i) => ({ id: 'pa' + i, person_id: 'p' + i, legal_employer_company_id: CO1, operating_company_id: CO1, manager_person_id: 'p0', job_title: nm('job title', i, long), state: 'active' })),
    financialReports: fill(20, (i) => ({ id: 'fr' + i, company_id: CO1, period: '2026-0' + (i % 9 + 1), revenue: 100000, expenses: 80000, net_income: 20000, cash_position: 50000, health_status: 'healthy', summary: nm('financial summary', i, long) })),
    conversationHistory,
    factoryWorkOrders: fill(10, (i) => ({ id: 'fw' + i, title: nm('work order', i, long), status: 'queued', company_id: CO1 })),
    channels: fill(15, (i) => ({ id: 'ch' + i, name: nm('channel', i, long), company_id: CO1 })),
    activeChannelId: 'ch0',
    departments: fill(30, (i) => ({ id: 'dp' + i, name: nm('department', i, long), company_id: CO1 })),
    leads: fill(30, (i) => ({ id: 'ld' + i, client_name: nm('client', i, long), company_id: CO1, stage: 'qualified', value_estimate: 25000 })),
    documents: fill(30, (i) => ({ id: 'dc' + i, title: nm('document', i, long), company_id: CO1, category: 'general' })),
    proposals: fill(20, (i) => ({ id: 'pp' + i, title: nm('proposal', i, long), company_id: CO1, status: 'draft' })),
    productSpecs: fill(20, (i) => ({ id: 'ps' + i, title: nm('product spec', i, long), company_id: CO1, status: 'draft' })),
    engineeringDrawings: fill(20, (i) => ({ id: 'ed' + i, title: nm('engineering drawing', i, long), company_id: CO1 })),
    aiProviders: fill(10, (i) => ({ id: 'ai' + i, provider: 'anthropic', model: 'claude-sonnet-5', label: nm('provider', i, long), is_active: true })),
    mcpConnectors: fill(10, (i) => ({ id: 'mc' + i, name: nm('connector', i, long), endpoint_url: 'https://example.invalid/mcp/' + i })),
    pendingAction: null, recentlyResolvedEntities: null, recentlyDeletedEntities: null,
    counts: { companiesShown: 12, companiesTotal: 40, peopleShown: 30, peopleTotal: 120, tasksShown: 15, tasksTotal: 200, projectsShown: 20, projectsTotal: 60, goalsShown: 20, goalsTotal: 40, documentsShown: 30, documentsTotal: 90 },
  };
}

const HARD_MAX = 12000;
const CASES = [
  ['short names, 0 history turns', false, 0],
  ['short names, 8 history turns (the cap)', false, 8],
  ['long names, 8 history turns (the cap)', true, 8],
];
console.log('DEPLOYED BUILD (v92 source, function v94, sha256 795c20c8...) — no budget-aware assembly.');
console.log('Preflight: estimateTokens({command, contextPack}) > 12000 => HTTP 413, no answer.\n');
console.log('  workspace                                estimate  hard_max  verdict');
let breached = 0;
for (const [label, long, history] of CASES) {
  const pack = v92Pack(long, history);
  const est = estimateTokens({ command: pack.command, contextPack: pack });
  const over = est > HARD_MAX;
  if (over) breached++;
  console.log('  ' + label.padEnd(40) + String(est).padStart(8) + String(HARD_MAX).padStart(10) + '  ' + (over ? 'HARD STOP (413)' : 'fits'));
}
console.log('\n  Per-collection contribution (short names, 8 turns), largest first:');
const pack = v92Pack(false, 8);
const rows = Object.keys(pack).filter((k) => Array.isArray(pack[k]))
  .map((k) => [k, pack[k].length, Math.ceil(JSON.stringify(pack[k]).length / 4)])
  .sort((a, b) => b[2] - a[2]);
for (const [k, n, tok] of rows.slice(0, 10)) console.log('   ' + k.padEnd(24) + String(n).padStart(4) + ' rows' + String(tok).padStart(8) + ' tokens');
console.log('\n  VERDICT: ' + (breached > 0
  ? breached + ' of ' + CASES.length + ' saturated workspaces breach the preflight on the DEPLOYED build.'
  : 'no saturated workspace breaches the preflight on the deployed build.'));
