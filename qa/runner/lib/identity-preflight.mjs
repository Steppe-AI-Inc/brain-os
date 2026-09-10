// Live identity preflight for BROWSER_QA workers (founder hardening A8, 2026-09-10).
//
// A storageState file on disk is NOT authentication proof. Before a bootstrapped browser worker
// may perform its assigned scenario, the orchestrator runs a separate, read-only BROWSER_QA
// worker under the SAME synthetic identity and asks it to observe - through the product UI, with
// the approved high-level tools only - whether the session is authenticated, which account marker
// is visible, and which organisations are authorised. The orchestrator (not the model) classifies
// the observation and writes PREFLIGHT.json into the scenario worker's run directory.
//
// Classification is a pure function so it is unit-testable and so the model's own opinion of
// "am I logged in" never decides anything:
//
//   AUTH_OK                - authenticated, expected identity confirmed, org scope exactly as expected
//   BLOCKED_QA_AUTH        - not authenticated (login page / no session), storageState may be expired
//   IDENTITY_MISMATCH      - authenticated as a DIFFERENT account -> kill lane, never fall back
//   IDENTITY_UNCONFIRMED   - authenticated but no account marker observable -> blocked (conservative)
//   ORG_SCOPE_MISMATCH     - expected org absent, or an unexpected (real) org is visible -> kill lane
//
// INVARIANT: no product mutation until AUTH_OK AND identity confirmed AND org scope confirmed.
// orchestrator.launchWorker enforces it: a SCENARIO launch of a BROWSER_QA worker without a fresh
// AUTH_OK record bound to the same campaign/identity/org is not launched.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { workerDir } from './worker-lease.mjs';

export const PREFLIGHT_CLASSES = Object.freeze(['AUTH_OK', 'BLOCKED_QA_AUTH', 'IDENTITY_MISMATCH', 'IDENTITY_UNCONFIRMED', 'ORG_SCOPE_MISMATCH']);
export const PREFLIGHT_MAX_AGE_MS = 30 * 60_000;
export const PREFLIGHT_SUFFIX = '-PREFLIGHT';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * expected: { identity_id, org_scope, expected_markers?: string[] (email / display name fragments), allowed_orgs?: string[] }
 * observed: { authenticated: boolean, identity_marker: string|null, authorized_orgs: string[], current_org: string|null, page_url?: string }
 */
export function classifyPreflight(expected, observed) {
  const exp = expected || {}, obs = observed || {};
  const reasons = [];
  if (obs.authenticated !== true) {
    return { classification: 'BLOCKED_QA_AUTH', reasons: ['not authenticated through the product UI (login page or no session)' + (obs.page_url ? ' at ' + obs.page_url : '')] };
  }
  const markers = [exp.identity_id, ...(exp.expected_markers || [])].filter(Boolean).map(norm);
  const seen = norm(obs.identity_marker);
  if (!seen) {
    return { classification: 'IDENTITY_UNCONFIRMED', reasons: ['authenticated, but no account/identity marker was observable in the UI; expected one of ' + markers.join(' | ')] };
  }
  if (!markers.some((m) => seen.includes(m))) {
    return { classification: 'IDENTITY_MISMATCH', reasons: ['authenticated as "' + obs.identity_marker + '", which matches none of the expected markers (' + markers.join(' | ') + ')'] };
  }
  const orgs = (Array.isArray(obs.authorized_orgs) ? obs.authorized_orgs : []).map(norm).filter(Boolean);
  const allowed = new Set([exp.org_scope, ...(exp.allowed_orgs || [])].filter(Boolean).map(norm));
  if (!exp.org_scope || !orgs.includes(norm(exp.org_scope))) {
    reasons.push('expected org scope "' + exp.org_scope + '" is not among the authorised organisations observed: [' + orgs.join(', ') + ']');
  }
  const unexpected = orgs.filter((o) => !allowed.has(o));
  if (unexpected.length) reasons.push('unexpected organisation access observed: [' + unexpected.join(', ') + '] - possible real-org membership');
  if (reasons.length) return { classification: 'ORG_SCOPE_MISMATCH', reasons };
  if (obs.current_org && !allowed.has(norm(obs.current_org)) && norm(obs.current_org) !== 'all organizations') {
    return { classification: 'ORG_SCOPE_MISMATCH', reasons: ['current organisation "' + obs.current_org + '" is outside the expected scope'] };
  }
  return { classification: 'AUTH_OK', reasons: [] };
}

