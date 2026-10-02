import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getUpdateState } from "@/lib/data/factory-update";
import { RefusalNotice } from "../computers/shared";
import { UpdatePanel } from "./update-panel";

// Brain OS -> Factory -> Update (founder decision 2026-10-03). Server truth only: what is prepared comes from the Factory's release
// storage and what is published from the Factory, read with the viewer's own Brain OS session on this request. A viewer who is not
// a Factory admin sees the Factory's refusal by name and no data; whether an update may be authorized is decided by the Factory on
// the call (founder-only, and a fresh password entry) - never by this page.
export const dynamic = "force-dynamic";

export default async function FactoryUpdatePage() {
  const state = await getUpdateState();
  if (!state.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={RefreshCw} title="Factory Update" description="Authorize the prepared Factory release." />
        <RefusalNotice result={state} context="Factory" />
      </div>
    );
  }
  return <UpdatePanel state={state} />;
}
