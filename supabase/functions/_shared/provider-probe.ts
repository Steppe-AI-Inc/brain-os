import { callProviderStreaming, isProvider, PROVIDER_SECRETS, ProviderError } from './model-provider.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
type Dependencies = {
  client: (authorization: string) => any;
  secret: (name: string) => string | undefined;
  callModel?: typeof callProviderStreaming;
};

export function createProviderProbe(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Sign in to test a provider.' }, 401);
    try {
      const client = deps.client(authorization);
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) return json({ error: 'Session expired. Sign in again.' }, 401);
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('id,role').eq('auth_user_id', user.id).single();
      if (profileError || !profile || !['founder', 'holding_admin'].includes(profile.role)) return json({ error: 'Founder or holding admin access required.' }, 403);
      const raw = await req.text();
      if (raw.length > 4096) return json({ error: 'Request is too large.' }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request JSON.' }, 400); }
      if (!body || typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return json({ error: 'A saved provider ID is required.' }, 400);
      if (body.activate !== undefined && typeof body.activate !== 'boolean') return json({ error: 'Invalid activation option.' }, 400);
      const { data: row, error: rowError } = await client.from('ai_providers')
        .select('id,provider,model').eq('id', body.id).single();
      if (rowError || !row) return json({ error: 'Provider not found or not permitted.' }, 404);
      const provider: unknown = row.provider;
      if (!isProvider(provider)) return json({ error: 'Unsupported provider.' }, 400);
      const started = Date.now();
      // Synthetic content only. Never read companies, documents, messages or tasks.
      const result = await (deps.callModel ?? callProviderStreaming)({
        provider, model: row.model, key: deps.secret(PROVIDER_SECRETS[provider]),
        system: 'Connection check only. Return exactly the JSON object {"ok":true}. Do not call tools.',
        context: { instruction: 'Reply with JSON: {"ok":true}' },
        maxOutputTokens: row.provider === 'openai' ? 2048 : 128, timeoutMs: 60_000,
      });
      // Unknown cost is null, never a fabricated zero. Probe token usage is metered.
      const { error: usageError } = await client.from('model_usage').insert({
        profile_id: profile.id, model_name: row.model, ...result.usage,
        estimated_cost_usd: null, actual_cost_usd: null,
      });
      if (usageError) return json({ error: 'Provider replied, but usage recording failed. The active model was not changed.' }, 503);
      let answer;
      try { answer = JSON.parse(result.text); } catch { answer = null; }
      if (!answer || answer.ok !== true || Object.keys(answer).length !== 1) return json({ error: 'Provider connected but failed the JSON response check. Active model unchanged.', code: 'invalid_output' }, 502);
      if (body.activate) {
        const { error } = await client.rpc('activate_ai_provider', {
          p_id: row.id, p_provider: row.provider, p_model: row.model,
        });
        if (error) return json({ error: 'Connection passed, but activation failed. Check the provider migration and retry. No non-transactional fallback was used.' }, 503);
      }
      return json({ ok: true, provider: row.provider, model: row.model,
        activated: body.activate === true, latencyMs: Date.now() - started,
        usage: result.usage, checkedAt: new Date().toISOString() });
    } catch (error) {
      return error instanceof ProviderError
        ? json({ error: error.message, code: error.code }, error.status)
        : json({ error: 'Connection test failed. The active provider was not changed.' }, 502);
    }
  };
}
