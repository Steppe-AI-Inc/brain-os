// MODEL ASSURANCE — a model's standing is DERIVED FROM RUN EVIDENCE, never from configuration.
//
// ── THE OBSERVED DEFECT THIS ANSWERS ────────────────────────────────────────────────────────────────
//
// `MODEL_CATALOG_MUST_NOT_ADVERTISE_UNTESTED_MODELS`, recorded in qa/work-orders/AI_PROVIDER_RELIABILITY.md
// against production truth measured 2026-09-08: roughly fourteen models are offered as equivalent choices
// and exactly ONE has ever served a call. Measured, not estimated:
//
//     claude-haiku-4-5   471 served calls            the only actively serving model
//     claude-sonnet-4-6   32 served calls            historical only, unexercised for 15 days
//     claude-sonnet-5      configured, ZERO calls    not broken - UNVERIFIED
//     claude-opus-5        never configured          no usage evidence at all
//     gpt-5.6-sol          >=8 attempts, all failed  HTTP 200, stream never terminated
//     gpt-5-mini           >=9 attempts, all failed  failure class UNKNOWN, the errors were overwritten
//     fallback-no-api-key   8 turns                  NOT AN LLM - a deterministic planner
//     DeepSeek             no credential             BLOCKED_BY_CREDENTIAL
//
// "CONFIGURED" AND "PROVEN" ARE DIFFERENT WORDS. A catalog that prints them the same way is the reason a
// round can be dispatched onto a model that has never completed a call, and the reason `fallback-no-api-key`
// - a planner, not a language model - appears in `model_usage` as though it were one.
//
// ── WHY DERIVED AND NOT DECLARED ────────────────────────────────────────────────────────────────────
//
// A hand-maintained "proven: true" flag is a remembered fact, and this campaign's whole ledger is remembered
// facts going stale: a forgiveness table naming a closed defect, a mutation anchor that stopped resolving, a
// comment claiming an architecture the code did not have. So standing is computed from `factory.agent_runs`
// every time it is asked, out of the columns that cannot be written without saying what happened -
// `termination_reason`, and `actual_model` which cannot differ from `requested_model` without a
// `fallback_reason`. Nothing here can be made to read better by editing a list.
//
// HTTP SUCCESS IS NOT A VALID COMPLETED RUN, so `status = 'done'` alone never counts: a run contributes to a
// model's standing only with a terminal condition that says it actually finished.

/** Terminal conditions that mean the model really completed the work. Anything else is not a completion. */
export const COMPLETED_TERMINAL_REASONS = Object.freeze(['completed', 'completed_with_verdict']);

/** The standings, ordered. A caller compares ranks; it never matches on the name. */
export const ASSURANCE = Object.freeze({
  BLOCKED_BY_CREDENTIAL: 0,   // no credential exists, so the model cannot be tried at all
  NOT_AN_LLM: 0,              // named in usage data but is not a language model (fallback-no-api-key)
  FAILING: 1,                 // tried and never completed - every attempt ended in a non-completion
  UNVERIFIED: 2,              // configured, never tried. NOT broken. Not evidence either.
  HISTORICAL: 3,              // completed in the past, nothing recent
  PROVEN: 4,                  // completed recently, repeatedly
});

const RANK_NAMES = Object.freeze(['BLOCKED_BY_CREDENTIAL', 'FAILING', 'UNVERIFIED', 'HISTORICAL', 'PROVEN']);

/**
 * What a task class REQUIRES of the model serving it. The rule is the founder's, not invented here:
 * an independent verifier round is the production-deployment gate, and the evidence it produces is what a
 * release is certified on - so it may not be served by a model with no evidence that it can finish a run.
 *
 * Cheap work is deliberately allowed on lower assurance, because that is the entire point of having tiers:
 * a lint sweep or a corpus generation that fails is retried and costs minutes.
 */
export const TASK_ASSURANCE_FLOOR = Object.freeze({
  verifier_round: ASSURANCE.PROVEN,          // the release gate
  release_broker: ASSURANCE.PROVEN,
  product_repair: ASSURANCE.HISTORICAL,      // a wrong answer is caught by the battery
  qa_instrument: ASSURANCE.HISTORICAL,
  corpus_generation: ASSURANCE.UNVERIFIED,   // cheap, retryable, and its output is measured anyway
  lint_sweep: ASSURANCE.UNVERIFIED,
});

