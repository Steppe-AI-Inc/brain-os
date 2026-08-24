import { Wallet } from "lucide-react";
import { getFinancialReports } from "@/lib/data/finance";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { FinanceUploadForm } from "./finance-upload-form";
import { FinanceDashboard } from "./finance-dashboard";

// uploadFinancialDocument (a Server Action invoked from this route) calls the
// analyze-financial-document Edge Function synchronously — no maxDuration here meant
// it inherited Vercel's platform default, short enough to kill the connection
// mid-analysis for a real PDF. maxDuration must live on the route, not the "use server"
// actions file itself (that file's exports must all be async functions).
export const maxDuration = 120;

export default async function FinancePage() {
  const [reports, companies] = await Promise.all([getFinancialReports(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Wallet}
        title="Finance"
        description="Upload a financial statement — the AI CFO/Bookkeeper analyzes it and reports financial health, in one pass."
      />
      <FinanceUploadForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
      <FinanceDashboard reports={reports} />
    </div>
  );
}
