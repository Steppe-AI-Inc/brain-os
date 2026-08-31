import { notFound } from "next/navigation";
import Link from "next/link";
import { PackageSearch, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPluginComponentDetail } from "@/lib/data/plugins";
import { createClient } from "@/lib/supabase/server";
import { ActionsPanel } from "./actions-panel";

// Phase 6 — plugin/skill component detail page: Source/Provenance, Installation,
// Agent Attachments (with real runtime-use evidence), Permissions, Security Review,
// Update/Rollback History, and governed actions. Worker Deployments intentionally not
// shown per-component here — see /software-factory/workers for the real worker
// registry (a component's presence there, not here, is the source of truth for "is
// this actually deployed to a machine").

export default async function PluginDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const component = await getPluginComponentDetail(id);
  if (!component) notFound();

  const supabase = await createClient();
  const { data: agents } = await supabase.from("agents").select("id, name").eq("active", true).order("name");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/software-factory/plugins" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to registry
      </Link>
      <PageHeader
        icon={PackageSearch}
        title={component.displayName ?? component.slug}
        description={`${component.componentType} · ${component.source?.githubOwner}/${component.source?.githubRepo}`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Source / Provenance</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Repository" value={component.source ? `${component.source.githubOwner}/${component.source.githubRepo}` : "—"} />
              <Field label="License" value={component.source?.license ?? "—"} />
              <Field label="Pinned SHA" value={component.source?.pinnedCommitSha ?? "—"} mono />
              <Field label="Latest upstream SHA" value={component.source?.latestUpstreamSha ?? "—"} mono />
              <Field label="Update available" value={component.source?.updateAvailable ? "Yes" : "No"} />
              <Field label="Trust status" value={component.source?.trustStatus ?? "—"} />
              <Field label="Definition path" value={component.definitionPath ?? "—"} mono />
              <Field label="Definition hash" value={component.definitionHash ?? "—"} mono />
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Installation</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Lifecycle status" value={component.installStatus.replace(/_/g, " ")} />
              <Field label="Enabled" value={component.enabled ? "Yes" : "No"} />
              <Field label="Installed version" value={component.installedVersion ?? "—"} />
              <Field label="License review" value={component.licenseReviewStatus} />
              <Field label="Security review" value={component.securityReviewStatus} />
            </CardContent>
            {component.securityReviewNotes && (
              <CardContent className="pt-0 text-xs text-muted-foreground">{component.securityReviewNotes}</CardContent>
            )}
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Permissions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {component.permissionProfile.length === 0 && (
                <span className="text-sm text-muted-foreground">No elevated permissions requested (least-privilege default).</span>
              )}
              {component.permissionProfile.map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Runtime Usage</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {component.recentRuntimeUse.length === 0 && (
                <p className="text-muted-foreground">No real dispatched Agent Run has used this exact definition_hash yet.</p>
              )}
              {component.recentRuntimeUse.map((r) => (
                <div key={r.agentRunId} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{r.providerRunId ?? r.agentRunId.slice(0, 8)}</span>
                  <Badge variant="outline" className="capitalize">
                    {r.status}
                  </Badge>
                  <span className="text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Update / Rollback History (append-only)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {component.versions.length === 0 && <p className="text-muted-foreground">No version history yet.</p>}
              {component.versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                  <Badge variant="outline" className="capitalize">
                    {v.recordedReason.replace(/_/g, " ")}
                  </Badge>
                  <span className="font-mono">{v.pinnedCommitSha?.slice(0, 12) ?? "—"}</span>
                  <span className="font-mono">{v.definitionHash?.slice(0, 12) ?? "—"}</span>
                  <span className="text-muted-foreground">{new Date(v.recordedAt).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Agent Attachments</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {component.attachedAgents.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
              {component.attachedAgents.map((a) => (
                <Badge key={a.agentId} variant="outline">
                  {a.name}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Governed Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionsPanel component={component} agentOptions={agents ?? []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
