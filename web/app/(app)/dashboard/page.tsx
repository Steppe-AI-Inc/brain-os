import {
  LayoutDashboard,
  Building2,
  ListChecks,
  ShieldCheck,
  Users,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function getDashboardData() {
  const supabase = await createClient();
  const [companies, tasks, approvals, people, riskCompanies, recentTasks] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("tasks").select("id", { count: "exact", head: true }),
    supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("people").select("id", { count: "exact", head: true }),
    supabase
      .from("companies")
      .select("id, name, risk_score, status")
      .order("risk_score", { ascending: false })
      .limit(5),
    supabase
      .from("tasks")
      .select("id, title, status, priority, created_at, companies(name)")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return {
    companies: companies.count ?? 0,
    tasks: tasks.count ?? 0,
    pendingApprovals: approvals.count ?? 0,
    people: people.count ?? 0,
    riskCompanies: riskCompanies.data ?? [],
    recentTasks: recentTasks.data ?? [],
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardData();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Executive Dashboard"
        description="Real, RLS-scoped counts from Supabase — not local demo data."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Building2} label="Companies" value={stats.companies} accent="amber" />
        <StatCard icon={ListChecks} label="Tasks" value={stats.tasks} accent="cyan" />
        <StatCard
          icon={ShieldCheck}
          label="Pending Approvals"
          value={stats.pendingApprovals}
          accent="rose"
        />
        <StatCard icon={Users} label="People" value={stats.people} accent="green" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Top risk companies
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {stats.riskCompanies.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "active" ? "secondary" : "outline"}>
                    {c.status}
                  </Badge>
                  <span className="w-8 text-right font-mono text-xs text-muted-foreground">
                    {c.risk_score}
                  </span>
                </div>
              </div>
            ))}
            {stats.riskCompanies.length === 0 && (
              <p className="text-sm text-muted-foreground">No companies yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              Recent tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {stats.recentTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.companies?.name ?? "—"}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {(t.status ?? "unknown").replace("_", " ")}
                </Badge>
              </div>
            ))}
            {stats.recentTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
