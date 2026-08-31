"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Software Factory Phase 6 — real, governed console actions for the plugin/skill
// registry. Split from the CLI mechanism (scripts/factory-runner/plugin-attach.mjs) by
// a genuine architectural constraint, not convenience: this file runs as a Vercel
// server action with no local filesystem access, so only pure-DB state transitions
// (enable/disable/attach/detach — the file's content and hash were already computed
// and stored at discover/apply-update time) are implemented directly here. Anything
// that needs to read a real file (sandbox-test, review, apply-update, rollback) writes
// a plugin_operation_requests row instead — the always-on local Runner
// (scripts/factory-runner/poll-plugin-operations.mjs) picks it up and executes it via
// the exact same plugin-attach.mjs functions already proven live this session. Neither
// path is cosmetic: every action here either mutates real canonical state immediately
// or queues real work for a process that will actually perform it.

async function resyncAgentProvenance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string
) {
  const { data: rows, error } = await supabase
    .from("agent_plugin_attachments")
    .select(
      "plugin_components(slug, definition_path, definition_hash, enabled, install_status, plugin_sources(github_owner, github_repo, pinned_commit_sha))"
    )
    .eq("agent_id", agentId)
    .is("detached_at", null);
  if (error) throw error;

  type Row = {
    plugin_components: {
      slug: string;
      definition_path: string | null;
      definition_hash: string | null;
      enabled: boolean;
      install_status: string;
      plugin_sources: { github_owner: string; github_repo: string; pinned_commit_sha: string | null } | null;
    } | null;
  };

  const externalCapabilities = ((rows ?? []) as unknown as Row[])
    .map((r) => r.plugin_components)
    .filter(
      (pc): pc is NonNullable<Row["plugin_components"]> =>
        !!pc && pc.enabled === true && ["enabled", "update_available"].includes(pc.install_status)
    )
    .map((pc) => ({
      skill: pc.slug,
      origin: pc.plugin_sources ? `${pc.plugin_sources.github_owner}/${pc.plugin_sources.github_repo}` : "unknown",
      pinned_ref: pc.plugin_sources?.pinned_commit_sha ?? null,
      definition_path: pc.definition_path,
      definition_hash: pc.definition_hash,
    }))
    .sort((a, b) => a.skill.localeCompare(b.skill));

  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("provenance")
    .eq("id", agentId)
    .single();
  if (agentError) throw agentError;

  const baseProvenance = (agentRow?.provenance as Record<string, unknown>) ?? {};
  const provenance = { ...baseProvenance, external_capabilities: externalCapabilities };

  const { error: updateError } = await supabase
    .from("agents")
    .update({ provenance, updated_at: new Date().toISOString() })
    .eq("id", agentId);
  if (updateError) throw updateError;

  return externalCapabilities;
}

export async function enablePluginComponent(componentId: string) {
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("plugin_components")
    .select("install_status")
    .eq("id", componentId)
    .single();
  if (readError) throw readError;
  if (!["installed", "enabled", "disabled"].includes(current.install_status)) {
    throw new Error(
      `cannot enable from install_status=${current.install_status} — must be 'installed' or 'disabled' first`
    );
  }
  const { error } = await supabase
    .from("plugin_components")
    .update({ enabled: true, install_status: "enabled", updated_at: new Date().toISOString() })
    .eq("id", componentId);
  if (error) throw error;

  const { data: attachments } = await supabase
    .from("agent_plugin_attachments")
    .select("agent_id")
    .eq("plugin_component_id", componentId)
    .is("detached_at", null);
  for (const a of attachments ?? []) await resyncAgentProvenance(supabase, a.agent_id);

  revalidatePath("/software-factory/plugins");
  revalidatePath(`/software-factory/plugins/${componentId}`);
}

