// Midtrans Config API — returns client-side Midtrans configuration
// (client key + environment) so the frontend can load the correct Snap.js.
// Port of the former `midtrans-config` Supabase edge function.
import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/server/env";
import { errorResponse, json } from "@/server/http";

export const Route = createFileRoute("/api/midtrans-config")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { MIDTRANS_CLIENT_KEY, MIDTRANS_IS_PRODUCTION } =
            getServerEnv();

          if (!MIDTRANS_CLIENT_KEY) {
            console.error("MIDTRANS_CLIENT_KEY not configured");
            return errorResponse("Midtrans not configured", 500);
          }

          return json({
            clientKey: MIDTRANS_CLIENT_KEY,
            isProduction: MIDTRANS_IS_PRODUCTION,
            snapUrl: MIDTRANS_IS_PRODUCTION
              ? "https://app.midtrans.com/snap/snap.js"
              : "https://app.sandbox.midtrans.com/snap/snap.js",
          });
        } catch (error) {
          console.error("Error:", error);
          return errorResponse("Internal server error", 500);
        }
      },
    },
  },
});
