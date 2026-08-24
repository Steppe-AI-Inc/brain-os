"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { consumeChatStream, toChatResult, type ChatResult } from "@/lib/chat-stream";
import { estimateCost } from "@/lib/usage/pricing";
import { setActiveProvider } from "@/lib/data/ai-providers";

type Usage = { input_tokens: number; output_tokens: number };

type ProviderRow = {
  id: string;
  provider: string;
  label: string;
  model: string;
  is_active: boolean;
};

type Message = {
  command: string;
  status: "streaming" | "done" | "error";
  usage: Usage | null;
  result?: ChatResult;
  error?: string;
};

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function UsageBar({ tokens, costUsd }: { tokens: number; costUsd: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline" className="tabular-nums">
        {tokens.toLocaleString()} tokens
      </Badge>
      <Badge variant="outline" className="tabular-nums">
        {fmtCost(costUsd)}
      </Badge>
    </div>
  );
}

function ProviderSelector({ providers }: { providers: ProviderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = providers.find((p) => p.is_active);

  function onChange(v: unknown) {
    if (typeof v !== "string") return;
    startTransition(async () => {
      await setActiveProvider(v);
      router.refresh();
    });
  }

  if (providers.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No providers configured — using fallback planner.
      </span>
    );
  }

  return (
    <Select value={active?.id} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-56 text-xs">
        <SelectValue placeholder="Select provider">
          {() => (active ? `${active.label} · ${active.model}` : "Select provider")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {providers.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label} · {p.model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ChatClient({ providers }: { providers: ProviderRow[] }) {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [committedUsage, setCommittedUsage] = useState({ tokens: 0, costUsd: 0 });
  const [liveUsage, setLiveUsage] = useState<{ tokens: number; costUsd: number } | null>(null);

  const activeModel = providers.find((p) => p.is_active)?.model || "unknown";
  const displayTokens = committedUsage.tokens + (liveUsage?.tokens ?? 0);
  const displayCost = committedUsage.costUsd + (liveUsage?.costUsd ?? 0);

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
    setLiveUsage({ tokens: 0, costUsd: 0 });

    let index = -1;
    setMessages((prev) => {
      index = prev.length;
      return [...prev, { command: trimmed, status: "streaming", usage: null }];
    });

    await consumeChatStream(trimmed, (evt) => {
      if (evt.type === "usage") {
        const input = evt.input_tokens ?? 0;
        const output = evt.output_tokens ?? 0;
        setLiveUsage({ tokens: input + output, costUsd: estimateCost(activeModel, input, output) });
        patchMessage(index, { usage: { input_tokens: input, output_tokens: output } });
      } else if (evt.type === "done") {
        const result = toChatResult(evt);
        patchMessage(index, { status: "done", result });
        const usage = result.usage;
        setCommittedUsage((prev) => ({
          tokens: prev.tokens + (usage ? usage.input_tokens + usage.output_tokens : 0),
          costUsd: prev.costUsd + (usage ? estimateCost(result.model, usage.input_tokens, usage.output_tokens) : 0),
        }));
        setLiveUsage(null);
      } else if (evt.type === "error") {
        patchMessage(index, { status: "error", error: evt.error || "Unknown error" });
        setLiveUsage(null);
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/60 px-4 py-2.5">
        <ProviderSelector providers={providers} />
        <UsageBar tokens={displayTokens} costUsd={displayCost} />
      </div>

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
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                    </span>
                    <span>SEM Brain is thinking…</span>
                  </div>
                ) : (
                  <>
                    <p>{m.result?.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">{m.result?.taskCount} task(s)</Badge>
                      <Badge variant="outline">{m.result?.approvalCount} approval(s)</Badge>
                      {!!m.result?.deletedCount && (
                        <Badge variant="outline">{m.result.deletedCount} task(s) deleted</Badge>
                      )}
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
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3">
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
          </div>
          <UsageBar tokens={displayTokens} costUsd={displayCost} />
        </CardContent>
      </Card>
    </div>
  );
}
