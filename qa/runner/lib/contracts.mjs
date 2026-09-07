// Contract-driven QA: the smallest library that turns qa/contracts/*.json into work.
//
//   PRODUCT CONTRACT -> TEST OBLIGATIONS -> UNIVERSAL PATTERNS -> FEATURE TESTS
//   -> IMPACT-BASED REGRESSION -> WORK-PC ACCEPTANCE -> GENERATED SCENARIOS
//
// Nothing here replaces CAPABILITY_INVENTORY.json, COVERAGE_LEDGER.json or the scheduler's
// standing priority order. It ADDS: deriveObligations(), impactPlan(), generateScenarios()
// and dimensionCoverage(). Expected behaviour is read from contracts (oracle_source), never
// inferred from the UI or an implementation. Where a contract says BLOCKED - PRODUCT POLICY
// UNDEFINED the generator emits the scenario with verdict_policy: 'BLOCKED_POLICY_UNDEFINED'
// so the Work PC records observed behaviour without inventing an expectation.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { QA_DIR } from './paths.mjs';

const CONTRACTS_DIR = join(QA_DIR, 'contracts');
const readJson = (p, fallback = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

export function loadContracts() {
  return {
    patterns: readJson(join(CONTRACTS_DIR, 'UNIVERSAL_TEST_PATTERNS.json'), { patterns: {} }),
    contracts: readJson(join(CONTRACTS_DIR, 'CAPABILITY_CONTRACTS.json'), { contracts: {}, derivation_rules: {} }),
    impact: readJson(join(CONTRACTS_DIR, 'CAPABILITY_IMPACT_REGISTRY.json'), { primitives: {}, scheduling_policy: {} }),
    continuity: readJson(join(CONTRACTS_DIR, 'CONTINUITY_INVARIANTS.json'), { invariants: {}, runs: {} }),
    defectClasses: readJson(join(CONTRACTS_DIR, 'DEFECT_CLASS_MAP.json'), { classes: {} }),
    present: existsSync(CONTRACTS_DIR),
  };
}

/** Contract flags -> ordered, de-duplicated list of universal pattern obligations. */
export function deriveObligations(contract, rules) {
  const out = [];
  const add = (xs) => { for (const x of xs || []) if (!out.includes(x)) out.push(x); };
  if ((contract.transitions || []).length) add(rules.always_for_transitions);
  if (contract.inverse && Object.values(contract.inverse).some((v) => v && !/NOT AVAILABLE/i.test(String(v)))) add(rules.has_inverse);
  const f = contract.flags || {};
  for (const [flag, obligations] of Object.entries(rules)) {
    if (flag.startsWith('always') || flag === 'has_inverse') continue;
    if (f[flag]) add(obligations);
  }
  return out;
}

/** All contracts -> { contract_id: { obligations, policy_blocked: [...] } } */
export function obligationsForAll(lib) {
  const rules = lib.contracts.derivation_rules || {};
  const res = {};
  for (const [id, c] of Object.entries(lib.contracts.contracts || {})) {
    const blocked = Object.entries(c.policy_status || {}).filter(([, v]) => /BLOCKED - PRODUCT POLICY UNDEFINED/.test(String(v))).map(([k]) => k);
    res[id] = { obligations: deriveObligations(c, rules), feature_specific_tests: c.feature_specific_tests || [], policy_blocked: blocked, affected_surfaces: c.affected_surfaces || [] };
  }
  return res;
}

const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

/**
 * Infer changed primitives from a fix report: explicit `changed_primitives` wins; otherwise
 * match files_changed / fix_description text against file_path_hints. Returns [] when nothing
 * can be inferred - the scheduler then falls back to its standing order (never guesses).
 */
export function inferChangedPrimitives(fixReport, lib) {
  if (Array.isArray(fixReport?.changed_primitives) && fixReport.changed_primitives.length) return fixReport.changed_primitives;
  const hay = [
    ...(fixReport?.files_changed || fixReport?.changed_files || fixReport?.files || []),
    fixReport?.fix_description || '', fixReport?.status_report || '', fixReport?.note || '',
  ].join('\n').toLowerCase();
  const hits = [];
  for (const [name, p] of Object.entries(lib.impact.primitives || {})) {
    if ((p.file_path_hints || []).some((h) => hay.includes(String(h).toLowerCase()))) hits.push(name);
  }
  return hits;
}

/** Changed primitives -> ordered plan of regression families, capabilities and bugs to retest first. */
export function impactPlan(changedPrimitives, lib, inventoryCaps = []) {
  const families = [], capIds = [], bugs = [], contracts = [];
  let broadAiMutation = false, longContext = false, securityBroad = false;
  for (const name of changedPrimitives) {
    const p = lib.impact.primitives?.[name];
    if (!p) continue;
    for (const f of p.regression_families || []) if (!families.includes(f)) families.push(f);
    for (const b of p.open_bugs || []) if (!bugs.includes(b)) bugs.push(b);
    for (const c of p.affected_contracts || []) if (!contracts.includes(c)) contracts.push(c);
    for (const g of p.affected_capabilities_glob || []) {
      const re = globToRe(g);
      for (const c of inventoryCaps) if (re.test(c.capability_id) && !capIds.includes(c.capability_id)) capIds.push(c.capability_id);
    }
    if (name === 'ExecutionResultEnvelope' || name === 'PendingActionBinding') broadAiMutation = true;
    if (name === 'CanonicalRead' || name === 'PendingActionBinding') longContext = true;
    if (name === 'OrganizationContext_TenantAuthorization') securityBroad = true;
  }
  const highRisk = ['CROSS_ORG_ISOLATION', 'UNAUTHORIZED_ACTOR', 'MUTATION_TRUTH', 'PENDING_ACTION_CONFIRMATION'].filter((f) => !families.includes(f));
  return {
    changed_primitives: changedPrimitives,
    retest_bugs_first: bugs,
    regression_families: families,
    affected_capabilities: capIds,
    affected_contracts: contracts,
    high_risk_patterns_after: highRisk,
    run_long_context: longContext,
    broad_ai_mutation_regression: broadAiMutation,
    run_sql_persona_matrix_first: securityBroad,
    narrow_change: changedPrimitives.length > 0 && changedPrimitives.every((n) => n === 'UI_Presentation_Only'),
  };
}

/**
 * Generate valid, high-value scenarios from a contract's state machine - not a Cartesian product.
 * Each scenario carries its oracle (pattern + contract policy) or is marked policy-undefined.
 */
export function generateScenarios(lib, { contractId, actors = ["founder"], channels = ["ui", "brain"], historyConditions = ["clean", "prior_fabricated_claim"], reloadConditions = ["none", "navigate_away_and_back"], viewports = ["desktop"] } = {}) {
  const c = lib.contracts.contracts?.[contractId];
  if (!c) return [];
  const rules = lib.contracts.derivation_rules || {};
  const obligations = deriveObligations(c, rules);
  const policyBlocked = new Set(Object.entries(c.policy_status || {}).filter(([, v]) => /BLOCKED - PRODUCT POLICY UNDEFINED/.test(String(v))).map(([k]) => k));
  const out = [];
  const push = (s) => out.push({ id: `${contractId}#${out.length + 1}`, contract: contractId, entity: c.entity, ...s });

  for (const t of c.transitions || []) {
    const viaBrain = (t.surfaces || []).some((s) => String(s).startsWith('brain:'));
    const viaUi = (t.surfaces || []).some((s) => String(s).startsWith('ui:'));
    for (const channel of channels) {
      if (channel === 'brain' && !viaBrain) {
        // No Brain field: the only valid scenario is the honest decline.
        push({ state: t.from, action: t.action, actor: 'founder', channel, history: 'clean', reload: 'none', pattern: 'UNSUPPORTED_OPERATION', expected: 'honest decline, no success language, DB unchanged', verdict_policy: 'DEFINED' });
        continue;
      }
      if (channel === 'ui' && !viaUi) continue;
      for (const actor of actors) {
        for (const history of (channel === 'brain' ? historyConditions : ['clean'])) {
          for (const reload of reloadConditions) {
            const pattern = history === 'prior_fabricated_claim' ? 'CONVERSATION_HISTORY_CONFLICT' : reload !== 'none' ? 'NAVIGATION_CONTINUITY' : 'MUTATION_TRUTH';
            const authorized = actor === 'founder';
            push({
              state: t.from, action: t.action, to: t.to, actor, channel, history, reload,
              pattern: authorized ? pattern : 'UNAUTHORIZED_ACTOR',
              expected: authorized ? `state ${t.from ?? 'none'} -> ${t.to}; receipt == diff; reload/fresh read agree; cross-surface agree` : 'denied; DB unchanged; no success claim; no foreign data exposed',
              verdict_policy: 'DEFINED',
              risk: t.risk || null,
            });
          }
        }
      }
    }
    // Repeat-in-target-state and missing-target companions (one each per transition, UI channel).
    if (t.to) push({ state: t.to, action: t.action, actor: 'founder', channel: viaUi ? 'ui' : 'brain', history: 'clean', reload: 'none', pattern: 'ALREADY_TARGET_STATE', expected: 'no corruption; truthful already-in-state response', verdict_policy: 'DEFINED' });
    push({ state: 'MISSING', action: t.action, actor: 'founder', channel: viaBrain ? 'brain' : 'ui', history: 'clean', reload: 'none', pattern: 'MISSING_TARGET', expected: 'refused truthfully; no substitute target on a destructive verb', verdict_policy: 'DEFINED' });
  }
  if (c.inverse) {
    for (const [a, inv] of Object.entries(c.inverse)) if (inv && !/NOT AVAILABLE/i.test(String(inv))) push({ action: `${a} then ${inv}`, actor: 'founder', channel: 'mixed', history: 'clean', reload: 'reload_between', pattern: 'INVERSE_LIFECYCLE', expected: 'state, children, relationships and counts restored', verdict_policy: 'DEFINED' });
  }
  if (c.flags?.parent_resource) push({ action: 'archive parent with children (people, project, manager link)', actor: 'founder', channel: 'mixed', pattern: 'PARENT_ARCHIVED_CHILD_BEHAVIOR', expected: policyBlocked.has('cascade_to_children_on_archive') || policyBlocked.has('direct_reports_of_ended_manager') ? 'RECORD OBSERVED BEHAVIOUR ONLY' : 'per contract policy', verdict_policy: (policyBlocked.has('cascade_to_children_on_archive') || policyBlocked.has('direct_reports_of_ended_manager')) ? 'BLOCKED_POLICY_UNDEFINED' : 'DEFINED' });
  if (c.flags?.tenant_scoped) push({ action: 'act on this entity from a foreign organization', actor: 'foreign_manager', channel: 'brain', pattern: 'FOREIGN_ORG_ACTOR', expected: 'authorization denied; DB unchanged; no success claim; foreign data not exposed', verdict_policy: 'DEFINED' });
  // CONCURRENCY axis: only for contracts that declare concurrent editing; oracle is undefined unless
  // the contract states a concurrency policy, so the scenario is emitted as policy-undefined.
  if (c.flags?.concurrent_editable) {
    const t = (c.transitions || []).find((x) => x.from && x.to && x.from !== x.to) || (c.transitions || [])[0];
    if (t) push({ state: t.from, action: t.action, actor: 'founder', channel: 'ui', concurrency: 'read in surface A, mutate via surface B (brain), act on stale view in A', pattern: 'STALE_STATE', expected: c.policy_status?.concurrency ? c.policy_status.concurrency : 'RECORD OBSERVED BEHAVIOUR ONLY - no lost-update policy declared', verdict_policy: c.policy_status?.concurrency ? 'DEFINED' : 'BLOCKED_POLICY_UNDEFINED' });
  }
  // VIEWPORT axis: one mobile acceptance scenario per contract that has a UI transition.
  if (viewports.includes('mobile') && (c.transitions || []).some((t) => (t.surfaces || []).some((s) => String(s).startsWith('ui:')))) {
    push({ action: (c.transitions || []).find((t) => (t.surfaces || []).some((s) => String(s).startsWith('ui:')))?.action, actor: 'founder', channel: 'ui', viewport: 'mobile (390x844)', pattern: 'MOBILE_BASIC_ACCEPTANCE', expected: 'action completes at mobile viewport; EN/MN navigation works; no horizontal overflow hides the control', verdict_policy: 'DEFINED' });
  }
  return out.map((s) => ({ ...s, obligations_of_contract: obligations }));
}

/**
 * Additive coverage dimensions computed from contracts + inventory evidence. Does NOT touch the
 * existing capability denominator; it reports richer dimensions alongside it.
 */
export function dimensionCoverage(lib, inventoryCaps = [], bugs = []) {
  const contracts = lib.contracts.contracts || {};
  const patterns = Object.keys(lib.patterns.patterns || {});
  const evidenceText = JSON.stringify(inventoryCaps) + JSON.stringify(bugs);
  const states = [], transitions = [];
  for (const [id, c] of Object.entries(contracts)) {
    for (const s of c.states || []) states.push(`${id}:${s}`);
    for (const t of c.transitions || []) transitions.push(`${id}:${t.action}`);
  }
  // A state/transition counts as covered when its action name or state name appears in recorded evidence for the entity.
  const covered = (label) => { const [cid, name] = label.split(':'); const ent = contracts[cid]?.entity || cid; return new RegExp(name.replace(/_/g, '[ _-]'), 'i').test(evidenceText) && new RegExp(ent, 'i').test(evidenceText); };
  const stateCov = states.filter(covered);
  const transCov = transitions.filter(covered);
  const patternInstantiated = patterns.filter((p) => (lib.patterns.patterns[p].instantiated_by || []).length > 0);
  const roles = ['founder', 'holding_admin', 'hr_finance', 'company_manager', 'team_lead', 'sales', 'engineer', 'technician', 'employee', 'contractor', 'investor_viewer'];
  const rolesCovered = roles.filter((r) => new RegExp(r, 'i').test(evidenceText));
  const surfaces = new Set(); for (const c of Object.values(contracts)) for (const s of c.affected_surfaces || []) surfaces.add(s);
  const surfacesCovered = [...surfaces].filter((s) => new RegExp(s.split(' ')[0].replace('/', ''), 'i').test(evidenceText));
  const families = Object.values(lib.defectClasses.classes || {}).flatMap((k) => k.families || []);
  const familiesWithRegression = [...new Set(families)];
  const pct = (a, b) => (b ? Number(((a / b) * 100).toFixed(1)) : 0);
  return {
    _doc: 'ADDITIVE dimensions (2026-09-07). The headline capability coverage above is unchanged and remains the comparable historical metric. Coverage here is evidence-name matching over inventory + bug queue, deliberately conservative.',
    capability_coverage_pct_unchanged: null,
    state_coverage: { covered: stateCov.length, total: states.length, pct: pct(stateCov.length, states.length), uncovered: states.filter((s) => !stateCov.includes(s)) },
    transition_coverage: { covered: transCov.length, total: transitions.length, pct: pct(transCov.length, transitions.length), uncovered: transitions.filter((t) => !transCov.includes(t)) },
    role_coverage: { covered: rolesCovered, total: roles.length, pct: pct(rolesCovered.length, roles.length), uncovered: roles.filter((r) => !rolesCovered.includes(r)) },
    tenant_coverage: { founder_scope: 'exercised', foreign_org_actor_browser: 'BLOCKED (second credential)', sql_persona_matrix: 'qa/scenarios-runner sc05x-sc11x (2026-08-27)' },
    surface_coverage: { covered: surfacesCovered.length, total: surfaces.size, pct: pct(surfacesCovered.length, surfaces.size), uncovered: [...surfaces].filter((s) => !surfacesCovered.includes(s)) },
    invariant_coverage: { patterns_instantiated: patternInstantiated.length, total_patterns: patterns.length, pct: pct(patternInstantiated.length, patterns.length), not_yet_instantiated: patterns.filter((p) => !patternInstantiated.includes(p)) },
    regression_coverage: { defect_classes: Object.keys(lib.defectClasses.classes || {}).length, families_with_a_class: familiesWithRegression.length, families_total: patterns.length },
  };
}
