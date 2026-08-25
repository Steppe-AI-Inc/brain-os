import { Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Entry = {
  id: string;
  mode: string;
  reply_text: string;
  created_at: string | null;
  people: { full_name: string } | null;
};

export function AiReplyLogFeed({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3 bg-card/80 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4" /> AI-authored replies (audit log)
      </div>
      <div className="flex flex-col gap-2">
        {entries.map((e) => (
          <div key={e.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                {e.people?.full_name ?? "Unknown"} AI Assistant
              </Badge>
              <span>{e.mode.replace(/_/g, " ")}</span>
              <span>{e.created_at ? new Date(e.created_at).toLocaleString() : ""}</span>
            </div>
            <p>{e.reply_text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
