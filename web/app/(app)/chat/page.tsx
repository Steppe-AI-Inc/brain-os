import { getAiProviders } from "@/lib/data/ai-providers";
import { getUsageSummary } from "@/lib/data/usage";
import { getChatHistory } from "@/lib/data/chat-history";
import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const [providers, usageSummary, history] = await Promise.all([
    getAiProviders(),
    getUsageSummary(),
    getChatHistory(30),
  ]);
  return <ChatClient providers={providers} usageSummary={usageSummary} history={history} />;
}