/**
 * Derive one model's standing from run rows. Pure: the caller does the reading, so this is testable
 * without a database and cannot be fooled by a connection that silently returns nothing.
 *
 * @param {Array<{actual_model?:string, requested_model?:string, status?:string, termination_reason?:string, finished_at?:string|Date}>} runs
 *        every run that named this model, as either requested or actual
 * @param {{now?: Date, recentDays?: number, credentialPresent?: boolean, isLanguageModel?: boolean}} opts
 */
export function deriveAssurance(runs, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const recentDays = Number.isFinite(opts.recentDays) ? opts.recentDays : 14;
  const credentialPresent = opts.credentialPresent !== false;
  const isLanguageModel = opts.isLanguageModel !== false;

  // A CREDENTIAL CHECK COMES FIRST, because a model nobody can call has no standing to derive and calling
  // it UNVERIFIED would invite a scheduler to try it. DeepSeek is here today.
  if (!credentialPresent) {
    return { assurance: ASSURANCE.BLOCKED_BY_CREDENTIAL, name: 'BLOCKED_BY_CREDENTIAL',
      completions: 0, attempts: 0, reason: 'no credential is configured, so this model cannot be tried' };
  }
  // `fallback-no-api-key` served eight turns and is a deterministic planner. It is in the usage data and it
  // is not a model, and a tier system that cannot say so will eventually route real work to it.
  if (!isLanguageModel) {
    return { assurance: ASSURANCE.NOT_AN_LLM, name: 'NOT_AN_LLM',
      completions: 0, attempts: 0, reason: 'named in usage data but is not a language model' };
  }

  const rows = Array.isArray(runs) ? runs : [];
  const attempts = rows.length;
  const completed = rows.filter((r) => COMPLETED_TERMINAL_REASONS.includes(String(r.termination_reason || '')));
  const completions = completed.length;

  if (attempts === 0) {
    return { assurance: ASSURANCE.UNVERIFIED, name: 'UNVERIFIED', completions: 0, attempts: 0,
      reason: 'configured, never tried — unverified is not the same as broken, and not the same as working' };
  }
  if (completions === 0) {
    return { assurance: ASSURANCE.FAILING, name: 'FAILING', completions: 0, attempts,
      reason: attempts + ' attempt(s), none reaching a completion terminal condition' };
  }

  const cutoff = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
  const recent = completed.filter((r) => r.finished_at && new Date(r.finished_at) >= cutoff);
  if (recent.length === 0) {
    return { assurance: ASSURANCE.HISTORICAL, name: 'HISTORICAL', completions, attempts,
      reason: completions + ' completion(s), none within ' + recentDays + ' days' };
  }
  // TWO, NOT ONE. A single completion is an anecdote, and `claude-sonnet-5` is the standing reminder that a
  // model can be configured, look fine, and have no record at all.
  if (recent.length < 2) {
    return { assurance: ASSURANCE.HISTORICAL, name: 'HISTORICAL', completions, attempts,
      reason: 'only one recent completion — one is an anecdote, not a record' };
  }
  return { assurance: ASSURANCE.PROVEN, name: 'PROVEN', completions, attempts,
    reason: recent.length + ' completion(s) within ' + recentDays + ' days' };
}

/**
 * May this task class be served by this model? Returns a decision with its reason, never a bare boolean:
 * a refusal whose reason is not recorded is indistinguishable from a scheduler that simply had nothing to do.
 */
export function mayServe(taskClass, standing) {
  const floor = TASK_ASSURANCE_FLOOR[taskClass];
  if (floor === undefined) {
    // FAIL CLOSED ON AN UNKNOWN CLASS. A task class nobody declared is not automatically cheap, and the
    // alternative - defaulting to the lowest floor - means adding a task class silently grants it the right
    // to run on an unproven model.
    return { allowed: false, floor: null,
      reason: 'task class ' + JSON.stringify(taskClass) + ' is not declared in TASK_ASSURANCE_FLOOR;'
        + ' an undeclared class fails closed rather than inheriting the cheapest floor' };
  }
  const allowed = standing.assurance >= floor;
  return {
    allowed, floor,
    reason: allowed
      ? taskClass + ' needs ' + RANK_NAMES[floor] + ' or better; this model is ' + standing.name
        + ' (' + standing.reason + ')'
      : taskClass + ' needs ' + RANK_NAMES[floor] + ' or better and this model is ' + standing.name
        + ' — ' + standing.reason,
  };
}

/** The SQL a caller uses to gather the rows deriveAssurance() reads. Exported so the shape is reviewable. */
export const RUNS_FOR_MODEL_SQL = `
select coalesce(actual_model, requested_model) as model, status, termination_reason, finished_at
  from factory.agent_runs
 where coalesce(actual_model, requested_model) = $1`;
