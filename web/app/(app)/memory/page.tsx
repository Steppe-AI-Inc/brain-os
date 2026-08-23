import { BrainCircuit } from "lucide-react";
import { getMemories } from "@/lib/data/memory";
import { getCompanies } from "@/lib/data/companies";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { MemoryCreateForm } from "./memory-create-form";

const SENSITIVITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  public: "outline",
  internal: "secondary",
  confidential: "default",
  restricted: "destructive",
  founder_only: "destructive",
};

export default async function MemoryPage() {
  const [memories, companies] = await Promise.all([getMemories(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BrainCircuit}
        title="Memory"
        description="Source-linked organizational knowledge. Confidential+ requires manager/HR-finance (RLS)."
      />
      <MemoryCreateForm companies={companies} />
      <div className="flex flex-col gap-2">
        {memories.map((m) => (
          <Card key={m.id} className="bg-card/80">
            <CardContent className="flex items-start justify-between gap-4 pt-4">
              <div>
                <p className="text-sm">{m.fact}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.companies?.name ?? "General"} · confidence {Math.round((m.confidence ?? 0) * 100)}%
                </p>
              </div>
              <Badge variant={SENSITIVITY_VARIANT[m.sensitivity ?? "internal"]} className="shrink-0">
                {m.sensitivity}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {memories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No memories visible — either none exist, or RLS is scoping you out of
            confidential ones.
          </p>
        )}
      </div>
    </div>
  );
}
