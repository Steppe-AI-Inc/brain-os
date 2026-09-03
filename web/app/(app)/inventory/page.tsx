import { Boxes } from "lucide-react";
import { getInventory } from "@/lib/data/inventory";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ReorderButton } from "./reorder-button";

export default async function InventoryPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const items = await getInventory(scopeToActiveOrg);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Boxes}
        title="Product + Inventory"
        description="Stock levels across warehouses."
        actions={<ReorderButton />}
      />
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>On hand</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Reorder point</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => {
              const available = (i.quantity_on_hand ?? 0) - (i.reserved_quantity ?? 0);
              const low = available <= (i.reorder_point ?? 0);
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.sku ?? "—"}</TableCell>
                  <TableCell>{i.product_lines?.name ?? "—"}</TableCell>
                  <TableCell>{i.companies?.name ?? "—"}</TableCell>
                  <TableCell>{i.quantity_on_hand}</TableCell>
                  <TableCell>{i.reserved_quantity}</TableCell>
                  <TableCell>{i.reorder_point}</TableCell>
                  <TableCell>
                    <Badge variant={low ? "destructive" : "default"}>
                      {low ? "reorder" : "ok"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No inventory records visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
