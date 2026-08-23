import { KeyRound } from "lucide-react";
import { getProfiles, getMemberships } from "@/lib/data/access";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";

export default async function AccessPage() {
  const [profiles, memberships] = await Promise.all([getProfiles(), getMemberships()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={KeyRound}
        title="User Access"
        description="Real accounts and company memberships — not the old app's fake 'switch user' simulator. RLS decides what you see here, not this page."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">Profiles</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {p.role.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "default" : "outline"}>
                        {p.active ? "active" : "inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">Company memberships</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.profiles?.full_name ?? "—"}</TableCell>
                    <TableCell>{m.companies?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.role_in_company}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {memberships.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No memberships yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
