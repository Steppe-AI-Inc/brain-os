import { Bot, Clock3, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getPersonAssistants } from "@/lib/data/assistants";
import { getPeople } from "@/lib/data/people";
import { getWorkspaces } from "@/lib/data/workspaces";
import { AssistantForm } from "./assistant-form";

export default async function AssistantsPage() {
  const [assistants, people, workspaces] = await Promise.all([
    getPersonAssistants(),
    getPeople(),
    getWorkspaces(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Bot}
        title="Employee AI Assistants"
        description="Each person can have a separately identified AI assistant. Employees can reply themselves; only authorized workspace owners/admins may broaden automation authority."
      />

      <AssistantForm
        workspaces={workspaces}
        people={people.map((p) => ({ id: p.id, full_name: p.full_name, role_title: p.role_title }))}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4" />Paired assistants</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{assistants.length}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4" />Fallback enabled</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {assistants.filter((a: any) => {
              const p = Array.isArray(a.assistant_automation_policies) ? a.assistant_automation_policies[0] : a.assistant_automation_policies;
              return p?.mode === "fallback_after_timeout";
            }).length}
          </CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />Disclosure</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">AI messages are structurally required to be marked as AI-authored.</CardContent>
        </Card>
      </div>

      <Card className="bg-card/80">
        <CardHeader><CardTitle className="text-base">Assistant roster</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {assistants.map((a: any) => {
            const person = Array.isArray(a.people) ? a.people[0] : a.people;
            const policy = Array.isArray(a.assistant_automation_policies) ? a.assistant_automation_policies[0] : a.assistant_automation_policies;
            return (
              <div key={a.id} className="grid gap-3 rounded-xl border border-border/60 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
                <div>
                  <div className="font-medium">{a.display_name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Human: {person?.full_name ?? "Unknown"}{person?.role_title ? ` · ${person.role_title}` : ""}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Automation mode</div>
                  <div className="mt-1 text-sm font-medium capitalize">{String(policy?.mode ?? "unconfigured").replaceAll("_", " ")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Fallback SLA</div>
                  <div className="mt-1 text-sm">{policy?.fallback_sla_minutes ? `${policy.fallback_sla_minutes} min` : "—"}</div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="capitalize">{a.status}</Badge>
                  <Badge variant="secondary">{a.disclosure_label}</Badge>
                </div>
              </div>
            );
          })}
          {assistants.length === 0 && (
            <p className="text-sm text-muted-foreground">No paired assistants yet. Apply the v1 assistant migration and create one above.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div><div className="text-sm font-medium">Human stays first</div><p className="mt-1 text-xs text-muted-foreground">Manual/draft modes never auto-send.</p></div>
          <div><div className="text-sm font-medium">Fallback is policy-bound</div><p className="mt-1 text-xs text-muted-foreground">Timeout takeover only becomes eligible after the configured SLA and still obeys allowed/blocked categories.</p></div>
          <div><div className="text-sm font-medium">Departure ≠ impersonation</div><p className="mt-1 text-xs text-muted-foreground">Terminated/former employment retires the paired assistant; role knowledge remains with the company.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}
