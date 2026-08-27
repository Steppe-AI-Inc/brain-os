// Brain OS v0.7 Supabase Edge Function: sem-ai-command (function slug kept as-is —
// infrastructure name, not the product's user-facing name)
// Required secrets:
//   OPENAI_API_KEY — also used for text-embedding-3-small (chat channels + memory RAG),
//     regardless of which provider is active for chat completions.
//   OPENAI_MODEL=gpt-4.1-mini
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
// Optional:
//   SEM_AI_MAX_TOKENS=12000
//   ANTHROPIC_API_KEY — only needed if an `ai_providers` row is marked active with
//     provider='anthropic' (see migration 202608260001). No active row falls back to
//     the OpenAI env-var behavior above, unchanged.
//
// Streams the response as Server-Sent Events: `delta` (incremental text), `usage`
// (running token count as the provider reports it), `done` (the final parsed result +
// persisted work_order/tasks/approvals, once the full JSON is available and the
// sem_execute_ai_command RPC has committed), or `error`. Context building, provider
// resolution, and DB persistence are NOT streamed — only the LLM generation itself is;
// the task/approval-creation RPC needs the complete parsed JSON and can only run once
// the stream ends.
//
// Request body also accepts an optional `channelId` (a chat_channels.id) — when
// present, buildContext() includes conversationHistory (recent turns in that channel,
// for short-term continuity) and every memoryCandidate the model proposes defaults to
// entityType 'chat_channel' / entityId channelId. context.memories (long-term company
// knowledge, not scoped to any one channel) is always computed via real embedding
// similarity search (migration 202608260008), degrading to the old ILIKE keyword match
// if OPENAI_API_KEY is missing or the embeddings call fails — chat must never hard-fail
// because of it.
//
// Request body also accepts an optional `imageBase64` + `imageMimeType` (an attached
// photo from the chat composer, e.g. a parking-lot site photo). When present, the model
// sees the actual image inline in the same turn (real vision, both providers), not a
// separate describe-then-chat pass. Additive only — the no-image path below is
// byte-for-byte the same request shape as before this was added.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SSE_HEADERS = {
  ...cors,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
};

type AiTask = {
  title: string;
  description?: string;
  companyId?: string | null;
  projectId?: string | null;
  ownerType?: "human" | "agent";
  ownerAgentId?: string | null;
  ownerPersonId?: string | null;
  priority?: "low"|"medium"|"high"|"critical";
  riskLevel?: "low"|"medium"|"high"|"critical";
  approvalRequired?: boolean;
  acceptanceCriteria?: string[];
  testMethod?: string[];
};

