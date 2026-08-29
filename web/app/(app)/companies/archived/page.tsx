import Link from "next/link";
import { Archive, ArrowLeft } from "lucide-react";
import { getArchivedCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ArchivedCompaniesTable } from "./archived-companies-table";

export default async function ArchivedCompaniesPage() {
  const companies = await getArchivedCompanies();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Archive}
        title="Archived companies"
        description="Deleted companies live here, not gone — nothing attached to them was touched. Restore any of them at any time."
        actions={
          <Link href="/companies" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="h-4 w-4" />
            Back to Companies
          </Link>
        }
      />
      <ArchivedCompaniesTable companies={companies} />
    </div>
  );
}
