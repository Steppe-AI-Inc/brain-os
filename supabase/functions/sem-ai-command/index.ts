// SEM Brain v0.7 Supabase Edge Function: sem-ai-command
// Required secrets:
//   OPENAI_API_KEY
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

const SYSTEM_PROMPT = `You are SEM Brain v0.7 Production Core.
You are the AI-native operating brain for a founder-led multi-company holding system.
You receive one user command and a compact context pack from the database.
Return strict JSON only. No markdown.

Rules:
- Create narrow atomic tasks only.
- Do not invent facts outside the context pack.
- If a fact is missing, create a clarification/research task.
- High-risk actions require approval: salary, HR, money, legal, contracts, external emails, publishing, production systems, deletion, ownership, investor communications, discounts above policy, barter/financing terms.
- Do not expose ownership/cash/salary data unless present in context and user role permits it.
- Use only the provided company/project/person/agent IDs if assigning IDs.
- You may delete existing tasks the user asks to remove/clear/delete: put their exact "id"
  from context.tasks into deleteTaskIds. Never invent or guess an id — only ids that
  literally appear in context.tasks are honored; anything else is silently ignored. If the
  user references a task that isn't in context.tasks, say so in summary instead of
  guessing an id.
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
  "approvals": [
    {"title": string, "reason": string, "riskLevel": "medium"|"high"|"critical", "taskIndex": number|null}
  ],
  "memoryCandidates": [
    {"entityType": string, "entityId": string|null, "fact": string, "confidence": number, "sensitivity": "internal"|"confidential"|"restricted"|"founder_only"}
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
async function consumeSSE(response: Response, onEvent: (data: any) => void): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
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
}

type Usage = { input_tokens?: number; output_tokens?: number };
type StreamResult = { text: string; stopReason: string | null };

async function callAnthropicStreaming(
  model: string,
  key: string,
  contextForModel: unknown,
  onDelta: (text: string) => void,
  onUsage: (usage: Usage) => void
): Promise<StreamResult> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
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
      messages: [{ role: 'user', content: JSON.stringify(contextForModel, null, 2) }],
      temperature: 0.2,
      stream: true,
    }),
  });
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw { status: r.status, body: errBody };
  }
  let accumulated = "";
  let stopReason: string | null = null;
  await consumeSSE(r, (evt) => {
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
      accumulated += evt.delta.text;
      onDelta(evt.delta.text);
    } else if (evt.type === 'message_start' && evt.message?.usage) {
      onUsage({ input_tokens: evt.message.usage.input_tokens, output_tokens: evt.message.usage.output_tokens });
    } else if (evt.type === 'message_delta' && evt.usage) {
      onUsage({ output_tokens: evt.usage.output_tokens });
      if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
    }
  });
  return { text: accumulated, stopReason };
}

async function callOpenAIStreaming(
  model: string,
  key: string,
  contextForModel: unknown,
  onDelta: (text: string) => void,
  onUsage: (usage: Usage) => void
): Promise<StreamResult> {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(contextForModel, null, 2) },
      ],
      max_output_tokens: 8192,
      temperature: 0.2,
      stream: true,
    }),
  });
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw { status: r.status, body: errBody };
  }
  let accumulated = "";
  let stopReason: string | null = null;
  await consumeSSE(r, (evt) => {
    if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
      accumulated += evt.delta;
      onDelta(evt.delta);
    } else if (evt.type === 'response.completed' && evt.response?.usage) {
      onUsage({ input_tokens: evt.response.usage.input_tokens, output_tokens: evt.response.usage.output_tokens });
    } else if (evt.type === 'response.incomplete' && evt.response?.incomplete_details?.reason) {
      stopReason = evt.response.incomplete_details.reason;
    }
  });
  return { text: accumulated, stopReason };
}

// Deterministic $/token lookup — no reason to call an LLM to estimate its own cost.
// [inputPer1M, outputPer1M] in USD. Update as pricing/models change.
const PRICING_PER_1M: Record<string, [number, number]> = {
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1': [2.0, 8.0],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10.0],
  'claude-sonnet-4-6': [3.0, 15.0],
  'claude-haiku-4-6': [0.8, 4.0],
};
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING_PER_1M[model];
  if (!rates) return 0;
  const [inRate, outRate] = rates;
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
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
  return { strategicGoal:'Execute founder command through SEM Brain v0.7 fallback planner', summary:'Fallback planner created tasks because AI provider is not configured or failed.', riskLevel: tasks.some(t=>t.riskLevel==='high')?'high':'medium', tasks, approvals: tasks.filter(t=>t.approvalRequired).map((t,i)=>({title:`Approval required: ${t.title}`, reason:'Risk policy requires human approval.', riskLevel:t.riskLevel||'medium', taskIndex:i})), memoryCandidates: [] };
}

async function buildContext(supabase:any, command:string){
  // Database-first, compact context. RLS applies because this client uses the caller JWT.
  const q = command.toLowerCase();
  const [companies, projects, tasks, memories, agents, products, inventory, approvals, people, goals] = await Promise.all([
    supabase.from('companies').select('id,name,status,strategic_priority,risk_score').limit(12),
    supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score').limit(20),
    supabase.from('tasks').select('id,company_id,project_id,title,status,priority,risk_level,approval_required,deadline').in('status',['queued','in_progress','blocked','needs_approval']).limit(30),
    supabase.from('memories').select('id,company_id,entity_type,entity_id,fact,confidence,sensitivity').or(`fact.ilike.%${q.slice(0,60).replace(/[%,()]/g,' ')}%,entity_type.ilike.%company%`).limit(20),
    supabase.from('agents').select('id,name,role,skills,cost_limit_usd').eq('active', true).limit(20),
    supabase.from('product_lines').select('id,company_id,name,currency,unit_price,unit_cost,service_fee_monthly,active').eq('active', true).limit(20),
    supabase.from('inventory_items').select('id,company_id,product_line_id,sku,quantity_on_hand,reserved_quantity,reorder_point,location').limit(20),
    supabase.from('approvals').select('id,company_id,title,status,risk_level,reason').eq('status','pending').limit(20),
    supabase.from('people').select('id,full_name,email,role_title,company_id').limit(30),
    supabase.from('goals').select('id,company_id,title,status,kind').limit(20)
  ]);
  const pack = { command, companies:companies.data||[], projects:projects.data||[], tasks:tasks.data||[], memories:memories.data||[], agents:agents.data||[], products:products.data||[], inventory:inventory.data||[], approvals:approvals.data||[], people:people.data||[], goals:goals.data||[] };
  return { pack, errors:[companies.error,projects.error,tasks.error,memories.error,agents.error,products.error,inventory.error,approvals.error,people.error,goals.error].filter(Boolean).map((e:any)=>e.message) };
}

serve(async (req) => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if(req.method !== 'POST') return json({ error:'POST only' }, 405);
  const started = Date.now();

  // ---- Pre-flight: auth, parsing, context, provider resolution. Plain JSON errors,
  // same as before — nothing here is streamed, it all has to happen before the LLM
  // call regardless. ----
  let auth: string, command: string, supabase: any, profile: any, contextPack: any, contextErrors: string[], tokenEstimate: number;
  let providerName: 'openai' | 'anthropic' = 'openai';
  let model = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini';
  try {
    auth = req.headers.get('Authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({ error:'Missing Authorization bearer token' }, 401);
    const body = await req.json();
    command = String(body.command || '').trim();
    if(!command) return json({ error:'Missing command' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if(userErr || !user) return json({ error:'Invalid user session' }, 401);
    const profileRes = await supabase.from('profiles').select('id,role,full_name,email').eq('auth_user_id', user.id).single();
    profile = profileRes.data;
    if(!profile) return json({ error:'Profile not found for authenticated user' }, 403);

    const ctx = await buildContext(supabase, command);
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

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const key = providerName === 'anthropic' ? anthropicKey : openaiKey;

  // ---- Streaming response from here on: the LLM call + everything that depends on
  // its fully-parsed output (forced-approval scan, transactional persist, audit log). ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(sseEvent(data)));
      try {
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
            (u) => { usageRef.current = { ...usageRef.current, ...u }; send({ type: 'usage', ...usageRef.current }); }
          );
          resultText = r.text; stopReason = r.stopReason;
        } else {
          const r = await callOpenAIStreaming(
            model, key,
            { profile:{id:profile.id,role:profile.role}, command, contextPack },
            (delta) => send({ type: 'delta', text: delta }),
            (u) => { usageRef.current = { ...usageRef.current, ...u }; send({ type: 'usage', ...usageRef.current }); }
          );
          resultText = r.text; stopReason = r.stopReason;
        }

        let result: any;
        try {
          result = parseModelJson(resultText);
        } catch {
          // No audit_logs row exists for this failure otherwise (it happens before the
          // transactional RPC even runs) — log it so a bad reply is diagnosable later
          // instead of only reproducible live.
          const truncated = stopReason === 'max_tokens' || stopReason === 'max_output_tokens';
          const errorMessage = truncated
            ? 'Response was cut off before it finished (too long for one reply) — try breaking the request into smaller steps.'
            : 'Model returned invalid JSON';
          await supabase.from('audit_logs').insert({
            actor_profile_id: profile.id, actor_role: profile.role,
            event_type: 'ai_command_json_parse_failed', entity_type: 'work_order', entity_id: null,
            message: errorMessage, metadata: { command, model, stopReason, raw: resultText.slice(0, 4000) }
          });
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

        // Companies/people creation: defensively coerce shape (never trust the model's
        // JSON structure blindly) — name/fullName are required, everything else is
        // optional. A person's companyId is only trusted if it's a real id from
        // context.companies; companyIndex is bounds-checked by the RPC itself against
        // however many companies actually get created this request.
        const contextCompanyIds = new Set((contextPack?.companies || []).map((c: any) => c.id));
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
          p_goals: createGoals
        });
        if(rpcError) {
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

        await supabase.from('audit_logs').insert({ actor_profile_id:profile.id, actor_role:profile.role, event_type:'ai_command_request_completed', entity_type:'work_order', entity_id:workOrder.id, message:'AI command request completed', metadata:{ elapsedMs:Date.now()-started, contextErrors, forcedApprovals:forcedApprovalTaskIndexes.length, deletedTasks:deletedTaskIds.length, companies:createdCompanies.length, people:createdPeople.length, projects:createdProjects.length, goals:createdGoals.length } });

        send({ type: 'done', result, workOrder, createdTasks, createdApprovals, deletedTaskIds, createdCompanies, createdPeople, createdProjects, createdGoals, model, usage: usageRef.current, tokenEstimate, contextErrors });
      } catch (e: any) {
        send({ type: 'error', error: e?.body?.error?.message || e?.message || String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
