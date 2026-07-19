import { createAdminClient } from "./supabase-admin";

export interface KeepAliveResult {
  success: boolean;
  message: string;
  timestamp: string;
}

// Lightweight DB touch so the Supabase free-tier project is not auto-paused.
// Tries to log into _keep_alive_log; falls back to a trivial read when the
// table does not exist.
export async function runKeepAlivePing(source: string): Promise<KeepAliveResult> {
  const timestamp = new Date().toISOString();

  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("_keep_alive_log")
      .insert({ pinged_at: timestamp, source })
      .select()
      .single();

    if (error) {
      // 42P01 = table does not exist — any query still keeps the DB awake.
      const { error: readError } = await supabase
        .from("students")
        .select("id")
        .limit(1);

      if (readError) throw readError;

      return {
        success: true,
        message: "Keep-alive ping executed (fallback read)",
        timestamp,
      };
    }

    return {
      success: true,
      message: "Keep-alive ping logged successfully",
      timestamp,
    };
  } catch (error) {
    console.error("Keep-alive error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp,
    };
  }
}
