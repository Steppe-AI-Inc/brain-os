import { Ruler } from "lucide-react";
import { getEngineeringDrawings } from "@/lib/data/engineering";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { PageHeader } from "@/components/page-header";
import { DrawingGeneratorForm } from "./drawing-generator-form";
import { DrawingList } from "./drawing-list";

// generateEngineeringDrawing (a Server Action invoked from this route) calls the
// generate-technical-drawing Edge Function synchronously — no maxDuration here meant
// it inherited Vercel's platform default, short enough to kill the connection
// mid-generation for a real drawing. maxDuration must live on the route, not the
// "use server" actions file itself (that file's exports must all be async functions).
export const maxDuration = 120;

export default async function EngineeringPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const [drawings, companies] = await Promise.all([getEngineeringDrawings(scopeToActiveOrg), getCompaniesForSelection()]);

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
