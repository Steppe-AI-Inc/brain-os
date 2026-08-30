"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveFounderNotification, markFounderNotificationRead } from "@/lib/data/factory";
import type { FounderNotification } from "@/lib/data/factory";

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-muted text-muted-foreground border-border",
  warning: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

const SEVERITY_ICON: Record<string, string> = { info: "✅", warning: "🟡", critical: "🔴" };

// Phase 4's mechanism (founder_notifications), Phase 3's live surface: seeded with the
// server-fetched list (so the page still shows real data with JS disabled/on first
// paint), then subscribes to real Realtime INSERT and UPDATE events - UPDATE matters now
// that resolve/mark-read exist, so a notification resolved from another tab/device
// updates here live too, not just new inserts.
export function NotificationPanel({ initial }: { initial: FounderNotification[] }) {
  const [notifications, setNotifications] = useState(initial);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("founder-notifications-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "founder_notifications" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setNotifications((prev) => [rowToNotification(row), ...prev].slice(0, 20));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "founder_notifications" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? rowToNotification(row) : n)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  function handleResolve(id: string) {
    startTransition(async () => {
      await resolveFounderNotification(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, status: "resolved" } : n)));
    });
  }

  function handleOpen(n: FounderNotification) {
    if (n.status === "unread") {
      startTransition(async () => {
        await markFounderNotificationRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: "read" } : x)));
      });
    }
  }

  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Bell className="h-4 w-4" />
          Founder Notifications
        </CardTitle>
        {unreadCount > 0 && (
          <Badge variant="outline" className="border-chart-3/30 bg-chart-3/15 text-xs text-chart-3">
            {unreadCount} unread
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {notifications.length === 0 && (
          <p className="text-sm text-muted-foreground">No blockers or events yet — real, live, nothing simulated.</p>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-sm ${
              n.status === "resolved" ? "border-border/40 opacity-60" : "border-border/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                <span aria-hidden>{SEVERITY_ICON[n.severity] ?? ""}</span>
                {n.title}
              </span>
              <Badge variant="outline" className={`text-xs capitalize ${SEVERITY_STYLE[n.severity] ?? ""}`}>
                {n.status === "resolved" ? "resolved" : n.severity}
              </Badge>
            </div>
            {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
              <div className="flex items-center gap-2">
                {n.workOrderId && (
                  <Link
                    href={`/software-factory/${n.workOrderId}`}
                    onClick={() => handleOpen(n)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Open Factory <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
                {n.status !== "resolved" && n.actionRequired && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 px-2 text-xs"
                    disabled={isPending}
                    onClick={() => handleResolve(n.id)}
                  >
                    <Check className="h-3 w-3" /> Resolve
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function rowToNotification(row: Record<string, unknown>): FounderNotification {
  return {
    id: row.id as string,
    eventType: row.event_type as string,
    severity: row.severity as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    workOrderId: (row.work_order_id as string | null) ?? null,
    agentRunId: (row.agent_run_id as string | null) ?? null,
    status: (row.status as string) ?? "unread",
    actionRequired: (row.action_required as boolean) ?? false,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}
