import { createClient } from "@/lib/supabase/server";
import { factoryAdminApiUrl } from "./config";

// THE ONLY WAY BRAIN OS TALKS TO THE FACTORY (WO-8; S-8). Server-side only (imported by lib/data/factory-computers.ts). Every call
// carries the signed-in user's OWN Brain OS token; the Factory Admin API re-derives the live role from it and checks
// factory.tenant_admins on that call. Nothing here decides authority: hiding a button is never the control, and this module never
// holds a service key. The session is verified with Supabase Auth (getUser) before its token is forwarded anywhere.

export type AdminRefusal = { ok: false; refused: string; message?: string; http?: number; [key: string]: unknown };
export type AdminResult<T> = ({ ok: true; http?: number } & T) | AdminRefusal;

const TIMEOUT_MS = 20000;

export async function callFactoryAdmin<T>(op: string, body: Record<string, unknown> = {}): Promise<AdminResult<T>> {
  if (!/^[a-z-]{3,40}$/.test(op)) return { ok: false, refused: "bad_request", message: "unknown Factory action" };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { ok: false, refused: "not_authenticated", message: "Sign in to Brain OS first." };
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, refused: "not_authenticated", message: "Sign in to Brain OS first." };
  const base = factoryAdminApiUrl();
  if (!base) return { ok: false, refused: "misconfigured", message: "FACTORY_ADMIN_API_URL is not an allowed Factory endpoint." };

  let res: Response;
  try {
    res = await fetch(`${base}/v1/admin/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // a timeout or a dropped connection: the action may or may not have committed
    return { ok: false, refused: "outcome_unknown", message: "The Factory did not answer. The outcome is unknown - reload before retrying." };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, refused: "outcome_unknown", http: res.status, message: `The Factory answered HTTP ${res.status} without a result. Reload before retrying.` };
  }
  return { ...(parsed as Record<string, unknown>), http: res.status } as AdminResult<T>;
}
