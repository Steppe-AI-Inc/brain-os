"use server";

import { createClient } from "@/lib/supabase/server";

// Software Factory Control Center data layer (Phase 7). Every query here reads real,
// already-live canonical state (public.canonical_work_orders, public.tasks,
// public.agent_runs, public.agents_with_live_status) - nothing here is mocked or
// simulated. agents_with_live_status computes RUNNING/IDLE/FAILED/UNKNOWN from actual
// agent_runs rows at query time (see supabase/migrations/202608290003), so "Running
// Agents" on the overview is never a stale/fakeable status.

export type FounderNotification = {
  id: string;
  eventType: string;
  severity: string;
  title: string;
  body: string | null;
  workOrderId: string | null;
  agentRunId: string | null;
  status: string;
  actionRequired: boolean;
  resolvedAt: string | null;
  createdAt: string;
};

// founder_notifications (Phase 4 mechanism, surfaced here since Workflow Factory is the
// first real consumer) - founder/admin-only RLS already restricts this to the right
// audience; no company_id on this table by design, it's operator-level, not
// per-company, matching mcp_connectors' own existing scope.
export async function getFounderNotifications(limit = 20): Promise<FounderNotification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("founder_notifications")
    .select("id, event_type, severity, title, body, work_order_id, agent_run_id, status, action_required, resolved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id,
    eventType: n.event_type,
    severity: n.severity,
    title: n.title,
    body: n.body,
    workOrderId: n.work_order_id,
    agentRunId: n.agent_run_id,
    status: n.status,
    actionRequired: n.action_required,
    resolvedAt: n.resolved_at,
    createdAt: n.created_at,
  }));
}

export async function resolveFounderNotification(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_founder_notification", { p_id: id });
  if (error) throw error;
  return data;
}

export async function markFounderNotificationRead(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_founder_notification_read", { p_id: id });
  if (error) throw error;
  return data;
}

export type FactoryOverviewCounts = {
  activeWorkOrders: number;
  runningAgents: number;
  verificationFailures: number;
  waitingApprovals: number;
  releaseReady: number;
  blocked: number;
};

export async function getFactoryOverview(): Promise<FactoryOverviewCounts> {
  const supabase = await createClient();
  const [active, running, failures, waiting, releaseReady, blocked] = await Promise.all([
    supabase
      .from("canonical_work_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "queued", "in_progress"]),
    supabase.from("agents_with_live_status").select("id", { count: "exact", head: true }).eq("live_status", "RUNNING"),
    supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("verification_status", "failed"),
    supabase
      .from("canonical_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_approval"),
    supabase.from("canonical_work_orders").select("id", { count: "exact", head: true }).eq("status", "qa_review"),
    supabase.from("canonical_work_orders").select("id", { count: "exact", head: true }).eq("status", "blocked"),
  ]);
  for (const r of [active, running, failures, waiting, releaseReady, blocked]) {
    if (r.error) throw r.error;
  }
  return {
    activeWorkOrders: active.count ?? 0,
    runningAgents: running.count ?? 0,
    verificationFailures: failures.count ?? 0,
    waitingApprovals: waiting.count ?? 0,
    releaseReady: releaseReady.count ?? 0,
    blocked: blocked.count ?? 0,
  };
}

export type RegisteredAgent = {
  id: string;
  name: string;
  displayName: string | null;
  category: string | null;
  liveStatus: string;
  lastRunId: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  lastRunHeadCommit: string | null;
  definitionPath: string | null;
  definitionHash: string | null;
  executionProvider: string | null;
  hasProductionAuthority: boolean;
  active: boolean;
};

// Only the real, synced Software Factory agents (category is not null) - the
// pre-existing static seed rows (AI Chief of Staff, etc.) are a different, unrelated
// concept and deliberately excluded here.
export async function getRegisteredAgents(): Promise<RegisteredAgent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents_with_live_status")
    .select(
      "id, name, display_name, category, live_status, last_run_id, last_run_at, last_run_status, last_run_summary, last_run_head_commit, definition_path, definition_hash, execution_provider, has_production_authority, active"
    )
    .not("category", "is", null)
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  // id/name are always non-null on a real row (agents.id is the primary key,
  // agents.name is NOT NULL + UNIQUE) - the view types them nullable only because
  // Supabase's generator can't prove that for a view the way it can for a table.
  return (data ?? [])
    .filter((a): a is typeof a & { id: string; name: string } => a.id !== null && a.name !== null)
    .map((a) => ({
      id: a.id,
      name: a.name,
    displayName: a.display_name,
    category: a.category,
    liveStatus: a.live_status ?? "UNKNOWN",
    lastRunId: a.last_run_id,
    lastRunAt: a.last_run_at,
    lastRunStatus: a.last_run_status,
    lastRunSummary: a.last_run_summary,
    lastRunHeadCommit: a.last_run_head_commit,
    definitionPath: a.definition_path,
    definitionHash: a.definition_hash,
    executionProvider: a.execution_provider,
    hasProductionAuthority: a.has_production_authority ?? false,
    active: a.active ?? false,
  }));
}

