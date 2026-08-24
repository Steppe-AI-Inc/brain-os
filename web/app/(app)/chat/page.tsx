import { getAiProviders } from "@/lib/data/ai-providers";
import { getUsageSummary } from "@/lib/data/usage";
import { getChatHistory } from "@/lib/data/chat-history";
import { getChannels } from "@/lib/data/chat-channels";
import { getMemoriesForEntity } from "@/lib/data/memory";
import { ChatClient } from "./chat-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel } = await searchParams;
  const activeChannelId = channel || null;

  const [providers, usageSummary, history, channels, channelMemories] = await Promise.all([
    getAiProviders(),
    getUsageSummary(),
    getChatHistory(30, activeChannelId),
    getChannels(),
    activeChannelId ? getMemoriesForEntity("chat_channel", activeChannelId) : Promise.resolve([]),
  ]);
  return (
    <ChatClient
      providers={providers}
      usageSummary={usageSummary}
      history={history}
      channels={channels}
      activeChannelId={activeChannelId}
      channelMemories={channelMemories}
    />
  );
}
