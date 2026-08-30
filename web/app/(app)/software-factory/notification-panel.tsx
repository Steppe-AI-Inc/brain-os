"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FounderNotification } from "@/lib/data/factory";

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-muted text-muted-foreground border-border",
  warning: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

// Phase 4's mechanism (founder_notifications), Phase 3's live surface: seeded with the
// server-fetched list (so the page still shows real data with JS disabled/on first
// paint), then subscribes to real Realtime INSERT events for anything that lands after
// mount - a genuinely separate, second Realtime channel from the page-wide refresher,
// since this one needs the actual new row's content (title/body/severity), not just a
// "something changed, re-fetch" signal.
export function NotificationPanel({ initial }: { initial: FounderNotification[] }) {
  const [notifications, setNotifications] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("founder-notifications-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "founder_notifications" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const next: FounderNotification = {
            id: row.id as string,
            eventType: row.event_type as string,
            severity: row.severity as string,
            title: row.title as string,
            body: (row.body as string | null) ?? null,
            workOrderId: (row.work_order_id as string | null) ?? null,
            agentRunId: (row.agent_run_id as string | null) ?? null,
            readAt: (row.read_at as string | null) ?? null,
            createdAt: row.created_at as string,
          };
          setNotifications((prev) => [next, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Bell className="h-4 w-4" />
          Founder Notifications
        </CardTitle>
        {notifications.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {notifications.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {notifications.length === 0 && (
          <p className="text-sm text-muted-foreground">No blockers or events yet — real, live, nothing simulated.</p>
        )}
        {notifications.map((n) => (
          <div key={n.id} className="flex flex-col gap-1 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{n.title}</span>
              <Badge variant="outline" className={`text-xs capitalize ${SEVERITY_STYLE[n.severity] ?? ""}`}>
                {n.severity}
              </Badge>
            </div>
            {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
            <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
