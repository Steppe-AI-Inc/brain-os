/* eslint-disable @typescript-eslint/no-explicit-any */
import { Coins, CreditCard, Gauge, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import {
  getAiUsage,
  getBillingAccounts,
  getDepositHistory,
  getProviderEconomics,
  getServiceLedger,
} from "@/lib/data/billing";

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export default async function BillingPage() {
  const [accounts, ledger, usage, economics, deposits] = await Promise.all([
    getBillingAccounts(),
    getServiceLedger(),
    getAiUsage(),
    getProviderEconomics(),
    getDepositHistory(),
  ]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const customerCharges = usage.reduce((sum: number, e: any) => sum + Number(e.customer_charge || 0), 0);
  const providerCost = economics.reduce((sum: number, e: any) => sum + Number(e.provider_cost || 0), 0);
  const grossMargin = economics.reduce((sum: number, e: any) => sum + Number(e.gross_margin || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Coins}
        title="Billing & AI Economics"
        description="Customers prepay SEM Brain service credits. Provider keys/credits are never transferred; the ledger records customer charges while provider cost and gross margin remain separately controlled."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4" />Available service balance</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{money(totalBalance)}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Gauge className="h-4 w-4" />Customer AI charges</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{money(customerCharges)}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Provider cost</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{economics.length ? money(providerCost) : "Restricted"}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" />Gross AI margin</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{economics.length ? money(grossMargin) : "Restricted"}</CardContent>
        </Card>
      </div>

      <Card className="bg-card/80">
        <CardHeader><CardTitle className="text-base">Workspace balances</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-border/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{a.organizationName}</div>
                  <div className="mt-1 text-2xl font-semibold">{money(a.balance, a.currency)}</div>
                </div>
                <Badge variant={a.status === "active" ? "default" : "outline"}>{a.status}</Badge>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {a.hardStopWhenEmpty ? "AI execution hard-stops when service credit is exhausted." : "Overage is allowed by policy."}
              </p>
            </div>
          ))}
          {accounts.length === 0 && <p className="text-sm text-muted-foreground">No v1 billing accounts visible yet.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-card/80">
          <CardHeader><CardTitle className="text-base">Recent AI usage</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {usage.slice(0, 12).map((e: any) => {
              const org = Array.isArray(e.organizations) ? e.organizations[0] : e.organizations;
              const profile = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
              return (
                <div key={e.id} className="flex items-center justify-between gap-4 rounded-lg border border-border/50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.provider} · {e.model_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{org?.name ?? "Workspace"}{profile?.full_name ? ` · ${profile.full_name}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{money(Number(e.customer_charge || 0))}</div>
                    <div className="text-xs text-muted-foreground">{Number(e.input_tokens || 0).toLocaleString()} in / {Number(e.output_tokens || 0).toLocaleString()} out</div>
                  </div>
                </div>
              );
            })}
            {usage.length === 0 && <p className="text-sm text-muted-foreground">No v1 usage events yet.</p>}
          </CardContent>
        </Card>

        <Card className="bg-card/80">
          <CardHeader><CardTitle className="text-base">Credit ledger</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ledger.slice(0, 12).map((e: any) => {
              const org = Array.isArray(e.organizations) ? e.organizations[0] : e.organizations;
              const amount = Number(e.amount || 0);
              return (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium capitalize">{String(e.entry_type).replaceAll("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">{org?.name ?? "Workspace"} · {e.reference ?? "—"}</div>
                  </div>
                  <div className={amount >= 0 ? "font-medium text-emerald-600" : "font-medium"}>{amount >= 0 ? "+" : ""}{money(amount, e.currency || "USD")}</div>
                </div>
              );
            })}
            {ledger.length === 0 && <p className="text-sm text-muted-foreground">No service-credit entries yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/80">
        <CardHeader><CardTitle className="text-base">Deposits</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {deposits.map((d: any) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm">
              <div><span className="font-medium">{money(Number(d.amount || 0), d.currency || "USD")}</span><span className="ml-2 text-xs text-muted-foreground">{d.payment_method || "payment provider"}</span></div>
              <Badge variant="outline" className="capitalize">{d.status}</Badge>
            </div>
          ))}
          {deposits.length === 0 && <p className="text-sm text-muted-foreground">Payment-provider settlement is not connected yet. Once connected, settled deposits post immutable credit entries automatically.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
