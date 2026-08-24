import { getAiProviders } from "@/lib/data/ai-providers";
import { getUsageSummary } from "@/lib/data/usage";
import { getChatHistory } from "@/lib/data/chat-history";
import { getChannels } from "@/lib/data/chat-channels";
import { getCompanies } from "@/lib/data/companies";
import { ChatClient } from "./chat-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel } = await searchParams;
  const activeChannelId = channel || null;

  const [providers, usageSummary, history, channels, companies] = await Promise.all([
    getAiProviders(),
    getUsageSummary(),
    activeChannelId ? getChatHistory(30, activeChannelId) : Promise.resolve([]),
    getChannels(),
    getCompanies(),
  ]);

  return (
    <ChatClient
      providers={providers}
      usageSummary={usageSummary}
      history={history}
      channels={channels}
      activeChannelId={activeChannelId}
      companies={companies.map((company) => ({
        id: company.id,
        name: company.name,
        legal_entity_name: company.legal_entity_name,
        country: company.country,
        aliases: company.aliases,
      }))}
    />
  );
}
