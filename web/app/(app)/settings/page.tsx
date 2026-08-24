import { Settings2 } from "lucide-react";
import { getAiProviders } from "@/lib/data/ai-providers";
import { getMcpConnectors } from "@/lib/data/mcp-connectors";
import { getUsageSummary, getRecentUsage } from "@/lib/data/usage";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProvidersPanel } from "./providers-panel";
import { McpConnectorsPanel } from "./mcp-connectors-panel";
import { UsagePanel } from "./usage-panel";

export default async function SettingsPage() {
  const [providers, connectors, usageSummary, recentUsage] = await Promise.all([
    getAiProviders(),
    getMcpConnectors(),
    getUsageSummary(),
    getRecentUsage(20),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Settings2}
        title="Settings"
        description="AI providers, MCP connectors, and real token/usage tracking."
      />

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="mcp">MCP Connectors</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4">
          <ProvidersPanel providers={providers} />
        </TabsContent>
        <TabsContent value="mcp" className="mt-4">
          <McpConnectorsPanel connectors={connectors} />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <UsagePanel summary={usageSummary} recent={recentUsage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
