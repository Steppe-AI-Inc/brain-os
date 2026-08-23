import { Code2 } from "lucide-react";
import { getProductSpecs, getSoftwareTickets } from "@/lib/data/software";
import { getCompanies } from "@/lib/data/companies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { SpecCreateForm } from "./spec-create-form";

export default async function SoftwarePage() {
  const [specs, tickets, companies] = await Promise.all([
    getProductSpecs(),
    getSoftwareTickets(),
    getCompanies(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Code2} title="Software Factory" description="PRDs + patch-only engineering tickets." />
      <SpecCreateForm companies={companies} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">PRDs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {specs.map((s) => (
              <div key={s.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.title}</span>
                  <Badge variant="secondary">{s.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.companies?.name ?? "Parent"}</p>
              </div>
            ))}
            {specs.length === 0 && <p className="text-sm text-muted-foreground">No PRDs yet.</p>}
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">Engineering tickets</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {tickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                <span>{t.title}</span>
                <Badge variant="outline" className="capitalize">
                  {(t.status ?? "queued").replace("_", " ")}
                </Badge>
              </div>
            ))}
            {tickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
