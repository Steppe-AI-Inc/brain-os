"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { consumeChatStream, toChatResult, type ChatResult } from "@/lib/chat-stream";
import { estimateCost } from "@/lib/usage/pricing";
import { setActiveProvider } from "@/lib/data/ai-providers";
import { getUsageSummary, type UsageSummary } from "@/lib/data/usage";
import { getChatHistory, type ChatHistoryMessage } from "@/lib/data/chat-history";
import { createChannel, renameChannel, type SidebarChannel } from "@/lib/data/chat-channels";
import { ChannelSidebar } from "./channel-sidebar";

type Usage = { input_tokens: number; output_tokens: number };
type TokenCost = { tokens: number; costUsd: number };

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

// "general" is a UI-only sentinel for the pre-channels flat history (channel_id is null
// in the DB) — never a real chat_channels.id. Translate before any DB call.
function toDbChannelId(id: string | null): string | null {
  return id === "general" ? null : id;
}

function deriveChannelTitle(text: string): string {
  const cleaned = text
    .replace(/^["“]+|["”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "New chat";
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trimEnd()}…` : cleaned;
}

// work_orders.status is 'queued' until sem_execute_ai_command marks it 'done', or
// mark_work_order_failed marks it 'rejected' — 'queued' on reload means the message was
// still generating when the user navigated away (generation itself survives a client
// disconnect, verified live; only the UI needed a way to reconnect to it).
function historyToMessage(h: ChatHistoryMessage): Message {
  const usage =
    h.inputTokens || h.outputTokens ? { input_tokens: h.inputTokens, output_tokens: h.outputTokens } : null;

  if (h.status === "rejected") {
    return { command: h.command, status: "error", usage, error: h.output?.error || "Command failed." };
  }
  if (h.status !== "done") {
    return { command: h.command, status: "streaming", usage };
  }
  return {
    command: h.command,
    status: "done",
    usage,
    result: {
      summary: h.output?.summary || "Command executed.",
      taskCount: h.counts?.tasks ?? 0,
      approvalCount: h.counts?.approvals ?? 0,
      deletedCount: h.counts?.deletedTasks ?? 0,
      companyCount: h.counts?.companies ?? 0,
      personCount: h.counts?.people ?? 0,
      projectCount: h.counts?.projects ?? 0,
      goalCount: h.counts?.goals ?? 0,
      relationshipCount: h.counts?.companyRelationships ?? 0,
      assignmentCount: h.counts?.personAssignments ?? 0,
      memoryCount: h.counts?.memories ?? 0,
      model: h.modelName || "unknown",
      usage,
    },
  };
}

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function StatPair({ label, tokens, costUsd }: { label: string; tokens: number; costUsd: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant="outline" className="tabular-nums">
        {tokens.toLocaleString()}
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

function ChannelMemoryStrip({ memories }: { memories: Array<{ id: string; fact: string; confidence: number | null }> }) {
  const [open, setOpen] = useState(false);
  if (memories.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/80 bg-card/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 font-medium text-muted-foreground"
      >
        <span>
          Channel memory <span className="tabular-nums">({memories.length})</span>
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 px-3 py-2">
          {memories.map((m) => (
            <div key={m.id} className="flex items-start gap-1.5 text-muted-foreground">
              <Badge variant="outline" className="mt-0.5 shrink-0 px-1 text-[10px]">
                {Math.round((m.confidence ?? 0.8) * 100)}%
              </Badge>
              <span>{m.fact}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ZERO: TokenCost = { tokens: 0, costUsd: 0 };

export function ChatClient({
  providers,
  usageSummary,
  history,
  channels,
  activeChannelId,
  channelMemories,
}: {
  providers: ProviderRow[];
  usageSummary: { today: UsageSummary; last7d: UsageSummary; last30d: UsageSummary };
  history: ChatHistoryMessage[];
  channels: SidebarChannel[];
  activeChannelId: string | null;
  channelMemories: Array<{ id: string; fact: string; confidence: number | null }>;
}) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => history.map(historyToMessage));
  const [isStreaming, setIsStreaming] = useState(false);

  // Switching channels (or landing on a fresh blank chat) re-runs the page.tsx Server
  // Component with a new `history` prop (same client component instance, App Router
  // doesn't remount on a search-param-only navigation) — derive-during-render, not
  // useEffect+setState, per this project's react-hooks/set-state-in-effect lint rule.
  const [syncedChannelId, setSyncedChannelId] = useState(activeChannelId);
  if (activeChannelId !== syncedChannelId) {
    setSyncedChannelId(activeChannelId);
    setMessages(history.map(historyToMessage));
  }
  // Session = cumulative since this tab loaded. Request = only the current/most recent
  // send. Today/30d = real DB aggregates (getUsageSummary()), refreshed after each reply
  // — separate scopes on purpose, per the founder's ask: "top should be session/daily/
  // monthly totals, near the chatbox should be just that one request."
  const [sessionTotal, setSessionTotal] = useState<TokenCost>(ZERO);
  const [requestUsage, setRequestUsage] = useState<TokenCost>(ZERO);
  const [dbSummary, setDbSummary] = useState(usageSummary);

  const activeModel = providers.find((p) => p.is_active)?.model || "unknown";

  function patchMessage(index: number, patch: Partial<Message> | ((prev: Message) => Partial<Message>)) {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m))
    );
  }

  // If the newest message was still generating when this tab loaded (reconnecting after
  // navigating away mid-stream, not a message we're actively streaming ourselves right
  // now), poll history until it resolves. Depends only on the initial `history` prop —
  // runs once per real page load, not on every local state change.
  useEffect(() => {
    const last = history[history.length - 1];
    if (!last || last.status !== "queued") return;

    let cancelled = false;
    const interval = setInterval(async () => {
      const fresh = await getChatHistory(30, toDbChannelId(activeChannelId));
      if (cancelled) return;
      setMessages(fresh.map(historyToMessage));
      const latest = fresh[fresh.length - 1];
      if (latest && latest.status !== "queued") {
        clearInterval(interval);
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [history, activeChannelId]);

  async function send() {
    const trimmed = command.trim();
    if (!trimmed || isStreaming) return;
    setCommand("");
    setIsStreaming(true);
    setRequestUsage(ZERO);

    // A blank landing chat (no channel selected yet) auto-creates a real channel the
    // moment the first message is sent — ChatGPT-style. The URL only changes once the
    // reply finishes (see below), so the render-time channel-switch sync above never
    // fires mid-stream and can't clobber this optimistic message.
    const isNewChat = activeChannelId === null;
    let targetChannelId = toDbChannelId(activeChannelId);
    let newChannelId: string | null = null;
    if (isNewChat) {
      const created = await createChannel(deriveChannelTitle(trimmed));
      if (typeof created !== "string") {
        newChannelId = created.id;
        targetChannelId = created.id;
      }
    }

    let index = -1;
    setMessages((prev) => {
      index = prev.length;
      return [...prev, { command: trimmed, status: "streaming", usage: null }];
    });

    let finalSummary: string | null = null;
    await consumeChatStream(trimmed, (evt) => {
      if (evt.type === "usage") {
        const input = evt.input_tokens ?? 0;
        const output = evt.output_tokens ?? 0;
        setRequestUsage({ tokens: input + output, costUsd: estimateCost(activeModel, input, output) });
        patchMessage(index, { usage: { input_tokens: input, output_tokens: output } });
      } else if (evt.type === "done") {
        const result = toChatResult(evt);
        finalSummary = result.summary;
        patchMessage(index, { status: "done", result });
        const usage = result.usage;
        const finalCost = usage ? estimateCost(result.model, usage.input_tokens, usage.output_tokens) : 0;
        const finalTokens = usage ? usage.input_tokens + usage.output_tokens : 0;
        setRequestUsage({ tokens: finalTokens, costUsd: finalCost });
        setSessionTotal((prev) => ({ tokens: prev.tokens + finalTokens, costUsd: prev.costUsd + finalCost }));
        getUsageSummary().then(setDbSummary);
      } else if (evt.type === "error") {
        patchMessage(index, { status: "error", error: evt.error || "Unknown error" });
      }
    }, targetChannelId);

    if (newChannelId) {
      // Re-title from what the AI actually understood the command to be about, once it's
      // known — a better name than the raw first message, still zero extra API calls.
      if (finalSummary) await renameChannel(newChannelId, deriveChannelTitle(finalSummary));
      router.push(`/chat?channel=${newChannelId}`, { scroll: false });
    }

    setIsStreaming(false);
  }

  const isBlank = activeChannelId === null;

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        icon={Sparkles}
        title="Speak with Brain OS"
        description="Every command goes through the real sem-ai-command Edge Function — RLS-scoped context, server-side risk-approval enforcement, transactional persistence. Nothing is simulated locally."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/60 px-4 py-2.5">
        <ProviderSelector providers={providers} />
        <div className="flex flex-wrap items-center gap-3">
          <StatPair label="Session" tokens={sessionTotal.tokens} costUsd={sessionTotal.costUsd} />
          <StatPair
            label="Today"
            tokens={dbSummary.today.totalInputTokens + dbSummary.today.totalOutputTokens}
            costUsd={dbSummary.today.totalCostUsd}
          />
          <StatPair
            label="Last 30d"
            tokens={dbSummary.last30d.totalInputTokens + dbSummary.last30d.totalOutputTokens}
            costUsd={dbSummary.last30d.totalCostUsd}
          />
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <ChannelSidebar channels={channels} activeChannelId={activeChannelId} />
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <ChannelMemoryStrip memories={channelMemories} />
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
                        <span>Brain OS is thinking…</span>
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
                          {!!m.result?.companyCount && (
                            <Badge variant="outline">{m.result.companyCount} compan{m.result.companyCount === 1 ? "y" : "ies"}</Badge>
                          )}
                          {!!m.result?.personCount && (
                            <Badge variant="outline">{m.result.personCount} people</Badge>
                          )}
                          {!!m.result?.projectCount && (
                            <Badge variant="outline">{m.result.projectCount} project(s)</Badge>
                          )}
                          {!!m.result?.goalCount && (
                            <Badge variant="outline">{m.result.goalCount} goal(s)</Badge>
                          )}
                          {!!m.result?.relationshipCount && (
                            <Badge variant="outline">{m.result.relationshipCount} relationship(s)</Badge>
                          )}
                          {!!m.result?.assignmentCount && (
                            <Badge variant="outline">{m.result.assignmentCount} assignment(s)</Badge>
                          )}
                          {!!m.result?.memoryCount && (
                            <Badge variant="outline">{m.result.memoryCount} memory fact(s) saved</Badge>
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
                {isBlank
                  ? "Start a new conversation — try “Device 43 keeps going offline, investigate and follow up.”"
                  : "No messages in this channel yet."}
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
                  placeholder="Message Brain OS…"
                  className="min-h-16"
                />
                <Button onClick={send} disabled={isStreaming || !command.trim()}>
                  {isStreaming ? "Working…" : "Send"}
                </Button>
              </div>
              <StatPair label="This request" tokens={requestUsage.tokens} costUsd={requestUsage.costUsd} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
