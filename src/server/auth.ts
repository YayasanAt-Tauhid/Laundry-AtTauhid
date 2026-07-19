import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthResult {
  userId: string | null;
}

// Validates the Supabase access token from the Authorization header.
// Returns { userId: null } when the header is missing or the token invalid —
// callers decide whether that is a 401 or an optional check.
export async function getAuthUser(
  supabase: SupabaseClient,
  request: Request,
): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null };
  }

  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return { userId: null };
  }

  return { userId: data.claims.sub };
}

export async function getUserRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.role ?? null;
}
