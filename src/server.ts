// Custom Cloudflare Workers entry.
//
// - fetch: delegates to the TanStack Start handler (SSR shell + /api/* server
//   routes). Page navigations normally never reach this — they are served as
//   static assets (see wrangler.jsonc), which keeps the free-plan request
//   quota for API calls only.
// - scheduled: Cron Trigger that pings Supabase so the free-tier database is
//   not auto-paused after 7 days of inactivity (replaces the old `keep-alive`
//   Supabase edge function + external cron).
import handler from "@tanstack/react-start/server-entry";
import { runKeepAlivePing } from "./server/keep-alive";

export default {
  fetch(request: Request) {
    return handler.fetch(request);
  },
  async scheduled(
    _controller: unknown,
    _env: unknown,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ) {
    ctx.waitUntil(runKeepAlivePing("cron"));
  },
};
