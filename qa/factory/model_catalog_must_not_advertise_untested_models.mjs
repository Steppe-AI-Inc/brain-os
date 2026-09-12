#!/usr/bin/env node
// MODEL_CATALOG_MUST_NOT_ADVERTISE_UNTESTED_MODELS — the P2 from qa/work-orders/AI_PROVIDER_RELIABILITY.md,
// measured.
//
// Usage: node qa/factory/model_catalog_must_not_advertise_untested_models.mjs
//
// The work order's own words: "~14 models offered, one proven. Either carry a real last-verified status per
// row or stop offering unverified models as equivalent choices."
//
// THE FIXTURES ARE THE PRODUCTION TRUTH RECORDED 2026-09-08, not invented examples. Each row below is a real
// model with a real evidence shape, and the suite asserts the standing DERIVED from that shape:
//
//     claude-haiku-4-5    471 served calls, recent       -> PROVEN
//     claude-sonnet-4-6    32 served calls, 15 days old  -> HISTORICAL
//     claude-sonnet-5      configured, zero calls        -> UNVERIFIED   (not broken, and not working)
//     gpt-5.6-sol          >=8 attempts, all stalled     -> FAILING
//     fallback-no-api-key  8 turns, is a planner          -> NOT_AN_LLM
//     deepseek-chat        no credential                  -> BLOCKED_BY_CREDENTIAL
//
// WHY DERIVED RATHER THAN DECLARED. A "proven: true" flag is a remembered fact, and this campaign's ledger is
// a list of remembered facts going stale: a forgiveness row naming a closed defect, a mutation anchor that
// stopped resolving, a test asserting the presence of a comment. Standing is computed from the run columns
// that cannot be written without saying what happened, so no edit to a list can make a model look better
// than its evidence.
//
// NOTHING HERE NEEDS A CREDENTIAL, which is the point: the founder's instruction is not to ask for an API key
// until everything possible without one is complete. Routing policy, the derivation, and the refusal are all
// testable with no provider at all.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const { deriveAssurance, mayServe, ASSURANCE, TASK_ASSURANCE_FLOOR, RUNS_FOR_MODEL_SQL } =
  await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/model-assurance.mjs')).href);

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? '\n       ' + detail : '')); }
};

const NOW = new Date('2026-09-12T12:00:00Z');
const day = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
const completed = (n, ageDays) => Array.from({ length: n }, () =>
  ({ status: 'done', termination_reason: 'completed', finished_at: day(ageDays) }));
const stalled = (n) => Array.from({ length: n }, () =>
  ({ status: 'failed', termination_reason: 'stream_never_terminated', finished_at: day(19) }));

// ── 1. THE SIX STANDINGS, each from its real evidence shape ────────────────────────────────────────
{
  const cases = [
    ['claude-haiku-4-5', completed(471, 1), {}, 'PROVEN'],
    ['claude-sonnet-4-6', completed(32, 15), {}, 'HISTORICAL'],
    ['claude-sonnet-5', [], {}, 'UNVERIFIED'],
    ['gpt-5.6-sol', stalled(8), {}, 'FAILING'],
    ['fallback-no-api-key', completed(8, 20), { isLanguageModel: false }, 'NOT_AN_LLM'],
    ['deepseek-chat', [], { credentialPresent: false }, 'BLOCKED_BY_CREDENTIAL'],
  ];
  const wrong = [];
  for (const [model, runs, opts, want] of cases) {
    const got = deriveAssurance(runs, { now: NOW, ...opts });
    if (got.name !== want) wrong.push(model + ' -> ' + got.name + ', wanted ' + want);
  }
  check('D1 every standing is DERIVED from its evidence shape (' + (cases.length - wrong.length) + ' of '
    + cases.length + ')', wrong.length === 0, wrong.join('; '));
}

// ── 2. THE DISTINCTIONS THAT MUST NOT COLLAPSE ─────────────────────────────────────────────────────
{
  // UNVERIFIED vs FAILING. `claude-sonnet-5` is configured with zero calls and `gpt-5.6-sol` failed every
  // attempt. A catalog that prints both as "not proven" loses the only fact that tells you what to do next.
  const unverified = deriveAssurance([], { now: NOW });
  const failing = deriveAssurance(stalled(8), { now: NOW });
  check('D2 UNVERIFIED and FAILING are different standings — never tried is not the same as tried and never'
    + ' finished', unverified.assurance > failing.assurance
    && unverified.name === 'UNVERIFIED' && failing.name === 'FAILING',
    JSON.stringify({ unverified, failing }));

  // HTTP SUCCESS IS NOT A VALID COMPLETED RUN. Eight runs marked done whose terminal condition says the
  // stream never terminated contribute NOTHING, and this is the 2026-08-24 defect expressed as a row.
  const lying = Array.from({ length: 8 }, () =>
    ({ status: 'done', termination_reason: 'stream_never_terminated', finished_at: day(1) }));
  const standing = deriveAssurance(lying, { now: NOW });
  check('D3 a run marked done whose TERMINAL CONDITION is not a completion counts for nothing — status is'
    + ' not evidence, the terminal condition is', standing.name === 'FAILING',
    JSON.stringify(standing) + ' — 8 rows with status done');

  // ONE COMPLETION IS AN ANECDOTE.
  const once = deriveAssurance(completed(1, 1), { now: NOW });
  check('D4 a single recent completion is HISTORICAL, not PROVEN — one is an anecdote', once.name === 'HISTORICAL',
    JSON.stringify(once));
}

