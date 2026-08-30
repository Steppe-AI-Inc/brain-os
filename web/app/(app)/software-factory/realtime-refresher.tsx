"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Phase 3 — real-time Workflow Factory control center. The simplest, most honest
// mechanism for a Server-Component-driven page like this one: subscribe to real
// Postgres changes via Supabase Realtime and re-fetch the page's own server data on any
// relevant change, rather than duplicating every query into client-side state. This is
// the FIRST real Realtime subscription in this codebase (confirmed live: no
// `.channel(...postgres_changes...)` usage existed anywhere in web/ before this file).
//
// Renders nothing — mount once per page. `router.refresh()` re-runs the page's Server
// Component data fetches without a full navigation/reload, so agent status, task
// status, and Work Order status all reflect real persisted state within one Realtime
// round-trip of it changing - never a stale/cached view. A brief `router.refresh()`
// storm from many rapid changes is debounced client-side so a burst of task updates
// (e.g. a scheduler dispatching several tasks in one cycle) triggers one refresh, not
// one per row.
export function FactoryRealtimeRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel("software-factory-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "canonical_work_orders" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
