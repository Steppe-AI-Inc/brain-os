"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getMcpConnectors() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_connectors")
    .select("id, name, endpoint_url, transport, last_checked_at, last_status, last_tool_count, enabled, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMcpConnector(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const endpointUrl = String(formData.get("endpoint_url") || "").trim();
  const transportRaw = String(formData.get("transport") || "http");
  const transport: "http" | "sse" = transportRaw === "sse" ? "sse" : "http";
  const token = String(formData.get("token") || "").trim();
  if (!name) return "Name is required.";
  if (!endpointUrl) return "Endpoint URL is required.";
  try {
    new URL(endpointUrl);
  } catch {
    return "Endpoint URL must be a valid URL.";
  }

  const supabase = await createClient();

  let vaultSecretId: string | null = null;
  if (token) {
    const { data, error } = await supabase.rpc("create_mcp_connector_secret", {
      p_name: `mcp_connector_${name}_${Date.now()}`,
      p_secret: token,
    });
    if (error) return `Could not store token: ${error.message}`;
    vaultSecretId = data;
  }

  const { error } = await supabase.from("mcp_connectors").insert({
    name,
    endpoint_url: endpointUrl,
    transport,
    vault_secret_id: vaultSecretId,
  });
  if (error) return error.message;

  revalidatePath("/settings");
  return null;
}

export async function deleteMcpConnector(id: string) {
  const supabase = await createClient();
  const { data: connector } = await supabase
    .from("mcp_connectors")
    .select("vault_secret_id")
    .eq("id", id)
    .single();

  // Checks affected row count, not just `error` — mcp_connectors_founder_only RLS means
  // a non-founder caller's delete silently matches 0 rows rather than erroring. Same
  // defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
  const { data: deleted, error } = await supabase.from("mcp_connectors").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!deleted || deleted.length === 0) return "Nothing was deleted — this connector may no longer exist or you may not have access to it.";

  if (connector?.vault_secret_id) {
    try {
      await supabase.rpc("delete_mcp_connector_secret", { p_secret_id: connector.vault_secret_id });
    } catch {
      // best-effort cleanup — the connector row is already gone either way
    }
  }

  revalidatePath("/settings");
  return null;
}

type JsonRpcResponse = {
  error?: { message?: string };
  result?: { tools?: unknown[] } & Record<string, unknown>;
} | null;
type McpResponse = { json: JsonRpcResponse; sessionId: string | undefined };

/**
 * One-shot MCP JSON-RPC request over Streamable HTTP. Handles both a plain JSON body
 * and an SSE-framed one (`text/event-stream`, one `data:` line). This only covers the
 * request/response shape needed to prove a connector is reachable and list its tools
 * (initialize + tools/list) — persistent server-initiated SSE push and actually
 * invoking a tool mid-chat are out of scope here (see the settings plan).
 */
async function mcpFetch(
  url: string,
  token: string | null,
  body: unknown,
  sessionId?: string
): Promise<McpResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const newSessionId = res.headers.get("mcp-session-id") ?? sessionId;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 202) return { json: null, sessionId: newSessionId };

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!text) return { json: null, sessionId: newSessionId };

  if (contentType.includes("text/event-stream")) {
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error("No data in SSE response");
    return { json: JSON.parse(dataLine.slice(5).trim()), sessionId: newSessionId };
  }
  return { json: JSON.parse(text), sessionId: newSessionId };
}

/** Real MCP handshake (initialize + tools/list) against the connector's endpoint. */
export async function testMcpConnector(id: string) {
  const supabase = await createClient();
  const { data: connector, error: fetchError } = await supabase
    .from("mcp_connectors")
    .select("id, endpoint_url")
    .eq("id", id)
    .single();
  if (fetchError || !connector) return "Connector not found.";

  const { data: token } = await supabase.rpc("get_mcp_connector_token", { p_connector_id: id });

  try {
    const init = await mcpFetch(connector.endpoint_url, token ?? null, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "sem-brain", version: "1.0.0" },
      },
    });
    if (init.json?.error) throw new Error(init.json.error.message || "initialize failed");

    await mcpFetch(
      connector.endpoint_url,
      token ?? null,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      init.sessionId
    ).catch(() => {});

    const list = await mcpFetch(
      connector.endpoint_url,
      token ?? null,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      init.sessionId
    );
    if (list.json?.error) throw new Error(list.json.error.message || "tools/list failed");

    const toolCount = Array.isArray(list.json?.result?.tools) ? list.json.result.tools.length : 0;

    await supabase
      .from("mcp_connectors")
      .update({ last_checked_at: new Date().toISOString(), last_status: "ok", last_tool_count: toolCount })
      .eq("id", id);

    revalidatePath("/settings");
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("mcp_connectors")
      .update({
        last_checked_at: new Date().toISOString(),
        last_status: `error: ${message.slice(0, 200)}`,
        last_tool_count: null,
      })
      .eq("id", id);
    revalidatePath("/settings");
    return message;
  }
}
