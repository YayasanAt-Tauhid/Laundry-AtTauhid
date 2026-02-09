import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy Midtrans API requests to avoid CORS issues in development
      '/midtrans-api': {
        target: 'https://app.sandbox.midtrans.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/midtrans-api/, ''),
        secure: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Fallback for env vars that may not load in remix projects
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || "https://ktdqsyfqzbsnbsxumwbm.supabase.co"),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHFzeWZxemJzbmJzeHVtd2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1OTI0NzEsImV4cCI6MjA4NjE2ODQ3MX0.TVdbTfsuQRaj7yI57vAMMtnuKtAyacRzVbvCUT1MVAY"),
    'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(process.env.VITE_SUPABASE_PROJECT_ID || "ktdqsyfqzbsnbsxumwbm"),
  },
}));
