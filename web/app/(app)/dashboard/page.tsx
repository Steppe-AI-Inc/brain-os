import Link from "next/link";
import {
  LayoutDashboard,
  Target,
  ShieldAlert,
  Activity,
  Building2,
  Bot,
  BrainCircuit,
  Network,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAttentionItems } from "@/lib/data/attention";
import { getActiveAgents } from "@/lib/data/agents";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GOAL_STATUS_DOT } from "@/lib/goals/classify";

// Overnight multi-org milestone: activeOrganizationId scopes the goal/approval/work-order
// counts and the live-goals list to the currently selected organization when set, same
// pattern as getPeople() in lib/data/people.ts — a query-shape filter only, RLS remains
// the sole authorization boundary either way. "Active Companies" stays a global,
// platform-wide figure regardless of active org — it counts real companies, not
// something a single org's context could meaningfully re-scope.
async function getDashboardData(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  const since14d = new Date(Date.now() - 14 * 86_400_000).toISOString();

  let activeGoalsQuery = supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "active");
  let pendingApprovalsQuery = supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending");
  let recentRunsQuery = supabase.from("work_orders").select("id", { count: "exact", head: true }).gte("created_at", since14d);
  let liveGoalsQuery = supabase
    .from("goals")
    .select("id, title, status, kind, progress, companies(name, status)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(6);
  if (activeOrganizationId) {
    activeGoalsQuery = activeGoalsQuery.eq("company_id", activeOrganizationId);
    pendingApprovalsQuery = pendingApprovalsQuery.eq("company_id", activeOrganizationId);
    recentRunsQuery = recentRunsQuery.eq("company_id", activeOrganizationId);
    liveGoalsQuery = liveGoalsQuery.eq("company_id", activeOrganizationId);
  }

  const [activeGoals, pendingApprovals, recentRuns, companies, liveGoals, attention, agents] =
    await Promise.all([
      activeGoalsQuery,
      pendingApprovalsQuery,
      recentRunsQuery,
      // No `head: true` here (unlike the other counts above) — this one was
      // observed returning count: null with no error on production, the known
      // failure mode when a HEAD response's Content-Range header goes missing.
      // Fetching actual id rows sidesteps that; .length is the real source of truth.
      //
      // BUG-003 (Work-PC QA campaign C001): this count had no status filter at all,
      // so it counted archived companies too - 18 shown when only 8 were actually
      // active, overstating by 125%, and the figure didn't move when a company was
      // archived. getCompanies() (web/lib/data/companies.ts), the authoritative
      // /companies list this KPI is supposed to summarize, already excludes
      // archived - matched here for the same reason: a headline number must equal
      // its own authoritative list, not a different, undocumented definition of it.
      supabase.from("companies").select("id", { count: "exact" }).neq("status", "archived"),
      liveGoalsQuery,
      getAttentionItems(),
      getActiveAgents(),
    ]);

  return {
    activeGoals: activeGoals.count ?? 0,
    pendingApprovals: pendingApprovals.count ?? 0,
    recentRuns: recentRuns.count ?? 0,
    companies: companies.data?.length ?? companies.count ?? 0,
    liveGoals: liveGoals.data ?? [],
    attention,
    agents,
  };
}

const ATTENTION_LABEL: Record<string, string> = {
  approval: "Approval",
  decision: "Decision",
  blocked: "Blocked",
};

export default async function DashboardPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const stats = await getDashboardData(scopeToActiveOrg);
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={LayoutDashboard}
        title={`Good ${timeOfDay}.`}
        description={
          organizations.activeOrganizationName && scopeToActiveOrg
            ? `What's moving in ${organizations.activeOrganizationName} — right now.`
            : "What's moving, what needs you, and who's working on it — right now."
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Target} label="Active goals" value={stats.activeGoals} accent="amber" />
        <StatCard
          icon={ShieldAlert}
          label="Decisions waiting"
          value={stats.pendingApprovals}
          accent="rose"
        />
        <StatCard icon={Activity} label="Runs (14d)" value={stats.recentRuns} accent="cyan" />
        <StatCard icon={Building2} label="Active Companies" value={stats.companies} accent="violet" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Wants your attention</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {stats.attention.map((item) => (
                <Link
                  key={`${item.kind}-${item.id}`}
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  <span className="min-w-0 truncate">{item.title}</span>
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {ATTENTION_LABEL[item.kind]}
                  </Badge>
                </Link>
              ))}
              {stats.attention.length === 0 && (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  Nothing waiting on you right now.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Active goals</CardTitle>
              <Link
                href="/goals"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {stats.liveGoals.map((g) => (
                <Link
                  key={g.id}
                  href={`/goals/${g.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GOAL_STATUS_DOT[g.status]}`} />
                  <span className="min-w-0 flex-1 truncate">{g.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {g.companies?.name ?? "—"}
                  </span>
                </Link>
              ))}
              {stats.liveGoals.length === 0 && (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  No active goals yet — start one from the Goals page.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Live now</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {stats.agents.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.role}</div>
                  </div>
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2" />
                </div>
              ))}
              {stats.agents.length === 0 && (
                <p className="text-sm text-muted-foreground">No active agents yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Company brain</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <Link
                href="/memory"
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-secondary"
              >
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                Memory
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </Link>
              <Link
                href="/mindmap"
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-secondary"
              >
                <Network className="h-4 w-4 text-muted-foreground" />
                Operating mindmap
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
