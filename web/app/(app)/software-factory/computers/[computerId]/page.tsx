import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getComputer, listReleases, releaseDownloadUrls } from "@/lib/data/factory-computers";
import { ComputerDetail } from "./computer-detail";
import { RefusalNotice, type Downloads } from "../shared";

// One computer, as the Factory reports it (WO-8): its principals, credentials, pairing codes, runtime, envelope and history, and
// every lifecycle action with its inverse. A computer of another tenant, or one that does not exist, is the same "not found".
export const dynamic = "force-dynamic";

export default async function FactoryComputerPage({ params }: { params: Promise<{ computerId: string }> }) {
  const { computerId } = await params;
  const detail = /^[0-9a-f-]{36}$/.test(computerId)
    ? await getComputer(computerId)
    : ({ ok: false, refused: "not_found", message: "no such computer" } as const);
  if (!detail.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={Cpu} title="Factory Computer" />
        <RefusalNotice result={detail} context="Factory" />
      </div>
    );
  }
  const releases = await listReleases();
  let downloads: Downloads = null;
  if (releases.ok) {
    const published = releases.releases.items.find((r) => r.state === "published" && r.channel === "production")
      ?? releases.releases.items.find((r) => r.state === "published");
    const urls = published ? await releaseDownloadUrls(published.channel, published.version) : null;
    if (published && urls) downloads = { channel: published.channel, version: published.version, ...urls };
  }
  return <ComputerDetail detail={detail} releases={releases.ok ? releases.releases.items : []} downloads={downloads} />;
}
