import { getAiProviders } from "@/lib/data/ai-providers";
import { getUsageSummary } from "@/lib/data/usage";
import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const [providers, usageSummary] = await Promise.all([getAiProviders(), getUsageSummary()]);
  return <ChatClient providers={providers} usageSummary={usageSummary} />;
}
