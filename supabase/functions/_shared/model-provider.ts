// Shared by commands and the founder-only connection probe. No database access,
// fallback planner, retries, or caller-supplied destinations.
export type Provider = 'openai' | 'anthropic' | 'deepseek';
export type Usage = { input_tokens?: number; output_tokens?: number };
export type ImageAttachment = { name: string; mimeType: string; dataUrl: string };
export const PROVIDER_SECRETS: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
};
export function isProvider(value: unknown): value is Provider {
  return value === 'openai' || value === 'anthropic' || value === 'deepseek';
}
export class ProviderError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message); this.name = 'ProviderError'; this.code = code; this.status = status;
  }
}
// Never expose raw provider bodies: they can echo prompts or credentials.
function upstreamError(status: number, code?: unknown, message?: unknown): ProviderError {
  if (typeof message === 'string' && /organi[sz]ation.*verif|verif.*organi[sz]ation/i.test(message)) {
    return new ProviderError('verification_required', 'Provider requires organization verification for this model or streaming feature. Complete verification in the provider API account settings.');
  }
  if (status === 401) return new ProviderError('invalid_key', 'Provider rejected its API key. Check the matching Supabase secret.');
  if (status === 402 || code === 'insufficient_quota') return new ProviderError('quota', 'Provider balance or quota is exhausted. Check its API billing account.');
  if (status === 403 || status === 404 || code === 'model_not_found') return new ProviderError('model_access', 'This API account cannot access the selected model. Check the model ID and account permissions.');
  if (status === 429) return new ProviderError('rate_limit', 'Provider rate limit reached. Wait before retrying.', 429);
  if (status === 400 || status === 422) return new ProviderError('request_rejected', 'Provider rejected the model or request options. Check model compatibility.');
  return new ProviderError('upstream', 'Provider is unavailable or returned a streaming error. Try again later.');
}
type Options = {
  provider: Provider; model: string; key: string | undefined; system: string; context: unknown;
  images?: ImageAttachment[]; maxOutputTokens?: number; timeoutMs?: number;
  onDelta?: (text: string) => void; onUsage?: (usage: Usage) => void;
  fetcher?: typeof fetch;
};
export function buildProviderRequest(options: Options): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const { provider, model, key, system, context, images = [], maxOutputTokens = 8192 } = options;
  if (!isProvider(provider)) throw new ProviderError('unsupported_provider', 'Provider is not supported.', 400);
  if (!key?.trim()) throw new ProviderError('missing_key', `Add ${PROVIDER_SECRETS[provider]} in Supabase Edge Function secrets. No AI action was executed.`, 503);
  if (!model || model.length > 120 || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new ProviderError('invalid_model', 'Select a valid provider model ID.', 400);
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 16 || maxOutputTokens > 8192) throw new ProviderError('invalid_limit', 'Output token limit is invalid.', 400);
  const text = JSON.stringify(context);
  if (provider === 'deepseek') {
    if (!['deepseek-v4-flash', 'deepseek-v4-pro'].includes(model)) throw new ProviderError('invalid_model', 'Select a supported DeepSeek V4 text model.', 400);
    if (images.length) throw new ProviderError('images_unsupported', 'This DeepSeek model accepts text only. Select an image-capable model to inspect attached images.', 400);
    return {
      url: 'https://api.deepseek.com/chat/completions',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: { model, messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
        thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
        max_tokens: maxOutputTokens, stream: true, stream_options: { include_usage: true } },
    };
  }
  if (provider === 'anthropic') return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: { model, system, max_tokens: maxOutputTokens, stream: true, messages: [{ role: 'user', content: [
      { type: 'text', text }, ...images.map(image => ({ type: 'image', source: {
        type: 'base64', media_type: image.mimeType, data: image.dataUrl.slice(image.dataUrl.indexOf(',') + 1),
      } })),
    ] }] },
  };
  // No temperature/top_p: several reasoning models reject these parameters.
  return {
    url: 'https://api.openai.com/v1/responses',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: { model, max_output_tokens: maxOutputTokens, stream: true, store: false, input: [
      { role: 'system', content: system }, { role: 'user', content: [
        { type: 'input_text', text }, ...images.map(image => ({ type: 'input_image', image_url: image.dataUrl })),
      ] },
    ] },
  };
}
// Frame boundaries, CRLF, Unicode and the last frame are preserved. Callback
// failures propagate; malformed/failed streams must never authorize actions.
export async function consumeSSE(response: Response, onEvent: (event: any) => void, signal?: AbortSignal): Promise<void> {
  if (!response.body) throw new ProviderError('empty_stream', 'Provider returned no response stream.');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let frameSize = 0;
  function dispatch() {
    if (!data.length) return;
    const payload = data.join('\n'); data = []; frameSize = 0;
    if (payload === '[DONE]') return;
    let event: unknown;
    try { event = JSON.parse(payload); }
    catch { throw new ProviderError('invalid_stream', 'Provider returned an invalid response stream.'); }
    onEvent(event);
  }
  function line(value: string) {
    if (value.endsWith('\r')) value = value.slice(0, -1);
    if (!value) dispatch();
    else if (value.startsWith('data:')) {
      data.push(value.slice(5).replace(/^ /, ''));
      frameSize += value.length;
      if (data.length > 1024 || frameSize > 2_000_000) throw new ProviderError('stream_limit', 'Provider response exceeded the safety limit.');
    }
  }
  try {
    while (true) {
      if (signal?.aborted) throw new ProviderError('timeout', 'Provider stream timed out.', 504);
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2_000_000) throw new ProviderError('stream_limit', 'Provider response exceeded the safety limit.');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    if (buffer) line(buffer);
    dispatch();
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}
export async function callProviderStreaming(options: Options): Promise<{ text: string; stopReason: string | null; usage: Usage }> {
  const request = buildProviderRequest(options);
  const abort = new AbortController();
  const signal = abort.signal;
  let timer: ReturnType<typeof setTimeout>;
  // A separate rejecting deadline also covers fetch implementations that fail to
  // settle when aborted (seen in production incident notes). Abort alone is not enough.
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ProviderError('timeout', 'Model response timed out. Try a shorter request or a faster model.', 504));
      abort.abort();
    }, options.timeoutMs ?? 120_000);
  });
  let text = '';
  let complete = false;
  let stopReason: string | null = null;
  let usage: Usage = {};
  function recordUsage(next: Usage) {
    for (const name of ['input_tokens', 'output_tokens'] as const) {
      const value = next[name];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) usage = { ...usage, [name]: value };
    }
    options.onUsage?.(usage);
  }
  function delta(value: unknown) {
    if (typeof value !== 'string' || !value) return;
    text += value;
    if (text.length > 250_000) throw new ProviderError('output_limit', 'Provider response exceeded the safety limit.');
    options.onDelta?.(value);
  }
  try {
    return await Promise.race([(async () => {
    const response = await (options.fetcher ?? fetch)(request.url, {
      method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw upstreamError(response.status, error?.error?.code, error?.error?.message);
    }
    await consumeSSE(response, event => {
      if (signal.aborted) throw new ProviderError('timeout', 'Provider stream timed out.', 504);
      if (!event || typeof event !== 'object') throw new ProviderError('invalid_stream', 'Provider returned an invalid response event.');
      if (event.error || event.type === 'error' || event.type === 'response.failed') throw upstreamError(502, event.error?.code ?? event.response?.error?.code, event.error?.message ?? event.response?.error?.message);
      if (options.provider === 'openai') {
        if (event.type === 'response.output_text.delta') delta(event.delta);
        if (event.type === 'response.incomplete') throw new ProviderError('incomplete', 'Model response was cut off. Reduce the request size or select another model.');
        if (event.type === 'response.completed') {
          if (event.response?.status && event.response.status !== 'completed') throw upstreamError(502);
          complete = true; stopReason = 'stop';
          if (event.response?.usage) recordUsage(event.response.usage);
        }
      } else if (options.provider === 'anthropic') {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') delta(event.delta.text);
        if (event.type === 'message_start' && event.message?.usage) recordUsage(event.message.usage);
        if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason ?? stopReason;
          if (event.usage) recordUsage(event.usage);
        }
        if (event.type === 'message_stop') complete = true;
      } else {
        const choice = event.choices?.[0];
        delta(choice?.delta?.content); // Never expose reasoning_content.
        if (choice?.finish_reason) { stopReason = choice.finish_reason; complete = true; }
        if (event.usage) recordUsage({ input_tokens: event.usage.prompt_tokens, output_tokens: event.usage.completion_tokens });
      }
    }, signal);
    if (!complete || !text.trim() || !['stop', 'end_turn', 'stop_sequence'].includes(stopReason ?? '')) {
      throw new ProviderError('incomplete', 'Provider did not return a complete text response. No planned actions were executed.');
    }
    return { text, stopReason, usage };
    })(), deadline]);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (signal.aborted) throw new ProviderError('timeout', 'Model response timed out. Try a shorter request or a faster model.', 504);
    throw new ProviderError('connection', 'Provider connection failed. No automatic retry was attempted.');
  } finally {
    clearTimeout(timer!);
    abort.abort();
  }
}
