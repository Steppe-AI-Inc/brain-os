"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  History,
  MessageSquarePlus,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import {
  consumeChatStream,
  toChatResult,
  type ChatResult,
  type StreamEvent,
} from "@/lib/chat-stream";
import {
  deleteChatThread,
  renameChatThread,
  type StoredChatMessage,
  type StoredChatThread,
} from "@/lib/data/chat";

type DisplayMessage = Omit<StoredChatMessage, "result"> & {
  result: ChatResult | null;
};

function storedResult(message: StoredChatMessage): ChatResult | null {
  if (!message.result) return null;
  const event = message.result as unknown as Extract<StreamEvent, { type: "done" }>;
  const result = toChatResult(event);
  return { ...result, summary: result.summary || message.content };
}

function displayMessages(messages: StoredChatMessage[]): DisplayMessage[] {
  return messages.map((message) => ({ ...message, result: storedResult(message) }));
}

function ChatHistory({
  threads,
  activeThreadId,
  busy,
  onRename,
  onDelete,
}: {
  threads: StoredChatThread[];
  activeThreadId: string | null;
  busy: boolean;
  onRename: (thread: StoredChatThread) => void;
  onDelete: (thread: StoredChatThread) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Link href="/chat" className={buttonVariants({ className: "w-full justify-start" })}>
        <MessageSquarePlus className="size-4" />
        New conversation
      </Link>
      <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <History className="size-3.5" />
        History
      </div>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={
              "group flex items-center rounded-xl border transition-colors " +
              (thread.id === activeThreadId
                ? "border-primary/40 bg-primary/10"
                : "border-transparent hover:bg-muted/70")
            }
          >
            <Link
              href={"/chat?thread=" + thread.id}
              className="min-w-0 flex-1 px-3 py-2.5 text-sm font-medium"
            >
              <span className="block truncate">{thread.title}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                {new Date(thread.lastMessageAt).toLocaleDateString()}
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-60 hover:opacity-100"
              disabled={busy}
              aria-label={"Rename " + thread.title}
              onClick={() => onRename(thread)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-1 opacity-60 hover:text-destructive hover:opacity-100"
              disabled={busy}
              aria-label={"Delete " + thread.title}
              onClick={() => onDelete(thread)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        {threads.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Your conversations will remain here across navigation and devices.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ChatClient({
  initialThreads,
  initialThreadId,
  initialMessages,
}: {
  initialThreads: StoredChatThread[];
  initialThreadId: string | null;
  initialMessages: StoredChatMessage[];
}) {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  const [command, setCommand] = useState("");
  const [threads, setThreads] = useState(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState<DisplayMessage[]>(displayMessages(initialMessages));
  const [isStreaming, setIsStreaming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isManaging, startManaging] = useTransition();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function patchMessage(id: string, patch: Partial<DisplayMessage>) {
    setMessages((previous) =>
      previous.map((message) => (message.id === id ? { ...message, ...patch } : message))
    );
  }

  function registerThread(threadId: string, title: string) {
    setActiveThreadId(threadId);
    setThreads((previous) => {
      const existing = previous.find((thread) => thread.id === threadId);
      if (existing) return previous;
      const now = new Date().toISOString();
      return [{ id: threadId, title, lastMessageAt: now, createdAt: now }, ...previous];
    });
    window.history.replaceState(null, "", "/chat?thread=" + threadId);
  }

  async function send() {
    const trimmed = command.trim();
    if (!trimmed || isStreaming) return;

    const stamp = Date.now().toString();
    const userId = "local-user-" + stamp;
    const assistantId = "local-assistant-" + stamp;
    setCommand("");
    setActionError(null);
    setIsStreaming(true);
    setMessages((previous) => [
      ...previous,
      {
        id: userId,
        role: "user",
        content: trimmed,
        status: "done",
        result: null,
        usage: null,
        error: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
        result: null,
        usage: null,
        error: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    await consumeChatStream(trimmed, activeThreadId, (event) => {
      if (event.type === "thread") {
        registerThread(event.threadId, event.title);
      } else if (event.type === "delta") {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + (event.text || "") }
              : message
          )
        );
      } else if (event.type === "usage") {
        patchMessage(assistantId, {
          usage: {
            input_tokens: event.input_tokens ?? 0,
            output_tokens: event.output_tokens ?? 0,
          },
        });
      } else if (event.type === "done") {
        const result = toChatResult(event);
        patchMessage(assistantId, {
          status: "done",
          content: result.summary,
          result,
          usage: result.usage,
        });
      } else if (event.type === "error") {
        patchMessage(assistantId, {
          status: "error",
          error: event.error || "Unknown error",
          content: event.error || "The command failed.",
        });
      }
    });

    setIsStreaming(false);
  }

  function renameThread(thread: StoredChatThread) {
    const title = window.prompt("Conversation title", thread.title)?.trim();
    if (!title || title === thread.title) return;
    setActionError(null);
    startManaging(async () => {
      const result = await renameChatThread(thread.id, title);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setThreads((previous) =>
        previous.map((candidate) => (candidate.id === thread.id ? { ...candidate, title } : candidate))
      );
      router.refresh();
    });
  }

  function deleteThread(thread: StoredChatThread) {
    if (!window.confirm('Delete "' + thread.title + '" and its private message history?')) return;
    setActionError(null);
    startManaging(async () => {
      const result = await deleteChatThread(thread.id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      router.push("/chat");
      router.refresh();
    });
  }

  const history = (
    <ChatHistory
      threads={threads}
      activeThreadId={activeThreadId}
      busy={isManaging || isStreaming}
      onRename={renameThread}
      onDelete={deleteThread}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        icon={Sparkles}
        title="AI Native Chat"
        description="Private conversations persist in Supabase. Validated board actions use zero model tokens; open-ended commands continue through the approval-aware orchestrator."
      />

      <details className="rounded-xl border bg-card/80 p-3 lg:hidden">
        <summary className="cursor-pointer text-sm font-semibold">Conversation history</summary>
        <div className="mt-3 max-h-72">{history}</div>
      </details>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="hidden min-h-0 bg-card/80 p-3 backdrop-blur lg:block">{history}</Card>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-[24rem] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border bg-muted/25 p-4">
            {messages.map((message) =>
              message.role === "user" ? (
                <div
                  key={message.id}
                  className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                >
                  {message.content}
                </div>
              ) : (
                <Card key={message.id} className="max-w-2xl bg-card/95">
                  <CardContent className="pt-4 text-sm">
                    {message.status === "error" ? (
                      <span className="font-medium text-destructive">
                        {message.error || message.content}
                      </span>
                    ) : (
                      <p className="whitespace-pre-wrap">
                        {message.content || "Thinking…"}
                        {message.status === "streaming" ? (
                          <span className="animate-pulse"> ▍</span>
                        ) : null}
                      </p>
                    )}

                    {message.result ? (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline">{message.result.taskCount} task(s)</Badge>
                          <Badge variant="outline">{message.result.approvalCount} approval(s)</Badge>
                          <Badge variant="secondary">{message.result.model}</Badge>
                          {message.result.usage ? (
                            <Badge variant="outline" className="tabular-nums">
                              {(
                                message.result.usage.input_tokens +
                                message.result.usage.output_tokens
                              ).toLocaleString()}{" "}
                              tokens
                            </Badge>
                          ) : null}
                        </div>
                        {message.result.actions.length ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {message.result.actions.map((action) => (
                              <Link
                                key={action.kind + ":" + action.href + ":" + action.label}
                                href={action.href}
                                className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                              >
                                <span>{action.label}</span>
                                <ArrowUpRight className="size-4 text-muted-foreground" />
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : message.usage ? (
                      <Badge variant="outline" className="mt-3 tabular-nums">
                        {(
                          (message.usage.input_tokens ?? 0) +
                          (message.usage.output_tokens ?? 0)
                        ).toLocaleString()}{" "}
                        tokens
                      </Badge>
                    ) : null}
                  </CardContent>
                </Card>
              )
            )}

            {messages.length === 0 ? (
              <div className="m-auto max-w-md text-center">
                <Sparkles className="mx-auto mb-3 size-8 text-primary" />
                <p className="font-semibold">What should SEM Brain operate?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try: “Create a board named Uzbekistan launch for Steppe AI, Inc.”
                </p>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {actionError ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {actionError}
            </p>
          ) : null}

          <Card className="bg-card/95">
            <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row">
              <Textarea
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Message SEM Brain…"
                className="min-h-20 flex-1 resize-none"
              />
              <Button
                onClick={() => void send()}
                disabled={isStreaming || !command.trim()}
                className="sm:self-end"
              >
                {isStreaming ? "Working…" : "Send"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}