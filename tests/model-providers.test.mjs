import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProviderRequest, callProviderStreaming, consumeSSE, ProviderError } from '../supabase/functions/_shared/model-provider.ts';
import { createProviderProbe } from '../supabase/functions/_shared/provider-probe.ts';
import { MODEL_CATALOG, estimateCost } from '../web/lib/usage/pricing.ts';

const base = { provider: 'openai', model: 'gpt-5-mini', key: 'fake-test-key', system: 'Return JSON.', context: { test: true } };
const event = value => `data: ${JSON.stringify(value)}\n\n`;
function stream(events) { return new Response(events.map(event).join('')); }
const openaiOk = [
  { type: 'response.output_text.delta', delta: '{"ok":true}' },
  { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 9, output_tokens: 5 } } },
];

for (const model of ['gpt-5-mini', 'gpt-5.6-luna', 'gpt-6-astra', 'o3', 'gpt-4.1-mini']) {
  test(`OpenAI ${model}: no incompatible sampling parameters`, () => {
    const request = buildProviderRequest({ ...base, model });
    assert.equal(request.url, 'https://api.openai.com/v1/responses');
    assert.equal(request.body.temperature, undefined);
    assert.equal(request.body.top_p, undefined);
    assert.equal(request.body.store, false);
    assert.equal(request.body.max_output_tokens, 8192);
  });
}
for (const provider of ['openai', 'anthropic', 'deepseek']) {
  test(`${provider}: missing key fails before network`, async () => {
    let calls = 0;
    await assert.rejects(callProviderStreaming({ ...base, provider, key: undefined, fetcher: async () => { calls++; } }), { code: 'missing_key' });
    assert.equal(calls, 0);
  });
}
test('DeepSeek uses bounded JSON text generation, not reasoning or images', () => {
  const request = buildProviderRequest({ ...base, provider: 'deepseek', model: 'deepseek-v4-flash' });
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.deepEqual(request.body.thinking, { type: 'disabled' });
  assert.deepEqual(request.body.response_format, { type: 'json_object' });
  assert.equal(request.body.max_tokens, 8192);
  assert.equal(request.body.stream_options.include_usage, true);
  assert.throws(() => buildProviderRequest({ ...base, provider: 'deepseek', model: 'deepseek-chat' }), { code: 'invalid_model' });
  assert.throws(() => buildProviderRequest({ ...base, provider: 'deepseek', model: 'deepseek-v4-flash', images: [{ name: 'x.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }] }), { code: 'images_unsupported' });
});
test('Anthropic and OpenAI keep supported image content', () => {
  const images = [{ name: 'x.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }];
  assert.equal(buildProviderRequest({ ...base, images }).body.input[1].content[1].image_url, images[0].dataUrl);
  assert.equal(buildProviderRequest({ ...base, provider: 'anthropic', model: 'claude-haiku-4-5', images }).body.messages[0].content[1].source.data, 'AAAA');
});
test('Untrusted provider, model URL and unbounded output rejected', () => {
  assert.throws(() => buildProviderRequest({ ...base, provider: 'unknown' }), { code: 'unsupported_provider' });
  assert.throws(() => buildProviderRequest({ ...base, model: 'https://attacker.example/' }), { code: 'invalid_model' });
  assert.throws(() => buildProviderRequest({ ...base, maxOutputTokens: 90000 }), { code: 'invalid_limit' });
});
test('OpenAI completed stream preserves text and usage', async () => {
  const result = await callProviderStreaming({ ...base, fetcher: async () => stream(openaiOk) });
  assert.equal(result.text, '{"ok":true}');
  assert.deepEqual(result.usage, { input_tokens: 9, output_tokens: 5 });
});
test('Anthropic stop and split usage are normalized', async () => {
  const result = await callProviderStreaming({ ...base, provider: 'anthropic', model: 'claude-haiku-4-5', fetcher: async () => stream([
    { type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 0 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"ok":true}' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } },
    { type: 'message_stop' },
  ]) });
  assert.deepEqual(result.usage, { input_tokens: 12, output_tokens: 8 });
});
test('DeepSeek finish and final usage; hidden reasoning is not emitted', async () => {
  let emitted = '';
  const result = await callProviderStreaming({ ...base, provider: 'deepseek', model: 'deepseek-v4-flash', onDelta: x => { emitted += x; }, fetcher: async () => stream([
    { choices: [{ delta: { reasoning_content: 'DO NOT DISPLAY' } }] },
    { choices: [{ delta: { content: '{"ok":true}' }, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 14, completion_tokens: 6 } },
  ]) });
  assert.equal(emitted, '{"ok":true}');
  assert.deepEqual(result.usage, { input_tokens: 14, output_tokens: 6 });
});
for (const [status, code, expected] of [[401, null, 'invalid_key'], [402, null, 'quota'], [403, null, 'model_access'], [404, null, 'model_access'], [429, null, 'rate_limit'], [429, 'insufficient_quota', 'quota'], [400, null, 'request_rejected'], [503, null, 'upstream']]) {
  test(`HTTP ${status}/${code}: safe actionable error, no retry`, async () => {
    let calls = 0;
    await assert.rejects(callProviderStreaming({ ...base, fetcher: async () => { calls++; return Response.json({ error: { code, message: 'private document fake-test-key' } }, { status }); } }), error => {
      assert.equal(error.code, expected);
      assert.doesNotMatch(error.message, /private document|fake-test-key/);
      return true;
    });
    assert.equal(calls, 1);
  });
}
for (const terminal of [{ type: 'error', error: { code: 'insufficient_quota' } }, { type: 'response.failed' }, { type: 'response.incomplete' }]) {
  test(`${terminal.type}: do not accept partial success`, async () => {
    await assert.rejects(callProviderStreaming({ ...base, fetcher: async () => stream([openaiOk[0], terminal]) }), ProviderError);
  });
}
test('Disconnect without terminal, empty output and length-limit stops fail closed', async () => {
  for (const events of [[openaiOk[0]], [openaiOk[1]]]) {
    await assert.rejects(callProviderStreaming({ ...base, fetcher: async () => stream(events) }), { code: 'incomplete' });
  }
  await assert.rejects(callProviderStreaming({ ...base, provider: 'deepseek', model: 'deepseek-v4-flash', fetcher: async () => stream([{ choices: [{ delta: { content: '{}' }, finish_reason: 'length' }] }]) }), { code: 'incomplete' });
});
test('SSE handles Unicode across byte chunks, CRLF, multiline and final frame', async () => {
  const bytes = new TextEncoder().encode(': ping\r\ndata: {"text":\r\ndata: "Сайн байна уу"}\r\n\r\ndata: {"final":true}');
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
  const events = [];
  await consumeSSE(response, value => events.push(value));
  assert.deepEqual(events, [{ text: 'Сайн байна уу' }, { final: true }]);
});
test('SSE malformed frame and callback exceptions are not swallowed', async () => {
  await assert.rejects(consumeSSE(new Response('data: not-json\n\n'), () => {}), { code: 'invalid_stream' });
  await assert.rejects(consumeSSE(stream([{ ok: true }]), () => { throw new Error('callback failure'); }), /callback failure/);
});
test('Provider deadline abort produces timeout, not a JSON failure', async () => {
  await assert.rejects(callProviderStreaming({ ...base, timeoutMs: 5, fetcher: (_url, { signal }) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(() => resolve(stream(openaiOk)), 200);
    signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); });
  }) }), { code: 'timeout' });
});

test('Organization verification error is actionable without exposing upstream text', async () => {
  await assert.rejects(callProviderStreaming({ ...base, fetcher: async () => Response.json({
    error: { message: 'Your organization must be verified to stream this model. private text' },
  }, { status: 400 }) }), error => {
    assert.equal(error.code, 'verification_required');
    assert.doesNotMatch(error.message, /private text/);
    return true;
  });
});

test('Deadline settles even when fetch ignores abort completely', async () => {
  await assert.rejects(callProviderStreaming({ ...base, timeoutMs: 5,
    fetcher: () => new Promise(() => {}),
  }), { code: 'timeout' });
});
test('Deadline cancels a stalled response body', async () => {
  let cancelled = false;
  await assert.rejects(callProviderStreaming({ ...base, timeoutMs: 5,
    fetcher: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })),
  }), { code: 'timeout' });
  assert.equal(cancelled, true);
});

