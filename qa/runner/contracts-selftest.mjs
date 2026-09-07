#!/usr/bin/env node
// Deterministic proof that the contract layer does what SUPERVISOR.md / qa/contracts/README.md say.
// Run: node qa/runner/contracts-selftest.mjs   (exit 1 on any failed assertion)
import { readFileSync } from 'node:fs';
import { loadContracts, obligationsForAll, inferChangedPrimitives, impactPlan, generateScenarios, dimensionCoverage } from './lib/contracts.mjs';
import { P } from './lib/paths.mjs';

let failed = 0;
const assert = (cond, name, detail = '') => { if (cond) console.log('PASS ' + name); else { failed++; console.error('FAIL ' + name + (detail ? ' - ' + detail : '')); } };

const lib = loadContracts();
assert(lib.present, 'contracts directory present');
assert(Object.keys(lib.patterns.patterns).length >= 26, 'pattern library has >= 26 patterns', String(Object.keys(lib.patterns.patterns).length));
for (const [k, p] of Object.entries(lib.patterns.patterns)) assert(Array.isArray(p.oracle_source) && p.oracle_source.length > 0, `pattern ${k} declares an oracle_source`);

const obl = obligationsForAll(lib);
const co = obl.company_lifecycle;
for (const need of ['INVERSE_LIFECYCLE', 'MUTATION_TRUTH', 'RELOAD_TRUTH', 'FRESH_SESSION_TRUTH', 'CROSS_ORG_ISOLATION', 'PARENT_ARCHIVED_CHILD_BEHAVIOR', 'CROSS_SURFACE_TRUTH', 'AI_FRESH_GROUNDING']) {
  assert(co.obligations.includes(need), `company_lifecycle derives ${need}`);
}
assert(co.policy_blocked.includes('cascade_to_children_on_archive'), 'company_lifecycle marks cascade policy as UNDEFINED (not invented)');
assert(!obl.goal_lifecycle.obligations.includes('PENDING_ACTION_CONFIRMATION'), 'goal_lifecycle (no brain mutation) does NOT derive PENDING_ACTION_CONFIRMATION');
assert(!obl.manager_assignment.obligations.includes('INVERSE_LIFECYCLE'), 'manager_assignment (inverse NOT AVAILABLE) does NOT derive INVERSE_LIFECYCLE');

const caps = JSON.parse(readFileSync(P.capabilities, 'utf8')).capabilities;
const bugs = JSON.parse(readFileSync(P.bugQueue, 'utf8')).bugs;

// Impact: an execution primitive change -> broad AI mutation regression, long-context only for CanonicalRead/PendingActionBinding.
const planExec = impactPlan(['ExecutionResultEnvelope'], lib, caps);
assert(planExec.broad_ai_mutation_regression === true, 'ExecutionResultEnvelope change triggers broad AI mutation regression');
assert(planExec.run_long_context === false, 'ExecutionResultEnvelope alone does not trigger long-context runs');
assert(planExec.regression_families.includes('FAILURE_RECEIPT_TRUTH'), 'ExecutionResultEnvelope -> FAILURE_RECEIPT_TRUTH');
assert(planExec.retest_bugs_first.includes('BUG-021'), 'ExecutionResultEnvelope -> retest BUG-021 first');
assert(planExec.affected_capabilities.some((c) => /-CHAT/.test(c)), 'ExecutionResultEnvelope maps to chat capabilities');
const planCss = impactPlan(['UI_Presentation_Only'], lib, caps);
assert(planCss.narrow_change === true && planCss.run_long_context === false, 'CSS-only change is narrow and never triggers 200-turn runs');
const planRead = impactPlan(['CanonicalRead'], lib, caps);
assert(planRead.run_long_context === true, 'CanonicalRead change triggers long-context runs');
const planTenant = impactPlan(['OrganizationContext_TenantAuthorization'], lib, caps);
assert(planTenant.run_sql_persona_matrix_first === true, 'tenant/RLS change schedules the SQL persona matrix first');

// Inference from a fix report with no changed_primitives field but a telling description.
const inferred = inferChangedPrimitives({ fix_description: 'Rewired claimsPastCompletionWithNoGrounding into the work_orders.output persist condition in supabase/functions/sem-ai-command/index.ts' }, lib);
assert(inferred.includes('ExecutionResultEnvelope') && inferred.includes('CanonicalRead'), 'primitives inferred from fix_description hints', inferred.join(','));
assert(inferChangedPrimitives({ fix_description: 'nothing relevant' }, lib).length === 0, 'no hints -> no inferred primitives (never guesses)');

// Generation: valid-only, oracle-carrying, policy-undefined marked.
const gen = generateScenarios(lib, { contractId: 'company_lifecycle', actors: ['founder', 'foreign_manager'] });
assert(gen.length > 0 && gen.length < 200, `company_lifecycle generates a bounded set (${gen.length})`);
assert(gen.every((s) => s.pattern && s.expected && s.verdict_policy), 'every generated scenario carries pattern, expected and verdict_policy');
assert(gen.some((s) => s.verdict_policy === 'BLOCKED_POLICY_UNDEFINED' && s.pattern === 'PARENT_ARCHIVED_CHILD_BEHAVIOR'), 'cascade scenario is emitted as BLOCKED_POLICY_UNDEFINED');
assert(gen.some((s) => s.actor === 'foreign_manager' && s.pattern === 'UNAUTHORIZED_ACTOR'), 'foreign actor scenarios expect denial');
assert(gen.some((s) => s.history === 'prior_fabricated_claim' && s.pattern === 'CONVERSATION_HISTORY_CONFLICT'), 'fabricated-history scenario expects canonical state to win');
const genProj = generateScenarios(lib, { contractId: 'project_lifecycle' });
assert(genProj.some((s) => s.channel === 'brain' && s.action === 'edit' && s.pattern === 'UNSUPPORTED_OPERATION'), 'project edit via brain (no field) generates only the honest-decline scenario');

// Dimensions are additive and bounded.
const dims = dimensionCoverage(lib, caps, bugs);
assert(dims.state_coverage.total > 0 && dims.transition_coverage.total > 0, 'dimension coverage computes states/transitions');
assert(dims.invariant_coverage.total_patterns >= 26, 'invariant coverage counts all patterns');

console.log(JSON.stringify({ obligations_company_lifecycle: co.obligations, impact_exec: { families: planExec.regression_families, bugs: planExec.retest_bugs_first, caps: planExec.affected_capabilities.length }, generated_company_lifecycle: gen.length, dims: { state: dims.state_coverage.pct, transition: dims.transition_coverage.pct, role: dims.role_coverage.pct, surface: dims.surface_coverage.pct, invariant: dims.invariant_coverage.pct } }, null, 1));
process.exit(failed ? 1 : 0);
