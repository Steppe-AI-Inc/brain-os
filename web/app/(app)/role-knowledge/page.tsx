import Link from "next/link";
import { BookOpenCheck, FileWarning, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getCompanies } from "@/lib/data/companies";
import { getCertifications, getKnowledgePacks } from "@/lib/data/role-knowledge";
import { getWorkspaces } from "@/lib/data/workspaces";
import { KnowledgePackForm } from "./knowledge-pack-form";

export default async function RoleKnowledgePage() {
  const [packs, certifications, workspaces, companies] = await Promise.all([
    getKnowledgePacks(),
    getCertifications(),
    getWorkspaces(),
    getCompanies(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BookOpenCheck}
        title="Role Knowledge & Certification"
        description="Senior people document the role once; Brain OS trains from approved company knowledge. Higher authority is unlocked by evidence and tests, not tenure alone."
      />

      <KnowledgePackForm workspaces={workspaces} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <Card className="bg-card/80">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Role knowledge packs</CardTitle>
            <Link href="/documents" className="text-xs font-medium text-muted-foreground underline">Upload artifacts</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {packs.map((pack) => {
              const editableRequired = (pack.requirements ?? []).filter((r) => r.editable_source_required).length;
              return (
                <div key={pack.id} className="rounded-xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{pack.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {pack.role_title} · Level {pack.level} · pass ≥ {pack.required_score}%
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">{pack.status}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {(pack.requirements ?? []).map((req) => (
                      <div key={req.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                        <span>{req.title}</span>
                        {req.editable_source_required && <Badge variant="secondary">editable source</Badge>}
                      </div>
                    ))}
                  </div>
                  {editableRequired > 0 && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-600">
                      <FileWarning className="h-3.5 w-3.5" />
                      PDF-only delivery is not sufficient for {editableRequired} requirement{editableRequired === 1 ? "" : "s"}.
                    </div>
                  )}
                </div>
              );
            })}
            {packs.length === 0 && <p className="text-sm text-muted-foreground">No role packs yet. Create the first role pack above.</p>}
          </CardContent>
        </Card>

        <Card className="bg-card/80">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4" />Certification</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {certifications.map((c: any) => (
              <div key={c.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="font-medium">{Array.isArray(c.people) ? c.people[0]?.full_name : c.people?.full_name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{Array.isArray(c.role_knowledge_packs) ? c.role_knowledge_packs[0]?.title : c.role_knowledge_packs?.title}</div>
                <div className="mt-2 flex items-center justify-between">
                  <Badge variant="outline" className="capitalize">{c.status}</Badge>
                  <span className="text-xs">{c.score == null ? "Not tested" : `${c.score}%`}</span>
                </div>
              </div>
            ))}
            {certifications.length === 0 && <p className="text-sm text-muted-foreground">No certification attempts yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
