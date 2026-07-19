import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "./env";

// Service-role client. Create per request — never cache across requests on
// Workers. Session persistence is disabled (no localStorage on the server).
export function createAdminClient(): SupabaseClient {
  const env = getServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
