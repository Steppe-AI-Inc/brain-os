import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network } from "lucide-react";

type CompanyRow = { id: string; name: string; organization_type: string | null };
type RelationshipRow = {
  id: string;
  company_id: string;
  related_company_id: string | null;
  relationship_type: string;
  ownership_pct: number | null;
};

// The relationship types where company_id is the SUBORDINATE side (companyId
// [relationship_type] relatedCompanyId reads as a literal sentence — "CLIX GPS
// business_unit_of SEM LLC"). parent_of is the opposite polarity (company_id is the
// parent) so it doesn't nest here as a child edge; it's shown as an ownership badge on
// the child instead, since a plain ownership stake shouldn't remove the company from the
// top-level list the way an actual business-unit/brand/subsidiary reclassification does.
const CHILD_EDGE_TYPES = new Set(["business_unit_of", "brand_of", "subsidiary_of", "department_of"]);

const TYPE_LABELS: Record<string, string> = {
  business_unit_of: "Business unit of",
  brand_of: "Brand of",
  subsidiary_of: "Subsidiary of",
  department_of: "Department of",
};

export function OrganizationTree({ companies, relationships }: { companies: CompanyRow[]; relationships: RelationshipRow[] }) {
  if (relationships.length === 0) return null;

  const byId = new Map(companies.map((c) => [c.id, c]));
  const childEdges = relationships.filter((r) => CHILD_EDGE_TYPES.has(r.relationship_type) && r.related_company_id);
  const childrenByParent = new Map<string, RelationshipRow[]>();
  for (const edge of childEdges) {
    const list = childrenByParent.get(edge.related_company_id!) ?? [];
    list.push(edge);
    childrenByParent.set(edge.related_company_id!, list);
  }
  const ownershipByChild = new Map(
    relationships.filter((r) => r.relationship_type === "parent_of" && r.ownership_pct != null).map((r) => [r.related_company_id, r])
  );
  const childIds = new Set(childEdges.map((e) => e.company_id));
  const topLevel = companies.filter((c) => !childIds.has(c.id));

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4" /> Organization structure
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {topLevel.map((company) => (
            <TreeNode
              key={company.id}
              company={company}
              incomingEdge={null}
              childrenByParent={childrenByParent}
              byId={byId}
              ownershipByChild={ownershipByChild}
              depth={0}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TreeNode({
  company,
  incomingEdge,
  childrenByParent,
  byId,
  ownershipByChild,
  depth,
}: {
  company: CompanyRow;
  incomingEdge: RelationshipRow | null;
  childrenByParent: Map<string, RelationshipRow[]>;
  byId: Map<string, CompanyRow>;
  ownershipByChild: Map<string | null, RelationshipRow>;
  depth: number;
}) {
  const children = childrenByParent.get(company.id) ?? [];
  const ownership = ownershipByChild.get(company.id);

  return (
    <li>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 20}px` }}>
        <span className="font-medium">{company.name}</span>
        {incomingEdge && <Badge variant="secondary">{TYPE_LABELS[incomingEdge.relationship_type] ?? incomingEdge.relationship_type}</Badge>}
        {ownership && (
          <Badge variant="outline">
            {ownership.ownership_pct}% owned by {byId.get(ownership.company_id)?.name ?? "?"}
          </Badge>
        )}
      </div>
      {children.length > 0 && (
        <ul className="flex flex-col gap-1">
          {children.map((edge) => {
            const child = byId.get(edge.company_id);
            if (!child) return null;
            return (
              <TreeNode
                key={edge.id}
                company={child}
                incomingEdge={edge}
                childrenByParent={childrenByParent}
                byId={byId}
                ownershipByChild={ownershipByChild}
                depth={depth + 1}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}
