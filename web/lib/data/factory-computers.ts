"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { callFactoryAdmin, type AdminResult } from "@/lib/factory/admin-client";
import { factoryReleasesUrl, INSTALLER_FILE, MANIFEST_FILE } from "@/lib/factory/config";
import { authenticodeImageHash, certificateTable } from "@/lib/factory/pe-image";

// Brain OS -> Factory -> Computers (WO-8). Every read and every action here is ONE Factory Admin API call made with the signed-in
// user's own Brain OS token (lib/factory/admin-client.ts); the Factory decides who may do what, on every call. Reads return the
// server's truth or its named refusal (the page shows the refusal by name, never an empty list that looks like "no computers").
// Mutations return the Factory's receipt - including the pairing code, shown ONCE - and re-read the page from the server.

export type Envelope = {
  version: number;
  roles: string[];
  capabilities: string[];
  work_types: string[] | null;
  company_ids: string[] | null;
  max_concurrent_runs: number;
  max_heavy: number;
  preferred_work_class: string | null;
  created_at: string;
  created_by: string | null;
  reason: string | null;
};

export type Principal = {
  principal_id: string;
  node_id: string;
  created_via: string;
  created_at: string;
  state: string;
  credential: {
    credential_id: string;
    status: string;
    key_thumbprint: string;
    issued_at: string;
    issued_via: string;
    revoked_at: string | null;
    revoke_reason: string | null;
    rotation_requested: boolean;
  } | null;
  enrollment_state: string | null;
  code: { code_id: string; state: string; purpose: string; expires_at: string; failed_attempts: number } | null;
  runtime: {
    phase: string | null;
    liveness: string;
    heartbeat_age_s: number | null;
    runtime_version: string | null;
    runtime_digest: string | null;
    release_id: string | null;
    reported_hostname: string | null;
    reported_os: string | null;
    machine_fingerprint: string | null;
    reported_resources: Record<string, unknown> | null;
  } | null;
};

export type Computer = {
  computer_id: string;
  display_name: string;
  created_at: string;
  created_by: string;
  state: string;
  archived_at: string | null;
  draining: boolean;
  drain_requested_at: string | null;
  s16a_bound: boolean;
  s16a_bound_at: string | null;
  envelope: Envelope | null;
  adopted_release_id: string | null;
  registered_fingerprint: string | null;
  fingerprints: string[];
  principals: Principal[];
  runs_in_progress: number;
  server_time: string;
};

export type Collection<T> = { items: T[]; shown: number; total: number; truncated: boolean; order: string; scope?: string };

