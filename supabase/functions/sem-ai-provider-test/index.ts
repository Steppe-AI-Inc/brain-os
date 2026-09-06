import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createProviderProbe } from '../_shared/provider-probe.ts';

// Caller JWT, not service-role; verify_jwt must remain enabled on deployment.
Deno.serve(createProviderProbe({
  secret: (name) => Deno.env.get(name),
  client: (Authorization) => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization } }, auth: { persistSession: false },
  }),
}));
