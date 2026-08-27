import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { WorkflowGrid } from "./workflow-grid";
import { SoftwareFactoryComposer } from "./software-factory-composer";

const WORKFLOWS = [
  { title: "CEO Daily Brief", command: "Run today's CEO operating brief. Check all companies, blocked projects, overdue tasks, and approvals." },
  { title: "Meeting Close", command: "During meeting, create quotation and proposal for 50 OpenSpot devices, standard payment terms." },
  { title: "Sales Push", command: "Run OpenSpot sales push: create marketing campaign, social posts, and CRM follow-up tasks." },
  { title: "Software Factory", command: "Build next software feature as a software factory: create PRD, atomic tickets, and release approval gate." },
  { title: "Inventory Check", command: "Check inventory and create procurement approval tasks for low-stock product lines." },
  { title: "KPI Review", command: "Review employee KPI updates and create salary-impact recommendations with approval gate only." },
];

export default function WorkflowsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Workflow}
        title="Workflow Factory"
        description="One-click workflows for common requests."
      />
      <SoftwareFactoryComposer />
      <WorkflowGrid workflows={WORKFLOWS} />
    </div>
  );
}