/** Prompt for the read-only preflight worker. Observation only; the model never classifies. */
export function buildPreflightDirective({ campaignId, workerId, identityId, orgScope }) {
  return [
    'IDENTITY PREFLIGHT - OBSERVATION ONLY. You must NOT change anything: no create/edit/archive/restore/delete, no',
    'form submission, no typing except into a search box, no confirmations. Only navigate, snapshot, hover, click on',
    'navigation/menus. If any step would require submitting a form, skip it and say so.',
    'Do NOT attempt to log in. Do NOT enter credentials. If the login page is shown, that IS the finding.',
    '',
    'EXPECTED (do not assume it is true - observe): identity_id=' + identityId + ' org_scope=' + orgScope,
    '',
    'Steps:',
    '1. browser_navigate https://brain.open-spot.ai/ then browser_snapshot. Record the final URL and whether it is the',
    '   login page (Sign in) or an app page (sidebar/navigation present).',
    '2. If an app page: open the account/profile/user menu if one is visible and record any email or display name shown',
    '   verbatim. If none is visible, say "no marker visible".',
    '3. Open the organisation selector (company/org switcher) and record EVERY organisation name listed, verbatim,',
    '   and which one is currently selected. If no selector is visible, record what the sidebar shows instead.',
    '4. Navigate to https://brain.open-spot.ai/companies and record the company names shown at "All Organizations"',
    '   (if a selector exists) - list them verbatim.',
    '',
    'FINAL MESSAGE - exactly one JSON object, nothing else:',
    '{"worker_id":"' + workerId + '","campaign_id":"' + campaignId + '","scenario_id":"identity-preflight",',
    ' "verdict":"BLOCKED","blocked_reason":"PREFLIGHT_OBSERVATION_ONLY","browser_required":true,"browser_available":true,',
    ' "preflight":{"authenticated":true|false,"page_url":"...","identity_marker":"<email or name verbatim or null>",',
    '   "authorized_orgs":["..."],"current_org":"<name or null>","companies_visible":["..."],"notes":"..."},',
    ' "evidence":{"observed":"<one paragraph of what the pages showed>"}}',
  ].join('\n');
}

export function preflightPath(campaignId, workerId) { return join(workerDir(campaignId, workerId), 'PREFLIGHT.json'); }

export function readPreflight(campaignId, workerId) {
  try { return JSON.parse(readFileSync(preflightPath(campaignId, workerId), 'utf8')); } catch { return null; }
}

/**
 * Is this preflight record sufficient to authorise a SCENARIO launch? Bound to campaign, identity,
 * org, classification and age. Anything missing or stale -> not sufficient, with the reason.
 */
export function preflightAuthorises(rec, { campaignId, workerId, identityId, orgScope, now = Date.now() } = {}) {
  if (!rec) return { ok: false, reason: 'PREFLIGHT_REQUIRED' };
  if (rec.campaign_id !== campaignId) return { ok: false, reason: 'PREFLIGHT_CAMPAIGN_MISMATCH' };
  if (rec.worker_id && rec.worker_id !== workerId) return { ok: false, reason: 'PREFLIGHT_WORKER_MISMATCH' };
  if (norm(rec.expected && rec.expected.identity_id) !== norm(identityId)) return { ok: false, reason: 'PREFLIGHT_IDENTITY_MISMATCH' };
  if (norm(rec.expected && rec.expected.org_scope) !== norm(orgScope)) return { ok: false, reason: 'PREFLIGHT_ORG_MISMATCH' };
  if (rec.classification !== 'AUTH_OK') return { ok: false, reason: rec.classification || 'PREFLIGHT_UNCLASSIFIED' };
  const age = now - Date.parse(rec.classified_at || 0);
  if (!(age >= 0 && age <= PREFLIGHT_MAX_AGE_MS)) return { ok: false, reason: 'PREFLIGHT_STALE' };
  return { ok: true, reason: null };
}

