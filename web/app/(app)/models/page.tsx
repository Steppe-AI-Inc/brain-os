import Link from "next/link";
import { BarChart3, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getAiProviders } from "@/lib/data/ai-providers";
import { ModelBudgetAnalyzer } from "./model-budget-analyzer";

export default async function ModelsPage() {
  const providers = await getAiProviders();
  const activeModel = providers.find((provider) => provider.is_active)?.model ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BarChart3}
        title="Model Intelligence"
        description="Compare capability, speed, context, and expected operating cost before choosing the company brain."
        actions={
          <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
            <Settings2 className="h-4 w-4" />
            Configure provider
          </Link>
        }
      />
      <ModelBudgetAnalyzer activeModel={activeModel} />
    </div>
  );
}
