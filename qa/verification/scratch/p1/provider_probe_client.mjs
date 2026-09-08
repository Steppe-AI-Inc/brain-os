// T1-T3 / T6 — the NON-PRODUCTION half of the provider probe tests (work order AI_PROVIDER_RELIABILITY).
//
// The production surface it calls, `sem-ai-provider-test`, is already deployed (v1, ACTIVE since
// 2026-09-06) and needs no change. This is only the client, the classifier and the report.
//
// THE PRODUCTION PROBE MUST REMAIN activate:false. That is not a default here, it is a refusal: this client
// has no code path that can send `activate: true`, so running it cannot switch the globally-active model
// however it is invoked. Changing the active model is a founder action in the product, not a test.
//
// It also needs a founder/holding-admin JWT, which an implementation session does not have and must not
// obtain. Supply one in SEM_FOUNDER_JWT (from a signed-in browser session) to run it.
//
// Usage:
//   SEM_FOUNDER_JWT=... node qa/verification/scratch/p1/provider_probe_client.mjs            # probe every saved row
//   SEM_FOUNDER_JWT=... node qa/verification/scratch/p1/provider_probe_client.mjs <row-uuid>  # probe one
import { execFileSync } from 'node:child_process';

const FN = 'sem-ai-provider-test';

// The founder's required result states. UNKNOWN is a real answer and is never smoothed into a neighbour:
// the 2026-08-24 forensics failed precisely because failure detail was replaced with a tidier story.
const STATES = ['SUCCESS', 'AUTH_ERROR', 'INVALID_MODEL', 'NOT_AVAILABLE', 'RATE_LIMIT', 'QUOTA',
  'STREAM_TIMEOUT', 'STREAM_NEVER_TERMINATED', 'NETWORK', 'SDK/API_VERSION', 'STRUCTURED_OUTPUT',
  'TOOL_USE', 'UNKNOWN'];

/**
 * Classify one probe outcome. A 200 is NOT success: success requires a valid terminal completion
 * condition, which for this probe is the JSON body the function returns after the provider finished.
 * Exported so a regression can pin the classifier without any network at all.
 */
export function classify({ httpStatus, body, elapsedMs, timedOut }) {
  if (timedOut) return elapsedMs >= 60000 ? 'STREAM_NEVER_TERMINATED' : 'STREAM_TIMEOUT';
  if (httpStatus === 0) return 'NETWORK';
  if (body && body.ok === true) return 'SUCCESS';
  const msg = String((body && (body.error || body.message)) || '').toLowerCase();
  const code = String((body && body.code) || '').toLowerCase();
  if (code === 'invalid_output' || msg.includes('failed the json response check')) return 'STRUCTURED_OUTPUT';
  if (httpStatus === 401 || msg.includes('sign in') || msg.includes('session expired')) return 'AUTH_ERROR';
  if (httpStatus === 403) return 'AUTH_ERROR';
  if (httpStatus === 429 || msg.includes('rate limit')) return 'RATE_LIMIT';
  if (msg.includes('quota') || msg.includes('insufficient_quota') || msg.includes('credit')) return 'QUOTA';
  if (msg.includes('does not exist') || msg.includes('unknown model') || msg.includes('invalid model')) return 'INVALID_MODEL';
  if (msg.includes('do not have access') || msg.includes('not available') || msg.includes('must be verified')) return 'NOT_AVAILABLE';
  if (msg.includes('unsupported parameter') || msg.includes('unsupported value')) return 'SDK/API_VERSION';
  if (msg.includes('tool')) return 'TOOL_USE';
  if (msg.includes('stall') || msg.includes('timed out') || msg.includes('deadline')) return 'STREAM_TIMEOUT';
  return 'UNKNOWN';
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const jwt = process.env.SEM_FOUNDER_JWT;
  if (!jwt) {
    console.log('SEM_FOUNDER_JWT is not set.\n');
    console.log('This probe authenticates AS THE FOUNDER — the deployed function requires a founder or');
    console.log('holding-admin profile and never accepts a service-role key. An implementation session');
    console.log('cannot obtain that token and must not try. Supply it from a signed-in browser session.\n');
    console.log('Everything else is ready: the client refuses activate:true, so running it cannot change');
    console.log('the globally-active model.');
    process.exit(2);
  }
  const url = (process.env.SUPABASE_URL || 'https://pvphxgrtdfrudejjhzjk.supabase.co') + '/functions/v1/' + FN;
  // Read the saved rows the same way the audit did — read-only, and never a source of truth about health.
  const rows = process.argv[2]
    ? [{ id: process.argv[2], provider: '(given)', model: '(given)' }]
    : JSON.parse((() => {
      const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked',
        'select id, provider, model, is_active from public.ai_providers order by created_at'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      return out.slice(out.indexOf('{'));
    })()).rows;

  const results = [];
  for (const row of rows) {
    const started = Date.now();
    let httpStatus = 0, body = null, timedOut = false;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
        // activate is deliberately absent, not false-by-variable: there is no path that can set it.
        body: JSON.stringify({ id: row.id }),
        signal: AbortSignal.timeout(75000),
      });
      httpStatus = r.status;
      body = await r.json().catch(() => null);
    } catch (e) {
      timedOut = /abort|timeout/i.test(String(e && e.message));
    }
    const elapsedMs = Date.now() - started;
    const error_class = classify({ httpStatus, body, elapsedMs, timedOut });
    results.push({
      requested_model: row.model, actual_model: (body && body.model) || null, provider: row.provider,
      started_at: new Date(started).toISOString(), first_token_at: null,
      completed_at: new Date().toISOString(),
      termination_reason: error_class === 'SUCCESS' ? 'terminal completion observed' : 'no terminal completion',
      error_class, http: httpStatus, elapsedMs,
      detail: body && body.error ? String(body.error).slice(0, 160) : null,
    });
    console.log(String(row.model).padEnd(20) + ' ' + error_class.padEnd(24) + ' ' + elapsedMs + 'ms'
      + (body && body.error ? '  ' + String(body.error).slice(0, 90) : ''));
  }
  const bad = results.filter((r) => !STATES.includes(r.error_class));
  if (bad.length) throw new Error('classifier produced a state outside the required set: ' + JSON.stringify(bad));
  console.log('\n' + JSON.stringify(results, null, 2));
  console.log('\nA model is WORKING only where error_class is SUCCESS. Configured is not working.');
}
