// SEM Brain v0.7 Supabase Edge Function: sem-ai-command
// Required secrets:
//   OPENAI_API_KEY
//   OPENAI_MODEL=gpt-4.1-mini
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
// Optional:
//   SEM_AI_MAX_TOKENS=12000
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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
  "approvals": [
    {"title": string, "reason": string, "riskLevel": "medium"|"high"|"critical", "taskIndex": number|null}
  ],
  "memoryCandidates": [
    {"entityType": string, "entityId": string|null, "fact": string, "confidence": number, "sensitivity": "internal"|"confidential"|"restricted"|"founder_only"}
  ]
}`;

function json(data: unknown, status=200){ return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
function extractText(j:any){
  if(typeof j.output_text === 'string') return j.output_text;
  for(const item of j.output || []) for(const c of item.content || []) if(c.type === 'output_text' && c.text) return c.text;
  return JSON.stringify(j);
}
function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }
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
  const [companies, projects, tasks, memories, agents, products, inventory, approvals] = await Promise.all([
    supabase.from('companies').select('id,name,status,strategic_priority,risk_score').limit(12),
    supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score').limit(20),
    supabase.from('tasks').select('id,company_id,project_id,title,status,priority,risk_level,approval_required,deadline').in('status',['queued','in_progress','blocked','needs_approval']).limit(30),
    supabase.from('memories').select('id,company_id,entity_type,entity_id,fact,confidence,sensitivity').or(`fact.ilike.%${q.slice(0,60).replaceAll('%','')}%,entity_type.ilike.%company%`).limit(20),
    supabase.from('agents').select('id,name,role,skills,cost_limit_usd').eq('active', true).limit(20),
    supabase.from('product_lines').select('id,company_id,name,currency,unit_price,unit_cost,service_fee_monthly,active').eq('active', true).limit(20),
    supabase.from('inventory_items').select('id,company_id,product_line_id,sku,quantity_on_hand,reserved_quantity,reorder_point,location').limit(20),
    supabase.from('approvals').select('id,company_id,title,status,risk_level,reason').eq('status','pending').limit(20)
  ]);
  const pack = { command, companies:companies.data||[], projects:projects.data||[], tasks:tasks.data||[], memories:memories.data||[], agents:agents.data||[], products:products.data||[], inventory:inventory.data||[], approvals:approvals.data||[] };
  return { pack, errors:[companies.error,projects.error,tasks.error,memories.error,agents.error,products.error,inventory.error,approvals.error].filter(Boolean).map((e:any)=>e.message) };
}

serve(async (req) => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if(req.method !== 'POST') return json({ error:'POST only' }, 405);
  const started = Date.now();
  try {
    const auth = req.headers.get('Authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({ error:'Missing Authorization bearer token' }, 401);
    const body = await req.json();
    const command = String(body.command || '').trim();
    if(!command) return json({ error:'Missing command' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if(userErr || !user) return json({ error:'Invalid user session' }, 401);
    const { data: profile } = await supabase.from('profiles').select('id,role,full_name,email').eq('auth_user_id', user.id).single();
    if(!profile) return json({ error:'Profile not found for authenticated user' }, 403);

    const { pack: contextPack, errors: contextErrors } = await buildContext(supabase, command);
    const tokenEstimate = estimateTokens({ command, contextPack });
    const hardMax = Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000);
    if(tokenEstimate > hardMax) return json({ error:'Token preflight hard stop', tokenEstimate, hardMax }, 413);

    let result:any;
    let model = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini';
    let usage:any = null;
    const key = Deno.env.get('OPENAI_API_KEY');
    if(!key){
      result = fallbackPlan(command, contextPack);
      model = 'fallback-no-api-key';
    } else {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method:'POST', headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ model, input:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({profile:{id:profile.id,role:profile.role}, command, contextPack}, null, 2)}], temperature:0.2 })
      });
      const j = await r.json();
      if(!r.ok) return json({ error:j.error?.message || 'OpenAI error', details:j }, r.status);
      usage = j.usage || null;
      const text = extractText(j).trim();
      try { result = JSON.parse(text); } catch { return json({ error:'Model returned invalid JSON', raw:text }, 502); }
    }

    const { data: workOrder } = await supabase.from('work_orders').insert({ command, status:'queued', context_pack:contextPack, output:result, token_estimate:tokenEstimate, created_by_profile_id:profile.id }).select().single();

    const createdTasks:any[] = [];
    for(const t of (result.tasks || [])){
      const { data, error } = await supabase.from('tasks').insert({
        company_id:t.companyId || null, project_id:t.projectId || null, title:t.title, description:t.description || '', parent_goal:result.strategicGoal || '',
        owner_type:t.ownerType || 'agent', owner_agent_id:t.ownerAgentId || null, owner_person_id:t.ownerPersonId || null,
        acceptance_criteria:t.acceptanceCriteria || [], test_method:t.testMethod || [],
        status:t.approvalRequired ? 'needs_approval' : 'queued', priority:t.priority || 'medium', risk_level:t.riskLevel || 'low', approval_required:!!t.approvalRequired,
        source:'ai_command_v0.7', created_by_profile_id:profile.id
      }).select().single();
      if(!error && data) createdTasks.push(data);
    }

    const createdApprovals:any[] = [];
    for(const a of (result.approvals || [])){
      const task = typeof a.taskIndex === 'number' ? createdTasks[a.taskIndex] : null;
      const { data, error } = await supabase.from('approvals').insert({
        company_id: task?.company_id || null, task_id: task?.id || null, title:a.title || 'Approval required', reason:a.reason || 'Risk policy requires approval', risk_level:a.riskLevel || 'medium', requested_by_profile_id:profile.id, approval_payload:a
      }).select().single();
      if(!error && data) createdApprovals.push(data);
    }

    await supabase.from('model_usage').insert({ profile_id:profile.id, work_order_id:workOrder?.id || null, model_name:model, input_tokens:usage?.input_tokens || tokenEstimate, output_tokens:usage?.output_tokens || 0, estimated_cost_usd:0 });
    await supabase.from('audit_logs').insert({ actor_profile_id:profile.id, actor_role:profile.role, event_type:'ai_command_executed', entity_type:'work_order', entity_id:workOrder?.id || null, message:'AI command executed through v0.7 production core', metadata:{ command, model, tokenEstimate, contextErrors, elapsedMs:Date.now()-started, tasks:createdTasks.length, approvals:createdApprovals.length } });

    return json({ result, workOrder, createdTasks, createdApprovals, model, usage, tokenEstimate, contextErrors });
  } catch(e){
    return json({ error:e?.message || String(e) }, 500);
  }
});
