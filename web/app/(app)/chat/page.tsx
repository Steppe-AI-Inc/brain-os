import { getAiProviders } from "@/lib/data/ai-providers";
import { getUsageSummary } from "@/lib/data/usage";
import { getChatHistory } from "@/lib/data/chat-history";
import { getChannelsForSidebar } from "@/lib/data/chat-channels";
import { getMemoriesForEntity } from "@/lib/data/memory";
import { ChatClient } from "./chat-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel } = await searchParams;
  // No `channel` param = a brand-new blank chat, ChatGPT-style — does not auto-load the
  // legacy flat history. `channel=general` explicitly opens that legacy history (channel_id
  // is null in the DB). Any other value is a real chat_channels.id.
  const isBlank = !channel;
  const isGeneral = channel === "general";
  const dbChannelId = isGeneral ? null : channel || null;

  const [providers, usageSummary, history, channels, channelMemories] = await Promise.all([
    getAiProviders(),
    getUsageSummary(),
    isBlank ? Promise.resolve([]) : getChatHistory(30, dbChannelId),
    getChannelsForSidebar(),
    !isBlank && !isGeneral && channel ? getMemoriesForEntity("chat_channel", channel) : Promise.resolve([]),
  ]);
  return (
    <ChatClient
      providers={providers}
      usageSummary={usageSummary}
      history={history}
      channels={channels}
      activeChannelId={isBlank ? null : channel!}
      channelMemories={channelMemories}
    />
  );
}
