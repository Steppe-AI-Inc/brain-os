"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  FileText,
  ImagePlus,
  Mic,
  MicOff,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import {
  consumeChatStream,
  toChatResult,
  type ChatImageAttachment,
  type ChatResult,
} from "@/lib/chat-stream";
import { estimateCost } from "@/lib/usage/pricing";
import { setActiveProvider } from "@/lib/data/ai-providers";
import { getUsageSummary, type UsageSummary } from "@/lib/data/usage";
import { getChatHistory, type ChatHistoryMessage } from "@/lib/data/chat-history";
import {
  createChatSession,
  finalizeChatSession,
  touchChatSession,
  type ChatChannel,
} from "@/lib/data/chat-channels";
import { normalizeSessionTitle } from "@/lib/chat/session-title";
import { saveChatTextAttachment } from "@/lib/data/documents";
import { ChannelSidebar } from "./channel-sidebar";

type Usage = { input_tokens: number; output_tokens: number };
type TokenCost = { tokens: number; costUsd: number };

type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "text" | "image";
  text?: string;
  dataUrl?: string;
};

type SpeechResult = ArrayLike<{ 0?: { transcript?: string } }>;
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: SpeechResult }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

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
      conversationTitle: null,
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

const ZERO: TokenCost = { tokens: 0, costUsd: 0 };

