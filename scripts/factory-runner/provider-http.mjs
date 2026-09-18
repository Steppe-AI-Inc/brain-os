// THE HTTP PROVIDER CALL PATH (Factory V1 milestone 6, the half that needs no credential to build).
//
// provider.mjs reaches one provider, Anthropic, by shelling the `claude` CLI. Cheap continuous QA on DeepSeek needs
// a second path that speaks HTTP to an OpenAI-compatible chat-completions endpoint, and this is it. It is a pure
// function of its inputs plus the environment, and it makes exactly the promises the control plane enforces:
//
//   * THE CREDENTIAL COMES FROM THE ENVIRONMENT AND GOES NOWHERE ELSE. It is read at call time from the variable
//     claim.mjs names for the provider (CREDENTIAL_ENV), sent in the Authorization header, and never returned,
//     logged, checkpointed or written to the plane. Without it the call is BLOCKED_BY_CREDENTIAL and NO request
//     is made - the absence of a key is a classification, not an exception.
//   * HTTP SUCCESS IS NOT A COMPLETED RUN. A 200 whose body did not finish (finish_reason != stop, a stream that
//     never terminated, a malformed body) reports a terminal condition that is NOT `completed`, so the run cannot
//     count as evidence for the model (model-assurance.mjs COMPLETED_TERMINAL_REASONS).
//   * THE MODEL THAT ANSWERED IS REPORTED AS THE PROVIDER NAMED IT. `actualModel` is the response's `model` field,
//     so a silent substitution surfaces at completeRun, where the plane refuses it without a fallbackReason.
//   * FAILURES ARE CLASSIFIED, NEVER THROWN: 401/403 → BLOCKED_BY_CREDENTIAL, 429 → PROVIDER_CAPACITY_BLOCKED,
//     5xx / network → PROVIDER_TRANSIENT_ERROR (retryable with transientBackoffSeconds), a timeout →
//     STREAM_NEVER_TERMINATED. The caller decides what to do; the plane records what happened.
//
// Nothing here is wired into the generic node by default - what a node DOES is the director's business (node.mjs).
// qa/factory/http_provider_acceptance.mjs drives it against a stub server and a disposable plane.
import { CREDENTIAL_ENV } from './claim.mjs';
import { PROVIDER_CAPACITY_BLOCKED, PROVIDER_TRANSIENT_ERROR } from './provider.mjs';

export const BLOCKED_BY_CREDENTIAL = 'BLOCKED_BY_CREDENTIAL';
export const STREAM_NEVER_TERMINATED = 'STREAM_NEVER_TERMINATED';
export const MALFORMED_RESPONSE = 'MALFORMED_RESPONSE';

/** Endpoints per provider. The base URL is overridable by environment so a stub can stand in; the key variable is claim.mjs's. */
export const HTTP_PROVIDERS = Object.freeze({
  deepseek: { baseUrlEnv: 'DEEPSEEK_BASE_URL', baseUrl: 'https://api.deepseek.com', path: '/chat/completions', keyEnv: CREDENTIAL_ENV.deepseek },
  openai:   { baseUrlEnv: 'OPENAI_BASE_URL',   baseUrl: 'https://api.openai.com/v1', path: '/chat/completions', keyEnv: CREDENTIAL_ENV.openai },
});

/**
 * One chat completion over HTTP. Never throws for a provider outcome; returns a classified result.
 * @param {{provider:string, model:string, messages:Array<{role:string,content:string}>, maxTokens?:number,
 *          temperature?:number, timeoutMs?:number, fetchImpl?:typeof fetch}} p
 * @returns {Promise<{ok:boolean, provider:string, requestedModel:string, actualModel:string|null, terminationReason:string,
 *          classification:string|null, providerRunId:string|null, content:string|null, finishReason:string|null,
 *          usage:{inputTokens:number|null, cachedTokens:number|null, outputTokens:number|null}, httpStatus:number|null,
 *          detail:string|null, requestsMade:number}>}
 */
