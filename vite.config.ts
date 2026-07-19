import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import path from "path";

// TanStack Start + Cloudflare Workers.
//
// SPA mode is enabled on purpose: the app is fully client-rendered (Supabase
// auth lives in localStorage), and the prerendered shell is served as a static
// asset by Cloudflare. On the Workers FREE plan static asset requests are
// unlimited and do not count against the 100k requests/day quota — only
// /api/* calls invoke the Worker.
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          // Emitted as /index.html so Cloudflare's
          // not_found_handling: "single-page-application" can serve it.
          outputPath: "/index",
          crawlLinks: false,
        },
      },
    }),
    viteReact(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
