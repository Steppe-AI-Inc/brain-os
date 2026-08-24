import { Package } from "lucide-react";
import { getProductLines } from "@/lib/data/products";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { ProductCreateForm } from "./product-create-form";
import { ProductsTable } from "./products-table";

export default async function ProductsPage() {
  const [products, companies] = await Promise.all([getProductLines(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Package} title="Product Factory" description="Product catalog. Writes are manager-gated by RLS." />
      <ProductCreateForm companies={companies} />
      <ProductsTable products={products} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
