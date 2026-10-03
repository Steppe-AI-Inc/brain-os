"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, KeyRound, PackageCheck, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/i18n-context";
import type { AdminResult } from "@/lib/factory/admin-client";
import type { AuthorizeReceipt } from "@/lib/factory/update";
import { authorizeUpdate, type UpdateState } from "@/lib/data/factory-update";
import { RefusalNotice } from "../computers/shared";

const short = (s: string | null | undefined, n = 16) => (s ? s.slice(0, n) : "-");

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="break-all text-xs">{value}</code>
    </div>
  );
}

export function UpdatePanel({ state }: { state: UpdateState }) {
  const { t } = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult<AuthorizeReceipt> | null>(null);
  const { prepared, published } = state;
  // nothing to authorize when the prepared release is published and its signed manifest is where the installer looks for it
  const settled = state.upToDate && state.manifestServed !== false;

  const confirm = () => {
    if (!prepared || !password) return;
    const entered = password;
    setPassword("");   // the password leaves this page's state as soon as it is sent
    start(async () => {
      // the page re-reads the Factory's state whatever happened - an answer that never arrived included (AC-5(o)): what it then
      // shows (published, or still prepared) is the plane's, never a guess
      try {
        setResult(await authorizeUpdate({ password: entered, expected: prepared }));
      } catch {
        setResult({ ok: false, refused: "unreachable", message: "The answer did not arrive. The page now shows the Factory's state as it is." });
      } finally {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={RefreshCw}
        title={t("fu.title", "Factory Update")}
        description={t("fu.description", "Authorize the prepared Factory release. You handle no key: the Factory signs and publishes it when you confirm with the password of the account you are signed in with. The Factory checks that on the call itself.")}
      />

      {result && !result.ok && <RefusalNotice result={result} context={t("fu.title", "Factory Update")} />}
      {result && result.ok && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${result.manifest_served ? "border-chart-2/30 bg-chart-2/10" : "border-chart-3/30 bg-chart-3/10"}`}>
          {result.manifest_served ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chart-2" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" />}
          <div>
            <div className="font-medium">
              {result.already ? t("fu.already", "This release was already published. Nothing was signed again.") : t("fu.published", "Published. The Factory signed this release and it is now the production release.")}
            </div>
            <div className="mt-0.5 text-muted-foreground">
              {result.manifest_served
                ? t("fu.manifestPlaced", "Its signed manifest is in release storage, where the installer looks for it.")
                : t("fu.manifestNotPlaced", "Its signed manifest could not be placed in release storage, so the installer cannot verify itself yet. Confirm once more to place it.")}
            </div>
          </div>
        </div>
      )}

      <Card className="border-border/80 shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><PackageCheck className="h-4 w-4" /> {t("fu.now", "Published now")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {published ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Fact label={t("fu.version", "Version")} value={published.version} />
              <Fact label={t("fu.digest", "Installer digest")} value={published.digest} />
              <Fact label={t("fu.signedBy", "Signed by")} value={published.key_id} />
              <Fact label={t("fu.publishedAt", "Published")} value={new Date(published.published_at).toLocaleString()} />
            </div>
          ) : (
            <div className="text-muted-foreground">{t("fu.nonePublished", "No production release is published on this Factory yet.")}</div>
          )}
          {published && state.manifestServed === false && (
            <div className="text-chart-3">{t("fu.manifestMissing", "The signed manifest of this release is not in release storage. Confirm below to place it.")}</div>
          )}
          <div className="text-xs text-muted-foreground">
            {t("fu.signer", "This Factory's signing key")}: <code>{state.signer ? state.signer.key_id : t("fu.noSigner", "none - this Factory has no release signer")}</code>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><RefreshCw className="h-4 w-4" /> {t("fu.prepared", "Prepared update")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {!state.storageReadable && <div className="text-chart-3">{t("fu.storageUnreadable", "The Factory's release storage could not be read. Reload to try again.")}</div>}
          {state.storageReadable && !prepared && <div className="text-muted-foreground">{t("fu.nonePrepared", "No update is prepared. A prepared update appears here after the release is staged in the Factory's release storage.")}</div>}
          {prepared && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Fact label={t("fu.version", "Version")} value={prepared.version} />
                <Fact label={t("fu.source", "Certified source")} value={prepared.source_sha} />
                <Fact label={t("fu.digest", "Installer digest")} value={prepared.digest} />
                <Fact label={t("fu.receipt", "Certifying receipt")} value={prepared.receipt_sha256} />
              </div>
              {settled ? (
                <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chart-2" />
                  <div>{t("fu.upToDate", "This release is published. There is nothing to authorize.")}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" /> {t("fu.confirmTitle", "Authorize this exact release")}</div>
                  <div className="text-muted-foreground">
                    {t("fu.confirmHelp", "Confirm publishes exactly the release above and nothing else. Before it does, the installer in release storage is checked against this digest, your password is checked by Brain OS, and the Factory checks that you are its founder.")}
                    {published && !state.upToDate ? ` ${t("fu.supersedes", "It replaces")} ${published.version} (${short(published.digest)}).` : ""}
                  </div>
                  <div className="flex flex-col gap-1.5 sm:max-w-sm">
                    <Label htmlFor="fu-password">{t("fu.password", "Password of the account you are signed in with")}</Label>
                    <Input id="fu-password" type="password" autoComplete="current-password" value={password} disabled={pending}
                      onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirm(); }} />
                  </div>
                  <div>
                    <Button size="sm" disabled={pending || !password} onClick={confirm}>
                      {pending ? t("fu.confirming", "Checking and publishing...") : t("fu.confirm", "Confirm update")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
