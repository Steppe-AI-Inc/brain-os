"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown, ChevronUp, Paperclip, Mic, MicOff, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
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
import { createChannel, renameChannel, setChannelCompanyId, type SidebarChannel } from "@/lib/data/chat-channels";
import { ChannelSidebar } from "./channel-sidebar";

// The Web Speech API has no standard TS lib entry (still vendor-prefixed as
// webkitSpeechRecognition in Chrome/Edge) — minimal shape for just what's used here.
type SpeechRecognitionResultLike = { 0?: { transcript?: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

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
  // null for an optimistic message that hasn't round-tripped through
  // create_pending_work_order yet (see the `work_order` SSE-event handler in send()) or
  // for a message replayed from history before the ordering/pagination fix (defensively
  // tolerated, never assumed present). Real identity for dedupe/merge across reloads,
  // pagination, and the reconnect poll — the whole reason none of that was possible
  // before (Message had no id at all).
  workOrderId: string | null;
  createdAt: string | null;
  command: string;
  status: "streaming" | "done" | "error";
  usage: Usage | null;
  result?: ChatResult;
  error?: string;
  imagePreviewUrl?: string;
};

type AttachedImage = { base64: string; mimeType: string; previewUrl: string; name: string };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
    return {
      workOrderId: h.workOrderId,
      createdAt: h.createdAt,
      command: h.command,
      status: "error",
      usage,
      error: h.output?.error || "Command failed.",
    };
  }
  if (h.status !== "done") {
    return { workOrderId: h.workOrderId, createdAt: h.createdAt, command: h.command, status: "streaming", usage };
  }
  return {
    workOrderId: h.workOrderId,
    createdAt: h.createdAt,
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
      // Not persisted in history (only ever used transiently right after a fresh reply
      // to backfill the channel's company_id) — irrelevant when replaying past history.
      primaryCompanyId: null,
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
  const [error, setError] = useState<string | null>(null);
  const active = providers.find((p) => p.is_active);

  function onChange(v: unknown) {
    if (typeof v !== "string") return;
    setError(null);
    startTransition(async () => {
      // setActiveProvider now checks affected rows for real (ai_providers_update_founder_only
      // RLS — see qa/KNOWN_FAILURE_MODES.md #18); this result used to be discarded, so a
      // non-founder's blocked switch had no way to reach the user.
      const result = await setActiveProvider(v);
      if (result) setError(result);
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
    <div className="flex flex-col gap-1">
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
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

// Founder-facing chat should read like a result, not a diagnostics panel — task/approval
// counts, model name, and token usage are real and sometimes useful, but showing them on
// every single reply is exactly the "0 task(s) 2 approval(s) claude-haiku-4-5 15,888
// tokens" noise the product's own UX policy calls out. Collapsed by default, one click
// away per message — nothing is deleted, it just isn't the founder's default view.
function MessageDetails({ result }: { result: ChatResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Details
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Badge variant="outline">{result.taskCount} task(s)</Badge>
          <Badge variant="outline">{result.approvalCount} approval(s)</Badge>
          {!!result.deletedCount && <Badge variant="outline">{result.deletedCount} task(s) deleted</Badge>}
          {!!result.companyCount && (
            <Badge variant="outline">{result.companyCount} compan{result.companyCount === 1 ? "y" : "ies"}</Badge>
          )}
          {!!result.personCount && <Badge variant="outline">{result.personCount} people</Badge>}
          {!!result.projectCount && <Badge variant="outline">{result.projectCount} project(s)</Badge>}
          {!!result.goalCount && <Badge variant="outline">{result.goalCount} goal(s)</Badge>}
          {!!result.relationshipCount && <Badge variant="outline">{result.relationshipCount} relationship(s)</Badge>}
          {!!result.assignmentCount && <Badge variant="outline">{result.assignmentCount} assignment(s)</Badge>}
          {!!result.memoryCount && <Badge variant="outline">{result.memoryCount} memory fact(s) saved</Badge>}
          <Badge variant="secondary">{result.model}</Badge>
          {result.usage && (
            <Badge variant="outline" className="tabular-nums">
              {(result.usage.input_tokens + result.usage.output_tokens).toLocaleString()} tokens
            </Badge>
          )}
        </div>
      )}
    </div>
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

// Persists which conversation is "active" across normal in-app navigation (the main nav's
// "Speak with Brain OS" link is a plain href="/chat", so without this every trip through
// Tasks/Approvals and back landed on a forced-blank chat — the founder's own words: he
// shouldn't have to "open Channels, find conversation, select latest chat" every time).
// sessionStorage, not localStorage: scoped to this browser tab/session, matching "same
// login + same browser session -> return to last active conversation," and a fresh tab is
// a fresh session, matching "new session -> blank chat" by default.
const ACTIVE_CHANNEL_KEY = "brainos.chat.activeChannelId";

// Same sessionStorage pattern as ACTIVE_CHANNEL_KEY above, deliberately — per-channel,
// per-tab-session, not persisted across a real new login/session. Value is the scrolled
// container's scrollTop in px at the time of the last debounced write for that channel.
const SCROLL_POSITION_KEY_PREFIX = "brainos.chat.scrollTop.";

// How many older turns a single "Load older messages" click fetches — matches the page's
// initial-history page size (web/app/(app)/chat/page.tsx), so a short return means there
// is genuinely nothing further back, not just an arbitrary smaller batch.
const HISTORY_PAGE_SIZE = 30;
// Debounce window for persisting scroll position — frequent enough to feel responsive on
// return, infrequent enough not to hammer sessionStorage on every scroll frame.
const SCROLL_PERSIST_DEBOUNCE_MS = 300;

export function ChatClient({
  providers,
  usageSummary,
  history,
  channels,
  activeChannelId,
  channelMemories,
  forceNew,
}: {
  providers: ProviderRow[];
  usageSummary: { today: UsageSummary; last7d: UsageSummary; last30d: UsageSummary };
  history: ChatHistoryMessage[];
  channels: SidebarChannel[];
  activeChannelId: string | null;
  channelMemories: Array<{ id: string; fact: string; confidence: number | null }>;
  forceNew: boolean;
}) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => history.map(historyToMessage));
  const [isStreaming, setIsStreaming] = useState(false);

  // 6b: "load older messages" pagination state. A full page (exactly the page size) means
  // there could be more before it; anything short of that means this channel's entire
  // history is already loaded — recomputed on every channel switch below since a short
  // page for channel A says nothing about channel B.
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(() => history.length >= HISTORY_PAGE_SIZE);

  // 6c: scroll-position persistence. The container ref is read from directly (not via
  // state) so persisting/restoring never itself triggers a re-render.
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set true for the one render right after send() optimistically appends a message —
  // consumed by the very next messages-changed effect to force-scroll to bottom, then
  // cleared, so it never fires again for later patches (usage ticks, the final `done`
  // patch) to that same message, and never fires for a channel switch or the reconnect
  // poll (see their own effects below).
  const forceScrollToBottomRef = useRef(false);

  // Switching channels (or landing on a fresh blank chat) re-runs the page.tsx Server
  // Component with a new `history` prop (same client component instance, App Router
  // doesn't remount on a search-param-only navigation) — derive-during-render, not
  // useEffect+setState, per this project's react-hooks/set-state-in-effect lint rule.
  const [syncedChannelId, setSyncedChannelId] = useState(activeChannelId);
  if (activeChannelId !== syncedChannelId) {
    setSyncedChannelId(activeChannelId);
    setMessages(history.map(historyToMessage));
    setHasMoreOlder(history.length >= HISTORY_PAGE_SIZE);
  }
  // Session = cumulative since this tab loaded. Request = only the current/most recent
  // send. Today/30d = real DB aggregates (getUsageSummary()), refreshed after each reply
  // — separate scopes on purpose, per the founder's ask: "top should be session/daily/
  // monthly totals, near the chatbox should be just that one request."
  const [sessionTotal, setSessionTotal] = useState<TokenCost>(ZERO);
  const [requestUsage, setRequestUsage] = useState<TokenCost>(ZERO);
  const [dbSummary, setDbSummary] = useState(usageSummary);

  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Must start false and flip post-mount via effect, not a lazy useState initializer —
  // this renders a real DOM node (the mic button) only when supported, so a render-time
  // window check here caused a genuine server/client hydration mismatch in production
  // (server has no window -> false; client in Chrome -> true -> extra button node).
  // Deferring to useEffect is React's own documented pattern for "sync with a
  // browser-only capability check" for exactly this reason.
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above the state declaration
    setSpeechSupported(!!getSpeechRecognitionCtor());
  }, []);

  // Restore-on-navigate / persist-on-change. A real channel loaded (from a nav link, a
  // direct URL, or after send() creates one) is remembered; landing on a genuinely blank
  // chat with nothing remembered, or via the explicit "New chat" button (forceNew), stays
  // blank. router.replace (not push) so restoring doesn't add a back-button entry.
  useEffect(() => {
    if (activeChannelId !== null) {
      try {
        sessionStorage.setItem(ACTIVE_CHANNEL_KEY, activeChannelId);
      } catch {
        // per-tab convenience only — fine if it doesn't persist
      }
      return;
    }
    if (forceNew) {
      try {
        sessionStorage.removeItem(ACTIVE_CHANNEL_KEY);
      } catch {
        // same as above
      }
      return;
    }
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(ACTIVE_CHANNEL_KEY);
    } catch {
      stored = null;
    }
    if (stored) {
      router.replace(`/chat?channel=${stored}`, { scroll: false });
    }
  }, [activeChannelId, forceNew, router]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAttachError(null);
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setAttachError("Only PNG, JPEG, WEBP, or GIF images are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachError("Image is too large — 5MB max.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setAttachedImage({ base64, mimeType: file.type, previewUrl: dataUrl, name: file.name });
    };
    reader.onerror = () => setAttachError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) setCommand((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  const activeModel = providers.find((p) => p.is_active)?.model || "unknown";

  function patchMessage(index: number, patch: Partial<Message> | ((prev: Message) => Partial<Message>)) {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m))
    );
  }

  // 6c: restore scroll position after messages for this channel have actually rendered —
  // runs post-commit (useEffect, not during render), and `syncedChannelId` only changes in
  // the same commit that `messages` is replaced for a channel switch (derive-during-render
  // above), so by the time this runs the DOM already reflects the new message list, never
  // the stale one. Also covers first mount (effects run once after the initial commit too).
  // No stored position (first visit to a channel this session, or a blank chat) falls back
  // to the bottom, which is the sensible default for a newest-at-bottom chat log.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    let stored: string | null = null;
    if (syncedChannelId) {
      try {
        stored = sessionStorage.getItem(SCROLL_POSITION_KEY_PREFIX + syncedChannelId);
      } catch {
        stored = null;
      }
    }
    const parsed = stored !== null ? Number(stored) : NaN;
    container.scrollTop = Number.isFinite(parsed) ? parsed : container.scrollHeight;
    // A restored/defaulted position is not a "genuinely new send" — make sure a stale
    // pending flag from before this channel switch can't also force a bottom-scroll.
    forceScrollToBottomRef.current = false;
  }, [syncedChannelId]);

  // Force-scroll-to-bottom exactly once per genuinely new send (see send() below setting
  // the ref), never on a channel switch (handled above) and never on later patches to the
  // same message (usage ticks, the final `done` patch) or the reconnect poll's merge.
  useEffect(() => {
    if (!forceScrollToBottomRef.current) return;
    forceScrollToBottomRef.current = false;
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const channelKey = syncedChannelId;
    if (!channelKey) return; // nothing to persist for a blank, channel-less chat
    const top = e.currentTarget.scrollTop;
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(SCROLL_POSITION_KEY_PREFIX + channelKey, String(top));
      } catch {
        // per-tab convenience only — fine if it doesn't persist
      }
    }, SCROLL_PERSIST_DEBOUNCE_MS);
  }

  // 6b: real "load older messages" pagination — cursors on the oldest currently-loaded
  // turn's createdAt (chronological order means that's always messages[0]), merges by
  // workOrderId (dedupe) and prepends, rather than ever replacing what's already loaded.
  async function loadOlderMessages() {
    if (isLoadingOlder || !hasMoreOlder) return;
    const cursor = messages[0]?.createdAt;
    if (!cursor) {
      setHasMoreOlder(false);
      return;
    }
    setIsLoadingOlder(true);
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;
    try {
      const older = await getChatHistory(HISTORY_PAGE_SIZE, toDbChannelId(activeChannelId), cursor);
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.workOrderId).filter((id): id is string => !!id));
        const olderNotAlreadyLoaded = older.filter((h) => !seen.has(h.workOrderId)).map(historyToMessage);
        return [...olderNotAlreadyLoaded, ...prev];
      });
      if (older.length < HISTORY_PAGE_SIZE) setHasMoreOlder(false);
      // Prepending shifts every existing row down — without this the view visually jumps
      // because scrollTop stays the same absolute pixel offset while content above it grew.
      // Restore the same *visual* position by offsetting by exactly how much taller the
      // container got, once the DOM has actually reflowed for the prepended rows.
      requestAnimationFrame(() => {
        const c = messagesContainerRef.current;
        if (c) c.scrollTop = prevScrollTop + (c.scrollHeight - prevScrollHeight);
      });
    } finally {
      setIsLoadingOlder(false);
    }
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
      const fresh = await getChatHistory(HISTORY_PAGE_SIZE, toDbChannelId(activeChannelId));
      if (cancelled) return;
      // 6d race #2: an unconditional replace here could stomp a message this tab sent
      // itself in the meantime that hasn't reached the server's own history query yet
      // (create_pending_work_order persists before generation starts, but a fast poll
      // tick can still land just before that commit is visible to a fresh SELECT). Never
      // drop a local message that (a) isn't in this fresh snapshot yet — by workOrderId,
      // or has no workOrderId at all because the `work_order` SSE event hasn't arrived
      // either — and (b) hasn't reached a terminal 'done' state; merge those in after the
      // fresh snapshot instead of replacing wholesale.
      const freshWorkOrderIds = new Set(fresh.map((f) => f.workOrderId));
      setMessages((prev) => {
        const freshMessages = fresh.map(historyToMessage);
        const localOnlyInFlight = prev.filter(
          (m) => m.status !== "done" && (!m.workOrderId || !freshWorkOrderIds.has(m.workOrderId))
        );
        return [...freshMessages, ...localOnlyInFlight];
      });
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
    const image = attachedImage;
    const trimmed = command.trim() || (image ? "Look at the attached image and tell me what you see." : "");
    if (!trimmed || isStreaming) return;
    setCommand("");
    setAttachedImage(null);
    setAttachError(null);
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
    // A genuinely new send — force-scroll to bottom once the appended message actually
    // renders (see the `[messages]` effect above), regardless of where the reader had
    // scrolled to reading older history.
    forceScrollToBottomRef.current = true;
    setMessages((prev) => {
      index = prev.length;
      return [
        ...prev,
        {
          workOrderId: null,
          createdAt: null,
          command: trimmed,
          status: "streaming",
          usage: null,
          imagePreviewUrl: image?.previewUrl,
        },
      ];
    });

    let finalSummary: string | null = null;
    let finalPrimaryCompanyId: string | null = null;
    await consumeChatStream(
      trimmed,
      (evt) => {
        if (evt.type === "work_order") {
          // 6d race #1: create_pending_work_order already persisted a real row server-side
          // before generation even starts — backfill the optimistic message's id the
          // moment this arrives so a navigate-away-and-back during the remaining
          // generation window picks this exact message back up from getChatHistory
          // (merge-by-workOrderId, 6b) instead of losing it or duplicating it.
          patchMessage(index, { workOrderId: evt.id });
        } else if (evt.type === "usage") {
          const input = evt.input_tokens ?? 0;
          const output = evt.output_tokens ?? 0;
          setRequestUsage({ tokens: input + output, costUsd: estimateCost(activeModel, input, output) });
          patchMessage(index, { usage: { input_tokens: input, output_tokens: output } });
        } else if (evt.type === "done") {
          const result = toChatResult(evt);
          finalSummary = result.summary;
          finalPrimaryCompanyId = result.primaryCompanyId;
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
      },
      targetChannelId,
      image ? { base64: image.base64, mimeType: image.mimeType } : null
    );

    if (newChannelId) {
      // Re-title from what the AI actually understood the command to be about, once it's
      // known — a better name than the raw first message, still zero extra API calls.
      if (finalSummary) await renameChannel(newChannelId, deriveChannelTitle(finalSummary));
      // Same "known only after the model responds" backfill, for company_id
      // (KNOWN_FAILURE_MODES.md #7) — best-effort, no result to check (see
      // setChannelCompanyId's own comment).
      if (finalPrimaryCompanyId) await setChannelCompanyId(newChannelId, finalPrimaryCompanyId);
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
        description="Ask a question or give a command — Brain OS pulls real data and routes anything high-risk to you for approval."
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

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <ChannelSidebar channels={channels} activeChannelId={activeChannelId} defaultCollapsedOnMobile />
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <ChannelMemoryStrip memories={channelMemories} />
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex flex-1 flex-col gap-3 overflow-auto rounded-xl bg-muted/30 p-4"
          >
            {!isBlank && messages.length > 0 && hasMoreOlder && (
              <div className="flex justify-center pb-1">
                <Button type="button" variant="outline" size="sm" onClick={loadOlderMessages} disabled={isLoadingOlder}>
                  {isLoadingOlder ? "Loading…" : "Load older messages"}
                </Button>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={m.workOrderId ?? `local-${i}`} className="flex flex-col gap-2">
                <div className="ml-auto flex max-w-lg flex-col items-end gap-1.5">
                  {m.imagePreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- a local data: URL, not a remote asset Next's optimizer can handle
                    <img src={m.imagePreviewUrl} alt="Attached" className="max-h-40 rounded-xl border border-border/60 object-cover" />
                  )}
                  <div className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">{m.command}</div>
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
                        {m.result?.summary && (
                          <div className="flex flex-col gap-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
                            <ReactMarkdown>{m.result.summary}</ReactMarkdown>
                          </div>
                        )}
                        {m.result && <MessageDetails result={m.result} />}
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
              {attachedImage && (
                <div className="flex w-fit items-center gap-2 rounded-lg border border-border/60 bg-muted/40 py-1 pl-1 pr-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, not a remote asset */}
                  <img src={attachedImage.previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
                  <span className="max-w-40 truncate text-xs text-muted-foreground">{attachedImage.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {attachError && <p className="text-xs font-medium text-destructive">{attachError}</p>}
              <div className="flex gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Attach an image"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  {speechSupported && (
                    <Button
                      type="button"
                      variant={isRecording ? "default" : "outline"}
                      size="icon"
                      title={isRecording ? "Stop recording" : "Speak your message"}
                      onClick={toggleRecording}
                    >
                      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                <Textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={isRecording ? "Listening…" : "Message Brain OS…"}
                  className="min-h-16"
                />
                <Button onClick={send} disabled={isStreaming || (!command.trim() && !attachedImage)}>
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