const id = '11111111-1111-4111-8111-111111111111';
function probeFixture({ role = 'founder', authenticated = true, found = true, failure, answer = '{"ok":true}', rpcError, usageError } = {}) {
  const events = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: null }) },
    from(table) {
      events.push(table);
      const query = { select: () => query, eq: () => query,
        single: async () => ({ data: table === 'profiles' ? { id: 'profile', role } : found ? { id, provider: 'deepseek', model: 'deepseek-v4-flash' } : null }),
        insert: async row => { events.push(row); return { error: usageError }; },
      };
      return query;
    },
    rpc: async (name, args) => { events.push({ name, args }); return { error: rpcError }; },
  };
  return { events, handler: createProviderProbe({ client: () => client,
    secret: name => { events.push(name); return 'fake'; },
    callModel: async options => { events.push(options); if (failure) throw failure; return { text: answer, stopReason: 'stop', usage: { input_tokens: 10, output_tokens: 6 } }; },
  }) };
}
const req = (body = { id }, auth = true) => new Request('https://test.invalid', { method: 'POST', headers: auth ? { Authorization: 'Bearer user-token' } : {}, body: JSON.stringify(body) });
for (const role of ['employee', 'contractor', 'company_manager', 'hr_finance']) {
  test(`Probe denies ${role} before reading provider/secrets or calling LLM`, async () => {
    const { handler, events } = probeFixture({ role });
    assert.equal((await handler(req())).status, 403);
    assert.deepEqual(events, ['profiles']);
  });
}
test('Unauthenticated, expired-session, invalid-ID and missing-row probes are denied', async () => {
  assert.equal((await probeFixture().handler(req({}, false))).status, 401);
  assert.equal((await probeFixture({ authenticated: false }).handler(req())).status, 401);
  assert.equal((await probeFixture().handler(req({ id: 'bad' }))).status, 400);
  assert.equal((await probeFixture({ found: false }).handler(req())).status, 404);
});
test('Probe uses synthetic context only, meters tokens, and test alone never switches', async () => {
  const { handler, events } = probeFixture();
  const response = await handler(req());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).activated, false);
  assert.deepEqual(events.filter(x => typeof x === 'string'), ['profiles', 'ai_providers', 'DEEPSEEK_API_KEY', 'model_usage']);
  const call = events.find(x => x?.system);
  assert.deepEqual(call.context, { instruction: 'Reply with JSON: {"ok":true}' });
  assert.equal(call.maxOutputTokens, 128);
  assert.equal(events.some(x => x?.name === 'activate_ai_provider'), false);
});
test('Activation happens only after successful JSON probe and metering', async () => {
  const { handler, events } = probeFixture({ role: 'holding_admin' });
  assert.equal((await handler(req({ id, activate: true }))).status, 200);
  assert.deepEqual(events.at(-1), { name: 'activate_ai_provider', args: { p_id: id, p_provider: 'deepseek', p_model: 'deepseek-v4-flash' } });
});
for (const options of [{ failure: new ProviderError('invalid_key', 'Invalid key') }, { answer: 'not JSON' }, { answer: '{"ok":true,"action":"delete"}' }, { usageError: 'blocked' }]) {
  test(`Failed probe cannot activate: ${JSON.stringify(options)}`, async () => {
    const { handler, events } = probeFixture(options);
    assert.notEqual((await handler(req({ id, activate: true }))).status, 200);
    assert.equal(events.some(x => x?.name === 'activate_ai_provider'), false);
  });
}
test('Failed transaction is reported without a non-atomic fallback', async () => {
  const { handler, events } = probeFixture({ rpcError: 'conflict' });
  assert.equal((await handler(req({ id, activate: true }))).status, 503);
  assert.equal(events.filter(x => x?.name).length, 1);
});
test('DeepSeek cost estimates match command ledger and no benchmark scores are fabricated', () => {
  const command = readFileSync(new URL('../supabase/functions/sem-ai-command/index.ts', import.meta.url), 'utf8');
  for (const model of MODEL_CATALOG.filter(x => x.provider === 'deepseek')) {
    assert.equal(model.capabilityScore, null);
    assert.equal(model.speedScore, null);
    assert.ok(command.includes(`'${model.model}': [${model.inputPer1M}, ${model.outputPer1M}]`));
    assert.equal(estimateCost(model.model, 1000000, 1000000), model.inputPer1M + model.outputPer1M);
  }
});
test('Wiring contract: validate provider before retrieval; no missing-key planner execution', () => {
  const code = readFileSync(new URL('../supabase/functions/sem-ai-command/index.ts', import.meta.url), 'utf8');
  const handler = code.slice(code.indexOf('serve(async (req)'));
  assert.ok(handler.indexOf('buildProviderRequest(') < handler.indexOf('await buildContext('));
  assert.doesNotMatch(handler, /fallbackPlan\(/);
  assert.match(handler, /callProviderStreaming\(/);
});
test('Migration contract: invoker, auth guard, transaction, target lock and grants (not a database execution test)', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202609060001_deepseek_provider_connections.sql', import.meta.url), 'utf8');
  for (const token of ['begin;', 'commit;', 'security invoker', "set search_path = ''", 'is_founder_or_admin()', 'pg_advisory_xact_lock', 'for update', 'is distinct from p_model', 'from public, anon', 'to authenticated']) assert.ok(sql.includes(token), token);
  assert.doesNotMatch(sql, /security definer|disable row level security/i);
});
