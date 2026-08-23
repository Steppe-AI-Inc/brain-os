import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Browser client — only for Client Components that genuinely need interactive/realtime
// state (chat streaming, mindmap node clicks). Prefer the server client in
// lib/supabase/server.ts for anything that can be a Server Component instead.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
