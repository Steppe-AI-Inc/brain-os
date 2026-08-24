import { getChatWorkspace } from "@/lib/data/chat";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getChatWorkspace(params.thread);
  return (
    <ChatClient
      key={workspace.activeThreadId ?? "new-chat"}
      initialThreads={workspace.threads}
      initialThreadId={workspace.activeThreadId}
      initialMessages={workspace.messages}
    />
  );
}