"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  MessageSquarePlus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { renameChannel, deleteChannel, type ChatChannel } from "@/lib/data/chat-channels";

type Group = { label: string; channels: ChatChannel[] };

function groupChannels(channels: ChatChannel[]): Group[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = today - 6 * 24 * 60 * 60 * 1000;
  const groups: Group[] = [
    { label: "Today", channels: [] },
    { label: "Previous 7 days", channels: [] },
    { label: "Older", channels: [] },
  ];

  for (const channel of channels) {
    const timestamp = new Date(channel.updated_at || channel.created_at || 0).getTime();
    if (timestamp >= today) groups[0].channels.push(channel);
    else if (timestamp >= sevenDaysAgo) groups[1].channels.push(channel);
    else groups[2].channels.push(channel);
  }
  return groups.filter((group) => group.channels.length > 0);
}

export function ChannelSidebar({
  channels,
  activeChannelId,
  onNewChat,
}: {
  channels: ChatChannel[];
  activeChannelId: string | null;
  onNewChat: () => void;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ChatChannel | null>(null);
  const [editValue, setEditValue] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? channels.filter((channel) => channel.name.toLowerCase().includes(normalized))
      : channels;
  }, [channels, query]);
  const groups = useMemo(() => groupChannels(filtered), [filtered]);

  if (collapsed) {
    return (
      <aside className="flex h-full max-h-full min-h-0 w-14 shrink-0 flex-col overflow-hidden items-center gap-2 rounded-2xl border border-border/70 bg-card/75 p-2 shadow-sm backdrop-blur-xl">
        <Button
          variant="ghost"
          size="icon"
          title="Expand conversations"
          aria-label="Expand conversations"
          onClick={() => setCollapsed(false)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          title="New chat"
          aria-label="New chat"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
        <div className="my-1 h-px w-7 bg-border/70" />
        {channels.slice(0, 7).map((channel) => (
          <Button
            key={channel.id}
            variant={activeChannelId === channel.id ? "secondary" : "ghost"}
            size="icon"
            title={channel.name}
            aria-label={channel.name}
            onClick={() => router.push(`/chat?channel=${channel.id}`)}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="flex h-full max-h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/75 shadow-sm backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 p-3">
        <div>
          <p className="text-sm font-semibold">Conversations</p>
          <p className="text-[11px] text-muted-foreground">Recent work, newest first</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Collapse conversations"
          aria-label="Collapse conversations"
          onClick={() => setCollapsed(true)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 p-3">
        <Button className="w-full justify-start gap-2" onClick={onNewChat}>
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {groups.map((group) => (
          <section key={group.label} className="mt-2">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.channels.map((channel) => (
                <div
                  key={channel.id}
                  className={`group/row flex items-center rounded-xl px-2 py-1.5 text-sm transition-colors ${
                    activeChannelId === channel.id
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <MessageSquare className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <Link
                    href={`/chat?channel=${channel.id}`}
                    className="min-w-0 flex-1 truncate py-0.5"
                    title={channel.name}
                  >
                    {channel.name}
                  </Link>
                  <RowActionsMenu
                    itemLabel="conversation"
                    className="shrink-0 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100"
                    onEdit={() => {
                      setEditing(channel);
                      setEditValue(channel.name);
                    }}
                    onDelete={async () => {
                      const result = await deleteChannel(channel.id);
                      if (!result && activeChannelId === channel.id) onNewChat();
                      return result;
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {query ? "No matching conversations." : "Your first conversation will appear after you send a message."}
          </p>
        )}
      </div>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Rename conversation"
        saveDisabled={!editValue.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await renameChannel(editing.id, editValue);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-conversation-name">Name</Label>
          <Input
            id="edit-conversation-name"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
          />
        </div>
      </EditSheet>
    </aside>
  );
}
