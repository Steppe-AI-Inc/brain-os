import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// BUG-001 (Work-PC QA campaign C001): a real, systemic class — 24 of 24 data-layer
// queries joining `companies(name)` across web/lib/data/*.ts select only the name,
// never the status, so a row whose parent company was archived renders identically to
// one whose parent is active. Confirmed live on two independent surfaces
// (/departments, /people). This is the ONE shared, reusable piece every affected call
// site should use once its own select() is extended to also fetch `companies.status` -
// deliberately built once here rather than as 24 separate ad-hoc badges, per the
// founder's explicit instruction to prefer a canonical helper over independent patches.
//
// Usage: select `companies(name, status)` instead of `companies(name)`, then render
// <ArchivedCompanyBadge status={row.companies?.status} /> next to the company name.
export function ArchivedCompanyBadge({ status }: { status: string | null | undefined }) {
  if (status !== "archived") return null;
  return (
    <Badge variant="outline" className="flex items-center gap-1 border-border/60 bg-muted text-muted-foreground">
      <Archive className="h-3 w-3" /> Archived
    </Badge>
  );
}
