"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Cpu, Plus, ShieldCheck, PackageCheck, Hourglass, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/i18n-context";
import { ageText } from "@/lib/factory/computer-states";
import type { AdminResult } from "@/lib/factory/admin-client";
import {
  addComputer,
  inspectServedInstaller,
  makePolicyStricter,
  type Collection,
  type ComputerList,
  type EnvelopeInput,
  type Policy,
  type Release,
  type Revocations,
  type ServedInstaller,
  type Waiting,
  type WorkItem,
} from "@/lib/data/factory-computers";
import { EnvelopeFields, ReceiptNotice, RefusalNotice, StateBadge, useFactoryAction, type Downloads } from "./shared";

type Props = {
  computers: ComputerList;
  releases: AdminResult<{ releases: Collection<Release>; revocations: Revocations }>;
  policies: AdminResult<{ policies: Policy[] }>;
  waiting: AdminResult<{ waiting: Collection<Waiting> }>;
  work: AdminResult<{ work: Collection<WorkItem> }>;
  downloads: Record<string, Downloads>;
  defaultChannel: "production" | "dev";
};

const short = (s: string | null | undefined, n = 12) => (s ? s.slice(0, n) : "-");

export function ComputersView({ computers, releases, policies, waiting, work, downloads, defaultChannel }: Props) {
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const act = useFactoryAction();
  const col = computers.computers;
  const dl = downloads[defaultChannel] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Cpu}
        title={t("fc.title", "Factory Computers")}
        description={t("fc.description", "Computers enrolled in the Factory, with the states the Factory derives. Every action here is checked by the Factory on the call itself, against your own Brain OS session.")}
        actions={<Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> {t("fc.add", "Add computer")}</Button>}
      />

      {adding && <AddComputer onDone={() => setAdding(false)} act={act} />}
      {act.last && <ReceiptNotice label={act.last.label} result={act.last.result} downloads={dl} />}

      <Card className="border-border/80 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base font-semibold">{t("fc.list", "Computers")}</CardTitle>
          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {Object.entries(computers.counts_by_state).map(([state, n]) => (
              <span key={state} className="inline-flex items-center gap-1"><StateBadge state={state} /> {n}</span>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">
            {t("fc.showing", "Showing")} {col.shown} {t("fc.of", "of")} {col.total} ({col.scope === "all" ? t("fc.inclArchived", "including archived") : t("fc.active", "active")}){col.truncated ? ` - ${t("fc.truncated", "more exist than are shown")}` : ""}
          </div>
          {col.items.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">{t("fc.none", "No computers yet. Add one to issue its pairing code.")}</div>}
          {col.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-normal">{t("fc.col.name", "Computer")}</th>
                    <th className="py-1 pr-3 font-normal">{t("fc.col.state", "State")}</th>
                    <th className="py-1 pr-3 font-normal">{t("fc.col.heartbeat", "Heartbeat (Factory clock)")}</th>
                    <th className="py-1 pr-3 font-normal">{t("fc.col.runtime", "Runtime")}</th>
                    <th className="py-1 pr-3 font-normal">{t("fc.col.envelope", "Envelope")}</th>
                    <th className="py-1 pr-3 font-normal">{t("fc.col.runs", "Runs")}</th>
                  </tr>
                </thead>
                <tbody>
                  {col.items.map((c) => {
                    const p = c.principals.find((x) => x.created_via === "add_computer") ?? c.principals[0];
                    return (
                      <tr key={c.computer_id} className="border-t border-border/60">
                        <td className="py-2 pr-3">
                          <Link className="font-medium hover:underline" href={`/software-factory/computers/${c.computer_id}`}>{c.display_name}</Link>
                          <div className="text-[11px] text-muted-foreground">
                            {p?.runtime?.reported_hostname ? `${t("fc.reportedHost", "reports")} ${p.runtime.reported_hostname}` : short(c.computer_id, 8)}
                            {c.s16a_bound && <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">S-16(a)</Badge>}
                          </div>
                        </td>
                        <td className="py-2 pr-3"><StateBadge state={c.state} /></td>
                        <td className="py-2 pr-3 text-xs">{p?.runtime ? ageText(p.runtime.heartbeat_age_s) : "-"}</td>
                        <td className="py-2 pr-3 text-xs">{p?.runtime?.runtime_version ?? "-"}</td>
                        <td className="py-2 pr-3 text-xs">
                          {c.envelope ? `v${c.envelope.version}: ${c.envelope.roles.join(", ")}; ${c.envelope.max_concurrent_runs} ${t("fc.runsMax", "max")}` : "-"}
                        </td>
                        <td className="py-2 pr-3 text-xs">{c.runs_in_progress}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ReleasesCard releases={releases} downloads={downloads} />
      <WaitingCard waiting={waiting} />
      <WorkCard work={work} />
      <PoliciesCard policies={policies} act={act} />
    </div>
  );
}

function AddComputer({ onDone, act }: { onDone: () => void; act: ReturnType<typeof useFactoryAction> }) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [env, setEnv] = useState<EnvelopeInput>({ roles: ["generic"], max_concurrent_runs: 1, max_heavy: 1 });
  const [bind, setBind] = useState(false);
  return (
    <Card className="border-primary/25 shadow-none">
      <CardHeader><CardTitle className="text-base font-semibold">{t("fc.add", "Add computer")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Label className="text-xs">{t("fc.displayName", "Display name (a label - it grants nothing)")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Build PC 3" maxLength={120} />
        </div>
        <EnvelopeFields value={env} onChange={setEnv} />
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={bind} onChange={(e) => setBind(e.target.checked)} />
          {t("fc.bindS16a", "Bind milestone restriction S-16(a) to this computer (add-only; it cannot be unbound or moved)")}
        </label>
        <div className="flex gap-2">
          <Button size="sm" disabled={act.pending || !name.trim() || env.roles.length === 0}
            onClick={() => act.run(t("fc.add", "Add computer"), async () => { const r = await addComputer({ display_name: name.trim(), envelope: env, bind_s16a: bind }); if (r.ok) onDone(); return r; })}>
            {act.pending ? t("fc.working", "Working...") : t("fc.addIssue", "Add and issue the pairing code")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>{t("fc.cancel", "Cancel")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReleasesCard({ releases, downloads }: { releases: Props["releases"]; downloads: Props["downloads"] }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  const [served, setServed] = useState<Record<string, AdminResult<ServedInstaller>>>({});
  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><PackageCheck className="h-4 w-4" /> {t("fc.releases", "Releases and the installer")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!releases.ok && <RefusalNotice result={releases} />}
        {releases.ok && (
          <>
            <div className="text-xs text-muted-foreground">
              {t("fc.installerPublic", "The installer is public (no login); it holds no secret. The pairing code is the control. The digest is the PE Authenticode image hash the runtime verifies before anything runs.")}
            </div>
            {releases.releases.items.length === 0 && <div className="text-muted-foreground">{t("fc.noReleases", "No release is published on this plane. Before the founder's release-signing key is provisioned (C-3), no production release exists.")}</div>}
            {releases.releases.items.map((r) => {
              const d = r.state === "published" ? downloads[r.channel] : null;
              const s = served[r.release_id];
              return (
                <div key={r.release_id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.channel} {r.version}</span>
                    <Badge variant="outline" className={r.state === "published" ? "border-chart-2/30 bg-chart-2/15 text-chart-2" : r.state === "revoked" ? "border-destructive/30 bg-destructive/15 text-destructive" : ""}>{r.state}</Badge>
                    <span className="text-xs text-muted-foreground">{t("fc.digest", "digest")} <code>{short(r.digest, 16)}</code> - {t("fc.signedBy", "signed by")} <code>{short(r.key_id, 28)}</code></span>
                  </div>
                  {d && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      <a className="text-primary underline" href={d.installer}>BrainFactorySetup.exe</a>
                      <a className="text-primary underline" href={d.manifest}>BrainFactorySetup.manifest.json</a>
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { const x = await inspectServedInstaller(r.release_id); setServed((m) => ({ ...m, [r.release_id]: x })); })}>
                        {t("fc.checkServed", "Check the served file")}
                      </Button>
                    </div>
                  )}
                  {s && !s.ok && <div className="mt-2"><RefusalNotice result={s} /></div>}
                  {s && s.ok && (
                    <div className="mt-2 grid gap-0.5 text-xs">
                      <div>{t("fc.servedSha", "sha256 of the file as served")}: <code>{s.sha256}</code> ({s.bytes} bytes)</div>
                      <div>{t("fc.servedDigest", "its digest")}: <code>{s.image_hash}</code> - {s.image_hash_matches_release ? t("fc.matches", "equals the published release digest") : t("fc.mismatch", "DOES NOT equal the published release digest")}</div>
                      <div>{t("fc.authenticode", "Authenticode certificate table")}: {s.authenticode_certificate_table ? t("fc.present", "present (Windows validates it on the computer)") : t("fc.absent", "absent - unsigned; Windows SmartScreen may warn")}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {(releases.revocations.key_ids.length > 0 || releases.revocations.releases.length > 0) && (
              <div className="text-xs text-muted-foreground">
                {t("fc.revocations", "Revoked")}: {releases.revocations.key_ids.map((k) => `key ${short(k, 24)}`).concat(releases.revocations.releases.map((x) => `release ${short(x.digest, 12)}`)).join(", ")}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WaitingCard({ waiting }: { waiting: Props["waiting"] }) {
  const { t } = useT();
  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><Hourglass className="h-4 w-4" /> {t("fc.waiting", "Waiting for independent verification")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {!waiting.ok && <RefusalNotice result={waiting} />}
        {waiting.ok && (
          <>
            <div className="text-xs text-muted-foreground">{t("fc.showing", "Showing")} {waiting.waiting.shown} {t("fc.of", "of")} {waiting.waiting.total}{waiting.waiting.truncated ? ` - ${t("fc.truncated", "more exist than are shown")}` : ""}</div>
            {waiting.waiting.items.length === 0 && <div className="text-muted-foreground">{t("fc.noWaiting", "Nothing is waiting for verification.")}</div>}
            {waiting.waiting.items.map((w) => (
              <div key={w.work_order.work_order_id} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{w.work_order.title}</span>
                  <Badge variant="outline">{w.state}</Badge>
                  <span className="text-xs text-muted-foreground">{t("fc.eligibleVerifiers", "eligible verifiers")}: {w.eligible_verifiers}</span>
                </div>
                {w.reason && <div className="mt-1 text-xs text-muted-foreground">{w.reason}</div>}
                {w.eligible_verifiers === 0 && w.nodes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {w.nodes.map((n) => (
                      <li key={n.node_id}><code>{short(n.node_id, 17)}</code>: {n.first_failing_gate ? `${t("fc.gate", "gate")} ${n.first_failing_gate.gate} ${n.first_failing_gate.gate_name} - ${n.first_failing_gate.detail}` : t("fc.eligible", "eligible")}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WorkCard({ work }: { work: Props["work"] }) {
  const { t } = useT();
  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><ListChecks className="h-4 w-4" /> {t("fc.work", "Work")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {!work.ok && <RefusalNotice result={work} />}
        {work.ok && (
          <>
            <div className="text-xs text-muted-foreground">{t("fc.showing", "Showing")} {work.work.shown} {t("fc.of", "of")} {work.work.total}{work.work.truncated ? ` - ${t("fc.truncated", "more exist than are shown")}` : ""}</div>
            {work.work.items.length === 0 && <div className="text-muted-foreground">{t("fc.noWork", "No Factory work orders yet.")}</div>}
            {work.work.items.map((w) => (
              <div key={w.work_order_id} className="flex flex-wrap items-center gap-2 border-t border-border/60 py-1.5">
                <span className="font-medium">{w.title}</span>
                <Badge variant="outline">{w.status}</Badge>
                {w.verification_state && <Badge variant="outline">{w.verification_state}</Badge>}
                <span className="text-xs text-muted-foreground">{t("fc.priority", "priority")} {w.priority} - {w.runs.length} {t("fc.runsWord", "run(s)")}{w.runs.length ? `: ${w.runs.map((r) => `${r.kind} ${r.status}`).join(", ")}` : ""}</span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const POLICY_FIELDS: [keyof Policy & string, string][] = [
  ["require_distinct_run", "the certifying run is not an authoring run"],
  ["require_distinct_identity", "the certifying identity is none of the authoring identities"],
  ["require_verifier_authority", "the certifier holds verifier authority now"],
  ["require_physical_separation", "a different enrolled computer with no shared fingerprint"],
  ["restrict_bound_computer_authoring", "the S-16(a) computer authors only Director-document paths"],
];

function PoliciesCard({ policies, act }: { policies: Props["policies"]; act: ReturnType<typeof useFactoryAction> }) {
  const { t } = useT();
  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="h-4 w-4" /> {t("fc.policies", "Verification policies")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!policies.ok && <RefusalNotice result={policies} />}
        {policies.ok && (
          <>
            <div className="text-xs text-muted-foreground">{t("fc.policyNote", "A policy can only be made stricter here. The independence floor (S-13) is enforced by the Factory whatever a policy says. Campaign rows belong to the Director and are read-only.")}</div>
            {policies.policies.map((p) => (
              <div key={p.policy_id} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.scope}{p.campaign_key ? `: ${p.campaign_key}` : ""}</span>
                  <Badge variant="outline">v{p.version}</Badge>
                  {p.frozen && <Badge variant="outline">{t("fc.directorOwned", "Director-owned (read-only)")}</Badge>}
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {POLICY_FIELDS.map(([k, text]) => (
                    <li key={k} className="flex flex-wrap items-center gap-2">
                      <span className={p[k] ? "text-chart-2" : "text-muted-foreground"}>{p[k] ? t("fc.required", "required") : t("fc.notRequired", "not required")}</span>
                      <span>{t(`fc.policy.${k}`, text)}</span>
                      {!p.frozen && !p[k] && (
                        <Button size="xs" variant="outline" disabled={act.pending}
                          onClick={() => act.run(t("fc.makeStricter", "Make stricter"), () => makePolicyStricter(p.policy_id, p.version, { [k]: true }))}>
                          {t("fc.require", "Require")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