export function ChatClient({
  providers,
  usageSummary,
  history,
  channels,
  activeChannelId,
}: {
  providers: ProviderRow[];
  usageSummary: { today: UsageSummary; last7d: UsageSummary; last30d: UsageSummary };
  history: ChatHistoryMessage[];
  channels: ChatChannel[];
  activeChannelId: string | null;
}) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => history.map(historyToMessage));
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Switching channels re-runs the page.tsx Server Component with a new `history` prop
  // (same client component instance, App Router doesn't remount on a search-param-only
  // navigation) — derive-during-render, not useEffect+setState, per this project's
  // react-hooks/set-state-in-effect lint rule.
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
      const fresh = await getChatHistory(30, activeChannelId);
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

  async function handleFiles(files: FileList | null, imageOnly = false) {
    if (!files?.length) return;
    setSessionError(null);
    const next: ChatAttachment[] = [];

    for (const file of Array.from(files).slice(0, 4)) {
      const isImage = file.type.startsWith("image/");
      const extension = file.name.split(".").pop()?.toLowerCase();
      const isText =
        file.type.startsWith("text/") ||
        ["txt", "md", "csv", "json", "log"].includes(extension || "");

      if (imageOnly && !isImage) continue;
      if (!isImage && !isText) {
        setSessionError(`${file.name} is not supported yet. Use TXT, MD, CSV, JSON, LOG, PNG, JPEG, WEBP, or GIF.`);
        continue;
      }
      if (isImage && file.size > 2 * 1024 * 1024) {
        setSessionError(`${file.name} is larger than the 2 MB image limit.`);
        continue;
      }
      if (isText && file.size > 1024 * 1024) {
        setSessionError(`${file.name} is larger than the 1 MB text-file limit.`);
        continue;
      }

      if (isImage) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        next.push({ id: crypto.randomUUID(), name: file.name, mimeType: file.type, size: file.size, kind: "image", dataUrl });
      } else {
        const text = (await file.text()).slice(0, 40_000);
        next.push({ id: crypto.randomUUID(), name: file.name, mimeType: file.type || "text/plain", size: file.size, kind: "text", text });
      }
    }

    setAttachments((current) => [...current, ...next].slice(0, 6));
  }

  function toggleMicrophone() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const browserWindow = window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSessionError("Live microphone transcription is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    const recognition = new Recognition();
    const startingText = command.trim();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = document.documentElement.lang === "mn" ? "mn-MN" : "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      setCommand([startingText, transcript].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      setSessionError(`Microphone error: ${event.error || "permission or device unavailable"}.`);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setSessionError(null);
    setIsListening(true);
    recognition.start();
  }

  async function send() {
    const typedCommand = command.trim();
    if ((!typedCommand && attachments.length === 0) || isStreaming) return;
    const trimmed = typedCommand ||
      (attachments.some((attachment) => attachment.kind === "image")
        ? "Analyze the attached image and identify useful business context and actions."
        : "Analyze the attached document and summarize important business context and actions.");

    setSessionError(null);
    let targetChannelId = activeChannelId;
    let createdSession = false;

    if (!targetChannelId) {
      const session = await createChatSession();
      if (typeof session === "string") {
        setSessionError(session);
        return;
      }
      targetChannelId = session.id;
      createdSession = true;
    }

    const textAttachments = attachments.filter(
      (attachment): attachment is ChatAttachment & { text: string } =>
        attachment.kind === "text" && typeof attachment.text === "string"
    );
    const saveErrors = (
      await Promise.all(
        textAttachments.map((attachment) =>
          saveChatTextAttachment({ title: attachment.name, text: attachment.text, mimeType: attachment.mimeType })
        )
      )
    ).filter((error): error is string => typeof error === "string");
    if (saveErrors.length) setSessionError(`Artifact save warning: ${saveErrors.join(" ")}`);

    const textContext = textAttachments
      .map((attachment) => `--- ${attachment.name} ---\n${attachment.text}`)
      .join("\n\n");
    const modelCommand = textContext ? `${trimmed}\n\nATTACHED ARTIFACT CONTENT:\n${textContext}` : trimmed;
    const imageAttachments: ChatImageAttachment[] = attachments
      .filter((attachment): attachment is ChatAttachment & { dataUrl: string } =>
        attachment.kind === "image" && typeof attachment.dataUrl === "string")
      .map((attachment) => ({ name: attachment.name, mimeType: attachment.mimeType, dataUrl: attachment.dataUrl }));

    setCommand("");
    setAttachments([]);
    setIsStreaming(true);
    setRequestUsage(ZERO);

    let index = -1;
    let generatedTitle = "";
    let generatedSummary = "";
    setMessages((prev) => {
      index = prev.length;
      return [...prev, { command: trimmed, status: "streaming", usage: null }];
    });

    await consumeChatStream(
      modelCommand,
      (evt) => {
        if (evt.type === "usage") {
          const input = evt.input_tokens ?? 0;
          const output = evt.output_tokens ?? 0;
          setRequestUsage({ tokens: input + output, costUsd: estimateCost(activeModel, input, output) });
          patchMessage(index, { usage: { input_tokens: input, output_tokens: output } });
        } else if (evt.type === "done") {
          const result = toChatResult(evt);
          generatedTitle = result.conversationTitle || "";
          generatedSummary = result.summary;
          patchMessage(index, { status: "done", result });
          const usage = result.usage;
          const finalCost = usage ? estimateCost(result.model, usage.input_tokens, usage.output_tokens) : 0;
          const finalTokens = usage ? usage.input_tokens + usage.output_tokens : 0;
          setRequestUsage({ tokens: finalTokens, costUsd: finalCost });
          setSessionTotal((prev) => ({ tokens: prev.tokens + finalTokens, costUsd: prev.costUsd + finalCost }));
          getUsageSummary().then(setDbSummary);
        } else if (evt.type === "error") {
          setSessionError(evt.error || "Unknown error");
          patchMessage(index, { status: "error", error: evt.error || "Unknown error" });
        }
      },
      targetChannelId,
      imageAttachments
    );

    if (createdSession) {
      const title = normalizeSessionTitle(generatedTitle, generatedSummary, trimmed);
      const titleError = await finalizeChatSession(
        targetChannelId,
        title,
        generatedSummary,
        trimmed
      );
      if (titleError) setSessionError(titleError);
      router.replace(`/chat?channel=${targetChannelId}`);
    } else {
      await touchChatSession(targetChannelId);
      router.refresh();
    }

    setIsStreaming(false);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col gap-3 overflow-hidden">
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

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <ChannelSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onNewChat={() => {
            setCommand("");
            setMessages([]);
            setRequestUsage(ZERO);
            setAttachments([]);
            recognitionRef.current?.stop();
            setSessionError(null);
            router.push("/chat");
            router.refresh();
          }}
        />
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
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
            Try: &ldquo;Device 43 keeps going offline, investigate and follow up.&rdquo;
          </p>
        )}
      </div>

      <Card className="shrink-0 border-border/80 bg-card/95 shadow-sm">
        <CardContent className="flex flex-col gap-2 pt-4">
          {sessionError && <p className="text-sm font-medium text-destructive">{sessionError}</p>}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="group flex max-w-56 items-center gap-2 rounded-xl border border-border/80 bg-secondary/55 p-2">
                  {attachment.kind === "image" && attachment.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.dataUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background">
                      <FileText className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{attachment.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {attachment.kind === "image" ? "Image for this prompt" : "Saved to Documents"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-xs" aria-label={`Remove ${attachment.name}`}
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Textarea value={command} onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Message Brain OS…"
            className="min-h-20 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
            <div className="flex items-center gap-1">
              <input ref={fileInputRef} type="file" multiple
                accept=".txt,.md,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json"
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <input ref={imageInputRef} type="file" multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files, true);
                  event.target.value = "";
                }}
              />
              <Button variant="ghost" size="icon" title="Attach document" aria-label="Attach document"
                onClick={() => fileInputRef.current?.click()} disabled={isStreaming}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Attach image" aria-label="Attach image"
                onClick={() => imageInputRef.current?.click()} disabled={isStreaming}>
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button variant={isListening ? "destructive" : "ghost"} size="icon"
                title={isListening ? "Stop microphone" : "Speak into message"}
                aria-label={isListening ? "Stop microphone" : "Speak into message"}
                aria-pressed={isListening} onClick={toggleMicrophone} disabled={isStreaming}>
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <span className="hidden text-[11px] text-muted-foreground lg:inline">
                Text files are saved · images require a vision-capable active model
              </span>
            </div>
            <div className="flex items-center gap-2">
              <StatPair label="This request" tokens={requestUsage.tokens} costUsd={requestUsage.costUsd} />
              <Button size="icon" aria-label="Send message" onClick={send}
                disabled={isStreaming || (!command.trim() && attachments.length === 0)}>
                {isStreaming ? <Sparkles className="h-4 w-4 animate-pulse" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
