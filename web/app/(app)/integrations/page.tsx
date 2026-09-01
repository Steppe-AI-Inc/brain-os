import { Plug } from "lucide-react";
import { getIntegrationQueue } from "@/lib/data/integrations";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";

export default async function IntegrationsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const queue = await getIntegrationQueue(scopeToActiveOrg);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Plug} title="Slack + Drive" description="Pending integration actions." />
      <Alert>
        <AlertDescription>
          Real OAuth connectors for Slack/Drive are not wired up yet — this shows the real
          `integration_queue` table (read-only) rather than a settings form for
          credentials that wouldn&apos;t do anything, which is what the old app had.
        </AlertDescription>
      </Alert>
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Integration</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-medium capitalize">{q.integration}</TableCell>
                <TableCell>{q.action}</TableCell>
                <TableCell>{q.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{q.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {queue.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nothing queued yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
