"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { consumeChatStream, toChatResult, type ChatResult } from "@/lib/chat-stream";

type Usage = { input_tokens: number; output_tokens: number };

type Message = {
  command: string;
  status: "streaming" | "done" | "error";
  streamText: string;
  usage: Usage | null;
  result?: ChatResult;
  error?: string;
};

export default function ChatPage() {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  function patchMessage(index: number, patch: Partial<Message> | ((prev: Message) => Partial<Message>)) {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m))
    );
  }

  async function send() {
    const trimmed = command.trim();
    if (!trimmed || isStreaming) return;
    setCommand("");
    setIsStreaming(true);

    let index = -1;
    setMessages((prev) => {
      index = prev.length;
      return [...prev, { command: trimmed, status: "streaming", streamText: "", usage: null }];
    });

    await consumeChatStream(trimmed, (evt) => {
      if (evt.type === "delta") {
        patchMessage(index, (prev) => ({ streamText: prev.streamText + (evt.text || "") }));
      } else if (evt.type === "usage") {
        patchMessage(index, (prev) => ({
          usage: {
            input_tokens: evt.input_tokens ?? prev.usage?.input_tokens ?? 0,
            output_tokens: evt.output_tokens ?? prev.usage?.output_tokens ?? 0,
          },
        }));
      } else if (evt.type === "done") {
        patchMessage(index, { status: "done", result: toChatResult(evt) });
      } else if (evt.type === "error") {
        patchMessage(index, { status: "error", error: evt.error || "Unknown error" });
      }
    });

    setIsStreaming(false);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        icon={Sparkles}
        title="AI Native Chat"
        description="Every command goes through the real sem-ai-command Edge Function — RLS-scoped context, server-side risk-approval enforcement, transactional persistence. Nothing is simulated locally."
      />

      <div className="flex flex-1 flex-col gap-3 overflow-auto rounded-xl bg-muted/30 p-4">
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="ml-auto max-w-lg rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
              {m.command}
            </div>
            <Card className="max-w-lg bg-card/90">
              <CardContent className="pt-4 text-sm">
                {m.status === "error" ? (
                  <span className="font-medium text-destructive">{m.error}</span>
                ) : m.status === "streaming" ? (
                  <>
                    <p className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                      {m.streamText || "Thinking…"}
                      <span className="animate-pulse">▍</span>
                    </p>
                    {m.usage && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline" className="tabular-nums">
                          {(m.usage.input_tokens + m.usage.output_tokens).toLocaleString()} tokens…
                        </Badge>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p>{m.result?.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">{m.result?.taskCount} task(s)</Badge>
                      <Badge variant="outline">{m.result?.approvalCount} approval(s)</Badge>
                      <Badge variant="secondary">{m.result?.model}</Badge>
                      {m.result?.usage && (
                        <Badge variant="outline" className="tabular-nums">
                          {(m.result.usage.input_tokens + m.result.usage.output_tokens).toLocaleString()}{" "}
                          tokens
                        </Badge>
                      )}
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
          <Button onClick={send} disabled={isStreaming || !command.trim()}>
            {isStreaming ? "Working…" : "Send"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