export type FactoryWorkOrderRow = {
  id: string;
  title: string;
  objective: string | null;
  workType: string;
  status: string;
  priority: string;
  companyId: string;
  companyName: string | null;
  goalId: string | null;
  goalTitle: string | null;
  createdAt: string;
  taskCount: number;
};

export async function getRecentWorkOrders(limit = 20): Promise<FactoryWorkOrderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("canonical_work_orders")
    .select("id, title, objective, work_type, status, priority, company_id, goal_id, created_at, companies(name), goals(title), tasks(id)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((w) => {
    const company = Array.isArray(w.companies) ? w.companies[0] : w.companies;
    const goal = Array.isArray(w.goals) ? w.goals[0] : w.goals;
    return {
      id: w.id,
      title: w.title,
      objective: w.objective,
      workType: w.work_type,
      status: w.status ?? "draft",
      priority: w.priority ?? "medium",
      companyId: w.company_id,
      companyName: company?.name ?? null,
      goalId: w.goal_id,
      goalTitle: goal?.title ?? null,
      createdAt: w.created_at,
      taskCount: Array.isArray(w.tasks) ? w.tasks.length : 0,
    };
  });
}

export type FactoryWorkOrderDetail = FactoryWorkOrderRow & {
  acceptanceCriteria: unknown;
  ownerAgentId: string | null;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    ownerAgentId: string | null;
    createdAt: string | null;
  }>;
  runs: Array<{
    id: string;
    agentId: string | null;
    agentName: string | null;
    status: string;
    branch: string | null;
    headCommit: string | null;
    providerRunId: string | null;
    verificationStatus: string | null;
    summary: string | null;
    createdAt: string;
  }>;
};

export async function getWorkOrderDetail(id: string): Promise<FactoryWorkOrderDetail | null> {
  const supabase = await createClient();
  const { data: wo, error: woError } = await supabase
    .from("canonical_work_orders")
    .select(
      "id, title, objective, work_type, status, priority, company_id, goal_id, owner_agent_id, acceptance_criteria, created_at, companies(name), goals(title)"
    )
    .eq("id", id)
    .maybeSingle();
  if (woError) throw woError;
  if (!wo) return null;

  const [tasksRes, runsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, owner_agent_id, created_at")
      .eq("canonical_work_order_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("agent_runs")
      .select("id, agent_id, status, branch, head_commit, provider_run_id, verification_status, summary, created_at, agents(name)")
      .eq("canonical_work_order_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (runsRes.error) throw runsRes.error;

  const company = Array.isArray(wo.companies) ? wo.companies[0] : wo.companies;
  const goal = Array.isArray(wo.goals) ? wo.goals[0] : wo.goals;

  return {
    id: wo.id,
    title: wo.title,
    objective: wo.objective,
    workType: wo.work_type,
    status: wo.status ?? "draft",
    priority: wo.priority ?? "medium",
    companyId: wo.company_id,
    companyName: company?.name ?? null,
    goalId: wo.goal_id,
    goalTitle: goal?.title ?? null,
    createdAt: wo.created_at,
    taskCount: (tasksRes.data ?? []).length,
    acceptanceCriteria: wo.acceptance_criteria,
    ownerAgentId: wo.owner_agent_id,
    tasks: (tasksRes.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status ?? "queued",
      ownerAgentId: t.owner_agent_id,
      createdAt: t.created_at,
    })),
    runs: (runsRes.data ?? []).map((r) => {
      const agent = Array.isArray(r.agents) ? r.agents[0] : r.agents;
      return {
        id: r.id,
        agentId: r.agent_id,
        agentName: agent?.name ?? null,
        status: r.status ?? "queued",
        branch: r.branch,
        headCommit: r.head_commit,
        providerRunId: r.provider_run_id,
        verificationStatus: r.verification_status,
        summary: r.summary,
        createdAt: r.created_at,
      };
    }),
  };
}