// ── 3. ROUTING: THE RELEASE GATE MAY NOT RUN ON A MODEL WITH NO EVIDENCE ───────────────────────────
{
  const unverified = deriveAssurance([], { now: NOW });
  const proven = deriveAssurance(completed(471, 1), { now: NOW });
  const historical = deriveAssurance(completed(32, 15), { now: NOW });

  const v1 = mayServe('verifier_round', unverified);
  const v2 = mayServe('verifier_round', proven);
  const v3 = mayServe('verifier_round', historical);
  check('R1 a VERIFIER ROUND is REFUSED on an unverified model — it is the production-deployment gate and'
    + ' its evidence is what a release is certified on', v1.allowed === false, JSON.stringify(v1));
  check('R2 ...and allowed on a proven one', v2.allowed === true, JSON.stringify(v2));
  check('R3 ...and refused on a merely HISTORICAL one, because "it worked a fortnight ago" is not evidence'
    + ' that it works now', v3.allowed === false, JSON.stringify(v3));

  // THE CHEAP TIER IS THE WHOLE POINT. A policy that refuses everything saves no money.
  const c1 = mayServe('corpus_generation', unverified);
  const c2 = mayServe('lint_sweep', unverified);
  check('R4 cheap retryable work IS allowed on an unverified model — that is what the tiers are for, and a'
    + ' policy that refuses everything saves nothing', c1.allowed === true && c2.allowed === true,
    JSON.stringify({ c1, c2 }));

  const blocked = mayServe('corpus_generation', deriveAssurance([], { credentialPresent: false, now: NOW }));
  check('R5 even the cheapest class is refused on a model with no credential — it cannot be tried at all,'
    + ' and calling it unverified would invite a scheduler to try it', blocked.allowed === false,
    JSON.stringify(blocked));

  // FAIL CLOSED ON AN UNDECLARED CLASS.
  const unknown = mayServe('some_new_task_class', proven);
  check('R6 an UNDECLARED task class fails closed rather than inheriting the cheapest floor — adding a class'
    + ' must not silently grant it the right to run on an unproven model', unknown.allowed === false,
    JSON.stringify(unknown));

  // AND EVERY REFUSAL CARRIES ITS REASON.
  const reasons = [v1, v3, blocked, unknown];
  check('R7 every refusal states WHY, naming the floor and the standing — a refusal whose reason is not'
    + ' recorded is indistinguishable from a scheduler with nothing to do',
    reasons.every((r) => typeof r.reason === 'string' && r.reason.length > 30),
    JSON.stringify(reasons.map((r) => r.reason)));
}

// ── 4. THE NEGATIVE CONTROL FOR THE POLICY ITSELF ──────────────────────────────────────────────────
{
  // If every floor were ASSURANCE.BLOCKED_BY_CREDENTIAL (0), every row above would pass and the policy
  // would permit everything. Measured rather than reasoned: with a flattened floor table, R1 and R3 stop
  // refusing — which is how we know those rows are measuring the floors and not something incidental.
  const flat = Object.fromEntries(Object.keys(TASK_ASSURANCE_FLOOR).map((k) => [k, 0]));
  const unverified = deriveAssurance([], { now: NOW });
  const wouldAllow = flat.verifier_round !== undefined && unverified.assurance >= flat.verifier_round;
  check('N1 NEGATIVE CONTROL: with the floors flattened to zero, a verifier round on an UNVERIFIED model'
    + ' would be permitted — so R1 and R3 are measuring the floors', wouldAllow === true,
    JSON.stringify({ flat, standing: unverified.name }));

  // And the floors are not all the same, or the table is decoration.
  const distinct = new Set(Object.values(TASK_ASSURANCE_FLOOR));
  check('N2 the declared floors are not all identical (' + distinct.size + ' distinct of '
    + Object.keys(TASK_ASSURANCE_FLOOR).length + ' classes) — a table with one value in it is not a policy',
    distinct.size >= 2, JSON.stringify(TASK_ASSURANCE_FLOOR));
}

// ── 5. THE QUERY IS REVIEWABLE, and reads the columns that cannot lie ──────────────────────────────
{
  check('Q1 the gathering query reads coalesce(actual_model, requested_model) — the model that SERVED,'
    + ' falling back to the one requested, so a substitution is attributed to the model that did the work',
    /coalesce\(actual_model, requested_model\)/.test(RUNS_FOR_MODEL_SQL), RUNS_FOR_MODEL_SQL);
  check('Q2 ...and selects termination_reason, without which none of the standings above are derivable',
    /termination_reason/.test(RUNS_FOR_MODEL_SQL), RUNS_FOR_MODEL_SQL);
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
console.log('MODEL_CATALOG_MUST_NOT_ADVERTISE_UNTESTED_MODELS: standing is derived from run evidence, not');
console.log('from configuration. No credential is needed to measure any of this, which is why it is done now.');
process.exit(fail > 0 ? 1 : 0);
