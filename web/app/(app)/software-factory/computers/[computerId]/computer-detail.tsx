"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/i18n-context";
import { ageText } from "@/lib/factory/computer-states";
import {
  adoptRelease,
  amendEnvelope,
  archiveComputer,
  createPrincipal,
  issueCode,
  repair,
  requestRotation,
  restoreComputer,
  revokeCode,
  revokeCredential,
  setDrain,
  type ComputerDetail as Detail,
  type EnvelopeInput,
  type Principal,
  type Release,
} from "@/lib/data/factory-computers";
import { ConfirmButton, EnvelopeFields, ReceiptNotice, StateBadge, useFactoryAction, type Downloads } from "../shared";

const short = (s: string | null | undefined, n = 12) => (s ? s.slice(0, n) : "-");

export function ComputerDetail({ detail, releases, downloads }: { detail: Detail; releases: Release[]; downloads: Downloads }) {
  const { t } = useT();
  const act = useFactoryAction();
  const c = detail.computer;
  const archived = c.state === "ARCHIVED";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/software-factory/computers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("fc.back", "All computers")}
      </Link>
      <PageHeader
        icon={Cpu}
        title={c.display_name}
        description={`${t("fc.computerId", "Computer")} ${c.computer_id} - ${t("fc.added", "added")} ${new Date(c.created_at).toLocaleString()}`}
        actions={<StateBadge state={c.state} />}
      />
      {act.last && <ReceiptNotice label={act.last.label} result={act.last.result} downloads={downloads} />}

      <Card className="border-border/80 shadow-none">
        <CardHeader><CardTitle className="text-base font-semibold">{t("fc.actions", "Actions")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {!archived && (c.draining
            ? <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.resume", "Resume"), () => setDrain(c.computer_id, false))}>{t("fc.resume", "Resume")}</Button>
            : <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.drain", "Drain"), () => setDrain(c.computer_id, true))}>{t("fc.drain", "Drain")}</Button>)}
          {!archived && <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.createPrincipal", "Create an agent principal"), () => createPrincipal(c.computer_id))}>{t("fc.createPrincipal", "Create an agent principal")}</Button>}
          {archived
            ? <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.restore", "Restore (re-pair)"), () => restoreComputer(c.computer_id))}>{t("fc.restore", "Restore (re-pair)")}</Button>
            : <ConfirmButton label={t("fc.archive", "Archive")} confirmLabel={t("fc.archiveConfirm", "Archive: revoke every credential and stop all work")} disabled={act.pending} onConfirm={() => act.run(t("fc.archive", "Archive"), () => archiveComputer(c.computer_id))} />}
          {!archived && releases.length > 0 && <AdoptRelease computerId={c.computer_id} adopted={c.adopted_release_id} releases={releases} act={act} />}
        </CardContent>
      </Card>

      {c.principals.map((p) => <PrincipalCard key={p.principal_id} computerId={c.computer_id} p={p} archived={archived} act={act} serverTime={c.server_time} />)}

      <EnvelopeCard detail={detail} act={act} archived={archived} />

      <Card className="border-border/80 shadow-none">
        <CardHeader><CardTitle className="text-base font-semibold">{t("fc.identity", "Machine evidence (descriptive; it never grants)")}</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-xs">
          <div>{t("fc.registeredFp", "Registered fingerprint")}: <code>{c.registered_fingerprint ?? "-"}</code></div>
          <div>{t("fc.allFp", "Every fingerprint reported")}: {c.fingerprints.length ? c.fingerprints.map((f) => <code key={f} className="mr-2">{short(f, 16)}</code>) : "-"}</div>
          <div>S-16(a): {c.s16a_bound ? `${t("fc.bound", "bound")} ${c.s16a_bound_at ? new Date(c.s16a_bound_at).toLocaleString() : ""}` : t("fc.notBound", "not bound")}</div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-none">
        <CardHeader><CardTitle className="text-base font-semibold">{t("fc.audit", "Audit (latest 50)")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {detail.audit.map((a, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1 pr-3 whitespace-nowrap">{new Date(a.at).toLocaleString()}</td>
                  <td className="py-1 pr-3">{a.actor_kind}</td>
                  <td className="py-1 pr-3 font-medium">{a.action}</td>
                  <td className="py-1 pr-3">{a.outcome}{a.reason ? ` (${a.reason})` : ""}</td>
                </tr>
              ))}
              {detail.audit.length === 0 && <tr><td className="py-2 text-muted-foreground">{t("fc.noAudit", "No audit events.")}</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function PrincipalCard({ computerId, p, archived, act, serverTime }: { computerId: string; p: Principal; archived: boolean; act: ReturnType<typeof useFactoryAction>; serverTime: string }) {
  const { t } = useT();
  const target = { computer_id: computerId, principal_id: p.principal_id };
  const cred = p.credential;
  const liveCode = p.code && ["PAIRING_CODE_ISSUED", "PAIRING_STARTED"].includes(p.code.state) && new Date(p.code.expires_at).getTime() > new Date(serverTime).getTime(); // the Factory's clock, as read with this page
  const r = p.runtime;
  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base font-semibold">{t("fc.principal", "Agent principal")} <code className="text-sm">{p.node_id}</code></CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">{p.created_via === "add_computer" ? t("fc.firstPrincipal", "the computer's first principal") : t("fc.extraPrincipal", "created by an admin action")} - {new Date(p.created_at).toLocaleString()}</div>
        </div>
        <StateBadge state={p.state} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs">
        <div className="grid gap-1 sm:grid-cols-2">
          <div>{t("fc.credential", "Credential")}: {cred ? <>{cred.status} <code>{short(cred.key_thumbprint, 16)}</code> ({cred.issued_via}, {new Date(cred.issued_at).toLocaleString()}){cred.rotation_requested ? ` - ${t("fc.rotationRequested", "rotation requested")}` : ""}{cred.revoke_reason ? ` - ${cred.revoke_reason}` : ""}</> : "-"}</div>
          <div>{t("fc.pairingCode", "Pairing code")}: {p.code ? `${p.code.state} (${p.code.purpose}; ${t("fc.expiresAt", "expires")} ${new Date(p.code.expires_at).toLocaleTimeString()}; ${p.code.failed_attempts} ${t("fc.failedAttempts", "failed attempts")})` : "-"}</div>
          <div>{t("fc.enrollment", "Enrollment")}: {p.enrollment_state ?? "-"}</div>
          <div>{t("fc.heartbeat", "Heartbeat")}: {r ? `${r.liveness}, ${ageText(r.heartbeat_age_s)} (${t("fc.factoryClock", "Factory clock")})` : "-"}</div>
          <div>{t("fc.runtimeVersion", "Runtime")}: {r?.runtime_version ?? "-"} <code>{short(r?.runtime_digest, 16)}</code></div>
          <div>{t("fc.reported", "Reports")}: {r ? `${r.reported_hostname ?? "-"} / ${r.reported_os ?? "-"}` : "-"}</div>
          {r?.reported_resources && <div className="sm:col-span-2">{t("fc.resources", "Resources")}: <code>{JSON.stringify(r.reported_resources).slice(0, 200)}</code></div>}
        </div>
        {!archived && (
          <div className="flex flex-wrap gap-2">
            {cred?.status === "active" && <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.rotate", "Request key rotation"), () => requestRotation(target))}>{t("fc.rotate", "Request key rotation")}</Button>}
            {cred?.status === "active" && <ConfirmButton label={t("fc.revoke", "Revoke credential")} confirmLabel={t("fc.revokeConfirm", "Revoke: every call from this key is refused")} disabled={act.pending} onConfirm={() => act.run(t("fc.revoke", "Revoke credential"), () => revokeCredential(target))} />}
            {cred?.status === "revoked" && !liveCode && <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.repairLabel", "Re-pair"), () => repair(target))}>{t("fc.repair", "Re-pair (new key, same principal)")}</Button>}
            {!cred && !liveCode && <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.issueCode", "Issue a pairing code"), () => issueCode(target))}>{t("fc.issueCode", "Issue a pairing code")}</Button>}
            {liveCode && <Button size="sm" variant="outline" disabled={act.pending} onClick={() => act.run(t("fc.revokeCode", "Revoke the pairing code"), () => revokeCode(target))}>{t("fc.revokeCode", "Revoke the pairing code")}</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function toInput(e: Detail["computer"]["envelope"]): EnvelopeInput {
  if (!e) return { roles: ["generic"], max_concurrent_runs: 1, max_heavy: 1 };
  return {
    roles: e.roles, capabilities: e.capabilities, work_types: e.work_types ?? [], company_ids: e.company_ids ?? [],
    max_concurrent_runs: e.max_concurrent_runs, max_heavy: e.max_heavy, preferred_work_class: e.preferred_work_class ?? undefined,
  };
}

function EnvelopeCard({ detail, act, archived }: { detail: Detail; act: ReturnType<typeof useFactoryAction>; archived: boolean }) {
  const { t } = useT();
  const e = detail.computer.envelope;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<EnvelopeInput>(toInput(e));
  const [reason, setReason] = useState("");
  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base font-semibold">{t("fc.envelope", "Authorization envelope")} {e ? `v${e.version}` : ""}</CardTitle>
        {!archived && e && !editing && <Button size="sm" variant="outline" onClick={() => { setValue(toInput(e)); setEditing(true); }}>{t("fc.amend", "Amend")}</Button>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs">
        {e && !editing && (
          <div className="grid gap-1 sm:grid-cols-2">
            <div>{t("fc.env.roles", "Authorized roles")}: {e.roles.join(", ")}</div>
            <div>{t("fc.env.workTypes", "Allowed work types")}: {e.work_types?.join(", ") || t("fc.any", "any")}</div>
            <div>{t("fc.env.capabilities", "Granted capabilities")}: {e.capabilities.join(", ") || "-"}</div>
            <div>{t("fc.env.companies", "Company scope")}: {e.company_ids?.join(", ") || t("fc.notNarrowed", "not narrowed")}</div>
            <div>{t("fc.env.maxRuns", "Max concurrent runs")}: {e.max_concurrent_runs} - {t("fc.env.maxHeavy", "max heavy")}: {e.max_heavy}</div>
            <div>{t("fc.env.preferred", "Preferred work class")}: {e.preferred_work_class ?? "-"}</div>
          </div>
        )}
        {e && editing && (
          <>
            <EnvelopeFields value={value} onChange={setValue} />
            <div>
              <Label className="text-xs">{t("fc.reason", "Reason (audited)")}</Label>
              <Input value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={300} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={act.pending || value.roles.length === 0}
                onClick={() => act.run(t("fc.amendEnvelope", "Amend the envelope"), async () => { const r = await amendEnvelope(detail.computer.computer_id, e.version, value, reason); if (r.ok) setEditing(false); return r; })}>
                {t("fc.saveEnvelope", "Save as a new version")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("fc.cancel", "Cancel")}</Button>
            </div>
            <div className="text-muted-foreground">{t("fc.envStale", "If someone else amended it since this page loaded, the Factory refuses with stale_state and nothing changes.")}</div>
          </>
        )}
        {detail.envelope_history.length > 1 && (
          <details>
            <summary className="cursor-pointer text-muted-foreground">{t("fc.history", "Envelope history")} ({detail.envelope_history.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {detail.envelope_history.map((h) => (
                <li key={h.version}>v{h.version} - {new Date(h.created_at).toLocaleString()} - {h.roles.join(", ")}; {h.max_concurrent_runs} {t("fc.runsMax", "max")}{h.reason ? ` - ${h.reason}` : ""}</li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function AdoptRelease({ computerId, adopted, releases, act }: { computerId: string; adopted: string | null; releases: Release[]; act: ReturnType<typeof useFactoryAction> }) {
  const { t } = useT();
  const candidates = releases.filter((r) => r.state !== "revoked");
  const [choice, setChoice] = useState(adopted ?? "");
  return (
    <span className="inline-flex items-center gap-1.5">
      <select className="h-7 rounded-md border border-border bg-background px-2 text-xs" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">{t("fc.chooseRelease", "Adopt a certified release...")}</option>
        {candidates.map((r) => (
          <option key={r.release_id} value={r.release_id}>{r.channel} {r.version} ({r.state}){r.release_id === adopted ? ` - ${t("fc.adopted", "adopted")}` : ""}</option>
        ))}
      </select>
      <Button size="sm" variant="outline" disabled={act.pending || !choice} onClick={() => act.run(t("fc.adoptRelease", "Adopt release"), () => adoptRelease(computerId, choice))}>{t("fc.adopt", "Adopt")}</Button>
      {adopted && <Badge variant="outline" className="text-[10px]">{t("fc.adopted", "adopted")}: {releases.find((r) => r.release_id === adopted)?.version ?? short(adopted, 8)}</Badge>}
    </span>
  );
}
