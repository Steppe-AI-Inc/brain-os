"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { createChannel, renameChannel, deleteChannel, type ChatChannel } from "@/lib/data/chat-channels";

type ChannelMemory = { id: string; fact: string; confidence: number | null };

export function ChannelSidebar({
  channels,
  activeChannelId,
  channelMemories = [],
}: {
  channels: ChatChannel[];
  activeChannelId: string | null;
  channelMemories?: ChannelMemory[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChatChannel | null>(null);
  const [editValue, setEditValue] = useState("");

  async function submitCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    const result = await createChannel(trimmed);
    setPending(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setNewName("");
    setCreating(false);
    router.push(`/chat?channel=${result.id}`);
  }

  return (
    <div className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto rounded-xl border border-border/80 bg-card/60 p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Channels</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {creating && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
            }}
            placeholder="Channel name…"
            className="h-8 text-xs"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 flex-1 text-xs" disabled={pending || !newName.trim()} onClick={submitCreate}>
              {pending ? "Creating…" : "Create"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Link
        href="/chat"
        className={`flex items-center rounded-lg px-2 py-1.5 text-sm ${
          !activeChannelId ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60"
        }`}
      >
        General
      </Link>

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
          <RowActionsMenu
            itemLabel="channel"
            className="opacity-0 group-hover/row:opacity-100"
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
        </div>
      ))}

      {channels.length === 0 && !creating && <p className="px-2 py-2 text-xs text-muted-foreground">No topic channels yet.</p>}

      {activeChannelId && (
        <div className="mt-2 border-t border-border/60 px-2 pt-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Channel memory</span>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {channelMemories.length === 0 && <p className="text-xs text-muted-foreground">Nothing captured yet.</p>}
            {channelMemories.map((m) => (
              <div key={m.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="mt-0.5 shrink-0 px-1 text-[10px]">
                  {Math.round((m.confidence ?? 0.8) * 100)}%
                </Badge>
                <span>{m.fact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </div>
  );
}
