// Keep-alive endpoint — pings Supabase so the free-tier DB is not auto-paused.
// Also runs automatically via the Cron Trigger in wrangler.jsonc (src/server.ts).
import { createFileRoute } from "@tanstack/react-router";
import { runKeepAlivePing } from "@/server/keep-alive";
import { json } from "@/server/http";

export const Route = createFileRoute("/api/keep-alive")({
  server: {
    handlers: {
      GET: async () => {
        const result = await runKeepAlivePing("http");
        return json(result, result.success ? 200 : 500);
      },
    },
  },
});
