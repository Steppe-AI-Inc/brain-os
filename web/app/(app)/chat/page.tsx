import { getAiProviders } from "@/lib/data/ai-providers";
import { getUsageSummary } from "@/lib/data/usage";
import { getChatHistory } from "@/lib/data/chat-history";
import { getChannelsForSidebar } from "@/lib/data/chat-channels";
import { getMemoriesForEntity } from "@/lib/data/memory";
import { ChatClient } from "./chat-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; new?: string }>;
}) {
  const { channel, new: isNewParam } = await searchParams;
  // No `channel` param = a brand-new blank chat, ChatGPT-style — does not auto-load the
  // legacy flat history. `channel=general` explicitly opens that legacy history (channel_id
  // is null in the DB). Any other value is a real chat_channels.id. `?new=1` (only set by
  // the explicit "New chat" button) tells ChatClient not to restore the last active
  // conversation from sessionStorage even though channel is also absent here — see
  // ChatClient's restore effect for the other half of this.
  const isBlank = !channel;
  const isGeneral = channel === "general";
  const dbChannelId = isGeneral ? null : channel || null;
  const forceNew = isBlank && isNewParam === "1";

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
      forceNew={forceNew}
    />
  );
}