export async function httpCompletion({ provider, model, messages, maxTokens = 1024, temperature = 0, timeoutMs = 120000, fetchImpl = globalThis.fetch }) {
  const spec = HTTP_PROVIDERS[String(provider || '').toLowerCase()];
  const base = { ok: false, provider, requestedModel: model, actualModel: null, terminationReason: null, classification: null,
    providerRunId: null, content: null, finishReason: null, usage: { inputTokens: null, cachedTokens: null, outputTokens: null },
    httpStatus: null, detail: null, requestsMade: 0 };
  if (!spec) return { ...base, classification: MALFORMED_RESPONSE, terminationReason: 'unknown_provider', detail: 'no HTTP provider named ' + provider };
  if (!model) return { ...base, classification: MALFORMED_RESPONSE, terminationReason: 'no_model_requested', detail: 'a model must be requested before the call' };
  const key = process.env[spec.keyEnv] || '';
  if (!key) {
    return { ...base, classification: BLOCKED_BY_CREDENTIAL, terminationReason: 'blocked_by_credential',
      detail: spec.keyEnv + ' is not set in this process; no request was made' };
  }
  const url = (process.env[spec.baseUrlEnv] || spec.baseUrl).replace(/\/$/, '') + spec.path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res, text;
  try {
    base.requestsMade = 1;
    res = await fetchImpl(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: false }),
    });
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
    return { ...base, classification: aborted ? STREAM_NEVER_TERMINATED : PROVIDER_TRANSIENT_ERROR,
      terminationReason: aborted ? 'stream_never_terminated' : 'network_error',
      detail: aborted ? 'no complete response within ' + timeoutMs + ' ms' : String(e && e.message || e).slice(0, 200) };
  }
  clearTimeout(timer);
  base.httpStatus = res.status;
  if (res.status === 401 || res.status === 403) return { ...base, classification: BLOCKED_BY_CREDENTIAL, terminationReason: 'auth_error', detail: 'HTTP ' + res.status + ': the credential was refused' };
  if (res.status === 429) return { ...base, classification: PROVIDER_CAPACITY_BLOCKED, terminationReason: 'quota', detail: 'HTTP 429: ' + text.slice(0, 200) };
  if (res.status >= 500) return { ...base, classification: PROVIDER_TRANSIENT_ERROR, terminationReason: 'provider_transient_error', detail: 'HTTP ' + res.status + ': ' + text.slice(0, 200) };
  if (res.status !== 200) return { ...base, classification: MALFORMED_RESPONSE, terminationReason: 'provider_refused', detail: 'HTTP ' + res.status + ': ' + text.slice(0, 200) };
  let body;
  try { body = JSON.parse(text); } catch { return { ...base, classification: MALFORMED_RESPONSE, terminationReason: 'malformed_response', detail: 'HTTP 200 with a non-JSON body' }; }
  const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : null;
  const finishReason = choice ? choice.finish_reason || null : null;
  const usage = { inputTokens: body?.usage?.prompt_tokens ?? null, cachedTokens: body?.usage?.prompt_cache_hit_tokens ?? body?.usage?.prompt_tokens_details?.cached_tokens ?? null, outputTokens: body?.usage?.completion_tokens ?? null };
  const actualModel = body && typeof body.model === 'string' ? body.model : null;
  const providerRunId = body && typeof body.id === 'string' ? body.id : null;
  if (!choice || typeof content !== 'string') return { ...base, actualModel, providerRunId, usage, classification: MALFORMED_RESPONSE, terminationReason: 'malformed_response', detail: 'HTTP 200 without a message in choices[0]' };
  // HTTP SUCCESS != COMPLETED: only a body that says it finished is a completion
  const completed = finishReason === 'stop';
  return { ...base, ok: completed, actualModel, providerRunId, content, finishReason, usage,
    terminationReason: completed ? 'completed' : (finishReason === 'length' ? 'truncated' : 'ended_without_stop'),
    classification: completed ? null : MALFORMED_RESPONSE, detail: completed ? null : 'finish_reason=' + finishReason };
}

/** Everything a run record may carry from a result. The credential is not in the result and cannot be here. */
export function completionToRunFields(result) {
  return {
    status: result.ok ? 'done' : 'failed',
    terminationReason: result.terminationReason,
    actualProvider: result.provider,
    actualModel: result.actualModel,
    usage: { inputTokens: result.usage.inputTokens, cachedTokens: result.usage.cachedTokens, outputTokens: result.usage.outputTokens },
    summary: result.ok ? 'http completion ' + (result.providerRunId || '') : (result.classification + ': ' + (result.detail || '')).slice(0, 300),
  };
}
