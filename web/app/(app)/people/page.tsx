import { Users } from "lucide-react";
import { getPeople } from "@/lib/data/people";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { PersonCreateForm } from "./person-create-form";
import { PeopleTable } from "./people-table";

export default async function PeoplePage() {
  const [people, companies] = await Promise.all([getPeople(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Users} title="People" description="Team members across every company." />
      <PersonCreateForm companies={companies} />
      <PeopleTable people={people} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
