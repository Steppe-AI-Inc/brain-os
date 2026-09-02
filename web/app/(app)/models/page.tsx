import Link from "next/link";
import { BarChart3, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getAiProviders } from "@/lib/data/ai-providers";
import { getModelActivity } from "@/lib/data/usage";
import { ModelBudgetAnalyzer } from "./model-budget-analyzer";
import { ModelActivityCard } from "./model-activity-card";

export default async function ModelsPage() {
  const [providers, activity] = await Promise.all([getAiProviders(), getModelActivity()]);
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
      <ModelActivityCard activity={activity} configuredModel={activeModel} />
      <ModelBudgetAnalyzer activeModel={activeModel} />
    </div>
  );
}
