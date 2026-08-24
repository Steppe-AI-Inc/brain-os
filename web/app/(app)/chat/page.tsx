import { getAiProviders } from "@/lib/data/ai-providers";
import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const providers = await getAiProviders();
  return <ChatClient providers={providers} />;
}
