import { FileText } from "lucide-react";
import { getDocuments } from "@/lib/data/documents";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DocumentCreateForm } from "./document-create-form";

export default async function DocumentsPage() {
  const documents = await getDocuments();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={FileText} title="Documents & Knowledge" description="Uploaded/pasted content, indexed for reference." />
      <DocumentCreateForm />
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell>{d.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{d.sensitivity}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">
                  {d.summary}
                </TableCell>
              </TableRow>
            ))}
            {documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No documents visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
