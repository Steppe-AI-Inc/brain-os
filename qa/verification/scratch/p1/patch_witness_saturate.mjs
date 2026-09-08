// The headroom table and the production witness must model the REAL pack: production fills all 24
// collections at their query caps (index.ts .limit(...) per collection), while the fixture left 20 of them
// empty — which understates every estimate. Saturate the fixture at the source caps with realistic rows.
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/scenarios-runner/request_gate_inventory_contract.mjs';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

must(`    projects: [], goals: [], memories: [], agents: [], products: [], inventory: [], approvals: [],
    companyRelationships: [], personAssignments: [], financialReports: [], factoryWorkOrders: [], channels: [],
    departments: [], leads: [], documents: [], proposals: [], productSpecs: [], engineeringDrawings: [],
    aiProviders: [], mcpConnectors: [],`,
`    // Every remaining collection at its REAL production cap (index.ts .limit(N) per query), with the real
    // selected columns. Leaving these empty was understating every estimate by thousands of tokens.
    ...SATURATED(long),`, 'saturate');

must(`function workspace({ companies = 12`,
`const CO1 = '00000000-0000-4000-8000-000000000001';
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

function workspace({ companies = 12`, 'builder');

writeFileSync(p, s.replace(/\n/g, '\r\n')); console.log('saturated fixture applied');
