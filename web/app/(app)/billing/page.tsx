import { Wallet } from "lucide-react";
import { getBillingOverview, getAiEconomicsSummary, getPricingSettings } from "@/lib/data/billing";
import { getCurrentProfile } from "@/lib/data/profile";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { DepositForm } from "./deposit-form";
import { BillingAccountsTable } from "./billing-accounts-table";
import { EconomicsPanel } from "./economics-panel";

export const maxDuration = 30;

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function BillingPage() {
  const [overview, economics, pricing, companies, profile] = await Promise.all([
    getBillingOverview(),
    getAiEconomicsSummary(),
    getPricingSettings(),
    getCompanies(),
    getCurrentProfile(),
  ]);
  const canManage = profile?.role === "founder" || profile?.role === "holding_admin" || profile?.role === "hr_finance";

  const totalDeposits = overview.reduce((s, o) => s + o.totalDeposits, 0);
  const totalBalance = overview.reduce((s, o) => s + o.balance, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Wallet}
        title="Billing"
        description="Your prepaid AI credit balance and usage history."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="bg-card/80 p-4 backdrop-blur">
          <div className="text-xs text-muted-foreground">Total deposits</div>
          <div className="text-2xl font-semibold">{fmt(totalDeposits)}</div>
        </Card>
        <Card className="bg-card/80 p-4 backdrop-blur">
          <div className="text-xs text-muted-foreground">Available service balance</div>
          <div className="text-2xl font-semibold">{fmt(totalBalance)}</div>
        </Card>
        <Card className="bg-card/80 p-4 backdrop-blur">
          <div className="text-xs text-muted-foreground">Provider cost (all-time)</div>
          <div className="text-2xl font-semibold">{fmt(economics.providerCost)}</div>
        </Card>
        <Card className="bg-card/80 p-4 backdrop-blur">
          <div className="text-xs text-muted-foreground">Gross AI margin</div>
          <div className="text-2xl font-semibold">
            {fmt(economics.grossMargin)} <span className="text-sm text-muted-foreground">({economics.marginPct.toFixed(0)}%)</span>
          </div>
        </Card>
      </div>

      {canManage && <DepositForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} />}

      <BillingAccountsTable overview={overview} />

      <EconomicsPanel economics={economics} markup={pricing.markup_multiplier} canEdit={canManage} />

      <Card className="flex flex-col gap-2 bg-card/60 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Referral &amp; partner revenue</p>
        <p>
          Provider referral/reseller programs (OpenAI, Anthropic, etc.) exist but referral terms can change and shouldn&apos;t be
          the core business. Treat this as one line in a broader model: SaaS subscription, AI compute margin, agent/workflow
          premium features, Software Factory usage, enterprise implementation, and partner/referral income — not the main
          revenue stream on its own.
        </p>
      </Card>
    </div>
  );
}