/**
 * Run the preflight worker and materialise PREFLIGHT.json for `workerId`. `launch` is
 * orchestrator.launchWorker (injected to avoid an import cycle). Evidence is preserved in the
 * preflight worker's own run dir (<workerId>-PREFLIGHT) whatever the outcome.
 */
export async function runIdentityPreflight({ campaignId, workerId, lane, identityId, orgScope, expectedMarkers = [], allowedOrgs = [], launch, maxBudgetUsd = 1.5, model }) {
  const pfWorker = workerId + PREFLIGHT_SUFFIX;
  const expected = { identity_id: identityId, org_scope: orgScope, expected_markers: expectedMarkers, allowed_orgs: allowedOrgs };
  const h = launch({
    campaignId, workerId: pfWorker, lane, workerClass: 'BROWSER_QA', launchMode: 'PREFLIGHT',
    identityId, orgScope, directive: buildPreflightDirective({ campaignId, workerId: pfWorker, identityId, orgScope }),
    assignedScenarios: ['identity-preflight'], fixtureNamespace: 'preflight/' + workerId, authorizedFixtureIds: [],
    maxBudgetUsd, model, hangMs: 4 * 60_000, hardCapMs: 8 * 60_000,
  });
  const rec = {
    schema: 'qa.identity-preflight/1', campaign_id: campaignId, worker_id: workerId, preflight_worker_id: pfWorker,
    expected, observed: null, classification: null, reasons: [], classified_at: null, classified_by: 'orchestrator',
    evidence: { preflight_run_dir: workerDir(campaignId, pfWorker), transcript: join(workerDir(campaignId, pfWorker), 'EVIDENCE', 'worker-transcript.md') },
    launch: { launched: h.launched, reason: h.reason || null },
  };
  if (!h.launched) {
    rec.classification = h.reason === 'BLOCKED_QA_AUTH' ? 'BLOCKED_QA_AUTH' : 'BLOCKED_QA_AUTH';
    rec.reasons = ['preflight worker not launched: ' + (h.worker && h.worker.blocked_reason || h.reason)];
  } else {
    const out = await h.promise;
    rec.worker_status = out.status; rec.cost_usd = out.cost_usd ?? null; rec.init_tools = out.init_tools || null;
    let result = null;
    try { result = JSON.parse(readFileSync(join(workerDir(campaignId, pfWorker), 'RESULT.json'), 'utf8')); } catch {}
    const obs = result && result.preflight && typeof result.preflight === 'object' ? result.preflight : null;
    if (out.boundary_violation) { rec.classification = 'BLOCKED_QA_AUTH'; rec.reasons = ['preflight worker boundary violation: ' + out.boundary_violation.reason]; }
    else if (!obs) { rec.classification = 'BLOCKED_QA_AUTH'; rec.reasons = ['preflight produced no observation (' + (result && result.invalid_reason || out.status) + ')']; }
    else { rec.observed = obs; const c = classifyPreflight(expected, obs); rec.classification = c.classification; rec.reasons = c.reasons; }
  }
  rec.classified_at = nowIso();
  rec.mutation_authorised = rec.classification === 'AUTH_OK';
  mkdirSync(workerDir(campaignId, workerId), { recursive: true });
  writeFileSync(preflightPath(campaignId, workerId), JSON.stringify(rec, null, 2) + '\n');
  return rec;
}