export type Release = {
  release_id: string;
  channel: string;
  version: string;
  source_sha: string;
  digest: string;
  key_id: string;
  receipt_sha256: string;
  state: string;
  published_at: string;
  superseded_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export type Revocations = { key_ids: string[]; releases: { release_id?: string; digest: string }[] };

export type Policy = {
  policy_id: string;
  scope: string;
  campaign_key: string | null;
  version: number;
  frozen: boolean;
  require_distinct_run: boolean;
  require_distinct_identity: boolean;
  require_verifier_authority: boolean;
  require_physical_separation: boolean;
  restrict_bound_computer_authoring: boolean;
  director_document_paths: string[];
  [key: string]: unknown;
};

export type WorkOrderView = {
  work_order_id: string;
  title: string;
  work_type: string;
  priority: number;
  requires_security_role: string;
  requires_verification: boolean;
  campaign_key: string | null;
  owned_surface: string[];
  verifies_work_order_id: string | null;
};

export type Waiting = {
  work_order: WorkOrderView;
  state: string;
  since: string;
  reason: string | null;
  verification_work_order_id: string | null;
  candidate_run_id: string | null;
  eligible_verifiers: number;
  nodes: { node_id: string; first_failing_gate: { gate: number; gate_name: string; detail: string } | null }[];
};

export type WorkItem = WorkOrderView & {
  status: string;
  verification_state: string | null;
  queued_at: string;
  completed_at: string | null;
  runs: { run_id: string; node_id: string; computer_id: string | null; kind: string; status: string; started_at: string; finished_at: string | null; runtime_version: string | null; termination_reason: string | null }[];
};

export type ComputerList = { server_time: string; computers: Collection<Computer>; counts_by_state: Record<string, number> };
export type ComputerDetail = { computer: Computer; envelope_history: Envelope[]; audit: { at: string; actor_kind: string; actor_id: string; action: string; outcome: string; reason: string | null; detail: Record<string, unknown> | null }[] };
export type Receipt = Record<string, unknown> & { already?: boolean; pairing_code?: string; expires_at?: string; computer_id?: string };

// ---- reads -------------------------------------------------------------------------------------------------------------------
export async function listComputers(includeArchived = false): Promise<AdminResult<ComputerList>> {
  return callFactoryAdmin<ComputerList>("list-computers", { include_archived: includeArchived, limit: 200 });
}
export async function getComputer(computerId: string): Promise<AdminResult<ComputerDetail>> {
  return callFactoryAdmin<ComputerDetail>("get-computer", { computer_id: computerId });
}
export async function listReleases(): Promise<AdminResult<{ releases: Collection<Release>; revocations: Revocations }>> {
  return callFactoryAdmin("list-releases");
}
export async function listPolicies(): Promise<AdminResult<{ policies: Policy[]; versions: { policy_id: string; version: number; recorded_at: string; recorded_by: string }[] }>> {
  return callFactoryAdmin("list-policies");
}
export async function listWaitingVerifications(): Promise<AdminResult<{ waiting: Collection<Waiting> }>> {
  return callFactoryAdmin("list-waiting-verifications");
}
export async function listWork(): Promise<AdminResult<{ work: Collection<WorkItem> }>> {
  return callFactoryAdmin("list-work");
}

// ---- actions (each: one Admin API call, then the page re-reads the server) ----------------------------------------------------
function reread(computerId?: string) {
  revalidatePath("/software-factory/computers");
  if (computerId) revalidatePath(`/software-factory/computers/${computerId}`);
}

export type EnvelopeInput = {
  roles: string[];
  capabilities?: string[];
  work_types?: string[];
  company_ids?: string[];
  max_concurrent_runs?: number;
  max_heavy?: number;
  preferred_work_class?: string;
};

function envelopeBody(e: EnvelopeInput): Record<string, unknown> {
  const out: Record<string, unknown> = { roles: e.roles };
  if (e.capabilities && e.capabilities.length) out.capabilities = e.capabilities;
  if (e.work_types && e.work_types.length) out.work_types = e.work_types;
  if (e.company_ids && e.company_ids.length) out.company_ids = e.company_ids;
  if (typeof e.max_concurrent_runs === "number") out.max_concurrent_runs = e.max_concurrent_runs;
  if (typeof e.max_heavy === "number") out.max_heavy = e.max_heavy;
  if (e.preferred_work_class) out.preferred_work_class = e.preferred_work_class;
  return out;
}

export async function addComputer(input: { display_name: string; envelope: EnvelopeInput; bind_s16a?: boolean; ttl_seconds?: number }): Promise<AdminResult<Receipt>> {
  const r = await callFactoryAdmin<Receipt>("add-computer", {
    display_name: input.display_name,
    envelope: envelopeBody(input.envelope),
    ...(input.bind_s16a ? { bind_s16a: true } : {}),
    ...(input.ttl_seconds ? { ttl_seconds: input.ttl_seconds } : {}),
  });
  reread();
  return r;
}

type Target = { computer_id: string; principal_id?: string };
const target = (t: Target) => ({ computer_id: t.computer_id, ...(t.principal_id ? { principal_id: t.principal_id } : {}) });

export async function issueCode(t: Target): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("issue-code", target(t)); reread(t.computer_id); return r; }
export async function revokeCode(t: Target): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("revoke-code", target(t)); reread(t.computer_id); return r; }
export async function revokeCredential(t: Target): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("revoke-credential", target(t)); reread(t.computer_id); return r; }
export async function requestRotation(t: Target): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("request-rotation", target(t)); reread(t.computer_id); return r; }
export async function repair(t: Target): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("repair", target(t)); reread(t.computer_id); return r; }
export async function createPrincipal(computerId: string): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("create-principal", { computer_id: computerId }); reread(computerId); return r; }
export async function setDrain(computerId: string, drain: boolean): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("drain", { computer_id: computerId, drain }); reread(computerId); return r; }
export async function archiveComputer(computerId: string): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("archive", { computer_id: computerId }); reread(computerId); return r; }
export async function restoreComputer(computerId: string): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("restore", { computer_id: computerId }); reread(computerId); return r; }
export async function adoptRelease(computerId: string, releaseId: string): Promise<AdminResult<Receipt>> { const r = await callFactoryAdmin<Receipt>("adopt-release", { computer_id: computerId, release_id: releaseId }); reread(computerId); return r; }

