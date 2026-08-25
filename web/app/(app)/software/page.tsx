/* eslint-disable @typescript-eslint/no-explicit-any */
import { Code2, ExternalLink, ShieldCheck } from "lucide-react";
import { getProductSpecs, getSoftwareFactoryRuns, getSoftwareTickets } from "@/lib/data/software";
import { getCompanies } from "@/lib/data/companies";
import { getWorkspaces } from "@/lib/data/workspaces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { SpecCreateForm } from "./spec-create-form";
import { SpecsList } from "./specs-list";
import { FactoryRunForm } from "./factory-run-form";

export default async function SoftwarePage() {
  const [specs, tickets, companies, workspaces, runs] = await Promise.all([
    getProductSpecs(),
    getSoftwareTickets(),
    getCompanies(),
    getWorkspaces(),
    getSoftwareFactoryRuns(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Code2}
        title="Software Factory"
        description="Product brief → PRD → architecture/RLS → implementation → tests → Vercel preview → autonomous QA → human release approval."
      />

      <FactoryRunForm workspaces={workspaces} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-3">
          <div>
            <div className="text-sm font-medium">Acceptance product</div>
            <p className="mt-1 text-xs text-muted-foreground">Mongolia HOA OS is the first real factory benchmark: billing, resident accounts, payments, transparent finance, maintenance, RLS and mobile flows.</p>
          </div>
          <div>
            <div className="text-sm font-medium">No fake completion</div>
            <p className="mt-1 text-xs text-muted-foreground">A run is not "done" because tickets exist. Repository commits, tests, preview URL, QA evidence and release approval are explicit stages.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />Production gate</div>
            <p className="mt-1 text-xs text-muted-foreground">Production deployment remains approval-gated even when coding and QA are automated.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80">
        <CardHeader><CardTitle className="text-base">Production runs</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {runs.map((run: any) => {
            const stages = run.software_factory_stages ?? [];
            const passed = stages.filter((s: any) => s.status === "passed").length;
            return (
              <div key={run.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{run.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {run.template_key ? `Template: ${run.template_key.replaceAll("_", " ")} · ` : ""}
                      Stage: {String(run.current_stage || "planning").replaceAll("_", " ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{String(run.status).replaceAll("_", " ")}</Badge>
                    <span className="text-xs text-muted-foreground">{passed}/{stages.length} passed</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  {stages.map((stage: any) => (
                    <div key={stage.id} className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                      <div className="truncate text-xs font-medium">{String(stage.stage_key).replaceAll("_", " ")}</div>
                      <div className="mt-1 text-[11px] capitalize text-muted-foreground">{String(stage.status).replaceAll("_", " ")}</div>
                    </div>
                  ))}
                </div>

                {(run.repository_url || run.preview_url) && (
                  <div className="mt-4 flex flex-wrap gap-3 text-xs">
                    {run.repository_url && <a className="flex items-center gap-1 underline" href={run.repository_url} target="_blank" rel="noreferrer">Repository <ExternalLink className="h-3 w-3" /></a>}
                    {run.preview_url && <a className="flex items-center gap-1 underline" href={run.preview_url} target="_blank" rel="noreferrer">Vercel preview <ExternalLink className="h-3 w-3" /></a>}
                  </div>
                )}
              </div>
            );
          })}
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No v1 factory runs yet. Apply the migration, then start the HOA preset or a custom product above.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader><CardTitle className="text-base">PRDs / product specs</CardTitle></CardHeader>
          <CardContent>
            <SpecCreateForm companies={companies} />
            <div className="mt-4"><SpecsList specs={specs} /></div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader><CardTitle className="text-base">Engineering & planning tickets</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {tickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.source}</div>
                </div>
                <Badge variant="outline" className="capitalize">{(t.status ?? "queued").replace("_", " ")}</Badge>
              </div>
            ))}
            {tickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
