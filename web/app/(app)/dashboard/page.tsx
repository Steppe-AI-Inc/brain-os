import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function getStats() {
  const supabase = await createClient();
  const [companies, tasks, approvals, people] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("tasks").select("id", { count: "exact", head: true }),
    supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("people").select("id", { count: "exact", head: true }),
  ]);
  return {
    companies: companies.count ?? 0,
    tasks: tasks.count ?? 0,
    pendingApprovals: approvals.count ?? 0,
    people: people.count ?? 0,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const tiles = [
    { label: "Companies", value: stats.companies },
    { label: "Tasks", value: stats.tasks },
    { label: "Pending Approvals", value: stats.pendingApprovals },
    { label: "People", value: stats.people },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Executive Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="bg-card/80 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{tile.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        These are real, RLS-scoped counts from Supabase — not local demo data.
      </p>
    </div>
  );
}
