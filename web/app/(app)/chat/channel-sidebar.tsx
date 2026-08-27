"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SquarePen, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { renameChannel, deleteChannel, deleteAllChannels, type SidebarChannel } from "@/lib/data/chat-channels";

const COLLAPSE_KEY = "brainos.chat.sidebarCollapsed";

// Reads a stored preference only — deliberately does NOT look at viewport width here,
// because this runs during useState's lazy initializer, which executes during the
// server render too (server has no window, so it'd always disagree with whatever the
// client's real viewport says) as well as the client's first render before hydration
// reconciles. Either way a viewport-dependent value here means the server-rendered HTML
// and the client's first render disagree — a real hydration mismatch (confirmed live:
// React error #418, recurring in production console logs), not a hypothetical one. The
// mobile-default behavior is applied after mount instead, in a useEffect below.
function getStoredCollapsed(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    return stored === null ? null : stored === "1";
  } catch {
    return null;
  }
}

export function ChannelSidebar({
  channels,
  activeChannelId,
  defaultCollapsedOnMobile = false,
}: {
  channels: SidebarChannel[];
  activeChannelId: string | null;
  defaultCollapsedOnMobile?: boolean;
}) {
  const router = useRouter();
  // Always starts false (matches what the server rendered — it has no window at all) —
  // any browser-only correction (stored preference, or the mobile default) happens in
  // the effect below, after mount, never during the initial render. See getStoredCollapsed's
  // comment for why doing this during render was a real, reproduced hydration bug.
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<SidebarChannel | null>(null);
  const [editValue, setEditValue] = useState("");
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [clearAllError, setClearAllError] = useState<string | null>(null);

  useEffect(() => {
    // Deliberately a synchronous setState in an effect, which the lint rule normally
    // flags as an anti-pattern — but this is exactly the case that pattern exists for:
    // synchronizing React state with a browser-only external source (localStorage,
    // matchMedia) that genuinely cannot be read during the server render, so it can't
    // go in the initial useState value without reintroducing the hydration mismatch
    // this effect exists to avoid. The one extra client-only render this causes is the
    // correct, accepted cost here, not a bug.
    const stored = getStoredCollapsed();
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(stored);
    } else if (defaultCollapsedOnMobile && window.matchMedia("(max-width: 767px)").matches) {
      setCollapsed(true);
    }
    // Only ever run once, right after mount — a later prop change shouldn't fight a
    // preference the user may have already toggled by hand in this same session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const realChannels = channels.filter((c) => !c.isGeneral);

  async function confirmClearAll() {
    setClearingAll(true);
    const result = await deleteAllChannels(realChannels.map((c) => c.id));
    setClearingAll(false);
    if (result) {
      setClearAllError(result);
      return;
    }
    setClearAllOpen(false);
    if (activeChannelId && realChannels.some((c) => c.id === activeChannelId)) {
      router.push("/chat");
    } else {
      router.refresh();
    }
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // per-browser convenience only — fine if it doesn't persist
      }
      return next;
    });
  }

  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 rounded-xl border border-border/80 bg-card/60 py-2">
        <Button variant="ghost" size="icon-sm" onClick={toggleCollapsed} title="Expand channels">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Link href="/chat" title="New chat">
          <Button variant="ghost" size="icon-sm">
            <SquarePen className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col rounded-xl border border-border/80 bg-card/60">
      <div className="flex items-center gap-1 border-b border-border/60 p-2">
        <Link href="/chat" className="flex-1">
          <Button variant="secondary" className="w-full justify-start gap-2 text-sm">
            <SquarePen className="h-4 w-4" />
            New chat
          </Button>
        </Link>
        {realChannels.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setClearAllOpen(true)}
            title="Clear all channels"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={toggleCollapsed} title="Collapse">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {channels.map((c) => (
          <div
            key={c.id}
            className={`group/row flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
              activeChannelId === c.id ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60"
            }`}
          >
            <Link href={`/chat?channel=${c.id}`} className="min-w-0 flex-1 truncate">
              {c.name}
            </Link>
            {!c.isGeneral && (
              <RowActionsMenu
                itemLabel="channel"
                className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                onEdit={() => {
                  setEditing(c);
                  setEditValue(c.name);
                }}
                onDelete={async () => {
                  const result = await deleteChannel(c.id);
                  if (!result && activeChannelId === c.id) router.push("/chat");
                  return result;
                }}
              />
            )}
          </div>
        ))}
        {channels.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">No conversations yet — send a message to start one.</p>
        )}
      </div>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Rename channel"
        saveDisabled={!editValue.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await renameChannel(editing.id, editValue);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-channel-name">Name</Label>
          <Input id="edit-channel-name" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
        </div>
      </EditSheet>

      <AlertDialog
        open={clearAllOpen}
        onOpenChange={(open) => {
          setClearAllOpen(open);
          if (!open) setClearAllError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all {realChannels.length} channel{realChannels.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the channels from the sidebar. Messages aren&apos;t deleted — they move to
              &quot;General&quot; and stay searchable. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {clearAllError && <p className="text-sm font-medium text-destructive">{clearAllError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={clearingAll} onClick={confirmClearAll}>
              {clearingAll ? "Clearing…" : `Clear all ${realChannels.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
