// Worker lanes and the independence rules that decide what may run at the same time.
//
// Parallel QA is only worth having if the results stay trustworthy. Two workers that touch the
// same mutable thing do not produce two findings - they produce one contaminated finding that
// LOOKS like a product defect. That failure mode is worse than running sequentially, because it
// manufactures false bugs and burns founder attention disproving them.
//
// So independence is EXPLICIT and conservative here: work is co-schedulable only when it can be
// shown not to share a mutable resource. Anything unproven is treated as shared.
export const LANES = {
  W1_AI_TRUTH: {
    id: 'W1_AI_TRUTH',
    label: 'AI Truth',
    owns: ['brain_chat', 'history', 'pending_action', 'truth', 'response_alignment', 'provenance', 'long_context', 'chat_runtime'],
    domains: ['chat', 'ai', 'continuity'],
    // Every chat test consumes channels and pending-action state.
    resource_classes: ['chat_channel', 'pending_action', 'browser'],
  },
  W2_TENANCY: {
    id: 'W2_TENANCY',
    label: 'Tenancy + Relationships',
    owns: ['org_scope', 'people', 'manager', 'company_relationships', 'permissions', 'archived_parents', 'group_boundaries', 'tenant_isolation'],
    domains: ['employment', 'organization', 'security'],
    resource_classes: ['person_fixture', 'company_fixture', 'org_selector', 'browser'],
  },
  W3_WEB_PRODUCT: {
    id: 'W3_WEB_PRODUCT',
    label: 'Web Product',
    owns: ['navigation', 'reload', 'derived_views', 'empty_states', 'loading_states', 'error_states', 'dashboard', 'archived_surfaces', 'build_version_ui', 'exploratory_ui'],
    domains: ['ui', 'navigation', 'derived'],
    resource_classes: ['browser', 'org_selector'],
  },
};

export const LANE_IDS = Object.keys(LANES);

/**
 * Resources a work item would occupy. Anything not positively identified as read-only is
 * treated as mutable, because the cost of a false "independent" is a fabricated defect.
 */
export function resourcesOf(item) {
  const r = new Set();
  for (const f of item.fixtures || []) r.add('fixture:' + f);
  for (const c of item.channels || []) r.add('channel:' + c);
  if (item.browser_context) r.add('browser:' + item.browser_context);
  if (item.org_selector) r.add('org_selector:' + item.org_selector);
  for (const a of item.canonical_artifacts || []) r.add('artifact:' + a);
  if (item.destructive_target) r.add('destructive:' + item.destructive_target);
  return r;
}

/**
 * May these two items run concurrently?
 *
 * Returns a REASON on refusal rather than a bare false, because "why did the scheduler serialise
 * these" is the first question anyone asks when parallel QA runs slower than expected.
 */
export function independent(a, b) {
  if (a.lane === b.lane) return { ok: false, reason: 'SAME_LANE' };
  if (a.scenario_id && a.scenario_id === b.scenario_id) return { ok: false, reason: 'SAME_SCENARIO' };

  const ra = resourcesOf(a), rb = resourcesOf(b);
  for (const x of ra) if (rb.has(x)) return { ok: false, reason: 'SHARED_RESOURCE', resource: x };

  // A read-only pair may share a browser context only if BOTH are read-only and isolation has
  // not been claimed. Any mutation forces exclusivity.
  const aMut = a.mutates !== false, bMut = b.mutates !== false;
  if (aMut && bMut && a.browser_context && a.browser_context === b.browser_context) {
    return { ok: false, reason: 'SHARED_BROWSER_MUTATION' };
  }
  return { ok: true };
}

/**
 * Greedily pick up to `max` mutually independent items.
 *
 * Deliberately greedy and order-preserving rather than optimal: a scheduler that reorders work
 * to maximise occupancy makes runs non-reproducible, and reproducibility matters more here than
 * throughput. Refusals are returned so they can be logged.
 */
export function selectIndependentBatch(candidates, max = 3, ctx = {}) {
  const chosen = [];
  const refused = [];
  for (const item of candidates) {
    if (chosen.length >= max) break;

    if (item.requires_browser && ctx.browserIsolationProven === false) {
      refused.push({ item: item.scenario_id || item.id, reason: 'BROWSER_ISOLATION_UNPROVEN' });
      continue;
    }
    if (item.mutates !== false && item.requires_browser && ctx.browserIsolationProven !== true) {
      refused.push({ item: item.scenario_id || item.id, reason: 'BROWSER_MUTATION_BLOCKED_PENDING_ISOLATION_PROOF' });
      continue;
    }

    let conflict = null;
    for (const c of chosen) {
      const v = independent(item, c);
      if (!v.ok) { conflict = { ...v, against: c.scenario_id || c.id }; break; }
    }
    if (conflict) { refused.push({ item: item.scenario_id || item.id, ...conflict }); continue; }
    chosen.push(item);
  }
  return { chosen, refused };
}