export async function disablePluginComponent(componentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("plugin_components")
    .update({ enabled: false, install_status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", componentId);
  if (error) throw error;

  const { data: attachments } = await supabase
    .from("agent_plugin_attachments")
    .select("agent_id")
    .eq("plugin_component_id", componentId)
    .is("detached_at", null);
  for (const a of attachments ?? []) await resyncAgentProvenance(supabase, a.agent_id);

  revalidatePath("/software-factory/plugins");
  revalidatePath(`/software-factory/plugins/${componentId}`);
}

export async function attachPluginComponentToAgent(agentId: string, componentId: string) {
  const supabase = await createClient();
  const { data: component, error: readError } = await supabase
    .from("plugin_components")
    .select("install_status, enabled")
    .eq("id", componentId)
    .single();
  if (readError) throw readError;
  if (!component.enabled || component.install_status !== "enabled") {
    throw new Error(
      `component is not attachable (install_status=${component.install_status}, enabled=${component.enabled}) — must be fully enabled first`
    );
  }
  const { error } = await supabase
    .from("agent_plugin_attachments")
    .upsert({ agent_id: agentId, plugin_component_id: componentId, detached_at: null, attached_at: new Date().toISOString() }, { onConflict: "agent_id,plugin_component_id" });
  if (error) throw error;

  await resyncAgentProvenance(supabase, agentId);
  revalidatePath("/software-factory/plugins");
  revalidatePath(`/software-factory/plugins/${componentId}`);
}

export async function detachPluginComponentFromAgent(agentId: string, componentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_plugin_attachments")
    .update({ detached_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .eq("plugin_component_id", componentId)
    .is("detached_at", null);
  if (error) throw error;

  await resyncAgentProvenance(supabase, agentId);
  revalidatePath("/software-factory/plugins");
  revalidatePath(`/software-factory/plugins/${componentId}`);
}

// Queued actions — need real local filesystem access, executed by
// scripts/factory-runner/poll-plugin-operations.mjs on the always-on Runner. These
// INSERT a real plugin_operation_requests row (RLS founder/admin-only, already proven —
// qa/scenarios-runner/factory_plugin_lifecycle_security.sql) — never a cosmetic no-op.
async function queueOperation(
  componentId: string,
  agentId: string | null,
  operation: "sandbox_test" | "review" | "apply_update" | "rollback",
  params: Record<string, unknown>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const { data, error } = await supabase
    .from("plugin_operation_requests")
    .insert({
      plugin_component_id: componentId,
      agent_id: agentId,
      operation,
      params,
      requested_by_profile_id: profile?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath(`/software-factory/plugins/${componentId}`);
  return data.id as string;
}

export async function requestSandboxTest(componentId: string) {
  return queueOperation(componentId, null, "sandbox_test", {});
}

export async function requestReview(
  componentId: string,
  licensePassed: boolean,
  licenseNotes: string,
  securityPassed: boolean,
  securityNotes: string
) {
  return queueOperation(componentId, null, "review", { licensePassed, licenseNotes, securityPassed, securityNotes });
}

export async function requestApplyUpdate(
  componentId: string,
  newDefinitionPath: string,
  newPinnedCommitSha: string,
  newInstalledVersion: string | null
) {
  return queueOperation(componentId, null, "apply_update", { newDefinitionPath, newPinnedCommitSha, newInstalledVersion });
}

export async function requestRollback(componentId: string, targetVersionId: string) {
  return queueOperation(componentId, null, "rollback", { targetVersionId });
}

// Marks a component update_available and records the real latest upstream SHA on its
// source row — the caller must supply a SHA it actually fetched via `gh api` (this
// function does not itself call GitHub; the console page does that server-side before
// offering this action, so a founder is never asked to hand-type a commit SHA).
export async function detectPluginUpdate(componentId: string, latestUpstreamSha: string) {
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("plugin_components")
    .select("install_status, source_id")
    .eq("id", componentId)
    .single();
  if (readError) throw readError;
  if (!["installed", "enabled"].includes(current.install_status)) {
    throw new Error(`cannot flag an update from install_status=${current.install_status}`);
  }
  const { error } = await supabase
    .from("plugin_components")
    .update({ install_status: "update_available", updated_at: new Date().toISOString() })
    .eq("id", componentId);
  if (error) throw error;

  const { error: srcError } = await supabase
    .from("plugin_sources")
    .update({ latest_upstream_sha: latestUpstreamSha, update_available: true, last_checked_at: new Date().toISOString() })
    .eq("id", current.source_id);
  if (srcError) throw srcError;

  revalidatePath("/software-factory/plugins");
  revalidatePath(`/software-factory/plugins/${componentId}`);
}

// ---------------------------------------------------------------------------------
// Read functions for the component detail page and worker registry.
// ---------------------------------------------------------------------------------

export type PluginComponentDetail = {
  id: string;
  slug: string;
  displayName: string | null;
  componentType: string;
  manifest: Record<string, unknown>;
  installStatus: string;
  enabled: boolean;
  installedVersion: string | null;
  definitionPath: string | null;
  definitionHash: string | null;
  permissionProfile: string[];
  licenseReviewStatus: string;
  securityReviewStatus: string;
  securityReviewNotes: string | null;
  source: {
    githubOwner: string;
    githubRepo: string;
    repositoryUrl: string;
    pinnedCommitSha: string | null;
    latestUpstreamSha: string | null;
    updateAvailable: boolean;
    license: string | null;
    trustStatus: string;
  } | null;
  attachedAgents: { agentId: string; name: string }[];
  versions: {
    id: string;
    pinnedCommitSha: string | null;
    definitionPath: string | null;
    definitionHash: string | null;
    installedVersion: string | null;
    installStatus: string | null;
    recordedReason: string;
    recordedAt: string;
  }[];
  operationRequests: {
    id: string;
    operation: string;
    status: string;
    error: string | null;
    requestedAt: string;
    completedAt: string | null;
  }[];
  recentRuntimeUse: { agentRunId: string; providerRunId: string | null; startedAt: string; status: string }[];
};

export async function getPluginComponentDetail(componentId: string): Promise<PluginComponentDetail | null> {
  const supabase = await createClient();
  const { data: component, error } = await supabase
    .from("plugin_components")
    .select(
      "id, slug, display_name, component_type, manifest, install_status, enabled, installed_version, definition_path, definition_hash, permission_profile, license_review_status, security_review_status, security_review_notes, source_id, plugin_sources(github_owner, github_repo, repository_url, pinned_commit_sha, latest_upstream_sha, update_available, license, trust_status)"
    )
    .eq("id", componentId)
    .maybeSingle();
  if (error) throw error;
  if (!component) return null;

  const [{ data: attachments }, { data: versions }, { data: requests }, { data: runs }] = await Promise.all([
    supabase
      .from("agent_plugin_attachments")
      .select("agent_id, agents(name)")
      .eq("plugin_component_id", componentId)
      .is("detached_at", null),
    supabase
      .from("plugin_component_versions")
      .select("id, pinned_commit_sha, definition_path, definition_hash, installed_version, install_status, recorded_reason, recorded_at")
      .eq("plugin_component_id", componentId)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("plugin_operation_requests")
      .select("id, operation, status, error, requested_at, completed_at")
      .eq("plugin_component_id", componentId)
      .order("requested_at", { ascending: false })
      .limit(20),
    component.definition_hash
      ? supabase
          .from("agent_runs")
          .select("id, provider_run_id, started_at, status, attached_skills")
          .not("attached_skills", "eq", "[]")
          .order("started_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const source = component.plugin_sources as unknown as {
    github_owner: string;
    github_repo: string;
    repository_url: string;
    pinned_commit_sha: string | null;
    latest_upstream_sha: string | null;
    update_available: boolean;
    license: string | null;
    trust_status: string;
  } | null;

  const recentRuntimeUse = ((runs ?? []) as unknown as { id: string; provider_run_id: string | null; started_at: string; status: string; attached_skills: Array<{ definition_hash?: string }> }[])
    .filter((r) => r.attached_skills?.some((s) => s.definition_hash === component.definition_hash))
    .slice(0, 10)
    .map((r) => ({ agentRunId: r.id, providerRunId: r.provider_run_id, startedAt: r.started_at, status: r.status }));

  return {
    id: component.id,
    slug: component.slug,
    displayName: component.display_name,
    componentType: component.component_type,
    manifest: (component.manifest as Record<string, unknown>) ?? {},
    installStatus: component.install_status,
    enabled: component.enabled,
    installedVersion: component.installed_version,
    definitionPath: component.definition_path,
    definitionHash: component.definition_hash,
    permissionProfile: (component.permission_profile as string[]) ?? [],
    licenseReviewStatus: component.license_review_status,
    securityReviewStatus: component.security_review_status,
    securityReviewNotes: component.security_review_notes,
    source: source
      ? {
          githubOwner: source.github_owner,
          githubRepo: source.github_repo,
          repositoryUrl: source.repository_url,
          pinnedCommitSha: source.pinned_commit_sha,
          latestUpstreamSha: source.latest_upstream_sha,
          updateAvailable: source.update_available,
          license: source.license,
          trustStatus: source.trust_status,
        }
      : null,
    attachedAgents: ((attachments ?? []) as unknown as { agent_id: string; agents: { name: string } | null }[]).map((a) => ({
      agentId: a.agent_id,
      name: a.agents?.name ?? a.agent_id,
    })),
    versions: (versions ?? []).map((v) => ({
      id: v.id,
      pinnedCommitSha: v.pinned_commit_sha,
      definitionPath: v.definition_path,
      definitionHash: v.definition_hash,
      installedVersion: v.installed_version,
      installStatus: v.install_status,
      recordedReason: v.recorded_reason,
      recordedAt: v.recorded_at,
    })),
    operationRequests: (requests ?? []).map((r) => ({
      id: r.id,
      operation: r.operation,
      status: r.status,
      error: r.error,
      requestedAt: r.requested_at,
      completedAt: r.completed_at,
    })),
    recentRuntimeUse,
  };
}

export type WorkerSummary = {
  id: string;
  hostname: string;
  displayName: string | null;
  workerRole: string | null;
  osPlatform: string | null;
  nodeVersion: string | null;
  claudeCodeVersion: string | null;
  maxConcurrency: number | null;
  lastHeartbeatAt: string | null;
  liveStatus: string;
  installedComponents: { slug: string; installedVersion: string | null; configurationDrift: boolean }[];
};

export async function getWorkers(): Promise<WorkerSummary[]> {
  const supabase = await createClient();
  const { data: workers, error } = await supabase
    .from("workers_with_live_status")
    .select("id, hostname, display_name, worker_role, os_platform, node_version, claude_code_version, max_concurrency, last_heartbeat_at, live_status")
    .order("hostname", { ascending: true });
  if (error) throw error;

  const workerIds = (workers ?? []).map((w) => w.id);
  const { data: installs } = workerIds.length
    ? await supabase
        .from("worker_plugin_installs")
        .select("worker_id, installed_version, configuration_drift, plugin_components(slug)")
        .in("worker_id", workerIds)
    : { data: [] };

  const installsByWorker = new Map<string, { slug: string; installedVersion: string | null; configurationDrift: boolean }[]>();
  for (const row of (installs ?? []) as unknown as { worker_id: string; installed_version: string | null; configuration_drift: boolean; plugin_components: { slug: string } | null }[]) {
    const list = installsByWorker.get(row.worker_id) ?? [];
    list.push({ slug: row.plugin_components?.slug ?? "unknown", installedVersion: row.installed_version, configurationDrift: row.configuration_drift });
    installsByWorker.set(row.worker_id, list);
  }

  return (workers ?? []).map((w) => ({
    id: w.id,
    hostname: w.hostname,
    displayName: w.display_name,
    workerRole: w.worker_role,
    osPlatform: w.os_platform,
    nodeVersion: w.node_version,
    claudeCodeVersion: w.claude_code_version,
    maxConcurrency: w.max_concurrency,
    lastHeartbeatAt: w.last_heartbeat_at,
    liveStatus: w.live_status ?? "UNKNOWN",
    installedComponents: installsByWorker.get(w.id) ?? [],
  }));
}
