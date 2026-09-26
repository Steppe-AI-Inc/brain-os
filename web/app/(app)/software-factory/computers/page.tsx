import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  listComputers,
  listPolicies,
  listReleases,
  listWaitingVerifications,
  listWork,
  releaseDownloadUrls,
} from "@/lib/data/factory-computers";
import { ComputersView } from "./computers-view";
import { RefusalNotice, type Downloads } from "./shared";

// Brain OS -> Factory -> Computers (WO-8; contract §7). Server truth only: every value on this page comes from one Factory Admin
// API read made with the viewer's own Brain OS session, on this request. A viewer who is not a Factory admin sees the Factory's
// refusal by name and no data (S-8) - the page does not decide that; the Factory does.
export const dynamic = "force-dynamic";

export default async function FactoryComputersPage() {
  const computers = await listComputers(true);
  if (!computers.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={Cpu} title="Factory Computers" description="Computers enrolled in the Factory." />
        <RefusalNotice result={computers} context="Factory" />
      </div>
    );
  }
  const [releases, policies, waiting, work] = await Promise.all([listReleases(), listPolicies(), listWaitingVerifications(), listWork()]);

  // the published release of each channel, and where the public storage serves it (CR-004 Option A)
  const downloads: Record<string, Downloads> = {};
  if (releases.ok) {
    for (const r of releases.releases.items) {
      if (r.state !== "published" || downloads[r.channel]) continue;
      const urls = await releaseDownloadUrls(r.channel, r.version);
      downloads[r.channel] = urls ? { channel: r.channel, version: r.version, ...urls } : null;
    }
  }
  const defaultChannel = downloads.production ? "production" : "dev";

  return (
    <ComputersView
      computers={computers}
      releases={releases}
      policies={policies}
      waiting={waiting}
      work={work}
      downloads={downloads}
      defaultChannel={defaultChannel}
    />
  );
}
