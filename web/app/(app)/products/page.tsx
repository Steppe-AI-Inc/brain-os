import { Package } from "lucide-react";
import { getProductLines } from "@/lib/data/products";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { PageHeader } from "@/components/page-header";
import { ProductCreateForm } from "./product-create-form";
import { ProductsTable } from "./products-table";

export default async function ProductsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const [products, companies] = await Promise.all([getProductLines(scopeToActiveOrg), getCompaniesForSelection()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Package} title="Product Factory" description="Product catalog, editable by managers." />
      <ProductCreateForm companies={companies} />
      <ProductsTable products={products} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
