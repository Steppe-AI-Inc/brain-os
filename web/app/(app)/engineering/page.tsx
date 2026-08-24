import { Ruler } from "lucide-react";
import { getEngineeringDrawings } from "@/lib/data/engineering";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { DrawingGeneratorForm } from "./drawing-generator-form";
import { DrawingList } from "./drawing-list";

export default async function EngineeringPage() {
  const [drawings, companies] = await Promise.all([getEngineeringDrawings(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Ruler}
        title="Engineering Factory"
        description="AI-generated technical layout diagrams for parking and EV charging infrastructure."
      />
      <DrawingGeneratorForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
      <DrawingList drawings={drawings} />
    </div>
  );
}