export async function amendEnvelope(computerId: string, expectedVersion: number, envelope: EnvelopeInput, reason: string): Promise<AdminResult<Receipt>> {
  const r = await callFactoryAdmin<Receipt>("amend-envelope", { computer_id: computerId, expected_version: expectedVersion, envelope: envelopeBody(envelope), ...(reason ? { reason } : {}) });
  reread(computerId);
  return r;
}

/** stricter-only (S-14): the Factory refuses any relaxation by name; the page offers only the stricter direction */
export async function makePolicyStricter(policyId: string, expectedVersion: number, changes: Record<string, boolean>): Promise<AdminResult<Receipt>> {
  const allowedKeys = ["require_distinct_run", "require_distinct_identity", "require_verifier_authority", "require_physical_separation", "restrict_bound_computer_authoring"];
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(changes)) if (allowedKeys.includes(k) && v === true) clean[k] = true;
  const r = await callFactoryAdmin<Receipt>("update-policy", { policy_id: policyId, expected_version: expectedVersion, changes: clean });
  reread();
  return r;
}

// ---- the installer as served (CR-004 Option A: public storage, no login) -------------------------------------------------------
export type ServedInstaller = {
  url: string;
  manifest_url: string;
  bytes: number;
  sha256: string;
  image_hash: string;
  image_hash_matches_release: boolean;
  authenticode_certificate_table: boolean;
};

const MAX_INSTALLER_BYTES = 256 * 1024 * 1024;

/** Fetch the installer exactly as the public storage serves it and measure it: its file sha256, its S-5 digest (the PE Authenticode
 * image hash) against the published release, and whether it carries an Authenticode certificate table. The release comes from the
 * Factory (a Factory admin's call), never from the page. */
export async function inspectServedInstaller(releaseId: string): Promise<AdminResult<ServedInstaller>> {
  const list = await listReleases();
  if (!list.ok) return list;
  const release = list.releases.items.find((r) => r.release_id === releaseId);
  if (!release) return { ok: false, refused: "not_found", message: "no such release" };
  const base = factoryReleasesUrl();
  if (!base) return { ok: false, refused: "misconfigured", message: "FACTORY_RELEASES_URL is not an allowed Factory storage address." };
  const url = `${base}/${encodeURIComponent(release.channel)}/${encodeURIComponent(release.version)}/${INSTALLER_FILE}`;
  const manifestUrl = `${base}/${encodeURIComponent(release.channel)}/${encodeURIComponent(release.version)}/${MANIFEST_FILE}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(120000) });
  } catch {
    return { ok: false, refused: "not_served", message: `The installer could not be fetched from ${url}.` };
  }
  if (res.status !== 200) return { ok: false, refused: "not_served", message: `The public storage answered HTTP ${res.status} for ${url}.` };
  const declared = Number(res.headers.get("content-length") || "0");
  if (declared > MAX_INSTALLER_BYTES) return { ok: false, refused: "too_large", message: "the served file is larger than an installer can be" };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_INSTALLER_BYTES) return { ok: false, refused: "too_large", message: "the served file is larger than an installer can be" };
  let imageHash: string;
  try {
    imageHash = authenticodeImageHash(buf);
  } catch (e) {
    return { ok: false, refused: "not_an_installer", message: `The served file is not a Windows executable (${(e as Error).message}).` };
  }
  return {
    ok: true,
    url,
    manifest_url: manifestUrl,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    image_hash: imageHash,
    image_hash_matches_release: imageHash === release.digest,
    authenticode_certificate_table: certificateTable(buf).size > 0,
  };
}

/** the public download addresses of a release (no request is made) */
export async function releaseDownloadUrls(channel: string, version: string): Promise<{ installer: string; manifest: string } | null> {
  const base = factoryReleasesUrl();
  if (!base) return null;
  const dir = `${base}/${encodeURIComponent(channel)}/${encodeURIComponent(version)}`;
  return { installer: `${dir}/${INSTALLER_FILE}`, manifest: `${dir}/${MANIFEST_FILE}` };
}
