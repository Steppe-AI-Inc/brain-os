"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleHelp, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/i18n-context";
import { stateInfo, TONE_CLASS } from "@/lib/factory/computer-states";
import type { AdminResult } from "@/lib/factory/admin-client";
import type { EnvelopeInput, Receipt } from "@/lib/data/factory-computers";

export type Downloads = { channel: string; version: string; installer: string; manifest: string } | null;

export function StateBadge({ state }: { state: string | null | undefined }) {
  const { t } = useT();
  const info = stateInfo(state);
  return (
    <Badge variant="outline" className={TONE_CLASS[info.tone]} title={t(`fc.stateHint.${state}`, info.hint)}>
      {t(`fc.state.${state}`, info.label)}
    </Badge>
  );
}

/** a refusal, by the name the Factory gave it - never an empty list that reads as "nothing here" */
export function RefusalNotice({ result, context }: { result: { refused: string; message?: string; http?: number }; context?: string }) {
  const { t } = useT();
  const unknown = result.refused === "outcome_unknown";
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${unknown ? "border-chart-3/30 bg-chart-3/10" : "border-destructive/30 bg-destructive/10"}`}>
      {unknown ? <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
      <div>
        <div className="font-medium">
          {context ? `${context}: ` : ""}
          {unknown ? t("fc.outcomeUnknown", "Outcome unknown") : t("fc.refused", "Refused")} <code className="rounded bg-background/60 px-1">{result.refused}</code>
          {result.http ? <span className="ml-1 text-xs text-muted-foreground">HTTP {result.http}</span> : null}
        </div>
        {result.message && <div className="mt-0.5 text-muted-foreground">{result.message}</div>}
      </div>
    </div>
  );
}

export function PairingCodePanel({ code, expiresAt, downloads }: { code: string; expiresAt?: string; downloads: Downloads }) {
  const { t } = useT();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" /> {t("fc.code.title", "Pairing code - shown once")}
      </div>
      <div className="mt-2 font-mono text-2xl tracking-wider select-all">{code}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {expiresAt && (
          <>
            {t("fc.code.expires", "Expires")} {new Date(expiresAt).toLocaleTimeString()}
            {left !== null && ` (${left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : t("fc.code.expired", "expired")})`}.{" "}
          </>
        )}
        {t("fc.code.once", "It is not stored anywhere readable and cannot be shown again. It is not a credential: it works once, for this computer only.")}
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>
          {t("fc.code.step1", "On the computer, download")}{" "}
          {downloads ? (
            <>
              <a className="text-primary underline" href={downloads.installer}>BrainFactorySetup.exe</a> {t("fc.code.and", "and")}{" "}
              <a className="text-primary underline" href={downloads.manifest}>BrainFactorySetup.manifest.json</a> ({downloads.channel} {downloads.version}){" "}
              {t("fc.code.sameFolder", "into the same folder.")}
            </>
          ) : (
            <span className="text-muted-foreground">{t("fc.code.noRelease", "BrainFactorySetup.exe - no published release is available on this plane yet.")}</span>
          )}
        </li>
        <li>{t("fc.code.step2", "Run BrainFactorySetup.exe and enter the code. Setup verifies the release before anything runs, enrolls, installs and starts the runtime.")}</li>
        <li>{t("fc.code.step3", "This page shows the computer ALIVE when it registers. Nothing else is needed: no Git, npm, checkout or database URL.")}</li>
      </ol>
    </div>
  );
}

/** the result of an action: done (or "already"), or refused by name; a pairing code in the receipt is shown once */
export function ReceiptNotice({ label, result, downloads }: { label: string; result: AdminResult<Receipt>; downloads: Downloads }) {
  const { t } = useT();
  if (!result.ok) return <RefusalNotice result={result} context={label} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chart-2" />
        <div>
          <span className="font-medium">{label}: </span>
          {result.already ? t("fc.already", "already in that state - nothing changed") : t("fc.done", "done (read back from the Factory below)")}
        </div>
      </div>
      {typeof result.pairing_code === "string" && <PairingCodePanel code={result.pairing_code} expiresAt={typeof result.expires_at === "string" ? result.expires_at : undefined} downloads={downloads} />}
    </div>
  );
}

/** one Factory action at a time; afterwards the page re-reads the server (router.refresh), so what shows is the Factory's truth */
export function useFactoryAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [last, setLast] = useState<{ label: string; result: AdminResult<Receipt> } | null>(null);
  const run = (label: string, fn: () => Promise<AdminResult<Receipt>>) =>
    start(async () => {
      const result = await fn();
      setLast({ label, result });
      router.refresh();
    });
  return { pending, last, run, clear: () => setLast(null) };
}

/** a destructive action asks once more, inline */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, variant = "destructive" }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean; variant?: "destructive" | "outline" }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  if (!asking) return <Button size="sm" variant={variant} disabled={disabled} onClick={() => setAsking(true)}>{label}</Button>;
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="destructive" disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{t("fc.cancel", "Cancel")}</Button>
    </span>
  );
}

const list = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

export function EnvelopeFields({ value, onChange }: { value: EnvelopeInput; onChange: (e: EnvelopeInput) => void }) {
  const { t } = useT();
  const toggleRole = (role: string) => onChange({ ...value, roles: value.roles.includes(role) ? value.roles.filter((r) => r !== role) : [...value.roles, role] });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label className="text-xs">{t("fc.envForm.roles", "Authorized roles (what this computer MAY do)")}</Label>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {[
            ["generic", t("fc.env.generic", "generic work")],
            ["verifier", t("fc.env.verifier", "independent verification")],
            ["release_broker", t("fc.env.releaseBroker", "release broker (founder only)")],
          ].map(([role, text]) => (
            <label key={role} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={value.roles.includes(role)} onChange={() => toggleRole(role)} /> {text}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs">{t("fc.envForm.workTypes", "Allowed work types (empty = any)")}</Label>
        <Input value={(value.work_types ?? []).join(", ")} onChange={(e) => onChange({ ...value, work_types: list(e.target.value) })} placeholder="software_development, docs" />
      </div>
      <div>
        <Label className="text-xs">{t("fc.env.capabilities", "Granted capabilities")}</Label>
        <Input value={(value.capabilities ?? []).join(", ")} onChange={(e) => onChange({ ...value, capabilities: list(e.target.value) })} placeholder="browser, gpu" />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">{t("fc.envForm.companies", "Company scope (company ids; empty = not narrowed)")}</Label>
        <Input value={(value.company_ids ?? []).join(", ")} onChange={(e) => onChange({ ...value, company_ids: list(e.target.value) })} placeholder="00000000-0000-4000-8000-000000000000" />
      </div>
      <div>
        <Label className="text-xs">{t("fc.envForm.maxRuns", "Max concurrent runs (1-32)")}</Label>
        <Input type="number" min={1} max={32} value={value.max_concurrent_runs ?? 1} onChange={(e) => onChange({ ...value, max_concurrent_runs: Number(e.target.value) })} />
      </div>
      <div>
        <Label className="text-xs">{t("fc.envForm.maxHeavy", "Max heavy runs (0-max concurrent)")}</Label>
        <Input type="number" min={0} max={32} value={value.max_heavy ?? 1} onChange={(e) => onChange({ ...value, max_heavy: Number(e.target.value) })} />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">{t("fc.envForm.preferred", "Preferred work class (ranking only; never authority)")}</Label>
        <Input value={value.preferred_work_class ?? ""} onChange={(e) => onChange({ ...value, preferred_work_class: e.target.value || undefined })} placeholder="software_development" />
      </div>
    </div>
  );
}
