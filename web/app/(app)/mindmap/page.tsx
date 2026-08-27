import { Network } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { MindmapView } from "@/components/mindmap-view";
import { PageHeader } from "@/components/page-header";
import type { Graph, GraphNode, GraphEdge } from "@/lib/mindmap/graph";

async function buildGraph(): Promise<Graph> {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [companies, projects, people, tasks, approvals, agents] = await Promise.all([
    supabase.from("companies").select("id, name, legal_entity_name, risk_score"),
    supabase.from("projects").select("id, title, status, risk_score, company_id"),
    supabase.from("people").select("id, full_name, role_title, company_id"),
    supabase
      .from("tasks")
      .select("id, title, status, risk_level, company_id, project_id, owner_person_id, owner_agent_id")
      .limit(24),
    supabase.from("approvals").select("id, title, status, risk_level, company_id, task_id").eq("status", "pending").limit(10),
    supabase.from("agents").select("id, name, role").eq("active", true).limit(12),
  ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  function add(id: string, label: string, type: GraphNode["type"], extra: Partial<GraphNode> = {}) {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({ id, label, type, ...extra });
  }
  function edge(from: string | null | undefined, to: string, label: string) {
    if (!from || !nodeIds.has(from) || !nodeIds.has(to)) return;
    edges.push({ from, to, label });
  }

  add("center", profile?.role === "founder" ? "SEM Technologies Brain" : "My Operating Brain", "center", {
    sub: profile?.role,
  });

  (companies.data ?? []).forEach((c) => {
    add(c.id, c.name, "company", { sub: c.legal_entity_name ?? "company", risk: c.risk_score });
    edge("center", c.id, "owns/manages");
  });
  (projects.data ?? []).forEach((p) => {
    add(p.id, p.title, "project", { sub: p.status ?? undefined, risk: p.risk_score });
    edge(p.company_id, p.id, "project");
  });
  (people.data ?? []).forEach((p) => {
    add(p.id, p.full_name, "person", { sub: p.role_title ?? "person" });
    edge(p.company_id, p.id, "team");
  });
  (agents.data ?? []).forEach((a) => {
    add(a.id, a.name, "agent", { sub: a.role });
    edge("center", a.id, "digital worker");
  });
  (tasks.data ?? []).forEach((t) => {
    add(t.id, t.title, "task", { sub: t.status ?? undefined, risk: t.risk_level });
    edge(t.project_id ?? t.company_id, t.id, "task");
    if (t.owner_person_id) edge(t.id, t.owner_person_id, "human owner");
    if (t.owner_agent_id) edge(t.owner_agent_id, t.id, "AI owner");
  });
  (approvals.data ?? []).forEach((a) => {
    add(a.id, a.title, "approval", { sub: a.status ?? undefined, risk: a.risk_level });
    edge(a.task_id ?? "center", a.id, "needs approval");
  });

  return { nodes, edges };
}

export default async function MindmapPage() {
  const graph = await buildGraph();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Network}
        title="Operating Mindmap"
        description="How your companies, projects, people, and work all connect."
      />
      <MindmapView graph={graph} />
    </div>
  );
}
