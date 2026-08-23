import { Package } from "lucide-react";
import { getProductLines } from "@/lib/data/products";
import { getCompanies } from "@/lib/data/companies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ProductCreateForm } from "./product-create-form";

export default async function ProductsPage() {
  const [products, companies] = await Promise.all([getProductLines(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Package} title="Product Factory" description="Product catalog. Writes are manager-gated by RLS." />
      <ProductCreateForm companies={companies} />
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Unit price</TableHead>
              <TableHead>Unit cost</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  {p.currency} {p.unit_price}
                </TableCell>
                <TableCell>
                  {p.currency} {p.unit_cost}
                </TableCell>
                <TableCell>
                  <Badge variant={p.active ? "default" : "secondary"}>
                    {p.active ? "active" : "inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No product lines visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
