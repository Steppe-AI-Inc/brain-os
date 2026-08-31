import { PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getPluginComponents } from "@/lib/data/factory";
import { PluginList } from "./plugin-list";

// Phase 6 — the plugin/skill registry made genuinely useful, per the founder's explicit
// requirement: every field here is real registry/attachment/runtime state, never a
// hardcoded badge. install_status walks the real lifecycle (discovered -> reviewing ->
// quarantined -> testing -> installed -> enabled/disabled/failed/update_available -
// 202608310005) - a component sitting at "discovered" is shown as exactly that, never
// rounded up to "Installed" just because a GitHub source exists for it. `health` is a
// SEPARATE, independently-computed field (lib/data/factory.ts) - lifecycle state and
// runtime health are never conflated.
//
// Enable/Disable are real, immediate, governed server actions (lib/data/plugins.ts) -
// not cosmetic. Sandbox-test/Review/Update/Rollback need local filesystem access
// unavailable to this hosted page, so they live on the component detail page as queued
// governed actions (plugin_operation_requests -> poll-plugin-operations.mjs on the
// always-on Runner) - see that page and lib/data/plugins.ts for why the split exists.

export default async function PluginsPage() {
  const components = await getPluginComponents();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={PackageSearch}
        title="Plugin / Skill Registry"
        description="Real GitHub-sourced components — every pinned SHA, review result, attachment, health, and runtime-use timestamp here is live canonical state, never a cosmetic badge."
      />
      <PluginList initial={components} />
    </div>
  );
}
