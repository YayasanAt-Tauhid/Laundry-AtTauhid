// Server-side environment access.
//
// On Cloudflare Workers, `process.env` is populated from wrangler `vars` and
// secrets (nodejs_compat + compatibility_date >= 2025-04-01). Locally,
// `vite dev` runs the server inside workerd and reads `.dev.vars`.
//
// Secrets are set with: wrangler secret put <NAME>

export interface ServerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MIDTRANS_SERVER_KEY: string;
  MIDTRANS_CLIENT_KEY: string;
  MIDTRANS_IS_PRODUCTION: boolean;
}

export function getServerEnv(): ServerEnv {
  const env = process.env;

  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(`Environment variable ${name} is not configured`);
    }
    return value;
  };

  return {
    SUPABASE_URL: required("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
    MIDTRANS_SERVER_KEY: required("MIDTRANS_SERVER_KEY"),
    MIDTRANS_CLIENT_KEY: env.MIDTRANS_CLIENT_KEY ?? "",
    MIDTRANS_IS_PRODUCTION: env.MIDTRANS_IS_PRODUCTION === "true",
  };
}
