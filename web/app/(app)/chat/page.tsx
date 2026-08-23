"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { runChatCommand, type ChatResult } from "./actions";

type Message = { command: string; result: ChatResult };

export default function ChatPage() {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPending, startTransition] = useTransition();

  function send() {
    const trimmed = command.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await runChatCommand(trimmed);
      setMessages((prev) => [...prev, { command: trimmed, result }]);
      setCommand("");
    });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="text-2xl font-bold">AI Native Chat</h1>
      <p className="text-sm text-muted-foreground">
        Every command here goes through the real sem-ai-command Edge Function — RLS-scoped
        context, server-side risk-approval enforcement, transactional persistence. Nothing
        is simulated locally.
      </p>

      <div className="flex flex-1 flex-col gap-3 overflow-auto rounded-xl bg-muted/30 p-4">
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="ml-auto max-w-lg rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
              {m.command}
            </div>
            <Card className="max-w-lg bg-card/90">
              <CardContent className="pt-4 text-sm">
                {m.result.error ? (
                  <span className="font-medium text-destructive">{m.result.error}</span>
                ) : (
                  <>
                    <p>{m.result.summary}</p>
                    <div className="mt-2 flex gap-2">
                      <Badge variant="outline">{m.result.taskCount} task(s)</Badge>
                      <Badge variant="outline">{m.result.approvalCount} approval(s)</Badge>
                      <Badge variant="secondary">{m.result.model}</Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="m-auto text-sm text-muted-foreground">
            Try: &ldquo;Device 43 keeps going offline, investigate and follow up.&rdquo;
          </p>
        )}
      </div>

      <Card className="bg-card/90">
        <CardContent className="flex gap-3 pt-4">
          <Textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message SEM Brain…"
            className="min-h-16"
          />
          <Button onClick={send} disabled={isPending || !command.trim()}>
            {isPending ? "Working…" : "Send"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
