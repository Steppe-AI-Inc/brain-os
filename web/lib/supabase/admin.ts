import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service-role client — bypasses RLS entirely. Server-only, never import from a Client
// Component. Used exclusively for the handful of operations RLS can't express, like
// auth.admin.inviteUserByEmail. Every Server Action that uses this must do its own
// founder/admin check first — this client has no session, so it enforces nothing itself.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY missing at runtime (typeof=${typeof key}, len=${key ? String(key).length : "n/a"})`);
  }
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
