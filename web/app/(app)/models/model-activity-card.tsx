import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ModelActivity } from "@/lib/data/usage";

// P3 model reliability, the honest half available without Edge Function changes: every
// row here is derived from real model_usage rows written per actual call — this card
// can only ever show what genuinely served requests, never a configured-state badge.
// The configured/actual comparison is the point: a configured model absent from actual
// traffic, or extra models present, is real drift evidence surfaced instead of hidden.
export function ModelActivityCard({
  activity,
  configuredModel,
}: {
  activity: ModelActivity[];
  configuredModel: string | null;
}) {
  const configuredSeen = configuredModel !== null && activity.some((a) => a.modelName === configuredModel);
  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base">Actually served — last 7 days</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Calls</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Est. cost</TableHead>
              <TableHead>Last used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.map((a) => (
              <TableRow key={a.modelName}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {a.modelName}
                    {a.modelName === configuredModel && <Badge variant="secondary">configured active</Badge>}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{a.calls}</TableCell>
                <TableCell className="tabular-nums">{a.totalTokens.toLocaleString()}</TableCell>
                <TableCell className="tabular-nums">${a.costUsd.toFixed(4)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.lastUsedAt ? new Date(a.lastUsedAt).toLocaleString() : "—"}
                </TableCell>
              </TableRow>
            ))}
            {activity.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No recorded model calls in the last 7 days.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {configuredModel && !configuredSeen && activity.length > 0 && (
          <p className="border-t p-3 text-sm text-muted-foreground">
            The configured active model ({configuredModel}) has not served any recorded call in this window —
            traffic is going to the models listed above. That gap is real usage data, worth investigating.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
