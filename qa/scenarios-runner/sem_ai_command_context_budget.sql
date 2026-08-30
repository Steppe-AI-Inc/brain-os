-- Context-budget guard (2026-08-30, "context architecture" incident — see
-- qa/KNOWN_FAILURE_MODES.md #36). Real, live-caught defect: a "Token preflight hard stop"
-- (tokenEstimate > SEM_AI_MAX_TOKENS, 12000) reproduced even in a brand-new chat channel
-- with zero conversation history, in a workspace with only 17 companies/15 people/36
-- tasks/8 goals/52 memories — a normal, not-unusually-large real workspace. Diagnostic
-- measurement of buildContext()'s own field selections (supabase/functions/
-- sem-ai-command/index.ts) found the BASE context pack, before any command-specific data,
-- was already ~13,000-14,000 estimated tokens (JSON length / 4), driven by sections
-- fetched unconditionally on every turn regardless of command relevance: memories (20 rows
-- uncapped-relevance fallback), the canonical_work_orders factory summary (a nested nested
-- tasks()/agent_runs() join pulling full commit/summary text for every Work Order), tasks
-- (30-row cap, no targeted lookup), and channels (30-row cap). Fixed via the two-stage
-- retrieval architecture: smaller default caps backstopped by the SAME targeted
-- name-token lookup already proven for companies/people/goals, and a genuinely
-- SUMMARY-ONLY (no nested join, no free-text fields) factory Work Orders fetch by
-- default, with the full detailed version only fetched when the command's own text
-- suggests factory/work-order intent (FACTORY_INTENT_PATTERN in index.ts).
--
-- This regression re-derives the SAME per-section byte counts buildContext() would
-- produce for a real, current production workspace (the exact select field lists/caps
-- must be kept in sync with index.ts manually, same convention as every other file in
-- this directory) and asserts the combined base total stays comfortably under the hard
-- cap, leaving real headroom for command text, conversation history, and the small
-- always-present fields (counts/pendingAction/resolvedEntities). Read-only, no
-- transaction needed — SELECT only, touches no data.
--
-- Run with: npx supabase db query --linked -f qa/scenarios-runner/sem_ai_command_context_budget.sql
with
companies_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,name,status,organization_type,strategic_priority,risk_score from public.companies limit 12) x),
tasks_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,project_id,title,status,priority,risk_level,approval_required,deadline,owner_type,owner_person_id,owner_agent_id from public.tasks where status in ('queued','in_progress','blocked','needs_approval') limit 15) x),
memories_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,entity_type,entity_id,fact,confidence,sensitivity from public.memories limit 8) x),
agents_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,name,role,skills,cost_limit_usd from public.agents where active limit 20) x),
people_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,full_name,email,role_title,company_id,active from public.people limit 30) x),
goals_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,title,status,kind from public.goals limit 20) x),
relationships_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,related_company_id,owner_profile_id,relationship_type,ownership_pct,state from public.company_relationships limit 20) x),
assignments_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,person_id,legal_employer_company_id,operating_company_id,manager_person_id,job_title,state from public.person_assignments limit 30) x),
financial_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,period,revenue,expenses,net_income,cash_position,health_status,summary from public.financial_reports order by created_at desc limit 20) x),
channels_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,name,company_id from public.chat_channels where archived = false limit 15) x),
projects_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,title,status,deadline,blockers,risk_score from public.projects limit 20) x),
approvals_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,title,status,risk_level,reason from public.approvals where status='pending' limit 20) x),
inventory_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,product_line_id,sku,quantity_on_hand,reserved_quantity,reorder_point,location from public.inventory_items limit 20) x),
products_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,company_id,name,currency,unit_price,service_fee_monthly,active from public.product_lines where active limit 20) x),
departments_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,name,company_id from public.departments limit 30) x),
leads_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,client_name,company_id,stage,value_estimate from public.sales_leads limit 30) x),
documents_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,title,company_id,category from public.documents limit 30) x),
proposals_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,title,company_id,status from public.proposals limit 20) x),
specs_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,title,company_id,status from public.product_specs limit 20) x),
drawings_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,title,company_id from public.engineering_drawings limit 20) x),
providers_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,provider,model,label,is_active from public.ai_providers limit 10) x),
mcp_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,name,endpoint_url from public.mcp_connectors limit 10) x),
factory_j as (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select id,title,status,work_type,company_id,goal_id from public.canonical_work_orders order by created_at desc limit 10) x),
totals as (
  select
    (length((select j from companies_j)::text)+3)/4
    + (length((select j from tasks_j)::text)+3)/4
    + (length((select j from memories_j)::text)+3)/4
    + (length((select j from agents_j)::text)+3)/4
    + (length((select j from people_j)::text)+3)/4
    + (length((select j from goals_j)::text)+3)/4
    + (length((select j from relationships_j)::text)+3)/4
    + (length((select j from assignments_j)::text)+3)/4
    + (length((select j from financial_j)::text)+3)/4
    + (length((select j from channels_j)::text)+3)/4
    + (length((select j from projects_j)::text)+3)/4
    + (length((select j from approvals_j)::text)+3)/4
    + (length((select j from inventory_j)::text)+3)/4
    + (length((select j from products_j)::text)+3)/4
    + (length((select j from departments_j)::text)+3)/4
    + (length((select j from leads_j)::text)+3)/4
    + (length((select j from documents_j)::text)+3)/4
    + (length((select j from proposals_j)::text)+3)/4
    + (length((select j from specs_j)::text)+3)/4
    + (length((select j from drawings_j)::text)+3)/4
    + (length((select j from providers_j)::text)+3)/4
    + (length((select j from mcp_j)::text)+3)/4
    + (length((select j from factory_j)::text)+3)/4
    as base_context_tokens_est
)
select
  base_context_tokens_est,
  12000 as hard_max,
  -- Safe budget: base context alone should leave real headroom for command text,
  -- conversation history (up to 8 turns), and the small always-present fields
  -- (counts/pendingAction/resolvedEntities/deletedEntities) - not consume the entire cap
  -- by itself. 10000 leaves at least 2000 tokens of real headroom before the hard stop.
  10000 as safe_budget,
  base_context_tokens_est < 10000 as base_context_below_safe_budget,
  json_build_object(
    'base_context_tokens_est', base_context_tokens_est,
    'hard_max', 12000,
    'safe_budget', 10000,
    'BRAIN_CHAT_FRESH_CHANNEL_BASE_CONTEXT_BELOW_SAFE_BUDGET', base_context_tokens_est < 10000,
    'all_pass', base_context_tokens_est < 10000
  ) as verdict
from totals;
