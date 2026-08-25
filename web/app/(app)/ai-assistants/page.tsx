import { Bot } from "lucide-react";
import { getPersonAiPolicies, getAiReplyLog } from "@/lib/data/ai-assistants";
import { getCurrentProfile } from "@/lib/data/profile";
import { PageHeader } from "@/components/page-header";
import { AiAssistantsTable } from "./ai-assistants-table";
import { AiReplyLogFeed } from "./ai-reply-log-feed";

export const maxDuration = 30;

export default async function AiAssistantsPage() {
  const [people, replyLog, profile] = await Promise.all([getPersonAiPolicies(), getAiReplyLog(), getCurrentProfile()]);
  const canEdit = profile?.role === "founder" || profile?.role === "holding_admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Bot}
        title="AI Assistants"
        description="Every active person has a paired AI assistant. Automation level is set by the founder only — employees can reply themselves, but can't grant their own assistant broader authority."
      />
      <AiAssistantsTable people={people} canEdit={canEdit} />
      <AiReplyLogFeed entries={replyLog} />
    </div>
  );
}