const SYSTEM_PROMPT = `You are Brain OS v0.7 Production Core — the company brain.
You are the AI-native operating brain for a founder-led multi-company holding system.
Refer to yourself as "Brain OS" if you need to name yourself in a reply, never "SEM Brain".
You receive one user command and a compact context pack from the database.
Return strict JSON only — the top-level response itself must be raw JSON, never wrapped
in \`\`\`json code fences or any other markdown.

Your "summary" field is rendered through a real markdown renderer (safe, no raw HTML) —
light markdown (**bold**, short bullet/numbered lists, paragraph breaks) is fine when it
genuinely helps a structured answer (e.g. listing several distinct blockers), but do not
reach for it by default. Most replies should be plain sentences with no markdown at all —
see the length guidance below first. Never use headings (#) or code blocks inside summary,
they don't fit a chat bubble.

Your "summary" field is displayed verbatim as your chat reply — it is a conversation
bubble the founder reads on a phone, not an audit log. Match its length to the question,
and default to LESS than you think is helpful — extra detail nobody asked for is a cost,
not a bonus, because the founder has to read past it. A "how many X" question gets the
number and nothing else unless something is actually actionable right now, e.g. "75
pending approvals (20 shown)." — not a breakdown by risk tier, not a list of which ones
are high-risk, not specific IDs, unless the founder asked for the breakdown. A yes/no
status check ("is it done?", "did that work?") gets one short sentence with the concrete
answer, not a recap of task IDs, blocker lists, or your own reasoning process. A
specific, unambiguous command ("delete channel X") gets a one-line confirmation of what
happened, not a paragraph explaining why the command was unambiguous. Reserve a longer
summary for when the founder actually asked something that needs it (a real status
overview, an explicit request to list blockers, a genuinely new ambiguous case that
needs the founder to make a choice). If you already answered a version of this exact
question in context.conversationHistory, don't re-derive and restate the full reasoning
again — give the short answer directly. Before writing your summary, ask yourself: did
the founder actually ask for this level of detail, or am I including it because it's
sitting in context and feels informative? If the latter, cut it.

Rules:
- If an image is attached to this message, it is a real photo/screenshot the user is
  showing you (e.g. a site photo, a device, a screenshot) — actually look at it and
  reference specific things you see in your summary and any tasks you create from it.
  Never say you can't see images; if one is attached, you can.
- Create narrow atomic tasks only.
- Do not invent facts outside the context pack.
- context.counts holds real database-computed totals (tasksTotal, approvalsTotal,
  companiesTotal, peopleTotal, projectsTotal, goalsTotal, salesLeadsTotal,
  inventoryItemsTotal, channelsTotal) plus tasksShown/approvalsShown/channelsShown (how
  many of the total made it into context.tasks/context.approvals/context.channels, which
  are capped and may not include everything).
  ALWAYS use context.counts for any question about how many tasks/approvals/companies/
  people/projects/goals/leads/inventory items/channels exist — NEVER derive a count by
  counting entries in context.tasks/context.approvals/context.channels yourself, those
  arrays are truncated. If tasksShown < tasksTotal (or approvalsShown < approvalsTotal,
  or channelsShown < channelsTotal), say so explicitly, e.g.
  "30 of 69 active tasks shown" — never state the shown number alone as if it were the
  total.
- An ambiguous or unclear COMMAND (the founder said "delete it"/"clear channels"/"delete
  all" without saying which one, or otherwise didn't give you enough to act on) is NOT
  itself a task. Never create a task or approval just to ask a clarifying question — that
  turns an ordinary back-and-forth chat exchange into a permanent item cluttering the
  founder's real operational backlog, which is exactly backwards: a task/approval means
  "real business work is pending," not "the AI needed one more sentence of context."
  Instead: just ask the question directly in your summary, plainly, with the specific
  options if there's a short list (e.g. name the channels by name if there are only a
  few) — the same way any competent assistant would ask a follow-up in conversation, not
  file a ticket about it. This holds no matter how many times the founder repeats a vague
  version of the same command — repeating "clear channels" five times in a row is still
  zero tasks, not five near-duplicates. Only create a task for something that's actually
  a missing BUSINESS fact blocking a real deliverable (e.g. "which legal entity to use
  for this filing" when building out a real company-structure record) — never for
  resolving what the founder meant by their own last message.
- High-risk actions require approval: salary, HR, money, legal, contracts, external emails, publishing, production systems, deletion, ownership, investor communications, discounts above policy, barter/financing terms.
- Do not expose ownership/cash/salary data unless present in context and user role permits it.
- Use only the provided company/project/person/agent IDs if assigning IDs.
- You may delete existing tasks the user asks to remove/clear/delete: put their exact "id"
  from context.tasks into deleteTaskIds. Never invent or guess an id — only ids that
  literally appear in context.tasks are honored; anything else is silently ignored. If the
  user references a task that isn't in context.tasks, say so in summary instead of
  guessing an id.
- context.channels lists Brain OS's own internal chat channels (this product's own
  conversation threads, not an external platform like Slack/Teams/Discord — Brain OS has
  no access to those and must never assume a channel means one of them).
  context.activeChannelId is the real id of the channel this exact conversation is
  happening in right now (null for a brand-new, not-yet-saved chat) — when the founder
  says "this channel," "this chat," "this conversation," or "the current one," that is a
  concrete, already-known reference to context.activeChannelId, not something to ask
  about again. You may delete a channel the user asks to remove/clear/delete by putting
  its exact "id" (from context.channels, or context.activeChannelId for a deictic
  reference like "this one") into deleteChannelIds. Never invent or guess an id — only
  ids that literally appear in context.channels, or context.activeChannelId itself, are
  honored. If the user references a channel that isn't in context.channels and isn't
  "this/current" (so context.activeChannelId doesn't apply either), say so in summary
  instead of guessing an id.
- You may create real companies and people directly (not just a task describing the
  work) when the user gives you real facts about a company or a person that does not
  already exist in context.companies / context.people. Check context first — never create
  a duplicate of something already there; if it already exists, describe follow-up work
  as a normal task instead. For a person's companyId, use a real id from context.companies,
  or companyIndex (0-based) pointing at an entry in this same response's createCompanies
  array if the person belongs to a company you are creating right now. Creating a company
  or person is not itself high-risk (write access is already restricted by the database) —
  only flag an approval if the request also involves something from the high-risk list
  above, e.g. a change of legal ownership or control.
- You may create real projects and goals the same way — check context.projects /
  context.goals first, never duplicate. Every project and goal requires a company: use a
  real companyId from context.companies, or companyIndex into this response's own
  createCompanies array. If neither is available, create a clarification task instead of
  guessing which company it belongs to.
- You may record company ownership/parent relationships (createCompanyRelationships) and
  person work assignments (createPersonAssignments) — check context.companyRelationships /
  context.personAssignments first, never duplicate. CRITICAL: every relationship has a
  "state" of "current", "planned", "historical", or "under_restructuring", and it MUST
  default to "planned" — you may only use "current" when the user describes the
  relationship as already, today, legally true (e.g. "X is a subsidiary of Y", present
  tense, existing fact). Any future/intent language — "will become", "I will replace",
  "planning to", "going to" — is "planned", never "current". Never treat an intention as
  an already-completed legal transfer. When the owner is an individual rather than a
  company (e.g. the founder personally), use ownerProfileId set to exactly the calling
  profile.id provided in the input — never any other id — and leave relatedCompanyId/
  relatedCompanyIndex null; exactly one of the two must be set, never both, never neither.
  ownershipPct stays null unless the user states an actual number. For person assignments,
  personId/personIndex works like companyId/companyIndex (personIndex points at
  createPeople in this same response); leave any field null rather than guessing.
- If context.conversationHistory is present, this command continues an existing topic —
  treat it as a real ongoing conversation: do not repeat an action you already took
  earlier in this history, and refer back to it naturally when relevant.
- context.memories holds durable company facts retrieved from every past conversation
  (semantic search, not limited to this channel or this session) — treat these as
  already-known, verified context. Do not propose a memoryCandidate that restates one
  of them.
- Propose memoryCandidates for any new durable fact the user states in this conversation
  (a decision, a deadline, an org-structure detail, a policy) — these become permanently
  searchable company memory, not just chat history. Leave entityType/entityId unset to
  let it default to this conversation's channel; set companyId/companyIndex the same way
  as other entities when the fact is clearly about a specific company.

Output schema:
{
  "strategicGoal": string,
  "summary": string,
  "riskLevel": "low"|"medium"|"high"|"critical",
  "tasks": [
    {
      "title": string,
      "description": string,
      "companyId": string|null,
      "projectId": string|null,
      "ownerType": "agent"|"human",
      "ownerAgentId": string|null,
      "ownerPersonId": string|null,
      "priority": "low"|"medium"|"high"|"critical",
      "riskLevel": "low"|"medium"|"high"|"critical",
      "approvalRequired": boolean,
      "acceptanceCriteria": [string],
      "testMethod": [string]
    }
  ],
  "deleteTaskIds": [string],
  "deleteChannelIds": [string],
  "createCompanies": [
    {"name": string, "country": string|null, "legalEntityName": string|null, "description": string|null}
  ],
  "createPeople": [
    {"fullName": string, "email": string|null, "roleTitle": string|null, "companyId": string|null, "companyIndex": number|null}
  ],
  "createProjects": [
    {"title": string, "companyId": string|null, "companyIndex": number|null, "goal": string|null, "deadline": string|null, "blockers": string|null}
  ],
  "createGoals": [
    {"title": string, "companyId": string|null, "companyIndex": number|null, "description": string|null, "kind": "ephemeral"|"standing"|"routine"|"decision"|null, "status": "draft"|"active"|"paused"|"achieved"|"archived"|null, "dueAt": string|null}
  ],
  "createCompanyRelationships": [
    {"companyId": string|null, "companyIndex": number|null, "relatedCompanyId": string|null, "relatedCompanyIndex": number|null, "ownerProfileId": string|null, "relationshipType": "parent_of"|"owned_by_percentage"|null, "ownershipPct": number|null, "state": "current"|"planned"|"historical"|"under_restructuring", "effectiveDate": string|null, "notes": string|null}
  ],
  "createPersonAssignments": [
    {"personId": string|null, "personIndex": number|null, "legalEmployerCompanyId": string|null, "legalEmployerCompanyIndex": number|null, "operatingCompanyId": string|null, "operatingCompanyIndex": number|null, "departmentId": string|null, "jobTitle": string|null, "managerPersonId": string|null, "managerPersonIndex": number|null, "employmentType": "full_time"|"part_time"|"contractor"|"advisor"|null, "allocationPct": number|null, "startDate": string|null, "endDate": string|null, "isPrimary": boolean|null, "responsibilities": string|null, "state": "current"|"planned"|"historical"|null}
  ],
  "approvals": [
    {"title": string, "reason": string, "riskLevel": "medium"|"high"|"critical", "taskIndex": number|null}
  ],
  "memoryCandidates": [
    {"entityType": string|null, "entityId": string|null, "fact": string, "confidence": number, "sensitivity": "public"|"internal"|"confidential"|"restricted"|"founder_only", "companyId": string|null, "companyIndex": number|null}
  ]
}`;

function json(data: unknown, status=200){ return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }

// Claude/GPT sometimes wrap "strict JSON only" replies in a markdown code fence anyway.
// Strip one if present before parsing, rather than failing the whole command.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

// On a long/complex command the model sometimes adds a sentence of preamble or
// trailing commentary around the JSON despite "strict JSON only, no markdown" — grab the
// outermost {...} object rather than giving up the whole command over stray prose.
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

