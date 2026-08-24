import { getAiProviders } from "@/lib/data/ai-providers";
import { getUsageSummary } from "@/lib/data/usage";
import { getChatHistory } from "@/lib/data/chat-history";
import { getChannels } from "@/lib/data/chat-channels";
import { ChatClient } from "./chat-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel } = await searchParams;
  const activeChannelId = channel || null;

  const [providers, usageSummary, history, channels] = await Promise.all([
    getAiProviders(),
    getUsageSummary(),
    activeChannelId ? getChatHistory(30, activeChannelId) : Promise.resolve([]),
    getChannels(),
  ]);

  return (
    <ChatClient
      providers={providers}
      usageSummary={usageSummary}
      history={history}
      channels={channels}
      activeChannelId={activeChannelId}
    />
  );
}