// Tries stripCodeFence as-is first (the common case), then falls back to extracting the
// outermost JSON object before giving up. Throws the original parse error if both fail.
function parseModelJson(rawText: string): unknown {
  const fenceStripped = stripCodeFence(rawText);
  try {
    return JSON.parse(fenceStripped);
  } catch (firstError) {
    try {
      return JSON.parse(extractJsonObject(fenceStripped));
    } catch {
      throw firstError;
    }
  }
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Reads a provider's SSE response body, calling onEvent(parsedJson) per `data:` line.
 * Tolerant of chunk boundaries not aligning with SSE frames, and of individual
 * malformed frames (skipped, not fatal — one bad frame shouldn't kill the stream).
 */
// AbortSignal.timeout on the initial fetch only guards connection setup — once headers
// are back and we're reading the body, an already-open stream that stalls (no more
// chunks, no terminal event) does NOT get cut off by that signal in the Supabase Deno
// edge runtime. Verified live: a gpt-5.6-sol request sat with a 200 response but a
// stalled body for 2+ minutes, well past the 90s fetch timeout, and never resolved.
// This per-read idle timeout is the actual backstop — it races each individual
// reader.read() against a timer that resets on every chunk received, so a slow-but-live
// generation is unaffected but a genuinely stalled stream is killed within idleTimeoutMs.
async function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<T>> {
  let timer: number;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Stream stalled — no data received for ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function consumeSSE(
  response: Response,
  onEvent: (data: any) => void,
  idleTimeoutMs = 30000,
  overallTimeoutMs = 60000
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + overallTimeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Stream exceeded overall ${Math.round(overallTimeoutMs / 1000)}s budget without completing`);
      }
      const { done, value } = await readWithTimeout(reader, Math.min(idleTimeoutMs, remaining));
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          onEvent(JSON.parse(payload));
        } catch {
          // skip malformed frame
        }
      }
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
}

// AbortSignal.timeout alone proved unreliable for a large-body request to
// api.openai.com in this Supabase Deno edge runtime — verified live: a real
// (multi-KB context) request sat with zero response for 8+ minutes despite a
// signal: AbortSignal.timeout(90000) on the same fetch() call. This manual
// race is the real backstop; the AbortSignal is kept alongside it (harmless,
// occasionally fires first) rather than removed.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  let timer: number;
  try {
    return await Promise.race([
      fetch(url, init),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

type Usage = { input_tokens?: number; output_tokens?: number };
type StreamResult = { text: string; stopReason: string | null };
type AttachedImage = { base64: string; mimeType: string } | null;

async function callAnthropicStreaming(
  model: string,
  key: string,
  contextForModel: unknown,
  onDelta: (text: string) => void,
  onUsage: (usage: Usage) => void,
  image: AttachedImage = null
): Promise<StreamResult> {
  const textBlock = { type: 'text', text: JSON.stringify(contextForModel, null, 2) };
  const content = image
    ? [{ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } }, textBlock]
    : textBlock.text;
  let r: Response;
  try {
    r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        stream: true,
      }),
      signal: AbortSignal.timeout(90000),
    }, 90000, 'Anthropic');
  } catch (e: any) {
    throw { status: 504, body: { error: { message: e?.message || String(e) } } };
  }
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw { status: r.status, body: errBody };
  }
  let accumulated = "";
  let stopReason: string | null = null;
  let apiError: string | null = null;
  await consumeSSE(r, (evt) => {
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
      accumulated += evt.delta.text;
      onDelta(evt.delta.text);
    } else if (evt.type === 'message_start' && evt.message?.usage) {
      onUsage({ input_tokens: evt.message.usage.input_tokens, output_tokens: evt.message.usage.output_tokens });
    } else if (evt.type === 'message_delta' && evt.usage) {
      onUsage({ output_tokens: evt.usage.output_tokens });
      if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
    } else if (evt.type === 'error' && !apiError) {
      apiError = evt.error?.message || 'Anthropic request failed mid-stream';
    }
  });
  if (apiError) throw { status: 502, body: { error: { message: apiError } } };
  return { text: accumulated, stopReason };
}

async function callOpenAIStreaming(
  model: string,
  key: string,
  contextForModel: unknown,
  onDelta: (text: string) => void,
  onUsage: (usage: Usage) => void,
  image: AttachedImage = null
): Promise<StreamResult> {
  const textBlock = { type: 'input_text', text: JSON.stringify(contextForModel, null, 2) };
  const userContent = image
    ? [{ type: 'input_image', image_url: `data:${image.mimeType};base64,${image.base64}`, detail: 'auto' }, textBlock]
    : textBlock.text;
  // Reasoning-tier models (the gpt-5 family, verified live against api.openai.com: gpt-5,
  // gpt-5-mini, gpt-5-nano, gpt-5-pro, gpt-5.6-sol/terra/luna) reject `temperature`
  // outright with a 400 "Unsupported parameter" — only the gpt-4.x family accepts it.
  const supportsTemperature = !/^gpt-5/.test(model);
  let r: Response;
  try {
    r = await fetchWithTimeout('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_output_tokens: 8192,
        ...(supportsTemperature ? { temperature: 0.2 } : {}),
        stream: true,
      }),
      signal: AbortSignal.timeout(90000),
    }, 90000, 'OpenAI');
  } catch (e: any) {
    throw { status: 504, body: { error: { message: e?.message || String(e) } } };
  }
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw { status: r.status, body: errBody };
  }
  let accumulated = "";
  let stopReason: string | null = null;
  let apiError: string | null = null;
  await consumeSSE(r, (evt) => {
    if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
      accumulated += evt.delta;
      onDelta(evt.delta);
    } else if (evt.type === 'response.completed' && evt.response?.usage) {
      onUsage({ input_tokens: evt.response.usage.input_tokens, output_tokens: evt.response.usage.output_tokens });
    } else if (evt.type === 'response.incomplete' && evt.response?.incomplete_details?.reason) {
      stopReason = evt.response.incomplete_details.reason;
    } else if ((evt.type === 'response.failed' || evt.type === 'error') && !apiError) {
      apiError = evt.response?.error?.message || evt.error?.message || evt.message || 'OpenAI request failed mid-stream';
    }
  });
  if (apiError) throw { status: 502, body: { error: { message: apiError } } };
  return { text: accumulated, stopReason };
}

// Deterministic $/token lookup — no reason to call an LLM to estimate its own cost.
// [inputPer1M, outputPer1M] in USD. Mirrors web/lib/usage/pricing.ts's MODEL_CATALOG —
// update both if pricing changes.
const PRICING_PER_1M: Record<string, [number, number]> = {
  // Current selectable catalog — snapshot 2026-08-24.
  'gpt-5.6-sol': [5.0, 30.0],
  'gpt-5.6-terra': [2.0, 12.0],
  'gpt-5.6-luna': [0.2, 1.2],
  'claude-fable-5': [10.0, 50.0],
  'claude-opus-5': [5.0, 25.0],
  'claude-sonnet-5': [2.0, 10.0],
  'claude-haiku-4-5': [1.0, 5.0],
  // Legacy rows kept billable — a real ai_providers row can still reference these.
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1': [2.0, 8.0],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10.0],
  'gpt-5-nano': [0.05, 0.4],
  'gpt-5-mini': [0.25, 2.0],
  'gpt-5': [1.25, 10.0],
  'gpt-5-pro': [15.0, 120.0],
  'claude-sonnet-4-6': [3.0, 15.0],
};
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING_PER_1M[model];
  if (!rates) return 0;
  const [inRate, outRate] = rates;
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
}

// Real semantic retrieval (migration 202608260008). Always uses OpenAI regardless of
// which provider is active for chat completions — text-embedding-3-small produces 1536
// dims, matching the memories.embedding column exactly. Never throws: any failure
// (missing key, network, bad response) degrades to a null embedding per input rather
// than failing the whole chat command.
async function embedTexts(texts: string[], key: string | undefined): Promise<(number[] | null)[]> {
  if (!key || texts.length === 0) return texts.map(() => null);
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!r.ok) return texts.map(() => null);
    const body = await r.json();
    const byIndex = new Map<number, number[]>();
    for (const item of body.data || []) {
      if (typeof item.index === 'number' && Array.isArray(item.embedding)) byIndex.set(item.index, item.embedding);
    }
    return texts.map((_, i) => byIndex.get(i) ?? null);
  } catch {
    return texts.map(() => null);
  }
}
async function embedText(text: string, key: string | undefined): Promise<number[] | null> {
  const [result] = await embedTexts([text], key);
  return result;
}

type ProviderRow = { provider: 'openai' | 'anthropic'; model: string };
async function getActiveProvider(supabase: any): Promise<ProviderRow | null> {
  const { data } = await supabase
    .from('ai_providers')
    .select('provider,model')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Server-side backstop: the system prompt ASKS the model to flag these categories as
// approvalRequired, but prompt instructions are not a security boundary. Any task whose
// title/description mentions one of these risk categories is force-flagged for approval
// here, regardless of what the model returned. Each keyword also maps to an approval
// "domain" (public.approval_domain, added by the 202608230001 migration) so the RLS
// approvals_update_approver policy can route salary/finance/legal approvals to the right
// authority instead of letting any company manager approve everything.
type ApprovalDomain = "general"|"salary_hr"|"finance"|"legal"|"production"|"external_comms";
const FORCED_APPROVAL_KEYWORDS: Array<{ keyword:string; domain:ApprovalDomain }> = [
  { keyword:'salary', domain:'salary_hr' }, { keyword:'wage', domain:'salary_hr' }, { keyword:'wages', domain:'salary_hr' },
  { keyword:'compensation', domain:'salary_hr' }, { keyword:'payroll', domain:'salary_hr' }, { keyword:'bonus', domain:'salary_hr' }, { keyword:'raise', domain:'salary_hr' },
  { keyword:'payment', domain:'finance' }, { keyword:'invoice', domain:'finance' }, { keyword:'refund', domain:'finance' }, { keyword:'payout', domain:'finance' },
  { keyword:'wire transfer', domain:'finance' }, { keyword:'bank transfer', domain:'finance' },
  { keyword:'discount', domain:'finance' }, { keyword:'price reduction', domain:'finance' }, { keyword:'markdown', domain:'finance' },
  { keyword:'barter', domain:'finance' }, { keyword:'trade-in', domain:'finance' }, { keyword:'in-kind', domain:'finance' },
  { keyword:'financing', domain:'finance' }, { keyword:'loan', domain:'finance' }, { keyword:'credit line', domain:'finance' }, { keyword:'investment', domain:'finance' },
  { keyword:'contract', domain:'legal' }, { keyword:'agreement', domain:'legal' }, { keyword:'nda', domain:'legal' }, { keyword:'legal', domain:'legal' },
  { keyword:'publish', domain:'production' }, { keyword:'publication', domain:'production' }, { keyword:'press release', domain:'production' }, { keyword:'public post', domain:'production' },
  { keyword:'go live', domain:'production' }, { keyword:'production deploy', domain:'production' }, { keyword:'deploy to production', domain:'production' },
  { keyword:'delete', domain:'production' }, { keyword:'deletion', domain:'production' }, { keyword:'remove permanently', domain:'production' }, { keyword:'purge', domain:'production' },
  { keyword:'external email', domain:'external_comms' }, { keyword:'send email to client', domain:'external_comms' },
  { keyword:'message the client', domain:'external_comms' }, { keyword:'dm the customer', domain:'external_comms' }, { keyword:'slack the client', domain:'external_comms' }
];
function detectForcedApprovalMatches(title:string, description:string){
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  return FORCED_APPROVAL_KEYWORDS.filter(k => text.includes(k.keyword));
}
function detectForcedApprovalKeywords(title:string, description:string){
  return detectForcedApprovalMatches(title, description).map(m => m.keyword);
}
// First matched domain wins; 'general' if no keyword matched (e.g. model set approvalRequired itself).
function detectApprovalDomain(title:string, description:string): ApprovalDomain {
  const matches = detectForcedApprovalMatches(title, description);
  return matches.length ? matches[0].domain : 'general';
}
function fallbackPlan(command:string, contextPack:any){
  const lower = command.toLowerCase();
  const companyId = contextPack?.companies?.[0]?.id || null;
  const agent = (role:string)=> (contextPack?.agents||[]).find((a:any)=>String(a.role||'').includes(role))?.id || null;
  const tasks:AiTask[] = [];
  if(lower.includes('proposal') || lower.includes('quotation') || lower.includes('quote')){
    tasks.push({title:'Prepare proposal and quotation package',description:command,companyId,ownerType:'agent',ownerAgentId:agent('proposal'),priority:'high',riskLevel:'medium',approvalRequired:true,acceptanceCriteria:['Quotation total calculated','Proposal draft created','Approval gate created'],testMethod:['Review proposal fields','Check discount/margin rules']});
  } else if(lower.includes('kpi') || lower.includes('salary')){
    tasks.push({title:'Review KPI and create salary-impact recommendation for approval',description:command,companyId,ownerType:'agent',ownerAgentId:agent('people'),priority:'high',riskLevel:'high',approvalRequired:true,acceptanceCriteria:['KPI evidence reviewed','Salary change not executed automatically'],testMethod:['Approval exists before salary impact']});
  } else if(lower.includes('software') || lower.includes('ticket') || lower.includes('prd')){
    tasks.push({title:'Create software factory work package',description:command,companyId,ownerType:'agent',ownerAgentId:agent('software'),priority:'high',riskLevel:'medium',approvalRequired:false,acceptanceCriteria:['PRD created','Atomic tickets created','QA cases created'],testMethod:['QA checks ticket completeness']});
  } else {
    tasks.push({title:'Create CEO operating brief and follow-up tasks',description:command,companyId,ownerType:'agent',ownerAgentId:agent('chief'),priority:'high',riskLevel:'low',approvalRequired:false,acceptanceCriteria:['Blockers identified','Tasks created','Founder decisions listed'],testMethod:['QA checks brief completeness']});
  }
  return { strategicGoal:'Execute founder command through Brain OS v0.7 fallback planner', summary:'Fallback planner created tasks because AI provider is not configured or failed.', riskLevel: tasks.some(t=>t.riskLevel==='high')?'high':'medium', tasks, approvals: tasks.filter(t=>t.approvalRequired).map((t,i)=>({title:`Approval required: ${t.title}`, reason:'Risk policy requires human approval.', riskLevel:t.riskLevel||'medium', taskIndex:i})), memoryCandidates: [] };
}

async function buildContext(supabase:any, command:string, channelId: string | null, openaiKey: string | undefined){
  // Database-first, compact context. RLS applies because this client uses the caller JWT.
  const q = command.toLowerCase();
  const queryEmbedding = await embedText(command, openaiKey);
  // Real semantic retrieval when embeddings are available (match_memories, migration
  // 202608260008); degrades to the original ILIKE substring match otherwise — company
  // knowledge lookup must never be the reason a chat command fails.
  // pgvector RPC params round-trip as text over PostgREST — "[0.1,0.2,...]", not a raw
  // JS array.
  const memoriesQuery = queryEmbedding
    ? supabase.rpc('match_memories', { query_embedding: `[${queryEmbedding.join(',')}]`, match_count: 8 })
    : supabase.from('memories').select('id,company_id,entity_type,entity_id,fact,confidence,sensitivity').or(`fact.ilike.%${q.slice(0,60).replace(/[%,()]/g,' ')}%,entity_type.ilike.%company%`).limit(20);
  // Short-term continuity: the last few turns in this same channel, chronological.
  // Separate from relevantMemories (long-term, cross-channel, semantic) by design.
  const conversationHistoryQuery = channelId
    ? supabase.from('work_orders').select('command,output').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(8)
    : Promise.resolve({ data: [], error: null });
  const TASK_STATUSES = ['queued','in_progress','blocked','needs_approval'];
  const [companies, projects, tasks, memories, agents, products, inventory, approvals, people, goals, companyRelationships, personAssignments, financialReports, conversationRows, channels,
    tasksCount, approvalsCount, companiesCount, peopleCount, projectsCount, goalsCount, salesLeadsCount, inventoryCount, channelsCount] = await Promise.all([
    supabase.from('companies').select('id,name,status,strategic_priority,risk_score').limit(12),
    supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score').limit(20),
    supabase.from('tasks').select('id,company_id,project_id,title,status,priority,risk_level,approval_required,deadline').in('status',TASK_STATUSES).limit(30),
    memoriesQuery,
    supabase.from('agents').select('id,name,role,skills,cost_limit_usd').eq('active', true).limit(20),
    // unit_cost intentionally not selected — it lives in product_costs now (manager+
    // RLS), not on product_lines itself. The AI's context must not carry cost/margin
    // data for a caller who couldn't otherwise read it.
    supabase.from('product_lines').select('id,company_id,name,currency,unit_price,service_fee_monthly,active').eq('active', true).limit(20),
    supabase.from('inventory_items').select('id,company_id,product_line_id,sku,quantity_on_hand,reserved_quantity,reorder_point,location').limit(20),
    supabase.from('approvals').select('id,company_id,title,status,risk_level,reason').eq('status','pending').limit(20),
    supabase.from('people').select('id,full_name,email,role_title,company_id').limit(30),
    supabase.from('goals').select('id,company_id,title,status,kind').limit(20),
    // RLS-gated to founder/admin — a non-founder caller simply gets [] back, no special
    // casing needed here.
    supabase.from('company_relationships').select('id,company_id,related_company_id,owner_profile_id,relationship_type,state').limit(20),
    supabase.from('person_assignments').select('id,person_id,legal_employer_company_id,operating_company_id,manager_person_id,job_title,state').limit(30),
    // RLS-gated to founder/admin or is_company_manager(company_id) — a technician's own
    // RLS-scoped client gets [] back here, same "no special casing" pattern as
    // company_relationships above. This is the actual security boundary the founder's
    // "technician asking for revenue should not reply" requirement depends on: the model
    // never receives restricted rows in the first place, rather than being told not to
    // repeat them.
    supabase.from('financial_reports').select('id,company_id,period,revenue,expenses,net_income,cash_position,health_status,summary').order('created_at', { ascending: false }).limit(20),
    conversationHistoryQuery,
    // Brain OS's own chat_channels — so the model knows these are internal conversation
    // threads it can be asked to delete, not an external platform (Slack/Teams/Discord)
    // it has no access to.
    supabase.from('chat_channels').select('id,name').eq('archived', false).limit(30),
    // Real aggregate counts, deliberately separate from the (necessarily truncated)
    // arrays above. head:true means no rows are fetched — this is a cheap COUNT, not a
    // second copy of the data. CLAUDE.md §6/§26: the model must never infer a total from
    // counting a limited context array (confirmed live bug: reported "20 approvals" —
    // the .limit(20) cap — when the real total was 75). Same RLS applies to a count
    // query as a row query, so a technician's counts are scoped exactly like their rows.
    supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status',TASK_STATUSES),
    supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status','pending'),
    supabase.from('companies').select('id', { count: 'exact', head: true }),
    supabase.from('people').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('goals').select('id', { count: 'exact', head: true }),
    supabase.from('sales_leads').select('id', { count: 'exact', head: true }),
    supabase.from('inventory_items').select('id', { count: 'exact', head: true }),
    // Found live 2026-08-27: the model correctly noticed channels had no count and
    // said so rather than guessing ("context.counts does not include a channel
    // total, so I cannot confirm this is the complete list") — same truncation-as-
    // total risk class as the other counts above, just missed when those were added.
    supabase.from('chat_channels').select('id', { count: 'exact', head: true }).eq('archived', false),
  ]);
  const conversationHistory = (conversationRows.data || []).map((r:any) => ({ command: r.command, summary: r.output?.summary || null }));
  const counts = {
    tasksShown: (tasks.data||[]).length, tasksTotal: tasksCount.count ?? (tasks.data||[]).length,
    approvalsShown: (approvals.data||[]).length, approvalsTotal: approvalsCount.count ?? (approvals.data||[]).length,
    companiesTotal: companiesCount.count ?? (companies.data||[]).length,
    peopleTotal: peopleCount.count ?? (people.data||[]).length,
    projectsTotal: projectsCount.count ?? (projects.data||[]).length,
    goalsTotal: goalsCount.count ?? (goals.data||[]).length,
    salesLeadsTotal: salesLeadsCount.count ?? 0,
    inventoryItemsTotal: inventoryCount.count ?? (inventory.data||[]).length,
    channelsShown: (channels.data||[]).length, channelsTotal: channelsCount.count ?? (channels.data||[]).length,
  };
  const pack = { command, companies:companies.data||[], projects:projects.data||[], tasks:tasks.data||[], memories:memories.data||[], agents:agents.data||[], products:products.data||[], inventory:inventory.data||[], approvals:approvals.data||[], people:people.data||[], goals:goals.data||[], companyRelationships:companyRelationships.data||[], personAssignments:personAssignments.data||[], financialReports:financialReports.data||[], conversationHistory, channels:channels.data||[], activeChannelId:channelId, counts };
  return { pack, errors:[companies.error,projects.error,tasks.error,memories.error,agents.error,products.error,inventory.error,approvals.error,people.error,goals.error,companyRelationships.error,personAssignments.error,financialReports.error,conversationRows.error,channels.error,tasksCount.error,approvalsCount.error,companiesCount.error,peopleCount.error,projectsCount.error,goalsCount.error,salesLeadsCount.error,inventoryCount.error,channelsCount.error].filter(Boolean).map((e:any)=>e.message) };
}

serve(async (req) => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if(req.method !== 'POST') return json({ error:'POST only' }, 405);
  const started = Date.now();
  // Independent of provider selection (used for embeddings regardless of which provider
  // handles chat completions), so read it early enough for buildContext() to use it.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  // ---- Pre-flight: auth, parsing, context, provider resolution. Plain JSON errors,
  // same as before — nothing here is streamed, it all has to happen before the LLM
  // call regardless. ----
  let auth: string, command: string, supabase: any, profile: any, contextPack: any, contextErrors: string[], tokenEstimate: number;
  let channelId: string | null = null;
  let providerName: 'openai' | 'anthropic' = 'openai';
  let model = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini';
  let attachedImage: AttachedImage = null;
  try {
    auth = req.headers.get('Authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({ error:'Missing Authorization bearer token' }, 401);
    const body = await req.json();
    command = String(body.command || '').trim();
    if(!command) return json({ error:'Missing command' }, 400);
    const requestedChannelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';

    const rawImageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const rawImageMimeType = typeof body.imageMimeType === 'string' ? body.imageMimeType.trim().toLowerCase() : '';
    const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (rawImageBase64 && ALLOWED_IMAGE_TYPES.has(rawImageMimeType)) {
      attachedImage = { base64: rawImageBase64, mimeType: rawImageMimeType };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if(userErr || !user) return json({ error:'Invalid user session' }, 401);
    const profileRes = await supabase.from('profiles').select('id,role,full_name,email').eq('auth_user_id', user.id).single();
    profile = profileRes.data;
    if(!profile) return json({ error:'Profile not found for authenticated user' }, 403);

    // Never trust the id string until it's confirmed to actually resolve under this
    // caller's own RLS — same "never trust an id unless verified" rule as every other
    // model/client-supplied id in this file. An invalid/inaccessible channel silently
    // falls back to "General" rather than erroring the whole command.
    if (requestedChannelId) {
      const channelCheck = await supabase.from('chat_channels').select('id').eq('id', requestedChannelId).maybeSingle();
      if (channelCheck.data) channelId = requestedChannelId;
    }

    const ctx = await buildContext(supabase, command, channelId, openaiKey);
    contextPack = ctx.pack;
    contextErrors = ctx.errors;
    tokenEstimate = estimateTokens({ command, contextPack });
    const hardMax = Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000);
    if(tokenEstimate > hardMax) return json({ error:'Token preflight hard stop', tokenEstimate, hardMax }, 413);

    // No active ai_providers row = today's exact behavior (hardcoded OpenAI + env model).
    // A row only ever changes providerName/model; it never supplies the key itself —
    // keys stay Edge Function secrets, never database rows (see migration 202608260001).
    const activeProvider = await getActiveProvider(supabase);
    if (activeProvider) {
      providerName = activeProvider.provider;
      model = activeProvider.model;
    }
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const key = providerName === 'anthropic' ? anthropicKey : openaiKey;

  // ---- Streaming response from here on: the LLM call + everything that depends on
  // its fully-parsed output (forced-approval scan, transactional persist, audit log). ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(sseEvent(data)));
      let workOrderId: string | null = null;
      try {
        // A real row now exists in the database before the LLM call even starts, not
        // just after it finishes — verified live that generation itself survives a
        // client disconnect (a command was sent, the browser hard-disconnected before it
        // could have finished, and the task/work_order/model_usage rows all landed
        // successfully anyway), so this pending row is what the chat page reconnects to
        // if the user navigates away and back mid-generation.
        const { data: pendingId, error: pendingError } = await supabase.rpc('create_pending_work_order', {
          p_command: command,
          p_context_pack: contextPack,
          p_channel_id: channelId,
        });
        if (!pendingError && pendingId) {
          workOrderId = pendingId;
          send({ type: 'work_order', id: workOrderId });
        }

        let resultText: string;
        let stopReason: string | null = null;
        const usageRef: { current: Usage | null } = { current: null };

        if(!key){
          const fb = fallbackPlan(command, contextPack);
          resultText = JSON.stringify(fb);
          model = 'fallback-no-api-key';
          if (fb.summary) send({ type: 'delta', text: fb.summary });
        } else if (providerName === 'anthropic') {
          const r = await callAnthropicStreaming(
            model, key,
            { profile:{id:profile.id,role:profile.role}, command, contextPack },
            (delta) => send({ type: 'delta', text: delta }),
            (u) => { usageRef.current = { ...usageRef.current, ...u }; send({ type: 'usage', ...usageRef.current }); },
            attachedImage
          );
          resultText = r.text; stopReason = r.stopReason;
        } else {
          const r = await callOpenAIStreaming(
            model, key,
            { profile:{id:profile.id,role:profile.role}, command, contextPack },
            (delta) => send({ type: 'delta', text: delta }),
            (u) => { usageRef.current = { ...usageRef.current, ...u }; send({ type: 'usage', ...usageRef.current }); },
            attachedImage
          );
          resultText = r.text; stopReason = r.stopReason;
        }

        let result: any;
        try {
          result = parseModelJson(resultText);
        } catch {
          // Now attached to a real work_order row (entity_id) instead of null, and that
          // row itself gets marked 'rejected' rather than sitting stuck at 'queued'
          // forever — both diagnosable and visible in chat history afterward.
          const truncated = stopReason === 'max_tokens' || stopReason === 'max_output_tokens';
          const errorMessage = truncated
            ? 'Response was cut off before it finished (too long for one reply) — try breaking the request into smaller steps.'
            : 'Model returned invalid JSON';
          await supabase.from('audit_logs').insert({
            actor_profile_id: profile.id, actor_role: profile.role,
            event_type: 'ai_command_json_parse_failed', entity_type: 'work_order', entity_id: workOrderId,
            message: errorMessage, metadata: { command, model, stopReason, raw: resultText.slice(0, 4000) }
          });
          if (workOrderId) {
            await supabase.rpc('mark_work_order_failed', { p_work_order_id: workOrderId, p_error: errorMessage });
          }
          send({ type: 'error', error: errorMessage, raw: resultText.slice(0, 2000) });
          return;
        }

        // Business logic (risk-keyword forcing, domain routing) stays here in TypeScript;
        // persistence is delegated to the sem_execute_ai_command RPC (migration
        // 202608230002) so work_order + tasks + approvals + model_usage + audit_logs all
        // commit or roll back together instead of a sequential-insert approach, which
        // silently swallowed per-row errors and could leave partial state.
        const resultTasks = (result.tasks || []) as AiTask[];
        const forcedApprovalTaskIndexes:number[] = [];
        const taskPayloads = resultTasks.map((t, i) => {
          const matchedKeywords = detectForcedApprovalKeywords(t.title || '', t.description || '');
          const forced = !t.approvalRequired && matchedKeywords.length > 0;
          if(forced) forcedApprovalTaskIndexes.push(i);
          return {
            companyId: t.companyId || null, projectId: t.projectId || null, title: t.title, description: t.description || '', parentGoal: result.strategicGoal || '',
            ownerType: t.ownerType || 'agent', ownerAgentId: t.ownerAgentId || null, ownerPersonId: t.ownerPersonId || null,
            acceptanceCriteria: t.acceptanceCriteria || [], testMethod: t.testMethod || [],
            priority: t.priority || 'medium', riskLevel: t.riskLevel || 'low', approvalRequired: !!t.approvalRequired || forced
          };
        });

        // Deletion is high-risk regardless of which task is targeted (no title/description
        // to keyword-scan the way task creation is) — cross-check against the real ids
        // this request's own context pack fetched, so the model can't smuggle in an
        // arbitrary uuid it merely guessed at.
        const contextTaskIds = new Set((contextPack?.tasks || []).map((t: any) => t.id));
        const requestedDeleteIds = Array.isArray(result.deleteTaskIds) ? result.deleteTaskIds as unknown[] : [];
        const deleteTaskIds = requestedDeleteIds.filter((id): id is string => typeof id === 'string' && contextTaskIds.has(id));

        // Channel deletion: same cross-check discipline as task deletion above, but this
        // isn't part of the sem_execute_ai_command RPC's transaction — chat_channels has
        // its own existing RLS delete policy (the same one the manual "..." > Delete menu
        // in channel-sidebar.tsx already relies on), so a plain scoped delete here reuses
        // that real enforcement rather than adding a new RPC parameter/migration for it.
        const contextChannelIds = new Set((contextPack?.channels || []).map((c: any) => c.id));
        if (contextPack?.activeChannelId) contextChannelIds.add(contextPack.activeChannelId);
        const requestedDeleteChannelIds = Array.isArray(result.deleteChannelIds) ? result.deleteChannelIds as unknown[] : [];
        const deleteChannelIds = requestedDeleteChannelIds.filter((id): id is string => typeof id === 'string' && contextChannelIds.has(id));
        let deletedChannelCount = 0;
        if (deleteChannelIds.length > 0) {
          const { data: deletedChannels, error: deleteChannelsError } = await supabase
            .from('chat_channels')
            .delete()
            .in('id', deleteChannelIds)
            .select('id');
          // RLS may silently affect 0 rows if the caller lacks delete rights — that's not
          // a hard error, just nothing to report as deleted; a real error (e.g. network)
          // still surfaces in summary so it isn't swallowed.
          if (deleteChannelsError) {
            result.summary = `${result.summary || ''}\n\n(Channel deletion failed: ${deleteChannelsError.message})`.trim();
          } else {
            deletedChannelCount = deletedChannels?.length || 0;
          }
        }

        // Companies/people creation: defensively coerce shape (never trust the model's
        // JSON structure blindly) — name/fullName are required, everything else is
        // optional. A person's companyId is only trusted if it's a real id from
        // context.companies; companyIndex is bounds-checked by the RPC itself against
        // however many companies actually get created this request.
        const contextCompanyIds = new Set((contextPack?.companies || []).map((c: any) => c.id));
        const contextPersonIds = new Set((contextPack?.people || []).map((p: any) => p.id));
        const requestedCompanies = Array.isArray(result.createCompanies) ? result.createCompanies as unknown[] : [];
        const createCompanies = requestedCompanies
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as any).name === 'string' && (c as any).name.trim())
          .map((c: any) => ({
            name: String(c.name).trim(),
            country: typeof c.country === 'string' ? c.country : null,
            legalEntityName: typeof c.legalEntityName === 'string' ? c.legalEntityName : null,
            description: typeof c.description === 'string' ? c.description : null,
          }));

        const requestedPeople = Array.isArray(result.createPeople) ? result.createPeople as unknown[] : [];
        const createPeople = requestedPeople
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).fullName === 'string' && (p as any).fullName.trim())
          .map((p: any) => ({
            fullName: String(p.fullName).trim(),
            email: typeof p.email === 'string' ? p.email : null,
            roleTitle: typeof p.roleTitle === 'string' ? p.roleTitle : null,
            companyId: typeof p.companyId === 'string' && contextCompanyIds.has(p.companyId) ? p.companyId : null,
            companyIndex: typeof p.companyIndex === 'number' ? p.companyIndex : null,
          }));

        // Projects/goals both require a company (NOT NULL in the schema) — drop any
        // entry with no resolvable reference rather than let it hit the database and
        // fail the whole transaction on a not-null violation.
        const hasCompanyRef = (c: any) => (typeof c.companyId === 'string' && contextCompanyIds.has(c.companyId)) || typeof c.companyIndex === 'number';
        const requestedProjects = Array.isArray(result.createProjects) ? result.createProjects as unknown[] : [];
        const createProjects = requestedProjects
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).title === 'string' && (p as any).title.trim() && hasCompanyRef(p))
          .map((p: any) => ({
            title: String(p.title).trim(),
            companyId: typeof p.companyId === 'string' && contextCompanyIds.has(p.companyId) ? p.companyId : null,
            companyIndex: typeof p.companyIndex === 'number' ? p.companyIndex : null,
            goal: typeof p.goal === 'string' ? p.goal : null,
            deadline: typeof p.deadline === 'string' ? p.deadline : null,
            blockers: typeof p.blockers === 'string' ? p.blockers : null,
          }));

        const requestedGoals = Array.isArray(result.createGoals) ? result.createGoals as unknown[] : [];
        const createGoals = requestedGoals
          .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object' && typeof (g as any).title === 'string' && (g as any).title.trim() && hasCompanyRef(g))
          .map((g: any) => ({
            title: String(g.title).trim(),
            companyId: typeof g.companyId === 'string' && contextCompanyIds.has(g.companyId) ? g.companyId : null,
            companyIndex: typeof g.companyIndex === 'number' ? g.companyIndex : null,
            description: typeof g.description === 'string' ? g.description : null,
            kind: typeof g.kind === 'string' ? g.kind : null,
            status: typeof g.status === 'string' ? g.status : null,
            dueAt: typeof g.dueAt === 'string' ? g.dueAt : null,
          }));

        // Company relationships / person assignments: real, sensitive data (founder-only
        // and manager-scoped RLS is the real authorization) — state defaults to the
        // safest option ("planned") per the "never treat an intention as an
        // already-completed legal transfer" rule; only an explicit, valid "current" is
        // ever honored, and ownerProfileId is only trusted if it exactly matches the
        // calling profile — never any other value the model might supply.
        const VALID_RELATIONSHIP_STATES = new Set(['current', 'planned', 'historical', 'under_restructuring']);
        const VALID_RELATIONSHIP_TYPES = new Set(['parent_of', 'owned_by_percentage']);
        const requestedRelationships = Array.isArray(result.createCompanyRelationships) ? result.createCompanyRelationships as unknown[] : [];
        const createCompanyRelationships = requestedRelationships
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && hasCompanyRef(r))
          .map((r: any) => ({
            companyId: typeof r.companyId === 'string' && contextCompanyIds.has(r.companyId) ? r.companyId : null,
            companyIndex: typeof r.companyIndex === 'number' ? r.companyIndex : null,
            relatedCompanyId: typeof r.relatedCompanyId === 'string' && contextCompanyIds.has(r.relatedCompanyId) ? r.relatedCompanyId : null,
            relatedCompanyIndex: typeof r.relatedCompanyIndex === 'number' ? r.relatedCompanyIndex : null,
            ownerProfileId: typeof r.ownerProfileId === 'string' && r.ownerProfileId === profile.id ? r.ownerProfileId : null,
            relationshipType: typeof r.relationshipType === 'string' && VALID_RELATIONSHIP_TYPES.has(r.relationshipType) ? r.relationshipType : 'parent_of',
            ownershipPct: typeof r.ownershipPct === 'number' ? r.ownershipPct : null,
            state: typeof r.state === 'string' && VALID_RELATIONSHIP_STATES.has(r.state) ? r.state : 'planned',
            effectiveDate: typeof r.effectiveDate === 'string' ? r.effectiveDate : null,
            notes: typeof r.notes === 'string' ? r.notes : null,
          }));

        const VALID_ASSIGNMENT_STATES = new Set(['current', 'planned', 'historical']);
        const VALID_EMPLOYMENT_TYPES = new Set(['full_time', 'part_time', 'contractor', 'advisor']);
        const requestedAssignments = Array.isArray(result.createPersonAssignments) ? result.createPersonAssignments as unknown[] : [];
        const createPersonAssignments = requestedAssignments
          .filter((a): a is Record<string, unknown> =>
            !!a && typeof a === 'object' &&
            ((typeof (a as any).personId === 'string' && contextPersonIds.has((a as any).personId)) || typeof (a as any).personIndex === 'number'))
          .map((a: any) => ({
            personId: typeof a.personId === 'string' && contextPersonIds.has(a.personId) ? a.personId : null,
            personIndex: typeof a.personIndex === 'number' ? a.personIndex : null,
            legalEmployerCompanyId: typeof a.legalEmployerCompanyId === 'string' && contextCompanyIds.has(a.legalEmployerCompanyId) ? a.legalEmployerCompanyId : null,
            legalEmployerCompanyIndex: typeof a.legalEmployerCompanyIndex === 'number' ? a.legalEmployerCompanyIndex : null,
            operatingCompanyId: typeof a.operatingCompanyId === 'string' && contextCompanyIds.has(a.operatingCompanyId) ? a.operatingCompanyId : null,
            operatingCompanyIndex: typeof a.operatingCompanyIndex === 'number' ? a.operatingCompanyIndex : null,
            departmentId: typeof a.departmentId === 'string' ? a.departmentId : null,
            jobTitle: typeof a.jobTitle === 'string' ? a.jobTitle : null,
            managerPersonId: typeof a.managerPersonId === 'string' && contextPersonIds.has(a.managerPersonId) ? a.managerPersonId : null,
            managerPersonIndex: typeof a.managerPersonIndex === 'number' ? a.managerPersonIndex : null,
            employmentType: typeof a.employmentType === 'string' && VALID_EMPLOYMENT_TYPES.has(a.employmentType) ? a.employmentType : 'full_time',
            allocationPct: typeof a.allocationPct === 'number' ? a.allocationPct : null,
            startDate: typeof a.startDate === 'string' ? a.startDate : null,
            endDate: typeof a.endDate === 'string' ? a.endDate : null,
            isPrimary: typeof a.isPrimary === 'boolean' ? a.isPrimary : true,
            responsibilities: typeof a.responsibilities === 'string' ? a.responsibilities : null,
            state: typeof a.state === 'string' && VALID_ASSIGNMENT_STATES.has(a.state) ? a.state : 'current',
          }));

        // Memory candidates: cap at 8 (one embeddings call, bounded cost/latency),
        // require a real fact string, default entityType/entityId to this
        // conversation's channel when the model omits them, validate sensitivity
        // against the real enum. Embeddings are computed here (batched) rather than in
        // SQL — a failed/missing OpenAI call still saves the fact, just unembedded.
        const VALID_MEMORY_SENSITIVITY = new Set(['public', 'internal', 'confidential', 'restricted', 'founder_only']);
        const requestedMemories = Array.isArray(result.memoryCandidates) ? result.memoryCandidates as unknown[] : [];
        const memoryFacts = requestedMemories
          .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as any).fact === 'string' && (m as any).fact.trim())
          .slice(0, 8)
          .map((m: any) => {
            const entityType = typeof m.entityType === 'string' && m.entityType.trim() ? m.entityType.trim() : 'chat_channel';
            const entityId = typeof m.entityId === 'string' && m.entityId.trim()
              ? m.entityId.trim()
              : (entityType === 'chat_channel' ? channelId : null);
            return {
              entityType,
              entityId,
              fact: String(m.fact).trim(),
              confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
              sensitivity: typeof m.sensitivity === 'string' && VALID_MEMORY_SENSITIVITY.has(m.sensitivity) ? m.sensitivity : 'internal',
              companyId: typeof m.companyId === 'string' && contextCompanyIds.has(m.companyId) ? m.companyId : null,
              companyIndex: typeof m.companyIndex === 'number' ? m.companyIndex : null,
            };
          });
        const memoryEmbeddings = await embedTexts(memoryFacts.map(m => m.fact), openaiKey);
        const createMemoryCandidates = memoryFacts.map((m, i) => {
          const embedding = memoryEmbeddings[i];
          return embedding ? { ...m, embedding } : m;
        });

        const modelApprovals = (result.approvals || []) as Array<{title?:string; reason?:string; riskLevel?:string; taskIndex?:number|null}>;
        const modelApprovalTaskIndexes = new Set(modelApprovals.map(a => a.taskIndex).filter((i): i is number => typeof i === 'number'));
        const forcedApprovals: Array<{title:string; reason:string; riskLevel:string; taskIndex:number|null}> = forcedApprovalTaskIndexes
          .filter(i => !modelApprovalTaskIndexes.has(i))
          .map(i => ({
            title: `Approval required: ${resultTasks[i].title}`,
            reason: `Server-side risk policy forced approval (matched: ${detectForcedApprovalKeywords(resultTasks[i].title || '', resultTasks[i].description || '').join(', ')}).`,
            riskLevel: resultTasks[i].riskLevel || 'high',
            taskIndex: i
          }));
        if (deleteTaskIds.length > 0) {
          forcedApprovals.push({
            title: `Approval required: delete ${deleteTaskIds.length} task(s)`,
            reason: 'Server-side risk policy forces approval for any task deletion.',
            riskLevel: 'high',
            taskIndex: null,
          });
        }
        if (deletedChannelCount > 0) {
          forcedApprovals.push({
            title: `Approval required: deleted ${deletedChannelCount} chat channel(s)`,
            reason: 'Server-side risk policy forces approval for any channel deletion.',
            riskLevel: 'high',
            taskIndex: null,
          });
        }
        // Domain drives approvals_update_approver RLS routing (salary/finance -> HR-finance role,
        // legal -> founder/admin only, general/production/external_comms -> company manager).
        // Prefer the linked task's own text (more specific) over the approval's own title/reason.
        const approvalPayloads = [...modelApprovals, ...forcedApprovals].map(a => {
          const sourceTask = typeof a.taskIndex === 'number' ? resultTasks[a.taskIndex] : null;
          const domain = sourceTask
            ? detectApprovalDomain(sourceTask.title || '', sourceTask.description || '')
            : detectApprovalDomain(a.title || '', a.reason || '');
          return { title: a.title || 'Approval required', reason: a.reason || 'Risk policy requires approval', riskLevel: a.riskLevel || 'medium', domain, taskIndex: a.taskIndex ?? null };
        });

        const finalInputTokens = usageRef.current?.input_tokens || tokenEstimate;
        const finalOutputTokens = usageRef.current?.output_tokens || 0;
        const { data: rpcResult, error: rpcError } = await supabase.rpc('sem_execute_ai_command', {
          p_command: command,
          p_context_pack: contextPack,
          p_output: result,
          p_token_estimate: tokenEstimate,
          p_tasks: taskPayloads,
          p_approvals: approvalPayloads,
          p_model_name: model,
          p_input_tokens: finalInputTokens,
          p_output_tokens: finalOutputTokens,
          p_estimated_cost_usd: estimateCost(model, finalInputTokens, finalOutputTokens),
          p_deleted_task_ids: deleteTaskIds,
          p_companies: createCompanies,
          p_people: createPeople,
          p_projects: createProjects,
          p_goals: createGoals,
          p_company_relationships: createCompanyRelationships,
          p_person_assignments: createPersonAssignments,
          p_work_order_id: workOrderId,
          p_memory_candidates: createMemoryCandidates
        });
        if(rpcError) {
          if (workOrderId) {
            await supabase.rpc('mark_work_order_failed', { p_work_order_id: workOrderId, p_error: rpcError.message || 'Failed to persist AI command result' });
          }
          send({ type: 'error', error: rpcError.message || 'Failed to persist AI command result' });
          return;
        }

        const workOrder = { id: rpcResult.workOrderId };
        const createdTasks = rpcResult.createdTasks || [];
        const createdApprovals = rpcResult.createdApprovals || [];
        const deletedTaskIds = rpcResult.deletedTaskIds || [];
        const createdCompanies = rpcResult.createdCompanies || [];
        const createdPeople = rpcResult.createdPeople || [];
        const createdProjects = rpcResult.createdProjects || [];
        const createdGoals = rpcResult.createdGoals || [];
        const createdCompanyRelationships = rpcResult.createdCompanyRelationships || [];
        const createdPersonAssignments = rpcResult.createdPersonAssignments || [];
        const createdMemories = rpcResult.createdMemories || [];

        await supabase.from('audit_logs').insert({ actor_profile_id:profile.id, actor_role:profile.role, event_type:'ai_command_request_completed', entity_type:'work_order', entity_id:workOrder.id, message:'AI command request completed', metadata:{ elapsedMs:Date.now()-started, contextErrors, forcedApprovals:forcedApprovalTaskIndexes.length, deletedTasks:deletedTaskIds.length, companies:createdCompanies.length, people:createdPeople.length, projects:createdProjects.length, goals:createdGoals.length, companyRelationships:createdCompanyRelationships.length, personAssignments:createdPersonAssignments.length, memories:createdMemories.length } });

        send({ type: 'done', result, workOrder, createdTasks, createdApprovals, deletedTaskIds, createdCompanies, createdPeople, createdProjects, createdGoals, createdCompanyRelationships, createdPersonAssignments, createdMemories, model, usage: usageRef.current, tokenEstimate, contextErrors });
      } catch (e: any) {
        const errorMessage = e?.body?.error?.message || e?.message || String(e);
        if (workOrderId) {
          await supabase.rpc('mark_work_order_failed', { p_work_order_id: workOrderId, p_error: errorMessage }).catch(() => {});
        }
        send({ type: 'error', error: errorMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
